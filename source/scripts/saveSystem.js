(function() {
    const EMPTY_GALLERY_STATE = {
        currentCategory: 'attack',
        archiveUnlocked: false,
        seenScenes: {
            byKey: {}
        }
    };

    const saveSystemState = {
        initialized: false,
        initializingPromise: null,
        activeSaveFileName: null,
        activeSaveMeta: null,
        writeTimer: null,
        writeInFlight: false,
        writeQueued: false,
        promptVisible: false,
        applyingPayload: false
    };

    function canManageSaveFiles() {
        return Boolean(
            window.electronAPI
            && typeof window.electronAPI.listSaveFiles === 'function'
            && typeof window.electronAPI.readSaveFile === 'function'
            && typeof window.electronAPI.writeSaveFile === 'function'
            && typeof window.electronAPI.renameSaveFile === 'function'
        );
    }

    // Steam build: the save lives ONLY in Steam Cloud under this fixed name; the local
    // multi-file save manager (listing/prompts/rename) is bypassed entirely.
    const STEAM_CLOUD_SAVE_FILE_NAME = 'theNun.saveData';

    function isSteamEdition() {
        try {
            return typeof window.isSteamBuild === 'function' && window.isSteamBuild();
        } catch (error) {
            return false;
        }
    }

    function hasSteamCloudApi() {
        try {
            return Boolean(
                window.electronAPI
                && typeof window.electronAPI.steamSaveToCloud === 'function'
                && typeof window.electronAPI.steamLoadFromCloud === 'function'
            );
        } catch (error) {
            return false;
        }
    }

    // Session state for the Steam Cloud save. Writes stay BLOCKED until the startup read
    // has PROVEN one of two things: it loaded the save, or Steam is sure no save exists.
    // A failed read must never be followed by a write — that is how default state
    // permanently replaces a player's real cloud save (Steam Cloud has no rollback).
    const steamCloudSaveState = {
        status: 'pending',   // 'pending' | 'loaded' | 'empty' | 'blocked'
        reason: null,
        source: null
    };

    // main.js now answers with { status, data?, reason? }. Older/unknown shapes are
    // treated as failures on purpose: a bare null cannot prove the store is empty.
    function normalizeSteamCloudLoadResult(result) {
        if (typeof result === 'string') {
            return result.length > 0
                ? { status: 'ok', data: result }
                : { status: 'error', reason: 'blank-read' };
        }

        if (result && typeof result === 'object' && typeof result.status === 'string') {
            return result;
        }

        return { status: 'error', reason: 'ambiguous-load-result' };
    }

    window.getTheNunSteamSaveStatus = function() {
        return {
            status: steamCloudSaveState.status,
            reason: steamCloudSaveState.reason,
            source: steamCloudSaveState.source,
            writesAllowed: Boolean(saveSystemState.activeSaveFileName)
        };
    };

    function buildSteamCloudSaveMeta() {
        return {
            fileName: STEAM_CLOUD_SAVE_FILE_NAME,
            label: 'Steam Cloud',
            compatible: true
        };
    }

    function getSaveCompatibilityVersion() {
        if (typeof window.getCurrentSaveCompatibilityVersion === 'function') {
            return window.getCurrentSaveCompatibilityVersion();
        }

        return 'base';
    }

    function getActiveEditionKey() {
        if (typeof window.getActiveEditionKey === 'function') {
            return window.getActiveEditionKey();
        }

        return getSaveCompatibilityVersion();
    }

    function encodePayloadToBase64(payload) {
        const json = JSON.stringify(payload || {});
        const bytes = new TextEncoder().encode(json);
        const chunkSize = 0x8000;
        let binary = '';

        for (let index = 0; index < bytes.length; index += chunkSize) {
            const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }

        return window.btoa(binary);
    }

    function isSaveSyncSuppressed() {
        return saveSystemState.applyingPayload === true || window.__theNunApplyingSave === true;
    }

    function getCurrentSettingsSnapshot() {
        if (typeof window.getTheNunPersistedSettings === 'function') {
            return window.getTheNunPersistedSettings();
        }

        return {};
    }

    function getCurrentGallerySnapshot() {
        if (typeof window.getTheNunGallerySaveData === 'function') {
            return window.getTheNunGallerySaveData();
        }

        return EMPTY_GALLERY_STATE;
    }

    function getFreshSettingsSnapshot() {
        if (typeof window.createTheNunFreshSettings === 'function') {
            return window.createTheNunFreshSettings();
        }

        return getCurrentSettingsSnapshot();
    }

    function getFreshGallerySnapshot() {
        if (typeof window.createTheNunFreshGallerySaveData === 'function') {
            return window.createTheNunFreshGallerySaveData();
        }

        return EMPTY_GALLERY_STATE;
    }

    function buildSavePayload(options) {
        const nextOptions = options || {};

        return {
            metadata: {
                appEdition: getActiveEditionKey(),
                saveCompatibilityVersion: getSaveCompatibilityVersion()
            },
            settings: nextOptions.settings || getCurrentSettingsSnapshot(),
            gallery: nextOptions.gallery || getCurrentGallerySnapshot()
        };
    }

    async function refreshSaveListing() {
        const response = await window.electronAPI.listSaveFiles();
        if (!response || !response.success) {
            throw new Error(response && response.error ? response.error : window.t('save.error_list'));
        }

        return Array.isArray(response.saves) ? response.saves : [];
    }

    function isCompatibleSave(entry) {
        return Boolean(entry && entry.compatible && !entry.parseError);
    }

    function isIncompatibleSave(entry) {
        return Boolean(entry && !entry.compatible && !entry.parseError);
    }

    function formatSaveTimestamp(value) {
        if (!value) {
            return 'Unknown date';
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return String(value);
        }

        return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    }

    function getEntryTimestampLabel(entry) {
        const metadata = entry && entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
        return formatSaveTimestamp(metadata.updatedAt || metadata.createdAt || entry.modifiedAt || entry.createdAt);
    }

    function getEntryVersionLabel(entry) {
        const versionKey = entry && (entry.compatibilityVersion || (entry.metadata && entry.metadata.saveCompatibilityVersion));
        if (!versionKey) {
            return window.t('save.unknown_version');
        }

        if (typeof window.getEditionDisplayName === 'function') {
            return window.t('save.version_label', { edition: window.getEditionDisplayName(versionKey) });
        }

        return window.t('save.version_label', {
            edition: `${String(versionKey).charAt(0).toUpperCase()}${String(versionKey).slice(1)}`
        });
    }

    function ensureOverlay() {
        let overlay = document.getElementById('save-manager-overlay');
        if (overlay) {
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.id = 'save-manager-overlay';
        overlay.className = 'save_manager_overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;

        const mountTarget = document.getElementById('app-stage') || document.body;
        mountTarget.appendChild(overlay);
        return overlay;
    }

    function clearOverlay() {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        saveSystemState.promptVisible = false;
    }

    function setOverlayBusy(isBusy) {
        const overlay = ensureOverlay();
        overlay.querySelectorAll('button, input').forEach((element) => {
            element.disabled = isBusy;
        });
        overlay.classList.toggle('is-busy', isBusy);
    }

    function focusRenameInput() {
        window.requestAnimationFrame(() => {
            const input = document.querySelector('#save-manager-overlay .save_manager_rename_input');
            if (!input) {
                return;
            }

            input.focus();
            if (typeof input.select === 'function') {
                input.select();
            }
        });
    }

    function createPopupShell(title, message) {
        const overlay = ensureOverlay();
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        overlay.innerHTML = '';

        const backdrop = document.createElement('div');
        backdrop.className = 'save_manager_backdrop';

        const popup = document.createElement('div');
        popup.className = 'gallery_popup save_manager_popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.setAttribute('aria-label', title);

        const heading = document.createElement('h2');
        heading.textContent = title;

        const body = document.createElement('p');
        body.textContent = message;

        const content = document.createElement('div');
        content.className = 'save_manager_content';

        const actions = document.createElement('div');
        actions.className = 'popup-buttons save_manager_actions';

        popup.appendChild(heading);
        popup.appendChild(body);
        popup.appendChild(content);
        popup.appendChild(actions);
        backdrop.appendChild(popup);
        overlay.appendChild(backdrop);

        saveSystemState.promptVisible = true;
        return { overlay, popup, content, actions };
    }

    function createSaveRow(entry, options) {
        const nextOptions = options || {};
        const isReadonly = nextOptions.readOnly === true;
        const isEditing = nextOptions.renameState && nextOptions.renameState.fileName === entry.fileName;
        const row = document.createElement('div');
        row.className = 'save_manager_row';
        if (isReadonly) {
            row.classList.add('save_manager_row--readonly');
        }

        const main = document.createElement('div');
        main.className = 'save_manager_row_main';

        if (!isReadonly) {
            row.tabIndex = 0;
            row.setAttribute('role', 'radio');
            row.setAttribute('aria-checked', entry.fileName === nextOptions.selectedFileName ? 'true' : 'false');
            row.addEventListener('click', (event) => {
                if (isEditing) {
                    return;
                }

                const interactiveTarget = event.target instanceof Element
                    ? event.target.closest('button, input, textarea, select, a, label')
                    : null;

                if (interactiveTarget) {
                    return;
                }

                nextOptions.onSelect(entry.fileName);
                if (typeof nextOptions.onRowClick === 'function') {
                    nextOptions.onRowClick();
                }
            });
            row.addEventListener('keydown', (event) => {
                if (isEditing) {
                    return;
                }

                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    nextOptions.onSelect(entry.fileName);
                    if (typeof nextOptions.onRowClick === 'function') {
                        nextOptions.onRowClick();
                    }
                }
            });
        }

        if (!isReadonly) {
            const selector = document.createElement('input');
            selector.type = 'radio';
            selector.name = 'the-nun-save-selection';
            selector.value = entry.fileName;
            selector.checked = entry.fileName === nextOptions.selectedFileName;
            selector.addEventListener('change', () => nextOptions.onSelect(entry.fileName));
            main.appendChild(selector);
        }

        const text = document.createElement('div');
        text.className = 'save_manager_row_text';

        if (isEditing) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'save_manager_rename_input';
            input.value = nextOptions.renameState.draftName;
            input.setAttribute('aria-label', window.t('a11y.save_name'));
            input.addEventListener('input', (event) => nextOptions.onRenameDraftChange(event.target.value));
            input.addEventListener('click', (event) => event.stopPropagation());
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    nextOptions.onRenameSubmit(entry);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    nextOptions.onRenameCancel();
                } else {
                    event.stopPropagation();
                }
            });

            const meta = document.createElement('span');
            meta.className = 'save_manager_row_meta';
            meta.textContent = window.t('save.entry_meta', {
                timestamp: getEntryTimestampLabel(entry),
                version: getEntryVersionLabel(entry)
            });

            text.appendChild(input);
            text.appendChild(meta);
        } else {
            const title = document.createElement('span');
            title.className = 'save_manager_row_title';
            title.textContent = entry.fileName.replace(/\.save$/i, '');

            const meta = document.createElement('span');
            meta.className = 'save_manager_row_meta';
            meta.textContent = window.t('save.entry_meta', {
                timestamp: getEntryTimestampLabel(entry),
                version: getEntryVersionLabel(entry)
            });

            text.appendChild(title);
            text.appendChild(meta);
        }

        main.appendChild(text);
        row.appendChild(main);

        if (isEditing) {
            const editActions = document.createElement('div');
            editActions.className = 'save_manager_row_actions';

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'gallery-popup-secondary save_manager_rename';
            cancelButton.textContent = window.t('common.cancel');
            cancelButton.addEventListener('click', () => nextOptions.onRenameCancel());

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'gallery-popup-primary save_manager_rename';
            saveButton.textContent = window.t('save.save_name');
            saveButton.addEventListener('click', () => nextOptions.onRenameSubmit(entry));

            editActions.appendChild(cancelButton);
            editActions.appendChild(saveButton);
            row.appendChild(editActions);
        } else if (typeof nextOptions.onStartRename === 'function') {
            const renameButton = document.createElement('button');
            renameButton.type = 'button';
            renameButton.className = 'gallery-popup-secondary save_manager_rename';
            renameButton.textContent = window.t('common.rename');
            renameButton.addEventListener('click', () => nextOptions.onStartRename(entry));
            row.appendChild(renameButton);
        }

        return row;
    }

    async function applySavePayload(payload) {
        saveSystemState.applyingPayload = true;
        window.__theNunApplyingSave = true;

        try {
            if (typeof window.applyTheNunPersistedSettings === 'function') {
                await window.applyTheNunPersistedSettings(payload && payload.settings ? payload.settings : {});
            }

            if (typeof window.applyTheNunGallerySaveData === 'function') {
                window.applyTheNunGallerySaveData(payload && payload.gallery ? payload.gallery : EMPTY_GALLERY_STATE);
            }

            if (typeof window.resetNunGameSession === 'function') {
                window.resetNunGameSession();
            }

            if (typeof window.updateTheNunStatsPanel === 'function') {
                await window.updateTheNunStatsPanel();
            }
        } finally {
            saveSystemState.applyingPayload = false;
            window.__theNunApplyingSave = false;
        }
    }

    async function persistPayload(payload, fileName) {
        if (isSteamEdition() && hasSteamCloudApi()) {
            const accepted = await window.electronAPI.steamSaveToCloud(
                STEAM_CLOUD_SAVE_FILE_NAME,
                JSON.stringify(payload || {})
            );

            if (!accepted) {
                throw new Error(window.t('save.error_cloud_rejected'));
            }

            saveSystemState.activeSaveFileName = STEAM_CLOUD_SAVE_FILE_NAME;
            saveSystemState.activeSaveMeta = buildSteamCloudSaveMeta();
            return saveSystemState.activeSaveMeta;
        }

        const response = await window.electronAPI.writeSaveFile({
            fileName: fileName || null,
            data: encodePayloadToBase64(payload),
            saveCompatibilityVersion: getSaveCompatibilityVersion()
        });

        if (!response || !response.success || !response.save) {
            throw new Error(response && response.error ? response.error : window.t('save.error_write'));
        }

        saveSystemState.activeSaveFileName = response.save.fileName;
        saveSystemState.activeSaveMeta = response.save;
        return response.save;
    }

    async function createSaveFromCurrentState() {
        return persistPayload(buildSavePayload(), null);
    }

    async function createFreshSave() {
        const payload = buildSavePayload({
            settings: getFreshSettingsSnapshot(),
            gallery: getFreshGallerySnapshot()
        });

        const save = await persistPayload(payload, null);
        await applySavePayload(payload);
        return save;
    }

    async function loadSaveEntry(entry) {
        const response = await window.electronAPI.readSaveFile(entry.fileName);
        if (!response || !response.success || !response.payload || !response.save) {
            throw new Error(response && response.error ? response.error : window.t('save.error_read'));
        }

        if (response.save.compatible !== true) {
            throw new Error(window.t('save.error_incompatible'));
        }

        saveSystemState.activeSaveFileName = response.save.fileName;
        saveSystemState.activeSaveMeta = response.save;
        await applySavePayload(response.payload);
        return response.save;
    }

    function queueSaveWrite() {
        // On Steam the save lives in the cloud, so the local multi-file API is irrelevant:
        // gating on it there would silently kill autosaves if that surface ever changed.
        const canWrite = isSteamEdition() ? hasSteamCloudApi() : canManageSaveFiles();
        if (!saveSystemState.activeSaveFileName || !canWrite || isSaveSyncSuppressed()) {
            return;
        }

        if (saveSystemState.writeInFlight) {
            saveSystemState.writeQueued = true;
            return;
        }

        if (saveSystemState.writeTimer) {
            return;
        }

        saveSystemState.writeTimer = window.setTimeout(async () => {
            saveSystemState.writeTimer = null;
            saveSystemState.writeInFlight = true;

            try {
                await persistPayload(buildSavePayload(), saveSystemState.activeSaveFileName);
            } catch (error) {
                console.warn('Failed to auto-save The Nun save file:', error);
            } finally {
                saveSystemState.writeInFlight = false;
                if (saveSystemState.writeQueued) {
                    saveSystemState.writeQueued = false;
                    queueSaveWrite();
                }
            }
        }, 120);
    }

    async function renameSaveEntry(entry, nextName) {
        const trimmedName = String(nextName || '').trim();
        if (!trimmedName) {
            throw new Error(window.t('save.error_empty_name'));
        }

        const response = await window.electronAPI.renameSaveFile({
            fileName: entry.fileName,
            nextName: trimmedName
        });

        if (!response || !response.success || !response.save) {
            throw new Error(response && response.error ? response.error : window.t('save.error_rename'));
        }

        if (saveSystemState.activeSaveFileName === entry.fileName) {
            saveSystemState.activeSaveFileName = response.save.fileName;
            saveSystemState.activeSaveMeta = response.save;
        }

        return response.save;
    }

    async function openSaveDirectory() {
        if (!window.electronAPI || typeof window.electronAPI.openSaveDirectory !== 'function') {
            throw new Error(window.t('save.error_folder_unavailable'));
        }

        const response = await window.electronAPI.openSaveDirectory();
        if (!response || !response.success) {
            throw new Error(response && response.error ? response.error : window.t('save.error_open_folder'));
        }
    }

    async function showCompatibleSavePrompt(saves) {
        let currentSaves = saves.slice();
        let selectedFileName = currentSaves.filter(isCompatibleSave)[0]?.fileName || null;
        let renameState = {
            fileName: null,
            draftName: ''
        };

        return new Promise((resolve, reject) => {
            const render = () => {
                const compatibleSaves = currentSaves.filter(isCompatibleSave);
                const incompatibleSaves = currentSaves.filter(isIncompatibleSave);

                if (!compatibleSaves.length) {
                    reject(new Error(window.t('save.error_no_compatible')));
                    return;
                }

                if (!compatibleSaves.some((entry) => entry.fileName === selectedFileName)) {
                    selectedFileName = compatibleSaves[0].fileName;
                }

                const { content, actions } = createPopupShell(
                    window.t(compatibleSaves.length > 1 ? 'save.choose_a_save' : 'save.save_found'),
                    compatibleSaves.length > 1
                        ? window.t('save.choose_message')
                        : window.t('save.found_message')
                );

                const list = document.createElement('div');
                list.className = 'save_manager_list';
                compatibleSaves.forEach((entry) => {
                    list.appendChild(createSaveRow(entry, {
                        selectedFileName,
                        renameState,
                        onSelect: (fileName) => {
                            selectedFileName = fileName;
                            render();
                        },
                        onRowClick: render,
                        onStartRename: (targetEntry) => {
                            renameState = {
                                fileName: targetEntry.fileName,
                                draftName: targetEntry.fileName.replace(/\.save$/i, '')
                            };
                            render();
                            focusRenameInput();
                        },
                        onRenameDraftChange: (draftName) => {
                            renameState = {
                                ...renameState,
                                draftName
                            };
                        },
                        onRenameCancel: () => {
                            renameState = { fileName: null, draftName: '' };
                            render();
                        },
                        onRenameSubmit: async (targetEntry) => {
                            setOverlayBusy(true);
                            try {
                                const renamedSave = await renameSaveEntry(targetEntry, renameState.draftName);
                                currentSaves = await refreshSaveListing();
                                if (selectedFileName === targetEntry.fileName) {
                                    selectedFileName = renamedSave.fileName;
                                }
                                renameState = { fileName: null, draftName: '' };
                                render();
                            } catch (error) {
                                window.alert(error && error.message ? error.message : window.t('save.error_rename'));
                            } finally {
                                setOverlayBusy(false);
                            }
                        }
                    }));
                });
                content.appendChild(list);

                if (incompatibleSaves.length) {
                    const note = document.createElement('p');
                    note.className = 'save_manager_note';
                    note.textContent = window.t('save.other_files_note', { count: incompatibleSaves.length });
                    content.appendChild(note);
                }

                const openFolderButton = document.createElement('button');
                openFolderButton.type = 'button';
                openFolderButton.className = 'gallery-popup-secondary save_manager_folder_button';
                openFolderButton.textContent = window.t('save.open_saves_folder');
                openFolderButton.addEventListener('click', async () => {
                    setOverlayBusy(true);
                    try {
                        await openSaveDirectory();
                    } catch (error) {
                        window.alert(error && error.message ? error.message : window.t('save.error_open_folder'));
                    } finally {
                        setOverlayBusy(false);
                    }
                });

                const newGameButton = document.createElement('button');
                newGameButton.type = 'button';
                newGameButton.className = 'gallery-popup-secondary';
                newGameButton.textContent = window.t('save.start_new_game');
                newGameButton.addEventListener('click', async () => {
                    setOverlayBusy(true);
                    try {
                        await createFreshSave();
                        clearOverlay();
                        resolve();
                    } catch (error) {
                        window.alert(error && error.message ? error.message : window.t('save.error_create'));
                        setOverlayBusy(false);
                    }
                });

                const loadButton = document.createElement('button');
                loadButton.type = 'button';
                loadButton.className = 'gallery-popup-primary';
                loadButton.textContent = window.t('save.load_selected');
                loadButton.addEventListener('click', async () => {
                    const selectedEntry = compatibleSaves.find((entry) => entry.fileName === selectedFileName);
                    if (!selectedEntry) {
                        return;
                    }

                    setOverlayBusy(true);
                    try {
                        await loadSaveEntry(selectedEntry);
                        clearOverlay();
                        resolve();
                    } catch (error) {
                        window.alert(error && error.message ? error.message : window.t('save.error_load_selected'));
                        setOverlayBusy(false);
                    }
                });

                actions.appendChild(openFolderButton);
                actions.appendChild(newGameButton);
                actions.appendChild(loadButton);
            };

            render();
        });
    }

    async function showIncompatibleSavePrompt(saves) {
        let currentSaves = saves.slice();
        let renameState = {
            fileName: null,
            draftName: ''
        };

        return new Promise((resolve) => {
            const render = () => {
                const incompatibleSaves = currentSaves.filter(isIncompatibleSave);
                const { content, actions } = createPopupShell(
                    window.t('save.incompatible_title'),
                    window.t('save.incompatible_message')
                );

                const list = document.createElement('div');
                list.className = 'save_manager_list save_manager_list--readonly';

                incompatibleSaves.forEach((entry) => {
                    list.appendChild(createSaveRow(entry, {
                        readOnly: true,
                        renameState,
                        onStartRename: (targetEntry) => {
                            renameState = {
                                fileName: targetEntry.fileName,
                                draftName: targetEntry.fileName.replace(/\.save$/i, '')
                            };
                            render();
                            focusRenameInput();
                        },
                        onRenameDraftChange: (draftName) => {
                            renameState = {
                                ...renameState,
                                draftName
                            };
                        },
                        onRenameCancel: () => {
                            renameState = { fileName: null, draftName: '' };
                            render();
                        },
                        onRenameSubmit: async (targetEntry) => {
                            setOverlayBusy(true);
                            try {
                                await renameSaveEntry(targetEntry, renameState.draftName);
                                currentSaves = await refreshSaveListing();
                                renameState = { fileName: null, draftName: '' };
                                render();
                            } catch (error) {
                                window.alert(error && error.message ? error.message : window.t('save.error_rename'));
                            } finally {
                                setOverlayBusy(false);
                            }
                        }
                    }));
                });

                content.appendChild(list);

                const openFolderButton = document.createElement('button');
                openFolderButton.type = 'button';
                openFolderButton.className = 'gallery-popup-secondary save_manager_folder_button';
                openFolderButton.textContent = window.t('save.open_saves_folder');
                openFolderButton.addEventListener('click', async () => {
                    setOverlayBusy(true);
                    try {
                        await openSaveDirectory();
                    } catch (error) {
                        window.alert(error && error.message ? error.message : window.t('save.error_open_folder'));
                    } finally {
                        setOverlayBusy(false);
                    }
                });

                const createButton = document.createElement('button');
                createButton.type = 'button';
                createButton.className = 'gallery-popup-primary';
                createButton.textContent = window.t('save.start_new_game');
                createButton.addEventListener('click', async () => {
                    setOverlayBusy(true);
                    try {
                        await createFreshSave();
                        clearOverlay();
                        resolve();
                    } catch (error) {
                        window.alert(error && error.message ? error.message : window.t('save.error_create'));
                        setOverlayBusy(false);
                    }
                });

                actions.appendChild(openFolderButton);
                actions.appendChild(createButton);
            };

            render();
        });
    }

    window.requestTheNunSaveWrite = function() {
        queueSaveWrite();
    };

    // Autosaves are debounced, so quitting can drop the last change. Flush any pending or
    // in-flight write before the window closes.
    window.flushTheNunSaveWrite = async function() {
        if (!saveSystemState.activeSaveFileName || isSaveSyncSuppressed()) {
            return false;
        }

        if (saveSystemState.writeTimer) {
            window.clearTimeout(saveSystemState.writeTimer);
            saveSystemState.writeTimer = null;
        }

        try {
            await persistPayload(buildSavePayload(), saveSystemState.activeSaveFileName);
            return true;
        } catch (error) {
            console.warn('Failed to flush The Nun save file on exit:', error);
            return false;
        }
    };

    window.isTheNunSaveSyncSuppressed = function() {
        return isSaveSyncSuppressed();
    };

    window.isTheNunSavePromptVisible = function() {
        return saveSystemState.promptVisible;
    };

    window.getActiveTheNunSaveFileName = function() {
        return saveSystemState.activeSaveFileName;
    };

    // Closing the window must not drop the debounced autosave. Main holds the window
    // open until notifyAppClosingSaved() comes back.
    if (window.electronAPI && typeof window.electronAPI.onAppClosing === 'function') {
        window.electronAPI.onAppClosing(async function() {
            try {
                await window.flushTheNunSaveWrite();
            } catch (error) {
                console.warn('Failed to flush the save while closing:', error);
            } finally {
                if (typeof window.electronAPI.notifyAppClosingSaved === 'function') {
                    window.electronAPI.notifyAppClosingSaved();
                }
            }
        });
    }

    window.initializeTheNunSaveManager = async function() {
        if (saveSystemState.initializingPromise) {
            return saveSystemState.initializingPromise;
        }

        saveSystemState.initializingPromise = (async function() {
            // Steam build: silently load the Steam Cloud save or start fresh — never show
            // the save-manager prompts. A save is only ever WRITTEN after a load provably
            // succeeded or the cloud store is provably empty (a failed read must not lead
            // to defaults overwriting the player's real cloud save).
            if (isSteamEdition()) {
                if (!hasSteamCloudApi()) {
                    steamCloudSaveState.status = 'blocked';
                    steamCloudSaveState.reason = 'no-steam-cloud-api';
                } else {
                    try {
                        const cloudResult = normalizeSteamCloudLoadResult(
                            await window.electronAPI.steamLoadFromCloud(STEAM_CLOUD_SAVE_FILE_NAME)
                        );

                        if (cloudResult.status === 'ok') {
                            // Parse BEFORE claiming the save slot: an unparseable payload must
                            // leave autosaves disabled rather than overwrite the real save.
                            const payload = JSON.parse(cloudResult.data);
                            saveSystemState.activeSaveFileName = STEAM_CLOUD_SAVE_FILE_NAME;
                            saveSystemState.activeSaveMeta = buildSteamCloudSaveMeta();
                            steamCloudSaveState.status = 'loaded';
                            steamCloudSaveState.source = cloudResult.source || 'steam-cloud';
                            await applySavePayload(payload);
                        } else if (cloudResult.status === 'empty') {
                            // Steam PROVED there is no save yet: a genuine first run, so it is
                            // safe to create the initial cloud save.
                            steamCloudSaveState.status = 'empty';
                            steamCloudSaveState.source = cloudResult.source || 'steam-cloud';
                            await persistPayload(buildSavePayload(), null);
                        } else {
                            // The read FAILED. Leave no active save so autosaves stay disabled
                            // this session instead of overwriting the real cloud save.
                            steamCloudSaveState.status = 'blocked';
                            steamCloudSaveState.reason = cloudResult.reason || 'cloud-read-failed';
                            console.error(
                                `[steam] Steam Cloud could not be read (${steamCloudSaveState.reason}). ` +
                                'Saving is disabled this session so the existing cloud save is not overwritten.'
                            );
                            // Show the local mirror's progress anyway (read-only: no active
                            // save file is claimed, so nothing is written this session).
                            if (typeof cloudResult.mirrorData === 'string' && cloudResult.mirrorData.length > 0) {
                                try {
                                    await applySavePayload(JSON.parse(cloudResult.mirrorData));
                                    steamCloudSaveState.source = 'local-mirror-readonly';
                                } catch (mirrorError) {
                                    console.error('[steam] Local save mirror unreadable:', mirrorError);
                                }
                            }
                        }
                    } catch (error) {
                        // Parse failure or initial write failure: same rule, no writes.
                        saveSystemState.activeSaveFileName = null;
                        saveSystemState.activeSaveMeta = null;
                        steamCloudSaveState.status = 'blocked';
                        steamCloudSaveState.reason = String(error && error.message ? error.message : error);
                        console.error('[steam] Steam Cloud save unavailable this session; saving is disabled:', error);
                    }
                }

                saveSystemState.initialized = true;
                return;
            }

            if (!canManageSaveFiles()) {
                saveSystemState.initialized = true;
                return;
            }

            const saves = await refreshSaveListing();
            const compatibleSaves = saves.filter(isCompatibleSave);
            const incompatibleSaves = saves.filter(isIncompatibleSave);

            if (!compatibleSaves.length && !incompatibleSaves.length) {
                await createSaveFromCurrentState();
                saveSystemState.initialized = true;
                return;
            }

            if (compatibleSaves.length) {
                await showCompatibleSavePrompt(saves);
            } else {
                await showIncompatibleSavePrompt(incompatibleSaves);
            }

            saveSystemState.initialized = true;
        })().catch((error) => {
            console.warn('Failed to initialize The Nun save manager:', error);
            saveSystemState.initialized = true;
        });

        return saveSystemState.initializingPromise;
    };
})();
