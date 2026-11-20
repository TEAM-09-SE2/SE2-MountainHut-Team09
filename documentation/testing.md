# Testing and validation

Commands below start at the repository root unless a working directory is shown. Dependencies must already be installed. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`; no execution-policy change is required.

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

The counts include file-level import/timeout failures and cancelled tests; they do not count distinct application defects. Investigate failed assertions and open resources before attributing every failure to production logic. The password-reset email template also lacks validation expected by two of its unit tests.

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
