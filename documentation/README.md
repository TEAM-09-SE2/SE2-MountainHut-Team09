# Project documentation

Read the [implementation status](implementation-status.md) for the supported booking, employee, and password flows.

## Start here

| Task | Guide |
| --- | --- |
| Understand the project and start it locally | [Repository README](../README.md) |
| Run the release Docker image | [Run the release with Docker](../README.md#run-the-release-with-docker) |
| Build, test and publish the release image, or make the secrets zip | [Docker release guide](docker-release.md) |
| Find application components and commands | [Application guide](../App/README.md) |
| Run or inspect the API server | [Backend guide](../App/backend/README.md) |
| Run or inspect the browser client | [Frontend guide](../App/frontend/README.md) |
| Check implemented features | [Implementation status](implementation-status.md) |
| Run tests, reproduce browser scenarios, and read the latest results | [Testing guide](testing.md) |
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
| MH-07 | [Reserve for a hiker](stories_detail/MH-07-reserve-for-a-hiker.md) | Staff booking, temporary passwords for full accounts, and email password recovery |
| MH-08 | [Cancel a booking](stories_detail/MH-08-cancel-a-booking.md) | Hiker and staff cancellation with seat release and email outcomes |

### Planned for sprint 3

These stories are designed in the API and database references, but not implemented yet. Their technical guides will be written together with the implementation.

| Story | Design | Availability on this branch |
| --- | --- | --- |
| MH-09 | [Repeat a weekly schedule](api.md#mh-09--repeat-a-weekly-schedule) | Not implemented |
| MH-10 | [Define menus](api.md#mh-10--define-menus) | Not implemented |
| MH-11 | [View meal details](api.md#mh-11--view-meal-details) | Not implemented; depends on MH-10 |
| MH-20 | [Register a hike](api.md#mh-20--register-a-hike) | Not implemented |

The other stories from MH-12 onwards are product requirements, not implemented capabilities. Prototype frames and schema fields alone do not establish that an application flow is available.

## Keeping the guides aligned

Use routes, services, frontend pages, and `App/docker/postgres/schema.sql` to check behavior. Historical test results include the source revision and test conditions.
