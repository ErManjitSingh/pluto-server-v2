import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

/**
 * Resolve WhatsApp Cloud API media id to a temporary download URL (requires app access token).
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export async function fetchWhatsappMediaDownloadUrl(mediaId, accessToken) {
  if (!mediaId || !accessToken) return null;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await r.json();
    if (!r.ok || !data.url) return null;
    return String(data.url);
  } catch (e) {
    console.error('fetchWhatsappMediaDownloadUrl:', e?.message || e);
    return null;
  }
}

export const WHATSAPP_INBOUND_DIR = path.join(process.cwd(), 'uploads', 'whatsapp-inbound');

function pickExtension(mimeType, filenameHint) {
  if (filenameHint && path.extname(filenameHint)) {
    return path.extname(filenameHint).slice(0, 24);
  }
  const m = (mimeType || '').toLowerCase().split(';')[0].trim();
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
  };
  return map[m] || '.bin';
}

/**
 * Download incoming media from Meta (Bearer on both Graph + CDN) and write to disk.
 * Returns metadata for DB + public URL path `/api/whatsapp/inbound-received/:token` (prepend PUBLIC_BASE_URL).
 */
export async function storeIncomingWhatsappMediaFromMeta(metaMediaId, accessToken, hints = {}) {
  if (!metaMediaId || !accessToken) return null;
  const downloadUrl = await fetchWhatsappMediaDownloadUrl(metaMediaId, accessToken);
  if (!downloadUrl) return null;
  const mediaRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) return null;

  const headerMime = mediaRes.headers.get('content-type') || '';
  const mimeType =
    (headerMime && headerMime.split(';')[0].trim()) ||
    hints.hintMime ||
    'application/octet-stream';

  fs.mkdirSync(WHATSAPP_INBOUND_DIR, { recursive: true });
  const token = crypto.randomBytes(32).toString('hex');
  const ext = pickExtension(mimeType, hints.hintFilename);
  const storedFilename = `${token}${ext}`;
  const destPath = path.join(WHATSAPP_INBOUND_DIR, storedFilename);

  try {
    if (mediaRes.body && typeof Readable.fromWeb === 'function') {
      await pipeline(Readable.fromWeb(mediaRes.body), fs.createWriteStream(destPath));
    } else {
      fs.writeFileSync(destPath, Buffer.from(await mediaRes.arrayBuffer()));
    }
  } catch (e) {
    console.error('storeIncomingWhatsappMediaFromMeta write:', e?.message || e);
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    return null;
  }

  let size = 0;
  try {
    size = fs.statSync(destPath).size;
  } catch {
    /* ignore */
  }

  const originalFilename =
    hints.hintFilename && String(hints.hintFilename).trim()
      ? String(hints.hintFilename).trim()
      : `file${ext}`;

  return { token, storedFilename, mimeType, size, originalFilename };
}
