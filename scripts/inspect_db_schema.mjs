import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const connection = await mysql.createConnection(databaseUrl);

const [tables] = await connection.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
  ORDER BY table_name
`);

for (const row of tables) {
  const tableName = row.TABLE_NAME || row.table_name;
  const [columns] = await connection.query(`
    SELECT column_name, column_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ?
    ORDER BY ordinal_position
  `, [tableName]);

  console.log(`\n## ${tableName}`);
  for (const column of columns) {
    const name = column.COLUMN_NAME || column.column_name;
    const type = column.COLUMN_TYPE || column.column_type;
    const nullable = column.IS_NULLABLE || column.is_nullable;
    const defaultValue = column.COLUMN_DEFAULT ?? column.column_default ?? 'NULL';
    console.log(`${name}\t${type}\t${nullable}\t${defaultValue}`);
  }
}

await connection.end();
