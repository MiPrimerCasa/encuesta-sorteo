import { LOGO_MPC_ALT, LOGO_MPC_URL } from '../../brand';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { RolUsuario, UsuarioSesion, VistaActiva } from '../../types';

const TABS_SUPERVISOR = [
  { value: 'leads' as const, label: 'Leads' },
  { value: 'promotores' as const, label: 'Promotores' },
  { value: 'calendario' as const, label: 'Calendario' },
];

const TABS_PROMOTOR = [
  { value: 'leads' as const, label: 'Leads' },
  { value: 'metricas' as const, label: 'Métricas' },
];

const ROL_LABEL: Record<RolUsuario, string> = {
  promotor: 'Promotor',
  supervisor: 'Supervisor',
};

const ROL_BADGE_CLASS: Record<RolUsuario, string> = {
  promotor: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  supervisor: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
};

interface NavBarProps {
  vistaActiva: VistaActiva;
  onCambiarVista: (id: VistaActiva) => void;
  usuario: UsuarioSesion;
  onLogout: () => void;
}

export function NavBar({ vistaActiva, onCambiarVista, usuario, onLogout }: NavBarProps) {
  const tabs: Array<{ value: VistaActiva; label: string }> =
    usuario.rol === 'supervisor' ? TABS_SUPERVISOR : TABS_PROMOTOR;

  return (
    <header
      className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-sm"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Fila 1: marca + usuario */}
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:mx-auto md:h-16 md:max-w-5xl md:px-6">

        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src={LOGO_MPC_URL}
            alt={LOGO_MPC_ALT}
            className="h-10 w-10 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 sm:block">
              Mi Primer Casa S.A.
            </p>
            <p className="truncate text-[13px] font-semibold text-zinc-900">
              Mi Primer Casa
            </p>
            {/* Nombre del usuario — solo mobile, debajo del nombre de empresa */}
            <p className="truncate text-[11px] text-zinc-400 md:hidden">
              {usuario.nombre}
            </p>
          </div>
        </div>

        {/* Desktop: nav */}
        <div className="hidden items-center gap-4 md:flex">
          {tabs.length > 1 && (
            <SegmentedControl
              options={tabs}
              value={vistaActiva}
              onChange={onCambiarVista}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Rol badge — visible en todos los tamaños */}
          <span
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ROL_BADGE_CLASS[usuario.rol]}`}
          >
            {ROL_LABEL[usuario.rol]}
          </span>

          {/* Nombre — solo desktop (en mobile va bajo la marca) */}
          <span className="hidden max-w-[140px] truncate text-[13px] text-zinc-500 md:inline">
            {usuario.nombre}
          </span>

          <button
            type="button"
            onClick={onLogout}
            style={{ touchAction: 'manipulation' }}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-500 transition-colors active:bg-brand-50 active:text-brand-700 hover:text-zinc-700 md:px-3"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Fila 2 mobile: underline tabs */}
      {tabs.length > 1 && (
        <div className="flex border-t border-zinc-100 md:hidden">
          {tabs.map((tab) => {
            const active = vistaActiva === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onCambiarVista(tab.value)}
                style={{ touchAction: 'manipulation' }}
                className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors xs:text-[14px] ${
                  active
                    ? 'border-b-2 border-brand-600 text-brand-600'
                    : 'border-b-2 border-transparent text-zinc-400 active:text-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
