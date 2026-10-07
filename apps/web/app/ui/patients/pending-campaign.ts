export type CampaignAttempt = {
  id: string;
  owner: string;
  payload: Record<string, unknown>;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (organizationId: string) =>
  `faramace:wa-campaign:${organizationId}`;
export function readAttempt(
  storage: StorageLike,
  organizationId: string,
): CampaignAttempt | null {
  const raw = storage.getItem(key(organizationId));
  if (raw === null) return null;
  let p: CampaignAttempt;
  try {
    p = JSON.parse(raw);
  } catch {
    throw Error(
      "محاولة محفوظة غير سليمة؛ لا تمسح تخزين الموقع. اطلب استرداد نتيجتها.",
    );
  }
  if (
    !p ||
    typeof p !== "object" ||
    typeof p.id !== "string" ||
    !p.id ||
    typeof p.owner !== "string" ||
    !p.owner ||
    !p.payload ||
    typeof p.payload !== "object" ||
    Array.isArray(p.payload)
  )
    throw Error("محاولة محفوظة غير سليمة؛ يلزم استردادها.");
  return p;
}
export function saveAttempt(
  storage: StorageLike,
  organizationId: string,
  p: CampaignAttempt,
) {
  const prior = readAttempt(storage, organizationId);
  if (prior && prior.id !== p.id)
    throw Error("يوجد إرسال حملة غير محسوم؛ استكمل المحاولة السابقة أولًا.");
  const raw = JSON.stringify(p);
  storage.setItem(key(organizationId), raw);
  if (storage.getItem(key(organizationId)) !== raw)
    throw Error("تعذر حفظ محاولة الإرسال؛ لم يُرسل شيء.");
}
export function finishAttempt(
  storage: StorageLike,
  organizationId: string,
  id: string,
) {
  if (readAttempt(storage, organizationId)?.id === id)
    storage.removeItem(key(organizationId));
}
