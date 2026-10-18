const express = require('express');
const fs = require('fs');
const { describeRestStatus } = require('../managers/rest');
function createDashboardRoutes({ configManager, fileService, profileManager, uiComponents, logService, statsService, discordProfileService, state, logger }) {
    const router = express.Router();

    const dashboardLog = (level, accountId, message) => {
        const target = logger && typeof logger[level] === 'function' ? logger[level] : logger?.info;
        if (!target) return;
        const prefix = accountId ? `[account:${accountId}] ` : '';
        target(`${prefix}${message}`);
    };


    const getProfileConfigByAccountId = (accountId) => {
        const id = String(accountId || '');
        const mainConfig = configManager.ensureShape(configManager.get());
        const mainId = profileManager.getUserId(mainConfig.token);
        if (id === mainId) {
            return { config: mainConfig, saveTarget: 'main', filePath: null };
        }

        const profilePath = profileManager.getProfilePath(id);
        if (!fs.existsSync(profilePath)) return null;
        return {
            config: configManager.ensureShape(fileService.readJson(profilePath)),
            saveTarget: profilePath,
            filePath: profilePath
        };
    };

    const saveAccountConfig = (target, config) => {
        if (!target) return false;
        const saved = target.saveTarget === 'main'
            ? configManager.save(config)
            : fileService.writeJson(target.saveTarget, config);
        if (saved && target.saveTarget === 'main') {
            const activeId = profileManager.getUserId(config.token);
            if (activeId !== 'default') {
                fileService.writeJson(profileManager.getProfilePath(activeId), config);
            }
        }
        return saved;
    };

    const setAccountStatus = (accountId, shouldRun) => {
        const target = getProfileConfigByAccountId(accountId);
        if (!target) return false;
        target.config.botStatus = { running: !!shouldRun, paused: !shouldRun };
        const saved = saveAccountConfig(target, target.config);
        if (saved) dashboardLog('info', accountId, `🔁 Status config akun diubah dari dashboard: running=${!!shouldRun}, paused=${!shouldRun}`);
        const manager = state?.multiAccountManager;
        if (manager) {
            if (typeof manager.reconcile === 'function') manager.reconcile();
            if (shouldRun && typeof manager.startAccount === 'function') manager.startAccount(accountId);
            if (!shouldRun && typeof manager.pauseAccount === 'function') manager.pauseAccount(accountId);
        }
        return saved;
    };


    const connectAccount = (accountId) => {
        const target = getProfileConfigByAccountId(accountId);
        if (!target) return false;
        target.config.botStatus = { running: false, paused: true };
        const saved = saveAccountConfig(target, target.config);
        if (saved) dashboardLog('info', accountId, '🔌 Config akun disiapkan untuk connect/login dari dashboard.');
        const manager = state?.multiAccountManager;
        if (manager) {
            if (typeof manager.connectAccount === 'function') return manager.connectAccount(accountId) && saved;
            if (typeof manager.reconcile === 'function') manager.reconcile();
        }
        return saved;
    };

    const logoutAccount = (accountId = '') => {
        const targetId = String(accountId || '');
        if (!targetId) return false;
        const manager = state?.multiAccountManager;
        if (!manager || typeof manager.logoutAccount !== 'function') return false;
        const loggedOut = manager.logoutAccount(targetId);
        dashboardLog(loggedOut ? 'success' : 'warn', targetId, loggedOut ? '🚪 Logout diminta dari dashboard; client Discord dihancurkan.' : '⚠️ Logout gagal: runtime akun belum ditemukan.');
        return loggedOut;
    };

    const joinVoice = (accountId = '') => {
        const manager = state?.multiAccountManager;
        if (!manager) return false;

        if (accountId) {
            if (typeof manager.reconcile === 'function') manager.reconcile();
            const joined = typeof manager.joinVoiceAccount === 'function' && manager.joinVoiceAccount(accountId);
            dashboardLog(joined ? 'success' : 'warn', accountId, joined ? '🔊 Join Voice diminta dari dashboard.' : '⚠️ Join Voice gagal: akun belum ready atau VC belum valid.');
            return joined;
        }

        if (typeof manager.reconcile === 'function') manager.reconcile();
        const joinedCount = typeof manager.joinVoiceAll === 'function' ? manager.joinVoiceAll() : 0;
        dashboardLog(joinedCount > 0 ? 'success' : 'warn', '', joinedCount > 0 ? `🔊 Join Voice dikirim ke ${joinedCount} akun ready.` : '⚠️ Tidak ada akun ready untuk Join Voice.');
        return joinedCount > 0;
    };

    const setAllAccountStatuses = (shouldRun) => {
        const mainConfig = configManager.ensureShape(configManager.get());
        const ids = new Set(profileManager.getSavedProfiles());
        const mainId = profileManager.getUserId(mainConfig.token);
        let saved = true;
        if (mainId !== 'default') ids.add(mainId);
        if (!ids.size) {
            mainConfig.botStatus = { running: !!shouldRun, paused: !shouldRun };
            saved = configManager.save(mainConfig);
        }
        ids.forEach(id => {
            saved = setAccountStatus(id, shouldRun) && saved;
        });
        const manager = state?.multiAccountManager;
        if (manager && typeof manager.reconcile === 'function') manager.reconcile();
        return saved;
    };

    router.get('/api/profile', async (req, res) => {
        const config = configManager.get();
        let token = config.token;

        if (req.query.profileId) {
            const profilePath = profileManager.getProfilePath(String(req.query.profileId));
            if (fs.existsSync(profilePath)) {
                const profileConfig = fileService.readJson(profilePath);
                token = profileConfig.token || token;
            }
        }
        
        if (!token) return res.status(400).json({ error: 'Tidak ada token.' });

        try {
            const parsedData = await discordProfileService.fetchCurrentProfile(token);
            if (parsedData && parsedData.id && parsedData.username) {
                profileManager.saveProfileMeta(
                    parsedData.id,
                    parsedData.username,
                    parsedData.global_name,
                    parsedData.avatar
                );
            }
            res.json(parsedData);
        } catch (error) {
            console.error('API Profile Error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/', (req, res) => {
        console.log('[DASHBOARD] GET / - Rendering dashboard');
        try {
            let config = configManager.ensureShape(configManager.get());
            if (req.query.profileId) {
                const profilePath = profileManager.getProfilePath(String(req.query.profileId));
                if (fs.existsSync(profilePath)) {
                    config = configManager.ensureShape(fileService.readJson(profilePath));
                    config.viewingProfileId = String(req.query.profileId);
                    config.globalBotStatus = configManager.ensureShape(configManager.get()).botStatus;
                }
            }
            const html = uiComponents.renderPage(config);
            console.log('[DASHBOARD] Dashboard HTML generated, size:', html.length, 'bytes');
            res.send(html);
        } catch (error) {
            console.error('[DASHBOARD] Error rendering dashboard:', error);
            res.status(500).send(`<pre>Error: ${error.message}\n${error.stack}</pre>`);
        }
    });

    router.get('/logs', (req, res) => {
        try {
            let accountId = req.query.accountId ? String(req.query.accountId) : '';
            if (!accountId && req.query.profileId) accountId = String(req.query.profileId);
            const baseConfig = configManager.ensureShape(configManager.get());
            const lines = logService.getRecentLines({ accountId, limit: baseConfig.maxLogLines || 20 });
            res.setHeader('Cache-Control', 'no-store');
            res.json({ lines, accountId: accountId || null, filterMode: accountId ? 'prefix-or-id' : 'all' });
        } catch {
            res.status(500).json({ lines: [] });
        }
    });

    router.get('/api/message-debug', (req, res) => {
        const accountId = String(req.query.profileId || '');
        const runtime = accountId
            ? state?.multiAccountManager?.getRuntime?.(accountId)
            : Array.from(state?.accountRuntimes?.values?.() || [])[0];
        const entries = Array.isArray(runtime?.state?.messageDebugEntries)
            ? runtime.state.messageDebugEntries
            : [];
        res.setHeader('Cache-Control', 'no-store');
        res.json({ entries });
    });

    router.get('/api/rest-status', (req, res) => {
        const accountId = String(req.query.profileId || '');
        const runtimes = Array.from(state?.accountRuntimes?.values?.() || []);
        const accounts = runtimes
            .filter(runtime => !accountId || String(runtime.accountId) === accountId)
            .filter(runtime => typeof runtime.getRestStatus === 'function')
            .map(runtime => {
                const status = runtime.getRestStatus();
                return {
                    accountId: runtime.accountId,
                    name: typeof runtime.getDisplayName === 'function' ? runtime.getDisplayName() : runtime.accountId,
                    status,
                    lines: describeRestStatus(status)
                };
            });
        res.setHeader('Cache-Control', 'no-store');
        res.json({ accounts });
    });

    router.post('/api/message-debug/clear', (req, res) => {
        const accountId = String(req.body?.profileId || '');
        const runtime = accountId
            ? state?.multiAccountManager?.getRuntime?.(accountId)
            : Array.from(state?.accountRuntimes?.values?.() || [])[0];
        if (!runtime?.state) return res.status(404).json({ success: false, message: 'Runtime akun tidak ditemukan' });

        runtime.state.messageDebugEntries = [];
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true });
    });

    router.post('/account/:accountId/connect', (req, res) => {
        const accountId = String(req.params.accountId || '');
        const connected = connectAccount(accountId);
        if (!connected) return res.status(404).send('Account not found');
        res.redirect(req.get('referer') || `/?profileId=${encodeURIComponent(accountId)}`);
    });

    router.post('/account/:accountId/start', (req, res) => {
        const accountId = String(req.params.accountId || '');
        const saved = setAccountStatus(accountId, true);
        if (!saved) return res.status(404).send('Account not found');
        res.redirect(req.get('referer') || `/?profileId=${encodeURIComponent(accountId)}`);
    });

    router.post('/account/:accountId/pause', (req, res) => {
        const accountId = String(req.params.accountId || '');
        const saved = setAccountStatus(accountId, false);
        if (!saved) return res.status(404).send('Account not found');
        res.redirect(req.get('referer') || `/?profileId=${encodeURIComponent(accountId)}`);
    });

    router.get('/api/stats', (req, res) => {
        try {
            let config = configManager.ensureShape(configManager.get());
            if (req.query.profileId) {
                const profilePath = profileManager.getProfilePath(String(req.query.profileId));
                if (fs.existsSync(profilePath)) {
                    config = configManager.ensureShape(fileService.readJson(profilePath));
                }
            }
            const snapshot = statsService.getSnapshot(config);
            snapshot.captcha.lastDetectedAtFormatted = statsService.formatTime(snapshot.captcha.lastDetectedAt);
            snapshot.captcha.lastSolvedAtFormatted = statsService.formatTime(snapshot.captcha.lastSolvedAt);
            snapshot.commands.recent = (snapshot.commands.recent || []).map(item => ({
                ...item,
                atFormatted: statsService.formatTime(item.at)
            }));
            res.setHeader('Cache-Control', 'no-store');
            res.json(snapshot);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/export-config', (req, res) => {
        try {
            const config = configManager.ensureShape(configManager.get());
            const activeId = profileManager.getUserId(config.token);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `owo-config-${activeId}-${timestamp}.json`;

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Cache-Control', 'no-store');
            res.send(JSON.stringify(config, null, 2));
        } catch (error) {
            res.status(500).send(`Failed to export config: ${error.message}`);
        }
    });

    router.post('/save', (req, res) => {
        try {
            // Some reverse proxies strip X-Requested-With. The dashboard also
            // explicitly asks for JSON, so accept that as the AJAX contract.
            const isAjax = req.get('X-Requested-With') === 'XMLHttpRequest'
                || String(req.get('Accept') || '').includes('application/json');
            const body = req.body || {};
            const respondSuccess = (message) => isAjax
                ? res.json({ success: true, message })
                : res.send(uiComponents.getSavedResponse());
            const respondError = (status, message) => isAjax
                ? res.status(status).json({ success: false, message })
                : res.status(status).send(message);
            
            if (body.action === 'loadProfile') {
                const targetId = body.selectedProfile;
                if (!targetId) return respondError(400, 'Profile must be selected');
                const profilePath = profileManager.getProfilePath(targetId);
                if (!fs.existsSync(profilePath)) return respondError(404, 'Profile not found');
                const loadedConfig = fileService.readJson(profilePath);
                if (!configManager.save(loadedConfig)) return respondError(500, 'Failed to load profile configuration');
                dashboardLog('success', targetId, '📂 Profil akun berhasil dimuat ke config utama.');
                return respondSuccess('Profile configuration loaded');
            }

            if (body.action === 'addSlot' || body.action === 'removeSlot') {
                const mainConfig = configManager.ensureShape(configManager.get());
                const currentSlots = Math.max(0, Math.min(4, parseInt(mainConfig.multiAccount?.maxAccounts, 10) || 0));
                const delta = body.action === 'addSlot' ? 1 : -1;
                mainConfig.multiAccount = mainConfig.multiAccount || {};
                mainConfig.multiAccount.enabled = true;
                mainConfig.multiAccount.maxAccounts = Math.max(0, Math.min(4, currentSlots + delta));
                if (configManager.save(mainConfig)) {
                    const icon = delta > 0 ? '➕' : '➖';
                    const verb = delta > 0 ? 'ditambah' : 'dikurangi';
                    dashboardLog('success', '', `${icon} Slot akun paralel ${verb} menjadi ${mainConfig.multiAccount.maxAccounts}/4.`);
                    const manager = state?.multiAccountManager;
                    if (manager && typeof manager.reconcile === 'function') manager.reconcile();
                    return respondSuccess('Account slot updated');
                }
                return respondError(500, 'Failed to update account slot');
            }

            if (body.action === 'newProfile') {
                const newToken = body.newToken;
                if (!newToken) return respondError(400, 'Token is required');
                if (newToken) {
                    const existingProfiles = new Set(profileManager.getSavedProfiles());
                    const targetId = profileManager.getUserId(newToken);
                    if (targetId === 'default') {
                        return respondError(400, 'Token akun tidak valid: user ID Discord tidak dapat diekstrak');
                    }
                    if (!existingProfiles.has(targetId) && existingProfiles.size >= 4) {
                        dashboardLog('warn', targetId, '⚠️ Slot akun penuh: maksimal 4 token/slot.');
                        return respondError(409, 'Account slots are full');
                    }

                    const profilePath = profileManager.getProfilePath(targetId);
                    const currentConfig = configManager.ensureShape(configManager.get());
                    const isTokenUpdate = existingProfiles.has(targetId);
                    // A rotated token still belongs to the same Discord account. In that
                    // case, keep the account's saved configuration instead of replacing it
                    // with the control-panel/template configuration.
                    const savedProfile = isTokenUpdate
                        ? configManager.ensureShape(fileService.readJson(profilePath))
                        : currentConfig;
                    const newConfig = JSON.parse(JSON.stringify(savedProfile));
                    newConfig.token = newToken;
                    newConfig.multiAccount = newConfig.multiAccount || {};
                    newConfig.multiAccount.enabled = true;
                    delete newConfig.viewingProfileId;
                    
                    if (!fileService.writeJson(profilePath, newConfig)) {
                        return respondError(500, 'Failed to save new account configuration');
                    }

                    const slotCount = Math.min(4, new Set([...existingProfiles, targetId]).size);
                    const mainConfig = configManager.ensureShape(configManager.get());
                    mainConfig.multiAccount = mainConfig.multiAccount || {};
                    mainConfig.multiAccount.enabled = true;
                    mainConfig.multiAccount.maxAccounts = slotCount;
                    if (!configManager.save(mainConfig)) {
                        return respondError(500, 'Failed to update account slots');
                    }

                    dashboardLog('success', targetId, isTokenUpdate
                        ? '🔄 Token akun diperbarui; konfigurasi akun yang tersimpan tetap digunakan.'
                        : `➕ Token ditambahkan sebagai slot baru (${slotCount}/4). Tersisa ${4 - slotCount} slot lagi.`);
                    const manager = state?.multiAccountManager;
                    if (manager && typeof manager.reconcile === 'function') manager.reconcile();
                }
                return respondSuccess('Account profile saved');
            }

            if (body.profileAction) {
                const [action, accountId] = String(body.profileAction).split(':');
                if (accountId && (action === 'connect' || action === 'start' || action === 'pause')) {
                    const target = getProfileConfigByAccountId(accountId);
                    if (!target) {
                        return res.status(404).json({ success: false, message: 'Account not found' });
                    }

                    target.config = configManager.applySave(target.config, body);
                    const saved = saveAccountConfig(target, target.config);
                    if (!saved) {
                        return res.status(500).json({ success: false, message: 'Failed to save account configuration' });
                    }

                    const completed = action === 'connect'
                        ? connectAccount(accountId)
                        : setAccountStatus(accountId, action === 'start');
                    if (!completed) return respondError(500, 'Account action could not be completed');
                    return respondSuccess('Account configuration saved and action completed');
                }
                if (accountId && action === 'logout') {
                    if (!logoutAccount(accountId)) return respondError(404, 'Account runtime not found');
                    return respondSuccess('Account logged out');
                }
                if (accountId && action === 'delete') {
                    logoutAccount(accountId);
                    const removed = profileManager.deleteProfile(accountId);
                    const remainingProfiles = profileManager.getSavedProfiles();
                    const mainConfig = configManager.ensureShape(configManager.get());
                    mainConfig.multiAccount = mainConfig.multiAccount || {};
                    mainConfig.multiAccount.enabled = true;
                    mainConfig.multiAccount.maxAccounts = Math.min(4, remainingProfiles.length);
                    if (!configManager.save(mainConfig)) return respondError(500, 'Failed to update account slots');
                    dashboardLog(removed ? 'success' : 'warn', accountId, removed
                        ? `🗑 Slot akun dihapus. Slot aktif sekarang ${mainConfig.multiAccount.maxAccounts}/4, tersisa ${4 - mainConfig.multiAccount.maxAccounts} slot.`
                        : '⚠️ Hapus slot gagal: profil akun tidak ditemukan.');
                    const manager = state?.multiAccountManager;
                    if (manager && typeof manager.reconcile === 'function') manager.reconcile();
                    return removed
                        ? respondSuccess('Account profile deleted')
                        : respondError(404, 'Account profile not found');
                }
            }

            const viewingProfileId = body.viewingProfileId ? String(body.viewingProfileId) : '';
            if (viewingProfileId && (body.action === 'connectProfile' || body.action === 'startProfile' || body.action === 'pauseProfile')) {
                const target = getProfileConfigByAccountId(viewingProfileId);
                if (!target) {
                    return res.status(404).json({ success: false, message: 'Account not found' });
                }

                target.config = configManager.applySave(target.config, body);
                const saved = saveAccountConfig(target, target.config);
                if (!saved) {
                    return res.status(500).json({ success: false, message: 'Failed to save account configuration' });
                }

                const completed = body.action === 'connectProfile'
                    ? connectAccount(viewingProfileId)
                    : setAccountStatus(viewingProfileId, body.action === 'startProfile');
                if (!completed) return respondError(500, 'Account action could not be completed');
                return respondSuccess('Account configuration saved and action completed');
            }

            if (viewingProfileId && body.action === 'logoutProfile') {
                if (!logoutAccount(viewingProfileId)) return respondError(404, 'Account runtime not found');
                return respondSuccess('Account logged out');
            }

            if (body.action === 'joinVoice') {
                const targetId = viewingProfileId;
                const target = targetId ? getProfileConfigByAccountId(targetId) : null;
                let config = target ? target.config : configManager.ensureShape(configManager.get());
                config = configManager.applySave(config, body);
                const saved = target ? saveAccountConfig(target, config) : configManager.save(config);
                if (saved && !target) {
                    const activeId = profileManager.getUserId(config.token);
                    if (activeId !== 'default') fileService.writeJson(profileManager.getProfilePath(activeId), config);
                }
                if (!saved) return respondError(500, 'Failed to save account configuration');
                if (!joinVoice(targetId)) return respondError(409, 'Voice action could not be completed');
                return respondSuccess('Configuration saved and voice action completed');
            }

            const isGlobalAction = body.action === 'start' || body.action === 'pause';
            let config;
            let saveTarget = 'main';

            if (viewingProfileId && !isGlobalAction) {
                const profilePath = profileManager.getProfilePath(viewingProfileId);
                config = configManager.ensureShape(fs.existsSync(profilePath) ? fileService.readJson(profilePath) : configManager.get());
                config = configManager.applySave(config, body);
                config = configManager.applyAction(config, body.action);
                saveTarget = profilePath;
            } else {
                config = configManager.ensureShape(configManager.get());
                if (!isGlobalAction) {
                    config = configManager.applySave(config, body);
                    config = configManager.applyAction(config, body.action);
                } else {
                    // Save any configuration changes submitted together with START/PAUSE
                    // before changing the runtime status of all accounts.
                    config = configManager.applySave(config, body);
                    const saved = configManager.save(config);
                    if (!saved) {
                        return res.status(500).json({ success: false, message: 'Failed to save configuration' });
                    }

                    if (!setAllAccountStatuses(body.action === 'start')) {
                        return respondError(500, 'Configuration saved, but the account action failed');
                    }
                    return isAjax
                        ? res.json({ success: true, message: 'Configuration saved and action completed' })
                        : res.send(uiComponents.getSavedResponse());
                }
            }
            
            const saved = saveTarget === 'main'
                ? configManager.save(config)
                : fileService.writeJson(saveTarget, config);
            const savedAccountId = viewingProfileId || profileManager.getUserId(config.token);
            if (saved) dashboardLog('success', savedAccountId !== 'default' ? savedAccountId : '', `💾 Config dashboard disimpan (${saveTarget === 'main' ? 'main' : 'profile'}).`);

            if (saved) {
                const otherCommandAction = /^other(Command)?(Start|Stop)([1-3])$/.exec(String(body.action || ''));
                if (otherCommandAction) {
                    const index = Number(otherCommandAction[3]) - 1;
                    const manager = state?.multiAccountManager;
                    if (manager) {
                        const actionMethod = otherCommandAction[2] === 'Start' ? 'startOtherCommand' : 'stopOtherCommand';
                        const acted = typeof manager[actionMethod] === 'function' && manager[actionMethod](savedAccountId, index);
                        dashboardLog(acted ? 'info' : 'warn', savedAccountId !== 'default' ? savedAccountId : '', acted
                            ? `🧩 Other Command ${index + 1} ${otherCommandAction[2] === 'Start' ? 'dimulai' : 'dihentikan'} tanpa memengaruhi START Global.`
                            : `⚠️ Other Command ${index + 1} tidak dapat ${otherCommandAction[2] === 'Start' ? 'dimulai' : 'dihentikan'}: runtime akun belum tersedia.`);
                    }
                }
                const adventureAction = /^adventure(Start|Stop)$/.exec(String(body.action || ''));
                if (adventureAction) {
                    const manager = state?.multiAccountManager;
                    const actionMethod = adventureAction[1] === 'Start' ? 'startAdventure' : 'stopAdventure';
                    const acted = typeof manager?.[actionMethod] === 'function' && manager[actionMethod](savedAccountId);
                    dashboardLog(acted ? 'info' : 'warn', savedAccountId !== 'default' ? savedAccountId : '', acted
                        ? `🗺️ Auto Adventure ${adventureAction[1] === 'Start' ? 'diaktifkan' : 'dinonaktifkan'}.`
                        : `⚠️ Auto Adventure tidak dapat ${adventureAction[1] === 'Start' ? 'diaktifkan' : 'dinonaktifkan'}: runtime akun belum tersedia.`);
                }
                if (saveTarget === 'main') {
                    const activeId = profileManager.getUserId(config.token);
                    if (activeId !== 'default') {
                        fileService.writeJson(profileManager.getProfilePath(activeId), config);
                    }
                }
                if (isAjax) {
                    return res.json({ success: true, message: 'Configuration saved' });
                }
                res.send(uiComponents.getSavedResponse());
            } else {
                return respondError(500, 'Failed to save configuration');
            }
        } catch (error) {
            dashboardLog('error', '', `❌ Error saving config: ${error.message}`);
            return respondError(500, error.message || 'Internal Server Error');
        }
    });

    return router;
}

module.exports = createDashboardRoutes;