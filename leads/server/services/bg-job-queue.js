/**
 * Cola en proceso con límite de concurrencia (sin Redis).
 * Para trabajo post-cierre: blobs SQL, publicación caja, etc.
 */

/** @type {Map<string, { concurrency: number, running: number, waiting: Array<() => void> }>} */
const queues = new Map();

function getQueue(name, concurrency) {
  let q = queues.get(name);
  if (!q) {
    q = { concurrency: Math.max(1, concurrency), running: 0, waiting: [] };
    queues.set(name, q);
  } else if (concurrency > 0 && concurrency !== q.concurrency) {
    q.concurrency = Math.max(1, concurrency);
  }
  return q;
}

function pump(name) {
  const q = queues.get(name);
  if (!q) return;
  while (q.running < q.concurrency && q.waiting.length > 0) {
    const run = q.waiting.shift();
    q.running += 1;
    Promise.resolve()
      .then(run)
      .catch((err) => {
        console.error(
          `[bg-job:${name}]`,
          err instanceof Error ? err.message : err,
        );
      })
      .finally(() => {
        q.running -= 1;
        pump(name);
      });
  }
}

/**
 * Encola una tarea async. No bloquea al caller.
 * @param {string} name
 * @param {() => Promise<unknown>} fn
 * @param {{ concurrency?: number }} [opts]
 */
export function enqueueBgJob(name, fn, opts = {}) {
  const concurrency = Number(opts.concurrency) > 0 ? Number(opts.concurrency) : 2;
  const q = getQueue(name, concurrency);
  q.waiting.push(fn);
  pump(name);
}

/** Snapshot para diagnósticos / health. */
export function bgJobQueueStats() {
  /** @type {Record<string, { running: number, waiting: number, concurrency: number }>} */
  const out = {};
  for (const [name, q] of queues.entries()) {
    out[name] = {
      running: q.running,
      waiting: q.waiting.length,
      concurrency: q.concurrency,
    };
  }
  return out;
}
