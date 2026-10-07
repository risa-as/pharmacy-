import { WaError } from "./domain";
export type Connection = {
  organizationId: string;
  phoneId: string;
  businessId: string;
  token: string;
  appSecret: string;
  verifyToken: string;
  mode?: string;
  state?: string;
  allocationId?: string | null;
  fundingId?: string | null;
  billingVerifiedAt?: Date | null;
};
/** Versions are configured at deployment; never silently pin an expired Graph version. */
export async function graph(
  connection: Connection,
  path: string,
  body?: unknown,
) {
  const version = process.env.META_GRAPH_VERSION?.trim();
  if (!version || !/^v\d+\.\d+$/.test(version))
    throw new WaError("حدد إصدار Graph API المدعوم في إعدادات الخادم.", 503);
  const r = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new WaError(
      "رفض WhatsApp الطلب؛ راجع حالة القالب أو إعداد الاتصال.",
      r.status >= 500 ? 502 : 400,
    );
    Object.assign(e, {
      providerCode: data.error?.code,
      ambiguous: r.status >= 500,
    });
    throw e;
  }
  return data;
}
export async function sendTemplate(
  connection: Connection,
  message: {
    id: string;
    phone: string;
    metaName: string;
    language: string;
    parameters: string[];
  },
) {
  const data = await graph(connection, `${connection.phoneId}/messages`, {
    messaging_product: "whatsapp",
    to: message.phone,
    biz_opaque_callback_data: message.id,
    type: "template",
    template: {
      name: message.metaName,
      language: { code: message.language },
      components: message.parameters.length
        ? [
            {
              type: "body",
              parameters: message.parameters.map((text) => ({
                type: "text",
                text,
              })),
            },
          ]
        : [],
    },
  });
  if (!data.messages?.[0]?.id)
    throw new Error("Provider response did not contain a message id");
  return String(data.messages[0].id);
}
