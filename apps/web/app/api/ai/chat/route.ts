export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { prisma } from '@/app/lib/prisma';
import { buildContext, createProvider, SYSTEM_PROMPT, type ChatMessage } from '@/app/lib/ai-assistant';

function getIraqDayStart(): Date {
  const iraqOffset = 3 * 60 * 60 * 1000;
  const nowInIraq = new Date(Date.now() + iraqOffset);
  return new Date(Date.UTC(
    nowInIraq.getUTCFullYear(),
    nowInIraq.getUTCMonth(),
    nowInIraq.getUTCDate(),
    0, 0, 0, 0
  ) - iraqOffset);
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'هذه الميزة متاحة للمدير فقط' }, { status: 403 });
    }

    const configured = !!(process.env.AI_PROVIDER && (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY));
    if (!configured) {
      return NextResponse.json(
        { error: 'المساعد الذكي غير مفعّل — يرجى ضبط AI_PROVIDER والمفتاح المناسب في ملف .env' },
        { status: 503 }
      );
    }

    const body = await req.json() as { message?: string; history?: ChatMessage[] };
    const message = (body.message ?? '').trim();
    if (!message) {
      return NextResponse.json({ error: 'الرسالة فارغة' }, { status: 400 });
    }

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    const { organizationId } = tenantCtx;

    // Check daily usage limit
    if (organizationId) {
      const dayStart = getIraqDayStart();
      const [org, used] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { aiDailyLimit: true },
        }),
        prisma.aiUsageLog.count({
          where: { organizationId, createdAt: { gte: dayStart } },
        }),
      ]);

      const limit = org?.aiDailyLimit ?? 50;
      if (used >= limit) {
        return NextResponse.json(
          { error: `تجاوزت الحد اليومي للمساعد الذكي (${limit} رسالة/يوم). يتجدد الحد منتصف الليل بتوقيت بغداد.` },
          { status: 429 }
        );
      }
    }

    const [context, provider] = await Promise.all([
      buildContext(message, tenantCtx),
      Promise.resolve(createProvider()),
    ]);

    const history = (body.history ?? []).slice(-10);
    const response = await provider.chat(SYSTEM_PROMPT, context, message, history);

    // Log successful usage
    if (organizationId) {
      await prisma.aiUsageLog.create({
        data: { id: crypto.randomUUID(), organizationId },
      });
    }

    return NextResponse.json({ response });
  } catch (err: any) {
    console.error('[AI Chat Error]', err);
    const msg = err?.message?.includes('API_KEY') || err?.message?.includes('api key')
      ? 'مفتاح AI غير صالح — يرجى التحقق من الإعدادات'
      : 'حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مجدداً.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
