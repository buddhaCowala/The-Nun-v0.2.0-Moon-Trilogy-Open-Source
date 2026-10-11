/**
 * The Nun 3D — the apparition at the end of the side corridor (Shaun's horror pass).
 *
 * Shaun: "Something in the corridor. But it shouldn't be there on every vigil. Let's say
 * 50/50 odds. The player opens the door and sees a silhouette (can be Jane) at the very
 * end of the corridor, holding a candle. She stays there until the player arrives to the
 * first candle of the corridor. At this moment, she vanishes followed by a woman horror
 * laugh." Then, on the first pass: "Jane is completely white for some reason. I want the
 * REAL Jane character with a bright candle in her hands."
 *
 *   - Odds: one roll per build (rollNow, a fair coin).
 *   - She is Jane's own figure (models.js makeCharacter('nun'), assets/world3d/nun.glb),
 *     a second copy with its own skeleton, dressed for the vigil like the real one and
 *     frozen on one standing pose of her gait (the pose whose feet are closest together),
 *     never animated again: no mixer update, no pathing, no collider, nothing in
 *     world.nun / world.relics / world.candles. She cannot catch anybody.
 *   - Her look is the real Jane's, untouched. The ONE thing changed is the fog flag: the
 *     corridor's FogExp2 (0.07-0.09) is total past ~20 m and she stands 53 m from the
 *     door, so with fog on she is not dim, she is simply gone. characters.js shares one
 *     set of materials between every copy, so hers are cloned first (painting the
 *     originals would repaint the walking Jane) and the clones only get fog = false —
 *     same maps, same colours, same shading.
 *   - What makes her readable is LIGHT, not paint: a warm point light at her candle's
 *     flame (LIGHT), so she is a lit figure at the end of a black corridor. It is the
 *     corridor's ONE extra light and it obeys world.js prewarm(): it is created for
 *     EVERY vigil at level build, whether she was rolled or not, it is never added,
 *     removed, re-parented or hidden, and it lives in the corridor's root rather than
 *     under her (a light under an invisible parent is dropped from the render, which
 *     would change the light count and recompile every shader). Only its intensity ever
 *     moves: 0 until the door opens, LIGHT.intensity while she stands there, 0 for good
 *     when she goes.
 *   - Her candle is the game's own wax (models.js material('wax')) with the game's own
 *     flame and halo glow sprites (models.js glowSprite: additive, fog-free, like every
 *     flame in the game), held in her hand bone.
 *   - Shaun, after seeing her stand there: "make Jane of the corridor run very fast
 *     towards the player." The frame the player is inside the corridor (RUN.entry past
 *     its back face) she charges straight down the centre line at RUN.speed m/s — half
 *     again a sprint, so there is no outrunning her — on her one baked gait clip run at
 *     RUN.gait, leaning into it, her candle's light moving with her (a light's position
 *     is a uniform; only adding, removing or hiding one costs a recompile). She has no
 *     collider and no reach: she cannot touch the player, and the first stand always
 *     takes her before she gets there.
 *   - She goes when EITHER of them reaches the corridor's first candle stand (its x, or
 *     within GO.near metres of it): visible = false and the light to 0 in that frame,
 *     and assets/sounds/laugh.mp3 (the Demoness's laugh, the clip her spawn uses)
 *     through world.js playSfx at GO.volume. Once per vigil.
 *
 * Built and driven by corridor.js (build/update), which owns the corridor's own state.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // Where she stands: x (just in front of the dead end's reliquary shelf, which is the
    // last 0.5 m of the corridor, so she never blocks it), how far off the corridor's
    // centre line, and which way she faces (-x, back down the corridor at the door).
    const SPOT = { x: 74, off: 0.1, yaw: -Math.PI / 2 };

    // How many poses of her gait are tried to find the one that reads as standing.
    const LOOK = { poses: 32 };

    // The candle in her hand: the wax stub, the game's flame and halo glow sprites, and
    // where the hand is when no hand bone is found (metres, in her own frame).
    const CANDLE = {
        colour: 'rgba(255,186,110,0.98)', size: 0.55, halo: 'rgba(255,150,60,0.5)', haloSize: 1.7,
        wax: { r: 0.028, h: 0.2 }, fallback: { x: 0.26, y: 1.02, z: 0.16 }
    };

    // Her candle's light: the corridor's one extra light, built every vigil and only ever
    // dimmed to 0. Warmer, shorter and a touch stronger than a stand's pool light
    // (world.js: 0xffa24a, intensity ~2.2, range 9, decay 1.7) — it has to reach her face
    // and nothing else, so what the player sees at the far end is her, not the stone.
    // `rise` lifts it off the flame: she holds the candle at her hip, and a source down
    // there lights her skirt and leaves her face black; half a metre up is still her own
    // candle at 53 m and it puts the light on her body and face. Measured from the
    // doorway: 3 is a smudge, 25 and 60 are the same picture, 10 is the figure.
    const LIGHT = { colour: 0xffb472, intensity: 13, range: 5.2, decay: 1.4, rise: 0.45, flicker: 0.12 };

    // The charge (Shaun: "make Jane of the corridor run very fast towards the player").
    // She launches the moment the player is `entry` metres past the corridor's back face,
    // i.e. actually inside and committed, and comes straight down the centre line at
    // `speed` m/s — half again the player's sprint, so there is no outrunning her, only
    // the stand. `gait` is her one baked clip's timeScale (nun.glb has no run cycle) and
    // `lean` tips her into it.
    const RUN = { entry: 0.4, speed: 10, gait: 3.2, lean: 0.14 };

    // When she goes: whoever reaches the corridor's first candle stand first — she, or
    // the player within `near` metres of it — and the laugh's volume through playSfx
    // (0.9 is the Demoness's spawn laugh; hers is a hair under it — a scare, not a slap).
    const GO = { near: 1.5, sfx: 'laugh-audio', volume: 0.85 };

    const state = {
        root: null, holder: null, character: null, light: null, flame: null,
        here: false, shown: false, gone: false, trigger: null, phase: 0, t: 0,
        charging: false, entry: null, lightDx: 0, why: null, ran: 0
    };

    function T() {
        return window.THREE;
    }

    // The headless harness forces the roll both ways (null = play it straight).
    let forced = null;
    function force(value) {
        forced = value == null ? null : Boolean(value);
    }

    // The one roll: is she in this vigil at all? A fair coin at every build (Shaun: 50/50).
    // It was seeded on the vigil number alone, which gave every run the same answer
    // (never in vigil 1). Rolled once per build and kept, so info() reports that build.
    let lastRoll = { phase: null, value: false };
    function rolls(phase) {
        if (forced != null) return forced;
        return lastRoll.phase === phase ? lastRoll.value : false;
    }
    function rollNow(phase) {
        lastRoll = { phase, value: Math.random() < 0.5 };
        return rolls(phase);
    }

    // Her gait walks; she stands. The pose whose feet are closest together, measured on
    // her own foot bones, is the one that reads as standing still.
    function stand(character) {
        const action = character.action;
        if (!action) return;
        const clip = action.getClip();
        const bones = [];
        character.model.traverse((object) => {
            if (object.isBone && /foot|toe/i.test(object.name || '')) bones.push(object);
        });
        const left = bones.find((b) => /l_|left|\.l$|_l$/i.test(b.name));
        const right = bones.find((b) => b !== left && /r_|right|\.r$|_r$/i.test(b.name));
        let best = 0;
        if (left && right && clip.duration > 0) {
            const a = new (T().Vector3)();
            const b = new (T().Vector3)();
            let closest = Infinity;
            for (let i = 0; i < LOOK.poses; i += 1) {
                action.time = (i / LOOK.poses) * clip.duration;
                character.mixer.update(0);
                character.holder.updateMatrixWorld(true);
                a.setFromMatrixPosition(left.matrixWorld);
                b.setFromMatrixPosition(right.matrixWorld);
                const gap = Math.hypot(a.x - b.x, a.z - b.z);
                if (gap < closest) {
                    closest = gap;
                    best = action.time;
                }
            }
        }
        action.time = best;
        character.mixer.update(0);
        action.paused = true;
        action.timeScale = 0;
    }

    /**
     * Her look is the real Jane's; only the fog flag moves. characters.js shares one set
     * of materials between every copy of a figure, so hers are cloned first — setting
     * fog = false on the originals would un-fog the walking Jane too. Nothing else is
     * touched: same maps, same colours, same roughness, so the candle lights her exactly
     * as the nave's candles light the real one.
     */
    function unfog(character) {
        const swapped = new Map();
        character.model.traverse((object) => {
            if (!object.isMesh) return;
            const list = Array.isArray(object.material) ? object.material : [object.material];
            const made = list.map((material) => {
                if (!swapped.has(material)) {
                    const copy = material.clone();
                    copy.fog = false;          // 53 m of FogExp2 is not dim, it is gone
                    swapped.set(material, copy);
                }
                return swapped.get(material);
            });
            object.material = Array.isArray(object.material) ? made : made[0];
        });
        character.materials = Array.from(swapped.values());
    }

    // Her candle: the game's wax and its flame and halo glow sprites, hung on her hand
    // bone when she has one (the bone carries the figure's own scale, which is taken back
    // out here) and on a fixed point at her side when she does not.
    function candle(character, holder) {
        const THREE = T();
        const group = new THREE.Group();
        group.name = 'apparition-candle';
        const wax = new THREE.Mesh(
            new THREE.CylinderGeometry(CANDLE.wax.r, CANDLE.wax.r, CANDLE.wax.h, 8),
            NW.Models.material('wax')
        );
        wax.position.y = CANDLE.wax.h / 2;
        group.add(wax);
        const flame = NW.Models.glowSprite(CANDLE.colour, CANDLE.size, 0.98);
        flame.position.y = CANDLE.wax.h + 0.06;
        group.add(flame);
        const halo = NW.Models.glowSprite(CANDLE.halo, CANDLE.haloSize, 0.42);
        halo.position.y = CANDLE.wax.h + 0.06;
        group.add(halo);

        let hand = null;
        character.model.traverse((object) => {
            if (hand || !object.isBone) return;
            const name = String(object.name || '');
            if (/hand/i.test(name) && !/thumb|index|mid|ring|pinky|carp|finger/i.test(name)) hand = object;
        });
        if (hand) {
            const scale = character.model.scale.x || 1;
            group.scale.setScalar(1 / scale);
            hand.add(group);
        } else {
            group.position.set(CANDLE.fallback.x, CANDLE.fallback.y, CANDLE.fallback.z);
            holder.add(group);
        }
        return flame;
    }

    /**
     * The corridor's one extra light, made for EVERY vigil whether she was rolled or not
     * so the scene's light count never changes (world.js prewarm: the count is baked into
     * every shader). It hangs in the corridor's root, not under her — a light under an
     * invisible parent is dropped from the render, which is the same thing as removing
     * it. It starts at 0 and only its intensity ever moves.
     */
    function lamp(root, L) {
        const THREE = T();
        const light = new THREE.PointLight(LIGHT.colour, 0, LIGHT.range, LIGHT.decay);
        light.name = 'apparition-candle-light';
        light.castShadow = false;
        light.position.set(Math.min(SPOT.x, L.deep - 0.8), 1.15, (L.zNear + L.zFar) / 2);
        root.add(light);
        return light;
    }

    /**
     * corridor.js build, inside the corridor's root and before world.js prewarm(): the
     * light always, and — if this vigil rolled her — Jane at the dead end, hidden.
     * `L` is corridor.js's layout.
     */
    function build(root, world, L) {
        state.root = root || null;
        state.holder = null;
        state.character = null;
        state.light = null;
        state.flame = null;
        state.here = false;
        state.shown = false;
        state.gone = false;
        state.trigger = null;
        state.t = 0;
        state.charging = false;
        state.entry = null;
        state.lightDx = 0;
        state.why = null;
        state.ran = 0;
        state.phase = Number(world.phase) || 1;
        if (!T() || !root || !L || !NW.Models || !NW.Models.makeCharacter) return null;
        // the light first, and unconditionally: every vigil has the same light count
        state.light = lamp(root, L);
        if (!rollNow(state.phase)) return null;

        const dressing = Math.min(5, state.phase);
        const holder = NW.Models.makeCharacter('nun', dressing);
        const character = holder.userData && holder.userData.character;
        if (!character) return null;      // the sprite fallback: no figure to stand there

        stand(character);
        unfog(character);
        const flame = candle(character, holder);
        const z = ((L.zNear + L.zFar) / 2) + SPOT.off;
        holder.position.set(Math.min(SPOT.x, L.deep - 0.8), 0, z);
        holder.rotation.y = SPOT.yaw;
        holder.name = 'corridor-apparition';
        holder.visible = false;
        // Nothing may ever hit her: she has no collider, no target, no interaction, and a
        // Sprite's raycast needs a camera on the ray (anything in the level that casts
        // rays at the corridor's meshes would throw on her candle).
        holder.traverse((object) => { object.raycast = function none() {}; });
        root.add(holder);
        // Put the light where the flame actually ended up (in her hand), in the root's
        // own space. Moving a light is a uniform; adding or hiding one is a recompile.
        holder.updateMatrixWorld(true);
        const at = flame.getWorldPosition(new (T().Vector3)());
        root.updateMatrixWorld(true);
        root.worldToLocal(at);
        at.y += LIGHT.rise;
        state.light.position.copy(at);
        // she only ever travels along x, so the light rides her by this one offset
        state.lightDx = at.x - holder.position.x;
        state.entry = L.back + RUN.entry;
        state.holder = holder;
        state.character = character;
        state.flame = flame;
        state.here = true;
        return holder;
    }

    // corridor.js build, once its stands exist: the first one down the corridor is where
    // she goes.
    function arm(stands) {
        if (!state.here) return;
        const first = (stands || []).slice().sort((a, b) => a.x - b.x)[0];
        state.trigger = first ? first.x : null;
    }

    // Her candle's light, intensity only: 0 unless she is standing there, and a small
    // flame wobble on top so it does not read as a lamp.
    function shine(on, dt) {
        if (!state.light) return;
        if (!on) {
            if (state.light.intensity !== 0) state.light.intensity = 0;
            return;
        }
        state.t += Number.isFinite(dt) ? dt : 1 / 60;
        const wobble = 1 - (LIGHT.flicker * (0.5 + (0.5 * Math.sin(state.t * 9.3))) * (0.6 + (0.4 * Math.sin(state.t * 23.1))));
        state.light.intensity = LIGHT.intensity * wobble;
    }

    /**
     * She runs: straight down the corridor's centre line at the player, on her one baked
     * gait clip driven fast, leaning into it, her candle's light riding along with her.
     * Nothing about this touches the world — no collider, no grid, no pathing; she cannot
     * reach the player, because the first stand takes her first.
     */
    function charge(dt) {
        const step = Math.max(0, Number.isFinite(dt) ? dt : 1 / 60) * RUN.speed;
        const holder = state.holder;
        holder.position.x -= step;
        state.ran += step;
        if (state.light) state.light.position.x = holder.position.x + state.lightDx;
        const action = state.character && state.character.action;
        if (action) {
            action.paused = false;
            action.timeScale = RUN.gait;
            state.character.mixer.update(Number.isFinite(dt) ? dt : 1 / 60);
        }
        holder.rotation.x = RUN.lean;
    }

    /**
     * corridor.js update, every playable frame. She shows once the side door is open,
     * charges the moment the player steps into the corridor, and goes when either of them
     * reaches the corridor's first candle stand — instantly, with the laugh.
     */
    function update(world, playSfx, dt) {
        if (!state.here || !state.holder) {
            shine(false);
            return;
        }
        if (state.gone) {
            if (state.holder.visible) state.holder.visible = false;
            shine(false);
            return;
        }
        const open = Boolean(world.sideDoorOpen);
        if (state.holder.visible !== open) {
            state.holder.visible = open;
            state.shown = state.shown || open;
        }
        shine(open, dt);
        if (!open || state.trigger == null) return;
        const p = world.player;
        if (!p) return;
        // the player is inside the corridor: she comes
        if (!state.charging && state.entry != null && p.x > state.entry) state.charging = true;
        if (state.charging) charge(dt);
        // whoever reaches the first stand first ends it (the player already past it when
        // she would start simply ends it on this same frame)
        const playerThere = p.x >= state.trigger - GO.near;
        const sheThere = state.charging && state.holder.position.x <= state.trigger;
        if (!playerThere && !sheThere) return;
        state.why = sheThere ? 'her' : 'player';
        state.gone = true;
        state.holder.visible = false;
        shine(false);
        // Steam, hidden (code/achievements.js): she really was standing there.
        if (typeof window.unlockAchievement === 'function') {
            window.unlockAchievement('ACH_APPARITION');
        }
        if (typeof playSfx === 'function') playSfx(GO.sfx, GO.volume);
        else {
            // corridor.js was called without world.js's playSfx: the clip still obeys the
            // sfx setting, the same way playSfx does.
            const audio = document.getElementById(GO.sfx);
            if (audio) {
                const sfx = Number(window.gameSettings && window.gameSettings.audio && window.gameSettings.audio.sfxVolume);
                audio.volume = Math.max(0, Math.min(1, (Number.isFinite(sfx) ? sfx : 1) * GO.volume));
                try { audio.currentTime = 0; } catch (error) { /* ignore */ }
                const promise = audio.play();
                if (promise && typeof promise.catch === 'function') promise.catch(() => {});
            }
        }
    }

    // Tests: the apparition as plain data.
    function info() {
        return {
            here: state.here, phase: state.phase, rolled: rolls(state.phase),
            visible: Boolean(state.holder && state.holder.visible), shown: state.shown,
            gone: state.gone, trigger: state.trigger, charging: state.charging,
            why: state.why, ran: +state.ran.toFixed(2), entry: state.entry,
            x: state.holder ? state.holder.position.x : null,
            z: state.holder ? state.holder.position.z : null,
            light: state.light ? {
                intensity: +state.light.intensity.toFixed(3),
                x: +state.light.position.x.toFixed(2),
                y: +state.light.position.y.toFixed(2),
                z: +state.light.position.z.toFixed(2)
            } : null
        };
    }

    NW.Apparition = { build, arm, update, info, rolls, force, SPOT, LOOK, CANDLE, LIGHT, RUN, GO };
})();
