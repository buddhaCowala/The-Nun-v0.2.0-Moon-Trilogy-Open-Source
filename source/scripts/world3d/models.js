/**
 * The Nun 3D — models built from primitives: the Nun, the Demoness, relics,
 * candle stands, the altar and the per-environment props. Static props return
 * "parts" ({ geometry, matrix, materialKey }) so the world can batch them into a
 * few draw calls; living things return animated THREE.Group objects.
 */
(function () {
    'use strict';

    function T() {
        return window.THREE;
    }

    // ------------------------------------------------------------ materials

    const materialCache = new Map();

    function material(key) {
        if (materialCache.has(key)) {
            return materialCache.get(key);
        }

        const THREE = T();
        const Textures = window.NunWorld.Textures;
        let result;

        // A relic no candle reaches wears a dimmed copy of its material (same shader,
        // darker colour), so the player's night vision alone never picks it out (setRelicLit).
        if (key.endsWith('Dim')) {
            result = material(key.slice(0, -3)).clone();
            result.color.multiplyScalar(0.3);
            materialCache.set(key, result);
            return result;
        }

        switch (key) {
            case 'robe':
                result = new THREE.MeshStandardMaterial({ color: 0x0b0a0f, roughness: 0.92, metalness: 0 });
                break;
            case 'linen':
                result = new THREE.MeshStandardMaterial({ color: 0xe3ddd0, roughness: 0.8, emissive: 0x1a1816 });
                break;
            case 'skin':
                result = new THREE.MeshStandardMaterial({ color: 0xe6c8b8, roughness: 0.6, emissive: 0x1c120e });
                break;
            case 'demonSkin':
                result = new THREE.MeshStandardMaterial({ color: 0x8e1418, roughness: 0.45, metalness: 0.05, emissive: 0x2a0306 });
                break;
            case 'horn':
                result = new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.35, metalness: 0.2 });
                break;
            case 'hair':
                result = new THREE.MeshStandardMaterial({ color: 0x080608, roughness: 0.7 });
                break;
            case 'nunEyes':
                result = new THREE.MeshBasicMaterial({ color: 0xcfeaff });
                break;
            case 'demonEyes':
                result = new THREE.MeshBasicMaterial({ color: 0xffc23a });
                break;
            // The relics: old tarnished gold, worn leather, yellowed pages. Nothing
            // glows and nothing mirrors the player's light, so in the dark a relic is just
            // one more dark shape; only candlelight shows it.
            case 'gold':
                result = new THREE.MeshStandardMaterial({ color: 0x6e5428, roughness: 0.62, metalness: 0.3 });
                break;
            case 'leather':
                result = new THREE.MeshStandardMaterial({ color: 0x3a1a14, roughness: 0.8 });
                break;
            case 'pages':
                result = new THREE.MeshStandardMaterial({ color: 0x9a8c6e, roughness: 0.9 });
                break;
            case 'iron':
                result = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.55, metalness: 0.7 });
                break;
            case 'wax':
                // a faint pale mark, so an unlit candle stand can still be found
                result = new THREE.MeshStandardMaterial({ color: 0xefe4c8, roughness: 0.6, emissive: 0x0a0805 });
                break;
            case 'water':
                result = new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.08, metalness: 0.6 });
                break;
            case 'bone':
                result = new THREE.MeshStandardMaterial({ color: 0xcbbb9c, roughness: 0.8 });
                break;
            case 'altarStone':
                result = new THREE.MeshStandardMaterial({ map: Textures.get('palestone', 11), roughness: 0.85 });
                break;
            case 'altarCloth':
                result = new THREE.MeshStandardMaterial({ map: Textures.get('cloth', 5), roughness: 0.9 });
                break;
            case 'wood':
                result = new THREE.MeshStandardMaterial({ map: Textures.get('wood', 3), roughness: 0.75 });
                break;
            case 'velvet':
                // the hiding-spot table's runner: plain worn crimson, no gold cross on
                // it (a cross must only ever mean a relic)
                result = new THREE.MeshStandardMaterial({ color: 0x3c0c12, roughness: 0.95 });
                break;
            case 'stoneProp':
                result = new THREE.MeshStandardMaterial({ map: Textures.get('stone', 21), roughness: 0.9 });
                break;
            case 'books':
                result = new THREE.MeshStandardMaterial({ map: Textures.get('books', 9), roughness: 0.85 });
                break;
            default:
                result = new THREE.MeshStandardMaterial({ color: 0x888888 });
        }

        materialCache.set(key, result);
        return result;
    }

    function mesh(geometry, materialKey) {
        return new (T().Mesh)(geometry, material(materialKey));
    }

    function glowSprite(color, size, opacity) {
        const THREE = T();
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: window.NunWorld.Textures.getGlow(color),
            color: 0xffffff,
            transparent: true,
            opacity: opacity == null ? 1 : opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        }));
        sprite.scale.set(size, size, size);
        return sprite;
    }

    // ------------------------------------------------------------ the Nun

    function makeNun() {
        const THREE = T();
        const root = new THREE.Group();
        const body = new THREE.Group();
        root.add(body);

        const robeProfile = [
            [0.46, 0], [0.44, 0.08], [0.38, 0.5], [0.31, 0.95], [0.25, 1.28],
            [0.22, 1.4], [0.13, 1.47], [0, 1.49]
        ].map(([x, y]) => new THREE.Vector2(x, y));
        const robe = mesh(new THREE.LatheGeometry(robeProfile, 18), 'robe');
        body.add(robe);

        const scapular = mesh(new THREE.BoxGeometry(0.2, 0.52, 0.02), 'linen');
        scapular.position.set(0, 1.1, 0.23);
        scapular.rotation.x = -0.12;
        body.add(scapular);

        const collar = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 16), 'linen');
        collar.position.y = 1.47;
        body.add(collar);

        const head = mesh(new THREE.SphereGeometry(0.115, 18, 14), 'skin');
        head.position.set(0, 1.62, 0.02);
        body.add(head);

        const coif = mesh(new THREE.TorusGeometry(0.118, 0.022, 8, 20), 'linen');
        coif.position.set(0, 1.63, 0.04);
        body.add(coif);

        const veil = mesh(new THREE.CylinderGeometry(0.135, 0.3, 0.72, 16, 1, true, Math.PI * 0.62, Math.PI * 1.76), 'robe');
        veil.material.side = THREE.DoubleSide;
        veil.position.set(0, 1.44, -0.03);
        body.add(veil);

        const hood = mesh(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 'robe');
        hood.position.set(0, 1.64, -0.01);
        body.add(hood);

        const eyeGeometry = new THREE.SphereGeometry(0.014, 8, 6);
        [-0.04, 0.04].forEach((x) => {
            const eye = mesh(eyeGeometry, 'nunEyes');
            eye.position.set(x, 1.635, 0.125);
            body.add(eye);
        });
        const eyeGlow = glowSprite('rgba(180,220,255,0.7)', 0.35, 0.55);
        eyeGlow.position.set(0, 1.635, 0.16);
        body.add(eyeGlow);

        const handGeometry = new THREE.SphereGeometry(0.05, 10, 8);
        [-0.2, 0.2].forEach((x) => {
            const hand = mesh(handGeometry, 'skin');
            hand.position.set(x, 0.98, 0.2);
            body.add(hand);
        });

        root.userData = { body, eyeGlow, t: Math.random() * 10 };
        return root;
    }

    function animateNun(nun, dt, moving) {
        const data = nun.userData;
        data.t += dt;
        // She glides: a slow bob and a sway, faster while she hunts.
        const pace = moving ? 3.2 : 1.1;
        data.body.position.y = Math.sin(data.t * pace) * 0.035;
        data.body.rotation.z = Math.sin(data.t * pace * 0.5) * 0.035;
        data.eyeGlow.material.opacity = 0.45 + (Math.sin(data.t * 2.3) * 0.12);
    }

    // ------------------------------------------------------------ the Demoness

    function limb(from, to, radius, materialKey) {
        const THREE = T();
        const start = new THREE.Vector3(from[0], from[1], from[2]);
        const end = new THREE.Vector3(to[0], to[1], to[2]);
        const length = start.distanceTo(end);
        const piece = mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - (radius * 2)), 4, 8), materialKey);
        piece.position.copy(start).add(end).multiplyScalar(0.5);
        piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
        return piece;
    }

    function makeDemoness() {
        const THREE = T();
        const root = new THREE.Group();
        const body = new THREE.Group();
        root.add(body);

        const torso = limb([0, 0.62, -0.28], [0, 0.72, 0.22], 0.17, 'demonSkin');
        body.add(torso);
        const hips = mesh(new THREE.SphereGeometry(0.2, 14, 10), 'demonSkin');
        hips.position.set(0, 0.6, -0.34);
        body.add(hips);

        const head = new THREE.Group();
        head.position.set(0, 0.86, 0.42);
        body.add(head);
        head.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), 'demonSkin'));
        const hair = mesh(new THREE.ConeGeometry(0.16, 0.55, 12, 1, true), 'hair');
        hair.material.side = THREE.DoubleSide;
        hair.position.set(0, -0.12, -0.14);
        hair.rotation.x = 2.3;
        head.add(hair);
        [-1, 1].forEach((side) => {
            const horn = mesh(new THREE.ConeGeometry(0.035, 0.26, 8), 'horn');
            horn.position.set(0.07 * side, 0.12, -0.02);
            horn.rotation.set(-0.7, 0, -0.45 * side);
            head.add(horn);
            const eye = mesh(new THREE.SphereGeometry(0.018, 8, 6), 'demonEyes');
            eye.position.set(0.045 * side, 0.01, 0.115);
            head.add(eye);
        });
        const eyeGlow = glowSprite('rgba(255,160,40,0.8)', 0.45, 0.7);
        eyeGlow.position.set(0, 0.01, 0.16);
        head.add(eyeGlow);

        const limbs = {
            armL: new THREE.Group(), armR: new THREE.Group(),
            legL: new THREE.Group(), legR: new THREE.Group()
        };
        limbs.armL.position.set(-0.2, 0.72, 0.2);
        limbs.armR.position.set(0.2, 0.72, 0.2);
        limbs.legL.position.set(-0.17, 0.58, -0.36);
        limbs.legR.position.set(0.17, 0.58, -0.36);
        limbs.armL.add(limb([0, 0, 0], [-0.08, -0.7, 0.18], 0.055, 'demonSkin'));
        limbs.armR.add(limb([0, 0, 0], [0.08, -0.7, 0.18], 0.055, 'demonSkin'));
        limbs.legL.add(limb([0, 0, 0], [-0.06, -0.28, 0.32], 0.08, 'demonSkin'));
        limbs.legL.add(limb([-0.06, -0.28, 0.32], [-0.08, -0.56, -0.12], 0.065, 'demonSkin'));
        limbs.legR.add(limb([0, 0, 0], [0.06, -0.28, 0.32], 0.08, 'demonSkin'));
        limbs.legR.add(limb([0.06, -0.28, 0.32], [0.08, -0.56, -0.12], 0.065, 'demonSkin'));
        Object.values(limbs).forEach((group) => body.add(group));

        const tail = limb([0, 0.62, -0.5], [0, 0.95, -1.05], 0.025, 'demonSkin');
        body.add(tail);

        root.userData = { body, head, limbs, eyeGlow, t: 0 };
        return root;
    }

    function animateDemoness(demon, dt, speed) {
        const data = demon.userData;
        data.t += dt * (0.8 + speed);
        const swing = Math.sin(data.t * 6) * 0.45 * Math.min(1, speed);
        data.limbs.armL.rotation.x = swing;
        data.limbs.legR.rotation.x = swing * 0.8;
        data.limbs.armR.rotation.x = -swing;
        data.limbs.legL.rotation.x = -swing * 0.8;
        data.body.position.y = Math.abs(Math.sin(data.t * 6)) * 0.05 * Math.min(1, speed);
        data.head.rotation.z = Math.sin(data.t * 1.7) * 0.15;
        data.eyeGlow.material.opacity = 0.55 + (Math.sin(data.t * 3.1) * 0.2);
    }

    // ------------------------------------------------------------ rendered girls
    //
    // The Nun and the Demoness are Shaun's own renders: walking frames cut out of
    // the look-back clip (3ZN5[V n]) and the zone clip (3CZ1F), packed into sheets
    // in assets/world3d/ (12 frames, 256x512 each). A sprite always faces the
    // camera, which suits two women who are always coming for you. If a sheet
    // fails to load, the primitive model underneath is shown instead.

    const SHEET_FRAMES = 12;
    const sheetCache = new Map();

    function loadSheet(path, onReady, onError) {
        const THREE = T();
        if (sheetCache.has(path)) {
            const cached = sheetCache.get(path);
            if (cached.ready) onReady(cached.texture);
            else if (cached.failed) onError();
            else cached.waiters.push([onReady, onError]);
            return cached.texture;
        }

        const entry = { texture: null, ready: false, failed: false, waiters: [[onReady, onError]] };
        sheetCache.set(path, entry);
        entry.texture = new THREE.TextureLoader().load(path, () => {
            entry.ready = true;
            entry.waiters.forEach(([ready]) => ready(entry.texture));
            entry.waiters = [];
        }, undefined, () => {
            entry.failed = true;
            entry.waiters.forEach(([, fail]) => fail());
            entry.waiters = [];
        });
        entry.texture.encoding = THREE.sRGBEncoding;
        entry.texture.repeat.set(1 / SHEET_FRAMES, 1);
        entry.texture.anisotropy = 4;
        return entry.texture;
    }

    function makeCharacter(kind, variant) {
        const THREE = T();
        // Shaun's own Blender characters when their models are loaded (characters.js).
        const Characters = window.NunWorld.Characters;
        if (Characters && Characters.isReady(kind)) {
            const character = Characters.create(kind, variant);
            character.holder.userData = { kind, character };
            return character.holder;
        }
        const root = new THREE.Group();
        const fallback = kind === 'nun' ? makeNun() : makeDemoness();
        fallback.visible = false;
        root.add(fallback);

        const path = kind === 'nun'
            ? `assets/world3d/nun_v${Math.max(1, Math.min(5, Number(variant) || 1))}.webp`
            : 'assets/world3d/demon.webp';
        const material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08, fog: true, depthWrite: true });
        const sprite = new THREE.Sprite(material);
        sprite.center.set(0.5, 0);
        const height = kind === 'nun' ? 1.9 : 1.85;
        sprite.scale.set(height * 0.5, height, 1);
        sprite.visible = false;
        root.add(sprite);

        material.map = loadSheet(path, (texture) => {
            material.map = texture;
            material.needsUpdate = true;
            sprite.visible = true;
            fallback.visible = false;
        }, () => {
            sprite.visible = false;
            fallback.visible = true;
        });

        root.userData = { kind, sprite, fallback, frame: 0, t: 0 };
        return root;
    }

    // pace: 0 = standing, 1 = normal walk. light: 0..1 how lit she is right now.
    function animateCharacter(character, dt, pace, light, opacity, flash) {
        const data = character.userData;
        if (data.character) {
            // a lit 3D model: the scene's candles and the player's night vision shade
            // her, not `light`; `flash` burns her white (no caller sets it any more)
            window.NunWorld.Characters.animate(data.character, dt, pace, opacity, flash);
            return;
        }
        if (data.fallback.visible) {
            if (data.kind === 'nun') animateNun(data.fallback, dt, pace > 0.1);
            else animateDemoness(data.fallback, dt, pace);
            return;
        }

        data.t += dt * 10 * Math.max(0.15, pace);
        const frame = Math.floor(data.t) % SHEET_FRAMES;
        const map = data.sprite.material.map;
        if (map) map.offset.x = frame / SHEET_FRAMES;
        const brightness = Math.max(0.12, Math.min(1, light));
        data.sprite.material.color.setScalar(brightness);
        data.sprite.material.opacity = opacity == null ? 1 : opacity;
    }

    // ------------------------------------------------------------ relics

    // A relic's shimmer is tinted by what it is worth to the player: warm gold for a
    // cross, deep crimson for a book, so a glint seen across the nave already says which
    // purse it fills (they are separate).
    function relicGlowColor(kind) {
        return kind === 'cross' ? 'rgba(255,210,120,0.8)' : 'rgba(225,70,60,0.75)';
    }

    // A reliquary or a relic hidden under a table: the shimmer is bigger and breathes, so
    // the pickups worth a detour read differently from a floor cross. Called once at the
    // level build (world.js), never mid-vigil: it only rescales a prewarmed sprite.
    function markRelicPrize(relic) {
        const data = relic.userData;
        if (!data || data.prize) return;
        data.prize = true;
        data.glowSize *= 1.6;
        data.glow.scale.set(data.glowSize, data.glowSize, data.glowSize);
    }

    function makeRelic(kind) {
        const THREE = T();
        const root = new THREE.Group();
        const pivot = new THREE.Group();
        root.add(pivot);

        // Every part starts dimmed (no candle lit yet); setRelicLit swaps the colours.
        const parts = [];
        const relicPart = (geometry, key) => {
            const piece = mesh(geometry, `${key}Dim`);
            parts.push({ piece, key });
            return piece;
        };
        // Both lie flat on whatever they rest on, their long side along z; `rest` is how
        // far the root sits above that surface (half their thickness).
        let rest;
        if (kind === 'cross') {
            const upright = relicPart(new THREE.BoxGeometry(0.06, 0.4, 0.04), 'gold');
            const bar = relicPart(new THREE.BoxGeometry(0.24, 0.06, 0.04), 'gold');
            bar.position.y = 0.07;
            pivot.add(upright, bar);
            pivot.rotation.x = -Math.PI / 2;
            rest = 0.022;
        } else {
            const cover = relicPart(new THREE.BoxGeometry(0.3, 0.07, 0.38), 'leather');
            const pages = relicPart(new THREE.BoxGeometry(0.28, 0.05, 0.35), 'pages');
            pages.position.x = 0.012;
            const clasp = relicPart(new THREE.BoxGeometry(0.06, 0.075, 0.06), 'gold');
            clasp.position.set(0.14, 0, 0);
            pivot.add(cover, pages, clasp);
            rest = 0.04;
        }

        const glow = glowSprite(relicGlowColor(kind), 0.7, 0);
        glow.position.y = 0.1;
        glow.visible = false;
        root.add(glow);
        root.userData = { kind, pivot, glow, glowSize: 0.7, parts, rest, lit: false, shine: 0, t: Math.random() * 6 };
        return root;
    }

    // A reliquary: a small gilded casket with its cross or book laid on the lid, set on
    // the top of a tall prop (cathedral.js) and worth several relics (world.js). A faint
    // glint, drawn in the fog so it fades with distance, gives away where it sits; it
    // takes and lights exactly like a relic (setRelicLit, animateRelic).
    function makeReliquary(kind) {
        const THREE = T();
        const root = new THREE.Group();
        const pivot = new THREE.Group();
        root.add(pivot);
        const parts = [];
        const relicPart = (geometry, key) => {
            const piece = mesh(geometry, `${key}Dim`);
            parts.push({ piece, key });
            return piece;
        };
        const chest = relicPart(new THREE.BoxGeometry(0.3, 0.16, 0.42), 'gold');
        const lid = relicPart(new THREE.BoxGeometry(0.34, 0.05, 0.46), 'gold');
        lid.position.y = 0.105;
        const band = relicPart(new THREE.BoxGeometry(0.31, 0.03, 0.06), 'iron');
        band.position.y = 0.02;
        pivot.add(chest, lid, band);
        if (kind === 'cross') {
            const upright = relicPart(new THREE.BoxGeometry(0.05, 0.03, 0.34), 'gold');
            const bar = relicPart(new THREE.BoxGeometry(0.2, 0.03, 0.05), 'gold');
            upright.position.y = 0.145;
            bar.position.set(0, 0.145, -0.07);
            pivot.add(upright, bar);
        } else {
            const cover = relicPart(new THREE.BoxGeometry(0.24, 0.05, 0.3), 'leather');
            cover.position.y = 0.155;
            pivot.add(cover);
        }

        const glow = glowSprite(relicGlowColor(kind), 0.9, 0);
        glow.position.y = 0.2;
        glow.visible = false;
        root.add(glow);
        const beacon = glowSprite('rgba(255,200,110,0.9)', 0.55, 0);
        beacon.material.fog = true;
        beacon.position.y = 0.3;
        root.add(beacon);
        root.userData = { kind, pivot, glow, glowSize: 0.9, beacon, parts, rest: 0.08, lit: false, shine: 0, t: Math.random() * 6 };
        return root;
    }

    // In a lit candle's pool (it shrinks as the stand burns down), or while it can be
    // taken, a relic shows its true colours; otherwise it stays a dim shape even in the
    // player's night vision. Only swaps on a change.
    function setRelicLit(relic, lit) {
        const data = relic.userData;
        if (data.lit === lit) return;
        data.lit = lit;
        data.parts.forEach(({ piece, key }) => {
            piece.material = material(lit ? key : `${key}Dim`);
        });
    }

    // revealed: the player stands right by it and looks at it (world.js findTarget), lit
    // candle or not — then it glows, in full, where it lies. sight (0..1, world.js
    // relicSightRange): how near it is, which fades a much fainter shimmer in so the
    // player can pick a line through the dark instead of groping (`shimmer`, at most
    // world.js relicSightOpacity of the revealed glow). Beyond the range it is invisible
    // again. The sprite is depth-tested, so anything in the way still hides it.
    function animateRelic(relic, dt, revealed, sight, shimmer) {
        const data = relic.userData;
        const goal = revealed ? 1 : 0;
        data.t += dt;
        if (data.beacon) {
            // a reliquary's glint: a slow, faint pulse every few seconds
            const pulse = Math.max(0, Math.sin(data.t * 1.9));
            data.beacon.material.opacity = (0.08 + (0.32 * pulse * pulse * pulse)) * (1 - data.shine);
        }
        data.shine += Math.max(-dt * 3, Math.min(dt * 4, goal - data.shine));
        const near = Math.max(0, Math.min(1, sight || 0));
        // a prize breathes slowly; a floor relic sits steady
        const breath = data.prize ? (0.72 + (0.28 * Math.sin(data.t * 1.6))) : 1;
        const faint = near * (shimmer == null ? 0.18 : shimmer) * breath;
        const opacity = Math.max(faint, data.shine * (0.5 + (Math.sin(data.t * 3.4) * 0.1)));
        data.glow.visible = opacity > 0.002;
        if (!data.glow.visible) return;
        data.glow.material.opacity = opacity;
    }

    // ------------------------------------------------------------ hiding spot

    // A low oak refectory table (width × length metres, its length along z) whose apron
    // hangs down to `gap` metres over the floor: a crouched body does not fit under it,
    // a prone one does (world.js hideoutGap, parkour.js stampHideouts). Heavy square
    // legs at the corners, a plain crimson runner laid along it and hanging over both
    // short ends (the long sides stay open to crawl in), a cold iron candlestick on top.
    // userData.legs: the legs' [u, v] in its own frame, for the collision.
    function makeHideout(width, length, gap) {
        const THREE = T();
        const root = new THREE.Group();
        const apron = 0.14;
        const slab = 0.08;
        const legTop = gap + apron;
        const top = legTop + slab;
        const add = (geometry, key, x, y, z) => {
            const piece = mesh(geometry, key);
            piece.position.set(x, y, z);
            root.add(piece);
            return piece;
        };
        add(new THREE.BoxGeometry(width, slab, length), 'wood', 0, legTop + (slab / 2), 0);
        // a moulded lip under the top's edge
        add(new THREE.BoxGeometry(width + 0.04, 0.025, length + 0.04), 'wood', 0, legTop + 0.012, 0);
        // the apron boards between the legs
        const inset = 0.05;
        add(new THREE.BoxGeometry(0.04, apron, length - (inset * 2)), 'wood', (width / 2) - inset, gap + (apron / 2), 0);
        add(new THREE.BoxGeometry(0.04, apron, length - (inset * 2)), 'wood', -(width / 2) + inset, gap + (apron / 2), 0);
        add(new THREE.BoxGeometry(width - (inset * 2), apron, 0.04), 'wood', 0, gap + (apron / 2), (length / 2) - inset);
        add(new THREE.BoxGeometry(width - (inset * 2), apron, 0.04), 'wood', 0, gap + (apron / 2), -(length / 2) + inset);
        const legs = [];
        const lu = (width / 2) - 0.09;
        const lv = (length / 2) - 0.1;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([su, sv]) => {
            legs.push([su * lu, sv * lv]);
            add(new THREE.BoxGeometry(0.11, legTop, 0.11), 'wood', su * lu, legTop / 2, sv * lv);
            // a squat block foot
            add(new THREE.BoxGeometry(0.15, 0.06, 0.15), 'wood', su * lu, 0.03, sv * lv);
        });
        // the runner: along the top, down over both ends
        const runner = Math.min(0.5, width * 0.55);
        const drop = Math.min(0.42, top - 0.25);
        add(new THREE.BoxGeometry(runner, 0.012, length + 0.03), 'velvet', 0, top + 0.006, 0);
        add(new THREE.BoxGeometry(runner, drop, 0.012), 'velvet', 0, top - (drop / 2), (length / 2) + 0.022);
        add(new THREE.BoxGeometry(runner, drop, 0.012), 'velvet', 0, top - (drop / 2), -(length / 2) - 0.022);
        // a cold iron candlestick (no flame: only the stands give light)
        const stickZ = (length / 2) - 0.35;
        add(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 12), 'iron', 0.12, top + 0.027, stickZ);
        add(new THREE.CylinderGeometry(0.018, 0.025, 0.26, 8), 'iron', 0.12, top + 0.16, stickZ);
        add(new THREE.CylinderGeometry(0.05, 0.03, 0.03, 10), 'iron', 0.12, top + 0.3, stickZ);
        add(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 8), 'wax', 0.12, top + 0.365, stickZ);
        root.userData = { legs, gap, top };
        return root;
    }

    // ------------------------------------------------------------ candle stand

    function makeCandleStand(flameColor) {
        const THREE = T();
        const root = new THREE.Group();
        const base = mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.08, 14), 'iron');
        base.position.y = 0.04;
        root.add(base);
        const pole = mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 10), 'iron');
        pole.position.y = 0.72;
        root.add(pole);
        const dish = mesh(new THREE.CylinderGeometry(0.3, 0.12, 0.08, 16), 'iron');
        dish.position.y = 1.38;
        root.add(dish);

        const flames = [];
        // Its own copy of the wax (the cache's is shared by every stand), so this one
        // stand can glow with an unlit ember while she is out (setCandleEmber).
        const wax = material('wax').clone();
        const waxEmissive = wax.emissive.getHex();
        [[0, 0], [0.16, 0.05], [-0.14, 0.08], [0.02, -0.16]].forEach(([x, z], index) => {
            const height = 0.16 + (index * 0.05);
            const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, height, 10), wax);
            candle.position.set(x, 1.42 + (height / 2), z);
            root.add(candle);
            const flame = glowSprite(flameColor || 'rgba(255,170,80,0.9)', 0.22, 0.95);
            flame.position.set(x, 1.42 + height + 0.07, z);
            flame.visible = false;
            root.add(flame);
            flames.push(flame);
        });

        const halo = glowSprite('rgba(255,150,60,0.35)', 1.6, 0.45);
        halo.position.y = 1.7;
        halo.visible = false;
        root.add(halo);

        // The unlit ember (world.js, while the Demoness is out): a wick that has not
        // gone quite cold. Built here so it is in the scene for prewarm(); it is a
        // sprite and an emissive, never a light.
        const ember = glowSprite('rgba(255,120,40,0.5)', 0.5, 0.2);
        ember.position.y = 1.58;
        ember.visible = false;
        root.add(ember);

        root.userData = { flames, halo, ember, wax, waxEmissive, glint: 0, lit: false, t: Math.random() * 5 };
        return root;
    }

    function setCandleLit(stand, lit) {
        stand.userData.lit = lit;
        stand.userData.flames.forEach((flame) => { flame.visible = lit; });
        stand.userData.halo.visible = lit;
        // A lit stand has nothing left to point at.
        if (lit) setCandleEmber(stand, false);
    }

    // The "light this one" glint (world.js: the nearest unlit stand while the Demoness
    // is out). Emissive on this stand's own wax plus its small ember sprite — no light
    // is added, removed or hidden. Turning it off puts the wax back as it was.
    function setCandleEmber(stand, on) {
        const data = stand.userData;
        if (!data || !data.wax) return;
        data.glint = on && !data.lit ? 1 : 0;
        data.ember.visible = Boolean(data.glint);
        if (!data.glint) data.wax.emissive.setHex(data.waxEmissive);
    }

    // A lit stand burns down (world.js burnCandles). glow (0..1, default 1): how much of
    // its burn is left, the size of its flames and halo; brightness (0..1, default 1):
    // this frame's flame, which sputters at the end of a burn (world.js candleFlame).
    function animateCandleStand(stand, dt, glow, brightness) {
        const unlit = stand.userData;
        if (!unlit.lit) {
            // Unlit: nothing to animate unless it is the glinting stand, and then only
            // a slow breath on its own wax's emissive and its ember sprite.
            if (unlit.glint) {
                unlit.t += dt;
                const pulse = 0.55 + (0.45 * Math.sin(unlit.t * 3.4));
                unlit.wax.emissive.setRGB(0.16 + (0.20 * pulse), 0.055 + (0.07 * pulse), 0.012 + (0.015 * pulse));
                unlit.ember.material.opacity = 0.10 + (0.12 * pulse);
                const size = 0.42 + (0.12 * pulse);
                unlit.ember.scale.set(size, size, size);
            }
            return;
        }
        const data = stand.userData;
        const size = glow == null ? 1 : glow;
        const bright = brightness == null ? 1 : brightness;
        const scale = (0.45 + (0.55 * size)) * bright;
        data.t += dt;
        data.flames.forEach((flame, index) => {
            const flicker = (0.2 + (Math.sin((data.t * 14) + index) * 0.02) + (Math.random() * 0.02)) * scale;
            flame.scale.set(flicker, flicker * 1.4, flicker);
        });
        data.halo.material.opacity = (0.38 + (Math.sin(data.t * 9) * 0.05)) * size * bright;
    }

    // ------------------------------------------------------------ altar

    function makeAltar() {
        const THREE = T();
        const root = new THREE.Group();
        const slab = mesh(new THREE.BoxGeometry(2.2, 1.0, 1.1), 'altarStone');
        slab.position.y = 0.5;
        root.add(slab);
        const cloth = mesh(new THREE.BoxGeometry(1.2, 0.9, 0.02), 'altarCloth');
        cloth.position.set(0, 0.52, 0.56);
        root.add(cloth);
        const cross = new THREE.Group();
        cross.add(mesh(new THREE.BoxGeometry(0.1, 1.1, 0.08), 'gold'));
        const bar = mesh(new THREE.BoxGeometry(0.62, 0.1, 0.08), 'gold');
        bar.position.y = 0.2;
        cross.add(bar);
        cross.position.set(0, 1.6, -0.3);
        root.add(cross);

        const flames = [];
        [-0.85, -0.6, 0.6, 0.85].forEach((x, index) => {
            const height = 0.3 + ((index % 2) * 0.12);
            const candle = mesh(new THREE.CylinderGeometry(0.04, 0.04, height, 10), 'wax');
            candle.position.set(x, 1.0 + (height / 2), 0.2);
            root.add(candle);
            const flame = glowSprite('rgba(255,170,80,0.9)', 0.25, 0.95);
            flame.position.set(x, 1.0 + height + 0.08, 0.2);
            root.add(flame);
            flames.push(flame);
        });

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(1.6, 2.2, 48),
            new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        root.add(ring);

        root.userData = { flames, ring, t: 0 };
        return root;
    }

    function animateAltar(altar, dt) {
        const data = altar.userData;
        data.t += dt;
        data.flames.forEach((flame, index) => {
            const flicker = 0.24 + (Math.sin((data.t * 13) + index) * 0.025);
            flame.scale.set(flicker, flicker * 1.4, flicker);
        });
        data.ring.material.opacity = 0.18 + (Math.sin(data.t * 2) * 0.08);
        data.ring.rotation.z += dt * 0.2;
    }

    // ------------------------------------------------------------ static props

    function part(geometry, materialKey, x, y, z, rotY) {
        const THREE = T();
        const matrix = new THREE.Matrix4();
        matrix.compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY || 0, 0)),
            new THREE.Vector3(1, 1, 1)
        );
        return { geometry, materialKey, matrix };
    }

    // Props are centred on their cell; `random` keeps each one a little different.
    const PROPS = {
        pew(random) {
            const THREE = T();
            return [
                part(new THREE.BoxGeometry(2.7, 0.08, 0.55), 'wood', 0, 0.48, 0),
                // Pews face the altar (north, -z): backrest to the south.
                part(new THREE.BoxGeometry(2.7, 0.62, 0.07), 'wood', 0, 0.82, 0.27),
                part(new THREE.BoxGeometry(0.08, 0.95, 0.6), 'wood', -1.35, 0.47, 0),
                part(new THREE.BoxGeometry(0.08, 0.95, 0.6), 'wood', 1.35, 0.47, 0),
                part(new THREE.BoxGeometry(2.7, 0.1, 0.18), 'wood', 0, 0.16 + (random() * 0.02), -0.5)
            ];
        },
        tomb(random) {
            const THREE = T();
            const turn = random() < 0.5 ? 0 : Math.PI / 2;
            return [
                part(new THREE.BoxGeometry(2.2, 0.8, 1.1), 'stoneProp', 0, 0.4, 0, turn),
                part(new THREE.BoxGeometry(2.35, 0.14, 1.22), 'stoneProp', 0, 0.87, 0, turn),
                part(new THREE.BoxGeometry(1.5, 0.18, 0.5), 'stoneProp', 0, 1.02, 0, turn)
            ];
        },
        fountain() {
            const THREE = T();
            return [
                part(new THREE.CylinderGeometry(1.35, 1.45, 0.55, 24), 'stoneProp', 0, 0.28, 0),
                part(new THREE.CylinderGeometry(1.2, 1.2, 0.05, 24), 'water', 0, 0.5, 0),
                part(new THREE.CylinderGeometry(0.18, 0.24, 1.3, 12), 'stoneProp', 0, 0.9, 0),
                part(new THREE.CylinderGeometry(0.6, 0.25, 0.25, 16), 'stoneProp', 0, 1.6, 0)
            ];
        },
        bookshelf() {
            const THREE = T();
            return [
                part(new THREE.BoxGeometry(2.96, 3.4, 0.9), 'books', 0, 1.7, 0),
                part(new THREE.BoxGeometry(3.0, 0.12, 0.96), 'wood', 0, 3.46, 0)
            ];
        },
        bonepile(random) {
            const THREE = T();
            const parts = [];
            for (let i = 0; i < 9; i += 1) {
                const x = (random() - 0.5) * 2;
                const z = (random() - 0.5) * 2;
                parts.push(part(new THREE.CapsuleGeometry(0.05, 0.5, 3, 6), 'bone', x, 0.1 + (random() * 0.35), z, random() * Math.PI));
            }
            for (let i = 0; i < 5; i += 1) {
                parts.push(part(new THREE.SphereGeometry(0.13, 10, 8), 'bone', (random() - 0.5) * 1.6, 0.14 + (random() * 0.4), (random() - 0.5) * 1.6));
            }
            parts.push(part(new THREE.ConeGeometry(1.1, 0.6, 10), 'bone', 0, 0.3, 0));
            return parts;
        }
    };

    function makePropParts(type, random) {
        const builder = PROPS[type] || PROPS.tomb;
        return builder(random || Math.random);
    }

    window.NunWorld = window.NunWorld || {};
    window.NunWorld.Models = {
        material,
        glowSprite,
        makeNun,
        animateNun,
        makeDemoness,
        animateDemoness,
        makeCharacter,
        animateCharacter,
        makeRelic,
        makeReliquary,
        animateRelic,
        markRelicPrize,
        setRelicLit,
        makeHideout,
        makeCandleStand,
        setCandleLit,
        setCandleEmber,
        animateCandleStand,
        makeAltar,
        animateAltar,
        makePropParts
    };
})();
