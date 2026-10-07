"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  Search,
  Copy,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import StatCard from "@/app/ui/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import {
  endingSoon,
  filterTenants,
  tenantHref,
  type Tenant,
  type TenantPlan,
} from "@/app/lib/admin-tenants";
import TenantTable from "./tenant-table";
import TenantDialog from "./tenant-dialog";
import TenantForm from "./tenant-form";
import TenantPaymentDialog from "./tenant-payment-dialog";

export default function TenantDirectory() {
  const [tenants, setTenants] = useState<Tenant[]>([]),
    [plans, setPlans] = useState<TenantPlan[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [plan, setPlan] = useState("all");
  const [page, setPage] = useState(1),
    [creating, setCreating] = useState(false),
    [formBusy, setFormBusy] = useState(false),
    [renewing, setRenewing] = useState<Tenant | null>(null);
  const [provision, setProvision] = useState<{
    id: string;
    name: string;
    ownerEmail: string;
    licenseKey: string;
  } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/tenants?view=compact", {
        cache: "no-store",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "تعذر تحميل المؤسسات.");
      setTenants(data.tenants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المؤسسات.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const directoryPlans = useMemo(
    () =>
      Array.from(
        new Map(
          tenants.filter((t) => t.plan).map((t) => [t.plan!.id, t.plan!]),
        ).values(),
      ),
    [tenants],
  );
  const filtered = useMemo(
    () => filterTenants(tenants, search, status, plan),
    [tenants, search, status, plan],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 25)),
    currentPage = Math.min(page, pages);
  useEffect(() => {
    setPage(1);
  }, [search, status, plan]);
  async function openCreate() {
    try {
      const r = await fetch("/api/admin/plans");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "تعذر تحميل الخطط.");
      setPlans(data.success ? data.data : Array.isArray(data) ? data : []);
      setCreating(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر فتح النموذج.");
    }
  }
  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Building2 className="h-6 w-6 text-primary" />
            المؤسسات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تابع الاشتراكات، وافتح المؤسسة لإدارة إعداداتها وخدماتها.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            aria-label="تحديث المؤسسات"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => void openCreate()}>
            <Plus className="ml-2 h-4 w-4" />
            إضافة مؤسسة
          </Button>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="إجمالي المؤسسات"
          value={
            (loading || !!error) && tenants.length === 0 ? "—" : tenants.length
          }
          icon={Building2}
          tone="primary"
        />
        <StatCard
          label="المؤسسات الفعالة"
          value={
            (loading || !!error) && tenants.length === 0
              ? "—"
              : tenants.filter((t) => t.isActive).length
          }
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="تنتهي خلال 7 أيام"
          value={
            (loading || !!error) && tenants.length === 0
              ? "—"
              : tenants.filter((t) => endingSoon(t)).length
          }
          icon={Clock3}
          tone="warning"
        />
      </div>
      {provision && (
        <section
          role="status"
          className="relative space-y-3 rounded-xl border border-success/25 bg-success/5 p-5"
        >
          <Button
            size="icon"
            variant="ghost"
            className="absolute left-2 top-2"
            aria-label="إغلاق نتيجة الإنشاء"
            onClick={() => setProvision(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          <p className="font-semibold text-success">
            أُنشئت {provision.name} بنجاح
          </p>
          <p className="text-sm">
            بريد المالك: <bdi>{provision.ownerEmail}</bdi>
          </p>
          <p className="text-xs text-muted-foreground">
            مفتاح ترخيص الفرع الرئيسي
          </p>
          <div className="flex max-w-lg items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 break-all rounded-lg border bg-card p-3 text-sm"
            >
              {provision.licenseKey}
            </code>
            <Button
              size="icon"
              variant="outline"
              aria-label="نسخ مفتاح الترخيص"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(provision.licenseKey);
                  toast.success("نُسخ المفتاح.");
                } catch {
                  toast.error("تعذر النسخ؛ انسخ المفتاح يدويًا.");
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={tenantHref(provision.id)}>إدارة المؤسسة</Link>
          </Button>
        </section>
      )}
      <section
        aria-label="سجل المؤسسات"
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">سجل المؤسسات</h2>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {filtered.length}
            </span>
          </div>
          {(search || status !== "all" || plan !== "all") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setPlan("all");
              }}
            >
              <X className="h-3.5 w-3.5" />
              مسح الفلاتر
            </Button>
          )}
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              البحث عن مؤسسة
            </span>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اسم المؤسسة أو بريد المالك"
                aria-label="البحث في المؤسسات"
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              />
              {search && (
                <button
                  type="button"
                  aria-label="مسح البحث"
                  onClick={() => setSearch("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              الحالة
            </span>
            <div className="relative">
              <SlidersHorizontal
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <select
                aria-label="حالة المؤسسة"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-input bg-background pl-8 pr-9 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              >
                <option value="all">جميع الحالات</option>
                <option value="active">فعالة</option>
                <option value="suspended">معلّقة</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              الخطة
            </span>
            <div className="relative">
              <Layers
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <select
                aria-label="خطة المؤسسة"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-input bg-background pl-8 pr-9 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              >
                <option value="all">جميع الخطط</option>
                {directoryPlans.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </label>
        </div>
        {error && (
          <div
            role="alert"
            className="mx-5 mb-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}{" "}
            <button className="underline" onClick={() => void load()}>
              إعادة المحاولة
            </button>
          </div>
        )}
        {loading && tenants.length === 0 ? (
          <p
            role="status"
            className="border-t py-12 text-center text-sm text-muted-foreground"
          >
            جارٍ تحميل المؤسسات…
          </p>
        ) : (
          <>
            <TenantTable
              tenants={filtered.slice((currentPage - 1) * 25, currentPage * 25)}
              onRenew={setRenewing}
            />
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/15 px-5 py-3.5">
              <p className="text-xs text-muted-foreground">
                عرض{" "}
                <span className="font-medium text-foreground">
                  {filtered.length ? (currentPage - 1) * 25 + 1 : 0}–
                  {Math.min(currentPage * 25, filtered.length)}
                </span>{" "}
                من{" "}
                <span className="font-medium text-foreground">
                  {filtered.length}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 rounded-lg bg-card text-xs"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  السابق
                </Button>
                <span className="px-2 text-xs text-muted-foreground">
                  {currentPage} / {pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 rounded-lg bg-card text-xs"
                  disabled={currentPage === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  التالي
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </div>
            </footer>
          </>
        )}
      </section>
      {creating && (
        <TenantDialog
          title="إضافة مؤسسة"
          busy={formBusy}
          onClose={() => setCreating(false)}
          wide
        >
          <TenantForm
            onBusyChange={setFormBusy}
            plans={plans}
            onCancel={() => setCreating(false)}
            onSaved={(data) => {
              setCreating(false);
              setProvision(data.tenant);
              void load();
            }}
          />
        </TenantDialog>
      )}
      {renewing && (
        <TenantPaymentDialog
          key={renewing.id}
          tenant={renewing}
          onClose={() => setRenewing(null)}
          onSaved={() => {
            setRenewing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
