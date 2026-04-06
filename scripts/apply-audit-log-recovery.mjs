import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const sql = await readFile(new URL("../drizzle/0003_audit_log_recovery.sql", import.meta.url), "utf8");
const statements = sql
  .split(/;\s*(?:\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const connection = await mysql.createConnection(databaseUrl);
try {
  for (const statement of statements) {
    try {
      await connection.query(statement);
      console.log(`[ok] ${statement.split("\n")[0].slice(0, 120)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message) || /duplicate key name/i.test(message)) {
        console.log(`[skip] ${message}`);
        continue;
      }
      throw error;
    }
  }
} finally {
  await connection.end();
}
