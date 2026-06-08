import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
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
  ETIQUETA_CIERRE_SUPERVISOR,
  ETIQUETA_SEGUIMIENTO_PIJ,
} from '../../domain/leads';
import {
  esPlanInversion,
  esTerreno,
  etiquetaEstadoPagoVisible,
  etiquetaCortaNumeroDocumentoVenta,
  getBarrioNombre,
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
  if (sinCita && contactoHecho) {
    if (reagenda && !seguimientoPij) agendoEntrevista = true;
    else if (s.resultadoEntrevista === 'sin_interes') agendoEntrevista = false;
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
  soloLectura = false,
  onClose,
  onSave,
}: LeadModalFormProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(lead));
  const [errorVenta, setErrorVenta] = useState('');
  const [barrioPickerOpen, setBarrioPickerOpen] = useState(false);

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
    }
  }, [open, lead, rol, productos, soloLectura]);

  if (!open || !lead) return null;

  const patch = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  const handleCanal = (canal: NonNullable<SeguimientoLead['canal']>) => patch({ canal });

  const handleSeContactoCliente = (contacto: boolean) => {
    if (contacto) {
      patch({
        seContactoCliente: true,
        confirmoEntrevista: rol !== 'promotor' ? true : form.confirmoEntrevista,
        canal: null,
        agendoEntrevista: null,
        huboEntrevista: null,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        ...resetCamposVenta(),
      });
    } else {
      patch({
        seContactoCliente: false,
        confirmoEntrevista: rol !== 'promotor' ? false : form.confirmoEntrevista,
        canal: null,
        agendoEntrevista: null,
        huboEntrevista: null,
        resultadoEntrevista: null,
        reagendarEntrevista: false,
        fechaReagenda: '',
        ...resetCamposVenta(),
      });
    }
  };

  const handleAgendoEntrevista = (agendo: boolean) => {
    if (agendo) {
      patch({ agendoEntrevista: true, ...activarReagenda() });
    } else {
      patch({
        agendoEntrevista: false,
        resultadoEntrevista: 'sin_interes',
        reagendarEntrevista: false,
        fechaReagenda: '',
        huboEntrevista: false,
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

    const flujoSinCitaGuardar = !leadTieneCitaPrevia(lead);

    if (flujoSinCitaGuardar) {
      if (form.seContactoCliente !== true) return;
      if (form.canal == null) return;
      if (form.agendoEntrevista == null) return;
      if (form.agendoEntrevista === true && !form.fechaReagenda.trim()) return;

      const esAgendo = form.agendoEntrevista === true;
      const seguimientoSinCita: SeguimientoLead = {
        fuente: lead.seguimiento?.fuente,
        confirmoEntrevista: rol === 'supervisor' ? true : null,
        canal: form.canal,
        huboEntrevista: false,
        resultadoEntrevista: esAgendo ? 'reagenda' : 'sin_interes',
        fechaReagenda: esAgendo ? form.fechaReagenda || null : null,
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
      };
      void (async () => {
        await onSave(lead.id, seguimientoSinCita);
        onClose();
      })();
      return;
    }

    const esFlujoCampoGuardar = rol === 'promotor';
    const esReagendaPijGuardar =
      esFlujoCampoGuardar &&
      form.resultadoEntrevista === 'no_compro' &&
      form.reagendaPijTrasNoCompro === true;
    const esReagenda =
      form.reagendarEntrevista ||
      form.resultadoEntrevista === 'reagenda' ||
      esReagendaPijGuardar;
    if (esReagenda && !form.fechaReagenda) return;

    if (form.resultadoEntrevista === 'derivar_terreno') {
      if (form.proponeFechaDerivacion === null) return;
      if (form.proponeFechaDerivacion && !form.horarioDerivacion.trim()) return;
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
        setErrorVenta(mensajeErrorNumeroDocumentoVenta(rol));
        return;
      }
    }

    setErrorVenta('');

    const esFlujoCampo = rol === 'promotor';
    const confirmoNo = !esFlujoCampo && form.confirmoEntrevista === false;
    const esReagendaNoConfirmo =
      confirmoNo && (form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda');
    const esReagendaPij =
      esFlujoCampo &&
      form.resultadoEntrevista === 'no_compro' &&
      form.reagendaPijTrasNoCompro === true;

    const seguimiento: SeguimientoLead = {
      fuente: lead.seguimiento?.fuente,
      confirmoEntrevista: esFlujoCampo ? null : form.confirmoEntrevista,
      canal: esFlujoCampo ? null : form.canal,
      huboEntrevista: esFlujoCampo
        ? esReagendaPij
          ? true
          : esReagenda
            ? false
            : form.huboEntrevista
        : confirmoNo
            ? false
            : esReagenda
              ? false
              : form.huboEntrevista,
      resultadoEntrevista: esFlujoCampo
        ? esReagenda
          ? 'reagenda'
          : form.resultadoEntrevista
        : confirmoNo
            ? esReagendaNoConfirmo
              ? 'reagenda'
              : form.resultadoEntrevista
            : esReagenda
              ? 'reagenda'
              : form.resultadoEntrevista,
      fechaReagenda: esReagenda ? form.fechaReagenda || null : null,
      seguimientoPijPromotor: esReagendaPij,
      seguimientoAgendaOperadorRol: null,
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
    };
    void (async () => {
      await onSave(lead.id, seguimiento);
      onClose();
    })();
  };

  const esFlujoCampo = rol === 'promotor';
  const sinCitaPrevia = !leadTieneCitaPrevia(lead);
  const flujoSinCita = sinCitaPrevia;
  const totalPasos = flujoSinCita ? 4 : esFlujoCampo ? 4 : 5;
  const tituloObservaciones = esFlujoCampo ? 'Observaciones del promotor' : 'Observaciones';
  const placeholderObservaciones = esFlujoCampo
    ? 'Notas de la visita, entrevista o cierre…'
    : 'Notas del supervisor…';
  const confirmoSi = !esFlujoCampo && !flujoSinCita && form.confirmoEntrevista === true;
  const confirmoNo = !esFlujoCampo && !flujoSinCita && form.confirmoEntrevista === false;

  const showContactoSinCita = flujoSinCita;
  const showCanalSinCita = flujoSinCita && form.seContactoCliente === true;
  const showAgendoPregunta =
    flujoSinCita && form.seContactoCliente === true && form.canal != null;
  const showAgendoCalendario = showAgendoPregunta && form.agendoEntrevista === true;
  const showSinInteresSinCita = showAgendoPregunta && form.agendoEntrevista === false;

  const showCanalSiConfirmo = confirmoSi;
  const horarioCitaLead = getHorarioEntrevistaLead(lead);
  const fmtCitaLead = formatEntrevistaCalendario(horarioCitaLead);
  const lugarCitaLead = getLugarEntrevistaLead(lead);

  const showCitaExistente =
    confirmoSi && form.canal != null && !sinCitaPrevia && Boolean(horarioCitaLead);
  const showHuboEntrevista =
    (esFlujoCampo && !flujoSinCita) ||
    (confirmoSi && form.canal != null && !flujoSinCita);
  const showEntrevistaDetalle = showHuboEntrevista && form.huboEntrevista === true;
  const showSinEntrevistaResultado = showHuboEntrevista && form.huboEntrevista === false;
  const showReagendaSinEntrevistaCampo =
    esFlujoCampo &&
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
    esFlujoCampo && form.resultadoEntrevista === 'no_compro';
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

  const flujoSinCitaCompleto =
    flujoSinCita &&
    form.seContactoCliente === true &&
    form.canal != null &&
    form.agendoEntrevista !== null &&
    (form.agendoEntrevista === false || Boolean(form.fechaReagenda.trim()));

  const flujoReagendaConFecha =
    Boolean(form.fechaReagenda.trim()) &&
    (showAgendoCalendario ||
      showReagendaNoConfirmo ||
      showReagendaSinEntrevistaCampo ||
      showFechaReagendaPij);

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
              <p className="mt-0.5 text-[13px] tabular-nums text-zinc-500">{lead.telefono}</p>
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

          {soloLectura && (
            <div className="mx-4 mb-3 shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
              <p className="text-[13px] font-medium text-indigo-900">
                {leadSeguimientoPijPromotor(lead)
                  ? ETIQUETA_SEGUIMIENTO_PIJ
                  : etiquetaSeguimientoAgendaOtroRol(lead, rol) ??
                    ETIQUETA_CIERRE_SUPERVISOR}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-indigo-800/90">
                Podés consultar este seguimiento, pero no modificarlo desde tu cuenta.
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
                  options={[
                    { value: 'llamada', label: 'Llamada' },
                    { value: 'mensaje', label: 'Mensaje' },
                  ]}
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

            {showSinInteresSinCita && (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-700">
                El cliente <span className="font-medium">no estaba interesado</span>. Al guardar pasa
                a Contactado.
              </p>
            )}

            {/* Supervisor con cita previa: confirmación de entrevista agendada */}
            {!esFlujoCampo && !flujoSinCita && (
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
                  options={[
                    { value: 'llamada', label: 'Llamada' },
                    { value: 'mensaje', label: 'Mensaje' },
                  ]}
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
                step={esFlujoCampo ? 1 : showCitaExistente ? 4 : 3}
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
              <FormSection title="Resultado" step={esFlujoCampo ? 2 : undefined} totalSteps={totalPasos}>
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
                {esFlujoCampo && (
                  <>
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
                  </>
                )}
              </FormSection>
            )}

            {showEntrevistaDetalle && (
              <FormSection
                title="Resultado de la entrevista"
                step={esFlujoCampo ? 2 : 4}
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
                        reagendarEntrevista: false,
                        fechaReagenda: '',
                        proponeFechaDerivacion: null,
                        horarioDerivacion: '',
                        ...resetCamposVenta(),
                      })
                    }
                  />
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
                    <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
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
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
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
                        <p className="text-[12px] leading-relaxed text-brand-800">
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
                            {etiquetaCortaNumeroDocumentoVenta('supervisor')}
                          </p>
                          <p className="mt-1 text-[15px] font-medium tabular-nums text-zinc-900">
                            {numeroReciboCierre}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {showCompro && !soloLectura && (
                    <div className="space-y-5 rounded-xl border border-brand-100 bg-brand-50 p-4">
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
                                className={`h-12 w-full rounded-lg border px-4 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${
                                  sel
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
                                className={`flex h-12 w-full items-center justify-between rounded-lg border px-4 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${
                                  form.idBarrio
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
                                  className={`min-h-[48px] w-full rounded-lg border px-4 py-2 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${
                                    bloqueada
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
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                            {etiquetaNumeroDocumentoVenta(rol)}
                          </p>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={form.numeroRecibo}
                            onChange={(e) => patch({ numeroRecibo: e.target.value })}
                            placeholder="Ej. 001234"
                            className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                            required
                          />
                        </div>
                      )}

                      {errorVenta && (
                        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
                          {errorVenta}
                        </p>
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
                  options={[
                    { value: 'llamada', label: 'Llamada' },
                    { value: 'mensaje', label: 'Mensaje' },
                  ]}
                  value={form.canal}
                  onChange={handleCanal}
                />
              </FormSection>
            )}

            {(showReagendaNoConfirmo && form.canal) ||
            (showReagendaSinEntrevistaCampo && form.fechaReagenda) ||
            (showAgendoCalendario && form.fechaReagenda) ? (
              <p className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] text-brand-700">
                Al guardar, el lead pasa a{' '}
                <span className="font-medium">En seguimiento</span> con la nueva fecha.
              </p>
            ) : null}

            {showReferidosObs && (
            <FormSection
              title="Referidos"
              step={esFlujoCampo ? 3 : 4}
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
              step={esFlujoCampo ? 4 : 5}
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
