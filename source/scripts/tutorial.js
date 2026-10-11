/**
 * The interactive tutorial: a guided, sandboxed vigil 1 in the real 3D cathedral.
 *
 *  - First run of a save (progress.runsStarted 0, tutorialOffered false): Play asks
 *    "Play the tutorial? (Recommended)" first (runFlow.js requestTheNunNewRun).
 *    Tutorial on the title screen replays it (titlescreen.js, action "information").
 *  - "info" steps freeze the world (theNun3D.tutorial.freeze), dim the screen with a
 *    spotlight cut-out and a pulsing ring around what they explain, and wait for
 *    Continue / Enter. "do" steps let the player act, with lit keycaps, an objective
 *    and a gold beacon in the world, and wait until it is done.
 *  - The sandbox writes nothing: while isTheNunTutorialActive() the saved run, records,
 *    route bests, achievements and gallery marks are skipped (settings.js, runFlow.js,
 *    achievements.js, gallery.js), and main.js starts no run and plays no intro. The one
 *    exception is a preference: the "sensitivity" step sets the real Settings > Mouse
 *    Sensitivity (wheel or -/+ while looking round, two marks to flick between, Enter).
 *  - Finishing (or skipping the offered one) goes straight into the first real vigil;
 *    a replay from the title's Tutorial button returns to the title.
 */
(function () {
    'use strict';

    const tut = {
        active: false,
        origin: 'first',
        index: -1,
        step: null,
        rafId: 0,
        layer: null,
        el: {},
        modal: null,
        paused: false,
        doneAt: 0,
        track: null,
        lastCatch: 0,
        script: null
    };

    function t(key, vars) {
        return typeof window.t === 'function' ? window.t(key, vars) : key;
    }

    function api() {
        return window.theNun3D && window.theNun3D.tutorial;
    }

    function info() {
        return api() ? api().info() : null;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function isShown(el) {
        return Boolean(el) && !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none';
    }

    function click() {
        const audio = byId('click-audio');
        if (!audio || window.gameSettings?.audio?.clickSoundEnabled === false) return;
        audio.volume = Math.min(1, window.gameSettings?.audio?.sfxVolume ?? 0.55);
        try { audio.currentTime = 0; } catch (error) { /* ignore */ }
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
    }

    // ------------------------------------------------------------ geometry

    function stage() {
        const st = byId('app-stage') || document.body;
        const r = st.getBoundingClientRect();
        return { st, r, k: (r.width / (st.offsetWidth || r.width)) || 1 };
    }

    function rectOf(element) {
        if (!element || !isShown(element)) return null;
        const cr = element.getBoundingClientRect();
        if (!cr.width && !cr.height) return null;
        const s = stage();
        return { x: (cr.left - s.r.left) / s.k, y: (cr.top - s.r.top) / s.k, w: cr.width / s.k, h: cr.height / s.k };
    }

    function pointOf(x, y, z) {
        const a = api();
        const canvas = document.querySelector('.world-3d-canvas');
        const p = a && canvas ? a.project(x, y, z) : null;
        if (!p) return null;
        const cr = canvas.getBoundingClientRect();
        const s = stage();
        return {
            x: (cr.left + ((p.x + 1) / 2) * cr.width - s.r.left) / s.k,
            y: (cr.top + ((1 - p.y) / 2) * cr.height - s.r.top) / s.k,
            behind: p.behind,
            ndc: p
        };
    }

    // A box round a standing figure at (x, feetY, z).
    function figureBox(x, y, z) {
        const feet = pointOf(x, y, z);
        const head = pointOf(x, y + 1.85, z);
        if (!feet || !head || feet.behind) return null;
        const h = Math.max(60, Math.abs(feet.y - head.y));
        return { x: feet.x - (h * 0.32), y: head.y, w: h * 0.64, h };
    }

    function union(rects, pad) {
        const list = rects.filter(Boolean);
        if (!list.length) return null;
        const x0 = Math.min(...list.map((r) => r.x)) - pad;
        const y0 = Math.min(...list.map((r) => r.y)) - pad;
        const x1 = Math.max(...list.map((r) => r.x + r.w)) + pad;
        const y1 = Math.max(...list.map((r) => r.y + r.h)) + pad;
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    function sel(...selectors) {
        return () => selectors.map((s) => rectOf(document.querySelector(s)));
    }

    // ------------------------------------------------------------ targets

    // (never one behind the locked side door: the corridor, corridor.js)
    function aheadOfWall(item, i) {
        return !item.behindDoor && (i.wallZ == null || item.z < i.wallZ - 1.5);
    }

    function nearest(list, i) {
        let best = null;
        let bestD = Infinity;
        list.forEach((item) => {
            const d = Math.hypot(item.x - i.player.x, item.z - i.player.z);
            if (d < bestD) { bestD = d; best = item; }
        });
        return best;
    }

    function pickRelic(filter) {
        const i = info();
        if (!i) return null;
        return nearest(i.relics.filter((r) => !r.taken && filter(r) && aheadOfWall(r, i)), i);
    }

    function relicBeacon(r) {
        return r ? { x: r.x, z: r.z, y: r.y, floorY: r.y } : null;
    }

    function counts() {
        const gs = window.gameState || {};
        return { crosses: Number(gs.crossesCollected) || 0, books: Number(gs.booksCollected) || 0 };
    }

    // ------------------------------------------------------------ the steps
    //
    // info: { id, focus() -> rects, enter(), world: false for the altar tour }
    // do:   { id, keys, target() -> beacon spot, enter(track), check(i, track, dt) }
    //       confirm: no check; it waits for Enter / its _ok button (update(i, track, dt) each frame)

    const K = {
        W: ['KeyW', 'ArrowUp'], A: ['KeyA', 'ArrowLeft'], S: ['KeyS', 'ArrowDown'], D: ['KeyD', 'ArrowRight'],
        Shift: ['ShiftLeft', 'ShiftRight'], Space: ['Space'], Ctrl: ['ControlLeft', 'ControlRight', 'KeyC'], E: ['KeyE'],
        // the sensitivity step's caps light from nudgeSensitivity(), whatever the keyboard layout
        Wheel: ['@wheel'], Minus: ['@minus'], Plus: ['@plus']
    };
    const KEY_LABEL = { Minus: '−', Plus: '+' };

    // The sensitivity step: the -/+ keys (by the character typed, so AZERTY works too) and
    // two marks this far either side of the starting view (rad) and this far away (m); a
    // mark counts when it is within `hit` stage px of the crosshair; `count` flicks tick
    // the objective. The step itself waits for Enter.
    const SENS_UP = ['+', '='];
    const SENS_DOWN = ['-', '_'];
    const FLICK = { yaw: 0.4, dist: 6, hit: 42, count: 4 };

    function janeFocus() {
        const i = info();
        return i && i.nun ? [figureBox(i.nun.x, i.nun.y, i.nun.z)] : [];
    }

    const STEPS = [
        { id: 'welcome', kind: 'info' },
        {
            id: 'jane', kind: 'info', cinematic: true, focus: janeFocus,
            enter() {
                const i = info();
                if (!i || !i.nun) return;
                api().lookAt(i.nun.x, i.nun.y + 1.2, i.nun.z, 1.6);
                tut.script.slowNun = 0.3;
                tut.script.spot = { x: i.nun.x, z: i.nun.z };
            }
        },
        {
            id: 'wall', kind: 'info', cinematic: true, focus: janeFocus,
            enter() {
                tut.script.slowNun = 0.3;
                const i = info();
                if (i && i.nun) tut.script.spot = { x: i.nun.x, z: i.nun.z };
            }
        },
        {
            id: 'gap', kind: 'info', focus: sel('#breath-meter'),
            enter() {
                // turn back toward the altar
                const i = info();
                if (i && i.altar) api().lookAt(i.altar.x, i.eye.y, i.altar.z, 1.2);
            }
        },
        {
            id: 'move', kind: 'do', keys: [['W'], ['A'], ['S'], ['D']],
            enter: (tr, i) => { tr.last = { x: i.player.x, z: i.player.z }; tr.dist = 0; },
            check(i, tr) {
                tr.dist += Math.hypot(i.player.x - tr.last.x, i.player.z - tr.last.z);
                tr.last = { x: i.player.x, z: i.player.z };
                return tr.dist > 4;
            }
        },
        {
            id: 'look', kind: 'do', keys: [['Mouse', null, 'tutorial.key_mouse']],
            enter: (tr, i) => { tr.yaw = i.player.yaw; tr.turn = 0; },
            check(i, tr) {
                const d = Math.atan2(Math.sin(i.player.yaw - tr.yaw), Math.cos(i.player.yaw - tr.yaw));
                tr.turn += Math.abs(d);
                tr.yaw = i.player.yaw;
                return tr.turn > 2;
            }
        },
        {
            // Tuned while looking round, not in a menu: the wheel or -/+ change the real
            // setting at once (settings.js setTheNunMouseSensitivity, saved as it goes) and
            // two marks to flick between give the feel. Waits for Enter / "Sounds good".
            id: 'sensitivity', kind: 'do', confirm: true, sens: true,
            keys: [['Wheel', null, 'tutorial.key_wheel'], ['Minus', 'tutorial.sensitivity_slower'], ['Plus', 'tutorial.sensitivity_faster']],
            enter: (tr, i) => {
                tr.marks = i ? flickMarks(i) : [];
                tr.active = 0;
                tr.hits = 0;
                renderSens(0, false);
                setFlickGoal(tr);
            },
            update: (i, tr) => drawFlick(i, tr)
        },
        {
            id: 'run', kind: 'do', keys: [['Shift'], ['W']],
            enter: (tr) => { tr.time = 0; },
            check(i, tr, dt) {
                if (i.player.speed > 4.2) tr.time += dt;
                return tr.time > 1;
            }
        },
        { id: 'gauges', kind: 'info', focus: sel('#world-gauges') },
        {
            id: 'jump', kind: 'do', keys: [['Space']],
            check: (i) => !i.player.grounded && i.player.vy > 0.5
        },
        {
            id: 'climb', kind: 'do', keys: [['Shift'], ['Space'], ['E']], skippable: true,
            enter: (tr) => { tr.relic = pickRelic((r) => r.reliquary); },
            target: (tr) => relicBeacon(tr.relic),
            check: (i, tr) => !tr.relic || i.relics[tr.relic.i].taken
        },
        { id: 'rush', kind: 'info', focus: sel('#world-gauges') },
        {
            id: 'crouch', kind: 'do', keys: [['Ctrl']],
            check: (i) => i.player.stance === 1
        },
        {
            id: 'prone', kind: 'do', keys: [['Ctrl', 'tutorial.key_hold'], ['E']], skippable: true,
            enter: (tr) => { tr.relic = pickRelic((r) => r.hidden); },
            target: (tr) => relicBeacon(tr.relic),
            check: (i, tr) => !tr.relic || i.relics[tr.relic.i].taken
        },
        { id: 'counters', kind: 'info', focus: sel('#counters') },
        {
            id: 'cross', kind: 'do', keys: [['E']], skippable: true,
            enter: (tr) => { tr.relic = pickRelic((r) => r.kind === 'cross' && !r.reliquary && !r.hidden); tr.start = counts().crosses; },
            target: (tr) => relicBeacon(tr.relic),
            check: (i, tr) => !tr.relic || counts().crosses > tr.start
        },
        {
            id: 'book', kind: 'do', keys: [['E']], skippable: true,
            enter: (tr) => { tr.relic = pickRelic((r) => r.kind === 'book' && !r.reliquary && !r.hidden); tr.start = counts().books; },
            target: (tr) => relicBeacon(tr.relic),
            check: (i, tr) => !tr.relic || counts().books > tr.start
        },
        { id: 'devotion', kind: 'info', focus: sel('#devotion-meter') },
        {
            id: 'candle', kind: 'do', keys: [['E', 'tutorial.key_hold']],
            enter: (tr, i) => {
                tr.candle = nearest(i.candles.filter((c) => !c.lit && aheadOfWall(c, i)), i);
                tut.candle = tr.candle;
            },
            target: (tr) => (tr.candle ? { x: tr.candle.x, z: tr.candle.z, y: tr.candle.y + 1.5, floorY: tr.candle.y } : null),
            check: (i, tr) => !tr.candle || i.candles[tr.candle.i].lit
        },
        { id: 'light', kind: 'info' },
        {
            id: 'leave', kind: 'do', keys: [['W'], ['A'], ['S'], ['D']],
            enter: (tr) => { tr.dark = 0; },
            check(i, tr, dt) {
                tr.dark = i.inLight ? 0 : tr.dark + dt;
                return tr.dark > 0.6 && api().spawnDemon(1.8);
            }
        },
        {
            id: 'demon', kind: 'info',
            focus() {
                const i = info();
                const box = i && i.demon ? figureBox(i.demon.x, i.demon.y, i.demon.z) : null;
                return [rectOf(byId('world-demon-banner')), box];
            }
        },
        {
            id: 'hide', kind: 'do', keys: [['W'], ['Shift']],
            target: () => {
                const c = tut.candle;
                return c ? { x: c.x, z: c.z, y: c.y + 1.5, floorY: c.y } : null;
            },
            check: (i) => !i.demon || i.demon.state === 'banished'
        },
        { id: 'caught', kind: 'info', mock: true },
        {
            id: 'race', kind: 'do', keys: [['Shift'], ['W']],
            enter() {
                tut.script.holdNun = false;
                tut.script.nunSpeedScale = 0.6;
                tut.script.altarLocked = false;
            },
            target: () => {
                const i = info();
                return i && i.altar ? { x: i.altar.x, z: i.altar.z } : null;
            },
            check() {
                const screen = byId('altar-screen');
                if (!isShown(screen)) return false;
                if (!tut.altarSkipped && typeof window.skipAltarVideoPlayback === 'function' && window.uiController) {
                    tut.altarSkipped = true;
                    try { window.skipAltarVideoPlayback(window.uiController); } catch (error) { /* keep waiting */ }
                }
                return isShown(byId('altar-choices'));
            }
        },
        { id: 'routes', kind: 'info', world: false, focus: sel('.choice-btn--help-nun', '.choice-btn--help-demon') },
        { id: 'premium', kind: 'info', world: false, focus: sel('.choice-btn--demon-exorcism', '.choice-btn--nun-corruption') },
        { id: 'attack', kind: 'info', world: false, panelAt: 'bottom', focus: sel('.choice-btn--attack-nun', '.choice-btn--attack-demon') },
        { id: 'surrender', kind: 'info', world: false, focus: sel('.choice-btn--surrender') },
        { id: 'path', kind: 'info', world: false, focus: sel('#altar-path-line') },
        { id: 'final', kind: 'info', world: false },
        { id: 'finish', kind: 'info', world: false, finish: true }
    ];

    // ------------------------------------------------------------ DOM

    function h(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function button(label, className, onClick) {
        const node = h('button', `tut-btn ${className || ''}`.trim(), label);
        node.type = 'button';
        node.addEventListener('click', (event) => {
            event.stopPropagation();
            click();
            onClick();
        });
        return node;
    }

    function buildLayer() {
        if (tut.layer) tut.layer.remove();
        const layer = h('div', 'tut-layer');
        const el = tut.el = {};
        el.blocker = h('div', 'tut-blocker');
        el.hole = h('div', 'tut-hole');
        el.ring = h('div', 'tut-ring');
        el.bars = h('div', 'tut-letterbox');
        el.bars.append(h('i'), h('i'));
        el.marker = h('div', 'tut-marker');
        el.marker.append(h('span', 'tut-marker__gem'), h('span', 'tut-marker__dist'));
        el.toast = h('div', 'tut-toast');
        // the sensitivity step's two flick marks
        el.flick = h('div', 'tut-flick');
        el.flickMarks = [0, 1].map(() => {
            const mark = h('div', 'tut-flick__mark');
            mark.append(h('span', 'tut-flick__ring'), h('span', 'tut-flick__gem'));
            el.flick.appendChild(mark);
            return mark;
        });

        el.panel = h('div', 'tut-panel');
        const head = h('div', 'tut-panel__head');
        el.count = h('span', 'tut-panel__count');
        head.append(h('span', 'tut-panel__label', t('tutorial.label')), el.count);
        el.title = h('h3', 'tut-panel__title');
        el.text = h('p', 'tut-panel__text');
        el.mock = h('div', 'tut-mock');
        el.mock.append(h('span', 'tut-mock__btn', t('reckoning.continue', { phase: 1 })), h('span', 'tut-mock__btn tut-mock__btn--dim', t('reckoning.abandon')));
        el.keys = h('div', 'tut-keys');
        // the sensitivity step's read-out: the value, a bar with the default's notch
        el.sens = h('div', 'tut-sens');
        const sensHead = h('div', 'tut-sens__head');
        el.sensValue = h('span', 'tut-sens__value');
        sensHead.append(
            h('span', 'tut-sens__label', t('tutorial.sensitivity_meter')),
            h('span', 'tut-sens__default', t('tutorial.sensitivity_default')),
            el.sensValue
        );
        const sensTrack = h('div', 'tut-sens__track');
        el.sensFill = h('i');
        el.sensNotch = h('b');
        sensTrack.append(el.sensFill, el.sensNotch);
        el.sens.append(sensHead, sensTrack, h('p', 'tut-sens__note', t('tutorial.sensitivity_saved')));
        el.goal = h('div', 'tut-goal');
        el.goalText = h('span', 'tut-goal__text');
        el.goal.append(h('span', 'tut-goal__label', t('tutorial.objective')), el.goalText, h('span', 'tut-goal__check', '✓'));
        el.bar = h('div', 'tut-progress');
        el.barFill = h('i');
        el.bar.appendChild(el.barFill);
        el.actions = h('div', 'tut-panel__actions');
        el.panel.append(head, el.title, el.text, el.mock, el.keys, el.sens, el.goal, el.bar, el.actions);

        layer.append(el.blocker, el.hole, el.ring, el.bars, el.marker, el.flick, el.panel, el.toast);
        (byId('app-stage') || document.body).appendChild(layer);
        tut.layer = layer;
    }

    function showToast(text) {
        const toast = tut.el.toast;
        if (!toast) return;
        toast.textContent = text;
        toast.classList.remove('is-visible');
        void toast.offsetWidth;
        toast.classList.add('is-visible');
        window.clearTimeout(tut.toastTimer);
        tut.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
    }

    // A modal card (the first-run prompt, the replay offer, skip confirm, pause).
    function showModal(opts) {
        closeModal();
        const overlay = h('div', `tut-modal ${opts.className || ''}`.trim());
        const card = h('div', 'tut-modal__card');
        if (opts.kicker) card.appendChild(h('div', 'tut-modal__kicker', opts.kicker));
        card.appendChild(h('h2', 'tut-modal__title', opts.title));
        if (opts.text) card.appendChild(h('p', 'tut-modal__text', opts.text));
        const actions = h('div', 'tut-modal__actions');
        opts.buttons.forEach((b) => {
            const node = button(b.label, b.primary ? 'tut-btn--primary' : 'tut-btn--ghost', b.onClick);
            if (b.badge) node.appendChild(h('span', 'tut-btn__badge', b.badge));
            actions.appendChild(node);
        });
        card.appendChild(actions);
        overlay.appendChild(card);
        (byId('app-stage') || document.body).appendChild(overlay);
        window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
        const primary = actions.querySelector('.tut-btn--primary');
        if (primary) primary.focus({ preventScroll: true });
        tut.modal = overlay;
    }

    function closeModal() {
        if (tut.modal) {
            tut.modal.remove();
            tut.modal = null;
        }
    }

    // ------------------------------------------------------------ flow

    function renderKeys(step) {
        const keys = tut.el.keys;
        keys.innerHTML = '';
        (step.keys || []).forEach(([name, noteKey, labelKey]) => {
            // − and + get a plain serif (the UI font draws "+" as a small gothic cross)
            const cap = h('span', !labelKey && KEY_LABEL[name] ? 'tut-key tut-key--symbol' : 'tut-key');
            cap.dataset.codes = (K[name] || []).join(' ');
            cap.dataset.name = name;
            cap.appendChild(h('kbd', '', labelKey ? t(labelKey) : (KEY_LABEL[name] || name)));
            if (noteKey) cap.appendChild(h('small', '', t(noteKey)));
            keys.appendChild(cap);
        });
    }

    function enterStep(index) {
        const step = STEPS[index];
        tut.index = index;
        tut.step = step;
        tut.doneAt = 0;
        tut.track = {};
        const a = api();
        const el = tut.el;
        if (!step) return;

        const isInfo = step.kind === 'info';
        if (step.world !== false && a) a.freeze(isInfo);
        if (a) a.setBeacon(null);
        if (!step.cinematic && tut.script) {
            tut.script.slowNun = 0;
            tut.script.spot = null;
        }

        tut.layer.classList.toggle('is-info', isInfo);
        tut.layer.classList.toggle('is-do', !isInfo);
        tut.layer.classList.toggle('is-cinematic', Boolean(step.cinematic));
        tut.layer.classList.remove('is-done');
        el.count.textContent = `${index + 1} / ${STEPS.length}`;
        el.title.textContent = t(`tutorial.${step.id}_title`);
        el.text.textContent = t(`tutorial.${step.id}_text`);
        el.mock.style.display = step.mock ? '' : 'none';
        el.sens.style.display = step.sens ? '' : 'none';
        el.flick.style.display = step.sens ? '' : 'none';
        tut.wheel = 0;
        el.goal.style.display = isInfo ? 'none' : '';
        el.goalText.textContent = isInfo ? '' : t(`tutorial.${step.id}_goal`);
        el.barFill.style.width = `${((index + 1) / STEPS.length) * 100}%`;
        renderKeys(step);

        el.actions.innerHTML = '';
        if (step.finish) {
            el.actions.appendChild(button(t(tut.origin === 'first' ? 'tutorial.finish_play' : 'common.main_menu'), 'tut-btn--primary', () => finish()));
        } else {
            el.actions.appendChild(button(t('tutorial.skip'), 'tut-btn--ghost', confirmSkip));
            if (step.skippable) el.actions.appendChild(button(t('tutorial.skip_step'), 'tut-btn--ghost', advance));
            if (isInfo || step.confirm) {
                const next = button(t(step.confirm ? `tutorial.${step.id}_ok` : 'tutorial.continue'), 'tut-btn--primary', advance);
                next.appendChild(h('kbd', 'tut-btn__kbd', 'Enter'));
                el.actions.appendChild(next);
            }
        }

        // replay the panel's entrance
        el.panel.classList.remove('is-in');
        void el.panel.offsetWidth;
        el.panel.classList.add('is-in');

        const i = info();
        if (step.enter && i) step.enter(tut.track, i);
        else if (step.enter) step.enter(tut.track, null);
        if (step.target && a) a.setBeacon(step.target(tut.track));
    }

    function advance() {
        if (!tut.active || tut.modal) return;
        if (tut.step && tut.step.finish) {
            finish();
            return;
        }
        enterStep(tut.index + 1);
    }

    function placePanel(hole) {
        const panel = tut.el.panel;
        const s = stage();
        const W = s.st.offsetWidth || 1920;
        const H = s.st.offsetHeight || 1080;
        const pw = panel.offsetWidth || 560;
        const ph = panel.offsetHeight || 260;
        let x;
        let y;
        if (tut.step.kind === 'do') {
            x = 40;
            y = 150;
        } else if (tut.step.panelAt === 'bottom') {
            // docked low and centred, for a spotlight whose neighbours must stay in view
            x = (W - pw) / 2;
            y = H - ph - 16;
        } else if (!hole) {
            x = (W - pw) / 2;
            y = (H - ph) / 2 + (tut.step.cinematic ? 180 : 0);
        } else {
            const below = H - (hole.y + hole.h);
            y = below > ph + 60 ? hole.y + hole.h + 40 : Math.max(20, hole.y - ph - 40);
            if (below <= ph + 60 && hole.y < ph + 60) {
                // no room above or below: beside it
                y = Math.max(20, Math.min(H - ph - 20, hole.y + (hole.h - ph) / 2));
                x = hole.x + hole.w + 40 + pw < W ? hole.x + hole.w + 40 : Math.max(20, hole.x - pw - 40);
            } else {
                x = hole.x + (hole.w - pw) / 2;
            }
            x = Math.max(20, Math.min(W - pw - 20, x));
        }
        panel.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    function drawHole(hole) {
        const el = tut.el;
        const s = stage();
        const W = s.st.offsetWidth || 1920;
        const H = s.st.offsetHeight || 1080;
        const box = hole || { x: W / 2, y: H / 2, w: 0, h: 0 };
        [el.hole, el.ring].forEach((node) => {
            node.style.left = `${box.x}px`;
            node.style.top = `${box.y}px`;
            node.style.width = `${box.w}px`;
            node.style.height = `${box.h}px`;
        });
        el.ring.style.opacity = hole ? '1' : '0';
    }

    function drawMarker(step) {
        const marker = tut.el.marker;
        const target = step.kind === 'do' && step.target ? step.target(tut.track) : null;
        const i = info();
        if (!target || !i) {
            marker.style.opacity = '0';
            return;
        }
        const floor = target.floorY != null ? target.floorY : i.player.y;
        const p = pointOf(target.x, (target.y != null ? target.y : floor) + 0.9, target.z);
        if (!p) return;
        const s = stage();
        const W = s.st.offsetWidth || 1920;
        const H = s.st.offsetHeight || 1080;
        let { x, y } = p;
        const off = p.behind || x < 40 || x > W - 40 || y < 40 || y > H - 40;
        if (p.behind) { x = W - x; y = H - 60; }
        x = Math.max(50, Math.min(W - 50, x));
        y = Math.max(50, Math.min(H - 60, y));
        marker.classList.toggle('is-edge', off);
        marker.style.opacity = '1';
        marker.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        const d = Math.hypot(target.x - i.player.x, target.z - i.player.z);
        marker.lastChild.textContent = `${Math.round(d)} m`;
    }

    // ------------------------------------------------------------ sensitivity step

    function sensRange() {
        return window.THE_NUN_MOUSE_SENSITIVITY_RANGE || { min: 0.2, max: 3, step: 0.05, fallback: 1 };
    }

    function currentSens() {
        return typeof window.getTheNunMouseSensitivity === 'function' ? window.getTheNunMouseSensitivity() : 1;
    }

    // The read-out: value, bar, the default's notch; `dir` bumps the value, `limit`
    // shakes the bar (already at the end of the range).
    function renderSens(dir, limit) {
        const el = tut.el;
        if (!el.sens) return;
        const r = sensRange();
        const value = currentSens();
        const at = (v) => `${(((v - r.min) / (r.max - r.min)) * 100).toFixed(2)}%`;
        el.sensValue.textContent = typeof window.formatTheNunMouseSensitivity === 'function'
            ? window.formatTheNunMouseSensitivity(value)
            : value.toFixed(2);
        el.sensFill.style.width = at(value);
        el.sensNotch.style.left = at(r.fallback);
        el.sens.classList.toggle('is-default', Math.abs(value - r.fallback) < 0.001);
        [[el.sensValue, 'is-bump', dir], [el.sens, 'is-limit', limit]].forEach(([node, name, on]) => {
            node.classList.remove(name);
            if (on) {
                void node.offsetWidth;
                node.classList.add(name);
            }
        });
    }

    // One notch of the wheel or one -/+ press: the real setting moves at once.
    function nudgeSensitivity(dir, capName) {
        const before = currentSens();
        const after = typeof window.setTheNunMouseSensitivity === 'function'
            ? window.setTheNunMouseSensitivity(before + (dir * sensRange().step))
            : before;
        flashCap(capName || (dir > 0 ? 'Plus' : 'Minus'));
        renderSens(after === before ? 0 : dir, after === before);
    }

    function flashCap(name) {
        const cap = tut.layer && tut.layer.querySelector(`.tut-key[data-name="${name}"]`);
        if (!cap) return;
        cap.classList.add('is-down');
        window.clearTimeout(cap._t);
        cap._t = window.setTimeout(() => cap.classList.remove('is-down'), 160);
    }

    // Two marks at eye height either side of the view the step starts with.
    function flickMarks(i) {
        const eye = i.eye || { x: i.player.x, y: i.player.y + 1.6, z: i.player.z };
        return [1, -1].map((side) => {
            const yaw = i.player.yaw + (side * FLICK.yaw);
            return { x: eye.x - (Math.sin(yaw) * FLICK.dist), y: eye.y, z: eye.z - (Math.cos(yaw) * FLICK.dist) };
        });
    }

    function setFlickGoal(tr) {
        tut.el.goalText.textContent = t('tutorial.sensitivity_goal', { count: Math.min(tr.hits, FLICK.count), total: FLICK.count });
        tut.layer.classList.toggle('is-done', tr.hits >= FLICK.count);
    }

    // Place both marks on screen: out of view (or under the panel) a mark waits at the
    // edge with an arrow toward it. The lit one counts once the crosshair reaches it,
    // and the other one lights up.
    function drawFlick(i, tr) {
        const s = stage();
        const W = s.st.offsetWidth || 1920;
        const H = s.st.offsetHeight || 1080;
        const canvas = document.querySelector('.world-3d-canvas');
        const cr = canvas ? canvas.getBoundingClientRect() : null;
        const cx = cr && cr.width ? (cr.left + (cr.width / 2) - s.r.left) / s.k : W / 2;
        const cy = cr && cr.height ? (cr.top + (cr.height / 2) - s.r.top) / s.k : H / 2;
        const panel = rectOf(tut.el.panel);
        const eye = i.eye || { x: i.player.x, z: i.player.z };
        (tr.marks || []).forEach((mark, n) => {
            const node = tut.el.flickMarks[n];
            const p = pointOf(mark.x, mark.y, mark.z);
            if (!node || !p) return;
            if (n === tr.active && !p.behind && Math.hypot(p.x - cx, p.y - cy) < FLICK.hit) {
                tr.hits += 1;
                tr.active = 1 - n;
                node.classList.remove('is-hit');
                void node.offsetWidth;
                node.classList.add('is-hit');
                click();
                setFlickGoal(tr);
            }
            let { x, y } = p;
            if (p.behind) { x = W - x; y = H - y; }
            let off = p.behind || x < 40 || x > W - 40 || y < 40 || y > H - 40;
            x = Math.max(50, Math.min(W - 50, x));
            y = Math.max(50, Math.min(H - 50, y));
            if (panel && x > panel.x - 40 && x < panel.x + panel.w + 40 && y > panel.y - 40 && y < panel.y + panel.h + 40) {
                x = panel.x + panel.w + 50;
                off = true;
            }
            const turn = Math.atan2(-(mark.x - eye.x), -(mark.z - eye.z)) - i.player.yaw;
            const left = Math.atan2(Math.sin(turn), Math.cos(turn)) > 0;
            node.classList.toggle('is-active', n === tr.active);
            node.classList.toggle('is-edge', off);
            node.classList.toggle('is-left', off && left);
            node.classList.toggle('is-right', off && !left);
            node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        });
    }

    function onWheel(event) {
        if (!tut.active || !tut.step || !tut.step.sens || tut.modal || tut.paused) return;
        event.preventDefault();
        // one step per notch (a notch is ~100 px, or 1-3 lines); a touchpad's small
        // deltas add up to one
        const unit = event.deltaMode === 1 ? 33 : (event.deltaMode === 2 ? 600 : 1);
        tut.wheel = (tut.wheel || 0) + (event.deltaY * unit);
        if (Math.abs(tut.wheel) < 30) return;
        const dir = tut.wheel < 0 ? 1 : -1;   // wheel up: faster
        tut.wheel = 0;
        nudgeSensitivity(dir, 'Wheel');
    }

    function frame(now) {
        tut.rafId = 0;
        if (!tut.active) return;
        const dt = Math.min(0.1, Math.max(0, (now - (tut.lastNow || now)) / 1000));
        tut.lastNow = now;
        tut.rafId = window.requestAnimationFrame(frame);
        tick(dt);
    }

    // One tutorial frame (the rAF loop, or by hand in tests).
    function tick(dt) {
        const step = tut.step;
        if (!step || tut.paused) return;
        let hole = null;
        if (step.kind === 'info' && step.focus) hole = union(step.focus(), 18);
        drawHole(step.kind === 'info' ? hole : null);
        placePanel(hole);
        drawMarker(step);
        if (step.update) {
            const i = info();
            if (i) step.update(i, tut.track, dt);
        }

        if (step.kind === 'do' && step.check && !tut.doneAt) {
            const i = info();
            if (i && step.check(i, tut.track, dt)) {
                tut.doneAt = performance.now();
                tut.layer.classList.add('is-done');
                if (api()) api().setBeacon(null);
                click();
                window.setTimeout(() => {
                    if (tut.active && tut.step === step) advance();
                }, 700);
            }
        }
    }

    // ------------------------------------------------------------ input

    function onKey(event, down) {
        if (!tut.active) return;
        if (tut.layer) {
            tut.layer.querySelectorAll('.tut-key').forEach((cap) => {
                if (cap.dataset.codes.split(' ').includes(event.code)) cap.classList.toggle('is-down', down);
            });
        }
        if (down && event.key === 'Enter' && !tut.modal && tut.step && (tut.step.kind === 'info' || tut.step.confirm)) {
            event.preventDefault();
            event.stopPropagation();
            advance();
            return;
        }
        if (down && tut.step && tut.step.sens && !tut.modal && !tut.paused) {
            const dir = SENS_UP.includes(event.key) || event.code === 'NumpadAdd' ? 1
                : (SENS_DOWN.includes(event.key) || event.code === 'NumpadSubtract' ? -1 : 0);
            if (dir) {
                event.preventDefault();
                nudgeSensitivity(dir);
            }
        }
    }

    function onMouse(event) {
        if (!tut.active || !tut.layer) return;
        tut.layer.querySelectorAll('.tut-key[data-codes=""]').forEach((cap) => {
            cap.classList.add('is-down');
            window.clearTimeout(cap._t);
            cap._t = window.setTimeout(() => cap.classList.remove('is-down'), 180);
        });
        void event;
    }

    // ------------------------------------------------------------ pause / skip

    function setPaused(on) {
        tut.paused = on;
        const a = api();
        if (!a || !tut.step || tut.step.world === false) return;
        a.freeze(on || tut.step.kind === 'info');
    }

    function confirmSkip() {
        setPaused(true);
        showModal({
            className: 'tut-modal--small',
            title: t('tutorial.skip_title'),
            text: t('tutorial.skip_text'),
            buttons: [
                { label: t('tutorial.skip_no'), onClick: () => { closeModal(); setPaused(false); } },
                { label: t('tutorial.skip_yes'), primary: true, onClick: () => { closeModal(); end(tut.origin === 'first'); } }
            ]
        });
    }

    function handlePause() {
        if (!tut.active) return false;
        if (tut.modal) {
            closeModal();
            setPaused(false);
            return true;
        }
        setPaused(true);
        showModal({
            className: 'tut-modal--small',
            title: t('tutorial.paused'),
            buttons: [
                { label: t('tutorial.skip'), onClick: () => { closeModal(); end(tut.origin === 'first'); } },
                { label: t('tutorial.resume'), primary: true, onClick: () => { closeModal(); setPaused(false); } }
            ]
        });
        return true;
    }

    // ------------------------------------------------------------ start / end

    function progress() {
        return typeof window.getTheNunProgress === 'function' ? window.getTheNunProgress() : null;
    }

    function markOffered(done) {
        if (typeof window.updateTheNunProgress === 'function') {
            window.updateTheNunProgress((p) => {
                p.tutorialOffered = true;
                if (done) p.tutorialDone = true;
            });
        }
    }

    function shouldOffer() {
        const p = progress();
        const run = typeof window.getTheNunSavedRun === 'function' ? window.getTheNunSavedRun() : null;
        return Boolean(p) && !p.tutorialOffered && p.runsStarted === 0 && !run
            && Boolean(window.theNun3D && window.theNun3D.isEnabled());
    }

    function offer() {
        showModal({
            className: 'tut-modal--prompt',
            kicker: t('tutorial.prompt_kicker'),
            title: t('tutorial.prompt_title'),
            text: t('tutorial.prompt_text'),
            buttons: [
                {
                    label: t('tutorial.prompt_no'),
                    onClick: () => {
                        closeModal();
                        markOffered(false);
                        if (typeof window.requestTheNunNewRun === 'function') window.requestTheNunNewRun();
                    }
                },
                {
                    label: t('tutorial.prompt_yes'), primary: true, badge: t('tutorial.prompt_recommended'),
                    onClick: () => { closeModal(); start('first'); }
                }
            ]
        });
    }

    function offerReplay() {
        if (!(window.theNun3D && window.theNun3D.isEnabled())) return;
        showModal({
            className: 'tut-modal--prompt',
            kicker: t('tutorial.replay_kicker'),
            title: t('tutorial.prompt_title'),
            text: t('tutorial.replay_text'),
            buttons: [
                { label: t('common.close'), onClick: closeModal },
                { label: t('tutorial.prompt_yes'), primary: true, onClick: () => { closeModal(); start('replay'); } }
            ]
        });
    }

    function start(origin) {
        markOffered(false);
        tut.origin = origin === 'replay' ? 'replay' : 'first';
        tut.active = true;
        tut.paused = false;
        tut.altarSkipped = false;
        if (typeof window.setTheNunPendingRunRestore === 'function') window.setTheNunPendingRunRestore(null);
        if (typeof window.startGame === 'function') window.startGame();
    }

    // main.js beginTheNunVigilSystems: the sandbox vigil is built and running.
    function onVigilBegun() {
        if (!tut.active || !api()) return;
        tut.script = {
            holdNun: true,
            demonOff: true,
            altarLocked: true,
            onNunCatch() {
                const now = performance.now();
                if (now - tut.lastCatch < 1000) return;
                tut.lastCatch = now;
                api().nudgeAhead(8);
                showToast(t('tutorial.caught_retry'));
            },
            onDemonCatch() {
                showToast(t('tutorial.hide_retry'));
                window.setTimeout(() => {
                    if (tut.active && tut.step && tut.step.id === 'hide') api().spawnDemon(1.8);
                }, 2500);
            }
        };
        api().setScript(tut.script);
        buildLayer();
        enterStep(0);
        if (!tut.rafId) {
            tut.lastNow = 0;
            tut.rafId = window.requestAnimationFrame(frame);
        }
    }

    function finish() {
        markOffered(true);
        end(tut.origin === 'first');
    }

    // Leave the sandbox: back to the title, the session reset, then (from the first-run
    // prompt) straight into the first real vigil.
    function end(startRun) {
        if (!tut.active) return;
        closeModal();
        if (tut.rafId) window.cancelAnimationFrame(tut.rafId);
        tut.rafId = 0;
        tut.step = null;
        if (api()) api().setScript(null);
        if (tut.layer) {
            tut.layer.remove();
            tut.layer = null;
        }
        const after = () => {
            if (typeof window.resetNunGameSession === 'function') window.resetNunGameSession();
            tut.active = false;
            if (startRun && typeof window.requestTheNunNewRun === 'function') window.requestTheNunNewRun();
        };
        const back = typeof window.returnToTitleScreen === 'function' ? window.returnToTitleScreen() : null;
        if (back && typeof back.then === 'function') back.then(after, after);
        else after();
    }

    document.addEventListener('keydown', (event) => onKey(event, true), true);
    document.addEventListener('keyup', (event) => onKey(event, false), true);
    document.addEventListener('mousemove', onMouse, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });

    window.isTheNunTutorialActive = () => tut.active;
    window.theNunTutorial = {
        shouldOffer,
        offer,
        offerReplay,
        start,
        onVigilBegun,
        handlePause,
        isActive: () => tut.active,
        // test hooks
        debug: {
            state: tut,
            steps: STEPS,
            tick,
            advance,
            stepId: () => (tut.step ? tut.step.id : null),
            skip: () => end(tut.origin === 'first')
        }
    };
})();
