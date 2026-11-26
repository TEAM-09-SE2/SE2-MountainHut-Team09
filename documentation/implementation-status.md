# Implementation status

Mountain Hut implements MH-01 through MH-08. The integration of staff booking and password recovery in [PR #37](https://github.com/TEAM-09-SE2/SE2-MountainHut-Team09/pull/37) preserves employee management and booking cancellation.

| Area | Behavior |
| --- | --- |
| MH-01 to MH-06 | Hikers book and change their own reservations, and staff manage meal slots and view bookings. Availability and booking emails reflect the saved reservation. |
| MH-07 | Employees and wardens find hikers and book for existing accounts, new full accounts, or temporary guests. New account creation and seat allocation run in one transaction. |
| MH-08 | Hikers cancel their own bookings; staff cannot cancel. Cancellation releases seats and records who cancelled. |
| Employee accounts | Wardens list and create employee accounts. The API requires the warden role. |
| Mandatory password change | Login returns `mustChangePassword`. Employees and full hikers created by staff change their temporary password before using protected features. |
| Email password recovery | A single-use reset token expires after 24 hours. Confirmation replaces the password and consumes active tokens in one transaction. |

## Planned for sprint 3

MH-09 (repeat a weekly schedule), MH-10 (define menus), MH-11 (view meal details) and MH-20 (register a hike) are designed in the [API reference](api.md) and the [database reference](database.md), but not implemented yet. Until they are, `schema.sql` still has 7 tables: the `slot.menu` column and the `hike` and `predefined_hike` tables described in the database reference do not exist yet.

See the [API reference](api.md) for request and response formats. The [latest validation](testing.md#latest-validation) records automated suites and browser checks from `dev`.
