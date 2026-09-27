import { afterEach, describe, expect, it, vi } from "vitest";
import { transferAttempt } from "../transfer-attempt";

const memoryStorage = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
};
const body = { toBranchId: "b2", notes: "", items: [{ batchId: "x", quantity: 2 }] };
const KEY = "staff-attempt:u:b:transfers";

afterEach(() => vi.unstubAllGlobals());

describe("transfer idempotency key", () => {
  it("reuses the saved key for the same transfer after the page is reopened", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const first = transferAttempt(body, KEY, { hash: "", key: "" });
    const reopened = transferAttempt(body, KEY, { hash: "", key: "" });
    expect(reopened.key).toBe(first.key);
  });

  it("refuses to send when the key cannot be stored (storage throws)", () => {
    const fail = () => { throw new DOMException("blocked", "SecurityError"); };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
    expect(() => transferAttempt(body, KEY, { hash: "", key: "" })).toThrow(/منع التكرار/);
  });

  it("refuses to send when storage silently keeps nothing", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    expect(() => transferAttempt(body, KEY, { hash: "", key: "" })).toThrow(/منع التكرار/);
  });
});
