import { LOGO_MPC_ALT, LOGO_MPC_URL } from '../../brand';
import type { RolUsuario, UsuarioSesion } from '../../types';

const TABS = [
  { id: 'leads' as const, label: 'Leads' },
  { id: 'promotores' as const, label: 'Promotores' },
];

const ROL_LABEL: Record<RolUsuario, string> = {
  promotor: 'Promotor',
  supervisor: 'Supervisor',
};

interface NavBarProps {
  vistaActiva: 'leads' | 'promotores';
  onCambiarVista: (id: 'leads' | 'promotores') => void;
  usuario: UsuarioSesion;
  onLogout: () => void;
}

export function NavBar({ vistaActiva, onCambiarVista, usuario, onLogout }: NavBarProps) {
  const tabs =
    usuario.rol === 'supervisor' ? TABS : TABS.filter((tab) => tab.id === 'leads');

  return (
    <header className="sticky top-0 z-40 bg-brand shadow-md">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={LOGO_MPC_URL}
              alt={LOGO_MPC_ALT}
              className="h-12 w-12 shrink-0 rounded-full border-2 border-white bg-white object-contain p-0.5 shadow-sm sm:h-14 sm:w-14"
            />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-white/90 sm:text-xs">
                Mi Primer Casa S.A.
              </p>
              <h1 className="truncate text-sm font-bold uppercase text-white sm:text-base">
                Seguimiento de Leads
              </h1>
            </div>
          </div>
          <nav
            className="flex shrink-0 gap-1 rounded-full bg-black/20 p-1"
            aria-label="Vistas principales"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onCambiarVista(tab.id)}
                className={`min-h-11 rounded-full px-3 py-2 text-xs font-bold uppercase transition touch-manipulation sm:px-4 sm:text-sm ${
                  vistaActiva === tab.id
                    ? 'bg-white text-brand shadow-sm'
                    : 'text-white hover:bg-white/15'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-white/90">
            <span className="font-bold">{usuario.nombre}</span>
            <span className="text-white/70">
              {' '}
              · {ROL_LABEL[usuario.rol]}
            </span>
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 min-h-9 rounded-full bg-black/25 px-3 py-1.5 text-[10px] font-bold uppercase text-white hover:bg-black/40 sm:text-xs"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
