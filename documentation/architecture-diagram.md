# Architecture Diagram

Mountain Hut is a client-server web application. The React client calls an Express API, which coordinates booking and guest services, PostgreSQL transactions, and booking/recovery email delivery. This describes `mh07/feat/main`; read the [implementation status](implementation-status.md) for employee/password regressions and the MH-08 integration boundary.

## Application Architecture

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart TD
    subgraph ClientLayer["Client Layer"]
        BrowserA["Web browser"]
        FrontendA["React 18 and Vite"]
        BrowserA -->|"renders"| FrontendA
    end
    subgraph ApplicationLayer["Application Layer"]
        ExpressA["Express 5 REST API"]
        MiddlewareA["JWT, role, and cookie middleware"]
        RoutesA["Versioned API routes"]
        ControllersA["Controllers"]
        ServicesA["Domain services"]
        ExpressA --> MiddlewareA
        MiddlewareA --> RoutesA
        RoutesA --> ControllersA
        ControllersA --> ServicesA
    end
    subgraph DataLayer["Data Access Layer"]
        RepositoriesA["PostgreSQL repositories"]
        PoolA["pg connection pool"]
        DatabaseA[("PostgreSQL")]
        RepositoriesA --> PoolA
        PoolA --> DatabaseA
    end
    subgraph MessagingLayer["Email Delivery"]
        EmailA["Nodemailer email service"]
        SmtpA["SMTP server or Mailpit"]
        EmailA --> SmtpA
    end
    FrontendA -->|"JSON over HTTP and cookie"| ExpressA
    ServicesA -->|"queries and transactions"| RepositoriesA
    ServicesA -.->|"booking mail after commit and reset links"| EmailA
```

### Technology and Data Storage

| Area | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React 18, React Router 7, Vite 8, Tailwind CSS 4 | Hiker and staff user interfaces |
| Backend | Node.js, Express 5, ES modules, `tsx` | Versioned HTTP API and server startup |
| Authentication | JSON Web Tokens in HTTP-only cookies | Current role/password flag loaded from PostgreSQL per protected request |
| Persistence | PostgreSQL through `pg` | Regular/temporary hikers, slots, tables, reservations, requirements, and reset tokens |
| Email | Nodemailer and React Email | Booking confirmation/update and password-reset messages |
| Frontend tests | Vitest and Testing Library | Component and interaction tests |
| Backend tests | Node.js test runner with `tsx` | Service and API tests |

PostgreSQL is the only application database. The repository's Docker Compose configuration uses PostgreSQL 16; local development has also been verified with PostgreSQL 17. Docker is optional when a local PostgreSQL service and SMTP configuration are available. Mailpit is an optional development SMTP inbox, not a production dependency.

The schema defines seven tables: `app_user`, `slot`, `slot_table`, `reservation`, `reservation_seat`, `reservation_requirement`, and `password_reset_token`, plus the `slot_table_free` view. A slot's capacity is the sum of its table seat counts. The view derives per-table free seats from confirmed reservation allocations. Composite foreign keys in `reservation_seat` enforce that a reservation and its table belong to the same slot.

### Key Design Decisions

- HTTP routes, controllers, domain services, and repositories form separate backend layers.
- Reservation allocation is performed as a database operation; availability is an advisory query and does not hold seats.
- Confirmation email delivery follows the reservation write and is best-effort: a mail failure does not roll back a successful booking.
- Staff booking creates a new full/temporary hiker and their reservation in one transaction. It shares table allocation and booking-email services with web booking, but uses its own orchestrator and permits booking until the slot starts.
- Password-reset token creation and confirmation lock the account row. Password replacement and valid-token consumption are atomic; the raw reset token is never persisted.
- No cache, queue, or ORM is used; persistence is implemented with SQL and the `pg` connection pool.

## Component Relationships

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart LR
    subgraph PresentationLayer["Presentation"]
        cBrowser["Browser"]
        cBooking["Booking page"]
        cStaff["Staff slot page"]
        cStaffBookings["Staff booking list and wizard"]
        cRecovery["Forgot and reset password pages"]
        cAvailability["Availability page"]
        cAuthContext["Auth context"]
        cBrowser --> cBooking
        cBrowser --> cStaff
        cBrowser --> cStaffBookings
        cBrowser --> cRecovery
        cBrowser --> cAvailability
        cBooking --> cAuthContext
        cStaff --> cAuthContext
        cStaffBookings --> cAuthContext
    end
    subgraph HttpLayer["HTTP API"]
        cApp["Express app"]
        cAuthRoutes["Auth routes"]
        cSlotRoutes["Slot routes"]
        cReservationRoutes["Reservation routes"]
        cAvailabilityRoutes["Availability routes"]
        cStaffRoutes["Staff hiker and reservation routes"]
        cMiddleware["Auth and role middleware"]
        cAuthController["Auth controller"]
        cSlotController["Slot controller"]
        cReservationController["Reservation controller"]
        cAvailabilityController["Availability controller"]
        cHikersController["Hiker search controller"]
        cStaffReservationsController["Staff booking controller"]
        cApp --> cAuthRoutes
        cApp --> cSlotRoutes
        cApp --> cReservationRoutes
        cApp --> cAvailabilityRoutes
        cApp --> cStaffRoutes
        cAuthRoutes --> cAuthController
        cSlotRoutes --> cSlotController
        cReservationRoutes --> cReservationController
        cAvailabilityRoutes --> cAvailabilityController
        cStaffRoutes --> cHikersController
        cStaffRoutes --> cStaffReservationsController
        cMiddleware -.->|"protects"| cSlotRoutes
        cMiddleware -.->|"protects"| cReservationRoutes
        cMiddleware -.->|"protects"| cStaffRoutes
    end
    subgraph BusinessLayer["Business Logic"]
        cAuthService["Auth service"]
        cSlotService["Slot service"]
        cReservationService["Reservation service"]
        cAssignmentService["Table allocation"]
        cAvailabilityService["Availability service"]
        cConfirmationService["Confirmation email service"]
        cStaffReservationsService["Staff booking service"]
        cHikersService["Hiker search service"]
        cResetEmailService["Password reset email service"]
        cEmailSender["Email sender"]
        cReservationService --> cAssignmentService
        cReservationService --> cConfirmationService
        cConfirmationService --> cEmailSender
        cStaffReservationsService --> cAssignmentService
        cStaffReservationsService --> cConfirmationService
        cAuthService --> cResetEmailService
        cResetEmailService --> cEmailSender
    end
    subgraph DataAccessLayer["Data Access"]
        cAuthRepository["Auth repository"]
        cSlotRepository["Slot repository"]
        cReservationRepository["Reservation repository"]
        cAvailabilityRepository["Availability repository"]
        cStaffReservationsRepository["Staff booking repository"]
        cHikersRepository["Hiker search repository"]
        cPool["pg connection pool"]
        cAuthRepository --> cPool
        cSlotRepository --> cPool
        cReservationRepository --> cPool
        cAvailabilityRepository --> cPool
        cStaffReservationsRepository --> cPool
        cHikersRepository --> cPool
    end
    cAuthContext -->|"login and session checks"| cAuthRoutes
    cBooking -->|"creates reservation"| cReservationRoutes
    cStaff -->|"manages slots"| cSlotRoutes
    cAvailability -->|"checks seats"| cAvailabilityRoutes
    cStaffBookings -->|"lists bookings"| cReservationRoutes
    cStaffBookings -->|"searches hikers and books"| cStaffRoutes
    cRecovery -->|"requests or confirms a reset"| cAuthRoutes
    cAuthController --> cAuthService
    cSlotController --> cSlotService
    cReservationController --> cReservationService
    cAvailabilityController --> cAvailabilityService
    cHikersController --> cHikersService
    cStaffReservationsController --> cStaffReservationsService
    cAuthService --> cAuthRepository
    cSlotService --> cSlotRepository
    cReservationService --> cReservationRepository
    cAvailabilityService --> cAvailabilityRepository
    cHikersService --> cHikersRepository
    cStaffReservationsService --> cStaffReservationsRepository
    cStaffReservationsService --> cSlotRepository
    cStaffReservationsService --> cReservationRepository
```

### Component Inventory

| Component | Layer | Responsibility |
| --- | --- | --- |
| Booking/change, staff slot/list/wizard, and availability pages | Frontend | Collect user input and display API results |
| Forgot/reset password pages | Frontend | Request a recovery email and submit a token/new password |
| Auth context | Frontend | Maintain the current authenticated-user state |
| Express app and route modules | HTTP API | Configure middleware and map versioned endpoints |
| Controllers | HTTP API | Translate HTTP requests and responses to service calls |
| Auth and role middleware | HTTP API | Validate cookie-based authentication and authorization |
| Auth, slot, reservation, staff booking, hiker search, and availability services | Business logic | Enforce user-story rules and coordinate persistence |
| Table allocation | Business logic | Allocate party seats across the tables in a slot |
| Confirmation and password-reset email services | Business logic | Render/send booking confirmation/update messages and recovery links |
| Repositories | Data access | Execute parameterized PostgreSQL queries |
| `pg` connection pool | Data access | Reuse database connections |

See the [README architecture overview](../README.md#architecture) and [database documentation](./database.md) for the visual diagrams and schema details.

## Integration boundaries

`staff.routes.js` currently declares `/staff/hikers` and `/staff/reservations`, and `app.js` mounts it twice. Canonical clients use `/api/v1/staff/...`; the second mount creates redundant aliases. Employee controllers/services remain in the tree, but their routes and the required shared `createAccount` export are missing. Ordinary password change reaches a missing service method. These retained modules are not shown as functioning paths in the diagram.

Cancellation metadata already exists in PostgreSQL and list queries, but MH-08 write routes, controls, and mail handling need integration from `dev`. The [MH-08 guide](stories_detail/MH-08-cancel-a-booking.md) preserves that contract. There is no background mail queue, retry worker, or automatic schema migration.
