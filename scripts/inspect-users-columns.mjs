import mysql from 'mysql2/promise';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const pool = mysql.createPool(connectionString);

try {
  const [rows] = await pool.query(`
    select COLUMN_NAME as columnName, IS_NULLABLE as isNullable, COLUMN_TYPE as columnType
    from information_schema.columns
    where table_schema = database() and table_name = 'users'
    order by ordinal_position
  `);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await pool.end();
}
