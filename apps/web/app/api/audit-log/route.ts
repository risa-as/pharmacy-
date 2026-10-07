export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { auditLogQuery, AuditQueryError } from "@/app/lib/audit-log-query";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ctx = await getTenantContext("read");
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.userPermissions.canViewAuditLog)
      return NextResponse.json(
        { error: "ليس لديك صلاحية لعرض سجل التدقيق." },
        { status: 403 },
      );
    const { user, organizationId } = ctx;
    let scope: any = {};
    if (user.role !== "SUPER_ADMIN") {
      const manager = ["ADMIN", "MANAGER"].includes(user.role);
      if ((manager && !organizationId) || (!manager && !user.branchId))
        return NextResponse.json(
          { error: "تعذر تحديد نطاق سجل التدقيق." },
          { status: 403 },
        );
      const branches = await prisma.branch.findMany({
        where: ctx.branchModelWhere,
        select: { id: true },
      });
      const branchIds = branches.map((b) => b.id);
      const userIds = await prisma.user
        .findMany({
          where: manager
            ? { branch: { organizationId } }
            : { branchId: user.branchId },
          select: { id: true },
        })
        .then((us) => us.map((u) => u.id));
      scope = {
        OR: [
          { branchId: { in: branchIds } },
          { branchId: null, userId: { in: userIds } },
        ],
      };
    }
    const query = auditLogQuery(scope, new URL(req.url).searchParams);
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: query.where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.auditLog.count({ where: query.where }),
    ]);
    return NextResponse.json({
      logs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  } catch (error) {
    if (error instanceof AuditQueryError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Audit Log GET Error:", error);
    return NextResponse.json(
      { error: "تعذر تحميل سجل النشاطات. حاول مرة أخرى." },
      { status: 500 },
    );
  }
}

const clientEvent = z.object({
  action: z.string().trim().min(1).max(100),
  entity: z.string().trim().min(1).max(100),
  entityId: z.string().max(200).nullish(),
  details: z.union([z.string().max(4000), z.record(z.unknown())]).nullish(),
});
// Client reports are observations, never proof that a business mutation succeeded.
// Business audit entries must be created by the server executing that mutation.
export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext("write");
    if (ctx instanceof NextResponse) return ctx;
    const input = clientEvent.safeParse(await req.json());
    if (!input.success)
      return NextResponse.json(
        { error: "بيانات النشاط غير صالحة." },
        { status: 400 },
      );
    const details = JSON.stringify({
      source: "client-report",
      reportedAction: input.data.action,
      reportedEntity: input.data.entity,
      reportedDetails: input.data.details ?? null,
    });
    if (details.length > 6000)
      return NextResponse.json(
        { error: "تفاصيل النشاط طويلة جدًا." },
        { status: 400 },
      );
    const log = await prisma.auditLog.create({
      data: {
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? "غير معروف",
        action: "CLIENT_EVENT",
        entity: "CLIENT_EVENT",
        entityId: input.data.entityId ?? null,
        details,
        branchId: ctx.user.branchId ?? null,
      },
    });
    return NextResponse.json({ success: true, log });
  } catch (error) {
    console.error("Audit Log POST Error:", error);
    return NextResponse.json({ error: "تعذر حفظ النشاط." }, { status: 500 });
  }
}
