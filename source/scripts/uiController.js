/**
 * UIController - Manages all UI updates and interactions
 */

// Configuration constants
const UI_CONFIG = {
    LOCKED_SUPPORT_MESSAGE_KEY: 'upgrade.locked_support',
    LOOK_BACK_COOLDOWN: 4000,
    ENDING_SCENE_DURATION: 5000
};

const ALTAR_HANDOFF_VIDEO_HOLD_MS = 120;
// The altar intro (3CA1*.mp4) is held this far before its end under the choices
// (playRoundOneAltarIntro): the last frames of 3CA1V5 are empty of both women.
const ALTAR_INTRO_HOLD_BACK_SECONDS = 0.08;
const ALTAR_HANDOFF_IMAGE_HOLD_MS = 120;
const ALTAR_HANDOFF_CROSSFADE_MS = 220;
const ALTAR_TRANSITION_LIGHT_RAMP_FALLBACK_MS = 1200;
const ALTAR_TRANSITION_BACKGROUND_SOURCE = 'assets/backgrounds/transition_altar.png';

const ALTAR_VIDEO_SOURCES = {
    'help-nun': 'assets/backgrounds/nun.mp4',
    'help-demon': 'assets/backgrounds/1R1TRM.mp4',
    'surrender': 'assets/scenes/rewards/3SS1.mp4',
    // The Limbo ending is its own single full scene (no teaser / loop / cum parts).
    'limbo-ending': 'assets/scenes/rewards/3SLIMBO.mp4',
    'demon-exorcism': 'assets_gold/scenes/attacks/2ADA1.mp4',
    'nun-corruption': 'assets_diamond/scenes/attacks/2APA1.mp4',
    'attack-nun': 'assets/backgrounds/nun.mp4',
    'attack-demon': 'assets/backgrounds/1R1TRM.mp4'
};

// Choices whose scene is ONE whole video: it plays through once, unlooped, and the
// ending flow continues by itself when it ends (no reward teaser/loop/cum sequence).
const SINGLE_PLAY_ENDING_CHOICES = ['limbo-ending'];

const NAVIGATION_HOTKEY_ACTIONS = {
    arrowdown: 'look-back',
    s: 'look-back',
    arrowup: 'go-forward',
    w: 'go-forward'
};

function isVisibleOverlayElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        return false;
    }

    return element.style.display !== 'none' && !element.classList.contains('hidden');
}

function getNavigationHotkeyAction(event) {
    const normalizedKey = String(event?.key || '').trim().toLowerCase();
    return NAVIGATION_HOTKEY_ACTIONS[normalizedKey] || null;
}

function isNavigationHotkeyBlocked(controller) {
    if (!controller || controller !== window.uiController) {
        return true;
    }

    const nunCaughtActive = Boolean(
        window.nunSystem && (
            window.nunSystem.isPlayingNunCaughtScene
            || window.nunSystem.nunCaughtSceneStage !== 'idle'
            || window.nunSystem.isTransitioningNunCaughtStage
        )
    );

    const demonAttackSequenceActive = Boolean(
        controller.gameState?.isPowerStruggle
        || isVisibleOverlayElement('attack-caught-overlay')
        || isVisibleOverlayElement('power-struggle-screen')
    );

    return Boolean(
        isVisibleOverlayElement('phase-intro-overlay')
        || demonAttackSequenceActive
        || nunCaughtActive
        || controller.gameState?.isAtAltar
        || isVisibleOverlayElement('altar-screen')
        || controller.zoneForwardTransitionActive
    );
}

const ALTAR_HELP_REWARD_CONFIGS = {
    'surrender': {
        prefix: '3SS',
        basePath: 'assets/scenes/rewards',
        cumPath: 'assets_diamond/scenes/rewards'
    },
    'help-demon': {
        prefix: '3SHD',
        basePath: 'assets/scenes/rewards',
        cumPath: 'assets_diamond/scenes/rewards'
    },
    'help-nun': {
        prefix: '3SHN',
        basePath: 'assets/scenes/rewards',
        cumPath: 'assets_diamond/scenes/rewards'
    },
    'demon-exorcism': {
        prefix: '3SDE',
        basePath: 'assets_gold/scenes/rewards',
        cumPath: 'assets_gold/scenes/rewards'
    },
    'nun-corruption': {
        prefix: '3SCN',
        basePath: 'assets_diamond/scenes/rewards',
        cumPath: 'assets_diamond/scenes/rewards'
    }
    // Attack routes (3SAN / 3SAD) have their own win -> cum inside/outside player
    // in scripts/altarDuel.js.
};

// Scene indexes are no longer hardcoded; any index up to the progress limit is valid.

function getRoundScopedChurchZoneIntro(round) {
    const safeRound = Math.max(1, Math.min(5, Number(round) || 1));

    if (safeRound === 1) {
        return {
            video: 'assets/scenes/others/3CA1.mp4'
        };
    }

    return {
        video: `assets/scenes/others/3CA1V${safeRound}.mp4`
    };
}

function getPhaseStartIntroSource(phase) {
    // Intros exist for outfits 1-5 only; the final vigil (6) reuses the last one.
    const safePhase = Math.max(1, Math.min(5, Number(phase) || 1));
    return safePhase === 1
        ? 'assets/scenes/others/3Z1.mp4'
        : `assets/scenes/others/3Z1V${safePhase}.mp4`;
}

function playPhaseStartIntro(controller, onComplete) {
    const PHASE_INTRO_TRANSITION_MS = 700;
    const overlay = document.getElementById('phase-intro-overlay');
    const introVideo = document.getElementById('phase-intro-video');
    const continueBtn = document.getElementById('phase-intro-continue');
    const phase = controller && controller.gameState ? controller.gameState.currentRound : 1;
    const src = getPhaseStartIntroSource(phase);

    markGallerySceneSeenBySource(src);

    if (!overlay || !introVideo) {
        if (typeof onComplete === 'function') onComplete();
        return;
    }

    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;

        if (typeof window.hideTheNunPhaseTitle === 'function') {
            window.hideTheNunPhaseTitle();
        }
        if (continueBtn) continueBtn.removeEventListener('click', finish);
        introVideo.onended = null;
        introVideo.onerror = null;
        introVideo.pause();
        if (typeof onComplete === 'function') onComplete();

        overlay.classList.add('is-exiting');

        window.setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('is-exiting');
            try { introVideo.currentTime = 0; } catch (_) { /* ignore */ }
        }, PHASE_INTRO_TRANSITION_MS);
    };

    introVideo.pause();
    introVideo.onended = null;
    introVideo.onerror = null;
    introVideo.loop = false;
    introVideo.muted = true;
    introVideo.playsInline = true;
    introVideo.src = src;
    introVideo.load();

    introVideo.onended = finish;
    introVideo.onerror = () => {
        console.warn(`[VIDEO] Phase start intro video not found: ${src}`);
        finish();
    };

    if (continueBtn) continueBtn.addEventListener('click', finish);

    overlay.classList.remove('hidden');
    if (typeof window.showTheNunPhaseTitle === 'function') {
        window.showTheNunPhaseTitle(phase);
    }

    if (typeof window.syncAmbientCharacterAudioState === 'function') {
        window.syncAmbientCharacterAudioState();
    }

    const playPromise = introVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => finish());
    }
}

function markGallerySceneSeenBySource(source) {
    if (typeof window.markTheNunGallerySceneSeenBySource === 'function') {
        window.markTheNunGallerySceneSeenBySource(source);
    }
}

const ALTAR_HOVER_SHADE_CLASSES = {
    left: 'altar-screen--shade-left',
    right: 'altar-screen--shade-right'
};

function formatAltarProgress(currentValue, totalValue) {
    if ((currentValue || 0) >= totalValue) {
        return window.t('altar.replay_label');
    }
    const next = (currentValue || 0) + 1;
    return window.t('altar.scene_counter', { current: next, total: totalValue });
}

// Per-route UI data: which relic pays for it and where its preview stills live.
const ALTAR_ROUTE_UI = {
    'help-nun':       { routeKey: 'helpNun',       progressStat: 'helpNunProgress',       currency: 'crosses', prefix: '3SHN', shotDir: 'assets/scenes/screenshots/rewards',         edition: 'base' },
    'help-demon':     { routeKey: 'helpDemon',     progressStat: 'helpDemonProgress',     currency: 'books',   prefix: '3SHD', shotDir: 'assets/scenes/screenshots/rewards',         edition: 'base' },
    'demon-exorcism': { routeKey: 'demonExorcism', progressStat: 'demonExorcismProgress', currency: 'crosses', prefix: '3SDE', shotDir: 'assets_gold/scenes/screenshots/rewards',    edition: 'gold' },
    'nun-corruption': { routeKey: 'nunCorruption', progressStat: 'nunCorruptionProgress', currency: 'books',   prefix: '3SCN', shotDir: 'assets_diamond/scenes/screenshots/rewards', edition: 'diamond' }
};

function isRewardSceneSeenInGallery(sceneCode, editionKey) {
    try {
        if (typeof window.getTheNunGallerySaveData !== 'function' || typeof window.resolveTheNunGallerySceneUnlockKeyByCode !== 'function') {
            return false;
        }

        const seen = (window.getTheNunGallerySaveData().seenScenes || {}).byKey || {};
        return [editionKey, 'base'].some((edition) => {
            const key = window.resolveTheNunGallerySceneUnlockKeyByCode('reward', sceneCode, edition);
            return Boolean(key && seen[key]);
        });
    } catch (error) {
        return false;
    }
}

// A still of the scene this rite buys, shown on hover. Unseen scenes stay blurred.
function updateChoiceScenePreview(button, route, sceneIndex, isReplay) {
    let preview = button.querySelector('.choice-scene-preview');
    if (!sceneIndex) {
        if (preview) {
            preview.remove();
        }
        return;
    }

    if (!preview) {
        preview = document.createElement('span');
        preview.className = 'choice-scene-preview';
        preview.setAttribute('aria-hidden', 'true');
        const image = document.createElement('img');
        image.alt = '';
        image.addEventListener('error', () => preview.classList.add('is-missing'));
        image.addEventListener('load', () => preview.classList.remove('is-missing'));
        const caption = document.createElement('span');
        caption.className = 'choice-scene-preview__caption';
        preview.appendChild(image);
        preview.appendChild(caption);
        button.appendChild(preview);
    }

    const sceneCode = `${route.prefix}${sceneIndex}`;
    const source = `${route.shotDir}/${sceneCode}.webp`;
    const image = preview.querySelector('img');
    if (image && image.getAttribute('src') !== source) {
        image.setAttribute('src', source);
    }

    const caption = preview.querySelector('.choice-scene-preview__caption');
    if (caption) {
        caption.textContent = window.t(isReplay ? 'altar.preview_replay' : 'altar.preview_next', { index: sceneIndex });
    }

    preview.classList.toggle('is-seen', isRewardSceneSeenInGallery(sceneCode, route.edition));
}

function getAltarPathLineElement() {
    let line = document.getElementById('altar-path-line');
    if (line) {
        return line;
    }

    const altarScreen = document.getElementById('altar-screen');
    if (!altarScreen) {
        return null;
    }

    line = document.createElement('div');
    line.id = 'altar-path-line';
    line.className = 'altar-path-line';
    altarScreen.appendChild(line);
    return line;
}

function updateAltarPathLine(controller) {
    const line = getAltarPathLineElement();
    if (!line || !controller || !controller.gameState) {
        return;
    }

    const state = controller.gameState;
    const finalPhase = window.THE_NUN_FINAL_PHASE || 6;
    const path = typeof window.getTheNunDevotionPath === 'function'
        ? window.getTheNunDevotionPath(state.devotion)
        : 'limbo';

    if (typeof window.isTheNunFinalAltarPhase === 'function' && window.isTheNunFinalAltarPhase(state)) {
        line.textContent = window.t('altar.path_line_final');
        return;
    }

    line.textContent = window.t('altar.path_line', {
        path: window.t(`ending.${path}.name`),
        vigil: state.currentRound,
        final: finalPhase
    });
}

// --- The final rite: the altar of the last vigil offers the endings instead of rites.
const FINAL_RITE_ENDINGS = ['exorcism', 'limbo', 'corruption'];

function isFinalRiteAltar(controller) {
    return Boolean(
        controller
        && controller.gameState
        && typeof window.isTheNunFinalAltarPhase === 'function'
        && window.isTheNunFinalAltarPhase(controller.gameState)
    );
}

function isFinalRiteEndingOpen(endingKey, devotion) {
    const threshold = window.theNunBalanceConfig?.devotion?.endingThreshold || 25;
    if (endingKey === 'exorcism') {
        return devotion >= threshold;
    }
    if (endingKey === 'corruption') {
        return devotion <= -threshold;
    }
    return true;
}

// Which reward scene plays for each ending. Editions without the gold/diamond
// routes fall back to the last scene of the matching base route.
// Exorcism and Corruption end on their route's LAST scene on disk, which the altar
// never sells (gameState.js ALTAR_ENDING_RESERVED_SCENES: 2/2 is the ending). The
// base edition, which lacks those scenes, falls back to its Help route's last scene.
function resolveFinalRiteScene(endingKey) {
    const limitOf = (routeKey) => {
        const count = typeof window.getAltarRouteSceneCount === 'function'
            ? window.getAltarRouteSceneCount(routeKey)
            : (typeof window.getAltarProgressLimit === 'function' ? window.getAltarProgressLimit(routeKey) : 1);
        return Math.max(1, Number(count) || 1);
    };

    if (endingKey === 'exorcism') {
        return isChoiceEditionLocked('demon-exorcism')
            ? { choice: 'help-nun', sceneIndex: limitOf('helpNun') }
            : { choice: 'demon-exorcism', sceneIndex: limitOf('demonExorcism') };
    }

    if (endingKey === 'corruption') {
        return isChoiceEditionLocked('nun-corruption')
            ? { choice: 'help-demon', sceneIndex: limitOf('helpDemon') }
            : { choice: 'nun-corruption', sceneIndex: limitOf('nunCorruption') };
    }

    // Limbo has its own dedicated ending scene, played whole and once.
    return { choice: 'limbo-ending', sceneIndex: 1 };
}

function ensureFinalRitePanel() {
    let panel = document.getElementById('altar-final-rite');
    if (panel) {
        return panel;
    }

    const altarChoices = document.getElementById('altar-choices');
    if (!altarChoices) {
        return null;
    }

    panel = document.createElement('div');
    panel.id = 'altar-final-rite';
    panel.className = 'altar-final-rite';

    const intro = document.createElement('p');
    intro.className = 'altar-final-rite__intro';
    const options = document.createElement('div');
    options.className = 'altar-final-rite__options';

    panel.appendChild(intro);
    panel.appendChild(options);
    altarChoices.appendChild(panel);
    return panel;
}

function renderFinalRitePanel(controller) {
    const panel = ensureFinalRitePanel();
    const altarTitle = document.querySelector('#altar-choices h2');
    const isFinal = isFinalRiteAltar(controller);

    if (controller && controller.altarScreen) {
        controller.altarScreen.classList.toggle('is-final-rite', isFinal);
    }

    if (altarTitle) {
        altarTitle.textContent = window.t(isFinal ? 'final.title' : 'altar.choose_your_fate');
    }

    if (!panel || !isFinal) {
        return;
    }

    const devotion = Number(controller.gameState.devotion) || 0;
    const threshold = window.theNunBalanceConfig?.devotion?.endingThreshold || 25;
    const endingsSeen = typeof window.getTheNunProgress === 'function'
        ? window.getTheNunProgress().endingsSeen
        : {};

    panel.querySelector('.altar-final-rite__intro').textContent = window.t('final.subtitle', {
        devotion: devotion > 0 ? `+${devotion}` : String(devotion)
    });

    const options = panel.querySelector('.altar-final-rite__options');
    options.innerHTML = '';

    FINAL_RITE_ENDINGS.forEach((endingKey) => {
        const isOpen = isFinalRiteEndingOpen(endingKey, devotion);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `final-rite-btn final-rite-btn--${endingKey}${isOpen ? '' : ' is-sealed'}`;
        button.disabled = !isOpen || Boolean(controller.pendingAltarChoice);

        const name = document.createElement('span');
        name.className = 'final-rite-btn__name';
        name.textContent = window.t(`ending.${endingKey}.name`);

        const hint = document.createElement('span');
        hint.className = 'final-rite-btn__hint';
        hint.textContent = isOpen
            ? window.t(endingKey === 'limbo' ? 'final.limbo_open' : 'final.ending_open')
            : window.t(endingKey === 'exorcism' ? 'final.exorcism_sealed' : 'final.corruption_sealed', { count: threshold });

        button.appendChild(name);
        button.appendChild(hint);

        if (endingsSeen && endingsSeen[endingKey]) {
            const seen = document.createElement('span');
            seen.className = 'final-rite-btn__seen';
            seen.textContent = window.t('final.seen_before');
            button.appendChild(seen);
        }

        button.addEventListener('click', () => handleFinalRiteChoice(controller, endingKey));
        options.appendChild(button);
    });
}

function handleFinalRiteChoice(controller, endingKey) {
    if (controller !== window.uiController || !controller || controller.pendingAltarChoice) {
        return;
    }

    if (!isFinalRiteEndingOpen(endingKey, Number(controller.gameState.devotion) || 0)) {
        return;
    }

    const scene = resolveFinalRiteScene(endingKey);
    controller.pendingEnding = endingKey;
    controller.pendingAltarChoice = scene.choice;
    setAltarChoicesLocked(controller, true);
    document.querySelectorAll('.final-rite-btn').forEach((button) => {
        button.disabled = true;
    });

    if (typeof window.syncAmbientCharacterAudioState === 'function') {
        window.syncAmbientCharacterAudioState();
    }

    showEndingScene(controller, scene.choice, {
        choice: scene.choice,
        sceneIndex: scene.sceneIndex,
        routeProgress: scene.sceneIndex
    });
}

function getAltarProgressDisplayTotal(choice) {
    if (typeof window.getAltarProgressLimit === 'function') {
        return window.getAltarProgressLimit(choice);
    }

    return 5;
}

// Reward file prefixes and their asset folder per choice
const REWARD_FILE_PREFIXES = {
    'helpNun':       { prefix: '3SHN', folder: 'assets/scenes/rewards' },
    'helpDemon':     { prefix: '3SHD', folder: 'assets/scenes/rewards' },
    'demonExorcism': { prefix: '3SDE', folder: 'assets_gold/scenes/rewards' },
    'nunCorruption': { prefix: '3SCN', folder: 'assets_diamond/scenes/rewards' },
    'attackNun':     { prefix: '3SAN', folder: 'assets/scenes/rewards' },
    'attackDemon':   { prefix: '3SAD', folder: 'assets/scenes/rewards' }
};

async function loadAltarProgressLimitsFromRewards() {
    if (!window.electronAPI || typeof window.electronAPI.listAssetFiles !== 'function') {
        return;
    }

    try {
        const folderCache = {};
        const counts = {};

        for (const [choiceKey, config] of Object.entries(REWARD_FILE_PREFIXES)) {
            if (!folderCache[config.folder]) {
                folderCache[config.folder] = await window.electronAPI.listAssetFiles(config.folder);
            }
            const files = folderCache[config.folder];
            const sceneNumbers = files
                .map(f => f.replace(/\.mp4$/i, ''))
                .filter(base => base.startsWith(config.prefix))
                .map(base => {
                    const rest = base.slice(config.prefix.length);
                    const match = rest.match(/^(\d+)/);
                    return match ? parseInt(match[1], 10) : 0;
                })
                .filter(n => n > 0);
            const count = sceneNumbers.length > 0 ? Math.max(...sceneNumbers) : 0;
            if (count > 0) {
                counts[choiceKey] = count;
            }
        }

        if (typeof window.setAltarProgressLimits === 'function') {
            window.setAltarProgressLimits(counts);
            console.log('[Altar] Progress limits loaded from rewards folders:', counts);
        }
    } catch (err) {
        console.warn('[Altar] Failed to load progress limits from rewards:', err);
    }
}

function getCurrentAltarEditionKey() {
    if (typeof window.getActiveEditionKey === 'function') {
        return window.getActiveEditionKey();
    }

    return 'base';
}

function isChoiceEditionLocked(choice) {
    const editionKey = getCurrentAltarEditionKey();

    if (choice === 'demon-exorcism') {
        return editionKey !== 'gold' && editionKey !== 'diamond';
    }

    if (choice === 'nun-corruption') {
        return editionKey !== 'diamond';
    }

    return false;
}

function clearAltarHoverShade(controller) {
    if (!controller || !controller.altarScreen) {
        return;
    }

    controller.altarScreen.classList.remove(ALTAR_HOVER_SHADE_CLASSES.left, ALTAR_HOVER_SHADE_CLASSES.right);
}

function applyAltarHoverShade(controller, side) {
    if (!controller || !controller.altarScreen) {
        return;
    }

    controller.altarScreen.classList.toggle(ALTAR_HOVER_SHADE_CLASSES.left, side === 'left');
    controller.altarScreen.classList.toggle(ALTAR_HOVER_SHADE_CLASSES.right, side === 'right');
}

function getAltarHoverShadeSide(button) {
    if (!button) {
        return null;
    }

    if (button.classList.contains('choice-btn--help-nun') || button.classList.contains('choice-btn--attack-nun') || button.classList.contains('choice-btn--gold')) {
        return 'right';
    }

    if (button.classList.contains('choice-btn--help-demon') || button.classList.contains('choice-btn--attack-demon') || button.classList.contains('choice-btn--diamond')) {
        return 'left';
    }

    return null;
}

function updateAltarHoverShade(controller) {
    if (!controller || !controller.altarChoices || controller.altarChoices.length === 0) {
        return;
    }

    if (controller.pendingAltarChoice) {
        clearAltarHoverShade(controller);
        return;
    }

    const activeButton = Array.from(controller.altarChoices).find((button) => {
        const hoverShadeSide = getAltarHoverShadeSide(button);
        return hoverShadeSide && (button.matches(':hover') || button.matches(':focus') || button.matches(':focus-visible'));
    });

    if (!activeButton) {
        clearAltarHoverShade(controller);
        return;
    }

    applyAltarHoverShade(controller, getAltarHoverShadeSide(activeButton));
}

function ensureAltarCumButton() {
    let button = document.getElementById('altar-cum-button');
    if (button) {
        return button;
    }

    const altarScreen = document.getElementById('altar-screen');
    if (!altarScreen) {
        return null;
    }

    button = document.createElement('button');
    button.id = 'altar-cum-button';
    button.type = 'button';
    button.className = 'altar-cum-button hidden';

    const icon = document.createElement('img');
    icon.className = 'altar-cum-button_icon';
    icon.src = 'assets/icons/cum.png';
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'altar-cum-button_label';
    label.setAttribute('data-i18n', 'common.cum');
    label.textContent = window.t('common.cum');

    button.appendChild(icon);
    button.appendChild(label);
    altarScreen.appendChild(button);
    return button;
}

function getAltarHelpRewardSceneIndex(result) {
    const rawSceneIndex = Math.max(1, Number(result && (result.sceneIndex || result.routeProgress)) || 1);
    // every scene on disk may play (the endings play a route's reserved last scene,
    // past what the altar sells — gameState.js ALTAR_ENDING_RESERVED_SCENES)
    const sceneLimit = typeof window.getAltarRouteSceneCount === 'function'
        ? window.getAltarRouteSceneCount(result && result.choice)
        : (typeof window.getAltarProgressLimit === 'function'
            ? window.getAltarProgressLimit(result && result.choice)
            : rawSceneIndex);
    const safeLimit = Math.max(1, Number(sceneLimit) || rawSceneIndex);
    return Math.max(1, Math.min(safeLimit, rawSceneIndex));
}

function getAltarHelpRewardPlaybackConfig(choice, result) {
    const routeConfig = ALTAR_HELP_REWARD_CONFIGS[choice];
    const sceneIndex = getAltarHelpRewardSceneIndex({
        ...result,
        choice
    });

    if (!routeConfig) {
        return null;
    }

    const sceneCode = `${routeConfig.prefix}${sceneIndex}`;
    const teaserOnly = typeof window.isTheNunTeaserRouteScene === 'function'
        ? window.isTheNunTeaserRouteScene(choice, sceneIndex)
        : false;

    return {
        choice,
        sceneIndex,
        sceneCode,
        introSceneCode: `${sceneCode}T`,
        baseLoopSceneCode: sceneCode,
        introSource: `${routeConfig.basePath}/${sceneCode}T.mp4`,
        baseLoopSource: teaserOnly ? '' : `${routeConfig.basePath}/${sceneCode}.mp4`,
        cumLoopSource: teaserOnly ? '' : `${routeConfig.cumPath}/${sceneCode}C.mp4`,
        teaserOnly
    };
}

function markRewardScenesSeen(controller, rewardPlaybackConfig) {
    if (!controller || typeof window.markTheNunGallerySceneSeen !== 'function') {
        return;
    }

    if (rewardPlaybackConfig && typeof window.resolveTheNunGallerySceneUnlockKeyByCode === 'function') {
        [
            rewardPlaybackConfig.teaserOnly ? null : rewardPlaybackConfig.baseLoopSceneCode,
            rewardPlaybackConfig.introSceneCode
        ]
            .filter(Boolean)
            .forEach((sceneCode) => {
                const unlockKey = window.resolveTheNunGallerySceneUnlockKeyByCode('reward', sceneCode, 'base');
                if (unlockKey) {
                    window.markTheNunGallerySceneSeen(unlockKey);
                }
            });
        return;
    }

    markGallerySceneSeenBySource(ALTAR_VIDEO_SOURCES[controller.pendingAltarChoice]);
}

function resetAltarRewardPlayback(controller) {
    if (!controller) {
        return;
    }

    controller.altarRewardPlayback = null;

    if (controller.altarCumButton) {
        controller.altarCumButton.classList.add('hidden');
        controller.altarCumButton.classList.remove('is-selected');
        controller.altarCumButton.setAttribute('aria-pressed', 'false');
    }
}

function updateAltarCumButton(controller) {
    if (!controller || !controller.altarCumButton) {
        return;
    }

    const rewardPlayback = controller.altarRewardPlayback;
    const isVisible = Boolean(rewardPlayback && rewardPlayback.supportsCum);
    const isSelected = Boolean(rewardPlayback && rewardPlayback.cumEnabled);

    controller.altarCumButton.classList.toggle('hidden', !isVisible);
    controller.altarCumButton.classList.toggle('is-selected', isSelected);
    controller.altarCumButton.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
}

function setAltarEndingActionButtonsVisible(controller, isVisible) {
    if (!controller) {
        return;
    }

    if (controller.altarContinueButton) {
        controller.altarContinueButton.classList.toggle('hidden', !isVisible);
    }

    if (!isVisible) {
        if (controller.altarCumButton) {
            controller.altarCumButton.classList.add('hidden');
        }
        return;
    }

    updateAltarCumButton(controller);
}

function playAltarVideoSource(altarVideo, source, options) {
    if (!altarVideo || !source) {
        return;
    }

    const nextOptions = options || {};
    altarVideo.onended = nextOptions.onEnded || null;
    altarVideo.onerror = nextOptions.onError || null;
    altarVideo.onloadeddata = nextOptions.onLoadedData || null;
    altarVideo.onplaying = nextOptions.onPlaying || null;
    altarVideo.loop = Boolean(nextOptions.loop);
    altarVideo.src = source;

    const counters = document.getElementById('counters');
    if (counters) counters.classList.add('counters-hidden');

    const playPromise = altarVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
            if (error && error.name === 'AbortError') return;
            if (typeof nextOptions.onPlayError === 'function') {
                nextOptions.onPlayError(error);
                return;
            }

            console.warn('Failed to play altar ending video:', error);
        });
    }
}

function isMediaSourceMatch(element, source) {
    if (!element || !source) {
        return false;
    }

    const currentSrc = element.currentSrc || element.getAttribute('src') || '';
    if (!currentSrc) {
        return false;
    }

    try {
        return new URL(currentSrc, window.location.href).href === new URL(source, window.location.href).href;
    } catch (error) {
        return currentSrc === source;
    }
}

function getDisplayedAltarVideo() {
    return document.getElementById('altar-video');
}

function resetAltarVideoElement(video) {
    if (!video) {
        return;
    }

    video.onended = null;
    video.onerror = null;
    video.onloadeddata = null;
    video.onplaying = null;
    video.onloadedmetadata = null;
    video.ontimeupdate = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.loop = false;
    video.style.opacity = '0.5';
}

function clearAltarMediaHandoffTimer(controller) {
    if (!controller || !controller.altarMediaHandoffTimer) {
        return;
    }

    clearTimeout(controller.altarMediaHandoffTimer);
    controller.altarMediaHandoffTimer = null;
}

function clearZoneTransitionHandoffFade(controller) {
    if (!controller || !controller.zoneTransitionHandoffFadeTimer) {
        return;
    }

    clearTimeout(controller.zoneTransitionHandoffFadeTimer);
    controller.zoneTransitionHandoffFadeTimer = null;
}

function releaseHeldZoneForwardTransition(controller) {
    if (!controller || typeof controller.zoneForwardTransitionRelease !== 'function') {
        return;
    }

    const release = controller.zoneForwardTransitionRelease;
    controller.zoneForwardTransitionRelease = null;
    release();
}

function scheduleHeldZoneForwardTransitionRelease(controller, delayMs) {
    if (!controller || typeof controller.zoneForwardTransitionRelease !== 'function') {
        return;
    }

    clearAltarMediaHandoffTimer(controller);

    const safeDelayMs = Math.max(0, Number(delayMs) || 0);
    if (safeDelayMs === 0) {
        releaseHeldZoneForwardTransition(controller);
        return;
    }

    controller.altarMediaHandoffTimer = setTimeout(() => {
        controller.altarMediaHandoffTimer = null;
        releaseHeldZoneForwardTransition(controller);
    }, safeDelayMs);
}

function holdZoneTransitionDuringAltarVideo(controller, altarVideo, holdMs = ALTAR_HANDOFF_VIDEO_HOLD_MS) {
    if (!controller || typeof controller.zoneForwardTransitionRelease !== 'function' || !altarVideo) {
        return;
    }

    const safeHoldMs = Math.max(0, Number(holdMs) || 0);
    let releaseScheduled = false;
    let fallbackTimerId = null;
    let frameCallbackId = null;
    let minimumHoldTimerId = null;
    let minimumHoldElapsed = safeHoldMs === 0;
    let hasRenderedFrame = false;

    const cleanup = () => {
        altarVideo.removeEventListener('timeupdate', maybeRelease);
        altarVideo.removeEventListener('loadeddata', markFrameReady);
        altarVideo.removeEventListener('playing', markFrameReady);
        altarVideo.removeEventListener('ended', releaseNow);
        altarVideo.removeEventListener('error', releaseNow);

        if (fallbackTimerId) {
            clearTimeout(fallbackTimerId);
            fallbackTimerId = null;
        }

        if (minimumHoldTimerId) {
            clearTimeout(minimumHoldTimerId);
            minimumHoldTimerId = null;
        }

        if (frameCallbackId !== null && typeof altarVideo.cancelVideoFrameCallback === 'function') {
            altarVideo.cancelVideoFrameCallback(frameCallbackId);
            frameCallbackId = null;
        }
    };

    const releaseNow = () => {
        if (releaseScheduled) {
            return;
        }

        releaseScheduled = true;
        cleanup();
        scheduleHeldZoneForwardTransitionRelease(controller, 0);
    };

    function maybeRelease() {
        if (releaseScheduled) {
            return;
        }

        if (!minimumHoldElapsed) {
            return;
        }

        if (altarVideo.ended || hasRenderedFrame || altarVideo.currentTime > 0) {
            releaseNow();
        }
    }

    function markFrameReady() {
        hasRenderedFrame = true;
        maybeRelease();
    }

    const trackPlaybackProgress = () => {
        if (releaseScheduled) {
            return;
        }

        maybeRelease();
        if (releaseScheduled || typeof altarVideo.requestVideoFrameCallback !== 'function') {
            return;
        }

        frameCallbackId = altarVideo.requestVideoFrameCallback(() => {
            frameCallbackId = null;
            hasRenderedFrame = true;
            trackPlaybackProgress();
        });
    };

    altarVideo.addEventListener('timeupdate', maybeRelease);
    altarVideo.addEventListener('loadeddata', markFrameReady);
    altarVideo.addEventListener('playing', markFrameReady);
    altarVideo.addEventListener('ended', releaseNow, { once: true });
    altarVideo.addEventListener('error', releaseNow, { once: true });

    if (!minimumHoldElapsed) {
        minimumHoldTimerId = setTimeout(() => {
            minimumHoldTimerId = null;
            minimumHoldElapsed = true;
            maybeRelease();
        }, safeHoldMs);
    }

    fallbackTimerId = setTimeout(() => {
        fallbackTimerId = null;
        releaseNow();
    }, Math.max(safeHoldMs + 1000, 2000));

    trackPlaybackProgress();
}

function holdZoneTransitionDuringAltarImage(controller, altarImage, holdMs = ALTAR_HANDOFF_IMAGE_HOLD_MS) {
    if (!controller || typeof controller.zoneForwardTransitionRelease !== 'function' || !altarImage) {
        return;
    }

    let releaseScheduled = false;
    const scheduleRelease = () => {
        if (releaseScheduled) {
            return;
        }

        releaseScheduled = true;
        window.requestAnimationFrame(() => {
            scheduleHeldZoneForwardTransitionRelease(controller, holdMs);
        });
    };

    altarImage.addEventListener('load', scheduleRelease, { once: true });
    altarImage.addEventListener('error', () => {
        scheduleHeldZoneForwardTransitionRelease(controller, 0);
    }, { once: true });

    if (altarImage.complete && altarImage.naturalWidth > 0) {
        scheduleRelease();
    }
}

function getAltarDistributionPromptVariant(rewardPlayback) {
    if (!rewardPlayback) {
        return null;
    }

    // Only the newest teaser-only scene (transition exists, loop not made yet) is
    // gated. On f95 it shows the "Full Scene On Support Hub" popup; on Support Hub it shows
    // the "available next version" popup. Every finished scene plays fully in both
    // distributions — distribution only changes the teaser popup wording.
    if (rewardPlayback.teaserOnly) {
        return typeof window.getAppDistribution === 'function' && window.getAppDistribution() === 'f95'
            ? 'f95'
            : 'support hub';
    }

    return null;
}

function showAltarDistributionPromptInAltar(controller, variant = 'f95') {
    removeUpgradePrompt();

    const isF95Prompt = variant === 'f95';
    const title = window.t(isF95Prompt ? 'upgrade.full_scene_title' : 'upgrade.next_version_title');
    const message = window.t(isF95Prompt ? 'upgrade.full_scene_message' : 'upgrade.next_version_message');
    const iconMarkup = isF95Prompt
        ? '<img class="edition-upgrade-f95-icon" src="assets/icons/support hubicon.png" alt="Support Hub" />'
        : '';
    const actionsMarkup = isF95Prompt
        ? `
            <div class="edition-upgrade-actions">
                <button id="edition-upgrade-dismiss" class="edition-upgrade-button edition-upgrade-button--secondary">${window.t('common.no_thanks')}</button>
                <button id="edition-upgrade-confirm" class="edition-upgrade-button edition-upgrade-button--supporter">${window.t('common.yes_please')}</button>
            </div>
        `
        : `
            <div class="edition-upgrade-actions">
                <button id="edition-upgrade-dismiss" class="edition-upgrade-button edition-upgrade-button--secondary">${window.t('common.continue')}</button>
            </div>
        `;

    const prompt = document.createElement('div');
    prompt.id = 'edition-upgrade-prompt';
    prompt.className = 'edition-upgrade-overlay';
    prompt.innerHTML = `
        <div class="edition-upgrade-popup edition-upgrade-popup--f95" role="dialog" aria-modal="true" aria-label="${title}">
            ${iconMarkup}
            <h2 class="edition-upgrade-title">${title}</h2>
            <p class="edition-upgrade-text">${message}</p>
            ${actionsMarkup}
        </div>
    `;

    document.body.appendChild(prompt);

    document.getElementById('edition-upgrade-dismiss').addEventListener('click', () => {
        removeUpgradePrompt();
        continueAfterAltarScene(controller);
    });

    const confirmButton = document.getElementById('edition-upgrade-confirm');
    if (confirmButton) {
        confirmButton.addEventListener('click', () => {
            if (typeof window.openPage === 'function') {
                window.openPage('support hub');
            }
        });
    }
}

function showCumUpgradePrompt() {
    showChoiceUpgradePrompt({
        title: window.t('upgrade.cum_locked_title'),
        message: window.t('upgrade.diamond_version_message'),
        tier: 'diamond'
    });
}

function getActiveAltarRewardLoopSources(rewardPlayback) {
    if (!rewardPlayback) {
        return [];
    }

    if (rewardPlayback.cumEnabled && rewardPlayback.cumLoopSource) {
        return [rewardPlayback.baseLoopSource, rewardPlayback.cumLoopSource];
    }

    return rewardPlayback.baseLoopSource ? [rewardPlayback.baseLoopSource] : [];
}

function getNextAltarRewardLoopSource(rewardPlayback) {
    if (!rewardPlayback || !rewardPlayback.baseLoopSource) {
        return null;
    }

    if (!rewardPlayback.cumEnabled || !rewardPlayback.cumLoopSource) {
        return rewardPlayback.baseLoopSource;
    }

    return rewardPlayback.currentLoopSource === rewardPlayback.baseLoopSource
        ? rewardPlayback.cumLoopSource
        : rewardPlayback.baseLoopSource;
}

// Returns the source that will play after `currentSource` finishes.
function getAltarRewardSourceAfterNext(rewardPlayback, currentSource) {
    if (!rewardPlayback || !rewardPlayback.baseLoopSource) {
        return null;
    }
    if (!rewardPlayback.cumEnabled || !rewardPlayback.cumLoopSource) {
        return rewardPlayback.baseLoopSource;
    }
    return currentSource === rewardPlayback.baseLoopSource
        ? rewardPlayback.cumLoopSource
        : rewardPlayback.baseLoopSource;
}

// Returns { active, standby } for the reward ping-pong players.
function getAltarRewardPlayers(rewardPlayback) {
    const videoA = document.getElementById('altar-video');
    const videoB = document.getElementById('altar-video-b');
    const activeIsB = rewardPlayback ? Boolean(rewardPlayback.activePlayerIsB) : false;
    return {
        active: activeIsB ? videoB : videoA,
        standby: activeIsB ? videoA : videoB
    };
}

function normalizeAltarVideoSrc(src) {
    if (!src) {
        return '';
    }
    try {
        return new URL(src, window.location.href).href;
    } catch (_) {
        return src;
    }
}

// Load `source` into the standby altar player so it is ready for an instant swap.
function preloadIntoAltarStandby(controller, source) {
    const rewardPlayback = controller && controller.altarRewardPlayback;
    if (!source || !rewardPlayback) {
        return;
    }
    const { standby } = getAltarRewardPlayers(rewardPlayback);
    if (!standby) {
        return;
    }
    const normNew = normalizeAltarVideoSrc(source);
    const normCurrent = normalizeAltarVideoSrc(standby.getAttribute('src') || standby.src);
    if (normNew === normCurrent) {
        return; // already loaded
    }
    standby.pause();
    standby.onended = null;
    standby.onerror = null;
    standby.onloadeddata = null;
    standby.onplaying = null;
    standby.loop = false;
    standby.setAttribute('src', source);
    standby.load();
}

function playFallbackAltarEndingVideo(controller) {
    const altarVideo = document.getElementById('altar-video');
    const altarVideoB = document.getElementById('altar-video-b');
    const rewardPlayback = controller && controller.altarRewardPlayback;
    const fallbackSource = rewardPlayback && rewardPlayback.fallbackSource;

    resetAltarRewardPlayback(controller);
    setAltarEndingActionButtonsVisible(controller, true);

    // Restore canonical video layout: altar-video is the visible player,
    // altar-video-b is hidden. After a ping-pong swap altar-video may have
    // been hidden (opacity '0') with altar-video-b as the active player —
    // playing on altar-video while it is hidden causes a black screen.
    if (altarVideoB) {
        altarVideoB.pause();
        altarVideoB.onended = null;
        altarVideoB.onerror = null;
        altarVideoB.onloadeddata = null;
        altarVideoB.onplaying = null;
        altarVideoB.style.opacity = '0';
    }
    if (altarVideo) {
        altarVideo.style.opacity = '1';
    }

    if (!altarVideo || !fallbackSource) {
        return;
    }

    playAltarVideoSource(altarVideo, fallbackSource, {
        loop: Boolean(rewardPlayback && rewardPlayback.shouldLoop),
        onError: () => {
            altarVideo.onerror = null;
            console.warn('Failed to play fallback altar ending video.');
        },
        onPlayError: (error) => {
            if (error && error.name === 'AbortError') return;
            console.warn('Failed to play fallback altar ending video:', error);
        }
    });
}

function ensureAltarRewardPreloadPlayer() {
    // No-op: replaced by ping-pong buffering via getAltarRewardPlayers / preloadIntoAltarStandby.
    return null;
}

function preloadNextAltarRewardSegment() {
    // No-op: replaced by ping-pong buffering.
}

function playNextAltarRewardLoopSegment(controller, options) {
    const rewardPlayback = controller && controller.altarRewardPlayback;
    const nextOptions = options || {};

    if (!rewardPlayback) {
        return;
    }

    const nextSource = getNextAltarRewardLoopSource(rewardPlayback);
    if (!nextSource) {
        playFallbackAltarEndingVideo(controller);
        return;
    }

    rewardPlayback.currentLoopSource = nextSource;

    const { active, standby } = getAltarRewardPlayers(rewardPlayback);
    if (!active) {
        playFallbackAltarEndingVideo(controller);
        return;
    }

    const standbyNorm = normalizeAltarVideoSrc(standby ? (standby.getAttribute('src') || standby.src) : '');
    const nextNorm = normalizeAltarVideoSrc(nextSource);
    const canSwap = Boolean(standby && standbyNorm === nextNorm && standby.readyState >= 2);

    if (canSwap) {
        // --- Ping-pong swap: standby is already buffered ---
        standby.currentTime = 0;
        standby.loop = false;
        standby.muted = false;
        standby.onplaying = null;
        standby.onended = () => {
            standby.onended = null;
            standby.onerror = null;
            playNextAltarRewardLoopSegment(controller);
        };
        standby.onerror = () => {
            standby.onended = null;
            standby.onerror = null;
            console.warn('Altar reward ping-pong player error: ' + nextSource);
            playFallbackAltarEndingVideo(controller);
        };

        const playPromise = standby.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                if (error && error.name === 'AbortError') return;
                console.warn('Altar ping-pong play failed:', error);
                playFallbackAltarEndingVideo(controller);
            });
        }

        // Reveal action buttons immediately (standby starts without decode stall).
        if (nextOptions.revealButtonsOnStart) {
            setAltarEndingActionButtonsVisible(controller, true);
        }

        // Show new active, hide old active.
        standby.style.opacity = '1';
        active.style.opacity = '0';
        active.pause();
        active.onended = null;
        active.onerror = null;
        active.onloadeddata = null;
        active.onplaying = null;

        rewardPlayback.activePlayerIsB = !rewardPlayback.activePlayerIsB;

        // Pre-buffer the segment that follows nextSource on the now-standby.
        const afterNextSource = getAltarRewardSourceAfterNext(rewardPlayback, nextSource);
        preloadIntoAltarStandby(controller, afterNextSource);
    } else {
        // --- Fallback: normal src assignment ---
        playAltarVideoSource(active, nextSource, {
            loop: false,
            onLoadedData: () => {
                if (nextOptions.revealButtonsOnStart) {
                    setAltarEndingActionButtonsVisible(controller, true);
                }
            },
            onPlaying: () => {
                if (nextOptions.revealButtonsOnStart) {
                    setAltarEndingActionButtonsVisible(controller, true);
                }
            },
            onEnded: () => {
                playNextAltarRewardLoopSegment(controller);
            },
            onError: () => {
                console.warn(`Failed to load altar reward loop video: ${nextSource}`);
                playFallbackAltarEndingVideo(controller);
            },
            onPlayError: (error) => {
                if (error && error.name === 'AbortError') return;
                console.warn(`Failed to play altar reward loop video ${nextSource}:`, error);
                playFallbackAltarEndingVideo(controller);
            }
        });

        // Begin buffering what comes after nextSource on standby.
        const afterNextSource = getAltarRewardSourceAfterNext(rewardPlayback, nextSource);
        preloadIntoAltarStandby(controller, afterNextSource);
    }
}

function startAltarRewardSequence(controller) {
    const altarVideo = document.getElementById('altar-video');
    const rewardPlayback = controller && controller.altarRewardPlayback;

    if (!altarVideo || !rewardPlayback) {
        return;
    }

    rewardPlayback.loopIndex = 0;
    rewardPlayback.currentLoopSource = null;
    rewardPlayback.activePlayerIsB = false; // altar-video starts as active

    // Hard-reset the video element so it is in a clean state regardless of what
    // was playing before (avoids stale loop/ended state from the altar intro).
    altarVideo.pause();
    altarVideo.onended = null;
    altarVideo.onerror = null;
    altarVideo.onloadeddata = null;
    altarVideo.onplaying = null;
    altarVideo.loop = false;
    altarVideo.muted = false;
    altarVideo.style.opacity = '1';

    // Immediately begin buffering the base loop on altar-video-b so the
    // intro -> loop transition is seamless.
    const altarVideoB = document.getElementById('altar-video-b');
    if (altarVideoB && rewardPlayback.baseLoopSource) {
        altarVideoB.pause();
        altarVideoB.onended = null;
        altarVideoB.loop = false;
        altarVideoB.style.opacity = '0';
        altarVideoB.setAttribute('src', rewardPlayback.baseLoopSource);
        altarVideoB.load();
    }

    // Wire up intro callbacks BEFORE loading so they are ready when the video ends.
    altarVideo.onended = () => {
        altarVideo.onended = null;
        altarVideo.onerror = null;
        const promptVariant = getAltarDistributionPromptVariant(rewardPlayback);
        if (promptVariant) {
            showAltarDistributionPromptInAltar(controller, promptVariant);
            return;
        }
        playNextAltarRewardLoopSegment(controller, { revealButtonsOnStart: true });
    };
    altarVideo.onerror = () => {
        altarVideo.onended = null;
        altarVideo.onerror = null;
        console.warn(`Failed to load altar reward transition video: ${rewardPlayback.introSource}`);
        playNextAltarRewardLoopSegment(controller, { revealButtonsOnStart: true });
    };

    // Use setAttribute + load() (same pattern as playRoundOneAltarIntro) to
    // guarantee a fresh media load cycle — avoids IDL-setter race on ended videos.
    altarVideo.setAttribute('src', rewardPlayback.introSource);
    altarVideo.load();
    altarVideo.currentTime = 0;

    const counters = document.getElementById('counters');
    if (counters) counters.classList.add('counters-hidden');

    const playPromise = altarVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
            if (error && error.name === 'AbortError') {
                // Aborted by a src change elsewhere — the new handler will take over.
                return;
            }
            altarVideo.onended = null;
            altarVideo.onerror = null;
            console.warn(`Failed to play altar reward transition video ${rewardPlayback.introSource}:`, error);
            playNextAltarRewardLoopSegment(controller, { revealButtonsOnStart: true });
        });
    }
}

function handleAltarCumButtonClick(controller) {
    if (controller !== window.uiController) return;
    if (!controller || !controller.altarRewardPlayback) {
        return;
    }

    if (getCurrentAltarEditionKey() !== 'diamond') {
        showCumUpgradePrompt();
        return;
    }

    controller.altarRewardPlayback.cumEnabled = !controller.altarRewardPlayback.cumEnabled;
    if (controller.altarRewardPlayback.cumEnabled && controller.altarRewardPlayback.cumLoopSource) {
        markGallerySceneSeenBySource(controller.altarRewardPlayback.cumLoopSource);
    }
    updateAltarCumButton(controller);

    // Update standby preload to match the new sequence so the next ping-pong
    // swap picks up the correct segment without an src change.
    const afterCurrent = getAltarRewardSourceAfterNext(
        controller.altarRewardPlayback,
        controller.altarRewardPlayback.currentLoopSource
    );
    preloadIntoAltarStandby(controller, afterCurrent);
}

function resetAltarMedia(controller) {
    const altarVideo = document.getElementById('altar-video');
    const altarVideoB = document.getElementById('altar-video-b');
    const altarImage = document.getElementById('altar-image');
    const counters = document.getElementById('counters');
    if (counters) counters.classList.remove('counters-hidden');

    clearAltarMediaHandoffTimer(controller);
    resetAltarRewardPlayback(controller);

    if (altarVideo) {
        resetAltarVideoElement(altarVideo);
    }

    if (altarVideoB) {
        altarVideoB.pause();
        altarVideoB.onended = null;
        altarVideoB.onerror = null;
        altarVideoB.onloadeddata = null;
        altarVideoB.onplaying = null;
        altarVideoB.loop = false;
        altarVideoB.style.opacity = '0';
        altarVideoB.removeAttribute('src');
        altarVideoB.load();
    }

    if (altarImage) {
        if (!isMediaSourceMatch(altarImage, ALTAR_TRANSITION_BACKGROUND_SOURCE)) {
            altarImage.setAttribute('src', ALTAR_TRANSITION_BACKGROUND_SOURCE);
        }
        altarImage.classList.remove('hidden');
    }

    if (controller) {
        controller.pendingAltarChoice = null;
        controller.pendingEnding = null;
        setAltarChoicesLocked(controller, false);
    }
}

function setAltarChoicesLocked(controller, isLocked) {
    if (!controller || !controller.altarChoices) {
        return;
    }

    controller.altarChoices.forEach((button) => {
        button.disabled = Boolean(isLocked);
        button.classList.toggle('choice-btn--disabled', Boolean(isLocked));
    });
}

function dismissActiveNotification() {
    const notification = document.querySelector('.game-notification');
    if (!notification) {
        return;
    }

    if (notification.dismissTimer) {
        clearTimeout(notification.dismissTimer);
    }

    notification.remove();
}

function removeUpgradePrompt() {
    const existingPrompt = document.getElementById('edition-upgrade-prompt');
    if (existingPrompt) {
        existingPrompt.remove();
    }
}

function openSupporterUpgradePrompt() {
    removeUpgradePrompt();
    if (typeof window.openPage === 'function') {
        window.openPage('support hub');
    }
}

function showChoiceUpgradePrompt(options) {
    removeUpgradePrompt();

    const prompt = document.createElement('div');
    prompt.id = 'edition-upgrade-prompt';
    prompt.className = 'edition-upgrade-overlay';
    const tierClassName = options.tier === 'diamond' ? 'edition-upgrade-popup--diamond' : 'edition-upgrade-popup--gold';
    prompt.innerHTML = `
        <div class="edition-upgrade-popup ${tierClassName}" role="dialog" aria-modal="true" aria-label="${options.title}">
            <h2 class="edition-upgrade-title">${options.title}</h2>
            <p class="edition-upgrade-text">${options.message}</p>
            <div class="edition-upgrade-actions">
                <button id="edition-upgrade-dismiss" class="edition-upgrade-button edition-upgrade-button--secondary">${window.t('common.no_thanks')}</button>
                <button id="edition-upgrade-confirm" class="edition-upgrade-button">${window.t('common.yes_please')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(prompt);

    document.getElementById('edition-upgrade-dismiss').addEventListener('click', removeUpgradePrompt);
    document.getElementById('edition-upgrade-confirm').addEventListener('click', openSupporterUpgradePrompt);
}

function showLockedChoiceUpgradePrompt(choice) {
    if (choice === 'nun-corruption') {
        showChoiceUpgradePrompt({
            title: window.t('upgrade.nun_corruption_locked_title'),
            message: window.t('upgrade.diamond_version_message'),
            tier: 'diamond'
        });
        return;
    }

    if (choice === 'demon-exorcism') {
        showChoiceUpgradePrompt({
            title: window.t('upgrade.demon_exorcism_locked_title'),
            message: window.t('upgrade.gold_version_message'),
            tier: 'gold'
        });
    }
}

function revealAltarChoicesAfterIntro(controller) {
    const altarChoices = document.getElementById('altar-choices');
    const altarVideo = getDisplayedAltarVideo();
    const altarImage = document.getElementById('altar-image');
    const introMedia = getRoundScopedChurchZoneIntro(controller && controller.gameState ? controller.gameState.currentRound : 1);

    if (altarImage) {
        if (!isMediaSourceMatch(altarImage, ALTAR_TRANSITION_BACKGROUND_SOURCE)) {
            altarImage.setAttribute('src', ALTAR_TRANSITION_BACKGROUND_SOURCE);
        }
        altarImage.classList.remove('hidden');
        holdZoneTransitionDuringAltarImage(controller, altarImage);
    }

    if (altarVideo && introMedia && introMedia.video) {
        markGallerySceneSeenBySource(introMedia.video);

        altarVideo.onended = null;
        altarVideo.onerror = null;
        altarVideo.loop = false;
        altarVideo.muted = true;
        altarVideo.playsInline = true;

        if (!isMediaSourceMatch(altarVideo, introMedia.video)) {
            altarVideo.setAttribute('src', introMedia.video);
            altarVideo.load();
        }
    } else {
        scheduleHeldZoneForwardTransitionRelease(controller, 0);
    }

    if (altarChoices) {
        altarChoices.style.display = 'block';
    }
}

function skipAltarVideoPlayback(controller) {
    const altarVideo = getDisplayedAltarVideo();
    const altarChoices = document.getElementById('altar-choices');

    if (!controller || !altarVideo || !altarVideo.currentSrc) {
        return false;
    }

    if (!controller.pendingAltarChoice && altarChoices && altarChoices.style.display === 'none' && shouldPlayRoundOneAltarIntro(controller)) {
        const onEnded = altarVideo.onended;
        altarVideo.onended = null;
        altarVideo.pause();
        altarVideo.removeAttribute('src');
        altarVideo.load();
        if (typeof onEnded === 'function') {
            onEnded();
        } else {
            revealAltarChoicesAfterIntro(controller);
        }
        return true;
    }

    return false;
}

function shouldPlayRoundOneAltarIntro(controller) {
    return Boolean(getRoundScopedChurchZoneIntro(controller && controller.gameState ? controller.gameState.currentRound : 1).video);
}

function playRoundOneAltarIntro(controller) {
    const altarChoices = document.getElementById('altar-choices');
    const altarVideo = getDisplayedAltarVideo();
    const altarImage = document.getElementById('altar-image');
    const introMedia = getRoundScopedChurchZoneIntro(controller && controller.gameState ? controller.gameState.currentRound : 1);

    if (!altarVideo) {
        revealAltarChoicesAfterIntro(controller);
        return;
    }

    if (altarChoices) {
        altarChoices.style.display = 'none';
    }

    if (altarImage) {
        if (!isMediaSourceMatch(altarImage, ALTAR_TRANSITION_BACKGROUND_SOURCE)) {
            altarImage.setAttribute('src', ALTAR_TRANSITION_BACKGROUND_SOURCE);
        }
        altarImage.classList.remove('hidden');
    }

    markGallerySceneSeenBySource(introMedia.video);
    altarVideo.loop = false;
    altarVideo.muted = true;
    altarVideo.playsInline = true;
    altarVideo.preload = 'auto';
    altarVideo.style.opacity = '1';
    altarVideo.onended = () => {
        altarVideo.onended = null;
        // The choices sit over this video's held frame. Hold a few frames before the
        // end, not the very last one: 3CA1V5.mp4's final 2 frames render the altar with
        // the Nun and the Demoness gone (a render glitch), and that empty altar was what
        // vigil 5 showed.
        if (Number.isFinite(altarVideo.duration) && altarVideo.duration > ALTAR_INTRO_HOLD_BACK_SECONDS) {
            try {
                altarVideo.currentTime = altarVideo.duration - ALTAR_INTRO_HOLD_BACK_SECONDS;
            } catch (error) {
                // keep the last frame
            }
        }
        revealAltarChoicesAfterIntro(controller);
    };
    altarVideo.onerror = () => {
        altarVideo.onerror = null;
        console.warn('Failed to play round 1 altar intro video. Falling back to still image.');
        revealAltarChoicesAfterIntro(controller);
    };
    altarVideo.setAttribute('src', introMedia.video);
    altarVideo.load();
    altarVideo.currentTime = 0;
    holdZoneTransitionDuringAltarVideo(controller, altarVideo);

    const playPromise = altarVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
            console.warn('Failed to start phase intro video:', error);
            revealAltarChoicesAfterIntro(controller);
        });
    }
}

/**
 * Create a new UIController
 */
function createUIController(gameState) {
    const controller = {
        gameState,

        // UI Elements
        crossCountEl: document.getElementById('cross-count'),
        bookCountEl: document.getElementById('book-count'),
        roundNumberEl: document.getElementById('round-number'),
        zoneNumberEl: document.getElementById('zone-number'),

        lookBackBtn: document.getElementById('look-back-btn'),
        goForwardBtn: document.getElementById('go-forward-btn'),

        altarScreen: document.getElementById('altar-screen'),
        altarChoices: document.querySelectorAll('.choice-btn'),
        altarContinueButton: document.getElementById('altar-continue-button'),
        altarCumButton: ensureAltarCumButton(),
        zoneForwardTransitionActive: false,
        zoneForwardTransitionRelease: null,
        zoneTransitionHandoffFadeTimer: null,
        zoneTransitionLightRampFrame: null,
        lookBackReady: true,
        pendingAltarChoice: null,
        pendingEnding: null,
        altarMediaHandoffTimer: null,
        altarRewardPlayback: null
    };

    initUIController(controller);
    console.log('UIController initialized');

    return controller;
}

/**
 * Initialize the UIController
 */
function initUIController(controller) {
    primeZoneForwardTransitionVideo(controller.gameState?.currentZone || 1);

    // Bind navigation buttons
    if (controller.lookBackBtn) {
        controller.lookBackBtn.addEventListener('click', () => handleLookBack(controller));
    }

    if (controller.goForwardBtn) {
        controller.goForwardBtn.addEventListener('click', () => handleGoForward(controller));
    }

    // Arrow key navigation
    document.addEventListener('keydown', (event) => {
        if (controller !== window.uiController) return;
        // In 3D, W/S/arrows walk (scripts/world3d/world.js); there is no look-back button.
        if (window.THE_NUN_3D_MODE) return;
        if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA')) return;

        const action = getNavigationHotkeyAction(event);
        if (!action) {
            return;
        }

        if (isNavigationHotkeyBlocked(controller)) {
            event.preventDefault();
            return;
        }

        if (action === 'look-back') {
            event.preventDefault();
            if (!controller.gameState.isLookingBack && controller.lookBackBtn && !controller.lookBackBtn.disabled) {
                handleLookBack(controller);
            }
        } else if (action === 'go-forward') {
            event.preventDefault();
            if (controller.gameState.isLookingBack) {
                if (controller.lookBackBtn && !controller.lookBackBtn.disabled) {
                    handleLookBack(controller);
                }
            } else {
                if (controller.goForwardBtn && !controller.goForwardBtn.disabled) {
                    handleGoForward(controller);
                }
            }
        }
    });

    // Bind altar choice buttons
    controller.altarChoices.forEach(btn => {
        btn.addEventListener('click', (event) => {
            const choice = btn.getAttribute('data-choice');
            handleAltarChoice(controller, choice);

            if (event.detail > 0 && document.activeElement === btn) {
                btn.blur();
            }

            window.requestAnimationFrame(() => {
                updateAltarHoverShade(controller);
            });
        });

        const hoverShadeSide = getAltarHoverShadeSide(btn);
        if (!hoverShadeSide) {
            return;
        }

        btn.addEventListener('mouseenter', () => {
            updateAltarHoverShade(controller);
        });
        btn.addEventListener('mouseleave', () => {
            window.requestAnimationFrame(() => {
                updateAltarHoverShade(controller);
            });
        });
        btn.addEventListener('focus', () => {
            updateAltarHoverShade(controller);
        });
        btn.addEventListener('blur', () => {
            window.requestAnimationFrame(() => {
                updateAltarHoverShade(controller);
            });
        });
    });

    if (controller.altarContinueButton) {
        controller.altarContinueButton.addEventListener('click', () => {
            continueAfterAltarScene(controller);
        });
    }

    if (controller.altarCumButton) {
        controller.altarCumButton.addEventListener('click', () => {
            handleAltarCumButtonClick(controller);
        });
    }

    // Initial update
    updateCounters(controller);
    updateAltarRequirements(controller);
    updateLookBackButtonLabel(controller);
    updateNavigationButtonStates(controller);
}

/**
 * Update counter displays
 */
function updateCounters(controller) {
    const stats = getStats(controller.gameState);

    if (controller.crossCountEl) controller.crossCountEl.textContent = stats.crosses;
    if (controller.bookCountEl) controller.bookCountEl.textContent = stats.books;
    if (controller.roundNumberEl) controller.roundNumberEl.textContent = stats.round;
    if (controller.zoneNumberEl) controller.zoneNumberEl.textContent = `${stats.zone}/${controller.gameState.maxZones || 5}`;
    if (typeof window.recordTheNunRunProgress === 'function') {
        window.recordTheNunRunProgress(stats.round, stats.zone);
    }
    updateLookBackButtonLabel(controller);
    updateNavigationButtonStates(controller);
}

function updateLookBackButtonLabel(controller) {
    if (!controller || !controller.lookBackBtn) {
        return;
    }

    const isLookingBack = controller.gameState.isLookingBack;
    const imgBack = controller.lookBackBtn.querySelector('.nav-btn-img--back');
    const imgFront = controller.lookBackBtn.querySelector('.nav-btn-img--front');
    if (imgBack) imgBack.classList.toggle('hidden', isLookingBack);
    if (imgFront) imgFront.classList.toggle('hidden', !isLookingBack);
    controller.lookBackBtn.setAttribute('aria-label', window.t(isLookingBack ? 'a11y.look_front' : 'a11y.look_back'));
    // Fallback for plain-text buttons (no img children)
    if (!imgBack && !imgFront) {
        controller.lookBackBtn.textContent = window.t(isLookingBack ? 'a11y.look_front' : 'a11y.look_back');
    }

    updateNavigationButtonImages(controller);
}

function updateNavigationButtonImages(controller) {
    if (!controller) {
        return;
    }

    if (controller.goForwardBtn) {
        const goForwardImg = controller.goForwardBtn.querySelector('.nav-btn-img');
        if (goForwardImg) {
            goForwardImg.src = controller.goForwardBtn.disabled
                ? 'assets/icons/nav-forward2.png'
                : 'assets/icons/nav-forward.png';
        }
    }

    if (controller.lookBackBtn) {
        const lookBackImg = controller.lookBackBtn.querySelector('.nav-btn-img--back');
        if (lookBackImg) {
            lookBackImg.src = controller.lookBackBtn.disabled
                ? 'assets/icons/nav-look-back2.png'
                : 'assets/icons/nav-look-back.png';
        }
    }
}

function updateNavigationButtonStates(controller) {
    if (!controller) {
        return;
    }

    const hasActiveForwardTransition = Boolean(controller.zoneForwardTransitionActive);

    if (controller.lookBackBtn) {
        controller.lookBackBtn.disabled = Boolean(
            controller.gameState.isPowerStruggle ||
            controller.gameState.isAtAltar ||
            hasActiveForwardTransition ||
            !controller.lookBackReady
        );
    }

    if (controller.goForwardBtn) {
        const isLookingBack = Boolean(controller.gameState.isLookingBack);
        controller.goForwardBtn.classList.toggle('hidden', isLookingBack);
        controller.goForwardBtn.disabled = Boolean(
            isLookingBack ||
            controller.gameState.isPowerStruggle ||
            controller.gameState.isAtAltar ||
            hasActiveForwardTransition
        );
    }

    updateNavigationButtonImages(controller);
}

/**
 * Handle look back button
 */
function handleLookBack(controller) {
    if (controller !== window.uiController || window.THE_NUN_3D_MODE) return;
    if (controller.gameState.isPowerStruggle || controller.gameState.isAtAltar || controller.zoneForwardTransitionActive) return;

    if (!window.nunSystem) {
        return;
    }

    if (controller.gameState.isLookingBack) {
        console.log('Player turning back to the front...');
        hideNun(window.nunSystem);
    } else {
        console.log('Player looking back at nun...');
        showNun(window.nunSystem);
    }

    updateLookBackButtonLabel(controller);
    updateNavigationButtonStates(controller);
}

function getZoneForwardTransitionSource(zoneNumber) {
    const safeZone = Math.max(1, Math.min(5, Number(zoneNumber) || 1));
    return `assets/scenes/others/3CT${safeZone}.mp4`;
}

const ZONE_TRANSITION_EMPTY_HOLD_MS = 1000;
const ZONE_TRANSITION_REVEAL_LEAD_MS = 1000;
const ZONE_TRANSITION_STAGE_DELAY_MS = 120;

function setZoneForwardTransitionOverlayVisibility(isVisible) {
    ['collectibles-layer', 'demon-zones'].forEach((elementId) => {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }

        element.classList.toggle('hidden', !isVisible);
    });
}

function clearZoneForwardTransitionTimers(controller) {
    const activeTimers = Array.isArray(controller.zoneForwardTransitionTimers)
        ? controller.zoneForwardTransitionTimers
        : [];

    activeTimers.forEach((timerId) => {
        clearTimeout(timerId);
    });

    controller.zoneForwardTransitionTimers = [];
}

// After a forward zone transition, keep the look-back button disabled until the
// newly-active nun zone video has a frame ready to display. Falls back to a
// timeout so the button is never permanently blocked if the video fails to load.
function waitForNunZoneVideoReady(controller) {
    const MIN_DELAY_MS = 1000;
    const FALLBACK_TIMEOUT_MS = 2500;
    const zone = Math.max(1, Math.min(5, Number(controller.gameState && controller.gameState.currentZone) || 1));
    const video = document.querySelector(`.nun-video[data-nun-zone="${zone}"]`);

    let minDelayElapsed = false;
    let videoReady = false;
    let fallbackTimer = null;
    let minDelayTimer = null;

    function tryMarkReady() {
        if (!minDelayElapsed || !videoReady) {
            return;
        }
        if (fallbackTimer !== null) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
        if (!controller.lookBackReady) {
            controller.lookBackReady = true;
            updateNavigationButtonStates(controller);
        }
    }

    // Minimum 1s delay regardless of video state.
    minDelayTimer = setTimeout(() => {
        if (controller !== window.uiController) return;
        minDelayElapsed = true;
        tryMarkReady();
    }, MIN_DELAY_MS);

    // Fallback in case video never fires ready events.
    fallbackTimer = setTimeout(() => {
        if (controller !== window.uiController) return;
        fallbackTimer = null;
        if (minDelayTimer !== null) {
            clearTimeout(minDelayTimer);
            minDelayTimer = null;
        }
        if (!controller.lookBackReady) {
            controller.lookBackReady = true;
            updateNavigationButtonStates(controller);
        }
    }, FALLBACK_TIMEOUT_MS);

    if (!video || video.readyState >= 2) {
        videoReady = true;
        tryMarkReady();
        return;
    }

    const onReady = () => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        videoReady = true;
        tryMarkReady();
    };
    const onError = () => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        videoReady = true;
        tryMarkReady();
    };

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
}

function primeZoneForwardTransitionVideo(zoneNumber) {
    const transitionVideo = document.getElementById('scene-transition-video');
    if (!transitionVideo) {
        return;
    }

    const transitionSource = getZoneForwardTransitionSource(zoneNumber);
    transitionVideo.preload = 'auto';

    if (transitionVideo.dataset.lastAppliedSrc === transitionSource) {
        return;
    }

    transitionVideo.dataset.lastAppliedSrc = transitionSource;
    transitionVideo.src = transitionSource;
    transitionVideo.load();
}

function setSceneEmptyMaskEnabled(collectiblesSystem, isEnabled) {
    const emptyImage = collectiblesSystem?.emptyImage;
    if (!emptyImage) {
        return;
    }

    const currentMask = emptyImage.getAttribute('mask');
    if (currentMask && !emptyImage.dataset.transitionMask) {
        emptyImage.dataset.transitionMask = currentMask;
    }

    if (isEnabled) {
        if (emptyImage.dataset.transitionMask) {
            emptyImage.setAttribute('mask', emptyImage.dataset.transitionMask);
        }
        return;
    }

    emptyImage.removeAttribute('mask');
}

function setZoneForwardTransitionPhase(controller, phase) {
    const collectiblesSystem = window.collectiblesSystem;
    const sceneVideo = collectiblesSystem?.fullVideo;
    const emptyOverlay = collectiblesSystem?.emptyOverlay;

    switch (phase) {
        case 'start':
            setZoneForwardTransitionOverlayVisibility(false);
            setSceneEmptyMaskEnabled(collectiblesSystem, false);
            sceneVideo?.classList.add('hidden');
            emptyOverlay?.classList.remove('hidden');
            break;
        case 'middle':
            setZoneForwardTransitionOverlayVisibility(false);
            sceneVideo?.classList.add('hidden');
            emptyOverlay?.classList.add('hidden');
            break;
        case 'reveal':
            setZoneForwardTransitionOverlayVisibility(false);
            setSceneEmptyMaskEnabled(collectiblesSystem, true);
            sceneVideo?.classList.remove('hidden');
            emptyOverlay?.classList.remove('hidden');
            break;
        default:
            setZoneForwardTransitionOverlayVisibility(true);
            setSceneEmptyMaskEnabled(collectiblesSystem, true);
            sceneVideo?.classList.remove('hidden');
            emptyOverlay?.classList.remove('hidden');
            break;
    }
}

function stageNextZoneDuringTransition(controller) {
    if (controller !== window.uiController) return false;
    const hasNextZone = nextZone(controller.gameState);
    if (!hasNextZone) {
        return false;
    }

    updateCounters(controller);

    if (window.collectiblesSystem) {
        spawnCollectiblesForZone(window.collectiblesSystem);
    }

    if (typeof window.showTheNunZoneToast === 'function') {
        window.showTheNunZoneToast(controller.gameState.currentZone);
    }
    return true;
}

function scheduleZoneForwardTransitionPhases(controller, transitionVideo) {
    const durationMs = Number(transitionVideo.duration) * 1000;
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return;
    }

    const emptyHoldDelay = Math.min(ZONE_TRANSITION_EMPTY_HOLD_MS, durationMs);
    const revealDelay = Math.max(0, durationMs - ZONE_TRANSITION_REVEAL_LEAD_MS);
    const stageDelay = Math.min(Math.max(0, ZONE_TRANSITION_STAGE_DELAY_MS), revealDelay);

    clearZoneForwardTransitionTimers(controller);

    controller.zoneForwardTransitionTimers.push(
        setTimeout(() => {
            if (controller !== window.uiController) return;
            stageNextZoneDuringTransition(controller);
        }, stageDelay)
    );

    if (emptyHoldDelay < revealDelay) {
        controller.zoneForwardTransitionTimers.push(
            setTimeout(() => {
                if (controller !== window.uiController) return;
                setZoneForwardTransitionPhase(controller, 'middle');
            }, emptyHoldDelay)
        );
    }

    if (revealDelay > 0) {
        controller.zoneForwardTransitionTimers.push(
            setTimeout(() => {
                if (controller !== window.uiController) return;
                setZoneForwardTransitionPhase(controller, 'reveal');
            }, revealDelay)
        );
    }
}

function clearZoneTransitionLightRamp(controller) {
    if (!controller || controller.zoneTransitionLightRampFrame === null || controller.zoneTransitionLightRampFrame === undefined) {
        return;
    }

    cancelAnimationFrame(controller.zoneTransitionLightRampFrame);
    controller.zoneTransitionLightRampFrame = null;
}

function forceZoneTransitionLightsFull() {
    const lightingSystem = window.lightingSystem;
    if (!lightingSystem || !Array.isArray(lightingSystem.lights)) {
        return;
    }

    lightingSystem.transitionFullClearProgress = 1;
    lightingSystem.lights.forEach((light) => {
        light.intensity = 100;
    });
}

function setZoneTransitionLightClearProgress(progress) {
    const lightingSystem = window.lightingSystem;
    if (!lightingSystem) {
        return;
    }

    lightingSystem.transitionFullClearProgress = Math.max(0, Math.min(1, Number(progress) || 0));
}

function startZoneTransitionHandoffFade(controller, transitionVideo, onComplete) {
    if (typeof onComplete !== 'function') {
        return;
    }

    if (!transitionVideo) {
        onComplete();
        return;
    }

    clearZoneTransitionHandoffFade(controller);
    transitionVideo.classList.add('is-handoff-releasing');

    controller.zoneTransitionHandoffFadeTimer = setTimeout(() => {
        controller.zoneTransitionHandoffFadeTimer = null;
        transitionVideo.classList.remove('is-handoff-releasing');
        onComplete();
    }, ALTAR_HANDOFF_CROSSFADE_MS);
}

function startAltarTransitionLightRamp(controller, durationMs = ALTAR_TRANSITION_LIGHT_RAMP_FALLBACK_MS) {
    const lightingSystem = window.lightingSystem;
    if (!controller || !lightingSystem || !Array.isArray(lightingSystem.lights) || lightingSystem.lights.length === 0) {
        return;
    }

    const safeDurationMs = Math.max(1, Number(durationMs) || ALTAR_TRANSITION_LIGHT_RAMP_FALLBACK_MS);
    const startingIntensities = lightingSystem.lights.map((light) => {
        const currentIntensity = Number(light?.intensity);
        return Number.isFinite(currentIntensity)
            ? Math.max(0, Math.min(100, currentIntensity))
            : 0;
    });

    clearZoneTransitionLightRamp(controller);
    setZoneTransitionLightClearProgress(0);

    const startTime = performance.now();
    const step = (now) => {
        if (controller !== window.uiController) {
            clearZoneTransitionLightRamp(controller);
            return;
        }

        const progress = Math.max(0, Math.min(1, (now - startTime) / safeDurationMs));
        setZoneTransitionLightClearProgress(progress);
        lightingSystem.lights.forEach((light, index) => {
            const startingIntensity = startingIntensities[index] ?? 0;
            light.intensity = startingIntensity + ((100 - startingIntensity) * progress);
        });

        if (progress >= 1) {
            controller.zoneTransitionLightRampFrame = null;
            return;
        }

        controller.zoneTransitionLightRampFrame = requestAnimationFrame(step);
    };

    controller.zoneTransitionLightRampFrame = requestAnimationFrame(step);
}

function playZoneForwardTransition(controller, zoneNumber, onComplete) {
    const sceneVideo = document.getElementById('scene-full-video');
    const transitionVideo = document.getElementById('scene-transition-video');
    const collectiblesSystem = window.collectiblesSystem;
    if (!sceneVideo || !transitionVideo || !collectiblesSystem || !collectiblesSystem.fullVideo) {
        return;
    }

    const transitionSource = getZoneForwardTransitionSource(zoneNumber);
    const isAltarHandoffTransition = typeof onComplete === 'function';

    controller.zoneForwardTransitionActive = true;
    if (typeof window.syncAmbientCharacterAudioState === 'function') {
        window.syncAmbientCharacterAudioState();
    }
    updateNavigationButtonStates(controller);
    clearZoneForwardTransitionTimers(controller);
    clearZoneTransitionLightRamp(controller);
    clearZoneTransitionHandoffFade(controller);
    setZoneForwardTransitionPhase(controller, 'start');

    // Drain 15% of current intensity from each light on zone advance
    const ls = window.lightingSystem;
    if (ls && Array.isArray(ls.lights)) {
        ls.lights.forEach((light) => {
            light.intensity = Math.max(0, light.intensity * 0.85);
        });
    }

    const lightsContainer = document.getElementById('lights-container');
    if (lightsContainer) lightsContainer.style.visibility = 'hidden';

    transitionVideo.pause();
    transitionVideo.onended = null;
    transitionVideo.onerror = null;
    transitionVideo.onloadedmetadata = null;
    transitionVideo.loop = false;
    transitionVideo.classList.remove('is-handoff-releasing');
    transitionVideo.classList.add('is-active');

    if (transitionVideo.dataset.lastAppliedSrc !== transitionSource) {
        transitionVideo.dataset.lastAppliedSrc = transitionSource;
        transitionVideo.src = transitionSource;
        transitionVideo.load();
    }

    try {
        transitionVideo.currentTime = 0;
    } catch (error) {
        console.warn('Failed to reset zone transition video:', error);
    }

    let transitionRestored = false;
    const handoffThresholdSeconds = 1 / 24;
    const handoffThresholdMs = handoffThresholdSeconds * 1000;
    const finalizeTransition = () => {
        clearZoneForwardTransitionTimers(controller);
        clearZoneTransitionLightRamp(controller);
        clearZoneTransitionHandoffFade(controller);
        setZoneTransitionLightClearProgress(0);
        controller.zoneForwardTransitionRelease = null;
        transitionVideo.onended = null;
        transitionVideo.onerror = null;
        transitionVideo.onloadedmetadata = null;
        transitionVideo.ontimeupdate = null;
        transitionVideo.pause();
        transitionVideo.classList.remove('is-active', 'is-altar-handoff', 'is-handoff-releasing');

        try {
            transitionVideo.currentTime = 0;
        } catch (error) {
            console.warn('Failed to reset zone transition video after playback:', error);
        }

        controller.zoneForwardTransitionActive = false;
        controller.lookBackReady = false;
        setZoneForwardTransitionPhase(controller, 'restore');
        updateNavigationButtonStates(controller);
        if (typeof window.syncAmbientCharacterAudioState === 'function') {
            window.syncAmbientCharacterAudioState();
        }
        primeZoneForwardTransitionVideo(controller.gameState.currentZone);

        const lightsContainerFinal = document.getElementById('lights-container');
        if (lightsContainerFinal) lightsContainerFinal.style.visibility = '';
    };

    const restoreZoneScene = () => {
        if (transitionRestored) {
            return;
        }

        transitionRestored = true;
        clearZoneForwardTransitionTimers(controller);
        transitionVideo.onended = null;
        transitionVideo.onerror = null;
        transitionVideo.onloadedmetadata = null;
        transitionVideo.ontimeupdate = null;

        // Wait for the new zone's nun video to be ready before allowing look-back.
        waitForNunZoneVideoReady(controller);

        if (typeof onComplete === 'function') {
            forceZoneTransitionLightsFull();
            transitionVideo.pause();
            transitionVideo.classList.add('is-altar-handoff');
            controller.zoneForwardTransitionRelease = () => {
                controller.zoneForwardTransitionRelease = null;
                startZoneTransitionHandoffFade(controller, transitionVideo, finalizeTransition);
            };
            onComplete();
            return;
        }

        finalizeTransition();
    };

    transitionVideo.onloadedmetadata = () => {
        scheduleZoneForwardTransitionPhases(controller, transitionVideo);
        if (isAltarHandoffTransition) {
            startAltarTransitionLightRamp(
                controller,
                Math.max(1, (Number(transitionVideo.duration) * 1000) - handoffThresholdMs)
            );
        }
    };

    if (Number.isFinite(transitionVideo.duration) && transitionVideo.duration > 0) {
        scheduleZoneForwardTransitionPhases(controller, transitionVideo);
        if (isAltarHandoffTransition) {
            startAltarTransitionLightRamp(
                controller,
                Math.max(1, (Number(transitionVideo.duration) * 1000) - handoffThresholdMs)
            );
        }
    }

    if (typeof onComplete === 'function') {
        transitionVideo.ontimeupdate = () => {
            const duration = Number(transitionVideo.duration);
            if (!Number.isFinite(duration) || duration <= 0) {
                return;
            }

            if ((duration - transitionVideo.currentTime) <= handoffThresholdSeconds) {
                restoreZoneScene();
            }
        };
    }

    transitionVideo.onended = restoreZoneScene;
    transitionVideo.onerror = restoreZoneScene;

    const playPromise = transitionVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
            console.warn(`Failed to play zone forward transition video ${transitionSource}:`, error);
            restoreZoneScene();
        });
    }
}

/**
 * Handle go forward button
 */
function handleGoForward(controller) {
    if (controller !== window.uiController) return;
    if (controller.gameState.isPowerStruggle || controller.gameState.isAtAltar || controller.zoneForwardTransitionActive) return;

    if (controller.gameState.activeDemonAttack && typeof window.cancelActiveDemonAttack === 'function' && window.demonAttacksSystem) {
        window.cancelActiveDemonAttack(window.demonAttacksSystem);
        if (typeof window.clearScheduledDemonAttack === 'function') {
            window.clearScheduledDemonAttack(window.demonAttacksSystem);
        }
    }

    const previousZone = Math.max(1, Math.min(5, Number(controller.gameState.currentZone) || 1));

    const hasNextZone = controller.gameState.currentZone < controller.gameState.maxZones;

    if (hasNextZone) {
        playZoneForwardTransition(controller, previousZone);
    } else {
        playZoneForwardTransition(controller, previousZone, () => {
            showAltarScreen(controller);
        });
    }
}

/**
 * Show altar screen with choices
 */
function showAltarScreen(controller) {
    console.log('[VIDEO TRIGGER] Altar view with Nun & Demon facing each other');

    if (!controller.altarScreen) return;

    // Steam: the player has reached the altar of the sixth and last vigil. Awarded
    // here, not when vigil 6 begins (code/achievements.js dedupes; none in the tutorial).
    if (isFinalRiteAltar(controller) && typeof window.unlockAchievement === 'function') {
        window.unlockAchievement('ACH_THE_ALTAR');
    }

    if (typeof window.clearScheduledDemonAttack === 'function' && window.demonAttacksSystem) {
        window.clearScheduledDemonAttack(window.demonAttacksSystem);
    }

    const altarChoices = document.getElementById('altar-choices');

    // Refresh progress limits from disk then update display
    if (typeof loadAltarProgressLimitsFromRewards === 'function') {
        loadAltarProgressLimitsFromRewards().then(() => updateAltarRequirements(controller));
    }

    // Update requirements display (immediate, before async completes)
    updateAltarRequirements(controller);

    if (altarChoices) {
        altarChoices.style.display = 'block';
    }
    if (controller.altarContinueButton) {
        controller.altarContinueButton.classList.add('hidden');
    }
    resetAltarMedia(controller, { preserveTransitionFreezeFrame: true });
    clearAltarHoverShade(controller);

    // Show screen
    controller.altarScreen.classList.remove('hidden');
    if (typeof window.syncAmbientCharacterAudioState === 'function') {
        window.syncAmbientCharacterAudioState();
    }

    if (shouldPlayRoundOneAltarIntro(controller)) {
        playRoundOneAltarIntro(controller);
    } else {
        revealAltarChoicesAfterIntro(controller);
    }

    // Hide main UI temporarily
    const mainUI = document.getElementById('main-ui');
    if (mainUI) mainUI.style.display = 'none';
}

/**
 * Hide altar screen
 */
function hideAltarScreen(controller) {
    if (!controller.altarScreen) return;

    if (typeof window.cancelAltarDuel === 'function') {
        window.cancelAltarDuel();
    }

    const altarChoices = document.getElementById('altar-choices');

    controller.altarScreen.classList.add('hidden');
    controller.altarScreen.classList.remove('is-final-rite');
    if (typeof window.syncAmbientCharacterAudioState === 'function') {
        window.syncAmbientCharacterAudioState();
    }
    clearAltarMediaHandoffTimer(controller);
    releaseHeldZoneForwardTransition(controller);

    if (altarChoices) {
        altarChoices.style.display = 'block';
    }
    if (controller.altarContinueButton) {
        controller.altarContinueButton.classList.add('hidden');
    }
    resetAltarMedia(controller);
    clearAltarHoverShade(controller);

    // Show main UI again
    const mainUI = document.getElementById('main-ui');
    if (mainUI) mainUI.style.display = 'block';
}

/**
 * Update altar choice requirements: price, scene counter, shortfall, relive price,
 * hover preview of the scene each rite buys, and the final-rite panel.
 */
function updateAltarRequirements(controller) {
    const requirements = getAltarRequirements(controller.gameState);
    const stats = getStats(controller.gameState);

    Object.entries(ALTAR_ROUTE_UI).forEach(([choice, route]) => {
        const button = document.querySelector(`.choice-btn[data-choice="${choice}"]`);
        if (!button) {
            return;
        }

        const requirementEl = button.querySelector('.choice-requirement');
        const progressEl = button.querySelector('.choice-progress');
        const lockedByEdition = isChoiceEditionLocked(choice);
        const total = Math.max(1, Number(getAltarProgressDisplayTotal(route.routeKey)) || 1);
        // clamped: a save from before a route shrank (Corruption was 2 scenes) reads 1/1
        const progress = Math.min(total, Number(stats[route.progressStat]) || 0);
        const isComplete = progress >= total;
        const required = requirements[route.routeKey];
        const owned = route.currency === 'crosses' ? stats.crosses : stats.books;
        const shortfall = Math.max(0, required - owned);
        const isInsufficient = !lockedByEdition && shortfall > 0;
        const isCrosses = route.currency === 'crosses';

        button.classList.toggle('locked', lockedByEdition);

        if (requirementEl) {
            if (lockedByEdition) {
                requirementEl.textContent = window.t(isCrosses ? 'altar.gold_crosses_requirement' : 'altar.diamond_books_requirement', { count: required });
            } else if (isInsufficient) {
                requirementEl.textContent = window.t(isCrosses ? 'altar.more_crosses' : 'altar.more_books', { count: shortfall, required });
            } else if (isComplete) {
                requirementEl.textContent = window.t(isCrosses ? 'altar.replay_crosses' : 'altar.replay_books', { count: required });
            } else {
                requirementEl.textContent = window.t(isCrosses ? 'altar.crosses_required' : 'altar.books_required', { count: required });
            }
        }

        if (progressEl) {
            progressEl.textContent = formatAltarProgress(progress, total);
        }

        // Insufficient rites stay hoverable (the preview is the carrot); a click
        // explains the shortfall instead of doing nothing.
        button.classList.toggle('insufficient', isInsufficient);
        button.classList.toggle('is-replay', isComplete && !lockedByEdition);
        button.setAttribute('aria-disabled', isInsufficient ? 'true' : 'false');
        if (!controller.pendingAltarChoice) {
            button.disabled = false;
            button.classList.remove('choice-btn--disabled');
        }

        updateChoiceScenePreview(
            button,
            route,
            lockedByEdition ? 0 : (isComplete ? total : progress + 1),
            isComplete
        );
    });

    // Attack routes (the altar duel, scripts/altarDuel.js): same price as the matching
    // Help route, stepped by their own progress.
    [
        { choice: 'attack-nun', routeKey: 'attackNun', progressStat: 'attackNunProgress', isCrosses: true },
        { choice: 'attack-demon', routeKey: 'attackDemon', progressStat: 'attackDemonProgress', isCrosses: false }
    ].forEach((attack) => {
        const button = document.querySelector(`.choice-btn[data-choice="${attack.choice}"]`);
        if (!button) {
            return;
        }
        const required = requirements[attack.routeKey];
        const owned = attack.isCrosses ? stats.crosses : stats.books;
        const requirementEl = button.querySelector('.choice-requirement');
        const progressEl = button.querySelector('.choice-progress');
        const isComplete = typeof window.isAltarAttackComplete === 'function' && window.isAltarAttackComplete(controller.gameState, attack.choice);
        if (requirementEl) {
            const key = isComplete
                ? (attack.isCrosses ? 'altar.replay_crosses' : 'altar.replay_books')
                : (attack.isCrosses ? 'altar.crosses_required' : 'altar.books_required');
            requirementEl.textContent = window.t(key, { count: required });
        }
        button.classList.toggle('is-replay', isComplete);
        if (progressEl) {
            progressEl.textContent = formatAltarProgress(stats[attack.progressStat], getAltarProgressDisplayTotal(attack.routeKey));
        }
        const isInsufficient = owned < required;
        button.classList.toggle('insufficient', isInsufficient);
        button.setAttribute('aria-disabled', isInsufficient ? 'true' : 'false');
        if (!controller.pendingAltarChoice) {
            button.disabled = false;
            button.classList.remove('choice-btn--disabled');
        }
    });

    updateAltarPathLine(controller);
    renderFinalRitePanel(controller);
}

/**
 * Handle altar choice selection
 */
function handleAltarChoice(controller, choice) {
    // Every run's controller binds these same buttons: only the live run may answer,
    // or a stale one spends the previous run's relics and plays its scene.
    if (!controller || controller !== window.uiController || controller.pendingAltarChoice) {
        return;
    }

    // The last vigil's altar is the final rite: only handleFinalRiteChoice may act
    // there. The rite buttons are CSS-hidden by #altar-screen.is-final-rite, and
    // without this guard a click that reaches them anyway spends relics and then
    // startNextRound() walks the run to vigil 7 — a phase that does not exist and
    // that no ending can ever be reached from.
    if (isFinalRiteAltar(controller)) {
        return;
    }

    if (choice === 'attack-nun' || choice === 'attack-demon') {
        if (typeof window.startAltarDuel === 'function') {
            window.startAltarDuel(controller, choice);
        }
        return;
    }

    const requirements = getAltarRequirements(controller.gameState);
    const stats = getStats(controller.gameState);

    if (choice === 'help-nun' && stats.crosses < requirements.helpNun) {
        showInsufficientResourcesMessage(controller, choice);
        return;
    }

    if (choice === 'help-demon' && stats.books < requirements.helpDemon) {
        showInsufficientResourcesMessage(controller, choice);
        return;
    }

    if (choice === 'demon-exorcism' && !isChoiceEditionLocked(choice) && stats.crosses < requirements.demonExorcism) {
        showInsufficientResourcesMessage(controller, choice);
        return;
    }

    if (choice === 'nun-corruption' && !isChoiceEditionLocked(choice) && stats.books < requirements.nunCorruption) {
        showInsufficientResourcesMessage(controller, choice);
        return;
    }

    console.log(`Player selected altar choice: ${choice}`);

    const result = selectAltarChoice(controller.gameState, choice);

    if (result && result.success) {
        controller.pendingAltarChoice = choice;
        if (typeof window.syncAmbientCharacterAudioState === 'function') {
            window.syncAmbientCharacterAudioState();
        }
        dismissActiveNotification();
        setAltarChoicesLocked(controller, true);
        updateCounters(controller);
        showEndingScene(controller, choice, result);
    } else if (result && result.locked) {
        showLockedChoiceUpgradePrompt(choice);
    } else {
        // Show error feedback
        showInsufficientResourcesMessage(controller, choice);
    }
}

/**
 * Show ending scene
 */
function showEndingScene(controller, choice, result) {
    const altarChoices = document.getElementById('altar-choices');
    const altarVideo = getDisplayedAltarVideo();
    const altarImage = document.getElementById('altar-image');
    const source = ALTAR_VIDEO_SOURCES[choice];
    const shouldLoopEndingVideo = true;
    const rewardPlaybackConfig = getAltarHelpRewardPlaybackConfig(choice, result);

    markRewardScenesSeen(controller, rewardPlaybackConfig);

    if (altarChoices) {
        altarChoices.style.display = 'none';
    }
    if (altarImage) {
        altarImage.classList.add('hidden');
        altarImage.removeAttribute('src');
    }

    setAltarEndingActionButtonsVisible(controller, false);

    controller.altarRewardPlayback = rewardPlaybackConfig
        ? {
            ...rewardPlaybackConfig,
            shouldLoop: shouldLoopEndingVideo,
            fallbackSource: source,
            loopIndex: 0,
            currentLoopSource: null,
            cumEnabled: false,
            supportsCum: Boolean(rewardPlaybackConfig.cumLoopSource)
        }
        : null;

    if (typeof window.syncAmbientCharacterAudioState === 'function') {
        window.syncAmbientCharacterAudioState();
    }

    if (!altarVideo) {
        setAltarEndingActionButtonsVisible(controller, true);
        return;
    }

    altarVideo.onended = null;
    altarVideo.onerror = null;
    altarVideo.playsInline = true;
    altarVideo.muted = true;
    altarVideo.style.opacity = '1';

    if (controller.altarRewardPlayback) {
        startAltarRewardSequence(controller);
        return;
    }

    // One whole scene, played once: when it ends the ending continues on its own.
    if (SINGLE_PLAY_ENDING_CHOICES.includes(choice) && source) {
        const finishSinglePlayEndingScene = () => {
            altarVideo.onended = null;
            altarVideo.onerror = null;
            continueAfterAltarScene(controller);
        };

        // Hard-reset the element (same reason as startAltarRewardSequence): whatever
        // the altar was showing may be an already-ended video.
        altarVideo.pause();
        altarVideo.loop = false;
        altarVideo.muted = false;
        altarVideo.removeAttribute('src');
        altarVideo.load();

        setAltarEndingActionButtonsVisible(controller, true);

        playAltarVideoSource(altarVideo, source, {
            loop: false,
            onEnded: finishSinglePlayEndingScene,
            onError: () => {
                console.warn(`Failed to load ending video: ${source}`);
                finishSinglePlayEndingScene();
            },
            onPlayError: (error) => {
                console.warn('Failed to play altar ending video:', error);
            }
        });
        return;
    }

    altarVideo.loop = shouldLoopEndingVideo;

    setAltarEndingActionButtonsVisible(controller, true);

    if (source) {
        playAltarVideoSource(altarVideo, source, {
            loop: shouldLoopEndingVideo,
            onPlayError: (error) => {
                console.warn('Failed to play altar ending video:', error);
            }
        });
        return;
    }

    altarVideo.removeAttribute('src');
    altarVideo.load();
    resetAltarRewardPlayback(controller);
}

function returnToTitleThen(showCard) {
    const afterFade = () => {
        if (typeof showCard === 'function') {
            showCard();
        }
    };

    if (typeof window.returnToTitleScreen === 'function') {
        Promise.resolve(window.returnToTitleScreen()).then(afterFade);
        return;
    }

    afterFade();
}

function continueAfterAltarScene(controller) {
    if (controller !== window.uiController) return;

    // The final rite's scene just played: record the ending and show its card.
    if (controller && controller.pendingEnding) {
        const endingKey = controller.pendingEnding;
        controller.pendingEnding = null;
        const summary = typeof window.completeTheNunEnding === 'function'
            ? window.completeTheNunEnding(endingKey)
            : null;
        hideAltarScreen(controller);
        returnToTitleThen(() => {
            if (summary && typeof window.showTheNunEndingCard === 'function') {
                window.showTheNunEndingCard(summary);
            }
        });
        return;
    }

    // Surrender ends the vigil in failure; the run can be continued from the
    // end-of-run screen with every relic kept.
    if (controller && controller.pendingAltarChoice === 'surrender') {
        const summary = typeof window.captureTheNunRunFailure === 'function'
            ? window.captureTheNunRunFailure('surrender')
            : null;
        hideAltarScreen(controller);
        returnToTitleThen(() => {
            if (summary && typeof window.showTheNunRunReckoning === 'function') {
                window.showTheNunRunReckoning(summary);
            }
        });
        return;
    }

    startNextRound(controller);
}

function restartAfterSurrender(controller) {
    if (controller !== window.uiController) return;
    hideAltarScreen(controller);

    if (typeof window.initializeNunRuntime === 'function') {
        window.initializeNunRuntime();
    }
}

function quitAfterSurrender(controller) {
    if (controller !== window.uiController) return;
    if (typeof window.returnToTitleScreen === 'function') {
        window.returnToTitleScreen();
        return;
    }

    hideAltarScreen(controller);
    fallbackToTitleScreen(controller);
}

/**
 * Show insufficient resources message
 */
function showInsufficientResourcesMessage(controller, choice) {
    const requirements = getAltarRequirements(controller.gameState);
    const stats = getStats(controller.gameState);

    let message = '';
    if (choice === 'help-nun') {
        message = window.t('altar.need_crosses', { required: requirements.helpNun, current: stats.crosses });
    } else if (choice === 'attack-nun') {
        message = window.t('altar.need_crosses', { required: requirements.attackNun, current: stats.crosses });
    } else if (choice === 'help-demon') {
        message = window.t('altar.need_books', { required: requirements.helpDemon, current: stats.books });
    } else if (choice === 'attack-demon') {
        message = window.t('altar.need_books', { required: requirements.attackDemon, current: stats.books });
    } else if (choice === 'demon-exorcism' && isChoiceEditionLocked(choice)) {
        message = window.t(UI_CONFIG.LOCKED_SUPPORT_MESSAGE_KEY);
    } else if (choice === 'nun-corruption' && isChoiceEditionLocked(choice)) {
        message = window.t(UI_CONFIG.LOCKED_SUPPORT_MESSAGE_KEY);
    } else if (choice === 'demon-exorcism') {
        message = window.t('altar.need_crosses', { required: requirements.demonExorcism, current: stats.crosses });
    } else if (choice === 'nun-corruption') {
        message = window.t('altar.need_books', { required: requirements.nunCorruption, current: stats.books });
    }

    console.log(`[ERROR] ${message}`);
    showNotification(controller, message, 'error');
    flagAltarChoiceDenied(choice);
}

/**
 * Visual only: shake the rite button the player could not afford (the
 * .choice-btn.is-denied rule in game.css). Restarts on repeated clicks.
 */
function flagAltarChoiceDenied(choice) {
    const button = document.querySelector(`.choice-btn[data-choice="${choice}"]`);
    if (!button) {
        return;
    }

    clearTimeout(button.deniedTimer);
    button.classList.remove('is-denied');
    void button.offsetWidth;
    button.classList.add('is-denied');
    button.deniedTimer = setTimeout(() => button.classList.remove('is-denied'), 480);
}

/**
 * Show notification to player
 */
function showNotification(controller, message, type = 'info') {
    const existingNotification = document.querySelector('.game-notification');
    const notification = existingNotification || document.createElement('div');
    notification.className = `game-notification ${type}`;
    notification.classList.remove('fade-out');
    notification.textContent = message;

    if (!existingNotification) {
        document.body.appendChild(notification);
    }

    if (notification.dismissTimer) {
        clearTimeout(notification.dismissTimer);
    }

    notification.dismissTimer = setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

/**
 * Start next round
 */
function startNextRound(controller) {
    hideAltarScreen(controller);

    if (typeof window.advanceGameRound === 'function') {
        window.advanceGameRound(controller.gameState);
    }

    // Checkpoint: "Continue" restarts this vigil from here.
    if (typeof window.saveTheNunRunCheckpoint === 'function') {
        window.saveTheNunRunCheckpoint(controller.gameState);
    }

    if (typeof window.resetAmbientCharacterAudioCycle === 'function') {
        window.resetAmbientCharacterAudioCycle();
    }

    // Reset for next round
    if (window.nunSystem) {
        resetNun(window.nunSystem, { startApproach: false });
    }

    if (window.lightingSystem) {
        resetLights(window.lightingSystem);
    }

    // Reset any pending demon attack that accumulated during the altar screen,
    // so it does not fire during the phase intro overlay.
    if (typeof window.clearScheduledDemonAttack === 'function' && window.demonAttacksSystem) {
        window.clearScheduledDemonAttack(window.demonAttacksSystem);
    }

    // Build the next environment while the vigil intro plays; gameplay starts after.
    if (typeof window.prepareTheNunVigil === 'function') {
        window.prepareTheNunVigil(controller.gameState.currentRound);
    }
    playPhaseStartIntro(controller, window.beginTheNunVigilSystems);
}

/**
 * Fallback: return to title screen and reset game
 */
function fallbackToTitleScreen(controller) {
    console.log('Returning to title screen...');

    if (typeof window.returnToTitleScreen === 'function') {
        window.returnToTitleScreen();
        return;
    }

    // Hide altar screen
    hideAltarScreen(controller);

    // Hide game container
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.add('hidden');

    // Show title screen
    if (typeof window.showTitleScreen === 'function') {
        window.showTitleScreen({ immediate: true });
    }

    // Reset all game systems
    resetGame(controller.gameState);

    if (window.nunSystem) {
        resetNun(window.nunSystem);
    }

    if (window.lightingSystem) {
        resetLights(window.lightingSystem);
    }

    if (window.collectiblesSystem) {
        clearCollectibles(window.collectiblesSystem);
    }

    if (window.demonAttacksSystem) {
        cleanupDemonAttacksSystem(window.demonAttacksSystem);
    }

    updateCounters(controller);

    console.log('Game reset complete - at title screen');
}

/**
 * Show victory screen (both paths completed)
 */
function showVictoryScreen(controller) {
    const victoryDiv = document.createElement('div');
    victoryDiv.id = 'victory-screen';
    victoryDiv.className = 'modal-overlay';

    victoryDiv.innerHTML = `
        <div class="modal-content">
            <h1 class="victory-title">${window.t('victory.title')}</h1>
            <p class="victory-text">${window.t('victory.text')}</p>
            <p class="victory-subtext">${window.t('victory.subtext')}</p>
            <button id="victory-restart-btn" class="modal-button victory">${window.t('victory.play_again')}</button>
        </div>
    `;

    document.body.appendChild(victoryDiv);

    console.log('[VIDEO TRIGGER] Victory/Bonus scene');

    // Restart handler
    document.getElementById('victory-restart-btn').addEventListener('click', () => {
        victoryDiv.remove();
        resetGame(controller.gameState);
        hideAltarScreen(controller);

        if (window.nunSystem) {
            resetNun(window.nunSystem);
        }
        if (window.collectiblesSystem) {
            spawnCollectiblesForZone(window.collectiblesSystem);
        }
        if (window.lightingSystem) {
            resetLights(window.lightingSystem);
        }

        updateCounters(controller);
    });
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.createUIController = createUIController;
    window.updateCounters = updateCounters;
    window.showAltarScreen = showAltarScreen;
    window.hideAltarScreen = hideAltarScreen;
    const _playPhaseStartIntro = playPhaseStartIntro;
    window.playPhaseStartIntro = function(controller, onComplete) {
        _playPhaseStartIntro(controller || window.uiController, onComplete);
    };
    window.refreshAltarTranslations = function() {
        if (window.uiController) {
            updateAltarRequirements(window.uiController);
        }
    };
    window.refreshLookBackButtonLabel = function() {
        if (window.uiController) {
            updateLookBackButtonLabel(window.uiController);
            updateNavigationButtonStates(window.uiController);
        }
    };
}
