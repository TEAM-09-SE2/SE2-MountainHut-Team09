# Backend

The backend is an Express API running on Node.js. PostgreSQL is accessed through the `pg` connection pool; **the application does not use MySQL**. The API reads database, JWT, CORS, and SMTP settings from `App/docker/.env` through `dotenv`.

See the [implementation status](../../documentation/implementation-status.md) for the supported flows.

## Local setup without Docker

1. Start PostgreSQL and create an application role plus an empty `mountainhut_db` database.
2. If `App/docker/.env` does not exist, copy `App/docker/.env.example` to that path. Set the local database values (`DB_HOST=localhost`, `DB_PORT=5432`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`), replace the example `JWT_SECRET`, and set `CLIENT_URL` to the frontend origin used for CORS and password-reset links.
3. Apply `App/docker/postgres/schema.sql` once to the empty database. Do not rerun it as a migration; it contains `ALTER TABLE ... ADD CONSTRAINT` statements.
4. From `App/backend`:

   ```powershell
   npm install
   npm run dev
   ```

The API listens on port `4000`; its base path is `/api/v1`. Start the frontend separately from `App/frontend`. See the [application quick start](../README.md) and [repository local setup](../../README.md#local-postgresql-no-docker).

## Optional Docker database

Docker Compose is an alternative to a local PostgreSQL service. From `App/docker`, run `docker compose up -d db`. The Compose image is PostgreSQL 16 and uses port `55432` by default from `.env.example`; configure the backend `.env` to match the selected setup.

Mailpit is included only by `docker-compose.dev.yml`. Start it with `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` from `App/docker`; its inbox is `http://localhost:8025`. That override also loads development seed data when a fresh database volume is initialized. Without reachable SMTP, bookings still commit with `confirmationSent: false`, and recovery requests return `202` without delivering a reset link.

## Components and endpoints

| Area | Main modules | Behavior |
| --- | --- | --- |
| HTTP configuration | `src/app.js`, `src/server.js` | JSON parsing, CORS, cookies, routes, centralized errors, and listener |
| Authentication/recovery | `auth.routes.js`, `auth.controller.js`, `auth.service.js`, `auth.repository.js` | Registration, sessions, mandatory password change, and email recovery |
| Staff booking | `staff.routes.js`, `staffReservations.controller.js`, `staffReservations.service.js`, `staffReservations.repository.js` | `POST /api/v1/staff/reservations`; account/guest creation and booking in one transaction |
| Hiker search | `hikers.controller.js`, `hikers.service.js`, `hikers.repository.js` | `GET /api/v1/staff/hikers?q=` for employees and wardens |
| Reservations/requirements | `reservation.routes.js`, `reservation.controller.js`, `reservation.service.js`, `reservation.repository.js` | Hiker booking and changes, booking lists, and hiker and staff cancellations |
| Slots/availability | `slot.*`, `availability.*`, `tableAssignment.service.js` | Slot/table creation, advisory availability, and allocation under slot locks |
| Email | `confirmationEmail.service.js`, `passwordResetEmail.service.js`, `emails/` | Booking confirmation, update and cancellation emails, and password recovery |
| Employee management | `staff.controller.js`, `staff.service.js`, `staff.repository.js` | Employee listing and creation for wardens |

Modules live under `src/routes`, `src/controllers`, `src/services`, and `src/database`. `staff.routes.js` declares `/staff/...` paths and is mounted once at `/api/v1`.

## Runtime configuration

| Variables | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection; match the selected local/Docker setup |
| `JWT_SECRET` | Signs/verifies login cookies; replace the example value |
| `CLIENT_URL` | Browser CORS origin and base URL for `/reset-password?token=...` |
| `PORT`, `HOST` | Listener; default `4000` and `0.0.0.0` |
| `NODE_ENV` | Cookie `secure` is enabled when set to `production` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | SMTP adapter settings; defaults in `.env.example` target local Mailpit |

The backend loads the environment through the database connection module before server startup. Restart the process after editing `.env`. Frontend API clients currently use `http://localhost:4000/api/v1`; changing `PORT` or `CLIENT_URL` alone does not change those client URLs.

## Tests

```powershell
npm run test:isolated -- --test-concurrency=1
```

Integration and end-to-end tests require PostgreSQL. The email tests use mocks or a local fake SMTP server. `npm test` bypasses schema isolation and runs directly against the configured database.

To run against a fresh schema without changing development data:

```powershell
npm run test:isolated
# Bound each file while diagnosing hangs:
npm run test:isolated -- --test-concurrency=1 --test-timeout=15000
# Run only the employee account scenarios:
npm run test:isolated -- tests/e2e/staff_test.js tests/e2e/password_test.js
```

This command uses the PostgreSQL connection in `App/docker/.env`. The database role must be able to create schemas in that database. It initializes a uniquely named schema from `schema.sql`, runs the tests with that schema as their search path, and drops the schema when the test process exits. No seed data is required.

See the [testing guide](../../documentation/testing.md) for the test commands and integration scenarios.

## Employee accounts and password changes

- `POST /api/v1/staff/employees`: wardens create employees with a temporary password.
- `GET /api/v1/staff/employees`: wardens list employees by last name and first name.
- `PUT /api/v1/auth/password`: authenticated users change their own password using `currentPassword` and `newPassword` (at least eight characters, different from the current password).

Login and `/auth/me` return `mustChangePassword`. While the flag is true, protected APIs return `403 PASSWORD_CHANGE_REQUIRED`. Profile, logout, and password change remain accessible. Authentication reads the current role and flag from PostgreSQL on each request. Passwords are stored as salted hashes.

These APIs use the existing `app_user.must_change_password` column in the repository schema. Existing databases must already match `App/docker/postgres/schema.sql`; the application does not run migrations automatically. See the [authentication and staff API contracts](../../documentation/api.md#authentication-api-shared-by-all-stories).

## Staff-created hikers and password recovery

MH-07 accepts exactly one of `hikerId`, `newHiker`, or `temporaryHiker` in a staff reservation. A new full hiker receives a generated 12-character password returned once to staff, with `must_change_password = true`. A temporary hiker has no email or credentials. Allocation uses the same table policy as web booking, but staff may book until the slot starts instead of closing two hours beforehand.

`POST /api/v1/auth/password-reset/request` returns `202` for valid email input whether or not an account exists. Existing users receive a 24-hour token through SMTP, stored only as a SHA-256 hash. `POST /api/v1/auth/password-reset/confirm` atomically replaces credentials, clears the flag, and consumes the presented token plus other still-valid tokens for that user. Account locks serialize token creation and reset confirmation. Email failure is logged without revealing account existence in the normal request response.

## Story implementation guides

- [MH-01 - Book a table](../../documentation/stories_detail/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](../../documentation/stories_detail/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](../../documentation/stories_detail/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](../../documentation/stories_detail/MH-04-check-availability.md)
- [MH-05 - Party requirements](../../documentation/stories_detail/MH-05-party-requirements.md)
- [MH-06 - Change a booking](../../documentation/stories_detail/MH-06-change-a-booking.md)
- [MH-07 - Reserve for a hiker](../../documentation/stories_detail/MH-07-reserve-for-a-hiker.md)
- [MH-08 - Cancellation contract](../../documentation/stories_detail/MH-08-cancel-a-booking.md)
- [Complete documentation index](../../documentation/README.md)
