"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WaField, WaNotice } from "@/app/ui/patients/whatsapp-design";
type Credit = { id: string; amountIqd: number; reference: string };
function readCreditStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    throw new Error(
      "تعذر قراءة محاولة الشحن السابقة؛ لم يُرسل طلب جديد. أعد إتاحة التخزين دون مسح بيانات الموقع.",
    );
  }
}
function saveCreditStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    if (localStorage.getItem(key) !== value) throw new Error();
  } catch {
    throw new Error(
      "تعذر حفظ محاولة الشحن؛ لم يُرسل الطلب. أعد إتاحة تخزين الموقع ثم حاول مجددًا.",
    );
  }
}
type Facebook = {
  init: (config: any) => void;
  login: (callback: (r: any) => void, options: any) => void;
};
let sdk: Promise<Facebook> | null = null;
function facebook() {
  if (!sdk)
    sdk = new Promise((resolve, reject) => {
      const existing = (window as unknown as { FB?: Facebook }).FB;
      if (existing) {
        resolve(existing);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.onload = () => {
        const fb = (window as unknown as { FB?: Facebook }).FB;
        fb ? resolve(fb) : reject(new Error("تعذر تحميل خدمة Meta."));
      };
      script.onerror = () => {
        sdk = null;
        reject(new Error("تعذر تحميل خدمة Meta."));
      };
      document.head.appendChild(script);
    });
  return sdk;
}
export default function WhatsAppPlatformPanel({
  organizationId,
}: {
  organizationId: string;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [amount, setAmount] = useState(""),
    [reference, setReference] = useState(""),
    [allocation, setAllocation] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState<Credit | null>(null);
  const [prepared, setPrepared] = useState<{ setup: any; fb: Facebook } | null>(
    null,
  );
  const active = useRef(true),
    key = `faramace:wa-wallet-credit:${organizationId}`,
    url = `/api/admin/organizations/${encodeURIComponent(organizationId)}/whatsapp`;
  async function request(path: string, body?: unknown) {
    const r = await fetch(url + path, {
        cache: "no-store",
        ...(body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      }),
      d = await r.json();
    if (!r.ok) throw new Error(d.error || "تعذر إكمال الطلب.");
    return d;
  }
  async function load() {
    const d = await request("/billing");
    if (active.current) {
      setData(d);
      setAllocation(d.connection?.allocationId ?? "");
    }
  }
  useEffect(() => {
    active.current = true;
    try {
      const saved = readCreditStorage(key);
      if (saved) {
        const p = JSON.parse(saved);
        if (
          typeof p.id !== "string" ||
          !Number.isSafeInteger(p.amountIqd) ||
          typeof p.reference !== "string"
        )
          throw new Error("محاولة شحن تالفة؛ راجع كشف الرصيد قبل حذفها.");
        setPending(p);
        setAmount(String(p.amountIqd));
        setReference(p.reference);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر قراءة المحاولة السابقة.");
    }
    void load().catch((e) => setError(e.message));
    return () => {
      active.current = false;
    };
  }, [organizationId]);
  async function credit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Read failures cannot masquerade as absence. Reuse the durable operation id.
      const saved = readCreditStorage(key),
        attempt: Credit = saved
          ? JSON.parse(saved)
          : {
              id: crypto.randomUUID(),
              amountIqd: Number(amount),
              reference: reference.trim(),
            };
      if (
        !Number.isSafeInteger(attempt.amountIqd) ||
        attempt.amountIqd <= 0 ||
        attempt.amountIqd > 1000000000 ||
        attempt.reference.length < 3
      )
        throw new Error("أدخل مبلغًا صحيحًا ورقم مستند التحصيل.");
      const serialized = JSON.stringify(attempt);
      saveCreditStorage(key, serialized);
      setPending(attempt);
      await request("/billing", { action: "credit", ...attempt });
      try {
        if (localStorage.getItem(key) === serialized)
          localStorage.removeItem(key);
      } catch {
        setNotice(
          "تأكد تسجيل الرصيد، لكن تعذر تحديث التخزين. المحاولة محفوظة وتُستكمل بالمعرّف نفسه دون شحن مكرر.",
        );
        await load();
        return;
      }
      setPending(null);
      setAmount("");
      setReference("");
      setNotice(
        "سُجّل الرصيد مرة واحدة. هذا تسجيل للتحصيل لديك، ولا يخصم من صندوق الصيدلية.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "تعذر شحن الرصيد؛ المحاولة محفوظة.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/billing", { action: "verify", allocationId: allocation });
      setNotice("تأكد ربط حساب المؤسسة بفوترة المنصة لدى Meta.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحقق.");
    } finally {
      setBusy(false);
    }
  }
  async function recheck() {
    setBusy(true);
    setError("");
    try {
      await request("/signup", { action: "recheck" });
      setNotice("تحققت حالة الربط؛ أعد التحقق من الفوترة قبل الإرسال.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحقق من الربط.");
    } finally {
      setBusy(false);
    }
  }
  async function signup() {
    setBusy(true);
    setError("");
    setNotice("");
    let cleanup = () => {};
    try {
      if (!confirmed)
        throw new Error("أكد اطلاع صاحب الرقم على أثر الربط أولًا.");
      if (!prepared) {
        const setup = await request("/signup", { action: "start" }),
          fb = await facebook();
        setPrepared({ setup, fb });
        return;
      }
      const { setup, fb } = prepared;
      setPrepared(null);
      fb.init({
        appId: setup.appId,
        version: setup.version,
        autoLogAppEvents: false,
        xfbml: false,
      });
      const completion = new Promise<any>((resolve, reject) => {
        const timer = window.setTimeout(
          () =>
            reject(
              new Error(
                "لم يصل حدث اكتمال الربط من Meta؛ راجع الحالة قبل المحاولة مجددًا.",
              ),
            ),
          1200000,
        );
        const listener = (e: MessageEvent) => {
          if (
            ![
              "https://www.facebook.com",
              "https://web.facebook.com",
              "https://facebook.com",
            ].includes(e.origin)
          )
            return;
          let d: any;
          try {
            d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          } catch {
            return;
          }
          if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
          if (d.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")
            resolve(d.data);
          else if (["CANCEL", "ERROR"].includes(d.event))
            reject(new Error("لم يكتمل الربط لدى Meta."));
        };
        window.addEventListener("message", listener);
        cleanup = () => {
          window.clearTimeout(timer);
          window.removeEventListener("message", listener);
        };
      });
      // Attach a rejection observer while the code callback is pending.
      void completion.catch(() => {});
      await new Promise<void>((resolve, reject) =>
        fb.login(
          (r) => {
            const code = r.authResponse?.code;
            if (!code) {
              reject(new Error("لم تمنح Meta رمز الربط."));
              return;
            }
            request("/signup", { action: "exchange", id: setup.id, code }).then(
              () => resolve(),
              reject,
            );
          },
          {
            config_id: setup.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: {
              featureType: "whatsapp_business_app_onboarding",
              sessionInfoVersion: "3",
            },
          },
        ),
      );
      const d = await completion;
      if (!d?.waba_id)
        throw new Error(
          "لم ترسل Meta معرّفات الرقم والحساب كاملة؛ راجع إعداد التسجيل المدمج.",
        );
      await request("/signup", {
        action: "finish",
        id: setup.id,
        ...(d.phone_number_id ? { phoneId: d.phone_number_id } : {}),
        businessId: d.waba_id,
      });
      setNotice(
        "اكتمل ربط المشاركة. يبقى إرسال الحملات متوقفًا حتى تحقق الفوترة المركزية وشحن الرصيد.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إكمال الربط.");
    } finally {
      cleanup();
      setBusy(false);
    }
  }
  const format = (n: number) => n.toLocaleString("ar-IQ") + " د.ع";
  const labels: Record<string, string> = {
    ACTIVE: "متصل",
    ONBOARDING: "بانتظار استكمال الاشتراك",
    DISCONNECTED: "مفصول؛ أعد الربط",
    NEEDS_REVIEW: "يحتاج تحققاً",
    NOT_REQUESTED: "لم تُطلب",
    REQUESTING: "جارٍ الطلب",
    REQUESTED: "قُبل طلب المزامنة",
    UNKNOWN: "نتيجة غير مؤكدة",
    DECLINED: "رفض صاحب الرقم مشاركة السجل",
    RECEIVING: "يستقبل إشعارات التحديث",
    TRANSFER_COMPLETE: "انتهى نقل Meta؛ المعالجة المحلية قد تستمر",
  };
  return (
    <div className="space-y-5 border-t border-border pt-5" dir="rtl">
      <div>
        <h3 className="font-semibold">الفوترة والمشاركة</h3>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          الصيدلية تدفع لفاراماس. تشحن رصيدها بعد التحصيل، وتحدد سعر الرسالة من
          تسعير المنصة. تُحجز تكلفة الحملة عند تأكيدها، وتُخصم الرسائل المسلّمة
          فقط.
        </p>
      </div>
      {error && <WaNotice tone="error">{error}</WaNotice>}
      {notice && <WaNotice>{notice}</WaNotice>}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">متاح للإرسال</p>
            <p className="mt-1 font-bold">{format(data.wallet.availableIqd)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">محجوز لحملات قائمة</p>
            <p className="mt-1 font-bold">{format(data.wallet.reservedIqd)}</p>
          </div>
        </div>
      )}
      <form onSubmit={credit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <WaField label="الرصيد المستلم بالدينار">
            <Input
              type="number"
              min="1"
              max="1000000000"
              required
              value={amount}
              disabled={busy || !!pending}
              onChange={(e) => setAmount(e.target.value)}
            />
          </WaField>
          <WaField label="رقم مستند التحصيل">
            <Input
              required
              value={reference}
              disabled={busy || !!pending}
              onChange={(e) => setReference(e.target.value)}
            />
          </WaField>
        </div>
        {pending && (
          <WaNotice tone="warning">
            محاولة شحن محفوظة؛ يُستخدم معرّفها نفسه عند إعادة التحقق. لا تسجل
            تحصيلًا جديدًا بدلها.
          </WaNotice>
        )}
        <Button disabled={busy} type="submit">
          {pending ? "استكمال محاولة الشحن" : "تسجيل الرصيد بعد التحصيل"}
        </Button>
      </form>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold">ربط الفوترة لدى Meta</p>
        <p className="text-xs leading-6 text-muted-foreground">
          أكمل مشاركة خط ائتمان المنصة لدى Meta، ثم أدخل معرّف التخصيص للتحقق.
          هذا الزر يقرأ الربط ولا ينشئ التزامًا ماليًا جديدًا.
        </p>
        {!data?.billingConfigured && (
          <WaNotice tone="warning">
            أكمل خط الائتمان ورمز مستخدم النظام في إعدادات الخادم. اعتماد Tech
            Provider وحده لا يتيح دفع رسوم المؤسسات.
          </WaNotice>
        )}
        <WaField label="معرّف تخصيص الائتمان">
          <Input
            dir="ltr"
            value={allocation}
            onChange={(e) => setAllocation(e.target.value)}
            disabled={busy}
          />
        </WaField>
        <Button
          variant="outline"
          disabled={busy || !allocation}
          onClick={() => void verify()}
        >
          تحقق من فوترة المؤسسة عبر المنصة
        </Button>
        {data?.connection?.billingVerifiedAt && (
          <p className="text-xs text-primary">
            آخر إثبات:{" "}
            {new Date(data.connection.billingVerifiedAt).toLocaleString(
              "ar-IQ",
            )}
          </p>
        )}
      </div>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-sm font-semibold">
          ربط رقم WhatsApp Business مع المشاركة
        </p>
        <WaNotice tone="warning">
          يواصل صاحب الرقم استخدام تطبيقه، لكن Meta تفصل الأجهزة المرتبطة عند
          الربط. يمكن إعادة ربط الأجهزة المدعومة؛ Windows وWearOS غير مدعومين
          وفق الوثيقة الحالية. تتعطل الرسائل المؤقتة والعرض لمرة واحدة والموقع
          المباشر وقوائم البث. يختار صاحب الرقم مشاركة السجل داخل Meta.
        </WaNotice>
        <label className="flex items-start gap-2 text-xs leading-6">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={busy}
          />
          أطلع صاحب الرقم على أثر الربط وسيتولى تسجيل الدخول ومسح رمز QR بنفسه.
        </label>
        <Button disabled={busy || !confirmed} onClick={() => void signup()}>
          {prepared ? "ربط المشاركة عبر Meta" : "تجهيز الربط مع المشاركة"}
        </Button>
        {data?.connection && (
          <p className="text-xs text-muted-foreground">
            حالة الربط: {labels[data.connection.state] ?? data.connection.state}{" "}
            · جهات الاتصال:{" "}
            {labels[data.connection.contactsSyncState] ??
              data.connection.contactsSyncState}{" "}
            · السجل:{" "}
            {labels[data.connection.historySyncState] ??
              data.connection.historySyncState}
          </p>
        )}
      </div>
      {data?.connection?.mode === "COEXISTENCE" &&
        ["ONBOARDING", "NEEDS_REVIEW"].includes(data.connection.state) && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void recheck()}
          >
            تحقق وأكمل الربط المحفوظ
          </Button>
        )}
      {!!data?.webhookQueue?.review && (
        <WaNotice tone="warning">
          يوجد {data.webhookQueue.review} إشعار يحتاج مراجعة فنية. لا تعِد طلب
          مزامنة السجل لمعالجة ذلك.
        </WaNotice>
      )}
      {!!data?.webhookQueue?.pending && (
        <p className="text-xs text-muted-foreground">
          إشعارات قيد المعالجة: {data.webhookQueue.pending}
        </p>
      )}
      {data?.wallet.entries?.length > 0 && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            كشف حركات الرصيد
          </summary>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {data.wallet.entries.map((e: any) => (
              <div
                key={e.id}
                className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-xs"
              >
                <span>
                  {
                    (
                      {
                        CREDIT: "شحن",
                        RESERVE: "حجز",
                        CHARGE: "خصم تسليم",
                        RELEASE: "إعادة حجز",
                      } as Record<string, string>
                    )[e.kind]
                  }{" "}
                  · {e.reference}
                </span>
                <span>
                  المتاح {format(e.availableDelta)} · المحجوز{" "}
                  {format(e.reservedDelta)} ·{" "}
                  {new Date(e.createdAt).toLocaleString("ar-IQ")}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
