import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Button } from "@faramace/ui";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getBranches() {
    return await prisma.branch.findMany({
        orderBy: { name: 'asc' },
    });
}

async function createUser(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const role = formData.get("role") as "ADMIN" | "PHARMACIST" | "CASHIER";
    const branchId = formData.get("branchId") as string | null;

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role,
            branchId: branchId || null,
        },
    });

    revalidatePath("/dashboard/users");
    redirect("/dashboard/users");
}

export default async function CreateUserPage() {
    const branches = await getBranches();

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/users">
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold font-cairo text-gray-800">إضافة مستخدم جديد</h1>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
                <form action={createUser} className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                                الاسم
                            </label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                required
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                placeholder="أدخل اسم المستخدم"
                            />
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                البريد الإلكتروني
                            </label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                required
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                placeholder="example@email.com"
                                dir="ltr"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                كلمة المرور
                            </label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                required
                                minLength={6}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                placeholder="أدخل كلمة المرور"
                                dir="ltr"
                            />
                        </div>

                        <div>
                            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                                الدور
                            </label>
                            <select
                                id="role"
                                name="role"
                                required
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                            >
                                <option value="PHARMACIST">صيدلي</option>
                                <option value="CASHIER">كاشير</option>
                                <option value="ADMIN">مدير</option>
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label htmlFor="branchId" className="block text-sm font-medium text-gray-700 mb-2">
                                الفرع (اختياري)
                            </label>
                            <select
                                id="branchId"
                                name="branchId"
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
                            >
                                <option value="">-- بدون فرع --</option>
                                {branches.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                        <Button asChild variant="outline">
                            <Link href="/dashboard/users">إلغاء</Link>
                        </Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                            إنشاء المستخدم
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
