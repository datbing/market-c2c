/**
 * Express application setup (BACKEND API ONLY):
 *  - JSON API at /api
 *  - Uploaded images at /uploads
 * The frontend lives separately in /frontend, served by Apache (Laragon) at
 * https://market-c2c.test, and calls this API (https://market-c2c.test:3000) via CORS.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { config } from './config/env.js';
import apiRouter from './routes/index.js';
import { cors } from './middleware/cors.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const app = express();
app.disable('x-powered-by');

// CORS goes first so both /api and /uploads get the right headers
app.use(cors);

// ---------- Uploaded images ----------
app.use(
  '/uploads',
  express.static(path.join(ROOT_DIR, 'uploads'), {
    // Allow pages from other origins to display the images
    setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  }),
);

// ---------- API ----------
const sessionMiddleware = session({
  name: config.session.cookieName,
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false, // only create a session on login
  cookie: {
    httpOnly: true, // client-side JS cannot read the cookie -> limits session theft via XSS
    // Lax: the cookie is still sent between https://market-c2c.test and https://market-c2c.test:3000
    // because they differ only by port and are the same "site" (same https scheme + same domain)
    sameSite: 'lax',
    secure: true, // only sent over HTTPS (the server always runs https)
    maxAge: config.session.maxAgeMs,
  },
});

app.use(
  '/api',
  express.json({ limit: '1mb' }),
  express.urlencoded({ extended: true }),
  sessionMiddleware,
  apiRouter,
  apiNotFound,
);

// ---------- Root path: short description ----------
app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Market C2C API',
      health: '/api/health',
      frontend: config.corsOrigins[0] ?? null,
    },
  });
});

// ---------- Unknown paths ----------
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Không tìm thấy đường dẫn' });
});

// ---------- Error handling (always last) ----------
app.use(errorHandler);
