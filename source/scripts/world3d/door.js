/**
 * The Nun 3D — the locked side door by the altar, and its key.
 *
 * The nave's right wall, near the altar, has a doorway (cathedral.js
 * NW.Cathedral.sideDoorway: { x, z, width, height, nx, nz }, (nx, nz) pointing into the
 * nave; the corridor behind it is another module's). A heavy gothic door fills it, locked,
 * and every vigil one key lies somewhere down the nave on a real surface (the relics' own
 * spots: cathedral.js surfaceSpots), glinting faintly like a reliquary. Looked at up close
 * it is taken like a relic (E / left click) and shows in the inventory slot at the bottom
 * of the HUD (#world-inventory). At the door without it the HUD says "This door is
 * locked"; with it, "Press E to open": the key is used up and the door swings open into
 * the corridor (DOOR.openSeconds) and stays open — the doorway's collider goes and
 * world.sideDoorOpen turns true (the Demoness may follow the player through then). Every
 * level build (every vigil, every retry) closes and locks it again and lays a new key.
 *
 * The door collides as one box in world.levelBoxes (parkour.js), like the hiding tables:
 * the doorway while closed, the leaf folded along the corridor's wall once open. It and
 * the key are built with the level (world.js buildLevel, before prewarm) and only turned
 * or hidden afterwards; no light.
 *
 * world.js calls build() at the end of its level build, keyTarget() / doorTarget() from
 * findTarget(), act() from onActionPressed() and update() every playable frame.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // The key's id in the run's emptied-spots list (gameState.js takenSpots): it is not a
    // relic and it moves every build, so it gets one fixed id of its own.
    const KEY_SPOT = 'key';

    const DOOR = {
        thickness: 0.09,
        // it swings into the corridor, hinged on the left as seen from the nave, not quite
        // flat against the corridor's wall
        openAngle: 88 * Math.PI / 180,
        openSeconds: 1.1,
        // "arrives at the door": the eyes' ray meets the leaf within `reach` metres, from
        // no further than `standoff` in front of it
        reach: 2.3,
        standoff: 1.9
    };
    // The doorway's size when cathedral.js leaves it out.
    const OPENING = { width: 1.4, height: 2.5 };
    // The key: well ahead of the vigil's start toward the altar (Jane's wall sweeps what
    // lies behind the start at once), not at the door, clear of the altar's reach, the
    // relics, the candle stands and the hiding tables; never on a summit (no climb needed).
    // The few low tops (pew seats, benches, tables: ~60) and plinths (~40) are favoured
    // over the many feet of walls and pillars (~950), so about a third of vigils put it up
    // on something instead of on the floor.
    // `glint` is the beacon sprite's size: the key is the one pickup a whole vigil can turn
    // on (the corridor behind the door holds more than the nave does), and it used to lie
    // there with no clue at all — three honest runs in six ended with nothing. So it is
    // signposted harder than a reliquary (0.55): a bigger beacon pulse, and the relics'
    // distance shimmer (marked a prize, so it breathes) fading in over relicSightRange.
    const KEY = {
        ahead: 8, fromDoor: 6, fromAltar: 4, fromRelic: 2, fromStand: 1.2, fromTable: 2, glint: 0.85, sight: 1.5,
        weight: { floor: 1, plinth: 3, furniture: 6 }
    };

    const state = { door: null, key: null, held: false };
    const cache = {};

    function T() {
        return window.THREE;
    }

    function rng(seed) {
        let value = (seed >>> 0) || 1;
        return function next() {
            value = (value + 0x6D2B79F5) >>> 0;
            let x = value;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ------------------------------------------------------------ the door's look

    // Six dark oak boards, top to bottom, with their grain, a knot or two, worn edges and
    // grime rising from the floor. Drawn once, kept for every vigil.
    function plankTexture(THREE) {
        if (cache.planks) return cache.planks;
        const W = 256;
        const H = 512;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        const random = rng(1847);
        ctx.fillStyle = '#0d0703';   // the gaps between the boards
        ctx.fillRect(0, 0, W, H);
        const boards = 6;
        const bw = W / boards;
        for (let b = 0; b < boards; b += 1) {
            const x = b * bw;
            const tone = 0.82 + (random() * 0.32);
            ctx.fillStyle = `rgb(${Math.round(84 * tone)},${Math.round(54 * tone)},${Math.round(31 * tone)})`;
            ctx.fillRect(x + 2, 0, bw - 4, H);
            for (let k = 0; k < 16; k += 1) {
                const gx = x + 4 + (random() * (bw - 8));
                ctx.strokeStyle = `rgba(22, 11, 4, ${0.16 + (random() * 0.3)})`;
                ctx.lineWidth = 0.6 + (random() * 1.4);
                ctx.beginPath();
                ctx.moveTo(gx, 0);
                ctx.bezierCurveTo(gx + ((random() - 0.5) * 8), H * 0.33, gx + ((random() - 0.5) * 8), H * 0.66, gx + ((random() - 0.5) * 5), H);
                ctx.stroke();
            }
            if (random() < 0.7) {
                const kx = x + 9 + (random() * (bw - 18));
                const ky = 30 + (random() * (H - 60));
                ctx.strokeStyle = 'rgba(20, 10, 3, 0.55)';
                ctx.lineWidth = 1;
                for (let ring = 1; ring <= 3; ring += 1) {
                    ctx.beginPath();
                    ctx.ellipse(kx, ky, ring * 2.2, ring * 5.5, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            ctx.fillStyle = 'rgba(255, 214, 160, 0.08)';
            ctx.fillRect(x + 2, 0, 2, H);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
            ctx.fillRect(x + bw - 5, 0, 3, H);
        }
        const grime = ctx.createLinearGradient(0, 0, 0, H);
        grime.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        grime.addColorStop(0.18, 'rgba(0, 0, 0, 0)');
        grime.addColorStop(0.72, 'rgba(0, 0, 0, 0)');
        grime.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        ctx.fillStyle = grime;
        ctx.fillRect(0, 0, W, H);
        const image = ctx.getImageData(0, 0, W, H);
        for (let i = 0; i < image.data.length; i += 4) {
            const n = (random() - 0.5) * 22;
            image.data[i] += n;
            image.data[i + 1] += n;
            image.data[i + 2] += n;
        }
        ctx.putImageData(image, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = 4;
        cache.planks = texture;
        return texture;
    }

    function materials(THREE) {
        if (cache.materials) return cache.materials;
        const planks = plankTexture(THREE);
        cache.materials = {
            wood: new THREE.MeshStandardMaterial({ map: planks, bumpMap: planks, bumpScale: 0.025, roughness: 0.86, metalness: 0 }),
            // Forged iron, mostly diffuse: a fully metallic surface only mirrors, and there
            // is nothing to mirror in the dark (cathedral.js prepareMaterial caps it too).
            iron: new THREE.MeshStandardMaterial({ color: 0x3b3631, roughness: 0.58, metalness: 0.35 }),
            hole: new THREE.MeshStandardMaterial({ color: 0x030202, roughness: 1, metalness: 0 })
        };
        return cache.materials;
    }

    // [geometry, matrix] placed at (x, y, z), turned by (rx, ry, rz).
    function at(geometry, x, y, z, rx, ry, rz) {
        const THREE = T();
        const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
            new THREE.Vector3(1, 1, 1)
        );
        return [geometry, matrix];
    }

    // Many placed parts sharing one material become one geometry (one draw call).
    function merge(THREE, parts) {
        let count = 0;
        const ready = parts.map(([geometry, matrix]) => {
            const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
            g.applyMatrix4(matrix);
            count += g.attributes.position.count;
            return g;
        });
        const position = new Float32Array(count * 3);
        const normal = new Float32Array(count * 3);
        const uv = new Float32Array(count * 2);
        let offset = 0;
        ready.forEach((g) => {
            position.set(g.attributes.position.array, offset * 3);
            normal.set(g.attributes.normal.array, offset * 3);
            if (g.attributes.uv) uv.set(g.attributes.uv.array, offset * 2);
            offset += g.attributes.position.count;
            g.dispose();
        });
        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
        merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        merged.computeBoundingSphere();
        return merged;
    }

    // The leaf, in its hinge's frame: x from the hinge (0) to the free edge (width), y up
    // from the floor, z from its back (0, the corridor) to its face (thickness, the nave).
    // Vertical boards; three iron strap hinges from the hinge edge ending in lozenges,
    // studded, with their knuckles on the edge; a studded border; a ring pull on a round
    // plate and a lock plate with its keyhole; ledges and braces on the back.
    function makeLeaf(THREE, width, height) {
        const W = width;
        const H = height;
        const D = DOOR.thickness;
        const templates = [];
        const geo = (geometry) => {
            templates.push(geometry);
            return geometry;
        };
        const wood = [];
        const iron = [];
        const hole = [];
        const box = (w, h, d) => geo(new THREE.BoxGeometry(w, h, d));
        const stud = geo(new THREE.CylinderGeometry(0.014, 0.019, 0.012, 8));
        const knuckle = geo(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 10));
        const face = D;   // the nave side

        wood.push(at(box(W, H, D), W / 2, H / 2, D / 2));
        // the back: three ledges and a brace between each pair (the corridor's side)
        const ledges = [0.32, H / 2, H - 0.34];
        const ledge = box(W - 0.12, 0.12, 0.03);
        ledges.forEach((y) => wood.push(at(ledge, W / 2, y, -0.015)));
        for (let i = 0; i < ledges.length - 1; i += 1) {
            const x0 = 0.12;
            const x1 = W - 0.12;
            const y0 = ledges[i] + 0.07;
            const y1 = ledges[i + 1] - 0.07;
            const length = Math.hypot(x1 - x0, y1 - y0);
            wood.push(at(box(length, 0.1, 0.022), (x0 + x1) / 2, (y0 + y1) / 2, -0.011, 0, 0, Math.atan2(y1 - y0, x1 - x0)));
        }

        // strap hinges (the middle one stops short of the ring and the lock)
        const lozenge = box(0.1, 0.1, 0.012);
        const wrap = box(0.012, 0.075, D + 0.024);
        ledges.forEach((y, i) => {
            const length = W * (i === 1 ? 0.6 : 0.8);
            iron.push(at(box(length, 0.075, 0.012), length / 2, y, face + 0.006));
            iron.push(at(lozenge, length + 0.02, y, face + 0.006, 0, 0, Math.PI / 4));
            iron.push(at(wrap, -0.006, y, D / 2));
            iron.push(at(knuckle, 0, y, 0));
            for (let x = 0.09; x < length - 0.02; x += 0.16) iron.push(at(stud, x, y, face + 0.016, Math.PI / 2, 0, 0));
            iron.push(at(stud, length + 0.02, y, face + 0.016, Math.PI / 2, 0, 0));
        });
        // the studded border (none under a strap)
        for (let y = 0.1; y < H - 0.05; y += 0.2) {
            if (ledges.some((strapY) => Math.abs(strapY - y) < 0.07)) continue;
            iron.push(at(stud, 0.06, y, face + 0.006, Math.PI / 2, 0, 0));
            iron.push(at(stud, W - 0.06, y, face + 0.006, Math.PI / 2, 0, 0));
        }
        for (let x = 0.26; x < W - 0.2; x += 0.2) {
            iron.push(at(stud, x, 0.06, face + 0.006, Math.PI / 2, 0, 0));
            iron.push(at(stud, x, H - 0.06, face + 0.006, Math.PI / 2, 0, 0));
        }
        // the ring pull on its plate, and the lock plate above it
        const handleX = W - 0.2;
        iron.push(at(geo(new THREE.CylinderGeometry(0.075, 0.08, 0.012, 20)), handleX, 1.02, face + 0.006, Math.PI / 2, 0, 0));
        iron.push(at(geo(new THREE.SphereGeometry(0.024, 12, 8)), handleX, 1.02, face + 0.02));
        iron.push(at(geo(new THREE.TorusGeometry(0.075, 0.012, 8, 28)), handleX, 1.02 - 0.075, face + 0.034, -0.25, 0, 0));
        iron.push(at(box(0.12, 0.18, 0.012), handleX, 1.3, face + 0.006));
        [[-0.042, -0.07], [0.042, -0.07], [-0.042, 0.07], [0.042, 0.07]].forEach(([dx, dy]) => {
            iron.push(at(stud, handleX + dx, 1.3 + dy, face + 0.016, Math.PI / 2, 0, 0));
        });
        hole.push(at(geo(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 12)), handleX, 1.315, face + 0.013, Math.PI / 2, 0, 0));
        hole.push(at(box(0.012, 0.036, 0.006), handleX, 1.29, face + 0.013));

        const mats = materials(THREE);
        const leaf = new THREE.Group();
        [[wood, mats.wood], [iron, mats.iron], [hole, mats.hole]].forEach(([parts, material]) => {
            leaf.add(new THREE.Mesh(merge(THREE, parts), material));
        });
        templates.forEach((geometry) => geometry.dispose());
        return leaf;
    }

    // ------------------------------------------------------------ the key's look

    // A big gilded church key, flat on its surface with its length along z (like a relic,
    // models.js makeRelic): an ornate bow with three bosses, a collar, the shaft and a
    // notched bit. It is dressed like a reliquary so models.js lights and animates it the
    // same way (setRelicLit: dim until a candle's pool or a look reaches it; animateRelic:
    // a faint glint in the fog every few seconds, a soft glow while it can be taken).
    function makeKey(THREE) {
        const Models = NW.Models;
        const templates = [];
        const geo = (geometry) => {
            templates.push(geometry);
            return geometry;
        };
        const flat = Math.PI / 2;
        const bowZ = 0.1;
        const bowR = 0.042;
        const boss = geo(new THREE.SphereGeometry(0.011, 10, 8));
        const parts = [
            at(geo(new THREE.TorusGeometry(bowR, 0.009, 8, 28)), 0, 0, bowZ, flat, 0, 0),
            at(geo(new THREE.TorusGeometry(0.014, 0.004, 6, 16)), 0, 0, bowZ, flat, 0, 0),
            at(boss, 0, 0, bowZ + bowR + 0.004),
            at(boss, bowR + 0.004, 0, bowZ),
            at(boss, -(bowR + 0.004), 0, bowZ),
            at(geo(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 12)), 0, 0, bowZ - bowR - 0.009, flat, 0, 0),
            at(geo(new THREE.CylinderGeometry(0.0075, 0.0075, 0.17, 10)), 0, 0, -0.04, flat, 0, 0),
            at(geo(new THREE.BoxGeometry(0.048, 0.012, 0.015)), 0.028, 0, -0.118),
            at(geo(new THREE.BoxGeometry(0.036, 0.012, 0.013)), 0.022, 0, -0.092),
            at(geo(new THREE.BoxGeometry(0.012, 0.012, 0.04)), 0.046, 0, -0.105)
        ];
        const body = new THREE.Mesh(merge(THREE, parts), Models.material('goldDim'));
        templates.forEach((geometry) => geometry.dispose());

        const root = new THREE.Group();
        const pivot = new THREE.Group();
        pivot.add(body);
        root.add(pivot);
        const glow = Models.glowSprite('rgba(255,210,120,0.8)', 0.6, 0);
        glow.position.y = 0.08;
        glow.visible = false;
        root.add(glow);
        const beacon = Models.glowSprite('rgba(255,200,110,0.9)', KEY.glint, 0);
        beacon.material.fog = true;
        beacon.position.y = 0.16;
        root.add(beacon);
        // glowSize: models.js markRelicPrize scales the shimmer off it (a relic's own
        // makeRelic keeps the same field) — without it the key could not be marked.
        root.userData = { kind: 'key', pivot, glow, glowSize: 0.6, beacon, parts: [{ piece: body, key: 'gold' }], rest: 0.011, lit: false, shine: 0, t: Math.random() * 6 };
        return root;
    }

    // ------------------------------------------------------------ the doorway

    // Where the door stands: cathedral.js's doorway (null without one). Adds the floor
    // under it and the unit vectors: n into the nave, a along the door (the viewer's right).
    function doorway() {
        const published = NW.Cathedral && NW.Cathedral.sideDoorway;
        if (!published || !Number.isFinite(published.x) || !Number.isFinite(published.z)
            || !Number.isFinite(published.nx) || !Number.isFinite(published.nz) || Math.hypot(published.nx, published.nz) < 0.5) {
            return null;
        }
        const n = Math.hypot(published.nx, published.nz);
        const d = {
            x: published.x, z: published.z, nx: published.nx / n, nz: published.nz / n,
            width: published.width || OPENING.width, height: published.height || OPENING.height,
            y: Number.isFinite(published.y) ? published.y : null
        };
        d.ax = d.nz;
        d.az = -d.nx;
        if (d.y == null) {
            // the floor in the doorway, else in front of it (the nave's), else 0
            d.y = 0;
            const at = NW.Parkour && NW.Parkour.fieldAt;
            for (let k = 0; at && k <= 8; k += 1) {
                const sample = at(d.x + (d.nx * 0.3 * k), d.z + (d.nz * 0.3 * k));
                if (sample) {
                    d.y = sample.ground;
                    break;
                }
            }
        }
        return d;
    }

    // The closed door's collider: the whole opening, a little into the jambs, from just in
    // front of the leaf to behind it, taller than anything stood on (parkour.js: a wall).
    function doorBox(door) {
        const cx = door.x - (door.nx * 0.1);
        const cz = door.z - (door.nz * 0.1);
        const a = Math.atan2(door.az, door.ax);   // its u side along the door, from +x toward +z
        const hu = (door.width / 2) + 0.1;
        const hv = 0.2;
        return {
            name: 'side door', kind: 'level', x: cx, z: cz, a, c: Math.cos(a), s: Math.sin(a),
            hu, hv, y0: door.y - 0.1, y1: door.y + 3.2, r: Math.hypot(hu, hv)
        };
    }

    // Open, the leaf stands folded into the corridor along its wall (a hand's width proud of
    // it): a thin box of its own, so nobody walks through it.
    function leafBox(door) {
        const phi = DOOR.openAngle;
        const W = door.width - 0.02;
        // the leaf in its hinge's frame: x 0..W, z -0.03 (the back's ledges) .. thickness +
        // 0.05 (the iron); turned by phi its length runs along u, its thickness along v
        const ux = Math.cos(phi);
        const uz = -Math.sin(phi);
        const vx = Math.sin(phi);
        const vz = Math.cos(phi);
        const mid = (DOOR.thickness + 0.02) / 2;
        // in the door's frame (x along the door, z into the nave), then the world's
        const lx = -(door.width / 2) + 0.01 + (ux * W / 2) + (vx * mid);
        const lz = -DOOR.thickness + (uz * W / 2) + (vz * mid);
        const x = door.x + (lx * door.ax) + (lz * door.nx);
        const z = door.z + (lx * door.az) + (lz * door.nz);
        const a = Math.atan2((ux * door.az) + (uz * door.nz), (ux * door.ax) + (uz * door.nx));
        const hu = W / 2;
        const hv = (DOOR.thickness + 0.08) / 2;
        return {
            name: 'side door (open)', kind: 'level', x, z, a, c: Math.cos(a), s: Math.sin(a),
            hu, hv, y0: door.y - 0.1, y1: door.y + 3.2, r: Math.hypot(hu, hv)
        };
    }

    // Keep the door's box (door.box: the doorway while closed, the folded leaf once open) in
    // the level's colliders (world.levelBoxes, rebuilt with every level by parkour.js
    // stampHideouts; put back if anything rebuilt it since).
    function ensureCollider(world) {
        const door = state.door;
        if (!door) return;
        const own = world.levelBoxes;
        door.boxed = Boolean(own && own.level === world.level && Array.isArray(own.all));
        if (!door.boxed || own.all.includes(door.box)) return;
        if (Array.isArray(own.own) && !own.own.includes(door.box)) own.own.push(door.box);
        own.all = own.all.concat(door.box).sort((p, q) => p.y0 - q.y0);
    }

    function dropCollider(world) {
        const own = world.levelBoxes;
        const box = state.door && state.door.box;
        if (!own || !box) return;
        if (Array.isArray(own.own)) own.own = own.own.filter((b) => b !== box);
        if (Array.isArray(own.all)) own.all = own.all.filter((b) => b !== box);
    }

    // Without the prop colliders (parkour.js's old whole-model field) there are no level
    // boxes: the door holds the body back itself, out of its box across its thin side.
    function holdBack(world, config) {
        const door = state.door;
        const p = world.player;
        if (!door || door.boxed || !p || !NW.Parkour) return;
        const b = door.box;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const u = (dx * b.c) + (dz * b.s);
        const v = (dz * b.c) - (dx * b.s);   // across the box: (-s, c) in the world
        const r = config.radius || 0.35;
        if (Math.abs(u) >= b.hu + r || Math.abs(v) >= b.hv + r) return;
        const push = v >= 0 ? (b.hv + r) - v : -((b.hv + r) + v);
        NW.Parkour.moveBy(world, -b.s * push, b.c * push);
    }

    // ------------------------------------------------------------ the key's spot

    // A random free surface a relic could have taken (cathedral.js surfaceSpots: flat, on
    // the floor at the foot of something or on a low top, with floor to stand on within
    // reach), in the part of the nave the vigil's start connects to, away from everything
    // listed in KEY. The rules loosen (door, then start) only if nothing is left.
    function placeKey(world, config, door) {
        const parsed = world.parsed;
        const grid = parsed.grid;
        const cs = grid.cellSize;
        const toWorld = (cell) => grid.toWorld(cell.x, cell.z);
        const altar = world.altar;
        // where the player starts: nunHeadStart down the nave from Jane (world.js resetPlayer)
        let start = toWorld(parsed.spots.start);
        if (parsed.spots.nun && altar) {
            const nun = toWorld(parsed.spots.nun);
            const length = Math.hypot(altar.x - nun.x, altar.z - nun.z) || 1;
            const step = Math.min(length, config.nunHeadStart || 8);
            start = { x: nun.x + (((altar.x - nun.x) / length) * step), z: nun.z + (((altar.z - nun.z) / length) * step) };
        }
        const toAltar = altar ? Math.hypot(altar.x - start.x, altar.z - start.z) || 1 : 1;
        const reached = grid.distanceField(parsed.spots.start.x, parsed.spots.start.z);
        const connected = (x, z) => {
            const ci = Math.floor(x / cs);
            const cj = Math.floor(z / cs);
            for (let dj = -1; dj <= 1; dj += 1) {
                for (let di = -1; di <= 1; di += 1) {
                    const i = ci + di;
                    const j = cj + dj;
                    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height || !(reached[(j * grid.width) + i] >= 0)) continue;
                    if (Math.hypot(((i + 0.5) * cs) - x, ((j + 0.5) * cs) - z) <= 1.3) return true;
                }
            }
            return false;
        };
        const away = (list, x, z, gap) => (list || []).every((item) => Math.hypot(item.x - x, item.z - z) >= gap);
        const fits = (x, z, strict) => {
            if (door) {
                const dx = x - door.x;
                const dz = z - door.z;
                // right behind the doorway: the corridor, not the nave
                if ((dx * door.nx) + (dz * door.nz) < 0.3 && Math.abs((dx * door.ax) + (dz * door.az)) < door.width) return false;
                if (strict >= 2 && Math.hypot(dx, dz) < KEY.fromDoor) return false;
            }
            if (strict >= 1 && altar && (((start.x - x) * (start.x - altar.x)) + ((start.z - z) * (start.z - altar.z))) / toAltar < KEY.ahead) return false;
            if (altar && Math.hypot(altar.x - x, altar.z - z) < KEY.fromAltar) return false;
            return away(world.relics, x, z, KEY.fromRelic) && away(world.candles, x, z, KEY.fromStand)
                && away(world.hideouts, x, z, KEY.fromTable) && connected(x, z);
        };
        let pool = [];
        const spots = world.level && world.level.surfaceSpots;
        const usable = Array.isArray(spots) ? spots.filter((spot) => spot.kind !== 'summit') : [];
        if (!usable.length) {
            // no height field: the floor of an open grid cell
            for (let j = 0; j < grid.height; j += 1) {
                for (let i = 0; i < grid.width; i += 1) {
                    if (grid.isBlocked(i, j)) continue;
                    const x = (i + 0.5) * cs;
                    const z = (j + 0.5) * cs;
                    const ground = NW.Parkour ? NW.Parkour.groundAt(world, x, z) : 0;
                    if (ground != null) usable.push({ x, z, y: ground, kind: 'floor', along: null });
                }
            }
        }
        for (let strict = 2; strict >= 0 && !pool.length; strict -= 1) {
            pool = usable.filter((spot) => fits(spot.x, spot.z, strict));
        }
        if (!pool.length) return null;
        const weight = (spot) => KEY.weight[spot.kind] || 1;
        let pick = Math.random() * pool.reduce((sum, spot) => sum + weight(spot), 0);
        for (let i = 0; i < pool.length; i += 1) {
            pick -= weight(pool[i]);
            if (pick <= 0) return pool[i];
        }
        return pool[pool.length - 1];
    }

    // ------------------------------------------------------------ build

    // At the end of every level build (world.js buildLevel, before prewarm): the door
    // closed and locked, its collider in, a new key laid, the inventory emptied.
    function build(group, world, config) {
        const THREE = T();
        state.door = null;
        state.key = null;
        state.held = false;
        world.sideDoorOpen = false;
        // the built-in tile levels have no side door (and so no key)
        const d = THREE && world.level && world.level.environment === 'cathedral' && NW.Models ? doorway() : null;
        if (d) {
            const root = new THREE.Group();
            root.name = 'side-door';
            root.position.set(d.x, d.y, d.z);
            root.rotation.y = Math.atan2(d.nx, d.nz);   // its +z into the nave, +x along the door
            const hinge = new THREE.Group();
            // the pin: the leaf's back corner on the left as seen from the nave; a finger's
            // clearance in the jambs and under the lintel
            hinge.position.set(-(d.width / 2) + 0.01, 0, -DOOR.thickness);
            hinge.add(makeLeaf(THREE, d.width - 0.02, d.height - 0.015));
            root.add(hinge);
            group.add(root);
            state.door = Object.assign(d, { root, hinge, open: false, opening: false, t: 0, boxed: false });
            state.door.box = doorBox(state.door);
            ensureCollider(world);

            // A retried vigil keeps what it already took (world.js takenSpots). If this
            // vigil's key was already found, no second key is hidden and the player comes
            // back holding it: the corridor stays reachable (the door relocks, as always)
            // and the hunt is not run twice. Using the key on the door counts as taking
            // it, so a retry after the door was opened starts with the key in hand too.
            const hadKey = Boolean(world.takenSpots && world.takenSpots[KEY_SPOT]);
            state.held = hadKey;
            const spot = hadKey ? null : placeKey(world, config, state.door);
            if (spot) {
                const mesh = makeKey(THREE);
                // a prize, like a reliquary: its shimmer is 1.6x and breathes (models.js)
                if (NW.Models.markRelicPrize) NW.Models.markRelicPrize(mesh);
                // lengthwise along a narrow surface, like the relics (cathedral.js lay)
                const lie = spot.along === 'x' ? Math.PI / 2 : 0;
                mesh.rotation.y = spot.along
                    ? lie + ((Math.random() - 0.5) * 0.5) + (Math.random() < 0.5 ? Math.PI : 0)
                    : Math.random() * Math.PI * 2;
                mesh.position.set(spot.x, spot.y + mesh.userData.rest, spot.z);
                group.add(mesh);
                state.key = { mesh, x: spot.x, y: spot.y, z: spot.z, kind: spot.kind, taken: false };
            }
        }
        syncInventory(null);
    }

    // ------------------------------------------------------------ play

    function inCandleLight(world, config, x, z) {
        return (world.candles || []).some((candle) => candle.lit && Math.hypot(candle.x - x, candle.z - z) < config.candlePoolRadius);
    }

    // The key, taken like a relic: close across the floor, not above the arms' reach, near
    // the crosshair (world.js aimAngle).
    function keyTarget(world, config, aimAngle) {
        const key = state.key;
        const p = world.player;
        if (!key || key.taken || !p) return null;
        if (Math.hypot(key.x - p.x, key.z - p.z) > config.relicPickRange || key.y - p.y > config.relicReachUp) return null;
        const aim = aimAngle(key.x, key.mesh.position.y, key.z);
        if (aim.angle > Math.max(config.relicAimAngle, Math.atan2(0.3, aim.distance))) return null;
        return { type: 'key', distance: aim.distance };
    }

    // The closed door, when the player has arrived at it: in front of it, close, and
    // looking at it (the eyes' ray meets the leaf).
    function doorTarget(world) {
        const door = state.door;
        const p = world.player;
        if (!door || door.open || door.opening || !p || !world.camera) return null;
        const dx = p.x - door.x;
        const dz = p.z - door.z;
        const front = (dx * door.nx) + (dz * door.nz);
        if (front < 0 || front > DOOR.standoff || Math.abs((dx * door.ax) + (dz * door.az)) > (door.width / 2) + 0.9) return null;
        const eye = world.camera.position;
        const f = world.camera.getWorldDirection(cache.dir || (cache.dir = new (T().Vector3)()));
        const toward = (f.x * door.nx) + (f.z * door.nz);
        if (toward > -0.1) return null;
        const t = (((door.x - eye.x) * door.nx) + ((door.z - eye.z) * door.nz)) / toward;
        if (!(t > 0) || t > DOOR.reach) return null;
        const hx = eye.x + (f.x * t) - door.x;
        const hz = eye.z + (f.z * t) - door.z;
        const u = (hx * door.ax) + (hz * door.az);
        const v = eye.y + (f.y * t) - door.y;
        if (Math.abs(u) > (door.width / 2) + 0.15 || v < -0.15 || v > door.height + 0.25) return null;
        return { type: 'door', hasKey: state.held, distance: t };
    }

    // E / left click on the key or the door (world.js onActionPressed). `sfx`: world.js
    // playSfx. Returns whether it was for this module.
    function act(world, target, sfx) {
        if (!target) return false;
        if (target.type === 'key') {
            const key = state.key;
            if (!key || key.taken) return true;
            key.taken = true;
            key.mesh.visible = false;
            state.held = true;
            // found: a retry of this vigil hands it straight back (build)
            if (typeof world.markSpot === 'function') world.markSpot(KEY_SPOT);
            syncInventory('is-pop');
            if (sfx) sfx('click-audio', 0.35);
            return true;
        }
        if (target.type !== 'door') return false;
        const door = state.door;
        if (!door || door.open || door.opening) return true;
        if (!state.held) {
            // locked: the hint gives a shake
            const hint = document.getElementById('world-hint');
            if (hint) {
                hint.classList.remove('is-denied');
                void hint.offsetWidth;
                hint.classList.add('is-denied');
            }
            return true;
        }
        // the key turns, is used up, and the door swings open
        state.held = false;
        syncInventory('is-used');
        door.opening = true;
        door.t = 0;
        if (sfx) sfx('click-audio', 0.6);
        return true;
    }

    // Every playable frame (world.js update): the collider kept while closed, the swing
    // (eased, heavy at both ends) and, once it is done, the doorway free for good; the
    // key's glint and its colours.
    function update(world, config, dt) {
        const door = state.door;
        if (door) {
            ensureCollider(world);
            holdBack(world, config);
            if (door.opening) {
                door.t = Math.min(1, door.t + (dt / DOOR.openSeconds));
                const k = door.t < 0.5 ? 4 * door.t * door.t * door.t : 1 - ((((-2 * door.t) + 2) ** 3) / 2);
                door.hinge.rotation.y = DOOR.openAngle * k;
                if (door.t >= 1) {
                    door.opening = false;
                    door.open = true;
                    dropCollider(world);          // the doorway is free for good...
                    door.box = leafBox(door);     // ...and the folded leaf is solid
                    ensureCollider(world);
                    world.sideDoorOpen = true;
                }
            }
        }
        const key = state.key;
        if (key && !key.taken) {
            const revealed = Boolean(world.target && world.target.type === 'key');
            NW.Models.setRelicLit(key.mesh, revealed || inCandleLight(world, config, key.x, key.z));
            // The relics' distance shimmer (world.js updateLights), but reaching half as
            // far again: the key is the one pickup worth crossing the nave for, and a
            // player who cannot see that there is one just loses the corridor to luck.
            // It still eases off at arm's length, where the crosshair glow takes over.
            const p = world.player;
            const away = p ? Math.hypot(key.x - p.x, key.z - p.z) : Infinity;
            const arm = config.relicPickRange;
            const close = 0.35 + (0.65 * Math.max(0, Math.min(1, (away - arm) / (arm * 1.5))));
            const far = config.relicSightRange * KEY.sight;
            const sight = close * Math.max(0, Math.min(1, (far - away) / Math.max(0.001, config.relicSightFade)));
            NW.Models.animateRelic(key.mesh, dt, revealed, sight, config.relicSightOpacity);
        }
    }

    // The slot at the bottom of the HUD: nothing to see until the key is taken, so it is shown
    // only while the key is held (`has-key` is what makes it visible at all) and `is-used`
    // empties it out again. `effect`: 'is-pop' (taken), 'is-used' (the door opened), null (a new
    // level: hidden, neither), undefined (leave them).
    function syncInventory(effect) {
        const box = document.getElementById('world-inventory');
        if (!box) return;
        box.classList.toggle('has-key', state.held);
        if (effect === undefined) return;
        box.classList.remove('is-pop', 'is-used');
        if (!effect) return;
        void box.offsetWidth;
        box.classList.add(effect);
    }

    // Tests: the door and the key as plain data.
    function info() {
        const door = state.door;
        const key = state.key;
        return {
            door: door ? {
                x: door.x, y: door.y, z: door.z, nx: door.nx, nz: door.nz, width: door.width, height: door.height,
                open: door.open, opening: door.opening, angle: door.hinge.rotation.y,
                boxed: door.boxed, box: { x: door.box.x, z: door.box.z, a: door.box.a, hu: door.box.hu, hv: door.box.hv }
            } : null,
            key: key ? { x: key.x, y: key.y, z: key.z, kind: key.kind, taken: key.taken } : null,
            held: state.held
        };
    }

    NW.Door = { build, update, keyTarget, doorTarget, act, info, DOOR, KEY };
})();
