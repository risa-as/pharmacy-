export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { Gift, Award, Users, TrendingUp, Star, Crown, Medal } from "lucide-react";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function LoyaltyDashboardPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere, organizationId } = tenantCtx;

    // 1. Get settings from Organization
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId || '' },
        select: { loyaltyEnabled: true, loyaltyPointsPerDinar: true, loyaltyRedemptionValue: true, loyaltyMinRedemption: true }
    });
    const settings = organization || {};

    // 2. Get loyalty stats
    const totalAccounts = await prisma.loyaltyAccount.count({
        where: { patient: { ...tenantBranchWhere } }
    });
    const accounts = await prisma.loyaltyAccount.findMany({
        where: { patient: { ...tenantBranchWhere } },
        include: {
            patient: { select: { name: true, phone: true } },
            transactions: {
                orderBy: { createdAt: "desc" },
                take: 3,
            },
        },
        orderBy: { lifetimePoints: "desc" },
        take: 20,
    });

    const totalPointsOutstanding = accounts.reduce((s: any, a: any) => s + a.totalPoints, 0);
    const totalLifetimePoints = accounts.reduce((s: any, a: any) => s + a.lifetimePoints, 0);

    const tierCounts = {
        BRONZE: accounts.filter((a: any) => a.tier === "BRONZE").length,
        SILVER: accounts.filter((a: any) => a.tier === "SILVER").length,
        GOLD: accounts.filter((a: any) => a.tier === "GOLD").length,
    };

    const tierInfo: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
        BRONZE: { label: "برونزي", emoji: "🥉", color: "text-warning", bg: "bg-warning/10 border-orange-200" },
        SILVER: { label: "فضي", emoji: "🥈", color: "text-muted-foreground", bg: "bg-muted border-border" },
        GOLD: { label: "ذهبي", emoji: "🥇", color: "text-warning", bg: "bg-warning/10 border-warning/30" },
    };

    const loyaltyEnabled = (settings as any).loyaltyEnabled ?? false;
    const pointsPerDinar = (settings as any).loyaltyPointsPerDinar ?? 0.01;
    const redemptionValue = (settings as any).loyaltyRedemptionValue ?? 2.5;
    const minRedemption = (settings as any).loyaltyMinRedemption ?? 500;

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                    <Gift className="w-8 h-8 text-info" />
                    🎁 برنامج الولاء
                </h1>
                <Link
                    href="/dashboard/loyalty/settings"
                    className="px-4 py-2 bg-info text-info-foreground rounded-lg font-bold text-sm hover:bg-info/90 transition-all"
                >
                    ⚙️ إعدادات البرنامج
                </Link>
            </div>

            {/* Status Banner */}
            {!loyaltyEnabled && (
                <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                        <p className="font-bold text-warning">برنامج الولاء غير مفعّل حالياً</p>
                        <p className="text-sm text-warning/80">
                            يمكنك تفعيله من{" "}
                            <Link href="/dashboard/loyalty/settings" className="underline font-bold">
                                صفحة الإعدادات
                            </Link>
                        </p>
                    </div>
                </div>
            )}

            {/* Current Settings */}
            <div className="bg-gradient-to-l from-info to-primary/80 rounded-2xl p-6 text-primary-foreground shadow-lg">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Star className="w-5 h-5" />
                    إعدادات النظام الحالية
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-card/10 rounded-xl p-4 backdrop-blur-sm">
                        <div className="text-primary-foreground/70 text-sm mb-1">معدل الكسب</div>
                        <div className="text-xl font-bold">{Math.round(1000 * pointsPerDinar)} نقطة / 1000 د.ع</div>
                    </div>
                    <div className="bg-card/10 rounded-xl p-4 backdrop-blur-sm">
                        <div className="text-primary-foreground/70 text-sm mb-1">قيمة النقطة</div>
                        <div className="text-xl font-bold">{redemptionValue} د.ع</div>
                    </div>
                    <div className="bg-card/10 rounded-xl p-4 backdrop-blur-sm">
                        <div className="text-primary-foreground/70 text-sm mb-1">الحد الأدنى للاستبدال</div>
                        <div className="text-xl font-bold">{minRedemption} نقطة</div>
                    </div>
                    <div className="bg-card/10 rounded-xl p-4 backdrop-blur-sm">
                        <div className="text-primary-foreground/70 text-sm mb-1">الحالة</div>
                        <div className="text-xl font-bold">{loyaltyEnabled ? "✅ مفعّل" : "❌ معطّل"}</div>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Users className="w-4 h-4" />
                        إجمالي الأعضاء
                    </div>
                    <div className="text-3xl font-bold text-foreground">{totalAccounts}</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Star className="w-4 h-4" />
                        إجمالي النقاط النشطة
                    </div>
                    <div className="text-2xl font-bold text-info">{totalPointsOutstanding.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">قيمة تقديرية: {(totalPointsOutstanding * redemptionValue).toLocaleString()} د.ع</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingUp className="w-4 h-4" />
                        نقاط ممنوحة (مدى الحياة)
                    </div>
                    <div className="text-2xl font-bold text-success">{totalLifetimePoints.toLocaleString()}</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Award className="w-4 h-4" />
                        توزيع الطبقات
                    </div>
                    <div className="flex gap-3 mt-1">
                        <span className="text-sm">🥉 {tierCounts.BRONZE}</span>
                        <span className="text-sm">🥈 {tierCounts.SILVER}</span>
                        <span className="text-sm">🥇 {tierCounts.GOLD}</span>
                    </div>
                </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-l from-yellow-50 to-orange-50">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        <Crown className="w-5 h-5 text-warning" />
                        🏆 قائمة المتصدرين
                    </h2>
                </div>
                {accounts.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Gift className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا يوجد أعضاء في برنامج الولاء بعد</p>
                        <p className="text-sm mt-2">سيتم إنشاء الحسابات تلقائياً عند ربط المبيعات بالمرضى</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">#</th>
                                <th className="px-4 py-3 text-right font-bold">العضو</th>
                                <th className="px-4 py-3 text-right font-bold">الطبقة</th>
                                <th className="px-4 py-3 text-right font-bold">النقاط الحالية</th>
                                <th className="px-4 py-3 text-right font-bold">نقاط مدى الحياة</th>
                                <th className="px-4 py-3 text-right font-bold">آخر معاملة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {accounts.map((acc: any, index: any) => {
                                const tier = tierInfo[acc.tier] || tierInfo.BRONZE;
                                const lastTx = acc.transactions[0];
                                const rankEmojis = ["🥇", "🥈", "🥉"];
                                return (
                                    <tr key={acc.id} className="hover:bg-muted transition-colors">
                                        <td className="px-4 py-3 text-center">
                                            {index < 3 ? (
                                                <span className="text-xl">{rankEmojis[index]}</span>
                                            ) : (
                                                <span className="font-bold text-muted-foreground">{index + 1}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-foreground">{acc.patient.name}</div>
                                            <div className="text-xs text-muted-foreground font-mono" dir="ltr">{acc.patient.phone}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${tier.bg} ${tier.color}`}>
                                                {tier.emoji} {tier.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-info">
                                            {acc.totalPoints.toLocaleString()} <span className="text-xs text-muted-foreground">نقطة</span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {acc.lifetimePoints.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground" suppressHydrationWarning>
                                            {lastTx ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className={`font-bold ${lastTx.type === "EARN" ? "text-success" : "text-destructive"}`}>
                                                        {lastTx.type === "EARN" ? "+" : ""}{lastTx.points.toLocaleString()} نقطة
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(lastTx.createdAt).toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" })}
                                                    </span>
                                                </div>
                                            ) : "-"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Info */}
            <div className="bg-primary/10 p-4 rounded-lg text-sm text-primary">
                <strong>كيف يعمل البرنامج:</strong> عند إتمام عملية بيع مرتبطة بمريض مسجل، يكسب المريض نقاطاً تلقائياً. الأعضاء الذهبيون يكسبون ضعف النقاط! يمكن للمريض استبدال نقاطه بخصم على المشتريات.
            </div>
        </div>
    );
}
