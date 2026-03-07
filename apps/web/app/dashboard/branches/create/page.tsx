import Form from "@/app/ui/branches/create-form";
import { prisma } from "@/app/lib/prisma";
import { Store } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function Page() {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");

  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <main className="mx-auto max-w-2xl" suppressHydrationWarning>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">إضافة فرع جديد</h1>
          <p className="text-sm text-muted-foreground">سجل فرع جديد للمنظمة</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <Form organizations={organizations} />
      </div>
    </main>
  );
}
