# syntax=docker/dockerfile:1
# Mountain Hut release image: the full deployment in one container.
#   PostgreSQL 16 - schema and test data are loaded on the first start
#   API (Node 22) - also serves the built frontend, port 8080
#   Mailpit       - catches the emails, inbox on port 8025
# Build from App/:  docker build -f docker/Dockerfile -t mountainhut .
# Secrets (DB_PASSWORD, JWT_SECRET) are not in the image: pass them with --env-file at run time.

# Frontend: static files, so it is built once on the build machine's own platform
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# --ignore-scripts: dependencies cannot run their own install scripts during the build
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY frontend/ ./
# Empty origin: the browser calls /api/v1 on the server that serves the page
RUN VITE_API_ORIGIN= npm run build

# Backend dependencies, installed for the target platform (tsx ships a native esbuild binary)
FROM node:22-bookworm-slim AS backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
# tsconfig.json tells tsx how to compile the JSX email templates
COPY backend/tsconfig.json ./
COPY backend/src ./src

FROM axllent/mailpit:v1.33.1 AS mailpit

# Final image: the official PostgreSQL image plus Node, Mailpit and the app
FROM postgres:16-bookworm
# CA certificates: Mailpit verifies Gmail's TLS certificate when it relays the emails
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=backend /usr/local/bin/node /usr/local/bin/node
COPY --from=mailpit /mailpit /usr/local/bin/mailpit
COPY --from=backend /app/backend /app/backend
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY docker/postgres/schema.sql /docker-entrypoint-initdb.d/01-schema.sql
COPY docker/postgres/seed.sql /docker-entrypoint-initdb.d/02-seed.sql
COPY --chmod=755 docker/start.sh /usr/local/bin/mountainhut-start
# Strip Windows line endings in case start.sh was checked out with CRLF (bash would refuse to run it)
RUN sed -i 's/\r$//' /usr/local/bin/mountainhut-start \
 && useradd --system --no-create-home --shell /usr/sbin/nologin mountainhut

# Logs and psql show times in the hut's time zone. Not a setting: the app itself always uses Europe/Rome.
ENV TZ=Europe/Rome
# Settings you may override with -e NAME=value. The fixed layout (ports, internal database, Mailpit) is in start.sh.
ENV CLIENT_URL=http://localhost:8080 \
    DB_NAME=mountainhut_db \
    DB_USER=mountainhut \
    MAIL_FROM="Mountain Hut <noreply@mountainhut.local>"

EXPOSE 8080 8025
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/v1/availability?date=2000-01-01&time=12:00&partySize=1').then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["mountainhut-start"]
