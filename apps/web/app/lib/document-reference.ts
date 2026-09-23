import type { Prisma } from "@prisma/client";
/** Allocate in PostgreSQL, never by row count or timestamp. Gaps on rollback are expected. */
export async function nextDocumentReference(db: Pick<Prisma.TransactionClient, "$queryRaw">, prefix: "PIN" | "WIN" | "FSL") {
  const rows = await db.$queryRaw<{ reference: string }[]>`SELECT next_document_reference(${prefix}::text) AS reference`;
  if (!rows[0]?.reference) throw new Error("تعذر توليد رقم المستند");
  return rows[0].reference;
}
