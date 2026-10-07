import { deviceFetch as fetch } from './device-signing';
import { operationJson } from "./operations-response";
import { ipcMain } from "electron";
import store from "./store";
import { getApiBaseUrl } from "./api-config";
import { allowedOperation, allowedSupplyOperation, operationNeedsSync } from "./operations-policy";

/** How long a successful permission check may serve reads (owner's decision, 2026-10-01). */
export const READ_REUSE_MS = 3 * 60_000;

export function registerOperations(
  prepare: () => Promise<void>,
  refresh: () => Promise<{ success: boolean; reason?: string }>,
) {
  let busy = false;
  const identity = () => ({
    id: String(store.get("loggedInUserId") || ""),
    branch: String(store.get("branchId") || ""),
    token: String(store.get("syncToken") || ""),
  });
  // Share an in-flight verification for the exact same credentials.
  //
  // Policy (decided by the owner, 2026-10-01): a SUCCESSFUL verification may be
  // reused for up to READ_REUSE_MS, but only by reads that ask for it (viewing
  // inventory, debts, sales history, warehouse pages). Every write verifies with
  // the server again. The reuse is keyed on the full identity (user, branch,
  // token, server, organization, role, session version, license), so any change
  // forces a new check, and any failed check drops it at once. A revoked
  // permission therefore stops reads within READ_REUSE_MS at most, and writes
  // immediately.
  let verification: { key: string; promise: ReturnType<typeof verifySession> } | undefined;
  let lastOk: { key: string; at: number; result: Awaited<ReturnType<typeof verifySession>> } | undefined;
  const sessionKey = () => JSON.stringify([identity(), getApiBaseUrl(), store.get("syncOrgId"),
    store.get("syncUserRole"), store.get("syncSessionVersion"), store.get("licenseKey")]);
  async function session(opts: { reuseMs?: number } = {}) {
    const key = sessionKey();
    if (opts.reuseMs && lastOk?.key === key && Date.now() - lastOk.at < opts.reuseMs) return lastOk.result;
    if (verification?.key === key) return verification.promise;
    const pending = { key, promise: verifySession() };
    verification = pending;
    try {
      const result = await pending.promise;
      // Stored only if the identity did not change while the server answered.
      if (sessionKey() === key) lastOk = { key, at: Date.now(), result };
      return result;
    } catch (e) {
      lastOk = undefined;
      throw e;
    } finally { if (verification === pending) verification = undefined; }
  }
  async function verifySession() {
    const who = identity();
    if (!who.id || who.id !== store.get("syncUserId") || !who.token)
      throw Error(
        "يلزم تسجيل الدخول عبر الإنترنت بهذا الحساب للتحقق من الصلاحيات.",
      );
    const response = await fetch(
      `${getApiBaseUrl()}/desktop/operations/session`,
      {
        method: "POST",
        headers: {
          "x-sync-token": who.token,
          "x-user-id": who.id,
          "x-branch-id": who.branch,
          "x-org-id": String(store.get("syncOrgId") || ""),
          "x-user-role": String(store.get("syncUserRole") || ""),
          // Same rule as getDeviceAuthHeaders: only versioned tokens send it.
          ...(Number(store.get("syncSessionVersion")) > 0
            ? { "x-session-version": String(store.get("syncSessionVersion")) }
            : {}),
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await operationJson(response);
    if (!response.ok) throw Error(data.error || "تعذر التحقق من الصلاحيات");
    if (JSON.stringify(who) !== JSON.stringify(identity()))
      throw Error("تغيرت الجلسة؛ أعد فتح الصفحة");
    return { who, data };
  }
  ipcMain.handle("operations:access", async () => {
    try {
      // Opening a warehouse/stocktake/transfer page is a read.
      const { data } = await session({ reuseMs: READ_REUSE_MS });
      const { token, ...access } = data;
      return { success: true, ...access };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "الاتصال بالخادم مطلوب",
      };
    }
  });
  ipcMain.handle(
    "operations:request",
    async (_event, input: { path: string; method?: string; body?: any }) => {
      let acquired = false;
      // A write was handed to the network, and whether a definite HTTP answer
      // came back: a sent write without one is "lost" (it may have been applied).
      let sent = false;
      let answered: { status: number; code?: string } | undefined;
      const started = Date.now();
      let checkpoint = started;
      const timings: Record<string, number> = {};
      const mark = (phase: string) => { const now = Date.now(); timings[phase] = now - checkpoint; checkpoint = now; };
      try {
        const method = input?.method || "GET";
        if (!allowedOperation(input?.path, method))
          throw Error("عملية غير مسموحة");
        // Only writes and reads that sync first run one at a time. A plain read
        // (a list, a document) is never refused because another page's request
        // (often one left running when the user moved on) is still in flight.
        const exclusive = operationNeedsSync(input.path, method);
        if (exclusive) {
          if (busy) throw Error("انتظر اكتمال العملية الحالية");
          busy = true;
          acquired = true;
        }
        // Reads (GET) may reuse a recent successful check; writes always verify again.
        const { who, data: access } = await session(method === "GET" ? { reuseMs: READ_REUSE_MS } : {});
        mark("session");
        const url = new URL(`${getApiBaseUrl()}${input.path}`);
        url.searchParams.set("branchId", who.branch);
        const route = input.path.split("?")[0];
        if (route.startsWith("/inventory/transfers")) {
          if (
            !access.permissions.canTransferStock ||
            !access.features.interBranchTransfers
          )
            throw Error("ليس لديك صلاحية تحويل المخزون أو الباقة لا تدعمه");
        } else if (route === "/inventory/operation-batches") {
          if (
            !access.permissions.canDoStocktake &&
            !(
              access.permissions.canTransferStock &&
              access.features.interBranchTransfers
            )
          )
            throw Error("غير مصرح بعرض الدفعات");
        } else if (route.startsWith("/inventory/stocktake")) {
          if (!access.permissions.canDoStocktake)
            throw Error("ليس لديك صلاحية الجرد");
          if (input.body?.action)
            throw Error("اعتماد الجرد وإعادة العد من لوحة المدير على الويب");
        } else if (
          !access.features.warehouseManagement ||
          !allowedSupplyOperation(route, method, access.permissions)
        ) {
          throw Error("ليس لديك صلاحية إدارة مشتريات المذاخر");
        }
        if (route.startsWith("/inventory/transfers/") && method === "PUT") {
          const check = await fetch(
            `${getApiBaseUrl()}/inventory/transfers?branchId=${encodeURIComponent(who.branch)}&type=incoming&id=${encodeURIComponent(route.split("/")[3])}`,
            {
              headers: { Authorization: `Bearer ${access.token}` },
              signal: AbortSignal.timeout(15000),
            },
          );
          const data = await operationJson(check);
          if (
            !check.ok ||
            !data.transfers?.some(
              (t: any) =>
                t.id === route.split("/")[3] && t.toBranchId === who.branch,
            )
          )
            throw Error(
              "التحويل ليس موجهاً لفرع الجهاز أو لم يعد ضمن القائمة؛ راجعه على الويب",
            );
        }
        if (
          method !== "GET" &&
          /\/(?:stocktake|purchases)\//.test(url.pathname)
        ) {
          const recordPath = input.path.split("?")[0].replace(/\/receive$/, "");
          const check = await fetch(`${getApiBaseUrl()}${recordPath}`, {
            headers: { Authorization: `Bearer ${access.token}` },
            signal: AbortSignal.timeout(15000),
          });
          const record = await operationJson(check);
          const entity = record.stocktake || record;
          if (!check.ok || entity.branchId !== who.branch)
            throw Error("المستند لا ينتمي لفرع هذا الجهاز");
          if (recordPath.startsWith("/purchases/") && !entity.warehouseOrderId)
            throw Error("هذه الشاشة مخصصة لمشتريات المذاخر");
        }
        mark("documentChecks");
        // Unsynced local sales/stock must reach the cloud before counting or
        // changing stock: once per count sheet, not once per page of batches.
        if (exclusive) await prepare();
        mark("prepare");
        if (JSON.stringify(who) !== JSON.stringify(identity()))
          throw Error("تغيرت الجلسة؛ أعد المحاولة");
        sent = method !== "GET";
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${access.token}`,
            "Content-Type": "application/json",
          },
          ...(method !== "GET"
            ? {
                body: JSON.stringify({
                  ...input.body,
                  branchId: who.branch,
                  ...(route === "/inventory/transfers"
                    ? { fromBranchId: who.branch }
                    : {}),
                }),
              }
            : {}),
          signal: AbortSignal.timeout(45000),
        });
        let result: any;
        try {
          result = await operationJson(response);
        } catch (e) {
          // An unreadable error page is still a refusal; an unreadable 2xx is not.
          if (!response.ok) answered = { status: response.status };
          throw e;
        }
        mark("server");
        if (!response.ok) {
          answered = { status: response.status, ...(typeof result.code === "string" ? { code: result.code } : {}) };
          throw Error(result.message || result.error || "تعذر تنفيذ العملية");
        }
        if (JSON.stringify(who) !== JSON.stringify(identity()))
          throw Error(
            "تغيرت الجلسة أثناء الطلب؛ تحقق من سجل العملية قبل إعادة المحاولة",
          );
        if (
          method === "GET" &&
          /^\/(purchases|inventory\/stocktake)\/[a-zA-Z0-9-]+$/.test(route)
        ) {
          const entity = result.stocktake || result;
          if (entity.branchId !== who.branch)
            throw Error("المستند لا ينتمي لفرع الجهاز");
        }
        let warning = "";
        if (
          input.path.endsWith("/receive") ||
          (method !== "GET" &&
            route === "/inventory/transfers") ||
          (method === "PUT" && result.stocktake?.status === "COMPLETED")
        ) {
          try {
            const pulled = await refresh();
            if (!pulled.success)
              warning =
                "حُفظت العملية على الخادم، لكن تحديث المخزون المحلي لم يكتمل. حدّث المزامنة قبل متابعة البيع.";
          } catch {
            warning =
              "حُفظت العملية على الخادم، لكن تعذّر تحديث المخزون المحلي. أعد المزامنة.";
          }
        }
        mark("stockRefresh");
        return { success: true, data: result, warning };
      } catch (e) {
        const lost = sent && !answered;
        // A lost receipt (or a server error) may have been applied: pull stock so the
        // local copy matches the server either way (the renderer then checks the document).
        if ((lost || (answered?.status ?? 0) >= 500) && input?.path?.endsWith("/receive"))
          await refresh().catch(() => undefined);
        return {
          success: false,
          error:
            e instanceof Error
              ? e.message
              : "تعذر الاتصال. تحقق من سجل الطلب قبل إعادة الإرسال.",
          ...answered,
          ...(lost ? { lost: true } : {}),
        };
      } finally {
        if (acquired) busy = false;
        if (acquired && input?.path?.endsWith('/receive')) {
          // Phase durations only: no document ids, credentials or financial data.
          console.info('[OperationsTiming]', JSON.stringify({operation:'receive',...timings,totalMs:Date.now()-started}));
        }
      }
    },
  );
  /** `{ read: true }` for viewing only (may reuse a recent check); writes omit it. */
  return async (permission: string, opts: { read?: boolean } = {}) => {
    const { who, data } = await session(opts.read ? { reuseMs: READ_REUSE_MS } : {});
    if (!data.permissions?.[permission])
      throw Error("ليس لديك صلاحية تنفيذ هذه العملية");
    return {
      who,
      access: data,
      assertCurrent: () => {
        if (JSON.stringify(who) !== JSON.stringify(identity()))
          throw Error("تغيرت الجلسة؛ أعد فتح الصفحة");
      },
    };
  };
}
