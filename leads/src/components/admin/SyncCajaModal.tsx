import { useState } from 'react';
import type { SyncPreviewItem } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cambiosPropuestos: SyncPreviewItem[];
  onCommit: (aprobados: SyncPreviewItem[]) => Promise<void>;
  isLoading: boolean;
}

export function SyncCajaModal({ isOpen, onClose, cambiosPropuestos, onCommit, isLoading }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(cambiosPropuestos.map((c) => c.idUnico)),
  );

  if (!isOpen) return null;

  const handleToggle = (idUnico: string) => {
    const next = new Set(selectedIds);
    if (next.has(idUnico)) next.delete(idUnico);
    else next.add(idUnico);
    setSelectedIds(next);
  };

  const handleToggleAll = () => {
    if (selectedIds.size === cambiosPropuestos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cambiosPropuestos.map((c) => c.idUnico)));
    }
  };

  const handleConfirm = () => {
    const aprobados = cambiosPropuestos.filter((c) => selectedIds.has(c.idUnico));
    onCommit(aprobados);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden max-h-[90vh]">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between flex-shrink-0 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8V4H8" />
                <rect width="16" height="12" x="4" y="8" rx="2" />
                <path d="M2 14h2" />
                <path d="M20 14h2" />
                <path d="M15 13v2" />
                <path d="M9 13v2" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Sincronización PIJ</h2>
              <p className="text-sm text-gray-400">
                Se encontraron {cambiosPropuestos.length} diferencias con la Caja
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {cambiosPropuestos.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-emerald-500 mx-auto mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <h3 className="text-xl font-semibold text-white mb-2">Todo al día</h3>
              <p className="text-gray-400 max-w-sm mx-auto">
                No se encontraron diferencias entre los recibos del CRM y el documento de Caja para el Plan Inversión Joven.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3 text-sm text-blue-200">
                <svg className="w-5 h-5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p>
                  Revisá la lista y seleccioná qué operaciones querés actualizar. 
                  Al confirmar, se guardará un respaldo automático (Backup JSON) antes de aplicar los cambios en la base de datos.
                </p>
              </div>
              
              <div className="border border-gray-800 rounded-lg overflow-hidden bg-black/20">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-800/50 text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="p-3 w-12 text-center">
                        <button 
                          onClick={handleToggleAll}
                          className="hover:text-white transition-colors flex items-center justify-center mx-auto"
                        >
                          {selectedIds.size === cambiosPropuestos.length ? (
                            <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <path d="m9 12 2 2 4-4" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                            </svg>
                          )}
                        </button>
                      </th>
                      <th className="p-3 font-semibold">Cliente (CRM)</th>
                      <th className="p-3 font-semibold text-gray-400">Cliente (Excel)</th>
                      <th className="p-3 font-semibold">Recibo (CRM)</th>
                      <th className="p-3 font-semibold">F. Actual</th>
                      <th className="p-3 font-semibold">Nueva Fecha (Excel)</th>
                      <th className="p-3 font-semibold text-gray-500">Coincidió con</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {cambiosPropuestos.map((cambio) => {
                      const isSelected = selectedIds.has(cambio.idUnico);
                      return (
                        <tr 
                          key={cambio.idUnico} 
                          className={`hover:bg-gray-800/30 transition-colors ${isSelected ? '' : 'opacity-50 grayscale'}`}
                        >
                          <td className="p-3 text-center">
                            <button onClick={() => handleToggle(cambio.idUnico)} className="flex items-center justify-center mx-auto">
                              {isSelected ? (
                                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="m9 12 2 2 4-4" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                </svg>
                              )}
                            </button>
                          </td>
                          <td className="p-3 text-white">
                            {cambio.nombreCliente}
                            {cambio.isCompraAdicional && (
                              <span className="ml-2 text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Adic.</span>
                            )}
                          </td>
                          <td className="p-3 text-gray-400 text-xs italic">
                            {cambio.excelRow.nombreCliente || '-'}
                          </td>
                          <td className="p-3 text-gray-300 font-mono text-xs">{cambio.numeroRecibo}</td>
                          <td className="p-3 text-gray-400">
                            {cambio.fechaActual ? new Date(cambio.fechaActual).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '-'}
                          </td>
                          <td className="p-3 text-emerald-400 font-medium flex items-center gap-2">
                            {new Date(cambio.nuevaFecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                            <svg className="w-3 h-3 text-amber-500/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          </td>
                          <td className="p-3 text-gray-500 text-xs">
                            ADH: {cambio.excelRow.ordenAdh || '-'} | ANEXO: {cambio.excelRow.ordenAnexo || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-between items-center flex-shrink-0">
          <p className="text-sm text-gray-400">
            {selectedIds.size} de {cambiosPropuestos.length} seleccionados
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading || selectedIds.size === 0}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                'Confirmar Seleccionados'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
