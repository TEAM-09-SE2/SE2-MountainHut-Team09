# Mountain Hut — API documentation

## Story-specific technical guides

- [MH-01 - Book a table](stories_detail/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](stories_detail/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](stories_detail/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](stories_detail/MH-04-check-availability.md)

## 1. API conventions

- `/api/v1` prefix, JSON bodies, ISO 8601 dates. Requests may use any offset (e.g. `2026-11-01T12:00:00+01:00`); responses are always in UTC (e.g. `2026-11-01T11:00:00.000Z`), and the frontend shows them in hut time (Europe/Rome).
- The API is versioned in the path (`/api/v1`, `/api/v2`, …). A breaking change requires a new version; the previous one stays available until the frontend has migrated. Backward-compatible changes stay in the current version.
- Session authentication with a cookie after login. Public APIs do not require it.
- "Staff" means role `employee` or `warden`.
- Every error has the format `{ "error": "CODE", "message": "human-readable text" }`.

| HTTP code                 | When it is used                                       |
| ------------------------- | ----------------------------------------------------- |
| 400 Bad Request           | Missing or invalid parameters                         |
| 401 Unauthorized          | Login required and the user is not logged in          |
| 403 Forbidden             | Wrong role, or the temporary password must be changed first |
| 404 Not Found             | Slot does not exist                                   |
| 409 Conflict              | Not enough seats or conflict with existing data       |
| 422 Unprocessable Entity  | Forbidden by a business rule (e.g. less than 2 hours) |
| 500 Internal Server Error | Unexpected server or database error                   |

### Authentication API (shared by all stories)

| API                          | Access    | Parameters                                                                                                    | Returns                                                                                                         | Errors                                         |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `POST /api/v1/auth/register` | public    | body: `email`, `password`, `firstName`, `lastName`, `phone`?, `emergencyContactName`?, `emergencyContactPhone`?, `notes`? | `201` `{ id, email, firstName, lastName, phone, emergencyContactName, emergencyContactPhone, notes, role: "hiker" }` | `400 INVALID_INPUT`, `409 EMAIL_ALREADY_USED`  |
| `POST /api/v1/auth/login`    | public    | body: `email`, `password`                                                                                     | `200` with the user, sets the cookie                                                                            | `400 INVALID_INPUT`, `401 INVALID_CREDENTIALS` |
| `POST /api/v1/auth/logout`   | logged in | none                                                                                                          | `204`                                                                                                           | `401 NOT_AUTHENTICATED`                        |
| `GET /api/v1/auth/me`        | logged in | none                                                                                                          | `200` `{ id, email, firstName, lastName, phone, emergencyContactName, emergencyContactPhone, notes, role, mustChangePassword }` | `401 NOT_AUTHENTICATED`                        |
| `PUT /api/v1/auth/password`  | logged in | body: `currentPassword`, `newPassword`                                                                        | `204`, sets `must_change_password` to `false`                                                                   | `400 INVALID_INPUT`, `401 NOT_AUTHENTICATED`, `401 INVALID_CREDENTIALS` |

Registration details:

- `phone`, `emergencyContactName`, `emergencyContactPhone` and `notes` are optional. A missing field, `null` or an empty string are all stored as NULL and returned as `null`.
- `emergencyContactName` and `emergencyContactPhone` go together: either both are given or neither is.
- `400 INVALID_INPUT` is also returned when an optional field is not a string, `emergencyContactName` is longer than 100 characters, `emergencyContactPhone` is not a valid phone number (same rule as `phone`, at most 10 characters), `notes` is longer than 1000 characters, or only one of the two emergency contact fields is given.
- Only hikers register through this API, so for staff accounts these fields are always `null`.
- Staff can read all these hiker fields; `password_hash` and `salt` are never returned by any API.

Adding optional fields is a backward-compatible change, so it stays in `/api/v1`.

Password rule (registration, temporary password and password change): at least 8 characters.

Password change and temporary passwords:

- The login response (the user object) and `GET /auth/me` include `mustChangePassword`. When it is `true` the frontend sends the user to the password change page.
- While `mustChangePassword` is `true`, every API that requires login answers `403 PASSWORD_CHANGE_REQUIRED`, except `GET /auth/me`, `POST /auth/logout` and `PUT /auth/password`.
- `PUT /auth/password` checks `currentPassword` against the stored hash (`401 INVALID_CREDENTIALS` if wrong). `newPassword` must follow the password rule and differ from `currentPassword` (`400 INVALID_INPUT` otherwise). A new salt is generated with the new hash. Any user can call it, not only employees.

### Staff management API (warden only)

Employees cannot register through `POST /auth/register`. Only the warden creates them, from the warden page.

| API                                | Access | Parameters                                                       | Returns                                                                                                   | Errors                                                                                    |
| ---------------------------------- | ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/v1/staff/employees`     | warden | body: `email`, `firstName`, `lastName`, `phone`?, `password`     | `201` `{ id, email, firstName, lastName, phone, role: "employee", mustChangePassword: true }`             | `400 INVALID_INPUT`, `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE`, `409 EMAIL_ALREADY_USED` |
| `GET /api/v1/staff/employees`      | warden | none                                                             | `200` `[ { id, email, firstName, lastName, phone, mustChangePassword, createdAt } ]`, ordered by last name, first name | `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE`                                             |

- Access is `warden` only: an `employee` gets `403 FORBIDDEN_ROLE`, even though both are "staff".
- `POST`: `password` is the temporary password. It follows the same password rule as registration, and the other fields use the same validation as `POST /auth/register`. The backend creates the `app_user` row with `role = 'employee'` and `must_change_password = true`, and stores only `password_hash` and `salt`, never the password itself. `emergencyContactName`, `emergencyContactPhone` and `notes` are not accepted and stay NULL.
- The warden gives the temporary password to the employee in person. The employee logs in with `POST /auth/login` and must then change it with `PUT /auth/password`.
- `GET`: lists only users with role `employee`. `mustChangePassword` tells the warden which employees have not logged in and changed their password yet.
- Employees cannot be deactivated or deleted.

---

## 2. API by story

### MH-01 — Book a table

#### `GET /api/v1/slots`

- **Type:** GET, public.
- **Parameters (query):** `date` required, format `YYYY-MM-DD`, a day in hut local time (Europe/Rome).
- **Returns:** `200` with the slots of that day, ordered by time. Empty list if there are none.

```json
[
  {
    "id": 7,
    "startAt": "2026-11-01T11:00:00.000Z",
    "endAt": "2026-11-01T12:00:00.000Z",
    "totalSeats": 40,
    "freeSeats": 12,
    "bookable": true
  }
]
```

`bookable` is `false` when less than 2 hours are left before the start, or the slot is in the past. It only looks at the time: a full slot can still be `bookable`, so check `freeSeats` too.

- **Errors:** `400 INVALID_DATE` if `date` is missing or invalid.

#### `POST /api/v1/reservations`

- **Type:** POST, logged-in `hiker` only.
- **Parameters (body):** `{ "slotId": 7, "partySize": 6 }`
- **Returns:** `201` with the booking and the assigned tables.

```json
{
  "id": 31,
  "slotId": 7,
  "startAt": "2026-11-01T11:00:00.000Z",
  "partySize": 6,
  "status": "confirmed",
  "tables": [
    { "tableNumber": 3, "seats": 4 },
    { "tableNumber": 5, "seats": 2 }
  ],
  "confirmationSent": true
}
```

Tables are shared with other parties. The whole party goes to the smallest table with enough free seats. If no table is big enough, the party is split: the tables with the most free seats are filled first, and the rest goes to the smallest table that fits them (`tableAssignment.service.js`).

- **Errors:**
  - `400 INVALID_INPUT`: `slotId` or `partySize` missing, not an integer, or less than 1, or the body is not valid JSON.
  - `401 NOT_AUTHENTICATED`: user not logged in, or the cookie is invalid or expired.
  - `403 FORBIDDEN_ROLE`: user is not a `hiker`.
  - `404 SLOT_NOT_FOUND`: the slot does not exist.
  - `409 ALREADY_BOOKED`: the hiker already has a confirmed booking for this slot. Only one booking per slot is allowed; to add people the hiker changes the booking (MH-06).
  - `409 NOT_ENOUGH_SEATS`: the free seats of the slot, over all its tables, are not enough for the party.
  - `422 BOOKING_CLOSED`: less than 2 hours left, or the slot is in the past.

The checks and the inserts into `reservation` and `reservation_seat` go in the same transaction, with `SELECT … FOR UPDATE` on the `slot` row, so two concurrent bookings for the same slot run one after the other and cannot take the same seats.

### MH-02 — Define slot capacity

#### `POST /api/v1/slots`

- **Type:** POST, staff only.
- **Parameters (body):** `startAt` and `endAt` with an offset (e.g. `+01:00` or `Z`), and _exactly one_ of `tables` and `copyTablesFromSlotId`. `copyTablesFromSlotId` copies the table numbers and seats of another slot, not its bookings.

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

- **Returns:** `201` with `{ id, startAt, endAt, totalSeats, tables: [ { id, tableNumber, seats } ] }`, tables ordered by number.
- **Errors:**
  - `400 INVALID_INPUT`: missing dates or dates without an offset, `endAt` not after `startAt`, `tableNumber` or `seats` not a positive integer, repeated `tableNumber`, empty list, both (or neither) of `tables` and `copyTablesFromSlotId`, or the body is not valid JSON.
  - `401 NOT_AUTHENTICATED`: user not logged in, or the cookie is invalid or expired.
  - `403 FORBIDDEN_ROLE`: user is not staff.
  - `404 SLOT_NOT_FOUND`: the slot to copy from does not exist.
  - `409 SLOT_OVERLAP`: the slot overlaps with an existing one. Back-to-back slots (one ends when the next starts) do not overlap.

#### `GET /api/v1/slots/:id`

- **Type:** GET, staff only.
- **Parameters (path):** slot `id`.
- **Returns:** `200` with `{ id, startAt, endAt, totalSeats, tables: [ { id, tableNumber, seats, freeSeats } ] }`, tables ordered by number.
- **Errors:** `400 INVALID_INPUT` (`id` not a positive integer), `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE`, `404 SLOT_NOT_FOUND`.

### MH-03 — Receive confirmation

No API of its own. After a successful booking, `POST /api/v1/reservations` (MH-01) sends a confirmation email to the logged-in hiker's address, after the commit. The email contains the booking reference, slot date and time, party size, party requirements (MH-05, once they are stored) and the hiker's name. It does not contain table numbers: they are not shown to the hiker (issue 24), they only appear in the booking response.

- If sending succeeds, the response returns `confirmationSent: true` and `confirmation_sent_at` is saved. If only saving `confirmation_sent_at` fails, the response still returns `true`, because the hiker did receive the email; the error is logged on the server.
- If sending fails, the booking stays valid and the response returns `confirmationSent: false`, so the frontend can tell the hiker the booking succeeded even though the email was not sent.

The email is sent through an internal `EmailSender` interface, so the external email provider can be chosen later without changing the API.

Implementation:

- `EmailSender` (`App/backend/src/emails/emailSender.js`) sends over SMTP with Nodemailer, configured by the `SMTP_*` and `MAIL_FROM` variables in `App/docker/.env`. In development the SMTP server is Mailpit (see the README). Changing provider only means changing these variables.
- The body is the React Email template `BookingConfirmationEmail` (`App/backend/src/emails/confirmationEmails.jsx`), rendered both as HTML and as plain text.
- Subject: `Booking confirmed – MH-<reservation id>`. Recipient: the hiker's email in `app_user`. Dates and times are shown in the `Europe/Rome` time zone.
- The email is sent after the transaction has been committed and its database connection released. The response waits for it, with SMTP timeouts of 5 s for connection and greeting and 10 s for sending, so a slow server cannot hold the booking response for long.
- A failed email is logged on the server and never turns into an error response. Bookings with `confirmation_sent_at` NULL are the ones whose email was not sent (or, rarely, sent but not recorded: check the server log).

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
    "startAt": "2026-11-01T11:00:00.000Z",
    "endAt": "2026-11-01T12:00:00.000Z"
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
    "startAt": "2026-11-01T11:00:00.000Z",
    "endAt": "2026-11-01T12:00:00.000Z"
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

It reads free seats from the `slot_table_free` view. Availability and reservation use separate allocation functions: both prefer a single fitting table and then larger capacities, but may select different table numbers for the remaining seats. The check does not hold seats: if someone books them in the meantime, MH-01 recalculates capacity under a slot-row lock and can return `409`.

---

## 3. API summary

| Story  | Method | Path                                             | Access    |
| ------ | ------ | ------------------------------------------------ | --------- |
| shared | POST   | `/api/v1/auth/register`                          | public    |
| shared | POST   | `/api/v1/auth/login`                             | public    |
| shared | POST   | `/api/v1/auth/logout`                            | logged in |
| shared | GET    | `/api/v1/auth/me`                                | logged in |
| shared | PUT    | `/api/v1/auth/password`                          | logged in |
| shared | POST   | `/api/v1/staff/employees`                        | warden    |
| shared | GET    | `/api/v1/staff/employees`                        | warden    |
| MH-01  | GET    | `/api/v1/slots?date=`                            | public    |
| MH-01  | POST   | `/api/v1/reservations`                           | hiker     |
| MH-02  | POST   | `/api/v1/slots`                                  | staff     |
| MH-02  | GET    | `/api/v1/slots/:id`                              | staff     |
| MH-03  | —      | none (email sent by `POST /api/v1/reservations`) | —         |
| MH-04  | GET    | `/api/v1/availability?date=&time=&partySize=`    | public    |
