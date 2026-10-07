import { it, expect } from "vitest";
import { readAttempt, saveAttempt, finishAttempt } from "./pending-campaign";
function storage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
}
it("reuses a saved campaign attempt after reopening and never overwrites an unresolved one", () => {
  const s = storage(),
    p = { id: "one", owner: "u", payload: { name: "campaign" } };
  saveAttempt(s, "org", p);
  expect(readAttempt(s, "org")).toEqual(p);
  expect(() => saveAttempt(s, "org", { ...p, id: "two" })).toThrow();
});
it("does not treat a failed read as a missing attempt", () => {
  const s = storage();
  s.getItem = () => {
    throw Error("unavailable");
  };
  expect(() =>
    saveAttempt(s, "org", { id: "one", owner: "u", payload: {} }),
  ).toThrow();
});
it("refuses non-durable writes before a send can start", () => {
  const s = storage();
  s.setItem = () => {};
  expect(() =>
    saveAttempt(s, "org", { id: "one", owner: "u", payload: {} }),
  ).toThrow();
});
it("a late result does not clear a different attempt", () => {
  const s = storage();
  saveAttempt(s, "org", { id: "two", owner: "u", payload: {} });
  finishAttempt(s, "org", "one");
  expect(readAttempt(s, "org")?.id).toBe("two");
  finishAttempt(s, "org", "two");
  expect(readAttempt(s, "org")).toBeNull();
});
it("stops on corrupted storage without advising deletion", () => {
  const s = storage();
  s.setItem("faramace:wa-campaign:org", "bad");
  expect(() => readAttempt(s, "org")).toThrow("لا تمسح");
  for (const value of ["null", "[]", '{"id":1,"owner":"u","payload":{}}']) {
    s.setItem("faramace:wa-campaign:org", value);
    expect(() => readAttempt(s, "org")).toThrow("يلزم استردادها");
  }
});
