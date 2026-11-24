# Mountain Hut — API documentation

See the [testing guide](testing.md) for verification commands. Use future slot dates when exercising time-dependent endpoints.

## Story-specific technical guides

- [MH-01 - Book a table](stories_detail/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](stories_detail/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](stories_detail/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](stories_detail/MH-04-check-availability.md)
- [MH-05 - Party requirements](stories_detail/MH-05-party-requirements.md)
- [MH-06 - Change a booking](stories_detail/MH-06-change-a-booking.md)
- [MH-07 - Reserve for a hiker](stories_detail/MH-07-reserve-for-a-hiker.md)
- [MH-08 - Cancel a booking](stories_detail/MH-08-cancel-a-booking.md)

## 1. API conventions

- `/api/v1` prefix, JSON bodies, ISO 8601 dates. Requests may use any offset (e.g. `2026-11-01T12:00:00+01:00`); responses are always in UTC (e.g. `2026-11-01T11:00:00.000Z`), and the frontend shows them in hut time (Europe/Rome).
- The implemented API uses `/api/v1`. The versioning policy is to put future breaking changes in a new version and keep the previous version until the frontend migrates; this checkout does not implement `/api/v2`. Backward-compatible changes stay in the current version.
- Session authentication with a cookie after login. Public APIs do not require it.
- "Staff" means role `employee` or `warden`.
- Errors handled by the application middleware have the format `{ "error": "CODE", "message": "human-readable text" }`. Unmatched routes use Express's default 404 response, which is not JSON.
- Protected routes load the current user role and temporary-password flag from PostgreSQL; the JWT role claim alone does not authorize access. The JWT cookie lasts one day, is HTTP-only with `SameSite=Lax`, and is secure in production.
- Staff clients use the `/api/v1/staff` prefix.

| HTTP code                 | When it is used                                       |
| ------------------------- | ----------------------------------------------------- |
| 400 Bad Request           | Missing or invalid parameters                         |
| 401 Unauthorized          | Login required and the user is not logged in          |
| 403 Forbidden             | Wrong role, or the temporary password must be changed first |
| 404 Not Found             | Slot, booking or hiker does not exist, or no slots in the week to copy |
| 409 Conflict              | Not enough seats or conflict with existing data (e.g. booking cancelled) |
| 422 Unprocessable Entity  | Forbidden by a business rule (e.g. less than 2 hours to book, less than 48 hours to change) |
| 500 Internal Server Error | Unexpected server or database error                   |

### Authentication API (shared by all stories)

| API                          | Access    | Parameters                                                                                                    | Returns                                                                                                         | Errors                                         |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `POST /api/v1/auth/register` | public    | body: `email`, `password`, `firstName`, `lastName`, `phone`?, `emergencyContactName`?, `emergencyContactPhone`?, `notes`? | `201` `{ id, email, firstName, lastName, phone, emergencyContactName, emergencyContactPhone, notes, role: "hiker" }` | `400 INVALID_INPUT`, `409 EMAIL_ALREADY_USED`  |
| `POST /api/v1/auth/login`    | public    | body: `email`, `password` | `200` `{ id, email, firstName, lastName, role, mustChangePassword }`, sets the cookie | `400 INVALID_INPUT`, `401 INVALID_CREDENTIALS` |
| `POST /api/v1/auth/logout`   | logged in | none                                                                                                          | `204`                                                                                                           | `401 NOT_AUTHENTICATED`                        |
| `GET /api/v1/auth/me`        | logged in | none                                                                                                          | `200` `{ id, email, firstName, lastName, phone, emergencyContactName, emergencyContactPhone, notes, role, mustChangePassword }` | `401 NOT_AUTHENTICATED`                        |
| `PUT /api/v1/auth/password` | logged in | body: `currentPassword`, `newPassword` | `204`, clears `must_change_password` | `400 INVALID_INPUT`, `401 NOT_AUTHENTICATED`, `401 INVALID_CREDENTIALS` |
| `POST /api/v1/auth/password-reset/request` | public | body: `email` | `202` for valid input and successful token persistence, whether or not an account exists; SMTP failure does not change it | `400 INVALID_INPUT`, `500 INTERNAL_ERROR` for unexpected storage failure |
| `POST /api/v1/auth/password-reset/confirm` | public | body: `token`, `newPassword`                                                                    | `204`, password changed                                                                                         | `400 INVALID_INPUT`, `400 INVALID_RESET_TOKEN` |

Registration details:

- Emails are trimmed and lowercased. First and last names are required and trimmed. Registration returns `400 INVALID_INPUT` if an email exceeds 255 characters or a name exceeds 100.
- `phone`, `emergencyContactName`, `emergencyContactPhone` and `notes` are optional. A missing field, `null` or an empty string are all stored as NULL and returned as `null`.
- `emergencyContactName` and `emergencyContactPhone` go together: either both are given or neither is.
- `400 INVALID_INPUT` is also returned when an optional field is not a string, `emergencyContactName` is longer than 100 characters, `emergencyContactPhone` is not a valid phone number (same rule as `phone`, at most 10 characters), `notes` is longer than 1000 characters, or only one of the two emergency contact fields is given.
- Only hikers register through this API, so for staff accounts these fields are always `null`.
- Staff can read all these hiker fields; `password_hash` and `salt` are never returned by any API.

Adding optional fields is a backward-compatible change, so it stays in `/api/v1`.

Password rule (registration, temporary password and password change): at least 8 characters.

Password change and temporary passwords:

- Login and `GET /auth/me` both return `mustChangePassword`. `PasswordChangeGate` uses it to redirect the signed-in user to `/change-password`.
- While `mustChangePassword` is `true`, every API that requires login answers `403 PASSWORD_CHANGE_REQUIRED`, except `GET /auth/me`, `POST /auth/logout` and `PUT /auth/password`.
- `PUT /auth/password` checks `currentPassword` against the stored hash (`401 INVALID_CREDENTIALS` if wrong). `newPassword` must follow the password rule and differ from `currentPassword` (`400 INVALID_INPUT` otherwise). A new salt is generated with the new hash. Any authenticated role can use it.
- Temporary passwords are set by the warden for employees and by staff for full hiker accounts created in MH-07 (random password).
- Temporary hikers (MH-07) have no email and no password, so they can never log in: `POST /auth/login` cannot match them.

Password recovery via email (MH-07), for every user with an email (hikers, employees, wardens):

- `POST /auth/password-reset/request` returns the same `202` response for valid email input whether or not an account exists, assuming token persistence succeeds. If the account exists, the backend generates 32 random bytes encoded as 64 hexadecimal characters, stores only the SHA-256 hash in `password_reset_token` (valid 24 hours), and attempts to email `<CLIENT_URL>/reset-password?token=<token>`. `CLIENT_URL` provides the frontend base URL. Invalid email input returns 400; unexpected database failures return 500.
- `POST /auth/password-reset/confirm` checks the token: unknown, expired or already used → `400 INVALID_RESET_TOKEN`. `newPassword` must follow the password rule (`400 INVALID_INPUT`). On success it saves the new hash and salt, sets `must_change_password` to `false` and marks all the valid tokens of the user as used. The user then logs in normally.
- The reset email is sent with the same `EmailSender` as the confirmation email, with its own template and the subject `Reset your password`. A failed email is logged and the answer is still `202`.
- Token creation and confirmation lock the user's row. Confirmation rechecks token validity under the lock using the database clock, replaces the password hash/salt, and consumes the valid tokens in one transaction. Concurrent confirmation cannot reuse the same token. Creating a new token does not itself invalidate previous tokens.

### Staff management API (warden only)

Employees cannot register through `POST /auth/register`. Only the warden creates them, from the warden page.

| API                                | Access | Parameters                                                       | Returns                                                                                                   | Errors                                                                                    |
| ---------------------------------- | ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/v1/staff/employees`     | warden | body: `email`, `firstName`, `lastName`, `phone`?, `password`     | `201` `{ id, email, firstName, lastName, phone, role: "employee", mustChangePassword: true }`             | `400 INVALID_INPUT`, `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE`, `409 EMAIL_ALREADY_USED` |
| `GET /api/v1/staff/employees`      | warden | none                                                             | `200` `[ { id, email, firstName, lastName, phone, mustChangePassword, createdAt } ]`, ordered by last name, first name, id | `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE`                                             |

- Access is `warden` only: an `employee` gets `403 FORBIDDEN_ROLE`, even though both are "staff".
- `POST`: `password` is the temporary password. It follows the same password rule as registration, and the other fields use the same validation as `POST /auth/register`. Missing, empty (`{}`), or non-object request bodies return `400 INVALID_INPUT` (`"Request body is missing or empty."`).
- The backend creates the `app_user` row with `role = 'employee'` and `must_change_password = true`, and stores only `password_hash` and `salt`, never the password itself.
- `emergencyContactName`, `emergencyContactPhone` and `notes` must be omitted from the request body: sending any of these keys, even with `null` or an empty string (`""`), returns `400 INVALID_INPUT` (`"<field> is only available for hikers."`). These fields stay NULL for employee accounts; any other unknown keys are ignored.
- The warden gives the temporary password to the employee in person. The employee logs in with `POST /auth/login` and must then change it with `PUT /auth/password`.
- `GET`: lists only users with role `employee`. `mustChangePassword` tells the warden which employees have not logged in and changed their password yet.
- Employees cannot be deactivated or deleted.

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
- **Parameters (body):** `slotId`, `partySize`, and `requirements`? (party requirements, MH-05).

```json
{
  "slotId": 7,
  "partySize": 6,
  "requirements": [
    { "peopleCount": 1, "hasAllergies": true, "description": "Vegan, peanut allergy" },
    { "peopleCount": 1, "hasAllergies": true, "description": "Shellfish allergy" },
    { "peopleCount": 2, "hasAllergies": false, "description": "Vegetarian" }
  ]
}
```

- **Returns:** `201` with the booking, the assigned tables and the saved requirements (with their `id`, in the order they were sent). `createdAt` is the booking time; `updatedAt` is `null` until the booking is changed (MH-06).

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
  "requirements": [
    { "id": 12, "peopleCount": 1, "hasAllergies": true, "description": "Vegan, peanut allergy" },
    { "id": 13, "peopleCount": 1, "hasAllergies": true, "description": "Shellfish allergy" },
    { "id": 14, "peopleCount": 2, "hasAllergies": false, "description": "Vegetarian" }
  ],
  "createdAt": "2026-10-20T08:15:00.000Z",
  "updatedAt": null,
  "confirmationSent": true
}
```

Tables are shared with other parties. The whole party goes to the smallest table with enough free seats. If no table is big enough, the party is split: the tables with the most free seats are filled first, and the rest goes to the smallest table that fits them (`tableAssignment.service.js`).

- **Errors:**
  - `400 INVALID_INPUT`: `slotId` or `partySize` missing, not an integer, or less than 1, `requirements` not valid (see MH-05), or the body is not valid JSON.
  - `401 NOT_AUTHENTICATED`: user not logged in, or the cookie is invalid or expired.
  - `403 FORBIDDEN_ROLE`: user is not a `hiker`.
  - `404 SLOT_NOT_FOUND`: the slot does not exist.
  - `409 ALREADY_BOOKED`: the hiker already has a confirmed booking for this slot. Only one booking per slot is allowed; to add people the hiker changes the booking (MH-06).
  - `409 NOT_ENOUGH_SEATS`: the free seats of the slot, over all its tables, are not enough for the party.
  - `422 BOOKING_CLOSED`: less than 2 hours left, or the slot is in the past.

The checks and the inserts into `reservation`, `reservation_seat` and `reservation_requirement` go in the same transaction, with `SELECT … FOR UPDATE` on the `slot` row, so two concurrent bookings for the same slot run one after the other and cannot take the same seats.

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

No API of its own. After a successful booking, `POST /api/v1/reservations` (MH-01) or `POST /api/v1/staff/reservations` (MH-07) attempts a confirmation email to the booked hiker's address, after the commit. Temporary hikers have no email and receive `confirmationSent: false` without a send attempt. The email contains the booking reference, slot date and time, party size, party requirements (MH-05) and the hiker's name. It does not contain table numbers: they are not shown to the hiker (issue 24), they only appear in the booking response.

- If sending succeeds, the response returns `confirmationSent: true` and `confirmation_sent_at` is saved. If only saving `confirmation_sent_at` fails, the response still returns `true`, because the hiker did receive the email; the error is logged on the server.
- If sending fails, the booking stays valid and the response returns `confirmationSent: false`, so the frontend can tell the hiker the booking succeeded even though the email was not sent.

The email is sent through an internal `EmailSender` interface, so the external email provider can be chosen later without changing the API.

Implementation:

- `EmailSender` (`App/backend/src/emails/emailSender.js`) sends over SMTP with Nodemailer, configured by the `SMTP_*` and `MAIL_FROM` variables in `App/docker/.env`. In development the SMTP server is Mailpit (see the README). Changing provider only means changing these variables.
- The body is the React Email template `BookingConfirmationEmail` (`App/backend/src/emails/confirmationEmails.jsx`), rendered both as HTML and as plain text.
- Subject: `Booking confirmed – MH-<reservation id>`. Recipient: the hiker's email in `app_user`. Dates and times are shown in the `Europe/Rome` time zone.
- The email is sent after the transaction has been committed and its database connection released. The response waits for it, with SMTP timeouts of 5 s for connection and greeting and 10 s for sending, so a slow server cannot hold the booking response for long.
- A failed email is logged on the server and never turns into an error response. Bookings with `confirmation_sent_at` NULL are the ones whose email was not sent (or, rarely, sent but not recorded: check the server log).
- After a change (MH-06), `PATCH /api/v1/reservations/:id` sends a "booking updated" email with the same template (heading "Your reservation has been updated") and the same rules, with the subject `Booking updated – MH-<reservation id>`. It is sent only when the booking really changed. `confirmation_sent_at` refers only to the first confirmation and is not changed.
- After a cancellation (MH-08), a "booking cancelled" email is sent in the same way, with the subject `Booking cancelled – MH-<reservation id>`, only if the hiker has an email.

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

### MH-05 — Party requirements

The hiker gives dietary restrictions and allergies for subsets of the party when creating the booking (`POST /api/v1/reservations`, MH-01), and can change them later with `PATCH /api/v1/reservations/:id` (MH-06). Staff read them, together with all the bookings, through the API below.

**`requirements` rules** (in the body of `POST /api/v1/reservations`):

- Optional. Missing or an empty list means no requirements.
- Each item has `peopleCount` (integer, at least 1), `hasAllergies` (boolean) and `description` (non-empty string after trimming, at most 500 characters, saved trimmed).
- `hasAllergies: true` means special care is needed during preparation; the details go in `description`.
- The sum of `peopleCount` must not exceed `partySize`, so a booking has at most `partySize` requirements. A person without requirements is simply not counted.
- Any rule broken → `400 INVALID_INPUT`.
- The confirmation email (MH-03) lists the requirements, one per line, as `<peopleCount> × <description>`, with requirements with allergies listed first and marked `ALLERGY`, e.g. `1 × ALLERGY: Vegan, peanut allergy`, then `2 × Vegetarian`.

#### `GET /api/v1/reservations`

- **Type:** GET, staff only. The same path with `POST` is the hiker booking API (MH-01).
- **Parameters (query):** all optional, they can be combined. Without filters it returns all the bookings.
  - `date`: format `YYYY-MM-DD`, a day in hut local time (Europe/Rome); bookings whose slot starts on that day.
  - `slotId`: positive integer.
  - `status`: `confirmed` or `cancelled`.
- **Returns:** `200` with the list of bookings, ordered by slot start, then by booking date. Empty list if there are none.

```json
[
  {
    "id": 31,
    "slot": {
      "id": 7,
      "startAt": "2026-11-01T11:00:00.000Z",
      "endAt": "2026-11-01T12:00:00.000Z"
    },
    "partySize": 6,
    "status": "confirmed",
    "cancellable": true,
    "createdAt": "2026-10-20T08:15:00.000Z",
    "updatedAt": null,
    "cancelledAt": null,
    "cancelledBy": null,
    "confirmationSent": true,
    "hiker": {
      "id": 4,
      "email": "anna@example.com",
      "firstName": "Anna",
      "lastName": "Neri",
      "phone": "3331234567",
      "emergencyContactName": "Marco Neri",
      "emergencyContactPhone": "3337654321",
      "notes": null,
      "isTemporary": false
    },
    "createdBy": null,
    "tables": [
      { "tableNumber": 3, "seats": 4 },
      { "tableNumber": 5, "seats": 2 }
    ],
    "hasAllergies": true,
    "requirements": [
      { "id": 12, "peopleCount": 1, "hasAllergies": true, "description": "Vegan, peanut allergy" },
      { "id": 13, "peopleCount": 1, "hasAllergies": true, "description": "Shellfish allergy" },
      { "id": 14, "peopleCount": 2, "hasAllergies": false, "description": "Vegetarian" }
    ]
  }
]
```

`updatedAt` is the time of the last change (MH-06), `null` if the booking was never changed. `createdBy` is the staff member who entered the booking (MH-07), as `{ id, firstName, lastName, role }`, or `null` if the hiker booked on the web. For a temporary hiker `hiker.isTemporary` is `true` and `email` is `null`. `cancelledAt` and `cancelledBy` (`{ id, firstName, lastName, role }`) are set only for cancelled bookings (MH-08). `cancellable` is `true` when the booking is `confirmed` and its slot has not ended yet (MH-08), for the staff "Cancel" button; the list computes it with the database clock, while the cancel endpoint checks the slot end with the API server clock. `hasAllergies` at booking level is `true` when at least one requirement has allergies, so the staff can spot these bookings at a glance. `requirements` lists the ones with allergies first. `hiker` never contains `password_hash` or `salt`.

- **Errors:**
  - `400 INVALID_INPUT`: `date`, `slotId` or `status` not valid.
  - `401 NOT_AUTHENTICATED`: user not logged in, or the cookie is invalid or expired.
  - `403 FORBIDDEN_ROLE`: user is not staff.

### MH-06 — Change a booking

The hiker can change the slot (date and time), the party size or the requirements of their own booking, up to 48 hours before the start of the booked slot. To pick the booking to change, the hiker sees their bookings with `GET /api/v1/me/reservations`.

#### `GET /api/v1/me/reservations`

- **Type:** GET, logged-in `hiker` only. Returns only the bookings of the logged-in hiker.
- **Parameters:** none.
- **Returns:** `200` with the hiker's current and upcoming bookings, confirmed and cancelled: only bookings whose slot has not ended yet, ordered by slot start. Past bookings are not returned, as no story needs them. Empty list if there are none.

```json
[
  {
    "id": 31,
    "slot": {
      "id": 7,
      "startAt": "2026-11-01T11:00:00.000Z",
      "endAt": "2026-11-01T12:00:00.000Z"
    },
    "partySize": 6,
    "status": "confirmed",
    "createdAt": "2026-10-20T08:15:00.000Z",
    "updatedAt": null,
    "cancelledAt": null,
    "changeable": true,
    "cancellable": true,
    "requirements": [
      { "id": 12, "peopleCount": 1, "hasAllergies": true, "description": "Vegan, peanut allergy" }
    ]
  }
]
```

`changeable` is `true` when the booking is `confirmed` and its slot starts in at least 48 hours, so the frontend can show or hide the "Change" button. `cancellable` is `true` when the booking is `confirmed` and its slot has not ended yet (MH-08), for the "Cancel" button; the list computes it with the database clock, while the cancel endpoint checks the slot end with the API server clock. Table numbers are not returned, as they are not shown to the hiker (issue 24).

- **Errors:** `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE` (user is not a `hiker`).

#### `PATCH /api/v1/reservations/:id`

- **Type:** PATCH, logged-in `hiker` only, and only on their own booking.
- **Parameters (path):** booking `id`.
- **Parameters (body):** `slotId`?, `partySize`?, `requirements`?. At least one must be present; the missing ones stay as they are. Changing date and time means choosing another slot.

```json
{
  "slotId": 9,
  "partySize": 8,
  "requirements": [
    { "peopleCount": 1, "hasAllergies": true, "description": "Vegan, peanut allergy" },
    { "peopleCount": 3, "hasAllergies": false, "description": "Vegetarian" }
  ]
}
```

- **Returns:** `200` with the updated booking, in the same format as the `201` of `POST /api/v1/reservations`, with `updatedAt` set to the time of the change. `confirmationSent` tells whether the "booking updated" email was sent.

**Rules:**

- **48-hour limit:** the booking can be changed only if its current slot starts in at least 48 hours. The new slot only has to be bookable as in MH-01 (at least 2 hours before its start).
- **Requirements:** if `requirements` is present it replaces the whole list (an empty list removes them all); if it is missing they stay as they are. Same rules as MH-05, checked against the new party size: if the party size goes down and the current requirements count more people than the new party size, the hiker must send an updated `requirements` list.
- **Slot change:** the current seats are released and the tables of the new slot are assigned with the MH-01 rules. The hiker must not already have another confirmed booking in the new slot.
- **Party size up, same slot:** if the extra people fit in the free seats of the tables already assigned to the booking, the tables stay the same and the seats are added to them (starting from the table with the most free seats). Otherwise it is treated as a new booking: the current seats are released and the tables are assigned again with the MH-01 rules.
- **Party size down, same slot:** the tables stay the same and seats are removed, starting from the table where the booking has the fewest seats. A table whose seats are all removed is released (its `reservation_seat` row is deleted).
- **Only requirements changed:** seats and tables do not change.
- **Nothing changed:** if the values sent are the same as the current ones (same slot, same party size, same requirements, compared ignoring their order and surrounding spaces), nothing is written: `updated_at` keeps its value, no email is sent and the response has `confirmationSent: false`. The 48-hour limit and the other checks still apply.
- **All or nothing:** if there are not enough seats, or any rule is broken, the change is refused and the booking stays exactly as it was.
- On success `updated_at` is set to the current time and a "booking updated" email is sent after the commit (see MH-03).

- **Errors:**
  - `400 INVALID_INPUT`: `id` not a positive integer, no field in the body, `slotId` or `partySize` not valid, `requirements` not valid (see MH-05), or the body is not valid JSON.
  - `401 NOT_AUTHENTICATED`: user not logged in, or the cookie is invalid or expired.
  - `403 FORBIDDEN_ROLE`: user is not a `hiker`.
  - `404 RESERVATION_NOT_FOUND`: the booking does not exist or belongs to another hiker.
  - `404 SLOT_NOT_FOUND`: the new slot does not exist.
  - `409 RESERVATION_CANCELLED`: the booking is cancelled and cannot be changed.
  - `409 ALREADY_BOOKED`: the hiker already has a confirmed booking in the new slot.
  - `409 NOT_ENOUGH_SEATS`: not enough free seats for the new party size or in the new slot.
  - `422 CHANGE_CLOSED`: the current slot starts in less than 48 hours, or is in the past.
  - `422 BOOKING_CLOSED`: the new slot starts in less than 2 hours, or is in the past.

Everything happens in one transaction. The booking row is locked with `SELECT … FOR UPDATE`, then the slot rows involved (current and new) in ascending `id` order, so that concurrent changes and bookings cannot take the same seats and cannot deadlock. On a slot change the `reservation_seat` rows must be deleted before updating `reservation.slot_id`, because of the composite foreign key `(reservation_id, slot_id)`; then the new rows are inserted.

### MH-07 — Reserve for a hiker

Staff (`employee` and `warden`) enter reservations received by phone, message or in person. The hiker can be an existing one (registered or temporary), a new full account, or a new temporary hiker. Hiker and reservation are created in one call and one transaction, so a hiker is never created without a reservation.

#### `GET /api/v1/staff/hikers`

- **Type:** GET, staff only.
- **Parameters (query):** `q` required, at least 2 characters after trimming. Case-insensitive partial match on first name, last name, "first last", phone and email; SQL wildcard characters are escaped and treated literally.
- **Returns:** `200` with all the matching hikers (registered and temporary), ordered by last name, first name, so staff never miss an existing hiker and create a duplicate. Empty list if none matches.

```json
[
  { "id": 4, "firstName": "Anna", "lastName": "Neri", "email": "anna@example.com", "phone": "3331234567", "isTemporary": false },
  { "id": 57, "firstName": "Luca", "lastName": "Neri", "email": null, "phone": "3471112233", "isTemporary": true }
]
```

- **Errors:** `400 INVALID_INPUT` (`q` missing or shorter than 2 characters), `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE`.

#### `POST /api/v1/staff/reservations`

- **Type:** POST, staff only.
- **Parameters (body):** `slotId`, `partySize`, `requirements`? (same rules as MH-05) and **exactly one** of:
  - `hikerId`: an existing hiker (registered or temporary);
  - `newHiker`: `{ email, firstName, lastName, phone?, emergencyContactName?, emergencyContactPhone?, notes? }`; creates a full hiker account. Email is at most 255 characters, names 1–100, phone fields at most 10 digits, emergency contact fields are paired, and notes are at most 1000 characters;
  - `temporaryHiker`: `{ firstName, lastName, phone? }`; creates a temporary hiker who cannot log in.

`slotId`, `partySize`, and `hikerId` must be positive 32-bit integers. New-hiker objects reject unsupported keys, including caller-provided role/password fields. Full and temporary hikers require first and last names. `requirements` uses the shared validation in `reservationValidation.js`.

```json
{
  "slotId": 7,
  "partySize": 4,
  "temporaryHiker": { "firstName": "Luca", "lastName": "Neri", "phone": "3471112233" },
  "requirements": [
    { "peopleCount": 1, "hasAllergies": true, "description": "Gluten allergy" }
  ]
}
```

- **Returns:** `201` with the booking in the same format as `POST /api/v1/reservations`, plus `hiker` (`{ id, firstName, lastName, email, phone, isTemporary }`) and `createdBy`. Only when `newHiker` is used, the response also contains `temporaryPassword`: it is shown once to the staff member, who gives it to the hiker in person or by phone; it is never stored or sent by email.

```json
{
  "id": 32,
  "slotId": 7,
  "startAt": "2026-11-01T11:00:00.000Z",
  "partySize": 4,
  "status": "confirmed",
  "createdAt": "2026-10-20T08:15:00.000Z",
  "updatedAt": null,
  "tables": [ { "tableNumber": 2, "seats": 4 } ],
  "requirements": [
    { "id": 15, "peopleCount": 1, "hasAllergies": true, "description": "Gluten allergy" }
  ],
  "hiker": { "id": 57, "firstName": "Luca", "lastName": "Neri", "email": null, "phone": "3471112233", "isTemporary": true },
  "createdBy": { "id": 2, "firstName": "Marta", "lastName": "Ricci", "role": "employee" },
  "confirmationSent": false
}
```

**Rules:**

- **Time:** the only time constraint is that the slot has not started yet (no 2-hour limit, unlike MH-01).
- **Seats and tables:** same rules as MH-01. One confirmed booking per hiker per slot.
- **New full account:** role `hiker`, random password of 12 characters generated by the backend (only hash and salt stored), `must_change_password = true`. The hiker must change the temporary password at first login.
- **Temporary hiker:** `is_temporary = true`, no email and no password. Cannot log in and cannot become a full account later.
- **Confirmation email (MH-03):** sent if the hiker has an email; for a temporary hiker `confirmationSent` is `false`. No email with the password is ever sent.
- `reservation.created_by` is set to the logged-in staff member.
- **All or nothing:** if the booking fails (e.g. not enough seats), the new hiker is not created either.

- **Errors:**
  - `400 INVALID_INPUT`: `slotId` or `partySize` not valid, none or more than one of `hikerId`, `newHiker`, `temporaryHiker`, hiker fields not valid, `requirements` not valid, or the body is not valid JSON.
  - `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE` (user is not staff).
  - `404 HIKER_NOT_FOUND`: `hikerId` does not exist or is not a hiker.
  - `404 SLOT_NOT_FOUND`: the slot does not exist.
  - `409 EMAIL_ALREADY_USED`: the email of `newHiker` already belongs to an account (search the hiker and use `hikerId`).
  - `409 ALREADY_BOOKED`: the hiker already has a confirmed booking for this slot.
  - `409 NOT_ENOUGH_SEATS`: not enough free seats in the slot.
  - `422 SLOT_STARTED`: the slot has already started.

### MH-08 — Cancel a booking

The hiker can cancel their own booking at any time until the slot ends, also while the slot is in progress, so the freed seats can go to other guests. Staff (`employee` and `warden`) can cancel any booking on behalf of a hiker, e.g. when a temporary hiker (MH-07), who cannot log in, calls to cancel. The course clarification says there are no time constraints; bookings whose slot has already ended are the only exception, so the history of past meals stays as it was.

A cancellation does not delete anything: the booking gets `status = 'cancelled'`, `cancelled_at` and `cancelled_by`. Its seats become free at once, because `slot_table_free` counts only confirmed bookings; the seat and requirement rows are kept as history. After a cancellation the hiker can book the same slot again.

#### `POST /api/v1/reservations/:id/cancel`

- **Type:** POST, logged-in `hiker` only, and only on their own booking.
- **Parameters (path):** booking `id`. No body.
- **Returns:** `200` with the cancelled booking.

```json
{
  "id": 31,
  "slotId": 7,
  "startAt": "2026-11-01T11:00:00.000Z",
  "partySize": 6,
  "status": "cancelled",
  "cancelledAt": "2026-10-28T09:30:00.000Z",
  "cancelledBy": { "id": 4, "firstName": "Anna", "lastName": "Neri", "role": "hiker" },
  "confirmationSent": true
}
```

`confirmationSent` is `true` if the "booking cancelled" email was sent. It is `false` if the hiker has no email address or sending failed; a sending failure is logged and does not undo the cancellation.

- **Errors:**
  - `400 INVALID_INPUT`: `id` not a positive integer.
  - `401 NOT_AUTHENTICATED`: user not logged in, or the cookie is invalid or expired.
  - `403 FORBIDDEN_ROLE`: user is not a `hiker`.
  - `404 RESERVATION_NOT_FOUND`: the booking does not exist or belongs to another hiker.
  - `409 RESERVATION_CANCELLED`: the booking is already cancelled.
  - `422 SLOT_ENDED`: the slot has already ended.

#### `POST /api/v1/staff/reservations/:id/cancel`

- **Type:** POST, staff only. Works on any booking, of registered or temporary hikers.
- **Parameters (path):** booking `id`. No body.
- **Returns:** `200` with the cancelled booking, same format as above; `cancelledBy` is the staff member.
- **Errors:** `400 INVALID_INPUT`, `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE` (user is not staff), `404 RESERVATION_NOT_FOUND`, `409 RESERVATION_CANCELLED`, `422 SLOT_ENDED`.

**Common rules:**

- The booking row is locked with `SELECT … FOR UPDATE`, so a cancellation and a change (MH-06) of the same booking run one after the other.
- `status`, `cancelled_at` and `cancelled_by` are updated in one transaction; `reservation_seat` and `reservation_requirement` rows are not touched.
- After the commit a "booking cancelled" email is sent if the hiker has an email. `confirmationSent` is `false` when there is no email address or sending fails; a sending failure is logged and never undoes the cancellation (MH-03).

### MH-09 — Repeat a weekly schedule

Staff (`employee` and `warden`) copy all the slots of one week, with their tables, into one or more following weeks, so recurring slots do not have to be created one by one. A week goes from Monday to Sunday in hut local time (Europe/Rome). The copied slots are normal slots: they can be adjusted later one by one.

#### `POST /api/v1/slots/copy-week`

- **Type:** POST, staff only.
- **Parameters (body):**
  - `sourceWeekStart`: format `YYYY-MM-DD`, the Monday of the week to copy.
  - `targetWeekStart`: format `YYYY-MM-DD`, the Monday of the first week to fill.
  - `weeks`?: integer from 1 to 12, default 1. Number of consecutive weeks to fill, starting from `targetWeekStart`.

```json
{
  "sourceWeekStart": "2026-11-02",
  "targetWeekStart": "2026-11-09",
  "weeks": 3
}
```

- **Returns:** `201` with the created slots, ordered by start, and the number of slots replaced.

```json
{
  "createdSlots": [
    { "id": 41, "startAt": "2026-11-09T11:00:00.000Z", "endAt": "2026-11-09T12:00:00.000Z", "totalSeats": 40 },
    { "id": 42, "startAt": "2026-11-09T17:30:00.000Z", "endAt": "2026-11-09T19:00:00.000Z", "totalSeats": 36 }
  ],
  "replacedSlots": 2
}
```

**Rules:**

- **What is copied:** for each slot of the source week, a new slot on the same weekday with the same local start and end time, and the same tables (`tableNumber`, `seats`). Times are kept in hut local time, so a 12:00 slot stays at 12:00 across a daylight saving change. Reservations are never copied.
- **Existing schedule:** if a target week already has slots, they are completely replaced (deleted together with their tables) — but only if none of them has reservations. A reservation of any status blocks the copy: cancelled reservations are kept as history (MH-08).
- **Target weeks:** must start after today and must not include the source week.
- **At most 12 weeks per request:** `weeks` goes from 1 to 12, so one request can fill up to about three months, roughly a hut season. The limit is a team choice, not a requirement of the story. It exists because the whole copy runs in one transaction that locks the slots of every target week: an unlimited value could create thousands of slots and keep bookings waiting for a long time, and a typing mistake (e.g. `100` instead of `10`) could replace the schedule of months ahead. To fill more than 12 weeks, staff send another request starting from the first week not yet filled.
- **All or nothing:** if any target week cannot be filled, nothing is created or deleted.
- `slot.created_by` of the new slots is the logged-in staff member.

- **Errors:**
  - `400 INVALID_INPUT`: a date missing, invalid or not a Monday, `weeks` not an integer from 1 to 12, or the body is not valid JSON.
  - `401 NOT_AUTHENTICATED`, `403 FORBIDDEN_ROLE` (user is not staff).
  - `404 NO_SLOTS_IN_SOURCE_WEEK`: the source week has no slots.
  - `409 TARGET_WEEK_HAS_RESERVATIONS`: a slot of a target week has reservations.
  - `409 SLOT_OVERLAP`: a copied slot overlaps with a slot outside the target weeks (e.g. one crossing midnight between Sunday and Monday).
  - `422 TARGET_WEEK_NOT_VALID`: a target week does not start after today or includes the source week.

Everything happens in one transaction. The slot rows of the target weeks are locked with `SELECT … FOR UPDATE`, the same lock MH-01 and MH-07 take, so a booking cannot be made on a slot while it is being replaced: once the copy is committed, that booking gets `404 SLOT_NOT_FOUND`.

---

## 3. API summary

| Story  | Method | Path                                             | Access    |
| ------ | ------ | ------------------------------------------------ | --------- |
| shared | POST   | `/api/v1/auth/register`                          | public    |
| shared | POST   | `/api/v1/auth/login`                             | public    |
| shared | POST   | `/api/v1/auth/logout`                            | logged in |
| shared | GET    | `/api/v1/auth/me`                                | logged in |
| shared | PUT    | `/api/v1/auth/password`                          | logged in |
| MH-07  | POST   | `/api/v1/auth/password-reset/request`            | public    |
| MH-07  | POST   | `/api/v1/auth/password-reset/confirm`            | public    |
| shared | POST   | `/api/v1/staff/employees`                        | warden    |
| shared | GET    | `/api/v1/staff/employees`                        | warden    |
| MH-01  | GET    | `/api/v1/slots?date=`                            | public    |
| MH-01  | POST   | `/api/v1/reservations`                           | hiker     |
| MH-02  | POST   | `/api/v1/slots`                                  | staff     |
| MH-02  | GET    | `/api/v1/slots/:id`                              | staff     |
| MH-03  | —      | none (email sent by `POST /api/v1/reservations`) | —         |
| MH-04  | GET    | `/api/v1/availability?date=&time=&partySize=`    | public    |
| MH-05  | —      | `requirements` in `POST /api/v1/reservations`    | hiker     |
| MH-05  | GET    | `/api/v1/reservations?date=&slotId=&status=`     | staff     |
| MH-06  | GET    | `/api/v1/me/reservations`                        | hiker     |
| MH-06  | PATCH  | `/api/v1/reservations/:id`                       | hiker     |
| MH-07  | GET    | `/api/v1/staff/hikers?q=`                        | staff     |
| MH-07  | POST   | `/api/v1/staff/reservations`                     | staff     |
| MH-08  | POST   | `/api/v1/reservations/:id/cancel`                | hiker     |
| MH-08  | POST   | `/api/v1/staff/reservations/:id/cancel`          | staff     |
| MH-09  | POST   | `/api/v1/slots/copy-week`                        | staff     |
