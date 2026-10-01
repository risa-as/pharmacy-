import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./api', () => ({ request: vi.fn() }));
import { request } from './api';
import { assistantService } from './assistant';
import { reorderFixture } from '../utils/assistant.fixture';
const mocked = vi.mocked(request);
describe('mobile assistant API contract', () => {
    beforeEach(() => { mocked.mockReset(); });
    it('sends one charged chat request with automatic retry disabled', async () => {
        mocked.mockRejectedValueOnce(new Error('network'));
        await expect(assistantService.chat('سؤال', [])).rejects.toThrow('network');
        expect(mocked).toHaveBeenCalledTimes(1); expect(mocked.mock.calls[0]).toEqual(['/ai/chat', { method: 'POST', body: JSON.stringify({ message: 'سؤال', history: [] }) }, false, { noRetry: true }]);
    });
    it('registers units and settings, then hands off packs without sending an order', async () => {
        mocked.mockResolvedValue({});
        const result = await assistantService.prepareDraft(reorderFixture());
        expect(result.measured).toBe(true); expect(result.draft.items[0].quantity).toBe(2);
        expect(mocked).toHaveBeenCalledTimes(1); const [path, options] = mocked.mock.calls[0]; expect(path).toBe('/purchases/drafts');
        const body = JSON.parse(options!.body as string); expect(body.id).toBe(result.draft.draftId); expect(body.source).toBe('AI_CARD'); expect(body.settingsSource).toBe('CUSTOM');
        expect(body.options.coverageDays).toBe(10); expect(body.lines).toEqual([{ drugId: 'd1', barcode: '101', suggestedUnits: 11, draftUnits: 11, unitsPerPack: 10 }]);
    });
    it('still returns a reviewable draft when measurement registration fails', async () => {
        mocked.mockRejectedValue(new Error('registration unavailable'));
        const result = await assistantService.prepareDraft(reorderFixture()); expect(result.measured).toBe(false); expect(result.draft.draftId).toBeNull(); expect(result.draft.items).toHaveLength(1);
    });
    it('rejects invalid data before any network write', async () => {
        await expect(assistantService.prepareDraft({ ...reorderFixture(), canDraft: false })).rejects.toThrow(); expect(mocked).not.toHaveBeenCalled();
    });
    it('requires explicit CLOSED and never retries an unconfirmed close automatically', async () => {
        mocked.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ status: 'CLOSED' });
        await expect(assistantService.close('id')).rejects.toThrow(/يؤكد/); await expect(assistantService.close('id')).resolves.toBeUndefined();
        expect(mocked.mock.calls[0]).toEqual(['/purchases/drafts/id/complete', { method: 'POST' }, false, { noRetry: true }]);
    });
});
