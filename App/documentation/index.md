# Application documentation

## Local development

- [Repository quick start without Docker](../../README.md#local-postgresql-no-docker)
- [Application overview and startup](../README.md)
- [Backend setup and tests](../backend/README.md)
- [Frontend setup and tests](../frontend/README.md)

The application backend uses PostgreSQL (`pg`), not MySQL. Docker Compose is optional. `App/docker/.env.example` contains placeholders; keep real local credentials in the ignored `App/docker/.env` file and do not commit them.

## Technical guides by user story

- [MH-01 - Book a table](../../DOCS/MH-01-book-a-table.md)
- [MH-02 - Define slot capacity](../../DOCS/MH-02-define-slot-capacity.md)
- [MH-03 - Receive confirmation](../../DOCS/MH-03-receive-confirmation.md)
- [MH-04 - Check availability](../../DOCS/MH-04-check-availability.md)

## API and data model

- [Versioned API reference](./api.md)
- [PostgreSQL schema and data organization](./database.md)
- Original user-story requirements: [`stories/`](../../stories/)