import { forwardRef, useEffect, useRef, useState } from 'react';
import ReactDatePicker, { registerLocale } from 'react-datepicker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('es', es);

type Periodo = 'am' | 'pm';

const MINUTOS_OPCIONES = [0, 15, 30, 45] as const;
const HORAS_24 = Array.from({ length: 24 }, (_, i) => i);

/** Parsea `YYYY-MM-DDTHH:mm` como hora local (sin UTC). */
function parseIsoLocal(isoStr: string): Date | null {
  if (!isoStr?.trim()) return null;
  const m = isoStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
    0,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToIso(date: Date | null): string {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function partesDesdeDate(date: Date): { h24: number; minuto: number; periodo: Periodo } {
  const h24 = date.getHours();
  return {
    h24,
    minuto: date.getMinutes(),
    periodo: h24 >= 12 ? 'pm' : 'am',
  };
}

function partesDesdeIso(iso: string) {
  const d = parseIsoLocal(iso);
  if (!d) return { h24: 9, minuto: 0, periodo: 'am' as Periodo };
  return partesDesdeDate(d);
}

/**
 * Al cambiar AM ↔ PM convierte la hora (ej. 11 AM → 23, 23 → 11).
 * Mantiene el “número de reloj” 12 h al cruzar mediodía/medianoche.
 */
function h24TrasCambiarPeriodo(h24: number, periodoNuevo: Periodo): number {
  const periodoActual: Periodo = h24 >= 12 ? 'pm' : 'am';
  if (periodoActual === periodoNuevo) return h24;

  const cara12 = h24 % 12 || 12;

  if (periodoNuevo === 'pm') {
    return cara12 === 12 ? 12 : cara12 + 12;
  }
  return cara12 === 12 ? 0 : cara12;
}

function dateConH24(base: Date, h24: number, minuto: number): Date {
  const next = new Date(base);
  next.setHours(h24, minuto, 0, 0);
  return next;
}

function formatIsoLegible(iso: string): string {
  const d = parseIsoLocal(iso);
  if (!d) return '';
  return format(d, "d 'de' MMMM yyyy, HH:mm", { locale: es });
}

function minutoCercano(minuto: number) {
  return MINUTOS_OPCIONES.reduce((prev, curr) =>
    Math.abs(curr - minuto) < Math.abs(prev - minuto) ? curr : prev,
  );
}

interface TriggerButtonProps {
  isoValue?: string;
  onClick?: () => void;
}

const TriggerButton = forwardRef<HTMLButtonElement, TriggerButtonProps>(
  function TriggerButton({ isoValue, onClick }, ref) {
    const label = isoValue ? formatIsoLegible(isoValue) : '';
    const hasDate = Boolean(label);

    return (
      <button
        type="button"
        onClick={onClick}
        ref={ref}
        style={{ touchAction: 'manipulation' }}
        className={`flex h-12 w-full items-center gap-2.5 rounded-lg border px-3 text-[14px] transition-all duration-[140ms] ease-out active:scale-[0.99] ${
          hasDate
            ? 'border-brand-200 bg-brand-50 text-brand-700 active:bg-brand-100 active:border-brand-300'
            : 'border-zinc-200 bg-white text-zinc-400 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
        }`}
      >
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`shrink-0 ${hasDate ? 'text-brand-600' : 'text-zinc-400'}`}
          aria-hidden="true"
        >
          <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 1v3M11 1v3M2 7h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          {hasDate && (
            <path d="M5 10h2M9 10h2M5 12.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          )}
        </svg>

        <span className="flex-1 text-left font-medium tabular-nums">
          {label || 'Seleccionar fecha y hora…'}
        </span>

        {hasDate ? (
          <svg
            width="13" height="13" viewBox="0 0 13 13" fill="none"
            className="shrink-0 text-brand-400" aria-hidden="true"
          >
            <path
              d="M9 1.5 11.5 4 4.5 11H2v-2.5L9 1.5Z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className="shrink-0 text-zinc-300" aria-hidden="true"
          >
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    );
  },
);

interface TimePanelProps {
  isoValue: string;
  selectedDate: Date | null;
  onTimeChange: (iso: string) => void;
}

function TimePanel({ isoValue, selectedDate, onTimeChange }: TimePanelProps) {
  const base = selectedDate ?? parseIsoLocal(isoValue) ?? new Date();
  const [h24, setH24] = useState(() => partesDesdeIso(isoValue).h24);
  const [minuto, setMinuto] = useState<number>(() => minutoCercano(partesDesdeIso(isoValue).minuto));

  useEffect(() => {
    const p = partesDesdeIso(isoValue);
    setH24(p.h24);
    setMinuto(minutoCercano(p.minuto));
  }, [isoValue]);

  const periodo: Periodo = h24 >= 12 ? 'pm' : 'am';

  const emitir = (nextH24: number, nextMinuto: number) => {
    setH24(nextH24);
    setMinuto(nextMinuto);
    onTimeChange(dateToIso(dateConH24(base, nextH24, nextMinuto)));
  };

  return (
    <div className="mpc-time-panel" role="group" aria-label="Hora">
      <p className="mpc-time-panel__title">Hora</p>
      <div className="mpc-time-panel__row">
        <label className="mpc-time-panel__field">
          <span className="mpc-time-panel__label">H</span>
          <select
            className="mpc-time-panel__select"
            value={h24}
            onChange={(e) => emitir(Number(e.target.value), minuto)}
            aria-label="Hora (0 a 23)"
          >
            {HORAS_24.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}
              </option>
            ))}
          </select>
        </label>

        <span className="mpc-time-panel__sep" aria-hidden="true">
          :
        </span>

        <label className="mpc-time-panel__field">
          <span className="mpc-time-panel__label">Min</span>
          <select
            className="mpc-time-panel__select"
            value={minuto}
            onChange={(e) => emitir(h24, Number(e.target.value))}
            aria-label="Minutos"
          >
            {MINUTOS_OPCIONES.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
        </label>

        <div className="mpc-time-panel__periodo" role="group" aria-label="AM o PM">
          {(['am', 'pm'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`mpc-time-panel__periodo-btn ${periodo === p ? 'mpc-time-panel__periodo-btn--active' : ''}`}
              aria-pressed={periodo === p}
              onClick={() => {
                if (p === periodo) return;
                const nextH24 = h24TrasCambiarPeriodo(h24, p);
                emitir(nextH24, minuto);
              }}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CalendarShellProps {
  className?: string;
  children?: React.ReactNode;
  isoValue: string;
  selectedDate: Date | null;
  onTimeChange: (iso: string) => void;
}

function CalendarShell({
  className,
  children,
  isoValue,
  selectedDate,
  onTimeChange,
}: CalendarShellProps) {
  return (
    <div className={className}>
      <div className="mpc-calendar-layout">
        <div className="mpc-calendar-layout__date">{children}</div>
        <TimePanel isoValue={isoValue} selectedDate={selectedDate} onTimeChange={onTimeChange} />
      </div>
    </div>
  );
}

interface DateTimePickerProps {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoOpen?: boolean;
  /** Renderiza el calendario en document.body (recomendado dentro de drawers/modales). */
  usePortal?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  required,
  autoOpen,
  usePortal = false,
}: DateTimePickerProps) {
  const pickerRef = useRef<ReactDatePicker>(null);
  const selected = parseIsoLocal(value);

  useEffect(() => {
    if (!autoOpen) return;
    const t = setTimeout(() => {
      pickerRef.current?.setOpen(true);
    }, 220);
    return () => clearTimeout(t);
  }, [autoOpen]);

  const handleDateChange = (date: Date | null) => {
    if (!date) {
      onChange('');
      return;
    }
    const { h24, minuto } = partesDesdeIso(value);
    onChange(dateToIso(dateConH24(date, h24, minutoCercano(minuto))));
  };

  return (
    <ReactDatePicker
      ref={pickerRef}
      selected={selected}
      onChange={handleDateChange}
      locale="es"
      minDate={new Date()}
      customInput={<TriggerButton isoValue={value} />}
      popperPlacement="bottom-start"
      popperProps={{ strategy: 'fixed' }}
      withPortal={usePortal}
      required={required}
      calendarClassName="mpc-calendar mpc-calendar--con-hora"
      wrapperClassName="w-full"
      calendarContainer={({ className, children }) => (
        <CalendarShell
          className={className}
          isoValue={value}
          selectedDate={selected}
          onTimeChange={onChange}
        >
          {children}
        </CalendarShell>
      )}
    />
  );
}
