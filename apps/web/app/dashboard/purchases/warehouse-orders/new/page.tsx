// المرحلة 4 من ميزة المذاخر: صفحة «طلب أدوية من المذاخر».
// أُعيد بناء التدفق في المرحلة 3 من خطة «طلب الأدوية حسب الاحتياج»: بدل اختيار
// مذخر ثم تصفّح كتالوجه، يكتب المستخدم احتياجه ثم يختار المورد لكل صنف.
//
// النطاق يُحسَم هنا في الخادم ويُمرَّر كخصائص: الفرع المفروض على المستخدم لا
// يتجاوزه العميل (§64/§149)، وقائمة الفروع المسموح بها تُبنى من مؤسسة السياق.
import { getTenantContext } from '@/app/lib/tenant-utils';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import { prisma } from '@/app/lib/prisma';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import NeedListClient from './NeedListClient';

export const dynamic = 'force-dynamic';

export default async function WarehouseOrderCreatePage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');

    const { organizationId } = tenantCtx;
    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'warehouseManagement');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    if (!tenantCtx.userPermissions.canCreateWarehouseOrder) {
        return (
            <div dir="rtl" className="rounded-xl border border-border bg-card p-10 text-center">
                <p className="text-sm text-muted-foreground">
                    ليس لديك صلاحية إنشاء المشتريات، فلا يمكنك تكوين طلب من المذاخر.
                </p>
            </div>
        );
    }

    // المستخدم المقيَّد بفرع لا يرى غيره؛ ومستخدم المؤسسة يختار من فروعها (§63/§64).
    const fixedBranchId = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(tenantCtx.user.role) ? null : tenantCtx.user.branchId ?? null;
    const branches = organizationId
        ? await prisma.branch.findMany({
              where: {
                  organizationId,
                  ...(fixedBranchId ? { id: fixedBranchId } : {}),
              },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
          })
        : [];

    return (
        <NeedListClient
            userId={tenantCtx.user.id}
            organizationId={organizationId ?? ''}
            fixedBranchId={fixedBranchId}
            branches={branches}
        />
    );
}
