"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "warning" | "danger";
}

/**
 * Styled replacement for window.confirm — flat colors, small radius,
 * matches the app's modal style. Usage:
 *
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   if (!(await confirm({ title: "...", message: "..." }))) return;
 *   ...
 *   return <>{modalJsx}{dialog}</>;
 */
export function useConfirm() {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolverRef = useRef<((ok: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmOptions) => {
        setOptions(opts);
        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
        });
    }, []);

    const close = useCallback((ok: boolean) => {
        resolverRef.current?.(ok);
        resolverRef.current = null;
        setOptions(null);
    }, []);

    // Escape closes as "cancel"
    useEffect(() => {
        if (!options) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") close(false);
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [options, close]);

    const variant = options?.variant ?? "warning";
    const iconTone =
        variant === "danger"
            ? "bg-destructive/10 text-destructive"
            : "bg-warning/10 text-warning";
    const confirmTone =
        variant === "danger"
            ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            : "bg-warning hover:bg-warning/90 text-warning-foreground";

    const dialog = options
        ? createPortal(
            <div
                className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 animate-fade-in"
                onClick={(e) => {
                    e.stopPropagation();
                    close(false);
                }}
                dir="rtl"
            >
                <div
                    className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                    role="alertdialog"
                    aria-modal="true"
                >
                    <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconTone}`}>
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base font-bold text-foreground font-cairo">
                                {options.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-line">
                                {options.message}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                        <button
                            type="button"
                            autoFocus
                            onClick={() => close(false)}
                            className="flex-1 py-2 rounded-lg font-bold text-sm bg-muted hover:bg-muted/80 text-foreground transition-colors"
                        >
                            {options.cancelText ?? "إلغاء وتصحيح"}
                        </button>
                        <button
                            type="button"
                            onClick={() => close(true)}
                            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${confirmTone}`}
                        >
                            {options.confirmText ?? "متابعة على أي حال"}
                        </button>
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    return { confirm, dialog };
}
