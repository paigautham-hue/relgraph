import pg from "pg";

const connectionString = process.env.DATABASE_URL;
console.log("has_database_url", Boolean(connectionString));

if (!connectionString) {
  process.exit(0);
}

const pool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

try {
  const version = await pool.query("select version() as version");
  const tables = await pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name limit 30",
  );

  console.log("db_version", version.rows[0]?.version ?? "unknown");
  console.log("table_count", tables.rowCount ?? 0);
  console.log(JSON.stringify(tables.rows, null, 2));
} catch (error) {
  console.error("db_error", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => undefined);
}
