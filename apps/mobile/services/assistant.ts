import { request, getSessionGeneration, SessionChangedError } from './api';
import { requireAIConsent } from './ai-consent';
import { buildAssistantDraft, draftLines, newAssistantDraftId, type ReorderCard, type AssistantResponse, type AssistantUsage } from '../utils/assistant';

export const assistantService = {
    status: () => request<{ configured: boolean }>('/ai/status'),
    usage: () => request<AssistantUsage>('/ai/usage'),
    async chat(message: string, history: { role: 'user' | 'assistant'; content: string }[]) {
        const generation = getSessionGeneration();
        const headers = await requireAIConsent('assistant');
        if (generation !== getSessionGeneration()) throw new SessionChangedError();
        return request<AssistantResponse>('/ai/chat', {
            method: 'POST', headers, body: JSON.stringify({ message, history }),
        }, false, { noRetry: true });
    },
    insight: (kind: 'reorder' | 'waste' | 'daily') => request<{ card: import('../utils/assistant').AssistantCard }>(`/ai/insights?kind=${kind}`),
    async prepareDraft(card: ReorderCard) {
        const id = newAssistantDraftId();
        const draft = buildAssistantDraft(card, id);
        const { source, ...options } = card.options;
        let measured = false;
        try {
            await request('/purchases/drafts', { method: 'POST', body: JSON.stringify({
                id, branchId: draft.branchId, source: 'AI_CARD', settingsSource: source, options,
                lines: draftLines(card).map(l => ({ drugId: l.drugId, barcode: l.barcode, suggestedUnits: l.suggestedQty, draftUnits: l.suggestedQty, unitsPerPack: l.unitsPerPack })),
            }) });
            measured = true;
        } catch { draft.draftId = null; }
        return { draft, measured };
    },
    imported: (id: string) => request(`/purchases/drafts/${id}/import`, { method: 'POST' }, false, { noRetry: true }),
    async close(id: string) {
        const result = await request<{ status?: string }>(`/purchases/drafts/${id}/complete`, { method: 'POST' }, false, { noRetry: true });
        if (result.status !== 'CLOSED') throw new Error('لم يؤكد الخادم إغلاق المسودة');
    },
};
