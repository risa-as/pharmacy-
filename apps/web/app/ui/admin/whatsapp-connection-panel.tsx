"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Settings2,
  ShieldCheck,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/app/ui/data-table";
import { WaField, WaNotice } from "@/app/ui/patients/whatsapp-design";
import WhatsAppPlatformPanel from "./whatsapp-platform-panel";

type SavedConnection = {
  phoneId: string;
  businessId: string;
  updatedAt: string;
};
export default function WhatsAppConnectionPanel({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedConnection | null>(null);
  const [error, setError] = useState("");
  const [webhook, setWebhook] = useState<{
    webhookPath: string;
    verifyToken: string;
  } | null>(null);
  const [form, setForm] = useState({
    phoneId: "",
    businessId: "",
    token: "",
    appSecret: "",
  });
  const url = `/api/admin/organizations/${encodeURIComponent(organizationId)}/whatsapp`;
  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "تعذر قراءة حالة الاتصال.");
      setSaved(data.connection);
      setForm({
        phoneId: data.connection?.phoneId ?? "",
        businessId: data.connection?.businessId ?? "",
        token: "",
        appSecret: "",
      });
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر قراءة حالة الاتصال.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (open && !loaded) void load();
  }, [open]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setWebhook(null);
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, revision: saved?.updatedAt ?? null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الاتصال.");
      setSaved({
        phoneId: form.phoneId,
        businessId: form.businessId,
        updatedAt: data.revision,
      });
      setForm((s) => ({ ...s, token: "", appSecret: "" }));
      setWebhook(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الاتصال.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-4" dir="rtl">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-right text-sm font-bold hover:bg-muted/50"
      >
        <Settings2 className="h-4 w-4 text-primary" /> اتصال WhatsApp
        <ChevronDown
          className={`mr-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">ربط رقم {organizationName}</p>
            <div className="flex items-center gap-2">
              {loaded && (
                <StatusPill tone={saved ? "success" : "muted"}>
                  {saved ? "الاتصال محفوظ" : "غير مهيأ"}
                </StatusPill>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading || saving}
                onClick={() => void load()}
                aria-label="تحديث حالة اتصال WhatsApp"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
          {error && <WaNotice tone="error">{error}</WaNotice>}
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ قراءة حالة الاتصال…
            </p>
          ) : (
            loaded && (
              <>
                <p className="text-xs leading-6 text-muted-foreground">
                  يدير مدير المنصة الربط؛ لا تحتاج الصيدلية إلى إدخال بيانات
                  Meta. الأسرار مشفرة ولا تُعرض بعد الحفظ. لتغيير الاتصال، أدخل
                  رمز الوصول وسر التطبيق مجددًا.
                </p>
                <form onSubmit={save} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      ["phoneId", "businessId", "token", "appSecret"] as const
                    ).map((key) => (
                      <WaField
                        key={key}
                        label={
                          {
                            phoneId: "Phone Number ID",
                            businessId: "WhatsApp Business Account ID",
                            token: "Access Token",
                            appSecret: "Meta App Secret",
                          }[key]
                        }
                      >
                        <Input
                          dir="ltr"
                          required
                          disabled={saving}
                          autoComplete="off"
                          type={
                            key === "token" || key === "appSecret"
                              ? "password"
                              : "text"
                          }
                          value={form[key]}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, [key]: e.target.value }))
                          }
                        />
                      </WaField>
                    ))}
                  </div>
                  <WaNotice tone="warning">
                    قبل تغيير الربط، أوقف الرسائل المنتظرة واحسم النتائج غير
                    المؤكدة. كل حفظ يصدر رمز تحقق جديدًا يجب تحديثه في إعداد
                    Webhook لدى Meta.
                  </WaNotice>
                  <Button
                    type="submit"
                    disabled={saving || loading}
                    className="gap-2 h-auto min-h-10 whitespace-normal"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}{" "}
                    تحقق من الحساب واحفظ الاتصال
                  </Button>
                </form>
                {webhook && (
                  <div
                    role="status"
                    className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
                  >
                    <p className="text-sm font-bold">
                      حُفظ الاتصال. أكمل إعداد استقبال النتائج في Meta.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      عنوان Webhook
                    </p>
                    <code
                      dir="ltr"
                      className="block break-all rounded-md border border-border bg-card p-2.5 text-xs"
                    >
                      {window.location.origin + webhook.webhookPath}
                    </code>
                    <p className="text-xs text-muted-foreground">
                      رمز التحقق يظهر الآن فقط؛ احفظه قبل إغلاق تفاصيل المؤسسة.
                    </p>
                    <code
                      dir="ltr"
                      className="block break-all rounded-md border border-border bg-card p-2.5 text-xs"
                    >
                      {webhook.verifyToken}
                    </code>
                  </div>
                )}
                <WhatsAppPlatformPanel organizationId={organizationId} />
              </>
            )
          )}
        </div>
      )}
    </section>
  );
}
