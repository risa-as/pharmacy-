import { PrismaClient } from "@prisma/client";
import { Store, Pill, Package, AlertTriangle, Users, Building2, Bell, BarChart3 } from "lucide-react";
import Link from "next/link";
import { getAlertStats } from "@/app/lib/alerts";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getStats() {
    const [orgCount, branchCount, drugCount, inventoryCount, userCount] = await Promise.all([
        prisma.organization.count(),
        prisma.branch.count(),
        prisma.globalDrug.count(),
        prisma.inventory.count(),
        prisma.user.count()
    ]);

    return { orgCount, branchCount, drugCount, inventoryCount, userCount };
}

export default async function Page() {
    const stats = await getStats();
    const alertStats = await getAlertStats();

    const cards = [
        { label: "المنظمات", value: stats.orgCount, icon: Building2, color: "blue", href: "/dashboard/organizations" },
        { label: "الفروع", value: stats.branchCount, icon: Store, color: "purple", href: "/dashboard/branches" },
        { label: "الأدوية", value: stats.drugCount, icon: Pill, color: "green", href: "/dashboard/drugs" },
        { label: "المخزون", value: stats.inventoryCount, icon: Package, color: "orange", href: "/dashboard/inventory" },
        { label: "المستخدمين", value: stats.userCount, icon: Users, color: "pink", href: "/dashboard/users" },
    ];

    const colorClasses: Record<string, { bg: string; icon: string; text: string }> = {
        blue: { bg: "bg-blue-50", icon: "text-blue-600", text: "text-blue-600" },
        purple: { bg: "bg-purple-50", icon: "text-purple-600", text: "text-purple-600" },
        green: { bg: "bg-green-50", icon: "text-green-600", text: "text-green-600" },
        orange: { bg: "bg-orange-50", icon: "text-orange-600", text: "text-orange-600" },
        pink: { bg: "bg-pink-50", icon: "text-pink-600", text: "text-pink-600" },
    };

    return (
        <main suppressHydrationWarning>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-blue-700 to-indigo-700">
                        لوحة التحكم
                    </h1>
                    <p className="text-gray-500 text-sm">مرحباً بك في فاراماس - نظام إدارة الصيدليات</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
                {cards.map((card) => {
                    const Icon = card.icon;
                    const colors = colorClasses[card.color];
                    return (
                        <Link
                            key={card.label}
                            href={card.href}
                            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-gray-900/5 transition-all hover:shadow-md hover:scale-[1.02]"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-gray-500">{card.label}</h3>
                                <div className={`p-2 rounded-lg ${colors.bg}`}>
                                    <Icon className={`w-5 h-5 ${colors.icon}`} />
                                </div>
                            </div>
                            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                        </Link>
                    );
                })}
            </div>

            {/* Alerts Section */}
            {alertStats.total > 0 && (
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-red-500" />
                        تنبيهات تتطلب انتباهك
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {alertStats.expired > 0 && (
                            <Link href="/dashboard/alerts" className="bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                        <AlertTriangle className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-red-700">{alertStats.expired}</div>
                                        <div className="text-sm text-red-600">منتهي الصلاحية</div>
                                    </div>
                                </div>
                            </Link>
                        )}

                        {alertStats.expiring > 0 && (
                            <Link href="/dashboard/alerts" className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 hover:bg-yellow-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-yellow-700">{alertStats.expiring}</div>
                                        <div className="text-sm text-yellow-600">قارب على الانتهاء</div>
                                    </div>
                                </div>
                            </Link>
                        )}

                        {alertStats.lowStock > 0 && (
                            <Link href="/dashboard/alerts" className="bg-orange-50 border border-orange-200 rounded-xl p-4 hover:bg-orange-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                        <Package className="w-5 h-5 text-orange-600" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-orange-700">{alertStats.lowStock}</div>
                                        <div className="text-sm text-orange-600">نقص في المخزون</div>
                                    </div>
                                </div>
                            </Link>
                        )}
                    </div>
                </div>
            )}

            {/* Quick Links */}
            <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4">وصول سريع</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Link
                        href="/dashboard/reports"
                        className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 hover:border-blue-200 transition-all"
                    >
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">التقارير</h3>
                            <p className="text-sm text-gray-500">تقارير PDF للمبيعات والمخزون</p>
                        </div>
                    </Link>

                    <Link
                        href="/dashboard/alerts"
                        className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 hover:border-red-200 transition-all"
                    >
                        <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                            <Bell className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">التنبيهات</h3>
                            <p className="text-sm text-gray-500">{alertStats.total} تنبيه نشط</p>
                        </div>
                    </Link>

                    <Link
                        href="/dashboard/drugs"
                        className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 hover:border-green-200 transition-all"
                    >
                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                            <Pill className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">قاعدة الأدوية</h3>
                            <p className="text-sm text-gray-500">{stats.drugCount} دواء مسجل</p>
                        </div>
                    </Link>
                </div>
            </div>
        </main>
    );
}
