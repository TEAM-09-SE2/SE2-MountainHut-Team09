#!/usr/bin/env bash
# Entry point of the release image (see Dockerfile). Starts the full deployment:
# PostgreSQL (schema and test data on the first start), Mailpit, and the API, which also serves the frontend.
# If one of them stops, the others are stopped too and the container exits.
set -Eeuo pipefail

missing=()
for name in DB_PASSWORD JWT_SECRET; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing ${missing[*]}: start the container with --env-file secrets.env (from Team09-secrets.zip). See the README." >&2
  exit 1
fi

# The container's own layout, whatever an env file says: the database and Mailpit run inside it,
# and the API always sends its emails to Mailpit (real delivery is Mailpit's relay, below)
export DB_HOST=127.0.0.1 DB_PORT=5432 PORT=8080 HOST=0.0.0.0 FRONTEND_DIST=/app/frontend/dist \
  SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_SECURE=false
unset SMTP_USER SMTP_PASSWORD
# The official PostgreSQL entrypoint creates the role and the database from these on the first start
export POSTGRES_USER="$DB_USER" POSTGRES_PASSWORD="$DB_PASSWORD" POSTGRES_DB="$DB_NAME"

# Real emails (optional): with MP_SMTP_RELAY_* in secrets.env, Mailpit also delivers every email through Gmail.
# An incomplete block would make Mailpit exit, and a server that does not answer would hang every email,
# so in both cases the relay is switched off and the emails stay in Mailpit only.
relay_vars=$(compgen -e | grep '^MP_SMTP_RELAY_' || true)
relay_off() {
  echo "Email relay off: $1. Emails stay in the Mailpit inbox only." >&2
  unset $relay_vars
}
# True if the relay server sends its SMTP greeting within 5 s (over TLS when MP_SMTP_RELAY_TLS=true)
relay_answers() {
  timeout 6 node - 2>/dev/null <<'JS'
const e = process.env, host = e.MP_SMTP_RELAY_HOST, port = Number(e.MP_SMTP_RELAY_PORT || 25);
setTimeout(() => process.exit(1), 5000);
const s = e.MP_SMTP_RELAY_TLS === "true"
  ? require("node:tls").connect({ host, port, servername: host, rejectUnauthorized: e.MP_SMTP_RELAY_ALLOW_INSECURE !== "true" })
  : require("node:net").connect({ host, port });
s.on("error", () => process.exit(1));
s.on("data", (d) => process.exit(String(d).startsWith("220") ? 0 : 1));
JS
}
if [[ -n "$relay_vars" ]]; then
  relay="${MP_SMTP_RELAY_HOST:-}:${MP_SMTP_RELAY_PORT:-25}"
  if [[ -z "${MP_SMTP_RELAY_HOST:-}" || -z "${MP_SMTP_RELAY_USERNAME:-}" || -z "${MP_SMTP_RELAY_PASSWORD:-}" ]]; then
    relay_off "MP_SMTP_RELAY_HOST, MP_SMTP_RELAY_USERNAME and MP_SMTP_RELAY_PASSWORD all need a value"
  elif ! relay_answers; then
    relay_off "cannot reach $relay"
  else
    # Staff test users have @rifugio.it addresses, a real domain that is not ours: their emails stay in Mailpit
    blocked='@rifugio\.it$'
    export MP_SMTP_RELAY_BLOCKED_RECIPIENTS="${MP_SMTP_RELAY_BLOCKED_RECIPIENTS:-$blocked}"
    echo "Email relay on: Mailpit also delivers the emails through $relay"
  fi
else
  relay_off "secrets.env has no MP_SMTP_RELAY_* settings"
fi

# Mailpit's Send API would let anyone who reaches port 8025 inject new emails (relayed through Gmail), so it is
# locked with a random password. The inbox itself has no password: the README publishes 8025 on 127.0.0.1 only,
# and --allowed-hosts stops other websites from reaching it through DNS rebinding.
send_auth=$(mktemp)
echo "send:$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')" > "$send_auth"
chown mountainhut "$send_auth"

api_pid=""
docker-entrypoint.sh postgres &
pg_pid=$!
gosu mountainhut mailpit --quiet --disable-version-check --allowed-hosts localhost,127.0.0.1 --send-api-auth-file "$send_auth" &
mail_pid=$!

stop_all() {
  trap - TERM INT
  if [[ -n "$api_pid" ]]; then kill -TERM "$api_pid" 2>/dev/null || true; fi
  kill -TERM "$mail_pid" 2>/dev/null || true
  kill -INT "$pg_pid" 2>/dev/null || true # PostgreSQL "fast" shutdown
  # Docker kills the container 10 s after "docker stop": if PostgreSQL is still busy after 8 s,
  # use its immediate shutdown (it recovers on the next start)
  for _ in 1 2 3 4 5 6 7 8; do kill -0 "$pg_pid" 2>/dev/null || break; sleep 1; done
  kill -QUIT "$pg_pid" 2>/dev/null || true
  wait || true
}
trap 'stop_all; exit 0' TERM INT

# During the first-start initialisation PostgreSQL listens only on its socket, so this waits for the real server
until pg_isready -q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; do
  kill -0 "$pg_pid" 2>/dev/null || { echo "PostgreSQL did not start" >&2; exit 1; }
  sleep 1
done

cd /app/backend
gosu mountainhut node --import tsx src/server.js &
api_pid=$!
echo "Mountain Hut: app on container port $PORT, email inbox (Mailpit) on container port 8025"

wait -n || true
echo "A process stopped, shutting down the container" >&2
stop_all
exit 1
