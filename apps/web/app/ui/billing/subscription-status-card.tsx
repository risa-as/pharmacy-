import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { CheckCircle2, AlertTriangle, Clock, ShieldOff, Infinity as InfinityIcon } from "lucide-react";
import { getSubscriptionState, type SubscriptionState } from "@/app/lib/subscription-state";

interface SubscriptionStatusCardProps {
    planName: string | null;
    subscriptionEndsAt: Date | null;
    isSuspended: boolean;
}

const STATE_CONFIG: Record<
    SubscriptionState,
    { label: string; icon: React.ElementType; className: string }
> = {
    active: {
        label: "نشط",
        icon: CheckCircle2,
        className: "bg-green-500/10 text-green-600 border-green-500/30",
    },
    warning: {
        label: "قارب على الانتهاء",
        icon: AlertTriangle,
        className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
    },
    grace: {
        label: "فترة السماح",
        icon: Clock,
        className: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    },
    suspended: {
        label: "موقوف",
        icon: ShieldOff,
        className: "bg-destructive/10 text-destructive border-destructive/30",
    },
};

export default function SubscriptionStatusCard({
    planName,
    subscriptionEndsAt,
    isSuspended,
}: SubscriptionStatusCardProps) {
    const { state, daysUntilExpiry, graceEndsAt } = getSubscriptionState({
        subscriptionEndsAt,
        isSuspended,
    });

    const config = STATE_CONFIG[state];
    const Icon = config.icon;

    return (
        <div className="glass-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">الخطة الحالية</p>
                    <h2 className="text-xl font-bold text-foreground">
                        {planName ?? "غير محدد"}
                    </h2>
                </div>

                {/* Status badge */}
                <div
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${config.className}`}
                >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {config.label}
                </div>
            </div>

            {/* Expiry information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <div>
                    <p className="text-xs text-muted-foreground mb-1">تاريخ انتهاء الاشتراك</p>
                    {subscriptionEndsAt ? (
                        <p className="text-sm font-medium text-foreground">
                            {format(subscriptionEndsAt, "d MMMM yyyy", { locale: ar })}
                        </p>
                    ) : (
                        <div className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                            <InfinityIcon className="w-4 h-4" />
                            <span>اشتراك دائم</span>
                        </div>
                    )}
                </div>

                {/* Contextual sub-info */}
                {state === "warning" && daysUntilExpiry !== null && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">الأيام المتبقية</p>
                        <p className="text-sm font-bold text-yellow-600">
                            {daysUntilExpiry} {daysUntilExpiry === 1 ? "يوم" : "أيام"}
                        </p>
                    </div>
                )}

                {state === "grace" && graceEndsAt && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">ينتهي وقت السماح</p>
                        <p className="text-sm font-bold text-orange-600">
                            {format(graceEndsAt, "d MMMM yyyy", { locale: ar })}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
