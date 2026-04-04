import multer from 'multer';
import { UPLOADS_ROOT, ensureUploadsDir } from '../config/uploads.js';

ensureUploadsDir();

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOADS_ROOT);
  },
  filename(_req, file, cb) {
    const base = (file.originalname || 'file').replace(/[^\w.\-()+]/g, '_');
    cb(null, `${Date.now()}-${base}`);
  },
});

/** Single file field name: `file` — max ~16MB (WhatsApp document limit is 100MB for some types; keep reasonable). */
export const whatsappUploadSingle = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});
