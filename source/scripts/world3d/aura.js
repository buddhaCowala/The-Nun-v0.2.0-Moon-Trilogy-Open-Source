/**
 * The Nun 3D — Jane's aura: the wall she walks in front of.
 *
 * Jane walks from her portal to the altar, and her aura is a wall across the whole
 * cathedral, from one side wall to the other, a step behind her. Nobody gets behind
 * it: the room left between it and the altar shrinks as she walks, and Jane herself is
 * always in that room, in front of her veil.
 *
 *   - It only ever moves toward the altar. It pushes the player ahead of it (through
 *     parkour.js, so never into stone).
 *   - Held against it for CONFIG.wallGrasp seconds — walking into it, or standing in its
 *     way — the player is taken; three times faster when pinned with nowhere to go.
 *   - Jane is solid and part of her aura: within CONFIG.nunCatchDistance of her counts
 *     as a touch like the wall's (brushing past her is survivable, staying in her way
 *     for wallGrasp is not), and she shoulders the player aside instead of walking
 *     through him.
 *   - It is a veil of rising crimson wisps and a haze on the floor at its foot: two
 *     additive meshes, no lights, built with the level so prewarm() has drawn them.
 *     Both test depth and never write it, and Jane is all opaque, so the veil behind
 *     her never draws over her.
 *
 * The cathedral's nave runs along z with the altar at its low end, so the wall is the
 * plane z = Jane's z + CONFIG.wallTrail (behind her, clear of her trailing heel), and
 * the player's centre is kept CONFIG.radius on the altar side of it. The built-in tile
 * levels have no straight nave: they get no wall, and there Jane only takes whoever
 * she walks into (world.js).
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // Deep crimson (additive, so the colour is also its brightness): readable from the
    // far end of the dark nave, brighter as the player comes near, flaring at a touch.
    const VEIL_COLOR = [0.5, 0.012, 0.05];
    const FLOOR_COLOR = [0.55, 0.014, 0.045];
    const VEIL_HEIGHT = 3.6;
    const VEIL_SINK = 0.3;       // below the aisle floor, to meet the lower centre lane
    const FLOOR_DEPTH = 1.6;     // the haze reaches this far in front of the veil
    const FLOOR_SEGMENTS = 3;    // across its depth
    const FLOOR_STEP = 0.5;      // metres between the haze's vertices along the wall
    const JANE_BODY = 0.3;       // her half-width (widest bone measured 0.27 m off centre)

    const state = {
        group: null,
        veil: null,
        floor: null,
        floorAt: null,   // local x, z of each haze vertex
        laidZ: NaN,
        x0: 0,
        x1: 0,
        z: Infinity,     // where the wall stands (world z)
        level: 0,        // 0..1 fade in once she is out
        grasp: 0,        // 0..1, taken at 1
        touch: 0,        // the flare of a touch
        drift: 0,
        vignette: null,
        vignetteShown: -1
    };

    const shared = { veilMaterial: null, floorMaterial: null };

    function makeCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    // Rising wisps, dense at the floor and gone well above head height.
    function veilTexture() {
        const width = 512;
        const height = 256;
        const canvas = makeCanvas(width, height);
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < 150; i += 1) {
            const x = Math.random() * width;
            const w = 3 + (Math.random() * 16);
            const top = height * (0.05 + (Math.random() * 0.7));
            const wisp = ctx.createLinearGradient(0, height, 0, top);
            const alpha = 0.2 + (Math.random() * 0.5);
            wisp.addColorStop(0, `rgba(255,255,255,${alpha})`);
            wisp.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = wisp;
            ctx.fillRect(x, top, w, height - top);
            if (x + w > width) ctx.fillRect(x - width, top, w, height - top);
        }
        const fade = ctx.createLinearGradient(0, height, 0, 0);
        fade.addColorStop(0, 'rgba(255,255,255,0.55)');
        fade.addColorStop(0.3, 'rgba(255,255,255,0.18)');
        fade.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, width, height);
        // soft holes, so it is smoke and not a drape of even folds
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 90; i += 1) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const r = 8 + (Math.random() * 38);
            const hole = ctx.createRadialGradient(x, y, 0, x, y, r);
            hole.addColorStop(0, `rgba(0,0,0,${0.35 + (Math.random() * 0.45)})`);
            hole.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = hole;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const texture = new window.THREE.CanvasTexture(canvas);
        texture.encoding = window.THREE.sRGBEncoding;
        texture.wrapS = window.THREE.RepeatWrapping;
        return texture;
    }

    // The haze on the floor: strong along the veil, gone a step and a half in front.
    function floorTexture() {
        const width = 256;
        const height = 64;
        const canvas = makeCanvas(width, height);
        const ctx = canvas.getContext('2d');
        // canvas bottom = the veil's side (v = 0 after the plane is laid down)
        const glow = ctx.createLinearGradient(0, height, 0, 0);
        glow.addColorStop(0, 'rgba(255,255,255,0.95)');
        glow.addColorStop(0.35, 'rgba(255,255,255,0.35)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
        // darker veins, so it is smoke and not a clean band
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 40; i += 1) {
            ctx.fillStyle = `rgba(0,0,0,${0.15 + (Math.random() * 0.35)})`;
            ctx.beginPath();
            ctx.ellipse(Math.random() * width, Math.random() * height, 6 + (Math.random() * 22), 2 + (Math.random() * 6), 0, 0, Math.PI * 2);
            ctx.fill();
        }
        const texture = new window.THREE.CanvasTexture(canvas);
        texture.encoding = window.THREE.sRGBEncoding;
        texture.wrapS = window.THREE.RepeatWrapping;
        return texture;
    }

    function materials() {
        if (shared.veilMaterial) return shared;
        const THREEjs = window.THREE;
        const glow = (map) => new THREEjs.MeshBasicMaterial({
            map,
            color: 0x000000,
            transparent: true,
            blending: THREEjs.AdditiveBlending,
            depthWrite: false,
            fog: false
        });
        shared.veilMaterial = glow(veilTexture());
        shared.floorMaterial = glow(floorTexture());
        return shared;
    }

    /**
     * Raise the wall for a new vigil: across [x0, x1] (world metres, the nave's full
     * width), hidden until Jane steps out. Added to the level's group, so it is drawn
     * by prewarm() and thrown away with the level.
     */
    function build(group, x0, x1) {
        const THREEjs = window.THREE;
        const { veilMaterial, floorMaterial } = materials();
        const width = Math.max(1, x1 - x0);
        const wall = new THREEjs.Group();
        wall.name = 'jane-wall';

        // the veil faces the altar (the player is always on that side)
        const veil = new THREEjs.Mesh(new THREEjs.PlaneGeometry(width, VEIL_HEIGHT + VEIL_SINK).rotateY(Math.PI), veilMaterial);
        veil.position.set(x0 + (width / 2), (VEIL_HEIGHT - VEIL_SINK) / 2, 0);
        veilMaterial.map.repeat.set(width / 3.2, 1);

        const columns = Math.max(2, Math.round(width / FLOOR_STEP));
        const floorGeometry = new THREEjs.PlaneGeometry(width, FLOOR_DEPTH, columns, FLOOR_SEGMENTS).rotateX(-Math.PI / 2);
        floorGeometry.translate(x0 + (width / 2), 0, -FLOOR_DEPTH / 2);
        const positions = floorGeometry.attributes.position;
        state.floorAt = new Float32Array(positions.count * 2);
        for (let i = 0; i < positions.count; i += 1) {
            state.floorAt[i * 2] = positions.getX(i);
            state.floorAt[(i * 2) + 1] = positions.getZ(i);
        }
        const floor = new THREEjs.Mesh(floorGeometry, floorMaterial);
        floorMaterial.map.repeat.set(width / 4, 1);

        [veil, floor].forEach((mesh) => {
            mesh.renderOrder = 3;
            mesh.frustumCulled = false;
            wall.add(mesh);
        });
        wall.visible = false;
        group.add(wall);

        state.group = wall;
        state.veil = veil;
        state.floor = floor;
        state.x0 = x0;
        state.x1 = x1;
        reset();
        return wall;
    }

    function ensureVignette() {
        if (state.vignette) return state.vignette;
        const host = document.getElementById('world-3d');
        if (!host) return null;
        const element = document.createElement('div');
        element.className = 'world-aura-vignette';
        element.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;will-change:opacity;'
            + 'background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 35%,rgba(46,0,8,0.6) 72%,rgba(8,0,2,0.96) 100%);';
        host.appendChild(element);
        state.vignette = element;
        return element;
    }

    function showVignette(amount) {
        const element = ensureVignette();
        const value = Math.round(Math.max(0, Math.min(1, amount)) * 50) / 50;
        if (!element || value === state.vignetteShown) return;
        state.vignetteShown = value;
        element.style.opacity = String(value);
    }

    // Lay the haze on the floor under it: the centre lane is lower than the aisles and
    // the plinths higher; under a pew or in stone it stays at floor level, hidden.
    function layFloor(world) {
        state.laidZ = state.z;
        const positions = state.floor.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) {
            const ground = NW.Parkour.groundAt(world, state.floorAt[i * 2], state.z + state.floorAt[(i * 2) + 1]);
            positions.setY(i, (ground !== null && ground <= 0.25 ? ground : 0) + 0.03);
        }
        positions.needsUpdate = true;
    }

    // Where the wall stands this vigil (Infinity before Jane is out).
    function wallZ() {
        return state.z;
    }

    // Metres the player can still give before something takes hold of him: the wall's
    // edge, or Jane's reach, whichever is nearer (the HUD's gauge). Infinity before
    // she is out.
    function gap(world, config) {
        const nun = world.nun;
        const p = world.player;
        if (!Number.isFinite(state.z) || !nun || !p) return Infinity;
        const toWall = state.z - config.radius - p.z;
        const toJane = Math.hypot(p.x - nun.x, p.z - nun.z) - config.nunCatchDistance;
        return Math.max(0, Math.min(toWall, toJane));
    }

    // She does not walk through him: out of her body, radially (parkour.js, so never
    // into stone). Returns 'clear', 'touch', or 'pinned' (he had nowhere to go).
    function shoulder(world, config) {
        const nun = world.nun;
        const p = world.player;
        const dx = p.x - nun.x;
        const dz = p.z - nun.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= config.nunCatchDistance) return 'clear';
        const room = config.radius + JANE_BODY;
        if (distance >= room || (p.climb && p.climb.active)) return 'touch';
        // dead centre: out toward the altar, the way she is going
        const ux = distance > 1e-4 ? dx / distance : 0;
        const uz = distance > 1e-4 ? dz / distance : -1;
        const need = room - distance;
        const moved = NW.Parkour.moveBy(world, ux * need, uz * need);
        world.auraShoved = world.auraShoved || moved > 0;
        return moved < need * 0.5 ? 'pinned' : 'touch';
    }

    // Once a frame from world.js, after Jane moved. True when she has the player.
    function update(world, config, dt) {
        const nun = world.nun;
        const p = world.player;
        if (!state.group || !nun || !p) return false;
        const present = (nun.state === 'hunting' || nun.state === 'emerging') && nun.mesh.visible;
        if (!present) {
            state.group.visible = false;
            state.grasp = 0;
            showVignette(0);
            return false;
        }
        state.level += (1 - state.level) * (1 - Math.exp(-1.5 * dt));
        // it trails her and never gives ground back
        state.z = Math.min(state.z, nun.z + config.wallTrail);
        const edge = state.z - config.radius;

        // Jane first, then the wall, so whatever she shoulders him into, he ends the
        // frame on the altar side of the wall.
        const body = shoulder(world, config);
        let contact = body !== 'clear';
        let pinned = body === 'pinned';
        const inside = p.z - edge;
        if (inside > 0) {
            contact = true;
            if (!(p.climb && p.climb.active)) {
                const moved = NW.Parkour.moveBy(world, 0, -inside);
                pinned = pinned || moved < inside * 0.5;
                world.auraShoved = world.auraShoved || moved > 0;
            }
        }
        const rate = dt / Math.max(0.05, config.wallGrasp);
        state.grasp = contact
            ? state.grasp + (rate * (pinned ? 3 : 1))
            : Math.max(0, state.grasp - (rate * 0.8));
        state.touch = contact ? 1 : Math.max(0, state.touch - (dt * 3));

        paint(world, config, dt, gap(world, config));
        if (state.grasp >= 1) {
            state.grasp = 0;
            showVignette(0);
            return true;
        }
        return false;
    }

    // Brighter as the player comes near her or the wall, flaring where he touches.
    function paint(world, config, dt, distance) {
        state.group.visible = true;
        state.group.position.z = state.z;
        if (!(Math.abs(state.laidZ - state.z) < 0.04)) layFloor(world);
        state.drift += dt;
        // it drifts sideways only: the texture fades out upward and is clamped there
        state.veil.material.map.offset.x = state.drift * 0.012;
        state.floor.material.map.offset.x = -state.drift * 0.02;

        const closeness = Math.max(0, Math.min(1, 1 - (distance / config.wallDread)));
        const pulse = 0.88 + (Math.sin(state.drift * 1.7) * 0.12);
        const veilLight = state.level * pulse * (0.3 + (closeness * 0.5) + (state.touch * 0.5));
        const floorLight = state.level * pulse * (0.4 + (closeness * 0.4) + (state.touch * 0.3));
        state.veil.material.color.setRGB(VEIL_COLOR[0] * veilLight, VEIL_COLOR[1] * veilLight, VEIL_COLOR[2] * veilLight);
        state.floor.material.color.setRGB(FLOOR_COLOR[0] * floorLight, FLOOR_COLOR[1] * floorLight, FLOOR_COLOR[2] * floorLight);
        showVignette((closeness * closeness * 0.22) + (state.grasp * 0.75));
    }

    // A new vigil, or Jane gone: nothing held over.
    function reset() {
        state.z = Infinity;
        state.laidZ = NaN;
        state.level = 0;
        state.grasp = 0;
        state.touch = 0;
        if (state.group) state.group.visible = false;
        showVignette(0);
    }

    NW.Aura = {
        build,
        update,
        reset,
        wallZ,
        gap,
        state
    };
})();
