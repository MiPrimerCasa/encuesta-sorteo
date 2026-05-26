import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  EstadoPago,
  Lead,
  Producto,
  Referido,
  RolUsuario,
  SeguimientoLead,
} from '../../types';
import { ButtonGroup, FormSection, RadioOption } from '../ui/ButtonGroup';

const emptyReferido = (): Referido => ({ nombre: '', telefono: '' });

interface FormState {
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

function desactivarReagenda(patch: FormState) {
  return {
    reagendarEntrevista: false,
    resultadoEntrevista: patch.resultadoEntrevista === 'reagenda' ? null : patch.resultadoEntrevista,
    fechaReagenda: '',
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
      if (
        initial.idProducto &&
        !puedeVenderProducto(productos, rol, initial.idProducto)
      ) {
        initial.idProducto = '';
      }
      setForm(initial);
      setErrorVenta('');
    }
  }, [open, lead, rol, productos]);

  if (!open || !lead) return null;

  const patch = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  const handleCanal = (canal: NonNullable<SeguimientoLead['canal']>) => patch({ canal });

  const handleReagendarToggle = (quiere: boolean) => {
    if (quiere) {
      patch(activarReagenda());
    } else {
      patch(desactivarReagenda(form));
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
        resultadoEntrevista:
          form.reagendarEntrevista ? 'reagenda' : form.resultadoEntrevista,
      });
    }
  };

  const handleGuardar = (e: FormEvent) => {
    e.preventDefault();

    const esReagenda =
      form.reagendarEntrevista || form.resultadoEntrevista === 'reagenda';

    if (esReagenda && !form.fechaReagenda) {
      return;
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
      if (esTerreno(form.idProducto) && !form.idBarrio) {
        setErrorVenta('Seleccioná el barrio del terreno.');
        return;
      }
      if (requiereNumeroRecibo(form.idProducto, form.estadoPago) && !form.numeroRecibo.trim()) {
        setErrorVenta('Ingresá el número de recibo.');
        return;
      }
    }

    setErrorVenta('');

    const seguimiento: SeguimientoLead = {
      canal: form.canal,
      huboEntrevista: esReagenda ? false : form.huboEntrevista,
      resultadoEntrevista: esReagenda ? 'reagenda' : form.resultadoEntrevista,
      fechaReagenda: esReagenda ? form.fechaReagenda : null,
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

  const contactado = Boolean(form.canal);
  const showReagendaBloque = form.reagendarEntrevista;
  const showEntrevistaDetalle = form.huboEntrevista === true && !form.reagendarEntrevista;
  const showSinEntrevista =
    form.huboEntrevista === false && !form.reagendarEntrevista;
  const showReagendaEnNo =
    showSinEntrevista && form.resultadoEntrevista === 'reagenda';
  const showCompro = form.resultadoEntrevista === 'compro';
  const productoEsPij = esPlanInversion(form.idProducto);
  const productoEsTerreno = esTerreno(form.idProducto);
  const opcionesPago = productoEsPij
    ? opcionesPagoPlanInversion()
    : productoEsTerreno
      ? opcionesPagoTerreno()
      : [];
  const muestraRecibo = requiereNumeroRecibo(form.idProducto, form.estadoPago);

  const pillClass = (selected: boolean) =>
    `min-h-12 w-full rounded-full border-2 px-4 py-3 text-left text-base font-bold transition touch-manipulation ${
      selected
        ? 'border-brand bg-brand text-white shadow-md'
        : 'border-neutral-300 bg-white text-neutral-900'
    }`;

  const seleccionarPago = (estado: EstadoPago) => {
    setErrorVenta('');
    const limpiaRecibo = !requiereNumeroRecibo(form.idProducto, estado);
    patch({
      estadoPago: estado,
      numeroRecibo: limpiaRecibo ? '' : form.numeroRecibo,
    });
  };
  const showReferidos = form.brindoReferidos === true;
  const canalLabel = form.canal === 'llamada' ? 'llamada' : form.canal === 'mensaje' ? 'mensaje' : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-lead-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between bg-brand px-4 py-4">
          <div>
            <h2 id="modal-lead-title" className="text-xl font-bold uppercase text-white">
              {lead.nombre}
            </h2>
            <p className="text-sm text-white/85">{lead.telefono}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-bold text-brand"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleGuardar} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <FormSection title="1 · Canal de contacto">
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

          {contactado && (
            <FormSection title="Contactado · Reagendar entrevista">
              <p className="text-sm text-neutral-600">
                Cliente contactado por <strong>{canalLabel}</strong>. Si pide otra fecha para la
                entrevista, registrala acá.
              </p>
              <ButtonGroup
                name="reagendar"
                label="¿Quiere reagendar la entrevista?"
                options={[
                  { value: true, label: 'Sí, reagendar' },
                  { value: false, label: 'No' },
                ]}
                value={form.reagendarEntrevista}
                onChange={handleReagendarToggle}
              />
              {showReagendaBloque && (
                <label className="mt-3 block rounded-xl border-2 border-brand/30 bg-brand-light p-3">
                  <span className="text-sm font-bold text-brand">Nueva fecha y hora de entrevista</span>
                  <input
                    type="datetime-local"
                    value={form.fechaReagenda}
                    onChange={(e) => patch({ fechaReagenda: e.target.value })}
                    className="mt-2 w-full min-h-12 rounded-xl border-2 border-neutral-200 bg-white px-3 text-base focus:border-brand focus:outline-none"
                    required
                  />
                </label>
              )}
            </FormSection>
          )}

          <FormSection
            title="2 · Entrevista"
            visible={!form.reagendarEntrevista}
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

            {showSinEntrevista && (
              <div className="mt-3 space-y-2">
                <RadioOption
                  name="sinEntrevista"
                  value="sin_interes"
                  label="No muestra interés"
                  checked={form.resultadoEntrevista === 'sin_interes'}
                  onChange={() =>
                    patch({ resultadoEntrevista: 'sin_interes', fechaReagenda: '' })
                  }
                />
                <RadioOption
                  name="sinEntrevista"
                  value="reagenda"
                  label="Se reagenda (sin contacto previo registrado)"
                  checked={form.resultadoEntrevista === 'reagenda'}
                  onChange={() => patch({ ...activarReagenda(), reagendarEntrevista: true })}
                />
                {showReagendaEnNo && (
                  <label className="block pt-1">
                    <span className="text-sm font-medium text-neutral-700">Fecha y hora</span>
                    <input
                      type="datetime-local"
                      value={form.fechaReagenda}
                      onChange={(e) => patch({ fechaReagenda: e.target.value })}
                      className="mt-1 w-full min-h-12 rounded-xl border-2 border-neutral-200 px-3 text-base focus:border-brand focus:outline-none"
                      required
                    />
                  </label>
                )}
              </div>
            )}

            {showEntrevistaDetalle && (
              <div className="mt-3 space-y-2">
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
                  label="Compró"
                  checked={form.resultadoEntrevista === 'compro'}
                  onChange={() => {
                    setErrorVenta('');
                    const defaultProducto = productosDisponibles[0]?.id ?? '';
                    patch({
                      resultadoEntrevista: 'compro',
                      idProducto: form.idProducto || defaultProducto,
                    });
                  }}
                />
                {showCompro && (
                  <div className="mt-3 space-y-4 rounded-xl border-2 border-brand/30 bg-brand-light p-3">
                    <div>
                      <p className="text-sm font-bold text-brand">¿Qué compró?</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {rol === 'promotor'
                          ? 'Solo Plan Inversión Joven'
                          : 'Plan Inversión Joven o Terreno'}
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        {productosDisponibles.length === 0 ? (
                          <p className="text-sm text-red-600">No hay productos para tu rol.</p>
                        ) : (
                          productosDisponibles.map((prod) => {
                            const seleccionado = form.idProducto === prod.id;
                            return (
                              <button
                                key={prod.id}
                                type="button"
                                onClick={() => {
                                  setErrorVenta('');
                                  patch(resetCamposAlCambiarProducto(prod.id));
                                }}
                                className={`min-h-14 w-full rounded-full border-2 px-4 py-3 text-left text-base font-bold transition touch-manipulation ${
                                  seleccionado
                                    ? 'border-brand bg-brand text-white shadow-md'
                                    : 'border-neutral-300 bg-white text-neutral-900'
                                }`}
                              >
                                {prod.nombre}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    {productoEsTerreno && (
                      <div>
                        <p className="text-sm font-bold text-brand">Barrio</p>
                        <p className="mt-1 text-xs text-neutral-600">
                          Seleccioná el barrio del terreno vendido.
                        </p>
                        <div className="mt-3 flex flex-col gap-2">
                          {barrios.length === 0 ? (
                            <p className="text-sm text-red-600">No hay barrios cargados.</p>
                          ) : (
                            barrios.map((barrio) => (
                              <button
                                key={barrio.id}
                                type="button"
                                onClick={() => {
                                  setErrorVenta('');
                                  patch({ idBarrio: barrio.id });
                                }}
                                className={pillClass(form.idBarrio === barrio.id)}
                              >
                                {barrio.nombre}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {form.idProducto && (
                      <div>
                        <p className="text-sm font-bold text-brand">Estado del pago</p>
                        {productoEsPij && (
                          <p className="mt-1 text-xs text-neutral-600">
                            La entrega de $33.000 equivale al cierre del plan. Podrá adherirse al
                            terreno después de 12 meses de pagos.
                          </p>
                        )}
                        <div className="mt-3 flex flex-col gap-2">
                          {opcionesPago.map((op) => (
                            <button
                              key={op.value}
                              type="button"
                              onClick={() => seleccionarPago(op.value)}
                              className={pillClass(form.estadoPago === op.value)}
                            >
                              {op.label}
                              {op.hint && form.estadoPago === op.value && (
                                <span className="mt-1 block text-xs font-normal opacity-90">
                                  {op.hint}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {muestraRecibo && (
                      <label className="block rounded-xl border-2 border-brand/30 bg-white p-3">
                        <span className="text-sm font-bold text-brand">Número de recibo</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={form.numeroRecibo}
                          onChange={(e) => patch({ numeroRecibo: e.target.value })}
                          placeholder="Ej. REC-12345"
                          className="mt-2 w-full min-h-12 rounded-xl border-2 border-neutral-200 px-3 text-base focus:border-brand focus:outline-none"
                          required
                        />
                      </label>
                    )}

                    {errorVenta && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                        {errorVenta}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </FormSection>

          {form.reagendarEntrevista && (
            <p className="rounded-xl bg-brand-light px-3 py-2 text-sm text-brand">
              Al guardar, el lead pasa a la sección <strong>Seguimiento</strong> con la nueva fecha.
              Referidos y observaciones opcionales abajo.
            </p>
          )}

          <FormSection title="3 · Referidos">
            <ButtonGroup
              name="referidos"
              label="¿Brindó referidos?"
              options={[
                { value: true, label: 'Sí' },
                { value: false, label: 'No' },
              ]}
              value={form.brindoReferidos}
              onChange={(v: boolean) => patch({ brindoReferidos: v })}
            />
            {showReferidos && (
              <div className="space-y-4 pt-2">
                {form.referidos.map((ref, idx) => (
                  <div
                    key={idx}
                    className="space-y-2 rounded-xl border-2 border-neutral-200 bg-white p-3"
                  >
                    <p className="text-xs font-bold uppercase text-brand">Referido {idx + 1}</p>
                    <input
                      type="text"
                      placeholder="Nombre y apellido"
                      value={ref.nombre}
                      onChange={(e) => {
                        const next = [...form.referidos];
                        next[idx] = { ...next[idx], nombre: e.target.value };
                        patch({ referidos: next });
                      }}
                      className="w-full min-h-11 rounded-lg border-2 border-neutral-200 px-3 focus:border-brand"
                    />
                    <input
                      type="tel"
                      placeholder="Teléfono"
                      value={ref.telefono}
                      onChange={(e) => {
                        const next = [...form.referidos];
                        next[idx] = { ...next[idx], telefono: e.target.value };
                        patch({ referidos: next });
                      }}
                      className="w-full min-h-11 rounded-lg border-2 border-neutral-200 px-3 focus:border-brand"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patch({ referidos: [...form.referidos, emptyReferido()] })}
                  className="w-full min-h-11 rounded-full border-2 border-dashed border-brand py-2 text-sm font-bold uppercase text-brand"
                >
                  + Agregar otro referido
                </button>
              </div>
            )}
          </FormSection>

          <FormSection title="4 · Observaciones">
            <textarea
              value={form.observaciones}
              onChange={(e) => patch({ observaciones: e.target.value })}
              rows={4}
              placeholder="Notas del supervisor..."
              className="w-full resize-y rounded-xl border-2 border-neutral-200 px-3 py-3 text-base focus:border-brand"
            />
          </FormSection>

          <button
            type="submit"
            className="sticky bottom-0 w-full min-h-14 rounded-full bg-white text-lg font-bold uppercase text-brand shadow-lg ring-2 ring-brand active:bg-neutral-100"
          >
            Guardar y actualizar lead
          </button>
        </form>
      </div>
    </div>
  );
}
