/** Classify database failures without exposing SQL, connection strings or patient data. */
export function classifyWhatsAppFailure(error: unknown) {
  const e =
    error && typeof error === "object"
      ? (error as { code?: unknown; meta?: { code?: unknown } })
      : {};
  const prismaCode =
    typeof e.code === "string" && /^P\d{4}$/.test(e.code) ? e.code : null;
  const sqlState =
    typeof e.meta?.code === "string" && /^[0-9A-Z]{5}$/.test(e.meta.code)
      ? e.meta.code
      : null;
  if (
    ["P2021", "P2022"].includes(prismaCode ?? "") ||
    (prismaCode === "P2010" && ["42P01", "42703"].includes(sqlState ?? ""))
  ) {
    return {
      code: "WHATSAPP_SCHEMA_NOT_READY",
      error: "خدمة الرسائل لم تُجهّز بعد؛ اطلب من المسؤول إكمال إعدادها.",
      prismaCode,
      sqlState,
    };
  }
  if (
    ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(prismaCode ?? "")
  ) {
    return {
      code: "WHATSAPP_DATABASE_UNAVAILABLE",
      error: "تعذر الاتصال بخدمة الرسائل حاليًا؛ حاول مرة أخرى بعد قليل.",
      prismaCode,
      sqlState,
    };
  }
  return {
    code: "WHATSAPP_REQUEST_FAILED",
    error: "تعذر إكمال الطلب حاليًا؛ حاول مجددًا أو تواصل مع المسؤول.",
    prismaCode,
    sqlState,
  };
}
