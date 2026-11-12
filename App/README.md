# Mountain Hut application

This directory contains the React/Vite frontend, Express API, PostgreSQL schema, and design prototype. The backend requires PostgreSQL; **MySQL is not used**. Docker is optional for local development.

## Run locally without Docker

1. Start a local PostgreSQL service, create an application role and `mountainhut_db`, then configure `App/docker/.env` with the local connection values. See the [repository setup guide](../README.md#local-postgresql-no-docker).
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

## Developer documentation

- [API reference](../documentation/api.md)
- [Database organization](../documentation/database.md)
- [MH-01 - Book a table](../documentation/stories_detail/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](../documentation/stories_detail/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](../documentation/stories_detail/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](../documentation/stories_detail/MH-04-check-availability.md)
- [All application docs](../documentation/)