import { graph, type Connection } from "./provider";
import { WaError } from "./domain";
export function platformApp() {
  const appId = process.env.WHATSAPP_META_APP_ID?.trim(),
    secret = process.env.WHATSAPP_META_APP_SECRET?.trim(),
    configId = process.env.WHATSAPP_SIGNUP_CONFIG_ID?.trim(),
    version = process.env.META_GRAPH_VERSION?.trim();
  if (
    !appId ||
    !/^\d{5,30}$/.test(appId) ||
    !secret ||
    secret.length < 16 ||
    !configId ||
    !/^\d{5,30}$/.test(configId) ||
    !version ||
    !/^v\d+\.\d+$/.test(version)
  )
    throw new WaError(
      "أكمل إعداد تطبيق المنصة والتسجيل المدمج لدى Meta أولًا.",
      503,
    );
  return { appId, secret, configId, version };
}
export function creditConfig() {
  const token = process.env.WHATSAPP_META_SYSTEM_TOKEN?.trim(),
    creditLineId = process.env.WHATSAPP_META_CREDIT_LINE_ID?.trim();
  if (
    !token ||
    token.length < 20 ||
    !creditLineId ||
    !/^\d{5,30}$/.test(creditLineId)
  )
    throw new WaError(
      "الفوترة المركزية تحتاج خط ائتمان معتمدًا لدى Meta ورمز مستخدم نظام للمنصة.",
      503,
    );
  return { token, creditLineId };
}
/** Read only: never attaches credit or creates a financial commitment. */
export async function verifyPlatformFunding(
  conn: Connection,
  allocationId: string,
) {
  if (!/^\d{5,30}$/.test(allocationId))
    throw new WaError("معرّف تخصيص الائتمان غير صالح.");
  const { token, creditLineId } = creditConfig(),
    system = { ...conn, token };
  let after: string | undefined,
    owned = false;
  for (let page = 0; page < 10; page++) {
    const r = await graph(
      system,
      `${creditLineId}/owning_credit_allocation_configs?fields=id&limit=100${after ? "&after=" + encodeURIComponent(after) : ""}`,
    );
    if (r.data?.some((x: { id: string }) => x.id === allocationId)) {
      owned = true;
      break;
    }
    if (!r.paging?.next || !r.paging?.cursors?.after) break;
    after = String(r.paging.cursors.after);
  }
  if (!owned)
    throw new WaError(
      "التخصيص لا يتبع خط ائتمان فاراماس أو تعذّر إثباته.",
      409,
    );
  const allocation = await graph(
    system,
    `${allocationId}?fields=receiving_credential`,
  );
  const account = await graph(
    conn,
    `${conn.businessId}?fields=primary_funding_id`,
  );
  const fundingId = allocation.receiving_credential?.id;
  if (
    allocation.id !== allocationId ||
    account.id !== conn.businessId ||
    !fundingId ||
    String(fundingId) !== String(account.primary_funding_id)
  )
    throw new WaError(
      "حساب المؤسسة غير مربوط بفوترة فاراماس؛ أكمل ربط الائتمان لدى Meta.",
      409,
    );
  return String(fundingId);
}
export async function exchangeSignupCode(code: string) {
  const { appId, secret, version } = platformApp();
  // Meta requires a GET token exchange. No credentials are logged or returned to the browser.
  const query = new URLSearchParams({
    client_id: appId,
    client_secret: secret,
    code,
  });
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${version}/oauth/access_token?${query}`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
  } catch {
    throw new WaError(
      "تعذر تبادل رمز Meta؛ أعد الربط. لم يتغير الاتصال المحفوظ.",
      502,
    );
  }
  const data = await response.json();
  if (
    !response.ok ||
    typeof data.access_token !== "string" ||
    data.access_token.length < 20
  )
    throw new WaError("انتهت صلاحية رمز Meta أو رُفض؛ أعد الربط.", 400);
  return data.access_token as string;
}
