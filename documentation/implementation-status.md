# Implementation status

Baseline: `mh07/feat/main`, commit `1e7e8c3`, reviewed on **20 November 2026** in [PR #37](https://github.com/TEAM-09-SE2/SE2-MountainHut-Team09/pull/37). This is a snapshot of the branch under review, not a statement that it has merged into `dev`. The [submitted review](https://github.com/TEAM-09-SE2/SE2-MountainHut-Team09/pull/37#pullrequestreview-5994020927) requests changes.

## Available behavior

- MH-01 through MH-06: web booking, slot/table capacity, confirmation/update emails, public availability, party requirements, staff booking lists, and changes to an owned booking.
- MH-07: staff search existing hikers and book for an existing hiker, a new full account, or a temporary hiker. New hiker creation and seat allocation share one transaction. Temporary hikers have no login credentials.
- Password recovery: public email request and token confirmation endpoints, 24-hour tokens stored as SHA-256 hashes, and atomic password replacement/token consumption.
- Authentication: JWT cookie, current role loaded from PostgreSQL, and a backend restriction while `must_change_password` is true. The normal password-change path is affected by the issues below.

## Integration issues to resolve

| Area | Current behavior | Required restoration |
| --- | --- | --- |
| Change own password | `PUT /api/v1/auth/password` returns `500 INTERNAL_ERROR` for an authenticated request with a non-empty object body: the controller calls missing `authService.changePassword`. | Restore the service and `authRepository.findCredentialsById` / `updatePassword`, including password verification and clearing the temporary-password flag. |
| Employee management | `GET` and `POST /api/v1/staff/employees` return 404 because the routes are absent. `staff.service.js` still imports the missing named export `createAccount`. | Restore the shared creation function and warden-only employee routes without removing MH-07 staff routes. |
| Login state | `POST /auth/login` omits `mustChangePassword`; `GET /auth/me` still returns it. Protected APIs still enforce the database flag. | Restore the field in `findUserByEmail` and `loginUser` so the frontend can redirect immediately after login. |
| Registration bounds | Public registration does not check the 255-character email and 100-character name limits before writing to PostgreSQL. The schema still enforces these bounds, so oversized values can become a 500 instead of a validation error. | Restore length validation and its tests. MH-07 new-hiker validation already checks these limits. |
| Test suite | Backend unit and integration suites are failing; three integration files also reached the diagnostic timeout. | Fix production regressions, then reconcile test doubles and resource cleanup; see [testing](testing.md). |

New full hiker accounts are created with `must_change_password = true`. Their temporary password is returned once to staff. Login can succeed, but the normal forced password change cannot complete while the first issue remains. The email recovery flow can clear the flag; it does not repair the normal first-login flow. After `/auth/me` loads the flag, the frontend gate also redirects recovery pages to `/change-password` for that logged-in user, so recovery requires logging out first.

## MH-08 integration boundary

The schema contains cancellation fields and constraints, and booking lists can return cancellation information. The hiker list even returns `cancellable`. However, this branch does not register either cancellation POST route, render cancellation controls, or export a cancellation email service. Treat the [MH-08 guide](stories_detail/MH-08-cancel-a-booking.md) and [API section](api.md#mh-08--cancel-a-booking) as contracts to integrate, not executable functionality on this branch.

At review time, `dev` (`0c05412`) already contained MH-08 and GitHub reported merge conflicts for PR #37. The difference between these branch tips does not mean every missing MH-08 file was deleted by this PR. Resolve the merge while preserving both features.

## Integration sequence

1. Back up the working branch, fetch the current remote state, and merge `origin/dev` into `mh07/feat/main`.
2. Reconcile authentication services and repository exports; retain password recovery together with employee creation and ordinary password changes.
3. Use one consistent staff-router mount convention. Keep employee routes warden-only and hiker search/reservations open to employees and wardens.
4. Preserve MH-08 routes, services, UI actions, and tests from `dev` alongside MH-07. Keep booking-change and seat-allocation rules intact.
5. Run the [validation commands](testing.md), including staff-created account login, mandatory password change, protected requests, and cancellation. Address SonarCloud findings and confirm GitHub no longer reports conflicts.
6. Update this status and the affected API/frontend guides after verifying the resulting behavior. Do not remove known issues solely because conflicts were resolved.
