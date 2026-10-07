import { describe, it, expect } from "vitest";
import { baghdadSchedule, validateSchedule, formatSchedule } from "./schedule";
import { previewSchema } from "./domain";

describe("WhatsApp scheduling", () => {
  it("converts Baghdad time independently of the computer timezone, across midnight", () => {
    expect(baghdadSchedule("2026-10-07T01:30")).toBe(
      "2026-10-06T22:30:00.000Z",
    );
    expect(baghdadSchedule("2026-10-07T16:45")).toBe(
      "2026-10-07T13:45:00.000Z",
    );
  });
  it("rejects empty, malformed and impossible calendar dates", () => {
    for (const value of [
      "",
      "07/10/2026",
      "2026-02-30T12:00",
      "2026-10-07T24:00",
    ])
      expect(() => baghdadSchedule(value)).toThrow();
  });
  it("allows immediate sending and rejects past or equal scheduled times", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(validateSchedule(null, now)).toBeNull();
    expect(validateSchedule("2026-10-06T12:01:00Z", now)?.toISOString()).toBe(
      "2026-10-06T12:01:00.000Z",
    );
    for (const value of [
      "invalid",
      "2026-10-06T12:00:00Z",
      "2026-10-06T11:59:00Z",
    ])
      expect(() => validateSchedule(value, now)).toThrow();
  });
  it("requires an explicit offset in requests and keeps older immediate payloads valid", () => {
    const payload = {
      templateId: "00000000-0000-4000-8000-000000000001",
      selection: { mode: "ids", ids: [] },
    };
    expect(previewSchema.parse(payload).scheduledAt).toBeNull();
    expect(
      previewSchema.parse({
        ...payload,
        scheduledAt: "2026-10-07T15:00:00+03:00",
      }).scheduledAt,
    ).toBeTruthy();
    expect(() =>
      previewSchema.parse({ ...payload, scheduledAt: "2026-10-07T15:00" }),
    ).toThrow();
    expect(formatSchedule("2026-10-07T12:00:00Z")).toBe(
      formatSchedule("2026-10-07T15:00:00+03:00"),
    );
  });
});
