'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

/** Portalled disclosure avoids clipping inside horizontally scrollable tables. */
export default function MoreActions({ children, label = 'المزيد من الإجراءات' }: { children: ReactNode; label?: string }) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
    const id = useId();
    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        if (!open) return;
        panel.current?.querySelector<HTMLElement>('button:not([disabled]),a[href]')?.focus();
        const outside = (e: PointerEvent) => { if (e.target instanceof Node && !panel.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false); };
        const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
        const dismiss = () => setOpen(false);
        const scroll = (e: Event) => { if (!(e.target instanceof Node) || !panel.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); window.addEventListener('resize', dismiss);
        document.addEventListener('scroll', scroll, true);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', scroll, true); };
    }, [open]);
    const toggle = () => {
        const box = trigger.current?.getBoundingClientRect();
        if (box) setPosition({left: Math.max(8, Math.min(box.left, window.innerWidth - 224)), top: Math.max(8, Math.min(box.bottom + 6, window.innerHeight - 200))});
        setOpen(value => !value);
    };
    return <><button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={toggle} className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">المزيد<MoreHorizontal className="h-4 w-4" aria-hidden="true" /></button>
        {mounted && createPortal(<div ref={panel} id={id} dir="rtl" style={{...position, display:open?'block':'none'}} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }} onClick={e => { if ((e.target as Element).closest('button,a')) setOpen(false); }} className="fixed z-[80] max-h-48 w-52 overflow-y-auto rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg [&_button]:min-h-9 [&_button]:w-full [&_button]:justify-start [&_button]:rounded-lg [&_a]:flex [&_a]:min-h-9 [&_a]:items-center [&_a]:gap-2 [&_a]:rounded-lg [&_a]:px-3 [&_a]:text-xs [&_a:hover]:bg-muted">{children}</div>,document.body)}
    </>;
}
