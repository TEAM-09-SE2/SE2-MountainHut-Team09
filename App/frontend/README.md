# Frontend

React app built with Vite. From `App/frontend`:

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest, single run
npm run test:watch   # Vitest, runs again on every change
```

The app calls the backend at `http://localhost:4000/api/v1`, so start the backend before `npm run dev`.

The tests are in `tests/` (files ending in `.test.js` or `.test.jsx`) and run in jsdom. They mock the API, so they don't need the backend or the database.
