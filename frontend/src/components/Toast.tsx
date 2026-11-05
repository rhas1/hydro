import { CircleCheck, CircleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { cx } from "./ui";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 lg:top-auto lg:right-6 lg:bottom-6 lg:left-auto lg:items-end print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cx(
              "flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ring-1",
              toast.tone === "success"
                ? "bg-abyss-900 text-white ring-white/10"
                : "bg-red-600 text-white ring-red-700",
            )}
          >
            {toast.tone === "success" ? (
              <CircleCheck className="size-5 shrink-0 text-brand-300" />
            ) : (
              <CircleAlert className="size-5 shrink-0" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
