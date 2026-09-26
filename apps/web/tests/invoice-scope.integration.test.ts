import { afterAll, beforeEach, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const url = process.env.TEST_DATABASE_URL!;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/faramace_readiness') throw Error('Isolated DB required');
const db = new PrismaClient({ datasources: { db: { url } } });
let a: any, b: any, c: any;
beforeEach(async () => {
  const first = await db.organization.create({ data: { name: 'invoice-a-' + randomUUID() } });
  const second = await db.organization.create({ data: { name: 'invoice-b-' + randomUUID() } });
  a = await db.branch.create({ data: { name: 'A', organizationId: first.id } });
  b = await db.branch.create({ data: { name: 'B', organizationId: first.id } });
  c = await db.branch.create({ data: { name: 'C', organizationId: second.id } });
});
afterAll(() => db.$disconnect());
const sale = (branchId: string, invoiceNumber: number | null, invoiceOrganizationId?: string) => db.sale.create({ data: { branchId, invoiceNumber, total: 100, ...(invoiceOrganizationId ? { invoiceOrganizationId } : {}) } });
it('derives scope for legacy writers and ignores a forged organization', async () => {
  expect((await sale(a.id, 1, c.organizationId)).invoiceOrganizationId).toBe(a.organizationId);
  await expect(sale(b.id, 1, c.organizationId)).rejects.toMatchObject({ code: 'P2002' });
  expect((await sale(c.id, 1)).invoiceNumber).toBe(1);
});
it('allows only one concurrent invoice number across branches of an organization', async () => {
  const results = await Promise.allSettled([sale(a.id, 2), sale(b.id, 2)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(await db.sale.count({ where: { invoiceOrganizationId: a.organizationId, invoiceNumber: 2 } })).toBe(1);
});
it('allows unnumbered documents but rejects a duplicate assigned later', async () => {
  const x = await sale(a.id, null), y = await sale(a.id, null);
  await db.sale.update({ where: { id: x.id }, data: { invoiceNumber: 3 } });
  await expect(db.sale.update({ where: { id: y.id }, data: { invoiceNumber: 3 } })).rejects.toMatchObject({ code: 'P2002' });
});
it('rejects moving a document into a conflicting scope without partial changes', async () => {
  await sale(a.id, 4); const foreign = await sale(c.id, 4);
  await expect(db.sale.update({ where: { id: foreign.id }, data: { branchId: b.id } })).rejects.toMatchObject({ code: 'P2002' });
  expect((await db.sale.findUniqueOrThrow({ where: { id: foreign.id } })).branchId).toBe(c.id);
});
it('propagates branch ownership and rolls back a conflicting branch move', async () => {
  const x = await sale(a.id, 5);
  await db.branch.update({ where: { id: a.id }, data: { organizationId: c.organizationId } });
  expect((await db.sale.findUniqueOrThrow({ where: { id: x.id } })).invoiceOrganizationId).toBe(c.organizationId);
  await sale(b.id, 5);
  await expect(db.branch.update({ where: { id: b.id }, data: { organizationId: c.organizationId } })).rejects.toMatchObject({ code: 'P2002' });
  expect((await db.branch.findUniqueOrThrow({ where: { id: b.id } })).organizationId).not.toBe(c.organizationId);
});
