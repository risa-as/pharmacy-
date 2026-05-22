"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { Calendar, Clock } from "lucide-react";

type Preset = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
    { id: "today", label: "اليوم" },
    { id: "yesterday", label: "أمس" },
    { id: "last7", label: "آخر 7 أيام" },
    { id: "thisMonth", label: "هذا الشهر" },
    { id: "lastMonth", label: "الشهر الماضي" },
    { id: "custom", label: "مخصص" },
];

function fmt(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getPresetDates(preset: Preset): { from: string; to: string } {
    const now = new Date();
    switch (preset) {
        case "today":
            return { from: fmt(now), to: fmt(now) };
        case "yesterday": {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            return { from: fmt(y), to: fmt(y) };
        }
        case "last7": {
            const s = new Date(now);
            s.setDate(s.getDate() - 6);
            return { from: fmt(s), to: fmt(now) };
        }
        case "thisMonth": {
            return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
        }
        case "lastMonth": {
            const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const e = new Date(now.getFullYear(), now.getMonth(), 0);
            return { from: fmt(s), to: fmt(e) };
        }
        default:
            return { from: "", to: "" };
    }
}

function detectPreset(from?: string, to?: string): Preset {
    if (!from && !to) return "last7";
    const now = new Date();
    const todayStr = fmt(now);
    const yesterdayStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const thisMonthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastMonthStart = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd = fmt(new Date(now.getFullYear(), now.getMonth(), 0));
    const last7Start = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));

    if (from === todayStr && to === todayStr) return "today";
    if (from === yesterdayStr && to === yesterdayStr) return "yesterday";
    if (from === last7Start && to === todayStr) return "last7";
    if (from === thisMonthStart && to === todayStr) return "thisMonth";
    if (from === lastMonthStart && to === lastMonthEnd) return "lastMonth";
    return "custom";
}

interface Props {
    baseUrl: string;
    currentFrom?: string;
    currentTo?: string;
    currentFromTime?: string;
    currentToTime?: string;
    extraParams?: Record<string, string | undefined>;
    allowedPresets?: Preset[];
    showTimeFilter?: boolean;
}

export default function DateRangeFilter({ baseUrl, currentFrom, currentTo, currentFromTime, currentToTime, extraParams, allowedPresets, showTimeFilter }: Props) {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [activePreset, setActivePreset] = useState<Preset>("last7");
    const [customFrom, setCustomFrom] = useState(currentFrom || "");
    const [customTo, setCustomTo] = useState(currentTo || "");
    const [fromTime, setFromTime] = useState(currentFromTime || "");
    const [toTime, setToTime] = useState(currentToTime || "");
    const [showTimePicker, setShowTimePicker] = useState(!!(currentFromTime || currentToTime));

    useEffect(() => {
        setActivePreset(detectPreset(currentFrom, currentTo));
        setMounted(true);
    }, [currentFrom, currentTo]);

    const navigate = useCallback((from: string, to: string, ft?: string, tt?: string) => {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (ft) params.set("fromTime", ft);
        if (tt) params.set("toTime", tt);
        if (extraParams) {
            Object.entries(extraParams).forEach(([k, v]) => { if (v) params.set(k, v); });
        }
        router.push(`${baseUrl}?${params.toString()}`);
    }, [baseUrl, extraParams, router]);

    const handlePreset = (preset: Preset) => {
        if (preset === "custom") {
            setActivePreset("custom");
            return;
        }
        const { from, to } = getPresetDates(preset);
        navigate(from, to, fromTime || undefined, toTime || undefined);
    };

    const handleCustomApply = () => {
        if (customFrom && customTo) navigate(customFrom, customTo, fromTime || undefined, toTime || undefined);
    };

    const handleTimeApply = () => {
        const from = customFrom || currentFrom || "";
        const to = customTo || currentTo || "";
        if (from && to) navigate(from, to, fromTime || undefined, toTime || undefined);
        else {
            // re-apply current preset with new times
            const p = activePreset !== "custom" ? getPresetDates(activePreset) : { from: "", to: "" };
            if (p.from && p.to) navigate(p.from, p.to, fromTime || undefined, toTime || undefined);
        }
    };

    const clearTime = () => {
        setFromTime(""); setToTime("");
        const from = customFrom || currentFrom || "";
        const to = customTo || currentTo || "";
        if (from && to) navigate(from, to);
        else {
            const p = activePreset !== "custom" ? getPresetDates(activePreset) : { from: "", to: "" };
            if (p.from && p.to) navigate(p.from, p.to);
        }
    };

    if (!mounted) {
        return <div className="bg-card border rounded-xl p-4 h-[60px] animate-pulse" />;
    }

    const hasTimeFilter = !!(currentFromTime || currentToTime);

    return (
        <div className="bg-card border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    الفترة الزمنية
                </div>
                {showTimeFilter && (
                    <button
                        onClick={() => setShowTimePicker(v => !v)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                            hasTimeFilter
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                        }`}
                    >
                        <Clock className="w-3 h-3" />
                        {hasTimeFilter ? `${currentFromTime} — ${currentToTime}` : "تصفية بالساعة"}
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                {PRESETS.filter(p => !allowedPresets || allowedPresets.includes(p.id)).map((p) => (
                    <button
                        key={p.id}
                        onClick={() => handlePreset(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activePreset === p.id
                                ? "bg-primary text-primary-foreground shadow-md"
                                : "bg-muted border border-border text-muted-foreground hover:border-primary/50"
                        }`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {activePreset === "custom" && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                    <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground"
                    />
                    <span className="text-muted-foreground text-sm">—</span>
                    <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground"
                    />
                    <button
                        onClick={handleCustomApply}
                        disabled={!customFrom || !customTo}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-primary/90"
                    >
                        تطبيق
                    </button>
                </div>
            )}

            {showTimeFilter && showTimePicker && (
                <div className="border-t border-border pt-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 font-bold">
                        <Clock className="w-3 h-3" />
                        نطاق الساعات
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">من</span>
                            <input
                                type="time"
                                value={fromTime}
                                onChange={(e) => setFromTime(e.target.value)}
                                className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-foreground"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">إلى</span>
                            <input
                                type="time"
                                value={toTime}
                                onChange={(e) => setToTime(e.target.value)}
                                className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-foreground"
                            />
                        </div>
                        <button
                            onClick={handleTimeApply}
                            disabled={!fromTime || !toTime}
                            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-primary/90"
                        >
                            تطبيق
                        </button>
                        {hasTimeFilter && (
                            <button
                                onClick={clearTime}
                                className="px-3 py-1.5 bg-muted border border-border text-muted-foreground rounded-lg text-xs font-bold hover:text-destructive hover:border-destructive/50"
                            >
                                مسح
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
