/**
 * The Nun 3D — procedural textures, drawn on canvases at runtime so the
 * environments need no image files. Every texture is deterministic (seeded).
 */
(function () {
    'use strict';

    const SIZE = 256;

    function rng(seed) {
        let state = (seed >>> 0) || 1;
        return function next() {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function makeCanvas(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size || SIZE;
        canvas.height = size || SIZE;
        return canvas;
    }

    function shade(hex, amount) {
        const value = parseInt(hex.slice(1), 16);
        const clampChannel = (channel) => Math.max(0, Math.min(255, Math.round(channel)));
        const r = clampChannel(((value >> 16) & 255) * amount);
        const g = clampChannel(((value >> 8) & 255) * amount);
        const b = clampChannel((value & 255) * amount);
        return `rgb(${r},${g},${b})`;
    }

    function noise(ctx, random, size, alpha, scale) {
        const image = ctx.getImageData(0, 0, size, size);
        const data = image.data;
        for (let i = 0; i < data.length; i += 4) {
            const n = (random() - 0.5) * 255 * alpha * (scale || 1);
            data[i] += n;
            data[i + 1] += n;
            data[i + 2] += n;
        }
        ctx.putImageData(image, 0, 0);
    }

    function blocks(ctx, random, size, options) {
        const rows = options.rows;
        const cols = options.cols;
        const rowHeight = size / rows;
        const colWidth = size / cols;
        ctx.fillStyle = options.mortar;
        ctx.fillRect(0, 0, size, size);
        for (let row = 0; row < rows; row += 1) {
            const offset = options.stagger && row % 2 ? colWidth / 2 : 0;
            for (let col = -1; col <= cols; col += 1) {
                const x = (col * colWidth) + offset;
                const y = row * rowHeight;
                ctx.fillStyle = shade(options.base, 0.78 + (random() * 0.4));
                ctx.fillRect(x + options.gap, y + options.gap, colWidth - (options.gap * 2), rowHeight - (options.gap * 2));
            }
        }
    }

    const PAINTERS = {
        stone(ctx, random, size) {
            blocks(ctx, random, size, { rows: 4, cols: 3, stagger: true, gap: 3, base: '#8a8580', mortar: '#2e2b29' });
            noise(ctx, random, size, 0.18);
        },
        palestone(ctx, random, size) {
            blocks(ctx, random, size, { rows: 4, cols: 2, stagger: true, gap: 2, base: '#b3aa98', mortar: '#4d473d' });
            noise(ctx, random, size, 0.14);
        },
        bloodstone(ctx, random, size) {
            blocks(ctx, random, size, { rows: 5, cols: 3, stagger: true, gap: 3, base: '#5a1a1c', mortar: '#140405' });
            noise(ctx, random, size, 0.2);
        },
        brick(ctx, random, size) {
            blocks(ctx, random, size, { rows: 8, cols: 4, stagger: true, gap: 2, base: '#43302a', mortar: '#16100d' });
            noise(ctx, random, size, 0.16);
        },
        brickdark(ctx, random, size) {
            blocks(ctx, random, size, { rows: 8, cols: 4, stagger: true, gap: 2, base: '#3a2a22', mortar: '#120c09' });
            noise(ctx, random, size, 0.2);
        },
        marble(ctx, random, size) {
            const tile = size / 4;
            for (let row = 0; row < 4; row += 1) {
                for (let col = 0; col < 4; col += 1) {
                    ctx.fillStyle = (row + col) % 2 ? '#8c847a' : '#3a332d';
                    ctx.fillRect(col * tile, row * tile, tile, tile);
                }
            }
            ctx.strokeStyle = 'rgba(120,110,100,0.35)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 18; i += 1) {
                ctx.beginPath();
                ctx.moveTo(random() * size, random() * size);
                ctx.bezierCurveTo(random() * size, random() * size, random() * size, random() * size, random() * size, random() * size);
                ctx.stroke();
            }
            noise(ctx, random, size, 0.08);
        },
        flagstone(ctx, random, size) {
            blocks(ctx, random, size, { rows: 3, cols: 3, stagger: true, gap: 3, base: '#6e685f', mortar: '#221f1b' });
            noise(ctx, random, size, 0.2);
        },
        dirtstone(ctx, random, size) {
            blocks(ctx, random, size, { rows: 5, cols: 5, stagger: true, gap: 4, base: '#4a4238', mortar: '#1a1612' });
            noise(ctx, random, size, 0.28);
        },
        dirt(ctx, random, size) {
            ctx.fillStyle = '#3a2e22';
            ctx.fillRect(0, 0, size, size);
            for (let i = 0; i < 260; i += 1) {
                ctx.fillStyle = shade('#3a2e22', 0.6 + (random() * 0.8));
                ctx.beginPath();
                ctx.arc(random() * size, random() * size, 1 + (random() * 5), 0, Math.PI * 2);
                ctx.fill();
            }
            noise(ctx, random, size, 0.25);
        },
        rock(ctx, random, size) {
            ctx.fillStyle = '#2a241f';
            ctx.fillRect(0, 0, size, size);
            for (let i = 0; i < 120; i += 1) {
                ctx.fillStyle = shade('#2a241f', 0.6 + (random() * 0.9));
                ctx.beginPath();
                ctx.ellipse(random() * size, random() * size, 6 + (random() * 26), 4 + (random() * 16), random() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
            noise(ctx, random, size, 0.25);
        },
        vault(ctx, random, size) {
            blocks(ctx, random, size, { rows: 6, cols: 6, stagger: true, gap: 2, base: '#3b3530', mortar: '#15120f' });
            noise(ctx, random, size, 0.18);
        },
        wood(ctx, random, size) {
            ctx.fillStyle = '#3d2716';
            ctx.fillRect(0, 0, size, size);
            const boards = 6;
            for (let b = 0; b < boards; b += 1) {
                const y = (size / boards) * b;
                ctx.fillStyle = shade('#4a301b', 0.8 + (random() * 0.35));
                ctx.fillRect(0, y + 1, size, (size / boards) - 2);
                ctx.strokeStyle = 'rgba(20,10,4,0.35)';
                for (let g = 0; g < 7; g += 1) {
                    const gy = y + (random() * (size / boards));
                    ctx.beginPath();
                    ctx.moveTo(0, gy);
                    ctx.bezierCurveTo(size * 0.3, gy + ((random() - 0.5) * 6), size * 0.6, gy + ((random() - 0.5) * 6), size, gy);
                    ctx.stroke();
                }
            }
            noise(ctx, random, size, 0.12);
        },
        planks(ctx, random, size) {
            PAINTERS.wood(ctx, random, size);
        },
        woodpanel(ctx, random, size) {
            ctx.fillStyle = '#2c1b0f';
            ctx.fillRect(0, 0, size, size);
            const panel = size / 2;
            for (let row = 0; row < 2; row += 1) {
                for (let col = 0; col < 2; col += 1) {
                    ctx.fillStyle = shade('#4b2f19', 0.85 + (random() * 0.25));
                    ctx.fillRect((col * panel) + 10, (row * panel) + 10, panel - 20, panel - 20);
                    ctx.strokeStyle = 'rgba(255,210,150,0.08)';
                    ctx.lineWidth = 3;
                    ctx.strokeRect((col * panel) + 16, (row * panel) + 16, panel - 32, panel - 32);
                }
            }
            noise(ctx, random, size, 0.1);
        },
        grass(ctx, random, size) {
            ctx.fillStyle = '#1d2a18';
            ctx.fillRect(0, 0, size, size);
            for (let i = 0; i < 1800; i += 1) {
                ctx.strokeStyle = shade('#2f4a24', 0.6 + (random() * 0.8));
                const x = random() * size;
                const y = random() * size;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + ((random() - 0.5) * 3), y - (2 + (random() * 5)));
                ctx.stroke();
            }
        },
        bones(ctx, random, size) {
            ctx.fillStyle = '#1a140f';
            ctx.fillRect(0, 0, size, size);
            // Ossuary wall: packed, uneven rows of skulls and long bones, in shadow.
            const step = size / 8;
            for (let row = 0; row < 8; row += 1) {
                for (let col = 0; col < 8; col += 1) {
                    const cx = (col * step) + (step / 2) + ((random() - 0.5) * step * 0.45);
                    const cy = (row * step) + (step / 2) + ((random() - 0.5) * step * 0.35);
                    const tone = 0.35 + (random() * 0.4);
                    if (random() < 0.35) {
                        ctx.fillStyle = shade('#c9b99a', tone);
                        ctx.beginPath();
                        ctx.ellipse(cx, cy - 3, step * 0.32, step * 0.3, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillRect(cx - (step * 0.18), cy + 4, step * 0.36, step * 0.16);
                        ctx.fillStyle = '#120c08';
                        ctx.beginPath();
                        ctx.arc(cx - (step * 0.12), cy - 4, step * 0.08, 0, Math.PI * 2);
                        ctx.arc(cx + (step * 0.12), cy - 4, step * 0.08, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.fillStyle = shade('#bfae8e', tone);
                        ctx.save();
                        ctx.translate(cx, cy);
                        ctx.rotate((random() - 0.5) * 0.6);
                        ctx.fillRect(-step * 0.42, -step * 0.06, step * 0.84, step * 0.12);
                        ctx.beginPath();
                        ctx.arc(-step * 0.42, 0, step * 0.09, 0, Math.PI * 2);
                        ctx.arc(step * 0.42, 0, step * 0.09, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                }
            }
            noise(ctx, random, size, 0.18);
        },
        sigil(ctx, random, size) {
            PAINTERS.bloodstone(ctx, random, size);
            ctx.strokeStyle = 'rgba(255,60,40,0.35)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            for (let i = 0; i <= 5; i += 1) {
                const angle = (-Math.PI / 2) + ((i * 4 * Math.PI) / 5);
                const px = (size / 2) + (Math.cos(angle) * size * 0.36);
                const py = (size / 2) + (Math.sin(angle) * size * 0.36);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        },
        books(ctx, random, size) {
            ctx.fillStyle = '#1c120a';
            ctx.fillRect(0, 0, size, size);
            const shelves = 4;
            const shelfHeight = size / shelves;
            const colours = ['#5a1a14', '#1d3a2a', '#2a2350', '#6b4a1a', '#3a1a2e', '#4a3a28'];
            for (let s = 0; s < shelves; s += 1) {
                let x = 2;
                const baseY = (s + 1) * shelfHeight;
                while (x < size - 4) {
                    const width = 5 + Math.floor(random() * 9);
                    const height = shelfHeight * (0.6 + (random() * 0.32));
                    ctx.fillStyle = shade(colours[Math.floor(random() * colours.length)], 0.7 + (random() * 0.5));
                    ctx.fillRect(x, baseY - height - 4, width - 1, height);
                    ctx.fillStyle = 'rgba(220,190,120,0.25)';
                    ctx.fillRect(x + 1, baseY - height + 6, width - 3, 2);
                    x += width;
                }
                ctx.fillStyle = '#3a2412';
                ctx.fillRect(0, baseY - 4, size, 4);
            }
            noise(ctx, random, size, 0.08);
        },
        cloth(ctx, random, size) {
            ctx.fillStyle = '#5a0a12';
            ctx.fillRect(0, 0, size, size);
            ctx.strokeStyle = 'rgba(230,180,80,0.8)';
            ctx.lineWidth = 6;
            ctx.strokeRect(10, 10, size - 20, size - 20);
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(size / 2, size * 0.2);
            ctx.lineTo(size / 2, size * 0.8);
            ctx.moveTo(size * 0.32, size * 0.4);
            ctx.lineTo(size * 0.68, size * 0.4);
            ctx.stroke();
            noise(ctx, random, size, 0.1);
        }
    };

    function stainedGlass(palette, seed) {
        const canvas = makeCanvas(256);
        const ctx = canvas.getContext('2d');
        const random = rng(seed || 7);
        ctx.fillStyle = '#050305';
        ctx.fillRect(0, 0, 256, 256);
        // Gothic lancet: arched top, glass cells inside.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(40, 250);
        ctx.lineTo(40, 110);
        ctx.quadraticCurveTo(40, 12, 128, 6);
        ctx.quadraticCurveTo(216, 12, 216, 110);
        ctx.lineTo(216, 250);
        ctx.closePath();
        ctx.clip();
        const step = 22;
        for (let y = 0; y < 256; y += step) {
            for (let x = 30; x < 230; x += step) {
                ctx.fillStyle = palette[Math.floor(random() * palette.length)];
                ctx.globalAlpha = 0.55 + (random() * 0.45);
                ctx.beginPath();
                ctx.moveTo(x + (random() * 6), y + (random() * 6));
                ctx.lineTo(x + step - (random() * 6), y + (random() * 6));
                ctx.lineTo(x + step - (random() * 6), y + step - (random() * 6));
                ctx.lineTo(x + (random() * 6), y + step - (random() * 6));
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#0b0708';
        ctx.lineWidth = 4;
        for (let y = 0; y < 256; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(256, y);
            ctx.stroke();
        }
        for (let x = 30; x < 256; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 256);
            ctx.stroke();
        }
        ctx.restore();
        return canvas;
    }

    function glowSprite(color) {
        const canvas = makeCanvas(64);
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, color || 'rgba(255,200,120,0.8)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        return canvas;
    }

    const cache = new Map();

    function toTexture(canvas, repeat) {
        const THREE = window.THREE;
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = 4;
        if (repeat) {
            texture.repeat.set(repeat, repeat);
        }
        return texture;
    }

    function get(name, seed) {
        const key = `${name}:${seed || 1}`;
        if (cache.has(key)) {
            return cache.get(key);
        }

        const painter = PAINTERS[name] || PAINTERS.stone;
        const canvas = makeCanvas(SIZE);
        painter(canvas.getContext('2d'), rng(seed || name.length * 97), SIZE);
        const texture = toTexture(canvas);
        cache.set(key, texture);
        return texture;
    }

    function getStainedGlass(palette, seed) {
        const key = `glass:${palette.join(',')}:${seed}`;
        if (!cache.has(key)) {
            const texture = toTexture(stainedGlass(palette, seed));
            texture.wrapS = window.THREE.ClampToEdgeWrapping;
            texture.wrapT = window.THREE.ClampToEdgeWrapping;
            cache.set(key, texture);
        }
        return cache.get(key);
    }

    function getGlow(color) {
        const key = `glow:${color}`;
        if (!cache.has(key)) {
            const texture = new window.THREE.CanvasTexture(glowSprite(color));
            texture.encoding = window.THREE.sRGBEncoding;
            cache.set(key, texture);
        }
        return cache.get(key);
    }

    window.NunWorld = window.NunWorld || {};
    window.NunWorld.Textures = { get, getStainedGlass, getGlow };
})();
