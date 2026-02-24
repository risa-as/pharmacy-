"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

export default function ElectronSessionSync() {
    const { data: session } = useSession();

    useEffect(() => {
        const branchId = (session?.user as any)?.branchId;
        if (branchId && typeof window !== 'undefined' && (window as any).ipcRenderer) {
            console.log("Syncing Session Branch ID to Electron:", branchId);
            (window as any).ipcRenderer.invoke('set-branch-id', branchId)
                .then(async () => {
                    console.log("Electron Branch ID updated. Triggering Sync...");
                    await (window as any).ipcRenderer.invoke('trigger-sync');
                    console.log("Sync triggered.");
                })
                .catch((err: any) => console.error("Failed to sync branch ID:", err));
        }
    }, [session]);

    return null;
}
