import { createBackup } from './backup';
import fs from 'fs';
import formData from 'form-data';
import fetch from 'node-fetch'; // Electron uses Node's fetch or compatible

declare const __CLOUD_API_URL__: string;
declare const __BACKUP_SECRET_KEY__: string;

// Store the interval ID to clear it if needed
let backupInterval: NodeJS.Timeout | null = null;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 Hours



export async function uploadBackup(filePath: string, branchId: string = "default") {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`Backup file not found for upload: ${filePath}`);
            return false;
        }

        const stats = fs.statSync(filePath);
        const fileSizeInMegabytes = stats.size / (1024 * 1024);
        console.log(`Starting upload of ${filePath} (${fileSizeInMegabytes.toFixed(2)} MB)`);

        const form = new formData();
        form.append('file', fs.createReadStream(filePath));
        form.append('branchId', branchId);

        // Should fetch the setting from DB preferably, but for now we hardcode/env
        const cloudBase = (typeof __CLOUD_API_URL__ !== "undefined" && __CLOUD_API_URL__)
            || process.env.CLOUD_API_URL
            || "http://127.0.0.1:3000/api";
        const targetUrl = `${cloudBase}/backup/upload`;

        const response = await fetch(targetUrl, {
            method: 'POST',
            body: form,
            headers: {
                ...form.getHeaders(),
                "x-backup-secret": (typeof __BACKUP_SECRET_KEY__ !== "undefined" && __BACKUP_SECRET_KEY__)
                    || process.env.BACKUP_SECRET_KEY || "R$i1999s$a"
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log("Cloud backup upload successful:", data);
            return true;
        } else {
            console.error(`Cloud backup upload failed: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error("Response:", text);
            return false;
        }

    } catch (error) {
        console.error("Error uploading backup:", error);
        return false;
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
            // 2. Upload
            // TODO: Get real branchId from settings
            await uploadBackup(result.path, "default-branch");
        } else {
            console.error("Scheduled backup creation failed:", result.error);
        }

    } catch (error) {
        console.error("Scheduled backup execution error:", error);
    }
}
