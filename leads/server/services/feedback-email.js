import nodemailer from 'nodemailer';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Destinatarios de alertas de feedback.
 * FEEDBACK_NOTIFY_EMAIL=a@x.com,b@y.com
 * Default: jesus.cajal.work@gmail.com
 */
export function feedbackNotifyEmails() {
  const raw = process.env.FEEDBACK_NOTIFY_EMAIL || 'jesus.cajal.work@gmail.com';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function etiquetaTipo(tipo) {
  return tipo === 'bug' ? 'Bug' : 'Propuesta de mejora';
}

/**
 * Envía aviso por correo al crear un reporte. No lanza: si falla, solo loguea.
 * @param {{ item: object, capturaAbsPath?: string | null, capturaMime?: string | null }} opts
 */
export async function notificarFeedbackPorEmail({ item, capturaAbsPath, capturaMime }) {
  const to = feedbackNotifyEmails();
  if (!to.length) {
    console.warn('[feedback-email] Sin FEEDBACK_NOTIFY_EMAIL; no se envía correo.');
    return { ok: false, reason: 'sin_destinatario' };
  }
  if (!smtpConfigured()) {
    console.warn(
      '[feedback-email] SMTP no configurado (SMTP_HOST/USER/PASS). El reporte se guardó igual.',
    );
    return { ok: false, reason: 'sin_smtp' };
  }

  const tipoLabel = etiquetaTipo(item.tipo);
  const quien = item.anonimo
    ? 'Anónimo'
    : [item.usuarioNombre, item.usuarioRol, item.usuarioLoginId]
        .filter(Boolean)
        .join(' · ') || 'Usuario identificado';

  const subject = `[CRM Feedback] ${tipoLabel}: ${(item.mensaje || '').slice(0, 60)}`;

  const text = [
    `Nuevo reporte en Seguimiento Leads`,
    ``,
    `Tipo: ${tipoLabel}`,
    `Estado: ${item.estado || 'nuevo'}`,
    `Quién: ${quien}`,
    `Fecha: ${item.creadoEn || new Date().toISOString()}`,
    item.urlVista ? `URL: ${item.urlVista}` : null,
    ``,
    `Mensaje:`,
    item.mensaje || '(sin texto)',
    ``,
    `Id: ${item.id}`,
  ]
    .filter((l) => l != null)
    .join('\n');

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.45;color:#18181b">
      <p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:.04em">
        Seguimiento Leads · Feedback
      </p>
      <h2 style="margin:0 0 12px;font-size:18px">${tipoLabel}</h2>
      <p style="margin:0 0 8px"><strong>Quién:</strong> ${escapeHtml(quien)}</p>
      <p style="margin:0 0 8px"><strong>Fecha:</strong> ${escapeHtml(String(item.creadoEn || ''))}</p>
      ${item.urlVista ? `<p style="margin:0 0 8px"><strong>URL:</strong> ${escapeHtml(item.urlVista)}</p>` : ''}
      <div style="margin:16px 0;padding:12px 14px;background:#f4f4f5;border-radius:10px;white-space:pre-wrap">${escapeHtml(item.mensaje || '')}</div>
      <p style="margin:0;font-size:12px;color:#a1a1aa">Id: ${escapeHtml(item.id)}</p>
    </div>
  `;

  const attachments = [];
  if (capturaAbsPath && existsSync(capturaAbsPath)) {
    attachments.push({
      filename: `captura${path.extname(capturaAbsPath) || '.jpg'}`,
      path: capturaAbsPath,
      contentType: capturaMime || 'image/jpeg',
    });
  }

  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    'noreply@miprimercasa.local';

  try {
    const transport = createTransport();
    const info = await transport.sendMail({
      from,
      to: to.join(', '),
      subject,
      text,
      html,
      attachments,
    });
    console.log('[feedback-email] Enviado a', to.join(', '), info.messageId || '');
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(
      '[feedback-email] Falló el envío (el reporte ya está guardado):',
      err instanceof Error ? err.message : err,
    );
    return { ok: false, reason: 'error_smtp', detail: err instanceof Error ? err.message : String(err) };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
