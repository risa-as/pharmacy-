// Follow-up to fix-loss-batch-costs.mjs: Concor 10mg (دار التفاؤل) has two sale lines costed at
// 12,148 = exactly 2 × the drug's strip cost 6,074 (packet price saved as strip cost). The source
// batch no longer exists with that cost (deleted/edited before audit logging), so only the sale
// snapshots are corrected. Invoices #83 (2026-04-04) and #2899 (2026-06-05).
//
//   node scripts/fix-concor-sale-cost.mjs          → preview
//   node scripts/fix-concor-sale-cost.mjs --apply  → backup JSON + apply
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const WRONG = 12148;
const CORRECT = 6074;
const p = new PrismaClient();

const org = await p.organization.findFirst({ where: { name: 'دار التفاؤل' }, select: { id: true } });
const lines = await p.saleItem.findMany({
  where: { drug: { tradeName: 'Concor 10mg' }, sale: { branch: { organizationId: org.id } }, cost: WRONG },
  select: { id: true, quantity: true, price: true, cost: true, sale: { select: { invoiceNumber: true, createdAt: true } } },
});
console.log(lines.map((l) => ({ invoice: l.sale.invoiceNumber, soldAt: l.sale.createdAt, qty: l.quantity, price: l.price, cost: l.cost, newCost: CORRECT })));
if (lines.length !== 2) throw new Error(`expected 2 lines, found ${lines.length} — refusing`);

if (APPLY) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.writeFileSync(new URL(`./concor-cost-fix-backup-${stamp}.json`, import.meta.url), JSON.stringify(lines, null, 1));
  await p.$transaction(async (tx) => {
    for (const l of lines) {
      const r = await tx.saleItem.updateMany({ where: { id: l.id, cost: WRONG }, data: { cost: CORRECT } });
      if (r.count !== 1) throw new Error(`sale item changed concurrently: ${l.id}`);
    }
    await tx.auditLog.create({
      data: {
        userId: 'system', userName: 'تصحيح تكاليف الدفعات (سكربت)', action: 'UPDATE', entity: 'SALE_ITEM',
        details: JSON.stringify({ reason: 'packet price saved as strip cost', drug: 'Concor 10mg', from: WRONG, to: CORRECT, invoices: lines.map((l) => l.sale.invoiceNumber) }),
      },
    });
  });
  console.log('APPLIED');
}
await p.$disconnect();
