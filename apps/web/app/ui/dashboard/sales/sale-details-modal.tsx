"use client";

import { X, Printer, Calendar, User, MapPin, ShoppingBag, Undo2, Pencil, Tag } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import SaleReturnModal from "./sale-return-modal";

interface SaleDetailsModalProps {
    sale: any;
    isOpen: boolean;
    onClose: () => void;
    settings?: any;
}

export default function SaleDetailsModal({ sale, isOpen, onClose, settings }: SaleDetailsModalProps) {
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    if (!isOpen || !sale || !mounted) return null;

    const handlePrint = () => {
        window.print();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200" dir="rtl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
                    <div>
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <ShoppingBag className="w-6 h-6 text-primary" />
                            تفاصيل الطلب
                        </h2>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <p className="text-sm text-muted-foreground">
                                رقم الفاتورة:
                                <span className="font-mono font-bold text-primary text-base mr-1">
                                    #{sale.invoiceNumber != null ? String(sale.invoiceNumber).padStart(4, '0') : sale.id.slice(0, 8)}
                                </span>
                            </p>
                            {sale.hasPriceOverride && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 border border-amber-300">
                                    <Pencil className="w-2.5 h-2.5" />
                                    سعر معدّل يدوياً
                                </span>
                            )}
                            {sale.discount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 border border-green-300">
                                    <Tag className="w-2.5 h-2.5" />
                                    تم تطبيق خصم
                                </span>
                            )}
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
                                        <td className="px-4 py-3 text-center">
                                            {item.originalPrice != null && item.originalPrice !== item.price ? (
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="line-through text-muted-foreground/50 text-xs">{item.originalPrice.toLocaleString()}</span>
                                                    <span className="font-bold text-amber-600">{item.price.toLocaleString()}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">{item.price.toLocaleString()}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-foreground">{(item.quantity * item.price).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-muted/30 font-bold text-foreground border-t border-border">
                                {(() => {
                                    const itemsSubtotal = sale.items?.reduce((s: number, i: any) => s + i.quantity * i.price, 0) ?? 0;
                                    const discountAmount = Math.round(itemsSubtotal - sale.total);
                                    const returnsTotal = sale.returns?.reduce((s: number, r: any) => s + r.total, 0) ?? 0;
                                    const hasDiscount = discountAmount > 0;
                                    const hasReturns = returnsTotal > 0;
                                    return (
                                        <>
                                            {hasDiscount && (
                                                <>
                                                    <tr>
                                                        <td colSpan={3} className="px-4 py-3 text-left text-muted-foreground font-normal">المجموع قبل الخصم</td>
                                                        <td className="px-4 py-3 text-center text-muted-foreground font-normal">{itemsSubtotal.toLocaleString()} د.ع</td>
                                                    </tr>
                                                    <tr>
                                                        <td colSpan={3} className="px-4 py-3 text-left text-success">
                                                            الخصم {`(${Math.round((discountAmount / itemsSubtotal) * 100)}%)`}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-success">- {discountAmount.toLocaleString()} د.ع</td>
                                                    </tr>
                                                </>
                                            )}
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3 text-left">الإجمالي{hasReturns ? ' قبل الاسترجاع' : ' النهائي'}</td>
                                                <td className={`px-4 py-3 text-center ${hasReturns ? 'text-foreground' : 'text-primary text-lg'}`}>{sale.total.toLocaleString()} د.ع</td>
                                            </tr>
                                            {hasReturns && (
                                                <>
                                                    <tr>
                                                        <td colSpan={3} className="px-4 py-3 text-left text-destructive font-normal">إجمالي المرتجعات</td>
                                                        <td className="px-4 py-3 text-center text-destructive font-normal">- {returnsTotal.toLocaleString()} د.ع</td>
                                                    </tr>
                                                    <tr>
                                                        <td colSpan={3} className="px-4 py-3 text-left">الصافي النهائي</td>
                                                        <td className="px-4 py-3 text-center text-primary text-lg">{(sale.total - returnsTotal).toLocaleString()} د.ع</td>
                                                    </tr>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
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
        </div>,
        document.body
    );
}
