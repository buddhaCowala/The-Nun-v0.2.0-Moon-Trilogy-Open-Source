/**
 * GameState - Manages the core game state and progression (Functional approach)
 */

// Tune per-run difficulty here. "Run" = vigil (phase); runIndex 0 is vigil 1.
const RUN_DIFFICULTY_CONFIG = {
    lightDecayBase: 0.85,
    lightDecayPerRun: 0.18,
    demonClicksBase: 5,
    demonClicksPerRun: 1,
    demonAttackIntervalMinBaseMs: 13000,
    demonAttackIntervalMinStepMs: 1200,
    demonAttackIntervalMinFloorMs: 8000,
    demonAttackIntervalMaxBaseMs: 17000,
    demonAttackIntervalMaxStepMs: 1200,
    demonAttackIntervalMaxFloorMs: 11000,
    demonSpeedBase: 1,
    demonSpeedPerRun: 0.12,
    demonVisibilityBase: 1,
    demonVisibilityPerRun: 0.06,
    demonVisibilityFloor: 0.5,
    // The nun's pressure is her look-back clip timeline: she catches you when the
    // current zone's clip ends. These are the real seconds she needs to walk the whole
    // zone-5 clip (the full approach) in each vigil. Vigil 1 zone 1 = ~27 s.
    // The 3D game uses the same table: Jane reaches the altar when it runs out.
    nunApproachClipSeconds: 42.5,
    // Tuned 2026-09-27 (Shaun): her 3D walk was too fast in vigil 1 and a touch slow in
    // vigil 6. Speed is walk-distance / these seconds, so a 0.75x .. 1.1x speed ramp
    // (0.75, 0.82, 0.89, 0.96, 1.03, 1.10 of the old pace) divides into these.
    nunApproachSecondsByPhase: [88, 68, 54, 43, 34, 27],
    nunVideoSpeedMax: 0.75
};

// The run ends at the altar of this vigil with one of three endings.
const THE_NUN_FINAL_PHASE = 6;

// Devotion: -100 (corruption) .. +100 (purity). Decides the ending at the final altar.
const DEVOTION_CONFIG = {
    min: -100,
    max: 100,
    endingThreshold: 25,
    perCross: 1,
    perBook: -1,
    demonLoss: -3,
    rite: {
        helpNun: 12,
        helpDemon: -12,
        demonExorcism: 18,
        nunCorruption: -18,
        // The altar duel (scripts/altarDuel.js): overpowering the Nun corrupts her,
        // overpowering the Demon is a step toward her exorcism.
        attackNun: -12,
        attackDemon: 12
    },
    replay: {
        helpNun: 4,
        helpDemon: -4,
        demonExorcism: 4,
        nunCorruption: -4,
        attackNun: -4,
        attackDemon: 4
    }
};

// Tune altar route requirements here. Each value is the requirement for the next scene shown on that route.
const ALTAR_REQUIREMENT_TABLES = {
    helpNun:       [8, 14, 22],
    helpDemon:     [8, 14, 22],
    demonExorcism: [30, 50, 70],   // Shaun 09-28: way pricier (was 12, 20, 28)
    nunCorruption: [30, 50, 70]    // Shaun 09-28: way pricier (was 12, 20, 28)
};

// A finished route stays open: its last scene can be relived for this many relics.
const ALTAR_REPLAY_COST = 6;

const ALTAR_PROGRESS_LIMITS = {
    helpNun: 3,
    helpDemon: 3,
    demonExorcism: 2,   // scene 2 is the Exorcism ending (ALTAR_ENDING_RESERVED_SCENES)
    nunCorruption: 2,   // scene 2 is the Corruption ending (ALTAR_ENDING_RESERVED_SCENES)
    attackNun: 5,
    attackDemon: 5
};

const ALTAR_ROUTE_RULES = {
    'help-nun':       { key: 'helpNun',       progressKey: 'helpNunProgress',       currencyKey: 'crossesCollected', currency: 'crosses' },
    'help-demon':     { key: 'helpDemon',     progressKey: 'helpDemonProgress',     currencyKey: 'booksCollected',   currency: 'books' },
    'demon-exorcism': { key: 'demonExorcism', progressKey: 'demonExorcismProgress', currencyKey: 'crossesCollected', currency: 'crosses' },
    'nun-corruption': { key: 'nunCorruption', progressKey: 'nunCorruptionProgress', currencyKey: 'booksCollected',   currency: 'books' }
};

// Attack routes use the matching Help price table, stepped by their OWN progress:
// 6 -> 10 -> 14 -> 18 -> 22 like Help, going up after each won duel.
const ALTAR_ATTACK_ROUTES = {
    'attack-nun': { progressKey: 'attackNunProgress', routeKey: 'attackNun', resource: 'crossesCollected' },
    'attack-demon': { progressKey: 'attackDemonProgress', routeKey: 'attackDemon', resource: 'booksCollected' }
};

function normalizeAltarChoiceKey(choice) {
    switch (choice) {
        case 'helpNunProgress':
        case 'help-nun':
        case 'helpNun':
            return 'helpNun';
        case 'helpDemonProgress':
        case 'help-demon':
        case 'helpDemon':
            return 'helpDemon';
        case 'demonExorcismProgress':
        case 'demon-exorcism':
        case 'demonExorcism':
            return 'demonExorcism';
        case 'nunCorruptionProgress':
        case 'nun-corruption':
        case 'nunCorruption':
            return 'nunCorruption';
        case 'attackNunProgress':
        case 'attack-nun':
        case 'attackNun':
            return 'attackNun';
        case 'attackDemonProgress':
        case 'attack-demon':
        case 'attackDemon':
            return 'attackDemon';
        default:
            return null;
    }
}

// Every scene a route has on disk (the update manager's count, else the table).
function getAltarRouteSceneCount(choice) {
    const choiceKey = normalizeAltarChoiceKey(choice);
    if (typeof window.getTheNunAltarRouteConfig === 'function') {
        const routeConfig = window.getTheNunAltarRouteConfig(choiceKey);
        if (routeConfig && typeof routeConfig.count === 'number' && routeConfig.count > 0) {
            return routeConfig.count;
        }
    }
    return ALTAR_PROGRESS_LIMITS[choiceKey] || 5;
}

// The last scene of these routes is not bought at the altar: it is the ending
// (Shaun: Demon Exorcism 2/2 = the Exorcism ending, Nun Corruption 2/2 = the
// Corruption ending; the altar offers 1/1). The scene count itself stays whole so
// the gallery and the update manager keep shipping that scene.
const ALTAR_ENDING_RESERVED_SCENES = {
    demonExorcism: 1,
    nunCorruption: 1
};

function getAltarProgressLimit(choice) {
    const choiceKey = normalizeAltarChoiceKey(choice);
    const count = getAltarRouteSceneCount(choiceKey);
    const reserved = ALTAR_ENDING_RESERVED_SCENES[choiceKey] || 0;
    return count > reserved ? count - reserved : count;
}

function resolveAltarRequirement(choice, progress) {
    const choiceKey = normalizeAltarChoiceKey(choice);
    const table = ALTAR_REQUIREMENT_TABLES[choiceKey] || [];
    const safeProgressIndex = Math.max(0, Math.min((table.length || 1) - 1, Number(progress) || 0));
    return table[safeProgressIndex] || 0;
}

function getRunIndex(state) {
    return Math.max(0, (Number(state?.currentRound) || 1) - 1);
}

function syncDerivedGameState(state) {
    const runIndex = getRunIndex(state);
    state.difficultyMultiplier = 1 + (runIndex * 0.25);
    state.nunClothingState = Math.min(5, Math.ceil((runIndex + 1) / 2));
}

function getActiveEditionForAltarChoice() {
    if (typeof window !== 'undefined' && typeof window.getActiveEditionKey === 'function') {
        return window.getActiveEditionKey();
    }

    return 'base';
}

function isAltarChoiceUnlockedByEdition(choice) {
    const editionKey = getActiveEditionForAltarChoice();

    if (choice === 'demon-exorcism') {
        return editionKey === 'gold' || editionKey === 'diamond';
    }

    if (choice === 'nun-corruption') {
        return editionKey === 'diamond';
    }

    return true;
}

function createEmptyRunStats() {
    return { relics: 0, repelled: 0, lost: 0, rites: 0 };
}

// --- Relic spots already emptied in the CURRENT vigil ------------------------------
// A catch keeps all the crosses and books (Shaun's rule, untouched), and the retry used
// to hand back a freshly stocked level, so the same vigil could be farmed for ever. The
// level's layout is seeded per vigil (world3d/cathedral.js, corridor.js), so a retry can
// rebuild exactly the same cathedral with the spots the player already emptied still
// empty: a retry is a rescue, not a reroll. The list is cleared when the vigil is banked
// at the altar (advanceGameRound) and when a new run starts (resetGame).
// It is OPTIONAL on the saved run: a save written before this existed has no list and
// plays exactly as it always did.
const TAKEN_SPOT_LIMIT = 256;
const TAKEN_SPOT_MAX_LENGTH = 32;

function normalizeTakenSpots(spots) {
    if (!Array.isArray(spots)) {
        return [];
    }
    const clean = [];
    spots.forEach((spot) => {
        if (typeof spot !== 'string' || !spot || spot.length > TAKEN_SPOT_MAX_LENGTH) return;
        if (clean.length >= TAKEN_SPOT_LIMIT || clean.indexOf(spot) >= 0) return;
        clean.push(spot);
    });
    return clean;
}

// world3d/world.js takeRelic / door.js: this spot is empty for the rest of the vigil.
function markTakenSpot(state, id) {
    if (!state || typeof id !== 'string' || !id || id.length > TAKEN_SPOT_MAX_LENGTH) {
        return null;
    }
    if (!Array.isArray(state.takenSpots)) {
        state.takenSpots = [];
    }
    if (state.takenSpots.length < TAKEN_SPOT_LIMIT && state.takenSpots.indexOf(id) < 0) {
        state.takenSpots.push(id);
    }
    return state.takenSpots;
}

function clampDevotion(value) {
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
    return Math.max(DEVOTION_CONFIG.min, Math.min(DEVOTION_CONFIG.max, Math.round(safeValue)));
}

function adjustDevotion(state, delta) {
    if (!state) {
        return 0;
    }

    state.devotion = clampDevotion((Number(state.devotion) || 0) + (Number(delta) || 0));
    return state.devotion;
}

function bumpRunStat(state, key, amount = 1) {
    if (!state) {
        return;
    }

    if (!state.runStats || typeof state.runStats !== 'object') {
        state.runStats = createEmptyRunStats();
    }

    state.runStats[key] = Math.max(0, (Number(state.runStats[key]) || 0) + amount);
}

// 'exorcism' | 'corruption' | 'limbo' — the ending the current devotion leads to.
function getDevotionPath(devotion) {
    const value = clampDevotion(devotion);
    if (value >= DEVOTION_CONFIG.endingThreshold) {
        return 'exorcism';
    }
    if (value <= -DEVOTION_CONFIG.endingThreshold) {
        return 'corruption';
    }
    return 'limbo';
}

function isFinalAltarPhase(state) {
    return (Number(state && state.currentRound) || 1) >= THE_NUN_FINAL_PHASE;
}

/**
 * Create a new game state
 */
function createGameState() {
    window.state = {
        // Game progression
        currentZone: 1, // Zones 1-5
        currentRound: 1,
        maxZones: 5,

        // Collectibles
        crossesCollected: 0,
        booksCollected: 0,

        // Ending progression tracking
        helpNunProgress: 0, // 0-5
        helpDemonProgress: 0, // 0-5
        demonExorcismProgress: 0, // 0-5
        nunCorruptionProgress: 0, // 0-5
        attackNunProgress: 0, // 0-5
        attackDemonProgress: 0, // 0-5

        // Difficulty scaling based on round
        difficultyMultiplier: 1,

        // Nun state (clothing diminishes through runs)
        nunClothingState: 1, // 1-5, where 5 is bare

        // -100 (corruption) .. +100 (purity); picks the ending at the final altar.
        devotion: 0,

        // Per-run tallies shown on the end-of-run screen.
        runStats: createEmptyRunStats(),

        // The first demon attack of a fresh run is scheduled late and runs slowly.
        firstAttackDone: false,

        // Relic spots already emptied in the current vigil (normalizeTakenSpots): a
        // retried vigil rebuilds the same level with these already gone.
        takenSpots: [],

        // Active demon attack
        activeDemonAttack: null,

        // Game state flags
        isAtAltar: false,
        isLookingBack: false,
        isPowerStruggle: false,
        isTimePaused: false,
        gameOver: false
    };

    syncDerivedGameState(state);

    console.log('GameState initialized');
    return state;
}

/**
 * Get difficulty-scaled values
 */
function getDifficulty(state) {
    const runIndex = getRunIndex(state);
    const minAttackInterval = Math.max(
        RUN_DIFFICULTY_CONFIG.demonAttackIntervalMinFloorMs,
        RUN_DIFFICULTY_CONFIG.demonAttackIntervalMinBaseMs - (runIndex * RUN_DIFFICULTY_CONFIG.demonAttackIntervalMinStepMs)
    );
    const maxAttackInterval = Math.max(
        RUN_DIFFICULTY_CONFIG.demonAttackIntervalMaxFloorMs,
        RUN_DIFFICULTY_CONFIG.demonAttackIntervalMaxBaseMs - (runIndex * RUN_DIFFICULTY_CONFIG.demonAttackIntervalMaxStepMs)
    );

    return {
        runIndex,
        lightDecaySpeed: RUN_DIFFICULTY_CONFIG.lightDecayBase + (runIndex * RUN_DIFFICULTY_CONFIG.lightDecayPerRun),
        demonClicksRequired: RUN_DIFFICULTY_CONFIG.demonClicksBase + (runIndex * RUN_DIFFICULTY_CONFIG.demonClicksPerRun),
        demonAttackIntervalMinMs: minAttackInterval,
        demonAttackIntervalMaxMs: Math.max(minAttackInterval + 1000, maxAttackInterval),
        demonSpeed: RUN_DIFFICULTY_CONFIG.demonSpeedBase + (runIndex * RUN_DIFFICULTY_CONFIG.demonSpeedPerRun),
        demonVisibility: Math.max(
            RUN_DIFFICULTY_CONFIG.demonVisibilityFloor,
            RUN_DIFFICULTY_CONFIG.demonVisibilityBase - (runIndex * RUN_DIFFICULTY_CONFIG.demonVisibilityPerRun)
        ),
        nunVideoSpeed: getNunApproachPlaybackRate(runIndex)
    };
}

function getNunApproachPlaybackRate(runIndex) {
    const table = RUN_DIFFICULTY_CONFIG.nunApproachSecondsByPhase;
    const approachSeconds = table[Math.max(0, Math.min(table.length - 1, runIndex))];
    const rate = RUN_DIFFICULTY_CONFIG.nunApproachClipSeconds / Math.max(1, approachSeconds);
    return Math.min(RUN_DIFFICULTY_CONFIG.nunVideoSpeedMax, rate);
}

function isAltarRouteComplete(state, routeKey) {
    const rule = Object.values(ALTAR_ROUTE_RULES).find((entry) => entry.key === routeKey);
    if (!rule) {
        return false;
    }

    return (Number(state[rule.progressKey]) || 0) >= getAltarProgressLimit(routeKey);
}

function resolveRouteRequirement(state, routeKey, progress) {
    return isAltarRouteComplete(state, routeKey)
        ? ALTAR_REPLAY_COST
        : resolveAltarRequirement(routeKey, progress);
}

/**
 * Get requirements for altar choices
 */
function getAltarRequirements(state) {
    return {
        helpNun: resolveRouteRequirement(state, 'helpNun', state.helpNunProgress),
        helpDemon: resolveRouteRequirement(state, 'helpDemon', state.helpDemonProgress),
        demonExorcism: resolveRouteRequirement(state, 'demonExorcism', state.demonExorcismProgress),
        nunCorruption: resolveRouteRequirement(state, 'nunCorruption', state.nunCorruptionProgress),
        attackNun: isAltarAttackComplete(state, 'attack-nun')
            ? ALTAR_REPLAY_COST
            : resolveAltarRequirement('helpNun', state.attackNunProgress),
        attackDemon: isAltarAttackComplete(state, 'attack-demon')
            ? ALTAR_REPLAY_COST
            : resolveAltarRequirement('helpDemon', state.attackDemonProgress)
    };
}

/**
 * Advance to next zone
 */
function nextZone(state) {
    if (state.currentZone < state.maxZones) {
        state.currentZone++;
        console.log(`Advanced to Zone ${state.currentZone}`);
        return true;
    } else {
        // Reached the altar
        state.isAtAltar = true;
        console.log('Reached the Altar!');
        return false;
    }
}

/**
 * Start next round (after altar ending)
 */
function advanceGameRound(state) {
    state.currentRound++;
    state.currentZone = 1;
    // The vigil was banked at the altar, so the next one is stocked in full again.
    state.takenSpots = [];
    state.isAtAltar = false;
    state.isLookingBack = false;
    state.isPowerStruggle = false;
    state.isTimePaused = false;
    state.activeDemonAttack = null;
    state.gameOver = false;

    syncDerivedGameState(state);

    console.log(`Started Phase ${state.currentRound}, Nun Clothing State: ${state.nunClothingState}`);
}

function advanceRouteProgress(state, routeKey) {
    const progressLimit = getAltarProgressLimit(routeKey);
    state[routeKey] = Math.min(progressLimit, (Number(state[routeKey]) || 0) + 1);
    return state[routeKey];
}

/**
 * Collect a cross (a relic of the Nun: pulls devotion toward purity)
 */
function collectCross(state) {
    state.crossesCollected++;
    adjustDevotion(state, DEVOTION_CONFIG.perCross);
    bumpRunStat(state, 'relics');
}

/**
 * Collect a book (a forbidden text: pulls devotion toward corruption)
 */
function collectBook(state) {
    state.booksCollected++;
    adjustDevotion(state, DEVOTION_CONFIG.perBook);
    bumpRunStat(state, 'relics');
}

/**
 * Lose collectibles on demon attack failure
 */
function loseCollectibles(state, amount) {
    const crossesLost = Math.min(amount, state.crossesCollected);
    const booksLost = Math.min(amount, state.booksCollected);

    state.crossesCollected -= crossesLost;
    state.booksCollected -= booksLost;

    console.log(`Lost ${crossesLost} crosses and ${booksLost} books`);
}

/**
 * Attack routes (altar duel, scripts/altarDuel.js). Paying happens when the duel
 * starts; progress only advances when all three minigames are won.
 */
function getAltarAttackCost(state, choice) {
    const route = ALTAR_ATTACK_ROUTES[choice];
    if (!route) {
        return null;
    }

    const requirements = getAltarRequirements(state);
    return {
        amount: requirements[route.routeKey],
        resource: route.resource,
        current: Number(state[route.resource]) || 0
    };
}

function payAltarAttackCost(state, choice) {
    const cost = getAltarAttackCost(state, choice);
    if (!cost) {
        return { success: false, choice, reason: 'unknown-choice' };
    }

    if (cost.current < cost.amount) {
        return {
            success: false,
            choice,
            reason: cost.resource === 'crossesCollected' ? 'insufficient-crosses' : 'insufficient-books',
            required: cost.amount,
            current: cost.current
        };
    }

    state[cost.resource] = cost.current - cost.amount;
    console.log(`[ALTAR] ${choice} duel started (spent ${cost.amount} ${cost.resource === 'crossesCollected' ? 'crosses' : 'books'})`);
    return { success: true, choice, spent: cost.amount };
}

// A won duel counts like a rite: the route advances (or is relived once finished),
// devotion moves toward that side, and the run's rite count and best route record it.
function isAltarAttackComplete(state, choice) {
    const route = ALTAR_ATTACK_ROUTES[choice];
    return Boolean(route) && (Number(state[route.progressKey]) || 0) >= getAltarProgressLimit(route.routeKey);
}

function completeAltarAttack(state, choice) {
    const route = ALTAR_ATTACK_ROUTES[choice];
    if (!route) {
        return { success: false, choice, reason: 'unknown-choice' };
    }

    const isReplay = isAltarAttackComplete(state, choice);
    const routeProgress = isReplay
        ? getAltarProgressLimit(route.routeKey)
        : advanceRouteProgress(state, route.progressKey);
    const progressLimit = getAltarProgressLimit(route.routeKey);
    adjustDevotion(state, (isReplay ? DEVOTION_CONFIG.replay : DEVOTION_CONFIG.rite)[route.routeKey]);
    bumpRunStat(state, 'rites');
    if (!isReplay && typeof window !== 'undefined' && typeof window.recordTheNunRouteBest === 'function') {
        window.recordTheNunRouteBest(route.routeKey, routeProgress);
    }
    console.log(`[VIDEO TRIGGER] ${choice} - Scene ${routeProgress}/${progressLimit}`);
    return {
        success: true,
        choice,
        sceneIndex: routeProgress,
        routeProgress,
        gameOver: false
    };
}

/**
 * Handle altar choice selection. Every paid route works the same way: pay the next
 * scene's price, advance the route, pull devotion toward that side. A finished route
 * stays open as a cheaper "relive the last scene" so the altar is never a dead end.
 */
function selectAltarChoice(state, choice) {
    if (choice === 'surrender') {
        return {
            success: true,
            choice,
            sceneIndex: null,
            routeProgress: null,
            gameOver: false
        };
    }

    const rule = ALTAR_ROUTE_RULES[choice];
    if (!rule) {
        return { success: false, choice, reason: 'unknown-choice' };
    }

    if (!isAltarChoiceUnlockedByEdition(choice)) {
        return { success: false, choice, reason: 'locked', locked: true };
    }

    const isReplay = isAltarRouteComplete(state, rule.key);
    const required = getAltarRequirements(state)[rule.key];
    const current = Number(state[rule.currencyKey]) || 0;

    if (current < required) {
        return {
            success: false,
            choice,
            reason: `insufficient-${rule.currency}`,
            required,
            current
        };
    }

    state[rule.currencyKey] = current - required;

    const routeProgress = isReplay
        ? getAltarProgressLimit(rule.key)
        : advanceRouteProgress(state, rule.progressKey);

    adjustDevotion(state, (isReplay ? DEVOTION_CONFIG.replay : DEVOTION_CONFIG.rite)[rule.key]);
    bumpRunStat(state, 'rites');

    if (!isReplay && typeof window !== 'undefined' && typeof window.recordTheNunRouteBest === 'function') {
        window.recordTheNunRouteBest(rule.key, routeProgress);
    }

    return {
        success: true,
        choice,
        sceneIndex: routeProgress,
        routeProgress,
        replay: isReplay,
        gameOver: false
    };
}

/**
 * Restore a saved run (checkpoint) onto a live game state.
 */
function applyRunSnapshot(state, run) {
    if (!state || !run) {
        return state;
    }

    const routes = run.routes || {};
    state.currentRound = Math.max(1, Number(run.phase) || 1);
    state.currentZone = 1;
    state.crossesCollected = Math.max(0, Number(run.crosses) || 0);
    state.booksCollected = Math.max(0, Number(run.books) || 0);
    state.helpNunProgress = Math.max(0, Number(routes.helpNun) || 0);
    state.helpDemonProgress = Math.max(0, Number(routes.helpDemon) || 0);
    state.demonExorcismProgress = Math.max(0, Number(routes.demonExorcism) || 0);
    state.nunCorruptionProgress = Math.max(0, Number(routes.nunCorruption) || 0);
    state.attackNunProgress = Math.max(0, Number(routes.attackNun) || 0);
    state.attackDemonProgress = Math.max(0, Number(routes.attackDemon) || 0);
    state.devotion = clampDevotion(run.devotion);
    state.runStats = Object.assign(createEmptyRunStats(), run.stats || {});
    // Optional: an old save has none, and the retried vigil is stocked in full as before.
    state.takenSpots = normalizeTakenSpots(run.takenSpots);
    state.firstAttackDone = true;
    state.isAtAltar = false;
    state.isLookingBack = false;
    state.gameOver = false;
    syncDerivedGameState(state);
    return state;
}

/**
 * Snapshot of a live game state in the saved-run shape.
 */
function buildRunSnapshot(state) {
    return {
        phase: Number(state.currentRound) || 1,
        crosses: Number(state.crossesCollected) || 0,
        books: Number(state.booksCollected) || 0,
        devotion: clampDevotion(state.devotion),
        routes: {
            helpNun: Number(state.helpNunProgress) || 0,
            helpDemon: Number(state.helpDemonProgress) || 0,
            demonExorcism: Number(state.demonExorcismProgress) || 0,
            nunCorruption: Number(state.nunCorruptionProgress) || 0,
            attackNun: Number(state.attackNunProgress) || 0,
            attackDemon: Number(state.attackDemonProgress) || 0
        },
        stats: Object.assign(createEmptyRunStats(), state.runStats || {}),
        // Emptied this vigil; the retry after a catch keeps them empty.
        takenSpots: normalizeTakenSpots(state.takenSpots)
    };
}

/**
 * Reset game to initial state
 */
function resetGame(state) {
    state.currentZone = 1;
    state.currentRound = 1;
    state.crossesCollected = 0;
    state.booksCollected = 0;
    state.helpNunProgress = 0;
    state.helpDemonProgress = 0;
    state.demonExorcismProgress = 0;
    state.nunCorruptionProgress = 0;
    state.attackNunProgress = 0;
    state.attackDemonProgress = 0;
    state.activeDemonAttack = null;
    state.isAtAltar = false;
    state.isLookingBack = false;
    state.isTimePaused = false;
    state.gameOver = false;
    state.devotion = 0;
    state.runStats = createEmptyRunStats();
    state.takenSpots = [];
    state.firstAttackDone = false;
    syncDerivedGameState(state);

    console.log('Game reset to initial state');
}

/**
 * Get current game stats
 */
function getStats(state) {
    return {
        zone: state.currentZone,
        round: state.currentRound,
        crosses: state.crossesCollected,
        books: state.booksCollected,
        helpNunProgress: state.helpNunProgress,
        helpDemonProgress: state.helpDemonProgress,
        demonExorcismProgress: state.demonExorcismProgress,
        nunCorruptionProgress: state.nunCorruptionProgress,
        attackNunProgress: state.attackNunProgress || 0,
        attackDemonProgress: state.attackDemonProgress || 0,
        nunClothingState: state.nunClothingState,
        devotion: clampDevotion(state.devotion)
    };
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.createGameState = createGameState;
    window.getDifficulty = getDifficulty;
    window.getAltarProgressLimit = getAltarProgressLimit;
    window.getAltarRouteSceneCount = getAltarRouteSceneCount;
    window.setAltarProgressLimits = function(counts) {
        if (counts && typeof counts === 'object') {
            Object.keys(ALTAR_PROGRESS_LIMITS).forEach(key => {
                if (counts[key] > 0) {
                    ALTAR_PROGRESS_LIMITS[key] = counts[key];
                }
            });
        }
    };
    window.getAltarRequirements = getAltarRequirements;
    window.advanceGameRound = advanceGameRound;
    window.nextZone = nextZone;
    window.collectCross = collectCross;
    window.collectBook = collectBook;
    window.loseCollectibles = loseCollectibles;
    window.selectAltarChoice = selectAltarChoice;
    window.getAltarAttackCost = getAltarAttackCost;
    window.payAltarAttackCost = payAltarAttackCost;
    window.completeAltarAttack = completeAltarAttack;
    window.isAltarAttackComplete = isAltarAttackComplete;
    window.resetGame = resetGame;
    window.getStats = getStats;
    window.theNunBalanceConfig = {
        runDifficulty: RUN_DIFFICULTY_CONFIG,
        altarRequirements: ALTAR_REQUIREMENT_TABLES,
        altarProgressLimits: ALTAR_PROGRESS_LIMITS,
        altarReplayCost: ALTAR_REPLAY_COST,
        devotion: DEVOTION_CONFIG,
        finalPhase: THE_NUN_FINAL_PHASE
    };
    window.THE_NUN_FINAL_PHASE = THE_NUN_FINAL_PHASE;
    window.adjustTheNunDevotion = adjustDevotion;
    window.bumpTheNunRunStat = bumpRunStat;
    window.getTheNunDevotionPath = getDevotionPath;
    window.isTheNunFinalAltarPhase = isFinalAltarPhase;
    window.isTheNunAltarRouteComplete = isAltarRouteComplete;
    window.applyTheNunRunSnapshot = applyRunSnapshot;
    window.buildTheNunRunSnapshot = buildRunSnapshot;
    window.markTheNunSpotTaken = markTakenSpot;
    window.normalizeTheNunTakenSpots = normalizeTakenSpots;
}
