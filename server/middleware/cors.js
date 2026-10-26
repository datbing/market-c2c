/**
 * CORS: lets the frontend (another origin, e.g. https://market-c2c.test) call the API
 * at https://market-c2c.test:3000 and send the session cookie.
 *
 * Hand-written instead of the `cors` package to show the mechanism clearly:
 *  - Only whitelisted origins get the Access-Control-Allow-Origin header
 *  - With cookies (credentials) "*" is NOT allowed, the exact origin must be echoed
 *  - "Preflight" requests (OPTIONS) get a 204 immediately, without reaching the router
 */
import { config } from '../config/env.js';

const allowedOrigins = new Set(config.corsOrigins);

export function cors(req, res, next) {
  const { origin } = req.headers;

  // The response varies by Origin -> tell caches/proxies
  res.vary('Origin');

  if (origin && allowedOrigins.has(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });
  }

  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '600', // the browser caches the preflight result for 10 minutes
    });
    return res.sendStatus(204);
  }

  next();
}
