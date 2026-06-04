import { useState, type FormEvent } from 'react';
import { LOGO_MPC_ALT, LOGO_MPC_URL } from '../../brand';

const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

interface LoginPageProps {
  onLogin: (usuario: string, password: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setCargando('login');
    setError('');
    try {
      await onLogin(usuario, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setCargando(null);
    }
  };

  const enterDemo = async (rol: '__demo_supervisor__' | '__demo_promotor__' | '__demo_superadmin__') => {
    setCargando(rol);
    setError('');
    try {
      await onLogin(rol, '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al entrar al demo');
    } finally {
      setCargando(null);
    }
  };

  const brand = (
    <div className="text-center">
      <img
        src={LOGO_MPC_URL}
        alt={LOGO_MPC_ALT}
        className="mx-auto h-16 w-16 rounded-full border-2 border-brand bg-white object-contain p-1"
      />
      <h1 className="mt-3 text-xl font-bold uppercase text-brand">Mi Primer Casa S.A.</h1>
      <p className="text-sm text-neutral-600">Seguimiento de Leads</p>
    </div>
  );

  if (IS_DEMO) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-neutral-100 p-4">
        <div className="w-full max-w-md space-y-6 rounded-3xl border-2 border-brand/20 bg-white p-6 shadow-lg">
          {brand}

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-amber-700">
              Modo demo
            </p>
            <p className="mt-0.5 text-[13px] text-amber-600">
              Elegí el rol con el que querés explorar la app
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              disabled={cargando !== null}
              onClick={() => enterDemo('__demo_supervisor__')}
              className="flex w-full items-center gap-4 rounded-2xl border-2 border-brand/20 bg-white px-5 py-4 text-left transition-all hover:border-brand/40 hover:shadow-sm active:scale-[0.99] disabled:opacity-60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[22px]">
                👔
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-zinc-900">Demo Supervisor</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  Ve todos los leads, métricas y promotores
                </p>
              </div>
              {cargando === '__demo_supervisor__' && (
                <span className="ml-auto text-[12px] text-zinc-400">Cargando…</span>
              )}
            </button>

            <button
              type="button"
              disabled={cargando !== null}
              onClick={() => enterDemo('__demo_promotor__')}
              className="flex w-full items-center gap-4 rounded-2xl border-2 border-zinc-200 bg-white px-5 py-4 text-left transition-all hover:border-zinc-300 hover:shadow-sm active:scale-[0.99] disabled:opacity-60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[22px]">
                🙋
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-zinc-900">Demo Promotor</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  Vista de Martín González — solo sus leads
                </p>
              </div>
              {cargando === '__demo_promotor__' && (
                <span className="ml-auto text-[12px] text-zinc-400">Cargando…</span>
              )}
            </button>

            <button
              type="button"
              disabled={cargando !== null}
              onClick={() => enterDemo('__demo_superadmin__')}
              className="flex w-full items-center gap-4 rounded-2xl border-2 border-violet-200 bg-violet-50/50 px-5 py-4 text-left transition-all hover:border-violet-300 hover:shadow-sm active:scale-[0.99] disabled:opacity-60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[22px]">
                📊
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-zinc-900">Demo Superadmin</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  Todos los supervisores, equipos y rankings
                </p>
              </div>
              {cargando === '__demo_superadmin__' && (
                <span className="ml-auto text-[12px] text-zinc-400">Cargando…</span>
              )}
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-neutral-100 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-3xl border-2 border-brand/20 bg-white p-6 shadow-lg"
      >
        {brand}

        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Correo electrónico</span>
          <input
            type="email"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Ingrese su correo electrónico"
            className="mt-1 w-full min-h-12 rounded-xl border-2 border-neutral-200 px-3"
            autoComplete="username"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full min-h-12 rounded-xl border-2 border-neutral-200 px-3"
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={cargando !== null}
          className="w-full min-h-14 rounded-full bg-brand text-lg font-bold uppercase text-white disabled:opacity-60"
        >
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="text-center text-xs text-neutral-500">
          Acceso con operador de producción STRSYSTEM. Los leads provienen de{' '}
          <code>encuestasMuestraOperador</code> según tu operador.
        </p>
      </form>
    </div>
  );
}
