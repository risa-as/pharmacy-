import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Package,
  Search,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { showConfirm } from "../lib/dialog";
const btn =
  "rounded-lg border border-border px-3 py-2 text-sm inline-flex gap-2 items-center disabled:opacity-40 hover:bg-muted";
const field = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const card = "rounded-lg border border-border bg-card p-4";
const names: Record<string, string> = {
  SENT: "بانتظار المذخر",
  UNDER_REVIEW: "قيد المراجعة",
  QUOTED: "عرض جاهز",
  APPROVED: "معتمد",
  SHIPPED: "قيد التسليم",
  DELIVERED: "مُسلّم",
  IN_TRANSIT: "قيد النقل",
  COMPLETED: "مستلم",
  PENDING: "بانتظار قرار المذخر",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
  CANCELLED: "ملغى",
};
export default function StaffSupplyPage({
  mode,
  onReceive,
  initialId,
}: {
  initialId?: string;
  mode: "transfers" | "orders";
  onReceive: () => void;
}) {
  const transfers = mode === "transfers";
  const [access, setAccess] = useState<any>(null),
    [rows, setRows] = useState<any[]>([]),
    [detail, setDetail] = useState<any>(null),
    [returns, setReturns] = useState<any[]>([]),
    [draft, setDraft] = useState(false),
    [branches, setBranches] = useState<any[]>([]),
    [target, setTarget] = useState("");
  const [lines, setLines] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [batches, setBatches] = useState<any[]>([]),
    [notes, setNotes] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [batchPage, setBatchPage] = useState(1),
    [batchMore, setBatchMore] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    alive = useRef(true),
    attempt = useRef({ hash: "", key: "" });
  async function api(path: string, method = "GET", body?: any) {
    const r = await window.ipcRenderer.invoke("operations:request", {
      path,
      method,
      body,
    });
    if (!r.success) throw Error(r.error);
    if (r.warning) setNotice(r.warning);
    return r.data;
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function load(p = 1) {
    const r = await api(
      transfers
        ? `/inventory/transfers?page=${p}${filter ? "&type=" + filter : ""}`
        : `/warehouses/orders?page=${p}`,
    );
    if (!alive.current) return;
    setRows(transfers ? r.transfers : r.orders);
    setPage(p);
    setMore(!!r.hasMore);
    if (initialId && !detail && transfers) {
      const found = r.transfers.find((t: any) => t.id === initialId);
      if (found) setDetail(found);
    }
  }
  useEffect(() => {
    alive.current = true;
    void run(async () => {
      const a = await window.ipcRenderer.invoke("operations:access");
      if (!a.success) throw Error(a.error);
      if (!alive.current) return;
      setAccess(a);
      await load();
    });
    return () => {
      alive.current = false;
    };
  }, [filter]);
  async function open(row: any) {
    setLines([]);
    setNotes("");
    setDraft(false);
    setBatches([]);
    if (transfers) {
      setDetail(row);
      return;
    }
    const d = await api(`/warehouses/orders/${row.id}`);
    const r = await api(`/warehouses/orders/${row.id}/returns`);
    setDetail(d);
    setReturns(r.returns || []);
  }
  async function start() {
    const r = await api("/inventory/transfers?type=destinations");
    setBranches(r.branches);
    setTarget("");
    setLines([]);
    setNotes("");
    setBatches([]);
    setDetail(null);
    setDraft(true);
  }
  async function find(p = 1) {
    const r = await api(
      `/inventory/operation-batches?search=${encodeURIComponent(search)}&page=${p}`,
    );
    setBatches(r.items);
    setBatchPage(p);
    setBatchMore(r.hasMore);
  }
  function storageKey() {
    return `staff-attempt:${access.userId}:${access.branchId}:${mode}`;
  }
  function keyed(body: any) {
    const hash = JSON.stringify(body);
    let saved: any;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey()) || "null");
    } catch {}
    if (saved?.hash === hash && typeof saved.key === "string")
      attempt.current = saved;
    else if (attempt.current.hash !== hash)
      attempt.current = { hash, key: crypto.randomUUID() };
    localStorage.setItem(storageKey(), JSON.stringify(attempt.current));
    return { ...body, idempotencyKey: attempt.current.key };
  }
  async function send() {
    if (
      !lines.length ||
      lines.some(
        (l) =>
          !Number.isSafeInteger(Number(l.count)) ||
          Number(l.count) <= 0 ||
          Number(l.count) > l.max,
      )
    )
      throw Error("راجع الكميات المحددة؛ يجب أن تكون أعداداً صحيحة ضمن المتاح");
    if (transfers && !target) throw Error("اختر فرع الاستلام");
    if (
      !(await showConfirm({
        title: transfers ? "إرسال التحويل" : "إرسال طلب الإرجاع",
        message: transfers
          ? "تأكد من تجهيز الأصناف؛ ستُخصم الكميات من فرعك وتنتظر استلام الفرع الآخر."
          : "ستُحجز الكميات من المخزون المتاح للبيع حتى يراجع المذخر الطلب. افصلها فعلياً عن مخزون البيع.",
        actionLabel: "تأكيد الإرسال",
      }))
    )
      return;
    const body = transfers
      ? {
          toBranchId: target,
          notes,
          items: lines.map((l) => ({
            batchId: l.id,
            quantity: Number(l.count),
          })),
        }
      : {
          reason: notes,
          items: lines.map((l) => ({
            barcode: l.barcode,
            quantity: Number(l.count),
          })),
        };
    await api(
      transfers
        ? "/inventory/transfers"
        : `/warehouses/orders/${detail.order.id}/returns`,
      "POST",
      keyed(body),
    );
    localStorage.removeItem(storageKey());
    attempt.current = { hash: "", key: "" };
    setLines([]);
    setDraft(false);
    if (!transfers) await open(detail.order);
    await load(page);
  }
  function returnLines() {
    const order = detail.order;
    const used = returns
      .filter((r) => ["PENDING", "ACCEPTED"].includes(r.status))
      .flatMap((r) => r.items);
    setLines(
      order.items
        .filter((i: any) => i.status !== "OUT_OF_STOCK")
        .map((i: any) => ({
          id: i.id,
          name: i.drug.tradeName,
          barcode: i.drug.barcode,
          max: Math.max(
            0,
            (i.status === "PARTIAL" ? (i.quotedQuantity ?? 0) : i.quantity) -
              used
                .filter((r: any) => r.barcode === i.drug.barcode)
                .reduce((s: number, r: any) => s + r.quantity, 0),
          ),
          count: "",
        }))
        .filter((l: any) => l.max > 0),
    );
    setDraft(true);
  }
  async function receive(row: any) {
    if (
      !(await showConfirm({
        title: "استلام التحويل",
        message:
          "طابق جميع الأصناف والدفعات والكميات أدناه مع الشحنة. إذا وجدت اختلافاً، لا تؤكد الاستلام وتواصل مع الفرع المرسل.",
        actionLabel: "استلمت كامل الكمية",
      }))
    )
      return;
    await api(`/inventory/transfers/${row.id}/receive`, "PUT", {});
    setDetail(null);
    await load();
  }
  return (
    <div dir="rtl" className="p-6 space-y-4">
      <header className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex gap-2">
            {transfers ? <ArrowLeftRight /> : <Package />}
            {transfers ? "تحويلات الفروع" : "متابعة المذاخر والمرتجعات"}
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            {access?.branchName} · اتصال مباشر بالخادم ومزامنة المخزون قبل
            التنفيذ
          </p>
        </div>
        <button
          disabled={busy}
          className={btn}
          onClick={() => void run(() => load(page))}
        >
          <RefreshCw size={16} />
          تحديث
        </button>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-amber-600">
          {notice}
        </p>
      )}
      {busy && <p role="status">جارٍ تنفيذ العملية…</p>}
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
        {!detail && !draft && (
          <>
            <div className="flex gap-2">
              {transfers ? (
                <>
                  <select
                    className={field}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">الوارد والصادر</option>
                    <option value="incoming">الوارد</option>
                    <option value="outgoing">الصادر</option>
                  </select>
                  <button className={btn} onClick={() => void run(start)}>
                    <Plus size={16} />
                    تحويل جديد
                  </button>
                </>
              ) : (
                <button disabled={!access?.permissions.canReceivePurchase} className={btn} onClick={onReceive}>
                  فتح استلام المذاخر ←
                </button>
              )}
            </div>
            {rows.map((row) => (
              <button
                key={row.id}
                className={
                  card +
                  " w-full flex justify-between gap-3 text-right hover:border-primary"
                }
                onClick={() => void run(() => open(row))}
              >
                <span>
                  <strong dir="ltr">
                    {row.documentNumber ||
                      row.orderNumber ||
                      row.id.slice(0, 8)}
                  </strong>
                  <p className="text-sm mt-1">
                    {transfers
                      ? `${row.fromBranch?.name} ← ${row.toBranch?.name}`
                      : row.warehouse?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString("ar-IQ-u-nu-latn")}{" "}
                    · {row.items.length} أصناف
                  </p>
                </span>
                <span>
                  {names[row.status] || row.status}
                  <p className="text-primary text-sm mt-2">
                    التفاصيل والمتابعة ←
                  </p>
                </span>
              </button>
            ))}
            {!rows.length && (
              <div className="text-center py-20 text-muted-foreground">
                <Package className="mx-auto mb-3" />
                لا توجد طلبات في هذه القائمة
              </div>
            )}
            {
              <div className="flex gap-3">
                <button
                  className={btn}
                  disabled={page === 1}
                  onClick={() => void run(() => load(page - 1))}
                >
                  السابق
                </button>
                <span>صفحة {page}</span>
                <button
                  className={btn}
                  disabled={!more}
                  onClick={() => void run(() => load(page + 1))}
                >
                  التالي
                </button>
              </div>
            }
          </>
        )}
        {(detail || draft) && (
          <button
            className={btn}
            onClick={() =>
              void run(async () => {
                if (
                  draft &&
                  lines.length &&
                  !(await showConfirm({
                    title: "مغادرة المسودة",
                    message:
                      "ستفقد البيانات غير المرسلة. عند انقطاع الاتصال راجع السجل أولاً قبل إنشاء طلب جديد.",
                    actionLabel: "مغادرة",
                  }))
                )
                  return;
                setDetail(null);
                setDraft(false);
                setLines([]);
              })
            }
          >
            العودة للقائمة
          </button>
        )}
        {detail && !draft && (
          <section className={card}>
            <h2 className="font-bold mb-3">
              {transfers ? detail.documentNumber : detail.order.orderNumber} ·{" "}
              {names[transfers ? detail.status : detail.order.status]}
            </h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-right p-2">الدواء / الدفعة</th>
                    <th>الكمية</th>
                    <th>{transfers ? "الصلاحية" : "سعر الباكيت"}</th>
                  </tr>
                </thead>
                <tbody>
                  {(transfers ? detail.items : detail.order.items).map(
                    (i: any) => (
                      <tr key={i.id} className="border-t border-border">
                        <td className="p-3">
                          {i.drug?.tradeName}
                          <p
                            className="text-xs text-muted-foreground truncate max-w-64"
                            title={i.batchNumber || i.drug?.barcode}
                          >
                            {i.batchNumber || i.drug?.barcode}
                          </p>
                        </td>
                        <td className="text-center">
                          {transfers
                            ? i.quantity
                            : i.status === "PARTIAL"
                              ? (i.quotedQuantity ?? 0)
                              : i.quantity}
                        </td>
                        <td className="text-center">
                          {transfers
                            ? new Date(i.expiryDate).toLocaleDateString("en-GB")
                            : Number(
                                i.quotedPrice ??
                                  i.unitPrice ??
                                  i.requestedPrice ??
                                  0,
                              ).toLocaleString("en-US")}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {transfers ? (
              detail.status === "IN_TRANSIT" &&
              detail.toBranchId === access?.branchId && (
                <button
                  className={btn + " mt-4"}
                  onClick={() => void run(() => receive(detail))}
                >
                  مطابقة وتأكيد الاستلام
                </button>
              )
            ) : (
              <div className="mt-4 space-y-3">
                <button disabled={!access?.permissions.canReceivePurchase} className={btn} onClick={onReceive}>
                  الانتقال لاستلام المشتريات
                </button>
                {detail.purchase?.status === "COMPLETED" &&
                  ["SHIPPED", "DELIVERED"].includes(detail.order.status) &&
                  access?.permissions.canReturnWarehouseOrder &&
                  !returns.some((r) => r.status === "PENDING") && (
                    <button className={btn + " mr-2"} onClick={returnLines}>
                      طلب إرجاع
                    </button>
                  )}
                <h3 className="font-semibold">متابعة المرتجعات</h3>
                {returns.length ? (
                  returns.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-md border border-border p-3"
                    >
                      <strong>{names[r.status] || r.status}</strong>
                      <span className="mr-3 text-sm">
                        {new Date(r.createdAt).toLocaleDateString(
                          "ar-IQ-u-nu-latn",
                        )}
                      </span>
                      <p className="text-sm">
                        {r.items
                          .map(
                            (i: any) =>
                              `${detail.order.items.find((o: any) => o.drug?.barcode === i.barcode)?.drug?.tradeName || i.barcode}: ${i.quantity}`,
                          )
                          .join("، ")}
                      </p>
                      {r.reason && (
                        <p className="text-muted-foreground text-sm">
                          {r.reason}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    لا توجد مرتجعات لهذا الطلب.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  تسليم المرتجع فعلياً أو إعادة الكميات المرفوضة يتابعه المدير
                  من لوحة الويب.
                </p>
              </div>
            )}
          </section>
        )}
        {draft && (
          <section className={card + " space-y-4"}>
            <h2 className="font-bold">
              {transfers
                ? "تجهيز تحويل جديد"
                : "تحديد أصناف الإرجاع — الكميات بالباكيت"}
            </h2>
            {transfers && (
              <>
                <label className="block">
                  فرع الاستلام{" "}
                  <select
                    className={field + " mr-3"}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!branches.length && <p>لا يوجد فرع آخر متاح للتحويل.</p>}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(() => find());
                  }}
                >
                  <input
                    className={field + " flex-1"}
                    placeholder="اسم الدواء أو قراءة الباركود"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button className={btn}>
                    <Search size={16} />
                    بحث الدفعات
                  </button>
                </form>
                <div className="max-h-64 overflow-auto space-y-2">
                  {batches.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-3 border border-border rounded-md p-3"
                    >
                      <input
                        type="checkbox"
                        checked={lines.some((l) => l.id === b.id)}
                        disabled={
                          b.quantity <= 0 ||
                          new Date(b.expiryDate) <= new Date()
                        }
                        onChange={(e) =>
                          setLines(
                            e.target.checked
                              ? [
                                  {
                                    id: b.id,
                                    name: b.inventory.drug.tradeName,
                                    batch: b.batchNumber,
                                    max: b.quantity,
                                    count: "1",
                                  },
                                  ...lines,
                                ]
                              : lines.filter((l) => l.id !== b.id),
                          )
                        }
                      />
                      <span>
                        {b.inventory.drug.tradeName} · {b.batchNumber}
                        <small className="block text-muted-foreground">
                          المتاح {b.quantity} ·{" "}
                          {new Date(b.expiryDate).toLocaleDateString("en-GB")}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                {batches.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      className={btn}
                      disabled={batchPage === 1}
                      onClick={() => void run(() => find(batchPage - 1))}
                    >
                      السابق
                    </button>
                    <span>{batchPage}</span>
                    <button
                      className={btn}
                      disabled={!batchMore}
                      onClick={() => void run(() => find(batchPage + 1))}
                    >
                      التالي
                    </button>
                  </div>
                )}
              </>
            )}
            {lines.map((l) => (
              <div
                key={l.id}
                className="flex gap-3 items-center border-b border-border pb-3"
              >
                <div className="flex-1">
                  <strong>{l.name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {l.batch} · الحد الأعلى {l.max}
                  </p>
                </div>
                <input
                  aria-label={`كمية ${l.name}`}
                  type="number"
                  min="0"
                  max={l.max}
                  step="1"
                  className={field + " w-28"}
                  value={l.count}
                  onChange={(e) =>
                    setLines(
                      lines.map((x) =>
                        x.id === l.id ? { ...x, count: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  aria-label="إزالة الصنف"
                  className={btn}
                  onClick={() => setLines(lines.filter((x) => x.id !== l.id))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!transfers && (
              <p className="text-sm text-muted-foreground">
                احذف الأصناف التي لا تريد إرجاعها. يتحقق الخادم أيضاً من رصيد
                دفعات الاستلام الأصلية.
              </p>
            )}
            <textarea
              className={field + " w-full"}
              placeholder={
                transfers
                  ? "ملاحظات للفرع المستلم"
                  : "سبب الإرجاع / وصف التلف أو عدم المطابقة"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              className={btn}
              disabled={!lines.length}
              onClick={() => void run(send)}
            >
              مراجعة وإرسال
            </button>
          </section>
        )}
      </fieldset>
    </div>
  );
}
