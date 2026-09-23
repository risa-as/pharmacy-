import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { showConfirm } from "../lib/dialog";

const box = "rounded-lg border border-border bg-card p-4";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-muted";
const input =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const num = (v: number) => Number(v || 0).toLocaleString("en-US");
const labels: Record<string, string> = {
  PENDING: "مسودة",
  REVIEW: "بانتظار اعتماد المدير",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
  RECEIVED: "مستلم",
};
const parseReason = (reason: string = "") => ({
  reasonCode: reason.startsWith("تصنيف الجرد: تلف مؤكد\n")
    ? "DAMAGE"
    : "UNKNOWN",
  reason: reason.replace(/^تصنيف الجرد: [^\n]*\n/, ""),
});

export default function CloudOperationsPage({
  mode, initialId,
}: {
  mode: "stocktake" | "receipts";
  initialId?: string;
}) {
  const counting = mode === "stocktake";
  const [access, setAccess] = useState<any>(null),
    [rows, setRows] = useState<any[]>([]),
    [detail, setDetail] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [batches, setBatches] = useState<any[]>([]),
    [picker, setPicker] = useState(false),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState<Record<string, any>>({});
  const lock = useRef(false),
    live = useRef(true);
  const api = async (path: string, method = "GET", body?: any) => {
    const res = await window.ipcRenderer.invoke("operations:request", {
      path,
      method,
      body,
    });
    if (!res?.success) throw Error(res?.error || "تعذر الاتصال بالخادم");
    if (res.warning && live.current) setNotice(res.warning);
    return res.data;
  };
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  };
  const load = async () => {
    const result = await api(counting ? "/inventory/stocktake" : "/purchases");
    if (live.current)
      setRows(
        counting
          ? result.stocktakes
          : result.filter((r: any) => r.warehouseOrderId),
      );
  };
  useEffect(() => {
    live.current = true;
    void run(async () => {
      const result = await window.ipcRenderer.invoke("operations:access");
      if (!result?.success)
        throw Error(result?.error || "يلزم الاتصال بالخادم");
      if (!live.current) return;
      setAccess(result);
      if (
        counting
          ? !result.permissions.canDoStocktake
          : !result.permissions.canViewSuppliers ||
            !result.features.warehouseManagement
      )
        throw Error("هذه الوظيفة غير متاحة ضمن صلاحيات الحساب أو الاشتراك");
      await load();
      if(initialId && live.current) await open(initialId);
    });
    return () => {
      live.current = false;
    };
  }, []);
  const open = async (id: string) => {
    const data = await api(
      counting ? `/inventory/stocktake/${id}` : `/purchases/${id}`,
    );
    const doc = counting ? data.stocktake : data;
    if (!live.current) return;
    setDetail(doc);
    setPicker(false);
    if (counting)
      setLines(
        doc.items.map((i: any) => ({
          ...i,
          actual: String(i.actualQuantity),
          ...parseReason(i.reason || ""),
        })),
      );
    else
      setLines(
        doc.items.map((i: any) => ({
          itemId: i.id,
          key: crypto.randomUUID(),
          drugName: i.drugName,
          quantity: String(i.quantity),
          orderedQuantity: i.quantity,
          cost: String(i.cost),
          approvedFree: i.cost === 0 && !!doc.warehouseOrderId,
          batchNumber:
            i.shippedPrefill?.kind === "SINGLE"
              ? i.shippedPrefill.batchNumber
              : i.batchNumber || "",
          expiryDate: String(
            i.shippedPrefill?.kind === "SINGLE"
              ? i.shippedPrefill.expiryDate
              : i.expiryDate || "",
          ).slice(0, 10),
          suggestions: i.shippedPrefill?.batches || [],
        })),
      );
  };
  const searchBatches = async (next = 1) => {
    const data = await api(
      `/inventory/operation-batches?search=${encodeURIComponent(search)}&page=${next}`,
    );
    setBatches(data.items);
    setMore(data.hasMore);
    setPage(next);
  };
  const saveCount = async (complete: boolean) => {
    if (
      !lines.length ||
      lines.some(
        (l) =>
          !l.actual.trim() ||
          !Number.isSafeInteger(Number(l.actual)) ||
          Number(l.actual) < 0,
      )
    )
      throw Error("أدخل العدد الفعلي الصحيح لكل دفعة");
    if (
      complete &&
      !(await showConfirm({
        title: "إنهاء العد",
        message:
          "العجز يُرسل إلى المدير قبل تعديل المخزون. دون عجز تُعتمد الكميات مباشرة.",
        actionLabel: "إرسال النتيجة",
      }))
    )
      return;
    const result = await api(`/inventory/stocktake/${detail.id}`, "PUT", {
      status: complete ? "COMPLETED" : "PENDING",
      items: lines.map((l) => ({
        batchId: l.batchId,
        systemQuantity: l.systemQuantity,
        actualQuantity: Number(l.actual),
        reasonCode:
          Number(l.actual) < l.systemQuantity ? l.reasonCode : "UNKNOWN",
        reason: l.reason,
      })),
    });
    setDetail(result.stocktake);
    await open(detail.id);
    await load();
  };
  const receive = async () => {
    if (
      lines.some(
        (l) =>
          !l.quantity.trim() ||
          !Number.isSafeInteger(Number(l.quantity)) ||
          Number(l.quantity) <= 0 ||
          !l.batchNumber.trim() ||
          !/^\d{4}-\d{2}-\d{2}$/.test(l.expiryDate) ||
          !l.cost.trim() ||
          !Number.isFinite(Number(l.cost)) ||
          Number(l.cost) < 0 ||
          (!l.approvedFree && Number(l.cost) === 0),
      )
    )
      throw Error(
        "راجع الكمية والتكلفة ورقم الدفعة والصلاحية لكل بند. الصفر مسموح فقط للبونص المعتمد.",
      );
    if (
      !(await showConfirm({
        title: "تأكيد الاستلام",
        message:
          "تحقق من الدفعات الموجودة فعلياً وتواريخها. سيُضاف المخزون ويُحدّث حساب المورد؛ لن يُسجّل دفع نقدي من هذه الشاشة.",
        actionLabel: "استلام المواد",
      }))
    )
      return;
    await api(`/purchases/${detail.id}/receive`, "POST", {
      isPaid: false,
      items: lines.map((l) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        cost: Number(l.cost),
        batchNumber: l.batchNumber.trim(),
        expiryDate: l.expiryDate,
      })),
    });
    await open(detail.id);
    await load();
  };
  const editable = counting
    ? detail?.status === "PENDING"
    : detail?.status === "PENDING" &&
      access?.permissions.canReceivePurchase &&
      ["SHIPPED", "DELIVERED"].includes(detail.warehouseOrderStatus);
  const change = (index: number, patch: any) =>
    setLines((previous) =>
      previous.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  const selectedDrug = Object.values(selected)[0]?.inventory.drugId;
  return (
    <div
      dir="rtl"
      className="p-6 space-y-4 h-full overflow-y-auto text-foreground"
    >
      <header className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {counting ? <ClipboardList /> : <PackageCheck />}
            {counting ? "جرد المخزون" : "استلام مشتريات المذاخر"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {access?.branchName || "فرع الجهاز"} · يتطلب الاتصال ومزامنة المخزون
          </p>
        </div>
        <button
          className={button}
          disabled={busy}
          onClick={() => void run(load)}
        >
          <RefreshCw size={16} />
          تحديث
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3"
        >
          {error}
          <p className="text-sm mt-1">
            عند انقطاع الاتصال بعد التأكيد، حدّث السجل للتأكد من حالة العملية
            قبل إعادة الإرسال.
          </p>
        </div>
      )}
      {notice && (
        <div role="status" className={box}>
          {notice}
        </div>
      )}
      {busy && (
        <p role="status" className="text-primary">
          جارٍ التحقق والمزامنة…
        </p>
      )}
      {access && (
        <>
          {!detail ? (
            <>
              <div className="flex gap-2 items-center">
                <select
                  className={input + " max-w-xs"}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="">جميع الحالات</option>
                  {(counting
                    ? ["PENDING", "REVIEW", "COMPLETED"]
                    : ["PENDING", "COMPLETED", "CANCELLED"]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
                {counting && access.permissions.canDoStocktake && (
                  <button
                    className={button + " bg-primary text-primary-foreground"}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const d = await api("/inventory/stocktake", "POST", {});
                        await open(d.stocktake.id);
                      })
                    }
                  >
                    <Plus size={16} />
                    بدء جرد
                  </button>
                )}
              </div>
              <div className="grid gap-3">
                {rows
                  .filter((r) => !filter || r.status === filter)
                  .map((r) => (
                    <button
                      key={r.id}
                      disabled={busy}
                      className={
                        box +
                        " text-right hover:border-primary flex items-center justify-between gap-3"
                      }
                      onClick={() => void run(() => open(r.id))}
                    >
                      <div>
                        <b className="font-mono" dir="ltr">
                          {r.documentNumber || r.invoiceNumber || "—"}
                        </b>
                        <p className="text-sm text-muted-foreground mt-1">
                          {counting ? r.user?.name : r.supplier?.name} ·{" "}
                          {new Date(r.createdAt).toLocaleDateString(
                            "ar-IQ-u-nu-latn",
                          )}
                        </p>
                      </div>
                      <div>
                        {labels[r.status] || r.status}
                        {!counting && (
                          <p className="font-bold mt-1">{num(r.total)} د.ع</p>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
              {!busy &&
                !rows.filter((r) => !filter || r.status === filter).length && (
                  <div
                    className={box + " text-center py-14 text-muted-foreground"}
                  >
                    لا توجد سجلات بهذه الحالة
                  </div>
                )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button
                  className={button}
                  disabled={busy}
                  onClick={async () => {
                    if (
                      editable &&
                      !(await showConfirm({
                        title: "العودة للقائمة",
                        message:
                          "قد توجد تغييرات لم تُحفظ. هل تريد مغادرة التفاصيل؟",
                        actionLabel: "عودة",
                      }))
                    )
                      return;
                    setDetail(null);
                    setPicker(false);
                  }}
                >
                  <ArrowRight size={16} />
                  القائمة
                </button>
                <span className="font-mono text-primary">
                  {detail.documentNumber} ·{" "}
                  {labels[detail.status] || detail.status}
                </span>
              </div>
              {!counting && detail.status === "COMPLETED" && (
                <section className={box}>
                  <h3 className="font-bold mb-2">
                    دفعات المخزون المرتبطة بالاستلام
                  </h3>
                  {detail.receivedBatches?.length ? (
                    detail.receivedBatches.map((b: any) => (
                      <p
                        key={b.id}
                        className="border-t border-border py-2 text-sm"
                      >
                        {
                          detail.items.find(
                            (item: any) => item.id === b.purchaseItemId,
                          )?.drugName
                        }{" "}
                        · {b.batchNumber} · الصلاحية{" "}
                        {String(b.expiryDate).slice(0, 10)} · الرصيد الحالي{" "}
                        {b.quantity}
                      </p>
                    ))
                  ) : (
                    <p>
                      لا توجد دفعات مرتبطة بهذا المستند القديم؛ راجع سجل
                      الاستلام.
                    </p>
                  )}
                </section>
              )}
              {!counting &&
                detail.status === "PENDING" &&
                !["SHIPPED", "DELIVERED"].includes(
                  detail.warehouseOrderStatus,
                ) && (
                  <p className={box}>
                    الطلب {detail.warehouseOrderNumber || ""} لم يخرج للتسليم
                    بعد، أو تعذّر تأكيد حالته. يصبح الاستلام متاحًا بعد الشحن.
                  </p>
                )}
              {counting && detail.notes && <p className={box}>ملاحظات الجرد: {detail.notes}</p>}
              {counting && detail.status === "REVIEW" && (
                <div className={box}>
                  <p>بانتظار اعتماد المدير؛ لم تتغير الكميات بعد.</p>
                  <p className="text-sm text-muted-foreground mt-2">يراجع المدير النتيجة من لوحة الويب. إذا طُلبت إعادة العد، افتح المسودة مجدداً.</p>
                </div>
              )}
              {counting && editable && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    setPicker(true);
                    setSelected({});
                  }}
                >
                  <Plus size={16} />
                  إضافة دفعات بالبحث أو قارئ الباركود
                </button>
              )}
              {picker && (
                <section className={box + " space-y-3"}>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSelected({});
                      void run(() => searchBatches(1));
                    }}
                  >
                    <input
                      className={input}
                      aria-label="البحث بالاسم أو الباركود"
                      placeholder="اسم الدواء أو امسح بقارئ الباركود ثم Enter"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className={button} disabled={busy}>
                      <Search size={16} />
                      بحث
                    </button>
                  </form>
                  <div className="max-h-64 overflow-auto space-y-2">
                    {batches.map((b) => (
                      <label
                        key={b.id}
                        className="flex gap-3 border-b border-border p-2 items-center"
                      >
                        <input
                          type="checkbox"
                          disabled={
                            busy ||
                            lines.some((l) => l.batchId === b.id) ||
                            !!(
                              selectedDrug &&
                              selectedDrug !== b.inventory.drugId
                            )
                          }
                          checked={
                            !!selected[b.id] ||
                            lines.some((l) => l.batchId === b.id)
                          }
                          onChange={(e) =>
                            setSelected((old) => {
                              const next = { ...old };
                              if (e.target.checked) next[b.id] = b;
                              else delete next[b.id];
                              return next;
                            })
                          }
                        />
                        <span>
                          <b>{b.inventory.drug.tradeName}</b>
                          <small className="block text-muted-foreground">
                            {b.batchNumber} · الصلاحية{" "}
                            {String(b.expiryDate).slice(0, 10)} · الرصيد{" "}
                            {b.quantity}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={button}
                      disabled={busy || !Object.keys(selected).length}
                      onClick={() => {
                        setLines((old) => [
                          ...Object.values(selected)
                            .filter((b) => !old.some((l) => l.batchId === b.id))
                            .map((b) => ({
                              batchId: b.id,
                              batch: b,
                              systemQuantity: b.quantity,
                              actual: "",
                              reason: "",
                              reasonCode: "UNKNOWN",
                            })),
                          ...old,
                        ]);
                        setPicker(false);
                        setSelected({});
                      }}
                    >
                      إضافة المحدد ({Object.keys(selected).length})
                    </button>
                    <button
                      className={button}
                      disabled={busy || page === 1}
                      onClick={() => void run(() => searchBatches(page - 1))}
                    >
                      السابق
                    </button>
                    <button
                      className={button}
                      disabled={busy || !more}
                      onClick={() => void run(() => searchBatches(page + 1))}
                    >
                      التالي
                    </button>
                    <button className={button} onClick={() => setPicker(false)}>
                      إغلاق
                    </button>
                  </div>
                </section>
              )}
              <div className="space-y-3">
                {lines.map((l, index) => (
                  <section key={counting ? l.batchId : l.key} className={box}>
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h3 className="font-bold">
                          {counting
                            ? l.batch.inventory.drug.tradeName
                            : l.drugName}
                        </h3>
                        {counting && (
                          <p className="text-sm text-muted-foreground mt-1">
                            الدفعة {l.batch.batchNumber} · الصلاحية{" "}
                            {String(l.batch.expiryDate).slice(0, 10)} · المسجل{" "}
                            {l.systemQuantity}
                          </p>
                        )}
                      </div>
                      {editable && counting && (
                        <button
                          aria-label="إزالة الدفعة"
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            setLines((old) => old.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    {counting ? (
                      <div className="grid md:grid-cols-3 gap-3 mt-3">
                        <label>
                          العدد الفعلي
                          <input
                            className={input}
                            type="number"
                            min="0"
                            step="1"
                            value={l.actual}
                            disabled={!editable || busy}
                            onChange={(e) =>
                              change(index, { actual: e.target.value })
                            }
                          />
                        </label>
                        <div>
                          <p>
                            الفرق:{" "}
                            {l.actual === ""
                              ? "—"
                              : Number(l.actual) - l.systemQuantity}
                          </p>
                          {l.actual !== "" &&
                            Number(l.actual) < l.systemQuantity && (
                              <label className="flex gap-2 items-center mt-3">
                                <input
                                  type="checkbox"
                                  checked={l.reasonCode === "DAMAGE"}
                                  disabled={!editable || busy}
                                  onChange={(e) =>
                                    change(index, {
                                      reasonCode: e.target.checked
                                        ? "DAMAGE"
                                        : "UNKNOWN",
                                    })
                                  }
                                />
                                تلف مؤكد
                              </label>
                            )}
                        </div>
                        <label>
                          ملاحظة اختيارية
                          <input
                            className={input}
                            value={l.reason}
                            maxLength={2000}
                            disabled={!editable || busy}
                            onChange={(e) =>
                              change(index, { reason: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mt-2">
                          الكمية المعتمدة لهذا البند: {l.orderedQuantity} ·
                          الاستلام يتطلب كامل الكمية؛ يمكن توزيعها على عدة
                          دفعات.
                        </p>
                        <div className="grid md:grid-cols-4 gap-3 mt-3">
                          {[
                            ["quantity", "الكمية المستلمة", "number"],
                            ["cost", "تكلفة الوحدة", "number"],
                            ["batchNumber", "رقم الدفعة الحقيقي", "text"],
                            ["expiryDate", "تاريخ الصلاحية", "date"],
                          ].map(([key, label, type]) => (
                            <label key={key} className="text-sm">
                              {label}
                              <input
                                className={input}
                                type={type}
                                min={
                                  key === "quantity"
                                    ? 1
                                    : key === "cost"
                                      ? 0
                                      : undefined
                                }
                                step={key === "quantity" ? 1 : "any"}
                                value={l[key]}
                                disabled={!editable || busy}
                                onChange={(e) =>
                                  change(index, { [key]: e.target.value })
                                }
                              />
                            </label>
                          ))}
                        </div>
                        {editable && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className={button}
                              disabled={busy}
                              onClick={() =>
                                setLines((old) => [
                                  ...old.slice(0, index + 1),
                                  {
                                    ...l,
                                    key: crypto.randomUUID(),
                                    quantity: "",
                                    batchNumber: "",
                                    expiryDate: "",
                                  },
                                  ...old.slice(index + 1),
                                ])
                              }
                            >
                              تقسيم على دفعة أخرى
                            </button>
                            {lines.filter((row) => row.itemId === l.itemId)
                              .length > 1 && (
                              <button
                                className={button}
                                disabled={busy}
                                onClick={() =>
                                  setLines((old) =>
                                    old.filter((_, i) => i !== index),
                                  )
                                }
                              >
                                حذف هذا التقسيم
                              </button>
                            )}
                            {l.suggestions.map((s: any, i: number) => (
                              <button
                                key={i}
                                className={button}
                                disabled={busy}
                                onClick={() =>
                                  change(index, {
                                    batchNumber: s.batchNumber,
                                    expiryDate: String(s.expiryDate).slice(
                                      0,
                                      10,
                                    ),
                                  })
                                }
                              >
                                استخدام {s.batchNumber} · {s.quantity} وحدة
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                ))}
              </div>
              {editable && (
                <div className="flex gap-2 sticky bottom-0 p-3 bg-card border border-border rounded-lg">
                  {counting ? (
                    <>
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => void run(() => saveCount(false))}
                      >
                        حفظ المسودة
                      </button>
                      <button
                        className={
                          button + " bg-primary text-primary-foreground"
                        }
                        disabled={busy}
                        onClick={() => void run(() => saveCount(true))}
                      >
                        إنهاء العد وإرسال النتيجة
                      </button>
                    </>
                  ) : (
                    <button
                      className={button + " bg-primary text-primary-foreground"}
                      disabled={busy}
                      onClick={() => void run(receive)}
                    >
                      مراجعة وتأكيد استلام المواد
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
