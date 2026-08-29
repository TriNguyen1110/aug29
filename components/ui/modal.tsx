"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Portal-based modal — retheme of willder's modal.tsx: square corners, no per-accent
// glow bar, dark surface + low-opacity border instead of the warm ink backdrop.
const SIZE: Record<"lg" | "xl" | "2xl" | "3xl" | "wide", string> = {
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  wide: "max-w-[78vw]",
};

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "lg" | "xl" | "2xl" | "3xl" | "wide";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full ${SIZE[size]} -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border-strong bg-surface shadow-2xl`}
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
