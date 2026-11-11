# MH-05 - Party requirements

- **Requirement source:** MH-05 (shared course requirements)

## User story

As a hiker, I want to specify dietary restrictions and allergies for people in my party, so that the hut can prepare suitable meals safely.

## Purpose and scope

When booking a table (MH-01), the hiker can add a list of requirements. Each requirement concerns a subset of the party and has:

- how many people it concerns (`peopleCount`);
- an allergies flag (`hasAllergies`), a checkbox that makes explicit that special care is needed during preparation;
- a free-text description with the details.

Example for a party of 6:

| People | Allergies | Description |
| --- | --- | --- |
| 1 | yes | Vegan, peanut allergy |
| 1 | yes | Shellfish allergy |
| 2 | no | Vegetarian |

Requirements are entered when the booking is created. The hiker can change them later, up to 48 hours before the slot, as described in [MH-06 - Change a booking](./MH-06-change-a-booking.md).

Staff (`employee` and `warden`) read the requirements together with all the bookings through two new staff APIs.

## Actors and access control

- Entering requirements: the logged-in `hiker` who creates the booking.
- Reading bookings and requirements: staff only. Hikers get `403 FORBIDDEN_ROLE`.

## End-to-end flow

```mermaid
sequenceDiagram
    actor Hiker
    actor Staff
    participant UI as Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant Mail as SMTP provider

    Hiker->>UI: Select slot, party size, add requirements
    UI->>API: POST /api/v1/reservations with requirements
    API->>DB: Begin; lock slot; validate; assign seats
    API->>DB: Insert reservation, reservation_seat, reservation_requirement rows
    API->>DB: Commit
    API->>Mail: Confirmation email listing the requirements
    API-->>UI: 201 reservation with requirements
    Staff->>UI: Open bookings page
    UI->>API: GET /api/v1/reservations?date=YYYY-MM-DD
    API->>DB: Read bookings, hikers, tables, requirements
    API-->>UI: 200 bookings with requirements
```

## API contract

### Requirements in the booking request

`POST /api/v1/reservations` accepts an optional `requirements` list:

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

Validation (`400 INVALID_INPUT` if broken):

- `requirements` missing or empty means no requirements.
- `peopleCount`: integer, at least 1.
- `hasAllergies`: boolean.
- `description`: string, not empty after trimming, at most 500 characters.
- The sum of `peopleCount` must not exceed `partySize`, so a booking has at most `partySize` requirements.

The `201` response contains the saved `requirements`, each with its `id`.

### Staff APIs

| API | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/reservations?date=&slotId=&status=` | staff | All bookings, optionally filtered by day, slot and status |
| `GET /api/v1/reservations/:id` | staff | One booking |

Each booking contains the slot, party size, status, the hiker's details (never `password_hash` or `salt`), the assigned tables, the requirements and a booking-level `hasAllergies` flag that is `true` when at least one requirement has allergies. Requirements with allergies are listed first.

Full request and response formats are in the [API documentation](../api.md#mh-05--party-requirements).

## Data model

Requirements are stored in the new `reservation_requirement` table (see [database.md](../database.md)), one row per requirement, deleted together with the booking. The sum of `people_count` per booking is checked by the backend inside the booking transaction, because it spans several rows.

## Confirmation email (MH-03)

The confirmation email lists the requirements in the "Party requirements" row, one per line, as `<peopleCount> × <description>`. Requirements with allergies come first and are marked `ALLERGY`. The template already supports the list; the confirmation service now fills it from `reservation_requirement`.

## Frontend behavior

- Booking wizard: a "Party requirements" step where the hiker can add and remove requirements, each with a people counter, an "Allergies" checkbox and a description. The total of people cannot exceed the party size. The review step and the success screen show the requirements.
- Staff: a bookings page with filters by day, slot and status, showing for each booking the hiker, party size, tables and requirements, with bookings with allergies clearly highlighted.

## Implementation

- Persistence: `App/backend/src/database/reservation.repository.js`
- Business logic: `App/backend/src/services/reservation.service.js`
- Route/controller: `App/backend/src/routes/reservation.routes.js`, `App/backend/src/controllers/reservation.controller.js`
- Email: `App/backend/src/services/confirmationEmail.service.js`
- UI: `App/frontend/src/components/booking/BookTableWizard.jsx`, new staff bookings page
- API reference: [API documentation](../api.md)
