'use client';
import { Printer } from 'lucide-react';
export default function PrintReturnButton() {
    return <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"><Printer className="h-4 w-4" aria-hidden="true" />طباعة</button>;
}
