"use client";
import Link from "next/link";
import {
  ArrowUpLeft,
  Building2,
  CalendarDays,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { tenantDate, tenantHref, type Tenant } from "@/app/lib/admin-tenants";
export default function TenantTable({
  tenants,
  onRenew,
}: {
  tenants: Tenant[];
  onRenew: (t: Tenant) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] text-right text-sm">
        <caption className="sr-only">
          المؤسسات وخططها وحالاتها ومواعيد انتهاء الاشتراك
        </caption>
        <thead className="border-y border-border bg-muted/35 text-xs text-muted-foreground">
          <tr>
            {["المؤسسة", "الخطة", "الحالة", "انتهاء الاشتراك", "إجراءات"].map(
              (h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-5 py-3.5 font-medium whitespace-nowrap ${i === 4 ? "text-left" : "text-right"}`}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tenants.map((t) => {
            const end = t.subscriptionEndsAt
              ? new Date(t.subscriptionEndsAt).getTime()
              : NaN;
            const expired = end < Date.now(),
              soon = !expired && end <= Date.now() + 7 * 86400000;
            return (
              <tr key={t.id} className="transition-colors hover:bg-muted/20">
                <td className="px-5 py-4 align-middle">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-primary/5 text-primary"
                    >
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={tenantHref(t.id)}
                        prefetch={false}
                        className="block max-w-[240px] truncate font-semibold text-foreground transition-colors hover:text-primary"
                        title={t.name}
                      >
                        {t.name}
                      </Link>
                      <p
                        className="mt-1 max-w-[240px] truncate text-xs text-muted-foreground"
                        title={t.ownerEmail}
                      >
                        <bdi>{t.ownerEmail}</bdi>
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <span className="inline-flex whitespace-nowrap rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground">
                    {t.plan?.name ?? "غير محددة"}
                  </span>
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${t.isActive ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-current"
                      />
                      {t.isActive ? "فعالة" : "معلّقة"}
                    </span>
                    {t.isTrial && (
                      <span className="inline-flex whitespace-nowrap rounded-full border border-info/20 bg-info/5 px-2.5 py-1 text-xs font-medium text-info">
                        تجريبية
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="space-y-1">
                    <span
                      className={`inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium ${expired ? "text-destructive" : soon ? "text-warning" : "text-foreground"}`}
                    >
                      <CalendarDays
                        aria-hidden="true"
                        className="h-3.5 w-3.5 opacity-60"
                      />
                      <span dir="ltr">{tenantDate(t.subscriptionEndsAt)}</span>
                    </span>
                    {(expired || soon) && (
                      <p
                        className={`pr-5 text-[11px] ${expired ? "text-destructive/80" : "text-warning"}`}
                      >
                        {expired ? "انتهى الاشتراك" : "قريب الانتهاء"}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 align-middle">
                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 rounded-lg border-border bg-card px-3 text-xs"
                    >
                      <Link
                        href={tenantHref(t.id)}
                        prefetch={false}
                        aria-label={`إدارة ${t.name}`}
                      >
                        إدارة
                        <ArrowUpLeft
                          aria-hidden="true"
                          className="h-3.5 w-3.5 text-muted-foreground"
                        />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 rounded-lg bg-primary/5 px-3 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={() => onRenew(t)}
                      aria-label={`تجديد اشتراك ${t.name}`}
                    >
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                      تجديد
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tenants.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
          <SearchX
            aria-hidden="true"
            className="mb-1 h-7 w-7 text-muted-foreground/50"
          />
          <p className="text-sm font-medium">لا توجد مؤسسات تطابق البحث</p>
          <p className="text-xs text-muted-foreground">
            جرّب اسمًا آخر أو امسح الفلاتر المحددة.
          </p>
        </div>
      )}
    </div>
  );
}
