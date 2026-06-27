import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPromotoresFromLeads,
  enrichOperadorRolDesdeEncuestas,
  fetchEncuestaRowsParaUsuario,
  fetchEncuestasMuestraRaw,
  listLeadsFromEncuestas,
  promotorTieneFilasEnMuestra,
  resolveDireccionOficinasSupervisor,
  updateLeadSeguimientoEncuesta,
  listAllLeadsFromEncuestas,
} from './db/encuestas.js';
import {
  CargaEncuestaSinPersistirError,
  CodigoPromotorCargaError,
  ContactoYaRegistradoError,
  crearEncuestaManual,
  LeadNoEncontradoError,
  LeadNoManualError,
  modificarTelefonoLeadManual,
  resolveCargaEncuestaContext,
  reasignarLeadManual,
  duplicarLeadEnDb,
  execEncuestaSorteo01Update,
  buildCargaParamsFromLead,
  getEncuestaCampaniaId,
  digitsTelefono,
  formatHorarioEntrevistaSp,
} from './db/encuesta-carga.js';
import { isLinksAcortadorEnabled } from './db/links-acortador.js';
import { resolveLinksRedesParaUsuario } from './db/links-redes.js';
import {
  contarNotificacionesParaUsuario,
  listarNotificacionesParaUsuario,
  marcarNotificacionVista,
} from './db/links-acortados-store.js';
import {
  enriquecerUsuarioConCodigoCarga,
  idVendedorOperador,
  loadOperadoresCatalogAsync,
} from './db/operadores-catalog.js';
import { fetchAdminDashboard } from './db/admin-dashboard.js';
import { aplicarRolSuperadmin, esSuperadminUsuario, esSupervisorPanelGlobal } from './db/superadmin-auth.js';
import { modificarTelefonoLeadSchema } from './schemas/modificar-telefono-lead.js';
import { nuevoLeadSchema } from './schemas/nuevo-lead.js';
import { verifyLoginSqlServer } from './db/mssql.js';
import {
  getDb,
  listBarrios,
  listProductos,
  productoPermitidoParaRol,
} from './db/sqlite.js';
import {
  listHistorialForLead,
  SeguimientoRegistroError,
  useSeguimientoSql,
  resetearSeguimientoLead,
} from './db/seguimiento-sql.js';
import { getHealthInfo, respondIfNotConfigured } from './require-production.js';
import { formatSqlError } from './sql-errors.js';
import { loginSchema, seguimientoSchema } from './schemas/seguimiento.js';
import { registerGrabacionesRoutes } from './routes/grabaciones-routes.js';

function usuarioDesdeRequest(req) {
  const rol = req.headers['x-usuario-rol'];
  const nombre = String(req.headers['x-usuario-nombre'] || '').trim();
  const id = String(req.headers['x-usuario-id'] || '').trim();
  const loginId = String(req.headers['x-usuario-login-id'] || '').trim();
  const codigoCarga = String(req.headers['x-usuario-codigo-carga'] || '').trim();
  const codigoPromotor = String(req.headers['x-usuario-codigo-promotor'] || '').trim();
  const codigoSupervisor = String(req.headers['x-usuario-codigo-supervisor'] || '').trim();
  const idVendedorHdr = String(req.headers['x-usuario-id-vendedor'] || '').trim();
  const idSupervisorHdr = String(req.headers['x-usuario-id-supervisor'] || '').trim();
  const idOperadorHdr = String(req.headers['x-usuario-id-operador'] || '').trim();
  const sucursalHdr = String(req.headers['x-usuario-sucursal'] || '').trim();
  if (rol !== 'promotor' && rol !== 'supervisor' && rol !== 'superadmin') return null;
  if (!nombre || !id) return null;
  const panelGlobalHdr = String(req.headers['x-usuario-panel-global'] || '').trim().toLowerCase();
  const panelGlobal =
    panelGlobalHdr === 'true' ||
    panelGlobalHdr === '1' ||
    (loginId && esSupervisorPanelGlobal(loginId));
  return {
    id,
    nombre,
    rol,
    loginId: loginId || undefined,
    codigoCarga: codigoCarga || undefined,
    codigoPromotor: codigoPromotor || undefined,
    codigoSupervisor: codigoSupervisor || undefined,
    idOperador: idOperadorHdr || id,
    idVendedor: idVendedorHdr || id,
    idSupervisor: idSupervisorHdr || undefined,
    sucursal: sucursalHdr || undefined,
    panelGlobal: panelGlobal || undefined,
  };
}

/** Prefijo público (Traefik sirve en /leads sin quitar el path). */
export function getAppBasePath() {
  const raw = String(process.env.APP_BASE_PATH ?? '/leads').trim();
  if (!raw || raw === '/') return '';
  return raw.replace(/\/$/, '');
}

function registerApiRoutes(api) {
  api.get('/health/live', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, live: true });
  });

  api.get('/health', async (_req, res) => {
    try {
      res.json(await getHealthInfo());
    } catch (error) {
      res.status(503).json({
        ok: false,
        detail: error instanceof Error ? error.message : 'Error de health',
      });
    }
  });

  api.post('/auth/login', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Credenciales inválidas.',
        details: parsed.error.flatten(),
      });
    }

    const { usuario, password } = parsed.data;

    try {
      let user;
      if (process.env.NODE_ENV !== 'production' && usuario === 'martinrquinta97@gmail.com') {
        user = {
          id: '12345',
          nombre: 'Martin Quinta (Dev)',
          rol: 'superadmin',
          categoria: 'SUPERVISOR',
          loginId: 'martinrquinta97@gmail.com',
          codigoCarga: 'SORTEO01S1900',
          codigoSupervisor: 'S19',
          idOperador: '12345',
          idSupervisor: '12345',
          idVendedor: '12345',
          rolOrigen: 'env_superadmin',
          sucursal: 'Oficina Central',
        };
      } else {
        user = await verifyLoginSqlServer(usuario, password);
      }
      if (!user) {
        return res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
      }
      user = aplicarRolSuperadmin(user, usuario);
      if (!esSuperadminUsuario(user)) {
        user = await enrichOperadorRolDesdeEncuestas(user);
        try {
          await loadOperadoresCatalogAsync();
          const rowsLogin = await fetchEncuestaRowsParaUsuario({
            id: user.id,
            nombre: user.nombre,
            rol: user.rol,
            idSupervisor: user.idSupervisor,
            idVendedor: user.idVendedor,
            codigoCarga: user.codigoCarga,
            loginId: user.loginId,
          });
          user = enriquecerUsuarioConCodigoCarga(user, rowsLogin);
        } catch (err) {
          console.warn(
            'codigoCarga desde encuestas no disponible en login:',
            err instanceof Error ? err.message : err,
          );
        }
      }
      const panelGlobal = esSupervisorPanelGlobal(user.loginId || usuario);
      return res.json({
        token: `sql-${user.id}`,
        usuario: {
          id: user.id,
          nombre: user.nombre,
          rol: user.rol,
          categoria: user.categoria,
          loginId: user.loginId,
          codigoCarga: user.codigoCarga,
          codigoPromotor: user.codigoPromotor,
          codigoSupervisor: user.codigoSupervisor,
          idOperador: user.idOperador,
          idSupervisor: user.idSupervisor,
          idVendedor: user.idVendedor,
          rolOrigen: user.rolOrigen,
          sucursal: user.sucursal,
          ...(panelGlobal ? { panelGlobal: true } : {}),
        },
      });
    } catch (error) {
      console.error('Error login SQL Server:', error);
      return res.status(503).json({
        message: 'No se pudo validar el usuario en el servidor de producción.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.get('/leads/recibos-ocupados', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      console.log('[API /recibos-ocupados] Sesión inválida.');
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      console.log('[API /recibos-ocupados] Iniciando búsqueda global de leads...');
      const leads = await listAllLeadsFromEncuestas();
      const recibos = {};

      const extraerSerieAdhesion = (recibo) => {
        if (!recibo) return null;
        const clean = recibo.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '/');
        const m = clean.match(/^([A-Z]+)(\d+)/);
        if (m) {
          return `${m[1]}${m[2]}`;
        }
        return null;
      };

      for (const l of leads) {
        // Recibo principal
        if (l.seguimiento?.idProducto === 'prod-pij' && l.seguimiento?.numeroRecibo) {
          const clave = extraerSerieAdhesion(l.seguimiento.numeroRecibo);
          if (clave) {
            recibos[clave] = {
              cliente: l.nombre,
              vendedor: l.promotorNombre || 'Sin Vendedor',
              leadId: l.id
            };
          }
        }

        // Compras adicionales
        let adicionales = [];
        if (l.seguimiento?.comprasAdicionales) {
          try {
            adicionales = typeof l.seguimiento.comprasAdicionales === 'string'
              ? JSON.parse(l.seguimiento.comprasAdicionales)
              : l.seguimiento.comprasAdicionales;
          } catch (_) {}
        }

        if (Array.isArray(adicionales)) {
          for (const comp of adicionales) {
            if (comp.idProducto === 'prod-pij' && comp.numeroRecibo) {
              const clave = extraerSerieAdhesion(comp.numeroRecibo);
              if (clave) {
                recibos[clave] = {
                  cliente: l.nombre,
                  vendedor: l.promotorNombre || 'Sin Vendedor',
                  leadId: l.id,
                  isAdicional: true
                };
              }
            }
          }
        }
      }

      console.log(`[API /recibos-ocupados] Búsqueda completada. Total adhesiones indexadas: ${Object.keys(recibos).length}`);
      return res.json({ recibos });
    } catch (error) {
      console.error('[API /recibos-ocupados] Error al listar recibos ocupados:', error);
      return res.status(500).json({
        message: 'Error al obtener la lista de recibos ocupados.',
        detail: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  });

  api.get('/leads', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      getDb();
      const rowsEncuesta = await fetchEncuestaRowsParaUsuario(usuario);
      const leads = await listLeadsFromEncuestas(usuario);
      const direccionOficinasSupervisor = resolveDireccionOficinasSupervisor(rowsEncuesta);
      const conTelefono = leads.filter((l) => l.telefono).length;
      const conFuente = leads.filter((l) => l.seguimiento?.fuente).length;
      const { consumeSeguimientoLecturaDegradada } = await import('./db/seguimiento-sql.js');
      const seguimientoSinPermisoLectura = consumeSeguimientoLecturaDegradada();
      return res.json({
        leads,
        source: 'produccion',
        sp: process.env.SP_ENCUESTAS || 'encuestasMuestraOperador',
        meta: {
          telefonoDesde: 'encuesta.telefono (encuestasMuestraOperador)',
          origenDesde: 'encuesta.origen → seguimiento.fuente (métricas de origen)',
          direccionOficinasSupervisor,
          leadsConTelefono: conTelefono,
          leadsConFuente: conFuente,
          leadsTotal: leads.length,
          ...(seguimientoSinPermisoLectura
            ? {
                seguimientoSinPermisoLectura: true,
                avisoSeguimiento:
                  'No se puede leer el seguimiento guardado (falta EXECUTE en SP_HistorialSeguimientoLead / SP_UltimoSeguimientoOperador, o SELECT en la tabla). Tras F5 los leads vuelven al estado de la encuesta.',
              }
            : {}),
        },
      });
    } catch (error) {
      console.error('Error al listar leads:', error);
      const err = formatSqlError(error);
      return res.status(500).json(err);
    }
  });

  api.get('/notificaciones/links-redes', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    try {
      if (!isLinksAcortadorEnabled()) {
        return res.json({ total: 0, items: [] });
      }
      const usuarioConCodigo = enriquecerUsuarioConCodigoCarga(usuario, []);
      const items = listarNotificacionesParaUsuario(usuarioConCodigo);
      return res.json({
        total: items.length,
        items,
      });
    } catch (error) {
      console.error('Error notificaciones links:', error);
      return res.status(500).json({
        message: 'No se pudieron cargar las notificaciones.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.post('/notificaciones/links-redes/:id/vista', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ message: 'Id de notificación inválido.' });
    }

    if (isLinksAcortadorEnabled()) {
      marcarNotificacionVista(id, usuario.id);
    }
    return res.json({
      ok: true,
      total: isLinksAcortadorEnabled() ? contarNotificacionesParaUsuario(usuario) : 0,
    });
  });

  api.get('/links-redes', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      await loadOperadoresCatalogAsync();
      const links = await resolveLinksRedesParaUsuario(usuario);
      const catalog = await loadOperadoresCatalogAsync();
      const source =
        catalog.catalogSource === 'sql'
          ? catalog.source ?? `STRSYSTEM.${process.env.SP_LINKS_REDES || 'rptLinkQRenRedesSociales'}`
          : 'links-redes.json';
      return res.json({ links, source });
    } catch (error) {
      console.error('Error al resolver links de redes:', error);
      return res.status(500).json({
        message: 'No se pudieron cargar los links de redes.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.get('/promotores', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    if (usuario.rol !== 'supervisor') {
      return res.status(403).json({
        message: 'La vista de promotores solo está disponible para supervisores.',
      });
    }

    try {
      const rows = await fetchEncuestasMuestraRaw(usuario);
      const leads = await listLeadsFromEncuestas(usuario);
      return res.json({
        promotores: buildPromotoresFromLeads(leads, rows),
        source: 'produccion',
      });
    } catch (error) {
      console.error('Error al listar promotores:', error);
      const err = formatSqlError(error);
      return res.status(500).json(err);
    }
  });

  api.get('/admin/dashboard', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso =
      esSuperadminUsuario(usuario) ||
      esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Panel de administración solo disponible para superadmin o supervisores con acceso global.',
      });
    }

    try {
      const periodo = String(req.query.periodo || 'mes').trim().toLowerCase();
      console.log(`[dashboard-debug] API /admin/dashboard llamada con periodo="${periodo}"`);
      const dashboard = await fetchAdminDashboard(periodo);
      console.log(`[dashboard-debug] Dashboard generado para periodo="${periodo}". Rango: ${dashboard.semanaDesde} - ${dashboard.semanaHasta}`);
      return res.json(dashboard);
    } catch (error) {
      console.error('Error admin dashboard:', error);
      const err = formatSqlError(error);
      return res.status(500).json(err);
    }
  });

  api.get('/admin/leads', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso =
      esSuperadminUsuario(usuario) ||
      esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Panel de administración solo disponible para superadmin o supervisores con acceso global.',
      });
    }

    try {
      const leads = await listAllLeadsFromEncuestas();
      return res.json({ leads });
    } catch (error) {
      console.error('Error admin leads list:', error);
      const err = formatSqlError(error);
      return res.status(500).json(err);
    }
  });

  api.get('/admin/operadores', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso =
      esSuperadminUsuario(usuario) ||
      esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Panel de administración solo disponible para superadmin o supervisores con acceso global.',
      });
    }

    try {
      const catalog = await loadOperadoresCatalogAsync();
      const operadores = Object.values(catalog.byCodigo ?? {}).map(o => ({
        nombre: o.vendedor,
        codigo: o.codigo,
        rol: o.rol,
      }));
      return res.json({ operadores });
    } catch (error) {
      console.error('Error al listar operadores:', error);
      return res.status(500).json({
        message: 'No se pudieron cargar los operadores del catálogo.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.post('/admin/sync-caja-pij/preview', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso = esSuperadminUsuario(usuario) || esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Panel de administración solo disponible para superadmin o supervisores con acceso global.',
      });
    }

    try {
      const { buildSyncPreview } = await import('./services/sync-caja.js');
      const leads = await listAllLeadsFromEncuestas();
      const cambiosPropuestos = await buildSyncPreview(leads);
      return res.json({ cambiosPropuestos });
    } catch (error) {
      console.error('Error en previsualización de sync caja:', error);
      return res.status(500).json({
        message: 'Error al obtener datos de la caja.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.post('/admin/sync-caja-pij/commit', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso = esSuperadminUsuario(usuario) || esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Panel de administración solo disponible para superadmin o supervisores con acceso global.',
      });
    }

    const { cambiosAprobados } = req.body;
    if (!cambiosAprobados || !Array.isArray(cambiosAprobados)) {
      return res.status(400).json({ message: 'Se requiere la lista de cambios aprobados.' });
    }

    try {
      const { executeSyncCommit } = await import('./services/sync-caja.js');
      const resultado = await executeSyncCommit(cambiosAprobados, usuario);
      return res.json(resultado);
    } catch (error) {
      console.error('Error al hacer commit de sync caja:', error);
      return res.status(500).json({
        message: 'Error al aplicar los cambios.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.post('/admin/leads/:id/reasignar', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso =
      esSuperadminUsuario(usuario) ||
      esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Panel de administración solo disponible para superadmin o supervisores con acceso global.',
      });
    }

    const leadId = String(req.params.id || '').trim();
    const { usuarioCarga } = req.body;
    if (!leadId) {
      return res.status(400).json({ message: 'Id de lead inválido.' });
    }
    if (!usuarioCarga || !String(usuarioCarga).trim()) {
      return res.status(400).json({ message: 'Código de reasignación requerido.' });
    }

    try {
      getDb();
      const lead = await reasignarLeadManual(
        leadId,
        usuarioCarga,
        usuario,
      );
      return res.json({
        message: 'Lead reasignado correctamente.',
        lead,
      });
    } catch (error) {
      if (error instanceof LeadNoEncontradoError) {
        return res.status(404).json({ message: error.message, code: error.code });
      }
      console.error('Error al reasignar lead:', error);
      return res.status(500).json({
        message: 'No se pudo reasignar el lead.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.post('/admin/leads/:id/duplicate', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso =
      esSuperadminUsuario(usuario) ||
      esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Acción no autorizada. Requiere acceso al panel global para duplicar leads.',
      });
    }

    const leadId = String(req.params.id || '').trim();
    const { codigoVendedorDestino } = req.body;
    if (!leadId) {
      return res.status(400).json({ message: 'Id de lead inválido.' });
    }
    if (!codigoVendedorDestino || !String(codigoVendedorDestino).trim()) {
      return res.status(400).json({ message: 'Código de vendedor de destino requerido.' });
    }

    try {
      getDb();
      const lead = await duplicarLeadEnDb(
        leadId,
        codigoVendedorDestino,
        usuario,
      );
      return res.json({
        message: 'Lead duplicado correctamente.',
        lead,
      });
    } catch (error) {
      if (error instanceof LeadNoEncontradoError) {
        return res.status(404).json({ message: error.message, code: error.code });
      }
      console.error('Error al duplicar lead:', error);
      return res.status(500).json({
        message: 'No se pudo duplicar el lead.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.patch('/admin/leads/:id/datos', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso =
      esSuperadminUsuario(usuario) ||
      esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Acción no autorizada. Requiere acceso al panel global para modificar leads.',
      });
    }

    const leadId = String(req.params.id || '').trim();
    if (!leadId) {
      return res.status(400).json({ message: 'Id de lead inválido.' });
    }

    const {
      nombre,
      telefono,
      domicilio,
      conoceMpc,
      sabiaPlanInversionJoven,
      quiereEntrevista,
      horarioEntrevista,
      lugarEntrevista,
      domicilioEntrevista,
    } = req.body;

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio.' });
    }
    if (!telefono || !String(telefono).trim()) {
      return res.status(400).json({ message: 'El teléfono es obligatorio.' });
    }

    try {
      getDb();
      const leads = await listAllLeadsFromEncuestas();
      const lead = leads.find((l) => String(l.id) === leadId);
      if (!lead) {
        return res.status(404).json({ message: 'Lead no encontrado.' });
      }

      const usuarioSp =
        lead.codigoPromotorCarga?.trim() ||
        lead.encuestaUsuario?.trim() ||
        null;
      if (!usuarioSp) {
        return res.status(400).json({
          message: 'No se encontró el código de promotor del lead. No se puede modificar.',
        });
      }

      function siNo(val) {
        if (val === true) return 'SI';
        if (val === false) return 'NO';
        return null;
      }

      function mapLugar(lugar) {
        if (lugar === 'sucursal') return '2';
        if (lugar === 'domicilio') return '3';
        return null;
      }

      const agendar = Boolean(quiereEntrevista);
      const campo6 = agendar && horarioEntrevista
        ? formatHorarioEntrevistaSp(horarioEntrevista)
        : null;
      const campo7 = agendar && lugarEntrevista ? mapLugar(lugarEntrevista) : null;
      const campo8 = agendar && lugarEntrevista === 'domicilio'
        ? (domicilioEntrevista?.trim() || domicilio?.trim() || null)
        : agendar && lugarEntrevista === 'sucursal'
          ? (domicilioEntrevista?.trim() || null)
          : null;

      const telefonoNorm = digitsTelefono(telefono) || String(telefono).trim();
      const encuesta = lead.codigoCampania || getEncuestaCampaniaId();

      await execEncuestaSorteo01Update({
        idEncuesta: leadId,
        telefono: telefonoNorm,
        encuesta,
        usuario: usuarioSp,
        campo1Valor: String(nombre).trim(),
        campo2Valor: domicilio?.trim() || null,
        campo3Valor: siNo(conoceMpc),
        campo4Valor: siNo(sabiaPlanInversionJoven),
        campo5Valor: agendar ? 'SI' : 'NO',
        campo6Valor: campo6,
        campo7Valor: campo7,
        campo8Valor: campo8,
        origen: 2,
      });

      const leadsPost = await listAllLeadsFromEncuestas();
      const leadActualizado = leadsPost.find((l) => String(l.id) === leadId) ?? lead;

      return res.json({
        message: 'Lead modificado correctamente.',
        lead: leadActualizado,
      });
    } catch (error) {
      if (error instanceof LeadNoEncontradoError) {
        return res.status(404).json({ message: error.message, code: error.code });
      }
      if (error instanceof ContactoYaRegistradoError) {
        return res.status(409).json({ message: error.message, code: error.code });
      }
      if (error instanceof CargaEncuestaSinPersistirError) {
        return res.status(502).json({ message: error.message, code: error.code });
      }
      console.error('Error al modificar lead:', error);
      return res.status(500).json({
        message: 'No se pudo modificar el lead.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.post('/admin/leads/:id/reset', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }
    const tieneAcceso =
      esSuperadminUsuario(usuario) ||
      esSupervisorPanelGlobal(usuario.loginId);
    if (!tieneAcceso) {
      return res.status(403).json({
        message: 'Acción no autorizada. Requiere acceso al panel global para resetear leads.',
      });
    }

    const leadId = String(req.params.id || '').trim();
    if (!leadId) {
      return res.status(400).json({ message: 'Id de lead inválido.' });
    }

    try {
      getDb();
      const leads = await listAllLeadsFromEncuestas();
      const leadOriginal = leads.find((l) => String(l.id) === leadId);
      if (!leadOriginal) {
        return res.status(404).json({ message: 'Lead no encontrado.' });
      }

      await resetearSeguimientoLead(leadId, leadOriginal);

      const leadsPost = await listAllLeadsFromEncuestas();
      const leadActualizado = leadsPost.find((l) => String(l.id) === leadId);

      return res.json({
        message: 'Seguimiento del lead reseteado correctamente.',
        lead: leadActualizado || leadOriginal,
      });
    } catch (error) {
      console.error('Error al resetear lead:', error);
      return res.status(500).json({
        message: 'No se pudo resetear el lead.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.get('/barrios', (_req, res) => {
    if (!respondIfNotConfigured(res)) return;
    try {
      getDb();
      return res.json({ barrios: listBarrios() });
    } catch (error) {
      return res.status(500).json({
        message: 'Error al listar barrios.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.get('/productos', (req, res) => {
    if (!respondIfNotConfigured(res)) return;
    try {
      getDb();
      const rol = String(req.query.rol || '');
      let productos = listProductos();
      if (rol === 'promotor' || rol === 'supervisor' || rol === 'superadmin') {
        productos = productos.filter((p) =>
          p.rolesPermitidos.includes(rol === 'superadmin' ? 'supervisor' : rol),
        );
      }
      return res.json({ productos });
    } catch (error) {
      return res.status(500).json({
        message: 'Error al listar productos.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.post('/leads', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const parsed = nuevoLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Datos del lead inválidos.',
        details: parsed.error.flatten(),
      });
    }

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      getDb();
      const context = await resolveCargaEncuestaContext(usuario);
      const usuarioEnriquecido = enriquecerUsuarioConCodigoCarga(usuario, context.rows);
      const { lead, actualizado } = await crearEncuestaManual(parsed.data, usuarioEnriquecido, {
        promotorNombre:
          usuario.rol === 'promotor'
            ? usuario.nombre
            : String(req.headers['x-promotor-nombre'] || '').trim() || undefined,
      });
      return res.status(actualizado ? 200 : 201).json({
        message: actualizado
          ? 'Lead actualizado correctamente.'
          : 'Lead cargado correctamente.',
        lead,
        actualizado: Boolean(actualizado),
      });
    } catch (error) {
      if (error instanceof CodigoPromotorCargaError) {
        return res.status(400).json({
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof ContactoYaRegistradoError) {
        return res.status(409).json({
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof CargaEncuestaSinPersistirError) {
        console.warn(
          '[CargaEncuestaSinPersistir] detail:',
          error.detail,
          'technical:',
          error.technicalDetail,
        );
        return res.status(error.status).json({
          message: error.message,
          code: error.code,
          detail: error.detail,
          technicalDetail: error.technicalDetail,
        });
      }
      console.error('Error al cargar lead manual:', error);
      return res.status(500).json({
        message: 'No se pudo cargar el lead.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.patch('/leads/:id/telefono', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const parsed = modificarTelefonoLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Teléfono inválido.',
        details: parsed.error.flatten(),
      });
    }

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    const leadId = String(req.params.id || '').trim();
    if (!leadId) {
      return res.status(400).json({ message: 'Id de lead inválido.' });
    }

    try {
      getDb();
      const lead = await modificarTelefonoLeadManual(
        leadId,
        parsed.data.telefono,
        usuario,
      );
      return res.json({
        message: 'Teléfono actualizado correctamente.',
        lead,
      });
    } catch (error) {
      if (error instanceof LeadNoEncontradoError) {
        return res.status(404).json({ message: error.message, code: error.code });
      }
      if (error instanceof LeadNoManualError) {
        return res.status(403).json({ message: error.message, code: error.code });
      }
      if (error instanceof ContactoYaRegistradoError) {
        return res.status(409).json({ message: error.message, code: error.code });
      }
      console.error('Error al modificar teléfono:', error);
      return res.status(500).json({
        message: 'No se pudo modificar el teléfono.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.get('/leads/:id/historial', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      if (!useSeguimientoSql()) getDb();
      const { listLeadsFromEncuestas } = await import('./db/encuestas.js');
      const leads = await listLeadsFromEncuestas(usuario);
      const lead = leads.find((l) => l.id === req.params.id);
      if (!lead) {
        return res.status(404).json({ message: 'Lead no encontrado en tus encuestas asignadas.' });
      }
      const idOperador = parseInt(String(usuario.id ?? ''), 10);
      const historial = await listHistorialForLead(req.params.id, lead, {
        idOperador: Number.isFinite(idOperador) ? idOperador : null,
      });
      return res.json({ historial });
    } catch (error) {
      console.error('Error al leer historial:', error);
      return res.status(500).json({
        message: 'Error al leer historial de seguimiento.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  api.patch('/leads/:id/seguimiento', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const parsed = seguimientoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Datos de seguimiento inválidos.',
        details: parsed.error.flatten(),
      });
    }

    const rol = req.headers['x-usuario-rol'];
    const idUsuario = req.headers['x-usuario-id'];
    const data = parsed.data;

    if (data.resultadoEntrevista === 'compro' && data.idProducto) {
      if (!rol || !productoPermitidoParaRol(data.idProducto, rol)) {
        return res.status(403).json({
          message: 'Tu rol no puede registrar la venta de ese producto.',
        });
      }
    }

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      const result = await updateLeadSeguimientoEncuesta(
        req.params.id,
        data,
        usuario,
        idUsuario ?? null,
      );
      if (!result?.lead) {
        return res.status(404).json({ message: 'Lead no encontrado en tus encuestas asignadas.' });
      }
      const { lead, saved, entradaHistorial, referidosCreados, nuevosLeads } = result;
      const idOperador = parseInt(String(usuario.id ?? ''), 10);
      let historial = await listHistorialForLead(req.params.id, lead, {
        limit: 30,
        idOperador: Number.isFinite(idOperador) ? idOperador : null,
      });
      if (entradaHistorial && saved) {
        historial = [
          entradaHistorial,
          ...historial.filter((h) => h.id !== entradaHistorial.id),
        ];
      }
      let message = saved ? 'Seguimiento actualizado.' : 'Sin cambios respecto al último guardado.';
      const creados = (referidosCreados ?? []).filter((r) => r.estado === 'creado');
      const duplicados = (referidosCreados ?? []).filter((r) => r.estado === 'duplicado');
      if (creados.length) {
        message += ` Se cargaron ${creados.length} referido(s) como lead(s) nuevo(s).`;
      }
      if (duplicados.length) {
        message += ` ${duplicados.length} referido(s) ya estaban registrados.`;
      }

      return res.json({
        message,
        lead,
        historial,
        entradaHistorial: saved ? entradaHistorial : null,
        referidosCreados: referidosCreados ?? [],
        nuevosLeads: nuevosLeads ?? [],
      });
    } catch (error) {
      if (
        error?.code === 'CIERRE_SUPERVISOR_SOLO_LECTURA' ||
        error?.code === 'ENTREVISTA_PROMOTOR_PENDIENTE_DERIVACION' ||
        error?.code === 'PRIORIDAD_PROMOTOR_BLOQUEO_48H'
      ) {
        return res.status(403).json({
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof SeguimientoRegistroError) {
        return res.status(400).json({
          message: error.message,
          code: error.code,
        });
      }
      if (error instanceof CodigoPromotorCargaError) {
        return res.status(400).json({
          message: error.message,
          code: error.code,
        });
      }
      console.error('Error al guardar seguimiento:', error);
      return res.status(500).json({
        message: 'Error al guardar seguimiento.',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  registerGrabacionesRoutes(api, { usuarioDesdeRequest });
}

function mountStaticAndSpa(app, distPath, basePath) {
  const indexHtml = path.join(distPath, 'index.html');
  const staticOptions = {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  };

  const serveSpa = (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexHtml);
  };

  const mountPrefix = (prefix) => {
    const p = prefix || '';
    app.use(p, express.static(distPath, staticOptions));
    if (p) {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      app.get(new RegExp(`^${escaped}$`), serveSpa);
      app.get(new RegExp(`^${escaped}/.+$`), (req, res, next) => {
        if (req.path.includes('/api')) return next();
        serveSpa(req, res);
      });
    } else {
      app.get(/^(?!\/api).*/, serveSpa);
    }
  };

  if (basePath) mountPrefix(basePath);
  mountPrefix('');
}

export function createApp(distPath) {
  const app = express();
  const basePath = getAppBasePath();

  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  registerApiRoutes(api);
  app.use('/api', api);
  if (basePath) app.use(`${basePath}/api`, api);

  if (existsSync(distPath)) {
    mountStaticAndSpa(app, distPath, basePath);
  }

  return app;
}
