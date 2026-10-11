/**
 * Collectible Spots Database
 * 
 * This file contains all possible spot positions for crosses and books in each zone.
 * Each spot is defined with precise position, size, shape (using clipPath for polygons),
 * and rotation to match the 3D perspective of the Blender-created backgrounds.
 * 
 * The spots act as "windows" that reveal the full video (with collectibles) through 
 * the empty video overlay.
 */

// Database of all collectible spots for each zone
window.collectibleSpotsDatabase = {
    // Zone 1 spots
    1: {
        crosses: [
            {
                id: 'z1_cross_1',
                x: 250,
                y: 180,
                width: 80,
                height: 100,
                radius: 50,
                rotation: -15
            },
            {
                id: 'z1_cross_2',
                x: 680,
                y: 240,
                width: 90,
                height: 110,
                radius: 50,
                rotation: 10
            },
            {
                id: 'z1_cross_3',
                x: 420,
                y: 320,
                width: 75,
                height: 95,
                radius: 50,
                rotation: 5
            },
            {
                id: 'z1_cross_4',
                x: 150,
                y: 400,
                width: 70,
                height: 90,
                radius: 50,
                rotation: -20
            },
            {
                id: 'z1_cross_5',
                x: 850,
                y: 350,
                width: 85,
                height: 105,
                radius: 50,
                rotation: 15
            }
        ],
        books: [
            {
                id: 'z1_book_1',
                x: 320,
                y: 220,
                width: 95,
                height: 75,
                radius: 20,
                rotation: -10
            },
            {
                id: 'z1_book_2',
                x: 550,
                y: 380,
                width: 100,
                height: 80,
                radius: 20,
                rotation: 12
            },
            {
                id: 'z1_book_3',
                x: 780,
                y: 290,
                width: 90,
                height: 70,
                radius: 20,
                rotation: -8
            },
            {
                id: 'z1_book_4',
                x: 200,
                y: 520,
                width: 85,
                height: 68,
                radius: 20,
                rotation: 18
            },
            {
                id: 'z1_book_5',
                x: 920,
                y: 480,
                width: 92,
                height: 74,
                radius: 20,
                rotation: -14
            }
        ]
    },
    
    // Zone 2 spots
    2: {
        crosses: [
            {
                id: 'z2_cross_1',
                x: 300,
                y: 200,
                width: 85,
                height: 105,
                radius: 50,
                rotation: 8
            },
            {
                id: 'z2_cross_2',
                x: 650,
                y: 280,
                width: 78,
                height: 98,
                radius: 50,
                rotation: -12
            },
            {
                id: 'z2_cross_3',
                x: 480,
                y: 400,
                width: 82,
                height: 102,
                radius: 50,
                rotation: 20
            },
            {
                id: 'z2_cross_4',
                x: 180,
                y: 350,
                width: 88,
                height: 108,
                radius: 50,
                rotation: -7
            },
            {
                id: 'z2_cross_5',
                x: 880,
                y: 320,
                width: 80,
                height: 100,
                radius: 50,
                rotation: 14
            }
        ],
        books: [
            {
                id: 'z2_book_1',
                x: 380,
                y: 260,
                width: 98,
                height: 78,
                radius: 20,
                rotation: 15
            },
            {
                id: 'z2_book_2',
                x: 600,
                y: 420,
                width: 94,
                height: 76,
                radius: 20,
                rotation: -11
            },
            {
                id: 'z2_book_3',
                x: 240,
                y: 490,
                width: 88,
                height: 70,
                radius: 20,
                rotation: 9
            },
            {
                id: 'z2_book_4',
                x: 820,
                y: 460,
                width: 96,
                height: 77,
                radius: 20,
                rotation: -16
            },
            {
                id: 'z2_book_5',
                x: 450,
                y: 180,
                width: 90,
                height: 72,
                radius: 20,
                rotation: 13
            }
        ]
    },
    
    // Zone 3 spots
    3: {
        crosses: [
            {
                id: 'z3_cross_1',
                x: 280,
                y: 240,
                width: 84,
                height: 104,
                radius: 50,
                rotation: -18
            },
            {
                id: 'z3_cross_2',
                x: 620,
                y: 300,
                width: 86,
                height: 106,
                radius: 50,
                rotation: 11
            },
            {
                id: 'z3_cross_3',
                x: 450,
                y: 380,
                width: 80,
                height: 100,
                radius: 50,
                rotation: -9
            },
            {
                id: 'z3_cross_4',
                x: 160,
                y: 440,
                width: 88,
                height: 108,
                radius: 50,
                rotation: 16
            },
            {
                id: 'z3_cross_5',
                x: 900,
                y: 360,
                width: 82,
                height: 102,
                radius: 50,
                rotation: -13
            }
        ],
        books: [
            {
                id: 'z3_book_1',
                x: 350,
                y: 280,
                width: 96,
                height: 76,
                radius: 20,
                rotation: 10
            },
            {
                id: 'z3_book_2',
                x: 580,
                y: 440,
                width: 92,
                height: 74,
                radius: 20,
                rotation: -14
            },
            {
                id: 'z3_book_3',
                x: 760,
                y: 320,
                width: 94,
                height: 75,
                radius: 20,
                rotation: 17
            },
            {
                id: 'z3_book_4',
                x: 220,
                y: 500,
                width: 90,
                height: 72,
                radius: 20,
                rotation: -8
            },
            {
                id: 'z3_book_5',
                x: 940,
                y: 490,
                width: 88,
                height: 70,
                radius: 20,
                rotation: 12
            }
        ]
    },
    
    // Zone 4 spots
    4: {
        crosses: [
            {
                id: 'z4_cross_1',
                x: 310,
                y: 220,
                width: 86,
                height: 106,
                radius: 50,
                rotation: 14
            },
            {
                id: 'z4_cross_2',
                x: 670,
                y: 260,
                width: 84,
                height: 104,
                radius: 50,
                rotation: -16
            },
            {
                id: 'z4_cross_3',
                x: 490,
                y: 360,
                width: 82,
                height: 102,
                radius: 50,
                rotation: 9
            },
            {
                id: 'z4_cross_4',
                x: 190,
                y: 410,
                width: 88,
                height: 108,
                radius: 50,
                rotation: -11
            },
            {
                id: 'z4_cross_5',
                x: 870,
                y: 340,
                width: 80,
                height: 100,
                radius: 50,
                rotation: 19
            }
        ],
        books: [
            {
                id: 'z4_book_1',
                x: 400,
                y: 300,
                width: 98,
                height: 78,
                radius: 20,
                rotation: -12
            },
            {
                id: 'z4_book_2',
                x: 610,
                y: 400,
                width: 94,
                height: 76,
                radius: 20,
                rotation: 15
            },
            {
                id: 'z4_book_3',
                x: 250,
                y: 480,
                width: 90,
                height: 72,
                radius: 20,
                rotation: -9
            },
            {
                id: 'z4_book_4',
                x: 840,
                y: 450,
                width: 96,
                height: 77,
                radius: 20,
                rotation: 13
            },
            {
                id: 'z4_book_5',
                x: 470,
                y: 200,
                width: 92,
                height: 74,
                radius: 20,
                rotation: -17
            }
        ]
    },
    
    // Zone 5 spots
    5: {
        crosses: [
            {
                id: 'z5_cross_1',
                x: 270,
                y: 250,
                width: 88,
                height: 108,
                radius: 50,
                rotation: -10
            },
            {
                id: 'z5_cross_2',
                x: 640,
                y: 280,
                width: 84,
                height: 104,
                radius: 50,
                rotation: 13
            },
            {
                id: 'z5_cross_3',
                x: 460,
                y: 390,
                width: 80,
                height: 100,
                radius: 50,
                rotation: -15
            },
            {
                id: 'z5_cross_4',
                x: 170,
                y: 420,
                width: 86,
                height: 106,
                radius: 50,
                rotation: 18
            },
            {
                id: 'z5_cross_5',
                x: 890,
                y: 350,
                width: 82,
                height: 102,
                radius: 50,
                rotation: -12
            }
        ],
        books: [
            {
                id: 'z5_book_1',
                x: 360,
                y: 290,
                width: 96,
                height: 76,
                radius: 20,
                rotation: 11
            },
            {
                id: 'z5_book_2',
                x: 570,
                y: 430,
                width: 94,
                height: 75,
                radius: 20,
                rotation: -14
            },
            {
                id: 'z5_book_3',
                x: 790,
                y: 310,
                width: 92,
                height: 74,
                radius: 20,
                rotation: 16
            },
            {
                id: 'z5_book_4',
                x: 210,
                y: 510,
                width: 90,
                height: 72,
                radius: 20,
                rotation: -8
            },
            {
                id: 'z5_book_5',
                x: 960,
                y: 480,
                width: 88,
                height: 70,
                radius: 20,
                rotation: 10
            }
        ]
    }
};
