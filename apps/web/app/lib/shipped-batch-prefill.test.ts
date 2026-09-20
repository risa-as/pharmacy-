import { describe, it, expect } from "vitest";
import { computeShippedBatchPrefill } from "./shipped-batch-prefill";

describe("computeShippedBatchPrefill", () => {
    it("يقترح دفعة واحدة حين وُجدت حركة شحن وحيدة لدواء", () => {
        const result = computeShippedBatchPrefill([
            { drugId: "d1", batchNumber: "BAT-1", expiryDate: "2027-01-01", quantity: 10 },
        ]);
        expect(result.get("d1")).toMatchObject({
            kind: "SINGLE",
            batchNumber: "BAT-1",
            expiryDate: new Date("2027-01-01"),
        });
    });

    it("ينهار زوجان متطابقا الرقم والتاريخ (من حركتين منفصلتين) إلى SINGLE واحدة", () => {
        const result = computeShippedBatchPrefill([
            { drugId: "d1", batchNumber: "BAT-1", expiryDate: "2027-01-01", quantity: 6 },
            { drugId: "d1", batchNumber: "BAT-1", expiryDate: "2027-01-01", quantity: 4 },
        ]);
        const r = result.get("d1");
        expect(r?.kind).toBe("SINGLE");
        if (r?.kind === "SINGLE") {
            expect(r.batchNumber).toBe("BAT-1");
            expect(r.expiryDate).toEqual(new Date("2027-01-01"));
        }
    });

    it("يمتنع عن الاقتراح ويُرجع MULTIPLE حين يختلف تاريخ الانتهاء بين دفعتين (تخصيص FEFO)", () => {
        const result = computeShippedBatchPrefill([
            { drugId: "d1", batchNumber: "BAT-1", expiryDate: "2027-01-01", quantity: 10 },
            { drugId: "d1", batchNumber: "BAT-1", expiryDate: "2027-06-01", quantity: 5 },
        ]);
        const r = result.get("d1");
        expect(r?.kind).toBe("MULTIPLE");
        if (r?.kind === "MULTIPLE") {
            expect(r.batches).toHaveLength(2);
            expect(r.batches.map((b) => b.quantity).sort((a, b) => a - b)).toEqual([5, 10]);
        }
    });

    it("يمتنع عن الاقتراح ويُرجع MULTIPLE حين يتطابق تاريخ الانتهاء لكن يختلف رقم الدفعة", () => {
        const result = computeShippedBatchPrefill([
            { drugId: "d1", batchNumber: "BAT-1", expiryDate: "2027-01-01", quantity: 10 },
            { drugId: "d1", batchNumber: "BAT-2", expiryDate: "2027-01-01", quantity: 5 },
        ]);
        const r = result.get("d1");
        expect(r?.kind).toBe("MULTIPLE");
        if (r?.kind === "MULTIPLE") {
            expect(r.batches.map((b) => b.batchNumber).sort()).toEqual(["BAT-1", "BAT-2"]);
        }
    });

    it("مدخل فارغ يُرجع خريطة فارغة بلا أي مفتاح", () => {
        const result = computeShippedBatchPrefill([]);
        expect(result.size).toBe(0);
    });

    it("يفصل بين الأدوية المختلفة ولا يخلط دفعاتها", () => {
        const result = computeShippedBatchPrefill([
            { drugId: "d1", batchNumber: "BAT-1", expiryDate: "2027-01-01", quantity: 10 },
            { drugId: "d2", batchNumber: "BAT-9", expiryDate: "2027-01-01", quantity: 3 },
        ]);
        expect(result.get("d1")).toMatchObject({ kind: "SINGLE", batchNumber: "BAT-1" });
        expect(result.get("d2")).toMatchObject({ kind: "SINGLE", batchNumber: "BAT-9" });
    });
});
