/**
 * LightingSystem - Manages the dynamic lighting mechanics (Functional approach)
 */

const LIGHTING_DEV_MODE_STORAGE_KEY = 'the-nun-lighting-dev-mode-v1';
const DEFAULT_LIGHTING_DEV_MODE = Object.freeze({
    lightsAlwaysOn: false
});

function normalizeLightingDevMode(devMode) {
    if (typeof devMode === 'boolean') {
        return {
            ...DEFAULT_LIGHTING_DEV_MODE,
            lightsAlwaysOn: devMode
        };
    }

    const safeDevMode = devMode && typeof devMode === 'object' ? devMode : {};

    return {
        ...DEFAULT_LIGHTING_DEV_MODE,
        lightsAlwaysOn: safeDevMode.lightsAlwaysOn === true
    };
}

function readLightingDevMode() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { ...DEFAULT_LIGHTING_DEV_MODE };
    }

    if (window.__buildConfig && window.__buildConfig.isPackaged) {
        return { ...DEFAULT_LIGHTING_DEV_MODE };
    }

    try {
        const rawStoredDevMode = window.localStorage.getItem(LIGHTING_DEV_MODE_STORAGE_KEY);
        if (rawStoredDevMode == null) {
            return { ...DEFAULT_LIGHTING_DEV_MODE };
        }

        return normalizeLightingDevMode(JSON.parse(rawStoredDevMode));
    } catch (error) {
        console.warn('Failed to read lighting dev mode settings:', error);
        return { ...DEFAULT_LIGHTING_DEV_MODE };
    }
}

function writeLightingDevMode(devMode) {
    const nextDevMode = normalizeLightingDevMode(devMode);

    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LIGHTING_DEV_MODE_STORAGE_KEY, JSON.stringify(nextDevMode));
    }

    if (typeof window !== 'undefined') {
        window.theNunLightingDevMode = nextDevMode;
    }

    if (window.lightingSystem && Array.isArray(window.lightingSystem.lights)) {
        if (nextDevMode.lightsAlwaysOn) {
            window.lightingSystem.lights.forEach((light) => {
                light.intensity = 100;
            });
        }
    }

    return nextDevMode;
}

function getLightingDevMode() {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_LIGHTING_DEV_MODE };
    }

    if (!window.theNunLightingDevMode) {
        window.theNunLightingDevMode = readLightingDevMode();
    }

    return normalizeLightingDevMode(window.theNunLightingDevMode);
}

function areLightsForcedOn() {
    return getLightingDevMode().lightsAlwaysOn;
}

const FIRE_AUDIO_FADE_OUT_MS = 1000;

function stopFireAudioFade(fireAudio) {
    if (fireAudio && fireAudio.__fireFadeFrame) {
        window.cancelAnimationFrame(fireAudio.__fireFadeFrame);
        fireAudio.__fireFadeFrame = null;
    }
}

function fadeOutFireAudio(fireAudio, duration = FIRE_AUDIO_FADE_OUT_MS) {
    if (!fireAudio || fireAudio.paused) {
        return;
    }

    stopFireAudioFade(fireAudio);

    const startVolume = fireAudio.volume;
    const startTime = window.performance.now();

    const step = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        fireAudio.volume = Math.max(0, startVolume * (1 - progress));

        if (progress < 1 && !fireAudio.paused) {
            fireAudio.__fireFadeFrame = window.requestAnimationFrame(step);
            return;
        }

        fireAudio.pause();
        fireAudio.currentTime = 0;
        fireAudio.__fireFadeFrame = null;

        if (typeof window.applyAudioSettings === 'function') {
            window.applyAudioSettings();
        }
    };

    fireAudio.__fireFadeFrame = window.requestAnimationFrame(step);
}

if (typeof window !== 'undefined') {
    window.getLightingDevMode = getLightingDevMode;
    window.setLightingDevMode = function(devMode) {
        return writeLightingDevMode({
            ...getLightingDevMode(),
            ...(devMode && typeof devMode === 'object' ? devMode : {})
        });
    };
    window.toggleLightsAlwaysOnDevMode = function(forceValue) {
        const nextValue = typeof forceValue === 'boolean'
            ? forceValue
            : !areLightsForcedOn();
        const nextDevMode = writeLightingDevMode({
            ...getLightingDevMode(),
            lightsAlwaysOn: nextValue
        });

        console.log(`[DEBUG] Lights always on dev mode ${nextDevMode.lightsAlwaysOn ? 'enabled' : 'disabled'}`);

        return nextDevMode;
    };
}

/**
 * Create a new lighting system
 */
function createLightingSystem(gameState) {
    const canvas = document.getElementById('lighting-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const container = document.getElementById('game-container');
    let appliedZone = null;

    // Light states (0-100 intensity)
    const lights = [
        { intensity: 10, x: 0.25, y: 0.7, radius: 200, decayRate: 0.5 }, // center-left
        { intensity: 10, x: 0.75, y: 0.7, radius: 200, decayRate: 0.5 } // center-right
    ];

    // Light charging state
    let chargingLight = null;
    let chargeInterval = null;

    // Animation frame ID for cleanup
    let animationId = null;

    // Decay interval ID for cleanup
    let decayInterval = null;

    const system = {
        gameState,
        canvas,
        ctx,
        container,
        lights,
        transitionFullClearProgress: 0,
        getAppliedZone: () => appliedZone,
        setAppliedZone: (zone) => {
            appliedZone = zone;
        },
        getChargingLight: () => chargingLight,
        getAnimationId: () => animationId,
        getDecayInterval: () => decayInterval,
        getChargeInterval: () => chargeInterval
    };

    // Initialize
    initLightingSystem(system);

    console.log('LightingSystem initialized');
    return system;
}

function getZoneLightButtonLayout(zoneNumber) {
    const zoneLayouts = {
        1: {
            left: { bottom: '50%', left: '19.5%' },
            right: { bottom: '50%', right: '19%' }
        },
        2: {
            left: { bottom: '50%', left: '16.5%' },
            right: { bottom: '50%', right: '16.5%' }
        },
        3: {
            left: { bottom: '50%', left: '16.5%' },
            right: { bottom: '50%', right: '16.5%' }
        },
        4: {
            left: { bottom: '50%', left: '19.5%' },
            right: { bottom: '50%', right: '19.5%' }
        },
        5: {
            left: { bottom: '50%', left: '16.5%' },
            right: { bottom: '50%', right: '16.5%' }
        }
    };

    return zoneLayouts[zoneNumber] || zoneLayouts[1];
}

function applyZoneLightButtonPositions(system) {
    const zoneNumber = Number(system.gameState?.currentZone) || 1;
    if (system.getAppliedZone() === zoneNumber) {
        return;
    }

    const layout = getZoneLightButtonLayout(zoneNumber);
    const leftButton = document.querySelector('.light-button[data-light="0"]');
    const rightButton = document.querySelector('.light-button[data-light="1"]');

    if (leftButton) {
        leftButton.style.bottom = layout.left.bottom;
        leftButton.style.left = layout.left.left;
        leftButton.style.right = '';
    }

    if (rightButton) {
        rightButton.style.bottom = layout.right.bottom;
        rightButton.style.right = layout.right.right;
        rightButton.style.left = '';
    }

    system.setAppliedZone(zoneNumber);
}

/**
 * Initialize the lighting system
 */
function initLightingSystem(system) {
    if (!system.canvas || !system.ctx) {
        console.error('Lighting canvas not found');
        return;
    }

    // Set canvas size
    resizeCanvas(system);
    window.addEventListener('resize', () => resizeCanvas(system));

    // Bind light button events
    bindLightButtons(system);

    // Start decay loop
    startDecayLoop(system);

    // Start render loop
    renderLights(system);
}

/**
 * Sync each light origin to the current on-screen position of its matching light button
 */
function syncLightOrigins(system) {
    const canvas = system.canvas;
    const container = system.container;
    if (!canvas || !container) {
        return;
    }

    applyZoneLightButtonPositions(system);

    const containerWidth = container.clientWidth || canvas.width;
    const containerHeight = container.clientHeight || canvas.height;
    if (!containerWidth || !containerHeight) {
        return;
    }

    document.querySelectorAll('.light-button[data-light]').forEach((button) => {
        const lightIndex = Number(button.getAttribute('data-light'));
        const light = system.lights[lightIndex];
        if (!light || !Number.isInteger(lightIndex)) {
            return;
        }

        const centerX = button.offsetLeft + (button.offsetWidth * 0.5);
        const centerY = button.offsetTop + (button.offsetHeight * 0.5);

        light.x = centerX / containerWidth;
        light.y = centerY / containerHeight;
    });
}

/**
 * Resize canvas to window size
 */
function resizeCanvas(system) {
    if (!system.canvas) return;
    const container = system.container || document.getElementById('game-container');
    const nextWidth = container?.clientWidth || system.canvas.clientWidth || window.innerWidth;
    const nextHeight = container?.clientHeight || system.canvas.clientHeight || window.innerHeight;

    system.canvas.width = nextWidth;
    system.canvas.height = nextHeight;
    syncLightOrigins(system);
}

/**
 * Bind events to light buttons
 */
function bindLightButtons(system) {
    const lightButtons = document.querySelectorAll('.light-button');

    lightButtons.forEach((button) => {
        const lightIndex = Number(button.getAttribute('data-light'));
        if (!Number.isInteger(lightIndex) || !system.lights[lightIndex]) {
            return;
        }

        button.setAttribute('draggable', 'false');

        button.addEventListener('dragstart', (event) => {
            event.preventDefault();
        });

        button.addEventListener('selectstart', (event) => {
            event.preventDefault();
        });

        // Mouse/touch events for charging
        button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            startCharging(system, lightIndex);
        });
        button.addEventListener('mouseup', (event) => {
            event.preventDefault();
            stopCharging(system);
        });
        button.addEventListener('mouseleave', () => stopCharging(system));

        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startCharging(system, lightIndex);
        });
        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopCharging(system);
        });
    });

    if (system.container) {
        system.container.addEventListener('dragstart', (event) => {
            event.preventDefault();
        });

        system.container.addEventListener('selectstart', (event) => {
            event.preventDefault();
        });
    }
}

function isLightInteractionBlocked() {
    return Boolean(window.uiController && window.uiController.zoneForwardTransitionActive);
}

/**
 * Start charging a light
 */
function startCharging(system, lightIndex) {
    if (isLightInteractionBlocked()) {
        stopCharging(system);
        return;
    }

    const chargingLight = system.getChargingLight();
    if (chargingLight !== null) return;

    if (areLightsForcedOn()) {
        system.lights.forEach((light) => {
            light.intensity = 100;
        });
        return;
    }

    syncLightOrigins(system);

    system.getChargingLight = () => lightIndex;
    console.log(`Charging light ${lightIndex}`);

    const fireAudio = document.getElementById('fire-audio');
    if (fireAudio) {
        stopFireAudioFade(fireAudio);
        if (typeof window.applyAudioSettings === 'function') {
            window.applyAudioSettings();
        }
        fireAudio.currentTime = 0;
        const playPromise = fireAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }

    // Charge light while held
    const interval = setInterval(() => {
        if (system.lights[lightIndex].intensity < 100) {
            system.lights[lightIndex].intensity = Math.min(100, system.lights[lightIndex].intensity + 2.5);
        } else {
            const fa = document.getElementById('fire-audio');
            if (fa && !fa.paused) {
                fadeOutFireAudio(fa);
            }

            clearInterval(interval);
            system.getChargeInterval = () => null;
        }
    }, 50);

    system.getChargeInterval = () => interval;
}

/**
 * Stop charging current light
 */
function stopCharging(system) {
    const chargingLight = system.getChargingLight();
    const chargeInterval = system.getChargeInterval();

    if (chargingLight !== null) {
        console.log(`Stopped charging light ${chargingLight}, intensity: ${system.lights[chargingLight].intensity}`);
        system.getChargingLight = () => null;
    }

    if (chargeInterval) {
        clearInterval(chargeInterval);
        system.getChargeInterval = () => null;
    }

    const fireAudio = document.getElementById('fire-audio');
    if (fireAudio && !fireAudio.paused) {
        fadeOutFireAudio(fireAudio);
    }
}

function cancelActiveLightInteraction(system) {
    if (!system) {
        return;
    }

    stopCharging(system);
}

/**
 * Start the light decay loop
 */
function startDecayLoop(system) {
    const currentInterval = system.getDecayInterval();

    // Clear existing interval if any
    if (currentInterval) {
        clearInterval(currentInterval);
    }
    const interval = setInterval(() => {
        if (system.gameState.isTimePaused) {
            return;
        }

        if (areLightsForcedOn()) {
            system.lights.forEach((light) => {
                light.intensity = 100;
            });
            return;
        }

        const difficulty = getDifficulty(system.gameState);
        system.lights.forEach((light, index) => {
            if (light.intensity > 10) {
                const decay = light.decayRate * difficulty.lightDecaySpeed;
                light.intensity = Math.max(10, light.intensity - decay);
            }
        });
    }, 100);
    system.getDecayInterval = () => interval;
}

/**
 * Render the lighting overlay
 */
function renderLights(system) {
    if (!system.ctx || !system.canvas) return;

    syncLightOrigins(system);

    const transitionFullClearProgress = Math.max(0, Math.min(1, Number(system.transitionFullClearProgress) || 0));

    if (areLightsForcedOn()) {
        system.lights.forEach((light) => {
            light.intensity = 100;
        });
        system.ctx.clearRect(0, 0, system.canvas.width, system.canvas.height);
        const animId = requestAnimationFrame(() => renderLights(system));
        system.getAnimationId = () => animId;
        return;
    }

    const ctx = system.ctx;
    const width = system.canvas.width;
    const height = system.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate a darkness mask that is fully opaque by default, and gets more transparent where lights overlap
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    // Draw a full black overlay
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, width, height);

    // For each candle, reduce the darkness alpha in its area using destination-out
    ctx.globalCompositeOperation = 'destination-out';
    system.lights.forEach(light => {
        if (light.intensity > 0) {
            const x = light.x * width;
            const y = light.y * height;
            // Candle light: radius grows with intensity
            const minRadius = 120;
            const maxRadius = (light.radius) *5;
            const radius = minRadius + (maxRadius - minRadius) * (light.intensity / 100);

            // The alpha of the light spot is proportional to intensity, so at 100% it fully erases the overlay in the center
            const maxAlpha = 0.95 * (light.intensity / 100); // up to 0.95 alpha removed at center
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(0,0,0,${maxAlpha})`);
            gradient.addColorStop(0.5, `rgba(0,0,0,${maxAlpha * 0.5})`);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    });
    ctx.globalCompositeOperation = 'source-over';

    if (transitionFullClearProgress > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${transitionFullClearProgress})`;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
    }

    // If all candles are at 100%, remove overlay entirely for full vision
    const allFull = system.lights.every(light => light.intensity >= 100);
    if (allFull || transitionFullClearProgress >= 1) {
        ctx.clearRect(0, 0, width, height);
    }

    // Continue rendering
    const animId = requestAnimationFrame(() => renderLights(system));
    system.getAnimationId = () => animId;
}

/**
 * Get total light level (0-100 average)
 */
function getTotalLightLevel(system) {
    const total = system.lights.reduce((sum, light) => sum + light.intensity, 0);
    return total / system.lights.length;
}

/**
 * Reset all lights
 */
function resetLights(system) {
    system.transitionFullClearProgress = 0;

    if (areLightsForcedOn()) {
        system.lights.forEach((light) => {
            light.intensity = 100;
        });
        syncLightOrigins(system);
        console.log('Lights locked to full intensity');
        return;
    }

    system.lights.forEach(light => {
        light.intensity = 10;
    });
    syncLightOrigins(system);
    console.log('All lights reset');
}

/**
 * Clean up resources
 */
function cleanupLightingSystem(system) {
    const animationId = system.getAnimationId();
    const chargeInterval = system.getChargeInterval();
    const decayInterval = system.getDecayInterval();

    if (animationId) {
        cancelAnimationFrame(animationId);
        system.getAnimationId = () => null;
    }
    if (chargeInterval) {
        clearInterval(chargeInterval);
        system.getChargeInterval = () => null;
    }
    if (decayInterval) {
        clearInterval(decayInterval);
        system.getDecayInterval = () => null;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.createLightingSystem = createLightingSystem;
    window.resetLights = resetLights;
    window.cleanupLightingSystem = cleanupLightingSystem;
    window.cancelActiveLightInteraction = cancelActiveLightInteraction;
}
