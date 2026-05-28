import type { ReactNode } from 'react';

interface ButtonOption<T> {
  value: T;
  label: string;
}

interface ButtonGroupProps<T> {
  label?: string;
  name?: string;
  options: ButtonOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
}

export function ButtonGroup<T>({ label, options, value, onChange, name }: ButtonGroupProps<T>) {
  return (
    <fieldset className="space-y-2">
      {label && (
        <legend className="text-[14px] font-medium text-zinc-700">{label}</legend>
      )}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 2)}, 1fr)` }}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              name={name}
              onClick={() => onChange(opt.value)}
              style={{ touchAction: 'manipulation' }}
              className={`h-[52px] w-full rounded-lg text-[15px] font-semibold transition-all duration-[140ms] ease-out ${
                selected
                  ? 'border border-brand-700 bg-brand-600 text-white active:bg-brand-700 active:scale-[0.99]'
                  : 'border border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700 active:scale-[0.99]'
              }`}
              aria-pressed={selected}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface RadioOptionProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  name: string;
  value: string;
}

export function RadioOption({ label, checked, onChange, name, value }: RadioOptionProps) {
  return (
    <label
      className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-[140ms] ease-out ${
        checked
          ? 'border-brand-600 bg-brand-50 active:bg-brand-100'
          : 'border-zinc-200 bg-white active:bg-brand-50 active:border-brand-200'
      }`}
      style={{ touchAction: 'manipulation' }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-[140ms] ${
          checked ? 'border-brand-600' : 'border-zinc-300'
        }`}
        aria-hidden="true"
      >
        {checked && <span className="h-2 w-2 rounded-full bg-brand-600" />}
      </span>
      <span
        className={`text-[15px] transition-colors ${
          checked ? 'font-semibold text-brand-800' : 'font-medium text-zinc-800'
        }`}
      >
        {label}
      </span>
    </label>
  );
}

interface FormSectionProps {
  title: string;
  step?: number;
  totalSteps?: number;
  children: ReactNode;
  visible?: boolean;
}

export function FormSection({ title, step, totalSteps, children, visible = true }: FormSectionProps) {
  if (!visible) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          {title}
        </h3>
        {step != null && totalSteps != null && (
          <span className="text-[11px] tabular-nums text-zinc-400">
            paso {step} de {totalSteps}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
