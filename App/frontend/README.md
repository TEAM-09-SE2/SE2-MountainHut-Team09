# Frontend

React app built with Vite. Docker is not required for the frontend, but the backend and its PostgreSQL database must be running for API-backed pages. From `App/frontend`:

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest, single run
npm run test:watch   # Vitest, runs again on every change
```

The app calls the backend at `http://localhost:4000/api/v1` and uses cookies for authenticated calls, so start the backend before using API-backed pages. The Vite development server is available at `http://localhost:5173`.

The slot capacity page (`/staff/slots`, MH-02) can use fake slot data instead of the database. In PowerShell, set the flag before starting Vite:

```powershell
$env:VITE_USE_MOCK = 'true'
npm run dev
```

Only slot API calls are faked; authentication still requires the backend.

The tests are in `tests/` (files ending in `.test.js` or `.test.jsx`) and run in jsdom. They mock the API, so they don't need the backend or the database.

See the [API reference](../documentation/api.md) and the [MH-01](../../DOCS/MH-01-book-a-table.md), [MH-02](../../DOCS/MH-02-define-slot-capacity.md), [MH-03](../../DOCS/MH-03-receive-confirmation.md), and [MH-04](../../DOCS/MH-04-check-availability.md) technical guides.
