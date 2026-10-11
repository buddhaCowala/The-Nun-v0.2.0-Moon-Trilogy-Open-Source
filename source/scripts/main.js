/**
 * Main game initialization and orchestration
 */

// Global game systems
let gameState;
let lightingSystem;
let collectiblesSystem;
let demonAttacksSystem;
let nunSystem;
let uiController;

const AMBIENT_CHARACTER_SOUND_VARIANTS = [
    { id: 'ambient-breathing-1', weight: 3 },
    { id: 'ambient-breathing-2', weight: 3 },
    { id: 'ambient-sniff-1', weight: 2 },
    { id: 'ambient-sniff-2', weight: 2 }
];
const AMBIENT_CHARACTER_SOUND_TIMING = {
    initialMinDelayMs: 14000,
    initialMaxDelayMs: 24000,
    repeatMinDelayMs: 28000,
    repeatMaxDelayMs: 52000
};
const AMBIENT_CHARACTER_AUDIO_SYNC_INTERVAL_MS = 250;
const ambientCharacterAudioState = {
    isRunning: false,
    timeoutId: null,
    timeoutStartedAtMs: 0,
    remainingDelayMs: null,
    syncIntervalId: null,
    lastSoundId: null
};

function randomBetween(min, max) {
    return Math.round(min + (Math.random() * (max - min)));
}

function getGameplayRoot() {
    return document.getElementById('game-container');
}

function isGameplayRuntimeVisible() {
    const gameplayRoot = getGameplayRoot();
    if (!gameplayRoot) {
        return false;
    }

    return gameplayRoot.style.display !== 'none' && !gameplayRoot.classList.contains('hidden');
}

function isVisibleGameplayOverlayActive(overlayId) {
    const overlayElement = document.getElementById(overlayId);
    if (!overlayElement) {
        return false;
    }

    return overlayElement.style.display !== 'none' && !overlayElement.classList.contains('hidden');
}

function shouldRunAmbientCharacterAudio() {
    const inActiveZoneRange = Number(window.gameState?.currentZone) >= 1 && Number(window.gameState?.currentZone) <= 5;
    const altarScreenVisible = isVisibleGameplayOverlayActive('altar-screen');

    return isGameplayRuntimeVisible()
        && inActiveZoneRange
        && !window.gameState?.isTimePaused
        && !window.gameState?.isAtAltar
        && !window.gameState?.isPowerStruggle
        && !window.gameState?.gameOver
        && !window.uiController?.zoneForwardTransitionActive
        && !altarScreenVisible
        && !isVisibleGameplayOverlayActive('phase-intro-overlay')
        && !isVisibleGameplayOverlayActive('nun-overlay')
        && !isVisibleGameplayOverlayActive('attack-caught-overlay')
        && !isVisibleGameplayOverlayActive('power-struggle-screen')
        && !isVisibleGameplayOverlayActive('ending-scene')
        && !isVisibleGameplayOverlayActive('victory-screen')
        && !isVisibleGameplayOverlayActive('game-over-screen');
}

function getAmbientCharacterAudioElement(soundId) {
    return document.getElementById(soundId);
}

function clearAmbientCharacterAudioTimer() {
    if (ambientCharacterAudioState.timeoutId != null) {
        window.clearTimeout(ambientCharacterAudioState.timeoutId);
        ambientCharacterAudioState.timeoutId = null;
    }

    ambientCharacterAudioState.timeoutStartedAtMs = 0;
}

function clearAmbientCharacterAudioSyncInterval() {
    if (ambientCharacterAudioState.syncIntervalId != null) {
        window.clearInterval(ambientCharacterAudioState.syncIntervalId);
        ambientCharacterAudioState.syncIntervalId = null;
    }
}

function pauseAmbientCharacterAudioPlayback() {
    AMBIENT_CHARACTER_SOUND_VARIANTS.forEach(({ id }) => {
        const audioElement = getAmbientCharacterAudioElement(id);
        if (!audioElement) {
            return;
        }

        if (!audioElement.paused && !audioElement.ended) {
            audioElement.dataset.ambientResumePending = 'true';
        }

        audioElement.pause();
    });
}

function resumeAmbientCharacterAudioPlayback() {
    if (!shouldRunAmbientCharacterAudio()) {
        return;
    }

    let shouldApplySettings = true;

    AMBIENT_CHARACTER_SOUND_VARIANTS.forEach(({ id }) => {
        const audioElement = getAmbientCharacterAudioElement(id);
        if (!audioElement || audioElement.dataset.ambientResumePending !== 'true') {
            return;
        }

        audioElement.dataset.ambientResumePending = 'false';

        if (shouldApplySettings && typeof window.applyAudioSettings === 'function') {
            window.applyAudioSettings();
            shouldApplySettings = false;
        }

        const playPromise = audioElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    });
}

function resetAmbientCharacterAudioPlayback() {
    AMBIENT_CHARACTER_SOUND_VARIANTS.forEach(({ id }) => {
        const audioElement = getAmbientCharacterAudioElement(id);
        if (!audioElement) {
            return;
        }

        audioElement.pause();
        audioElement.dataset.ambientResumePending = 'false';

        try {
            audioElement.currentTime = 0;
        } catch (error) {
            console.warn('Failed to reset ambient character audio time:', error);
        }
    });
}

function pickAmbientCharacterSoundVariant() {
    const availableVariants = AMBIENT_CHARACTER_SOUND_VARIANTS.filter(({ id }) => id !== ambientCharacterAudioState.lastSoundId);
    const variantsPool = availableVariants.length > 0 ? availableVariants : AMBIENT_CHARACTER_SOUND_VARIANTS;
    const totalWeight = variantsPool.reduce((sum, variant) => sum + variant.weight, 0);
    let targetWeight = Math.random() * totalWeight;

    for (const variant of variantsPool) {
        targetWeight -= variant.weight;
        if (targetWeight <= 0) {
            return variant;
        }
    }

    return variantsPool[variantsPool.length - 1] ?? null;
}

function getAmbientCharacterAudioDelay(options = {}) {
    const isInitialSchedule = options.initial === true;
    const minDelayMs = isInitialSchedule
        ? AMBIENT_CHARACTER_SOUND_TIMING.initialMinDelayMs
        : AMBIENT_CHARACTER_SOUND_TIMING.repeatMinDelayMs;
    const maxDelayMs = isInitialSchedule
        ? AMBIENT_CHARACTER_SOUND_TIMING.initialMaxDelayMs
        : AMBIENT_CHARACTER_SOUND_TIMING.repeatMaxDelayMs;

    return randomBetween(minDelayMs, maxDelayMs);
}

function armAmbientCharacterAudioTimer() {
    if (!ambientCharacterAudioState.isRunning || ambientCharacterAudioState.timeoutId != null) {
        return;
    }

    if (ambientCharacterAudioState.remainingDelayMs == null) {
        return;
    }

    if (!shouldRunAmbientCharacterAudio()) {
        return;
    }

    if (ambientCharacterAudioState.remainingDelayMs <= 0) {
        ambientCharacterAudioState.remainingDelayMs = 0;
        playAmbientCharacterSound();
        return;
    }

    ambientCharacterAudioState.timeoutStartedAtMs = Date.now();
    ambientCharacterAudioState.timeoutId = window.setTimeout(() => {
        ambientCharacterAudioState.timeoutId = null;
        ambientCharacterAudioState.timeoutStartedAtMs = 0;
        ambientCharacterAudioState.remainingDelayMs = 0;
        playAmbientCharacterSound();
    }, ambientCharacterAudioState.remainingDelayMs);
}

function pauseAmbientCharacterAudioTimer() {
    if (ambientCharacterAudioState.timeoutId == null) {
        return;
    }

    const elapsedMs = Math.max(0, Date.now() - ambientCharacterAudioState.timeoutStartedAtMs);
    ambientCharacterAudioState.remainingDelayMs = Math.max(0, Number(ambientCharacterAudioState.remainingDelayMs) - elapsedMs);
    clearAmbientCharacterAudioTimer();
}

function scheduleAmbientCharacterAudio(options = {}) {
    clearAmbientCharacterAudioTimer();

    if (!ambientCharacterAudioState.isRunning) {
        return;
    }

    ambientCharacterAudioState.remainingDelayMs = getAmbientCharacterAudioDelay(options);
    armAmbientCharacterAudioTimer();
}

function syncAmbientCharacterAudioState() {
    if (!ambientCharacterAudioState.isRunning) {
        return;
    }

    if (shouldRunAmbientCharacterAudio()) {
        resumeAmbientCharacterAudioPlayback();
        armAmbientCharacterAudioTimer();
        return;
    }

    pauseAmbientCharacterAudioTimer();
    pauseAmbientCharacterAudioPlayback();
}

function ensureAmbientCharacterAudioSyncInterval() {
    if (ambientCharacterAudioState.syncIntervalId != null) {
        return;
    }

    ambientCharacterAudioState.syncIntervalId = window.setInterval(syncAmbientCharacterAudioState, AMBIENT_CHARACTER_AUDIO_SYNC_INTERVAL_MS);
}

function playAmbientCharacterSound() {
    if (!ambientCharacterAudioState.isRunning) {
        return;
    }

    if (!shouldRunAmbientCharacterAudio()) {
        armAmbientCharacterAudioTimer();
        return;
    }

    const variant = pickAmbientCharacterSoundVariant();
    const audioElement = variant ? getAmbientCharacterAudioElement(variant.id) : null;
    if (!variant || !audioElement) {
        scheduleAmbientCharacterAudio();
        return;
    }

    ambientCharacterAudioState.lastSoundId = variant.id;

    if (typeof window.applyAudioSettings === 'function') {
        window.applyAudioSettings();
    }

    audioElement.dataset.ambientResumePending = 'false';
    audioElement.currentTime = 0;
    const playPromise = audioElement.play();

    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {}).finally(() => {
            scheduleAmbientCharacterAudio();
        });
        return;
    }

    scheduleAmbientCharacterAudio();
}

function startAmbientCharacterAudio() {
    ambientCharacterAudioState.isRunning = true;
    ambientCharacterAudioState.remainingDelayMs = null;
    clearAmbientCharacterAudioTimer();
    clearAmbientCharacterAudioSyncInterval();
    resetAmbientCharacterAudioPlayback();
    ensureAmbientCharacterAudioSyncInterval();
    scheduleAmbientCharacterAudio({ initial: true });
    syncAmbientCharacterAudioState();
}

function resetAmbientCharacterAudioCycle() {
    if (!ambientCharacterAudioState.isRunning) {
        return;
    }

    clearAmbientCharacterAudioTimer();
    resetAmbientCharacterAudioPlayback();
    scheduleAmbientCharacterAudio({ initial: true });
    syncAmbientCharacterAudioState();
}

function stopAmbientCharacterAudio() {
    ambientCharacterAudioState.isRunning = false;
    ambientCharacterAudioState.remainingDelayMs = null;
    clearAmbientCharacterAudioTimer();
    clearAmbientCharacterAudioSyncInterval();
    resetAmbientCharacterAudioPlayback();
}

window.syncAmbientCharacterAudioState = syncAmbientCharacterAudioState;
window.resetAmbientCharacterAudioCycle = resetAmbientCharacterAudioCycle;

function areGameSystemsInitialized() {
    return Boolean(gameState && lightingSystem && collectiblesSystem && demonAttacksSystem && nunSystem && uiController);
}

function removeTransientOverlays() {
    ['ending-scene', 'victory-screen', 'game-over-screen'].forEach((overlayId) => {
        const overlay = document.getElementById(overlayId);
        if (overlay) {
            overlay.remove();
        }
    });
}

function clearRuntimeReferences() {
    gameState = null;
    lightingSystem = null;
    collectiblesSystem = null;
    demonAttacksSystem = null;
    nunSystem = null;
    uiController = null;

    window.gameState = null;
    window.lightingSystem = null;
    window.collectiblesSystem = null;
    window.demonAttacksSystem = null;
    window.nunSystem = null;
    window.uiController = null;
}

function stopGameplayMedia() {
    const gameplayRoot = getGameplayRoot();
    if (!gameplayRoot) {
        return;
    }

    stopAmbientCharacterAudio();

    gameplayRoot.querySelectorAll('video, audio').forEach((mediaElement) => {
        if (typeof mediaElement.pause === 'function') {
            mediaElement.pause();
        }

        mediaElement.dataset.resumeAfterPause = 'false';

        try {
            mediaElement.currentTime = 0;
        } catch (error) {
            console.warn('Failed to reset gameplay media time:', error);
        }
    });
}

function hideGameplayRuntimeUi() {
    const gameplayRoot = document.getElementById('game-container');
    const mainUi = document.getElementById('main-ui');
    const nunOverlay = document.getElementById('nun-overlay');
    const attackCaughtOverlay = document.getElementById('attack-caught-overlay');
    const powerStruggleScreen = document.getElementById('power-struggle-screen');

    stopGameplayMedia();

    if (gameplayRoot) {
        gameplayRoot.classList.add('hidden');
        gameplayRoot.style.display = 'none';
    }
    if (mainUi) {
        mainUi.style.display = 'none';
    }
    if (nunOverlay) {
        nunOverlay.classList.add('hidden');
    }
    if (attackCaughtOverlay) {
        attackCaughtOverlay.classList.add('hidden');
    }
    if (powerStruggleScreen) {
        powerStruggleScreen.classList.add('hidden');
    }

    const phaseIntroOverlay = document.getElementById('phase-intro-overlay');
    const phaseIntroVideo = document.getElementById('phase-intro-video');
    if (phaseIntroOverlay) {
        phaseIntroOverlay.classList.add('hidden');
    }
    if (phaseIntroVideo) {
        phaseIntroVideo.onended = null;
        phaseIntroVideo.onerror = null;
    }

    if (typeof window.applyAudioSettings === 'function') {
        window.applyAudioSettings();
    }
}

function resetRuntimeState(options = {}) {
    const stopSystems = Boolean(options.stopSystems);

    if (!areGameSystemsInitialized()) {
        return;
    }

    cleanupDemonAttacksSystem(demonAttacksSystem);
    if (stopSystems) {
        cleanupNunSystem(nunSystem);
    } else {
        resetNun(nunSystem, { startApproach: false });
    }

    resetGame(gameState);
    gameState.isTimePaused = false;
    gameState.isPowerStruggle = false;

    resetLights(lightingSystem);
    clearCollectibles(collectiblesSystem);
    hideAltarScreen(uiController);
    updateCounters(uiController);

    const mainUi = document.getElementById('main-ui');
    const nunOverlay = document.getElementById('nun-overlay');
    const attackCaughtOverlay = document.getElementById('attack-caught-overlay');
    const powerStruggleScreen = document.getElementById('power-struggle-screen');

    if (mainUi) {
        mainUi.style.display = 'block';
    }
    if (nunOverlay) {
        nunOverlay.classList.add('hidden');
    }
    if (attackCaughtOverlay) {
        attackCaughtOverlay.classList.add('hidden');
    }
    if (powerStruggleScreen) {
        powerStruggleScreen.classList.add('hidden');
    }

    removeTransientOverlays();
}

/**
 * Initialize the game
 */
function initGame() {
    if (areGameSystemsInitialized()) {
        startGameRuntime();
        return;
    }

    console.log('========================================');
    console.log('     THE NUN - Game Initializing');
    console.log('========================================');
    console.log('Note: All video triggers are logged to console');
    console.log('Replace console logs with actual video playback');
    console.log('========================================');

    // Initialize core systems in order
    gameState = createGameState();
    window.gameState = gameState;

    lightingSystem = createLightingSystem(gameState);
    window.lightingSystem = lightingSystem;

    collectiblesSystem = createCollectiblesSystem(gameState);
    window.collectiblesSystem = collectiblesSystem;

    demonAttacksSystem = createDemonAttacksSystem(gameState);
    window.demonAttacksSystem = demonAttacksSystem;

    nunSystem = createNunSystem(gameState);
    window.nunSystem = nunSystem;

    uiController = createUIController(gameState);
    window.uiController = uiController;

    // The 3D world replaces the 2D candle overlay: stop its full-screen canvas loop.
    if (isWorld3DEnabled() && typeof cleanupLightingSystem === 'function') {
        cleanupLightingSystem(lightingSystem);
    }

    // Load altar progress limits dynamically from reward files
    if (typeof loadAltarProgressLimitsFromRewards === 'function') {
        loadAltarProgressLimitsFromRewards();
    }

    // Start the game
    startGameRuntime();

    console.log('========================================');
    console.log('Game initialized successfully!');
    console.log('========================================');
}

/**
 * Start/restart the game
 */
function startGameRuntime() {
    const gameplayRoot = getGameplayRoot();

    if (areGameSystemsInitialized()) {
        resetRuntimeState();
    }

    // "Continue" hands us a saved run: rebuild that vigil at zone 1. Otherwise this
    // is a brand-new run.
    const pendingRestore = typeof window.consumeTheNunPendingRunRestore === 'function'
        ? window.consumeTheNunPendingRunRestore()
        : null;
    if (pendingRestore && typeof window.applyTheNunRunSnapshot === 'function') {
        window.applyTheNunRunSnapshot(gameState, pendingRestore);
        resetNun(nunSystem, { startApproach: false });
        resetLights(lightingSystem);
        updateCounters(uiController);
    } else if (!isTutorialRun() && typeof window.noteTheNunRunStarted === 'function') {
        // (the tutorial's sandbox vigil is not a run: scripts/tutorial.js)
        window.noteTheNunRunStarted();
    }

    if (gameplayRoot) {
        gameplayRoot.classList.remove('hidden');
        gameplayRoot.style.display = 'block';
    }

    if (typeof window.applyAudioSettings === 'function') {
        window.applyAudioSettings();
    }

    startAmbientCharacterAudio();

    console.log('\n=== GAME STARTED ===');
    console.log(`Phase: ${gameState.currentRound}`);
    console.log(`Zone: ${gameState.currentZone}`);
    console.log(`Nun Clothing State: ${gameState.nunClothingState}/5`);
    console.log('====================\n');

    // Build the vigil's 3D level while its intro plays; the systems start after it.
    window.prepareTheNunVigil(gameState.currentRound);
    if (!isTutorialRun() && typeof window.playPhaseStartIntro === 'function' && uiController) {
        window.playPhaseStartIntro(uiController, window.beginTheNunVigilSystems);
    } else {
        window.beginTheNunVigilSystems();
    }
}

function isTutorialRun() {
    return typeof window.isTheNunTutorialActive === 'function' && window.isTheNunTutorialActive();
}

function isWorld3DEnabled() {
    return Boolean(window.theNun3D && window.theNun3D.isEnabled());
}

// Start a vigil's gameplay: the 3D world (default), or the original 2D zones when
// WebGL is unavailable. Called after every vigil intro (run start and next vigil).
window.beginTheNunVigilSystems = function() {
    if (isWorld3DEnabled()) {
        window.theNun3D.beginVigil(window.gameState);
    } else {
        if (typeof window.startNunApproachTimer === 'function' && window.nunSystem) {
            window.startNunApproachTimer(window.nunSystem);
        }
        spawnCollectiblesForZone(window.collectiblesSystem);
        scheduleRandomAttacks(window.demonAttacksSystem);
    }

    if (window.uiController) {
        updateCounters(window.uiController);
        if (typeof updateAltarRequirements === 'function') {
            updateAltarRequirements(window.uiController);
        }
    }
    if (typeof window.updateTheNunStatsPanel === 'function') {
        window.updateTheNunStatsPanel();
    }
    // The tutorial takes over its sandbox vigil from here (scripts/tutorial.js).
    if (isTutorialRun() && typeof window.theNunTutorial?.onVigilBegun === 'function') {
        window.theNunTutorial.onVigilBegun();
    }
};

window.prepareTheNunVigil = function(phase) {
    if (isWorld3DEnabled()) {
        window.theNun3D.prepareVigil(phase);
    }
};

window.initializeNunRuntime = function() {
    initGame();
};

window.stopNunGameSession = function() {
    if (areGameSystemsInitialized()) {
        cleanupDemonAttacksSystem(demonAttacksSystem);
        cleanupNunSystem(nunSystem);
        clearCollectibles(collectiblesSystem);
        resetLights(lightingSystem);
        hideAltarScreen(uiController);
        removeTransientOverlays();
    }

    hideGameplayRuntimeUi();
    clearRuntimeReferences();

    if (typeof window.updateTheNunStatsPanel === 'function') {
        window.updateTheNunStatsPanel();
    }
};

window.resetNunGameSession = function() {
    resetRuntimeState({ stopSystems: true });

    hideGameplayRuntimeUi();

    if (typeof window.updateTheNunStatsPanel === 'function') {
        window.updateTheNunStatsPanel();
    }
};

/**
 * Window load event
 */
// window.addEventListener('DOMContentLoaded', () => {
//     console.log('DOM loaded, initializing game...');

//     // Small delay to ensure all resources are ready
//     setTimeout(() => {
//         initGame();
//     }, 100);
// });

/**
 * Handle window resize
 */
window.addEventListener('resize', () => {
    // Lighting system handles its own resize
    console.log('Window resized');
});

/**
 * Global error handler
 */
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

/**
 * Unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});

// Cache build config so other systems can read isPackaged synchronously
if (window.electronAPI) {
    window.electronAPI.onBuildConfig(function(config) {
        window.__buildConfig = config;
    });
    window.electronAPI.getBuildConfig().then(function(config) {
        if (!window.__buildConfig) {
            window.__buildConfig = config;
        }
    }).catch(function() {});
}

// Log that main.js has loaded
console.log('Main game script loaded');
