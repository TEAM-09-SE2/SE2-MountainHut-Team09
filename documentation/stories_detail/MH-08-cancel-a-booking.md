# MH-08 - Cancel a booking

- **Business value:** 950
- **Requirement source:** MH-08 (shared course requirements)

## User story

As a hiker, I want to cancel a table booking, so that the hut can make the places available to other guests.

## Purpose and scope

A hiker can cancel one of their own confirmed bookings at any time **until the slot ends**, also while the slot is in progress (e.g. 10 minutes after the start), so that staff see the freed seats and can give them to other guests. There is no other time limit. The course clarification says "no time constraints"; bookings whose slot has already ended are the only exception, so the history of past meals is not changed.

Staff (`employee` and `warden`) cannot cancel bookings. As a consequence, bookings of temporary hikers (MH-07), who cannot log in, cannot be cancelled through the application.

## Actors and access control

- Hiker: only their own bookings. A booking of another hiker is answered as not found (`404 RESERVATION_NOT_FOUND`).
- Staff: no cancellation. They only see cancelled bookings in the staff bookings list.

## End-to-end flow

```mermaid
sequenceDiagram
    actor User as Hiker
    participant UI as Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant Mail as SMTP provider

    User->>UI: Click "Cancel" and confirm
    UI->>API: POST /api/v1/reservations/:id/cancel
    API->>DB: Begin; lock booking; check owner, status, slot end
    API->>DB: Set status = cancelled, cancelled_at, cancelled_by
    API->>DB: Commit
    API->>Mail: "Booking cancelled" email
    API-->>UI: 200 cancelled booking
```

## Rules

- **Time:** the slot must not have ended yet. Cancelling during the slot is allowed.
- **Already cancelled:** a cancelled booking cannot be cancelled again (`409 RESERVATION_CANCELLED`) and cannot be changed (MH-06).
- **Nothing is deleted:** the booking gets `status = 'cancelled'`, `cancelled_at` and `cancelled_by`. The `reservation_seat` and `reservation_requirement` rows are kept as history.
- **Seats freed at once:** `slot_table_free` counts only confirmed bookings, so the seats are immediately available to other guests (MH-01, MH-04). No table assignment is recalculated.
- **Booking again:** the "one booking per slot" rule only looks at confirmed bookings, so the hiker can book the same slot again after cancelling.
- **Concurrency:** the booking row is locked with `SELECT ... FOR UPDATE`, so a cancellation and a change (MH-06) of the same booking run one after the other.
- **Email:** after the commit, a "booking cancelled" email is sent to the hiker, with the MH-03 rules (a failed email never undoes the cancellation).
- No cancellation reason is stored.

## API contract

| API | Access | Purpose |
| --- | --- | --- |
| `POST /api/v1/reservations/:id/cancel` | hiker (owner) | Cancel own booking |

It returns `200` with the cancelled booking. Full formats and errors are in the [API documentation](../api.md#mh-08--cancel-a-booking).

`GET /api/v1/me/reservations` (MH-06) returns a `cancellable` flag and `cancelledAt`. The list flag is computed with the database clock; the cancel endpoint performs its final slot-end check with the API server clock. The staff bookings list returns `cancelledAt` and `cancelledBy` and can be filtered with `status=cancelled`, but has no `cancellable` flag, because staff cannot cancel.

## Data model

See [database.md](../database.md). `reservation` gets two new columns:

- `cancelled_at`: NOT NULL if and only if `status = 'cancelled'` (CHECK constraint);
- `cancelled_by`: FK to `app_user`, always the hiker who owns the booking; NOT NULL if and only if `status = 'cancelled'` (CHECK constraint).

The seed data must set `cancelled_at` and `cancelled_by` (the hiker of the booking) on its cancelled bookings.

## Frontend behavior

- **Hiker, "My bookings" page:** a "Cancel" button on each booking with `cancellable` true. A confirmation dialog ("Cancel booking MH-<id>? The seats will be released.") prevents accidental clicks. After cancelling, the booking stays in the current/upcoming list until its slot ends, greyed out with a "Cancelled" badge, and its card says whether the email was sent.
- **Staff bookings page:** no "Cancel" button. Cancelled bookings show when they were cancelled.
- `cancellable` comes from the API, so the browser clock does not decide whether cancellation is allowed. While the page stays open, a browser timer reloads the list quietly when the next cancellable slot is expected to end, so its "Cancel" button goes away; the API makes the final time check, and the dialog shows the `422 SLOT_ENDED` message if cancellation is refused.

## Implementation

- Route/controller: `App/backend/src/routes/reservation.routes.js`, `App/backend/src/controllers/reservation.controller.js`
- Business logic: `App/backend/src/services/reservation.service.js`
- Persistence: `App/backend/src/database/reservation.repository.js`
- Email: `App/backend/src/services/confirmationEmail.service.js`, `App/backend/src/emails/confirmationEmails.jsx`
- UI: "My bookings" page (MH-06), `App/frontend/src/components/booking/CancelBookingDialog.jsx` (confirmation dialog), `App/frontend/src/components/booking/CancelOutcome.jsx` (email result), `App/frontend/src/hooks/useReloadWhenSlotEnds.js` (reloads the list when a cancellable slot ends); API calls in `App/frontend/src/services/reservationApi.js`
- API reference: [API documentation](../api.md)
