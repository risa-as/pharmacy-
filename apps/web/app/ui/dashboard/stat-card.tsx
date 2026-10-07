import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

export type StatTone = 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'orange' | 'purple' | 'muted';

const TONES: Record<StatTone, { bar: string; border: string; chip: string; dot: string }> = {
    primary: { bar: 'bg-primary', border: 'border-primary/40', chip: 'bg-primary/10 text-primary', dot: 'bg-primary' },
    info: { bar: 'bg-info', border: 'border-info/40', chip: 'bg-info/10 text-info', dot: 'bg-info' },
    success: { bar: 'bg-success', border: 'border-success/40', chip: 'bg-success/10 text-success', dot: 'bg-success' },
    warning: { bar: 'bg-warning', border: 'border-warning/40', chip: 'bg-warning/10 text-warning', dot: 'bg-warning' },
    destructive: { bar: 'bg-destructive', border: 'border-destructive/40', chip: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
    orange: { bar: 'bg-orange-500', border: 'border-orange-500/40', chip: 'bg-orange-500/10 text-orange-500', dot: 'bg-orange-500' },
    purple: { bar: 'bg-purple-500', border: 'border-purple-500/40', chip: 'bg-purple-500/10 text-purple-500', dot: 'bg-purple-500' },
    muted: { bar: 'bg-muted-foreground/40', border: 'border-border', chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
};

type Props = {
    label: string;
    value: ReactNode;
    unit?: string | null;
    icon: ComponentType<{ className?: string }>;
    tone: StatTone;
    href?: string;
    footer?: ReactNode;
    /** Always show the coloured side bar (figures). */
    bar?: boolean;
    /** Something to act on: side bar, tinted border and a pulsing dot. When false the card is calm. */
    attention?: boolean;
    valueClassName?: string;
};

/** The dashboard figure card: label, big number, icon chip and a separated footer line. */
export default function StatCard({ label, value, unit, icon: Icon, tone, href, footer, bar, attention, valueClassName }: Props) {
    const t = TONES[tone];
    const alerting = attention === true;
    const calm = attention === false;
    const body = (
        <>
            {(bar || alerting) && <span className={`absolute inset-y-0 start-0 w-1 ${t.bar}`} aria-hidden="true" />}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <p className={`mt-2 truncate text-2xl font-bold tabular-nums ${valueClassName ?? 'text-foreground'}`}>
                        {value}
                        {unit && <span className="ms-1 text-sm font-normal text-muted-foreground">{unit}</span>}
                    </p>
                </div>
                <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${calm ? TONES.muted.chip : t.chip}`}>
                    <Icon className="h-5 w-5" />
                    {alerting && (
                        <span className="absolute -top-1 -end-1 flex h-3 w-3" aria-label="يحتاج متابعة">
                            <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping ${t.dot}`} />
                            <span className={`relative inline-flex h-3 w-3 rounded-full ring-2 ring-card ${t.dot}`} />
                        </span>
                    )}
                </div>
            </div>
            {footer && <div className="mt-4 border-t border-border/60 pt-3">{footer}</div>}
        </>
    );
    const className = `group relative block overflow-hidden rounded-xl border bg-card p-5 ${alerting ? t.border : 'border-border'}`;
    return href ? (
        <Link href={href} className={`${className} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg`}>{body}</Link>
    ) : (
        <div className={className}>{body}</div>
    );
}
