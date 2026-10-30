import { useEffect, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

let externalPush: ((message: string, type: ToastType) => void) | null = null;

export function toast(message: string, type: ToastType = 'info') {
  if (externalPush) externalPush(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, type: ToastType) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    externalPush = push;
    return () => { externalPush = null; };
  }, [push]);

  return (
    <div className="fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 safe-top">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-slide-down flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            t.type === 'success'
              ? 'bg-emerald-600 text-white'
              : t.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-slate-800 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
