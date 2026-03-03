import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, ...omit] = args
        return ipcRenderer.off(channel, ...omit)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args
        return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args
        return ipcRenderer.invoke(channel, ...omit)
    },

    // You can expose other APTs you need here.
    // ...
})

// --------- Dedicated theme API (dark mode toggle) ---------
contextBridge.exposeInMainWorld('electronTheme', {
    getTheme: (): Promise<string> => ipcRenderer.invoke('theme:get'),
    setTheme: (v: string): Promise<void> => ipcRenderer.invoke('theme:set', v),
})

// --------- License API ---------
contextBridge.exposeInMainWorld('electronLicense', {
    getHardwareId: (): Promise<{ hardwareId: string | null; deviceName: string; success: boolean }> =>
        ipcRenderer.invoke('get-hardware-id'),
    activate: (payload: { licenseKey: string; hardwareId: string; deviceName?: string }): Promise<{ ok: boolean; status: number; data: any }> =>
        ipcRenderer.invoke('license:activate', payload),
    verify: (payload: { licenseKey: string; hardwareId: string }): Promise<{ ok: boolean; status: number; data: any }> =>
        ipcRenderer.invoke('license:verify', payload),
    saveTenantContext: (context: { organizationId: string; organizationName: string; branchId: string; branchName: string }): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('license:save-tenant-context', context),
})
