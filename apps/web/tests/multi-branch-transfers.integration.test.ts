// Synthetic two-branch pharmacy plus an unrelated pharmacy. The database,
// tenant context, live permissions, plan gate and transfer transactions are real.
// Only the request identity/Next request context are simulated here; HTTP is
// verified separately by the release evidence script.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { GET as inventoryPage } from '../app/api/inventory/page/route';
import { GET as patients } from '../app/api/patients/route';
import { GET as patientDetail, PATCH as patchPatient } from '../app/api/patients/[id]/route';
import { GET as sales } from '../app/api/sales/route';
import { GET as transfers, POST as send } from '../app/api/inventory/transfers/route';
import { PUT as receive } from '../app/api/inventory/transfers/[id]/receive/route';
import { getAllDebtors, getPatientDebts } from '../app/lib/actions/debt';
import { getExpenses } from '../app/lib/actions/expense-actions';
import TransferCreatePage from '../app/dashboard/inventory/transfers/create/page';
import TransferListPage from '../app/dashboard/inventory/transfers/page';
import { getSafes, getSafesForOrg } from '../app/lib/actions/finance-actions';
import { GET as saleDetail } from '../app/api/sales/[id]/route';
import { POST as payDebt } from '../app/api/debts/pay/route';
import { PATCH as patchBatch } from '../app/api/batches/[id]/route';
import { POST as createStocktake } from '../app/api/inventory/stocktake/route';
import { POST as saleReturn } from '../app/api/sales/[id]/return/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const tag = 'MB-' + randomUUID();
let f: any;
const as = (user: any) => { state.session = { user: { id: user.id, role: user.role, branchId: user.branchId } }; };
const req = (path: string, method = 'GET', body?: any) => new NextRequest('http://localhost' + path, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const read = async (fn: (r: any) => Promise<Response>, path: string) => {
  const r = await fn(req(path)); expect(r.status).toBe(200); return r.json();
};
const stock = async (inventoryId: string) => (await db.batch.aggregate({ where: { inventoryId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
const snapshot = async () => ({
  batches: await db.batch.findMany({ where: { inventory: { branchId: { in: f.branchIds } } }, orderBy: { id: 'asc' }, select: { id: true, quantity: true, initialQuantity: true, costPrice: true } }),
  transfers: await db.transfer.findMany({ where: { fromBranchId: { in: f.branchIds } }, orderBy: { id: 'asc' }, include: { items: true } }),
  safes: await db.safe.findMany({ where: { branchId: { in: f.branchIds } }, orderBy: { id: 'asc' }, select: { id: true, balance: true } }),
  movements: await db.transaction.count({ where: { safe: { branchId: { in: f.branchIds } } } }),
  patientBalances: await db.patient.findMany({ where: { branchId: { in: f.branchIds } }, select: { id: true, balance: true }, orderBy: { id: 'asc' } }),
  debtPayments: await db.debtPayment.count({ where: { sale: { branchId: { in: f.branchIds } } } }),
});
async function fixtureStock(options: { quantity?: number; destination?: boolean; expired?: boolean; batchNumber?: string } = {}) {
  const drug = await db.globalDrug.create({ data: { organizationId: f.org.id, barcode: tag + randomUUID(), tradeName: tag + ' private drug', scientificName: 'Test', alternatives: [] } });
  f.drugIds.push(drug.id);
  const inv = await db.inventory.create({ data: { branchId: f.a1.id, drugId: drug.id, price: 1200, cost: 500 } });
  const batch = await db.batch.create({ data: { inventoryId: inv.id, quantity: options.quantity ?? 10, initialQuantity: options.quantity ?? 10, batchNumber: options.batchNumber ?? 'ORIGINAL', costPrice: 500, expiryDate: new Date(Date.now() + (options.expired ? -1 : 365) * 86400000) } });
  const dest = options.destination ? await db.inventory.create({ data: { branchId: f.a2.id, drugId: drug.id, price: 1500, cost: 700 } }) : null;
  return { drug, inv, batch, dest };
}
const body = (batch: any, quantity = 3, extra = {}) => ({ fromBranchId: f.a1.id, toBranchId: f.a2.id, items: [{ batchId: batch.id, quantity }], idempotencyKey: randomUUID(), ...extra });
async function created(payload: any) {
  const r = await send(req('/api/inventory/transfers', 'POST', payload)); expect(r.status).toBe(200);
  const data = await r.json(); expect(data.success).toBe(true); return data.transfer;
}

beforeAll(async () => {
  const plan = await db.subscriptionPlan.create({ data: { name: tag, maxBranches: 3, features: { interBranchTransfers: true, branchManagement: true } } });
  const org = await db.organization.create({ data: { name: tag + ' Pharmacy A', planId: plan.id } });
  const foreignOrg = await db.organization.create({ data: { name: tag + ' Pharmacy B', planId: plan.id } });
  const a1 = await db.branch.create({ data: { name: tag + ' A1', organizationId: org.id } });
  const a2 = await db.branch.create({ data: { name: tag + ' A2', organizationId: org.id } });
  const b1 = await db.branch.create({ data: { name: tag + ' B1', organizationId: foreignOrg.id } });
  const mk = (branchId: string, role: any) => db.user.create({ data: { email: randomUUID() + '@test.invalid', name: tag, password: 'not-used', branchId, role, permissions: JSON.stringify({ canTransferStock: true }) } });
  const admin = await mk(a1.id, 'ADMIN'), staff1 = await mk(a1.id, 'PHARMACIST'), staff2 = await mk(a2.id, 'PHARMACIST'), outsider = await mk(b1.id, 'ADMIN');
  const drug = await db.globalDrug.create({ data: { barcode: tag, tradeName: tag, scientificName: 'Shared', alternatives: [] } });
  const invs: any[] = [], people: any[] = [], invoices: any[] = [];
  for (const [branch, user, amount] of [[a1, staff1, 101], [a2, staff2, 202], [b1, outsider, 909]] as const) {
    const inv = await db.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: amount, cost: amount / 2 } });
    await db.batch.create({ data: { inventoryId: inv.id, quantity: amount, initialQuantity: amount, batchNumber: branch.name, expiryDate: new Date(Date.now() + 365 * 86400000), costPrice: amount / 2 } });
    invs.push(inv);
    const p = await db.patient.create({ data: { name: branch.name, phone: randomUUID(), branchId: branch.id, balance: amount, allergies: [], chronicDiseases: [] } }); people.push(p);
    const sale = await db.sale.create({ data: { branchId: branch.id, userId: user.id, patientId: p.id, total: amount } }); invoices.push(sale);
    await db.payment.create({ data: { saleId: sale.id, amount, method: 'CREDIT' } });
    await db.expense.create({ data: { branchId: branch.id, amount, category: branch.name } });
    await db.safe.create({ data: { branchId: branch.id, name: branch.name, balance: amount } });
  }
  f = { plan, org, foreignOrg, a1, a2, b1, admin, staff1, staff2, outsider, drug, invs, people, invoices, branchIds: [a1.id, a2.id, b1.id], userIds: [admin.id, staff1.id, staff2.id, outsider.id], drugIds: [drug.id] };
});
beforeEach(() => as(f.staff1));
afterAll(async () => {
  if (f) {
    const bs = { in: f.branchIds };
    await db.auditLog.deleteMany({ where: { userId: { in: f.userIds } } });
    await db.transfer.deleteMany({ where: { fromBranchId: bs } });
    await db.batch.deleteMany({ where: { inventory: { branchId: bs } } });
    await db.inventory.deleteMany({ where: { branchId: bs } });
    await db.payment.deleteMany({ where: { sale: { branchId: bs } } });
    await db.debtPayment.deleteMany({ where: { sale: { branchId: bs } } });
    await db.sale.deleteMany({ where: { branchId: bs } });
    await db.expense.deleteMany({ where: { branchId: bs } });
    await db.safe.deleteMany({ where: { branchId: bs } });
    await db.patient.deleteMany({ where: { branchId: bs } });
    await db.user.deleteMany({ where: { id: { in: f.userIds } } });
    await db.branch.deleteMany({ where: { id: bs } });
    await db.invoiceCounter.deleteMany({ where: { organizationId: { in: [f.org.id, f.foreignOrg.id] } } });
    await db.globalDrug.deleteMany({ where: { id: { in: f.drugIds } } });
    await db.organization.deleteMany({ where: { id: { in: [f.org.id, f.foreignOrg.id] } } });
    await db.subscriptionPlan.delete({ where: { id: f.plan.id } });
  }
  await db.$disconnect();
});

it('branch staff see only their own inventory, prices and totals; branch parameters cannot widen scope', async () => {
  const own = await read(inventoryPage, '/api/inventory/page');
  expect(own.items.map((x: any) => x.id)).toEqual([f.invs[0].id]); expect(own.totalValue).toBe(101 * 101);
  for (const branch of [f.a2, f.b1]) {
    const data = await read(inventoryPage, '/api/inventory/page?branchId=' + branch.id);
    expect(data.items).toEqual([]); expect(data.totalValue).toBe(0); expect(data.counts.all).toBe(0);
  }
  as(f.staff2); expect((await read(inventoryPage, '/api/inventory/page')).items.map((x: any) => x.id)).toEqual([f.invs[1].id]);
});
it('organization admin sees two own branches, can narrow to one, and never sees another pharmacy', async () => {
  as(f.admin);
  expect((await read(inventoryPage, '/api/inventory/page')).items.map((x: any) => x.branchId).sort()).toEqual([f.a1.id, f.a2.id].sort());
  expect((await read(inventoryPage, '/api/inventory/page?branchId=' + f.a2.id)).items.map((x: any) => x.id)).toEqual([f.invs[1].id]);
  expect((await read(inventoryPage, '/api/inventory/page?branchId=' + f.b1.id)).total).toBe(0);
});
it('patients and sale lists stay within the branch; administrators see only their organization', async () => {
  for (const [user, indices] of [[f.staff1, [0]], [f.staff2, [1]], [f.admin, [0, 1]], [f.outsider, [2]]] as const) {
    as(user);
    expect((await read(patients, '/api/patients?query=' + encodeURIComponent(tag))).map((x: any) => x.id).sort()).toEqual(indices.map(i => f.people[i].id).sort());
    expect((await read(sales, '/api/sales')).map((x: any) => x.id).sort()).toEqual(indices.map(i => f.invoices[i].id).sort());
  }
});
it('direct patient reads and writes refuse another branch or pharmacy and leave data unchanged', async () => {
  for (const p of [f.people[1], f.people[2]]) {
    const before = await db.patient.findUnique({ where: { id: p.id } });
    expect((await patientDetail(req('/api/patients/' + p.id), params(p.id))).status).toBe(404);
    expect((await patchPatient(req('/api/patients/' + p.id, 'PATCH', { name: 'unauthorized', branchId: f.a1.id }), params(p.id))).status).toBe(404);
    expect(await db.patient.findUnique({ where: { id: p.id } })).toEqual(before);
  }
  as(f.admin); expect((await patientDetail(req('/x'), params(f.people[1].id))).status).toBe(200);
  expect((await patientDetail(req('/x'), params(f.people[2].id))).status).toBe(404);
});
it('debt and expense reads cannot widen branch or organization scope', async () => {
  expect((await getAllDebtors()).map((x: any) => x.id)).toEqual([f.people[0].id]);
  for (const b of [f.a2, f.b1]) { expect(await getAllDebtors(b.id)).toEqual([]); expect(await getExpenses(b.id)).toEqual([]); }
  as(f.admin); expect((await getAllDebtors()).map((x: any) => x.id).sort()).toEqual(f.people.slice(0, 2).map((x: any) => x.id).sort());
  expect(await getAllDebtors(f.b1.id)).toEqual([]); expect(await getExpenses(f.b1.id)).toEqual([]);
});
it('destination lists contain only other branches in the same pharmacy', async () => {
  expect((await read(transfers, '/api/inventory/transfers?type=destinations')).branches).toEqual([{ id: f.a2.id, name: f.a2.name }]);
  for (const branch of [f.a2, f.b1]) expect((await transfers(req('/api/inventory/transfers?branchId=' + branch.id))).status).toBe(403);
});
it('the transfer page allows an admin to select an authorized destination branch and refuses widened scope', async () => {
  function selectedBranch(node: any): string | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (node?.props?.branchId && node.props.tab) return node.props.branchId;
    for (const child of [node?.props?.children].flat(Infinity)) {
      const found = selectedBranch(child); if (found) return found;
    }
  }
  as(f.admin);
  expect(selectedBranch(await TransferListPage({ searchParams: Promise.resolve({ branch: f.a2.id }) }))).toBe(f.a2.id);
  await expect(TransferListPage({ searchParams: Promise.resolve({ branch: f.b1.id }) })).rejects.toThrow(/404/);
  as(f.staff1);
  expect(selectedBranch(await TransferListPage({ searchParams: Promise.resolve({}) }))).toBe(f.a1.id);
  await expect(TransferListPage({ searchParams: Promise.resolve({ branch: f.a2.id }) })).rejects.toThrow(/404/);
});
it('patient debt detail subtracts returns before payments without altering the recorded invoice', async () => {
  const sale = f.invoices[0];
  const returned = await db.saleReturn.create({ data: { saleId: sale.id, branchId: f.a1.id, total: 30 } });
  const paid = await db.debtPayment.create({ data: { saleId: sale.id, amount: 20, method: 'CASH' } });
  try {
    const detail = await getPatientDebts(f.people[0].id);
    expect(detail?.sales.find((s: any) => s.id === sale.id)).toMatchObject({ total: 101, returnedTotal: 30, netTotal: 71, totalPaid: 20, remaining: 51, isPaid: false });
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).total).toBe(101);
  } finally {
    await db.debtPayment.delete({ where: { id: paid.id } });
    await db.saleReturn.delete({ where: { id: returned.id } });
  }
});
function formProps(node: any): any {
  if (!node) return undefined;
  if (node.props?.availableStock && node.props?.branches) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) { const found = formProps(child); if (found) return found; }
}
it('the actual create page never embeds other pharmacies destinations and supplies original batch ids', async () => {
  const s = await fixtureStock();
  const page = await TransferCreatePage(); const props = formProps(page);
  expect(props).toBeDefined();
  expect(props.branches).toEqual([{ id: f.a2.id, name: f.a2.name }]);
  expect(props.availableStock.find((x: any) => x.drugId === s.drug.id)).toMatchObject({ batchId: s.batch.id, availableQuantity: 10 });
});
it('safe balances and invoice/debtor details cannot be read through another branch id', async () => {
  expect((await getSafes(f.a1.id))).toHaveLength(1);
  for (const b of [f.a2, f.b1]) expect(await getSafes(b.id)).toEqual([]);
  expect(await getSafesForOrg(f.foreignOrg.id)).toEqual([]);
  for (const i of [1, 2]) {
    expect((await saleDetail(req('/x'), params(f.invoices[i].id))).status).toBe(404);
    expect(await getPatientDebts(f.people[i].id)).toBeNull();
  }
  as(f.admin); expect(await getSafesForOrg(f.org.id)).toHaveLength(2);
  expect((await saleDetail(req('/x'), params(f.invoices[1].id))).status).toBe(200);
  expect((await saleDetail(req('/x'), params(f.invoices[2].id))).status).toBe(404);
});
it('debt collection refuses patients from a sibling branch or another pharmacy before changing balances', async () => {
  for (const p of f.people.slice(1)) {
    const before = await snapshot();
    expect((await payDebt(req('/api/debts/pay', 'POST', { patientId: p.id, amount: 1 }))).status).toBe(404);
    expect(await snapshot()).toEqual(before);
  }
});
it('stocktake creation, batch edits and sale returns cannot write another branch or pharmacy', async () => {
  for (const i of [1, 2]) {
    const batch = await db.batch.findFirstOrThrow({ where: { inventoryId: f.invs[i].id } }); const before = await snapshot();
    const stocktakes = await db.stocktake.count({ where: { branchId: f.branchIds[i] } });
    expect((await createStocktake(req('/x', 'POST', { branchId: f.branchIds[i] }))).status).toBe(403);
    expect(await db.stocktake.count({ where: { branchId: f.branchIds[i] } })).toBe(stocktakes);
    expect((await patchBatch(req('/x', 'PATCH', { quantity: 0, costPrice: 1 }), params(batch.id))).status).toBe(403);
    expect((await saleReturn(req('/x', 'POST', { items: [{ drugId: f.drug.id, quantity: 1 }] }), params(f.invoices[i].id))).status).toBe(403);
    expect(await snapshot()).toEqual(before);
  }
});
it('transfer keeps both batches, expiry dates and costs; destination stock changes only on receipt', async () => {
  const s = await fixtureStock({ destination: true });
  const second = await db.batch.create({ data: { inventoryId: s.inv.id, batchNumber: 'SECOND', quantity: 5, initialQuantity: 5, costPrice: 600, expiryDate: new Date(Date.now() + 700 * 86400000) } });
  const before = await snapshot();
  const t = await created(body(s.batch, 3, { items: [{ batchId: s.batch.id, quantity: 3 }, { batchId: second.id, quantity: 2 }] }));
  expect(t.status).toBe('IN_TRANSIT'); expect(t.items).toHaveLength(2);
  expect(await stock(s.inv.id)).toBe(10); expect(await stock(s.dest.id)).toBe(0);
  expect((await snapshot()).safes).toEqual(before.safes); expect((await snapshot()).movements).toBe(before.movements);
  expect((await receive(req('/x', 'PUT'), params(t.id))).status).toBe(409); // sender staff cannot receive for destination
  as(f.staff2); expect((await receive(req('/x', 'PUT'), params(t.id))).status).toBe(200);
  const batches = await db.batch.findMany({ where: { inventoryId: s.dest.id }, orderBy: { costPrice: 'asc' } });
  expect(batches.map(b => [b.batchNumber, b.quantity, b.initialQuantity, b.costPrice, b.expiryDate.toISOString()])).toEqual([
    ['ORIGINAL', 3, 3, 500, s.batch.expiryDate.toISOString()], ['SECOND', 2, 2, 600, second.expiryDate.toISOString()],
  ]);
  expect(await stock(s.inv.id) + await stock(s.dest.id)).toBe(15);
  expect(await db.inventory.findUnique({ where: { id: s.dest.id } })).toMatchObject({ price: 1500, cost: 700 });
  expect((await db.transfer.findUnique({ where: { id: t.id } }))?.status).toBe('COMPLETED');
  expect(await db.auditLog.count({ where: { entity: 'TRANSFER', entityId: t.id } })).toBe(2);
  const after = await snapshot(); expect(after.safes).toEqual(before.safes); expect(after.movements).toBe(before.movements);
});
it('receipt creates a missing destination inventory and preserves source selling price', async () => {
  const s = await fixtureStock(); const t = await created(body(s.batch)); as(f.staff2);
  expect((await receive(req('/x', 'PUT'), params(t.id))).status).toBe(200);
  const inv = await db.inventory.findUniqueOrThrow({ where: { drugId_branchId: { drugId: s.drug.id, branchId: f.a2.id } } });
  expect(inv).toMatchObject({ price: 1200, cost: 500 }); expect(await stock(inv.id)).toBe(3);
});
it('an ambiguous batch number is refused; the exact batch id safely identifies the intended stock', async () => {
  const s = await fixtureStock();
  await db.batch.create({ data: { inventoryId: s.inv.id, batchNumber: s.batch.batchNumber, quantity: 4, initialQuantity: 4, expiryDate: new Date(Date.now() + 700 * 86400000), costPrice: 600 } });
  const before = await snapshot();
  expect((await send(req('/x', 'POST', body(s.batch, 2, { items: [{ drugId: s.drug.id, batchNumber: s.batch.batchNumber, quantity: 2 }] })))).status).toBe(409);
  expect(await snapshot()).toEqual(before);
  await created(body(s.batch, 2)); expect((await db.batch.findUniqueOrThrow({ where: { id: s.batch.id } })).quantity).toBe(8);
});
it('repeated send and receipt (lost responses) decrement and increment exactly once', async () => {
  const s = await fixtureStock(); const payload = body(s.batch); const t = await created(payload);
  expect((await created(payload)).id).toBe(t.id); expect(await stock(s.inv.id)).toBe(7);
  as(f.staff2); const r = await receive(req('/x', 'PUT'), params(t.id)); expect(r.status).toBe(200);
  const replay = await receive(req('/x', 'PUT'), params(t.id)); expect(await replay.json()).toMatchObject({ success: true, replayed: true });
  expect(await db.batch.count({ where: { inventory: { drugId: s.drug.id, branchId: f.a2.id } } })).toBe(1);
});
it('concurrent duplicate sends and receipts produce one transfer and one destination batch', async () => {
  const s = await fixtureStock({ quantity: 3 }); const payload = body(s.batch);
  const results = await Promise.all([send(req('/x', 'POST', payload)), send(req('/x', 'POST', payload))]);
  expect(results.map(r => r.status)).toEqual([200, 200]);
  const [a, b] = await Promise.all(results.map(r => r.json())); expect(a.transfer.id).toBe(b.transfer.id); expect(await stock(s.inv.id)).toBe(0);
  as(f.staff2); const rs = await Promise.all([receive(req('/x', 'PUT'), params(a.transfer.id)), receive(req('/x', 'PUT'), params(a.transfer.id))]);
  expect(rs.map(r => r.status)).toEqual([200, 200]);
  expect(await db.batch.count({ where: { inventory: { drugId: s.drug.id, branchId: f.a2.id } } })).toBe(1);
});
it('concurrent distinct transfers never oversell the last stock', async () => {
  const s = await fixtureStock({ quantity: 3 });
  const rs = await Promise.all([send(req('/x', 'POST', body(s.batch))), send(req('/x', 'POST', body(s.batch)))]);
  expect(rs.map(r => r.status).sort()).toEqual([200, 409]); expect(await stock(s.inv.id)).toBe(0);
  expect(await db.transferItem.count({ where: { drugId: s.drug.id } })).toBe(1);
});
it('same attempt with changed data is refused and leaves every balance and stock unchanged', async () => {
  const s = await fixtureStock(); const payload = body(s.batch); await created(payload); const before = await snapshot();
  expect((await send(req('/x', 'POST', { ...payload, items: [{ batchId: s.batch.id, quantity: 4 }] }))).status).toBe(409);
  expect(await snapshot()).toEqual(before);
});
for (const attack of ['foreign destination', 'foreign source', 'other branch source', 'foreign batch', 'same branch', 'expired batch', 'insufficient stock', 'duplicate batch', 'invalid quantity', 'missing key', 'mixed valid and insufficient'] as const) {
  it('refuses ' + attack + ' without any partial stock, transfer or cash mutation', async () => {
    const s = await fixtureStock({ expired: attack === 'expired batch' }); let payload: any = body(s.batch);
    if (attack === 'foreign destination') payload.toBranchId = f.b1.id;
    if (attack === 'foreign source') payload.fromBranchId = f.b1.id;
    if (attack === 'other branch source') payload.fromBranchId = f.a2.id;
    if (attack === 'foreign batch') payload.items[0].batchId = (await db.batch.findFirstOrThrow({ where: { inventoryId: f.invs[2].id } })).id;
    if (attack === 'same branch') payload.toBranchId = f.a1.id;
    if (attack === 'insufficient stock') payload.items[0].quantity = 11;
    if (attack === 'duplicate batch') payload.items.push({ ...payload.items[0] });
    if (attack === 'invalid quantity') payload.items[0].quantity = 1.5;
    if (attack === 'missing key') delete payload.idempotencyKey;
    if (attack === 'mixed valid and insufficient') { const second = await fixtureStock({ quantity: 1 }); payload.items.push({ batchId: second.batch.id, quantity: 2 }); }
    const before = await snapshot(); expect((await send(req('/x', 'POST', payload))).status).toBe(409); expect(await snapshot()).toEqual(before);
  });
}
it('another pharmacy cannot read a transfer by id or receive it', async () => {
  const s = await fixtureStock(); const t = await created(body(s.batch)); as(f.outsider); const before = await snapshot();
  expect((await read(transfers, '/api/inventory/transfers?id=' + t.id)).transfers).toEqual([]);
  expect((await receive(req('/x', 'PUT'), params(t.id))).status).toBe(409); expect(await snapshot()).toEqual(before);
});
it('revoking transfer permission in the database takes effect immediately', async () => {
  const s = await fixtureStock(); const before = await snapshot();
  await db.user.update({ where: { id: f.staff1.id }, data: { permissions: JSON.stringify({ canTransferStock: false }) } });
  try { expect((await send(req('/x', 'POST', body(s.batch)))).status).toBe(403); expect((await transfers(req('/x'))).status).toBe(403); expect(await snapshot()).toEqual(before); }
  finally { await db.user.update({ where: { id: f.staff1.id }, data: { permissions: JSON.stringify({ canTransferStock: true }) } }); }
});
it('disabled plan blocks transfers even when employee permission is granted', async () => {
  const s = await fixtureStock(); const before = await snapshot();
  await db.subscriptionPlan.update({ where: { id: f.plan.id }, data: { features: { interBranchTransfers: false } } });
  try { expect((await send(req('/x', 'POST', body(s.batch)))).status).toBe(403); expect(await snapshot()).toEqual(before); }
  finally { await db.subscriptionPlan.update({ where: { id: f.plan.id }, data: { features: { interBranchTransfers: true } } }); }
});
