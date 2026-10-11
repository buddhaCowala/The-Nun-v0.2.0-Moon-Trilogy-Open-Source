/**
 * Run flow for The Nun — everything that makes a run readable and worth continuing:
 *
 *  - Breath meter: the nun's hidden clock (her look-back clip timeline) shown as a
 *    bar at the bottom, with footsteps that speed up and your own breathing as she
 *    closes in.
 *  - Devotion meter: -100 (corruption) .. +100 (purity), the ending you are heading to.
 *  - Vigil title cards and zone-name toasts.
 *  - Checkpoints: the run is saved at the start of every vigil; getting caught or
 *    surrendering offers "Continue" with every relic kept.
 *  - End-of-run screen and ending cards, plus the title-screen Continue button.
 *
 * Persistence goes through window.getTheNunProgress / updateTheNunProgress /
 * getTheNunSavedRun / setTheNunSavedRun (scripts/settings.js), so it rides the
 * existing save paths and their Steam Cloud rules.
 */
(function () {
    'use strict';

    const TICK_MS = 200;
    const ENDING_KEYS = ['exorcism', 'corruption', 'limbo'];
    const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const PHASE_TITLE_COUNT = 6;

    const METER_NEAR = 0.6;
    const METER_HERE = 0.85;

    // Proximity audio (unused single-step samples + the ambient breathing clips).
    const FOOTSTEP_SOURCES = ['assets/sounds/walking.mp3', 'assets/sounds/walking2.mp3'];
    const BREATH_SOURCES = ['assets/sounds/breathing1.mp3', 'assets/sounds/breathing2.mp3'];
    const FOOTSTEPS_FROM = 0.35;
    const BREATH_FROM = 0.7;

    const flowState = {
        pendingRestore: null,
        tickId: null,
        lastStepAt: 0,
        stepIndex: 0,
        lastBreathAt: 0,
        audioPool: [],
        zoneToastTimer: null
    };

    // ------------------------------------------------------------------ helpers

    function t(key, vars) {
        return typeof window.t === 'function' ? window.t(key, vars) : key;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function isShown(id) {
        const element = byId(id);
        return Boolean(element) && element.style.display !== 'none' && !element.classList.contains('hidden');
    }

    function getFinalPhase() {
        return Number(window.THE_NUN_FINAL_PHASE) || 6;
    }

    function getSfxVolume() {
        const volume = Number(window.gameSettings?.audio?.sfxVolume);
        return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
    }

    function toRoman(value) {
        const index = Math.max(1, Number(value) || 1) - 1;
        return ROMAN_NUMERALS[index] || String(index + 1);
    }

    function getProgress() {
        return typeof window.getTheNunProgress === 'function'
            ? window.getTheNunProgress()
            : { endingsSeen: {}, routeBest: {}, runsStarted: 0, tutorialOffered: true };
    }

    function updateProgress(mutate) {
        if (typeof window.updateTheNunProgress === 'function') {
            return window.updateTheNunProgress(mutate);
        }
        return null;
    }

    function getSavedRun() {
        return typeof window.getTheNunSavedRun === 'function' ? window.getTheNunSavedRun() : null;
    }

    function setSavedRun(run) {
        if (typeof window.setTheNunSavedRun === 'function') {
            window.setTheNunSavedRun(run);
        }
    }

    function getDevotionPath(devotion) {
        return typeof window.getTheNunDevotionPath === 'function'
            ? window.getTheNunDevotionPath(devotion)
            : 'limbo';
    }

    function countEndingsSeen(progress) {
        const seen = (progress && progress.endingsSeen) || {};
        return ENDING_KEYS.filter((key) => seen[key]).length;
    }

    function isGameplayActive() {
        return Boolean(window.gameState)
            && typeof window.isGameplayViewVisible === 'function'
            && window.isGameplayViewVisible();
    }

    // The nun catches you when the current zone's look-back clip ends, so her
    // approach is simply how far that clip has played. null = not measurable now.
    function getNunApproachRatio() {
        // 3D: the Nun is a real pursuer; her proximity is path distance to the player.
        if (window.THE_NUN_3D_MODE && window.theNun3D) {
            return window.theNun3D.getNunProximity();
        }

        const nunSystem = window.nunSystem;
        if (!nunSystem || !Array.isArray(nunSystem.nunVideos) || nunSystem.isPlayingNunCaughtScene) {
            return null;
        }

        const video = nunSystem.nunVideos.find((entry) => Number(entry.dataset.nunZone) === nunSystem.activeNunZone);
        if (!video) {
            return null;
        }

        const duration = Number(video.duration);
        const currentTime = Number(video.currentTime);
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) {
            return null;
        }

        return Math.max(0, Math.min(1, currentTime / duration));
    }

    function isGameplayCovered() {
        const state = window.gameState;
        return Boolean(
            !state
            || state.isAtAltar
            || state.gameOver
            || isShown('phase-intro-overlay')
            || isShown('altar-screen')
            || (window.nunSystem && window.nunSystem.isPlayingNunCaughtScene)
        );
    }

    // ------------------------------------------------------------- proximity audio

    function playOneShot(source, volume, playbackRate) {
        const audio = new Audio(source);
        audio.preload = 'auto';
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.playbackRate = playbackRate || 1;
        flowState.audioPool.push(audio);
        const release = () => {
            flowState.audioPool = flowState.audioPool.filter((entry) => entry !== audio);
        };
        audio.addEventListener('ended', release, { once: true });
        audio.addEventListener('error', release, { once: true });
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(release);
        }
    }

    function stopProximityAudio() {
        flowState.audioPool.forEach((audio) => {
            try {
                audio.pause();
            } catch (error) {
                /* ignore */
            }
        });
        flowState.audioPool = [];
    }

    function updateProximityAudio(ratio, now) {
        if (ratio == null || window.gameState?.isTimePaused) {
            stopProximityAudio();
            return;
        }

        const sfx = getSfxVolume();

        // Her footsteps, 2D only: one step every 1.1 s far away, every 0.38 s right
        // behind you, from FOOTSTEPS_FROM of her clip.
        // In the 3D world this metronome is GONE (Shaun: they must match the pace of the
        // nun walking). world3d/nunSteps.js plays one hit per footfall of her walk clip
        // instead, out of her own nunwalks.mp3, so a candle pool's crawl and the vigil's
        // pace are heard — nothing here may play a step over it.
        if (!window.THE_NUN_3D_MODE) {
            const closeness = ratio >= FOOTSTEPS_FROM ? (ratio - FOOTSTEPS_FROM) / (1 - FOOTSTEPS_FROM) : null;
            if (closeness != null) {
                const interval = 1100 - (closeness * 720);
                if (now - flowState.lastStepAt >= interval) {
                    flowState.lastStepAt = now;
                    flowState.stepIndex = (flowState.stepIndex + 1) % FOOTSTEP_SOURCES.length;
                    playOneShot(FOOTSTEP_SOURCES[flowState.stepIndex], sfx * (0.12 + (0.5 * closeness)), 0.9 + (0.2 * closeness));
                }
            }
        }

        // Your own breathing catches once she is close — unless the 3D world is already
        // running it off the Breath meter (world.js updateBreath), which is continuous
        // and covers this case; two breathings over each other is one too many.
        const worldBreathing = Boolean(window.theNun3D && typeof window.theNun3D.isBreathing === 'function'
            && window.theNun3D.isBreathing());
        if (ratio >= BREATH_FROM && !worldBreathing) {
            const interval = ratio >= METER_HERE ? 5200 : 8000;
            if (now - flowState.lastBreathAt >= interval) {
                flowState.lastBreathAt = now;
                const source = BREATH_SOURCES[Math.floor(Math.random() * BREATH_SOURCES.length)];
                playOneShot(source, sfx * 0.45, 1.08);
            }
        }
    }

    // --------------------------------------------------------------- HUD meters

    // The 3D world's read on the point of no return (world.js getAltarRunout).
    function getAltarRunout() {
        return window.THE_NUN_3D_MODE && window.theNun3D && typeof window.theNun3D.getAltarRunout === 'function'
            ? window.theNun3D.getAltarRunout()
            : null;
    }

    function updateBreathMeter(ratio) {
        const meter = byId('breath-meter');
        const vignette = byId('dread-vignette');
        if (!meter) {
            return;
        }

        const visible = ratio != null;
        meter.classList.toggle('is-visible', visible);
        if (!visible) {
            meter.classList.remove('is-near', 'is-here', 'is-marked', 'is-late');
            if (vignette) {
                vignette.classList.remove('is-active', 'is-close');
            }
            return;
        }

        const isHere = ratio >= METER_HERE;
        const isNear = !isHere && ratio >= METER_NEAR;
        // Jitter near the end so it never reads as a clean countdown.
        const jitter = isHere ? (Math.random() - 0.5) * 0.02 : 0;
        const fill = meter.querySelector('.breath-meter__fill');
        const label = meter.querySelector('.breath-meter__label');

        if (fill) {
            fill.style.width = `${Math.max(0, Math.min(100, (ratio + jitter) * 100)).toFixed(1)}%`;
        }
        meter.classList.toggle('is-near', isNear);
        meter.classList.toggle('is-here', isHere);

        // The point of no return: a notch on the same track, and the label turns from
        // "she is getting close" into an order once the fill has passed it.
        const runout = getAltarRunout();
        const tick = meter.querySelector('.breath-meter__tick');
        const marked = Boolean(runout) && runout.tick != null;
        if (tick && marked) {
            tick.style.left = `${(runout.tick * 100).toFixed(1)}%`;
        }
        meter.classList.toggle('is-marked', marked);
        const isLate = Boolean(runout && runout.past);
        meter.classList.toggle('is-late', isLate);

        if (label) {
            const labelKey = isHere
                ? 'meter.here'
                : (isLate ? 'meter.run_altar' : (isNear ? 'meter.near' : 'meter.far'));
            if (label.dataset.key !== labelKey) {
                label.dataset.key = labelKey;
                label.textContent = t(labelKey);
            }
        }
        if (vignette) {
            vignette.classList.toggle('is-active', isHere);
            // Twice wallDread: the nave still behind you, felt at the edges of the eye.
            vignette.classList.toggle('is-close', Boolean(runout) && runout.wallAhead < 12);
        }
    }

    // ------------------------------------------------------- the next rite's price

    // Crosses pull toward the Nun, books toward the Demon: show the cheaper of the two
    // rites still open on the side the player's devotion already points at.
    const RITE_ROUTES = {
        crosses: ['helpNun', 'demonExorcism'],
        books: ['helpDemon', 'nunCorruption']
    };

    function getNextRite() {
        const state = window.gameState;
        if (!state || typeof window.getAltarRequirements !== 'function') {
            return null;
        }
        // Vigil 6's altar is the final rite: no rite is for sale there.
        if (typeof window.isTheNunFinalAltarPhase === 'function' && window.isTheNunFinalAltarPhase(state)) {
            return null;
        }

        const prices = window.getAltarRequirements(state);
        const currency = (Number(state.devotion) || 0) < 0 ? 'books' : 'crosses';
        const routes = RITE_ROUTES[currency];
        const done = typeof window.isTheNunAltarRouteComplete === 'function'
            ? (key) => window.isTheNunAltarRouteComplete(state, key)
            : () => false;
        const open = routes.filter((key) => !done(key));
        const pick = (open.length ? open : routes)
            .reduce((best, key) => (best === null || prices[key] < prices[best] ? key : best), null);
        const price = Number(prices[pick]) || 0;
        const held = Number(currency === 'books' ? state.booksCollected : state.crossesCollected) || 0;
        return { currency, price, affordable: held >= price };
    }

    function updateRiteCounter() {
        const chip = byId('rite-display');
        const zone = byId('zone-display');
        if (!chip) {
            return;
        }

        // The zone quintiles are the 2D game's; the 3D nave has none.
        const is3D = Boolean(window.THE_NUN_3D_MODE);
        if (zone) {
            zone.classList.toggle('hidden', is3D);
        }

        const rite = is3D && isGameplayActive() ? getNextRite() : null;
        chip.classList.toggle('hidden', !rite);
        const cross = byId('cross-counter');
        const book = byId('book-counter');
        if (!rite) {
            if (cross) cross.classList.remove('is-affordable');
            if (book) book.classList.remove('is-affordable');
            return;
        }

        const price = byId('rite-price');
        if (price && price.textContent !== String(rite.price)) {
            price.textContent = String(rite.price);
        }
        const crossIcon = byId('rite-icon-cross');
        const bookIcon = byId('rite-icon-book');
        if (crossIcon) crossIcon.classList.toggle('hidden', rite.currency !== 'crosses');
        if (bookIcon) bookIcon.classList.toggle('hidden', rite.currency !== 'books');
        chip.classList.toggle('is-affordable', rite.affordable);
        if (cross) cross.classList.toggle('is-affordable', rite.affordable && rite.currency === 'crosses');
        if (book) book.classList.toggle('is-affordable', rite.affordable && rite.currency === 'books');
    }

    function updateDevotionMeter() {
        const meter = byId('devotion-meter');
        if (!meter) {
            return;
        }

        const state = window.gameState;
        const counters = byId('counters');
        const visible = Boolean(state) && isGameplayActive() && !(counters && counters.classList.contains('counters-hidden'));
        meter.classList.toggle('is-visible', visible);
        if (!visible) {
            return;
        }

        const devotion = Math.max(-100, Math.min(100, Number(state.devotion) || 0));
        const path = getDevotionPath(devotion);
        const marker = meter.querySelector('.devotion-meter__marker');
        const pathLabel = meter.querySelector('.devotion-meter__path');

        if (marker) {
            // Purity (crosses) on the left, corruption (books) on the right.
            marker.style.left = `${((100 - devotion) / 200) * 100}%`;
        }
        meter.dataset.path = path;
        if (pathLabel) {
            const text = t('devotion.path', { path: t(`ending.${path}.name`) });
            if (pathLabel.textContent !== text) {
                pathLabel.textContent = text;
            }
        }
    }

    // ------------------------------------------------------------------- the tick

    function tick() {
        const now = performance.now();
        const active = isGameplayActive();
        const ratio = active && !isGameplayCovered() ? getNunApproachRatio() : null;

        updateBreathMeter(ratio);
        updateRiteCounter();
        updateDevotionMeter();
        updateProximityAudio(active ? ratio : null, now);
    }

    function ensureTick() {
        if (flowState.tickId) {
            return;
        }
        flowState.tickId = window.setInterval(tick, TICK_MS);
    }

    // ------------------------------------------------------- vigil and zone cards

    window.showTheNunPhaseTitle = function (phase) {
        const card = byId('phase-intro-title');
        if (!card) {
            return;
        }

        const safePhase = Math.max(1, Math.min(PHASE_TITLE_COUNT, Number(phase) || 1));
        const isFinal = (Number(phase) || 1) >= getFinalPhase();
        const titleIndex = isFinal ? PHASE_TITLE_COUNT : safePhase;

        card.querySelector('.phase-intro-title__vigil').textContent = t('phase.vigil_label', { numeral: toRoman(phase) });
        card.querySelector('.phase-intro-title__name').textContent = t(`phase.title_${titleIndex}`);
        card.querySelector('.phase-intro-title__line').textContent = t(`phase.line_${titleIndex}`);

        card.classList.remove('is-visible');
        void card.offsetWidth;
        card.classList.add('is-visible');
    };

    window.hideTheNunPhaseTitle = function () {
        const card = byId('phase-intro-title');
        if (card) {
            card.classList.remove('is-visible');
        }
    };

    window.showTheNunZoneToast = function (zone) {
        const safeZone = Math.max(1, Math.min(5, Number(zone) || 1));
        window.showTheNunToast(t('zone.toast', { numeral: toRoman(safeZone), name: t(`zone.name_${safeZone}`) }));
    };

    window.showTheNunToast = function (text) {
        const toast = byId('zone-toast');
        if (!toast) {
            return;
        }

        toast.textContent = text;
        toast.classList.remove('is-visible');
        void toast.offsetWidth;
        toast.classList.add('is-visible');

        if (flowState.zoneToastTimer) {
            window.clearTimeout(flowState.zoneToastTimer);
        }
        flowState.zoneToastTimer = window.setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 2600);
    };

    // ----------------------------------------------------------- run persistence

    window.noteTheNunRunStarted = function () {
        updateProgress((progress) => {
            progress.runsStarted += 1;
        });
    };

    window.recordTheNunRouteBest = function (routeKey, value) {
        if (typeof window.isTheNunTutorialActive === 'function' && window.isTheNunTutorialActive()) {
            return;   // the tutorial's sandbox vigil (scripts/tutorial.js)
        }
        updateProgress((progress) => {
            if (progress.routeBest && Object.prototype.hasOwnProperty.call(progress.routeBest, routeKey)) {
                progress.routeBest[routeKey] = Math.max(progress.routeBest[routeKey] || 0, Number(value) || 0);
            }
        });
    };

    window.saveTheNunRunCheckpoint = function (state) {
        const liveState = state || window.gameState;
        if (!liveState || typeof window.buildTheNunRunSnapshot !== 'function') {
            return null;
        }

        const run = window.buildTheNunRunSnapshot(liveState);
        setSavedRun(run);
        return run;
    };

    // Called when the nun catches the player or they surrender. Saves the run with
    // every relic kept (Shaun: halving them made the altar's later scenes out of
    // reach) and returns the summary the end-of-run screen shows.
    window.captureTheNunRunFailure = function (cause) {
        const state = window.gameState;
        if (!state || typeof window.buildTheNunRunSnapshot !== 'function') {
            return null;
        }

        const run = window.buildTheNunRunSnapshot(state);
        setSavedRun(run);

        return {
            cause: cause === 'surrender' || cause === 'duel-demon' ? cause : 'caught',
            phase: run.phase,
            zone: Number(state.currentZone) || 1,
            devotion: run.devotion,
            stats: Object.assign({}, run.stats),
            keptCrosses: run.crosses,
            keptBooks: run.books
        };
    };

    window.completeTheNunEnding = function (endingKey) {
        const state = window.gameState;
        const key = ENDING_KEYS.includes(endingKey) ? endingKey : 'limbo';
        let firstTime = false;

        updateProgress((progress) => {
            firstTime = !progress.endingsSeen[key];
            progress.endingsSeen[key] = true;
        });
        setSavedRun(null);

        return {
            ending: key,
            firstTime,
            phase: state ? Number(state.currentRound) || 1 : getFinalPhase(),
            devotion: state ? Number(state.devotion) || 0 : 0,
            stats: Object.assign({}, state && state.runStats ? state.runStats : {})
        };
    };

    window.setTheNunPendingRunRestore = function (run) {
        flowState.pendingRestore = run || null;
    };

    window.consumeTheNunPendingRunRestore = function () {
        const run = flowState.pendingRestore;
        flowState.pendingRestore = null;
        return run;
    };

    function removeRunCards() {
        document.querySelectorAll('.run-card-overlay').forEach((element) => element.remove());
    }

    window.continueTheNunRun = function () {
        const run = getSavedRun();
        removeRunCards();
        if (!run) {
            window.refreshTheNunRunUi();
            return;
        }

        window.setTheNunPendingRunRestore(run);
        if (typeof window.startGame === 'function') {
            window.startGame();
        }
    };

    function startFreshRun() {
        removeRunCards();
        setSavedRun(null);
        window.setTheNunPendingRunRestore(null);
        window.refreshTheNunRunUi();
        if (typeof window.startGame === 'function') {
            window.startGame();
        }
    }

    // "Play" from the title: a saved run is only discarded after a confirmation.
    window.requestTheNunNewRun = function () {
        // A save's very first run asks first: play the tutorial? (scripts/tutorial.js)
        if (window.theNunTutorial && window.theNunTutorial.shouldOffer()) {
            window.theNunTutorial.offer();
            return;
        }
        const run = getSavedRun();
        if (!run) {
            startFreshRun();
            return;
        }

        showRunCard({
            className: 'run-card--confirm',
            title: t('run.new_confirm_title'),
            lines: [t('run.new_confirm_text', { phase: run.phase })],
            buttons: [
                { label: t('common.cancel'), secondary: true, onClick: removeRunCards },
                { label: t('run.new_confirm_yes'), onClick: startFreshRun }
            ]
        });
    };

    window.abandonTheNunRun = function () {
        setSavedRun(null);
        removeRunCards();
        window.refreshTheNunRunUi();
    };

    // ----------------------------------------------------------------- run cards

    function showRunCard(options) {
        removeRunCards();

        const stage = byId('app-stage') || document.body;
        const overlay = document.createElement('div');
        overlay.className = `run-card-overlay ${options.className || ''}`.trim();
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        if (options.backgroundImage) {
            const backdrop = document.createElement('div');
            backdrop.className = 'run-card-backdrop';
            backdrop.style.backgroundImage = `url("${options.backgroundImage}")`;
            overlay.appendChild(backdrop);
        }

        const card = document.createElement('div');
        card.className = 'run-card';

        if (options.kicker) {
            const kicker = document.createElement('div');
            kicker.className = 'run-card__kicker';
            kicker.textContent = options.kicker;
            card.appendChild(kicker);
        }

        const title = document.createElement('h2');
        title.className = 'run-card__title';
        title.textContent = options.title || '';
        card.appendChild(title);

        (options.lines || []).filter(Boolean).forEach((line, index) => {
            const paragraph = document.createElement('p');
            paragraph.className = index === 0 && options.leadLine ? 'run-card__lead' : 'run-card__line';
            paragraph.textContent = line;
            card.appendChild(paragraph);
        });

        if (options.stats && options.stats.length) {
            const list = document.createElement('div');
            list.className = 'run-card__stats';
            options.stats.forEach((stat) => {
                const row = document.createElement('div');
                row.className = 'run-card__stat';
                row.textContent = stat;
                list.appendChild(row);
            });
            card.appendChild(list);
        }

        if (options.footer) {
            const footer = document.createElement('p');
            footer.className = 'run-card__footer';
            footer.textContent = options.footer;
            card.appendChild(footer);
        }

        const actions = document.createElement('div');
        actions.className = 'run-card__actions';
        (options.buttons || []).forEach((buttonConfig) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `run-card__button${buttonConfig.secondary ? ' run-card__button--secondary' : ''}`;
            button.textContent = buttonConfig.label;
            if (buttonConfig.note) {
                const note = document.createElement('span');
                note.className = 'run-card__button-note';
                note.textContent = buttonConfig.note;
                button.appendChild(note);
            }
            button.addEventListener('click', () => {
                if (typeof buttonConfig.onClick === 'function') {
                    buttonConfig.onClick();
                }
            });
            actions.appendChild(button);
        });
        card.appendChild(actions);

        overlay.appendChild(card);
        stage.appendChild(overlay);

        window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
        const primary = actions.querySelector('.run-card__button:not(.run-card__button--secondary)');
        if (primary) {
            primary.focus({ preventScroll: true });
        }
        return overlay;
    }

    function formatBestRecord() {
        const stats = window.gameSettings?.stats || {};
        return t('reckoning.best', { phase: stats.bestRound || 1, zone: stats.bestZone || 1 });
    }

    function buildRunStatLines(summary) {
        const stats = summary.stats || {};
        return [
            t('reckoning.relics', { count: stats.relics || 0 }),
            t('reckoning.attacks', { repelled: stats.repelled || 0, lost: stats.lost || 0 }),
            t('reckoning.rites', { count: stats.rites || 0 })
        ];
    }

    window.showTheNunRunReckoning = function (summary) {
        if (!summary) {
            return;
        }

        const path = getDevotionPath(summary.devotion);
        const finalPhase = getFinalPhase();
        const vigilsLeft = Math.max(0, finalPhase - summary.phase);

        showRunCard({
            className: 'run-card--reckoning',
            kicker: t('reckoning.kicker', { phase: summary.phase, zone: summary.zone }),
            title: t(summary.cause === 'surrender' ? 'reckoning.surrender_title' : 'reckoning.caught_title'),
            leadLine: true,
            lines: [
                t(summary.cause === 'surrender' ? 'reckoning.surrender_text'
                    : (summary.cause === 'duel-demon' ? 'reckoning.duel_demon_text' : 'reckoning.caught_text')),
                vigilsLeft > 0
                    ? t('reckoning.path', { path: t(`ending.${path}.name`), count: vigilsLeft })
                    : t('reckoning.path_final', { path: t(`ending.${path}.name`) })
            ],
            // (Shaun: no stats row and no record footer here — kicker, title, lead,
            // line, actions only)
            buttons: [
                {
                    label: t('reckoning.continue', { phase: summary.phase }),
                    note: t('reckoning.continue_note', { crosses: summary.keptCrosses, books: summary.keptBooks }),
                    onClick: window.continueTheNunRun
                },
                { label: t('reckoning.abandon'), secondary: true, onClick: window.abandonTheNunRun }
            ]
        });
        window.refreshTheNunRunUi();
    };

    function getEndingBackground(endingKey) {
        if (endingKey === 'exorcism') {
            return 'assets/backgrounds/transition_altar.png';
        }
        if (endingKey === 'corruption') {
            return 'assets/scenes/screenshots/others/3CA1V5.webp';
        }
        return 'assets/scenes/screenshots/others/3CA1.webp';
    }

    window.showTheNunEndingCard = function (summary) {
        if (!summary) {
            return;
        }

        const progress = getProgress();
        const found = countEndingsSeen(progress);
        const hidden = ENDING_KEYS.filter((key) => !progress.endingsSeen[key]);
        const discoveryLine = hidden.length
            ? t('ending.still_hidden', { count: hidden.length })
            : t('ending.all_found');

        showRunCard({
            className: `run-card--ending run-card--ending-${summary.ending}`,
            backgroundImage: getEndingBackground(summary.ending),
            kicker: t(summary.firstTime ? 'ending.kicker_new' : 'ending.kicker'),
            title: t(`ending.${summary.ending}.name`),
            leadLine: true,
            lines: [
                t(`ending.${summary.ending}.text`),
                t('ending.discovered', { count: found }),
                discoveryLine
            ],
            stats: buildRunStatLines(summary),
            buttons: [
                { label: t('ending.new_run'), onClick: startFreshRun },
                { label: t('common.main_menu'), secondary: true, onClick: removeRunCards }
            ]
        });
        window.refreshTheNunRunUi();
    };

    // ------------------------------------------------------------- title screen

    window.refreshTheNunRunUi = function () {
        const continueButton = byId('continue-run-button');
        const progressLine = byId('title-run-progress');
        const run = getSavedRun();

        if (continueButton) {
            continueButton.classList.toggle('hidden', !run);
            if (run) {
                continueButton.textContent = t('run.continue_button', { phase: run.phase });
            }
        }

        if (progressLine) {
            progressLine.textContent = t('run.endings_line', { count: countEndingsSeen(getProgress()) });
        }

    };

    // --------------------------------------------------------------------- boot

    function boot() {
        ensureTick();
        window.refreshTheNunRunUi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
