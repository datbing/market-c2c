/**
 * Create the database + every table from database/schema.sql.
 *   npm run db:setup          -> create if missing (keeps existing data)
 *   npm run db:reset          -> DROP the database, recreate it and seed sample data
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../server/config/env.js';
import { UPLOAD_DIR } from '../server/utils/image-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../database/schema.sql');
const isReset = process.argv.includes('--reset');

const { database, ...connectionOptions } = config.db;

// The database name is inserted directly into SQL, so it must be validated
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  console.error('DB_NAME may only contain letters, digits and underscores');
  process.exit(1);
}

let connection;
try {
  // Connect without selecting a database since it may not exist yet
  connection = await mysql.createConnection({
    ...connectionOptions,
    charset: 'utf8mb4',
    multipleStatements: true, // allows running the whole schema.sql at once
  });

  if (isReset) {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    console.log(`Dropped database "${database}"`);
    // Listing images belong to the old database -> remove them too, avoiding orphaned files in uploads/
    await fs.rm(path.join(UPLOAD_DIR, 'listings'), { recursive: true, force: true });
    console.log('Removed images in uploads/listings');
  }

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.query(`USE \`${database}\``);

  const schemaSql = await fs.readFile(SCHEMA_PATH, 'utf8');
  await connection.query(schemaSql);

  const [tables] = await connection.query('SHOW TABLES');
  console.log(`Database "${database}" is ready with ${tables.length} tables:`);
  tables.forEach((row) => console.log('   -', Object.values(row)[0]));
} catch (err) {
  console.error(`Failed to create the database: ${err.message}`);
  console.error('Check that MySQL is running and the settings in .env');
  process.exitCode = 1;
} finally {
  await connection?.end();
}
