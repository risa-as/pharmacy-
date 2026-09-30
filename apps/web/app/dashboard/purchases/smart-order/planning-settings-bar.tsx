"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PlanningOptions } from "@/app/lib/smart-purchasing";
import {
  SETTINGS_SOURCE_LABEL,
  MAX_TRANSFER_DAYS,
  describeOptions,
  sameOptions,
  type SettingsSource,
} from "@/app/lib/purchase-planning-shared";

/** OPEN-14: the branch's saved settings as returned by /api/purchases/planning-settings. */
export type SavedSettings = {
  branchId: string;
  options: PlanningOptions;
  source: Exclude<SettingsSource, "CUSTOM">;
  transferDays: number;
  organization: (PlanningOptions & { transferDays: number; updatedAt: string }) | null;
  branch: (PlanningOptions & { transferDays: number; updatedAt: string }) | null;
  canEditOrganization: boolean;
  canEditBranch: boolean;
};

/** Where the current page values come from; CUSTOM when changed on the page and not saved. */
export function currentSource(saved: SavedSettings | null, options: PlanningOptions): SettingsSource {
  if (!saved) return "CUSTOM";
  return sameOptions(saved.options, options) ? saved.source : "CUSTOM";
}

const small =
  "inline-flex min-h-8 items-center rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50";

export function PlanningSettingsBar({
  saved,
  options,
  transferDays,
  onTransferDays,
  onSaved,
}: {
  saved: SavedSettings | null;
  options: PlanningOptions;
  /** Waste card transfer proposals only; saved with the same scope as the options. */
  transferDays: number;
  onTransferDays: (days: number) => void;
  onSaved: (s: SavedSettings) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!saved) return null;
  const optionsSource = currentSource(saved, options);
  const source: SettingsSource =
    optionsSource === "CUSTOM" || transferDays !== saved.transferDays ? "CUSTOM" : optionsSource;
  async function send(method: "PUT" | "DELETE", scope?: "ORGANIZATION" | "BRANCH") {
    if (!saved || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        method === "DELETE"
          ? `/api/purchases/planning-settings?branchId=${encodeURIComponent(saved.branchId)}`
          : "/api/purchases/planning-settings",
        method === "DELETE"
          ? { method }
          : {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scope, branchId: saved.branchId, ...options, transferDays }),
            },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "تعذر حفظ الإعدادات");
      onSaved(data);
      toast.success(
        method === "DELETE"
          ? "أُزيل إعداد الفرع؛ يطبَّق إعداد المؤسسة"
          : scope === "ORGANIZATION"
            ? "حُفظ إعداداً افتراضياً للمؤسسة"
            : "حُفظ إعداداً لهذا الفرع",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ الإعدادات");
    } finally {
      setBusy(false);
    }
  }
  const dirty = source === "CUSTOM";
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs"
      data-testid="planning-settings"
    >
      <span className={dirty ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
        {SETTINGS_SOURCE_LABEL[source]}
        {dirty ? ` (المحفوظ: ${describeOptions(saved.options)}، نقل ${saved.transferDays} يوم)` : ""}
      </span>
      <label className="inline-flex items-center gap-1.5">
        مدة النقل بين الفروع (يوم)
        <input
          type="number"
          min={0}
          max={MAX_TRANSFER_DAYS}
          value={transferDays}
          data-testid="transfer-days"
          className="w-14 rounded border bg-background px-1.5 py-0.5"
          onChange={(e) =>
            onTransferDays(Math.max(0, Math.min(MAX_TRANSFER_DAYS, Math.trunc(Number(e.target.value) || 0))))
          }
        />
        <span className="text-muted-foreground">لاقتراحات التحويل في بطاقة الهدر</span>
      </label>
      {saved.canEditBranch && dirty && (
        <button className={small} disabled={busy} onClick={() => send("PUT", "BRANCH")}>
          حفظ لهذا الفرع
        </button>
      )}
      {saved.canEditOrganization && (dirty || saved.source === "DEFAULT") && (
        <button className={small} disabled={busy} onClick={() => send("PUT", "ORGANIZATION")}>
          حفظ افتراضياً للمؤسسة
        </button>
      )}
      {saved.canEditBranch && saved.branch && (
        <button className={small} disabled={busy} onClick={() => send("DELETE")}>
          العودة لإعداد المؤسسة
        </button>
      )}
      <span className="text-muted-foreground">
        بطاقة «شنو أطلب اليوم؟» في المساعد تستخدم الإعداد المحفوظ نفسه.
      </span>
    </div>
  );
}

type Change = { increase: number; decrease: number; net: number };
type Metrics = {
  days: number;
  drafts: number;
  imported: number;
  ordered: number;
  completed: number;
  orderRate: number | null;
  lines: {
    total: number; changedBeforeDraft: number; ordered: number; changedInForm: number;
    removed: number; notSentYet: number; added: number; packSizeMismatch: number;
  };
  units: { suggested: number; sent: number; pageChange: Change; rounding: number; formChange: Change; final: Change };
  medianMinutesToFirstOrder: number | null;
};

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const changeText = (c: Change) => `${signed(c.net)} (زيادة ${c.increase}، نقص ${c.decrease})`;

/** OPEN-14: how drafts from this page and the assistant turned into sent orders. */
export function DraftMetricsBlock({ branchId, enabled }: { branchId: string; enabled: boolean }) {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    if (!enabled || !branchId) return;
    let live = true;
    fetch(`/api/purchases/drafts/metrics?days=30&branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setM(d))
      .catch(() => live && setM(null));
    return () => {
      live = false;
    };
  }, [branchId, enabled]);
  if (!enabled || !m) return null;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <details className="rounded-lg border bg-card px-4 py-2 text-xs" data-testid="draft-metrics">
      <summary className="cursor-pointer font-semibold">
        مسودات الشراء آخر {m.days} يوماً: {m.drafts} مسودة، أُرسل منها طلب لـ {m.ordered} ({pct(m.orderRate)})
      </summary>
      {m.drafts === 0 ? (
        <p className="mt-2 text-muted-foreground">لا توجد مسودات بعد في هذه الفترة.</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pr-5 text-muted-foreground">
          <li>فُتحت في صفحة الطلب: {m.imported}</li>
          <li>أصناف المسودات: {m.lines.total}؛ عُدّل منها قبل المسودة: {m.lines.changedBeforeDraft}</li>
          <li>
            في المسودات التي أُرسل منها طلب: أُرسل {m.lines.ordered} صنفاً، عُدّلت كمية {m.lines.changedInForm}، أُضيف {m.lines.added}،
            لم يُرسل بعد {m.lines.notSentYet} (المسودة ما زالت مفتوحة)، حُذف {m.lines.removed} (بعد إغلاق المسودة)
          </li>
          <li data-testid="draft-units">
            بالوحدات للأصناف المرسلة: المقترح {m.units.suggested}، المرسل {m.units.sent}؛ الفرق {changeText(m.units.final)} =
            تعديل قبل المسودة {changeText(m.units.pageChange)} + تقريب العبوات +{m.units.rounding} + تعديل في صفحة الطلب {changeText(m.units.formChange)}
            {m.lines.packSizeMismatch > 0 ? `؛ ${m.lines.packSizeMismatch} صنف بحجم عبوة مختلف خارج هذه الأرقام` : ""}
          </li>
          <li>
            أُغلقت {m.completed} مسودة؛ الوقت حتى أول طلب (الوسيط):{" "}
            {m.medianMinutesToFirstOrder === null ? "—" : `${Math.round(m.medianMinutesToFirstOrder)} دقيقة`}
          </li>
          <li>إنشاء الطلب في النظام يرسله للمذخر، فالطلب المُنشأ طلب مُرسل.</li>
        </ul>
      )}
    </details>
  );
}
