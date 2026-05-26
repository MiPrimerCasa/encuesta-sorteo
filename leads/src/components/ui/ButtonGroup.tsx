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
        <legend className="text-sm font-semibold text-neutral-800">{label}</legend>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              name={name}
              onClick={() => onChange(opt.value)}
              className={`min-h-12 flex-1 min-w-[120px] rounded-full px-4 py-3 text-base font-bold uppercase transition touch-manipulation ${
                selected
                  ? 'bg-brand text-white shadow-md ring-2 ring-brand/40'
                  : 'border-2 border-neutral-200 bg-white text-neutral-800 hover:border-brand/40 active:bg-neutral-50'
              }`}
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
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-light">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 accent-brand"
      />
      <span className="text-base text-neutral-800">{label}</span>
    </label>
  );
}

interface FormSectionProps {
  title: string;
  children: ReactNode;
  visible?: boolean;
}

export function FormSection({ title, children, visible = true }: FormSectionProps) {
  if (!visible) return null;
  return (
    <section className="space-y-3 rounded-2xl border-2 border-brand/15 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wide text-brand">{title}</h3>
      {children}
    </section>
  );
}
