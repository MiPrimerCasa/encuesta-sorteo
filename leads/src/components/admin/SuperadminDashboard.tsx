import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AdminDashboardData, RankingAdminEntry, PersonaPijCierres, Lead, Barrio, Producto, SeguimientoLead, PijCierreDetalle, TerrenoCierreDetalle, PromotorMetricasAdmin } from '../../types';
import {
  extraerVentasDetalleInforme,
  fechaIsoLocal,
  filterPijCierresPorRango,
  formatRangoSemana,
  inicioMesIso,
} from '../../domain/admin-metrics';
import {
  esPeriodoAnio,
  esPeriodoDia,
  esPeriodoMesCalendario,
  etiquetaPeriodoCorto,
  etiquetaTipoPeriodo,
  rangoFechasIsoPorPeriodo,
} from '../../domain/admin-periodo';
import { actualizarAppQuery, leerTabDesdeUrl, type AdminTab } from '../../domain/admin-url';
import { AdminConocimientoEncuesta } from './AdminConocimientoEncuesta';
import { AdminMetricsChart } from './AdminMetricsChart';
import { AdminPeriodoSelector } from './AdminPeriodoSelector';
import { AdminProductividadPanel } from './AdminProductividadPanel';
import { getSession, fetchAdminLeads, fetchAdminOperadores, reasignarLead, fetchBarrios, fetchProductos, guardarSeguimiento, duplicarLead, resetearLeadSeguimiento, modificarDatosLead, fetchGrabacionesConfig } from '../../api/client';
import type { ModificarDatosLeadPayload, OperadorCatalogo } from '../../api/client';
import { getBarrioNombre } from '../../domain/venta';
import { useAuth } from '../../context/AuthContext';
import { cleanTelefonoSuffix } from '../../domain/whatsapp';
import { AdminModificarLeadModal } from './AdminModificarLeadModal';
import { LeadModalForm } from '../leads/LeadModalForm';
import { SyncCajaModal } from './SyncCajaModal';
import { FaltantesPijModal } from './FaltantesPijModal';
import { PromotorInformeFilter } from './PromotorInformeFilter';
import { GrabacionesCumplimientoPanel } from './GrabacionesCumplimientoPanel';
import { previewSyncCajaPij, commitSyncCajaPij, previewFaltantesPij } from '../../api/client';
import type { SyncPreviewItem, FaltantesPijResponse } from '../../types';


interface SuperadminDashboardProps {
  data: AdminDashboardData;
  periodo: string;
  onCambiarPeriodo: (periodo: string) => void;
  cargando?: boolean;
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
        <p className="mt-3 text-[13px] text-zinc-400">Sin datos en este período.</p>
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

function formatFechaHorarioCierre(fecha: string | null | undefined) {
  if (!fecha) return { fecha: '—', horario: '—' };
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return { fecha: String(fecha), horario: '—' };
  return {
    fecha: d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    horario: d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function CeldaVentaInforme({
  cantidad,
  className,
  onClick,
}: {
  cantidad: number;
  className: string;
  onClick?: () => void;
}) {
  if (cantidad <= 0) {
    return <span className={`tabular-nums text-zinc-300 ${className}`}>0</span>;
  }
  if (!onClick) {
    return <span className={`tabular-nums font-semibold ${className}`}>{cantidad}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tabular-nums font-semibold hover:underline cursor-pointer ${className}`}
    >
      {cantidad}
    </button>
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
      <td className="py-2.5 px-2 text-center tabular-nums">{p.leadsSemana}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.entrevistasSemana}</td>
      <td className="py-2.5 px-2 text-center tabular-nums text-brand-700">{p.entrevistasHoy}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.cierresSemana}</td>
      <td className="py-2.5 px-2 text-center tabular-nums text-emerald-700">{p.cierresHoy}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.ventasTerrenoSemana}</td>
      <td className="py-2.5 pl-2 text-center tabular-nums">{p.ventasPijSemana}</td>
    </tr>
  );
}

/** Meta diaria de leads por promotor: rojo 1–15, amarillo 16–29, verde ≥30. */
function estiloLeadsPorDia(cantidad: number): string {
  if (cantidad >= 30) {
    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  }
  if (cantidad > 15) {
    return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  }
  return 'bg-red-50 text-red-700 ring-1 ring-red-200';
}

function CeldaLeadsInforme({
  cantidad,
  colorear,
}: {
  cantidad: number;
  colorear: boolean;
}) {
  if (!colorear) {
    return <span className="tabular-nums">{cantidad}</span>;
  }
  return (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-2 py-0.5 text-[13px] font-bold tabular-nums ${estiloLeadsPorDia(cantidad)}`}
      title={
        cantidad >= 30
          ? 'Meta diaria alcanzada (30+ leads)'
          : cantidad > 15
            ? 'En camino (16–29 leads)'
            : 'Por debajo de la meta (1–15 leads)'
      }
    >
      {cantidad}
    </span>
  );
}

function LeyendaLeadsPorDia() {
  return (
    <p className="text-[11px] text-zinc-500 no-print mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Leads del día:</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" aria-hidden="true" />
        1–15
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" aria-hidden="true" />
        16–29
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" />
        30+
      </span>
    </p>
  );
}

export function SuperadminDashboard({ data, periodo, onCambiarPeriodo, cargando = false }: SuperadminDashboardProps) {
  const periodoActivo = data.periodo ?? periodo;
  const esPeriodoFecha = esPeriodoDia(periodoActivo);
  const esPeriodoMes = esPeriodoMesCalendario(periodoActivo);
  const esPeriodoAnual = esPeriodoAnio(periodoActivo);
  const colorearLeadsDia = periodoActivo === 'hoy' || esPeriodoFecha;
  const tipoPeriodoLabel = etiquetaTipoPeriodo(periodoActivo);
  const periodoCortoLabel = etiquetaPeriodoCorto(periodoActivo);
  const [selectedPerson, setSelectedPerson] = useState<PersonaPijCierres | null>(null);
  const [selectedPersonReceipts, setSelectedPersonReceipts] = useState<{
    person: PersonaPijCierres;
    tipo: '100' | 'sena';
  } | null>(null);
  const [anexosFechaDesde, setAnexosFechaDesde] = useState(() => rangoFechasIsoPorPeriodo(periodo).desde);
  const [anexosFechaHasta, setAnexosFechaHasta] = useState(() => rangoFechasIsoPorPeriodo(periodo).hasta);

  useEffect(() => {
    const { desde, hasta } = rangoFechasIsoPorPeriodo(periodoActivo);
    setAnexosFechaDesde(desde);
    setAnexosFechaHasta(hasta);
  }, [periodoActivo]);

  const [informeVentaDetalle, setInformeVentaDetalle] = useState<{
    titulo: string;
    subtitulo: string;
    tipo: 'pij' | 'terreno100' | 'terrenosena';
    itemsPij: PijCierreDetalle[];
    itemsTerreno: TerrenoCierreDetalle[];
  } | null>(null);
  const [filterText, setFilterText] = useState('');
  const [informeDetalleCargando, setInformeDetalleCargando] = useState(false);
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [informePromotoresSeleccionados, setInformePromotoresSeleccionados] = useState<Set<string>>(
    () => new Set(),
  );
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [seguimientoLead, setSeguimientoLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetchBarrios()
      .then((data) => setBarrios(data))
      .catch((err) => console.error('Error al cargar barrios para dashboard:', err));
    fetchProductos('supervisor')
      .then((data) => setProductos(data))
      .catch((err) => console.error('Error al cargar productos para dashboard:', err));
    fetchGrabacionesConfig()
      .then((cfg) => setModuloGrabacionesActivo(Boolean(cfg.moduloActivo && cfg.puedeAuditar)))
      .catch(() => setModuloGrabacionesActivo(false));
  }, []);

  const [tabActivo, setTabActivo] = useState<AdminTab>(() => leerTabDesdeUrl());

  const cambiarTab = useCallback((tab: AdminTab) => {
    setTabActivo(tab);
    actualizarAppQuery({
      tab,
      esSuperadmin: getSession()?.usuario?.rol === 'superadmin',
    });
  }, []);
  const [moduloGrabacionesActivo, setModuloGrabacionesActivo] = useState(false);

  useEffect(() => {
    if (leerTabDesdeUrl() !== 'grabaciones') return;
    fetchGrabacionesConfig()
      .then((cfg) => {
        const activo = Boolean(cfg.moduloActivo && cfg.puedeAuditar);
        if (!activo) cambiarTab('metricas');
      })
      .catch(() => cambiarTab('metricas'));
  }, [cambiarTab]);
  const [selectedOperatorUntreated, setSelectedOperatorUntreated] = useState<{ name: string; role: 'supervisor' | 'promotor'; team: string; count: number; leads: any[] } | null>(null);
  const [busquedaSinTratar, setBusquedaSinTratar] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cargandoLeads, setCargandoLeads] = useState(false);
  const [busquedaLeads, setBusquedaLeads] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const leadsPorPagina = 50;

  const [operadores, setOperadores] = useState<OperadorCatalogo[]>([]);
  const [cargandoOperadores, setCargandoOperadores] = useState(false);
  const [busquedaReasignar, setBusquedaReasignar] = useState('');
  const [paginaReasignar, setPaginaReasignar] = useState(1);
  const [reasignandoLeadId, setReasignandoLeadId] = useState<string | null>(null);
  const [resultadoReasignacion, setResultadoReasignacion] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);
  const [selectedOperatorCodes, setSelectedOperatorCodes] = useState<Record<string, string>>({});

  const { usuario } = useAuth();
  const [duplicatingLead, setDuplicatingLead] = useState<Lead | null>(null);
  const [targetVendedorCode, setTargetVendedorCode] = useState('');
  const [duplicatingPending, setDuplicatingPending] = useState(false);
  const [duplicatingMessage, setDuplicatingMessage] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);

  const handleDuplicarLeadSubmit = async () => {
    if (!duplicatingLead || !targetVendedorCode) return;
    setDuplicatingPending(true);
    setDuplicatingMessage(null);
    try {
      const newLead = await duplicarLead(duplicatingLead.id, targetVendedorCode);
      setLeads((prev) => [newLead, ...prev]);
      setDuplicatingMessage({
        tipo: 'success',
        mensaje: `Lead "${newLead.nombre}" duplicado con éxito.`,
      });
      setTargetVendedorCode('');
      setTimeout(() => {
        setDuplicatingLead(null);
        setDuplicatingMessage(null);
      }, 2000);
    } catch (err) {
      console.error(err);
      setDuplicatingMessage({
        tipo: 'error',
        mensaje: err instanceof Error ? err.message : 'Error al duplicar el lead.',
      });
    } finally {
      setDuplicatingPending(false);
    }
  };

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncPreviewItems, setSyncPreviewItems] = useState<SyncPreviewItem[]>([]);
  const [isSyncLoading, setIsSyncLoading] = useState(false);

  const [isFaltantesModalOpen, setIsFaltantesModalOpen] = useState(false);
  const [faltantesData, setFaltantesData] = useState<FaltantesPijResponse | null>(null);
  const [faltantesMes, setFaltantesMes] = useState<'junio' | 'julio'>('julio');
  const [isFaltantesLoading, setIsFaltantesLoading] = useState(false);

  const handlePreviewSync = async () => {
    try {
      setIsSyncLoading(true);
      const res = await previewSyncCajaPij();
      setSyncPreviewItems(res.cambiosPropuestos);
      setIsSyncModalOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error de sincronización');
    } finally {
      setIsSyncLoading(false);
    }
  };

  const loadFaltantesPij = async (opts: {
    mes?: 'junio' | 'julio';
    csvText?: string;
  } = {}) => {
    const mes = opts.mes ?? faltantesMes;
    try {
      setIsFaltantesLoading(true);
      setIsFaltantesModalOpen(true);
      const res = await previewFaltantesPij({
        mes,
        csvText: opts.csvText,
      });
      setFaltantesData(res);
      if (!opts.csvText) setFaltantesMes(mes);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cruzar Excel con el CRM');
      if (!faltantesData) setIsFaltantesModalOpen(false);
    } finally {
      setIsFaltantesLoading(false);
    }
  };

  const handleCommitSync = async (aprobados: SyncPreviewItem[], tipo: 'fecha' | 'recibo') => {
    try {
      setIsSyncLoading(true);
      const res = await commitSyncCajaPij(aprobados, tipo);
      if (tipo === 'fecha') {
        alert(`Se actualizaron ${res.actualizados} fecha${res.actualizados === 1 ? '' : 's'} de cierre.`);
      } else {
        alert(`Se actualizaron ${res.actualizados} recibo${res.actualizados === 1 ? '' : 's'} (adhesión/anexo).`);
      }
      setIsSyncModalOpen(false);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al confirmar cambios');
    } finally {
      setIsSyncLoading(false);
    }
  };

  const [resettingLead, setResettingLead] = useState<Lead | null>(null);
  const [resettingPending, setResettingPending] = useState(false);
  const [resettingMessage, setResettingMessage] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);
  const [modificandoLead, setModificandoLead] = useState<Lead | null>(null);

  const handleResetearLeadSubmit = async () => {
    if (!resettingLead) return;
    setResettingPending(true);
    setResettingMessage(null);
    try {
      const updatedLead = await resetearLeadSeguimiento(resettingLead.id);
      setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
      setResettingMessage({
        tipo: 'success',
        mensaje: `Seguimiento de "${updatedLead.nombre}" reseteado con éxito.`,
      });
      setTimeout(() => {
        setResettingLead(null);
        setResettingMessage(null);
      }, 2000);
    } catch (err) {
      console.error(err);
      setResettingMessage({
        tipo: 'error',
        mensaje: err instanceof Error ? err.message : 'Error al resetear el lead.',
      });
    } finally {
      setResettingPending(false);
    }
  };

  const handleModificarLead = async (leadId: string, datos: ModificarDatosLeadPayload) => {
    const updatedLead = await modificarDatosLead(leadId, datos);
    setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
  };

  const handleGuardarSeguimiento = async (leadId: string, seg: SeguimientoLead) => {
    const result = await guardarSeguimiento(leadId, seg);
    setLeads((prev) => prev.map((l) => (l.id === result.lead.id ? result.lead : l)));
    setSeguimientoLead(null);
  };

  useEffect(() => {
    if (
      (tabActivo === 'buscador' ||
        tabActivo === 'reasignacion' ||
        tabActivo === 'informe' ||
        tabActivo === 'metricas') &&
      leads.length === 0
    ) {
      setCargandoLeads(true);
      fetchAdminLeads()
        .then((data) => {
          setLeads(data);
          setCargandoLeads(false);
        })
        .catch((err) => {
          console.error('Error al cargar leads global:', err);
          setCargandoLeads(false);
        });
    }
  }, [tabActivo, leads.length]);

  useEffect(() => {
    if ((tabActivo === 'reasignacion' || tabActivo === 'buscador' || duplicatingLead !== null) && operadores.length === 0) {
      setCargandoOperadores(true);
      fetchAdminOperadores()
        .then((data) => {
          setOperadores(data);
          setCargandoOperadores(false);
        })
        .catch((err) => {
          console.error('Error al cargar operadores:', err);
          setCargandoOperadores(false);
        });
    }
  }, [tabActivo, duplicatingLead, operadores.length]);

  const queryReasignar = busquedaReasignar.trim().toLowerCase();
  const leadsFiltradosReasignar = useMemo(() => {
    return queryReasignar
      ? leads.filter((l) => {
          const nombreMatch = l.nombre?.toLowerCase().includes(queryReasignar);
          const telefonoMatch = l.telefono?.includes(queryReasignar);
          const promotorMatch = l.promotorNombre?.toLowerCase().includes(queryReasignar);
          const supervisorMatch = l.supervisorNombre?.toLowerCase().includes(queryReasignar);
          return nombreMatch || telefonoMatch || promotorMatch || supervisorMatch;
        })
      : leads;
  }, [leads, queryReasignar]);

  useEffect(() => {
    setPaginaReasignar(1);
  }, [busquedaReasignar]);

  const leadsPaginadosReasignar = useMemo(() => {
    const indexUltimo = paginaReasignar * leadsPorPagina;
    const indexPrimer = indexUltimo - leadsPorPagina;
    return leadsFiltradosReasignar.slice(indexPrimer, indexUltimo);
  }, [leadsFiltradosReasignar, paginaReasignar]);

  const totalPaginasReasignar = Math.ceil(leadsFiltradosReasignar.length / leadsPorPagina);

  const handleReasignar = async (leadId: string, nuevoCodigo: string) => {
    if (!nuevoCodigo) return;
    setReasignandoLeadId(leadId);
    setResultadoReasignacion(null);
    try {
      const leadActualizado = await reasignarLead(leadId, nuevoCodigo);
      setLeads((prevLeads) =>
        prevLeads.map((l) => (l.id === leadId ? leadActualizado : l))
      );
      setResultadoReasignacion({
        tipo: 'success',
        mensaje: `Lead "${leadActualizado.nombre}" reasignado correctamente.`,
      });
      setTimeout(() => setResultadoReasignacion(null), 5000);
    } catch (err) {
      console.error(err);
      setResultadoReasignacion({
        tipo: 'error',
        mensaje: err instanceof Error ? err.message : 'Error al reasignar el lead.',
      });
    } finally {
      setReasignandoLeadId(null);
    }
  };

  const queryLeads = busquedaLeads.trim().toLowerCase();
  const leadsFiltrados = queryLeads
    ? leads.filter((l) => {
        const nombreMatch = l.nombre?.toLowerCase().includes(queryLeads);
        const telefonoMatch = l.telefono?.includes(queryLeads);
        return nombreMatch || telefonoMatch;
      })
    : leads;

  useEffect(() => {
    setPaginaActual(1);
  }, [busquedaLeads]);

  const indexUltimoLead = paginaActual * leadsPorPagina;
  const indexPrimerLead = indexUltimoLead - leadsPorPagina;
  const leadsPaginados = leadsFiltrados.slice(indexPrimerLead, indexUltimoLead);
  const totalPaginas = Math.ceil(leadsFiltrados.length / leadsPorPagina);

  const formatearFecha = (fechaStr?: string) => {
    if (!fechaStr) return '-';
    try {
      const normalized = fechaStr.includes('T') ? fechaStr : fechaStr.replace(' ', 'T');
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return fechaStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return fechaStr;
    }
  };

  const renderEstadoBadge = (lista?: string) => {
    switch (lista) {
      case 'compro':
        return (
          <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            Cierre / Venta
          </span>
        );
      case 'seguimiento':
        return (
          <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
            Seguimiento
          </span>
        );
      case 'contacto':
        return (
          <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
            Contactado
          </span>
        );
      case 'entrevista':
      default:
        return (
          <span className="inline-flex items-center rounded-md bg-purple-50 border border-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-700">
            Prioridad
          </span>
        );
    }
  };


  // ── Resumen General de Productividad (Semana Móvil) ──────────────────────────
  const todosPromotores = data.supervisores.flatMap((s) =>
    s.promotores.map((p) => ({
      ...p,
      supervisorNombre: s.supervisorNombre,
    }))
  );

  const promotoresOrdenados = [...todosPromotores].sort((a, b) => {
    if (b.cierresSemana !== a.cierresSemana) {
      return b.cierresSemana - a.cierresSemana;
    }
    if (b.entrevistasSemana !== a.entrevistasSemana) {
      return b.entrevistasSemana - a.entrevistasSemana;
    }
    return b.leadsTotal - a.leadsTotal;
  });

  const promotoresFiltradosRanking =
    informePromotoresSeleccionados.size === 0
      ? promotoresOrdenados
      : promotoresOrdenados.filter((p) => informePromotoresSeleccionados.has(p.promotorId));

  const totalPromotoresCierres = promotoresFiltradosRanking.reduce((acc, p) => acc + p.cierresSemana, 0);
  const totalPromotoresEntrevistas = promotoresFiltradosRanking.reduce((acc, p) => acc + p.entrevistasSemana, 0);
  const totalPromotoresLeads = promotoresFiltradosRanking.reduce((acc, p) => acc + p.leadsSemana, 0);
  const totalPromotoresTerrenos = promotoresFiltradosRanking.reduce((acc, p) => acc + p.ventasTerrenoSemana, 0);
  const totalPromotoresTerrenosSeña = promotoresFiltradosRanking.reduce(
    (acc, p) => acc + (p.ventasTerrenoSenaSemana ?? 0),
    0,
  );
  const totalPromotoresPij = promotoresFiltradosRanking.reduce((acc, p) => acc + p.ventasPijSemana, 0);
  const totalPromotoresTratadosHoy = promotoresFiltradosRanking.reduce(
    (acc, p) => acc + (p.tratadosHoy ?? 0),
    0,
  );
  const totalPromotoresTratadosSemana = promotoresFiltradosRanking.reduce(
    (acc, p) => acc + (p.tratadosSemana ?? 0),
    0,
  );
  const totalPromotoresTratadosMes = promotoresFiltradosRanking.reduce(
    (acc, p) => acc + (p.tratadosMes ?? 0),
    0,
  );

  const rango = formatRangoSemana(data.semanaDesde, data.semanaHasta);

  type PromotorConSupervisor = PromotorMetricasAdmin & { supervisorNombre?: string };

  const abrirDetalleInformeVenta = async (
    promotor: PromotorConSupervisor | null,
    tipo: 'pij' | 'terreno100' | 'terrenosena',
  ) => {
    let itemsPij =
      tipo === 'pij'
        ? promotor
          ? (promotor.detallePij ?? [])
          : promotoresFiltradosRanking.flatMap((p) => p.detallePij ?? [])
        : [];
    let itemsTerreno =
      tipo === 'terreno100'
        ? promotor
          ? (promotor.detalleTerreno100 ?? [])
          : promotoresFiltradosRanking.flatMap((p) => p.detalleTerreno100 ?? [])
        : tipo === 'terrenosena'
          ? promotor
            ? (promotor.detalleTerrenoSena ?? [])
            : promotoresFiltradosRanking.flatMap((p) => p.detalleTerrenoSena ?? [])
          : [];

    const countTabla = promotor
      ? tipo === 'pij'
        ? promotor.ventasPijSemana
        : tipo === 'terreno100'
          ? promotor.ventasTerrenoSemana
          : promotor.ventasTerrenoSenaSemana ?? 0
      : tipo === 'pij'
        ? totalPromotoresPij
        : tipo === 'terreno100'
          ? totalPromotoresTerrenos
          : totalPromotoresTerrenosSeña;

    const cantidadDetalle = tipo === 'pij' ? itemsPij.length : itemsTerreno.length;
    if (countTabla <= 0 && cantidadDetalle <= 0) return;

    const etiquetaTipo =
      tipo === 'pij' ? 'PIJ' : tipo === 'terreno100' ? 'Terrenos 100%' : 'Terrenos con seña';

    const abrirModal = (pij: PijCierreDetalle[], terreno: TerrenoCierreDetalle[]) => {
      const cantidadMostrar =
        (tipo === 'pij' ? pij.length : terreno.length) > 0
          ? tipo === 'pij'
            ? pij.length
            : terreno.length
          : countTabla;
      setFilterText('');
      setInformeVentaDetalle({
        titulo: promotor ? `${etiquetaTipo} — ${promotor.promotorNombre}` : `${etiquetaTipo} — Total`,
        subtitulo: `${cantidadMostrar} venta${cantidadMostrar === 1 ? '' : 's'} · ${rango}`,
        tipo,
        itemsPij: pij,
        itemsTerreno: terreno,
      });
    };

    if (cantidadDetalle === 0 && countTabla > 0) {
      abrirModal(itemsPij, itemsTerreno);
      setInformeDetalleCargando(true);
      try {
        const leadsData = leads.length > 0 ? leads : await fetchAdminLeads();
        if (leads.length === 0) setLeads(leadsData);
        const promotorIds = promotor
          ? [promotor.promotorId]
          : promotoresFiltradosRanking.map((p) => p.promotorId);
        const detalle = extraerVentasDetalleInforme(leadsData, promotorIds, periodo);
        if (tipo === 'pij') itemsPij = detalle.pij;
        else if (tipo === 'terreno100') itemsTerreno = detalle.terreno100;
        else itemsTerreno = detalle.terrenoSena;
        abrirModal(itemsPij, itemsTerreno);
      } catch (err) {
        console.error('Error al cargar detalle de ventas del informe:', err);
      } finally {
        setInformeDetalleCargando(false);
      }
      return;
    }

    abrirModal(itemsPij, itemsTerreno);
  };

  const pijCierresFuente = useMemo(
    () => data.pijCierresPorPersona ?? [],
    [data.pijCierresPorPersona],
  );

  const anexosPorPersonaFiltrados = useMemo(
    () => filterPijCierresPorRango(pijCierresFuente, anexosFechaDesde, anexosFechaHasta),
    [pijCierresFuente, anexosFechaDesde, anexosFechaHasta],
  );
  const rangoAnexosLabel = formatRangoSemana(
    `${anexosFechaDesde}T12:00:00`,
    `${anexosFechaHasta}T12:00:00`,
  );
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

  const untreatedStats = useMemo(() => {
    const untreatedLeads = data.leadsSinTratar ?? [];

    const supervisorNames = new Set(
      data.supervisores.map((s) => s.supervisorNombre.trim().toLowerCase())
    );

    const operators = new Map<string, { id: string; name: string; supervisorName: string; count: number; leads: typeof untreatedLeads }>();

    for (const lead of untreatedLeads) {
      const promKey = `${lead.promotorNombre.trim().toLowerCase()}|${lead.supervisorNombre.trim().toLowerCase()}`;
      if (!operators.has(promKey)) {
        operators.set(promKey, {
          id: promKey,
          name: lead.promotorNombre,
          supervisorName: lead.supervisorNombre,
          count: 0,
          leads: [],
        });
      }
      const opItem = operators.get(promKey)!;
      opItem.count += 1;
      opItem.leads.push(lead);
    }

    const unifiedList = [...operators.values()].map((op) => {
      const isSup = supervisorNames.has(op.name.trim().toLowerCase());
      return {
        id: `op-${op.id}`,
        name: op.name,
        role: (isSup ? 'supervisor' : 'promotor') as 'supervisor' | 'promotor',
        team: isSup ? '—' : op.supervisorName,
        count: op.count,
        leads: op.leads,
      };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

    return {
      total: untreatedLeads.length,
      unifiedList,
    };
  }, [data.leadsSinTratar, data.supervisores]);

  const querySinTratar = busquedaSinTratar.trim().toLowerCase();
  const listadoSinTratarFiltrado = querySinTratar
    ? untreatedStats.unifiedList.filter(item =>
        item.name.toLowerCase().includes(querySinTratar) ||
        (item.role === 'promotor' && item.team.toLowerCase().includes(querySinTratar))
      )
    : untreatedStats.unifiedList;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 pb-12 sm:px-6">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Ocultar elementos de navegación y de control de pantalla */
          nav, 
          header,
          footer,
          .no-print {
            display: none !important;
          }
          
          /* Ocultar el resto de elementos del panel global */
          .mx-auto.max-w-6xl > *:not(.printable-ranking-section),
          main > p {
            display: none !important;
          }
          
          /* Ajustar márgenes de página y contenedores */
          body, html, #root, div[vaul-drawer-wrapper=""], main, .mx-auto.max-w-6xl {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
          }
          
          .printable-ranking-section {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
          }
          
          .printable-ranking-card {
            border: none !important;
            box-shadow: none !important;
          }

          .printable-ranking-table {
            border: 1px solid #e4e4e7 !important;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          
          .printable-ranking-table th, 
          .printable-ranking-table td {
            border: 1px solid #e4e4e7 !important;
            padding: 10px 12px !important;
          }

          .printable-ranking-table th {
            background-color: #f4f4f5 !important;
            color: #18181b !important;
            font-weight: 700 !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Mi Primer Casa S.A. · Superadmin
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-zinc-900">
          Panel global de equipos
        </h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          {tipoPeriodoLabel} ({rango}) · Resultados de hoy ({hoyLabel})
        </p>
      </div>

      <div className="no-print relative">
        <AdminPeriodoSelector periodo={periodoActivo} onCambiarPeriodo={onCambiarPeriodo} />
        {cargando && (
          <p className="mt-2 text-[12px] font-medium text-brand-700">Actualizando período…</p>
        )}
      </div>

      {/* Selector de pestañas */}
      <div className="flex flex-wrap sm:flex-nowrap items-center rounded-xl bg-zinc-100 p-1 border border-zinc-200/50 shadow-sm self-start gap-1 sm:gap-0 no-print">
        <button
          type="button"
          onClick={() => cambiarTab('metricas')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all cursor-pointer text-center whitespace-nowrap ${
            tabActivo === 'metricas'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Métricas
        </button>
        <button
          type="button"
          onClick={() => cambiarTab('buscador')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all cursor-pointer text-center whitespace-nowrap ${
            tabActivo === 'buscador'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Buscador Leads
        </button>
        <button
          type="button"
          onClick={() => cambiarTab('sin_tratar')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all cursor-pointer text-center whitespace-nowrap ${
            tabActivo === 'sin_tratar'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Leads sin Tratar
        </button>
        <button
          type="button"
          onClick={() => cambiarTab('reasignacion')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all cursor-pointer text-center whitespace-nowrap ${
            tabActivo === 'reasignacion'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Reasignación de Leads
        </button>
        <button
          type="button"
          onClick={() => cambiarTab('informe')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all cursor-pointer text-center whitespace-nowrap ${
            tabActivo === 'informe'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Informe de Operaciones
        </button>
        {moduloGrabacionesActivo && (
          <button
            type="button"
            onClick={() => cambiarTab('grabaciones')}
            className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all cursor-pointer text-center whitespace-nowrap ${
              tabActivo === 'grabaciones'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Grabaciones
          </button>
        )}
      </div>

      {data.aviso && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {data.aviso}
        </p>
      )}

      {tabActivo === 'metricas' && (
        <>
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



      {/* Control de Anexos y Recibos por Operador */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
            Control de Anexos y Recibos por Operador
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadFaltantesPij({ mes: 'julio' })}
              disabled={isFaltantesLoading}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-900 shadow-sm hover:bg-amber-100 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isFaltantesLoading ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : null}
              Detectar PIJ no cargados
            </button>
            <button
            onClick={handlePreviewSync}
            disabled={isSyncLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSyncLoading ? (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                <polyline points="12 15 17 21 24 14"></polyline>
              </svg>
            )}
            Sincronizar PIJ con Caja
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 space-y-3">
            <div>
              <h4 className="text-[14px] font-semibold text-zinc-900">Historial de Anexos y Recibos Cargados por Operador</h4>
              <p className="text-[12px] text-zinc-500">
                Sigue el período seleccionado arriba. Podés ajustar el rango manualmente. Hacé clic en PIJ, terrenos 100% o seña para ver el detalle del operador.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Desde</span>
                <input
                  type="date"
                  value={anexosFechaDesde}
                  max={anexosFechaHasta}
                  onChange={(e) => setAnexosFechaDesde(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-zinc-800 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Hasta</span>
                <input
                  type="date"
                  value={anexosFechaHasta}
                  min={anexosFechaDesde}
                  onChange={(e) => setAnexosFechaHasta(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-zinc-800 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setAnexosFechaDesde(inicioMesIso());
                    setAnexosFechaHasta(fechaIsoLocal());
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Mes actual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hoy = new Date();
                    const desde = new Date(hoy);
                    desde.setDate(desde.getDate() - 6);
                    setAnexosFechaDesde(fechaIsoLocal(desde));
                    setAnexosFechaHasta(fechaIsoLocal(hoy));
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Últimos 7 días
                </button>
              </div>
              <p className="text-[12px] text-zinc-500 pb-1">
                Período: <span className="font-semibold text-zinc-700">{rangoAnexosLabel}</span>
              </p>
            </div>
          </div>
          {anexosPorPersonaFiltrados.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-zinc-500">
              No hay cierres PIJ ni terrenos en el rango seleccionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="py-2.5 px-4 text-left font-semibold">Operador</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Anexos (PIJ)</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Terrenos 100%</th>
                    <th className="py-2.5 px-4 text-right font-semibold">T. Seña</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {anexosPorPersonaFiltrados.map((person) => (
                    <tr
                      key={person.operadorNombre}
                      className="text-[13px] text-zinc-700 hover:bg-zinc-50/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-zinc-900">{person.operadorNombre}</td>
                      <td className="py-3 px-4 text-right">
                        {person.cantidad > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFilterText('');
                              setSelectedPerson(person);
                            }}
                            className="font-semibold tabular-nums text-brand-700 hover:text-brand-900 hover:underline cursor-pointer"
                            title="Ver detalle de anexos PIJ"
                          >
                            {person.cantidad}
                          </button>
                        ) : (
                          <span className="font-semibold tabular-nums text-zinc-300">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(person.cantidadRecibos100 ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFilterText('');
                              setSelectedPersonReceipts({ person, tipo: '100' });
                            }}
                            className="font-semibold tabular-nums text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                            title="Ver detalle de terrenos 100%"
                          >
                            {person.cantidadRecibos100}
                          </button>
                        ) : (
                          <span className="font-semibold tabular-nums text-zinc-300">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(person.cantidadRecibosSena ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFilterText('');
                              setSelectedPersonReceipts({ person, tipo: 'sena' });
                            }}
                            className="font-semibold tabular-nums text-amber-700 hover:text-amber-900 hover:underline cursor-pointer"
                            title="Ver detalle de terrenos con seña"
                          >
                            {person.cantidadRecibosSena}
                          </button>
                        ) : (
                          <span className="font-semibold tabular-nums text-zinc-300">0</span>
                        )}
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
          periodo={periodoActivo}
          onCambiarPeriodo={onCambiarPeriodo}
        />
      )}

      {data.conocimientoLeads && data.conocimientoLeads.total > 0 && (
        <AdminConocimientoEncuesta data={data.conocimientoLeads} />
      )}

      {data.productividad && (
        <AdminProductividadPanel data={data.productividad} periodo={periodoActivo} />
      )}

      <section>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          {periodoActivo === 'hoy'
            ? 'Destacados de hoy'
            : periodoActivo === 'semana'
              ? 'Destacados de la semana'
              : esPeriodoAnual
                ? `Destacados de ${periodoCortoLabel}`
                : esPeriodoMes
                  ? `Destacados de ${periodoCortoLabel}`
                  : 'Destacados del mes'}
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
                    {esPeriodoFecha ? 'Día' : periodoActivo === 'hoy' ? 'Hoy' : periodoActivo === 'semana' ? 'Semana' : periodoCortoLabel}: <strong>{sup.totales.entrevistasSemana}</strong> ent. ·{' '}
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
                      <th className="px-2 py-2 text-center">Ent. {periodoCortoLabel}</th>
                      <th className="px-2 py-2 text-center">Ent. hoy</th>
                      <th className="px-2 py-2 text-center">Cierres {periodoCortoLabel}</th>
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
        </>
      )}

      {tabActivo === 'informe' && (
        <section className="space-y-4 printable-ranking-section">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400 no-print">
            INFORME DE OPERACIONES ({tipoPeriodoLabel.toUpperCase()})
          </h3>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm flex flex-col printable-ranking-card">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-[14px] font-semibold text-zinc-900">INFORME DE OPERACIONES</h4>
                <p className="text-[11px] text-zinc-500 no-print">Listado general de promotores. Hacé clic en PIJ, Terrenos 100% o T. Seña para ver el detalle.</p>
                {colorearLeadsDia && <LeyendaLeadsPorDia />}
                <p className="hidden print:block text-[12px] text-zinc-600 mt-1 font-semibold">
                  Rango ({tipoPeriodoLabel}): {rango}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto no-print">
                <AdminPeriodoSelector periodo={periodoActivo} onCambiarPeriodo={onCambiarPeriodo} />
                <PromotorInformeFilter
                  promotores={todosPromotores.map((p) => ({
                    promotorId: p.promotorId,
                    promotorNombre: p.promotorNombre,
                    supervisorNombre: p.supervisorNombre,
                  }))}
                  selectedIds={informePromotoresSeleccionados}
                  onChangeSelected={setInformePromotoresSeleccionados}
                />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] transition-all cursor-pointer shadow-sm shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                  </svg>
                  Imprimir
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100 text-[13px] printable-ranking-table">
                <thead>
                  <tr className="bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="py-2.5 px-3 text-center w-12">Pos</th>
                    <th className="py-2.5 px-3 text-left">Promotor</th>
                    <th className="py-2.5 px-3 text-left">Equipo (Supervisor)</th>
                    <th className="py-2.5 px-3 text-center">Leads</th>
                    <th className="py-2.5 px-3 text-center">
                      {esPeriodoFecha
                        ? 'Tratados Día'
                        : periodoActivo === 'hoy'
                          ? 'Tratados Hoy'
                          : periodoActivo === 'semana'
                            ? 'Tratados Semana'
                            : esPeriodoAnual || esPeriodoMes || periodoActivo === 'mes'
                              ? `Tratados ${periodoCortoLabel}`
                              : 'Tratados Mes'}
                    </th>
                    <th className="py-2.5 px-3 text-center">Entrevistas</th>
                    <th className="py-2.5 px-3 text-center">Cierres</th>
                    <th className="py-2.5 px-3 text-center">Terrenos 100%</th>
                    <th className="py-2.5 px-3 text-center">T. Seña</th>
                    <th className="py-2.5 px-4 text-center">PIJ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {promotoresFiltradosRanking.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-zinc-400 text-[13px]">
                        {informePromotoresSeleccionados.size > 0
                          ? 'Ningún promotor coincide con la selección actual.'
                          : 'No hay promotores para mostrar.'}
                      </td>
                    </tr>
                  ) : (
                    promotoresFiltradosRanking.map((p) => {
                      const originalIndex = promotoresOrdenados.findIndex((x) => x.promotorId === p.promotorId);
                      return (
                        <tr key={p.promotorId} className="hover:bg-zinc-50/80 transition-colors">
                          <td className="py-2.5 px-3 text-center font-medium text-zinc-400">{originalIndex + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-zinc-900">{p.promotorNombre}</td>
                          <td className="py-2.5 px-3 text-zinc-500">{p.supervisorNombre}</td>
                          <td className="py-2.5 px-3 text-center">
                            <CeldaLeadsInforme cantidad={p.leadsSemana} colorear={colorearLeadsDia} />
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap tabular-nums font-semibold text-zinc-800">
                            {esPeriodoFecha || periodoActivo === 'hoy' ? (
                              p.tratadosHoy ?? 0
                            ) : periodoActivo === 'semana' ? (
                              p.tratadosSemana ?? 0
                            ) : (
                              p.tratadosMes ?? 0
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums text-brand-700">{p.entrevistasSemana}</td>
                          <td className="py-2.5 px-3 text-center tabular-nums font-bold text-emerald-700">{p.cierresSemana}</td>
                          <td className="py-2.5 px-3 text-center">
                            <CeldaVentaInforme
                              cantidad={p.ventasTerrenoSemana}
                              className="text-amber-700"
                              onClick={() => abrirDetalleInformeVenta(p, 'terreno100')}
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <CeldaVentaInforme
                              cantidad={p.ventasTerrenoSenaSemana ?? 0}
                              className="text-orange-500"
                              onClick={() => abrirDetalleInformeVenta(p, 'terrenosena')}
                            />
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <CeldaVentaInforme
                              cantidad={p.ventasPijSemana}
                              className="text-indigo-600"
                              onClick={() => abrirDetalleInformeVenta(p, 'pij')}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-50/50 font-bold border-t-2 border-zinc-200">
                    <td colSpan={3} className="py-3 px-3 text-left text-zinc-900 font-bold">
                      {informePromotoresSeleccionados.size > 0 ? 'Total seleccionado' : 'Total Empresa'}
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums font-extrabold">{totalPromotoresLeads}</td>
                    <td className="py-3 px-3 text-center whitespace-nowrap tabular-nums font-extrabold text-zinc-900">
                      {esPeriodoFecha || periodoActivo === 'hoy' ? (
                        totalPromotoresTratadosHoy
                      ) : periodoActivo === 'semana' ? (
                        totalPromotoresTratadosSemana
                      ) : (
                        totalPromotoresTratadosMes
                      )}
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums text-brand-700">{totalPromotoresEntrevistas}</td>
                    <td className="py-3 px-3 text-center tabular-nums text-emerald-700 font-extrabold">{totalPromotoresCierres}</td>
                    <td className="py-3 px-3 text-center">
                      <CeldaVentaInforme
                        cantidad={totalPromotoresTerrenos}
                        className="text-amber-700 font-extrabold"
                        onClick={() => abrirDetalleInformeVenta(null, 'terreno100')}
                      />
                    </td>
                    <td className="py-3 px-3 text-center">
                      <CeldaVentaInforme
                        cantidad={totalPromotoresTerrenosSeña}
                        className="text-orange-500 font-extrabold"
                        onClick={() => abrirDetalleInformeVenta(null, 'terrenosena')}
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <CeldaVentaInforme
                        cantidad={totalPromotoresPij}
                        className="text-indigo-600 font-extrabold"
                        onClick={() => abrirDetalleInformeVenta(null, 'pij')}
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      )}

      {tabActivo === 'grabaciones' && moduloGrabacionesActivo && (
        <section className="space-y-4">
          <GrabacionesCumplimientoPanel />
        </section>
      )}

      {tabActivo === 'buscador' && (
        <section className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm flex flex-col">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-[14px] font-semibold text-zinc-900">Buscador de Leads</h4>
                <p className="text-[11px] text-zinc-500">
                  Buscá leads en toda la base de datos por nombre o número de teléfono.
                </p>
              </div>
              <div className="relative w-full sm:w-72 shrink-0">
                <svg
                  width="14" height="14" viewBox="0 0 16 16" fill="none"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                >
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  id="busqueda-leads-global"
                  type="search"
                  value={busquedaLeads}
                  onChange={(e) => setBusquedaLeads(e.target.value)}
                  placeholder="Nombre o teléfono..."
                  className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
                {busquedaLeads && (
                  <button
                    type="button"
                    onClick={() => setBusquedaLeads('')}
                    style={{ touchAction: 'manipulation' }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 active:text-zinc-700"
                    aria-label="Limpiar búsqueda"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {cargandoLeads ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-brand-600"></div>
                <p className="text-[13px] text-zinc-500 font-medium animate-pulse">Cargando base de datos completa...</p>
              </div>
            ) : leads.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-zinc-400">
                No se pudieron cargar los leads o la base está vacía.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-100 text-[13px]">
                    <thead>
                      <tr className="bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        <th className="py-2.5 px-4 text-left">Cliente</th>
                        <th className="py-2.5 px-4 text-left">Promotor Asignado</th>
                        <th className="py-2.5 px-4 text-left">Equipo (Supervisor)</th>
                        <th className="py-2.5 px-4 text-center">Fecha Ingreso</th>
                        <th className="py-2.5 px-4 text-center">Estado</th>
                        {(usuario?.rol === 'superadmin' || usuario?.panelGlobal) && <th className="py-2.5 px-4 text-center">Acción</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-700">
                      {leadsPaginados.length === 0 ? (
                        <tr>
                          <td colSpan={(usuario?.rol === 'superadmin' || usuario?.panelGlobal) ? 6 : 5} className="py-8 text-center text-zinc-400">
                            No se encontraron leads para la búsqueda "{busquedaLeads}".
                          </td>
                        </tr>
                      ) : (
                        leadsPaginados.map((l) => (
                          <tr key={l.id} className="hover:bg-zinc-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-zinc-900">{l.nombre}</div>
                              <div className="text-[11px] font-mono text-zinc-400">
                                {l.telefono ? cleanTelefonoSuffix(l.telefono) : 'Sin teléfono'}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-medium text-zinc-800">
                              {l.promotorNombre || 'Sin promotor'}
                            </td>
                            <td className="py-3 px-4 text-zinc-500">
                              {l.supervisorNombre || 'Sin supervisor'}
                            </td>
                            <td className="py-3 px-4 text-center text-zinc-500 tabular-nums">
                              {formatearFecha(l.fechaAlta || l.fechaObtencion)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {renderEstadoBadge(l.lista)}
                            </td>
                            {(usuario?.rol === 'superadmin' || usuario?.panelGlobal) && (
                              <td className="py-3 px-4 text-center">
                                <div className="flex justify-center items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => setSeguimientoLead(l)}
                                    className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer"
                                  >
                                    Seguimiento
                                  </button>
                                  <span className="text-zinc-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => setModificandoLead(l)}
                                    className="text-[12px] font-semibold text-amber-600 hover:text-amber-800 hover:underline cursor-pointer"
                                  >
                                    Modificar
                                  </button>
                                  <span className="text-zinc-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDuplicatingLead(l);
                                      setTargetVendedorCode('');
                                      setDuplicatingMessage(null);
                                    }}
                                    className="text-[12px] font-semibold text-brand-600 hover:text-brand-800 hover:underline cursor-pointer"
                                  >
                                    Duplicar
                                  </button>
                                  <span className="text-zinc-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setResettingLead(l);
                                      setResettingMessage(null);
                                    }}
                                    className="text-[12px] font-semibold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                                  >
                                    Resetear
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-4 py-3">
                    <p className="text-[12px] text-zinc-500">
                      Mostrando <span className="font-semibold">{indexPrimerLead + 1}</span> a <span className="font-semibold">{Math.min(indexUltimoLead, leadsFiltrados.length)}</span> de <span className="font-semibold">{leadsFiltrados.length}</span> leads
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                        disabled={paginaActual === 1}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                        disabled={paginaActual === totalPaginas}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {tabActivo === 'sin_tratar' && (
        <section className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm flex flex-col">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-[14px] font-semibold text-zinc-900">Leads sin Tratar por Operador</h4>
                <p className="text-[11px] text-zinc-500">
                  Total de leads sin ningún tipo de tratamiento en la empresa: <strong className="text-red-600 font-bold tabular-nums">{untreatedStats.total}</strong>
                </p>
              </div>
              <div className="relative w-full sm:w-72 shrink-0">
                <svg
                  width="14" height="14" viewBox="0 0 16 16" fill="none"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                >
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  id="busqueda-sin-tratar"
                  type="search"
                  value={busquedaSinTratar}
                  onChange={(e) => setBusquedaSinTratar(e.target.value)}
                  placeholder="Buscar supervisor o promotor..."
                  className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
                {busquedaSinTratar && (
                  <button
                    type="button"
                    onClick={() => setBusquedaSinTratar('')}
                    style={{ touchAction: 'manipulation' }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 active:text-zinc-700"
                    aria-label="Limpiar búsqueda"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100 text-[13px]">
                <thead>
                  <tr className="bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="py-2.5 px-4 text-left">Operador</th>
                    <th className="py-2.5 px-4 text-center">Rol</th>
                    <th className="py-2.5 px-4 text-left">Equipo (Supervisor)</th>
                    <th className="py-2.5 px-4 text-right">Leads sin Tratar</th>
                    <th className="py-2.5 px-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {listadoSinTratarFiltrado.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">
                        No se encontraron resultados para la búsqueda "{busquedaSinTratar}".
                      </td>
                    </tr>
                  ) : (
                    listadoSinTratarFiltrado.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-zinc-900">{item.name}</td>
                        <td className="py-3 px-4 text-center">
                          {item.role === 'supervisor' ? (
                            <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              Supervisor
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-zinc-100 border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                              Promotor
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-500">{item.team}</td>
                        <td className="py-3 px-4 text-right font-bold tabular-nums text-red-600">
                          {item.count}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedOperatorUntreated(item)}
                            className="text-[12px] font-semibold text-brand-600 hover:text-brand-800 hover:underline cursor-pointer"
                          >
                            Ver leads
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tabActivo === 'reasignacion' && (
        <section className="space-y-4">
          {resultadoReasignacion && (
            <div
              className={`rounded-lg border px-4 py-3 text-[13px] transition-all duration-300 ${
                resultadoReasignacion.tipo === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm'
                  : 'border-rose-200 bg-rose-50 text-rose-950 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2">
                {resultadoReasignacion.tipo === 'success' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 shrink-0">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-rose-600 shrink-0">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                )}
                <p className="font-medium">{resultadoReasignacion.mensaje}</p>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm flex flex-col">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-[14px] font-semibold text-zinc-900">Reasignación de Leads</h4>
                <p className="text-[11px] text-zinc-500">
                  Buscá leads en toda la base y reasignalos a otro promotor o supervisor (actualiza el propietario del lead).
                </p>
              </div>
              <div className="relative w-full sm:w-72 shrink-0">
                <svg
                  width="14" height="14" viewBox="0 0 16 16" fill="none"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                >
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  id="busqueda-reasignar"
                  type="search"
                  value={busquedaReasignar}
                  onChange={(e) => setBusquedaReasignar(e.target.value)}
                  placeholder="Buscar cliente, promotor, supervisor..."
                  className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
                {busquedaReasignar && (
                  <button
                    type="button"
                    onClick={() => setBusquedaReasignar('')}
                    style={{ touchAction: 'manipulation' }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 active:text-zinc-700"
                    aria-label="Limpiar búsqueda"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {cargandoLeads || cargandoOperadores ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-brand-600"></div>
                <p className="text-[13px] text-zinc-500 font-medium animate-pulse">Cargando datos de leads y operadores...</p>
              </div>
            ) : leads.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-zinc-400">
                No se pudieron cargar los leads.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-100 text-[13px]">
                    <thead>
                      <tr className="bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        <th className="py-2.5 px-4 text-left">Cliente</th>
                        <th className="py-2.5 px-4 text-left">Promotor Actual</th>
                        <th className="py-2.5 px-4 text-left">Supervisor Actual</th>
                        <th className="py-2.5 px-4 text-left">Reasignar A</th>
                        <th className="py-2.5 px-4 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-700">
                      {leadsPaginadosReasignar.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-400">
                            No se encontraron leads para la búsqueda "{busquedaReasignar}".
                          </td>
                        </tr>
                      ) : (
                        leadsPaginadosReasignar.map((l) => {
                          const currentOwnerCode = l.codigoPromotorCarga || l.encuestaUsuario || '';
                          const selectedCode = selectedOperatorCodes[l.id] ?? currentOwnerCode;
                          const hasChanged = selectedCode !== currentOwnerCode;
                          const isPending = reasignandoLeadId === l.id;

                          const supervisoresCatalog = operadores.filter(o => o.rol === 'supervisor');
                          const promotoresCatalog = operadores.filter(o => o.rol === 'promotor');

                          return (
                            <tr key={l.id} className="hover:bg-zinc-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-semibold text-zinc-900">{l.nombre}</div>
                                <div className="text-[11px] font-mono text-zinc-400">
                                  {l.telefono ? cleanTelefonoSuffix(l.telefono) : 'Sin teléfono'}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-medium text-zinc-800">
                                {l.promotorNombre || 'Sin promotor'}
                              </td>
                              <td className="py-3 px-4 text-zinc-500">
                                {l.supervisorNombre || 'Sin supervisor'}
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  value={selectedCode}
                                  disabled={isPending}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedOperatorCodes(prev => ({ ...prev, [l.id]: val }));
                                  }}
                                  className="w-full sm:w-64 rounded-lg border border-zinc-200 bg-white py-1.5 px-2.5 text-[13px] text-zinc-800 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100 disabled:bg-zinc-50 disabled:text-zinc-400"
                                >
                                  <option value="">Seleccionar operador...</option>
                                  {supervisoresCatalog.length > 0 && (
                                    <optgroup label="Supervisores">
                                      {supervisoresCatalog.map(o => (
                                        <option key={o.codigo} value={o.codigo}>
                                          {o.nombre} ({o.codigo})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {promotoresCatalog.length > 0 && (
                                    <optgroup label="Promotores">
                                      {promotoresCatalog.map(o => (
                                        <option key={o.codigo} value={o.codigo}>
                                          {o.nombre} ({o.codigo})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  type="button"
                                  disabled={!hasChanged || isPending}
                                  onClick={() => handleReasignar(l.id, selectedCode)}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all shadow-sm active:scale-[0.98] ${
                                    hasChanged && !isPending
                                      ? 'bg-brand-600 text-white hover:bg-brand-700 cursor-pointer'
                                      : 'bg-zinc-100 text-zinc-400 border border-zinc-200/50 cursor-not-allowed shadow-none'
                                  }`}
                                >
                                  {isPending ? (
                                    <>
                                      <svg className="animate-spin -ml-0.5 mr-0.5 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                      </svg>
                                      Aplicando...
                                    </>
                                  ) : (
                                    'Aplicar'
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPaginasReasignar > 1 && (
                  <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-4 py-3">
                    <p className="text-[12px] text-zinc-500">
                      Mostrando <span className="font-semibold">{((paginaReasignar - 1) * leadsPorPagina) + 1}</span> a{' '}
                      <span className="font-semibold">{Math.min(paginaReasignar * leadsPorPagina, leadsFiltradosReasignar.length)}</span> de{' '}
                      <span className="font-semibold">{leadsFiltradosReasignar.length}</span> leads
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPaginaReasignar((p) => Math.max(1, p - 1))}
                        disabled={paginaReasignar === 1}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaginaReasignar((p) => Math.min(totalPaginasReasignar, p + 1))}
                        disabled={paginaReasignar === totalPaginasReasignar}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}



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
                  {selectedPerson.cantidad} cierre{selectedPerson.cantidad === 1 ? '' : 's'} de Plan Inversión Joven · {rangoAnexosLabel}
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
                        {filteredCierres.map((cierre, idx) => (
                          <tr key={`${cierre.leadId}-${cierre.numeroAnexo}-${idx}`} className="text-[13px] text-zinc-700">
                            <td className="py-3 font-medium text-zinc-900">{cierre.leadNombre}</td>
                            <td className="py-3">
                              <a
                                href={`tel:${cleanTelefonoSuffix(cierre.leadTelefono)}`}
                                className="text-brand-600 hover:underline inline-flex items-center gap-1 font-mono text-[12px] tabular-nums"
                              >
                                {cleanTelefonoSuffix(cierre.leadTelefono)}
                              </a>
                            </td>
                            <td className="py-3 text-center">
                              <span className="inline-flex items-center rounded-md bg-brand-50 border border-brand-100 px-2 py-0.5 text-[12px] font-bold text-brand-700">
                                {cierre.numeroAnexo}
                              </span>
                            </td>
                            <td className="py-3 text-right text-zinc-500 tabular-nums">
                              {(() => {
                                const { fecha, horario } = formatFechaHorarioCierre(cierre.fechaCierre);
                                return horario !== '—' ? `${fecha} ${horario}` : fecha;
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

      {/* Modal de Detalle de Recibos */}
      {selectedPersonReceipts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setSelectedPersonReceipts(null);
              setFilterText('');
            }}
          />

          {/* Modal Content */}
          <div className="relative z-50 flex h-full max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl transition-all duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  {selectedPersonReceipts.tipo === 'sena'
                    ? `Terrenos con seña — ${selectedPersonReceipts.person.operadorNombre}`
                    : `Terrenos 100% — ${selectedPersonReceipts.person.operadorNombre}`}
                </h3>
                <p className="text-[12px] text-zinc-500">
                  {(selectedPersonReceipts.tipo === 'sena'
                    ? selectedPersonReceipts.person.cantidadRecibosSena
                    : selectedPersonReceipts.person.cantidadRecibos100) ?? 0}{' '}
                  cierre
                  {((selectedPersonReceipts.tipo === 'sena'
                    ? selectedPersonReceipts.person.cantidadRecibosSena
                    : selectedPersonReceipts.person.cantidadRecibos100) ?? 0) === 1
                    ? ''
                    : 's'}{' '}
                  · {rangoAnexosLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPersonReceipts(null);
                  setFilterText('');
                }}
                className="flex h-8 w-8 items-center justify-center text-[20px] rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Search filter */}
            <div className="border-b border-zinc-100 px-6 py-3 bg-zinc-50/50">
              <input
                type="text"
                placeholder="Buscar por cliente, teléfono, barrio o número de recibo..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 transition-all"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(() => {
                const recibosList =
                  selectedPersonReceipts.tipo === 'sena'
                    ? (selectedPersonReceipts.person.recibosSena ?? [])
                    : (selectedPersonReceipts.person.recibos100 ?? []);
                const filteredRecibos = recibosList.filter(r => {
                  const query = filterText.toLowerCase();
                  const barrioNombre = getBarrioNombre(r.idBarrio, barrios) || '';
                  return (
                    r.leadNombre.toLowerCase().includes(query) ||
                    r.numeroRecibo.toLowerCase().includes(query) ||
                    r.leadTelefono.includes(filterText) ||
                    barrioNombre.toLowerCase().includes(query)
                  );
                });

                if (filteredRecibos.length === 0) {
                  return (
                    <p className="py-8 text-center text-[13px] text-zinc-500">
                      {filterText ? 'No se encontraron resultados para la búsqueda.' : 'No hay recibos registrados.'}
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
                          <th className="pb-2 text-center font-semibold">Barrio</th>
                          <th className="pb-2 text-center font-semibold">Nro. Recibo</th>
                          <th className="pb-2 text-right font-semibold">Fecha de Cierre</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredRecibos.map((recibo, idx) => (
                          <tr key={`${recibo.leadId}-${recibo.numeroRecibo}-${idx}`} className="text-[13px] text-zinc-700">
                            <td className="py-3 font-medium text-zinc-900">{recibo.leadNombre}</td>
                            <td className="py-3">
                              <a
                                href={`tel:${cleanTelefonoSuffix(recibo.leadTelefono)}`}
                                className="text-brand-600 hover:underline inline-flex items-center gap-1 font-mono text-[12px] tabular-nums"
                              >
                                {cleanTelefonoSuffix(recibo.leadTelefono)}
                              </a>
                            </td>
                            <td className="py-3 text-center text-zinc-600">
                              {getBarrioNombre(recibo.idBarrio, barrios) || 'Sin barrio'}
                            </td>
                            <td className="py-3 text-center">
                              <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-700">
                                {recibo.numeroRecibo}
                              </span>
                            </td>
                            <td className="py-3 text-right text-zinc-500 tabular-nums">
                              {(() => {
                                const { fecha, horario } = formatFechaHorarioCierre(recibo.fechaCierre);
                                return horario !== '—' ? `${fecha} ${horario}` : fecha;
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
                  setSelectedPersonReceipts(null);
                  setFilterText('');
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-[0.98] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Leads Sin Tratar */}
      {selectedOperatorUntreated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setSelectedOperatorUntreated(null);
              setFilterText('');
            }}
          />

          {/* Modal Content */}
          <div className="relative z-50 flex h-full max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl transition-all duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Leads sin Tratar de {selectedOperatorUntreated.name}
                </h3>
                <p className="text-[12px] text-zinc-500">
                  {selectedOperatorUntreated.count} lead{selectedOperatorUntreated.count === 1 ? '' : 's'} sin contactar ni agendar
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedOperatorUntreated(null);
                  setFilterText('');
                }}
                className="flex h-8 w-8 items-center justify-center text-[20px] rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Search filter inside modal */}
            <div className="border-b border-zinc-100 px-6 py-3 bg-zinc-50/50">
              <input
                type="text"
                placeholder="Buscar por cliente o teléfono..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 transition-all"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(() => {
                const filteredLeads = selectedOperatorUntreated.leads.filter(c =>
                  c.nombre.toLowerCase().includes(filterText.toLowerCase()) ||
                  c.telefono.includes(filterText)
                );

                if (filteredLeads.length === 0) {
                  return (
                    <p className="py-8 text-center text-[13px] text-zinc-500">
                      {filterText ? 'No se encontraron resultados para la búsqueda.' : 'No hay leads registrados.'}
                    </p>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-100 text-[13px]">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          <th className="pb-2 text-left font-semibold">Cliente</th>
                          <th className="pb-2 text-left font-semibold">Teléfono</th>
                          <th className="pb-2 text-center font-semibold">Origen</th>
                          <th className="pb-2 text-right font-semibold">Fecha de Alta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-zinc-700">
                        {filteredLeads.map((c) => (
                          <tr key={c.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="py-3 font-semibold text-zinc-900">{c.nombre}</td>
                            <td className="py-3">
                              <a
                                href={`tel:${cleanTelefonoSuffix(c.telefono)}`}
                                className="text-brand-600 hover:underline inline-flex items-center gap-1 font-mono text-[12px] tabular-nums"
                              >
                                {cleanTelefonoSuffix(c.telefono)}
                              </a>
                            </td>
                            <td className="py-3 text-center">
                              <span className="inline-flex items-center rounded-md bg-zinc-100 border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                                {c.origen === '1' || c.origen === 'qr' ? 'QR' : 
                                 c.origen === '3' || c.origen === 'instagram' ? 'Instagram' : 
                                 c.origen === '4' || c.origen === 'facebook' ? 'Facebook' : 
                                 c.origen === '5' || c.origen === 'whatsapp' ? 'WhatsApp' : 
                                 c.origen === '2' || c.origen === 'manual' ? 'Manual' : c.origen}
                              </span>
                            </td>
                            <td className="py-3 text-right text-zinc-500 tabular-nums">
                              {formatearFecha(c.fechaAlta)}
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
                  setSelectedOperatorUntreated(null);
                  setFilterText('');
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-[0.98] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Duplicación de Lead */}
      {duplicatingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              if (!duplicatingPending) {
                setDuplicatingLead(null);
                setDuplicatingMessage(null);
              }
            }}
          />

          {/* Modal Content */}
          <div className="relative z-50 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl transition-all duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Duplicar Lead
                </h3>
                <p className="text-[12px] text-zinc-500">
                  Crear una copia de este contacto para otro vendedor
                </p>
              </div>
              <button
                type="button"
                disabled={duplicatingPending}
                onClick={() => {
                  setDuplicatingLead(null);
                  setDuplicatingMessage(null);
                }}
                className="flex h-8 w-8 items-center justify-center text-[20px] rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors disabled:opacity-50 cursor-pointer"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              {duplicatingMessage && (
                <div
                  className={`rounded-lg border px-4 py-2.5 text-[13px] ${
                    duplicatingMessage.tipo === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-rose-200 bg-rose-50 text-rose-950'
                  }`}
                >
                  {duplicatingMessage.mensaje}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Cliente Original</p>
                <p className="text-[14px] font-semibold text-zinc-800">{duplicatingLead.nombre}</p>
                <p className="text-[12px] text-zinc-500 tabular-nums">
                  Teléfono: {cleanTelefonoSuffix(duplicatingLead.telefono)}
                </p>
                <p className="text-[12px] text-zinc-500">
                  Vendedor actual: {duplicatingLead.promotorNombre || duplicatingLead.supervisorNombre || 'Sin asignar'}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Vendedor de Destino
                </label>
                <select
                  value={targetVendedorCode}
                  disabled={duplicatingPending}
                  onChange={(e) => setTargetVendedorCode(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2 px-3 text-[13px] text-zinc-800 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100 disabled:bg-zinc-50 disabled:text-zinc-400"
                >
                  <option value="">Seleccionar operador...</option>
                  {operadores.filter(o => o.rol === 'supervisor').length > 0 && (
                    <optgroup label="Supervisores">
                      {operadores
                        .filter(o => o.rol === 'supervisor')
                        .map(o => (
                          <option key={o.codigo} value={o.codigo}>
                            {o.nombre} ({o.codigo})
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {operadores.filter(o => o.rol === 'promotor').length > 0 && (
                    <optgroup label="Promotores">
                      {operadores
                        .filter(o => o.rol === 'promotor')
                        .map(o => (
                          <option key={o.codigo} value={o.codigo}>
                            {o.nombre} ({o.codigo})
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <p className="text-[12px] leading-relaxed text-zinc-500 bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                ℹ️ El lead duplicado se creará con el estado <strong>"Sin tratar"</strong> para el vendedor de destino, permitiendo una gestión comercial independiente. No se copiará el historial de seguimientos del vendedor anterior.
              </p>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-100 px-6 py-3.5 bg-zinc-50/50">
              <button
                type="button"
                disabled={duplicatingPending}
                onClick={() => {
                  setDuplicatingLead(null);
                  setDuplicatingMessage(null);
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!targetVendedorCode || duplicatingPending}
                onClick={handleDuplicarLeadSubmit}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-all shadow-sm active:scale-[0.98] ${
                  targetVendedorCode && !duplicatingPending
                    ? 'bg-brand-600 hover:bg-brand-700 cursor-pointer'
                    : 'bg-zinc-300 cursor-not-allowed shadow-none'
                }`}
              >
                {duplicatingPending ? (
                  <>
                    <svg className="animate-spin -ml-0.5 mr-0.5 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Duplicando...
                  </>
                ) : (
                  'Duplicar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reseteo de Lead */}
      {resettingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              if (!resettingPending) {
                setResettingLead(null);
                setResettingMessage(null);
              }
            }}
          />

          {/* Modal Content */}
          <div className="relative z-50 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl transition-all duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Resetear Seguimiento
                </h3>
                <p className="text-[12px] text-zinc-500">
                  Limpiar el historial de seguimiento del cliente
                </p>
              </div>
              <button
                type="button"
                disabled={resettingPending}
                onClick={() => {
                  setResettingLead(null);
                  setResettingMessage(null);
                }}
                className="flex h-8 w-8 items-center justify-center text-[20px] rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors disabled:opacity-50 cursor-pointer"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              {resettingMessage && (
                <div
                  className={`rounded-lg border px-4 py-2.5 text-[13px] ${
                    resettingMessage.tipo === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-rose-200 bg-rose-50 text-rose-950'
                  }`}
                >
                  {resettingMessage.mensaje}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Cliente</p>
                <p className="text-[14px] font-semibold text-zinc-800">{resettingLead.nombre}</p>
                <p className="text-[12px] text-zinc-500 tabular-nums">
                  Teléfono: {cleanTelefonoSuffix(resettingLead.telefono)}
                </p>
                <p className="text-[12px] text-zinc-500">
                  Vendedor asignado: {resettingLead.promotorNombre || resettingLead.supervisorNombre || 'Sin asignar'}
                </p>
              </div>

              <div className="rounded-lg border border-red-100 bg-red-50/50 p-3.5 space-y-2">
                <p className="text-[12px] leading-relaxed text-red-950 font-medium flex items-start gap-1.5">
                  <span>⚠️</span>
                  <span>¿Estás seguro de que deseas resetear el seguimiento de este lead?</span>
                </p>
                <p className="text-[12px] leading-relaxed text-red-700/80 pl-5">
                  Esta acción <strong>eliminará la asociación del operador actual</strong>, borrará el historial de seguimientos, y devolverá el lead al estado <strong>"Sin tratar"</strong>. Esto permitirá que cualquier operador o el promotor original vuelvan a contactarlo y gestionarlo desde cero.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-100 px-6 py-3.5 bg-zinc-50/50">
              <button
                type="button"
                disabled={resettingPending}
                onClick={() => {
                  setResettingLead(null);
                  setResettingMessage(null);
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resettingPending}
                onClick={handleResetearLeadSubmit}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-all shadow-sm active:scale-[0.98] ${
                  !resettingPending
                    ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                    : 'bg-zinc-300 cursor-not-allowed shadow-none'
                }`}
              >
                {resettingPending ? (
                  <>
                    <svg className="animate-spin -ml-0.5 mr-0.5 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Reseteando...
                  </>
                ) : (
                  'Confirmar Reseteo'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminModificarLeadModal
        lead={modificandoLead}
        open={modificandoLead !== null}
        onClose={() => setModificandoLead(null)}
        onSave={handleModificarLead}
      />

      <LeadModalForm
        lead={seguimientoLead}
        open={seguimientoLead !== null}
        rolUsuario="supervisor"
        productos={productos}
        barrios={barrios}
        todosLosLeads={leads}
        onClose={() => setSeguimientoLead(null)}
        onSave={handleGuardarSeguimiento}
      />

      {/* Modal detalle ventas — Informe de Operaciones */}
      {informeVentaDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm"
            onClick={() => {
              setInformeVentaDetalle(null);
              setInformeDetalleCargando(false);
              setFilterText('');
            }}
          />
          <div className="relative z-50 flex h-full max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">{informeVentaDetalle.titulo}</h3>
                <p className="text-[12px] text-zinc-500">{informeVentaDetalle.subtitulo}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInformeVentaDetalle(null);
                  setInformeDetalleCargando(false);
                  setFilterText('');
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xl text-zinc-400 hover:bg-zinc-100"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="border-b border-zinc-100 px-6 py-3 bg-zinc-50/50">
              <input
                type="text"
                placeholder={
                  informeVentaDetalle.tipo === 'pij'
                    ? 'Buscar por cliente, teléfono o anexo...'
                    : 'Buscar por cliente, teléfono, barrio o recibo...'
                }
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {informeDetalleCargando ? (
                <p className="py-8 text-center text-[13px] text-zinc-500">Cargando detalle de ventas…</p>
              ) : informeVentaDetalle.tipo === 'pij' ? (
                (() => {
                  const q = filterText.toLowerCase();
                  const filtrados = informeVentaDetalle.itemsPij.filter(
                    (c) =>
                      c.leadNombre.toLowerCase().includes(q) ||
                      c.numeroAnexo.toLowerCase().includes(q) ||
                      c.leadTelefono.includes(filterText),
                  );
                  if (filtrados.length === 0) {
                    return (
                      <p className="py-8 text-center text-[13px] text-zinc-500">
                        {filterText ? 'Sin resultados.' : 'Sin ventas PIJ en el período.'}
                      </p>
                    );
                  }
                  return (
                    <table className="min-w-full divide-y divide-zinc-100 text-[13px]">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          <th className="pb-2 text-left">Cliente</th>
                          <th className="pb-2 text-left">Teléfono</th>
                          <th className="pb-2 text-center">Anexo / Recibo</th>
                          <th className="pb-2 text-right">Fecha</th>
                          <th className="pb-2 text-right">Horario</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filtrados.map((c, idx) => {
                          const { fecha, horario } = formatFechaHorarioCierre(c.fechaCierre);
                          return (
                          <tr key={`${c.leadId}-${c.numeroAnexo}-${idx}`}>
                            <td className="py-3 font-medium text-zinc-900">{c.leadNombre}</td>
                            <td className="py-3 font-mono text-[12px] text-brand-600">
                              {cleanTelefonoSuffix(c.leadTelefono)}
                            </td>
                            <td className="py-3 text-center">
                              <span className="inline-flex rounded-md bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[12px] font-bold text-indigo-700">
                                {c.numeroAnexo}
                              </span>
                            </td>
                            <td className="py-3 text-right text-zinc-600 tabular-nums">{fecha}</td>
                            <td className="py-3 text-right font-semibold text-zinc-800 tabular-nums">{horario}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()
              ) : (
                (() => {
                  const q = filterText.toLowerCase();
                  const filtrados = informeVentaDetalle.itemsTerreno.filter((r) => {
                    const barrioNombre = getBarrioNombre(r.idBarrio, barrios) || '';
                    return (
                      r.leadNombre.toLowerCase().includes(q) ||
                      r.numeroRecibo.toLowerCase().includes(q) ||
                      r.leadTelefono.includes(filterText) ||
                      barrioNombre.toLowerCase().includes(q)
                    );
                  });
                  if (filtrados.length === 0) {
                    return (
                      <p className="py-8 text-center text-[13px] text-zinc-500">
                        {filterText ? 'Sin resultados.' : 'Sin terrenos en el período.'}
                      </p>
                    );
                  }
                  return (
                    <table className="min-w-full divide-y divide-zinc-100 text-[13px]">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          <th className="pb-2 text-left">Cliente</th>
                          <th className="pb-2 text-left">Teléfono</th>
                          <th className="pb-2 text-center">Barrio</th>
                          <th className="pb-2 text-center">Recibo</th>
                          <th className="pb-2 text-right">Fecha</th>
                          <th className="pb-2 text-right">Horario</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filtrados.map((r, idx) => {
                          const { fecha, horario } = formatFechaHorarioCierre(r.fechaCierre);
                          return (
                          <tr key={`${r.leadId}-${r.numeroRecibo}-${idx}`}>
                            <td className="py-3 font-medium text-zinc-900">{r.leadNombre}</td>
                            <td className="py-3 font-mono text-[12px] text-brand-600">
                              {cleanTelefonoSuffix(r.leadTelefono)}
                            </td>
                            <td className="py-3 text-center text-zinc-600">
                              {getBarrioNombre(r.idBarrio, barrios) || '—'}
                            </td>
                            <td className="py-3 text-center">
                              <span className="inline-flex rounded-md bg-amber-50 border border-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-700">
                                {r.numeroRecibo}
                              </span>
                            </td>
                            <td className="py-3 text-right text-zinc-600 tabular-nums">{fecha}</td>
                            <td className="py-3 text-right font-semibold text-zinc-800 tabular-nums">{horario}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()
              )}
            </div>
            <div className="flex justify-end border-t border-zinc-100 px-6 py-3.5 bg-zinc-50/50">
              <button
                type="button"
                onClick={() => {
                  setInformeVentaDetalle(null);
                  setInformeDetalleCargando(false);
                  setFilterText('');
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <SyncCajaModal 
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        cambiosPropuestos={syncPreviewItems}
        onCommit={handleCommitSync}
        isLoading={isSyncLoading}
      />
      <FaltantesPijModal
        isOpen={isFaltantesModalOpen}
        onClose={() => setIsFaltantesModalOpen(false)}
        data={faltantesData}
        isLoading={isFaltantesLoading}
        mes={faltantesMes}
        onCambiarMes={(m) => void loadFaltantesPij({ mes: m })}
        onRecargar={() => void loadFaltantesPij({ mes: faltantesMes })}
        onSubirCsv={(csvText) => void loadFaltantesPij({ csvText })}
      />
    </div>
  );
}
