/**
 * The Nun 3D — level layouts and environment themes.
 *
 * One level per vigil. Each level is a tile map (row 0 = the far end, the player
 * starts near the bottom facing "north"). One tile = CELL metres.
 *
 * Legend
 *   #  wall                 W  wall with a stained-glass window
 *   .  floor                o  open-sky floor (no ceiling)
 *   S  player start         A  the altar (reaching it ends the vigil)
 *   N  where the Nun enters c  candle stand (light it: a pool of light that burns down)
 *   r  relic spot           q  relic spot under open sky
 *   d  demon nook (dark corner the Demoness likes to crawl out of)
 *   P  pillar (blocks)      x  theme prop that blocks (pews, tombs, shelves...)
 */
(function () {
    'use strict';

    const DEFAULT_CELL = 3;

    const LEVELS = [
        {
            id: 'nave',
            nameKey: 'level.name_1',
            theme: {
                wall: 'stone', floor: 'marble', ceiling: 'vault', prop: 'pew',
                ceilingHeight: 9, fogColor: 0x07050b, fogDensity: 0.05,
                ambientColor: 0x3a2c40, ambientIntensity: 0.55,
                windowPalette: ['#7a1020', '#1a3f8a', '#b8861b', '#2f6b35'],
                candleColor: 0xffa24a
            },
            map: [
                '###############',
                '######WWW######',
                '#####r.A.r#####',
                '####c.....c####',
                '###P.......P###',
                '#W.....d.....W#',
                '#.P.xx.r.xx.P.#',
                '#r..xx...xx..r#',
                '#.P.xx...xx.P.#',
                '#W..xx.c.xx..W#',
                '#.P.xx...xx.P.#',
                '#d..xx...xx..d#',
                '#.P.xx.r.xx.P.#',
                '#W..xx.r.xx..W#',
                '#.P.xx...xx.P.#',
                '#r..xx...xx..r#',
                '#.P....r....P.#',
                '#W..c.....c..W#',
                '###r...S...r###',
                '#####..N..#####',
                '###############'
            ]
        },
        {
            id: 'crypt',
            nameKey: 'level.name_2',
            theme: {
                wall: 'brick', floor: 'dirtstone', ceiling: 'brickdark', prop: 'tomb',
                ceilingHeight: 3.6, fogColor: 0x040705, fogDensity: 0.075,
                ambientColor: 0x1e3322, ambientIntensity: 0.45,
                windowPalette: ['#355e3b', '#1f3326'],
                candleColor: 0xffb25e
            },
            map: [
                '#################',
                '#r..#...d...#..r#',
                '#.#.#.#####.#.#.#',
                '#.#...#.A.#...#.#',
                '#.#####.c.#####.#',
                '#...r.#...#.r...#',
                '###.#.##.##.#.###',
                '#d..#.x...x.#..d#',
                '#.###.#.#.#.###.#',
                '#...c.#r..#.c...#',
                '#.#.###.#.###.#.#',
                '#r#.....#.....#r#',
                '#.#####.#.#####.#',
                '#...x...#...x...#',
                '###.#.#####.#.###',
                '#r..#...c...#..r#',
                '#.#.#.##.##.#.#.#',
                '#.#...#r..#...#.#',
                '#.###.#.#.#.###.#',
                '#.....d.S.......#',
                '#######.N.#######',
                '#################'
            ]
        },
        {
            id: 'cloister',
            nameKey: 'level.name_3',
            theme: {
                wall: 'palestone', floor: 'flagstone', ceiling: 'wood', prop: 'fountain',
                openFloor: 'grass', moonlight: true,
                ceilingHeight: 4.5, fogColor: 0x0a0e1a, fogDensity: 0.04,
                ambientColor: 0x2a3450, ambientIntensity: 0.32,
                windowPalette: ['#1a3f8a', '#6b2a8a', '#b8861b'],
                candleColor: 0xffa24a
            },
            map: [
                '#################',
                '######W.A.W######',
                '######r...r######',
                '#######.c.#######',
                '#######...#######',
                '#d..r.......r..d#',
                '#.P.P.P.P.P.P.P.#',
                '#..ooooqoooooo..#',
                '#.PoooooooooooP.#',
                '#r.ooqooooooqo.r#',
                '#.PoooooxoooooP.#',
                '#c.ooooqoooooo.c#',
                '#.PoooooooooooP.#',
                '#d.ooqoooooqoo.d#',
                '#.PoooooooooooP.#',
                '#.P.P.P.P.P.P.P.#',
                '#r...c.....c...r#',
                '#######...#######',
                '#######.S.#######',
                '#######.N.#######',
                '#################'
            ]
        },
        {
            id: 'scriptorium',
            nameKey: 'level.name_4',
            theme: {
                wall: 'woodpanel', floor: 'planks', ceiling: 'wood', prop: 'bookshelf',
                ceilingHeight: 5.5, fogColor: 0x0a0604, fogDensity: 0.055,
                ambientColor: 0x3a2614, ambientIntensity: 0.5,
                windowPalette: ['#b8861b', '#7a1020'],
                candleColor: 0xffb05a
            },
            map: [
                '#################',
                '#W....r.A.r....W#',
                '#......c.c......#',
                '#.xxxxxx.xxxxxx.#',
                '#r.............d#',
                '#.xxx.xxxxx.xxx.#',
                '#d..r.......r...#',
                '#.xxxxx.x.xxxxx.#',
                '#...c.......c..r#',
                '#.xxx.xxxxx.xxx.#',
                '#r.....d.......r#',
                '#.xxxxxx.xxxxxx.#',
                '#...r.......r...#',
                '#.xxx.xxxxx.xxx.#',
                '#d......c......d#',
                '#.xxxxx.x.xxxxx.#',
                '#r.............r#',
                '#W..c.......c..W#',
                '######..S..######',
                '######..N..######',
                '#################'
            ]
        },
        {
            id: 'catacombs',
            nameKey: 'level.name_5',
            theme: {
                wall: 'bones', floor: 'dirt', ceiling: 'rock', prop: 'bonepile',
                ceilingHeight: 3, fogColor: 0x060403, fogDensity: 0.085,
                ambientColor: 0x2a1c12, ambientIntensity: 0.4,
                windowPalette: ['#5a2a10'],
                candleColor: 0xff9a40
            },
            map: [
                '###################',
                '#d..#.....A.....#r#',
                '#.#.#.###...###.#.#',
                '#r#...#r#.c.#r#...#',
                '#.#####.##.##.###.#',
                '#...c.......#.....#',
                '###.#####.#.#.###.#',
                '#r..#d..#.#...#d..#',
                '#.###.#.#.#####.###',
                '#...#.#...#r..#...#',
                '###.#.#####.#.###.#',
                '#r..#...c...#.....#',
                '#.#####.#.###.###.#',
                '#...#...#...#.#r#.#',
                '#.#.#.#####.#.#.#.#',
                '#d#...#r....#...#.#',
                '#.#####.#####.###.#',
                '#...c.....d.......#',
                '#######.S.#########',
                '#######.N.#########',
                '###################'
            ]
        },
        {
            id: 'sanctum',
            nameKey: 'level.name_6',
            theme: {
                wall: 'bloodstone', floor: 'sigil', ceiling: 'vault', prop: 'pew',
                ceilingHeight: 12, fogColor: 0x0d0205, fogDensity: 0.045,
                ambientColor: 0x4a0c16, ambientIntensity: 0.6,
                windowPalette: ['#9a0a14', '#5a0610', '#c23a1a'],
                candleColor: 0xff6a3a
            },
            map: [
                '###############',
                '#####WWWWW#####',
                '###W...A...W###',
                '##.P.c...c.P.##',
                '#W...r...r...W#',
                '#.P.........P.#',
                '#d...P...P...d#',
                '#..r.......r..#',
                '#.P...c.c...P.#',
                '#W...P...P...W#',
                '#..r.......r..#',
                '#.P.........P.#',
                '#d...r...r...d#',
                '##..c.....c..##',
                '####...S...####',
                '######.N.######',
                '###############'
            ]
        }
    ];

    const BLOCKING = new Set(['#', 'W', ' ', 'P', 'x']);
    const OPEN_SKY = new Set(['o', 'q']);

    function getLevelForPhase(phase) {
        const index = Math.max(0, Math.min(LEVELS.length - 1, (Number(phase) || 1) - 1));
        return LEVELS[index];
    }

    // Parse a level into a grid with helpers the world and the AI share.
    // A level may set its own cellSize (the cathedral's grid is finer than these maps).
    function parseLevel(level) {
        const CELL = Number(level.cellSize) || DEFAULT_CELL;
        const rows = level.map;
        const height = rows.length;
        const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
        const cells = [];
        const spots = { start: null, altar: null, nun: null, candles: [], relics: [], demons: [] };

        for (let z = 0; z < height; z += 1) {
            for (let x = 0; x < width; x += 1) {
                const ch = rows[z][x] || ' ';
                cells.push(ch);
                const spot = { x, z };
                if (ch === 'S') spots.start = spot;
                else if (ch === 'A') spots.altar = spot;
                else if (ch === 'N') spots.nun = spot;
                else if (ch === 'c') spots.candles.push(spot);
                else if (ch === 'r' || ch === 'q') spots.relics.push(spot);
                else if (ch === 'd') spots.demons.push(spot);
            }
        }

        const grid = {
            width,
            height,
            cellSize: CELL,
            at(x, z) {
                if (x < 0 || z < 0 || x >= width || z >= height) return ' ';
                return cells[(z * width) + x];
            },
            isBlocked(x, z) {
                return BLOCKING.has(this.at(x, z));
            },
            isOpenSky(x, z) {
                return OPEN_SKY.has(this.at(x, z));
            },
            toWorld(x, z) {
                return { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL };
            },
            toCell(worldX, worldZ) {
                return { x: Math.floor(worldX / CELL), z: Math.floor(worldZ / CELL) };
            },
            // Breadth-first distance (in cells) from a cell to every walkable cell.
            distanceField(fromX, fromZ) {
                const field = new Int32Array(width * height).fill(-1);
                if (this.isBlocked(fromX, fromZ)) return field;
                const queue = [fromX, fromZ];
                field[(fromZ * width) + fromX] = 0;
                for (let head = 0; head < queue.length; head += 2) {
                    const cx = queue[head];
                    const cz = queue[head + 1];
                    const base = field[(cz * width) + cx];
                    const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                    for (let n = 0; n < neighbours.length; n += 1) {
                        const nx = cx + neighbours[n][0];
                        const nz = cz + neighbours[n][1];
                        if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
                        const index = (nz * width) + nx;
                        if (field[index] !== -1 || this.isBlocked(nx, nz)) continue;
                        field[index] = base + 1;
                        queue.push(nx, nz);
                    }
                }
                return field;
            }
        };

        return { level, grid, spots };
    }

    window.NunWorld = window.NunWorld || {};
    window.NunWorld.CELL = DEFAULT_CELL;
    window.NunWorld.LEVELS = LEVELS;
    window.NunWorld.getLevelForPhase = getLevelForPhase;
    window.NunWorld.parseLevel = parseLevel;
})();
