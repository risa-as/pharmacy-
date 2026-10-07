"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WaNotice } from "./whatsapp-design";
export default function WhatsAppInbox() {
  const [threads, setThreads] = useState<any[]>([]),
    [messages, setMessages] = useState<any[]>([]),
    [phone, setPhone] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [cursor, setCursor] = useState<{ before: string; id: string } | null>(null);
  const sequence = useRef(0);
  async function load(selected = phone, older = false) {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
          `/api/whatsapp/inbox${selected ? "?phone=" + encodeURIComponent(selected) + (older && cursor ? "&before=" + encodeURIComponent(cursor.before) + "&beforeId=" + encodeURIComponent(cursor.id) : "") : ""}`,
          { cache: "no-store" },
        ),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (request !== sequence.current) return;
      if (selected) {
        setMessages((m) => (older ? [...m, ...d.messages] : d.messages));
        setCursor(d.nextBefore ? { before: d.nextBefore, id: d.nextId } : null);
      } else setThreads(d.threads);
    } catch (e) {
      if (request === sequence.current)
        setError(e instanceof Error ? e.message : "تعذر تحميل المحادثة.");
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load("");
    return () => {
      sequence.current++;
    };
  }, []);
  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm text-muted-foreground">
        رسائل تطبيق WhatsApp Business تظهر هنا مع رسائل الحملات. تواصل الصيدلية
        استخدام تطبيقها المعتاد للرد. لا تُضاف جهات الاتصال تلقائيًا إلى سجل
        المرضى أو موافقات التسويق.
      </p>
      {error && <WaNotice tone="error">{error}</WaNotice>}
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="space-y-2 rounded-xl border border-border p-3">
          <Button
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={() => void load("")}
          >
            تحديث المحادثات
          </Button>
          {threads.map((t) => (
            <button
              key={t.phone}
              className={`w-full rounded-lg p-3 text-right text-sm ${phone === t.phone ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              onClick={() => {
                setPhone(t.phone);
                setMessages([]);
                void load(t.phone);
              }}
            >
              <span dir="ltr">+{t.phone}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {new Date(t.lastAt).toLocaleString("ar-IQ")}
              </span>
            </button>
          ))}
          {!loading && !threads.length && (
            <p className="p-3 text-sm text-muted-foreground">
              لا توجد محادثات مستلمة بعد.
            </p>
          )}
        </div>
        <div className="space-y-3 rounded-xl border border-border p-4">
          {!phone ? (
            <p className="text-sm text-muted-foreground">
              اختر محادثة لعرض رسائلها.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span dir="ltr" className="font-semibold">
                  +{phone}
                </span>
                <Button
                  variant="ghost"
                  disabled={loading}
                  onClick={() => void load(phone)}
                >
                  تحديث
                </Button>
              </div>
              {loading && (
                <p role="status" className="text-sm text-muted-foreground">
                  جارٍ التحميل…
                </p>
              )}
              {[...messages].reverse().map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[90%] rounded-xl p-3 ${m.direction === "OUT" ? "mr-auto bg-primary/10" : "ml-auto bg-muted"}`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {m.body}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {m.source === "BUSINESS_APP"
                      ? "من تطبيق الصيدلية"
                      : m.source === "API"
                        ? "من فاراماس"
                        : m.source === "HISTORY"
                          ? "سجل سابق"
                          : "رسالة العميل"}{" "}
                    · {new Date(m.sentAt).toLocaleString("ar-IQ")}
                  </p>
                </div>
              ))}
              {cursor && (
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => void load(phone, true)}
                >
                  عرض رسائل أقدم
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
