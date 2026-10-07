import type { Prisma } from "@prisma/client";
import { buildDateRange } from "./report-period";
export class AuditQueryError extends Error {}
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function auditLogQuery(
  scope: Prisma.AuditLogWhereInput,
  params: URLSearchParams,
) {
  const number = (key: string, fallback: number, max: number) => {
    const raw = params.get(key);
    if (!raw) return fallback;
    if (
      !/^\d+$/.test(raw) ||
      Number(raw) < 1 ||
      !Number.isSafeInteger(Number(raw))
    )
      throw new AuditQueryError("رقم الصفحة وحجمها يجب أن يكونا عددين موجبين.");
    return Math.min(Number(raw), max);
  };
  const page = number("page", 1, 100000),
    limit = number("limit", 30, 100);
  const filters: Prisma.AuditLogWhereInput[] = [scope];
  for (const key of ["userId", "entity", "action", "branchId"] as const) {
    const value = params.get(key)?.trim();
    if (value) {
      if (value.length > 200)
        throw new AuditQueryError("قيمة الفلتر طويلة جدًا.");
      filters.push({ [key]: value });
    }
  }
  const from = params.get("from") || undefined,
    to = params.get("to") || undefined;
  if (
    (from && !validDate(from)) ||
    (to && !validDate(to)) ||
    (from && to && from > to)
  )
    throw new AuditQueryError("اختر فترة تاريخ صحيحة.");
  if (from || to) {
    const period = buildDateRange(from || to, to || from);
    filters.push({
      createdAt: {
        ...(from ? { gte: period.start } : {}),
        ...(to ? { lte: period.end } : {}),
      },
    });
  }
  const search = params.get("search")?.trim();
  if (search) {
    if (search.length > 200) throw new AuditQueryError("نص البحث طويل جدًا.");
    filters.push({
      OR: [
        { userName: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search } },
      ],
    });
  }
  return { where: { AND: filters } as Prisma.AuditLogWhereInput, page, limit };
}
