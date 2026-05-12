import crypto from 'crypto';

/**
 * AES-256-GCM encryption helpers for storing mailbox passwords at rest.
 *
 * Required env var:
 *   MAIL_ENCRYPTION_KEY  =  64-char hex string  (32 bytes)
 *
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Ciphertext format stored in DB:
 *   <iv_hex>:<authTag_hex>:<cipherText_hex>
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

let cachedKey = null;
const getKey = () => {
  if (cachedKey) return cachedKey;
  const raw = process.env.MAIL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'MAIL_ENCRYPTION_KEY is missing. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" and add it to .env'
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('MAIL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  cachedKey = Buffer.from(raw, 'hex');
  return cachedKey;
};

export const encryptSecret = (plain) => {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('encryptSecret: plain text required');
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptSecret = (payload) => {
  if (typeof payload !== 'string' || !payload.includes(':')) {
    throw new Error('decryptSecret: invalid payload');
  }
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('decryptSecret: malformed payload');
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

export const generateMessageId = (domain = 'crm.local') => {
  const random = crypto.randomBytes(12).toString('hex');
  return `<${Date.now()}.${random}@${domain}>`;
};
