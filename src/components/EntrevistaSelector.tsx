import { useState, useEffect, useRef, type ReactNode } from "react";
import { Calendar, Clock } from "lucide-react";

export type ModalidadEntrevista = "sucursal" | "domicilio" | "";

type Props = {
  fechaSeleccionada: string;
  horaSeleccionada: string;
  modalidadSeleccionada: ModalidadEntrevista;
  domicilioIngresado: string;
  onFechaChange: (v: string) => void;
  onHoraChange: (v: string) => void;
  onModalidadChange: (v: ModalidadEntrevista) => void;
  onDomicilioChange: (v: string) => void;
  deshabilitado: boolean;
  sucursalSupervisor?: string;
};

const HORARIOS = [
  "08:30", "09:00", "10:00", "11:00", "12:00",
  "16:30", "17:00", "18:00", "19:00", "20:00",
];

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function toValorFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatearFechaCorta(fechaStr: string): string {
  if (!fechaStr) return "FECHA";
  const [y, m, dia] = fechaStr.split("-").map(Number);
  const d = new Date(y, m - 1, dia);
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

function EntrevistaSelector({
  fechaSeleccionada,
  horaSeleccionada,
  modalidadSeleccionada,
  domicilioIngresado,
  onFechaChange,
  onHoraChange,
  onModalidadChange,
  onDomicilioChange,
  deshabilitado,
  sucursalSupervisor,
}: Props) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const obtenerHorariosDisponibles = (): string[] => {
    if (!fechaSeleccionada) return HORARIOS;
    const hoyStr = toValorFecha(new Date());
    if (fechaSeleccionada !== hoyStr) return HORARIOS;

    const ahora = new Date();
    const currentHour = ahora.getHours();
    const currentMinute = ahora.getMinutes();

    return HORARIOS.filter((hora) => {
      const [hStr, mStr] = hora.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      return h > currentHour || (h === currentHour && m > currentMinute);
    });
  };

  const claseContenedor = `entrevista-selector${deshabilitado ? " entrevista-selector--deshabilitado" : ""}`;
  const [menuFechaAbierto, setMenuFechaAbierto] = useState(false);
  const [mesVista, setMesVista] = useState({ año: hoy.getFullYear(), mes: hoy.getMonth() });
  const [menuHoraAbierto, setMenuHoraAbierto] = useState(false);
  const calWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFechaAbierto && !menuHoraAbierto) return;
    const handler = (e: MouseEvent) => {
      if (calWrapRef.current && !calWrapRef.current.contains(e.target as Node)) {
        setMenuFechaAbierto(false);
        setMenuHoraAbierto(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuFechaAbierto, menuHoraAbierto]);

  useEffect(() => {
    if (!fechaSeleccionada) return;

    const hoyStr = toValorFecha(new Date());
    const esHoy = fechaSeleccionada === hoyStr;

    if (esHoy) {
      const ahora = new Date();
      const currentHour = ahora.getHours();
      const currentMinute = ahora.getMinutes();

      let esInvalida = !horaSeleccionada;
      if (horaSeleccionada) {
        const [hStr, mStr] = horaSeleccionada.split(":");
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        if (h < currentHour || (h === currentHour && m <= currentMinute)) {
          esInvalida = true;
        }
      }

      if (esInvalida) {
        const primerDisponible = HORARIOS.find((hora) => {
          const [hStr, mStr] = hora.split(":");
          const h = parseInt(hStr, 10);
          const m = parseInt(mStr, 10);
          return h > currentHour || (h === currentHour && m > currentMinute);
        });
        if (primerDisponible) {
          onHoraChange(primerDisponible);
        } else {
          onHoraChange("");
        }
      }
    } else {
      if (!horaSeleccionada) {
        onHoraChange(HORARIOS[0]);
      }
    }
  }, [fechaSeleccionada, horaSeleccionada, onHoraChange]);

  const esMesActual =
    mesVista.año === hoy.getFullYear() && mesVista.mes === hoy.getMonth();

  const irMesAnterior = () => {
    if (esMesActual) return;
    setMesVista((prev) => {
      if (prev.mes === 0) return { año: prev.año - 1, mes: 11 };
      return { ...prev, mes: prev.mes - 1 };
    });
  };

  const irMesSiguiente = () => {
    setMesVista((prev) => {
      if (prev.mes === 11) return { año: prev.año + 1, mes: 0 };
      return { ...prev, mes: prev.mes + 1 };
    });
  };

  type Celda = { dia: number; fecha: string; pasado: boolean; esDomingo: boolean } | null;

  const celdasCalendario = (): Celda[] => {
    const { año, mes } = mesVista;
    const primerDia = new Date(año, mes, 1);
    const diasEnMes = new Date(año, mes + 1, 0).getDate();
    const primerDiaSemana = primerDia.getDay();

    const ahora = new Date();
    // El último turno disponible es "20:00"
    const ultimoTurnoPaso = ahora.getHours() > 20 || (ahora.getHours() === 20 && ahora.getMinutes() >= 0);

    const celdas: Celda[] = [];
    for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = new Date(año, mes, d);
      const esHoy = fecha.getTime() === hoy.getTime();
      celdas.push({
        dia: d,
        fecha: toValorFecha(fecha),
        pasado: fecha < hoy || (esHoy && ultimoTurnoPaso),
        esDomingo: fecha.getDay() === 0,
      });
    }
    return celdas;
  };

  const iconoCalendario = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
      <circle cx="16" cy="15" r="3" />
      <path d="M16 13.5V15l1 .8" strokeLinecap="round" />
    </svg>
  );

  const iconoSucursal = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5V21H3V9.5Z" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );

  const iconoDomicilio = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a8 8 0 0 0-8 8c0 5.5 7.1 11.4 7.4 11.7a1 1 0 0 0 1.2 0C12.9 21.4 20 15.5 20 10a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
    </svg>
  );

  const iconoPin = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a8 8 0 0 0-8 8c0 5.5 7.1 11.4 7.4 11.7a1 1 0 0 0 1.2 0C12.9 21.4 20 15.5 20 10a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
    </svg>
  );

  const MODALIDADES: { valor: ModalidadEntrevista; etiqueta: string; icono: ReactNode }[] = [
    { valor: "sucursal", etiqueta: "Nuestras oficinas", icono: iconoSucursal },
    { valor: "domicilio", etiqueta: "En su domicilio", icono: iconoDomicilio },
  ];

  return (
    <div className={claseContenedor}>
      <div className="entrevista-selector__fila">
        <span className="entrevista-selector__icono-wrap" aria-hidden="true">
          <span className="entrevista-selector__icono">{iconoCalendario}</span>
        </span>
        <p className="entrevista-selector__titulo">Acordá tu entrevista</p>
      </div>

      {/* ── Fecha y Hora ── */}
      <div className="entrevista-selector__fecha-cal-wrap" ref={calWrapRef}>
        <div className="entrevista-selector__fecha-hora-fila">

          {/* Fecha */}
          <div className="entrevista-selector__campo">
            <button
              type="button"
              className="dts-circle"
              data-glyph="F"
              data-selected={fechaSeleccionada ? "true" : "false"}
              onClick={() => { if (!deshabilitado) { setMenuFechaAbierto((v) => !v); setMenuHoraAbierto(false); } }}
              disabled={deshabilitado}
              aria-expanded={menuFechaAbierto}
              aria-haspopup="dialog"
            >
              <span className="dts-badge">
                <Calendar size={11} strokeWidth={2.25} />
                Fecha
              </span>
              <span className="dts-label">
                Fecha<span className="dot">.</span>
              </span>
              <span className="dts-value">
                {fechaSeleccionada ? formatearFechaCorta(fechaSeleccionada) : "ELEGIR DÍA"}
              </span>
            </button>
          </div>

          {/* Hora */}
          <div className="entrevista-selector__campo">
            <button
              type="button"
              className="dts-circle"
              data-glyph="H"
              data-selected={horaSeleccionada ? "true" : "false"}
              onClick={() => { if (!deshabilitado) { setMenuHoraAbierto((v) => !v); setMenuFechaAbierto(false); } }}
              disabled={deshabilitado}
              aria-expanded={menuHoraAbierto}
              aria-haspopup="listbox"
            >
              <span className="dts-badge">
                <Clock size={11} strokeWidth={2.25} />
                Hora
              </span>
              <span className="dts-label">
                Hora<span className="dot">.</span>
              </span>
              <span className="dts-value">
                {horaSeleccionada ? `${horaSeleccionada} HS` : "ELEGIR HORA"}
              </span>
            </button>
          </div>

        </div>

        {/* Grilla de horarios — ancho completo como el calendario */}
        {menuHoraAbierto && !deshabilitado && (
          <div className="hora-picker__dropdown hora-picker__dropdown--full" role="listbox" aria-label="Seleccioná un horario">
            <div className="hora-picker__grid">
              {obtenerHorariosDisponibles().map((hora) => (
                <button
                  key={hora}
                  type="button"
                  className={`hora-picker__btn${horaSeleccionada === hora ? " hora-picker__btn--sel" : ""}`}
                  role="option"
                  aria-selected={horaSeleccionada === hora}
                  onClick={() => {
                    onHoraChange(hora);
                    setMenuHoraAbierto(false);
                  }}
                >
                  {hora}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Calendario — ocupa todo el ancho cuando está abierto */}
        {menuFechaAbierto && !deshabilitado && (
          <div className="fecha-picker__calendar fecha-picker__calendar--full" role="dialog" aria-label="Seleccioná una fecha">
            <div className="fecha-picker__cal-nav">
              <button
                type="button"
                className="fecha-picker__cal-nav-btn"
                onClick={irMesAnterior}
                disabled={esMesActual}
                aria-label="Mes anterior"
              >
                ‹
              </button>
              <span className="fecha-picker__cal-mes-titulo">
                {MESES_LARGO[mesVista.mes]} {mesVista.año}
              </span>
              <button
                type="button"
                className="fecha-picker__cal-nav-btn"
                onClick={irMesSiguiente}
                aria-label="Mes siguiente"
              >
                ›
              </button>
            </div>

            <div className="fecha-picker__cal-semana">
              {DIAS_SEMANA.map((d) => (
                <div
                  key={d}
                  className={`fecha-picker__cal-dia-header${d === "Dom" ? " fecha-picker__cal-dia-header--dom" : ""}`}
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="fecha-picker__cal-grid">
              {celdasCalendario().map((celda, idx) => {
                if (!celda) {
                  return <div key={`v-${idx}`} className="fecha-picker__cal-celda-vacia" />;
                }
                const { dia, fecha, pasado, esDomingo } = celda;
                const seleccionado = fechaSeleccionada === fecha;
                const inhabilitado = pasado || esDomingo;

                let cls = "fecha-picker__dia-btn";
                if (esDomingo) cls += " fecha-picker__dia-btn--domingo";
                else if (pasado) cls += " fecha-picker__dia-btn--pasado";
                else if (seleccionado) cls += " fecha-picker__dia-btn--sel";

                return (
                  <button
                    key={fecha}
                    type="button"
                    className={cls}
                    disabled={inhabilitado}
                    aria-pressed={seleccionado}
                    onClick={() => {
                      onFechaChange(fecha);
                      setMenuFechaAbierto(false);
                    }}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Modalidad ── */}
      <p className="entrevista-selector__subtitulo">
        <span className="entrevista-selector__subtitulo-destaque">¿Preferís en:</span>
      </p>

      <div className="entrevista-selector__modalidades">
        {MODALIDADES.map(({ valor, etiqueta, icono }, i) => (
          <>
            {i > 0 && (
              <span key={`sep-${i}`} className="entrevista-selector__mod-sep" aria-hidden="true">
                o
              </span>
            )}
            <button
              key={valor}
              type="button"
              className={`entrevista-selector__mod-btn${
                modalidadSeleccionada === valor && !deshabilitado
                  ? " entrevista-selector__mod-btn--sel"
                  : ""
              }`}
              onClick={() => onModalidadChange(valor)}
              disabled={deshabilitado}
            >
              <span className="entrevista-selector__mod-icono" aria-hidden="true">
                {icono}
              </span>
              {etiqueta}
            </button>
          </>
        ))}
      </div>

      {modalidadSeleccionada === "sucursal" && sucursalSupervisor && !deshabilitado ? (
        <div className="entrevista-selector__info-sucursal">
          <span className="entrevista-selector__info-sucursal-icono" aria-hidden="true">
            {iconoPin}
          </span>
          {sucursalSupervisor}
        </div>
      ) : null}

      {modalidadSeleccionada === "domicilio" && !deshabilitado ? (
        <div className="entrevista-selector__domicilio-wrap">
          <input
            type="text"
            className="entrevista-selector__domicilio-input"
            placeholder="Ingresá la dirección de su domicilio"
            value={domicilioIngresado}
            onChange={(e) => onDomicilioChange(e.target.value)}
            autoComplete="street-address"
            maxLength={150}
          />
        </div>
      ) : null}
    </div>
  );
}

export default EntrevistaSelector;
