"use client";
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TenantDialog({ title, children, onClose, busy = false, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const d = ref.current; d?.showModal(); return () => { d?.close(); }; }, []);
  return <dialog ref={ref} aria-labelledby={titleId} dir="rtl"
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    className={`m-auto w-[calc(100%_-_2rem)] max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-5 py-4">
      <h2 id={titleId} className="font-bold">{title}</h2>
      <Button type="button" size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose} disabled={busy}><X className="h-4 w-4" /></Button>
    </header>
    <div className="p-5">{children}</div>
  </dialog>;
}
