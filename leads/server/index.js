import './load-env.js';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPromotoresFromLeads,
  enrichOperadorRolDesdeEncuestas,
  listLeadsFromEncuestas,
  updateLeadSeguimientoEncuesta,
} from './db/encuestas.js';
import { isSqlServerConfigured, verifyLoginSqlServer } from './db/mssql.js';
import { getDb, listBarrios, listProductos, productoPermitidoParaRol } from './db/sqlite.js';
import { getHealthInfo, respondIfNotConfigured } from './require-production.js';
import { formatSqlError } from './sql-errors.js';
import { loginSchema, seguimientoSchema } from './schemas/seguimiento.js';

function usuarioDesdeRequest(req) {
  const rol = req.headers['x-usuario-rol'];
  const nombre = String(req.headers['x-usuario-nombre'] || '').trim();
  const id = String(req.headers['x-usuario-id'] || '').trim();
  if (rol !== 'promotor' && rol !== 'supervisor') return null;
  if (!nombre || !id) return null;
  return { id, nombre, rol };
}

function normalizarBase(ruta) {
  const limpio = String(ruta || '/leads').trim();
  if (!limpio || limpio === '/') return '/leads';
  const conSlash = limpio.startsWith('/') ? limpio : `/${limpio}`;
  return conSlash.replace(/\/$/, '') || '/leads';
}

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const BASE = normalizarBase(process.env.BASE_PATH || '/leads');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');

const api = express.Router();

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

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
    const leads = await listLeadsFromEncuestas(usuario);
    const conTelefono = leads.filter((l) => l.telefono).length;
    return res.json({
      leads,
      source: 'produccion',
      sp: process.env.SP_ENCUESTAS || 'encuestasMuestraOperador',
      meta: {
        telefonoDesde: 'encuesta.telefono (encuestasMuestraOperador)',
        leadsConTelefono: conTelefono,
        leadsTotal: leads.length,
      },
    });
  } catch (error) {
    console.error('Error al listar leads:', error);
    const err = formatSqlError(error);
    return res.status(500).json(err);
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
    const leads = await listLeadsFromEncuestas(usuario);
    return res.json({ promotores: buildPromotoresFromLeads(leads), source: 'produccion' });
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
    return res.json({
      message: 'Seguimiento actualizado.',
      lead,
    });
  } catch (error) {
    console.error('Error al guardar seguimiento:', error);
    return res.status(500).json({
      message: 'Error al guardar seguimiento.',
      detail: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
});

app.use(`${BASE}/api`, api);

// Solo redirigir sin barra final; con routing no estricto, GET /leads matchea /leads/ y generaba bucle.
app.get(BASE, (req, res, next) => {
  const pathOnly = req.originalUrl.split('?')[0];
  if (pathOnly === BASE) {
    return res.redirect(301, `${BASE}/`);
  }
  next();
});

if (existsSync(distPath)) {
  app.use(BASE, express.static(distPath, { redirect: false }));
  const spaPattern = new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/.*)?$`);
  app.get(spaPattern, (req, res, next) => {
    if (req.path.startsWith(`${BASE}/api`)) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  getDb();
  console.log(`CRM Seguimiento Leads ??? http://localhost:${PORT}${BASE}`);
  if (isSqlServerConfigured()) {
    console.log('Modo: PRODUCCI??N (sin datos de muestra)');
    console.log(
      `  Login ??? ${process.env.SP_LOGIN || 'operadorAccesoCategoria'} @ ${process.env.DB_NAME}`,
    );
    console.log(
      `  Leads ??? ${process.env.SP_ENCUESTAS || 'encuestasMuestraOperador'} @idVendedor @ ${process.env.ENCUESTAS_DB_NAME || process.env.DB_NAME}`,
    );
    console.log('  WhatsApp ? columna telefono de la encuesta (no usar Contacto en 2/3)');
    console.log('  Caché local: seguimiento de la app en data/app-cache.db');
  } else {
    console.error('FALTA .env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME ??? no hay modo demo.');
  }
});
