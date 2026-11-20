# Frontend

React app built with Vite. Docker is not required for the frontend, but the backend and its PostgreSQL database must be running for API-backed pages. From `App/frontend`:

The frontend includes the MH-07 staff booking wizard and password recovery, and MH-08 cancellation for hikers and staff.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest, single run
npm run test:watch   # Vitest, runs again on every change
npm run build        # Vite production bundle in dist/
npm run preview      # serve the built bundle locally
```

The app calls the backend at `http://localhost:4000/api/v1` and uses cookies for authenticated calls, so start the backend before using API-backed pages. The Vite development server is available at `http://localhost:5173`.

API URLs are currently defined in the client modules; changing backend `PORT` or `CLIENT_URL` does not rewrite them. Set backend `CLIENT_URL` to the browser origin for CORS and password-reset links. On PowerShell use `npm.cmd` if `npm.ps1` is blocked.

## Pages and access

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Hiker/staff home content selected by the current session |
| `/login`, `/register` | Public | Sign in and register a hiker |
| `/forgot-password`, `/reset-password?token=...` | Public, inside the password-change gate | Request a recovery email and set a password using its token |
| `/change-password` | Authenticated, outside the gate | Change the current password, including a mandatory first change |
| `/availability` | Public | Advisory seat availability (MH-04) |
| `/book-table` | Hiker | Web booking with party requirements (MH-01/MH-05) |
| `/my-bookings`, `/my-bookings/:id/change` | Hiker | Current/upcoming bookings and booking changes (MH-06) |
| `/staff/slots` | Employee or warden | Create slots and table layouts (MH-02) |
| `/staff/bookings` | Employee or warden | Filter bookings by day, slot, and status (MH-05/MH-07) |
| `/staff/reserve` | Employee or warden | Book for an existing, full new, or temporary hiker (MH-07) |
| `/staff/employees` | Warden | List and create employee accounts |

`AuthProvider` stores login results and loads `/auth/me` on startup. Both endpoints return `mustChangePassword`. `ProtectedRoute` checks the session and allowed roles. `PasswordChangeGate` redirects users with a temporary password to `/change-password`, where they can also sign out.

Both booking lists offer a confirmation dialog when the API marks a booking as cancellable.

## MH-07 interactions

`StaffReserve` has hiker selection, slot/party/requirements, review, and result steps. Quick entry creates a guest without login credentials. Search uses a debounced request and aborts obsolete requests. A full new account shows its temporary password once on the result screen, with a copy action; staff must give it to the hiker. Resetting the wizard reloads slot capacity. Capacity/slot conflicts return the user to slot selection and refresh the options.

`ForgotPasswordPage` gives the same success message for a valid request whether or not the email belongs to an account. A successful request does not guarantee email delivery. `ResetPasswordPage` reads the token from the query string and submits matching passwords of at least eight characters; invalid/expired tokens offer a new recovery request. After a successful reset, the user follows the sign-in link. A logged-in user forced to change their password must log out before using recovery pages while the current gate remains in place.

## API clients and components

- `src/services/authApi.js`: authentication, ordinary password change, and password recovery.
- `src/services/reservationApi.js`: slots, web/staff booking, hiker search, staff lists, and booking changes.
- `src/services/staffApi.js` lists and creates employee accounts.
- `src/services/availabilityApi.js`: public availability queries.
- `src/api/index.js`: real/mock slot-capacity adapter selected by `VITE_USE_MOCK`.
- `RequirementsEditor`, `RequirementsList`, and `utils/bookingFormat.js`: shared requirement entry, display, validation, and hut-time formatting.

## Optional slot mock

The slot capacity page (`/staff/slots`, MH-02) can use fake slot data instead of the database. In PowerShell, set the flag before starting Vite:

```powershell
$env:VITE_USE_MOCK = 'true'
npm run dev
```

Only slot API calls are faked; authentication still requires the backend.

The tests are in `tests/` (files ending in `.test.js` or `.test.jsx`) and run in jsdom. They mock the API, so they don't need the backend or the database.

See the [testing guide](../../documentation/testing.md) for the frontend suite, production build, and real-API verification flows. The frontend lint script requires an ESLint installation and configuration.

See the [documentation index](../../documentation/README.md) for all story guides, the [API reference](../../documentation/api.md), and the [architecture](../../documentation/architecture-diagram.md).
