import "dotenv/config";
import compression from "compression";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";
import { z } from "zod";

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 3001;
const SP_NAME = process.env.SP_NAME || "dbo.encuestaCargaSorteo01";
const SP_INTERVIEW =
  process.env.SP_INTERVIEW_NAME || "dbo.encuestaActualizaEntrevistaSorteo01";
const ENCUESTA_TABLE = process.env.ENCUESTA_TABLE_NAME || "encuesta";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");

const sqlConfig = {
  server: process.env.DB_HOST || "",
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "",
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
    connectTimeout: 15_000,
    requestTimeout: 30_000,
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30_000,
  },
};

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(sqlConfig);
  }
  return poolPromise;
}

const encuestaSchema = z.object({
  participante: z.object({
    nombreCompleto: z.string().trim().min(3).max(120),
    barrio: z.string().trim().min(2).max(100),
  }),
  respuestas: z
    .array(
      z.object({
        codigoPregunta: z.string().trim().min(3).max(60),
        valor: z.string().trim().min(1).max(200),
      })
    )
    .min(2),
  telefono: z.string().trim().min(8).max(50),
  idSorteo: z.string().trim().min(3).max(50),
  codigoPromotor: z.string().trim().min(2).max(100),
  nombreSorteo: z.string().trim().max(120).optional().default(""),
  codigoQr: z.string().trim().max(80).optional().default(""),
  mensajeWhatsapp: z.string().trim().max(100).optional().default(""),
  origen: z.string().trim().max(80).optional().default("whatsapp-encuesta-directa"),
  /** Vienen del link de WhatsApp (query string), no de un SP. */
  telefonoSupervisor: z.string().trim().max(50).optional().default(""),
  domicilioSucursal: z.string().trim().max(250).optional().default(""),
});

function aMayusculas(valor) {
  return String(valor || "").trim().toUpperCase();
}

/**
 * El SP espera la fecha y hora con el formato exacto "AAAA/MM/DD hh:mm".
 * El front la envía en ISO "AAAA-MM-DDThh:mm".
 */
function aFormatoFechaSP(isoDateTime) {
  if (!isoDateTime) return "";
  const valor = String(isoDateTime).trim();
  const [fecha, hora] = valor.split("T");
  if (!fecha || !hora) return valor;
  return `${fecha.replaceAll("-", "/")} ${hora}`;
}

/**
 * Modo de contacto (campo7): 1 = teléfono cliente, 2 = en sucursal, 3 = domicilio cliente.
 * campo8: vacío si 1; sucursal supervisor si 2; domicilio cliente si 3.
 */
function modalidadACodigo(modalidad) {
  const m = aMayusculas(modalidad);
  if (m === "TELEFONICA") return "1";
  if (m === "SUCURSAL") return "2";
  if (m === "DOMICILIO") return "3";
  return "";
}

function obtenerPrimeraFilaResultado(resultado) {
  const conjuntos = resultado.recordsets?.length
    ? resultado.recordsets
    : resultado.recordset?.length
      ? [resultado.recordset]
      : [];
  return conjuntos.map((grupo) => grupo?.[0]).find(Boolean) ?? null;
}

function extraerMensajeProcedimiento(resultado) {
  const filas = [resultado.recordset ?? [], ...(resultado.recordsets ?? [])].flat();
  for (const fila of filas) {
    if (!fila || typeof fila !== "object") continue;
    const keys = ["mensaje", "message", "msg", "resultado", "detalle", "descripcion"];
    for (const key of keys) {
      const valor = fila[key];
      if (typeof valor === "string" && valor.trim()) return valor.trim();
    }
  }
  return "";
}

function evaluarResultadoSp(resultado) {
  const totalAfectadas = (resultado.rowsAffected || []).reduce((acc, n) => acc + Number(n || 0), 0);
  const filas = [resultado.recordset ?? [], ...(resultado.recordsets ?? [])].flat();
  const numeroDeFila = (filasArray, ...keys) => {
    for (const fila of filasArray) {
      if (!fila || typeof fila !== "object") continue;
      for (const key of keys) {
        if (key in fila) {
          const n = Number(fila[key]);
          if (!Number.isNaN(n)) return n;
        }
      }
    }
    return null;
  };
  // Detecta "ya registrado" aunque el SP devuelva los campos en una fila distinta
  // a la primera (p. ej. recordsets con múltiples filas).
  const codigoResultado = numeroDeFila(filas, "codigo", "Codigo");
  const gestionCodigo = numeroDeFila(filas, "gestionCodigo", "GestionCodigo");
  const mensajeDb = extraerMensajeProcedimiento(resultado);
  const mensajeNormalizado = aMayusculas(mensajeDb);
  const yaRegistradoPorCodigo = codigoResultado === 0;
  const yaRegistradoPorGestionCodigo = gestionCodigo === 0;
  const yaRegistradoPorMensaje =
    mensajeNormalizado.includes("YA") &&
    (mensajeNormalizado.includes("REGISTR") ||
      mensajeNormalizado.includes("DUPLIC") ||
      mensajeNormalizado.includes("EXISTE"));
  const yaRegistradoPorSinInsert = resultado.returnValue === 0 && totalAfectadas === 0;

  return {
    totalAfectadas,
    mensajeDb,
    yaRegistrado:
      yaRegistradoPorCodigo ||
      yaRegistradoPorGestionCodigo ||
      yaRegistradoPorMensaje ||
      yaRegistradoPorSinInsert,
    resultado,
  };
}

async function ejecutarEncuestaCarga(pool, payload) {
  const mapaRespuestas = Object.fromEntries(
    payload.respuestas.map((item) => [item.codigoPregunta, item.valor])
  );

  const request = pool.request();
  request.input("telefono", sql.NVarChar(50), payload.telefono.trim());
  request.input("encuesta", sql.NVarChar(50), payload.idSorteo.trim());
  request.input("usuario", sql.NVarChar(100), payload.codigoPromotor.trim());

  request.input("campo1Codigo", sql.Int, 1);
  request.input("campo1Valor", sql.NVarChar(100), payload.participante.nombreCompleto.trim());
  request.input("campo2Codigo", sql.Int, 2);
  request.input("campo2Valor", sql.NVarChar(100), payload.participante.barrio.trim());
  request.input("campo3Codigo", sql.Int, 3);
  request.input("campo3Valor", sql.NVarChar(100), aMayusculas(mapaRespuestas.conoce_firma));
  request.input("campo4Codigo", sql.Int, 4);
  request.input(
    "campo4Valor",
    sql.NVarChar(100),
    aMayusculas(mapaRespuestas.conoce_cuota_55000)
  );
  request.input("campo5Codigo", sql.Int, 5);
  request.input("campo5Valor", sql.NVarChar(100), aMayusculas(mapaRespuestas.quiere_mas_info));
  request.input("campo6Codigo", sql.Int, 6);
  request.input(
    "campo6Valor",
    sql.NVarChar(100),
    aFormatoFechaSP(mapaRespuestas.fecha_entrevista || "")
  );
  const codigoModalidad = modalidadACodigo(mapaRespuestas.modalidad_entrevista || "");
  request.input("campo7Codigo", sql.Int, 7);
  request.input("campo7Valor", sql.NVarChar(100), codigoModalidad);
  let valorCampo8 = "";
  if (codigoModalidad === "2") {
    valorCampo8 = (payload.domicilioSucursal || "").trim();
  } else if (codigoModalidad === "3") {
    valorCampo8 = mapaRespuestas.domicilio_entrevista || "";
  }
  request.input("campo8Codigo", sql.Int, 8);
  request.input("campo8Valor", sql.NVarChar(200), valorCampo8);

  const resultado = await request.execute(SP_NAME);
  return evaluarResultadoSp(resultado);
}

function nombreTablaEncuestaSeguro(nombre) {
  const limpio = String(nombre || "encuesta").trim();
  if (!/^[a-zA-Z0-9_.]+$/.test(limpio)) {
    throw new Error("ENCUESTA_TABLE_NAME inválido");
  }
  return limpio.includes(".") ? limpio : `dbo.${limpio}`;
}

function armarCamposEntrevista(data) {
  const quiereMasInfo = aMayusculas(data.quiereMasInfo);
  const codigoModalidad = modalidadACodigo(data.modalidadEntrevista || "");
  let valorCampo8 = "";
  if (codigoModalidad === "2") {
    valorCampo8 = (data.domicilioSucursal || "").trim();
  } else if (codigoModalidad === "3") {
    valorCampo8 = data.domicilioEntrevista || "";
  }
  const fechaHora =
    data.fechaEntrevista && data.horaEntrevista
      ? aFormatoFechaSP(`${data.fechaEntrevista}T${data.horaEntrevista}`)
      : "";

  return {
    quiereMasInfo,
    fechaHora,
    codigoModalidad,
    valorCampo8,
  };
}

async function ejecutarEncuestaActualizacion(pool, data) {
  const { quiereMasInfo, fechaHora, codigoModalidad, valorCampo8 } = armarCamposEntrevista(data);
  const tabla = nombreTablaEncuestaSeguro(ENCUESTA_TABLE);

  try {
    const request = pool.request();
    request.input("telefono", sql.NVarChar(50), data.telefono.trim());
    request.input("encuesta", sql.NVarChar(50), data.idSorteo.trim());
    request.input("campo5Valor", sql.NVarChar(100), quiereMasInfo);
    request.input("campo6Valor", sql.NVarChar(100), fechaHora);
    request.input("campo7Valor", sql.NVarChar(100), codigoModalidad);
    request.input("campo8Valor", sql.NVarChar(200), valorCampo8);
    const resultado = await request.execute(SP_INTERVIEW);
    return { ok: true, via: "sp", resultado };
  } catch (spError) {
    console.warn(
      "[actualizar entrevista] SP falló, intento UPDATE directo:",
      spError instanceof Error ? spError.message : spError
    );
  }

  async function intentarUpdate(camposSql) {
    const req = pool.request();
    req.input("telefono", sql.NVarChar(50), data.telefono.trim());
    req.input("encuesta", sql.NVarChar(50), data.idSorteo.trim());
    req.input("campo5Valor", sql.NVarChar(100), quiereMasInfo);
    req.input("campo6Valor", sql.NVarChar(100), fechaHora);
    req.input("campo7Valor", sql.NVarChar(100), codigoModalidad);
    req.input("campo8Valor", sql.NVarChar(200), valorCampo8);
    const update = await req.query(`
      UPDATE ${tabla}
      SET ${camposSql}
      WHERE telefono = @telefono AND encuesta = @encuesta
    `);
    const filas = update.rowsAffected?.[0] ?? 0;
    if (filas === 0) {
      throw new Error("No se encontró el registro de la encuesta para actualizar la entrevista.");
    }
    return filas;
  }

  try {
    const filas = await intentarUpdate(`
      campo5Valor = @campo5Valor,
      campo6Valor = @campo6Valor,
      campo7Valor = @campo7Valor,
      campo8Valor = @campo8Valor`);
    return { ok: true, via: "update", filas };
  } catch (updateError) {
    const msg = updateError instanceof Error ? updateError.message : String(updateError);
    if (!/campo7|campo8|Invalid column/i.test(msg)) {
      throw updateError;
    }
    const filas = await intentarUpdate(
      `campo5Valor = @campo5Valor, campo6Valor = @campo6Valor`
    );
    return { ok: true, via: "update-partial", filas };
  }
}

app.use(compression());
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", async (_, res) => {
  try {
    await getPool();
    res.json({ ok: true, service: "survey-api", db: "sqlserver" });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: "survey-api",
      message: error instanceof Error ? error.message : "Error de conexion SQL Server",
    });
  }
});

app.post("/api/survey", async (req, res) => {
  const parsed = encuestaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Datos invalidos en la encuesta.",
      details: parsed.error.flatten(),
    });
  }

  const payload = parsed.data;
  const mapaRespuestas = Object.fromEntries(
    payload.respuestas.map((item) => [item.codigoPregunta, item.valor])
  );

  const quiereMasInfo = aMayusculas(mapaRespuestas.quiere_mas_info) === "SI";

  if (quiereMasInfo) {
    if (!mapaRespuestas.fecha_entrevista) {
      return res.status(400).json({ message: "Debes indicar la fecha de la entrevista." });
    }
    if (!mapaRespuestas.modalidad_entrevista) {
      return res.status(400).json({ message: "Debes indicar si preferís nuestras oficinas o su domicilio." });
    }
    if (
      aMayusculas(mapaRespuestas.modalidad_entrevista) === "DOMICILIO" &&
      !mapaRespuestas.domicilio_entrevista
    ) {
      return res.status(400).json({ message: "Debes indicar la dirección de su domicilio." });
    }
  }

  try {
    const pool = await getPool();
    const { yaRegistrado, mensajeDb, resultado } = await ejecutarEncuestaCarga(pool, payload);

    if (yaRegistrado) {
      return res.status(409).json({
        message: mensajeDb || "Este teléfono ya fue registrado en el sorteo.",
        code: "ALREADY_REGISTERED",
        procedure: SP_NAME,
        result: {
          rowsAffected: resultado.rowsAffected,
          returnValue: resultado.returnValue,
        },
      });
    }

    return res.status(201).json({
      message: mensajeDb || "Encuesta registrada correctamente en SQL Server.",
      procedure: SP_NAME,
      result: {
        rowsAffected: resultado.rowsAffected,
        returnValue: resultado.returnValue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error al ejecutar procedimiento en SQL Server.",
      detail: error instanceof Error ? error.message : "Error desconocido",
    });
  }
});

/**
 * Segundo paso: dbo.encuestaActualizaEntrevistaSorteo01
 * @telefono, @encuesta, @campo5Valor (SI), @campo6Valor (fecha/hora), @campo7Valor (1|2|3), @campo8Valor
 */
const interviewSchema = z
  .object({
    telefono: z.string().trim().min(8).max(50),
    quiereMasInfo: z.literal("si"),
    fechaEntrevista: z.string().trim().max(50).optional().default(""),
    horaEntrevista: z.string().trim().max(10).optional().default(""),
    modalidadEntrevista: z.enum(["sucursal", "domicilio", ""]).optional().default(""),
    domicilioEntrevista: z.string().trim().max(200).optional().default(""),
    idSorteo: z.string().trim().min(3).max(50),
    domicilioSucursal: z.string().trim().max(250).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.fechaEntrevista) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Falta la fecha de la entrevista.",
        path: ["fechaEntrevista"],
      });
    }
    if (!data.horaEntrevista) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Falta la hora de la entrevista.",
        path: ["horaEntrevista"],
      });
    }
    if (!data.modalidadEntrevista) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Falta la modalidad de la entrevista.",
        path: ["modalidadEntrevista"],
      });
    }
    if (data.modalidadEntrevista === "domicilio" && !data.domicilioEntrevista.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Falta el domicilio para la entrevista.",
        path: ["domicilioEntrevista"],
      });
    }
  });

app.post("/api/interview", async (req, res) => {
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Datos inválidos para la entrevista.",
      details: parsed.error.flatten(),
    });
  }

  try {
    const pool = await getPool();
    const { via, filas, resultado } = await ejecutarEncuestaActualizacion(pool, parsed.data);

    return res.status(200).json({
      message: "Entrevista registrada correctamente.",
      via,
      filas,
      procedure: via === "sp" ? SP_INTERVIEW : ENCUESTA_TABLE,
      result:
        via === "sp" && resultado
          ? {
              rowsAffected: resultado.rowsAffected,
              returnValue: resultado.returnValue,
            }
          : undefined,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error al actualizar la entrevista en SQL Server.",
      detail: error instanceof Error ? error.message : "Error desconocido",
    });
  }
});

if (existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`) || /\.[a-f0-9]{8,}\./i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.(webp|png|jpg|jpeg|svg|ico|woff2?)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=604800");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  // /leads lo sirve el contenedor seguimiento-leads (Traefik PathPrefix)
  app.get(/^(?!\/api)(?!\/leads(?:\/|$)).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    return res.sendFile(path.join(distPath, "index.html"));
  });
}

async function warmSqlPool() {
  try {
    await getPool();
    console.log("Pool SQL Server listo");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("Pool SQL no disponible al arranque:", msg);
  }
}

app.listen(PORT, () => {
  console.log(`App de encuestas ejecutandose en http://localhost:${PORT}`);
  void warmSqlPool();
});
