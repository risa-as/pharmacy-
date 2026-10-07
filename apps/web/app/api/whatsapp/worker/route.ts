export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { runQueue } from "@/app/lib/whatsapp/worker";
import { sameSecret } from "@/app/lib/whatsapp/domain";
export async function GET(req: Request) {
  const secret = process.env.WHATSAPP_WORKER_SECRET;
  if (
    !secret ||
    secret.length < 32 ||
    !sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runQueue(prisma));
  } catch {
    return NextResponse.json(
      { error: "تعذر تشغيل طابور الرسائل." },
      { status: 503 },
    );
  }
}
