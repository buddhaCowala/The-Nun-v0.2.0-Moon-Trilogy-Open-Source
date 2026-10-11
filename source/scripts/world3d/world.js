/**
 * The Nun 3D — the first-person world.
 *
 * Each vigil is a 3D environment (scripts/world3d/levels.js). The player walks it in
 * first person, lights candle stands (they burn down), takes relics (crosses / books),
 * survives the Demoness's ambushes and the Nun's hunt, and reaches the altar.
 *
 * Everything around the walk is the existing game: vigils, devotion and rites
 * (scripts/gameState.js), the altar screen and reward videos (scripts/uiController.js),
 * the catch videos (scripts/nunSystem.js), the demon catch + struggle mini-games
 * (scripts/demonAttacks.js), checkpoints / meters (scripts/runFlow.js),
 * saves, Steam and translations.
 *
 * Public API: window.theNun3D (see the bottom of this file).
 */
(function () {
    'use strict';

    const NW = window.NunWorld || {};

    const CONFIG = {
        // The player's body (parkour.js): heights in metres above the feet.
        eyeHeight: 1.62,
        crouchEyeHeight: 1.0,
        bodyHeight: 1.75,
        crouchBodyHeight: 1.15,
        radius: 0.35,
        walkSpeed: 3.0,
        sprintSpeed: 5.2,
        crouchSpeed: 1.6,
        // Ctrl (or C): a tap toggles the crouch; held this many seconds it lies down
        // (crouched at once on the press, prone when the hold passes it); lying down, a
        // tap gets up (parkour.js ctrlStance). Prone: eyes and body this low, crawling
        // this fast; no running, jumping or climbing (Space gets up to a crouch).
        proneHoldTime: 0.35,
        proneEyeHeight: 0.3,
        proneBodyHeight: 0.45,
        proneSpeed: 0.85,
        // Quake / Source movement (parkour.js "the feet"). Ground: friction per second (of at
        // least stopSpeed m/s), then speed toward the keys at groundAccel × the wish speed
        // per second (the old walk/run feel: stops in 0.29 m from a sprint, 0.16 m walking).
        // Air: along the keys only up to airWishCap m/s (Quake's 30 units/s), at airAccel ×
        // the wish speed per second, so W alone keeps a flight as it is and a strafe key
        // turned with the mouse gains speed; a jump the frame the feet land skips the
        // friction (bunny hop). Below the wish speed the air still carries toward it at
        // airControl (a standing jump goes forward); what strafing gains fades from
        // airSoftSpeed to none at airMaxSpeed (soft ceiling; sprint 5.2, Rush 6.5, slide 7).
        groundAccel: 16,
        groundFriction: 14,
        stopSpeed: 0.5,
        airAccel: 10,
        airWishCap: 0.76,
        airControl: 1,
        airSoftSpeed: 7.5,
        airMaxSpeed: 10,
        stepHeight: 0.35,
        jumpSpeed: 5.0,
        gravity: 22,
        mantleHeight: 1.1,
        slideSpeed: 7.0,
        slideTime: 0.7,
        jumpCost: 7,
        mantleCost: 10,
        vaultCost: 8,
        slideCost: 12,
        staminaDrain: 13,
        staminaRegen: 26,
        staminaRegenDelay: 0.5,
        // The Rush (parkour.js): every vault and climb, and a jump out of a slide once it
        // lands, gives this many seconds of faster running (sprint × 1 + rushBoost) that
        // spends no Breath, and makes the next jump, climb or vault free. The view widens
        // by rushFov degrees while it lasts. It is worth chaining now: 8.8 m/s against a
        // 5.2 m/s sprint (it was 6.5), the move itself no longer eats the clock, and the
        // next vault or climb sets it back to full, so a line over five obstacles holds
        // ONE unbroken Rush and crosses 30 m 15 % faster than the old knobs did. Measured
        // ceiling: past ~0.9 (9.9 m/s) the burst overshoots the turn into the next thing
        // and a headless bot starts running itself into Jane's wall in vigil 6.
        rushTime: 1.6,
        rushBoost: 0.7,
        rushFov: 6,
        mouseSensitivity: 0.0022,
        mouseSpikeLimit: 250,   // px in ONE mouse event (~31°): larger is a glitch, dropped
        // Jane's aura (aura.js): a wall across the whole nave this far behind her (she is
        // always in front of it; her trailing heel reaches 0.38 m back); held against it,
        // or within nunCatchDistance of her, this long, the player is taken. It glows up
        // within wallDread metres.
        wallTrail: 0.7,
        wallGrasp: 0.5,
        wallDread: 6,
        // The player's night vision (world.nightVision): a faint warm light that travels
        // with the eyes and never changes, so the floor shows a few metres ahead and
        // little else; the candles light the rest. (It used to shrink from 6 m to 3 m over
        // time; these are its values two-thirds of the way up that range.)
        nightVisionRange: 5,
        nightVisionIntensity: 0.32,
        candleHoldSeconds: 1.1,
        // A lit candle's range: the pool the Nun is slowed in, the Demoness never spawns
        // on the player in, and the player banishes her in (demonBanishSeconds).
        candlePoolRadius: 4.5,
        // A lit stand burns down over this many seconds (vigil 1..6): its pool, light and
        // flames shrink (radius x sqrt of what is left, so the lit area falls evenly), it
        // sputters at the end, then goes out; holding E on it lights it again, fresh.
        // The curve really steepens: a stand lasts about half of vigil 1 (46 of 88 s)
        // and only a third of vigil 6 (9 of 27 s), so the light you bought early is a
        // standing decision late — light it again, or take the dark and keep running.
        candleBurnByPhase: [46, 34, 26, 19, 13, 9],
        // She troubles the flames. A LIT stand within janeFlickerRange metres of the real
        // nun dips and wavers on its own irregular beat, deepest at her feet, and eases
        // back over janeFlickerEase once she has walked past, so you can read where she is
        // from the light alone. Visual only (janeDip): flame scale, halo and that stand's
        // pool-light intensity, multiplied on top of the burn-down and the corridor's
        // gutter. The gameplay pool (candleReach) never flickers.
        janeFlickerRange: 6,
        janeFlickerDepth: 0.6,     // deepest dip, at her feet (0..1 of the flame)
        janeFlickerSpeed: 7.5,     // rad/s base beat of the waver
        janeFlickerEase: 2.2,      // 1/s: how fast a stand settles once she has passed
        // A relic is taken (and glows) from close by (metres across the floor) and looked
        // at, lit candle or not.
        relicPickRange: 1.6,
        relicAimAngle: 0.3,
        // Loot you can see. A relic's prewarmed glow sprite also fades in by distance, so
        // the vigil is routing instead of groping: nothing beyond relicSightRange metres,
        // fading in over the last relicSightFade of that to a steady relicSightOpacity
        // (roughly half the glow it wears as the crosshair target) from relicSightFull in.
        // Keep it faint: the tone mapping's toe eats anything under ~0.25 anyway, the
        // sprite shrinks with distance on its own, and the cathedral must stay dark enough
        // that the candles matter.
        relicSightRange: 9,
        relicSightFade: 2,
        relicSightOpacity: 0.28,
        // ...but not from below: a relic resting more than this above the feet is out of
        // reach until the player climbs up to it. The reliquaries cathedral.js sets on the
        // tops of the tall props (1 m and up) are worth reliquaryValue relics each.
        relicReachUp: 0.9,
        reliquaryValue: 4,
        // Hiding spots (cathedral.js HIDEOUTS_BY_VIGIL): a low table with a relic lying
        // under it. The room under its top (hideoutGap) is lower than the crouched body
        // and higher than the prone one, so only lying down reaches under; the relic is
        // taken lying down within hiddenRelicRange metres (across the floor) and is worth
        // hiddenRelicValue — the best single pickup in the nave, because lying down under
        // a table in a room that is closing behind you is the most expensive thing the
        // player can choose to do. hideoutMargin: how far round the top the low ceiling reaches,
        // so a standing body stops short of the table's edge instead of into it.
        hideoutGap: 0.58,
        hideoutMargin: 0.3,
        hiddenRelicRange: 0.75,
        hiddenRelicValue: 4,
        interactRange: 2.8,
        // The vigil's intro video ends with Jane stepping out of her portal, so play opens
        // with her already out, walking to the altar so that she gets there when the
        // vigil's approach time is up (gameState.js nunApproachSecondsByPhase, 88 s in
        // vigil 1 down to 27 s). The player starts this many metres ahead of her.
        nunHeadStart: 8,
        // She walks without a stop; her clip plays at speed / nunWalkNatural (slow-motion
        // in the early vigils), so her feet keep to the floor.
        nunWalkNatural: 0.88,  // m/s her walk clip covers at normal speed (measured)
        nunPaceEase: 2,        // 1/s: how fast her speed settles after a candle pool's edge
        nunCatchDistance: 0.9,
        // A lit pool costs her real seconds (0.55 = she loses nearly half her pace while
        // she is crossing one), so the 1.1 s candle hold has a second, offensive reason:
        // light the stand on her line and buy yourself the time to go back for one more.
        nunLightSlow: 0.55,
        nunMeterRange: 24,
        // Her footsteps (world3d/nunSteps.js) land on her OWN footfalls: the walk clip's
        // two measured plants per cycle, and the clip's rate is her ground speed, so the
        // vigil's pace and a candle pool's crawl both come through by themselves.
        // Heard only within nunStepsRange metres of her (Shaun: they carried too far —
        // about two bays of the 40 m nave), silent at that edge and rising smoothly to
        // full from nunStepsFullRange inward.
        nunStepsRange: 9,
        nunStepsFullRange: 1.5,
        nunStepsVolume: 0.75,   // the loudest a step ever is, times the sfx slider
        nunStepPhase: 0,        // nudge every footfall this fraction of a cycle later
        nunStepMinGap: 0.12,    // s: two hits never stack on one frame
        nunStepPitch: 0.18,     // how much her pace pitches the clip (0 = never)
        nunStepStride: 0.53,    // m between footfalls for the old sprite Nun (no clip:
        //                         her real gait is nunWalkNatural x 1.2 s / 2 footfalls)
        // Every vigil she comes sooner and more often, and runs faster (seconds between
        // her visits, m/s); the run's very first visit is the gentler one.
        demonFirstDelay: 18,
        demonIntervalByPhase: [[18, 24], [15, 21], [13, 18], [11, 15], [9, 13], [8, 11]],
        demonSpeedByPhase: [3.2, 3.6, 4.0, 4.4, 4.8, 5.2],
        demonFirstSpeed: 3.0,
        demonTelegraph: 1.1,
        demonFirstTelegraph: 2.0,
        demonCatchDistance: 1.0,
        // She never spawns while the player is in a lit candle's range; once she is out,
        // this many unbroken seconds in candlelight banish her (stepping out starts over).
        demonBanishSeconds: 1,
        // How far from the player the stand that glints while she is out may stand
        // (lightTheWay): far enough to be worth running to, close enough to reach.
        demonEmberRange: 14,
        // How high over that stand's foot the "LIGHT IT" label floats (syncEmberMarker):
        // the tallest candle's flame sits at about 1.7 m, so this clears it.
        emberMarkerHeight: 2.05,
        altarReach: 2.4,
        // ------------------------------------------------ the player, out of breath
        // His own breathing (assets/sounds/breathing1|2.mp3, alternating) comes up as the
        // Breath meter empties: nothing above breathStartAt %, breathQuietVolume there,
        // breathVolume at 0 %, and the gap between two clips closes from breathGapEasy to
        // breathGapFull seconds so he pants faster the more he has spent. Jane's wall (or
        // her reach) within breathWallRange metres adds up to breathWallBoost of that on
        // top — the same air, worse. Kept under her own steps and the demon sting: 0.30 ×
        // sfx at the very worst, against 0.9 for her laugh. breathFade is how fast the
        // loudness eases (1/s), so it never starts or stops on an edge.
        breathStartAt: 45,
        breathQuietVolume: 0.10,
        breathVolume: 0.30,
        breathGapEasy: 1.6,
        breathGapFull: 0.35,
        breathWallRange: 8,
        breathWallBoost: 0.5,
        breathFade: 2.2,
        // ------------------------------------------------------------ the heartbeat
        // Synthesized (no file ships for it): two low sine thumps a beat through the same
        // sfx setting, scaled by the gap to whichever of Jane or her wall would take him
        // first (the same number the HUD bar reads). Nothing beyond heartRange metres;
        // loudest and fastest at heartNearRange in. Felt more than heard: heartVolume is
        // the raw gain of the first thump at its worst, below a footstep's 0.20.
        heartRange: 5,   // Shaun: starts at 5 m (14, then 7, were too far)
        heartNearRange: 2.5,
        heartVolume: 0.22,
        heartBpmFar: 52,
        heartBpmNear: 132,
        heartFreq: 54,       // Hz of the thump (it drops to this from 1.7x over its head)
        heartFade: 1.6,      // 1/s: the beat eases in and out
        // Both of them ease to nothing this fast (1/s) the moment control is lost
        // (a scene, the altar, a menu, a tutorial panel), then stop.
        audioHushFade: 8
    };

    const world = {
        enabled: false,
        renderer: null,
        scene: null,
        camera: null,
        canvas: null,
        container: null,
        levelGroup: null,
        parsed: null,
        phase: 0,
        preparedPhase: 0,
        theme: null,
        player: null,
        keys: { forward: false, back: false, left: false, right: false, sprint: false, interact: false, jump: false, crouch: false },
        jumpPressed: false,
        crouchPressed: false,
        mouseDown: false,
        nightVision: null,
        poolLights: [],
        altarLight: null,
        relics: [],
        // The spots this vigil has already given up, as a lookup, or null (buildLevel
        // reads gameState.takenSpots once, before the door and the corridor are built).
        takenSpots: null,
        candles: [],
        altar: null,
        nun: null,
        demon: null,
        playerField: null,
        altarField: null,
        altarFieldGrid: null,   // the grid altarField was walked on (the side door re-reads it)
        fieldTimer: 0,
        fieldCell: '',
        running: false,
        rafId: 0,
        lastTime: 0,
        locked: false,
        intentionalUnlock: false,
        hudTimer: 0,
        target: null,
        // The tutorial (scripts/tutorial.js, through theNun3D.tutorial): `script` holds
        // its overrides for a sandbox vigil (null in a real one), `frozen` stops the
        // simulation while one of its panels explains something.
        script: null,
        frozen: false,
        beacon: null,
        level: null,
        torchSpots: [],
        startDistance: 1,
        zoneReached: 1,
        altarTriggered: false,
        caughtTriggered: false
    };

    // ------------------------------------------------------------------ helpers

    function THREE() {
        return window.THREE;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function t(key, vars) {
        return typeof window.t === 'function' ? window.t(key, vars) : key;
    }

    function phaseIndex(phase) {
        return Math.max(0, Math.min(5, (Number(phase) || 1) - 1));
    }

    function state() {
        return window.gameState || null;
    }

    // ------------------------------------------------------- a retried vigil keeps what
    // A catch keeps every cross and book (Shaun's rule) and replays the same vigil. The
    // layout is seeded per vigil (cathedral.js makeRandom, corridor.js), so the rebuild
    // is the same cathedral to the centimetre and the spots already emptied can stay
    // empty: the run remembers them in gameState.takenSpots, and reaching the altar
    // (advanceGameRound) stocks the next vigil in full. The tutorial's sandbox writes
    // nothing, here as everywhere else.
    function isTutorial() {
        return Boolean(window.isTheNunTutorialActive && window.isTheNunTutorialActive());
    }

    // A relic's spot, stable across rebuilds of the same vigil: its kind and its resting
    // place to the centimetre. The key has no relic, so it uses the fixed id 'key'.
    const KEY_SPOT = 'key';
    function spotId(relic) {
        const cm = (value) => Math.round((Number(value) || 0) * 100);
        return `${relic.kind === 'book' ? 'b' : 'c'}${cm(relic.x)}.${cm(relic.z)}.${cm(relic.y)}`;
    }

    function readTakenSpots() {
        const gs = state();
        const list = gs && Array.isArray(gs.takenSpots) ? gs.takenSpots : null;
        if (!list || !list.length || isTutorial()) return null;
        const set = Object.create(null);
        list.forEach((id) => { if (typeof id === 'string' && id) set[id] = true; });
        return set;
    }

    // Once every relic of the level exists (the nave's, then the corridor's): give each
    // its spot id and hide the ones this vigil already gave up.
    function applyTakenSpots() {
        const taken = world.takenSpots;
        world.relics.forEach((relic) => {
            relic.spot = spotId(relic);
            if (relic.taken || !taken || !taken[relic.spot]) return;
            relic.taken = true;
            relic.mesh.visible = false;
        });
    }

    function markSpotTaken(id) {
        if (isTutorial() || typeof window.markTheNunSpotTaken !== 'function') return;
        window.markTheNunSpotTaken(state(), id);
    }

    // How long Jane takes from the start of a vigil to its altar (gameState.js
    // nunApproachSecondsByPhase, the balance table the 2D game already used).
    function approachSeconds(phase) {
        const balance = window.theNunBalanceConfig;
        const table = balance && balance.runDifficulty && balance.runDifficulty.nunApproachSecondsByPhase;
        return table ? table[Math.min(table.length - 1, phaseIndex(phase))] : 120;
    }

    function isShown(id) {
        const element = byId(id);
        return Boolean(element) && element.style.display !== 'none' && !element.classList.contains('hidden');
    }

    function randomBetween(min, max) {
        return min + (Math.random() * (max - min));
    }

    function makeRandom(seed) {
        let value = (seed >>> 0) || 1;
        return function next() {
            value = (value + 0x6D2B79F5) >>> 0;
            let x = value;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    function supportsWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return Boolean(window.THREE && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
        } catch (error) {
            return false;
        }
    }

    // Every sound the 3D world makes goes through here, so the sfx volume setting is
    // always obeyed. `rate` (optional) pitches the clip: the relics use it to sound
    // like what they are without a second file.
    // The sfx slider, 0..1 (1 when nothing has been saved yet). Everything the world
    // makes — clips through playSfx, the breathing's per-frame volume and the
    // heartbeat's synthesized gain — is scaled by this one number.
    function sfxSetting() {
        const sfx = Number(window.gameSettings?.audio?.sfxVolume);
        return Number.isFinite(sfx) ? Math.max(0, Math.min(1, sfx)) : 1;
    }

    function playSfx(id, volumeScale, rate) {
        const audio = byId(id);
        if (!audio) {
            return null;
        }
        audio.volume = Math.max(0, Math.min(1, sfxSetting() * (volumeScale || 1)));
        try {
            audio.playbackRate = Number.isFinite(rate) && rate > 0 ? Math.max(0.5, Math.min(2, rate)) : 1;
        } catch (error) {
            /* a browser that will not pitch it still plays it */
        }
        try {
            audio.currentTime = 0;
        } catch (error) {
            /* ignore */
        }
        const promise = audio.play();
        if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
        }
        return audio;
    }

    // Can the player act right now? (Not paused, not at the altar, not in a scene.)
    function canControl() {
        const gs = state();
        return Boolean(
            world.enabled
            && gs
            && typeof window.isGameplayViewVisible === 'function'
            && window.isGameplayViewVisible()
            && !gs.isTimePaused
            && !gs.isAtAltar
            && !gs.gameOver
            && !gs.activeDemonAttack
            && !(window.nunSystem && window.nunSystem.isPlayingNunCaughtScene)
            && !isShown('phase-intro-overlay')
            && !isShown('altar-screen')
            && world.parsed
            && world.phase > 0
            && !world.frozen
        );
    }

    // ------------------------------------------------------------ the feet, out loud
    //
    // parkour.js tells us what the body did (land / slide / mantle / vault); the ground
    // travel comes back out of Parkour.update. Everything here is deliberately quiet:
    // it has to sit *under* Jane's steps (nunwalks) and the demon sting, so the loudest
    // thing a footstep ever reaches is 0.20 of the sfx volume, against 0.9 for her laugh.
    // Nothing plays while !canControl() (paused, altar, a scene, an intro overlay).
    const STEP_DISTANCE = 1.9;     // metres of ground travel between footsteps (Shaun: 1.2 was too fast-paced)
    const STEP_IDS = ['step-audio-1', 'step-audio-2', 'step-audio-3', 'step-audio-4'];
    const SLIDE_IDS = ['slide-audio-1', 'slide-audio-2', 'slide-audio-3', 'slide-audio-4', 'slide-audio-5'];
    const GRUNT_GAP = 0.8;         // seconds between two effort grunts
    const GRUNT_LENGTH = 0.9;      // huh.mp3 is longer than a grunt: cut it off
    const feet = { distance: 0, step: 0, clock: 0, gruntAt: -99, listening: false, gruntTimer: 0 };

    function feetListen() {
        if (feet.listening || !NW.Parkour || typeof NW.Parkour.listen !== 'function') return;
        NW.Parkour.listen(onFeetEvent);
        feet.listening = true;
    }

    function playSlideClip(volume) {
        playSfx(SLIDE_IDS[Math.floor(Math.random() * SLIDE_IDS.length)], volume);
    }

    function onFeetEvent(what, amount) {
        if (!canControl()) return;
        if (what === 'slide') {
            feet.distance = 0;
            playSlideClip(0.3);
            return;
        }
        if (what === 'land') {
            // impact is the fall's speed; 1.5 m of drop under CONFIG.gravity
            const heavy = Math.sqrt(2 * CONFIG.gravity * 1.5);
            if (amount > heavy) playSlideClip(Math.min(0.26, 0.16 + ((amount - heavy) * 0.02)));
            feet.distance = 0;
            return;
        }
        if (what === 'mantle' || what === 'vault') {
            // Shaun: no sound when jumping up onto something. The grunt stays wired, off.
            if (!CONFIG.climbGrunt) return;
            if (feet.clock - feet.gruntAt < GRUNT_GAP) return;
            feet.gruntAt = feet.clock;
            const grunt = playSfx('grunt-audio', 0.35, what === 'vault' ? 1.1 : 0.96);
            if (grunt) {
                window.clearTimeout(feet.gruntTimer);
                feet.gruntTimer = window.setTimeout(() => {
                    try {
                        grunt.pause();
                        grunt.currentTime = 0;
                    } catch (error) {
                        /* ignore */
                    }
                }, GRUNT_LENGTH * 1000);
            }
        }
    }

    // One footstep per STEP_DISTANCE of ground covered, round-robin over four elements
    // (one <audio> cannot overlap itself, and a sprint outruns a single clip). Silent in
    // the air, in a slide, crouched and prone — sneaking stays silent, which is the point.
    function feetStep(travelled, dt) {
        const p = world.player;
        feet.clock += dt || 0;
        if (!p || !canControl() || !p.grounded || (p.climb && p.climb.active)
            || p.crouched || p.prone || p.slide > 0) {
            feet.distance = 0;
            return;
        }
        const speed = Math.hypot(p.vx, p.vz);
        if (speed < 0.6) {
            feet.distance = 0;
            return;
        }
        feet.distance += travelled || 0;
        if (feet.distance < STEP_DISTANCE) return;
        feet.distance = 0;
        const loudness = 0.2 * Math.max(0.35, Math.min(1, speed / CONFIG.sprintSpeed));
        playSfx(STEP_IDS[feet.step % STEP_IDS.length], loudness, 0.96 + (Math.random() * 0.08));
        feet.step += 1;
    }

    // ------------------------------------------- out of breath, and the heart under it
    //
    // Two continuous sounds, both driven from update() and both silent the moment
    // canControl() goes false (hushAudio eases them off in a tenth of a second and
    // stops them, so a scene or a menu never opens over a pant or a thump).
    //
    //  - The breathing is the existing breathing1/2 clips, alternating over two <audio>
    //    elements with a gap that closes as the Breath meter empties; its volume is
    //    written every frame from an eased level, so it fades in and out instead of
    //    snapping on. Jane's wall at his back makes it worse (CONFIG.breathWall*).
    //  - The heartbeat has no file in the game, so it is synthesized: per beat two sine
    //    thumps (lub, then a quieter, lower dub) through one AudioContext, gain =
    //    CONFIG.heartVolume x the eased level x the sfx setting. Both its loudness and
    //    its tempo ride the gap to Jane (or her wall), so "she is behind you" is felt in
    //    the chest before it is heard. Deliberately under the feet (0.20) and far under
    //    her laugh (0.9), and it never touches an <audio> element, so it cannot steal a
    //    footstep's or the demon sting's channel.

    const BREATH_IDS = ['world-breath-1', 'world-breath-2'];
    const BREATH_CLIP_FALLBACK = 2.4;   // seconds, if the clip's duration is not known yet
    const breath = { level: 0, wait: 0, which: 0, playing: null, starts: 0 };
    const heart = { ctx: null, level: 0, phase: 0, bpm: 0, beats: 0, failed: false };

    // 0 while there is Breath to spare, 1 when it is fully spent.
    function breathSpent() {
        const p = world.player;
        if (!p || !Number.isFinite(p.stamina)) return 0;
        const start = CONFIG.breathStartAt;
        if (start <= 0) return 0;
        return Math.max(0, Math.min(1, (start - p.stamina) / start));
    }

    // How close whatever would take him first is, in metres (Jane's reach or her wall —
    // the same gap the HUD bar measures), or Infinity before she is walking.
    function dangerGap() {
        const nun = world.nun;
        if (!nun || !Number.isFinite(nun.gap)) return Infinity;
        return Math.max(0, nun.gap);
    }

    function applyBreathVolume() {
        const el = breath.playing;
        if (!el) return;
        el.volume = Math.max(0, Math.min(1, sfxSetting() * breath.level));
    }

    function stopBreath() {
        const el = breath.playing;
        breath.playing = null;
        breath.wait = 0;
        if (!el) return;
        try {
            el.pause();
            el.currentTime = 0;
        } catch (error) {
            /* ignore */
        }
    }

    function updateBreath(dt) {
        const spent = breathSpent();
        let target = 0;
        if (spent > 0) {
            target = CONFIG.breathQuietVolume
                + ((CONFIG.breathVolume - CONFIG.breathQuietVolume) * spent);
            const gap = dangerGap();
            const near = Number.isFinite(gap)
                ? Math.max(0, Math.min(1, 1 - (gap / CONFIG.breathWallRange)))
                : 0;
            target *= 1 + (CONFIG.breathWallBoost * near);
        }
        breath.level += (target - breath.level) * (1 - Math.exp(-CONFIG.breathFade * dt));
        if (target <= 0 && breath.level < 0.004) {
            breath.level = 0;
            stopBreath();
            return;
        }
        breath.wait -= dt;
        if (breath.playing && breath.wait > 0) {
            applyBreathVolume();
            return;
        }
        if (target <= 0 || breath.wait > 0) return;
        const el = byId(BREATH_IDS[breath.which % BREATH_IDS.length]);
        breath.which += 1;
        if (!el) return;
        const previous = breath.playing;
        if (previous && previous !== el) {
            try {
                previous.pause();
                previous.currentTime = 0;
            } catch (error) {
                /* ignore */
            }
        }
        try {
            el.currentTime = 0;
        } catch (error) {
            /* ignore */
        }
        breath.playing = el;
        applyBreathVolume();
        const promise = el.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
        breath.starts += 1;
        const length = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : BREATH_CLIP_FALLBACK;
        const gapSeconds = CONFIG.breathGapEasy
            + ((CONFIG.breathGapFull - CONFIG.breathGapEasy) * spent);
        breath.wait = length + gapSeconds;
    }

    function heartContext() {
        if (heart.ctx || heart.failed) return heart.ctx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
            heart.failed = true;
            return null;
        }
        try {
            heart.ctx = new Ctx();
        } catch (error) {
            heart.failed = true;
            return null;
        }
        return heart.ctx;
    }

    // One thump: a sine that falls to CONFIG.heartFreq with a fast attack and a short
    // body. Nothing is kept — the nodes stop themselves and are collected.
    function heartThump(ctx, at, gain, freq, length) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 1.7, at);
        osc.frequency.exponentialRampToValueAtTime(freq, at + (length * 0.55));
        env.gain.setValueAtTime(0.0001, at);
        env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.014);
        env.gain.exponentialRampToValueAtTime(0.0001, at + length);
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + length + 0.02);
    }

    function heartBeat(level) {
        const ctx = heartContext();
        if (!ctx) return;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            try { ctx.resume(); } catch (error) { /* it will play when it can */ }
        }
        const gain = CONFIG.heartVolume * level * sfxSetting();
        if (gain <= 0.0005) return;
        const now = ctx.currentTime + 0.01;
        heartThump(ctx, now, gain, CONFIG.heartFreq, 0.16);                    // lub
        heartThump(ctx, now + 0.17, gain * 0.62, CONFIG.heartFreq * 0.86, 0.2); // dub
        heart.beats += 1;
    }

    function updateHeart(dt) {
        const gap = dangerGap();
        const span = Math.max(0.01, CONFIG.heartRange - CONFIG.heartNearRange);
        const closeness = Number.isFinite(gap)
            ? Math.max(0, Math.min(1, (CONFIG.heartRange - gap) / span))
            : 0;
        heart.level += (closeness - heart.level) * (1 - Math.exp(-CONFIG.heartFade * dt));
        heart.bpm = CONFIG.heartBpmFar + ((CONFIG.heartBpmNear - CONFIG.heartBpmFar) * heart.level);
        if (heart.level < 0.01) {
            heart.level = closeness <= 0 ? 0 : heart.level;
            heart.phase = 0;
            return;
        }
        heart.phase += dt * (heart.bpm / 60);
        while (heart.phase >= 1) {
            heart.phase -= 1;
            heartBeat(heart.level);
        }
    }

    // No control this frame: both ease to nothing fast, then stop. Called every frame
    // while a scene, the altar, a menu or a tutorial panel holds the world.
    function hushAudio(dt) {
        const k = 1 - Math.exp(-CONFIG.audioHushFade * Math.max(0, dt || 0));
        breath.level += (0 - breath.level) * k;
        heart.level += (0 - heart.level) * k;
        heart.phase = 0;
        if (breath.level < 0.004) {
            breath.level = 0;
            stopBreath();
        } else {
            applyBreathVolume();
        }
        if (heart.level < 0.004) heart.level = 0;
    }

    // ------------------------------------------------------ tutorial beacon
    //
    // The tutorial's world marker (a gold shaft, a floor ring and a turning diamond over
    // what the player must reach). Built with the renderer, so prewarm() draws it with
    // every level; it holds no light and is shown or hidden, never added mid-vigil.
    function buildBeacon(THREEjs) {
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 128);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
        gradient.addColorStop(1, 'rgba(255,255,255,1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 4, 128);
        const fade = new THREEjs.CanvasTexture(canvas);
        const glow = (opacity) => new THREEjs.MeshBasicMaterial({
            color: 0xffc860,
            transparent: true,
            opacity,
            depthWrite: false,
            blending: THREEjs.AdditiveBlending,
            side: THREEjs.DoubleSide,
            fog: false
        });
        const group = new THREEjs.Group();
        const shaftMaterial = glow(0.55);
        shaftMaterial.map = fade;
        const shaft = new THREEjs.Mesh(new THREEjs.CylinderGeometry(0.32, 0.32, 5, 24, 1, true), shaftMaterial);
        shaft.position.y = 2.5;
        const ring = new THREEjs.Mesh(new THREEjs.RingGeometry(0.42, 0.56, 48), glow(0.9));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        const gem = new THREEjs.Mesh(new THREEjs.OctahedronGeometry(0.14), glow(0.95));
        group.add(shaft, ring, gem);
        group.visible = false;
        return { group, shaft, ring, gem, time: 0, target: null };
    }

    function updateBeacon(dt) {
        const beacon = world.beacon;
        if (!beacon || !beacon.target) return;
        beacon.time += dt;
        const pulse = (beacon.time * 1.4) % 1;
        beacon.ring.scale.setScalar(0.8 + (pulse * 1.1));
        beacon.ring.material.opacity = 0.95 * (1 - pulse);
        beacon.gem.rotation.y += dt * 2;
        beacon.gem.position.y = beacon.target.gemY + (Math.sin(beacon.time * 2.4) * 0.08);
        beacon.shaft.material.opacity = 0.42 + (Math.sin(beacon.time * 3) * 0.1);
    }

    function setBeacon(target) {
        const beacon = world.beacon;
        if (!beacon) return;
        if (!target) {
            beacon.target = null;
            beacon.group.visible = false;
            return;
        }
        const floor = target.floorY != null ? target.floorY : groundY(target.x, target.z);
        beacon.target = { x: target.x, z: target.z, gemY: (target.y != null ? target.y - floor : 0) + 0.9 };
        beacon.group.position.set(target.x, floor, target.z);
        beacon.group.visible = true;
        updateBeacon(0);
    }

    // ----------------------------------------------------------------- renderer

    // How far a fresh candle stand's pool light reaches (world.poolLights).
    const POOL_LIGHT_RANGE = 9;

    function ensureRenderer() {
        if (world.renderer) {
            return true;
        }

        const container = byId('world-3d');
        if (!container) {
            return false;
        }

        const THREEjs = THREE();
        const renderer = new THREEjs.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.outputEncoding = THREEjs.sRGBEncoding;
        renderer.toneMapping = THREEjs.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0x000000, 1);
        container.appendChild(renderer.domElement);
        renderer.domElement.className = 'world-3d-canvas';

        world.renderer = renderer;
        world.canvas = renderer.domElement;
        world.container = container;
        world.scene = new THREEjs.Scene();
        world.camera = new THREEjs.PerspectiveCamera(70, 1920 / 1080, 0.05, 140);
        world.camera.rotation.order = 'YXZ';
        world.scene.add(world.camera);

        // The player's night vision (there is no lantern): a faint light that travels with
        // the eyes, slightly low and to the right, always the same (CONFIG.nightVision*).
        world.nightVision = new THREEjs.PointLight(0xffc58a, CONFIG.nightVisionIntensity, CONFIG.nightVisionRange, 1.6);
        world.nightVision.position.set(0.25, -0.25, -0.2);
        world.camera.add(world.nightVision);

        // Lit candle stands are the cathedral's only real light: the nearest few each
        // throw a warm pool, which shrinks as the stand burns down (updateLights).
        for (let i = 0; i < 6; i += 1) {
            const light = new THREEjs.PointLight(0xffa24a, 0, POOL_LIGHT_RANGE, 1.7);
            world.poolLights.push(light);
            world.scene.add(light);
        }

        world.altarLight = new THREEjs.PointLight(0xffb060, 0.55, 8, 2);
        world.scene.add(world.altarLight);

        world.beacon = buildBeacon(THREEjs);
        world.scene.add(world.beacon.group);

        resizeRenderer();
        window.addEventListener('resize', resizeRenderer);
        bindInput();
        return true;
    }

    function resizeRenderer() {
        if (!world.renderer) {
            return;
        }
        // The canvas is drawn at its real size on screen (the 1920x1080 stage times the
        // stage scale and the screen's pixel density), capped at 1.25x.
        const stageScale = Number(getComputedStyle(document.documentElement).getPropertyValue('--app-stage-scale')) || 1;
        resolution.display = Math.max(0.5, Math.min(1.25, stageScale * (window.devicePixelRatio || 1)));
        applyResolution(true);
    }

    // ------------------------------------------------------------ render scale
    //
    // A machine that cannot hold the frame rate at full size draws fewer pixels: the
    // render scale steps down a notch when the median frame of two 1 s windows in a
    // row is slower than ~45 fps, and back up after a run of windows at 60 fps. A
    // step up that has to be taken back makes the next one wait twice as long, so it
    // never flickers between two sizes. Only frames that drew the world count, and a
    // single hitch cannot move it (medians). The fill cost is most of a frame here:
    // 0.72 draws half the pixels.
    const RES_STEPS = [1, 0.85, 0.72, 0.62, 0.55];
    const RES_SLOW_MS = 22;
    const RES_FAST_MS = 17.5;
    const resolution = {
        display: 1,
        step: 0,
        locked: false,            // tests: hold the current scale
        frames: new Float32Array(256),
        count: 0,
        elapsed: 0,
        busy: 0,
        slowWindows: 0,
        fastWindows: 0,
        fastNeeded: 5,
        settle: 0,
        sinceRaise: Infinity
    };

    function applyResolution(force) {
        const ratio = resolution.display * RES_STEPS[resolution.step];
        if (force || Math.abs(world.renderer.getPixelRatio() - ratio) > 0.001) {
            world.renderer.setPixelRatio(ratio);
            world.renderer.setSize(1920, 1080, false);
            world.needsDraw = true;
        }
    }

    // One drawn frame: `deltaMs` since the last one, `busyMs` of it spent in our own
    // update and draw calls.
    function trackFrame(deltaMs, busyMs) {
        const r = resolution;
        // a stall (a scene, a tab switch) says nothing about the steady cost
        if (r.locked || !(deltaMs > 0) || deltaMs > 250) return;
        if (r.count < r.frames.length) r.frames[r.count++] = deltaMs;
        r.busy += busyMs;
        r.elapsed += deltaMs;
        if (r.elapsed < 1000) return;

        const median = r.frames.subarray(0, r.count).sort()[r.count >> 1];
        const busy = r.busy / r.count;
        r.count = 0;
        r.busy = 0;
        r.elapsed = 0;
        r.sinceRaise += 1;
        if (r.settle > 0) {
            r.settle -= 1;
            return;
        }
        // Slow, and not because our own code filled the frame (fewer pixels would not help).
        if (median > RES_SLOW_MS && busy < median * 0.8) {
            r.fastWindows = 0;
            r.slowWindows += 1;
            if (r.slowWindows >= 2 && r.step < RES_STEPS.length - 1) {
                if (r.sinceRaise <= 6) r.fastNeeded = Math.min(120, r.fastNeeded * 2);
                r.step += 1;
                r.slowWindows = 0;
                r.settle = 2;
                applyResolution();
            }
            return;
        }
        r.slowWindows = 0;
        r.fastWindows = median <= RES_FAST_MS ? r.fastWindows + 1 : 0;
        if (r.fastWindows >= r.fastNeeded && r.step > 0) {
            r.step -= 1;
            r.fastWindows = 0;
            r.settle = 2;
            r.sinceRaise = 0;
            applyResolution();
        }
    }

    // ------------------------------------------------------------ first sight
    //
    // Whatever a vigil can show is drawn once while it is built, before its intro
    // plays, with everything visible and nothing culled: shaders are compiled, and
    // textures and geometry sent to the graphics card, then instead of the first time
    // they are seen. Met for the first time in play, they froze that frame (Lilith's
    // first appearance 0.9 s, Jane's 0.5 s, the vigil's first frame 1.1 s). The Demoness
    // also fades in and out, and a fading material (characters.js animate) is another
    // shader, so she is drawn once more fading. Nobody may see these frames (everything
    // shown, from wherever the camera last was: the previous vigil's view), so the
    // canvas is cleared after them; beginVigil draws the first real one.
    function prewarm() {
        const renderer = world.renderer;
        const shown = [];
        world.scene.traverse((object) => {
            if (object.isLight) return;   // a light's visibility changes every shader
            shown.push(object, object.visible, object.frustumCulled);
            object.visible = true;
            object.frustumCulled = false;
        });
        renderer.render(world.scene, world.camera);

        const character = world.demon && world.demon.mesh.userData.character;
        const fading = character ? character.materials.filter((material) => !material.transparent) : [];
        if (fading.length) {
            fading.forEach((material) => {
                material.transparent = true;
                material.needsUpdate = true;
            });
            renderer.render(world.scene, world.camera);
            fading.forEach((material) => {
                material.transparent = false;
                material.needsUpdate = true;
            });
        }

        for (let i = 0; i < shown.length; i += 3) {
            shown[i].visible = shown[i + 1];
            shown[i].frustumCulled = shown[i + 2];
        }
        renderer.clear();
    }

    // ------------------------------------------------------------ level building

    const levelMaterialCache = new Map();

    function levelMaterial(textureName, options) {
        const key = `${textureName}:${JSON.stringify(options || {})}`;
        if (levelMaterialCache.has(key)) {
            return levelMaterialCache.get(key);
        }
        const THREEjs = THREE();
        const texture = NW.Textures.get(textureName, textureName.length * 131);
        const mat = new THREEjs.MeshStandardMaterial(Object.assign({
            map: texture,
            bumpMap: texture,
            bumpScale: 0.035,
            roughness: 0.9,
            metalness: 0
        }, options || {}));
        levelMaterialCache.set(key, mat);
        return mat;
    }

    // Batch many (geometry, matrix) parts that share a material into one mesh.
    function mergeParts(parts, resolveMaterial) {
        const THREEjs = THREE();
        const buckets = new Map();
        parts.forEach((entry) => {
            const key = entry.materialKey;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(entry);
        });

        const meshes = [];
        buckets.forEach((entries, key) => {
            let vertexCount = 0;
            const prepared = entries.map((entry) => {
                let geometry = entry.geometry.index ? entry.geometry.toNonIndexed() : entry.geometry.clone();
                geometry.applyMatrix4(entry.matrix);
                vertexCount += geometry.attributes.position.count;
                return geometry;
            });

            const positions = new Float32Array(vertexCount * 3);
            const normals = new Float32Array(vertexCount * 3);
            const uvs = new Float32Array(vertexCount * 2);
            let offset = 0;
            prepared.forEach((geometry) => {
                const count = geometry.attributes.position.count;
                positions.set(geometry.attributes.position.array, offset * 3);
                if (geometry.attributes.normal) normals.set(geometry.attributes.normal.array, offset * 3);
                if (geometry.attributes.uv) uvs.set(geometry.attributes.uv.array, offset * 2);
                offset += count;
                geometry.dispose();
            });

            const merged = new THREEjs.BufferGeometry();
            merged.setAttribute('position', new THREEjs.BufferAttribute(positions, 3));
            merged.setAttribute('normal', new THREEjs.BufferAttribute(normals, 3));
            merged.setAttribute('uv', new THREEjs.BufferAttribute(uvs, 2));
            merged.computeBoundingSphere();
            const mesh = new THREEjs.Mesh(merged, resolveMaterial(key));
            mesh.matrixAutoUpdate = false;
            meshes.push(mesh);
        });
        return meshes;
    }

    function wallGeometry(height, cell) {
        const THREEjs = THREE();
        const geometry = new THREEjs.BoxGeometry(cell, height, cell);
        const uv = geometry.attributes.uv;
        const repeatV = height / cell;
        // Faces: +x, -x, +y, -y, +z, -z (4 vertices each). Tile the sides vertically.
        [0, 1, 4, 5].forEach((face) => {
            for (let v = 0; v < 4; v += 1) {
                const index = (face * 4) + v;
                uv.setY(index, uv.getY(index) * repeatV);
            }
        });
        return geometry;
    }

    function disposeLevel() {
        // The glinting stand goes with the level it belongs to (lightTheWay).
        clearEmber();
        // The breathing and the heartbeat belong to the vigil too.
        breath.level = 0;
        heart.level = 0;
        heart.phase = 0;
        stopBreath();
        if (!world.levelGroup) {
            return;
        }
        const skeletons = new Set();
        world.levelGroup.traverse((object) => {
            if (object.isMesh && object.geometry && !object.userData.sharedGeometry) {
                object.geometry.dispose();
            }
            // each vigil's copies of the girls own a skeleton (and its bone texture)
            if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
        });
        skeletons.forEach((skeleton) => skeleton.dispose());
        world.scene.remove(world.levelGroup);
        world.levelGroup = null;
        // the floor the spike room publishes for parkour.js goes with its level
        world.extraField = null;
        // The portal is built once and reused (portal.js): unhook it, or it would keep
        // this level's group alive through its parent.
        if (world.portal) {
            world.portal.root.removeFromParent();
            world.portal = null;
        }
        if (world.moonlight) {
            world.scene.remove(world.moonlight);
            world.moonlight = null;
        }
        if (world.skyFill) {
            world.scene.remove(world.skyFill);
            world.skyFill = null;
        }
        if (world.ambient) {
            world.scene.remove(world.ambient);
            world.ambient = null;
        }
    }

    function buildLevel(phase) {
        const THREEjs = THREE();
        // What this vigil has already given up, read once: door.js (the key) and this
        // build's relics both need it, and it must not change while the level is built.
        world.takenSpots = readTakenSpots();
        world.markSpot = markSpotTaken;   // door.js, once the key is in hand
        // The real cathedral when its model is loaded, the built-in layout otherwise.
        const cathedral = NW.Cathedral && NW.Cathedral.isReady() ? NW.Cathedral.buildLevel(phase, CONFIG) : null;
        const level = cathedral || NW.getLevelForPhase(phase);
        const isCathedral = level.environment === 'cathedral';
        // The side door's doorway strip and the corridor behind it join the grid (corridor.js).
        if (isCathedral && NW.Corridor) NW.Corridor.stampMap(level);
        const parsed = NW.parseLevel(level);
        const grid = parsed.grid;
        const theme = level.theme;
        const CELL = grid.cellSize;
        const H = theme.ceilingHeight;
        const random = makeRandom((phase * 7919) + 13);

        disposeLevel();
        world.parsed = parsed;
        world.level = level;
        world.theme = theme;
        world.phase = phase;
        world.torchSpots = [];
        // How many candle stands the player has lit in THIS build of the vigil
        // (updateCandleHold). None of them by the altar is ACH_UNBROKEN: with no pool
        // to stand in, the Demoness can never be banished, only outrun.
        world.candlesLit = 0;

        const group = new THREEjs.Group();
        world.levelGroup = group;
        world.scene.add(group);

        world.scene.fog = new THREEjs.FogExp2(theme.fogColor, theme.fogDensity);
        world.scene.background = new THREEjs.Color(theme.fogColor);
        world.ambient = new THREEjs.AmbientLight(theme.ambientColor, theme.ambientIntensity);
        world.scene.add(world.ambient);
        // A faint night-sky fill (cathedral.js VIGILS `fill`): keeps unlit walls a dim
        // silhouette instead of pure black. Built with the level, so prewarm() covers it.
        if (theme.fill > 0) {
            world.skyFill = new THREEjs.HemisphereLight(theme.fillSky, theme.fillGround, theme.fill);
            world.scene.add(world.skyFill);
        }
        if (theme.moonlight) {
            world.moonlight = new THREEjs.DirectionalLight(0x9fb4e8, 0.42);
            world.moonlight.position.set(-20, 40, 10);
            world.scene.add(world.moonlight);
        }

        // The cathedral carries its own stone, props and baked torchlight.
        if (isCathedral) {
            group.add(NW.Cathedral.get().model);
            NW.Cathedral.applyMood(theme);
            world.torchSpots = NW.Cathedral.torchLights();
        }

        const parts = [];
        const addPart = (geometry, materialKey, x, y, z, rotY) => {
            const matrix = new THREEjs.Matrix4().compose(
                new THREEjs.Vector3(x, y, z),
                new THREEjs.Quaternion().setFromEuler(new THREEjs.Euler(0, rotY || 0, 0)),
                new THREEjs.Vector3(1, 1, 1)
            );
            parts.push({ geometry, materialKey, matrix });
        };

        const wallGeo = wallGeometry(H, CELL);
        const floorGeo = new THREEjs.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2);
        const ceilingGeo = new THREEjs.PlaneGeometry(CELL, CELL).rotateX(Math.PI / 2);
        const pillarGeo = new THREEjs.CylinderGeometry(0.5, 0.55, H, 14);
        const pillarBaseGeo = new THREEjs.BoxGeometry(1.3, 0.4, 1.3);
        const isRoom = (x, z) => {
            const ch = grid.at(x, z);
            return ch !== '#' && ch !== 'W' && ch !== ' ';
        };
        const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        // The built-in tile shell (walls, floors, vaults, pillars, props, windows) is
        // only raised when there is no cathedral model: its rows are skipped here.
        const shellRows = isCathedral ? 0 : grid.height;

        for (let z = 0; z < shellRows; z += 1) {
            for (let x = 0; x < grid.width; x += 1) {
                const ch = grid.at(x, z);
                const cx = (x + 0.5) * CELL;
                const cz = (z + 0.5) * CELL;

                if (ch === '#' || ch === 'W') {
                    const touchesRoom = neighbours.some(([dx, dz]) => isRoom(x + dx, z + dz));
                    if (touchesRoom) {
                        addPart(wallGeo, 'wall', cx, H / 2, cz);
                    }
                    continue;
                }

                if (ch === ' ') {
                    continue;
                }

                const open = grid.isOpenSky(x, z);
                addPart(floorGeo, open && theme.openFloor ? 'openFloor' : 'floor', cx, 0, cz);
                if (!open) {
                    addPart(ceilingGeo, 'ceiling', cx, H, cz);
                }

                if (ch === 'P') {
                    addPart(pillarGeo, 'wall', cx, H / 2, cz);
                    addPart(pillarBaseGeo, 'wall', cx, 0.2, cz);
                    addPart(pillarBaseGeo, 'wall', cx, Math.min(H - 0.2, 4.2), cz);
                } else if (ch === 'x') {
                    NW.Models.makePropParts(theme.prop, random).forEach((propPart) => {
                        const matrix = new THREEjs.Matrix4().makeTranslation(cx, 0, cz).multiply(propPart.matrix);
                        parts.push({ geometry: propPart.geometry, materialKey: `prop:${propPart.materialKey}`, matrix });
                    });
                }
            }
        }

        const resolveMaterial = (key) => {
            if (key === 'wall') return levelMaterial(theme.wall);
            if (key === 'floor') return levelMaterial(theme.floor, { roughness: theme.floor === 'marble' ? 0.35 : 0.9 });
            if (key === 'openFloor') return levelMaterial(theme.openFloor);
            if (key === 'ceiling') return levelMaterial(theme.ceiling);
            if (key.startsWith('prop:')) return NW.Models.material(key.slice(5));
            return NW.Models.material(key);
        };
        mergeParts(parts, resolveMaterial).forEach((mesh) => group.add(mesh));

        // Stained-glass windows on the room side of every W wall.
        let windowSeed = 1;
        const windowHeight = Math.min(H * 0.55, 5.5);
        const windowGeo = new THREEjs.PlaneGeometry(1.7, windowHeight);
        for (let z = 0; z < shellRows; z += 1) {
            for (let x = 0; x < grid.width; x += 1) {
                if (grid.at(x, z) !== 'W') continue;
                neighbours.forEach(([dx, dz]) => {
                    if (!isRoom(x + dx, z + dz)) return;
                    const pane = new THREEjs.Mesh(windowGeo, new THREEjs.MeshBasicMaterial({
                        map: NW.Textures.getStainedGlass(theme.windowPalette, windowSeed++),
                        color: 0xb0a0a0,
                        fog: true
                    }));
                    pane.userData.sharedGeometry = true;
                    pane.position.set(((x + 0.5) + (dx * 0.502)) * CELL, Math.max(windowHeight / 2 + 0.6, H * 0.5), ((z + 0.5) + (dz * 0.502)) * CELL);
                    pane.rotation.y = Math.atan2(dx, dz);
                    group.add(pane);
                });
            }
        }

        // Altar. In the cathedral the carved throne at the top of the nave is the
        // altar, so only its glow is added; elsewhere the built-in altar is raised.
        // Its point (the reach, the aura, the light, Jane's goal) is the level's own when
        // it gives one: the throne sits on the nave's centre line, between two cells.
        const altarSpot = level.altarPoint
            ? { x: level.altarPoint.x, z: level.altarPoint.z }
            : grid.toWorld(parsed.spots.altar.x, parsed.spots.altar.z);
        let altarMesh = null;
        if (!isCathedral) {
            altarMesh = NW.Models.makeAltar();
            altarMesh.position.set(altarSpot.x, 0, altarSpot.z);
            group.add(altarMesh);
        }
        world.altar = { mesh: altarMesh, x: altarSpot.x, z: altarSpot.z };
        world.altarLight.position.set(altarSpot.x, 2.2, altarSpot.z + 0.8);
        world.altarLight.color.setHex(theme.candleColor);
        // Its reach drawn (altarAura.js): a blue veil and floor line on checkAltar()'s circle.
        if (NW.AltarAura) NW.AltarAura.build(group, world, CONFIG);

        // Candle stands.
        const flameColor = `rgba(${(theme.candleColor >> 16) & 255},${(theme.candleColor >> 8) & 255},${theme.candleColor & 255},0.9)`;
        world.candles = parsed.spots.candles.map((spot) => {
            const position = grid.toWorld(spot.x, spot.z);
            const stand = NW.Models.makeCandleStand(flameColor);
            stand.position.set(position.x, groundY(position.x, position.z), position.z);
            group.add(stand);
            // life: how much of its burn is left while lit (1 just lit .. 0 out, burnCandles);
            // flame: its flames' brightness this frame (updateLights)
            return { mesh: stand, x: position.x, z: position.z, lit: false, hold: 0, life: 0, flame: 0 };
        });
        world.poolLights.forEach((light) => {
            light.color.setHex(theme.candleColor);
            light.intensity = 0;
            light.distance = POOL_LIGHT_RANGE;
        });

        // Relics: every relic spot holds one (sometimes two); crosses and books balanced.
        // Only a lit candle lets one be taken, so a spot out of every stand's reach
        // moves to the nearest free cell a stand lights (the built-in maps predate
        // that rule; the cathedral already lays its relics by the stands).
        const jitter = Math.min(1.4, grid.cellSize * 0.5);
        const reach = CONFIG.candlePoolRadius - (jitter * 0.75);
        const stands = parsed.spots.candles.map((spot) => grid.toWorld(spot.x, spot.z));
        const byStand = (x, z) => {
            const point = grid.toWorld(x, z);
            return stands.some((stand) => Math.hypot(stand.x - point.x, stand.z - point.z) <= reach);
        };
        const relicSpots = parsed.spots.relics.map((spot) => {
            if (!stands.length || byStand(spot.x, spot.z)) return spot;
            const field = grid.distanceField(spot.x, spot.z);
            let best = null;
            for (let i = 0; i < field.length; i += 1) {
                const x = i % grid.width;
                const z = (i - x) / grid.width;
                if (field[i] < 0 || 'cAN'.includes(grid.at(x, z)) || !byStand(x, z)) continue;
                if (!best || field[i] < best.steps) best = { x, z, steps: field[i] };
            }
            return best || spot;
        });
        // They rest on something real: in the cathedral on the surfaces cathedral.js found
        // (pews, plinths, the floor at a pillar's foot); on the tile maps on the floor.
        let resting = level.relics;
        if (!resting || !resting.length) {
            resting = [];
            relicSpots.forEach((spot) => {
                const count = random() < 0.35 ? 2 : 1;
                for (let i = 0; i < count; i += 1) {
                    const position = grid.toWorld(spot.x, spot.z);
                    const x = position.x + ((random() - 0.5) * jitter);
                    const z = position.z + ((random() - 0.5) * jitter);
                    resting.push({ x, z, y: groundY(x, z), yaw: random() * Math.PI * 2 });
                }
            });
        }
        // Crosses and books balanced, among the common relics and among the reliquaries
        // (cathedral.js: on the tops of the tall props, worth reliquaryValue each).
        const kinds = [];
        [false, true].forEach((high) => {
            const indices = [];
            resting.forEach((spot, index) => { if (Boolean(spot.reliquary) === high) indices.push(index); });
            const flip = random() < 0.5;
            const pool = indices.map((_, n) => ((n % 2 === 0) === flip ? 'cross' : 'book'));
            for (let i = pool.length - 1; i > 0; i -= 1) {
                const j = Math.floor(random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            indices.forEach((index, n) => { kinds[index] = pool[n]; });
        });
        world.relics = resting.map((spot, index) => {
            const relic = spot.reliquary ? NW.Models.makeReliquary(kinds[index]) : NW.Models.makeRelic(kinds[index]);
            relic.position.set(spot.x, spot.y + relic.userData.rest, spot.z);
            relic.rotation.y = spot.yaw;
            // the two pickups worth a detour shimmer bigger, and breathe
            if (spot.reliquary || spot.hidden) NW.Models.markRelicPrize(relic);
            group.add(relic);
            return {
                mesh: relic,
                kind: kinds[index],
                x: spot.x,
                z: spot.z,
                y: spot.y,
                value: spot.reliquary ? CONFIG.reliquaryValue : (spot.hidden ? CONFIG.hiddenRelicValue : 1),
                reliquary: Boolean(spot.reliquary),
                hidden: Boolean(spot.hidden),   // under a hiding-spot table: taken lying down
                taken: false
            };
        });

        // Hiding spots (cathedral.js placeHideouts): low tables with a relic under them,
        // solid to the player through the height field (parkour.js stampHideouts: the
        // legs are stone, the room under the top a ceiling only a prone body fits under).
        world.hideouts = (level.hideouts || []).map((spot) => {
            const table = NW.Models.makeHideout(spot.width, spot.length, CONFIG.hideoutGap);
            table.position.set(spot.x, groundY(spot.x, spot.z), spot.z);
            table.rotation.y = spot.yaw;
            group.add(table);
            return {
                mesh: table, x: spot.x, z: spot.z, yaw: spot.yaw, width: spot.width, length: spot.length,
                gap: CONFIG.hideoutGap, legs: table.userData.legs
            };
        });
        world.hideoutField = null;
        if (NW.Parkour && NW.Parkour.stampHideouts) NW.Parkour.stampHideouts(world, world.hideouts, CONFIG.hideoutMargin);

        // The Nun (out and walking from the first frame) and the Demoness (hidden until
        // she acts). The Nun wears the vigil's outfit (V1..V5), like the catch videos.
        const nunMesh = NW.Models.makeCharacter('nun', Math.min(5, phase));
        group.add(nunMesh);
        const nunSpot = grid.toWorld(parsed.spots.nun.x, parsed.spots.nun.z);
        // Her portal stands behind the back arch (portal.js). The vigil's intro video
        // shows her stepping out of it, so play opens with her already out, on her spot
        // in front of it, facing the altar.
        world.portal = isCathedral && NW.Portal ? NW.Portal.create(nunSpot) : null;
        if (world.portal) group.add(world.portal.root);
        nunMesh.visible = true;
        nunMesh.rotation.y = Math.atan2(altarSpot.x - nunSpot.x, altarSpot.z - nunSpot.z);
        world.nun = {
            mesh: nunMesh,
            x: nunSpot.x,
            z: nunSpot.z,
            startX: nunSpot.x,
            startZ: nunSpot.z,
            speed: 1,
            state: 'hunting',
            timer: 0,
            moving: false,
            proximity: null
        };
        // Her aura: a wall across the whole nave, side wall to side wall (aura.js). The
        // built-in tile levels have no straight nave and get none.
        world.wall = null;
        if (isCathedral && NW.Aura) {
            let west = Infinity;
            let east = -Infinity;
            for (let z = 0; z < grid.height; z += 1) {
                for (let x = 0; x < grid.width; x += 1) {
                    if (grid.isBlocked(x, z)) continue;
                    west = Math.min(west, x);
                    east = Math.max(east, x + 1);
                }
            }
            // The spike room (spikeRoom.js) is off the grid, left of the nave, so the
            // grid's west edge does not see it: the veil has to be told to reach across
            // it, or the wall sweeps a room the player cannot see it coming in.
            let x0 = west * CELL;
            if (NW.SpikeRoom) x0 = Math.min(x0, NW.SpikeRoom.auraX0());
            world.wall = NW.Aura.build(group, x0, east * CELL);
        }

        const demonMesh = NW.Models.makeCharacter('demon');
        demonMesh.visible = false;
        group.add(demonMesh);
        world.demon = {
            mesh: demonMesh,
            x: 0,
            z: 0,
            state: 'idle',
            timer: 0,
            nextIn: 0,
            banishHold: 0,   // unbroken seconds the player has stood in candlelight
            ember: null,     // the stand glinting "light me" while she is out (lightTheWay)
            speed: 0,
            opacity: 0
        };

        // Distance field to the altar: drives the zone (progress) counter, and Jane walks
        // down it (world.altarGoal).
        const altarCell = parsed.spots.altar;
        world.altarField = grid.distanceField(altarCell.x, altarCell.z);
        world.altarFieldGrid = grid;
        world.altarGoal = { field: world.altarField, x: altarSpot.x, z: altarSpot.z };
        const startCell = parsed.spots.start;
        world.startDistance = Math.max(1, world.altarField[(startCell.z * grid.width) + startCell.x]);

        // Jane gets to the altar when the vigil's approach time (gameState.js, the same
        // table the 2D game used) is up: her walk down the nave at one steady pace.
        const nun = world.nun;
        const nunCell = parsed.spots.nun;
        const walk = Math.max(1, world.altarField[(nunCell.z * grid.width) + nunCell.x]) * CELL;
        nun.speed = walk / Math.max(10, approachSeconds(phase));
        nun.pace = null;   // her eased walking speed (nunPace), set on her first step

        // The locked side door by the altar and this vigil's key for it (door.js): closed,
        // its collider in world.levelBoxes, a new key laid, the inventory emptied.
        if (NW.Door) NW.Door.build(group, world, CONFIG);
        // The corridor behind that door (corridor.js): its stone, colliders, wall relics
        // and candle stands (into world.relics / world.candles, like the nave's).
        if (NW.Corridor) NW.Corridor.build(group, world, CONFIG);
        // Blood scrawled on the walls (bloodWriting.js): lit decals raycast onto real
        // stone, in the aisles, by the altar and in the corridor. No light of its own.
        if (NW.BloodWriting) NW.BloodWriting.build(group, world, CONFIG);
        // The wall ledges (wallLedges.js, placed by cathedral.js): stone shelves built
        // into the nave's side walls, out of reach from the floor, each with a
        // high-value relic hanging over it. Their colliders join world.levelBoxes and
        // their relics world.relics, like the corridor's.
        if (NW.WallLedges) NW.WallLedges.build(group, world, CONFIG);
        // The spike room off the nave's LEFT wall (spikeRoom.js): its pit and spikes, the
        // pillars and the far platform's reward. After bloodWriting.js, whose decals
        // raycast at real stone and must not find this room's. It publishes
        // world.extraField, the floor parkour.js walks left of the nave.
        if (NW.SpikeRoom) NW.SpikeRoom.build(group, world, CONFIG);

        // Every relic of this vigil now exists (nave + corridor): id its spot, and hide
        // the ones a previous attempt at this same vigil already took. Before prewarm(),
        // which restores each object's visibility as it found it.
        applyTakenSpots();

        world.preparedPhase = phase;
        prewarm();
    }

    // ------------------------------------------------------------------ vigil

    function resetPlayer() {
        const grid = world.parsed.grid;
        let startCell = world.parsed.spots.start;
        // Jane is out and walking from the first frame, so the player starts
        // nunHeadStart metres ahead of her: down the path to the altar from the doors.
        const nun = world.nun;
        for (let guard = 0; nun && guard < 64; guard += 1) {
            const here = grid.toWorld(startCell.x, startCell.z);
            if (Math.hypot(here.x - nun.startX, here.z - nun.startZ) >= CONFIG.nunHeadStart) break;
            const value = world.altarField[(startCell.z * grid.width) + startCell.x];
            let next = null;
            let nextValue = value;
            [[0, -1], [1, 0], [-1, 0], [0, 1]].forEach(([dx, dz]) => {
                const x = startCell.x + dx;
                const z = startCell.z + dz;
                if (x < 0 || z < 0 || x >= grid.width || z >= grid.height) return;
                const v = world.altarField[(z * grid.width) + x];
                if (v >= 0 && v < nextValue) {
                    nextValue = v;
                    next = { x, z };
                }
            });
            if (!next) break;
            startCell = next;
        }
        const start = grid.toWorld(startCell.x, startCell.z);

        // Face the first step toward the altar (the start cell may face a wall).
        let startYaw = 0;
        let bestDistance = world.altarField[(startCell.z * grid.width) + startCell.x];
        [[0, -1], [1, 0], [-1, 0], [0, 1]].forEach(([dx, dz]) => {
            const value = world.altarField[((startCell.z + dz) * grid.width) + (startCell.x + dx)];
            if (value >= 0 && value < bestDistance) {
                bestDistance = value;
                startYaw = Math.atan2(-dx, -dz);
            }
        });

        world.player = {
            x: start.x,
            z: start.z,
            yaw: startYaw,
            pitch: 0,
            stamina: 100,
            staminaIdle: 0,
            bob: 0
        };
        // Feet on the real floor, and the rest of the body (y, velocity, crouch, climb):
        // parkour.js. Jane's aura starts from nothing.
        NW.Parkour.reset(world, CONFIG);
        if (NW.Aura) NW.Aura.reset(world, CONFIG);
        world.zoneReached = 1;
        world.altarTriggered = false;
        world.caughtTriggered = false;
        world.fieldCell = '';
        world.fieldTimer = 0;
        world.target = null;
        placeCamera(0);
    }

    function scheduleDemon(first) {
        const gs = state();
        const range = CONFIG.demonIntervalByPhase[phaseIndex(world.phase)];
        world.demon.state = 'idle';
        world.demon.mesh.visible = false;
        clearEmber();
        world.demon.nextIn = first && gs && !gs.firstAttackDone
            ? CONFIG.demonFirstDelay
            : randomBetween(range[0], range[1]);
    }

    function prepareVigil(phase) {
        if (!world.enabled || !ensureRenderer()) {
            return false;
        }
        buildLevel(Number(phase) || 1);
        resetPlayer();
        if (NW.NunSteps) NW.NunSteps.reset();   // her gait starts this vigil, not last one's
        return true;
    }

    function beginVigil(gameState) {
        if (!world.enabled || !ensureRenderer()) {
            return false;
        }

        const phase = Number(gameState && gameState.currentRound) || 1;
        if (world.preparedPhase !== phase || !world.parsed) {
            buildLevel(phase);
        }
        resetPlayer();
        scheduleDemon(true);
        if (NW.NunSteps) NW.NunSteps.reset();
        // The intro fades out over the canvas from here (uiController.js
        // playPhaseStartIntro) while canControl() is still false: draw the vigil's first
        // view now, or the fade uncovers whatever the canvas last held.
        world.needsDraw = true;
        if (gameState) {
            gameState.currentZone = 1;
            gameState.isAtAltar = false;
        }
        if (window.uiController && typeof window.updateCounters === 'function') {
            window.updateCounters(window.uiController);
        }
        world.preparedPhase = 0;

        if (typeof window.showTheNunToast === 'function') {
            window.showTheNunToast(t('level.toast', {
                numeral: ['I', 'II', 'III', 'IV', 'V', 'VI'][phaseIndex(phase)],
                name: t((world.level || NW.getLevelForPhase(phase)).nameKey)
            }));
        }

        startLoop();
        updateHud(true);
        return true;
    }

    // ------------------------------------------------------------------ input

    function bindInput() {
        document.addEventListener('keydown', (event) => onKey(event, true));
        document.addEventListener('keyup', (event) => onKey(event, false));
        window.addEventListener('blur', () => {
            Object.keys(world.keys).forEach((key) => { world.keys[key] = false; });
            world.mouseDown = false;
            world.crouchCancel = true;   // a Ctrl held into the blur neither lies down nor stands up
        });

        world.container.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (!world.locked) {
                if (canControl()) {
                    requestLock();
                }
                return;
            }
            world.mouseDown = true;
            onActionPressed();
        });
        document.addEventListener('mouseup', (event) => {
            if (event.button === 0) world.mouseDown = false;
        });
        document.addEventListener('mousemove', (event) => {
            if (!world.locked || !world.player || !canControl()) return;
            // A single move this large is Chromium's pointer-lock glitch, not a hand
            // (it turned the view by 30°+ in one event): dropped, as are the first moves
            // right after a (re)lock.
            if (performance.now() < (world.mouseSettleUntil || 0)) return;
            if (Math.abs(event.movementX) > CONFIG.mouseSpikeLimit || Math.abs(event.movementY) > CONFIG.mouseSpikeLimit) return;
            // Settings > Controls > Mouse Sensitivity (settings.js; also set in the tutorial)
            // scales the base look speed: 1 = the default feel.
            const look = CONFIG.mouseSensitivity
                * (typeof window.getTheNunMouseSensitivity === 'function' ? window.getTheNunMouseSensitivity() : 1);
            world.player.yaw -= event.movementX * look;
            world.player.pitch -= event.movementY * look;
            world.player.pitch = Math.max(-1.35, Math.min(1.35, world.player.pitch));
        });
        document.addEventListener('pointerlockchange', onPointerLockChange);
        document.addEventListener('pointerlockerror', () => {
            world.lockDenied = true;
            updateHud(true);
        });
    }

    const KEY_MAP = {
        KeyW: 'forward', ArrowUp: 'forward',
        KeyS: 'back', ArrowDown: 'back',
        KeyA: 'left', ArrowLeft: 'left',
        KeyD: 'right', ArrowRight: 'right',
        ShiftLeft: 'sprint', ShiftRight: 'sprint',
        KeyE: 'interact',
        Space: 'jump',
        // Ctrl: a tap toggles the crouch, a hold (proneHoldTime) lies down, a tap lying
        // down gets up; while sprinting, a slide (parkour.js ctrlStance). C does exactly
        // the same. Crouch-running right is Ctrl+Shift+D, the dev
        // panel's key (code/dev-actions.js): it stays shut while the world has control
        // (theNun3D.hasControl), and every Ctrl+key is kept from the browser/menu while
        // playing (Ctrl+W would close a dev build's window, Ctrl+S save the page...).
        ControlLeft: 'crouch',
        ControlRight: 'crouch',
        KeyC: 'crouch'
    };

    function onKey(event, down) {
        if (!world.enabled) return;
        const action = KEY_MAP[event.code];
        if (!action) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
        if (!canControl() && down) {
            world.keys[action] = false;
            return;
        }
        // A movement key is a user gesture too: it takes the mouse back if autoRelock was refused.
        if (down && !event.repeat && !world.locked && canControl()) requestLock();
        // Space would also press whatever button still has the focus (a menu's Resume).
        // Ctrl and Ctrl+anything: no browser or menu shortcut while playing.
        if ((action === 'jump' || action === 'crouch' || event.ctrlKey) && canControl()) event.preventDefault();
        world.keys[action] = down;
        if (down && !event.repeat) {
            if (action === 'interact') onActionPressed();
            else if (action === 'jump') world.jumpPressed = true;
            else if (action === 'crouch') world.crouchPressed = true;
        }
    }

    // The raw mouse (unadjustedMovement) where the browser has it: Windows' pointer
    // acceleration path is where Chromium's pointer lock throws the odd huge movementX
    // that snapped the view to another angle mid-run. Plain lock where it is refused.
    function requestLock() {
        if (!world.canvas || typeof world.canvas.requestPointerLock !== 'function') return;
        const plain = () => {
            try {
                const result = world.canvas.requestPointerLock();
                if (result && typeof result.catch === 'function') result.catch(() => { world.lockDenied = true; });
            } catch (error) {
                world.lockDenied = true;
            }
        };
        try {
            const result = world.canvas.requestPointerLock({ unadjustedMovement: true });
            if (result && typeof result.catch === 'function') {
                result.catch((error) => {
                    if (error && error.name === 'NotSupportedError') plain();
                    else world.lockDenied = true;
                });
            }
        } catch (error) {
            plain();
        }
    }

    // Back from a scene, the altar, an intro or the pause menu, play resumes at once:
    // the mouse is taken again as soon as the player can act (no "Click to play"). The
    // pointer-lock spec lets a page re-lock without a click after its own
    // exitPointerLock() (every scene's releaseLock), and the click or key that closed
    // the scene is still a live user activation. Held back while a catch or the altar
    // is starting its scene, briefly after Esc (the pause menu opens), and after a
    // denial: then the next click or movement key takes it (bindInput, onKey) and
    // only then is the "Click to play" hint shown.
    function autoRelock(dt) {
        if (world.locked || !canControl() || world.caughtTriggered || world.altarTriggered || world.awaitingDemonScene) {
            world.controlSettle = 0;
            if (!world.locked && !canControl()) world.lockDenied = false;   // each return gets its own try
            return;
        }
        world.controlSettle = (world.controlSettle || 0) + dt;
        if (world.lockDenied || world.controlSettle < 0.15) return;
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
        const now = performance.now();
        if (now < (world.relockHoldUntil || 0) || now - (world.lastAutoLock || -Infinity) < 1000) return;
        world.lastAutoLock = now;
        requestLock();
    }

    function releaseLock() {
        if (document.pointerLockElement) {
            world.intentionalUnlock = true;
            document.exitPointerLock();
        }
    }

    function onPointerLockChange() {
        world.locked = document.pointerLockElement === world.canvas;
        if (world.locked) {
            // the first moves after a (re)lock can carry the jump to the locked position
            world.mouseSettleUntil = performance.now() + 120;
            world.intentionalUnlock = false;
            world.lockDenied = false;
            updateHud(true);
            return;
        }

        const wasIntentional = world.intentionalUnlock;
        world.intentionalUnlock = false;
        // Esc or a lost focus: leave the pause menu time to open before autoRelock.
        if (!wasIntentional) world.relockHoldUntil = performance.now() + 600;
        Object.keys(world.keys).forEach((key) => { world.keys[key] = false; });
        world.mouseDown = false;
        world.crouchCancel = true;
        updateHud(true);

        // Esc released the mouse: open the pause menu (unless Esc already did).
        if (!wasIntentional && canControl()) {
            window.setTimeout(() => {
                if (canControl() && !window.isPauseMenuOpen && typeof window.openPauseMenu === 'function') {
                    window.openPauseMenu();
                }
            }, 60);
        }
    }

    // ------------------------------------------------------------ interaction

    function forwardVector() {
        const p = world.player;
        const cosPitch = Math.cos(p.pitch);
        return { x: -Math.sin(p.yaw) * cosPitch, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cosPitch };
    }

    function aimAngle(x, y, z) {
        const f = forwardVector();
        const dx = x - world.player.x;
        // from the real eyes: they climb, jump, crouch and walk the lower lane
        const dy = y - world.camera.position.y;
        const dz = z - world.player.z;
        const length = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz)) || 1;
        const dot = ((f.x * dx) + (f.y * dy) + (f.z * dz)) / length;
        return { angle: Math.acos(Math.max(-1, Math.min(1, dot))), distance: length };
    }

    function findTarget() {
        // A relic is taken up close and looked at, lit candle or not. Close is measured
        // across the floor: they lie on the ground, pews and plinths.
        // One resting too high above the feet (a reliquary on a tall prop) is only
        // pointed out: "climb up to it".
        let best = null;
        let high = null;
        world.relics.forEach((relic) => {
            if (relic.taken) return;
            const across = Math.hypot(relic.x - world.player.x, relic.z - world.player.z);
            if (across > CONFIG.relicPickRange) return;
            const aim = aimAngle(relic.x, relic.mesh.position.y, relic.z);
            if (aim.angle > Math.max(CONFIG.relicAimAngle, Math.atan2(0.3, aim.distance))) return;
            // under a hiding-spot table: only lying down and close ("lie down to reach it")
            if (relic.hidden && !(world.player.prone && across <= CONFIG.hiddenRelicRange)) {
                if (!world.player.prone && (!high || aim.distance < high.distance)) high = { type: 'prone', relic, distance: aim.distance };
                return;
            }
            // CONFIG.relicReachUp is the reach of someone standing on the floor for a
            // relic lying on top of something — above it, the hint says to climb. One
            // hung on a wall within arm's reach carries its own `reachUp` instead
            // (corridor.js), so a cross at head height is simply taken.
            const reachUp = relic.reachUp == null ? CONFIG.relicReachUp : relic.reachUp;
            if (relic.y - world.player.y > reachUp) {
                if (!high || aim.distance < high.distance) high = { type: 'high', relic, distance: aim.distance };
                return;
            }
            if (!best || aim.distance < best.distance) best = { type: 'relic', relic, distance: aim.distance };
        });
        // The side door's key (door.js) is taken like a relic; the nearer of the two wins.
        const key = NW.Door ? NW.Door.keyTarget(world, CONFIG, aimAngle) : null;
        if (key && (!best || key.distance < best.distance)) best = key;
        if (best) return best;
        // The side door (door.js), once the player has arrived at it and looks at it:
        // "This door is locked", or "Press E to open" with the key.
        const door = NW.Door ? NW.Door.doorTarget(world) : null;
        if (door) return door;

        world.candles.forEach((candle) => {
            if (candle.lit) return;
            const aim = aimAngle(candle.x, candle.mesh.position.y + 1.4, candle.z);
            if (aim.distance <= CONFIG.interactRange && aim.angle < 0.6) {
                if (!best || aim.distance < best.distance) best = { type: 'candle', candle, distance: aim.distance };
            }
        });
        return best || high;
    }

    function onActionPressed() {
        if (!canControl()) return;
        const target = findTarget();
        if (target && target.type === 'relic') {
            takeRelic(target.relic);
        } else if (target && NW.Door) {
            NW.Door.act(world, target, playSfx);   // the key, or the side door
        }
    }

    function takeRelic(relic) {
        const gs = state();
        if (!gs || relic.taken) return;
        relic.taken = true;
        relic.mesh.visible = false;
        // this spot stays empty if the vigil has to be replayed after a catch
        markSpotTaken(relic.spot || spotId(relic));
        // a reliquary counts as several
        for (let i = 0; i < (relic.value || 1); i += 1) {
            if (relic.kind === 'cross') {
                window.collectCross(gs);
            } else {
                window.collectBook(gs);
            }
        }
        if (window.uiController && typeof window.updateCounters === 'function') {
            window.updateCounters(window.uiController);
        }
        // the same click, told apart by ear: a cross rings at pitch, a book is duller,
        // and a reliquary (value > 1) is a touch louder than a floor pickup
        // Steam: the corridor's dead-end prize (corridor.js PRIZE — the only reliquary
        // behind the side door) is ACH_RELIC_HUNTER.
        // (the spike room's reward is flagged behindDoor too, so the tutorial leaves it
        // alone, but it is not the corridor's prize: `spikeRoom` keeps them apart)
        if (relic.behindDoor && relic.reliquary && !relic.spikeRoom && typeof window.unlockAchievement === 'function') {
            window.unlockAchievement('ACH_RELIC_HUNTER');
        }
        // Steam: the spike room's big reward (spikeRoom.js PRIZE) is ACH_THORNS — it is
        // earned by having it in hand, which can only happen out on the far platform.
        if (relic.spikeRoom && relic.reliquary && typeof window.unlockAchievement === 'function') {
            window.unlockAchievement('ACH_THORNS');
        }
        const reliquary = (relic.value || 1) > 1;
        playSfx('click-audio', reliquary ? 0.44 : 0.35, relic.kind === 'cross' ? 1 : 0.82);
        const counter = byId(relic.kind === 'cross' ? 'cross-counter' : 'book-counter');
        if (counter) {
            counter.classList.remove('counter-bump');
            void counter.offsetWidth;
            counter.classList.add('counter-bump');
        }
    }

    function updateCandleHold(dt) {
        const holding = world.mouseDown || world.keys.interact;
        const target = world.target;
        let active = null;
        if (holding && target && target.type === 'candle') {
            active = target.candle;
            active.hold += dt;
            if (active.hold >= CONFIG.candleHoldSeconds) {
                // lit (or lit again once burnt out): a fresh burn (burnCandles)
                active.lit = true;
                active.hold = 0;
                active.life = 1;
                world.candlesLit = (world.candlesLit || 0) + 1;
                NW.Models.setCandleLit(active.mesh, true);
                active = null;
            }
        }
        world.candles.forEach((candle) => {
            if (candle !== active && !candle.lit) candle.hold = Math.max(0, candle.hold - (dt * 2));
        });

        const fire = byId('fire-audio');
        if (fire) {
            if (active && fire.paused) {
                playSfx('fire-audio', 0.8);
            } else if (!active && !fire.paused) {
                fire.pause();
            }
        }
        world.holdingCandle = active;
    }

    // Control lost (update): the candle being lit starts again from nothing when play
    // resumes (a fresh press of E), and the ring, the target prompt and the crackle go.
    function dropCandleHold() {
        if (!world.holdingCandle && !world.target && !world.candles.some((candle) => !candle.lit && candle.hold > 0)) return;
        world.holdingCandle = null;
        world.target = null;
        world.keys.interact = false;
        world.mouseDown = false;
        world.candles.forEach((candle) => { if (!candle.lit) candle.hold = 0; });
        const fire = byId('fire-audio');
        if (fire && !fire.paused) fire.pause();
        world.hudTimer = 0;   // repainted this frame, not on the next HUD tick
    }

    // ------------------------------------------------------------ player
    //
    // The keys are read here; the body that walks, runs, jumps, climbs, crouches and
    // spends the Breath is parkour.js (walls, steps and ledges from the height field).

    // Keep the player off a round obstacle (a candle stand, the built-in altar): slid
    // out through the same collision, so never into stone.
    function pushOutOfCircle(cx, cz, radius) {
        const p = world.player;
        const dx = p.x - cx;
        const dz = p.z - cz;
        const distance = Math.sqrt((dx * dx) + (dz * dz));
        const minimum = radius + CONFIG.radius;
        if (distance > 0.0001 && distance < minimum) {
            const push = minimum - distance;
            NW.Parkour.moveBy(world, (dx / distance) * push, (dz / distance) * push);
        }
    }

    function updatePlayer(dt) {
        const keys = world.keys;
        let moveX = 0;
        let moveZ = 0;
        if (keys.forward) moveZ -= 1;
        if (keys.back) moveZ += 1;
        if (keys.left) moveX -= 1;
        if (keys.right) moveX += 1;

        feetListen();
        const travelled = NW.Parkour.update(world, CONFIG, dt, moveX, moveZ);
        feetStep(travelled, dt);
        for (let i = 0; i < world.candles.length; i += 1) {
            pushOutOfCircle(world.candles[i].x, world.candles[i].z, 0.35);
        }
        if (world.altar && world.altar.mesh) pushOutOfCircle(world.altar.x, world.altar.z, 1.1);

        placeCamera(dt);
    }

    function placeCamera(dt) {
        const p = world.player;
        // the eyes: feet + eye height, eased on steps, the landing dip, the walk's bob
        const eye = NW.Parkour.pose(world, CONFIG, dt);
        world.camera.position.set(eye.x, eye.y, eye.z);
        world.camera.rotation.set(p.pitch + eye.pitch, p.yaw, eye.roll);
        // the Rush (parkour.js) widens the view a little while it lasts
        const fov = 70 + (p.rush > 0 ? CONFIG.rushFov * Math.min(1, p.rush / 0.3) : 0);
        const eased = dt > 0 ? world.camera.fov + ((fov - world.camera.fov) * (1 - Math.exp(-8 * dt))) : fov;
        if (Math.abs(eased - world.camera.fov) > 0.01) {
            world.camera.fov = eased;
            world.camera.updateProjectionMatrix();
        }
        // The night vision (world.nightVision) rides on the camera and never changes.
    }

    function updateZoneProgress() {
        const gs = state();
        const grid = world.parsed.grid;
        const cell = grid.toCell(world.player.x, world.player.z);
        const distance = world.altarField[(cell.z * grid.width) + cell.x];
        if (distance < 0) return;
        const progress = 1 - (distance / world.startDistance);
        const zone = Math.max(1, Math.min(5, 1 + Math.floor(Math.max(0, progress) * 4.999)));
        if (zone > world.zoneReached) {
            world.zoneReached = zone;
            if (gs) {
                gs.currentZone = zone;
                if (window.uiController && typeof window.updateCounters === 'function') {
                    window.updateCounters(window.uiController);
                }
            }
        }
    }

    function checkAltar() {
        if (world.altarTriggered || !world.altar) return;
        if (world.script && world.script.altarLocked) return;   // the tutorial opens it last
        const distance = Math.hypot(world.player.x - world.altar.x, world.player.z - world.altar.z);
        if (distance > CONFIG.altarReach) return;

        world.altarTriggered = true;
        releaseLock();
        // Steam: the whole vigil walked in the dark (code/achievements.js; a no-op in
        // the tutorial, in a dev-tools session and off Steam).
        if (!world.candlesLit && typeof window.unlockAchievement === 'function') {
            window.unlockAchievement('ACH_UNBROKEN');
        }
        const gs = state();
        if (!gs) return;
        gs.currentZone = gs.maxZones || 5;
        if (typeof window.nextZone === 'function') window.nextZone(gs);
        if (window.uiController && typeof window.updateCounters === 'function') window.updateCounters(window.uiController);
        world.demon.mesh.visible = false;
        world.demon.state = 'idle';
        if (typeof window.showAltarScreen === 'function' && window.uiController) {
            window.showAltarScreen(window.uiController);
        }
    }

    // ------------------------------------------------------------ pathing

    // Which open cells of the girls' grid connect to the vigil's start (an open cell
    // walled in on its own leads nowhere). Kept on the parsed level.
    function connectedCells() {
        const parsed = world.parsed;
        if (!parsed.connected) parsed.connected = parsed.grid.distanceField(parsed.spots.start.x, parsed.spots.start.z);
        return parsed.connected;
    }

    function isOnGrid(grid, x, z) {
        return !grid.isBlocked(x, z) && connectedCells()[(z * grid.width) + x] >= 0;
    }

    // The connected open cell nearest to (x, z), written into `cell` (up to 4 cells away).
    function nearestOpenCell(grid, cell, x, z) {
        const cx = cell.x;
        const cz = cell.z;
        let best = Infinity;
        for (let ring = 1; ring <= 4 && best === Infinity; ring += 1) {
            for (let dz = -ring; dz <= ring; dz += 1) {
                for (let dx = -ring; dx <= ring; dx += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring || !isOnGrid(grid, cx + dx, cz + dz)) continue;
                    const distance = Math.hypot(((cx + dx + 0.5) * grid.cellSize) - x, ((cz + dz + 0.5) * grid.cellSize) - z);
                    if (distance < best) {
                        best = distance;
                        cell.x = cx + dx;
                        cell.z = cz + dz;
                    }
                }
            }
        }
    }

    function refreshPlayerField(dt) {
        const grid = world.parsed.grid;
        const cell = grid.toCell(world.player.x, world.player.z);
        // Up on a tomb or a table (a blocked cell of the girls' grid), or in a walled-in
        // pocket of it, they head for the connected floor beside him: a field grown from
        // there would reach nowhere.
        if (!isOnGrid(grid, cell.x, cell.z)) nearestOpenCell(grid, cell, world.player.x, world.player.z);
        const key = `${cell.x},${cell.z}`;
        world.fieldTimer -= dt;
        if (key !== world.fieldCell || world.fieldTimer <= 0 || !world.playerField) {
            world.fieldCell = key;
            world.fieldTimer = 0.5;
            world.playerField = grid.distanceField(cell.x, cell.z);
        }
    }

    // Move an actor one step along a distance field: the player's (the Demoness), or a
    // fixed goal's { field, x, z } (Jane's walk to the altar).
    function stepToward(actor, speed, dt, goal) {
        const grid = world.parsed.grid;
        const field = goal ? goal.field : world.playerField;
        const cell = grid.toCell(actor.x, actor.z);
        const here = field[(cell.z * grid.width) + cell.x];
        let targetX = goal ? goal.x : world.player.x;
        let targetZ = goal ? goal.z : world.player.z;
        // The player up on a tomb or a dais, where the grid is blocked (parkour.js lets
        // him climb there), or she already off the grid after him: from close by, while
        // only low things lie between, straight at him. Otherwise the grid, or stand.
        const offGrid = !goal && (here < 0
            || !isOnGrid(grid, Math.floor(world.player.x / grid.cellSize), Math.floor(world.player.z / grid.cellSize)));
        const straight = offGrid
            && Math.hypot(world.player.x - actor.x, world.player.z - actor.z) < 4
            && NW.Parkour.clearLine(world, actor.x, actor.z, world.player.x, world.player.z, 0.3);

        if (!straight && here > 1) {
            let best = null;
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
                const nx = cell.x + dx;
                const nz = cell.z + dz;
                if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) return;
                const value = field[(nz * grid.width) + nx];
                if (value >= 0 && value < here && (!best || value < best.value)) best = { value, nx, nz };
            });
            if (best) {
                // Walk the corridor's centre line: first line up with the current
                // cell on the cross axis, then head for the next cell. This never
                // cuts a wall corner.
                const own = grid.toWorld(cell.x, cell.z);
                const next = grid.toWorld(best.nx, best.nz);
                const alongX = best.nx !== cell.x;
                const crossOffset = alongX ? Math.abs(actor.z - own.z) : Math.abs(actor.x - own.x);
                if (crossOffset > 0.2) {
                    targetX = alongX ? actor.x : own.x;
                    targetZ = alongX ? own.z : actor.z;
                } else {
                    targetX = alongX ? next.x : own.x;
                    targetZ = alongX ? own.z : next.z;
                }
            }
        } else if (!straight && here < 0) {
            // Left on a blocked cell once the player got away: back to the nearest open
            // one, then along the grid again (never frozen there).
            if (isOnGrid(grid, cell.x, cell.z)) return 0;
            const back = { x: cell.x, z: cell.z };
            nearestOpenCell(grid, back, actor.x, actor.z);
            if (back.x === cell.x && back.z === cell.z) return 0;
            targetX = (back.x + 0.5) * grid.cellSize;
            targetZ = (back.z + 0.5) * grid.cellSize;
        }

        const dx = targetX - actor.x;
        const dz = targetZ - actor.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.0001) return 0;
        const step = Math.min(distance, speed * dt);
        actor.x += (dx / distance) * step;
        actor.z += (dz / distance) * step;
        return Math.atan2(dx, dz);
    }

    // How much of a lit stand's glow is left (1 just lit, 0 out): the square root of its
    // burn (burnCandles), so the area of its pool shrinks evenly. Its gameplay pool
    // (candleReach), its pool light and its flames all scale with it (updateLights).
    function candleGlow(candle) {
        return candle.lit ? Math.sqrt(Math.max(0, candle.life)) : 0;
    }

    function candleReach(candle) {
        return CONFIG.candlePoolRadius * candleGlow(candle);
    }

    // Inside a lit stand's pool as it is now (it shrinks as the stand burns down): the
    // Nun is slowed there, the Demoness never spawns on the player there and is banished
    // there, and relics show their colours there.
    function isInCandleLight(x, z) {
        return world.candles.some((candle) => candle.lit && Math.hypot(candle.x - x, candle.z - z) < candleReach(candle));
    }

    // How lit a point is (0..1): the night vision's reach, lit candle pools, the altar glow.
    // Sprites ignore scene lights, so the girls are shaded with this instead.
    function lightAt(x, z) {
        const sight = 1 - (Math.hypot(x - world.player.x, z - world.player.z) / Math.max(1, world.nightVision.distance));
        const candle = isInCandleLight(x, z) ? 0.75 : 0;
        const altar = world.altar ? 0.8 - (Math.hypot(x - world.altar.x, z - world.altar.z) / 10) : 0;
        // The cathedral's wall torches are baked into the stone, so sprites have to be
        // told about them: standing under one lights the girls the same way.
        let torch = 0;
        const torches = world.torchSpots;
        const reach = (world.theme && world.theme.bakedLight != null ? world.theme.bakedLight : 1) * 6;
        for (let i = 0; i < torches.length; i += 1) {
            const distance = Math.hypot(torches[i].x - x, torches[i].z - z);
            if (distance < reach) torch = Math.max(torch, 0.85 * (1 - (distance / reach)));
        }
        return Math.max(0.1, sight * 1.15, candle, altar, torch);
    }

    // The real floor under a point (parkour.js height field; 0 without it): the centre
    // lane sits lower than the aisles, so the girls, the stands and the relics stand on
    // it instead of hovering at 0.
    function groundY(x, z) {
        const ground = NW.Parkour ? NW.Parkour.groundAt(world, x, z) : null;
        return ground == null ? 0 : ground;
    }

    // An actor's feet follow the floor, eased so a plinth she brushes past does not
    // make her pop up (dt 0 = place her there at once).
    function standOnFloor(actor, dt) {
        const target = groundY(actor.x, actor.z);
        actor.y = actor.y == null || !dt ? target : actor.y + ((target - actor.y) * Math.min(1, dt * 8));
        return actor.y;
    }

    // ------------------------------------------------------------ the Nun

    // Her walking speed this frame. She never stops once out of her portal (Shaun: a
    // continuous walk, even slow-motion, beats stopping): the vigil's pace, halved in a
    // lit candle's pool, eased (nunPaceEase) so a pool's edge never jolts her.
    function nunPace(nun, dt) {
        const target = nun.speed * (isInCandleLight(nun.x, nun.z) ? CONFIG.nunLightSlow : 1);
        nun.pace = nun.pace == null ? target : nun.pace + ((target - nun.pace) * Math.min(1, dt * CONFIG.nunPaceEase));
        return nun.pace;
    }

    function updateNun(dt) {
        const nun = world.nun;
        // She is out of her portal from the first frame (the intro video showed her step
        // out). 'waiting' only follows the dev "no catch" switch (nunCatches): hidden for
        // a moment, then back on her spot.
        if (nun.state === 'waiting') {
            nun.timer -= dt;
            nun.proximity = null;
            if (nun.timer > 0) return;
            nun.state = 'hunting';
            nun.x = nun.startX;
            nun.z = nun.startZ;
            nun.mesh.visible = true;
        }
        if (world.portal) NW.Portal.update(world.portal, dt, 0);

        // She walks at the vigil's pace (slower in a lit candle's pool) and never turns
        // to the player: down the nave to the altar, her aura's wall a step behind her
        // (aura.js). Her walk clip plays at speed / nunWalkNatural, so her feet keep to
        // the floor (slow-motion early on).
        // (the tutorial holds her on her spot, or slows her)
        const script = world.script;
        const speed = script && script.holdNun ? 0 : nunPace(nun, dt) * (script && script.nunSpeedScale ? script.nunSpeedScale : 1);
        const heading = speed > 0 ? stepToward(nun, speed, dt, world.altarGoal) : null;
        if (heading) nun.mesh.rotation.y = heading;
        nun.moving = true;
        nun.mesh.position.set(nun.x, standOnFloor(nun, dt), nun.z);
        NW.Models.animateCharacter(nun.mesh, dt, speed / CONFIG.nunWalkNatural, lightAt(nun.x, nun.z), 1);
        // Her feet, out loud: one hit per footfall of the clip we just advanced, silent
        // past nunStepsRange and while !canControl() (nunSteps.js).
        if (NW.NunSteps) NW.NunSteps.update(world, CONFIG, dt, playSfx, canControl());

        // How close the danger is: in the cathedral, her reach or her wall, whichever
        // would take hold of the player first (aura.js gap); herself elsewhere.
        const wall = world.wall ? NW.Aura.wallZ() : Infinity;
        const gap = Number.isFinite(wall)
            ? NW.Aura.gap(world, CONFIG)
            : Math.hypot(world.player.x - nun.x, world.player.z - nun.z);
        nun.proximity = Math.max(0, Math.min(1, 1 - (gap / CONFIG.nunMeterRange)));
        nun.gap = gap;   // metres, read by the heartbeat and the out-of-breath breathing
        // Without a wall (the built-in tile levels) she takes whoever she walks into.
        if (!world.wall && Math.hypot(world.player.x - nun.x, world.player.z - nun.z) < CONFIG.nunCatchDistance && !world.caughtTriggered) {
            nunCatches();
        }
    }

    function nunCatches() {
        // The tutorial never ends on a catch: it moves the player clear instead.
        if (world.script && typeof world.script.onNunCatch === 'function') {
            world.script.onNunCatch();
            return;
        }
        if (window.nunSystem && typeof window.getNunDevMode === 'function' && window.getNunDevMode().noNunCatch) {
            world.nun.state = 'waiting';
            world.nun.timer = 6;
            world.nun.mesh.visible = false;
            return;
        }
        world.caughtTriggered = true;
        releaseLock();
        world.demon.mesh.visible = false;
        world.demon.state = 'idle';
        clearEmber();
        // She is gone with the vigil: take her banner and its cue down too, or "Hide In
        // Light / Light it" hangs over the caught scene pointing at a stand that no
        // longer glints (demonCatches and updateBanish already do this).
        syncDemonBanner();
        if (typeof window.startTheNunCaughtScene === 'function') {
            window.startTheNunCaughtScene();
        }
    }

    // ------------------------------------------------------------ the Demoness

    function trySpawnDemon() {
        const grid = world.parsed.grid;
        const field = world.playerField;
        const f = forwardVector();
        const candidates = [];
        const consider = (x, z, bonus) => {
            // Far enough to be a scare, close enough to reach: 12 to 21 metres away.
            const distance = field[(z * grid.width) + x] * grid.cellSize;
            if (distance < 12 || distance > 21) return;
            const position = grid.toWorld(x, z);
            if (isInCandleLight(position.x, position.z)) return;
            // only in the room Jane's wall leaves the player, never behind or in it
            if (world.wall && position.z > NW.Aura.wallZ() - 4) return;
            const dx = position.x - world.player.x;
            const dz = position.z - world.player.z;
            const length = Math.hypot(dx, dz) || 1;
            const facing = ((dx * f.x) + (dz * f.z)) / length;
            candidates.push({ position, score: facing + bonus + (Math.random() * 0.4) });
        };
        world.parsed.spots.demons.forEach((spot) => consider(spot.x, spot.z, 0.8));
        for (let z = 0; z < grid.height; z += 1) {
            for (let x = 0; x < grid.width; x += 1) {
                if (!grid.isBlocked(x, z)) consider(x, z, 0);
            }
        }
        if (!candidates.length) return false;
        candidates.sort((a, b) => b.score - a.score);
        const pick = candidates[0].position;

        const gs = state();
        const isFirst = gs && !gs.firstAttackDone;
        if (gs) gs.firstAttackDone = true;

        const demon = world.demon;
        demon.x = pick.x;
        demon.z = pick.z;
        demon.state = 'emerging';
        demon.timer = isFirst ? CONFIG.demonFirstTelegraph : CONFIG.demonTelegraph;
        demon.banishHold = 0;
        demon.speed = isFirst ? CONFIG.demonFirstSpeed : CONFIG.demonSpeedByPhase[phaseIndex(world.phase)];
        demon.opacity = 0;
        demon.mesh.visible = true;
        demon.mesh.position.set(demon.x, standOnFloor(demon, 0), demon.z);
        playSfx('laugh-audio', 0.9);
        playSfx('demon-danger-audio', 0.9);
        lightTheWay();
        syncDemonBanner();
        return true;
    }

    // "Hide in light" is only an instruction if the player can see where the light is.
    // The moment she spawns, the nearest unlit stand he could still reach (within
    // demonEmberRange, ahead of Jane's wall) wakes an ember: an emissive on that one
    // stand's own wax and its prewarmed ember sprite (models.js setCandleEmber), never
    // a light. It stays until she is banished, catches him, or the stand is lit.
    function lightTheWay() {
        clearEmber();
        const player = world.player;
        if (!player) return;
        const wallZ = world.wall && NW.Aura ? NW.Aura.wallZ() : Infinity;
        let best = null;
        let bestDistance = CONFIG.demonEmberRange;
        world.candles.forEach((candle) => {
            if (candle.lit) return;
            if (Number.isFinite(wallZ) && candle.z > wallZ && !candle.behindDoor) return;
            const distance = Math.hypot(candle.x - player.x, candle.z - player.z);
            if (distance >= bestDistance) return;
            bestDistance = distance;
            best = candle;
        });
        if (!best) return;
        best.ember = true;
        NW.Models.setCandleEmber(best.mesh, true);
        world.demon.ember = best;
    }

    function clearEmber() {
        const candle = world.demon && world.demon.ember;
        if (candle) {
            candle.ember = false;
            if (candle.mesh) NW.Models.setCandleEmber(candle.mesh, false);
            world.demon.ember = null;
        }
        // Every way the glint ends (banish, either catch, the stand lit, disposeLevel)
        // comes through here, so the label goes with it.
        syncEmberMarker();
    }

    // Where a world point lands on the canvas: -1..1 both ways, `behind` the eyes.
    function projectPoint(x, y, z) {
        if (!world.camera) return null;
        const v = new (THREE().Vector3)(x, y, z);
        const local = v.clone().applyMatrix4(world.camera.matrixWorldInverse);
        v.project(world.camera);
        return { x: v.x, y: v.y, behind: local.z > 0 };
    }

    // "LIGHT IT" over the glinting stand (#world-ember-marker): the ember alone was too
    // quiet to read as an instruction, so the same cue also rides the stand itself. An
    // HTML label in the 3D HUD, projected from a point just over that stand's flame
    // every frame (a transform, never a light). It shows only while that stand glints
    // and the player has control; behind the eyes it goes away, and off the sides it
    // clamps to the edge with an arrow so the stand can be found again.
    function syncEmberMarker() {
        const marker = byId('world-ember-marker');
        if (!marker) return;
        const hide = () => {
            marker.classList.remove('is-visible');
            marker.classList.remove('is-edge');
        };
        const candle = world.demon && world.demon.ember;
        if (!candle || !candle.mesh || candle.lit || !isDemonOut() || !canControl()
            || !document.body.classList.contains('world-active')) { hide(); return; }
        const point = projectPoint(candle.x, candle.mesh.position.y + CONFIG.emberMarkerHeight, candle.z);
        if (!point || point.behind) { hide(); return; }
        const hud = marker.parentElement;
        const width = hud ? hud.clientWidth : 0;
        const height = hud ? hud.clientHeight : 0;
        if (!width || !height) { hide(); return; }
        const x = ((point.x + 1) / 2) * width;
        const y = ((1 - point.y) / 2) * height;
        // Enough room for the label and the arrow beyond it at the edge.
        const padX = Math.min(150, width * 0.22);
        const padY = Math.min(80, height * 0.2);
        const cx = Math.max(padX, Math.min(width - padX, x));
        const cy = Math.max(padY, Math.min(height - padY, y));
        const edge = cx !== x || cy !== y;
        marker.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
        if (edge) {
            // The arrow points up at 0: turn it the way the stand went, and set it down
            // clear of the label — further out sideways than above or below it.
            const dx = x - cx;
            const dy = y - cy;
            const length = Math.hypot(dx, dy) || 1;
            marker.style.setProperty('--arrow', `${Math.atan2(dx, -dy).toFixed(3)}rad`);
            marker.style.setProperty('--ax', `${((dx / length) * 120).toFixed(1)}px`);
            marker.style.setProperty('--ay', `${((dy / length) * 58).toFixed(1)}px`);
        }
        marker.classList.toggle('is-edge', edge);
        marker.classList.add('is-visible');
    }

    // "Hide In Light" (#world-demon-banner): shown the moment she spawns, for as long as
    // she is out; gone when she is banished or catches the player. A class toggle only,
    // the entrance and pulse are CSS animations. Under it, the one thing to do right now:
    // "light it" while a stand is glinting (lightTheWay), "stay in the light" once he is
    // standing in a pool and updateBanish is counting.
    function syncDemonBanner() {
        const banner = byId('world-demon-banner');
        const out = document.body.classList.contains('world-active') && isDemonOut();
        if (banner) banner.classList.toggle('is-visible', out);
        const cue = byId('world-demon-cue');
        if (!cue) return;
        let text = '';
        if (out && world.player) {
            if (isInCandleLight(world.player.x, world.player.z)) text = t('world.hint_demon_hold');
            else if (world.demon.ember) text = t('world.demon_light_it');
        }
        setText(cue, text);
        cue.classList.toggle('is-visible', Boolean(text));
        syncEmberMarker();
    }

    // Candlelight is the only thing that sends her away: the player must stand in a lit
    // candle's range (candlePoolRadius) for demonBanishSeconds without stepping out.
    function isDemonOut() {
        return Boolean(world.demon && (world.demon.state === 'emerging' || world.demon.state === 'rushing'));
    }

    function updateBanish(dt) {
        const demon = world.demon;
        if (!isInCandleLight(world.player.x, world.player.z)) {
            demon.banishHold = 0;
            return;
        }
        demon.banishHold += dt;
        if (demon.banishHold < CONFIG.demonBanishSeconds) return;
        demon.banishHold = 0;
        demon.state = 'banished';
        demon.timer = 0.6;
        clearEmber();
        syncDemonBanner();
        const gs = state();
        if (gs && typeof window.bumpTheNunRunStat === 'function') window.bumpTheNunRunStat(gs, 'repelled');
    }

    function updateDemon(dt) {
        const demon = world.demon;
        let pace = 0;
        // Shaun: "in that room, the player is safe from the demon but not from the Nun."
        // The spike room is off the girls' 1 m grid, so she has nothing to spawn on or
        // path over in there anyway; this makes it a rule rather than an accident — while
        // he is inside, her clock stops, she never spawns, and one already out is sent
        // away instead of reaching across the pit. Jane's wall is untouched.
        if (NW.SpikeRoom && NW.SpikeRoom.holdsPlayer(world)) {
            if (isDemonOut()) {
                demon.state = 'idle';
                demon.mesh.visible = false;
                demon.opacity = 0;
                clearEmber();
                syncDemonBanner();
                scheduleDemon(false);
            }
            demon.banishHold = 0;
            return;
        }
        const facePlayer = () => {
            demon.mesh.rotation.y = Math.atan2(world.player.x - demon.x, world.player.z - demon.z);
        };

        if (isDemonOut()) updateBanish(dt);
        // The glint has done its job once that stand is alight (or she has gone).
        if (demon.ember && (demon.ember.lit || !isDemonOut())) clearEmber();

        switch (demon.state) {
            case 'idle':
                if (world.script && world.script.demonOff) return;   // the tutorial calls her itself
                demon.nextIn -= dt;
                // Due while the player stands in a lit candle's range: she waits until he
                // steps out of it.
                if (demon.nextIn <= 0 && !isInCandleLight(world.player.x, world.player.z) && !trySpawnDemon()) {
                    demon.nextIn = 3;
                }
                return;
            case 'emerging':
                demon.timer -= dt;
                demon.opacity = Math.min(1, demon.opacity + (dt * 1.5));
                facePlayer();
                pace = 0.15;
                if (demon.timer <= 0) demon.state = 'rushing';
                break;
            case 'banished':
                demon.timer -= dt;
                demon.opacity = Math.max(0, demon.timer / 0.6);
                demon.mesh.position.y += dt * 0.6;
                if (demon.timer <= 0) scheduleDemon(false);
                break;
            case 'rushing': {
                const heading = stepToward(demon, demon.speed, dt);
                if (heading) demon.mesh.rotation.y = heading;
                pace = demon.speed / 3.2;
                if (Math.hypot(world.player.x - demon.x, world.player.z - demon.z) < CONFIG.demonCatchDistance) {
                    demonCatches();
                    return;
                }
                break;
            }
            default:
                break;
        }

        if (demon.state !== 'banished') {
            demon.mesh.position.set(demon.x, standOnFloor(demon, dt), demon.z);
        }
        // She stays readable in the dark: the player must see her coming.
        const light = Math.max(0.45, lightAt(demon.x, demon.z));
        NW.Models.animateCharacter(demon.mesh, dt, pace, light, demon.opacity, false);
        const fallback = demon.mesh.userData.fallback;
        if (fallback && fallback.visible) {
            fallback.traverse((object) => {
                if (object.isMesh) {
                    object.material.transparent = demon.opacity < 1;
                    object.material.opacity = demon.opacity;
                }
            });
        }
    }

    function demonCatches() {
        const demon = world.demon;
        demon.state = 'idle';
        demon.mesh.visible = false;
        clearEmber();
        syncDemonBanner();
        // The tutorial never starts the power struggle: it only tells the player.
        if (world.script && typeof world.script.onDemonCatch === 'function') {
            world.script.onDemonCatch();
            return;
        }
        releaseLock();
        if (typeof window.startTheNunDirectCaughtAttack === 'function' && window.startTheNunDirectCaughtAttack()) {
            world.awaitingDemonScene = true;
        } else {
            scheduleDemon(false);
        }
    }

    // ------------------------------------------------------------ candles & light

    function burnSeconds() {
        return CONFIG.candleBurnByPhase[phaseIndex(world.phase)];
    }

    // A lit stand burns down (CONFIG.candleBurnByPhase, faster every vigil): `life` runs
    // from 1 (just lit) to 0, then it goes out and can be lit again (updateCandleHold).
    // It burns only while the vigil is played: update() stops for menus, scenes and the
    // tutorial's panels.
    function burnCandles(dt) {
        const seconds = burnSeconds();
        world.candles.forEach((candle) => {
            if (!candle.lit) return;
            // The spike room's platform stand is lit from the first frame and stays lit
            // (spikeRoom.js): burning out would leave the reward in the dark at the one
            // moment the player is out there to see it.
            if (candle.neverBurns) {
                candle.life = 1;
                return;
            }
            candle.life -= dt / seconds;
            if (candle.life > 0) return;
            candle.lit = false;
            candle.life = 0;
            candle.hold = 0;
            NW.Models.setCandleLit(candle.mesh, false);
        });
    }

    // Its flames' brightness (0..1) this frame: steady, but the last of a burn (glow
    // under 0.4, its last 16 %) sputters, in dips that deepen as it gutters out.
    function candleFlame(candle) {
        const glow = candleGlow(candle);
        if (!glow) return 0;
        const low = Math.max(0, 1 - (glow / 0.4));
        if (!low) return 1;
        const left = candle.life * burnSeconds();
        const wobble = 0.5 + (0.25 * (Math.sin(left * 23) + Math.sin((left * 37) + candle.x)));
        return 1 - (0.55 * low * wobble);
    }

    // Jane in the flames. A lit stand within CONFIG.janeFlickerRange of the real nun
    // (world.nun) dips and wavers on its own irregular beat, deeper the nearer she is,
    // and eases back smoothly once she has walked past — her position is readable from
    // the light alone, round a corner she cannot be seen from.
    //
    // Returns a 0.1..1 multiplier. It is VISUAL ONLY and composes multiplicatively: it
    // scales the flame brightness handed to models.js animateCandleStand (flame sprite
    // scale + halo opacity) and that stand's pool-light intensity, on top of the burn-down
    // (candleGlow/candleFlame) and before corridor.js's GUTTER dip, which multiplies the
    // same three values later in the frame. It never touches candleReach, so the gameplay
    // pool (Jane's slow, the Demoness's spawn and banish, "Stay in the light") does not
    // flicker, and it adds, removes or hides no light (prewarm()) — intensity is a uniform.
    function janeDip(candle, dt) {
        const nun = world.nun;
        const range = CONFIG.janeFlickerRange;
        let target = 0;
        if (candle.lit && range > 0 && nun && nun.mesh && nun.mesh.visible) {
            const gap = Math.hypot(nun.x - candle.x, nun.z - candle.z);
            target = Math.max(0, 1 - (gap / range));
            target *= 0.5 + (0.5 * target);        // her last couple of metres do most of it
        }
        const near = candle.janeNear == null ? target : candle.janeNear;
        // rises quickly as she comes on, eases off behind her (janeFlickerEase)
        const rate = CONFIG.janeFlickerEase * (target > near ? 3 : 1);
        candle.janeNear = near + ((target - near) * Math.min(1, Math.max(0, rate * dt)));
        if (candle.janeNear < 0.002) {
            candle.janeNear = 0;
            candle.janeFlickerT = 0;
            return 1;
        }
        candle.janeFlickerT = (candle.janeFlickerT || 0) + dt;
        const t = candle.janeFlickerT * CONFIG.janeFlickerSpeed;
        // three incommensurate beats, phase-shifted per stand: never a clean pulse
        const wave = (0.45 * Math.sin(t + candle.x))
            + (0.33 * Math.sin((t * 1.73) + candle.z))
            + (0.22 * Math.sin((t * 2.61) + candle.x + candle.z));
        return Math.max(0.1, 1 - (CONFIG.janeFlickerDepth * candle.janeNear * Math.max(0, wave)));
    }

    function updateLights(dt) {
        burnCandles(dt);
        world.candles.forEach((candle) => {
            candle.flame = candleFlame(candle);
            candle.janeDip = janeDip(candle, dt);
            NW.Models.animateCandleStand(candle.mesh, dt, candleGlow(candle), candle.flame * candle.janeDip);
        });
        const lit = world.candles.filter((candle) => candle.lit);
        lit.sort((a, b) => Math.hypot(a.x - world.player.x, a.z - world.player.z) - Math.hypot(b.x - world.player.x, b.z - world.player.z));
        world.poolLights.forEach((light, index) => {
            const candle = lit[index];
            if (candle) {
                // A fresh stand's warm pool; burning down, it shrinks and dims with the
                // stand's glow (as its gameplay pool, candleReach, does) and sputters
                // with its flames. Distance and intensity are uniforms: no shader change.
                const size = 0.3 + (0.7 * candleGlow(candle));
                light.position.set(candle.x, 1.8, candle.z);
                light.distance = POOL_LIGHT_RANGE * size;
                light.intensity = (2.2 + (Math.random() * 0.18)) * size * candle.flame * (candle.janeDip == null ? 1 : candle.janeDip);
            } else {
                light.intensity = 0;
            }
        });
        if (world.altar && world.altar.mesh) NW.Models.animateAltar(world.altar.mesh, dt);

        // A relic glows, in its true colours, whenever it can be taken (findTarget: close
        // and looked at), lit candle or not. Otherwise only a candle's pool shows its
        // colours — and, since item 3, a far fainter shimmer fades in with distance
        // (CONFIG.relicSightRange), so loot can be seen from across the nave and a route
        // chosen. It eases off again at arm's length, where the relic is plain to see and
        // the crosshair glow takes over: close up a full-strength sprite is a lamp, not a
        // glint.
        const revealed = world.target && world.target.type === 'relic' ? world.target.relic : null;
        const p = world.player;
        const far = CONFIG.relicSightRange;
        const span = Math.max(0.001, CONFIG.relicSightFade);
        const arm = CONFIG.relicPickRange;
        world.relics.forEach((relic) => {
            if (relic.taken) return;
            const away = Math.hypot(relic.x - p.x, relic.z - p.z);
            const close = 0.35 + (0.65 * Math.max(0, Math.min(1, (away - arm) / (arm * 1.5))));
            const sight = close * Math.max(0, Math.min(1, (far - away) / span));
            NW.Models.setRelicLit(relic.mesh, relic === revealed || isInCandleLight(relic.x, relic.z));
            NW.Models.animateRelic(relic.mesh, dt, relic === revealed, sight, CONFIG.relicSightOpacity);
        });
    }

    // ------------------------------------------------------------------ HUD

    function setText(element, text) {
        if (element && element.textContent !== text) element.textContent = text;
    }

    function updateHud(force) {
        const active = world.enabled && world.phase > 0 && typeof window.isGameplayViewVisible === 'function' && window.isGameplayViewVisible();
        document.body.classList.toggle('world-active', Boolean(active));
        syncDemonBanner();
        if (!active || !world.player) return;

        const lockHint = byId('world-lock-hint');
        // Only once the automatic re-lock was refused (a plain browser without a gesture).
        if (lockHint) lockHint.classList.toggle('is-visible', !world.locked && Boolean(world.lockDenied) && canControl());

        const hint = byId('world-hint');
        const target = world.target;
        let hintText = '';
        if (target && world.locked) {
            if (target.type === 'relic' && target.relic.reliquary) {
                hintText = t(target.relic.kind === 'cross' ? 'world.hint_reliquary_cross' : 'world.hint_reliquary_book', { count: target.relic.value });
            } else if (target.type === 'relic') hintText = t(target.relic.kind === 'cross' ? 'world.hint_cross' : 'world.hint_book');
            else if (target.type === 'candle') hintText = t('world.hint_candle');
            else if (target.type === 'high') hintText = t('world.hint_climb');
            else if (target.type === 'prone') hintText = t('world.hint_lie_down');
            else if (target.type === 'key') hintText = t('world.hint_key');
            else if (target.type === 'door') hintText = t(target.hasKey ? 'world.hint_door_open' : 'world.hint_door_locked');
        }
        // Ctrl refused to stand up: no head room here (under a table)
        if (!hintText && world.player.noRoom > 0 && world.locked) hintText = t('world.hint_no_room');
        // The Demoness is out: the banner's second line (syncDemonBanner) carries both
        // "light it" and "stay in the light", so the hint line stays out of its way.
        setText(hint, hintText);
        if (hint) hint.classList.toggle('is-visible', Boolean(hintText));

        // The Breath bar (#world-gauges, bottom right): gold during a Rush.
        const stamina = byId('world-stamina-fill');
        if (stamina) stamina.style.width = `${world.player.stamina.toFixed(1)}%`;
        const gauges = byId('world-gauges');
        if (gauges) gauges.classList.toggle('is-rush', world.player.rush > 0);

        const candleProgress = byId('world-crosshair');
        if (candleProgress) candleProgress.classList.toggle('is-target', Boolean(target));
        updateCandleRing();
        if (force) world.hudTimer = 0;
    }

    // The ring round the crosshair that fills while a candle is being lit (game.css
    // draws #world-crosshair::after from its `--hold`, 0..1). Run every frame by step()
    // (and by updateHud): on the HUD's 0.1 s tick alone it filled in ~9 % jumps. Only a
    // changed value is written (one custom property: a repaint of the ring, no layout)
    // and it is never eased, so a release or a new hold shows at once.
    function updateCandleRing() {
        const ring = byId('world-crosshair');
        if (!ring) return;
        const hold = world.holdingCandle ? world.holdingCandle.hold / CONFIG.candleHoldSeconds : 0;
        const value = Math.max(0, Math.min(1, hold)).toFixed(3);
        if (ring.style.getPropertyValue('--hold') !== value) ring.style.setProperty('--hold', value);
    }

    // ------------------------------------------------------------------ loop

    // Jane's aura (aura.js): the wall across the nave that takes whoever it holds. It may
    // shove the player ahead of it, so the eyes follow at once.
    function updateAura(dt) {
        if (!NW.Aura || !world.wall) return;
        if (world.caughtTriggered) {
            NW.Aura.reset();   // taken by the touch itself: no haze or vignette left over
            return;
        }
        world.auraShoved = false;
        const taken = NW.Aura.update(world, CONFIG, dt);
        if (world.auraShoved) placeCamera(0);
        if (taken && !world.caughtTriggered) nunCatches();
    }

    function update(dt) {
        const gs = state();
        if (!gs || !world.parsed || !world.player) return;

        // No control this frame (a catch, the altar, a scene, a menu, a tutorial panel):
        // update() stops below, before updateCandleHold, so a half-lit candle's ring, hint
        // and crackle would stay over the scene. Let go of it at once.
        if (world.awaitingDemonScene || world.frozen || !canControl()) {
            dropCandleHold();
            hushAudio(dt);   // the breathing and the heartbeat ease off, then stop
        }

        if (world.awaitingDemonScene) {
            if (gs.activeDemonAttack) return;
            world.awaitingDemonScene = false;
            scheduleDemon(false);
        }

        // A tutorial panel is explaining: nothing moves (its camera moves aside).
        if (world.frozen) {
            updateFrozen(dt);
            return;
        }

        if (!canControl()) return;

        updatePlayer(dt);
        refreshPlayerField(dt);
        world.target = findTarget();
        updateCandleHold(dt);
        updateNun(dt);
        updateAura(dt);
        updateBreath(dt);   // his own lungs (the Breath meter, worse at her wall)
        updateHeart(dt);    // and the heart under them (the gap to Jane)
        if (!world.caughtTriggered) updateDemon(dt);
        updateLights(dt);
        if (NW.Door) NW.Door.update(world, CONFIG, dt);   // the side door's swing, the key's glint
        if (NW.Corridor) NW.Corridor.update(world, playSfx, dt);   // the door open: the corridor joins the girls' grid (and its apparition laughs)
        // The spike room's pit (spikeRoom.js): feet on the spikes end the vigil the same
        // way Jane's wall does, once (it guards itself on world.caughtTriggered too).
        if (NW.SpikeRoom) NW.SpikeRoom.update(world, CONFIG, dt, nunCatches);
        updateZoneProgress();
        checkAltar();
        if (NW.AltarAura) NW.AltarAura.update(world, CONFIG, dt);
        updateBeacon(dt);
    }

    // While frozen, only the tutorial's camera moves: a turn toward what it shows
    // (`script.look`), and in its slow-motion shot of Jane (`script.slowNun`) she keeps
    // walking at a fraction of her pace, her wall with her.
    function updateFrozen(dt) {
        const script = world.script;
        if (!script || !world.player) return;
        const look = script.look;
        if (look && look.t < 1) {
            look.t = Math.min(1, look.t + (dt / look.seconds));
            const k = look.t < 0.5 ? 2 * look.t * look.t : 1 - (((-2 * look.t) + 2) ** 2) / 2;
            let turn = look.yaw - look.fromYaw;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            world.player.yaw = look.fromYaw + (turn * k);
            world.player.pitch = look.fromPitch + ((look.pitch - look.fromPitch) * k);
            placeCamera(0);
            world.needsDraw = true;
        }
        if (script.slowNun && world.nun) {
            const hold = script.holdNun;
            script.holdNun = false;
            updateNun(dt * script.slowNun);
            script.holdNun = hold;
            updateAura(dt * script.slowNun);
            world.needsDraw = true;
        }
        if (script.spot && world.poolLights.length) {
            const light = world.poolLights[world.poolLights.length - 1];
            light.position.set(script.spot.x, 1.8, script.spot.z);
            light.distance = POOL_LIGHT_RANGE;
            light.intensity = 2.4;
        }
        updateBeacon(dt);
        if (world.beacon && world.beacon.target) world.needsDraw = true;
    }

    // Only a world being played changes, so only then is it drawn: behind a power
    // struggle, a caught scene, the pause menu or an intro, redrawing the same frame at
    // full rate took the graphics card from the video playing over it (the scenes
    // lagged). A resize clears the canvas, so it earns one frame (`needsDraw`).
    function shouldRender() {
        return Boolean(
            world.renderer
            && world.parsed
            && typeof window.isGameplayViewVisible === 'function'
            && window.isGameplayViewVisible()
            && !isShown('altar-screen')
            && !(window.nunSystem && window.nunSystem.isPlayingNunCaughtScene)
            && (canControl() || world.needsDraw)
        );
    }

    function frame(now) {
        world.rafId = 0;
        if (!world.running) return;

        const visible = typeof window.isGameplayViewVisible === 'function' && window.isGameplayViewVisible();
        if (!visible) {
            stopLoop();
            return;
        }

        const deltaMs = now - world.lastTime;
        const dt = Math.min(0.05, Math.max(0, deltaMs / 1000));
        world.lastTime = now;
        const started = performance.now();
        if (step(dt)) trackFrame(deltaMs, performance.now() - started);
        world.rafId = window.requestAnimationFrame(frame);
    }

    // Returns whether the world was drawn.
    function step(dt) {
        update(dt);
        autoRelock(dt);
        world.hudTimer -= dt;
        if (world.hudTimer <= 0) {
            world.hudTimer = 0.1;
            updateHud(false);
        }
        updateCandleRing();   // every frame, not on the HUD tick: the ring fills smoothly
        syncEmberMarker();    // and the "LIGHT IT" label, which tracks the camera
        if (shouldRender()) {
            world.needsDraw = false;
            world.renderer.render(world.scene, world.camera);
            return true;
        }
        return false;
    }

    function startLoop() {
        if (world.running) return;
        world.running = true;
        world.lastTime = performance.now();
        world.rafId = window.requestAnimationFrame(frame);
    }

    function stopLoop() {
        world.running = false;
        if (world.rafId) window.cancelAnimationFrame(world.rafId);
        world.rafId = 0;
        releaseLock();
        const fire = byId('fire-audio');
        if (fire && !fire.paused) fire.pause();
        document.body.classList.remove('world-active');
    }

    // ------------------------------------------------------------------ API

    function init() {
        world.enabled = supportsWebGL();
        window.THE_NUN_3D_MODE = world.enabled;
        document.body.classList.toggle('mode-3d', world.enabled);
        // Start pulling the cathedral in behind the title screen. Until it is here,
        // and if it never arrives, the built-in tile levels are used instead.
        if (world.enabled && NW.Cathedral) {
            NW.Cathedral.load();
        }
        // Jane (the Nun) and Lilith (the Demoness) as 3D models; sprites until they land.
        if (world.enabled && NW.Characters) {
            NW.Characters.loadAll();
        }
        // The portal Jane walks out of (a plain ring until its model lands).
        if (world.enabled && NW.Portal) {
            NW.Portal.load();
        }
    }

    window.theNun3D = {
        isEnabled: () => world.enabled,
        // The player is in the 3D world and can act (dev-actions.js keeps Ctrl+Shift+D,
        // crouch-running right, from opening the dev panel then).
        hasControl: () => canControl() && !window.isPauseMenuOpen,
        prepareVigil,
        beginVigil,
        stop: stopLoop,
        getNunProximity() {
            if (!world.enabled || !world.nun || world.nun.state !== 'hunting' || !(canControl() || world.frozen)) return null;
            return world.nun.proximity;
        },
        // How near her footsteps are: 0 at nunStepsRange metres from her (and beyond),
        // 1 from nunStepsFullRange inward. ONE curve, nunSteps.js's own — her steps are
        // played there now, off her gait, so nothing may grow a second opinion of it.
        // null whenever getNunProximity is (not hunting, a scene, a menu).
        getNunStepsCloseness() {
            if (!world.enabled || !world.nun || world.nun.state !== 'hunting' || !canControl()) return null;
            if (!NW.NunSteps) return null;
            const distance = Math.hypot(world.player.x - world.nun.x, world.player.z - world.nun.z);
            return NW.NunSteps.closeness(distance, CONFIG);
        },
        // Is the player's own out-of-breath breathing sounding right now (updateBreath)?
        // runFlow.js's proximity breathing stands down while it is, so the two never
        // pant over each other.
        isBreathing() {
            return world.enabled && breath.level > 0.02;
        },
        // The point of no return, in the breath meter's own units. "Path distance to
        // the altar / sprintSpeed" against "the seconds the wall still needs to reach
        // the altar": tick is the meter reading at the moment those two are equal (so
        // the mark slides left as the player goes deeper), past is true once the fill
        // has passed it. wallAhead is the metres of nave still behind him.
        // tick is null while it would fall off the right-hand end of the bar — she
        // reaches him before the altar ever runs out, so there is nothing to mark and
        // the nave stays uncluttered; it appears when the choice is real (deep in the
        // corridor, or far from the altar in a late vigil).
        // null whenever the meter itself is (no wall, not hunting, a scene, a menu).
        getAltarRunout() {
            if (!world.enabled || !world.wall || !world.altar || !world.parsed || !world.nun) return null;
            if (!(canControl() || world.frozen)) return null;
            const wall = NW.Aura ? NW.Aura.wallZ() : Infinity;
            if (!Number.isFinite(wall)) return null;
            const grid = world.parsed.grid;
            // Opening the side door re-reads the grid (corridor.js link), and the
            // corridor is exactly where this number bites: walk the field again.
            if (world.altarFieldGrid !== grid && world.parsed.spots && world.parsed.spots.altar) {
                const cellAltar = world.parsed.spots.altar;
                world.altarField = grid.distanceField(cellAltar.x, cellAltar.z);
                world.altarFieldGrid = grid;
                if (world.altarGoal) world.altarGoal.field = world.altarField;
            }
            const cell = grid.toCell(world.player.x, world.player.z);
            const steps = world.altarField ? world.altarField[(cell.z * grid.width) + cell.x] : -1;
            if (!(steps >= 0)) return null;
            const pace = world.nun.pace == null ? world.nun.speed : world.nun.pace;
            const run = (steps * grid.cellSize) / CONFIG.sprintSpeed;
            const wallAtNoReturn = world.altar.z + (Math.max(0.05, pace) * run);
            const gap = wallAtNoReturn - CONFIG.radius - world.player.z;
            const tick = 1 - (gap / CONFIG.nunMeterRange);
            return {
                tick: tick >= 1 ? null : Math.max(0, tick),
                past: wall <= wallAtNoReturn,
                wallAhead: wall - world.player.z
            };
        },
        // The tutorial's hooks (scripts/tutorial.js): a sandbox vigil's overrides, the
        // freeze, the beacon, a scripted Demoness and a read-out of the world.
        tutorial: {
            // { holdNun, nunSpeedScale, demonOff, altarLocked, onNunCatch, onDemonCatch }
            setScript(script) {
                world.script = script || null;
                if (!script) {
                    world.frozen = false;
                    setBeacon(null);
                }
            },
            freeze(on) {
                const next = Boolean(on);
                if (world.frozen === next) return;
                world.frozen = next;
                if (next) {
                    releaseLock();
                    Object.keys(world.keys).forEach((key) => { world.keys[key] = false; });
                    world.mouseDown = false;
                    const fire = byId('fire-audio');
                    if (fire && !fire.paused) fire.pause();
                    world.needsDraw = true;
                } else if (world.script) {
                    world.script.look = null;
                    world.script.slowNun = 0;
                    world.script.spot = null;
                }
            },
            isFrozen: () => world.frozen,
            // Turn the view toward a point over `seconds` (while frozen).
            lookAt(x, y, z, seconds) {
                if (!world.player || !world.script || !world.camera) return;
                const eye = world.camera.position;
                world.script.look = {
                    t: 0,
                    seconds: Math.max(0.05, seconds || 1),
                    fromYaw: world.player.yaw,
                    fromPitch: world.player.pitch,
                    yaw: Math.atan2(-(x - eye.x), -(z - eye.z)),
                    pitch: Math.atan2(y - eye.y, Math.hypot(x - eye.x, z - eye.z))
                };
            },
            setBeacon,
            spawnDemon(speed) {
                if (!world.parsed || !world.demon || isDemonOut()) return false;
                refreshPlayerField(1);
                if (!world.playerField || !trySpawnDemon()) return false;
                if (speed) world.demon.speed = speed;
                return true;
            },
            // Carry the player `cells` metres down the path to the altar (a gentle catch).
            nudgeAhead(cells) {
                const grid = world.parsed && world.parsed.grid;
                if (!grid || !world.player) return;
                let cell = grid.toCell(world.player.x, world.player.z);
                for (let i = 0; i < (cells || 6); i += 1) {
                    const value = world.altarField[(cell.z * grid.width) + cell.x];
                    let next = null;
                    let best = value < 0 ? Infinity : value;
                    [[0, -1], [1, 0], [-1, 0], [0, 1]].forEach(([dx, dz]) => {
                        const x = cell.x + dx;
                        const z = cell.z + dz;
                        if (x < 0 || z < 0 || x >= grid.width || z >= grid.height) return;
                        const v = world.altarField[(z * grid.width) + x];
                        if (v >= 0 && v < best) { best = v; next = { x, z }; }
                    });
                    if (!next) break;
                    cell = next;
                }
                const spot = grid.toWorld(cell.x, cell.z);
                world.player.x = spot.x;
                world.player.z = spot.z;
                NW.Parkour.reset(world, CONFIG);
                placeCamera(0);
            },
            // Where a world point lands on the canvas: -1..1 both ways, `behind` the eyes.
            project(x, y, z) {
                return projectPoint(x, y, z);
            },
            info() {
                if (!world.player || !world.parsed) return null;
                const p = world.player;
                const demon = world.demon;
                return {
                    player: {
                        x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
                        stance: p.stance || 0, grounded: Boolean(p.grounded), vy: p.vy || 0,
                        speed: Math.hypot(p.vx || 0, p.vz || 0), slide: p.slide || 0, rush: p.rush || 0,
                        climbing: Boolean(p.climb && p.climb.active), stamina: p.stamina
                    },
                    eye: world.camera ? { x: world.camera.position.x, y: world.camera.position.y, z: world.camera.position.z } : null,
                    nun: world.nun ? { x: world.nun.x, z: world.nun.z, y: world.nun.mesh.position.y } : null,
                    demon: demon ? { state: demon.state, x: demon.x, z: demon.z, y: demon.mesh.position.y } : null,
                    inLight: isInCandleLight(p.x, p.z),
                    // life: burn left (1..0), reach: its pool's radius now (0 when out)
                    candles: world.candles.map((c, i) => ({
                        i, x: c.x, z: c.z, y: c.mesh.position.y, lit: Boolean(c.lit), life: c.lit ? c.life : 0, reach: candleReach(c),
                        behindDoor: Boolean(c.behindDoor)   // in the corridor behind the side door (corridor.js)
                    })),
                    relics: world.relics.map((r, i) => ({
                        i, x: r.x, y: r.y != null ? r.y : r.mesh.position.y, z: r.z, kind: r.kind, taken: Boolean(r.taken),
                        spot: r.spot || null,   // its id in the run's takenSpots
                        reliquary: Boolean(r.reliquary), hidden: Boolean(r.hidden), value: r.value || 1,
                        behindDoor: Boolean(r.behindDoor)
                    })),
                    hideouts: (world.hideouts || []).map((h) => ({ x: h.x, z: h.z })),
                    altar: world.altar ? { x: world.altar.x, z: world.altar.z } : null,
                    wallZ: world.wall && NW.Aura ? NW.Aura.wallZ() : null,
                    locked: world.locked
                };
            }
        },
        // Test hooks: advance the simulation by hand (the preview pane has no rAF).
        debug: {
            world,
            config: CONFIG,
            step(dt, count) {
                for (let i = 0; i < (count || 1); i += 1) step(dt || 1 / 60);
            },
            render() {
                if (world.renderer && world.parsed) world.renderer.render(world.scene, world.camera);
            },
            // The adaptive render scale: read it, or `locked = true` to hold it;
            // frameTime(ms, busyMs) feeds it a drawn frame as the loop would.
            resolution,
            frameTime: trackFrame,
            // Try lighting values live (exposure, ambient, lightmap, fog) before
            // they are written into the vigil themes.
            tune(values) {
                const options = values || {};
                if (options.exposure != null) world.renderer.toneMappingExposure = options.exposure;
                if (options.toneMapping != null) world.renderer.toneMapping = options.toneMapping;
                if (options.ambient != null && world.ambient) world.ambient.intensity = options.ambient;
                if (options.ambientColor != null && world.ambient) world.ambient.color.setHex(options.ambientColor);
                if (options.fill != null && world.skyFill) world.skyFill.intensity = options.fill;
                // the night vision's range / intensity in metres / raw units (CONFIG.nightVision*)
                if (options.nightVisionRange != null) world.nightVision.distance = options.nightVisionRange;
                if (options.nightVisionIntensity != null) world.nightVision.intensity = options.nightVisionIntensity;
                if (options.bakedLight != null && NW.Cathedral) {
                    NW.Cathedral.applyMood({ bakedLight: options.bakedLight });
                }
                if (options.fogDensity != null && world.scene.fog) world.scene.fog.density = options.fogDensity;
                if (options.fogColor != null && world.scene.fog) {
                    world.scene.fog.color.setHex(options.fogColor);
                    world.scene.background.setHex(options.fogColor);
                }
                return {
                    exposure: world.renderer.toneMappingExposure,
                    ambient: world.ambient && world.ambient.intensity,
                    fogDensity: world.scene.fog && world.scene.fog.density
                };
            },
            // What the breathing and the heartbeat are doing right now (tests).
            audio() {
                const el = breath.playing;
                return {
                    gap: dangerGap(),
                    stamina: world.player ? world.player.stamina : null,
                    breath: {
                        level: breath.level,
                        volume: el ? el.volume : 0,
                        playing: el ? el.id : null,
                        starts: breath.starts
                    },
                    heart: {
                        level: heart.level,
                        bpm: heart.level < 0.01 ? 0 : heart.bpm,
                        gain: CONFIG.heartVolume * heart.level * sfxSetting(),
                        beats: heart.beats,
                        ctx: heart.ctx ? heart.ctx.state : null
                    }
                };
            },
            // Jane's feet: the footfall phases measured off her walk clip, and every
            // step played since the vigil began (world3d/nunSteps.js).
            nunSteps() {
                return NW.NunSteps ? NW.NunSteps.state() : null;
            },
            teleport(x, z, yaw) {
                if (!world.player) return;
                world.player.x = x;
                world.player.z = z;
                if (yaw != null) world.player.yaw = yaw;
                placeCamera(0);
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
