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

## Story implementation guides

- [MH-01 - Book a table](../../documentation/stories_detail/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](../../documentation/stories_detail/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](../../documentation/stories_detail/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](../../documentation/stories_detail/MH-04-check-availability.md)