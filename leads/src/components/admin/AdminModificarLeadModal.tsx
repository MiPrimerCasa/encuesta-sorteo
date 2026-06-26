import { useEffect, useState, type FormEvent } from 'react';
import type { Lead } from '../../types';
import type { ModificarDatosLeadPayload } from '../../api/client';
import { DateTimePicker } from '../ui/DateTimePicker';

interface AdminModificarLeadModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSave: (leadId: string, datos: ModificarDatosLeadPayload) => Promise<void>;
}

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[14px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15';

const LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 mb-1.5';

type TriState = 'si' | 'no' | 'null';

function TriToggle({
  value,
  onChange,
  idPrefix,
}: {
  value: TriState;
  onChange: (v: TriState) => void;
  idPrefix: string;
}) {
  const opts: { v: TriState; label: string }[] = [
    { v: 'si', label: 'Sí' },
    { v: 'no', label: 'No' },
    { v: 'null', label: 'Sin info' },
  ];
  return (
    <div className="flex gap-2">
      {opts.map(({ v, label }) => (
        <button
          key={v}
          id={`${idPrefix}-${v}`}
          type="button"
          onClick={() => onChange(v)}
          style={{ touchAction: 'manipulation' }}
          className={`h-10 flex-1 rounded-lg border text-[13px] font-semibold transition-all duration-[100ms] active:scale-[0.98] ${
            value === v
              ? 'border-brand-700 bg-brand-600 text-white'
              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function triStateToBoolean(v: TriState): boolean | null {
  if (v === 'si') return true;
  if (v === 'no') return false;
  return null;
}

function booleanToTriState(v: boolean | null | undefined): TriState {
  if (v === true) return 'si';
  if (v === false) return 'no';
  return 'null';
}

export function AdminModificarLeadModal({
  lead,
  open,
  onClose,
  onSave,
}: AdminModificarLeadModalProps) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [conoceMpc, setConoceMpc] = useState<TriState>('null');
  const [sabiaPij, setSabiaPij] = useState<TriState>('null');
  const [quiereEntrevista, setQuiereEntrevista] = useState(false);
  const [horario, setHorario] = useState('');
  const [lugar, setLugar] = useState<'sucursal' | 'domicilio' | ''>('');
  const [domicilioEntrevista, setDomicilioEntrevista] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (open && lead) {
      setNombre(lead.nombre ?? '');
      setTelefono(lead.telefono ?? '');
      setDomicilio(lead.domicilio ?? '');
      setConoceMpc(booleanToTriState(lead.conoceMpc));
      setSabiaPij(booleanToTriState(lead.sabiaPlanInversionJoven));
      const agendar = Boolean(lead.quiereEntrevista || lead.horarioEntrevista);
      setQuiereEntrevista(agendar);
      setHorario(lead.horarioEntrevista ?? '');
      setLugar((lead.lugarEntrevista as 'sucursal' | 'domicilio' | '') ?? '');
      setDomicilioEntrevista(lead.domicilioEntrevista ?? '');
      setError('');
      setSuccessMsg('');
      setSaving(false);
    }
  }, [open, lead]);

  if (!open || !lead) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!telefono.trim()) {
      setError('El teléfono es obligatorio.');
      return;
    }
    if (quiereEntrevista && !horario.trim()) {
      setError('Si quiere entrevista, indicá la fecha y hora.');
      return;
    }
    if (quiereEntrevista && !lugar) {
      setError('Si quiere entrevista, indicá el lugar.');
      return;
    }

    const datos: ModificarDatosLeadPayload = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      domicilio: domicilio.trim() || undefined,
      conoceMpc: triStateToBoolean(conoceMpc),
      sabiaPlanInversionJoven: triStateToBoolean(sabiaPij),
      quiereEntrevista,
      horarioEntrevista: quiereEntrevista ? horario : undefined,
      lugarEntrevista: quiereEntrevista && lugar ? lugar : undefined,
      domicilioEntrevista:
        quiereEntrevista && lugar === 'domicilio' ? domicilioEntrevista.trim() : undefined,
    };

    setSaving(true);
    try {
      await onSave(lead.id, datos);
      setSuccessMsg('Lead actualizado correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-50 flex max-h-[92dvh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">
              Modificar lead
            </h3>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              #{lead.id} · {lead.promotorNombre || 'Sin promotor'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[20px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form
          id="modificar-lead-form"
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5"
        >
          {/* Nombre */}
          <div>
            <label htmlFor="ml-nombre" className={LABEL_CLASS}>
              Nombre y apellido <span className="text-brand-600">*</span>
            </label>
            <input
              id="ml-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={INPUT_CLASS}
              autoComplete="off"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label htmlFor="ml-telefono" className={LABEL_CLASS}>
              Teléfono <span className="text-brand-600">*</span>
            </label>
            <input
              id="ml-telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={INPUT_CLASS}
              autoComplete="off"
            />
          </div>

          {/* Domicilio */}
          <div>
            <label htmlFor="ml-domicilio" className={LABEL_CLASS}>
              Domicilio{' '}
              <span className="normal-case font-normal text-zinc-400">(opcional)</span>
            </label>
            <input
              id="ml-domicilio"
              type="text"
              value={domicilio}
              onChange={(e) => setDomicilio(e.target.value)}
              placeholder="Ej. Av. Colón 1234, Córdoba"
              className={INPUT_CLASS}
              autoComplete="off"
            />
          </div>

          {/* Conocía MPC */}
          <div>
            <p className={LABEL_CLASS}>¿Conocía Mi Primer Casa?</p>
            <TriToggle value={conoceMpc} onChange={setConoceMpc} idPrefix="ml-mpc" />
          </div>

          {/* Sabía PIJ */}
          <div>
            <p className={LABEL_CLASS}>¿Sabía del Plan Inversión Joven?</p>
            <TriToggle value={sabiaPij} onChange={setSabiaPij} idPrefix="ml-pij" />
          </div>

          {/* Quiere entrevista */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 space-y-4">
            <div>
              <p className={LABEL_CLASS}>¿Quiere entrevista?</p>
              <div className="flex gap-2">
                {[
                  { v: true, label: 'Sí' },
                  { v: false, label: 'No' },
                ].map(({ v, label }) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setQuiereEntrevista(v)}
                    style={{ touchAction: 'manipulation' }}
                    className={`h-10 flex-1 rounded-lg border text-[13px] font-semibold transition-all active:scale-[0.98] ${
                      quiereEntrevista === v
                        ? 'border-brand-700 bg-brand-600 text-white'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {quiereEntrevista && (
              <div className="space-y-4 border-t border-zinc-200/80 pt-4">
                {/* Horario */}
                <div>
                  <p id="ml-horario-label" className={LABEL_CLASS}>
                    Fecha y hora <span className="text-brand-600">*</span>
                  </p>
                  <DateTimePicker
                    value={horario}
                    onChange={setHorario}
                    autoOpen={quiereEntrevista && !horario}
                    required
                    usePortal
                  />
                </div>

                {/* Lugar */}
                <div>
                  <p className={LABEL_CLASS}>
                    Lugar <span className="text-brand-600">*</span>
                  </p>
                  <div className="flex gap-2">
                    {[
                      { v: 'sucursal' as const, label: 'Sucursal' },
                      { v: 'domicilio' as const, label: 'A domicilio' },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setLugar(opt.v)}
                        style={{ touchAction: 'manipulation' }}
                        className={`h-10 flex-1 rounded-lg border text-[13px] font-semibold transition-all active:scale-[0.98] ${
                          lugar === opt.v
                            ? 'border-brand-700 bg-brand-600 text-white'
                            : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Domicilio entrevista */}
                {lugar === 'domicilio' && (
                  <div>
                    <label htmlFor="ml-dom-entrevista" className={LABEL_CLASS}>
                      Domicilio de la entrevista{' '}
                      <span className="text-brand-600">*</span>
                    </label>
                    <input
                      id="ml-dom-entrevista"
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
                        className="mt-1 text-[12px] font-medium text-brand-600 underline-offset-2 hover:underline"
                      >
                        Usar domicilio del cliente
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
              {error}
            </p>
          )}

          {successMsg && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] font-medium text-emerald-700">
              ✓ {successMsg}
            </p>
          )}

          <div className="h-1" aria-hidden="true" />
        </form>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-100 bg-zinc-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-[0.98]"
          >
            Cerrar
          </button>
          <button
            type="submit"
            form="modificar-lead-form"
            disabled={saving}
            style={{ touchAction: 'manipulation' }}
            className="rounded-lg bg-brand-600 px-5 py-2 text-[13px] font-semibold text-white transition-all duration-[100ms] hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
