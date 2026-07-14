import { useEffect, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { DialogVariant } from "../lib/dialog";

interface AppAlertModalProps {
    open: boolean;
    variant: DialogVariant;
    title: string;
    message?: string;
    /** Overrides the default variant icon. */
    icon?: ReactNode;
    /** Primary action button; when omitted the footer shows a single "حسناً". */
    actionLabel?: string;
    onAction?: () => void;
    onClose: () => void;
    /** Auto-close after this many ms (used for success notices). */
    autoCloseMs?: number;
}

const VARIANT_STYLES: Record<DialogVariant, { badge: string; icon: ReactNode }> = {
    success: { badge: "bg-success/10 text-success", icon: <CheckCircle2 className="w-7 h-7" strokeWidth={2.25} /> },
    warning: { badge: "bg-warning/10 text-warning", icon: <AlertTriangle className="w-7 h-7" strokeWidth={2.25} /> },
    error: { badge: "bg-destructive/10 text-destructive", icon: <XCircle className="w-7 h-7" strokeWidth={2.25} /> },
};

export default function AppAlertModal({
    open, variant, title, message, icon, actionLabel, onAction, onClose, autoCloseMs,
}: AppAlertModalProps) {
    useEffect(() => {
        if (!open || !autoCloseMs) return;
        const t = setTimeout(onClose, autoCloseMs);
        return () => clearTimeout(t);
    }, [open, autoCloseMs, onClose]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const styles = VARIANT_STYLES[variant];

    return (
        <div
            dir="rtl"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-card rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 flex flex-col items-center text-center gap-3">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${styles.badge}`}>
                        {icon ?? styles.icon}
                    </div>
                    <h2 className="text-lg font-bold text-foreground">{title}</h2>
                    {message && (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{message}</p>
                    )}
                </div>
                {/* Auto-closing notices need no footer — click anywhere dismisses. */}
                {!autoCloseMs && (
                    <div className="p-4 border-t border-border bg-muted/50 flex gap-3">
                        {actionLabel && onAction && (
                            <button
                                onClick={onAction}
                                className={`flex-1 font-bold py-2 px-4 rounded-lg transition-colors ${
                                    variant === "error"
                                        ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                                }`}
                            >
                                {actionLabel}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className={`${actionLabel ? "px-4" : "flex-1"} py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors`}
                        >
                            {actionLabel ? "إلغاء" : "حسناً"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
