export const dynamic = 'force-dynamic';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import PermissionsEditor from '@/app/ui/users/permissions-editor';
import { redirect } from 'next/navigation';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';

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
        <div className="glass-card p-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground mb-6">🔐 إدارة الصلاحيات</h1>
            <PermissionsEditor users={users} />
        </div>
    );
}
