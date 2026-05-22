export const dynamic = 'force-dynamic';


import { prisma } from "@/app/lib/prisma";
import { UpdateUser, DeleteUser } from "@/app/ui/users/buttons";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { BranchFilter } from '@/app/ui/reports/branch-filter';


export default async function Page({ searchParams }: { searchParams: { branch?: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere } = tenantCtx;

    const selectedBranchId = searchParams.branch || '';

    const users = await prisma.user.findMany({
        where: {
            ...tenantBranchWhere,
            ...(selectedBranchId ? { branchId: selectedBranchId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: { branch: true },
    }).catch(() => []);

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground">المستخدمين</h1>
            </div>

            {/* فلتر الفروع */}
            <div className="mb-5">
                <BranchFilter currentBranch={selectedBranchId || undefined} baseUrl="/dashboard/users" />
            </div>

            <div className="mt-4 flow-root">
                <div className="overflow-x-auto">
                    <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                        <table className="min-w-full text-foreground">
                            <thead className="bg-muted text-right text-sm font-semibold text-foreground border-b border-border">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الاسم
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        البريد الإلكتروني
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الدور
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الفرع
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الإجراءات
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-card">
                                {users.map((user: any) => (
                                    <tr
                                        key={user.id}
                                        className="hover:bg-muted transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <div className="flex items-center gap-3">
                                                <div className="font-medium text-foreground">{user.name || 'بدون اسم'}</div>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground font-mono text-sm text-right" dir="ltr">
                                            {user.email}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-blue-700/10">
                                                {user.role === 'ADMIN' ? 'مدير' : user.role === 'PHARMACIST' ? 'صيدلي' : 'كاشير'}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground text-right">
                                            {user.branch?.name || '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <div className="flex gap-2">
                                                <UpdateUser id={user.id} />
                                                <DeleteUser id={user.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                                            لا يوجد مستخدمين حتى الآن.
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
