# Mountain Hut application

This directory contains the React/Vite frontend, Express API, PostgreSQL schema, and design prototype. Docker is optional for local development. The release is a single Docker image: see [Run the release with Docker](../README.md#run-the-release-with-docker), and the [Docker release guide](../documentation/docker-release.md) to build or publish it.

The application includes MH-01 through MH-08. See the [implementation status](../documentation/implementation-status.md).

## Directory map

| Directory | Contents |
| --- | --- |
| `frontend/` | React pages, API clients, and Vitest unit/integration tests |
| `backend/` | Express routes, controllers, services, SQL repositories, email templates, and Node.js tests |
| `docker/` | Environment example, optional PostgreSQL/Mailpit/Adminer Compose services, schema, development seed, and the release image (`Dockerfile`, `start.sh`, `secrets.env.example`) |
| `figmaPrototype/` | Design flows and static screen exports; availability is documented separately from the design |

## Run locally without Docker

1. Start a local PostgreSQL service, create an application role and `mountainhut_db`, then configure `App/docker/.env` with the local connection values, a private `JWT_SECRET`, and `CLIENT_URL=http://localhost:5173`. See the [repository setup guide](../README.md#local-postgresql-no-docker).
2. Apply `docker/postgres/schema.sql` once to the empty database. For a disposable demo database, also apply `docker/postgres/seed.sql` to load test users and slots.
3. Run the backend commands in one terminal at the repository root.

   ```powershell
   Set-Location .\App\backend
   npm.cmd ci
   $env:HOST = '127.0.0.1'
   npm.cmd run dev
   ```

4. Run the frontend commands in a second terminal at the repository root.

   ```powershell
   Set-Location .\App\frontend
   npm.cmd ci
   npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
   ```

Open [the application](http://localhost:5173). The API base URL is `http://localhost:4000/api/v1`.

Use [Mailpit](../README.md#emails-development-only) to inspect booking emails and open recovery links during development. The root README also covers the [optional PostgreSQL container](../README.md#optional-docker-database-setup).

## Validate locally

From `App/frontend`, run `npm.cmd test` and `npm.cmd run build`. From `App/backend`, run `npm.cmd run test:isolated -- --test-concurrency=1` with PostgreSQL running. See the [testing guide](../documentation/testing.md) for browser checks and results.

## Developer documentation

- [Documentation index](../documentation/README.md)
- [Implementation status](../documentation/implementation-status.md)
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
- [MH-08 - Cancel a booking](../documentation/stories_detail/MH-08-cancel-a-booking.md)
- [Testing](../documentation/testing.md)
- [Docker release guide](../documentation/docker-release.md)
