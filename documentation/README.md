# Project documentation

This documentation describes the application on `mh07/feat/main`. The implementation baseline is commit `1e7e8c3`, reviewed on 20 November 2026. Read the [implementation status](implementation-status.md) before relying on employee management, mandatory password changes, or cancellation: their contracts and their availability on this branch differ.

## Start here

| Task | Guide |
| --- | --- |
| Understand the project and start it locally | [Repository README](../README.md) |
| Find application components and commands | [Application guide](../App/README.md) |
| Run or inspect the API server | [Backend guide](../App/backend/README.md) |
| Run or inspect the browser client | [Frontend guide](../App/frontend/README.md) |
| Check implemented features and known integration issues | [Implementation status](implementation-status.md) |
| Run tests safely and understand the review results | [Testing guide](testing.md) |
| Use the HTTP API | [API reference](api.md) |
| Understand tables, constraints, and transactions | [Database reference](database.md) |
| Understand component relationships | [Architecture](architecture-diagram.md) |
| Understand the domain and terminology | [Project context](../context.md) |
| Inspect design flows and static screen exports | [Design prototype](../App/figmaPrototype/README.md) |

## Story guides

| Story | Technical guide | Availability on this branch |
| --- | --- | --- |
| MH-01 | [Book a table](stories_detail/MH-01-book-a-table.md) | Implemented |
| MH-02 | [Define slot capacity](stories_detail/MH-02-define-slot-capacity.md) | Implemented |
| MH-03 | [Receive confirmation](stories_detail/MH-03-receive-confirmation.md) | Implemented for web and staff bookings with an email |
| MH-04 | [Check availability](stories_detail/MH-04-check-availability.md) | Implemented; does not reserve seats |
| MH-05 | [Party requirements](stories_detail/MH-05-party-requirements.md) | Implemented in bookings, emails, and staff lists |
| MH-06 | [Change a booking](stories_detail/MH-06-change-a-booking.md) | Implemented for the booking owner |
| MH-07 | [Reserve for a hiker](stories_detail/MH-07-reserve-for-a-hiker.md) | Staff booking and password recovery implemented; mandatory password change is broken |
| MH-08 | [Cancel a booking](stories_detail/MH-08-cancel-a-booking.md) | Contract retained; cancellation routes, UI actions, and email service are absent here |

MH-09 through MH-19 are product requirements, not implemented capabilities. Prototype frames and schema fields alone do not establish that an application flow is available.

## Keeping the guides aligned

Use routes, services, frontend pages, and `App/docker/postgres/schema.sql` to check behavior. Keep unavailable contracts explicitly labelled until their implementation is restored. Update the status and validation baseline after resolving the integration issues; retain historical review results with their commit and execution conditions.
