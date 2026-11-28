# Testing and validation

Commands below start at the repository root unless a working directory is shown. On Windows PowerShell, `npm.cmd` works when execution policy blocks `npm.ps1`.

## Latest validation

These results are from **20 November 2026**, using `dev` commit `90779fa` on Windows with Node.js 22.14.0, npm 10.9.2 and local PostgreSQL 17.

| Check | Result |
| --- | --- |
| Frontend unit and integration tests | 292 passed in 38 files |
| Frontend production build | Passed |
| Backend unit, integration and end-to-end tests | 517 passed, zero failed or cancelled, using `--test-concurrency=1 --test-timeout=30000` |
| Chrome browser check | All 8 scenarios below passed against Vite, Express, PostgreSQL and Mailpit |
| Frontend lint | Unavailable. `npm.cmd run lint` could not find an ESLint executable. |

The browser check used Playwright driving Chrome with its own sessions. The preview ran on `http://localhost:5173`, the API on port `4000` and Mailpit on ports `1025` and `8025`. The preview used a separate PostgreSQL schema with the development seed. The backend suite used its own isolated schema. The run used the installed dependencies.

## Browser checks

Start a [local preview](../README.md#local-postgresql-no-docker) with a disposable database and the [Mailpit service](../README.md#emails-development-only). Use the real slot adapter and separate browser sessions for the warden, employee and hikers. Choose a meal date more than 48 hours away so the change action is available.

1. Sign in as a warden. Create a slot with three four-seat tables. Check that the slot list and public slot query both report 12 seats.
2. Create an employee and check that the account appears in the warden's list. Sign in with the temporary password, verify that protected operations require a password change, complete the change and verify that employee management still requires the warden role.
3. Register a hiker and sign in. In a signed-out session, check that the slot is available for two people and that the query leaves all 12 seats free.
4. Book for two as the hiker and add a dietary requirement marked as an allergy. Check that the staff list and confirmation email show the requirement and that capacity drops to 10.
5. Change the party size to three and verify the update email and nine remaining seats. Cancel as the hiker and confirm that the cancellation email arrives and all 12 seats are available again.
6. Book as staff for an existing hiker, a new full account and a temporary guest. Sign in as the new hiker, change the temporary password and open the booking with the same session. Open the staff bookings page and verify that it has no Cancel button, and that the booking cancelled by the hiker in step 5 shows the hiker as the person who cancelled it.
7. Request email recovery for the registered hiker. Use the link captured by Mailpit, verify that it works once, confirm that the prior password is rejected and sign in with the new password.
8. Open Home, Availability and Sign In at a 390 px viewport. Check for horizontal overflow and uncaught browser exceptions.

The follow-up walkthrough in the VS Code browser used the same `dev` revision and preview schema. A staff booking for a temporary guest took the free-seat count from 8 to 6. Cancelling it brought the count back to 8 in the API and `slot_table_free`. The cancelled reservation and its two assigned seats stayed in the database as history. Mailpit captured no email for that guest.

The Playwright rerun also checked PostgreSQL in read-only transactions. It confirmed that a capacity conflict returned `409 NOT_ENOUGH_SEATS` without creating the hiker, that changing a temporary password cleared `must_change_password`, and that the password recovery token was set to expire after 24 hours and marked used after confirmation.

The slot integration test from remote commit `6822b94` passed all six cases in a separate schema.

## Frontend

From `App/frontend`:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Vitest runs the unit and integration tests under `tests/` in jsdom. API calls are mocked: passing these tests does not verify that Express routes exist or PostgreSQL queries work. `npm.cmd run test:watch` starts watch mode. The production build verifies the Vite bundle.

The manifest also defines `lint`, but this checkout has no ESLint dependency or configuration. It is not a configured validation gate.

## Backend

The backend reads PostgreSQL settings from `App/docker/.env`. Prefer an isolated schema for database-backed tests so fixture cleanup does not affect development data. The PostgreSQL role needs permission to create schemas in the configured database.

From `App/backend`:

```powershell
npm.cmd ci
npm.cmd run test:isolated -- --test-concurrency=1
```

`scripts/test-isolated.js` creates a schema with a unique name, applies `App/docker/postgres/schema.sql`, starts the Node.js test runner with that schema as `search_path`, then drops the schema in `finally`. Seed data is not required. Allow the wrapper to finish so cleanup can run.

Run selected scenarios with the same isolation:

```powershell
npm.cmd run test:isolated -- --test-concurrency=1 tests/e2e/staff_and_reset_test.js
npm.cmd run test:isolated -- --test-concurrency=1 tests/e2e/staff_test.js tests/e2e/password_test.js
```

Unit tests can run without a live database. In PowerShell:

```powershell
$unitTestFiles = @(Get-ChildItem -Path tests/unit -Recurse -Filter '*test.js' | ForEach-Object { $_.FullName })
node --import tsx --test --test-concurrency=1 @unitTestFiles
```

`npm.cmd test` runs the complete backend suite directly against the configured database, without the isolation wrapper. Some tests delete fixtures by matching names, email patterns, or slot dates. Use the isolated command for a development database. Email tests use mocks or local fake SMTP servers; they do not require real SMTP credentials.

## Historical review baseline

These results were obtained on **20 November 2026**, at source commit `1e7e8c3`, with Node.js `22.14.0` and the locally installed dependencies. They describe the review run, not a fresh `npm ci` run or the outcome after future integration changes.

| Check | Result |
| --- | --- |
| Frontend unit/integration tests | 32 files passed; 238 tests passed |
| Frontend production build | Passed |
| Backend unit tests | 192 passed; 25 failed |
| Backend integration/E2E tests | 81 passed; 54 failed; 3 cancelled |
| SonarCloud | Quality Gate failed: new-code reliability rated C; A required |

Backend unit tests ran with `--test-concurrency=1`. Integration/E2E tests ran with the same concurrency, an isolated PostgreSQL schema, and a diagnostic `--test-timeout=15000` per file. Three files reached that timeout:

- `tests/integration/service_and_controller/confirmation_test.js`
- `tests/integration/service_and_controller/staff_and_reset_test.js`
- `tests/integration/service_and_controller/staff_reservations_test.js`

The counts include file-level import and timeout failures plus cancelled tests. At that revision, the password-reset email template was missing validation expected by two of its unit tests.

The MH-07 end-to-end file passed its staff booking, temporary-hiker search, password-reset lifecycle, and transaction rollback scenarios. It does not verify the ordinary mandatory password-change path: the password-change and employee routes were failing at that revision.

To reproduce the bounded integration/E2E run from `App/backend`:

```powershell
$integrationTestFiles = @(Get-ChildItem -Path tests/integration,tests/e2e -Recurse -Filter '*test.js' | ForEach-Object { $_.FullName })
npm.cmd run test:isolated -- --test-concurrency=1 --test-timeout=15000 @integrationTestFiles
```

## Integration scenarios

In addition to the suites, verify these flows against the real API with PostgreSQL and a local fake SMTP inbox:

1. A warden lists and creates an employee; employee and hiker roles cannot manage employees.
2. A staff-created full hiker and a new employee log in with temporary passwords, receive `mustChangePassword: true`, complete `PUT /auth/password`, and use protected APIs with the existing session.
3. Wrong/current/reused passwords and invalid registration lengths return the expected validation errors without changing stored credentials.
4. Staff book for existing, full new, and temporary hikers; duplicate-email or capacity failures leave no orphan hiker or partial reservation.
5. Password recovery sends a local test email, accepts a valid token once, rejects expired/reused tokens, and clears the temporary-password flag.
6. Existing hiker booking/change flows and the MH-08 cancellation behavior integrated from `dev` still work, including seat release and email outcomes.

Keep the test conditions and source revision with any new result report.
