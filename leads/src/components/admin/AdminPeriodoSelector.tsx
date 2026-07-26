import { useEffect, useState } from 'react';
import {
  anioCalendarioIso,
  esPeriodoAnio,
  esPeriodoDia,
  esPeriodoMesCalendario,
  etiquetaAnioPeriodo,
  mesCalendarioIso,
} from '../../domain/admin-periodo';

interface AdminPeriodoSelectorProps {
  periodo: string;
  onCambiarPeriodo: (periodo: string) => void;
  className?: string;
}

export function AdminPeriodoSelector({
  periodo,
  onCambiarPeriodo,
  className = '',
}: AdminPeriodoSelectorProps) {
  const esDia = esPeriodoDia(periodo);
  const esMes = esPeriodoMesCalendario(periodo);
  const esMesActual = periodo === 'mes';
  const esAnio = esPeriodoAnio(periodo);
  const esAnioActual = periodo === 'anio';
  const anioCanonico = esAnio ? etiquetaAnioPeriodo(periodo) : anioCalendarioIso();
  const [anioDraft, setAnioDraft] = useState(anioCanonico);

  useEffect(() => {
    setAnioDraft(anioCanonico);
  }, [anioCanonico]);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 border border-zinc-200/50 shadow-sm shrink-0">
        <button
          type="button"
          onClick={() => onCambiarPeriodo('hoy')}
          className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-all cursor-pointer ${
            periodo === 'hoy'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => onCambiarPeriodo('semana')}
          className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-all cursor-pointer ${
            periodo === 'semana'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Semana
        </button>
        <button
          type="button"
          onClick={() => onCambiarPeriodo('mes')}
          className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-all cursor-pointer ${
            periodo === 'mes'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Mes actual
        </button>
        <button
          type="button"
          onClick={() => onCambiarPeriodo('anio')}
          className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-all cursor-pointer ${
            esAnioActual
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Año actual
        </button>
      </div>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={anioDraft}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
          setAnioDraft(raw);
          if (/^\d{4}$/.test(raw)) onCambiarPeriodo(raw);
        }}
        onBlur={() => {
          if (!/^\d{4}$/.test(anioDraft)) setAnioDraft(anioCanonico);
        }}
        title="Elegir año"
        aria-label="Elegir año"
        className={`w-[5.5rem] rounded-lg border px-2 py-1 text-[11.5px] font-semibold focus:outline-none focus:ring-1 focus:ring-brand-100 transition-all ${
          esAnio
            ? 'border-brand-300 bg-brand-50/50 text-brand-900'
            : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800'
        }`}
      />

      <input
        type="month"
        value={esMes ? periodo : mesCalendarioIso()}
        onChange={(e) => {
          onCambiarPeriodo(e.target.value || 'mes');
        }}
        title="Elegir mes"
        className={`rounded-lg border px-2 py-1 text-[11.5px] font-semibold focus:outline-none focus:ring-1 focus:ring-brand-100 transition-all ${
          esMes || esMesActual
            ? 'border-brand-300 bg-brand-50/50 text-brand-900'
            : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800'
        }`}
      />

      <input
        type="date"
        value={esDia ? periodo : ''}
        onChange={(e) => {
          onCambiarPeriodo(e.target.value || 'mes');
        }}
        title="Elegir día"
        className={`rounded-lg border px-2 py-1 text-[11.5px] font-semibold focus:outline-none focus:ring-1 focus:ring-brand-100 transition-all ${
          esDia
            ? 'border-brand-300 bg-brand-50/50 text-brand-900'
            : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800'
        }`}
      />
    </div>
  );
}
