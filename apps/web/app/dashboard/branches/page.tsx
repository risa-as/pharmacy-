import { Button } from "@faramace/ui";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { UpdateBranch, DeleteBranch } from "@/app/ui/branches/buttons";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function Page() {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantWhere } = tenantCtx;

  const branches = await prisma.branch.findMany({
    where: tenantWhere,
    orderBy: { createdAt: 'desc' },
    include: { organization: true }
  });

  return (
    <div className="glass-card w-full p-6" suppressHydrationWarning>
      <div className="flex w-full items-center justify-between mb-8">
        <h1 className="text-2xl font-bold font-cairo text-foreground">الفروع</h1>
        <Link href="/dashboard/branches/create" className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
          <PlusIcon className="h-4 w-4" />
          <span className="hidden md:block">إضافة فرع</span>
        </Link>
      </div>

      <div className="mt-4 flow-root">
        <div className="inline-block min-w-full align-middle">
          <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <table className="min-w-full text-foreground">
              <thead className="bg-muted text-right text-sm font-semibold text-foreground border-b border-border">
                <tr>
                  <th scope="col" className="px-6 py-4 font-cairo text-right">
                    الاسم
                  </th>
                  <th scope="col" className="px-6 py-4 font-cairo text-right">
                    المنظمة
                  </th>
                  <th scope="col" className="px-6 py-4 font-cairo text-right">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-card">
                {branches.map((branch: any) => (
                  <tr
                    key={branch.id}
                    className="hover:bg-muted transition-colors"
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center gap-3">
                        <div className="font-medium text-foreground">{branch.name}</div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground text-right">
                      {branch.organization.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex gap-2">
                        <UpdateBranch id={branch.id} />
                        <DeleteBranch id={branch.id} />
                      </div>
                    </td>
                  </tr>
                ))}
                {branches.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center text-muted-foreground">
                      لا توجد فروع حتى الآن.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
