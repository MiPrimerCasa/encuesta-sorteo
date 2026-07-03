import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import { useAuth } from '../../context/AuthContext';
import { verificarTelefonoCarga } from '../../api/client';
import {
  formatearTelefonoCargaDisplay,
  normalizarTelefonoCarga,
  sanitizarInputTelefonoCarga,
  telefonoCargaEsValido,
  telefonoCargaTieneLongitudMinima,
  telefonoListoParaVerificarCarga,
} from '../../domain/telefono-carga';
import type { LugarEntrevista, NuevoLeadData, NuevoLeadSaveOptions, Promotor, RolUsuario, VerificarTelefonoCargaResult } from '../../types';
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
  onSave: (data: NuevoLeadData, options?: NuevoLeadSaveOptions) => void | Promise<void>;
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

function IconoWhatsApp({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
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
  const [verificando, setVerificando] = useState(false);
  const [verificacion, setVerificacion] = useState<VerificarTelefonoCargaResult | null>(null);

  const esSupervisor = rolUsuario === 'supervisor';
  const telefonoDigitos = sanitizarInputTelefonoCarga(telefono);
  const telefonoDisplay = formatearTelefonoCargaDisplay(telefonoDigitos);
  const telefonoNormalizado = telefonoDigitos ? normalizarTelefonoCarga(telefonoDigitos) : '';
  const telefonoVerificadoDisponible = verificacion?.disponible === true;
  const telefonoVerificadoOcupado =
    verificacion != null && !verificacion.disponible && !verificacion.invalido;
  const puedeGuardar = telefonoVerificadoDisponible && !saving && !verificando;
  const verifySeqRef = useRef(0);

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
    setVerificacion(null);
    setVerificando(false);
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

  useEffect(() => {
    if (!open) return;

    if (!telefonoListoParaVerificarCarga(telefonoDigitos)) {
      setVerificacion(null);
      setVerificando(false);
      return;
    }

    setVerificacion(null);
    setVerificando(true);
    const seq = ++verifySeqRef.current;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const resultado = await verificarTelefonoCarga(telefonoNormalizado);
          if (seq !== verifySeqRef.current) return;
          setVerificacion(resultado);
          if (resultado.invalido) {
            setError(resultado.mensaje || 'Teléfono inválido.');
          } else {
            setError((prev) =>
              prev === 'No se pudo verificar el teléfono.' || prev.includes('verificación')
                ? ''
                : prev,
            );
          }
        } catch (err) {
          if (seq !== verifySeqRef.current) return;
          setError(err instanceof Error ? err.message : 'No se pudo verificar el teléfono.');
          setVerificacion(null);
        } finally {
          if (seq === verifySeqRef.current) setVerificando(false);
        }
      })();
    }, 500);

    return () => {
      window.clearTimeout(timer);
      verifySeqRef.current += 1;
    };
  }, [open, telefonoDigitos, telefonoNormalizado]);

  const handleSave = async (contactar: boolean) => {
    if (verificando) {
      setError('Esperá a que termine la verificación del teléfono.');
      return;
    }
    if (!telefonoVerificadoDisponible) {
      setError('El teléfono debe estar disponible para guardar.');
      return;
    }
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!telefonoCargaTieneLongitudMinima(telefonoDigitos) || !telefonoCargaEsValido(telefonoDigitos)) {
      setError('El teléfono es obligatorio y debe ser válido.');
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
        telefono: telefonoNormalizado,
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
      await onSave(payload, {
        promotorNombre: esSupervisor ? usuario.nombre : undefined,
        contactar,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSave(false);
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
              <div className="relative">
                <input
                  id="nl-telefono"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  value={telefonoDisplay}
                  onChange={(e) => {
                    setTelefono(sanitizarInputTelefonoCarga(e.target.value));
                    setError('');
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text');
                    setTelefono(sanitizarInputTelefonoCarga(pasted));
                    setError('');
                  }}
                  placeholder="Ej. 3705 123456 o 5493705123456"
                  autoComplete="tel"
                  required
                  aria-invalid={telefonoVerificadoOcupado || Boolean(verificacion?.invalido)}
                  className={`${INPUT_CLASS} w-full pr-10 ${
                    telefonoVerificadoDisponible
                      ? 'border-emerald-400 bg-emerald-50/40 focus:border-emerald-500 focus:ring-emerald-500/15'
                      : telefonoVerificadoOcupado
                        ? 'border-amber-400 bg-amber-50/40 focus:border-amber-500 focus:ring-amber-500/15'
                        : verificando
                          ? 'border-brand-200 bg-brand-50/30'
                          : ''
                  }`}
                />
                {verificando && (
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-brand-600"
                    aria-live="polite"
                  >
                    …
                  </span>
                )}
                {!verificando && telefonoVerificadoDisponible && (
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600"
                    aria-hidden="true"
                    title="Disponible"
                  >
                    ✓
                  </span>
                )}
                {!verificando && telefonoVerificadoOcupado && (
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-600"
                    aria-hidden="true"
                    title="Ya registrado"
                  >
                    !
                  </span>
                )}
              </div>
              {telefonoDigitos && telefonoNormalizado && telefonoNormalizado !== telefonoDigitos && (
                <p className="text-[12px] text-zinc-500">
                  Se normalizará como: <strong className="font-semibold text-zinc-700">{telefonoNormalizado}</strong>
                </p>
              )}
              {telefonoDigitos && !telefonoListoParaVerificarCarga(telefonoDigitos) && (
                <p className="text-[12px] text-zinc-400">
                  {telefonoCargaTieneLongitudMinima(telefonoDigitos)
                    ? 'Completá el número para verificar disponibilidad.'
                    : 'Mínimo 8 dígitos (solo números).'}
                </p>
              )}
              {verificando && telefonoListoParaVerificarCarga(telefonoDigitos) && (
                <p className="text-[12px] font-medium text-brand-700">Verificando disponibilidad…</p>
              )}
              {verificacion?.disponible && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
                  {verificacion.mensaje || 'Número disponible — podés guardar el lead.'}
                </p>
              )}
              {verificacion && !verificacion.disponible && !verificacion.invalido && verificacion.existente && (
                <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-950">
                  <p className="font-semibold">Este número ya está registrado</p>
                  <p className="mt-1">
                    Cliente: <strong>{verificacion.existente.nombreCliente}</strong>
                  </p>
                  <p>
                    Cargado por: <strong>{verificacion.existente.cargadoPor}</strong>
                    {verificacion.existente.supervisorNombre
                      ? ` · Equipo: ${verificacion.existente.supervisorNombre}`
                      : ''}
                  </p>
                  {verificacion.existente.fechaAlta && (
                    <p className="mt-0.5 text-[12px] text-amber-800/90">
                      Alta:{' '}
                      {new Date(verificacion.existente.fechaAlta).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {verificacion.existente.origen ? ` · ${verificacion.existente.origen}` : ''}
                    </p>
                  )}
                </div>
              )}
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
            className="shrink-0 space-y-2 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <div className="flex gap-2">
              <button
                type="submit"
                form="nuevo-lead-form"
                disabled={!puedeGuardar}
                style={{ touchAction: 'manipulation' }}
                className="flex h-[52px] flex-1 items-center justify-center rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98] disabled:opacity-50"
              >
                {saving
                  ? 'Guardando…'
                  : agendarEntrevista
                    ? 'Guardar y agendar'
                    : 'Guardar lead'}
              </button>
              <button
                type="button"
                disabled={!puedeGuardar}
                onClick={() => void handleSave(true)}
                style={{ touchAction: 'manipulation' }}
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-[15px] font-semibold text-white shadow-sm transition-all duration-[120ms] ease-out active:scale-[0.98] active:bg-[#1da851] disabled:opacity-50"
              >
                <IconoWhatsApp />
                {saving ? 'Guardando…' : 'Guardar y contactar'}
              </button>
            </div>
            <p className="text-center text-[11px] leading-relaxed text-zinc-400">
              El teléfono se verifica solo al completarlo. «Guardar y contactar» carga el lead, lo marca como contactado y abre WhatsApp.
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
