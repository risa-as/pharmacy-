import type { AssistantCard, ReorderCard } from '../../../packages/shared/src/assistant/cards';
import { monthlyStockoutRequest } from '../../../packages/shared/src/assistant/purchase-intent';
export { EXAMPLE_CATEGORIES, QUICK_QUESTIONS } from '../../../packages/shared/src/assistant/examples';
export { monthlyStockoutRequest };
export type { AssistantCard, ReorderCard };
export type { CardScope } from '../../../packages/shared/src/assistant/cards';

export interface AssistantMessage { id: string; role: 'user' | 'assistant'; content: string; cards?: AssistantCard[]; retry?: string }
export interface AssistantUsage { limit: number; used: number; remaining: number }
export interface AssistantResponse { response?: string | null; notice?: string; error?: string; cards?: AssistantCard[] }
export const MAX_ASSISTANT_MESSAGES = 40;
export function normalizeCoverage(text: string) {
    return text.replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}
export function coverageDays(text: string): number | null {
    const normalized = normalizeCoverage(text.trim());
    return /^\d+$/.test(normalized) && Number(normalized) >= 1 && Number(normalized) <= 365 ? Number(normalized) : null;
}
export const purchaseMessage = (days: number) => `جهز طلب الأدوية النافدة التي بيعت هذا الشهر بكمية تكفي لمدة ${days} يوم`;
export function canSendAssistant(text: string, configured: boolean, remaining: number | undefined, count: number) {
    if (!text.trim() || text.trim().length > 2000 || count >= MAX_ASSISTANT_MESSAGES) return false;
    return !!monthlyStockoutRequest(text) || (configured && remaining !== 0);
}
export function assistantHistory(messages: AssistantMessage[]) {
    return messages.filter(m => !m.retry && m.content.trim()).slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
}
export function draftLines(card: ReorderCard) {
    return card.lines.filter(l => l.suggestedQty > 0 && l.unitsPerPack !== null && l.unitsPerPack > 0);
}
export function buildAssistantDraft(card: ReorderCard, draftId: string | null) {
    const lines = draftLines(card);
    if (!card.canDraft || !card.scope.branchId || !lines.length || lines.length > 500) throw new Error(card.draftBlockedReason || 'لا توجد أصناف صالحة للمسودة');
    if (lines.some(l => !l.barcode?.trim()) || new Set(lines.map(l => l.barcode)).size !== lines.length) throw new Error('يوجد باركود مفقود أو مكرر؛ راجع بيانات الأصناف قبل إعداد المسودة');
    return { branchId: card.scope.branchId, branchName: card.scope.branchName, draftId, items: lines.map(l => ({
        barcode: l.barcode, name: l.drugName, quantity: Math.ceil(l.suggestedQty / l.unitsPerPack!), unitsPerPack: l.unitsPerPack!, drugId: l.drugId,
    })) };
}
export type AssistantDraft = ReturnType<typeof buildAssistantDraft>;
export function newAssistantDraftId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
}
/** Fixed internal routes only: never open a web-supplied URL with mobile credentials. */
export function assistantDestination(href: string): { pathname: string; params?: Record<string, string> } | null {
    switch (href) {
        case '/dashboard/purchases/smart-order': return { pathname: '/(tabs)/smart-orders' };
        case '/dashboard/reports/expiry': return { pathname: '/(tabs)/inventory', params: { tab: 'near-expiry' } };
        case '/dashboard/inventory/expired-damaged': return { pathname: '/(tabs)/inventory', params: { tab: 'expired' } };
        case '/dashboard/inventory/transfers': return { pathname: '/transfers' };
        default: return null;
    }
}

/** Session memory only: financial conversations and drafts are not written to plain disk storage. */
let memory: { owner: string; messages: AssistantMessage[]; drafts: Map<string, AssistantDraft>; prepared: Map<ReorderCard, string>; pendingCloses: Set<string> } | null = null;
function session(owner: string) {
    if (memory?.owner !== owner) memory = { owner, messages: [], drafts: new Map(), prepared: new Map(), pendingCloses: new Set() };
    return memory!;
}
export const readAssistantConversation = (owner: string) => [...session(owner).messages];
export const saveAssistantConversation = (owner: string, messages: AssistantMessage[]) => { session(owner).messages = messages.slice(-MAX_ASSISTANT_MESSAGES); };
export function storeAssistantDraft(owner: string, draft: AssistantDraft) {
    const key = newAssistantDraftId(); const drafts = session(owner).drafts;
    drafts.clear(); drafts.set(key, draft); return key;
}
export const readAssistantDraft = (owner: string, key: string) => session(owner).drafts.get(key) ?? null;
export const preparedAssistantDraftKey = (owner: string, card: ReorderCard) => session(owner).prepared.get(card);
export function rememberPreparedAssistantDraft(owner: string, card: ReorderCard, key: string) { session(owner).prepared.set(card, key); }
export function updateAssistantDraft(owner: string, key: string, draft: AssistantDraft | null) {
    if (draft) session(owner).drafts.set(key, draft); else session(owner).drafts.delete(key);
}
export function clearAssistantSession() { memory = null; }
export const pendingAssistantCloses = (owner: string) => [...session(owner).pendingCloses];
export function queueAssistantClose(owner: string, id: string) { session(owner).pendingCloses.add(id); }
export function confirmAssistantClose(owner: string, id: string) { session(owner).pendingCloses.delete(id); }
export function takeOrderBatch<T>(items: T[]) { return { sending: items.slice(0, 100), remaining: items.slice(100) }; }
