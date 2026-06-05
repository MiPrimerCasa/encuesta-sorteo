import { Drawer } from 'vaul';
import type { Barrio } from '../../types';

interface BarrioPickerSheetProps {
  open: boolean;
  barrios: Barrio[];
  selectedId: string;
  onClose: () => void;
  onSelect: (idBarrio: string) => void;
}

export function BarrioPickerSheet({
  open,
  barrios,
  selectedId,
  onClose,
  onSelect,
}: BarrioPickerSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-zinc-950/50 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[70] flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ maxHeight: 'min(85dvh, 560px)' }}
          aria-labelledby="barrio-picker-title"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-300" />
          <div className="border-b border-zinc-100 px-4 py-3">
            <Drawer.Title
              id="barrio-picker-title"
              className="text-[17px] font-semibold text-zinc-900"
            >
              Seleccionar barrio
            </Drawer.Title>
            <p className="mt-1 text-[13px] text-zinc-500">
              Elegí el barrio del terreno vendido.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {barrios.length === 0 ? (
              <p className="text-[13px] text-red-600">No hay barrios cargados.</p>
            ) : (
              <div className="space-y-2 pb-4">
                {barrios.map((barrio) => {
                  const sel = selectedId === barrio.id;
                  return (
                    <button
                      key={barrio.id}
                      type="button"
                      onClick={() => {
                        onSelect(barrio.id);
                        onClose();
                      }}
                      style={{ touchAction: 'manipulation' }}
                      className={`flex h-12 w-full items-center justify-between rounded-lg border px-4 text-left text-[15px] font-medium transition-all duration-[140ms] ease-out ${
                        sel
                          ? 'border-brand-700 bg-brand-600 text-white active:bg-brand-700'
                          : 'border-zinc-200 bg-white text-zinc-800 active:bg-brand-50 active:border-brand-600 active:text-brand-700'
                      }`}
                    >
                      <span>{barrio.nombre}</span>
                      {sel && (
                        <svg
                          className="h-5 w-5 shrink-0"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
