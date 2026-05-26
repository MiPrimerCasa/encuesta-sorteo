import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearSession, getSession, login as apiLogin, setSession } from '../api/client';
import type { UsuarioSesion } from '../types';

interface AuthContextValue {
  usuario: UsuarioSesion | null;
  login: (usuario: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() => getSession()?.usuario ?? null);

  const login = useCallback(async (user: string, pass: string) => {
    const res = await apiLogin(user, pass);
    setSession(res.token, res.usuario);
    setUsuario(res.usuario);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUsuario(null);
  }, []);

  const value = useMemo(() => ({ usuario, login, logout }), [usuario, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
