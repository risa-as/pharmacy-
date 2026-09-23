import { operationJson } from "./operations-response";
import { ipcMain } from "electron";
import store from "./store";
import { getApiBaseUrl } from "./api-config";
import { allowedOperation, allowedSupplyOperation } from "./operations-policy";

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
  async function session() {
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
      const { data } = await session();
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
      try {
        const method = input?.method || "GET";
        if (!allowedOperation(input?.path, method))
          throw Error("عملية غير مسموحة");
        if (busy) throw Error("انتظر اكتمال العملية الحالية");
        busy = true;
        acquired = true;
        const { who, data: access } = await session();
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
        // Scope order details/returns to the device, including managers with wider tenant access.
        if (/^\/warehouses\/orders\//.test(route)) {
          const root = route.replace(/\/returns$/, "");
          const check = await fetch(`${getApiBaseUrl()}${root}`, {
            headers: { Authorization: `Bearer ${access.token}` },
            signal: AbortSignal.timeout(15000),
          });
          const entity = await operationJson(check);
          if (!check.ok || entity.order?.branchId !== who.branch)
            throw Error("الطلب لا ينتمي لفرع هذا الجهاز");
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
        if (
          method !== "GET" ||
          input.path.startsWith("/inventory/operation-batches")
        )
          await prepare();
        if (JSON.stringify(who) !== JSON.stringify(identity()))
          throw Error("تغيرت الجلسة؛ أعد المحاولة");
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
        const result = await operationJson(response);
        if (!response.ok)
          throw Error(result.message || result.error || "تعذر تنفيذ العملية");
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
            (route === "/inventory/transfers" || route.endsWith("/returns"))) ||
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
        return { success: true, data: result, warning };
      } catch (e) {
        return {
          success: false,
          error:
            e instanceof Error
              ? e.message
              : "تعذر الاتصال. تحقق من سجل الطلب قبل إعادة الإرسال.",
        };
      } finally {
        if (acquired) busy = false;
      }
    },
  );
  return async (permission: string) => {
    const { who, data } = await session();
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
