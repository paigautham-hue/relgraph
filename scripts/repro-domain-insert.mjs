import { randomUUID } from "crypto";
import mysql from "mysql2/promise";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const pool = mysql.createPool({
  uri: connectionString,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
  enableKeepAlive: true,
  supportBigNumbers: true,
  namedPlaceholders: false,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

const id = randomUUID();
const name = `debug-domain-${Date.now()}`;

try {
  const [result] = await pool.query(
    "insert into domains (id, name, description, color, is_active, created_at, updated_at) values (?, ?, ?, ?, ?, now(), now())",
    [id, name, "debug insert", "#12a57b", 1],
  );
  console.log(JSON.stringify({ ok: true, id, name, result }, null, 2));

  const [rows] = await pool.query("select * from domains where id = ? limit 1", [id]);
  console.log(JSON.stringify({ selected: rows }, null, 2));

  await pool.query("delete from domains where id = ?", [id]);
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message, code: error.code, sqlMessage: error.sqlMessage, sql: error.sql }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
