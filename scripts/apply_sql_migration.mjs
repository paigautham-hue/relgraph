import fs from 'fs/promises';
import mysql from 'mysql2/promise';

const migrationPath = process.argv[2];

if (!migrationPath) {
  throw new Error('Usage: node scripts/apply_sql_migration.mjs <migration.sql>');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const sql = await fs.readFile(migrationPath, 'utf8');
const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  multipleStatements: true,
});

try {
  await connection.beginTransaction();
  await connection.query(sql);
  await connection.commit();
  console.log(`Applied migration: ${migrationPath}`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
