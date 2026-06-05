import sql from 'mssql';
import {
  execEncuestaCargaSorteo01,
  getEncuestaCampaniaId,
  telefonoYaEnCampania,
  digitsTelefono,
  ContactoYaRegistradoError,
  CodigoPromotorCargaError,
} from './encuesta-carga.js';
import { listLeadsFromEncuestas, normalizeNombre } from './encuestas.js';
import { getSqlPoolEncuestas, isSqlServerConfigured } from './mssql.js';
import { persistirSeguimientoLead, useSeguimientoSql } from './seguimiento-sql.js';

function autoCargaReferidosHabilitada() {
  return (
    String(process.env.REFERIDOS_AUTO_CARGA ?? 'true').trim().toLowerCase() !== 'false'
  );
}

function origenSpReferido() {
  const raw = String(process.env.SP_CARGA_ORIGEN_REFERIDO ?? '2').trim();
  return raw.charAt(0) || '2';
}

function nombreSpRegistrarReferido() {
  const raw = String(process.env.SP_REGISTRAR_REFERIDO ?? 'SP_RegistrarReferidoLead').trim();
  return raw || null;
}

/** Usar SP_RegistrarReferidoLead (tabla lead_referido) cuando no está desactivado explícitamente. */
export function referidosUseSpVinculo() {
  if (String(process.env.REFERIDOS_USE_SP ?? 'true').trim().toLowerCase() === 'false') {
    return false;
  }
  return Boolean(nombreSpRegistrarReferido());
}

function nombreSpObtenerMetaReferidos() {
  const raw = String(
    process.env.SP_OBTENER_META_REFERIDO ?? 'SP_ObtenerMetaReferidosLead',
  ).trim();
  return raw || null;
}

function parseIdEncuesta(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickSpRow(row) {
  if (!row) return {};
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function resolveEquipoComercialReferido(leadPadre, usuario, operadorId) {
  const rol = String(usuario?.rol ?? '').toLowerCase();
  return {
    idVendedor:
      parseIdEncuesta(leadPadre?.idVendedor) ??
      parseIdEncuesta(usuario?.idVendedor) ??
      (rol === 'promotor' ? operadorId : null),
    idSupervisor:
      parseIdEncuesta(leadPadre?.idSupervisor) ??
      parseIdEncuesta(usuario?.idSupervisor) ??
      (rol === 'supervisor' ? operadorId : null),
  };
}

/**
 * exec dbo.SP_RegistrarReferidoLead — alta encuesta + vínculo lead_referido.
 * Requiere script sql/lead_referido-tabla-sp.sql desplegado en STRSYSTEM.
 */
export async function execRegistrarReferidoLead(params) {
  const proc = nombreSpRegistrarReferido();
  if (!proc) {
    throw new Error('SP_REGISTRAR_REFERIDO no configurado.');
  }
  const pool = await getSqlPoolEncuestas();
  const request = pool.request();

  request.input('id_encuesta_origen', sql.Int, params.idEncuestaOrigen);
  request.input('telefono', sql.NVarChar(50), params.telefono);
  request.input('nombre', sql.NVarChar(200), params.nombre);
  request.input('encuesta', sql.NVarChar(50), params.encuesta);
  request.input('usuario', sql.NVarChar(100), params.usuario);
  request.input('operador_id', sql.Int, params.operadorId);
  request.input('operador_rol', sql.NVarChar(16), params.operadorRol);
  request.input('id_registro_seguimiento', sql.Int, params.idRegistroSeguimiento ?? null);
  request.input('origen_carga', sql.Char(1), params.origenCarga ?? origenSpReferido());
  request.input('campo2_valor', sql.NVarChar(200), params.campo2Valor ?? null);

  request.output('id_encuesta_referido', sql.Int);
  request.output('id_lead_referido', sql.Int);
  request.output('codigo', sql.Int);
  request.output('gestionCodigo', sql.Int);
  request.output('mensaje', sql.NVarChar(500));

  const result = await request.execute(proc);
  const row = pickSpRow(result.recordset?.[0] ?? {});
  return {
    idEncuestaReferido:
      result.output?.id_encuesta_referido ??
      row.id_encuesta_referido ??
      null,
    idLeadReferido: result.output?.id_lead_referido ?? row.id_lead_referido ?? null,
    codigo: result.output?.codigo ?? row.codigo ?? 0,
    gestionCodigo: result.output?.gestioncodigo ?? row.gestioncodigo ?? 0,
    mensaje: String(result.output?.mensaje ?? row.mensaje ?? ''),
  };
}

function spNoEncontrado(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /could not find stored procedure|invalid object name/i.test(msg);
}

function parseMetaReferidoRow(row) {
  const r = pickSpRow(row);
  const idRef = parseIdEncuesta(r.id_encuesta_referido);
  if (!idRef) return null;
  return {
    idEncuestaReferido: idRef,
    idEncuestaOrigen: parseIdEncuesta(r.id_encuesta_origen),
    idEncuestaRaiz: parseIdEncuesta(r.id_encuesta_raiz),
    nivel: Number(r.nivel) || 1,
    operadorRol: String(r.operador_rol ?? '').toLowerCase(),
    visiblePromotor: r.visible_promotor === true || r.visible_promotor === 1,
  };
}

/** Metadatos vía SP (MPCSP no tiene SELECT directo en lead_referido). */
export async function fetchReferidosMetaPorIds(idsEncuesta = []) {
  const map = new Map();
  if (!referidosUseSpVinculo() || !isSqlServerConfigured()) return map;

  const proc = nombreSpObtenerMetaReferidos();
  if (!proc) return map;

  const ids = [...new Set(idsEncuesta.map(parseIdEncuesta).filter(Boolean))];
  if (!ids.length) return map;

  try {
    const pool = await getSqlPoolEncuestas();
    const request = pool.request();
    request.input('ids_encuesta', sql.NVarChar(sql.MAX), ids.join(','));

    const result = await request.execute(proc);

    for (const row of result.recordset ?? []) {
      const meta = parseMetaReferidoRow(row);
      if (!meta) continue;
      map.set(String(meta.idEncuestaReferido), meta);
    }
  } catch (error) {
    if (!spNoEncontrado(error)) {
      console.warn(
        '[referidos] SP_ObtenerMetaReferidosLead no disponible:',
        error instanceof Error ? error.message : error,
      );
    }
  }
  return map;
}

/** Enriquece leads con esReferido; filtra referidos de supervisor para promotor. */
export function aplicarMetaReferidosEnLeads(leads, metaMap, usuario) {
  const rol = String(usuario?.rol ?? '').toLowerCase();
  const enriquecidos = leads.map((lead) => {
    const meta = metaMap.get(String(lead.id));
    if (!meta) return lead;
    return {
      ...lead,
      esReferido: true,
      leadReferidoDeId: meta.idEncuestaOrigen ? String(meta.idEncuestaOrigen) : undefined,
      leadReferidoRaizId: meta.idEncuestaRaiz ? String(meta.idEncuestaRaiz) : undefined,
      nivelReferido: meta.nivel,
      referidoCargadoPorRol: meta.operadorRol === 'supervisor' || meta.operadorRol === 'promotor'
        ? meta.operadorRol
        : undefined,
    };
  });

  if (rol !== 'promotor') return enriquecidos;

  return enriquecidos.filter((lead) => {
    const meta = metaMap.get(String(lead.id));
    if (!meta) return true;
    return meta.visiblePromotor !== false && meta.operadorRol !== 'supervisor';
  });
}

function normalizarTelefonoReferido(raw) {
  return digitsTelefono(raw) || String(raw ?? '').trim();
}

function claveTelefono(raw) {
  return normalizarTelefonoReferido(raw);
}

/** Referidos que aún no fueron procesados (por teléfono). */
export function referidosPendientesDeCarga(referidos, referidosGenerados, telefonoLeadPadre) {
  const vistos = new Set(
    (referidosGenerados ?? []).map((r) => claveTelefono(r.telefono)).filter(Boolean),
  );
  const telPadre = claveTelefono(telefonoLeadPadre);

  const pendientes = [];
  for (const ref of referidos ?? []) {
    const nombre = String(ref?.nombre ?? '').trim();
    const tel = claveTelefono(ref?.telefono);
    if (!nombre || !tel || tel.length < 6) continue;
    if (telPadre && tel === telPadre) continue;
    if (vistos.has(tel)) continue;
    vistos.add(tel);
    pendientes.push({ nombre, telefono: tel });
  }
  return pendientes;
}

function mergeReferidosGenerados(prev = [], nuevos = []) {
  const map = new Map();
  for (const r of prev) {
    const k = claveTelefono(r.telefono);
    if (k) map.set(k, r);
  }
  for (const r of nuevos) {
    const k = claveTelefono(r.telefono);
    if (k) map.set(k, r);
  }
  return [...map.values()];
}

function resolveUsuarioSpDesdeLeadPadre(leadPadre) {
  return (
    leadPadre.codigoPromotorCarga?.trim() ||
    leadPadre.encuestaUsuario?.trim() ||
    null
  );
}

function buscarLeadPorTelefono(leads, telefono, encuesta) {
  const tel = claveTelefono(telefono);
  const enc = encuesta || getEncuestaCampaniaId();
  return leads.find((l) => {
    if (claveTelefono(l.telefono) !== tel) return false;
    const encLead = l.codigoCampania || getEncuestaCampaniaId();
    return String(encLead).toLowerCase() === String(enc).toLowerCase();
  });
}

async function marcarSeguimientoReferido(leadId, leadPadre, usuario) {
  if (!useSeguimientoSql()) return;
  try {
    await persistirSeguimientoLead(
      leadId,
      {
        fuente: 'app',
        observaciones: `Referido de ${leadPadre.nombre} (lead #${leadPadre.id}).`,
      },
      usuario,
      { id: leadId, seguimiento: {} },
    );
  } catch (error) {
    console.warn(
      '[referidos] Seguimiento inicial del referido no guardado:',
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Alta en encuesta de referidos pendientes. Idempotente vía referidosGenerados.
 * @returns {{ referidosGenerados: object[], resultados: object[], nuevosLeads: object[] }}
 */
export async function crearLeadsDesdeReferidos(leadPadre, seguimientoPatch, usuario) {
  const vacio = { referidosGenerados: seguimientoPatch.referidosGenerados ?? [], resultados: [], nuevosLeads: [] };

  if (!autoCargaReferidosHabilitada()) return vacio;
  if (seguimientoPatch.brindoReferidos !== true) return vacio;
  if (!isSqlServerConfigured()) return vacio;

  const referidos = Array.isArray(seguimientoPatch.referidos) ? seguimientoPatch.referidos : [];
  if (!referidos.length) return vacio;

  const usuarioSp = resolveUsuarioSpDesdeLeadPadre(leadPadre);
  if (!usuarioSp) {
    return {
      ...vacio,
      resultados: [
        {
          estado: 'error',
          mensaje: 'No se encontró código de promotor para cargar referidos.',
        },
      ],
    };
  }

  const pendientes = referidosPendientesDeCarga(
    referidos,
    seguimientoPatch.referidosGenerados,
    leadPadre.telefono,
  );
  if (!pendientes.length) return vacio;

  const encuesta = leadPadre.codigoCampania || getEncuestaCampaniaId();
  const resultados = [];
  const nuevosLeads = [];
  const generadosNuevos = [];

  let leadsCache = await listLeadsFromEncuestas(usuario);

  const idEncuestaOrigen = parseIdEncuesta(leadPadre.id);
  const operadorId = parseIdEncuesta(usuario?.id ?? usuario?.idOperador);
  const operadorRol = String(usuario?.rol ?? 'promotor').toLowerCase();
  const useSpVinculo = referidosUseSpVinculo() && idEncuestaOrigen != null && operadorId != null;
  const equipo = resolveEquipoComercialReferido(leadPadre, usuario, operadorId);

  for (const ref of pendientes) {
    if (telefonoYaEnCampania(leadsCache, ref.telefono, encuesta)) {
      const existente = buscarLeadPorTelefono(leadsCache, ref.telefono, encuesta);
      const item = {
        nombre: ref.nombre,
        telefono: ref.telefono,
        leadId: existente ? String(existente.id) : undefined,
        estado: 'duplicado',
        mensaje: 'Ya existía un contacto con ese teléfono en la campaña.',
      };
      resultados.push(item);
      generadosNuevos.push(item);
      continue;
    }

    try {
      let idReferidoSp = null;
      if (useSpVinculo) {
        const spOut = await execRegistrarReferidoLead({
          idEncuestaOrigen,
          telefono: ref.telefono,
          nombre: ref.nombre,
          encuesta,
          usuario: usuarioSp,
          operadorId,
          operadorRol,
          idRegistroSeguimiento: null,
          origenCarga: origenSpReferido(),
        });

        if (!spOut.codigo && spOut.gestionCodigo === 0) {
          const item = {
            nombre: ref.nombre,
            telefono: ref.telefono,
            estado: 'error',
            mensaje: spOut.mensaje || 'SP_RegistrarReferidoLead no registró el referido.',
          };
          resultados.push(item);
          generadosNuevos.push(item);
          continue;
        }

        if (spOut.gestionCodigo === 0 && spOut.codigo === 1) {
          const existente = buscarLeadPorTelefono(leadsCache, ref.telefono, encuesta);
          const item = {
            nombre: ref.nombre,
            telefono: ref.telefono,
            leadId: existente
              ? String(existente.id)
              : spOut.idEncuestaReferido
                ? String(spOut.idEncuestaReferido)
                : undefined,
            estado: 'duplicado',
            mensaje: spOut.mensaje || 'El referido ya estaba registrado en la campaña.',
          };
          resultados.push(item);
          generadosNuevos.push(item);
          continue;
        }
        idReferidoSp = spOut.idEncuestaReferido;
      } else {
        await execEncuestaCargaSorteo01({
          telefono: ref.telefono,
          encuesta,
          usuario: usuarioSp,
          campo1Valor: ref.nombre,
          campo2Valor: null,
          campo3Valor: null,
          campo4Valor: null,
          campo6Valor: null,
          campo7Valor: null,
          campo8Valor: null,
          origen: origenSpReferido(),
        });
      }

      leadsCache = await listLeadsFromEncuestas(usuario);
      const creado =
        (idReferidoSp &&
          leadsCache.find((l) => String(l.id) === String(idReferidoSp))) ??
        buscarLeadPorTelefono(leadsCache, ref.telefono, encuesta) ??
        leadsCache.find(
          (l) => normalizeNombre(l.nombre) === normalizeNombre(ref.nombre),
        );

      if (!creado) {
        const item = {
          nombre: ref.nombre,
          telefono: ref.telefono,
          estado: 'error',
          mensaje: 'El SP ejecutó pero el referido no aparece en el listado.',
        };
        resultados.push(item);
        generadosNuevos.push(item);
        continue;
      }

      await marcarSeguimientoReferido(String(creado.id), leadPadre, usuario);

      leadsCache = await listLeadsFromEncuestas(usuario);
      const leadActualizado =
        leadsCache.find((l) => String(l.id) === String(creado.id)) ?? creado;

      const item = {
        nombre: ref.nombre,
        telefono: ref.telefono,
        leadId: String(leadActualizado.id),
        estado: 'creado',
      };
      resultados.push(item);
      generadosNuevos.push(item);
      nuevosLeads.push(leadActualizado);
    } catch (error) {
      if (useSpVinculo && spNoEncontrado(error)) {
        console.warn(
          '[referidos] SP_RegistrarReferidoLead no disponible; reintentando solo con encuestaCargaSorteo01.',
        );
        try {
          await execEncuestaCargaSorteo01({
            telefono: ref.telefono,
            encuesta,
            usuario: usuarioSp,
            campo1Valor: ref.nombre,
            campo2Valor: null,
            campo3Valor: null,
            campo4Valor: null,
            campo6Valor: null,
            campo7Valor: null,
            campo8Valor: null,
            origen: origenSpReferido(),
          });
          leadsCache = await listLeadsFromEncuestas(usuario);
          const creadoFb = buscarLeadPorTelefono(leadsCache, ref.telefono, encuesta);
          if (creadoFb) {
            await marcarSeguimientoReferido(String(creadoFb.id), leadPadre, usuario);
            const item = {
              nombre: ref.nombre,
              telefono: ref.telefono,
              leadId: String(creadoFb.id),
              estado: 'creado',
              mensaje: 'Creado sin vínculo lead_referido (SP pendiente en DB).',
            };
            resultados.push(item);
            generadosNuevos.push(item);
            nuevosLeads.push(creadoFb);
          }
        } catch (fbErr) {
          const item = {
            nombre: ref.nombre,
            telefono: ref.telefono,
            estado: 'error',
            mensaje: fbErr instanceof Error ? fbErr.message : 'Error al cargar referido.',
          };
          resultados.push(item);
          generadosNuevos.push(item);
        }
        continue;
      }
      if (error instanceof ContactoYaRegistradoError) {
        const existente = buscarLeadPorTelefono(leadsCache, ref.telefono, encuesta);
        const item = {
          nombre: ref.nombre,
          telefono: ref.telefono,
          leadId: existente ? String(existente.id) : undefined,
          estado: 'duplicado',
          mensaje: error.message,
        };
        resultados.push(item);
        generadosNuevos.push(item);
        continue;
      }
      if (error instanceof CodigoPromotorCargaError) {
        throw error;
      }
      const item = {
        nombre: ref.nombre,
        telefono: ref.telefono,
        estado: 'error',
        mensaje: error instanceof Error ? error.message : 'Error al cargar referido.',
      };
      resultados.push(item);
      generadosNuevos.push(item);
    }
  }

  return {
    referidosGenerados: mergeReferidosGenerados(
      seguimientoPatch.referidosGenerados,
      generadosNuevos,
    ),
    resultados,
    nuevosLeads,
  };
}
