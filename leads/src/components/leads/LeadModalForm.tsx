import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import { getProductosPorRol, puedeVenderProducto } from '../../domain/leads';
import {
  esPlanInversion,
  esTerreno,
  opcionesPagoPlanInversion,
  opcionesPagoTerreno,
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
import { ButtonGroup, FormSection, RadioOption } from '../ui/ButtonGroup';
import { DateTimePicker } from '../ui/DateTimePicker';

const emptyReferido = (): Referido => ({ nombre: '', telefono: '' });

interface FormState {
  confirmoEntrevista: boolean | null;
  canal: SeguimientoLead['canal'];
  huboEntrevista: boolean | null;
  resultadoEntrevista: SeguimientoLead['resultadoEntrevista'];
  fechaReagenda: string;
  reagendarEntrevista: boolean;
  idProducto: string;
  estadoPago: SeguimientoLead['estadoPago'];
  idBarrio: string;
  numeroRecibo: string;
  brindoReferidos: boolean | null;
  referidos: Referido[];
  observaciones: string;
}

function buildInitialForm(lead: Lead | null): FormState {
  const s = lead?.seguimiento ?? {};
  const reagenda = s.resultadoEntrevista === 'reagenda';
  let estadoPago = s.estadoPago ?? null;
  if (esPlanInversion(s.idProducto) && estadoPago === 'cien') {
    estadoPago = 'entrega_33';
  }
  return {
    confirmoEntrevista: s.confirmoEntrevista ?? null,
    canal: s.canal ?? null,
    huboEntrevista: s.huboEntrevista ?? null,
    resultadoEntrevista: s.resultadoEntrevista ?? null,
    fechaReagenda: s.fechaReagenda ?? '',
    reagendarEntrevista: reagenda,
    idProducto: s.idProducto ?? '',
    estadoPago,
    idBarrio: s.idBarrio ?? '',
    numeroRecibo: s.numeroRecibo ?? '',
    brindoReferidos: s.brindoReferidos ?? null,
    referidos: s.referidos?.length ? [...s.referidos] : [emptyReferido()],
    observaciones: s.observaciones ?? '',
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

interface LeadModalFormProps {
  lead: Lead | null;
  open: boolean;
  rolUsuario: RolUsuario;
  productos: Producto[];
  barrios: Barrio[];
  onClose: () => void;
  onSave: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
}

export function LeadModalForm({
  lead,
  open,
  rolUsuario,
  productos,
  barrios,
  onClose,
  onSave,
}: LeadModalFormProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(lead));
  const [errorVenta, setErrorVenta] = useState('');

  const rol: RolUsuario = rolUsuario === 'promotor' ? 'promotor' : 'supervisor';
  const productosDisponibles = useMemo(
    () => getProductosPorRol(productos, rol),
    [productos, rol],
  );

  useEffect(() => {
    if (open && lead) {
      const initial = buildInitialForm(lead);
      if (initial.idProducto && !puedeVenderProducto(productos, rol, initial.idProducto)) {
        initial.idProducto = '';
      }
      setForm(initial);
      setErrorVenta('');
    }
  }, [open, lead, rol, productos]);

  if (!open || !lead) return null;

  const patch = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  const handleCanal = (canal: NonNullable<SeguimientoLead['canal']>) => patch({ canal });

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
          form.resultadoEntrevista === 'reagenda' || form.resultadoEntrevista === 'sin_interes'
            ? null
            : form.resultadoEntrevista,
        fechaReagenda: '',
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

    const esReagenda = form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda';
    if (esReagenda && !form.fechaReagenda) return;

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
      if (esTerreno(form.idProducto) && !form.idBarrio) {
        setErrorVenta('Seleccioná el barrio del terreno.');
        return;
      }
      if (requiereNumeroRecibo(form.idProducto, form.estadoPago) && !form.numeroRecibo.trim()) {
        setErrorVenta('Ingresá el número del comprobante.');
        return;
      }
    }

    setErrorVenta('');

    const esFlujoCampo = rol === 'promotor';
    const confirmoNo = !esFlujoCampo && form.confirmoEntrevista === false;
    const esReagendaNoConfirmo =
      confirmoNo && (form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda');

    const seguimiento: SeguimientoLead = {
      fuente: lead.seguimiento?.fuente,
      confirmoEntrevista: esFlujoCampo ? null : form.confirmoEntrevista,
      canal: esFlujoCampo ? null : form.canal,
      huboEntrevista: esFlujoCampo
        ? esReagenda
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
    onSave(lead.id, seguimiento);
    onClose();
  };

  const esFlujoCampo = rol === 'promotor';
  const totalPasos = esFlujoCampo ? 4 : 5;
  const tituloObservaciones = esFlujoCampo ? 'Observaciones del promotor' : 'Observaciones';
  const placeholderObservaciones = esFlujoCampo
    ? 'Notas de la visita, entrevista o cierre…'
    : 'Notas del supervisor…';

  const confirmoSi = !esFlujoCampo && form.confirmoEntrevista === true;
  const confirmoNo = !esFlujoCampo && form.confirmoEntrevista === false;

  const showCanalSiConfirmo = confirmoSi;
  const showHuboEntrevista = esFlujoCampo || (confirmoSi && form.canal != null);
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

  const flujoCampoCompleto =
    esFlujoCampo &&
    form.huboEntrevista !== null &&
    (form.huboEntrevista === false
      ? form.resultadoEntrevista != null
      : form.resultadoEntrevista != null);

  const showReferidosObs =
    flujoCampoCompleto ||
    (confirmoSi &&
      form.canal != null &&
      form.huboEntrevista !== null &&
      (form.huboEntrevista === false
        ? form.resultadoEntrevista != null
        : form.huboEntrevista === true && form.resultadoEntrevista != null)) ||
    (confirmoNo && showCanalTrasNoConfirmo && form.canal != null);
  const productoEsPij = esPlanInversion(form.idProducto);
  const productoEsTerreno = esTerreno(form.idProducto);
  const opcionesPago = productoEsPij
    ? opcionesPagoPlanInversion()
    : productoEsTerreno
      ? opcionesPagoTerreno()
      : [];
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

          {/* Scrollable form */}
          <form
            id="lead-form"
            onSubmit={handleGuardar}
            className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5"
          >
            {/* Supervisor: confirmación + canal; promotor en calle: arranca en hubo entrevista */}
            {!esFlujoCampo && (
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

            {showHuboEntrevista && (
              <FormSection
                title={esFlujoCampo ? 'Visita en calle' : 'Entrevista'}
                step={esFlujoCampo ? 1 : 3}
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
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                          Nueva fecha y hora de entrevista
                        </p>
                        <DateTimePicker
                          value={form.fechaReagenda}
                          onChange={(v) => patch({ fechaReagenda: v })}
                          autoOpen={!form.fechaReagenda}
                          required
                        />
                      </div>
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
                    label="No compró"
                    checked={form.resultadoEntrevista === 'no_compro'}
                    onChange={() =>
                      patch({ resultadoEntrevista: 'no_compro', ...resetCamposVenta() })
                    }
                  />
                  <RadioOption
                    name="conEntrevista"
                    value="compro"
                    label="Cierre"
                    checked={form.resultadoEntrevista === 'compro'}
                    onChange={() => {
                      setErrorVenta('');
                      patch({
                        resultadoEntrevista: 'compro',
                        idProducto: form.idProducto || (productosDisponibles[0]?.id ?? ''),
                      });
                    }}
                  />

                  {showCompro && (
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
                            <div className="space-y-2">
                              {barrios.map((barrio) => {
                                const sel = form.idBarrio === barrio.id;
                                return (
                                  <button
                                    key={barrio.id}
                                    type="button"
                                    onClick={() => {
                                      setErrorVenta('');
                                      patch({ idBarrio: barrio.id });
                                    }}
                                    style={{ touchAction: 'manipulation' }}
                                    className={`h-12 w-full rounded-lg border px-4 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${
                                      sel
                                        ? 'border-brand-700 bg-brand-600 text-white active:bg-brand-700'
                                        : 'border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
                                    }`}
                                  >
                                    {barrio.nombre}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Estado del pago */}
                      {form.idProducto && opcionesPago.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                            Estado del pago
                          </p>
                          {productoEsPij && (
                            <p className="text-[12px] text-zinc-500">
                              La entrega de $33.000 equivale al cierre del plan.
                            </p>
                          )}
                          <div className="space-y-2">
                            {opcionesPago.map((op) => {
                              const sel = form.estadoPago === op.value;
                              return (
                                <button
                                  key={op.value}
                                  type="button"
                                  onClick={() => {
                                    setErrorVenta('');
                                    const limpiaRecibo = !requiereNumeroRecibo(form.idProducto, op.value);
                                    patch({
                                      estadoPago: op.value,
                                      numeroRecibo: limpiaRecibo ? '' : form.numeroRecibo,
                                    });
                                  }}
                                  style={{ touchAction: 'manipulation' }}
                                  className={`min-h-[48px] w-full rounded-lg border px-4 py-2 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${
                                    sel
                                      ? 'border-brand-700 bg-brand-600 text-white active:bg-brand-700'
                                      : 'border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
                                  }`}
                                >
                                  {op.label}
                                  {op.hint && sel && (
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
                            Número del comprobante
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
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                      Nueva fecha y hora de entrevista
                    </p>
                    <DateTimePicker
                      value={form.fechaReagenda}
                      onChange={(v) => patch({ fechaReagenda: v })}
                      autoOpen={!form.fechaReagenda}
                      required
                    />
                  </div>
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
            (showReagendaSinEntrevistaCampo && form.fechaReagenda) ? (
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
          </form>

          {/* Footer sticky con safe area */}
          <div
            className="shrink-0 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="submit"
              form="lead-form"
              style={{ touchAction: 'manipulation' }}
              className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98]"
            >
              Guardar y actualizar lead
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
