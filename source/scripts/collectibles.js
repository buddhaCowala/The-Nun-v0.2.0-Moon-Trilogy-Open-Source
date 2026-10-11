/**
 * Scene zone renderer for The Nun.
 *
 * The runtime uses a bottom full-scene video and a top empty image masked with
 * black SVG shapes. Collectible zones are clickable and remove their own mask
 * hole after collection. Presence zones only reveal the full scene.
 */

const DEFAULT_SCENE_WIDTH = 1920;
const DEFAULT_SCENE_HEIGHT = 1080;
const FALLBACK_EMPTY_SCENE_SRC = 'assets/backgrounds/background.png';
const FALLBACK_FULL_SCENE_SRC = 'assets/backgrounds/1R1TRM.mp4';
const COLLECTIBLE_MIN_PER_TYPE = 2;
const COLLECTIBLE_MAX_PER_TYPE = 5;

function createCollectiblesSystem(gameState) {
    const container = document.getElementById('collectibles-layer');
    const sceneRoot = document.getElementById('video-zones');
    const fullVideo = document.getElementById('scene-full-video');
    const emptyImage = document.getElementById('scene-empty-image');
    const emptyOverlay = document.getElementById('scene-empty-overlay');
    const maskBase = document.getElementById('scene-mask-base');
    const maskGroup = document.getElementById('scene-mask-zones');

    const system = {
        gameState,
        container,
        sceneRoot,
        fullVideo,
        emptyImage,
        emptyOverlay,
        maskBase,
        maskGroup,
        activeZones: new Map(),
        activePresenceZoneId: null,
        emptyVideoLayers: {},
        fullVideoLayers: {},
        sceneMetrics: {
            width: DEFAULT_SCENE_WIDTH,
            height: DEFAULT_SCENE_HEIGHT
        }
    };

    bindMediaFallbacks(system);
    console.log('CollectiblesSystem initialized with scene mask renderer');
    return system;
}

function initializeZoneVideoLayers(system, zoneNumber) {
    const sceneDefinition = resolveSceneDefinition(zoneNumber);
    updateSceneMetrics(system, sceneDefinition);
    applySceneMedia(system, sceneDefinition, zoneNumber);
    system.emptyVideoLayers[zoneNumber] = system.emptyImage;
    system.fullVideoLayers[zoneNumber] = system.fullVideo;
}

function spawnCollectiblesForZone(system) {
    clearCollectibles(system);

    const zoneNumber = system.gameState.currentZone;
    const sceneDefinition = resolveSceneDefinition(zoneNumber);

    updateSceneMetrics(system, sceneDefinition);
    applySceneMedia(system, sceneDefinition, zoneNumber);

    const zones = selectZonesForSpawn(Array.isArray(sceneDefinition.zones) ? sceneDefinition.zones : []);
    zones.forEach((zoneData, index) => {
        registerSceneZone(system, normalizeZoneData(zoneData, zoneNumber, index));
    });

    console.log(`Zone ${zoneNumber}: rendered ${zones.length} scene zones`);
}

function resolveSceneDefinition(zoneNumber) {
    const configuredScene = window.zoneScenesDatabase?.[zoneNumber] || {};
    const configuredZones = Array.isArray(configuredScene.zones) ? configuredScene.zones : [];
    const shouldUseLegacyCollectibleSpots = configuredScene.inheritLegacyCollectibleSpots !== false && configuredZones.length === 0;
    const fallbackZones = shouldUseLegacyCollectibleSpots ? deriveLegacyCollectibleZones(zoneNumber) : [];

    return {
        width: clampPositiveNumber(configuredScene.width, DEFAULT_SCENE_WIDTH),
        height: clampPositiveNumber(configuredScene.height, DEFAULT_SCENE_HEIGHT),
        emptySrc: configuredScene.emptySrc || `assets/backgrounds/zones/zone_${zoneNumber}_empty.png`,
        fullSrc: configuredScene.fullSrc || `assets/backgrounds/zones/zone_${zoneNumber}_full.mp4`,
        emptyTransform: normalizeSceneLayerTransform(configuredScene.emptyTransform),
        fullTransform: normalizeSceneLayerTransform(configuredScene.fullTransform),
        zones: configuredZones.length > 0 ? configuredZones : fallbackZones
    };
}

function deriveLegacyCollectibleZones(zoneNumber) {
    const legacySpotGroups = window.collectibleSpotsDatabase?.[zoneNumber];
    if (!legacySpotGroups) {
        return [];
    }

    const zones = [];

    (legacySpotGroups.crosses || []).forEach((spot, index) => {
        zones.push({
            ...spot,
            id: spot.id || `z${zoneNumber}_collectible_cross_${index + 1}`,
            type: 'collectible',
            collectibleType: 'cross'
        });
    });

    (legacySpotGroups.books || []).forEach((spot, index) => {
        zones.push({
            ...spot,
            id: spot.id || `z${zoneNumber}_collectible_book_${index + 1}`,
            type: 'collectible',
            collectibleType: 'book'
        });
    });

    return zones;
}

function selectZonesForSpawn(zones) {
    const presenceZones = [];
    const bookZones = [];
    const crossZones = [];

    zones.forEach((zone) => {
        if (zone.type === 'presence') {
            presenceZones.push(zone);
            return;
        }

        if (normalizeCollectibleType(zone.collectibleType || zone.collectible?.type) === 'book') {
            bookZones.push(zone);
            return;
        }

        crossZones.push(zone);
    });

    return [
        ...presenceZones,
        ...pickRandomCollectibleSubset(bookZones),
        ...pickRandomCollectibleSubset(crossZones)
    ];
}

function pickRandomCollectibleSubset(zones) {
    if (!Array.isArray(zones) || zones.length === 0) {
        return [];
    }

    const shuffledZones = shuffleArray(zones);
    const minCount = Math.min(COLLECTIBLE_MIN_PER_TYPE, shuffledZones.length);
    const maxCount = Math.min(COLLECTIBLE_MAX_PER_TYPE, shuffledZones.length);
    const targetCount = randomInteger(minCount, maxCount);
    return shuffledZones.slice(0, targetCount);
}

function shuffleArray(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }

    return copy;
}

function randomInteger(min, max) {
    if (max <= min) {
        return min;
    }

    return min + Math.floor(Math.random() * ((max - min) + 1));
}

function updateSceneMetrics(system, sceneDefinition) {
    system.sceneMetrics.width = clampPositiveNumber(sceneDefinition.width, DEFAULT_SCENE_WIDTH);
    system.sceneMetrics.height = clampPositiveNumber(sceneDefinition.height, DEFAULT_SCENE_HEIGHT);

    syncSceneCoordinateSpace(system);

    if (system.emptyOverlay) {
        system.emptyOverlay.setAttribute('viewBox', `0 0 ${system.sceneMetrics.width} ${system.sceneMetrics.height}`);
    }

    if (system.maskBase) {
        system.maskBase.setAttribute('width', String(system.sceneMetrics.width));
        system.maskBase.setAttribute('height', String(system.sceneMetrics.height));
    }

    if (system.emptyImage) {
        system.emptyImage.setAttribute('width', String(system.sceneMetrics.width));
        system.emptyImage.setAttribute('height', String(system.sceneMetrics.height));
    }
}

function syncSceneCoordinateSpace(system) {
    const scaleX = DEFAULT_SCENE_WIDTH / clampPositiveNumber(system.sceneMetrics.width, DEFAULT_SCENE_WIDTH);
    const scaleY = DEFAULT_SCENE_HEIGHT / clampPositiveNumber(system.sceneMetrics.height, DEFAULT_SCENE_HEIGHT);

    applySceneSpaceStyles(system.sceneRoot, system.sceneMetrics.width, system.sceneMetrics.height, scaleX, scaleY);
    applySceneSpaceStyles(system.container, system.sceneMetrics.width, system.sceneMetrics.height, scaleX, scaleY);
}

function applySceneSpaceStyles(element, width, height, scaleX, scaleY) {
    if (!element) {
        return;
    }

    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.transformOrigin = 'top left';
    element.style.transform = `scale(${scaleX}, ${scaleY})`;
}

function applySceneMedia(system, sceneDefinition, zoneNumber) {
    const emptySrc = sceneDefinition.emptySrc;
    const fullSrc = sceneDefinition.fullSrc;

    if (system.emptyImage) {
        applySceneLayerTransform(system.emptyImage, sceneDefinition.emptyTransform);
        setSvgImageSource(system.emptyImage, emptySrc, FALLBACK_EMPTY_SCENE_SRC);
    }

    if (system.fullVideo) {
        applySceneLayerTransform(system.fullVideo, sceneDefinition.fullTransform);
        setVideoSource(system.fullVideo, fullSrc, FALLBACK_FULL_SCENE_SRC);
        resetSceneVideo(system.fullVideo);
    }
}

function registerSceneZone(system, zoneData) {
    const maskShape = createMaskShape(zoneData);
    let hotspot = null;
    if (system.container) {
        hotspot = createHotspot(zoneData);
        if (zoneData.type === 'collectible') {
            hotspot.addEventListener('click', () => collectSpot(system, zoneData.id));
        }
        system.container.appendChild(hotspot);
    }

    if (maskShape && system.maskGroup) {
        system.maskGroup.appendChild(maskShape);
    }

    const zoneEntry = {
        data: zoneData,
        hotspot,
        maskShape
    };

    if (zoneData.type === 'presence') {
        setPresenceZoneVisibility(zoneEntry, false);
    }

    system.activeZones.set(zoneData.id, zoneEntry);
}

function createHotspot(zoneData) {
    const hotspot = document.createElement('div');
    hotspot.className = `collectible-spot scene-zone-hotspot ${zoneData.type}`;
    hotspot.dataset.id = zoneData.id;
    hotspot.dataset.type = zoneData.type;
    hotspot.dataset.collectibleType = zoneData.collectibleType || '';
    hotspot.style.left = `${zoneData.x}px`;
    hotspot.style.top = `${zoneData.y}px`;
    hotspot.style.width = `${zoneData.width}px`;
    hotspot.style.height = `${zoneData.height}px`;
    hotspot.style.borderRadius = `${zoneData.radius}%`;
    hotspot.style.transform = `rotate(${zoneData.rotation}deg)`;
    hotspot.style.transformOrigin = 'center center';
    hotspot.style.zIndex = '2';
    hotspot.setAttribute(
        'aria-label',
        zoneData.type === 'presence'
            ? window.t('a11y.demon_presence_zone')
            : window.t('a11y.collect_object', {
                type: zoneData.collectibleType || window.t('a11y.collect_default_type')
            })
    );

    if (Array.isArray(zoneData.clipPath) && zoneData.clipPath.length >= 3) {
        hotspot.style.clipPath = `polygon(${zoneData.clipPath.map(point => `${point[0]}% ${point[1]}%`).join(', ')})`;
    }

    return hotspot;
}

function createMaskShape(zoneData) {
    const svgNamespace = 'http://www.w3.org/2000/svg';

    if (Array.isArray(zoneData.clipPath) && zoneData.clipPath.length >= 3) {
        const polygon = document.createElementNS(svgNamespace, 'polygon');
        polygon.setAttribute('points', buildPolygonPointList(zoneData));
        polygon.setAttribute('fill', 'black');
        polygon.dataset.zoneId = zoneData.id;
        return polygon;
    }

    const rect = document.createElementNS(svgNamespace, 'rect');
    rect.setAttribute('x', String(zoneData.x));
    rect.setAttribute('y', String(zoneData.y));
    rect.setAttribute('width', String(zoneData.width));
    rect.setAttribute('height', String(zoneData.height));
    rect.setAttribute('rx', String(Math.min(zoneData.width / 2, (zoneData.width * zoneData.radius) / 100)));
    rect.setAttribute('ry', String(Math.min(zoneData.height / 2, (zoneData.height * zoneData.radius) / 100)));
    rect.setAttribute('fill', 'black');
    rect.dataset.zoneId = zoneData.id;

    if (zoneData.rotation) {
        const centerX = zoneData.x + (zoneData.width / 2);
        const centerY = zoneData.y + (zoneData.height / 2);
        rect.setAttribute('transform', `rotate(${zoneData.rotation} ${centerX} ${centerY})`);
    }

    return rect;
}

function buildPolygonPointList(zoneData) {
    const centerX = zoneData.x + (zoneData.width / 2);
    const centerY = zoneData.y + (zoneData.height / 2);

    return zoneData.clipPath
        .map(([percentX, percentY]) => {
            const rawX = zoneData.x + ((zoneData.width * percentX) / 100);
            const rawY = zoneData.y + ((zoneData.height * percentY) / 100);
            const [rotatedX, rotatedY] = rotatePoint(rawX, rawY, centerX, centerY, zoneData.rotation);
            return `${rotatedX.toFixed(2)},${rotatedY.toFixed(2)}`;
        })
        .join(' ');
}

function collectSpot(system, zoneId) {
    const zoneEntry = system.activeZones.get(zoneId);
    if (!zoneEntry) {
        return;
    }

    const { data, hotspot, maskShape } = zoneEntry;
    if (data.type !== 'collectible') {
        return;
    }

    if (data.collectibleType === 'cross') {
        collectCross(system.gameState);
    } else if (data.collectibleType === 'book') {
        collectBook(system.gameState);
    }

    if (maskShape) {
        maskShape.remove();
    }

    if (hotspot) {
        hotspot.style.opacity = '0';
        hotspot.style.transform = `${hotspot.style.transform} scale(1.1)`;
        setTimeout(() => hotspot.remove(), 220);
    }

    system.activeZones.delete(zoneId);

    if (window.uiController) {
        updateCounters(window.uiController);
    }

    console.log(`Collected ${data.collectibleType} from ${zoneId}`);
}

function clearCollectibles(system) {
    system.activeZones.forEach(({ hotspot, maskShape }) => {
        if (hotspot) {
            hotspot.remove();
        }
        if (maskShape) {
            maskShape.remove();
        }
    });

    system.activeZones.clear();
    system.activePresenceZoneId = null;

    if (system.container) {
        system.container.innerHTML = '';
    }

    if (system.maskGroup) {
        system.maskGroup.innerHTML = '';
    }
}

function normalizeZoneData(zoneData, zoneNumber, index) {
    const type = zoneData.type === 'presence' ? 'presence' : 'collectible';
    const normalizedCollectibleType = normalizeCollectibleType(zoneData.collectibleType || zoneData.collectible?.type);
    const normalizedTimer = zoneData.timer === true
        ? true
        : Number.isFinite(Number(zoneData.timer))
            ? Number(zoneData.timer)
            : null;

    return {
        id: zoneData.id || `zone_${zoneNumber}_${type}_${index + 1}`,
        type,
        collectibleType: type === 'collectible' ? normalizedCollectibleType : '',
        x: normalizeNumber(zoneData.x, 0),
        y: normalizeNumber(zoneData.y, 0),
        width: clampPositiveNumber(zoneData.width, 1),
        height: clampPositiveNumber(zoneData.height, 1),
        radius: clampNumber(zoneData.radius, 0, 100, 0),
        rotation: clampNumber(zoneData.rotation, -180, 180, 0),
        clipPath: normalizeClipPath(zoneData.clipPath),
        timer: normalizedTimer
    };
}

function normalizeCollectibleType(value) {
    return value === 'book' ? 'book' : 'cross';
}

function normalizeClipPath(clipPath) {
    if (!Array.isArray(clipPath) || clipPath.length < 3) {
        return null;
    }

    return clipPath
        .map((point) => {
            if (!Array.isArray(point) || point.length !== 2) {
                return null;
            }

            return [
                clampNumber(point[0], 0, 100, 0),
                clampNumber(point[1], 0, 100, 0)
            ];
        })
        .filter(Boolean);
}

function rotatePoint(x, y, centerX, centerY, rotation) {
    if (!rotation) {
        return [x, y];
    }

    const radians = (rotation * Math.PI) / 180;
    const deltaX = x - centerX;
    const deltaY = y - centerY;

    return [
        centerX + (deltaX * Math.cos(radians)) - (deltaY * Math.sin(radians)),
        centerY + (deltaX * Math.sin(radians)) + (deltaY * Math.cos(radians))
    ];
}

function getPresenceZones(system) {
    if (!system?.activeZones) {
        return [];
    }

    return Array.from(system.activeZones.values()).filter(({ data }) => data.type === 'presence');
}

function activatePresenceZone(system, zoneId) {
    if (!system) {
        return null;
    }

    const nextEntry = system.activeZones.get(zoneId);
    if (!nextEntry || nextEntry.data.type !== 'presence') {
        return null;
    }

    if (system.activePresenceZoneId && system.activePresenceZoneId !== zoneId) {
        deactivatePresenceZone(system, system.activePresenceZoneId);
    }

    setPresenceZoneVisibility(nextEntry, true);
    system.activePresenceZoneId = zoneId;
    return nextEntry;
}

function deactivatePresenceZone(system, zoneId = system?.activePresenceZoneId) {
    if (!system || !zoneId) {
        return null;
    }

    const entry = system.activeZones.get(zoneId);
    if (!entry || entry.data.type !== 'presence') {
        return null;
    }

    setPresenceZoneVisibility(entry, false);
    if (system.activePresenceZoneId === zoneId) {
        system.activePresenceZoneId = null;
    }

    return entry;
}

function setPresenceZoneVisibility(zoneEntry, isVisible) {
    if (!zoneEntry || zoneEntry.data.type !== 'presence') {
        return;
    }

    if (zoneEntry.maskShape) {
        zoneEntry.maskShape.style.display = isVisible ? '' : 'none';
    }

    if (zoneEntry.hotspot) {
        zoneEntry.hotspot.style.display = isVisible ? 'block' : 'none';
        zoneEntry.hotspot.style.pointerEvents = isVisible ? 'auto' : 'none';
    }
}

function bindMediaFallbacks(system) {
    if (system.fullVideo) {
        system.fullVideo.addEventListener('error', () => {
            const failedSrc = system.fullVideo.currentSrc || system.fullVideo.dataset.lastAppliedSrc || '';
            const fallback = system.fullVideo.dataset.fallbackSrc;
            if (!fallback || system.fullVideo.dataset.lastAppliedSrc === fallback) {
                return;
            }

            console.warn(`Failed to load scene video: ${failedSrc}. Falling back to ${fallback}.`);
            system.fullVideo.dataset.lastAppliedSrc = fallback;
            system.fullVideo.src = fallback;
            resetSceneVideo(system.fullVideo);
        });
    }

    if (system.emptyImage) {
        system.emptyImage.addEventListener('error', () => {
            const fallback = system.emptyImage.dataset.fallbackSrc;
            if (!fallback || system.emptyImage.dataset.lastAppliedSrc === fallback) {
                return;
            }

            system.emptyImage.dataset.lastAppliedSrc = fallback;
            system.emptyImage.setAttribute('href', fallback);
        });
    }
}

function setVideoSource(videoElement, preferredSrc, fallbackSrc) {
    if (!videoElement) {
        return;
    }

    const nextSrc = preferredSrc || fallbackSrc;
    if (videoElement.dataset.lastAppliedSrc === nextSrc) {
        return;
    }

    videoElement.dataset.fallbackSrc = fallbackSrc;
    videoElement.dataset.lastAppliedSrc = nextSrc;
    videoElement.src = nextSrc;
    videoElement.load();
}

function setSvgImageSource(imageElement, preferredSrc, fallbackSrc) {
    if (!imageElement) {
        return;
    }

    const nextSrc = preferredSrc || fallbackSrc;
    if (imageElement.dataset.lastAppliedSrc === nextSrc) {
        return;
    }

    imageElement.dataset.fallbackSrc = fallbackSrc;
    imageElement.dataset.lastAppliedSrc = nextSrc;
    imageElement.setAttribute('href', nextSrc);
}

function safePlay(videoElement) {
    if (!videoElement || typeof videoElement.play !== 'function') {
        return;
    }

    const playPromise = videoElement.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
            console.warn('Failed to play scene video:', error);
        });
    }
}

function resetSceneVideo(videoElement, targetTime = 0) {
    if (!videoElement) {
        return;
    }

    videoElement.pause();
    videoElement.loop = false;
    safeSetCurrentTime(videoElement, targetTime);
}

function safeSetCurrentTime(videoElement, targetTime) {
    if (!videoElement) {
        return;
    }

    const nextTime = Math.max(0, Number(targetTime) || 0);
    const applyTime = () => {
        try {
            videoElement.currentTime = nextTime;
        } catch (error) {
            console.warn('Failed to seek scene video:', error);
        }
    };

    if (videoElement.readyState >= 1) {
        applyTime();
        return;
    }

    videoElement.addEventListener('loadedmetadata', applyTime, { once: true });
}

function normalizeSceneLayerTransform(transform) {
    if (!transform || typeof transform !== 'object') {
        return null;
    }

    return {
        x: normalizeNumber(transform.x, 0),
        y: normalizeNumber(transform.y, 0),
        scaleX: clampPositiveNumber(transform.scaleX, 1),
        scaleY: clampPositiveNumber(transform.scaleY, 1)
    };
}

function applySceneLayerTransform(element, transform) {
    if (!element) {
        return;
    }

    const nextTransform = transform
        ? `translate(${transform.x}px, ${transform.y}px) scale(${transform.scaleX}, ${transform.scaleY})`
        : 'translate(0px, 0px) scale(1, 1)';

    element.style.transformOrigin = 'top left';
    element.style.transform = nextTransform;
}

function clampPositiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, number));
}

function devClearCollectiblesOnly(system) {
    const toRemove = [];

    system.activeZones.forEach((entry, id) => {
        if (entry.data.type !== 'presence') {
            toRemove.push(id);
        }
    });

    toRemove.forEach((id) => {
        const entry = system.activeZones.get(id);
        if (entry) {
            if (entry.hotspot) entry.hotspot.remove();
            if (entry.maskShape) entry.maskShape.remove();
            system.activeZones.delete(id);
        }
    });

    console.log(`[DEV] Cleared ${toRemove.length} collectible zones (presence zones kept).`);
}

function devSpawnAllCollectiblesForZone(system) {
    clearCollectibles(system);

    const zoneNumber = system.gameState.currentZone;
    const sceneDefinition = resolveSceneDefinition(zoneNumber);

    updateSceneMetrics(system, sceneDefinition);
    applySceneMedia(system, sceneDefinition, zoneNumber);

    const allZones = Array.isArray(sceneDefinition.zones) ? sceneDefinition.zones : [];
    const normalized = allZones.map((zoneData, index) => normalizeZoneData(zoneData, zoneNumber, index));
    normalized.forEach((zoneData) => {
        registerSceneZone(system, zoneData);
    });

    console.log(`[DEV] Zone ${zoneNumber}: spawned ALL ${normalized.length} collectible zones`);
}

if (typeof window !== 'undefined') {
    window.createCollectiblesSystem = createCollectiblesSystem;
    window.spawnCollectiblesForZone = spawnCollectiblesForZone;
    window.devSpawnAllCollectiblesForZone = devSpawnAllCollectiblesForZone;
    window.clearCollectibles = clearCollectibles;
    window.devClearCollectiblesOnly = devClearCollectiblesOnly;
    window.initializeZoneVideoLayers = initializeZoneVideoLayers;
    window.getPresenceZones = getPresenceZones;
    window.activatePresenceZone = activatePresenceZone;
    window.deactivatePresenceZone = deactivatePresenceZone;
    window.resetSceneVideo = resetSceneVideo;
    window.safeSetSceneVideoTime = safeSetCurrentTime;
    window.safePlaySceneVideo = safePlay;
}
