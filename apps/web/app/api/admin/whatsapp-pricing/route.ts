import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  whatsappPricingSchema,
  WHATSAPP_IRAQ_REFERENCE,
} from "@/app/lib/whatsapp/pricing";
import {
  readWhatsAppPricing,
  WA_PRICING_LOCK,
} from "@/app/lib/whatsapp/pricing-store";
import { WaError } from "@/app/lib/whatsapp/domain";

export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof WaError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return NextResponse.json(
      { error: "راجع الأسعار والنسبة والتاريخ المدخل." },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        "تعذر قراءة أو حفظ التسعير. تحقق من ترحيل WhatsApp للتسعير واتصال القاعدة.",
    },
    { status: 503 },
  );
}
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "سجل الدخول أولًا." }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN")
    return NextResponse.json(
      { error: "متاح لمدير المنصة فقط." },
      { status: 403 },
    );
  try {
    const policy = await readWhatsAppPricing(prisma);
    return NextResponse.json(
      { policy, reference: WHATSAPP_IRAQ_REFERENCE },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "سجل الدخول أولًا." }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN")
    return NextResponse.json(
      { error: "متاح لمدير المنصة فقط." },
      { status: 403 },
    );
  try {
    const text = await req.text();
    if (text.length > 5000)
      return NextResponse.json(
        { error: "الطلب أكبر من الحد المسموح." },
        { status: 400 },
      );
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
    }
    const input = z
      .object({
        revision: z.number().int().min(0).max(2147483646),
        config: whatsappPricingSchema,
      })
      .strict()
      .parse(raw);
    const policy = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${WA_PRICING_LOCK}::text,0))`;
      const old = await readWhatsAppPricing(tx);
      if ((old?.revision ?? 0) !== input.revision)
        throw new WaError(
          "تغيرت الأسعار من جلسة أخرى. حدّث الصفحة وراجعها قبل الحفظ.",
          409,
        );
      const revision = input.revision + 1;
      await tx.$executeRaw`INSERT INTO "public"."WaPricingPolicy" (id,revision,config,"updatedBy","updatedAt") VALUES ('singleton',${revision},${JSON.stringify(input.config)}::jsonb,${session.user.id},NOW()) ON CONFLICT (id) DO UPDATE SET revision=EXCLUDED.revision,config=EXCLUDED.config,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`;
      await tx.auditLog.create({
        data: {
          userId: session.user.id!,
          userName: session.user.name ?? "مدير المنصة",
          action: "UPDATE",
          entity: "SETTINGS",
          entityId: "whatsapp-pricing",
          details: JSON.stringify({
            source: "web",
            old,
            new: { revision, config: input.config },
          }),
        },
      });
      return { revision, config: input.config };
    });
    return NextResponse.json({ policy });
  } catch (e) {
    return failure(e);
  }
}
