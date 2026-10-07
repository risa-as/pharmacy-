import type { ReactNode } from "react";
import { Search } from "lucide-react";

/*
 * Building blocks for list tables, matching the batches table (app/ui/batches/batch-table.tsx):
 * a card with a search bar on top, a muted header row, compact rows, status pills and small
 * bordered action buttons. Server-safe (no hooks), so pages and client tables can both use them.
 */

/** The card around a list: search bar, table, pagination. */
export function TableCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card overflow-hidden ${className}`}>{children}</div>;
}

/** The bar at the top of the card (search field, result count, filters). */
export function TableToolbar({ children }: { children: ReactNode }) {
  return <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">{children}</div>;
}

/** A titled bar for lists without a search (e.g. a recent-activity log). */
export function TableTitle({ icon, title, aside }: { icon?: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="p-4 border-b border-border flex items-center gap-2">
      {icon}
      <h2 className="font-bold text-foreground">{title}</h2>
      {aside && <span className="mr-auto text-sm text-muted-foreground">{aside}</span>}
    </div>
  );
}

/**
 * The search field for lists filtered in the browser (small lists loaded in full). Same look as
 * TableSearch (app/ui/table-search.tsx), which searches through the URL.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1 min-w-[200px]" dir="rtl">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background py-2 pr-9 pl-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
      />
    </div>
  );
}

/** «N نتيجة لـ "…"» while searching, otherwise «N <unit>». */
export function ResultCount({ total, query, unit }: { total: number; query?: string; unit: string }) {
  return (
    <span className="text-sm text-muted-foreground">
      {query ? (
        <>
          {total.toLocaleString("en-US")} نتيجة لـ &quot;<span className="font-bold text-foreground">{query}</span>&quot;
        </>
      ) : (
        <>
          {total.toLocaleString("en-US")} {unit}
        </>
      )}
    </span>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-right">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, center = false }: { children?: ReactNode; center?: boolean }) {
  return (
    <th className={`px-3 py-3 ${center ? "text-center" : "text-right"} font-medium font-cairo whitespace-nowrap`}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border bg-card">{children}</tbody>;
}

export const rowClass = "hover:bg-muted/40 transition-colors";
export const cellClass = "px-3 py-3";

/** Bold first line with a small second line (name + code, drug + barcode…). */
export function PrimaryCell({
  title,
  subtitle,
  subtitleLtr = false,
  maxWidth = "max-w-[200px]",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  subtitleLtr?: boolean;
  maxWidth?: string;
}) {
  return (
    <div className={maxWidth}>
      <p className="font-semibold text-foreground truncate" title={typeof title === "string" ? title : undefined}>
        {title}
      </p>
      {subtitle != null && subtitle !== "" && (
        <p
          className={`text-[10px] text-muted-foreground truncate ${subtitleLtr ? "text-right" : ""}`}
          dir={subtitleLtr ? "ltr" : undefined}
          title={typeof subtitle === "string" ? subtitle : undefined}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** Muted text that truncates, e.g. a branch or supplier name. */
export function MutedText({ children, maxWidth = "max-w-[160px]" }: { children?: ReactNode; maxWidth?: string }) {
  if (children == null || children === "") return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className={`block ${maxWidth} truncate`} title={typeof children === "string" ? children : undefined}>
      {children}
    </span>
  );
}

/** Date over time, Baghdad time. */
export function DateTimeCell({ date, showTime = true }: { date: Date | string; showTime?: boolean }) {
  const d = new Date(date);
  return (
    <div className="text-xs text-muted-foreground leading-tight whitespace-nowrap" dir="ltr" suppressHydrationWarning>
      <div>{d.toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}</div>
      {showTime && (
        <div className="text-[10px] text-muted-foreground/60">
          {d.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}
        </div>
      )}
    </div>
  );
}

export type PillTone = "success" | "warning" | "destructive" | "info" | "primary" | "muted" | "amber";

const PILL_TONES: Record<PillTone, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/20",
  primary: "bg-primary/10 text-primary border-primary/20",
  muted: "bg-muted text-muted-foreground border-border",
  amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold ${PILL_TONES[tone]}`}>
      {children}
    </span>
  );
}

const ACTION_HOVER: Record<"primary" | "success" | "destructive" | "warning", string> = {
  primary: "hover:bg-primary/10 hover:text-primary hover:border-primary/50",
  success: "hover:bg-success/10 hover:text-success hover:border-success/50",
  destructive: "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50",
  warning: "hover:bg-warning/10 hover:text-warning hover:border-warning/50",
};

/** Classes for a small bordered icon button in the actions column. */
export function actionClass(tone: keyof typeof ACTION_HOVER = "primary") {
  return `inline-flex items-center justify-center rounded-lg border border-border p-1.5 text-muted-foreground transition-colors ${ACTION_HOVER[tone]}`;
}

/** Holds the action buttons of a row. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-center gap-1.5">{children}</div>;
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="py-16 text-center">
      <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4 text-muted-foreground [&>svg]:w-8 [&>svg]:h-8 [&>svg]:opacity-50">
        {icon}
      </div>
      <p className="text-foreground font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
