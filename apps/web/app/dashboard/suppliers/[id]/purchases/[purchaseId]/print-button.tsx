'use client';

import { Printer } from 'lucide-react';

export default function PrintInvoiceButton() {
    return (
        <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-all"
        >
            <Printer className="w-4 h-4" />
            طباعة
        </button>
    );
}
