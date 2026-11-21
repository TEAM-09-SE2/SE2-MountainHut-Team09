# Frontend

React app built with Vite. API-backed pages require the Express API and PostgreSQL.

The frontend includes the MH-07 staff booking wizard and password recovery, and MH-08 cancellation for hikers and staff.

Run these commands in `App/frontend`.

```powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
npm.cmd test             # Vitest, single run
npm.cmd run test:watch   # Vitest, runs again on every change
npm.cmd run build        # Vite production bundle in dist/
```

Start the API on port `4000` before using the [local frontend](http://localhost:5173). The app sends authenticated requests to `http://localhost:4000/api/v1` with session cookies. To view the built bundle, stop the Vite dev server, run `npm.cmd run build`, then run `npm.cmd run preview -- --host 127.0.0.1 --port 5173 --strictPort` to keep the same origin.

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
| `/my-bookings`, `/my-bookings/:id/change` | Hiker | Current and upcoming bookings, changes and cancellations (MH-06/MH-08) |
| `/staff/slots` | Employee or warden | Create slots and table layouts (MH-02) |
| `/staff/bookings` | Employee or warden | Filter bookings by day, slot, and status, and cancel on behalf of a hiker (MH-05/MH-07/MH-08) |
| `/staff/reserve` | Employee or warden | Book for an existing, full new, or temporary hiker (MH-07) |
| `/staff/employees` | Warden | List and create employee accounts |

`AuthProvider` stores login results and loads `/auth/me` on startup. Both endpoints return `mustChangePassword`. `ProtectedRoute` checks the session and allowed roles. `PasswordChangeGate` redirects users with a temporary password to `/change-password`, where they can also sign out.

Both booking lists offer a confirmation dialog when the API marks a booking as cancellable.

## MH-07 interactions

`StaffReserve` has hiker selection, slot/party/requirements, review, and result steps. Quick entry creates a guest without login credentials. Search uses a debounced request and aborts obsolete requests. A full new account shows its temporary password once on the result screen, with a copy action; staff must give it to the hiker. Resetting the wizard reloads slot capacity. Capacity/slot conflicts return the user to slot selection and refresh the options.

`ForgotPasswordPage` gives the same success message for a valid request whether or not the email belongs to an account. A successful request does not guarantee email delivery. `ResetPasswordPage` reads the token from the query string and submits matching passwords of at least eight characters; invalid/expired tokens offer a new recovery request. After a successful reset, the user follows the sign-in link. A logged-in user forced to change their password must log out before using recovery pages while the current gate remains in place.

## API clients and components

- `src/services/authApi.js`: authentication, ordinary password change, and password recovery.
- `src/services/reservationApi.js` handles slots, web and staff booking, hiker search, staff lists, changes, and cancellations.
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

The flag fakes slot capacity requests. Sign in still requires the backend. Use the real adapter for browser checks against PostgreSQL.

The tests are in `tests/` (files ending in `.test.js` or `.test.jsx`) and run in jsdom. They mock the API, so they don't need the backend or the database.

See the [testing guide](../../documentation/testing.md#latest-validation) for Vitest, the production build, and Chrome verification. The frontend lint script requires an ESLint installation and configuration.

See the [documentation index](../../documentation/README.md) for all story guides, the [API reference](../../documentation/api.md), and the [architecture](../../documentation/architecture-diagram.md).
