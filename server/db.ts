import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./db/schema";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("[Database] DATABASE_URL environment variable is not set");
    }
    _pool = new Pool({ connectionString });
  }
  return _pool;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;

export { schema };
