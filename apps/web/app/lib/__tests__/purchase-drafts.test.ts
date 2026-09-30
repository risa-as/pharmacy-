import { describe, expect, it, vi } from 'vitest';
import { computeDraftMetrics, type DraftForMetrics } from '../purchase-draft-metrics';
import { isDraftId, orderRequestBody, draftIdFromSaved, draftIdAfterStartNew, registerDraft, draftIsComplete, closeDraft } from '../purchase-draft-client';
import { buildHandoff } from '../smart-purchasing-handoff';
import { buildSendGroups, restoreSendGroups, buildOrderPayload } from '../warehouse-order-grouping';
import { sameOptions, describeOptions, DEFAULT_PLANNING_OPTIONS } from '../purchase-planning-shared';

const t0 = new Date('2026-09-30T08:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * 60000);
const line = (drugId: string, draftPacks: number, extra: Partial<DraftForMetrics['lines'][number]> = {}) =>
    ({ drugId, barcode: 'B-' + drugId, suggestedUnits: draftPacks * 10, draftUnits: draftPacks * 10, unitsPerPack: 10, draftPacks, ...extra });

describe('draft → order measurement (OPEN-14)', () => {
    it('the example: 15 suggested, packs of 12 → 2 packs = 9 units of rounding; sending 3 packs = +12 by the user', () => {
        const d: DraftForMetrics = {
            id: 'e', source: 'AI_CARD', createdAt: t0, importedAt: at(1), completedAt: at(5),
            lines: [{ drugId: 'p', barcode: null, suggestedUnits: 15, draftUnits: 15, unitsPerPack: 12, draftPacks: 2 }],
            orders: [{ createdAt: at(5), items: [{ drugId: 'p', barcode: null, quantity: 3 }] }],
        };
        const m = computeDraftMetrics([d]);
        expect(m.units).toEqual({
            suggested: 15, sent: 36,
            pageChange: { increase: 0, decrease: 0, net: 0 },
            rounding: 9,
            formChange: { increase: 12, decrease: 0, net: 12 },
            final: { increase: 21, decrease: 0, net: 21 },
        });
    });

    it('one draft sent as two warehouse orders: units per cause, increases and decreases kept apart', () => {
        const draft: DraftForMetrics = {
            id: 'd1', source: 'SMART_PAGE', createdAt: t0, importedAt: at(1), completedAt: at(12),
            // c: the page lowered 40 → 35 units (4 packs of 10 = 5 units of rounding).
            lines: [line('a', 3), line('b', 2), line('c', 4, { draftUnits: 35, suggestedUnits: 40 })],
            orders: [
                { createdAt: at(10), items: [{ drugId: 'a', barcode: 'B-a', quantity: 2 }, { drugId: 'c', barcode: 'B-c', quantity: 3 }] },
                // Same drug from a second warehouse, a catalogue id matched by barcode, and an extra item.
                { createdAt: at(12), items: [{ drugId: 'a', barcode: 'B-a', quantity: 1 }, { drugId: 'global-b', barcode: 'B-b', quantity: 5 }, { drugId: 'x', barcode: 'B-x', quantity: 1 }] },
            ],
        };
        const m = computeDraftMetrics([draft]);
        expect(m).toMatchObject({ drafts: 1, imported: 1, ordered: 1, completed: 1, orders: 2, orderRate: 1 });
        expect(m.lines).toEqual({ total: 3, changedBeforeDraft: 1, ordered: 3, changedInForm: 2, removed: 0, notSentYet: 0, added: 1, packSizeMismatch: 0 });
        // a: 30 → 30. b: 20 → 50 (+30 in the form). c: 40 → 35 on the page, +5 rounding, 4 → 3 packs (−10) = 30 (−10).
        expect(m.units).toEqual({
            suggested: 90, sent: 110,
            pageChange: { increase: 0, decrease: 5, net: -5 },
            rounding: 5,
            formChange: { increase: 30, decrease: 10, net: 20 },
            final: { increase: 30, decrease: 10, net: 20 },
        });
        // The identity holds: final = page + rounding + form.
        expect(m.units.final.net).toBe(m.units.pageChange.net + m.units.rounding + m.units.formChange.net);
        expect(m.medianMinutesToFirstOrder).toBe(10);
    });

    it('an unsent line is "not sent yet" while the draft is open and "removed" only once it is closed', () => {
        const open: DraftForMetrics = {
            id: 'o', source: 'SMART_PAGE', createdAt: t0, importedAt: at(1), completedAt: null,
            lines: [line('a', 1), line('b', 1)],
            orders: [{ createdAt: at(3), items: [{ drugId: 'a', barcode: null, quantity: 1 }] }],
        };
        expect(computeDraftMetrics([open]).lines).toMatchObject({ ordered: 1, notSentYet: 1, removed: 0 });
        expect(computeDraftMetrics([{ ...open, completedAt: at(9) }]).lines).toMatchObject({ ordered: 1, notSentYet: 0, removed: 1 });
    });

    it('a sent item with another pack size is counted apart, never mixed into the unit figures', () => {
        const d: DraftForMetrics = {
            id: 'm', source: 'SMART_PAGE', createdAt: t0, importedAt: null, completedAt: null,
            lines: [line('a', 2), line('b', 1)],
            orders: [{ createdAt: at(2), items: [{ drugId: 'a', barcode: null, quantity: 2, unitsPerPack: 20 }, { drugId: 'b', barcode: null, quantity: 1, unitsPerPack: 10 }] }],
        };
        const m = computeDraftMetrics([d]);
        expect(m.lines).toMatchObject({ ordered: 2, packSizeMismatch: 1 });
        expect(m.units).toMatchObject({ suggested: 10, sent: 10 });
    });

    it('drafts without an order count in the rate but not as unsent lines', () => {
        const sent: DraftForMetrics = { id: 's', source: 'AI_CARD', createdAt: t0, importedAt: at(1), completedAt: at(4), lines: [line('a', 1)], orders: [{ createdAt: at(4), items: [{ drugId: 'a', barcode: null, quantity: 1 }] }] };
        const idle: DraftForMetrics = { id: 'i', source: 'SMART_PAGE', createdAt: t0, importedAt: null, completedAt: null, lines: [line('a', 1), line('b', 1)], orders: [] };
        const opened: DraftForMetrics = { ...idle, id: 'o', importedAt: at(2) };
        const m = computeDraftMetrics([sent, idle, opened]);
        expect(m).toMatchObject({ drafts: 3, imported: 2, ordered: 1, bySource: { SMART_PAGE: 2, AI_CARD: 1 } });
        expect(m.orderRate).toBeCloseTo(1 / 3);
        expect(m.orderRateOfImported).toBe(0.5);
        expect(m.lines).toMatchObject({ removed: 0, notSentYet: 0 });
        expect(computeDraftMetrics([]).orderRate).toBeNull();
    });
});

describe('the draft id travels beside the frozen order payload, never inside it', () => {
    const id = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
    it('validates ids and builds the POST body without touching the payload', () => {
        expect(isDraftId(id)).toBe(true);
        expect(isDraftId('not-a-uuid')).toBe(false);
        expect(isDraftId(undefined)).toBe(false);
        const [group] = buildSendGroups([{ drugId: 'd', barcode: '123', quantity: 2, warehouseId: 'w', warehouseName: 'W', supplierName: null, unitPrice: 100 }], () => 'k'.repeat(20));
        const payload = buildOrderPayload(group, 'branch', null);
        const before = JSON.stringify(payload);
        expect(JSON.parse(orderRequestBody(payload, id))).toEqual({ ...payload, purchaseDraftId: id });
        expect(orderRequestBody(payload, null)).toBe(before);
        expect(orderRequestBody(payload, 'bad')).toBe(before);
        expect(JSON.stringify(payload)).toBe(before);
        // A session stored before OPEN-14 (no draft id) and one stored after both restore.
        const stored = JSON.parse(JSON.stringify({ ...group, payload, status: 'UNKNOWN' }));
        expect(restoreSendGroups([stored], 'branch')[0].payload).toEqual(payload);
        expect(draftIdFromSaved({ version: 2, groups: [stored] })).toBeNull();
        expect(draftIdFromSaved({ version: 2, purchaseDraftId: id, groups: [stored] })).toBe(id);
        expect(draftIdFromSaved({ purchaseDraftId: '../x' })).toBeNull();
    });

    it('keeps the id only while items from the draft remain', () => {
        expect(draftIdAfterStartNew([{}], id)).toBe(id);
        expect(draftIdAfterStartNew([], id)).toBeNull();
    });

    it('closing is reported as done only when the server confirms it', async () => {
        const ok = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        expect(await closeDraft(id, ok as any)).toBe(true);
        expect(ok).toHaveBeenCalledWith(`/api/purchases/drafts/${id}/complete`, { method: 'POST' });
        expect(await closeDraft(id, vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any)).toBe(false);
        expect(await closeDraft(id, vi.fn().mockRejectedValue(new Error('offline')) as any)).toBe(false);
        const never = vi.fn();
        expect(await closeDraft('bad', never as any)).toBe(false);
        expect(await closeDraft(null, never as any)).toBe(false);
        expect(never).not.toHaveBeenCalled();
    });

    it('closes the draft only when every group is sent and nothing is left blocked', () => {
        expect(draftIsComplete([{ status: 'SENT' }, { status: 'SENT' }], 0)).toBe(true);
        expect(draftIsComplete([{ status: 'SENT' }, { status: 'FAILED' }], 0)).toBe(false);
        expect(draftIsComplete([{ status: 'SENT' }], 1)).toBe(false);
        expect(draftIsComplete([], 0)).toBe(false);
    });

    it('the handoff carries the id only when the draft was recorded (version stays 1)', () => {
        const src = [{ drugId: 'd', tradeName: 'D', barcode: '1', scientificName: '', currentStock: 0, units: 11, unitsPerPack: 10 }];
        expect(buildHandoff('b', 'x', src, id)).toMatchObject({ version: 1, draftId: id, lines: [{ quantity: 2 }] });
        expect(buildHandoff('b', 'x', src)).not.toHaveProperty('draftId');
    });

    it('registration retries once on a server error or network failure, never on a rejection', async () => {
        const draft = { id, branchId: 'b', source: 'SMART_PAGE' as const, settingsSource: 'DEFAULT' as const, options: DEFAULT_PLANNING_OPTIONS, lines: [] };
        const ok = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, status: 201 });
        expect(await registerDraft(draft, ok as any)).toBe(true);
        expect(ok).toHaveBeenCalledTimes(2);
        const net = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, status: 200 });
        expect(await registerDraft(draft, net as any)).toBe(true);
        const rejected = vi.fn().mockResolvedValue({ ok: false, status: 400 });
        expect(await registerDraft(draft, rejected as any)).toBe(false);
        expect(rejected).toHaveBeenCalledTimes(1);
        const down = vi.fn().mockRejectedValue(new Error('offline'));
        expect(await registerDraft(draft, down as any)).toBe(false);
        expect(down).toHaveBeenCalledTimes(2);
    });
});

describe('settings helpers', () => {
    it('compares and describes options', () => {
        expect(sameOptions(DEFAULT_PLANNING_OPTIONS, { ...DEFAULT_PLANNING_OPTIONS })).toBe(true);
        expect(sameOptions(DEFAULT_PLANNING_OPTIONS, { ...DEFAULT_PLANNING_OPTIONS, fromArrival: true })).toBe(false);
        expect(describeOptions({ coverageDays: 20, leadDays: 3, safetyDays: 2, fromArrival: true })).toBe('تغطية 20 يوماً من الوصول، مدة توريد 3، أيام أمان 2');
    });
});
