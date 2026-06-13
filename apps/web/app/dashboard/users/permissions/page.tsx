export const dynamic = 'force-dynamic';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import PermissionsEditor from '@/app/ui/users/permissions-editor';
import { redirect } from 'next/navigation';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import { ShieldCheck } from 'lucide-react';

export default async function PermissionsPage() {
    const session = await auth();
    if (session?.user?.role !== 'ADMIN') {
        redirect('/dashboard');
    }

    const organizationId = (session?.user as any)?.organizationId;
    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'granularPermissions');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const users = await prisma.user.findMany({
        where: {
            role: { not: 'SUPER_ADMIN' },
            ...(organizationId ? { branch: { organizationId } } : {}),
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            permissions: true,
            branch: { select: { name: true } }
        },
        orderBy: { role: 'asc' }
    });

    return (
        <div className="space-y-6" dir="rtl">
            <div>
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                    إدارة الصلاحيات
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    تحكّم دقيق في صلاحيات كل مستخدم — اختر مستخدماً ثم فعّل أو عطّل الصلاحيات حسب الحاجة
                </p>
            </div>
            <PermissionsEditor users={users} />
        </div>
    );
}
