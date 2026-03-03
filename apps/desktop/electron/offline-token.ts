/**
 * offline-token.ts
 *
 * RS256 offline JWT store, loader, verifier, and state evaluator for the
 * Electron desktop app. The server signs the token with its private key;
 * the desktop verifies with the bundled public key — no secrets on-device.
 *
 * US6: Offline Time-Bomb enforcement (FR-029 – FR-035).
 */

import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { jwtVerify, importSPKI } from "jose";

export interface OfflineTokenPayload {
    organizationId: string;
    subscriptionEndsAt: string | null;
    gracePeriodEndsAt: string | null;
    isSuspended: boolean;
    issuedAt: string;
    maxOfflineDays: number;
}

export type OfflineSubscriptionState =
    | "active"
    | "grace"
    | "suspended"
    | "clock-tampered"
    | "offline-limit-exceeded";

const TOKEN_FILE_NAME = "offline-token.jwt";

function getTokenPath(): string {
    return path.join(app.getPath("userData"), TOKEN_FILE_NAME);
}

/** Persist the offline JWT to the app's userData directory. */
export function storeOfflineToken(token: string): void {
    try {
        fs.writeFileSync(getTokenPath(), token, "utf-8");
    } catch (err) {
        console.error("[OfflineToken] Failed to store token:", err);
    }
}

/** Load the offline JWT from disk. Returns null if missing or unreadable. */
export function loadOfflineToken(): string | null {
    try {
        const tokenPath = getTokenPath();
        if (!fs.existsSync(tokenPath)) return null;
        const raw = fs.readFileSync(tokenPath, "utf-8").trim();
        return raw || null;
    } catch {
        return null;
    }
}

/**
 * Verify the RS256 signature with the bundled public key and decode the payload.
 * Returns null if the signature is invalid, the token is expired, or parsing fails.
 */
export async function verifyAndDecodeToken(
    token: string,
    publicKeyPem: string
): Promise<OfflineTokenPayload | null> {
    try {
        const publicKey = await importSPKI(publicKeyPem, "RS256");
        const { payload } = await jwtVerify(token, publicKey);
        return payload as unknown as OfflineTokenPayload;
    } catch (err) {
        console.warn("[OfflineToken] Token verification failed:", err);
        return null;
    }
}

/**
 * Derives the offline subscription enforcement state from a verified token payload.
 *
 * Priority (first match wins):
 *  1. clock-tampered     — system clock is behind issuedAt (rollback detected)
 *  2. offline-limit-exceeded — offline for more than maxOfflineDays
 *  3. suspended          — isSuspended flag or past gracePeriodEndsAt
 *  4. grace              — subscriptionEndsAt passed but within grace window
 *  5. active             — all checks pass
 *
 * @param payload     Decoded token payload from verifyAndDecodeToken()
 * @param lastSeenAt  Timestamp of last successful online check-in (for rollback reference)
 */
export function evaluateSubscriptionState(
    payload: OfflineTokenPayload,
    lastSeenAt: Date | null
): OfflineSubscriptionState {
    const now = Date.now();
    const issuedAt = new Date(payload.issuedAt).getTime();

    // ── 1. Clock rollback detection ──────────────────────────────────────────
    // If system time is behind the token's issuedAt or lastSeenAt → tampered.
    if (now < issuedAt) {
        return "clock-tampered";
    }
    if (lastSeenAt && now < lastSeenAt.getTime()) {
        return "clock-tampered";
    }

    // ── 2. Offline-limit enforcement ─────────────────────────────────────────
    const msOffline = now - issuedAt;
    const maxOfflineMs = payload.maxOfflineDays * 24 * 60 * 60 * 1000;
    if (msOffline > maxOfflineMs) {
        return "offline-limit-exceeded";
    }

    // ── 3. Manual suspension flag ────────────────────────────────────────────
    if (payload.isSuspended) {
        return "suspended";
    }

    // ── 4. Grace period / auto-suspension check ───────────────────────────────
    if (payload.gracePeriodEndsAt) {
        const graceEnd = new Date(payload.gracePeriodEndsAt).getTime();
        if (now > graceEnd) {
            return "suspended";
        }
    }

    if (payload.subscriptionEndsAt) {
        const subEnd = new Date(payload.subscriptionEndsAt).getTime();
        if (now > subEnd) {
            return "grace";
        }
    }

    return "active";
}
