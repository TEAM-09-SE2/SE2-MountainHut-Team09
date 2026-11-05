# MH-04 - Check availability

- **Business value:** 975
- **Requirement source:** [stories/MH-04.md](../stories/MH-04.md)

## Purpose and scope

An unauthenticated visitor checks whether a party can be seated for a requested hut-local date and time. The result includes free-seat totals and, when available, a hypothetical seat allocation. The check does not reserve or hold capacity and does not suggest alternative slots.

The public UI route is `/availability`. A successful result can lead a hiker to MH-01 booking; authentication is required only when the visitor proceeds to create the reservation.

## API contract

`GET /api/v1/availability` is public and requires all of these query parameters:

| Parameter | Format | Rule |
| --- | --- | --- |
| `date` | `YYYY-MM-DD` | Must be a real calendar date. |
| `time` | `HH:mm` | 24-hour hut-local time. |
| `partySize` | Integer | Positive safe integer. |

Example:

```text
GET /api/v1/availability?date=2026-11-01&time=12:30&partySize=6
```

The date and time are interpreted in `Europe/Rome`. A slot matches when `start_at <= requested instant < end_at`; a time exactly at the end of a slot belongs to no slot unless another slot starts then.

### Available response

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

### Unavailable response

Domain outcomes still return `200 OK`. `reason` is one of:

| Reason | Meaning | Slot/free-seat fields |
| --- | --- | --- |
| `NO_SLOT` | No slot covers the requested instant. | `slot`, `freeSeats`, and `allocation` are `null`. |
| `NOT_ENOUGH_SEATS` | Total confirmed-booking-adjusted free seats are below `partySize`. | Slot and `freeSeats` are returned; allocation is `null`. |
| `BOOKING_CLOSED` | The slot starts in less than two hours or has already started. | Slot and `freeSeats` are returned; allocation is `null`. |

Missing or invalid query parameters return `400` with error code `INVALID_INPUT`.

## Capacity and allocation calculation

The repository queries `slot_table_free`, whose view subtracts seats used by confirmed reservations. Cancelled reservations do not consume capacity. The service sums the per-table `free_seats` values before deciding whether the requested party can fit.

For an available result, `createAllocation` prefers the smallest single table that can hold the party. If no single table fits, it walks tables in descending free-capacity order and assigns seats until the party is covered. The response exposes `tableNumber` and the number of seats assigned at each table; the UI displays only the seat split.

MH-01 uses a separate `assignTables` implementation. It also prefers a single fitting table and otherwise takes the largest capacity first, then looks for the smallest table that fits the remaining party. Consequently, the hypothetical table numbers can differ from the final booking assignment even when the displayed seat split is equivalent. Availability is advisory, not a hold: another booking can consume seats after the check, and MH-01 recalculates capacity under a slot-row lock when the user submits a booking.

## Frontend behavior

`CheckAvailability` validates the date, time, and party size before requesting the API. It stores the latest search in the URL query string so it can be restored after login/registration. The result distinguishes no slot, closed booking, full capacity, limited capacity, and available capacity.

When availability is positive:

- An unauthenticated visitor is asked to log in or register; the search URL is preserved.
- An authenticated hiker is sent to `/book-table` with date, slot ID, and party size prefilled.
- Staff accounts can check availability but cannot create a hiker booking.

The UI displays the seating split (for example `2 + 3 + 1`) but not table numbers. It does not offer alternative slots.

## Implementation and tests

- UI: `App/frontend/src/pages/CheckAvailability.jsx`, `App/frontend/src/components/availability/AvailabilityResult.jsx`
- API client: `App/frontend/src/services/availabilityApi.js`
- Route/controller: `App/backend/src/routes/availability.routes.js`, `App/backend/src/controllers/availability.controllers.js`
- Business logic/query: `App/backend/src/services/availability.service.js`, `App/backend/src/database/availability.repository.js`
- Capacity view: `App/docker/postgres/schema.sql` (`slot_table_free`)
- Tests: `App/frontend/tests/unit/pages/CheckAvailability.test.jsx`, `App/frontend/tests/unit/components/AvailabilityResult.test.jsx`, `App/frontend/tests/unit/services/availabilityApi.test.js`, and `App/frontend/tests/integration/availability/CheckAvailability.test.jsx`
- API and schema references: [API documentation](../App/documentation/api.md), [database documentation](../App/documentation/database.md)
