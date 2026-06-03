import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CargaEncuestaSinPersistirError,
  CodigoPromotorCargaError,
  ContactoYaRegistradoError,
  crearEncuestaManual,
} from './db/encuesta-carga.js';
import {
  buildPromotoresFromLeads,
  enrichOperadorRolDesdeEncuestas,
  fetchEncuestasMuestraRaw,
  listLeadsFromEncuestas,
  resolveDireccionOficinasSupervisor,
  updateLeadSeguimientoEncuesta,
} from './db/encuestas.js';
import { resolveLinksRedesParaUsuario } from './db/links-redes.js';
import { enriquecerUsuarioConCodigoCarga } from './db/operadores-catalog.js';
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
} from './db/seguimiento-sql.js';
import { getHealthInfo, respondIfNotConfigured } from './require-production.js';
import { formatSqlError } from './sql-errors.js';
import { loginSchema, seguimientoSchema } from './schemas/seguimiento.js';

function usuarioDesdeRequest(req) {
  const rol = req.headers['x-usuario-rol'];
  const nombre = String(req.headers['x-usuario-nombre'] || '').trim();
  const id = String(req.headers['x-usuario-id'] || '').trim();
  const loginId = String(req.headers['x-usuario-login-id'] || '').trim();
  const codigoCarga = String(req.headers['x-usuario-codigo-carga'] || '').trim();
  if (rol !== 'promotor' && rol !== 'supervisor') return null;
  if (!nombre || !id) return null;
  return {
    id,
    nombre,
    rol,
    loginId: loginId || undefined,
    codigoCarga: codigoCarga || undefined,
    idOperador: id,
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
      let user = await verifyLoginSqlServer(usuario, password);
      if (!user) {
        return res.status(401).json({ message: 'Usuario o contraseña incorrectos.' });
      }
      user = await enrichOperadorRolDesdeEncuestas(user);
      return res.json({
        token: `sql-${user.id}`,
        usuario: {
          id: user.id,
          nombre: user.nombre,
          rol: user.rol,
          categoria: user.categoria,
          loginId: user.loginId,
          codigoCarga: user.codigoCarga,
          idOperador: user.idOperador,
          idSupervisor: user.idSupervisor,
          idVendedor: user.idVendedor,
          rolOrigen: user.rolOrigen,
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

  api.get('/leads', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      getDb();
      const rowsEncuesta = await fetchEncuestasMuestraRaw(usuario);
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
                  'Falta permiso SELECT en registrarSeguimientoLead: los leads se muestran sin estado de seguimiento guardado.',
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

  api.get('/links-redes', async (req, res) => {
    if (!respondIfNotConfigured(res)) return;

    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida. Volvé a iniciar sesión.' });
    }

    try {
      // Catálogo JSON (planilla): no requiere EXECUTE en encuestasMuestraOperador.
      const usuarioConCodigo = enriquecerUsuarioConCodigoCarga(usuario, []);
      const links = resolveLinksRedesParaUsuario(usuarioConCodigo, []);
      return res.json({ links, source: 'links-redes.json' });
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
      if (rol === 'promotor' || rol === 'supervisor') {
        productos = productos.filter((p) => p.rolesPermitidos.includes(rol));
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
      const lead = await crearEncuestaManual(parsed.data, usuario, {
        promotorNombre:
          usuario.rol === 'promotor'
            ? usuario.nombre
            : String(req.headers['x-promotor-nombre'] || '').trim() || undefined,
      });
      return res.status(201).json({
        message: 'Lead cargado correctamente.',
        lead,
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
        return res.status(error.status).json({
          message: error.message,
          code: error.code,
          detail: error.detail,
        });
      }
      console.error('Error al cargar lead manual:', error);
      return res.status(500).json({
        message: 'No se pudo cargar el lead.',
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
      const historial = await listHistorialForLead(req.params.id, lead);
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
      const lead = await updateLeadSeguimientoEncuesta(
        req.params.id,
        data,
        usuario,
        idUsuario ?? null,
      );
      if (!lead) {
        return res.status(404).json({ message: 'Lead no encontrado en tus encuestas asignadas.' });
      }
      const historial = await listHistorialForLead(req.params.id, lead, { limit: 30 });
      return res.json({
        message: 'Seguimiento actualizado.',
        lead,
        historial,
      });
    } catch (error) {
      if (error instanceof SeguimientoRegistroError) {
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
