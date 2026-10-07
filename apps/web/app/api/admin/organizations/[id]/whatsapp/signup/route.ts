import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import {
  whatsappAdministrator,
  whatsappOrganization,
} from "@/app/lib/whatsapp/admin";
import {
  startSignup,
  exchangeAttempt,
  finishSignup,
  completeSavedCoexistence,
} from "@/app/lib/whatsapp/coexistence";
import { WaError } from "@/app/lib/whatsapp/domain";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await whatsappAdministrator(),
      org = await whatsappOrganization((await ctx.params).id);
    if (req.headers.get("origin") !== req.nextUrl.origin)
      throw new WaError("طلب الربط من مصدر غير مسموح.", 403);
    const text = await req.text();
    if (text.length > 10000) throw new WaError("الطلب أكبر من المسموح.");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new WaError("طلب غير صالح.");
    }
    const input = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("start") }).strict(),
        z.object({ action: z.literal("recheck") }).strict(),
        z
          .object({
            action: z.literal("exchange"),
            id: z.string().uuid(),
            code: z.string().min(5).max(8000),
          })
          .strict(),
        z
          .object({
            action: z.literal("finish"),
            id: z.string().uuid(),
            phoneId: z
              .string()
              .regex(/^\d{5,30}$/)
              .optional(),
            businessId: z.string().regex(/^\d{5,30}$/),
          })
          .strict(),
      ])
      .parse(raw);
    const result =
      input.action === "start"
        ? await startSignup(prisma, org, user.id)
        : input.action === "recheck"
          ? await completeSavedCoexistence(prisma, org, user)
          : input.action === "exchange"
            ? await exchangeAttempt(prisma, org, user.id, input.id, input.code)
            : await finishSignup(
                prisma,
                org,
                user,
                input.id,
                input.phoneId ?? "",
                input.businessId,
              );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof WaError
            ? e.message
            : e instanceof z.ZodError
              ? "بيانات الربط غير صالحة."
              : "تعذر إكمال الربط؛ راجع حالة الاتصال قبل إعادة المحاولة.",
      },
      {
        status:
          e instanceof WaError ? e.status : e instanceof z.ZodError ? 400 : 503,
      },
    );
  }
}
