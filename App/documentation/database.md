# Mountain Hut — Database Organization

The schema source of truth is [`App/docker/postgres/schema.sql`](../docker/postgres/schema.sql). Apply it once to a new, empty database; it is not a migration runner, because its `ALTER TABLE ... ADD CONSTRAINT` statements are not idempotent. Local development uses PostgreSQL, not MySQL; Docker is optional.

## 1. Database

The database has 5 tables and 1 view.

### 1.1 `app_user`

Stores all registered users. The role tells hikers, employees and wardens apart.

| Column          | Type           | Constraints                                                           | Description                                         |
| --------------- | -------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `id`            | `SERIAL`       | PK                                                                    | Identifier                                          |
| `email`         | `VARCHAR(255)` | NOT NULL, UNIQUE                                                      | Login email, also used for the confirmation (MH-03) |
| `password_hash` | `VARCHAR(64)`  | NOT NULL                                                              | Password hash (never in plain text)                 |
| `salt`          | `VARCHAR(32)`  | NOT NULL                                                              | Salt                                                |
| `first_name`    | `VARCHAR(100)` | NOT NULL                                                              | First name                                          |
| `last_name`     | `VARCHAR(100)` | NOT NULL                                                              | Last name                                           |
| `phone`         | `VARCHAR(10)`  |                                                                       | Phone number, optional                              |
| `role`          | `VARCHAR(20)`  | NOT NULL, default `'hiker'`, CHECK in (`hiker`, `employee`, `warden`) | Role                                                |
| `created_at`    | `TIMESTAMPTZ`  | NOT NULL, default `now()`                                             | Registration date                                   |

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

| Column                 | Type          | Constraints                                                          | Description                                                    |
| ---------------------- | ------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `id`                   | `SERIAL`      | PK                                                                   | Identifier                                                     |
| `hiker_id`             | `INTEGER`     | NOT NULL, FK → `app_user(id)`                                        | Who booked                                                     |
| `slot_id`              | `INTEGER`     | NOT NULL, FK → `slot(id)`                                            | Booked slot                                                    |
| `party_size`           | `INTEGER`     | NOT NULL, CHECK `> 0`                                                | Number of people                                               |
| `status`               | `VARCHAR(20)` | NOT NULL, default `'confirmed'`, CHECK in (`confirmed`, `cancelled`) | Status                                                         |
| `created_at`           | `TIMESTAMPTZ` | NOT NULL, default `now()`                                            | Booking date                                                   |
| `confirmation_sent_at` | `TIMESTAMPTZ` |                                                                      | When the confirmation email was sent (MH-03); NULL if not sent |

### 1.5 `reservation_seat`

How many seats of which table a booking uses. A party can be spread over several tables (e.g. 2 + 3 + 1) and a table can be shared by several bookings.

| Column           | Type      | Constraints                                                     | Description                                                                                                                                                |
| ---------------- | --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reservation_id` | `INTEGER` | PK (with `slot_table_id`), FK → `reservation` ON DELETE CASCADE | Booking                                                                                                                                                    |
| `slot_table_id`  | `INTEGER` | PK (with `reservation_id`), FK → `slot_table`                   | Table used                                                                                                                                                 |
| `slot_id`        | `INTEGER` | NOT NULL                                                        | Slot shared by table and booking: the composite FKs `(reservation_id, slot_id)` and `(slot_table_id, slot_id)` prevent assigning a table from another slot |
| `seats`          | `INTEGER` | NOT NULL, CHECK `> 0`                                           | Seats taken at that table                                                                                                                                  |

### 1.6 View `slot_table_free`

Computes the free seats left at each table, counting only `confirmed` bookings. It is the basis of the availability check (MH-04).

| Column          | Type      | Description  |
| --------------- | --------- | ------------ |
| `slot_id`       | `INTEGER` | Slot         |
| `slot_table_id` | `INTEGER` | Table        |
| `table_number`  | `INTEGER` | Table number |
| `seats`         | `INTEGER` | Total seats  |
| `free_seats`    | `BIGINT`  | Free seats   |

### 1.7 Indexes and application-level rules

The current schema does not declare additional secondary indexes for `slot(start_at)`, `reservation(slot_id)`, or `reservation(hiker_id)`. Primary-key and unique constraints create their own indexes; add any further indexes through a reviewed schema change based on measured query needs.

The rules "at least 2 hours before", "only one confirmed booking per hiker in a slot", and "keep the party together using as few tables as possible" live in application code, not as database constraints. Slot overlap is checked by the slot repository inside a transaction protected by a PostgreSQL advisory lock; it is not an exclusion constraint in the schema.
