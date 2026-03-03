import { X } from 'lucide-react';

// Authoritative POS shortcut list — mirrors contracts/component-apis.md
const POS_SHORTCUTS: { key: string; description: string }[] = [
    { key: 'F1',     description: 'اختصارات لوحة المفاتيح' },
    { key: 'F2',     description: 'البحث عن دواء' },
    { key: 'F3',     description: 'تطبيق خصم' },
    { key: 'F4',     description: 'الدفع والتسوية (نقدي)' },
    { key: 'F5',     description: 'إلغاء البيع' },
    { key: 'F6',     description: 'إرجاع / استرجاع' },
    { key: 'F8',     description: 'طباعة الفاتورة' },
    { key: 'Enter',  description: 'إضافة أول نتيجة بحث' },
    { key: 'Escape', description: 'إغلاق / رجوع' },
    { key: '+',      description: 'زيادة الكمية (عند التركيز على صنف)' },
    { key: '−',      description: 'تقليل الكمية (عند التركيز على صنف)' },
];

interface HotkeyHelpPanelProps {
    open: boolean;
    onClose: () => void;
}

export default function HotkeyHelpPanel({ open, onClose }: HotkeyHelpPanelProps) {
    if (!open) return null;

    return (
        /* Backdrop — click outside to close */
        <div
            className="fixed inset-0 z-[300] flex items-start justify-start p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
            aria-label="اختصارات لوحة المفاتيح"
        >
            {/* Panel — click inside does NOT close */}
            <div
                className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-72 animate-slideUp"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h3 className="font-bold text-base text-foreground">
                        اختصارات لوحة المفاتيح
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="إغلاق"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Shortcut list */}
                <div className="p-4 space-y-2.5">
                    {POS_SHORTCUTS.map(({ key, description }) => (
                        <div key={key} className="flex items-center justify-between gap-2">
                            <span className="text-sm text-muted-foreground leading-tight">
                                {description}
                            </span>
                            <kbd className="shrink-0 px-2 py-0.5 rounded border border-border bg-muted text-foreground text-xs font-mono">
                                {key}
                            </kbd>
                        </div>
                    ))}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                        اضغط <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-xs font-mono">Escape</kbd> أو انقر خارج اللوحة للإغلاق
                    </p>
                </div>
            </div>
        </div>
    );
}
