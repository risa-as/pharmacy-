// Builds the detailed profit Excel workbook for the profits report.
// Shared by the export API route so the downloaded file matches the on-screen
// figures (revenue net of discount, COGS from recorded SaleItem.cost, returns
// netted out of both revenue and COGS).
import * as XLSX from "xlsx";

export type WbSaleItem = {
  quantity: number;
  price: number;
  cost: number;
  drug: { tradeName: string; scientificName: string } | null;
};
export type WbSale = {
  id: string;
  invoiceNumber: number | null;
  createdAt: Date | string;
  total: number;
  discount: number;
  branchId: string;
  items: WbSaleItem[];
};
export type WbReturn = {
  id: string;
  returnNumber: string | null;
  createdAt: Date | string;
  total: number;
  branchId: string;
  items: { quantity: number; price: number; drugId: string; drug: { tradeName: string } | null }[];
  sale: { invoiceNumber: number | null; items: { drugId: string; cost: number }[] } | null;
};
export type WbExpense = {
  amount: number;
  category: string;
  description: string | null;
  date: Date | string;
  branchId: string;
};

const round = (n: number) => Math.round(n);

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleString("en-GB", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const returnCOGSOf = (ret: WbReturn) => {
  const costByDrug = new Map((ret.sale?.items ?? []).map((si) => [si.drugId, si.cost]));
  let cogs = 0;
  for (const it of ret.items) cogs += (costByDrug.get(it.drugId) ?? 0) * it.quantity;
  return cogs;
};

export function buildProfitWorkbook(opts: {
  orgName: string;
  branchName: Map<string, string>;
  periodLabel: string;
  sales: WbSale[];
  returns: WbReturn[];
  expenses: WbExpense[];
}): Buffer {
  const { branchName, periodLabel, sales, returns, expenses } = opts;
  const bn = (id: string) => branchName.get(id) ?? id;

  // ── Per-item + per-invoice + per-drug aggregation ──────────────────────────
  type DrugAgg = {
    name: string;
    soldQty: number;
    soldRevenue: number;
    soldCost: number;
    retQty: number;
    retValue: number;
    retCost: number;
  };
  const drugAgg = new Map<string, DrugAgg>();

  const itemRows: Record<string, string | number>[] = [];
  const invoiceRows: Record<string, string | number>[] = [];
  let grossRevenue = 0; // Σ sale.total (already net of discount)
  let grossLineRevenue = 0; // Σ (price × qty) before discount
  let grossCOGS = 0;
  let totalDiscount = 0;

  for (const sale of sales) {
    const inv = sale.invoiceNumber ?? sale.id.slice(0, 8);
    let saleLineRevenue = 0;
    let saleCOGS = 0;
    for (const it of sale.items) {
      const lineRevenue = it.price * it.quantity;
      const lineCost = it.cost * it.quantity;
      saleLineRevenue += lineRevenue;
      saleCOGS += lineCost;
      const name = it.drug?.tradeName ?? "(غير معروف)";
      itemRows.push({
        "رقم الفاتورة": inv,
        التاريخ: fmtDate(sale.createdAt),
        الفرع: bn(sale.branchId),
        الدواء: name,
        "الاسم العلمي": it.drug?.scientificName ?? "",
        الكمية: it.quantity,
        "سعر بيع الوحدة": round(it.price),
        "إجمالي البيع": round(lineRevenue),
        "تكلفة الوحدة": round(it.cost),
        "إجمالي التكلفة": round(lineCost),
        "ربح السطر (بيع - تكلفة)": round(lineRevenue - lineCost),
      });
      const agg =
        drugAgg.get(name) ??
        { name, soldQty: 0, soldRevenue: 0, soldCost: 0, retQty: 0, retValue: 0, retCost: 0 };
      agg.soldQty += it.quantity;
      agg.soldRevenue += lineRevenue;
      agg.soldCost += lineCost;
      drugAgg.set(name, agg);
    }
    grossRevenue += sale.total;
    grossLineRevenue += saleLineRevenue;
    grossCOGS += saleCOGS;
    totalDiscount += sale.discount || 0;

    invoiceRows.push({
      "رقم الفاتورة": inv,
      التاريخ: fmtDate(sale.createdAt),
      الفرع: bn(sale.branchId),
      "عدد الأصناف": sale.items.length,
      "إجمالي البيع قبل الخصم": round(saleLineRevenue),
      الخصم: round(sale.discount || 0),
      "صافي الفاتورة": round(sale.total),
      "تكلفة البضاعة": round(saleCOGS),
      "الربح الإجمالي": round(sale.total - saleCOGS),
    });
  }

  // ── Returns ────────────────────────────────────────────────────────────────
  const returnRows: Record<string, string | number>[] = [];
  let totalReturns = 0;
  let totalReturnsCOGS = 0;
  for (const ret of returns) {
    const costByDrug = new Map((ret.sale?.items ?? []).map((si) => [si.drugId, si.cost]));
    totalReturns += ret.total;
    totalReturnsCOGS += returnCOGSOf(ret);
    for (const it of ret.items) {
      const unitCost = costByDrug.get(it.drugId) ?? 0;
      const lineCost = unitCost * it.quantity;
      const name = it.drug?.tradeName ?? "(غير معروف)";
      returnRows.push({
        "رقم الإرجاع": ret.returnNumber ?? ret.id.slice(0, 8),
        "رقم الفاتورة الأصلية": ret.sale?.invoiceNumber ?? "",
        التاريخ: fmtDate(ret.createdAt),
        الفرع: bn(ret.branchId),
        الدواء: name,
        الكمية: it.quantity,
        "سعر الإرجاع": round(it.price),
        "قيمة الإرجاع": round(it.price * it.quantity),
        "تكلفة المُرجَع": round(lineCost),
      });
      const agg = drugAgg.get(name);
      if (agg) {
        agg.retQty += it.quantity;
        agg.retValue += it.price * it.quantity;
        agg.retCost += lineCost;
      }
    }
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseRows = expenses.map((e) => ({
    التاريخ: fmtDate(e.date),
    الفرع: bn(e.branchId),
    التصنيف: e.category,
    الوصف: e.description ?? "",
    المبلغ: round(e.amount),
  }));

  // ── Per-drug sheet (sorted by net profit) ──────────────────────────────────
  const drugRows = Array.from(drugAgg.values())
    .map((a) => {
      const grossProfit = a.soldRevenue - a.soldCost;
      const netProfit = grossProfit - (a.retValue - a.retCost);
      return {
        الدواء: a.name,
        "الكمية المباعة": a.soldQty,
        "إجمالي البيع": round(a.soldRevenue),
        "إجمالي التكلفة": round(a.soldCost),
        "الربح الإجمالي": round(grossProfit),
        "الكمية المرتجعة": a.retQty,
        "قيمة المرتجع": round(a.retValue),
        "الربح الصافي (بعد المرتجعات)": round(netProfit),
      };
    })
    .sort((a, b) => (b["الربح الصافي (بعد المرتجعات)"] as number) - (a["الربح الصافي (بعد المرتجعات)"] as number));

  // ── Final figures ──────────────────────────────────────────────────────────
  const netSales = grossRevenue - totalReturns;
  const netCOGS = grossCOGS - totalReturnsCOGS;
  const grossProfit = netSales - netCOGS;
  const netProfit = grossProfit - totalExpenses;

  const summaryRows = [
    { البند: "الفترة", "القيمة": periodLabel },
    { البند: "إجمالي المبيعات (قبل الخصم)", "القيمة": round(grossLineRevenue) },
    { البند: "(−) الخصومات المطبقة", "القيمة": round(totalDiscount) },
    { البند: "= صافي المبيعات بعد الخصم", "القيمة": round(grossRevenue) },
    { البند: "(−) مرتجعات المبيعات", "القيمة": round(totalReturns) },
    { البند: "= صافي المبيعات", "القيمة": round(netSales) },
    { البند: "تكلفة البضاعة المباعة (قبل المرتجعات)", "القيمة": round(grossCOGS) },
    { البند: "(−) تكلفة البضاعة المُرجَعة", "القيمة": round(totalReturnsCOGS) },
    { البند: "= تكلفة البضاعة المباعة (صافي)", "القيمة": round(netCOGS) },
    { البند: "= إجمالي الربح", "القيمة": round(grossProfit) },
    { البند: "(−) المصروفات التشغيلية", "القيمة": round(totalExpenses) },
    { البند: "= صافي الربح", "القيمة": round(netProfit) },
    { البند: "عدد الفواتير", "القيمة": sales.length },
    { البند: "عدد المرتجعات", "القيمة": returns.length },
  ];

  // ── Assemble workbook ──────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, rows: Record<string, string | number>[], emptyMsg: string) => {
    const ws =
      rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([[emptyMsg]]);
    if (rows.length > 0) {
      ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 14) }));
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("الملخص النهائي", summaryRows as any, "");
  addSheet("الربح لكل دواء", drugRows as any, "لا توجد بيانات");
  addSheet("ملخص الفواتير", invoiceRows, "لا توجد فواتير");
  addSheet("تفاصيل الأصناف", itemRows, "لا توجد أصناف");
  addSheet("المرتجعات", returnRows, "لا توجد مرتجعات");
  addSheet("المصروفات", expenseRows, "لا توجد مصروفات");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
