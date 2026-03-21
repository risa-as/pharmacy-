import { app, BrowserWindow, ipcMain, shell, powerMonitor, Menu } from "electron";
import {
  loadOfflineToken,
  verifyAndDecodeToken,
  evaluateSubscriptionState,
} from "./offline-token";
import { getDeviceIdentity } from "../src/utils/hardware";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma, runMigrations } from "./db";
import bcrypt from "bcryptjs";
import {
  startSyncService,
  getConnectionStatus,
  syncSales,
  syncProducts,
  syncShifts,
  syncTransactions,
  syncDebtPayments,
  pushCreateDrugToCloud,
  pushAddToInventoryToCloud,
  pushDeleteInventoryFromCloud,
  pushPatient,
  pushAddBatchToCloud,
  pushUpdateInventoryToCloud,
  pushQuickSaleToggle,
} from "./sync";
import {
  createBackup,
  restoreBackup,
  getBackupList,
  cleanupOldBackups,
} from "./backup";
import { initBackupScheduler } from "./cloudBackup";
import store from "./store";
import { getApiCandidates, setApiBaseUrl } from "./api-config";
import crypto from "crypto";

// These globals are baked in at build time by vite.config.ts define.
declare const __ZAINCASH_MERCHANT_ID__: string;
declare const __ZAINCASH_SECRET__: string;
declare const __ZAINCASH_BASE_URL__: string;
declare const __BACKUP_SECRET_KEY__: string;
declare const __OFFLINE_TOKEN_PUBLIC_KEY__: string;

// Zain Cash Configuration
const ZAINCASH_MERCHANT_ID =
  (typeof __ZAINCASH_MERCHANT_ID__ !== "undefined" && __ZAINCASH_MERCHANT_ID__) ||
  process.env.ZAINCASH_MERCHANT_ID || "5ffacf6612b5777c6d44d6d6";
const ZAINCASH_SECRET =
  (typeof __ZAINCASH_SECRET__ !== "undefined" && __ZAINCASH_SECRET__) ||
  process.env.ZAINCASH_SECRET ||
  "$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYnjJLUGwdahiZYuy2CI3af8v1YIDC6";
const ZAINCASH_BASE_URL =
  (typeof __ZAINCASH_BASE_URL__ !== "undefined" && __ZAINCASH_BASE_URL__) ||
  process.env.ZAINCASH_BASE_URL || "https://test.zaincash.iq";

function generateZainCashToken(payload: object): string {
  const header = { alg: "HS256", typ: "JWT" };
  const base64Header = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", ZAINCASH_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");
  return `${base64Header}.${base64Payload}.${signature}`;
}

const distPath = path.join(__dirname, "../dist");
process.env.DIST = distPath;
const publicPath = app.isPackaged ? distPath : path.join(distPath, "../public");
process.env.VITE_PUBLIC = publicPath;

let win: BrowserWindow | null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
  // Remove default Electron menu — it can intercept keyboard shortcuts on Windows
  // and prevent characters from reaching focused input elements.
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    icon: path.join(publicPath, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      spellcheck: false,        // Prevents IME/spellcheck interference with Arabic input on Windows
    },
  });

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(distPath, "index.html"));
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ظ†ط³ط® ط§ط­طھظٹط§ط·ظٹ طھظ„ظ‚ط§ط¦ظٹ ط¹ظ†ط¯ ط¥ط؛ظ„ط§ظ‚ ط§ظ„طھط·ط¨ظٹظ‚
app.on("before-quit", async () => {
  console.log("Creating auto-backup before quit...");
  try {
    await Promise.race([
      createBackup(),
      new Promise<void>(resolve => setTimeout(resolve, 8000)), // 8s max
    ]);
  } catch (e) {
    console.error("Auto-backup failed on quit:", e);
  }
  cleanupOldBackups(10);
  await prisma.$disconnect();
});

type PendingSyncType =
  | "create-drug"
  | "add-inventory"
  | "delete-inventory"
  | "add-batch"
  | "update-inventory";
type SyncMode = "manual" | "auto" | "smart";

interface PendingSyncAction {
  id: string;
  type: PendingSyncType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
  nextRetryAt?: string;
}

type SyncHealthSnapshot = {
  syncMode: SyncMode;
  pendingCount: number;
  failedCount: number;
  inProgress: boolean;
  oldestPendingAt: string | null;
  oldestPendingAgeSec: number;
  nextRetryAt: string | null;
  nextRetryInSec: number | null;
  byType: Record<PendingSyncType, number>;
  topError: string | null;
  autoRetryIntervalSec: number;
  nextAutoRunAt: string | null;
  nextAutoRunInSec: number | null;
};

let pendingSyncInProgress = false;
const MAX_PENDING_DELETE_ATTEMPTS = 8;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;
const AUTO_RETRY_INTERVAL_MS = 60 * 1000;
// const SMART_RETRY_IDLE_MS = 2 * 60_000;
// const SMART_RETRY_NORMAL_MS = 40_000;
// const SMART_RETRY_BUSY_MS = 20_000;
// const SMART_RETRY_RECOVERY_MS = 30_000;
// const DEFAULT_SYNC_MODE: SyncMode = 'auto';

// let pendingSyncTimer: NodeJS.Timeout | null = null;
// let nextAutoSyncRunAtMs = 0;

function parseIsoDate(value?: string): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function computeNextRetryAt(attempts: number): string {
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.max(1, attempts));
  return new Date(Date.now() + delay).toISOString();
}

type CloudProductSnapshot = {
  id?: string;
  inventoryId?: string;
  stock?: number;
};

async function fetchCloudProductsForBranch(
  branchId: string,
): Promise<CloudProductSnapshot[] | null> {
  for (const base of getApiCandidates()) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(
        `${base}/sync/products?branchId=${encodeURIComponent(branchId)}`,
        {
          method: "GET",
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);
      if (!response.ok) continue;

      setApiBaseUrl(base);

      const data = (await response.json()) as {
        drugs?: CloudProductSnapshot[];
      };
      return Array.isArray(data?.drugs) ? data.drugs : [];
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function isAddInventoryLikelyAlreadySynced(
  action: PendingSyncAction,
): Promise<boolean> {
  if (action.type !== "add-inventory") return false;

  const drugId = String(action.payload.drugId || "").trim();
  const inventoryId = String(action.payload.id || "").trim();
  const branchId = String(action.payload.branchId || "").trim();
  const quantity = Number(action.payload.quantity || 0);

  if (!drugId || !branchId || !Number.isFinite(quantity) || quantity <= 0) {
    return false;
  }

  const drugs = await fetchCloudProductsForBranch(branchId);
  if (!drugs) return false;

  const cloudDrug = drugs.find((d) => String(d.id || "") === drugId);
  if (!cloudDrug) return false;

  if (inventoryId) {
    const cloudInventoryId = String(cloudDrug.inventoryId || "").trim();
    if (cloudInventoryId && cloudInventoryId !== inventoryId) {
      return false;
    }
  }

  const cloudStock = Number(cloudDrug.stock || 0);
  return cloudStock >= quantity;
}

async function isDeleteInventoryLikelyAlreadySynced(
  action: PendingSyncAction,
): Promise<boolean> {
  if (action.type !== "delete-inventory") return false;

  const inventoryId = String(action.payload.inventoryId || "").trim();
  const drugId = String(action.payload.drugId || "").trim();
  const branchId = String(
    action.payload.branchId || store.get("branchId") || "",
  ).trim();

  if (!inventoryId || !branchId) {
    return false;
  }

  const drugs = await fetchCloudProductsForBranch(branchId);
  if (!drugs) return false;

  const sameInventory = drugs.find(
    (d) => String(d.inventoryId || "").trim() === inventoryId,
  );
  if (sameInventory) {
    return false;
  }

  if (drugId) {
    const sameDrug = drugs.find((d) => String(d.id || "").trim() === drugId);
    if (sameDrug) {
      return false;
    }
  }

  return true;
}

function normalizePendingSyncActions(
  rawActions: PendingSyncAction[],
): PendingSyncAction[] {
  const createDrugById = new Map<string, PendingSyncAction>();
  const addInventoryById = new Map<string, PendingSyncAction>();
  const deleteInventoryById = new Map<string, PendingSyncAction>();
  const addBatchById = new Map<string, PendingSyncAction>();
  const updateInventoryById = new Map<string, PendingSyncAction>();

  for (const action of rawActions) {
    if (!action || typeof action !== "object") continue;
    if (
      !action.id ||
      !action.type ||
      !action.payload ||
      typeof action.payload !== "object"
    )
      continue;

    if (action.type === "create-drug") {
      const drugId = String(action.payload.id || "").trim();
      if (!drugId) continue;
      createDrugById.set(drugId, action);
      continue;
    }

    if (action.type === "add-inventory") {
      const inventoryId = String(action.payload.id || "").trim();
      if (!inventoryId) continue;
      addInventoryById.set(inventoryId, action);
      continue;
    }

    if (action.type === "delete-inventory") {
      if (action.attempts >= MAX_PENDING_DELETE_ATTEMPTS) {
        continue;
      }
      const inventoryId = String(action.payload.inventoryId || "").trim();
      if (!inventoryId) continue;
      deleteInventoryById.set(inventoryId, action);
    }

    if (action.type === "add-batch") {
      addBatchById.set(action.id, action);
      continue;
    }

    if (action.type === "update-inventory") {
      const inventoryId = String(action.payload.inventoryId || "").trim();
      if (!inventoryId) continue;
      updateInventoryById.set(inventoryId, action);
      continue;
    }
  }

  // If an inventory row was added and deleted before successful sync, cancel both actions.
  for (const inventoryId of Array.from(addInventoryById.keys())) {
    if (deleteInventoryById.has(inventoryId)) {
      addInventoryById.delete(inventoryId);
      deleteInventoryById.delete(inventoryId);
    }
  }

  return [
    ...createDrugById.values(),
    ...addInventoryById.values(),
    ...deleteInventoryById.values(),
    ...addBatchById.values(),
    ...updateInventoryById.values(),
  ].sort((a, b) => parseIsoDate(a.createdAt) - parseIsoDate(b.createdAt));
}

function getPendingSyncActions(): PendingSyncAction[] {
  const actions = store.get("pendingSyncActions");
  return normalizePendingSyncActions(Array.isArray(actions) ? actions : []);
}

function buildSyncHealthSnapshot(
  actions: PendingSyncAction[] = getPendingSyncActions(),
): SyncHealthSnapshot {
  const now = Date.now();
  const byType: Record<PendingSyncType, number> = {
    "create-drug": 0,
    "add-inventory": 0,
    "delete-inventory": 0,
    "add-batch": 0,
    "update-inventory": 0,
  };

  let failedCount = 0;
  let oldestTs = 0;
  let nextRetryTs = 0;
  let topErrorAction: PendingSyncAction | null = null;

  for (const action of actions) {
    if (!action || !action.type) continue;
    byType[action.type] += 1;

    if (action.attempts > 0 || action.lastError) {
      failedCount += 1;
    }

    const createdTs = parseIsoDate(action.createdAt);
    if (createdTs > 0 && (oldestTs === 0 || createdTs < oldestTs)) {
      oldestTs = createdTs;
    }

    const retryTs = parseIsoDate(action.nextRetryAt);
    if (retryTs > now && (nextRetryTs === 0 || retryTs < nextRetryTs)) {
      nextRetryTs = retryTs;
    }

    if (action.lastError) {
      if (!topErrorAction || action.attempts > topErrorAction.attempts) {
        topErrorAction = action;
      }
    }
  }

  return {
    syncMode: "auto",
    pendingCount: actions.length,
    failedCount,
    inProgress: pendingSyncInProgress,
    oldestPendingAt: oldestTs > 0 ? new Date(oldestTs).toISOString() : null,
    oldestPendingAgeSec:
      oldestTs > 0 ? Math.max(0, Math.floor((now - oldestTs) / 1000)) : 0,
    nextRetryAt: nextRetryTs > 0 ? new Date(nextRetryTs).toISOString() : null,
    nextRetryInSec:
      nextRetryTs > 0
        ? Math.max(0, Math.ceil((nextRetryTs - now) / 1000))
        : null,
    byType,
    topError: topErrorAction?.lastError || null,
    autoRetryIntervalSec: Math.floor(AUTO_RETRY_INTERVAL_MS / 1000),
    nextAutoRunAt: null,
    nextAutoRunInSec: null,
  };
}

function setPendingSyncActions(actions: PendingSyncAction[]) {
  const normalized = normalizePendingSyncActions(actions);
  store.set("pendingSyncActions", normalized);
  const count = normalized.length;
  const health = buildSyncHealthSnapshot(normalized);
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("pending-sync-count", count);
    window.webContents.send("sync-health-updated", health);
  });
}

function enqueuePendingSyncAction(
  type: PendingSyncType,
  payload: Record<string, unknown>,
) {
  const actions = getPendingSyncActions();
  actions.push({
    id: randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  setPendingSyncActions(actions);
}

async function executePendingSyncAction(
  action: PendingSyncAction,
): Promise<boolean> {
  switch (action.type) {
    case "create-drug":
      return await pushCreateDrugToCloud(
        action.payload as Parameters<typeof pushCreateDrugToCloud>[0],
        { actionId: action.id },
      );
    case "add-inventory":
      return await pushAddToInventoryToCloud(
        action.payload as Parameters<typeof pushAddToInventoryToCloud>[0],
        { actionId: action.id },
      );
    case "delete-inventory": {
      const inventoryId = String(action.payload.inventoryId || "");
      if (!inventoryId) return false;
      return await pushDeleteInventoryFromCloud(inventoryId, {
        actionId: action.id,
      });
    }
    case "add-batch":
      return await pushAddBatchToCloud(
        action.payload as Parameters<typeof pushAddBatchToCloud>[0],
        { actionId: action.id },
      );
    case "update-inventory":
      return await pushUpdateInventoryToCloud(
        action.payload as Parameters<typeof pushUpdateInventoryToCloud>[0],
        { actionId: action.id },
      );
    default:
      return false;
  }
}

async function processPendingSyncActions() {
  if (pendingSyncInProgress) {
    return {
      success: true,
      processed: 0,
      failed: 0,
      pending: getPendingSyncActions().length,
      health: buildSyncHealthSnapshot(),
    };
  }

  const snapshot = getPendingSyncActions();
  if (snapshot.length === 0) {
    return {
      success: true,
      processed: 0,
      failed: 0,
      pending: 0,
      health: buildSyncHealthSnapshot(snapshot),
    };
  }

  pendingSyncInProgress = true;
  let processed = 0;
  let failed = 0;
  const succeededIds = new Set<string>();
  const failedUpdates = new Map<string, PendingSyncAction>();

  try {
    for (const action of snapshot) {
      const nextRetryTs = parseIsoDate(action.nextRetryAt);
      if (nextRetryTs > Date.now()) {
        continue;
      }

      if (action.type === "delete-inventory" && action.attempts > 0) {
        const alreadySynced =
          await isDeleteInventoryLikelyAlreadySynced(action);
        if (alreadySynced) {
          console.log(
            "[SyncQueue] Dropping pending delete-inventory action because cloud snapshot no longer contains it.",
            action.payload,
          );
          processed += 1;
          succeededIds.add(action.id);
          continue;
        }
      }

      if (action.type === "add-inventory" && action.attempts > 0) {
        const alreadySynced = await isAddInventoryLikelyAlreadySynced(action);
        if (alreadySynced) {
          console.log(
            "[SyncQueue] Dropping pending add-inventory action because cloud stock already reflects it.",
            action.payload,
          );
          processed += 1;
          succeededIds.add(action.id);
          continue;
        }
      }

      try {
        const ok = await executePendingSyncAction(action);
        if (ok) {
          processed += 1;
          succeededIds.add(action.id);
        } else {
          if (action.type === "add-inventory") {
            const alreadySynced =
              await isAddInventoryLikelyAlreadySynced(action);
            if (alreadySynced) {
              console.log(
                "[SyncQueue] Add-inventory failed but cloud already has the stock. Marking as synced.",
                action.payload,
              );
              processed += 1;
              succeededIds.add(action.id);
              continue;
            }
          }
          if (action.type === "delete-inventory") {
            const alreadySynced =
              await isDeleteInventoryLikelyAlreadySynced(action);
            if (alreadySynced) {
              console.log(
                "[SyncQueue] Delete-inventory failed but cloud snapshot no longer contains it. Marking as synced.",
                action.payload,
              );
              processed += 1;
              succeededIds.add(action.id);
              continue;
            }
          }

          const nextAttempts = action.attempts + 1;
          if (
            action.type === "delete-inventory" &&
            nextAttempts >= MAX_PENDING_DELETE_ATTEMPTS
          ) {
            console.warn(
              `[SyncQueue] Dropping stale delete action after ${nextAttempts} failures`,
              action.payload,
            );
            succeededIds.add(action.id);
            continue;
          }

          failed += 1;
          failedUpdates.set(action.id, {
            ...action,
            attempts: nextAttempts,
            lastError: "sync_failed",
            nextRetryAt: computeNextRetryAt(nextAttempts),
          });
        }
      } catch (error) {
        if (action.type === "add-inventory") {
          const alreadySynced = await isAddInventoryLikelyAlreadySynced(action);
          if (alreadySynced) {
            console.log(
              "[SyncQueue] Add-inventory errored but cloud already has the stock. Marking as synced.",
              action.payload,
            );
            processed += 1;
            succeededIds.add(action.id);
            continue;
          }
        }
        if (action.type === "delete-inventory") {
          const alreadySynced =
            await isDeleteInventoryLikelyAlreadySynced(action);
          if (alreadySynced) {
            console.log(
              "[SyncQueue] Delete-inventory errored but cloud snapshot no longer contains it. Marking as synced.",
              action.payload,
            );
            processed += 1;
            succeededIds.add(action.id);
            continue;
          }
        }

        const nextAttempts = action.attempts + 1;

        // Route to Dead-Letter Queue if attempting 5+ times or specifically a Client Error (4xx) exception
        const isPermanentError =
          nextAttempts >= 5 ||
          (error instanceof Error && error.message.includes("Client Error 4"));

        if (isPermanentError) {
          console.error(
            `[SyncQueue] Route to DLQ. Action ${action.type}. Attempts: ${nextAttempts}. Error:`,
            error,
          );
          try {
            await prisma.syncFailure.create({
              data: {
                entityType: action.type.toUpperCase(),
                entityId: action.id,
                payload: JSON.stringify(action.payload),
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              },
            });
            // Drop it out of the background queue
            succeededIds.add(action.id);

            store.set("syncFailureFlag", Date.now());
            BrowserWindow.getAllWindows().forEach((win) => {
              win.webContents.send("sync-failure-recorded");
            });
          } catch (dlqErr) {
            console.error("[SyncQueue] Failed to save to DLQ:", dlqErr);
          }
          continue; // Skip setting retry counters since it's dropped
        }

        failed += 1;
        failedUpdates.set(action.id, {
          ...action,
          attempts: nextAttempts,
          lastError: error instanceof Error ? error.message : String(error),
          nextRetryAt: computeNextRetryAt(nextAttempts),
        });
      }
    }

    const latest = getPendingSyncActions()
      .filter((action) => !succeededIds.has(action.id))
      .map((action) => failedUpdates.get(action.id) ?? action);

    setPendingSyncActions(latest);
    const health = buildSyncHealthSnapshot(latest);
    return {
      success: failed === 0,
      processed,
      failed,
      pending: latest.length,
      health,
    };
  } finally {
    pendingSyncInProgress = false;
  }
}

// ── RS256 public key bundled at build time ────────────────────────────────────
// Replace the placeholder below with the real public key from the server's
// OFFLINE_TOKEN_PRIVATE_KEY env var pair before production builds.
const BUNDLED_PUBLIC_KEY =
  process.env.OFFLINE_TOKEN_PUBLIC_KEY ||
  `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtklHweWPqIA+Itu55Y/q
SCY70KxHv/8l3XXmqTqPX7+AB1ACwHpZtUBNa5/pVgtf56saXBX50/WTVgoHqHAp
FukgB0JrZgArXM4ldbKGADLACup87JYdh1lwOz2C6xFuttWTrg5EqE75bkyjecI4
RHfz4PW2uBFBX1OfIi3KWzPha1JvbJ71QpRsOrg61uXvT+/cEcIiYpeVEyum818j
weItQoh1BAtZeTxLDt0Hu9XjqMszkgHuDZH8L9mdQnU/WWzefw5KjJrpa+a4zqw5
cIUKx7KdK9yNKScvEx0VoPjKouXQMkY+V50pm58uxKfZHQxf7r95v57X01Kzq/7E
9QIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Checks the offline JWT on every startup and screen wake.
 * Sends subscription:locked IPC event to the renderer if enforcement is needed.
 */
async function checkOfflineSubscription(): Promise<void> {
  const rawToken = loadOfflineToken();
  if (!rawToken) {
    console.warn(
      "[OfflineToken] No token found — subscription check skipped (first run or token missing).",
    );
    return;
  }

  const payload = await verifyAndDecodeToken(rawToken, BUNDLED_PUBLIC_KEY);
  if (!payload) {
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send("subscription:locked", { reason: "invalid-token" }),
    );
    return;
  }

  const lastSeenAt = store.get("lastSeenAt")
    ? new Date(store.get("lastSeenAt") as string)
    : null;
  const state = evaluateSubscriptionState(payload, lastSeenAt);

  if (state !== "active") {
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send("subscription:locked", { reason: state, payload }),
    );
  }
}

app.whenReady().then(async () => {
  // Apply any missing schema changes before anything else touches the DB
  try {
    await runMigrations();
  } catch (e) {
    console.error('[DB Migration] Failed:', e);
  }

  createWindow();
  setPendingSyncActions(getPendingSyncActions());

  // Offline subscription check on startup (after window is ready)
  if (win) {
    win.webContents.once("did-finish-load", () => {
      void checkOfflineSubscription();
    });
  }

  // Re-check on screen wake (resume from sleep/hibernate)
  powerMonitor.on("resume", () => {
    void checkOfflineSubscription();
  });

  // Start Background Sync Service
  startSyncService();
  setTimeout(() => {
    void processPendingSyncActions();
  }, 7000);
  setInterval(() => {
    void processPendingSyncActions();
  }, AUTO_RETRY_INTERVAL_MS);

  // IPC Handlers
  ipcMain.handle("get-connection-status", () => {
    return getConnectionStatus();
  });

  // --- Theme preference (persisted in electron-store) ---
  ipcMain.handle("theme:get", () => store.get("theme", "system"));
  ipcMain.handle("theme:set", (_: unknown, val: string) => {
    store.set("theme", val);
  });

  // --- Hardware ID for License System ---
  ipcMain.handle("get-hardware-id", () => {
    return getDeviceIdentity();
  });

  // --- Save tenant context after successful license activation ---
  ipcMain.handle(
    "license:save-tenant-context",
    (
      _: unknown,
      context: {
        organizationId: string;
        organizationName: string;
        branchId: string;
        branchName: string;
      },
    ) => {
      store.set("organizationId", context.organizationId);
      store.set("organizationName", context.organizationName);
      store.set("branchId", context.branchId);
      console.log(
        `[License] Tenant context saved: org=${context.organizationName}, branch=${context.branchName}`,
      );
      return { success: true };
    },
  );

  // --- License Activation (main process → cloud, avoids CORS) ---
  ipcMain.handle(
    "license:activate",
    async (
      _: unknown,
      payload: { licenseKey: string; hardwareId: string; deviceName?: string },
    ) => {
      for (const base of getApiCandidates()) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const res = await fetch(`${base}/license/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          setApiBaseUrl(base);
          const data = await res.json();
          return { ok: res.ok, status: res.status, data };
        } catch {
          // try next candidate
        }
      }
      return { ok: false, status: 0, data: { error: "SERVER_UNREACHABLE" } };
    },
  );

  // --- License Verification (main process → cloud, avoids CORS) ---
  ipcMain.handle(
    "license:verify",
    async (_: unknown, payload: { licenseKey: string; hardwareId: string }) => {
      for (const base of getApiCandidates()) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const res = await fetch(`${base}/license/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          setApiBaseUrl(base);
          const data = await res.json();
          return { ok: res.ok, status: res.status, data };
        } catch {
          // try next candidate
        }
      }
      return { ok: false, status: 0, data: { error: "SERVER_UNREACHABLE" } };
    },
  );

  ipcMain.handle("get-company-settings", async () => {
    try {
      return await prisma.companySettings.findFirst();
    } catch (error) {
      console.error("Failed to fetch company settings:", error);
      return null;
    }
  });

  ipcMain.handle(
    "pos:check-interactions",
    async (_, scientificNames: string[]) => {
      if (!scientificNames || scientificNames.length < 2) return [];
      try {
        // Find any interaction where BOTH drugs are in the cart
        const interactions = await prisma.drugInteraction.findMany({
          where: {
            AND: [
              { drug1: { in: scientificNames } },
              { drug2: { in: scientificNames } },
            ],
          },
        });
        // Filter out self-matches just in case, though schema should prevent finding A-A
        return interactions;
      } catch (error) {
        console.error("Failed to check interactions:", error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "pos:check-allergies",
    async (
      _,
      {
        scientificNames,
        patientId,
      }: { scientificNames: string[]; patientId: string },
    ) => {
      if (!patientId || !scientificNames || scientificNames.length === 0)
        return [];
      try {
        const patient = await prisma.patient.findUnique({
          where: { id: patientId },
          select: { allergies: true },
        });
        if (!patient || !patient.allergies) return [];

        const patientAllergyList = patient.allergies
          .toLowerCase()
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);

        if (patientAllergyList.length === 0) return [];

        // Simple intersection: returns the scientific names that the patient is allergic to
        const triggeredAllergies = scientificNames.filter((name) =>
          patientAllergyList.some(
            (allergy) =>
              name.toLowerCase().includes(allergy) ||
              allergy.includes(name.toLowerCase()),
          ),
        );
        return triggeredAllergies;
      } catch (error) {
        console.error("Failed to check allergies:", error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "check-drug-interaction",
    async (
      _,
      {
        newDrugScientificName,
        currentCartScientificNames,
      }: {
        newDrugScientificName: string;
        currentCartScientificNames: string[];
      },
    ) => {
      try {
        if (
          !newDrugScientificName ||
          !currentCartScientificNames ||
          currentCartScientificNames.length === 0
        ) {
          return { found: false, interactions: [] };
        }

        const target = newDrugScientificName.trim();
        const existing = currentCartScientificNames
          .map((d) => d.trim())
          .filter((d) => d !== target && d.length > 0);

        if (existing.length === 0) {
          return { found: false, interactions: [] };
        }

        const interactions = await prisma.drugInteraction.findMany({
          where: {
            OR: [
              {
                drug1: target,
                drug2: { in: existing },
              },
              {
                drug2: target,
                drug1: { in: existing },
              },
            ],
          },
        });

        if (interactions.length > 0) {
          return {
            found: true,
            interactions: interactions.map((i: any) => ({
              drug1: i.drug1,
              drug2: i.drug2,
              severity: i.severity,
              description: i.description,
            })),
          };
        }

        return { found: false, interactions: [] };
      } catch (error) {
        console.error("Failed to check drug interactions:", error);
        return { found: false, interactions: [] };
      }
    },
  );

  // ... (imports)

  // ... inside createWindow or app.whenReady ...

  ipcMain.handle("get-users", async () => {
    return await prisma.user.findMany(); // Still useful for debugging or listing? Maybe remove password from return?
  });

  ipcMain.handle("login", async (_event, { email, password }) => {
    try {
      console.log("IPC Login Request for:", email);

      // 1. Try to authenticate with the Cloud API first (SSoT)
      try {
        let response: Response | null = null;

        for (const base of getApiCandidates()) {
          try {
            const res = await fetch(`${base}/verify-user`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
              setApiBaseUrl(base);
              response = res;
              break;
            }
          } catch {
            // try next candidate
          }
        }

        if (response?.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            const cloudUser = data.user;
            console.log(
              "Cloud Auth Success. Updating Local DB for:",
              cloudUser.email,
            );
            console.log("Cloud Branch ID:", cloudUser.branchId);

            // Ensure Branch exists locally to avoid FK constraint errors
            if (cloudUser.branchId) {
              const localBranch = await prisma.branch.findUnique({
                where: { id: cloudUser.branchId },
              });
              if (!localBranch) {
                console.log(
                  `Creating stub branch locally for ID: ${cloudUser.branchId}`,
                );
                await prisma.branch.create({
                  data: {
                    id: cloudUser.branchId,
                    name: "Synced Branch",
                  },
                });
              }
            }

            // Keep local user aligned with cloud IDs to avoid FK issues in sales.
            const localUser = await prisma.user.findUnique({
              where: { email: cloudUser.email },
            });

            if (localUser) {
              const updateData: any = {
                name: cloudUser.name,
                role: cloudUser.role,
                branchId: cloudUser.branchId,
              };

              if (localUser.id !== cloudUser.id) {
                console.log(
                  `Aligning local user ID ${localUser.id} -> ${cloudUser.id}`,
                );
                updateData.id = cloudUser.id;
              }

              await prisma.user.update({
                where: { id: localUser.id },
                data: updateData,
              });
            } else {
              await prisma.user.create({
                data: {
                  id: cloudUser.id,
                  email: cloudUser.email,
                  name: cloudUser.name,
                  password: bcrypt.hashSync(password, 10),
                  role: cloudUser.role,
                  branchId: cloudUser.branchId,
                },
              });
            }

            const syncedUser =
              (await prisma.user.findUnique({ where: { id: cloudUser.id } })) ??
              (await prisma.user.findUnique({
                where: { email: cloudUser.email },
              }));

            if (!syncedUser) {
              return { success: false, error: "Failed to sync user locally" };
            }

            const { password: _password, ...safeUser } = syncedUser;

            // Update Store
            if (safeUser.branchId) {
              store.set("branchId", safeUser.branchId);
              // Store sync token for headless desktop auth
              if (data.syncToken) {
                store.set("syncToken", data.syncToken);
                store.set("syncUserId", cloudUser.id);
                store.set("syncUserRole", cloudUser.role);
                store.set("syncOrgId", cloudUser.organizationId || "");
              }
              void processPendingSyncActions();
              // Trigger immediate sync and wait for it
              try {
                console.log("Waiting for immediate sync...");
                await syncProducts();
                console.log("Immediate sync completed.");
              } catch (err) {
                console.error("Immediate product sync failed:", err);
              }
            }

            return { success: true, user: safeUser };
          }
        } else {
          console.log(
            "Cloud Auth Failed or Offline. Falling back to Local DB.",
          );
        }
      } catch (netError) {
        console.error("Network Error during login (Offline Mode):", netError);
      }

      // 2. Fallback to Local DB
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user)
        return {
          success: false,
          error: "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯",
        };

      // Verify password
      const isMatch = bcrypt.compareSync(password, user.password);
      if (isMatch) {
        // Return user without password
        const { password, ...userWithoutPassword } = user;

        // Save branchId to store for sync use
        if (user.branchId) {
          console.log("Updating Store BranchID to:", user.branchId);
          store.set("branchId", user.branchId);
          void processPendingSyncActions();
        }

        return { success: true, user: userWithoutPassword };
      } else {
        return {
          success: false,
          error: "ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± طµط­ظٹط­ط©",
        };
      }
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        error: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„",
      };
    }
  });
});

// ==================== Shift Management ====================
ipcMain.handle("get-shift-status", async (_, { userId }) => {
  try {
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "OPEN" },
      include: { safe: true },
    });
    if (activeShift) {
      return {
        isWorking: true,
        startTime: activeShift.startTime,
        shiftId: activeShift.id,
        safeId: activeShift.safeId,
        safeName: activeShift.safe?.name,
      };
    }
    return { isWorking: false };
  } catch (error) {
    console.error("Failed to get shift status:", error);
    return { isWorking: false };
  }
});

ipcMain.handle("get-safes", async (_, { branchId }) => {
  try {
    return await prisma.safe.findMany({
      where: { branchId },
    });
  } catch (error) {
    console.error("Failed to get safes:", error);
    return [];
  }
});

ipcMain.handle(
  "clock-in",
  async (_, { userId, branchId, startingCash }) => {
    try {
      const activeShift = await prisma.shift.findFirst({
        where: { userId, status: "OPEN" },
      });

      if (activeShift) {
        return { success: false, message: "لديك وردية مفتوحة بالفعل" };
      }

      // Auto-get or create the default safe for this branch
      let defaultSafe = await prisma.safe.findFirst({
        where: { branchId, type: "CASH_DRAWER" },
        orderBy: { createdAt: "asc" },
      });

      if (!defaultSafe) {
        defaultSafe = await prisma.safe.create({
          data: {
            name: "الصندوق الرئيسي",
            type: "CASH_DRAWER",
            balance: 0,
            branchId,
          },
        });
      }

      await prisma.shift.create({
        data: {
          userId,
          branchId,
          safeId: defaultSafe.id,
          startingCash: startingCash || 0,
          expectedCash: startingCash || 0,
          startTime: new Date(),
          status: "OPEN",
        },
      });
      return { success: true };
    } catch (error: any) {
      console.error("Clock-in failed:", error);
      return { success: false, message: error.message };
    }
  },
);

ipcMain.handle("get-shift-summary", async (_, { userId }) => {
  try {
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "OPEN" },
      include: { safe: true },
    });

    if (!activeShift)
      return { success: false, message: "لا توجد وردية مفتوحة" };

    const shiftWhere = { userId, createdAt: { gte: activeShift.startTime } };

    // Fetch all sales during the shift with their payments
    const shiftSales = await prisma.sale.findMany({
      where: shiftWhere,
      include: { payment: true },
    });

    const cashSales = shiftSales.filter((s: any) => s.payment?.method !== 'CREDIT');
    const creditSales = shiftSales.filter((s: any) => s.payment?.method === 'CREDIT');

    const cashSalesTotal = cashSales.reduce((sum: number, s: any) => sum + s.total, 0);
    const creditSalesTotal = creditSales.reduce((sum: number, s: any) => sum + s.total, 0);
    const salesCount = shiftSales.length;
    const salesTotalAmount = cashSalesTotal + creditSalesTotal;

    // Calculate expected cash correctly:
    // startingCash + all IN transactions on this safe since shift start - all OUT transactions
    let expectedCash = activeShift.startingCash;
    if (activeShift.safeId) {
      const txns = await prisma.transaction.findMany({
        where: {
          safeId: activeShift.safeId,
          createdAt: { gte: activeShift.startTime },
        },
        select: { type: true, amount: true },
      });
      for (const t of txns) {
        if (t.type === "IN") expectedCash += t.amount;
        else expectedCash -= t.amount;
      }
    }

    return {
      success: true,
      summary: {
        startTime: activeShift.startTime,
        startingCash: activeShift.startingCash,
        expectedCash,
        salesCount,
        salesTotalAmount,
        cashSalesCount: cashSales.length,
        cashSalesTotal,
        creditSalesCount: creditSales.length,
        creditSalesTotal,
        safeName: activeShift.safe?.name,
      },
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle("clock-out", async (_, { userId, actualCash }) => {
  try {
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "OPEN" },
      include: { safe: true },
    });

    if (!activeShift) {
      return { success: false, message: "لا توجد وردية مفتوحة" };
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - activeShift.startTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    // Calculate expected cash: startingCash + IN transactions - OUT transactions since shift start
    let expectedCash = activeShift.startingCash;
    if (activeShift.safeId) {
      const txns = await prisma.transaction.findMany({
        where: {
          safeId: activeShift.safeId,
          createdAt: { gte: activeShift.startTime },
        },
        select: { type: true, amount: true },
      });
      for (const t of txns) {
        if (t.type === "IN") expectedCash += t.amount;
        else expectedCash -= t.amount;
      }
    }

    await prisma.shift.update({
      where: { id: activeShift.id },
      data: {
        endTime,
        status: "CLOSED",
        duration: durationHours,
        expectedCash,
        actualCash,
        // @ts-ignore
        synced: false, // Re-queue for sync so cloud gets the closed state
      },
    });

    // Trigger immediate sync so the closed shift reaches the cloud right away
    void syncShifts();
    void syncTransactions();

    return { success: true };
  } catch (error: any) {
    console.error("Clock-out failed:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle(
  "process-cash-drop",
  async (_, { userId, amount, type, note }) => {
    try {
      const activeShift = await prisma.shift.findFirst({
        where: { userId, status: "OPEN" },
        // @ts-ignore
        include: { safe: true },
      });

      // @ts-ignore
      if (!activeShift || !activeShift.safeId) {
        return { success: false, message: "لا توجد وردية مفتوحة بصندوق مخصص" };
      }

      // @ts-ignore
      const safeId = activeShift.safeId;
      // @ts-ignore
      const previousBalance = activeShift.safe ? activeShift.safe.balance : 0;
      const newBalance =
        type === "IN" ? previousBalance + amount : previousBalance - amount;

      await prisma.$transaction([
        // @ts-ignore
        prisma.transaction.create({
          data: {
            safeId,
            type,
            amount,
            referenceType: "SHIFT_CASH_DROP",
            description:
              note ||
              (type === "IN" ? "إيداع نقدي في الوردية" : "سحب نقدي من الوردية"),
          },
        }),
        // @ts-ignore
        prisma.safe.update({
          where: { id: safeId },
          data: { balance: newBalance },
        }),
      ]);

      return { success: true };
    } catch (error: any) {
      console.error("Cash drop failed:", error);
      return { success: false, message: error.message };
    }
  },
);

// Allow Renderer to force-update branch ID (e.g. from Session)
ipcMain.handle("set-branch-id", (_, branchId) => {
  if (branchId) {
    console.log("Manual Sync: Setting BranchID to:", branchId);
    store.set("branchId", branchId);
    void processPendingSyncActions();
    return true;
  }
  return false;
});

// Allow Renderer to trigger sync immediately
ipcMain.handle("trigger-sync", async () => {
  console.log("Manual Sync Triggered from Renderer");
  try {
    await syncSales();
    await syncProducts();
    void processPendingSyncActions();
    return { success: true };
  } catch (error: any) {
    console.error("trigger-sync failed:", error);
    return { success: false, error: error.message || String(error) };
  }
});

// Sync debts (debt payments) on demand from DebtsPage
ipcMain.handle("sync-debts", async () => {
  try {
    await syncDebtPayments();
    return { success: true };
  } catch (error: any) {
    console.error("sync-debts failed:", error);
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle("get-products", async (_, arg: any) => {
  try {
    let searchTerm = "";
    let branchId = "";

    if (typeof arg === "string") {
      searchTerm = arg;
      // If string was passed, we try to get branchId from store as fallback
      branchId = String(store.get("branchId") || "");
    } else if (typeof arg === "object" && arg !== null) {
      searchTerm = arg.searchTerm || "";
      branchId = arg.branchId || "";
    }

    // Fallback for branchId if not in arg
    if (!branchId) {
      branchId = String(store.get("branchId") || "");
    }

    const effectiveBranchId = branchId;

    // Use 'term' for consistency with existing logic if needed, or just searchTerm
    const term = searchTerm;

    const whereClause: any = {
      AND: [
        { isActive: true },
        term
          ? {
              OR: [
                { tradeName: { contains: term } },
                { scientificName: { contains: term } },
                { barcode: { contains: term } },
              ],
            }
          : {},
      ],
    };

    const products = await prisma.globalDrug.findMany({
      where: whereClause,
      include: {
        inventory: {
          where: effectiveBranchId
            ? { branchId: String(effectiveBranchId) }
            : {},
          include: {
            batches: {
              where: { quantity: { gt: 0 } },
              orderBy: { expiryDate: "asc" },
              // take: 1 // Don't limit here if we want to find the absolute nearest across multiple batches?
              // Actually take: 1 is per inventory item, which is fine if we only listed batches.
            },
          },
        },
      },
      // take: 50 // REMOVED LIMIT
    });

    return products.map((p) => {
      const totalStock = p.inventory.reduce(
        (acc, inv) => acc + inv.quantity,
        0,
      );
      const costPrice = p.inventory[0]?.costPrice || 0;

      // Find nearest expiry across all inventory batches (filtered by branch above)
      const nearestBatch = p.inventory
        .flatMap((inv) => inv.batches)
        .sort(
          (a, b) =>
            new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
        )[0];

      return {
        id: p.id,
        name: p.tradeName,
        scientificName: p.scientificName || "",
        origin: p.origin || "",
        price: p.price,
        costPrice,
        barcode: p.barcode,
        stock: totalStock,
        nearestExpiry: nearestBatch?.expiryDate || null,
        isQuickSale: p.isQuickSale ?? false,
      };
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
});

ipcMain.handle("toggle-quick-sale", async (_, { drugId, isQuickSale }: { drugId: string; isQuickSale: boolean }) => {
  try {
    await prisma.globalDrug.update({
      where: { id: drugId },
      data: { isQuickSale },
    });
    // Push to cloud in background (fire-and-forget — local is source of truth)
    pushQuickSaleToggle(drugId, isQuickSale).catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error("toggle-quick-sale failed:", error);
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle("get-quick-sale-products", async (_, { branchId }: { branchId: string }) => {
  try {
    const drugs = await prisma.globalDrug.findMany({
      where: { isQuickSale: true, isActive: true },
      include: {
        inventory: {
          where: branchId ? { branchId } : {},
          include: {
            batches: {
              where: { quantity: { gt: 0 } },
              orderBy: { expiryDate: "asc" },
            },
          },
        },
        saleItems: {
          select: { quantity: true },
        },
      },
    });

    return drugs
      .map((p) => {
        const inv = p.inventory[0];
        const stock = inv ? inv.batches.reduce((s, b) => s + b.quantity, 0) : 0;
        const totalSold = p.saleItems.reduce((s, si) => s + si.quantity, 0);
        return {
          id: p.id,
          name: p.tradeName,
          barcode: p.barcode,
          price: inv ? p.price : 0,
          stock,
          totalSold,
        };
      })
      .sort((a, b) => b.totalSold - a.totalSold);
  } catch (error: any) {
    console.error("get-quick-sale-products failed:", error);
    return [];
  }
});

ipcMain.handle("sync-inventory", async () => {
  try {
    await syncProducts();
    return { success: true };
  } catch (error: any) {
    console.error("Manual sync failed:", error);
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle("get-pending-sync-count", () => {
  return { count: getPendingSyncActions().length };
});

ipcMain.handle("get-sync-health", () => {
  return buildSyncHealthSnapshot();
});

ipcMain.handle("sync-pending-inventory", async () => {
  return await processPendingSyncActions();
});

// ===== Dashboard Stats =====
ipcMain.handle("get-today-sales", async (_, userId?: string) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereClause: any = {
      createdAt: { gte: today },
    };
    if (userId) {
      whereClause.userId = userId;
    }

    const sales = await prisma.sale.findMany({
      where: whereClause,
      include: {
        items: true,
        payment: true,
        returns: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const total = sales.reduce(
      (sum: number, s: any) => sum + (s.total || 0),
      0,
    );
    const items = sales.reduce(
      (sum: number, s: any) => sum + (s.items?.length || 0),
      0,
    );

    return {
      sales: sales.slice(0, 5).map((s: any) => ({
        id: s.id,
        total: s.total,
        createdAt: s.createdAt,
        paymentMethod: s.payment?.method || "CASH",
        itemCount: s.items?.length || 0,
        returnsTotal:
          s.returns?.reduce((sum: number, r: any) => sum + (r.total || 0), 0) ||
          0,
      })),
      total,
      count: sales.length,
      items,
    };
  } catch (error) {
    console.error("Error fetching today sales:", error);
    return { sales: [], total: 0, count: 0, items: 0 };
  }
});

ipcMain.handle("get-inventory-items", async (_, { searchTerm, user }) => {
  try {
    const effectiveBranchId = String(
      user?.branchId || store.get("branchId") || "",
    ).trim();
    if (!effectiveBranchId) {
      console.warn(
        "[Inventory] Branch ID is missing. Returning empty inventory list.",
      );
      return [];
    }

    const whereClause: any = {
      AND: [],
    };

    // Always hide inactive drugs (deleted/disabled from cloud)
    whereClause.AND.push({
      drug: {
        isActive: true,
      },
    });

    // Always scope desktop inventory to the active branch on this device.
    whereClause.AND.push({ branchId: effectiveBranchId });

    // 2. Search filtering
    if (searchTerm) {
      whereClause.AND.push({
        drug: {
          OR: [
            { tradeName: { contains: searchTerm } },
            { scientificName: { contains: searchTerm } },
            { barcode: { contains: searchTerm } },
          ],
        },
      });
    }

    const inventory = await prisma.inventory.findMany({
      where: whereClause,
      include: {
        drug: true,
        batches: true,
      },
    });
    return inventory;
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    return [];
  }
});

ipcMain.handle("check-barcode-local", async (_, { barcode, branchId }) => {
  try {
    if (!barcode) return { exists: false };

    const drug = await prisma.globalDrug.findUnique({
      where: { barcode },
    });

    if (!drug || !drug.isActive) {
      return { exists: false };
    }
    const inventory = await prisma.inventory.findFirst({
      where: {
        drugId: drug.id,
        branchId: branchId,
      },
      include: {
        drug: true,
      },
    });

    return {
      exists: true,
      drug,
      inventory,
    };
  } catch (error) {
    console.error("Error checking barcode locally:", error);
    return { exists: false, error: String(error) };
  }
});

ipcMain.handle("create-global-drug-local", async (_, data) => {
  try {
    const parsedPrice = parseFloat(data.price) || 0;
    const parsedCost = parseFloat(data.costPrice) || 0;
    const parsedMinStock = parseInt(data.minStock, 10) || 10;
    const parsedMaxStock = parseInt(data.maxStock, 10) || 100;
    const parsedQuantity = data.quantity ? parseInt(data.quantity, 10) : 0;

    const drug = await prisma.globalDrug.create({
      data: {
        id: randomUUID(),
        tradeName: data.tradeName,
        scientificName: data.scientificName,
        barcode: data.barcode,
        origin: data.origin || "",
        price: parsedPrice,
        isActive: true,
      },
    });

    const branchId = String(store.get("branchId") || "");
    if (branchId) {
      enqueuePendingSyncAction("create-drug", {
        id: drug.id,
        barcode: data.barcode,
        tradeName: data.tradeName,
        scientificName: data.scientificName,
        origin: data.origin,
        price: parsedPrice,
        cost: parsedCost,
        minStock: parsedMinStock,
        maxStock: parsedMaxStock,
        branchId,
        quantity: parsedQuantity,
        expiryDate: data.expiryDate,
      });
      void processPendingSyncActions();
    }

    return {
      success: true,
      drug,
      pendingSyncCount: getPendingSyncActions().length,
    };
  } catch (error) {
    console.error("Error creating global drug locally:", error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(
  "add-to-inventory-local",
  async (
    _,
    {
      drugId,
      branchId,
      costPrice,
      price,
      minStock,
      maxStock,
      quantity,
      expiryDate,
      supplierId,
      skipCloudPush,
    },
  ) => {
    try {
      const parsedQuantity = parseInt(quantity, 10) || 0;
      const parsedCost = parseFloat(costPrice) || 0;
      const parsedPrice = parseFloat(price) || 0;
      const parsedMinStock = parseInt(minStock, 10) || 10;
      const parsedMaxStock = parseInt(maxStock, 10) || 100;
      const shouldSkipCloudPush = Boolean(skipCloudPush);

      const inventory = await prisma.inventory.create({
        data: {
          drugId,
          branchId,
          quantity: parsedQuantity,
          costPrice: parsedCost,
          minStock: parsedMinStock,
          maxStock: parsedMaxStock,
        },
      });

      if (parsedQuantity > 0) {
        await prisma.batch.create({
          data: {
            inventoryId: inventory.id,
            quantity: parsedQuantity,
            costPrice: parsedCost,
            batchNumber: "INIT-" + new Date().getTime().toString().slice(-6),
            expiryDate: expiryDate
              ? new Date(expiryDate)
              : new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            supplierId: supplierId || null,
          },
        });
      }

      const effectiveBranchId = String(branchId || store.get("branchId") || "");
      if (effectiveBranchId && !shouldSkipCloudPush) {
        enqueuePendingSyncAction("add-inventory", {
          id: inventory.id,
          drugId,
          branchId: effectiveBranchId,
          costPrice: parsedCost,
          price: parsedPrice,
          quantity: parsedQuantity,
          minStock: parsedMinStock,
          maxStock: parsedMaxStock,
          expiryDate,
        });
        void processPendingSyncActions();
      }

      return {
        success: true,
        inventory,
        pendingSyncCount: getPendingSyncActions().length,
      };
    } catch (error) {
      console.error("Error adding to inventory locally:", error);
      return { success: false, error: String(error) };
    }
  },
);

ipcMain.handle("update-inventory-item", async (_, data) => {
  const { id, drugId, price, costPrice, minStock, maxStock } = data;
  try {
    console.log("!!! IPC: update-inventory-item received:", data);

    const updPrice = parseFloat(price);
    const updCost = parseFloat(costPrice);
    const updMin = parseInt(minStock, 10);
    const updMax = parseInt(maxStock, 10);

    // 1. Update GlobalDrug price
    const updatedDrug = await prisma.globalDrug.update({
      where: { id: drugId },
      data: { price: isNaN(updPrice) ? 0 : updPrice },
    });
    console.log(
      "!!! DB: Updated GlobalDrug:",
      updatedDrug.id,
      "Price:",
      updatedDrug.price,
    );

    // 2. Update Inventory item
    const updatedInventory = await prisma.inventory.update({
      where: { id },
      data: {
        costPrice: isNaN(updCost) ? 0 : updCost,
        minStock: isNaN(updMin) ? 10 : updMin,
        maxStock: isNaN(updMax) ? 100 : updMax,
      },
    });
    console.log(
      "!!! DB: Updated Inventory:",
      updatedInventory.id,
      "CostPrice:",
      updatedInventory.costPrice,
    );

    // 3. Push update to cloud
    const branchId =
      updatedInventory.branchId || String(store.get("branchId") || "");
    enqueuePendingSyncAction("update-inventory", {
      inventoryId: id,
      drugId,
      branchId,
      price: isNaN(updPrice) ? 0 : updPrice,
      costPrice: isNaN(updCost) ? 0 : updCost,
      minStock: isNaN(updMin) ? 10 : updMin,
      maxStock: isNaN(updMax) ? 100 : updMax,
    });
    void processPendingSyncActions();

    return { success: true, pendingSyncCount: getPendingSyncActions().length };
  } catch (error) {
    console.error("!!! IPC Error updating inventory item:", error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("delete-inventory-item", async (_, id) => {
  try {
    const existingInventory = await prisma.inventory.findUnique({
      where: { id: String(id) },
      select: { id: true, branchId: true, drugId: true },
    });

    if (!existingInventory) {
      return {
        success: true,
        pendingSyncCount: getPendingSyncActions().length,
      };
    }

    // Also delete batches associated with this inventory
    await prisma.batch.deleteMany({
      where: { inventoryId: existingInventory.id },
    });
    await prisma.inventory.delete({ where: { id: existingInventory.id } });

    enqueuePendingSyncAction("delete-inventory", {
      inventoryId: existingInventory.id,
      drugId: existingInventory.drugId,
      branchId:
        existingInventory.branchId || String(store.get("branchId") || ""),
    });
    void processPendingSyncActions();

    return { success: true, pendingSyncCount: getPendingSyncActions().length };
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    return { success: false, error: "Failed to delete item" };
  }
});

ipcMain.handle(
  "add-inventory-batch",
  async (
    _event,
    { inventoryId, quantity, costPrice, expiryDate, supplierId },
  ) => {
    try {
      const qty = parseInt(quantity, 10);
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const batchNumber = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      await prisma.$transaction([
        prisma.batch.create({
          data: {
            inventoryId,
            batchNumber,
            quantity: qty,
            costPrice: parseFloat(costPrice) || 0,
            expiryDate: new Date(expiryDate),
            supplierId: supplierId || null,
          },
        }),
        prisma.inventory.update({
          where: { id: inventoryId },
          data: { quantity: { increment: qty } },
        }),
      ]);

      // Push batch to cloud
      const inventory = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { id: true, drugId: true, branchId: true },
      });
      if (inventory) {
        enqueuePendingSyncAction("add-batch", {
          inventoryId: inventory.id,
          batchNumber,
          quantity: qty,
          costPrice: parseFloat(costPrice) || 0,
          expiryDate: new Date(expiryDate).toISOString(),
          drugId: inventory.drugId,
          branchId: inventory.branchId || String(store.get("branchId") || ""),
          supplierId: supplierId || null,
        });
        void processPendingSyncActions();
      }

      return {
        success: true,
        pendingSyncCount: getPendingSyncActions().length,
      };
    } catch (error) {
      console.error("Error adding batch:", error);
      return { success: false, error: "Failed to add batch" };
    }
  },
);

ipcMain.handle("get-local-suppliers", async () => {
  try {
    return await prisma.supplier.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Error fetching local suppliers:", error);
    return [];
  }
});

ipcMain.handle("get-settings", async () => {
  try {
    return await prisma.companySettings.findFirst();
  } catch (error) {
    console.error("Failed to fetch settings", error);
    return null;
  }
});

// ===== IPC Handlers ظ„ظ„ظ…ط±ط¶ظ‰ =====

ipcMain.handle(
  "get-patients",
  async (_event, { branchId }: { branchId?: string } = {}) => {
    const where: any = {};
    if (branchId) {
      where.OR = [{ branchId }, { branchId: null }];
    }
    return await prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { loyaltyAccount: true },
    });
  },
);

ipcMain.handle(
  "search-patients",
  async (_event, query: string, branchId?: string) => {
    const where: any = {
      AND: [
        {
          OR: [{ name: { contains: query } }, { phone: { contains: query } }],
        },
      ],
    };
    if (branchId) {
      where.AND.push({ OR: [{ branchId }, { branchId: null }] });
    }
    return await prisma.patient.findMany({
      where,
      take: 10,
      include: { loyaltyAccount: true },
    });
  },
);

ipcMain.handle("create-patient", async (_event, data) => {
  try {
    const patient = await prisma.patient.create({
      data: {
        name: data.name,
        phone: data.phone,
        gender: data.gender,
        allergies: "",
        chronicDiseases: "",
        branchId: data.branchId || null,
      },
      include: { loyaltyAccount: true },
    });
    // Auto-create loyalty account if enabled
    const settings = await prisma.companySettings.findFirst();
    if (settings?.loyaltyEnabled) {
      await prisma.loyaltyAccount.create({
        data: {
          patientId: patient.id,
          totalPoints: 0,
          lifetimePoints: 0,
          tier: "BRONZE",
        },
      });
    }

    // Sync to cloud immediately
    pushPatient(patient).catch((err) =>
      console.error("Failed to push patient to cloud:", err),
    );

    // Re-fetch to include loyalty
    const updated = await prisma.patient.findUnique({
      where: { id: patient.id },
      include: { loyaltyAccount: true },
    });
    return { success: true, patient: updated };
  } catch (error) {
    console.error("Failed to create patient:", error);
    return {
      success: false,
      error:
        "ظپط´ظ„ ط¥ظ†ط´ط§ط، ظ…ظ„ظپ ط§ظ„ظ…ط±ظٹط¶ (ظ‚ط¯ ظٹظƒظˆظ† ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ ظ…ظƒط±ط±)",
    };
  }
});

// ===== ظ†ظ‡ط§ظٹط© IPC ط§ظ„ظ…ط±ط¶ظ‰ =====

ipcMain.handle(
  "process-sale",
  async (
    _event,
    {
      items,
      total,
      userId,
      patientId,
      discount,
      pointsRedeemed,
      paymentMethod,
    },
  ) => {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const validUser = userId
          ? await tx.user.findUnique({ where: { id: userId } })
          : null;
        const validPatient = patientId
          ? await tx.patient.findUnique({ where: { id: patientId } })
          : null;

        // For credit sales, patient is required
        const isCredit = paymentMethod === "CREDIT";
        if (isCredit && !validPatient) {
          throw new Error("ظٹط¬ط¨ طھط­ط¯ظٹط¯ ط¹ظ…ظٹظ„ ظ„ظ„ط¨ظٹط¹ ط¨ط§ظ„ط¢ط¬ظ„");
        }

        const incomingItems: any[] = Array.isArray(items) ? items : [];
        const requestedDrugIds: string[] = Array.from(
          new Set(incomingItems.map((item) => String(item.id))),
        );
        const existingDrugs: Array<{ id: string }> =
          requestedDrugIds.length > 0
            ? await tx.globalDrug.findMany({
                where: { id: { in: requestedDrugIds } },
                select: { id: true },
              })
            : [];
        const validDrugIds = new Set<string>(existingDrugs.map((d) => d.id));
        const validItems = incomingItems.filter(
          (item: any) =>
            validDrugIds.has(String(item.id)) &&
            Number(item.quantity) > 0 &&
            Number(item.price) >= 0,
        );

        if (validItems.length === 0) {
          throw new Error("No valid items to process");
        }

        const saleItemsData = [];

        // FEFO (First-Expired, First-Out) inventory deduction & Cost Calculation
        for (const item of validItems) {
          let itemTotalCost = 0;
          let remainingToDeduct = item.quantity;

          const inventory = await tx.inventory.findFirst({
            where: { drugId: String(item.id) },
            include: {
              batches: {
                orderBy: { expiryDate: "asc" },
                where: { quantity: { gt: 0 } },
              },
            },
          });

          if (inventory) {
            // Validate sufficient stock before deducting
            const totalAvailable = inventory.batches.reduce(
              (sum: number, b: any) => sum + b.quantity,
              0,
            );
            if (item.quantity > totalAvailable) {
              throw new Error(
                `الكمية المطلوبة (${item.quantity}) تتجاوز المخزون المتوفر (${totalAvailable}) للدواء`,
              );
            }

            // Decrement total inventory quantity
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { quantity: { decrement: item.quantity } },
            });

            // Deduct from batches in FEFO order (earliest expiry first)
            if (inventory.batches && inventory.batches.length > 0) {
              for (const batch of inventory.batches) {
                if (remainingToDeduct <= 0) break;
                const deduction = Math.min(batch.quantity, remainingToDeduct);
                itemTotalCost += deduction * batch.costPrice;

                if (deduction > 0) {
                  await tx.batch.update({
                    where: { id: batch.id },
                    data: { quantity: { decrement: deduction } },
                  });
                  remainingToDeduct -= deduction;
                }
              }
            }

            // Fallback cost if batches insufficient
            if (remainingToDeduct > 0 && inventory.costPrice) {
              itemTotalCost += remainingToDeduct * inventory.costPrice;
            }
          }

          const unitCost =
            item.quantity > 0 ? itemTotalCost / item.quantity : 0;

          saleItemsData.push({
            drugId: String(item.id),
            quantity: item.quantity,
            price: Number(item.price),
            cost: unitCost,
          });
        }

        // Generate a unique 8-digit invoice number
        const invoiceNumber = Math.floor(10000000 + Math.random() * 90000000).toString();

        const sale = await tx.sale.create({
          data: {
            total,
            invoiceNumber,
            discount: discount || 0,
            userId: validUser?.id ?? null,
            patientId: validPatient?.id ?? null,
            synced: false,
            payment: {
              create: {
                amount: total,
                method: paymentMethod || "CASH",
                status: isCredit ? "PENDING" : "COMPLETED",
              },
            },
            items: {
              create: saleItemsData,
            },
          },
        });

        // If Cash sale, update Safe and create Safe Transaction
        if (!isCredit && paymentMethod === "CASH" && validUser?.id) {
          const activeShift = await tx.shift.findFirst({
            where: { userId: validUser.id, status: "OPEN" },
          });

          if (activeShift && activeShift.safeId) {
            await tx.transaction.create({
              data: {
                safeId: activeShift.safeId,
                type: "IN",
                amount: total,
                referenceType: "SALE",
                description: `مبيعات نقدية فاتورة #${sale.id.slice(0, 8)}`,
              },
            });

            await tx.safe.update({
              where: { id: activeShift.safeId },
              data: { balance: { increment: total } },
            });
          }
        }

        // Update patient local debt if credit
        if (isCredit && validPatient) {
          await tx.patient.update({
            where: { id: validPatient.id },
            data: {
              balance: { increment: total },
            },
          });
        }

        // Loyalty System Logic
        const settings = await tx.companySettings.findFirst();

        // 1. Handle Redemption (Debit)
        if (settings?.loyaltyEnabled && validPatient && pointsRedeemed > 0) {
          const loyaltyAccount = await tx.loyaltyAccount.findUnique({
            where: { patientId: validPatient.id },
          });

          if (loyaltyAccount) {
            if (loyaltyAccount.totalPoints >= pointsRedeemed) {
              await tx.loyaltyAccount.update({
                where: { id: loyaltyAccount.id },
                data: {
                  totalPoints: { decrement: pointsRedeemed },
                },
              });

              await tx.loyaltyTransaction.create({
                data: {
                  accountId: loyaltyAccount.id,
                  type: "REDEEM",
                  points: pointsRedeemed,
                  saleId: sale.id,
                  description: `ط§ط³طھط¨ط¯ط§ظ„ ${pointsRedeemed} ظ†ظ‚ط·ط© ظ…ظ‚ط§ط¨ظ„ ط®طµظ…`,
                },
              });
            } else {
              console.warn("ATTEMPT TO REDEEM MORE POINTS THAN AVAILABLE");
            }
          }
        }

        // 2. Handle Earning (Credit) - Based on PAID amount (total)
        // Don't earn loyalty for credit sales (they haven't paid yet)
        if (
          settings?.loyaltyEnabled &&
          validPatient &&
          total > 0 &&
          !isCredit
        ) {
          const pointsPerDinar = settings.loyaltyPointsPerDinar || 0.01;
          const pointsEarned = Math.floor(total * pointsPerDinar);

          if (pointsEarned > 0) {
            let loyaltyAccount = await tx.loyaltyAccount.findUnique({
              where: { patientId: validPatient.id },
            });

            if (!loyaltyAccount) {
              loyaltyAccount = await tx.loyaltyAccount.create({
                data: { patientId: validPatient.id },
              });
            }

            const newLifetime = loyaltyAccount.lifetimePoints + pointsEarned;
            const newTotal = loyaltyAccount.totalPoints + pointsEarned;
            let newTier = "BRONZE";
            if (newLifetime >= 20000) newTier = "GOLD";
            else if (newLifetime >= 5000) newTier = "SILVER";

            await tx.loyaltyAccount.update({
              where: { id: loyaltyAccount.id },
              data: {
                totalPoints: newTotal,
                lifetimePoints: newLifetime,
                tier: newTier,
              },
            });

            await tx.loyaltyTransaction.create({
              data: {
                accountId: loyaltyAccount.id,
                type: "EARN",
                points: pointsEarned,
                saleId: sale.id,
                description: "ظ†ظ‚ط§ط· ظ…ظƒطھط³ط¨ط© ظ…ظ† ط¹ظ…ظ„ظٹط© ط´ط±ط§ط،",
              },
            });
          }
        }

        return { success: true, saleId: sale.id, invoiceNumber: sale.invoiceNumber, isCredit };
      });

      // Trigger sync immediately after success
      if (result.success) {
        syncSales().catch((err) =>
          console.error("Immediate sync failed:", err),
        );
      }

      return result;
    } catch (error) {
      console.error("Sale processing error:", error);
      return { success: false, error: "Transaction failed" };
    }
  },
);

ipcMain.handle("seed-products", async () => {
  const count = await prisma.globalDrug.count();
  if (count === 0) {
    const drug1 = await prisma.globalDrug.create({
      data: {
        id: "1",
        barcode: "111",
        tradeName: "Panadol Extra",
        scientificName: "Paracetamol",
        price: 15.0,
      },
    });
    await prisma.inventory.create({
      data: { drugId: drug1.id, quantity: 100 },
    });

    const drug2 = await prisma.globalDrug.create({
      data: {
        id: "2",
        barcode: "222",
        tradeName: "Cataflam",
        scientificName: "Diclofenac",
        price: 25.0,
      },
    });
    await prisma.inventory.create({
      data: { drugId: drug2.id, quantity: 50 },
    });

    return "Seeded";
  }
  return "Already seeded";
});

// ===== IPC Handlers Zain Cash =====

ipcMain.handle(
  "initiate-zain-cash-payment",
  async (_event, { amount, saleId }) => {
    try {
      const transactionData = {
        amount: amount,
        serviceType: "pharmacy_payment",
        msisdn: ZAINCASH_MERCHANT_ID,
        orderId: saleId,
        redirectUrl: `${ZAINCASH_BASE_URL}/transaction/pay?id=`, // Not used for redirection in Desktop, but required payload
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = generateZainCashToken(transactionData);

      const response = await fetch(`${ZAINCASH_BASE_URL}/transaction/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          merchantId: ZAINCASH_MERCHANT_ID,
          lang: "ar",
        }),
      });

      const result = await response.json();

      if (result.err) {
        return {
          success: false,
          error:
            result.err.msg || "ظپط´ظ„ ظپظٹ ط¥ظ†ط´ط§ط، ظ…ط¹ط§ظ…ظ„ط© Zain Cash",
        };
      }

      const redirectUrl = `${ZAINCASH_BASE_URL}/transaction/pay?id=${result.id}`;
      return { success: true, transactionId: result.id, redirectUrl };
    } catch (error: any) {
      console.error("Zain Cash Init Error:", error);
      return { success: false, error: error.message };
    }
  },
);

ipcMain.handle("check-zain-cash-status", async (_event, { transactionId }) => {
  try {
    const payload = {
      id: transactionId,
      msisdn: ZAINCASH_MERCHANT_ID,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = generateZainCashToken(payload);

    const response = await fetch(`${ZAINCASH_BASE_URL}/transaction/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        merchantId: ZAINCASH_MERCHANT_ID,
      }),
    });

    const result = await response.json();

    if (result.err) {
      return { success: false, error: result.err.msg };
    }

    // result.status: "success", "pending", "failed"
    return { success: true, status: result.status, amount: result.amount };
  } catch (error: any) {
    console.error("Zain Cash Check Error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-external-url", async (_event, url) => {
  await shell.openExternal(url);
  return true;
});

// ===== ظ†ظ‡ط§ظٹط© IPC Zain Cash =====

// ===== IPC Handlers ظ„ظ„ظ†ط³ط® ط§ظ„ط§ط­طھظٹط§ط·ظٹ =====

// ط¥ظ†ط´ط§ط، ظ†ط³ط®ط© ط§ط­طھظٹط§ط·ظٹط©
ipcMain.handle("create-backup", async () => {
  const result = await createBackup();
  if (result.success && result.path) {
    return {
      success: true,
      message: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ†ط³ط®ط© ط§ظ„ط§ط­طھظٹط§ط·ظٹط© ط¨ظ†ط¬ط§ط­",
      path: result.path,
    };
  }
  return { success: false, error: result.error };
});

// ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ظ‚ط§ط¦ظ…ط© ط§ظ„ظ†ط³ط® ط§ظ„ط§ط­طھظٹط§ط·ظٹط©
ipcMain.handle("get-backups", async () => {
  return getBackupList();
});

// ط§ط³طھط¹ط§ط¯ط© ظ†ط³ط®ط© ط§ط­طھظٹط§ط·ظٹط©
ipcMain.handle("restore-backup", async (_event, backupPath) => {
  const result = await restoreBackup(backupPath);
  return result;
});

// ظپطھط­ ظ…ط¬ظ„ط¯ ط§ظ„ظ†ط³ط® ط§ظ„ط§ط­طھظٹط§ط·ظٹط©
ipcMain.handle("open-backup-folder", async () => {
  const backups = getBackupList();
  if (backups.length > 0) {
    const folderPath = path.dirname(backups[0].path);
    shell.openPath(folderPath);
    return true;
  }
  return false;
});

// ===== IPC Handlers for Offline Debt Dashboard =====

// 1. Get Debtors List
ipcMain.handle("get-debtors", async (_event, { branchId, term }) => {
  try {
    const whereClause: any = {
      balance: { gt: 0 },
    };

    if (branchId) {
      whereClause.branchId = branchId;
    }

    if (term) {
      whereClause.OR = [
        { name: { contains: term } },
        { phone: { contains: term } },
      ];
    }

    const debtors = await prisma.patient.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return debtors;
  } catch (error) {
    console.error("Failed to fetch debtors:", error);
    return [];
  }
});

// 2. Get Debtor Details (Ledger)
ipcMain.handle("get-debtor-details", async (_event, patientId) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) throw new Error("Patient not found");

    // Get Credit Sales (Unpaid or partially paid) or just history
    const creditSales = await prisma.sale.findMany({
      where: {
        patientId: patientId,
        OR: [
          { payment: null }, // Credit sale might not have Payment record yet
          {
            // Or if we track payment status in Payment model
            payment: { status: { not: "COMPLETED" } },
          },
          // Note: In our schema, true credit sales might rely on matching total vs debt payments
        ],
      },
      include: {
        items: {
          include: { drug: true },
        },
        debtPayments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get All Debt Payments (Repayments)
    const payments = await prisma.debtPayment.findMany({
      where: {
        sale: { patientId: patientId },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { success: true, patient, sales: creditSales, payments };
  } catch (error: any) {
    console.error("Failed to fetch debtor details:", error);
    return { success: false, error: error.message };
  }
});

// 3. Add Debt Payment (Repayment)
ipcMain.handle(
  "add-debt-payment",
  async (_event, { patientId, amount, note }) => {
    try {
      // Find recent credit sale to attach this payment to (simplification for now,
      // ideally we attach to specific sale or just general ledger if schema supports)

      // For this implementation, we will:
      // 1. Create a DebtPayment record (needs a saleId in current schema)
      // 2. Decrement Patient balance

      // Limitation: Current schema requires DebtPayment to link to a Sale.
      // We need to find *any* sale for this patient to link, or the logical "General Debt" sale.
      // Best approach: Find the oldest unpaid sale, or just the most recent sale.

      const lastSale = await prisma.sale.findFirst({
        where: { patientId: patientId },
        orderBy: { createdAt: "desc" },
      });

      if (!lastSale) {
        return {
          success: false,
          error: "No sales record found for this patient to attach payment to",
        };
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create Payment
        const payment = await tx.debtPayment.create({
          data: {
            saleId: lastSale.id, // Linking to last sale for reference
            amount: amount,
            method: "CASH",
            note: note || "طھط³ط¯ظٹط¯ ط¯ظپط¹ط©",
            createdAt: new Date(),
          },
        });

        // 2. Update Patient Balance
        const patient = await tx.patient.update({
          where: { id: patientId },
          data: {
            balance: { decrement: amount },
          },
        });

        // 3. Loyalty System Logic (Earn points on debt payment)
        const settings = await tx.companySettings.findFirst();
        if (settings?.loyaltyEnabled && amount > 0) {
          const pointsPerDinar = settings.loyaltyPointsPerDinar || 0.01;
          const pointsEarned = Math.floor(amount * pointsPerDinar);

          if (pointsEarned > 0) {
            let loyaltyAccount = await tx.loyaltyAccount.findUnique({
              where: { patientId: patientId },
            });

            if (!loyaltyAccount) {
              loyaltyAccount = await tx.loyaltyAccount.create({
                data: { patientId: patientId },
              });
            }

            const newLifetime = loyaltyAccount.lifetimePoints + pointsEarned;
            const newTotal = loyaltyAccount.totalPoints + pointsEarned;
            let newTier = "BRONZE";
            if (newLifetime >= 20000) newTier = "GOLD";
            else if (newLifetime >= 5000) newTier = "SILVER";

            await tx.loyaltyAccount.update({
              where: { id: loyaltyAccount.id },
              data: {
                totalPoints: newTotal,
                lifetimePoints: newLifetime,
                tier: newTier,
              },
            });

            await tx.loyaltyTransaction.create({
              data: {
                accountId: loyaltyAccount.id,
                type: "EARN",
                points: pointsEarned,
                saleId: lastSale.id, // Associate with the sale used for this payment
                description: "نقاط مكتسبة من تسديد دين",
              },
            });
          }
        }

        return { payment, patient };
      });

      // Periodic sync will push this payment to cloud automatically
      return { success: true, newBalance: result.patient.balance };
    } catch (error: any) {
      console.error("Failed to add debt payment:", error);
      return { success: false, error: error.message };
    }
  },
);

// ===== IPC Handlers for Dead-Letter Queue (Sync Failures) =====

ipcMain.handle("get-sync-failures-count", async () => {
  try {
    return await prisma.syncFailure.count();
  } catch (e) {
    console.error("Error getting DLQ count", e);
    return 0;
  }
});

ipcMain.handle("get-sync-failures", async () => {
  try {
    return await prisma.syncFailure.findMany({
      orderBy: { createdAt: "desc" },
    });
  } catch (e) {
    console.error("Error getting DLQ items", e);
    return [];
  }
});

ipcMain.handle("delete-sync-failure", async (_event, id) => {
  try {
    await prisma.syncFailure.delete({ where: { id } });

    // Notify UI to update badges
    store.set("syncFailureFlag", Date.now());
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("sync-failure-recorded");
    });

    return true;
  } catch (e) {
    console.error("Error deleting DLQ item", e);
    return false;
  }
});

ipcMain.handle("retry-sync-failure", async (_event, failureData) => {
  try {
    const { id, entityType, payload } = failureData;
    const parsedPayload = JSON.parse(payload);

    // Push back to the active queue depending on type
    if (entityType === "SALE") {
      await prisma.sale.update({
        where: { id: parsedPayload.id },
        data: { synced: false }, // Trigger syncSales loop
      });
      // Update the DB dump in case they fixed JSON manually here?
      // Better yet, just let syncSales pick it up from DB. Wait, if they modified the JSON,
      // we should update the DB record too.
      if (parsedPayload.items) {
        // For now, if they edit payload, let's just push it to the queue manually or update DB.
        // Easiest is to update the DB so the normal loop picks it up:
        await prisma.sale.update({
          where: { id: parsedPayload.id },
          data: {
            total: parsedPayload.total,
            discount: parsedPayload.discount,
            // Updating items is complex deep-nested Prisma. So we rely on them fixing the primitive fields.
          },
        });
      }
    } else if (entityType === "DEBT_PAYMENT") {
      await prisma.debtPayment.update({
        where: { id: parsedPayload.id },
        data: {
          synced: false,
          amount: parsedPayload.amount,
          note: parsedPayload.note,
        },
      });
    } else if (
      entityType === "ADD-INVENTORY" ||
      entityType === "DELETE-INVENTORY" ||
      entityType === "UPDATE-INVENTORY" ||
      entityType === "ADD-BATCH"
    ) {
      // Push to pending actions
      const existingQueue = getPendingSyncActions();
      existingQueue.push({
        id: `retry-${Date.now()}`,
        type: entityType.toLowerCase() as any,
        payload: parsedPayload,
        attempts: 0,
        createdAt: new Date().toISOString(),
        nextRetryAt: new Date().toISOString(), // immediate
      });
      setPendingSyncActions(existingQueue);
    }

    // Remove from DLQ
    await prisma.syncFailure.delete({ where: { id } });

    // Notify badging UI
    store.set("syncFailureFlag", Date.now());
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("sync-failure-recorded");
    });

    // Trigger loop immediately
    void processPendingSyncActions();

    return true;
  } catch (e: any) {
    console.error("Error retrying DLQ item", e);
    // Update the error message so the UI shows why it failed parsing
    try {
      await prisma.syncFailure.update({
        where: { id: failureData.id },
        data: { errorMessage: "JSON Parsing or DB Error: " + e.message },
      });
    } catch {}
    return false;
  }
});

ipcMain.handle("search-sale", async (_event, query) => {
  try {
    // Normalize Arabic/Eastern-Arabic digits to Western digits
    const normalized = String(query).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

    const include = {
      items: { include: { drug: true } },
      patient: true,
      payment: true,
      returns: { include: { items: true } },
    };
    // Search by invoiceNumber first (what's printed on receipt), then fall back to id prefix
    const sale =
      (await prisma.sale.findFirst({ where: { invoiceNumber: normalized }, include })) ||
      (await prisma.sale.findFirst({ where: { id: { startsWith: normalized } }, include }));
    if (!sale) return { success: false, error: "الفاتورة غير موجودة" };
    return { success: true, sale };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  "return-sale",
  async (_event, { saleId, items, notes, safeId, branchId }) => {
    try {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: { items: true, payment: true, patient: true },
      });
      if (!sale) throw new Error("Sale not found");

      const result = await prisma.$transaction(async (tx) => {
        const returnAmount = items.reduce(
          (sum: number, item: any) => sum + item.quantity * item.price,
          0,
        );

        // Create Return record
        const saleReturn = await tx.saleReturn.create({
          data: {
            saleId,
            branchId: branchId || "default",
            safeId: safeId || null,
            total: returnAmount,
            notes: notes || null,
            items: {
              create: items.map((item: any) => ({
                drugId: item.drugId,
                quantity: item.quantity,
                price: item.price,
              })),
            },
          },
        });

        // Handle Financials
        if (sale.payment?.method === "CREDIT" && sale.patientId) {
          await tx.patient.update({
            where: { id: sale.patientId },
            data: { balance: { decrement: returnAmount } },
          });
        } else if (safeId) {
          await tx.safe.update({
            where: { id: safeId },
            data: { balance: { decrement: returnAmount } },
          });
          await tx.transaction.create({
            data: {
              safeId,
              type: "OUT",
              amount: returnAmount,
              referenceType: "SALE_RETURN",
              referenceId: saleReturn.id,
              description: `إرجاع فاتورة #${saleId.slice(0, 8)}`,
            },
          });
        }

        // Restore Inventory
        for (const item of items) {
          const inventory = await tx.inventory.findFirst({
            where: { drugId: item.drugId },
            include: { batches: { orderBy: { expiryDate: "desc" }, take: 1 } },
          });
          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { quantity: { increment: item.quantity } },
            });
            if (inventory.batches && inventory.batches.length > 0) {
              await tx.batch.update({
                where: { id: inventory.batches[0].id },
                data: { quantity: { increment: item.quantity } },
              });
            }
          }
        }
        return saleReturn;
      });

      return { success: true, returnId: result.id };
    } catch (error: any) {
      console.error("Sale return error:", error);
      return { success: false, error: error.message };
    }
  },
);

app.whenReady().then(() => {
  initBackupScheduler();
});
