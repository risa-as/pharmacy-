import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Auth helpers for the public-facing patient app.
 *
 * Patient tokens use a distinct `kind` claim and `patientUserId` (not `userId`)
 * so they can never be used to authenticate against staff/dashboard endpoints
 * that read `userId` via getTenantContext.
 */

const TOKEN_KIND = 'patient-app';

function getSecret(): Uint8Array {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET env var is not set');
    return new TextEncoder().encode(secret);
}

export async function signPatientToken(patientUserId: string): Promise<string> {
    return new SignJWT({ patientUserId, kind: TOKEN_KIND })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(getSecret());
}

/**
 * Resolves the authenticated patient-app user id from the request's Bearer
 * token. Returns a 401 NextResponse when the token is missing/invalid.
 */
export async function getPatientUserId(req: Request): Promise<string | NextResponse> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { payload } = await jwtVerify(authHeader.slice(7), getSecret());
        if (payload.kind !== TOKEN_KIND || !payload.patientUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return payload.patientUserId as string;
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}
