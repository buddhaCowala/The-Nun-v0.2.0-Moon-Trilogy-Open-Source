(function () {
    const GALLERY_STORAGE_KEY = 'the-nun-gallery-v1';
    const BASE_ASSET_ROOT = 'assets';
    const GOLD_ASSET_ROOT = 'assets_gold';
    const DIAMOND_ASSET_ROOT = 'assets_diamond';
    const CATEGORY_SCENE_CONFIGS = {
        attack: {
            assetRoot: BASE_ASSET_ROOT,
            sceneDirectory: 'attacks',
            kind: 'video',
            kickerKey: 'gallery.kicker_encounter_reel',
            titlePrefixKey: 'gallery.prefix_attack'
        },
        reward: {
            assetRoot: BASE_ASSET_ROOT,
            sceneDirectory: 'rewards',
            kind: 'video',
            kickerKey: 'gallery.kicker_reward_file',
            titlePrefixKey: 'gallery.prefix_reward'
        },
        other: {
            assetRoot: BASE_ASSET_ROOT,
            sceneDirectory: 'others',
            kind: 'video',
            kickerKey: 'gallery.kicker_location_file',
            titlePrefixKey: 'gallery.prefix_other'
        }
    };
    const PREMIUM_CATEGORY_SCENE_CONFIGS = {
        gold: [
            { assetRoot: GOLD_ASSET_ROOT, sceneDirectory: 'attacks', kind: 'video', kickerKey: 'gallery.kicker_gold_attack', titlePrefixKey: 'gallery.prefix_gold_attack' },
            { assetRoot: GOLD_ASSET_ROOT, sceneDirectory: 'rewards', kind: 'video', kickerKey: 'gallery.kicker_gold_reward', titlePrefixKey: 'gallery.prefix_gold_reward' }
        ],
        diamond: [
            { assetRoot: DIAMOND_ASSET_ROOT, sceneDirectory: 'attacks', kind: 'video', kickerKey: 'gallery.kicker_diamond_attack', titlePrefixKey: 'gallery.prefix_diamond_attack' },
            { assetRoot: DIAMOND_ASSET_ROOT, sceneDirectory: 'rewards', kind: 'video', kickerKey: 'gallery.kicker_diamond_reward', titlePrefixKey: 'gallery.prefix_diamond_reward' }
        ]
    };
    const EDITION_SCENE_CODE_PREFIXES = {
        base: { attack: '2AAA', other: '2AAB', reward: '2AAC' },
        gold: { attack: '2ADA', other: '2ADB', reward: '2ADC' },
        diamond: { attack: '2APA', other: '2APB', reward: '2APC' }
    };
    const EDITION_SCENE_COUNTS = {
        base: { attack: 4, other: 4, reward: 4 },
        gold: { attack: 0, other: 0, reward: 4 },
        diamond: { attack: 0, other: 0, reward: 4 }
    };
    const STATIC_SCENE_CODE_LISTS = {
        base: {
            attack: [
                '3AD1',
                '3AD1V2',
                '3AD1V3',
                '3AD1V4',
                '3AD1V5',
                '3AG',
                '3AGV2',
                '3AGV3',
                '3AGV4',
                '3AGV5',
                '3AN1',
                '3AN1V2',
                '3AN1V3',
                '3AN1V4',
                '3AN1V5',
                '3AZ1S',
                '3AZ2S',
                '3AZ3S',
                '3AZ4S',
                '3AZ5S'
            ],
            other: [
                '3ZN1',
                '3ZN1V2',
                '3ZN1V3',
                '3ZN1V4',
                '3ZN1V5',
                '3CA1',
                '3CA1V2',
                '3CA1V3',
                '3CA1V4',
                '3CA1V5'
            ],
            reward: [
                '3SS1',
                '3SS1T',
                '3SHD1',
                '3SHD1T',
                '3SHD2',
                '3SHD2T',
                '3SHD3',
                '3SHD3T',
                '3SHN1',
                '3SHN1T',
                '3SHN2',
                '3SHN2T',
                '3SHN3',
                '3SHN3T'
            ]
        },
        gold: {
            reward: [
                '3SDE1',
                '3SDE1T',
                '3SDE1C'
            ]
        },
        diamond: {
            reward: [
                '3SS1C',
                '3SCN1',
                '3SCN1T',
                '3SCN1C',
                '3SCN2',
                '3SCN2T',
                '3SCN2C',
                '3SHN1C',
                '3SHN2C',
                '3SHN3C',
                '3SHD1C',
                '3SHD2C',
                '3SHD3C'
            ]
        }
    };
    const BASE_ATTACK_UNLOCK_SCENE_CODES = ['3AZ1S', '3AZ2S', '3AZ3S', '3AZ4S'];

    // Dynamically matches any reward scene that has a cum variant (no T suffix, known pattern).
    // To add a new cum-capable reward type, just add its prefix pattern here.
    function isGalleryCumRewardSceneCode(sceneCode) {
        return /^3S(?:S|HD|HN|DE|CN)\d+$/.test(String(sceneCode || '').trim().toUpperCase());
    }

    // "Attack the Nun / Demon" intros (3AXN/3AXD) and struggle loops (3AXL…):
    // you attack her, nothing sexual happens, so the gallery must not add the
    // caught-scene slide + moan/cum layer (startAttackSlideLoopSfx) over them.
    // Intros play their own footsteps/impact audio; struggle loops are silent.
    function isAltarAttackRouteSceneCode(sceneCode) {
        return /^3AX/.test(String(sceneCode || '').trim().toUpperCase());
    }

    function isDedicatedGalleryCumSceneCode(sceneCode) {
        return /^3S[A-Z]*\d+C$/.test(String(sceneCode || '').trim().toUpperCase());
    }

    function getCumSceneScreenshotAssetRoot(sceneCode) {
        const edition = getRequiredEditionCategoryForGalleryCumScene(sceneCode, null);
        return getEditionAssetRoot(edition || 'base');
    }

    function getRequiredEditionCategoryForGalleryCumScene(sceneCode, entry) {
        const normalizedSceneCode = String(sceneCode || '').trim().toUpperCase().replace(/C$/, '');
        const entryEditionCategory = normalizeGalleryCategoryKey(entry && entry.requiredEditionCategory);
        if (entryEditionCategory === 'gold' || entryEditionCategory === 'diamond') {
            return entryEditionCategory;
        }

        if (/^3SS\d+$/.test(normalizedSceneCode)) {
            return 'diamond';
        }

        if (/^3SDE\d+$/.test(normalizedSceneCode)) {
            return 'gold';
        }

        if (/^3S(?:HD|HN|CN)\d+$/.test(normalizedSceneCode)) {
            return 'diamond';
        }

        return null;
    }

    function normalizeGalleryCategoryKey(category) {
        const normalizedCategory = String(category || '').trim().toLowerCase();

        if (normalizedCategory === 'camera' || normalizedCategory === 'others') {
            return 'other';
        }

        return normalizedCategory;
    }

    const galleryState = {
        currentCategory: 'attack',
        currentIndex: 0,
        filteredEntries: [],
        arrowPosition: 0,
        scrollOffset: 0,
        currentCharacterFilter: null,
        popupVisible: false,
        isSceneFocused: false,
        rewardPlayback: null,
        otherZonePlayback: null
    };

    const FALLBACK_GALLERY_ENTRIES = [
        {
            id: 'nun-approach',
            category: 'attack',
            girlId: 'nun',
            girlLabel: 'Nun',
            kind: 'video',
            titleKey: 'gallery.fallback.nun_approach_title',
            title: window.t('gallery.fallback.nun_approach_title'),
            kickerKey: 'gallery.kicker_encounter_reel',
            kicker: window.t('gallery.kicker_encounter_reel'),
            descriptionKey: 'gallery.fallback.nun_approach_description',
            description: window.t('gallery.fallback.nun_approach_description'),
            src: 'assets/backgrounds/nun.mp4',
            thumb: 'assets/backgrounds/background.png',
            locked: false
        },
        {
            id: 'demon-hall-rush',
            category: 'attack',
            girlId: 'demon',
            girlLabel: 'Demon',
            kind: 'video',
            titleKey: 'gallery.fallback.demon_hall_rush_title',
            title: window.t('gallery.fallback.demon_hall_rush_title'),
            kickerKey: 'gallery.kicker_encounter_reel',
            kicker: window.t('gallery.kicker_encounter_reel'),
            descriptionKey: 'gallery.fallback.demon_hall_rush_description',
            description: window.t('gallery.fallback.demon_hall_rush_description'),
            src: 'assets/backgrounds/1R1TRM.mp4',
            thumb: 'assets/backgrounds/background.png',
            locked: true
        },
        {
            id: 'power-struggle',
            category: 'attack',
            girlId: 'altar',
            girlLabel: 'Altar',
            kind: 'image',
            titleKey: 'gallery.fallback.power_struggle_title',
            title: window.t('gallery.fallback.power_struggle_title'),
            kickerKey: 'gallery.kicker_encounter_snapshot',
            kicker: window.t('gallery.kicker_encounter_snapshot'),
            descriptionKey: 'gallery.fallback.power_struggle_description',
            description: window.t('gallery.fallback.power_struggle_description'),
            src: 'assets/backgrounds/background.png',
            thumb: 'assets/backgrounds/background.png',
            locked: false
        },
        {
            id: 'cross-route',
            category: 'reward',
            girlId: 'nun',
            girlLabel: 'Nun',
            kind: 'image',
            titleKey: 'gallery.fallback.cross_route_title',
            title: window.t('gallery.fallback.cross_route_title'),
            kickerKey: 'gallery.kicker_reward_file',
            kicker: window.t('gallery.kicker_reward_file'),
            descriptionKey: 'gallery.fallback.cross_route_description',
            description: window.t('gallery.fallback.cross_route_description'),
            src: 'assets/backgrounds/background.png',
            thumb: 'assets/backgrounds/background.png',
            locked: false
        },
        {
            id: 'book-route',
            category: 'reward',
            girlId: 'demon',
            girlLabel: 'Demon',
            kind: 'image',
            titleKey: 'gallery.fallback.book_route_title',
            title: window.t('gallery.fallback.book_route_title'),
            kickerKey: 'gallery.kicker_reward_file',
            kicker: window.t('gallery.kicker_reward_file'),
            descriptionKey: 'gallery.fallback.book_route_description',
            description: window.t('gallery.fallback.book_route_description'),
            src: 'assets/backgrounds/background.png',
            thumb: 'assets/backgrounds/background.png',
            locked: false
        },
        {
            id: 'altar-oath',
            category: 'reward',
            girlId: 'altar',
            girlLabel: 'Altar',
            kind: 'image',
            titleKey: 'gallery.fallback.altar_oath_title',
            title: window.t('gallery.fallback.altar_oath_title'),
            kickerKey: 'gallery.kicker_reward_file',
            kicker: window.t('gallery.kicker_reward_file'),
            descriptionKey: 'gallery.fallback.altar_oath_description',
            description: window.t('gallery.fallback.altar_oath_description'),
            src: 'assets/backgrounds/background.png',
            thumb: 'assets/backgrounds/background.png',
            locked: true
        },
        {
            id: 'chapel-feed',
            category: 'other',
            girlId: 'altar',
            girlLabel: 'Chapel',
            kind: 'image',
            titleKey: 'gallery.fallback.chapel_feed_title',
            title: window.t('gallery.fallback.chapel_feed_title'),
            kickerKey: 'gallery.kicker_location_file',
            kicker: window.t('gallery.kicker_location_file'),
            descriptionKey: 'gallery.fallback.chapel_feed_description',
            description: window.t('gallery.fallback.chapel_feed_description'),
            src: 'assets/backgrounds/background.png',
            thumb: 'assets/backgrounds/background.png',
            locked: false
        },
        {
            id: 'corridor-feed',
            category: 'other',
            girlId: 'demon',
            girlLabel: 'Corridor',
            kind: 'video',
            titleKey: 'gallery.fallback.corridor_feed_title',
            title: window.t('gallery.fallback.corridor_feed_title'),
            kickerKey: 'gallery.kicker_location_file',
            kicker: window.t('gallery.kicker_location_file'),
            descriptionKey: 'gallery.fallback.corridor_feed_description',
            description: window.t('gallery.fallback.corridor_feed_description'),
            src: 'assets/backgrounds/1R1TRM.mp4',
            thumb: 'assets/backgrounds/background.png',
            locked: false
        },
        {
            id: 'nun-feed',
            category: 'other',
            girlId: 'nun',
            girlLabel: 'Nun',
            kind: 'video',
            titleKey: 'gallery.fallback.nun_feed_title',
            title: window.t('gallery.fallback.nun_feed_title'),
            kickerKey: 'gallery.kicker_location_file',
            kicker: window.t('gallery.kicker_location_file'),
            descriptionKey: 'gallery.fallback.nun_feed_description',
            description: window.t('gallery.fallback.nun_feed_description'),
            src: 'assets/backgrounds/nun.mp4',
            thumb: 'assets/backgrounds/background.png',
            locked: true
        },
    ];
    let galleryEntries = FALLBACK_GALLERY_ENTRIES.slice();
    let galleryEntriesLoaded = false;
    let galleryEntriesLoadPromise = null;

    function getSceneRoot(assetRoot) {
        return `${assetRoot}/scenes`;
    }

    function getSceneDirectoryPath(assetRoot, sceneDirectory) {
        return `${getSceneRoot(assetRoot)}/${sceneDirectory}`;
    }

    function getScreenshotDirectoryPath(assetRoot, sceneDirectory) {
        return `${getSceneRoot(assetRoot)}/screenshots/${sceneDirectory}`;
    }

    function getScreenshotPath(assetRoot, sceneDirectory, fileName) {
        return `${getScreenshotDirectoryPath(assetRoot, sceneDirectory)}/${fileName}`;
    }

    function getBlurredScreenshotPath(assetRoot, sceneDirectory, sceneCode) {
        return `${getScreenshotDirectoryPath(assetRoot, sceneDirectory)}/blurred/${sceneCode}_b.webp`;
    }

    function getSceneCode(fileName) {
        return String(fileName || '').replace(/\.[^.]+$/, '');
    }

    function getAttackSceneTitle(sceneCode) {
        const normalizedSceneCode = String(sceneCode || '').trim().toUpperCase();
        let match = normalizedSceneCode.match(/^3AD(\d+)(?:V(\d+))?$/);
        if (match) {
            const variationIndex = Number(match[1]) || 1;
            const outfitIndex = Number(match[2]) || 1;
            return variationIndex === 1
                ? (outfitIndex === 1
                    ? window.t('gallery.scene.demon_attack')
                    : window.t('gallery.scene.demon_attack_outfit', { outfit: outfitIndex }))
                : window.t('gallery.scene.demon_attack_variation', { variation: variationIndex, outfit: outfitIndex });
        }

        match = normalizedSceneCode.match(/^3AG(\d+)?(?:V(\d+))?$/);
        if (match) {
            const variationIndex = Number(match[1]) || 1;
            const outfitIndex = Number(match[2]) || 1;
            return variationIndex === 1
                ? (outfitIndex === 1
                    ? window.t('gallery.scene.nun_drag')
                    : window.t('gallery.scene.nun_drag_outfit', { outfit: outfitIndex }))
                : window.t('gallery.scene.nun_drag_variation', { variation: variationIndex, outfit: outfitIndex });
        }

        match = normalizedSceneCode.match(/^3AN(\d+)(?:V(\d+))?$/);
        if (match) {
            const variationIndex = Number(match[1]) || 1;
            const outfitIndex = Number(match[2]) || 1;
            return variationIndex === 1
                ? (outfitIndex === 1
                    ? window.t('gallery.scene.nun_attack')
                    : window.t('gallery.scene.nun_attack_outfit', { outfit: outfitIndex }))
                : window.t('gallery.scene.nun_attack_variation', { variation: variationIndex, outfit: outfitIndex });
        }

        match = normalizedSceneCode.match(/^3AZ(\d+)S(\d+)?$/);
        if (match) {
            const zoneIndex = Number(match[1]) || 1;
            const variationIndex = Number(match[2]) || 1;
            return variationIndex === 1
                ? window.t('gallery.scene.demon_struggle_zone', { zone: zoneIndex })
                : window.t('gallery.scene.demon_struggle_zone_variation', { zone: zoneIndex, variation: variationIndex });
        }

        // "Attack the Nun / Demon" altar route (scripts/altarDuel.js) — the player
        // attacks her, so these are named after the route, not "Nun/Demon Attack".
        // Struggle loops: 3AXLN{n} / 3AXLD{n}.
        match = normalizedSceneCode.match(/^3AXL(N|D)(\d+)$/);
        if (match) {
            return window.t(match[1] === 'N' ? 'gallery.scene.attack_the_nun_struggle' : 'gallery.scene.attack_the_demon_struggle', { index: Number(match[2]) || 1 });
        }

        // Intros: 3AXN{variation} (outfit 1) / 3AXN{variation}V{outfit}.
        match = normalizedSceneCode.match(/^3AX(N|D)(\d+)(?:V(\d+))?$/);
        if (match) {
            const baseKey = match[1] === 'N' ? 'gallery.scene.attack_the_nun_intro' : 'gallery.scene.attack_the_demon_intro';
            const variation = Number(match[2]) || 1;
            const outfit = Number(match[3]) || 1;
            return outfit === 1
                ? window.t(baseKey, { variation })
                : window.t(`${baseKey}_outfit`, { variation, outfit });
        }

        return null;
    }

    function getRewardSceneTitle(sceneCode) {
        const normalizedSceneCode = String(sceneCode || '').trim().toUpperCase();

        let match = normalizedSceneCode.match(/^3SS(\d+)(T|C)?$/);
        if (match) {
            if (match[2] === 'T') {
                return window.t('gallery.scene.surrender_transition', { index: Number(match[1]) || 1 });
            }

            if (match[2] === 'C') {
                return window.t('gallery.scene.surrender_cum', { index: Number(match[1]) || 1 });
            }

            return window.t('gallery.scene.surrender', { index: Number(match[1]) || 1 });
        }

        match = normalizedSceneCode.match(/^3SHD(\d+)(T|C)?$/);
        if (match) {
            if (match[2] === 'T') {
                return window.t('gallery.scene.demon_help_transition', { index: Number(match[1]) || 1 });
            }

            if (match[2] === 'C') {
                return window.t('gallery.scene.demon_help_cum', { index: Number(match[1]) || 1 });
            }

            return window.t('gallery.scene.demon_help', { index: Number(match[1]) || 1 });
        }

        match = normalizedSceneCode.match(/^3SHN(\d+)(T|C)?$/);
        if (match) {
            if (match[2] === 'T') {
                return window.t('gallery.scene.nun_help_transition', { index: Number(match[1]) || 1 });
            }

            if (match[2] === 'C') {
                return window.t('gallery.scene.nun_help_cum', { index: Number(match[1]) || 1 });
            }

            return window.t('gallery.scene.nun_help', { index: Number(match[1]) || 1 });
        }

        // "Attack the Nun / Demon" win scenes (scripts/altarDuel.js): 3SAN{n}, 3SAN{n}CI, 3SAN{n}CO.
        match = normalizedSceneCode.match(/^3SA(N|D)(\d+)(CI|CO)?$/);
        if (match) {
            const baseKey = match[1] === 'N' ? 'gallery.scene.attack_the_nun' : 'gallery.scene.attack_the_demon';
            const index = Number(match[2]) || 1;
            if (match[3] === 'CI') {
                return window.t(`${baseKey}_cum_inside`, { index });
            }

            if (match[3] === 'CO') {
                return window.t(`${baseKey}_cum_outside`, { index });
            }

            return window.t(baseKey, { index });
        }

        match = normalizedSceneCode.match(/^3SDE(\d+)(T|C)?$/);
        if (match) {
            if (match[2] === 'T') {
                return window.t('gallery.scene.demon_exorcism_transition', { index: Number(match[1]) || 1 });
            }

            if (match[2] === 'C') {
                return window.t('gallery.scene.demon_exorcism_cum', { index: Number(match[1]) || 1 });
            }

            return window.t('gallery.scene.demon_exorcism', { index: Number(match[1]) || 1 });
        }

        match = normalizedSceneCode.match(/^3SCN(\d+)(T|C)?$/);
        if (match) {
            if (match[2] === 'T') {
                return window.t('gallery.scene.nun_corruption_transition', { index: Number(match[1]) || 1 });
            }

            if (match[2] === 'C') {
                return window.t('gallery.scene.nun_corruption_cum', { index: Number(match[1]) || 1 });
            }

            return window.t('gallery.scene.nun_corruption', { index: Number(match[1]) || 1 });
        }

        return null;
    }

    function getOtherSceneTitle(sceneCode) {
        const normalizedSceneCode = String(sceneCode || '').trim().toUpperCase();

        let match = normalizedSceneCode.match(/^3Z1(?:V(\d+))?$/);
        if (match) {
            const phaseIndex = Number(match[1]) || 1;
            return window.t('gallery.scene.intro_nun_phase', { phase: phaseIndex });
        }

        match = normalizedSceneCode.match(/^3ZN1(?:V(\d+))?$/);
        if (match) {
            const phaseIndex = Number(match[1]) || 1;
            return phaseIndex === 1
                ? window.t('gallery.scene.nun_look_back')
                : window.t('gallery.scene.nun_look_back_indexed', { index: phaseIndex });
        }

        match = normalizedSceneCode.match(/^3CA1(?:V(\d+))?$/);
        if (!match) {
            return null;
        }

        const arrivalIndex = Number(match[1]) || 1;
        return arrivalIndex === 1
            ? window.t('gallery.scene.girls_arrival')
            : window.t('gallery.scene.girls_arrival_indexed', { index: arrivalIndex });
    }

    function getOtherScenePreviewPath(assetRoot, sceneCode) {
        const normalizedSceneCode = String(sceneCode || '').trim().toUpperCase();

        // Phase start intro thumbnails (3Z1, 3Z1V2, ...)
        let match = normalizedSceneCode.match(/^3Z1(?:V(\d+))?$/);
        if (match) {
            const phaseSuffix = match[1] ? `V${match[1]}` : '';
            return `${getScreenshotDirectoryPath(assetRoot, 'others')}/3Z1${phaseSuffix}.webp`;
        }

        match = normalizedSceneCode.match(/^3ZN1(?:V(\d+))?$/);
        if (match) {
            const phaseSuffix = match[1] ? `V${match[1]}` : '';
            return `${getScreenshotDirectoryPath(assetRoot, 'others')}/3ZN1${phaseSuffix}.webp`;
        }

        match = normalizedSceneCode.match(/^3CA1(?:V(\d+))?$/);
        if (!match) {
            return null;
        }

        const phaseSuffix = match[1] ? `V${match[1]}` : '';
        return `${getScreenshotDirectoryPath(assetRoot, 'others')}/3CA1${phaseSuffix}.webp`;
    }

    function getOtherSceneLockedPreviewPath(assetRoot, sceneDirectory, sceneCode) {
        const normalizedSceneCode = String(sceneCode || '').trim().toUpperCase();

        // Phase start intro blurred thumbnails
        let match = normalizedSceneCode.match(/^3Z1(?:V(\d+))?$/);
        if (match) {
            const phaseSuffix = match[1] ? `V${match[1]}` : '';
            return `${getScreenshotDirectoryPath(assetRoot, sceneDirectory)}/blurred/3Z1${phaseSuffix}_b.webp`;
        }

        match = normalizedSceneCode.match(/^3ZN1(?:V(\d+))?$/);
        if (match) {
            const phaseSuffix = match[1] ? `V${match[1]}` : '';
            return `${getScreenshotDirectoryPath(assetRoot, sceneDirectory)}/blurred/3ZN1${phaseSuffix}_b.webp`;
        }

        match = normalizedSceneCode.match(/^3CA1(?:V(\d+))?$/);
        if (!match) {
            return getBlurredScreenshotPath(assetRoot, sceneDirectory, sceneCode);
        }

        const phaseSuffix = match[1] ? `V${match[1]}` : '';
        return `${getScreenshotDirectoryPath(assetRoot, sceneDirectory)}/blurred/3CA1${phaseSuffix}_b.webp`;
    }

    function getSceneLockedPreviewPath(assetRoot, sceneDirectory, sceneCode) {
        if (sceneDirectory === 'others') {
            const lockedPreviewAssetRoot = isDedicatedGalleryCumSceneCode(sceneCode)
                ? getCumSceneScreenshotAssetRoot(sceneCode)
                : assetRoot;
            return getOtherSceneLockedPreviewPath(lockedPreviewAssetRoot, sceneDirectory, sceneCode);
        }

        return getBlurredScreenshotPath(BASE_ASSET_ROOT, sceneDirectory, sceneCode);
    }

    function getSceneEntryTitle(config, sceneDirectory, sceneCode) {
        if (sceneDirectory === 'attacks') {
            const attackTitle = getAttackSceneTitle(sceneCode);
            if (attackTitle) {
                return attackTitle;
            }
        }

        if (sceneDirectory === 'rewards') {
            const rewardTitle = getRewardSceneTitle(sceneCode);
            if (rewardTitle) {
                return rewardTitle;
            }
        }

        if (sceneDirectory === 'others') {
            const otherTitle = getOtherSceneTitle(sceneCode);
            if (otherTitle) {
                return otherTitle;
            }
        }

        return window.t('gallery.scene_code_title', {
            prefix: window.t(config.titlePrefixKey || 'gallery.prefix_other'),
            code: sceneCode
        });
    }

    function getSceneDirectoryForCategory(category) {
        const normalizedCategory = normalizeGalleryCategoryKey(category);
        if (normalizedCategory === 'attack') {
            return 'attacks';
        }
        if (normalizedCategory === 'reward') {
            return 'rewards';
        }
        return 'others';
    }

    function getContentCategoryForSceneDirectory(sceneDirectory) {
        if (sceneDirectory === 'attacks') {
            return 'attack';
        }
        if (sceneDirectory === 'rewards') {
            return 'reward';
        }
        return 'other';
    }

    function getEditionAssetRoot(editionKey) {
        if (editionKey === 'gold') {
            return GOLD_ASSET_ROOT;
        }
        if (editionKey === 'diamond') {
            return DIAMOND_ASSET_ROOT;
        }
        return BASE_ASSET_ROOT;
    }

    function getEditionSortPriority(editionKey) {
        if (editionKey === 'gold') {
            return 100;
        }
        if (editionKey === 'diamond') {
            return 200;
        }
        return 0;
    }

    function createSceneUnlockKey(assetRoot, sceneDirectory, sceneCode) {
        return [assetRoot, sceneDirectory, sceneCode].join(':').toLowerCase();
    }

    function getFallbackEntriesForCategory(category) {
        return FALLBACK_GALLERY_ENTRIES.filter((entry) => entry.category === category);
    }

    function getActiveGalleryEntries() {
        return galleryEntriesLoaded ? galleryEntries : FALLBACK_GALLERY_ENTRIES;
    }

    function hasGalleryEntryUnlockKey(unlockKey) {
        return Boolean(unlockKey) && getActiveGalleryEntries().some((entry) => entry && entry.unlockKey === unlockKey);
    }

    function buildSceneEntries(config, category) {
        const nextConfig = config || {};
        const assetRoot = nextConfig.assetRoot || BASE_ASSET_ROOT;
        const sceneDirectory = nextConfig.sceneDirectory;
        const contentCategory = getContentCategoryForSceneDirectory(sceneDirectory);
        const editionTier = nextConfig.editionTier || 'base';
        const sceneCount = nextConfig.sceneCount || 0;
        const scenePrefix = nextConfig.scenePrefix || '';
        const sceneCodes = Array.isArray(nextConfig.sceneCodeList) && nextConfig.sceneCodeList.length > 0
            ? nextConfig.sceneCodeList.slice()
            : Array.from({ length: sceneCount }, (_, sceneIndex) => `${scenePrefix}${sceneIndex + 1}`);
        const entries = sceneCodes.map((sceneCode) => {
            const fileName = `${sceneCode}.mp4`;
            const isCumScene = isDedicatedGalleryCumSceneCode(sceneCode);
            const screenshotFileName = `${sceneCode}.webp`;
            const screenshotAssetRoot = isCumScene ? getCumSceneScreenshotAssetRoot(sceneCode) : assetRoot;
            const src = `${getSceneDirectoryPath(assetRoot, sceneDirectory)}/${fileName}`;
            const otherScenePreviewPath = sceneDirectory === 'others'
                ? getOtherScenePreviewPath(assetRoot, sceneCode)
                : null;

            return {
                id: `${category}-${sceneDirectory}-${sceneCode.toLowerCase()}`,
                category,
                girlId: null,
                girlLabel: '',
                sceneCode,
                contentCategory,
                assetRoot,
                sceneDirectory,
                unlockKey: createSceneUnlockKey(assetRoot, sceneDirectory, sceneCode),
                kind: nextConfig.kind || 'video',
                titlePrefixKey: nextConfig.titlePrefixKey || null,
                title: getSceneEntryTitle(nextConfig, sceneDirectory, sceneCode),
                kickerKey: nextConfig.kickerKey || null,
                kicker: window.t(nextConfig.kickerKey || 'gallery.archive'),
                description: `${sceneDirectory}/${fileName}`,
                src,
                thumb: otherScenePreviewPath || getScreenshotPath(screenshotAssetRoot, sceneDirectory, screenshotFileName),
                lockedThumb: getSceneLockedPreviewPath(assetRoot, sceneDirectory, sceneCode),
                lockSource: 'seen',
                requiredEditionCategory: nextConfig.requiredEditionCategory || null,
                previewBorderTier: nextConfig.previewBorderTier || (isDedicatedGalleryCumSceneCode(sceneCode) ? (getRequiredEditionCategoryForGalleryCumScene(sceneCode, nextConfig) || 'diamond') : null),
                editionTier,
                sortPriority: typeof nextConfig.sortPriority === 'number' ? nextConfig.sortPriority : 0,
                locked: false
            };
        });

        return entries;
    }

    // Returns true for files that exist on disk but must never appear as gallery entries.
    function isDiskExcludedSceneCode(code) {
        const s = String(code || '').trim().toUpperCase();
        // Keep 3S...C reward files as standalone diamond gallery entries; exclude any other C-suffixed files.
        if (/C$/.test(s)) return !isDedicatedGalleryCumSceneCode(s);
        // Cutscene/transition files not intended for gallery display (3CT1–3CT5, etc.).
        if (/^3CT\d/.test(s)) return true;
        // Sub-parts of 3ZN1: only 3ZN1 and 3ZN1V* are gallery entries.
        // 3ZN2, 3ZN3, 3ZN4, 3ZN5 (and their V* variants) are played inside 3ZN1.
        if (/^3ZN([2-9]|\d{2,})/.test(s)) return true;
        return false;
    }

    async function listSceneCodesFromDisk(assetRoot, sceneDirectory) {
        try {
            if (!window.electronAPI || typeof window.electronAPI.listAssetFiles !== 'function') {
                return null;
            }
            const relativeDir = `${assetRoot}/scenes/${sceneDirectory}`;
            const files = await window.electronAPI.listAssetFiles(relativeDir);
            return files
                .filter((name) => /\.mp4$/i.test(name))
                .map((name) => name.replace(/\.mp4$/i, ''))
                .filter((code) => !isDiskExcludedSceneCode(code));
        } catch (err) {
            return null;
        }
    }

    // Returns a sort key [prefixStr, number, suffixStr] for natural ordering within a type group.
    // E.g. '3SHD4T' → ['3SHD', 4, 'T'], '3SHD4' → ['3SHD', 4, '']
    function getSceneCodeSortKey(code) {
        const s = String(code || '').trim().toUpperCase();
        let match = s.match(/^(3AD|3AN)(\d+)(?:V(\d+))?$/);
        if (match) {
            return [match[1], Number(match[2]), String(Number(match[3]) || 1).padStart(2, '0')];
        }

        match = s.match(/^(3AG)(\d+)?(?:V(\d+))?$/);
        if (match) {
            return [match[1], Number(match[2]) || 1, String(Number(match[3]) || 1).padStart(2, '0')];
        }

        match = s.match(/^(3AZ\d+S)(\d+)?$/);
        if (match) {
            return [match[1], Number(match[2]) || 1, ''];
        }

        match = s.match(/^(.*?)(\d+)([A-Z]*)$/);
        if (!match) {
            return [s, 0, ''];
        }
        return [match[1], Number(match[2]), match[3]];
    }

    // Find where a new disk-discovered code should be inserted among already-ordered codes.
    function findInsertionIndex(list, newCode) {
        const newKey = getSceneCodeSortKey(newCode);
        let bestIdx = list.length;

        for (let i = 0; i < list.length; i++) {
            const key = getSceneCodeSortKey(list[i]);
            if (key[0] !== newKey[0]) {
                continue;
            }
            if (key[1] < newKey[1] || (key[1] === newKey[1] && key[2] <= newKey[2])) {
                bestIdx = i + 1;
            }
        }

        return bestIdx;
    }

    // Returns a map of { sceneCode: true } for all altar scene codes that are
    // explicitly configured via the Update Manager AND belong to the given assetRoot.
    // This prevents codes from one edition tier from bleeding into another tier's gallery list.
    function getAltarConfigPinnedSceneCodes(assetRoot) {
        const pinned = {};

        // Each entry maps an altar route to its scene code prefix and which asset root it lives in.
        // hasCum/hasTransition control which variant suffixes are generated.
        // hasCum routes deliver their cum (…C) variant in a different asset root than
        // their base/transition scenes: helpNun/helpDemon base scenes live in the BASE
        // root but their cum videos ship in the DIAMOND root. cumAssetRoot records where
        // the …C variant lives so it gets pinned when THAT root is being scanned (a base
        // scan must not pin a …C code whose file isn't there, and vice-versa).
        const ALTAR_ROUTE_SCENE_MAP = [
            { routeKey: 'helpNun', prefix: '3SHN', assetRoot: BASE_ASSET_ROOT, hasTransition: true, hasCum: true, cumAssetRoot: DIAMOND_ASSET_ROOT },
            { routeKey: 'helpDemon', prefix: '3SHD', assetRoot: BASE_ASSET_ROOT, hasTransition: true, hasCum: true, cumAssetRoot: DIAMOND_ASSET_ROOT },
            { routeKey: 'demonExorcism', prefix: '3SDE', assetRoot: GOLD_ASSET_ROOT, hasTransition: true, hasCum: true },
            { routeKey: 'nunCorruption', prefix: '3SCN', assetRoot: DIAMOND_ASSET_ROOT, hasTransition: true, hasCum: true }
        ];

        for (const entry of ALTAR_ROUTE_SCENE_MAP) {
            const cumAssetRoot = entry.cumAssetRoot || entry.assetRoot;
            const scanningBase = entry.assetRoot === assetRoot;
            const scanningCum = entry.hasCum && cumAssetRoot === assetRoot;
            // Skip routes that touch neither the base nor the cum asset root being scanned.
            if (!scanningBase && !scanningCum) {
                continue;
            }

            let count = 1;
            if (typeof window.getTheNunAltarRouteConfig === 'function') {
                const routeConfig = window.getTheNunAltarRouteConfig(entry.routeKey);
                if (routeConfig && typeof routeConfig.count === 'number' && routeConfig.count > 0) {
                    count = routeConfig.count;
                }
            } else if (window.THE_NUN_UPDATE_MANAGER_CONFIG &&
                window.THE_NUN_UPDATE_MANAGER_CONFIG.altarRoutes &&
                window.THE_NUN_UPDATE_MANAGER_CONFIG.altarRoutes[entry.routeKey]) {
                const raw = window.THE_NUN_UPDATE_MANAGER_CONFIG.altarRoutes[entry.routeKey].count;
                if (typeof raw === 'number' && raw > 0) {
                    count = raw;
                }
            }

            for (let i = 1; i <= count; i++) {
                const baseCode = `${entry.prefix}${i}`;
                if (scanningBase) {
                    pinned[baseCode.toUpperCase()] = true;
                    if (entry.hasTransition) pinned[`${baseCode}T`.toUpperCase()] = true;
                }
                if (scanningCum) {
                    pinned[`${baseCode}C`.toUpperCase()] = true;
                }
            }
        }

        return pinned;
    }

    // diskList is null when the API is unavailable (fallback to static list).
    // When diskList is an array, it is the source of truth: static list provides order only,
    // and codes not present on disk are dropped — EXCEPT for codes in pinnedCodes which are
    // always included (they may have no files yet but are configured by the Update Manager).
    function mergeSceneCodeLists(staticList, diskList, pinnedCodes) {
        const pinned = pinnedCodes && typeof pinnedCodes === 'object' ? pinnedCodes : {};

        if (diskList === null) {
            // No disk info — use static list as-is.
            return (staticList || []).slice();
        }

        if (diskList.length === 0 && staticList && staticList.length > 0) {
            // Empty disk result with a non-empty static list means the asset directory
            // doesn't exist in this build (or the listing API is unavailable, e.g. the
            // web build). Use the static list so entries still appear as edition-locked
            // with their blurred previews — plus any config-pinned altar codes the
            // static list predates, so Update-Manager-driven scenes aren't dropped.
            const staticOnly = (staticList || []).slice();
            const staticSeen = new Set(staticOnly.map((c) => String(c).toUpperCase()));
            for (const pinnedCode of Object.keys(pinned)) {
                if (!staticSeen.has(pinnedCode)) {
                    staticSeen.add(pinnedCode);
                    const insertIdx = findInsertionIndex(staticOnly, pinnedCode);
                    staticOnly.splice(insertIdx, 0, pinnedCode);
                }
            }
            return staticOnly;
        }

        const diskSet = new Set(diskList.map((c) => String(c).toUpperCase()));
        const seen = new Set((staticList || []).map((c) => String(c).toUpperCase()));
        // Start from static order, insert any disk-only codes at the right position.
        const merged = (staticList || []).slice();

        for (const code of diskList) {
            if (seen.has(String(code).toUpperCase())) {
                continue;
            }
            seen.add(String(code).toUpperCase());
            const insertIdx = findInsertionIndex(merged, code);
            merged.splice(insertIdx, 0, code);
        }

        // Insert any pinned (config-driven) codes that are not yet in the merged list.
        for (const pinnedCode of Object.keys(pinned)) {
            if (!seen.has(pinnedCode)) {
                seen.add(pinnedCode);
                const insertIdx = findInsertionIndex(merged, pinnedCode);
                merged.splice(insertIdx, 0, pinnedCode);
            }
        }

        // Keep codes that exist on disk OR are explicitly pinned by altar config.
        return merged.filter((code) =>
            diskSet.has(String(code).toUpperCase()) ||
            Boolean(pinned[String(code).toUpperCase()])
        );
    }

    async function loadDynamicGalleryEntries() {
        const baseCategoryEntries = await Promise.all(
            Object.entries(CATEGORY_SCENE_CONFIGS).map(async ([category, config]) => {
                const staticList = STATIC_SCENE_CODE_LISTS.base && STATIC_SCENE_CODE_LISTS.base[category];
                const diskList = await listSceneCodesFromDisk(config.assetRoot, config.sceneDirectory);
                // Pass altar pinned codes for base rewards (helpNun/helpDemon scenes live here).
                const pinnedCodes = category === 'reward' ? getAltarConfigPinnedSceneCodes(config.assetRoot) : {};
                const sceneCodeList = mergeSceneCodeLists(staticList, diskList, pinnedCodes);
                const entries = buildSceneEntries({
                    ...config,
                    editionTier: 'base',
                    sortPriority: 0,
                    sceneCount: 0,
                    scenePrefix: '',
                    sceneCodeList
                }, category);
                return entries.length ? entries : getFallbackEntriesForCategory(category);
            })
        );
        const premiumCategoryEntries = await Promise.all(
            Object.entries(PREMIUM_CATEGORY_SCENE_CONFIGS).map(async ([category, configs]) => {
                const groups = await Promise.all(
                    configs.map(async (config) => {
                        const contentCategory = getContentCategoryForSceneDirectory(config.sceneDirectory);
                        const staticList = STATIC_SCENE_CODE_LISTS[category] && STATIC_SCENE_CODE_LISTS[category][contentCategory];
                        const diskList = await listSceneCodesFromDisk(config.assetRoot, config.sceneDirectory);
                        // Only pin altar codes that belong to this specific asset root.
                        const pinnedCodes = contentCategory === 'reward' ? getAltarConfigPinnedSceneCodes(config.assetRoot) : {};
                        const sceneCodeList = mergeSceneCodeLists(staticList, diskList, pinnedCodes);
                        return buildSceneEntries({
                            ...config,
                            editionTier: category,
                            sortPriority: getEditionSortPriority(category),
                            sceneCount: 0,
                            scenePrefix: '',
                            sceneCodeList
                        }, category);
                    })
                );
                const entries = groups.flat();
                const premiumEntries = (entries.length ? entries : getFallbackEntriesForCategory(category))
                    .map((entry) => ({ ...entry, previewBorderTier: entry.previewBorderTier || category }));
                const duplicatedEntries = premiumEntries.map((entry) => ({
                    ...entry,
                    id: `${entry.id}-duplicate`,
                    category: entry.contentCategory || getContentCategoryForSceneDirectory(entry.sceneDirectory),
                    requiredEditionCategory: category,
                    previewBorderTier: category,
                    sortPriority: getEditionSortPriority(category)
                }));

                return {
                    premiumEntries,
                    duplicatedEntries
                };
            })
        );

        return baseCategoryEntries.flat()
            .concat(premiumCategoryEntries.flatMap((entryGroup) => entryGroup.duplicatedEntries))
            .concat(premiumCategoryEntries.flatMap((entryGroup) => entryGroup.premiumEntries));
    }

    async function ensureGalleryEntriesLoaded() {
        if (galleryEntriesLoaded) {
            return galleryEntries;
        }

        if (!galleryEntriesLoadPromise) {
            galleryEntriesLoadPromise = loadDynamicGalleryEntries()
                .then((entries) => {
                    galleryEntries = entries.length ? entries : FALLBACK_GALLERY_ENTRIES.slice();
                    galleryEntriesLoaded = true;
                    return galleryEntries;
                })
                .finally(() => {
                    galleryEntriesLoadPromise = null;
                });
        }

        return galleryEntriesLoadPromise;
    }

    function getGalleryStorageKey() {
        if (typeof window.getTheNunScopedStorageKey === 'function') {
            return window.getTheNunScopedStorageKey(GALLERY_STORAGE_KEY);
        }

        return GALLERY_STORAGE_KEY;
    }

    function normalizeGalleryStorage(rawState) {
        const state = rawState && typeof rawState === 'object' ? rawState : {};
        const seenScenes = state.seenScenes && typeof state.seenScenes === 'object' ? state.seenScenes : {};
        const byKey = seenScenes.byKey && typeof seenScenes.byKey === 'object' ? seenScenes.byKey : {};
        const currentCategory = normalizeGalleryCategoryKey(state.currentCategory);

        return {
            ...state,
            currentCategory: currentCategory || 'attack',
            archiveUnlocked: Boolean(state.archiveUnlocked),
            seenScenes: {
                ...seenScenes,
                byKey: { ...byKey }
            }
        };
    }

    function getGalleryStorage() {
        try {
            return normalizeGalleryStorage(JSON.parse(window.localStorage.getItem(getGalleryStorageKey()) || '{}'));
        } catch (error) {
            return normalizeGalleryStorage({});
        }
    }

    function saveGalleryStorage(nextState) {
        window.localStorage.setItem(getGalleryStorageKey(), JSON.stringify(normalizeGalleryStorage(nextState)));

        if (!(typeof window.isTheNunSaveSyncSuppressed === 'function' && window.isTheNunSaveSyncSuppressed())
            && typeof window.requestTheNunSaveWrite === 'function') {
            window.requestTheNunSaveWrite();
        }
    }

    function isSceneSeen(unlockKey) {
        return Boolean(unlockKey && getGalleryStorage().seenScenes.byKey[unlockKey]);
    }

    function setSceneSeen(unlockKey, value) {
        if (!unlockKey) {
            return false;
        }

        const galleryStorage = getGalleryStorage();
        const nextValue = Boolean(value);
        const currentValue = Boolean(galleryStorage.seenScenes.byKey[unlockKey]);

        if (currentValue === nextValue) {
            return false;
        }

        galleryStorage.seenScenes.byKey[unlockKey] = nextValue;
        saveGalleryStorage(galleryStorage);
        return true;
    }

    function unlockAllGalleryContent() {
        const galleryStorage = getGalleryStorage();
        galleryStorage.archiveUnlocked = true;

        getActiveGalleryEntries().forEach((entry) => {
            if (entry && entry.unlockKey) {
                galleryStorage.seenScenes.byKey[entry.unlockKey] = true;
            }
        });

        saveGalleryStorage(galleryStorage);
    }

    function isArchiveUnlocked() {
        return Boolean(getGalleryStorage().archiveUnlocked);
    }

    function setArchiveUnlocked(value) {
        const current = getGalleryStorage();
        current.archiveUnlocked = Boolean(value);
        saveGalleryStorage(current);
    }

    function canAccessCategory(category) {
        if (typeof window.canAccessGalleryCategory === 'function') {
            return Boolean(window.canAccessGalleryCategory(category));
        }

        return category !== 'gold' && category !== 'diamond';
    }

    function canUnlockArchive() {
        if (typeof window.canUnlockGalleryArchive === 'function') {
            return Boolean(window.canUnlockGalleryArchive());
        }

        return false;
    }

    // The Steam build ships every tier unlocked, so there is nothing to unlock or buy.
    // It therefore hides the "Gallery Unlock" button entirely (mirrors the Lewd Elevator
    // Steam build). NOTE: never express this by making canUnlockArchive() false — that
    // flag means "this edition is ALLOWED to unlock", and turning it off would switch on
    // the locked styling / upgrade prompt, i.e. it would make the build look MORE locked,
    // which is the opposite of the intent.
    function isSteamGalleryBuild() {
        return typeof window.isSteamBuild === 'function' && window.isSteamBuild();
    }

    function ensureAccessibleCategory() {
        if (!canAccessCategory(galleryState.currentCategory)) {
            galleryState.currentCategory = 'attack';
            galleryState.currentCharacterFilter = null;
            galleryState.currentIndex = 0;
        }
    }

    function getVisibleEntry(entry) {
        if (!entry) {
            return null;
        }

        const archiveUnlocked = isArchiveUnlocked();
        const isEditionLocked = Boolean(entry.requiredEditionCategory && !canAccessCategory(entry.requiredEditionCategory));
        const isSeenLocked = entry.lockSource === 'seen' && !archiveUnlocked && !isSceneSeen(entry.unlockKey);
        const isArchiveLocked = entry.lockSource !== 'seen' && Boolean(entry.locked && !archiveUnlocked);
        let lockReason = null;

        if (isEditionLocked) {
            lockReason = 'edition';
        } else if (isSeenLocked) {
            lockReason = 'seen';
        } else if (isArchiveLocked) {
            lockReason = 'archive';
        }

        return Object.assign({}, entry, {
            isLocked: Boolean(isEditionLocked || isSeenLocked || isArchiveLocked),
            isEditionLocked,
            lockReason
        });
    }

    function getCategoryEntries(category) {
        return getActiveGalleryEntries()
            .map((entry, order) => ({ entry, order }))
            .filter(({ entry }) => entry.category === category)
            .filter(({ entry }) => !galleryState.currentCharacterFilter || entry.girlId === galleryState.currentCharacterFilter)
            .sort((left, right) => {
                const leftPriority = typeof left.entry.sortPriority === 'number' ? left.entry.sortPriority : 0;
                const rightPriority = typeof right.entry.sortPriority === 'number' ? right.entry.sortPriority : 0;
                if (leftPriority !== rightPriority) {
                    return leftPriority - rightPriority;
                }

                const leftLocked = getVisibleEntry(left.entry).isLocked ? 1 : 0;
                const rightLocked = getVisibleEntry(right.entry).isLocked ? 1 : 0;
                if (leftLocked !== rightLocked) {
                    return leftLocked - rightLocked;
                }

                return left.order - right.order;
            })
            .map(({ entry }) => getVisibleEntry(entry));
    }

    function getAvailableCharactersForCategory(category) {
        const seenCharacters = new Set();
        return getActiveGalleryEntries()
            .filter((entry) => entry.category === category && entry.girlId && entry.girlLabel)
            .filter((entry) => {
                if (seenCharacters.has(entry.girlId)) {
                    return false;
                }
                seenCharacters.add(entry.girlId);
                return true;
            })
            .map((entry) => ({ id: entry.girlId, label: entry.girlLabel }));
    }

    function updateUnlockedCounter() {
        const unlockedCount = galleryState.filteredEntries.filter((entry) => !entry.isLocked).length;
        const unlockedCountEl = document.getElementById('unlocked_count');
        const totalCountEl = document.getElementById('total_count');
        if (unlockedCountEl) {
            unlockedCountEl.textContent = String(unlockedCount);
        }
        if (totalCountEl) {
            totalCountEl.textContent = String(galleryState.filteredEntries.length);
        }
    }

    function updateGalleryUnlockButtonState() {
        const button = document.querySelector('.gallery_unlock_button');
        if (!button) {
            return;
        }
        if (isSteamGalleryBuild()) {
            button.style.display = 'none';
            return;
        }
        const unlocked = isArchiveUnlocked();
        const canUnlock = canUnlockArchive();
        button.classList.toggle('is-complete', unlocked);
        button.classList.toggle('is-locked', !canUnlock && !unlocked);
        button.disabled = unlocked;
        button.textContent = window.t(unlocked ? 'gallery.unlocked' : 'gallery.unlock');
    }

    function stopGalleryAmbientAudio() {
        const struggleAudio = document.getElementById('struggle-audio');
        if (struggleAudio && !struggleAudio.paused) {
            struggleAudio.pause();
            struggleAudio.currentTime = 0;
        }
        const nunwalkAudio = document.getElementById('gallery-nunwalk-audio');
        if (nunwalkAudio && !nunwalkAudio.paused) {
            nunwalkAudio.pause();
            nunwalkAudio.currentTime = 0;
        }
    }

    function setSceneFocusState(isFocused) {
        galleryState.isSceneFocused = Boolean(isFocused);

        const galleryUi = document.querySelector('.Gallery_UI');
        if (galleryUi) {
            galleryUi.classList.toggle('is-scene-focused', galleryState.isSceneFocused);
        }

        const sceneContainer = document.querySelector('.gallery_scene');
        if (sceneContainer) {
            sceneContainer.classList.toggle('is-focused', galleryState.isSceneFocused);
        }

        // Determine current scene type for sound routing.
        const currentEntry = galleryState.filteredEntries[galleryState.currentIndex] || null;
        const sceneCode = String(currentEntry?.sceneCode || '').trim().toUpperCase();
        const sceneDirectory = String(currentEntry?.sceneDirectory || '').trim().toLowerCase();
        const isOthersScene = sceneDirectory === 'others';
        const isRewardScene = sceneDirectory === 'rewards';
        const isDemonStruggle = /^3AZ\d+S$/.test(sceneCode);
        const isNunDrag = /^3AG(?:V\d+)?$/.test(sceneCode);
        // Scenes that unmute the video (attacks + rewards have audio in the video)
        const usesVideoAudio = !isOthersScene && !isDemonStruggle && !isNunDrag;
        // Only attack scenes (not rewards) get the extra attack slide SFX layer —
        // except the "Attack the Nun / Demon" intros and struggle loops.
        const usesAttackSfx = usesVideoAudio && !isRewardScene && !isAltarAttackRouteSceneCode(sceneCode);

        // Mute / unmute scene players based on focus state and scene type.
        const players = [
            sceneContainer ? sceneContainer.querySelector('.scene_player') : null,
            sceneContainer ? sceneContainer.querySelector('.scene_player_b') : null
        ].filter(Boolean);

        players.forEach((p) => {
            // Only unmute video for scenes that use video audio.
            p.muted = !(galleryState.isSceneFocused && usesVideoAudio);
            if (!galleryState.isSceneFocused) {
                window.stopAttackSlideLoopSfx?.(p);
            }
        });

        if (galleryState.isSceneFocused) {
            if (usesAttackSfx) {
                // Start attack slide SFX on the currently-visible (active) player.
                const activePlayer = players.find((p) => p.classList.contains('is-visible') && !p.paused);
                if (activePlayer) {
                    window.startAttackSlideLoopSfx?.(activePlayer);
                }
            } else if (isDemonStruggle) {
                const struggleAudio = document.getElementById('struggle-audio');
                if (struggleAudio) {
                    struggleAudio.currentTime = 0;
                    struggleAudio.play().catch(() => { });
                }
            } else if (isNunDrag) {
                const nunwalkAudio = document.getElementById('gallery-nunwalk-audio');
                if (nunwalkAudio) {
                    nunwalkAudio.currentTime = 0;
                    nunwalkAudio.play().catch(() => { });
                }
            }
            // isOthersScene: no video audio, no SFX, no ambient — silence.
        } else {
            // Unfocusing — stop any gallery-specific ambient audio.
            stopGalleryAmbientAudio();
        }
    }

    function toggleSceneFocusState() {
        const currentEntry = getVisibleEntry(galleryState.filteredEntries[galleryState.currentIndex]);
        if (!currentEntry || currentEntry.isLocked) {
            return;
        }

        setSceneFocusState(!galleryState.isSceneFocused);
    }

    function showSceneLockedPopup(entry) {
        const visibleEntry = getVisibleEntry(entry);
        if (!visibleEntry) {
            return;
        }

        if (visibleEntry.lockReason === 'edition' && visibleEntry.requiredEditionCategory) {
            showGalleryUpgradePopup(visibleEntry.requiredEditionCategory);
        }
    }

    function getPreviewThumbPath(entry) {
        if (!entry) {
            return '';
        }

        if (entry.isLocked && entry.lockedThumb) {
            return entry.lockedThumb;
        }

        return entry.thumb || entry.src;
    }

    function ensureSelectionContent() {
        const selection = document.querySelector('.gallery_selection');
        if (!selection) {
            return null;
        }

        let content = selection.querySelector('.gallery_selection_content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'gallery_selection_content';
            selection.insertBefore(content, selection.querySelector('.unlocked_counter'));
        }

        return content;
    }

    function ensureGalleryCumButton() {
        const sceneContainer = document.querySelector('.gallery_scene');
        if (!sceneContainer) {
            return null;
        }

        let button = sceneContainer.querySelector('.gallery_cum_button');
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'gallery_cum_button hidden';

            const icon = document.createElement('img');
            icon.className = 'gallery_cum_button_icon';
            icon.src = 'assets/icons/cum.png';
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'gallery_cum_button_label';
            label.setAttribute('data-i18n', 'common.cum');
            label.textContent = window.t('common.cum');

            button.appendChild(icon);
            button.appendChild(label);
            button.addEventListener('click', (event) => handleGalleryCumButtonClick(event));
            sceneContainer.appendChild(button);
        }

        return button;
    }

    function getGalleryOtherZonePlaybackConfig(entry) {
        if (!entry || entry.kind !== 'video' || entry.sceneDirectory !== 'others') {
            return null;
        }

        const sceneCode = String(entry.sceneCode || '').trim().toUpperCase();
        const match = sceneCode.match(/^3ZN1(?:V(\d+))?$/);
        if (!match) {
            return null;
        }

        return {
            assetRoot: entry.assetRoot,
            phase: Number(match[1]) || 1,
            currentZone: 1,
            totalZones: 5
        };
    }

    function getGalleryOtherZoneSceneCode(zonePlayback, zoneNumber) {
        if (!zonePlayback) {
            return '';
        }

        const safeZone = Math.max(1, Math.min(zonePlayback.totalZones || 5, Number(zoneNumber) || 1));
        return zonePlayback.phase > 1
            ? `3ZN${safeZone}V${zonePlayback.phase}`
            : `3ZN${safeZone}`;
    }

    function getGalleryOtherZoneSource(zonePlayback, zoneNumber) {
        const sceneCode = getGalleryOtherZoneSceneCode(zonePlayback, zoneNumber);
        return sceneCode
            ? `${getSceneDirectoryPath(zonePlayback.assetRoot, 'others')}/${sceneCode}.mp4`
            : '';
    }

    function ensureGalleryZoneSwitcher() {
        const sceneContainer = document.querySelector('.gallery_scene');
        if (!sceneContainer) {
            return null;
        }

        let switcher = sceneContainer.querySelector('.gallery_zone_switcher');
        if (!switcher) {
            switcher = document.createElement('div');
            switcher.className = 'gallery_zone_switcher hidden';
            switcher.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });

            for (let zoneNumber = 1; zoneNumber <= 5; zoneNumber += 1) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'gallery_zone_switcher_button';
                button.textContent = String(zoneNumber);
                button.dataset.zoneNumber = String(zoneNumber);
                button.addEventListener('click', (event) => handleGalleryZoneSwitcherClick(event, zoneNumber));
                switcher.appendChild(button);
            }

            sceneContainer.appendChild(switcher);
        }

        return switcher;
    }

    function resetGalleryOtherZonePlayback() {
        galleryState.otherZonePlayback = null;

        const switcher = ensureGalleryZoneSwitcher();
        if (!switcher) {
            return;
        }

        switcher.classList.add('hidden');
        switcher.querySelectorAll('.gallery_zone_switcher_button').forEach((button) => {
            button.classList.remove('is-selected');
        });
    }

    function updateGalleryZoneSwitcher() {
        const switcher = ensureGalleryZoneSwitcher();
        if (!switcher) {
            return;
        }

        const zonePlayback = galleryState.otherZonePlayback;
        switcher.classList.toggle('hidden', !zonePlayback);

        switcher.querySelectorAll('.gallery_zone_switcher_button').forEach((button) => {
            const zoneNumber = Number(button.dataset.zoneNumber);
            button.classList.toggle('is-selected', Boolean(zonePlayback && zoneNumber === zonePlayback.currentZone));
        });
    }

    // Normalise a video src to an absolute URL for reliable equality checks.
    function normalizeVideoSrc(src) {
        if (!src) {
            return '';
        }
        try {
            return new URL(src, window.location.href).href;
        } catch (_) {
            return src;
        }
    }

    // Returns the source that should be preloaded into the standby player
    // so it is ready to play immediately after `currentSource` finishes.
    function getGalleryRewardSourceAfterNext(rewardPlayback, currentSource) {
        if (!rewardPlayback || !rewardPlayback.baseLoopSource) {
            return null;
        }
        if (!rewardPlayback.cumEnabled || !rewardPlayback.cumLoopSource) {
            return rewardPlayback.baseLoopSource;
        }
        return currentSource === rewardPlayback.baseLoopSource
            ? rewardPlayback.cumLoopSource
            : rewardPlayback.baseLoopSource;
    }

    // Returns { active, standby } — the two ping-pong players for reward sequences.
    // active  = player currently visible / playing
    // standby = player hidden, used for preloading the next segment
    function getGalleryRewardPlayers() {
        const sceneContainer = document.querySelector('.gallery_scene');
        if (!sceneContainer) {
            return { active: null, standby: null };
        }
        const playerA = sceneContainer.querySelector('.scene_player');
        const playerB = sceneContainer.querySelector('.scene_player_b');
        const rewardPlayback = galleryState.rewardPlayback;
        const activeIsB = rewardPlayback ? Boolean(rewardPlayback.activePlayerIsB) : false;
        return {
            active: activeIsB ? playerB : playerA,
            standby: activeIsB ? playerA : playerB
        };
    }

    // Load `source` into the standby player without playing it,
    // so it is ready for an instant ping-pong swap.
    function preloadIntoGalleryStandby(source) {
        const rewardPlayback = galleryState.rewardPlayback;
        if (!source || !rewardPlayback) {
            return;
        }
        const { standby } = getGalleryRewardPlayers();
        if (!standby) {
            return;
        }
        const normNew = normalizeVideoSrc(source);
        const normCurrent = normalizeVideoSrc(standby.getAttribute('src') || standby.src);
        if (normNew === normCurrent) {
            return; // already loaded
        }
        standby.pause();
        standby.onended = null;
        standby.onerror = null;
        standby.loop = false;
        standby.src = source;
        standby.load();
    }

    function resetGalleryRewardPlayback() {
        galleryState.rewardPlayback = null;

        const sceneContainer = document.querySelector('.gallery_scene');
        if (sceneContainer) {
            ['.scene_player', '.scene_player_b'].forEach(function (sel) {
                const p = sceneContainer.querySelector(sel);
                if (!p) {
                    return;
                }
                p.pause();
                p.onended = null;
                p.onerror = null;
                p.loop = false;
                p.removeAttribute('src');
                p.load();
                p.classList.remove('is-visible');
            });
        }

        const cumButton = ensureGalleryCumButton();
        if (cumButton) {
            cumButton.classList.add('hidden');
            cumButton.classList.remove('is-selected');
            cumButton.setAttribute('aria-pressed', 'false');
        }
    }

    function playGalleryOtherZoneVideo(player, zonePlayback) {
        if (!player || !zonePlayback) {
            return;
        }

        const nextSource = getGalleryOtherZoneSource(zonePlayback, zonePlayback.currentZone);
        if (!nextSource) {
            return;
        }

        playGalleryVideoSource(player, nextSource, {
            loop: true,
            onPlayError: (error) => {
                console.warn('Failed to play gallery zone scene:', error);
            }
        });
    }

    function handleGalleryZoneSwitcherClick(event, zoneNumber) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const zonePlayback = galleryState.otherZonePlayback;
        if (!zonePlayback) {
            return;
        }

        zonePlayback.currentZone = Math.max(1, Math.min(zonePlayback.totalZones || 5, Number(zoneNumber) || 1));
        updateGalleryZoneSwitcher();

        const player = document.querySelector('.scene_player');
        if (!player || !player.classList.contains('is-visible')) {
            return;
        }

        playGalleryOtherZoneVideo(player, zonePlayback);
    }

    function updateGalleryCumButton() {
        const cumButton = ensureGalleryCumButton();
        if (!cumButton) {
            return;
        }

        const rewardPlayback = galleryState.rewardPlayback;
        const isVisible = Boolean(rewardPlayback && rewardPlayback.supportsCum);
        const isSelected = Boolean(rewardPlayback && rewardPlayback.cumEnabled);

        cumButton.classList.toggle('hidden', !isVisible);
        cumButton.classList.toggle('is-selected', isSelected);
        cumButton.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }

    function getGalleryRewardPlaybackConfig(entry) {
        if (!entry || entry.kind !== 'video' || entry.sceneDirectory !== 'rewards') {
            return null;
        }

        const sceneCode = String(entry.sceneCode || '').trim().toUpperCase();
        if (!isGalleryCumRewardSceneCode(sceneCode)) {
            return null;
        }

        const requiredEditionCategory = getRequiredEditionCategoryForGalleryCumScene(sceneCode, entry);
        const cumAssetRoot = requiredEditionCategory
            ? getEditionAssetRoot(requiredEditionCategory)
            : entry.assetRoot;

        return {
            sceneCode,
            requiredEditionCategory,
            baseLoopSource: `${entry.assetRoot}/scenes/rewards/${sceneCode}.mp4`,
            cumLoopSource: `${cumAssetRoot}/scenes/rewards/${sceneCode}C.mp4`,
            supportsCum: true,
            cumEnabled: false,
            loopIndex: 0,
            currentLoopSource: null
        };
    }

    function playGalleryVideoSource(player, source, options) {
        if (!player || !source) {
            return;
        }

        const nextOptions = options || {};
        player.onended = nextOptions.onEnded || null;
        player.onerror = nextOptions.onError || null;
        player.loop = Boolean(nextOptions.loop);
        player.src = source;
        player.currentTime = 0;

        const playPromise = player.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                if (typeof nextOptions.onPlayError === 'function') {
                    nextOptions.onPlayError(error);
                    return;
                }

                console.warn('Failed to play gallery scene:', error);
            });
        }
    }

    function getGalleryRewardLoopSources(rewardPlayback) {
        if (!rewardPlayback) {
            return [];
        }

        if (rewardPlayback.cumEnabled && rewardPlayback.cumLoopSource) {
            return [rewardPlayback.baseLoopSource, rewardPlayback.cumLoopSource];
        }

        return rewardPlayback.baseLoopSource ? [rewardPlayback.baseLoopSource] : [];
    }

    function getNextGalleryRewardLoopSource(rewardPlayback) {
        if (!rewardPlayback || !rewardPlayback.baseLoopSource) {
            return null;
        }

        if (!rewardPlayback.cumEnabled || !rewardPlayback.cumLoopSource) {
            return rewardPlayback.baseLoopSource;
        }

        return rewardPlayback.currentLoopSource === rewardPlayback.baseLoopSource
            ? rewardPlayback.cumLoopSource
            : rewardPlayback.baseLoopSource;
    }

    function playNextGalleryRewardLoopSegment() {
        const rewardPlayback = galleryState.rewardPlayback;
        if (!rewardPlayback) {
            return;
        }

        const nextSource = getNextGalleryRewardLoopSource(rewardPlayback);
        if (!nextSource) {
            return;
        }

        rewardPlayback.currentLoopSource = nextSource;

        const { active, standby } = getGalleryRewardPlayers();
        if (!active) {
            return;
        }

        const standbyNorm = normalizeVideoSrc(standby ? (standby.getAttribute('src') || standby.src) : '');
        const nextNorm = normalizeVideoSrc(nextSource);
        // Standby is ready when it has the correct source buffered (readyState >= 2 = HAVE_CURRENT_DATA).
        const canSwap = Boolean(standby && standbyNorm === nextNorm && standby.readyState >= 2);

        if (canSwap) {
            // --- Ping-pong swap: standby is already buffered, start it immediately ---
            standby.currentTime = 0;
            standby.loop = false;
            standby.muted = !galleryState.isSceneFocused;
            standby.onended = function () {
                playNextGalleryRewardLoopSegment();
            };
            standby.onerror = function () {
                console.warn('Gallery reward ping-pong player error: ' + nextSource);
            };

            const playPromise = standby.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(function (e) {
                    console.warn('Gallery ping-pong play failed:', e);
                });
            }

            // Swap visibility instantly — no decode stall.
            standby.classList.add('is-visible');
            active.classList.remove('is-visible');
            active.pause();
            active.onended = null;
            active.onerror = null;

            // Swap attack slide SFX to the new active player when focused.
            // Reward scenes have audio in the video itself, so no attack SFX layer.
            const _swapEntry = galleryState.filteredEntries[galleryState.currentIndex];
            const _swapDir = String(_swapEntry?.sceneDirectory || '').trim().toLowerCase();
            if (galleryState.isSceneFocused && _swapDir !== 'rewards' && !isAltarAttackRouteSceneCode(_swapEntry?.sceneCode)) {
                window.stopAttackSlideLoopSfx?.(active);
                window.startAttackSlideLoopSfx?.(standby);
            } else {
                window.stopAttackSlideLoopSfx?.(active);
            }

            // Track which player is now active.
            rewardPlayback.activePlayerIsB = !rewardPlayback.activePlayerIsB;

            // Pre-buffer the segment that follows nextSource into the (now-standby) player.
            const afterNextSource = getGalleryRewardSourceAfterNext(rewardPlayback, nextSource);
            preloadIntoGalleryStandby(afterNextSource);
        } else {
            // --- Fallback: normal src assignment on the active player ---
            playGalleryVideoSource(active, nextSource, {
                loop: false,
                onEnded: function () {
                    playNextGalleryRewardLoopSegment();
                },
                onError: function () {
                    console.warn('Failed to load gallery reward loop video: ' + nextSource);
                },
                onPlayError: function (error) {
                    console.warn('Failed to play gallery reward loop video ' + nextSource + ':', error);
                }
            });

            // Begin buffering the upcoming segment on standby.
            const afterNextSource = getGalleryRewardSourceAfterNext(rewardPlayback, nextSource);
            preloadIntoGalleryStandby(afterNextSource);
        }
    }

    function startGalleryRewardPlayback(player, rewardPlayback) {
        if (!player || !rewardPlayback) {
            return;
        }

        rewardPlayback.loopIndex = 0;
        rewardPlayback.currentLoopSource = null;
        rewardPlayback.activePlayerIsB = false; // player (.scene_player) starts as active

        // Start playing on the primary player (already marked is-visible by renderScene).
        playNextGalleryRewardLoopSegment();

        // Immediately begin buffering the source that comes after the first segment
        // (base loop itself if cum is off, or cum source if cum is on).
        const firstSource = rewardPlayback.baseLoopSource;
        const afterFirst = getGalleryRewardSourceAfterNext(rewardPlayback, firstSource);
        preloadIntoGalleryStandby(afterFirst);
    }

    function handleGalleryCumButtonClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }

        const rewardPlayback = galleryState.rewardPlayback;
        if (!rewardPlayback) {
            return;
        }

        const requiredEditionCategory = normalizeGalleryCategoryKey(rewardPlayback.requiredEditionCategory);
        if (requiredEditionCategory && !canAccessCategory(requiredEditionCategory)) {
            showGalleryUpgradePopup(requiredEditionCategory);
            return;
        }

        rewardPlayback.cumEnabled = !rewardPlayback.cumEnabled;
        updateGalleryCumButton();

        // Update the standby preload to match the new sequence so the next
        // ping-pong swap picks up the correct segment without an src change.
        const afterCurrent = getGalleryRewardSourceAfterNext(rewardPlayback, rewardPlayback.currentLoopSource);
        preloadIntoGalleryStandby(afterCurrent);
    }

    function clearSceneMedia() {
        const sceneContainer = document.querySelector('.gallery_scene');
        const image = sceneContainer ? sceneContainer.querySelector('.scene_image') : null;
        setSceneFocusState(false);
        resetGalleryRewardPlayback(); // already clears both players
        resetGalleryOtherZonePlayback();

        if (sceneContainer) {
            ['.scene_player', '.scene_player_b'].forEach(function (sel) {
                const p = sceneContainer.querySelector(sel);
                if (p) {
                    p.pause();
                    p.removeAttribute('src');
                    p.load();
                    p.classList.remove('is-visible');
                }
            });
        }
        if (image) {
            image.removeAttribute('src');
            image.classList.remove('is-visible');
        }
    }

    function isGalleryUiVisible() {
        const galleryUi = document.querySelector('.Gallery_UI');
        return Boolean(galleryUi)
            && window.getComputedStyle(galleryUi).display !== 'none'
            && galleryUi.getAttribute('aria-hidden') !== 'true';
    }

    function runSceneTransition(callback) {
        const overlay = document.querySelector('.scene_transition_overlay');
        if (!overlay) {
            callback();
            return;
        }

        overlay.classList.add('visible');
        window.setTimeout(() => {
            callback();
            window.setTimeout(() => {
                overlay.classList.remove('visible');
            }, 120);
        }, 140);
    }

    function updateSceneMeta(entry) {
        const title = document.getElementById('gallery-meta-title');
        const kicker = document.getElementById('gallery-meta-kicker');
        const description = document.getElementById('gallery-meta-description');

        if (!entry) {
            if (title) {
                title.textContent = window.t('gallery.no_preview');
            }
            if (kicker) {
                kicker.textContent = window.t('gallery.archive');
            }
            if (description) {
                description.textContent = window.t('gallery.no_preview_description');
            }
            return;
        }

        if (title) {
            title.textContent = entry.title || '';
        }
        if (kicker) {
            kicker.textContent = entry.kicker;
        }
        if (description) {
            description.textContent = entry.description || '';
        }
    }

    function renderScene(entry) {
        const visibleEntry = getVisibleEntry(entry);
        const player = document.querySelector('.scene_player');
        const image = document.querySelector('.scene_image');
        setSceneFocusState(false);
        resetGalleryRewardPlayback();
        resetGalleryOtherZonePlayback();

        if (!visibleEntry) {
            clearSceneMedia();
            updateSceneMeta(null);
            return;
        }

        if (visibleEntry.isLocked) {
            if (player) {
                player.pause();
                player.classList.remove('is-visible');
                player.removeAttribute('src');
                player.load();
            }
            const playerB = document.querySelector('.scene_player_b');
            if (playerB) {
                playerB.pause();
                playerB.classList.remove('is-visible');
            }
            if (image) {
                image.src = getPreviewThumbPath(visibleEntry);
                image.classList.add('is-visible');
            }
            updateSceneMeta({
                title: visibleEntry.title,
                kicker: visibleEntry.kicker,
                description: visibleEntry.description,
                category: visibleEntry.category,
                isLocked: true
            });
            return;
        }

        galleryState.rewardPlayback = getGalleryRewardPlaybackConfig(visibleEntry);
        galleryState.otherZonePlayback = getGalleryOtherZonePlaybackConfig(visibleEntry);
        updateGalleryCumButton();
        updateGalleryZoneSwitcher();

        if (!isGalleryUiVisible()) {
            clearSceneMedia();
            updateSceneMeta(visibleEntry);
            return;
        }

        runSceneTransition(() => {
            if (visibleEntry.kind === 'video' && player) {
                if (image) {
                    image.classList.remove('is-visible');
                    image.removeAttribute('src');
                }
                // Always start muted; sound is enabled only when the scene is focused.
                player.muted = true;
                player.classList.add('is-visible');
                if (galleryState.rewardPlayback) {
                    startGalleryRewardPlayback(player, galleryState.rewardPlayback);
                } else if (galleryState.otherZonePlayback) {
                    playGalleryOtherZoneVideo(player, galleryState.otherZonePlayback);
                } else {
                    playGalleryVideoSource(player, visibleEntry.src, {
                        loop: true,
                        onPlayError: (error) => {
                            console.warn('Failed to play gallery scene:', error);
                        }
                    });
                }
            } else if (image) {
                if (player) {
                    player.pause();
                    player.onended = null;
                    player.onerror = null;
                    player.classList.remove('is-visible');
                    player.removeAttribute('src');
                    player.load();
                }
                image.src = visibleEntry.src;
                image.classList.add('is-visible');
            }
            updateSceneMeta(visibleEntry);
        });
    }

    function updateCarouselOffset() {
        const content = document.querySelector('.gallery_selection_content');
        if (!content) {
            return;
        }

        content.style.transform = `translateY(-${galleryState.scrollOffset}px)`;
        content.style.transition = 'transform 0.2s ease-out';
    }

    function getPreviewLayoutMetrics() {
        const previews = Array.from(document.querySelectorAll('.scene_prev'));
        const fixedVisibleCount = Math.min(previews.length || 4, 4);
        if (!previews.length) {
            return {
                previews,
                previewHeight: 0,
                itemHeight: 0,
                visibleCount: 4
            };
        }

        const firstPreview = previews[0];
        const secondPreview = previews[1] || null;
        const previewRect = firstPreview.getBoundingClientRect();
        const previewStyles = window.getComputedStyle(firstPreview);
        const marginBottom = Number.parseFloat(previewStyles.marginBottom) || 0;
        const previewHeight = previewRect.height || firstPreview.offsetHeight || 0;
        const measuredItemHeight = secondPreview ? (secondPreview.offsetTop - firstPreview.offsetTop) : 0;
        const itemHeight = measuredItemHeight > 0 ? measuredItemHeight : (previewHeight + marginBottom);

        return {
            previews,
            previewHeight,
            itemHeight,
            visibleCount: fixedVisibleCount
        };
    }

    function updateArrowPosition() {
        const arrow = document.querySelector('.gallery_arrow');
        if (!arrow) {
            return;
        }

        const { previews } = getPreviewLayoutMetrics();

        if (previews.length === 0) {
            arrow.style.display = 'none';
            return;
        }

        arrow.style.display = 'block';
        const selectedPreview = previews[galleryState.currentIndex] || previews[0];
        const previewTop = selectedPreview ? (selectedPreview.offsetTop - galleryState.scrollOffset) : 0;
        const previewHeight = selectedPreview ? selectedPreview.offsetHeight : 0;
        const arrowHeight = arrow.offsetHeight || 94;
        const topPosition = previewTop + (previewHeight / 2) - (arrowHeight / 2);

        arrow.style.top = `${topPosition}px`;
        arrow.style.transition = 'top 0.3s ease-in-out, transform 0.3s ease-in-out';

        if (previews.length <= 2) {
            arrow.style.transform = 'translateX(-55px)';
            return;
        }

        if (galleryState.arrowPosition === 0 || galleryState.arrowPosition === 3 || galleryState.arrowPosition === 4) {
            arrow.style.transform = 'translateX(-55px)';
        } else if (galleryState.arrowPosition === 1) {
            arrow.style.transform = 'translateX(-9px)';
        } else {
            arrow.style.transform = 'translateX(0px)';
        }
    }

    function handleScroll(event) {
        const delta = event.deltaY;
        event.preventDefault();

        const { itemHeight, visibleCount } = getPreviewLayoutMetrics();
        if (itemHeight <= 0) {
            return;
        }

        const maxAnchorPosition = Math.max(0, visibleCount - 1);
        const downAnchorPosition = Math.min(2, maxAnchorPosition);
        const upAnchorPosition = Math.min(1, maxAnchorPosition);

        if (delta > 0) {
            if (galleryState.currentIndex < galleryState.filteredEntries.length - 1) {
                selectEntry(galleryState.currentIndex + 1, { anchorPosition: downAnchorPosition });
            }
            return;
        }

        if (delta < 0 && galleryState.currentIndex > 0) {
            selectEntry(galleryState.currentIndex - 1, { anchorPosition: upAnchorPosition });
        }
    }

    function selectEntry(index, options) {
        if (index < 0 || index >= galleryState.filteredEntries.length) {
            return;
        }

        const nextOptions = options || {};
        const { itemHeight, visibleCount } = getPreviewLayoutMetrics();
        const safeItemHeight = itemHeight > 0 ? itemHeight : 1;
        const safeVisibleCount = visibleCount > 0 ? visibleCount : 4;
        const maxStartIndex = Math.max(0, galleryState.filteredEntries.length - safeVisibleCount);
        const requestedAnchor = Number.isInteger(nextOptions.anchorPosition) ? nextOptions.anchorPosition : null;
        const clampedRequestedAnchor = requestedAnchor !== null
            ? Math.max(0, Math.min(requestedAnchor, safeVisibleCount - 1))
            : null;
        const desiredAnchor = clampedRequestedAnchor !== null ? clampedRequestedAnchor : Math.min(index, safeVisibleCount - 1);

        galleryState.currentIndex = index;
        const startIndex = Math.max(0, Math.min(index - desiredAnchor, maxStartIndex));
        galleryState.arrowPosition = index - startIndex;
        galleryState.scrollOffset = startIndex * safeItemHeight;

        document.querySelectorAll('.scene_prev').forEach((card, cardIndex) => {
            card.classList.toggle('selected', cardIndex === index);
        });

        updateCarouselOffset();
        updateArrowPosition();
        renderScene(galleryState.filteredEntries[index]);
    }

    function renderSelection() {
        const content = ensureSelectionContent();
        if (!content) {
            return;
        }

        content.replaceChildren();

        galleryState.filteredEntries.forEach((entry, index) => {
            const preview = document.createElement('button');
            const previewBorderClass = entry.previewBorderTier ? ` scene_prev--${entry.previewBorderTier}` : '';
            preview.type = 'button';
            preview.className = `scene_prev${previewBorderClass}${entry.isLocked ? ' scene-prev-locked' : ''}${index === galleryState.currentIndex ? ' selected' : ''}`;
            preview.setAttribute('aria-label', entry.title);
            preview.innerHTML = `
                <img src="${getPreviewThumbPath(entry)}" alt="${entry.title}">
                <div class="scene_prev_text">
                    <div class="videoTitle">${entry.title}</div>
                </div>
            `;
            preview.addEventListener('click', () => {
                if (index === galleryState.currentIndex && !entry.isLocked) {
                    toggleSceneFocusState();
                    return;
                }

                if (entry.isLocked) {
                    if (index !== galleryState.currentIndex) {
                        selectEntry(index, { anchorPosition: 2 });
                        return;
                    }

                    showSceneLockedPopup(entry);
                    return;
                }
                selectEntry(index, { anchorPosition: 2 });
            });
            content.appendChild(preview);
        });

        if (galleryState.filteredEntries.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'scene_prev_text';
            emptyState.innerHTML = `<div class="videoTitle">${window.t('gallery.no_entries')}</div>`;
            content.appendChild(emptyState);
            renderScene(null);
            updateArrowPosition();
            return;
        }

        if (galleryState.currentIndex >= galleryState.filteredEntries.length) {
            galleryState.currentIndex = 0;
        }

        selectEntry(galleryState.currentIndex, { anchorPosition: Math.min(galleryState.currentIndex, 2) });
    }

    function updateCategoryAvailabilityState() {
        document.querySelectorAll('.gallery_category').forEach((button) => {
            const category = button.getAttribute('data-category');
            button.classList.toggle('is-locked', !canAccessCategory(category));
        });
    }

    function renderFilterControls() {
        const filterRoot = document.querySelector('.char_filter');
        if (!filterRoot) {
            return;
        }

        filterRoot.innerHTML = '';
        return;

        const container = document.createElement('div');
        container.className = 'gallery-inmate-filter';

        const label = document.createElement('div');
        label.className = 'gallery-inmate-filter-label';
        label.textContent = window.t('gallery.filter_by_girl');

        const controls = document.createElement('div');
        controls.className = 'gallery-inmate-filter-controls';

        const previousButton = document.createElement('button');
        previousButton.type = 'button';
        previousButton.className = 'gallery-inmate-filter-btn';
        previousButton.textContent = '◀';

        const name = document.createElement('div');
        name.className = 'gallery-inmate-filter-name';

        const nextButton = document.createElement('button');
        nextButton.type = 'button';
        nextButton.className = 'gallery-inmate-filter-btn';
        nextButton.textContent = '▶';

        const names = [{ id: null, label: window.t('gallery.all_files') }].concat(characters);
        const currentIndex = galleryState.currentCharacterFilter
            ? characters.findIndex((entry) => entry.id === galleryState.currentCharacterFilter) + 1
            : 0;
        let activeIndex = currentIndex >= 0 ? currentIndex : 0;
        name.textContent = names[activeIndex].label;

        function cycleCharacter(step) {
            activeIndex = (activeIndex + step + names.length) % names.length;
            const nextIndex = activeIndex;
            galleryState.currentCharacterFilter = names[nextIndex].id;
            refreshCategory();
        }

        previousButton.addEventListener('click', () => cycleCharacter(-1));
        nextButton.addEventListener('click', () => cycleCharacter(1));

        controls.appendChild(previousButton);
        controls.appendChild(name);
        controls.appendChild(nextButton);
        container.appendChild(label);
        container.appendChild(controls);
        filterRoot.appendChild(container);
    }

    function showGalleryPopup(title, message, actions, options) {
        const overlay = document.querySelector('.gallery_overlay');
        if (!overlay) {
            return;
        }

        const popupOptions = options || {};

        overlay.innerHTML = '';
        overlay.style.display = 'flex';

        const popup = document.createElement('div');
        popup.className = 'gallery_popup';
        if (popupOptions.popupClassName) {
            popup.classList.add(popupOptions.popupClassName);
        }
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.setAttribute('aria-label', title);

        const heading = document.createElement('h2');
        heading.textContent = title;

        const body = document.createElement('p');
        body.textContent = message;

        const buttons = document.createElement('div');
        buttons.className = 'popup-buttons';

        (actions || [{ label: window.t('common.close'), action: hideGalleryPopup, className: 'gallery-popup-secondary' }]).forEach((actionDefinition) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = actionDefinition.label;
            const buttonClassName = actionDefinition.className || popupOptions.primaryButtonClassName;
            if (buttonClassName) {
                button.className = buttonClassName;
            }
            button.addEventListener('click', actionDefinition.action);
            buttons.appendChild(button);
        });

        popup.appendChild(heading);
        popup.appendChild(body);
        popup.appendChild(buttons);
        overlay.appendChild(popup);

        galleryState.popupVisible = true;
    }

    function openSupporterFromGalleryPopup() {
        hideGalleryPopup();
        if (typeof window.openPage === 'function') {
            window.openPage('support hub');
        }
    }

    function showGalleryUpgradePopup(category) {
        const normalizedCategory = String(category || '').trim().toLowerCase();
        const isDiamond = normalizedCategory === 'diamond';
        const title = window.t(isDiamond ? 'gallery.diamond_locked_title' : 'gallery.gold_locked_title');
        const message = window.t(isDiamond ? 'gallery.diamond_locked_message' : 'gallery.gold_locked_message');

        showGalleryPopup(
            title,
            message,
            [
                { label: window.t('common.no_thanks'), action: hideGalleryPopup, className: 'gallery-popup-secondary' },
                { label: window.t('common.yes_please'), action: openSupporterFromGalleryPopup }
            ],
            {
                primaryButtonClassName: normalizedCategory === 'diamond'
                    ? 'gallery-popup-primary gallery-popup-primary--diamond'
                    : 'gallery-popup-primary gallery-popup-primary--gold',
                popupClassName: normalizedCategory === 'diamond'
                    ? 'gallery_popup--diamond-lock'
                    : 'gallery_popup--gold-lock'
            }
        );
    }

    function hideGalleryPopup() {
        const overlay = document.querySelector('.gallery_overlay');
        if (!overlay) {
            return;
        }
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        galleryState.popupVisible = false;
    }

    function refreshCategory() {
        ensureAccessibleCategory();
        galleryState.filteredEntries = getCategoryEntries(galleryState.currentCategory);
        galleryState.currentIndex = 0;
        galleryState.arrowPosition = 0;
        galleryState.scrollOffset = 0;
        document.querySelectorAll('.gallery_category').forEach((button) => {
            button.classList.toggle('selected', button.getAttribute('data-category') === galleryState.currentCategory);
        });
        renderFilterControls();
        renderSelection();
        updateUnlockedCounter();
        updateGalleryUnlockButtonState();
    }

    function setActiveCategory(category) {
        if (!canAccessCategory(category)) {
            showGalleryUpgradePopup(category);
            return;
        }

        galleryState.currentCategory = category;
        galleryState.currentCharacterFilter = null;
        document.querySelectorAll('.gallery_category').forEach((button) => {
            button.classList.toggle('selected', button.getAttribute('data-category') === category);
        });

        refreshCategory();
    }

    function bindCategoryListeners() {
        document.querySelectorAll('.gallery_category').forEach((button) => {
            if (button.dataset.bound === 'true') {
                return;
            }
            button.addEventListener('click', () => {
                setActiveCategory(button.getAttribute('data-category'));
            });
            button.dataset.bound = 'true';
        });
    }

    // DEV/QA hook for the dormant dev-actions panel (STEAM builds only). Performs the
    // real unlock-all + refresh, bypassing the Steam no-op below. Not wired to any UI.
    window.forceUnlockAllGalleryContent = function () {
        unlockAllGalleryContent();
        refreshCategory();
        hideGalleryPopup();
    };

    window.handleGalleryUnlockClick = function () {
        // Steam: no unlock flow at all — everything is already available.
        if (isSteamGalleryBuild()) {
            return;
        }

        if (isArchiveUnlocked()) {
            return;
        }

        if (canUnlockArchive()) {
            unlockAllGalleryContent();
            refreshCategory();
            hideGalleryPopup();
            return;
        }

        showGalleryPopup(
            window.t('gallery.unlock'),
            window.t('gallery.unlock_message'),
            [
                {
                    label: window.t('common.no_thanks'),
                    action: hideGalleryPopup,
                    className: 'gallery-popup-secondary'
                },
                {
                    label: window.t('common.yes_please'),
                    action: openSupporterFromGalleryPopup
                }
            ],
            {
                primaryButtonClassName: 'gallery-popup-primary gallery-popup-primary--diamond',
                popupClassName: 'gallery_popup--diamond-lock'
            }
        );
    };

    // Entry titles/kickers/descriptions are generated once when the archive is
    // built, so a language change has to recompute them in place before the
    // gallery is re-rendered.
    function retranslateGalleryEntries() {
        [galleryEntries, FALLBACK_GALLERY_ENTRIES].forEach((collection) => {
            (collection || []).forEach((entry) => {
                if (!entry) {
                    return;
                }
                if (entry.titleKey) {
                    entry.title = window.t(entry.titleKey);
                } else if (entry.sceneCode) {
                    entry.title = getSceneEntryTitle(entry, entry.sceneDirectory, entry.sceneCode);
                }
                if (entry.kickerKey) {
                    entry.kicker = window.t(entry.kickerKey);
                }
                if (entry.descriptionKey) {
                    entry.description = window.t(entry.descriptionKey);
                }
            });
        });
    }

    window.refreshGalleryForLanguage = function () {
        retranslateGalleryEntries();
        updateGalleryUnlockButtonState();
        if (typeof window.isGalleryVisible === 'function' && window.isGalleryVisible()) {
            refreshCategory();
        }
    };

    window.updateGalleryEditionState = async function () {
        await ensureGalleryEntriesLoaded();
        ensureAccessibleCategory();
        updateCategoryAvailabilityState();
        refreshCategory();
    };

    window.initializeGallery = async function () {
        await ensureGalleryEntriesLoaded();

        if (window.galleryInitialized) {
            refreshCategory();
            return;
        }

        window.galleryInitialized = true;
        bindCategoryListeners();
        updateCategoryAvailabilityState();
        refreshCategory();

        const unlockButton = document.querySelector('.gallery_unlock_button');
        const logoButton = document.querySelector('.G_logo');
        const overlay = document.querySelector('.gallery_overlay');
        const selection = document.querySelector('.gallery_selection');
        const scene = document.querySelector('.gallery_scene');

        if (unlockButton && unlockButton.dataset.bound !== 'true') {
            unlockButton.addEventListener('click', () => window.handleGalleryUnlockClick());
            unlockButton.dataset.bound = 'true';
        }
        if (logoButton && logoButton.dataset.bound !== 'true') {
            logoButton.addEventListener('click', () => window.closeGallery());
            logoButton.dataset.bound = 'true';
        }
        if (overlay && overlay.dataset.bound !== 'true') {
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    hideGalleryPopup();
                }
            });
            overlay.dataset.bound = 'true';
        }
        if (selection && selection.dataset.bound !== 'true') {
            selection.addEventListener('wheel', handleScroll, { passive: false });
            window.addEventListener('resize', updateArrowPosition);
            selection.dataset.bound = 'true';
        }
        if (scene && scene.dataset.bound !== 'true') {
            scene.addEventListener('click', () => {
                toggleSceneFocusState();
            });
            scene.dataset.bound = 'true';
        }

        document.addEventListener('keydown', (event) => {
            const galleryUi = document.querySelector('.Gallery_UI');
            if (!galleryUi || galleryUi.style.display === 'none') {
                return;
            }

            if (event.key === 'Escape') {
                if (galleryState.isSceneFocused) {
                    event.preventDefault();
                    setSceneFocusState(false);
                } else if (galleryState.popupVisible) {
                    event.preventDefault();
                    hideGalleryPopup();
                } else {
                    window.closeGallery();
                }
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                handleScroll({ deltaY: 1, preventDefault() { } });
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                handleScroll({ deltaY: -1, preventDefault() { } });
            }
        });
    };

    window.openGallery = async function () {
        const galleryUi = document.querySelector('.Gallery_UI');
        if (!galleryUi) {
            return;
        }

        if (typeof window.initializeGallery === 'function') {
            await window.initializeGallery();
        }
        if (typeof window.closeOtherUIs === 'function') {
            window.closeOtherUIs('gallery');
        }
        if (!window.isGameplayViewVisible || !window.isGameplayViewVisible()) {
            if (typeof window.hideTitleScreen === 'function') {
                window.hideTitleScreen({ immediate: true });
            }
        }

        galleryUi.style.display = 'flex';
        window.requestAnimationFrame(() => {
            galleryUi.classList.add('visible');
            window.updateGalleryEditionState();
        });
        galleryUi.setAttribute('aria-hidden', 'false');
        updatePauseStateForGallery(true);
    };

    window.closeGallery = function (options) {
        const galleryUi = document.querySelector('.Gallery_UI');
        const nextOptions = options || {};
        const shouldRestoreTitleScreen = nextOptions.restoreTitleScreen !== false;

        if (!galleryUi || window.getComputedStyle(galleryUi).display === 'none') {
            return;
        }

        hideGalleryPopup();
        galleryUi.classList.remove('visible');
        galleryUi.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => {
            if (!galleryUi.classList.contains('visible')) {
                galleryUi.style.display = 'none';
            }
        }, 400);
        clearSceneMedia();

        if (shouldRestoreTitleScreen && (!window.isGameplayViewVisible || !window.isGameplayViewVisible()) && typeof window.showTitleScreen === 'function') {
            window.showTitleScreen({ immediate: true });
        }
        updatePauseStateForGallery(false);

        // Reset any pending demon attack that accumulated while the gallery was open,
        // so it does not fire instantly when gameplay resumes.
        if (window.isGameplayViewVisible && window.isGameplayViewVisible()) {
            if (typeof window.clearScheduledDemonAttack === 'function' && window.demonAttacksSystem) {
                window.clearScheduledDemonAttack(window.demonAttacksSystem);
            }
        }
    };

    function updatePauseStateForGallery(isOpen) {
        if (window.gameState) {
            window.gameState.isTimePaused = Boolean(isOpen) || (window.isPauseMenuOpen === true) || (window.settingsOpenedFromPauseMenu === true && document.getElementById('settings-panel') && window.getComputedStyle(document.getElementById('settings-panel')).display !== 'none');
        }
    }

    window.isGalleryVisible = function () {
        const galleryUi = document.querySelector('.Gallery_UI');
        return Boolean(galleryUi) && window.getComputedStyle(galleryUi).display !== 'none';
    };

    window.isGalleryPopupVisible = function () {
        return galleryState.popupVisible;
    };

    window.createTheNunFreshGallerySaveData = function () {
        return normalizeGalleryStorage({});
    };

    window.getTheNunGallerySaveData = function () {
        return normalizeGalleryStorage(getGalleryStorage());
    };

    window.applyTheNunGallerySaveData = function (nextState) {
        const normalizedState = normalizeGalleryStorage(nextState);
        window.localStorage.setItem(getGalleryStorageKey(), JSON.stringify(normalizedState));

        if (window.galleryInitialized) {
            ensureAccessibleCategory();
            refreshCategory();
            updateGalleryUnlockButtonState();
        }

        return normalizedState;
    };

    window.resolveTheNunGallerySceneUnlockKey = function (category, sceneNumber, editionKey) {
        const normalizedCategory = normalizeGalleryCategoryKey(category);
        const normalizedEdition = String(editionKey || (typeof window.getActiveEditionKey === 'function' ? window.getActiveEditionKey() : 'base')).trim().toLowerCase();
        const numericSceneNumber = Math.max(1, Math.min(4, Number(sceneNumber) || 1));
        if (normalizedEdition === 'base' && normalizedCategory === 'attack') {
            const attackSceneCode = BASE_ATTACK_UNLOCK_SCENE_CODES[numericSceneNumber - 1];
            return attackSceneCode
                ? createSceneUnlockKey(getEditionAssetRoot(normalizedEdition), 'attacks', attackSceneCode)
                : null;
        }

        const editionPrefixes = EDITION_SCENE_CODE_PREFIXES[normalizedEdition] || EDITION_SCENE_CODE_PREFIXES.base;
        const sceneDirectory = getSceneDirectoryForCategory(normalizedCategory);
        const prefix = editionPrefixes[normalizedCategory];

        if (!prefix) {
            return null;
        }

        return createSceneUnlockKey(getEditionAssetRoot(normalizedEdition), sceneDirectory, `${prefix}${numericSceneNumber}`);
    };

    window.resolveTheNunGallerySceneUnlockKeyByCode = function (category, sceneCode, editionKey) {
        const normalizedCategory = normalizeGalleryCategoryKey(category);
        const normalizedEdition = String(editionKey || (typeof window.getActiveEditionKey === 'function' ? window.getActiveEditionKey() : 'base')).trim().toLowerCase();
        const normalizedSceneCode = String(sceneCode || '').trim();

        if (!normalizedSceneCode) {
            return null;
        }

        return createSceneUnlockKey(
            getEditionAssetRoot(normalizedEdition),
            getSceneDirectoryForCategory(normalizedCategory),
            normalizedSceneCode
        );
    };

    window.resolveTheNunGallerySceneUnlockKeyBySource = function (source) {
        const normalizedSource = String(source || '').trim().replace(/[?#].*$/, '');
        const match = normalizedSource.match(/^(assets(?:_gold|_diamond)?)\/scenes\/(attacks|rewards|others)\/([^/]+)\.[^.]+$/i);

        if (!match) {
            return null;
        }

        const unlockKey = createSceneUnlockKey(match[1].toLowerCase(), match[2].toLowerCase(), match[3]);
        return hasGalleryEntryUnlockKey(unlockKey) ? unlockKey : null;
    };

    window.markTheNunGallerySceneSeen = function (categoryOrUnlockKey, sceneNumber, editionKey) {
        // Nothing seen in the tutorial's sandbox vigil counts (scripts/tutorial.js).
        if (typeof window.isTheNunTutorialActive === 'function' && window.isTheNunTutorialActive()) {
            return false;
        }
        const unlockKey = typeof sceneNumber === 'undefined'
            ? String(categoryOrUnlockKey || '')
            : window.resolveTheNunGallerySceneUnlockKey(categoryOrUnlockKey, sceneNumber, editionKey);

        if (!unlockKey) {
            return false;
        }

        const didChange = setSceneSeen(unlockKey, true);
        if (didChange && window.galleryInitialized) {
            refreshCategory();
        }
        return didChange;
    };

    window.markTheNunGallerySceneSeenBySource = function (source) {
        const unlockKey = window.resolveTheNunGallerySceneUnlockKeyBySource(source);
        if (!unlockKey) {
            return false;
        }

        return window.markTheNunGallerySceneSeen(unlockKey);
    };

    window.hideGalleryPopup = hideGalleryPopup;
})();
