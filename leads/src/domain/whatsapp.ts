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

export function mensajeWhatsAppLead(nombreLead: string) {
  const nombre = nombreLead.trim() || 'cliente';
  return `Hola ${nombre}, te contacto desde Mi Primer Casa.`;
}
