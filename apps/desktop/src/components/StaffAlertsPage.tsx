import { useEffect, useRef, useState } from "react";
import { Bell, ArrowLeft, RefreshCw } from "lucide-react";
const btn =
  "rounded-lg border border-border px-3 py-2 text-sm inline-flex gap-2 items-center disabled:opacity-40";
export default function StaffAlertsPage({
  navigate,
}: {
  navigate: (page: any, id?: string) => void;
}) {
  const [alerts, setAlerts] = useState<any[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    live = useRef(true);
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const result: any[] = [];
    const failures: string[] = [];
    try {
      const access = await window.ipcRenderer.invoke("operations:access");
      if (!access.success) throw Error(access.error);
      async function source(
        title: string,
        path: string,
        build: (data: any) => void,
      ) {
        try {
          const r = await window.ipcRenderer.invoke("operations:request", {
            path,
          });
          if (!r.success) throw Error(r.error);
          build(r.data);
        } catch (e) {
          failures.push(
            title + ": " + (e instanceof Error ? e.message : "تعذر التحديث"),
          );
        }
      }
      if (
        access.branchCount > 1 &&
        access.permissions.canTransferStock &&
        access.features.interBranchTransfers
      )
        await source("التحويلات", "/inventory/transfers?type=incoming", (d) =>
          d.transfers
            .filter((r: any) => r.status === "IN_TRANSIT")
            .forEach((r: any) =>
              result.push({
                id: r.id,
                title: `تحويل ينتظر الاستلام: ${r.documentNumber}`,
                text: r.fromBranch?.name,
                page: "transfers",
              }),
            ),
        );
      if (access.permissions.canDoStocktake)
        await source("الجرد", "/inventory/stocktake", (d) =>
          (d.stocktakes || [])
            .filter((r: any) => r.status === "PENDING")
            .forEach((r: any) =>
              result.push({
                id: r.id,
                title: `مسودة جرد تحتاج متابعة: ${r.documentNumber}`,
                text: "افتح المسودة لإكمال العد ومراجعة ملاحظات المدير.",
                page: "stocktake",
              }),
            ),
        );
      if (
        access.permissions.canViewSuppliers &&
        access.features.warehouseManagement
      )
        await source("الاستلام", "/purchases", (d) =>
          (Array.isArray(d) ? d : d.purchases || [])
            .filter((r: any) => r.status === "PENDING" && r.warehouseOrderId)
            .forEach((r: any) =>
              result.push({
                id: r.id,
                title: `شراء لم يُستلم: ${r.documentNumber || r.invoiceNumber || ""}`,
                text: "راجع حالة الشحن والتفاصيل قبل الاستلام.",
                page: "receipts",
              }),
            ),
        );
      if (access.permissions.canViewInventory) {
        try {
          const r = await window.ipcRenderer.invoke("staff:stock-alerts");
          if (!r.success) throw Error(r.error);
          r.low?.forEach((i: any) =>
            result.push({
              id: i.id,
              title: i.name,
              text: `${i.available === 0 ? "نافد" : "أقل من الحد الأدنى"} · المتاح ${i.available} · الحد الأدنى ${i.minStock}`,
              page: "inventory",
              search: i.name,
            }),
          );
          r.batches.forEach((b: any) =>
            result.push({
              id: b.id,
              title: b.inventory.drug.tradeName,
              text: `${new Date(b.expiryDate) <= new Date() ? "دفعة منتهية" : "تنتهي خلال 90 يوماً"} · ${b.batchNumber} · ${new Date(b.expiryDate).toLocaleDateString("en-GB")} · المتبقي ${b.quantity}`,
              page: "inventory",
              search: b.inventory.drug.tradeName,
            }),
          );
        } catch (e) {
          failures.push(
            e instanceof Error ? e.message : "تعذر جلب تنبيهات الصلاحية",
          );
        }
      }
    } catch (e) {
      failures.push(e instanceof Error ? e.message : "تعذر تحميل التنبيهات");
    } finally {
      if (live.current) {
        setAlerts(result);
        setErrors(failures);
        setBusy(false);
      }
      lock.current = false;
    }
  }
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, []);
  return (
    <div dir="rtl" className="p-6 space-y-4">
      <header className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold flex gap-2">
            <Bell />
            تنبيهات العمل
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            مهام فرعك حسب صلاحياتك. تنبيهات الصلاحية من بيانات الجهاز (أقرب 100
            دفعة وأول 100 صنف ناقص).
          </p>
        </div>
        <button disabled={busy} className={btn} onClick={() => void load()}>
          <RefreshCw size={16} />
          تحديث
        </button>
      </header>
      {busy && <p role="status">جارٍ تحديث التنبيهات…</p>}
      {errors.map((e, i) => (
        <p key={i} role="alert" className="text-destructive">
          {e}
        </p>
      ))}
      {alerts.map((a) => (
        <button
          key={a.id}
          className="w-full rounded-lg border border-border bg-card p-4 flex justify-between items-center text-right hover:border-primary"
          onClick={() => navigate(a.page, a.search || a.id)}
        >
          <span>
            <strong>{a.title}</strong>
            <p className="text-sm text-muted-foreground mt-1">{a.text}</p>
          </span>
          <ArrowLeft size={18} />
        </button>
      ))}
      {!busy && !alerts.length && !errors.length && (
        <div className="py-20 text-center text-muted-foreground">
          <Bell className="mx-auto mb-3" />
          لا توجد مهام معلقة أو تنبيهات ضمن البيانات المعروضة.
        </div>
      )}
    </div>
  );
}
