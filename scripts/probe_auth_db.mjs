import pg from 'pg';

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    const version = await client.query('select version() as version, current_database() as current_database, current_schema() as current_schema');
    console.log('connection_ok', JSON.stringify(version.rows[0], null, 2));

    const tables = await client.query("select table_schema, table_name from information_schema.tables where table_name = 'users' order by table_schema, table_name");
    console.log('users_tables', JSON.stringify(tables.rows, null, 2));

    const columns = await client.query("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'users' order by ordinal_position");
    console.log('public_users_columns', JSON.stringify(columns.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('probe_failed');
  console.error(error?.message || error);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
