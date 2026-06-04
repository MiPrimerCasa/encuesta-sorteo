/**
 * Acortadores públicos (rotación para no saturar uno solo).
 * Equivalente al script Python; usa fetch nativo de Node 20+.
 */

const ACORTADORES = [
  {
    nombre: 'tinyurl',
    async acortar(url) {
      const q = encodeURIComponent(url);
      const resp = await fetch(`https://tinyurl.com/api-create.php?url=${q}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const text = (await resp.text()).trim();
      return resp.ok && text.startsWith('http') ? text : null;
    },
  },
  {
    nombre: 'clck.ru',
    async acortar(url) {
      const u = new URL('https://clck.ru/--');
      u.searchParams.set('url', url);
      const resp = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) });
      const text = (await resp.text()).trim();
      return resp.ok && text.startsWith('http') ? text : null;
    },
  },
  {
    nombre: 'is.gd',
    async acortar(url) {
      const u = new URL('https://is.gd/create.php');
      u.searchParams.set('format', 'simple');
      u.searchParams.set('url', url);
      const resp = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) });
      const text = (await resp.text()).trim();
      return resp.ok && text.startsWith('http') ? text : null;
    },
  },
  {
    nombre: 'v.gd',
    async acortar(url) {
      const u = new URL('https://v.gd/create.php');
      u.searchParams.set('format', 'simple');
      u.searchParams.set('url', url);
      const resp = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) });
      const text = (await resp.text()).trim();
      return resp.ok && text.startsWith('http') ? text : null;
    },
  },
];

/**
 * @param {string} url
 * @param {number} [indiceInicial]
 * @returns {Promise<{ corto: string, servicio: string } | null>}
 */
export async function acortarEnlace(url, indiceInicial = 0) {
  if (!url?.startsWith('http')) return null;

  const orden = [
    ACORTADORES[indiceInicial % ACORTADORES.length],
    ...ACORTADORES.filter((_, j) => j !== indiceInicial % ACORTADORES.length),
  ];

  for (const servicio of orden) {
    try {
      const corto = await servicio.acortar(url);
      if (corto) return { corto, servicio: servicio.nombre };
    } catch (err) {
      console.warn(`[${servicio.nombre}]`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

export function indiceAcortadorDesdeCodigo(codigo, red) {
  const s = `${codigo}|${red}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i)) % ACORTADORES.length;
  return h;
}

export function pausaEntreAcortadosMs() {
  return Number(process.env.LINKS_ACORTAR_PAUSA_MS || 1000);
}
