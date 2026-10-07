// Barcode scanning in the POS (pure, unit-tested).
//
// A scan must change the cart immediately. Waiting for the main process on every
// scan made fast repeated scans show quantity 1 for seconds and then jump, because
// the IPC replies queue behind other main-process work and arrive together.
// So a product already known in this session (in the cart or looked up before) is
// added at once; only a never-seen barcode waits for one lookup, shared by all
// scans of that barcode that arrive while it is in flight.

export interface ScanProduct {
    id: string;
    barcode: string;
    stock: number;
}

export type AddResult<T> =
    | { ok: true; cart: (T & { quantity: number })[] }
    | { ok: false; reason: 'OUT_OF_STOCK' | 'STOCK_LIMIT'; cart: (T & { quantity: number })[] };

/** Adds one unit, never above the known stock. The cart is never mutated. */
export function addOne<T extends ScanProduct>(cart: (T & { quantity: number })[], product: T): AddResult<T> {
    if (product.stock <= 0) return { ok: false, reason: 'OUT_OF_STOCK', cart };
    const existing = cart.find(i => i.id === product.id);
    if (existing) {
        if (existing.quantity >= product.stock) return { ok: false, reason: 'STOCK_LIMIT', cart };
        return { ok: true, cart: cart.map(i => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)) };
    }
    return { ok: true, cart: [...cart, { ...product, quantity: 1 }] };
}

/** A product known without asking the main process: in the cart, else in the session cache. */
export function knownByBarcode<T extends ScanProduct>(barcode: string, cart: T[], cache: Map<string, T>): T | undefined {
    const term = barcode.trim();
    if (!term) return undefined;
    return cart.find(i => i.barcode === term) ?? cache.get(term);
}

/**
 * One lookup per barcode while it is in flight: concurrent scans of the same
 * barcode share it instead of queuing another request each.
 */
export function sharedLookup<T>(pending: Map<string, Promise<T>>, barcode: string, lookup: (b: string) => Promise<T>): Promise<T> {
    const existing = pending.get(barcode);
    if (existing) return existing;
    const p = lookup(barcode).finally(() => pending.delete(barcode));
    pending.set(barcode, p);
    return p;
}

// ─── What the product grid shows ───────────────────────────────────────────────
// The grid shows either the catalogue or a text search (>= 2 characters). A
// background catalogue refresh must not replace search results the user is
// reading, and a search answer must not be shown if the term changed meanwhile.

export const isTextSearch = (term: string) => term.trim().length >= 2;

/** May a catalogue refresh replace the grid now? */
export function catalogueMayApply(view: { showingSearch: boolean; currentTerm: string }) {
    return !view.showingSearch && !isTextSearch(view.currentTerm);
}

/** May the answer to a search for `issued` be shown now? */
export function searchAnswerMayApply(issued: string, currentTerm: string) {
    return issued === currentTerm;
}
