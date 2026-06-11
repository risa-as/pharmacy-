"use client";

import { useState, useMemo } from "react";
import { Package, AlertTriangle, Clock, Search, CheckCircle2 } from "lucide-react";
import type { AlertItem } from "@/app/lib/alerts";

type FilterKey = "all" | "low_stock" | "expiring" | "expired";

const TYPE_META: Record<
    AlertItem["type"],
    { title: string; icon: typeof Package }
> = {
    low_stock: { title: "نقص في المخزون", icon: Package },
    expiring: { title: "قارب على الانتهاء", icon: Clock },
    expired: { title: "منتهي الصلاحية", icon: AlertTriangle },
};

function alertMessage(alert: AlertItem): string {
    switch (alert.type) {
        case "low_stock":
            return alert.quantity === 0
                ? "نفد المخزون بالكامل"
                : `الكمية الحالية: ${alert.quantity} (الحد الأدنى: ${alert.minStock})`;
        case "expired":
            return `منتهي الصلاحية منذ ${Math.abs(alert.daysLeft || 0)} يوم`;
        case "expiring":
            return `ينتهي خلال ${alert.daysLeft} يوم`;
    }
}

export default function AlertsList({ alerts }: { alerts: AlertItem[] }) {
    const [filter, setFilter] = useState<FilterKey>("all");
    const [query, setQuery] = useState("");

    const counts = useMemo(
        () => ({
            all: alerts.length,
            low_stock: alerts.filter((a) => a.type === "low_stock").length,
            expiring: alerts.filter((a) => a.type === "expiring").length,
            expired: alerts.filter((a) => a.type === "expired").length,
        }),
        [alerts]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return alerts.filter((a) => {
            if (filter !== "all" && a.type !== filter) return false;
            if (q && !a.drugName.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [alerts, filter, query]);

    const tabs: { key: FilterKey; label: string }[] = [
        { key: "all", label: "الكل" },
        { key: "low_stock", label: "نقص المخزون" },
        { key: "expiring", label: "قارب على الانتهاء" },
        { key: "expired", label: "منتهية الصلاحية" },
    ];

    return (
        <div className="glass-card overflow-hidden">
            {/* شريط الفلترة والبحث */}
            <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-wrap gap-1.5">
                    {tabs.map((tab) => {
                        const active = filter === tab.key;
                        const count = counts[tab.key];
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setFilter(tab.key)}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                                }`}
                            >
                                {tab.label}
                                <span
                                    className={`text-xs rounded-full px-1.5 py-0.5 ${
                                        active ? "bg-primary-foreground/20" : "bg-background"
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="relative sm:mr-auto sm:max-w-xs w-full">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="بحث باسم الدواء..."
                        className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                </div>
            </div>

            {/* القائمة */}
            {filtered.length === 0 ? (
                <div className="py-16 text-center">
                    <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                    </div>
                    <p className="text-foreground font-medium">
                        {query || filter !== "all" ? "لا توجد نتائج مطابقة" : "لا توجد تنبيهات"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        {query || filter !== "all"
                            ? "جرّب تغيير الفلتر أو كلمة البحث"
                            : "جميع الأدوية بحالة جيدة"}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-border">
                    {filtered.map((alert) => {
                        const meta = TYPE_META[alert.type];
                        const Icon = meta.icon;
                        const danger = alert.severity === "danger";

                        return (
                            <div
                                key={`${alert.type}-${alert.id}`}
                                className="flex items-center gap-4 px-6 py-4 hover:bg-muted/40 transition-colors"
                            >
                                {/* أيقونة */}
                                <div
                                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                        danger
                                            ? "bg-destructive/10 text-destructive"
                                            : "bg-warning/10 text-warning"
                                    }`}
                                >
                                    <Icon className="w-5 h-5" />
                                </div>

                                {/* المحتوى */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                        <span
                                            className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                                                danger
                                                    ? "bg-destructive/10 text-destructive border-destructive/20"
                                                    : "bg-warning/10 text-warning border-warning/20"
                                            }`}
                                        >
                                            {meta.title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {alert.branchName}
                                        </span>
                                    </div>
                                    <h4 className="font-semibold text-foreground truncate">
                                        {alert.drugName}
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                        {alertMessage(alert)}
                                    </p>
                                </div>

                                {/* الكمية + تاريخ الصلاحية */}
                                <div className="text-left shrink-0 hidden sm:block">
                                    {typeof alert.quantity === "number" && (
                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-md px-2 py-1">
                                            <Package className="w-3 h-3" />
                                            {alert.quantity}
                                        </span>
                                    )}
                                    {alert.expiryDate && (
                                        <p className="text-xs text-muted-foreground mt-1" dir="ltr">
                                            {new Date(alert.expiryDate).toLocaleDateString("ar-IQ", {
                                                timeZone: "Asia/Baghdad",
                                            })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
