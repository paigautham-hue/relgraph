import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./db/schema";

let _pool: mysql.Pool | null = null;
let _db: MySql2Database<typeof schema> | null = null;

function getPool(): mysql.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("[Database] DATABASE_URL environment variable is not set");
    }
    _pool = mysql.createPool({
      uri: connectionString,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      supportBigNumbers: true,
      namedPlaceholders: false,
      ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    });
  }
  return _pool;
}

export function getDb(): MySql2Database<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema, mode: "default" });
  }
  return _db;
}

export type Database = MySql2Database<typeof schema>;

export { schema };
