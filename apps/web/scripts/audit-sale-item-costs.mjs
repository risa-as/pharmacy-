// READ-ONLY audit: compares each historical SaleItem.cost (snapshotted at sale
// time) against the drug's current corrected Inventory.cost for that branch.
// Context: employees entered TOTAL strips into the strips-per-packet field,
// which understated cost-per-strip; batch prices were corrected later, but
// profit reports use SaleItem.cost, so past profits stayed overstated.
// This script only measures the damage — it writes nothing to the database.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

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

const monthKey = (d) => {
  const dt = new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000); // Baghdad UTC+3
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
};

async function main() {
  const branches = await prisma.branch.findMany({
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  const branchInfo = new Map(branches.map((b) => [b.id, b]));

  const inventories = await prisma.inventory.findMany({
    select: { branchId: true, drugId: true, cost: true },
  });
  const invCost = new Map(
    inventories.map((i) => [`${i.branchId}:${i.drugId}`, i.cost]),
  );

  const drugs = await prisma.globalDrug.findMany({
    select: { id: true, tradeName: true },
  });
  const drugName = new Map(drugs.map((d) => [d.id, d.tradeName]));

  // ratio = correctedCost / recordedCost. The strips mistake makes the divisor
  // huge, so affected items typically show ratio >= 2.
  const buckets = {
    zeroCost: { items: 0, qty: 0, missing: 0 },
    "ratio>=5": { items: 0, qty: 0, missing: 0 },
    "ratio2-5": { items: 0, qty: 0, missing: 0 },
    "ratio1.25-2": { items: 0, qty: 0, missing: 0 },
    "about-equal": { items: 0, qty: 0, missing: 0 },
    "cost-higher-now-lower": { items: 0, qty: 0, missing: 0 },
    "no-inventory-record": { items: 0, qty: 0, missing: 0 },
  };
  // missing = understated COGS = (correctedCost - recordedCost) * qty

  const perOrg = new Map(); // orgName -> { items, missing }
  const perMonth = new Map(); // yyyy-mm -> { items, missing }
  const perDrug = new Map(); // drugId -> { items, qty, missing, sampleCost, invCost }
  let totalItems = 0;
  let flaggedItems = 0;
  let flaggedMissing = 0;
  let earliest = null;
  let latest = null;

  const PAGE = 5000;
  let cursor = undefined;
  for (;;) {
    const items = await prisma.saleItem.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        drugId: true,
        quantity: true,
        cost: true,
        sale: { select: { branchId: true, createdAt: true } },
      },
    });
    if (items.length === 0) break;
    cursor = items[items.length - 1].id;

    for (const it of items) {
      totalItems++;
      const branch = branchInfo.get(it.sale.branchId);
      const orgName = branch?.organization?.name ?? "(unknown org)";
      const corrected = invCost.get(`${it.sale.branchId}:${it.drugId}`);

      let bucket;
      let missing = 0;
      if (corrected == null) {
        bucket = "no-inventory-record";
      } else if (it.cost <= 0) {
        bucket = "zeroCost";
        missing = corrected * it.quantity;
      } else {
        const ratio = corrected / it.cost;
        if (ratio >= 5) bucket = "ratio>=5";
        else if (ratio >= 2) bucket = "ratio2-5";
        else if (ratio >= 1.25) bucket = "ratio1.25-2";
        else if (ratio >= 0.8) bucket = "about-equal";
        else bucket = "cost-higher-now-lower";
        if (ratio >= 1.25) missing = (corrected - it.cost) * it.quantity;
      }

      buckets[bucket].items++;
      buckets[bucket].qty += it.quantity;
      buckets[bucket].missing += missing;

      const flagged = bucket === "zeroCost" || bucket === "ratio>=5" || bucket === "ratio2-5";
      if (flagged) {
        flaggedItems++;
        flaggedMissing += missing;
        const created = new Date(it.sale.createdAt);
        if (!earliest || created < earliest) earliest = created;
        if (!latest || created > latest) latest = created;

        const org = perOrg.get(orgName) ?? { items: 0, missing: 0 };
        org.items++;
        org.missing += missing;
        perOrg.set(orgName, org);

        const mk = monthKey(it.sale.createdAt);
        const mon = perMonth.get(mk) ?? { items: 0, missing: 0 };
        mon.items++;
        mon.missing += missing;
        perMonth.set(mk, mon);

        const dr = perDrug.get(it.drugId) ?? {
          items: 0, qty: 0, missing: 0,
          recordedCosts: new Set(), invCost: corrected ?? 0,
        };
        dr.items++;
        dr.qty += it.quantity;
        dr.missing += missing;
        if (dr.recordedCosts.size < 5) dr.recordedCosts.add(Math.round(it.cost * 100) / 100);
        perDrug.set(it.drugId, dr);
      }
    }
    process.stdout.write(`\rscanned ${totalItems} sale items...`);
    if (items.length < PAGE) break;
  }
  console.log(`\n`);

  const fmt = (n) => Math.round(n).toLocaleString("en");
  console.log(`=== SaleItem cost audit (read-only) ===`);
  console.log(`Total sale items scanned: ${fmt(totalItems)}`);
  console.log(`\n--- Buckets (ratio = corrected inventory cost / recorded sale cost) ---`);
  for (const [name, b] of Object.entries(buckets)) {
    console.log(
      `${name.padEnd(22)} items=${fmt(b.items).padStart(8)}  strips=${fmt(b.qty).padStart(9)}  understated COGS=${fmt(b.missing).padStart(12)} IQD`,
    );
  }
  console.log(`\nFlagged as likely affected (zero cost OR ratio>=2):`);
  console.log(`  items: ${fmt(flaggedItems)}  |  profit overstated by ~${fmt(flaggedMissing)} IQD`);
  if (earliest) console.log(`  date range: ${earliest.toISOString().slice(0, 10)} → ${latest.toISOString().slice(0, 10)}`);

  console.log(`\n--- Per organization (flagged only) ---`);
  for (const [org, v] of [...perOrg.entries()].sort((a, b) => b[1].missing - a[1].missing)) {
    console.log(`${org.padEnd(30)} items=${fmt(v.items).padStart(8)}  overstated=${fmt(v.missing).padStart(12)} IQD`);
  }

  console.log(`\n--- Per month, Baghdad time (flagged only) ---`);
  for (const [mk, v] of [...perMonth.entries()].sort()) {
    console.log(`${mk}  items=${fmt(v.items).padStart(8)}  overstated=${fmt(v.missing).padStart(12)} IQD`);
  }

  console.log(`\n--- Top 25 drugs by overstated profit (flagged only) ---`);
  const top = [...perDrug.entries()].sort((a, b) => b[1].missing - a[1].missing).slice(0, 25);
  for (const [drugId, v] of top) {
    console.log(
      `${(drugName.get(drugId) ?? drugId).slice(0, 40).padEnd(42)} items=${fmt(v.items).padStart(6)}  overstated=${fmt(v.missing).padStart(11)} IQD  recorded=[${[...v.recordedCosts].join(", ")}] corrected=${fmt(v.invCost)}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
