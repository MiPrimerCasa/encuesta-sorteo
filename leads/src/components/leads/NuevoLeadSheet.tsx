import { useEffect, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import { useAuth } from '../../context/AuthContext';
import type { NuevoLeadData, Promotor, RolUsuario } from '../../types';

interface NuevoLeadSheetProps {
  open: boolean;
  rolUsuario: RolUsuario;
  promotores: Promotor[];
  onClose: () => void;
  onSave: (data: NuevoLeadData) => void | Promise<void>;
}

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15';

const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500';

function ToggleGroup({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const sel = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            name={name}
            onClick={() => onChange(opt.value)}
            style={{ touchAction: 'manipulation' }}
            className={`h-11 flex-1 rounded-lg border text-[14px] font-medium transition-all duration-[120ms] ease-out active:scale-[0.98] ${
              sel
                ? 'border-brand-700 bg-brand-600 text-white'
                : 'border-zinc-200 bg-white text-zinc-700 active:bg-brand-50 active:border-brand-400 active:text-brand-700'
            }`}
          >
            {opt.label}
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
  onClose,
  onSave,
}: NuevoLeadSheetProps) {
  const { usuario } = useAuth();

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [lista, setLista] = useState<'entrevista' | 'contacto'>('entrevista');
  const [promotorId, setPromotorId] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pre-seleccionar promotor cuando abre
  useEffect(() => {
    if (!open) return;
    setNombre('');
    setTelefono('');
    setLista('entrevista');
    setDomicilio('');
    setError('');
    setSaving(false);
    if (rolUsuario === 'promotor' && usuario) {
      setPromotorId(usuario.id);
    } else {
      setPromotorId(promotores[0]?.id ?? '');
    }
  }, [open, rolUsuario, usuario, promotores]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!telefono.trim()) { setError('El teléfono es obligatorio.'); return; }
    if (!promotorId) { setError('Seleccioná un promotor.'); return; }

    setSaving(true);
    setError('');
    try {
      await onSave({
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        lista,
        quiereEntrevista: lista === 'entrevista',
        promotorId,
        domicilio: domicilio.trim() || undefined,
      });
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
          style={{ maxHeight: 'min(92dvh, 680px)' }}
          aria-labelledby="nuevo-lead-title"
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

          {/* Header */}
          <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-4 pt-3">
            <div>
              <Drawer.Title
                id="nuevo-lead-title"
                className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900"
              >
                Agendar cliente
              </Drawer.Title>
              <p className="mt-0.5 text-[13px] text-zinc-400">
                Completá los datos del nuevo lead
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ touchAction: 'manipulation' }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-xl text-zinc-500 transition-colors active:bg-brand-50 active:text-brand-700"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          {/* Form */}
          <form
            id="nuevo-lead-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5"
          >
            {/* Nombre */}
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

            {/* Teléfono */}
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

            {/* Lista / tipo */}
            <div className="space-y-1.5">
              <p className={LABEL_CLASS}>¿Quiere entrevista?</p>
              <ToggleGroup
                name="lista"
                options={[
                  { value: 'entrevista', label: 'Sí — Nuevo lead' },
                  { value: 'contacto', label: 'No — Contactado' },
                ]}
                value={lista}
                onChange={(v) => setLista(v as 'entrevista' | 'contacto')}
              />
            </div>

            {/* Promotor — solo supervisor */}
            {rolUsuario === 'supervisor' && promotores.length > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="nl-promotor" className={LABEL_CLASS}>
                  Promotor <span className="text-brand-600">*</span>
                </label>
                <select
                  id="nl-promotor"
                  value={promotorId}
                  onChange={(e) => setPromotorId(e.target.value)}
                  required
                  className={`${INPUT_CLASS} cursor-pointer`}
                >
                  <option value="" disabled>
                    Seleccioná un promotor…
                  </option>
                  {promotores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Domicilio (opcional) */}
            <div className="space-y-1.5">
              <label htmlFor="nl-domicilio" className={LABEL_CLASS}>
                Domicilio{' '}
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

            <div className="h-4" aria-hidden="true" />
          </form>

          {/* Footer sticky */}
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
              {saving ? 'Guardando…' : 'Agendar cliente'}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
