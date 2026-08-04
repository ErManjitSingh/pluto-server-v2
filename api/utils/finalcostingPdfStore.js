import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

/** PDF files on disk — not in Mongo (keeps DB light). */
export const FINALCOSTING_PDF_DIR = path.join(
  process.cwd(),
  'uploads',
  'finalcosting-pdfs'
);

function ensureDir() {
  if (!existsSync(FINALCOSTING_PDF_DIR)) {
    mkdirSync(FINALCOSTING_PDF_DIR, { recursive: true });
  }
}

export function pdfFileName(operationId, brand) {
  const b = brand === 'demandsetu' ? 'demandsetu' : 'ptw';
  return `${String(operationId)}-${b}.pdf`;
}

export function pdfAbsolutePath(operationId, brand) {
  return path.join(FINALCOSTING_PDF_DIR, pdfFileName(operationId, brand));
}

export async function writeStoredPdf(operationId, brand, buffer) {
  ensureDir();
  const filePath = pdfAbsolutePath(operationId, brand);
  await fs.writeFile(filePath, buffer);
  return {
    fileName: pdfFileName(operationId, brand),
    bytes: buffer.length,
    absolutePath: filePath,
  };
}

export async function readStoredPdf(operationId, brand) {
  const filePath = pdfAbsolutePath(operationId, brand);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function deleteStoredPdf(operationId, brand) {
  const filePath = pdfAbsolutePath(operationId, brand);
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore missing */
  }
}

export async function deleteAllStoredPdfs(operationId) {
  await Promise.all([
    deleteStoredPdf(operationId, 'ptw'),
    deleteStoredPdf(operationId, 'demandsetu'),
  ]);
}
