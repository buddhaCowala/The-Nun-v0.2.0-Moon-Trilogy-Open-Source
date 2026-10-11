/**
 * Altar Duel — "Attack the Nun" / "Attack the Demon" altar choices.
 *
 * Each girl has 5 attacks. The attack number is the route progress + 1 (the 5th
 * one replays once the route is complete) and drives the minigame difficulty.
 *
 * Flow:
 *   1. Pay the same price as the matching Help route (crosses for the nun, books
 *      for the demon) — gameState.payAltarAttackCost.
 *   2. Play that girl's attack scene once on the altar, then run the three
 *      power-struggle minigames back to back (key sequence -> targets -> mash)
 *      over that attack's looping struggle video. ONE timer covers all three.
 *   3. Win all three: the route advances (1/5 … 5/5) and that attack's win scene
 *      loops with "Cum Inside" / "Cum Outside" buttons. The picked cum scene plays
 *      once, then the next phase starts.
 *   4. Lose (the timer runs out): game over. The demon plays her defeat scene, the
 *      nun plays her caught scene (intro, then drag), then back to the title screen.
 *
 * VIDEO FILES ({n} = attack number 1-5, N = nun, D = demon). Built from the
 * renders by tools/build_attack_scenes.py, which also bakes in their sound.
 *   Attack scene (plays once before the minigames), per phase, two variants
 *   picked at random each duel:
 *     assets/scenes/attacks/3AXN{1-2}.mp4        (nun, phase 1)
 *     assets/scenes/attacks/3AXN{1-2}V{2-5}.mp4  (nun, phases 2-5)
 *     3AXD… is the same for the demon.
 *   Struggle loop (loops while the minigames run; silent, the struggle music plays):
 *     assets/scenes/attacks/3AXLN{n}.mp4   (render N{n})    3AXLD{n} (render D{n})
 *     A missing file falls back to the nun's caught intro (3AN1) / the phase's
 *     power-struggle video (3AZ{phase}S), then to the attack scene.
 *   Win scene (loops until a cum button is clicked; body sounds baked in, her
 *   moans played at random over it from assets/sounds/attack_moans/):
 *     assets/scenes/rewards/3SAN{n}.mp4    (render N{n}HJ1.5x, N{n}BJ1.25X, …)
 *   Cum scenes (play once, then the next phase):
 *     assets/scenes/rewards/3SAN{n}CI.mp4  (inside)   3SAN{n}CO.mp4  (outside)
 *   3SAD… is the same for the demon.
 *
 * Reuses the power-struggle screen markup (#power-struggle-screen) and the key /
 * target helpers from scripts/demonAttacks.js. The demon attack system's own
 * listeners ignore our clicks because no demon attack is active at the altar.
 */
(function () {
    'use strict';

    const ATTACK_COUNT = 5;

    // Attack scene, same layout as the demon defeat scenes (3AD…):
    // 3AXN{variant}.mp4 is phase 1, 3AXN{variant}V{phase}.mp4 is phases 2-5.
    // 3AXD… is the demon. Two variants per phase, picked at random each duel.
    const ATTACK_SCENE_STEMS = {
        'attack-nun': '3AXN',
        'attack-demon': '3AXD'
    };
    // Per-attack videos, see VIDEO FILES above.
    const ATTACK_ROUTES = {
        'attack-nun': { progressKey: 'attackNunProgress', loopStem: '3AXLN', rewardStem: '3SAN' },
        'attack-demon': { progressKey: 'attackDemonProgress', loopStem: '3AXLD', rewardStem: '3SAD' }
    };
    const DUEL_VIDEO_VARIANT_COUNT = 2;

    function buildAttackSceneSource(stem, phase, variant) {
        if (!stem) return null;
        const safePhase = Math.max(1, Math.min(5, Number(phase) || 1));
        const safeVariant = Math.max(1, Number(variant) || 1);
        return safePhase === 1
            ? `assets/scenes/attacks/${stem}${safeVariant}.mp4`
            : `assets/scenes/attacks/${stem}${safeVariant}V${safePhase}.mp4`;
    }

    function getDuelVariantCount() {
        return typeof getConfiguredDemonSceneVariationCount === 'function'
            ? getConfiguredDemonSceneVariationCount('altarDuel', DUEL_VIDEO_VARIANT_COUNT)
            : DUEL_VIDEO_VARIANT_COUNT;
    }

    // Random variant first, then the other variants, then phase 1, so a missing
    // file degrades instead of leaving the altar black.
    function buildPhaseVideoCandidates(stem, phase) {
        const variantCount = getDuelVariantCount();
        const picked = Math.floor(Math.random() * variantCount) + 1;
        const candidates = [buildAttackSceneSource(stem, phase, picked)];

        for (let variant = 1; variant <= variantCount; variant += 1) {
            if (variant !== picked) candidates.push(buildAttackSceneSource(stem, phase, variant));
        }
        candidates.push(buildAttackSceneSource(stem, 1, picked));

        return candidates.filter(Boolean);
    }

    function buildAttackSceneCandidates(choice, phase) {
        return buildPhaseVideoCandidates(ATTACK_SCENE_STEMS[choice], phase);
    }

    // Attack number 1-5 for the next duel on this route.
    function getAttackNumber(controller, choice) {
        const route = ATTACK_ROUTES[choice];
        const progress = Number(route && controller && controller.gameState && controller.gameState[route.progressKey]) || 0;
        return Math.max(1, Math.min(ATTACK_COUNT, progress + 1));
    }

    // The attack's own struggle loop, then placeholders: the nun's caught intro for
    // the nun, the phase's power-struggle video for the demon, then the attack scene.
    function buildStruggleLoopCandidates(choice, phase, attackNumber) {
        const placeholder = choice === 'attack-nun'
            ? (typeof getNunCaughtIntroSceneSource === 'function' ? getNunCaughtIntroSceneSource(phase, 1) : null)
            : (typeof buildPowerStruggleSceneSource === 'function' ? buildPowerStruggleSceneSource(phase, 1) : null);

        return [`assets/scenes/attacks/${ATTACK_ROUTES[choice].loopStem}${attackNumber}.mp4`]
            .concat(placeholder || [])
            .concat(buildAttackSceneCandidates(choice, phase));
    }

    function getRewardSceneSource(choice, attackNumber, suffix) {
        return `assets/scenes/rewards/${ATTACK_ROUTES[choice].rewardStem}${attackNumber}${suffix || ''}.mp4`;
    }

    const STAGES = ['sequence', 'zones', 'mash'];
    const STAGE_WIN_PAUSE_MS = 700;
    const TICK_MS = 100;
    // The whole alphabet, like the demon attacks' power struggle (demonAttacks.js).
    const DUEL_KEY_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    // Tune duel difficulty here. `n` is the attack number (1-5): every attack adds
    // keys and targets, makes the mash meter drain faster, and shortens the one
    // timer shared by all three minigames (19s on attack 1 down to 13s on attack 5).
    const DUEL_TUNING = {
        totalTimeMs: (n) => 19000 - 1500 * (n - 1),
        sequenceLength: (n) => 5 + 2 * (n - 1),
        targetCount: (n) => 4 + n,
        mashStart: 20,
        mashDecayPerTick: (n) => 1.5 + 0.3 * n,
        mashGainPerClick: (n) => 80 / (4 + n)
    };

    let duel = null;

    function el(id) {
        return document.getElementById(id);
    }

    function getPhase(controller) {
        return Math.max(1, Math.min(5, Number(controller && controller.gameState && controller.gameState.currentRound) || 1));
    }

    function isPaused(controller) {
        return Boolean(controller && controller.gameState && controller.gameState.isTimePaused);
    }

    function isDuelAlive(activeDuel) {
        return Boolean(activeDuel && duel === activeDuel && !activeDuel.finished && activeDuel.controller === window.uiController);
    }

    // Random letters, never the same one twice in a row.
    function makeKeySequence(length) {
        const sequence = [];
        for (let i = 0; i < length; i += 1) {
            let key;
            do {
                key = DUEL_KEY_POOL[Math.floor(Math.random() * DUEL_KEY_POOL.length)];
            } while (key === sequence[i - 1]);
            sequence.push(key);
        }
        return sequence;
    }

    function makeTargets(count) {
        return typeof createTargetLayout === 'function' ? createTargetLayout(count) : [];
    }

    function keyFromEvent(event) {
        if (typeof normalizeStruggleKey === 'function') {
            return normalizeStruggleKey(event);
        }
        return String(event && event.key || '').trim().toUpperCase();
    }

    function keyLabel(token) {
        return typeof formatKeyToken === 'function' ? formatKeyToken(token) : token;
    }

    // options.withSound: the per-attack videos carry their own baked sound; every
    // other clip (attack scene, placeholders, defeat scenes) stays muted.
    function playLoop(video, candidates, options) {
        if (!video) return;
        video.onended = null;
        video.onerror = null;
        video.muted = !(options && options.withSound);
        video.playsInline = true;
        video.style.opacity = '1';
        if (typeof playVideoCandidates === 'function') {
            playVideoCandidates(video, candidates, options && options.onFinished, null, options && options.onPlaying, { loop: options ? options.loop !== false : true });
            return;
        }
        video.loop = !options || options.loop !== false;
        video.src = candidates[0];
        const promise = video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    }

    function clearVideoHandlers(video) {
        if (!video) return;
        video.onended = null;
        video.onerror = null;
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.onplaying = null;
    }

    function playStruggleAudio(shouldPlay) {
        const audio = el('struggle-audio');
        if (!audio) return;
        if (shouldPlay) {
            audio.currentTime = 0;
            const promise = audio.play();
            if (promise && typeof promise.catch === 'function') promise.catch(() => {});
        } else {
            audio.pause();
        }
    }

    // -------------------------------------------------------------------------
    // Minigame UI (shares #power-struggle-screen with demon attacks)
    // -------------------------------------------------------------------------
    function ensureStageLabel() {
        const panel = document.querySelector('#power-struggle-screen .lane-struggle-panel');
        if (!panel) return null;
        let label = el('altar-duel-stage');
        if (!label) {
            label = document.createElement('div');
            label.id = 'altar-duel-stage';
            label.className = 'altar-duel-stage';
            panel.insertBefore(label, panel.firstChild);
        }
        return label;
    }

    function resetMinigameUi() {
        const keySequence = el('key-sequence');
        const playfield = el('struggle-playfield');
        const actionRow = el('struggle-action-row');
        const hitCircle = el('struggle-hit-circle');
        const zoneOrder = el('struggle-zone-order');
        if (keySequence) { keySequence.textContent = ''; keySequence.classList.add('hidden'); keySequence.classList.remove('is-started', 'is-hit', 'is-miss'); }
        if (playfield) { playfield.innerHTML = ''; playfield.classList.add('hidden'); playfield.classList.remove('is-settled', 'is-miss'); }
        if (actionRow) actionRow.classList.add('hidden');
        if (hitCircle) hitCircle.classList.add('hidden');
        if (zoneOrder) zoneOrder.classList.add('hidden');
        setProgress(0);
        setTimerFill(0);
    }

    function showDuelScreen(isVisible) {
        const screen = el('power-struggle-screen');
        if (!screen) return;
        screen.classList.toggle('hidden', !isVisible);
        screen.classList.toggle('is-altar-duel', isVisible);
        const label = el('altar-duel-stage');
        if (label && !isVisible) label.remove();
        if (!isVisible) {
            resetMinigameUi();
            const instruction = el('struggle-instruction');
            if (instruction) instruction.textContent = window.t('struggle.default_instruction');
        }
    }

    function setProgress(pct) {
        const bar = el('struggle-progress');
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }

    function setTimerFill(pct) {
        const fill = el('struggle-timer-fill');
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        // the power struggle's blood vignette (styles/game.css "pro QTE layer")
        const screen = el('power-struggle-screen');
        if (screen) {
            const live = Boolean(duel && duel.stage && !duel.finished);
            screen.classList.toggle('is-struggle-low', live && pct <= 35);
            screen.classList.toggle('is-struggle-critical', live && pct <= 15);
        }
    }

    // The power struggle's visual hooks (scripts/demonAttacks.js): the same classes
    // flash the same way, so the duel reads exactly like a power struggle.
    function flash(element, className, durationMs) {
        if (!element) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
        clearTimeout(element[`__duel_${className}`]);
        element[`__duel_${className}`] = setTimeout(() => element.classList.remove(className), durationMs || 320);
    }

    // Win / lose flourish: a non-interactive snapshot of the panel that plays out on
    // its own while the real screen closes (as demonAttacks.js showStruggleResolve).
    function showResolve(playerWon) {
        const screen = el('power-struggle-screen');
        if (!screen || screen.classList.contains('hidden') || !screen.parentElement) return;
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

    // Keycaps, as the power struggle draws them: done / current (the next key) / pending.
    function renderSequence(stage) {
        const keySequence = el('key-sequence');
        if (!keySequence) return;
        keySequence.textContent = '';
        stage.sequence.forEach((token, index) => {
            const key = document.createElement('span');
            key.className = 'lane-struggle-key';
            if (index < stage.index) {
                key.classList.add('is-done');
                if (index === stage.index - 1) key.classList.add('is-just-done');
            } else if (index === stage.index) {
                key.classList.add('is-current');
            }
            key.style.setProperty('--key-index', String(index));
            key.textContent = keyLabel(token);
            keySequence.appendChild(key);
        });
        keySequence.classList.toggle('is-started', stage.index > 0);
    }

    function renderTargets(stage) {
        const playfield = el('struggle-playfield');
        if (!playfield) return;
        playfield.innerHTML = '';
        stage.targets.forEach((target) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'lane-struggle-target';
            button.dataset.duelTargetId = target.id;
            button.style.width = `${target.size}px`;
            button.style.height = `${target.size}px`;
            button.style.left = `${target.left}%`;
            button.style.top = `${target.top}%`;
            button.style.transform = 'translate(-50%, -50%)';
            button.setAttribute('aria-label', window.t('a11y.struggle_target'));
            playfield.appendChild(button);
        });
    }

    // -------------------------------------------------------------------------
    // Stages
    // -------------------------------------------------------------------------
    function startStage(activeDuel, stageIndex) {
        if (!isDuelAlive(activeDuel)) return;
        const type = STAGES[stageIndex];
        const n = activeDuel.attackNumber;
        const stage = { type, index: 0, progress: 0 };

        resetMinigameUi();
        const label = ensureStageLabel();
        if (label) {
            label.textContent = window.t('altar.duel_stage', {
                attack: n,
                attacks: ATTACK_COUNT,
                current: stageIndex + 1,
                total: STAGES.length,
                target: window.t(activeDuel.choice === 'attack-nun' ? 'altar.duel_target_nun' : 'altar.duel_target_demon')
            });
            // each new stage rises in again, like the struggle panel's own entrance
            label.style.animation = 'none';
            void label.offsetWidth;
            label.style.animation = '';
        }
        const instruction = el('struggle-instruction');

        if (type === 'sequence') {
            stage.sequence = makeKeySequence(DUEL_TUNING.sequenceLength(n));
            if (instruction) instruction.textContent = window.t('struggle.sequence_instruction');
            const keySequence = el('key-sequence');
            if (keySequence) keySequence.classList.remove('hidden');
            const actionRow = el('struggle-action-row');
            if (actionRow) actionRow.classList.remove('hidden');
            renderSequence(stage);
        } else if (type === 'zones') {
            stage.targets = makeTargets(DUEL_TUNING.targetCount(n));
            stage.initialCount = Math.max(1, stage.targets.length);
            if (instruction) instruction.textContent = window.t('struggle.zones_instruction');
            const playfield = el('struggle-playfield');
            if (playfield) playfield.classList.remove('hidden');
            const actionRow = el('struggle-action-row');
            if (actionRow) actionRow.classList.remove('hidden');
            renderTargets(stage);
        } else {
            stage.progress = DUEL_TUNING.mashStart;
            stage.decay = DUEL_TUNING.mashDecayPerTick(n);
            stage.gain = DUEL_TUNING.mashGainPerClick(n);
            if (instruction) instruction.textContent = window.t('struggle.meter_instruction');
            const actionRow = el('struggle-action-row');
            const hitCircle = el('struggle-hit-circle');
            if (actionRow) actionRow.classList.remove('hidden');
            if (hitCircle) hitCircle.classList.remove('hidden');
        }

        activeDuel.stageIndex = stageIndex;
        activeDuel.stage = stage;
        setProgress(stage.progress);
        setTimerFill((activeDuel.remainingMs / activeDuel.totalMs) * 100);

        // One timer for the whole duel: it keeps running across the three stages
        // (it only holds during the short pause after a stage is won).
        if (!activeDuel.timer) {
            activeDuel.timer = window.setInterval(() => tickDuel(activeDuel), TICK_MS);
        }
    }

    function tickDuel(activeDuel) {
        if (!isDuelAlive(activeDuel)) {
            cancelDuel();
            return;
        }
        const stage = activeDuel.stage;
        if (!stage || stage.won || isPaused(activeDuel.controller)) return;

        activeDuel.remainingMs = Math.max(0, activeDuel.remainingMs - TICK_MS);
        setTimerFill((activeDuel.remainingMs / activeDuel.totalMs) * 100);

        if (stage.type === 'mash') {
            stage.progress = Math.max(0, stage.progress - stage.decay);
            setProgress(stage.progress);
        }

        if (activeDuel.remainingMs <= 0) {
            loseDuel(activeDuel);
        }
    }

    function winStage(activeDuel) {
        const stage = activeDuel.stage;
        if (!stage || stage.won) return;
        stage.won = true;
        setProgress(100);

        const nextIndex = activeDuel.stageIndex + 1;
        window.setTimeout(() => {
            if (!isDuelAlive(activeDuel)) return;
            if (nextIndex < STAGES.length) {
                startStage(activeDuel, nextIndex);
            } else {
                winDuel(activeDuel);
            }
        }, STAGE_WIN_PAUSE_MS);
    }

    function onKeyDown(event) {
        const activeDuel = duel;
        if (!isDuelAlive(activeDuel) || !activeDuel.stage || activeDuel.stage.type !== 'sequence' || activeDuel.stage.won) return;
        if (event.key === 'Escape' || isPaused(activeDuel.controller)) return;
        event.preventDefault();

        const stage = activeDuel.stage;
        const pressed = keyFromEvent(event);
        if (!pressed) return;
        if (pressed !== stage.sequence[stage.index]) {
            flash(el('key-sequence'), 'is-miss', 360);
            return;
        }
        stage.index += 1;
        renderSequence(stage);
        flash(el('key-sequence'), 'is-hit', 300);
        setProgress((stage.index / stage.sequence.length) * 100);
        if (stage.index >= stage.sequence.length) winStage(activeDuel);
    }

    function onPlayfieldClick(event) {
        const activeDuel = duel;
        if (!isDuelAlive(activeDuel) || !activeDuel.stage || activeDuel.stage.type !== 'zones' || activeDuel.stage.won) return;
        if (isPaused(activeDuel.controller)) return;
        const playfield = el('struggle-playfield');
        const button = event.target && event.target.closest('[data-duel-target-id]');
        if (!button) {
            flash(playfield, 'is-miss', 360);
            return;
        }

        const stage = activeDuel.stage;
        const popped = stage.targets.find((target) => target.id === button.dataset.duelTargetId);
        stage.targets = stage.targets.filter((target) => target.id !== button.dataset.duelTargetId);
        if (playfield) playfield.classList.add('is-settled');
        renderTargets(stage);
        if (playfield && popped) {
            const burst = document.createElement('span');
            burst.className = 'lane-struggle-burst';
            burst.style.left = `${popped.left}%`;
            burst.style.top = `${popped.top}%`;
            burst.style.width = `${popped.size}px`;
            burst.style.height = `${popped.size}px`;
            playfield.appendChild(burst);
            setTimeout(() => burst.remove(), 480);
        }
        setProgress(((stage.initialCount - stage.targets.length) / stage.initialCount) * 100);
        if (stage.targets.length === 0) winStage(activeDuel);
    }

    function onHitCircleClick() {
        const activeDuel = duel;
        if (!isDuelAlive(activeDuel) || !activeDuel.stage || activeDuel.stage.type !== 'mash' || activeDuel.stage.won) return;
        if (isPaused(activeDuel.controller)) return;
        const stage = activeDuel.stage;
        stage.progress = Math.min(100, stage.progress + stage.gain);
        setProgress(stage.progress);
        flash(el('struggle-hit-circle'), 'is-hit', 260);
        flash(el('struggle-action-row'), 'is-hit', 260);
        if (stage.progress >= 100) winStage(activeDuel);
    }

    function bindInputs(isBound) {
        const playfield = el('struggle-playfield');
        const hitCircle = el('struggle-hit-circle');
        if (isBound) {
            window.addEventListener('keydown', onKeyDown);
            if (playfield) playfield.addEventListener('click', onPlayfieldClick);
            if (hitCircle) hitCircle.addEventListener('click', onHitCircleClick);
        } else {
            window.removeEventListener('keydown', onKeyDown);
            if (playfield) playfield.removeEventListener('click', onPlayfieldClick);
            if (hitCircle) hitCircle.removeEventListener('click', onHitCircleClick);
        }
    }

    // -------------------------------------------------------------------------
    // Duel lifecycle
    // -------------------------------------------------------------------------
    function stopDuelSystems(activeDuel) {
        if (!activeDuel) return;
        activeDuel.finished = true;
        window.clearInterval(activeDuel.timer);
        activeDuel.timer = null;
        bindInputs(false);
        playStruggleAudio(false);
        showDuelScreen(false);
        if (activeDuel.controller && activeDuel.controller.gameState) {
            activeDuel.controller.gameState.isPowerStruggle = false;
        }
        if (duel === activeDuel) duel = null;
    }

    function startAltarDuel(controller, choice) {
        if (!controller || controller !== window.uiController || duel) return;
        if (typeof window.payAltarAttackCost !== 'function') return;

        const payment = window.payAltarAttackCost(controller.gameState, choice);
        if (!payment || !payment.success) {
            if (typeof showInsufficientResourcesMessage === 'function') {
                showInsufficientResourcesMessage(controller, choice);
            }
            return;
        }

        controller.pendingAltarChoice = choice;
        if (typeof dismissActiveNotification === 'function') dismissActiveNotification();
        if (typeof setAltarChoicesLocked === 'function') setAltarChoicesLocked(controller, true);
        if (typeof clearAltarHoverShade === 'function') clearAltarHoverShade(controller);
        if (typeof updateCounters === 'function') updateCounters(controller);

        const altarChoices = el('altar-choices');
        const altarImage = el('altar-image');
        if (altarChoices) altarChoices.style.display = 'none';
        if (altarImage) altarImage.classList.add('hidden');

        const phase = getPhase(controller);
        const attackNumber = getAttackNumber(controller, choice);
        const totalMs = DUEL_TUNING.totalTimeMs(attackNumber);
        duel = {
            controller,
            choice,
            phase,
            attackNumber,
            totalMs,
            remainingMs: totalMs,
            stageIndex: 0,
            stage: null,
            timer: null,
            finished: false,
            minigamesStarted: false
        };
        controller.gameState.isPowerStruggle = true;

        // The attack scene plays once, then the minigames start over their own
        // looping video. A missing file ends the scene immediately (source null),
        // so the duel still begins.
        const activeDuel = duel;
        playLoop(el('altar-video'), buildAttackSceneCandidates(choice, phase), {
            loop: false,
            withSound: true,
            onFinished: () => beginMinigames(activeDuel)
        });
    }

    function beginMinigames(activeDuel) {
        if (!isDuelAlive(activeDuel) || activeDuel.minigamesStarted) return;
        activeDuel.minigamesStarted = true;

        const video = el('altar-video');
        clearVideoHandlers(video);
        // Silent loop: the struggle music (#struggle-audio) is the only sound here.
        playLoop(video, buildStruggleLoopCandidates(activeDuel.choice, activeDuel.phase, activeDuel.attackNumber), { loop: true });

        showDuelScreen(true);
        bindInputs(true);
        playStruggleAudio(true);
        startStage(activeDuel, 0);
    }

    function winDuel(activeDuel) {
        if (!isDuelAlive(activeDuel)) return;
        const controller = activeDuel.controller;
        const choice = activeDuel.choice;
        showResolve(true);
        stopDuelSystems(activeDuel);

        window.completeAltarAttack(controller.gameState, choice);
        if (typeof updateCounters === 'function') updateCounters(controller);
        playWinScene(controller, choice, activeDuel.attackNumber);
    }

    // -------------------------------------------------------------------------
    // Win scene: loop until "Cum Inside" / "Cum Outside", play that cum scene
    // once, then the next phase.
    // -------------------------------------------------------------------------
    function getCumChoiceButtons() {
        let row = el('altar-duel-cum-choices');
        if (!row) {
            const altarScreen = el('altar-screen');
            if (!altarScreen) return null;
            row = document.createElement('div');
            row.id = 'altar-duel-cum-choices';
            row.className = 'altar-duel-cum-choices hidden';
            [['CI', 'altar.duel_cum_inside'], ['CO', 'altar.duel_cum_outside']].forEach(([suffix, key]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'altar-continue-button altar-duel-cum-button';
                button.dataset.cumSuffix = suffix;
                button.setAttribute('data-i18n', key);
                button.textContent = window.t(key);
                row.appendChild(button);
            });
            altarScreen.appendChild(row);
        }
        return row;
    }

    function hideCumChoiceButtons() {
        const row = el('altar-duel-cum-choices');
        if (!row) return;
        row.classList.add('hidden');
        row.querySelectorAll('button').forEach((button) => { button.onclick = null; });
    }

    // Her moans over the win loop. The loops are only 1-3 s long, so a moan baked
    // into the video would repeat identically every loop; instead a random one
    // from her own clean voice set plays every few seconds, never the same one
    // twice in a row. Files: assets/sounds/attack_moans/{nun|demon}_NN.mp3,
    // exported by tools/build_attack_scenes.py.
    const WIN_MOANS = {
        'attack-nun': { name: 'nun', count: 50 },
        'attack-demon': { name: 'demon', count: 13 }
    };
    const WIN_MOAN_GAP_MS = [2200, 3600];
    // No moans over the handjob (attack 1) and blowjob (attack 2) win scenes.
    const SILENT_WIN_ATTACKS = [1, 2];
    let winMoans = null;

    function getSfxVolume() {
        const volume = Number(window.gameSettings && window.gameSettings.audio && window.gameSettings.audio.sfxVolume);
        return Number.isFinite(volume) && volume >= 0 ? Math.min(1, volume) : 0.55;
    }

    function startWinMoans(controller, choice) {
        stopWinMoans();
        const set = WIN_MOANS[choice];
        if (!set) return;
        const state = { timer: null, audio: null, last: 0 };
        const schedule = (delayMs) => {
            state.timer = window.setTimeout(() => {
                if (winMoans !== state || controller !== window.uiController) return;
                if (!isPaused(controller)) {
                    let index;
                    do {
                        index = Math.floor(Math.random() * set.count) + 1;
                    } while (index === state.last && set.count > 1);
                    state.last = index;
                    state.audio = new Audio(`assets/sounds/attack_moans/${set.name}_${String(index).padStart(2, '0')}.mp3`);
                    state.audio.volume = getSfxVolume();
                    const promise = state.audio.play();
                    if (promise && typeof promise.catch === 'function') promise.catch(() => {});
                }
                const [min, max] = WIN_MOAN_GAP_MS;
                schedule(min + Math.random() * (max - min));
            }, delayMs);
        };
        winMoans = state;
        schedule(600);
    }

    function stopWinMoans() {
        if (!winMoans) return;
        window.clearTimeout(winMoans.timer);
        if (winMoans.audio) winMoans.audio.pause();
        winMoans = null;
    }

    function playWinScene(controller, choice, attackNumber) {
        const video = el('altar-video');
        clearVideoHandlers(video);
        const row = getCumChoiceButtons();
        let picked = false;
        if (!SILENT_WIN_ATTACKS.includes(attackNumber)) startWinMoans(controller, choice);

        const pick = (suffix) => {
            if (picked || controller !== window.uiController) return;
            picked = true;
            // the cum scene carries its own moans
            stopWinMoans();
            hideCumChoiceButtons();
            playCumScene(controller, video, getRewardSceneSource(choice, attackNumber, suffix));
        };

        // A missing win scene skips straight to the buttons over the altar video.
        const fallback = typeof ALTAR_VIDEO_SOURCES === 'object' ? ALTAR_VIDEO_SOURCES[choice] : null;
        playLoop(video, [getRewardSceneSource(choice, attackNumber)].concat(fallback || []), {
            loop: true,
            withSound: true,
            onPlaying: () => {
                if (!row || picked || controller !== window.uiController) return;
                row.querySelectorAll('button').forEach((button) => {
                    button.onclick = () => pick(button.dataset.cumSuffix);
                });
                row.classList.remove('hidden');
            }
        });
    }

    function playCumScene(controller, video, source) {
        let done = false;
        const next = () => {
            if (done || controller !== window.uiController) return;
            done = true;
            clearVideoHandlers(video);
            if (typeof continueAfterAltarScene === 'function') {
                continueAfterAltarScene(controller);
            }
        };
        // Plays once; ends (or a missing file) -> next phase.
        clearVideoHandlers(video);
        playLoop(video, [source], { loop: false, withSound: true, onFinished: next });
    }

    function loseDuel(activeDuel) {
        if (!isDuelAlive(activeDuel)) return;
        const controller = activeDuel.controller;
        const choice = activeDuel.choice;
        showResolve(false);
        stopDuelSystems(activeDuel);
        controller.gameState.gameOver = true;
        // a lost duel is a lost struggle in the run's end-of-run stats
        if (typeof window.bumpTheNunRunStat === 'function') {
            window.bumpTheNunRunStat(controller.gameState, 'lost');
        }

        const phase = getPhase(controller);
        const video = el('altar-video');
        clearVideoHandlers(video);

        if (choice === 'attack-demon') {
            const variation = typeof pickAttackVariationIndex === 'function' ? pickAttackVariationIndex('demonDefeat', 1) : 1;
            const candidates = typeof buildDemonDefeatVideoCandidates === 'function'
                ? buildDemonDefeatVideoCandidates(phase, variation)
                : [`assets/scenes/attacks/3AD${variation}.mp4`];
            playDefeatStage(controller, video, candidates, { loop: true, onContinue: () => finishGameOver(controller, video, choice) });
            return;
        }

        // Nun: caught intro (loops until Continue), then the drag scene, then title.
        const introVariation = typeof pickAttackVariationIndex === 'function' ? pickAttackVariationIndex('nunIntro', 3) : 1;
        const dragVariation = typeof pickAttackVariationIndex === 'function' ? pickAttackVariationIndex('nunDrag', 1) : 1;
        const introSource = typeof getNunCaughtIntroSceneSource === 'function' ? getNunCaughtIntroSceneSource(phase, introVariation) : 'assets/scenes/attacks/3AN1.mp4';
        const dragSource = typeof getNunCaughtSceneSource === 'function' ? getNunCaughtSceneSource(phase, dragVariation) : 'assets/scenes/attacks/3AG.mp4';

        playDefeatStage(controller, video, [introSource], {
            loop: true,
            onContinue: () => {
                playDefeatStage(controller, video, [dragSource], {
                    loop: false,
                    onEnded: () => finishGameOver(controller, video, choice),
                    onContinue: () => finishGameOver(controller, video, choice)
                });
            }
        });
    }

    function getDefeatContinueButton() {
        let button = el('altar-duel-continue');
        if (button) return button;
        const altarScreen = el('altar-screen');
        if (!altarScreen) return null;
        button = document.createElement('button');
        button.id = 'altar-duel-continue';
        button.type = 'button';
        button.className = 'altar-continue-button altar-duel-continue hidden';
        button.setAttribute('data-i18n', 'common.continue');
        button.textContent = window.t('common.continue');
        altarScreen.appendChild(button);
        return button;
    }

    function playDefeatStage(controller, video, candidates, options) {
        const button = getDefeatContinueButton();
        if (button) {
            button.classList.add('hidden');
            button.onclick = null;
        }
        window.stopAttackSlideLoopSfx?.(video);

        let finished = false;
        const done = (handler) => {
            if (finished || controller !== window.uiController) return;
            finished = true;
            if (button) {
                button.classList.add('hidden');
                button.onclick = null;
            }
            window.stopAttackSlideLoopSfx?.(video);
            if (typeof handler === 'function') handler();
        };

        playLoop(video, candidates, {
            loop: options.loop,
            onFinished: (source) => {
                // Missing file (source null) or a non-looping scene that ended.
                if (!source || !options.loop) done(options.onEnded || options.onContinue);
            },
            onPlaying: () => {
                if (options.loop) window.startAttackSlideLoopSfx?.(video);
                if (button) {
                    button.classList.remove('hidden');
                    button.onclick = () => done(options.onContinue);
                }
            }
        });
    }

    // A lost duel ends the vigil like being caught (scripts/runFlow.js): the run is
    // saved with every relic kept, then the end-of-run card offers "Continue this
    // vigil", the same as the Nun's catch in nunSystem.js.
    function finishGameOver(controller, video, duelChoice) {
        if (controller !== window.uiController) return;
        clearVideoHandlers(video);
        const button = el('altar-duel-continue');
        if (button) button.remove();
        const runSummary = typeof window.captureTheNunRunFailure === 'function'
            ? window.captureTheNunRunFailure(duelChoice === 'attack-demon' ? 'duel-demon' : 'caught')
            : null;
        if (typeof window.returnToTitleScreen === 'function') {
            Promise.resolve(window.returnToTitleScreen()).then(() => {
                if (runSummary && typeof window.showTheNunRunReckoning === 'function') {
                    window.showTheNunRunReckoning(runSummary);
                }
            });
        } else if (typeof fallbackToTitleScreen === 'function') {
            fallbackToTitleScreen(controller);
        }
    }

    // Called when the altar is torn down (next phase, title screen, session stop).
    function cancelDuel() {
        if (duel) stopDuelSystems(duel);
        stopWinMoans();
        hideCumChoiceButtons();
        const button = el('altar-duel-continue');
        if (button) {
            button.classList.add('hidden');
            button.onclick = null;
        }
    }

    window.startAltarDuel = startAltarDuel;
    window.cancelAltarDuel = cancelDuel;
    window.isAltarDuelActive = () => Boolean(duel && !duel.finished);
})();
