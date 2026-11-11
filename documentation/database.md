# Mountain Hut — Database Organization

The schema source of truth is [`App/docker/postgres/schema.sql`](../App/docker/postgres/schema.sql). Apply it once to a new, empty database; it is not a migration runner, because its `ALTER TABLE ... ADD CONSTRAINT` statements are not idempotent. Local development uses PostgreSQL, not MySQL; Docker is optional.

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

The emergency contact is stored as a pair: name and phone are either both set or both NULL. `emergency_contact_name`, `emergency_contact_phone` and `notes` are filled only for hikers; for `employee` and `warden` they stay NULL.

A CHECK constraint keeps the two kinds of users consistent:

- regular user (`is_temporary = false`): `email`, `password_hash` and `salt` are NOT NULL;
- temporary hiker (`is_temporary = true`): `role = 'hiker'`, `email`, `password_hash` and `salt` are NULL, `must_change_password = false`.

`first_name` and `last_name` are required for everybody, temporary hikers included.

Hikers are created in three ways:

- they register themselves on the web;
- staff create a full hiker account while entering a reservation (MH-07): random temporary password and `must_change_password = true`, like employees; after the first login and password change it is a normal account;
- staff create a temporary hiker while entering a reservation (MH-07): only first name, last name and optional phone. A temporary hiker cannot log in and can never be turned into a full account.

Temporary hikers are not deleted: their reservations keep pointing to them and staff can find them again for a later booking.

Employees cannot register: only a warden creates them (role `employee`), with a temporary password and `must_change_password = true`. The flag goes back to `false` when the employee sets a new password, which they must do at their first login. Employee accounts are never deactivated or deleted.

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

| Column                 | Type          | Constraints                                                          | Description                                                                                         |
| ---------------------- | ------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                   | `SERIAL`      | PK                                                                   | Identifier                                                                                          |
| `hiker_id`             | `INTEGER`     | NOT NULL, FK → `app_user(id)`                                        | Who booked                                                                                          |
| `slot_id`              | `INTEGER`     | NOT NULL, FK → `slot(id)`                                            | Booked slot                                                                                         |
| `party_size`           | `INTEGER`     | NOT NULL, CHECK `> 0`                                                | Number of people                                                                                    |
| `status`               | `VARCHAR(20)` | NOT NULL, default `'confirmed'`, CHECK in (`confirmed`, `cancelled`) | Status                                                                                              |
| `created_at`           | `TIMESTAMPTZ` | NOT NULL, default `now()`                                            | Booking date                                                                                        |
| `confirmation_sent_at` | `TIMESTAMPTZ` |                                                                      | When the confirmation email was sent (MH-03); NULL if not sent                                      |
| `updated_at`           | `TIMESTAMPTZ` |                                                                      | Time of the last change by the hiker (MH-06); NULL if never changed                                 |
| `created_by`           | `INTEGER`     | FK → `app_user(id)`                                                  | Staff member who entered the reservation for the hiker (MH-07); NULL if the hiker booked on the web |

### 1.5 `reservation_seat`

How many seats of which table a booking uses. A party can be spread over several tables (e.g. 2 + 3 + 1) and a table can be shared by several bookings.

| Column           | Type      | Constraints                                                     | Description                                                                                                                                                |
| ---------------- | --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reservation_id` | `INTEGER` | PK (with `slot_table_id`), FK → `reservation` ON DELETE CASCADE | Booking                                                                                                                                                    |
| `slot_table_id`  | `INTEGER` | PK (with `reservation_id`), FK → `slot_table`                   | Table used                                                                                                                                                 |
| `slot_id`        | `INTEGER` | NOT NULL                                                        | Slot shared by table and booking: the composite FKs `(reservation_id, slot_id)` and `(slot_table_id, slot_id)` prevent assigning a table from another slot |
| `seats`          | `INTEGER` | NOT NULL, CHECK `> 0`                                           | Seats taken at that table                                                                                                                                  |

### 1.6 `reservation_requirement`

Dietary restrictions and allergies of a booking (MH-05). Each row concerns a subset of the party; a booking can have none or several.

| Column           | Type           | Constraints                                        | Description                                            |
| ---------------- | -------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `id`             | `SERIAL`       | PK                                                 | Identifier                                             |
| `reservation_id` | `INTEGER`      | NOT NULL, FK → `reservation(id)` ON DELETE CASCADE | Booking it belongs to                                  |
| `people_count`   | `INTEGER`      | NOT NULL, CHECK `> 0`                              | How many people of the party this requirement concerns |
| `has_allergies`  | `BOOLEAN`      | NOT NULL, default `false`                          | `true` if special care is needed during preparation    |
| `description`    | `VARCHAR(500)` | NOT NULL, CHECK not empty after trimming           | Details, e.g. "Vegan, peanut allergy"                  |

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
| `expires_at` | `TIMESTAMPTZ` | NOT NULL                                        | Expiry, 1 hour after creation                 |
| `used_at`    | `TIMESTAMPTZ` |                                                 | When the token was used; NULL if not used yet |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()`                       | Creation date                                 |

A token is valid while `used_at` is NULL and `expires_at` is in the future. When a password is reset, all the valid tokens of that user are marked as used.

### 1.8 View `slot_table_free`

Computes the free seats left at each table, counting only `confirmed` bookings. It is the basis of the availability check (MH-04).

| Column          | Type      | Description  |
| --------------- | --------- | ------------ |
| `slot_id`       | `INTEGER` | Slot         |
| `slot_table_id` | `INTEGER` | Table        |
| `table_number`  | `INTEGER` | Table number |
| `seats`         | `INTEGER` | Total seats  |
| `free_seats`    | `BIGINT`  | Free seats   |
