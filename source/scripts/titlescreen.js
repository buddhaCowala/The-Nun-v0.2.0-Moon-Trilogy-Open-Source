(function() {
    const GALLERY_STORAGE_KEY = 'the-nun-gallery-v1';
    const SHOWCASE_HOVER_OPEN_DELAY_MS = 320;
    const SHOWCASE_HOVER_CLOSE_DELAY_MS = 140;
    // Text lives in i18n keys; only media paths are literal here. Labels are
    // resolved through window.t() at render time so a language switch re-renders.
    const SHOWCASE_CONTENT = {
        base: {
            cardTitleKey: 'titlescreen.base_version',
            cardAltKey: 'alt.base_version_showcase',
            cardImage: 'assets/icons/halfMoon.png',
            tierLabelKey: 'titlescreen.base_version',
            titleKey: 'titlescreen.base_version',
            textKeys: ['tiers.base_1', 'tiers.base_2', 'tiers.base_3'],
            primaryVideo: 'assets/mainmenu/1.mp4',
            secondaryVideo: 'assets/mainmenu/2.mp4'
        },
        gold: {
            cardTitleKey: 'titlescreen.gold_version',
            cardAltKey: 'alt.gold_version_showcase',
            cardImage: 'assets/icons/fullMoon.png',
            tierLabelKey: 'titlescreen.gold_version',
            titleKey: 'titlescreen.gold_version',
            textKeys: [
                'tiers.gold_1',
                'tiers.gold_2',
                'tiers.gold_3',
                'tiers.gold_4',
                'tiers.gold_5',
                'tiers.gold_6',
                'tiers.gold_7'
            ],
            primaryImage: 'assets/mainmenu/3.png',
            secondaryVideo: 'assets/mainmenu/4.mp4'
        },
        diamond: {
            cardTitleKey: 'titlescreen.diamond_version',
            cardAltKey: 'alt.diamond_version_showcase',
            cardImage: 'assets/icons/eclipse.png',
            tierLabelKey: 'titlescreen.diamond_version',
            titleKey: 'titlescreen.diamond_version',
            textKeys: [
                'tiers.diamond_1',
                'tiers.diamond_2',
                'tiers.diamond_3',
                'tiers.diamond_4',
                'tiers.diamond_5',
                'tiers.diamond_6',
                'tiers.diamond_7'
            ],
            primaryVideo: 'assets/mainmenu/5.mp4',
            secondaryVideo: 'assets/mainmenu/6.mp4'
        }
    };

    let showcaseOpenTimer = null;
    let showcaseCloseTimer = null;

    function parseVideoLoopSources(rawValue) {
        return String(rawValue || '')
            .split('|')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    function applyLoopingVideoSource(video, source) {
        if (!video || !source) {
            return;
        }

        if (video.dataset.currentSrc === source) {
            return;
        }

        video.dataset.currentSrc = source;
        video.src = source;
        video.load();
    }

    function playManagedVideo(video) {
        if (!video) {
            return;
        }

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }

    function stopManagedVideo(video, clearSource) {
        if (!video) {
            return;
        }

        video.pause();
        video.onended = null;

        if (clearSource) {
            video.removeAttribute('src');
            video.load();
            video.dataset.currentSrc = '';
        }
    }

    function configureManagedLoopVideo(video, sources) {
        if (!video) {
            return;
        }

        const normalizedSources = Array.isArray(sources) ? sources.filter(Boolean) : [];
        if (normalizedSources.length === 0) {
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.dataset.loopSources = '';
            video.dataset.loopIndex = '0';
            video.onended = null;
            return;
        }

        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.loop = normalizedSources.length === 1;
        video.dataset.loopSources = normalizedSources.join('|');

        const nextSource = normalizedSources[0];
        video.dataset.loopIndex = '0';
        video.onended = () => {
            const loopSources = parseVideoLoopSources(video.dataset.loopSources);
            if (loopSources.length <= 1) {
                return;
            }

            const currentIndex = Number(video.dataset.loopIndex) || 0;
            const nextIndex = (currentIndex + 1) % loopSources.length;
            video.dataset.loopIndex = String(nextIndex);
            applyLoopingVideoSource(video, loopSources[nextIndex]);
            playManagedVideo(video);
        };

        applyLoopingVideoSource(video, nextSource);
        playManagedVideo(video);
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    async function resolveBuildLabel() {
        if (typeof window.initializeTheNunAppConfig === 'function') {
            await window.initializeTheNunAppConfig();
        }
        if (typeof window.getEditionBuildLabel === 'function') {
            return window.getEditionBuildLabel();
        }
        if (typeof window.getBuildModeLabel === 'function') {
            return window.getBuildModeLabel();
        }
        return window.t('titlescreen.standalone_build');
    }

    function getArchiveStatusLabel() {
        try {
            const storageKey = typeof window.getTheNunScopedStorageKey === 'function'
                ? window.getTheNunScopedStorageKey(GALLERY_STORAGE_KEY)
                : GALLERY_STORAGE_KEY;
            const galleryState = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
            return window.t(galleryState.archiveUnlocked ? 'titlescreen.archive_revealed' : 'titlescreen.archive_sealed');
        } catch (error) {
            return window.t('titlescreen.archive_sealed');
        }
    }

    function getCurrentRoundLabel() {
        return window.t('titlescreen.round_label', { round: window.gameState?.currentRound || 1 });
    }

    function getCurrentZoneLabel() {
        return window.t('titlescreen.zone_label', { zone: window.gameState?.currentZone || 1 });
    }

    function populateShowcase(tierKey, options) {
        const content = SHOWCASE_CONTENT[tierKey] || SHOWCASE_CONTENT.base;
        const nextOptions = options || {};
        const tierBox = document.getElementById('pc-expanded-tier-box');
        const text = document.getElementById('pc-expanded-text');
        const primaryVideo = document.getElementById('pc-expanded-video-primary');
        const secondaryVideo = document.getElementById('pc-expanded-video-secondary');

        if (tierBox) {
            tierBox.textContent = window.t(content.tierLabelKey);
        }
        if (text) {
            text.innerHTML = (content.textKeys || [])
                .map((entryKey) => `<div class="pc-expanded-text-item" data-i18n="${entryKey}">${window.t(entryKey)}</div>`)
                .join('');
        }

        const primaryImage = document.getElementById('pc-expanded-image-primary');

        if (nextOptions.playVideos) {
            if (content.primaryImage) {
                stopManagedVideo(primaryVideo, true);
                primaryVideo.style.display = 'none';
                if (primaryImage) {
                    primaryImage.src = content.primaryImage;
                    primaryImage.style.display = 'block';
                }
            } else {
                if (primaryImage) primaryImage.style.display = 'none';
                primaryVideo.style.display = '';
                configureManagedLoopVideo(primaryVideo, [content.primaryVideo]);
            }
            configureManagedLoopVideo(secondaryVideo, [content.secondaryVideo]);
            return;
        }

        stopManagedVideo(primaryVideo, true);
        primaryVideo.style.display = '';
        if (primaryImage) {
            primaryImage.src = '';
            primaryImage.style.display = 'none';
        }
        stopManagedVideo(secondaryVideo, true);
    }

    function applyShowcaseCardContent() {
        document.querySelectorAll('.pc-card[data-pc-tier]').forEach((card) => {
            const tierKey = card.getAttribute('data-pc-tier') || 'base';
            const content = SHOWCASE_CONTENT[tierKey] || SHOWCASE_CONTENT.base;
            const image = card.querySelector('.pc-image');
            const title = card.querySelector('.pc-hover-title');

            if (image) {
                image.src = content.cardImage;
                image.alt = window.t(content.cardAltKey);
            }

            if (title) {
                title.textContent = window.t(content.cardTitleKey);
            }
        });
    }

    function clearShowcaseTimers() {
        if (showcaseOpenTimer) {
            window.clearTimeout(showcaseOpenTimer);
            showcaseOpenTimer = null;
        }

        if (showcaseCloseTimer) {
            window.clearTimeout(showcaseCloseTimer);
            showcaseCloseTimer = null;
        }
    }

    function closeShowcase() {
        const grid = document.querySelector('.pc-grid');
        if (!grid) {
            return;
        }

        clearShowcaseTimers();

        grid.classList.remove('pc-grid-expanded');
        grid.removeAttribute('data-expanded-tier');
        document.querySelectorAll('.pc-card[data-pc-tier]').forEach((card) => {
            card.classList.remove('pc-current-card');
        });
        populateShowcase(grid.dataset.expandedTier || 'base', { playVideos: false });
    }

    function openShowcase(tierKey) {
        const grid = document.querySelector('.pc-grid');
        if (!grid) {
            return;
        }

        clearShowcaseTimers();

        populateShowcase(tierKey, { playVideos: true });
        grid.dataset.expandedTier = tierKey;
        grid.classList.add('pc-grid-expanded');
        document.querySelectorAll('.pc-card[data-pc-tier]').forEach((card) => {
            card.classList.toggle('pc-current-card', card.getAttribute('data-pc-tier') === tierKey);
        });
    }

    function scheduleShowcaseOpen(tierKey) {
        clearShowcaseTimers();
        showcaseOpenTimer = window.setTimeout(() => {
            openShowcase(tierKey);
        }, SHOWCASE_HOVER_OPEN_DELAY_MS);
    }

    function scheduleShowcaseClose() {
        if (!document.querySelector('.pc-grid.pc-grid-expanded')) {
            clearShowcaseTimers();
            return;
        }

        if (showcaseOpenTimer) {
            window.clearTimeout(showcaseOpenTimer);
            showcaseOpenTimer = null;
        }

        if (showcaseCloseTimer) {
            window.clearTimeout(showcaseCloseTimer);
        }

        showcaseCloseTimer = window.setTimeout(() => {
            closeShowcase();
        }, SHOWCASE_HOVER_CLOSE_DELAY_MS);
    }

    function bindMenuShowcase() {
        const grid = document.querySelector('.pc-grid');
        applyShowcaseCardContent();

        document.querySelectorAll('.pc-card[data-pc-tier]').forEach((card) => {
            if (card.dataset.bound === 'true') {
                return;
            }

            card.addEventListener('mouseenter', () => {
                scheduleShowcaseOpen(card.getAttribute('data-pc-tier') || 'base');
            });
            card.addEventListener('focus', () => {
                openShowcase(card.getAttribute('data-pc-tier') || 'base');
            });
            card.dataset.bound = 'true';
        });

        if (grid && grid.dataset.hoverBound !== 'true') {
            grid.addEventListener('mouseenter', clearShowcaseTimers);
            grid.addEventListener('mouseleave', scheduleShowcaseClose);
            grid.dataset.hoverBound = 'true';
        }

        const closeButton = document.getElementById('pc-expanded-close-button');
        if (closeButton && closeButton.dataset.bound !== 'true') {
            closeButton.addEventListener('click', closeShowcase);
            closeButton.dataset.bound = 'true';
        }

        populateShowcase('base', { playVideos: false });
    }

    function bindSocialMediaButtons() {
        document.querySelectorAll('.TS_media[data-social-page]').forEach((button) => {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.addEventListener('click', () => {
                const page = button.getAttribute('data-social-page');
                if (typeof window.openPage === 'function') {
                    window.openPage(page);
                }
            });
            button.dataset.bound = 'true';
        });
    }

    function bindShowcaseMediaButtons() {
        document.querySelectorAll('.pc-video-box').forEach((button) => {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.addEventListener('click', () => {
                if (typeof window.openPage === 'function') {
                    window.openPage('support hub');
                }
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (typeof window.openPage === 'function') {
                        window.openPage('support hub');
                    }
                }
            });
            button.dataset.bound = 'true';
        });
    }

    function bindChoiceHoverPreviewVideos() {
        document.querySelectorAll('.choice-hover-preview-video').forEach((video) => {
            const button = video.closest('.choice-btn');
            if (!button || video.dataset.bound === 'true') {
                return;
            }

            const startPreviewPlayback = () => {
                configureManagedLoopVideo(video, parseVideoLoopSources(video.dataset.loopSources));
            };

            const stopPreviewPlayback = () => {
                stopManagedVideo(video, true);
            };

            button.addEventListener('mouseenter', startPreviewPlayback);
            button.addEventListener('focus', startPreviewPlayback);
            button.addEventListener('mouseleave', stopPreviewPlayback);
            button.addEventListener('blur', () => {
                window.setTimeout(() => {
                    if (!button.matches(':hover') && !button.contains(document.activeElement)) {
                        stopPreviewPlayback();
                    }
                }, 0);
            });

            stopPreviewPlayback();
            video.dataset.bound = 'true';
        });
    }

    window.applyTitleBranding = function() {
        const versionDisplay = document.getElementById('game-version');
        const titleLogo = document.getElementById('title-logo');
        const editionLabel = document.getElementById('title-edition');
        // Branding follows the PRESENTATION edition, which is `base` on Steam even
        // though the build runs with diamond access. See getPresentationEditionConfig().
        const editionConfig = typeof window.getPresentationEditionConfig === 'function'
            ? window.getPresentationEditionConfig()
            : (typeof window.getActiveEditionConfig === 'function' ? window.getActiveEditionConfig() : null);
        const buildConfig = typeof window.getTheNunBuildConfig === 'function'
            ? window.getTheNunBuildConfig()
            : null;
        const displayVersion = buildConfig && buildConfig.version
            ? buildConfig.version
            : (typeof window.getAppDistribution === 'function' && window.getAppDistribution() === 'f95' ? '0.0.1' : '0.0.2');

        if (versionDisplay) {
            versionDisplay.textContent = displayVersion;
            versionDisplay.title = displayVersion;
        }

        if (titleLogo && editionConfig && editionConfig.logoPath) {
            titleLogo.setAttribute('src', editionConfig.logoPath);
        }

        if (editionLabel) {
            editionLabel.textContent = editionConfig ? editionConfig.label : window.t('titlescreen.default_edition_label');
        }
    };

    window.updateTheNunStatsPanel = async function() {
        setText('menu-current-round', getCurrentRoundLabel());
        setText('menu-current-zone', getCurrentZoneLabel());
        setText('menu-archive-state', getArchiveStatusLabel());
        setText('build-mode-label', await resolveBuildLabel());

        if (typeof window.updateSettingsUI === 'function') {
            window.updateSettingsUI();
        }
        if (typeof window.refreshTheNunRunUi === 'function') {
            window.refreshTheNunRunUi();
        }
    };

    // Selectors that should play a click sound when clicked
    const CLICK_SOUND_SELECTORS = [
        '[data-menu-action]',
        '[data-social-page]',
        '#gamma-test-button',
        '#gamma-test-close-button',
        '.gallery_category',
        '.scene_prev',
        '.gallery_unlock_button',
        '.gallery-popup-secondary',
        '.gallery-popup-primary',
        '#look-back-btn',
        '#go-forward-btn',
        '#phase-intro-continue',
        '.choice-btn',
        '#altar-continue-button',
        '#altar-cum-button',
        '.gallery_cum_button',
        '.gallery_zone_switcher_button',
        '.edition-upgrade-button',
        '.TS_menu_button',
        '.run-card__button',
        '.final-rite-btn'
    ].join(', ');

    function playClickSound() {
        if (window.gameSettings?.audio?.clickSoundEnabled === false) {
            return;
        }
        const audio = document.getElementById('click-audio');
        if (!audio) {
            return;
        }
        const sfxVolume = window.gameSettings?.audio?.sfxVolume ?? 0.55;
        const volumeScale = Number.parseFloat(audio.dataset.volumeScale ?? '1');
        const safeVolumeScale = Number.isFinite(volumeScale) && volumeScale >= 0 ? volumeScale : 1;
        audio.volume = Math.min(1, sfxVolume * safeVolumeScale);
        audio.currentTime = 0;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => {});
        }
    }

    function bindClickSoundDelegation() {
        if (document.body.dataset.clickSoundBound === 'true') {
            return;
        }
        document.addEventListener('click', (event) => {
            const target = event.target.closest(CLICK_SOUND_SELECTORS);
            if (target) {
                playClickSound();
            }
        }, true);
        document.body.dataset.clickSoundBound = 'true';
    }

    function showHowToPlay() {
        const overlay = document.getElementById('tutorial-overlay');
        const continueBtn = document.getElementById('tutorial-continue-button');
        if (!overlay) {
            return;
        }
        overlay.classList.remove('hidden');
        if (continueBtn && continueBtn.dataset.bound !== 'true') {
            continueBtn.addEventListener('click', () => overlay.classList.add('hidden'));
            continueBtn.dataset.bound = 'true';
        }
    }

    // Re-render the supporter tier showcase after a language change (its text is
    // built in JS, so data-i18n on the static markup is not enough).
    window.refreshShowcaseTranslations = function() {
        applyShowcaseCardContent();
        const grid = document.querySelector('.pc-grid[data-expanded-tier]');
        if (grid) {
            populateShowcase(grid.dataset.expandedTier || 'base', { playVideos: false });
        }
    };

    function bindMenuButtons() {
        document.querySelectorAll('[data-menu-action]').forEach((button) => {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.addEventListener('click', () => {
                const action = button.getAttribute('data-menu-action');
                if (action === 'play') {
                    // A save's first run offers the tutorial (scripts/tutorial.js); a
                    // saved run asks before it is discarded.
                    if (typeof window.requestTheNunNewRun === 'function') {
                        window.requestTheNunNewRun();
                    } else {
                        window.startGame();
                    }
                } else if (action === 'continue') {
                    if (typeof window.continueTheNunRun === 'function') {
                        window.continueTheNunRun();
                    }
                } else if (action === 'gallery') {
                    window.openGallery();
                } else if (action === 'settings') {
                    window.toggleSettings();
                } else if (action === 'information') {
                    // How to play: the interactive tutorial when present, else the text card.
                    if (window.theNunTutorial && window.theNun3D && window.theNun3D.isEnabled()) {
                        window.theNunTutorial.offerReplay();
                    } else {
                        showHowToPlay();
                    }
                } else if (action === 'quit') {
                    window.quitGame();
                }
            });

            button.dataset.bound = 'true';
        });
    }

    function initializeLaunchAudio() {
        if (window.launchAudioInitialized) {
            return;
        }

        const launchAudio = document.getElementById('launch-audio');
        if (!launchAudio) {
            return;
        }

        launchAudio.src = 'assets/sounds/atmosphere.mp3';
        launchAudio.loop = true;
        launchAudio.currentTime = 0;
        if (typeof window.applyAudioSettings === 'function') {
            window.applyAudioSettings();
        }

        const playPromise = launchAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }

        window.launchAudioInitialized = true;
    }

    window.initializeMainMenu = async function() {
        if (window.mainMenuInitialized) {
            if (typeof window.applyTitleBranding === 'function') {
                window.applyTitleBranding();
            }
            await window.updateTheNunStatsPanel();
            return;
        }

        window.mainMenuInitialized = true;

        if (typeof window.initializeTheNunAppConfig === 'function') {
            await window.initializeTheNunAppConfig();
        }
        if (typeof window.initializeGameView === 'function') {
            window.initializeGameView({ autoStart: false });
        }
        if (typeof window.loadSettings === 'function') {
            await window.loadSettings();
        }
        if (typeof window.initializeGallery === 'function') {
            window.initializeGallery();
        }
        if (typeof window.applyTitleBranding === 'function') {
            window.applyTitleBranding();
        }

        bindMenuButtons();
        bindMenuShowcase();
        bindSocialMediaButtons();
        bindShowcaseMediaButtons();
        bindChoiceHoverPreviewVideos();
        bindClickSoundDelegation();
        initializeLaunchAudio();

        if (typeof window.showTitleScreen === 'function') {
            window.showTitleScreen({ immediate: true });
        }

        if (typeof window.initializeTheNunSaveManager === 'function') {
            await window.initializeTheNunSaveManager();
        }

        await window.updateTheNunStatsPanel();
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.initializeMainMenu();
    });
})();

