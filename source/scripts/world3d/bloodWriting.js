/**
 * The Nun 3D — blood written on the walls (Shaun: "blood written messages somewhere on
 * the walls. A subtle detail but nice little horror detail").
 *
 * Six short scrawls, hand-written in dried blood, flat on real stone. They are a detail a
 * player *finds*: none is at the spawn or on the centre line down the nave — two on the
 * side-aisle walls, one on the aisle wall beside the altar, three inside the corridor
 * behind the side door (one of them on the dead end, above the reliquary's shelf).
 *
 *  - Drawn, not imported. Each message is a 512x256 canvas texture (`paint`): letters are
 *    polyline strokes (`GLYPHS`) walked with a wobbling round brush, so they come out as
 *    handwriting rather than a font, then smeared sideways, dripped and splattered. No
 *    image, no font, no network — the page runs over file://. Everything is driven by a
 *    seeded PRNG (`rng`), so a message looks the same every run.
 *  - Lit, never emissive: MeshLambertMaterial, so a scrawl is invisible in the dark and
 *    comes up only under the player's night vision or a candle's pool. No light of its
 *    own is added (world.js prewarm: the light count is part of every shader).
 *  - On a real wall. Each entry casts a ray from a point in the open at its own height
 *    against the cathedral model and the corridor's stone, and sits `OFFSET` m off
 *    whatever it hits along that face's normal, facing back down the ray. A miss, a
 *    surface too far away, or a floor/ceiling (a near-horizontal normal) drops the
 *    message rather than leaving it floating or buried.
 *  - Cost: one material and one draw call each, and canvas, texture, material and
 *    geometry are all built once and cached by text (`cache`) — a new vigil re-hangs the
 *    same six objects, so disposeLevel has nothing of ours to free. Geometries are
 *    flagged `sharedGeometry` so it leaves them alone.
 *
 * Built with the level (world.js buildLevel, after corridor.js, before prewarm).
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // How far off the wall a scrawl sits (m). Small enough to read as paint on the stone,
    // large enough that nothing z-fights at the far end of the corridor; the material also
    // carries a polygon offset.
    const OFFSET = 0.022;

    // The texture. 2:1, so a plane `wide` m across is `wide / 2` m tall.
    const TEX = { w: 512, h: 256, margin: 30 };

    // Dried blood: the core of a stroke, its thinned edge, and the almost-black of the
    // deepest smears. Kept dark — under night vision (0.32) a brighter red would glow.
    const INK = { core: [172, 30, 24], thin: [126, 18, 16], deep: [72, 10, 11] };

    // Where each message goes. `from` + `dir` is the ray: cast from a point standing in
    // the open at the message's own height `y` (m), toward the wall. `wide` is the plane's
    // width in metres, `tilt` a few degrees of roll so nothing reads as a printed sign,
    // `far` the furthest the wall is allowed to be.
    //
    // The nave's aisle walls are the re-stoned shell (cathedral.js restoneShells) at
    // x 4.326 and x 19.739; the corridor's (corridor.js) at z 9 and z 11, dead end x 75.
    const MESSAGES = [
        // Left aisle, a third of the way down: the first one a player walking the aisle meets.
        // Right aisle, further back, low and slanted.
        { id: 'aisle-right', text: 'THE LIGHT LIES', from: { x: 17, z: 22.5 }, dir: [1, 0], y: 1.6, wide: 2.25, tilt: -0.055, far: 6 },
        // Beside the altar, on the left aisle wall: found on the last approach.
        { id: 'altar', text: 'FORGIVE ME\nMOTHER', from: { x: 7, z: 6.5 }, dir: [-1, 0], y: 1.66, wide: 1.75, tilt: 0.03, far: 6 },
        // Just inside the corridor, on the near wall, where the first stands are.
        // (x is picked between two of corridor.js's ribs: their pilasters stand 0.14 m
        // proud of both walls, and a scrawl folded round one would read as a sticker.)
        { id: 'corridor-near', text: 'DO NOT LET\nTHE CANDLES DIE', from: { x: 32, z: 9.62 }, dir: [0, -1], y: 1.74, wide: 1.7, tilt: -0.035, far: 2 },
        // Half way in, on the far wall. This one changes with the vigil.
        {
            id: 'corridor-mid', text: 'NOT ALONE', from: { x: 51.7, z: 10.38 }, dir: [0, 1], y: 1.68, wide: 1.6, tilt: 0.05, far: 2,
            byVigil: ['NOT ALONE', 'SHE HEARS', 'WE PRAYED\nSHE ANSWERED', 'NO ONE CAME', 'THE VEIL IS THIN', 'IT IS HER HOUR']
        },
        // The dead end, above the reliquary's shelf (corridor.js PRIZE sits at y 1.22).
        { id: 'corridor-end', text: 'SHE SEES YOU', from: { x: 73.4, z: 10 }, dir: [1, 0], y: 2.16, wide: 1.5, tilt: -0.04, far: 3 }
    ];

    // Letters as polylines in a 0..1 box, y down (canvas order). Upright capitals, drawn
    // the way someone writes with a finger: one or two strokes each, nothing closed.
    const GLYPHS = {
        A: [[[0.02, 1], [0.5, 0.02], [0.97, 1]], [[0.17, 0.63], [0.83, 0.61]]],
        B: [[[0.04, 0], [0.09, 1]], [[0.04, 0], [0.68, 0.08], [0.76, 0.28], [0.58, 0.47], [0.06, 0.5]], [[0.06, 0.5], [0.74, 0.57], [0.82, 0.79], [0.62, 0.98], [0.09, 1]]],
        C: [[[0.96, 0.17], [0.62, 0.01], [0.22, 0.12], [0.03, 0.5], [0.21, 0.89], [0.62, 0.99], [0.96, 0.84]]],
        D: [[[0.04, 0], [0.09, 1]], [[0.04, 0], [0.6, 0.07], [0.9, 0.36], [0.87, 0.69], [0.54, 0.96], [0.09, 1]]],
        E: [[[0.93, 0.03], [0.04, 0.01]], [[0.04, 0.01], [0.09, 1]], [[0.09, 1], [0.92, 0.96]], [[0.06, 0.5], [0.68, 0.47]]],
        F: [[[0.93, 0.04], [0.03, 0.01]], [[0.03, 0.01], [0.09, 1]], [[0.06, 0.48], [0.7, 0.45]]],
        G: [[[0.96, 0.17], [0.62, 0.01], [0.22, 0.12], [0.03, 0.5], [0.21, 0.89], [0.66, 0.99], [0.96, 0.76], [0.95, 0.56], [0.55, 0.54]]],
        H: [[[0.03, 0], [0.08, 1]], [[0.92, 0.02], [0.96, 1]], [[0.05, 0.5], [0.94, 0.47]]],
        I: [[[0.45, 0], [0.55, 1]]],
        J: [[[0.82, 0.01], [0.79, 0.78], [0.59, 0.98], [0.28, 0.94], [0.16, 0.7]]],
        K: [[[0.04, 0], [0.09, 1]], [[0.9, 0.02], [0.08, 0.56]], [[0.22, 0.43], [0.94, 1]]],
        L: [[[0.06, 0], [0.12, 0.95]], [[0.12, 0.95], [0.9, 0.91]]],
        M: [[[0.01, 1], [0.11, 0.01], [0.5, 0.72], [0.87, 0.02], [0.99, 1]]],
        N: [[[0.02, 1], [0.08, 0.01], [0.9, 1], [0.97, 0.03]]],
        O: [[[0.5, 0.02], [0.13, 0.19], [0.03, 0.54], [0.24, 0.92], [0.64, 0.98], [0.94, 0.7], [0.91, 0.26], [0.47, 0.02]]],
        P: [[[0.06, 1], [0.03, 0]], [[0.03, 0], [0.7, 0.06], [0.86, 0.3], [0.62, 0.52], [0.05, 0.55]]],
        Q: [[[0.5, 0.02], [0.13, 0.19], [0.03, 0.54], [0.24, 0.92], [0.64, 0.98], [0.94, 0.7], [0.91, 0.26], [0.47, 0.02]], [[0.62, 0.71], [1, 1.04]]],
        R: [[[0.06, 1], [0.03, 0]], [[0.03, 0], [0.7, 0.06], [0.86, 0.3], [0.62, 0.52], [0.05, 0.55]], [[0.3, 0.55], [0.93, 1]]],
        S: [[[0.93, 0.13], [0.56, 0.01], [0.18, 0.1], [0.11, 0.33], [0.46, 0.48], [0.83, 0.61], [0.86, 0.86], [0.49, 1], [0.09, 0.87]]],
        T: [[[0.02, 0.04], [0.98, 0.01]], [[0.48, 0.02], [0.55, 1]]],
        U: [[[0.03, 0], [0.09, 0.75], [0.4, 0.97], [0.76, 0.93], [0.91, 0.68], [0.94, 0.01]]],
        V: [[[0.02, 0], [0.5, 1], [0.96, 0.01]]],
        W: [[[0.01, 0], [0.22, 1], [0.5, 0.34], [0.78, 1], [0.99, 0.01]]],
        X: [[[0.03, 0], [0.95, 1]], [[0.95, 0.02], [0.05, 1]]],
        Y: [[[0.03, 0], [0.5, 0.52], [0.95, 0.01]], [[0.5, 0.52], [0.54, 1]]],
        Z: [[[0.03, 0.04], [0.93, 0.01]], [[0.93, 0.01], [0.06, 0.96]], [[0.06, 0.96], [0.96, 0.93]]]
    };
    // How far the pen moves on after each letter, in glyph boxes.
    const ADVANCE = { I: 0.62, J: 0.85, L: 0.9, T: 0.92, M: 1.2, W: 1.22, ' ': 0.55 };

    // Built once, kept for the whole session: a new vigil re-hangs the same objects.
    const cache = new Map();
    const state = { placed: [] };

    function T() {
        return window.THREE;
    }

    // ------------------------------------------------------------------ painting

    // mulberry32 off a hash of the text: the same message is scrawled the same way every
    // run, and two different ones never come out identically.
    function rng(text) {
        let h = 0x9e3779b9;
        for (let i = 0; i < text.length; i += 1) {
            h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b);
            h = (h ^ (h >>> 13)) >>> 0;
        }
        return function next() {
            h = (h + 0x6d2b79f5) >>> 0;
            let t = h;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function mix(a, b, k) {
        return Math.round(a + ((b - a) * k));
    }

    function ink(shade, alpha) {
        const from = shade < 0.5 ? INK.deep : INK.thin;
        const to = shade < 0.5 ? INK.thin : INK.core;
        const k = shade < 0.5 ? shade * 2 : (shade - 0.5) * 2;
        return 'rgba(' + mix(from[0], to[0], k) + ',' + mix(from[1], to[1], k) + ',' + mix(from[2], to[2], k) + ',' + alpha.toFixed(3) + ')';
    }

    function advance(ch) {
        return ADVANCE[ch] != null ? ADVANCE[ch] : 1;
    }

    // One polyline walked with a round brush: the blob wanders off the line, swells and
    // thins, and the stroke runs out of blood toward its end.
    function brush(ctx, pts, size, next, wet) {
        const seed = next() * 10;
        // total length, so the taper is by distance rather than by segment
        let total = 0;
        for (let i = 1; i < pts.length; i += 1) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (total <= 0) return null;
        const step = Math.max(0.6, size * 0.16);
        let walked = 0;
        let low = pts[0];
        let wanderX = 0;
        let wanderY = 0;
        for (let i = 1; i < pts.length; i += 1) {
            const a = pts[i - 1];
            const b = pts[i];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const n = Math.max(1, Math.ceil(len / step));
            for (let k = 0; k < n; k += 1) {
                const u = k / n;
                const x = a[0] + ((b[0] - a[0]) * u);
                const y = a[1] + ((b[1] - a[1]) * u);
                const along = (walked + (len * u)) / total;
                wanderX += (next() - 0.5) * size * 0.075;
                wanderY += (next() - 0.5) * size * 0.075;
                wanderX *= 0.88;
                wanderY *= 0.88;
                // thick where the hand pressed at the start, running dry at the end
                const swell = 0.62 + (0.3 * Math.sin((along * 9) + seed)) + (0.22 * (1 - along));
                const r = Math.max(0.45, size * 0.2 * swell);
                const px = x + wanderX;
                const py = y + wanderY;
                if (wet) {
                    ctx.fillStyle = ink(0.2 + (next() * 0.25), 0.05 + (next() * 0.05));
                    ctx.beginPath();
                    ctx.arc(px, py, r * (1.25 + (next() * 0.55)), 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillStyle = ink(0.12 + ((1 - along) * 0.7) + (next() * 0.22), 0.55 + (next() * 0.4));
                    ctx.beginPath();
                    ctx.arc(px, py, r, 0, Math.PI * 2);
                    ctx.fill();
                    if (py > low[1]) low = [px, py];
                }
            }
            walked += len;
        }
        return low;
    }

    // A run of blood down the wall from a point, tapering to a bead.
    function drip(ctx, x, y, size, next) {
        const len = size * (0.25 + (next() * 0.95));
        const w = size * (0.045 + (next() * 0.035));
        const lean = (next() - 0.5) * size * 0.08;
        const n = Math.max(4, Math.round(len / 1.5));
        for (let i = 0; i <= n; i += 1) {
            const u = i / n;
            ctx.fillStyle = ink(0.25 + (0.35 * (1 - u)), 0.75 - (0.35 * u));
            ctx.beginPath();
            ctx.arc(x + (lean * u * u), y + (len * u), Math.max(0.4, w * (1 - (u * 0.75))), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = ink(0.55, 0.85);
        ctx.beginPath();
        ctx.arc(x + lean, y + len, w * 1.15, 0, Math.PI * 2);
        ctx.fill();
    }

    // The whole message on a transparent canvas, laid out line by line and fitted to the
    // margins. Two passes per stroke (a wet halo, then the core) so the edges are soft.
    function paint(text) {
        const canvas = document.createElement('canvas');
        canvas.width = TEX.w;
        canvas.height = TEX.h;
        const ctx = canvas.getContext('2d');
        const next = rng(text);
        const lines = String(text).toUpperCase().split('\n');
        const boxW = TEX.w - (TEX.margin * 2);
        const boxH = TEX.h - (TEX.margin * 2);
        const lineH = boxH / lines.length;
        // the letter box's height: leave room between the lines for the drips
        const glyphH = lineH * (lines.length > 1 ? 0.62 : 0.78);

        lines.forEach((line, row) => {
            let units = 0;
            for (let i = 0; i < line.length; i += 1) units += advance(line[i]) + 0.17;
            if (units <= 0) return;
            // a letter box is as wide as it is tall, unless the line is too long for that
            const glyphW = Math.min(glyphH * 0.82, boxW / units);
            const width = glyphW * units;
            const x0 = TEX.margin + ((boxW - width) / 2) + ((next() - 0.5) * 8);
            const y0 = TEX.margin + (row * lineH) + ((lineH - glyphH) / 2) + ((next() - 0.5) * 5);
            let pen = x0;
            const lows = [];
            for (let i = 0; i < line.length; i += 1) {
                const ch = line[i];
                const strokes = GLYPHS[ch];
                if (strokes) {
                    // every letter sits a little differently: a nudge, a size, a lean
                    const sx = glyphW * (0.9 + (next() * 0.12));
                    const sy = glyphH * (0.9 + (next() * 0.16));
                    const ox = pen + ((next() - 0.5) * glyphW * 0.1);
                    const oy = y0 + ((next() - 0.5) * glyphH * 0.1);
                    const lean = (next() - 0.5) * 0.16;
                    const place = (p) => [ox + (p[0] * sx) + ((0.5 - p[1]) * lean * sx), oy + (p[1] * sy)];
                    const size = Math.min(sx, sy);
                    strokes.forEach((s) => brush(ctx, s.map(place), size, next, true));
                    strokes.forEach((s) => {
                        const low = brush(ctx, s.map(place), size, next, false);
                        if (low) lows.push([low, size]);
                    });
                }
                pen += (advance(ch) + 0.17) * glyphW;
            }
            // a few runs from the bottoms of the strokes, never from every one
            lows.forEach((entry) => {
                if (next() < 0.74) return;
                drip(ctx, entry[0][0], entry[0][1], entry[1], next);
            });
        });

        // the smear: the same hand dragged sideways across what it just wrote
        ctx.globalAlpha = 0.16;
        ctx.drawImage(canvas, 2.5, 1.5);
        ctx.globalAlpha = 0.08;
        ctx.drawImage(canvas, -3, 0.5);
        ctx.globalAlpha = 1;
        // splatter
        for (let i = 0; i < 46; i += 1) {
            const x = TEX.margin + (next() * (TEX.w - (TEX.margin * 2)));
            const y = TEX.margin * 0.5 + (next() * (TEX.h - TEX.margin));
            ctx.fillStyle = ink(0.35 + (next() * 0.5), 0.2 + (next() * 0.5));
            ctx.beginPath();
            ctx.arc(x, y, 0.35 + (next() * 1.5), 0, Math.PI * 2);
            ctx.fill();
        }
        return canvas;
    }

    // Canvas -> texture -> material -> geometry, once per text, kept for the session.
    function assets(text, wide) {
        const THREE = T();
        const key = text + '|' + wide;
        let entry = cache.get(key);
        if (entry) return entry;
        const texture = new THREE.CanvasTexture(paint(text));
        texture.anisotropy = 4;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        if (THREE.sRGBEncoding != null) texture.encoding = THREE.sRGBEncoding;
        // Lit, not emissive: dark stone hides it until a light reaches it.
        const material = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
        });
        const geometry = new THREE.PlaneGeometry(wide, wide * (TEX.h / TEX.w));
        entry = { texture, material, geometry };
        cache.set(key, entry);
        return entry;
    }

    // ------------------------------------------------------------------ placing

    // The meshes a scrawl may land on: the cathedral's own, and the corridor's single
    // stone mesh (corridor.js buildStone). A flat list of plain meshes, not the roots —
    // a recursive cast would also meet the prewarmed glint sprites, whose raycast wants a
    // camera the raycaster has not got, and the corridor's hanging crosses and books.
    function surfaces(group) {
        const meshes = [];
        const take = (object) => {
            if (object.isMesh && !object.isSkinnedMesh && object.geometry && object.material) meshes.push(object);
        };
        const model = NW.Cathedral && NW.Cathedral.get() && NW.Cathedral.get().model;
        if (model) model.traverse(take);
        group.traverse((object) => {
            if (object.name === 'corridor-stone') take(object);
        });
        return meshes;
    }

    // The wall this message's ray meets: its point and the face's normal in world space,
    // or null if there is nothing there, it is too far, or it is not a wall.
    function wallUnder(raycaster, meshes, spec) {
        const THREE = T();
        const dir = new THREE.Vector3(spec.dir[0], 0, spec.dir[1]).normalize();
        raycaster.set(new THREE.Vector3(spec.from.x, spec.y, spec.from.z), dir);
        raycaster.far = spec.far + 0.5;
        let best = null;
        raycaster.intersectObjects(meshes, false).forEach((hit) => {
            if (!hit.face) return;
            if (!best || hit.distance < best.distance) best = hit;
        });
        if (!best || best.distance > spec.far) return null;
        const normal = best.face.normal.clone().transformDirection(best.object.matrixWorld);
        // a floor or a vault is not a wall, and the face must look back down the ray
        if (Math.abs(normal.y) > 0.35) return null;
        if (normal.dot(dir) > 0) normal.negate();
        normal.y = 0;
        if (normal.lengthSq() < 1e-6) return null;
        normal.normalize();
        return { point: best.point, normal };
    }

    function textFor(spec, phase) {
        if (!Array.isArray(spec.byVigil) || !spec.byVigil.length) return spec.text;
        const index = Math.max(0, Math.min(spec.byVigil.length - 1, (Number(phase) || 1) - 1));
        return spec.byVigil[index];
    }

    // ------------------------------------------------------------------ build

    function build(group, world, config) {
        const THREE = T();
        state.placed = [];
        if (!THREE || !group || !world || !world.level || world.level.environment !== 'cathedral') return null;
        const meshes = surfaces(group);
        if (!meshes.length) return null;
        const raycaster = new THREE.Raycaster();
        const root = new THREE.Group();
        root.name = 'blood-writing';
        group.add(root);
        MESSAGES.forEach((spec) => {
            const wall = wallUnder(raycaster, meshes, spec);
            if (!wall) return;
            const text = textFor(spec, world.phase);
            const { geometry, material } = assets(text, spec.wide);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = 'blood-' + spec.id;
            mesh.userData.sharedGeometry = true;   // cached and reused: disposeLevel leaves it
            mesh.position.set(
                wall.point.x + (wall.normal.x * OFFSET),
                spec.y,
                wall.point.z + (wall.normal.z * OFFSET)
            );
            mesh.lookAt(mesh.position.x + wall.normal.x, spec.y, mesh.position.z + wall.normal.z);
            mesh.rotateZ(spec.tilt);
            mesh.renderOrder = 2;
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            root.add(mesh);
            state.placed.push({
                id: spec.id, text,
                x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
                nx: wall.normal.x, nz: wall.normal.z, wide: spec.wide
            });
        });
        return root;
    }

    // Tests: what was hung and where.
    function info() {
        return { count: state.placed.length, of: MESSAGES.length, placed: state.placed.slice() };
    }

    NW.BloodWriting = { build, info, MESSAGES, OFFSET };
})();
