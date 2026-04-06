import mysql from 'mysql2/promise';

const uri = process.env.DATABASE_URL;
if (!uri) {
  throw new Error('DATABASE_URL is not set');
}

const pool = mysql.createPool({
  uri,
  waitForConnections: true,
  connectionLimit: 4,
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
});

const targets = ['users', 'audit_log', 'apify_source_configs', 'apify_runs', 'bank_leadership_records'];

for (const table of targets) {
  try {
    const [rows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
    console.log(`\n=== ${table} ===`);
    console.log(rows[0]['Create Table']);
  } catch (error) {
    console.log(`\n=== ${table} ===`);
    console.log(`ERROR: ${error.message}`);
  }
}

await pool.end();
