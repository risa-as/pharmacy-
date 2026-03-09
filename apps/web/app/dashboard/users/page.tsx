export const dynamic = 'force-dynamic';


import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { UpdateUser, DeleteUser } from "@/app/ui/users/buttons";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';


async function getUsers(tenantBranchWhere: any) {
    const users = await prisma.user.findMany({
        where: tenantBranchWhere,
        orderBy: { createdAt: 'desc' },
        include: {
            branch: true,
        }
    });
    return users;
}

export default async function Page() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere } = tenantCtx;

    let users = [];
    try {
        users = await getUsers(tenantBranchWhere);
    } catch (e) {
        console.error('[Users Page] Failed to load users:', e);
        // Do NOT fall back to unscoped query — return empty list instead
    }

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground">المستخدمين</h1>
                <Link href="/dashboard/users/create" className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
                    <PlusIcon className="h-4 w-4" />
                    <span className="hidden md:block">إضافة مستخدم</span>
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
