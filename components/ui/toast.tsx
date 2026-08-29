"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Retheme of willder's toast.tsx: error/success/info map onto the reserved status
// colors (blocking/resolved/accent) instead of brick/gold, square corners.
type ToastVariant = "error" | "success" | "info";

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

const COLORS: Record<ToastVariant, string> = {
  error: "border-status-blocking/40 bg-status-blocking/10 text-foreground",
  success: "border-status-resolved/30 bg-status-resolved/10 text-foreground",
  info: "border-border-strong bg-surface-raised text-foreground",
};

let _id = 0;

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 10);
    const hide = setTimeout(() => setVisible(false), 3500);
    const remove = setTimeout(() => onRemove(t.id), 3800);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [t.id, onRemove]);

  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm shadow-xl transition-all duration-300 ${COLORS[t.variant]} ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
      style={{ minWidth: 260, maxWidth: 380 }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-sm leading-none">
          {t.variant === "error" ? "✕" : t.variant === "success" ? "✓" : "·"}
        </span>
        <p className="leading-snug">{t.message}</p>
        <button
          onClick={() => onRemove(t.id)}
          className="ml-auto shrink-0 text-muted hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    setToasts((prev) => [...prev, { id: ++_id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end">
            {toasts.map((t) => (
              <ToastItem key={t.id} t={t} onRemove={remove} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
