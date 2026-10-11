(function() {
    const SETTINGS_STORAGE_KEY = 'the-nun-settings-v1';
    const PANEL_ANIMATION_MS = 420;
    const PAUSE_ANIMATION_MS = 220;

    function getSettingsStorageKey() {
        if (typeof window.getTheNunScopedStorageKey === 'function') {
            return window.getTheNunScopedStorageKey(SETTINGS_STORAGE_KEY);
        }

        return SETTINGS_STORAGE_KEY;
    }

    const DEFAULT_SETTINGS = {
        video: {
            windowMode: 'fullscreen',
            resolution: '1920x1080',
            gamma: 1
        },
        audio: {
            sfxVolume: 1.0,
            musicVolume: 0.50,
            clickSoundEnabled: true
        },
        controls: {
            // x world.js CONFIG.mouseSensitivity; 1 = the original feel
            mouseSensitivity: 1
        },
        stats: {
            bestRound: 1,
            bestZone: 1
        },
        // null = "never chosen": startup falls back to Steam/OS detection.
        language: null
    };

    // Mouse sensitivity: Settings > Controls slider (x100 as an integer, step 5) and the
    // tutorial's "sensitivity" step (scripts/tutorial.js: wheel or -/+ while looking round).
    const MOUSE_SENSITIVITY_RANGE = Object.freeze({ min: 0.2, max: 3, step: 0.05, fallback: 1 });

    // Lifetime progress that survives every run (endings found, best route progress,
    // whether the tutorial was offered / finished). Lives inside settings so it rides the existing save paths
    // (localStorage, save files, Steam Cloud) without touching the save contract.
    const ENDING_KEYS = ['exorcism', 'corruption', 'limbo'];
    const ROUTE_KEYS = ['helpNun', 'helpDemon', 'demonExorcism', 'nunCorruption', 'attackNun', 'attackDemon'];
    const RUN_STAT_KEYS = ['relics', 'repelled', 'lost', 'rites'];

    function clampInt(value, min, max, fallback) {
        const nextValue = Math.round(Number(value));
        if (!Number.isFinite(nextValue)) {
            return fallback;
        }
        return Math.max(min, Math.min(max, nextValue));
    }

    function normalizeProgress(progress) {
        const safe = progress && typeof progress === 'object' ? progress : {};
        const endingsSeen = safe.endingsSeen && typeof safe.endingsSeen === 'object' ? safe.endingsSeen : {};
        const routeBest = safe.routeBest && typeof safe.routeBest === 'object' ? safe.routeBest : {};

        return {
            endingsSeen: ENDING_KEYS.reduce((result, key) => {
                result[key] = endingsSeen[key] === true;
                return result;
            }, {}),
            routeBest: ROUTE_KEYS.reduce((result, key) => {
                result[key] = clampInt(routeBest[key], 0, 99, 0);
                return result;
            }, {}),
            runsStarted: clampInt(safe.runsStarted, 0, 999999, 0),
            // scripts/tutorial.js: asked once, before a save's first run
            tutorialOffered: safe.tutorialOffered === true,
            tutorialDone: safe.tutorialDone === true
        };
    }

    // The saved run is the checkpoint "Continue" restores: the state at the start of
    // the current vigil (or right after a failure). null = no run in progress.
    function normalizeRun(run) {
        if (!run || typeof run !== 'object') {
            return null;
        }

        const routes = run.routes && typeof run.routes === 'object' ? run.routes : {};
        const stats = run.stats && typeof run.stats === 'object' ? run.stats : {};

        return {
            phase: clampInt(run.phase, 1, 99, 1),
            crosses: clampInt(run.crosses, 0, 9999, 0),
            books: clampInt(run.books, 0, 9999, 0),
            devotion: clampInt(run.devotion, -100, 100, 0),
            routes: ROUTE_KEYS.reduce((result, key) => {
                result[key] = clampInt(routes[key], 0, 99, 0);
                return result;
            }, {}),
            stats: RUN_STAT_KEYS.reduce((result, key) => {
                result[key] = clampInt(stats[key], 0, 999999, 0);
                return result;
            }, {}),
            // Relic spots already emptied in the current vigil (gameState.js
            // normalizeTakenSpots): short ids, rebuilt from scratch like everything else
            // here, so they must be listed or a retry would be handed a full level again.
            // A save written before this existed simply has none.
            takenSpots: normalizeTakenSpotList(run.takenSpots)
        };
    }

    // Kept in step with gameState.js normalizeTakenSpots (this file must not depend on
    // load order): at most TAKEN_SPOT_LIMIT distinct short strings.
    function normalizeTakenSpotList(spots) {
        if (!Array.isArray(spots)) {
            return [];
        }
        const clean = [];
        spots.forEach((spot) => {
            if (typeof spot !== 'string' || !spot || spot.length > 32) return;
            if (clean.length >= 256 || clean.indexOf(spot) >= 0) return;
            clean.push(spot);
        });
        return clean;
    }

    function clamp(min, max, value, fallback) {
        const nextValue = Number(value);
        if (!Number.isFinite(nextValue)) {
            return fallback;
        }
        return Math.max(min, Math.min(max, nextValue));
    }

    function clampGamma(value, fallback) {
        return clamp(0.5, 2.0, value, fallback);
    }

    function clampGammaUnit(value, fallback) {
        return Math.round(clamp(5, 20, value, fallback));
    }

    function gammaUnitToMultiplier(unitValue) {
        return clampGamma(clampGammaUnit(unitValue, 10) / 10, 1);
    }

    function gammaMultiplierToUnit(gammaValue) {
        return clampGammaUnit(clampGamma(gammaValue, 1) * 10, 10);
    }

    function clampVolume(value, fallback) {
        return clamp(0, 1, value, fallback);
    }

    function clampAmbientVolume(value, fallback) {
        return clamp(0, 1, value, fallback);
    }

    // Anything but a number (or a numeric string) is "not set": old saves have no
    // `controls` at all and must load the default, and Number(null) would be 0.
    function clampMouseSensitivity(value, fallback) {
        const number = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
            ? Number(value)
            : NaN;
        const range = MOUSE_SENSITIVITY_RANGE;
        return Math.round(clamp(range.min, range.max, number, fallback) * 100) / 100;
    }

    // "1.00" = the default speed, "2.00" twice as fast (the UI font draws "×" like a "*").
    function formatMouseSensitivity(value) {
        return clampMouseSensitivity(value, MOUSE_SENSITIVITY_RANGE.fallback).toFixed(2);
    }

    function normalizeBestRecord(stats) {
        const safeStats = stats && typeof stats === 'object' ? stats : {};
        const bestRound = Math.max(1, Number(safeStats.bestRound) || DEFAULT_SETTINGS.stats.bestRound);
        const bestZone = Math.max(1, Math.min(5, Number(safeStats.bestZone) || DEFAULT_SETTINGS.stats.bestZone));

        return {
            bestRound,
            bestZone
        };
    }

    function formatBestRecord(stats) {
        const bestRecord = normalizeBestRecord(stats);
        return window.t('settings.best_record', {
            phase: bestRecord.bestRound,
            zone: bestRecord.bestZone
        });
    }

    // Validate a persisted language code against the i18n engine's supported
    // set. Returns null when i18n has not loaded or the code is unknown, which
    // makes resolveStartupLanguage() fall back to English.
    function normalizeStoredLanguage(value) {
        if (!value) {
            return null;
        }
        if (typeof window.normalizeLanguageCode === 'function') {
            return window.normalizeLanguageCode(value);
        }
        return typeof value === 'string' && /^[a-z]+$/.test(value) ? value : null;
    }

    function isHigherBestRecord(nextRecord, currentRecord) {
        const normalizedNext = normalizeBestRecord(nextRecord);
        const normalizedCurrent = normalizeBestRecord(currentRecord);

        return normalizedNext.bestRound > normalizedCurrent.bestRound
            || (normalizedNext.bestRound === normalizedCurrent.bestRound && normalizedNext.bestZone > normalizedCurrent.bestZone);
    }

    function normalizeSettings(settings) {
        const safeSettings = settings && typeof settings === 'object' ? settings : {};
        const video = safeSettings.video && typeof safeSettings.video === 'object' ? safeSettings.video : {};
        const audio = safeSettings.audio && typeof safeSettings.audio === 'object' ? safeSettings.audio : {};
        const controls = safeSettings.controls && typeof safeSettings.controls === 'object' ? safeSettings.controls : {};
        const stats = safeSettings.stats && typeof safeSettings.stats === 'object' ? safeSettings.stats : {};

        return {
            video: {
                windowMode: video.windowMode === 'fullscreen' || video.windowMode === 'windowed'
                    ? video.windowMode
                    : DEFAULT_SETTINGS.video.windowMode,
                resolution: typeof video.resolution === 'string' && video.resolution.includes('x')
                    ? video.resolution
                    : '1920x1080',
                gamma: clampGamma(video.gamma, 1)
            },
            audio: {
                sfxVolume: clampVolume(audio.sfxVolume, DEFAULT_SETTINGS.audio.sfxVolume),
                musicVolume: clampAmbientVolume(audio.musicVolume, DEFAULT_SETTINGS.audio.musicVolume),
                clickSoundEnabled: audio.clickSoundEnabled !== false
            },
            // Listed like everything else here, or it is dropped on save/load; a save
            // from before the setting existed has no `controls` and gets the default.
            controls: {
                mouseSensitivity: clampMouseSensitivity(controls.mouseSensitivity, DEFAULT_SETTINGS.controls.mouseSensitivity)
            },
            stats: normalizeBestRecord(stats),
            // This function rebuilds the settings object from scratch, so any
            // key not listed here is DROPPED on every load/save round-trip.
            // `language` must be carried explicitly or the player's choice is
            // silently lost. null means "never chosen" -> boot in English.
            language: normalizeStoredLanguage(safeSettings.language),
            // Same rule: lifetime progress and the saved run must be listed here.
            // Older saves have neither and get the defaults.
            progress: normalizeProgress(safeSettings.progress),
            run: normalizeRun(safeSettings.run)
        };
    }

    function createFreshSettings() {
        return normalizeSettings(DEFAULT_SETTINGS);
    }

    async function applySettingsState(nextSettings) {
        window.gameSettings = normalizeSettings(nextSettings || DEFAULT_SETTINGS);
        window.localStorage.setItem(getSettingsStorageKey(), JSON.stringify(window.gameSettings));

        bindSettingsControls();
        bindPauseMenuButtons();
        bindKeyboardShortcuts();
        window.applyDisplaySettings();
        window.applyAudioSettings();
        await applyWindowMode(window.gameSettings.video.windowMode, window.gameSettings.video.resolution);
        window.updateSettingsUI();
        return window.gameSettings;
    }

    function notifySaveSystemAboutSettingsChange() {
        if (typeof window.isTheNunSaveSyncSuppressed === 'function' && window.isTheNunSaveSyncSuppressed()) {
            return;
        }

        if (typeof window.requestTheNunSaveWrite === 'function') {
            window.requestTheNunSaveWrite();
        }
    }

    async function loadLegacySave() {
        if (!window.electronAPI || typeof window.electronAPI.loadSave !== 'function') {
            return null;
        }

        try {
            const result = await window.electronAPI.loadSave();
            if (!result || !result.success || !result.data) {
                return null;
            }

            const parsed = JSON.parse(window.atob(result.data));
            if (parsed && parsed.settings) {
                return parsed.settings;
            }

            if (parsed && (parsed.music != null || parsed.sound != null || parsed.windowMode || parsed.resolution)) {
                return {
                    video: {
                        windowMode: parsed.windowMode,
                        resolution: parsed.resolution,
                        gamma: parsed.gamma
                    },
                    audio: {
                        sfxVolume: parsed.sound != null ? parsed.sound / 100 : DEFAULT_SETTINGS.audio.sfxVolume,
                        musicVolume: parsed.music != null ? parsed.music / 100 : DEFAULT_SETTINGS.audio.musicVolume,
                        clickSoundEnabled: parsed.clickSoundEnabled
                    }
                };
            }
        } catch (error) {
            console.warn('Failed to read legacy settings save:', error);
        }

        return null;
    }

    async function persistSettings() {
        window.localStorage.setItem(getSettingsStorageKey(), JSON.stringify(window.gameSettings));
        notifySaveSystemAboutSettingsChange();

        if (typeof window.updateTheNunStatsPanel === 'function') {
            window.updateTheNunStatsPanel();
        }
    }

    function isSettingsPanelVisible() {
        const panel = document.getElementById('settings-panel');
        return Boolean(panel)
            && window.getComputedStyle(panel).display !== 'none'
            && !panel.classList.contains('panel-closing');
    }

    function isPauseMenuVisible() {
        const overlay = document.getElementById('pause-menu-overlay');
        return Boolean(overlay) && window.isPauseMenuOpen === true;
    }

    function isGameplayViewActive() {
        return typeof window.isGameplayViewVisible === 'function'
            ? window.isGameplayViewVisible()
            : false;
    }

    function isTitleScreenActive() {
        return document.body.classList.contains('menu-active');
    }

    function updatePauseState() {
        const shouldPause = isPauseMenuVisible() || isSettingsPanelVisible() || (window.isGalleryVisible && window.isGalleryVisible());

        if (window.gameState) {
            window.gameState.isTimePaused = shouldPause;
        }

        syncGameplayMediaPauseState(shouldPause);
    }

    function syncGameplayMediaPauseState(shouldPause) {
        const gameplayRoot = document.getElementById('game-container');
        if (!gameplayRoot) {
            return;
        }

        gameplayRoot.querySelectorAll('video, audio').forEach((mediaElement) => {
            if (shouldPause) {
                // Only record resume intent if not already flagged — prevents re-pausing
                // while already paused (e.g. opening settings from pause menu) from
                // overwriting a 'true' flag with 'false'.
                if (mediaElement.dataset.resumeAfterPause !== 'true') {
                    const wasPlaying = !mediaElement.paused && !mediaElement.ended && Boolean(mediaElement.currentSrc || mediaElement.getAttribute('src'));
                    mediaElement.dataset.resumeAfterPause = wasPlaying ? 'true' : 'false';
                }
                mediaElement.pause();

                // Guard against any in-flight play() promise overriding the pause once
                // buffering completes (Chromium race: play() resolves after pause() was called).
                if (!mediaElement.__pauseGuard) {
                    const guardFn = () => {
                        if (window.gameState && window.gameState.isTimePaused) {
                            mediaElement.pause();
                        }
                    };
                    mediaElement.__pauseGuard = guardFn;
                    mediaElement.addEventListener('playing', guardFn);
                }
                return;
            }

            // Remove the pause guard when resuming.
            if (mediaElement.__pauseGuard) {
                mediaElement.removeEventListener('playing', mediaElement.__pauseGuard);
                delete mediaElement.__pauseGuard;
            }

            if (mediaElement.dataset.resumeAfterPause !== 'true') {
                return;
            }

            mediaElement.dataset.resumeAfterPause = 'false';
            const playPromise = mediaElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
        });
    }

    function hidePauseMenuBox() {
        const pauseMenuBox = document.querySelector('#pause-menu-overlay .pause-menu-box');
        if (pauseMenuBox) {
            pauseMenuBox.style.display = 'none';
        }
    }

    function showPauseMenuBox() {
        const pauseMenuBox = document.querySelector('#pause-menu-overlay .pause-menu-box');
        if (pauseMenuBox) {
            pauseMenuBox.style.display = '';
        }
    }

    function applyGammaCalibration(gammaMultiplier) {
        const unitValue = gammaMultiplierToUnit(gammaMultiplier);
        const textAlpha = Math.max(0.022, Math.min(0.24, 0.022 + ((unitValue - 5) * 0.016)));
        const bgLift = Math.max(0.006, Math.min(0.08, 0.006 + ((unitValue - 5) * 0.0045)));
        const highlight = Math.max(0.008, Math.min(0.058, 0.008 + ((unitValue - 5) * 0.004)));
        const gammaTestSurface = document.getElementById('gamma-test-surface');

        if (gammaTestSurface) {
            gammaTestSurface.style.setProperty('--gamma-test-text-alpha', String(textAlpha));
            gammaTestSurface.style.setProperty('--gamma-test-bg-lift', String(bgLift));
            gammaTestSurface.style.setProperty('--gamma-test-highlight', String(highlight));
        }
    }

    window.applyDisplaySettings = function() {
        const gamma = clampGamma(window.gameSettings?.video?.gamma, 1);
        const filterValue = gamma === 1 ? '' : `brightness(${gamma.toFixed(2)})`;

        [
            document.querySelector('.titlescreen'),
            document.querySelector('.TS_background'),
            document.querySelector('.Gallery_UI'),
            document.querySelector('.game-view-container')
        ].forEach((target) => {
            if (target) {
                target.style.filter = filterValue;
            }
        });

        applyGammaCalibration(gamma);
    };

    window.applyAudioSettings = function() {
        const musicVolume = clampAmbientVolume(window.gameSettings?.audio?.musicVolume, DEFAULT_SETTINGS.audio.musicVolume);
        const sfxVolume = clampVolume(window.gameSettings?.audio?.sfxVolume, DEFAULT_SETTINGS.audio.sfxVolume);
        document.querySelectorAll('video, audio').forEach((mediaElement) => {
            const channel = mediaElement.dataset.volumeChannel;
            const volumeScale = Number.parseFloat(mediaElement.dataset.volumeScale ?? '1');
            const safeVolumeScale = Number.isFinite(volumeScale) && volumeScale >= 0 ? volumeScale : 1;
            const isLaunchAtmosphere = mediaElement.id === 'launch-audio';
            const gameplayRoot = document.getElementById('game-container');
            const isGameplayVisible = Boolean(gameplayRoot)
                && gameplayRoot.style.display !== 'none'
                && !gameplayRoot.classList.contains('hidden');
            const effectiveVolumeScale = isLaunchAtmosphere && isGameplayVisible
                ? safeVolumeScale * 0.17
                : safeVolumeScale;
            if (!channel || channel === 'music') {
                mediaElement.volume = Math.min(1, musicVolume * effectiveVolumeScale);
            } else if (channel === 'sfx') {
                mediaElement.volume = Math.min(1, sfxVolume * effectiveVolumeScale);
            }
        });

        // Also sync any off-DOM SFX audio objects (attack drag sounds, nun walk, etc.)
        if (typeof window.syncOffDomSfxVolume === 'function') {
            window.syncOffDomSfxVolume(sfxVolume);
        }
    };

    function syncSettingsValues() {
        const modeSelect = document.getElementById('window-mode-select');
        const resolutionSelect = document.getElementById('resolution-select');
        const gammaSlider = document.getElementById('gamma-slider');
        const gammaValue = document.getElementById('gamma-value');
        const gammaTestSlider = document.getElementById('gamma-test-slider');
        const gammaTestValue = document.getElementById('gamma-test-value');
        const sfxSlider = document.getElementById('sfx-volume-slider');
        const sfxValue = document.getElementById('sfx-volume-value');
        const musicSlider = document.getElementById('music-volume-slider');
        const musicValue = document.getElementById('music-volume-value');
        const clickSoundSelect = document.getElementById('click-sound-select');

        const gammaUnit = gammaMultiplierToUnit(window.gameSettings.video.gamma);

        if (modeSelect) {
            modeSelect.value = window.gameSettings.video.windowMode;
        }
        if (resolutionSelect) {
            resolutionSelect.value = window.gameSettings.video.resolution;
        }
        if (gammaSlider) {
            gammaSlider.value = String(gammaUnit);
        }
        if (gammaValue) {
            gammaValue.textContent = String(gammaUnit);
        }
        if (gammaTestSlider) {
            gammaTestSlider.value = String(gammaUnit);
        }
        if (gammaTestValue) {
            gammaTestValue.textContent = String(gammaUnit);
        }
        if (sfxSlider) {
            sfxSlider.value = String(Math.round(window.gameSettings.audio.sfxVolume * 100));
        }
        if (sfxValue) {
            sfxValue.textContent = `${Math.round(window.gameSettings.audio.sfxVolume * 100)}%`;
        }
        if (musicSlider) {
            musicSlider.value = String(Math.round(window.gameSettings.audio.musicVolume * 100));
        }
        if (musicValue) {
            musicValue.textContent = `${Math.round(window.gameSettings.audio.musicVolume * 100)}%`;
        }
        if (clickSoundSelect) {
            clickSoundSelect.value = window.gameSettings.audio.clickSoundEnabled ? 'enabled' : 'disabled';
        }
        syncMouseSensitivityControls();
    }

    function getMouseSensitivity() {
        return clampMouseSensitivity(window.gameSettings?.controls?.mouseSensitivity, MOUSE_SENSITIVITY_RANGE.fallback);
    }

    function syncMouseSensitivityControls() {
        const sensitivity = getMouseSensitivity();
        const slider = document.getElementById('mouse-sensitivity-slider');
        const value = document.getElementById('mouse-sensitivity-value');

        if (slider) {
            slider.value = String(Math.round(sensitivity * 100));
        }
        if (value) {
            value.textContent = formatMouseSensitivity(sensitivity);
        }
    }

    // Read on every mouse move by world.js (the look speed) and by the tutorial.
    window.getTheNunMouseSensitivity = getMouseSensitivity;
    window.formatTheNunMouseSensitivity = formatMouseSensitivity;
    window.THE_NUN_MOUSE_SENSITIVITY_RANGE = MOUSE_SENSITIVITY_RANGE;

    // Applies at once (the next mouse move uses it) and is saved like any setting.
    window.setTheNunMouseSensitivity = function(value) {
        const current = getMouseSensitivity();
        const next = clampMouseSensitivity(value, current);
        if (next === current && window.gameSettings?.controls) {
            return current;
        }
        window.gameSettings.controls = Object.assign({}, window.gameSettings.controls, { mouseSensitivity: next });
        syncMouseSensitivityControls();
        persistSettings();
        return next;
    };

    window.updateSettingsUI = function() {
        syncSettingsValues();

        const buildMode = document.getElementById('settings-build-mode');
        const runState = document.getElementById('settings-highest-record');

        if (buildMode && typeof window.getBuildModeLabel === 'function') {
            buildMode.textContent = window.getBuildModeLabel();
        }
        if (runState) {
            runState.textContent = formatBestRecord(window.gameSettings?.stats);
        }

        populateLanguageSelect();
    };

    // Fill the settings dropdown from the i18n engine's supported set. Option
    // labels are each language's own endonym, so they are NOT translated.
    function populateLanguageSelect() {
        const select = document.getElementById('language-select');
        if (!select || typeof window.getSupportedLanguages !== 'function') {
            return;
        }

        const languages = window.getSupportedLanguages();
        const activeCode =
            (typeof window.getCurrentLanguage === 'function'
                ? window.getCurrentLanguage()
                : null)
            || normalizeStoredLanguage(window.gameSettings && window.gameSettings.language)
            || 'english';

        // Rebuild only when the option set changes (cheap, avoids churn).
        if (select.options.length !== languages.length) {
            select.replaceChildren();
            languages.forEach((lang) => {
                const option = document.createElement('option');
                option.value = lang.code;
                option.textContent = lang.name;
                select.appendChild(option);
            });
        }

        select.value = activeCode;
    }
    window.populateLanguageSelect = populateLanguageSelect;

    window.onLanguageChange = function(value) {
        if (typeof window.setLanguage !== 'function') {
            return;
        }
        void Promise.resolve(window.setLanguage(value))
            .catch((error) => {
                console.error('Failed to switch language.', error);
            })
            .then(populateLanguageSelect);
    };

    async function applyWindowMode(mode, resolution) {
        if (window.electronAPI && typeof window.electronAPI.setWindowMode === 'function') {
            window.electronAPI.setWindowMode(mode, resolution);
        }
    }

    window.openSettings = function(options) {
        const settingsPanel = document.getElementById('settings-panel');
        const overlay = document.getElementById('pause-menu-overlay');
        const nextOptions = options || {};
        const openedFromGameplay = isGameplayViewActive();

        if (!settingsPanel) {
            return;
        }

        window.settingsOpenedFromPauseMenu = Boolean(nextOptions.pauseMenuOrigin);
        window.settingsOpenedFromTitleScreen = !openedFromGameplay;

        if (typeof window.closeOtherUIs === 'function') {
            window.closeOtherUIs('settings');
        }

        if (openedFromGameplay === false && !isTitleScreenActive() && typeof window.showTitleScreen === 'function') {
            window.showTitleScreen({ immediate: true });
        }

        if (openedFromGameplay && typeof window.hideTitleScreen === 'function') {
            window.hideTitleScreen({ immediate: true });
        }

        window.updateSettingsUI();
        settingsPanel.style.display = 'flex';

        window.requestAnimationFrame(() => {
            settingsPanel.classList.remove('panel-closing');
            settingsPanel.classList.add('panel-visible');
        });

        if (nextOptions.showPauseOverlay && overlay) {
            overlay.style.display = 'flex';
            overlay.classList.add('is-visible');
            if (window.settingsOpenedFromPauseMenu) {
                hidePauseMenuBox();
            }
        }

        updatePauseState();
    };

    window.closeSettings = function(options) {
        const settingsPanel = document.getElementById('settings-panel');
        const overlay = document.getElementById('pause-menu-overlay');
        const nextOptions = options || {};
        const shouldRestorePauseMenuBox = Boolean(nextOptions.restorePauseMenuBox);
        const shouldKeepPauseOverlay = Boolean(nextOptions.keepPauseOverlay);
        const shouldRestoreTitleScreen = nextOptions.restoreTitleScreen !== false;
        const shouldRestoreMenuShell = shouldRestoreTitleScreen && window.settingsOpenedFromTitleScreen === true;

        if (!settingsPanel || window.getComputedStyle(settingsPanel).display === 'none') {
            return;
        }

        if (typeof window.closeGammaTestOverlay === 'function') {
            window.closeGammaTestOverlay();
        }

        settingsPanel.classList.remove('panel-visible');
        settingsPanel.classList.add('panel-closing');
        window.setTimeout(() => {
            if (settingsPanel.classList.contains('panel-closing')) {
                settingsPanel.style.display = 'none';
            }
        }, PANEL_ANIMATION_MS);

        if (shouldRestorePauseMenuBox) {
            showPauseMenuBox();
        }

        if (!shouldKeepPauseOverlay && overlay) {
            overlay.classList.remove('is-visible');
            window.setTimeout(() => {
                if (!overlay.classList.contains('is-visible')) {
                    overlay.style.display = 'none';
                }
            }, PAUSE_ANIMATION_MS);
        }

        if (shouldRestoreMenuShell && !isTitleScreenActive() && typeof window.showTitleScreen === 'function') {
            window.showTitleScreen({ immediate: true });
        }

        window.settingsOpenedFromPauseMenu = false;
        window.settingsOpenedFromTitleScreen = false;
        updatePauseState();
    };

    window.toggleSettings = function() {
        if (isSettingsPanelVisible()) {
            window.closeSettings({
                keepPauseOverlay: window.settingsOpenedFromPauseMenu,
                restorePauseMenuBox: window.settingsOpenedFromPauseMenu
            });
            return;
        }

        window.openSettings({
            showPauseOverlay: isGameplayViewActive(),
            pauseMenuOrigin: isPauseMenuVisible()
        });
    };

    window.openPauseMenu = function() {
        // Esc in the tutorial opens its own pause (Resume / Skip tutorial).
        if (typeof window.theNunTutorial?.handlePause === 'function' && window.theNunTutorial.handlePause()) {
            return;
        }
        const overlay = document.getElementById('pause-menu-overlay');
        if (!overlay || !isGameplayViewActive() || document.body.classList.contains('menu-active')) {
            return;
        }

        window.isPauseMenuOpen = true;
        showPauseMenuBox();
        overlay.style.display = 'flex';
        window.requestAnimationFrame(() => {
            overlay.classList.add('is-visible');
        });

        updatePauseState();
    };

    window.closePauseMenu = function() {
        const overlay = document.getElementById('pause-menu-overlay');
        if (!overlay) {
            return;
        }

        window.isPauseMenuOpen = false;
        overlay.classList.remove('is-visible');
        window.setTimeout(() => {
            if (!overlay.classList.contains('is-visible')) {
                overlay.style.display = 'none';
            }
        }, PAUSE_ANIMATION_MS);
        showPauseMenuBox();
        updatePauseState();
    };

    window.togglePauseMenuSettings = function() {
        if (isSettingsPanelVisible()) {
            window.closeSettings({ keepPauseOverlay: true, restorePauseMenuBox: true });
            return;
        }

        hidePauseMenuBox();
        window.openSettings({ showPauseOverlay: true, pauseMenuOrigin: true });
    };

    window.openGammaTestOverlay = function() {
        const overlay = document.getElementById('gamma-test-overlay');
        if (overlay) {
            overlay.classList.add('is-visible');
        }
    };

    window.closeGammaTestOverlay = function() {
        const overlay = document.getElementById('gamma-test-overlay');
        if (overlay) {
            overlay.classList.remove('is-visible');
        }
    };

    window.onWindowModeChange = async function(mode) {
        window.gameSettings.video.windowMode = mode;
        await applyWindowMode(window.gameSettings.video.windowMode, window.gameSettings.video.resolution);
        await persistSettings();
        window.updateSettingsUI();
    };

    window.onResolutionChange = async function(resolution) {
        window.gameSettings.video.resolution = resolution;
        await applyWindowMode(window.gameSettings.video.windowMode, window.gameSettings.video.resolution);
        await persistSettings();
        window.updateSettingsUI();
    };

    window.onGammaChange = function(value) {
        const gammaMultiplier = gammaUnitToMultiplier(value);
        window.gameSettings.video.gamma = gammaMultiplier;
        window.applyDisplaySettings();
        persistSettings();
        window.updateSettingsUI();
    };

    window.onSfxVolumeChange = function(value) {
        window.gameSettings.audio.sfxVolume = clampVolume(Number(value) / 100, DEFAULT_SETTINGS.audio.sfxVolume);
        window.applyAudioSettings();
        persistSettings();
        window.updateSettingsUI();
    };

    window.onMusicVolumeChange = function(value) {
        window.gameSettings.audio.musicVolume = clampAmbientVolume(Number(value) / 100, DEFAULT_SETTINGS.audio.musicVolume);
        window.applyAudioSettings();
        persistSettings();
        window.updateSettingsUI();
    };

    window.onClickSoundToggleChange = function(value) {
        window.gameSettings.audio.clickSoundEnabled = value !== 'disabled';
        persistSettings();
        window.updateSettingsUI();
    };

    // The slider is the multiplier x100 (20..300, step 5).
    window.onMouseSensitivityChange = function(value) {
        window.setTheNunMouseSensitivity(Number(value) / 100);
    };

    window.quitGame = async function() {
        // Autosaves are debounced; flush the pending one so the last change is not lost.
        if (typeof window.flushTheNunSaveWrite === 'function') {
            try {
                await window.flushTheNunSaveWrite();
            } catch (error) {
                console.warn('Failed to flush the save before quitting:', error);
            }
        }

        if (window.electronAPI && typeof window.electronAPI.quitGame === 'function') {
            window.electronAPI.quitGame();
            return;
        }
        window.close();
    };

    function bindSettingsControls() {
        const modeSelect = document.getElementById('window-mode-select');
        const resolutionSelect = document.getElementById('resolution-select');
        const gammaSlider = document.getElementById('gamma-slider');
        const gammaTestSlider = document.getElementById('gamma-test-slider');
        const sfxSlider = document.getElementById('sfx-volume-slider');
        const musicSlider = document.getElementById('music-volume-slider');
        const mouseSensitivitySlider = document.getElementById('mouse-sensitivity-slider');
        const clickSoundSelect = document.getElementById('click-sound-select');
        const gammaTestButton = document.getElementById('gamma-test-button');
        const gammaTestCloseButton = document.getElementById('gamma-test-close-button');
        const settingsCloseButton = document.getElementById('settings-close-button');

        if (modeSelect && modeSelect.dataset.bound !== 'true') {
            modeSelect.addEventListener('change', (event) => window.onWindowModeChange(event.target.value));
            modeSelect.dataset.bound = 'true';
        }
        if (resolutionSelect && resolutionSelect.dataset.bound !== 'true') {
            resolutionSelect.addEventListener('change', (event) => window.onResolutionChange(event.target.value));
            resolutionSelect.dataset.bound = 'true';
        }
        if (gammaSlider && gammaSlider.dataset.bound !== 'true') {
            gammaSlider.addEventListener('input', (event) => window.onGammaChange(event.target.value));
            gammaSlider.dataset.bound = 'true';
        }
        if (gammaTestSlider && gammaTestSlider.dataset.bound !== 'true') {
            gammaTestSlider.addEventListener('input', (event) => window.onGammaChange(event.target.value));
            gammaTestSlider.dataset.bound = 'true';
        }
        if (sfxSlider && sfxSlider.dataset.bound !== 'true') {
            sfxSlider.addEventListener('input', (event) => window.onSfxVolumeChange(event.target.value));
            sfxSlider.dataset.bound = 'true';
        }
        if (musicSlider && musicSlider.dataset.bound !== 'true') {
            musicSlider.addEventListener('input', (event) => window.onMusicVolumeChange(event.target.value));
            musicSlider.dataset.bound = 'true';
        }
        if (mouseSensitivitySlider && mouseSensitivitySlider.dataset.bound !== 'true') {
            mouseSensitivitySlider.addEventListener('input', (event) => window.onMouseSensitivityChange(event.target.value));
            mouseSensitivitySlider.dataset.bound = 'true';
        }
        if (clickSoundSelect && clickSoundSelect.dataset.bound !== 'true') {
            clickSoundSelect.addEventListener('change', (event) => window.onClickSoundToggleChange(event.target.value));
            clickSoundSelect.dataset.bound = 'true';
        }
        if (gammaTestButton && gammaTestButton.dataset.bound !== 'true') {
            gammaTestButton.addEventListener('click', () => window.openGammaTestOverlay());
            gammaTestButton.dataset.bound = 'true';
        }
        if (gammaTestCloseButton && gammaTestCloseButton.dataset.bound !== 'true') {
            gammaTestCloseButton.addEventListener('click', () => window.closeGammaTestOverlay());
            gammaTestCloseButton.dataset.bound = 'true';
        }
        if (settingsCloseButton && settingsCloseButton.dataset.bound !== 'true') {
            settingsCloseButton.addEventListener('click', () => {
                window.closeSettings({
                    keepPauseOverlay: window.settingsOpenedFromPauseMenu,
                    restorePauseMenuBox: window.settingsOpenedFromPauseMenu
                });
            });
            settingsCloseButton.dataset.bound = 'true';
        }
    }

    function bindPauseMenuButtons() {
        document.querySelectorAll('[data-pause-action]').forEach((button) => {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.addEventListener('click', () => {
                const action = button.getAttribute('data-pause-action');
                if (action === 'resume') {
                    window.closePauseMenu();
                } else if (action === 'settings') {
                    window.togglePauseMenuSettings();
                } else if (action === 'menu') {
                    window.closePauseMenu();
                    window.returnToTitleScreen();
                } else if (action === 'quit') {
                    window.quitGame();
                }
            });

            button.dataset.bound = 'true';
        });
    }

    function bindKeyboardShortcuts() {
        if (document.body.dataset.settingsHotkeysBound === 'true') {
            return;
        }

        document.addEventListener('keydown', (event) => {
            if (typeof window.isTheNunSavePromptVisible === 'function' && window.isTheNunSavePromptVisible()) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                }
                return;
            }

            if (event.key !== 'Escape') {
                return;
            }

            if (window.isGalleryPopupVisible && window.isGalleryPopupVisible()) {
                if (window.hideGalleryPopup) {
                    window.hideGalleryPopup();
                }
                event.preventDefault();
                return;
            }

            if (isSettingsPanelVisible()) {
                window.closeSettings({
                    keepPauseOverlay: window.settingsOpenedFromPauseMenu,
                    restorePauseMenuBox: window.settingsOpenedFromPauseMenu
                });
                event.preventDefault();
                return;
            }

            if (window.isGalleryVisible && window.isGalleryVisible()) {
                window.closeGallery();
                event.preventDefault();
                return;
            }

            if (!isGameplayViewActive()) {
                return;
            }

            if (isPauseMenuVisible()) {
                window.closePauseMenu();
            } else {
                window.openPauseMenu();
            }
            event.preventDefault();
        });

        document.body.dataset.settingsHotkeysBound = 'true';
    }

    window.settingsLoadedPromise = null;
    window.settingsLoaded = false;
    window.settingsOpenedFromPauseMenu = false;
    window.gameSettings = createFreshSettings();

    window.createTheNunFreshSettings = function() {
        return createFreshSettings();
    };

    window.getTheNunPersistedSettings = function() {
        return normalizeSettings(window.gameSettings);
    };

    window.applyTheNunPersistedSettings = async function(nextSettings) {
        return applySettingsState(nextSettings);
    };

    // The tutorial's sandbox vigil (scripts/tutorial.js) writes no record and no run.
    function isTutorialRun() {
        return typeof window.isTheNunTutorialActive === 'function' && window.isTheNunTutorialActive();
    }

    window.recordTheNunRunProgress = function(round, zone) {
        if (isTutorialRun()) {
            return false;
        }
        const candidate = {
            bestRound: Math.max(1, Number(round) || 1),
            bestZone: Math.max(1, Math.min(5, Number(zone) || 1))
        };

        if (!isHigherBestRecord(candidate, window.gameSettings?.stats)) {
            return false;
        }

        window.gameSettings.stats = normalizeBestRecord(candidate);
        persistSettings();
        window.updateSettingsUI();
        return true;
    };

    window.getTheNunProgress = function() {
        return normalizeProgress(window.gameSettings && window.gameSettings.progress);
    };

    // Apply `mutate(progress)` to the lifetime progress and persist it.
    window.updateTheNunProgress = function(mutate) {
        const progress = normalizeProgress(window.gameSettings && window.gameSettings.progress);
        if (typeof mutate === 'function') {
            mutate(progress);
        }
        window.gameSettings.progress = normalizeProgress(progress);
        persistSettings();
        return window.gameSettings.progress;
    };

    window.getTheNunSavedRun = function() {
        return normalizeRun(window.gameSettings && window.gameSettings.run);
    };

    window.setTheNunSavedRun = function(run) {
        if (isTutorialRun()) {
            return window.gameSettings.run;
        }
        window.gameSettings.run = normalizeRun(run);
        persistSettings();
        return window.gameSettings.run;
    };

    window.loadSettings = async function() {
        if (window.settingsLoadedPromise) {
            return window.settingsLoadedPromise;
        }

        window.settingsLoadedPromise = (async function() {
            let storedSettings = null;

            try {
                storedSettings = JSON.parse(window.localStorage.getItem(getSettingsStorageKey()) || 'null');
            } catch (error) {
                storedSettings = null;
            }

            if (!storedSettings) {
                storedSettings = await loadLegacySave();
            }

            await applySettingsState(storedSettings || DEFAULT_SETTINGS);
            window.settingsLoaded = true;

            // Resolve language only after settings exist: a saved manual choice
            // wins, otherwise English. No Steam and no OS auto-detect - see i18n.js.
            if (typeof window.resolveStartupLanguage === 'function') {
                try {
                    await window.resolveStartupLanguage();
                } catch (error) {
                    console.error('Failed to resolve startup language.', error);
                }
                populateLanguageSelect();
            }
        })();

        return window.settingsLoadedPromise;
    };

    // window.setLanguage persists the player's manual choice through this hook.
    window.saveSettings = function() {
        return persistSettings();
    };
})();
