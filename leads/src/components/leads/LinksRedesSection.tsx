import { useEffect, useState } from 'react';
import { fetchLinksRedes } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { LinksRedes } from '../../types';

function IconFacebook({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function IconInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

async function abrirCompartir(url: string) {
  // Solo la URL: si se pasa text/title aparte, el móvil ignora el ?text= de wa.me.
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

interface CompartirButtonProps {
  url: string;
  ariaLabel: string;
  icon: 'facebook' | 'instagram' | 'whatsapp';
}

function CompartirButton({ url, ariaLabel, icon }: CompartirButtonProps) {
  const estilos =
    icon === 'instagram'
      ? 'border-fuchsia-600 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-orange-500'
      : icon === 'facebook'
        ? 'border-blue-700 bg-[#1877F2]'
        : 'border-emerald-600 bg-[#25D366]';

  return (
    <button
      type="button"
      onClick={() => void abrirCompartir(url)}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{ touchAction: 'manipulation' }}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-white transition-all active:scale-[0.98] ${estilos}`}
    >
      {icon === 'instagram' && <IconInstagram className="h-6 w-6" />}
      {icon === 'facebook' && <IconFacebook className="h-6 w-6" />}
      {icon === 'whatsapp' && <IconWhatsApp className="h-6 w-6" />}
    </button>
  );
}

interface LinksRedesSectionProps {
  className?: string;
}

export function LinksRedesSection({ className = 'mb-5' }: LinksRedesSectionProps) {
  const { usuario } = useAuth();
  const [links, setLinks] = useState<LinksRedes | null>(null);
  const [cargando, setCargando] = useState(true);

  const claveUsuario = [
    usuario?.id,
    usuario?.codigoCarga,
    usuario?.loginId,
    usuario?.nombre,
  ].join('|');

  useEffect(() => {
    if (!usuario) {
      setLinks(null);
      setCargando(false);
      return;
    }
    let activo = true;
    setCargando(true);
    fetchLinksRedes()
      .then((data) => {
        if (activo) setLinks(data);
      })
      .catch((err: unknown) => {
        if (activo) {
          const detalle =
            err instanceof Error && err.message.trim()
              ? err.message.trim()
              : 'No se pudieron cargar los links. Reintentá en unos segundos.';
          setLinks({
            codigo: usuario.codigoCarga ?? null,
            vendedor: usuario.nombre,
            instagram: null,
            facebook: null,
            whatsapp: null,
            mensaje: detalle,
          });
        }
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [claveUsuario, usuario]);

  if (!usuario) return null;

  if (cargando) {
    return (
      <section className={`rounded-xl border border-zinc-200 bg-white p-4 ${className}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Links para compartir en redes
        </p>
      </section>
    );
  }

  if (!links) return null;

  const tieneLinks = Boolean(links.instagram || links.facebook || links.whatsapp);

  return (
    <section
      className={`rounded-xl border border-brand-100 bg-gradient-to-br from-white to-brand-50/40 p-4 ${className}`}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
        Links para compartir en redes
      </p>

      {links.instagramAcortado && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Link corto para bio de Instagram
          </p>
          <p className="mt-1 break-all text-[12px] font-medium tabular-nums text-emerald-900">
            {links.instagramAcortado}
          </p>
        </div>
      )}

      {tieneLinks ? (
        <div className="flex gap-3">
          {links.instagram && (
            <CompartirButton
              url={links.instagram}
              ariaLabel="Compartir link de Instagram"
              icon="instagram"
            />
          )}
          {links.facebook && (
            <CompartirButton
              url={links.facebook}
              ariaLabel="Compartir link de Facebook"
              icon="facebook"
            />
          )}
          {links.whatsapp && (
            <CompartirButton
              url={links.whatsapp}
              ariaLabel="Compartir link de WhatsApp"
              icon="whatsapp"
            />
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
          {links.mensaje ??
            'No hay links configurados para tu código. Contactá a administración.'}
        </p>
      )}
    </section>
  );
}
