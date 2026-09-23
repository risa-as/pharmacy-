import {
  Calculator,
  TrendingUp,
  Package,
  Truck,
  ShieldCheck,
  AlertTriangle,
  Clock3,
  Info,
} from "lucide-react";
import type { planRow, PlanningOptions } from "@/app/lib/smart-purchasing";
const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
export default function SuggestionDetails({
  row: r,
  options,
  quantity,
  actualQuantity,
}: {
  row: ReturnType<typeof planRow>;
  options: PlanningOptions;
  quantity: number;
  actualQuantity: number;
}) {
  const review = r.noDemand;
  const title = review
    ? "يحتاج قرارك قبل الشراء"
    : r.suggestedQty > 0
      ? "احتياج محسوب من حركة البيع"
      : r.urgentUnits > 0
        ? "عالج النقص قبل وصول الطلب"
        : "لا يلزم طلب عادي إضافي ضمن الإعدادات الحالية";
  const explanation = review
    ? "لا توجد حركة بيع كافية لتحديد كمية تلقائية. راجع توفر الدواء سابقاً وحاجتك الفعلية، أو استخدم استكمال الحد الأدنى."
    : "نحسب الاستهلاك المتوقع يومياً، ثم نراعي المخزون الصالح والوارد في موعده والصرف بالأقرب انتهاءً.";
  return (
    <section
      id={`suggestion-${r.inventoryId}`}
      aria-label={`تفاصيل اقتراح ${r.drugName}`}
      className="border-t border-border bg-muted/20 p-3 sm:p-5"
    >
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col items-stretch justify-between gap-3 border-b p-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${review ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}
            >
              <Calculator size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="mt-1 max-w-2xl text-xs leading-6 text-muted-foreground">
                {explanation}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-center">
            <span className="block text-xs text-muted-foreground">
              اقتراح النظام · وحدة مخزون
            </span>
            <strong className="mt-1 block text-2xl tabular-nums text-primary">
              {fmt(r.suggestedQty)}
            </strong>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp size={15} />
              صافي مبيعات الفترة
            </p>
            <p className="mt-2 text-lg font-bold tabular-nums">
              {fmt(r.netSales)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                وحدة
              </span>
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              مبيعات {fmt(r.sold)} − مرتجعات مرتبطة {fmt(r.returned)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calculator size={15} />
              معدل البيع اليومي
            </p>
            <p className="mt-2 text-lg font-bold tabular-nums">
              {fmt(r.averageDailySales)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                وحدة / يوم
              </span>
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {r.observedDays > 0
                ? `${fmt(r.netSales)} وحدة ÷ ${r.observedDays} يوم رصد`
                : "لا توجد أيام رصد كافية للحساب"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Package size={15} />
              المتاح حالياً
            </p>
            <p className="mt-2 text-lg font-bold tabular-nums">
              {fmt(r.currentStock)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                وحدة
              </span>
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {r.coverage === null
                ? "التغطية غير قابلة للتقدير"
                : `تغطية تقريبية ${fmt(r.coverage)} يوم دون الوارد`}
            </p>
          </div>
        </div>
        <div className="grid gap-4 border-t px-4 py-3 text-xs sm:grid-cols-3">
          <div>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Clock3 size={15} />
              التغطية المطلوبة
            </p>
            <p className="mt-1.5 font-semibold">
              {options.coverageDays} يوم ·{" "}
              {options.fromArrival ? "بعد الوصول" : "من اليوم"}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Truck size={15} />
              وصول الطلب الجديد
            </p>
            <p className="mt-1.5 font-semibold">
              {options.leadDays === 0 ? "اليوم" : `بعد ${options.leadDays} يوم`}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck size={15} />
              الاحتياطي الإضافي
            </p>
            <p className="mt-1.5 font-semibold">
              {options.safetyDays === 0
                ? "غير مفعّل"
                : `${options.safetyDays} يوم · يعادل ${fmt(r.averageDailySales * options.safetyDays)} وحدة`}
            </p>
            {review && options.safetyDays > 0 && (
              <p className="mt-1 text-muted-foreground">
                لا يمكن تقديره دون معدل بيع موثوق.
              </p>
            )}
          </div>
        </div>
      </div>
      {(r.urgentUnits > 0 ||
        r.expiredUnits > 0 ||
        r.qualityReasons.length > 0) && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <h4 className="flex items-center gap-2 text-xs font-bold">
            <AlertTriangle size={16} className="shrink-0 text-warning" />
            ما يحتاج انتباهك
          </h4>
          <ul className="mt-2 space-y-1.5 pr-5 text-xs leading-6 list-disc">
            {r.urgentUnits > 0 && (
              <li>
                عجز متوقع قبل الوصول: <b>{fmt(r.urgentUnits)} وحدة</b>. يحتاج
                توريداً عاجلاً أو معالجة منفصلة؛ لا يضاف تلقائياً للطلب العادي.
              </li>
            )}
            {r.expiredUnits > 0 && (
              <li>
                متوقع انتهاء <b>{fmt(r.expiredUnits)} وحدة</b> قبل استخدامها ضمن
                المحاكاة دون طلب جديد.
              </li>
            )}
            {r.qualityReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {r.incoming.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border bg-card">
          <h4 className="flex items-center gap-2 border-b px-4 py-3 text-xs font-bold">
            <Truck size={16} className="text-primary" />
            الطلبات القادمة{" "}
            <span className="text-muted-foreground">({r.incoming.length})</span>
          </h4>
          <div className="divide-y">
            {r.incoming.map((l, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-all font-semibold" dir="auto">
                    {l.reference}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {l.date
                      ? `الوصول المتوقع: ${l.date}`
                      : "موعد الوصول غير محدد"}
                  </p>
                </div>
                <div className="text-left">
                  <b className="tabular-nums">
                    {l.quantity > 0
                      ? `${fmt(l.quantity)} وحدة`
                      : "الكمية تحتاج توثيقاً"}
                  </b>
                  <p
                    className={`mt-1 ${l.confirmed ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {l.confirmed
                      ? "يُراعى حسب موعده وصلاحيته"
                      : "لا يُخصم من الاحتياج"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4 text-xs">
        <div>
          <p className="font-semibold">
            اختيارك الحالي: {fmt(quantity)} وحدة{" "}
            {quantity !== r.suggestedQty && (
              <span className="mr-1 font-normal text-muted-foreground">
                (معدّل عن الاقتراح)
              </span>
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            {r.unitsPerPack
              ? `${fmt(Math.ceil(quantity / r.unitsPerPack))} باكيت × ${r.unitsPerPack} وحدة = ${fmt(actualQuantity)} وحدة بعد التقريب`
              : "يلزم تأكيد تعبئة الباكيت قبل تحويل الكمية إلى طلب."}
          </p>
        </div>
        <p className="flex max-w-lg items-start gap-2 leading-6 text-muted-foreground">
          <Info size={15} className="mt-1 shrink-0" />
          السعر تقدير من كلفة المخزون. تُراجع التعبئة والأسعار مع المورد قبل
          الإرسال.
        </p>
      </div>
    </section>
  );
}
