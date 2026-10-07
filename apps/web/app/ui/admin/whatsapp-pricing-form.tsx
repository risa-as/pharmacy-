"use client";
import { useEffect, useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  quoteWhatsAppMessage,
  whatsappPricingSchema,
  WHATSAPP_IRAQ_REFERENCE,
  type WhatsAppPricingConfig,
} from "@/app/lib/whatsapp/pricing";

const fields = [
  ["marketingUsd", "تكلفة Meta للتسويق (دولار / رسالة)"],
  ["utilityUsd", "تكلفة Meta للرسائل الخدمية بالقالب (دولار / رسالة)"],
  ["providerFeeUsd", "رسم المزوّد الإضافي (دولار / رسالة)"],
  ["usdToIqd", "سعر التحويل المحاسبي (دينار لكل دولار)"],
  ["markupPercent", "نسبة الزيادة فوق التكلفة (%)"],
  ["roundToIqd", "التقريب لأعلى لأقرب (د.ع)"],
  ["effectiveFrom", "تاريخ بدء أسعار التكلفة"],
  ["sourceUrl", "رابط مصدر الأسعار"],
] as const;

export default function WhatsAppPricingForm() {
  const [form, setForm] = useState<Record<keyof WhatsAppPricingConfig, string>>(
    () =>
      Object.fromEntries(
        Object.entries(WHATSAPP_IRAQ_REFERENCE).map(([k, v]) => [k, String(v)]),
      ) as Record<keyof WhatsAppPricingConfig, string>,
  );
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/whatsapp-pricing", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "تعذر تحميل الأسعار.");
      const c = whatsappPricingSchema.parse(
        data.policy?.config ?? data.reference,
      );
      setForm(
        Object.fromEntries(
          Object.entries(c).map(([k, v]) => [k, String(v)]),
        ) as Record<keyof WhatsAppPricingConfig, string>,
      );
      setRevision(data.policy?.revision ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الأسعار.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const parsed = whatsappPricingSchema.safeParse({
    ...form,
    markupPercent: Number(form.markupPercent),
    roundToIqd: Number(form.roundToIqd),
  });
  let example: { marketing: number; utility: number } | null = null;
  if (parsed.success) {
    try {
      const policy = {
        revision: Math.max(1, revision ?? 1),
        config: parsed.data,
      };
      const at = new Date(parsed.data.effectiveFrom + "T00:00:00+03:00");
      example = {
        marketing: quoteWhatsAppMessage(policy, {
          category: "MARKETING",
          phone: "9647700000000",
          at,
        }).unitPriceIqd,
        utility: quoteWhatsAppMessage(policy, {
          category: "UTILITY",
          phone: "9647700000000",
          at,
        }).unitPriceIqd,
      };
    } catch {
      /* Invalid or excessive quote remains unavailable. */
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.success || revision === null || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/whatsapp-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, config: parsed.data }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "تعذر حفظ الأسعار.");
      setRevision(data.policy.revision);
      setNotice(
        "حُفظت الأسعار. المعاينات الجديدة تستخدمها، والحملات المحفوظة تحتفظ بتقديرها السابق.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الأسعار.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm"
        >
          {notice}
        </p>
      )}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            إعدادات السعر{" "}
            {revision ? `· الإصدار ${revision}` : "· لم تُعتمد بعد"}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          القيم المرجعية للعراق من 1 أكتوبر 2026. تحقّق من فاتورة مزوّدك؛ سعر
          التحويل 1300 مثال محاسبي قابل للتعديل، وليس سعر صرف لحظيًا. لا يشمل
          التقدير ضريبة أو اشتراكًا شهريًا.
        </p>
        <fieldset disabled={busy} className="grid gap-5 md:grid-cols-2">
          {fields.map(([key, label]) => (
            <div
              key={key}
              className={key === "sourceUrl" ? "md:col-span-2" : ""}
            >
              <label
                htmlFor={`wa-price-${key}`}
                className="mb-2 block text-sm font-medium"
              >
                {label}
              </label>
              <Input
                id={`wa-price-${key}`}
                required
                dir="ltr"
                type={
                  key === "effectiveFrom"
                    ? "date"
                    : key === "sourceUrl"
                      ? "url"
                      : "text"
                }
                inputMode={
                  key === "effectiveFrom" || key === "sourceUrl"
                    ? undefined
                    : "decimal"
                }
                value={form[key]}
                onChange={(e) =>
                  setForm((old) => ({ ...old, [key]: e.target.value }))
                }
              />
            </div>
          ))}
        </fieldset>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <h2 className="font-semibold">معاينة سعر البيع للرسالة</h2>
        {example ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <p>
              تسويق:{" "}
              <strong>{example.marketing.toLocaleString("ar-IQ")} د.ع</strong>
            </p>
            <p>
              رسالة خدمية بالقالب:{" "}
              <strong>{example.utility.toLocaleString("ar-IQ")} د.ع</strong>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            أكمل إعدادات صحيحة لعرض السعر.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          السعر = (تكلفة Meta + رسم المزوّد) × سعر التحويل × (1 + نسبة الزيادة).
          يُقرّب لأعلى لكل رسالة. زيادة 30% فوق التكلفة تساوي هامشًا إجماليًا
          23.08% من سعر البيع قبل التقريب والمصاريف الأخرى.
        </p>
      </div>
      <Button
        disabled={busy || revision === null || !parsed.success || !example}
        type="submit"
      >
        <Save className="h-4 w-4 ml-2" />
        {busy ? "جارٍ التحميل…" : "اعتماد وحفظ الأسعار"}
      </Button>
    </form>
  );
}
