export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider    = (process.env.AI_PROVIDER ?? 'gemini') as 'gemini' | 'openai';
    const hasGemini   = !!process.env.GEMINI_API_KEY;
    const hasOpenAI   = !!process.env.OPENAI_API_KEY;
    const configured  = provider === 'openai' ? hasOpenAI : hasGemini;

    return NextResponse.json({ provider, configured });
}
