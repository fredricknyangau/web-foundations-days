# TicketHub — System Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part design framework: requirements, estimates, API, data model, architecture, and trade-offs. It ends with a dedicated section on how the design prevents two people from buying the same seat.

---

## 1. Requirements

### 1.1 Functional requirements

| # | Requirement |
|---|---|
| F1 | Users can register, log in and log out. |
| F2 | Users can browse and search events by city, date, venue and artist. |
| F3 | Users can view an event's details and its seat map with live availability (available / held / sold). |
| F4 | Users can **hold** one or more seats (max 4 per user per event) for a limited time while they pay. |
| F5 | Users can pay for held seats (M-Pesa STK Push or card). |
| F6 | After successful payment, users receive tickets (QR code) by email/SMS and can see them under "My Tickets". |
| F7 | Holds that are not paid for within 10 minutes expire and the seats become available again. |
| F8 | For high-demand sales, users enter a **virtual waiting room** and are admitted to the seat map in batches. |
| F9 | Organisers/admins can create events and load seat layouts (out of scope for the detailed design). |

### 1.2 Non-functional requirements

| Quality | Requirement | Target |
|---|---|---|
| **Correctness** | A seat can never be sold to more than one person. A payment can never be charged twice for the same order. | **Zero** double-bookings; enforced by the database, not by application logic alone. |
| **Speed** | Browsing pages must feel instant; holding a seat must respond quickly even during a big sale. | Event/seat pages p95 < 300 ms; hold request p95 < 500 ms. |
| **Fairness** | During a big sale, everyone gets an equal chance. Bots and people with many tabs open should not gain an advantage. | Waiting room with randomised order for early arrivals, then first-in-first-out; max 4 tickets per account per event; rate limits per user and IP. |
| **Availability** | The site must stay up during a big sale; a failure should degrade gracefully (e.g., longer queue) rather than crash. | 99.9% uptime; browsing works even if payments are slow. |
| **Scalability** | Handle ~400× normal read traffic during a big sale. | Stateless API servers that scale horizontally; reads served from cache. |
| **Security** | Protect accounts and payments. | Hashed passwords (bcrypt), JWT auth, HTTPS only, payment callbacks verified. |
| **Data protection** | Personal data handled lawfully. | Comply with the Kenya Data Protection Act 2019; store only what is needed. |

---

## 2. Estimates

### 2.1 Given facts

- 2,000,000 registered users
- 50,000 visitors per normal day, 10 pages each
- 5,000 tickets sold per normal day
- Big sale: 200,000 people try to buy 20,000 seats in the first 10 minutes

### 2.2 Normal day

| Metric | Calculation | Result |
|---|---|---|
| Page views / day | 50,000 × 10 | **500,000** |
| Average page views / second | 500,000 ÷ 86,400 | **≈ 6 per second** |
| Peak page views / second (assume 3× average in the evening) | 6 × 3 | **≈ 18 per second** |
| API requests / second at peak (assume ~3 API calls per page) | 18 × 3 | **≈ 55 per second** |
| Tickets sold / second (average) | 5,000 ÷ 86,400 | **≈ 0.06 per second** (about 1 every 17 s) |

Normal traffic is small. A single application server and a single PostgreSQL database could handle it comfortably.

### 2.3 Big sale (popular concert)

Assumptions: the sale window is 10 minutes (600 seconds). While trying to buy, each person refreshes or loads about 20 pages/API calls, and about half of all traffic arrives in the first minute.

| Metric | Calculation | Result |
|---|---|---|
| Total requests in 10 minutes | 200,000 people × 20 requests | **4,000,000** |
| Average requests / second | 4,000,000 ÷ 600 | **≈ 6,700 per second** |
| First-minute spike | 2,000,000 ÷ 60 | **≈ 33,000 per second** |
| Seat-hold attempts (assume 3 tries per person) | 600,000 ÷ 600 | **≈ 1,000 writes per second** (much higher at second 0) |
| Successful purchases / second | 20,000 ÷ 600 | **≈ 33 per second** |
| Demand vs supply | 200,000 ÷ 20,000 | **10 buyers per seat** |

### 2.4 Comparison

| | Normal day (peak) | Big sale | Increase |
|---|---|---|---|
| Requests / second | ~55 | ~6,700 avg, ~33,000 spike | **~120× to ~600×** |
| Ticket purchases / second | ~0.06 | ~33 | **~550×** |
| Concurrent users fighting for the *same* rows | almost none | thousands on the same 20,000 seats | contention problem |

**Conclusion:** the big sale is not just "more traffic". It is a *contention* problem: thousands of people try to change the same few rows at the same moment. The design must:

1. Keep read traffic away from the main database (CDN + cache).
2. Limit how many people can attempt writes at once (waiting room).
3. Make each seat-hold write tiny and safe (one conditional `UPDATE`, explained in Section 7).

### 2.5 Storage (rough)

| Data | Calculation | Size |
|---|---|---|
| Users | 2,000,000 × ~1 KB | ~2 GB |
| Seats | 2,000 events/year × 5,000 seats × ~200 B | ~2 GB / year |
| Orders + tickets | ~1.8 M tickets/year × ~500 B | ~1 GB / year |

Everything fits easily in one PostgreSQL database. No sharding is needed.

---

## 3. API Design

REST over HTTPS, JSON bodies, JWT in the `Authorization` header for user-specific endpoints. All prices are in KES.

| # | Method & path | Purpose | Auth |
|---|---|---|---|
| 1 | `GET /api/events?city=&date=&q=&page=` | Browse/search events | No |
| 2 | `GET /api/events/{event_id}` | Event details | No |
| 3 | `GET /api/events/{event_id}/seats` | Seat map with status per seat | No (or queue token during big sale) |
| 4 | `POST /api/events/{event_id}/queue` | Join the waiting room; returns a queue position | Yes |
| 5 | `GET /api/events/{event_id}/queue/me` | Check queue position; returns an **access token** when admitted | Yes |
| 6 | `POST /api/events/{event_id}/holds` | Hold seats, which creates a `pending` order | Yes (+ access token) |
| 7 | `DELETE /api/orders/{order_id}/hold` | Release a hold early | Yes |
| 8 | `POST /api/orders/{order_id}/payments` | Start payment (e.g., M-Pesa STK Push) | Yes |
| 9 | `POST /api/webhooks/payments` | Payment provider callback confirming payment | Signature-verified |
| 10 | `GET /api/me/tickets` | List my tickets | Yes |
| 11 | `GET /api/me/orders/{order_id}` | Check an order's status | Yes |

### Example: hold seats

```http
POST /api/events/42/holds
Authorization: Bearer <jwt>
X-Queue-Token: <access token from waiting room>
Content-Type: application/json

{ "seat_ids": [1001, 1002] }
```

**201 Created**
```json
{
  "order_id": 98765,
  "status": "pending",
  "seats": [1001, 1002],
  "total_kes": 7000,
  "hold_expires_at": "2026-11-01T10:10:00Z"
}
```

**409 Conflict** (one or more seats were taken first)
```json
{ "error": "seats_unavailable", "unavailable_seat_ids": [1002] }
```

### Example: pay

```http
POST /api/orders/98765/payments
Authorization: Bearer <jwt>
Idempotency-Key: 3f9c2a1e-...
Content-Type: application/json

{ "method": "mpesa", "phone": "2547XXXXXXXX" }
```

**202 Accepted** means the payment was started, and the client polls `GET /api/me/orders/98765`. Sending the same `Idempotency-Key` twice returns the same result and never charges twice.

---

## 4. Data Model

PostgreSQL. Four core tables (`users`, `events`, `seats`, `orders`) plus `tickets`, which links orders to seats.

### 4.1 Entity relationships

```
users 1 ───< orders >─── 1 events
                │              │
                │ 1            │ 1
                ▼              ▼
             tickets >──── 1  seats
           (many)            (many per event)

- One user has many orders.
- One event has many seats and many orders.
- One order has many tickets (one per seat bought).
- One seat has at most ONE ticket (enforced by UNIQUE).
```

### 4.2 Tables

```sql
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    phone           TEXT UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    venue           TEXT NOT NULL,
    city            TEXT NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    sale_opens_at   TIMESTAMPTZ NOT NULL,
    max_per_user    INT NOT NULL DEFAULT 4 CHECK (max_per_user > 0),
    is_high_demand  BOOLEAN NOT NULL DEFAULT false   -- turns on the waiting room
);
CREATE INDEX idx_events_city_date ON events (city, starts_at);

CREATE TABLE orders (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users(id),
    event_id          BIGINT NOT NULL REFERENCES events(id),
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
    total_kes         NUMERIC(12,2) NOT NULL CHECK (total_kes >= 0),
    hold_expires_at   TIMESTAMPTZ NOT NULL,
    idempotency_key   TEXT UNIQUE,          -- stops double payment requests
    payment_reference TEXT UNIQUE,          -- e.g., M-Pesa receipt number; stops double-processing callbacks
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at           TIMESTAMPTZ
);
CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_orders_pending_expiry ON orders (hold_expires_at) WHERE status = 'pending';

CREATE TABLE seats (
    id               BIGSERIAL PRIMARY KEY,
    event_id         BIGINT NOT NULL REFERENCES events(id),
    section          TEXT NOT NULL,
    row_label        TEXT NOT NULL,
    seat_number      INT NOT NULL,
    price_kes        NUMERIC(12,2) NOT NULL CHECK (price_kes >= 0),
    status           TEXT NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available', 'held', 'sold')),
    held_by_order_id BIGINT REFERENCES orders(id),
    hold_expires_at  TIMESTAMPTZ,
    UNIQUE (event_id, section, row_label, seat_number),
    -- a held or sold seat must belong to an order; an available seat must not
    CHECK (
        (status = 'available' AND held_by_order_id IS NULL)
     OR (status IN ('held', 'sold') AND held_by_order_id IS NOT NULL)
    )
);
CREATE INDEX idx_seats_event_status ON seats (event_id, status);

CREATE TABLE tickets (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id),
    seat_id     BIGINT NOT NULL UNIQUE REFERENCES seats(id),  -- ONE ticket per seat, ever
    user_id     BIGINT NOT NULL REFERENCES users(id),
    qr_code     TEXT NOT NULL UNIQUE,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_user ON tickets (user_id);
```

---

## 5. Architecture

### 5.1 Diagram

```
                         ┌───────────────────────┐
     Users (web/mobile)  │          CDN          │  static files, images,
            │            │ (HTML/JS/CSS, posters)│  cached event pages
            ▼            └───────────┬───────────┘
   ┌─────────────────┐               │
   │  Load balancer  │◄──────────────┘
   │ (Nginx, HTTPS,  │
   │  rate limiting) │
   └────────┬────────┘
            │
   ┌────────▼────────┐        ┌──────────────────────┐
   │  Waiting room   │◄──────►│        Redis         │
   │  (queue tokens) │        │ - queue (sorted set) │
   └────────┬────────┘        │ - seat-map cache     │
            │ admitted users  │ - rate-limit counters│
            ▼                 └──────────▲───────────┘
   ┌───────────────────────────┐         │
   │ API servers (FastAPI) ×N  │─────────┘
   │ stateless, auto-scaled    │
   └───────┬─────────────┬─────┘
           │ writes      │ reads (search, my tickets)
           ▼             ▼
   ┌──────────────┐  ┌──────────────┐
   │ PostgreSQL   │─►│ PostgreSQL   │
   │ primary      │  │ read replica │
   │ (holds,      │  └──────────────┘
   │  orders,     │
   │  tickets)    │
   └──────┬───────┘
          │ jobs
   ┌──────▼──────────────┐      ┌──────────────────────┐
   │ Background workers  │─────►│ Payment provider     │
   │ - expire holds      │      │ (M-Pesa / card)      │
   │ - issue tickets     │◄─────│ → webhook callback   │
   │ - send email/SMS    │      └──────────────────────┘
   └─────────────────────┘
```

### 5.2 Components

| Component | What it does | Why it is needed |
|---|---|---|
| **CDN** | Serves static files (HTML, JS, CSS, images) and cached event pages from servers close to users. | Most of the 33,000 req/s spike is page loads. The CDN absorbs these so they never reach our servers. |
| **Load balancer (Nginx)** | Terminates HTTPS, spreads requests across API servers, applies per-IP rate limits. | Stops one machine or bot from flooding the system. |
| **Waiting room** | For `is_high_demand` events, users join a queue in Redis. Everyone who joins *before* the sale opens gets a **random** position (so refreshing early gives no advantage); later arrivals are first-in-first-out. Users are admitted in batches (e.g., 2,000 per minute) and receive a short-lived signed access token. | Turns a 200,000-person stampede into a controlled flow the database can handle. Also provides **fairness**. |
| **API servers (FastAPI)** | Business logic: search, seat map, holds, orders, payments. Stateless, so more copies can be added. | Scale horizontally for the sale; any server can handle any request. |
| **Redis** | Holds the queue, a cache of each event's seat map (refreshed every 1–2 s), and rate-limit counters. | Seat-map reads (the most common request during a sale) come from memory, not the database. |
| **PostgreSQL primary** | The **single source of truth** for seats, orders, and tickets. All holds and purchases are written here inside transactions. | Gives us transactions, row locks, and constraints, which are what make double-booking impossible. |
| **PostgreSQL read replica** | Copy of the primary for read-heavy queries (search, "My Tickets"). | Keeps read load off the primary during the sale. |
| **Background workers** | Expire unpaid holds every few seconds, process payment callbacks, generate QR tickets, send email/SMS. | Slow work happens outside the user's request so the API stays fast. |
| **Payment provider** | M-Pesa STK Push or card gateway. Calls our webhook when payment completes. | We never store card or PIN details ourselves. |

### 5.3 How it survives the big sale

1. **Before the sale:** the event page and seat-map layout are pre-cached on the CDN and in Redis. Extra API servers are started ahead of time.
2. **Opening second:** 200,000 users hit the site. The CDN serves the page; the waiting room gives each user a queue position. Only ~2,000 users per minute are admitted to choose seats.
3. **Seat selection:** admitted users read the seat map from Redis (cheap). When they click "Hold", one small transaction runs on PostgreSQL. With ~2,000 admitted users per minute making a few attempts each, the primary sees on the order of **100–300 hold writes per second**. That is well within what a single PostgreSQL server handles.
4. **If a seat is gone:** the user gets a fast `409` and picks another seat. The database decides; the cache is only a hint.
5. **Payment:** the provider calls our webhook. Workers mark the order paid and issue tickets. Unpaid holds expire after 10 minutes and the seats go back on sale, and the waiting room admits more users.
6. **If something is overloaded:** the waiting room simply admits people more slowly. The site gets slower to *enter*, but does not crash and does not oversell.

---

## 6. Trade-offs

| # | Decision | What we gain | What we give up |
|---|---|---|---|
| 1 | **Virtual waiting room** instead of letting everyone in at once | Stability and fairness; the database is never overwhelmed; bots gain little from speed. | Users must wait in a queue, sometimes for many minutes, and some will reach the front after the seats are sold out. |
| 2 | **PostgreSQL as the only authority on seat status** (not Redis locks) | Strong correctness through transactions and constraints. One place to look for the truth; crash-safe. | Lower maximum write throughput than an in-memory store. We compensate with the waiting room instead of a more complex distributed lock system. |
| 3 | **Cached seat map (1–2 s stale)** instead of a live view from the database | Thousands of seat-map reads per second served cheaply from Redis. | A user may click a seat that was taken a second ago and get a `409`. Acceptable, because the database still prevents the double sale. |
| 4 | **10-minute hold time** | Enough time to complete an M-Pesa STK Push even on a slow network. | Seats can be locked by people who never pay. A shorter hold frees seats faster but fails slow payers. |
| 5 | **Modular monolith + one database** instead of microservices | Simpler to build, test, and operate; transactions span orders, seats, and tickets easily. | Cannot scale individual parts independently. Fine at this size (a few GB of data, hundreds of writes/s). |

---

## 7. How Double-Booking Is Prevented

Double-booking happens when two people read "seat 1002 is available" at the same time, and both then write "seat 1002 is mine." TicketHub prevents this with **three layers**, all enforced by the database.

### Layer 1 — Atomic conditional update (holding a seat)

Instead of "read, then check in code, then write", the check and the write happen in **one SQL statement inside a transaction**:

```sql
BEGIN;

-- 1. Create the pending order
INSERT INTO orders (user_id, event_id, total_kes, hold_expires_at)
VALUES ($user_id, $event_id, $total, now() + interval '10 minutes')
RETURNING id;   -- -> $order_id

-- 2. Claim the seats ONLY if they are still free (or their hold has expired)
UPDATE seats
SET status = 'held',
    held_by_order_id = $order_id,
    hold_expires_at  = now() + interval '10 minutes'
WHERE event_id = $event_id
  AND id = ANY($seat_ids)
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < now()))
RETURNING id;

-- 3. If fewer rows came back than seats requested → someone else got one.
--    ROLLBACK (the order and any partial holds disappear) and return 409.
--    Otherwise:
COMMIT;
```

Why this is safe:

- When PostgreSQL runs the `UPDATE`, it **locks each matching row**. If two transactions try to update seat 1002 at the same moment, the second one **waits** for the first to finish.
- When the first commits, the second re-checks the `WHERE` condition against the **new** row. Seat 1002 is now `held`, so the condition fails, zero rows match for that seat, and the second user gets a `409`.
- Because it is all one transaction, a user asking for seats 1001 + 1002 gets **both or neither**. There are no half-holds.
- Seat IDs are processed in ascending order to avoid deadlocks when two users want overlapping groups of seats.

The **per-user limit** (max 4 tickets per event) is checked inside the same transaction by counting the user's held and sold seats for the event.

### Layer 2 — Constraints as a safety net

Even if application code had a bug, the database would refuse invalid data:

- `tickets.seat_id UNIQUE` means **a seat can have at most one ticket, ever.** A second ticket insert for the same seat fails.
- The `CHECK` on `seats` means a seat that is held or sold **must** point to an order.
- `orders.payment_reference UNIQUE` means the same M-Pesa receipt cannot mark two orders as paid, and a callback delivered twice is only processed once.
- `orders.idempotency_key UNIQUE` means a double-tap on "Pay" cannot start two charges.

### Layer 3 — Safe payment confirmation and hold expiry

When the payment webhook arrives, confirmation is also a single transaction:

```sql
BEGIN;
UPDATE orders
SET status = 'paid', payment_reference = $receipt, paid_at = now()
WHERE id = $order_id AND status = 'pending'
RETURNING id;           -- 0 rows → already processed or expired;
