import { useEffect, useMemo, useRef, useState } from 'react';

export interface PromotorInformeOption {
  promotorId: string;
  promotorNombre: string;
  supervisorNombre?: string;
}

interface PromotorInformeFilterProps {
  promotores: PromotorInformeOption[];
  selectedIds: Set<string>;
  onChangeSelected: (ids: Set<string>) => void;
}

export function PromotorInformeFilter({
  promotores,
  selectedIds,
  onChangeSelected,
}: PromotorInformeFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const promotoresOrdenados = useMemo(
    () =>
      [...promotores].sort((a, b) =>
        a.promotorNombre.localeCompare(b.promotorNombre, 'es'),
      ),
    [promotores],
  );

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return promotoresOrdenados;
    return promotoresOrdenados.filter(
      (p) =>
        p.promotorNombre.toLowerCase().includes(q) ||
        (p.supervisorNombre?.toLowerCase().includes(q) ?? false),
    );
  }, [promotoresOrdenados, query]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChangeSelected(next);
  };

  const seleccionarVisibles = () => {
    const next = new Set(selectedIds);
    for (const p of filtrados) next.add(p.promotorId);
    onChangeSelected(next);
  };

  const limpiar = () => {
    onChangeSelected(new Set());
    setQuery('');
  };

  const label =
    selectedIds.size === 0
      ? 'Todos los promotores'
      : `${selectedIds.size} seleccionado${selectedIds.size === 1 ? '' : 's'}`;

  return (
    <div className="relative w-full sm:w-auto shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex w-full sm:w-auto min-w-[11rem] items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all cursor-pointer shadow-sm ${
          selectedIds.size > 0
            ? 'border-brand-300 bg-brand-50/60 text-brand-900'
            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-100 p-2.5 space-y-2">
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              >
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o equipo…"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-8 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-100"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  aria-label="Limpiar búsqueda"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={seleccionarVisibles}
                disabled={filtrados.length === 0}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40 cursor-pointer"
              >
                Tildar visibles
              </button>
              <button
                type="button"
                onClick={limpiar}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100 cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          </div>

          <ul className="max-h-64 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {filtrados.length === 0 ? (
              <li className="px-3 py-4 text-center text-[12px] text-zinc-400">
                Sin resultados para &ldquo;{query.trim()}&rdquo;
              </li>
            ) : (
              filtrados.map((p) => {
                const checked = selectedIds.has(p.promotorId);
                return (
                  <li key={p.promotorId}>
                    <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-zinc-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.promotorId)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-brand-600 focus:ring-brand-200"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-zinc-900 truncate">
                          {p.promotorNombre}
                        </span>
                        {p.supervisorNombre && (
                          <span className="block text-[11px] text-zinc-400 truncate">
                            {p.supervisorNombre}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
