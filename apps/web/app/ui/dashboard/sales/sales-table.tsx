"use client";

import { useState } from "react";
import { Eye, TrendingUp, Pencil } from "lucide-react";
import SaleDetailsModal from "./sale-details-modal"; // Import the modal

interface SalesTableProps {
    sales: any[];
    settings?: any;
}

export default function SalesTable({ sales, settings }: SalesTableProps) {
    const [selectedSale, setSelectedSale] = useState<any | null>(null);

    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-card/50 text-muted-foreground text-sm">
                        <tr>
                            <th className="px-4 py-3 text-right font-bold">#</th>
                            <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                            <th className="px-4 py-3 text-right font-bold">الفرع</th>
                            <th className="px-4 py-3 text-right font-bold">الأصناف</th>
                            <th className="px-4 py-3 text-right font-bold">الإجمالي</th>
                            <th className="px-4 py-3 text-center font-bold">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {sales.map((sale: any, index: any) => (
                            <tr
                                key={sale.id}
                                className={`cursor-pointer transition-colors group ${sale.hasPriceOverride ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-muted/50'}`}
                                onClick={() => setSelectedSale(sale)}
                            >
                                <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                                <td className="px-4 py-3">
                                    <div className="text-foreground flex items-center gap-2">
                                        {new Date(sale.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                        {sale.hasPriceOverride && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
                                                <Pencil className="w-2.5 h-2.5" />
                                                سعر معدّل
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(sale.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' })}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {sale.branch?.name || 'غير محدد'}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-sm">
                                        {sale.items.length} صنف
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-bold text-foreground">
                                    <div className="flex flex-col">
                                        <span>{sale.total.toLocaleString()} د.ع</span>
                                        {sale.returns && sale.returns.length > 0 && (
                                            <span className={`text-[10px] w-fit px-2 py-0.5 rounded-full mt-1 ${sale.returns.reduce((sum: number, r: any) => sum + r.total, 0) >= sale.total
                                                    ? "bg-destructive/10 text-destructive font-bold"
                                                    : "bg-warning/10 text-warning font-bold"
                                                }`}>
                                                {sale.returns.reduce((sum: number, r: any) => sum + r.total, 0) >= sale.total ? "مرتجع كلي" : "مرتجع جزئي"}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        className="p-2 bg-muted text-muted-foreground rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedSale(sale);
                                        }}
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <SaleDetailsModal
                sale={selectedSale}
                isOpen={!!selectedSale}
                onClose={() => setSelectedSale(null)}
                settings={settings}
            />
        </>
    );
}
