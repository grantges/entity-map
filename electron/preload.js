/**
 * Preload bridge -- the ONLY surface the renderer can reach the main process
 * through. Everything here is explicitly enumerated; there is no generic
 * `invoke(channel, ...)` escape hatch on purpose.
 *
 * The renderer feature-detects `window.electronAPI` to pick its platform
 * implementations (see src/app/core/platform/). When it is absent, the app is
 * running as a normal web page and the browser implementations are used.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  /** Save bytes to disk via the native dialog. `data` must be a Uint8Array. */
  saveFile: (opts) => ipcRenderer.invoke('em:save-file', opts),
  showItemInFolder: (filePath) => ipcRenderer.invoke('em:show-item-in-folder', filePath),

  secrets: {
    isAvailable: () => ipcRenderer.invoke('em:secrets-available'),
    set: (key, value) => ipcRenderer.invoke('em:secrets-set', { key, value }),
    get: (key) => ipcRenderer.invoke('em:secrets-get', key),
    delete: (key) => ipcRenderer.invoke('em:secrets-delete', key),
  },

  getTheme: () => ipcRenderer.invoke('em:get-theme'),

  isFullScreen: () => ipcRenderer.invoke('em:is-fullscreen'),
  onFullScreenChanged: (cb) => {
    const listener = (_e, isFullScreen) => cb(isFullScreen);
    ipcRenderer.on('em:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('em:fullscreen-changed', listener);
  },
  onThemeChanged: (cb) => {
    const listener = (_e, theme) => cb(theme);
    ipcRenderer.on('em:theme-changed', listener);
    return () => ipcRenderer.removeListener('em:theme-changed', listener);
  },

  /** Native menu actions: 'open-metadata' | 'export' | 'settings' */
  onMenuAction: (cb) => {
    const listener = (_e, action) => cb(action);
    ipcRenderer.on('em:menu', listener);
    return () => ipcRenderer.removeListener('em:menu', listener);
  },
});
