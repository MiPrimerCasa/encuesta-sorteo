import { useEffect, useRef, useState } from 'react';
import { fetchImagenCierrePijBlob, uploadImagenCierrePij } from '../../api/client';
import {
  ETIQUETAS_IMAGEN_CIERRE_PIJ,
  SLOTS_IMAGEN_CIERRE_PIJ,
  TIPOS_DNI_CIERRE_PIJ,
  esImagenCierrePijObligatoria,
  imagenesDniDesdeFuentes,
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

function MiniaturaSoloLectura({ imagen }: { imagen: ImagenCierrePij }) {
  const [url, setUrl] = useState<string | null>(null);
  const [cargaError, setCargaError] = useState(false);

  useEffect(() => {
    let activo = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setCargaError(false);
    fetchImagenCierrePijBlob(imagen.id, imagen.storagePath, imagen.mimeType)
      .then((u) => {
        if (!activo) return;
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => {
        if (activo) setCargaError(true);
      });
    return () => {
      activo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imagen.id, imagen.storagePath, imagen.mimeType]);

  const label =
    ETIQUETAS_IMAGEN_CIERRE_PIJ[
      (TIPOS_DNI_CIERRE_PIJ.includes(imagen.tipo as (typeof TIPOS_DNI_CIERRE_PIJ)[number])
        ? imagen.tipo
        : 'img1') as TipoImagenCierrePij
    ] ?? imagen.tipo;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span className="text-brand-700">{imagen.tipo}</span> — {label}
      </p>
      {cargaError ? (
        <div className="flex h-28 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 text-center text-[11px] text-rose-800">
          No está en el servidor (o no se pudo leer). Revisá el DNI del plan principal.
        </div>
      ) : (
        <ImagenMiniatura imagen={imagen} url={url} />
      )}
    </div>
  );
}

/**
 * Botón para traer/ver el DNI compartido del plan principal (sin volver a subir).
 * Si carga, el archivo está en el VPS; si falla, avisa.
 */
export function VistaPreviaDniCompartido({
  imagenes,
  fuentesPrioridad,
}: {
  imagenes: ImagenCierrePij[];
  fuentesPrioridad: string[];
}) {
  const [abierto, setAbierto] = useState(false);
  const dni = imagenesDniDesdeFuentes(imagenes, fuentesPrioridad);
  const tieneDni = dni.length > 0;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-zinc-600">
          {tieneDni
            ? 'DNI reutilizado del plan principal (mismo archivo en el servidor).'
            : 'Todavía no hay DNI en el plan principal para reutilizar.'}
        </p>
        <button
          type="button"
          disabled={!tieneDni}
          onClick={() => setAbierto((v) => !v)}
          style={{ touchAction: 'manipulation' }}
          className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-[12px] font-semibold text-brand-800 active:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {abierto ? 'Ocultar vista previa' : 'Ver vista previa del DNI'}
        </button>
      </div>
      {abierto && tieneDni && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
          {dni.map((img) => (
            <MiniaturaSoloLectura key={`${img.id}:${img.tipo}`} imagen={img} />
          ))}
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

const ACCEPT_IMAGEN = 'image/jpeg,image/png,image/webp,image/*';

/** Menú: cámara vs galería/archivos (mismo flujo en cierre y fotos faltantes). */
function MenuFuenteImagen({
  open,
  onClose,
  onCamara,
  onGaleria,
}: {
  open: boolean;
  onClose: () => void;
  onCamara: () => void;
  onGaleria: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-zinc-950/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-fuente-imagen-title"
        className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-3 shadow-xl sm:rounded-2xl"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <p
          id="menu-fuente-imagen-title"
          className="px-1 pb-2 text-center text-[13px] font-semibold text-zinc-800"
        >
          ¿Cómo querés cargar la foto?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            style={{ touchAction: 'manipulation' }}
            onClick={() => {
              // El click al input debe ir en el mismo gesto del usuario (iOS/Android).
              onCamara();
              onClose();
            }}
            className="h-12 w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white active:bg-brand-800"
          >
            Tomar foto con la cámara
          </button>
          <button
            type="button"
            style={{ touchAction: 'manipulation' }}
            onClick={() => {
              onGaleria();
              onClose();
            }}
            className="h-12 w-full rounded-xl border border-brand-200 bg-brand-50 text-[15px] font-semibold text-brand-900 active:bg-brand-100"
          >
            Galería o archivos
          </button>
          <button
            type="button"
            style={{ touchAction: 'manipulation' }}
            onClick={onClose}
            className="h-11 w-full rounded-xl text-[14px] font-medium text-zinc-500 active:bg-zinc-100"
          >
            Cancelar
          </button>
        </div>
      </div>
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
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [menuFuente, setMenuFuente] = useState(false);
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
      if (camaraRef.current) camaraRef.current.value = '';
      if (galeriaRef.current) galeriaRef.current.value = '';
    }
  }

  function abrirMenuFuente() {
    if (disabled || subiendo || !editable) return;
    setMenuFuente(true);
  }

  const inputsOcultos = (
    <>
      <input
        ref={camaraRef}
        type="file"
        accept={ACCEPT_IMAGEN}
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept={ACCEPT_IMAGEN}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
    </>
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
                  onClick={abrirMenuFuente}
                  style={{ touchAction: 'manipulation' }}
                  className="h-9 flex-1 rounded-lg border border-brand-200 bg-white text-[12px] font-semibold text-brand-800 disabled:opacity-50"
                >
                  {subiendo ? `${fase}…` : 'Cambiar'}
                </button>
                <button
                  type="button"
                  disabled={disabled || subiendo}
                  onClick={onQuitar}
                  style={{ touchAction: 'manipulation' }}
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
            onClick={abrirMenuFuente}
            style={{ touchAction: 'manipulation' }}
            className="flex min-h-[72px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 px-3 py-3 text-center text-[13px] font-medium text-brand-800 disabled:opacity-50"
          >
            {subiendo ? (
              <BarraProgresoSubida progreso={progreso} fase={fase} />
            ) : (
              'Cargar'
            )}
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-zinc-400">Sin foto</p>
      )}

      {inputsOcultos}
      <MenuFuenteImagen
        open={menuFuente}
        onClose={() => setMenuFuente(false)}
        onCamara={() => camaraRef.current?.click()}
        onGaleria={() => galeriaRef.current?.click()}
      />
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
  soloTipos,
  titulo,
  ayuda,
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
  /** Si se pasa, solo muestra estos slots (p. ej. fotos faltantes). */
  soloTipos?: TipoImagenCierrePij[];
  titulo?: string;
  ayuda?: string;
}) {
  const deVenta = imagenes.filter((i) => i.ventaKey === ventaKey);
  const puedeEditar = editable && !disabled;
  const slotsVisibles = (soloTipos?.length ? soloTipos : SLOTS_IMAGEN_CIERRE_PIJ).filter(
    (tipo) => soloTipos?.length || slotImagenCierrePijVisible(tipo, formaPago),
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
        {titulo ?? 'Documentación del cierre'}
      </p>
      <p className="text-[12px] text-zinc-600">
        {ayuda ??
          'Podés guardar el cierre aunque falten fotos. Recomendadas: DNI frente/reverso, solicitud de adhesión (ADH) y anexo. Con transferencia o mixto, también el comprobante. En la tarjeta se marcan en verde las cargadas y en rojo las que faltan.'}
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
