import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const WHATSAPP_OUTBOUND_DIR = path.join(process.cwd(), 'uploads', 'whatsapp-outbound');

/** WhatsApp Cloud API document limit is 100 MB. */
const MAX_BYTES = 100 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(WHATSAPP_OUTBOUND_DIR, { recursive: true });
    cb(null, WHATSAPP_OUTBOUND_DIR);
  },
  filename(req, file, cb) {
    const token = crypto.randomBytes(32).toString('hex');
    req.whatsappUploadToken = token;
    const ext = path.extname(file.originalname || '').slice(0, 32);
    cb(null, `${token}${ext}`);
  },
});

export const whatsappOutboundUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
});
