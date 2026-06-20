import { useLayoutEffect, useMemo, useState } from "react";
import BranchFooter from "./components/BranchFooter";
import Header from "./components/Header";
import QuestionCard from "./components/QuestionCard";
import SubmitButton from "./components/SubmitButton";
import SorpresaSection from "./components/SorpresaSection";
import SuccessMessage from "./components/SuccessMessage";
import YaRegistradoMessage from "./components/YaRegistradoMessage";
import TextInput from "./components/TextInput";
import EntrevistaSelector, { type ModalidadEntrevista } from "./components/EntrevistaSelector";
import PrizeCarousel from "./components/PrizeCarousel";
import {
  CLAVES_DOMICILIO_SUCURSAL,
  crearParamsUrl,
  obtenerTelefonoSupervisor,
} from "./utils/urlQuery";

type FormData = {
  nombreCompleto: string;
  barrio: string;
  conoceFirma: "si" | "no" | "";
  conoceCuota55000: "si" | "no" | "";
  quiereMasInfo: "si" | "no" | "";
  fechaEntrevista: string;
  horaEntrevista: string;
  modalidadEntrevista: ModalidadEntrevista;
  domicilioEntrevista: string;
};

const ESTADO_INICIAL: FormData = {
  nombreCompleto: "",
  barrio: "",
  conoceFirma: "",
  conoceCuota55000: "",
  quiereMasInfo: "",
  fechaEntrevista: "",
  horaEntrevista: "",
  modalidadEntrevista: "",
  domicilioEntrevista: "",
};

const ESTADO_DEMO: FormData = {
  nombreCompleto: "Juan Pérez (DEMO)",
  barrio: "Barrio Centro",
  conoceFirma: "si",
  conoceCuota55000: "no",
  quiereMasInfo: "",
  fechaEntrevista: "",
  horaEntrevista: "",
  modalidadEntrevista: "",
  domicilioEntrevista: "",
};

function obtenerCodigoPromotor(codigoCrudo: string): string {
  const coincidencia = codigoCrudo.toLowerCase().match(/_v(\d{1,2})$/);
  return coincidencia ? `v${coincidencia[1]}` : "sin_codigo";
}

function obtenerIdSorteo(codigoCrudo: string): string {
  const coincidencia = codigoCrudo.toLowerCase().match(/(sorteo\d{1,3})/);
  return coincidencia ? coincidencia[1] : "sorteo_default";
}

function normalizarIdSorteo(valor: string | null): string {
  if (!valor) return "";
  const limpio = valor.trim().toLowerCase();
  if (!limpio) return "";
  const coincidencia = limpio.match(/(sorteo\d{1,3})/);
  return coincidencia ? coincidencia[1] : limpio;
}

function formatearNombreSorteo(idSorteo: string): string {
  const coincidencia = idSorteo.match(/^sorteo(\d{1,3})$/i);
  return coincidencia ? `Sorteo ${coincidencia[1]}` : "Sorteo vigente";
}

function obtenerParametro(params: URLSearchParams, claves: string[]): string {
  for (const clave of claves) {
    const valor = params.get(clave);
    if (valor && valor.trim()) return valor.trim();
  }
  const clavesLower = new Set(claves.map((c) => c.toLowerCase()));
  let encontrado = "";
  params.forEach((value, key) => {
    if (encontrado) return;
    if (clavesLower.has(key.toLowerCase()) && value.trim()) {
      encontrado = value.trim();
    }
  });
  return encontrado;
}

/**
 * Tabla de canal de origen (acuerdo DBA):
 * id | origen    | cadenaBusca
 *  1 | QR        | QR
 *  2 | MANUAL    | MN
 *  3 | INSTAGRAM | INSTAGRAM
 *  4 | FACEBOOK  | FACEBOOK
 *  5 | WHATSAPP  | WHATSAPP
 *  6 | TIKTOK    | TIKTOK
 *  7 | OTRA 1    | OTRAREDSOCIAL
 *  8 | OTRA 2    | OTRAREDSOCIAL
 *  9 | OTRA 3    | OTRAREDSOCIAL
 * 10 | OTRA 4    | OTRAREDSOCIAL
 * 11 | NULL      | OTRAREDSOCIAL (sin origen en URL → null)
 */
const CODIGO_CANAL_ORIGEN: Record<string, number> = {
  // cadenaBusca exacta (tal como viene en ?origen=...)
  qr:            1,
  mn:            2,
  manual:        2,
  instagram:     3,
  ig:            3,
  facebook:      4,
  fb:            4,
  whatsapp:      5,
  wa:            5,
  wsp:           5,
  tiktok:        6,
  tt:            6,
  otraredsocial: 7,
  otra:          7,
};

const TEXTO_CANAL_ORIGEN: Record<number, string> = {
  1: "QR",
  2: "MANUAL",
  3: "INSTAGRAM",
  4: "FACEBOOK",
  5: "WHATSAPP",
  6: "TIKTOK",
  7: "OTRAREDSOCIAL",
};

function textoDeCanalOrigen(codigo: number | null): string {
  if (codigo === null) return "";
  return TEXTO_CANAL_ORIGEN[codigo] ?? "";
}

/**
 * Lee el canal de origen desde la query (?origen=QR|MN|INSTAGRAM|FACEBOOK|WHATSAPP|TIKTOK|OTRAREDSOCIAL
 * o ?origen=1..10). Devuelve `null` si no viene (→ el SP guarda id=11/NULL).
 */
function obtenerCanalOrigen(params: URLSearchParams): { codigo: number | null; texto: string } {
  const raw = obtenerParametro(params, ["origen", "Origen", "ORIGEN", "o", "canal", "origin"]);
  if (!raw) return { codigo: null, texto: "" };
  const limpio = raw.trim().toLowerCase();
  // Acepta número directo 1-10
  const n = Number(limpio);
  if (Number.isInteger(n) && n >= 1 && n <= 10) {
    return { codigo: n, texto: textoDeCanalOrigen(n) };
  }
  const codigo = CODIGO_CANAL_ORIGEN[limpio] ?? null;
  return { codigo, texto: textoDeCanalOrigen(codigo) };
}

/** Solo nombre del promotor (sin "Supervisado por …" u otros sufijos del sistema). */
function nombrePromotorParaMostrar(texto: string): string {
  const limpio = texto.trim();
  if (!limpio) return "";
  const cortado = limpio.split(/\s+[Ss]upervisad[oa]\s+por\b/i)[0];
  return cortado?.trim() || limpio;
}

type SupervisorInfo = {
  telefonoSupervisor: string;
  domicilioSucursal: string;
};

function supervisorDesdeUrl(params: URLSearchParams, searchCrudo: string): SupervisorInfo {
  return {
    telefonoSupervisor: obtenerTelefonoSupervisor(params, searchCrudo),
    domicilioSucursal: obtenerParametro(params, CLAVES_DOMICILIO_SUCURSAL),
  };
}

function App() {
  const searchCrudo = window.location.search;
  const params = useMemo(() => crearParamsUrl(searchCrudo), [searchCrudo]);

  /** Solo en `npm run dev`: ver pantalla post-envío sin llamar a la API. */
  const previewEnviado =
    import.meta.env.DEV &&
    (params.get("preview") === "enviado" || params.get("preview") === "ok");
  const previewYaRegistrado =
    import.meta.env.DEV &&
    params.get("preview") === "registrado" &&
    !previewEnviado;

  /** ?demo=1 → pre-llena el formulario y simula envío sin tocar la BD. */
  const modoDemo = params.get("demo") === "1";

  const [datos, setDatos] = useState<FormData>(modoDemo ? ESTADO_DEMO : ESTADO_INICIAL);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(previewEnviado || previewYaRegistrado);
  const [yaParticipando, setYaParticipando] = useState(previewYaRegistrado);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [entrevistaConfirmada, setEntrevistaConfirmada] = useState(false);
  const [entrevistaEnviando, setEntrevistaEnviando] = useState(false);
  const [entrevistaError, setEntrevistaError] = useState("");
  const [erroresEntrevista, setErroresEntrevista] = useState<string[]>([]);
  const [participacionGuardada, setParticipacionGuardada] = useState(false);
  const supervisorInfo = useMemo(
    () => supervisorDesdeUrl(params, searchCrudo),
    [params, searchCrudo]
  );

  const codigoQr =
    obtenerParametro(params, ["codigo_qr", "qr_code", "wa_msg", "codigo", "Codigo"]) || "";
  /** Valor que envía la BD → SP `@usuario` (ej. SORTEO01_V1); no usar `vendedor` aquí. */
  const codigoPromotor =
    obtenerParametro(params, ["codigo", "Codigo", "codigo_promotor", "promotor", "v"]) ||
    obtenerCodigoPromotor(codigoQr);
  /** Texto que muestra la tarjeta PROMOTOR (solo nombre; viene del parámetro `vendedor`). */
  const vendedorCrudo = obtenerParametro(params, ["vendedor", "Vendedor"]);
  const etiquetaPromotor = vendedorCrudo
    ? nombrePromotorParaMostrar(vendedorCrudo) || codigoPromotor
    : codigoPromotor;
  const idSorteo =
    normalizarIdSorteo(obtenerParametro(params, ["id_sorteo", "idSorteo", "sorteo_id", "raffle_id"])) ||
    normalizarIdSorteo(obtenerParametro(params, ["encuesta", "Encuesta", "ENCUESTA"])) ||
    normalizarIdSorteo(obtenerParametro(params, ["sorteo", "Sorteo"])) ||
    obtenerIdSorteo(codigoQr);
  const nombreSorteo =
    params.get("nombre_sorteo") ??
    params.get("raffle_name") ??
    params.get("sorteo_nombre") ??
    formatearNombreSorteo(idSorteo);
  const mensajeWhatsapp = obtenerParametro(params, ["wa_msg", "codigo", "Codigo"]) || codigoQr;
  const telefono = modoDemo
    ? "5491100000000"
    : obtenerParametro(params, ["telefono", "Telefono", "phone", "tel"]) || "";
  const canalOrigen = useMemo(() => obtenerCanalOrigen(params), [params]);

  /**
   * Tras enviar: siempre llevar la vista al mensaje principal (éxito o ya registrado),
   * antes del resto del contenido (sorpresa, footer).
   */
  useLayoutEffect(() => {
    if (!enviado) return;
    const el = document.getElementById("seccion-resultado-encuesta");
    if (!el) return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const behavior = prefersReduced ? "auto" : "smooth";
    const scroll = () => {
      el.scrollIntoView({ behavior, block: "start", inline: "nearest" });
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scroll);
    });
  }, [enviado]);

  useLayoutEffect(() => {
    if (!entrevistaConfirmada) return;
    const el = document.getElementById("entrevista-confirmada-card");
    if (!el) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = prefersReduced ? "auto" : "smooth";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior, block: "start", inline: "nearest" });
      });
    });
  }, [entrevistaConfirmada]);

  const actualizarCampo = <K extends keyof FormData>(campo: K, valor: FormData[K]) => {
    setDatos((prev) => {
      const nuevo = { ...prev, [campo]: valor };
      if (campo === "quiereMasInfo" && valor === "no") {
        nuevo.fechaEntrevista = "";
        nuevo.horaEntrevista = "";
        nuevo.modalidadEntrevista = "";
        nuevo.domicilioEntrevista = "";
      }
      return nuevo;
    });
  };

  const validar = () => {
    const erroresNuevos: string[] = [];
    if (!datos.nombreCompleto.trim()) erroresNuevos.push("Ingresá tu nombre y apellido.");
    if (!datos.barrio.trim()) erroresNuevos.push("Ingresá tu barrio o dirección.");
    if (!datos.conoceFirma || !datos.conoceCuota55000) {
      erroresNuevos.push("Respondé todas las preguntas obligatorias.");
    }
    if (!telefono.trim()) {
      erroresNuevos.push("No se recibió el teléfono desde WhatsApp.");
    }
    setErrores(erroresNuevos);
    return erroresNuevos.length === 0;
  };

  const enviarEncuestaALaApi = async (
    quiereMasInfo: "si" | "no"
  ): Promise<{ ok: boolean; yaRegistrado: boolean; message?: string }> => {
    const respuestas: Array<{ codigoPregunta: string; valor: string }> = [
      { codigoPregunta: "conoce_firma", valor: datos.conoceFirma },
      { codigoPregunta: "conoce_cuota_55000", valor: datos.conoceCuota55000 },
      { codigoPregunta: "quiere_mas_info", valor: quiereMasInfo },
    ];
    if (quiereMasInfo === "si") {
      respuestas.push(
        {
          codigoPregunta: "fecha_entrevista",
          valor: `${datos.fechaEntrevista}T${datos.horaEntrevista}`,
        },
        { codigoPregunta: "modalidad_entrevista", valor: datos.modalidadEntrevista },
        { codigoPregunta: "domicilio_entrevista", valor: datos.domicilioEntrevista },
      );
    }

    const payload = {
      participante: {
        nombreCompleto: datos.nombreCompleto,
        barrio: datos.barrio,
      },
      respuestas,
      codigoPromotor,
      idSorteo,
      nombreSorteo,
      codigoQr,
      telefono,
      mensajeWhatsapp,
      origen: "whatsapp-encuesta-directa",
      canalOrigen: canalOrigen.codigo,
      canalOrigenTexto: canalOrigen.texto,
      telefonoSupervisor: supervisorInfo.telefonoSupervisor,
      domicilioSucursal: supervisorInfo.domicilioSucursal,
    };

    const response = await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };

    if (response.status === 409 || body.code === "ALREADY_REGISTERED") {
      return {
        ok: false,
        yaRegistrado: true,
        message:
          body.message?.trim() ||
          "Este teléfono ya fue registrado en esta encuesta.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        yaRegistrado: false,
        message: body.message ?? "No pudimos enviar la encuesta. Intentá nuevamente.",
      };
    }

    return { ok: true, yaRegistrado: false, message: body.message };
  };

  /** Segundo paso: actualiza campo5–8 vía SP (telefono + encuesta). */
  const actualizarAsesoramientoEnApi = async (): Promise<{ ok: boolean; message?: string }> => {
    const response = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telefono,
        quiereMasInfo: "si",
        fechaEntrevista: datos.fechaEntrevista,
        horaEntrevista: datos.horaEntrevista,
        modalidadEntrevista: datos.modalidadEntrevista,
        domicilioEntrevista: datos.domicilioEntrevista,
        idSorteo,
        domicilioSucursal: supervisorInfo.domicilioSucursal,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      return {
        ok: false,
        message: body.message ?? "No pudimos guardar tu respuesta de asesoramiento.",
      };
    }
    return { ok: true, message: body.message };
  };

  const handleSubmit = async () => {
    setErrorEnvio("");
    setYaParticipando(false);
    if (!validar()) return;

    if (modoDemo) {
      setEnviando(true);
      await new Promise((r) => setTimeout(r, 800));
      setEnviando(false);
      setParticipacionGuardada(true);
      setEnviado(true);
      return;
    }

    try {
      setEnviando(true);
      const resultado = await enviarEncuestaALaApi("no");
      if (resultado.yaRegistrado) {
        setParticipacionGuardada(true);
        setYaParticipando(true);
        setEnviado(true);
        return;
      }
      if (!resultado.ok) {
        throw new Error(resultado.message ?? "No pudimos enviar la encuesta. Intentá nuevamente.");
      }
      setParticipacionGuardada(true);
      setEnviado(true);
    } catch (error) {
      setErrorEnvio(error instanceof Error ? error.message : "Error inesperado al enviar.");
    } finally {
      setEnviando(false);
    }
  };

  const handleConfirmarEntrevista = async () => {
    if (datos.quiereMasInfo !== "si") {
      setEntrevistaError("Seleccioná que querés asesoramiento para confirmar la entrevista.");
      return;
    }

    const nuevosErrores: string[] = [];
    if (!datos.fechaEntrevista) nuevosErrores.push("Seleccioná la fecha de la entrevista.");
    if (!datos.horaEntrevista) nuevosErrores.push("Seleccioná la hora de la entrevista.");
    if (!datos.modalidadEntrevista) nuevosErrores.push("Seleccioná nuestras oficinas o su domicilio.");
    if (datos.modalidadEntrevista === "domicilio" && !datos.domicilioEntrevista.trim()) {
      nuevosErrores.push("Ingresá la dirección de su domicilio.");
    }
    setErroresEntrevista(nuevosErrores);
    if (nuevosErrores.length > 0) return;

    if (modoDemo) {
      setEntrevistaConfirmada(true);
      return;
    }

    if (!participacionGuardada) {
      setEntrevistaError("Primero tenés que enviar la encuesta.");
      return;
    }

    setEntrevistaEnviando(true);
    setEntrevistaError("");
    try {
      const resultado = await actualizarAsesoramientoEnApi();
      if (!resultado.ok) {
        throw new Error(resultado.message ?? "No pudimos registrar la entrevista.");
      }
      setEntrevistaConfirmada(true);
    } catch (error) {
      setEntrevistaError(
        error instanceof Error ? error.message : "Error al registrar la entrevista."
      );
    } finally {
      setEntrevistaEnviando(false);
    }
  };

  const iconoPersona = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0v1H4Z" />
    </svg>
  );
  const iconoPin = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a8 8 0 0 0-8 8c0 5.5 7.1 11.4 7.4 11.7a1 1 0 0 0 1.2 0C12.9 21.4 20 15.5 20 10a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
    </svg>
  );
  const iconoInfo = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1.4 1.4 0 1 1 0 2.8A1.4 1.4 0 0 1 12 7Zm1.5 11h-3v-1h.5a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5h-.5v-1h2.5a.5.5 0 0 1 .5.5v5a.5.5 0 0 0 .5.5h.5v1Z" />
    </svg>
  );
  const iconoDolar = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v20" />
      <path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
  const bloqueMasInfo = !entrevistaConfirmada ? (
    <main className="card-principal">
      <QuestionCard
        pregunta="¿Querés Asesoramiento?"
        hint="Sin obligación de compra"
        valorSeleccionado={datos.quiereMasInfo}
        onChange={(v) => actualizarCampo("quiereMasInfo", v)}
      />
      {datos.quiereMasInfo === "no" ? (
        <div className="success-card" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
          <span className="success-card__icono-wrap" aria-hidden="true">
            <span className="success-card__icono">✓</span>
          </span>
          <h2 className="success-card__titulo">¡Gracias por participar!</h2>
          <PrizeCarousel soloMotos />
        </div>
      ) : null}
      {datos.quiereMasInfo === "si" ? (
        <EntrevistaSelector
          fechaSeleccionada={datos.fechaEntrevista}
          horaSeleccionada={datos.horaEntrevista}
          modalidadSeleccionada={datos.modalidadEntrevista}
          domicilioIngresado={datos.domicilioEntrevista}
          onFechaChange={(v) => actualizarCampo("fechaEntrevista", v)}
          onHoraChange={(v) => actualizarCampo("horaEntrevista", v)}
          onModalidadChange={(v) => actualizarCampo("modalidadEntrevista", v)}
          onDomicilioChange={(v) => actualizarCampo("domicilioEntrevista", v)}
          deshabilitado={false}
          sucursalSupervisor={supervisorInfo.domicilioSucursal}
        />
      ) : null}
      {erroresEntrevista.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {erroresEntrevista.map((msg) => (
            <div className="error-mensaje" key={msg}>{msg}</div>
          ))}
        </div>
      ) : null}
      {entrevistaError ? <div className="error-mensaje">{entrevistaError}</div> : null}
      {datos.quiereMasInfo === "si" ? (
        <button
          type="button"
          className="boton-enviar"
          onClick={handleConfirmarEntrevista}
          disabled={entrevistaEnviando}
        >
          {entrevistaEnviando ? "Enviando..." : "CONFIRMAR ENTREVISTA"}
        </button>
      ) : null}
    </main>
  ) : (
    <div id="entrevista-confirmada-card" className="success-card" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
      <span className="success-card__icono-wrap" aria-hidden="true">
        <span className="success-card__icono">✓</span>
      </span>
      <h2 className="success-card__titulo">¡Entrevista confirmada!</h2>
      <p className="success-card__subtitulo">¡Ya estás participando por un terreno y las motos!</p>
      <PrizeCarousel />
    </div>
  );

  return (
    <div className="app-container">
      <Header telefono={telefono} etiquetaPromotor={etiquetaPromotor} />
      {modoDemo && (
        <div className="banner-demo" role="status">
          ⚠️ MODO DEMO — el envío no guarda datos reales
        </div>
      )}

      {enviado ? (
        <div className="pr-wrap">
          {yaParticipando ? <YaRegistradoMessage /> : <SuccessMessage />}
          <SorpresaSection
            telefonoAsesor={supervisorInfo.telefonoSupervisor}
            masInfoBloque={bloqueMasInfo}
          />
        </div>
      ) : (
        <>
          <main className="card-principal">
            <TextInput
              name="nombreCompleto"
              icono={iconoPersona}
              placeholder="Nombre y apellido"
              value={datos.nombreCompleto}
              onChange={(v) => actualizarCampo("nombreCompleto", v)}
              autoComplete="name"
            />
            <TextInput
              name="barrio"
              icono={iconoPin}
              placeholder="Barrio o dirección"
              value={datos.barrio}
              onChange={(v) => actualizarCampo("barrio", v)}
              autoComplete="street-address"
            />

            <QuestionCard
              icono={iconoInfo}
              pregunta="¿Conocés la inmobiliaria Mi Primer Casa S.A.?"
              valorSeleccionado={datos.conoceFirma}
              onChange={(v) => actualizarCampo("conoceFirma", v)}
            />
            <QuestionCard
              icono={iconoDolar}
              pregunta={<>¿Sabías que con $55.000 por mes (<strong style={{textTransform:"uppercase"}}>CUOTAS FIJAS</strong>) podés pagar tu terreno? (También incluyen alcantarillas y pilar)</>}
              valorSeleccionado={datos.conoceCuota55000}
              onChange={(v) => actualizarCampo("conoceCuota55000", v)}
            />
            {errores.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {errores.map((msg) => (
                  <div className="error-mensaje" key={msg}>
                    {msg}
                  </div>
                ))}
              </div>
            ) : null}

            {errorEnvio ? <div className="error-mensaje">{errorEnvio}</div> : null}
          </main>

          <SubmitButton enviando={enviando} onClick={handleSubmit} />
        </>
      )}

      <BranchFooter desbloqueado={enviado} />
    </div>
  );
}

export default App;
