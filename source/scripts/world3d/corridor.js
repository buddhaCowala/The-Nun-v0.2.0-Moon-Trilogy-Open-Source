/**
 * The Nun 3D — the corridor behind the side door (Shaun's "door room").
 *
 * Shaun: "I want a straight corridor and it's normal the player won't be able to see
 * where the nun is. it's the point, it's stressful. Also, there should be way way more
 * crosses and books there" — and, from the first brief: "Same wall style as the normal
 * room, built like a long corridor. Inside this room there is a lot of books and crosses
 * hang on the right and left walls of the corridor. Also, there is candles in the
 * corridor but not very close so a bit dangerous because when the demon spawns, it will
 * run in the corridor."
 *
 * The side door (cathedral.js NW.Cathedral.sideDoorway, door.js) is in the nave's right
 * wall by the altar, its normal pointing into the nave, so walking through it goes +x.
 * The corridor carries straight on that way and dead-ends: one blind hall from the wall's
 * back face (x 20.63) to x 75 — about 54 m — two metres wide, on the door's own centre
 * line (z 9 to 11). Nothing of the nave can be seen from inside, by design: the player
 * cannot tell where Jane is while he is in there.
 *
 *   - Stone: the nave's own (the re-stoned shell's material, cathedral.js restoneShells),
 *     its UVs projected from the world the same way, so it continues the nave's walls; a
 *     barrel vault on transverse ribs closes it, and it lays its own floor (the export's
 *     ground stops at x 24).
 *   - The near end needs nothing: cathedral.js wallUpOpenings already stones the wall's
 *     back face at x 20.627 over z 7.01-13.17 with the doorway cut out of it.
 *   - Walking: past the height field (x 19) the player walks the level's 1 m grid, which
 *     is also the girls' map. The export's grid is 24 columns (x 0-24) and the corridor
 *     runs past that, so stampMap widens every row and opens the corridor's cells on
 *     level.map before it is parsed (parseLevel takes the widest row as the width, and
 *     every reader goes through grid.width). The cells the door plane stands in stay
 *     stone until world.sideDoorOpen (door.js), then the grid is read again (link), so
 *     the Demoness paths and spawns in the corridor only once it is open. The exact walls
 *     are boxes in world.levelBoxes (parkour.js), like the hiding tables' and the door's.
 *   - Books on shelves and crosses on nails run the whole length of both walls, at head
 *     height: fifteen of each per vigil (WALL_RELICS_BY_VIGIL, Shaun's own count). Every book
 *     and every cross on those walls is a real relic in world.relics — nothing is
 *     decoration to reach for and fail — and each carries its own `reachUp` (MOUNT.reach),
 *     which world.js findTarget honours instead of CONFIG.relicReachUp, so a cross at head
 *     height is taken standing rather than asking for a climb. Candle stands stand far
 *     apart (Shaun: "not very close, so a bit dangerous"), in world.candles. Both are
 *     flagged behindDoor, like the nave's in every other way.
 *   - At the dead end, on a stone shelf at head height, one reliquary worth PRIZE.value
 *     relics (the nave's best pickup is 3): the only reason to walk the whole 54 m away
 *     from the altar, and the decision "do I go all the way in?" the hall was missing.
 *     It carries MOUNT.reach like the wall relics, so it is taken standing, never climbed.
 *   - The one warning inside: from GUTTER.lead seconds before Jane's wall reaches the
 *     mouth, the corridor's flames gutter and the dread vignette rises on a player who is
 *     in there (update). Flame scale, halo opacity and pool-light intensity only — no
 *     light is added, removed or hidden (world.js prewarm) — and it says "soon", never
 *     where she is.
 *   - Jane's wall (aura.js) is a plane of constant z across the whole building, so it
 *     lies along this corridor rather than across it: it reaches z 11 only in the last
 *     seconds of a vigil and then sweeps the whole length at once. A player still inside
 *     is pushed against the near wall with nowhere to give and taken, like any other
 *     pinned case.
 *
 * Built with the level (world.js buildLevel, after door.js, before prewarm) and thrown
 * away with it; no lights of its own.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // The nave's stone is laid with one UV unit per this many metres (cathedral.js
    // SHELL_UV_METRES), projected from the world along each face's axis.
    const UV_METRES = 3;

    // The side doorway when cathedral.js publishes none (the one it publishes).
    const FALLBACK_DOOR = { x: 20.183, z: 10.092, width: 1.4, height: 2.5, nx: -1, nz: 0, depth: 0.888 };

    // The nave's right wall as exported: the shell box's slab (Cube.003), its nave face at
    // x 19.74 and its back face at 20.63. cathedral.js GATE_HOLES closes the transept
    // gate's hole (z 7.01-13.17) around the doorway, on both faces, so the corridor's near
    // end is already stone.
    const SLAB = { nave: 19.7395, back: 20.627 };

    // The corridor: where it ends (x), the vault's springing, the walls' thickness, the
    // end wall's thickness, the floor slab's top (a hair over the export's ground, which
    // it hides) and how deep that slab goes.
    const HALL = { deep: 75, spring: 3, wall: 0.45, end: 0.4, floor: 0.012, sink: 0.35 };

    // Transverse ribs across the vault, bay by bay like the nave's: this far from each end,
    // about this far apart (m), each rib's width along the corridor, its depth under the
    // vault and the flat pilaster it springs from on both walls.
    const RIB = { first: 1.6, step: 4, width: 0.45, depth: 0.14, pilaster: 0.14 };

    // Where parkour.js's height field ends on the right (x, m): past it the player walks
    // the level's grid.
    const FIELD_EDGE = 19;

    // What hangs on the walls, per vigil (Shaun: "15 books and 15 crosses please for twice
    // the length"). One table, one row per vigil: tune it here.
    const WALL_RELICS_BY_VIGIL = [
        { cross: 15, book: 15 },
        { cross: 15, book: 15 },
        { cross: 15, book: 15 },
        { cross: 15, book: 15 },
        { cross: 15, book: 15 },
        { cross: 15, book: 15 }
    ];
    // How they are hung: one to a spot, spots shared out evenly over the corridor's whole
    // length and alternating walls (so something stands every metre or so as you walk),
    // at head height on alternating tiers — in a corridor lit only by a candle at arm's
    // length, anything at knee height is never seen. `reach` is each one's own reachUp
    // (world.js findTarget): CONFIG.relicReachUp is the reach for something lying on top
    // of a prop, which is a climb; a cross on a wall at head height is not.
    const MOUNT = {
        tiers: [1.28, 1.64, 1.06], reach: 1.9, clear: 0.8,
        board: 0.32, boardThick: 0.035, bookRise: 0.19, bookDepth: 0.165, boardWide: 0.44
    };
    // Candle stands, far apart (Shaun: "not very close, so a bit dangerous"): this many
    // per vigil, one to each stretch of the corridor, against alternate walls. The counts
    // are the corridor's length divided by the gap, not a fixed number of lights: doubling
    // the hall doubled them so the dark stretches between stands stayed the same size
    // (~9 m in the first three vigils, ~13 m in the last three).
    const STANDS_BY_VIGIL = [6, 6, 6, 4, 4, 4];
    const STAND_OFF_WALL = 0.36;

    // The prize at the dead end: one reliquary (models.js makeReliquary, the nave's own)
    // on a stone shelf built into the end wall, 54 m in and blind — the only thing in the
    // game worth walking the whole corridor away from the altar for. It stands at head
    // height on MOUNT's own tiers and carries MOUNT.reach, so it is taken standing: a
    // climb prompt in a 2 m corridor would be a lie. Alternates purse by vigil.
    const PRIZE = { value: 6, y: 1.22, depth: 0.5, wide: 0.92, slab: 0.11, corbel: 0.16, off: 0.26 };

    // The one warning the corridor gives. Jane's wall is a plane of constant z, so it
    // reaches the mouth (z zFar) and then sweeps the whole hall at once; from `lead`
    // seconds before that the corridor's flames gutter (scale and intensity only — the
    // lights are prewarmed, never added, removed or hidden) and the dread vignette rises
    // on whoever is inside. It says "soon", never where she is: Shaun's "you can't see
    // where the nun is, it's the point" stands.
    const GUTTER = { lead: 8, dip: 0.55, dread: 0.34 };

    const state = { layout: null, linked: false, boxes: [], relics: 0, stands: 0, candles: [], prize: null, vignette: 0 };

    function T() {
        return window.THREE;
    }

    // The first and last 1 m grid cells (inclusive) a span of metres a0..a1 covers.
    function cellsOver(a0, a1) {
        return [Math.floor(a0), Math.floor(a1 - 1e-6)];
    }

    // ------------------------------------------------------------ the layout

    // The doorway (cathedral.js's, else the fallback) and the corridor laid straight on
    // behind it. The corridor belongs behind the nave's right wall by the altar: a doorway
    // published anywhere else (a test's) leaves it where the real one is.
    function layout() {
        const p = NW.Cathedral && NW.Cathedral.sideDoorway;
        const inRightWall = p && Number.isFinite(p.x) && Number.isFinite(p.z) && p.nx < -0.9 && Math.abs(p.nz || 0) < 0.3
            && p.x > SLAB.nave - 0.3 && p.x < SLAB.back + 0.3 && p.z > 8 && p.z < 12.5;
        const door = Object.assign({}, FALLBACK_DOOR, inRightWall ? p : {});
        const depth = Number.isFinite(door.depth) ? door.depth : SLAB.back - SLAB.nave;
        const back = door.x + (depth / 2);
        const doorZ0 = door.z - (door.width / 2);
        const doorZ1 = door.z + (door.width / 2);
        // Its walls stand on whole grid lines (the girls walk the 1 m cells, so a wall
        // through the middle of one would put them in stone), just clear of the jambs.
        const zNear = Math.floor(doorZ0 - 0.15);
        const zFar = Math.max(zNear + 2, Math.ceil(doorZ1 + 0.15));
        return {
            door,
            back,                                 // the right wall's back face: the corridor's start
            doorZ0,
            doorZ1,
            // how far the open leaf reaches down the corridor (door.js: hinged on the
            // altar-side jamb, it swings 88 degrees and lies along the near wall)
            leaf: door.x + 0.1 + door.width,
            deep: HALL.deep,                      // the dead end's inner face (x)
            zNear,
            zFar,
            spring: HALL.spring,
            radius: (zFar - zNear) / 2
        };
    }

    // ------------------------------------------------------------ geometry

    // Triangles with normals and the nave's world-projected stone UVs.
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

    // One flat quad, its corners in order round it, facing n (wound to match).
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

    // An axis-aligned block. `skip` names faces left out: 'x0' 'x1' 'y0' 'y1' 'z0' 'z1'
    // (the low / high side on each axis).
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

    // A barrel vault down the corridor (its axis along x), springing at y over z0..z1,
    // from x0 to x1: its inside, shaded round, the stone laid along its curve (u along x,
    // v round it). Each face is wound toward its own normal: r147 flips a back face's
    // normals, so a face seen from the wrong side shades as if it faced away.
    Mesher.prototype.vault = function vault(z0, z1, y, x0, x1, segments) {
        const r = (z1 - z0) / 2;
        const cz = z0 + r;
        const ring = [];
        for (let i = 0; i <= segments; i += 1) {
            const a = (Math.PI * i) / segments;
            ring.push({ z: cz - (r * Math.cos(a)), y: y + (r * Math.sin(a)), ny: -Math.sin(a), nz: Math.cos(a), v: (r * a) / UV_METRES });
        }
        const put = (p, x) => {
            this.position.push(x, p.y, p.z);
            this.normal.push(0, p.ny, p.nz);
            this.uv.push(x / UV_METRES, p.v);
        };
        for (let i = 0; i < segments; i += 1) {
            const p = ring[i];
            const q = ring[i + 1];
            put(p, x0); put(q, x1); put(q, x0);
            put(p, x0); put(p, x1); put(q, x1);
        }
    };

    // A transverse rib under that vault at xc: an arched band `depth` deep below the
    // vault, `width` along the corridor (its underside and both faces).
    Mesher.prototype.rib = function rib(z0, z1, y, xc, width, depth, segments) {
        const r = (z1 - z0) / 2;
        const cz = z0 + r;
        const x0 = xc - (width / 2);
        const x1 = xc + (width / 2);
        const at = (a, radius) => [cz - (radius * Math.cos(a)), y + (radius * Math.sin(a))];
        for (let i = 0; i < segments; i += 1) {
            const a0 = (Math.PI * i) / segments;
            const a1 = (Math.PI * (i + 1)) / segments;
            const am = (a0 + a1) / 2;
            const p0 = at(a0, r - depth);
            const p1 = at(a1, r - depth);
            const q0 = at(a0, r);
            const q1 = at(a1, r);
            // the underside, facing the arch's centre
            this.quad([x0, p0[1], p0[0]], [x0, p1[1], p1[0]], [x1, p1[1], p1[0]], [x1, p0[1], p0[0]], [0, -Math.sin(am), Math.cos(am)]);
            // its two faces along the corridor
            this.quad([x0, p0[1], p0[0]], [x0, q0[1], q0[0]], [x0, q1[1], q1[0]], [x0, p1[1], p1[0]], [-1, 0, 0]);
            this.quad([x1, p0[1], p0[0]], [x1, p1[1], p1[0]], [x1, q1[1], q1[0]], [x1, q0[1], q0[0]], [1, 0, 0]);
        }
    };

    Mesher.prototype.geometry = function geometry(THREE) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.computeBoundingSphere();
        return g;
    };

    // ------------------------------------------------------------ the nave's stone

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

    // ------------------------------------------------------------ walking and the grid
    //
    // Beyond the height field (x 19, parkour.js) the player walks the level's 1 m grid,
    // which is also the girls' map. The cathedral masks it off past the nave's right wall
    // and the export only reaches x 24, so the doorway strip and the corridor are opened
    // on a widened map before it is parsed: the cells in front of the door always (the
    // recess up to the wall's face), the corridor's cells always, and the cells the door
    // plane stands in only once the door is open (link). Until then the corridor is walled
    // off on the grid: the Demoness can neither path nor spawn in it, and Jane's walk
    // never sees it.

    // The corridor's cells: its rows; in front of the door plane (the recess, from where
    // the height field ends up to the wall's face); the door plane's own cells; and the
    // hall itself.
    function cells(L) {
        const [z0, z1] = cellsOver(L.zNear, L.zFar);
        const [p0, p1] = cellsOver(L.door.x, L.back);
        const [, h1] = cellsOver(L.back, L.deep);
        return { rows: [z0, z1], front: [Math.min(FIELD_EDGE, p0 - 1), p0 - 1], plane: [p0, p1], hall: [p1 + 1, h1] };
    }

    // world.js buildLevel, on the cathedral's level before it is parsed. The map is also
    // widened here: parseLevel takes the widest row as the grid's width and every reader
    // goes through grid.width, so the whole engine follows.
    function stampMap(level) {
        if (!level || level.environment !== 'cathedral' || !Array.isArray(level.map)) return;
        const L = layout();
        const width = Math.max(
            level.map.reduce((most, row) => Math.max(most, row.length), 0),
            Math.floor(L.deep + HALL.end) + 2
        );
        const rows = level.map.map((row) => {
            const line = row.split('');
            while (line.length < width) line.push('#');
            return line;
        });
        const set = (x, z, ch) => {
            if (rows[z] && x >= 0 && x < rows[z].length) rows[z][x] = ch;
        };
        const c = cells(L);
        for (let z = c.rows[0]; z <= c.rows[1]; z += 1) {
            for (let x = c.front[0]; x <= c.front[1]; x += 1) set(x, z, '.');
            for (let x = c.plane[0]; x <= c.plane[1]; x += 1) set(x, z, '#');
            for (let x = c.hall[0]; x <= c.hall[1]; x += 1) set(x, z, '.');
        }
        level.map = rows.map((row) => row.join(''));
    }

    // The door is open (door.js sets world.sideDoorOpen at the end of its swing): the
    // cells it stood in join the grid, which is read again; the girls' paths are redone.
    function link(world) {
        const L = state.layout;
        if (!L || !world.level || !world.parsed || !NW.parseLevel) return;
        const c = cells(L);
        const rows = world.level.map.map((row) => row.split(''));
        for (let z = c.rows[0]; z <= c.rows[1]; z += 1) {
            for (let x = c.plane[0]; x <= c.plane[1]; x += 1) {
                if (rows[z] && x < rows[z].length) rows[z][x] = '.';
            }
        }
        world.level.map = rows.map((row) => row.join(''));
        world.parsed.grid = NW.parseLevel(world.level).grid;
        world.parsed.connected = null;
        world.playerField = null;
        world.fieldCell = '';
        world.fieldTimer = 0;
        state.linked = true;
    }

    // ------------------------------------------------------------ the buzzer
    //
    // How long until Jane's wall reaches the corridor's mouth, in seconds, from where it
    // stands and how fast she is walking (world.js nunPace; aura.js wallZ never gives
    // ground back). Infinity before she is out. Measured in her metres per second, not in
    // frames, so the harness's fast steps read the same as play.
    function wallSeconds(world) {
        const L = state.layout;
        if (!L || !NW.Aura || !world.wall) return Infinity;
        const z = NW.Aura.wallZ();
        if (!Number.isFinite(z)) return Infinity;
        const nun = world.nun;
        const speed = nun ? (nun.pace == null ? nun.speed : nun.pace) : 0;
        if (!(speed > 0.02)) return Infinity;
        return (z - L.zFar) / speed;
    }

    // 0 while there is time, 1 once the wall is at the mouth or past it.
    function gutterLevel(world) {
        const left = wallSeconds(world);
        if (!Number.isFinite(left)) return 0;
        return Math.max(0, Math.min(1, (GUTTER.lead - left) / GUTTER.lead));
    }

    // The corridor's own stands gutter: every frame world.js updateLights has just set
    // each flame's scale, its halo's opacity and the pool lights' intensity from scratch,
    // so scaling them here is the whole effect. No light is added, removed or hidden
    // (world.js prewarm): intensity only, and never to a stand outside the corridor.
    function gutter(world, level) {
        if (!state.candles.length) return;
        const dips = [];
        state.candles.forEach((candle) => {
            const data = candle.mesh && candle.mesh.userData;
            if (!candle.lit || !data || !data.flames) return;
            // each stand dips on its own beat, deeper as the level rises
            const wobble = 0.5 + (0.3 * Math.sin((data.t * 11) + candle.x)) + (0.2 * Math.sin((data.t * 17) + candle.z));
            const dip = Math.max(0.12, 1 - (GUTTER.dip * level * Math.max(0, wobble)));
            data.flames.forEach((flame) => flame.scale.multiplyScalar(dip));
            if (data.halo) data.halo.material.opacity *= dip;
            dips.push({ candle, dip });
        });
        (world.poolLights || []).forEach((light) => {
            if (!(light.intensity > 0)) return;
            const match = dips.find((d) => Math.abs(light.position.x - d.candle.x) < 0.02 && Math.abs(light.position.z - d.candle.z) < 0.02);
            if (match) light.intensity *= match.dip;
        });
    }

    // The dread vignette aura.js owns (its element, so there is only ever one), raised on
    // a player who is inside the corridor while the wall closes on the mouth. aura.js
    // paints it earlier in the frame, so this writes last and wins; its memo is cleared so
    // it repaints its own value the moment the corridor stops asking.
    function dread(world, amount) {
        const element = document.querySelector('.world-aura-vignette');
        if (!element) return;
        const value = Math.round(Math.max(0, Math.min(1, amount)) * 50) / 50;
        const shown = NW.Aura && NW.Aura.state ? NW.Aura.state.vignetteShown : 0;
        if (value <= 0) {
            if (state.vignette > 0) {
                state.vignette = 0;
                element.style.opacity = '0';
                if (NW.Aura && NW.Aura.state) NW.Aura.state.vignetteShown = -1;   // aura.js repaints its own next frame
            }
            return;
        }
        state.vignette = value;
        element.style.opacity = String(Math.max(value, shown > 0 ? shown : 0));
        if (NW.Aura && NW.Aura.state) NW.Aura.state.vignetteShown = -1;
    }

    // Is the player in the hall (not the doorway's recess)?
    function inside(world) {
        const L = state.layout;
        const p = world.player;
        return Boolean(L && p && p.x > L.back && p.x < L.deep && p.z > L.zNear - 0.5 && p.z < L.zFar + 0.5);
    }

    // world.js update, every playable frame (after door.js).
    function update(world, playSfx, dt) {
        if (!state.linked && state.layout && world.sideDoorOpen) link(world);
        if (!state.layout) return;
        const level = gutterLevel(world);
        if (level > 0) gutter(world, level);
        dread(world, inside(world) ? level * GUTTER.dread : 0);
        if (NW.Apparition) NW.Apparition.update(world, playSfx, dt);
    }

    // A collider box for parkour.js (its makeBox shape): centre, the angle of its u side
    // from +x toward +z, half sizes, bottom and top.
    function collider(name, x, z, a, hu, hv, y0, y1) {
        return { name, kind: 'level', x, z, a, c: Math.cos(a), s: Math.sin(a), hu, hv, y0, y1, r: Math.hypot(hu, hv) };
    }

    // The exact walls (the grid alone is 1 m coarse, and the doorway strip is inside one
    // cell): the doorway's jambs in the wall's whole thickness, the two long walls and the
    // dead end. The open leaf is door.js's own box; it lies along the near wall, and the
    // 0.4 m behind it is narrower than the body, so there is nothing to be wedged into.
    function colliders(L) {
        const boxes = [];
        const aa = (name, x0, x1, z0, z1) => boxes.push(collider(name, (x0 + x1) / 2, (z0 + z1) / 2, 0, (x1 - x0) / 2, (z1 - z0) / 2, -0.5, 5));
        aa('corridor jamb', SLAB.nave, L.back, L.zNear, L.doorZ0);
        aa('corridor jamb', SLAB.nave, L.back, L.doorZ1, L.zFar);
        aa('corridor wall', L.back, L.deep + HALL.end, L.zNear - HALL.wall, L.zNear);
        aa('corridor wall', L.back, L.deep + HALL.end, L.zFar, L.zFar + HALL.wall);
        aa('corridor end wall', L.deep, L.deep + HALL.end, L.zNear - HALL.wall, L.zFar + HALL.wall);
        return boxes;
    }

    // Into the level's colliders (parkour.js world.levelBoxes, built by stampHideouts and
    // added to by door.js), kept sorted by their bottoms like the rest.
    function addColliders(world, boxes) {
        const own = world.levelBoxes;
        if (!own || own.level !== world.level || !Array.isArray(own.all)) return false;
        if (Array.isArray(own.own)) own.own.push(...boxes);
        own.all = own.all.concat(boxes).sort((p, q) => p.y0 - q.y0);
        return true;
    }

    // ------------------------------------------------------------ build

    // Where the ribs cross the vault (x), evenly over the corridor's length.
    function ribXs(L) {
        const x0 = L.back + RIB.first;
        const x1 = L.deep - RIB.first;
        if (x1 <= x0) return [];
        const bays = Math.max(1, Math.round((x1 - x0) / RIB.step));
        const list = [];
        for (let k = 0; k <= bays; k += 1) list.push(x0 + (((x1 - x0) * k) / bays));
        return list;
    }

    // The corridor's stone as one mesh: its floor slab, the two long walls, the dead end,
    // the barrel vault, and a rib with its two pilasters at each bay.
    function buildStone(root, L, stone, ribs) {
        const THREE = T();
        const m = new Mesher();
        const floor = HALL.floor;
        const crown = L.spring + L.radius + 0.3;
        const x0 = L.back;
        const x1 = L.deep;
        const xEnd = L.deep + HALL.end;
        // the floor: the export's ground stops at x 24, so the corridor lays its own, a
        // hair above it (one stone floor the whole way, no seam where the export ends)
        m.box(x0, x1, floor - HALL.sink, floor, L.zNear, L.zFar, 'x0 x1 y0 z0 z1');
        // the two long walls, their corridor faces only
        m.box(x0, xEnd, floor, L.spring, L.zNear - HALL.wall, L.zNear, 'x0 x1 y0 y1 z0');
        m.box(x0, xEnd, floor, L.spring, L.zFar, L.zFar + HALL.wall, 'x0 x1 y0 y1 z1');
        // the dead end, up past the vault's crown
        m.box(x1, xEnd, floor, crown, L.zNear - HALL.wall, L.zFar + HALL.wall, 'x1 y0 y1 z0 z1');
        // the shelf at the dead end that carries the reliquary: a stone slab on two
        // corbels, at head height, so the prize stands where the corridor stops
        const zc = (L.zNear + L.zFar) / 2;
        const top = PRIZE.y;
        m.box(x1 - PRIZE.depth, x1, top - PRIZE.slab, top, zc - (PRIZE.wide / 2), zc + (PRIZE.wide / 2), 'x1');
        [-1, 1].forEach((s) => {
            const cz = zc + (s * ((PRIZE.wide / 2) - 0.13));
            m.box(x1 - PRIZE.corbel, x1, top - PRIZE.slab - 0.2, top - PRIZE.slab, cz - 0.06, cz + 0.06, 'x1');
        });
        m.vault(L.zNear, L.zFar, L.spring, x0, x1, 14);
        ribs.forEach((x) => {
            m.rib(L.zNear, L.zFar, L.spring, x, RIB.width, RIB.depth, 14);
            const a = x - (RIB.width / 2) - 0.03;
            const b = x + (RIB.width / 2) + 0.03;
            m.box(a, b, floor, L.spring, L.zNear, L.zNear + RIB.pilaster, 'y0 y1 z0');
            m.box(a, b, floor, L.spring, L.zFar - RIB.pilaster, L.zFar, 'y0 y1 z1');
        });
        const mesh = new THREE.Mesh(m.geometry(THREE), stone);
        mesh.name = 'corridor-stone';
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
        return m.position.length / 9;
    }

    // ------------------------------------------------------------ stands and relics

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

    // The two long walls: the face (z), which way is into the corridor, and the stretch of
    // x where things may hang — clear of the door's swing on the near wall, and of both end
    // walls.
    function walls(L) {
        const deep = L.deep - 0.55;
        return [
            { side: 'near', face: L.zNear, dir: 1, x0: Math.max(L.back + 0.6, L.leaf + 0.25), x1: deep },
            { side: 'far', face: L.zFar, dir: -1, x0: L.back + 0.6, x1: deep }
        ];
    }

    function clearOf(x, keep, half) {
        return keep.every((k) => Math.abs(x - k) > half);
    }

    // One stand to each stretch of the corridor, against alternate walls, so keeping to the
    // light zig-zags and the dark between them is long: [{ side, x, z }].
    function standSpots(L, count, random) {
        const sides = walls(L);
        const first = random() < 0.5 ? 0 : 1;
        const spots = [];
        const x0 = sides[1].x0;
        const stretch = (sides[1].x1 - x0) / Math.max(1, count);
        for (let k = 0; k < count; k += 1) {
            const wall = sides[(k + first) % 2];
            const x = Math.max(wall.x0, Math.min(wall.x1, x0 + (stretch * (k + 0.5)) + ((random() - 0.5) * stretch * 0.3)));
            spots.push({ side: wall.side, x, z: wall.face + (wall.dir * STAND_OFF_WALL) });
        }
        return spots;
    }

    /**
     * Where the relics hang. The vigil's crosses and books are dealt out one to a spot,
     * alternating kind and alternating wall, and the spots run the whole length of the
     * corridor evenly — the two walls half a step out of phase, so walking down it there
     * is something on one side or the other every metre or so. Each takes the next of
     * MOUNT.tiers, so they sit at head height and are not all in a line. A spot steps
     * aside for the ribs' pilasters and the candle stands.
     * -> [{ side, face, dir, kind, y, x }]
     */
    function mountSpots(L, table, random, stands, ribs) {
        const sides = walls(L);
        const order = [];
        const left = { cross: Math.max(0, table.cross | 0), book: Math.max(0, table.book | 0) };
        while (left.cross > 0 || left.book > 0) {
            // alternate, and whichever is behind goes next, so the two run out together
            const kind = left.cross > left.book || (left.cross === left.book && order.length % 2 === 0) ? 'cross' : 'book';
            left[kind] -= 1;
            order.push(kind);
        }
        const total = order.length;
        if (!total) return [];
        const perWall = [Math.ceil(total / 2), Math.floor(total / 2)];
        const seen = [0, 0];
        return order.map((kind, n) => {
            const w = n % 2;
            const wall = sides[w];
            const k = seen[w];
            seen[w] += 1;
            const span = wall.x1 - wall.x0;
            const slot = span / Math.max(1, perWall[w]);
            const centre = wall.x0 + (slot * (k + (w === 0 ? 0.5 : 0.2))) + ((random() - 0.5) * slot * 0.2);
            const half = (kind === 'book' ? MOUNT.boardWide / 2 : 0.16) + 0.1;
            const near = stands.filter((s) => s.side === wall.side).map((s) => s.x);
            let x = null;
            for (let step = 0; step <= 14 && x === null; step += 1) {
                const tryX = centre + ((step % 2 ? 1 : -1) * Math.ceil(step / 2) * 0.16);
                if (tryX - half < wall.x0 || tryX + half > wall.x1) continue;
                if (!clearOf(tryX, ribs, half + (RIB.width / 2) + 0.06)) continue;
                if (!clearOf(tryX, near, half + MOUNT.clear)) continue;
                x = tryX;
            }
            if (x === null) x = centre;
            return { side: wall.side, face: wall.face, dir: wall.dir, kind, y: MOUNT.tiers[n % MOUNT.tiers.length], x };
        });
    }

    // The stands: the nave's own (models.js), in world.candles like the nave's, so they
    // are lit, burn down, give their pool and banish the Demoness the same way.
    function placeStands(root, world, spots) {
        const made = [];
        const theme = world.theme || {};
        const colour = theme.candleColor == null ? 0xffa24a : theme.candleColor;
        const flame = `rgba(${(colour >> 16) & 255},${(colour >> 8) & 255},${colour & 255},0.9)`;
        // a fresh candle's fields as world.js makes them (whatever it keeps per stand)
        const template = (world.candles || [])[0] || {};
        spots.forEach((spot) => {
            const stand = NW.Models.makeCandleStand(flame);
            const ground = NW.Parkour && NW.Parkour.groundAt ? NW.Parkour.groundAt(world, spot.x, spot.z) : 0;
            stand.position.set(spot.x, ground == null ? 0 : ground, spot.z);
            stand.rotation.y = Math.random() * Math.PI * 2;
            root.add(stand);
            const candle = {};
            Object.keys(template).forEach((key) => {
                if (template[key] === null || typeof template[key] !== 'object') candle[key] = template[key];
            });
            Object.assign(candle, { mesh: stand, x: spot.x, z: spot.z, lit: false, hold: 0, behindDoor: true });
            world.candles.push(candle);
            made.push(candle);
        });
        return made;
    }

    /**
     * The relics: models.js's cross and book, hung on a nail or laid on a shelf, in
     * world.relics like the nave's (taken with E, lit by the stands' pools, counted as
     * crosses and books). Every book and every cross on the walls is one of these — there
     * is nothing decorative to reach for and fail. The shelves and the nails are two
     * merged meshes.
     */
    function hangRelics(root, world, spots) {
        const THREE = T();
        const wood = new Mesher();
        const iron = new Mesher();
        let hung = 0;
        spots.forEach((spot) => {
            const z = spot.face;
            const d = spot.dir;
            const y = spot.y;                 // where it is taken from: the reach is read off this
            const x = spot.x;
            const inner = (out) => [Math.min(z, z + (d * out)), Math.max(z, z + (d * out))];
            const relic = NW.Models.makeRelic(spot.kind);
            let rz;
            if (spot.kind === 'book') {
                // Standing on a shelf, spine out, the way a book sits in a library: the
                // pivot tips it up (0.38 m tall) and the yaw turns its spine down the
                // corridor, so it is a real silhouette at head height, not a flat slab.
                const top = y - MOUNT.bookRise;
                const [b0, b1] = inner(MOUNT.board);
                wood.box(x - (MOUNT.boardWide / 2), x + (MOUNT.boardWide / 2), top - MOUNT.boardThick, top, b0, b1);
                [x - (MOUNT.boardWide / 2) + 0.07, x + (MOUNT.boardWide / 2) - 0.07].forEach((bx) => {
                    const [s0, s1] = inner(0.03);
                    iron.box(bx - 0.016, bx + 0.016, top - 0.2, top - MOUNT.boardThick, s0, s1);
                    const [t0, t1] = inner(MOUNT.board - 0.05);
                    iron.box(bx - 0.016, bx + 0.016, top - 0.055, top - MOUNT.boardThick, t0, t1);
                });
                relic.userData.pivot.rotation.set(-Math.PI / 2, 0, (Math.random() - 0.5) * 0.12);
                rz = z + (d * MOUNT.bookDepth);
                relic.position.set(x, y, rz);
                relic.rotation.y = (d > 0 ? 1 : -1) * Math.PI / 2;
            } else {
                // upright against the wall, a little askew, on an iron nail over it
                relic.userData.pivot.rotation.set(0, 0, (Math.random() - 0.5) * 0.16);
                rz = z + (d * 0.035);
                relic.position.set(x, y, rz);
                relic.rotation.y = d > 0 ? 0 : Math.PI;
                const [n0, n1] = inner(0.07);
                iron.box(x - 0.015, x + 0.015, y + 0.22, y + 0.25, n0, n1);
            }
            root.add(relic);
            world.relics.push({
                mesh: relic, kind: spot.kind, x, z: rz, y, reachUp: MOUNT.reach,
                value: 1, reliquary: false, hidden: false, taken: false, behindDoor: true
            });
            hung += 1;
        });
        [[wood, 'wood'], [iron, 'iron']].forEach(([m, key]) => {
            if (!m.position.length) return;
            const mesh = new THREE.Mesh(m.geometry(THREE), NW.Models.material(key));
            mesh.name = `corridor-${key}`;
            mesh.matrixAutoUpdate = false;
            root.add(mesh);
        });
        return hung;
    }

    /**
     * The dead end's reliquary (models.js makeReliquary, marked a prize so its shimmer is
     * bigger and breathes): on the shelf buildStone laid into the end wall, worth
     * PRIZE.value relics. It is in world.relics like everything else here — taken with E,
     * lit by a pool, counted in its own purse — with MOUNT.reach for its reachUp, so a
     * player standing in front of it takes it and is never told to climb.
     */
    function placePrize(root, world, L, index) {
        if (!NW.Models.makeReliquary) return null;
        const kind = index % 2 === 0 ? 'cross' : 'book';
        const casket = NW.Models.makeReliquary(kind);
        if (NW.Models.markRelicPrize) NW.Models.markRelicPrize(casket);
        const x = L.deep - PRIZE.off;
        const z = (L.zNear + L.zFar) / 2;
        casket.rotation.y = Math.PI / 2;   // its long side out from the wall, on the shelf
        casket.position.set(x, PRIZE.y + casket.userData.rest, z);
        root.add(casket);
        const relic = {
            mesh: casket, kind, x, z, y: PRIZE.y, reachUp: MOUNT.reach,
            value: PRIZE.value, reliquary: true, hidden: false, taken: false, behindDoor: true
        };
        world.relics.push(relic);
        return relic;
    }

    /**
     * world.js buildLevel, after the door (door.js) and before prewarm(): the corridor for
     * this level. `group` is the level's group.
     */
    function build(group, world, config) {
        const THREE = T();
        state.layout = null;
        state.linked = false;
        state.boxes = [];
        state.relics = 0;
        state.stands = 0;
        state.candles = [];
        state.prize = null;
        state.vignette = 0;
        if (!THREE || !world.level || world.level.environment !== 'cathedral' || !NW.Cathedral || !NW.Cathedral.get()) return null;
        const stone = stoneOf(NW.Cathedral.get().model);
        if (!stone) return null;
        const L = layout();
        state.layout = L;
        const root = new THREE.Group();
        root.name = 'side-corridor';
        group.add(root);
        const ribs = ribXs(L);
        state.triangles = buildStone(root, L, stone, ribs);
        state.boxes = colliders(L);
        addColliders(world, state.boxes);
        // this vigil's stands and wall relics (a new hang every vigil)
        const index = Math.max(0, Math.min(5, (Number(world.phase) || 1) - 1));
        const random = makeRandom(((index + 1) * 7331) + 17);
        const stands = standSpots(L, STANDS_BY_VIGIL[index], random);
        if (Array.isArray(world.candles)) {
            state.candles = placeStands(root, world, stands);
            state.stands = stands.length;
        }
        if (Array.isArray(world.relics)) {
            state.relics = hangRelics(root, world, mountSpots(L, WALL_RELICS_BY_VIGIL[index], random, stands, ribs));
            state.prize = placePrize(root, world, L, index);
            if (state.prize) state.relics += 1;
        }
        // The apparition at the dead end (apparition.js, 50/50 per vigil): built here so
        // it is in the scene for prewarm(), hidden until the door is open.
        if (NW.Apparition) {
            NW.Apparition.build(root, world, L);
            NW.Apparition.arm(state.candles);
        }
        return root;
    }

    // Tests: the corridor as plain data.
    function info() {
        const L = state.layout;
        return L ? {
            back: L.back, deep: L.deep, length: L.deep - L.back, zNear: L.zNear, zFar: L.zFar,
            width: L.zFar - L.zNear, spring: L.spring, door: L.door, leaf: L.leaf,
            ribs: ribXs(L), relics: state.relics, stands: state.stands, triangles: state.triangles,
            linked: state.linked, cells: cells(L), vignette: state.vignette,
            prize: state.prize ? {
                x: state.prize.x, y: state.prize.y, z: state.prize.z, kind: state.prize.kind,
                value: state.prize.value, reachUp: state.prize.reachUp, taken: state.prize.taken
            } : null,
            boxes: state.boxes.map((b) => ({ name: b.name, x: b.x, z: b.z, hu: b.hu, hv: b.hv }))
        } : null;
    }

    // wallSeconds/gutterLevel are exported for the headless harness (there is no other way
    // to read the warning: it is flame scale and one element's opacity).
    NW.Corridor = {
        stampMap, build, update, info, wallSeconds, gutterLevel,
        HALL, WALL_RELICS_BY_VIGIL, STANDS_BY_VIGIL, PRIZE, GUTTER, MOUNT
    };
})();
