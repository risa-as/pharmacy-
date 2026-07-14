// READ-ONLY: quantifies what is still wrong in دار التفاؤل after the owner's
// partial manual corrections, using a cross-validated cost reference:
// inventory.cost is trusted only when the majority of the drug's batches agree
// with it (within 5%). Outputs:
//   1. Remaining wrong Batch.costPrice rows (the strips mistake), active vs depleted
//   2. Conflict drugs where inventory.cost disagrees with consistent batch prices
//   3. The SaleItem.cost fix set based on validated references
//   4. Overlap between drugs edited since Jul 1 and drugs with wrong sales
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let val = m[2].trim();
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = val;
}
const prisma = new PrismaClient();
const fmt = (n) => Math.round(n).toLocaleString("en");
const day = (d) => new Date(d).toISOString().slice(0, 10);

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "دار التفاؤل" }, select: { id: true } });
  const branches = await prisma.branch.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } });
  const branchIds = branches.map((b) => b.id);

  const invs = await prisma.inventory.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true, branchId: true, drugId: true, cost: true, updatedAt: true, drug: { select: { tradeName: true } } },
  });
  const invMap = new Map(invs.map((i) => [`${i.branchId}:${i.drugId}`, i]));

  const batches = await prisma.batch.findMany({
    where: { inventory: { branchId: { in: branchIds } } },
    select: { id: true, costPrice: true, quantity: true, createdAt: true,
      inventory: { select: { branchId: true, drugId: true } } },
  });
  const batchesByKey = new Map();
  for (const b of batches) {
    const k = `${b.inventory.branchId}:${b.inventory.drugId}`;
    (batchesByKey.get(k) ?? batchesByKey.set(k, []).get(k)).push(b);
  }

  // Validate the reference cost per drug: inventory.cost is trusted when at
  // least ONE batch agrees within 5% — correctly-entered batches match it,
  // while strips-mistake batches (divided by strip count) never coincide.
  // status: "validated" | "conflict" | "no-batches"
  const refStatus = new Map();
  for (const [k, inv] of invMap) {
    const bs = (batchesByKey.get(k) ?? []).filter((b) => b.costPrice > 0);
    if (inv.cost <= 0) { refStatus.set(k, "no-ref"); continue; }
    if (bs.length === 0) { refStatus.set(k, "no-batches"); continue; }
    const agree = bs.filter((b) => Math.abs(b.costPrice - inv.cost) / inv.cost < 0.05).length;
    refStatus.set(k, agree >= 1 ? "validated" : "conflict");
  }

  // ── 1. Remaining wrong batches (vs validated reference) ──
  console.log("=== 1. Batches still carrying a wrong costPrice (validated drugs only) ===");
  const wrongBatches = [];
  for (const b of batches) {
    const k = `${b.inventory.branchId}:${b.inventory.drugId}`;
    if (refStatus.get(k) !== "validated") continue;
    const inv = invMap.get(k);
    if (b.costPrice > 0 && inv.cost / b.costPrice >= 2) wrongBatches.push({ b, inv, k });
  }
  const active = wrongBatches.filter((w) => w.b.quantity > 0);
  console.log(`wrong batches (costPrice ≥2x below reference): ${wrongBatches.length}  — with stock remaining (STILL SELLING WRONG): ${active.length}`);
  for (const w of active.slice(0, 30)) {
    console.log(`  ACTIVE  ${w.inv.drug.tradeName.slice(0, 30).padEnd(32)} qty=${String(w.b.quantity).padStart(4)}  costPrice=${fmt(w.b.costPrice).padStart(8)}  should be=${fmt(w.inv.cost).padStart(8)}  created=${day(w.b.createdAt)}`);
  }

  // ── 2. Conflict drugs ──
  console.log("\n=== 2. Conflict drugs: inventory.cost disagrees with majority of batches (manual review) ===");
  let conflictCount = 0;
  for (const [k, st] of refStatus) {
    if (st !== "conflict") continue;
    conflictCount++;
    if (conflictCount > 25) continue;
    const inv = invMap.get(k);
    const bs = (batchesByKey.get(k) ?? []).filter((b) => b.costPrice > 0);
    const prices = [...new Set(bs.map((b) => Math.round(b.costPrice)))].slice(0, 6);
    console.log(`  ${inv.drug.tradeName.slice(0, 30).padEnd(32)} invCost=${fmt(inv.cost).padStart(8)} (edited ${day(inv.updatedAt)})  batch prices=[${prices.join(", ")}]`);
  }
  console.log(`total conflict drugs: ${conflictCount}`);

  // ── 3. SaleItem fix set on validated references ──
  const setStats = (o, add) => { o.items += 1; o.qty += add.qty; o.amount += add.amount; };
  const mk = () => ({ items: 0, qty: 0, amount: 0 });
  const fixClear = mk(), fixGray = mk(), skipConflict = mk();
  const wrongDrugKeys = new Set();
  let scanned = 0, cursor;
  for (;;) {
    const items = await prisma.saleItem.findMany({
      take: 5000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" },
      where: { sale: { branchId: { in: branchIds } } },
      select: { id: true, drugId: true, quantity: true, cost: true, sale: { select: { branchId: true } } },
    });
    if (!items.length) break;
    cursor = items[items.length - 1].id;
    scanned += items.length;
    for (const it of items) {
      if (it.cost <= 0) continue;
      const k = `${it.sale.branchId}:${it.drugId}`;
      const inv = invMap.get(k);
      if (!inv || inv.cost <= 0) continue;
      const ratio = inv.cost / it.cost;
      if (ratio < 1.25) continue;
      const add = { qty: it.quantity, amount: (inv.cost - it.cost) * it.quantity };
      const st = refStatus.get(k);
      if (st === "conflict") { setStats(skipConflict, add); continue; }
      wrongDrugKeys.add(k);
      if (ratio >= 2) setStats(fixClear, add); else setStats(fixGray, add);
    }
    if (items.length < 5000) break;
  }
  console.log(`\n=== 3. SaleItem fix set (validated reference only) — scanned ${fmt(scanned)} ===`);
  console.log(`clear errors (ratio>=2):   items=${fmt(fixClear.items)}  amount=${fmt(fixClear.amount)} IQD`);
  console.log(`gray zone (1.25-2x):       items=${fmt(fixGray.items)}  amount=${fmt(fixGray.amount)} IQD`);
  console.log(`skipped (conflict drugs):  items=${fmt(skipConflict.items)}  amount=${fmt(skipConflict.amount)} IQD`);

  // ── 4. Overlap: drugs edited since Jul 1 vs drugs with wrong sales ──
  const editedJuly = new Set([...invMap.entries()].filter(([, i]) => i.updatedAt >= new Date("2026-07-01")).map(([k]) => k));
  const overlap = [...wrongDrugKeys].filter((k) => editedJuly.has(k));
  console.log(`\n=== 4. Your July inventory edits vs wrong-sale drugs ===`);
  console.log(`inventories edited since Jul 1: ${editedJuly.size}  |  drugs with wrong sales: ${wrongDrugKeys.size}  |  overlap: ${overlap.length}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
