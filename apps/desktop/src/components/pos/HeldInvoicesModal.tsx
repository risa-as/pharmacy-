import { PauseCircle, X, Clock, ShoppingBag, User, RotateCcw, Trash2, Inbox } from "lucide-react";
import { formatIQD } from "./pos-utils";
import type { HeldInvoice } from "./pos-types";

/**
 * مودال قائمة الفواتير المعلّقة — استرجاع أو حذف.
 */
export function HeldInvoicesListModal({
    isOpen,
    invoices,
    onRecall,
    onDelete,
    onClose,
}: {
    isOpen: boolean;
    invoices: HeldInvoice[];
    onRecall: (id: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}) {
    if (!isOpen) return null;

    const timeAgo = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "الآن";
        if (mins < 60) return `قبل ${mins} د`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `قبل ${hrs} س`;
        return new Date(iso).toLocaleDateString("ar-IQ-u-nu-latn");
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-card rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scaleIn flex flex-col max-h-[85vh]">
                <div className="bg-primary p-4 text-primary-foreground flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <PauseCircle className="w-5 h-5" />
                        الفواتير المعلّقة
                        <span className="bg-white/20 text-sm px-2 py-0.5 rounded-full">{invoices.length}</span>
                    </h2>
                    <button onClick={onClose} className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
                    {invoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
                            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-3 border-2 border-dashed border-border">
                                <Inbox className="w-7 h-7 opacity-30" />
                            </div>
                            <p className="text-sm font-medium">لا توجد فواتير معلّقة</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">علّق فاتورة بالضغط على F10</p>
                        </div>
                    ) : (
                        invoices.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center gap-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-all p-3 animate-slideUp"
                            >
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center shrink-0">
                                    <PauseCircle className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-foreground text-sm truncate">
                                        {inv.label || "فاتورة معلّقة"}
                                    </h4>
                                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                                        <span className="flex items-center gap-1">
                                            <ShoppingBag className="w-3 h-3" /> {inv.itemCount} صنف
                                        </span>
                                        <span className="text-primary font-bold">{formatIQD(inv.subTotal)}</span>
                                        {inv.patient && (
                                            <span className="flex items-center gap-1 truncate">
                                                <User className="w-3 h-3" /> {inv.patient.name}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {timeAgo(inv.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        onClick={() => onRecall(inv.id)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-colors shadow-sm"
                                        title="استرجاع الفاتورة إلى السلة"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        استرجاع
                                    </button>
                                    <button
                                        onClick={() => onDelete(inv.id)}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                                        title="حذف الفاتورة المعلّقة"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {invoices.length > 0 && (
                    <div className="px-4 py-3 border-t bg-muted/50 shrink-0">
                        <p className="text-[11px] text-muted-foreground text-center">
                            عند الاسترجاع، إذا كانت السلة الحالية غير فارغة سيتم تعليقها تلقائياً لتجنب فقدان البيانات.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
