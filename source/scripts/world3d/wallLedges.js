/**
 * The Nun 3D — the nave's wall ledges (Shaun: "jumping on props and then on something on
 * the wall to catch higher value relic hanging off the wall").
 *
 * A few times per vigil a high-value relic (LEDGE.value, with the prize shimmer) hangs
 * high on a nave side wall, out of reach of anyone standing — or jumping — on the floor.
 * Under it, built into the wall, is a stone corbel shelf on a slim engaged pier: the
 * ledge. The route is the one Shaun asked for and nothing else works:
 *
 *     run at a prop  ->  climb onto its top  ->  jump from the top onto the ledge
 *                    ->  take the relic from the ledge.
 *
 * The numbers are not chosen by eye, they are the parkour code's own (parkour.js):
 *
 *   - A jump lifts the feet CONFIG.jumpSpeed^2 / (2 * CONFIG.gravity) = 0.57 m, and in
 *     the air the hands grab a ledge up to GRAB_REACH (1.7 m) over the feet, so from the
 *     flat floor nothing above 2.27 m can be climbed. LEDGE.top is 2.48 m: out of reach
 *     from the floor, and `fits` refuses a spot where anything else the player could
 *     mantle from the floor stands within LEDGE.clear of the pier.
 *   - From a prop top 1.15 m and up (cathedral.js's own climb-proven summits, the ones
 *     the reliquaries stand on) the same grab reaches 3.42 m and up, so the ledge is one
 *     honest jump away. cathedral.js only offers a spot with such a top within reach.
 *   - The relic hangs at LEDGE.relicY (3.05 m) and is taken by the normal rules
 *     (world.js findTarget, CONFIG.relicReachUp 0.9 m over the feet, within
 *     relicPickRange across the floor): 0.57 m over the ledge's own top, and 2.48 m over
 *     the floor even at a jump's peak. `fits` also refuses a spot where anything higher
 *     than relicY - jump - reach stands within LEDGE.guard of the relic, so it can never
 *     be plucked off the wall from the prop the player just climbed.
 *   - Seen from the floor it is a target, not a tease: findTarget hands it back as the
 *     'high' hint, "Out of reach · run at it and jump (Space) to climb up".
 *
 * The engine decides the shape as much as the fiction does. parkour.js only treats a box
 * as ground when its underside is less than CROUCH_ROOM over the floor and its top is no
 * higher than LIMIT (2.5 m), so a corbel floating on the wall would be a ceiling and
 * never climbable: the ledge is one box from the floor to its shelf, and the stone drawn
 * over it is exactly that box (a pier, a corbel flare, the slab), never a mesh that
 * promises less than it collides with.
 *
 * Stone, colliders and relics only: the nave's own shell material with the same
 * world-projected UVs the corridor uses, one merged mesh per level, no light of any kind
 * added, removed or hidden (world.js prewarm).
 *
 * Built by world.js buildLevel after corridor.js and before prewarm(); placed, seeded per
 * vigil, by cathedral.js (LEDGES_BY_VIGIL, placeWallLedges), which asks `fits` about
 * every candidate.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // The nave's stone is laid with one UV unit per this many metres (cathedral.js
    // SHELL_UV_METRES), projected from the world along each face's axis.
    const UV_METRES = 3;

    /**
     * The ledge, in metres. `top` is the surface the player stands on and is capped by
     * parkour.js LIMIT (2.5): a box taller than that is a wall, not a step.
     *
     * The DEPTH is not a constant, because the nave's walkable floor stops well short of
     * its walls: the height field goes blocked at x 19.0 while the shell's stone face is
     * at 19.739, and 5.0 against 4.326 on the other side (measured by raycast). A shelf
     * built on the field's edge floats three-quarters of a metre off the wall, which is
     * exactly what Shaun saw. So each ledge's back face sits on the real stone and its
     * depth is that dead strip plus `reach` of usable shelf over the walkable floor:
     * depth = |wall - edge| + reach. `land` is where the body ends up, measured back from
     * the slab's inner edge (parkour.js LANDINGS puts it 0.35 m past the edge it
     * grabbed), and `reach` is sized so the whole body footprint (radius 0.35) stands on
     * walkable floor — `fits` checks that footprint outright rather than trusting this.
     */
    const LEDGE = Object.freeze({
        reach: 0.95,       // usable shelf inside the walkable floor's edge
        land: 0.35,        // where the body lands, back from the slab's inner edge
        width: 1.4,        // the slab, along the wall
        top: 2.48,         // the standing surface
        slab: 0.18,        // the slab's thickness
        corbel: 0.1,       // the flare under it
        pierInset: 0.14,   // how far the pier below is set back from the slab's edges
        base: -0.4,        // the pier's foot, under the floor
        relicY: 3.05,      // where the relic hangs
        relicOut: 0.2,     // how far its face stands off the wall
        value: 3,          // worth this many relics (world.js takeRelic)
        clear: 2.0,        // nothing but floor or a real prop within this of the pier
        guard: 1.75,       // how far round the relic nothing may stand high enough to reach it
        minProp: 1.15,     // the shortest prop top a jump to the ledge may start from
        headroom: 4.35,    // the floor's head room a body standing on the shelf needs
        body: 0.38         // the body's radius, with a little to spare (world.js radius 0.35)
    });

    // How deep a ledge is at a spot: the dead strip between the walkable floor's edge and
    // the real wall, plus the usable shelf.
    function depthOf(spot) {
        return Math.abs(spot.wall - spot.edge) + LEDGE.reach;
    }

    // The slab's inner edge, and where the body lands on it.
    function innerEdge(spot) {
        return spot.wall + (spot.d * depthOf(spot));
    }

    const RES = 0.25;      // the height field's own cell, what every scan below steps by

    // The shell mesh and the raycaster wallFace uses, found once.
    const cache = { shell: null, ray: null };

    function T() {
        return window.THREE || null;
    }

    // A jump's peak over the feet, and the highest ledge the hands find from the floor.
    function jumpPeak(config) {
        const c = config || {};
        const up = c.jumpSpeed || 5;
        const g = c.gravity || 22;
        return (up * up) / (2 * g);
    }

    function grabReach() {
        return NW.Parkour && NW.Parkour.GRAB_REACH ? NW.Parkour.GRAB_REACH : 1.7;
    }

    // ------------------------------------------------------------ placement test

    /**
     * Is this a place for a ledge? `wall` is the wall face's x, `d` which way the pier
     * grows from it (-1: the wall is to the +x side, the nave's right; +1: its left) and
     * `z` the middle of the slab. cathedral.js calls this for every candidate; it
     * reads the same height field placement and parkour.js read (NW.Parkour.fieldAt,
     * the props' boxes laid on it), never the level's own colliders, which do not exist
     * yet when a level is laid out.
     *
     * Returns false unless, in order: the pier stands on clear flat floor with room over
     * it; nothing within LEDGE.clear of it could be mantled from the floor (only real
     * floor and real props are allowed beside it, never a plinth or a step); and nothing
     * within LEDGE.guard of the relic is high enough for the relic to be taken from it.
     */
    function fits(z, d, wall, edge, config) {
        const at = NW.Parkour && NW.Parkour.fieldAt;
        if (!at) return false;
        const spot = { z, d, wall, edge };
        const depth = depthOf(spot);
        const peak = jumpPeak(config);
        const reachUp = (config && config.relicReachUp) || 0.9;
        const pick = (config && config.relicPickRange) || 1.6;
        const relicX = wall + (d * LEDGE.relicOut);
        const stand = standPoint(spot);
        // nothing this high may stand near the relic: from its top, a jump plus the arms
        // would reach the relic (world.js findTarget)
        const tallest = LEDGE.relicY - peak - reachUp - 0.08;
        // ...and no stone this high beside the pier: from it a jump's grab would find the
        // shelf and the prop would be pointless. A real prop may stand there — climbing
        // one is the whole point — but the building's own plinths and steps may not.
        const step = LEDGE.top - peak - grabReach() - 0.02;
        const half = LEDGE.width / 2;
        // the body really stands where it lands, and the relic is really in reach from
        // there: the two things the whole ledge exists for, checked outright
        if (Math.hypot(stand.x - relicX, 0) > pick - 0.25) return false;
        for (let a = 0; a < 8; a += 1) {
            const ang = (a * Math.PI) / 4;
            if (!at(stand.x + (Math.cos(ang) * LEDGE.body), stand.z + (Math.sin(ang) * LEDGE.body))) return false;
        }
        // the shelf's own ground, over the walkable part of its footprint: flat floor
        // with room for a standing body above it, and no prop already there
        for (let out = RES / 2; out < depth; out += RES) {
            for (let along = -half + (RES / 2); along < half; along += RES) {
                const px = wall + (d * out);
                const pz = z + along;
                const sample = at(px, pz);
                if (!sample) continue;   // the dead strip at the wall's foot, or stone
                if (sample.ground > step || sample.ground < -0.12) return false;
                if (sample.ground + sample.clear < LEDGE.headroom) return false;
                if (NW.Parkour.boxAt && NW.Parkour.boxAt(px, pz)) return false;
            }
        }
        // round the pier: floor, stone, or a real prop — never something the player could
        // step or mantle onto from the floor and skip the jump
        const span = depth + LEDGE.clear;
        for (let out = -LEDGE.clear; out < span; out += RES) {
            for (let along = -half - LEDGE.clear; along <= half + LEDGE.clear; along += RES) {
                const px = wall + (d * out);
                const pz = z + along;
                if (Math.abs(along) <= half && out >= 0 && out <= depth) continue;
                const sample = at(px, pz);
                if (!sample || sample.ground <= step) continue;
                if (!NW.Parkour.boxAt || !NW.Parkour.boxAt(px, pz)) return false;
            }
        }
        // round the relic: nothing to take it from but the ledge itself
        for (let out = -LEDGE.guard; out <= LEDGE.guard; out += RES) {
            for (let along = -LEDGE.guard; along <= LEDGE.guard; along += RES) {
                if (Math.hypot(out, along) > LEDGE.guard) continue;
                const px = relicX + (d * out);
                const pz = z + along;
                // the ledge's own top is the one place it may be taken from
                const fromWall = LEDGE.relicOut + out;
                if (Math.abs(along) <= half && fromWall >= -0.01 && fromWall <= depth + 0.01) continue;
                const sample = at(px, pz);
                if (sample && sample.ground > tallest) return false;
            }
        }
        return true;
    }

    // The highest a prop top must be for a jump off it to grab the shelf, and the
    // farthest that jump carries: cathedral.js checks its climb-proven summits against
    // these before it offers a spot.
    function jumpFrom(config) {
        return {
            minTop: Math.max(LEDGE.minProp, LEDGE.top - jumpPeak(config) - grabReach()),
            // measured with a bot on each prop top: 1.0-1.5 m from the top to the landing is
            // one honest jump every time, 2.3 m never was (the refectory table beat it).
            maxRun: 1.9,
            minRun: 0.9
        };
    }

    // Where the body lands on a ledge (cathedral.js measures the jump to this point):
    // LEDGE.land back from the slab's inner edge, the way parkour.js LANDINGS lands it.
    function standPoint(spot) {
        return { x: innerEdge(spot) - (spot.d * LEDGE.land), z: spot.z };
    }

    /**
     * The real wall's face at (z), looking out from the nave's centre line the way `d`
     * says: -1 for the wall at +x, +1 for the wall at -x. Raycast, not assumed — the
     * height field's edge is most of a metre short of the stone (see LEDGE). Only the
     * re-stoned shell is tested, which is the nave's outer wall and twelve triangles, so
     * this is cheap enough to ask of every candidate.
     */
    function wallFace(z, d) {
        const THREE = T();
        const cat = NW.Cathedral && NW.Cathedral.get();
        if (!THREE || !cat || !cat.model) return null;
        if (!cache.shell) {
            const found = [];
            cat.model.traverse((object) => {
                // the re-stoned shell: Cube.003 is the walls, Plane.001 the floor (which a
                // level ray never meets, so keep them both and let the ray choose)
                if (object.isMesh && /^(X_)?(Cube\.?003|Plane\.?001)$/i.test(object.name || '')) found.push(object);
            });
            if (!found.length) return null;
            cache.shell = found;
        }
        if (!cache.ray) cache.ray = new THREE.Raycaster();
        const ray = cache.ray;
        ray.far = 14;
        let face = null;
        // at the shelf and again where the relic hangs: the same stone must be behind both
        for (let k = 0; k < 2; k += 1) {
            ray.set(new THREE.Vector3(12, k === 0 ? LEDGE.top : LEDGE.relicY, z), new THREE.Vector3(-d, 0, 0));
            const hits = ray.intersectObjects(cache.shell, true);
            if (!hits.length) return null;
            const x = hits[0].point.x;
            if (Math.abs(x - 12) < 5.5) return null;          // a pillar, not the outer wall
            if (face != null && Math.abs(x - face) > 0.05) return null;
            face = x;
        }
        return face;
    }

    // ------------------------------------------------------------ geometry

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

    Mesher.prototype.quad = function quad(a, b, c, e, n) {
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const facing = (((e1[1] * e2[2]) - (e1[2] * e2[1])) * n[0])
            + (((e1[2] * e2[0]) - (e1[0] * e2[2])) * n[1])
            + (((e1[0] * e2[1]) - (e1[1] * e2[0])) * n[2]);
        const order = facing < 0 ? [a, c, b, a, e, c] : [a, b, c, a, c, e];
        order.forEach((p) => {
            this.position.push(p[0], p[1], p[2]);
            this.normal.push(n[0], n[1], n[2]);
            const uv = projectUv(p, n);
            this.uv.push(uv[0], uv[1]);
        });
    };

    // An axis-aligned block. `skip` names faces left out: 'x0' 'x1' 'y0' 'y1' 'z0' 'z1'.
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

    // The nave's own wall stone (cathedral.js restoneShells), so a ledge reads as part of
    // the building rather than a prop dropped against it. Same choice corridor.js makes.
    function stoneOf(model) {
        let shell = null;
        let stone = null;
        model.traverse((object) => {
            if (!object.isMesh || Array.isArray(object.material)) return;
            if (/^(Cube\.003|Plane\.001)$/i.test(object.name)) shell = object;
            if (!stone && /^medieval_blocks/i.test(object.material.name || '') && object.material.map) stone = object.material;
        });
        const shellStone = shell && shell.material && shell.material.map && /^medieval_blocks/i.test(shell.material.name || '');
        return shellStone ? shell.material : stone;
    }

    // One ledge's stone: the pier, the corbel flare and the slab, all inside the one
    // collider box below, with the face against the wall left out.
    function carve(m, spot) {
        const d = spot.d;
        const wall = spot.wall;
        const depth = depthOf(spot);
        const half = LEDGE.width / 2;
        const inset = LEDGE.pierInset;
        const skip = d < 0 ? 'x1' : 'x0';
        const span = (out) => {
            const a = wall;
            const b = wall + (d * out);
            return [Math.min(a, b), Math.max(a, b)];
        };
        const slabBase = LEDGE.top - LEDGE.slab;
        const corbelBase = slabBase - LEDGE.corbel;
        // the engaged pier, floor to the corbel
        let [x0, x1] = span(depth - inset);
        m.box(x0, x1, LEDGE.base, corbelBase, spot.z - half + inset, spot.z + half - inset, skip);
        // the corbel flaring out to the slab
        [x0, x1] = span(depth - (inset / 2));
        m.box(x0, x1, corbelBase, slabBase, spot.z - half + (inset / 2), spot.z + half - (inset / 2), skip);
        // the slab the player stands on
        [x0, x1] = span(depth);
        m.box(x0, x1, slabBase, LEDGE.top, spot.z - half, spot.z + half, skip);
    }

    // ------------------------------------------------------------ colliders

    function collider(name, x, z, hu, hv, y0, y1) {
        return { name, kind: 'level', x, z, a: 0, c: 1, s: 0, hu, hv, y0, y1, r: Math.hypot(hu, hv) };
    }

    // One box per ledge, the slab's whole footprint from under the floor to its top, so
    // parkour.js reads it as ground (pointBoxes: a box whose underside is more than
    // CROUCH_ROOM over the floor is a ceiling, and one taller than LIMIT is a wall).
    function colliderFor(spot) {
        const depth = depthOf(spot);
        const [x0, x1] = spot.d < 0
            ? [spot.wall - depth, spot.wall]
            : [spot.wall, spot.wall + depth];
        return collider('wall ledge', (x0 + x1) / 2, spot.z, (x1 - x0) / 2, LEDGE.width / 2, -0.5, LEDGE.top);
    }

    // Into the level's colliders (parkour.js world.levelBoxes, built by stampHideouts and
    // added to by door.js and corridor.js), kept sorted by their bottoms like the rest.
    function addColliders(world, boxes) {
        const own = world.levelBoxes;
        if (!own || own.level !== world.level || !Array.isArray(own.all)) return false;
        if (Array.isArray(own.own)) own.own.push(...boxes);
        own.all = own.all.concat(boxes).sort((p, q) => p.y0 - q.y0);
        return true;
    }

    // ------------------------------------------------------------ the relic

    /**
     * The prize itself: models.js's cross or book, hung on the wall over the shelf and
     * marked a prize so its distance shimmer is the big breathing one (the player has to
     * see it from the floor to want it). It goes into world.relics like every other
     * relic — taken with E, lit by a pool, counted in its purse, remembered in
     * takenSpots — worth LEDGE.value, with the ordinary CONFIG.relicReachUp, which is
     * what makes the ledge the only place it can be taken from.
     */
    function hang(root, world, iron, spot, index) {
        const THREE = T();
        const kind = index % 2 === 0 ? 'cross' : 'book';
        const relic = NW.Models.makeRelic(kind);
        if (NW.Models.markRelicPrize) NW.Models.markRelicPrize(relic);
        const d = spot.d;
        const x = spot.wall + (d * LEDGE.relicOut);
        const y = LEDGE.relicY;
        const nail = (out) => {
            const a = spot.wall;
            const b = spot.wall + (d * out);
            return [Math.min(a, b), Math.max(a, b)];
        };
        if (kind === 'book') {
            // stood on a small iron bracket, spine out, the way the corridor's shelved
            // books stand (models.js makeRelic lies flat by default: the pivot tips it up)
            relic.userData.pivot.rotation.set(-Math.PI / 2, 0, (Math.random() - 0.5) * 0.12);
            relic.position.set(x, y, spot.z);
            relic.rotation.y = d < 0 ? Math.PI / 2 : -Math.PI / 2;
            const [b0, b1] = nail(LEDGE.relicOut + 0.12);
            iron.box(b0, b1, y - 0.21, y - 0.185, spot.z - 0.22, spot.z + 0.22);
            [spot.z - 0.17, spot.z + 0.17].forEach((bz) => {
                const [s0, s1] = nail(0.04);
                iron.box(s0, s1, y - 0.36, y - 0.21, bz - 0.016, bz + 0.016);
            });
        } else {
            // upright against the stone, a little askew, on an iron nail over it
            relic.userData.pivot.rotation.set(0, 0, (Math.random() - 0.5) * 0.16);
            relic.position.set(x, y, spot.z);
            relic.rotation.y = d < 0 ? -Math.PI / 2 : Math.PI / 2;
            const [n0, n1] = nail(LEDGE.relicOut + 0.05);
            iron.box(n0, n1, y + 0.22, y + 0.25, spot.z - 0.015, spot.z + 0.015);
        }
        root.add(relic);
        const entry = {
            mesh: relic, kind, x, z: spot.z, y,
            value: LEDGE.value, reliquary: false, hidden: false, taken: false, onLedge: true
        };
        world.relics.push(entry);
        return entry;
    }

    // ------------------------------------------------------------ build

    /**
     * world.js buildLevel, after corridor.js and before prewarm(): this vigil's ledges
     * (cathedral.js level.wallLedges) as stone, colliders and relics. `group` is the
     * level's group, thrown away with it.
     */
    function build(group, world, config) {
        const THREE = T();
        world.wallLedges = [];
        const spots = world.level && Array.isArray(world.level.wallLedges) ? world.level.wallLedges : null;
        if (!THREE || !spots || !spots.length || !NW.Cathedral || !NW.Cathedral.get() || !NW.Models) return null;
        const stone = stoneOf(NW.Cathedral.get().model);
        if (!stone) return null;

        const root = new THREE.Group();
        root.name = 'wall-ledges';
        const m = new Mesher();
        const iron = new Mesher();
        const boxes = [];
        spots.forEach((spot, index) => {
            carve(m, spot);
            boxes.push(colliderFor(spot));
            const relic = hang(root, world, iron, spot, index);
            const stand = standPoint(spot);
            world.wallLedges.push({
                x: spot.x, z: spot.z, d: spot.d, wall: spot.wall, edge: spot.edge,
                depth: depthOf(spot), top: LEDGE.top, stand, relic
            });
        });
        const mesh = new THREE.Mesh(m.geometry(THREE), stone);
        mesh.name = 'wall-ledge-stone';
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
        if (iron.position.length) {
            const irons = new THREE.Mesh(iron.geometry(THREE), NW.Models.material('iron'));
            irons.name = 'wall-ledge-iron';
            irons.matrixAutoUpdate = false;
            root.add(irons);
        }
        group.add(root);
        addColliders(world, boxes);
        return { ledges: world.wallLedges.length, boxes: boxes.length };
    }

    NW.WallLedges = {
        LEDGE,
        fits,
        jumpFrom,
        standPoint,
        depthOf,
        wallFace,
        build
    };
})();
