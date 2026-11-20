# MH-07 - Reserve for a hiker

- **Business value:** 955
- **Requirement source:** MH-07 (shared course requirements)

> **Branch status:** staff booking, hiker search, and email password recovery are implemented on `mh07/feat/main`. Ordinary mandatory password changes and employee management have integration regressions. See the [implementation status](../implementation-status.md) and [test baseline](../testing.md) before exercising the full first-login flow.

## User story

As an employee, I want to enter a reservation for a hiker, so that I can accept reservations via other channels than web.

## Purpose and scope

Staff enter reservations that arrive by phone, by message or in person (e.g. a party arriving at the hut shortly before the meal). Together with the reservation details, the staff member chooses the hiker in one of three ways:

| Hiker               | What is entered                                                           | Can log in?                                                        |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Existing            | Found by name, phone or email                                             | As before (temporary hikers: no)                                   |
| New full account    | Email, first name, last name, optional phone, emergency contact and notes | Yes, with a random temporary password to change at the first login |
| New temporary hiker | First name, last name, optional phone                                     | No, never                                                          |

First name and last name are always required. The story also adds **password recovery via email** for every user with an email.

## Actors and access control

- Entering reservations for hikers and searching hikers: staff (`employee` and `warden`).
- Password recovery: public, for any user with an email.

## End-to-end flow

```mermaid
sequenceDiagram
    actor Staff
    participant UI as Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant Mail as SMTP provider

    Staff->>UI: Search hiker (name, phone, email)
    UI->>API: GET /api/v1/staff/hikers?q=...
    API-->>UI: Matching hikers
    Staff->>UI: Choose hiker or enter a new one, fill in booking
    UI->>API: POST /api/v1/staff/reservations
    API->>DB: Begin; verify staff and existing hiker if selected
    API->>DB: Lock slot; check time and duplicates; choose free tables
    API->>DB: Create hiker if new
    API->>DB: Insert reservation (created_by = staff), seats, requirements
    API->>DB: Commit (or rollback: no hiker, no booking)
    API->>Mail: Confirmation email, only if the hiker has an email
    API-->>UI: 201 booking, hiker, temporaryPassword (new full account only)
```

## Rules

- **Time:** the slot must not have started yet. There is no 2-hour limit, unlike MH-01.
- **Seats and tables:** same rules as MH-01; one confirmed booking per hiker per slot. Requirements as in MH-05.
- **Tracking:** `reservation.created_by` stores the staff member who entered the booking (NULL for web bookings). Staff see it in the bookings list.
- **One transaction:** the new hiker (full or temporary) and the reservation are created together. If the booking fails, no hiker is created.
- **New full account:** the backend generates a random 12-character password, stores only hash and salt, and sets `must_change_password = true`. The password is returned once in the response so staff can tell it to the hiker; it is never persisted in plain text or emailed. The intended next step is mandatory password change. That endpoint currently fails; email recovery can clear the flag separately, as described in the status guide.
- **Temporary hiker:** stored in `app_user` with `is_temporary = true`, without email and password. Cannot log in and can never become a full account.
- **Emails:** the confirmation email (MH-03) is sent only if the hiker has an email.
- **Retention:** temporary hikers are not deleted, so their reservations stay consistent and staff can find them again.

## Password recovery via email

1. On the login page the user clicks "Forgot password" and enters their email.
2. For valid email input, the backend returns the same `202` response whether or not an account exists, assuming token persistence succeeds. Existing accounts receive a random single-use token valid for 24 hours, stored only as a SHA-256 hash in `password_reset_token`. SMTP failure is logged and still returns `202`; a successful request is not a delivery receipt.
3. On the reset page the user enters the new password. The backend checks the token, saves the new password, clears `must_change_password` and invalidates the user's tokens.
4. The user logs in normally.

The backend locks the user row for token creation and confirmation. Confirmation rechecks validity under that lock, replaces the password and consumes the valid tokens in one transaction. Creating another token does not immediately revoke older ones. A logged-in user whose temporary-password flag is loaded is redirected away from recovery pages by the frontend gate; they must log out to use recovery while the normal password-change endpoint remains broken.

## API contract

| API                                        | Access | Purpose                                                           |
| ------------------------------------------ | ------ | ----------------------------------------------------------------- |
| `GET /api/v1/staff/hikers?q=`              | staff  | Search hikers by name, phone or email                             |
| `POST /api/v1/staff/reservations`          | staff  | Create a booking for an existing, new full or new temporary hiker |
| `POST /api/v1/auth/password-reset/request` | public | Ask for a password reset email                                    |
| `POST /api/v1/auth/password-reset/confirm` | public | Set a new password with the token from the email                  |

Full request and response formats, and the list of errors, are in the [API documentation](../api.md#mh-07--reserve-for-a-hiker).

## Data model

See [database.md](../database.md):

- `app_user`: new column `is_temporary`; `email`, `password_hash` and `salt` become nullable, with a CHECK constraint that keeps them required for regular users and NULL for temporary hikers.
- `reservation`: new column `created_by` (FK to `app_user`, NULL for web bookings).
- New table `password_reset_token`.
- The existing `CLIENT_URL` environment variable provides the frontend address used in the reset link.

## Frontend behavior

- **Staff "New reservation for a hiker" page** (`/staff/reserve`): hiker step with three options (search existing, new account, quick entry), then slot, party size and requirements, then review. Search is debounced and obsolete requests are aborted. The result screen shows the booking and, for a new full account, the temporary password once with a copy action and the instruction to give it to the hiker. Starting another booking refreshes slot capacity. Slot/capacity conflicts clear the selection and reload the available slots.
- **Staff bookings page:** shows who entered each booking and marks temporary hikers.
- **Login page:** "Forgot password" link to the recovery screen; new reset password screen opened from the email link.

## Implementation

- Routes: `App/backend/src/routes/staff.routes.js` exposes canonical `GET /api/v1/staff/hikers` and `POST /api/v1/staff/reservations` through the `/api/v1` mount
- Staff booking: `staffReservations.controller.js`, `staffReservations.service.js`, and `staffReservations.repository.js` under backend controllers/services/database
- Hiker search: `hikers.controller.js`, `hikers.service.js`, and `hikers.repository.js`
- Shared booking support: `App/backend/src/utils/reservationValidation.js`, `services/tableAssignment.service.js`, `database/slot.repository.js`, and `database/reservation.repository.js`; staff orchestration is separate from the hiker reservation service
- Password recovery: `App/backend/src/routes/auth.routes.js`, `App/backend/src/services/auth.service.js`, new reset email template in `App/backend/src/emails/`
- UI: new staff reservation page, forgot password and reset password pages
- API reference: [API documentation](../api.md)

## Validation

The reviewed MH-07 E2E scenarios in `App/backend/tests/e2e/staff_and_reset_test.js` passed: temporary guest booking/search, a new full account with email-reset lifecycle, and rollback for duplicate email/insufficient capacity. This does not establish that the ordinary first-login password change works. Frontend coverage includes `StaffReserve`, `PasswordRecovery`, and their API clients; see the [testing guide](../testing.md) for full-suite failures and commands.
