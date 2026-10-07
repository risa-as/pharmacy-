import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => null }));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn(), resolveUserName: vi.fn() }));
vi.mock('@/app/lib/notifications/notificationTriggers', () => ({ sendAndPersistNotification: vi.fn() }));
import { POST as createDrug } from '../app/api/inventory/create-quick/route';
import { POST as addToBranch } from '../app/api/inventory/add-to-branch/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const secret = 'isolated-mobile-stock-entry-test-secret';
let orgId: string, branchId: string, foreignOrgId: string, foreignBranchId: string, userId: string, token: string;
const drugIds: string[] = [];
const oldSecret = process.env.AUTH_SECRET;
const body = () => ({ barcode: randomUUID(), tradeName: 'Isolated mobile drug', scientificName: '', branchId, price: 1000, costPrice: 500, minStock: 5, maxStock: 100, batchNumber: '', quantity: 3, expiryDate: '2030-01-01T00:00:00.000Z', supplierId: null, unitsPerPack: 2 });
const req = (data: unknown, key = randomUUID()) => new Request('http://localhost/api/inventory/create-quick', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-idempotency-key': key }, body: JSON.stringify(data) });

beforeAll(async () => {
    process.env.AUTH_SECRET = secret;
    orgId = (await db.organization.create({ data: { name: 'Isolated mobile stock entry' } })).id;
    branchId = (await db.branch.create({ data: { name: 'Isolated main', organizationId: orgId } })).id;
    foreignOrgId = (await db.organization.create({ data: { name: 'Isolated foreign stock entry' } })).id;
    foreignBranchId = (await db.branch.create({ data: { name: 'Foreign', organizationId: foreignOrgId } })).id;
    userId = (await db.user.create({ data: { email: `${randomUUID()}@test.invalid`, password: 'unused', role: 'ADMIN', branchId } })).id;
    token = await new SignJWT({ userId, role: 'ADMIN', branchId, organizationId: orgId, sessionVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret));
});

afterAll(async () => {
    try {
        if (branchId) {
            await db.batch.deleteMany({ where: { inventory: { branchId } } });
            await db.inventory.deleteMany({ where: { branchId } });
            await db.syncActionLog.deleteMany({ where: { branchId } });
            await db.globalDrug.deleteMany({ where: { OR: [{ organizationId: orgId }, { id: { in: drugIds } }] } });
            await db.user.deleteMany({ where: { id: userId } });
            await db.branch.deleteMany({ where: { id: { in: [branchId, foreignBranchId] } } });
            await db.organization.deleteMany({ where: { id: { in: [orgId, foreignOrgId] } } });
        }
    } finally {
        if (oldSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = oldSecret;
        await db.$disconnect();
    }
});

it('accepts the mobile payload with a real signed bearer token and creates stock once', async () => {
    const payload = body(), key = randomUUID();
    const response = await createDrug(req(payload, key));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    const inv = result.data.inventory;
    expect(inv).toMatchObject({ branchId, price: 1000, cost: 500 });
    expect(result.data.drug).toMatchObject({ organizationId: orgId, unitsPerPack: 2 });
    const batches = await db.batch.findMany({ where: { inventoryId: inv.id } });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ quantity: 3, initialQuantity: 3, costPrice: 500 });
    expect((await (await createDrug(req(payload, key))).json()).ack.status).toBe('duplicate');
    expect(await db.batch.count({ where: { inventoryId: inv.id } })).toBe(1);
});

it('returns a missing-branch error before any product or stock is written', async () => {
    const payload = { ...body(), branchId: null };
    expect((await createDrug(req(payload))).status).toBe(400);
    expect(await db.globalDrug.count({ where: { barcode: payload.barcode } })).toBe(0);
});

it('rejects the same mobile token when the inventory permission is withdrawn', async () => {
    const payload = body();
    await db.user.update({ where: { id: userId }, data: { permissions: JSON.stringify({ canAddDrug: false }) } });
    try {
        const response = await createDrug(req(payload));
        expect(response.status).toBe(403);
        expect((await response.json()).message).toBe('ليس لديك صلاحية إضافة المخزون');
        expect(await db.globalDrug.count({ where: { barcode: payload.barcode } })).toBe(0);
    } finally { await db.user.update({ where: { id: userId }, data: { permissions: null } }); }
});

it('rejects a different institution branch without creating the product', async () => {
    const payload = { ...body(), branchId: foreignBranchId };
    expect((await createDrug(req(payload))).status).toBe(403);
    expect(await db.globalDrug.count({ where: { barcode: payload.barcode } })).toBe(0);
});

it('adds a shared existing drug through the mobile branch flow', async () => {
    const drug = await db.globalDrug.create({ data: { barcode: randomUUID(), tradeName: 'Shared isolated drug', scientificName: 'Isolated', alternatives: [] } });
    drugIds.push(drug.id);
    const response = await addToBranch(req({ drugId: drug.id, branchId, price: 1000, cost: 500, quantity: 2, expiryDate: '2030-01-01T00:00:00.000Z', unitsPerPack: 2 }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(await db.batch.findMany({ where: { inventoryId: result.data.id } })).toMatchObject([{ quantity: 2, costPrice: 500 }]);
});
