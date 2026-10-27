# Mountain Hut — API documentation

## 1. API conventions

- `/api/v1` prefix, JSON bodies, ISO 8601 dates (e.g. `2026-11-01T12:00:00+01:00`).
- The API is versioned in the path (`/api/v1`, `/api/v2`, …). A breaking change requires a new version; the previous one stays available until the frontend has migrated. Backward-compatible changes stay in the current version.
- Session authentication with a cookie after login. Public APIs do not require it.
- "Staff" means role `employee` or `warden`.
- Every error has the format `{ "error": "CODE", "message": "human-readable text" }`.

| HTTP code                 | When it is used                                       |
| ------------------------- | ----------------------------------------------------- |
| 400 Bad Request           | Missing or invalid parameters                         |
| 401 Unauthorized          | Login required and the user is not logged in          |
| 403 Forbidden             | Wrong role, or resource owned by another user         |
| 404 Not Found             | Slot or booking does not exist                        |
| 409 Conflict              | Not enough seats or conflict with existing data       |
| 422 Unprocessable Entity  | Forbidden by a business rule (e.g. less than 2 hours) |
| 500 Internal Server Error | Unexpected server or database error                   |

### Authentication API (shared by all stories)

| API                          | Access    | Parameters                                                   | Returns                                                   | Errors                                         |
| ---------------------------- | --------- | ------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------- |
| `POST /api/v1/auth/register` | public    | body: `email`, `password`, `firstName`, `lastName`, `phone`? | `201` `{ id, email, firstName, lastName, role: "hiker" }` | `400 INVALID_INPUT`, `409 EMAIL_ALREADY_USED`  |
| `POST /api/v1/auth/login`    | public    | body: `email`, `password`                                    | `200` with the user, sets the cookie                      | `400 INVALID_INPUT`, `401 INVALID_CREDENTIALS` |
| `POST /api/v1/auth/logout`   | logged in | none                                                         | `204`                                                     | `401 NOT_AUTHENTICATED`                        |
| `GET /api/v1/auth/me`        | logged in | none                                                         | `200` `{ id, email, firstName, lastName, role }`          | `401 NOT_AUTHENTICATED`                        |

---

## 2. API by story

### MH-01 — Book a table

#### `GET /api/v1/slots`

- **Type:** GET, public (also used by MH-04).
- **Parameters (query):** `date` required, format `YYYY-MM-DD`.
- **Returns:** `200` with the slots of that day, ordered by time. Empty list if there are none.

```json
[
  {
    "id": 7,
    "startAt": "2026-11-01T12:00:00+01:00",
    "endAt": "2026-11-01T13:00:00+01:00",
    "totalSeats": 40,
    "freeSeats": 12,
    "bookable": true
  }
]
```

`bookable` is `false` when less than 2 hours are left before the start.

- **Errors:** `400 INVALID_DATE` if `date` is missing or invalid.

#### `POST /api/v1/reservations`

- **Type:** POST, logged-in `hiker` only.
- **Parameters (body):** `{ "slotId": 7, "partySize": 6 }`
- **Returns:** `201` with the booking and the assigned tables.

```json
{
  "id": 31,
  "slotId": 7,
  "startAt": "2026-11-01T12:00:00+01:00",
  "partySize": 6,
  "status": "confirmed",
  "tables": [
    { "tableNumber": 3, "seats": 4 },
    { "tableNumber": 5, "seats": 2 }
  ],
  "confirmationSent": true
}
```

- **Errors:**
  - `400 INVALID_INPUT`: `slotId` or `partySize` missing, `partySize` not an integer or less than 1.
  - `401 NOT_AUTHENTICATED`: user not logged in.
  - `403 FORBIDDEN`: user is not a `hiker`.
  - `404 SLOT_NOT_FOUND`: the slot does not exist.
  - `409 NOT_ENOUGH_SEATS`: not enough free seats.
  - `422 BOOKING_CLOSED`: less than 2 hours left, or the slot is in the past.

The seat check and the inserts into `reservation` and `reservation_seat` go in the same transaction, with `SELECT … FOR UPDATE` on the `slot_table` rows, so two concurrent bookings cannot take the same seats.

### MH-02 — Define slot capacity

#### `POST /api/v1/slots`

- **Type:** POST, staff only.
- **Parameters (body):** `startAt`, `endAt` and _exactly one_ of `tables` and `copyTablesFromSlotId`.

```json
{
  "startAt": "2026-11-01T12:00:00+01:00",
  "endAt": "2026-11-01T13:00:00+01:00",
  "tables": [
    { "tableNumber": 1, "seats": 4 },
    { "tableNumber": 2, "seats": 6 }
  ]
}
```

```json
{
  "startAt": "2026-11-01T13:00:00+01:00",
  "endAt": "2026-11-01T14:00:00+01:00",
  "copyTablesFromSlotId": 7
}
```

- **Returns:** `201` with `{ id, startAt, endAt, totalSeats, tables: [ { id, tableNumber, seats } ] }`.
- **Errors:**
  - `400 INVALID_INPUT`: missing or invalid dates, `endAt` not after `startAt`, `seats` less than 1, repeated `tableNumber`, empty list, or both (or neither) of `tables` and `copyTablesFromSlotId`.
  - `401 NOT_AUTHENTICATED`, `403 FORBIDDEN`.
  - `404 SLOT_NOT_FOUND`: the slot to copy from does not exist.

#### `GET /api/v1/slots/:id`

- **Type:** GET, staff only.
- **Parameters (path):** slot `id`.
- **Returns:** `200` with the slot and its tables, each with `seats` and `freeSeats`.
- **Errors:** `401`, `403`, `404 SLOT_NOT_FOUND`.

#### `PUT /api/v1/slots/:id/tables`

- **Type:** PUT, staff only. Replaces the whole table list.
- **Parameters:** `id` in the path; body `{ "tables": [ { "tableNumber": 1, "seats": 4 } ] }`.
- **Returns:** `200` with the updated slot.
- **Errors:** `400 INVALID_INPUT`, `401`, `403`, `404 SLOT_NOT_FOUND`, `409 SLOT_HAS_RESERVATIONS` if there are confirmed bookings (changing a slot with bookings is MH-19).

#### `DELETE /api/v1/slots/:id`

- **Type:** DELETE, staff only. To fix a slot created by mistake.
- **Parameters (path):** slot `id`.
- **Returns:** `204`. Its tables are deleted in cascade.
- **Errors:** `401`, `403`, `404 SLOT_NOT_FOUND`, `409 SLOT_HAS_RESERVATIONS` (closing a slot with bookings is MH-17).

Open question for the Product Owner: can two slots overlap in time? For now it is not blocked.

### MH-03 — Receive confirmation

The email has no API of its own: the server sends it inside `POST /api/v1/reservations`, after the commit. If sending succeeds, `confirmation_sent_at` is saved; if it fails, the booking stays valid and the response returns `confirmationSent: false`. The email contains the slot date and time, number of people, assigned tables and booking number.

#### `GET /api/v1/reservations`

- **Type:** GET, logged-in `hiker` only.
- **Parameters:** none (only the logged-in user's bookings).
- **Returns:** `200` with the list of bookings, soonest first, in the MH-01 format.
- **Errors:** `401 NOT_AUTHENTICATED`, `403 FORBIDDEN`.

#### `GET /api/v1/reservations/:id`

- **Type:** GET, owning `hiker`.
- **Parameters (path):** booking `id`.
- **Returns:** `200` with the details, including tables and `confirmationSentAt`.
- **Errors:** `401`, `403 FORBIDDEN` if it belongs to another user, `404 RESERVATION_NOT_FOUND`.

#### `POST /api/v1/reservations/:id/confirmation`

- **Type:** POST, owning `hiker`. Resends the email (optional).
- **Parameters (path):** booking `id`.
- **Returns:** `202` with `{ "confirmationSentAt": "…" }`.
- **Errors:** `401`, `403`, `404 RESERVATION_NOT_FOUND`, `409 RESERVATION_CANCELLED`, `502 EMAIL_SEND_FAILED`.

### MH-04 — Check availability

Public, no login. The slots of a day come from `GET /api/v1/slots` (MH-01). No alternative slots are suggested.

#### `GET /api/v1/slots/:id/availability`

- **Type:** GET, public.
- **Parameters:** slot `id` in the path; `partySize` required in the query (e.g. `?partySize=6`).
- **Returns:** `200` whether or not there is room: "full" is not an error.

```json
{
  "slotId": 7,
  "startAt": "2026-11-01T12:00:00+01:00",
  "partySize": 6,
  "available": true,
  "freeSeats": 6,
  "allocation": [
    { "tableNumber": 1, "seats": 2 },
    { "tableNumber": 4, "seats": 3 },
    { "tableNumber": 6, "seats": 1 }
  ]
}
```

```json
{
  "slotId": 7,
  "startAt": "2026-11-01T12:00:00+01:00",
  "partySize": 6,
  "available": false,
  "reason": "NOT_ENOUGH_SEATS",
  "freeSeats": 4,
  "allocation": null
}
```

`reason` is `NOT_ENOUGH_SEATS` or `BOOKING_CLOSED`. `allocation` is the "2 + 3 + 1" detail required by the story.

- **Errors:** `400 INVALID_INPUT` (`partySize` missing, not an integer or less than 1), `404 SLOT_NOT_FOUND`.

It uses the same table-assignment function as `POST /api/v1/reservations`, reading free seats from the `slot_table_free` view. The check does not hold the seats: if someone books them in the meantime, MH-01 returns `409`.

---

## 3. API summary

| Story  | Method | Path                                        | Access       |
| ------ | ------ | ------------------------------------------- | ------------ |
| shared | POST   | `/api/v1/auth/register`                     | public       |
| shared | POST   | `/api/v1/auth/login`                        | public       |
| shared | POST   | `/api/v1/auth/logout`                       | logged in    |
| shared | GET    | `/api/v1/auth/me`                           | logged in    |
| MH-01  | GET    | `/api/v1/slots?date=`                       | public       |
| MH-01  | POST   | `/api/v1/reservations`                      | hiker        |
| MH-02  | POST   | `/api/v1/slots`                             | staff        |
| MH-02  | GET    | `/api/v1/slots/:id`                         | staff        |
| MH-02  | PUT    | `/api/v1/slots/:id/tables`                  | staff        |
| MH-02  | DELETE | `/api/v1/slots/:id`                         | staff        |
| MH-03  | GET    | `/api/v1/reservations`                      | hiker        |
| MH-03  | GET    | `/api/v1/reservations/:id`                  | owning hiker |
| MH-03  | POST   | `/api/v1/reservations/:id/confirmation`     | owning hiker |
| MH-04  | GET    | `/api/v1/slots/:id/availability?partySize=` | public       |
