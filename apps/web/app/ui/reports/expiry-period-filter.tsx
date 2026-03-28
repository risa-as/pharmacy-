'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const PRESETS = [
    { label: '7 أيام', value: 7 },
    { label: '15 يوم', value: 15 },
    { label: '30 يوم', value: 30 },
    { label: '60 يوم', value: 60 },
    { label: '90 يوم', value: 90 },
    { label: '180 يوم', value: 180 },
];

export default function ExpiryPeriodFilter({ currentDays }: { currentDays: number }) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();
    const [customValue, setCustomValue] = useState('');
    const [showCustom, setShowCustom] = useState(false);

    const apply = (days: number) => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('days', String(days));
        replace(`${pathname}?${params.toString()}`);
    };

    const handleCustomSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const val = parseInt(customValue);
        if (val > 0) {
            apply(val);
            setShowCustom(false);
            setCustomValue('');
        }
    };

    const isCustom = !PRESETS.some(p => p.value === currentDays);

    return (
        <div className="flex items-center gap-3 flex-wrap" dir="rtl">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span className="font-medium">عرض الأدوية التي تنتهي خلال:</span>
            </div>

            {/* Preset Buttons */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                {PRESETS.map((preset) => {
                    const isActive = currentDays === preset.value;
                    return (
                        <button
                            key={preset.value}
                            onClick={() => { apply(preset.value); setShowCustom(false); }}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${
                                isActive
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-background'
                            }`}
                        >
                            {preset.label}
                        </button>
                    );
                })}

                {/* Custom Button */}
                <button
                    onClick={() => setShowCustom(!showCustom)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${
                        isCustom
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-background'
                    }`}
                >
                    {isCustom ? `${currentDays} يوم` : 'مخصص'}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Custom Input */}
            {showCustom && (
                <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
                    <input
                        type="number"
                        min="1"
                        max="365"
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        placeholder="عدد الأيام"
                        autoFocus
                        className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring text-right"
                    />
                    <button
                        type="submit"
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                    >
                        تطبيق
                    </button>
                </form>
            )}

            {/* Current period badge */}
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
                الفترة الحالية: <span className="text-foreground font-bold">{currentDays} يوم</span>
            </span>
        </div>
    );
}
