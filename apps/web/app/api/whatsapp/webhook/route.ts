import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { sameSecret } from "@/app/lib/whatsapp/domain";
import { enqueueWebhook, webhookSignature } from "@/app/lib/whatsapp/webhook";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams,
    t = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  return t &&
    t.length >= 32 &&
    q.get("hub.mode") === "subscribe" &&
    sameSecret(q.get("hub.verify_token") ?? "", t)
    ? new NextResponse(q.get("hub.challenge") ?? "")
    : new NextResponse("Forbidden", { status: 403 });
}
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.WHATSAPP_META_APP_SECRET;
    if (!secret || secret.length < 16)
      return new NextResponse("Unavailable", { status: 503 });
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 5000000)
      return new NextResponse("Too large", { status: 413 });
    if (
      !webhookSignature(
        raw,
        secret,
        req.headers.get("x-hub-signature-256") ?? "",
      )
    )
      return new NextResponse("Forbidden", { status: 403 });
    const payload = JSON.parse(raw);
    if (
      payload.object !== "whatsapp_business_account" ||
      !Array.isArray(payload.entry)
    )
      return new NextResponse("Invalid", { status: 400 });
    await enqueueWebhook(prisma, payload);
    return NextResponse.json({ received: true });
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }
}
