import { useState, useEffect, useCallback } from "react";

export type Toast = {
  id: number;
  title: string;
  description?: string;
  status?: "success" | "error" | "info";
};

let toastId = 0;

const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];

function notify(listeners: Set<(toasts: Toast[]) => void>, toasts: Toast[]) {
  listeners.forEach((listener) => listener(toasts));
}

export function addToast(toast: Omit<Toast, "id">) {
  const newToast = { ...toast, id: ++toastId };
  toasts = [...toasts, newToast];
  notify(listeners, toasts);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== newToast.id);
    notify(listeners, toasts);
  }, 4000);

  return newToast.id;
}

export function useToast() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>(toasts);

  // Subscribe to toast updates
  useEffect(() => {
    listeners.add(setCurrentToasts);
    return () => {
      listeners.delete(setCurrentToasts);
    };
  }, []);

  const toast = {
    success: useCallback((title: string, description?: string) =>
      addToast({ title, description, status: "success" }), []),
    error: useCallback((title: string, description?: string) =>
      addToast({ title, description, status: "error" }), []),
    info: useCallback((title: string, description?: string) =>
      addToast({ title, description, status: "info" }), []),
  };

  return { toast, toasts: currentToasts };
}

