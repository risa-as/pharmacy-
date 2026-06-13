"use client";

import { useState } from "react";
import { Eye, TrendingUp, Pencil, Tag } from "lucide-react";
import SaleDetailsModal from "./sale-details-modal"; // Import the modal
import SaleEditModal from "./sale-edit-modal";

interface SalesTableProps {
  sales: any[];
  settings?: any;
  canEdit?: boolean;
}

export default function SalesTable({
  sales,
  settings,
  canEdit,
}: SalesTableProps) {
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [editingSale, setEditingSale] = useState<any | null>(null);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <thead className="bg-card/50 text-muted-foreground text-sm">
            <tr>
              <th className="px-4 py-3 text-right font-bold w-[14%]">رقم الفاتورة</th>
              <th className="px-4 py-3 text-right font-bold w-[20%]">التاريخ</th>
              <th className="px-4 py-3 text-right font-bold w-[18%]">الفرع</th>
              <th className="px-4 py-3 text-right font-bold w-[14%]">الأصناف</th>
              <th className="px-4 py-3 text-right font-bold w-[18%]">الإجمالي</th>
              <th className="px-4 py-3 text-center font-bold w-[16%]">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sales.map((sale: any, index: any) => (
              <tr
                key={sale.id}
                className={`cursor-pointer transition-colors group ${sale.hasPriceOverride ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-muted/50"}`}
                onClick={() => setSelectedSale(sale)}
              >
                <td className="px-4 py-3 font-mono font-bold text-primary">
                  #{String(sale.invoiceNumber ?? index + 1).padStart(4, "0")}
                </td>
                <td className="px-4 py-3">
                  <div className="text-foreground flex items-center gap-1.5 flex-wrap">
                    {new Date(sale.createdAt).toLocaleDateString("ar-IQ", {
                      timeZone: "Asia/Baghdad",
                    })}
                    {sale.hasPriceOverride && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
                        <Pencil className="w-2.5 h-2.5" />
                        سعر معدّل
                      </span>
                    )}
                    {sale.discount > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">
                        <Tag className="w-2.5 h-2.5" />
                        خصم
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(sale.createdAt).toLocaleTimeString("ar-IQ", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Baghdad",
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {sale.branch?.name || "غير محدد"}
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
                      <span
                        className={`text-[10px] w-fit px-2 py-0.5 rounded-full mt-1 ${
                          sale.returns.reduce(
                            (sum: number, r: any) => sum + r.total,
                            0,
                          ) >= sale.total
                            ? "bg-destructive/10 text-destructive font-bold"
                            : "bg-warning/10 text-warning font-bold"
                        }`}
                      >
                        {sale.returns.reduce(
                          (sum: number, r: any) => sum + r.total,
                          0,
                        ) >= sale.total
                          ? "مرتجع كلي"
                          : "مرتجع جزئي"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      title="عرض التفاصيل"
                      className="p-2 bg-muted text-muted-foreground rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSale(sale);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {canEdit && (
                      <button
                        title="تعديل الفاتورة"
                        className="p-2 bg-muted text-muted-foreground rounded-lg hover:bg-amber-100 hover:text-amber-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSale(sale);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>
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

      {canEdit && (
        <SaleEditModal
          sale={editingSale}
          isOpen={!!editingSale}
          onClose={() => setEditingSale(null)}
        />
      )}
    </>
  );
}
