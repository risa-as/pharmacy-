import { prisma } from "@/app/lib/prisma";
import AuditLogClient from "@/app/ui/reports/audit-log-client";

export default async function AuditLogPage() {
    const users = await prisma.user.findMany({
        select: { id: true, name: true }
    });

    const branches = await prisma.branch.findMany({
        select: { id: true, name: true }
    });

    return (
        <div className="glass-card p-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground mb-6">📋 سجل النشاطات</h1>
            <AuditLogClient users={users} branches={branches} />
        </div>
    );
}
