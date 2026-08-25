/**
 * Electron main process for Entity Map.
 *
 * Boots a local HTTP server (see static-server.js for why not file://), then
 * points a hardened BrowserWindow at it. All privileged work -- native save
 * dialogs, OS keychain access -- lives here and is reached from the renderer
 * over the narrow contextBridge API defined in preload.js.
 */

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('./static-server');

// Dev mode is opt-in via EM_DEV=1 (set by `npm run electron:dev`), NOT
// `!app.isPackaged` -- running `electron .` against a local build is
// unpackaged too, and must serve dist rather than wait on `ng serve`.
/**
 * Display name, shown in the macOS menu bar, the About panel and the dock.
 * Must be set before anything reads a path, since userData is derived from it.
 */
app.setName('Entity Map');

/**
 * Storage directory, pinned DELIBERATELY to the old lowercase name.
 *
 * Chromium keeps the renderer's localStorage and IndexedDB under userData, and
 * userData defaults to <appData>/<app name>. Letting the rename move it would
 * orphan every saved environment, connection and stored password -- the app
 * would silently come up empty. The display name and the storage location are
 * decoupled on purpose so the former can change without touching the latter.
 * This also keeps a packaged build reading the same data as a local run.
 */
app.setPath('userData', path.join(app.getPath('appData'), 'entity-map'));

const isDev = process.env.EM_DEV === '1';

/** In dev we attach to `ng serve`; in production we serve the built bundle. */
const DEV_SERVER_URL = 'http://localhost:4200';
const DIST_ROOT = path.join(__dirname, '..', 'dist', 'entity-map', 'browser');

let mainWindow = null;
let server = null;

// --- window state persistence -------------------------------------------

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf-8'));
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch { /* first run, or unreadable -- fall through to defaults */ }
  return { width: 1440, height: 900 };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: mainWindow.isMaximized() }));
  } catch { /* non-fatal */ }
}

// --- secret storage (OS keychain) ---------------------------------------

const secretsFile = () => path.join(app.getPath('userData'), 'secrets.json');

function readSecrets() {
  try { return JSON.parse(fs.readFileSync(secretsFile(), 'utf-8')); } catch { return {}; }
}

function writeSecrets(obj) {
  fs.writeFileSync(secretsFile(), JSON.stringify(obj), { mode: 0o600 });
}

function registerIpc() {
  // Native save dialog -- replaces the browser's silent download behaviour.
  ipcMain.handle('em:save-file', async (_e, { defaultPath, data, filters }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: filters || [],
    });
    if (canceled || !filePath) return { saved: false };
    // `data` arrives as an ArrayBuffer/Uint8Array over the structured clone.
    await fs.promises.writeFile(filePath, Buffer.from(data));
    return { saved: true, path: filePath };
  });

  ipcMain.handle('em:show-item-in-folder', (_e, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // OS-backed secret storage. Falls back to reporting unavailability so the
  // renderer can keep using its existing AES-GCM/IndexedDB path.
  ipcMain.handle('em:secrets-available', () => safeStorage.isEncryptionAvailable());

  ipcMain.handle('em:secrets-set', (_e, { key, value }) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const all = readSecrets();
    all[key] = safeStorage.encryptString(value).toString('base64');
    writeSecrets(all);
    return true;
  });

  ipcMain.handle('em:secrets-get', (_e, key) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const blob = readSecrets()[key];
    if (!blob) return null;
    try {
      return safeStorage.decryptString(Buffer.from(blob, 'base64'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('em:secrets-delete', (_e, key) => {
    const all = readSecrets();
    delete all[key];
    writeSecrets(all);
    return true;
  });

  ipcMain.handle('em:get-theme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));

  ipcMain.handle('em:is-fullscreen', () => !!mainWindow && mainWindow.isFullScreen());
}

// --- window --------------------------------------------------------------

async function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
    // macOS: frameless-inset chrome, with the traffic lights vertically
    // centred against the app's own 52px toolbar (see em-platform-mac-frameless
    // in styles.scss, which reserves the horizontal space they occupy).
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 20, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  // macOS HIDES the traffic lights in full screen, so the 84px inset the
  // toolbar reserves for them becomes dead space. Tell the renderer so it can
  // drop the inset while full screen is active.
  const sendFullScreen = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('em:fullscreen-changed', mainWindow.isFullScreen());
    }
  };
  mainWindow.on('enter-full-screen', sendFullScreen);
  mainWindow.on('leave-full-screen', sendFullScreen);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  // Re-assert on every load so a reload doesn't lose the current state.
  mainWindow.webContents.on('did-finish-load', sendFullScreen);
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });

  // External links open in the real browser, never in an app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // Attach to `ng serve`. Requires the standalone proxy for Creatio calls:
    //   npm run start:live
    await mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    try {
      server = await startServer({ root: DIST_ROOT, log: (m) => console.log(m) });
    } catch (err) {
      // Fail loudly: silently binding a different port would orphan the user's
      // saved environments, which live on the origin the port is part of.
      dialog.showErrorBox('Entity Map could not start', err.message);
      app.quit();
      return;
    }
    await mainWindow.loadURL(server.origin);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Metadata XML…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('em:menu', 'open-metadata'),
        },
        {
          label: 'Export…',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('em:menu', 'export'),
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('em:menu', 'settings'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- lifecycle -----------------------------------------------------------

// Single instance: focus the existing window instead of opening a second app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpc();
    buildMenu();
    await createWindow();

    nativeTheme.on('updated', () => {
      mainWindow?.webContents.send('em:theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', async () => {
    if (server) await server.close();
  });
}
