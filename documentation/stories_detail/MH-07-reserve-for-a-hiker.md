# MH-07 - Reserve for a hiker

- **Business value:** 955
- **Requirement source:** MH-07 (shared course requirements)

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
    API->>DB: Begin; create hiker if new; lock slot; check; assign seats
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
- **New full account:** the backend generates a random 12-character password, stores only hash and salt, and sets `must_change_password = true`. The password is returned once in the response so the staff member can tell it to the hiker; it is never stored in plain text or emailed. After the first login and password change it is a normal account.
- **Temporary hiker:** stored in `app_user` with `is_temporary = true`, without email and password. Cannot log in and can never become a full account.
- **Emails:** the confirmation email (MH-03) is sent only if the hiker has an email.
- **Retention:** temporary hikers are not deleted, so their reservations stay consistent and staff can find them again.

## Password recovery via email

1. On the login page the user clicks "Forgot password" and enters their email.
2. The backend always answers the same way, so registered emails are not revealed. If the account exists, it creates a random single-use token valid for 1 hour, stores only its hash in `password_reset_token`, and emails a link to the reset page.
3. On the reset page the user enters the new password. The backend checks the token, saves the new password, clears `must_change_password` and invalidates the user's tokens.
4. The user logs in normally.

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
- New environment variable `APP_URL` (frontend address used in the reset link).

## Frontend behavior

- **Staff "New reservation for a hiker" page:** hiker step with three options (search existing, new account, quick entry), then slot, party size and requirements, then review. The result screen shows the booking and, for a new full account, the temporary password once with the instruction to give it to the hiker.
- **Staff bookings page:** shows who entered each booking and marks temporary hikers.
- **Login page:** "Forgot password" link to the recovery screen; new reset password screen opened from the email link.

## Implementation

- Staff routes: new staff reservations and hikers routes, controller, service and repository (or extensions of the existing reservation and auth modules)
- Booking logic: reuse `App/backend/src/services/reservation.service.js` and `App/backend/src/services/tableAssignment.service.js`
- Password recovery: `App/backend/src/routes/auth.routes.js`, `App/backend/src/services/auth.service.js`, new reset email template in `App/backend/src/emails/`
- UI: new staff reservation page, forgot password and reset password pages
- API reference: [API documentation](../api.md)
