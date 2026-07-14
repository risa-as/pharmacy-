// READ-ONLY: figures out WHEN and WHERE the owner's price corrections landed,
// so the sale-cost fix can be verified against them. Prints daily histograms
// of Inventory.updatedAt and Batch.updatedAt for دار التفاؤل, and inspects the
// drugs of wrong-looking sale items (ratio >= 2 vs inventory cost).
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

const day = (d) => new Date(d).toISOString().slice(0, 10);
const SINCE = new Date("2026-05-01T00:00:00.000Z");

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "دار التفاؤل" }, select: { id: true } });
  const branches = await prisma.branch.findMany({ where: { organizationId: org.id }, select: { id: true } });
  const branchIds = branches.map((b) => b.id);

  const invs = await prisma.inventory.findMany({
    where: { branchId: { in: branchIds } },
    select: { branchId: true, drugId: true, cost: true, updatedAt: true },
  });
  const invMap = new Map(invs.map((i) => [`${i.branchId}:${i.drugId}`, i]));

  const invHist = new Map();
  for (const i of invs) {
    if (i.updatedAt >= SINCE) invHist.set(day(i.updatedAt), (invHist.get(day(i.updatedAt)) ?? 0) + 1);
  }
  console.log("--- Inventory.updatedAt per day (since May 1) ---");
  for (const [d, n] of [...invHist.entries()].sort()) console.log(`${d}  ${n}`);

  const batches = await prisma.batch.findMany({
    where: { inventory: { branchId: { in: branchIds } } },
    select: { inventoryId: true, costPrice: true, quantity: true, updatedAt: true, createdAt: true,
      inventory: { select: { branchId: true, drugId: true, cost: true } } },
  });
  const batchHist = new Map();
  const batchHistMatch = new Map(); // batches whose costPrice ~ inventory.cost
  for (const b of batches) {
    if (b.updatedAt < SINCE) continue;
    const d = day(b.updatedAt);
    batchHist.set(d, (batchHist.get(d) ?? 0) + 1);
    if (b.inventory.cost > 0 && Math.abs(b.costPrice - b.inventory.cost) / b.inventory.cost < 0.05) {
      batchHistMatch.set(d, (batchHistMatch.get(d) ?? 0) + 1);
    }
  }
  console.log("\n--- Batch.updatedAt per day (since May 1): all | costPrice≈inventory.cost ---");
  const days = [...new Set([...batchHist.keys()])].sort();
  for (const d of days) console.log(`${d}  ${String(batchHist.get(d) ?? 0).padStart(5)} | ${String(batchHistMatch.get(d) ?? 0).padStart(5)}`);

  // Wrong-looking sale items (ratio >= 2): inspect their drugs' batches.
  const badDrugKeys = new Map(); // branch:drug -> {missing, items}
  let cursor;
  for (;;) {
    const items = await prisma.saleItem.findMany({
      take: 5000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" },
      where: { sale: { branchId: { in: branchIds } } },
      select: { id: true, drugId: true, quantity: true, cost: true, sale: { select: { branchId: true } } },
    });
    if (!items.length) break;
    cursor = items[items.length - 1].id;
    for (const it of items) {
      if (it.cost <= 0) continue;
      const inv = invMap.get(`${it.sale.branchId}:${it.drugId}`);
      if (!inv || inv.cost <= 0) continue;
      if (inv.cost / it.cost >= 2) {
        const k = `${it.sale.branchId}:${it.drugId}`;
        const v = badDrugKeys.get(k) ?? { items: 0, missing: 0 };
        v.items++;
        v.missing += (inv.cost - it.cost) * it.quantity;
        badDrugKeys.set(k, v);
      }
    }
    if (items.length < 5000) break;
  }
  console.log(`\nDrugs with wrong-looking sales (ratio>=2): ${badDrugKeys.size}`);

  // For those drugs: when was inventory last edited, and what do batches look like?
  const drugs = await prisma.globalDrug.findMany({ select: { id: true, tradeName: true } });
  const dn = new Map(drugs.map((d) => [d.id, d.tradeName]));
  const byInvEditDay = new Map();
  const sample = [...badDrugKeys.entries()].sort((a, b) => b[1].missing - a[1].missing).slice(0, 15);
  console.log("\n--- Top 15 wrong-cost drugs: inventory edit date + their batches ---");
  for (const [key, v] of sample) {
    const inv = invMap.get(key);
    const bs = batches.filter((b) => `${b.inventory.branchId}:${b.inventory.drugId}` === key);
    const bsDesc = bs.map((b) => `cp=${Math.round(b.costPrice)} q=${b.quantity} upd=${day(b.updatedAt)} crt=${day(b.createdAt)}`).join(" ; ");
    console.log(`${(dn.get(key.split(":")[1]) ?? key).slice(0, 30).padEnd(32)} invCost=${Math.round(inv.cost)} invUpd=${day(inv.updatedAt)} | batches: ${bsDesc.slice(0, 150)}`);
  }
  for (const [key] of badDrugKeys) {
    const inv = invMap.get(key);
    const d = day(inv.updatedAt);
    byInvEditDay.set(d, (byInvEditDay.get(d) ?? 0) + 1);
  }
  console.log("\n--- Wrong-cost drugs grouped by their inventory.updatedAt day ---");
  for (const [d, n] of [...byInvEditDay.entries()].sort()) console.log(`${d}  ${n}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
