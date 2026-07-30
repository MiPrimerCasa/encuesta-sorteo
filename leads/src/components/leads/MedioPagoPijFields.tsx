import type { FormaPago } from '../../types';
import {
  MONTO_ADHESION_PIJ,
  complementoMontoMixtoPij,
  formatearMontoArs,
  limitarMontoPijInput,
  opcionesFormaPago,
} from '../../domain/venta';

interface Props {
  formaPago: FormaPago | null;
  montoEfectivo: string;
  montoTransferencia: string;
  /** Nombre del lead/cliente (apellido y nombre) para autocompletar titular. */
  nombreCliente?: string;
  /** null = sin responder; true = coincide; false = otro titular. */
  titularCoincideCliente?: boolean | null;
  titularTransferencia?: string;
  onFormaPago: (value: FormaPago) => void;
  onMontoEfectivo: (value: string) => void;
  onMontoTransferencia: (value: string) => void;
  onTitularCoincideCliente?: (value: boolean) => void;
  onTitularTransferencia?: (value: string) => void;
  compact?: boolean;
}

export function MedioPagoPijFields({
  formaPago,
  montoEfectivo,
  montoTransferencia,
  nombreCliente = '',
  titularCoincideCliente = null,
  titularTransferencia = '',
  onFormaPago,
  onMontoEfectivo,
  onMontoTransferencia,
  onTitularCoincideCliente,
  onTitularTransferencia,
  compact = false,
}: Props) {
  const btnClass = compact ? 'h-10 text-[13px]' : 'h-12 text-[15px]';
  const inputClass = compact ? 'h-10 text-[14px]' : 'h-12 text-base';
  const showTrf =
    (formaPago === 'transferencia' || formaPago === 'mixto') &&
    Boolean(onTitularCoincideCliente && onTitularTransferencia);

  const onEfectivoMixto = (raw: string) => {
    const value = limitarMontoPijInput(raw);
    onMontoEfectivo(value);
    onMontoTransferencia(complementoMontoMixtoPij(value));
  };

  const onTransferenciaMixto = (raw: string) => {
    const value = limitarMontoPijInput(raw);
    onMontoTransferencia(value);
    onMontoEfectivo(complementoMontoMixtoPij(value));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
          ¿Cómo pagó los {formatearMontoArs(MONTO_ADHESION_PIJ)}?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {opcionesFormaPago().map((op) => {
            const sel = formaPago === op.value;
            return (
              <button
                key={op.value}
                type="button"
                onClick={() => {
                  onFormaPago(op.value);
                  if (op.value === 'efectivo') {
                    onMontoEfectivo(String(MONTO_ADHESION_PIJ));
                    onMontoTransferencia('');
                  } else if (op.value === 'transferencia') {
                    onMontoTransferencia(String(MONTO_ADHESION_PIJ));
                    onMontoEfectivo('');
                  } else {
                    onMontoEfectivo('');
                    onMontoTransferencia('');
                  }
                }}
                style={{ touchAction: 'manipulation' }}
                className={`flex-1 rounded-lg border px-3 font-medium transition-all duration-[140ms] ease-out ${btnClass} ${
                  sel
                    ? 'border-brand-700 bg-brand-600 text-white active:bg-brand-700'
                    : 'border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
                }`}
              >
                {op.label}
              </button>
            );
          })}
        </div>
      </div>

      {formaPago === 'efectivo' && (
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Monto en efectivo
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={montoEfectivo}
            onChange={(e) => onMontoEfectivo(limitarMontoPijInput(e.target.value))}
            placeholder={String(MONTO_ADHESION_PIJ)}
            className={`w-full rounded-lg border border-zinc-200 bg-white px-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-600/15 ${inputClass}`}
          />
        </div>
      )}

      {formaPago === 'transferencia' && (
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Monto transferido
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={montoTransferencia}
            onChange={(e) => onMontoTransferencia(limitarMontoPijInput(e.target.value))}
            placeholder={String(MONTO_ADHESION_PIJ)}
            className={`w-full rounded-lg border border-zinc-200 bg-white px-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-600/15 ${inputClass}`}
          />
        </div>
      )}

      {formaPago === 'mixto' && (
        <div className="space-y-3 rounded-lg border border-brand-100 bg-white p-3">
          <p className="text-[12px] text-zinc-600">
            Total del cierre: <strong>{formatearMontoArs(MONTO_ADHESION_PIJ)}</strong>
            . Al cargar un monto, el otro se completa solo (máx. $33.000).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Efectivo
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={montoEfectivo}
                onChange={(e) => onEfectivoMixto(e.target.value)}
                placeholder="0"
                className={`w-full rounded-lg border border-zinc-200 bg-white px-3 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-600 ${inputClass}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Transferencia
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={montoTransferencia}
                onChange={(e) => onTransferenciaMixto(e.target.value)}
                placeholder="0"
                className={`w-full rounded-lg border border-zinc-200 bg-white px-3 tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-600 ${inputClass}`}
              />
            </div>
          </div>
          {(montoEfectivo || montoTransferencia) && (
            <p className="text-[12px] font-medium text-brand-800">
              Suma:{' '}
              {formatearMontoArs(
                (Number(montoEfectivo) || 0) + (Number(montoTransferencia) || 0),
              )}
            </p>
          )}
        </div>
      )}

      {showTrf && (
        <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Datos de transferencia (caja)
          </p>
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-zinc-800">
              ¿El titular de la transferencia coincide con el cliente?
            </p>
            {nombreCliente.trim() ? (
              <p className="text-[12px] text-zinc-500">Cliente: {nombreCliente.trim()}</p>
            ) : null}
            <div className="flex gap-2">
              {(
                [
                  { value: true, label: 'Sí' },
                  { value: false, label: 'No' },
                ] as const
              ).map((op) => {
                const sel = titularCoincideCliente === op.value;
                return (
                  <button
                    key={String(op.value)}
                    type="button"
                    onClick={() => {
                      onTitularCoincideCliente?.(op.value);
                      if (op.value) {
                        onTitularTransferencia?.(nombreCliente.trim().slice(0, 200));
                      } else {
                        onTitularTransferencia?.('');
                      }
                    }}
                    style={{ touchAction: 'manipulation' }}
                    className={`flex-1 rounded-lg border px-3 font-medium transition-all duration-[140ms] ease-out ${btnClass} ${
                      sel
                        ? 'border-brand-700 bg-brand-600 text-white active:bg-brand-700'
                        : 'border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
                    }`}
                  >
                    {op.label}
                  </button>
                );
              })}
            </div>
          </div>

          {titularCoincideCliente === true && nombreCliente.trim() ? (
            <p className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[13px] text-emerald-900">
              Titular a registrar: <strong>{nombreCliente.trim()}</strong>
            </p>
          ) : null}

          {titularCoincideCliente === false && onTitularTransferencia ? (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Titular de la transferencia
              </label>
              <input
                type="text"
                value={titularTransferencia}
                onChange={(e) => onTitularTransferencia(e.target.value.slice(0, 200))}
                placeholder="Apellido y nombre del titular"
                className={`w-full rounded-lg border border-zinc-200 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-brand-600/15 ${inputClass}`}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
