import "server-only";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Server-side signing for offline (standalone) desktop licenses.
 *
 * The vendor private key lives ONLY in the OFFLINE_LICENSE_PRIVATE_KEY_B64 env
 * var (base64 of the PKCS8 PEM). The matching public key is embedded in the
 * offline desktop app, which verifies the code locally with zero server calls.
 * A code is locked to one device fingerprint, so it can't be moved to another
 * pharmacy's machine.
 */

export interface OfflineLicenseInput {
    hardwareId: string;
    pharmacyName: string;
    licensedTo?: string;
    /** Number of days until expiry. Omit / 0 → perpetual. */
    expiryDays?: number;
}

export interface SignedOfflineLicense {
    code: string;
    plan: "PERPETUAL" | "ANNUAL";
    expiresAt: Date | null;
}

function loadPrivateKeyPem(): string {
    const b64 = process.env.OFFLINE_LICENSE_PRIVATE_KEY_B64;
    if (!b64) {
        throw new Error(
            "OFFLINE_LICENSE_PRIVATE_KEY_B64 is not set. Add the base64 vendor private key to the server environment.",
        );
    }
    return Buffer.from(b64, "base64").toString("utf-8");
}

export async function signOfflineLicense(input: OfflineLicenseInput): Promise<SignedOfflineLicense> {
    const hardwareId = input.hardwareId?.trim();
    const pharmacyName = input.pharmacyName?.trim();
    if (!hardwareId) throw new Error("بصمة الجهاز مطلوبة.");
    if (!pharmacyName) throw new Error("اسم الصيدلية مطلوب.");

    const key = await importPKCS8(loadPrivateKeyPem(), "RS256");
    const hasExpiry = !!input.expiryDays && input.expiryDays > 0;

    let jwt = new SignJWT({
        hw: hardwareId,
        pharmacy: pharmacyName,
        ...(input.licensedTo?.trim() ? { licensedTo: input.licensedTo.trim() } : {}),
        plan: hasExpiry ? "ANNUAL" : "PERPETUAL",
    })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt();

    let expiresAt: Date | null = null;
    if (hasExpiry) {
        jwt = jwt.setExpirationTime(`${input.expiryDays}d`);
        expiresAt = new Date(Date.now() + input.expiryDays! * 24 * 60 * 60 * 1000);
    }

    const code = await jwt.sign(key);
    return { code, plan: hasExpiry ? "ANNUAL" : "PERPETUAL", expiresAt };
}
