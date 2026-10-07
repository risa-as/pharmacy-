"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import WhatsAppInbox from "./whatsapp-inbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  FileText,
  ListChecks,
  Users,
  RefreshCw,
  FilePlus2,
  Save,
  CopyPlus,
  Send,
  Eye,
  RotateCcw,
  PauseCircle,
  CheckCircle2,
  SearchCheck,
  Clock,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import {
  TableCard,
  TableTitle,
  DataTable,
  THead,
  Th,
  TBody,
  rowClass,
  cellClass,
  PrimaryCell,
  StatusPill,
  EmptyState,
  DateTimeCell,
} from "@/app/ui/data-table";
import {
  WaDialog,
  WaNotice,
  WaField,
  WaSectionHeading,
  WaStatus,
  WaLoading,
  fieldClass,
  selectClass,
} from "./whatsapp-design";
function BusyIcon({ busy, icon: Icon }: { busy: boolean; icon: LucideIcon }) {
  return busy ? (
    <Loader2
      aria-hidden="true"
      className="ml-2 h-4 w-4 shrink-0 animate-spin"
    />
  ) : (
    <Icon aria-hidden="true" className="ml-2 h-4 w-4 shrink-0" />
  );
}

import {
  CampaignAttempt,
  readAttempt,
  saveAttempt,
  finishAttempt,
} from "./pending-campaign";
import { baghdadSchedule, formatSchedule } from "@/app/lib/whatsapp/schedule";
export async function waRequest(body?: unknown, query = "") {
  const response = await fetch(
    "/api/whatsapp" + query,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "تعذر إكمال الطلب");
  return data;
}
type Selection = {
  mode: "ids" | "filtered";
  ids: string[];
  excludedIds: string[];
  search: string;
  branchId?: string;
};
type Template = {
  id: string;
  name: string;
  body: string;
  status: string;
  language: string;
  category: string;
};
export function CampaignComposer({
  selection,
  organizationId,
  userId,
  close,
}: {
  selection: Selection;
  organizationId: string;
  userId: string;
  close: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]),
    [templateId, setTemplateId] = useState(""),
    [custom1, setCustom1] = useState(""),
    [custom2, setCustom2] = useState(""),
    [name, setName] = useState("رسائل العملاء"),
    [timing, setTiming] = useState("now"),
    [schedule, setSchedule] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<CampaignAttempt | null>(null),
    [finished, setFinished] = useState(""),
    [sendEnabled, setSendEnabled] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    let live = true;
    waRequest()
      .then((d) => {
        if (live) {
          setTemplates(
            d.templates.filter((t: Template) => t.status === "APPROVED"),
          );
          setSendEnabled(d.sendEnabled);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    try {
      setPending(readAttempt(localStorage, organizationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر قراءة المحاولة السابقة");
    }
    return () => {
      live = false;
    };
  }, [organizationId]);
  const payload = { templateId, selection, values: { custom1, custom2 } };
  const scheduledPayload = () => ({
    ...payload,
    scheduledAt: timing === "later" ? baghdadSchedule(schedule) : null,
  });
  const check = async () => {
    try {
      setBusy(true);
      setError("");
      setPreview(await waRequest({ action: "preview", ...scheduledPayload() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذرت المعاينة");
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const prior = readAttempt(localStorage, organizationId);
      const attempt = prior ?? {
        id: crypto.randomUUID(),
        owner: userId,
        payload: {
          action: "create",
          ...scheduledPayload(),
          name,
          hash: preview?.hash,
        },
      };
      if (attempt.owner !== userId)
        throw Error(
          "هناك محاولة غير محسومة لحساب آخر؛ استكملها من الحساب الذي أنشأها.",
        );
      saveAttempt(localStorage, organizationId, attempt);
      setPending(attempt);
      const result = await waRequest({ ...attempt.payload, id: attempt.id });
      setFinished(result.id);
      setPending(null);
      try {
        finishAttempt(localStorage, organizationId, attempt.id);
      } catch {
        setError(
          "حُفظ طلب الإرسال؛ تعذر تنظيف مفتاحه المحلي. استكماله لاحقًا يعيد الطلب نفسه.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ طلب الإرسال");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const resolve = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const attempt = readAttempt(localStorage, organizationId);
      if (!attempt || attempt.owner !== userId)
        throw Error("استكمل المحاولة من الحساب الذي أنشأها.");
      const result = await waRequest({ action: "resolve", id: attempt.id });
      if (result.state === "RECORDED") setFinished(result.id);
      else if (result.state !== "CANCELLED")
        throw Error("تعذر حسم النتيجة؛ أبقِ المحاولة محفوظة.");
      finishAttempt(localStorage, organizationId, attempt.id);
      setPending(null);
      setPreview(null);
      if (result.state === "CANCELLED")
        setError(
          "أُغلقت المحاولة قبل حفظ الإرسال. أعد المعاينة لإنشاء طلب جديد.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حسم النتيجة");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const selectedTemplate = templates.find((t) => t.id === templateId);
  return (
    <WaDialog
      title="مراسلة العملاء عبر WhatsApp"
      label="مراسلة العملاء"
      description="اختر الرسالة والمستلمين، وأرسل الآن أو حدّد موعدًا لاحقًا."
      icon={Send}
      close={close}
      busy={busy}
      wide
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={close}>
            إغلاق
          </Button>
          {finished ? (
            <Button asChild>
              <Link href="/dashboard/patients/whatsapp">
                <ListChecks className="h-4 w-4 ml-2" />
                متابعة النتائج
              </Link>
            </Button>
          ) : pending ? (
            <Button disabled={busy || !sendEnabled} onClick={send}>
              <BusyIcon busy={busy} icon={RefreshCw} />
              استكمال المحاولة السابقة
            </Button>
          ) : preview ? (
            <Button
              disabled={
                busy || !sendEnabled || !preview.count || name.trim().length < 2
              }
              onClick={send}
            >
              <BusyIcon busy={busy} icon={Send} />
              {busy
                ? "جارٍ حفظ الإرسال…"
                : `${preview.scheduledAt ? "تأكيد جدولة" : "تأكيد إرسال"} ${preview.count} رسالة`}
            </Button>
          ) : (
            <Button disabled={busy || !templateId} onClick={check}>
              <BusyIcon busy={busy} icon={Eye} />
              معاينة المستلمين والرسالة
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!sendEnabled && (
          <WaNotice tone="warning">
            المعاينة متاحة؛ الإرسال الفعلي غير مفعّل على الخادم بعد.
          </WaNotice>
        )}
        {error && <WaNotice tone="error">{error}</WaNotice>}
        {finished ? (
          <div className="rounded-lg border border-success/20 bg-success/5 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
            <h3 className="font-bold">تم حفظ طلب الإرسال</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              يمكنك متابعة حالة كل رسالة من شاشة النتائج.
            </p>
            <p
              dir="ltr"
              className="mt-3 break-all font-mono text-xs text-muted-foreground"
            >
              {finished}
            </p>
          </div>
        ) : pending ? (
          <div className="space-y-4">
            <WaNotice>
              يوجد إرسال سابق غير محسوم. سنستكمل معرّفه نفسه، ولن ننشئ طلبًا
              ثانيًا.
            </WaNotice>
            <Button
              variant="outline"
              disabled={busy}
              onClick={resolve}
              className="h-auto min-h-10 whitespace-normal text-right"
            >
              <BusyIcon busy={busy} icon={SearchCheck} />
              تحقّق من النتيجة وألغِ المحاولة إن لم تُسجّل
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <WaField
                label="عنوان الإرسال"
                hint="عنوان داخلي يساعدك على معرفة الرسائل لاحقًا؛ لا يظهر للعميل."
              >
                <Input
                  value={name}
                  maxLength={100}
                  onChange={(e) => {
                    setName(e.target.value);
                    setPreview(null);
                  }}
                />
              </WaField>
              <WaField label="موعد الإرسال">
                <select
                  className={selectClass}
                  value={timing}
                  onChange={(e) => {
                    setTiming(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="now">إرسال الآن</option>
                  <option value="later">جدولة لوقت لاحق</option>
                </select>
              </WaField>
              {timing === "later" && (
                <WaField
                  label="التاريخ والوقت"
                  hint="بتوقيت بغداد، بصرف النظر عن إعداد ساعة المتصفح."
                >
                  <Input
                    type="datetime-local"
                    dir="ltr"
                    value={schedule}
                    onChange={(e) => {
                      setSchedule(e.target.value);
                      setPreview(null);
                    }}
                  />
                </WaField>
              )}
              <WaField label="القالب المعتمد">
                <select
                  className={selectClass}
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">اختر قالبًا</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </WaField>
              {!templates.length && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  أنشئ قالبًا واعتمده من صفحة القوالب ليظهر هنا.
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                يُستبدل اسم العميل والصيدلية تلقائيًا. أكمل النصوص الإضافية التي
                يستخدمها القالب.
              </p>
              <WaField label="نص 1">
                <Input
                  value={custom1}
                  maxLength={300}
                  onChange={(e) => {
                    setCustom1(e.target.value);
                    setPreview(null);
                  }}
                />
              </WaField>
              <WaField label="نص 2">
                <Input
                  value={custom2}
                  maxLength={300}
                  onChange={(e) => {
                    setCustom2(e.target.value);
                    setPreview(null);
                  }}
                />
              </WaField>
              {preview && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !templateId}
                  onClick={check}
                >
                  <BusyIcon busy={busy} icon={Eye} />
                  تحديث المعاينة
                </Button>
              )}
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Eye className="h-4 w-4 text-primary" />
                معاينة الرسالة
              </div>
              {preview ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone="success">
                      مؤهلون: {preview.count}
                    </StatusPill>
                    <StatusPill tone="muted">
                      مستبعدون: {preview.excluded.length}
                    </StatusPill>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>
                      {preview.scheduledAt
                        ? `الإرسال بعد ${formatSchedule(preview.scheduledAt)} بتوقيت بغداد.`
                        : "يبدأ الإرسال عند تشغيل الطابور بعد التأكيد."}
                    </p>
                  </div>
                  {preview.pricing ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-2">
                      <p className="font-semibold">
                        التكلفة التقديرية:{" "}
                        {preview.pricing.totalIqd.toLocaleString("ar-IQ")} د.ع
                      </p>
                      <p className="text-muted-foreground">
                        {preview.pricing.unitPriceIqd ?? "—"} د.ع للرسالة ·{" "}
                        {preview.pricing.messageCount} رسالة · إصدار التسعير{" "}
                        {preview.pricing.policyRevision}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        معاينة تكلفة فقط؛ لا يُخصم رصيد بهذه الخطوة. الفوترة
                        الفعلية غير مفعّلة هنا. تقدير الرسائل المجدولة يعكس
                        الأسعار الحالية، ولا يضمن رسوم المزود في موعد الإرسال.
                      </p>
                    </div>
                  ) : (
                    <WaNotice tone="warning">
                      مدير المنصة لم يعتمد أسعار الرسائل بعد؛ لا يوجد تقدير
                      تكلفة معتمد لهذه المعاينة.
                    </WaNotice>
                  )}
                  {preview.recipients.map((r: any) => (
                    <div
                      className="rounded-lg border border-border bg-muted/30 p-4"
                      key={r.patientId}
                    >
                      <p className="mb-2 text-xs font-semibold text-primary">
                        {r.name}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {r.text}
                      </p>
                    </div>
                  ))}
                  {preview.excluded.length > 0 && (
                    <details className="rounded-lg border border-border text-sm">
                      <summary className="cursor-pointer px-3 py-2.5 font-medium text-muted-foreground">
                        أسباب الاستبعاد ({preview.excluded.length})
                      </summary>
                      <div className="max-h-40 space-y-2 overflow-y-auto border-t border-border p-3 text-xs leading-relaxed text-muted-foreground">
                        {preview.excluded.map((r: any, i: number) => (
                          <p key={i}>
                            <span className="font-semibold text-foreground">
                              {r.name}
                            </span>
                            : {r.reason}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
                  <MessageSquare className="mb-3 h-6 w-6 text-muted-foreground/60" />
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                    {selectedTemplate?.body ??
                      "اختر قالبًا لرؤية نصه، ثم عاين المستلمين لعرض الرسالة بأسمائهم."}
                  </p>
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                الإرسال برسائل فردية. قد تفرض Meta رسومًا؛ راجع تسعير الحساب قبل
                التأكيد.
              </p>
            </div>
          </div>
        )}
      </div>
    </WaDialog>
  );
}

export function WhatsAppManager() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("campaigns"),
    [details, setDetails] = useState<any[]>([]),
    [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    name: "",
    body: "مرحبًا {{اسم_العميل}}، تحية من {{اسم_الصيدلية}}. {{نص_1}}",
    language: "ar",
    category: "UTILITY",
  });
  const load = async () => setData(await waRequest());
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const act = async (body: unknown) => {
    try {
      setBusy(true);
      setError("");
      const result = await waRequest(body);
      await load();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إكمال الطلب");
    } finally {
      setBusy(false);
    }
  };
  const view = async (id: string) => {
    try {
      setBusy(true);
      setSelected(id);
      setDetails([]);
      setDetails((await waRequest(undefined, `?campaignId=${id}`)).messages);
      setTab("campaigns");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحميل");
    } finally {
      setBusy(false);
    }
  };
  const tabs = [
    { key: "campaigns", label: "الرسائل والجدولة", icon: ListChecks },
    { key: "templates", label: "القوالب", icon: FileText },
    ...(data?.permissions.inbox
      ? [{ key: "inbox", label: "المحادثات", icon: MessageSquare }]
      : []),
  ];
  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0];
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <MessageSquare className="h-6 w-6 shrink-0 text-primary" />
            مراسلة العملاء وجدولة الرسائل
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            اختر العملاء من سجل المرضى، وأرسل رسائل شخصية الآن أو في موعد محدد،
            ثم تابع نتائجها.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/dashboard/patients">
            <Users className="h-4 w-4" />
            العودة إلى سجل المرضى
          </Link>
        </Button>
      </div>
      {error && <WaNotice tone="error">{error}</WaNotice>}
      {data?.wallet && (
        <div className="glass-card space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="font-semibold">رصيد رسائل WhatsApp</h2>
            <span className="text-sm font-bold text-primary">
              المتاح: {data.wallet.availableIqd.toLocaleString("ar-IQ")} د.ع
            </span>
            <span className="text-sm text-muted-foreground">
              المحجوز: {data.wallet.reservedIqd.toLocaleString("ar-IQ")} د.ع
            </span>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            يُشحن الرصيد عبر مدير فاراماس. تُحجز تكلفة الرسائل عند التأكيد،
            ويُخصم السعر المعروض مرة واحدة عند تأكيد التسليم. الرسائل غير
            المؤكدة تبقى محجوزة حتى تُحسم، ولا تعِد إرسالها.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-primary">
              عرض كشف الرصيد
            </summary>
            <div className="mt-3 max-h-60 divide-y divide-border overflow-y-auto">
              {data.wallet.entries.map((e: any) => (
                <div
                  key={e.id}
                  className="flex flex-wrap justify-between gap-2 py-2"
                >
                  <span>
                    {
                      (
                        {
                          CREDIT: "شحن",
                          RESERVE: "حجز حملة",
                          CHARGE: "خصم تسليم",
                          RELEASE: "إعادة حجز",
                        } as Record<string, string>
                      )[e.kind]
                    }{" "}
                    · {new Date(e.createdAt).toLocaleString("ar-IQ")}
                  </span>
                  <span>
                    المتاح {e.availableDelta.toLocaleString("ar-IQ")} · المحجوز{" "}
                    {e.reservedDelta.toLocaleString("ar-IQ")}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
      {data?.permissions.send && (
        <div className="glass-card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">ابدأ باختيار المستلمين</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                حدّد عميلًا أو عدة عملاء أو جميع نتائج البحث، ثم عاين الرسالة
                وتكلفتها قبل التأكيد.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                تصل رسالة مستقلة لكل عميل؛ لا يُضاف المستلمون إلى مجموعة.
              </p>
            </div>
          </div>
          <Button asChild className="gap-2">
            <Link href="/dashboard/patients">
              <Send className="h-4 w-4" />
              اختيار العملاء وإرسال رسالة
            </Link>
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div
          role="tablist"
          aria-label="إدارة WhatsApp"
          className="flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          {tabs.map((t, i) => (
            <button
              key={t.key}
              role="tab"
              id={`wa-tab-${t.key}`}
              aria-selected={activeTab.key === t.key}
              aria-controls="wa-panel"
              tabIndex={activeTab.key === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (i + (e.key === "ArrowLeft" ? 1 : -1) + tabs.length) %
                        tabs.length;
                setTab(tabs[next].key);
                document.getElementById(`wa-tab-${tabs[next].key}`)?.focus();
              }}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${activeTab.key === t.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <t.icon aria-hidden="true" className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          disabled={busy}
          onClick={() => load().catch((e) => setError(e.message))}
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>
      {data && (
        <WaNotice tone={data.connection?.configured ? "info" : "warning"}>
          {data.connection?.configured
            ? "اتصال WhatsApp مهيأ؛ يدير مدير المنصة بيانات الربط."
            : "لم يُهيأ اتصال WhatsApp بعد. اطلب من مدير المنصة ربط رقم الصيدلية؛ يمكنك تجهيز القوالب ومعاينة الرسائل."}
        </WaNotice>
      )}
      {data && !data.sendEnabled && (
        <WaNotice tone="warning">
          الإرسال الفعلي مطفأ. يمكنك تجهيز القوالب ومعاينة الرسائل حتى تكتمل
          إعدادات الاتصال.
        </WaNotice>
      )}
      {data?.connection?.configured && !data.connection.billingReady && (
        <WaNotice tone="warning">
          الإرسال ينتظر إكمال الفوترة المركزية لدى مدير فاراماس. تجهيز القوالب
          والمعاينة متاحان.
        </WaNotice>
      )}
      {!data ? (
        !error && <WaLoading />
      ) : (
        <div
          id="wa-panel"
          role="tabpanel"
          aria-labelledby={`wa-tab-${activeTab.key}`}
          className="min-w-0"
        >
          {activeTab.key === "inbox" && <WhatsAppInbox />}
          {activeTab.key === "templates" && (
            <div
              className={`grid items-start gap-5 ${data.permissions.manage ? "xl:grid-cols-5" : ""}`}
            >
              {data.permissions.manage && (
                <form
                  id="wa-template-editor"
                  className="glass-card space-y-5 p-4 sm:p-5 xl:col-span-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act({ action: "template", ...form });
                    if (r) setForm((s) => ({ ...s, name: "" }));
                  }}
                >
                  <WaSectionHeading
                    icon={FilePlus2}
                    title="إنشاء نسخة قالب"
                    description="التعديل يُحفظ كمسودة جديدة؛ الرسائل السابقة تبقى كما هي."
                  />
                  <WaField label="اسم القالب">
                    <Input
                      required
                      value={form.name}
                      placeholder="مثال: ساعات عمل الصيدلية"
                      maxLength={80}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, name: e.target.value }))
                      }
                    />
                  </WaField>
                  <WaField label="نص الرسالة">
                    <textarea
                      required
                      className={`${fieldClass} min-h-36 resize-y leading-7`}
                      value={form.body}
                      maxLength={1024}
                      rows={5}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, body: e.target.value }))
                      }
                    />
                  </WaField>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      المتغيرات المتاحة
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {["اسم_العميل", "اسم_الصيدلية", "نص_1", "نص_2"].map(
                        (v) => (
                          <code
                            className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground"
                            key={v}
                          >{`{{${v}}}`}</code>
                        ),
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      لا تضف تشخيصًا أو وصفة أو معلومات صحية إلى حملة عامة.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <WaField label="اللغة">
                      <select
                        className={selectClass}
                        value={form.language}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, language: e.target.value }))
                        }
                      >
                        <option value="ar">العربية</option>
                        <option value="en">English</option>
                      </select>
                    </WaField>
                    <WaField label="الفئة">
                      <select
                        className={selectClass}
                        value={form.category}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, category: e.target.value }))
                        }
                      >
                        <option value="UTILITY">خدمة مرتبطة بطلب العميل</option>
                        <option value="MARKETING">تسويق عام مسموح</option>
                      </select>
                    </WaField>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    اعتماد النص والفئة لدى Meta؛ يخضع محتوى الصيدليات لسياستها
                    الخاصة بالمنتجات الطبية.
                  </p>
                  <div className="border-t border-border pt-4">
                    <Button
                      type="submit"
                      disabled={busy}
                      className="w-full gap-2 sm:w-auto"
                    >
                      <BusyIcon busy={busy} icon={Save} />
                      حفظ مسودة جديدة
                    </Button>
                  </div>
                </form>
              )}
              <TableCard
                className={data.permissions.manage ? "xl:col-span-3" : ""}
              >
                <TableTitle
                  icon={<FileText className="h-4 w-4 text-primary" />}
                  title="القوالب المحفوظة"
                  aside={`${data.templates.length} قالب`}
                />
                <div className="divide-y divide-border">
                  {data.templates.map((t: Template) => (
                    <article key={t.id} className="space-y-3 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 break-words text-sm font-bold text-foreground">
                          {t.name}
                        </h3>
                        <WaStatus status={t.status} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t.language === "ar" ? "العربية" : "English"}
                        </span>
                        <span>·</span>
                        <span>
                          {t.category === "MARKETING"
                            ? "تسويق عام"
                            : "خدمة للعميل"}
                        </span>
                      </div>
                      <p className="rounded-lg border border-border bg-muted/20 p-3 whitespace-pre-wrap break-words text-sm leading-7">
                        {t.body}
                      </p>
                      {data.permissions.manage && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={busy}
                            onClick={() => {
                              setForm({
                                name: t.name,
                                body: t.body,
                                language: t.language,
                                category: t.category,
                              });
                              document
                                .getElementById("wa-template-editor")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }}
                          >
                            <CopyPlus className="h-4 w-4" />
                            تعديل كنسخة جديدة
                          </Button>
                          {t.status === "DRAFT" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto min-h-9 gap-2 whitespace-normal"
                              disabled={busy}
                              onClick={() =>
                                act({ action: "submit", id: t.id })
                              }
                            >
                              <Send className="h-4 w-4 shrink-0" />
                              إرسال القالب إلى Meta للاعتماد
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-2 text-muted-foreground"
                              disabled={busy}
                              onClick={() => act({ action: "sync", id: t.id })}
                            >
                              <RefreshCw className="h-4 w-4" />
                              تحديث حالة الاعتماد
                            </Button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                {!data.templates.length && (
                  <EmptyState
                    icon={<FileText />}
                    title="لا توجد قوالب بعد"
                    hint="أنشئ مسودة لتجهيز أول رسالة للصيدلية."
                  />
                )}
              </TableCard>
            </div>
          )}
          {activeTab.key === "campaigns" && (
            <div className="space-y-5">
              <TableCard>
                <TableTitle
                  icon={<Send className="h-4 w-4 text-primary" />}
                  title="سجل الرسائل"
                  aside={`${data.campaigns.length} عملية إرسال`}
                />
                {data.campaigns.length ? (
                  <DataTable>
                    <THead>
                      <Th>عنوان الإرسال</Th>
                      <Th>الرسائل</Th>
                      <Th>التكلفة التقديرية</Th>
                      <Th>الحالة</Th>
                      <Th>موعد الإرسال · بغداد</Th>
                      <Th>الإجراءات</Th>
                    </THead>
                    <TBody>
                      {data.campaigns.map((c: any) => (
                        <tr
                          className={`${rowClass} ${selected === c.id ? "bg-primary/5" : ""}`}
                          key={c.id}
                        >
                          <td className={cellClass}>
                            <PrimaryCell
                              title={c.name}
                              maxWidth="max-w-[240px]"
                            />
                          </td>
                          <td className={`${cellClass} tabular-nums`}>
                            {c.count}
                          </td>
                          <td className={`${cellClass} tabular-nums`}>
                            {c.priceQuote ? (
                              <>
                                <span>
                                  {Number(c.priceQuote.totalIqd).toLocaleString(
                                    "ar-IQ",
                                  )}{" "}
                                  د.ع
                                </span>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  تقدير محفوظ · الإصدار{" "}
                                  {c.priceQuote.policyRevision}
                                </p>
                              </>
                            ) : (
                              <span className="text-muted-foreground">
                                غير مسعّرة
                              </span>
                            )}
                          </td>
                          <td className={cellClass}>
                            <WaStatus
                              status={
                                c.status === "QUEUED" &&
                                c.scheduledAt &&
                                new Date(c.scheduledAt).getTime() > Date.now()
                                  ? "SCHEDULED"
                                  : c.status
                              }
                            />
                          </td>
                          <td className={cellClass}>
                            {c.scheduledAt ? (
                              <span className="text-sm">
                                {formatSchedule(c.scheduledAt)}
                              </span>
                            ) : (
                              <span className="text-sm">إرسال فوري</span>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              أُنشئ: {formatSchedule(c.createdAt)}
                            </p>
                          </td>
                          <td className={cellClass}>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                disabled={busy}
                                onClick={() => view(c.id)}
                              >
                                <Eye className="h-4 w-4" />
                                عرض النتائج
                              </Button>
                              {data.permissions.send &&
                                c.status === "NEEDS_REVIEW" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    className="gap-2"
                                    onClick={() =>
                                      act({ action: "resume", id: c.id })
                                    }
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    استئناف غير المرسل
                                  </Button>
                                )}
                              {data.permissions.send &&
                                c.status === "QUEUED" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={busy}
                                    onClick={() =>
                                      act({ action: "cancel", id: c.id })
                                    }
                                  >
                                    <PauseCircle className="h-4 w-4" />
                                    إيقاف غير المرسل
                                  </Button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </TBody>
                  </DataTable>
                ) : (
                  <EmptyState
                    icon={<Send />}
                    title="لا توجد رسائل بعد"
                    hint="ابدأ من سجل المرضى؛ اختر المستلمين، ثم عاين الرسالة وحدّد موعد إرسالها."
                  />
                )}
              </TableCard>
              {selected && (
                <TableCard>
                  <TableTitle
                    icon={<ListChecks className="h-4 w-4 text-primary" />}
                    title="نتائج الإرسال"
                    aside={`${details.length} نتيجة`}
                  />
                  <div className="border-b border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    الإلغاء يوقف الرسائل التي لم يبدأ إرسالها فقط. النتائج غير
                    المؤكدة لا تعاد تلقائيًا.
                  </div>
                  {busy ? (
                    <WaLoading text="جارٍ تحميل النتائج…" />
                  ) : (
                    <div className="divide-y divide-border">
                      {details.map((m) => (
                        <div key={m.id} className="space-y-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold">
                                {m.name}
                              </p>
                              <p
                                dir="ltr"
                                className="mt-1 text-right text-xs tabular-nums text-muted-foreground"
                              >
                                {m.phone}
                              </p>
                            </div>
                            <WaStatus status={m.status} />
                          </div>
                          {m.error && (
                            <WaNotice tone="error">{m.error}</WaNotice>
                          )}
                          <details className="text-sm">
                            <summary className="cursor-pointer text-xs font-medium text-primary">
                              النص المرسل
                            </summary>
                            <p className="mt-2 rounded-lg bg-muted/30 p-3 whitespace-pre-wrap break-words leading-7">
                              {m.text}
                            </p>
                          </details>
                        </div>
                      ))}
                    </div>
                  )}
                </TableCard>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
