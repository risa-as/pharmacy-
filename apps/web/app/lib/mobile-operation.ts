import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
export async function mobileOperation<T>(
  tx: Prisma.TransactionClient,
  actorId: string,
  scope: string,
  body: any,
  work: () => Promise<T>,
): Promise<T> {
  const key = body.idempotencyKey;
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(key))
    throw new Error("مفتاح العملية مطلوب؛ حدّث التطبيق.");
  const id = createHash("sha256")
    .update(actorId + ":" + scope + ":" + key)
    .digest("hex");
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .filter((k) => k !== "idempotencyKey")
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical(body)))
    .digest("hex");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
  const previous = await tx.auditLog.findFirst({
    where: { entity: "MOBILE_OPERATION", entityId: id, userId: actorId },
  });
  if (previous) {
    const saved = JSON.parse(previous.details || "{}");
    if (saved.hash !== hash) throw new Error("المفتاح مستخدم لبيانات مختلفة.");
    return saved.result;
  }
  const result = await work();
  await tx.auditLog.create({
    data: {
      userId: actorId,
      userName: actorId,
      action: "CREATE",
      entity: "MOBILE_OPERATION",
      entityId: id,
      details: JSON.stringify({ hash, result }),
    },
  });
  return result;
}
