/** Solo dígitos (máx. 15 para evitar pegados accidentales). */
export function extraerDigitosTelefono(raw: string, max = 15): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, max);
}

/** Misma lógica que server/db/encuesta-carga.js → normalizarTelefonoCarga. */
export function normalizarTelefonoCarga(telefono: string): string {
  let d = extraerDigitosTelefono(telefono, 20);
  if (!d) return '';

  if (d.length === 12 && d.includes('15')) {
    const idx = d.indexOf('15');
    if (idx >= 2 && idx <= 4) {
      d = d.slice(0, idx) + d.slice(idx + 2);
    }
  } else if (d.length === 11 && d.startsWith('15')) {
    d = d.slice(2);
  }

  if (d.startsWith('549') && d.length === 13) return d;
  if (d.startsWith('54') && d.length === 12) return `549${d.slice(2)}`;
  if (d.length === 10) return `549${d}`;
  if (d.startsWith('0') && d.length === 11) return `549${d.slice(1)}`;

  return d;
}

/** Formato legible mientras se escribe (solo dígitos en estado). */
export function formatearTelefonoCargaDisplay(digits: string): string {
  const d = extraerDigitosTelefono(digits);
  if (!d) return '';

  if (d.startsWith('549') && d.length > 3) {
    const resto = d.slice(3);
    if (resto.length <= 4) return `549 ${resto}`;
    if (resto.length <= 7) return `549 ${resto.slice(0, 4)} ${resto.slice(4)}`;
    return `549 ${resto.slice(0, 4)} ${resto.slice(4, 7)} ${resto.slice(7)}`;
  }

  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

/** Mínimo 8 dígitos para considerar el teléfono. */
export function telefonoCargaTieneLongitudMinima(digits: string): boolean {
  return extraerDigitosTelefono(digits).length >= 8;
}

/** Listo para consultar al servidor (evita verificar en cada dígito). */
export function telefonoListoParaVerificarCarga(digits: string): boolean {
  const d = extraerDigitosTelefono(digits);
  if (!telefonoCargaTieneLongitudMinima(d) || !telefonoCargaEsValido(d)) return false;
  const norm = normalizarTelefonoCarga(d);
  if (norm.length >= 13) return true;
  return d.length >= 10;
}


/** Teléfono con longitud razonable tras normalizar (8–13 dígitos). */
export function telefonoCargaEsValido(digits: string): boolean {
  const norm = normalizarTelefonoCarga(digits);
  return norm.length >= 8 && norm.length <= 13;
}

/** Al escribir: deja solo dígitos y resetea si pegaron basura. */
export function sanitizarInputTelefonoCarga(raw: string): string {
  return extraerDigitosTelefono(raw);
}
