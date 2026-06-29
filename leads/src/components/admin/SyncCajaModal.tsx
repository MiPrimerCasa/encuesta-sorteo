import { useEffect, useMemo, useState } from 'react';
import type { SyncPreviewItem } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cambiosPropuestos: SyncPreviewItem[];
  onCommit: (aprobados: SyncPreviewItem[], tipo: 'fecha' | 'recibo') => Promise<void>;
  isLoading: boolean;
}

function normalizarDiaIso(fecha: string | null | undefined): string {
  if (!fecha) return '';
  const str = String(fecha).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Solo mostrar si la fecha de Caja es anterior a la del CRM. */
function cajaAnteriorACrm(fechaCrm: string, fechaCaja: string): boolean {
  const crm = normalizarDiaIso(fechaCrm);
  const caja = normalizarDiaIso(fechaCaja);
  if (!crm || !caja) return false;
  return caja < crm;
}

function formatFechaCorta(fecha: string | null | undefined) {
  if (!fecha) return '—';
  const iso = normalizarDiaIso(fecha);
  if (iso) {
    const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
    const local = new Date(y, m - 1, d);
    return local.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
  }
  try {
    const parsed = new Date(fecha);
    if (Number.isNaN(parsed.getTime())) return fecha;
    return parsed.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
  } catch {
    return fecha;
  }
}

function CheckIcon({ checked, colorClass = 'text-yellow-500' }: { checked: boolean; colorClass?: string }) {
  if (checked) {
    return (
      <svg className={`w-5 h-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

export function SyncCajaModal({ isOpen, onClose, cambiosPropuestos, onCommit, isLoading }: Props) {
  const cambiosFecha = useMemo(
    () =>
      cambiosPropuestos.filter(
        (c) => c.necesitaFecha && cajaAnteriorACrm(c.fechaActual, c.nuevaFecha),
      ),
    [cambiosPropuestos],
  );
  const cambiosRecibo = useMemo(
    () => cambiosPropuestos.filter((c) => c.necesitaRecibo),
    [cambiosPropuestos],
  );

  const [selectedFechaIds, setSelectedFechaIds] = useState<Set<string>>(new Set());
  const [selectedReciboIds, setSelectedReciboIds] = useState<Set<string>>(new Set());
  const [accionEnCurso, setAccionEnCurso] = useState<'fecha' | 'recibo' | null>(null);

  useEffect(() => {
    setSelectedFechaIds(new Set(cambiosFecha.map((c) => c.idUnico)));
    setSelectedReciboIds(new Set(cambiosRecibo.map((c) => c.idUnico)));
  }, [cambiosFecha, cambiosRecibo]);

  if (!isOpen) return null;

  const toggleFecha = (idUnico: string) => {
    const next = new Set(selectedFechaIds);
    if (next.has(idUnico)) next.delete(idUnico);
    else next.add(idUnico);
    setSelectedFechaIds(next);
  };

  const toggleRecibo = (idUnico: string) => {
    const next = new Set(selectedReciboIds);
    if (next.has(idUnico)) next.delete(idUnico);
    else next.add(idUnico);
    setSelectedReciboIds(next);
  };

  const toggleAllFecha = () => {
    if (selectedFechaIds.size === cambiosFecha.length) {
      setSelectedFechaIds(new Set());
    } else {
      setSelectedFechaIds(new Set(cambiosFecha.map((c) => c.idUnico)));
    }
  };

  const toggleAllRecibo = () => {
    if (selectedReciboIds.size === cambiosRecibo.length) {
      setSelectedReciboIds(new Set());
    } else {
      setSelectedReciboIds(new Set(cambiosRecibo.map((c) => c.idUnico)));
    }
  };

  const handleConfirmFecha = async () => {
    const aprobados = cambiosFecha.filter((c) => selectedFechaIds.has(c.idUnico));
    setAccionEnCurso('fecha');
    try {
      await onCommit(aprobados, 'fecha');
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleConfirmRecibo = async () => {
    const aprobados = cambiosRecibo.filter((c) => selectedReciboIds.has(c.idUnico));
    setAccionEnCurso('recibo');
    try {
      await onCommit(aprobados, 'recibo');
    } finally {
      setAccionEnCurso(null);
    }
  };

  const totalDiferencias = cambiosPropuestos.length;
  const busy = isLoading || accionEnCurso !== null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-6xl w-full flex flex-col overflow-hidden max-h-[90vh]">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between flex-shrink-0 bg-gray-900/50">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Sincronización PIJ con Caja</h2>
            <p className="text-sm text-gray-400">
              {totalDiferencias === 0
                ? 'Sin diferencias detectadas'
                : `${cambiosFecha.length} fecha(s) · ${cambiosRecibo.length} anexo(s)/adhesión`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {totalDiferencias === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold text-white mb-2">Todo al día</h3>
              <p className="text-gray-400 max-w-sm mx-auto">
                No se encontraron diferencias entre el CRM y la Caja para PIJ.
              </p>
            </div>
          ) : (
            <>
              {cambiosFecha.length > 0 && (
                <section className="rounded-xl border-2 border-yellow-500/50 bg-yellow-500/10 overflow-hidden">
                  <div className="px-4 py-3 bg-yellow-500/20 border-b border-yellow-500/30">
                    <p className="text-sm font-bold text-yellow-200 uppercase tracking-wide">
                      Revisar fecha a actualizar
                    </p>
                    <p className="text-[12px] text-yellow-100/80 mt-0.5">
                      {cambiosFecha.length} registro{cambiosFecha.length === 1 ? '' : 's'} donde la fecha de Caja es anterior a la del CRM. Solo se modifica la fecha de cierre.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-yellow-950/20 text-yellow-200/70 border-b border-yellow-500/20">
                        <tr>
                          <th className="p-3 w-12 text-center">
                            <button type="button" onClick={toggleAllFecha} className="mx-auto flex items-center justify-center">
                              <CheckIcon
                                checked={selectedFechaIds.size === cambiosFecha.length && cambiosFecha.length > 0}
                                colorClass="text-yellow-400"
                              />
                            </button>
                          </th>
                          <th className="p-3 font-semibold">Cliente</th>
                          <th className="p-3 font-semibold">Recibo actual</th>
                          <th className="p-3 font-semibold">F. CRM</th>
                          <th className="p-3 font-semibold text-yellow-300">F. Caja</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-yellow-500/15">
                        {cambiosFecha.map((cambio) => {
                          const isSelected = selectedFechaIds.has(cambio.idUnico);
                          return (
                            <tr
                              key={cambio.idUnico}
                              className={`text-gray-100 hover:bg-yellow-500/5 ${isSelected ? '' : 'opacity-45'}`}
                            >
                              <td className="p-3 text-center">
                                <button type="button" onClick={() => toggleFecha(cambio.idUnico)} className="mx-auto flex items-center justify-center">
                                  <CheckIcon checked={isSelected} colorClass="text-yellow-400" />
                                </button>
                              </td>
                              <td className="p-3">
                                {cambio.nombreCliente}
                                {cambio.isCompraAdicional && (
                                  <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">Adic.</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-xs text-gray-300 max-w-[200px] truncate" title={cambio.numeroRecibo}>
                                {cambio.numeroRecibo}
                              </td>
                              <td className="p-3 text-gray-400">{formatFechaCorta(cambio.fechaActual)}</td>
                              <td className="p-3 font-semibold text-yellow-300">{formatFechaCorta(cambio.nuevaFecha)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {cambiosRecibo.length > 0 && (
                <section className="rounded-xl border-2 border-orange-500/50 bg-orange-500/10 overflow-hidden">
                  <div className="px-4 py-3 bg-orange-500/20 border-b border-orange-500/30">
                    <p className="text-sm font-bold text-orange-200 uppercase tracking-wide">
                      Revisar anexo
                    </p>
                    <p className="text-[12px] text-orange-100/80 mt-0.5">
                      {cambiosRecibo.length} registro{cambiosRecibo.length === 1 ? '' : 's'} con adhesión o anexo distinto a Caja. Solo se modifica el número de recibo.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-orange-950/20 text-orange-200/70 border-b border-orange-500/20">
                        <tr>
                          <th className="p-3 w-12 text-center">
                            <button type="button" onClick={toggleAllRecibo} className="mx-auto flex items-center justify-center">
                              <CheckIcon
                                checked={selectedReciboIds.size === cambiosRecibo.length && cambiosRecibo.length > 0}
                                colorClass="text-orange-400"
                              />
                            </button>
                          </th>
                          <th className="p-3 font-semibold">Cliente</th>
                          <th className="p-3 font-semibold">Recibo CRM</th>
                          <th className="p-3 font-semibold">Adhesión CRM → Caja</th>
                          <th className="p-3 font-semibold">Anexo CRM → Caja</th>
                          <th className="p-3 font-semibold text-orange-300">Recibo Caja</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-500/15">
                        {cambiosRecibo.map((cambio) => {
                          const isSelected = selectedReciboIds.has(cambio.idUnico);
                          return (
                            <tr
                              key={`recibo-${cambio.idUnico}`}
                              className={`text-gray-100 hover:bg-orange-500/5 ${isSelected ? '' : 'opacity-45'}`}
                            >
                              <td className="p-3 text-center">
                                <button type="button" onClick={() => toggleRecibo(cambio.idUnico)} className="mx-auto flex items-center justify-center">
                                  <CheckIcon checked={isSelected} colorClass="text-orange-400" />
                                </button>
                              </td>
                              <td className="p-3">
                                {cambio.nombreCliente}
                                {cambio.isCompraAdicional && (
                                  <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">Adic.</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-xs text-gray-400 max-w-[160px] truncate" title={cambio.numeroRecibo}>
                                {cambio.numeroRecibo}
                              </td>
                              <td className="p-3 text-xs">
                                <span className="text-gray-400">{cambio.adhesionActual ?? '—'}</span>
                                <span className="mx-1 text-orange-400">→</span>
                                <span className="font-semibold text-orange-200">{cambio.adhesionExcel ?? '—'}</span>
                              </td>
                              <td className="p-3 text-xs">
                                <span className="text-gray-400">{cambio.anexoActual ?? '—'}</span>
                                <span className="mx-1 text-orange-400">→</span>
                                <span className="font-semibold text-orange-200">{cambio.anexoExcel ?? '—'}</span>
                              </td>
                              <td className="p-3 font-mono text-xs text-orange-200 max-w-[200px]" title={cambio.reciboPropuesto}>
                                {cambio.reciboPropuesto || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
          <p className="text-sm text-gray-400">
            Fechas: {selectedFechaIds.size}/{cambiosFecha.length} · Anexos: {selectedReciboIds.size}/{cambiosRecibo.length}
          </p>
          <div className="flex flex-wrap items-center gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmFecha}
              disabled={busy || selectedFechaIds.size === 0 || cambiosFecha.length === 0}
              className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-800 disabled:text-gray-500 text-yellow-950 px-5 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {accionEnCurso === 'fecha' ? (
                <>
                  <div className="w-4 h-4 border-2 border-yellow-900/30 border-t-yellow-900 rounded-full animate-spin" />
                  Actualizando...
                </>
              ) : (
                'Actualizar fecha'
              )}
            </button>
            <button
              type="button"
              onClick={handleConfirmRecibo}
              disabled={busy || selectedReciboIds.size === 0 || cambiosRecibo.length === 0}
              className="bg-orange-500 hover:bg-orange-400 disabled:bg-gray-800 disabled:text-gray-500 text-orange-950 px-5 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {accionEnCurso === 'recibo' ? (
                <>
                  <div className="w-4 h-4 border-2 border-orange-900/30 border-t-orange-900 rounded-full animate-spin" />
                  Actualizando...
                </>
              ) : (
                'Actualizar anexo'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
