import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import {
  ETIQUETAS_IMAGEN_CIERRE_PIJ,
  tiposFotosCierrePijFaltantes,
} from '../../domain/imagenes-cierre-pij';
import type {
  FormaPago,
  ImagenCierrePij,
  Lead,
  SeguimientoLead,
  TipoImagenCierrePij,
} from '../../types';
import { ID_PRODUCTO_PIJ } from '../../domain/venta';
import { ImagenesCierrePijFields } from './ImagenesCierrePijFields';

type Props = {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  /** Guarda solo fotos; no debe cambiar fecha de cierre. */
  onSave: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
};

/**
 * Modal dedicado: solo completar fotos de un cierre ya registrado.
 * No toca adhesión, montos ni fecha de cierre.
 */
export function CargarFotosFaltantesSheet({ open, lead, onClose, onSave }: Props) {
  const [imagenes, setImagenes] = useState<ImagenCierrePij[]>([]);
  const [slotsPedidos, setSlotsPedidos] = useState<TipoImagenCierrePij[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const formaPago =
    (lead?.seguimiento?.formaPago as FormaPago | null | undefined) ?? null;
  const fechaCierre = lead?.seguimiento?.fechaCierre ?? null;

  useEffect(() => {
    if (!open || !lead) return;
    const actuales = [...(lead.seguimiento?.imagenesCierre ?? [])];
    setImagenes(actuales);
    setSlotsPedidos(
      tiposFotosCierrePijFaltantes('principal', lead.seguimiento?.formaPago, actuales),
    );
    setError('');
    setGuardando(false);
  }, [open, lead]);

  const aunFaltan = lead
    ? tiposFotosCierrePijFaltantes('principal', formaPago, imagenes)
    : [];

  async function handleGuardar() {
    if (!lead) return;
    if (aunFaltan.length > 0) {
      setError(
        `Todavía falta: ${aunFaltan.map((t) => ETIQUETAS_IMAGEN_CIERRE_PIJ[t]).join(' · ')}.`,
      );
      return;
    }
    const base = lead.seguimiento ?? {};
    const seguimiento: SeguimientoLead = {
      ...base,
      resultadoEntrevista: 'compro',
      idProducto: base.idProducto ?? ID_PRODUCTO_PIJ,
      estadoPago: base.estadoPago ?? 'entrega_33',
      numeroRecibo: base.numeroRecibo ?? null,
      formaPago: base.formaPago ?? formaPago,
      dniCliente: base.dniCliente ?? null,
      montoCierre: base.montoCierre ?? null,
      montoEfectivo: base.montoEfectivo ?? null,
      montoTransferencia: base.montoTransferencia ?? null,
      fechaCierre: base.fechaCierre ?? null,
      comprasAdicionales: base.comprasAdicionales ?? null,
      imagenesCierre: imagenes.length > 0 ? imagenes : null,
    };
    setError('');
    setGuardando(true);
    try {
      await onSave(lead.id, seguimiento);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las fotos.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      shouldScaleBackground
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ maxHeight: 'min(92dvh, 760px)' }}
          aria-labelledby="sheet-fotos-faltantes-title"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

          <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-3 pt-3">
            <div className="min-w-0 flex-1 pr-2">
              <Drawer.Title
                id="sheet-fotos-faltantes-title"
                className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-900"
              >
                Cargar fotos faltantes
              </Drawer.Title>
              <p className="mt-0.5 truncate text-[13px] text-zinc-500">
                {lead?.nombre ?? 'Lead'}
              </p>
              {fechaCierre && (
                <p className="mt-1 text-[12px] text-zinc-500">
                  La fecha de cierre no se modifica.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-[13px] font-medium text-zinc-500 active:bg-zinc-100"
            >
              Cerrar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {lead && slotsPedidos.length > 0 && (
              <ImagenesCierrePijFields
                leadId={lead.id}
                ventaKey="principal"
                formaPago={formaPago}
                imagenes={imagenes}
                editable
                soloTipos={slotsPedidos}
                titulo="Fotos pendientes"
                ayuda="Subí solo lo que falta. Al guardar se reenvían a caja y la fecha de cierre se mantiene."
                onChange={(next) => {
                  setError('');
                  setImagenes(next);
                }}
              />
            )}
            {lead && slotsPedidos.length === 0 && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900">
                No faltan fotos en este cierre.
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
                {error}
              </p>
            )}
          </div>

          <div
            className="shrink-0 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              disabled={guardando || !lead || slotsPedidos.length === 0}
              onClick={() => void handleGuardar()}
              style={{ touchAction: 'manipulation' }}
              className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:scale-[0.98] active:bg-brand-800 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar fotos'}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
