import { beforeEach, describe, expect, it } from 'vitest';
import { assistantDestination, assistantHistory, buildAssistantDraft, canSendAssistant, clearAssistantSession, confirmAssistantClose, coverageDays, EXAMPLE_CATEGORIES, monthlyStockoutRequest, pendingAssistantCloses, purchaseMessage, queueAssistantClose, readAssistantConversation, readAssistantDraft, saveAssistantConversation, storeAssistantDraft, takeOrderBatch, updateAssistantDraft, type ReorderCard } from './assistant';

import { reorderFixture } from './assistant.fixture';
import { preparedAssistantDraftKey, rememberPreparedAssistantDraft } from './assistant';

describe('mobile assistant parity and safe handoff', () => {
    beforeEach(clearAssistantSession);
    it.each([['5', 5], ['١٥', 15], ['۲۰', 20], [' 10 ', 10], ['365', 365], ['0', null], ['366', null], ['1.5', null], ['-2', null], ['', null], ['10 أيام', null]])('validates coverage %s', (input, expected) => expect(coverageDays(input)).toBe(expected));
    it.each([5, 10, 15, 20, 365])('uses the selected %i days in the same web intent', days => expect(monthlyStockoutRequest(purchaseMessage(days))).toEqual({ coverageDays: days }));
    it('accepts Persian digits in natural requests too', () => expect(monthlyStockoutRequest(purchaseMessage(15).replace('15', '۱۵'))).toEqual({ coverageDays: 15 }));
    it('does not treat expired drugs or last month as the current-month stockout tool', () => {
        expect(monthlyStockoutRequest('جهز طلب الأدوية المنتهية الصلاحية هذا الشهر لمدة 10 أيام')).toBeNull();
        expect(monthlyStockoutRequest('جهز طلب الأدوية النافدة الشهر الماضي لمدة 10 أيام')).toBeNull();
    });
    it('keeps deterministic purchasing available without a provider or text quota', () => {
        expect(canSendAssistant(purchaseMessage(20), false, 0, 2)).toBe(true);
        expect(canSendAssistant('كم مبيعات اليوم؟', true, 0, 2)).toBe(false);
        expect(canSendAssistant('كم مبيعات اليوم؟', false, 60, 2)).toBe(false);
        expect(canSendAssistant(purchaseMessage(20), true, 60, 40)).toBe(false);
        expect(canSendAssistant('x'.repeat(2001), true, 60, 0)).toBe(false);
    });
    it('sends only the last ten text messages, excluding failed responses and cards', () => {
        const messages = Array.from({ length: 12 }, (_, n) => ({ id: String(n), role: 'user' as const, content: `q${n}`, cards: [reorderFixture()] }));
        const history = assistantHistory([...messages, { id: 'failed', role: 'assistant', content: 'network failure', retry: 'q11' }]);
        expect(history).toHaveLength(10); expect(history[0]).toEqual({ role: 'user', content: 'q2' }); expect(history[9]).toEqual({ role: 'user', content: 'q11' });
    });
    it('rounds units UP to packs and explicitly excludes unknown packs', () => {
        const draft = buildAssistantDraft(reorderFixture(), 'draft-a');
        expect(draft.items).toEqual([{ barcode: '101', name: 'دواء', quantity: 2, unitsPerPack: 10, drugId: 'd1' }]);
        expect(draft.branchId).toBe('branch-a'); expect(draft.draftId).toBe('draft-a');
    });
    it('rejects blocked, branchless and barcode-colliding cards rather than silently dropping drugs', () => {
        const card = reorderFixture();
        expect(() => buildAssistantDraft({ ...card, canDraft: false }, null)).toThrow();
        expect(() => buildAssistantDraft({ ...card, scope: { ...card.scope, branchId: null } }, null)).toThrow();
        expect(() => buildAssistantDraft({ ...card, lines: [card.lines[0], { ...card.lines[0], drugId: 'different' }] }, null)).toThrow(/باركود/);
        expect(() => buildAssistantDraft({ ...card, lines: [{ ...card.lines[0], barcode: '' }] }, null)).toThrow(/باركود/);
    });
    it('isolates conversations, draft payloads and pending closes across accounts and logouts', () => {
        saveAssistantConversation('a:1', [{ id: 'm', role: 'user', content: 'private' }]);
        const key = storeAssistantDraft('a:1', buildAssistantDraft(reorderFixture(), 'id-a')); queueAssistantClose('a:1', 'id-a');
        expect(readAssistantConversation('a:1')).toHaveLength(1); expect(readAssistantDraft('a:1', key)).not.toBeNull();
        expect(readAssistantConversation('b:2')).toEqual([]); expect(readAssistantDraft('b:2', key)).toBeNull(); expect(pendingAssistantCloses('b:2')).toEqual([]);
        expect(readAssistantConversation('a:1')).toEqual([]);
        saveAssistantConversation('a:1', [{ id: 'm', role: 'user', content: 'private' }]); clearAssistantSession(); expect(readAssistantConversation('a:1')).toEqual([]);
    });
    it('retains the unsent remainder across order batches and closes only on confirmation', () => {
        const items = Array.from({ length: 166 }, (_, n) => ({ barcode: String(n), name: String(n), quantity: 1, unitsPerPack: 1, drugId: String(n) }));
        const draft = { ...buildAssistantDraft(reorderFixture(), 'id-a'), items };
        const key = storeAssistantDraft('a:1', draft); const first = takeOrderBatch(items);
        expect(first.sending).toHaveLength(100); expect(first.remaining).toHaveLength(66);
        updateAssistantDraft('a:1', key, { ...draft, items: first.remaining });
        expect(readAssistantDraft('a:1', key)?.items[0].barcode).toBe('100');
        expect([...first.sending, ...takeOrderBatch(first.remaining).sending]).toEqual(items);
        queueAssistantClose('a:1', 'id-a'); queueAssistantClose('a:1', 'id-a'); expect(pendingAssistantCloses('a:1')).toEqual(['id-a']);
        confirmAssistantClose('a:1', 'id-a'); expect(pendingAssistantCloses('a:1')).toEqual([]);
    });
    it('reopens a prepared card without creating a second draft, and retires it after sending', () => {
        const card = reorderFixture(); const key = storeAssistantDraft('a:1', buildAssistantDraft(card, 'id-a'));
        rememberPreparedAssistantDraft('a:1', card, key);
        expect(preparedAssistantDraftKey('a:1', card)).toBe(key);
        expect(readAssistantDraft('a:1', key)?.draftId).toBe('id-a');
        updateAssistantDraft('a:1', key, null);
        expect(preparedAssistantDraftKey('a:1', card)).toBe(key);
        expect(readAssistantDraft('a:1', key)).toBeNull();
        expect(preparedAssistantDraftKey('b:2', card)).toBeUndefined();
    });
    it('shares all 50 web examples across 8 categories', () => {
        expect(EXAMPLE_CATEGORIES).toHaveLength(8); expect(EXAMPLE_CATEGORIES.flatMap(c => c.questions)).toHaveLength(50);
    });
    it('maps only known native destinations', () => {
        expect(assistantDestination('/dashboard/reports/expiry')).toEqual({ pathname: '/(tabs)/inventory', params: { tab: 'near-expiry' } });
        expect(assistantDestination('https://external.example')).toBeNull();
    });
});
