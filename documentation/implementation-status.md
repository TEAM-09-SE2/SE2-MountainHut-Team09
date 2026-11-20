# Implementation status

Mountain Hut implements MH-01 through MH-08. The integration of staff booking and password recovery in [PR #37](https://github.com/TEAM-09-SE2/SE2-MountainHut-Team09/pull/37) preserves employee management and booking cancellation.

| Area | Behavior |
| --- | --- |
| MH-01 to MH-06 | Hikers book and change their own reservations, and staff manage meal slots and view bookings. Availability and booking emails reflect the saved reservation. |
| MH-07 | Employees and wardens find hikers and book for existing accounts, new full accounts, or temporary guests. New account creation and seat allocation run in one transaction. |
| MH-08 | Hikers cancel their own bookings and staff cancel on their behalf. Cancellation releases seats and records who cancelled. |
| Employee accounts | Wardens list and create employee accounts. The API requires the warden role. |
| Mandatory password change | Login returns `mustChangePassword`. Employees and full hikers created by staff change their temporary password before using protected features. |
| Email password recovery | A single-use reset token expires after 24 hours. Confirmation replaces the password and consumes active tokens in one transaction. |

See the [API reference](api.md) for request and response formats, and the [testing guide](testing.md) for commands and the historical review baseline.
