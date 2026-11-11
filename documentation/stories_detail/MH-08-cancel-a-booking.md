# MH-08 - Cancel a booking

- **Business value:** 950
- **Requirement source:** MH-08 (shared course requirements)

## User story

As a hiker, I want to cancel a table booking, so that the hut can make the places available to other guests.

## Purpose and scope

A hiker can cancel one of their own confirmed bookings at any time **until the slot ends**, also while the slot is in progress (e.g. 10 minutes after the start), so that staff see the freed seats and can give them to other guests. There is no other time limit. The course clarification says "no time constraints"; bookings whose slot has already ended are the only exception, so the history of past meals is not changed.

Staff (`employee` and `warden`) can also cancel any booking on behalf of a hiker. This is needed in particular for temporary hikers (MH-07), who cannot log in and would otherwise have no way to cancel.

## Actors and access control

- Hiker: only their own bookings. A booking of another hiker is answered as not found (`404 RESERVATION_NOT_FOUND`).
- Staff: any booking, of registered or temporary hikers.

## End-to-end flow

```mermaid
sequenceDiagram
    actor User as Hiker or Staff
    participant UI as Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant Mail as SMTP provider

    User->>UI: Click "Cancel" and confirm
    UI->>API: POST /api/v1/reservations/:id/cancel (hiker) or /api/v1/staff/reservations/:id/cancel (staff)
    API->>DB: Begin; lock booking; check owner, status, slot end
    API->>DB: Set status = cancelled, cancelled_at, cancelled_by
    API->>DB: Commit
    API->>Mail: "Booking cancelled" email, only if the hiker has an email
    API-->>UI: 200 cancelled booking
```

## Rules

- **Time:** the slot must not have ended yet. Cancelling during the slot is allowed.
- **Already cancelled:** a cancelled booking cannot be cancelled again (`409 RESERVATION_CANCELLED`) and cannot be changed (MH-06).
- **Nothing is deleted:** the booking gets `status = 'cancelled'`, `cancelled_at` and `cancelled_by`. The `reservation_seat` and `reservation_requirement` rows are kept as history.
- **Seats freed at once:** `slot_table_free` counts only confirmed bookings, so the seats are immediately available to other guests (MH-01, MH-04). No table assignment is recalculated.
- **Booking again:** the "one booking per slot" rule only looks at confirmed bookings, so the hiker can book the same slot again after cancelling.
- **Concurrency:** the booking row is locked with `SELECT ... FOR UPDATE`, so a cancellation and a change (MH-06) of the same booking run one after the other.
- **Email:** after the commit, a "booking cancelled" email is sent if the hiker has an email, with the MH-03 rules (a failed email never undoes the cancellation).
- No cancellation reason is stored.

## API contract

| API | Access | Purpose |
| --- | --- | --- |
| `POST /api/v1/reservations/:id/cancel` | hiker (owner) | Cancel own booking |
| `POST /api/v1/staff/reservations/:id/cancel` | staff | Cancel any booking on behalf of a hiker |

Both return `200` with the cancelled booking. Full formats and errors are in the [API documentation](../api.md#mh-08--cancel-a-booking).

`GET /api/v1/me/reservations` (MH-06) returns a `cancellable` flag and `cancelledAt`; the staff bookings list returns `cancelledAt` and `cancelledBy` and can be filtered with `status=cancelled`.

## Data model

See [database.md](../database.md). `reservation` gets two new columns:

- `cancelled_at`: NOT NULL if and only if `status = 'cancelled'` (CHECK constraint);
- `cancelled_by`: FK to `app_user`, the hiker or the staff member who cancelled.

The seed data must set `cancelled_at` on its cancelled bookings.

## Frontend behavior

- **Hiker, "My bookings" page:** a "Cancel" button on each booking with `cancellable` true. A confirmation dialog ("Cancel booking MH-<id>? The seats will be released.") prevents accidental clicks. After cancelling, the booking is shown as cancelled and the page says whether the email was sent.
- **Staff bookings page:** a "Cancel" button on each confirmed booking whose slot has not ended, with the same confirmation dialog. Cancelled bookings show when and by whom they were cancelled.

## Implementation

- Route/controller: `App/backend/src/routes/reservation.routes.js`, `App/backend/src/controllers/reservation.controller.js`, staff reservation routes (MH-07)
- Business logic: `App/backend/src/services/reservation.service.js`
- Persistence: `App/backend/src/database/reservation.repository.js`
- Email: `App/backend/src/services/confirmationEmail.service.js`, `App/backend/src/emails/confirmationEmails.jsx`
- UI: "My bookings" page (MH-06), staff bookings page (MH-05); `App/frontend/src/services/reservationApi.js`
- API reference: [API documentation](../api.md)
