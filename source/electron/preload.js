const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Get build configuration
  getBuildConfig: () => ipcRenderer.invoke('get-build-config'),

  // Update manager
  getUpdateManagerConfig: () => ipcRenderer.invoke('update-manager:get-config'),
  applyUpdateManagerConfig: (config) => ipcRenderer.invoke('update-manager:apply-config', { config }),
  analyzeUpdateManagerAssets: (config, edition) => ipcRenderer.invoke('update-manager:analyze-assets', { config, edition }),
  executeUpdateManagerAction: (payload) => ipcRenderer.invoke('update-manager:execute', payload),
  getUpdateManagerWorkspaceInfo: (workspacePath) => ipcRenderer.invoke('update-manager:get-workspace-info', workspacePath),
  deleteUpdateManagerWorkspace: (workspacePath) => ipcRenderer.invoke('update-manager:delete-workspace', workspacePath),
  onUpdateManagerCommandEvent: (callback) => {
    ipcRenderer.on('update-manager:command-event', (event, payload) => callback(payload));
  },

  // Open external URLs outside the app window
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),

  // Read a locale dictionary (code/locales/<code>.json) as text, or null if
  // missing/unreadable. Used by the i18n loader (fetch can't read file://).
  loadLocale: (code) => ipcRenderer.invoke('i18n-load-locale', code),

  // Generic Steam handlers
  // Note: In standalone builds, these return false/null
  steamIsAvailable: () => ipcRenderer.invoke('steam-is-available'),
  steamGetUsername: () => ipcRenderer.invoke('steam-get-username'),
  steamGetUserId: () => ipcRenderer.invoke('steam-get-userid'), // not the 64, but the account ID
  steamGetUserId64: () => ipcRenderer.invoke('steam-get-userid64'),
  // Language the player picked for this game in Steam (auto-detect source)
  steamGetLanguage: () => ipcRenderer.invoke('steam-get-language'),

  // Player info handler
  // Note: Available in all builds for backend/display purposes
  steamGetPlayerInfo: (steamId64) => ipcRenderer.invoke('steam-get-player-info', steamId64),

  // Achievement handlers (Steam only - returns false in standalone)
  steamUnlockAchievement: (achievementId) => ipcRenderer.invoke('steam-unlock-achievement', achievementId),
  steamCheckAchievement: (achievementId) => ipcRenderer.invoke('steam-check-achievement', achievementId),
  steamLockAchievement: (achievementId) => ipcRenderer.invoke('steam-lock-achievement', achievementId),

  // Cloud Save handlers (Steam only - returns false/null in standalone)
  steamSaveToCloud: (fileName, data) => ipcRenderer.invoke('steam-save-cloud', fileName, data),
  steamLoadFromCloud: (fileName) => ipcRenderer.invoke('steam-load-cloud', fileName),

  // Aggregated Steam diagnostics (client/cloud status) for debugging save issues
  steamGetDiagnostics: () => ipcRenderer.invoke('steam-get-diagnostics'),

  // List asset files for gallery discovery
  listAssetFiles: (relativeDir) => ipcRenderer.invoke('list-asset-files', relativeDir),

  // Read one asset file as bytes (the 3D world model; file:// blocks fetch)
  readAssetBinary: (relativePath) => ipcRenderer.invoke('read-asset-binary', relativePath),

  // Listen for build configuration updates
  onBuildConfig: (callback) => {
    ipcRenderer.on('build-config', (event, config) => callback(config));
  },

  // Quit the game
  quitGame: () => ipcRenderer.send('quit-game'),

  // Listen for app closing so the renderer can flush its pending save.
  onAppClosing: (callback) => {
    ipcRenderer.on('app-closing', () => callback());
  },

  // Tell the main process the close-time save is done, so it can finish closing.
  notifyAppClosingSaved: () => ipcRenderer.send('app-closing-saved'),

  // Set window mode
  setWindowMode: (windowMode, resolution) => ipcRenderer.send('set-window-mode', windowMode, resolution),

  // Load save file (returns Promise)
  loadSave: () => ipcRenderer.invoke('load-save'),

  // Save to file (base64 string, returns Promise)
  saveToFile: (base64data) => ipcRenderer.invoke('save-to-file', base64data),

  // Save file management
  listSaveFiles: () => ipcRenderer.invoke('list-save-files'),
  readSaveFile: (fileName) => ipcRenderer.invoke('read-save-file', fileName),
  writeSaveFile: (request) => ipcRenderer.invoke('write-save-file', request),
  renameSaveFile: (request) => ipcRenderer.invoke('rename-save-file', request),
  openSaveDirectory: () => ipcRenderer.invoke('open-save-directory')
});

// Log that preload script has loaded
console.log('Preload script loaded successfully');
