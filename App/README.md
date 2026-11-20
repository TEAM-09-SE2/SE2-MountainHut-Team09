# Mountain Hut application

This directory contains the React/Vite frontend, Express API, PostgreSQL schema, and design prototype. The backend requires PostgreSQL; **MySQL is not used**. Docker is optional for local development.

The application includes MH-01 through MH-08. See the [implementation status](../documentation/implementation-status.md).

## Directory map

| Directory | Contents |
| --- | --- |
| `frontend/` | React pages, API clients, and Vitest unit/integration tests |
| `backend/` | Express routes, controllers, services, SQL repositories, email templates, and Node.js tests |
| `docker/` | Environment example, optional PostgreSQL/Mailpit/Adminer Compose services, schema, and development seed |
| `figmaPrototype/` | Design flows and static screen exports; availability is documented separately from the design |

## Run locally without Docker

1. Start a local PostgreSQL service, create an application role and `mountainhut_db`, then configure `App/docker/.env` with the local connection values, a private `JWT_SECRET`, and `CLIENT_URL=http://localhost:5173`. See the [repository setup guide](../README.md#local-postgresql-no-docker).
2. Apply `docker/postgres/schema.sql` once to a new empty database.
3. Start the backend in one terminal:

   ```powershell
   Set-Location .\App\backend
   npm install
   npm run dev
   ```

4. Start the frontend in another terminal:

   ```powershell
   Set-Location .\App\frontend
   npm install
   npm run dev
   ```

Open `http://localhost:5173`; the API is served at `http://localhost:4000/api/v1`.

For the optional Docker services, follow the [database and SMTP setup](../README.md#optional-docker-database-setup). A working SMTP inbox is needed to obtain password-reset links; a `202` request response does not mean an email was delivered. The application does not run schema migrations automatically.

## Validate locally

From `App/frontend`, run `npm test` and `npm run build`. From `App/backend`, prefer `npm run test:isolated -- --test-concurrency=1` with PostgreSQL running. On PowerShell use `npm.cmd` if script execution policy blocks `npm`. See the [testing guide](../documentation/testing.md) for targeted commands and the known failing backend baseline.

## Developer documentation

- [Documentation index](../documentation/README.md)
- [Implementation status and integration plan](../documentation/implementation-status.md)
- [Backend guide](backend/README.md) and [frontend guide](frontend/README.md)
- [Architecture](../documentation/architecture-diagram.md)
- [API reference](../documentation/api.md)
- [Database organization](../documentation/database.md)
- [MH-01 - Book a table](../documentation/stories_detail/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](../documentation/stories_detail/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](../documentation/stories_detail/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](../documentation/stories_detail/MH-04-check-availability.md)
- [MH-05 - Party requirements](../documentation/stories_detail/MH-05-party-requirements.md)
- [MH-06 - Change a booking](../documentation/stories_detail/MH-06-change-a-booking.md)
- [MH-07 - Reserve for a hiker](../documentation/stories_detail/MH-07-reserve-for-a-hiker.md)
- [MH-08 - Cancellation contract to integrate](../documentation/stories_detail/MH-08-cancel-a-booking.md)
- [Testing](../documentation/testing.md)
