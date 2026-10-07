import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { graph, type Connection } from "./provider";

const connection: Connection = {
  organizationId: "synthetic-org", phoneId: "123456", businessId: "654321",
  token: "synthetic-token", appSecret: "synthetic-secret", verifyToken: "synthetic-verify",
};
const provider = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ data: [] }), {
  headers: { "Content-Type": "application/json" },
}));
beforeEach(() => {
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", undefined);
  vi.stubEnv("META_GRAPH_VERSION", undefined);
  vi.stubGlobal("fetch", provider);
  provider.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("uses META_GRAPH_VERSION for WhatsApp", async () => {
  vi.stubEnv("META_GRAPH_VERSION", "v25.0");
  await graph(connection, "654321/phone_numbers");
  expect(provider).toHaveBeenCalledWith("https://graph.facebook.com/v25.0/654321/phone_numbers", expect.objectContaining({ method: "GET" }));
});
it("trims surrounding spaces in META_GRAPH_VERSION", async () => {
  vi.stubEnv("META_GRAPH_VERSION", " v25.0 ");
  await graph(connection, "654321/phone_numbers");
  expect(provider.mock.calls[0][0]).toBe("https://graph.facebook.com/v25.0/654321/phone_numbers");
});
it("uses META_GRAPH_VERSION even when the old variable is present", async () => {
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v24.0");
  vi.stubEnv("META_GRAPH_VERSION", "v25.0");
  await graph(connection, "654321/phone_numbers");
  expect(provider.mock.calls[0][0]).toBe("https://graph.facebook.com/v25.0/654321/phone_numbers");
});
it("refuses missing configuration before calling the provider", async () => {
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v25.0");
  await expect(graph(connection, "654321/phone_numbers")).rejects.toMatchObject({ status: 503 });
  expect(provider).not.toHaveBeenCalled();
});
it("refuses an invalid META_GRAPH_VERSION without falling back to the old variable", async () => {
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v25.0");
  vi.stubEnv("META_GRAPH_VERSION", "https://invalid.example");
  await expect(graph(connection, "654321/phone_numbers")).rejects.toMatchObject({ status: 503 });
  expect(provider).not.toHaveBeenCalled();
});
