/**
 * The Nun 3D — the girls, as Shaun's own Blender characters.
 *
 * The Nun is Jane and the Demoness is Lilith, both Daz Genesis 9 figures, exported
 * straight from the shot files the videos were rendered from by
 * tools/blender/export_character.py:
 *
 *   assets/world3d/nun.glb   + nun.json     Jane, every garment of the nun outfit as its
 *                                           own node, and her catwalk walk
 *   assets/world3d/demon.glb + demon.json   Lilith and her run
 *
 * The .json says which garments each dressing shows — the same pieces the "dressing 2..5"
 * shots switch off — so the Nun loses her outfit vigil by vigil exactly like the videos.
 * When a model is missing the old sprite sheets (models.js) are used instead.
 *
 * Kept cheap to run: every copy has ONE skeleton shared by all its pieces (Daz splits
 * her into a mesh per material, and each would otherwise recompute and upload the whole
 * rig every frame), bones that stay still through the clip are frozen into the model
 * instead of animated, the clip's travel is taken out once at load (no per-frame
 * pinning), and she is frustum-culled with a sphere that covers any pose.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    const SOURCES = {
        nun: { model: 'assets/world3d/nun.glb', info: 'assets/world3d/nun.json', height: 1.72 },
        demon: { model: 'assets/world3d/demon.glb', info: 'assets/world3d/demon.json', height: 1.8 }
    };

    const cache = {};

    // The lantern's stun burns the Demoness white for a moment (strong enough to read
    // as a flash in the dark, not so strong that she turns into a flat cut-out).
    const FLASH = { color: 0xffe2d0, intensity: 0.3 };

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

    function sanitize(name) {
        return window.THREE.PropertyBinding.sanitizeNodeName(name);
    }

    function load(kind) {
        if (cache[kind] && (cache[kind].promise || cache[kind].gltf)) {
            return cache[kind].promise;
        }
        const source = SOURCES[kind];
        const entry = { gltf: null, info: null, scale: 1, failed: false };
        cache[kind] = entry;
        entry.promise = Promise.all([
            readBinary(source.info).then((buffer) => JSON.parse(new TextDecoder('utf-8').decode(buffer))),
            readBinary(source.model)
        ]).then(([info, buffer]) => new Promise((resolve, reject) => {
            new window.THREE.GLTFLoader().parse(buffer, '', (gltf) => {
                const THREEjs = window.THREE;
                // Her real size is measured later, in her first walking pose, over every
                // skinned piece (characters.js create()). Daz splits the body into one
                // mesh per material, so no single mesh is the whole figure.
                entry.scale = null;
                entry.floor = 0;
                // The clip is one cycle cut from a long shot: make it start at 0 so the
                // loop does not hold its first pose for the frames before the cut.
                (gltf.animations || []).forEach((clip) => {
                    const start = Math.min(...clip.tracks.map((track) => track.times[0] || 0));
                    if (start > 0) {
                        clip.tracks.forEach((track) => track.shift(-start));
                        clip.resetDuration();
                    }
                });
                entry.info = info;
                entry.garments = new Set((info.garments || []).map(sanitize));
                gltf.scene.traverse((object) => {
                    if (!object.isMesh) return;
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    // Garments ("C - ..." in the .blend) win the depth test against the
                    // skin they are drawn over, so tight lace never sinks into her.
                    const garment = /^C_-_/.test(object.name) || (object.parent && /^C_-_/.test(object.parent.name));
                    materials.forEach((material) => {
                        material.fog = true;
                        if (garment) {
                            material.polygonOffset = true;
                            material.polygonOffsetFactor = -2;
                            material.polygonOffsetUnits = -8;
                        }
                        // Daz's wet film over the eyes is a refraction trick; as a plain
                        // surface it paints the eyes solid white.
                        if (/moisture|cornea|tear|refraction/i.test(material.name || '')) {
                            material.visible = false;
                        }
                        if (/strands/i.test(material.name || '')) {
                            material.side = THREEjs.DoubleSide;
                        }
                        // Her own glow (the Demoness's eyes and horns, baked from the shot's
                        // shaders) is what she returns to after the lantern's flash.
                        if (material.emissive) {
                            material.userData.glow = { color: material.emissive.getHex(), intensity: material.emissiveIntensity };
                        }
                        if (material.map) material.map.anisotropy = 4;
                        // lashes, brows and lace are cut out, not blended: no sorting trouble
                        // (glTF BLEND materials also come without depth writes: without
                        // them the skin drawn after the lace paints straight over it)
                        if (material.transparent) {
                            material.transparent = false;
                            material.depthWrite = true;
                            material.alphaTest = 0.4;
                        }
                    });
                });
                const clip = gltf.animations && gltf.animations[0];
                shareSkeleton(gltf.scene);
                flattenTravel(gltf.scene, clip);
                freezeStillBones(gltf.scene, clip);
                boundSpheres(gltf.scene);
                entry.gltf = gltf;
                resolve(entry);
            }, reject);
        })).catch((error) => {
            console.warn(`[characters] ${kind} model not loaded, using the sprites:`, error);
            entry.failed = true;
            entry.promise = null;
            return null;
        });
        return entry.promise;
    }

    function loadAll() {
        return Promise.all(Object.keys(SOURCES).map(load));
    }

    function isReady(kind) {
        return Boolean(cache[kind] && cache[kind].gltf);
    }

    // All the pieces of one figure are skinned by the same rig (one glTF skin), but the
    // loader and SkeletonUtils give each its own Skeleton: bind them all to the first.
    function shareSkeleton(root) {
        let shared = null;
        root.traverse((object) => {
            if (!object.isSkinnedMesh) return;
            if (!shared) {
                shared = object.skeleton;
                return;
            }
            const skeleton = object.skeleton;
            const same = skeleton !== shared
                && skeleton.bones.length === shared.bones.length
                && skeleton.bones.every((bone, i) => bone === shared.bones[i])
                && skeleton.boneInverses.every((inverse, i) => inverse.equals(shared.boneInverses[i]));
            if (same) object.bind(shared, object.bindMatrix);
        });
    }

    function findHip(root) {
        let hip = null;
        root.traverse((object) => {
            if (!hip && object.isBone && /^(hip|hips|pelvis)$/i.test(object.name)) hip = object;
        });
        return hip;
    }

    // The shots walk her down the nave, so the clip carries that travel; the game moves
    // her itself. Taken out once, on the top-most bone above the hip that moves (the
    // rig's "master" when the shot drives it, else the hip): at every key the whole
    // figure is shifted so the hip is back over the origin, keeping her vertical bob.
    function flattenTravel(root, clip) {
        const THREEjs = window.THREE;
        const hip = findHip(root);
        if (!hip || !clip) return;
        const tracks = new Map(clip.tracks.map((track) => [track.name, track]));
        let carrier = null;
        const times = new Set();
        for (let node = hip; node && node !== root; node = node.parent) {
            ['position', 'quaternion'].forEach((path) => {
                const track = tracks.get(`${node.name}.${path}`);
                if (track) track.times.forEach((time) => times.add(time));
            });
            if (tracks.has(`${node.name}.position`)) carrier = node;
        }
        if (!carrier || !carrier.parent) return;
        const old = tracks.get(`${carrier.name}.position`);
        // one key wherever anything on the chain has one, so the fix is exact at each
        const keyTimes = Float32Array.from([...times].sort((a, b) => a - b));
        const sampler = old.createInterpolant();
        const values = new Float32Array(keyTimes.length * 3);
        keyTimes.forEach((time, k) => values.set(sampler.evaluate(time), k * 3));
        const mixer = new THREEjs.AnimationMixer(root);
        const action = mixer.clipAction(clip);
        action.play();
        const point = new THREEjs.Vector3();
        const toParent = new THREEjs.Matrix3();
        keyTimes.forEach((time, k) => {
            action.time = time;
            mixer.update(0);
            root.updateMatrixWorld(true);
            hip.getWorldPosition(point);
            point.y = 0;
            // that sideways offset, as a direction in the carrier's parent space
            toParent.setFromMatrix4(carrier.parent.matrixWorld).invert();
            point.applyMatrix3(toParent);
            values[k * 3] -= point.x;
            values[(k * 3) + 1] -= point.y;
            values[(k * 3) + 2] -= point.z;
        });
        action.stop();
        mixer.uncacheRoot(root);
        clip.tracks[clip.tracks.indexOf(old)] = new THREEjs.VectorKeyframeTrack(old.name, keyTimes, values);
    }

    // A walk moves few of the rig's bones (the face, fingers, breasts and toes hold one
    // pose): a track that never changes by more than float noise (a thousandth of a unit,
    // a fifth of a millimetre on her) is written into its bone once and dropped, so the
    // mixer only animates what moves.
    function freezeStillBones(root, clip) {
        if (!clip) return;
        const Binding = window.THREE.PropertyBinding;
        clip.tracks = clip.tracks.filter((track) => {
            const size = track.getValueSize();
            const values = track.values;
            for (let i = size; i < values.length; i += 1) {
                if (Math.abs(values[i] - values[i % size]) > 1e-3) return true;
            }
            const parsed = Binding.parseTrackName(track.name);
            const node = Binding.findNode(root, parsed.nodeName);
            const target = node && node[parsed.propertyName];
            if (!target || typeof target.fromArray !== 'function') return true;
            target.fromArray(values, 0);
            return false;
        });
    }

    // Skinned pieces are culled by their geometry's sphere, which the bind pose would
    // get wrong for a running figure: give every piece one sphere around her middle,
    // three quarters of her height across, which holds any pose of the clip.
    function boundSpheres(root) {
        const THREEjs = window.THREE;
        root.updateMatrixWorld(true);
        const box = new THREEjs.Box3();
        const part = new THREEjs.Box3();
        root.traverse((object) => {
            if (!object.isSkinnedMesh) return;
            object.geometry.computeBoundingBox();
            box.union(part.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
        });
        if (box.isEmpty()) return;
        const size = box.getSize(new THREEjs.Vector3());
        const centre = box.getCenter(new THREEjs.Vector3());
        const radius = 0.75 * Math.max(size.x, size.y, size.z);
        const inverse = new THREEjs.Matrix4();
        root.traverse((object) => {
            if (!object.isSkinnedMesh) return;
            inverse.copy(object.matrixWorld).invert();
            object.geometry.boundingSphere = new THREEjs.Sphere(
                centre.clone().applyMatrix4(inverse),
                radius / object.matrixWorld.getMaxScaleOnAxis()
            );
        });
    }

    // Show exactly the garments this dressing wears.
    function dress(model, entry, dressing) {
        const table = (entry.info && entry.info.dressings) || {};
        const key = String(Math.max(1, Math.min(5, Number(dressing) || 1)));
        const wanted = new Set((table[key] || table['1'] || []).map(sanitize));
        model.traverse((object) => {
            if (entry.garments.has(object.name)) {
                object.visible = wanted.has(object.name);
            }
        });
    }

    // A fresh copy with its own skeleton and animation, dressed for the vigil.
    function create(kind, dressing) {
        const THREEjs = window.THREE;
        const entry = cache[kind];
        const model = THREEjs.SkeletonUtils.clone(entry.gltf.scene);
        shareSkeleton(model);
        model.traverse((object) => {
            if (object.isMesh) {
                // culled by the whole-figure sphere set in boundSpheres()
                object.frustumCulled = true;
                object.userData.sharedGeometry = true;
            }
        });
        if (kind === 'nun') dress(model, entry, dressing);

        const holder = new THREEjs.Group();
        holder.add(model);
        const mixer = new THREEjs.AnimationMixer(model);
        const clip = entry.gltf.animations && entry.gltf.animations[0];
        const action = clip ? mixer.clipAction(clip) : null;
        if (action) {
            action.play();
            action.time = Math.random() * clip.duration;
        }
        const materials = [];
        model.traverse((object) => {
            if (!object.isMesh) return;
            (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
                if (!materials.includes(material)) materials.push(material);
            });
        });
        const character = { kind, holder, model, mixer, action, materials, opacity: 1, burning: null };
        // Measured per dressing: the vigil-1 platform heels lift her, bare feet do not.
        const key = kind === 'nun' ? String(dressing || 1) : 'all';
        entry.sizes = entry.sizes || {};
        if (!entry.sizes[key]) {
            measure(entry, character, SOURCES[kind].height);
            entry.sizes[key] = { scale: entry.scale, floor: entry.floor };
        }
        model.scale.setScalar(entry.sizes[key].scale);
        model.position.y = -entry.sizes[key].floor * entry.sizes[key].scale;
        return character;
    }

    // Skin every visible piece by hand through her cycle and scale her so she stands
    // `height` metres tall with her lowest foot on the floor (a run leaves the ground,
    // so one pose is not enough).
    function measure(entry, character, height) {
        const THREEjs = window.THREE;
        const { model, holder, mixer, action } = character;
        model.scale.setScalar(1);
        model.position.set(0, 0, 0);
        const point = new THREEjs.Vector3();
        let low = Infinity;
        let high = -Infinity;
        const start = action ? action.time : 0;
        const poses = action ? 6 : 1;
        for (let pose = 0; pose < poses; pose += 1) {
            if (action) action.time = (pose / poses) * action.getClip().duration;
            mixer.update(0);
            holder.updateMatrixWorld(true);
            model.traverse((object) => {
                if (!object.isSkinnedMesh || !object.visible) return;
                const positions = object.geometry.attributes.position;
                const step = Math.max(1, Math.floor(positions.count / 1500));
                for (let i = 0; i < positions.count; i += step) {
                    point.fromBufferAttribute(positions, i);
                    object.boneTransform(i, point);
                    point.applyMatrix4(object.matrixWorld);
                    holder.worldToLocal(point);
                    low = Math.min(low, point.y);
                    high = Math.max(high, point.y);
                }
            });
        }
        if (action) {
            action.time = start;
            mixer.update(0);
        }
        if (!Number.isFinite(low) || high - low < 1e-4) {
            low = 0;
            high = height;
        }
        entry.scale = height / (high - low);
        entry.floor = low;
    }

    // pace 0 = standing still, 1 = her normal gait. opacity fades the Demoness in and out;
    // flash burns her white while the lantern has her stunned.
    function animate(character, dt, pace, opacity, flash) {
        const burning = Boolean(flash);
        // (materials are shared between copies: the first frame always sets them)
        if (character.kind === 'demon' && burning !== character.burning) {
            character.burning = burning;
            character.materials.forEach((material) => {
                const glow = material.userData.glow;
                if (!glow) return;
                material.emissive.setHex(burning ? FLASH.color : glow.color);
                material.emissiveIntensity = burning ? FLASH.intensity : glow.intensity;
            });
        }
        if (character.action) {
            // pace 0 stops her dead (the stunned Demoness); anything else keeps enough
            // of the clip to look alive.
            character.action.timeScale = pace > 0 ? Math.max(0.05, pace) : 0;
        }
        // (the clip walks on the spot: its travel was taken out at load)
        character.mixer.update(dt);
        const target = opacity == null ? 1 : opacity;
        if (Math.abs(target - character.opacity) > 0.001) {
            character.opacity = target;
            character.materials.forEach((material) => {
                const fading = target < 0.999;
                if (material.transparent !== fading) {
                    material.transparent = fading;
                    material.needsUpdate = true;
                }
                material.opacity = target;
                material.depthWrite = !fading;
            });
        }
    }

    NW.Characters = { load, loadAll, isReady, create, animate, dress };
})();
