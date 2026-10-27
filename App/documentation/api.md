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
| 403 Forbidden             | Wrong role                                            |
| 404 Not Found             | Slot does not exist                                   |
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

- **Type:** GET, public.
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

### MH-03 — Receive confirmation

No API of its own. After a successful booking, `POST /api/v1/reservations` (MH-01) sends a confirmation email to the logged-in hiker's address, after the commit. The email contains the booking number, slot date and time, number of people and assigned tables.

- If sending succeeds, `confirmation_sent_at` is saved and the response returns `confirmationSent: true`.
- If sending fails, the booking stays valid and the response returns `confirmationSent: false`, so the frontend can tell the hiker the booking succeeded even though the email was not sent.

The email is sent through an internal `EmailSender` interface, so the external email provider can be chosen later without changing the API.

### MH-04 — Check availability

Public, no login. The user gives date, time and party size; the system finds the slot that covers that time and answers based on the free seats and the table layout. No alternative slots are suggested: the user can just check a different date or time.

#### `GET /api/v1/availability`

- **Type:** GET, public.
- **Parameters (query):** all required.
  - `date`: format `YYYY-MM-DD` (e.g. `2026-11-01`).
  - `time`: format `HH:MM`, hut local time (e.g. `12:30`).
  - `partySize`: integer, at least 1 (e.g. `6`).

  Example: `GET /api/v1/availability?date=2026-11-01&time=12:30&partySize=6`

- **Returns:** `200` whether or not there is room: "full" is not an error. The matching slot is the one with `start_at <= date + time < end_at`.

```json
{
  "date": "2026-11-01",
  "time": "12:30",
  "partySize": 6,
  "available": true,
  "slot": {
    "id": 7,
    "startAt": "2026-11-01T12:00:00+01:00",
    "endAt": "2026-11-01T13:00:00+01:00"
  },
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
  "date": "2026-11-01",
  "time": "12:30",
  "partySize": 6,
  "available": false,
  "reason": "NOT_ENOUGH_SEATS",
  "slot": {
    "id": 7,
    "startAt": "2026-11-01T12:00:00+01:00",
    "endAt": "2026-11-01T13:00:00+01:00"
  },
  "freeSeats": 4,
  "allocation": null
}
```

`reason` is one of:

- `NO_SLOT`: no slot covers that date and time (`slot` and `freeSeats` are `null`).
- `NOT_ENOUGH_SEATS`: the free seats of the slot, split over its tables, are not enough for the party.
- `BOOKING_CLOSED`: less than 2 hours left before the slot start, or the slot is in the past.

`allocation` is the "2 + 3 + 1" detail required by the story: how the party would be seated over the tables with free seats. When `available` is `true`, the frontend can pass `slot.id` and `partySize` to `POST /api/v1/reservations` (MH-01).

- **Errors:** `400 INVALID_INPUT` (`date`, `time` or `partySize` missing or invalid, `partySize` not an integer or less than 1).

It uses the same table-assignment function as `POST /api/v1/reservations`, reading free seats from the `slot_table_free` view. The check does not hold the seats: if someone books them in the meantime, MH-01 returns `409`.

---

## 3. API summary

| Story  | Method | Path                                             | Access    |
| ------ | ------ | ------------------------------------------------ | --------- |
| shared | POST   | `/api/v1/auth/register`                          | public    |
| shared | POST   | `/api/v1/auth/login`                             | public    |
| shared | POST   | `/api/v1/auth/logout`                            | logged in |
| shared | GET    | `/api/v1/auth/me`                                | logged in |
| MH-01  | GET    | `/api/v1/slots?date=`                            | public    |
| MH-01  | POST   | `/api/v1/reservations`                           | hiker     |
| MH-02  | POST   | `/api/v1/slots`                                  | staff     |
| MH-02  | GET    | `/api/v1/slots/:id`                              | staff     |
| MH-02  | PUT    | `/api/v1/slots/:id/tables`                       | staff     |
| MH-02  | DELETE | `/api/v1/slots/:id`                              | staff     |
| MH-03  | —      | none (email sent by `POST /api/v1/reservations`) | —         |
| MH-04  | GET    | `/api/v1/availability?date=&time=&partySize=`    | public    |
