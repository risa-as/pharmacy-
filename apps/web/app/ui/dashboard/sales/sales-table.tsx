"use client";

import { useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { formatCurrency } from "@/app/lib/utils/currency";
import SaleDetailsModal from "./sale-details-modal"; // Import the modal
import SaleEditModal from "./sale-edit-modal";

interface SalesTableProps {
  sales: any[];
  settings?: any;
  canEdit?: boolean;
}

const pill = "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold";

/** Same layout and styling as the batches table (app/ui/batches/batch-table.tsx). */
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
        <table className="w-full text-sm text-right">
          <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">رقم الفاتورة</th>
              <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الأصناف</th>
              <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفرع</th>
              <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الكاشير</th>
              <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الإجمالي</th>
              <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">التاريخ</th>
              <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الحالة</th>
              <th className="px-3 py-3 text-center font-medium font-cairo whitespace-nowrap">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {sales.map((sale: any) => {
              const items: any[] = sale.items ?? [];
              const names = items.map((item) => item.drug?.tradeName).filter(Boolean) as string[];
              const returned = (sale.returns ?? []).reduce((sum: number, r: any) => sum + r.total, 0);
              const createdAt = new Date(sale.createdAt);

              let statusClass = "bg-success/10 text-success border-success/20";
              let statusText = "مكتملة";
              if (returned > 0 && returned >= sale.total) {
                statusClass = "bg-destructive/10 text-destructive border-destructive/20";
                statusText = "مرتجع كلي";
              } else if (returned > 0) {
                statusClass = "bg-warning/10 text-warning border-warning/20";
                statusText = "مرتجع جزئي";
              }

              return (
                <tr
                  key={sale.id}
                  className="hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedSale(sale)}
                >
                  <td className="px-3 py-3 font-mono font-bold text-primary whitespace-nowrap" dir="ltr">
                    {/* invoiceNumber can be empty (older desktop syncs); the document reference always exists. */}
                    {sale.invoiceNumber != null
                      ? `#${String(sale.invoiceNumber).padStart(4, "0")}`
                      : sale.documentNumber}
                  </td>
                  <td className="px-3 py-3">
                    <div className="max-w-[170px]">
                      <p className="font-semibold text-foreground truncate" title={names.join("، ") || undefined}>
                        {names[0] ?? "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {items.length > 1 ? `و ${items.length - 1} ${items.length - 1 === 1 ? "صنف آخر" : "أصناف أخرى"}` : "صنف واحد"}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <span className="block max-w-[160px] truncate" title={sale.branch?.name || undefined}>
                      {sale.branch?.name || "غير محدد"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {sale.user?.name ? (
                      <span className="block max-w-[110px] truncate" title={sale.user.name}>
                        {sale.user.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="font-bold text-foreground" dir="ltr">{formatCurrency(sale.total)}</div>
                    {sale.discount > 0 && (
                      <div className="text-[10px] text-muted-foreground" dir="ltr">
                        خصم {formatCurrency(sale.discount)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs text-muted-foreground leading-tight whitespace-nowrap" dir="ltr">
                      <div>{createdAt.toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}</div>
                      <div className="text-[10px] text-muted-foreground/60">
                        {createdAt.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`${pill} ${statusClass}`}>{statusText}</span>
                      {sale.hasPriceOverride && (
                        <span className={`${pill} bg-warning/10 text-warning border-warning/20`}>سعر معدّل</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        title="عرض التفاصيل"
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
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
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
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
              );
            })}
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
