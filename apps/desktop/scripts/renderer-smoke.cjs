// Exercise the built renderer in Electron's production sandbox, without the
// real main process, customer database, credentials, or network access.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
    env, stdio: 'pipe', encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  process.exit(result.status === 0 ? 0 : 1);
} else {
  const { app, BrowserWindow, ipcMain, session } = require('electron');
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'faramace-renderer-smoke-')));
  const errors = [];
  const fail = (error) => { console.error(String(error)); app.exit(1); };
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
  app.whenReady().then(async () => {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }),
    );
    ipcMain.handle('get-session-user', () => ({ success: false }));
    ipcMain.handle('theme:get', () => 'light');
    ipcMain.handle('get-company-settings', () => ({}));
    const win = new BrowserWindow({ show: false, webPreferences: {
      preload: path.join(root, 'dist-electron/preload.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
    } });
    win.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) errors.push(message);
    });
    win.webContents.on('preload-error', (_event, _file, error) => errors.push(String(error)));
    win.webContents.on('render-process-gone', (_event, details) => fail(JSON.stringify(details)));
    await win.loadFile(path.join(root, 'dist/index.html'));
    const deadline = Date.now() + 10000;
    let rendered = false;
    while (!errors.length && Date.now() < deadline) {
      rendered = await win.webContents.executeJavaScript(
        '!!document.querySelector("#root input") && document.querySelector("#root").innerText.trim().length > 0',
      );
      if (rendered) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (errors.length || !rendered) throw new Error(errors.join('\n') || 'Renderer did not display the activation form');
    console.log('PASS: built renderer displays activation form in sandboxed Electron (isolated profile, network blocked).');
    app.exit(0);
  }).catch(fail);
}
