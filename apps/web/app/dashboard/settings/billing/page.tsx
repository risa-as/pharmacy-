import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { CreditCard, CheckCircle2, XCircle } from "lucide-react";
import SubscriptionStatusCard from "@/app/ui/billing/subscription-status-card";
import PaymentHistoryTable from "@/app/ui/billing/payment-history-table";
import RenewButton from "@/app/ui/billing/renew-button";
import { verifyZainCashPayment, sweepExpiredPendingTransactions } from "@/app/lib/actions/billing";
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

    // Only tenant ADMINs can access billing settings
    if (user?.role !== "ADMIN") {
        redirect("/dashboard");
    }

    const branchId = user?.branchId;

    let planName: string | null = null;
    let subscriptionEndsAt: Date | null = null;
    let isSuspended = false;
    let organizationId: string | null = null;
    let transactions: PaymentTransactionRow[] = [];

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
                            plan: { select: { name: true } },
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

            {/* Renewal CTA */}
            {organizationId && (
                <div className="flex justify-end">
                    <RenewButton organizationId={organizationId} />
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
