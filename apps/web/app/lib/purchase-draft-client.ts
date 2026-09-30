/**
 * OPEN-14 client helpers (pure, testable without a browser). The draft id links
 * a handed-off purchase draft to the warehouse orders sent from it. It is kept
 * OUT of the frozen order payload (restoreSendGroups rebuilds and compares that
 * payload, and the server's requestHash covers it); it travels as a sibling
 * field of the POST body instead.
 */

export const MAX_DRAFT_LINES = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isDraftId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function newDraftId() {
    return crypto.randomUUID();
}

export interface DraftRegistration {
    id: string;
    branchId: string;
    source: 'SMART_PAGE' | 'AI_CARD';
    settingsSource: 'BRANCH' | 'ORGANIZATION' | 'DEFAULT' | 'CUSTOM';
    options: { coverageDays: number; leadDays: number; safetyDays: number; fromArrival: boolean };
    lines: { drugId: string; barcode?: string | null; suggestedUnits: number; draftUnits: number; unitsPerPack: number }[];
}

/**
 * Registers the draft (create-if-absent, so the retry is safe). Returns false
 * when it could not be recorded: the caller still opens the order form, and
 * tells the user this draft will not be measured.
 */
export async function registerDraft(draft: DraftRegistration, fetchImpl: typeof fetch = fetch): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetchImpl('/api/purchases/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
            if (res.ok) return true;
            if (res.status < 500) return false; // rejected: retrying cannot help
        } catch { /* network: retry once */ }
    }
    return false;
}

/** Marks the draft opened in the order form. Fire-and-forget: measurement never blocks the form. */
export function reportDraftImported(id: string, fetchImpl: typeof fetch = fetch) {
    if (!isDraftId(id)) return;
    fetchImpl(`/api/purchases/drafts/${id}/import`, { method: 'POST' }).catch(() => {});
}

/**
 * Closes the draft (all lines sent, or the user drops the rest) and reports
 * whether the server confirmed it. The caller shows "closed" only on true; on
 * false the draft stays open (its unsent lines stay "not sent yet") and the
 * user can retry. Never involved in sending orders.
 */
export async function closeDraft(id: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
    if (!isDraftId(id)) return false;
    try {
        const res = await fetchImpl(`/api/purchases/drafts/${id}/complete`, { method: 'POST' });
        // { completed: false } on a repeat means it was already closed: still closed.
        return res.ok;
    } catch {
        return false;
    }
}

/** Unambiguous completion: every frozen group sent, nothing blocked, no draft line left out. */
export function draftIsComplete(groups: { status: string }[], blockedCount: number) {
    return groups.length > 0 && groups.every(g => g.status === 'SENT') && blockedCount === 0;
}

/** The POST body for a warehouse order: the frozen payload, plus the draft id beside it. */
export function orderRequestBody<T extends object>(payload: T, draftId: string | null | undefined) {
    return JSON.stringify(isDraftId(draftId) ? { ...payload, purchaseDraftId: draftId } : payload);
}

/** Draft id stored with the order form's session state (absent in older sessions). */
export function draftIdFromSaved(saved: unknown): string | null {
    const id = (saved as { purchaseDraftId?: unknown } | null)?.purchaseDraftId;
    return isDraftId(id) ? id : null;
}

/** After "edit unsent items / new list": keep the id only while items from the draft remain. */
export function draftIdAfterStartNew(remaining: unknown[], id: string | null) {
    return remaining.length ? id : null;
}
