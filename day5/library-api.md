# Library API: Books Resource

Base URL: `https://api.example-library.com`

All request and response bodies use JSON (`Content-Type: application/json`).

## Book object

```json
{
  "id": 42,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "isbn": "978-0385474542"
}
```

## Endpoints

### 1. List all books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns an array of all books in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book

- **Method:** `GET`
- **Path:** `/books/:id` (example: `/books/42`)
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book. The server assigns the `id`.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958,
    "isbn": "978-0385474542"
  }
  ```

- **Success status:** `201 Created`

### 4. Update a book

- **Method:** `PUT`
- **Path:** `/books/:id` (example: `/books/42`)
- **Description:** Replaces the book with the given id with the data sent.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1959,
    "isbn": "978-0385474542"
  }
  ```

- **Success status:** `200 OK`

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/books/:id` (example: `/books/42`)
- **Description:** Removes the book with the given id.
- **Request body:** none
- **Success status:** `204 No Content`

### 6. List books by an author

- **Method:** `GET`
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns only the books whose author matches the `author` query parameter.
- **Request body:** none
- **Success status:** `200 OK`

## Error codes

- **`400 Bad Request`:** the request data is missing or invalid.
  - Example: `POST /books` with a body that has no `title`, or where `year` is `"soon"` instead of a number.
- **`404 Not Found`:** there is no book with the requested id.
  - Example: `GET /books/9999` when no book has id 9999 (also applies to `PUT` and `DELETE` on that id).
