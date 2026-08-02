/** Prepara foto de celular/cámara para subir al cierre PIJ (más liviana y JPEG). */

const MAX_LADO_PX = 1600;
const JPEG_QUALITY = 0.78;
const MAX_BYTES_SIN_COMPRIMIR = 1 * 1024 * 1024;
const MAX_BYTES_OBJETIVO = 1.2 * 1024 * 1024;

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('No se pudo comprimir la imagen'));
        else resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen (probá JPG o PNG)'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Redimensiona y convierte a JPEG cuando hace falta (fotos de celular pesadas / HEIC decodificable).
 * Si el navegador no puede decodificar, devuelve el archivo original.
 */
export async function prepararImagenCierreParaSubida(file: File): Promise<File> {
  if (!file || file.size <= 0) {
    throw new Error('El archivo de imagen está vacío');
  }

  const mime = String(file.type || '').toLowerCase();
  const yaLiviana =
    file.size <= MAX_BYTES_SIN_COMPRIMIR &&
    (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png' || mime === 'image/webp');

  if (yaLiviana) return file;

  try {
    const img = await loadImageElement(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const scale = Math.min(1, MAX_LADO_PX / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, tw, th);

    let quality = JPEG_QUALITY;
    let blob = await canvasToJpegBlob(canvas, quality);
    // Si sigue pesada, bajar calidad (objetivo ~1.2 MB para 20 usuarios concurrentes).
    if (blob.size > MAX_BYTES_OBJETIVO) {
      quality = 0.65;
      blob = await canvasToJpegBlob(canvas, quality);
    }
    if (blob.size > 2.5 * 1024 * 1024) {
      quality = 0.55;
      blob = await canvasToJpegBlob(canvas, quality);
    }

    const base = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    // HEIC no decodificable u otro formato: intentar subir original.
    return file;
  }
}
