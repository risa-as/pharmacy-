export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  enqueueWebhook,
  processWebhookChange,
  webhookSignature,
} from "@/app/lib/whatsapp/webhook";
import { prisma } from "@/app/lib/prisma";
import { connection } from "@/app/lib/whatsapp/store";
import { sameSecret } from "@/app/lib/whatsapp/domain";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await ctx.params,
      c = await connection(prisma, organizationId),
      q = req.nextUrl.searchParams;
    if (
      !c ||
      q.get("hub.mode") !== "subscribe" ||
      !sameSecret(q.get("hub.verify_token") ?? "", c.verifyToken)
    )
      return new NextResponse("Forbidden", { status: 403 });
    return new NextResponse(q.get("hub.challenge") ?? "");
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }
}
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await ctx.params,
      c = await connection(prisma, organizationId);
    if (!c) return new NextResponse("Forbidden", { status: 403 });
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 5000000)
      return new NextResponse("Too large", { status: 413 });
    if (
      !webhookSignature(
        raw,
        c.appSecret,
        req.headers.get("x-hub-signature-256") ?? "",
      )
    )
      return new NextResponse("Forbidden", { status: 403 });
    const payload = JSON.parse(raw);
    for (const entry of payload.entry ?? [])
      for (const change of entry.changes ?? []) {
        if (
          String(entry.id) !== c.businessId ||
          (change.field !== "account_update" &&
            change.value?.metadata?.phone_number_id !== c.phoneId)
        )
          continue;
        if (!change.field || change.field === "messages")
          await processWebhookChange(prisma, organizationId, change);
        else
          await enqueueWebhook(
            prisma,
            { entry: [{ ...entry, changes: [change] }] },
            organizationId,
          );
      }
    return NextResponse.json({ received: true });
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }
}
