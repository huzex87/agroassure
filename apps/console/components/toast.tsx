"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

// A short message in the corner of the screen after an action: what happened,
// then gone. Errors stay longer, because they are what a person has to read
// and act on. It is a polite live region, so a screen reader hears it without
// being pulled away from what it was reading.

type Tone = "success" | "error";
type Toast = { id: number; tone: Tone; message: string };

const ToastContext = createContext<(tone: Tone, message: string) => void>(() => {});

export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(
    () => ({
      success: (message: string) => show("success", message),
      error: (message: string) => show("error", message),
    }),
    [show],
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (tone: Tone, message: string) => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === "error" ? 9000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border bg-card px-4 py-3 text-sm shadow-overlay animate-in fade-in slide-in-from-bottom-2 ${
              t.tone === "error" ? "border-destructive-border" : "border-success-border"
            }`}
          >
            {t.tone === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            )}
            <p className="min-w-0 flex-1 leading-relaxed text-ink">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-m-1 rounded-control p-1 text-ink-faint transition-colors hover:bg-surface-sunk hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
