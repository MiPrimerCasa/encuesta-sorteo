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

async function abrirCompartir(url: string, red: 'Instagram' | 'Facebook') {
  const shareData: ShareData = {
    title: 'Mi Primer Casa S.A.',
    text: `Participá del sorteo — contacto por ${red}`,
    url,
  };

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

interface CompartirButtonProps {
  url: string;
  label: 'Instagram' | 'Facebook';
  icon: 'facebook' | 'instagram';
}

function CompartirButton({ url, label, icon }: CompartirButtonProps) {
  const esIg = icon === 'instagram';

  return (
    <button
      type="button"
      onClick={() => void abrirCompartir(url, label)}
      style={{ touchAction: 'manipulation' }}
      className={`flex h-12 flex-1 items-center justify-center gap-2.5 rounded-xl border text-[14px] font-semibold text-white transition-all active:scale-[0.98] ${
        esIg
          ? 'border-fuchsia-600 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-orange-500'
          : 'border-blue-700 bg-[#1877F2]'
      }`}
    >
      {esIg ? (
        <IconInstagram className="h-5 w-5 shrink-0" />
      ) : (
        <IconFacebook className="h-5 w-5 shrink-0" />
      )}
      {label}
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
      .catch(() => {
        if (activo) {
          setLinks({
            codigo: usuario.codigoCarga ?? null,
            vendedor: usuario.nombre,
            instagram: null,
            facebook: null,
            mensaje: 'No se pudieron cargar los links. Reintentá en unos segundos.',
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

  const tieneLinks = Boolean(links.instagram && links.facebook);

  return (
    <section
      className={`rounded-xl border border-brand-100 bg-gradient-to-br from-white to-brand-50/40 p-4 ${className}`}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
        Links para compartir en redes
      </p>

      {tieneLinks ? (
        <div className="flex gap-3">
          <CompartirButton url={links.instagram!} label="Instagram" icon="instagram" />
          <CompartirButton url={links.facebook!} label="Facebook" icon="facebook" />
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
