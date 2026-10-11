/**
 * Internationalization (i18n) Module — The Nun
 * ============================================
 *
 * Lightweight, dependency-free localization for the renderer. The set of
 * supported languages mirrors Steam's official "API language code" list so the
 * Steam edition can auto-detect the player's language via
 * apps.currentGameLanguage() and map it 1:1 onto a locale here.
 *
 * HOW IT WORKS
 *   - The English catalog below (BASE) is the single source of truth for every
 *     translatable key. Other locales live in code/locales/<code>.json and are
 *     loaded lazily, then applied via window.registerLocale(<code>, { ... }).
 *     Any key a locale omits falls back to English automatically.
 *   - Static markup is translated declaratively:
 *       <span data-i18n="common.play">Play</span>          -> textContent
 *       <div  data-i18n-html="hud.tip">...</div>            -> innerHTML
 *       <input data-i18n-attr="placeholder:auth.username">  -> attribute(s)
 *   - Dynamic strings created in JS use window.t("some.key", { var: value }).
 *
 * LANGUAGE RESOLUTION (window.resolveStartupLanguage)
 *   1. A previously saved choice (gameSettings.language) wins — it is written
 *      the moment the player picks a language in Settings and travels with the
 *      save (including Steam Cloud).
 *   2. Otherwise the game boots in ENGLISH.
 *   There is deliberately NO Steam auto-detect and NO OS/browser sniffing at
 *   startup (changed 2026-07-27 on Shaun's call): every first boot is English,
 *   and the language only ever changes because the player changed it.
 *
 * KEY NAMING RULE (do not break this)
 *   Keys are identifiers: lowercase, dot-namespaced, NO spaces, and they must
 *   never contain a supporter-platform brand word. The Steam workspace
 *   sanitizer rewrites brand words to "Support Hub" (which contains a space)
 *   across every shipped text file — if a brand word ever appeared in a KEY it
 *   would be rewritten on the Steam build only, and every lookup would miss and
 *   render the raw key. Brand words are fine in VALUES; they get neutralized.
 *
 * Everything degrades gracefully: with no locale files present the game runs in
 * English, and window.t() always returns a sensible string (never undefined).
 */
(function () {
    "use strict";

    // Steam API language codes (the value returned by apps.currentGameLanguage()).
    // `name` is shown in the in-game language selector in its own script.
    var SUPPORTED_LANGUAGES = [
        { code: "english", name: "English" },
        { code: "arabic", name: "العربية", dir: "rtl" },
        { code: "bulgarian", name: "Български" },
        { code: "schinese", name: "简体中文" },
        { code: "tchinese", name: "繁體中文" },
        { code: "czech", name: "Čeština" },
        { code: "danish", name: "Dansk" },
        { code: "dutch", name: "Nederlands" },
        { code: "finnish", name: "Suomi" },
        { code: "french", name: "Français" },
        { code: "german", name: "Deutsch" },
        { code: "greek", name: "Ελληνικά" },
        { code: "hungarian", name: "Magyar" },
        { code: "indonesian", name: "Bahasa Indonesia" },
        { code: "italian", name: "Italiano" },
        { code: "japanese", name: "日本語" },
        { code: "koreana", name: "한국어" },
        { code: "norwegian", name: "Norsk" },
        { code: "polish", name: "Polski" },
        { code: "portuguese", name: "Português" },
        { code: "brazilian", name: "Português (Brasil)" },
        { code: "romanian", name: "Română" },
        { code: "russian", name: "Русский" },
        { code: "spanish", name: "Español" },
        { code: "latam", name: "Español (Latinoamérica)" },
        { code: "swedish", name: "Svenska" },
        { code: "thai", name: "ไทย" },
        { code: "turkish", name: "Türkçe" },
        { code: "ukrainian", name: "Українська" },
        { code: "vietnamese", name: "Tiếng Việt" },
    ];

    var RTL_CODES = { arabic: true };

    // Steam locale code -> BCP-47 tag for <html lang> (fonts, hyphenation, a11y).
    var HTML_LANG_TAGS = {
        arabic: "ar", brazilian: "pt-BR", bulgarian: "bg", czech: "cs", danish: "da",
        dutch: "nl", english: "en", finnish: "fi", french: "fr", german: "de", greek: "el",
        hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", koreana: "ko",
        latam: "es-419", norwegian: "nb", polish: "pl", portuguese: "pt-PT", romanian: "ro",
        russian: "ru", schinese: "zh-Hans", spanish: "es", swedish: "sv", tchinese: "zh-Hant",
        thai: "th", turkish: "tr", ukrainian: "uk", vietnamese: "vi"
    };

    // Maps loose / ISO / OS language tags onto our Steam locale codes so that
    // navigator.language and odd Steam spellings still resolve correctly.
    var LANGUAGE_ALIASES = {
        en: "english",
        ar: "arabic",
        bg: "bulgarian",
        zh: "schinese",
        "zh-cn": "schinese",
        "zh-hans": "schinese",
        "zh-sg": "schinese",
        chinese: "schinese",
        "zh-tw": "tchinese",
        "zh-hk": "tchinese",
        "zh-hant": "tchinese",
        cs: "czech",
        da: "danish",
        nl: "dutch",
        fi: "finnish",
        fr: "french",
        de: "german",
        el: "greek",
        hu: "hungarian",
        id: "indonesian",
        in: "indonesian",
        it: "italian",
        ja: "japanese",
        jp: "japanese",
        ko: "koreana",
        korean: "koreana",
        no: "norwegian",
        nb: "norwegian",
        nn: "norwegian",
        pl: "polish",
        pt: "portuguese",
        "pt-pt": "portuguese",
        "pt-br": "brazilian",
        ro: "romanian",
        ru: "russian",
        es: "spanish",
        "es-es": "spanish",
        "es-419": "latam",
        "es-mx": "latam",
        "es-ar": "latam",
        latin_american_spanish: "latam",
        sv: "swedish",
        th: "thai",
        tr: "turkish",
        uk: "ukrainian",
        ua: "ukrainian",
        vi: "vietnamese",
    };

    // -----------------------------------------------------------------------
    // English base catalog — the source of truth for every translatable key.
    // -----------------------------------------------------------------------
    var BASE = {
        // --- Common / shared ------------------------------------------------
        "common.play": "Play",
        "common.gallery": "Gallery",
        "common.settings": "Settings",
        "common.information": "Information",
        "common.quit": "Quit",
        "common.resume": "Resume",
        "common.main_menu": "Main Menu",
        "common.continue": "Continue",
        "common.close": "Close",
        "common.back": "Back",
        "common.cancel": "Cancel",
        "common.rename": "Rename",
        "common.done": "Done",
        "common.enabled": "Enabled",
        "common.disabled": "Disabled",
        "common.yes_please": "Yes please",
        "common.no_thanks": "No thanks",
        "common.cum": "Cum",
        "common.left": "Left",
        "common.center": "Center",
        "common.right": "Right",

        // --- Settings panel -------------------------------------------------
        "settings.title": "Settings",
        "settings.section_display": "Display",
        "settings.section_audio": "Audio",
        "settings.section_language": "Language",
        "settings.section_highest_record": "Highest Record",
        "settings.window_mode": "Window Mode",
        "settings.windowed": "Windowed",
        "settings.fullscreen": "Fullscreen",
        "settings.gamma": "Gamma",
        "settings.adjust_gamma": "Adjust Gamma",
        "settings.sfx_volume": "SFX Volume",
        "settings.ambiant_volume": "Ambiant Volume",
        "settings.click_sound": "UI Click Sound",
        "settings.section_controls": "Controls",
        "settings.mouse_sensitivity": "Mouse Sensitivity",
        "settings.language": "Language",
        "settings.best_record": "Vigil {phase} • Zone {zone}",

        // --- Gamma calibration ----------------------------------------------
        "gamma.title": "Gamma Calibration",
        "gamma.instruction":
            "Adjust until the hidden prayer text is only barely visible.",
        "gamma.message": "SEE THE PRAYER. FEAR THE SHADOW.",

        // --- Title screen ---------------------------------------------------
        "titlescreen.base_version": "Base Version",
        "titlescreen.gold_version": "Exorcism",
        "titlescreen.diamond_version": "Corruption",
        "titlescreen.steam_build": "Steam Build",
        "titlescreen.standalone_build": "Standalone Build",
        "titlescreen.edition_build": "{edition} {build}",
        "titlescreen.round_label": "Round {round}",
        "titlescreen.zone_label": "Zone {zone}",
        "titlescreen.archive_revealed": "Revealed",
        "titlescreen.archive_sealed": "Sealed",
        "titlescreen.default_edition_label": "Sanctum Watch",
        "titlescreen.tutorial": "Tutorial",

        // --- Supporter tier showcase (brand words live in VALUES only) ------
        "tiers.base_1":
            "Beta testing: Get the latest release of all 3 games (Support Hub has the next version of the game).",
        "tiers.base_2": "Access to sneak peak of all 3 games",
        "tiers.base_3": "Exclusive half moon discord channel and role",
        "tiers.gold_1": "all previous rewards",
        "tiers.gold_2":
            "Get the Gold edition of all 3 games at each (Beta) release.",
        "tiers.gold_3":
            "Get to vote for the direction of the 3 games at each update.",
        "tiers.gold_4": "Exclusive full moon discord channel and role.",
        "tiers.gold_5": "Gold Lewd Elevator: 3 more tricksters",
        "tiers.gold_6": "Gold Horny Asylum: 4 more inmate, a whole new wing",
        "tiers.gold_7": "Gold The Nun: Demon exorcism scenes",
        "tiers.diamond_1": "all previous rewards",
        "tiers.diamond_2":
            "Get the Diamond edition of all 3 games at each (Beta) release",
        "tiers.diamond_3":
            "Official Invitation to the Premium Moon Discord server (direct chat with devs, important decisions and ideas and more...)",
        "tiers.diamond_4": "Exclusive Eclipse discord channel and role.",
        "tiers.diamond_5":
            "Diamond Lewd Elevator: 6 more tricksters, an extra special room (diamond room), extra scenes, gallery unlock",
        "tiers.diamond_6":
            "Diamond Horny Asylum: 8 more inmate, two whole new wings",
        "tiers.diamond_7":
            "Diamond The Nun: Nun corruption scenes + Demon exorcism scenes",

        // --- Image alt text / accessibility labels --------------------------
        "alt.logo": "The Nun logo",
        "alt.base_version_showcase": "Base version showcase",
        "alt.gold_version_showcase": "Exorcism showcase",
        "alt.diamond_version_showcase": "Corruption showcase",
        "alt.books": "Books",
        "alt.look_back": "Look Back",
        "alt.look_front": "Look Front",
        "alt.go_forward": "Go Forward",
        "alt.gallery_preview": "Gallery preview",
        "alt.altar_scene": "Church zone transition scene",
        "alt.le_logo": "LE logo",
        "title.our_games": "OUR GAMES",
        "alt.ha_logo": "HA logo",
        "a11y.external_links": "External links",
        "a11y.open_discord": "Open Discord",
        "a11y.close_gallery": "Close gallery",
        "a11y.look_back": "Look Back",
        "a11y.look_front": "Look Front",
        "a11y.go_forward": "Go Forward",
        "a11y.struggle_target": "Struggle target",
        "a11y.struggle_hit_target": "Struggle hit target",
        "a11y.demon_presence_zone": "Demon presence zone",
        "a11y.collect_object": "Collect {type}",
        "a11y.collect_default_type": "object",
        "a11y.save_name": "Save name",

        // --- HUD counters ---------------------------------------------------
        "hud.phase": "Vigil:",
        "hud.zone": "Zone:",
        // 3D only: what the next rite at the altar costs, on the side your devotion
        // already points at (scripts/runFlow.js). English-only, like the world.* keys.
        "hud.next_rite": "Next rite:",

        // --- Altar / choose your fate ---------------------------------------
        "altar.choose_your_fate": "Choose Your Fate",
        "altar.help_the_nun": "Help the Nun",
        "altar.help_the_demon": "Help the Demon",
        "altar.surrender": "Surrender",
        "altar.demon_exorcism": "Demon Exorcism",
        "altar.nun_corruption": "Nun Corruption",
        "altar.attack_the_nun": "Attack the Nun",
        "altar.attack_the_demon": "Attack the Demon",
        "altar.duel_stage": "{target} {attack}/{attacks} — Round {current}/{total}",
        "altar.duel_cum_inside": "Cum Inside",
        "altar.duel_cum_outside": "Cum Outside",
        "altar.duel_target_nun": "Attacking the Nun",
        "altar.duel_target_demon": "Attacking the Demon",
        "altar.crosses_required": "{count} Crosses Required",
        "altar.books_required": "{count} Books Required",
        "altar.no_requirements": "No Requirements",
        "altar.gold_crosses_requirement":
            "Gold Edition - {count} Crosses - Support on Support Hub",
        "altar.diamond_books_requirement":
            "Diamond Edition - {count} Books - Support on Support Hub",
        "altar.progress": "[{current}/{total}]",
        "altar.need_crosses": "Need {required} crosses, you have {current}",
        "altar.need_books": "Need {required} books, you have {current}",

        // --- Upgrade / monetization popups ----------------------------------
        "upgrade.locked_support": "This option is locked. Support us on Support Hub!",
        "upgrade.full_scene_title": "Full Scene On Support Hub",
        "upgrade.full_scene_message":
            "This content is exclusive to Support Hub supporters, consider supporting us on Support Hub to access it!",
        "upgrade.next_version_title": "Available In The Next Version",
        "upgrade.next_version_message":
            "This content will be available in the next version.",
        "upgrade.cum_locked_title": "Cum locked",
        "upgrade.nun_corruption_locked_title": "Nun corruption locked",
        "upgrade.demon_exorcism_locked_title": "Demon exorcism locked",
        "upgrade.diamond_version_message":
            "Go upgrade your game to access the diamond version",
        "upgrade.gold_version_message":
            "Go upgrade your game to access the gold version",

        // --- Power struggle minigame ----------------------------------------
        "struggle.title": "Fight Back",
        "struggle.default_instruction":
            "Break the demon's hold before the loop devours you.",
        "struggle.sequence_instruction":
            "Hit the key sequence in order before the loop wins.",
        "struggle.zones_instruction":
            "Click every red circle once to make them disappear.",
        "struggle.meter_instruction":
            "Click the circle to the left of the bar until it fills.",

        // --- Game over / victory --------------------------------------------
        "gameover.title": "The Nun Caught You!",
        "gameover.text": "You failed to reach the altar...",
        "gameover.restart": "Restart Game",
        "gameover.quit_to_menu": "Quit To Menu",
        "victory.title": "CONGRATULATIONS!",
        "victory.text": "You have beaten The Nun!",
        "victory.subtext": "All paths completed: 5/5",
        "victory.play_again": "Play Again",

        // --- Gallery --------------------------------------------------------
        "gallery.category_attack": "Attack",
        "gallery.category_reward": "Reward",
        "gallery.category_other": "Other",
        "gallery.category_gold": "Exorcism",
        "gallery.category_diamond": "Corruption",
        "gallery.unlock": "Gallery Unlock",
        "gallery.unlocked": "Gallery Unlocked",
        "gallery.unlocked_suffix": " unlocked",
        "gallery.filter_by_girl": "Filter By Girl",
        "gallery.all_files": "All Files",
        "gallery.no_entries": "No Entries",
        "gallery.no_preview": "No Preview",
        "gallery.archive": "Archive",
        "gallery.no_preview_description":
            "No matching preview exists for the selected filter.",
        "gallery.gold_locked_title": "Exorcism Gallery Locked",
        "gallery.diamond_locked_title": "Corruption Gallery Locked",
        "gallery.gold_locked_message":
            "Go upgrade your game to access the gold gallery",
        "gallery.diamond_locked_message":
            "Go upgrade your game to access the diamond gallery",
        "gallery.unlock_message":
            "Support on Support Hub to unlock the classified placeholders in this gallery shell.",

        // Kickers (the small label above a scene title).
        "gallery.kicker_encounter_reel": "Encounter Reel",
        "gallery.kicker_encounter_snapshot": "Encounter Snapshot",
        "gallery.kicker_reward_file": "Reward File",
        "gallery.kicker_location_file": "Location File",
        "gallery.kicker_gold_attack": "Exorcism Attack",
        "gallery.kicker_gold_reward": "Exorcism Reward",
        "gallery.kicker_diamond_attack": "Corruption Attack",
        "gallery.kicker_diamond_reward": "Corruption Reward",

        // Generic scene title fallback: "<prefix> <scene code>".
        "gallery.scene_code_title": "{prefix} {code}",
        "gallery.prefix_attack": "Attack",
        "gallery.prefix_reward": "Reward",
        "gallery.prefix_other": "Other",
        "gallery.prefix_gold_attack": "Exorcism Attack",
        "gallery.prefix_gold_reward": "Exorcism Reward",
        "gallery.prefix_diamond_attack": "Corruption Attack",
        "gallery.prefix_diamond_reward": "Corruption Reward",

        // Named scene titles, derived from the scene code.
        "gallery.scene.demon_attack": "Demon Attack",
        "gallery.scene.demon_attack_outfit": "Demon Attack Outfit {outfit}",
        "gallery.scene.demon_attack_variation":
            "Demon Attack Variation {variation} Outfit {outfit}",
        "gallery.scene.nun_drag": "Nun Drag",
        "gallery.scene.nun_drag_outfit": "Nun Drag Outfit {outfit}",
        "gallery.scene.nun_drag_variation":
            "Nun Drag Variation {variation} Outfit {outfit}",
        "gallery.scene.nun_attack": "Nun Attack",
        "gallery.scene.nun_attack_outfit": "Nun Attack Outfit {outfit}",
        "gallery.scene.nun_attack_variation":
            "Nun Attack Variation {variation} Outfit {outfit}",
        "gallery.scene.demon_struggle_zone": "Demon Struggle Zone {zone}",
        "gallery.scene.demon_struggle_zone_variation":
            "Demon Struggle Zone {zone} Variation {variation}",
        "gallery.scene.surrender": "Surrender {index}",
        "gallery.scene.surrender_transition": "Surrender Transition {index}",
        "gallery.scene.surrender_cum": "Surrender Cum {index}",
        "gallery.scene.demon_help": "Demon Help {index}",
        "gallery.scene.demon_help_transition": "Demon Help Transition {index}",
        "gallery.scene.demon_help_cum": "Demon Help Cum {index}",
        "gallery.scene.nun_help": "Nun Help {index}",
        "gallery.scene.nun_help_transition": "Nun Help Transition {index}",
        "gallery.scene.nun_help_cum": "Nun Help Cum {index}",
        "gallery.scene.attack_the_nun": "Attack the Nun {index}",
        "gallery.scene.attack_the_nun_cum_inside": "Attack the Nun {index} Cum Inside",
        "gallery.scene.attack_the_nun_cum_outside": "Attack the Nun {index} Cum Outside",
        "gallery.scene.attack_the_nun_struggle": "Attack the Nun {index} Struggle",
        "gallery.scene.attack_the_nun_intro": "Attack the Nun Intro {variation}",
        "gallery.scene.attack_the_nun_intro_outfit": "Attack the Nun Intro {variation} Outfit {outfit}",
        "gallery.scene.attack_the_demon": "Attack the Demon {index}",
        "gallery.scene.attack_the_demon_cum_inside": "Attack the Demon {index} Cum Inside",
        "gallery.scene.attack_the_demon_cum_outside": "Attack the Demon {index} Cum Outside",
        "gallery.scene.attack_the_demon_struggle": "Attack the Demon {index} Struggle",
        "gallery.scene.attack_the_demon_intro": "Attack the Demon Intro {variation}",
        "gallery.scene.attack_the_demon_intro_outfit": "Attack the Demon Intro {variation} Outfit {outfit}",
        "gallery.scene.demon_exorcism": "Demon Exorcism {index}",
        "gallery.scene.demon_exorcism_transition":
            "Demon Exorcism Transition {index}",
        "gallery.scene.demon_exorcism_cum": "Demon Exorcism Cum {index}",
        "gallery.scene.nun_corruption": "Nun Corruption {index}",
        "gallery.scene.nun_corruption_transition":
            "Nun Corruption Transition {index}",
        "gallery.scene.nun_corruption_cum": "Nun Corruption Cum {index}",
        "gallery.scene.intro_nun_phase": "Intro Nun Phase {phase}",
        "gallery.scene.nun_look_back": "Nun Look Back",
        "gallery.scene.nun_look_back_indexed": "Nun Look Back {index}",
        "gallery.scene.girls_arrival": "Girls arrival",
        "gallery.scene.girls_arrival_indexed": "Girls arrival {index}",

        // Placeholder archive entries used when asset discovery is unavailable.
        "gallery.fallback.nun_approach_title": "Approach Litany",
        "gallery.fallback.nun_approach_description":
            "The Nun advances whenever the chapel is left unchecked. This clip mirrors the forward pressure of a live run.",
        "gallery.fallback.demon_hall_rush_title": "Hall Rush",
        "gallery.fallback.demon_hall_rush_description":
            "A corridor attack placeholder used to stage demon pressure and route recall.",
        "gallery.fallback.power_struggle_title": "Power Struggle",
        "gallery.fallback.power_struggle_description":
            "The struggle screen stands in for the close-range punish state when the player fails to repel an assault.",
        "gallery.fallback.cross_route_title": "Cross Route",
        "gallery.fallback.cross_route_description":
            "Crosses feed the Nun-aligned altar path. This file tracks the devotional route through the run.",
        "gallery.fallback.book_route_title": "Book Route",
        "gallery.fallback.book_route_description":
            "Forbidden books push the Demon-aligned altar route. The archive keeps them separate for path study.",
        "gallery.fallback.altar_oath_title": "Altar Oath",
        "gallery.fallback.altar_oath_description":
            "The altar scene is where the run resolves. This capture marks the final negotiation point of each route.",
        "gallery.fallback.chapel_feed_title": "Chapel Feed",
        "gallery.fallback.chapel_feed_description":
            "General environment reference for the chapel shell and its current lighting setup.",
        "gallery.fallback.corridor_feed_title": "Corridor Feed",
        "gallery.fallback.corridor_feed_description":
            "A looping corridor plate used by the current prototype to stage movement pressure and collectible routing.",
        "gallery.fallback.nun_feed_title": "Nun Feed",
        "gallery.fallback.nun_feed_description":
            "The standing Nun overlay is archived separately to review her silhouette and reveal timing.",

        // --- Save file management -------------------------------------------
        "save.choose_a_save": "Choose a Save",
        "save.save_found": "Save Found",
        "save.choose_message":
            "Select a compatible save to load, or start a new game and create a fresh save file.",
        "save.found_message":
            "A compatible save was found. You can load it or start a new game with a fresh save file.",
        "save.incompatible_title": "Incompatible Saves Found",
        "save.incompatible_message":
            "Save files from another edition were found, but they are not compatible with this version. Start a new game to create a fresh save file.",
        "save.other_files_note":
            "{count} other save file(s) were found for a different version and cannot be loaded here.",
        "save.open_saves_folder": "Open Saves Folder",
        "save.start_new_game": "Start New Game",
        "save.load_selected": "Load Selected Save",
        "save.save_name": "Save Name",
        "save.entry_meta": "{timestamp} | {version}",
        "save.unknown_version": "Unknown version",
        "save.version_label": "{edition} Version",
        "save.error_list": "Failed to list save files.",
        "save.error_write": "Failed to write save file.",
        "save.error_read": "Failed to read save file.",
        "save.error_rename": "Failed to rename save file.",
        "save.error_open_folder": "Failed to open the saves folder.",
        "save.error_create": "Failed to create a new save file.",
        "save.error_load_selected": "Failed to load the selected save file.",
        "save.error_incompatible":
            "This save is not compatible with the current version.",
        "save.error_empty_name": "Save name cannot be empty.",
        "save.error_cloud_rejected": "Steam Cloud rejected the save write.",
        "save.error_no_compatible": "No compatible saves are available.",
        "save.error_folder_unavailable":
            "Opening the saves folder is not available in this build.",

        // --- Tutorial popup (first play) ------------------------------------
        "tutorial.title": "FIRST TIME PLAYING THE NUN?",
        "tutorial.subtitle": "Here's a quick tutorial:",
        "tutorial.intro":
            "Your objective is to gain as many crucifixes and holy books as possible, in order to save yourself from the Nun or the Demon's punishments. Gathering these will be a challenge, as you are being actively chased by the Nun, and the demon sometimes attacks you.",
        "tutorial.gathering_title": "GATHERING ITEMS",
        "tutorial.gathering_1":
            "Hold click the yellow circles. Those are the light levels, allowing you to see the books and crucifixes better.",
        "tutorial.gathering_2":
            "Click on the books and crucifixes to collect them. Some are harder to see than others.",
        "tutorial.avoiding_title": "AVOIDING ATTACKS",
        "tutorial.avoiding_1":
            "Click on the demon before she slides into your screen. She may also run at you from the front of the chapel, and if she reaches you, you will be prompted with a time-based minigame.",
        "tutorial.avoiding_2":
            'Don\'t let the nun get to you by reaching the end of the chapel before she reaches you. To see where she is at, click the "Turn around" arrow at the bottom of your screen, or "S" on your keyboard.',
        "tutorial.fate_title": "CHOOSING YOUR FATE",
        "tutorial.fate_text":
            "Choosing your fate will depend on what you have or don't have in your inventory. If you don't have enough items for any option, you must surrender, ending your run. Otherwise, you will be sent to the next phase.",

        // --- How to play (title Tutorial button, no-WebGL fallback) ---------
        "howto.title": "HOW TO SURVIVE THE NUN",
        "howto.goal_title": "YOUR GOAL",
        "howto.goal_text":
            "Cross six places of the cursed abbey, one per vigil, and reach the altar at the end of each. What you collect and which rites you buy decide which of three endings you get.",
        "howto.light_title": "CONTROLS",
        "howto.light_text":
            "WASD or arrows to walk, mouse to look, Shift to run, Space to jump or climb onto a ledge. Tap Ctrl to crouch or stand back up, hold Ctrl to lie down and tap it again to get up (Ctrl while running: slide); lying down, you can crawl under a low table for the relic hidden beneath it. Hold left click or E on a candle stand to light it: it slows the Nun nearby and shows the relics around it, then burns down and goes out, sooner every vigil (light it again the same way). To take a relic, walk up close, look at it, then left click or E.",
        "howto.survive_title": "SURVIVE",
        "howto.survive_text":
            "The Nun walks from the entrance to the altar, and her aura is a wall across the whole cathedral: you cannot get past it, and if it catches you, she takes you. Gather what you can and reach the altar before she does. The bar at the bottom shows how close her wall is. The Demoness crawls out of dark corners, never while you stand in a lit candle's light: when she comes, get into one and stay in its light for 1 second to banish her. Step out before that and you start again.",
        "howto.altar_title": "THE ALTAR",
        "howto.altar_text":
            "Crosses serve the Nun, books serve the Demon. At each altar, spend them on one rite. If you are caught or surrender, you can continue the vigil and keep all your relics.",

        // --- Interactive tutorial (scripts/tutorial.js; English only) --------
        "tutorial.prompt_kicker": "Your first vigil",
        "tutorial.prompt_title": "Play the tutorial?",
        "tutorial.prompt_text": "A short guided vigil: the controls, the Nun, the Demoness and the altar. Nothing in it counts.",
        "tutorial.prompt_yes": "Play the tutorial",
        "tutorial.prompt_recommended": "Recommended",
        "tutorial.prompt_no": "Skip, play now",
        "tutorial.replay_kicker": "How to play",
        "tutorial.replay_text": "Replay the guided tutorial vigil. Your saved run, endings and records are not touched.",
        "tutorial.label": "Tutorial",
        "tutorial.continue": "Continue",
        "tutorial.skip": "Skip tutorial",
        "tutorial.skip_step": "Skip this step",
        "tutorial.objective": "Objective",
        "tutorial.skip_title": "Skip the tutorial?",
        "tutorial.skip_text": "You can replay it any time from Tutorial on the title screen.",
        "tutorial.skip_yes": "Skip",
        "tutorial.skip_no": "Keep learning",
        "tutorial.paused": "Tutorial paused",
        "tutorial.resume": "Resume",
        "tutorial.welcome_title": "Welcome to the vigil",
        "tutorial.welcome_text": "Six vigils, one night. Gather relics in the dark, then reach the altar before the Nun does. This is a practice vigil: nothing here counts.",
        "tutorial.jane_title": "Jane, the Nun",
        "tutorial.jane_text": "She walks down the nave to the altar and never stops. If she gets there first, the vigil is lost.",
        "tutorial.wall_title": "Her aura is a wall",
        "tutorial.wall_text": "The crimson veil behind her spans the whole nave and only moves forward. It pushes you. Held against it, or touching her, for half a second: caught.",
        "tutorial.gap_title": "The gap",
        "tutorial.gap_text": "This bar shows how close her wall is, and the notch on it is your point of no return: past it she reaches the altar before you can. Here she waits for you; in a real vigil she walks from the first second.",
        "tutorial.move_title": "Walk",
        "tutorial.move_text": "W A S D to walk.",
        "tutorial.move_goal": "Walk a few steps",
        "tutorial.look_title": "Look around",
        "tutorial.look_text": "Move the mouse to look. It is dark: look everywhere.",
        "tutorial.look_goal": "Look left and right",
        "tutorial.sensitivity_title": "Mouse sensitivity",
        "tutorial.sensitivity_text": "Flick your view from one mark to the other. Too slow or too fast? Scroll the mouse wheel, or tap the keys below, until it feels right.",
        "tutorial.sensitivity_goal": "Flick between the marks {count}/{total}",
        "tutorial.sensitivity_meter": "Sensitivity",
        "tutorial.sensitivity_default": "Default",
        "tutorial.sensitivity_slower": "slower",
        "tutorial.sensitivity_faster": "faster",
        "tutorial.sensitivity_saved": "Saved as you go. Change it any time in Settings, under Controls.",
        "tutorial.sensitivity_ok": "Sounds good",
        "tutorial.key_wheel": "Wheel",
        "tutorial.run_title": "Run",
        "tutorial.run_text": "Hold Shift while walking to run.",
        "tutorial.run_goal": "Run for a moment",
        "tutorial.gauges_title": "Breath",
        "tutorial.gauges_text": "Breath is spent running, jumping and climbing, and comes back when you slow down.",
        "tutorial.jump_title": "Jump",
        "tutorial.jump_text": "Space to jump. Jump at a low obstacle to vault it, at a ledge to climb it.",
        "tutorial.jump_goal": "Jump",
        "tutorial.climb_title": "Climb to the reliquary",
        "tutorial.climb_text": "A gilded reliquary sits up high, worth 3 relics. Run at what it rests on, jump to grab the ledge, then take it with E or left click.",
        "tutorial.climb_goal": "Take the reliquary",
        "tutorial.rush_title": "Rush",
        "tutorial.rush_text": "Every vault, climb or jump out of a slide gives a Rush: a burst of speed that costs no Breath. The Breath bar turns gold.",
        "tutorial.crouch_title": "Crouch",
        "tutorial.crouch_text": "Tap Ctrl to crouch, tap again to stand. Ctrl while running: slide.",
        "tutorial.crouch_goal": "Crouch",
        "tutorial.prone_title": "Lie down",
        "tutorial.prone_text": "Some relics hide under low tables. Hold Ctrl to lie down, crawl under and take it. Tap Ctrl to get up.",
        "tutorial.prone_goal": "Take the relic under the table",
        "tutorial.counters_title": "Your relics",
        "tutorial.counters_text": "Vigil, crosses, books, and what the next rite at the altar will cost you.",
        "tutorial.cross_title": "Take a cross",
        "tutorial.cross_text": "Crosses serve the Nun. Walk up close, look at it, press E or left click.",
        "tutorial.cross_goal": "Take a cross",
        "tutorial.book_title": "Take a book",
        "tutorial.book_text": "Books serve the Demon.",
        "tutorial.book_goal": "Take a book",
        "tutorial.devotion_title": "Your path",
        "tutorial.devotion_text": "Every cross pulls you toward the Nun, every book toward the Demon, and so do the rites you buy. At the last vigil this decides your ending.",
        "tutorial.candle_title": "Light a candle stand",
        "tutorial.candle_text": "Look at a candle stand and hold E or left click until it lights.",
        "tutorial.candle_goal": "Light the candle stand",
        "tutorial.light_title": "Candlelight",
        "tutorial.light_text": "A lit stand slows the Nun a little in its light, and it is your only refuge from the Demoness. It burns down: its light shrinks, then goes out, sooner every vigil. Hold E on it to light it again.",
        "tutorial.leave_title": "Step into the dark",
        "tutorial.leave_text": "Walk out of the candle's light.",
        "tutorial.leave_goal": "Leave the light",
        "tutorial.demon_title": "The Demoness",
        "tutorial.demon_text": "She only comes while you stand outside every lit candle. When you see HIDE IN LIGHT, run to a lit stand.",
        "tutorial.hide_title": "Hide in the light",
        "tutorial.hide_text": "Stand in the candle's light for one second to banish her. If she reaches you, you fight a power struggle.",
        "tutorial.hide_goal": "Banish the Demoness",
        "tutorial.hide_retry": "She reached you. In a real vigil: a power struggle. Try again.",
        "tutorial.caught_title": "If you are caught",
        "tutorial.caught_text": "The vigil ends. Continue it with every relic you had, or abandon the run. Esc pauses the game at any time.",
        "tutorial.caught_retry": "Caught. In a real vigil, this ends it. Keep ahead of her wall.",
        "tutorial.race_title": "Race to the altar",
        "tutorial.race_text": "Jane is walking now. Reach the altar before her.",
        "tutorial.race_goal": "Reach the altar",
        "tutorial.routes_title": "Rites",
        "tutorial.routes_text": "At the altar you spend relics on one rite. Help the Nun costs crosses, Help the Demon costs books; each shows its price and next scene. A finished rite can be bought again to relive its last scene.",
        "tutorial.premium_title": "Exorcism and Corruption",
        "tutorial.premium_text": "The Gold and Diamond rites: dearer, and they pull your path hard.",
        "tutorial.attack_title": "Attack",
        "tutorial.attack_text": "Pay to fight her: three power struggles on one timer. Win and it counts as a rite. Lose and the vigil ends.",
        "tutorial.surrender_title": "Surrender",
        "tutorial.surrender_text": "Free, but it ends the vigil. You can continue it with your relics.",
        "tutorial.path_title": "Where you are heading",
        "tutorial.path_text": "Your path so far, and how many vigils are left.",
        "tutorial.final_title": "The final rite",
        "tutorial.final_text": "Vigil 6's altar decides the night: Exorcism at +25 devotion or more, Corruption at -25 or less, otherwise Limbo.",
        "tutorial.finish_title": "You are ready",
        "tutorial.finish_text": "Gather, climb, hide in the light, and beat her to the altar. Every vigil hides a key: it opens the locked door by the altar. Your first vigil starts now.",
        "tutorial.finish_play": "Start your first vigil",
        "tutorial.key_mouse": "Mouse",
        "tutorial.key_hold": "hold",

        // --- 3D world -------------------------------------------------------
        "level.toast": "{numeral} · {name}",
        // The six vigils are one night in the same cathedral: the canonical hours,
        // from evening to the rite that ends it.
        "level.name_1": "Vespers",
        "level.name_2": "Compline",
        "level.name_3": "Matins",
        "level.name_4": "Lauds",
        "level.name_5": "Prime",
        "level.name_6": "The Last Rite",
        "world.click_to_play": "Click to play",
        "world.stamina": "Breath",
        "world.hint_cross": "Click / E · take the cross",
        "world.hint_book": "Click / E · take the book",
        "world.hint_candle": "Hold click / E · light the candles",
        "world.hide_in_light": "Hide In Light",
        "world.hint_demon_hold": "Stay in the light",
        "world.demon_light_it": "Light it",
        "world.hint_reliquary_cross": "Click / E · take the reliquary (+{count} crosses)",
        "world.hint_reliquary_book": "Click / E · take the reliquary (+{count} books)",
        "world.hint_climb": "Out of reach · run at it and jump (Space) to climb up",
        "world.hint_lie_down": "Under the table · hold Ctrl to lie down and reach it",
        "world.hint_no_room": "No room to stand up here",
        // The side door by the altar and its key (scripts/world3d/door.js), Shaun's words
        "world.hint_key": "Click / E · take the key",
        "world.hint_door_locked": "This door is locked",
        "world.hint_door_open": "Press E to open",
        "coach3d.move":
            "WASD to walk, the mouse to look, Shift to run, Space to jump or climb. Tap Ctrl to crouch or stand up, hold Ctrl to lie down (Ctrl while running slides); lie down to crawl under a table for the relic hidden beneath it. Every vault, climb or jump out of a slide gives a Rush: faster running that costs no Breath. Find the altar at the far end.",
        "coach3d.light":
            "Hold click on a candle stand to light it: it shows the relics around it until it burns down and goes out. Hold click on it again to relight it.",
        "coach3d.collect":
            "Relics lie all over the cathedral, hard to see without candlelight. Walk right up to one, look at it and click: crosses serve the Nun, books serve the Demon. A glint up high is a gilded reliquary, worth 3: run at what it rests on and jump to climb up and take it.",
        "coach3d.attack": "The Demoness! Get into a lit candle's light and stay there for 1 second to banish her.",
        "coach3d.nun":
            "The Nun is walking to the altar. Her aura is a wall you cannot pass: stay ahead of it and reach the altar first. Candlelight slows her.",

        // --- Run flow: title screen, confirmations --------------------------
        "run.continue_button": "Continue — Vigil {phase}",
        "run.endings_line": "Endings discovered: {count}/3",
        "run.new_confirm_title": "Start a new vigil?",
        "run.new_confirm_text":
            "Your current run (Vigil {phase}) will be lost.",
        "run.new_confirm_yes": "Start over",

        // --- Vigil title cards and zone names ------------------------------
        "phase.vigil_label": "VIGIL {numeral}",
        "phase.title_1": "The First Vigil",
        "phase.line_1": "You came to bless this chapel. It was already awake.",
        "phase.title_2": "The Habit Loosens",
        "phase.line_2": "Every relic you lift, she feels it leave her.",
        "phase.title_3": "The Veil Falls",
        "phase.line_3": "The Demoness has learned your name.",
        "phase.title_4": "The Flesh Answers",
        "phase.line_4": "Nothing in this nave is holy anymore.",
        "phase.title_5": "Matins of the Pit",
        "phase.line_5": "The altar is listening. It knows what you want.",
        "phase.title_6": "The Final Rite",
        "phase.line_6": "Tonight it ends: saved, damned, or neither.",
        "zone.toast": "{numeral} · {name}",
        "zone.name_1": "The Narthex",
        "zone.name_2": "The Nave",
        "zone.name_3": "The Crossing",
        "zone.name_4": "The Choir",
        "zone.name_5": "The Sanctuary",

        // --- HUD meters and coaching ----------------------------------------
        "meter.far": "She walks behind you",
        "meter.near": "She is getting close",
        "meter.here": "She is right behind you",
        // 3D only: past the point of no return marked on the meter.
        "meter.run_altar": "Run for the altar",
        "devotion.path": "Your path: {path}",
        "coach.light":
            "It's too dark to see. Hold a candle flame to light the chapel.",
        "coach.collect":
            "Click the crosses and books hidden in the dark. Crosses serve the Nun, books serve the Demon.",
        "coach.attack": "The Demoness is coming! Click her before she reaches you.",
        "coach.nun":
            "The bar below is the Nun walking up behind you. Move forward before it fills. (S: look back)",

        // --- Altar: prices, relive, previews, path --------------------------
        "altar.scene_counter": "Scene {current}/{total}",
        "altar.replay_label": "Relive the last scene",
        "altar.replay_crosses": "Relive for {count} Crosses",
        "altar.replay_books": "Relive for {count} Books",
        "altar.more_crosses": "{required} Crosses · {count} more needed",
        "altar.more_books": "{required} Books · {count} more needed",
        "altar.preview_next": "Scene {index}",
        "altar.preview_replay": "Scene {index} · seen",
        "altar.path_line":
            "Vigil {vigil} of {final} · Your path: {path}",
        "altar.path_line_final": "The last altar. How does this night end?",

        // --- The final rite and the endings ---------------------------------
        "final.title": "The Final Rite",
        "final.subtitle": "Your devotion: {devotion}. Choose how this night ends.",
        "final.ending_open": "Your devotion has earned this ending",
        "final.limbo_open": "Walk away, neither saved nor damned",
        "final.exorcism_sealed": "Sealed · needs devotion of +{count} or more",
        "final.corruption_sealed": "Sealed · needs devotion of -{count} or less",
        "final.seen_before": "Seen before",
        "ending.exorcism.name": "The Exorcism",
        "ending.corruption.name": "The Corruption",
        "ending.limbo.name": "Limbo",
        "ending.exorcism.text":
            "The rite holds. The Demoness is cast back into the dark, and the Nun kneels before you, free and very grateful.",
        "ending.corruption.text":
            "You gave the Demoness everything she asked for. The Nun belongs to her now, and so do you.",
        "ending.limbo.text":
            "Neither saved nor damned, you walk out of the chapel at dawn. It will be waiting for you.",
        "ending.kicker": "Ending",
        "ending.kicker_new": "New ending",
        "ending.discovered": "Endings discovered: {count}/3",
        "ending.still_hidden": "{count} more to find. A different devotion leads elsewhere.",
        "ending.all_found": "You have found every ending.",
        "ending.new_run": "Begin a new vigil",

        // --- End-of-run screen ----------------------------------------------
        "reckoning.kicker": "Vigil {phase} · Zone {zone}",
        "reckoning.caught_title": "She Caught You",
        "reckoning.caught_text": "The Nun dragged you back into the dark. The night is not over.",
        "reckoning.duel_demon_text": "The Demoness overpowered you at the altar. The night is not over.",
        "reckoning.surrender_title": "You Surrendered",
        "reckoning.surrender_text": "You knelt with empty hands. The chapel lets you try again.",
        "reckoning.path":
            "Your path leads to {path}. {count} more vigils to the final rite.",
        "reckoning.path_final": "Your path leads to {path}. The final rite is this vigil.",
        "reckoning.relics": "Relics gathered: {count}",
        "reckoning.attacks": "Demon attacks repelled: {repelled} · suffered: {lost}",
        "reckoning.rites": "Rites completed: {count}",
        "reckoning.best": "Best: Vigil {phase} · Zone {zone}",
        "reckoning.continue": "Continue — Vigil {phase}",
        "reckoning.continue_note": "Keep all your relics · Crosses {crosses} · Books {books}",
        "reckoning.abandon": "Abandon the run",
    };

    // -----------------------------------------------------------------------
    // Engine state
    // -----------------------------------------------------------------------
    var locales = { english: BASE };
    var currentLanguage = "english";
    var currentDict = BASE;

    window.I18N_BASE = BASE;
    window.I18N_LOCALES = locales;
    window.I18N_SUPPORTED = SUPPORTED_LANGUAGES;

    function isSupported(code) {
        for (var i = 0; i < SUPPORTED_LANGUAGES.length; i += 1) {
            if (SUPPORTED_LANGUAGES[i].code === code) {
                return true;
            }
        }
        return false;
    }

    function normalizeLanguageCode(code) {
        if (!code) {
            return null;
        }
        var raw = String(code).trim().toLowerCase();
        if (!raw) {
            return null;
        }
        if (isSupported(raw)) {
            return raw;
        }
        if (LANGUAGE_ALIASES[raw]) {
            return LANGUAGE_ALIASES[raw];
        }
        // Try the primary subtag, e.g. "fr-CA" -> "fr".
        var primary = raw.split(/[-_]/)[0];
        if (isSupported(primary)) {
            return primary;
        }
        if (LANGUAGE_ALIASES[primary]) {
            return LANGUAGE_ALIASES[primary];
        }
        return null;
    }
    window.normalizeLanguageCode = normalizeLanguageCode;

    window.getSupportedLanguages = function () {
        return SUPPORTED_LANGUAGES.slice();
    };

    window.getCurrentLanguage = function () {
        return currentLanguage;
    };

    window.isLanguageRtl = function (code) {
        return Boolean(RTL_CODES[normalizeLanguageCode(code) || ""]);
    };

    // Register a locale dictionary (parsed from code/locales/<code>.json).
    window.registerLocale = function (code, dict) {
        var normalized = normalizeLanguageCode(code) || code;
        locales[normalized] = dict || {};
        if (normalized === currentLanguage) {
            currentDict = locales[normalized];
            window.applyTranslations();
            if (typeof window.refreshDynamicTranslations === "function") {
                window.refreshDynamicTranslations();
            }
        }
    };

    // Translate a key, with optional {placeholder} interpolation. Always returns
    // a string: current locale -> English -> the key itself.
    window.t = function (key, vars) {
        var value =
            currentDict && currentDict[key] != null
                ? currentDict[key]
                : BASE[key] != null
                  ? BASE[key]
                  : key;
        if (vars) {
            value = String(value).replace(/\{(\w+)\}/g, function (match, name) {
                return vars[name] != null ? vars[name] : match;
            });
        }
        return value;
    };

    function applyToElement(el) {
        var key = el.getAttribute("data-i18n");
        if (key) {
            el.textContent = window.t(key);
        }
        var htmlKey = el.getAttribute("data-i18n-html");
        if (htmlKey) {
            el.innerHTML = window.t(htmlKey);
        }
        var attrSpec = el.getAttribute("data-i18n-attr");
        if (attrSpec) {
            attrSpec.split(";").forEach(function (pair) {
                var parts = pair.split(":");
                var attr = (parts[0] || "").trim();
                var attrKey = (parts[1] || "").trim();
                if (attr && attrKey) {
                    el.setAttribute(attr, window.t(attrKey));
                }
            });
        }
    }

    window.applyTranslations = function (root) {
        var scope = root || document;
        if (!scope || typeof scope.querySelectorAll !== "function") {
            return;
        }
        var nodes = scope.querySelectorAll(
            "[data-i18n],[data-i18n-html],[data-i18n-attr]",
        );
        for (var i = 0; i < nodes.length; i += 1) {
            applyToElement(nodes[i]);
        }
    };

    // Lazily load code/locales/<code>.json the first time a non-English locale
    // is requested, then register it. Resolves regardless of success (English is
    // the fallback). In-flight loads are de-duplicated; failures are not cached
    // so a later request can retry.
    var localeLoads = {};

    function readLocaleText(code) {
        var url = "code/locales/" + code + ".json";
        // Electron loads the app over file://, where fetch() cannot read local
        // files. Prefer the preload IPC bridge; fall back to fetch for web/http.
        if (
            typeof window !== "undefined" &&
            window.electronAPI &&
            typeof window.electronAPI.loadLocale === "function"
        ) {
            return Promise.resolve(window.electronAPI.loadLocale(code));
        }
        if (typeof fetch === "function") {
            return fetch(url, { cache: "no-store" }).then(function (res) {
                return res && res.ok ? res.text() : null;
            });
        }
        return Promise.resolve(null);
    }

    function ensureLocaleLoaded(code) {
        if (code === "english" || locales[code]) {
            return Promise.resolve(true);
        }
        if (localeLoads[code]) {
            return localeLoads[code];
        }
        var promise = readLocaleText(code)
            .then(function (text) {
                if (text == null) {
                    return false;
                }
                var dict = JSON.parse(text);
                window.registerLocale(code, dict);
                return true;
            })
            .catch(function () {
                return false;
            })
            .then(function (loaded) {
                if (!loaded) {
                    delete localeLoads[code]; // allow a future retry
                }
                return loaded;
            });
        localeLoads[code] = promise;
        return promise;
    }

    // Apply a language: load it, swap the active dictionary, update <html lang/dir>,
    // re-render static + dynamic UI, and optionally remember/persist it as the
    // player's manual preference.
    window.setLanguage = async function (code, options) {
        var opts = options || {};
        var normalized = normalizeLanguageCode(code) || "english";
        await ensureLocaleLoaded(normalized);

        currentLanguage = normalized;
        currentDict = locales[normalized] || BASE;

        var dir = RTL_CODES[normalized] ? "rtl" : "ltr";
        if (document.documentElement) {
            document.documentElement.setAttribute("lang", HTML_LANG_TAGS[normalized] || normalized);
            document.documentElement.setAttribute("dir", dir);
        }

        if (window.gameSettings && opts.rememberPreference !== false) {
            window.gameSettings.language = normalized;
        }

        window.applyTranslations();
        if (typeof window.refreshDynamicTranslations === "function") {
            window.refreshDynamicTranslations();
        }

        if (
            opts.persist !== false &&
            window.settingsLoaded &&
            typeof window.saveSettings === "function"
        ) {
            window.saveSettings();
        }

        try {
            document.dispatchEvent(
                new CustomEvent("languagechanged", {
                    detail: { language: normalized },
                }),
            );
        } catch (error) {
            // CustomEvent unavailable — non-fatal.
        }

        return normalized;
    };

    // DELIBERATELY UNUSED SINCE 2026-07-27. detectSteamLanguage(),
    // detectBrowserLanguage() and isSteamEditionActive() are kept because they
    // are correct and cheap to re-wire, but resolveStartupLanguage() no longer
    // calls any of them: the game boots in English unless the SAVE says
    // otherwise. Do not re-attach them to startup without Shaun asking.

    // Ask the Steam main process which language the player picked for the game.
    async function detectSteamLanguage() {
        try {
            if (
                window.electronAPI &&
                typeof window.electronAPI.steamGetLanguage === "function"
            ) {
                var lang = await window.electronAPI.steamGetLanguage();
                return normalizeLanguageCode(lang);
            }
        } catch (error) {
            // ignore — fall through to other detection
        }
        return null;
    }

    function detectBrowserLanguage() {
        try {
            var candidates = [];
            if (navigator.languages && navigator.languages.length) {
                candidates = candidates.concat(navigator.languages);
            }
            if (navigator.language) {
                candidates.push(navigator.language);
            }
            for (var i = 0; i < candidates.length; i += 1) {
                var resolved = normalizeLanguageCode(candidates[i]);
                if (resolved) {
                    return resolved;
                }
            }
        } catch (error) {
            // ignore
        }
        return null;
    }

    function isSteamEditionActive() {
        try {
            if (typeof window.isSteamBuild === "function") {
                return Boolean(window.isSteamBuild());
            }

            var buildConfig =
                typeof window.getTheNunBuildConfig === "function"
                    ? window.getTheNunBuildConfig()
                    : null;
            return Boolean(buildConfig && buildConfig.buildMode === "steam");
        } catch (error) {
            return false;
        }
    }

    // Resolve the language to use at startup. Called once after settings load.
    //   1. A saved manual choice wins — the player picked it in Settings and it
    //      lives in the save (gameSettings.language).
    //   2. Otherwise the game boots in ENGLISH.
    // No Steam auto-detect and no OS sniffing here, by design: a first boot is
    // English for everyone, everywhere, and the language only ever changes
    // because the player changed it. Keep `rememberPreference: false` on the
    // English default so "never chosen" stays null in the save instead of being
    // silently recorded as an explicit choice of English.
    window.resolveStartupLanguage = async function () {
        var saved =
            window.gameSettings && window.gameSettings.language
                ? normalizeLanguageCode(window.gameSettings.language)
                : null;

        if (saved) {
            await window.setLanguage(saved, {
                persist: false,
                rememberPreference: true,
            });
            return saved;
        }

        await window.setLanguage("english", {
            persist: false,
            rememberPreference: false,
        });
        return "english";
    };

    // Translate any static markup already present as soon as the DOM is ready.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            window.applyTranslations();
        });
    } else {
        window.applyTranslations();
    }
})();
