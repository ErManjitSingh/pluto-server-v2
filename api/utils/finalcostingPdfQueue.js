/**
 * Serial PDF queue with hard job timeout.
 * Without this, one hung Puppeteer job blocks ALL later PDF downloads forever
 * (Cloudflare then returns 504 without CORS → browser shows fake CORS error).
 */
const DEFAULT_JOB_TIMEOUT_MS = 45000;

let tail = Promise.resolve();

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label || 'PDF job'} timeout after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {() => Promise<any>} job
 * @param {{ timeoutMs?: number }} [opts]
 */
export function enqueuePdfJob(job, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;

  const run = tail.then(() => withTimeout(Promise.resolve().then(job), timeoutMs, 'PDF queue job'));

  // Always advance queue — even on hang/timeout — so next download is not blocked
  tail = run.catch((err) => {
    console.error('[pdf-queue] job failed (queue continues):', err?.message || err);
  });

  return run;
}
