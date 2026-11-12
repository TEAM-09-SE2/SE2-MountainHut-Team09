# MH-01 - Book a table

- **Business value:** 1000
- **Requirement source:** MH-01 (shared course requirements)

## Purpose and scope

A registered hiker creates one reservation for a meal slot and a party size. The system assigns seats from the slot's current free capacity and returns a stable booking reference. Table layouts are slot-specific, and tables may be shared by different parties.

This guide describes the implemented booking path. Changing, cancelling, or booking on behalf of another person belongs to later stories.

## Actors and access control

- Slot discovery is public.
- Creating a reservation requires an authenticated user with the `hiker` role.
- `employee` and `warden` users cannot use this endpoint to create a hiker reservation.
- Authentication is session-cookie based. The frontend sends requests with `credentials: "include"`.

The UI route is `/book-table`, guarded by `ProtectedRoute` for the `hiker` role.

## End-to-end flow

```mermaid
sequenceDiagram
    actor Hiker
    participant UI as BookTableWizard
    participant API as Express API
    participant DB as PostgreSQL
    participant Mail as SMTP provider

    Hiker->>UI: Select date, slot, party size, requirements
    UI->>API: GET /api/v1/slots?date=YYYY-MM-DD
    API->>DB: Read slots and free-seat totals
    DB-->>UI: Slot list
    Hiker->>UI: Confirm booking
    UI->>API: POST /api/v1/reservations (cookie)
    API->>DB: Begin; lock slot; validate; assign seats
    API->>DB: Insert reservation, reservation_seat and reservation_requirement rows
    API->>DB: Commit
    API->>Mail: Send MH-<reservation id> confirmation
    Mail-->>API: Sent or failed
    API-->>UI: 201 reservation and confirmationSent
```

The confirmation email is an MH-03 side effect. SMTP failure does not undo a committed booking; see [MH-03 - Receive confirmation](./MH-03-receive-confirmation.md).

## API contract

### List slots for a day

`GET /api/v1/slots?date=YYYY-MM-DD` is public. `date` is interpreted in the hut's `Europe/Rome` time zone. The response is an ordered array containing `id`, `startAt`, `endAt`, `totalSeats`, `freeSeats`, and `bookable`.

`bookable` is false when fewer than two hours remain before the slot starts. The client should still inspect `freeSeats`; a slot can be bookable by time but have no capacity.

### Create a reservation

`POST /api/v1/reservations` requires a hiker session and accepts:

```json
{
  "slotId": 7,
  "partySize": 6,
  "requirements": [
    { "peopleCount": 2, "hasAllergies": false, "description": "Vegetarian" }
  ]
}
```

`slotId` and `partySize` must be positive integers. `requirements` is optional; its rules are described in [MH-05 - Party requirements](./MH-05-party-requirements.md). A successful response is `201 Created`:

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
    { "id": 14, "peopleCount": 2, "hasAllergies": false, "description": "Vegetarian" }
  ],
  "confirmationSent": false
}
```

The backend response includes the seat assignment for operational use. The current hiker confirmation screen deliberately does not display table numbers; it displays the `MH-<id>` reference, date, time, party size, and email delivery status.

### Domain errors

| HTTP | Error code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | `slotId` or `partySize` is missing, non-integer, or less than 1, or `requirements` is not valid (MH-05). |
| 401 | `NOT_AUTHENTICATED` | No valid authenticated session is present. |
| 403 | `FORBIDDEN_ROLE` | The authenticated account is not a hiker. |
| 404 | `SLOT_NOT_FOUND` | The requested slot does not exist. |
| 409 | `ALREADY_BOOKED` | The hiker already has a confirmed reservation for this slot. |
| 409 | `NOT_ENOUGH_SEATS` | The sum of free seats is smaller than the party size. |
| 422 | `BOOKING_CLOSED` | The slot has started or starts in less than two hours. |

The API error envelope is `{ "error": "CODE", "message": "..." }`.

## Allocation and transaction semantics

The booking service performs the validation and writes in one PostgreSQL transaction:

1. Begin a transaction and lock the selected `slot` row with `SELECT ... FOR UPDATE`.
2. Read the slot's bookable state and reject a missing or closed slot.
3. Reject an existing confirmed booking by the same hiker for that slot.
4. Read free seats from `slot_table_free` and calculate an assignment.
5. Insert one `reservation` row, one `reservation_seat` row per assigned table and one `reservation_requirement` row per requirement (MH-05).
6. Commit; any failure before commit rolls back the reservation, its seat rows and its requirements.

The slot-row lock serializes competing booking attempts for the same slot. A party is kept at one table when a single table can fit it, choosing the smallest such free capacity. Otherwise, the algorithm consumes the largest free tables first and seats the remainder at the smallest table that fits it. Free capacity, not table ownership, is used, so tables can be shared.

Relevant constraints are in `App/docker/postgres/schema.sql`: positive party and seat counts, foreign keys, unique `(slot_id, table_number)`, and composite foreign keys preventing a reservation from being assigned to a table belonging to another slot.

## Frontend behavior

`BookTableWizard` loads slots for the selected date, collects party size and the optional party requirements (MH-05), and submits the selected slot. In the requirements step the hiker adds and removes requirements, each with a people counter, an "Allergies" checkbox and a description; the total of people cannot exceed the party size. If launched from availability, it can receive the date, slot ID, and party size as route state and preselect the slot. The review step and the success state show the requirements, with allergies highlighted. The success state uses the same `MH-<id>` reference as the email and distinguishes a confirmed booking from email delivery success.

## Implementation and tests

- UI: `App/frontend/src/components/booking/BookTableWizard.jsx`
- API client: `App/frontend/src/services/reservationApi.js`
- Route/controller: `App/backend/src/routes/reservation.routes.js`, `App/backend/src/controllers/reservation.controller.js`
- Business logic: `App/backend/src/services/reservation.service.js` (also validates and saves the party requirements, MH-05), `App/backend/src/services/tableAssignment.service.js`
- Persistence: `App/backend/src/database/reservation.repository.js` (also writes `reservation_requirement`), `App/backend/src/database/slot.repository.js`
- Frontend tests: `App/frontend/tests/unit/components/BookTableWizard.test.jsx`, `App/frontend/tests/unit/services/reservationApi.test.js`
- Party requirements: [MH-05 - Party requirements](./MH-05-party-requirements.md)
- API reference: [API documentation](../api.md)
