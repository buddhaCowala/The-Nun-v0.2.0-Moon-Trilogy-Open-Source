/**
 * NunSystem - Manages the nun approaching and catching the player
 */

const NUN_DEV_MODE_STORAGE_KEY = 'the-nun-dev-mode-v1';
const DEFAULT_NUN_DEV_MODE = Object.freeze({
    noNunCatch: false
});

const NUN_ROUND_VIDEO_CONFIGS = [
    { maxRound: 1, targetDurationSeconds: 120 },
    { maxRound: 2, targetDurationSeconds: 105 },
    { maxRound: 3, targetDurationSeconds: 90 },
    { maxRound: 4, targetDurationSeconds: 75 },
    { maxRound: 5, targetDurationSeconds: 60 },
    { maxRound: Number.POSITIVE_INFINITY, targetDurationSeconds: 45 }
];
const NUN_LOOK_BACK_ZONE_COUNT = 5;
const NUN_CAUGHT_STAGE_FADE_DURATION_MS = 260;
const NUN_CAUGHT_END_HOLD_MS = 120;
// The drag scene's Continue reappears under the cursor that just dismissed the intro
// loop, so a double click (or the click that re-enters the 3D world's pointer lock)
// used to end the run before the drag was ever seen. Hold the button back this long.
const NUN_CAUGHT_DRAG_CONTINUE_DELAY_MS = 1500;
const NUN_WALK_AUDIO_SOURCE = 'assets/sounds/nunwalks.mp3';

function normalizeNunDevMode(devMode) {
    if (typeof devMode === 'boolean') {
        return {
            ...DEFAULT_NUN_DEV_MODE,
            noNunCatch: devMode
        };
    }

    if (typeof devMode === 'string') {
        const normalizedValue = devMode.trim().toLowerCase();
        if (normalizedValue === 'true' || normalizedValue === 'false') {
            return {
                ...DEFAULT_NUN_DEV_MODE,
                noNunCatch: normalizedValue === 'true'
            };
        }
    }

    const safeDevMode = devMode && typeof devMode === 'object' ? devMode : {};

    return {
        ...DEFAULT_NUN_DEV_MODE,
        noNunCatch: safeDevMode.noNunCatch === true
    };
}

function readNunDevMode() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { ...DEFAULT_NUN_DEV_MODE };
    }

    if (window.__buildConfig && window.__buildConfig.isPackaged) {
        return { ...DEFAULT_NUN_DEV_MODE };
    }

    try {
        const rawStoredDevMode = window.localStorage.getItem(NUN_DEV_MODE_STORAGE_KEY);
        if (rawStoredDevMode == null) {
            return { ...DEFAULT_NUN_DEV_MODE };
        }

        const storedDevMode = JSON.parse(rawStoredDevMode);
        return normalizeNunDevMode(storedDevMode);
    } catch (error) {
        console.warn('Failed to read nun dev mode settings:', error);
        return { ...DEFAULT_NUN_DEV_MODE };
    }
}

function writeNunDevMode(devMode) {
    const nextDevMode = normalizeNunDevMode(devMode);

    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(NUN_DEV_MODE_STORAGE_KEY, JSON.stringify(nextDevMode));
    }

    if (typeof window !== 'undefined') {
        window.theNunDevMode = nextDevMode;
    }

    return nextDevMode;
}

function getNunDevMode() {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_NUN_DEV_MODE };
    }

    if (!window.theNunDevMode) {
        window.theNunDevMode = readNunDevMode();
    }

    return normalizeNunDevMode(window.theNunDevMode);
}

function isNunCatchDisabled() {
    return getNunDevMode().noNunCatch;
}

if (typeof window !== 'undefined') {
    window.getNunDevMode = getNunDevMode;
    window.setNunDevMode = function(devMode) {
        return writeNunDevMode({
            ...getNunDevMode(),
            ...(devMode && typeof devMode === 'object' ? devMode : {})
        });
    };
    window.toggleNoNunCatchDevMode = function(forceValue) {
        const nextValue = typeof forceValue === 'boolean'
            ? forceValue
            : !isNunCatchDisabled();
        const nextDevMode = writeNunDevMode({
            ...getNunDevMode(),
            noNunCatch: nextValue
        });

        console.log(`[DEBUG] No nun catch dev mode ${nextDevMode.noNunCatch ? 'enabled' : 'disabled'}`);

        return nextDevMode;
    };
}

function getNunRoundVideoConfig(round) {
    return NUN_ROUND_VIDEO_CONFIGS.find((entry) => round <= entry.maxRound) || NUN_ROUND_VIDEO_CONFIGS[NUN_ROUND_VIDEO_CONFIGS.length - 1];
}

function getConfiguredNunScenePhase(kind, phase, fallbackMax = 5) {
    const configuredCount = typeof window.getTheNunSceneVariationCount === 'function'
        ? window.getTheNunSceneVariationCount(kind, fallbackMax)
        : fallbackMax;
    const safeMax = Math.max(1, Number(configuredCount) || fallbackMax || 1);
    return Math.max(1, Math.min(safeMax, Number(phase) || 1));
}

function getConfiguredNunAttackVariationCount(kind, fallbackValue = 1) {
    const configuredCount = typeof window.getTheNunSceneVariationCount === 'function'
        ? window.getTheNunSceneVariationCount(kind, fallbackValue)
        : fallbackValue;
    return Math.max(1, Number(configuredCount) || fallbackValue || 1);
}

function getRandomNunAttackVariationIndex(kind, fallbackValue = 1) {
    const availableVariationCount = getConfiguredNunAttackVariationCount(kind, fallbackValue);
    return Math.max(1, Math.floor(Math.random() * availableVariationCount) + 1);
}

function clampAttackOutfitPhase(phase) {
    return Math.max(1, Math.min(5, Number(phase) || 1));
}

function buildNunDragSceneSource(variationIndex, phase) {
    const safeVariationIndex = Math.max(1, Number(variationIndex) || 1);
    const safePhase = clampAttackOutfitPhase(phase);
    const baseStem = safeVariationIndex === 1 ? '3AG' : `3AG${safeVariationIndex}`;

    if (safePhase === 1) {
        return `assets/scenes/attacks/${baseStem}.mp4`;
    }

    return `assets/scenes/attacks/${baseStem}V${safePhase}.mp4`;
}

function buildNunIntroSceneSource(variationIndex, phase) {
    const safeVariationIndex = Math.max(1, Number(variationIndex) || 1);
    const safePhase = clampAttackOutfitPhase(phase);
    const baseStem = `3AN${safeVariationIndex}`;

    if (safePhase === 1) {
        return `assets/scenes/attacks/${baseStem}.mp4`;
    }

    return `assets/scenes/attacks/${baseStem}V${safePhase}.mp4`;
}

function getNunLookBackPhase(round) {
    return getConfiguredNunScenePhase('nunWalk', round, 5);
}

function getNunLookBackZone(zone) {
    return Math.max(1, Math.min(NUN_LOOK_BACK_ZONE_COUNT, Number(zone) || 1));
}

function getNunLookBackSource(zone, phase) {
    const safeZone = getNunLookBackZone(zone);
    const safePhase = getNunLookBackPhase(phase);

    if (safePhase === 1) {
        return `assets/scenes/others/3ZN${safeZone}.mp4`;
    }

    return `assets/scenes/others/3ZN${safeZone}V${safePhase}.mp4`;
}

// The vigil's OUTFIT (V1..V5 on disk, clampAttackOutfitPhase) — never the update
// manager's per-scene VARIATION count, which counts 3AN1/2/3, not V2..V5. Clamping the
// phase with it pinned the drag to 3AG.mp4 (vigil-1 outfit) for every vigil and stopped
// the intro at V3.
function getNunCaughtSceneSource(phase, variationIndex = 1) {
    return buildNunDragSceneSource(variationIndex, phase);
}

function getNunCaughtIntroSceneSource(phase, variationIndex = 1) {
    return buildNunIntroSceneSource(variationIndex, phase);
}

function markGallerySceneSeenBySource(source) {
    if (typeof window.markTheNunGallerySceneSeenBySource === 'function') {
        window.markTheNunGallerySceneSeenBySource(source);
    }
}

function ensureNunWalkAudio(system) {
    if (!system) {
        return null;
    }

    if (!system.nunWalkAudio) {
        const audio = new Audio(NUN_WALK_AUDIO_SOURCE);
        audio.preload = 'auto';
        const sfxVolume = Number(window.gameSettings?.audio?.sfxVolume);
        audio.volume = Number.isFinite(sfxVolume) && sfxVolume >= 0 ? sfxVolume : 0.55;
        system.nunWalkAudio = audio;

        // Register so applyAudioSettings can update the volume live.
        if (!window.__nunWalkAudioInstances) {
            window.__nunWalkAudioInstances = new Set();
        }
        window.__nunWalkAudioInstances.add(audio);
    }

    return system.nunWalkAudio;
}

function isNunWalkAudioSource(source) {
    return /(?:^|\/)3AG(?:\d+)?(?:V\d+)?\.mp4(?:$|[?#])/i.test(String(source || ''));
}

function pauseNunWalkAudio(system, options = {}) {
    if (!system || !system.nunWalkAudio) {
        return;
    }

    const shouldReset = options.reset !== false;
    system.nunWalkAudio.pause();

    if (shouldReset) {
        try {
            system.nunWalkAudio.currentTime = 0;
        } catch (error) {
            console.warn('[AUDIO] Unable to reset nun walk audio time:', error);
        }
    }
}

function syncNunWalkAudioPlayback(system, video) {
    const audio = ensureNunWalkAudio(system);
    if (!audio) {
        return;
    }

    const source = video && (video.dataset.nunSource || video.currentSrc || video.getAttribute('src'));
    const shouldPlay = Boolean(
        video
        && system
        && system.isPlayingNunCaughtScene
        && Number(video.dataset.nunZone) === system.activeNunZone
        && isNunWalkAudioSource(source)
        && !video.paused
        && !video.ended
        && video.readyState >= 2
    );

    if (!shouldPlay) {
        pauseNunWalkAudio(system, { reset: false });
        return;
    }

    if (audio.playbackRate !== video.playbackRate) {
        audio.playbackRate = video.playbackRate;
        audio.defaultPlaybackRate = video.defaultPlaybackRate;
    }

    const targetTime = Math.max(0, Number(video.currentTime) || 0);
    if (Math.abs((Number(audio.currentTime) || 0) - targetTime) > 0.12) {
        try {
            audio.currentTime = targetTime;
        } catch (error) {
            console.warn('[AUDIO] Unable to sync nun walk audio time:', error);
        }
    }

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
    }
}

function shouldAdvanceNun(system) {
    const transitionActive = Boolean(window.uiController && window.uiController.zoneForwardTransitionActive);
    return system.approachStarted && system.isApproaching && !system.gameState.isAtAltar && !system.gameState.isTimePaused && !system.gameState.gameOver && !transitionActive;
}

function pauseNunVideo(system) {
    if (!Array.isArray(system.nunVideos) || system.nunVideos.length === 0) {
        pauseNunWalkAudio(system, { reset: false });
        return;
    }

    system.nunVideos.forEach((video) => {
        if (video) {
            video.pause();
        }
    });

    pauseNunWalkAudio(system, { reset: false });
}

function getActiveNunVideo(system) {
    if (!Array.isArray(system.nunVideos) || system.nunVideos.length === 0) {
        return null;
    }

    return system.nunVideos.find((video) => Number(video.dataset.nunZone) === system.activeNunZone) || null;
}

function playNunVideo(system) {
    if (!Array.isArray(system.nunVideos) || system.nunVideos.length === 0) {
        return;
    }

    if (system.isPlayingNunCaughtScene) {
        const activeVideo = getActiveNunVideo(system);
        if (!activeVideo) {
            pauseNunWalkAudio(system);
            return;
        }

        const playPromise = activeVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
        syncNunWalkAudioPlayback(system, activeVideo);
        return;
    }

    pauseNunWalkAudio(system, { reset: false });

    system.nunVideos.forEach((video) => {
        if (!video) {
            return;
        }

        if (Number(video.dataset.nunZone) !== system.activeNunZone) {
            video.pause();
            return;
        }

        markGallerySceneSeenBySource(video.dataset.nunSource || video.currentSrc || video.getAttribute('src'));

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    });
}

function syncNunVideoPlayback(system) {
    if (system.isPlayingNunCaughtScene) {
        if (system.gameState?.isTimePaused) {
            return;
        }
        playNunVideo(system);
        return;
    }

    if (shouldAdvanceNun(system)) {
        playNunVideo(system);
        return;
    }

    pauseNunVideo(system);
}

function applyNunVideoTiming(system, video) {
    if (!video) {
        return;
    }

    const nunVideoSpeed = video.dataset.nunMode === 'caught'
        ? 1
        : getDifficulty(system.gameState).nunVideoSpeed;
    video.defaultPlaybackRate = nunVideoSpeed;
    video.playbackRate = nunVideoSpeed;

    if (system.restartVideoOnReady) {
        try {
            video.currentTime = 0;
        } catch (error) {
            console.warn('[VIDEO] Unable to reset nun video time:', error);
        }
    }

    syncNunVideoPlayback(system);
}

function updateVisibleNunZone(system) {
    if (!Array.isArray(system.nunVideos) || system.nunVideos.length === 0) {
        return;
    }

    const previousVideo = getActiveNunVideo(system);
    const previousTime = previousVideo ? Number(previousVideo.currentTime) || 0 : 0;
    const activeZone = getNunLookBackZone(system.gameState && system.gameState.currentZone);
    const previousZone = system.activeNunZone;
    system.activeNunZone = activeZone;

    system.nunVideos.forEach((video) => {
        if (!video) {
            return;
        }

        video.classList.toggle('is-visible', Number(video.dataset.nunZone) === activeZone);
    });

    if (!system.isPlayingNunCaughtScene && previousZone !== activeZone) {
        const activeVideo = getActiveNunVideo(system);
        if (activeVideo) {
            const duration = Number(activeVideo.duration);
            if (Number.isFinite(duration) && duration > 0) {
                try {
                    activeVideo.currentTime = Math.max(0, Math.min(previousTime, Math.max(0, duration - 0.05)));
                } catch (error) {
                    console.warn('[VIDEO] Unable to sync nun zone video time:', error);
                }
            }

            if (activeVideo.ended) {
                playNunCaughtScene(system);
                return;
            }

            if (Number.isFinite(duration) && duration > 0 && previousTime >= duration) {
                playNunCaughtScene(system);
                return;
            }
        }
        syncNunVideoPlayback(system);
    }
}

function clearNunCaughtContinueRevealTimer(system) {
    if (system && system.nunCaughtContinueRevealTimer) {
        clearTimeout(system.nunCaughtContinueRevealTimer);
        system.nunCaughtContinueRevealTimer = null;
    }
}

function setNunCaughtContinueVisible(system, isVisible) {
    if (!system || !system.nunCaughtContinueButton) {
        return;
    }

    clearNunCaughtContinueRevealTimer(system);
    system.nunCaughtContinueButton.classList.toggle('hidden', !isVisible);
}

// Show Continue only once the stage has been on screen a moment (see
// NUN_CAUGHT_DRAG_CONTINUE_DELAY_MS).
function scheduleNunCaughtContinueReveal(system, stage, delayMs) {
    if (!system) {
        return;
    }

    setNunCaughtContinueVisible(system, false);
    system.nunCaughtContinueRevealTimer = setTimeout(() => {
        system.nunCaughtContinueRevealTimer = null;
        if (system.isPlayingNunCaughtScene && system.nunCaughtSceneStage === stage) {
            setNunCaughtContinueVisible(system, true);
        }
    }, Math.max(0, Number(delayMs) || 0));
}

function clearNunCaughtStageTransition(system) {
    if (!system) {
        return;
    }

    if (system.nunCaughtStageTransitionTimer) {
        clearTimeout(system.nunCaughtStageTransitionTimer);
        system.nunCaughtStageTransitionTimer = null;
    }

    system.isTransitioningNunCaughtStage = false;

    if (system.nunOverlay) {
        system.nunOverlay.classList.remove('is-stage-fading-out', 'is-stage-fading-in');
    }
}

function clearNunCaughtReturnTimer(system) {
    if (!system) {
        return;
    }

    if (system.nunCaughtReturnTimer) {
        clearTimeout(system.nunCaughtReturnTimer);
        system.nunCaughtReturnTimer = null;
    }
}

function getNunCaughtPhase(system) {
    return system.activeNunPhase || (system.gameState && system.gameState.currentRound) || 1;
}

function loadNunCaughtStage(system, video, stage, options = {}) {
    if (!system || !video) {
        return;
    }

    const phase = getNunCaughtPhase(system);
    const isIntroStage = stage === 'intro';
    const showContinueButton = isIntroStage || stage === 'drag';
    const variationIndex = isIntroStage
        ? (system.activeNunIntroVariationIndex || 1)
        : (system.activeNunDragVariationIndex || 1);
    const nextSource = (isIntroStage
        ? system.activeNunIntroSceneSource
        : system.activeNunDragSceneSource) || (isIntroStage
        ? getNunCaughtIntroSceneSource(phase, variationIndex)
        : getNunCaughtSceneSource(phase, variationIndex));
    const onReady = typeof options.onReady === 'function' ? options.onReady : null;

    window.stopAttackSlideLoopSfx?.(video);
    pauseNunWalkAudio(system);

    system.nunCaughtSceneStage = stage;
    video.dataset.nunMode = 'caught';
    video.dataset.nunSource = nextSource;
    video.loop = isIntroStage;
    markGallerySceneSeenBySource(nextSource);
    setNunCaughtContinueVisible(system, false);
    video.src = nextSource;
    video.load();

    const playCaughtScene = () => {
        applyNunVideoTiming(system, video);
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                console.warn(`[VIDEO] Nun caught ${stage} scene could not play (${nextSource}):`, error);
                // Only a dead INTRO ends the run. A drag that will not start (a missing
                // file, or an AbortError from a load racing the play) must not close the
                // run behind the player's single Continue click: hold the screen and let
                // them end it themselves.
                if (isIntroStage) {
                    returnToMenuAfterNunCaught(system);
                    return;
                }
                setNunCaughtContinueVisible(system, true);
            });
        }

        if (showContinueButton && !isIntroStage) {
            scheduleNunCaughtContinueReveal(system, stage, NUN_CAUGHT_DRAG_CONTINUE_DELAY_MS);
        } else {
            setNunCaughtContinueVisible(system, showContinueButton);
        }

        if (isIntroStage) {
            window.startAttackSlideLoopSfx?.(video);
        }

        if (onReady) {
            onReady();
        }
    };

    if (video.readyState >= 1) {
        playCaughtScene();
        return;
    }

    video.addEventListener('loadedmetadata', playCaughtScene, { once: true });
}

function transitionToNunCaughtStage(system, video, stage) {
    if (!system || !video) {
        return;
    }

    if (!system.nunOverlay) {
        loadNunCaughtStage(system, video, stage);
        return;
    }

    clearNunCaughtStageTransition(system);
    system.isTransitioningNunCaughtStage = true;
    setNunCaughtContinueVisible(system, false);
    system.nunOverlay.classList.add('is-stage-fading-out');

    system.nunCaughtStageTransitionTimer = setTimeout(() => {
        system.nunCaughtStageTransitionTimer = null;

        loadNunCaughtStage(system, video, stage, {
            onReady: () => {
                if (!system.nunOverlay) {
                    system.isTransitioningNunCaughtStage = false;
                    return;
                }

                system.nunOverlay.classList.remove('is-stage-fading-out');

                if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(() => {
                        if (!system.nunOverlay) {
                            system.isTransitioningNunCaughtStage = false;
                            return;
                        }

                        system.nunOverlay.classList.add('is-stage-fading-in');
                        system.nunCaughtStageTransitionTimer = setTimeout(() => {
                            if (system.nunOverlay) {
                                system.nunOverlay.classList.remove('is-stage-fading-in');
                            }

                            system.nunCaughtStageTransitionTimer = null;
                            system.isTransitioningNunCaughtStage = false;
                        }, NUN_CAUGHT_STAGE_FADE_DURATION_MS);
                    });
                    return;
                }

                system.isTransitioningNunCaughtStage = false;
            }
        });
    }, NUN_CAUGHT_STAGE_FADE_DURATION_MS);
}

function skipNunCaughtIntro(system) {
    if (!system || !system.isPlayingNunCaughtScene || system.nunCaughtSceneStage !== 'intro') {
        return;
    }

    const activeVideo = getActiveNunVideo(system);
    if (!activeVideo) {
        returnToMenuAfterNunCaught(system);
        return;
    }

    window.stopAttackSlideLoopSfx?.(activeVideo);

    transitionToNunCaughtStage(system, activeVideo, 'drag');
}

function returnToMenuAfterNunCaught(system) {
    if (!system) {
        return;
    }

    clearNunCaughtReturnTimer(system);
    completeNunCaughtReturnToMenu(system);
}

function scheduleNunCaughtReturnToMenu(system, delayMs = NUN_CAUGHT_END_HOLD_MS) {
    if (!system) {
        return;
    }

    clearNunCaughtReturnTimer(system);

    const safeDelayMs = Math.max(0, Number(delayMs) || 0);
    if (safeDelayMs === 0) {
        completeNunCaughtReturnToMenu(system);
        return;
    }

    system.nunCaughtReturnTimer = setTimeout(() => {
        system.nunCaughtReturnTimer = null;
        completeNunCaughtReturnToMenu(system);
    }, safeDelayMs);
}

function completeNunCaughtReturnToMenu(system) {
    if (!system) {
        return;
    }

    window.stopAttackSlideLoopSfx?.(getActiveNunVideo(system));

    clearNunCaughtStageTransition(system);
    pauseNunVideo(system);
    system.isPlayingNunCaughtScene = false;
    system.nunCaughtSceneStage = 'idle';
    system.activeNunIntroVariationIndex = 1;
    system.activeNunDragVariationIndex = 1;
    system.activeNunIntroSceneSource = null;
    system.activeNunDragSceneSource = null;
    setNunCaughtContinueVisible(system, false);

    // Save the run (every relic kept) BEFORE the title fade tears the session
    // down, then offer "Continue this vigil" on the end-of-run screen.
    const runSummary = typeof window.captureTheNunRunFailure === 'function'
        ? window.captureTheNunRunFailure('caught')
        : null;

    if (typeof window.returnToTitleScreen === 'function') {
        Promise.resolve(window.returnToTitleScreen()).then(() => {
            if (runSummary && typeof window.showTheNunRunReckoning === 'function') {
                window.showTheNunRunReckoning(runSummary);
            }
        });
        return;
    }

    if (system.nunOverlay) {
        system.nunOverlay.classList.add('hidden');
        system.nunOverlay.classList.remove('is-caught-scene');
    }

    if (typeof window.stopNunGameSession === 'function') {
        window.stopNunGameSession();
    }

    showGameOver(system);
}

function configureNunRoundVideo(system, options) {
    if (!Array.isArray(system.nunVideos) || system.nunVideos.length === 0) {
        return;
    }

    const nextOptions = options || {};
    const config = getNunRoundVideoConfig(system.gameState.currentRound || 1);
    const phase = getNunLookBackPhase(system.gameState.currentRound || 1);
    const phaseChanged = phase !== system.activeNunPhase;

    system.nunTargetDurationSeconds = config.targetDurationSeconds;
    system.restartVideoOnReady = Boolean(nextOptions.restartVideo);
    system.activeNunPhase = phase;
    system.isPlayingNunCaughtScene = false;
    system.nunCaughtSceneStage = 'idle';
    system.activeNunIntroVariationIndex = 1;
    system.activeNunDragVariationIndex = 1;
    system.activeNunIntroSceneSource = null;
    system.activeNunDragSceneSource = null;
    clearNunCaughtStageTransition(system);
    setNunCaughtContinueVisible(system, false);
    if (system.nunOverlay) {
        system.nunOverlay.classList.remove('is-caught-scene');
    }

    if (phaseChanged || nextOptions.restartVideo) {
        pauseNunVideo(system);

        system.nunVideos.forEach((video) => {
            if (!video) {
                return;
            }

            const zone = Number(video.dataset.nunZone) || 1;
            const nextSource = getNunLookBackSource(zone, phase);
            video.dataset.nunMode = 'lookback';
            video.loop = false;

            if (video.dataset.nunSource !== nextSource) {
                video.dataset.nunSource = nextSource;
                video.src = nextSource;
                video.load();
            }

            if (nextOptions.restartVideo) {
                try {
                    video.currentTime = 0;
                } catch (error) {
                    system.restartVideoOnReady = true;
                }
            }

            applyNunVideoTiming(system, video);
        });
    } else {
        system.nunVideos.forEach((video) => applyNunVideoTiming(system, video));
    }

    system.restartVideoOnReady = false;
    updateVisibleNunZone(system);
    console.log(`[VIDEO] Nun look-back phase ${phase} set at ${getDifficulty(system.gameState).nunVideoSpeed.toFixed(2)}x across ${NUN_LOOK_BACK_ZONE_COUNT} zone videos`);
}

function initNunVideo(system) {
    if (!Array.isArray(system.nunVideos) || system.nunVideos.length === 0 || system.nunVideoInitialized) {
        return;
    }

    system.nunVideoInitialized = true;
    system.nunVideos.forEach((video) => {
        if (!video) {
            return;
        }

        video.loop = false;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;

        video.addEventListener('loadedmetadata', () => {
            applyNunVideoTiming(system, video);
        });

        ['play', 'pause', 'seeking', 'seeked', 'ratechange', 'timeupdate', 'ended'].forEach((eventName) => {
            video.addEventListener(eventName, () => {
                syncNunWalkAudioPlayback(system, video);
            });
        });

        video.addEventListener('error', () => {
            console.warn(`[VIDEO] Failed to load nun video ${video.dataset.nunSource || video.currentSrc || 'unknown source'}.`);
        });

        video.addEventListener('ended', () => {
            if (system.isPlayingNunCaughtScene) {
                if (Number(video.dataset.nunZone) === system.activeNunZone) {
                    if (system.nunCaughtSceneStage === 'intro') {
                        return;
                    }
                    scheduleNunCaughtReturnToMenu(system);
                }
                return;
            }

            if (Number(video.dataset.nunZone) !== system.activeNunZone) {
                return;
            }

            playNunCaughtScene(system);
        });
    });
}

function playNunCaughtScene(system) {
    if (!Array.isArray(system.nunVideos) || system.isPlayingNunCaughtScene) {
        return;
    }

    if (isNunCatchDisabled()) {
        const activeVideo = getActiveNunVideo(system);
        system.nunDistance = Math.max(system.nunDistance, 1);

        if (activeVideo) {
            try {
                activeVideo.currentTime = 0;
            } catch (error) {
                console.warn('[VIDEO] Unable to restart nun look-back video while no nun catch is enabled:', error);
            }
        }

        syncNunVideoPlayback(system);
        console.log('[DEBUG] No nun catch dev mode prevented the nun catch scene.');
        return;
    }

    if (window.demonAttacksSystem && typeof cleanupDemonAttacksSystem === 'function') {
        cleanupDemonAttacksSystem(window.demonAttacksSystem);
    }

    const activeVideo = getActiveNunVideo(system);
    if (!activeVideo) {
        nunCaughtPlayer(system);
        returnToMenuAfterNunCaught(system);
        return;
    }

    nunCaughtPlayer(system);
    system.activeNunIntroVariationIndex = getRandomNunAttackVariationIndex('nunIntro', 1);
    system.activeNunDragVariationIndex = getRandomNunAttackVariationIndex('nunDrag', 1);
    system.activeNunIntroSceneSource = getNunCaughtIntroSceneSource(getNunCaughtPhase(system), system.activeNunIntroVariationIndex);
    system.activeNunDragSceneSource = getNunCaughtSceneSource(getNunCaughtPhase(system), system.activeNunDragVariationIndex);
    system.isPlayingNunCaughtScene = true;
    system.nunCaughtSceneStage = 'intro';
    pauseNunVideo(system);
    if (system.nunOverlay) {
        system.nunOverlay.classList.remove('hidden');
        system.nunOverlay.classList.add('is-caught-scene');
    }

    loadNunCaughtStage(system, activeVideo, 'intro');
}

/**
 * Create a new NunSystem
 */
function createNunSystem(gameState) {
    const system = {
        gameState,
        nunOverlay: document.getElementById('nun-overlay'),
        nunVideos: Array.from(document.querySelectorAll('#nun-overlay .nun-video')),
        nunWalkAudio: null,
        nunCaughtContinueButton: document.getElementById('nun-caught-continue'),
        nunVideoInitialized: false,
        nunTargetDurationSeconds: 120,
        restartVideoOnReady: false,
        activeNunPhase: 0,
        activeNunIntroVariationIndex: 1,
        activeNunDragVariationIndex: 1,
        activeNunIntroSceneSource: null,
        activeNunDragSceneSource: null,
        activeNunZone: 1,
        isPlayingNunCaughtScene: false,
        nunCaughtSceneStage: 'idle',
        isTransitioningNunCaughtStage: false,
        nunCaughtStageTransitionTimer: null,
        nunCaughtReturnTimer: null,

        // Nun progression state
        nunDistance: 100, // 100 = far away, 0 = caught player
        isApproaching: true,
        approachStarted: false,

        approachTimer: null
    };

    initNunSystem(system);
    console.log('NunSystem initialized');

    return system;
}

/**
 * Initialize the NunSystem
 */
function initNunSystem(system) {
    if (system.nunCaughtContinueButton) {
        system.nunCaughtContinueButton.addEventListener('click', () => {
            // Every run's system binds this same button: a previous run's stale one
            // would send the player to the title instead of skipping the intro.
            if (system !== window.nunSystem) {
                return;
            }
            // A click that lands while the button is hidden (a held-down second click,
            // a synthesized one) must never skip a stage.
            if (system.isTransitioningNunCaughtStage
                || system.nunCaughtContinueButton.classList.contains('hidden')) {
                return;
            }

            window.stopAttackSlideLoopSfx?.(getActiveNunVideo(system));

            if (system.isPlayingNunCaughtScene && system.nunCaughtSceneStage === 'intro') {
                skipNunCaughtIntro(system);
                return;
            }

            returnToMenuAfterNunCaught(system);
        });
    }

    initNunVideo(system);
    configureNunRoundVideo(system, { restartVideo: true });
}

/**
 * Start the nun approaching the player
 */
function startApproachTimer(system) {
    if (!system) {
        return;
    }

    // Clear existing timer if any
    if (system.approachTimer) {
        clearInterval(system.approachTimer);
    }

    system.approachStarted = true;
    syncNunVideoPlayback(system);

    system.approachTimer = setInterval(() => {
        if (shouldAdvanceNun(system)) {
            updateNunVideo(system);
        } else {
            syncNunVideoPlayback(system);
        }
    }, 1000);
}

function stopApproachTimer(system) {
    if (!system) {
        return;
    }

    if (system.approachTimer) {
        clearInterval(system.approachTimer);
        system.approachTimer = null;
    }

    system.approachStarted = false;
    pauseNunVideo(system);
}

/**
 * Update nun video based on distance and clothing state
 */
function updateNunVideo(system) {
    updateVisibleNunZone(system);
    console.log(`[VIDEO] Nun walking - Round ${system.gameState.currentRound}, Zone ${system.gameState.currentZone}, Phase ${getNunLookBackPhase(system.gameState.currentRound)}, Distance: ${Math.floor(system.nunDistance)}%`);
}

/**
 * Show nun temporarily when player looks back
 */
function showNun(system) {
    if (!system.nunOverlay) return;

    console.log(`[VIDEO TRIGGER] Looking back - Nun at ${Math.floor(system.nunDistance)}% distance, Clothing state ${system.gameState.nunClothingState}/5`);
    clearNunCaughtStageTransition(system);
    updateVisibleNunZone(system);
    syncNunVideoPlayback(system);
    system.nunOverlay.classList.remove('is-caught-scene');
    setNunCaughtContinueVisible(system, false);
    system.nunOverlay.classList.remove('hidden');
    system.gameState.isLookingBack = true;
    if (typeof window.refreshLookBackButtonLabel === 'function') {
        window.refreshLookBackButtonLabel();
    }
}

/**
 * Hide nun overlay
 */
function hideNun(system) {
    if (!system.nunOverlay) return;

    clearNunCaughtStageTransition(system);
    system.nunOverlay.classList.add('hidden');
    system.nunOverlay.classList.remove('is-caught-scene');
    setNunCaughtContinueVisible(system, false);
    system.gameState.isLookingBack = false;
    if (typeof window.refreshLookBackButtonLabel === 'function') {
        window.refreshLookBackButtonLabel();
    }
}

/**
 * Nun caught the player - game over
 */
function nunCaughtPlayer(system) {
    if (isNunCatchDisabled()) {
        system.nunDistance = Math.max(system.nunDistance, 1);
        syncNunVideoPlayback(system);
        return;
    }

    system.gameState.gameOver = true;
    system.isApproaching = false;
    syncNunVideoPlayback(system);

    if (window.demonAttacksSystem && typeof cleanupDemonAttacksSystem === 'function') {
        cleanupDemonAttacksSystem(window.demonAttacksSystem);
    }

    console.log('[GAME OVER] Nun caught the player!');
}

/**
 * Show game over screen
 */
function showGameOver(system) {
    const existingOverlay = document.getElementById('game-over-screen');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const mainUi = document.getElementById('main-ui');

    system.isPlayingNunCaughtScene = false;
    setNunCaughtContinueVisible(system, false);
    if (system.nunOverlay) {
        system.nunOverlay.classList.add('hidden');
        system.nunOverlay.classList.remove('is-caught-scene');
    }
    if (mainUi) {
        mainUi.style.display = 'none';
    }

    // Create game over overlay
    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'game-over-screen';
    gameOverDiv.className = 'modal-overlay';

    gameOverDiv.innerHTML = `
        <div class="modal-content">
            <h1 class="game-over-title">${window.t('gameover.title')}</h1>
            <p class="game-over-text">${window.t('gameover.text')}</p>
            <div class="modal-button-row">
                <button id="restart-btn" class="modal-button">${window.t('gameover.restart')}</button>
                <button id="quit-btn" class="modal-button">${window.t('gameover.quit_to_menu')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(gameOverDiv);

    // Restart handler
    document.getElementById('restart-btn').addEventListener('click', () => {
        gameOverDiv.remove();
        if (typeof window.initializeNunRuntime === 'function') {
            window.initializeNunRuntime();
        }
    });

    document.getElementById('quit-btn').addEventListener('click', () => {
        if (typeof window.returnToTitleScreen === 'function') {
            window.returnToTitleScreen();
            return;
        }

        gameOverDiv.remove();
    });
}

/**
 * Reset nun for new round/game
 */
function resetNun(system, options = {}) {
    const shouldStartApproach = options.startApproach !== false;

    system.nunDistance = 100;
    system.isApproaching = true;
    hideNun(system);
    stopApproachTimer(system);
    clearNunCaughtReturnTimer(system);
    configureNunRoundVideo(system, { restartVideo: true });

    if (shouldStartApproach) {
        startApproachTimer(system);
    }

    console.log('Nun reset to starting position');
}

/**
 * Clean up resources
 */
function cleanupNunSystem(system) {
    clearNunCaughtReturnTimer(system);
    window.stopAttackSlideLoopSfx?.(getActiveNunVideo(system));
    pauseNunVideo(system);
    pauseNunWalkAudio(system);
    stopApproachTimer(system);
}

/**
 * Advance nun for next round (faster, less clothed)
 */
function nextRound(system) {
    resetNun(system);
    console.log(`Nun prepared for round ${system.gameState.currentRound} - Clothing state ${system.gameState.nunClothingState}/5`);
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.createNunSystem = createNunSystem;
    window.showNun = showNun;
    window.hideNun = hideNun;
    window.resetNun = resetNun;
    window.nextRound = nextRound;
    window.startNunApproachTimer = startApproachTimer;
    window.stopNunApproachTimer = stopApproachTimer;
    window.cleanupNunSystem = cleanupNunSystem;
    // The 3D world catches the player itself, then hands the existing catch videos
    // (intro loop + drag) the stage.
    window.startTheNunCaughtScene = function() {
        if (!window.nunSystem) {
            return false;
        }
        playNunCaughtScene(window.nunSystem);
        return true;
    };
}
