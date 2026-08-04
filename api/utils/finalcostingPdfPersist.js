import Operation from '../models/finalcosting.model.js';
import { generateFinalCostingPdfBuffer } from './finalcostingPdf.js';
import {
  writeStoredPdf,
  readStoredPdf,
  deleteStoredPdf,
} from './finalcostingPdfStore.js';

/** Same slim projection as download controller — no selectedHotel bloat. */
export const PDF_OPERATION_PROJECTION = {
  id: 1,
  userId: 1,
  customerLeadId: 1,
  updatedAt: 1,
  createdAt: 1,
  finalTotal: 1,
  total: 1,
  discountPercentage: 1,
  totals: 1,
  'hotels.day': 1,
  'hotels.propertyName': 1,
  'hotels.cityName': 1,
  'hotels.roomName': 1,
  'hotels.mealPlan': 1,
  'hotels.roomcount': 1,
  'hotels.selectedLead': 1,
  'package.packageName': 1,
  'package.state': 1,
  'package.duration': 1,
  'package.packageType': 1,
  'package.tags': 1,
  'package.pickupLocation': 1,
  'package.dropLocation': 1,
  'package.packagePlaces': 1,
  'package.packageDescription': 1,
  'package.packageInclusions': 1,
  'package.packageExclusions': 1,
  'package.teamLeader': 1,
  'package.teamLeaderId': 1,
  'package.customExclusions': 1,
  'package.itineraryDays.day': 1,
  'package.itineraryDays.similarhotel': 1,
  'package.itineraryDays.selectedItinerary': 1,
  'transfer.selectedLead': 1,
  'transfer.details': 1,
  'transfer.itineraryDays.day': 1,
  'transfer.itineraryDays.similarhotel': 1,
  'transfer.itineraryDays.selectedItinerary': 1,
  pdfArtifacts: 1,
};

/** @type {Map<string, Promise<{ buffer: Buffer, cacheHit: boolean, source: string, timings?: object }>>} */
const inFlight = new Map();

function flightKey(operationId, brand) {
  return `${operationId}|${brand === 'demandsetu' ? 'demandsetu' : 'ptw'}`;
}

function snapshotUpdatedAt(updatedAt) {
  if (!updatedAt) return '';
  return updatedAt instanceof Date
    ? updatedAt.toISOString()
    : String(updatedAt);
}

function sanitizeItineraryDays(itineraryDays) {
  if (!Array.isArray(itineraryDays)) return itineraryDays;
  return itineraryDays.map((dayEntry) => {
    if (!dayEntry || typeof dayEntry !== 'object') return dayEntry;
    const { selectedHotel, ...rest } = dayEntry;
    return rest;
  });
}

function sanitizeOperationForPdf(operation) {
  if (!operation || typeof operation !== 'object') return operation;
  const sanitized = { ...operation };
  if (operation.package && typeof operation.package === 'object') {
    sanitized.package = {
      ...operation.package,
      itineraryDays: sanitizeItineraryDays(operation.package.itineraryDays),
    };
  }
  if (operation.transfer && typeof operation.transfer === 'object') {
    sanitized.transfer = {
      ...operation.transfer,
      itineraryDays: sanitizeItineraryDays(operation.transfer.itineraryDays),
    };
  }
  return sanitized;
}

async function setArtifact(operationId, brand, patch) {
  const prefix = `pdfArtifacts.${brand}`;
  const $set = {};
  for (const [k, v] of Object.entries(patch)) {
    $set[`${prefix}.${k}`] = v;
  }
  await Operation.updateOne({ _id: operationId }, { $set }).catch((err) => {
    console.error('[pdf-persist] meta update failed:', err?.message || err);
  });
}

/**
 * Generate PDF, write disk, update Operation.pdfArtifacts.
 * Deduped per operation+brand so download can await the same job as pre-generate.
 */
export async function ensurePdfReady(operationId, brand = 'ptw') {
  const b = brand === 'demandsetu' ? 'demandsetu' : 'ptw';
  const key = flightKey(operationId, b);

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const job = (async () => {
    const meta = await Operation.findById(operationId)
      .select('updatedAt pdfArtifacts')
      .lean()
      .maxTimeMS(8000);

    if (!meta) {
      throw new Error('Operation not found');
    }

    const snap = snapshotUpdatedAt(meta.updatedAt);
    const art = meta.pdfArtifacts?.[b];

    if (art?.status === 'ready' && art.fileName && art.updatedAtSnapshot === snap) {
      const disk = await readStoredPdf(operationId, b);
      if (disk?.length) {
        return {
          buffer: disk,
          cacheHit: true,
          source: 'disk',
          timings: { totalMs: 0, cacheHit: true },
        };
      }
    }

    await setArtifact(operationId, b, {
      status: 'generating',
      error: null,
    });

    const operation = await Operation.findById(operationId)
      .select(PDF_OPERATION_PROJECTION)
      .lean()
      .maxTimeMS(12000);

    if (!operation) {
      throw new Error('Operation not found');
    }

    const sanitized = sanitizeOperationForPdf(operation);
    const { buffer, cacheHit, timings } = await generateFinalCostingPdfBuffer(
      sanitized,
      b
    );

    const written = await writeStoredPdf(operationId, b, buffer);
    const freshSnap = snapshotUpdatedAt(operation.updatedAt);

    await setArtifact(operationId, b, {
      status: 'ready',
      fileName: written.fileName,
      bytes: written.bytes,
      generatedAt: new Date(),
      updatedAtSnapshot: freshSnap,
      error: null,
    });

    console.log(
      `[pdf-persist] ${b} ready id=${operationId} bytes=${written.bytes} gen=${timings?.totalMs ?? '?'}ms`
    );

    return {
      buffer,
      cacheHit: Boolean(cacheHit),
      source: cacheHit ? 'memory' : 'generated',
      timings,
    };
  })()
    .catch(async (err) => {
      await setArtifact(operationId, b, {
        status: 'failed',
        error: err?.message || 'PDF generation failed',
      });
      throw err;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, job);
  return job;
}

/** Mark stored PDFs stale after costing changes (then regenerate in background). */
export async function invalidatePdfArtifacts(operationId) {
  await Operation.updateOne(
    { _id: operationId },
    {
      $set: {
        'pdfArtifacts.ptw.status': 'none',
        'pdfArtifacts.demandsetu.status': 'none',
        'pdfArtifacts.ptw.error': null,
        'pdfArtifacts.demandsetu.error': null,
      },
    }
  ).catch(() => {});
  await Promise.all([
    deleteStoredPdf(operationId, 'ptw'),
    deleteStoredPdf(operationId, 'demandsetu'),
  ]);
}

/**
 * Fire-and-forget pre-generate both brands after save.
 * Download can join the same in-flight promise via ensurePdfReady.
 */
export function schedulePdfPreGenerate(operationId) {
  if (!operationId) return;
  const id = String(operationId);

  setImmediate(() => {
    (async () => {
      // Serial brands share Chrome queue — ptw then demandsetu
      try {
        await ensurePdfReady(id, 'ptw');
      } catch (err) {
        console.error(`[pdf-persist] pre-gen ptw failed id=${id}:`, err?.message || err);
      }
      try {
        await ensurePdfReady(id, 'demandsetu');
      } catch (err) {
        console.error(
          `[pdf-persist] pre-gen demandsetu failed id=${id}:`,
          err?.message || err
        );
      }
    })();
  });
}

/** After create/update: invalidate old files + start background generate. */
export async function onFinalCostingSaved(operationId) {
  if (!operationId) return;
  const id = String(operationId);
  try {
    await invalidatePdfArtifacts(id);
  } catch (err) {
    console.error('[pdf-persist] invalidate failed:', err?.message || err);
  }
  schedulePdfPreGenerate(id);
}
