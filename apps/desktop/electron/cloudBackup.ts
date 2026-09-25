import { createBackup } from './backup';
import store from './store';
import fs from 'fs';
import { net } from 'electron';
import path from 'node:path';

declare const __CLOUD_API_URL__: string;

// Store the interval ID to clear it if needed
let backupInterval: NodeJS.Timeout | null = null;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 Hours



export interface UploadResult {
    ok: boolean;
    status?: number;
    error?: string;
}

export async function uploadBackup(filePath: string, branchId: string = "default"): Promise<UploadResult> {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`Backup file not found for upload: ${filePath}`);
            return { ok: false, error: "ملف النسخة غير موجود" };
        }

        const stats = fs.statSync(filePath);
        console.log(`Starting upload of ${filePath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

        const cloudBase = (typeof __CLOUD_API_URL__ !== "undefined" && __CLOUD_API_URL__)
            || process.env.CLOUD_API_URL
            || "http://127.0.0.1:3000/api";
        const targetUrl = `${cloudBase}/backup/upload`;

        // Device license only: the server binds the backup to the license's branch.
        // No shared secret is built into the app; anything shipped in an installer
        // can be extracted.
        const licenseKey = store.get('licenseKey') as string | undefined;
        if (!licenseKey) return { ok: false, error: "فعّل ترخيص الجهاز لرفع النسخة الاحتياطية." };

        const form = new FormData();
        form.append('file', new Blob([await fs.promises.readFile(filePath)]), path.basename(filePath));
        form.append('branchId', branchId);
        const response = await net.fetch(targetUrl, {
            method: 'POST',
            body: form,
            headers: { "x-device-license-key": licenseKey, "x-branch-id": branchId },
        });

        if (response.ok) {
            const data = await response.json();
            console.log("Cloud backup upload successful:", data);
            return { ok: true, status: response.status };
        }

        const text = await response.text().catch(() => "");
        console.error(`Cloud backup upload failed: ${response.status} ${response.statusText} — ${text}`);
        // Surface a short, human-readable reason from the server response.
        let reason = text;
        try { reason = JSON.parse(text)?.message || text; } catch { /* keep raw text */ }
        return { ok: false, status: response.status, error: (reason || response.statusText || "").slice(0, 200) };
    } catch (error: any) {
        console.error("Error uploading backup:", error);
        return { ok: false, error: error?.message ? `تعذّر الاتصال: ${error.message}` : "تعذّر الاتصال بالخادم" };
    }
}

export function initBackupScheduler() {
    console.log("Initializing Cloud Backup Scheduler (Every 6 Hours)");

    if (backupInterval) {
        clearInterval(backupInterval);
    }

    // Run immediately on startup (or after a shortlist delay to let app settle)
    setTimeout(async () => {
        await performCloudBackup();
    }, 1 * 60 * 1000); // 1 minute delay

    backupInterval = setInterval(async () => {
        await performCloudBackup();
    }, BACKUP_INTERVAL_MS);
}

async function performCloudBackup() {
    try {
        console.log("Performing scheduled cloud backup...");

        // 1. Create Local Backup
        const result = await createBackup();

        if (result.success && result.path) {
            // 2. Upload — use the real branch this device is bound to so the
            // backup is filed under the correct branch (and license auth matches).
            const branchId = (store.get('branchId') as string) || "default";
            await uploadBackup(result.path, branchId);
        } else {
            console.error("Scheduled backup creation failed:", result.error);
        }

    } catch (error) {
        console.error("Scheduled backup execution error:", error);
    }
}
