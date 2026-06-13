export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { Gift, Award, Users, TrendingUp, Star, Crown, Medal, Settings, AlertTriangle, Coins, Info } from "lucide-react";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import BranchLoyaltyToggle from '@/app/ui/loyalty/branch-loyalty-toggle';

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
        BRONZE: { label: "برونزي", emoji: "🥉", color: "text-warning", bg: "bg-warning/10 border-warning/20" },
        SILVER: { label: "فضي", emoji: "🥈", color: "text-muted-foreground", bg: "bg-muted border-border" },
        GOLD: { label: "ذهبي", emoji: "🥇", color: "text-amber-700", bg: "bg-amber-100 border-amber-300" },
    };

    const loyaltyEnabled = (settings as any).loyaltyEnabled ?? false;
    const pointsPerDinar = (settings as any).loyaltyPointsPerDinar ?? 0.01;
    const redemptionValue = (settings as any).loyaltyRedemptionValue ?? 2.5;
    const minRedemption = (settings as any).loyaltyMinRedemption ?? 500;

    // 3. Get branches for per-branch loyalty toggle
    const branches = organizationId ? await prisma.branch.findMany({
        where: { organizationId },
        select: { id: true, name: true, loyaltyEnabled: true },
        orderBy: { name: 'asc' },
    }) : [];

    const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

    const statCards = [
        { label: "إجمالي الأعضاء", value: totalAccounts.toLocaleString("en-US"), sub: "عضو مسجّل", icon: Users, tone: "text-primary", bg: "bg-primary/10" },
        { label: "النقاط النشطة", value: totalPointsOutstanding.toLocaleString("en-US"), sub: `≈ ${fmt(totalPointsOutstanding * redemptionValue)} د.ع`, icon: Star, tone: "text-info", bg: "bg-info/10" },
        { label: "نقاط مدى الحياة", value: totalLifetimePoints.toLocaleString("en-US"), sub: "إجمالي ممنوح", icon: TrendingUp, tone: "text-success", bg: "bg-success/10" },
        { label: "الأعضاء الذهبيون", value: tierCounts.GOLD.toLocaleString("en-US"), sub: "في الطبقة الذهبية", icon: Medal, tone: "text-warning", bg: "bg-warning/10" },
    ];

    const configItems = [
        { label: "معدل الكسب", value: `${Math.round(1000 * pointsPerDinar)} نقطة`, sub: "لكل 1,000 د.ع", icon: TrendingUp },
        { label: "قيمة النقطة", value: `${redemptionValue} د.ع`, sub: "عند الاستبدال", icon: Coins },
        { label: "الحد الأدنى للاستبدال", value: `${minRedemption} نقطة`, sub: `≈ ${fmt(minRedemption * redemptionValue)} د.ع`, icon: Award },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <Gift className="w-6 h-6 text-primary" />
                        برنامج الولاء
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">نقاط المكافآت، الطبقات، وقائمة المتصدرين</p>
                </div>
                <Link
                    href="/dashboard/loyalty/settings"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm shrink-0"
                >
                    <Settings className="h-4 w-4" />
                    إعدادات البرنامج
                </Link>
            </div>

            {/* تنبيه التعطيل */}
            {!loyaltyEnabled && (
                <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
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

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${card.tone}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">{card.label}</p>
                                <p className={`text-2xl font-bold ${card.tone}`} dir="ltr">{card.value}</p>
                                <p className="text-xs text-muted-foreground truncate">{card.sub}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* إعدادات النظام الحالية */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="font-bold text-foreground font-cairo leading-tight">إعدادات النظام الحالية</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">القيم المطبّقة على كسب واستبدال النقاط</p>
                        </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${loyaltyEnabled ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`}>
                        <span className={`w-2 h-2 rounded-full ${loyaltyEnabled ? "bg-success" : "bg-muted-foreground"}`} />
                        {loyaltyEnabled ? "مفعّل" : "معطّل"}
                    </span>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {configItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div key={item.label} className="rounded-xl border border-border bg-muted/30 p-4">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                    <Icon className="w-4 h-4" />
                                    {item.label}
                                </div>
                                <div className="text-xl font-bold text-foreground">{item.value}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* تفعيل الولاء حسب الفرع */}
            {branches.length > 1 && (
                <BranchLoyaltyToggle initialBranches={branches} orgLoyaltyEnabled={loyaltyEnabled} />
            )}

            {/* قائمة المتصدرين */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                            <Crown className="w-4 h-4 text-warning" />
                        </div>
                        <div>
                            <h2 className="font-bold text-foreground font-cairo leading-tight">قائمة المتصدرين</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">أعلى 20 عضواً حسب نقاط مدى الحياة</p>
                        </div>
                    </div>
                    {/* توزيع الطبقات */}
                    <div className="flex items-center gap-2">
                        {(["BRONZE", "SILVER", "GOLD"] as const).map((t) => (
                            <span key={t} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${tierInfo[t].bg} ${tierInfo[t].color}`}>
                                {tierInfo[t].emoji} {tierCounts[t]}
                            </span>
                        ))}
                    </div>
                </div>
                {accounts.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Gift className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-foreground font-medium">لا يوجد أعضاء في برنامج الولاء بعد</p>
                        <p className="text-sm text-muted-foreground mt-1">سيتم إنشاء الحسابات تلقائياً عند ربط المبيعات بالمرضى</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border">
                                <tr>
                                    <th className="px-4 py-3.5 text-center font-bold font-cairo">#</th>
                                    <th className="px-4 py-3.5 text-right font-bold font-cairo">العضو</th>
                                    <th className="px-4 py-3.5 text-right font-bold font-cairo">الطبقة</th>
                                    <th className="px-4 py-3.5 text-right font-bold font-cairo">النقاط الحالية</th>
                                    <th className="px-4 py-3.5 text-right font-bold font-cairo">نقاط مدى الحياة</th>
                                    <th className="px-4 py-3.5 text-right font-bold font-cairo">آخر معاملة</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                                {accounts.map((acc: any, index: any) => {
                                    const tier = tierInfo[acc.tier] || tierInfo.BRONZE;
                                    const lastTx = acc.transactions[0];
                                    const rankEmojis = ["🥇", "🥈", "🥉"];
                                    return (
                                        <tr key={acc.id} className="hover:bg-muted/40 transition-colors">
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
                                                            {new Date(lastTx.createdAt).toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Baghdad" })}
                                                        </span>
                                                    </div>
                                                ) : "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* كيف يعمل البرنامج */}
            <div className="glass-card p-5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
                    <Info className="w-4 h-4 text-info" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">كيف يعمل البرنامج:</strong> عند إتمام عملية بيع مرتبطة بمريض مسجل، يكسب المريض نقاطاً تلقائياً. الأعضاء الذهبيون يكسبون ضعف النقاط! يمكن للمريض استبدال نقاطه بخصم على المشتريات.
                </p>
            </div>
        </div>
    );
}
