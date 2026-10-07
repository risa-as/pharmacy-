import { test } from "node:test";
import assert from "node:assert/strict";
import { workerConfig, tick } from "./whatsapp-worker.mjs";
const secret = "synthetic-test-secret-at-least-32-characters";
test("accepts a secure origin and rejects destinations that can leak the bearer token", () => {
  assert.equal(
    workerConfig({
      WHATSAPP_APP_URL: "https://example.invalid",
      WHATSAPP_WORKER_SECRET: secret,
    }).url.href,
    "https://example.invalid/api/whatsapp/worker",
  );
  for (const url of [
    "http://example.invalid",
    "https://user:password@example.invalid",
    "https://example.invalid?token=abc",
    "https://example.invalid/path",
  ])
    assert.throws(() =>
      workerConfig({ WHATSAPP_APP_URL: url, WHATSAPP_WORKER_SECRET: secret }),
    );
  assert.throws(() =>
    workerConfig({
      WHATSAPP_APP_URL: "https://example.invalid",
      WHATSAPP_WORKER_SECRET: "short",
    }),
  );
});
test("never follows redirects and returns only counters", async () => {
  const config = workerConfig({
    WHATSAPP_APP_URL: "http://127.0.0.1:3118",
    WHATSAPP_WORKER_SECRET: secret,
  });
  const r = await tick(config, async (url, init) => {
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    return new Response(
      JSON.stringify({ enabled: false, processed: 0, extra: "ignored" }),
    );
  });
  assert.deepEqual(r, { enabled: false, processed: 0 });
  await assert.rejects(
    () => tick(config, async () => new Response("", { status: 401 })),
    /Worker HTTP 401/,
  );
});
