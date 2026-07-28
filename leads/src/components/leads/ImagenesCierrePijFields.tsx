import { useEffect, useRef, useState } from 'react';
import { fetchImagenCierrePijBlob, uploadImagenCierrePij } from '../../api/client';
import {
  ETIQUETAS_IMAGEN_CIERRE_PIJ,
  SLOTS_IMAGEN_CIERRE_PIJ,
  esImagenCierrePijObligatoria,
  slotImagenCierrePijVisible,
} from '../../domain/imagenes-cierre-pij';
import { prepararImagenCierreParaSubida } from '../../domain/preparar-imagen-cierre';
import type { FormaPago, ImagenCierrePij, TipoImagenCierrePij } from '../../types';

function ImagenMiniatura({
  imagen,
  url,
}: {
  imagen: ImagenCierrePij;
  url: string | null;
  error?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
      {url ? (
        <img
          src={url}
          alt={ETIQUETAS_IMAGEN_CIERRE_PIJ[imagen.tipo]}
          className="h-28 w-full object-cover"
        />
      ) : (
        <div className="flex h-28 items-center justify-center px-2 text-center text-[11px] text-zinc-500">
          Cargando…
        </div>
      )}
    </div>
  );
}

function BarraProgresoSubida({ progreso, fase }: { progreso: number; fase: string }) {
  return (
    <div className="w-full space-y-1 px-1">
      <div className="h-2 overflow-hidden rounded-full bg-brand-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-200 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, progreso))}%` }}
        />
      </div>
      <p className="text-[11px] font-medium tabular-nums text-brand-800">
        {fase} {progreso}%
      </p>
    </div>
  );
}

function SlotImagen({
  label,
  codigo,
  tipo,
  leadId,
  ventaKey,
  imagen,
  formaPago,
  disabled,
  editable,
  onSubida,
  onQuitar,
}: {
  label: string;
  codigo: string;
  tipo: TipoImagenCierrePij;
  leadId: string;
  ventaKey: string;
  formaPago?: FormaPago | null;
  imagen?: ImagenCierrePij;
  disabled?: boolean;
  editable?: boolean;
  onSubida: (img: ImagenCierrePij) => void;
  onQuitar: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [fase, setFase] = useState('Subiendo');
  const [error, setError] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [cargaError, setCargaError] = useState(false);
  const obligatoria = esImagenCierrePijObligatoria(tipo, formaPago);

  useEffect(() => {
    if (!imagen) {
      setUrl(null);
      setCargaError(false);
      return;
    }
    let activo = true;
    let objectUrl: string | null = null;
    fetchImagenCierrePijBlob(imagen.id, imagen.storagePath, imagen.mimeType)
      .then((u) => {
        if (!activo) return;
        objectUrl = u;
        setUrl(u);
        setCargaError(false);
      })
      .catch(() => {
        if (activo) setCargaError(true);
      });
    return () => {
      activo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imagen?.id, imagen?.storagePath, imagen?.mimeType]);

  async function handleFile(file: File | null) {
    if (!file || disabled || !editable) return;
    setError('');
    setSubiendo(true);
    setProgreso(0);
    setFase('Preparando');
    try {
      const listo = await prepararImagenCierreParaSubida(file);
      setFase('Subiendo');
      setProgreso(1);
      const { imagen: nueva } = await uploadImagenCierrePij(
        listo,
        { leadId, ventaKey, tipo },
        (pct) => {
          setFase('Subiendo');
          setProgreso(pct);
        },
      );
      setProgreso(100);
      onSubida(nueva);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la imagen');
    } finally {
      setSubiendo(false);
      setProgreso(0);
      setFase('Subiendo');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const inputOculto = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
    />
  );

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span className="text-brand-700">{codigo}</span> — {label}
        {obligatoria ? (
          <span className="ml-1 text-red-600">*</span>
        ) : (
          <span className="ml-1 font-normal normal-case text-zinc-400">(opcional)</span>
        )}
      </p>

      {imagen ? (
        <div className="space-y-2">
          {cargaError ? (
            <div className="flex h-28 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-center text-[11px] text-zinc-500">
              No se pudo cargar la vista previa
            </div>
          ) : (
            <ImagenMiniatura imagen={imagen} url={url} />
          )}
          {editable && (
            <div className="space-y-2">
              {subiendo && <BarraProgresoSubida progreso={progreso} fase={fase} />}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={disabled || subiendo}
                  onClick={() => inputRef.current?.click()}
                  className="h-9 flex-1 rounded-lg border border-brand-200 bg-white text-[12px] font-semibold text-brand-800 disabled:opacity-50"
                >
                  {subiendo ? `${fase}…` : 'Cambiar'}
                </button>
                <button
                  type="button"
                  disabled={disabled || subiendo}
                  onClick={onQuitar}
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-semibold text-zinc-600 disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : editable ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={disabled || subiendo}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-[72px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 px-3 py-3 text-center text-[13px] font-medium text-brand-800 disabled:opacity-50"
          >
            {subiendo ? (
              <BarraProgresoSubida progreso={progreso} fase={fase} />
            ) : (
              'Tomar foto o elegir imagen'
            )}
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-zinc-400">Sin foto</p>
      )}

      {inputOculto}
      {error && <p className="text-[12px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function ImagenesCierrePijFields({
  leadId,
  ventaKey,
  formaPago = null,
  imagenes,
  onChange,
  disabled = false,
  editable = true,
  compact = false,
}: {
  leadId: string;
  ventaKey: string;
  /** Define visibilidad de img7 según medio de pago. */
  formaPago?: FormaPago | null;
  imagenes: ImagenCierrePij[];
  onChange: (imagenes: ImagenCierrePij[]) => void;
  disabled?: boolean;
  editable?: boolean;
  /** @deprecated Usar editable */
  soloLectura?: boolean;
  compact?: boolean;
}) {
  const deVenta = imagenes.filter((i) => i.ventaKey === ventaKey);
  const puedeEditar = editable && !disabled;
  const slotsVisibles = SLOTS_IMAGEN_CIERRE_PIJ.filter((tipo) =>
    slotImagenCierrePijVisible(tipo, formaPago),
  );

  function imagenPorTipo(tipo: TipoImagenCierrePij) {
    return deVenta.find((i) => i.tipo === tipo);
  }

  function patchImagen(nueva: ImagenCierrePij) {
    const sinTipo = imagenes.filter(
      (i) => !(i.ventaKey === ventaKey && i.tipo === nueva.tipo),
    );
    onChange([...sinTipo, nueva]);
  }

  function quitarImagen(tipo: TipoImagenCierrePij) {
    onChange(imagenes.filter((i) => !(i.ventaKey === ventaKey && i.tipo === tipo)));
  }

  if (!puedeEditar && deVenta.length === 0) return null;

  return (
    <div className={`space-y-2 ${compact ? '' : 'rounded-lg border border-zinc-100 bg-zinc-50/60 p-3'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
        Documentación del cierre
      </p>
      <p className="text-[12px] text-zinc-600">
        Obligatorias: DNI frente, DNI reverso, consentimiento/solicitud y foto de anexo. Con
        transferencia o mixto, también el comprobante de transferencia.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slotsVisibles.map((tipo) => (
          <SlotImagen
            key={tipo}
            codigo={tipo}
            label={ETIQUETAS_IMAGEN_CIERRE_PIJ[tipo]}
            tipo={tipo}
            leadId={leadId}
            ventaKey={ventaKey}
            formaPago={formaPago}
            imagen={imagenPorTipo(tipo)}
            disabled={disabled}
            editable={puedeEditar}
            onSubida={patchImagen}
            onQuitar={() => quitarImagen(tipo)}
          />
        ))}
      </div>
    </div>
  );
}
