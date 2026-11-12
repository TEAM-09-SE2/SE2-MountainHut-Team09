# Architecture Diagram

Mountain Hut is a client-server web application. The browser communicates with a versioned Express API, which coordinates domain services, PostgreSQL persistence, and booking-confirmation email delivery.

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
    ServicesA -.->|"confirmation after commit"| EmailA
```

### Technology and Data Storage

| Area | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React 18, React Router 7, Vite 8, Tailwind CSS 4 | Hiker and staff user interfaces |
| Backend | Node.js, Express 5, ES modules, `tsx` | Versioned HTTP API and server startup |
| Authentication | JSON Web Tokens in HTTP-only cookies | Authenticated requests and role checks |
| Persistence | PostgreSQL through `pg` | Users, meal slots, tables, reservations, and seat allocations |
| Email | Nodemailer and React Email | Booking confirmation delivery over configured SMTP |
| Frontend tests | Vitest and Testing Library | Component and interaction tests |
| Backend tests | Node.js test runner with `tsx` | Service and API tests |

PostgreSQL is the only application database. The repository's Docker Compose configuration uses PostgreSQL 16; local development has also been verified with PostgreSQL 17. Docker is optional when a local PostgreSQL service and SMTP configuration are available. Mailpit is an optional development SMTP inbox, not a production dependency.

The schema defines seven tables: `app_user`, `slot`, `slot_table`, `reservation`, `reservation_seat`, `reservation_requirement`, and `password_reset_token`, plus the `slot_table_free` view. A slot's capacity is the sum of its table seat counts. The view derives per-table free seats from confirmed reservation allocations. Composite foreign keys in `reservation_seat` enforce that a reservation and its table belong to the same slot.

### Key Design Decisions

- HTTP routes, controllers, domain services, and repositories form separate backend layers.
- Reservation allocation is performed as a database operation; availability is an advisory query and does not hold seats.
- Confirmation email delivery follows the reservation write and is best-effort: a mail failure does not roll back a successful booking.
- No cache, queue, or ORM is used; persistence is implemented with SQL and the `pg` connection pool.

## Component Relationships

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart LR
    subgraph PresentationLayer["Presentation"]
        cBrowser["Browser"]
        cBooking["Booking page"]
        cStaff["Staff slot page"]
        cAvailability["Availability page"]
        cAuthContext["Auth context"]
        cBrowser --> cBooking
        cBrowser --> cStaff
        cBrowser --> cAvailability
        cBooking --> cAuthContext
        cStaff --> cAuthContext
    end
    subgraph HttpLayer["HTTP API"]
        cApp["Express app"]
        cAuthRoutes["Auth routes"]
        cSlotRoutes["Slot routes"]
        cReservationRoutes["Reservation routes"]
        cAvailabilityRoutes["Availability routes"]
        cMiddleware["Auth and role middleware"]
        cAuthController["Auth controller"]
        cSlotController["Slot controller"]
        cReservationController["Reservation controller"]
        cAvailabilityController["Availability controller"]
        cApp --> cAuthRoutes
        cApp --> cSlotRoutes
        cApp --> cReservationRoutes
        cApp --> cAvailabilityRoutes
        cAuthRoutes --> cAuthController
        cSlotRoutes --> cSlotController
        cReservationRoutes --> cReservationController
        cAvailabilityRoutes --> cAvailabilityController
        cMiddleware -.->|"protects"| cSlotRoutes
        cMiddleware -.->|"protects"| cReservationRoutes
    end
    subgraph BusinessLayer["Business Logic"]
        cAuthService["Auth service"]
        cSlotService["Slot service"]
        cReservationService["Reservation service"]
        cAssignmentService["Table allocation"]
        cAvailabilityService["Availability service"]
        cConfirmationService["Confirmation email service"]
        cEmailSender["Email sender"]
        cReservationService --> cAssignmentService
        cReservationService --> cConfirmationService
        cConfirmationService --> cEmailSender
    end
    subgraph DataAccessLayer["Data Access"]
        cAuthRepository["Auth repository"]
        cSlotRepository["Slot repository"]
        cReservationRepository["Reservation repository"]
        cAvailabilityRepository["Availability repository"]
        cPool["pg connection pool"]
        cAuthRepository --> cPool
        cSlotRepository --> cPool
        cReservationRepository --> cPool
        cAvailabilityRepository --> cPool
    end
    cAuthContext -->|"login and session checks"| cAuthRoutes
    cBooking -->|"creates reservation"| cReservationRoutes
    cStaff -->|"manages slots"| cSlotRoutes
    cAvailability -->|"checks seats"| cAvailabilityRoutes
    cAuthController --> cAuthService
    cSlotController --> cSlotService
    cReservationController --> cReservationService
    cAvailabilityController --> cAvailabilityService
    cAuthService --> cAuthRepository
    cSlotService --> cSlotRepository
    cReservationService --> cReservationRepository
    cAvailabilityService --> cAvailabilityRepository
```

### Component Inventory

| Component | Layer | Responsibility |
| --- | --- | --- |
| Booking, staff slot, and availability pages | Frontend | Collect user input and display API results |
| Auth context | Frontend | Maintain the current authenticated-user state |
| Express app and route modules | HTTP API | Configure middleware and map versioned endpoints |
| Controllers | HTTP API | Translate HTTP requests and responses to service calls |
| Auth and role middleware | HTTP API | Validate cookie-based authentication and authorization |
| Auth, slot, reservation, and availability services | Business logic | Enforce user-story rules and coordinate persistence |
| Table allocation | Business logic | Allocate party seats across the tables in a slot |
| Confirmation email service | Business logic | Render and send booking confirmation messages |
| Repositories | Data access | Execute parameterized PostgreSQL queries |
| `pg` connection pool | Data access | Reuse database connections |

See the [README architecture overview](../README.md#architecture) and [database documentation](./database.md) for the visual diagrams and schema details.
