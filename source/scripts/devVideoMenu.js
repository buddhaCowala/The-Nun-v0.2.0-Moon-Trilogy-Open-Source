(function() {
    const PANEL_ID = 'dev-video-menu';
    const TIMER_PANEL_ID = 'dev-demon-timer-menu';
    const STYLE_ID = 'dev-video-menu-style';
    const UPDATE_INTERVAL_MS = 100;

    let refreshTimer = null;

    function getVideoSource(video) {
        if (video.currentSrc) {
            return video.currentSrc;
        }

        const source = video.querySelector('source');
        return source ? source.src : '';
    }

    function formatSourceLabel(source) {
        if (!source) {
            return 'inline or unset source';
        }

        try {
            const url = new URL(source, window.location.href);
            const segments = url.pathname.split('/').filter(Boolean);
            return segments.slice(-2).join('/');
        } catch (error) {
            return source;
        }
    }

    function getVideoName(video, index) {
        if (video.id) {
            return `#${video.id}`;
        }

        if (video.dataset.nunZone) {
            return `nun-zone-${video.dataset.nunZone}`;
        }

        const classNames = Array.from(video.classList).filter(Boolean);
        if (classNames.length > 0) {
            return `.${classNames.join('.')}`;
        }

        return `video-${index + 1}`;
    }

    function isVideoPlaying(video) {
        return !video.paused
            && !video.ended
            && video.readyState >= 2
            && video.currentTime > 0;
    }

    function buildVideoDescription(video, index) {
        const name = getVideoName(video, index);
        const source = formatSourceLabel(getVideoSource(video));
        const time = Number.isFinite(video.currentTime) ? video.currentTime.toFixed(1) : '0.0';
        return `${name} - ${source} (${time}s)`;
    }

    function getLightsAlwaysOnState() {
        if (typeof window.getLightingDevMode === 'function') {
            return window.getLightingDevMode().lightsAlwaysOn === true;
        }

        return false;
    }

    function getNoNunCatchState() {
        if (typeof window.getNunDevMode === 'function') {
            return window.getNunDevMode().noNunCatch === true;
        }

        return false;
    }

    // The 3D level's collider boxes drawn in the view (parkour.js setHitboxes).
    function getHitboxesState() {
        const parkour = window.NunWorld && window.NunWorld.Parkour;
        return Boolean(parkour && typeof parkour.hitboxesShown === 'function' && parkour.hitboxesShown());
    }

    function updateToggleButton(button, isActive) {
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));

        const stateLabel = button.querySelector('.dev-video-menu__button-state');
        if (stateLabel) {
            stateLabel.textContent = isActive ? 'ON' : 'OFF';
        }
    }

    function createToggleButton(title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dev-video-menu__button';

        const titleLabel = document.createElement('span');
        titleLabel.className = 'dev-video-menu__button-title';
        titleLabel.textContent = title;
        button.appendChild(titleLabel);

        const stateLabel = document.createElement('span');
        stateLabel.className = 'dev-video-menu__button-state';
        stateLabel.textContent = 'OFF';
        button.appendChild(stateLabel);

        return button;
    }

    function formatDemonAttackTimer(debugState) {
        if (!debugState) {
            return '--.-s';
        }

        const seconds = Math.max(0, Number(debugState.remainingMs) || 0) / 1000;

        return `${seconds.toFixed(1)}s`;
    }

    function formatDemonAttackTimerStatus(debugState) {
        if (!debugState) {
            return 'Unavailable';
        }

        if (debugState.active) {
            return 'Attack active';
        }

        if (debugState.pending) {
            return 'Queued after transition';
        }

        if (debugState.transitionBlocked) {
            return 'Waiting on transition';
        }

        if (debugState.paused) {
            return 'Paused';
        }

        return 'Counting down';
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID} {
                position: fixed;
                top: 12px;
                right: 12px;
                z-index: 99999;
                width: 280px;
                max-height: 40vh;
                overflow: hidden;
                padding: 10px 12px;
                border: 1px solid rgba(255, 255, 255, 0.22);
                border-radius: 8px;
                background: rgba(10, 10, 10, 0.84);
                color: #f4f4f4;
                font: 12px/1.4 Consolas, 'Courier New', monospace;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
                pointer-events: auto;
            }

            #${TIMER_PANEL_ID} {
                position: fixed;
                top: 12px;
                right: 304px;
                z-index: 99999;
                width: 180px;
                padding: 10px 12px;
                border: 1px solid rgba(173, 230, 255, 0.28);
                border-radius: 8px;
                background: rgba(10, 10, 10, 0.88);
                color: #dff7ff;
                font: 12px/1.4 Consolas, 'Courier New', monospace;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
                pointer-events: auto;
            }

            #${PANEL_ID} * {
                box-sizing: border-box;
            }

            #${TIMER_PANEL_ID} * {
                box-sizing: border-box;
            }

            #${PANEL_ID} .dev-video-menu__header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 8px;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }

            #${PANEL_ID} .dev-video-menu__toggle {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-weight: 400;
                text-transform: none;
                letter-spacing: normal;
            }

            #${PANEL_ID} .dev-video-menu__summary {
                margin-bottom: 8px;
                color: rgba(255, 255, 255, 0.9);
            }

            #${TIMER_PANEL_ID} .dev-video-menu__header {
                display: block;
                margin-bottom: 6px;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }

            #${TIMER_PANEL_ID} .dev-video-menu__timer {
                color: rgba(173, 230, 255, 0.95);
                font-size: 20px;
                line-height: 1.2;
            }

            #${TIMER_PANEL_ID} .dev-video-menu__timer-label {
                display: block;
                margin-bottom: 6px;
                color: rgba(255, 255, 255, 0.72);
                font-size: 11px;
            }

            #${TIMER_PANEL_ID} .dev-video-menu__timer-status {
                display: block;
                margin-top: 6px;
                color: rgba(255, 255, 255, 0.72);
                font-size: 11px;
            }

            #${TIMER_PANEL_ID} .dev-video-menu__trigger-btn {
                display: block;
                width: 100%;
                margin-top: 10px;
                padding: 7px 10px;
                border: 1px solid rgba(255, 100, 100, 0.45);
                border-radius: 6px;
                background: rgba(180, 40, 40, 0.22);
                color: rgba(255, 200, 200, 0.95);
                font: inherit;
                font-size: 11px;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                cursor: pointer;
                transition: background 120ms ease, border-color 120ms ease;
            }

            #${TIMER_PANEL_ID} .dev-video-menu__trigger-btn:hover {
                background: rgba(200, 50, 50, 0.38);
                border-color: rgba(255, 100, 100, 0.72);
            }

            #${TIMER_PANEL_ID} .dev-video-menu__trigger-btn:active {
                background: rgba(220, 60, 60, 0.52);
            }

            #${PANEL_ID} .dev-video-menu__controls {
                display: grid;
                gap: 8px;
                margin-bottom: 10px;
            }

            #${PANEL_ID} .dev-video-menu__button {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.08);
                color: inherit;
                font: inherit;
                text-align: left;
                cursor: pointer;
                transition: background 120ms ease, border-color 120ms ease;
            }

            #${PANEL_ID} .dev-video-menu__button:hover {
                background: rgba(255, 255, 255, 0.14);
                border-color: rgba(255, 255, 255, 0.32);
            }

            #${PANEL_ID} .dev-video-menu__button.is-active {
                background: rgba(144, 238, 144, 0.18);
                border-color: rgba(144, 238, 144, 0.55);
            }

            #${PANEL_ID} .dev-video-menu__button-title {
                display: block;
                font-weight: 700;
            }

            #${PANEL_ID} .dev-video-menu__button-state {
                display: block;
                margin-top: 2px;
                color: rgba(255, 255, 255, 0.75);
                font-size: 11px;
            }

            #${PANEL_ID} .dev-video-menu__list {
                margin: 0;
                padding-left: 18px;
                max-height: calc(40vh - 72px);
                overflow: auto;
            }

            #${PANEL_ID} .dev-video-menu__list li {
                margin-bottom: 4px;
                word-break: break-word;
            }

            #${PANEL_ID} .dev-video-menu__empty {
                margin: 0;
                color: rgba(255, 255, 255, 0.72);
            }
        `;

        document.head.appendChild(style);
    }

    function stopRefresh() {
        if (refreshTimer !== null) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    function cleanupExistingInstance() {
        if (typeof window.destroyDevVideoMenu === 'function') {
            window.destroyDevVideoMenu();
        }
    }

    function init() {
        cleanupExistingInstance();
        ensureStyle();

        const mountTarget = document.getElementById('app-stage') || document.body;
        if (!mountTarget) {
            return;
        }

        const panel = document.createElement('aside');
        panel.id = PANEL_ID;

        const timerPanel = document.createElement('aside');
        timerPanel.id = TIMER_PANEL_ID;

        const timerHeader = document.createElement('div');
        timerHeader.className = 'dev-video-menu__header';
        timerHeader.textContent = 'Demon Timer';
        timerPanel.appendChild(timerHeader);

        const timerLabel = document.createElement('span');
        timerLabel.className = 'dev-video-menu__timer-label';
        timerLabel.textContent = 'Next attack in';
        timerPanel.appendChild(timerLabel);

        const demonTimer = document.createElement('div');
        demonTimer.className = 'dev-video-menu__timer';
        demonTimer.textContent = '--.-s';
        timerPanel.appendChild(demonTimer);

        const demonTimerStatus = document.createElement('span');
        demonTimerStatus.className = 'dev-video-menu__timer-status';
        demonTimerStatus.textContent = 'Waiting for game...';
        timerPanel.appendChild(demonTimerStatus);

        const triggerAttackBtn = document.createElement('button');
        triggerAttackBtn.type = 'button';
        triggerAttackBtn.className = 'dev-video-menu__trigger-btn';
        triggerAttackBtn.textContent = 'Trigger Attack';
        timerPanel.appendChild(triggerAttackBtn);

        triggerAttackBtn.addEventListener('click', () => {
            const sys = window.demonAttacksSystem;
            if (sys && typeof window.startRandomAttack === 'function') {
                window.startRandomAttack(sys);
            }
        });

        const fillResourcesBtn = document.createElement('button');
        fillResourcesBtn.type = 'button';
        fillResourcesBtn.className = 'dev-video-menu__trigger-btn';
        fillResourcesBtn.textContent = '+999 Books & Crosses';
        fillResourcesBtn.style.cssText = 'border-color:rgba(100,255,100,0.45);background:rgba(40,120,40,0.22);color:rgba(200,255,200,0.95);margin-top:6px;';
        timerPanel.appendChild(fillResourcesBtn);

        fillResourcesBtn.addEventListener('click', () => {
            const state = window.state;
            if (state) {
                state.booksCollected += 999;
                state.crossesCollected += 999;
                if (typeof window.uiController !== 'undefined' && typeof updateCounters === 'function') {
                    updateCounters(window.uiController);
                }
                console.log(`[DEV] Resources filled: ${state.booksCollected} books, ${state.crossesCollected} crosses`);
            }
        });

        const spawnAllBtn = document.createElement('button');
        spawnAllBtn.type = 'button';
        spawnAllBtn.className = 'dev-video-menu__trigger-btn';
        spawnAllBtn.textContent = 'Spawn All Items';
        spawnAllBtn.style.cssText = 'border-color:rgba(255,220,80,0.45);background:rgba(100,80,0,0.22);color:rgba(255,240,160,0.95);margin-top:6px;';
        timerPanel.appendChild(spawnAllBtn);

        spawnAllBtn.addEventListener('click', () => {
            const sys = window.collectiblesSystem;
            if (sys && typeof window.devSpawnAllCollectiblesForZone === 'function') {
                window.devSpawnAllCollectiblesForZone(sys);
            }
        });

        const spawnNoneBtn = document.createElement('button');
        spawnNoneBtn.type = 'button';
        spawnNoneBtn.className = 'dev-video-menu__trigger-btn';
        spawnNoneBtn.textContent = 'Spawn No Items';
        spawnNoneBtn.style.cssText = 'border-color:rgba(150,150,150,0.45);background:rgba(40,40,40,0.22);color:rgba(200,200,200,0.95);margin-top:6px;';
        timerPanel.appendChild(spawnNoneBtn);

        spawnNoneBtn.addEventListener('click', () => {
            const sys = window.collectiblesSystem;
            if (sys && typeof window.devClearCollectiblesOnly === 'function') {
                window.devClearCollectiblesOnly(sys);
            }
        });

        const header = document.createElement('div');
        header.className = 'dev-video-menu__header';
        header.textContent = 'Dev Video Monitor';
        panel.appendChild(header);

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'dev-video-menu__toggle';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = true;
        toggleLabel.appendChild(toggle);
        toggleLabel.appendChild(document.createTextNode('live'));
        header.appendChild(toggleLabel);

        const summary = document.createElement('div');
        summary.className = 'dev-video-menu__summary';
        panel.appendChild(summary);

        const controls = document.createElement('div');
        controls.className = 'dev-video-menu__controls';
        panel.appendChild(controls);

        const lightsAlwaysOnButton = createToggleButton('lights on mode');
        const noNunCatchButton = createToggleButton('Remove Nun catch');
        // every collider of the 3D level drawn in the view (world3d/parkour.js)
        const hitboxesButton = createToggleButton('Show hitboxes');
        controls.appendChild(lightsAlwaysOnButton);
        controls.appendChild(noNunCatchButton);
        controls.appendChild(hitboxesButton);

        const emptyState = document.createElement('p');
        emptyState.className = 'dev-video-menu__empty';
        emptyState.textContent = 'No playing videos.';
        panel.appendChild(emptyState);

        const list = document.createElement('ol');
        list.className = 'dev-video-menu__list';
        list.hidden = true;
        panel.appendChild(list);

        function render() {
            const videos = Array.from(document.querySelectorAll('video'));
            const playingVideos = videos.filter(isVideoPlaying);

            // Update demon timer directly from the live system object
            const sys = window.demonAttacksSystem;
            if (sys) {
                const remaining = sys.attackScheduleRemainingMs;
                const isActive = Boolean(sys.isAttacking || sys.currentAttack);
                const isPending = Boolean(sys.attackSchedulePending);

                if (isActive) {
                    demonTimer.textContent = 'ATTACKING';
                    demonTimerStatus.textContent = 'Attack in progress';
                } else if (isPending) {
                    demonTimer.textContent = '0.0s';
                    demonTimerStatus.textContent = 'Queued after transition';
                } else if (remaining !== null && remaining > 0) {
                    demonTimer.textContent = `${(remaining / 1000).toFixed(1)}s`;
                    demonTimerStatus.textContent = 'Counting down';
                } else {
                    demonTimer.textContent = '0.0s';
                    demonTimerStatus.textContent = remaining === null ? 'Not started' : 'Triggering...';
                }
            } else {
                demonTimer.textContent = '--.-s';
                demonTimerStatus.textContent = 'No game session';
            }

            summary.textContent = `Playing videos: ${playingVideos.length} / ${videos.length}`;
            updateToggleButton(lightsAlwaysOnButton, getLightsAlwaysOnState());
            updateToggleButton(noNunCatchButton, getNoNunCatchState());
            updateToggleButton(hitboxesButton, getHitboxesState());

            list.replaceChildren();

            if (playingVideos.length === 0) {
                emptyState.hidden = false;
                list.hidden = true;
                return;
            }

            emptyState.hidden = true;
            list.hidden = false;

            playingVideos.forEach((video, index) => {
                const item = document.createElement('li');
                item.textContent = buildVideoDescription(video, index);
                list.appendChild(item);
            });
        }

        lightsAlwaysOnButton.addEventListener('click', () => {
            if (typeof window.toggleLightsAlwaysOnDevMode === 'function') {
                const devMode = window.toggleLightsAlwaysOnDevMode();
                updateToggleButton(lightsAlwaysOnButton, devMode.lightsAlwaysOn === true);
            }
        });

        hitboxesButton.addEventListener('click', () => {
            const parkour = window.NunWorld && window.NunWorld.Parkour;
            if (parkour && typeof parkour.setHitboxes === 'function') {
                updateToggleButton(hitboxesButton, parkour.setHitboxes(!getHitboxesState()));
            }
        });

        noNunCatchButton.addEventListener('click', () => {
            if (typeof window.toggleNoNunCatchDevMode === 'function') {
                const devMode = window.toggleNoNunCatchDevMode();
                updateToggleButton(noNunCatchButton, devMode.noNunCatch === true);
            }
        });

        function startRefresh() {
            stopRefresh();
            render();
            refreshTimer = window.setInterval(render, UPDATE_INTERVAL_MS);
        }

        toggle.addEventListener('change', () => {
            if (toggle.checked) {
                startRefresh();
                return;
            }

            stopRefresh();
        });

        mountTarget.appendChild(timerPanel);
        mountTarget.appendChild(panel);
        startRefresh();

        window.destroyDevVideoMenu = function() {
            stopRefresh();
            timerPanel.remove();
            panel.remove();
        };
    }

    function maybeInit() {
        if (window.electronAPI) {
            window.electronAPI.getBuildConfig().then(function(config) {
                if (!config || !config.isPackaged) {
                    init();
                }
            }).catch(function() {
                // Unknown build config: stay hidden. A shipped build must never show dev tools.
            });
            return;
        }
        init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeInit, { once: true });
    } else {
        maybeInit();
    }
})();
