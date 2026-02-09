import { Button } from "@faramace/ui";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { UpdateUser, DeleteUser } from "@/app/ui/users/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getUsers() {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            branch: true,
        }
    });
    return users;
}

export default async function Page() {
    const users = await getUsers();

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800">المستخدمين</h1>
                <Button asChild className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Link href="/dashboard/users/create">
                        <PlusIcon className="h-4 w-4" />
                        <span className="hidden md:block font-bold">إضافة مستخدم</span>
                    </Link>
                </Button>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                        <table className="min-w-full text-gray-900">
                            <thead className="bg-gray-50 text-right text-sm font-semibold text-gray-900 border-b border-gray-200">
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
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {users.map((user) => (
                                    <tr
                                        key={user.id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <div className="flex items-center gap-3">
                                                <div className="font-medium text-gray-900">{user.name || 'بدون اسم'}</div>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500 font-mono text-sm text-right" dir="ltr">
                                            {user.email}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                                {user.role === 'ADMIN' ? 'مدير' : user.role === 'PHARMACIST' ? 'صيدلي' : 'كاشير'}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500 text-right">
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
                                        <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
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
