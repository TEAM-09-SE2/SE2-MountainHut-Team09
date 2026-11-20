# Mountain Hut — Database Organization

The schema source of truth is [`App/docker/postgres/schema.sql`](../App/docker/postgres/schema.sql). Apply it once to a new, empty database; it is not a migration runner, because its `ALTER TABLE ... ADD CONSTRAINT` statements are not idempotent. Local development uses PostgreSQL, not MySQL; Docker is optional.

This guide describes the schema on `mh07/feat/main`. Schema support does not establish endpoint availability: employee/password operations have regressions and MH-08 cancellation code is absent. See the [implementation status](implementation-status.md).

For a new disposable development database, initialize from the current schema. For an existing database whose data must be retained, compare the schemas and apply a reviewed migration separately; the application provides no migration runner. Recreating a Docker volume or database loses its data and is only appropriate for a disposable setup. `seed.sql` is optional development data and starts with `TRUNCATE ... RESTART IDENTITY CASCADE`; do not apply it to a database whose contents must be preserved.

## 1. Database

The database has 7 tables and 1 view.

### 1.1 `app_user`

Stores all users: registered users who log in, and temporary hikers entered by staff (MH-07) who cannot log in. The role tells hikers, employees and wardens apart.

| Column                    | Type            | Constraints                                                           | Description                                                                                |
| ------------------------- | --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `id`                      | `SERIAL`        | PK                                                                    | Identifier                                                                                 |
| `email`                   | `VARCHAR(255)`  | UNIQUE; NOT NULL unless `is_temporary`                                | Login email, also used for the confirmation (MH-03); NULL for temporary hikers             |
| `password_hash`           | `VARCHAR(64)`   | NOT NULL unless `is_temporary`                                        | Password hash (never in plain text); NULL for temporary hikers                             |
| `salt`                    | `VARCHAR(32)`   | NOT NULL unless `is_temporary`                                        | Salt; NULL for temporary hikers                                                            |
| `first_name`              | `VARCHAR(100)`  | NOT NULL                                                              | First name                                                                                 |
| `last_name`               | `VARCHAR(100)`  | NOT NULL                                                              | Last name                                                                                  |
| `phone`                   | `VARCHAR(10)`   |                                                                       | Phone number, optional                                                                     |
| `emergency_contact_name`  | `VARCHAR(100)`  | CHECK: NULL if and only if `emergency_contact_phone` is NULL          | Full name of the emergency contact, optional (hikers only)                                 |
| `emergency_contact_phone` | `VARCHAR(10)`   | CHECK: NULL if and only if `emergency_contact_name` is NULL           | Phone number of the emergency contact, optional (hikers only)                              |
| `notes`                   | `VARCHAR(1000)` |                                                                       | Free notes given by the hiker at registration, optional (hikers only)                      |
| `must_change_password`    | `BOOLEAN`       | NOT NULL, default `false`                                             | `true` while the user still has a temporary password set by the warden or by staff (MH-07) |
| `is_temporary`            | `BOOLEAN`       | NOT NULL, default `false`                                             | `true` for a temporary hiker entered by staff with minimal info (MH-07)                    |
| `role`                    | `VARCHAR(20)`   | NOT NULL, default `'hiker'`, CHECK in (`hiker`, `employee`, `warden`) | Role                                                                                       |
| `created_at`              | `TIMESTAMPTZ`   | NOT NULL, default `now()`                                             | Registration date                                                                          |

The emergency contact is stored as a pair: name and phone are either both set or both NULL. `emergency_contact_name`, `emergency_contact_phone` and `notes` are filled only for hikers; for `employee` and `warden` they stay NULL. This "hikers only" rule is applied by the backend, not by a database constraint.

A CHECK constraint keeps the two kinds of users consistent:

- regular user (`is_temporary = false`): `email`, `password_hash` and `salt` are NOT NULL;
- temporary hiker (`is_temporary = true`): `role = 'hiker'`, `email`, `password_hash` and `salt` are NULL, `must_change_password = false`.

```sql
CHECK (
  (is_temporary = false AND email IS NOT NULL AND password_hash IS NOT NULL AND salt IS NOT NULL)
  OR
  (is_temporary = true AND role = 'hiker' AND email IS NULL AND password_hash IS NULL
   AND salt IS NULL AND must_change_password = false)
)
CHECK ((emergency_contact_name IS NULL) = (emergency_contact_phone IS NULL))
```

`email` stays UNIQUE: PostgreSQL allows several NULL values in a UNIQUE column, so many temporary hikers without email are fine.

`first_name` and `last_name` are required for everybody, temporary hikers included.

Hikers are created in three ways:

- they register themselves on the web;
- staff create a full hiker account while entering a reservation (MH-07): random temporary password and `must_change_password = true`, like employees; after the first login and password change it is a normal account;
- staff create a temporary hiker while entering a reservation (MH-07): only first name, last name and optional phone. A temporary hiker cannot log in and can never be turned into a full account.

Temporary hikers are not deleted: their reservations keep pointing to them and staff can find them again for a later booking.

The employee-account contract requires warden-created employees (`role = 'employee'`) with a temporary password and `must_change_password = true`. The corresponding routes are currently absent, and ordinary password change is broken. Seeded/existing staff can still authenticate. Password-reset confirmation clears the flag. No employee deactivation/deletion API is implemented.

Staff (`employee` and `warden`) can read every hiker column except `password_hash` and `salt`, which never leave the backend. The notes may contain personal or health information (e.g. allergies), so they are shown only to the hiker and to staff.

### 1.2 `slot`

A meal service time slot. Start time and duration are free, and the same meal can have several slots (MH-02).

| Column       | Type          | Constraints                         | Description                 |
| ------------ | ------------- | ----------------------------------- | --------------------------- |
| `id`         | `SERIAL`      | PK                                  | Identifier                  |
| `start_at`   | `TIMESTAMPTZ` | NOT NULL                            | Slot start                  |
| `end_at`     | `TIMESTAMPTZ` | NOT NULL, CHECK `end_at > start_at` | Slot end                    |
| `created_by` | `INTEGER`     | FK → `app_user(id)`                 | Staff member who created it |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()`           | Creation date               |

### 1.3 `slot_table`

The tables of a slot. Each slot has its own layout, because the requirements say it can change between lunch and dinner or with the weather. To reuse the list of another slot, its rows are copied.

| Column         | Type      | Constraints                                 | Description        |
| -------------- | --------- | ------------------------------------------- | ------------------ |
| `id`           | `SERIAL`  | PK                                          | Identifier         |
| `slot_id`      | `INTEGER` | NOT NULL, FK → `slot(id)` ON DELETE CASCADE | Slot it belongs to |
| `table_number` | `INTEGER` | NOT NULL, UNIQUE with `slot_id`             | Table number       |
| `seats`        | `INTEGER` | NOT NULL, CHECK `> 0`                       | Seats at the table |

### 1.4 `reservation`

A hiker's booking for a slot (MH-01).

| Column                 | Type          | Constraints                                                                | Description                                                                                         |
| ---------------------- | ------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                   | `SERIAL`      | PK                                                                         | Identifier                                                                                          |
| `hiker_id`             | `INTEGER`     | NOT NULL, FK → `app_user(id)`                                              | Who booked                                                                                          |
| `slot_id`              | `INTEGER`     | NOT NULL, FK → `slot(id)`                                                  | Booked slot                                                                                         |
| `party_size`           | `INTEGER`     | NOT NULL, CHECK `> 0`                                                      | Number of people                                                                                    |
| `status`               | `VARCHAR(20)` | NOT NULL, default `'confirmed'`, CHECK in (`confirmed`, `cancelled`)       | Status; `cancelled` after a cancellation (MH-08)                                                    |
| `created_at`           | `TIMESTAMPTZ` | NOT NULL, default `now()`                                                  | Booking date                                                                                        |
| `confirmation_sent_at` | `TIMESTAMPTZ` |                                                                            | When the confirmation email was sent (MH-03); NULL if not sent                                      |
| `updated_at`           | `TIMESTAMPTZ` |                                                                            | Time of the last change by the hiker (MH-06); NULL if never changed                                 |
| `created_by`           | `INTEGER`     | FK → `app_user(id)`                                                        | Staff member who entered the reservation for the hiker (MH-07); NULL if the hiker booked on the web |
| `cancelled_at`         | `TIMESTAMPTZ` | CHECK: NOT NULL if and only if `status = 'cancelled'`                      | When the booking was cancelled (MH-08); NULL if not cancelled                                       |
| `cancelled_by`         | `INTEGER`     | FK → `app_user(id)`; CHECK: NOT NULL if and only if `status = 'cancelled'` | Who cancelled: the hiker or a staff member (MH-08); NULL if not cancelled                           |

```sql
CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
CHECK ((status = 'cancelled') = (cancelled_by IS NOT NULL))
```

A cancelled booking always has both `cancelled_at` and `cancelled_by`, and a confirmed booking has neither. Foreign keys ensure these user IDs exist, not that they have a particular role. MH-07 validates the reservation creator as staff. Cancellation authorization belongs to the MH-08 implementation to integrate; it is not enforced by an available cancellation route on this branch.

The MH-08 contract retains cancelled bookings and their seat/requirement rows as history. The schema and availability view already support this: non-confirmed reservations do not consume seats. Seeded cancelled rows set both cancellation fields, with `cancelled_by` pointing to the hiker, to satisfy the constraints. This branch can read that history but has no cancellation POST route.

The schema has no unique constraint for one confirmed reservation per hiker/slot, and no constraint that sums seat allocations against capacity. Booking services enforce both rules under slot-row locks. Direct SQL writes must preserve these invariants too.

### 1.5 `reservation_seat`

How many seats of which table a booking uses. A party can be spread over several tables (e.g. 2 + 3 + 1) and a table can be shared by several bookings.

| Column           | Type      | Constraints                                                     | Description                                                                                                                                                |
| ---------------- | --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reservation_id` | `INTEGER` | PK (with `slot_table_id`), FK → `reservation` ON DELETE CASCADE | Booking                                                                                                                                                    |
| `slot_table_id`  | `INTEGER` | PK (with `reservation_id`), FK → `slot_table`                   | Table used                                                                                                                                                 |
| `slot_id`        | `INTEGER` | NOT NULL                                                        | Slot shared by table and booking: the composite FKs `(reservation_id, slot_id)` and `(slot_table_id, slot_id)` prevent assigning a table from another slot |
| `seats`          | `INTEGER` | NOT NULL, CHECK `> 0`                                           | Seats taken at that table                                                                                                                                  |

The composite foreign key `(reservation_id, slot_id)` has no `ON UPDATE CASCADE`. When a booking moves to another slot (MH-06), its `reservation_seat` rows must be deleted before `reservation.slot_id` is updated, then the new rows are inserted. The foreign keys do not need to change.

### 1.6 `reservation_requirement`

Dietary restrictions and allergies of a booking (MH-05). Each row concerns a subset of the party; a booking can have none or several.

| Column           | Type           | Constraints                                        | Description                                            |
| ---------------- | -------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `id`             | `SERIAL`       | PK                                                 | Identifier                                             |
| `reservation_id` | `INTEGER`      | NOT NULL, FK → `reservation(id)` ON DELETE CASCADE | Booking it belongs to                                  |
| `people_count`   | `INTEGER`      | NOT NULL, CHECK `> 0`                              | How many people of the party this requirement concerns |
| `has_allergies`  | `BOOLEAN`      | NOT NULL, default `false`                          | `true` if special care is needed during preparation    |
| `description`    | `VARCHAR(500)` | NOT NULL, CHECK `length(trim(description)) > 0`    | Details, e.g. "Vegan, peanut allergy"                  |

The sum of `people_count` of a booking must not exceed its `party_size`. This rule spans several rows, so the backend checks it inside the booking transaction rather than with a constraint. Requirements are written when the booking is created and replaced as a whole when the hiker changes them (MH-06).

Example: a party of 6 with three requirements.

| `people_count` | `has_allergies` | `description`         |
| -------------- | --------------- | --------------------- |
| 1              | `true`          | Vegan, peanut allergy |
| 1              | `true`          | Shellfish allergy     |
| 2              | `false`         | Vegetarian            |

### 1.7 `password_reset_token`

Single-use tokens for password recovery via email (MH-07). Only the hash of the token is stored; the token itself is only in the email link.

| Column       | Type          | Constraints                                     | Description                                   |
| ------------ | ------------- | ----------------------------------------------- | --------------------------------------------- |
| `id`         | `SERIAL`      | PK                                              | Identifier                                    |
| `user_id`    | `INTEGER`     | NOT NULL, FK → `app_user(id)` ON DELETE CASCADE | User who asked for the reset                  |
| `token_hash` | `VARCHAR(64)` | NOT NULL, UNIQUE                                | SHA-256 hash of the token sent by email       |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL                                        | Expiry set by the service to 24 hours after token creation; not a schema default |
| `used_at`    | `TIMESTAMPTZ` |                                                 | When the token was used; NULL if not used yet |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()`                       | Creation date                                 |

A token is valid while `used_at` is NULL and `expires_at` is in the future. When a password is reset, all the valid tokens of that user are marked as used.

`requestPasswordReset` generates 32 random bytes, encodes them as a 64-character hexadecimal token, and stores its SHA-256 hash. The raw token exists in the emailed frontend URL, not in the database. The repository uses the database clock for expiry checks. Creating a new token does not invalidate older links immediately.

Token creation locks the user row before inserting. Reset confirmation locks that same user row, rechecks the presented token and expiry, and atomically updates the password hash/salt, clears `must_change_password`, and marks unexpired unused tokens as used. This serializes concurrent confirmations and prevents the presented token from being consumed twice. Expired rows are retained; no scheduled token cleanup is implemented.

### 1.8 View `slot_table_free`

Computes the free seats left at each table, counting only `confirmed` bookings, so the seats of a cancelled booking (MH-08) are free again. It is the basis of the availability check (MH-04).

| Column          | Type      | Description  |
| --------------- | --------- | ------------ |
| `slot_id`       | `INTEGER` | Slot         |
| `slot_table_id` | `INTEGER` | Table        |
| `table_number`  | `INTEGER` | Table number |
| `seats`         | `INTEGER` | Total seats  |
| `free_seats`    | `BIGINT`  | Free seats   |

## Transactions and local verification

- MH-01 and MH-07 lock a slot before checking confirmed duplicates and reading free seats. MH-07 creates the new hiker, reservation, seats, and requirements in the same transaction; a failure rolls all of them back.
- MH-06 locks the owned booking and involved slots in ascending ID order. Moving a booking deletes its old seat rows before changing `slot_id`, then inserts the new allocation to satisfy the composite foreign keys.
- Staff reservation listing uses a read-only repeatable-read transaction so booking, table, and requirement queries share a snapshot.
- Confirmation/update email sends happen after booking transactions commit and release their clients. SMTP failure does not roll back a reservation.
- The [isolated test runner](testing.md#backend) applies this schema to a temporary search path and drops that schema when it finishes. It does not require seed data.
