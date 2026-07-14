// Fixes cost data corrupted by the strips-per-packet entry mistake (دار التفاؤل).
//
// Reference validation: a drug's Inventory.cost is trusted only when at least
// one of its batches matches it within 5% (correct entries match; strips-
// mistake entries — divided by the strip count — never coincide). Drugs where
// no batch agrees are "conflicts", written to a review CSV and never touched.
//
// Fix A — Batch.costPrice at least 2x below the validated reference → set to it.
//         (56 of these still have stock and are producing wrong sales today.)
// Fix B — SaleItem.cost at least 2x below the validated reference → set to it.
// Fix C — gray-zone SaleItems (1.25–2x below) fixed ONLY when the same drug
//         also has a ≥2x wrong batch (FIFO blending of a right + wrong batch
//         produces these intermediate values; plain price drift does not).
//
// Default run is a DRY RUN (read-only). Run with --apply to write.
// Every touched row's old value is saved to a backup JSON next to this script.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

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

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "دار التفاؤل" }, select: { id: true, name: true } });
  if (!org) throw new Error("Organization not found");
  console.log(`Organization: ${org.name}`);
  console.log(`Mode: ${APPLY ? "APPLY — writing to the database" : "DRY RUN — read-only"}\n`);

  const branches = await prisma.branch.findMany({ where: { organizationId: org.id }, select: { id: true } });
  const branchIds = branches.map((b) => b.id);

  const invs = await prisma.inventory.findMany({
    where: { branchId: { in: branchIds } },
    select: { branchId: true, drugId: true, cost: true, updatedAt: true, drug: { select: { tradeName: true } } },
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
    if (!batchesByKey.has(k)) batchesByKey.set(k, []);
    batchesByKey.get(k).push(b);
  }

  const refStatus = new Map();
  for (const [k, inv] of invMap) {
    const bs = (batchesByKey.get(k) ?? []).filter((b) => b.costPrice > 0);
    if (inv.cost <= 0) { refStatus.set(k, "no-ref"); continue; }
    if (bs.length === 0) { refStatus.set(k, "no-batches"); continue; }
    const agree = bs.some((b) => Math.abs(b.costPrice - inv.cost) / inv.cost < 0.05);
    refStatus.set(k, agree ? "validated" : "conflict");
  }

  // ── Fix A: wrong batches ──
  // Active batches (stock > 0), per the owner's instruction: adopt the price
  // of the NEWEST correctly-priced batch of the same drug created after the
  // wrong one; if none exists, adopt the HIGHEST price among the drug's
  // batches. Depleted batches use the validated inventory cost as agreed.
  const batchFixes = [];
  const drugHasWrongBatch = new Set();
  for (const b of batches) {
    const k = `${b.inventory.branchId}:${b.inventory.drugId}`;
    if (refStatus.get(k) !== "validated") continue;
    const inv = invMap.get(k);
    if (b.costPrice > 0 && inv.cost / b.costPrice >= 2) {
      let newCostPrice = inv.cost;
      let source = "inventory-cost";
      if (b.quantity > 0) {
        const siblings = (batchesByKey.get(k) ?? []).filter(
          (s) => s.id !== b.id && s.costPrice > 0 && inv.cost / s.costPrice < 2,
        );
        const newer = siblings
          .filter((s) => s.createdAt > b.createdAt)
          .sort((a, z) => z.createdAt - a.createdAt)[0];
        if (newer) {
          newCostPrice = newer.costPrice;
          source = `newer-batch(${newer.createdAt.toISOString().slice(0, 10)})`;
        } else {
          newCostPrice = Math.max(...(batchesByKey.get(k) ?? [b]).map((s) => s.costPrice));
          source = "highest-batch";
        }
      }
      batchFixes.push({ batchId: b.id, drug: inv.drug.tradeName, quantity: b.quantity, createdAt: b.createdAt, oldCostPrice: b.costPrice, newCostPrice, source });
      drugHasWrongBatch.add(k);
    }
  }
  const activeBatchFixes = batchFixes.filter((f) => f.quantity > 0);
  console.log(`Fix A — batches: ${batchFixes.length} wrong batch costPrices (${activeBatchFixes.length} still have stock)`);
  const bySource = {};
  for (const f of activeBatchFixes) {
    const s = f.source.startsWith("newer-batch") ? "newer-batch" : f.source;
    bySource[s] = (bySource[s] ?? 0) + 1;
  }
  console.log(`  active-batch price source: ${Object.entries(bySource).map(([s, n]) => `${s}=${n}`).join(", ")}`);
  console.log(`\n--- Active batches: adopted prices ---`);
  for (const f of [...activeBatchFixes].sort((a, z) => z.newCostPrice - a.newCostPrice)) {
    console.log(`  ${f.drug.slice(0, 30).padEnd(32)} qty=${String(f.quantity).padStart(4)}  ${fmt(f.oldCostPrice).padStart(8)} → ${fmt(f.newCostPrice).padStart(8)}  (${f.source})`);
  }

  // ── Fix B + C: sale items ──
  const saleFixes = [];
  let clear = { items: 0, amount: 0 }, gray = { items: 0, amount: 0 };
  let cursor;
  for (;;) {
    const items = await prisma.saleItem.findMany({
      take: 5000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" },
      where: { sale: { branchId: { in: branchIds } } },
      select: { id: true, drugId: true, quantity: true, cost: true, sale: { select: { branchId: true, createdAt: true } } },
    });
    if (!items.length) break;
    cursor = items[items.length - 1].id;
    for (const it of items) {
      if (it.cost <= 0) continue;
      const k = `${it.sale.branchId}:${it.drugId}`;
      if (refStatus.get(k) !== "validated") continue;
      const inv = invMap.get(k);
      const ratio = inv.cost / it.cost;
      const isClear = ratio >= 2;
      const isGray = ratio >= 1.25 && ratio < 2 && drugHasWrongBatch.has(k);
      if (!isClear && !isGray) continue;
      saleFixes.push({ saleItemId: it.id, drug: inv.drug.tradeName, saleDate: it.sale.createdAt, quantity: it.quantity, oldCost: it.cost, newCost: inv.cost, kind: isClear ? "clear" : "gray-blend" });
      const t = isClear ? clear : gray;
      t.items++; t.amount += (inv.cost - it.cost) * it.quantity;
    }
    if (items.length < 5000) break;
  }
  console.log(`Fix B — sale items, clear errors (>=2x):        ${fmt(clear.items)} items, ${fmt(clear.amount)} IQD`);
  console.log(`Fix C — sale items, FIFO blends (1.25–2x):      ${fmt(gray.items)} items, ${fmt(gray.amount)} IQD`);
  console.log(`Total profit correction: ${fmt(clear.amount + gray.amount)} IQD`);

  // ── Conflicts review CSV ──
  const conflictRows = [["drug", "branchId", "inventory_cost", "inventory_last_edited", "batch_prices"]];
  for (const [k, st] of refStatus) {
    if (st !== "conflict") continue;
    const inv = invMap.get(k);
    const prices = [...new Set(((batchesByKey.get(k) ?? []).filter((b) => b.costPrice > 0)).map((b) => Math.round(b.costPrice)))];
    conflictRows.push([inv.drug.tradeName, inv.branchId, Math.round(inv.cost), inv.updatedAt.toISOString().slice(0, 10), prices.join(" | ")]);
  }
  const conflictPath = path.resolve(__dirname, "cost-conflicts-review.csv");
  fs.writeFileSync(conflictPath, "﻿" + conflictRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n"));
  console.log(`\nConflict drugs needing manual review: ${conflictRows.length - 1} → ${conflictPath}`);

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const backupPath = path.resolve(__dirname, `cost-fix-${APPLY ? "backup" : "preview"}-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ org: org.name, batchFixes, saleFixes }, null, 1));
  console.log(`${APPLY ? "Backup" : "Preview"} written: ${backupPath}`);

  if (!APPLY) {
    console.log(`\nDRY RUN complete — nothing was changed. Re-run with --apply to fix.`);
  } else {
    let n = 0;
    for (const f of batchFixes) {
      await prisma.batch.update({ where: { id: f.batchId }, data: { costPrice: f.newCostPrice } });
      n++;
      if (n % 20 === 0) process.stdout.write(`\rbatches updated: ${n}/${batchFixes.length}`);
    }
    console.log(`\rbatches updated: ${n}/${batchFixes.length}`);
    // Group sale items by target cost for efficient updateMany.
    const groups = new Map();
    for (const f of saleFixes) {
      const key = String(f.newCost);
      if (!groups.has(key)) groups.set(key, { newCost: f.newCost, ids: [] });
      groups.get(key).ids.push(f.saleItemId);
    }
    let updated = 0;
    for (const [, g] of groups) {
      for (let i = 0; i < g.ids.length; i += 500) {
        const res = await prisma.saleItem.updateMany({ where: { id: { in: g.ids.slice(i, i + 500) } }, data: { cost: g.newCost } });
        updated += res.count;
        process.stdout.write(`\rsale items updated: ${updated}/${saleFixes.length}`);
      }
    }
    console.log(`\nDONE — batches: ${n}, sale items: ${updated}. Backup: ${backupPath}`);
  }

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
