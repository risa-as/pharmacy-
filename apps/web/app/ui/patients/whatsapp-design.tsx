"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Info, Loader2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill, type PillTone } from "@/app/ui/data-table";

export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50";
export const selectClass = `${fieldClass} h-10`;
export const stateNames: Record<string, string> = {
  DRAFT: "مسودة",
  SUBMITTING: "محاولة اعتماد محفوظة",
  PENDING: "بانتظار الاعتماد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  PAUSED: "موقوف",
  DISABLED: "معطل",
  QUEUED: "بانتظار الإرسال",
  SCHEDULED: "مجدولة",
  SENDING: "جارٍ الإرسال",
  SENT: "قُبلت للإرسال",
  DELIVERED: "تم التسليم",
  READ: "تمت القراءة",
  FAILED: "فشل",
  UNKNOWN: "نتيجة غير مؤكدة",
  BLOCKED: "لم تُرسل؛ يلزم معالجة السبب",
  COMPLETE: "انتهت المعالجة",
  NEEDS_REVIEW: "تحتاج مراجعة",
  CANCELLED: "أُوقفت",
};
export function WaStatus({ status }: { status: string }) {
  const tone: PillTone = ["APPROVED", "DELIVERED", "READ", "COMPLETE"].includes(
    status,
  )
    ? "success"
    : ["FAILED", "REJECTED"].includes(status)
      ? "destructive"
      : ["UNKNOWN", "BLOCKED", "NEEDS_REVIEW", "PAUSED"].includes(status)
        ? "warning"
        : [
              "PENDING",
              "SUBMITTING",
              "QUEUED",
              "SCHEDULED",
              "SENDING",
              "SENT",
            ].includes(status)
          ? "info"
          : "muted";
  return <StatusPill tone={tone}>{stateNames[status] ?? status}</StatusPill>;
}
export function WaNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "error";
}) {
  const styles = {
    info: "border-info/20 bg-info/5 text-info",
    warning: "border-warning/20 bg-warning/5 text-warning",
    error: "border-destructive/20 bg-destructive/5 text-destructive",
  };
  const Icon = tone === "info" ? Info : AlertCircle;
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${styles[tone]}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
export function WaField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm">
      <span className="block font-medium text-foreground">{label}</span>
      {children}
      {hint && (
        <span className="block text-xs leading-relaxed text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
export function WaSectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="font-bold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
export function WaLoading({
  text = "جارٍ تحميل البيانات…",
}: {
  text?: string;
}) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
    >
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

/** Same card, controls and backdrop as the application; portal avoids layout clipping. */
export function WaDialog({
  title,
  description,
  icon: Icon,
  children,
  footer,
  close,
  busy,
  wide = false,
  label,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
  footer: ReactNode;
  close: () => void;
  busy: boolean;
  wide?: boolean;
  label: string;
}) {
  const [mounted, setMounted] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    closeRef = useRef(close),
    busyRef = useRef(busy);
  const titleId = useId(),
    descriptionId = useId();
  closeRef.current = close;
  busyRef.current = busy;
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const previousFocus = document.activeElement as HTMLElement | null,
      previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== "Tab" || !root.current) return;
      const elements = Array.from(
        root.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
        ),
      ).filter((e) => e.getClientRects().length > 0);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        root.current.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === root.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === root.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handler);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-3 sm:p-6 animate-fade-in"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold text-foreground">
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="mt-1 text-xs leading-relaxed text-muted-foreground"
              >
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            aria-label="إغلاق النافذة"
            disabled={busy}
            onClick={close}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3 sm:px-6">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
