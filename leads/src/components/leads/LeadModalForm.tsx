import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import { cleanTelefonoSuffix } from '../../domain/whatsapp';
import { fetchRecibosOcupados } from '../../api/client';
import {
  formatEntrevistaCalendario,
  getHorarioEntrevistaLead,
  getLugarEntrevistaLead,
  getProductoNombre,
  getProductosPorRol,
  labelLugarEntrevista,
  etiquetaSeguimientoAgendaOtroRol,
  leadSeguimientoPijPromotor,
  leadTieneCitaPrevia,
  puedeVenderProducto,
  resolverDerivacionTerrenoActiva,
  ETIQUETA_CIERRE_SUPERVISOR,
  ETIQUETA_SEGUIMIENTO_PIJ,
} from '../../domain/leads';
import {
  buildPijRecibo,
  parsePijRecibo,
  buscarConflictoPij,
  buscarConflictoTerreno,
  mensajeConflictoVenta,
  construirIndiceVentasDesdeLeads,
  fusionarIndicesVentas,
  indiceVentasDesdeComprasFormulario,
  type IndiceVentasOcupados,
  type ExcluirRegistroVenta,
} from '../../domain/pij-recibo';
import { parseIsoLocal } from '../../domain/seguimiento-historial';
import {
  esPlanInversion,
  esTerreno,
  etiquetaEstadoPagoVisible,
  etiquetaCortaNumeroDocumentoVenta,
  getBarrioNombre,
  ID_PRODUCTO_PIJ,
  ID_PRODUCTO_TERRENO,
  etiquetasResultadoEntrevista,
  estadoPagoEditablePlanInversion,
  opcionesPagoParaRol,
  tituloEstadoCompra,
  etiquetaNumeroDocumentoVenta,
  mensajeErrorNumeroDocumentoVenta,
  requiereNumeroRecibo,
  resetCamposAlCambiarProducto,
  resetCamposVenta,
} from '../../domain/venta';
import type {
  Barrio,
  CanalContacto,
  CompraAdicional,
  EstadoPago,
  Lead,
  Producto,
  Referido,
  RolUsuario,
  SeguimientoLead,
} from '../../types';
import { BarrioPickerSheet } from './BarrioPickerSheet';
import { ButtonGroup, FormSection, RadioOption } from '../ui/ButtonGroup';
import { DateTimePicker } from '../ui/DateTimePicker';

const emptyReferido = (): Referido => ({ nombre: '', telefono: '' });

interface FormState {
  confirmoEntrevista: boolean | null;
  /** Sin cita previa: ¿se contactó con el cliente? (supervisor y promotor). */
  seContactoCliente: boolean | null;
  /** Sin cita previa, tras contacto: ¿agendó entrevista? */
  agendoEntrevista: boolean | null;
  canal: SeguimientoLead['canal'];
  huboEntrevista: boolean | null;
  resultadoEntrevista: SeguimientoLead['resultadoEntrevista'];
  fechaReagenda: string;
  reagendarEntrevista: boolean;
  /** Promotor: tras «No compró», ¿reagendar para ofrecer PIJ? */
  reagendaPijTrasNoCompro: boolean | null;
  idProducto: string;
  estadoPago: SeguimientoLead['estadoPago'];
  idBarrio: string;
  numeroRecibo: string;
  brindoReferidos: boolean | null;
  referidos: Referido[];
  observaciones: string;
  /** Promotor — derivar terreno: ¿el cliente propuso fecha? */
  proponeFechaDerivacion: boolean | null;
  horarioDerivacion: string;
  /** Sin cita + canal en persona + entrevista en el momento + no compró. */
  reagendaTrasNoComproEnPersona: boolean | null;
  comprasAdicionales: CompraAdicional[];
}

const OPCIONES_CANAL_BASE: { value: CanalContacto; label: string }[] = [
  { value: 'llamada', label: 'Llamada' },
  { value: 'mensaje', label: 'Mensaje' },
];

function opcionesCanalContacto(): { value: CanalContacto; label: string }[] {
  return [...OPCIONES_CANAL_BASE, { value: 'en_persona', label: 'En persona' }];
}

function buildInitialForm(lead: Lead | null): FormState {
  const s = lead?.seguimiento ?? {};
  const reagenda = s.resultadoEntrevista === 'reagenda';
  const seguimientoPij = s.seguimientoPijPromotor === true;
  const derivar = s.resultadoEntrevista === 'derivar_terreno';
  const horarioDeriv =
    s.horarioEntrevistaPropuesto?.trim() || lead?.horarioEntrevista?.trim() || '';
  let estadoPago = s.estadoPago ?? null;
  if (esPlanInversion(s.idProducto)) {
    estadoPago = estadoPagoEditablePlanInversion(
      estadoPago === 'cien' ? 'entrega_33' : estadoPago,
    );
  }
  const sinCita = lead ? !leadTieneCitaPrevia(lead) : false;
  const contactoHecho =
    s.canal != null ||
    s.confirmoEntrevista === true ||
    s.huboEntrevista != null ||
    s.resultadoEntrevista != null;
  let agendoEntrevista: boolean | null = null;
  let reagendaTrasNoComproEnPersona: boolean | null = null;
  if (sinCita && contactoHecho) {
    if (reagenda && !seguimientoPij && s.huboEntrevista !== true) agendoEntrevista = true;
    else if (s.resultadoEntrevista === 'sin_interes' && s.huboEntrevista !== true) {
      agendoEntrevista = false;
    } else if (s.canal === 'en_persona' && s.huboEntrevista === true) {
      agendoEntrevista = false;
      if (s.resultadoEntrevista === 'reagenda') reagendaTrasNoComproEnPersona = true;
      else if (s.resultadoEntrevista === 'sin_interes') reagendaTrasNoComproEnPersona = false;
    }
  }

  return {
    confirmoEntrevista: s.confirmoEntrevista ?? null,
    seContactoCliente: sinCita
      ? contactoHecho
        ? true
        : s.confirmoEntrevista === false
          ? false
          : null
      : null,
    agendoEntrevista,
    canal: s.canal ?? null,
    huboEntrevista: s.huboEntrevista ?? null,
    resultadoEntrevista: seguimientoPij ? 'no_compro' : (s.resultadoEntrevista ?? null),
    fechaReagenda: s.fechaReagenda ?? '',
    reagendarEntrevista: reagenda && !seguimientoPij,
    reagendaPijTrasNoCompro: seguimientoPij ? true : null,
    idProducto: s.idProducto ?? '',
    estadoPago,
    idBarrio: s.idBarrio ?? '',
    numeroRecibo: s.numeroRecibo ?? '',
    brindoReferidos: s.brindoReferidos ?? null,
    referidos: s.referidos?.length ? [...s.referidos] : [emptyReferido()],
    observaciones: s.observaciones ?? '',
    proponeFechaDerivacion: derivar ? (horarioDeriv ? true : false) : null,
    horarioDerivacion: horarioDeriv,
    reagendaTrasNoComproEnPersona,
    comprasAdicionales: s.comprasAdicionales ?? [],
  };
}

function activarReagenda(): Partial<FormState> {
  return {
    reagendarEntrevista: true,
    resultadoEntrevista: 'reagenda',
    huboEntrevista: false,
    ...resetCamposVenta(),
  };
}

function patchFechaReagenda(
  v: string,
  patch: (partial: Partial<FormState>) => void,
) {
  patch(
    v.trim()
      ? { fechaReagenda: v, ...activarReagenda() }
      : {
        fechaReagenda: '',
        reagendarEntrevista: false,
        resultadoEntrevista: null,
        huboEntrevista: null,
      },
  );
}

function CampoFechaReagenda({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        Nueva fecha y hora de entrevista
      </p>
      <DateTimePicker value={value} onChange={onChange} usePortal required />
    </div>
  );
}

interface LeadModalFormProps {
  lead: Lead | null;
  open: boolean;
  rolUsuario: RolUsuario;
  productos: Producto[];
  barrios: Barrio[];
  /** Lista de todos los leads para validar duplicados de recibo. */
  todosLosLeads?: Lead[];
  /** Promotor consultando un cierre cargado por el supervisor. */
  soloLectura?: boolean;
  onClose: () => void;
  onSave: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
}

export function LeadModalForm({
  lead,
  open,
  rolUsuario,
  productos,
  barrios,
  todosLosLeads = [],
  soloLectura = false,
  onClose,
  onSave,
}: LeadModalFormProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(lead));
  const [errorVenta, setErrorVenta] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [barrioPickerOpen, setBarrioPickerOpen] = useState(false);
  const [showAddAdicional, setShowAddAdicional] = useState<'pij' | 'terreno' | null>(null);
  const [adicionalForm, setAdicionalForm] = useState<{
    idProducto: string;
    estadoPago: SeguimientoLead['estadoPago'];
    idBarrio: string;
    numeroRecibo: string;
  }>({
    idProducto: '',
    estadoPago: null,
    idBarrio: '',
    numeroRecibo: '',
  });
  // Campos estructurados para número de anexo PIJ (principal)
  const [pijSerie, setPijSerie] = useState<'A' | 'B'>('A');
  const [pijAdh, setPijAdh] = useState('');
  const [pijAnexo, setPijAnexo] = useState('');
  // Campos estructurados para número de anexo PIJ (adicional)
  const [adicPijSerie, setAdicPijSerie] = useState<'A' | 'B'>('A');
  const [adicPijAdh, setAdicPijAdh] = useState('');
  const [adicPijAnexo, setAdicPijAnexo] = useState('');

  const [indiceVentasGlobal, setIndiceVentasGlobal] = useState<IndiceVentasOcupados>({
    adhesiones: {},
    anexos: {},
    recibosTerreno: {},
  });

  useEffect(() => {
    if (open) {
      fetchRecibosOcupados()
        .then((res) => setIndiceVentasGlobal(res))
        .catch((err) => console.error('[LeadModalForm] Error al obtener recibos ocupados:', err));
    } else {
      setIndiceVentasGlobal({ adhesiones: {}, anexos: {}, recibosTerreno: {} });
    }
  }, [open]);

  const indiceVentasCompleto = useMemo(
    () =>
      fusionarIndicesVentas(
        indiceVentasGlobal,
        construirIndiceVentasDesdeLeads(todosLosLeads),
      ),
    [indiceVentasGlobal, todosLosLeads],
  );

  function indiceConComprasFormulario(comprasEnFormulario?: CompraAdicional[]) {
    if (!comprasEnFormulario?.length || !lead) {
      return { adhesiones: {}, anexos: {}, recibosTerreno: {} };
    }
    return indiceVentasDesdeComprasFormulario(
      comprasEnFormulario,
      lead.nombre,
      String(lead.id),
    );
  }

  function buscarDuplicadoPij(
    serie: string,
    adhesion: string,
    anexo: string,
    excluir?: ExcluirRegistroVenta,
    comprasEnFormulario?: CompraAdicional[],
  ) {
    const indice = fusionarIndicesVentas(
      indiceVentasCompleto,
      indiceConComprasFormulario(comprasEnFormulario),
    );
    const conflicto = buscarConflictoPij(indice, serie, adhesion, anexo, excluir);
    return conflicto ? mensajeConflictoVenta(conflicto) : null;
  }

  function buscarDuplicadoTerreno(
    numeroRecibo: string,
    excluir?: ExcluirRegistroVenta,
    comprasEnFormulario?: CompraAdicional[],
  ) {
    const indice = fusionarIndicesVentas(
      indiceVentasCompleto,
      indiceConComprasFormulario(comprasEnFormulario),
    );
    const conflicto = buscarConflictoTerreno(indice, numeroRecibo, excluir);
    return conflicto ? mensajeConflictoVenta(conflicto) : null;
  }

  const rol: RolUsuario = rolUsuario === 'promotor' ? 'promotor' : 'supervisor';
  const productosDisponibles = useMemo(
    () => getProductosPorRol(productos, rol),
    [productos, rol],
  );

  useEffect(() => {
    if (!open) setBarrioPickerOpen(false);
  }, [open]);

  useEffect(() => {
    if (open && lead) {
      const initial = buildInitialForm(lead);
      if (
        !soloLectura &&
        initial.idProducto &&
        !puedeVenderProducto(productos, rol, initial.idProducto)
      ) {
        initial.idProducto = '';
      }
      setForm(initial);
      setErrorVenta('');
      setErrorForm('');

      // Sincronizar campos estructurados del recibo principal PIJ
      if (initial.numeroRecibo && initial.idProducto === 'prod-pij') {
        const parsed = parsePijRecibo(initial.numeroRecibo);
        setPijSerie(parsed.serie);
        setPijAdh(parsed.adhesion);
        setPijAnexo(parsed.anexo);
      } else {
        setPijSerie('A');
        setPijAdh('');
        setPijAnexo('');
      }
    }
  }, [open, lead, rol, productos, soloLectura]);

  if (!open || !lead) return null;

  const patch = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  const handleCanal = (canal: NonNullable<SeguimientoLead['canal']>) => {
    const sinCita = !leadTieneCitaPrevia(lead);
    if (sinCita) {
      patch({
        canal,
        agendoEntrevista: null,
        huboEntrevista: null,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        reagendaPijTrasNoCompro: null,
        reagendaTrasNoComproEnPersona: null,
        proponeFechaDerivacion: null,
        horarioDerivacion: '',
        ...resetCamposVenta(),
      });
    } else {
      patch({ canal });
    }
  };

  const handleSeContactoCliente = (contacto: boolean) => {
    if (contacto) {
      patch({
        seContactoCliente: true,
        confirmoEntrevista: null,
        canal: null,
        agendoEntrevista: null,
        huboEntrevista: null,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        reagendaTrasNoComproEnPersona: null,
        ...resetCamposVenta(),
      });
    } else {
      const seguimientoSinContacto: SeguimientoLead = {
        fuente: lead?.seguimiento?.fuente,
        confirmoEntrevista: false,
        canal: null,
        huboEntrevista: null,
        resultadoEntrevista: null,
        fechaReagenda: null,
        fechaCierre: null,
        seguimientoPijPromotor: false,
        seguimientoAgendaOperadorRol: null,
        horarioEntrevistaPropuesto: null,
        idProducto: null,
        estadoPago: null,
        idBarrio: null,
        numeroRecibo: null,
        brindoReferidos: false,
        referidos: [],
        observaciones: form.observaciones.trim(),
        comprasAdicionales: null,
      };
      void (async () => {
        if (lead) {
          try {
            await onSave(lead.id, seguimientoSinContacto);
            onClose();
          } catch (err) {
            console.error('Error al guardar:', err);
            setErrorForm(err instanceof Error ? err.message : 'Error al guardar el seguimiento.');
          }
        }
      })();
    }
  };

  const handleAgendoEntrevista = (agendo: boolean) => {
    if (agendo) {
      patch({
        agendoEntrevista: true,
        huboEntrevista: null,
        reagendaTrasNoComproEnPersona: null,
        ...activarReagenda(),
      });
    } else if (form.canal === 'en_persona') {
      patch({
        agendoEntrevista: false,
        huboEntrevista: null,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        reagendaPijTrasNoCompro: null,
        reagendaTrasNoComproEnPersona: null,
        proponeFechaDerivacion: null,
        horarioDerivacion: '',
        ...resetCamposVenta(),
      });
    } else {
      patch({
        agendoEntrevista: false,
        resultadoEntrevista: 'sin_interes',
        reagendarEntrevista: false,
        fechaReagenda: '',
        huboEntrevista: false,
        reagendaTrasNoComproEnPersona: null,
        ...resetCamposVenta(),
      });
    }
  };

  const handleAgendoNoEnPersona = (opcion: 'sin_interes' | 'entrevista_momento') => {
    if (opcion === 'sin_interes') {
      patch({
        agendoEntrevista: false,
        huboEntrevista: false,
        resultadoEntrevista: 'sin_interes',
        reagendarEntrevista: false,
        fechaReagenda: '',
        reagendaTrasNoComproEnPersona: null,
        ...resetCamposVenta(),
      });
    } else {
      patch({
        agendoEntrevista: false,
        huboEntrevista: true,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        reagendaPijTrasNoCompro: null,
        reagendaTrasNoComproEnPersona: null,
        proponeFechaDerivacion: null,
        horarioDerivacion: '',
        ...resetCamposVenta(),
      });
    }
  };

  const handleConfirmoEntrevista = (confirmo: boolean) => {
    if (confirmo) {
      patch({
        confirmoEntrevista: true,
        canal: null,
        huboEntrevista: null,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        ...resetCamposVenta(),
      });
    } else {
      patch({
        confirmoEntrevista: false,
        canal: null,
        huboEntrevista: null,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        ...resetCamposVenta(),
      });
    }
  };

  const handleNoConfirmoMotivo = (reagenda: boolean) => {
    if (reagenda) {
      patch({
        ...activarReagenda(),
        canal: null,
      });
    } else {
      patch({
        confirmoEntrevista: false,
        resultadoEntrevista: 'sin_interes',
        reagendarEntrevista: false,
        fechaReagenda: '',
        huboEntrevista: false,
        canal: null,
        ...resetCamposVenta(),
      });
    }
  };

  const handleEntrevista = (hubo: boolean) => {
    if (hubo) {
      patch({
        huboEntrevista: true,
        reagendarEntrevista: false,
        resultadoEntrevista:
          form.resultadoEntrevista === 'reagenda' ||
            form.resultadoEntrevista === 'sin_interes' ||
            form.resultadoEntrevista === 'derivar_terreno'
            ? null
            : form.resultadoEntrevista,
        fechaReagenda: '',
        proponeFechaDerivacion: null,
        horarioDerivacion: '',
      });
    } else {
      patch({
        huboEntrevista: false,
        resultadoEntrevista: form.reagendarEntrevista ? 'reagenda' : form.resultadoEntrevista,
      });
    }
  };

  const handleGuardar = (e: FormEvent) => {
    e.preventDefault();
    setErrorForm('');

    const flujoSinCitaGuardar = !leadTieneCitaPrevia(lead);
    const entrevistaMomentoSinCitaGuardar =
      flujoSinCitaGuardar &&
      form.canal === 'en_persona' &&
      form.agendoEntrevista === false &&
      form.huboEntrevista === true;

    if (flujoSinCitaGuardar && !entrevistaMomentoSinCitaGuardar) {
      if (form.seContactoCliente !== true) {
        setErrorForm('Indicá si se contactó con el cliente.');
        return;
      }
      if (form.canal == null) {
        setErrorForm('Seleccioná el canal de contacto.');
        return;
      }
      if (form.agendoEntrevista == null) {
        setErrorForm('Indicá si agendó entrevista.');
        return;
      }
      if (form.agendoEntrevista === true && !form.fechaReagenda.trim()) {
        setErrorForm('Seleccioná la fecha y hora de la entrevista.');
        return;
      }
      if (
        form.canal === 'en_persona' &&
        form.agendoEntrevista === false &&
        form.huboEntrevista == null
      ) {
        setErrorForm('Indicá si la entrevista fue en el momento.');
        return;
      }

      const esAgendo = form.agendoEntrevista === true;
      const seguimientoSinCita: SeguimientoLead = {
        fuente: lead.seguimiento?.fuente,
        confirmoEntrevista: null,
        canal: form.canal,
        huboEntrevista: false,
        resultadoEntrevista: esAgendo ? 'reagenda' : 'sin_interes',
        fechaReagenda: esAgendo ? form.fechaReagenda || null : null,
        fechaCierre: null,
        seguimientoPijPromotor: false,
        seguimientoAgendaOperadorRol: esAgendo ? rol : null,
        horarioEntrevistaPropuesto: null,
        idProducto: null,
        estadoPago: null,
        idBarrio: null,
        numeroRecibo: null,
        brindoReferidos: form.brindoReferidos,
        referidos:
          form.brindoReferidos === true
            ? form.referidos.filter((r) => r.nombre.trim() || r.telefono.trim())
            : [],
        observaciones: form.observaciones.trim(),
        comprasAdicionales: null,
      };
      void (async () => {
        try {
          await onSave(lead.id, seguimientoSinCita);
          onClose();
        } catch (err) {
          console.error('Error al guardar:', err);
          setErrorForm(err instanceof Error ? err.message : 'Error al guardar el seguimiento.');
        }
      })();
      return;
    }

    const esFlujoCampoGuardar = rol === 'promotor';
    const esReagendaPijGuardar =
      esFlujoCampoGuardar &&
      form.resultadoEntrevista === 'no_compro' &&
      form.reagendaPijTrasNoCompro === true &&
      !entrevistaMomentoSinCitaGuardar;
    const esReagendaTrasNoComproEnPersonaGuardar =
      entrevistaMomentoSinCitaGuardar &&
      form.resultadoEntrevista === 'no_compro' &&
      form.reagendaTrasNoComproEnPersona === true;
    if (
      entrevistaMomentoSinCitaGuardar &&
      form.resultadoEntrevista === 'no_compro' &&
      form.reagendaTrasNoComproEnPersona == null
    ) {
      setErrorForm('Indicá si se reagenda tras no comprar en persona.');
      return;
    }
    const esReagenda =
      form.reagendarEntrevista ||
      form.resultadoEntrevista === 'reagenda' ||
      esReagendaPijGuardar ||
      esReagendaTrasNoComproEnPersonaGuardar;
    if (esReagenda && !form.fechaReagenda) {
      setErrorForm('Seleccioná la fecha y hora de reagenda.');
      return;
    }

    if (form.resultadoEntrevista === 'derivar_terreno') {
      if (form.proponeFechaDerivacion === null) {
        setErrorForm('Indicá si el cliente propuso fecha.');
        return;
      }
      if (form.proponeFechaDerivacion && !form.horarioDerivacion.trim()) {
        setErrorForm('Ingresá el horario propuesto para la derivación.');
        return;
      }
    }

    if (form.resultadoEntrevista === 'compro') {
      if (!form.idProducto) {
        setErrorVenta('Seleccioná el producto que compró.');
        return;
      }
      if (!puedeVenderProducto(productos, rol, form.idProducto)) {
        setErrorVenta('Tu rol no puede registrar la venta de ese producto.');
        return;
      }
      if (!form.estadoPago) {
        setErrorVenta('Indicá el estado del pago.');
        return;
      }
      if (esPlanInversion(form.idProducto) && form.estadoPago !== 'entrega_33') {
        setErrorVenta('Seleccioná Entrega $33.000.');
        return;
      }
      if (esTerreno(form.idProducto) && !form.idBarrio) {
        setErrorVenta('Seleccioná el barrio del terreno.');
        return;
      }
      if (requiereNumeroRecibo(form.idProducto, form.estadoPago) && !form.numeroRecibo.trim()) {
        setErrorVenta(mensajeErrorNumeroDocumentoVenta(form.idProducto));
        return;
      }
      if (esPlanInversion(form.idProducto) && pijAdh.trim()) {
        const dup = buscarDuplicadoPij(
          pijSerie,
          pijAdh,
          pijAnexo,
          { leadId: lead?.id, esPrincipal: true },
          form.comprasAdicionales,
        );
        if (dup) {
          setErrorVenta(dup);
          return;
        }
      }
      if (esTerreno(form.idProducto) && form.numeroRecibo.trim()) {
        const dup = buscarDuplicadoTerreno(
          form.numeroRecibo,
          { leadId: lead?.id, esPrincipal: true },
          form.comprasAdicionales,
        );
        if (dup) {
          setErrorVenta(dup);
          return;
        }
      }
    }

    setErrorVenta('');

    const esFlujoCampo = rol === 'promotor';
    const confirmoNo = form.confirmoEntrevista === false;
    const esReagendaNoConfirmo =
      confirmoNo && (form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda');
    const esReagendaPij =
      esFlujoCampo &&
      form.resultadoEntrevista === 'no_compro' &&
      form.reagendaPijTrasNoCompro === true &&
      !entrevistaMomentoSinCitaGuardar;

    const resultadoFinal = confirmoNo
      ? esReagendaNoConfirmo
        ? 'reagenda'
        : form.resultadoEntrevista
      : esReagenda
        ? 'reagenda'
        : form.resultadoEntrevista;

    const seguimiento: SeguimientoLead = {
      fuente: lead.seguimiento?.fuente,
      confirmoEntrevista: flujoSinCita ? null : form.confirmoEntrevista,
      canal: (entrevistaMomentoSinCitaGuardar || form.canal) ? form.canal : null,
      huboEntrevista: entrevistaMomentoSinCitaGuardar
        ? true
        : esReagendaPij
          ? true
          : (confirmoNo || esReagenda)
            ? false
            : form.huboEntrevista,
      resultadoEntrevista: resultadoFinal,
      fechaReagenda: esReagenda ? form.fechaReagenda || null : null,
      fechaCierre:
        form.resultadoEntrevista === 'compro'
          ? lead.seguimiento?.fechaCierre || new Date().toISOString()
          : null,
      seguimientoPijPromotor: esReagendaPij,
      seguimientoAgendaOperadorRol: null,
      derivacionTerrenoActiva: resolverDerivacionTerrenoActiva(lead, resultadoFinal),
      horarioEntrevistaPropuesto:
        form.resultadoEntrevista === 'derivar_terreno' && form.proponeFechaDerivacion
          ? form.horarioDerivacion.trim()
          : null,
      idProducto: form.resultadoEntrevista === 'compro' ? form.idProducto : null,
      estadoPago: form.resultadoEntrevista === 'compro' ? form.estadoPago : null,
      idBarrio:
        form.resultadoEntrevista === 'compro' && esTerreno(form.idProducto)
          ? form.idBarrio
          : null,
      numeroRecibo:
        form.resultadoEntrevista === 'compro' &&
          requiereNumeroRecibo(form.idProducto, form.estadoPago)
          ? form.numeroRecibo.trim()
          : null,
      brindoReferidos: form.brindoReferidos,
      referidos:
        form.brindoReferidos === true
          ? form.referidos.filter((r) => r.nombre.trim() || r.telefono.trim())
          : [],
      observaciones: form.observaciones.trim(),
      comprasAdicionales:
        form.resultadoEntrevista === 'compro'
          ? form.comprasAdicionales
          : null,
    };
    void (async () => {
      try {
        await onSave(lead.id, seguimiento);
        onClose();
      } catch (err) {
        console.error('Error al guardar:', err);
        setErrorForm(err instanceof Error ? err.message : 'Error al guardar el seguimiento.');
      }
    })();
  };

  const esFlujoCampo = rol === 'promotor';
  const sinCitaPrevia = !leadTieneCitaPrevia(lead);
  const flujoSinCita = sinCitaPrevia;
  const esCanalEnPersona = form.canal === 'en_persona';
  const entrevistaEnElMomento =
    flujoSinCita && esCanalEnPersona && form.agendoEntrevista === false && form.huboEntrevista === true;
  const totalPasos = flujoSinCita
    ? entrevistaEnElMomento
      ? 7
      : esCanalEnPersona
        ? 5
        : 4
    : 5;
  const tituloObservaciones = esFlujoCampo ? 'Observaciones del promotor' : 'Observaciones';
  const placeholderObservaciones = esFlujoCampo
    ? 'Notas de la visita, entrevista o cierre…'
    : 'Notas del supervisor…';
  const confirmoSi = !flujoSinCita && form.confirmoEntrevista === true;
  const confirmoNo = !flujoSinCita && form.confirmoEntrevista === false;

  const showContactoSinCita = flujoSinCita;
  const showCanalSinCita = flujoSinCita && form.seContactoCliente === true;
  const showAgendoPregunta =
    flujoSinCita && form.seContactoCliente === true && form.canal != null;
  const showAgendoCalendario = showAgendoPregunta && form.agendoEntrevista === true;
  const showSinInteresSinCita =
    showAgendoPregunta && form.agendoEntrevista === false && !esCanalEnPersona;
  const showAgendoNoEnPersonaOpciones =
    showAgendoPregunta &&
    form.agendoEntrevista === false &&
    esCanalEnPersona &&
    form.huboEntrevista == null;
  const showSinInteresSinCitaEnPersona =
    showAgendoPregunta &&
    form.agendoEntrevista === false &&
    esCanalEnPersona &&
    form.huboEntrevista === false &&
    form.resultadoEntrevista === 'sin_interes';

  const showCanalSiConfirmo = confirmoSi;
  const horarioCitaLead = getHorarioEntrevistaLead(lead);
  const fmtCitaLead = formatEntrevistaCalendario(horarioCitaLead);
  const lugarCitaLead = getLugarEntrevistaLead(lead);

  const showCitaExistente =
    confirmoSi && form.canal != null && !sinCitaPrevia && Boolean(horarioCitaLead);
  const showHuboEntrevista =
    (esFlujoCampo && !flujoSinCita) ||
    (confirmoSi && form.canal != null && !flujoSinCita);
  const showEntrevistaDetalle =
    (showHuboEntrevista && form.huboEntrevista === true) || entrevistaEnElMomento;
  const showSinEntrevistaResultado = showHuboEntrevista && form.huboEntrevista === false;
  const showReagendaSinEntrevistaCampo =
    showSinEntrevistaResultado &&
    (form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda');

  const showMotivoNoConfirmo = confirmoNo;
  const eligioMotivoNoConfirmo =
    confirmoNo &&
    (form.resultadoEntrevista === 'sin_interes' ||
      form.reagendarEntrevista ||
      form.resultadoEntrevista === 'reagenda');
  const showReagendaNoConfirmo =
    confirmoNo && (form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda');
  const showCanalTrasNoConfirmo = eligioMotivoNoConfirmo;

  const showCompro = form.resultadoEntrevista === 'compro';
  const showReagendaPijTrasNoCompro =
    esFlujoCampo && form.resultadoEntrevista === 'no_compro' && !entrevistaEnElMomento;
  const showReagendaTrasNoComproSinCita =
    entrevistaEnElMomento && form.resultadoEntrevista === 'no_compro';
  const showFechaReagendaTrasNoComproSinCita =
    showReagendaTrasNoComproSinCita && form.reagendaTrasNoComproEnPersona === true;
  const showFechaReagendaPij =
    showReagendaPijTrasNoCompro && form.reagendaPijTrasNoCompro === true;
  const showDerivarTerreno =
    esFlujoCampo && form.resultadoEntrevista === 'derivar_terreno';
  const showAgendarDerivacion =
    showDerivarTerreno && form.proponeFechaDerivacion === true;

  const flujoCampoCompleto =
    esFlujoCampo &&
    form.huboEntrevista !== null &&
    (form.huboEntrevista === false
      ? form.resultadoEntrevista != null
      : form.resultadoEntrevista === 'derivar_terreno'
        ? form.proponeFechaDerivacion !== null &&
        (form.proponeFechaDerivacion === false || Boolean(form.horarioDerivacion.trim()))
        : form.resultadoEntrevista === 'no_compro'
          ? form.reagendaPijTrasNoCompro !== null &&
          (form.reagendaPijTrasNoCompro === false || Boolean(form.fechaReagenda.trim()))
          : form.resultadoEntrevista != null);

  const flujoSinCitaEnPersonaEntrevistaCompleto =
    entrevistaEnElMomento &&
    form.resultadoEntrevista != null &&
    (form.resultadoEntrevista === 'compro'
      ? Boolean(form.idProducto && form.estadoPago) &&
      (!esTerreno(form.idProducto) || Boolean(form.idBarrio)) &&
      (!requiereNumeroRecibo(form.idProducto, form.estadoPago) ||
        Boolean(form.numeroRecibo.trim()))
      : form.resultadoEntrevista === 'no_compro'
        ? form.reagendaTrasNoComproEnPersona !== null &&
        (form.reagendaTrasNoComproEnPersona === false ||
          Boolean(form.fechaReagenda.trim()))
        : form.resultadoEntrevista === 'derivar_terreno'
          ? form.proponeFechaDerivacion !== null &&
          (form.proponeFechaDerivacion === false ||
            Boolean(form.horarioDerivacion.trim()))
          : true);

  const flujoSinCitaCompleto =
    flujoSinCita &&
    form.seContactoCliente === true &&
    form.canal != null &&
    form.agendoEntrevista !== null &&
    ((form.agendoEntrevista === true && Boolean(form.fechaReagenda.trim())) ||
      (form.agendoEntrevista === false &&
        !esCanalEnPersona &&
        form.resultadoEntrevista === 'sin_interes') ||
      showSinInteresSinCitaEnPersona ||
      flujoSinCitaEnPersonaEntrevistaCompleto);

  const flujoReagendaConFecha =
    Boolean(form.fechaReagenda.trim()) &&
    (showAgendoCalendario ||
      showReagendaNoConfirmo ||
      showReagendaSinEntrevistaCampo ||
      showFechaReagendaPij ||
      showFechaReagendaTrasNoComproSinCita);

  const showReferidosObs =
    flujoCampoCompleto ||
    flujoSinCitaCompleto ||
    flujoReagendaConFecha ||
    (confirmoSi &&
      form.canal != null &&
      form.huboEntrevista !== null &&
      (form.huboEntrevista === false
        ? form.resultadoEntrevista != null
        : form.huboEntrevista === true && form.resultadoEntrevista != null)) ||
    (confirmoNo && showCanalTrasNoConfirmo && form.canal != null);

  const idProductoCierre =
    form.idProducto ||
    lead.seguimiento?.idProducto ||
    (soloLectura && (form.idBarrio || lead.seguimiento?.idBarrio) ? ID_PRODUCTO_TERRENO : '');
  const idBarrioCierre = form.idBarrio || lead.seguimiento?.idBarrio || '';
  const estadoPagoCierre = form.estadoPago ?? lead.seguimiento?.estadoPago ?? null;
  const numeroReciboCierre = form.numeroRecibo || lead.seguimiento?.numeroRecibo || '';
  const productoEsPij = esPlanInversion(idProductoCierre);
  const productoEsTerreno = esTerreno(idProductoCierre);
  const opcionesPago = opcionesPagoParaRol(rol, idProductoCierre);
  const labelsEntrevista = etiquetasResultadoEntrevista(rol);
  const labelDerivarTerreno =
    'derivarTerreno' in labelsEntrevista
      ? labelsEntrevista.derivarTerreno
      : null;
  const muestraRecibo = requiereNumeroRecibo(form.idProducto, form.estadoPago);
  const showReferidos = showReferidosObs && form.brindoReferidos === true;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      shouldScaleBackground
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[2px]" />

        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ maxHeight: 'min(90dvh, 720px)' }}
          aria-labelledby="sheet-lead-title"
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

          {/* Header sticky */}
          <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-4 pt-3">
            <div>
              <Drawer.Title
                id="sheet-lead-title"
                className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900"
              >
                {lead.nombre}
              </Drawer.Title>
              <p className="mt-0.5 text-[13px] tabular-nums text-zinc-500">{cleanTelefonoSuffix(lead.telefono)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ touchAction: 'manipulation' }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 active:bg-brand-50 active:text-brand-700"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          {lead.bloqueadoSupervisor48h && (
            <div className="mx-4 mb-3 shrink-0 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5">
              <p className="text-[13px] font-medium text-purple-900">
                Prioridad Promotor (48hs)
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-purple-800/90">
                No podés interactuar con este lead hasta que pasen 48 horas de su creación para dar prioridad al promotor. El teléfono está oculto temporalmente.
              </p>
            </div>
          )}
          {!lead.bloqueadoSupervisor48h && soloLectura && lead && (
            <div className="mx-4 mb-3 shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
              <p className="text-[13px] font-medium text-indigo-900">
                {leadSeguimientoPijPromotor(lead)
                  ? ETIQUETA_SEGUIMIENTO_PIJ
                  : etiquetaSeguimientoAgendaOtroRol(lead, rol) ??
                  (lead.seguimiento?.operadorNombre
                    ? `Último seguimiento por ${lead.seguimiento.operadorNombre}`
                    : ETIQUETA_CIERRE_SUPERVISOR)}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-indigo-800/90">
                {lead.seguimiento?.operadorNombre
                  ? `Solo el último operador que modificó este lead (${lead.seguimiento.operadorNombre}) puede volver a cambiar su estado.`
                  : `Podés consultar este seguimiento, pero no modificarlo desde tu cuenta.`}
              </p>
            </div>
          )}

          {/* Scrollable form */}
          <form
            id="lead-form"
            onSubmit={handleGuardar}
            className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5"
          >
            <fieldset disabled={soloLectura} className="m-0 space-y-6 border-0 p-0">
              {/* Información de la encuesta (Conoce MPC / Sabía PIJ) */}
              {(lead.conoceMpc !== null || lead.sabiaPlanInversionJoven !== null) && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                    Respuestas de la Encuesta
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {lead.conoceMpc !== null && (
                      <div>
                        <p className="text-[12px] text-zinc-400 font-medium">¿Conocían Mi Primer Casa?</p>
                        <p className="mt-0.5 text-[14px] font-semibold text-zinc-900">
                          {lead.conoceMpc ? 'Sí' : 'No'}
                        </p>
                      </div>
                    )}
                    {lead.sabiaPlanInversionJoven !== null && (
                      <div>
                        <p className="text-[12px] text-zinc-400 font-medium">¿Sabían del Plan Inversión Joven?</p>
                        <p className="mt-0.5 text-[14px] font-semibold text-zinc-900">
                          {lead.sabiaPlanInversionJoven ? 'Sí' : 'No'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {showContactoSinCita && (
                <FormSection title="¿Se contactó con el cliente?" step={1} totalSteps={totalPasos}>
                  <ButtonGroup
                    name="seContactoCliente"
                    options={[
                      { value: true, label: 'Sí' },
                      { value: false, label: 'No' },
                    ]}
                    value={form.seContactoCliente}
                    onChange={handleSeContactoCliente}
                  />
                </FormSection>
              )}

              {showCanalSinCita && (
                <FormSection title="Canal de contacto" step={2} totalSteps={totalPasos}>
                  <ButtonGroup
                    name="canalSinCita"
                    options={opcionesCanalContacto()}
                    value={form.canal}
                    onChange={handleCanal}
                  />
                </FormSection>
              )}

              {showAgendoPregunta && (
                <FormSection title="¿Agendó una entrevista?" step={3} totalSteps={totalPasos}>
                  <ButtonGroup
                    name="agendoEntrevista"
                    options={[
                      { value: true, label: 'Sí' },
                      { value: false, label: 'No' },
                    ]}
                    value={form.agendoEntrevista}
                    onChange={handleAgendoEntrevista}
                  />
                </FormSection>
              )}

              {showAgendoCalendario && (
                <FormSection title="Fecha y hora de entrevista" step={4} totalSteps={totalPasos}>
                  <CampoFechaReagenda
                    value={form.fechaReagenda}
                    onChange={(v) => patchFechaReagenda(v, patch)}
                  />
                  <p className="mt-3 text-[12px] leading-relaxed text-brand-700">
                    Al guardar, el lead pasa a{' '}
                    <span className="font-medium">En seguimiento</span> y aparece en el calendario.
                  </p>
                </FormSection>
              )}

              {showAgendoNoEnPersonaOpciones && (
                <FormSection title="¿Qué pasó?" step={4} totalSteps={totalPasos}>
                  <RadioOption
                    name="agendoNoEnPersona"
                    value="sin_interes"
                    label="No muestra interés"
                    checked={form.resultadoEntrevista === 'sin_interes'}
                    onChange={() => handleAgendoNoEnPersona('sin_interes')}
                  />
                  <RadioOption
                    name="agendoNoEnPersona"
                    value="entrevista_momento"
                    label="La entrevista fue en el momento"
                    checked={form.huboEntrevista === true}
                    onChange={() => handleAgendoNoEnPersona('entrevista_momento')}
                  />
                </FormSection>
              )}

              {showSinInteresSinCita && (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-700">
                  El cliente <span className="font-medium">no estaba interesado</span>. Al guardar pasa
                  a Contactado.
                </p>
              )}

              {showSinInteresSinCitaEnPersona && (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-700">
                  El cliente <span className="font-medium">no muestra interés</span>. Al guardar pasa
                  a Contactado.
                </p>
              )}

              {/* Con cita previa: confirmación de entrevista agendada */}
              {!flujoSinCita && (
                <FormSection title="¿Confirmó entrevista?" step={1} totalSteps={totalPasos}>
                  <ButtonGroup
                    name="confirmoEntrevista"
                    options={[
                      { value: true, label: 'Sí' },
                      { value: false, label: 'No' },
                    ]}
                    value={form.confirmoEntrevista}
                    onChange={handleConfirmoEntrevista}
                  />
                </FormSection>
              )}

              {showCanalSiConfirmo && (
                <FormSection title="Canal de contacto" step={2} totalSteps={totalPasos}>
                  <ButtonGroup
                    name="canal"
                    options={opcionesCanalContacto()}
                    value={form.canal}
                    onChange={handleCanal}
                  />
                </FormSection>
              )}

              {showCitaExistente && fmtCitaLead && (
                <FormSection title="Entrevista agendada" step={3} totalSteps={totalPasos}>
                  <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">
                      Fecha y hora
                    </p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums text-brand-900">
                      {fmtCitaLead.diaSemana} {fmtCitaLead.diaNumero} · {fmtCitaLead.hora}
                    </p>
                    {lugarCitaLead && labelLugarEntrevista(lugarCitaLead) && (
                      <p className="mt-1.5 text-[12px] text-brand-700">
                        {labelLugarEntrevista(lugarCitaLead)}
                      </p>
                    )}
                  </div>
                </FormSection>
              )}

              {showHuboEntrevista && (
                <FormSection
                  title={esFlujoCampo ? 'Visita en calle' : 'Entrevista'}
                  step={flujoSinCita ? 1 : showCitaExistente ? 4 : 3}
                  totalSteps={totalPasos}
                >
                  <ButtonGroup
                    name="huboEntrevista"
                    label="¿Hubo entrevista?"
                    options={[
                      { value: true, label: 'Sí' },
                      { value: false, label: 'No' },
                    ]}
                    value={form.huboEntrevista}
                    onChange={handleEntrevista}
                  />
                  {esFlujoCampo && (
                    <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
                      Registrá el resultado de la visita o el cierre de Plan Inversión Joven en el momento.
                    </p>
                  )}
                </FormSection>
              )}

              {showSinEntrevistaResultado && (
                <FormSection title="Resultado" step={flujoSinCita ? (esFlujoCampo ? 2 : undefined) : undefined} totalSteps={totalPasos}>
                  <RadioOption
                    name="sinEntrevista"
                    value="sin_interes"
                    label="No muestra interés"
                    checked={form.resultadoEntrevista === 'sin_interes'}
                    onChange={() =>
                      patch({
                        resultadoEntrevista: 'sin_interes',
                        fechaReagenda: '',
                        reagendarEntrevista: false,
                        ...resetCamposVenta(),
                      })
                    }
                  />
                  <RadioOption
                    name="sinEntrevista"
                    value="reagenda"
                    label="Quiere reagendar"
                    checked={form.resultadoEntrevista === 'reagenda'}
                    onChange={() => patch({ ...activarReagenda(), reagendarEntrevista: true })}
                  />
                  {showReagendaSinEntrevistaCampo && (
                    <CampoFechaReagenda
                      value={form.fechaReagenda}
                      onChange={(v) => patchFechaReagenda(v, patch)}
                    />
                  )}
                </FormSection>
              )}

              {showEntrevistaDetalle && (
                <FormSection
                  title="Resultado de la entrevista"
                  step={
                    entrevistaEnElMomento ? 5 : esFlujoCampo ? 2 : 4
                  }
                  totalSteps={totalPasos}
                >
                  <div className="mt-2 space-y-2">
                    <RadioOption
                      name="conEntrevista"
                      value="no_compro"
                      label={labelsEntrevista.noCompro}
                      checked={form.resultadoEntrevista === 'no_compro'}
                      onChange={() =>
                        patch({
                          resultadoEntrevista: 'no_compro',
                          reagendaPijTrasNoCompro: null,
                          reagendaTrasNoComproEnPersona: null,
                          reagendarEntrevista: false,
                          fechaReagenda: '',
                          proponeFechaDerivacion: null,
                          horarioDerivacion: '',
                          ...resetCamposVenta(),
                        })
                      }
                    />
                    {showReagendaTrasNoComproSinCita && (
                      <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
                        <ButtonGroup
                          name="reagendaTrasNoComproEnPersona"
                          label="¿Qué hacemos ahora?"
                          options={[
                            { value: true, label: 'Reagendar' },
                            { value: false, label: 'No muestra interés' },
                          ]}
                          value={form.reagendaTrasNoComproEnPersona}
                          onChange={(v) =>
                            patch({
                              reagendaTrasNoComproEnPersona: v,
                              reagendarEntrevista: v,
                              resultadoEntrevista: v ? 'reagenda' : 'sin_interes',
                              fechaReagenda: v ? form.fechaReagenda : '',
                            })
                          }
                        />
                        {showFechaReagendaTrasNoComproSinCita && (
                          <CampoFechaReagenda
                            value={form.fechaReagenda}
                            onChange={(v) => patchFechaReagenda(v, patch)}
                          />
                        )}
                        {showFechaReagendaTrasNoComproSinCita && (
                          <p className="text-[12px] leading-relaxed text-brand-800">
                            Al guardar, el lead pasa a{' '}
                            <span className="font-semibold">En seguimiento</span> con la nueva fecha.
                          </p>
                        )}
                      </div>
                    )}
                    {showReagendaPijTrasNoCompro && (
                      <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
                        <ButtonGroup
                          name="reagendaPijTrasNoCompro"
                          label="¿Reagendar para ofrecer nuevamente el Plan Inversión Joven?"
                          options={[
                            { value: true, label: 'Sí, reagendar' },
                            { value: false, label: 'No, cerrar sin seguimiento' },
                          ]}
                          value={form.reagendaPijTrasNoCompro}
                          onChange={(v) =>
                            patch({
                              reagendaPijTrasNoCompro: v,
                              reagendarEntrevista: v,
                              fechaReagenda: v ? form.fechaReagenda : '',
                            })
                          }
                        />
                        {showFechaReagendaPij && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                              Nueva fecha y hora de contacto
                            </p>
                            <DateTimePicker
                              value={form.fechaReagenda}
                              onChange={(v) => patch({ fechaReagenda: v })}
                              autoOpen={!form.fechaReagenda}
                              required
                            />
                          </div>
                        )}
                        {showFechaReagendaPij && (
                          <p className="text-[12px] leading-relaxed text-brand-800">
                            Al guardar, el lead sale de Prioridad y queda en{' '}
                            <span className="font-semibold">En seguimiento</span>, ordenado por esta
                            fecha.
                          </p>
                        )}
                      </div>
                    )}
                    <RadioOption
                      name="conEntrevista"
                      value="compro"
                      label={labelsEntrevista.compro}
                      checked={form.resultadoEntrevista === 'compro'}
                      onChange={() => {
                        setErrorVenta('');
                        const defaultProducto =
                          rol === 'supervisor'
                            ? productosDisponibles.find((p) => p.id === ID_PRODUCTO_TERRENO)?.id ??
                            productosDisponibles[0]?.id ??
                            ''
                            : productosDisponibles[0]?.id ?? '';
                        patch({
                          resultadoEntrevista: 'compro',
                          proponeFechaDerivacion: null,
                          horarioDerivacion: '',
                          idProducto: form.idProducto || defaultProducto,
                        });
                      }}
                    />
                    {labelDerivarTerreno && (
                      <RadioOption
                        name="conEntrevista"
                        value="derivar_terreno"
                        label={labelDerivarTerreno}
                        tone="terreno"
                        checked={form.resultadoEntrevista === 'derivar_terreno'}
                        onChange={() =>
                          patch({
                            resultadoEntrevista: 'derivar_terreno',
                            proponeFechaDerivacion: null,
                            horarioDerivacion: '',
                            ...resetCamposVenta(),
                          })
                        }
                      />
                    )}

                    {showDerivarTerreno && (
                      <div className="lead-card--terreno space-y-3 rounded-xl border border-red-300 bg-gradient-to-br from-red-50 to-orange-50/90 p-4">
                        <ButtonGroup
                          name="proponeFechaDerivacion"
                          label="¿El cliente propuso fecha para la entrevista?"
                          options={[
                            { value: true, label: 'Sí' },
                            { value: false, label: 'No' },
                          ]}
                          value={form.proponeFechaDerivacion}
                          onChange={(v) =>
                            patch({
                              proponeFechaDerivacion: v,
                              horarioDerivacion: v ? form.horarioDerivacion : '',
                            })
                          }
                        />
                        {showAgendarDerivacion && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">
                              Fecha y hora de entrevista
                            </p>
                            <DateTimePicker
                              value={form.horarioDerivacion}
                              onChange={(v) => patch({ horarioDerivacion: v })}
                              autoOpen={!form.horarioDerivacion}
                              required
                            />
                          </div>
                        )}
                        {form.proponeFechaDerivacion === false && (
                          <p className="text-[12px] leading-relaxed text-red-800/90">
                            Sin fecha agendada: el supervisor hará el seguimiento del lead.
                          </p>
                        )}
                      </div>
                    )}

                    {showCompro && soloLectura && (
                      <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                            Producto cerrado
                          </p>
                          <p className="mt-1 text-[15px] font-medium text-zinc-900">
                            {getProductoNombre(idProductoCierre, productos) ?? '—'}
                          </p>
                        </div>
                        {productoEsTerreno && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                              Barrio
                            </p>
                            <p className="mt-1 text-[15px] font-medium text-zinc-900">
                              {getBarrioNombre(idBarrioCierre, barrios) ?? '—'}
                            </p>
                          </div>
                        )}
                        {estadoPagoCierre && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                              {tituloEstadoCompra('supervisor')}
                            </p>
                            <p className="mt-1 text-[15px] font-medium text-zinc-900">
                              {etiquetaEstadoPagoVisible('supervisor', estadoPagoCierre, idProductoCierre) ??
                                estadoPagoCierre}
                            </p>
                          </div>
                        )}
                        {numeroReciboCierre.trim() && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                              {etiquetaCortaNumeroDocumentoVenta(idProductoCierre)}
                            </p>
                            <p className="mt-1 text-[15px] font-medium tabular-nums text-zinc-900">
                              {numeroReciboCierre}
                            </p>
                          </div>
                        )}
                        {lead.seguimiento?.fechaCierre && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                              Fecha de cierre
                            </p>
                            <p className="mt-1 text-[15px] font-medium text-zinc-900">
                              {(() => {
                                try {
                                  const d = parseIsoLocal(lead.seguimiento.fechaCierre);
                                  if (!d || isNaN(d.getTime())) return lead.seguimiento.fechaCierre;
                                  const day = String(d.getDate()).padStart(2, '0');
                                  const month = String(d.getMonth() + 1).padStart(2, '0');
                                  const year = d.getFullYear();
                                  const hours = String(d.getHours()).padStart(2, '0');
                                  const minutes = String(d.getMinutes()).padStart(2, '0');
                                  return `${day}/${month}/${year} ${hours}:${minutes}`;
                                } catch {
                                  return lead.seguimiento.fechaCierre;
                                }
                              })()}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {showCompro && !soloLectura && (
                      <div className="space-y-5 rounded-xl border border-brand-100 bg-brand-50 p-4">
                        {lead.seguimiento?.fechaCierre && (
                          <div className="text-[13px] font-semibold text-brand-800">
                            Cierre registrado el:{' '}
                            {(() => {
                              try {
                                const d = parseIsoLocal(lead.seguimiento.fechaCierre);
                                if (!d || isNaN(d.getTime())) return lead.seguimiento.fechaCierre;
                                const day = String(d.getDate()).padStart(2, '0');
                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                const year = d.getFullYear();
                                const hours = String(d.getHours()).padStart(2, '0');
                                const minutes = String(d.getMinutes()).padStart(2, '0');
                                return `${day}/${month}/${year} ${hours}:${minutes}`;
                              } catch {
                                return lead.seguimiento.fechaCierre;
                              }
                            })()}
                          </div>
                        )}
                        {/* Producto */}
                        <div className="space-y-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                              ¿Qué producto cerró?
                            </p>
                            <p className="mt-0.5 text-[12px] text-zinc-500">
                              {rol === 'promotor' ? 'Solo Plan Inversión Joven' : 'Plan Inversión Joven o Terreno'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            {productosDisponibles.map((prod) => {
                              const sel = form.idProducto === prod.id;
                              return (
                                <button
                                  key={prod.id}
                                  type="button"
                                  onClick={() => {
                                    setErrorVenta('');
                                    patch(resetCamposAlCambiarProducto(prod.id));
                                  }}
                                  style={{ touchAction: 'manipulation' }}
                                  className={`h-12 w-full rounded-lg border px-4 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${sel
                                      ? 'border-brand-700 bg-brand-600 text-white active:bg-brand-700'
                                      : 'border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
                                    }`}
                                >
                                  {prod.nombre}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Barrio (solo terrenos) */}
                        {productoEsTerreno && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                              Barrio
                            </p>
                            {barrios.length === 0 ? (
                              <p className="text-[13px] text-red-600">No hay barrios cargados.</p>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setBarrioPickerOpen(true)}
                                  style={{ touchAction: 'manipulation' }}
                                  className={`flex h-12 w-full items-center justify-between rounded-lg border px-4 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${form.idBarrio
                                      ? 'border-brand-600 bg-brand-50 text-brand-800 active:bg-brand-100'
                                      : 'border-zinc-200 bg-white text-zinc-500 active:bg-zinc-50'
                                    }`}
                                >
                                  <span>
                                    {form.idBarrio
                                      ? (getBarrioNombre(form.idBarrio, barrios) ?? 'Barrio seleccionado')
                                      : 'Seleccionar barrio'}
                                  </span>
                                  <svg
                                    className="h-5 w-5 shrink-0 text-zinc-400"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    aria-hidden="true"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </button>
                                <BarrioPickerSheet
                                  open={barrioPickerOpen}
                                  barrios={barrios}
                                  selectedId={form.idBarrio}
                                  onClose={() => setBarrioPickerOpen(false)}
                                  onSelect={(idBarrio) => {
                                    setErrorVenta('');
                                    patch({ idBarrio });
                                  }}
                                />
                              </>
                            )}
                          </div>
                        )}

                        {/* Estado del pago */}
                        {form.idProducto && opcionesPago.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                              {tituloEstadoCompra(rol)}
                            </p>
                            {productoEsPij && (
                              <p className="text-[12px] text-zinc-500">
                                La entrega de $33.000 equivale al cierre del plan.
                              </p>
                            )}
                            <div className="space-y-2">
                              {opcionesPago.map((op) => {
                                const sel = form.estadoPago === op.value;
                                const bloqueada = Boolean(op.disabled);
                                return (
                                  <button
                                    key={op.value}
                                    type="button"
                                    disabled={bloqueada}
                                    onClick={() => {
                                      if (bloqueada) return;
                                      setErrorVenta('');
                                      const limpiaRecibo = !requiereNumeroRecibo(form.idProducto, op.value);
                                      patch({
                                        estadoPago: op.value,
                                        numeroRecibo: limpiaRecibo ? '' : form.numeroRecibo,
                                      });
                                    }}
                                    style={{ touchAction: bloqueada ? undefined : 'manipulation' }}
                                    className={`min-h-[48px] w-full rounded-lg border px-4 py-2 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${bloqueada
                                        ? 'cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-400'
                                        : sel
                                          ? 'border-brand-700 bg-brand-600 text-white active:bg-brand-700'
                                          : 'border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
                                      }`}
                                  >
                                    {op.label}
                                    {bloqueada && (
                                      <span className="mt-0.5 block text-[12px] font-normal text-zinc-400">
                                        No disponible
                                      </span>
                                    )}
                                    {op.hint && sel && !bloqueada && (
                                      <span className="mt-0.5 block text-[12px] font-normal opacity-90">
                                        {op.hint}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {muestraRecibo && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                              {etiquetaNumeroDocumentoVenta(form.idProducto)}
                            </p>
                            {esPlanInversion(form.idProducto) ? (
                              // Entrada estructurada solo para PIJ (serie + adh + anexo)
                              <div className="space-y-2">
                                {/* Serie */}
                                <div className="flex gap-2">
                                  {(['A', 'B'] as const).map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => {
                                        setPijSerie(s);
                                        patch({ numeroRecibo: buildPijRecibo(s, pijAdh, pijAnexo) });
                                      }}
                                      className={`flex-1 h-11 rounded-lg border text-[15px] font-bold transition-all ${pijSerie === s
                                          ? 'border-brand-700 bg-brand-600 text-white'
                                          : 'border-zinc-200 bg-white text-zinc-700 active:bg-zinc-50'
                                        }`}
                                    >
                                      Serie {s}
                                    </button>
                                  ))}
                                </div>
                                {/* N° Adhesión */}
                                <div className="flex gap-2">
                                  <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">N° Adhesión</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={pijAdh}
                                      onChange={(e) => {
                                        const v = e.target.value.replace(/\D/g, '');
                                        setPijAdh(v);
                                        patch({ numeroRecibo: buildPijRecibo(pijSerie, v, pijAnexo) });
                                      }}
                                      placeholder="128"
                                      className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[15px] tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                                    />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">N° Anexo</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={pijAnexo}
                                      onChange={(e) => {
                                        const v = e.target.value.replace(/\D/g, '');
                                        setPijAnexo(v);
                                        patch({ numeroRecibo: buildPijRecibo(pijSerie, pijAdh, v) });
                                      }}
                                      placeholder="233"
                                      className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[15px] tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                                    />
                                  </div>
                                </div>
                                {/* Preview del recibo ensamblado */}
                                {(pijAdh.trim() || pijAnexo.trim()) && (() => {
                                  const dup = buscarDuplicadoPij(
                                    pijSerie,
                                    pijAdh,
                                    pijAnexo,
                                    { leadId: lead?.id, esPrincipal: true },
                                    form.comprasAdicionales,
                                  );
                                  return (
                                    <>
                                      <p className={`rounded-lg border px-3 py-2 text-[13px] font-mono font-semibold ${dup
                                          ? 'bg-red-50 border-red-300 text-red-700'
                                          : 'bg-brand-50 border-brand-100 text-brand-800'
                                        }`}>
                                        {form.numeroRecibo}
                                      </p>
                                      {dup && (
                                        <p className="text-[12px] font-semibold text-red-600">
                                          ⚠️ {dup}
                                        </p>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              // Terreno: texto libre
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={form.numeroRecibo}
                                  onChange={(e) => patch({ numeroRecibo: e.target.value })}
                                  placeholder="Ej. 001234"
                                  className={`h-12 w-full rounded-lg border bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-600/15 ${
                                    form.numeroRecibo.trim() &&
                                    buscarDuplicadoTerreno(
                                      form.numeroRecibo,
                                      { leadId: lead?.id, esPrincipal: true },
                                      form.comprasAdicionales,
                                    )
                                      ? 'border-red-300 focus:border-red-500'
                                      : 'border-zinc-200 focus:border-brand-600'
                                  }`}
                                  required
                                />
                                {form.numeroRecibo.trim() && (() => {
                                  const dup = buscarDuplicadoTerreno(
                                    form.numeroRecibo,
                                    { leadId: lead?.id, esPrincipal: true },
                                    form.comprasAdicionales,
                                  );
                                  return dup ? (
                                    <p className="text-[12px] font-semibold text-red-600">⚠️ {dup}</p>
                                  ) : null;
                                })()}
                              </div>
                            )}
                          </div>
                        )}

                        {errorVenta && (
                          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
                            {errorVenta}
                          </p>
                        )}
                      </div>
                    )}

                    {showCompro && (
                      <div className="space-y-4">
                        {/* List of additional purchases */}
                        {form.comprasAdicionales && form.comprasAdicionales.length > 0 && (
                          <div className="space-y-2 mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                              Compras Adicionales
                            </p>
                            <div className="space-y-2">
                              {form.comprasAdicionales.map((compra) => {
                                const prodNombre = getProductoNombre(compra.idProducto, productos) ?? compra.idProducto;
                                const pagoLabel = etiquetaEstadoPagoVisible(rol, compra.estadoPago, compra.idProducto);
                                const barrioNombre = compra.idBarrio ? (getBarrioNombre(compra.idBarrio, barrios) ?? '') : '';
                                const docLabel = esPlanInversion(compra.idProducto) ? 'Anexo' : 'Recibo';
                                return (
                                  <div key={compra.id} className="relative flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
                                    <div className="space-y-0.5">
                                      <div className="text-[14px] font-semibold text-zinc-800">
                                        {prodNombre}
                                      </div>
                                      <div className="text-[12px] text-zinc-500 font-medium">
                                        {pagoLabel} {barrioNombre ? `· ${barrioNombre}` : ''}
                                      </div>
                                      <div className="text-[12px] tabular-nums font-semibold text-brand-600">
                                        {docLabel}: {compra.numeroRecibo}
                                      </div>
                                    </div>
                                    {!soloLectura && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          patch({
                                            comprasAdicionales: form.comprasAdicionales?.filter((c) => c.id !== compra.id)
                                          });
                                        }}
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all"
                                        title="Eliminar compra"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Add buttons and subform if !soloLectura */}
                        {!soloLectura && (
                          <>
                            {!showAddAdicional && (
                              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                {productosDisponibles.some((p) => esPlanInversion(p.id)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowAddAdicional('pij');
                                      setAdicionalForm({
                                        idProducto: ID_PRODUCTO_PIJ,
                                        estadoPago: 'entrega_33',
                                        idBarrio: '',
                                        numeroRecibo: '',
                                      });
                                      setErrorVenta('');
                                    }}
                                    style={{ touchAction: 'manipulation' }}
                                    className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-[13px] font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                  >
                                    <span>+ Compró otro plan</span>
                                  </button>
                                )}
                                {productosDisponibles.some((p) => esTerreno(p.id)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowAddAdicional('terreno');
                                      setAdicionalForm({
                                        idProducto: ID_PRODUCTO_TERRENO,
                                        estadoPago: null,
                                        idBarrio: '',
                                        numeroRecibo: '',
                                      });
                                      setErrorVenta('');
                                    }}
                                    style={{ touchAction: 'manipulation' }}
                                    className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-[13px] font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                  >
                                    <span>+ Compró otro terreno</span>
                                  </button>
                                )}
                              </div>
                            )}

                            {showAddAdicional && (
                              <div className="mt-4 rounded-xl border border-dashed border-brand-200 bg-zinc-50/50 p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-[12px] font-bold uppercase tracking-wider text-brand-800">
                                    Nueva Compra Adicional ({showAddAdicional === 'pij' ? 'Plan' : 'Terreno'})
                                  </h5>
                                  <button
                                    type="button"
                                    onClick={() => setShowAddAdicional(null)}
                                    className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-600"
                                  >
                                    Cancelar
                                  </button>
                                </div>

                                {showAddAdicional === 'terreno' && (
                                  <>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                                        Barrio
                                      </label>
                                      <select
                                        value={adicionalForm.idBarrio}
                                        onChange={(e) => setAdicionalForm(f => ({ ...f, idBarrio: e.target.value }))}
                                        className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[14px] focus:outline-none focus:ring-1 focus:ring-brand-600"
                                      >
                                        <option value="">Seleccionar barrio...</option>
                                        {barrios.map((b) => (
                                          <option key={b.id} value={b.id}>{b.nombre}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                                        Estado de compra
                                      </label>
                                      <div className="flex gap-2">
                                        {[
                                          { value: 'sena', label: 'Operaciones en Seña' },
                                          { value: 'cien', label: 'Cobrado 100%' }
                                        ].map((op) => {
                                          const sel = adicionalForm.estadoPago === op.value;
                                          return (
                                            <button
                                              key={op.value}
                                              type="button"
                                              onClick={() => setAdicionalForm(f => ({ ...f, estadoPago: op.value as EstadoPago }))}
                                              className={`h-10 flex-1 rounded-lg border text-[13px] font-medium transition-all ${sel
                                                  ? 'border-brand-700 bg-brand-600 text-white'
                                                  : 'border-zinc-200 bg-white text-zinc-700'
                                                }`}
                                            >
                                              {op.label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </>
                                )}

                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                                    {showAddAdicional === 'pij' ? 'Número de anexo' : 'Número de recibo'}
                                  </label>
                                  {showAddAdicional === 'pij' ? (
                                    // Entrada estructurada PIJ adicional
                                    <div className="space-y-2">
                                      <div className="flex gap-2">
                                        {(['A', 'B'] as const).map((s) => (
                                          <button
                                            key={s}
                                            type="button"
                                            onClick={() => {
                                              setAdicPijSerie(s);
                                              const r = buildPijRecibo(s, adicPijAdh, adicPijAnexo);
                                              setAdicionalForm(f => ({ ...f, numeroRecibo: r }));
                                            }}
                                            className={`flex-1 h-10 rounded-lg border text-[14px] font-bold transition-all ${adicPijSerie === s
                                                ? 'border-brand-700 bg-brand-600 text-white'
                                                : 'border-zinc-200 bg-white text-zinc-700'
                                              }`}
                                          >
                                            Serie {s}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="flex gap-2">
                                        <div className="flex-1 space-y-1">
                                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">N° Adhesión</label>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={adicPijAdh}
                                            onChange={(e) => {
                                              const v = e.target.value.replace(/\D/g, '');
                                              setAdicPijAdh(v);
                                              const r = buildPijRecibo(adicPijSerie, v, adicPijAnexo);
                                              setAdicionalForm(f => ({ ...f, numeroRecibo: r }));
                                            }}
                                            placeholder="128"
                                            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[14px] tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-600"
                                          />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">N° Anexo</label>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={adicPijAnexo}
                                            onChange={(e) => {
                                              const v = e.target.value.replace(/\D/g, '');
                                              setAdicPijAnexo(v);
                                              const r = buildPijRecibo(adicPijSerie, adicPijAdh, v);
                                              setAdicionalForm(f => ({ ...f, numeroRecibo: r }));
                                            }}
                                            placeholder="233"
                                            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[14px] tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-600"
                                          />
                                        </div>
                                      </div>
                                      {(adicPijAdh.trim() || adicPijAnexo.trim()) && (() => {
                                        const dup = buscarDuplicadoPij(
                                          adicPijSerie,
                                          adicPijAdh,
                                          adicPijAnexo,
                                          undefined,
                                          form.comprasAdicionales,
                                        );
                                        return (
                                          <>
                                            <p className={`rounded-lg border px-3 py-1.5 text-[12px] font-mono font-semibold ${dup
                                                ? 'bg-red-50 border-red-300 text-red-700'
                                                : 'bg-brand-50 border-brand-100 text-brand-800'
                                              }`}>
                                              {adicionalForm.numeroRecibo}
                                            </p>
                                            {dup && (
                                              <p className="text-[12px] font-semibold text-red-600">
                                                ⚠️ {dup}
                                              </p>
                                            )}
                                          </>
                                        );
                                      })()}
                                    </div>
                                  ) : (
                                    // Terreno: texto libre
                                    <div className="space-y-1.5">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={adicionalForm.numeroRecibo}
                                        onChange={(e) => setAdicionalForm(f => ({ ...f, numeroRecibo: e.target.value }))}
                                        placeholder="Ej. 005678"
                                        className={`h-11 w-full rounded-lg border bg-white px-3 text-[14px] focus:outline-none focus:ring-1 focus:ring-brand-600 ${
                                          adicionalForm.numeroRecibo.trim() &&
                                          buscarDuplicadoTerreno(
                                            adicionalForm.numeroRecibo,
                                            undefined,
                                            form.comprasAdicionales,
                                          )
                                            ? 'border-red-300'
                                            : 'border-zinc-200'
                                        }`}
                                      />
                                      {adicionalForm.numeroRecibo.trim() && (() => {
                                        const dup = buscarDuplicadoTerreno(
                                          adicionalForm.numeroRecibo,
                                          undefined,
                                          form.comprasAdicionales,
                                        );
                                        return dup ? (
                                          <p className="text-[12px] font-semibold text-red-600">⚠️ {dup}</p>
                                        ) : null;
                                      })()}
                                    </div>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (showAddAdicional === 'terreno') {
                                      if (!adicionalForm.idBarrio) {
                                        setErrorVenta('Seleccioná el barrio para el terreno adicional.');
                                        return;
                                      }
                                      if (!adicionalForm.estadoPago) {
                                        setErrorVenta('Seleccioná el estado de pago para el terreno adicional.');
                                        return;
                                      }
                                    }
                                    if (!adicionalForm.numeroRecibo.trim()) {
                                      setErrorVenta(
                                        showAddAdicional === 'pij'
                                          ? 'Ingresá el número de anexo adicional.'
                                          : 'Ingresá el número de recibo adicional.'
                                      );
                                      return;
                                    }
                                    if (showAddAdicional === 'pij') {
                                      if (!adicPijAdh.trim()) {
                                        setErrorVenta('Ingresá el número de adhesión adicional.');
                                        return;
                                      }
                                      if (!adicPijAnexo.trim()) {
                                        setErrorVenta('Ingresá el número de anexo adicional.');
                                        return;
                                      }
                                      const dup = buscarDuplicadoPij(
                                        adicPijSerie,
                                        adicPijAdh,
                                        adicPijAnexo,
                                        undefined,
                                        form.comprasAdicionales,
                                      );
                                      if (dup) {
                                        setErrorVenta(dup);
                                        return;
                                      }
                                    }
                                    if (showAddAdicional === 'terreno') {
                                      const dup = buscarDuplicadoTerreno(
                                        adicionalForm.numeroRecibo,
                                        undefined,
                                        form.comprasAdicionales,
                                      );
                                      if (dup) {
                                        setErrorVenta(dup);
                                        return;
                                      }
                                    }

                                    setErrorVenta('');
                                    const newCompra: CompraAdicional = {
                                      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
                                      idProducto: adicionalForm.idProducto,
                                      estadoPago: adicionalForm.estadoPago as EstadoPago,
                                      idBarrio: adicionalForm.idBarrio || null,
                                      numeroRecibo: adicionalForm.numeroRecibo.trim(),
                                      fechaCierre: new Date().toISOString(),
                                    };

                                    patch({
                                      comprasAdicionales: [...(form.comprasAdicionales || []), newCompra]
                                    });

                                    setShowAddAdicional(null);
                                    setAdicionalForm({
                                      idProducto: '',
                                      estadoPago: null,
                                      idBarrio: '',
                                      numeroRecibo: '',
                                    });
                                    setAdicPijSerie('A');
                                    setAdicPijAdh('');
                                    setAdicPijAnexo('');
                                  }}
                                  className="h-10 w-full rounded-lg bg-zinc-900 text-[13px] font-semibold text-white shadow-sm hover:bg-zinc-800 active:scale-[0.98] transition-all"
                                >
                                  Agregar Compra
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </FormSection>
              )}

              {showMotivoNoConfirmo && (
                <FormSection title="¿Qué pasó?" step={2} totalSteps={totalPasos}>
                  <ButtonGroup
                    name="motivoNoConfirmo"
                    label="Seleccioná una opción"
                    options={[
                      { value: true, label: 'Quiere reagendar' },
                      { value: false, label: 'No estaba interesado' },
                    ]}
                    value={
                      form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda'
                        ? true
                        : form.resultadoEntrevista === 'sin_interes'
                          ? false
                          : null
                    }
                    onChange={handleNoConfirmoMotivo}
                  />
                  {showReagendaNoConfirmo && (
                    <CampoFechaReagenda
                      value={form.fechaReagenda}
                      onChange={(v) => patchFechaReagenda(v, patch)}
                    />
                  )}
                </FormSection>
              )}

              {showCanalTrasNoConfirmo && (
                <FormSection title="Canal de contacto" step={3} totalSteps={totalPasos}>
                  <ButtonGroup
                    name="canalNoConfirmo"
                    options={opcionesCanalContacto()}
                    value={form.canal}
                    onChange={handleCanal}
                  />
                </FormSection>
              )}

              {(showReagendaNoConfirmo && form.canal) ||
                (showReagendaSinEntrevistaCampo && form.fechaReagenda) ||
                (showAgendoCalendario && form.fechaReagenda) ||
                (showFechaReagendaTrasNoComproSinCita && form.fechaReagenda) ? (
                <p className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] text-brand-700">
                  Al guardar, el lead pasa a{' '}
                  <span className="font-medium">En seguimiento</span> con la nueva fecha.
                </p>
              ) : null}

              {showReferidosObs && (
                <FormSection
                  title="Referidos"
                  step={flujoSinCita ? (esFlujoCampo ? 3 : 4) : 4}
                  totalSteps={totalPasos}
                >
                  <ButtonGroup
                    name="referidos"
                    label="¿Brindó referidos?"
                    options={[
                      { value: true, label: 'Sí' },
                      { value: false, label: 'No' },
                    ]}
                    value={form.brindoReferidos}
                    onChange={(v) => patch({ brindoReferidos: v })}
                  />

                  {showReferidos && (
                    <div className="space-y-4 pt-1">
                      <p className="text-[12px] text-zinc-500">
                        Al guardar, cada referido nuevo se carga automáticamente como lead del mismo
                        promotor (si el teléfono no existe ya en la campaña).
                      </p>
                      {form.referidos.map((ref, idx) => (
                        <div key={idx} className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                            Referido {idx + 1}
                          </p>
                          <input
                            type="text"
                            placeholder="Nombre y apellido"
                            value={ref.nombre}
                            onChange={(e) => {
                              const next = [...form.referidos];
                              next[idx] = { ...next[idx], nombre: e.target.value };
                              patch({ referidos: next });
                            }}
                            autoComplete="name"
                            className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                          />
                          <input
                            type="tel"
                            placeholder="Teléfono"
                            value={ref.telefono}
                            inputMode="tel"
                            autoComplete="tel"
                            onChange={(e) => {
                              const next = [...form.referidos];
                              next[idx] = { ...next[idx], telefono: e.target.value };
                              patch({ referidos: next });
                            }}
                            className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => patch({ referidos: [...form.referidos, emptyReferido()] })}
                        style={{ touchAction: 'manipulation' }}
                        className="h-12 w-full rounded-lg border border-dashed border-zinc-300 text-[14px] font-medium text-zinc-500 transition-colors active:bg-brand-50 active:border-brand-400 active:text-brand-700"
                      >
                        + Agregar otro referido
                      </button>
                    </div>
                  )}
                </FormSection>
              )}

              {showReferidosObs && (
                <FormSection
                  title={tituloObservaciones}
                  step={flujoSinCita ? (esFlujoCampo ? 4 : 5) : 5}
                  totalSteps={totalPasos}
                >
                  <textarea
                    value={form.observaciones}
                    onChange={(e) => patch({ observaciones: e.target.value })}
                    rows={4}
                    placeholder={placeholderObservaciones}
                    className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                    style={{ minHeight: '120px' }}
                  />
                </FormSection>
              )}

              {errorForm && (
                <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
                  {errorForm}
                </p>
              )}
              <div className="h-4" aria-hidden="true" />
            </fieldset>
          </form>

          {/* Footer sticky con safe area */}
          <div
            className="shrink-0 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            {soloLectura ? (
              <button
                type="button"
                onClick={onClose}
                style={{ touchAction: 'manipulation' }}
                className="h-[52px] w-full rounded-xl border border-zinc-200 bg-white text-[15px] font-semibold text-zinc-700 transition-all duration-[120ms] ease-out active:bg-zinc-50 active:scale-[0.98]"
              >
                Cerrar
              </button>
            ) : (
              <button
                type="submit"
                form="lead-form"
                style={{ touchAction: 'manipulation' }}
                className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98]"
              >
                Guardar y actualizar lead
              </button>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
