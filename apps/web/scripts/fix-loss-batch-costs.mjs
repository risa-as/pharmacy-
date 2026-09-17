// Corrects batch costs that were entered as a packet price instead of a strip price, and the
// SaleItem.cost snapshots taken from them (the COGS the profit report uses).
//
// Found by the loss-invoice audit for 2026-06-01..2026-09-15 (دار التفاؤل). Only batches whose
// entry cost is ≥1.4× the drug's other batches are touched. The correct strip cost is:
//   - the batch's current costPrice when the owner already corrected the batch later, else
//   - entry cost ÷ N when the ratio to the drug's normal cost is a whole number N (strips per
//     packet left at the default 1), else
//   - the median of the drug's other batches (requires ≥2 of them).
// Sale lines are corrected when their unit cost equals the wrong cost, or a FEFO blend of the
// wrong batch with one normal batch. Real losses (discounts, manual price overrides, prices below
// cost) are NOT modified: they reflect what the customer actually paid.
//
//   node scripts/fix-loss-batch-costs.mjs            → preview only (writes a preview JSON)
//   node scripts/fix-loss-batch-costs.mjs --apply    → backup JSON + apply in one transaction
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
// Sale lines before the audited report period (2026-06-01 Baghdad) are held back unless asked for:
// May is a closed period already covered by the July cost fix and its owner-review decisions.
const INCLUDE_BEFORE_PERIOD = process.argv.includes('--include-before-period');
const PERIOD_START = new Date('2026-05-31T21:00:00.000Z');
const ORG_NAME = 'دار التفاؤل';
const TARGETS = [
  // [drug tradeName, batchNumber] — the abnormal batches from the audit
  ['Famosam 40mg tab', '2JK9WO96'],
  ['Methycobal 500mcg', 'A189YZJY'],
  ['CoAmox Acino TM 1000', 'XWQYW7SP'],
  ['CoAmox Acino TM 1000', '3GJRTNGD'],
  ['CalciCare', 'K8MJ7RNB'],
  ['Koact 1000mg tab', '0CMEQI6J'],
  ['Clexane 2000 IU', '58BB1FEY'],
  ['Nexium 40mg tab', 'GS0CMWQ8'],
  ['Polygynax supp', 'DYM2HD27'],
  ['Medafill 5mg', 'BX3HV9TR'],
  ['Gentadex eye drop', 'AOR72VOQ'],
  // Cialis QPDDA8QP مستبعدة عمداً: بيعت كباكيت كامل بسعر 24,000 قبل تحويل الوحدة إلى شريط
  // في 2026-07-09، فتكلفتها 20,697 كانت صحيحة لوحدة ذلك الوقت.
  ['Cialis 20mg', 'WZRK5JFG'],
  ['Mobic 15mg', 'F33EIPOY'],
  ['Ural powder', 'R48721OO'],
  ['Binosto 70mg', '2HC9HHHN'],
  ['always small', 'P5Q2W0HQ'],
  ['primolut N', '64GVL721'],
];

const p = new PrismaClient();
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * tol);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const org = await p.organization.findFirst({ where: { name: ORG_NAME }, select: { id: true } });
if (!org) throw new Error('org not found');

const batchPlans = [];
const saleItemPlans = new Map();
const inventoryPlans = new Map();
const problems = [];
const skippedLines = [];
const heldBeforePeriod = [];

for (const [drugName, batchNumber] of TARGETS) {
  const batch = await p.batch.findFirst({
    where: { batchNumber, inventory: { branch: { organizationId: org.id }, drug: { tradeName: drugName } } },
    select: {
      id: true, batchNumber: true, costPrice: true, createdAt: true,
      inventory: { select: { id: true, cost: true, drugId: true, branchId: true, batches: { select: { id: true, costPrice: true } } } },
    },
  });
  if (!batch) { problems.push(`batch not found: ${drugName} ${batchNumber}`); continue; }
  const log = await p.auditLog.findFirst({
    where: { entity: 'BATCH', action: 'CREATE', entityId: batch.id },
    select: { details: true },
  });
  let entryCost = batch.costPrice;
  try { const d = JSON.parse(log?.details ?? '{}'); if (typeof d.costPrice === 'number') entryCost = d.costPrice; } catch { /* keep current */ }

  // "normal" = the drug's other batches clearly below the wrong cost; this also drops the sibling
  // abnormal batch of the same drug (the CoAmox pair) from the reference.
  const otherCosts = batch.inventory.batches.filter((b) => b.id !== batch.id).map((b) => b.costPrice);
  const normalCosts = otherCosts.filter((c) => c < entryCost / 1.4);
  if (!normalCosts.length) { problems.push(`no normal reference batch: ${drugName} ${batchNumber}`); continue; }
  const reference = median(normalCosts);
  const ratio = entryCost / reference;

  let correct; let rule;
  if (!near(batch.costPrice, entryCost, 0.02) && batch.costPrice < entryCost / 1.4) {
    correct = batch.costPrice; rule = 'corrected earlier by owner';
  } else if (Math.round(ratio) >= 2 && Math.abs(ratio - Math.round(ratio)) <= 0.06) {
    correct = entryCost / Math.round(ratio); rule = `entry cost ÷ ${Math.round(ratio)}`;
  } else if (normalCosts.length >= 2) {
    correct = reference; rule = 'median of normal batches';
  } else { problems.push(`ambiguous correct cost: ${drugName} ${batchNumber} ratio ${ratio.toFixed(2)}`); continue; }

  batchPlans.push({ id: batch.id, drugName, batchNumber, entryCost, currentCost: batch.costPrice, correct, rule, reference, ratio: Number(ratio.toFixed(3)) });

  if (near(batch.inventory.cost, entryCost, 0.01)) {
    inventoryPlans.set(batch.inventory.id, { id: batch.inventory.id, drugName, old: batch.inventory.cost, new: correct });
  }

  // sale lines costed from this batch (any date on/after the batch was created)
  const lines = await p.saleItem.findMany({
    where: { drugId: batch.inventory.drugId, sale: { branchId: batch.inventory.branchId, createdAt: { gte: batch.createdAt } } },
    select: { id: true, quantity: true, cost: true, price: true, sale: { select: { invoiceNumber: true, createdAt: true } } },
  });
  const normalSet = Array.from(new Set(normalCosts));
  for (const li of lines) {
    // the CoAmox pair shares one wrong cost, so the same line is reached from both batches
    if (saleItemPlans.has(li.id) || heldBeforePeriod.some((h) => h.id === li.id)) continue;
    let newCost = null; let how = null;
    if (near(li.cost, entryCost)) { newCost = correct; how = 'single'; }
    else {
      outer: for (const n of normalSet) {
        for (let q = 1; q < li.quantity; q++) {
          if (near((q * entryCost + (li.quantity - q) * n) / li.quantity, li.cost)) {
            newCost = (q * correct + (li.quantity - q) * n) / li.quantity; how = `blend ${q}×wrong + ${li.quantity - q}×${Math.round(n)}`; break outer;
          }
        }
      }
    }
    // حارس: خطأ التكلفة يظهر كتكلفة أعلى من سعر البيع. سطر سعره ≥ تكلفته القديمة بيع غالباً
    // بوحدة مختلفة (باكيت) فلا يُلمس.
    if (newCost != null && li.price >= li.cost) {
      skippedLines.push({ drugName, invoice: li.sale.invoiceNumber, price: li.price, cost: li.cost });
      continue;
    }
    if (newCost != null && !near(newCost, li.cost) && !INCLUDE_BEFORE_PERIOD && li.sale.createdAt < PERIOD_START) {
      heldBeforePeriod.push({ id: li.id, drugName, batchNumber, invoice: li.sale.invoiceNumber, soldAt: li.sale.createdAt, qty: li.quantity, price: li.price, oldCost: li.cost, newCost, profitDelta: (li.cost - newCost) * li.quantity });
      continue;
    }
    if (newCost != null && !near(newCost, li.cost)) {
      saleItemPlans.set(li.id, {
        id: li.id, drugName, batchNumber, invoice: li.sale.invoiceNumber, soldAt: li.sale.createdAt, qty: li.quantity, price: li.price,
        oldCost: li.cost, newCost, how, profitDelta: (li.cost - newCost) * li.quantity,
      });
    }
  }
}

const saleItems = Array.from(saleItemPlans.values());
const summary = {
  batches: batchPlans.length,
  saleItems: saleItems.length,
  inventories: inventoryPlans.size,
  profitCorrection: Math.round(saleItems.reduce((a, s) => a + s.profitDelta, 0)),
  problems,
  skippedLines,
  heldBeforePeriod: heldBeforePeriod.length,
  heldBeforePeriodProfit: Math.round(heldBeforePeriod.reduce((a, s) => a + s.profitDelta, 0)),
};
console.table(batchPlans.map((b) => ({ drug: b.drugName, batch: b.batchNumber, entry: Math.round(b.entryCost), now: Math.round(b.currentCost), correct: Math.round(b.correct * 100) / 100, rule: b.rule })));
console.log(summary);

const preview = { summary, batchPlans, inventoryPlans: Array.from(inventoryPlans.values()), saleItems, heldBeforePeriod };
fs.writeFileSync(new URL(`./loss-cost-fix-${APPLY ? 'backup' : 'preview'}-${stamp}.json`, import.meta.url), JSON.stringify(preview, null, 1));

if (APPLY) {
  if (problems.length) throw new Error('refusing to apply with unresolved problems: ' + problems.join('; '));
  await p.$transaction(async (tx) => {
    for (const b of batchPlans) {
      if (!near(b.currentCost, b.correct)) {
        const r = await tx.batch.updateMany({ where: { id: b.id, costPrice: b.currentCost }, data: { costPrice: b.correct } });
        if (r.count !== 1) throw new Error(`batch changed concurrently: ${b.batchNumber}`);
      }
    }
    for (const inv of inventoryPlans.values()) {
      const r = await tx.inventory.updateMany({ where: { id: inv.id, cost: inv.old }, data: { cost: inv.new } });
      if (r.count !== 1) throw new Error(`inventory changed concurrently: ${inv.drugName}`);
    }
    for (const s of saleItems) {
      const r = await tx.saleItem.updateMany({ where: { id: s.id, cost: s.oldCost }, data: { cost: s.newCost } });
      if (r.count !== 1) throw new Error(`sale item changed concurrently: ${s.id}`);
    }
    await tx.auditLog.create({
      data: {
        userId: 'system', userName: 'تصحيح تكاليف الدفعات (سكربت)', action: 'UPDATE', entity: 'BATCH',
        details: JSON.stringify({ reason: 'packet price entered as strip cost', ...summary, batches: batchPlans.map((b) => [b.batchNumber, b.entryCost, b.correct]) }).slice(0, 9000),
      },
    });
  }, { timeout: 120_000, maxWait: 20_000 });
  console.log('APPLIED');
}
await p.$disconnect();
