# The Nun — Reverse-Engineered Source

Fully extracted, unobfuscated source of **The Nun v0.2.0 (Diamond edition)** by FleshForge Studio,
an Electron + Three.js game. The original distribution shipped its JavaScript inside an
`app.asar` archive; here it is laid out as a normal Electron project with the Steam
integration removed.

> **Copyright notice:** All code, assets, artwork, audio and story content belong to
> **FleshForge Studio**. This repository is a reverse-engineered copy for research and
> personal modification. Re-distributing it (or a derivative build) publicly requires the
> rights holder's permission. No LICENSE has been added on their behalf.

## Repository layout

| Path | Contents |
|---|---|
| `electron/main.js` | Electron main process: window, saves, IPC, asset loading |
| `electron/preload.js` | `contextBridge` API exposed to the renderer (`electronAPI`) |
| `index.html` | Single-page app shell |
| `scripts/` | Game logic: `gameState`, `saveSystem`, `nunSystem`, `demonAttacks`, `gallery`, `uiController`, `zoneScenes`, `tutorial`, `settings`, `titlescreen`, ... |
| `scripts/world3d/` | Three.js 3D world: `world.js`, `cathedral.js`, `parkour.js`, `spikeRoom.js`, `models.js`, ... |
| `code/` | `achievements.js`, `functions.js`, `i18n.js` + 29 locale dictionaries, `vendor/three/` (three.min.js r-era, GLTFLoader, SkeletonUtils) |
| `styles/` | CSS (`game.css`, `gallery.css`, `titlescreen.css`, `settings.css`, `tutorial.css`) |
| `assets/` `assets_gold/` `assets_diamond/` | Per-edition media: `backgrounds/`, `scenes/`, `sounds/`, `world3d/` (GLB models), `fonts/`, `icons/` |
| `node_modules/` | Intentionally empty (Steam module removed) |

## Changes vs. the shipped build

1. `resources/app.asar` extracted and merged with `resources/app.asar.unpacked/` into this tree.
   Every file was verified against the asar's stored SHA-256 integrity hashes.
2. **Steam dependency removed**
   (`buildMode: "steam"` → `"standalone"`, `steamworks.js` dependency and its
   `node_modules/steamworks.js` copy, `scripts/steam-build-guard.js` deleted):
   * `electron/main.js` no longer loads any Steam SDK (steamworks.js/greenworks),
     no Steam overlay hooks, no `steam_appid.txt` writing.
   * The `steam-*` IPC handlers remain but return standalone-safe values, so the
     renderer API surface (`electronAPI`) is unchanged — zero renderer changes needed.
   * Consequences: saves are local files only (no Steam Cloud), Steam achievements are
     inert no-ops (`code/achievements.js` already degrades gracefully), language comes
     from the in-game setting, not the Steam client.

## Running it

**As a playable game** — the sibling `game/` directory is a copy of the original
distribution with `resources/app.asar` + `resources/app.asar.unpacked/` replaced by
`resources/app/` (this source). Electron loads `resources/app/` automatically.

**From source (development):**

```
npm install          # installs electron (devDependency)
npm start
```

Environment toggles respected by `electron/main.js`: `BUILD_MODE` (keep `standalone`),
`APP_PAGE` (`game` | `update-manager`).

## Saves

Windows: `%APPDATA%\Thenun\save\*.save` (timestamped JSON-ish files).
Cloud mirrors (`*.cloudmirror.json`) are legacy Steam artifacts and are ignored.

## Tools

`tools/extract-asar.js` — dependency-free asar extractor with integrity verification
(plain `node`, no npm packages). See also `scripts/prepare-build.js` for the
original author's build pipeline (Moon-Update-Manager / Steam targets — external).

## Architecture notes (reading guide)

* Boot: `index.html` → `scripts/main.js` orchestrates systems; `electron/main.js`
  sends the build config via `build-config` on every `did-finish-load`.
* Persistence: `scripts/saveSystem.js` handles local save files and slots; gallery
  unlock state lives in the save.
* 3D world: `scripts/world3d/world.js` (largest module) drives levels
  (`cathedral`, `corridor`, `spikeRoom`, `parkour`) with models loaded via
  `GLTFLoader` from `assets/world3d/*.glb` — binary reads go through the
  `read-asset-binary` IPC because `file://` fetch is blocked.
* Editions: `assets_gold/` vs `assets_diamond/` are content tiers selected by
  `appEdition` in `package.json` (diamond = everything).
