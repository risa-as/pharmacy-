export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { buildContext, createProvider, providerConfig, sanitizeHistory, SYSTEM_PROMPT, type AIProvider, type ChatMessage } from '@/app/lib/ai-assistant';
import { reserveAiRequest, completeAiRequest, AI_PROVIDER_TIMEOUT_MS } from '@/app/lib/ai-usage';

const MAX_MESSAGE_CHARS = 2_000;

/** Runs the provider call with a hard timeout that also aborts the underlying request. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`AI provider timeout after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  try {
    // Role and scope come from the database (getTenantContext), not session claims.
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (tenantCtx.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'هذه الميزة متاحة للمدير فقط' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({})) as { message?: string; history?: ChatMessage[] };
    const message = (body.message ?? '').trim().slice(0, MAX_MESSAGE_CHARS);
    if (!message) {
      return NextResponse.json({ error: 'الرسالة فارغة' }, { status: 400 });
    }
    const history = sanitizeHistory(body.history);

    // Data first: cards are deterministic and remain useful even when the
    // language model is not configured, over its limit, or failing.
    const { context, cards, categories } = await buildContext(message, tenantCtx, history);

    // The selected provider must be constructible BEFORE any quota is reserved:
    // a key for the other provider does not count as configured.
    const config = providerConfig();
    let provider: AIProvider | null = null;
    let notConfigured = config.ok ? '' : config.reason;
    if (config.ok) {
      try { provider = createProvider(); } catch (err: any) { notConfigured = String(err?.message ?? err); }
    }
    if (!provider) {
      console.warn('[AI Chat] provider not configured:', notConfigured);
      if (cards.length) return NextResponse.json({ response: null, cards, notice: 'الشرح النصي غير مفعّل؛ البيانات في البطاقة من النظام مباشرة.' });
      return NextResponse.json(
        { error: `المساعد الذكي غير مفعّل — ${notConfigured}. يرجى ضبط AI_PROVIDER ومفتاح المزوّد نفسه في ملف .env` },
        { status: 503 }
      );
    }

    const { organizationId } = tenantCtx;
    // Atomic reservation against the daily limit (see ai-usage.ts).
    const reservation = organizationId ? await reserveAiRequest(organizationId) : null;
    if (organizationId && !reservation) {
      if (cards.length) return NextResponse.json({ response: null, cards, notice: 'تجاوزت الحد اليومي للشرح النصي؛ البيانات في البطاقة من النظام مباشرة.' });
      return NextResponse.json(
        { error: 'تجاوزت الحد اليومي للمساعد الذكي. يتجدد الحد منتصف الليل بتوقيت بغداد.' },
        { status: 429 }
      );
    }

    const startedAt = Date.now();
    const active = provider;
    try {
      const response = await withTimeout((signal) => active.chat(SYSTEM_PROMPT, context, message, history, signal), AI_PROVIDER_TIMEOUT_MS);
      if (reservation) await completeAiRequest(reservation.id, {
        ok: true, startedAt, provider: active.name, model: active.model, categories,
        inputChars: SYSTEM_PROMPT.length + context.length + message.length + history.reduce((s, h) => s + h.content.length, 0),
        outputChars: response.length, cardCount: cards.length,
      });
      return NextResponse.json({ response, cards });
    } catch (err: any) {
      if (reservation) await completeAiRequest(reservation.id, {
        ok: false, startedAt, provider: active.name, model: active.model, categories, cardCount: cards.length, error: String(err?.message ?? err),
      });
      console.error('[AI Chat provider error]', err);
      if (cards.length) return NextResponse.json({ response: null, cards, notice: 'تعذر إعداد الشرح النصي الآن؛ البيانات في البطاقة من النظام مباشرة.' });
      throw err;
    }
  } catch (err: any) {
    console.error('[AI Chat Error]', err);
    const msg = err?.message?.includes('API_KEY') || err?.message?.includes('api key')
      ? 'مفتاح AI غير صالح — يرجى التحقق من الإعدادات'
      : err?.message?.includes('timeout')
        ? 'استغرق المساعد وقتاً أطول من المسموح. حاول مجدداً.'
        : 'حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مجدداً.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
