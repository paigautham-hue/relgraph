import mysql from "mysql2/promise";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

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

const [rows] = await pool.query(`
  select column_name as columnName, data_type as dataType, is_nullable as isNullable, column_default as columnDefault
  from information_schema.columns
  where table_schema = database() and table_name = 'domains'
  order by ordinal_position
`);

console.log(JSON.stringify(rows, null, 2));
await pool.end();
