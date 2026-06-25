import { useEffect, useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import type { Lead, Referido, SeguimientoLead } from '../../types';

interface AgregarReferidosSheetProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSave: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
}

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15';

const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500';

const emptyReferido = (): Referido => ({ nombre: '', telefono: '' });

export function AgregarReferidosSheet({
  lead,
  open,
  onClose,
  onSave,
}: AgregarReferidosSheetProps) {
  const [referidos, setReferidos] = useState<Referido[]>([emptyReferido()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (open) {
      // Precargar referidos ya existentes del lead (sin los ya procesados)
      const existentes = lead?.seguimiento?.referidos;
      setReferidos(existentes?.length ? [...existentes, emptyReferido()] : [emptyReferido()]);
      setError('');
      setSuccessMsg('');
      setSaving(false);
    }
  }, [open, lead]);

  if (!open || !lead) return null;

  const updateReferido = (i: number, field: keyof Referido, value: string) => {
    setReferidos((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r));
      // Agregar fila vacía automáticamente al escribir en la última
      const last = next[next.length - 1];
      if (i === next.length - 1 && (last.nombre.trim() || last.telefono.trim())) {
        return [...next, emptyReferido()];
      }
      return next;
    });
  };

  const removeReferido = (i: number) => {
    setReferidos((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length === 0 ? [emptyReferido()] : next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const validos = referidos.filter((r) => r.nombre.trim() || r.telefono.trim());
    if (validos.length === 0) {
      setError('Ingresá al menos un referido con nombre o teléfono.');
      return;
    }

    // Construir seguimiento que preserva el estado actual del lead
    // y agrega los referidos nuevos
    const seg = lead.seguimiento ?? {};
    const seguimiento: SeguimientoLead = {
      fuente: seg.fuente,
      confirmoEntrevista: seg.confirmoEntrevista ?? null,
      canal: seg.canal ?? null,
      huboEntrevista: seg.huboEntrevista ?? null,
      resultadoEntrevista: seg.resultadoEntrevista ?? null,
      fechaReagenda: seg.fechaReagenda ?? null,
      fechaCierre: seg.fechaCierre ?? null,
      seguimientoPijPromotor: seg.seguimientoPijPromotor ?? false,
      seguimientoAgendaOperadorRol: seg.seguimientoAgendaOperadorRol ?? null,
      horarioEntrevistaPropuesto: seg.horarioEntrevistaPropuesto ?? null,
      idProducto: seg.idProducto ?? null,
      estadoPago: seg.estadoPago ?? null,
      idBarrio: seg.idBarrio ?? null,
      numeroRecibo: seg.numeroRecibo ?? null,
      observaciones: seg.observaciones ?? '',
      comprasAdicionales: seg.comprasAdicionales ?? null,
      // Referidos nuevos:
      brindoReferidos: true,
      referidos: validos,
    };

    setSaving(true);
    try {
      await onSave(lead.id, seguimiento);
      setSuccessMsg(`${validos.length} referido(s) enviados correctamente.`);
      setReferidos([emptyReferido()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar referidos.');
    } finally {
      setSaving(false);
    }
  };

  const tieneDatos = referidos.some((r) => r.nombre.trim() || r.telefono.trim());

  return (
    <Drawer.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ maxHeight: 'min(90dvh, 620px)' }}
          aria-labelledby="agregar-referidos-title"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

          <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-4 pt-3">
            <div>
              <Drawer.Title
                id="agregar-referidos-title"
                className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900"
              >
                Agregar referidos
              </Drawer.Title>
              <p className="mt-0.5 text-[13px] text-zinc-400">
                {lead.nombre}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ touchAction: 'manipulation' }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <form
            id="agregar-referidos-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5"
          >
            <p className="text-[13px] text-zinc-500">
              Ingresá los datos de los clientes que este lead refirió. Se cargarán como nuevos leads en el sistema.
            </p>

            <div className="space-y-3">
              {referidos.map((ref, i) => {
                const esUltima = i === referidos.length - 1;
                const tieneContenido = ref.nombre.trim() || ref.telefono.trim();
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className={LABEL_CLASS}>Referido {i + 1}</p>
                      {(!esUltima || tieneContenido) && referidos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeReferido(i)}
                          style={{ touchAction: 'manipulation' }}
                          className="text-[12px] font-medium text-red-500 hover:text-red-700"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`ref-nombre-${i}`} className={LABEL_CLASS}>
                        Nombre
                      </label>
                      <input
                        id={`ref-nombre-${i}`}
                        type="text"
                        value={ref.nombre}
                        onChange={(e) => updateReferido(i, 'nombre', e.target.value)}
                        placeholder="Nombre y apellido"
                        autoComplete="off"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`ref-tel-${i}`} className={LABEL_CLASS}>
                        Teléfono
                      </label>
                      <input
                        id={`ref-tel-${i}`}
                        type="tel"
                        inputMode="tel"
                        value={ref.telefono}
                        onChange={(e) => updateReferido(i, 'telefono', e.target.value)}
                        placeholder="Ej. 3512 345678"
                        autoComplete="off"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                );
              })}
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

            <div className="h-2" aria-hidden="true" />
          </form>

          <div
            className="shrink-0 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="submit"
              form="agregar-referidos-form"
              disabled={saving || !tieneDatos}
              style={{ touchAction: 'manipulation' }}
              className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98] disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Cargar referidos'}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
