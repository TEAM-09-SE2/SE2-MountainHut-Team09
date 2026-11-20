# MH-05 - Party requirements

- **Requirement source:** MH-05 (shared course requirements)

## User story

As a hiker, I want to specify dietary restrictions and allergies for people in my party, so that the hut can prepare suitable meals safely.

## Purpose and scope

When booking a table (MH-01), the hiker can add a list of requirements. Staff can enter the same list while booking for a hiker (MH-07), including a temporary guest. Each requirement concerns a subset of the party and has:

- how many people it concerns (`peopleCount`);
- an allergies flag (`hasAllergies`), a checkbox that makes explicit that special care is needed during preparation. The hiker ticks it; it is never derived from the description (course clarification);
- a free-text description with the details.

Example for a party of 6:

| People | Allergies | Description |
| --- | --- | --- |
| 1 | yes | Vegan, peanut allergy |
| 1 | yes | Shellfish allergy |
| 2 | no | Vegetarian |

Requirements are entered when the booking is created. The hiker can change them later, up to 48 hours before the slot, as described in [MH-06 - Change a booking](./MH-06-change-a-booking.md).

Staff (`employee` and `warden`) read the requirements together with all the bookings through a staff API and the staff bookings page.

## Actors and access control

- Entering requirements: the logged-in `hiker` who creates the booking.
- Listing all the bookings with their requirements: staff only. Hikers get `403 FORBIDDEN_ROLE`; they see the requirements of their own bookings in "My bookings" (MH-06).

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
- `description`: string, not empty after trimming, at most 500 characters. It is saved trimmed.
- The sum of `peopleCount` must not exceed `partySize`, so a booking has at most `partySize` requirements.

The `201` response contains the saved `requirements`, each with its `id`.

### Staff API

| API | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/reservations?date=&slotId=&status=` | staff | All bookings, optionally filtered by day, slot and status |

Each booking contains the slot, party size, status, the hiker's details (never `password_hash` or `salt`), the assigned tables, the requirements and a booking-level `hasAllergies` flag that is `true` when at least one requirement has allergies. Requirements with allergies are listed first.

Full request and response formats are in the [API documentation](../api.md#mh-05--party-requirements).

## Data model

Requirements are stored in the new `reservation_requirement` table (see [database.md](../database.md)), one row per requirement, deleted together with the booking. The sum of `people_count` per booking is checked by the backend inside the booking transaction, because it spans several rows.

## Confirmation email (MH-03)

The confirmation email lists the requirements in the "Party requirements" row, one per line, as `<peopleCount> × <description>`. Requirements with allergies come first and are marked `ALLERGY`, e.g. `1 × ALLERGY: Vegan, peanut allergy`. The confirmation service reads them from `reservation_requirement`; the row is left out when the booking has none. The "booking updated" email (MH-06) lists them in the same way.

## Frontend behavior

- **Booking wizard** (`/book-table`, MH-01): "Requirements" is the fourth of five steps (Date & Time, Guests, Assignment, Requirements, Confirm).
  - The step is optional: with no entries its button reads "Skip and review".
  - The hiker adds and removes entries, each with a people counter, an "Allergy or intolerance" checkbox and a description (at most 500 characters). A line shows how many people of the party the entries cover.
  - An entry without people or description, or a total above the party size, shows a message next to the field and blocks the next step.
  - The side summary counts the requirements and those with allergies.
  - The review step lists the requirements, allergies first, marked with an icon and "(allergy)", not only by colour. If any has allergies, a red notice says that the hut will take special care. The success screen lists the saved requirements.
  - On `400 INVALID_INPUT` the wizard shows the API message and asks the hiker to go back and check the details.
- **Staff bookings page** (`/staff/bookings`, `employee` and `warden`): reached from "View bookings" on the staff home page and from the "Bookings" link in the navigation bar.
  - Filters: day (today in hut time by default), slot of that day (from `GET /api/v1/slots`) and status (all, confirmed, cancelled). The page always sends the day.
  - Bookings are grouped by slot. A summary line shows the number of bookings, the people in confirmed bookings and how many confirmed bookings have allergies.
  - Each booking shows the `MH-<id>` reference, the status, the hiker's name, phone and email (temporary hikers are marked), who entered it (MH-07), when and by whom it was cancelled (MH-08), the party size, the tables with their seats, the requirements (allergies first, as in the wizard) and the hiker's notes.
  - Confirmed bookings with allergies have a red border and an "Allergies · special care needed" banner. Cancelled bookings never show the banner, since no meal is prepared for them.
  - If loading fails, the page shows the error with a "Retry" button.

## Implementation

- Validation: `App/backend/src/utils/reservationValidation.js` (shared requirement validation), `App/backend/src/controllers/reservation.controller.js` (web booking and staff list filters), `App/backend/src/controllers/staffReservations.controller.js` (staff booking)
- Business logic: `App/backend/src/services/reservation.service.js` (requirements saved in the booking transaction, staff list)
- Staff booking: `App/backend/src/services/staffReservations.service.js` (new/existing hiker, reservation, seats, and requirements in one transaction)
- Persistence: `App/backend/src/database/reservation.repository.js` (`reservation_requirement` rows, staff list with hikers, tables and requirements)
- Route: `App/backend/src/routes/reservation.routes.js` (`GET /api/v1/reservations`, staff only)
- Email: `App/backend/src/services/confirmationEmail.service.js`, `App/backend/src/emails/confirmationEmails.jsx`
- UI pages: `App/frontend/src/components/booking/BookTableWizard.jsx` (requirements step), `App/frontend/src/pages/StaffBookings.jsx` (route in `App/frontend/src/App.jsx`, links in `App/frontend/src/components/common/Navbar.jsx` and `App/frontend/src/pages/StaffHome.jsx`)
- UI components and helpers, shared with MH-06: `App/frontend/src/components/booking/RequirementsEditor.jsx`, `App/frontend/src/components/booking/RequirementsList.jsx`, `App/frontend/src/utils/bookingFormat.js` (requirement validation)
- API client: `App/frontend/src/services/reservationApi.js` (`createReservation`, `fetchStaffReservations`)
- Backend tests: `App/backend/tests/unit/controllers/reservation.controllers_test.js`, `App/backend/tests/unit/repositories/requirements.repository_test.js`, `App/backend/tests/integration/repository_and_service/reservation_test.js`, `App/backend/tests/integration/service_and_controller/staff_reservations_test.js`, `App/backend/tests/e2e/requirements_test.js`; requirements in the email: `App/backend/tests/unit/services/confirmation.services_test.js`, `App/backend/tests/integration/service_and_controller/confirmation_test.js`
- Frontend tests: `App/frontend/tests/unit/components/BookTableWizard.test.jsx` (requirements step), `App/frontend/tests/unit/components/RequirementsEditor.test.jsx`, `App/frontend/tests/unit/components/RequirementsList.test.jsx`, `App/frontend/tests/unit/utils/bookingFormat.test.js`, `App/frontend/tests/integration/booking/Requirements.test.jsx`
- API reference: [API documentation](../api.md)
