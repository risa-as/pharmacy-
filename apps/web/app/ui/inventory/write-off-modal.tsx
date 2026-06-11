"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Trash2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { writeOffExpiredBatch } from "@/app/lib/actions/batch-actions";

interface WriteOffTarget {
    id: string;
    drugName: string;
    batchNumber: string | null;
    quantity: number;
    costPrice: number;
}

function fmt(v: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
}

function ModalContent({ target, onClose }: { target: WriteOffTarget; onClose: () => void }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const lossValue = target.quantity * target.costPrice;

    useEffect(() => {
        document.body.style.overflow = "hidden";
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => {
            document.body.style.overflow = "";
            window.removeEventListener("keydown", handler);
        };
    }, [onClose]);

    const handleConfirm = async () => {
        if (loading) return;
        setLoading(true);
        setStatus(null);

        const result = await writeOffExpiredBatch(target.id);
        setLoading(false);

        if (result.success) {
            setStatus({ type: "success", message: `تم شطب الدفعة — خسارة مُسجّلة: ${fmt(result.lossValue ?? lossValue)} د.ع` });
            router.refresh();
            setTimeout(onClose, 1400);
        } else {
            setStatus({ type: "error", message: result.message || "حدث خطأ غير متوقع" });
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" dir="rtl">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />

            <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-destructive/10 rounded-xl flex items-center justify-center">
                            <Trash2 className="w-5 h-5 text-destructive" />
                        </div>
                        <p className="font-bold text-foreground text-sm">شطب دفعة منتهية</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                    {/* تحذير */}
                    <div className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-xl px-4 py-3">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <p className="text-sm text-foreground">
                            سيتم تصفير كمية هذه الدفعة وتسجيل قيمتها كخسارة. <span className="font-bold">لا يمكن التراجع.</span>
                        </p>
                    </div>

                    {/* تفاصيل الدفعة */}
                    <div className="rounded-xl border border-border divide-y divide-border text-sm">
                        <div className="flex justify-between px-4 py-2.5">
                            <span className="text-muted-foreground">الدواء</span>
                            <span className="font-semibold text-foreground">{target.drugName}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5">
                            <span className="text-muted-foreground">رقم الدفعة</span>
                            <span className="font-mono text-foreground" dir="ltr">{target.batchNumber || "—"}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5">
                            <span className="text-muted-foreground">الكمية</span>
                            <span className="font-bold text-foreground">{target.quantity}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5">
                            <span className="text-muted-foreground">قيمة الخسارة</span>
                            <span className="font-bold text-destructive" dir="ltr">{fmt(lossValue)} د.ع</span>
                        </div>
                    </div>

                    {status && (
                        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                            status.type === "success"
                                ? "bg-success/10 text-success border border-success/20"
                                : "bg-destructive/10 text-destructive border border-destructive/20"
                        }`}>
                            {status.type === "success"
                                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                                : <AlertTriangle className="w-4 h-4 shrink-0" />
                            }
                            {status.message}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-5 pt-3 border-t border-border shrink-0 flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                    >
                        إلغاء
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={loading || status?.type === "success"}
                        className="flex-1 rounded-xl bg-destructive text-destructive-foreground py-2.5 text-sm font-bold hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الشطب...</>
                            : <><Trash2 className="w-4 h-4" /> تأكيد الشطب</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function WriteOffModal({ target, onClose }: { target: WriteOffTarget; onClose: () => void }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;
    return createPortal(<ModalContent target={target} onClose={onClose} />, document.body);
}
