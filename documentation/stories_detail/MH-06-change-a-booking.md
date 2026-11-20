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

An existing full hiker account can also change a booking originally entered by staff (MH-07), because ownership uses `reservation.hiker_id`, not `created_by`. Temporary hikers have no login access. Full hikers created by staff must clear `must_change_password` before protected operations; the normal password-change flow currently has the [documented regression](../implementation-status.md).

To choose the booking to change, the hiker has a "My bookings" page listing their own current and upcoming bookings (slot not ended yet). Past bookings are not shown.

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
- **No real change:** values equal to the current ones (requirements compared ignoring order and surrounding spaces) write nothing: no `updated_at`, no email, `confirmationSent: false`.

## API contract

| API | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/me/reservations` | hiker | The hiker's own current and upcoming bookings, with a `changeable` flag |
| `PATCH /api/v1/reservations/:id` | hiker (owner) | Change slot, party size and/or requirements |

Full request and response formats, and the list of errors, are in the [API documentation](../api.md#mh-06--change-a-booking).

## Data model

No new tables. `reservation.updated_at` (nullable) records the time of the last change. The rows of `reservation_seat` and `reservation_requirement` are updated, deleted or inserted as described above. On a slot change, the `reservation_seat` rows must be deleted before `reservation.slot_id` is updated, because of the composite foreign key `(reservation_id, slot_id)`. See [database.md](../database.md).

## Concurrency

The booking row is locked with `SELECT ... FOR UPDATE`, then the slot rows involved (current and new) are locked in ascending `id` order. Bookings (MH-01) and changes for the same slot therefore run one after the other and cannot take the same seats, and two changes cannot deadlock.

## Frontend behavior

Both pages are for logged-in hikers only, and are reached from the "My bookings" link in the navigation bar.

- **My bookings page** (`/my-bookings`): list of the hiker's current and upcoming bookings, including cancelled ones, with the `MH-<id>` reference, date, time, party size, requirements and status. A "Change" button is shown only when `changeable` is true; otherwise the page explains that changes close 48 hours before the slot. Cancelled bookings have no action. Although the API already returns `cancellable`, this branch has no cancellation button or POST route. Those belong to the [MH-08 implementation to integrate](./MH-08-cancel-a-booking.md).
- **Change booking form** (`/my-bookings/:id/change`): prefilled with the current booking, with the current booking summary on the side.
  - The hiker can pick another date and slot, change the party size and edit the requirements (add, remove, people counter, "Allergies" checkbox, description), with the same rules as the API.
  - Changing the date clears the selected slot until a slot of that date is chosen. Slots that are closed, or have fewer free seats than the party, cannot be selected.
  - A summary lists what will change; "Save changes" stays disabled until something changed and every value is valid. Only the changed fields are sent to the API.
  - On success it shows the updated booking and whether the update email was sent. On `409 NOT_ENOUGH_SEATS` it explains that the original booking is unchanged and offers to choose another slot. The other errors (`CHANGE_CLOSED`, `BOOKING_CLOSED`, `ALREADY_BOOKED`, `RESERVATION_CANCELLED`, `RESERVATION_NOT_FOUND`) are shown as messages above the form.
  - A booking that can no longer be changed (cancelled, or less than 48 hours away) opens a page that explains why, instead of the form.

## Implementation

- Route/controller: `App/backend/src/routes/reservation.routes.js`, `App/backend/src/controllers/reservation.controller.js`
- Business logic: `App/backend/src/services/reservation.service.js`, `App/backend/src/services/tableAssignment.service.js`
- Persistence: `App/backend/src/database/reservation.repository.js`, `App/backend/src/database/slot.repository.js`
- Email: `App/backend/src/services/confirmationEmail.service.js`, `App/backend/src/emails/confirmationEmails.jsx`
- UI pages: `App/frontend/src/pages/MyBookings.jsx`, `App/frontend/src/pages/ChangeBooking.jsx` (routes in `App/frontend/src/App.jsx`, link in `App/frontend/src/components/common/Navbar.jsx`)
- UI components and helpers: `App/frontend/src/components/booking/RequirementsEditor.jsx`, `App/frontend/src/components/booking/RequirementsList.jsx`, `App/frontend/src/utils/bookingFormat.js` (hut-time formatting and requirement validation)
- API client: `App/frontend/src/services/reservationApi.js` (`fetchMyReservations`, `changeReservation`)
- API reference: [API documentation](../api.md)
