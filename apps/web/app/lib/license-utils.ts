import crypto from "crypto";

/**
 * Generates a professional license key in the format: FRMC-XXXX-XXXX-XXXX
 * Uses cryptographically secure random bytes for unpredictability.
 */
export function generateLicenseKey(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars: 0,O,1,I
    const segments = 3;
    const segmentLength = 4;
    const parts: string[] = ["FRMC"];

    for (let s = 0; s < segments; s++) {
        const bytes = crypto.randomBytes(segmentLength);
        let segment = "";
        for (let i = 0; i < segmentLength; i++) {
            segment += chars[bytes[i] % chars.length];
        }
        parts.push(segment);
    }

    return parts.join("-");
}
