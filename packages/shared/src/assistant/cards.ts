/**
 * Structured assistant cards (client-safe types). Every number in a card comes
 * from a deterministic server computation, never from the language model; the
 * model only writes the explanation around them.
 */

export interface CardScope {
    branchId: string | null;
    branchName: string;
    /** Baghdad calendar dates of the data the card is based on. */
    from?: string;
    to?: string;
    /** When the data was read (ISO). */
    generatedAt: string;
    /** Honest limits of what the data can tell (engine notice, missing costs...). */
    notes: string[];
}

export interface ReorderLine {
    inventoryId: string;
    drugId: string;
    drugName: string;
    scientificName: string;
    barcode: string;
    currentStock: number;
    averageDailySales: number;
    coverageDays: number | null;
    pending: number;
    suggestedQty: number;
    unitsPerPack: number | null;
    packs: number | null;
    urgent: boolean;
    out: boolean;
    reasons: string[];
    /** Data-quality limits from the planning engine. */
    limits: string[];
}

export interface ReorderCard {
    kind: 'reorder';
    title: string;
    scope: CardScope;
    /** The saved settings the card used, and where they came from (OPEN-14). */
    options: { coverageDays: number; leadDays: number; safetyDays: number; fromArrival: boolean; source: 'BRANCH' | 'ORGANIZATION' | 'DEFAULT' | 'CUSTOM' };
    lines: ReorderLine[];
    totalCandidates: number;
    canDraft: boolean;
    draftBlockedReason: string | null;
    links: { label: string; href: string }[];
}

export interface WasteLine {
    drugId: string;
    drugName: string;
    branchId: string;
    branchName: string;
    stockInWindow: number;
    nearestExpiry: string;
    averageDailySales: number;
    /** Whole units expected to expire unsold, summed lot by lot. */
    expectedUnsold: number;
    /** Each lot's unsold units × that lot's cost; null when none of them has a cost. */
    valueAtRisk: number | null;
    /** Units of expectedUnsold without any recorded cost (not in valueAtRisk). */
    unvaluedUnits: number;
    /** Proposed for review only; quantity the receiver can sell before the lot expires. */
    transfers: WasteTransfer[];
}

export interface WasteTransfer {
    branchId: string;
    branchName: string;
    quantity: number;
    /** Expiry of the source lot being moved. */
    expiryDate: string;
    /** Assumed arrival (today + the source branch's saved transfer days). */
    arrivalDate: string;
    transferDays: number;
    averageDailySales: number;
}

export interface WasteCard {
    kind: 'waste';
    title: string;
    scope: CardScope;
    windowDays: number;
    /** Transfer days used (per source branch, distinct values); null when transfers were not computed. */
    transferDays: number[] | null;
    lines: WasteLine[];
    totalValueAtRisk: number;
    unknownValueLines: number;
    links: { label: string; href: string }[];
}

export interface DailySignal {
    id: string;
    severity: 'high' | 'medium' | 'info';
    title: string;
    detail: string;
    link: { label: string; href: string } | null;
}

export interface DailyCard {
    kind: 'daily';
    title: string;
    scope: CardScope;
    date: string;
    signals: DailySignal[];
}

export type AssistantCard = ReorderCard | WasteCard | DailyCard;
