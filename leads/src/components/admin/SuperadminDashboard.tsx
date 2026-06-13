import { useState } from 'react';
import type { AdminDashboardData, RankingAdminEntry, PersonaPijCierres } from '../../types';
import { formatRangoSemana } from '../../domain/admin-metrics';
import { AdminConocimientoEncuesta } from './AdminConocimientoEncuesta';
import { AdminMetricsChart } from './AdminMetricsChart';
import { AdminProductividadPanel } from './AdminProductividadPanel';

interface SuperadminDashboardProps {
  data: AdminDashboardData;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function RankingList({
  title,
  items,
  unidad,
}: {
  title: string;
  items: RankingAdminEntry[];
  unidad: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-[13px] font-semibold text-zinc-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-zinc-400">Sin datos en la semana.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((item, i) => (
            <li key={`${item.promotorId}-${i}`} className="flex items-start gap-2 text-[13px]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-800">{item.promotorNombre}</p>
                {item.supervisorNombre && (
                  <p className="truncate text-[11px] text-zinc-400">{item.supervisorNombre}</p>
                )}
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-zinc-700">
                {item.valor} {unidad}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PromotorRow({
  p,
}: {
  p: AdminDashboardData['supervisores'][0]['promotores'][0];
}) {
  return (
    <tr className="border-t border-zinc-100 text-[13px] text-zinc-700">
      <td className="py-2.5 pr-3 font-medium text-zinc-900">{p.promotorNombre}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.leadsTotal}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.entrevistasSemana}</td>
      <td className="py-2.5 px-2 text-center tabular-nums text-brand-700">{p.entrevistasHoy}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.cierresSemana}</td>
      <td className="py-2.5 px-2 text-center tabular-nums text-emerald-700">{p.cierresHoy}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.ventasTerrenoSemana}</td>
      <td className="py-2.5 pl-2 text-center tabular-nums">{p.ventasPijSemana}</td>
    </tr>
  );
}

export function SuperadminDashboard({ data }: SuperadminDashboardProps) {
  const [selectedPerson, setSelectedPerson] = useState<PersonaPijCierres | null>(null);
  const [filterText, setFilterText] = useState('');
  const [busquedaGlobal, setBusquedaGlobal] = useState('');

  const rango = formatRangoSemana(data.semanaDesde, data.semanaHasta);
  const hoyLabel = new Date(data.hoy).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const q = busquedaGlobal.trim().toLowerCase();
  const supervisoresFiltrados = q
    ? data.supervisores
        .map((sup) => ({
          ...sup,
          promotores: sup.promotores.filter((p) =>
            p.promotorNombre.toLowerCase().includes(q)
          ),
        }))
        .filter(
          (sup) =>
            sup.supervisorNombre.toLowerCase().includes(q) || sup.promotores.length > 0
        )
    : data.supervisores;

  const totalPromotoresFiltrados = supervisoresFiltrados.reduce(
    (acc, s) => acc + s.promotores.length,
    0
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 pb-12 sm:px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Mi Primer Casa S.A. · Superadmin
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-zinc-900">
          Panel global de equipos
        </h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Semana móvil ({rango}) · Resultados de hoy ({hoyLabel})
        </p>
      </div>

      {data.aviso && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {data.aviso}
        </p>
      )}

      <section>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          Hoy
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Entrevistas" value={data.resumenHoy.entrevistas} />
          <StatCard label="Cierres" value={data.resumenHoy.cierres} />
          <StatCard label="Terrenos" value={data.resumenHoy.ventasTerreno} />
          <StatCard label="Plan Inv. Joven" value={data.resumenHoy.ventasPij} />
        </div>
      </section>

      {/* Control de Anexos - Plan Inversión Joven */}
      <section className="space-y-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          Control de Anexos · Plan Inversión Joven
        </h3>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
            <h4 className="text-[14px] font-semibold text-zinc-900">Historial de Anexos Cargados por Operador</h4>
            <p className="text-[12px] text-zinc-500">
              Hacé clic en un operador para ver los anexos que cargó en el sistema.
            </p>
          </div>
          {(!data.pijCierresPorPersona || data.pijCierresPorPersona.length === 0) ? (
            <p className="px-4 py-6 text-center text-[13px] text-zinc-500">
              No hay cierres de Plan Inversión Joven registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="py-2.5 px-4 text-left font-semibold">Operador</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Anexos Cargados</th>
                    <th className="py-2.5 px-4 text-center font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.pijCierresPorPersona.map((person) => (
                    <tr
                      key={person.operadorNombre}
                      onClick={() => setSelectedPerson(person)}
                      className="cursor-pointer text-[13px] text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-zinc-900">{person.operadorNombre}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums text-brand-700">
                        {person.cantidad}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          className="text-[12px] font-medium text-brand-600 hover:text-brand-800 hover:underline"
                        >
                          Ver anexos
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {(data.eventos?.length ?? 0) > 0 && (
        <AdminMetricsChart
          eventos={data.eventos ?? []}
          supervisores={data.supervisores.map((s) => ({
            supervisorId: s.supervisorId,
            supervisorNombre: s.supervisorNombre,
          }))}
        />
      )}

      {data.conocimientoLeads && data.conocimientoLeads.total > 0 && (
        <AdminConocimientoEncuesta data={data.conocimientoLeads} />
      )}

      {data.productividad && data.productividad.embudoGlobal.leads > 0 && (
        <AdminProductividadPanel data={data.productividad} />
      )}

      <section>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          Destacados de la semana
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RankingList title="Más entrevistas" items={data.rankings.entrevistasSemana} unidad="" />
          <RankingList title="Más cierres" items={data.rankings.cierresSemana} unidad="" />
          <RankingList title="Más leads nuevos" items={data.rankings.leadsSemana} unidad="" />
          <RankingList
            title="Más terrenos vendidos"
            items={data.rankings.ventasTerrenoSemana}
            unidad=""
          />
          <RankingList
            title="Más Plan Inv. Joven"
            items={data.rankings.ventasPijSemana}
            unidad=""
          />
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
            Supervisores y equipos
          </h3>
          {q && (
            <span className="text-[12px] text-zinc-500 tabular-nums">
              {totalPromotoresFiltrados} promotor{totalPromotoresFiltrados === 1 ? '' : 'es'} encontrado{totalPromotoresFiltrados === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Buscador global */}
        <div className="relative">
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          >
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            id="busqueda-panel-global"
            type="search"
            value={busquedaGlobal}
            onChange={(e) => setBusquedaGlobal(e.target.value)}
            placeholder="Buscar supervisor o promotor…"
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-10 text-[14px] text-zinc-800 placeholder:text-zinc-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {busquedaGlobal && (
            <button
              type="button"
              onClick={() => setBusquedaGlobal('')}
              style={{ touchAction: 'manipulation' }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 active:text-zinc-700"
              aria-label="Limpiar búsqueda"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {supervisoresFiltrados.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-[13px] text-zinc-400">
            Sin resultados para &ldquo;{busquedaGlobal.trim()}&rdquo;
          </p>
        ) : data.supervisores.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No hay datos de supervisores para mostrar.</p>
        ) : (
          supervisoresFiltrados.map((sup) => (
            <article
              key={sup.supervisorId}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                <div>
                  <h4 className="text-[15px] font-semibold text-zinc-900">{sup.supervisorNombre}</h4>
                  <p className="text-[12px] text-zinc-500">
                    {sup.promotores.length} promotor{sup.promotores.length === 1 ? '' : 'es'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-[12px] text-zinc-600">
                  <span>
                    Semana: <strong>{sup.totales.entrevistasSemana}</strong> ent. ·{' '}
                    <strong>{sup.totales.cierresSemana}</strong> cierres
                  </span>
                  <span className="text-brand-700">
                    Hoy: <strong>{sup.totales.entrevistasHoy}</strong> ent. ·{' '}
                    <strong>{sup.totales.cierresHoy}</strong> cierres
                  </span>
                </div>
              </header>

              <div className="overflow-x-auto">
                <table className="min-w-full px-2">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      <th className="py-2 pr-3 text-left">Promotor</th>
                      <th className="px-2 py-2 text-center">Leads</th>
                      <th className="px-2 py-2 text-center">Ent. sem.</th>
                      <th className="px-2 py-2 text-center">Ent. hoy</th>
                      <th className="px-2 py-2 text-center">Cierres sem.</th>
                      <th className="px-2 py-2 text-center">Cierres hoy</th>
                      <th className="px-2 py-2 text-center">Terrenos</th>
                      <th className="pl-2 py-2 text-center">PIJ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sup.promotores.map((p) => (
                      <PromotorRow key={p.promotorId} p={p} />
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))
        )}
      </section>


      {/* Modal de Detalle de Anexos */}
      {selectedPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setSelectedPerson(null);
              setFilterText('');
            }}
          />

          {/* Modal Content */}
          <div className="relative z-50 flex h-full max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl transition-all duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Anexos de {selectedPerson.operadorNombre}
                </h3>
                <p className="text-[12px] text-zinc-500">
                  {selectedPerson.cantidad} cierre{selectedPerson.cantidad === 1 ? '' : 's'} de Plan Inversión Joven registrados
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPerson(null);
                  setFilterText('');
                }}
                className="flex h-8 w-8 items-center justify-center text-[20px] rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Search filter */}
            <div className="border-b border-zinc-100 px-6 py-3 bg-zinc-50/50">
              <input
                type="text"
                placeholder="Buscar por cliente, teléfono o número de anexo..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 transition-all"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(() => {
                const filteredCierres = selectedPerson.cierres.filter(c =>
                  c.leadNombre.toLowerCase().includes(filterText.toLowerCase()) ||
                  c.numeroAnexo.toLowerCase().includes(filterText.toLowerCase()) ||
                  c.leadTelefono.includes(filterText)
                );

                if (filteredCierres.length === 0) {
                  return (
                    <p className="py-8 text-center text-[13px] text-zinc-500">
                      {filterText ? 'No se encontraron resultados para la búsqueda.' : 'No hay anexos registrados.'}
                    </p>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-100">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          <th className="pb-2 text-left font-semibold">Cliente</th>
                          <th className="pb-2 text-left font-semibold">Teléfono</th>
                          <th className="pb-2 text-center font-semibold">Nro. Anexo</th>
                          <th className="pb-2 text-right font-semibold">Fecha de Cierre</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredCierres.map((cierre) => (
                          <tr key={cierre.leadId} className="text-[13px] text-zinc-700">
                            <td className="py-3 font-medium text-zinc-900">{cierre.leadNombre}</td>
                            <td className="py-3">
                              <a
                                href={`tel:${cierre.leadTelefono}`}
                                className="text-brand-600 hover:underline inline-flex items-center gap-1 font-mono text-[12px] tabular-nums"
                              >
                                {cierre.leadTelefono}
                              </a>
                            </td>
                            <td className="py-3 text-center">
                              <span className="inline-flex items-center rounded-md bg-brand-50 border border-brand-100 px-2 py-0.5 text-[12px] font-bold text-brand-700">
                                {cierre.numeroAnexo}
                              </span>
                            </td>
                            <td className="py-3 text-right text-zinc-500 tabular-nums">
                              {(() => {
                                try {
                                  const d = new Date(cierre.fechaCierre);
                                  if (isNaN(d.getTime())) return cierre.fechaCierre;
                                  return d.toLocaleDateString('es-AR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  });
                                } catch {
                                  return cierre.fechaCierre;
                                }
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end border-t border-zinc-100 px-6 py-3.5 bg-zinc-50/50">
              <button
                type="button"
                onClick={() => {
                  setSelectedPerson(null);
                  setFilterText('');
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-[0.98]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
