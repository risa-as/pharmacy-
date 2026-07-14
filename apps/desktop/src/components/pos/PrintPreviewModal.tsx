import { useRef } from "react";
import { Printer, Smartphone, X } from "lucide-react";
import InvoicePrint from "../InvoicePrint";
import type { SaleData } from "./pos-types";

interface Props {
    isOpen: boolean;
    sale: SaleData | null;
    onClose: () => void;
    onWhatsApp: () => void;
}

export default function PrintPreviewModal({ isOpen, sale, onClose, onWhatsApp }: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    if (!isOpen || !sale) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 print:bg-white animate-fadeIn">
            <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full mx-4 print:shadow-none print:rounded-none print:max-w-none border border-border overflow-hidden animate-slideUp">
                <div className="flex items-center justify-between p-4 border-b border-border print:hidden bg-muted/30">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Printer className="w-5 h-5 text-primary" />
                        معاينة الفاتورة
                        <kbd className="text-[9px] font-mono opacity-50 border border-border px-1.5 py-0.5 rounded bg-background">F8</kbd>
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible flex justify-center print:block">
                    <InvoicePrint
                        ref={printRef}
                        items={sale.items}
                        total={sale.total}
                        invoiceNumber={sale.invoiceNumber}
                        date={sale.date}
                        // @ts-ignore
                        patientName={sale.patientName}
                        settings={sale.settings}
                        pointsEarned={sale.pointsEarned}
                    />
                </div>
                <div className="flex gap-3 p-4 border-t border-border bg-muted/30 print:hidden">
                    <button
                        onClick={() => window.print()}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground py-3 rounded-xl font-bold transition-all shadow-md shadow-primary/20 active:scale-[0.98]"
                    >
                        <Printer className="w-5 h-5" />
                        طباعة الفاتورة
                    </button>
                    <button
                        onClick={onWhatsApp}
                        className="flex-1 flex items-center justify-center gap-2 bg-success/10 text-success hover:bg-success/20 py-3 rounded-xl font-bold transition-colors border border-success/30"
                    >
                        <Smartphone className="w-5 h-5" />
                        إرسال واتساب
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-background border border-border hover:bg-muted text-foreground py-3 rounded-xl font-bold transition-colors"
                    >
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    );
}
