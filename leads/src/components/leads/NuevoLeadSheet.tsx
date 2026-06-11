import { useEffect, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import { useAuth } from '../../context/AuthContext';
import type { LugarEntrevista, NuevoLeadData, Promotor, RolUsuario } from '../../types';
import { DateTimePicker } from '../ui/DateTimePicker';

interface NuevoLeadSheetProps {
  open: boolean;
  rolUsuario: RolUsuario;
  promotores: Promotor[];
  /** Código @usuario del SP (desde sesión o leads propios del promotor). */
  codigoCargaFallback?: string;
  /** Dirección oficinas del supervisor (desde SP muestra / landing). */
  direccionOficinas?: string;
  onClose: () => void;
  onSave: (data: NuevoLeadData, promotorNombre?: string) => void | Promise<void>;
}

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15';

const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500';

const SECTION_CLASS = 'space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4';

function ToggleSiNo({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      {[
        { v: true, label: 'Sí' },
        { v: false, label: 'No' },
      ].map(({ v, label }) => {
        const sel = value === v;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(v)}
            style={{ touchAction: 'manipulation' }}
            className={`h-11 flex-1 rounded-lg border text-[14px] font-semibold transition-all duration-[120ms] active:scale-[0.98] ${
              sel
                ? 'border-brand-700 bg-brand-600 text-white'
                : 'border-zinc-200 bg-white text-zinc-700 active:bg-brand-50'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function NuevoLeadSheet({
  open,
  rolUsuario,
  promotores,
  codigoCargaFallback,
  direccionOficinas,
  onClose,
  onSave,
}: NuevoLeadSheetProps) {
  const { usuario } = useAuth();

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [promotorId, setPromotorId] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [agendarEntrevista, setAgendarEntrevista] = useState(false);
  const [horarioEntrevista, setHorarioEntrevista] = useState('');
  const [lugarEntrevista, setLugarEntrevista] = useState<LugarEntrevista | ''>('');
  const [domicilioEntrevista, setDomicilioEntrevista] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const esSupervisor = rolUsuario === 'supervisor';

  useEffect(() => {
    if (!open) return;
    setNombre('');
    setTelefono('');
    setDomicilio('');
    setAgendarEntrevista(false);
    setHorarioEntrevista('');
    setLugarEntrevista('');
    setDomicilioEntrevista('');
    setError('');
    setSaving(false);
    if (usuario) {
      setPromotorId(String(usuario.idOperador ?? usuario.id ?? '').trim());
    } else {
      setPromotorId('');
    }
  }, [open, usuario]);

  const direccionSucursalActiva =
    usuario?.sucursal?.trim() ||
    (esSupervisor
      ? direccionOficinas
      : promotores.find((p) => p.id === promotorId)?.direccionSucursal || direccionOficinas);

  useEffect(() => {
    if (lugarEntrevista === 'sucursal' && direccionSucursalActiva?.trim()) {
      setDomicilioEntrevista(direccionSucursalActiva.trim());
    }
  }, [lugarEntrevista, direccionSucursalActiva, promotorId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!telefono.trim()) {
      setError('El teléfono es obligatorio.');
      return;
    }
    if (!promotorId || !usuario) {
      setError('No se pudo identificar tu usuario. Volvé a iniciar sesión.');
      return;
    }
    if (agendarEntrevista) {
      if (!horarioEntrevista.trim()) {
        setError('Indicá fecha y hora de la entrevista.');
        return;
      }
      if (!lugarEntrevista) {
        setError('Indicá si la entrevista es en sucursal o a domicilio.');
        return;
      }
      if (lugarEntrevista === 'domicilio' && !domicilioEntrevista.trim() && !domicilio.trim()) {
        setError('Indicá el domicilio de la entrevista.');
        return;
      }
    }

    const idOperador = String(usuario.idOperador ?? usuario.id ?? '').trim();
    const promotorSel = esSupervisor
      ? undefined
      : promotores.find(
          (p) =>
            p.id === promotorId ||
            String(p.idVendedor ?? '') === promotorId ||
            String(p.idVendedor ?? '') === idOperador,
        );
    const promotorCodigo =
      usuario.codigoCarga?.trim() ||
      codigoCargaFallback?.trim() ||
      promotorSel?.codigoCarga?.trim() ||
      undefined;

    setSaving(true);
    setError('');
    try {
      const payload: NuevoLeadData = {
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        lista: agendarEntrevista ? 'entrevista' : 'contacto',
        quiereEntrevista: agendarEntrevista,
        agendarEntrevista,
        promotorId,
        promotorCodigo,
        promotorNombre: usuario.nombre,
        domicilio: domicilio.trim() || undefined,
        origen: 'manual',
      };
      if (agendarEntrevista) {
        payload.horarioEntrevista = horarioEntrevista;
        payload.lugarEntrevista = lugarEntrevista as LugarEntrevista;
        payload.domicilioEntrevista =
          lugarEntrevista === 'domicilio'
            ? (domicilioEntrevista.trim() || domicilio.trim())
            : undefined;
      }
      await onSave(payload, esSupervisor ? usuario.nombre : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

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
          style={{ maxHeight: 'min(94dvh, 760px)' }}
          aria-labelledby="nuevo-lead-title"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

          <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-4 pt-3">
            <div>
              <Drawer.Title
                id="nuevo-lead-title"
                className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900"
              >
                Carga manual de lead
              </Drawer.Title>
              <p className="mt-0.5 text-[13px] text-zinc-400">
                Datos del cliente; la entrevista es opcional
              </p>
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

          <form
            id="nuevo-lead-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5"
          >
            <div className="space-y-1.5">
              <label htmlFor="nl-nombre" className={LABEL_CLASS}>
                Nombre y apellido <span className="text-brand-600">*</span>
              </label>
              <input
                id="nl-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Juan Pérez"
                autoComplete="name"
                required
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="nl-telefono" className={LABEL_CLASS}>
                Teléfono <span className="text-brand-600">*</span>
              </label>
              <input
                id="nl-telefono"
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 3512 345678"
                autoComplete="tel"
                required
                className={INPUT_CLASS}
              />
            </div>

            <section className={SECTION_CLASS} aria-labelledby="nl-entrevista-title">
              <div>
                <h3 id="nl-entrevista-title" className="text-[13px] font-semibold text-zinc-900">
                  Entrevista
                </h3>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  Opcional — si no agendás, el lead queda para contactar después
                </p>
              </div>
              <div className="space-y-1.5">
                <p className={LABEL_CLASS}>¿Agendar entrevista ahora?</p>
                <ToggleSiNo value={agendarEntrevista} onChange={setAgendarEntrevista} />
              </div>

              {agendarEntrevista && (
                <div className="space-y-4 border-t border-zinc-200/80 pt-4">
                  <div className="space-y-1.5">
                    <p id="nl-horario-label" className={LABEL_CLASS}>
                      Fecha y hora <span className="text-brand-600">*</span>
                    </p>
                    <DateTimePicker
                      value={horarioEntrevista}
                      onChange={setHorarioEntrevista}
                      autoOpen={agendarEntrevista && !horarioEntrevista}
                      required
                      usePortal
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className={LABEL_CLASS}>
                      Lugar <span className="text-brand-600">*</span>
                    </p>
                    <div className="flex gap-2">
                      {(
                        [
                          { value: 'sucursal' as const, label: 'Sucursal' },
                          { value: 'domicilio' as const, label: 'A domicilio' },
                        ] as const
                      ).map((opt) => {
                        const sel = lugarEntrevista === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setLugarEntrevista(opt.value);
                              if (opt.value === 'sucursal' && direccionSucursalActiva?.trim()) {
                                setDomicilioEntrevista(direccionSucursalActiva.trim());
                              }
                            }}
                            style={{ touchAction: 'manipulation' }}
                            className={`h-11 flex-1 rounded-lg border text-[14px] font-semibold transition-all active:scale-[0.98] ${
                              sel
                                ? 'border-brand-700 bg-brand-600 text-white'
                                : 'border-zinc-200 bg-white text-zinc-700 active:bg-brand-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {lugarEntrevista === 'sucursal' && (
                    <div className="space-y-1.5">
                      <p className={LABEL_CLASS}>Dirección de nuestras oficinas</p>
                      <p className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-[14px] text-zinc-800">
                        {domicilioEntrevista.trim() ||
                          direccionSucursalActiva?.trim() ||
                          'No hay dirección de sucursal en el listado. Contactá soporte.'}
                      </p>
                    </div>
                  )}

                  {lugarEntrevista === 'domicilio' && (
                    <div className="space-y-1.5">
                      <label htmlFor="nl-dom-entrevista" className={LABEL_CLASS}>
                        Domicilio de la entrevista <span className="text-brand-600">*</span>
                      </label>
                      <input
                        id="nl-dom-entrevista"
                        type="text"
                        value={domicilioEntrevista}
                        onChange={(e) => setDomicilioEntrevista(e.target.value)}
                        placeholder={domicilio.trim() || 'Ej. Av. Colón 1234'}
                        className={INPUT_CLASS}
                      />
                      {domicilio.trim() && !domicilioEntrevista.trim() && (
                        <button
                          type="button"
                          onClick={() => setDomicilioEntrevista(domicilio)}
                          className="text-[12px] font-medium text-brand-600 underline-offset-2 hover:underline"
                        >
                          Usar el mismo domicilio del cliente
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {esSupervisor && usuario && (
              <div className="space-y-1.5">
                <p className={LABEL_CLASS}>Promotor</p>
                <div
                  className="flex h-12 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-[15px] font-medium text-zinc-800"
                  aria-readonly="true"
                >
                  {usuario.nombre}
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-500">
                  La carga queda a tu nombre; los promotores de tu equipo no verán este lead.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="nl-domicilio" className={LABEL_CLASS}>
                Domicilio del cliente{' '}
                <span className="normal-case font-normal text-zinc-400">(opcional)</span>
              </label>
              <input
                id="nl-domicilio"
                type="text"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                placeholder="Ej. Av. Colón 1234, Córdoba"
                autoComplete="street-address"
                className={INPUT_CLASS}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
                {error}
              </p>
            )}

            <div className="h-2" aria-hidden="true" />
          </form>

          <div
            className="shrink-0 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="submit"
              form="nuevo-lead-form"
              disabled={saving}
              style={{ touchAction: 'manipulation' }}
              className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98] disabled:opacity-50"
            >
              {saving
                ? 'Guardando…'
                : agendarEntrevista
                  ? 'Guardar y agendar entrevista'
                  : 'Guardar lead'}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
