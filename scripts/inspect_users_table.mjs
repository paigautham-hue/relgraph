import pg from 'pg';

const { Client } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const columns = await client.query(`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'users'
      order by ordinal_position
    `);

    console.log(JSON.stringify(columns.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
