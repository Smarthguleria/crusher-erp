'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning';
interface ToastItem { id: number; msg: string; type: ToastType; leaving?: boolean }

interface ToastCtx {
  toast: (msg: string, type?: ToastType, dur?: number) => void;
}
const Ctx = createContext<ToastCtx | null>(null);

let idCounter = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, type: ToastType = 'success', dur = 3000) => {
    const id = idCounter++;
    setItems(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, leaving: true } : i));
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 320);
    }, dur);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div id="toast-wrap">
        {items.map(t => (
          <div
            key={t.id}
            className={`toast ${t.type}`}
            style={t.leaving ? { animation: 'slideOut 0.3s ease forwards' } : undefined}
          >
            <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : '⚠'}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
