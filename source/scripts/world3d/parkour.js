/**
 * The Nun 3D — the player's body: walking, running, crouching, sliding, jumping,
 * climbing and vaulting, and where the eyes are.
 *
 * The cathedral's height field (assets/world3d/cathedral_dark_height.json, baked from the
 * rendered model by tools/blender/export_heightfield.py) says, every 0.25 m, how high the
 * ground is and how much room there is above it. The feet follow it: steps up to
 * CONFIG.stepHeight are walked, what a jump reaches is landed on, ledges up to
 * CONFIG.mantleHeight are climbed with Space (vaulted, when there is floor right behind
 * them and the player is running), and anything higher is a wall. The 1 m nav grid stays
 * the girls' map, and it is the player's wall wherever the height field does not reach:
 * outside it, in the built-in tile levels (flat floor), and when the file is missing.
 *
 * The props (statues, piano, bath, tombs, the big table and its benches...) are not in
 * that field: like a real game, each collides as a few simple boxes that match it
 * (assets/world3d/cathedral_colliders.json, tools/blender/export_colliders.py), over a
 * height field of the architecture alone (cathedral_dark_height_arch.json). The body is
 * a round footprint against the boxes, so it slides along their faces and round their
 * corners; their tops are ground (steps, climbs, landings) and their undersides
 * ceilings (a hiding-spot table's top: only a body lying down fits under it). Without
 * those two files the old whole-model field (props voxelised in it) is used.
 *
 * world.js owns the keys and calls update() once a frame, then pose() to place the
 * camera. The tuning lives in CONFIG (world.js).
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    const HEIGHT_PATH = 'assets/world3d/cathedral_dark_height.json';
    const ARCH_PATH = 'assets/world3d/cathedral_dark_height_arch.json';
    const COLLIDERS_PATH = 'assets/world3d/cathedral_colliders.json';
    // What the height-field bake counts as a surface (export_heightfield.py): tops higher
    // than LIMIT are walls, and a surface needs CROUCH_ROOM metres free above it.
    const LIMIT = 2.5;
    const CROUCH_ROOM = 1.1;
    const NO_BOXES = [];

    // The round footprint the height field is tested with: centre, and eight points round
    // it (in units of CONFIG.radius). It was a square: its corners stuck out 0.14 m
    // further and caught on every corner of the field's 0.25 m stone steps.
    const D45 = Math.SQRT1_2;
    const FOOTPRINT = [[0, 0], [-D45, -D45], [D45, -D45], [-D45, D45], [D45, D45], [0, -1], [0, 1], [-1, 0], [1, 0]];
    const SUBSTEP = 0.12;      // longest single move tested against the walls (m)
    const AIR_STEP = 0.12;     // what the feet still clear in the air
    const COYOTE = 0.12;       // a jump still counts this long after walking off an edge
    const JUMP_BUFFER = 0.15;  // Space pressed this long before landing still jumps
    // In the air, ledges this far above the feet are grabbed (hands over the head). A jump
    // only lifts the feet ~0.57 m (jumpSpeed²/2·gravity), so at 0.6 a jump reached no
    // higher than a standing climb (mantleHeight 1.1 m) and the reliquaries on the bath
    // (1.5 m) and the statues (2 m) could not be taken by running and jumping at them.
    // 1.55 was enough while a statue was a staircase of voxels (its shoulders a step);
    // as one box its top is its head, 2.1 m, which 0.57 + 1.55 reached only in the last
    // frames of a jump's peak (s_climb: 0-1/8). 1.7 m: the fingertips of arms raised
    // over a 1.75 m body, and a statue is taken at any point of a jump's top third.
    const GRAB_REACH = 1.7;

    // data: the whole-model field (the fallback); arch + boxes: the architecture's field
    // and the props' boxes, used together when both loaded.
    const field = { data: null, promise: null, failed: false, arch: null, boxes: null };
    const probe = { ground: 0, clear: 0 };
    // the box that stopped the last fitAt (moveBy slides along its face)
    const hit = { box: null, stopped: false };
    // the dev menu's "Show hitboxes" (devVideoMenu.js): every collider drawn in the view
    const overlay = { shown: false, group: null, level: null };
    const wish = { x: 0, z: 0 };
    const view = { x: 0, y: 0, z: 0, pitch: 0, roll: 0 };
    let cfg = null;
    // One way out of the feet, for whoever wants to hear them (world.js makes the sound):
    // feet('land', impactSpeed) | feet('slide') | feet('mantle') | feet('vault').
    // It must never throw into the movement code, and it decides nothing here.
    let feet = null;
    function tell(what, amount) {
        if (!feet) return;
        try {
            feet(what, amount || 0);
        } catch (error) {
            /* a listener must never break the feet */
        }
    }

    // ------------------------------------------------------------ the height field

    function readBinary(path) {
        const api = window.electronAPI;
        if (api && typeof api.readAssetBinary === 'function') {
            return api.readAssetBinary(path).then((data) => {
                if (!data) throw new Error(`asset not readable: ${path}`);
                if (data instanceof ArrayBuffer) return data;
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            });
        }
        return fetch(path).then((response) => {
            if (!response.ok) throw new Error(`${response.status} ${path}`);
            return response.arrayBuffer();
        });
    }

    function decode(text) {
        const bytes = atob(text);
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i += 1) out[i] = bytes.charCodeAt(i);
        return out;
    }

    function readField(path) {
        return readBinary(path).then((buffer) => {
            const info = JSON.parse(new TextDecoder('utf-8').decode(buffer));
            const height = decode(info.height);
            const clear = decode(info.clear);
            if (height.length !== info.cols * info.rows || clear.length !== height.length) {
                throw new Error('height field size does not match its header');
            }
            return {
                x0: info.x0, z0: info.z0, res: info.res, cols: info.cols, rows: info.rows,
                hq: info.hq, h0: info.h0, blocked: info.blocked, height, clear
            };
        });
    }

    // The architecture's stone, cleaned of the bake's lone cells: a stone cell with at most
    // one stone neighbour (of four) is a spur the decimated walls leave every few metres,
    // or a lone speck — a 25 cm tooth that a body sliding along the wall catches on and
    // stops dead. It becomes floor like the lowest free cell beside it. Walls, pillars
    // and railings (two or more stone neighbours) are kept whole.
    function despur(f) {
        const { cols, rows, blocked } = f;
        const height = f.height.slice();
        const clear = f.clear.slice();
        const stone = (i, j) => i < 0 || j < 0 || i >= cols || j >= rows || f.height[(j * cols) + i] === blocked;
        let removed = 0;
        for (let j = 0; j < rows; j += 1) {
            for (let i = 0; i < cols; i += 1) {
                if (!stone(i, j)) continue;
                const around = (stone(i - 1, j) ? 1 : 0) + (stone(i + 1, j) ? 1 : 0) + (stone(i, j - 1) ? 1 : 0) + (stone(i, j + 1) ? 1 : 0);
                if (around > 1) continue;
                let best = -1;
                for (let dj = -1; dj <= 1; dj += 1) {
                    for (let di = -1; di <= 1; di += 1) {
                        if (stone(i + di, j + dj)) continue;
                        const k = ((j + dj) * cols) + i + di;
                        if (best < 0 || f.height[k] < f.height[best]) best = k;
                    }
                }
                if (best < 0) continue;
                height[(j * cols) + i] = f.height[best];
                clear[(j * cols) + i] = f.clear[best];
                removed += 1;
            }
        }
        return Object.assign({}, f, { height, clear, despurred: removed });
    }

    // A collider box, ready for the tests: centre, the cos/sin of its u side's angle
    // (from +x toward +z), half sizes, bottom and top, and the radius round it.
    function makeBox(b, kind) {
        return {
            name: b.name, kind: kind || 'prop', x: b.x, z: b.z, a: b.a || 0,
            c: Math.cos(b.a || 0), s: Math.sin(b.a || 0), hu: b.hu, hv: b.hv, y0: b.y0, y1: b.y1,
            r: Math.hypot(b.hu, b.hv)
        };
    }

    function load() {
        if (field.data || field.promise) return field.promise;
        const whole = readField(HEIGHT_PATH)
            .then((data) => {
                field.data = data;
                return data;
            })
            .catch((error) => {
                console.warn('[parkour] no height field, the floor stays flat:', error);
                field.failed = true;
                return null;
            });
        // the props as boxes over the architecture's field: both, or neither
        const boxed = Promise.all([
            readField(ARCH_PATH),
            readBinary(COLLIDERS_PATH).then((buffer) => JSON.parse(new TextDecoder('utf-8').decode(buffer)))
        ])
            .then(([arch, colliders]) => {
                field.boxes = (colliders.boxes || []).map((b) => makeBox(b, 'prop')).sort((a, b) => a.y0 - b.y0);
                field.arch = despur(arch);
            })
            .catch((error) => {
                console.warn('[parkour] no prop colliders, the props stay in the height field:', error);
                field.arch = null;
                field.boxes = null;
            });
        field.promise = Promise.all([whole, boxed]).then(() => {
            field.settled = true;
            if (!field.data) field.promise = null;
            return field.data;
        });
        return field.promise;
    }

    // Are the props boxes here? (the cathedral, with both files loaded)
    function boxMode(world) {
        return Boolean(field.arch && field.boxes && world.level && world.level.environment === 'cathedral');
    }

    // The height field belongs to the cathedral; the built-in tile levels are flat.
    function activeField(world) {
        if (!world.level || world.level.environment !== 'cathedral') return null;
        if (boxMode(world)) return field.arch;
        return field.data;
    }

    // Every collider box of this level: the props, and the level's own (hiding spots).
    function boxesOf(world) {
        if (!boxMode(world)) return NO_BOXES;
        const own = world.levelBoxes;
        return own && own.level === world.level ? own.all : field.boxes;
    }

    // Does a circle of radius r at (x, z) overlap the box's footprint? (r 0: the point)
    function touches(b, x, z, r) {
        const dx = x - b.x;
        const dz = z - b.z;
        if ((dx * dx) + (dz * dz) > (b.r + r) * (b.r + r)) return false;
        const u = (dx * b.c) + (dz * b.s);
        const v = (dz * b.c) - (dx * b.s);
        const ou = Math.max(0, Math.abs(u) - b.hu);
        const ov = Math.max(0, Math.abs(v) - b.hv);
        if (r <= 0) return ou <= 0 && ov <= 0;
        return (ou * ou) + (ov * ov) < (r * r) - 1e-6;
    }

    // The boxes' tops and undersides at one point, laid over `probe` (the field's ground
    // and head room there), the way the height-field bake reads a column: a box close
    // over the ground is a solid to stand on, one higher up a ceiling, one taller than
    // LIMIT a wall. False where nobody can stand.
    function pointBoxes(list, x, z) {
        let ceiling = probe.ground + probe.clear;
        for (let k = 0; k < list.length; k += 1) {
            const b = list[k];
            if (b.y1 <= probe.ground + 0.02 || !touches(b, x, z, 0)) continue;
            if (b.y0 >= probe.ground + CROUCH_ROOM) {
                if (b.y0 < ceiling) ceiling = b.y0;
                continue;
            }
            if (b.y1 > LIMIT) return false;
            probe.ground = b.y1;
        }
        probe.clear = ceiling - probe.ground;
        return probe.clear > 0;
    }

    // Ground and head room at one point, into `probe`, the props' boxes included (a
    // ledge ahead, the floor a girl or a stand stands on, a line of sight). False where
    // nobody can stand. `props`: only the cathedral's props, not the level's own boxes.
    function sample(world, x, z, props) {
        if (!sampleField(world, x, z)) return false;
        if (!boxMode(world)) return true;
        return pointBoxes(props ? field.boxes : boxesOf(world), x, z);
    }

    // Ground and head room of the height field alone at one point, into `probe`.
    function sampleField(world, x, z) {
        const f = activeField(world);
        if (f) {
            const i = Math.floor((x - f.x0) / f.res);
            const j = Math.floor((z - f.z0) / f.res);
            if (i >= 0 && j >= 0 && i < f.cols && j < f.rows) {
                const index = (j * f.cols) + i;
                const code = f.height[index];
                if (code === f.blocked) return false;
                probe.ground = (code * f.hq) + f.h0;
                probe.clear = f.clear[index] * f.hq;
                // the level's hiding spots (stampHideouts): a table's legs are stone, the
                // room under its top a low ceiling only a prone body fits under
                const lows = world.hideoutField;
                if (lows && lows.level === world.level) {
                    const low = lows.cells.get(index);
                    if (low !== undefined) {
                        if (low < 0) return false;
                        if (low < probe.clear) probe.clear = low;
                    }
                }
                return true;
            }
        }
        // A room the level lays past the height field's edge, left of the nave, where the
        // grid's origin (x 0) leaves no cells to open: world.extraField (spikeRoom.js).
        // Asked after the field and before the grid, and it answers with ONE reused object
        // (this runs a few hundred times a frame): { ground, clear } = its floor,
        // `false` = its stone, `undefined` = not its business, ask the grid.
        const extra = world.extraField;
        if (extra && extra.level === world.level) {
            const found = extra.sample(x, z);
            if (found !== undefined) {
                if (!found) return false;
                probe.ground = found.ground;
                probe.clear = found.clear;
                return true;
            }
        }
        // the grid: a flat floor between its walls
        const grid = world.parsed.grid;
        if (grid.isBlocked(Math.floor(x / grid.cellSize), Math.floor(z / grid.cellSize))) return false;
        probe.ground = 0;
        probe.clear = 99;
        return true;
    }

    // The highest ground under the footprint at (x, z), or NaN when part of it is in stone.
    // The boxes under the round footprint count up to `limit` (a box whose top is higher
    // stands beside the body or over it, not under it).
    function groundUnder(world, x, z, limit) {
        const r = cfg.radius;
        let top = -Infinity;
        if (boxMode(world)) {
            top = cellsUnder(world, x, z, r, Infinity);
            if (Number.isNaN(top)) return NaN;
        } else {
            for (let k = 0; k < FOOTPRINT.length; k += 1) {
                if (!sampleField(world, x + (FOOTPRINT[k][0] * r), z + (FOOTPRINT[k][1] * r))) return NaN;
                if (probe.ground > top) top = probe.ground;
            }
        }
        const list = boxesOf(world);
        const most = limit == null ? Infinity : limit;
        for (let k = 0; k < list.length; k += 1) {
            const b = list[k];
            if (b.y1 > top && b.y1 <= most && touches(b, x, z, r)) top = b.y1;
        }
        return top;
    }

    // With the props as boxes, the architecture's field is met the same way: every 0.25 m
    // cell the round body (radius r at x, z) overlaps is a little square, stone or floor.
    // Returns the highest floor under it, or NaN when a cell under it is stone or higher
    // than `most` — then hit.box is that cell as a box, the one the body is deepest in,
    // so moveBy slides round it (a wall's 0.25 m staircase, a pillar's corner) exactly as
    // along a prop's face.
    const cellBox = { name: 'stone', kind: 'cell', x: 0, z: 0, a: 0, c: 1, s: 0, hu: 0, hv: 0, y0: 0, y1: 0, r: 0 };
    function cellsUnder(world, x, z, r, most) {
        const f = field.arch;
        const res = f.res;
        const i0 = Math.floor((x - r - f.x0) / res);
        const i1 = Math.floor((x + r - f.x0) / res);
        const j0 = Math.floor((z - r - f.z0) / res);
        const j1 = Math.floor((z + r - f.z0) / res);
        let top = -Infinity;
        let deepest = Infinity;
        for (let j = j0; j <= j1; j += 1) {
            for (let i = i0; i <= i1; i += 1) {
                const left = f.x0 + (i * res);
                const near = f.z0 + (j * res);
                const qx = Math.max(left, Math.min(left + res, x));
                const qz = Math.max(near, Math.min(near + res, z));
                const d2 = ((x - qx) * (x - qx)) + ((z - qz) * (z - qz));
                if (d2 >= (r * r) - 1e-6) continue;
                if (!sampleField(world, left + (res / 2), near + (res / 2)) || probe.ground > most) {
                    if (d2 < deepest) {
                        deepest = d2;
                        cellBox.x = left + (res / 2);
                        cellBox.z = near + (res / 2);
                        cellBox.hu = res / 2;
                        cellBox.hv = res / 2;
                        cellBox.r = res * Math.SQRT1_2;
                    }
                    continue;
                }
                if (probe.ground > top) top = probe.ground;
            }
        }
        if (deepest < Infinity) {
            hit.box = cellBox;
            return NaN;
        }
        return top;
    }

    // Can a body of `body` metres stand at (x, z) with its feet at `feet`, climbing at most
    // `reach`? Returns the ground it would stand on, or NaN. The feet need the whole
    // footprint; the head only the room over its centre (an overhang at the corner of the
    // footprint, like the top of a chair's back, is beside the head, not above it).
    // A box touching the round footprint is a step (its top within `reach`), a ceiling
    // (its underside over the head) or in the way (hit.box, for moveBy's slide).
    function fitAt(world, x, z, feet, reach, body) {
        const r = cfg.radius;
        hit.box = null;
        let top = -Infinity;
        const boxed = boxMode(world);
        if (boxed) {
            // the head room over the centre, then the field's cells under the round body
            if (!sampleField(world, x, z) || probe.ground + probe.clear < feet + body) return NaN;
            top = cellsUnder(world, x, z, r, feet + reach);
            if (Number.isNaN(top)) return NaN;
        } else {
            for (let k = 0; k < FOOTPRINT.length; k += 1) {
                if (!sampleField(world, x + (FOOTPRINT[k][0] * r), z + (FOOTPRINT[k][1] * r))) return NaN;
                if (probe.ground > feet + reach) return NaN;
                if (k === 0 && probe.ground + probe.clear < feet + body) return NaN;
                if (probe.ground > top) top = probe.ground;
            }
        }
        const list = boxesOf(world);
        if (!list.length) return top;
        let ceiling = Infinity;
        for (let k = 0; k < list.length; k += 1) {
            const b = list[k];
            if (!touches(b, x, z, r)) continue;
            if (b.y1 <= feet + reach) {
                if (b.y1 > top) top = b.y1;
            } else if (b.y0 >= feet + body - 0.01) {
                if (b.y0 < ceiling) ceiling = b.y0;
            } else {
                hit.box = b;
                return NaN;
            }
        }
        if (ceiling < Math.max(top, feet) + body - 0.01) return NaN;
        return top;
    }

    // The ceiling over the head: the field's over the centre, and the underside of any
    // box over the body.
    function ceilingOver(world, x, z, feet) {
        let ceiling = sampleField(world, x, z) ? probe.ground + probe.clear : Infinity;
        const list = boxesOf(world);
        for (let k = 0; k < list.length; k += 1) {
            const b = list[k];
            if (b.y0 > feet + 0.05 && b.y0 < ceiling && touches(b, x, z, cfg.radius)) ceiling = b.y0;
        }
        return ceiling;
    }

    // The stances: 0 standing, 1 crouched, 2 lying down (prone).
    function stanceBody(stance) {
        if (stance === 2) return cfg.proneBodyHeight;
        return stance === 1 ? cfg.crouchBodyHeight : cfg.bodyHeight;
    }

    function bodyHeight(p) {
        return stanceBody(p.stance || 0);
    }

    // Does the body fit where it stands in `stance`? (Getting up needs the head room.)
    function roomFor(world, p, stance) {
        return !Number.isNaN(fitAt(world, p.x, p.z, p.y, 0.001, stanceBody(stance)));
    }

    function setStance(p, stance) {
        p.stance = stance;
        p.crouched = stance >= 1;
        p.prone = stance === 2;
    }

    // Getting up from lying down: stands if the head room allows, else crouches if that
    // fits, else stays down (under a table; the HUD says why). Returns whether it moved.
    function getUp(world, p) {
        if (roomFor(world, p, 0)) setStance(p, 0);
        else if (roomFor(world, p, 1)) setStance(p, 1);
        else {
            p.noRoom = 1;   // world.js updateHud: "No room to stand up here"
            return false;
        }
        return true;
    }

    // Ctrl (or C). A tap toggles the crouch: standing → crouched → standing. Held past
    // CONFIG.proneHoldTime it lies down, from standing or crouched: the body goes down
    // to a crouch the moment the key goes down and drops to the floor when the hold
    // passes the threshold, so a tap never flashes prone. Lying down, a tap (or a hold)
    // gets up. `pressed`: the key went down this frame; `held`: it is down now.
    // p.ctrl: what the current press does ('down' from standing, 'crouch' from a
    // crouch, null when it is spent) and how long it has been held.
    function ctrlStance(world, p, pressed, held, dt) {
        const c = p.ctrl || (p.ctrl = { mode: null, time: 0 });
        if (pressed) {
            p.slideCrouch = false;
            c.time = 0;
            c.mode = null;
            const stance = p.stance || 0;
            if (stance === 2) getUp(world, p);
            else if (stance === 0) {
                setStance(p, 1);
                c.mode = 'down';
            } else {
                c.mode = 'crouch';
            }
        }
        if (!c.mode) return;
        if (held) {
            c.time += dt;
            if (c.time >= cfg.proneHoldTime && p.grounded) {
                setStance(p, 2);
                c.mode = null;
            }
            return;
        }
        // let go before the threshold: a tap
        if (c.mode === 'crouch' && !roomFor(world, p, 0)) p.noRoom = 1;
        else if (c.mode === 'crouch') setStance(p, 0);
        c.mode = null;
    }

    // Stand up out of a crouch (after a slide, or Shift to run) when there is room.
    function standIfRoom(world, p) {
        if ((p.stance || 0) !== 1 || !roomFor(world, p, 0)) return false;
        setStance(p, 0);
        return true;
    }

    // Tests and the world (stampHideouts): lay the level's hiding spots into the
    // height field. Each is { x, z, yaw, width, length, gap, legs: [[u, v]...] }: a
    // table whose top covers width × length metres (length along its own z) with
    // `gap` metres under it. The room under it, and `margin` metres around it (so the
    // body never pushes into its edge), gets a ceiling at `gap`; its legs are stone.
    // With the props as boxes, each table is boxes too (Shaun: "table is 3 boxes"): its
    // top from `gap` up to its surface (h.top, or gap + 0.22: models.js makeHideout), and
    // one block under each end over its pair of legs, so a body lying down crawls in
    // under a long side. Kept in world.levelBoxes; the dev overlay is (re)built here, at
    // level build, as every collider of the level is known now.
    function stampHideouts(world, hideouts, margin) {
        world.hideoutField = null;
        world.levelBoxes = null;
        if (field.arch && field.boxes) {
            const own = [];
            (hideouts || []).forEach((h) => {
                const yaw = h.yaw || 0;
                // three.js turns the table by yaw about y: its own x goes to (cos, -sin)
                const a = -yaw;
                const gap = h.gap || 0.58;
                const top = h.top || (gap + 0.22);
                const floor = sampleField(world, h.x, h.z) ? probe.ground : 0;
                own.push(makeBox({ name: 'hiding table top', x: h.x, z: h.z, a, hu: h.width / 2, hv: h.length / 2, y0: floor + gap, y1: floor + top }, 'level'));
                // the legs' ends: v = ±lv in the table's frame (its length along its own z)
                const lv = Math.max(...(h.legs || [[0, (h.length / 2) - 0.1]]).map((leg) => Math.abs(leg[1])));
                const lu = Math.max(...(h.legs || [[(h.width / 2) - 0.09, 0]]).map((leg) => Math.abs(leg[0])));
                [-1, 1].forEach((side) => {
                    // centre of the end block: (0, side·lv) in the table's (x, z) frame
                    const cx = h.x + (Math.sin(yaw) * side * lv);
                    const cz = h.z + (Math.cos(yaw) * side * lv);
                    own.push(makeBox({ name: 'hiding table legs', x: cx, z: cz, a, hu: lu + 0.055, hv: 0.055, y0: floor, y1: floor + gap }, 'level'));
                });
            });
            world.levelBoxes = { level: world.level, own, all: field.boxes.concat(own).sort((p, q) => p.y0 - q.y0) };
            buildOverlay(world);
            return own.length;
        }
        buildOverlay(world);
        const f = field.data;
        if (!f || !hideouts || !hideouts.length) return 0;
        const cells = new Map();
        const pad = margin || 0;
        hideouts.forEach((h) => {
            const cos = Math.cos(h.yaw || 0);
            const sin = Math.sin(h.yaw || 0);
            const reach = Math.hypot(h.width, h.length) / 2 + pad + f.res;
            const i0 = Math.max(0, Math.floor((h.x - reach - f.x0) / f.res));
            const i1 = Math.min(f.cols - 1, Math.floor((h.x + reach - f.x0) / f.res));
            const j0 = Math.max(0, Math.floor((h.z - reach - f.z0) / f.res));
            const j1 = Math.min(f.rows - 1, Math.floor((h.z + reach - f.z0) / f.res));
            for (let j = j0; j <= j1; j += 1) {
                for (let i = i0; i <= i1; i += 1) {
                    const dx = f.x0 + ((i + 0.5) * f.res) - h.x;
                    const dz = f.z0 + ((j + 0.5) * f.res) - h.z;
                    // into the table's own frame (u across, v along its length)
                    const u = (dx * cos) - (dz * sin);
                    const v = (dx * sin) + (dz * cos);
                    if (Math.abs(u) > (h.width / 2) + pad || Math.abs(v) > (h.length / 2) + pad) continue;
                    const index = (j * f.cols) + i;
                    const leg = (h.legs || []).some(([lu, lv]) => Math.abs(u - lu) < f.res * 0.6 && Math.abs(v - lv) < f.res * 0.6);
                    const before = cells.get(index);
                    const value = leg ? -1 : h.gap;
                    if (before === undefined || value < before) cells.set(index, value);
                }
            }
        });
        world.hideoutField = { level: world.level, cells };
        return cells.size;
    }

    // ------------------------------------------------------------ moving

    function tryStep(world, p, sx, sz, body) {
        if (sx === 0 && sz === 0) return false;
        const top = fitAt(world, p.x + sx, p.z + sz, p.y, p.grounded ? cfg.stepHeight : AIR_STEP, body);
        if (Number.isNaN(top)) return false;
        p.x += sx;
        p.z += sz;
        if (p.grounded) {
            if (top >= p.y - cfg.stepHeight) {
                p.y = top;   // up a step, or down one
            } else {
                p.grounded = false;   // walked off an edge
                p.vy = 0;
                p.coyote = COYOTE;
            }
        }
        return true;
    }

    // Move the player by (dx, dz), sliding along whatever is in the way. Returns the
    // distance really covered. The aura (aura.js) shoves the player with it too.
    function moveBy(world, dx, dz) {
        const p = world.player;
        const length = Math.hypot(dx, dz);
        if (!cfg || length < 1e-6) return 0;
        const steps = Math.ceil(length / SUBSTEP);
        const sx = dx / steps;
        const sz = dz / steps;
        const startX = p.x;
        const startZ = p.z;
        const body = bodyHeight(p);
        for (let i = 0; i < steps; i += 1) {
            if (tryStep(world, p, sx, sz, body)) continue;
            hit.stopped = true;
            // a box in the way: along its face (never caught on it)
            if (hit.box && slideAlong(world, p, hit.box, sx, sz, body)) continue;
            // the field's stone in the way: along its wall
            if (!hit.box && slideField(world, p, sx, sz, body)) continue;
            if (tryStep(world, p, sx, 0, body) || tryStep(world, p, 0, sz, body)) continue;
            // the field's stone met at a slant (its 0.25 m staircase): the step turned 45°
            if (turnStep(world, p, sx, sz, body)) continue;
            break;
        }
        return Math.hypot(p.x - startX, p.z - startZ);
    }

    // The step (sx, sz) was stopped by box b: close in on its face, then go on along it
    // with what is left of the step (the share that does not push into it).
    function slideAlong(world, p, b, sx, sz, body) {
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const u = (dx * b.c) + (dz * b.s);
        const v = (dz * b.c) - (dx * b.s);
        let nu = u - Math.max(-b.hu, Math.min(b.hu, u));
        let nv = v - Math.max(-b.hv, Math.min(b.hv, v));
        let length = Math.hypot(nu, nv);
        if (length < 1e-6) {
            // (already over its footprint: out through the nearest side)
            if (b.hu - Math.abs(u) < b.hv - Math.abs(v)) {
                nu = u < 0 ? -1 : 1;
                nv = 0;
            } else {
                nu = 0;
                nv = v < 0 ? -1 : 1;
            }
            length = 1;
        }
        const nx = ((nu * b.c) - (nv * b.s)) / length;
        const nz = ((nu * b.s) + (nv * b.c)) / length;
        let ax = sx;
        let az = sz;
        // half the step still fits: take it, and slide with the other half
        if (tryStep(world, p, sx * 0.5, sz * 0.5, body)) {
            ax = sx * 0.5;
            az = sz * 0.5;
        }
        const into = (ax * nx) + (az * nz);
        if (into >= 0) return ax !== sx;
        const tx = ax - (nx * into);
        const tz = az - (nz * into);
        if (Math.hypot(tx, tz) < 1e-5) return ax !== sx;
        return tryStep(world, p, tx, tz, body) || ax !== sx;
    }

    // The height field stopped the step (sx, sz): the footprint's points that fail at the
    // step's end, seen from its centre, give the wall's normal (its 0.25 m staircase
    // smoothed over the body's width); the step goes on along the wall, with its share
    // that does not push into it.
    function slideField(world, p, sx, sz, body) {
        const r = cfg.radius;
        const x = p.x + sx;
        const z = p.z + sz;
        const reach = p.grounded ? cfg.stepHeight : AIR_STEP;
        let nx = 0;
        let nz = 0;
        for (let k = 1; k < FOOTPRINT.length; k += 1) {
            const ox = FOOTPRINT[k][0];
            const oz = FOOTPRINT[k][1];
            if (!sampleField(world, x + (ox * r), z + (oz * r)) || probe.ground > p.y + reach) {
                nx -= ox;
                nz -= oz;
            }
        }
        const length = Math.hypot(nx, nz);
        if (length < 1e-6) return false;
        nx /= length;
        nz /= length;
        const into = (sx * nx) + (sz * nz);
        if (into >= 0) return false;
        const tx = sx - (nx * into);
        const tz = sz - (nz * into);
        if (Math.hypot(tx, tz) < 1e-5) return false;
        return tryStep(world, p, tx, tz, body);
    }

    // Past a corner of the height field's stone: the step turned 45° either way, at its
    // share along that way.
    function turnStep(world, p, sx, sz, body) {
        const k = Math.SQRT1_2;
        for (let side = 1; side >= -1; side -= 2) {
            const tx = ((sx * k) - (sz * k * side)) * k;
            const tz = ((sx * k * side) + (sz * k)) * k;
            if (tryStep(world, p, tx, tz, body)) return true;
        }
        return false;
    }

    // A vigil start, a teleport, the height field landing late: put the feet back on
    // whatever is under them, or step out of the stone to the nearest free floor.
    function settle(world, p) {
        const body = bodyHeight(p);
        if (!Number.isNaN(fitAt(world, p.x, p.z, p.y, p.grounded ? cfg.stepHeight : AIR_STEP, body))) return;
        // (with the boxes: only where the body really fits, and not onto a box taller
        // than the body — out beside it instead)
        const boxed = boxesOf(world).length > 0;
        const fits = (x, z, ground) => !boxed || !Number.isNaN(fitAt(world, x, z, ground, 0.001, body));
        const under = groundUnder(world, p.x, p.z, p.y + body);
        if (!Number.isNaN(under) && fits(p.x, p.z, under)) {
            p.y = under;
            p.vy = 0;
            p.grounded = true;
            return;
        }
        for (let ring = 1; ring <= 8; ring += 1) {
            const distance = ring * 0.2;
            for (let a = 0; a < 8; a += 1) {
                const x = p.x + (Math.cos(a * Math.PI / 4) * distance);
                const z = p.z + (Math.sin(a * Math.PI / 4) * distance);
                const ground = groundUnder(world, x, z, p.y + body);
                if (!Number.isNaN(ground) && fits(x, z, ground)) {
                    p.x = x;
                    p.z = z;
                    p.y = ground;
                    p.vy = 0;
                    p.grounded = true;
                    return;
                }
            }
        }
    }

    function land(p, ground) {
        const impact = -p.vy;
        p.y = ground;
        p.vy = 0;
        p.grounded = true;
        // the knees take it: the eyes dip with the fall and spring back
        if (impact > 1) p.dipVel -= impact * 0.55;
        tell('land', impact);
        if (p.slideJump) {
            p.slideJump = false;
            startRush(p);
        }
    }

    // ------------------------------------------------------------ climbing

    // Where to stand on a ledge, measured past its edge: fully on it first, then nearer
    // (a narrow ledge in front of a higher block only takes the body at its very edge).
    const LANDINGS = [0.35, 0.5, 0.2, 0.1, 0.65, 0.8];

    // Something higher than a step 0.4-0.85 m ahead along (fx, fz)?
    function ledgeAhead(world, p, fx, fz) {
        for (let d = 0.4; d < 0.85; d += 0.2) {
            if (!sample(world, p.x + (fx * d), p.z + (fz * d))) return false;
            if (probe.ground > p.y + cfg.stepHeight) return true;
        }
        return false;
    }

    // Space in front of a ledge: climb onto it (mantle), or over it when it is low, flat
    // and the player is running at it (vault). In the air, a ledge within the arms' reach
    // is grabbed. Returns whether a climb started.
    function tryClimb(world, p, fromGround) {
        let fx = -Math.sin(p.yaw);
        let fz = -Math.cos(p.yaw);
        const speed = Math.hypot(p.vx, p.vz);
        // in the air, the way it flies — but first the way it looks, when it slid along
        // a box's face it jumped at (the slide turns the flight along the face)
        if (!fromGround && speed > 0.5 && !(hit.stopped && ledgeAhead(world, p, fx, fz))) {
            fx = p.vx / speed;
            fz = p.vz / speed;
        }
        let edge = -1;
        for (let d = 0.4; d < 0.85; d += 0.2) {
            if (!sample(world, p.x + (fx * d), p.z + (fz * d))) return false;   // a wall
            if (probe.ground > p.y + cfg.stepHeight) {
                edge = d;
                break;
            }
        }
        if (edge < 0) return false;
        const reach = fromGround ? cfg.mantleHeight : GRAB_REACH;
        const body = bodyHeight(p);
        const pace = (wish.x * fx) + (wish.z * fz);   // the speed the keys ask for toward it
        for (let k = 0; k < LANDINGS.length; k += 1) {
            const d = edge + LANDINGS[k];
            const x = p.x + (fx * d);
            const z = p.z + (fz * d);
            const top = groundUnder(world, x, z, p.y + reach + 0.01);
            if (Number.isNaN(top) || top > p.y + reach || top < p.y + (cfg.stepHeight * 0.5)) continue;
            if (Number.isNaN(fitAt(world, x, z, top, 0.001, body))) continue;
            // floor right behind a low obstacle (up to ~1.3 m deep), and running at it:
            // over it in one move
            if (fromGround && pace > 1.5 && (p.rush > 0 || p.stamina >= cfg.vaultCost)) {
                let highest = top;
                for (let far = edge + 0.25; far < edge + 2.05; far += 0.15) {
                    const bx = p.x + (fx * far);
                    const bz = p.z + (fz * far);
                    const ground = groundUnder(world, bx, bz, p.y + reach + 0.01);
                    if (Number.isNaN(ground)) break;
                    if (ground > top - 0.25) {
                        highest = Math.max(highest, ground);
                        if (highest > top + 0.1) break;   // not flat on top: climb it instead
                        continue;
                    }
                    if (Number.isNaN(fitAt(world, bx, bz, ground, 0.001, body))) continue;
                    // a vault comes out of it faster than it went in (the Rush, below)
                    startClimb(p, bx, ground, bz, highest, true, Math.max(pace, rushSpeed()), fx, fz);
                    spendMove(p, cfg.vaultCost);
                    return true;
                }
            }
            if (p.rush <= 0 && p.stamina < cfg.mantleCost) return false;
            startClimb(p, x, top, z, top, false, 0, fx, fz);
            spendMove(p, cfg.mantleCost);
            return true;
        }
        return false;
    }

    function startClimb(p, x, y, z, top, vault, speed, fx, fz) {
        const c = p.climb;
        const rise = Math.max(0, top - p.y);
        tell(vault ? 'vault' : 'mantle', rise);
        c.active = true;
        c.vault = vault;
        c.t = 0;
        c.time = vault
            ? Math.max(0.36, Math.hypot(x - p.x, z - p.z) / Math.max(speed, 4))
            : 0.3 + (rise * 0.28);
        c.x0 = p.x;
        c.y0 = p.y;
        c.z0 = p.z;
        c.x1 = x;
        c.y1 = y;
        c.z1 = z;
        c.top = top;
        c.speed = speed;
        c.fx = fx;
        c.fz = fz;
        p.grounded = false;
        p.vy = 0;
        p.slide = 0;
        p.slideJump = false;
        p.jumpBuffer = 0;
    }

    function easeOut(t) {
        return 1 - ((1 - t) * (1 - t));
    }

    function easeInOut(t) {
        return t * t * (3 - (2 * t));
    }

    function advanceClimb(p, dt) {
        const c = p.climb;
        const beforeX = p.x;
        const beforeZ = p.z;
        c.t = Math.min(1, c.t + (dt / c.time));
        const t = c.t;
        if (c.vault) {
            // up over the top, across it, down the far side
            const peak = c.top + 0.14;
            if (t < 0.35) p.y = c.y0 + ((peak - c.y0) * easeOut(t / 0.35));
            else if (t < 0.7) p.y = peak;
            else p.y = peak + ((c.y1 - peak) * (((t - 0.7) / 0.3) ** 2));
            p.x = c.x0 + ((c.x1 - c.x0) * t);
            p.z = c.z0 + ((c.z1 - c.z0) * t);
        } else {
            // hands on the edge, pull up, then roll the body over onto the top
            const rise = easeOut(Math.min(1, t / 0.7));
            const along = easeInOut(Math.max(0, (t - 0.3) / 0.7));
            p.y = c.y0 + ((c.y1 - c.y0) * rise);
            p.x = c.x0 + ((c.x1 - c.x0) * along);
            p.z = c.z0 + ((c.z1 - c.z0) * along);
        }
        if (t >= 1) {
            c.active = false;
            p.x = c.x1;
            p.y = c.y1;
            p.z = c.z1;
            p.grounded = true;
            p.vy = 0;
            p.vx = c.fx * c.speed;
            p.vz = c.fz * c.speed;
            p.dipVel -= c.vault ? 1.6 : 0.9;
            startRush(p);
        }
        return Math.hypot(p.x - beforeX, p.z - beforeZ);
    }

    function spend(p, amount) {
        p.stamina = Math.max(0, p.stamina - amount);
        p.staminaIdle = 0;
    }

    // ------------------------------------------------------------ the Rush
    //
    // Moving well pays: every vault and climb, and landing a jump taken out of a slide,
    // starts a Rush of CONFIG.rushTime seconds. In it, running is faster
    // (CONFIG.rushBoost) and spends no Breath, and the next jump, climb or vault is free,
    // so a clean chain of moves outruns plain sprinting. Slides always cost.
    //
    // A move taken while a Rush is already running SETS IT BACK TO FULL rather than being
    // swallowed by the Rush it was paid for with (p.rushChain counts the links), and the
    // move itself does not burn the clock — the Rush is frozen while a climb or a vault
    // plays out (update), so a 0.4 s vault no longer eats a quarter of the reward. Chain
    // three pews and you run the whole line at rushSpeed; miss one and you fall back to
    // the sprint the moment it lapses.

    function startRush(p) {
        p.rushChain = p.rush > 0 ? (p.rushChain || 1) + 1 : 1;
        p.rush = cfg.rushTime;
        p.rushes = (p.rushes || 0) + 1;
        // Steam: five obstacles linked into one unbroken Rush (code/achievements.js).
        if (p.rushChain >= 5 && typeof window.unlockAchievement === 'function') {
            window.unlockAchievement('ACH_MOMENTUM');
        }
    }

    function rushSpeed() {
        return cfg.sprintSpeed * (1 + cfg.rushBoost);
    }

    function spendMove(p, amount) {
        if (p.rush > 0) return;
        spend(p, amount);
    }

    // ------------------------------------------------------------ the feet (Quake / Source)
    //
    // Shaun: the movement "the same as the Source engine strafing (Quake?), accel when done
    // right". The velocity follows Quake's player move (PM_Friction, PM_Accelerate,
    // PM_AirAccelerate; Source kept them), with the knobs in CONFIG:
    // - On the ground the floor first takes groundFriction of the speed per second (of at
    //   least stopSpeed, so a slow body stops dead), then the legs add speed along the keys'
    //   direction until the speed THAT way is the wish speed (walk, run, crouch, Rush), at
    //   most groundAccel × the wish speed per second: walking and running feel as before.
    // - In the air nothing brakes, and the keys add speed along their direction only while
    //   the speed that way is under airWishCap (Quake's 30 units/s). W alone leaves a flight
    //   as it is; a strafe key held while the mouse turns the same way keeps that direction
    //   just ahead of the flight, so every step adds a little speed across it: air-strafing
    //   gains about airWishCap m/s per radian turned in sync. Turning faster than
    //   airAccel × the wish speed can follow brakes instead.
    // - Space pressed just before the feet land (JUMP_BUFFER) jumps the frame they land,
    //   before any friction (update): a bunny hop keeps its speed and strafing builds on it;
    //   landing without a jump bleeds it back to the run.
    // Two additions to Quake: below the wish speed the air still carries the body toward it
    // (airControl: a standing jump goes forward, Space mashed from a standstill still gets
    // going), never past it; and what strafing gains fades out from airSoftSpeed to nothing
    // at airMaxSpeed, a soft ceiling so the race with Jane stays a race.
    // Integrated in steps of at most PHYS_STEP, the look turning through the frame, so what a
    // strafe gains does not depend on the frame rate.
    const PHYS_STEP = 1 / 120;
    const YAW_SWEEP = 0.35;   // more turn than this in one frame is a teleport or a snap, not a hand
    const dir = { x: 0, z: 0 };

    // The keys' direction in the world (moveX right, moveZ back, in the body's own frame),
    // into `dir`: zero without keys.
    function keysDir(moveX, moveZ, yaw) {
        const length = Math.hypot(moveX, moveZ);
        if (!(length > 0)) {
            dir.x = 0;
            dir.z = 0;
            return dir;
        }
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        dir.x = ((moveX * cos) + (moveZ * sin)) / length;
        dir.z = ((-moveX * sin) + (moveZ * cos)) / length;
        return dir;
    }

    function scaleSpeed(p, k) {
        p.vx *= k;
        p.vz *= k;
    }

    // PM_Friction, over h seconds.
    function friction(p, h) {
        const speed = Math.hypot(p.vx, p.vz);
        if (speed < 1e-4) {
            p.vx = 0;
            p.vz = 0;
            return;
        }
        const drop = Math.max(speed, cfg.stopSpeed) * cfg.groundFriction * h;
        scaleSpeed(p, Math.max(0, speed - drop) / speed);
    }

    // PM_Accelerate: speed along (dx, dz) until the speed that way is `cap`, at most
    // accel × wishSpeed per second.
    function accelerate(p, dx, dz, cap, wishSpeed, accel, h) {
        const add = cap - ((p.vx * dx) + (p.vz * dz));
        if (add <= 0) return;
        const step = Math.min(accel * wishSpeed * h, add);
        p.vx += step * dx;
        p.vz += step * dz;
    }

    // PM_AirAccelerate (capped at airWishCap, at the whole wish speed's rate), the carry
    // below the wish speed, and the soft ceiling on what strafing gains.
    function airMove(p, dx, dz, wishSpeed, h) {
        const before = Math.hypot(p.vx, p.vz);
        accelerate(p, dx, dz, Math.min(wishSpeed, cfg.airWishCap), wishSpeed, cfg.airAccel, h);
        if (Math.hypot(p.vx, p.vz) < wishSpeed) {
            accelerate(p, dx, dz, wishSpeed, wishSpeed, cfg.airControl, h);
            const now = Math.hypot(p.vx, p.vz);
            if (now > wishSpeed) scaleSpeed(p, wishSpeed / now);
        }
        const after = Math.hypot(p.vx, p.vz);
        if (after > before && after > cfg.airSoftSpeed) {
            const keep = Math.max(0, Math.min(1, (cfg.airMaxSpeed - before) / (cfg.airMaxSpeed - cfg.airSoftSpeed)));
            scaleSpeed(p, (before + ((after - before) * keep)) / after);
        }
    }

    // The frame's change of velocity, in steps of at most PHYS_STEP, the keys' direction
    // turning with the look from where it was a frame ago (yawFrom) to where it is now.
    // wishSpeed 0: no keys (the ground brakes, a flight goes on as it is).
    function moveVelocity(p, dt, moveX, moveZ, yawFrom, wishSpeed) {
        if (!(dt > 0) || (!p.grounded && !(wishSpeed > 0))) return;
        const steps = Math.max(1, Math.ceil((dt / PHYS_STEP) - 1e-9));
        const h = dt / steps;
        const turn = Math.abs(p.yaw - yawFrom) <= YAW_SWEEP ? p.yaw - yawFrom : 0;
        for (let i = 1; i <= steps; i += 1) {
            keysDir(moveX, moveZ, p.yaw - (turn * (1 - (i / steps))));
            if (!p.grounded) {
                airMove(p, dir.x, dir.z, wishSpeed, h);
                continue;
            }
            friction(p, h);
            if (wishSpeed > 0) accelerate(p, dir.x, dir.z, wishSpeed, wishSpeed, cfg.groundAccel, h);
        }
    }

    // ------------------------------------------------------------ one frame

    // moveX / moveZ: the keys, -1..1 (x right, z back), in the player's own frame.
    // Returns the distance walked.
    function update(world, config, dt, moveX, moveZ) {
        cfg = config;
        const p = world.player;
        const keys = world.keys;
        if (world.jumpPressed) {
            p.jumpBuffer = JUMP_BUFFER;
            world.jumpPressed = false;
        }
        const crouchPressed = world.crouchPressed;
        world.crouchPressed = false;
        p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
        p.coyote = Math.max(0, p.coyote - dt);
        // the Rush stands still while a climb or vault plays out: the move is the reward,
        // not a tax on it (startRush)
        if (!p.climb.active) p.rush = Math.max(0, p.rush - dt);
        if (p.rush <= 0) p.rushChain = 0;
        p.lean += (((moveX || 0) * -0.014) - p.lean) * (1 - Math.exp(-6 * dt));
        // the look a frame ago: the keys' direction turns with it through this one
        const yawFrom = p.lastYaw == null ? p.yaw : p.lastYaw;
        p.lastYaw = p.yaw;

        if (p.climb.active) {
            p.staminaIdle += dt;
            return advanceClimb(p, dt);
        }
        settle(world, p);

        // the wanted direction, in the world
        const moving = moveX !== 0 || moveZ !== 0;
        keysDir(moveX, moveZ, p.yaw);
        const wx = dir.x;
        const wz = dir.z;

        const speedNow = Math.hypot(p.vx, p.vz);
        // Ctrl (or C) while sprinting: a slide, fast and low, that bleeds out into a
        // crouch and stands back up when it ends (if there is room). Otherwise a tap
        // toggles the crouch and a hold lies down (ctrlStance).
        if (world.crouchCancel) {
            // the key's release was lost (window blur, pointer lock gone): drop the press
            world.crouchCancel = false;
            if (p.ctrl) p.ctrl.mode = null;
        }
        if (crouchPressed && (p.stance || 0) === 0 && p.grounded && keys.sprint && moving && speedNow > cfg.walkSpeed
            && p.slide <= 0 && p.stamina >= cfg.slideCost) {
            p.slide = cfg.slideTime;
            p.slideX = p.vx / speedNow;
            p.slideZ = p.vz / speedNow;
            setStance(p, 1);
            p.slideCrouch = true;
            if (p.ctrl) p.ctrl.mode = null;
            spend(p, cfg.slideCost);
            tell('slide', speedNow);
        } else {
            ctrlStance(world, p, crouchPressed, Boolean(keys.crouch), dt);
        }
        p.noRoom = Math.max(0, (p.noRoom || 0) - dt);
        // after a slide, up again as soon as the head room allows
        if (p.slideCrouch && p.slide <= 0 && standIfRoom(world, p)) p.slideCrouch = false;
        // lying down: Space gets up onto the knees (a crouch), never a jump or a climb
        if (p.prone && p.jumpBuffer > 0) {
            p.jumpBuffer = 0;
            if (roomFor(world, p, 1)) setStance(p, 1);
            else p.noRoom = 1;
        }
        // crouched, Shift to run stands up first (if there is room)
        if (p.stance === 1 && !p.slideCrouch && keys.sprint && moving && p.slide <= 0) standIfRoom(world, p);

        // Sprinting again costs a jump's worth of Breath, not 5: sprint drains faster than
        // Breath returns, so a lower bar let it re-engage at ~5 and hold the meter there
        // forever — Shift held after running out meant Space never worked again.
        const wantsSprint = keys.sprint && moving && !p.crouched && (p.stamina > cfg.jumpCost || p.rush > 0);

        // what the keys ask for: their speed (the slide keeps to its own curve)
        let wishSpeed;
        if (p.slide > 0) {
            p.slide = Math.max(0, p.slide - dt);
            const left = p.slide / cfg.slideTime;
            wishSpeed = cfg.crouchSpeed + ((cfg.slideSpeed - cfg.crouchSpeed) * left);
            wish.x = p.slideX * wishSpeed;
            wish.z = p.slideZ * wishSpeed;
        } else {
            const sprint = p.rush > 0 ? rushSpeed() : cfg.sprintSpeed;
            wishSpeed = wantsSprint ? sprint : cfg.walkSpeed;
            if (p.crouched) wishSpeed = p.prone ? cfg.proneSpeed : cfg.crouchSpeed;
            wish.x = wx * wishSpeed;
            wish.z = wz * wishSpeed;
        }

        // the Breath: running and every jump, climb and slide spend it (not in a Rush)
        if (wantsSprint && p.grounded && p.slide <= 0 && p.rush <= 0) {
            spend(p, cfg.staminaDrain * dt);
        } else {
            p.staminaIdle += dt;
            if (p.staminaIdle > cfg.staminaRegenDelay) p.stamina = Math.min(100, p.stamina + (cfg.staminaRegen * dt));
        }

        // Space: climb what is in front, or jump — before the feet brake (Quake's order), so
        // a jump the frame they land keeps all of the speed (a bunny hop)
        if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0)) {
            if (tryClimb(world, p, true)) {
                return 0;
            }
            if (p.rush > 0 || p.stamina >= cfg.jumpCost) {
                // a jump out of a slide keeps its speed and lands in a Rush
                p.slideJump = p.slide > 0;
                p.vy = cfg.jumpSpeed;
                p.grounded = false;
                p.coyote = 0;
                p.jumpBuffer = 0;
                p.slide = 0;
                spendMove(p, cfg.jumpCost);
            }
        }

        // the velocity: the slide's own curve, or the feet ("the feet", above)
        if (p.slide > 0) {
            const blend = 1 - Math.exp(-30 * dt);
            p.vx += (wish.x - p.vx) * blend;
            p.vz += (wish.z - p.vz) * blend;
        } else {
            moveVelocity(p, dt, moveX, moveZ, yawFrom, moving ? wishSpeed : 0);
        }

        const wantX = p.vx * dt;
        const wantZ = p.vz * dt;
        const beforeX = p.x;
        const beforeZ = p.z;
        hit.stopped = false;
        const travelled = moveBy(world, wantX, wantZ);
        if (dt > 0) {
            // what the walls took, the feet lose (no pushing on through a wall)
            p.vx = (p.x - beforeX) / dt;
            p.vz = (p.z - beforeZ) / dt;
        }
        if (!p.grounded && !p.prone && moving && (travelled < Math.hypot(wantX, wantZ) * 0.5 || hit.stopped) && tryClimb(world, p, false)) {
            return travelled;
        }

        // gravity, landing, and the head against a low ceiling
        if (!p.grounded) {
            const before = p.y;
            p.vy -= cfg.gravity * dt;
            p.y += p.vy * dt;
            const body = bodyHeight(p);
            const ceiling = ceilingOver(world, p.x, p.z, before);
            if (p.y + body > ceiling) {
                p.y = ceiling - body;
                if (p.vy > 0) p.vy = 0;
            }
            // (a box's top is landed on only from above it)
            const under = groundUnder(world, p.x, p.z, before + AIR_STEP);
            if (!Number.isNaN(under) && p.y <= under) land(p, under);
        }

        if (p.grounded) p.bob += travelled * (p.prone ? 3.6 : (p.crouched ? 2.9 : (wantsSprint ? 2.0 : 2.3)));
        return travelled;
    }

    // Where the eyes are this frame: feet + eye height (crouch eases it), eased up and
    // down steps, the landing dip, the walk's bob and sway. Written into one object.
    function pose(world, config, dt) {
        cfg = config;
        const p = world.player;
        const step = dt || 0;
        // the eyes ease to the stance's height (going down to the floor or up from it is slower)
        let eyeGoal = cfg.eyeHeight;
        if (p.stance === 1) eyeGoal = cfg.crouchEyeHeight;
        else if (p.stance === 2) eyeGoal = cfg.proneEyeHeight;
        if (p.eyeLevel == null) p.eyeLevel = eyeGoal;
        const eyeRate = (p.stance === 2 || p.eyeLevel < cfg.crouchEyeHeight - 0.05) ? 6 : 10;
        p.eyeLevel += (eyeGoal - p.eyeLevel) * (1 - Math.exp(-eyeRate * step));
        const eye = p.eyeLevel;
        if (p.grounded && !p.climb.active && Math.abs(p.y - p.viewY) < 1) {
            p.viewY += (p.y - p.viewY) * (1 - Math.exp(-16 * step));
        } else {
            p.viewY = p.y;
        }
        if (step > 0) {
            p.dipVel += ((-110 * p.dip) - (21 * p.dipVel)) * step;
            p.dip = Math.max(-0.3, Math.min(0.1, p.dip + (p.dipVel * step)));
        }
        const speed = Math.hypot(p.vx, p.vz);
        const walking = p.grounded && !p.climb.active && p.slide <= 0;
        const target = walking ? Math.min(1.5, speed / cfg.walkSpeed) : 0;
        p.bobAmp += (target - p.bobAmp) * (1 - Math.exp(-8 * step));
        const amp = p.bobAmp * (p.prone ? 0.35 : (p.crouched ? 0.6 : 1));
        const s = Math.sin(p.bob);
        const sway = amp * 0.022 * s;
        const lift = amp * 0.045 * (Math.abs(s) - 0.64);

        view.x = p.x + (Math.cos(p.yaw) * sway);
        view.z = p.z - (Math.sin(p.yaw) * sway);
        view.y = p.viewY + eye + lift + p.dip;
        view.pitch = (p.dip * 0.35) - (p.climb.active ? 0.12 * Math.sin(Math.PI * p.climb.t) : 0);
        view.roll = (amp * 0.006 * s) + p.lean;
        return view;
    }

    // A fresh body at the vigil's start, feet on the floor under it.
    function reset(world, config) {
        cfg = config;
        load();
        const p = world.player;
        Object.assign(p, {
            vx: 0, vz: 0, vy: 0, grounded: true, coyote: 0, jumpBuffer: 0, lastYaw: null,
            stance: 0, crouched: false, prone: false, slideCrouch: false, noRoom: 0, ctrl: { mode: null, time: 0 }, eyeLevel: cfg.eyeHeight, slide: 0, slideX: 0, slideZ: 0, slideJump: false, rush: 0, rushes: 0, rushChain: 0,
            viewY: 0, dip: 0, dipVel: 0, bobAmp: 0, lean: 0,
            climb: { active: false, vault: false, t: 0, time: 1, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, top: 0, speed: 0, fx: 0, fz: 0 }
        });
        world.jumpPressed = false;
        world.crouchPressed = false;
        const under = groundUnder(world, p.x, p.z, 0.5);
        p.y = Number.isNaN(under) ? 0 : under;
        p.viewY = p.y;
    }

    // The cathedral's collision read before any level exists (cathedral.js lays the
    // relics, stands and hiding spots on it, and proves the reliquaries' climbs with it):
    // { ground, clear } at a point — the architecture's field with the props' box tops
    // laid on it, as the player meets them — or null in stone, outside it, or while the
    // files are missing.
    function fieldAt(x, z) {
        const f = field.arch && field.boxes ? field.arch : field.data;
        if (!f) return null;
        const i = Math.floor((x - f.x0) / f.res);
        const j = Math.floor((z - f.z0) / f.res);
        if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) return null;
        const code = f.height[(j * f.cols) + i];
        if (code === f.blocked) return null;
        probe.ground = (code * f.hq) + f.h0;
        probe.clear = f.clear[(j * f.cols) + i] * f.hq;
        if (f === field.arch && !pointBoxes(field.boxes, x, z)) return null;
        return { ground: probe.ground, clear: probe.clear };
    }

    // The prop box whose footprint holds a point (null: none, or no boxes): a
    // reliquary goes to the middle of a box's top, where the statue's crown is.
    function boxAt(x, z) {
        if (!field.arch || !field.boxes) return null;
        let found = null;
        field.boxes.forEach((b) => {
            if (touches(b, x, z, 0) && (!found || b.y1 > found.y1)) found = b;
        });
        return found ? { name: found.name, x: found.x, z: found.z, y: found.y1 } : null;
    }

    // The floor at one point (null in stone): lets anything stand on the real ground
    // (the props' tops, never the level's hiding-spot tables: the girls walk under them).
    function groundAt(world, x, z) {
        if (!world.parsed) return null;
        return sample(world, x, z, true) ? probe.ground : null;
    }

    // Nothing but low things (a tomb, a bath, a dais: up to ~1.4 m) between two points?
    // Stone and anything taller cut the line. `margin` metres at each end are not looked
    // at (whoever stands there). The Nun's aura and her last steps onto a tomb use it.
    function clearLine(world, x0, z0, x1, z1, margin) {
        const length = Math.hypot(x1 - x0, z1 - z0);
        const steps = Math.floor(length / 0.25);
        for (let i = 1; i < steps; i += 1) {
            const along = (i / steps) * length;
            if (along < margin || along > length - margin) continue;
            const t = i / steps;
            if (!sample(world, x0 + ((x1 - x0) * t), z0 + ((z1 - z0) * t)) || probe.ground > 1.4) return false;
        }
        return true;
    }

    // Tests: ground and head room at a point, and whether the body fits there.
    function inspect(world, x, z) {
        if (!world.parsed || !cfg) return null;
        const p = world.player;
        const here = sample(world, x, z) ? { ground: probe.ground, clear: probe.clear } : null;
        const fits = p ? fitAt(world, x, z, p.y, p.grounded ? cfg.stepHeight : AIR_STEP, bodyHeight(p)) : null;
        return {
            here,
            fits,
            blockedBy: hit.box ? hit.box.name : null,
            under: groundUnder(world, x, z, p ? p.y + bodyHeight(p) : Infinity)
        };
    }

    // ------------------------------------------------------------ the dev overlay
    //
    // devVideoMenu.js "Show hitboxes": every collider box of the level as a translucent
    // box with bright edges (props orange, the level's own tables cyan), and the
    // architecture's height field faintly (its stone and raised cells). Unlit materials,
    // built with the level (stampHideouts) and only shown or hidden afterwards.

    function removeOverlay() {
        const group = overlay.group;
        overlay.group = null;
        if (!group) return;
        if (group.parent) group.parent.remove(group);
        group.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) object.material.dispose();
        });
    }

    function buildOverlay(world) {
        removeOverlay();
        const THREE = window.THREE;
        const parent = world.levelGroup || world.scene;
        if (!THREE || !parent || !boxMode(world)) return;
        const group = new THREE.Group();
        group.name = 'dev-hitboxes';
        const colours = { prop: 0xff8a1a, level: 0x33d6ff };
        const fills = {};
        const lines = {};
        Object.keys(colours).forEach((kind) => {
            fills[kind] = new THREE.MeshBasicMaterial({ color: colours[kind], transparent: true, opacity: 0.18, depthWrite: false, fog: false });
            lines[kind] = new THREE.LineBasicMaterial({ color: colours[kind], fog: false });
        });
        boxesOf(world).forEach((b) => {
            const geometry = new THREE.BoxGeometry(b.hu * 2, Math.max(0.01, b.y1 - b.y0), b.hv * 2);
            const fill = new THREE.Mesh(geometry, fills[b.kind] || fills.prop);
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lines[b.kind] || lines.prop);
            [fill, edges].forEach((object) => {
                object.position.set(b.x, (b.y0 + b.y1) / 2, b.z);
                object.rotation.y = -b.a;   // its u side from +x toward +z
                object.renderOrder = 10;
                group.add(object);
            });
        });
        // the architecture: stone columns and raised cells of its field, faint
        const f = field.arch;
        const cells = [];
        for (let j = 0; j < f.rows; j += 1) {
            for (let i = 0; i < f.cols; i += 1) {
                const code = f.height[(j * f.cols) + i];
                const ground = (code * f.hq) + f.h0;
                if (code === f.blocked || Math.abs(ground) > 0.15) cells.push(i, j, code === f.blocked ? LIMIT : ground);
            }
        }
        if (cells.length) {
            const count = cells.length / 3;
            const cell = new THREE.Mesh(new THREE.BoxGeometry(f.res * 0.92, 1, f.res * 0.92),
                new THREE.MeshBasicMaterial({ color: 0x9aa6ff, transparent: true, opacity: 0.07, depthWrite: false, fog: false }));
            const stone = new THREE.InstancedMesh(cell.geometry, cell.material, count);
            const m = new THREE.Matrix4();
            for (let k = 0; k < count; k += 1) {
                const top = cells[(k * 3) + 2];
                const bottom = Math.min(0, top);
                const height = Math.max(0.02, top - bottom);
                m.makeScale(1, height, 1);
                m.setPosition(f.x0 + ((cells[k * 3] + 0.5) * f.res), bottom + (height / 2), f.z0 + ((cells[(k * 3) + 1] + 0.5) * f.res));
                stone.setMatrixAt(k, m);
            }
            stone.renderOrder = 9;
            group.add(stone);
        }
        group.visible = overlay.shown;
        parent.add(group);
        overlay.group = group;
        overlay.level = world.level;
    }

    // The dev toggle: show or hide the overlay (it is built with every level).
    function setHitboxes(on) {
        overlay.shown = Boolean(on);
        if (overlay.group) overlay.group.visible = overlay.shown;
        return overlay.shown;
    }

    // Tests and the overlay: every collider box of the level, as plain data.
    function colliders(world) {
        return boxesOf(world).map((b) => ({ name: b.name, kind: b.kind, x: b.x, z: b.z, a: b.a, hu: b.hu, hv: b.hv, y0: b.y0, y1: b.y1 }));
    }

    load();

    NW.Parkour = {
        load,
        isReady: () => Boolean(field.data && field.settled),
        reset,
        update,
        pose,
        moveBy,
        listen: (fn) => { feet = typeof fn === 'function' ? fn : null; },
        stampHideouts,
        fieldAt,
        boxAt,
        groundAt,
        clearLine,
        inspect,
        colliders,
        setHitboxes,
        hitboxesShown: () => overlay.shown,
        GRAB_REACH,
        hasBoxes: () => Boolean(field.arch && field.boxes)
    };
})();
