const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

function normalizeEdition(edition) {
  const normalizedEdition = String(edition || 'base').trim().toLowerCase();
  if (normalizedEdition === 'gold' || normalizedEdition === 'diamond') {
    return normalizedEdition;
  }
  return 'base';
}

function normalizeDistribution(dist) {
  const normalized = String(dist || 'support hub').trim().toLowerCase();
  if (normalized === 'f95') return 'f95';
  return 'support hub';
}

function getDisplayVersion(distribution, packageVersion) {
  if (distribution === 'f95') {
    return '0.0.1';
  }

  return String(packageVersion || '0.0.2');
}

function getEditionLabel(edition) {
  return {
    base: 'Base',
    gold: 'Gold',
    diamond: 'Diamond'
  }[normalizeEdition(edition)];
}

function getWindowTitle(buildMode, edition) {
  // Steam presents as the ordinary game (no edition tier in the title), matching
  // Lewd Elevator's "Lewd Elevator Steam". It still RUNS as diamond for content.
  if (buildMode === 'steam') {
    return 'The Nun Steam';
  }
  return ['The Nun', getEditionLabel(edition)].join(' ');
}

function normalizeBuildMode(buildMode) {
  return buildMode === 'steam' ? 'steam' : 'standalone';
}

function readEmbeddedBuildMetadata() {
  try {
    const packageJsonPath = path.join(app.getAppPath(), 'package.json');
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    console.warn('[build-config] Failed to read embedded package metadata:', error && error.message ? error.message : error);
    return {};
  }
}

function resolveAssetDirectoryPath(relativeDir) {
  const normalizedRelativeDir = String(relativeDir || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  if (!/^assets(?:_(?:gold|diamond))?(?:\/|$)/.test(normalizedRelativeDir)) {
    return null;
  }

  const appPath = app.getAppPath();
  const resolvedPath = path.resolve(appPath, normalizedRelativeDir);
  const normalizedAppPath = path.resolve(appPath);

  if (resolvedPath !== normalizedAppPath && !resolvedPath.startsWith(`${normalizedAppPath}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function isSafeExternalUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

function getChromeExecutablePath() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean);

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function openExternalUrl(url) {
  const normalizedUrl = String(url || '').trim();

  if (!isSafeExternalUrl(normalizedUrl)) {
    return Promise.resolve({ success: false, error: 'Invalid external URL.' });
  }

  if (process.platform === 'win32') {
    const chromePath = getChromeExecutablePath();

    if (chromePath) {
      return new Promise((resolve) => {
        execFile(chromePath, [normalizedUrl], { detached: true, stdio: 'ignore' }, (error) => {
          if (error) {
            shell.openExternal(normalizedUrl)
              .then(() => resolve({ success: true, browser: 'default' }))
              .catch((shellError) => resolve({
                success: false,
                error: shellError && shellError.message ? shellError.message : String(shellError || error)
              }));
            return;
          }

          resolve({ success: true, browser: 'chrome' });
        });
      });
    }
  }

  return shell.openExternal(normalizedUrl)
    .then(() => ({ success: true, browser: 'default' }))
    .catch((error) => ({
      success: false,
      error: error && error.message ? error.message : String(error)
    }));
}

const embeddedBuildMetadata = app.isPackaged ? readEmbeddedBuildMetadata() : {};
const BUILD_MODE = normalizeBuildMode(embeddedBuildMetadata.buildMode || process.env.BUILD_MODE || 'standalone');
const APP_EDITION = normalizeEdition(embeddedBuildMetadata.appEdition || process.env.APP_EDITION);
const APP_DISTRIBUTION = normalizeDistribution(embeddedBuildMetadata.appDistribution || process.env.APP_DISTRIBUTION);
const SAVE_COMPATIBILITY_VERSION = normalizeEdition(
  embeddedBuildMetadata.saveCompatibilityVersion || process.env.SAVE_COMPATIBILITY_VERSION || APP_EDITION
);
const IS_PACKAGED_BUILD = app.isPackaged;
const IS_PRODUCTION = IS_PACKAGED_BUILD
  ? embeddedBuildMetadata.isProduction !== false
  : (process.env.NODE_ENV === 'production');
const ASSETS_COMPRESSED = embeddedBuildMetadata.assetsCompressed === true || process.env.ASSETS_COMPRESSED === 'true';
const ASSETS_UPSCALED = embeddedBuildMetadata.assetsUpscaled === true || process.env.ASSETS_UPSCALED === 'true';
const APP_VERSION = getDisplayVersion(APP_DISTRIBUTION, embeddedBuildMetadata.version || app.getVersion());
const WEB_DEBUGGING_ENABLED = !IS_PACKAGED_BUILD;
const DEVTOOLS_ENABLED = WEB_DEBUGGING_ENABLED && !IS_PRODUCTION;
const APP_PAGE = String(process.env.APP_PAGE || 'game').trim().toLowerCase();

console.log('=== The Nun Build Configuration ===');
console.log(`Build Mode: ${BUILD_MODE}`);
console.log(`App Edition: ${APP_EDITION}`);
console.log(`Save Compatibility Version: ${SAVE_COMPATIBILITY_VERSION}`);
console.log(`Environment: ${IS_PRODUCTION ? 'Production' : 'Development'}`);
console.log(`Packaged: ${IS_PACKAGED_BUILD ? 'Yes' : 'No'}`);
console.log(`Web Debugging: ${WEB_DEBUGGING_ENABLED ? 'Enabled' : 'Disabled'}`);
console.log(`DevTools: ${DEVTOOLS_ENABLED ? 'Enabled' : 'Disabled'}`);
console.log(`Assets Compressed: ${ASSETS_COMPRESSED}`);
console.log(`Assets Upscaled: ${ASSETS_UPSCALED}`);
console.log('===================================');

let mainWindow;

// Close-time save flush. Autosaves are debounced in the renderer, so the window is held
// open until the renderer confirms its final write (or the timeout fires).
const SAVE_FLUSH_TIMEOUT_MS = 4000;
let saveFlushPending = false;
let saveFlushCompleted = false;
let saveFlushTimeout = null;
let pendingSaveFlushResolver = null;

// Sent by the renderer once its close-time save has finished (or provably failed).
ipcMain.on('app-closing-saved', () => {
  if (typeof pendingSaveFlushResolver === 'function') {
    const resolve = pendingSaveFlushResolver;
    pendingSaveFlushResolver = null;
    resolve();
  }
});

// Closing the window has to WAIT for the renderer's final save. Electron does NOT await
// an async 'close' listener, and the renderer's autosave is debounced, so a close could
// drop the last write. Hold the close, let the renderer report back, then destroy. A
// timeout guarantees a wedged renderer can never trap the game.
function attachCloseSaveFlush(targetWindow) {
  targetWindow.on('close', (event) => {
    if (saveFlushCompleted || targetWindow.isDestroyed() || !targetWindow.webContents) {
      return;
    }

    event.preventDefault();

    if (saveFlushPending) {
      return;
    }

    saveFlushPending = true;

    const finishClose = () => {
      if (saveFlushCompleted) {
        return;
      }
      saveFlushCompleted = true;
      saveFlushPending = false;
      pendingSaveFlushResolver = null;
      if (saveFlushTimeout) {
        clearTimeout(saveFlushTimeout);
        saveFlushTimeout = null;
      }
      if (!targetWindow.isDestroyed()) {
        targetWindow.destroy();
      }
    };

    pendingSaveFlushResolver = finishClose;
    saveFlushTimeout = setTimeout(finishClose, SAVE_FLUSH_TIMEOUT_MS);

    try {
      targetWindow.webContents.send('app-closing');
    } catch (error) {
      finishClose();
    }
  });
}
let activeUpdateManagerCommand = null;
let lastUpdateManagerWorkspaceInfo = null;

// --- Standalone (no Steam) integration --------------------------------------
// The Steam SDK integration (steamworks.js/greenworks) has been removed. The game
// runs fully standalone: saves go to local files, achievements are tracked in the
// save data, and the IPC handlers below answer with standalone-safe values so the
// renderer's API surface is unchanged.

let steamClient = null;
let steamInitializationAttempted = false;
let steamInitializationError = null;

function isSteamBuild() {
  return BUILD_MODE === 'steam';
}

function isStandaloneBuild() {
  return !isSteamBuild();
}

function initializeSteamClient() {
  steamInitializationAttempted = true;
  steamClient = null;
  return null;
}

function getSteamClient() {
  return steamClient || initializeSteamClient();
}

function getSteamUserHandle(client) {
  if (!client) {
    return null;
  }

  if (client.localplayer) {
    return client.localplayer;
  }

  if (client.getSteamId || client.getPersonaName || client.getNickname) {
    return client;
  }

  return null;
}

function getSteamUserName(client) {
  const userHandle = getSteamUserHandle(client);
  if (!userHandle) {
    return 'Player';
  }

  if (typeof userHandle.getName === 'function') {
    return userHandle.getName();
  }

  if (typeof userHandle.getPersonaName === 'function') {
    return userHandle.getPersonaName();
  }

  if (typeof userHandle.getNickname === 'function') {
    return userHandle.getNickname();
  }

  return 'Player';
}

function getSteamIdPayload(client) {
  const userHandle = getSteamUserHandle(client);
  if (!userHandle || typeof userHandle.getSteamId !== 'function') {
    return null;
  }

  try {
    return userHandle.getSteamId();
  } catch (error) {
    console.warn(`[steam] Failed to read Steam ID: ${error.message}`);
    return null;
  }
}

function getSteamAccountId(client) {
  const steamId = getSteamIdPayload(client);
  if (!steamId) {
    return null;
  }

  if (steamId.accountId != null) {
    return steamId.accountId;
  }

  if (typeof steamId.getAccountID === 'function') {
    return steamId.getAccountID();
  }

  return null;
}

function getSteamId64(client) {
  const steamId = getSteamIdPayload(client);
  if (!steamId) {
    return null;
  }

  // steamworks.js returns steamId64 as a BigInt. Stringify it so it survives IPC
  // structured cloning and downstream JSON usage safely.
  if (steamId.steamId64 != null) {
    return String(steamId.steamId64);
  }

  if (typeof steamId.getRawSteamID === 'function') {
    return String(steamId.getRawSteamID());
  }

  return null;
}

function unlockSteamAchievement(client, achievementId) {
  if (!client || !achievementId) {
    return false;
  }

  if (client.achievement && typeof client.achievement.activate === 'function') {
    client.achievement.activate(achievementId);
    return true;
  }

  if (typeof client.activateAchievement === 'function') {
    client.activateAchievement(achievementId);
    return true;
  }

  if (typeof client.setAchievement === 'function') {
    client.setAchievement(achievementId, true);
    return true;
  }

  return false;
}

function checkSteamAchievement(client, achievementId) {
  if (!client || !achievementId) {
    return false;
  }

  if (client.achievement && typeof client.achievement.isActivated === 'function') {
    return client.achievement.isActivated(achievementId);
  }

  if (typeof client.isAchievementActivated === 'function') {
    return client.isAchievementActivated(achievementId);
  }

  if (typeof client.getAchievement === 'function') {
    return Boolean(client.getAchievement(achievementId));
  }

  return false;
}

function lockSteamAchievement(client, achievementId) {
  if (!client || !achievementId) {
    return false;
  }

  if (client.achievement && typeof client.achievement.clear === 'function') {
    client.achievement.clear(achievementId);
    return true;
  }

  if (typeof client.clearAchievement === 'function') {
    client.clearAchievement(achievementId);
    return true;
  }

  return false;
}

async function writeSteamCloudFile(client, fileName, data) {
  if (!client || !fileName) {
    return false;
  }

  if (client.cloud && typeof client.cloud.writeFile === 'function') {
    // cloud.writeFile returns a boolean indicating whether Steam accepted the write.
    // It returns false when Steam Cloud is disabled (app/account) or the quota is 0,
    // so propagate it instead of assuming success.
    return Boolean(await client.cloud.writeFile(fileName, data));
  }

  if (typeof client.saveTextToFile === 'function') {
    client.saveTextToFile(fileName, data);
    return true;
  }

  return false;
}

async function readSteamCloudFile(client, fileName) {
  if (!client || !fileName) {
    return null;
  }

  if (client.cloud && typeof client.cloud.readFile === 'function') {
    // cloud.readFile throws when the file does not exist yet (e.g. first launch),
    // so guard with fileExists to return a clean null instead of throwing.
    if (typeof client.cloud.fileExists === 'function' && !client.cloud.fileExists(fileName)) {
      return null;
    }
    return client.cloud.readFile(fileName);
  }

  if (typeof client.readTextFromFile === 'function') {
    return client.readTextFromFile(fileName);
  }

  return null;
}

// Reads a Steam Cloud file and DISTINGUISHES the three outcomes that a plain `null`
// return collapses into one:
//   { status: 'ok', data }      the file exists and was read
//   { status: 'empty' }         Steam says the file does not exist (genuine first run)
//   { status: 'error', reason } no client / read failed / file exists but read blank
// The distinction is load-bearing. "empty" lets the game start fresh and save; "error"
// must NEVER be followed by a write, or default state overwrites the player's real
// cloud save and Steam Cloud has no user-facing rollback.
function readSteamCloudFileDetailed(client, fileName) {
  if (!client) {
    return { status: 'error', reason: 'no-steam-client' };
  }

  if (!fileName) {
    return { status: 'error', reason: 'no-file-name' };
  }

  const cloud = client.cloud;
  const canProbeExistence = Boolean(cloud && typeof cloud.fileExists === 'function');
  const canReadCloud = Boolean(cloud && typeof cloud.readFile === 'function');
  const canReadLegacy = typeof client.readTextFromFile === 'function';

  if (!canReadCloud && !canReadLegacy) {
    return { status: 'error', reason: 'no-cloud-api' };
  }

  if (canProbeExistence) {
    let exists = false;
    try {
      exists = cloud.fileExists(fileName);
    } catch (error) {
      return {
        status: 'error',
        reason: `fileExists threw: ${error && error.message ? error.message : error}`
      };
    }

    if (!exists) {
      return { status: 'empty' };
    }
  }

  let data = null;
  try {
    data = canReadCloud ? cloud.readFile(fileName) : client.readTextFromFile(fileName);
  } catch (error) {
    // Without fileExists we cannot tell "missing" from "failed" — steamworks.js throws
    // for both — so a throw has to be read as "missing" on that path only.
    if (!canProbeExistence) {
      return { status: 'empty' };
    }
    return {
      status: 'error',
      reason: `readFile threw: ${error && error.message ? error.message : error}`
    };
  }

  if (typeof data !== 'string' || data.length === 0) {
    // Steam said the file exists but handed back nothing: that is a failed read, not
    // an empty store.
    return canProbeExistence
      ? { status: 'error', reason: 'blank-read' }
      : { status: 'empty' };
  }

  return { status: 'ok', data };
}

// Local mirror of the last cloud save that Steam accepted. Steam Cloud is otherwise the
// ONLY copy of a Steam player's progress, so a cloud store that comes back empty when it
// should not (sync glitch, quota reset) would silently start the player from scratch.
const STEAM_CLOUD_MIRROR_SUFFIX = '.cloudmirror.json';

function getSteamCloudMirrorPath(fileName) {
  const safeName = String(fileName || 'steam').replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(ensureSaveDirectoryExists(), `${safeName}${STEAM_CLOUD_MIRROR_SUFFIX}`);
}

function writeSteamCloudMirror(fileName, data) {
  if (typeof data !== 'string' || data.length === 0) {
    return false;
  }

  try {
    fs.writeFileSync(getSteamCloudMirrorPath(fileName), data, 'utf-8');
    return true;
  } catch (error) {
    console.warn(`[steam] could not write the local cloud mirror for "${fileName}":`, error);
    return false;
  }
}

function readSteamCloudMirror(fileName) {
  try {
    const mirrorPath = getSteamCloudMirrorPath(fileName);
    if (!fs.existsSync(mirrorPath)) {
      return null;
    }

    const raw = fs.readFileSync(mirrorPath, 'utf-8');
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return null;
    }

    // Only hand back a mirror we can prove is intact.
    JSON.parse(raw);
    return raw;
  } catch (error) {
    console.warn(`[steam] local cloud mirror for "${fileName}" is unusable:`, error);
    return null;
  }
}

function delaySteamRetry(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const STEAM_CLOUD_READ_ATTEMPTS = 3;
const STEAM_CLOUD_READ_RETRY_DELAY_MS = 400;

// Returns a plain object describing the Steam Cloud state for diagnostics/logging.
// `isEnabledForApp` reflects the app-level setting on Steamworks (Application → Cloud);
// `isEnabledForAccount` reflects the user's "Enable Steam Cloud synchronization" toggle.
// If either is false, writeFile/readFile will not actually persist.
function getSteamCloudStatus(client) {
  const status = {
    hasClient: Boolean(client),
    hasCloudNamespace: Boolean(client && client.cloud),
    isEnabledForApp: null,
    isEnabledForAccount: null
  };

  if (!client || !client.cloud) {
    return status;
  }

  try {
    if (typeof client.cloud.isEnabledForApp === 'function') {
      status.isEnabledForApp = client.cloud.isEnabledForApp();
    }
  } catch (error) {
    status.isEnabledForApp = `error: ${error.message}`;
  }

  try {
    if (typeof client.cloud.isEnabledForAccount === 'function') {
      status.isEnabledForAccount = client.cloud.isEnabledForAccount();
    }
  } catch (error) {
    status.isEnabledForAccount = `error: ${error.message}`;
  }

  return status;
}

// --- End standalone integration ---------------------------------------------

const GAME_NAME = 'The Nun';
const SAVE_ROOT_FOLDER_NAME = 'Thenun';
const SAVE_DIRECTORY_NAME = 'save';
const SAVE_FILE_EXTENSION = '.save';

function getLegacyLocalSaveFilePath() {
  return path.join(__dirname, '../save', 'save.save');
}

function getSaveDirectoryPath() {
  return path.join(app.getPath('appData'), SAVE_ROOT_FOLDER_NAME, SAVE_DIRECTORY_NAME);
}

function ensureSaveDirectoryExists() {
  const saveDirectoryPath = getSaveDirectoryPath();
  fs.mkdirSync(saveDirectoryPath, { recursive: true });
  return saveDirectoryPath;
}

function padSaveTimestampPart(value) {
  return String(value).padStart(2, '0');
}

function buildTimestampedSaveFileName(version, date) {
  const sourceDate = date instanceof Date ? date : new Date();
  const normalizedVersion = normalizeEdition(version || SAVE_COMPATIBILITY_VERSION);
  const datePart = [
    sourceDate.getFullYear(),
    padSaveTimestampPart(sourceDate.getMonth() + 1),
    padSaveTimestampPart(sourceDate.getDate())
  ].join('-');
  const timePart = [
    padSaveTimestampPart(sourceDate.getHours()),
    padSaveTimestampPart(sourceDate.getMinutes()),
    padSaveTimestampPart(sourceDate.getSeconds())
  ].join('-');

  return `${datePart}_${timePart}_${GAME_NAME}_${normalizedVersion}${SAVE_FILE_EXTENSION}`;
}

function sanitizeSaveFileStem(fileName) {
  const stem = String(fileName || '')
    .replace(/\.save$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stem.slice(0, 120);
}

function resolveSaveFilePath(fileName) {
  const saveDirectoryPath = ensureSaveDirectoryExists();
  const safeStem = sanitizeSaveFileStem(fileName);

  if (!safeStem) {
    return null;
  }

  const resolvedPath = path.resolve(saveDirectoryPath, `${safeStem}${SAVE_FILE_EXTENSION}`);
  if (resolvedPath !== saveDirectoryPath && !resolvedPath.startsWith(`${saveDirectoryPath}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function ensureUniqueSaveFilePath(preferredFileName) {
  const saveDirectoryPath = ensureSaveDirectoryExists();
  const preferredStem = sanitizeSaveFileStem(preferredFileName);
  const fallbackStem = sanitizeSaveFileStem(buildTimestampedSaveFileName(SAVE_COMPATIBILITY_VERSION));
  const baseStem = preferredStem || fallbackStem;

  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${attempt}`;
    const candidatePath = path.join(saveDirectoryPath, `${baseStem}${suffix}${SAVE_FILE_EXTENSION}`);
    if (!fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error('Unable to allocate a unique save file name.');
}

function decodeSaveData(base64data) {
  const normalizedData = String(base64data || '').trim();
  if (!normalizedData) {
    throw new Error('Save data is empty.');
  }

  return JSON.parse(Buffer.from(normalizedData, 'base64').toString('utf8'));
}

function encodeSaveData(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function normalizeSavePayload(payload, options = {}) {
  const nextPayload = payload && typeof payload === 'object' ? payload : {};
  const metadata = nextPayload.metadata && typeof nextPayload.metadata === 'object' ? nextPayload.metadata : {};
  const fallbackVersion = options.saveCompatibilityVersion || metadata.saveCompatibilityVersion || nextPayload.saveCompatibilityVersion;
  const createdAt = metadata.createdAt || options.createdAt || new Date().toISOString();
  const updatedAt = options.updatedAt || metadata.updatedAt || createdAt;

  return {
    metadata: {
      gameName: GAME_NAME,
      appEdition: normalizeEdition(metadata.appEdition || nextPayload.appEdition || fallbackVersion),
      saveCompatibilityVersion: normalizeEdition(fallbackVersion || SAVE_COMPATIBILITY_VERSION),
      createdAt,
      updatedAt
    },
    settings: nextPayload.settings && typeof nextPayload.settings === 'object' ? nextPayload.settings : {},
    gallery: nextPayload.gallery && typeof nextPayload.gallery === 'object' ? nextPayload.gallery : {}
  };
}

function readSaveFileEntry(filePath) {
  const stats = fs.statSync(filePath);
  const rawData = fs.readFileSync(filePath, 'utf8');
  const parsedPayload = normalizeSavePayload(decodeSaveData(rawData), {
    updatedAt: stats.mtime.toISOString()
  });
  const compatibilityVersion = parsedPayload.metadata.saveCompatibilityVersion;

  return {
    fileName: path.basename(filePath),
    filePath,
    compatibilityVersion,
    compatible: compatibilityVersion === SAVE_COMPATIBILITY_VERSION,
    modifiedAt: stats.mtime.toISOString(),
    createdAt: parsedPayload.metadata.createdAt || stats.birthtime.toISOString(),
    payload: parsedPayload,
    data: rawData
  };
}

function listSaveEntries() {
  const saveDirectoryPath = ensureSaveDirectoryExists();
  const dirEntries = fs.readdirSync(saveDirectoryPath, { withFileTypes: true });

  return dirEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(SAVE_FILE_EXTENSION))
    .map((entry) => {
      const filePath = path.join(saveDirectoryPath, entry.name);
      try {
        return readSaveFileEntry(filePath);
      } catch (error) {
        return {
          fileName: entry.name,
          filePath,
          compatibilityVersion: null,
          compatible: false,
          modifiedAt: null,
          createdAt: null,
          payload: null,
          data: null,
          parseError: error && error.message ? error.message : String(error)
        };
      }
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.modifiedAt || left.createdAt || 0) || 0;
      const rightTime = Date.parse(right.modifiedAt || right.createdAt || 0) || 0;
      return rightTime - leftTime;
    });
}

function serializeSaveEntry(entry) {
  return {
    fileName: entry.fileName,
    compatibilityVersion: entry.compatibilityVersion,
    compatible: Boolean(entry.compatible),
    modifiedAt: entry.modifiedAt,
    createdAt: entry.createdAt,
    parseError: entry.parseError || null,
    metadata: entry.payload ? entry.payload.metadata : null
  };
}

function getLatestCompatibleSaveEntry() {
  return listSaveEntries().find((entry) => entry.compatible && !entry.parseError) || null;
}

function writeSaveFile(base64data, options = {}) {
  const decodedPayload = normalizeSavePayload(decodeSaveData(base64data), {
    saveCompatibilityVersion: options.saveCompatibilityVersion || SAVE_COMPATIBILITY_VERSION
  });
  const saveDirectoryPath = ensureSaveDirectoryExists();
  const requestedPath = options.fileName ? resolveSaveFilePath(options.fileName) : null;
  let targetPath = requestedPath;

  if (!targetPath) {
    const preferredName = buildTimestampedSaveFileName(decodedPayload.metadata.saveCompatibilityVersion);
    targetPath = ensureUniqueSaveFilePath(preferredName);
  }

  if (targetPath !== saveDirectoryPath && !targetPath.startsWith(`${saveDirectoryPath}${path.sep}`)) {
    throw new Error('Invalid save file path.');
  }

  decodedPayload.metadata.updatedAt = new Date().toISOString();
  if (!decodedPayload.metadata.createdAt) {
    decodedPayload.metadata.createdAt = decodedPayload.metadata.updatedAt;
  }

  fs.writeFileSync(targetPath, encodeSaveData(decodedPayload), 'utf8');
  return readSaveFileEntry(targetPath);
}

function getUpdateManagerService() {
  return require('./update-manager-service');
}

function getRootPath(...segments) {
  return path.join(__dirname, '..', ...segments);
}

function getNodeExecutablePath() {
  return process.env.npm_node_execpath || process.execPath;
}

function getCliPath(packageName) {
  return getRootPath('node_modules', packageName, 'cli.js');
}

function getSpawnEnvironment(overrides = {}) {
  const mergedEnv = {
    ...process.env,
    ...overrides
  };

  if (process.platform !== 'win32') {
    return mergedEnv;
  }

  const normalizedEnv = {};
  const seenKeys = new Map();

  Object.entries(mergedEnv).forEach(([key, value]) => {
    const normalizedKey = key.toUpperCase();
    const previousKey = seenKeys.get(normalizedKey);

    if (previousKey) {
      delete normalizedEnv[previousKey];
    }

    seenKeys.set(normalizedKey, key);
    normalizedEnv[key] = value;
  });

  return normalizedEnv;
}

function buildRendererBuildConfig() {
  return {
    version: APP_VERSION,
    buildMode: BUILD_MODE,
    appEdition: APP_EDITION,
    saveCompatibilityVersion: SAVE_COMPATIBILITY_VERSION,
    isProduction: IS_PRODUCTION,
    isPackaged: IS_PACKAGED_BUILD,
    webDebuggingEnabled: WEB_DEBUGGING_ENABLED,
    assetsCompressed: ASSETS_COMPRESSED,
    assetsUpscaled: ASSETS_UPSCALED,
    appDistribution: APP_DISTRIBUTION
  };
}

function emitUpdateManagerCommandEvent(payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('update-manager:command-event', payload);
    }
  });
}

function appendUpdateManagerOutput(commandState, text) {
  if (!commandState || !text) {
    return;
  }

  const nextOutput = `${commandState.outputBuffer || ''}${text}`;
  commandState.outputBuffer = nextOutput.slice(-24000);
}

function detectUpdateManagerFailureMessage(outputText) {
  const normalizedOutput = String(outputText || '').toLowerCase();

  if (!normalizedOutput) {
    return null;
  }

  const diskSpacePatterns = [
    /enospc/i,
    /no space left on device/i,
    /not enough space/i,
    /insufficient disk space/i,
    /there is not enough space on the disk/i,
    /disk full/i,
    /the disk is full/i
  ];

  if (diskSpacePatterns.some((pattern) => pattern.test(normalizedOutput))) {
    return 'Build failed because a disk ran out of free space. Free up space on the workspace/output drive and retry.';
  }

  return null;
}

function getUpdateManagerCommandDetails(action) {
  const normalizedAction = String(action || '').toLowerCase();

  if (normalizedAction === 'run') {
    return {
      commandPath: getNodeExecutablePath(),
      args: [getCliPath('electron'), '.'],
      commandLabel: 'electron .'
    };
  }

  if (normalizedAction === 'build') {
    return {
      commandPath: getNodeExecutablePath(),
      args: [getCliPath('electron-builder'), '--config', 'electron-builder.config.js'],
      commandLabel: 'electron-builder --config electron-builder.config.js'
    };
  }

  throw new Error(`Unsupported update-manager action: ${action}`);
}

function startUpdateManagerCommand({ action, target, edition, distribution, workspacePath, workspaceInfo }) {
  if (activeUpdateManagerCommand) {
    throw new Error('Another update-manager command is already running.');
  }

  const commandDetails = getUpdateManagerCommandDetails(action);
  const normalizedEdition = normalizeEdition(edition).toLowerCase();
  const normalizedDistribution = normalizeDistribution(distribution);
  const child = spawn(commandDetails.commandPath, commandDetails.args, {
    cwd: workspacePath,
    shell: false,
    windowsHide: false,
    env: getSpawnEnvironment({
      APP_PAGE: 'game',
      BUILD_MODE: 'standalone',
      APP_EDITION: normalizedEdition,
      SAVE_COMPATIBILITY_VERSION: normalizedEdition,
      APP_DISTRIBUTION: normalizedDistribution
    })
  });

  activeUpdateManagerCommand = {
    child,
    action,
    target,
    edition: normalizedEdition,
    distribution: normalizedDistribution,
    workspacePath,
    workspaceInfo,
    commandLabel: commandDetails.commandLabel,
    outputBuffer: ''
  };

  emitUpdateManagerCommandEvent({
    type: 'start',
    action,
    target,
    edition: normalizedEdition,
    distribution: normalizedDistribution,
    commandLabel: commandDetails.commandLabel,
    workspacePath,
    workspaceInfo
  });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    appendUpdateManagerOutput(activeUpdateManagerCommand, text);
    emitUpdateManagerCommandEvent({
      type: 'stdout',
      text,
      action,
      target,
      edition: normalizedEdition,
      distribution: normalizedDistribution,
      commandLabel: commandDetails.commandLabel,
      workspacePath,
      workspaceInfo
    });
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    appendUpdateManagerOutput(activeUpdateManagerCommand, text);
    emitUpdateManagerCommandEvent({
      type: 'stderr',
      text,
      action,
      target,
      edition: normalizedEdition,
      distribution: normalizedDistribution,
      commandLabel: commandDetails.commandLabel,
      workspacePath,
      workspaceInfo
    });
  });

  child.on('error', (error) => {
    emitUpdateManagerCommandEvent({
      type: 'error',
      text: error && error.message ? error.message : String(error),
      action,
      target,
      edition: normalizedEdition,
      distribution: normalizedDistribution,
      commandLabel: commandDetails.commandLabel,
      workspacePath,
      workspaceInfo
    });
    activeUpdateManagerCommand = null;
  });

  child.on('close', (code) => {
    const failureMessage = Number(code) === 0
      ? null
      : detectUpdateManagerFailureMessage(activeUpdateManagerCommand && activeUpdateManagerCommand.outputBuffer);
    emitUpdateManagerCommandEvent({
      type: 'close',
      code,
      failureMessage,
      action,
      target,
      edition: normalizedEdition,
      distribution: normalizedDistribution,
      commandLabel: commandDetails.commandLabel,
      workspacePath,
      workspaceInfo
    });
    activeUpdateManagerCommand = null;
  });

  return {
    action,
    target,
    edition: normalizedEdition,
    distribution: normalizedDistribution,
    commandLabel: commandDetails.commandLabel,
    workspacePath,
    workspaceInfo
  };
}

function createWindow() {
  const isUpdateManager = APP_PAGE === 'update-manager';

  // Fresh window, fresh close-flush state.
  saveFlushPending = false;
  saveFlushCompleted = false;
  pendingSaveFlushResolver = null;
  if (saveFlushTimeout) {
    clearTimeout(saveFlushTimeout);
    saveFlushTimeout = null;
  }

  mainWindow = new BrowserWindow({
    width: isUpdateManager ? 1460 : 1920,
    height: isUpdateManager ? 1040 : 1080,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: DEVTOOLS_ENABLED
    },
    title: isUpdateManager ? 'The Nun Update Manager' : getWindowTitle(BUILD_MODE, APP_EDITION)
  });

  mainWindow.loadFile(path.join(__dirname, isUpdateManager ? '../update-manager.html' : '../index.html'));

  if (DEVTOOLS_ENABLED) {
    mainWindow.webContents.openDevTools();
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('build-config', buildRendererBuildConfig());
  });

  attachCloseSaveFlush(mainWindow);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Remove default menu bar to prevent access to devtools via Alt→View in packaged builds
  if (IS_PACKAGED_BUILD) {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('load-save', async () => {
  try {
    const legacyLocalSaveFile = getLegacyLocalSaveFilePath();
    if (fs.existsSync(legacyLocalSaveFile)) {
      return { success: true, data: fs.readFileSync(legacyLocalSaveFile, 'utf8'), source: 'legacy-local-file' };
    }

    const latestCompatibleSave = getLatestCompatibleSaveEntry();
    if (!latestCompatibleSave) {
      return { success: false, warning: 'No compatible save file exists.' };
    }

    return {
      success: true,
      data: latestCompatibleSave.data,
      source: 'appdata-save-file',
      fileName: latestCompatibleSave.fileName
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-to-file', async (event, base64data) => {
  try {
    const latestCompatibleSave = getLatestCompatibleSaveEntry();
    const entry = writeSaveFile(base64data, {
      fileName: latestCompatibleSave ? latestCompatibleSave.fileName : null,
      saveCompatibilityVersion: SAVE_COMPATIBILITY_VERSION
    });

    return { success: true, fileName: entry.fileName };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('list-save-files', async () => {
  try {
    const entries = listSaveEntries();
    return {
      success: true,
      saveDirectory: getSaveDirectoryPath(),
      compatibleVersion: SAVE_COMPATIBILITY_VERSION,
      saves: entries.map(serializeSaveEntry)
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error)
    };
  }
});

ipcMain.handle('read-save-file', async (event, fileName) => {
  try {
    const targetPath = resolveSaveFilePath(fileName);
    if (!targetPath || !fs.existsSync(targetPath)) {
      return { success: false, error: 'Save file not found.' };
    }

    const entry = readSaveFileEntry(targetPath);
    return {
      success: true,
      save: serializeSaveEntry(entry),
      data: entry.data,
      payload: entry.payload
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error)
    };
  }
});

ipcMain.handle('write-save-file', async (event, request) => {
  try {
    const entry = writeSaveFile(request && request.data, {
      fileName: request && request.fileName,
      saveCompatibilityVersion: request && request.saveCompatibilityVersion
    });

    return {
      success: true,
      save: serializeSaveEntry(entry),
      payload: entry.payload
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error)
    };
  }
});

ipcMain.handle('rename-save-file', async (event, request) => {
  try {
    const currentPath = resolveSaveFilePath(request && request.fileName);
    if (!currentPath || !fs.existsSync(currentPath)) {
      return { success: false, error: 'Save file not found.' };
    }

    const nextStem = sanitizeSaveFileStem(request && request.nextName);
    if (!nextStem) {
      return { success: false, error: 'Save name cannot be empty.' };
    }

    const nextPath = ensureUniqueSaveFilePath(`${nextStem}${SAVE_FILE_EXTENSION}`);
    fs.renameSync(currentPath, nextPath);
    const entry = readSaveFileEntry(nextPath);

    return {
      success: true,
      save: serializeSaveEntry(entry)
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error)
    };
  }
});

ipcMain.handle('open-save-directory', async () => {
  try {
    const saveDirectoryPath = ensureSaveDirectoryExists();
    const result = await shell.openPath(saveDirectoryPath);
    if (result) {
      return { success: false, error: result };
    }

    return {
      success: true,
      saveDirectory: saveDirectoryPath
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error)
    };
  }
});
ipcMain.handle('get-build-config', () => {
  return buildRendererBuildConfig();
});

ipcMain.handle('list-asset-files', (event, relativeDir) => {
  const targetDirectory = resolveAssetDirectoryPath(relativeDir);

  if (!targetDirectory || !fs.existsSync(targetDirectory)) {
    return [];
  }

  try {
    return fs.readdirSync(targetDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  } catch (error) {
    console.warn('[assets] Failed to read asset directory:', relativeDir, error && error.message ? error.message : error);
    return [];
  }
});

// Read one asset file as raw bytes (the 3D world's .glb model). The app runs over
// file://, where fetch()/XHR cannot read local files, so the loader goes through here.
// Read asynchronously: the models are 20-60 MB each, and a synchronous read blocks the
// main process (the window's input among it) until the file is off the disk.
ipcMain.handle('read-asset-binary', async (event, relativePath) => {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const directory = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
  const targetDirectory = resolveAssetDirectoryPath(directory);
  if (!targetDirectory) {
    return null;
  }
  const filePath = path.resolve(targetDirectory, normalized.slice(normalized.lastIndexOf('/') + 1));
  if (!filePath.startsWith(`${targetDirectory}${path.sep}`)) {
    return null;
  }
  try {
    return await fs.promises.readFile(filePath);
  } catch (error) {
    console.warn('[assets] Failed to read asset binary:', normalized, error && error.message ? error.message : error);
    return null;
  }
});

ipcMain.handle('update-manager:get-config', () => {
  return getUpdateManagerService().getUpdateManagerConfig(getRootPath());
});

ipcMain.handle('update-manager:apply-config', (event, payload = {}) => {
  return getUpdateManagerService().applyUpdateManagerConfig(getRootPath(), payload.config || {});
});

ipcMain.handle('update-manager:analyze-assets', (event, payload = {}) => {
  return getUpdateManagerService().analyzeUpdateManagerAssets(
    getRootPath(),
    payload.config || {},
    payload.edition || 'BASE'
  );
});

ipcMain.handle('update-manager:execute', (event, payload = {}) => {
  const action = String(payload.action || '').toLowerCase();
  const target = getUpdateManagerService().sanitizeWorkspaceTarget(payload.target || 'BASE');
  const workspace = getUpdateManagerService().prepareUpdateManagerWorkspace(getRootPath(), payload.config || {}, target);

  lastUpdateManagerWorkspaceInfo = workspace.workspaceInfo;

  const command = startUpdateManagerCommand({
    action,
    target,
    edition: workspace.edition,
    distribution: workspace.applyResult.config.distribution,
    workspacePath: workspace.workspacePath,
    workspaceInfo: workspace.workspaceInfo
  });

  return {
    ...command,
    applyResult: workspace.applyResult,
    assetAnalysis: workspace.assetAnalysis,
    workspaceInfo: workspace.workspaceInfo
  };
});

ipcMain.handle('update-manager:get-workspace-info', (event, workspacePath) => {
  const targetPath = String(workspacePath || '').trim();
  if (!targetPath) {
    return lastUpdateManagerWorkspaceInfo;
  }

  return getUpdateManagerService().describeGeneratedWorkspace(getRootPath(), targetPath);
});

ipcMain.handle('update-manager:delete-workspace', (event, workspacePath) => {
  const result = getUpdateManagerService().deleteGeneratedWorkspace(getRootPath(), workspacePath);
  if (lastUpdateManagerWorkspaceInfo && lastUpdateManagerWorkspaceInfo.workspacePath === result.workspacePath) {
    lastUpdateManagerWorkspaceInfo = null;
  }
  return result;
});

ipcMain.handle('open-external-url', (event, url) => openExternalUrl(url));

// Read a locale dictionary (code/locales/<code>.json) as text, or null if
// missing/unreadable. The app loads over file://, where fetch() cannot read
// local files, so the i18n loader goes through this bridge instead.
ipcMain.handle('i18n-load-locale', (event, code) => {
  if (typeof code !== 'string' || !/^[a-z]+$/.test(code)) {
    return null;
  }
  try {
    const localePath = path.join(__dirname, '..', 'code', 'locales', `${code}.json`);
    return fs.readFileSync(localePath, 'utf8');
  } catch (err) {
    return null;
  }
});

// Handle quit game request
ipcMain.on('quit-game', () => {
  app.quit();
});

// Handle window mode changes
ipcMain.on('set-window-mode', (event, windowMode, resolution) => {
  if (!mainWindow) return;

  const [width, height] = resolution.split('x').map(Number);

  switch (windowMode) {
    case 'fullscreen':
      mainWindow.setFullScreen(true);
      break;
    case 'windowed-fullscreen':
      mainWindow.setFullScreen(false);
      mainWindow.maximize();
      break;
    case 'windowed':
    default:
      mainWindow.setFullScreen(false);
      mainWindow.unmaximize();
      mainWindow.setSize(width, height);
      mainWindow.center();
      break;
  }
});

// Steam IPC handlers

// Aggregated diagnostics so the renderer (DevTools console) can show exactly why a
// Steam Cloud write/read failed without needing the main-process terminal.
ipcMain.handle('steam-get-diagnostics', () => {
  const client = getSteamClient();
  let runningAppId = null;
  try {
    if (client && client.utils && typeof client.utils.getAppId === 'function') {
      runningAppId = client.utils.getAppId();
    }
  } catch (error) {
    runningAppId = `error: ${error.message}`;
  }

  return {
    buildMode: BUILD_MODE,
    isSteamBuild: isSteamBuild(),
    configuredAppId: null,
    runningAppId,
    hasClient: Boolean(client),
    initializationError: steamInitializationError ? steamInitializationError.message : null,
    user: client ? getSteamUserName(client) : null,
    steamId64: client ? getSteamId64(client) : null,
    cloud: getSteamCloudStatus(client)
  };
});

ipcMain.handle('steam-is-available', () => {
  if (isStandaloneBuild()) {
    return false;
  }

  const client = getSteamClient();
  const available = Boolean(client);
  console.log(
    `[steam] steam-is-available -> ${available}` +
      (available
        ? ` (cloud: ${JSON.stringify(getSteamCloudStatus(client))})`
        : steamInitializationError
          ? ` (init error: ${steamInitializationError.message})`
          : ' (no Steam client / module)')
  );
  return available;
});

ipcMain.handle('steam-get-username', () => {
  if (isStandaloneBuild()) {
    return 'Player';
  }

  return getSteamUserName(getSteamClient());
});

ipcMain.handle('steam-get-userid', () => {
  if (isStandaloneBuild()) {
    return null;
  }

  return getSteamAccountId(getSteamClient());
});

ipcMain.handle('steam-get-userid64', () => {
  if (isStandaloneBuild()) {
    return null;
  }

  return getSteamId64(getSteamClient());
});

// Language the player selected for this game in Steam (e.g. "english", "french",
// "schinese"). Returns null in standalone builds or when Steam is unavailable,
// so the renderer falls back to its own language resolution.
ipcMain.handle('steam-get-language', () => {
  if (isStandaloneBuild()) {
    return null;
  }

  const client = getSteamClient();
  try {
    if (client && client.apps && typeof client.apps.currentGameLanguage === 'function') {
      const language = client.apps.currentGameLanguage();
      console.log(`[steam] steam-get-language -> ${language}`);
      return language || null;
    }
  } catch (error) {
    console.warn(`[steam] Failed to read game language: ${error.message}`);
  }

  return null;
});

// Get player info by SteamID64 via the public community profile XML.
// Available in all builds (backend/display use, not Steam API).
ipcMain.handle('steam-get-player-info', async (event, steamId64) => {
  try {
    if (steamId64 == null || steamId64 === '') {
      return null;
    }

    const steamId = steamId64.toString();
    const url = `https://steamcommunity.com/profiles/${steamId}?xml=1`;

    return new Promise((resolve) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const usernameMatch = data.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/);
            const avatarIconMatch = data.match(/<avatarIcon><!\[CDATA\[(.*?)\]\]><\/avatarIcon>/);
            const avatarMediumMatch = data.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/);
            const avatarFullMatch = data.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);

            const playerInfo = {
              username: usernameMatch ? usernameMatch[1] : null,
              avatar: {
                icon: avatarIconMatch ? avatarIconMatch[1] : null,
                medium: avatarMediumMatch ? avatarMediumMatch[1] : null,
                full: avatarFullMatch ? avatarFullMatch[1] : null
              }
            };

            if (!playerInfo.username) {
              console.warn(`No username found for SteamID64: ${steamId}`);
              resolve(null);
            } else {
              resolve(playerInfo);
            }
          } catch (parseError) {
            console.error('Failed to parse Steam profile XML:', parseError);
            resolve(null);
          }
        });
      }).on('error', (error) => {
        console.error('Failed to fetch player info:', error);
        resolve(null);
      });
    });
  } catch (error) {
    console.error('Error in steam-get-player-info:', error);
    return null;
  }
});

// Achievement handlers (Steam only - not available in standalone)
ipcMain.handle('steam-unlock-achievement', async (event, achievementId) => {
  if (isStandaloneBuild()) {
    return false;
  }

  const client = getSteamClient();
  if (client) {
    try {
      const unlocked = unlockSteamAchievement(client, achievementId);
      if (!unlocked) {
        return false;
      }

      console.log('Achievement unlocked:', achievementId);
      return true;
    } catch (error) {
      console.error('Failed to unlock achievement:', error);
      return false;
    }
  }
  return false;
});

ipcMain.handle('steam-check-achievement', async (event, achievementId) => {
  if (isStandaloneBuild()) {
    return false;
  }

  const client = getSteamClient();
  if (client) {
    try {
      const achieved = checkSteamAchievement(client, achievementId);
      console.log(`Achievement ${achievementId} achieved:`, achieved);
      return achieved;
    } catch (error) {
      console.error('Failed to check achievement:', error);
      return false;
    }
  }
  return false;
});

ipcMain.handle('steam-lock-achievement', async (event, achievementId) => {
  if (isStandaloneBuild()) {
    return false;
  }

  const client = getSteamClient();
  if (client) {
    try {
      const cleared = lockSteamAchievement(client, achievementId);
      if (!cleared) {
        return false;
      }

      console.log('Achievement cleared:', achievementId);
      return true;
    } catch (error) {
      console.error('Failed to clear achievement:', error);
      return false;
    }
  }
  return false;
});

// Cloud Save handlers (Steam only - standalone uses local files)
ipcMain.handle('steam-save-cloud', async (event, name, data) => {
  if (isStandaloneBuild()) {
    console.log('[steam] steam-save-cloud ignored: standalone build.');
    return false;
  }

  const client = getSteamClient();
  const byteLength = typeof data === 'string' ? Buffer.byteLength(data, 'utf-8') : null;
  console.log(
    `[steam] steam-save-cloud start: file="${name}", bytes=${byteLength}, ` +
      `cloud=${JSON.stringify(getSteamCloudStatus(client))}`
  );

  if (!client) {
    console.warn(
      '[steam] steam-save-cloud aborted: no Steam client. ' +
        (steamInitializationError
          ? `Init error: ${steamInitializationError.message}`
          : 'Steam may not be running, or the app is not owned by this account.')
    );
    return false;
  }

  try {
    const saved = await writeSteamCloudFile(client, name, data);
    if (!saved) {
      console.warn(
        `[steam] steam-save-cloud: writeFile returned false for "${name}". ` +
          'Steam Cloud is likely disabled for the app (Steamworks → Application → Cloud) ' +
          'or for the account, or the byte quota is 0.'
      );
      return false;
    }

    console.log(`[steam] steam-save-cloud OK: "${name}" (${byteLength} bytes written).`);
    // Keep a local copy so Steam Cloud is never the only copy of the player's progress.
    writeSteamCloudMirror(name, data);
    return true;
  } catch (error) {
    console.error(`[steam] steam-save-cloud threw for "${name}":`, error);
    return false;
  }
});

// Returns a DISCRIMINATED result — { status: 'ok' | 'empty' | 'error', ... } — never a
// bare null. The renderer must be able to tell "there is no save yet" (safe to start
// fresh and save) from "the read failed" (must not write, or defaults destroy the save).
ipcMain.handle('steam-load-cloud', async (event, name) => {
  if (isStandaloneBuild()) {
    console.log('[steam] steam-load-cloud ignored: standalone build.');
    return { status: 'error', reason: 'standalone-build' };
  }

  console.log(
    `[steam] steam-load-cloud start: file="${name}", ` +
      `cloud=${JSON.stringify(getSteamCloudStatus(getSteamClient()))}`
  );

  let result = { status: 'error', reason: 'not-attempted' };

  for (let attempt = 1; attempt <= STEAM_CLOUD_READ_ATTEMPTS; attempt += 1) {
    result = readSteamCloudFileDetailed(getSteamClient(), name);

    if (result.status !== 'error') {
      break;
    }

    if (attempt < STEAM_CLOUD_READ_ATTEMPTS) {
      console.warn(
        `[steam] steam-load-cloud attempt ${attempt}/${STEAM_CLOUD_READ_ATTEMPTS} failed ` +
          `for "${name}" (${result.reason}); retrying.`
      );
      await delaySteamRetry(STEAM_CLOUD_READ_RETRY_DELAY_MS);
    }
  }

  if (result.status === 'ok') {
    console.log(`[steam] steam-load-cloud done: "${name}" loaded ${result.data.length} chars from Steam Cloud.`);
    writeSteamCloudMirror(name, result.data);
    return { status: 'ok', data: result.data, source: 'steam-cloud' };
  }

  if (result.status === 'empty') {
    // Steam is sure there is no cloud file. If this machine still holds a mirror of a
    // previous cloud save, that is the player's own progress and it beats starting over.
    const mirroredData = readSteamCloudMirror(name);
    if (mirroredData) {
      console.warn(
        `[steam] steam-load-cloud: Steam Cloud reports no "${name}", but a local mirror ` +
          `exists (${mirroredData.length} chars) — recovering from it instead of starting fresh.`
      );
      return { status: 'ok', data: mirroredData, source: 'local-mirror' };
    }

    console.log(`[steam] steam-load-cloud done: "${name}" does not exist yet (first run).`);
    return { status: 'empty', source: 'steam-cloud' };
  }

  console.error(
    `[steam] steam-load-cloud FAILED for "${name}" after ${STEAM_CLOUD_READ_ATTEMPTS} attempts: ${result.reason}. ` +
      (steamInitializationError ? `Init error: ${steamInitializationError.message}. ` : '') +
      'Saving is disabled for this session so the existing cloud save is not overwritten.'
  );

  // Hand the mirror to the renderer so the player still sees their progress; it loads
  // it READ-ONLY (writes stay disabled, so the real cloud save is never overwritten).
  const mirrorData = readSteamCloudMirror(name);
  return {
    status: 'error',
    reason: result.reason,
    hasLocalMirror: Boolean(mirrorData),
    mirrorData: mirrorData || null
  };
});

if (DEVTOOLS_ENABLED) {
  console.log('Development mode: Additional dev features can be added here');
}
