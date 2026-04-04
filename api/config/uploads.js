import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Project-root `uploads/` (same folder whether server runs from repo root). */
export const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_ROOT)) {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  }
}

/**
 * Public base URL for building links (WhatsApp requires HTTPS).
 * Set PUBLIC_BASE_URL=https://yourdomain.com in production behind proxies.
 */
export function publicRequestBaseUrl(req) {
  const env = process.env.PUBLIC_BASE_URL;
  if (env && String(env).trim()) {
    return String(env).trim().replace(/\/$/, '');
  }
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}
