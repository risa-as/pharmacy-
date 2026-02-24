"use client";

import { X, Printer, Calendar, User, MapPin, ShoppingBag, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useState } from "react";
import SaleReturnModal from "./sale-return-modal";

interface SaleDetailsModalProps {
    sale: any;
    isOpen: boolean;
    onClose: () => void;
    settings?: any;
}

export default function SaleDetailsModal({ sale, isOpen, onClose, settings }: SaleDetailsModalProps) {
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

    if (!isOpen || !sale) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
                    <div>
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <ShoppingBag className="w-6 h-6 text-primary" />
                            تفاصيل الطلب
                        </h2>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-sm text-muted-foreground">رقم الفاتورة: <span className="font-mono font-bold text-foreground">{sale.id}</span></p>
                            {sale.returns && sale.returns.length > 0 && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${sale.returns.reduce((sum: number, r: any) => sum + r.total, 0) >= sale.total
                                        ? "bg-destructive/10 text-destructive"
                                        : "bg-warning/10 text-warning"
                                    }`}>
                                    {sale.returns.reduce((sum: number, r: any) => sum + r.total, 0) >= sale.total ? "مرتجع كلي" : "مرتجع جزئي"}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
                    {/* Print Header */}
                    <div className="hidden print:flex flex-col items-center justify-center mb-8 border-b pb-4">
                        {settings?.logoUrl && (
                            <img src={settings.logoUrl} alt="Logo" className="w-24 h-24 mb-2 object-contain" />
                        )}
                        <h1 className="text-3xl font-bold mb-2">{settings?.name || "صيدلية فاراماس"}</h1>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                            {settings?.phone && <span>{settings.phone}</span>}
                            {settings?.address && <span>{settings.address}</span>}
                        </div>
                    </div>
                    {/* Meta Info */}
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4 text-primary" />
                            <span>{format(new Date(sale.createdAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="w-4 h-4 text-destructive" />
                            <span>{sale.branch?.name || 'غير محدد'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="w-4 h-4 text-primary" />
                            <span>{sale.user?.name || sale.userId || 'غير معروف'}</span>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-card/50 text-muted-foreground font-bold border-b border-border">
                                <tr>
                                    <th className="px-4 py-3 text-right">المادة</th>
                                    <th className="px-4 py-3 text-center">الكمية</th>
                                    <th className="px-4 py-3 text-center">السعر</th>
                                    <th className="px-4 py-3 text-center">المجموع</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {sale.items?.map((item: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-muted/30">
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            {item.drug?.tradeName || item.name || 'غير معروف'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-muted-foreground">{item.quantity}</td>
                                        <td className="px-4 py-3 text-center text-muted-foreground">{item.price.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center font-bold text-foreground">{(item.quantity * item.price).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-muted/30 font-bold text-foreground border-t border-border">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-left">الإجمالي الأساسي</td>
                                    <td className="px-4 py-3 text-center text-foreground">{sale.total.toLocaleString()} د.ع</td>
                                </tr>
                                {sale.returns && sale.returns.length > 0 && (
                                    <>
                                        <tr>
                                            <td colSpan={3} className="px-4 py-3 text-left">إجمالي المرتجعات</td>
                                            <td className="px-4 py-3 text-center text-destructive">
                                                - {sale.returns.reduce((sum: number, r: any) => sum + r.total, 0).toLocaleString()} د.ع
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colSpan={3} className="px-4 py-3 text-left">الصافي</td>
                                            <td className="px-4 py-3 text-center text-primary text-lg">
                                                {(sale.total - sale.returns.reduce((sum: number, r: any) => sum + r.total, 0)).toLocaleString()} د.ع
                                            </td>
                                        </tr>
                                    </>
                                )}
                                {(!sale.returns || sale.returns.length === 0) && (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-3 text-left">الإجمالي النهائي</td>
                                        <td className="px-4 py-3 text-center text-primary text-lg">{sale.total.toLocaleString()} د.ع</td>
                                    </tr>
                                )}
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-muted/30 flex items-center gap-3">
                    <button
                        onClick={() => setIsReturnModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg transition-colors ml-auto font-bold"
                    >
                        <Undo2 className="w-4 h-4" />
                        إرجاع أصناف
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        طباعة الفاتورة
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold transition-colors"
                    >
                        إغلاق
                    </button>
                </div>
            </div>

            {/* Return Modal (Rendered on top) */}
            <SaleReturnModal
                sale={sale}
                isOpen={isReturnModalOpen}
                onClose={() => {
                    setIsReturnModalOpen(false);
                    onClose(); // Optional: close both if needed, but let's just close the return modal.
                }}
            />
        </div>
    );
}
