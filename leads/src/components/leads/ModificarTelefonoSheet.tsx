import { useEffect, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import type { Lead } from '../../types';
import {
  extraerDigitosTelefono,
  formatearTelefonoCargaDisplay,
  normalizarTelefonoCarga,
  telefonoCargaEsValido,
  telefonoCargaTieneLongitudMinima,
} from '../../domain/telefono-carga';

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15';

interface ModificarTelefonoSheetProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSave: (leadId: string, telefono: string) => void | Promise<void>;
}

export function ModificarTelefonoSheet({
  lead,
  open,
  onClose,
  onSave,
}: ModificarTelefonoSheetProps) {
  const [telefonoDigits, setTelefonoDigits] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !lead) return;
    setTelefonoDigits(extraerDigitosTelefono(lead.telefono ?? ''));
    setError('');
    setSaving(false);
  }, [open, lead]);

  const telefonoDisplay = formatearTelefonoCargaDisplay(telefonoDigits);
  const puedeGuardar =
    telefonoCargaTieneLongitudMinima(telefonoDigits) &&
    telefonoCargaEsValido(telefonoDigits) &&
    !saving;

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!lead || saving) return;

    if (!telefonoCargaTieneLongitudMinima(telefonoDigits)) {
      setError('Ingresá un teléfono válido (mínimo 8 dígitos).');
      return;
    }
    if (!telefonoCargaEsValido(telefonoDigits)) {
      setError('Revisá el número: no parece un teléfono válido.');
      return;
    }

    const telefonoNorm = normalizarTelefonoCarga(telefonoDigits);
    const actualDigits = extraerDigitosTelefono(lead.telefono ?? '');
    if (
      telefonoNorm === normalizarTelefonoCarga(actualDigits) ||
      telefonoNorm === actualDigits
    ) {
      setError('El número es el mismo que ya tiene el lead. Cambialo para guardar.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave(lead.id, telefonoNorm);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ maxHeight: 'min(70dvh, 420px)' }}
          aria-labelledby="modificar-telefono-title"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-300" />
          <div className="border-b border-zinc-100 px-4 py-3">
            <Drawer.Title
              id="modificar-telefono-title"
              className="text-[17px] font-semibold text-zinc-900"
            >
              Modificar número
            </Drawer.Title>
            {lead && (
              <p className="mt-1 text-[13px] text-zinc-500">
                {lead.nombre} · carga manual
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                  Teléfono
                </span>
                <input
                  type="tel"
                  value={telefonoDisplay}
                  onChange={(e) =>
                    setTelefonoDigits(extraerDigitosTelefono(e.target.value))
                  }
                  inputMode="numeric"
                  autoComplete="tel"
                  className={`${INPUT_CLASS} mt-1.5`}
                  placeholder="Ej. 3704123456"
                />
              </label>
              <p className="mt-1.5 text-[12px] text-zinc-500">
                Solo números. Mínimo 8 dígitos.
              </p>
              {error && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                  {error}
                </p>
              )}
            </div>

            <div
              className="shrink-0 border-t border-zinc-100 px-4 pt-3"
              style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
            >
              <button
                type="submit"
                disabled={!puedeGuardar}
                style={{ touchAction: 'manipulation' }}
                className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all active:bg-brand-800 disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar número'}
              </button>
            </div>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
