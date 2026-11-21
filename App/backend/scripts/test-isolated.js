import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import pool from "../src/database/connection.js";

const schema = `employee_api_tests_${randomUUID().replaceAll("-", "")}`;
const scoped = new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST,
  database: process.env.DB_NAME, password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  options: `-c search_path=${schema}`,
});
let created = false;
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await scoped.query(readFileSync(new URL("../../docker/postgres/schema.sql", import.meta.url), "utf8"));
  console.log(`Running tests in isolated PostgreSQL schema ${schema}`);
  const args = process.argv.slice(2);
  const child = spawn(process.execPath, ["--import", "tsx", "--test", ...args], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, PGOPTIONS: `-c search_path=${schema}` },
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await scoped.end();
  if (created) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
}
