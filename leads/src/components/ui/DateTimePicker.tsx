import { forwardRef, useEffect, useRef } from 'react';
import ReactDatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('es', es);

function isoToDate(isoStr: string): Date | null {
  if (!isoStr) return null;
  return new Date(isoStr + ':00');
}

function dateToIso(date: Date | null): string {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface TriggerButtonProps {
  value?: string;
  onClick?: () => void;
}

const TriggerButton = forwardRef<HTMLButtonElement, TriggerButtonProps>(
  function TriggerButton({ value, onClick }, ref) {
    const hasDate = Boolean(value);

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
            <>
              <path d="M5 10h2M9 10h2M5 12.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </>
          )}
        </svg>

        <span className="flex-1 text-left font-medium">
          {value || 'Seleccionar fecha y hora…'}
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

interface DateTimePickerProps {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoOpen?: boolean;
}

export function DateTimePicker({ value, onChange, required, autoOpen }: DateTimePickerProps) {
  const pickerRef = useRef<ReactDatePicker>(null);

  useEffect(() => {
    if (!autoOpen) return;
    const t = setTimeout(() => {
      pickerRef.current?.setOpen(true);
    }, 180);
    return () => clearTimeout(t);
  }, []);

  return (
    <ReactDatePicker
      ref={pickerRef}
      selected={isoToDate(value)}
      onChange={(date: Date | null) => onChange(dateToIso(date))}
      showTimeSelect
      timeFormat="HH:mm"
      timeIntervals={15}
      dateFormat="d 'de' MMMM yyyy, HH:mm"
      locale="es"
      minDate={new Date()}
      customInput={<TriggerButton />}
      popperPlacement="bottom-start"
      popperProps={{ strategy: 'fixed' }}
      required={required}
      calendarClassName="mpc-calendar"
      wrapperClassName="w-full"
    />
  );
}
