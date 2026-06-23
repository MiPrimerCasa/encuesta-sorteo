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

export function mensajeWhatsAppLead(
  nombreLead: string,
  nombreUsuario?: string,
  tieneCitaPrevia?: boolean,
) {
  const formatName = (str?: string | null) => {
    if (!str) return '';
    return str
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const nombre = formatName(nombreLead) || 'Cliente';
  const usuario = formatName(nombreUsuario);

  if (!tieneCitaPrevia) {
    if (usuario) {
      return `Hola ${nombre} 😊¿cómo estás? 
Te habla ${usuario} de Mi Primer Casa S.A.
Antes que nada, ¡felicitaciones! 🎉 Ya estás participando del sorteo del terreno y las motos. 
Te quiero hacer una pregunta: si hoy tuvieras la oportunidad de asegurar un terreno con una cuota de $55.000 por mes.  ¿ Para que Lo Usarías?
Para construir tu casa 🏠?
 o como una inversión 💲?`;
    }
    return `Hola ${nombre} 😊¿cómo estás? 
Te hablo de Mi Primer Casa S.A.
Antes que nada, ¡felicitaciones! 🎉 Ya estás participando del sorteo del terreno y las motos. 
Te quiero hacer una pregunta: si hoy tuvieras la oportunidad de asegurar un terreno con una cuota de $55.000 por mes.  ¿ Para que Lo Usarías?
Para construir tu casa 🏠?
 o como una inversión 💲?`;
  }

  if (usuario) {
    return `Hola ${nombre}! Buenos días, me comunico para confirmar la entrevista, mi nombre es ${usuario} asesor comercial de Mi Primer Casa S.A.`;
  }
  return `Hola ${nombre}! Buenos días, me comunico para confirmar la entrevista desde Mi Primer Casa S.A.`;
}

export function cleanTelefonoSuffix(tel?: string | null): string {
  if (!tel) return '';
  return String(tel).trim().replace(/_dup[a-z]+$/i, '');
}
