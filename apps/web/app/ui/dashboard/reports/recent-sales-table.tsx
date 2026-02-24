"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Eye } from "lucide-react";
import SaleDetailsModal from "@/app/ui/dashboard/sales/sale-details-modal";

interface RecentSalesTableProps {
    sales: any[];
}

export default function RecentSalesTable({ sales }: RecentSalesTableProps) {
    const [selectedSale, setSelectedSale] = useState<any | null>(null);

    return (
        <>
            <table className="w-full text-right">
                <thead className="bg-card/50 text-muted-foreground text-sm">
                    <tr>
                        <th className="px-6 py-4">رقم العملية</th>
                        <th className="px-6 py-4">التاريخ</th>
                        <th className="px-6 py-4">عدد المواد</th>
                        <th className="px-6 py-4">القيمة</th>
                        <th className="px-6 py-4 text-center">التفاصيل</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {sales.map((sale) => (
                        <tr
                            key={sale.id}
                            className="hover:bg-muted/50 cursor-pointer group"
                            onClick={() => setSelectedSale(sale)}
                        >
                            <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                                {sale.id.slice(0, 8)}...
                            </td>
                            <td className="px-6 py-4 text-foreground">
                                {format(new Date(sale.createdAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}
                            </td>
                            <td className="px-6 py-4 text-foreground">
                                {sale.items.length}
                            </td>
                            <td className="px-6 py-4 font-bold text-success">
                                {sale.total.toLocaleString()} د.ع
                            </td>
                            <td className="px-6 py-4 text-center">
                                <button className="p-2 bg-muted text-muted-foreground rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                    <Eye className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {sales.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                لا توجد عمليات مسجلة لهذا الموظف
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <SaleDetailsModal
                sale={selectedSale}
                isOpen={!!selectedSale}
                onClose={() => setSelectedSale(null)}
            />
        </>
    );
}
