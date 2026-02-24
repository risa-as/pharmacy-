import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ReactNode } from 'react';

interface GlassKpiCardProps {
    title: string;
    value: string | number;
    icon: ReactNode;
    sub?: string;
    trend?: { value: number; positive: boolean };
    href?: string;
}

export function GlassKpiCard({ title, value, icon, sub, trend, href }: GlassKpiCardProps) {
    const inner = (
        <div className="glass-card p-5 h-full transition-transform duration-200 hover:scale-[1.02]">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{title}</span>
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    {icon}
                </div>
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
            {sub && (
                <div className="text-xs text-muted-foreground mt-1">{sub}</div>
            )}
            {trend && (
                <div className={`flex items-center gap-1 text-xs mt-2 font-medium ${trend.positive ? 'text-success' : 'text-destructive'}`}>
                    {trend.positive
                        ? <TrendingUp className="w-3 h-3" />
                        : <TrendingDown className="w-3 h-3" />
                    }
                    {Math.abs(trend.value).toFixed(1)}% مقارنة بالأمس
                </div>
            )}
        </div>
    );

    return href ? (
        <Link href={href} className="block h-full">{inner}</Link>
    ) : inner;
}
