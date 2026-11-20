# Backend

The backend is an Express API running on Node.js. PostgreSQL is accessed through the `pg` connection pool; **the application does not use MySQL**. The API reads database, JWT, CORS, and SMTP settings from `App/docker/.env` through `dotenv`.

## Local setup without Docker

1. Start PostgreSQL and create an application role plus an empty `mountainhut_db` database.
2. If `App/docker/.env` does not exist, copy `App/docker/.env.example` to that path. Set the local database values (`DB_HOST=localhost`, `DB_PORT=5432`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) and replace the example `JWT_SECRET`.
3. Apply `App/docker/postgres/schema.sql` once to the empty database. Do not rerun it as a migration; it contains `ALTER TABLE ... ADD CONSTRAINT` statements.
4. From `App/backend`:

   ```powershell
   npm install
   npm run dev
   ```

The API listens on port `4000`; its base path is `/api/v1`. Start the frontend separately from `App/frontend`. See the [application quick start](../README.md) and [repository local setup](../../README.md#local-postgresql-no-docker).

## Optional Docker database

Docker Compose is an alternative to a local PostgreSQL service. From `App/docker`, run `docker compose up -d db`. The Compose image is PostgreSQL 16 and uses port `55432` by default from `.env.example`; configure the backend `.env` to match the selected setup.

Mailpit is included only by `docker-compose.dev.yml`. Without Mailpit or another reachable SMTP service, reservation creation still succeeds but the response may contain `confirmationSent: false`.

## Tests

```powershell
npm test
```

Integration and end-to-end tests require the configured PostgreSQL database. The test suite also includes confirmation-email tests with a local fake SMTP server.

To run against a fresh schema without changing development data:

```powershell
npm run test:isolated
# Run only the employee account scenarios:
npm run test:isolated -- tests/e2e/employee_test.js
```

This command uses the PostgreSQL connection in `App/docker/.env`. The database role must be able to create schemas in that database. It initializes a uniquely named schema from `schema.sql`, runs the tests with that schema as their search path, and drops the schema when the test process exits. No seed data is required.

## Employee accounts and password changes

- `POST /api/v1/staff/employees`: wardens create employees with a temporary password.
- `GET /api/v1/staff/employees`: wardens list employees by last name and first name.
- `PUT /api/v1/auth/password`: authenticated users change their own password using `currentPassword` and `newPassword` (at least eight characters, different from the current password).

Login and `/auth/me` return `mustChangePassword`. Until it is cleared by a successful password change, protected APIs return `403 PASSWORD_CHANGE_REQUIRED`; `/auth/me`, `/auth/logout` and `/auth/password` remain available. Authentication reads the current account role and password flag from PostgreSQL on each request. Passwords are stored only as salted hashes and never returned by these APIs.

These APIs use the existing `app_user.must_change_password` column in the repository schema. Existing databases must already match `App/docker/postgres/schema.sql`; the application does not run migrations automatically. See the [authentication and staff API contracts](../../documentation/api.md#authentication-api-shared-by-all-stories).

## Story implementation guides

- [MH-01 - Book a table](../../documentation/stories_detail/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](../../documentation/stories_detail/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](../../documentation/stories_detail/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](../../documentation/stories_detail/MH-04-check-availability.md)
