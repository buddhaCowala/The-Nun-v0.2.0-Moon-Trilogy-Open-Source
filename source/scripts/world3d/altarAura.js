/**
 * The Nun 3D — the altar's aura: where the altar will take the player.
 *
 * checkAltar() (world.js) opens the altar the moment the player's centre comes within
 * CONFIG.altarReach metres of the altar point, across the floor (no height test). This
 * draws exactly that circle, in cold blue (Jane's aura is crimson): a veil of rising
 * wisps standing on it and a glowing line on the floor at its edge, laid over the real
 * ground (the lower centre lane, the dais steps). Crossing the line is reaching the altar.
 *
 *   - Two additive meshes, no light: built with the level so prewarm() has drawn them,
 *     their geometry freed with it (world.js disposeLevel). The materials and the texture
 *     are made once and shared by every vigil.
 *   - Both test depth and never write it: stone in front hides them, and the throne
 *     inside the circle is only tinted, never covered.
 *   - The wisps rise and turn slowly. The texture repeats both ways, so both axes may
 *     scroll; the veil's fade to nothing at the top is in its vertex colours.
 *   - It glows up as the player comes near, and its veil steps back at the last metres
 *     so it does not wash over his view; the floor line stays bright. It shows in the
 *     tutorial too, while the altar there is still locked.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // Additive, so the colour is also the brightness (Shaun: a touch softer than the
    // first cut, the veil by 30%, the line by 15%, same hue).
    const VEIL_COLOR = [0.028, 0.14, 0.5];
    const LINE_COLOR = [0.085, 0.32, 0.85];
    const SEGMENTS = 160;         // round the circle (9 cm apart at 2.4 m)
    const TILE = 1.6;             // metres of wisps per texture tile, round and up
    // The veil's rows: height above the floor at its foot (metres; below 0 it meets the
    // centre lane, 0.2 m lower than the aisles) and brightness.
    const VEIL_ROWS = [[-0.25, 1], [0, 1], [0.3, 0.72], [0.7, 0.42], [1.2, 0.2], [1.8, 0.07], [2.4, 0]];
    // The floor line across the ring: metres from the edge (+ outside) and brightness.
    // Sharp outside, so the line is where the reach ends; a soft glow inside it.
    const LINE_ROWS = [[0.05, 0], [0, 1], [-0.06, 0.5], [-0.3, 0.1], [-0.7, 0]];
    const LIFT = 0.025;           // the line above the floor
    const SPREAD = 0.06;          // the line rides the highest floor this near (the lane's lip)
    const NEAR = 14;              // metres beyond the edge over which it glows up
    const STEP_BACK = 2;          // metres from the edge over which the veil dims

    const state = { group: null, x: 0, z: 0, reach: 0, time: 0, glow: 0 };
    const shared = { texture: null, veilMaterial: null, lineMaterial: null };

    // Wisps rising from their bright feet, tiling both ways, with soft holes.
    function wispTexture() {
        const THREEjs = window.THREE;
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // drawn at each wrapped copy that touches the tile, so it has no seams
        const wrapped = (x, y, w, h, paint) => {
            [-size, 0, size].forEach((ox) => [-size, 0, size].forEach((oy) => {
                if (x + ox + w < 0 || x + ox > size || y + oy + h < 0 || y + oy > size) return;
                paint(x + ox, y + oy);
            }));
        };
        ctx.fillStyle = 'rgba(255,255,255,0.2)';   // an even sheen under the wisps
        ctx.fillRect(0, 0, size, size);
        ctx.filter = 'blur(2px)';
        for (let i = 0; i < 80; i += 1) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = 5 + (Math.random() * 20);
            const h = size * (0.25 + (Math.random() * 0.6));
            const alpha = 0.25 + (Math.random() * 0.5);
            wrapped(x, y, w, h, (px, py) => {
                const wisp = ctx.createLinearGradient(0, py + h, 0, py);
                wisp.addColorStop(0, `rgba(255,255,255,${alpha})`);
                wisp.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = wisp;
                ctx.fillRect(px, py, w, h);
            });
        }
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 45; i += 1) {
            const r = 8 + (Math.random() * 30);
            const strength = 0.3 + (Math.random() * 0.45);
            wrapped(Math.random() * size - r, Math.random() * size - r, r * 2, r * 2, (px, py) => {
                const hole = ctx.createRadialGradient(px + r, py + r, 0, px + r, py + r, r);
                hole.addColorStop(0, `rgba(0,0,0,${strength})`);
                hole.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = hole;
                ctx.fillRect(px, py, r * 2, r * 2);
            });
        }
        const texture = new THREEjs.CanvasTexture(canvas);
        texture.encoding = THREEjs.sRGBEncoding;
        texture.wrapS = THREEjs.RepeatWrapping;
        texture.wrapT = THREEjs.RepeatWrapping;
        return texture;
    }

    // Front-sided: r147 draws a transparent DoubleSide mesh twice a frame and rebuilds its
    // program key both times; band() gives every face both windings instead.
    function materials() {
        if (shared.veilMaterial) return shared;
        const THREEjs = window.THREE;
        const glow = (map) => new THREEjs.MeshBasicMaterial({
            map,
            color: 0x000000,
            vertexColors: true,
            transparent: true,
            blending: THREEjs.AdditiveBlending,
            depthWrite: false,
            fog: false
        });
        shared.texture = wispTexture();
        shared.veilMaterial = glow(shared.texture);
        shared.lineMaterial = glow(null);
        return shared;
    }

    // The floor under a point of the circle; in stone (a pillar's foot, the wall behind
    // the throne), the floor of the nearest standable point toward the altar.
    function groundAt(world, x, z) {
        const ground = NW.Parkour ? NW.Parkour.groundAt(world, x, z) : 0;
        return ground === undefined ? null : ground;
    }

    function floorAt(world, dx, dz, r) {
        for (let back = 0; back <= r; back += 0.15) {
            const ground = groundAt(world, state.x + (dx * (r - back)), state.z + (dz * (r - back)));
            if (ground !== null) return ground;
        }
        return 0;
    }

    // The line's height and brightness at a point: on the highest floor within SPREAD,
    // so a step or the lane's lip never buries it; dark where the point is in stone.
    function lineAt(world, dx, dz, r, light) {
        const x = state.x + (dx * r);
        const z = state.z + (dz * r);
        const inStone = groundAt(world, x, z) === null;
        let top = -Infinity;
        [[0, 0], [SPREAD, 0], [-SPREAD, 0], [0, SPREAD], [0, -SPREAD]].forEach(([out, side]) => {
            const ground = groundAt(world, x + (dx * out) + (dz * side), z + (dz * out) - (dx * side));
            if (ground !== null && ground > top) top = ground;
        });
        return [r, (Number.isFinite(top) ? top : floorAt(world, dx, dz, r)) + LIFT, inStone ? 0 : light, 0];
    }

    // A band round the circle: rows of [radius, height, brightness, v] per angle. Every
    // face is laid both ways round, so it shows from inside and out in one draw.
    function band(rows, laid) {
        const THREEjs = window.THREE;
        const columns = SEGMENTS + 1;
        const count = columns * rows.length;
        const position = new Float32Array(count * 3);
        const color = new Float32Array(count * 3);
        const uv = new Float32Array(count * 2);
        const around = Math.max(1, Math.round((2 * Math.PI * state.reach) / TILE));
        for (let i = 0; i < columns; i += 1) {
            const angle = (i / SEGMENTS) * Math.PI * 2;
            const dx = Math.sin(angle);
            const dz = Math.cos(angle);
            rows.forEach((row, j) => {
                const [r, y, light, v] = laid(row, dx, dz);
                const k = (i * rows.length) + j;
                position.set([dx * r, y, dz * r], k * 3);
                color.set([light, light, light], k * 3);
                uv.set([(i / SEGMENTS) * around, v], k * 2);
            });
        }
        const index = [];
        for (let i = 0; i < SEGMENTS; i += 1) {
            for (let j = 0; j < rows.length - 1; j += 1) {
                const a = (i * rows.length) + j;
                const b = a + rows.length;
                index.push(a, b, a + 1, b, b + 1, a + 1, a, a + 1, b, b, a + 1, b + 1);
            }
        }
        const geometry = new THREEjs.BufferGeometry();
        geometry.setAttribute('position', new THREEjs.BufferAttribute(position, 3));
        geometry.setAttribute('color', new THREEjs.BufferAttribute(color, 3));
        geometry.setAttribute('uv', new THREEjs.BufferAttribute(uv, 2));
        geometry.setIndex(index);
        geometry.computeBoundingSphere();
        return geometry;
    }

    /**
     * Stand the aura on the altar's reach for a new level: world.altar and the level's
     * floor (parkour.js) must be set. Added to the level's group, so it is drawn by
     * prewarm() and thrown away with the level.
     */
    function build(group, world, config) {
        const THREEjs = window.THREE;
        if (!world.altar) return null;
        const { veilMaterial, lineMaterial } = materials();
        state.x = world.altar.x;
        state.z = world.altar.z;
        state.reach = config.altarReach;
        const reach = state.reach;

        const veil = new THREEjs.Mesh(band(VEIL_ROWS, ([height, light], dx, dz) => {
            const foot = floorAt(world, dx, dz, reach);
            return [reach, foot + height, light, (height - VEIL_ROWS[0][0]) / TILE];
        }), veilMaterial);
        const line = new THREEjs.Mesh(band(LINE_ROWS, ([offset, light], dx, dz) => lineAt(world, dx, dz, reach + offset, light)), lineMaterial);

        const aura = new THREEjs.Group();
        aura.name = 'altar-aura';
        aura.position.set(state.x, 0, state.z);
        [veil, line].forEach((mesh) => {
            mesh.renderOrder = 3;
            aura.add(mesh);
        });
        group.add(aura);
        state.group = aura;
        state.time = 0;
        update(world, config, 0);
        return aura;
    }

    function tint(material, rgb, light) {
        material.color.setRGB(rgb[0] * light, rgb[1] * light, rgb[2] * light);
    }

    // Once a frame from world.js: drift, breathe, and glow up as the player comes near.
    function update(world, config, dt) {
        const p = world.player;
        if (!state.group || !state.group.parent) return;
        state.time += dt;
        const texture = shared.texture;
        texture.offset.x = (state.time * 0.015) % 1;     // turning round the altar
        texture.offset.y = -((state.time * 0.07) % 1);   // rising

        const distance = p ? Math.hypot(p.x - state.x, p.z - state.z) - state.reach : NEAR;
        const near = Math.max(0, Math.min(1, 1 - (distance / NEAR)));
        const back = Math.max(0, Math.min(1, distance / STEP_BACK));
        const breathe = 0.86 + (Math.sin(state.time * 1.8) * 0.14);
        state.glow = breathe * (0.6 + (near * 0.4));
        tint(shared.veilMaterial, VEIL_COLOR, state.glow * (0.35 + (back * 0.65)));
        tint(shared.lineMaterial, LINE_COLOR, 0.2 + (state.glow * 0.8));
    }

    NW.AltarAura = {
        build,
        update,
        state
    };
})();
