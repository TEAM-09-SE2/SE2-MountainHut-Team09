# MH-02 - Define slot capacity

- **Business value:** 995
- **Requirement source:** MH-02 (shared course requirements)

## Purpose and scope

An employee or warden defines a meal slot by its start/end timestamps and its table layout. Slot durations and start times are flexible; several non-overlapping slots may exist on the same day. Each slot owns its own table list so lunch, dinner, or weather-dependent layouts can differ.

The implementation supports creating a layout directly or copying the table numbers and seat capacities from an existing slot. Copying does not copy reservations.

## Actors and access control

- `POST /api/v1/slots` and `GET /api/v1/slots/:id` require authentication and either the `employee` or `warden` role.
- `GET /api/v1/slots?date=YYYY-MM-DD` remains public for hiker slot discovery (MH-01).
- The UI route is `/staff/slots`, guarded for `employee` and `warden`.

## API contract

### Create a slot with an explicit table layout

`POST /api/v1/slots` accepts ISO 8601 timestamps that include `Z` or an explicit UTC offset. `endAt` must be later than `startAt`; table numbers and seat counts must be positive PostgreSQL integers, and table numbers must be unique within the request.

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

### Create a slot by copying a layout

Exactly one of `tables` and `copyTablesFromSlotId` must be supplied:

```json
{
  "startAt": "2026-11-01T13:00:00+01:00",
  "endAt": "2026-11-01T14:00:00+01:00",
  "copyTablesFromSlotId": 7
}
```

Both variants return `201 Created` with the new slot ID, UTC timestamps, total capacity, and ordered table records.

### Read a slot

`GET /api/v1/slots/:id` is staff-only and returns the slot's timestamps, total capacity, and table records including each table's current `freeSeats`.

### Errors

| HTTP | Error code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Invalid timestamps, interval, table layout, source ID, duplicate table number, or both/neither layout options supplied. |
| 401 | `NOT_AUTHENTICATED` | No valid authenticated session is present. |
| 403 | `FORBIDDEN_ROLE` | The account is not an employee or warden. |
| 404 | `SLOT_NOT_FOUND` | The requested slot or copy source does not exist. |
| 409 | `SLOT_OVERLAP` | The requested interval overlaps an existing slot. |

Adjacent intervals are allowed: a slot ending at 13:00 does not overlap one starting at 13:00. Overlap uses the strict predicate `existing.start_at < new.end_at AND existing.end_at > new.start_at`.

## Persistence and concurrency

The implementation is in `slot.repository.js` and uses a transaction for slot and table writes:

- Slot data is stored in `slot`; table capacity is stored in `slot_table`.
- A PostgreSQL transaction-scoped advisory lock serializes overlap checks and slot creation.
- Explicit table creation inserts the slot and its full table list before committing.
- Layout copying locks the source slot for sharing, inserts a new slot, then copies only the source `slot_table` rows.
- Any insert or validation failure rolls back the transaction.

The `slot_table_free` view derives free seats from confirmed reservations. Slot capacity is therefore the sum of its `slot_table.seats`; current availability is a separate, reservation-dependent value.

## Frontend behavior and current limitation

The `/staff/slots` page loads a selected day's slots, groups table rows by seat capacity for editing, expands the groups into unique table numbers for the API, and supports selecting an existing slot as a copy source. Unsaved slot definitions remain client-side drafts until saved.

The current page initializes its date to `2026-11-01` as a demo-oriented default. Select the intended date when using the page; this initial value is not calculated from the current date.

## Implementation and tests

- UI: `App/frontend/src/pages/SlotCapacity.jsx`
- API client: `App/frontend/src/api/slotsApi.js`
- Routes and validation: `App/backend/src/routes/slot.routes.js`, `App/backend/src/controllers/slot.controllers.js`
- Business logic and persistence: `App/backend/src/services/slot.service.js`, `App/backend/src/database/slot.repository.js`
- Tests: `App/frontend/tests/unit/pages/SlotCapacity.test.jsx`, `App/frontend/tests/integration/api/SlotCapacity.test.jsx`, `App/frontend/tests/integration/routing/SlotCapacity.test.jsx`, and backend slot unit/integration/E2E tests under `App/backend/tests/`
- API reference: [API documentation](../api.md)
