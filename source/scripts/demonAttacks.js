const DEMON_ATTACK_ROUND_CONFIGS = {
    1: {
        minIntervalMs: 15000,
        maxIntervalMs: 20000,
        minigameRevealDelayMs: 3000,
        attackVideoCandidates: ['assets/scenes/attacks/3AZ1S.mp4'],
        struggleDurationMs: 10000,
        defeatVideoCandidates: ['assets/scenes/attacks/3AD1.mp4']
    },
    2: {
        minIntervalMs: 13000,
        maxIntervalMs: 18000,
        minigameRevealDelayMs: 3000,
        attackVideoCandidates: ['assets/scenes/attacks/3AZ2S.mp4'],
        struggleDurationMs: 8000,
        defeatVideoCandidates: ['assets/scenes/attacks/3AD1V2.mp4', 'assets/scenes/attacks/3AD1.mp4']
    },
    3: {
        minIntervalMs: 11000,
        maxIntervalMs: 16000,
        minigameRevealDelayMs: 3000,
        attackVideoCandidates: ['assets/scenes/attacks/3AZ3S.mp4'],
        struggleDurationMs: 7000,
        defeatVideoCandidates: ['assets/scenes/attacks/3AD1V3.mp4', 'assets/scenes/attacks/3AD1.mp4']
    },
    4: {
        minIntervalMs: 9000,
        maxIntervalMs: 14000,
        minigameRevealDelayMs: 3000,
        attackVideoCandidates: ['assets/scenes/attacks/3AZ4S.mp4'],
        struggleDurationMs: 6000,
        defeatVideoCandidates: ['assets/scenes/attacks/3AD1V4.mp4', 'assets/scenes/attacks/3AD1.mp4']
    },
    5: {
        minIntervalMs: 7000,
        maxIntervalMs: 12000,
        minigameRevealDelayMs: 3000,
        attackVideoCandidates: ['assets/scenes/attacks/3AZ5S.mp4'],
        struggleDurationMs: 5000,
        defeatVideoCandidates: ['assets/scenes/attacks/3AD1V5.mp4', 'assets/scenes/attacks/3AD1.mp4']
    },
    6: {
        minIntervalMs: 5000,
        maxIntervalMs: 10000,
        minigameRevealDelayMs: 3000,
        attackVideoCandidates: ['assets/scenes/attacks/3AZ5S.mp4'],
        struggleDurationMs: 4000,
        defeatVideoCandidates: ['assets/scenes/attacks/3AD1V5.mp4', 'assets/scenes/attacks/3AD1.mp4']
    }
};
// The whole alphabet, drawn uniformly (the altar duel uses the same letters).
const STRUGGLE_KEY_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DEMON_ATTACK_SCHEDULE_TICK_MS = 100;
const TIMER_PRESENCE_ATTACK_SUCCESS_PROGRESS = 45.5;
const CAUGHT_OVERLAY_SCENE_RELEASE_DELAY_MS = 1500;
const DEMON_ATTACK_REVEAL_POLL_MS = 25;
const DEMON_LAUGH_INTERVAL_MIN_MS = 15000;
const DEMON_LAUGH_INTERVAL_MAX_MS = 35000;
// The first attack of a fresh run comes late and slow so it can be learned.
const FIRST_ATTACK_DELAY_MS = 22000;
const FIRST_ATTACK_SPEED = 0.7;
// Every attack flashes its hotspot briefly so a dim demon is still readable.
const ATTACK_TELEGRAPH_MS = 1400;
const STRUGGLE_MAX_SEQUENCE_KEYS = 5;
const STRUGGLE_MAX_TARGETS = 6;

function getConfiguredDemonSceneVariationCount(kind, fallbackValue = 5) {
    const configuredCount = typeof window.getTheNunSceneVariationCount === 'function'
        ? window.getTheNunSceneVariationCount(kind, fallbackValue)
        : fallbackValue;
    return Math.max(1, Number(configuredCount) || fallbackValue || 1);
}

function pickAttackVariationIndex(kind, fallbackValue = 1) {
    const availableVariationCount = getConfiguredDemonSceneVariationCount(kind, fallbackValue);
    return Math.max(1, Math.floor(Math.random() * availableVariationCount) + 1);
}

function clampAttackOutfitPhase(phase) {
    return Math.max(1, Math.min(5, Number(phase) || 1));
}

function buildPowerStruggleSceneSource(round, variationIndex = 1) {
    const safeRound = Math.max(1, Number(round) || 1);
    const safeVariationIndex = Math.max(1, Number(variationIndex) || 1);
    return safeVariationIndex === 1
        ? `assets/scenes/attacks/3AZ${safeRound}S.mp4`
        : `assets/scenes/attacks/3AZ${safeRound}S${safeVariationIndex}.mp4`;
}

function buildDemonDefeatSceneSource(phase, variationIndex = 1) {
    const safePhase = clampAttackOutfitPhase(phase);
    const safeVariationIndex = Math.max(1, Number(variationIndex) || 1);
    const baseStem = `3AD${safeVariationIndex}`;
    return safePhase === 1
        ? `assets/scenes/attacks/${baseStem}.mp4`
        : `assets/scenes/attacks/${baseStem}V${safePhase}.mp4`;
}

function buildDemonDefeatVideoCandidates(phase, variationIndex = 1) {
    const safePhase = clampAttackOutfitPhase(phase);
    const safeVariationIndex = Math.max(1, Number(variationIndex) || 1);
    const primarySource = buildDemonDefeatSceneSource(safePhase, safeVariationIndex);
    return [primarySource];
}

function getRoundAttackConfig(round) {
    const safeRound = Math.max(1, Math.min(6, Number(round) || 1));
    const safePowerStruggleRound = Math.min(safeRound, 5);
    const safeDefeatPhase = Math.min(safeRound, 5);
    const powerStruggleVariationIndex = pickAttackVariationIndex('powerStruggle', 1);
    const demonDefeatVariationIndex = pickAttackVariationIndex('demonDefeat', 1);

    return Object.assign({ round: safeRound }, DEMON_ATTACK_ROUND_CONFIGS[safeRound], {
        attackVideoCandidates: [buildPowerStruggleSceneSource(safePowerStruggleRound, powerStruggleVariationIndex)],
        defeatVideoCandidates: buildDemonDefeatVideoCandidates(safeDefeatPhase, demonDefeatVariationIndex),
        powerStruggleVariationIndex,
        demonDefeatVariationIndex
    });
}

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function playMedia(video) {
    if (!video) {
        return;
    }

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
    }
}

function isZoneForwardTransitionActive() {
    return Boolean(window.uiController && window.uiController.zoneForwardTransitionActive);
}

function isAttackSchedulingPaused(system) {
    return Boolean(
        !system
        || system.gameState?.isTimePaused
        || system.gameState?.isAtAltar
        || system.isAttacking
        || system.currentAttack
        || system.gameState?.activeDemonAttack
    );
}

function isAttackSchedulingBlocked(system) {
    return isAttackSchedulingPaused(system) || isZoneForwardTransitionActive();
}

function pickNextAttackIntervalMs(system) {
    const difficulty = getDifficulty(system.gameState);
    return Math.max(
        0,
        randomBetween(difficulty.demonAttackIntervalMinMs, difficulty.demonAttackIntervalMaxMs)
    );
}

function pickNextLaughIntervalMs() {
    return Math.max(
        0,
        randomBetween(DEMON_LAUGH_INTERVAL_MIN_MS, DEMON_LAUGH_INTERVAL_MAX_MS)
    );
}

function resetPendingAttackSchedule(system) {
    if (!system) {
        return;
    }

    system.attackScheduleRemainingMs = pickNextAttackIntervalMs(system);
    system.attackSchedulePending = false;
    system.attackScheduleLastTickAt = performance.now();
}

function resetLaughSchedule(system) {
    if (!system) {
        return;
    }

    system.laughScheduleRemainingMs = pickNextLaughIntervalMs();
    system.laughScheduleLastTickAt = performance.now();
}

function ensureLaughScheduleInitialized(system) {
    if (!system || Number.isFinite(system.laughScheduleRemainingMs)) {
        return;
    }

    resetLaughSchedule(system);
}

function ensureAttackScheduleMonitor(system) {
    if (!system || system.attackScheduleInterval) {
        return;
    }

    system.attackScheduleLastTickAt = performance.now();
    system.laughScheduleLastTickAt = performance.now();
    system.attackScheduleInterval = window.setInterval(() => {
        tickAttackSchedule(system);
        tickLaughSchedule(system);
    }, DEMON_ATTACK_SCHEDULE_TICK_MS);
}

function playLaughAudio() {
    const laughAudio = document.getElementById('laugh-audio');
    if (!laughAudio) {
        return;
    }

    laughAudio.currentTime = 0;
    const playPromise = laughAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
    }
}

function tryTriggerScheduledAttack(system) {
    if (!system) {
        return false;
    }

    if (isAttackSchedulingBlocked(system)) {
        system.attackSchedulePending = true;
        system.attackScheduleRemainingMs = 0;
        return false;
    }

    const started = startRandomAttack(system);
    if (!started) {
        system.attackSchedulePending = true;
        system.attackScheduleRemainingMs = 0;
        return false;
    }

    resetPendingAttackSchedule(system);
    return true;
}

function tickAttackSchedule(system) {
    if (!system) {
        return;
    }

    const now = performance.now();
    if (!Number.isFinite(system.attackScheduleLastTickAt) || system.attackScheduleLastTickAt <= 0) {
        system.attackScheduleLastTickAt = now;
    }
    if (!Number.isFinite(system.attackScheduleRemainingMs)) {
        resetPendingAttackSchedule(system);
    }

    const deltaMs = Math.max(0, now - system.attackScheduleLastTickAt);
    system.attackScheduleLastTickAt = now;

    if (system.attackSchedulePending) {
        tryTriggerScheduledAttack(system);
        return;
    }

    if (isAttackSchedulingPaused(system) || isZoneForwardTransitionActive()) {
        return;
    }

    system.attackScheduleRemainingMs = Math.max(0, (system.attackScheduleRemainingMs || 0) - deltaMs);

    if (system.attackScheduleRemainingMs > 0) {
        return;
    }

    tryTriggerScheduledAttack(system);
}

function tickLaughSchedule(system) {
    if (!system) {
        return;
    }

    const now = performance.now();
    if (!Number.isFinite(system.laughScheduleLastTickAt) || system.laughScheduleLastTickAt <= 0) {
        system.laughScheduleLastTickAt = now;
    }

    ensureLaughScheduleInitialized(system);

    const deltaMs = Math.max(0, now - system.laughScheduleLastTickAt);
    system.laughScheduleLastTickAt = now;

    if (isAttackSchedulingPaused(system) || isZoneForwardTransitionActive()) {
        return;
    }

    system.laughScheduleRemainingMs = Math.max(0, (system.laughScheduleRemainingMs || 0) - deltaMs);
    if (system.laughScheduleRemainingMs > 0) {
        return;
    }

    playLaughAudio();
    resetLaughSchedule(system);
}

function getDemonAttackUiRevealDelayMs(attack) {
    return attack?.roundConfig?.minigameRevealDelayMs || 3000;
}

function getAttackSuccessProgressThreshold(attack) {
    return attack?.isTimerPresenceZone ? TIMER_PRESENCE_ATTACK_SUCCESS_PROGRESS : 100;
}

function calculateAttackSuccessProgress(system) {
    const attack = system?.currentAttack;
    if (!attack) {
        return system?.attackProgress || 0;
    }

    if (!attack.isTimerPresenceZone) {
        return calculateAttackProgress(system);
    }

    const duration = Number(system?.sceneVideo?.duration);
    const currentTime = getActiveAttackDisplayTime(system);
    if (!Number.isFinite(duration) || duration <= 0) {
        return system?.attackProgress || 0;
    }

    return Math.min(100, (Math.max(0, currentTime) / duration) * 100);
}

function getDemonAttackDebugState(system) {
    if (!system) {
        return {
            remainingMs: null,
            pending: false,
            paused: true,
            transitionBlocked: false,
            active: false,
            status: 'unavailable'
        };
    }

    const transitionBlocked = isZoneForwardTransitionActive();
    const paused = isAttackSchedulingPaused(system);
    const active = Boolean(system.isAttacking || system.currentAttack || system.gameState?.activeDemonAttack);

    let status = 'counting';
    if (active) {
        status = 'active';
    } else if (system.attackSchedulePending) {
        status = 'queued';
    } else if (transitionBlocked) {
        status = 'transition';
    } else if (paused) {
        status = 'paused';
    }

    return {
        remainingMs: system.attackSchedulePending ? 0 : Math.max(0, Number(system.attackScheduleRemainingMs) || 0),
        pending: Boolean(system.attackSchedulePending),
        paused,
        transitionBlocked,
        active,
        status
    };
}

// The letter the player TYPES (event.key), so a prompted letter is the one printed on
// the keycap on any Latin layout (on AZERTY, "A" is the key QWERTY calls Q). A layout
// that types no Latin letter there (Cyrillic, Greek, kana, an IME) falls back to the
// key's QWERTY legend (event.code), which those keyboards print as well.
function normalizeStruggleKey(event) {
    if (!event) {
        return '';
    }

    if (event.code === 'Space' || event.key === ' ') {
        return 'SPACE';
    }

    const typed = String(event.key || '').trim().toUpperCase();
    const legend = /^Key([A-Z])$/.exec(String(event.code || ''));
    if (legend && !/^[A-Z]$/.test(typed)
        && (/^\p{L}$/u.test(typed) || typed === 'PROCESS' || typed === 'UNIDENTIFIED')) {
        return legend[1];
    }
    return typed;
}

function formatKeyToken(token) {
    return token === 'SPACE' ? 'Space' : token;
}

// Uniformly random letters, never the same one twice in a row (easier to read).
function createKeySequence(length) {
    const sequence = [];

    for (let index = 0; index < length; index += 1) {
        let key;
        do {
            key = pickRandom(STRUGGLE_KEY_POOL);
        } while (key === sequence[index - 1]);
        sequence.push(key);
    }

    return sequence;
}

function createTargetLayout(count) {
    const safeCount = Math.max(1, Number(count) || 0);
    const targets = [];

    for (let index = 0; index < safeCount; index += 1) {
        const size = randomBetween(42, 68);
        let left = randomBetween(10, 90);
        let top = randomBetween(14, 86);
        let attempts = 0;

        while (attempts < 40) {
            const overlapsExistingTarget = targets.some((target) => {
                const dx = left - target.left;
                const dy = top - target.top;
                const distance = Math.sqrt((dx * dx) + (dy * dy));
                const minimumDistance = ((size + target.size) * 0.48) + 8;
                return distance < minimumDistance;
            });

            if (!overlapsExistingTarget) {
                break;
            }

            left = randomBetween(10, 90);
            top = randomBetween(14, 86);
            attempts += 1;
        }

        targets.push({
            id: `target-${index}`,
            size,
            left,
            top
        });
    }

    return targets;
}

/**
 * Create a new DemonAttacksSystem
 */
function createDemonAttacksSystem(gameState) {
    const sceneStack = document.querySelector('.scene-stack');
    const rewindCanvas = createRewindCanvas(sceneStack);
    const rewindCaptureCanvas = document.createElement('canvas');
    const system = {
        gameState,
        sceneVideo: document.getElementById('scene-full-video'),
        sceneStack,
        rewindCanvas,
        rewindContext: rewindCanvas?.getContext('2d', { alpha: true }) || null,
        rewindCaptureCanvas,
        rewindCaptureContext: rewindCaptureCanvas.getContext('2d', { alpha: true }) || null,

        // Attack configuration
        attackTypes: {
            centerRun: { zone: 'center', variants: ['fast', 'slow'] },
            leftHiding: { zone: 'left', spots: 4 },
            leftMoving: { zone: 'left' },
            rightHiding: { zone: 'right', spots: 4 },
            rightMoving: { zone: 'right' }
        },

        // Current attack state
        currentAttack: null,
        attackProgress: 0,
        clicksRemaining: 0,
        attackTimer: null,
        attackAnimationFrame: null,
        isAttacking: false,
        lastAttackTriggerAt: 0,

        // Scheduled attack timeouts
        attackScheduleTimeout: null,
        attackScheduleInterval: null,
        attackScheduleRemainingMs: null,
        attackScheduleLastTickAt: 0,
        attackSchedulePending: false,
        laughScheduleRemainingMs: null,
        laughScheduleLastTickAt: 0,
        struggleTimer: null,
        powerStruggleKeyHandler: null,
        attackUiRevealTimeout: null,
        attackUiRevealInterval: null,
        caughtOverlayReadyTimeout: null,
        caughtSceneStage: 'idle',

        // Attack video timing
        rewindDecayPerSecond: 1.75,
        rewindBoostPerClick: 1.35,
        rewindMaxVelocity: 4.1,
        rewindCatchupFactor: 0,
        rewindResumeThreshold: 0.14,
        rewindIdleResumeMs: 120,
        rewindFrameCaptureIntervalMs: 1000 / 20,
        rewindFrameScale: 0.3,
        rewindMaxFrames: 240,
        forwardPlaybackActive: false,
        lastFrameTime: 0,
        reverseFrameBuffer: [],
        reverseDisplayTime: 0,
        reverseLastCaptureAt: 0,
        reverseLastDrawnIndex: -1,
        captureInFlight: false,
        attackSessionId: 0,

        struggleScreen: document.getElementById('power-struggle-screen'),
        struggleTimerLabel: document.getElementById('struggle-timer'),
        struggleTimerFill: document.getElementById('struggle-timer-fill'),
        struggleTitle: document.getElementById('struggle-title'),
        struggleInstruction: document.getElementById('struggle-instruction'),
        keySequenceEl: document.getElementById('key-sequence'),
        zoneOrderEl: document.getElementById('struggle-zone-order'),
        zoneButtons: Array.from(document.querySelectorAll('.lane-struggle-zone')),
        progressBar: document.getElementById('struggle-progress'),
        strugglePlayfield: document.getElementById('struggle-playfield'),
        struggleActionRow: document.getElementById('struggle-action-row'),
        struggleHitCircle: document.getElementById('struggle-hit-circle'),
        caughtOverlay: document.getElementById('attack-caught-overlay'),
        caughtVideo: document.getElementById('attack-caught-video'),
        caughtContinueButton: document.getElementById('attack-caught-continue')
    };

    initDemonAttacksSystem(system);
    console.log('DemonAttacksSystem initialized');

    return system;
}

/**
 * Initialize the DemonAttacksSystem
 */
function initDemonAttacksSystem(system) {
    system.sceneVideo?.addEventListener('ended', () => {
        if (system.isAttacking && !system.currentAttack?.isRewinding) {
            attackSuccess(system);
        }
    });

    window.addEventListener('resize', () => resizeRewindCanvas(system));

    system.zoneButtons.forEach((button) => {
        button.onclick = () => handleStruggleZoneClick(window.demonAttacksSystem || system, button.getAttribute('data-zone'));
    });

    if (system.strugglePlayfield) {
        system.strugglePlayfield.onclick = (event) => handlePlayfieldTargetClick(window.demonAttacksSystem || system, event);
    }

    if (system.struggleHitCircle) {
        system.struggleHitCircle.onclick = (event) => handleStruggleMashClick(window.demonAttacksSystem || system, event);
    }

    if (system.caughtContinueButton) {
        system.caughtContinueButton.onclick = () => {
            const activeSystem = window.demonAttacksSystem || system;
            if (activeSystem.caughtSceneStage !== 'defeat-loop') {
                return;
            }

            finalizeAttackLoss(activeSystem);
        };
    }

    resetStruggleUi(system);
    ensureLaughScheduleInitialized(system);
}

/**
 * Start random demon attack
 */
function startRandomAttack(system) {
    if (
        !system
        || system.isAttacking
        || system.currentAttack
        || system.gameState?.activeDemonAttack
        || system.gameState.isAtAltar
        || system.gameState.isTimePaused
        || isZoneForwardTransitionActive()
    ) {
        return false;
    }

    const presenceEntries = window.collectiblesSystem
        ? getPresenceZones(window.collectiblesSystem)
        : [];
    if (presenceEntries.length === 0) {
        console.warn('No authored presence zones are available for this zone.');
        return false;
    }

    const difficulty = getDifficulty(system.gameState);
    const presenceEntry = presenceEntries[Math.floor(Math.random() * presenceEntries.length)];
    const zoneDescriptor = describePresenceZone(window.collectiblesSystem, presenceEntry.data);
    const attackStartTime = getSceneVideoTime(system.sceneVideo);
    const isFirstAttackOfRun = !system.gameState.firstAttackDone;
    system.gameState.firstAttackDone = true;
    system.attackSessionId += 1;
    resetReversePlaybackState(system);

    system.currentAttack = {
        type: zoneDescriptor.type,
        zone: zoneDescriptor.zone,
        variant: zoneDescriptor.variant,
        roundConfig: getRoundAttackConfig(system.gameState.currentRound),
        presenceZoneId: presenceEntry.data.id,
        isTimerPresenceZone: presenceEntry.data.timer === true,
        presenceEntry,
        attackStartTime,
        speed: isFirstAttackOfRun ? FIRST_ATTACK_SPEED : difficulty.demonSpeed,
        visibility: difficulty.demonVisibility,
        requiredClicks: difficulty.demonClicksRequired,
        rewindVelocity: 0,
        isRewinding: false,
        rewindCommitted: false,
        clickHandler: null,
        lastClickAt: 0,
        reverseDisplayTime: attackStartTime,
        sessionId: system.attackSessionId,
        struggle: null,
        attackResolved: false
    };

    system.attackProgress = 0;
    system.clicksRemaining = difficulty.demonClicksRequired;
    system.isAttacking = true;
    system.lastAttackTriggerAt = performance.now();
    system.gameState.activeDemonAttack = system.currentAttack;

    console.log(`[VIDEO TRIGGER] Demon Attack: ${system.currentAttack.type} (variant: ${system.currentAttack.variant}) from ${system.currentAttack.zone} zone`);
    logAttackVideo(system);

    const activatedPresence = activatePresenceZone(window.collectiblesSystem, presenceEntry.data.id);
    const hotspot = activatedPresence?.hotspot;
    if (hotspot) {
        system.currentAttack.clickHandler = (event) => handlePresenceClick(system, event);
        hotspot.style.cursor = 'pointer';
        hotspot.addEventListener('click', system.currentAttack.clickHandler, { once: true });
        telegraphAttackHotspot(hotspot, isFirstAttackOfRun ? ATTACK_TELEGRAPH_MS * 2 : ATTACK_TELEGRAPH_MS);
    }

    captureAttackFrame(system, attackStartTime, true);
    playAttackVideo(system);
    refreshUiAfterAttackStateChange();

    // Progress attack
    progressAttack(system);

    return true;
}

function telegraphAttackHotspot(hotspot, durationMs) {
    if (!hotspot) {
        return;
    }

    clearAttackHotspotTelegraph(hotspot);
    // Restart the CSS animation even if the same hotspot fires twice in a row.
    void hotspot.offsetWidth;
    hotspot.classList.add('is-telegraphed');
    hotspot.__telegraphTimer = window.setTimeout(() => {
        clearAttackHotspotTelegraph(hotspot);
    }, Math.max(200, Number(durationMs) || ATTACK_TELEGRAPH_MS));
}

function clearAttackHotspotTelegraph(hotspot) {
    if (!hotspot) {
        return;
    }

    if (hotspot.__telegraphTimer) {
        window.clearTimeout(hotspot.__telegraphTimer);
        hotspot.__telegraphTimer = null;
    }
    hotspot.classList.remove('is-telegraphed');
}

/**
 * Log which video should be playing
 */
function logAttackVideo(system) {
    const { type, zone, variant, speed } = system.currentAttack;

    let videoDescription = '';

    switch(type) {
        case 'centerRun':
            videoDescription = `Zone ${system.gameState.currentZone} - Center Running Attack (${variant} speed)`;
            break;
        case 'leftHiding':
            videoDescription = `Zone ${system.gameState.currentZone} - Left Hiding Attack (spot ${variant})`;
            break;
        case 'leftMoving':
            videoDescription = `Zone ${system.gameState.currentZone} - Left Moving Attack`;
            break;
        case 'rightHiding':
            videoDescription = `Zone ${system.gameState.currentZone} - Right Hiding Attack (spot ${variant})`;
            break;
        case 'rightMoving':
            videoDescription = `Zone ${system.gameState.currentZone} - Right Moving Attack (crawling)`;
            break;
    }

    console.log(`[VIDEO] Playing: ${videoDescription} at ${speed}x speed`);
}

/**
 * Progress the attack over time
 */
function progressAttack(system) {
    if (!system.currentAttack) return;

    if (system.attackAnimationFrame) {
        cancelAnimationFrame(system.attackAnimationFrame);
    }

    system.lastFrameTime = performance.now();

    const step = (timestamp) => {
        if (!system.isAttacking || !system.currentAttack) {
            system.attackAnimationFrame = null;
            return;
        }

        const deltaSeconds = Math.max(0, Math.min(0.05, (timestamp - system.lastFrameTime) / 1000));
        system.lastFrameTime = timestamp;

        if (system.gameState.isTimePaused) {
            ensureSceneVideoPaused(system);
            system.attackAnimationFrame = requestAnimationFrame(step);
            return;
        }

        if (system.currentAttack.isRewinding) {
            stepAttackRewind(system, deltaSeconds);
        } else {
            playAttackVideo(system);
            maybeCaptureAttackFrame(system, timestamp);
        }

        const progress = calculateAttackSuccessProgress(system);
        system.attackProgress = progress;

        if (progress >= getAttackSuccessProgressThreshold(system.currentAttack)) {
            attackSuccess(system);
            system.attackAnimationFrame = null;
            return;
        }

        system.attackAnimationFrame = requestAnimationFrame(step);
    };

    system.attackAnimationFrame = requestAnimationFrame(step);
}

/**
 * Handle click on authored demon presence zone
 */
function handlePresenceClick(system, event) {
    if (!system.currentAttack || system.gameState.isTimePaused || system.currentAttack.rewindCommitted) return;

    event.preventDefault();
    event.stopPropagation();

    if (system.currentAttack.presenceEntry?.hotspot) {
        system.currentAttack.presenceEntry.hotspot.style.cursor = 'default';
    }

    const clickTime = getSceneVideoTime(system.sceneVideo);
    captureAttackFrameImmediate(system, clickTime);

    system.clicksRemaining = 0;
    system.currentAttack.reverseDisplayTime = getReverseStartTime(system, clickTime);
    system.currentAttack.isRewinding = true;
    system.currentAttack.rewindCommitted = true;
    system.currentAttack.lastClickAt = performance.now();
    system.currentAttack.rewindVelocity = system.rewindMaxVelocity;

    ensureSceneVideoPaused(system);
    showBufferedReverseFrame(system, system.currentAttack.reverseDisplayTime);

    console.log('Demon clicked! Rewinding attack back to 0s.');
}

/**
 * Attack was successfully repelled by player
 */
function attackRepelled(system) {
    console.log('[SUCCESS] Demon attack repelled!');

    if (typeof window.bumpTheNunRunStat === 'function') {
        window.bumpTheNunRunStat(system.gameState, 'repelled');
    }

    restoreSceneAfterAttack(system, 0);
    endAttack(system);
    restartAttackSchedule(system);
}

/**
 * Attack succeeded, demon caught player
 */
function attackSuccess(system) {
    if (!system.currentAttack || system.currentAttack.attackResolved) {
        return;
    }

    console.log('[ATTACK] Demon reached player! Starting caught sequence...');
    console.log(`[VIDEO TRIGGER] Demon Caught - Zone ${system.currentAttack.zone}`);

    system.currentAttack.attackResolved = true;
    ensureSceneVideoPaused(system);
    restoreSceneAfterAttack(system);
    startCaughtAttackSequence(system);
}

/**
 * End current attack
 */
function endAttack(system) {
    if (system.attackTimer) {
        clearInterval(system.attackTimer);
        system.attackTimer = null;
    }
    if (system.attackAnimationFrame) {
        cancelAnimationFrame(system.attackAnimationFrame);
        system.attackAnimationFrame = null;
    }

    const activePresence = system.currentAttack?.presenceZoneId;
    const hotspot = system.currentAttack?.presenceEntry?.hotspot;
    clearAttackHotspotTelegraph(hotspot);
    if (hotspot && system.currentAttack?.clickHandler) {
        hotspot.removeEventListener('click', system.currentAttack.clickHandler);
        hotspot.style.cursor = 'default';
    }
    if (window.collectiblesSystem && activePresence) {
        deactivatePresenceZone(window.collectiblesSystem, activePresence);
    }

    system.isAttacking = false;
    system.gameState.activeDemonAttack = null;
    system.gameState.isPowerStruggle = false;
    system.currentAttack = null;
    system.caughtSceneStage = 'idle';
    system.attackProgress = 0;
    system.clicksRemaining = 0;
    system.forwardPlaybackActive = false;
    system.lastFrameTime = 0;
    clearAttackUiRevealTimeout(system);
    clearStruggleTimer(system);
    clearStruggleKeyHandler(system);
    stopStruggleAudio();
    stopCaughtOverlayVideo(system);
    setCaughtOverlayVisible(system, false);
    resetReversePlaybackState(system);
    resetStruggleUi(system);
    refreshUiAfterAttackStateChange();
}

/**
 * Start power struggle mini-game
 */
function startPowerStruggle(system) {
    const attack = system.currentAttack;
    if (!attack || attack.struggle) {
        return;
    }

    const roundConfig = attack.roundConfig || getRoundAttackConfig(system.gameState.currentRound);
    const struggleType = pickRandom(['sequence', 'zones', 'mash']);
    const remainingMs = getAttackVideoRemainingMs(system, roundConfig.struggleDurationMs);

    attack.struggle = {
        type: struggleType,
        remainingMs,
        initialRemainingMs: remainingMs,
        progress: 0,
        currentIndex: 0,
        sequence: struggleType === 'sequence'
            ? createKeySequence(Math.min(STRUGGLE_MAX_SEQUENCE_KEYS, 1 + roundConfig.round))
            : [],
        targets: struggleType === 'zones'
            ? createTargetLayout(Math.min(STRUGGLE_MAX_TARGETS, roundConfig.round + 2))
            : [],
        initialTargetCount: struggleType === 'zones'
            ? Math.min(STRUGGLE_MAX_TARGETS, roundConfig.round + 2)
            : 0
    };
    system.gameState.isPowerStruggle = true;

    if (system.struggleScreen) {
        system.struggleScreen.classList.remove('hidden');
    }
    updateStruggleTimer(system, attack.struggle.remainingMs);
    if (system.zoneOrderEl) {
        system.zoneOrderEl.classList.add('hidden');
    }
    if (system.struggleActionRow) {
        system.struggleActionRow.classList.remove('hidden');
    }

    if (struggleType === 'sequence') {
        if (system.struggleInstruction) {
            system.struggleInstruction.textContent = window.t('struggle.sequence_instruction');
        }
        if (system.keySequenceEl) {
            system.keySequenceEl.classList.remove('hidden');
        }
        renderSequencePrompt(system, attack.struggle);
        updateProgressBar(system, 0);
        system.powerStruggleKeyHandler = (event) => handleSequenceKey(system, event);
        window.addEventListener('keydown', system.powerStruggleKeyHandler);
    } else if (struggleType === 'zones') {
        if (system.struggleInstruction) {
            system.struggleInstruction.textContent = window.t('struggle.zones_instruction');
        }
        if (system.strugglePlayfield) {
            system.strugglePlayfield.classList.remove('hidden');
        }
        renderPlayfieldTargets(system, attack.struggle);
        updateProgressBar(system, 0);
    } else {
        if (system.struggleInstruction) {
            system.struggleInstruction.textContent = window.t('struggle.meter_instruction');
        }
        if (system.struggleActionRow) {
            system.struggleActionRow.classList.remove('hidden');
        }
        if (system.struggleHitCircle) {
            system.struggleHitCircle.classList.remove('hidden');
        }
        updateProgressBar(system, 20);
        attack.struggle.progress = 20;
    }

    updateNavigationAfterAttack();

    const struggleAudio = document.getElementById('struggle-audio');
    if (struggleAudio) {
        struggleAudio.currentTime = 0;
        const playPromise = struggleAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }

    system.struggleTimer = setInterval(() => {
        if (!system.currentAttack || !system.currentAttack.struggle) {
            clearStruggleTimer(system);
            return;
        }

        if (system.gameState.isTimePaused) {
            return;
        }

        const struggle = system.currentAttack.struggle;
        struggle.remainingMs = getAttackVideoRemainingMs(system, Math.max(0, struggle.remainingMs - 100));
        updateStruggleTimer(system, struggle.remainingMs);

        if (struggle.type === 'mash') {
            struggle.progress = Math.max(0, struggle.progress - (2 + roundConfig.round * 0.35));
            updateProgressBar(system, struggle.progress);
        }

        if (struggle.remainingMs <= 0) {
            endPowerStruggle(system, false);
        }
    }, 100);
}

/**
 * End power struggle
 */
function endPowerStruggle(system, playerWon) {
    if (!system.currentAttack || !system.currentAttack.struggle) {
        return;
    }

    stopStruggleAudio();

    system.gameState.isPowerStruggle = false;
    clearStruggleKeyHandler(system);
    clearStruggleTimer(system);
    system.currentAttack.struggle = null;
    spawnStruggleResolution(system, playerWon);
    resetStruggleUi(system);

    if (!playerWon) {
        playDefeatSequence(system);
        return;
    }

    if (typeof window.bumpTheNunRunStat === 'function') {
        window.bumpTheNunRunStat(system.gameState, 'repelled');
    }

    window.setTimeout(() => {
        if (system.currentAttack) {
            endAttack(system);
            restartAttackSchedule(system);
        }
    }, 650);
}

/**
 * Schedule random attacks during gameplay
 */
function scheduleRandomAttacks(system) {
    // In 3D the Demoness is driven by scripts/world3d/world.js, not this timer.
    if (!system || window.THE_NUN_3D_MODE) {
        return;
    }

    ensureLaughScheduleInitialized(system);
    resetPendingAttackSchedule(system);
    if (system.gameState && !system.gameState.firstAttackDone) {
        system.attackScheduleRemainingMs = FIRST_ATTACK_DELAY_MS;
    }
    ensureAttackScheduleMonitor(system);
}

function restartAttackSchedule(system) {
    if (!system || window.THE_NUN_3D_MODE) {
        return;
    }

    resetPendingAttackSchedule(system);
    ensureAttackScheduleMonitor(system);
}

function cancelActiveAttack(system) {
    if (!system || !system.currentAttack) {
        return false;
    }

    if (system.isAttacking) {
        restoreSceneAfterAttack(system);
    }

    endAttack(system);
    restartAttackSchedule(system);
    return true;
}

/**
 * Clean up resources
 */
function cleanupDemonAttacksSystem(system) {
    if (system.isAttacking) {
        restoreSceneAfterAttack(system);
        endAttack(system);
    }
    if (system.attackScheduleTimeout) {
        clearTimeout(system.attackScheduleTimeout);
        system.attackScheduleTimeout = null;
    }
    if (system.attackScheduleInterval) {
        clearInterval(system.attackScheduleInterval);
        system.attackScheduleInterval = null;
    }
    system.attackScheduleRemainingMs = null;
    system.attackSchedulePending = false;
    system.attackScheduleLastTickAt = 0;
    system.laughScheduleRemainingMs = null;
    system.laughScheduleLastTickAt = 0;
    if (system.attackAnimationFrame) {
        cancelAnimationFrame(system.attackAnimationFrame);
        system.attackAnimationFrame = null;
    }
    if (system.powerStruggleKeyHandler) {
        window.removeEventListener('keydown', system.powerStruggleKeyHandler);
        system.powerStruggleKeyHandler = null;
    }
    clearAttackUiRevealTimeout(system);
    stopCaughtOverlayVideo(system);
    setCaughtOverlayVisible(system, false);

    resetReversePlaybackState(system);
}

function playAttackVideo(system) {
    if (!system.sceneVideo || !system.currentAttack) {
        return;
    }

    if (system.forwardPlaybackActive && !system.sceneVideo.paused) {
        return;
    }

    system.sceneVideo.loop = false;
    system.sceneVideo.playbackRate = Math.max(0.65, system.currentAttack.speed || 1);
    system.forwardPlaybackActive = true;
    window.safePlaySceneVideo?.(system.sceneVideo);
}

function stepAttackRewind(system, deltaSeconds) {
    if (!system.currentAttack || !system.sceneVideo) {
        return;
    }

    const attack = system.currentAttack;
    ensureSceneVideoPaused(system);

    if (!attack.rewindCommitted) {
        const millisSinceLastClick = performance.now() - attack.lastClickAt;
        const decayMultiplier = millisSinceLastClick > system.rewindIdleResumeMs ? 4.5 : 1;
        attack.rewindVelocity = Math.max(0, attack.rewindVelocity - (system.rewindDecayPerSecond * decayMultiplier * deltaSeconds));

        if (attack.rewindVelocity <= system.rewindResumeThreshold || millisSinceLastClick > system.rewindIdleResumeMs) {
            attack.rewindVelocity = 0;
            attack.isRewinding = false;
            syncVideoToReverseCursor(system);
            playAttackVideo(system);
            return;
        }
    } else {
        attack.rewindVelocity = system.rewindMaxVelocity;
    }

    const rewindSeconds = attack.rewindVelocity * deltaSeconds;
    const targetTime = 0;
    const nextTime = Math.max(targetTime, (attack.reverseDisplayTime || getSceneVideoTime(system.sceneVideo)) - rewindSeconds);
    attack.reverseDisplayTime = nextTime;
    showBufferedReverseFrame(system, nextTime);

    const catchupClicksRemaining = attack.rewindCommitted ? 0 : Math.max(0, system.clicksRemaining);
    if (system.rewindCatchupFactor > 0 && catchupClicksRemaining > 0) {
        attack.rewindVelocity = Math.max(
            attack.rewindVelocity,
            Math.min(system.rewindMaxVelocity, catchupClicksRemaining * system.rewindCatchupFactor)
        );
    }

    const reachedStart = nextTime <= targetTime + 0.03;
    if (reachedStart) {
        attackRepelled(system);
    }
}

function restoreSceneAfterAttack(system, restoreTime) {
    if (!system.sceneVideo || !system.currentAttack) {
        return;
    }

    system.forwardPlaybackActive = false;
    hideRewindCanvas(system);
    window.resetSceneVideo?.(system.sceneVideo, Number.isFinite(restoreTime) ? restoreTime : (system.currentAttack.attackStartTime || 0));
}

function calculateAttackProgress(system) {
    if (!system.sceneVideo) {
        return system.attackProgress;
    }

    const duration = Number(system.sceneVideo.duration);
    const currentTime = getActiveAttackDisplayTime(system);
    const attackStartTime = system.currentAttack?.attackStartTime || 0;

    if (!Number.isFinite(duration) || duration <= attackStartTime) {
        return system.attackProgress;
    }

    const travelled = Math.max(0, currentTime - attackStartTime);
    const total = Math.max(0.001, duration - attackStartTime);
    return Math.min(100, (travelled / total) * 100);
}

function getSceneVideoTime(videoElement) {
    if (!videoElement) {
        return 0;
    }

    const currentTime = Number(videoElement.currentTime);
    return Number.isFinite(currentTime) ? currentTime : 0;
}

function describePresenceZone(collectiblesSystem, zoneData) {
    const width = collectiblesSystem?.sceneMetrics?.width || 1;
    const centerX = zoneData.x + (zoneData.width / 2);
    const thirdWidth = width / 3;
    const zone = centerX < thirdWidth ? 'left' : centerX > thirdWidth * 2 ? 'right' : 'center';

    return {
        zone,
        type: zone === 'center' ? 'centerRun' : `${zone}Presence`,
        variant: zoneData.id
    };
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function loseHalfResources(state) {
    if (!state) {
        return;
    }

    const crossesLost = Math.floor((Number(state.crossesCollected) || 0) / 4);
    const booksLost = Math.floor((Number(state.booksCollected) || 0) / 4);

    state.crossesCollected = Math.max(0, (Number(state.crossesCollected) || 0) - crossesLost);
    state.booksCollected = Math.max(0, (Number(state.booksCollected) || 0) - booksLost);
}

function setCaughtOverlayVisible(system, isVisible) {
    if (!system.caughtOverlay) {
        return;
    }

    system.caughtOverlay.classList.toggle('hidden', !isVisible);
    if (!isVisible) {
        system.caughtOverlay.classList.remove('video-ready');
        system.caughtOverlay.classList.remove('overlay-ready');
    }
    setCaughtContinueVisible(system, isVisible && system.caughtSceneStage === 'defeat-loop');
    setGameplayHudHidden(isVisible);
}

function setCaughtContinueVisible(system, isVisible) {
    if (!system || !system.caughtContinueButton) {
        return;
    }

    system.caughtContinueButton.classList.toggle('hidden', !isVisible);
}

function clearCaughtOverlayReadyTimeout(system) {
    if (system.caughtOverlayReadyTimeout) {
        clearTimeout(system.caughtOverlayReadyTimeout);
        system.caughtOverlayReadyTimeout = null;
    }
}

function setCaughtOverlayReady(system, isReady) {
    if (!system.caughtOverlay) {
        return;
    }

    system.caughtOverlay.classList.toggle('overlay-ready', isReady);
}

function setCaughtOverlayVideoReady(system, isReady) {
    if (!system.caughtOverlay) {
        return;
    }

    system.caughtOverlay.classList.toggle('video-ready', isReady);
}

function scheduleCaughtOverlayReady(system, attack) {
    clearCaughtOverlayReadyTimeout(system);
    setCaughtOverlayReady(system, false);

    system.caughtOverlayReadyTimeout = window.setTimeout(() => {
        system.caughtOverlayReadyTimeout = null;
        if (!system.currentAttack || system.currentAttack !== attack) {
            return;
        }

        setCaughtOverlayReady(system, true);
    }, CAUGHT_OVERLAY_SCENE_RELEASE_DELAY_MS);
}

function stopCaughtOverlayVideo(system) {
    if (!system.caughtVideo) {
        return;
    }

    window.stopAttackSlideLoopSfx?.(system.caughtVideo);
    clearCaughtOverlayReadyTimeout(system);
    setCaughtContinueVisible(system, false);
    setCaughtOverlayVideoReady(system, false);
    setCaughtOverlayReady(system, false);
    system.caughtSceneStage = 'idle';
    system.caughtVideo.pause();
    system.caughtVideo.loop = false;
    system.caughtVideo.onended = null;
    system.caughtVideo.onerror = null;
    system.caughtVideo.onloadeddata = null;
    system.caughtVideo.onloadedmetadata = null;
    system.caughtVideo.onplaying = null;
    system.caughtVideo.removeAttribute('src');
    system.caughtVideo.load();
}

function clearAttackUiRevealTimeout(system) {
    if (system.attackUiRevealTimeout) {
        clearTimeout(system.attackUiRevealTimeout);
        system.attackUiRevealTimeout = null;
    }

    if (system.attackUiRevealInterval) {
        clearInterval(system.attackUiRevealInterval);
        system.attackUiRevealInterval = null;
    }
}

function startAttackUiRevealTrigger(system, attack) {
    if (!system || !attack) {
        return;
    }

    clearAttackUiRevealTimeout(system);

    const revealStruggle = () => {
        clearAttackUiRevealTimeout(system);
        if (!system.currentAttack || system.currentAttack !== attack || attack.struggle) {
            return;
        }

        startPowerStruggle(system);
    };

    const revealDelayMs = getDemonAttackUiRevealDelayMs(attack);
    system.attackUiRevealTimeout = window.setTimeout(() => {
        revealStruggle();
    }, revealDelayMs);
}

function playVideoCandidates(video, candidates, onFinished, onReady, onPlaying, options = {}) {
    if (!video || !Array.isArray(candidates) || candidates.length === 0) {
        if (typeof onFinished === 'function') {
            onFinished(null);
        }
        return;
    }

    const uniqueCandidates = candidates.filter((candidate, index) => Boolean(candidate) && candidates.indexOf(candidate) === index);
    const shouldLoop = options.loop === true;
    let currentIndex = 0;
    let readyNotified = false;
    let playingNotified = false;

    const tryNextCandidate = () => {
        const source = uniqueCandidates[currentIndex];
        if (!source) {
            if (typeof onFinished === 'function') {
                onFinished(null);
            }
            return;
        }

        video.onerror = () => {
            currentIndex += 1;
            tryNextCandidate();
        };
        video.onended = () => {
            if (typeof onFinished === 'function') {
                onFinished(source);
            }
        };
        video.onloadedmetadata = () => {
            if (typeof window.markTheNunGallerySceneSeenBySource === 'function') {
                window.markTheNunGallerySceneSeenBySource(source);
            }
            if (!readyNotified && typeof onReady === 'function') {
                readyNotified = true;
                onReady(source);
            }
        };
        video.onplaying = () => {
            if (!playingNotified && typeof onPlaying === 'function') {
                playingNotified = true;
                onPlaying(source);
            }
        };
        video.loop = shouldLoop;
        video.setAttribute('src', source);
        video.currentTime = 0;
        playMedia(video);
    };

    tryNextCandidate();
}

function startCaughtAttackSequence(system) {
    const attack = system.currentAttack;
    const caughtVideo = system.caughtVideo;
    if (!attack || !caughtVideo) {
        playDefeatSequence(system);
        return;
    }

    attack.activeVideo = caughtVideo;
    system.caughtSceneStage = 'attack';
    setCaughtOverlayVideoReady(system, false);
    setCaughtOverlayReady(system, false);
    setCaughtOverlayVisible(system, true);

    const onRevealTrigger = () => {
        if (!system.currentAttack || system.currentAttack !== attack) {
            return;
        }
        if (attack.attackPlaybackStartedAt) {
            return;
        }

        attack.attackPlaybackStartedAt = performance.now();
        startAttackUiRevealTrigger(system, attack);
    };

    caughtVideo.onloadeddata = () => {
        if (!system.currentAttack || system.currentAttack !== attack) {
            return;
        }

        setCaughtOverlayVideoReady(system, true);
        scheduleCaughtOverlayReady(system, attack);
    };

    playVideoCandidates(
        caughtVideo,
        attack.roundConfig?.attackVideoCandidates || [],
        () => {
            if (!system.currentAttack || system.currentAttack !== attack) {
                // Attack was cleaned up externally; ensure state flags are clear.
                system.gameState.activeDemonAttack = null;
                refreshUiAfterAttackStateChange();
                return;
            }

            clearAttackUiRevealTimeout(system);

            if (attack.struggle) {
                endPowerStruggle(system, false);
            } else {
                playDefeatSequence(system);
            }
        },
        onRevealTrigger,
        onRevealTrigger
    );
}

function playDefeatSequence(system) {
    const attack = system.currentAttack;
    const caughtVideo = system.caughtVideo;
    if (!attack || !caughtVideo) {
        finalizeAttackLoss(system);
        return;
    }

    clearAttackUiRevealTimeout(system);
    resetStruggleUi(system);
    system.gameState.isPowerStruggle = false;
    system.caughtSceneStage = 'defeat-loading';
    setCaughtContinueVisible(system, false);
    setCaughtOverlayVisible(system, true);

    const defeatVideos = attack.roundConfig?.defeatVideoCandidates || [];
    if (defeatVideos.length === 0) {
        finalizeAttackLoss(system);
        return;
    }

    console.log(`[VIDEO TRIGGER] ${defeatVideos[0]}`);
    window.stopAttackSlideLoopSfx?.(caughtVideo);
    playVideoCandidates(caughtVideo, defeatVideos, () => {
        if (!system.currentAttack || system.currentAttack !== attack) {
            // Attack was cleaned up externally; ensure state flags are clear.
            system.gameState.activeDemonAttack = null;
            refreshUiAfterAttackStateChange();
            return;
        }
    }, null, () => {
        system.caughtSceneStage = 'defeat-loop';
        setCaughtContinueVisible(system, true);
        window.startAttackSlideLoopSfx?.(caughtVideo, {
            voiceVolumeScale: 0.45,
            voicePlaybackRate: 0.62
        });
    }, {
        loop: true
    });
}

function finalizeAttackLoss(system) {
    loseHalfResources(system.gameState);
    if (typeof window.adjustTheNunDevotion === 'function') {
        const devotionLoss = window.theNunBalanceConfig?.devotion?.demonLoss ?? -3;
        window.adjustTheNunDevotion(system.gameState, devotionLoss);
    }
    if (typeof window.bumpTheNunRunStat === 'function') {
        window.bumpTheNunRunStat(system.gameState, 'lost');
    }
    if (window.uiController) {
        updateCounters(window.uiController);
    }

    if (system.currentAttack) {
        endAttack(system);
        restartAttackSchedule(system);
    }
}

function getAttackVideoRemainingMs(system, fallbackMs) {
    const activeVideo = system.currentAttack?.activeVideo;
    const fallback = Math.max(0, Number(fallbackMs) || 0);
    if (!activeVideo) {
        return fallback;
    }

    const duration = Number(activeVideo.duration);
    const currentTime = Number(activeVideo.currentTime);
    if (!Number.isFinite(duration) || !Number.isFinite(currentTime) || duration <= 0) {
        return fallback;
    }

    return Math.max(0, (duration - currentTime) * 1000);
}

function clearStruggleTimer(system) {
    if (system.struggleTimer) {
        clearInterval(system.struggleTimer);
        system.struggleTimer = null;
    }
}

function stopStruggleAudio() {
    const struggleAudio = document.getElementById('struggle-audio');
    if (!struggleAudio) {
        return;
    }

    struggleAudio.pause();
    struggleAudio.currentTime = 0;
}

function clearStruggleKeyHandler(system) {
    if (system.powerStruggleKeyHandler) {
        window.removeEventListener('keydown', system.powerStruggleKeyHandler);
        system.powerStruggleKeyHandler = null;
    }
}

function updateNavigationAfterAttack() {
    if (window.uiController && typeof updateNavigationButtonStates === 'function') {
        updateNavigationButtonStates(window.uiController);
    }
}

function setGameplayHudHidden(hidden) {
    const mainUi = document.getElementById('main-ui');
    if (!mainUi) {
        return;
    }

    mainUi.style.display = hidden ? 'none' : 'block';
}

function updateStruggleTimer(system, remainingMs) {
    if (!system.struggleTimerFill) {
        return;
    }

    const struggle = system.currentAttack?.struggle;
    const initialMs = struggle?.initialRemainingMs || 10000;
    const pct = Math.max(0, Math.min(100, (Math.max(0, remainingMs) / initialMs) * 100));
    system.struggleTimerFill.style.width = `${pct}%`;
    // Visual-only tension states for the CSS (colour shift, pulse, shake).
    if (system.struggleScreen) {
        system.struggleScreen.classList.toggle('is-struggle-low', Boolean(struggle) && pct <= 35);
        system.struggleScreen.classList.toggle('is-struggle-critical', Boolean(struggle) && pct <= 15);
    }
}

// Visual-only feedback: restart a short CSS animation class on an element.
function flashStruggleClass(element, className, durationMs = 320) {
    if (!element) {
        return;
    }
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    clearTimeout(element[`__${className}Timer`]);
    element[`__${className}Timer`] = setTimeout(() => element.classList.remove(className), durationMs);
}

// Visual-only win/lose flourish: a non-interactive snapshot of the panel that plays
// out on its own while the real screen is hidden on the usual frame (timing unchanged).
function spawnStruggleResolution(system, playerWon) {
    const screen = system && system.struggleScreen;
    if (!screen || screen.classList.contains('hidden') || !screen.parentElement) {
        return;
    }
    const ghost = screen.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((element) => {
        element.dataset.ghostId = element.id;
        element.removeAttribute('id');
    });
    ghost.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
        button.tabIndex = -1;
    });
    ghost.className = `lane-struggle-resolve ${playerWon ? 'is-won' : 'is-lost'}`;
    ghost.setAttribute('aria-hidden', 'true');
    screen.parentElement.appendChild(ghost);
    setTimeout(() => ghost.remove(), 950);
}

function updateProgressBar(system, progress) {
    if (system.progressBar) {
        system.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }
}

function renderSequencePrompt(system, struggle) {
    if (!system.keySequenceEl) {
        return;
    }

    // Same labels as before, as keycaps: done / current (the "next" key) / pending.
    system.keySequenceEl.textContent = '';
    struggle.sequence.forEach((token, index) => {
        const key = document.createElement('span');
        key.className = 'lane-struggle-key';
        if (index < struggle.currentIndex) {
            key.classList.add('is-done');
            if (index === struggle.currentIndex - 1) {
                key.classList.add('is-just-done');
            }
        } else if (index === struggle.currentIndex) {
            key.classList.add('is-current');
        }
        key.style.setProperty('--key-index', String(index));
        key.textContent = formatKeyToken(token);
        system.keySequenceEl.appendChild(key);
    });
    system.keySequenceEl.classList.toggle('is-started', struggle.currentIndex > 0);
}

function renderPlayfieldTargets(system, struggle) {
    if (!system.strugglePlayfield) {
        return;
    }

    system.strugglePlayfield.innerHTML = '';

    (struggle.targets || []).forEach((target) => {
        const targetButton = document.createElement('button');
        targetButton.type = 'button';
        targetButton.className = 'lane-struggle-target';
        targetButton.dataset.targetId = target.id;
        targetButton.style.width = `${target.size}px`;
        targetButton.style.height = `${target.size}px`;
        targetButton.style.left = `${target.left}%`;
        targetButton.style.top = `${target.top}%`;
        targetButton.style.transform = 'translate(-50%, -50%)';
        targetButton.setAttribute('aria-label', window.t('a11y.struggle_target'));
        system.strugglePlayfield.appendChild(targetButton);
    });
}

function resetStruggleUi(system) {
    clearStruggleKeyHandler(system);
    clearStruggleTimer(system);
    updateProgressBar(system, 0);

    if (system.struggleScreen) {
        system.struggleScreen.classList.add('hidden');
    }
    updateStruggleTimer(system, 0);
    if (system.struggleTitle) {
        system.struggleTitle.textContent = window.t('struggle.title');
    }
    if (system.struggleInstruction) {
        system.struggleInstruction.textContent = window.t('struggle.default_instruction');
    }
    if (system.keySequenceEl) {
        system.keySequenceEl.textContent = '';
        system.keySequenceEl.classList.add('hidden');
    }
    if (system.zoneOrderEl) {
        system.zoneOrderEl.classList.add('hidden');
    }
    if (system.strugglePlayfield) {
        system.strugglePlayfield.classList.add('hidden');
        system.strugglePlayfield.classList.remove('is-settled', 'is-miss');
        system.strugglePlayfield.innerHTML = '';
    }
    if (system.struggleActionRow) {
        system.struggleActionRow.classList.add('hidden');
    }
    if (system.struggleHitCircle) {
        system.struggleHitCircle.classList.add('hidden');
    }
    system.zoneButtons.forEach((button) => {
        button.classList.remove('is-target');
    });
}

function handleSequenceKey(system, event) {
    const attack = system && system.currentAttack;
    const struggle = attack && attack.struggle;
    if (!struggle || struggle.type !== 'sequence' || system.gameState.isTimePaused) {
        return;
    }

    const pressedKey = normalizeStruggleKey(event);
    const expectedKey = struggle.sequence[struggle.currentIndex];
    event.preventDefault();

    if (pressedKey !== expectedKey) {
        if (!event.repeat && (pressedKey.length === 1 || pressedKey === 'SPACE')) {
            flashStruggleClass(system.keySequenceEl, 'is-miss', 360);
        }
        return;
    }

    struggle.currentIndex += 1;
    renderSequencePrompt(system, struggle);
    flashStruggleClass(system.keySequenceEl, 'is-hit', 300);
    updateProgressBar(system, (struggle.currentIndex / struggle.sequence.length) * 100);

    if (struggle.currentIndex >= struggle.sequence.length) {
        endPowerStruggle(system, true);
    }
}

function handleStruggleZoneClick(system, zone) {
    const attack = system && system.currentAttack;
    const struggle = attack && attack.struggle;
    if (!struggle || struggle.type !== 'zones' || system.gameState.isTimePaused) {
        return;
    }

    const target = struggle.targets.find((entry) => entry.id === zone);
    if (!target) {
        return;
    }

    struggle.targets = struggle.targets.filter((entry) => entry.id !== zone);
    if (system.strugglePlayfield) {
        system.strugglePlayfield.classList.add('is-settled');
    }
    renderPlayfieldTargets(system, struggle);
    if (system.strugglePlayfield) {
        const burst = document.createElement('span');
        burst.className = 'lane-struggle-burst';
        burst.style.left = `${target.left}%`;
        burst.style.top = `${target.top}%`;
        burst.style.width = `${target.size}px`;
        burst.style.height = `${target.size}px`;
        system.strugglePlayfield.appendChild(burst);
        setTimeout(() => burst.remove(), 480);
    }
    const totalTargets = Math.max(1, struggle.initialTargetCount || 1);
    updateProgressBar(system, ((totalTargets - struggle.targets.length) / totalTargets) * 100);

    if (struggle.targets.length === 0) {
        endPowerStruggle(system, true);
    }
}

function handlePlayfieldTargetClick(system, event) {
    const targetButton = event && event.target && event.target.closest('.lane-struggle-target');
    if (!targetButton) {
        const struggle = system && system.currentAttack && system.currentAttack.struggle;
        if (struggle && struggle.type === 'zones' && !system.gameState.isTimePaused) {
            flashStruggleClass(system.strugglePlayfield, 'is-miss', 360);
        }
        return;
    }

    handleStruggleZoneClick(system, targetButton.dataset.targetId);
}

function handleStruggleMashClick(system, event) {
    const attack = system && system.currentAttack;
    const struggle = attack && attack.struggle;
    if (!struggle || struggle.type !== 'mash' || system.gameState.isTimePaused) {
        return;
    }

    if (!event || !event.target || !event.target.closest('#struggle-hit-circle')) {
        return;
    }

    const mashRound = Math.min(5, system.gameState.currentRound || 1);
    const mashProgressPerClick = 80 / (4 + mashRound);
    struggle.progress = Math.min(100, struggle.progress + mashProgressPerClick);
    updateProgressBar(system, struggle.progress);
    flashStruggleClass(system.struggleHitCircle, 'is-hit', 260);
    flashStruggleClass(system.struggleActionRow, 'is-hit', 260);

    if (struggle.progress >= 100) {
        endPowerStruggle(system, true);
    }
}

function refreshUiAfterAttackStateChange() {
    if (window.uiController) {
        updateCounters(window.uiController);
    }
}

function ensureSceneVideoPaused(system) {
    if (!system.sceneVideo) {
        return;
    }

    if (!system.sceneVideo.paused) {
        system.sceneVideo.pause();
    }

    system.forwardPlaybackActive = false;
}

function createRewindCanvas(sceneStack) {
    if (!sceneStack) {
        return null;
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'scene-rewind-canvas';
    sceneStack.insertBefore(canvas, document.getElementById('scene-empty-overlay'));
    return canvas;
}

function resizeRewindCanvas(system) {
    if (!system?.rewindCanvas || !system.sceneVideo) {
        return;
    }

    const width = Math.max(1, Math.round(system.sceneVideo.clientWidth || system.sceneVideo.videoWidth || 1));
    const height = Math.max(1, Math.round(system.sceneVideo.clientHeight || system.sceneVideo.videoHeight || 1));

    if (system.rewindCanvas.width !== width || system.rewindCanvas.height !== height) {
        system.rewindCanvas.width = width;
        system.rewindCanvas.height = height;
    }
}

function maybeCaptureAttackFrame(system, timestamp) {
    if (!system.currentAttack || !system.sceneVideo || system.captureInFlight) {
        return;
    }

    if (system.sceneVideo.readyState < 2) {
        return;
    }

    if ((timestamp - system.reverseLastCaptureAt) < system.rewindFrameCaptureIntervalMs) {
        return;
    }

    captureAttackFrame(system, getSceneVideoTime(system.sceneVideo), false);
    system.reverseLastCaptureAt = timestamp;
}

function prepareReverseCaptureSurface(system) {
    if (!system?.sceneVideo) {
        return null;
    }

    const sourceWidth = system.sceneVideo.videoWidth || system.rewindCanvas?.width || 1;
    const sourceHeight = system.sceneVideo.videoHeight || system.rewindCanvas?.height || 1;
    const maxWidth = Math.max(320, Math.round(sourceWidth * system.rewindFrameScale));
    const aspectRatio = sourceHeight / Math.max(1, sourceWidth);
    const targetWidth = Math.min(960, maxWidth);
    const targetHeight = Math.max(180, Math.round(targetWidth * aspectRatio));
    const captureCanvas = system.rewindCaptureCanvas;
    const captureContext = system.rewindCaptureContext;

    if (!captureCanvas || !captureContext) {
        return null;
    }

    if (captureCanvas.width !== targetWidth || captureCanvas.height !== targetHeight) {
        captureCanvas.width = targetWidth;
        captureCanvas.height = targetHeight;
    }

    return {
        targetWidth,
        targetHeight,
        captureCanvas,
        captureContext
    };
}

function captureAttackFrameImmediate(system, frameTime) {
    if (!system.currentAttack || !system.sceneVideo || system.sceneVideo.readyState < 2) {
        return false;
    }

    const captureSurface = prepareReverseCaptureSurface(system);
    if (!captureSurface) {
        return false;
    }

    const { targetWidth, targetHeight, captureCanvas, captureContext } = captureSurface;

    try {
        captureContext.clearRect(0, 0, targetWidth, targetHeight);
        captureContext.drawImage(system.sceneVideo, 0, 0, targetWidth, targetHeight);
        pushReverseFrame(system, {
            time: frameTime,
            image: cloneCanvasSnapshot(captureCanvas)
        });
        system.reverseLastCaptureAt = performance.now();
        return true;
    } catch (error) {
        console.warn('Failed to capture immediate attack frame:', error);
        return false;
    }
}

function captureAttackFrame(system, frameTime, forceCapture) {
    if (!system.currentAttack || !system.sceneVideo) {
        return;
    }

    if (!forceCapture && system.captureInFlight) {
        return;
    }

    const sessionId = system.currentAttack.sessionId;
    const captureSurface = prepareReverseCaptureSurface(system);
    if (!captureSurface) {
        return;
    }

    const { targetWidth, targetHeight, captureCanvas, captureContext } = captureSurface;

    system.captureInFlight = true;
    try {
        captureContext.clearRect(0, 0, targetWidth, targetHeight);
        captureContext.drawImage(system.sceneVideo, 0, 0, targetWidth, targetHeight);
    } catch (error) {
        system.captureInFlight = false;
        if (!forceCapture) {
            console.warn('Failed to draw attack frame into capture canvas:', error);
        }
        return;
    }

    createFrameSnapshot(captureCanvas).then((snapshot) => {
        if (!system.currentAttack || system.currentAttack.sessionId !== sessionId) {
            releaseFrameSnapshot(snapshot);
            return;
        }

        pushReverseFrame(system, {
            time: frameTime,
            image: snapshot
        });
    }).catch((error) => {
        console.warn('Failed to capture attack frame:', error);
    }).finally(() => {
        if (!system.currentAttack || system.currentAttack.sessionId === sessionId) {
            system.captureInFlight = false;
        }
    });
}

function pushReverseFrame(system, frame) {
    if (!system?.reverseFrameBuffer) {
        return;
    }

    const previousFrame = system.reverseFrameBuffer[system.reverseFrameBuffer.length - 1];
    if (previousFrame && Math.abs(previousFrame.time - frame.time) < 0.01) {
        releaseFrameSnapshot(previousFrame.image);
        system.reverseFrameBuffer[system.reverseFrameBuffer.length - 1] = frame;
    } else {
        system.reverseFrameBuffer.push(frame);
    }

    while (system.reverseFrameBuffer.length > system.rewindMaxFrames) {
        const discardedFrame = system.reverseFrameBuffer.shift();
        releaseFrameSnapshot(discardedFrame?.image);
    }
}

function showBufferedReverseFrame(system, targetTime) {
    const frameIndex = findReverseFrameIndex(system.reverseFrameBuffer, targetTime);
    if (frameIndex < 0) {
        hideRewindCanvas(system);
        window.safeSetSceneVideoTime?.(system.sceneVideo, targetTime);
        return;
    }

    const frame = system.reverseFrameBuffer[frameIndex];
    const context = system.rewindContext;
    if (!frame?.image || !context) {
        return;
    }

    resizeRewindCanvas(system);
    showRewindCanvas(system);

    context.clearRect(0, 0, system.rewindCanvas.width, system.rewindCanvas.height);
    context.drawImage(frame.image, 0, 0, system.rewindCanvas.width, system.rewindCanvas.height);
    system.reverseLastDrawnIndex = frameIndex;
}

function findReverseFrameIndex(frameBuffer, targetTime) {
    if (!Array.isArray(frameBuffer) || frameBuffer.length === 0) {
        return -1;
    }

    const oldestFrame = frameBuffer[0];
    if (oldestFrame && Number.isFinite(oldestFrame.time) && targetTime + 0.001 < oldestFrame.time) {
        return -1;
    }

    for (let index = frameBuffer.length - 1; index >= 0; index -= 1) {
        if (frameBuffer[index].time <= targetTime + 0.001) {
            return index;
        }
    }

    return -1;
}

function getLatestReverseFrameTime(system) {
    const lastFrame = Array.isArray(system?.reverseFrameBuffer)
        ? system.reverseFrameBuffer[system.reverseFrameBuffer.length - 1]
        : null;
    return Number.isFinite(lastFrame?.time) ? lastFrame.time : null;
}

function getReverseStartTime(system, desiredTime) {
    const latestBufferedTime = getLatestReverseFrameTime(system);
    if (!Number.isFinite(latestBufferedTime)) {
        return desiredTime;
    }

    return Math.min(desiredTime, latestBufferedTime);
}

function syncVideoToReverseCursor(system) {
    if (!system?.currentAttack || !system.sceneVideo) {
        return;
    }

    hideRewindCanvas(system);
    window.safeSetSceneVideoTime?.(system.sceneVideo, system.currentAttack.reverseDisplayTime || system.currentAttack.attackStartTime || 0);
}

function getActiveAttackDisplayTime(system) {
    if (system?.currentAttack?.isRewinding) {
        return system.currentAttack.reverseDisplayTime || system.currentAttack.attackStartTime || 0;
    }

    return getSceneVideoTime(system?.sceneVideo);
}

function resetReversePlaybackState(system) {
    hideRewindCanvas(system);
    clearReverseFrameBuffer(system);
    system.reverseDisplayTime = 0;
    system.reverseLastCaptureAt = 0;
    system.reverseLastDrawnIndex = -1;
    system.captureInFlight = false;
}

function clearReverseFrameBuffer(system) {
    if (!Array.isArray(system?.reverseFrameBuffer)) {
        return;
    }

    system.reverseFrameBuffer.forEach((frame) => releaseFrameSnapshot(frame?.image));
    system.reverseFrameBuffer = [];
}

function showRewindCanvas(system) {
    if (!system?.rewindCanvas) {
        return;
    }

    system.rewindCanvas.classList.add('visible');
}

function hideRewindCanvas(system) {
    if (!system?.rewindCanvas) {
        return;
    }

    system.rewindCanvas.classList.remove('visible');
    system.rewindContext?.clearRect(0, 0, system.rewindCanvas.width, system.rewindCanvas.height);
}

function createFrameSnapshot(sourceCanvas) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(sourceCanvas).catch(() => cloneCanvasSnapshot(sourceCanvas));
    }

    return Promise.resolve(cloneCanvasSnapshot(sourceCanvas));
}

function cloneCanvasSnapshot(sourceCanvas) {
    const clone = document.createElement('canvas');
    clone.width = sourceCanvas.width;
    clone.height = sourceCanvas.height;
    const cloneContext = clone.getContext('2d', { alpha: true });
    cloneContext?.drawImage(sourceCanvas, 0, 0);
    return clone;
}

function releaseFrameSnapshot(snapshot) {
    snapshot?.close?.();
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.createDemonAttacksSystem = createDemonAttacksSystem;
    window.startRandomAttack = startRandomAttack;
    window.scheduleRandomAttacks = scheduleRandomAttacks;
    window.cleanupDemonAttacksSystem = cleanupDemonAttacksSystem;
    window.restartDemonAttackSchedule = restartAttackSchedule;
    window.cancelActiveDemonAttack = cancelActiveAttack;
    // Resets any pending-attack flag so no attack fires immediately after altar/intro
    window.clearScheduledDemonAttack = function(system) {
        resetPendingAttackSchedule(system);
    };
    window.getDemonAttackDebugState = function() {
        return getDemonAttackDebugState(window.demonAttacksSystem);
    };
    // The 3D Demoness reached the player: skip straight to the existing catch
    // sequence (attack video, then the struggle mini-game, then the defeat loop).
    window.startTheNunDirectCaughtAttack = function() {
        const system = window.demonAttacksSystem;
        if (!system || system.currentAttack || system.isAttacking) {
            return false;
        }

        system.attackSessionId += 1;
        system.currentAttack = {
            type: 'world',
            zone: 'center',
            variant: 'world',
            roundConfig: getRoundAttackConfig(system.gameState.currentRound),
            presenceZoneId: null,
            presenceEntry: null,
            isTimerPresenceZone: false,
            attackStartTime: 0,
            speed: 1,
            rewindVelocity: 0,
            isRewinding: false,
            rewindCommitted: false,
            clickHandler: null,
            reverseDisplayTime: 0,
            sessionId: system.attackSessionId,
            struggle: null,
            attackResolved: true
        };
        system.isAttacking = true;
        system.gameState.activeDemonAttack = system.currentAttack;
        startCaughtAttackSequence(system);
        return true;
    };
}
