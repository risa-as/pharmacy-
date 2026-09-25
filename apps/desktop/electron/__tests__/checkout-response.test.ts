import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Exercise the real IPC handler while isolating the already-covered local
// transaction. A permanently pending network must not delay its success reply.
function setup(fail = false) {
  const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf('ipcMain.handle(\n  "process-sale",');
  const end = source.indexOf('ipcMain.handle("seed-products"', start);
  if (start < 0 || end < 0) throw Error("Checkout IPC handler not found");
  const code = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let handler: any;
  const sync = vi.fn(() => new Promise<void>(() => {}));
  const prefetch = vi.fn(() => new Promise<void>(() => {}));
  const allocate = vi.fn(() => new Promise<void>(() => {}));
  const transaction = vi.fn(async () => {
    if (fail) throw Error("local write failed");
    return { success: true, saleId: "committed-sale", invoiceNumber: null, isCredit: false };
  });
  new Function("ipcMain", "prisma", "takeCachedInvoiceNumber", "syncSales", "prefetchInvoiceNumber", "allocateInvoiceNumber", "console", code)(
    { handle: (_name: string, fn: any) => { handler = fn; } },
    { $transaction: transaction }, () => null, sync, prefetch, allocate,
    { log: vi.fn(), error: vi.fn() },
  );
  return { handler, transaction, sync, prefetch, allocate };
}
it("returns a committed sale without waiting for cloud allocation or sync", async () => {
  const h = setup();
  const result = await Promise.race([
    h.handler(null, { items: [], total: 7000, paymentMethod: "CASH" }),
    new Promise(resolve => setTimeout(() => resolve("network blocked checkout"), 100)),
  ]);
  expect(result).toMatchObject({ success: true, saleId: "committed-sale" });
  expect(h.allocate).not.toHaveBeenCalled();
  expect(h.sync).toHaveBeenCalledOnce();
});
it("does not report success or start sale sync when local commit fails", async () => {
  const h = setup(true);
  expect(await h.handler(null, { items: [] })).toMatchObject({ success: false, error: "local write failed" });
  expect(h.sync).not.toHaveBeenCalled();
});
