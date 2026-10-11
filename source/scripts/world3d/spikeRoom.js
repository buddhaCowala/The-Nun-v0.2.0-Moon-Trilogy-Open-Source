/**
 * The Nun 3D — the spike room off the nave's LEFT wall (Shaun's "big room left wall altar").
 *
 * Shaun: "add big room left wall altar, floor is spikes that kills you instantly. You need
 * to jump on poles (not aligned, places in a random pattern, reachable but hard) at the end,
 * you jump on a bigger platform where sits a huge reward (relics). You need to come back
 * before the nun wall hits you."
 *
 * The opening is the MIRROR of the side door: the set's two side walls each have the same
 * hole beside the apse (cathedral.js GATE_HOLES, z 7.01-13.17). The right one keeps the side
 * door's opening at x 20.183; the left one now keeps this one at x 3.882, the same z 10.092,
 * the same stone frame — but no leaf, ever: the room is open from the first frame of every
 * vigil, and the only lock on it is the clock.
 *
 *   - Stone: the nave's own (cathedral.js restoneShells), UVs projected from the world the
 *     same way, so the room reads as part of the building (corridor.js does this for +x).
 *   - The pit: ROOM.pit metres below the nave floor, wall to wall, carpeted in dark iron
 *     spikes (one InstancedMesh). Touching it is death — the same catch flow Jane's wall
 *     uses (world.js nunCatches, passed in as `caught`), fired exactly once per vigil.
 *   - The route: a stone LEDGE inside the opening, then POLES.count stone pillars whose
 *     tops are small platforms, then a bigger PLATFORM at the far end with the reward.
 *     The pillars are laid along a seeded three-leg polyline that changes every vigil, each
 *     one jittered off it, so nothing lines up; every gap is kept inside
 *     [POLES.gapMin, POLES.gapMax] and every rise under POLES.rise, which the real parkour
 *     numbers clear (jumpSpeed 5 / gravity 22 = 0.4545 s of flight, 2.36 m at a sprint,
 *     plus the body's radius overlapping each 0.9 m top at both ends, plus GRAB_REACH 1.7
 *     on the pillar's side for anything short). A bot proves the crossing both ways.
 *   - The reward: one big reliquary worth PRIZE.value with the prize shimmer
 *     (models.js markRelicPrize) and PRIZE.extras plain relics beside it — PRIZE.total in
 *     all, against 3 for the nave's best pickup. Taken with E under the normal rules.
 *   - Coming back: Jane's wall (aura.js) is a plane of constant z, so it sweeps this room
 *     from its far end (z ROOM.z1) toward the altar and eats the pillars in z order. It
 *     pushes the player through parkour.js like anywhere else — off a pillar, into the pit.
 *     The deepest pillar is cut off at ~70 % of every vigil and the opening at ~85 %, so
 *     the room is a decision with a deadline, not a detour.
 *   - Walking: the nav grid starts at x 0 and 1 cell = 1 m, and the height field starts at
 *     x 5, so everything left of the nave is the grid's wall today. Rather than shift the
 *     grid's origin (every raw `(z * width) + x` reader in world.js, cathedral.js's own map
 *     build and corridor.js's stampMap would have to move with it) the room publishes its
 *     own floor: `world.extraField`, which parkour.js sampleField asks after the height
 *     field misses and before the grid. The girls never read it, so Jane and the Demoness
 *     keep to the grid and neither can walk into a spike pit — which is what we want.
 *   - Lights: none of its own. One candle stand on the ledge (world.candles, the nave's own
 *     kind) so the edge of the pit is readable, and the pillar caps are laid in the pale
 *     altar stone rather than the nave's dark blocks — material, not emissive.
 *
 * Built with the level (world.js buildLevel, after bloodWriting.js, before prewarm) and
 * thrown away with it.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // The nave's stone is laid one UV unit per this many metres (cathedral.js SHELL_UV_METRES).
    const UV_METRES = 3;

    // The nave's LEFT wall as exported (cathedral.js GATE_HOLES[0]): its nave face and its
    // back face. The opening is cut in it, mirroring the side door's.
    const WALL = { inner: 4.3258, outer: 3.4383 };
    const DOOR = { x: 3.88205, z: 10.092, width: 1.8, height: 2.6 };

    // The room behind it, in world metres: its inside, the pit's floor, the ceiling, how
    // far the shell reaches past the inside, and where the height field stops on the left.
    // Shaun, after walking the first cut: "the room is not deep enough at all, I needed to
    // jump on like 6 pillars. I want like 20, so the room must be like 3 times deeper."
    // 16.4 x 16 m became 33.4 x 18 m, and each route snakes inside it rather than running
    // straight, so a route is ~40 m of pillars without a 50 m room.
    const ROOM = { x0: -30.0, x1: WALL.outer, z0: 3.0, z1: 21.0, pit: -2.6, ceiling: 6.4, shell: 0.6 };
    const FIELD_EDGE = 5.0;

    // The landing inside the opening: nave-floor level, and big enough to walk out onto,
    // stop, look at both routes and take a run-up at either. It was 1.7 m deep with the
    // route's first pillar 1.6 m off the doorway's centre line, so walking straight in
    // walked straight into the pit (Shaun: "I'm falling through the floor, can't even
    // reach the first pillar" / "I was able to jump over the fake floor"). It is now
    // 3.4 x 5.0 m AND a real collider box (colliders below) as well as extra-field floor,
    // so it is solid stone even if the floor this module publishes never gets asked.
    const LEDGE = { x0: 0.0, x1: WALL.outer, z0: 7.6, z1: 12.6, top: 0 };
    // Each route's first pillar is pinned straight out from the ledge's edge on that
    // route's own line, this far out and this wide: the first move is always the easy one
    // and it is always visible from the doorway.
    const FIRST = { gap: 2.15, wide: 1.12, top: 0 };

    // The far platform that carries the reward: both routes arrive at it.
    const PLATFORM = { x0: -29.2, x1: -25.6, z0: 10.2, z1: 13.8, top: 0.55 };

    // Shared pillar rules. Per-route overrides live in ROUTES.
    // Why these gaps: a sprint (5.2 m/s) jump is 0.4545 s of air = 2.36 m, and the tops let
    // the 0.35 m body take off and land past each centre, so 2.55 m centre to centre is a
    // CLEAN landing with room to spare. It was 2.95, which only GRAB_REACH on the far
    // pillar's side saved, and a bot fell off it about half the time. The difficulty is the
    // small tops, the dark, the height changes and the wall behind you — never a gap that
    // cannot be made. `rise` likewise: it still asks for a mantle without costing a jump's
    // Breath twice over.
    const POLES = { apart: 1.75, cap: 0.16, capOut: 0.05 };

    // The body's radius (world.js CONFIG.radius; build() passes it in). It matters to the
    // DRAWN floor, not only the collision: parkour.js stands the body wherever its circle
    // OVERLAPS a collider, so the walkable area of a slab is the slab grown by this. Shaun:
    // "there is still a part of the starting floor that I fell through. Remove the texture
    // or whatever where there isn't real hard floor!" — so every slab a player walks on
    // (the ledge, the rest platforms, the reward platform) is DRAWN grown by exactly this,
    // and then drawn floor and standable floor are the same rectangle to the centimetre.
    // Pillar caps keep the forgiving overlap: landing half-on a 1 m top is the point.
    let BODY_R = 0.35;
    // The player's own numbers (world.js CONFIG), so the heights below are derived from
    // the real jump rather than guessed. build() refreshes them.
    const PHYS = { sprint: 5.2, jump: 5.0, gravity: 22 };
    // How much a landing is allowed to overlap the two tops (the body stands wherever its
    // circle touches a cap, at both ends of the hop).
    const LAND = 0.55;

    /**
     * The tallest step UP that can still be cleared CLEANLY across a gap of `gap` metres.
     * A jump rises jump^2/2g (0.568 m) and the flight to a top `dy` higher lasts
     * (jump + sqrt(jump^2 - 2 g dy)) / g seconds, so the higher the target the shorter the
     * hop: +0.55 m carries only 1.4 m, which is less than the smallest gap here. Sizing
     * every rise from its own gap is what keeps "interesting heights" and "every jump
     * makeable" the same rule instead of opposite ones. Drops cost nothing, so they carry
     * the drama (FEATURE.drop).
     */
    function riseFor(gap) {
        const J = PHYS.jump;
        const G = PHYS.gravity;
        const need = Math.max(0.16, (gap - LAND) / Math.max(1, PHYS.sprint));   // air time wanted
        const inner = (need * G) - J;
        if (inner >= J) return 0;
        const dy = ((J * J) - (inner * inner)) / (2 * G);
        return Math.max(0, Math.min(FEATURE.climb[1], dy - 0.06));
    }

    // Height variety (Shaun: "the paths are kinda boring, the pillars have almost the same
    // height, make it interesting"). Every `every` pillars the route takes a deliberate
    // feature instead of a small step: a CLIMB you have to mantle (never more than `climb`,
    // well inside GRAB_REACH 1.7 over a jump's 0.57 m peak) or a DROP you fall down.
    // `rest` is the wide low pillar dropped in mid-route: somewhere to stand, breathe and
    // look at what is left.
    const FEATURE = { every: 4, climb: [0.22, 0.50], drop: [0.70, 1.55], rest: { at: 0.55, wide: 1.9, top: -0.55 } };
    // A step UP is capped just under a jump's own peak (jumpSpeed^2 / 2 gravity = 0.568 m),
    // so a climb is still a CLEAN landing on a higher top rather than a flight into the
    // pillar's side hoping GRAB_REACH saves it. Drops are free, so they carry the drama:
    // up to 1.55 m down in one hop. Tested at 1.00 m up and a bot fell off it repeatedly.

    /**
     * The TWO routes (Shaun: "You could also make 2 different paths of pillars"). They
     * split at the ledge — one leaves its high-z corner, one its low-z corner — snake
     * across the room and both arrive at the reward platform, so the way home can be the
     * other road. `legs` is the polyline the pillars are strung along (the first point is
     * the ledge's edge, the last the platform's edge); `jitter` is how far each waypoint
     * wanders per vigil, so no two vigils lay the same pattern.
     *
     *   high — the long road: wide tops, gentle rises, hugs the far (high z) wall, which
     *          is the end Jane's wall reaches FIRST.
     *   low  — the short road: narrow tops, bigger steps, runs along the altar side, so it
     *          is quicker and stays clear of the wall longer, but every landing is tight.
     */
    const ROUTES = [
        {
            id: 'high', spacing: 2.40, gapMin: 2.15, gapMax: 2.55,
            topMin: -0.95, topMax: 1.35, rise: 0.32, wide: [0.86, 1.30],
            legs: [
                { x: LEDGE.x0, z: 11.9 }, { x: -5.0, z: 19.2, jx: 1.6, jz: 1.0 },
                { x: -13.0, z: 19.2, jx: 1.8, jz: 1.0 }, { x: -15.0, z: 14.8, jx: 1.2, jz: 1.4 },
                { x: -21.0, z: 19.2, jx: 1.6, jz: 1.0 }, { x: -27.0, z: 17.5, jx: 1.2, jz: 1.2 },
                { x: -28.5, z: 13.5, jx: 1.0, jz: 1.2 }, { x: PLATFORM.x1, z: 12.6 }
            ]
        },
        {
            id: 'low', spacing: 2.20, gapMin: 2.15, gapMax: 2.60,
            topMin: -1.25, topMax: 1.05, rise: 0.40, wide: [0.66, 0.96],
            legs: [
                { x: LEDGE.x0, z: 8.3 }, { x: -7.0, z: 4.2, jx: 1.6, jz: 1.0 },
                { x: -16.0, z: 4.2, jx: 1.8, jz: 1.0 }, { x: -19.0, z: 8.5, jx: 1.2, jz: 1.4 },
                { x: -27.0, z: 4.8, jx: 1.4, jz: 1.0 }, { x: -28.6, z: 9.0, jx: 1.0, jz: 1.2 },
                { x: PLATFORM.x1, z: 11.2 }
            ]
        }
    ];
    // No pillar's centre ever leaves this (clear of the shell and of the ledge).
    const PAD = { x0: -29.4, x1: -0.7, z0: 3.7, z1: 20.3 };
    const COUNT = { min: 12, max: 24 };

    // The spikes: a field of four-sided iron teeth on the pit's floor, this tall, on this
    // pitch, jittered, and kept clear of anything standable.
    const SPIKE = { rise: 0.55, half: 0.15, step: 0.70, jitter: 0.19, clear: 0.62 };
    // Falling this far below the nave floor is already past every pillar: the spikes take
    // him there rather than one frame later at the floor itself ("kills you instantly").
    const KILL_Y = ROOM.pit + 1.0;

    // The reward: one big reliquary plus a few loose relics on the platform beside it.
    const PRIZE = { value: 12, extras: 3, y: PLATFORM.top, spread: 0.85 };

    // The one stand in the room, on the ledge by the opening (Shaun: "maybe a candle stand
    // at the entrance"). It is in world.candles like the nave's: lit with E, burns down,
    // gives its pool. No light is ever added or removed (world.js prewarm).
    const STAND = { x: 3.05, z: 12.05 };

    const state = {
        layout: null, routes: [], poles: [], boxes: [], prize: null, relics: [], candle: null,
        platformCandle: null, falls: 0, flash: 0, cooldown: 0, killed: false, triangles: 0, spikes: 0
    };

    // parkour.js sampleField reads this one object back (no allocation per sample).
    const out = { ground: 0, clear: 0 };

    function T() {
        return window.THREE;
    }

    // ------------------------------------------------------------ the layout

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

    function doorway() {
        const p = NW.Cathedral && NW.Cathedral.spikeDoorway;
        return p && Number.isFinite(p.x) ? p : DOOR;
    }

    function layout() {
        const d = doorway();
        return {
            door: d,
            z0: d.z - (d.width / 2),
            z1: d.z + (d.width / 2),
            inner: WALL.inner,
            outer: WALL.outer
        };
    }

    // The veil of Jane's wall has to reach across this room too (world.js buildLevel takes
    // the smaller of this and the grid's west edge), or it sweeps a room the player cannot
    // see it in.
    function auraX0() {
        return ROOM.x0 - ROOM.shell;
    }

    // ------------------------------------------------------------ the pillars

    function lerp(a, b, t) {
        return a + ((b - a) * t);
    }

    // One route's legs as a polyline, its waypoints jittered for this vigil. The first and
    // last points are fixed: the ledge's edge and the platform's edge.
    function routePoints(spec, random) {
        return spec.legs.map((leg, k) => (k === 0 || k === spec.legs.length - 1
            ? { x: leg.x, z: leg.z }
            : { x: leg.x + ((random() - 0.5) * (leg.jx || 0)), z: leg.z + ((random() - 0.5) * (leg.jz || 0)) }));
    }

    // A point `s` metres along a polyline, and the unit direction there.
    function along(points, s) {
        let left = s;
        for (let i = 0; i < points.length - 1; i += 1) {
            const a = points[i];
            const b = points[i + 1];
            const length = Math.hypot(b.x - a.x, b.z - a.z);
            if (left <= length || i === points.length - 2) {
                const t = length > 1e-6 ? Math.max(0, Math.min(1, left / length)) : 0;
                return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dx: (b.x - a.x) / (length || 1), dz: (b.z - a.z) / (length || 1) };
            }
            left -= length;
        }
        const last = points[points.length - 1];
        return { x: last.x, z: last.z, dx: 1, dz: 0 };
    }

    function routeLength(points) {
        let total = 0;
        for (let i = 0; i < points.length - 1; i += 1) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
        return total;
    }

    function clampPad(p) {
        p.x = Math.max(PAD.x0, Math.min(PAD.x1, p.x));
        p.z = Math.max(PAD.z0, Math.min(PAD.z1, p.z));
    }

    // Pull `p` back toward `anchor` until they are at most `most` apart.
    function pullIn(anchor, p, most) {
        const dx = p.x - anchor.x;
        const dz = p.z - anchor.z;
        const length = Math.hypot(dx, dz);
        if (length <= most || length < 1e-6) return;
        p.x = anchor.x + ((dx / length) * most);
        p.z = anchor.z + ((dz / length) * most);
    }

    // Push `p` away from `anchor` until they are at least `least` apart.
    function pushOut(anchor, p, least) {
        const dx = p.x - anchor.x;
        const dz = p.z - anchor.z;
        const length = Math.hypot(dx, dz);
        if (length >= least) return;
        const ux = length > 1e-6 ? dx / length : 1;
        const uz = length > 1e-6 ? dz / length : 0;
        p.x = anchor.x + (ux * least);
        p.z = anchor.z + (uz * least);
    }

    /**
     * One route's pillars: strung along its polyline at even arclength, each jittered
     * across it and along it so no three line up, then relaxed until every consecutive gap
     * is in [gapMin, gapMax] and no two pillars (of EITHER route) are closer than
     * POLES.apart. The tops walk between topMin and topMax, never more than `rise` up in
     * one step. `others` is every pillar already laid, so the two roads never merge.
     * -> [{ x, z, top, wide, route }]
     */
    function layRoute(spec, random, others) {
        const points = routePoints(spec, random);
        const length = routeLength(points);
        const count = Math.max(COUNT.min, Math.min(COUNT.max, Math.round(length / spec.spacing) - 1));
        const gaps = count + 1;
        const head = points[0];
        const tail = points[points.length - 1];
        const poles = [];
        for (let k = 1; k <= count; k += 1) {
            const at = along(points, (length * k) / gaps);
            const side = (random() - 0.5) * 1.05;          // across the route
            const slip = (random() - 0.5) * 0.6;           // along it
            const p = {
                x: at.x + (at.dz * side) + (at.dx * slip),
                z: at.z - (at.dx * side) + (at.dz * slip),
                wide: lerp(spec.wide[0], spec.wide[1], random()),
                route: spec.id,
                top: 0
            };
            clampPad(p);
            poles.push(p);
        }
        // The first pillar is not laid, it is placed: straight out from the ledge's edge on
        // this route's own line, one short gap out and wider than the rest. Walking forward
        // off the ledge has to meet stone on either road.
        poles[0].x = head.x - FIRST.gap;
        poles[0].z = head.z;
        poles[0].wide = FIRST.wide;
        poles[0].top = FIRST.top;
        poles[0].pinned = true;
        const keepOff = () => {
            for (let k = 0; k < poles.length; k += 1) {
                if (poles[k].pinned) continue;
                for (let j = 0; j < poles.length; j += 1) {
                    if (Math.abs(j - k) <= 1) continue;
                    pushOut(poles[j], poles[k], POLES.apart);
                }
                others.forEach((o) => pushOut(o, poles[k], POLES.apart));
                clampPad(poles[k]);
            }
        };
        const chainUp = () => {
            for (let k = 0; k < poles.length; k += 1) {
                if (poles[k].pinned) continue;
                const before = k === 0 ? head : poles[k - 1];
                pullIn(before, poles[k], spec.gapMax);
                pushOut(before, poles[k], spec.gapMin);
                clampPad(poles[k]);
            }
            // and the last pillar within one jump of the platform's edge
            pullIn(tail, poles[poles.length - 1], spec.gapMax);
            pushOut(tail, poles[poles.length - 1], spec.gapMin);
        };
        for (let pass = 0; pass < 6; pass += 1) {
            chainUp();
            keepOff();
        }
        // Last word to the chain itself: keeping pillars apart can push a consecutive gap
        // back out of range, and one gap out of range is one jump that cannot be made.
        chainUp();
        // The heights. A small step most of the time, and every FEATURE.every pillars a
        // real one: a climb that must be mantled, or a drop. One wide low pillar around
        // FEATURE.rest.at along the route is the rest stop. Nothing ever rises by more
        // than FEATURE.climb[1], which a jump's peak plus GRAB_REACH clears with room.
        const restAt = Math.max(2, Math.min(poles.length - 2, Math.round(poles.length * FEATURE.rest.at)));
        const gapTo = (k) => {
            const before = k === 0 ? head : poles[k - 1];
            return Math.hypot(poles[k].x - before.x, poles[k].z - before.z);
        };
        let last = LEDGE.top;
        poles.forEach((p, k) => {
            if (k === 0) {
                p.top = FIRST.top;
                last = p.top;
                return;
            }
            const up = riseFor(gapTo(k));           // what THIS gap allows going up
            // The ceiling is applied LAST, after the route's own range, or a top clamped
            // UP to topMin turns into a rise bigger than the gap can carry — which is
            // exactly the step a bot then cannot make.
            const settle = (value) => Math.min(Math.max(spec.topMin, Math.min(spec.topMax, value)), last + up);
            if (k === restAt) {
                p.top = settle(last + FEATURE.rest.top);
                p.wide = FEATURE.rest.wide;
                p.rest = true;
                last = p.top;
                return;
            }
            let want;
            if (k % FEATURE.every === 0) {
                // a feature: the biggest step this gap allows, up or down
                want = random() < 0.45 ? last + up : last - lerp(FEATURE.drop[0], FEATURE.drop[1], random());
            } else {
                want = lerp(spec.topMin, spec.topMax, random());
            }
            p.top = settle(want);
            last = p.top;
        });
        // The platform's top is fixed, so "reach the platform" is a LOWER bound on the last
        // pillar, and that bound walks backward down the chain (each pillar must be high
        // enough that the next one is still within its own gap's rise). Work the bounds out
        // backward first, then make one forward pass that honours the bound below and the
        // per-gap ceiling above. The old code instead RAISED the last pillar to meet the
        // platform after the ceiling pass, which put one step of up to 1.10 m across a
        // 2.15 m gap into most vigils — the one jump a bot could never make.
        const n = poles.length;
        const lower = new Array(n).fill(-Infinity);
        lower[n - 1] = PLATFORM.top - riseFor(Math.hypot(tail.x - poles[n - 1].x, tail.z - poles[n - 1].z));
        for (let k = n - 2; k >= 0; k -= 1) lower[k] = lower[k + 1] - riseFor(gapTo(k + 1));
        for (let k = 0; k < n; k += 1) {
            const before = k === 0 ? LEDGE.top : poles[k - 1].top;
            poles[k].top = Math.max(lower[k], Math.min(poles[k].top, before + riseFor(gapTo(k))));
        }
        return { id: spec.id, head, tail, poles };
    }

    // Both roads, laid in order so the second keeps clear of the first.
    function layRoutes(random) {
        const laid = [];
        const all = [];
        ROUTES.forEach((spec) => {
            const route = layRoute(spec, random, all);
            laid.push(route);
            route.poles.forEach((p) => all.push(p));
        });
        return { routes: laid, poles: all };
    }

    // ------------------------------------------------------------ the floor parkour.js reads
    //
    // The height field stops at x 5 and the nav grid's cells left of the nave are stone, so
    // this room publishes its own ground. parkour.js sampleField asks `world.extraField`
    // after the field misses and before the grid, and gets back the SAME object every time
    // (no garbage in the movement loop): `false` = stone, `undefined` = not mine, ask the
    // grid. The pillars, the platform and the walls are not in here — the first two are
    // collider boxes (world.levelBoxes) and the walls are simply the stone this returns
    // outside the room.

    function inRect(x, z, x0, x1, z0, z1) {
        return x >= x0 && x <= x1 && z >= z0 && z <= z1;
    }

    function sampler(L) {
        return function sample(x, z) {
            // everything outside the room and its threshold belongs to the grid
            if (!inRect(x, z, ROOM.x0 - ROOM.shell, FIELD_EDGE + 0.02, ROOM.z0 - ROOM.shell, ROOM.z1 + ROOM.shell)) return undefined;
            // the threshold: the doorway's own strip, through the wall and out to the field
            if (x >= L.outer && inRect(x, z, L.outer, FIELD_EDGE + 0.02, L.z0, L.z1)) {
                out.ground = 0;
                out.clear = x > L.inner ? 6 : (L.door.height || DOOR.height);
                return out;
            }
            if (x >= L.outer) return false;                         // the rest of the wall
            if (!inRect(x, z, ROOM.x0, ROOM.x1, ROOM.z0, ROOM.z1)) return false;   // its shell
            if (inRect(x, z, LEDGE.x0, LEDGE.x1, LEDGE.z0, LEDGE.z1)) {
                out.ground = LEDGE.top;
                out.clear = ROOM.ceiling - LEDGE.top;
                return out;
            }
            out.ground = ROOM.pit;
            out.clear = ROOM.ceiling - ROOM.pit;
            return out;
        };
    }

    // ------------------------------------------------------------ geometry
    //
    // The same mesher corridor.js uses: flat quads with the nave's world-projected stone
    // UVs, each face wound toward its own normal (r147 flips a back face's normals, so a
    // face seen from the wrong side shades as if it faced away).

    function Mesher() {
        this.position = [];
        this.normal = [];
        this.uv = [];
    }

    function projectUv(p, n) {
        const ax = Math.abs(n[0]);
        const ay = Math.abs(n[1]);
        const az = Math.abs(n[2]);
        if (ax >= ay && ax >= az) return [p[2] / UV_METRES, p[1] / UV_METRES];
        if (az >= ay) return [p[0] / UV_METRES, p[1] / UV_METRES];
        return [p[0] / UV_METRES, p[2] / UV_METRES];
    }

    Mesher.prototype.quad = function quad(a, b, c, d, n) {
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const facing = (((e1[1] * e2[2]) - (e1[2] * e2[1])) * n[0])
            + (((e1[2] * e2[0]) - (e1[0] * e2[2])) * n[1])
            + (((e1[0] * e2[1]) - (e1[1] * e2[0])) * n[2]);
        const order = facing < 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
        order.forEach((p) => {
            this.position.push(p[0], p[1], p[2]);
            this.normal.push(n[0], n[1], n[2]);
            const uv = projectUv(p, n);
            this.uv.push(uv[0], uv[1]);
        });
    };

    // An axis-aligned block; `skip` names faces left out ('x0' 'x1' 'y0' 'y1' 'z0' 'z1').
    Mesher.prototype.box = function box(x0, x1, y0, y1, z0, z1, skip) {
        const s = skip || '';
        if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
        if (!s.includes('x0')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
        if (!s.includes('x1')) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
        if (!s.includes('y0')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
        if (!s.includes('y1')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
        if (!s.includes('z0')) this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
        if (!s.includes('z1')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    };

    Mesher.prototype.geometry = function geometry(THREE) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.computeBoundingSphere();
        return g;
    };

    function stoneOf(model) {
        let shell = null;
        let stone = null;
        model.traverse((object) => {
            if (!object.isMesh || Array.isArray(object.material)) return;
            if (!shell && /Cube\.?003$/.test(object.name)) shell = object;
            if (!stone && /^medieval_blocks/i.test(object.material.name || '') && object.material.map) stone = object.material;
        });
        const shellStone = shell && shell.material && shell.material.map && /^medieval_blocks/i.test(shell.material.name || '');
        return shellStone ? shell.material : stone;
    }

    // ------------------------------------------------------------ build

    // The room's shell: the pit's floor, the three outer walls, the ceiling, the ledge, the
    // pillars' shafts and the platform. The near side needs nothing — cathedral.js's
    // wallUpOpenings already stones the left hole's back face with this doorway cut out.
    function buildStone(root, L, stone, poles) {
        const THREE = T();
        const m = new Mesher();
        const s = ROOM.shell;
        // the pit's floor, and the three walls round it up to the ceiling
        m.box(ROOM.x0, ROOM.x1, ROOM.pit - 0.3, ROOM.pit, ROOM.z0, ROOM.z1, 'x0 x1 y0 z0 z1');
        m.box(ROOM.x0 - s, ROOM.x0, ROOM.pit - 0.3, ROOM.ceiling, ROOM.z0 - s, ROOM.z1 + s, 'x0 y0 y1 z0 z1');
        m.box(ROOM.x0 - s, ROOM.x1, ROOM.pit - 0.3, ROOM.ceiling, ROOM.z0 - s, ROOM.z0, 'x0 x1 y0 y1 z0');
        m.box(ROOM.x0 - s, ROOM.x1, ROOM.pit - 0.3, ROOM.ceiling, ROOM.z1, ROOM.z1 + s, 'x0 x1 y0 y1 z1');
        // the near wall's inside face, where the export's shell has nothing behind it
        m.box(ROOM.x1, ROOM.x1 + 0.02, ROOM.pit - 0.3, ROOM.ceiling, ROOM.z0 - s, L.z0, 'x1 y0 y1 z0 z1');
        m.box(ROOM.x1, ROOM.x1 + 0.02, ROOM.pit - 0.3, ROOM.ceiling, L.z1, ROOM.z1 + s, 'x1 y0 y1 z0 z1');
        m.box(ROOM.x1, ROOM.x1 + 0.02, DOOR.height, ROOM.ceiling, L.z0, L.z1, 'x1 y0 y1 z0 z1');
        // the ceiling
        m.box(ROOM.x0 - s, ROOM.x1, ROOM.ceiling, ROOM.ceiling + 0.3, ROOM.z0 - s, ROOM.z1 + s, 'x0 x1 y1 z0 z1');
        // The ledge and the reward platform, DRAWN grown by the body's radius on every
        // open side, because that is exactly how far a body can stand past a collider
        // (parkour.js stands it wherever its circle overlaps one). Drawn floor and hard
        // floor are then the same rectangle, which is what Shaun asked for: "remove the
        // texture or whatever where there isn't real hard floor". The ledge is not grown
        // on +x: that side is the nave wall.
        // ...less a 6 cm hair, so the drawn edge is always strictly INSIDE the standable
        // area: the player can stand on every pixel of floor he can see, and the few
        // centimetres of solid past the last drawn stone are invisible and on the safe
        // side. Drawing it flush put the lip exactly on the limit and a body walking the
        // edge stepped off visible floor.
        const r = Math.max(0, BODY_R - 0.06);
        m.box(LEDGE.x0 - r, LEDGE.x1, ROOM.pit, LEDGE.top, LEDGE.z0 - r, LEDGE.z1 + r, 'x1 y0');
        m.box(PLATFORM.x0 - r, PLATFORM.x1 + r, ROOM.pit, PLATFORM.top, PLATFORM.z0 - r, PLATFORM.z1 + r, 'y0');
        // the pillars: a shaft out of the pit with a slightly proud cap
        poles.forEach((p) => {
            const h = p.wide / 2;
            const c = h + POLES.capOut;
            m.box(p.x - h, p.x + h, ROOM.pit, p.top - POLES.cap, p.z - h, p.z + h, 'y0 y1');
            m.box(p.x - c, p.x + c, p.top - POLES.cap, p.top, p.z - c, p.z + c, 'y0');
        });
        const mesh = new THREE.Mesh(m.geometry(THREE), stone);
        mesh.name = 'spike-room-stone';
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
        return m.position.length / 9;
    }

    // The pillars' caps again, in the pale altar stone: the one thing in the room the
    // player's 5 m light has to pick out, made readable by its material and nothing else
    // (no emissive, no sprite, no light).
    function buildCaps(root, poles) {
        const THREE = T();
        const m = new Mesher();
        poles.forEach((p) => {
            const c = (p.wide / 2) + POLES.capOut;
            m.box(p.x - c, p.x + c, p.top - 0.012, p.top, p.z - c, p.z + c, 'y0 x0 x1 z0 z1');
        });
        const mesh = new THREE.Mesh(m.geometry(THREE), NW.Models.material('altarStone'));
        mesh.name = 'spike-room-caps';
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
    }

    // The spikes: four-sided iron teeth over the whole pit, on SPIKE.step, jittered, and
    // kept clear of anything a body can stand on. One InstancedMesh, one material.
    function buildSpikes(root, poles, random) {
        const THREE = T();
        const clearOf = (x, z) => {
            if (inRect(x, z, LEDGE.x0 - BODY_R - 0.3, LEDGE.x1, LEDGE.z0 - BODY_R - 0.3, LEDGE.z1 + BODY_R + 0.3)) return false;
            if (inRect(x, z, PLATFORM.x0 - BODY_R - 0.3, PLATFORM.x1 + BODY_R + 0.3, PLATFORM.z0 - BODY_R - 0.3, PLATFORM.z1 + BODY_R + 0.3)) return false;
            return !poles.some((p) => Math.abs(p.x - x) < (p.wide / 2) + SPIKE.clear && Math.abs(p.z - z) < (p.wide / 2) + SPIKE.clear);
        };
        const spots = [];
        for (let z = ROOM.z0 + 0.4; z < ROOM.z1 - 0.2; z += SPIKE.step) {
            for (let x = ROOM.x0 + 0.4; x < ROOM.x1 - 0.2; x += SPIKE.step) {
                const jx = x + ((random() - 0.5) * SPIKE.jitter * 2);
                const jz = z + ((random() - 0.5) * SPIKE.jitter * 2);
                if (!clearOf(jx, jz)) continue;
                spots.push(jx, jz, 0.75 + (random() * 0.5), random() * Math.PI);
            }
        }
        if (!spots.length) return 0;
        const count = spots.length / 4;
        const geometry = new THREE.ConeGeometry(SPIKE.half, SPIKE.rise, 4, 1);
        geometry.translate(0, SPIKE.rise / 2, 0);
        const material = new THREE.MeshStandardMaterial({ color: 0x3c3630, roughness: 0.38, metalness: 0.8 });
        material.name = 'spike-iron';
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.name = 'spike-room-spikes';
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        for (let k = 0; k < count; k += 1) {
            position.set(spots[k * 4], ROOM.pit, spots[(k * 4) + 1]);
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spots[(k * 4) + 3]);
            scale.set(1, spots[(k * 4) + 2], 1);
            mesh.setMatrixAt(k, matrix.compose(position, quaternion, scale));
        }
        mesh.instanceMatrix.needsUpdate = true;
        root.add(mesh);
        return count;
    }

    // ------------------------------------------------------------ colliders

    function collider(name, x0, x1, y0, y1, z0, z1) {
        const hu = (x1 - x0) / 2;
        const hv = (z1 - z0) / 2;
        return {
            name, kind: 'level', x: (x0 + x1) / 2, z: (z0 + z1) / 2, a: 0, c: 1, s: 0,
            hu, hv, y0, y1, r: Math.hypot(hu, hv)
        };
    }

    // The pillars and the platform, as boxes in world.levelBoxes (parkour.js): their tops
    // are ground, their sides are what a short jump is caught on. The room's walls are not
    // here — the extra field above returns stone outside the room, which is cheaper and
    // cannot be walked round.
    function colliders(poles) {
        const boxes = [collider('spike platform', PLATFORM.x0, PLATFORM.x1, ROOM.pit, PLATFORM.top, PLATFORM.z0, PLATFORM.z1)];
        // The entrance ledge is a box as WELL as extra-field floor. It is the one surface a
        // player steps onto blind, straight out of a lit nave, and it must be solid stone
        // even if the floor this module publishes is never asked (a rebuild that loses
        // world.extraField, this module bailing, a level swapped under it): a box in
        // world.levelBoxes is read by the same fitAt/groundUnder as every prop in the game.
        boxes.push(collider('spike ledge', LEDGE.x0, LEDGE.x1, ROOM.pit, LEDGE.top, LEDGE.z0, LEDGE.z1));
        poles.forEach((p) => {
            const c = (p.wide / 2) + POLES.capOut;
            boxes.push(collider('spike pillar', p.x - c, p.x + c, ROOM.pit, p.top, p.z - c, p.z + c));
        });
        return boxes;
    }

    function addColliders(world, boxes) {
        const own = world.levelBoxes;
        if (!own || own.level !== world.level || !Array.isArray(own.all)) return false;
        if (Array.isArray(own.own)) own.own.push(...boxes);
        own.all = own.all.concat(boxes).sort((p, q) => p.y0 - q.y0);
        return true;
    }

    // ------------------------------------------------------------ the reward and the stand

    /**
     * The platform's haul: one big reliquary worth PRIZE.value, marked a prize so it carries
     * the bigger breathing shimmer, and PRIZE.extras plain relics round it — PRIZE.total in
     * all, which is what the whole crossing is for. All of them are ordinary world.relics:
     * taken with E under the normal rules, remembered by spot on a retry, hidden from the
     * tutorial (behindDoor). `spikeRoom` keeps them out of the corridor's achievement.
     */
    function placeReward(root, world, index, random) {
        if (!Array.isArray(world.relics)) return null;
        const cx = (PLATFORM.x0 + PLATFORM.x1) / 2;
        const cz = (PLATFORM.z0 + PLATFORM.z1) / 2;
        const kind = index % 2 === 0 ? 'cross' : 'book';
        let prize = null;
        if (NW.Models.makeReliquary) {
            const casket = NW.Models.makeReliquary(kind);
            if (NW.Models.markRelicPrize) NW.Models.markRelicPrize(casket);
            casket.position.set(cx, PLATFORM.top + casket.userData.rest, cz);
            casket.rotation.y = random() * Math.PI * 2;
            root.add(casket);
            prize = {
                mesh: casket, kind, x: cx, z: cz, y: PLATFORM.top,
                value: PRIZE.value, reliquary: true, hidden: false, taken: false,
                behindDoor: true, spikeRoom: true
            };
            world.relics.push(prize);
            state.relics.push(prize);
        }
        for (let k = 0; k < PRIZE.extras; k += 1) {
            const a = ((k + 0.5) * Math.PI * 2 / PRIZE.extras) + (random() * 0.6);
            const x = cx + (Math.cos(a) * PRIZE.spread);
            const z = cz + (Math.sin(a) * PRIZE.spread);
            const loose = NW.Models.makeRelic(k % 2 === 0 ? 'cross' : 'book');
            loose.position.set(x, PLATFORM.top + (loose.userData.rest || 0), z);
            loose.rotation.y = random() * Math.PI * 2;
            root.add(loose);
            const relic = {
                mesh: loose, kind: k % 2 === 0 ? 'cross' : 'book', x, z, y: PLATFORM.top,
                value: 1, reliquary: false, hidden: false, taken: false,
                behindDoor: true, spikeRoom: true
            };
            world.relics.push(relic);
            state.relics.push(relic);
        }
        return prize;
    }

    /**
     * The stand on the reward platform (Shaun: "add a candle that's already lit on the
     * platform at the end"). A real world.candles entry built with the level, so the light
     * count never changes (world.js prewarm), LIT from the first frame and flagged
     * `neverBurns` — world.js burnCandles leaves it alone, because a stand that guttered
     * out would put the reward in the dark at the one moment the player is out there to
     * see it. It gives a pool like any other, which is also why the platform is a safe
     * place to stand and get your breath back.
     */
    function placePlatformStand(root, world) {
        const candle = makeStandAt(root, world, (PLATFORM.x0 + PLATFORM.x1) / 2 + 1.05, PLATFORM.z0 + 0.6, PLATFORM.top);
        if (!candle) return null;
        candle.lit = true;
        candle.life = 1;
        candle.neverBurns = true;
        if (NW.Models.setCandleLit) NW.Models.setCandleLit(candle.mesh, true);
        return candle;
    }

    function makeStandAt(root, world, x, z, y) {
        if (!Array.isArray(world.candles) || !NW.Models.makeCandleStand) return null;
        const theme = world.theme || {};
        const colour = theme.candleColor == null ? 0xffa24a : theme.candleColor;
        const flame = `rgba(${(colour >> 16) & 255},${(colour >> 8) & 255},${colour & 255},0.9)`;
        const stand = NW.Models.makeCandleStand(flame);
        stand.position.set(x, y, z);
        stand.rotation.y = Math.random() * Math.PI * 2;
        root.add(stand);
        const template = (world.candles || [])[0] || {};
        const candle = {};
        Object.keys(template).forEach((key) => {
            if (template[key] === null || typeof template[key] !== 'object') candle[key] = template[key];
        });
        Object.assign(candle, { mesh: stand, x, z, lit: false, hold: 0, behindDoor: true });
        world.candles.push(candle);
        return candle;
    }

    function placeStand(root, world) {
        return makeStandAt(root, world, STAND.x, STAND.z, LEDGE.top);
    }

    /**
     * world.js buildLevel, after bloodWriting.js (whose decals raycast at real stone and must
     * not meet this room's) and before prewarm(), which draws everything once.
     */
    // The export's ground (X_Plane, concrete_floor) runs on under this room at y 0: it drew a
    // floor where there is none (Shaun fell through "fake floor" round the ledge, 09-28).
    // Clip it, once per loaded model, to what lies OUTSIDE the room's footprint
    // (x < WALL.outer and ROOM.z0 < z < ROOM.z1), splitting the triangles that cross its
    // edge so the nave and the doorway threshold keep every bit of their floor. The room
    // draws its own ledge and platform.
    function clipExportGround(model) {
        const THREE = T();
        if (!THREE || !model) return 0;
        let clipped = 0;
        model.traverse((mesh) => {
            if (!mesh.isMesh || mesh.userData.spikeRoomClipped || !/^X_Plane$/.test(mesh.name || '')) return;
            const g = mesh.geometry;
            const pos = g.attributes.position;
            const nor = g.attributes.normal;
            const uv = g.attributes.uv;
            const idx = g.index ? g.index.array : null;
            const count = idx ? idx.length : pos.count;
            mesh.updateMatrixWorld(true);
            const e = mesh.matrixWorld.elements;
            const wx = (i) => (e[0] * pos.getX(i)) + (e[4] * pos.getY(i)) + (e[8] * pos.getZ(i)) + e[12];
            const wz = (i) => (e[2] * pos.getX(i)) + (e[6] * pos.getY(i)) + (e[10] * pos.getZ(i)) + e[14];
            const X = WALL.outer;
            const out = { p: [], n: [], u: [] };
            // a polygon vertex: its world x/z and barycentric weights over the source triangle
            const lerp = (a, b, t) => ({ x: a.x + ((b.x - a.x) * t), z: a.z + ((b.z - a.z) * t),
                w: [a.w[0] + ((b.w[0] - a.w[0]) * t), a.w[1] + ((b.w[1] - a.w[1]) * t), a.w[2] + ((b.w[2] - a.w[2]) * t)] });
            const clip = (poly, f) => {
                const res = [];
                for (let k = 0; k < poly.length; k += 1) {
                    const a = poly[k];
                    const b = poly[(k + 1) % poly.length];
                    const fa = f(a);
                    const fb = f(b);
                    if (fa >= 0) res.push(a);
                    if ((fa >= 0) !== (fb >= 0)) res.push(lerp(a, b, fa / (fa - fb)));
                }
                return res;
            };
            const emit = (poly, v) => {
                for (let k = 1; k + 1 < poly.length; k += 1) {
                    [poly[0], poly[k], poly[k + 1]].forEach((q) => {
                        // r147 has no getComponent; getX/Y/Z also read interleaved GLTF data
                        const get = (attr, i, c) => (c === 0 ? attr.getX(i) : (c === 1 ? attr.getY(i) : attr.getZ(i)));
                        const at = (attr, c) => (q.w[0] * get(attr, v[0], c)) + (q.w[1] * get(attr, v[1], c)) + (q.w[2] * get(attr, v[2], c));
                        out.p.push(at(pos, 0), at(pos, 1), at(pos, 2));
                        if (nor) out.n.push(at(nor, 0), at(nor, 1), at(nor, 2));
                        if (uv) out.u.push(at(uv, 0), at(uv, 1));
                    });
                }
            };
            for (let t = 0; t < count; t += 3) {
                const v = idx ? [idx[t], idx[t + 1], idx[t + 2]] : [t, t + 1, t + 2];
                const tri = v.map((i, k) => ({ x: wx(i), z: wz(i), w: [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0] }));
                const inRoomSide = tri.every((q) => q.x < X && q.z > ROOM.z0 && q.z < ROOM.z1);
                if (inRoomSide) continue;
                const outside = tri.every((q) => q.x >= X) || tri.every((q) => q.z <= ROOM.z0) || tri.every((q) => q.z >= ROOM.z1);
                if (outside) { emit(tri, v); continue; }
                // the parts outside the footprint: x >= X; else z <= z0; else z >= z1
                emit(clip(tri, (q) => q.x - X), v);
                const west = clip(tri, (q) => X - q.x);
                emit(clip(west, (q) => ROOM.z0 - q.z), v);
                emit(clip(west, (q) => q.z - ROOM.z1), v);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(out.p, 3));
            if (nor) geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.n, 3));
            if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.u, 2));
            geo.computeBoundingSphere();
            geo.computeBoundingBox();
            mesh.geometry = geo;
            g.dispose();
            mesh.userData.spikeRoomClipped = true;
            clipped += 1;
        });
        // The outer arcade's columns (X_Cube002-*) stood on that ground and now float over
        // the pit (Shaun, 09-28): drop every export triangle whose middle is on the room's
        // side of the wall's outer face. What is left inside the wall's thickness is hidden
        // in it, and the nave-side pilasters stay whole. The shell and the walled-up
        // openings (the room's own wall) are left alone.
        model.traverse((mesh) => {
            if (!mesh.isMesh || mesh.userData.spikeRoomCut || /^X_Plane$|^X_Cube003$|walled-up/.test(mesh.name || '')) return;
            const g = mesh.geometry;
            const pos = g.attributes.position;
            if (!pos) return;
            mesh.updateMatrixWorld(true);
            const e = mesh.matrixWorld.elements;
            const idx = g.index ? g.index.array : null;
            const n = idx ? idx.length : pos.count;
            const keep = [];
            let dropped = 0;
            for (let t = 0; t < n; t += 3) {
                const v = idx ? [idx[t], idx[t + 1], idx[t + 2]] : [t, t + 1, t + 2];
                let x = 0;
                let z = 0;
                v.forEach((i) => {
                    x += (e[0] * pos.getX(i)) + (e[4] * pos.getY(i)) + (e[8] * pos.getZ(i)) + e[12];
                    z += (e[2] * pos.getX(i)) + (e[6] * pos.getY(i)) + (e[10] * pos.getZ(i)) + e[14];
                });
                x /= 3;
                z /= 3;
                if (x < WALL.outer && z > ROOM.z0 && z < ROOM.z1) dropped += 1;
                else keep.push(v[0], v[1], v[2]);
            }
            mesh.userData.spikeRoomCut = true;
            if (!dropped) return;
            if (keep.length) g.setIndex(keep);
            else mesh.visible = false;
            clipped += 1;
        });
        return clipped;
    }

    function build(group, world, config) {
        const THREE = T();
        if (config && config.radius > 0) BODY_R = config.radius;
        if (config) {
            if (config.sprintSpeed > 0) PHYS.sprint = config.sprintSpeed;
            if (config.jumpSpeed > 0) PHYS.jump = config.jumpSpeed;
            if (config.gravity > 0) PHYS.gravity = config.gravity;
        }
        state.layout = null;
        state.routes = [];
        state.poles = [];
        state.boxes = [];
        state.relics = [];
        state.prize = null;
        state.candle = null;
        state.platformCandle = null;
        state.falls = 0;
        state.checkpoint = 'start';
        state.flash = 0;
        state.cooldown = 0;
        state.killed = false;
        state.triangles = 0;
        state.spikes = 0;
        if (!THREE || !world.level || world.level.environment !== 'cathedral' || !NW.Cathedral || !NW.Cathedral.get()) return null;
        const stone = stoneOf(NW.Cathedral.get().model);
        if (!stone) return null;
        state.groundClipped = clipExportGround(NW.Cathedral.get().model);
        const L = layout();
        state.layout = L;
        const index = Math.max(0, Math.min(5, (Number(world.phase) || 1) - 1));
        const random = makeRandom(((index + 1) * 60013) + 29);

        const root = new THREE.Group();
        root.name = 'spike-room';
        group.add(root);

        const laid = layRoutes(random);
        const poles = laid.poles;
        state.routes = laid.routes;
        state.poles = poles;
        state.triangles = buildStone(root, L, stone, poles);
        buildCaps(root, poles);
        state.spikes = buildSpikes(root, poles, random);
        state.boxes = colliders(poles);
        addColliders(world, state.boxes);
        // the floor parkour.js reads left of the nave (see "the floor parkour.js reads")
        world.extraField = { level: world.level, sample: sampler(L) };
        state.prize = placeReward(root, world, index, random);
        state.candle = placeStand(root, world);
        state.platformCandle = placePlatformStand(root, world);
        return root;
    }

    // ------------------------------------------------------------ the pit

    function inRoom(p) {
        return p.x < ROOM.x1 && p.x > ROOM.x0 - 0.2 && p.z > ROOM.z0 - 0.2 && p.z < ROOM.z1 + 0.2;
    }

    // Is the player inside the room (world.js updateDemon asks: she stays out).
    function holdsPlayer(world) {
        const p = world && world.player;
        return Boolean(state.layout && p && inRoom(p));
    }

    // The red beat a fall gets instead of a caught scene: one div over the canvas, made
    // once, opacity only. No light, no layout, nothing added to the scene.
    function flashElement() {
        let element = document.querySelector('.world-spike-flash');
        if (element) return element;
        const host = document.getElementById('world-3d');
        if (!host) return null;
        element = document.createElement('div');
        element.className = 'world-spike-flash';
        element.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;will-change:opacity;'
            + 'background:radial-gradient(ellipse at 50% 50%,rgba(120,0,10,0.55) 0%,rgba(40,0,4,0.92) 100%);';
        host.appendChild(element);
        return element;
    }

    function paintFlash() {
        const element = flashElement();
        if (!element) return;
        const value = Math.round(Math.max(0, Math.min(1, state.flash)) * 50) / 50;
        if (element.__shown === value) return;
        element.__shown = value;
        element.style.opacity = String(value);
    }

    // Shaun: "The player spawns at the last platform he reached (end or start platforms)."
    // The checkpoint is whichever of the two the feet last stood on.
    function onSlab(p, slab) {
        return p.x >= slab.x0 && p.x <= slab.x1 && p.z >= slab.z0 && p.z <= slab.z1
            && Math.abs(p.y - slab.top) < 0.25;
    }

    // Put the body back on the last platform reached, standing still: the entrance ledge
    // facing into the room, or the reward platform facing back toward the way out.
    function respawn(world) {
        const p = world.player;
        const atEnd = state.checkpoint === 'end';
        const slab = atEnd ? PLATFORM : LEDGE;
        p.x = atEnd ? (PLATFORM.x0 + PLATFORM.x1) / 2 : LEDGE.x1 - 1.1;
        p.z = (slab.z0 + slab.z1) / 2;
        p.y = slab.top;
        p.vx = 0;
        p.vz = 0;
        p.vy = 0;
        p.grounded = true;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.slide = 0;
        p.slideJump = false;
        p.rush = 0;
        p.rushChain = 0;
        p.yaw = atEnd ? -Math.PI / 2 : Math.PI / 2;   // start: into the room (-x); end: back out (+x)
        p.pitch = 0;
        p.viewY = p.y;
        p.dip = 0;
        p.dipVel = 0;
        if (p.climb) p.climb.active = false;
    }

    /**
     * world.js update, every playable frame.
     *
     * Shaun: "dying by falling on the spikes should not end the game, it should make you
     * respawn at the start of the spike room." So the spikes are a setback, not the end:
     * feet below KILL_Y inside the room give a short red beat and put the body back on the
     * entrance ledge, still holding everything it had picked up (the relics live in
     * gameState, and a reward already taken stays taken). `cooldown` keeps one fall from
     * firing twice while the body settles.
     *
     * The one exception: once Jane's wall has swept past the ledge there is nowhere safe to
     * put him back, so a fall then is the ordinary catch (`caught` is world.js nunCatches).
     */
    function update(world, config, dt, caught) {
        const p = world.player;
        if (!state.layout || !p) return false;
        if (state.platformCandle && state.platformCandle.lit) state.platformCandle.life = 1;
        if (state.flash > 0) {
            state.flash = Math.max(0, state.flash - (dt * 2.6));
            paintFlash();
        }
        state.cooldown = Math.max(0, state.cooldown - dt);
        if (onSlab(p, PLATFORM)) state.checkpoint = 'end';
        else if (onSlab(p, LEDGE)) state.checkpoint = 'start';
        if (world.caughtTriggered || state.cooldown > 0) return false;
        if (!(p.y <= KILL_Y) || !inRoom(p)) return false;
        const wall = NW.Aura && world.wall ? NW.Aura.wallZ() : Infinity;
        if (Number.isFinite(wall) && wall <= LEDGE.z1 + 0.5) {
            // nowhere to put him back: the wall has the room
            if (state.killed) return false;
            state.killed = true;
            if (typeof caught === 'function') caught();
            return true;
        }
        state.falls += 1;
        state.cooldown = 0.6;
        state.flash = 1;
        paintFlash();
        respawn(world);
        world.needsDraw = true;
        return true;
    }

    // Tests: the room as plain data. One chain per route, ledge edge -> pillars -> platform.
    function chainOf(route) {
        return [{ x: route.head.x, z: route.head.z, top: LEDGE.top, wide: LEDGE.z1 - LEDGE.z0, kind: 'ledge' }]
            .concat(route.poles.map((p) => ({ x: +p.x.toFixed(3), z: +p.z.toFixed(3), top: +p.top.toFixed(3), wide: +p.wide.toFixed(3), kind: p.rest ? 'rest' : 'pillar' })))
            .concat([{ x: route.tail.x, z: route.tail.z, top: PLATFORM.top, wide: PLATFORM.z1 - PLATFORM.z0, kind: 'platform' }]);
    }

    function info() {
        const L = state.layout;
        if (!L) return null;
        const routes = state.routes.map((route) => {
            const chain = chainOf(route);
            const gaps = [];
            for (let k = 1; k < chain.length; k += 1) gaps.push(+Math.hypot(chain[k].x - chain[k - 1].x, chain[k].z - chain[k - 1].z).toFixed(3));
            let length = 0;
            gaps.forEach((g) => { length += g; });
            return {
                id: route.id, poles: route.poles.length, chain, gaps,
                minGap: Math.min(...gaps), maxGap: Math.max(...gaps),
                minTop: +Math.min(...route.poles.map((p) => p.wide)).toFixed(2),
                maxTop: +Math.max(...route.poles.map((p) => p.wide)).toFixed(2),
                length: +length.toFixed(1),
                lowest: +Math.min(...route.poles.map((p) => p.top)).toFixed(2),
                highest: +Math.max(...route.poles.map((p) => p.top)).toFixed(2),
                steps: chain.slice(1).map((c, k) => +(c.top - chain[k].top).toFixed(2)),
                maxRise: Math.max(...chain.slice(1).map((c, k) => +(c.top - chain[k].top).toFixed(3))),
                maxDrop: Math.min(...chain.slice(1).map((c, k) => +(c.top - chain[k].top).toFixed(3))),
                rest: route.poles.filter((q) => q.rest).length
            };
        });
        return {
            door: L.door, room: ROOM, ledge: LEDGE, platform: PLATFORM,
            routes, poles: state.poles.length,
            spikes: state.spikes, triangles: state.triangles, killY: KILL_Y, killed: state.killed,
            prize: state.prize ? { x: state.prize.x, z: state.prize.z, y: state.prize.y, value: state.prize.value } : null,
            rewardValue: state.relics.reduce((sum, r) => sum + (r.value || 1), 0),
            candle: state.candle ? { x: state.candle.x, z: state.candle.z } : null,
            platformCandle: state.platformCandle
                ? { x: +state.platformCandle.x.toFixed(2), z: +state.platformCandle.z.toFixed(2), lit: state.platformCandle.lit, life: state.platformCandle.life, neverBurns: Boolean(state.platformCandle.neverBurns) }
                : null,
            falls: state.falls, bodyRadius: BODY_R,
            boxes: state.boxes.length
        };
    }

    // How many seconds until Jane's wall reaches a given z (the harness reads the race).
    function wallSeconds(world, z) {
        if (!NW.Aura || !world.wall) return Infinity;
        const at = NW.Aura.wallZ();
        if (!Number.isFinite(at)) return Infinity;
        const nun = world.nun;
        const speed = nun ? (nun.pace == null ? nun.speed : nun.pace) : 0;
        if (!(speed > 0.02)) return Infinity;
        return (at - z) / speed;
    }

    NW.SpikeRoom = {
        build, update, info, auraX0, doorway, wallSeconds, holdsPlayer,
        ROOM, LEDGE, PLATFORM, POLES, ROUTES, PRIZE, SPIKE, KILL_Y
    };
})();
