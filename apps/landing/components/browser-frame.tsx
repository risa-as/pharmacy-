import { ReactNode } from "react";
export function BrowserFrame({
  children,
  url = "app.faramace.com",
  className = "",
}: {
  children: ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/10 shadow-lift ${className}`}
    >
      <div
        className="flex h-9 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3"
        dir="ltr"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="mx-auto rounded-md bg-white px-3 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}
