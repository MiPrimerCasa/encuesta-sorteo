/**
 * Comprueba si un link acortado sigue respondiendo (HEAD con redirects).
 */

/**
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function verificarUrl(url) {
  if (!url?.startsWith('http')) {
    return { ok: false, error: 'URL inválida' };
  }

  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': 'MPC-LinkChecker/1.0',
      },
    });

    if (resp.status >= 200 && resp.status < 400) {
      return { ok: true, status: resp.status };
    }

    if (resp.status === 405 || resp.status === 403) {
      const getResp = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
        headers: { 'User-Agent': 'MPC-LinkChecker/1.0' },
      });
      if (getResp.status >= 200 && getResp.status < 400) {
        return { ok: true, status: getResp.status };
      }
      return { ok: false, status: getResp.status, error: `HTTP ${getResp.status}` };
    }

    return { ok: false, status: resp.status, error: `HTTP ${resp.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red',
    };
  }
}
