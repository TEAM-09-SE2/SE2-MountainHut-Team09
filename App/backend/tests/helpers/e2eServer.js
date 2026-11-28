// Shared lifecycle helpers for end-to-end tests that start the app and a fake SMTP server.
import assert from "node:assert/strict";

// Environment variables that the e2e tests override and must restore at the end.
export const E2E_ENV_VARIABLES = ["JWT_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"];

export const saveEnv = (names = E2E_ENV_VARIABLES) => Object.fromEntries(names.map((name) => [name, process.env[name]]));

export function restoreEnv(savedEnv) {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

// Starts listening on a random local port and returns it.
export async function listen(target, port = 0) {
  await new Promise((resolve, reject) => {
    target.once("error", reject);
    target.listen(port, "127.0.0.1", () => {
      target.off("error", reject);
      resolve();
    });
  });
  return target.address().port;
}

// Waits for a server created with app.listen(...) and returns its API base URL.
export async function apiBaseUrl(server) {
  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.once("listening", resolve);
    });
  }
  return `http://127.0.0.1:${server.address().port}/api/v1`;
}

export async function closeHttpServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

// Logs in through the API and returns the auth cookie to send with the next requests.
export async function loginCookie(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const token = response.headers.get("set-cookie").match(/(?:^|,\s*)token=([^;]+)/)[1];
  return `token=${token}`;
}
