import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
    loadInventoryDraft,
    saveInventoryDraft,
    clearInventoryDraft,
    draftHasContent,
    formatDraftAge,
    DRAFT_TTL_MS,
    type InventoryDraft,
} from "../inventory-draft";

// The inventory page unmounts when the user walks to POS, so the draft is the
// only thing standing between an interrupted entry and retyping it. These tests
// pin the two behaviours that would silently break that: the staleness cutoff,
// and "is this form actually worth restoring?".

const store = new Map<string, string>();
beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
    });
});
afterEach(() => vi.unstubAllGlobals());

const batchDraft = (over: Partial<InventoryDraft> = {}): InventoryDraft => ({
    kind: "batch",
    savedAt: new Date().toISOString(),
    inventoryId: "inv-1",
    drugName: "دواء تجريبي",
    fields: { quantity: 12, costPrice: 500, expiryDate: "2027-01-01", supplierId: "" },
    ...over,
});

describe("draft persistence", () => {
    it("round-trips a saved draft", () => {
        saveInventoryDraft("u1", batchDraft());
        const got = loadInventoryDraft("u1");
        expect(got?.kind).toBe("batch");
        expect(got?.fields.quantity).toBe(12);
    });

    it("scopes drafts per user, so one pharmacist never sees another's entry", () => {
        saveInventoryDraft("u1", batchDraft());
        expect(loadInventoryDraft("u2")).toBeNull();
    });

    it("returns null when nothing was saved", () => {
        expect(loadInventoryDraft("u1")).toBeNull();
    });

    it("survives corrupt JSON instead of throwing into the page", () => {
        store.set("faramace:inventory-draft:u1", "{not json");
        expect(loadInventoryDraft("u1")).toBeNull();
    });

    it("rejects a payload with an unknown kind", () => {
        store.set("faramace:inventory-draft:u1", JSON.stringify({ kind: "bogus" }));
        expect(loadInventoryDraft("u1")).toBeNull();
    });

    it("clears on request", () => {
        saveInventoryDraft("u1", batchDraft());
        clearInventoryDraft("u1");
        expect(loadInventoryDraft("u1")).toBeNull();
    });
});

describe("staleness cutoff", () => {
    it("keeps a draft that is still inside the TTL", () => {
        const savedAt = new Date(Date.now() - (DRAFT_TTL_MS - 60_000)).toISOString();
        saveInventoryDraft("u1", batchDraft({ savedAt }));
        expect(loadInventoryDraft("u1")).not.toBeNull();
    });

    // A day-old cost/expiry restored by reflex is worse than retyping.
    it("drops a draft past the TTL and purges it from storage", () => {
        const savedAt = new Date(Date.now() - (DRAFT_TTL_MS + 60_000)).toISOString();
        saveInventoryDraft("u1", batchDraft({ savedAt }));
        expect(loadInventoryDraft("u1")).toBeNull();
        expect(store.has("faramace:inventory-draft:u1")).toBe(false);
    });

    it("drops a draft with an unparseable timestamp", () => {
        saveInventoryDraft("u1", batchDraft({ savedAt: "not-a-date" }));
        expect(loadInventoryDraft("u1")).toBeNull();
    });
});

describe("draftHasContent", () => {
    it("ignores an untouched batch form", () => {
        expect(
            draftHasContent("batch", {
                quantity: 0,
                costPrice: 0,
                expiryDate: "",
                supplierId: "",
                batchPacketPrice: 0,
                // ميزة وحدة التسعير: الخانة تبدأ فارغة لا بـ 1.
                batchStripsPerPacket: "",
            }),
        ).toBe(false);
    });

    it("detects a batch form with a quantity typed in", () => {
        expect(draftHasContent("batch", { quantity: 5, batchStripsPerPacket: 1 })).toBe(true);
    });

    it("treats a changed strips-per-packet as real input", () => {
        expect(draftHasContent("batch", { quantity: 0, batchStripsPerPacket: 10 })).toBe(true);
    });

    // The create-drug form ships non-empty defaults in the JSX; without the
    // kind-aware check every freshly opened form would look like a draft.
    it("ignores a create-drug form sitting on its JSX defaults", () => {
        expect(
            draftHasContent("create-drug", {
                tradeName: "",
                scientificName: "",
                origin: "",
                price: "",
                packetPrice: 0,
                supplierId: "",
                quantity: "0",
                // ميزة وحدة التسعير: الخانة تبدأ فارغة لا بـ 1.
                stripsPerPacket: "",
                minStock: "1",
                maxStock: "10",
                expiryDate: "2028-08-02",
            }),
        ).toBe(false);
    });

    it("detects a create-drug form once the trade name is typed", () => {
        expect(
            draftHasContent("create-drug", {
                tradeName: "Panadol",
                quantity: "0",
                stripsPerPacket: "",
                minStock: "1",
                maxStock: "10",
            }),
        ).toBe(true);
    });

    // بعد أن صارت الخانة تبدأ فارغة، صار 1 رقماً كتبه الصيدلاني بعد عدّ
    // أشرطة العلبة — معلومة حقيقية لا قيمة افتراضية، فلا تُرمى مسودته.
    it("treats a typed strips count of 1 as real input", () => {
        expect(draftHasContent("create-drug", { stripsPerPacket: 1 })).toBe(true);
        expect(draftHasContent("batch", { batchStripsPerPacket: 1 })).toBe(true);
    });

    it("does not treat min/max stock defaults alone as content", () => {
        expect(draftHasContent("create-drug", { minStock: "5", maxStock: "50" })).toBe(false);
    });
});

describe("formatDraftAge", () => {
    it("labels a fresh draft", () => {
        expect(formatDraftAge(new Date().toISOString())).toBe("قبل لحظات");
    });
    it("labels minutes and hours", () => {
        expect(formatDraftAge(new Date(Date.now() - 5 * 60_000).toISOString())).toContain("دقيقة");
        expect(formatDraftAge(new Date(Date.now() - 3 * 3600_000).toISOString())).toContain("ساعة");
    });
    it("returns empty for garbage rather than NaN text", () => {
        expect(formatDraftAge("nonsense")).toBe("");
    });
});
