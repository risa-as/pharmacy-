import { prisma } from "@/app/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function PATCH(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const body = await req.json();
        const { minProfitMargin } = body;

        if (typeof minProfitMargin !== "number" || minProfitMargin < 0 || minProfitMargin > 100) {
            return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });
        }

        if (!tenantCtx.organizationId) {
            return NextResponse.json({ error: "Organization required" }, { status: 403 });
        }

        const org = await prisma.organization.update({
            where: { id: tenantCtx.organizationId },
            data: { minProfitMargin },
        });

        return NextResponse.json({ success: true, minProfitMargin: org.minProfitMargin });
    } catch (error) {
        console.error("Settings update error:", error);
        return NextResponse.json({ error: "فشل تحديث الإعدادات" }, { status: 500 });
    }
}
