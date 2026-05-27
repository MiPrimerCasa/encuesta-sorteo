interface Option<T> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'sm';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  const sm = size === 'sm';

  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-zinc-100 p-1" role="tablist">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-md font-medium transition-all touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-brand-600/25 ${
              sm ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-[13px]'
            } ${
              active
                ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(15,15,15,0.06),0_1px_2px_rgba(15,15,15,0.04)]'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
