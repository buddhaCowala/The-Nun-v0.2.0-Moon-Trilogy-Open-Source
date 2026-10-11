/**
 * The Nun 3D — Jane's portal.
 *
 * In the Nun-walk shots (3Z1, 3ZN1..5) Jane walks out of a ring of stone and rusted
 * metal whose inside is a cloudy, blue-white light. It is Shaun's BlenderKit "Ancient
 * Stone Portal", which stands 20 m behind the open back of the nave in the cathedral
 * set (NO RENDER Zones.blend, scene 'Gothic'), outside everything the cathedral export
 * keeps. tools/blender/export_portal.py exports it as:
 *
 *   assets/world3d/portal.glb   the ring, its wings, its lamps and its plinth, one mesh
 *   assets/world3d/portal.json  where the light disc sits in it, its size, the plinth top
 *
 * The game stands it just behind the back arch, on the nave's axis, so Jane can walk out
 * of it into the last row of the nave. Its light is drawn, not lit: an additive disc of
 * slowly swirling cloud and a blue haze behind the ring, both ignoring the fog so it
 * reads from the far end of the nave. No real light is added (a new light recompiles
 * every material and costs on every pixel), so the stone around it stays dark.
 * The disc is additive and she is solid: while she is inside the ring the light washes
 * her out, and she appears as she crosses it. While she waits it idles; as her grace
 * runs out it swells, and it settles once she is through (world.js updateNun).
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    const MODEL_PATH = 'assets/world3d/portal.glb';
    const INFO_PATH = 'assets/world3d/portal.json';

    // Its origin stands this far behind Jane's start, so the plinth just clears the
    // back arch and the whole ring shows through it.
    const BEHIND_START = 3.9;
    // She appears this far behind the ring's origin, well behind its light (the disc is
    // 0.3 m in front of the origin): a pale shape deep in the glow before she steps out.
    const EMERGE_DEPTH = 1.1;
    // The light starts to swell this long before she steps through (s).
    const PRE_FLARE = 1.8;

    // The look, from the renders: notches and lamps burn blue-white, the disc is
    // brightest at the ring and a deeper blue in its hollow, the air behind is blue.
    const RIM = 0xb8ccff;
    const CORE = 0x3a58c8;
    const HAZE = 0x2a5cff;
    // pulls the emission map's violet-blue (ACES bends a hot blue to violet) back toward
    // the renders' blue-white; above 1 on purpose
    const FRAME_TINT = [0.75, 1.5, 1.1];
    const DISC_IDLE = 0.52;
    const DISC_FLARE = 1.1;
    const HAZE_IDLE = 0.34;
    const HAZE_FLARE = 0.8;
    const FRAME_IDLE = 2.6;
    const FRAME_FLARE = 5;

    // Measured from the .blend by export_portal.py; used until portal.json is read.
    const DEFAULT_INFO = {
        source: { origin: [0.192, -164.826, -8.526] },
        disc: { center: [0, 1.545, -0.295], radius: 2.08 },
        baseTop: -0.205
    };

    const cache = { promise: null, info: null, frame: null, failed: false, parts: null };

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

    function load() {
        if (cache.promise) {
            return cache.promise;
        }
        cache.promise = Promise.all([
            readBinary(INFO_PATH).then((buffer) => JSON.parse(new TextDecoder('utf-8').decode(buffer))),
            readBinary(MODEL_PATH).then((buffer) => new Promise((resolve, reject) => {
                new window.THREE.GLTFLoader().parse(buffer, '', resolve, reject);
            }))
        ]).then(([info, gltf]) => {
            cache.info = info;
            cache.frame = prepareFrame(gltf.scene);
            // A level built before it arrived shows the plain ring: swap the real one in.
            if (cache.parts) attachFrame(cache.parts);
            return cache;
        }).catch((error) => {
            console.warn('[portal] model not loaded, drawing a plain ring:', error);
            cache.failed = true;
            return null;
        });
        return cache.promise;
    }

    // The exported ring: stays dark stone and metal where nothing lights it, its
    // emission map (the notches and the lamps) burns blue-white.
    function prepareFrame(root) {
        root.traverse((object) => {
            if (!object.isMesh) return;
            // kept for every vigil: disposeLevel must leave it alone
            object.userData.sharedGeometry = true;
            const material = object.material;
            // like the cathedral: a fully metallic surface is a black hole in the dark
            material.metalness = Math.min(material.metalness, 0.35);
            material.emissive.setRGB(FRAME_TINT[0], FRAME_TINT[1], FRAME_TINT[2]);
            material.emissiveIntensity = FRAME_IDLE;
            material.fog = false;
            if (material.map) material.map.anisotropy = 4;
            root.userData.material = material;
        });
        return root;
    }

    // ------------------------------------------------------------ drawn light

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

    // Soft cloud that tiles both ways (value noise on wrapping lattices), so the disc can
    // wrap it around the circle and draw it inwards forever without a seam.
    function cloudTexture() {
        const THREEjs = window.THREE;
        const size = 128;
        const random = makeRandom(9023);
        const layers = [4, 8, 16, 32].map((cells, index) => ({
            cells,
            weight: 0.55 ** index,
            lattice: Float32Array.from({ length: cells * cells }, () => random())
        }));
        const smooth = (t) => t * t * (3 - (2 * t));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(size, size);
        const values = new Float32Array(size * size);
        let low = Infinity;
        let high = -Infinity;
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                let value = 0;
                layers.forEach(({ cells, weight, lattice }) => {
                    const fx = (x / size) * cells;
                    const fy = (y / size) * cells;
                    const x0 = Math.floor(fx);
                    const y0 = Math.floor(fy);
                    const tx = smooth(fx - x0);
                    const ty = smooth(fy - y0);
                    const at = (cx, cy) => lattice[((cy % cells) * cells) + (cx % cells)];
                    const top = at(x0, y0) + ((at(x0 + 1, y0) - at(x0, y0)) * tx);
                    const bottom = at(x0, y0 + 1) + ((at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx);
                    value += (top + ((bottom - top) * ty)) * weight;
                });
                values[(y * size) + x] = value;
                low = Math.min(low, value);
                high = Math.max(high, value);
            }
        }
        for (let i = 0; i < values.length; i += 1) {
            const v = Math.round(((values[i] - low) / (high - low)) * 255);
            image.data[i * 4] = v;
            image.data[(i * 4) + 1] = v;
            image.data[(i * 4) + 2] = v;
            image.data[(i * 4) + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
        const texture = new THREEjs.CanvasTexture(canvas);
        texture.wrapS = THREEjs.RepeatWrapping;
        texture.wrapT = THREEjs.RepeatWrapping;
        // the polar lookup jumps at the seam; with mipmaps that jump picks the smallest
        // level and draws a hairline, and the cloud is soft enough not to need them
        texture.generateMipmaps = false;
        texture.minFilter = THREEjs.LinearFilter;
        return texture;
    }

    const DISC_VERTEX = [
        'varying vec2 vUv;',
        'void main() {',
        '    vUv = uv;',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
    ].join('\n');

    // Two layers of cloud wrapped around the centre, twisted into a slow spiral and drawn
    // inwards; every phase is wrapped to 0..1 in JS, so it never loses precision.
    const DISC_FRAGMENT = [
        'uniform sampler2D uCloud;',
        'uniform vec2 uSwirl;',
        'uniform vec2 uFlow;',
        'uniform float uGlow;',
        'uniform vec3 uRim;',
        'uniform vec3 uCore;',
        'varying vec2 vUv;',
        'void main() {',
        '    vec2 p = vUv * 2.0 - 1.0;',
        '    float r = length(p);',
        '    float a = atan(p.y, p.x) * 0.15915494;',
        '    float c1 = texture2D(uCloud, vec2(a + uSwirl.x + r * 0.3, r * 0.8 + uFlow.x)).r;',
        '    float c2 = texture2D(uCloud, vec2(a * 2.0 - uSwirl.y - r * 0.45, r * 1.4 + uFlow.y)).r;',
        '    float cloud = mix(0.5, c1 * 0.6 + c2 * 0.4, smoothstep(0.02, 0.3, r));',
        '    vec3 colour = mix(uCore, uRim, smoothstep(0.1, 0.95, r)) * (0.45 + 0.9 * cloud);',
        '    float edge = 1.0 - smoothstep(0.93, 1.0, r);',
        '    gl_FragColor = vec4(colour * uGlow * edge, 1.0);',
        '    #include <tonemapping_fragment>',
        '    #include <encodings_fragment>',
        '}'
    ].join('\n');

    function makeDisc(info) {
        const THREEjs = window.THREE;
        const material = new THREEjs.ShaderMaterial({
            uniforms: {
                uCloud: { value: cloudTexture() },
                uSwirl: { value: new THREEjs.Vector2() },
                uFlow: { value: new THREEjs.Vector2() },
                uGlow: { value: DISC_IDLE },
                uRim: { value: new THREEjs.Color(RIM) },
                uCore: { value: new THREEjs.Color(CORE) }
            },
            vertexShader: DISC_VERTEX,
            fragmentShader: DISC_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREEjs.AdditiveBlending,
            fog: false
        });
        const disc = new THREEjs.Mesh(new THREEjs.CircleGeometry(info.disc.radius, 64), material);
        disc.position.fromArray(info.disc.center);
        // single-sided, facing the nave (-z): a two-sided transparent draw is two draws
        disc.rotation.y = Math.PI;
        disc.userData.sharedGeometry = true;
        return disc;
    }

    // The blue the portal throws on the air behind it: a flat haze standing behind the
    // ring (so the ring, the plinth and Jane cut dark shapes out of it), its foot at the
    // plinth so nothing glows below the floor.
    function makeHaze(info) {
        const THREEjs = window.THREE;
        const width = 12;
        const height = 9;
        const centreY = info.disc.center[1];
        const foot = info.baseTop - 0.2;
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        const cy = 96 * (1 - ((centreY - foot) / height));
        const gradient = ctx.createRadialGradient(64, cy, 0, 64, cy, 64);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.3, 'rgba(255,255,255,0.7)');
        gradient.addColorStop(0.6, 'rgba(255,255,255,0.25)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 96);
        // fade the foot: the plinth hides it, the pit beside it does not
        const fade = ctx.createLinearGradient(0, 96, 0, 84);
        fade.addColorStop(0, 'rgba(0,0,0,1)');
        fade.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = fade;
        ctx.fillRect(0, 84, 128, 12);
        const texture = new THREEjs.CanvasTexture(canvas);
        texture.encoding = THREEjs.sRGBEncoding;
        const haze = new THREEjs.Mesh(
            new THREEjs.PlaneGeometry(width, height),
            new THREEjs.MeshBasicMaterial({
                map: texture,
                color: HAZE,
                transparent: true,
                opacity: HAZE_IDLE,
                depthWrite: false,
                blending: THREEjs.AdditiveBlending,
                fog: false
            })
        );
        haze.position.set(info.disc.center[0], foot + (height / 2), info.disc.center[2] + 1.6);
        haze.rotation.y = Math.PI;   // facing the nave
        haze.userData.sharedGeometry = true;
        return haze;
    }

    // Without the model: a dark ring with a bright inner rim, the same size.
    function makePlainRing(info) {
        const THREEjs = window.THREE;
        const group = new THREEjs.Group();
        const radius = info.disc.radius;
        const ring = new THREEjs.Mesh(
            new THREEjs.TorusGeometry(radius + 0.4, 0.42, 10, 48),
            new THREEjs.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.55, metalness: 0.3, fog: false })
        );
        const rim = new THREEjs.Mesh(
            new THREEjs.TorusGeometry(radius + 0.02, 0.07, 6, 64),
            new THREEjs.MeshBasicMaterial({ color: RIM, fog: false })
        );
        [ring, rim].forEach((mesh) => {
            mesh.position.fromArray(info.disc.center);
            mesh.userData.sharedGeometry = true;
            group.add(mesh);
        });
        return group;
    }

    function attachFrame(parts) {
        const frame = cache.frame || parts.plain || (parts.plain = makePlainRing(cache.info || DEFAULT_INFO));
        if (parts.current === frame) return;
        if (parts.current) parts.slot.remove(parts.current);
        parts.slot.add(frame);
        parts.current = frame;
        parts.frameMaterial = frame.userData.material || null;
    }

    // One portal, built once and moved into each vigil's level (like the cathedral).
    function sharedParts() {
        if (cache.parts) return cache.parts;
        const THREEjs = window.THREE;
        const info = cache.info || DEFAULT_INFO;
        const root = new THREEjs.Group();
        root.name = 'jane-portal';
        const slot = new THREEjs.Group();
        const disc = makeDisc(info);
        const haze = makeHaze(info);
        root.add(slot, haze, disc);
        cache.parts = { root, slot, disc, haze, current: null, plain: null, frameMaterial: null };
        attachFrame(cache.parts);
        return cache.parts;
    }

    /**
     * Stand the portal behind Jane's start (`spot`, world metres). Returns the portal:
     * `root` (add it to the level), `emerge` (where she appears inside it) and its state.
     */
    function create(spot) {
        const parts = sharedParts();
        const info = cache.info || DEFAULT_INFO;
        // Across the nave it keeps its place in the set: its own axis, the nave's centre.
        const cathedral = NW.Cathedral && NW.Cathedral.get();
        const origin = info.source.origin;
        const x = cathedral && cathedral.transform ? cathedral.transform.toWorld(origin[0], origin[1]).x : spot.x;
        const z = spot.z + BEHIND_START;
        // the plinth's top a centimetre above the nave floor: flush, without z-fighting
        parts.root.position.set(x, 0.01 - info.baseTop, z);
        parts.root.updateMatrixWorld(true);
        const portal = {
            root: parts.root,
            parts,
            emerge: { x, z: z + EMERGE_DEPTH },
            state: { flare: 0, t: 0 }
        };
        update(portal, 0, 0);
        return portal;
    }

    // How ready the portal is for her: 0 while she waits, 1 as she steps through.
    function charge(secondsToStep) {
        const t = Math.max(0, Math.min(1, 1 - (secondsToStep / PRE_FLARE)));
        return t * t * (3 - (2 * t));
    }

    // target: 0 idle .. 1 flaring. Eased: it swells quickly and settles slowly.
    function update(portal, dt, target) {
        const state = portal.state;
        const parts = portal.parts;
        const rate = target > state.flare ? 2.4 : 0.6;
        state.flare += (target - state.flare) * (1 - Math.exp(-dt * rate));
        state.t += dt;
        const flare = state.flare;
        const breath = 1 + (Math.sin(state.t * 1.3) * 0.06) + (Math.sin(state.t * 3.7) * 0.025);

        const uniforms = parts.disc.material.uniforms;
        uniforms.uGlow.value = (DISC_IDLE + ((DISC_FLARE - DISC_IDLE) * flare)) * breath;
        const spin = 0.015 + (0.07 * flare);
        uniforms.uSwirl.value.x = (uniforms.uSwirl.value.x + (dt * spin)) % 1;
        uniforms.uSwirl.value.y = (uniforms.uSwirl.value.y + (dt * spin * 0.7)) % 1;
        uniforms.uFlow.value.x = (uniforms.uFlow.value.x + (dt * (0.025 + (0.09 * flare)))) % 1;
        uniforms.uFlow.value.y = (uniforms.uFlow.value.y + (dt * (0.04 + (0.12 * flare)))) % 1;

        parts.haze.material.opacity = (HAZE_IDLE + ((HAZE_FLARE - HAZE_IDLE) * flare)) * breath;
        if (parts.frameMaterial) {
            parts.frameMaterial.emissiveIntensity = (FRAME_IDLE + ((FRAME_FLARE - FRAME_IDLE) * flare)) * breath;
        }
    }

    NW.Portal = {
        load,
        create,
        charge,
        update,
        isReady() { return Boolean(cache.frame); },
        failed() { return cache.failed; }
    };
})();
