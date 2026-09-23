import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
export function useSyncHealth() {
  const [health, setHealth] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const r = await window.ipcRenderer.invoke("staff:sync-health");
        if (live) {
          setHealth(r);
          setError("");
        }
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "تعذر قراءة حالة المزامنة");
      } finally {
        pending = false;
      }
    };
    const events = [
      "sync-health-updated",
      "staff-sync-updated",
      "sync-failure-recorded",
    ];
    events.forEach((e) => window.ipcRenderer.on(e, refresh));
    window.addEventListener("staff-sync-refresh", refresh);
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      live = false;
      clearInterval(timer);
      events.forEach((e) => window.ipcRenderer.off(e, refresh));
      window.removeEventListener("staff-sync-refresh", refresh);
    };
  }, []);
  return { health, error };
}
export function refreshSyncViews() {
  window.dispatchEvent(new Event("staff-sync-refresh"));
}
export default function SyncOverview({
  onDetails,
}: {
  onDetails?: () => void;
}) {
  const { health, error: readError } = useSyncHealth();
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function retry() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await window.ipcRenderer.invoke("trigger-sync");
      if (!r?.success) throw Error(r?.error || "تعذرت المزامنة");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذرت المزامنة");
    } finally {
      lock.current = false;
      setBusy(false);
      refreshSyncViews();
    }
  }
  const failed = Number(health?.failedCount || 0),
    pending = Number(health?.pendingCount || 0),
    working = busy || health?.inProgress;
  const title = readError
    ? "تعذر التحقق من المزامنة"
    : !health
      ? "جارٍ قراءة الحالة…"
      : working
        ? "جارٍ المزامنة"
        : failed
          ? `${failed} عملية تحتاج مراجعة`
          : pending
            ? `${pending} عملية بانتظار الإرسال`
            : "جميع العمليات مُرسلة";
  const counters = [
    ["مبيعات", health?.salesPending],
    ["مرتجعات", health?.returnsPending],
    ["تحصيل", health?.debtsPending],
    ["مخزون", health?.inventoryPending],
  ].filter(([, n]) => Number(n) > 0);
  return (
    <section
      dir="rtl"
      className="rounded-lg border border-border bg-card text-foreground p-4 space-y-3"
    >
      <div className="flex gap-3 items-center">
        {failed || readError ? (
          <AlertTriangle className="text-amber-600 shrink-0" size={22} />
        ) : working || !health ? (
          <RefreshCw className="animate-spin text-primary shrink-0" size={22} />
        ) : (
          <CheckCircle2 className="text-emerald-600 shrink-0" size={22} />
        )}
        <strong className="text-sm">{title}</strong>
      </div>
      {pending > 0 && (
        <p className="text-sm text-muted-foreground">
          {counters.map(([label, n]) => `${label}: ${n}`).join(" · ")}
        </p>
      )}
      {failed > 0 && (
        <p className="text-sm text-muted-foreground">
          راجع سبب التعثر أدناه أو اطلب من المسؤول مراجعته، ولا تُعد تسجيل
          العملية.
        </p>
      )}
      {!onDetails && health?.retryableIssues?.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-primary">
            تفاصيل عمليات المخزون المتعثرة ({health.retryableIssues.length})
          </summary>
          <ul className="space-y-2 mt-2">
            {health.retryableIssues.map((item: any) => (
              <li key={item.id} className="rounded-md border border-border p-2">
                {(
                  {
                    "create-drug": "إضافة دواء",
                    "add-inventory": "إضافة مخزون",
                    "delete-inventory": "حذف مخزون",
                    "add-batch": "إضافة دفعة",
                    "update-inventory": "تحديث مخزون",
                  } as Record<string, string>
                )[item.type] || "مخزون"}
                : {item.error}
              </li>
            ))}
          </ul>
        </details>
      )}
      {health?.lastSuccess?.at && (
        <p className="text-xs text-muted-foreground">
          آخر مزامنة ناجحة:{" "}
          {new Date(health.lastSuccess.at).toLocaleString("ar-IQ-u-nu-latn")} ·{" "}
          {health.lastSuccess.kind}
        </p>
      )}
      {(error || readError) && (
        <p role="alert" className="text-destructive text-sm">
          {error || readError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={working || !health}
          onClick={() => void retry()}
          className="rounded-lg border border-border px-3 py-2 text-sm inline-flex gap-2 items-center disabled:opacity-40"
        >
          <RefreshCw size={15} />
          {working ? "جارٍ المزامنة…" : "مزامنة الآن"}
        </button>
        {onDetails ? (
          <button
            onClick={onDetails}
            className="rounded-lg px-3 py-2 text-sm text-primary"
          >
            عرض التفاصيل ←
          </button>
        ) : health?.oldestPendingAt && pending > 0 ? (
          <button
            className="text-sm text-primary"
            onClick={() => setExpanded(!expanded)}
          >
            تفاصيل الانتظار
          </button>
        ) : null}
      </div>
      {expanded && pending > 0 && health?.oldestPendingAt && (
        <p className="text-xs text-muted-foreground">
          أقدم عملية مخزون معلقة:{" "}
          {new Date(health.oldestPendingAt).toLocaleString("ar-IQ-u-nu-latn")}
        </p>
      )}
    </section>
  );
}
