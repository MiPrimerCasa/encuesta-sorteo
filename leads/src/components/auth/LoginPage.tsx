import { useState, type FormEvent } from 'react';
import { LOGO_MPC_ALT, LOGO_MPC_URL } from '../../brand';

interface LoginPageProps {
  onLogin: (usuario: string, password: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');
    try {
      await onLogin(usuario, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-neutral-100 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-3xl border-2 border-brand/20 bg-white p-6 shadow-lg"
      >
        <div className="text-center">
          <img
            src={LOGO_MPC_URL}
            alt={LOGO_MPC_ALT}
            className="mx-auto h-16 w-16 rounded-full border-2 border-brand bg-white object-contain p-1"
          />
          <h1 className="mt-3 text-xl font-bold uppercase text-brand">Mi Primer Casa S.A.</h1>
          <p className="text-sm text-neutral-600">Seguimiento de Leads</p>
        </div>

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
          disabled={cargando}
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
