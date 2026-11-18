import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export function ToastContainer() {
  const { toasts, dismissToast } = useStore();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((t) => {
        const icon =
          t.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : t.type === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#244B75] shrink-0" />
          );

        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto bg-white rounded-xl px-4 py-3 shadow-lg flex items-start gap-3 text-sm text-[#253449] border border-[#E5EAF0]"
          >
            <div className="mt-0.5">{icon}</div>
            <p className="flex-1 text-xs sm:text-sm leading-snug font-medium">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Tutup notifikasi"
              className="text-[#718096] hover:text-[#102A43] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
