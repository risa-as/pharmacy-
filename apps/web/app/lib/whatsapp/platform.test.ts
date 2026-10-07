import { afterEach, expect, it, vi } from "vitest";
import { verifyPlatformFunding, exchangeSignupCode } from "./platform";
import { isOptOut, splitChange, webhookSignature } from "./webhook";
import { createHmac } from "node:crypto";
const conn = {
  organizationId: "synthetic",
  phoneId: "123456",
  businessId: "456789",
  token: "customer-token-not-real",
  appSecret: "secret-not-real",
  verifyToken: "verification-not-real",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function funding(owned = true, match = true) {
  vi.stubEnv("META_GRAPH_VERSION", "v99.0");
  vi.stubEnv("WHATSAPP_META_CREDIT_LINE_ID", "111111");
  vi.stubEnv("WHATSAPP_META_SYSTEM_TOKEN", "system-token-only-for-tests");
  const call = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("owning_credit")
            ? { data: owned ? [{ id: "222222" }] : [] }
            : url.includes("receiving_credential")
              ? { id: "222222", receiving_credential: { id: "333333" } }
              : {
                  id: "456789",
                  primary_funding_id: match ? "333333" : "999999",
                },
        ),
      ),
  );
  vi.stubGlobal("fetch", call);
  return call;
}
it("verifies owned allocation and matching funding with the correct tokens", async () => {
  const call = funding();
  expect(await verifyPlatformFunding(conn, "222222")).toBe("333333");
  expect(call).toHaveBeenCalledTimes(3);
  expect((call.mock.calls[0] as any)[1].headers.Authorization).toBe(
    "Bearer system-token-only-for-tests",
  );
  expect((call.mock.calls[2] as any)[1].headers.Authorization).toBe(
    "Bearer customer-token-not-real",
  );
});
it("refuses someone else's allocation", async () => {
  const call = funding(false);
  await expect(verifyPlatformFunding(conn, "222222")).rejects.toThrow(
    "لا يتبع",
  );
  expect(call).toHaveBeenCalledTimes(1);
});
it("refuses funding mismatch", async () => {
  funding(true, false);
  await expect(verifyPlatformFunding(conn, "222222")).rejects.toThrow(
    "غير مربوط",
  );
});
it("never follows a provider pagination URL to another host", async () => {
  funding();
  const call = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("after=")
            ? { data: [{ id: "222222" }] }
            : url.includes("owning_credit")
              ? {
                  data: [],
                  paging: {
                    next: "https://attacker.invalid/collect",
                    cursors: { after: "safe cursor" },
                  },
                }
              : url.includes("receiving_credential")
                ? { id: "222222", receiving_credential: { id: "333333" } }
                : { id: "456789", primary_funding_id: "333333" },
        ),
      ),
  );
  vi.stubGlobal("fetch", call);
  expect(await verifyPlatformFunding(conn, "222222")).toBe("333333");
  expect(
    call.mock.calls.every(([url]) =>
      url.startsWith("https://graph.facebook.com/"),
    ),
  ).toBe(true);
});
it("blocks central billing when server configuration is missing", async () => {
  vi.stubEnv("WHATSAPP_META_CREDIT_LINE_ID", "");
  const call = vi.fn();
  vi.stubGlobal("fetch", call);
  await expect(verifyPlatformFunding(conn, "222222")).rejects.toThrow(
    "خط ائتمان",
  );
  expect(call).not.toHaveBeenCalled();
});
it("exchanges the code server side without returning the app secret", async () => {
  vi.stubEnv("META_GRAPH_VERSION", "v99.0");
  vi.stubEnv("WHATSAPP_META_APP_ID", "111111");
  vi.stubEnv("WHATSAPP_SIGNUP_CONFIG_ID", "222222");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", "synthetic-app-secret-only");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: "synthetic-business-token-only" }),
        ),
    ),
  );
  expect(await exchangeSignupCode("fake-code")).toBe(
    "synthetic-business-token-only",
  );
});
it.each([
  { text: { body: "STOP" } },
  { button: { payload: "unsubscribe" } },
  { interactive: { button_reply: { id: "stop" } } },
  { interactive: { list_reply: { title: "إلغاء الاشتراك" } } },
])("recognizes incoming opt-out in supported reply shapes: %j", (m) =>
  expect(isOptOut(m)).toBe(true),
);
it("does not treat ordinary replies as opt-out", () =>
  expect(isOptOut({ text: { body: "شكراً" } })).toBe(false));
it("authenticates the exact raw bytes", () => {
  const raw = '{"a":1}',
    sig =
      "sha256=" + createHmac("sha256", "fake-secret").update(raw).digest("hex");
  expect(webhookSignature(raw, "fake-secret", sig)).toBe(true);
  expect(webhookSignature(raw + " ", "fake-secret", sig)).toBe(false);
});
it("splits a large history chunk into bounded batches and marks completion only on the last", () => {
  const chunks = splitChange({
    field: "history",
    value: {
      metadata: { phone_number_id: "123456" },
      history: [
        {
          metadata: { progress: 100 },
          threads: [
            {
              id: "9647701234567",
              messages: Array.from({ length: 251 }, (_, i) => ({
                id: "wamid." + i,
              })),
            },
          ],
        },
      ],
    },
  });
  expect(chunks.map((c) => c.value.messages.length)).toEqual([100, 100, 51]);
  expect(chunks.map((c) => c.value.historyComplete)).toEqual([
    false,
    false,
    true,
  ]);
  expect(chunks[0].value.messages[0].threadPhone).toBe("9647701234567");
});
