# MH-06 - Change a booking

- **Business value:** 960
- **Requirement source:** MH-06 (shared course requirements)

## User story

As a hiker, I want to change the date, time, party size, or requirements of my booking, so that the reservation reflects my current plans.

## Purpose and scope

A hiker can change one of their own confirmed bookings:

- the slot (date and time);
- the party size;
- the party requirements (MH-05).

Changes are allowed up to **48 hours before the start of the booked slot**. Changes to the party size or slot are subject to the automatic availability check: if there are not enough seats, the change is refused and the booking stays as it was.

To choose the booking to change, the hiker has a "My bookings" page listing their own bookings.

## Actors and access control

- Only a logged-in `hiker`, and only on their own bookings. A booking of another hiker is answered as not found (`404 RESERVATION_NOT_FOUND`), so its existence is not revealed.
- Staff cannot change bookings through this API.
- Cancelled bookings cannot be changed.
- Bookings entered by staff (MH-07) can be changed by the hiker in the same way, if the hiker has a full account. Temporary hikers cannot log in, so they cannot change their bookings.

## End-to-end flow

```mermaid
sequenceDiagram
    actor Hiker
    participant UI as Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant Mail as SMTP provider

    Hiker->>UI: Open "My bookings"
    UI->>API: GET /api/v1/me/reservations
    API-->>UI: Own bookings with changeable flag
    Hiker->>UI: Change slot, party size or requirements
    UI->>API: PATCH /api/v1/reservations/:id
    API->>DB: Begin; lock booking; lock slots in id order
    API->>DB: Check 48h rule, seats, requirements
    API->>DB: Update seats, requirements, updated_at
    API->>DB: Commit (or rollback: booking unchanged)
    API->>Mail: "Booking updated" email
    API-->>UI: 200 updated booking
```

## Rules

| Change | What happens to the tables |
| --- | --- |
| Slot (with or without new party size) | Current seats released; tables of the new slot assigned with the MH-01 rules. |
| Party size up, same slot, fits at the current tables | Same tables; the extra seats are added, starting from the table with the most free seats. |
| Party size up, same slot, does not fit at the current tables | Treated as a new booking: current seats released and tables assigned again with the MH-01 rules. |
| Party size down, same slot | Same tables; seats removed starting from the table where the booking has the fewest seats. A table left with no seats of the booking is released. |
| Only requirements | No change to seats or tables. |

Other rules:

- **48-hour limit:** checked on the current slot of the booking. The new slot only has to be bookable as in MH-01 (at least 2 hours before its start).
- **One booking per slot:** the hiker cannot move the booking to a slot where they already have another confirmed booking.
- **Requirements:** a new `requirements` list replaces the old one as a whole; a missing list keeps the current one. The total of people in the requirements cannot exceed the new party size.
- **All or nothing:** everything runs in one transaction. If any check fails, nothing changes.
- On success, `updated_at` is set and a "booking updated" email is sent after the commit (MH-03 rules: a failed email never undoes the change).

## API contract

| API | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/me/reservations` | hiker | The hiker's own bookings, with a `changeable` flag |
| `PATCH /api/v1/reservations/:id` | hiker (owner) | Change slot, party size and/or requirements |

Full request and response formats, and the list of errors, are in the [API documentation](../api.md#mh-06--change-a-booking).

## Data model

No new tables. `reservation.updated_at` (nullable) records the time of the last change. The rows of `reservation_seat` and `reservation_requirement` are updated, deleted or inserted as described above. On a slot change, the `reservation_seat` rows must be deleted before `reservation.slot_id` is updated, because of the composite foreign key `(reservation_id, slot_id)`. See [database.md](../database.md).

## Concurrency

The booking row is locked with `SELECT ... FOR UPDATE`, then the slot rows involved (current and new) are locked in ascending `id` order. Bookings (MH-01) and changes for the same slot therefore run one after the other and cannot take the same seats, and two changes cannot deadlock.

## Frontend behavior

- **My bookings page** (hiker): list of the hiker's bookings with date, time, party size, requirements and status. A "Change" button is shown only when `changeable` is true; otherwise the page explains that changes close 48 hours before the slot. A "Cancel" button is shown when `cancellable` is true (see [MH-08 - Cancel a booking](./MH-08-cancel-a-booking.md)).
- **Change booking form:** prefilled with the current booking. The hiker can pick another date and slot, change the party size and edit the requirements (same controls as the booking wizard). On success it shows the updated booking and whether the email was sent; on `409 NOT_ENOUGH_SEATS` it explains that the booking was not changed.

## Implementation

- Route/controller: `App/backend/src/routes/reservation.routes.js`, `App/backend/src/controllers/reservation.controller.js`
- Business logic: `App/backend/src/services/reservation.service.js`, `App/backend/src/services/tableAssignment.service.js`
- Persistence: `App/backend/src/database/reservation.repository.js`, `App/backend/src/database/slot.repository.js`
- Email: `App/backend/src/services/confirmationEmail.service.js`, `App/backend/src/emails/confirmationEmails.jsx`
- UI: new "My bookings" page and change booking form; `App/frontend/src/services/reservationApi.js`
- API reference: [API documentation](../api.md)
