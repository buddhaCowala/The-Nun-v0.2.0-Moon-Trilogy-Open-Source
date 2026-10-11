/**
 * Steam Achievements — The Nun
 * ============================
 *
 * Centralized, data-driven achievement system for the Steam edition. Mirrors the
 * GW_Lewd-Elevator achievements harness; only the progress snapshot + the definition
 * list + the evaluation triggers are game-specific.
 *
 * HOW TO ADD / ENABLE A NEW ACHIEVEMENT
 * -------------------------------------
 *   1. On the Steamworks partner site, open this app (App ID 4993040) →
 *      "Stats & Achievements" → "Achievements" and create a new achievement.
 *      Copy its exact "API Name" (e.g. ACH_FIRST_ROUND).
 *   2. Add an entry to ACHIEVEMENT_DEFINITIONS below using that exact apiName.
 *   3. Give it a `condition(snapshot)` that returns true once it should unlock,
 *      OR unlock it manually from anywhere in the game with:
 *          window.unlockAchievement('ACH_API_NAME');
 *
 * The `apiName` MUST match the Steamworks "API Name" character-for-character. Until
 * the achievement exists on Steamworks the unlock is a safe no-op, and in non-Steam
 * builds the IPC calls return false — so this file is harmless in every edition.
 *
 * Game facts used by the default conditions (verified against the live code):
 *   - Run state lives on window.gameState (alias of window.state) and is NULL until a
 *     run starts, and is RESET on load (gameplay progress is not persisted to the save
 *     file). So milestone conditions are evaluated LIVE during a run:
 *       .currentRound (the vigil, 1..6), .runStats.relics (every book/cross unit taken
 *       this run — a reliquary counts its full value), .devotion.
 *   - Lifetime progress (persisted, scripts/settings.js): window.getTheNunProgress() ->
 *       { endingsSeen: { exorcism, corruption, limbo }, routeBest, runsStarted, ... }.
 *   - Gallery (persisted): window.getTheNunGallerySaveData() ->
 *       { archiveUnlocked, seenScenes: { byKey: {} } }.
 *   - Edition: window.getActiveEditionKey() -> 'base' | 'gold' | 'diamond'.
 *   - We re-evaluate after window.updateCounters() (fires on every gameplay change),
 *     after window.requestTheNunSaveWrite() (gallery/settings) and after
 *     window.completeTheNunEnding() / window.updateTheNunProgress() (the endings).
 *
 * WHERE THE 3D HOOKS LIVE (achievements with no `condition`, unlocked from the event)
 *   - ACH_RELIC_HUNTER  scripts/world3d/world.js  takeRelic()      (corridor prize)
 *   - ACH_THORNS        scripts/world3d/world.js  takeRelic()      (spike-room reward)
 *   - ACH_UNBROKEN      scripts/world3d/world.js  checkAltar()     (no candle lit)
 *   - ACH_THE_ALTAR     scripts/uiController.js   renderFinalRitePanel()
 *   - ACH_MOMENTUM      scripts/world3d/parkour.js startRush()     (Rush chain)
 *   - ACH_APPARITION    scripts/world3d/apparition.js update()     (she vanishes)
 *
 * NOTHING IS EARNED in the tutorial sandbox (window.isTheNunTutorialActive()) or once a
 * dev-tools action has been used this session (window.markTheNunDevAction(), called from
 * code/dev-actions.js). Both are enforced in canEarn(), which gates BOTH the condition
 * pass and every direct window.unlockAchievement() call, so a hook cannot bypass it.
 */
(function () {
    "use strict";

    // ---------------------------------------------------------------------------
    // Achievement registry. Edit this list to match the achievements you create on
    // Steamworks. `apiName` is the ONLY field Steam cares about; title/description
    // are local metadata for logging/clarity.
    // ---------------------------------------------------------------------------
    var ACHIEVEMENT_DEFINITIONS = [
        {
            // Bank the first vigil at the altar (the run moves on to vigil 2).
            apiName: "ACH_FIRST_ROUND",
            title: "First Vigil",
            description: "Survive the first vigil and reach the altar.",
            condition: function (s) {
                return s.round >= 2;
            },
        },
        {
            // Every book/cross unit taken in the current run (a reliquary counts its
            // full value, gameState.js collectCross/collectBook -> runStats.relics).
            // A night is worth ~70 to a player who routes, so this lands mid-run.
            apiName: "ACH_ARCHIVIST",
            title: "Archivist",
            description: "Gather 40 relics in a single night.",
            condition: function (s) {
                return s.relicsThisRun >= 40;
            },
        },
        {
            // The dead end of the corridor behind the locked side door (corridor.js
            // PRIZE, worth 6): the key, the door, then 54 blind metres and back before
            // Jane's wall sweeps the hall. Unlocked from world.js takeRelic().
            apiName: "ACH_RELIC_HUNTER",
            title: "Relic Hunter",
            description: "Claim the reliquary at the dead end of the corridor.",
        },
        {
            // The spike room off the nave's left wall (spikeRoom.js): the pillars over the
            // pit, the reward on the far platform, and back out before Jane's wall seals
            // the mouth. Unlocked from world.js takeRelic() on the big reliquary only.
            apiName: "ACH_THORNS",
            title: "Over the Thorns",
            description: "Cross the spike pit and claim the treasure beyond it.",
        },
        {
            // The final rite at the altar of vigil 6 (uiController renderFinalRitePanel).
            apiName: "ACH_THE_ALTAR",
            title: "The Sixth Hour",
            description: "Reach the altar of the sixth and final vigil.",
        },
        {
            // The Exorcism ending (devotion >= +25 at the final altar).
            apiName: "ACH_SALVATION",
            title: "Salvation",
            description: "End the night with the rite of exorcism.",
            condition: function (s) {
                return s.endingsSeen.exorcism === true;
            },
        },
        {
            // The Corruption ending (devotion <= -25 at the final altar).
            apiName: "ACH_DAMNATION",
            title: "Damnation",
            description: "End the night by damning her.",
            condition: function (s) {
                return s.endingsSeen.corruption === true;
            },
        },
        {
            // All three endings across any runs (progress.endingsSeen, persisted).
            apiName: "ACH_TRUE_ENDING",
            title: "Between Salvation and Sin",
            description: "See the exorcism, the corruption and the limbo endings.",
            condition: function (s) {
                return (
                    s.endingsSeen.exorcism === true &&
                    s.endingsSeen.corruption === true &&
                    s.endingsSeen.limbo === true
                );
            },
        },
        {
            // Skill: reach the altar of a vigil having lit no candle stand at all. With
            // no pool to stand in, the Demoness can never be banished — she has to be
            // outrun for the whole vigil. Unlocked from world.js checkAltar().
            apiName: "ACH_UNBROKEN",
            title: "Unbroken",
            description: "Finish a vigil without lighting a single candle.",
        },
        {
            // Skill (Source-style movement): five vaults, climbs or slide-hops linked
            // into one unbroken Rush (parkour.js p.rushChain). Unlocked from startRush().
            apiName: "ACH_MOMENTUM",
            title: "Momentum",
            description: "Chain five vaults or climbs in one unbroken Rush.",
        },
        {
            // Hidden: the apparition of Jane at the corridor's dead end (one vigil in
            // two) vanishing as the player reaches the corridor's first candle stand.
            // Unlocked from apparition.js update().
            apiName: "ACH_APPARITION",
            title: "She Was Standing There",
            description: "Meet what waits at the end of the corridor.",
            hidden: true,
        },
    ];

    // ---------------------------------------------------------------------------
    // Internal state
    // ---------------------------------------------------------------------------
    var unlockedApiNames = new Set(); // achievements known to be unlocked this session
    var steamAvailable = false; // resolved once via the main process
    var initialized = false;
    var initPromise = null;
    var evaluateTimer = null;
    var devActionUsed = false; // a dev-tools action was run: this session earns nothing

    /**
     * The one gate every unlock goes through, condition or direct hook:
     *   - the tutorial's sandbox vigil (scripts/tutorial.js) earns nothing, like the
     *     saved run, the records, the route bests and the gallery marks;
     *   - once a dev-tools action has been used (code/dev-actions.js gives resources,
     *     skips rounds, unlocks the gallery), the session earns nothing either.
     */
    function canEarn() {
        if (devActionUsed) {
            return false;
        }
        try {
            if (
                typeof window.isTheNunTutorialActive === "function" &&
                window.isTheNunTutorialActive()
            ) {
                return false;
            }
        } catch (error) {
            /* a missing tutorial module just means there is no sandbox */
        }
        return true;
    }

    function noteDevAction() {
        devActionUsed = true;
    }

    function hasSteamApi() {
        try {
            return Boolean(
                window.electronAPI &&
                    typeof window.electronAPI.steamUnlockAchievement === "function" &&
                    typeof window.electronAPI.steamIsAvailable === "function",
            );
        } catch (error) {
            return false;
        }
    }

    function getAchievementByApiName(apiName) {
        for (var i = 0; i < ACHIEVEMENT_DEFINITIONS.length; i += 1) {
            if (ACHIEVEMENT_DEFINITIONS[i].apiName === apiName) {
                return ACHIEVEMENT_DEFINITIONS[i];
            }
        }
        return null;
    }

    function toCount(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    /**
     * Build a normalized snapshot of progress-relevant game state. Reads defensively
     * so it never throws — window.gameState is null before a run starts.
     */
    function buildProgressSnapshot() {
        var gs = (window && window.gameState) || null;

        var round = gs ? toCount(gs.currentRound) : 0;
        var zone = gs ? toCount(gs.currentZone) : 0;
        var maxZones = gs ? toCount(gs.maxZones) : 0;
        if (maxZones <= 0) {
            maxZones = 5; // documented default
        }
        var books = gs ? toCount(gs.booksCollected) : 0;
        var crosses = gs ? toCount(gs.crossesCollected) : 0;
        var helpNun = gs ? toCount(gs.helpNunProgress) : 0;
        var helpDemon = gs ? toCount(gs.helpDemonProgress) : 0;
        var demonExorcism = gs ? toCount(gs.demonExorcismProgress) : 0;
        var nunCorruption = gs ? toCount(gs.nunCorruptionProgress) : 0;

        var galleryArchiveUnlocked = false;
        var seenSceneCount = 0;
        try {
            if (typeof window.getTheNunGallerySaveData === "function") {
                var gallery = window.getTheNunGallerySaveData() || {};
                galleryArchiveUnlocked = Boolean(gallery.archiveUnlocked);
                var byKey = (gallery.seenScenes && gallery.seenScenes.byKey) || {};
                for (var key in byKey) {
                    if (Object.prototype.hasOwnProperty.call(byKey, key) && byKey[key]) {
                        seenSceneCount += 1;
                    }
                }
            }
        } catch (error) {
            galleryArchiveUnlocked = false;
            seenSceneCount = 0;
        }

        // Every relic unit taken in the CURRENT run (gameState.js bumpRunStat), so a
        // reliquary worth 4 or 6 counts what it is worth. Rides the saved run, so a
        // vigil retried after a catch keeps the tally.
        var relicsThisRun = gs && gs.runStats ? toCount(gs.runStats.relics) : 0;

        // Lifetime endings (scripts/settings.js `progress.endingsSeen`, persisted).
        var endingsSeen = { exorcism: false, corruption: false, limbo: false };
        try {
            if (typeof window.getTheNunProgress === "function") {
                var seen = (window.getTheNunProgress() || {}).endingsSeen || {};
                endingsSeen.exorcism = seen.exorcism === true;
                endingsSeen.corruption = seen.corruption === true;
                endingsSeen.limbo = seen.limbo === true;
            }
        } catch (error) {
            endingsSeen = { exorcism: false, corruption: false, limbo: false };
        }

        var edition = "base";
        try {
            if (typeof window.getActiveEditionKey === "function") {
                edition = String(window.getActiveEditionKey() || "base").toLowerCase();
            }
        } catch (error) {
            edition = "base";
        }

        // Route completion counts the best progress ever reached (runs end now),
        // measured against the number of scenes the route actually ships.
        var routeBest = {};
        try {
            if (typeof window.getTheNunProgress === "function") {
                routeBest = window.getTheNunProgress().routeBest || {};
            }
        } catch (error) {
            routeBest = {};
        }

        function routeLimit(routeKey) {
            try {
                if (typeof window.getAltarProgressLimit === "function") {
                    return Math.max(1, toCount(window.getAltarProgressLimit(routeKey)));
                }
            } catch (error) {
                /* fall through */
            }
            return 3;
        }

        return {
            round: round,
            zone: zone,
            maxZones: maxZones,
            books: books,
            crosses: crosses,
            relicsThisRun: relicsThisRun,
            endingsSeen: endingsSeen,
            helpNun: helpNun,
            helpDemon: helpDemon,
            demonExorcism: demonExorcism,
            nunCorruption: nunCorruption,
            bestHelpNun: Math.max(helpNun, toCount(routeBest.helpNun)),
            bestHelpDemon: Math.max(helpDemon, toCount(routeBest.helpDemon)),
            helpNunLimit: routeLimit("helpNun"),
            helpDemonLimit: routeLimit("helpDemon"),
            galleryArchiveUnlocked: galleryArchiveUnlocked,
            seenSceneCount: seenSceneCount,
            edition: edition,
        };
    }

    /**
     * Unlock a single achievement by its Steamworks API name. Deduplicates within the
     * session so we never spam the IPC bridge. Safe no-op when Steam is unavailable.
     * @returns {Promise<boolean>} whether the achievement is (now) unlocked
     */
    async function unlock(apiName) {
        if (!apiName || typeof apiName !== "string") {
            return false;
        }

        if (unlockedApiNames.has(apiName)) {
            return true;
        }

        if (!canEarn()) {
            return false;
        }

        if (!steamAvailable || !hasSteamApi()) {
            return false;
        }

        try {
            var ok = await window.electronAPI.steamUnlockAchievement(apiName);
            if (ok) {
                unlockedApiNames.add(apiName);
                var def = getAchievementByApiName(apiName);
                console.log(
                    "[achievements] Unlocked: " + apiName + (def ? " (" + def.title + ")" : ""),
                );
                return true;
            }
            return false;
        } catch (error) {
            console.error("[achievements] Failed to unlock " + apiName + ":", error);
            return false;
        }
    }

    /**
     * Evaluate every registered achievement against the current game state and unlock
     * any whose condition is satisfied. Cheap and idempotent.
     */
    async function evaluateProgress() {
        if (!steamAvailable || !canEarn()) {
            return;
        }

        var snapshot;
        try {
            snapshot = buildProgressSnapshot();
        } catch (error) {
            return;
        }

        for (var i = 0; i < ACHIEVEMENT_DEFINITIONS.length; i += 1) {
            var def = ACHIEVEMENT_DEFINITIONS[i];
            if (unlockedApiNames.has(def.apiName) || typeof def.condition !== "function") {
                continue;
            }

            var met = false;
            try {
                met = Boolean(def.condition(snapshot));
            } catch (error) {
                met = false;
            }

            if (met) {
                // unlock dedupes itself; no need to await in series.
                unlock(def.apiName);
            }
        }
    }

    // Debounced evaluate — updateCounters() fires very frequently, so coalesce.
    function scheduleEvaluate() {
        if (!steamAvailable) {
            return;
        }
        if (evaluateTimer) {
            return;
        }
        evaluateTimer = setTimeout(function () {
            evaluateTimer = null;
            evaluateProgress();
        }, 250);
    }

    /**
     * Seed the session's unlocked set from Steam so we don't redundantly re-unlock
     * achievements the player already earned in a previous session.
     */
    async function syncFromSteam() {
        if (!steamAvailable || typeof window.electronAPI.steamCheckAchievement !== "function") {
            return;
        }

        await Promise.all(
            ACHIEVEMENT_DEFINITIONS.map(async function (def) {
                try {
                    var already = await window.electronAPI.steamCheckAchievement(def.apiName);
                    if (already) {
                        unlockedApiNames.add(def.apiName);
                    }
                } catch (error) {
                    // Achievement may not exist on Steamworks yet; ignore.
                }
            }),
        );
    }

    // Non-invasively re-evaluate after the game's own HUD refresh (fires on every
    // gameplay state change) and after gallery/settings saves, instead of editing the
    // gameplay files. Each wrap runs the original untouched, then schedules evaluation.
    function wrapTrigger(name) {
        try {
            var original = window[name];
            if (typeof original !== "function" || original.__achWrapped) {
                return;
            }
            var wrapped = function () {
                var result = original.apply(this, arguments);
                try {
                    scheduleEvaluate();
                } catch (error) {
                    /* ignore */
                }
                return result;
            };
            wrapped.__achWrapped = true;
            window[name] = wrapped;
        } catch (error) {
            /* ignore — a missing trigger just means fewer live re-evaluations */
        }
    }

    function installTriggers() {
        // Primary liveness: the HUD refresh runs after round/zone/altar/collectible changes.
        wrapTrigger("updateCounters");
        // Gallery archive unlock persists through the save writer.
        wrapTrigger("requestTheNunSaveWrite");
        // Belt-and-suspenders: the direct gameplay mutators (covered by updateCounters
        // in normal flow, but wrapped in case a caller bypasses the HUD refresh).
        wrapTrigger("advanceGameRound");
        wrapTrigger("nextZone");
        wrapTrigger("selectAltarChoice");
        // The endings write lifetime progress (runFlow.js -> settings.js), which is what
        // ACH_SALVATION / ACH_DAMNATION / ACH_TRUE_ENDING read.
        wrapTrigger("completeTheNunEnding");
        wrapTrigger("updateTheNunProgress");
    }

    /**
     * One-time initialization: resolve Steam availability, sync already-earned
     * achievements, wire the triggers, then evaluate current progress.
     */
    function init() {
        if (initPromise) {
            return initPromise;
        }

        initPromise = (async function () {
            if (!hasSteamApi()) {
                steamAvailable = false;
                initialized = true;
                return;
            }

            try {
                steamAvailable = Boolean(await window.electronAPI.steamIsAvailable());
            } catch (error) {
                steamAvailable = false;
            }

            initialized = true;

            if (!steamAvailable) {
                return;
            }

            installTriggers();
            await syncFromSteam();
            await evaluateProgress();
        })();

        return initPromise;
    }

    // Public API ----------------------------------------------------------------
    window.SteamAchievements = {
        definitions: ACHIEVEMENT_DEFINITIONS,
        init: init,
        unlock: unlock,
        evaluateProgress: evaluateProgress,
        isUnlocked: function (apiName) {
            return unlockedApiNames.has(apiName);
        },
        isAvailable: function () {
            return steamAvailable;
        },
        canEarn: canEarn,
        noteDevAction: noteDevAction,
        buildProgressSnapshot: buildProgressSnapshot,
    };

    // Convenience global so any part of the game can fire an achievement directly.
    // It is gated by canEarn() inside unlock(), so a gameplay hook never has to ask.
    window.unlockAchievement = function (apiName) {
        return unlock(apiName);
    };

    // code/dev-actions.js calls this before every dev action: the session stops earning.
    window.markTheNunDevAction = noteDevAction;

    // Kick off initialization once the document (and electronAPI) are ready.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            init();
        });
    } else {
        init();
    }
})();
