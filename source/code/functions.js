(function () {
	const SHARED_SCREEN_TRANSITION_MS = 650;
	const TITLE_SCREEN_TRANSITION_MS = 700;
	const APP_STAGE_WIDTH = 1920;
	const APP_STAGE_HEIGHT = 1080;
	const UI_CLOSE_ACTIONS = {
		gallery: () => window.closeGallery && window.closeGallery({ restoreTitleScreen: false }),
		settings: () => window.closeSettings && window.closeSettings({ keepPauseOverlay: true, restoreTitleScreen: false }),
		pause: () => window.closePauseMenu && window.closePauseMenu()
	};

	const DEFAULT_BUILD_CONFIG = {
		version: '0.0.2',
		buildMode: 'standalone',
		appEdition: 'base',
		saveCompatibilityVersion: 'base',
		isProduction: false,
		isPackaged: false,
		webDebuggingEnabled: true,
		assetsCompressed: false,
		assetsUpscaled: false,
		appDistribution: 'support hub'
	};

	const THE_NUN_EDITIONS = {
		base: {
			key: 'base',
			label: 'Base',
			logoPath: 'assets/icons/logo.png',
			gallery: { gold: false, diamond: false, archiveUnlock: false },
			theme: {
				'--nd-root': '#5a0103',
				'--nd-root-strong': '#f86f82',
				'--nd-root-soft': '#f86f82',
				'--nd-root-rgb': '90 1 3',
				'--nd-root-strong-rgb': '248 111 130',
				'--nd-root-soft-rgb': '248 111 130'
			}
		},
		gold: {
			key: 'gold',
			label: 'Gold',
			logoPath: 'assets/icons/logogold.png',
			gallery: { gold: true, diamond: false, archiveUnlock: false },
			theme: {
				'--nd-root': '#6a4b00',
				'--nd-root-strong': '#e8b84b',
				'--nd-root-soft': '#e8b84b',
				'--nd-root-rgb': '106 75 0',
				'--nd-root-strong-rgb': '232 184 75',
				'--nd-root-soft-rgb': '232 184 75'
			}
		},
		diamond: {
			key: 'diamond',
			label: 'Diamond',
			logoPath: 'assets/icons/logodiamond.png',
			gallery: { gold: true, diamond: true, archiveUnlock: true },
			theme: {
				'--nd-root': '#0c4964',
				'--nd-root-strong': '#7ecff4',
				'--nd-root-soft': '#7ecff4',
				'--nd-root-rgb': '12 73 100',
				'--nd-root-strong-rgb': '126 207 244',
				'--nd-root-soft-rgb': '126 207 244'
			}
		}
	};

	const SOCIAL_PAGE_URLS = {
		discord: 'https://discord.gg/7rRVwNqyG3',
		website: '',
		steamwishlist: 'https://store.steampowered.com/curator/45755649',
		rule34games: 'https://rule34games.com',
		'steam-le': 'https://store.steampowered.com/app/4861300/Lewd_Elevator/',
		'steam-ha': 'https://store.steampowered.com/app/4992990/Horny_Asylum/'
	};
	const ATTACK_SLIDE_SOUND_SOURCES = [
		'assets/sounds/slide1.wav',
		'assets/sounds/slide2.wav',
		'assets/sounds/slide3.wav',
		'assets/sounds/slide4.wav',
		'assets/sounds/slide5.wav'
	];
	const ATTACK_LOOP_VOICE_SOUNDS = [
		{ source: 'assets/sounds/jane_cum.mp3', chance: 0.05 },
		{ source: 'assets/sounds/jane_moan2.mp3', chance: 0.15 },
		{ source: 'assets/sounds/jane_moan3.mp3', chance: 0.15 }
	];
	const DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS = Object.freeze({
		voiceVolumeScale: 0.45,
		voicePlaybackRate: 1
	});

	function setDisplay(target, value) {
		if (target) {
			target.style.display = value;
		}
	}

	function playAttackSlideHit(source, activeAudios, volumeScale = 1, playbackRate = 1) {
		if (!source) {
			return null;
		}

		const slideAudio = new Audio(source);
		const sfxVolume = Number(window.gameSettings?.audio?.sfxVolume);
		const safeVolumeScale = Number.isFinite(volumeScale) && volumeScale >= 0 ? volumeScale : 1;
		const safePlaybackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
		slideAudio.preload = 'auto';
		slideAudio.playbackRate = safePlaybackRate;
		slideAudio.volume = Math.max(0, Math.min(1, (Number.isFinite(sfxVolume) ? sfxVolume : 0.55) * safeVolumeScale));

		const releaseAudio = () => {
			activeAudios.delete(slideAudio);
			slideAudio.onended = null;
			slideAudio.onerror = null;
		};

		slideAudio.onended = releaseAudio;
		slideAudio.onerror = releaseAudio;
		activeAudios.add(slideAudio);

		const playPromise = slideAudio.play();
		if (playPromise && typeof playPromise.catch === 'function') {
			playPromise.catch(() => {
				releaseAudio();
			});
		}

		return slideAudio;
	}

	function maybePlayAttackLoopVoice(activeAudios, audioOptions) {
		const roll = Math.random();
		let cumulativeChance = 0;
		const nextOptions = audioOptions || DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS;
		const voiceVolumeScale = Number.isFinite(nextOptions.voiceVolumeScale)
			? nextOptions.voiceVolumeScale
			: DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS.voiceVolumeScale;
		const voicePlaybackRate = Number.isFinite(nextOptions.voicePlaybackRate)
			? nextOptions.voicePlaybackRate
			: DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS.voicePlaybackRate;

		for (const voiceOption of ATTACK_LOOP_VOICE_SOUNDS) {
			cumulativeChance += voiceOption.chance;
			if (roll <= cumulativeChance) {
				playAttackSlideHit(voiceOption.source, activeAudios, voiceVolumeScale, voicePlaybackRate);
				return;
			}
		}
	}

	function clearAttackSlideLoopState(controller) {
		if (!controller) {
			return;
		}

		controller.pendingTimeouts.forEach((timeoutId) => {
			window.clearTimeout(timeoutId);
		});
		controller.pendingTimeouts.clear();

		controller.activeAudios.forEach((audio) => {
			audio.pause();
			audio.currentTime = 0;
		});
		controller.activeAudios.clear();
	}

	function queueAttackSlideLoop(controller) {
		if (!controller || !controller.video) {
			return;
		}

		clearAttackSlideLoopState(controller);
		playAttackSlideHit(ATTACK_SLIDE_SOUND_SOURCES[Math.floor(Math.random() * ATTACK_SLIDE_SOUND_SOURCES.length)], controller.activeAudios);
		maybePlayAttackLoopVoice(controller.activeAudios, controller.audioOptions);

		const delayedTimeout = window.setTimeout(() => {
			controller.pendingTimeouts.delete(delayedTimeout);
			playAttackSlideHit(ATTACK_SLIDE_SOUND_SOURCES[Math.floor(Math.random() * ATTACK_SLIDE_SOUND_SOURCES.length)], controller.activeAudios);
		}, 500);

		controller.pendingTimeouts.add(delayedTimeout);
	}

	function startAttackSlideLoopSfx(video, options) {
		if (!video) {
			return null;
		}

		stopAttackSlideLoopSfx(video);

		const nextOptions = options && typeof options === 'object'
			? {
				voiceVolumeScale: Number.isFinite(options.voiceVolumeScale) ? options.voiceVolumeScale : DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS.voiceVolumeScale,
				voicePlaybackRate: Number.isFinite(options.voicePlaybackRate) ? options.voicePlaybackRate : DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS.voicePlaybackRate
			}
			: DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS;

		const controller = {
			video,
			audioOptions: nextOptions,
			pendingTimeouts: new Set(),
			activeAudios: new Set(),
			lastTime: Number(video.currentTime) || 0,
			onTimeUpdate: null,
			onPause: null,
			onEnded: null
		};

		if (!window.__attackSlideControllers) {
			window.__attackSlideControllers = new Set();
		}
		window.__attackSlideControllers.add(controller);

		controller.onTimeUpdate = () => {
			const currentTime = Number(video.currentTime) || 0;
			if (controller.lastTime > 0.35 && currentTime + 0.08 < controller.lastTime) {
				queueAttackSlideLoop(controller);
			}

			controller.lastTime = currentTime;
		};

		controller.onPause = () => {
			clearAttackSlideLoopState(controller);
			controller.lastTime = Number(video.currentTime) || 0;
		};

		controller.onEnded = () => {
			clearAttackSlideLoopState(controller);
			controller.lastTime = 0;
		};

		video.addEventListener('timeupdate', controller.onTimeUpdate);
		video.addEventListener('pause', controller.onPause);
		video.addEventListener('ended', controller.onEnded);
		video.__attackSlideLoopSfx = controller;

		queueAttackSlideLoop(controller);
		return controller;
	}

	function stopAttackSlideLoopSfx(video) {
		const controller = video && video.__attackSlideLoopSfx;
		if (!controller) {
			return;
		}

		video.removeEventListener('timeupdate', controller.onTimeUpdate);
		video.removeEventListener('pause', controller.onPause);
		video.removeEventListener('ended', controller.onEnded);
		clearAttackSlideLoopState(controller);
		delete video.__attackSlideLoopSfx;

		if (window.__attackSlideControllers) {
			window.__attackSlideControllers.delete(controller);
		}
	}

	// Called by applyAudioSettings to update volumes on off-DOM SFX audio objects.
	window.syncOffDomSfxVolume = function (sfxVolume) {
		const safeSfxVolume = Number.isFinite(sfxVolume) && sfxVolume >= 0 ? sfxVolume : 0.55;

		// Attack slide / drag loop audios.
		if (window.__attackSlideControllers) {
			window.__attackSlideControllers.forEach((controller) => {
				const voiceVolumeScale = Number.isFinite(controller.audioOptions?.voiceVolumeScale)
					? controller.audioOptions.voiceVolumeScale
					: DEFAULT_ATTACK_LOOP_AUDIO_OPTIONS.voiceVolumeScale;
				controller.activeAudios.forEach((audio) => {
					audio.volume = Math.max(0, Math.min(1, safeSfxVolume * voiceVolumeScale));
				});
			});
		}

		// Nun walk audio (registered by nunSystem).
		if (window.__nunWalkAudioInstances) {
			window.__nunWalkAudioInstances.forEach((audio) => {
				audio.volume = Math.max(0, Math.min(1, safeSfxVolume));
			});
		}
	};

	function getGameplayRoot() {
		return document.getElementById('game-container');
	}

	function getTitleScreenElements() {
		return [
			document.querySelector('.TS_background'),
			document.querySelector('.titlescreen')
		].filter(Boolean);
	}

	function getTitleScreenShell() {
		return {
			stage: document.getElementById('app-stage') || document.body,
			background: document.querySelector('.TS_background'),
			backgroundVideo: document.getElementById('titlescreen-background-video'),
			mediaRail: document.querySelector('.TS_overlayMedias'),
			titleScreen: document.querySelector('.titlescreen')
		};
	}

	function playTitleScreenBackgroundVideo(options) {
		const nextOptions = options || {};
		const backgroundVideo = getTitleScreenShell().backgroundVideo;

		if (!backgroundVideo) {
			return;
		}

		backgroundVideo.muted = true;
		backgroundVideo.playsInline = true;
		backgroundVideo.loop = true;

		if (nextOptions.restart !== false) {
			try {
				backgroundVideo.currentTime = 0;
			} catch (_) {
				// Ignore seek failures before metadata is ready.
			}
		}

		const playPromise = backgroundVideo.play();
		if (playPromise && typeof playPromise.catch === 'function') {
			playPromise.catch(() => { });
		}
	}

	function stopTitleScreenBackgroundVideo(options) {
		const nextOptions = options || {};
		const backgroundVideo = getTitleScreenShell().backgroundVideo;

		if (!backgroundVideo) {
			return;
		}

		backgroundVideo.pause();

		if (nextOptions.reset !== false) {
			try {
				backgroundVideo.currentTime = 0;
			} catch (_) {
				// Ignore seek failures before metadata is ready.
			}
		}
	}

	function restoreTitleScreenShell() {
		const shell = getTitleScreenShell();
		[shell.background, shell.mediaRail, shell.titleScreen].filter(Boolean).forEach((element) => {
			if (shell.stage && element.parentElement !== shell.stage) {
				shell.stage.appendChild(element);
			}
		});

		if (shell.background) {
			shell.background.classList.remove('is-exiting');
			shell.background.classList.add('is-visible');
			setDisplay(shell.background, 'block');
		}

		if (shell.titleScreen) {
			shell.titleScreen.classList.remove('is-exiting');
			shell.titleScreen.classList.add('is-visible');
			shell.titleScreen.setAttribute('aria-hidden', 'false');
			setDisplay(shell.titleScreen, 'flex');
		}
	}

	function forceHideMenuOverlays() {
		const pauseOverlay = document.getElementById('pause-menu-overlay');
		const settingsPanel = document.getElementById('settings-panel');

		if (pauseOverlay) {
			pauseOverlay.classList.remove('is-visible');
			setDisplay(pauseOverlay, 'none');
		}

		if (settingsPanel) {
			settingsPanel.classList.remove('panel-visible');
			settingsPanel.classList.remove('panel-closing');
			setDisplay(settingsPanel, 'none');
		}
	}

	function updateAppStageScale() {
		const stage = document.getElementById('app-stage');
		if (!stage) {
			return;
		}

		const viewportWidth = window.innerWidth || APP_STAGE_WIDTH;
		const viewportHeight = window.innerHeight || APP_STAGE_HEIGHT;
		const nextScale = Math.min(viewportWidth / APP_STAGE_WIDTH, viewportHeight / APP_STAGE_HEIGHT);
		const safeScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;

		document.documentElement.style.setProperty('--app-stage-scale', String(safeScale));
	}

	function isGameplayVisible() {
		const gameplayRoot = getGameplayRoot();
		return Boolean(gameplayRoot) && !gameplayRoot.classList.contains('hidden') && window.getComputedStyle(gameplayRoot).display !== 'none';
	}

	function setGameplayVisibility(isVisible) {
		const gameplayRoot = getGameplayRoot();
		if (!gameplayRoot) {
			return;
		}

		gameplayRoot.classList.toggle('hidden', !isVisible);
		setDisplay(gameplayRoot, isVisible ? 'block' : 'none');

		if (!isVisible) {
			const atmosphereAudio = document.getElementById('game-atmosphere-audio');
			if (atmosphereAudio) {
				atmosphereAudio.pause();
				atmosphereAudio.currentTime = 0;
			}
		}
	}

	function setImmediateTransition(elements, immediate) {
		elements.forEach((element) => {
			if (!element) {
				return;
			}
			element.style.transitionDuration = immediate ? '0ms' : '';
		});
	}

	function clearImmediateTransition(elements) {
		window.setTimeout(() => {
			setImmediateTransition(elements, false);
		}, 0);
	}

	function normalizeEditionKey(edition) {
		const normalizedEdition = String(edition || 'base').trim().toLowerCase();
		if (normalizedEdition === 'gold' || normalizedEdition === 'diamond') {
			return normalizedEdition;
		}
		return 'base';
	}

	function normalizeSaveCompatibilityVersion(version) {
		return normalizeEditionKey(version);
	}

	function normalizeDistribution(dist) {
		const normalized = String(dist || 'support hub').trim().toLowerCase();
		if (normalized === 'f95') return 'f95';
		return 'support hub';
	}

	function normalizeVersion(version, distribution) {
		const trimmedVersion = String(version || '').trim();
		if (trimmedVersion) {
			return trimmedVersion;
		}

		return normalizeDistribution(distribution) === 'f95' ? '0.0.1' : '0.0.2';
	}

	function mergeBuildConfig(config) {
		const nextConfig = Object.assign({}, DEFAULT_BUILD_CONFIG, window.THE_NUN_BUILD_CONFIG || {}, config || {});
		nextConfig.version = normalizeVersion(nextConfig.version, nextConfig.appDistribution);
		nextConfig.buildMode = nextConfig.buildMode === 'steam' ? 'steam' : 'standalone';
		nextConfig.appEdition = normalizeEditionKey(nextConfig.appEdition);
		nextConfig.saveCompatibilityVersion = normalizeSaveCompatibilityVersion(nextConfig.saveCompatibilityVersion || nextConfig.appEdition);
		nextConfig.isProduction = Boolean(nextConfig.isProduction);
		nextConfig.isPackaged = Boolean(nextConfig.isPackaged);
		nextConfig.webDebuggingEnabled = nextConfig.webDebuggingEnabled !== false && !nextConfig.isPackaged;
		nextConfig.assetsCompressed = Boolean(nextConfig.assetsCompressed);
		nextConfig.assetsUpscaled = Boolean(nextConfig.assetsUpscaled);
		nextConfig.appDistribution = normalizeDistribution(nextConfig.appDistribution);
		return nextConfig;
	}

	function applyThemeVariables() {
		const root = document.documentElement;
		if (!root) {
			return;
		}

		const editionConfig = window.getPresentationEditionConfig();
		Object.entries(editionConfig.theme).forEach(([name, value]) => {
			root.style.setProperty(name, value);
		});

		root.dataset.edition = editionConfig.key;
		if (document.body) {
			document.body.dataset.edition = editionConfig.key;
		}
	}

	window.THE_NUN_BUILD_CONFIG = mergeBuildConfig(window.THE_NUN_BUILD_CONFIG);
	window.THE_NUN_APP_CONFIG_READY = null;

	window.getTheNunBuildConfig = function () {
		return Object.assign({}, window.THE_NUN_BUILD_CONFIG || DEFAULT_BUILD_CONFIG);
	};

	window.getActiveEditionKey = function () {
		return normalizeEditionKey(window.THE_NUN_BUILD_CONFIG && window.THE_NUN_BUILD_CONFIG.appEdition);
	};

	window.getAppDistribution = function () {
		return normalizeDistribution(window.THE_NUN_BUILD_CONFIG && window.THE_NUN_BUILD_CONFIG.appDistribution);
	};

	function sanitizeUpdateManagerCount(value, fallbackValue = null) {
		const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
		if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
			return fallbackValue;
		}

		return parsedValue;
	}

	function normalizeUpdateManagerRouteKey(choice) {
		switch (String(choice || '').trim()) {
			case 'help-nun':
			case 'helpNun':
				return 'helpNun';
			case 'help-demon':
			case 'helpDemon':
				return 'helpDemon';
			case 'surrender':
				return 'surrender';
			case 'demon-exorcism':
			case 'demonExorcism':
				return 'demonExorcism';
			case 'nun-corruption':
			case 'nunCorruption':
				return 'nunCorruption';
			case 'attack-nun':
			case 'attackNun':
				return 'attackNun';
			case 'attack-demon':
			case 'attackDemon':
				return 'attackDemon';
			default:
				return null;
		}
	}

	function getRawUpdateManagerConfig() {
		return window.THE_NUN_UPDATE_MANAGER_CONFIG && typeof window.THE_NUN_UPDATE_MANAGER_CONFIG === 'object'
			? window.THE_NUN_UPDATE_MANAGER_CONFIG
			: {};
	}

	window.getTheNunUpdateManagerConfig = function () {
		const config = getRawUpdateManagerConfig();
		const attackSceneVariations = config.attackSceneVariations && typeof config.attackSceneVariations === 'object'
			? config.attackSceneVariations
			: {};
		const altarRoutes = config.altarRoutes && typeof config.altarRoutes === 'object'
			? config.altarRoutes
			: {};

		return {
			attackSceneVariations,
			altarRoutes
		};
	};

	window.getTheNunSceneVariationCount = function (key, fallbackValue = null) {
		const config = window.getTheNunUpdateManagerConfig();
		return sanitizeUpdateManagerCount(config.attackSceneVariations && config.attackSceneVariations[key], fallbackValue);
	};

	window.getTheNunAltarRouteConfig = function (choice) {
		const routeKey = normalizeUpdateManagerRouteKey(choice);
		const config = window.getTheNunUpdateManagerConfig();
		const routeConfig = routeKey ? config.altarRoutes && config.altarRoutes[routeKey] : null;

		return {
			key: routeKey,
			count: sanitizeUpdateManagerCount(routeConfig && routeConfig.count, null),
			teaserOnly: Boolean(routeConfig && routeConfig.teaserOnly)
		};
	};

	window.isTheNunTeaserRouteScene = function (choice, sceneIndex) {
		const routeConfig = window.getTheNunAltarRouteConfig(choice);
		const normalizedSceneIndex = sanitizeUpdateManagerCount(sceneIndex, null);

		return Boolean(
			routeConfig.key
			&& routeConfig.teaserOnly
			&& routeConfig.count
			&& normalizedSceneIndex
			&& normalizedSceneIndex === routeConfig.count
		);
	};

	window.getActiveEditionConfig = function () {
		return THE_NUN_EDITIONS[window.getActiveEditionKey()];
	};

	// PRESENTATION vs ACCESS. The Steam build runs as `diamond` so all altar routes
	// and gallery categories are unlocked, but it must LOOK like the ordinary game --
	// normal logo, normal theme, no diamond badge (Shaun, 2026-07-29: "the version on
	// steam should look like the normal version of the game! the only thing is it has
	// the diamond content").
	// Only branding reads these; every access check keeps using the ACTIVE edition.
	window.getPresentationEditionKey = function () {
		return window.isSteamBuild() ? 'base' : window.getActiveEditionKey();
	};

	window.getPresentationEditionConfig = function () {
		return THE_NUN_EDITIONS[window.getPresentationEditionKey()];
	};

	window.getCurrentSaveCompatibilityVersion = function () {
		return normalizeSaveCompatibilityVersion(window.THE_NUN_BUILD_CONFIG && window.THE_NUN_BUILD_CONFIG.saveCompatibilityVersion);
	};

	window.isSaveVersionCompatible = function (savedVersion) {
		if (!savedVersion) {
			return false;
		}
		return normalizeSaveCompatibilityVersion(savedVersion) === window.getCurrentSaveCompatibilityVersion();
	};

	window.getEditionDisplayName = function (editionKey) {
		return THE_NUN_EDITIONS[normalizeEditionKey(editionKey)].label;
	};

	window.getEditionBuildConfig = function () {
		return Object.assign({}, window.THE_NUN_BUILD_CONFIG);
	};

	window.getBuildModeLabel = function () {
		return window.getTheNunBuildConfig().buildMode === 'steam'
			? window.t('titlescreen.steam_build')
			: window.t('titlescreen.standalone_build');
	};

	window.getEditionBuildLabel = function () {
		// Steam presents as the ordinary game, so it shows the build label alone
		// rather than claiming an edition tier it deliberately does not display.
		if (window.isSteamBuild()) {
			return window.getBuildModeLabel();
		}
		return window.t('titlescreen.edition_build', {
			edition: window.getEditionDisplayName(window.getActiveEditionKey()),
			build: window.getBuildModeLabel()
		});
	};

	window.canAccessGalleryCategory = function (category) {
		const galleryAccess = window.getActiveEditionConfig().gallery;
		if (category === 'gold') {
			return Boolean(galleryAccess.gold);
		}
		if (category === 'diamond') {
			return Boolean(galleryAccess.diamond);
		}
		return true;
	};

	window.canUnlockGalleryArchive = function () {
		return Boolean(window.getActiveEditionConfig().gallery.archiveUnlock);
	};

	window.getTheNunScopedStorageKey = function (baseKey, options) {
		const nextOptions = options || {};
		if (nextOptions.shared) {
			return baseKey;
		}
		return `${baseKey}:${normalizeSaveCompatibilityVersion(
			nextOptions.saveCompatibilityVersion
			|| nextOptions.version
			|| nextOptions.edition
			|| window.getCurrentSaveCompatibilityVersion()
		)}`;
	};

	window.isSteamBuild = function () {
		return window.getTheNunBuildConfig().buildMode === 'steam';
	};

	// STEAM build: swap the Support Hub tier panel for the Steam partner panel and hide
	// the external social buttons (the overlay-media stack is support hub/support hub-
	// centric, matching LE's behaviour).
	window.applySteamTitlescreenMode = function () {
		// The steam sanitizer renames .supporter-panel → .supporter-panel, so match both.
		const tierPanel = document.querySelector('.supporter-panel, .supporter-panel');
		const steamPanel = document.getElementById('steam-panel');
		const overlayMedias = document.querySelector('.TS_overlayMedias');
		const steamActive = typeof window.isSteamBuild === 'function' && window.isSteamBuild();

		if (steamActive) {
			if (tierPanel) tierPanel.style.display = 'none';
			if (steamPanel) steamPanel.style.display = '';
			if (overlayMedias) overlayMedias.style.display = 'none';
		} else {
			if (tierPanel) tierPanel.style.display = '';
			if (steamPanel) steamPanel.style.display = 'none';
			if (overlayMedias) overlayMedias.style.display = '';
		}
	};

	window.applyTheNunBuildConfig = function (config) {
		window.THE_NUN_BUILD_CONFIG = mergeBuildConfig(config);
		applyThemeVariables();

		if (typeof window.applySteamTitlescreenMode === 'function') {
			window.applySteamTitlescreenMode();
		}

		if (typeof window.applyTitleBranding === 'function') {
			window.applyTitleBranding();
		}
		if (typeof window.updateGalleryEditionState === 'function') {
			window.updateGalleryEditionState();
		}
		if (typeof window.updateTheNunStatsPanel === 'function') {
			window.updateTheNunStatsPanel();
		}
		if (typeof window.updateSettingsUI === 'function') {
			window.updateSettingsUI();
		}

		return window.getEditionBuildConfig();
	};

	window.setSocialPageUrl = function (page, url) {
		if (!Object.prototype.hasOwnProperty.call(SOCIAL_PAGE_URLS, page)) {
			return;
		}
		SOCIAL_PAGE_URLS[page] = typeof url === 'string' ? url : '';
	};

	window.openPage = function (page) {
		const url = SOCIAL_PAGE_URLS[page];
		if (!url) {
			console.warn('No external URL configured for page:', page);
			return;
		}

		if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
			window.electronAPI.openExternalUrl(url).catch((error) => {
				console.warn('Failed to open external URL:', error);
				window.open(url, '_blank', 'noopener');
			});
			return;
		}

		window.open(url, '_blank', 'noopener');
	};

	window.initializeTheNunAppConfig = async function () {
		if (window.THE_NUN_APP_CONFIG_READY) {
			return window.THE_NUN_APP_CONFIG_READY;
		}

		window.THE_NUN_APP_CONFIG_READY = (async function () {
			if (!window.electronAPI || typeof window.electronAPI.getBuildConfig !== 'function') {
				return window.applyTheNunBuildConfig(window.getTheNunBuildConfig());
			}

			try {
				const config = await window.electronAPI.getBuildConfig();
				window.applyTheNunBuildConfig(config);
			} catch (error) {
				console.warn('Failed to resolve build config:', error);
			}

			return window.getEditionBuildConfig();
		})();

		return window.THE_NUN_APP_CONFIG_READY;
	};

	if (window.electronAPI && typeof window.electronAPI.onBuildConfig === 'function') {
		window.electronAPI.onBuildConfig(function (config) {
			window.applyTheNunBuildConfig(config);
		});
	}

	applyThemeVariables();

	window.initializeGameView = function (options) {
		const nextOptions = options || {};
		const gameplayRoot = getGameplayRoot();
		if (!gameplayRoot) {
			return;
		}

		gameplayRoot.classList.add('game-view-container');
		if (!nextOptions.preserveVisibility) {
			gameplayRoot.classList.add('hidden');
			gameplayRoot.style.display = 'none';
		}
	};

	window.showBottomPanel = function (target) {
		const element = typeof target === 'string' ? document.querySelector(target) : target;
		if (!element) {
			return;
		}
		element.style.display = 'flex';
		requestAnimationFrame(() => {
			element.classList.remove('panel-closing');
			element.classList.add('panel-visible');
		});
	};

	window.hideBottomPanel = function (target) {
		const element = typeof target === 'string' ? document.querySelector(target) : target;
		if (!element) {
			return;
		}
		element.classList.remove('panel-visible');
		element.classList.add('panel-closing');
		window.setTimeout(() => {
			if (element.classList.contains('panel-closing')) {
				element.style.display = 'none';
			}
		}, 420);
	};

	window.closeOtherUIs = function (keepOpen) {
		const preservedKeys = keepOpen === 'settings' || keepOpen === 'pause'
			? ['settings', 'pause']
			: [keepOpen];

		Object.entries(UI_CLOSE_ACTIONS).forEach(([key, closeAction]) => {
			if (preservedKeys.includes(key)) {
				return;
			}
			closeAction();
		});
	};

	window.runSharedScreenFade = function (onMidpoint, options) {
		const nextOptions = options || {};
		const overlay = document.getElementById('screen-transition-overlay');
		const duration = Number(nextOptions.duration) || SHARED_SCREEN_TRANSITION_MS;
		const overlayClassName = typeof nextOptions.overlayClassName === 'string'
			? nextOptions.overlayClassName.trim()
			: '';

		if (!overlay) {
			if (typeof onMidpoint === 'function') {
				onMidpoint();
			}
			return Promise.resolve();
		}

		overlay.className = overlayClassName ? overlayClassName : '';
		overlay.style.transitionDuration = `${duration}ms`;
		overlay.classList.add('is-visible');

		return new Promise((resolve) => {
			window.setTimeout(() => {
				if (typeof onMidpoint === 'function') {
					onMidpoint();
				}

				window.setTimeout(() => {
					overlay.classList.remove('is-visible');
					if (overlayClassName) {
						overlay.classList.remove(overlayClassName);
					}
					resolve();
				}, Math.round(duration * 0.5));
			}, Math.round(duration * 0.5));
		});
	};

	window.showTitleScreen = function (options) {
		const nextOptions = options || {};
		const titleElements = getTitleScreenElements();
		const immediate = Boolean(nextOptions.immediate);

		setImmediateTransition(titleElements, immediate);
		setGameplayVisibility(false);
		// The menu bed (`launch-audio`) is ducked to 17% while gameplay is visible
		// (settings.js applyAudioSettings). Gameplay has just been hidden, so the duck
		// has to be recomputed here or the title screen keeps the quiet gameplay level.
		if (typeof window.applyAudioSettings === 'function') {
			window.applyAudioSettings();
		}
		restoreTitleScreenShell();

		titleElements.forEach((element) => {
			element.classList.remove('is-exiting');
			setDisplay(element, element.classList.contains('TS_background') ? 'block' : 'flex');
		});

		requestAnimationFrame(() => {
			titleElements.forEach((element) => {
				element.classList.add('is-visible');
			});
		});
		playTitleScreenBackgroundVideo({ restart: true });

		document.body.classList.add('menu-active');
		if (typeof window.updateTheNunStatsPanel === 'function') {
			window.updateTheNunStatsPanel();
		}
		clearImmediateTransition(titleElements);
	};

	window.hideTitleScreen = function (options) {
		const nextOptions = options || {};
		const immediate = Boolean(nextOptions.immediate);
		const titleElements = getTitleScreenElements();

		setImmediateTransition(titleElements, immediate);
		titleElements.forEach((element) => {
			element.classList.remove('is-visible');
			element.classList.add('is-exiting');
		});
		stopTitleScreenBackgroundVideo({ reset: true });
		document.body.classList.remove('menu-active');

		window.setTimeout(() => {
			titleElements.forEach((element) => {
				if (element.classList.contains('is-exiting')) {
					setDisplay(element, 'none');
				}
			});
		}, immediate ? 0 : TITLE_SCREEN_TRANSITION_MS);

		clearImmediateTransition(titleElements);
	};

	window.transitionOutTitleScreen = function (options) {
		const nextOptions = options || {};
		const titleElements = getTitleScreenElements();
		const duration = Number(nextOptions.duration) || TITLE_SCREEN_TRANSITION_MS;

		if (titleElements.length === 0) {
			document.body.classList.remove('menu-active');
			return Promise.resolve();
		}

		titleElements.forEach((element) => {
			element.classList.remove('is-visible');
			element.classList.add('is-exiting');
		});
		stopTitleScreenBackgroundVideo({ reset: true });
		document.body.classList.remove('menu-active');

		return new Promise((resolve) => {
			window.setTimeout(() => {
				titleElements.forEach((element) => {
					setDisplay(element, 'none');
				});
				resolve();
			}, duration);
		});
	};

	window.returnToTitleScreen = function () {
		if (typeof window.closeOtherUIs === 'function') {
			window.closeOtherUIs('pause');
		}

		return window.runSharedScreenFade(() => {
			forceHideMenuOverlays();
			setGameplayVisibility(false);
			if (typeof window.stopNunGameSession === 'function') {
				window.stopNunGameSession();
			} else if (typeof window.resetNunGameSession === 'function') {
				window.resetNunGameSession();
			}
			restoreTitleScreenShell();
			window.showTitleScreen({ immediate: true });
		}, {
			overlayClassName: 'screen-transition-overlay--opaque'
		});
	};

	window.startGame = function () {
		if (typeof window.closeOtherUIs === 'function') {
			window.closeOtherUIs();
		}

		return window.transitionOutTitleScreen().then(() => {
			setGameplayVisibility(true);

			const atmosphereAudio = document.getElementById('game-atmosphere-audio');
			if (atmosphereAudio) {
				if (typeof window.applyAudioSettings === 'function') {
					window.applyAudioSettings();
				}
				atmosphereAudio.currentTime = 0;
				const atmosPromise = atmosphereAudio.play();
				if (atmosPromise && typeof atmosPromise.catch === 'function') {
					atmosPromise.catch(() => { });
				}
			}

			if (typeof window.initializeNunRuntime === 'function') {
				window.initializeNunRuntime();
			} else if (typeof window.initGame === 'function') {
				window.initGame();
			}
		});
	};

	window.isGameplayViewVisible = isGameplayVisible;
	window.updateAppStageScale = updateAppStageScale;
	window.startAttackSlideLoopSfx = startAttackSlideLoopSfx;
	window.stopAttackSlideLoopSfx = stopAttackSlideLoopSfx;

	applyThemeVariables();
	updateAppStageScale();
	window.addEventListener('resize', updateAppStageScale);
	window.addEventListener('fullscreenchange', updateAppStageScale);
})();

// Re-render every piece of UI whose text is built in JS (data-i18n only covers
// the static markup). Called by the i18n engine after the language changes and
// after a locale dictionary finishes loading. Every step is guarded so a single
// failing subsystem can never abort the rest of the refresh.
window.refreshDynamicTranslations = function () {
	const safeCall = (fn, ...args) => {
		try {
			if (typeof fn === 'function') fn(...args);
		} catch (error) {
			console.error('refreshDynamicTranslations: a refresh step failed.', error);
		}
	};

	safeCall(window.updateSettingsUI);
	safeCall(window.applyTitleBranding);
	safeCall(window.updateTheNunStatsPanel);
	safeCall(window.refreshShowcaseTranslations);
	safeCall(window.refreshLookBackButtonLabel);

	// HUD counters and the altar panel only exist once a run is in progress.
	if (window.uiController) {
		safeCall(window.updateCounters, window.uiController);
		safeCall(window.refreshAltarTranslations);
	}

	// Rebuild gallery entry titles/kickers, and re-render if the gallery is open.
	safeCall(window.refreshGalleryForLanguage);

	// Title-screen Continue button and endings line.
	safeCall(window.refreshTheNunRunUi);
};
