// Profit report for organization "دار التفاؤل" — May 2026 (Baghdad time)
// Generates an Excel workbook with per-item detail so the figures can be
// verified by hand. Mirrors the logic of the /dashboard/reports/profits page.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load DATABASE_URL from apps/web/.env (Prisma Client reads process.env) ──
const envPath = path.resolve(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let val = m[2].trim();
  if (
    (val.startsWith("'") && val.endsWith("'")) ||
    (val.startsWith('"') && val.endsWith('"'))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

const prisma = new PrismaClient();

const ORG_ID = "930a071a-c933-413c-90dc-1356a8182a2f";

// ── May 2026 in Baghdad time (UTC+3), identical to the report's buildDateRange ──
const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
const start = new Date(Date.UTC(2026, 4, 1, 0, 0, 0, 0) - IRAQ_OFFSET);
const end = new Date(Date.UTC(2026, 4, 31, 23, 59, 59, 999) - IRAQ_OFFSET);

const fmtDate = (d) =>
  new Date(d).toLocaleString("en-GB", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const round = (n) => Math.round(n);

async function main() {
  const org = await prisma.organization.findUnique({
    where: { id: ORG_ID },
    select: { name: true },
  });
  if (!org) throw new Error(`Organization ${ORG_ID} not found`);

  const branches = await prisma.branch.findMany({
    where: { organizationId: ORG_ID },
    select: { id: true, name: true },
  });
  const branchIds = branches.map((b) => b.id);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  if (branchIds.length === 0) throw new Error("No branches for this org");

  console.log(`Organization: ${org.name}`);
  console.log(`Branches (${branchIds.length}): ${branches.map((b) => b.name).join(", ")}`);
  console.log(`Period: ${start.toISOString()} → ${end.toISOString()} (UTC)`);

  // ── Sales with items + drug name ───────────────────────────────────────────
  const sales = await prisma.sale.findMany({
    where: { branchId: { in: branchIds }, createdAt: { gte: start, lte: end } },
    select: {
      id: true,
      invoiceNumber: true,
      createdAt: true,
      total: true,
      discount: true,
      branchId: true,
      items: {
        select: {
          quantity: true,
          price: true,
          cost: true,
          drug: { select: { tradeName: true, scientificName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // ── Returns with original sale cost ────────────────────────────────────────
  const returns = await prisma.saleReturn.findMany({
    where: { branchId: { in: branchIds }, createdAt: { gte: start, lte: end } },
    select: {
      id: true,
      returnNumber: true,
      createdAt: true,
      total: true,
      saleId: true,
      branchId: true,
      items: {
        select: {
          quantity: true,
          price: true,
          drugId: true,
          drug: { select: { tradeName: true } },
        },
      },
      sale: {
        select: {
          invoiceNumber: true,
          items: { select: { drugId: true, cost: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // ── Expenses ───────────────────────────────────────────────────────────────
  const expenses = await prisma.expense.findMany({
    where: { branchId: { in: branchIds }, date: { gte: start, lte: end } },
    select: { amount: true, category: true, description: true, date: true, branchId: true },
    orderBy: { date: "asc" },
  });

  // ── Build per-item rows ────────────────────────────────────────────────────
  const itemRows = [];
  const invoiceRows = [];
  const drugAgg = new Map(); // tradeName → aggregated sold/returned figures
  let grossRevenue = 0; // Σ sale.total (net of discount)
  let grossLineRevenue = 0; // Σ price*qty (before discount)
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
      const dName = it.drug?.tradeName ?? "(غير معروف)";
      const agg =
        drugAgg.get(dName) ??
        { soldQty: 0, soldRevenue: 0, soldCost: 0, retQty: 0, retValue: 0, retCost: 0 };
      agg.soldQty += it.quantity;
      agg.soldRevenue += lineRevenue;
      agg.soldCost += lineCost;
      drugAgg.set(dName, agg);
      itemRows.push({
        "رقم الفاتورة": inv,
        التاريخ: fmtDate(sale.createdAt),
        الفرع: branchName.get(sale.branchId) ?? sale.branchId,
        الدواء: it.drug?.tradeName ?? "(غير معروف)",
        "الاسم العلمي": it.drug?.scientificName ?? "",
        الكمية: it.quantity,
        "سعر بيع الوحدة": round(it.price),
        "إجمالي البيع": round(lineRevenue),
        "تكلفة الوحدة": round(it.cost),
        "إجمالي التكلفة": round(lineCost),
        "ربح السطر (بيع - تكلفة)": round(lineRevenue - lineCost),
      });
    }
    const netTotal = sale.total; // after discount
    const grossProfit = netTotal - saleCOGS;
    grossRevenue += netTotal;
    grossLineRevenue += saleLineRevenue;
    grossCOGS += saleCOGS;
    totalDiscount += sale.discount || 0;

    invoiceRows.push({
      "رقم الفاتورة": inv,
      التاريخ: fmtDate(sale.createdAt),
      الفرع: branchName.get(sale.branchId) ?? sale.branchId,
      "عدد الأصناف": sale.items.length,
      "إجمالي البيع قبل الخصم": round(saleLineRevenue),
      الخصم: round(sale.discount || 0),
      "صافي الفاتورة": round(netTotal),
      "تكلفة البضاعة": round(saleCOGS),
      "الربح الإجمالي": round(grossProfit),
    });
  }

  // ── Returns rows + returned COGS ───────────────────────────────────────────
  const returnRows = [];
  let totalReturns = 0;
  let totalReturnsCOGS = 0;
  for (const ret of returns) {
    const costByDrug = new Map((ret.sale?.items ?? []).map((si) => [si.drugId, si.cost]));
    totalReturns += ret.total;
    for (const it of ret.items) {
      const unitCost = costByDrug.get(it.drugId) ?? 0;
      const lineCost = unitCost * it.quantity;
      totalReturnsCOGS += lineCost;
      const dName = it.drug?.tradeName ?? "(غير معروف)";
      const agg = drugAgg.get(dName);
      if (agg) {
        agg.retQty += it.quantity;
        agg.retValue += it.price * it.quantity;
        agg.retCost += lineCost;
      }
      returnRows.push({
        "رقم الإرجاع": ret.returnNumber ?? ret.id.slice(0, 8),
        "رقم الفاتورة الأصلية": ret.sale?.invoiceNumber ?? "",
        التاريخ: fmtDate(ret.createdAt),
        الفرع: branchName.get(ret.branchId) ?? ret.branchId,
        الدواء: it.drug?.tradeName ?? "(غير معروف)",
        الكمية: it.quantity,
        "سعر الإرجاع": round(it.price),
        "قيمة الإرجاع": round(it.price * it.quantity),
        "تكلفة المُرجَع": round(lineCost),
      });
    }
  }

  // ── Per-drug aggregation sheet (sorted by net profit) ──────────────────────
  const drugRows = Array.from(drugAgg.entries())
    .map(([name, a]) => {
      const grossProfit = a.soldRevenue - a.soldCost;
      const netProfit = grossProfit - (a.retValue - a.retCost);
      return {
        الدواء: name,
        "الكمية المباعة": a.soldQty,
        "إجمالي البيع": round(a.soldRevenue),
        "إجمالي التكلفة": round(a.soldCost),
        "الربح الإجمالي": round(grossProfit),
        "الكمية المرتجعة": a.retQty,
        "قيمة المرتجع": round(a.retValue),
        "الربح الصافي (بعد المرتجعات)": round(netProfit),
      };
    })
    .sort(
      (a, b) =>
        b["الربح الصافي (بعد المرتجعات)"] - a["الربح الصافي (بعد المرتجعات)"],
    );

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseRows = expenses.map((e) => ({
    التاريخ: fmtDate(e.date),
    الفرع: branchName.get(e.branchId) ?? e.branchId,
    التصنيف: e.category,
    الوصف: e.description ?? "",
    المبلغ: round(e.amount),
  }));

  // ── Final figures (match the report) ───────────────────────────────────────
  const netSales = grossRevenue - totalReturns;
  const netCOGS = grossCOGS - totalReturnsCOGS;
  const grossProfit = netSales - netCOGS;
  const netProfit = grossProfit - totalExpenses;

  const summaryRows = [
    { البند: "إجمالي المبيعات (قبل الخصم)", "القيمة (د.ع)": round(grossLineRevenue) },
    { البند: "(−) الخصومات المطبقة", "القيمة (د.ع)": round(totalDiscount) },
    { البند: "= صافي المبيعات بعد الخصم", "القيمة (د.ع)": round(grossRevenue) },
    { البند: "(−) مرتجعات المبيعات", "القيمة (د.ع)": round(totalReturns) },
    { البند: "= صافي المبيعات", "القيمة (د.ع)": round(netSales) },
    { البند: "إجمالي تكلفة البضاعة المباعة (قبل المرتجعات)", "القيمة (د.ع)": round(grossCOGS) },
    { البند: "(−) تكلفة البضاعة المُرجَعة", "القيمة (د.ع)": round(totalReturnsCOGS) },
    { البند: "= تكلفة البضاعة المباعة (صافي)", "القيمة (د.ع)": round(netCOGS) },
    { البند: "= إجمالي الربح", "القيمة (د.ع)": round(grossProfit) },
    { البند: "(−) المصروفات التشغيلية", "القيمة (د.ع)": round(totalExpenses) },
    { البند: "= صافي الربح", "القيمة (د.ع)": round(netProfit) },
    { البند: "—", "القيمة (د.ع)": "" },
    { البند: "عدد الفواتير", "القيمة (د.ع)": sales.length },
    { البند: "عدد المرتجعات", "القيمة (د.ع)": returns.length },
  ];

  // ── Write workbook ─────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows, fallbackHeader) => {
    const ws =
      rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([fallbackHeader || ["لا توجد بيانات"]]);
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]).map((k) => ({
        wch: Math.max(k.length + 2, 14),
      }));
      ws["!cols"] = cols;
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("الملخص النهائي", summaryRows);
  addSheet("الربح لكل دواء", drugRows, ["لا توجد بيانات"]);
  addSheet("ملخص الفواتير", invoiceRows, ["لا توجد فواتير"]);
  addSheet("تفاصيل الأصناف", itemRows, ["لا توجد أصناف"]);
  addSheet("المرتجعات", returnRows, ["لا توجد مرتجعات"]);
  addSheet("المصروفات", expenseRows, ["لا توجد مصروفات"]);

  let outPath = path.resolve(__dirname, "..", "تقرير-ربح-دار-التفاؤل-مايو-2026.xlsx");
  try {
    XLSX.writeFile(wb, outPath);
  } catch (e) {
    if (e?.code === "EBUSY" || e?.code === "EPERM") {
      // File is open (e.g. in Excel) — write to a fresh name instead.
      outPath = path.resolve(
        __dirname,
        "..",
        `تقرير-ربح-دار-التفاؤل-مايو-2026-${Date.now()}.xlsx`,
      );
      XLSX.writeFile(wb, outPath);
    } else {
      throw e;
    }
  }

  console.log("\n================= الملخص النهائي =================");
  for (const r of summaryRows) {
    if (r["القيمة (د.ع)"] !== "")
      console.log(`${r["البند"].padEnd(45)} ${Number(r["القيمة (د.ع)"]).toLocaleString("en-US")}`);
  }
  console.log("=================================================");
  console.log(`\nالملف: ${outPath}`);
  console.log(`عدد سطور الأصناف: ${itemRows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
