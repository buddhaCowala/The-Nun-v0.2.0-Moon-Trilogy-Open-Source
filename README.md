# RE (Reverse Engineering) Nun — workspace

* `source/` — extracted, Steam-free, open-source-ready game source (see `source/README.md`)
* `game/`   — runnable standalone copy: original Electron runtime with `resources/app/` (the source) replacing `app.asar`. Launch via `The Nun Steam.exe` (title bar shows "The Nun", no Steam).
* `tools/`  — `extract-asar.js`, dependency-free asar extractor with SHA-256 verification used to produce `source/`.
