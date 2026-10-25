# SnapShare Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of photos from the people they follow.

## 1. Assumptions

- **Registered users:** 10 million.
- **Daily active users (DAU):** 10% of registered users.
- **Uploads:** each active user uploads 1 photo per day.
- **Feed views:** each active user views 50 feed pages per day.
- **Photo size:** an average original photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- **Photos per feed page:** a feed page shows 10 thumbnails (my own assumption, used only for the image-traffic estimate).
- **Peak traffic:** 5× the daily average.
- **Units:** decimal units (1 MB = 1,000 KB, 1 TB = 1,000,000 MB), and 1 day = 86,400 seconds.
- **Storage:** the estimate counts one copy of each file. Copies kept by the storage service for safety are not counted.
- **Deletes:** photos are never deleted, so storage only grows.

### Daily active users

```
DAU = 10,000,000 × 10% = 1,000,000 active users per day
```

## 2. Estimates

### Uploads per second

```
Uploads per day = 1,000,000 users × 1 photo   = 1,000,000 uploads/day
Average         = 1,000,000 ÷ 86,400          ≈ 11.6 → about 12 uploads/second
Peak (5×)       = 11.6 × 5                    ≈ 58 uploads/second
```

### Feed views per second

```
Feed views per day = 1,000,000 users × 50 pages = 50,000,000 views/day
Average            = 50,000,000 ÷ 86,400        ≈ 579 → about 580 views/second
Peak (5×)          = 579 × 5                    ≈ 2,894 → about 2,900 views/second
```

Image requests (10 thumbnails per page): about **5,800/second** on average and **29,000/second** at peak. That load should land on the CDN, not on our servers.

### Storage per year

```
Per photo  = 2 MB original + 0.05 MB thumbnail = 2.05 MB
Per day    = 1,000,000 photos × 2.05 MB        = 2,050,000 MB = 2.05 TB/day
Per year   = 2.05 TB × 365                     ≈ 748 TB/year  (about 0.75 PB)
  originals:  2 MB × 1,000,000 × 365    = 730 TB
  thumbnails: 0.05 MB × 1,000,000 × 365 ≈ 18 TB
```

Photo metadata (owner, caption, file location, time) is tiny by comparison. At about 1 KB per photo it adds roughly 365 GB per year to the database (1 KB × 365 million photos), about 0.05% of the photo storage.

### Summary

| Measure | Average | Peak (5×) |
|---|---|---|
| Uploads | ~12 /s | ~58 /s |
| Feed views | ~580 /s | ~2,900 /s |
| Thumbnail requests | ~5,800 /s | ~29,000 /s |
| New photo storage | 2.05 TB/day | ~748 TB/year |

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 50 feed views for every upload (580 vs 12 per second), and with 10 thumbnails per page there are about 500 image reads for every photo written.

What that means for the design:

- **Cache aggressively.** Keep feeds and photo metadata in an in-memory cache so most reads never reach the database.
- **Serve images from a CDN.** Image files are the largest traffic by far, and they never change once uploaded, so they cache perfectly at the edge.
- **Scale reads separately from writes.** A single primary database handles about 12 writes per second easily. Extra read replicas absorb the read traffic.
- **Keep slow writes off the request path.** Thumbnail creation goes on a queue so the upload request stays fast.

## 4. Why photos don't go in the database

Photo files should **not** be stored inside the database:

- **Size:** about 748 TB per year would make the database enormous, slow to back up and expensive to copy to replicas.
- **Wasted resources:** the database's memory and cache would fill up with image bytes instead of the small, frequently used rows (users, follows, photo metadata).
- **No CDN:** files inside a database can't be served directly by a CDN, so every image view would hit our app servers and database.

Instead, store the files in **object storage** (for example Amazon S3 or Google Cloud Storage), which is cheap, grows without limit and works directly with a CDN. The database only stores **metadata** plus the file's key or URL (for example `photos/123/original.jpg`).

## 5. Architecture diagram

```
                              +-----------+
                              |   Users   |
                              | (app/web) |
                              +-----+-----+
                  image requests    |    API requests
              +---------------------+---------------------+
              |                                           |
              v                                           v
        +-----------+                            +-----------------+
        |    CDN    |                            |  Load Balancer  |
        +-----+-----+                            +--------+--------+
              | cache miss                                |
              |                          +----------------+----------------+
              |                          v                v                v
              |                    +-----------+    +-----------+    +-----------+
              |                    | App       |    | App       |    | App       |
              |                    | Server 1  |    | Server 2  |    | Server 3  |
              |                    +-----+-----+    +-----+-----+    +-----+-----+
              |                          +----------------+----------------+
              |                                           |
              |            +---------------+--------------+---------------+---------------+
              |            |               |                              |               |
              |            v               v                              v               v
              |      +-----------+   +-------------+  replication  +-------------+  +-----------+
              |      |   Cache   |   | Database    | ------------> | Database    |  |   Queue   |
              |      |  (Redis)  |   | (Primary)   |               | Read Replica|  +-----+-----+
              |      +-----------+   | writes      |               | reads       |        |
              |                      +------^------+               +-------------+        v
              |                             |                                       +-----------+
              |                             +---------- update thumbnail URL ------ |  Worker   |
              |                                                                     | (resizer) |
              v                                                                     +-----+-----+
     +-----------------------------------------------------------------+                 |
     |                     Object Storage (S3)                         | <-- read original,
     |           photos/{id}/original.jpg   photos/{id}/thumb.jpg      |     write thumbnail
     +-----------------------------------------------------------------+
              ^
              |  app servers upload the original file here
```

## 6. What each component does

- **CDN:** serves photos and thumbnails from servers close to each user, so tens of thousands of image requests per second never reach our own servers and images load quickly worldwide.
- **Load balancer:** spreads incoming API requests across the app servers and stops sending traffic to any server that fails, so no single server is a bottleneck or a single point of failure.
- **App servers:** run the stateless application code (log in, upload, build the feed), so we can handle more traffic simply by adding more identical servers behind the load balancer.
- **Cache (Redis):** keeps ready-built feeds and popular photo metadata in memory, so most of the ~2,900 peak feed views per second are answered in about a millisecond without querying the database.
- **Database (primary):** the single source of truth for users, follows and photo metadata, and it handles all writes so data stays consistent.
- **Read replica:** a continuously updated copy of the primary that handles read queries, so the heavy read traffic doesn't slow down writes on the primary.
- **Object storage:** stores the ~748 TB per year of photo files cheaply and durably, so the database only holds small metadata rows.
- **Queue:** holds "make a thumbnail for photo X" jobs, so the upload request can return immediately instead of waiting for image processing, and jobs aren't lost during a traffic spike.
- **Worker:** takes jobs from the queue and creates the 50 KB thumbnails in the background, and we can add more workers if the queue starts to back up.

## 7. Upload flow, step by step

1. **User picks a photo** in the app and taps "Share". The app sends the file and caption to SnapShare's API.
2. **Load balancer** receives the request and forwards it to one of the healthy app servers.
3. **App server checks the request:** is the user logged in, is the file an image, and is it under the size limit? If not, it returns `400 Bad Request`.
4. **App server saves the original file** to object storage at a new key such as `photos/123/original.jpg`.
5. **App server writes a metadata row** to the primary database: photo id, owner, caption, original file key, upload time, and `thumbnail_status = 'pending'`.
6. **App server puts a job on the queue:** "create a thumbnail for photo 123".
7. **App server replies to the user** with `201 Created`. The upload feels instant because it didn't wait for the thumbnail.
8. **Worker takes the job** from the queue and downloads `photos/123/original.jpg` from object storage.
9. **Worker resizes the image** into a ~50 KB thumbnail and saves it to object storage as `photos/123/thumb.jpg`.
10. **Worker updates the database row** with the thumbnail key and `thumbnail_status = 'ready'`, then marks the job as done. If it fails, the job goes back on the queue to be retried.
11. **Feeds are updated:** the new photo id is added to the cached feeds of the uploader's followers (or their cached feeds are cleared so they're rebuilt on the next view).
12. **Followers scroll their feed.** The app server returns the feed from the cache, and each thumbnail URL points at the CDN. On the first request the CDN fetches the thumbnail from object storage, and after that it serves the cached copy.

## 8. Trade-offs

### Trade-off 1: Asynchronous thumbnails (speed vs. immediacy)

- **Gain:** uploads return quickly, and a burst of uploads just makes the queue longer instead of overloading the app servers.
- **Cost:** for a few seconds after upload the thumbnail doesn't exist yet. The app has to handle a "processing" state (for example, show a placeholder or the original), and we have to run and monitor a queue and workers.

### Trade-off 2: Read replicas and caching (scale vs. fresh data)

- **Gain:** reads are spread across replicas and the cache, so the system handles thousands of feed views per second and the primary stays free for writes.
- **Cost:** **eventual consistency.** A replica can be a moment behind the primary, and a cached feed can be a few seconds old, so a follower might not see a new photo instantly. For a photo feed this is acceptable. For something like a payment balance it would not be.

### Trade-off 3: CDN caching (speed and cost vs. control)

- **Gain:** images load fast everywhere, and most image traffic never reaches our servers or object storage.
- **Cost:** when a user deletes a photo, copies can stay in CDN caches until they expire or we send an explicit purge request. We also pay the CDN provider for bandwidth.
