"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
  // You can expose other APTs you need here.
  // ...
});
electron.contextBridge.exposeInMainWorld("electronTheme", {
  getTheme: () => electron.ipcRenderer.invoke("theme:get"),
  setTheme: (v) => electron.ipcRenderer.invoke("theme:set", v)
});
electron.contextBridge.exposeInMainWorld("electronLicense", {
  getHardwareId: () => electron.ipcRenderer.invoke("get-hardware-id"),
  activate: (payload) => electron.ipcRenderer.invoke("license:activate", payload),
  verify: (payload) => electron.ipcRenderer.invoke("license:verify", payload),
  saveTenantContext: (context) => electron.ipcRenderer.invoke("license:save-tenant-context", context)
});
