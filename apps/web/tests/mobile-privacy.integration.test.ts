// A minimal AuditLog-only fixture on the isolated readiness database.
// This verifies persistence/locking, not the migration chain or authentication.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
import { createPrivacyRequest, updatePrivacyRequest } from '../app/lib/privacy-requests';
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const marker = 'privacy-test-' + randomUUID();
const owner = { user: { id: marker, name: 'Synthetic user', role: 'PHARMACIST' }, organizationId: marker + '-org' } as any;
const admin = { user: { id: marker + '-admin', name: 'Synthetic admin', role: 'SUPER_ADMIN' } } as any;
afterAll(async () => {
    await db.auditLog.deleteMany({ where: { userId: { in: [owner.user.id, admin.user.id] } } });
    await db.$disconnect();
});
describe('durable mobile privacy request', () => {
    let requestId: string;
    it('serializes simultaneous requests with different client ids into one open request', async () => {
        const results = await Promise.all([createPrivacyRequest(owner, randomUUID()), createPrivacyRequest(owner, randomUUID())]);
        expect(results[0].id).toBe(results[1].id);
        requestId = results[0].id;
        expect(results[0].status).toBe('REQUESTED');
        expect(await db.auditLog.count({ where: { userId: marker, action: 'REQUEST' } })).toBe(1);
    });
    it('replays a saved client id without making another request', async () => {
        const result = await createPrivacyRequest(owner, requestId.slice(marker.length + 1));
        expect(result.id).toBe(requestId);
        expect(result.organizationId).toBe(owner.organizationId);
        expect(await db.auditLog.count({ where: { userId: marker, action: 'REQUEST' } })).toBe(1);
    });
    it('persists status and a separate history event without deleting data', async () => {
        const result = await updatePrivacyRequest(admin, requestId, 'IN_REVIEW', 'مراجعة تجريبية للطلب فقط');
        expect(result?.status).toBe('IN_REVIEW');
        expect(await db.auditLog.count({ where: { userId: marker, action: 'REQUEST' } })).toBe(1);
        expect(await db.auditLog.count({ where: { userId: admin.user.id, entityId: requestId, action: 'UPDATE' } })).toBe(1);
    });
});
