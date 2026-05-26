import { useCallback, useEffect, useState } from 'react';
import {
  fetchBarrios,
  fetchLeads,
  fetchProductos,
  fetchPromotores,
  guardarSeguimiento,
} from './api/client';
import { LoginPage } from './components/auth/LoginPage';
import { NavBar } from './components/layout/NavBar';
import { LeadsPanel } from './components/leads/LeadsPanel';
import { PromotoresPanel } from './components/promotores/PromotoresPanel';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Barrio, Lead, Producto, Promotor, SeguimientoLead } from './types';

function AppShell() {
  const { usuario, login, logout } = useAuth();
  const [vistaActiva, setVistaActiva] = useState<'leads' | 'promotores'>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [promotores, setPromotores] = useState<Promotor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargarDatos = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError('');
    try {
      const esSupervisor = usuario.rol === 'supervisor';
      const [l, p, prod, barr] = await Promise.all([
        fetchLeads(),
        esSupervisor ? fetchPromotores() : Promise.resolve([]),
        fetchProductos(usuario.rol),
        fetchBarrios(),
      ]);
      setLeads(l);
      setPromotores(p);
      setProductos(prod);
      setBarrios(barr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (usuario?.rol === 'promotor' && vistaActiva === 'promotores') {
      setVistaActiva('leads');
    }
  }, [usuario?.rol, vistaActiva]);

  const onActualizarLead = useCallback(
    async (leadId: string, seguimiento: SeguimientoLead) => {
      const updated = await guardarSeguimiento(leadId, seguimiento);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
    },
    [],
  );

  if (!usuario) {
    return <LoginPage onLogin={login} />;
  }

  return (
    <div className="min-h-svh bg-neutral-100">
      <NavBar
        vistaActiva={vistaActiva}
        onCambiarVista={setVistaActiva}
        usuario={usuario}
        onLogout={logout}
      />
      <main>
        {error && (
          <p className="mx-auto max-w-5xl whitespace-pre-wrap px-4 pt-4 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {cargando && leads.length === 0 ? (
          <p className="px-4 py-12 text-center text-neutral-600">Cargando datos…</p>
        ) : vistaActiva === 'promotores' && usuario.rol === 'supervisor' ? (
          <PromotoresPanel leads={leads} promotores={promotores} />
        ) : (
          <LeadsPanel
            leads={leads}
            rolUsuario={usuario.rol}
            promotores={promotores}
            productos={productos}
            barrios={barrios}
            onActualizarLead={onActualizarLead}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
