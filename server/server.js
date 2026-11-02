/**
 * Server entry point.
 *  1. Check the MySQL connection; on failure explain how to fix it and exit.
 *  2. Read the SSL certificate and serve the API over HTTPS (the frontend runs on https so the API
 *     must be https too, otherwise the browser blocks it as "mixed content").
 */
import fs from 'node:fs';
import https from 'node:https';
import { app } from './app.js';
import { config } from './config/env.js';
import { pool, checkConnection } from './config/db.js';

/** Read the certificate + key files; if missing, print instructions and exit */
function loadSslOptions() {
  const { certFile, keyFile } = config.ssl;
  try {
    return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
  } catch (err) {
    console.error(`Could not read the SSL certificate: ${err.message}`);
    console.error('  -> Laragon: Menu > Apache > SSL > Enabled to generate the certificate');
    console.error(`  -> Or point SSL_CERT / SSL_KEY in .env to other files`);
    console.error(`     (currently: ${certFile} | ${keyFile})`);
    process.exit(1);
  }
}

async function bootstrap() {
  try {
    await checkConnection();
    console.log(`Connected to MySQL (database: ${config.db.database})`);
  } catch (err) {
    console.error(`Cannot connect to MySQL: ${err.message}`);
    console.error('Check MySQL already running?');
    console.error('Check .env config: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE');
    console.error('`npm run db:setup` ?');
    process.exit(1);
  }

  const server = https.createServer(loadSslOptions(), app);
  server.listen(config.port, () => {
    console.log(`API running at https://market-c2c.test:${config.port}`);
    console.log(`Frontend CORS accepted: ${config.corsOrigins.join(', ')}`);
  });

  // Shut the server down cleanly on Ctrl + C
  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
