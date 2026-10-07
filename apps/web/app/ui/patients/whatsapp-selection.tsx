"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Send, ShieldCheck, UserMinus, Check, Loader2, X } from "lucide-react";
import { StatusPill, actionClass } from "@/app/ui/data-table";
import { WaDialog, WaNotice, WaField, fieldClass } from "./whatsapp-design";
import { CampaignComposer, waRequest } from "./whatsapp-ui";
type Selection = {
  mode: "ids" | "filtered";
  ids: string[];
  excludedIds: string[];
  search: string;
  branchId?: string;
};
type Context = {
  selected: (id: string) => boolean;
  toggle: (id: string) => void;
  consent: (id: string) => void;
  enabled: boolean;
  canConsent: boolean;
  toolbar: ReactNode;
};
const SelectContext = createContext<Context | null>(null);
export function WhatsAppSelection({
  children,
  ids,
  total,
  search,
  branchId,
  organizationId,
  userId,
  enabled,
  canEdit,
}: {
  children: ReactNode;
  ids: string[];
  total: number;
  search: string;
  branchId?: string;
  organizationId?: string;
  userId: string;
  enabled: boolean;
  canEdit: boolean;
}) {
  const [selection, setSelection] = useState<Selection>({
    mode: "ids",
    ids: [],
    excludedIds: [],
    search,
    branchId,
  });
  const [open, setOpen] = useState(false),
    [consentId, setConsentId] = useState(""),
    [evidence, setEvidence] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setSelection({ mode: "ids", ids: [], excludedIds: [], search, branchId });
  }, [search, branchId]);
  const selected = (id: string) =>
    selection.mode === "filtered"
      ? !selection.excludedIds.includes(id)
      : selection.ids.includes(id);
  const toggle = (id: string) =>
    setSelection((s) =>
      s.mode === "filtered"
        ? {
            ...s,
            excludedIds: s.excludedIds.includes(id)
              ? s.excludedIds.filter((x) => x !== id)
              : [...s.excludedIds, id],
          }
        : {
            ...s,
            ids: s.ids.includes(id)
              ? s.ids.filter((x) => x !== id)
              : [...s.ids, id],
          },
    );
  const count =
    selection.mode === "filtered"
      ? Math.max(0, total - selection.excludedIds.length)
      : selection.ids.length;
  const consent = async (allowed: boolean) => {
    try {
      setBusy(true);
      setError("");
      await waRequest({
        action: "consent",
        patientId: consentId,
        allowed,
        evidence,
      });
      setConsentId("");
      setEvidence("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  };
  const toolbar =
    enabled && organizationId ? (
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"
        dir="rtl"
      >
        {enabled && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelection((s) => ({
                  ...s,
                  mode: "ids",
                  ids,
                  excludedIds: [],
                }))
              }
              className="text-muted-foreground"
            >
              تحديد الصفحة ({ids.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelection((s) => ({
                  ...s,
                  mode: "filtered",
                  ids: [],
                  excludedIds: [],
                }))
              }
              className="text-muted-foreground"
            >
              تحديد جميع نتائج البحث ({total})
            </Button>
            {count > 0 && (
              <>
                <StatusPill tone="primary">{count} محدد</StatusPill>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label="مسح التحديد"
                  onClick={() =>
                    setSelection((s) => ({
                      ...s,
                      mode: "ids",
                      ids: [],
                      excludedIds: [],
                    }))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              size="sm"
              disabled={!count}
              onClick={() => setOpen(true)}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              إرسال أو جدولة رسالة
            </Button>
          </div>
        )}
      </div>
    ) : null;
  return (
    <SelectContext.Provider
      value={{
        selected,
        toggle,
        toolbar,
        consent: (id) => {
          setConsentId(id);
          setError("");
        },
        enabled: enabled && !!organizationId,
        canConsent: enabled && canEdit && !!organizationId,
      }}
    >
      {children}
      {open && organizationId && (
        <CampaignComposer
          selection={selection}
          organizationId={organizationId}
          userId={userId}
          close={() => setOpen(false)}
        />
      )}
      {consentId && canEdit && (
        <WaDialog
          title="تفضيل التواصل عبر WhatsApp"
          label="موافقة التواصل"
          description="يسري الاختيار على رقم العميل داخل الصيدلية."
          icon={ShieldCheck}
          close={() => setConsentId("")}
          busy={busy}
          footer={
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConsentId("")}
              >
                إغلاق
              </Button>
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/5"
                disabled={busy || evidence.trim().length < 5}
                onClick={() => consent(false)}
              >
                <UserMinus className="h-4 w-4" />
                إلغاء الاشتراك
              </Button>
              <Button
                className="gap-2"
                disabled={busy || evidence.trim().length < 5}
                onClick={() => consent(true)}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                تسجيل الموافقة
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <WaNotice>
              سجّل موافقة حصلت عليها بالفعل، مع مصدرها وتاريخها. وجود رقم الهاتف
              وحده لا يعني الموافقة.
            </WaNotice>
            <WaField label="دليل الموافقة أو سبب الإلغاء">
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                className={`${fieldClass} min-h-28 resize-y leading-7`}
                placeholder="مثال: موافقة مكتوبة بتاريخ ..."
                rows={4}
                maxLength={500}
              />
            </WaField>
            {error && <WaNotice tone="error">{error}</WaNotice>}
          </div>
        </WaDialog>
      )}
    </SelectContext.Provider>
  );
}
export function WhatsAppToolbar() {
  return useContext(SelectContext)?.toolbar ?? null;
}
export function PatientWhatsAppCheckbox({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const s = useContext(SelectContext);
  return s?.enabled ? (
    <input
      type="checkbox"
      aria-label={`تحديد ${name} لرسالة WhatsApp`}
      checked={s.selected(id)}
      onChange={() => s.toggle(id)}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/30"
    />
  ) : null;
}
export function PatientWhatsAppConsent({ id }: { id: string }) {
  const s = useContext(SelectContext);
  return s?.canConsent ? (
    <button
      type="button"
      title="موافقة WhatsApp"
      aria-label="موافقة WhatsApp"
      className={actionClass("primary")}
      onClick={() => s.consent(id)}
    >
      <ShieldCheck className="h-4 w-4" />
    </button>
  ) : null;
}
