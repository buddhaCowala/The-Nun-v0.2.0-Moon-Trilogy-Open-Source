/**
 * The Nun 3D — the real cathedral.
 *
 * The vigils are walked inside the same cathedral the pre-rendered scenes were shot in
 * (Blender: "NO RENDER Zones.blend", scene 'Gothic'). It is exported by
 * tools/blender/bake_export_cathedral.py as:
 *
 *   assets/world3d/cathedral.glb   architecture + props, decimated, with the Cycles
 *                                  torchlight baked into the COLOR_0 vertex attribute
 *   assets/world3d/cathedral.json  the navigation grid, torch spots and prop boxes
 *
 * The model keeps Blender units (1 unit ~= 0.25 m) and Y-up; SCALE and the grid below
 * turn it into the metres the gameplay uses. Everything else (Nun, Demoness, relics,
 * candles, altar) is placed on that grid, exactly like the old hand-drawn levels.
 */
(function () {
    'use strict';

    const NW = window.NunWorld = window.NunWorld || {};

    // The dark cathedral: no wall torches, nothing baked. Only the candles the player
    // lights, the lantern and a cold fill light it (tools/blender, mode "dark").
    const MODEL_PATH = 'assets/world3d/cathedral_dark.glb';
    const NAV_PATH = 'assets/world3d/cathedral_dark.json';

    // 1 Blender unit in metres (the piano, the bathtub and the shot cameras all agree).
    const SCALE = 0.25;

    // What the refracting apse glass is turned into (prepareMaterial).
    const GLASS_TINT = 0x42362a;
    // What an untextured near-black surface becomes (prepareMaterial), and how many
    // metres one UV unit spans on the stone laid over the black shell (restoneShells):
    // the nave's own walls use ~3 m (their texture repeats 5x per unit, ~0.6 m blocks).
    const DARK_IRON = 0x2e2a26;
    const SHELL_UV_METRES = 3;

    const cache = { promise: null, model: null, nav: null, failed: false };

    // The app runs over file://, where fetch() cannot read local files: go through the
    // Electron bridge when it is there, and fall back to fetch for the browser.
    function readBinary(path) {
        const api = window.electronAPI;
        if (api && typeof api.readAssetBinary === 'function') {
            return api.readAssetBinary(path).then((data) => {
                if (!data) {
                    throw new Error(`asset not readable: ${path}`);
                }
                if (data instanceof ArrayBuffer) return data;
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            });
        }
        return fetch(path).then((response) => {
            if (!response.ok) throw new Error(`${response.status} ${path}`);
            return response.arrayBuffer();
        });
    }

    function readJson(path) {
        return readBinary(path).then((buffer) => JSON.parse(new TextDecoder('utf-8').decode(buffer)));
    }

    function parseModel(buffer) {
        return new Promise((resolve, reject) => {
            new window.THREE.GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf), reject);
        });
    }

    // Blender (Z up, metres) -> game world (Y up, metres, origin at the grid corner).
    function makeTransform(nav) {
        const x0 = nav.region.x[0];
        const y1 = nav.region.y[1];
        return {
            cellSize: nav.cellBU * SCALE,
            toWorld(bx, by, bz) {
                return {
                    x: (bx - x0) * SCALE,
                    y: ((bz === undefined ? nav.floorZ : bz) - nav.floorZ) * SCALE,
                    z: (y1 - by) * SCALE
                };
            }
        };
    }

    /**
     * The exported glTF carries Blender's baked torchlight as the COLOR_0 vertex
     * attribute. three.js would multiply that into the albedo, which is not what
     * light does, so it is moved aside and added to each surface's indirect light
     * instead — the same slot a lightmap would use. That baked light, not real-time
     * lights, is what makes the walk look like the rendered scenes.
     */
    function prepareMaterial(material, THREEjs, dark) {
        material.vertexColors = false;
        material.emissiveMap = null;
        // Flames in the set (the chandelier's candles): lit in the torchlit build, cold
        // wax in the dark one, where only the candles the player lights may glow.
        const isFlame = /fire|flame|candle/i.test(material.name || '');
        const glows = isFlame && !dark;
        material.emissive = new THREEjs.Color(glows ? 0xff8a3a : 0x000000);
        material.emissiveIntensity = glows ? 1 : 0;
        if (isFlame) {
            material.color.setHex(glows ? 0xff8a3a : 0x6a5a48);
            material.roughness = 1;
            material.metalness = 0;
        }
        // A fully metallic surface only mirrors light, and there is almost nothing to
        // mirror in the dark: the bell, the sconces and the gilded statues would read as
        // black holes next to lit stone.
        material.metalness = Math.min(material.metalness, 0.35);
        // The apse's ironwork ("Metal") is an untextured near-black mirror (albedo 0.02):
        // with nothing to mirror it rendered as solid black shapes on the apse walls.
        // An untextured surface that dark becomes dark iron, lit like the stone.
        if (!material.map && !isFlame && Math.max(material.color.r, material.color.g, material.color.b) < 0.05) {
            material.color.setHex(DARK_IRON);
            material.metalness = Math.min(material.metalness, 0.2);
            material.roughness = Math.max(material.roughness, 0.6);
        }
        material.fog = true;
        if (material.map) material.map.anisotropy = 4;
        // The five stained-glass lancets of the apse are exported as refracting glass.
        // One transmissive material makes three.js draw every opaque object a second
        // time, every frame, into a refraction buffer (twice the triangles and draw
        // calls), and compile a second shader for each of them the first time it is
        // seen. At this roughness the refraction is only a blurred tint of the stone
        // behind; plain glass lit by the same candles, with this tint, measures the
        // same colour in the apse (within 3/255).
        if (material.transmission > 0) {
            material.transmission = 0;
            material.color.multiply(new THREEjs.Color(GLASS_TINT));
        }
        // glTF "BLEND" materials arrive transparent with depth writes off. The coffin's
        // alpha maps are solid white, so they are drawn as opaque cut-outs: its chains
        // and planks no longer show through or vanish behind each other with the view
        // angle, and there is no second pass (three.js draws a double-sided transparent
        // material twice per frame and rebuilds its shader state both times).
        if (material.transparent && material.opacity >= 1) {
            material.transparent = false;
            material.depthWrite = true;
            material.alphaTest = 0.5;
        }
    }

    function injectBakedLight(material) {
        material.userData.bakedIntensity = { value: 1 };
        material.onBeforeCompile = (shader) => {
            shader.uniforms.bakedLightIntensity = material.userData.bakedIntensity;
            shader.vertexShader = 'attribute vec3 bakedLight;\nvarying vec3 vBakedLight;\n'
                + shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\n\tvBakedLight = bakedLight;'
                );
            shader.fragmentShader = 'uniform float bakedLightIntensity;\nvarying vec3 vBakedLight;\n'
                + shader.fragmentShader.replace(
                    '#include <lights_fragment_maps>',
                    '#include <lights_fragment_maps>\n\tirradiance += vBakedLight * bakedLightIntensity;'
                );
        };
        material.customProgramCacheKey = () => 'nun-baked-light';
        material.needsUpdate = true;
    }

    /**
     * The set has no outer walls: Shaun's scene closes the nave with one huge box
     * (Cube.003, 17 x 51 x 34 m) and a plane above the apse (Plane.001), both plain
     * black with no texture. From inside they ARE the aisles' outer walls, the back
     * walls and the sky above the vaults, so ~30% of every view was pure black whatever
     * lit it, the lantern included. They get the nave's own stone (same material, so no
     * new shader or texture), with UVs projected from the world along each face's axis.
     * Returns that stone (null: none found).
     */
    function restoneShells(root, THREEjs) {
        let stone = null;
        let stoneTriangles = 0;
        const shells = [];
        root.traverse((object) => {
            if (!object.isMesh || Array.isArray(object.material)) return;
            const material = object.material;
            const geometry = object.geometry;
            const triangles = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
            if (/^medieval_blocks/i.test(material.name || '') && material.map && triangles > stoneTriangles) {
                stone = material;
                stoneTriangles = triangles;
            }
            const c = material.color;
            if (!material.map && c && c.r === 0 && c.g === 0 && c.b === 0 && !material.transparent) shells.push(object);
        });
        if (!stone) return null;
        const a = new THREEjs.Vector3();
        const b = new THREEjs.Vector3();
        const c = new THREEjs.Vector3();
        const ab = new THREEjs.Vector3();
        const n = new THREEjs.Vector3();
        shells.forEach((mesh) => {
            const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
            const position = geometry.attributes.position;
            const uv = new Float32Array(position.count * 2);
            for (let t = 0; t + 2 < position.count; t += 3) {
                a.fromBufferAttribute(position, t).applyMatrix4(mesh.matrixWorld);
                b.fromBufferAttribute(position, t + 1).applyMatrix4(mesh.matrixWorld);
                c.fromBufferAttribute(position, t + 2).applyMatrix4(mesh.matrixWorld);
                n.subVectors(c, b).cross(ab.subVectors(a, b));
                const ax = Math.abs(n.x);
                const ay = Math.abs(n.y);
                const az = Math.abs(n.z);
                [a, b, c].forEach((p, k) => {
                    let u;
                    let v;
                    if (ax >= ay && ax >= az) { u = p.z; v = p.y; } else if (az >= ay) { u = p.x; v = p.y; } else { u = p.x; v = p.z; }
                    uv[((t + k) * 2)] = u / SHELL_UV_METRES;
                    uv[((t + k) * 2) + 1] = v / SHELL_UV_METRES;
                });
            }
            geometry.setAttribute('uv', new THREEjs.BufferAttribute(uv, 2));
            mesh.geometry.dispose();
            mesh.geometry = geometry;
            mesh.material = stone;
        });
        return stone;
    }

    // ------------------------------------------------------------ the walled-up openings
    //
    // Shaun: "in the map there is 2 kind of grids replacing walls on the left and right
    // sides of the altar. Please remove them and continue the walls instead". Both stood
    // where the set has no wall, with only the dark behind them:
    //  - a gate of iron bars (X_Cube.004) in each side wall of the shell (restoneShells),
    //    in its hole beside the apse (GATE_HOLES). The holes get the shell's wall back, in
    //    the same stone with the same world-projected blocks, so the wall runs straight on;
    //    the right one keeps the side door's opening (SIDE_DOORWAY) in a plain stone frame.
    //  - the lattices and stained glass of the apse's lancets (Metal.001 and
    //    MAT_glass_rose_2.002). The four beside the altar (LANCETS) are blocked up with a
    //    slab of the apse's own stone just behind where the grille stood, still framed by
    //    their reveals and mullion; the lancet behind the throne stays a window.
    // The player's collision already stops at these walls: the holes are outside the height
    // field and the level grid there is stone, and the field has the lancets' old lines as
    // stone (the body's edge stops 0.33 m in front of the old grille: at the wall's face).
    // Only the girls' 1 m grid reached in behind the apse (buildLevel masks it: APSE).

    // Each hole in the shell (m): x of the wall's face to the nave and of its back face,
    // and the hole's span. `door`: an opening is left in it, `doorway` says which one
    // (SIDE_DOORWAY when it says none). Both holes keep one now — the right one the side
    // door's (door.js), the left one the spike room's open mouth (spikeRoom.js), the same
    // z and the same frame, mirrored. The spec is written out here rather than referenced
    // because SIDE_DOORWAY is declared further down the file.
    const GATE_HOLES = [
        {
            inner: 4.3258, outer: 3.4383, z0: 7.0092, z1: 13.1744, y0: -1.4276, y1: 7.5857,
            door: true, doorway: { x: 3.88205, z: 10.092, width: 1.8, height: 2.6, nx: 1, nz: 0, depth: 0.8875 }
        },
        { inner: 19.7395, outer: 20.627, z0: 7.0092, z1: 13.1744, y0: -1.4276, y1: 7.5857, door: true }
    ];
    // Each walled-up lancet: the middle of its old grille, and the normal into the apse.
    const LANCETS = [
        { x: 4.142, z: 5.516, nx: 0.781, nz: 0.624 },
        { x: 7.64, z: 2.729, nx: 0.433, nz: 0.901 },
        { x: 16.361, z: 2.729, nx: -0.434, nz: 0.901 },
        { x: 19.858, z: 5.516, nx: -0.782, nz: 0.623 }
    ];
    // The slab: `back` m behind the grille's plane, `half` m each side, y0..y1 (the
    // opening is ~1.6 m wide at the floor and closes at ~6.6 m; the reveals hide the rest).
    const LANCET_SLAB = { back: 0.04, half: 1.25, y0: -0.4, y1: 7.35 };
    // The apse wall's blocks beside its lancets (its TEXCOORD_0, fitted there): U grows
    // 0.1721 per metre along the wall away from the nave's middle, V = 1.2744 - 0.167 y.
    const APSE_UV = { u0: 0.5, u: 0.1721, v0: 1.2744, v: -0.167 };
    // The side door's frame: jambs `jamb` m wide standing `jambOut` proud of the wall, a
    // lintel `lintel` m high standing `lintelOut` proud and reaching `over` past them. Its
    // blocks are laid larger (`uvMetres`) and offset, so they read as dressed stones.
    const DOOR_FRAME = { jamb: 0.25, jambOut: 0.12, lintel: 0.35, lintelOut: 0.16, over: 0.1, uvMetres: 9, uvShift: 0.37 };

    // Drops the triangles whose middle (world metres) is `inside(x, y, z)` from the meshes
    // whose material name matches `name`; a mesh left empty is removed. Returns the
    // meshes it cut, each with the parent it had.
    function dropTriangles(root, name, inside) {
        const cut = [];
        root.traverse((object) => {
            if (!object.isMesh || Array.isArray(object.material) || !name.test(object.material.name || '')) return;
            const geometry = object.geometry;
            if (!geometry.index) return;
            const index = geometry.index.array;
            const position = geometry.attributes.position.array;
            const e = object.matrixWorld.elements;
            const keep = [];
            for (let t = 0; t < index.length; t += 3) {
                const a = index[t] * 3;
                const b = index[t + 1] * 3;
                const c = index[t + 2] * 3;
                const x = (position[a] + position[b] + position[c]) / 3;
                const y = (position[a + 1] + position[b + 1] + position[c + 1]) / 3;
                const z = (position[a + 2] + position[b + 2] + position[c + 2]) / 3;
                const wx = (e[0] * x) + (e[4] * y) + (e[8] * z) + e[12];
                const wy = (e[1] * x) + (e[5] * y) + (e[9] * z) + e[13];
                const wz = (e[2] * x) + (e[6] * y) + (e[10] * z) + e[14];
                if (!inside(wx, wy, wz)) keep.push(index[t], index[t + 1], index[t + 2]);
            }
            if (keep.length < index.length) cut.push({ object, parent: object.parent, keep });
        });
        cut.forEach(({ object, keep }) => {
            if (keep.length) {
                object.geometry.setIndex(keep);
            } else {
                object.parent.remove(object);
                object.geometry.dispose();
            }
        });
        return cut;
    }

    // Quads into flat position/normal/uv arrays. add(a, b, c, d, n, uv): corners in order
    // round the quad (world metres), wound to face `n`; uv(p) maps a corner to the texture.
    function quadSink() {
        const sink = { position: [], normal: [], uv: [] };
        sink.add = (a, b, c, d, n, uv) => {
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const facing = (((u[1] * v[2]) - (u[2] * v[1])) * n[0]) + (((u[2] * v[0]) - (u[0] * v[2])) * n[1])
                + (((u[0] * v[1]) - (u[1] * v[0])) * n[2]);
            (facing >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]).forEach((p) => {
                sink.position.push(p[0], p[1], p[2]);
                sink.normal.push(n[0], n[1], n[2]);
                const t = uv(p);
                sink.uv.push(t[0], t[1]);
            });
        };
        // an axis-aligned box's faces, bar those named in `skip` ('x-', 'y+'...)
        sink.box = (x0, x1, y0, y1, z0, z1, uvFor, skip) => {
            const faces = {
                'x-': [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
                'x+': [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]],
                'y-': [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
                'y+': [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]],
                'z-': [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]],
                'z+': [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]]
            };
            Object.keys(faces).forEach((key) => {
                if ((skip || []).includes(key)) return;
                const [a, b, c, d, n] = faces[key];
                sink.add(a, b, c, d, n, uvFor(n));
            });
        };
        return sink;
    }

    // restoneShells' texture projection: along the face's main axis, `metres` per UV unit.
    function worldUv(n, metres, shift) {
        const ax = Math.abs(n[0]);
        const ay = Math.abs(n[1]);
        const az = Math.abs(n[2]);
        const s = shift || 0;
        if (ax >= ay && ax >= az) return (p) => [(p[2] / metres) + s, (p[1] / metres) + s];
        if (az >= ay) return (p) => [(p[0] / metres) + s, (p[1] / metres) + s];
        return (p) => [(p[0] / metres) + s, (p[2] / metres) + s];
    }

    // Takes the gates and the side lancets' ironwork and glass out, and builds their walls:
    // one mesh in the shell's stone (the holes, the doorway, its frame), one in the apse's
    // (the lancets' slabs). `stone`: the shell's stone (restoneShells). Returns the count
    // of new triangles.
    function wallUpOpenings(root, THREEjs, stone) {
        if (!stone) return 0;
        // the gates: their bars stand in the holes, up to a metre in front of the wall
        const inHole = (x, y, z) => GATE_HOLES.some((h) => {
            const out = Math.sign(h.inner - h.outer);
            const d = (x - h.outer) * out;
            return d > -0.1 && d < Math.abs(h.inner - h.outer) + 1 && z > h.z0 - 0.3 && z < h.z1 + 0.3;
        });
        dropTriangles(root, /^concrete_floor_02\.005$/, inHole);
        // the lancets' lattices and glass: within 0.3 m of the old grille's plane
        const inLancet = (x, y, z) => y < 8 && LANCETS.some((l) => {
            const dx = x - l.x;
            const dz = z - l.z;
            return Math.abs((dx * l.nx) + (dz * l.nz)) < 0.3 && Math.abs((dx * l.nz) - (dz * l.nx)) < 1.45;
        });
        const lattices = dropTriangles(root, /^metal|glass/i, inLancet);
        // the apse's stone: the wall mesh beside the ironwork (the same node's other part)
        let apseStone = null;
        lattices.forEach(({ parent }) => {
            const wall = parent && parent.children.find((c) => c.isMesh && !Array.isArray(c.material)
                && /^medieval_blocks/i.test(c.material.name || '') && c.material.map);
            if (wall && !apseStone) apseStone = wall.material;
        });

        // The holes: the wall's face to the nave and its back face, less the doorway; the
        // doorway's jambs and lintel through the wall's thickness; its frame on the nave side.
        const walls = quadSink();
        GATE_HOLES.forEach((h) => {
            const door = h.doorway || SIDE_DOORWAY;   // this hole's opening, if it keeps one
            const s = Math.sign(h.inner - h.outer);   // toward the nave along x
            const zd0 = door.z - (door.width / 2);
            const zd1 = door.z + (door.width / 2);
            const rects = h.door
                ? [[h.z0, zd0, h.y0, h.y1], [zd1, h.z1, h.y0, h.y1], [zd0, zd1, door.height, h.y1]]
                : [[h.z0, h.z1, h.y0, h.y1]];
            [[h.inner, [s, 0, 0]], [h.outer, [-s, 0, 0]]].forEach(([x, n]) => rects.forEach(([z0, z1, y0, y1]) => {
                walls.add([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], n, worldUv(n, SHELL_UV_METRES));
            }));
            if (!h.door) return;
            const xa = Math.min(h.inner, h.outer);
            const xb = Math.max(h.inner, h.outer);
            const top = door.height;
            const wallUv = (n) => worldUv(n, SHELL_UV_METRES);
            walls.add([xa, -0.05, zd0], [xb, -0.05, zd0], [xb, top, zd0], [xa, top, zd0], [0, 0, 1], wallUv([0, 0, 1]));
            walls.add([xa, -0.05, zd1], [xb, -0.05, zd1], [xb, top, zd1], [xa, top, zd1], [0, 0, -1], wallUv([0, 0, -1]));
            walls.add([xa, top, zd0], [xb, top, zd0], [xb, top, zd1], [xa, top, zd1], [0, -1, 0], wallUv([0, -1, 0]));
            // the frame: two jambs and a lintel standing proud of the wall's nave face
            const f = DOOR_FRAME;
            const frameUv = (n) => worldUv(n, f.uvMetres, f.uvShift);
            const against = s < 0 ? 'x+' : 'x-';      // the face lying on the wall
            const span = (out) => [Math.min(h.inner, h.inner + (s * out)), Math.max(h.inner, h.inner + (s * out))];
            const [jx0, jx1] = span(f.jambOut);
            walls.box(jx0, jx1, 0, top, zd0 - f.jamb, zd0, frameUv, [against, 'y-', 'y+']);
            walls.box(jx0, jx1, 0, top, zd1, zd1 + f.jamb, frameUv, [against, 'y-', 'y+']);
            const [lx0, lx1] = span(f.lintelOut);
            walls.box(lx0, lx1, top, top + f.lintel, zd0 - f.jamb - f.over, zd1 + f.jamb + f.over, frameUv, [against]);
        });

        // The lancets: one slab each, facing into the apse, in the apse's blocks.
        const slabs = quadSink();
        if (lattices.length) {
            LANCETS.forEach((l) => {
                // along the wall, away from the nave's middle (the way the apse's U runs)
                let ox = l.nz;
                let oz = -l.nx;
                if (ox * (l.x - NAVE_X) < 0) {
                    ox = -ox;
                    oz = -oz;
                }
                const S = LANCET_SLAB;
                const cx = l.x - (l.nx * S.back);
                const cz = l.z - (l.nz * S.back);
                const at = (a, y) => [cx + (ox * a), y, cz + (oz * a)];
                const uv = (p) => [APSE_UV.u0 + (APSE_UV.u * (((p[0] - cx) * ox) + ((p[2] - cz) * oz))), APSE_UV.v0 + (APSE_UV.v * p[1])];
                slabs.add(at(-S.half, S.y0), at(S.half, S.y0), at(S.half, S.y1), at(-S.half, S.y1), [l.nx, 0, l.nz], uv);
            });
        }

        // Built in world metres, hung under the model's root like the rest of the set.
        const inverse = root.matrixWorld.clone().invert();
        let triangles = 0;
        [[walls, stone, 'walled-up gates'], [slabs, apseStone || stone, 'walled-up lancets']].forEach(([sink, material, name]) => {
            if (!sink.position.length) return;
            const geometry = new THREEjs.BufferGeometry();
            geometry.setAttribute('position', new THREEjs.Float32BufferAttribute(sink.position, 3));
            geometry.setAttribute('normal', new THREEjs.Float32BufferAttribute(sink.normal, 3));
            geometry.setAttribute('uv', new THREEjs.Float32BufferAttribute(sink.uv, 2));
            geometry.applyMatrix4(inverse);
            geometry.computeBoundingSphere();
            const mesh = new THREEjs.Mesh(geometry, material);
            mesh.name = name;
            root.add(mesh);
            triangles += sink.position.length / 9;
        });
        root.updateMatrixWorld(true);
        return triangles;
    }

    function prepareMaterials(root, THREEjs, dark) {
        const seen = new Set();
        let baked = 0;
        cache.flames = [];
        cache.materials = [];
        root.traverse((object) => {
            if (!object.isMesh) return;
            // Torch flames are lights, not stone: they are not baked and stay bright.
            if (/^X_fire/.test(object.name)) {
                object.material = new THREEjs.MeshBasicMaterial({
                    color: 0xff6a12, transparent: true, opacity: 0.55,
                    blending: THREEjs.AdditiveBlending, depthWrite: false, fog: true
                });
                object.matrixAutoUpdate = false;
                object.userData.sharedGeometry = true;
                cache.flames.push(object);
                return;
            }
            object.matrixAutoUpdate = false;
            object.castShadow = false;
            object.receiveShadow = false;
            object.userData.sharedGeometry = true;
            const geometry = object.geometry;
            if (geometry.attributes.color && !geometry.attributes.bakedLight) {
                geometry.setAttribute('bakedLight', geometry.attributes.color);
                geometry.deleteAttribute('color');
                baked += 1;
            }
            const hasBakedLight = Boolean(geometry.attributes.bakedLight);
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
                if (!material || seen.has(material.uuid)) return;
                seen.add(material.uuid);
                prepareMaterial(material, THREEjs, dark);
                if (hasBakedLight) injectBakedLight(material);
                cache.materials.push(material);
            });
        });
        return baked;
    }

    // Six pieces of the export (the arcades, the apse, the side walls) hold 800k of its
    // 1M triangles, and a mesh is drawn whole as soon as any of it is in view, which
    // from inside the nave is always. They are cut into 8 m blocks, so the blocks
    // behind the player are skipped: over 30 poses across the nave 42% fewer of their
    // triangles are drawn, for about five more draw calls. Nothing changes on screen.
    const BLOCK_SIZE = 8;               // m
    const BLOCK_MIN_TRIANGLES = 20000;
    const BLOCK_MIN_RADIUS = 5;         // m

    function splitLargeMeshes(root, THREEjs) {
        const large = [];
        root.traverse((object) => {
            const geometry = object.isMesh ? object.geometry : null;
            if (!geometry || !geometry.index || geometry.groups.length) return;
            if (geometry.index.count / 3 < BLOCK_MIN_TRIANGLES || Object.keys(geometry.morphAttributes).length) return;
            if (Object.values(geometry.attributes).some((attribute) => attribute.isInterleavedBufferAttribute)) return;
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
            if (geometry.boundingSphere.radius * object.matrixWorld.getMaxScaleOnAxis() < BLOCK_MIN_RADIUS) return;
            large.push(object);
        });
        large.forEach((mesh) => {
            const geometry = mesh.geometry;
            const index = geometry.index.array;
            const position = geometry.attributes.position.array;
            const e = mesh.matrixWorld.elements;
            // Every triangle goes to the block under its centre (world x, z).
            const blocks = new Map();
            for (let t = 0; t < index.length; t += 3) {
                const a = index[t] * 3;
                const b = index[t + 1] * 3;
                const c = index[t + 2] * 3;
                const x = (position[a] + position[b] + position[c]) / 3;
                const y = (position[a + 1] + position[b + 1] + position[c + 1]) / 3;
                const z = (position[a + 2] + position[b + 2] + position[c + 2]) / 3;
                const key = `${Math.floor(((e[0] * x) + (e[4] * y) + (e[8] * z) + e[12]) / BLOCK_SIZE)},`
                    + `${Math.floor(((e[2] * x) + (e[6] * y) + (e[10] * z) + e[14]) / BLOCK_SIZE)}`;
                if (!blocks.has(key)) blocks.set(key, []);
                blocks.get(key).push(t);
            }
            if (blocks.size < 2) return;
            const remap = new Int32Array(geometry.attributes.position.count).fill(-1);
            let part = 0;
            blocks.forEach((triangles) => {
                const used = [];
                const blockIndex = new Uint32Array(triangles.length * 3);
                triangles.forEach((t, i) => {
                    for (let k = 0; k < 3; k += 1) {
                        const vertex = index[t + k];
                        if (remap[vertex] < 0) {
                            remap[vertex] = used.length;
                            used.push(vertex);
                        }
                        blockIndex[(i * 3) + k] = remap[vertex];
                    }
                });
                const block = new THREEjs.BufferGeometry();
                Object.keys(geometry.attributes).forEach((name) => {
                    const source = geometry.attributes[name];
                    const size = source.itemSize;
                    const array = new source.array.constructor(used.length * size);
                    used.forEach((vertex, n) => {
                        for (let c = 0; c < size; c += 1) array[(n * size) + c] = source.array[(vertex * size) + c];
                    });
                    block.setAttribute(name, new THREEjs.BufferAttribute(array, size, source.normalized));
                });
                block.setIndex(new THREEjs.BufferAttribute(used.length > 65535 ? blockIndex : new Uint16Array(blockIndex), 1));
                block.computeBoundingSphere();
                used.forEach((vertex) => { remap[vertex] = -1; });
                const piece = new THREEjs.Mesh(block, mesh.material);
                part += 1;
                piece.name = `${mesh.name}-block${part}`;
                piece.matrix.copy(mesh.matrix);
                piece.matrixAutoUpdate = false;
                piece.userData.sharedGeometry = true;
                mesh.parent.add(piece);
            });
            mesh.parent.remove(mesh);
            geometry.dispose();
        });
        root.updateMatrixWorld(true);
    }

    function load() {
        if (cache.promise) {
            return cache.promise;
        }
        cache.promise = Promise.all([readJson(NAV_PATH), readBinary(MODEL_PATH)])
            .then(([nav, buffer]) => parseModel(buffer).then((gltf) => {
                const THREEjs = window.THREE;
                const root = gltf.scene;
                // glTF is Y-up: a Blender point (bx, by, bz) arrives at (bx, bz, -by).
                // Shift it so the grid corner (x0, y1, floor) is the world origin.
                root.scale.setScalar(SCALE);
                root.position.set(-nav.region.x[0] * SCALE, -nav.floorZ * SCALE, nav.region.y[1] * SCALE);
                root.updateMatrixWorld(true);
                const shellStone = restoneShells(root, THREEjs);
                // (a failure here leaves the gates up, never the whole cathedral down)
                try {
                    cache.walledUp = wallUpOpenings(root, THREEjs, shellStone);
                } catch (error) {
                    console.warn('[cathedral] the gates and lancets could not be walled up:', error);
                }
                const bakedMeshes = prepareMaterials(root, THREEjs, Boolean(nav.dark));
                splitLargeMeshes(root, THREEjs);
                cache.model = root;
                cache.nav = nav;
                cache.transform = makeTransform(nav);
                cache.bakedMeshes = bakedMeshes;
                return cache;
            }))
            .catch((error) => {
                console.warn('[cathedral] load failed, falling back to the built levels:', error);
                cache.failed = true;
                cache.promise = null;
                return null;
            });
        return cache.promise;
    }

    // ------------------------------------------------------------ the vigils
    //
    // Every vigil is walked in this one cathedral, the way the rendered scenes are.
    // What changes is the hour: how much of the torchlight is still burning, how
    // thick the dark is, and where the relics, the candle stands and the Demoness's
    // nooks are. The last vigil turns the stone red.

    const VIGILS = [
        // The cathedral is dark: no torches, a barely-there cold fill, and candle stands
        // the player lights. Later hours leave fewer candles, a thinner fill and
        // thicker dark.
        // `fill` is a faint night-sky hemisphere light (world.js): the ambient alone sits
        // under the ACES tone curve's toe and comes out as exactly 0, so without it every
        // wall out of the lantern's and candles' reach was pure black (Shaun: "walls that
        // are just complete black. please don't do that"). It keeps unlit stone a dim,
        // readable silhouette (~8-15/255 up close); the candle pools stay far brighter.
        { id: 'vespers', nameKey: 'level.name_1', light: 1, candles: 8, fog: 0x010103, fogDensity: 0.07, ambient: 0x3a4a80, ambientIntensity: 0.009, fill: 0.05, fillSky: 0x8090c0, fillGround: 0x3a4058, candleColor: 0xffa24a },
        { id: 'compline', nameKey: 'level.name_2', light: 1, candles: 7, fog: 0x010103, fogDensity: 0.075, ambient: 0x34427a, ambientIntensity: 0.008, fill: 0.049, fillSky: 0x7c8cbc, fillGround: 0x384056, candleColor: 0xffa24a },
        { id: 'matins', nameKey: 'level.name_3', light: 1, candles: 6, fog: 0x010102, fogDensity: 0.08, ambient: 0x2e3b6e, ambientIntensity: 0.007, fill: 0.048, fillSky: 0x7888b8, fillGround: 0x363e54, candleColor: 0xffb25e },
        { id: 'lauds', nameKey: 'level.name_4', light: 1, candles: 5, fog: 0x010102, fogDensity: 0.085, ambient: 0x2a3666, ambientIntensity: 0.006, fill: 0.047, fillSky: 0x7484b4, fillGround: 0x343c52, candleColor: 0xffb05a },
        { id: 'prime', nameKey: 'level.name_5', light: 1, candles: 4, fog: 0x000001, fogDensity: 0.09, ambient: 0x26315c, ambientIntensity: 0.005, fill: 0.046, fillSky: 0x7080b0, fillGround: 0x323a50, candleColor: 0xff9a40 },
        { id: 'lastrite', nameKey: 'level.name_6', light: 1, candles: 3, fog: 0x050001, fogDensity: 0.09, ambient: 0x4a1020, ambientIntensity: 0.007, fill: 0.05, fillSky: 0xa06a78, fillGround: 0x442830, candleColor: 0xff6a3a }
    ];

    // Without the height field (grid fallback), relics lie at most this many cells
    // (1 cell = 1 m) from a candle stand.
    const RELIC_REACH = 3;

    // Relics rest on what is really there (parkour.js's height field, 0.25 m apart): the
    // flat tops of tables, tombs and plinths, and the floor at the foot of walls,
    // pillars and furniture — never in the air, never out on the open floor. They are
    // taken with or without candlelight, so they are spread over the whole cathedral:
    // its length cut into RELIC_BANDS bands that each get an even share, the side aisles
    // behind the pillars favoured (AISLE_WEIGHT), so leaving the centre line pays.
    const RELIC_SPACING = 2.2;
    const RELICS_BY_VIGIL = [18, 18, 18, 18, 18, 18];
    const SURFACE_WEIGHT = { furniture: 3, floor: 2, plinth: 1.5 };
    const AISLE_WEIGHT = 1.3;
    const RELIC_BANDS = 8;
    const RELIC_ROWS = [5, 43];   // metres along the nave where relics may lie
    // Reliquaries (world.js reliquaryValue relics each) stand on the tops of the tall
    // props, higher than the arms reach from the floor (world.js relicReachUp), that a
    // chain of climbs really gets to (climbMap); one per prop, a different set each vigil.
    const RELIQUARIES_BY_VIGIL = [2, 2, 3, 3, 4, 4];
    // Wall ledges (wallLedges.js): a stone corbel shelf built into a nave side wall with
    // a high-value relic hanging over it, too high to take from the floor even at a
    // jump's peak. The route is prop top -> jump -> ledge -> take it, so a spot is only
    // offered where one of the climb-proven summits above stands within a jump of the
    // shelf. This many per vigil, a different set each vigil.
    const LEDGES_BY_VIGIL = [3, 3, 4, 4, 4, 4];
    const LEDGE_SPACING = 2.5;    // metres between two ledges
    const LEDGE_ROWS = [15, 42];  // where along the nave a ledge may be built
    // The altar end of the LEFT wall is left alone: a new room opens off it there.
    const LEDGE_LEFT_FROM = 16;
    // The right wall by the altar carries the side door and its corridor (door.js).
    const LEDGE_RIGHT_SKIP = [6, 14];
    // Hiding spots: a low oak table (models.js makeHideout) with a cross or book lying
    // under it that only a player lying down reaches (world.js hideoutGap). This many
    // per vigil, in the side aisles along their length (never the nave's centre lane,
    // the main route), on flat open floor with a clear lane beside them, away from the
    // candle stands, the other relics and the fixed spots; a different place each vigil.
    const HIDEOUTS_BY_VIGIL = [1, 1, 2, 2, 2, 2];
    const HIDEOUT = { width: 0.95, length: 2.0, clearAround: 0.6, lane: 1.3, spacing: 12 };
    // Candle stands: one per stretch of these metres along the nave, sides alternating
    // about its centre line (x = NAVE_X m).
    const STAND_ROWS = [6, 42];
    const NAVE_X = 12;
    // What the placement assumes of the player's body when world.js passes no CONFIG.
    const BODY = { stepHeight: 0.35, mantleHeight: 1.1, bodyHeight: 1.75, relicReachUp: 0.9, relicPickRange: 1.6 };

    // Anything taller than a step within 1.5 m of a point (a stand keeps clear of the
    // tall props, whose foot is where a climb starts).
    function nearProp(point) {
        const at = NW.Parkour && NW.Parkour.fieldAt;
        if (!at) return false;
        for (let dz = -1.5; dz <= 1.5; dz += 0.25) {
            for (let dx = -1.5; dx <= 1.5; dx += 0.25) {
                if (Math.hypot(dx, dz) > 1.5) continue;
                const sample = at(point.x + dx, point.z + dz);
                if (sample && sample.ground > 0.35) return true;
            }
        }
        return false;
    }

    // The walkable heart of the building: the nave, its aisles and the apse. Outside
    // these the export still has floor, but nothing the renders ever show.
    const PLAY = { col0: 5, col1: 18, row0: 2, row1: 44 };
    // The apse's round wall (its centre, the radius of its face to the nave, m): the 1 m
    // cells of the first `rows` rows whose middle lies in it or behind it are stone for the
    // girls, who would otherwise wait and walk in the dark behind the walled-up lancets.
    const APSE = { x: 12, z: 11.85, face: 9.9, rows: 7 };
    const ALTAR_CELL = { x: 12, z: 4 };   // the step in front of the carved throne
    const START_CELL = { x: 12, z: 42 };  // the far end of the nave, by the doors
    const NUN_CELL = { x: 12, z: 44 };

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

    // config: world.js CONFIG (the body's size and climbing reach, relicReachUp).
    function buildLevel(phase, config) {
        if (!cache.nav) {
            return null;
        }
        const nav = cache.nav;
        const index = Math.max(0, Math.min(VIGILS.length - 1, (Number(phase) || 1) - 1));
        const vigil = VIGILS[index];
        const random = makeRandom((index + 1) * 90001);

        const rows = nav.grid.map((row, z) => row.split('').map((ch, x) => {
            const inside = x >= PLAY.col0 && x <= PLAY.col1 && z >= PLAY.row0 && z <= PLAY.row1;
            const behindApse = z < APSE.rows && Math.hypot((x + 0.5) - APSE.x, (z + 0.5) - APSE.z) >= APSE.face;
            return inside && !behindApse ? ch : '#';
        }));
        const open = [];
        for (let z = 0; z < rows.length; z += 1) {
            for (let x = 0; x < rows[z].length; x += 1) {
                if (rows[z][x] === '.') open.push({ x, z });
            }
        }
        if (!open.length) {
            return null;
        }

        // Walk outwards until a free cell turns up, so a fixed spot never lands in stone.
        const nearestOpen = (cell) => {
            let best = null;
            let bestDistance = Infinity;
            open.forEach((spot) => {
                const distance = ((spot.x - cell.x) ** 2) + ((spot.z - cell.z) ** 2);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = spot;
                }
            });
            return best;
        };

        const fixed = [];
        const stamp = (cell, ch) => {
            if (!cell) return null;
            rows[cell.z][cell.x] = ch;
            fixed.push(cell);
            return cell;
        };
        // Spots of one kind keep their distance from each other and from the fixed
        // points (altar, start, the Nun's door); different kinds may share a corner.
        const farEnough = (cell, others, minimum) => [].concat(fixed, others)
            .every((other) => Math.hypot(other.x - cell.x, other.z - cell.z) >= minimum);

        const altar = stamp(nearestOpen(ALTAR_CELL), 'A');
        const start = stamp(nearestOpen(START_CELL), 'S');
        const nunCell = stamp(nearestOpen(NUN_CELL), 'N');

        // Relics, candle stands and dark nooks, spread out and shuffled per vigil.
        const shuffled = open.slice();
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const place = (count, ch, minimum, test) => {
            const placed = [];
            for (let i = 0; i < shuffled.length && placed.length < count; i += 1) {
                const cell = shuffled[i];
                if (rows[cell.z][cell.x] !== '.') continue;
                if (!farEnough(cell, placed, minimum)) continue;
                if (test && !test(cell)) continue;
                rows[cell.z][cell.x] = ch;
                placed.push(cell);
            }
            return placed;
        };

        const aisle = (cell) => Math.abs(cell.x - 12) >= 3;       // out of the centre lane
        const cellSize = nav.cellBU * SCALE;
        const centre = (cell) => ({ x: (cell.x + 0.5) * cellSize, z: (cell.z + 0.5) * cellSize });
        // candle stands: the only real light in the building (and the only refuge from
        // the Demoness), one per stretch of the nave, on alternate sides of it, so
        // keeping near the light zig-zags the route across the aisles. They keep clear
        // of the tall props, whose foot is where a climb starts.
        const standCount = vigil.candles || 6;
        const firstSide = random() < 0.5 ? -1 : 1;
        const stands = [];
        for (let k = 0; k < standCount; k += 1) {
            const z0 = STAND_ROWS[0] + (((STAND_ROWS[1] - STAND_ROWS[0]) * k) / standCount);
            const z1 = STAND_ROWS[0] + (((STAND_ROWS[1] - STAND_ROWS[0]) * (k + 1)) / standCount);
            const side = k % 2 === 0 ? firstSide : -firstSide;
            const inBand = (cell) => cell.z + 0.5 >= z0 && cell.z + 0.5 < z1 && farEnough(cell, stands, 5)
                && !nearProp(centre(cell));
            let found = place(1, 'c', 5, (cell) => inBand(cell) && ((cell.x + 0.5) - NAVE_X) * side >= 1.5);
            if (!found.length) found = place(1, 'c', 5, inBand);
            stands.push(...found);
        }
        place(6, 'd', 7, aisle);         // the Demoness's nooks: behind the pillars
        // relics: taken with or without candlelight, so spread over the whole building
        // on real surfaces; the reliquaries on the tall props' tops. Without the height
        // field, on the floor of a grid cell by a stand (world.js).
        const fixedPoints = [altar, start, nunCell].filter(Boolean).map(centre);
        const spots = surfaceSpots(rows, fixedPoints, config);
        // Wall ledges (wallLedges.js builds them) go in first: they are stone, the
        // building's own, and the relics scatter round them rather than under them.
        const wallLedges = spots && spots.length
            ? placeWallLedges(LEDGES_BY_VIGIL[index], random, rows, spots,
                [].concat(fixedPoints, stands.map(centre)), config)
            : [];
        let relics = null;
        if (spots && spots.length) {
            relics = [];
            const lay = (spot, reliquary) => {
                // (a relic's long side lies along its z at yaw 0: models.js makeRelic)
                const lie = spot.along === 'x' ? Math.PI / 2 : 0;
                const yaw = spot.along ? lie + ((random() - 0.5) * 0.5) + (random() < 0.5 ? Math.PI : 0) : random() * Math.PI * 2;
                relics.push({ x: spot.x, z: spot.z, y: spot.y, kind: spot.kind, yaw, reliquary });
            };
            // Reliquaries: a few of the climbable tops, each on its own prop, at (or
            // near) the highest point of it.
            const props = [];
            spots.filter((spot) => spot.kind === 'summit').forEach((spot) => {
                const prop = props.find((other) => other.id === spot.prop);
                if (prop) prop.spots.push(spot);
                else props.push({ id: spot.prop, spots: [spot], key: random() });
            });
            props.sort((a, b) => b.key - a.key);
            props.slice(0, RELIQUARIES_BY_VIGIL[index]).forEach((prop) => {
                const peak = Math.max(...prop.spots.map((s) => s.y));
                const tops = prop.spots.filter((s) => s.y >= peak - 0.15);
                let top = tops[Math.floor(random() * tops.length)];
                // a prop that collides as a box (parkour.js): the middle of its top, where
                // a statue's crown is, not a corner of the box in the air beside it
                const box = NW.Parkour && NW.Parkour.boxAt ? NW.Parkour.boxAt(top.x, top.z) : null;
                if (box) {
                    top = tops.reduce((best, s) => (Math.hypot(s.x - box.x, s.z - box.z) < Math.hypot(best.x - box.x, best.z - box.z) ? s : best), top);
                }
                lay(top, true);
            });
            // The common relics, an even share per stretch of the nave.
            const want = RELICS_BY_VIGIL[index];
            const bandLength = (RELIC_ROWS[1] - RELIC_ROWS[0]) / RELIC_BANDS;
            const bandOf = (spot) => Math.max(0, Math.min(RELIC_BANDS - 1, Math.floor((spot.z - RELIC_ROWS[0]) / bandLength)));
            const perBand = new Array(RELIC_BANDS).fill(0);
            const ordered = spots
                .filter((spot) => spot.kind !== 'summit')
                .map((spot) => ({
                    spot,
                    key: random() * SURFACE_WEIGHT[spot.kind] * (Math.abs(spot.x - NAVE_X) >= 3.5 ? AISLE_WEIGHT : 1)
                }))
                .sort((a, b) => b.key - a.key);
            const common = relics.length;
            [Math.ceil(want / RELIC_BANDS), Infinity].forEach((quota) => {
                for (let i = 0; i < ordered.length && relics.length - common < want; i += 1) {
                    const spot = ordered[i].spot;
                    if (perBand[bandOf(spot)] >= quota) continue;
                    if (relics.some((other) => Math.hypot(other.x - spot.x, other.z - spot.z) < RELIC_SPACING)) continue;
                    // not under a wall ledge's pier, and not so close to one that its own
                    // relic and this one answer the same crosshair
                    if (wallLedges.some((ledge) => Math.hypot(ledge.x - spot.x, ledge.z - spot.z) < 1.6)) continue;
                    perBand[bandOf(spot)] += 1;
                    lay(spot, false);
                }
            });
        } else {
            const byStand = (cell) => stands.some((stand) => Math.hypot(stand.x - cell.x, stand.z - cell.z) <= RELIC_REACH);
            place(16, 'r', 3, byStand);
        }
        // Hiding spots (with a relic under each), once the relics lie where they lie.
        const hideouts = relics
            ? placeHideouts(HIDEOUTS_BY_VIGIL[index], random, rows, stands.map(centre), relics,
                [].concat(fixedPoints, wallLedges))
            : [];

        return {
            id: `cathedral_${vigil.id}`,
            nameKey: vigil.nameKey,
            environment: 'cathedral',
            cellSize: nav.cellBU * SCALE,
            vigilIndex: index,
            theme: {
                bakedLight: vigil.light,
                fogColor: vigil.fog,
                fogDensity: vigil.fogDensity,
                ambientColor: vigil.ambient,
                ambientIntensity: vigil.ambientIntensity,
                fill: vigil.fill,
                fillSky: vigil.fillSky,
                fillGround: vigil.fillGround,
                candleColor: vigil.candleColor,
                ceilingHeight: 9
            },
            altarCell: altar,
            // The altar's own point in metres (world.js: its reach, its aura, Jane's goal):
            // the carved throne stands on the nave's centre line, which runs between two
            // grid cells, not in the middle of the altar's cell (half a metre east of it).
            altarPoint: altar ? { x: NAVE_X, z: centre(altar).z } : null,
            startCell: start,
            // { x, z, y, kind, yaw } in metres, each on its surface (null: grid cells)
            relics,
            // [{ x, z, yaw, width, length }]: the hiding-spot tables (world.js builds and
            // stamps them; their relics are in `relics`, marked `hidden`)
            hideouts,
            // [{ x, z, d, wall, edge, from }]: the wall ledges (wallLedges.js builds
            // them, and hangs their own high-value relics; they are not in `relics`)
            wallLedges,
            // every surface a relic could rest on (surfaceSpots; null without the height
            // field): door.js lays the side door's key on a free one
            surfaceSpots: spots,
            map: rows.map((row) => row.join(''))
        };
    }

    // `count` wall ledges (wallLedges.js) for this vigil: a stone shelf built into a nave
    // side wall, LEDGE.top metres up, with a high-value relic hanging over it. A spot is
    // only offered where (a) wallLedges.fits says the wall, the floor round the pier and
    // the air round the relic allow it — nothing beside the shelf that could be mantled
    // from the floor, nothing near the relic high enough to take it from — and (b) one of
    // the climb-proven summits in `spots` (the same tops the reliquaries stand on) is
    // within a jump of where the body lands on the shelf. So the only way up is the one
    // Shaun asked for: onto a prop, then onto the wall. Clear of the candle stands, the
    // relics already laid and the fixed spots (`avoid`), LEDGE_SPACING apart, and away
    // from the altar end of the left wall and the side door's stretch of the right one.
    // Returns [{ x, z, d, wall, from }] in metres (x, z: the middle of the slab).
    function placeWallLedges(count, random, rows, spots, avoid, config) {
        const WL = NW.WallLedges;
        const at = NW.Parkour && NW.Parkour.fieldAt;
        if (!WL || !WL.fits || !at || !count) return [];
        // every climb-proven summit cell, not just each prop's crown: the player jumps
        // from the corner of the top nearest the wall, not from its highest point
        const tops = (spots || []).filter((spot) => spot.kind === 'summit');
        const jump = WL.jumpFrom(config);
        const LEDGE = WL.LEDGE;
        const openCell = (x, z) => {
            const row = rows[Math.floor(z)];
            return Boolean(row) && row[Math.floor(x)] !== undefined && row[Math.floor(x)] !== '#';
        };
        // Where the WALKABLE floor stops on this side at this z: out from the centre line
        // until the height field goes blocked. This is NOT the wall — it stops most of a
        // metre short of it — so the ledge needs both: wallLedges.wallFace raycasts the
        // real stone to put the shelf's back face flush on it (Shaun: "the pillars ...
        // are not on the walls but they should be; there is a lot of space between the
        // pillars and the walls"), and this edge says how far the usable shelf must
        // reach back for a body to stand on it.
        const edgeAt = (z, d) => {
            let x = NAVE_X;
            for (let k = 0; k < 200; k += 1) {
                const next = x - (d * 0.05);
                if (!at(next, z)) return Math.abs(next - NAVE_X) >= 5.5 ? next : null;
                x = next;
            }
            return null;
        };
        const candidates = [];
        const half = LEDGE.width / 2;
        [-1, 1].forEach((d) => {
            for (let z = LEDGE_ROWS[0]; z <= LEDGE_ROWS[1]; z += 0.5) {
                if (d > 0 && z < LEDGE_LEFT_FROM) continue;
                if (d < 0 && z >= LEDGE_RIGHT_SKIP[0] && z <= LEDGE_RIGHT_SKIP[1]) continue;
                const edge = edgeAt(z, d);
                if (edge == null) continue;
                const wall = WL.wallFace(z, d);
                if (wall == null || (wall - edge) * d > -0.02) continue;   // the wall must be outside the floor's edge
                // the wall and the floor's edge must both be straight behind the slab
                const eA = edgeAt(z - half, d);
                const eB = edgeAt(z + half, d);
                const wA = WL.wallFace(z - half, d);
                const wB = WL.wallFace(z + half, d);
                if (eA == null || eB == null || wA == null || wB == null) continue;
                if (Math.abs(eA - edge) > 0.15 || Math.abs(eB - edge) > 0.15) continue;
                if (Math.abs(wA - wall) > 0.05 || Math.abs(wB - wall) > 0.05) continue;
                const stand = WL.standPoint({ z, d, wall, edge });
                if (!openCell(stand.x, z)) continue;
                // the NEAREST qualifying summit cell, not the first: a long prop (the
                // refectory table) is jumped from the corner of its top by the wall
                let from = null;
                let best = Infinity;
                tops.forEach((top) => {
                    if (top.y < jump.minTop) return;
                    const run = Math.hypot(top.x - stand.x, top.z - stand.z);
                    if (run < jump.minRun || run > jump.maxRun || run >= best) return;
                    best = run;
                    from = top;
                });
                if (!from) continue;
                if (avoid.some((point) => Math.hypot(point.x - stand.x, point.z - stand.z) < 2.2)) continue;
                if (!WL.fits(z, d, wall, edge, config)) continue;
                const depth = WL.depthOf({ wall, edge });
                candidates.push({ x: wall + (d * (depth / 2)), z, d, wall, edge, from, key: random() });
            }
        });
        candidates.sort((p, q) => p.key - q.key);
        const placed = [];
        candidates.forEach((spot) => {
            if (placed.length >= count) return;
            if (placed.some((other) => Math.hypot(other.x - spot.x, other.z - spot.z) < LEDGE_SPACING)) return;
            placed.push({ x: spot.x, z: spot.z, d: spot.d, wall: spot.wall, edge: spot.edge, from: spot.from });
        });
        return placed;
    }

    // `count` hiding-spot tables in the side aisles, lengthwise along them, each on flat
    // open floor (HIDEOUT.clearAround metres all round it, and a lane HIDEOUT.lane wide
    // along one long side, so the aisle stays passable), clear of the candle stands
    // (`stands`), the relics already laid and the fixed spots (`avoid`), HIDEOUT.spacing
    // apart. Each gets a relic lying on the floor under its top, pushed into `relics`
    // with `hidden: true`. Returns [{ x, z, yaw, width, length }].
    function placeHideouts(count, random, rows, stands, relics, avoid) {
        const at = NW.Parkour && NW.Parkour.fieldAt;
        if (!at || !count) return [];
        const { width, length, clearAround, lane, spacing } = HIDEOUT;
        const flat = (x, z) => {
            const row = rows[Math.floor(z)];
            if (!row || row[Math.floor(x)] === undefined || row[Math.floor(x)] === '#') return false;
            const sample = at(x, z);
            return Boolean(sample) && Math.abs(sample.ground) < 0.05 && sample.clear > 2.2;
        };
        // (lengthwise along the aisle: its length on z, so the rectangle is axis-aligned
        // for the tests; the small turn given afterwards stays inside clearAround)
        const areaFlat = (x, z, u0, u1, v0, v1) => {
            for (let u = u0; u <= u1 + 1e-6; u += 0.25) {
                for (let v = v0; v <= v1 + 1e-6; v += 0.25) {
                    if (!flat(x + u, z + v)) return false;
                }
            }
            return true;
        };
        const rectDistance = (x, z, point) => Math.hypot(
            Math.max(0, Math.abs(point.x - x) - (width / 2)),
            Math.max(0, Math.abs(point.z - z) - (length / 2))
        );
        const halfW = width / 2;
        const halfL = length / 2;
        const candidates = [];
        for (let z = RELIC_ROWS[0] + 2; z <= RELIC_ROWS[1] - 2; z += 0.5) {
            for (let x = PLAY.col0 + 0.5; x <= PLAY.col1 + 0.5; x += 0.25) {
                if (Math.abs(x - NAVE_X) < 4) continue;   // the centre lane and its edges: the main route
                if (!areaFlat(x, z, -halfW - clearAround, halfW + clearAround, -halfL - clearAround, halfL + clearAround)) continue;
                const laneWest = areaFlat(x, z, -halfW - lane, -halfW, -halfL, halfL);
                const laneEast = areaFlat(x, z, halfW, halfW + lane, -halfL, halfL);
                if (!laneWest && !laneEast) continue;
                if (stands.some((stand) => rectDistance(x, z, stand) < 1.6)) continue;
                if (relics.some((relic) => rectDistance(x, z, relic) < 1.2)) continue;
                if (avoid.some((point) => rectDistance(x, z, point) < 4)) continue;
                candidates.push({ x, z, key: random() });
            }
        }
        candidates.sort((a, b) => b.key - a.key);
        const placed = [];
        for (let i = 0; i < candidates.length && placed.length < count; i += 1) {
            const c = candidates[i];
            if (placed.some((other) => Math.hypot(other.x - c.x, other.z - c.z) < spacing)) continue;
            const yaw = (random() < 0.5 ? 0 : Math.PI) + ((random() - 0.5) * 0.12);
            placed.push({ x: c.x, z: c.z, yaw, width, length });
            // the relic: on the floor under the top, a little off its middle
            const rx = c.x + ((random() - 0.5) * 0.2);
            const rz = c.z + ((random() - 0.5) * 0.7);
            const sample = at(rx, rz);
            relics.push({ x: rx, z: rz, y: sample ? sample.ground : 0, yaw: random() * Math.PI * 2, reliquary: false, hidden: true });
        }
        return placed;
    }

    // Where the player can get to on foot, on the 0.25 m cells of the height field: a
    // cell is a place to stand when the whole body's footprint (3 x 3 cells) is free of
    // stone and the head fits; from the floor he walks to any neighbour no more than a
    // step up (or any height down), and climbs to a place up to a bit less than
    // mantleHeight higher within 1.25 m, with nothing taller in between (parkour.js
    // tryClimb: mantle or a jump's grab). reaches(i, j, feet, range) says whether a
    // reached place with its feet at `feet` or higher lies within `range` metres.
    function climbMap(field, body) {
        const { cols, count, g, clear, openCell, x0, z0, res } = field;
        const stand = new Float32Array(cols * count).fill(NaN);
        for (let j = 1; j < count - 1; j += 1) {
            for (let i = 1; i < cols - 1; i += 1) {
                let top = -Infinity;
                for (let dj = -1; dj <= 1 && top !== null; dj += 1) {
                    for (let di = -1; di <= 1; di += 1) {
                        const v = g(i + di, j + dj);
                        if (Number.isNaN(v)) { top = null; break; }
                        top = Math.max(top, v);
                    }
                }
                if (top === null) continue;
                if (g(i, j) + clear[(j * cols) + i] < top + body.bodyHeight) continue;
                stand[(j * cols) + i] = top;
            }
        }
        const reached = new Uint8Array(cols * count);
        const queue = [];
        for (let j = 0; j < count; j += 1) {
            for (let i = 0; i < cols; i += 1) {
                const s = stand[(j * cols) + i];
                if (s <= body.stepHeight && openCell(x0 + ((i + 0.5) * res), z0 + ((j + 0.5) * res))) {
                    reached[(j * cols) + i] = 1;
                    queue.push(i, j);
                }
            }
        }
        const lineUnder = (i0, j0, i1, j1, height) => {
            const steps = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
            for (let k = 1; k < steps; k += 1) {
                const v = g(Math.round(i0 + (((i1 - i0) * k) / steps)), Math.round(j0 + (((j1 - j0) * k) / steps)));
                if (Number.isNaN(v) || v > height + 0.05) return false;
            }
            return true;
        };
        const REACH = 5;   // cells: 1.25 m
        for (let h = 0; h < queue.length; h += 2) {
            const i = queue[h];
            const j = queue[h + 1];
            const s = stand[(j * cols) + i];
            for (let dj = -REACH; dj <= REACH; dj += 1) {
                for (let di = -REACH; di <= REACH; di += 1) {
                    const ni = i + di;
                    const nj = j + dj;
                    if (ni < 0 || nj < 0 || ni >= cols || nj >= count) continue;
                    const index = (nj * cols) + ni;
                    const t = stand[index];
                    if (reached[index] || Number.isNaN(t)) continue;
                    const near = Math.abs(di) <= 1 && Math.abs(dj) <= 1;
                    const walk = near && t <= s + body.stepHeight;
                    const up = t > s + body.stepHeight && t <= s + (body.climbReach || (body.mantleHeight - 0.05))
                        && Math.hypot(di, dj) <= REACH && lineUnder(i, j, ni, nj, t);
                    if (!walk && !up) continue;
                    reached[index] = 1;
                    queue.push(ni, nj);
                }
            }
        }
        return {
            reaches(i, j, feet, range) {
                const r = Math.ceil(range / res);
                for (let dj = -r; dj <= r; dj += 1) {
                    for (let di = -r; di <= r; di += 1) {
                        if (Math.hypot(di, dj) * res > range) continue;
                        const ni = i + di;
                        const nj = j + dj;
                        if (ni < 0 || nj < 0 || ni >= cols || nj >= count) continue;
                        const index = (nj * cols) + ni;
                        if (reached[index] && stand[index] >= feet) return true;
                    }
                }
                return false;
            }
        };
    }

    // Every 0.25 m spot of the playable cathedral a relic could rest on, from the height
    // field: { x, z, y (the surface), kind: 'summit' | 'furniture' | 'plinth' | 'floor',
    // along: null | 'x' | 'z' (a narrow surface's length) }. Flat, with room above, not
    // by the fixed spots in `avoid`, and with floor beside it where the player can stand
    // within reach — or, for a summit (a top higher than the arms reach from the floor),
    // a place a chain of climbs gets to (climbMap). Null without the height field.
    function surfaceSpots(rows, avoid, config) {
        const at = NW.Parkour && NW.Parkour.fieldAt;
        if (!at) return null;
        const RES = 0.25;
        const x0 = PLAY.col0;
        const z0 = PLAY.row0;
        const cols = Math.round((PLAY.col1 + 1 - PLAY.col0) / RES);
        const count = Math.round((PLAY.row1 + 1 - PLAY.row0) / RES);
        const ground = new Float32Array(cols * count).fill(NaN);
        const clear = new Float32Array(cols * count);
        let any = false;
        for (let j = 0; j < count; j += 1) {
            for (let i = 0; i < cols; i += 1) {
                const sample = at(x0 + ((i + 0.5) * RES), z0 + ((j + 0.5) * RES));
                if (!sample) continue;
                ground[(j * cols) + i] = sample.ground;
                clear[(j * cols) + i] = sample.clear;
                any = true;
            }
        }
        if (!any) return null;
        const g = (i, j) => (i < 0 || j < 0 || i >= cols || j >= count ? NaN : ground[(j * cols) + i]);
        const openCell = (x, z) => {
            const row = rows[Math.floor(z)];
            return Boolean(row) && row[Math.floor(x)] !== undefined && row[Math.floor(x)] !== '#';
        };
        const body = Object.assign({}, BODY, config || {});
        // The props collide as boxes (parkour.js): a flat top, no longer the staircase of
        // bumps their voxelised shape made, so a tall one (the piano, a statue) is taken
        // the way the player really takes it — running and jumping at it, the hands
        // grabbing its edge at the jump's height (parkour.js GRAB_REACH) — not by a chain
        // of standing climbs.
        const grab = NW.Parkour && NW.Parkour.hasBoxes && NW.Parkour.hasBoxes() ? NW.Parkour.GRAB_REACH : 0;
        if (grab && body.jumpSpeed && body.gravity) {
            // (0.12 m under the very peak: taken in the jump's top third, not its last frame)
            body.climbReach = Math.max(body.mantleHeight - 0.05, ((body.jumpSpeed * body.jumpSpeed) / (2 * body.gravity)) + grab - 0.12);
        }
        const climb = climbMap({ ground, clear, cols, count, g, openCell, x0, z0, res: RES }, body);
        // which prop each raised cell belongs to (8-connected cells above a step)
        const prop = new Int32Array(cols * count).fill(-1);
        let props = 0;
        for (let start = 0; start < prop.length; start += 1) {
            if (prop[start] >= 0 || !(ground[start] > body.stepHeight)) continue;
            prop[start] = props;
            const stack = [start];
            while (stack.length) {
                const cell = stack.pop();
                const ci = cell % cols;
                const cj = (cell - ci) / cols;
                for (let dj = -1; dj <= 1; dj += 1) {
                    for (let di = -1; di <= 1; di += 1) {
                        const ni = ci + di;
                        const nj = cj + dj;
                        if (ni < 0 || nj < 0 || ni >= cols || nj >= count) continue;
                        const next = (nj * cols) + ni;
                        if (prop[next] >= 0 || !(ground[next] > body.stepHeight)) continue;
                        prop[next] = props;
                        stack.push(next);
                    }
                }
            }
            props += 1;
        }

        const spots = [];
        for (let j = 0; j < count; j += 1) {
            for (let i = 0; i < cols; i += 1) {
                const h = g(i, j);
                if (Number.isNaN(h) || clear[(j * cols) + i] < 0.35) continue;
                // flat enough to lay a book on, at least lengthwise (a pew seat or a
                // plinth is narrow): the neighbours on one axis within 3 cm
                const level = (v) => !Number.isNaN(v) && Math.abs(v - h) <= 0.03;
                let flatX = level(g(i - 1, j)) && level(g(i + 1, j));
                let flatZ = level(g(i, j - 1)) && level(g(i, j + 1));
                // up high, the crown of a statue will do: nothing around it higher, and
                // one neighbour as high (the reliquary lies along the pair)
                if (!flatX && !flatZ && h > body.relicReachUp) {
                    const side = [g(i - 1, j), g(i + 1, j), g(i, j - 1), g(i, j + 1)];
                    if (side.every((v) => !(v > h + 0.05))) {
                        flatX = Math.abs(side[0] - h) <= 0.08 || Math.abs(side[1] - h) <= 0.08;
                        flatZ = !flatX && (Math.abs(side[2] - h) <= 0.08 || Math.abs(side[3] - h) <= 0.08);
                    }
                }
                if (!flatX && !flatZ) continue;
                // the floor around it, and whether stone or something taller stands beside
                let floor = h;
                let beside = false;
                let lower = 0;
                let seen = 0;
                for (let dj = -3; dj <= 3; dj += 1) {
                    for (let di = -3; di <= 3; di += 1) {
                        const v = g(i + di, j + dj);
                        const near = Math.abs(di) <= 2 && Math.abs(dj) <= 2;
                        if (Number.isNaN(v)) {
                            if (near) beside = true;
                            continue;
                        }
                        seen += 1;
                        if (v < h - 0.1) lower += 1;
                        floor = Math.min(floor, v);
                        // stone, anything taller, or right at the foot of a plinth or a pew
                        if (near && v > h + 0.3) beside = true;
                        if (Math.abs(di) <= 1 && Math.abs(dj) <= 1 && v >= h + 0.15) beside = true;
                    }
                }
                // Rises count from the aisles' floor (the game's 0): the gutter down the
                // middle of the nave is below it, and its edge is no step to lay things on.
                const rise = h - Math.max(floor, 0);
                // a top stands up out of the floor around it
                const top = lower >= seen * 0.4;
                let kind = null;
                // higher than the arms reach from the floor: a summit, for a reliquary
                if (rise >= 0.3 && h > body.relicReachUp && top) kind = 'summit';
                else if (rise >= 0.3 && top) kind = 'furniture';
                else if (rise >= 0.12 && rise < 0.3 && top) kind = 'plinth';
                else if (Math.abs(h) < 0.05 && beside) kind = 'floor';
                if (!kind) continue;
                const x = x0 + ((i + 0.5) * RES);
                const z = z0 + ((j + 0.5) * RES);
                // the nave and its aisles, not the cramped apse corners or the doors
                if (z < RELIC_ROWS[0] || z > RELIC_ROWS[1]) continue;
                // on the floor: in a walkable cell of the grid, never in a wall's thickness
                if (kind === 'floor' && !openCell(x, z)) continue;
                if (avoid.some((point) => Math.hypot(point.x - x, point.z - z) < 2.5)) continue;
                // a summit: somewhere a chain of climbs gets to, close enough and high
                // enough for the arms (climbMap)
                if (kind === 'summit') {
                    if (climb.reaches(i, j, h - body.relicReachUp + 0.05, body.relicPickRange - 0.3)) {
                        spots.push({ x, z, y: h, kind, prop: prop[(j * cols) + i], along: flatX && flatZ ? null : (flatX ? 'x' : 'z') });
                    }
                    continue;
                }
                // somewhere to stand 0.5–1.2 m away: floor of an open grid cell, head room,
                // and no stone halfway
                let reachable = false;
                for (let dj = -5; dj <= 5 && !reachable; dj += 1) {
                    for (let di = -5; di <= 5 && !reachable; di += 1) {
                        const reach = Math.hypot(di, dj) * RES;
                        if (reach < 0.5 || reach > 1.2) continue;
                        const v = g(i + di, j + dj);
                        if (Number.isNaN(v) || v > floor + 0.08 || clear[((j + dj) * cols) + (i + di)] < 1.9) continue;
                        if (!openCell(x + (di * RES), z + (dj * RES))) continue;
                        if (Number.isNaN(g(i + Math.round(di / 2), j + Math.round(dj / 2)))) continue;
                        reachable = true;
                    }
                }
                // on a narrow surface it lies lengthwise along it
                if (reachable) spots.push({ x, z, y: h, kind, along: flatX && flatZ ? null : (flatX ? 'x' : 'z') });
            }
        }
        return spots;
    }

    // Torch flames, in world metres, so the girls are lit by the same fires as the stone.
    function torchLights() {
        if (!cache.nav || !cache.transform) return [];
        return cache.nav.torches.map((torch) => {
            const point = cache.transform.toWorld(torch[0], torch[1], torch[2]);
            return { x: point.x, y: point.y, z: point.z };
        });
    }

    // How much of the baked torchlight is still burning this vigil.
    function applyMood(theme) {
        const intensity = theme && theme.bakedLight != null ? theme.bakedLight : 1;
        (cache.materials || []).forEach((material) => {
            if (material.userData && material.userData.bakedIntensity) {
                material.userData.bakedIntensity.value = intensity;
            }
        });
        (cache.flames || []).forEach((flame) => {
            flame.visible = intensity > 0.05;
        });
    }

    // The side door near the altar, in the nave's right wall (Shaun: "a locked door near
    // the altar (on the right wall)"). The iron gate that stood there (X_Cube.004's right
    // half, bars at x 19.22-19.32) closed the hole in the outer wall at z 7.01-13.17; that
    // hole is walled up (wallUpOpenings) and this doorway left in the new wall, centred
    // along it. x, z: the middle of the doorway on the floor (the middle of the wall's
    // thickness); yaw: `mesh.rotation.y = yaw` turns a door built facing +z (its width
    // along x) into the doorway, facing the nave; (nx, nz): unit normal into the nave.
    // The wall is `depth` thick: its nave face at x - depth/2 (19.74), its back face at
    // x + depth/2 (20.63), where whatever lies behind the doorway begins.
    const SIDE_DOORWAY = Object.freeze({
        x: 20.183, z: 10.092, yaw: -Math.PI / 2, width: 1.4, height: 2.5, nx: -1, nz: 0, depth: 0.888
    });

    NW.Cathedral = {
        SCALE,
        load,
        buildLevel,
        torchLights,
        applyMood,
        sideDoorway: SIDE_DOORWAY,
        // The spike room's mouth (spikeRoom.js): the mirror of the side door, in the LEFT
        // wall's hole, left open in the stone by wallUpOpenings. No leaf ever hangs in it.
        spikeDoorway: Object.freeze(Object.assign({}, GATE_HOLES[0].doorway)),
        isReady() { return Boolean(cache.model); },
        failed() { return cache.failed; },
        get() { return cache.model ? cache : null; }
    };
})();
