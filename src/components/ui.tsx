"use client";

import { useEffect, useRef } from "react";
import { X, Inbox, LoaderCircle } from "lucide-react";
import { cn, STATUS_STYLES } from "@/lib/utils";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ComponentType, SVGProps, KeyboardEvent as ReactKeyboardEvent } from "react";

/* ── Layout primitives ─────────────────────────────────────────── */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-edge bg-panel", className)}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Buttons ───────────────────────────────────────────────────── */

type BtnVariant = "gold" | "ghost" | "danger" | "outline";

export function Button({
  variant = "gold",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    gold: "bg-gold text-black hover:bg-gold-soft font-semibold",
    ghost: "text-stone-300 hover:bg-panel-2 hover:text-white",
    outline: "border border-edge text-stone-200 hover:border-gold/60 hover:text-gold",
    danger: "bg-rose-600/15 text-rose-400 border border-rose-600/30 hover:bg-rose-600/25",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

/* ── Form controls ─────────────────────────────────────────────── */

const fieldCls =
  "w-full rounded-xl border border-edge bg-panel-2 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500 outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/40";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldCls, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldCls, "appearance-none", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldCls, "min-h-24", className)} {...props} />;
}

export function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-400">{error}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={label && id ? id : undefined}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className="flex items-center gap-2 text-sm text-stone-300"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked ? "bg-gold" : "bg-edge"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all",
            checked ? "left-4.5" : "left-0.5"
          )}
        />
      </span>
      {label && <span id={id}>{label}</span>}
    </button>
  );
}

/* ── Feedback ──────────────────────────────────────────────────── */

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-panel-2/60", className)} />
  );
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  hint,
  trend,
}: {
  title: string;
  value: string | number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  hint?: string;
  trend?: { value: number; label: string };
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
          {trend && (
            <p className={cn("mt-1 text-xs font-medium", trend.value >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-gold/10 p-2.5">
          <Icon className="h-5 w-5 text-gold" />
        </div>
      </div>
    </Card>
  );
}

export function Badge({ status, children }: { status?: string; children: ReactNode }) {
  const style = (status && STATUS_STYLES[status]) || "bg-zinc-500/10 text-zinc-300 border-zinc-500/30";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", style)}>
      {children}
    </span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
      <LoaderCircle className="h-8 w-8 animate-spin text-gold" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-edge py-16 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-panel-2">
        <Inbox className="h-6 w-6 text-gold" />
      </div>
      <p className="font-medium text-stone-200">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ── ActionMenu ─────────────────────────────────────────────────── */

export function ActionMenu({
  items,
  trigger,
}: {
  items: { label: string; destructive?: boolean; onClick: () => void }[];
  trigger: ReactNode;
}) {
  return (
    <div className="relative inline-flex">
      <details className="group">
        <summary className="list-none cursor-pointer rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-white">
          {trigger ?? <span className="text-xs">Actions</span>}
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-edge bg-panel shadow-xl">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className={cn(
                "block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-panel-2",
                item.destructive ? "text-rose-400" : "text-stone-200"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

/* ── Toast / Toaster ──────────────────────────────────────────── */

type Toast = { id: number; title: string; description?: string; status?: "success" | "error" };

const toastColors: Record<string, string> = {
  success: "border-emerald-500/40 text-emerald-300",
  error: "border-rose-500/40 text-rose-300",
};

export function Toaster({ toasts }: { toasts: Toast[] }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={cn(
            "rounded-xl border bg-panel px-4 py-3 shadow-2xl backdrop-blur",
            toastColors[t.status || ""] || "border-edge text-stone-200"
          )}
        >
          <p className="text-sm font-medium">{t.title}</p>
          {t.description && <p className="text-xs text-muted">{t.description}</p>}
        </div>
      ))}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape + trap focus inside the dialog while open
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(focusableSelector)
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, { signal: controller.signal });

    return () => {
      controller.abort();
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-edge bg-panel p-6 shadow-2xl outline-none sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
