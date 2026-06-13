import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { CreditCard, CheckCircle2, XCircle, Building2, PhoneCall, Lock, Users, Store, Smartphone, Key } from "lucide-react";
import SubscriptionStatusCard from "@/app/ui/billing/subscription-status-card";
import PaymentHistoryTable from "@/app/ui/billing/payment-history-table";
import RenewButton from "@/app/ui/billing/renew-button";
import { verifyZainCashPayment, sweepExpiredPendingTransactions } from "@/app/lib/actions/billing";
import { getPlatformSettings } from "@/app/lib/actions/platform-settings";
import type { PaymentTransactionRow } from "@/app/ui/billing/payment-history-table";

export const dynamic = "force-dynamic";

interface BillingPageProps {
    searchParams: { txn_id?: string };
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
    const session = await auth();
    const user = session?.user as
        | { role: string; branchId?: string }
        | undefined;

    // SUPER_ADMIN → direct them to the admin panel (they manage all orgs from there)
    if (user?.role === "SUPER_ADMIN") {
        return (
            <div className="w-full max-w-4xl mx-auto" dir="rtl">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 border-2 border-primary/20">
                        <Building2 className="w-10 h-10 text-primary/60" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">إدارة الاشتراكات</h2>
                    <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
                        بصفتك مشرف المنصة، يمكنك إدارة اشتراكات جميع المؤسسات والباقات من لوحة التحكم الإدارية.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <a
                            href="/dashboard/admin/tenants"
                            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl shadow-lg hover:bg-primary/90 transition-colors"
                        >
                            <Building2 className="w-5 h-5" />
                            إدارة المؤسسات
                        </a>
                        <a
                            href="/dashboard/admin/plans"
                            className="inline-flex items-center gap-2 bg-muted text-foreground font-bold px-6 py-3 rounded-xl border hover:bg-muted/80 transition-colors"
                        >
                            <CreditCard className="w-5 h-5" />
                            إدارة الباقات
                        </a>
                        <a
                            href="/dashboard/admin/payment-info"
                            className="inline-flex items-center gap-2 bg-muted text-foreground font-bold px-6 py-3 rounded-xl border hover:bg-muted/80 transition-colors"
                        >
                            <Building2 className="w-5 h-5" />
                            معلومات الدفع
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // PHARMACIST / CASHIER → show "contact admin" message
    if (user?.role !== "ADMIN") {
        return (
            <div className="w-full max-w-4xl mx-auto" dir="rtl">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 border-2 border-primary/20">
                        <Lock className="w-10 h-10 text-primary/60" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">الاشتراك والفوترة</h2>
                    <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
                        إدارة الاشتراك متاحة لمدير الصيدلية فقط. إذا أردت الترقية إلى باقة أعلى، يرجى التواصل مع مدير الحساب.
                    </p>
                    <div className="inline-flex items-center gap-2 bg-primary/10 text-primary font-bold px-6 py-3 rounded-xl border border-primary/20">
                        <PhoneCall className="w-5 h-5" />
                        تواصل مع مدير الصيدلية لترقية الباقة
                    </div>
                </div>
            </div>
        );
    }

    const branchId = user?.branchId;

    let planName: string | null = null;
    let subscriptionEndsAt: Date | null = null;
    let isSuspended = false;
    let organizationId: string | null = null;
    let transactions: PaymentTransactionRow[] = [];
    let planLimits: { maxBranches: number; maxUsers: number; maxDevices: number; maxMobileUsers: number } | null = null;
    let usageStats: { branches: number; users: number; activeDevices: number; activeMobile: number } | null = null;

    try {
        if (branchId) {
            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: {
                    organization: {
                        select: {
                            id: true,
                            isSuspended: true,
                            subscriptionEndsAt: true,
                            maxBranches: true,
                            maxUsers: true,
                            maxDevices: true,
                            maxMobileUsers: true,
                            plan: {
                                select: {
                                    name: true,
                                    maxBranches: true,
                                    maxUsers: true,
                                    maxDevices: true,
                                    maxMobileUsers: true,
                                },
                            },
                        },
                    },
                },
            });

            if (branch?.organization) {
                const org = branch.organization;
                isSuspended = org.isSuspended;
                subscriptionEndsAt = org.subscriptionEndsAt ?? null;
                planName = org.plan?.name ?? null;
                organizationId = org.id;

                // Effective limits: org override takes precedence over plan default
                planLimits = {
                    maxBranches: org.maxBranches ?? org.plan?.maxBranches ?? 1,
                    maxUsers: org.maxUsers ?? org.plan?.maxUsers ?? 3,
                    maxDevices: org.maxDevices ?? org.plan?.maxDevices ?? 1,
                    maxMobileUsers: org.maxMobileUsers ?? org.plan?.maxMobileUsers ?? 1,
                };

                // Fetch actual usage in parallel
                const [branchCount, userCount, activeDevices, activeMobile] = await Promise.all([
                    prisma.branch.count({ where: { organizationId: org.id } }),
                    prisma.user.count({ where: { branch: { organizationId: org.id } } }),
                    prisma.deviceLicense.count({ where: { branch: { organizationId: org.id }, isActive: true } }),
                    prisma.mobileSession.count({ where: { organizationId: org.id, isActive: true } }),
                ]);
                usageStats = { branches: branchCount, users: userCount, activeDevices, activeMobile };
            }
        }
    } catch (e) {
        console.error("[BillingPage] Failed to load organization data:", e);
    }

    // ── T020: Verify Zain Cash callback ───────────────────────────────────────
    // If the user returned from Zain Cash with a txn_id, verify server-side.
    type VerifyOutcome = "success" | "failed" | null;
    let verifyOutcome: VerifyOutcome = null;

    const txnId = searchParams.txn_id;
    if (txnId) {
        try {
            const result = await verifyZainCashPayment(txnId);
            verifyOutcome = result.success ? "success" : "failed";

            // Refresh org data if payment succeeded (isSuspended may have changed)
            if (result.success && branchId) {
                const branch = await prisma.branch.findUnique({
                    where: { id: branchId },
                    select: {
                        organization: {
                            select: {
                                isSuspended: true,
                                subscriptionEndsAt: true,
                            },
                        },
                    },
                });
                if (branch?.organization) {
                    isSuspended = branch.organization.isSuspended;
                    subscriptionEndsAt = branch.organization.subscriptionEndsAt ?? null;
                }
            }
        } catch (e) {
            console.error("[BillingPage] verifyZainCashPayment error:", e);
            verifyOutcome = "failed";
        }
    }

    // T022: Sweep stale PENDING transactions before rendering history
    if (organizationId) {
        await sweepExpiredPendingTransactions(organizationId);
    }

    // Fetch real payment transaction history (T015)
    try {
        if (organizationId) {
            const rawTxns = await prisma.paymentTransaction.findMany({
                where: { organizationId },
                orderBy: { initiatedAt: "desc" },
                take: 50,
                select: {
                    id: true,
                    amount: true,
                    currency: true,
                    gateway: true,
                    status: true,
                    renewalMonths: true,
                    initiatedAt: true,
                    completedAt: true,
                },
            });

            transactions = rawTxns as PaymentTransactionRow[];
        }
    } catch (e) {
        console.error("[BillingPage] Failed to load payment transactions:", e);
    }

    // Bank-transfer / support details configured by SUPER_ADMIN (with fallbacks).
    const payInfo = await getPlatformSettings();
    const bankName = payInfo.bankName ?? "بنك الرافدين";
    const accountHolder = payInfo.accountHolder ?? "شركة فاراماس للتقنية";
    const accountNumber = payInfo.accountNumber ?? "XXXX-XXXX-XXXX-XXXX";
    const workingHours = payInfo.workingHours ?? "9 صباحاً – 5 مساءً";
    // Shown under ZainCash / Super Key — both require sending the receipt to support.
    const whatsappNote = payInfo.supportPhone
        ? `يرجى إرسال صورة التحويل عبر واتساب إلى رقم الدعم: ${payInfo.supportPhone}`
        : "يرجى إرسال صورة التحويل عبر واتساب إلى رقم الدعم.";

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6">
            {/* Page header */}
            <div className="flex items-center gap-3">
                <div className="p-3 bg-muted rounded-xl">
                    <CreditCard className="w-7 h-7 text-foreground" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground">
                        الاشتراك والفوترة
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        إدارة خطة اشتراكك وتجديدها وعرض سجل المدفوعات
                    </p>
                </div>
            </div>

            {/* ── Payment result banner (shown only on Zain Cash return) ── */}
            {verifyOutcome === "success" && (
                <div
                    className="flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700"
                    dir="rtl"
                    role="alert"
                >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <div>
                        <p className="font-bold">تمّت عملية الدفع بنجاح!</p>
                        <p className="text-xs opacity-80 mt-0.5">
                            تم تجديد اشتراكك. يمكنك الآن الوصول إلى جميع الميزات.
                        </p>
                    </div>
                </div>
            )}

            {verifyOutcome === "failed" && (
                <div
                    className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    dir="rtl"
                    role="alert"
                >
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                        <p className="font-bold">فشلت عملية الدفع</p>
                        <p className="text-xs opacity-80 mt-0.5">
                            لم تكتمل عملية الدفع. يرجى المحاولة مجدداً أو التواصل مع الدعم.
                        </p>
                    </div>
                </div>
            )}

            {/* Subscription status card */}
            <SubscriptionStatusCard
                planName={planName}
                subscriptionEndsAt={subscriptionEndsAt}
                isSuspended={isSuspended}
            />

            {/* Plan usage stats */}
            {planLimits && usageStats && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4" dir="rtl">
                    <h2 className="font-bold text-base text-foreground">استخدام الباقة الحالية</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                            {
                                label: 'الفروع',
                                icon: Store,
                                used: usageStats.branches,
                                max: planLimits.maxBranches,
                                color: 'text-blue-500',
                                bar: 'bg-blue-500',
                            },
                            {
                                label: 'المستخدمون',
                                icon: Users,
                                used: usageStats.users,
                                max: planLimits.maxUsers,
                                color: 'text-violet-500',
                                bar: 'bg-violet-500',
                            },
                            {
                                label: 'أجهزة الكاشير',
                                icon: Key,
                                used: usageStats.activeDevices,
                                max: planLimits.maxDevices,
                                color: 'text-green-500',
                                bar: 'bg-green-500',
                            },
                            {
                                label: 'مستخدمو الموبايل',
                                icon: Smartphone,
                                used: usageStats.activeMobile,
                                max: planLimits.maxMobileUsers,
                                color: 'text-cyan-500',
                                bar: 'bg-cyan-500',
                            },
                        ].map((item) => {
                            const Icon = item.icon;
                            const isUnlimited = item.max === -1;
                            const pct = isUnlimited ? 0 : Math.min(100, Math.round((item.used / item.max) * 100));
                            const isNearLimit = !isUnlimited && pct >= 80;
                            const isAtLimit = !isUnlimited && item.used >= item.max;
                            return (
                                <div key={item.label} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className={`flex items-center gap-1.5 font-medium ${item.color}`}>
                                            <Icon className="w-4 h-4" />
                                            <span>{item.label}</span>
                                        </div>
                                        <span className={`font-bold tabular-nums text-xs ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-warning' : 'text-muted-foreground'}`}>
                                            {item.used} / {isUnlimited ? '∞' : item.max}
                                        </span>
                                    </div>
                                    {!isUnlimited && (
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${isAtLimit ? 'bg-destructive' : isNearLimit ? 'bg-warning' : item.bar}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    )}
                                    {isUnlimited && (
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className={`h-full rounded-full w-full opacity-20 ${item.bar}`} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Renewal CTA */}
            {organizationId && (
                <div className="flex justify-end">
                    <RenewButton organizationId={organizationId} />
                </div>
            )}

            {/* Bank Transfer Instructions */}
            <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-3" dir="rtl">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="font-bold text-base">الدفع عن طريق التحويل البنكي</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    يمكنك تجديد اشتراكك عن طريق إرسال التحويل البنكي إلى الحساب أدناه، ثم إرسال صورة الإيصال عبر واتساب أو البريد الإلكتروني للدعم.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="bg-background rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground mb-1">اسم البنك</div>
                        <div className="font-medium">{bankName}</div>
                    </div>
                    <div className="bg-background rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground mb-1">اسم صاحب الحساب</div>
                        <div className="font-medium">{accountHolder}</div>
                    </div>
                    <div className="bg-background rounded-lg border p-3 sm:col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">رقم الحساب</div>
                        <div className="font-mono font-bold tracking-wider" dir="ltr">{accountNumber}</div>
                    </div>
                    {payInfo.superKeyPhone && (
                        <div className="bg-background rounded-lg border p-3 sm:col-span-2">
                            <div className="text-xs text-muted-foreground mb-1">دفع عن طريق سوبر كي</div>
                            <div className="font-mono font-bold tracking-wider" dir="ltr">{payInfo.superKeyPhone}</div>
                            <div className="text-[11px] text-muted-foreground mt-1.5">{whatsappNote}</div>
                        </div>
                    )}
                </div>
                {(payInfo.supportPhone || payInfo.supportEmail) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                        {payInfo.supportPhone && (
                            <a href={`https://wa.me/${payInfo.supportPhone.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 font-medium hover:bg-muted transition-colors">
                                <PhoneCall className="w-3.5 h-3.5 text-success" />
                                <span dir="ltr">{payInfo.supportPhone}</span>
                            </a>
                        )}
                        {payInfo.supportEmail && (
                            <a href={`mailto:${payInfo.supportEmail}`} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 font-medium hover:bg-muted transition-colors" dir="ltr">
                                {payInfo.supportEmail}
                            </a>
                        )}
                    </div>
                )}
                <p className="text-xs text-muted-foreground">
                    {payInfo.transferNote ?? `بعد إرسال الإيصال، سيقوم فريقنا بتفعيل الاشتراك خلال ساعات العمل (${workingHours}).`}
                </p>
            </div>

            {/* Zain Cash Instructions */}
            {payInfo.zainCashNumber && (
                <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-3" dir="rtl">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Smartphone className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="font-bold text-base">الدفع عبر زين كاش</h2>
                    </div>
                    <div className="bg-background rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground mb-1">رقم حساب زين كاش</div>
                        <div className="font-mono font-bold tracking-wider" dir="ltr">{payInfo.zainCashNumber}</div>
                    </div>
                    <p className="text-xs text-muted-foreground">{whatsappNote}</p>
                </div>
            )}

            {/* Payment history */}
            <div className="space-y-3">
                <h2 className="text-base font-bold text-foreground">سجل المدفوعات</h2>
                <PaymentHistoryTable transactions={transactions} />
            </div>
        </div>
    );
}
