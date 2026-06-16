/** Normaliza teléfono argentino para wa.me (solo dígitos, con prefijo 54). */
export function telefonoParaWhatsApp(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length < 8) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `54${digits.slice(1)}`;
  if (digits.length === 10 || digits.length === 11) return `54${digits}`;

  return digits;
}

export function urlWhatsAppChat(
  telefono?: string | null,
  mensaje?: string,
): string | null {
  const numero = telefonoParaWhatsApp(telefono);
  if (!numero) return null;
  const params = new URLSearchParams({ phone: numero });
  if (mensaje?.trim()) params.set('text', mensaje.trim());
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function abrirChatWhatsApp(
  telefono?: string | null,
  mensaje?: string,
): boolean {
  const url = urlWhatsAppChat(telefono, mensaje);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

function normalizeNombreSimple(valor: string): string {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function mensajeWhatsAppLead(
  nombreLead: string,
  nombreUsuario?: string,
  confirmoEntrevista?: boolean | null,
) {
  const nombre = nombreLead.trim() || 'cliente';
  const usuario = nombreUsuario?.trim();

  if (confirmoEntrevista !== true) {
    if (usuario) {
      const primerNombre = normalizeNombreSimple(usuario).split(' ')[0] || '';
      const esFemenino = /a$|belen|catherine|giselle/i.test(primerNombre);
      const profesion = esFemenino ? 'asesora' : 'asesor';
      return `Hola ${nombre}! Mi nombre es ${usuario} y soy ${profesion} de ventas de Mi Primer Casa.
FELICITACIONES!!!!🥳
Ya estás participando del sorteo GRATIS del terreno y las motos. EXITOS! 🍀 
Además, aprovecho para comentarte que tenemos una excelente promoción del 40% de descuento en nuestros productos. 
Te invito a que me agendes para que veas las promociones en mis estados, y si te interesa recibir mas información , estoy para asesorarte.`;
    }
    return `Hola ${nombre}! Mi nombre es asesor/a de ventas de Mi Primer Casa.
FELICITACIONES!!!!🥳
Ya estás participando del sorteo GRATIS del terreno y las motos. EXITOS! 🍀 
Además, aprovecho para comentarte que tenemos una excelente promoción del 40% de descuento en nuestros productos. 
Te invito a que me agendes para que veas las promociones en mis estados, y si te interesa recibir mas información , estoy para asesorarte.`;
  }

  if (usuario) {
    return `Hola ${nombre}! Buenos días, me comunico para confirmar la entrevista, mi nombre es ${usuario} asesor comercial de Mi Primer Casa S.A.`;
  }
  return `Hola ${nombre}! Buenos días, me comunico para confirmar la entrevista desde Mi Primer Casa S.A.`;
}
