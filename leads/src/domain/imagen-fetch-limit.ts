/**
 * Limita cuántas fotos se descargan a la vez (evita saturar VPS/SQL).
 */
const MAX_CONCURRENT = Math.max(
  1,
  Number.parseInt(String(import.meta.env.VITE_IMAGENES_FETCH_CONCURRENCY || '3'), 10) || 3,
);

let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release() {
  active = Math.max(0, active - 1);
  const next = waiting.shift();
  if (next) next();
}

export async function withImagenFetchLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
