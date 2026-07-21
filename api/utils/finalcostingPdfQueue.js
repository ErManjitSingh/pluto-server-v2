/** Serializes PDF jobs so multiple executives don't spawn many Chrome instances at once. */
let tail = Promise.resolve();

export function enqueuePdfJob(job) {
  const run = tail.then(() => job());
  tail = run.catch(() => {});
  return run;
}
