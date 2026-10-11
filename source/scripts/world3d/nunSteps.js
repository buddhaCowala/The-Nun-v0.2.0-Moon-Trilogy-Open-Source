/**
 * The Nun 3D — Jane's footsteps, on her own feet.
 *
 * Shaun: "the footsteps of the nun must match the pace of the nun walking. you just hear
 * them when she is close enough and louder and louder as she approach."
 *
 * So a step is not a metronome any more (runFlow.js used to tick one out every 1.1 s down
 * to 0.38 s off a proximity number, out of the PLAYER's walking.mp3). Every hit here is
 * fired by her gait itself:
 *
 *   - Her walk clip plays at `speed / CONFIG.nunWalkNatural` (world.js nunPace), so the
 *     clip's time IS her ground speed — the vigil's pace, and the half-speed crawl a lit
 *     candle's pool costs her, both come out of it for free.
 *   - The two footfalls of that cycle are MEASURED off the clip once, not guessed: both
 *     ankles are sampled through the cycle and the moment each foot drops onto the floor
 *     (its height crossing down through the low tenth of its travel) is the footfall.
 *   - Each frame the action's phase is read; crossing a footfall phase plays one step.
 *
 * Fallback for the old sprite Nun (no clip): one step every `CONFIG.nunStepStride` metres
 * of ground travel, which is the same rule written in distance instead of clip time.
 *
 * The clips are single steps cut out of `assets/sounds/nunwalks.mp3` (the loop this
 * replaces) with ffmpeg, round-robin over four <audio> elements so one hit never has to
 * cut off the one before it. Silent past `CONFIG.nunStepsRange`, smoothly up to full at
 * `CONFIG.nunStepsFullRange`, scaled by the sfx slider (world.js playSfx), and nothing at
 * all while `!canControl()`.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    const STEP_IDS = ['nun-step-1', 'nun-step-2', 'nun-step-3', 'nun-step-4'];
    // MHX ankle bones of Shaun's Genesis 9 export (characters.js: nun.glb). Blender
    // names them `foot.L` / `foot.R`; GLTFLoader strips the dot, so match both.
    const FOOT_BONES = /^foot[._]?[LR]$/i;
    // Where in a foot's own height range it counts as down on the floor.
    const PLANT_LEVEL = 0.12;
    const SAMPLES = 144;          // poses sampled across the cycle when measuring
    const LOG_CAP = 400;

    const steps = {
        clock: 0,          // seconds of gameplay, advanced by update (never wall-clock:
        //                    a harness steps faster than real time)
        phase: null,       // her clip's phase last frame, 0..1
        phases: null,      // the measured footfall phases of the cycle, 0..1
        duration: 0,       // the clip's length in seconds
        source: null,      // 'clip' (measured off her gait) or 'stride' (sprite fallback)
        clip: null,        // the clip the phases were measured on
        distance: 0,       // metres walked since the last stride-fallback step
        index: 0,          // round-robin over STEP_IDS
        lastAt: -99,
        hits: [],          // {t, phase, foot, distance, closeness, volume, rate} (tests)
        count: 0
    };

    // ------------------------------------------------------------ the gait

    // Her two footfalls, measured off the walk clip itself. Both ankles are followed
    // through one cycle; a foot is "down" while its height sits in the bottom
    // PLANT_LEVEL of its own travel, and the footfall is where it crosses in.
    // Returns the phases sorted, or null when there is no clip to read (sprite Nun).
    function measurePhases(character) {
        const THREEjs = window.THREE;
        if (!THREEjs || !character || !character.action || !character.model) return null;
        const action = character.action;
        const clip = action.getClip && action.getClip();
        const duration = clip ? clip.duration : 0;
        if (!(duration > 0)) return null;

        const feet = [];
        character.model.traverse((object) => {
            if (FOOT_BONES.test(object.name || '')) feet.push(object);
        });
        if (feet.length < 2) return null;

        // Sampling moves the action; put it back where it was (characters.js measure()).
        const start = action.time;
        const scale = action.timeScale;
        action.timeScale = 0;
        const point = new THREEjs.Vector3();
        const heights = feet.map(() => new Array(SAMPLES));
        for (let i = 0; i < SAMPLES; i += 1) {
            action.time = (i / SAMPLES) * duration;
            character.mixer.update(0);
            character.model.updateMatrixWorld(true);
            feet.forEach((bone, f) => {
                point.setFromMatrixPosition(bone.matrixWorld);
                heights[f][i] = point.y;
            });
        }
        action.time = start;
        action.timeScale = scale;
        character.mixer.update(0);

        const phases = [];
        heights.forEach((track) => {
            let low = Infinity;
            let high = -Infinity;
            track.forEach((y) => { low = Math.min(low, y); high = Math.max(high, y); });
            const travel = high - low;
            if (!(travel > 1e-5)) return;
            const floor = low + (travel * PLANT_LEVEL);
            // The steepest fall through the floor line in the cycle: heel down.
            let best = null;
            for (let i = 0; i < SAMPLES; i += 1) {
                const a = track[i];
                const b = track[(i + 1) % SAMPLES];
                if (!(a > floor && b <= floor)) continue;
                const drop = a - b;
                if (best && drop <= best.drop) continue;
                const frac = drop > 1e-9 ? (a - floor) / drop : 0;
                best = { drop, phase: ((i + frac) % SAMPLES) / SAMPLES };
            }
            if (best) phases.push(best.phase);
        });
        if (!phases.length) return null;
        phases.sort((a, b) => a - b);
        return { phases, duration };
    }

    // The character behind her mesh: the real Daz model (models.js userData.character),
    // or nothing at all when the sprite fallback is drawing her.
    function characterOf(nun) {
        const data = nun && nun.mesh && nun.mesh.userData;
        return (data && data.character) || null;
    }

    function ensureGait(nun, CONFIG) {
        const character = characterOf(nun);
        const clip = character && character.action ? character.action.getClip() : null;
        if (clip && steps.clip === clip && steps.phases) return character;
        if (!clip) {
            if (steps.source !== 'stride') {
                steps.source = 'stride';
                steps.clip = null;
                steps.phases = null;
                steps.duration = 0;
            }
            return null;
        }
        const measured = measurePhases(character);
        steps.clip = clip;
        if (measured) {
            steps.phases = measured.phases.map((p) => (p + CONFIG.nunStepPhase + 1) % 1).sort((a, b) => a - b);
            steps.duration = measured.duration;
            steps.source = 'clip';
        } else {
            // A clip we cannot read: two footfalls half a cycle apart is still her pace.
            steps.phases = [CONFIG.nunStepPhase % 1, (CONFIG.nunStepPhase + 0.5) % 1].sort((a, b) => a - b);
            steps.duration = clip.duration;
            steps.source = 'clip-assumed';
        }
        steps.phase = null;
        return character;
    }

    // ------------------------------------------------------------ how loud

    // 0 at nunStepsRange metres and beyond (silence, nothing plays), 1 from
    // nunStepsFullRange inward, smoothstepped between so they never pop in at the edge.
    function closeness(distance, CONFIG) {
        const far = CONFIG.nunStepsRange;
        const near = CONFIG.nunStepsFullRange;
        if (!(distance < far)) return 0;
        const t = Math.max(0, Math.min(1, (far - distance) / Math.max(0.1, far - near)));
        return t * t * (3 - (2 * t));
    }

    function fire(nun, CONFIG, playSfx, distance, near, phase, foot) {
        if (steps.clock - steps.lastAt < CONFIG.nunStepMinGap) return;
        steps.lastAt = steps.clock;
        steps.index = (steps.index + 1) % STEP_IDS.length;
        const volume = CONFIG.nunStepsVolume * near;
        // A slow-motion walk lands heavier: pitch the hit with her pace, gently.
        const pace = nun.pace == null ? nun.speed : nun.pace;
        const rate = Math.max(0.8, Math.min(1.2, 1 + (CONFIG.nunStepPitch * ((pace / CONFIG.nunWalkNatural) - 1))));
        playSfx(STEP_IDS[steps.index], volume, rate);
        steps.count += 1;
        steps.hits.push({
            t: +steps.clock.toFixed(4),
            phase: +phase.toFixed(4),
            foot,
            distance: +distance.toFixed(3),
            closeness: +near.toFixed(4),
            volume: +volume.toFixed(4),
            rate: +rate.toFixed(3),
            id: STEP_IDS[steps.index]
        });
        if (steps.hits.length > LOG_CAP) steps.hits.splice(0, steps.hits.length - LOG_CAP);
    }

    // ------------------------------------------------------------ per frame
    //
    // Called from world.js updateNun, after her clip has been advanced for this frame.
    // `audible` is canControl(): while it is false the gait is still followed (so the
    // first step back is on a real footfall, not a burst) but nothing is played.
    function update(world, CONFIG, dt, playSfx, audible) {
        const nun = world && world.nun;
        if (!nun || nun.state !== 'hunting') { steps.phase = null; return; }
        steps.clock += Math.max(0, dt || 0);
        const character = ensureGait(nun, CONFIG);

        const distance = Math.hypot(world.player.x - nun.x, world.player.z - nun.z);
        const near = closeness(distance, CONFIG);
        const speaks = Boolean(audible) && near > 0 && typeof playSfx === 'function';

        // --- the sprite Nun: one step every nunStepStride metres of ground travel
        if (!character || !steps.phases) {
            const pace = nun.pace == null ? nun.speed : nun.pace;
            steps.distance += Math.max(0, pace) * Math.max(0, dt || 0);
            const stride = Math.max(0.05, CONFIG.nunStepStride);
            while (steps.distance >= stride) {
                steps.distance -= stride;
                if (speaks) fire(nun, CONFIG, playSfx, distance, near, 0, 'stride');
            }
            return;
        }

        // --- her real gait: the clip's phase crossing a measured footfall
        const duration = steps.duration || 1;
        const time = character.action.time;
        const phase = ((time / duration) % 1 + 1) % 1;
        const previous = steps.phase;
        steps.phase = phase;
        if (previous == null) return;
        // How far the cycle turned this frame (it wraps past 1).
        const advance = ((phase - previous) % 1 + 1) % 1;
        if (!(advance > 0) || advance >= 1) return;
        steps.phases.forEach((target, foot) => {
            const reach = ((target - previous) % 1 + 1) % 1;
            // reach === 0 means `previous` sat exactly on it: it fired last frame.
            if (reach > 0 && reach <= advance && speaks) {
                fire(nun, CONFIG, playSfx, distance, near, target, foot === 0 ? 'A' : 'B');
            }
        });
    }

    // A vigil starts, or the world stops: forget the cycle and the pending stride so
    // the next vigil's first step is hers and not a leftover.
    function reset() {
        steps.phase = null;
        steps.distance = 0;
        steps.lastAt = -99;
        steps.clock = 0;
        steps.hits.length = 0;
        steps.count = 0;
        // (the measured phases belong to the clip, not the vigil: they are kept)
    }

    // What the feet are doing right now (tests read this through theNun3D.debug).
    function state() {
        return {
            source: steps.source,
            phases: steps.phases ? steps.phases.slice() : null,
            duration: steps.duration,
            clock: steps.clock,
            phase: steps.phase,
            count: steps.count,
            hits: steps.hits.slice()
        };
    }

    NW.NunSteps = { update, reset, closeness, state, STEP_IDS };
})();
