import crypto from 'crypto';

/**
 * Operator proof (N16): a narrow, server-issued credential that says "this
 * employee signed in online on this branch". The desktop keeps one per employee
 * who signed in there and attaches it to the operations that employee performed.
 *
 * It is NOT a sync credential. It is signed over a distinct purpose string, so a
 * proof can never be replayed as a sync token (and a sync token never verifies
 * as a proof). It only answers "can this operation's operator claim be trusted?"
 *
 * Validity:
 *  - signature over userId + branchId + sessionVersion + issuedAt + the device
 *    license it was issued to (a proof presented with a different license does
 *    not verify; copying both credentials is outside this guarantee. A
 *    device without a license gets an unbound proof, which
 *    enforcement refuses);
 *  - sessionVersion must still be the user's current one (password change or
 *    deactivation revokes outstanding proofs);
 *  - an offline-delegation window measured on the SERVER clock from issuedAt
 *    (the operation's own device time is never trusted).
 */
export const OPERATOR_PROOF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PURPOSE = 'operator-proof:v1';

function secret(): string {
    const value = process.env.SYNC_TOKEN_SECRET;
    if (!value) throw new Error('SYNC_TOKEN_SECRET env var is not set — refusing to issue operator proofs');
    return value;
}

function sign(userId: string, branchId: string, sessionVersion: number, issuedAt: number, deviceId: string | null): string {
    return crypto.createHmac('sha256', secret())
        .update(`${PURPOSE}:${userId}:${branchId}:${sessionVersion}:${issuedAt}:${deviceId ?? '-'}`)
        .digest('hex');
}

export function issueOperatorProof(userId: string, branchId: string, sessionVersion: number, deviceId: string | null = null, issuedAt = Date.now()): string {
    return `${issuedAt}.${sign(userId, branchId, sessionVersion, issuedAt, deviceId)}`;
}

/** The active device license a request presents for this branch (id), or null. */
export async function requestDeviceId(
    db: { deviceLicense: { findFirst(args: any): Promise<{ id: string } | null> } },
    request: Request, branchId: string,
): Promise<string | null> {
    const licenseKey = request.headers.get('x-device-license-key');
    if (!licenseKey || !branchId) return null;
    const license = await db.deviceLicense.findFirst({ where: { licenseKey, branchId, isActive: true }, select: { id: true } });
    return license?.id ?? null;
}

export type OperatorProofResult = 'verified' | 'missing' | 'invalid' | 'expired';

export function verifyOperatorProof(
    proof: string | null | undefined,
    operator: { id: string; branchId: string | null; sessionVersion: number },
    branchId: string,
    deviceId: string | null = null,
    now = Date.now(),
): OperatorProofResult {
    if (!proof) return 'missing';
    const [issuedRaw, mac] = proof.split('.');
    const issuedAt = Number(issuedRaw);
    if (!Number.isSafeInteger(issuedAt) || !mac || operator.branchId !== branchId) return 'invalid';
    const expected = Buffer.from(sign(operator.id, branchId, operator.sessionVersion, issuedAt, deviceId));
    const given = Buffer.from(mac);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return 'invalid';
    if (issuedAt > now + 5 * 60 * 1000) return 'invalid';
    if (now - issuedAt > OPERATOR_PROOF_TTL_MS) return 'expired';
    return 'verified';
}

/** Enforcement switch: once every desktop sends proofs, unverified operations become review conflicts. */
export function operatorProofRequired(): boolean {
    return process.env.REQUIRE_OPERATOR_PROOF === 'true';
}

/**
 * Checks the operator claim of one synced operation. Returns whether it is
 * verified, or null when enforcement is on and it is not (the caller turns that
 * into a review conflict). Unattributed operations (no operator id) are never
 * verified.
 */
export async function checkOperator(
    db: { user: { findUnique(args: any): Promise<{ id: string; branchId: string | null; sessionVersion: number } | null> } },
    operatorId: string | null | undefined,
    proofs: Record<string, string> | undefined,
    branchId: string,
    deviceId: string | null = null,
): Promise<boolean | null> {
    let verified = false;
    if (operatorId) {
        const operator = await db.user.findUnique({ where: { id: operatorId }, select: { id: true, branchId: true, sessionVersion: true } });
        verified = !!operator && verifyOperatorProof(proofs?.[operatorId], operator, branchId, deviceId) === 'verified';
    }
    // A signature without a licensed-device binding must never be labelled
    // verified, even while compatibility accepts unverified operations.
    if (!deviceId) verified = false;
    if (!verified && operatorProofRequired()) return null;
    return verified;
}
