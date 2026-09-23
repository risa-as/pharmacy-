import store from "./store";
import { BrowserWindow } from "electron";
/** Record only after acknowledged writes/committed snapshots, never during a health read. */
export function recordSyncSuccess(kind: string) {
  const branchId = String(store.get("branchId") || "");
  if (!branchId) return;
  try {
    store.set("lastSuccessfulSync", {
      at: new Date().toISOString(),
      kind,
      branchId,
    });
  } catch {
    console.warn("[Sync] Could not persist successful sync timestamp");
    return;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send("staff-sync-updated");
    } catch {
      /* A closing window must not fail a committed synchronization. */
    }
  }
}
