export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { providerConfig } from '@/app/lib/ai-assistant';

export async function GET() {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Same check as the chat route: the key of the provider actually selected.
    const config = providerConfig();
    return NextResponse.json({ provider: config.ok ? config.provider : null, configured: config.ok });
}
