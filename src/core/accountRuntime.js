const path = require('path');
const fs = require('fs');

const createTelegramService = require('../services/telegram');
const createMacrodroidService = require('../services/macrodroidService');
const createChannelManager = require('../managers/channel');
const createBossManager = require('../managers/boss');
const createBoss2Manager = require('../managers/boss2');
const { normalizeBoss2Settings } = createBoss2Manager;
const createAdventureManager = require('../managers/adventure');
const createGemsManager = require('../managers/gems');
const { normalizeGemsSettings } = createGemsManager;
const createCaptchaHandler = require('../managers/captcha');
const createCommandSender = require('../managers/command');
const createLoopManager = require('../managers/loop');
const createEmergencyHandler = require('../managers/emergency');
const createMessageHandler = require('../managers/message');
const createHuntbotManager = require('../managers/huntbot');
const createDailyResetManager = require('../managers/dailyReset');
const createVoiceManager = require('../managers/voice');
const createClientManager = require('./client');
const captchaSolver = require('../services/captchaSolver');
const log = require('../../logger');
const CONSTANTS = require('../constants');
const { accountPrefix, safeJsonStringify } = require('../utils');

const getAccountIdFromToken = (token) => {
    if (!token || typeof token !== 'string') return 'default';
    try {
        const base64Id = token.split('.')[0];
        const padded = base64Id + '='.repeat((4 - base64Id.length % 4) % 4);
        const decodedId = Buffer.from(padded, 'base64').toString('utf8');
        return /^\d{17,20}$/.test(decodedId) ? decodedId : 'default';
    } catch {
        return 'default';
    }
};

const ensureRuntimeShape = (config = {}) => {
    config.settings = config.settings || {};
    config.settings.voice = config.settings.voice || { enabled: false, channelId: '' };
    config.settings.channelRotation = config.settings.channelRotation || { enabled: false, minMs: 180000, maxMs: 360000 };
    config.settings.control = config.settings.control || { start: 'wcash', pause: 'wbuy 1', allowIds: [] };
    config.settings.lucyControl = config.settings.lucyControl || { start: 'lucy start', pause: 'lucy pause', allowIds: [] };
    config.settings.boss = config.settings.boss || { enabled: true, allowedGuilds: [] };
    config.settings.boss2 = normalizeBoss2Settings(config.settings.boss2);
    config.settings.gems = normalizeGemsSettings(config.settings.gems);
    config.settings.adventure = config.settings.adventure || { enabled: false, targetId: '', channelId: '', guildId: '' };
    config.settings.messageFilter = config.settings.messageFilter || { enabled: true, channelIds: [], guildIds: [], debug: false, debugOnlyOwO: false };
    config.settings.messageDebug = config.settings.messageDebug || { enabled: false, targetId: '', channelId: '', guildId: '' };
    config.settings.telegram = config.settings.telegram || { token: '', chatId: '' };
    config.otherCommands = Array.isArray(config.otherCommands) ? config.otherCommands : [];
    config.otherCommands = [0, 1, 2].map(index => {
        const command = config.otherCommands[index] || {};
        return {
            text: String(command.text || ''),
            delayMs: Math.max(0, parseInt(command.delayMs, 10) || 5000),
            count: Math.max(1, parseInt(command.count, 10) || 1),
            channelId: String(command.channelId || ''),
            captchaEnabled: false,
            enabled: command.enabled === true
        };
    });
    config.settings.huntbot = config.settings.huntbot || { enabled: true };
    config.botStatus = config.botStatus || { running: false, paused: true };
    config.channels = Array.isArray(config.channels) ? config.channels : [];
    config.tiketandhb = config.tiketandhb || { channelId: '' };
    config.safety = config.safety || { cctv: false };
    config.delays = config.delays || {};
    Object.keys(CONSTANTS.DEFAULT_DELAYS || {}).forEach(key => {
        config.delays[key] = {
            ...CONSTANTS.DEFAULT_DELAYS[key],
            ...(config.delays[key] || {})
        };
    });
    config.huntbot = config.huntbot || { enabled: true, autoMode: true, defaultUpgrade: 'duration', defaultDuration: '1D', notifyProgress: true, sellAllAfterReturn: false };
    config.huntbot.sellAllAfterReturn = config.huntbot.sellAllAfterReturn === true;
    config.captcha = config.captcha || {};
    return config;
};

const createRuntimeState = ({ config, sharedStats }) => ({
    client: null,
    config: ensureRuntimeShape(config),
    activeToken: config.token || '',
    activeChannelId: null,
    stopBossHunt: false,
    lastRefillTimestamp: 0,
    foughtBosses: new Set(),
    bossCooldowns: new Map(),
    bossRespawnTimers: new Map(),
    bossTicketCheckTimers: new Set(),
    pendingBossTicketCheck: null,
    adventureTimer: null,
    adventurePaused: false,
    adventureProcessing: false,
    adventureActive: false,
    responseTimeout: null,
    hasActiveCaptcha: false,
    accountUsername: '',
    hasRunInitialReadyCommands: false,
    isStartupReadyRoutine: false,
    startupReadyRoutineUntil: 0,
    hasUsedFirstLoopStartupStagger: false,
    isBusy: false,
    nextAt: {},
    otherCommandDelays: {},
    startupJitterMs: Math.floor(Math.random() * 4500),
    captchaSolverAbortController: null,
    captchaSolveRunId: 0,
    stats: sharedStats,
    channelRotateTimer: null,
    lastChannelId: null,
    lastTicketCheck: 0,
    messageDebugEntries: [],
    loops: {
        battle: null,
        hunt: null,
        pray: null,
        custom1: null,
        custom2: null,
        other1: null,
        other2: null,
        other3: null
    }
});

const createRuntimeConfigManager = (state, filePath) => ({
    read() {
        try {
            return ensureRuntimeShape(JSON.parse(fs.readFileSync(filePath, 'utf8')));
        } catch {
            return state.config;
        }
    },

    save() {
        ensureRuntimeShape(state.config);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(state.config, null, 2));
    },

    getRotationSettings() {
        const r = state.config.settings?.channelRotation || {};
        return {
            enabled: r.enabled === true,
            minMs: Math.max(1000, parseInt(r.minMs, 10) || 8 * 60 * 1000),
            maxMs: Math.max(1000, parseInt(r.maxMs, 10) || 15 * 60 * 1000)
        };
    },

    getControlCommands() {
        const ctrl = state.config.settings?.control || {};
        return {
            startCmd: String(ctrl.start || 'wo').toLowerCase(),
            pauseCmd: String(ctrl.pause || 'winv').toLowerCase(),
            allowIds: Array.isArray(ctrl.allowIds) ? ctrl.allowIds.map(String) : []
        };
    },

    getLucyControlCommands() {
        const ctrl = state.config.settings?.lucyControl || {};
        return {
            startCmd: String(ctrl.start || 'lucy start').trim().toLowerCase(),
            pauseCmd: String(ctrl.pause || 'lucy pause').trim().toLowerCase(),
            allowIds: Array.isArray(ctrl.allowIds) ? ctrl.allowIds.map(String) : []
        };
    },

    getBossSettings() {
        const boss = state.config.settings?.boss || {};
        return {
            enabled: boss.enabled === true,
            allowedGuilds: Array.isArray(boss.allowedGuilds) ? boss.allowedGuilds : []
        };
    },

    getBoss2Settings() {
        return normalizeBoss2Settings(state.config.settings?.boss2);
    },

    getGemsSettings() {
        return normalizeGemsSettings(state.config.settings?.gems);
    },

    getAdventureSettings() {
        const adventure = state.config.settings?.adventure || {};
        return {
            enabled: adventure.enabled === true,
            targetId: String(adventure.targetId || '').trim(),
            channelId: String(adventure.channelId || '').trim(),
            guildId: String(adventure.guildId || '').trim()
        };
    },

    getValidChannels() {
        const channels = Array.isArray(state.config.channels) ? state.config.channels : [];
        return channels.filter(c => c && String(c).length > 5);
    },

    updateFromDisk() {
        const diskConfig = this.read();
        if (!diskConfig) return false;

        const previousToken = state.activeToken;
        const tokenChanged = diskConfig.token !== state.activeToken;
        const channelsChanged = safeJsonStringify(state.config.channels) !== safeJsonStringify(diskConfig.channels);
        const voiceChanged = safeJsonStringify(state.config.settings?.voice) !== safeJsonStringify(diskConfig.settings?.voice);
        const wasPaused = state.config.botStatus?.paused;
        const wasRunning = state.config.botStatus?.running;
        const nowPaused = diskConfig.botStatus?.paused;
        const nowRunning = diskConfig.botStatus?.running;
        const statusChanged = wasPaused !== nowPaused || wasRunning !== nowRunning;

        state.config = diskConfig;
        return { tokenChanged, previousToken, channelsChanged, voiceChanged, statusChanged, wasPaused, wasRunning, nowPaused, nowRunning };
    }
});

const createHuntbotState = () => ({
    autoMode: false,
    activeHunt: null,
    pendingCaptcha: null,
    lastUpgradeLevel: null,
    lastProgress: null,
    lastResponse: null,
    monitorInterval: null,
    outgoingCommands: new Map(),
    timeouts: new Set(),
    notifiedSoon: false
});

module.exports = function createAccountRuntime({ config, filePath, sharedStats }) {
    const accountId = getAccountIdFromToken(config.token);
    const state = createRuntimeState({ config, sharedStats });
    state.accountId = accountId;
    const configManager = createRuntimeConfigManager(state, filePath);
    state.persistConfig = () => configManager.save();
    const telegramService = createTelegramService(state);
    const dailyResetManager = createDailyResetManager(state, telegramService);
    const macrodroidService = createMacrodroidService(state);
    const channelManager = createChannelManager(state, configManager);
    const loopManagerWrapper = {
        stopAll: () => loopManager && loopManager.stopAll(),
        startAll: () => loopManager && loopManager.startAll()
    };
    const bossManager = createBossManager(state, configManager, telegramService);
    const boss2Manager = createBoss2Manager(state, configManager);
    const emergencyHandler = createEmergencyHandler(state, configManager, loopManagerWrapper, channelManager, telegramService, macrodroidService);
    const commandSender = createCommandSender(state, channelManager, emergencyHandler);
    const adventureManager = createAdventureManager(state, configManager, commandSender);
    const gemsManager = createGemsManager(state, configManager, commandSender);
    const loopManager = createLoopManager(state, commandSender);
    const captchaHandler = createCaptchaHandler(state, configManager, loopManager, telegramService, channelManager, macrodroidService);
    const voiceManager = createVoiceManager(state, configManager);
    const huntbotManager = createHuntbotManager(state, createHuntbotState(), configManager, commandSender, telegramService, captchaSolver);
    const messageHandler = createMessageHandler(
        state,
        configManager,
        bossManager,
        captchaHandler,
        loopManager,
        channelManager,
        telegramService,
        macrodroidService,
        huntbotManager,
        commandSender,
        voiceManager,
        adventureManager,
        boss2Manager,
        gemsManager
    );
    const clientManager = createClientManager(state, configManager, channelManager, messageHandler, telegramService, huntbotManager, voiceManager);

    let readyLoopWatcher = null;
    const otherCommandReadyWatchers = new Map();
    let runtimeRunning = false;
    let loopsActive = false;
    let loopConfigSignature = '';

    const getLoopConfigSignature = (nextConfig = state.config) => safeJsonStringify({
        channels: nextConfig.channels || [],
        delays: nextConfig.delays || {},
        commands: {
            battle: nextConfig.settings?.battle,
            hunt: nextConfig.settings?.hunt,
            pray: nextConfig.settings?.pray,
            custom: nextConfig.settings?.custom,
            text1: nextConfig.settings?.text1,
            text2: nextConfig.settings?.text2,
            otherCommands: nextConfig.otherCommands || []
        },
        rotation: nextConfig.settings?.channelRotation || {}
    });

    const originalLoopStartAll = loopManager.startAll.bind(loopManager);
    const originalLoopStopAll = loopManager.stopAll.bind(loopManager);
    loopManager.startAll = () => {
        originalLoopStartAll();
        loopsActive = true;
        loopConfigSignature = getLoopConfigSignature();
    };
    loopManager.stopAll = () => {
        originalLoopStopAll();
        loopsActive = false;
    };

    const joinConfiguredVoice = (source) => {
        if (!state.client?.isReady()) return;
        voiceManager.joinConfigured(source).catch(err => log.error(`${accountPrefix(state)}❌ Auto Join VC gagal: ${err.message}`));
    };

    const activateReadyRuntime = (source = 'start') => {
        if (!state.client?.isReady()) return false;
        const nextLoopSignature = getLoopConfigSignature();
        if (!loopsActive || nextLoopSignature !== loopConfigSignature) {
            loopManager.startAll();
            loopConfigSignature = nextLoopSignature;
            loopsActive = true;
        }
        channelManager.scheduleRotation();
        joinConfiguredVoice(source);
        adventureManager.start().catch(error => log.error(`${accountPrefix(state)}❌ Auto Adventure gagal dimulai: ${error.message}`));
        return true;
    };

    const startLoopsWhenReady = () => {
        if (readyLoopWatcher) clearInterval(readyLoopWatcher);
        readyLoopWatcher = setInterval(() => {
            if (!state.config.botStatus?.running || state.config.botStatus?.paused) {
                clearInterval(readyLoopWatcher);
                readyLoopWatcher = null;
                return;
            }
            if (state.client?.isReady()) {
                activateReadyRuntime('ready');
                clearInterval(readyLoopWatcher);
                readyLoopWatcher = null;
            }
        }, 1000);
    };

    const startOtherCommandWhenReady = (index) => {
        if (otherCommandReadyWatchers.has(index)) clearInterval(otherCommandReadyWatchers.get(index));
        const watcher = setInterval(() => {
            if (state.client?.isReady()) {
                loopManager.startOtherCommand(index);
                clearInterval(watcher);
                otherCommandReadyWatchers.delete(index);
            }
        }, 1000);
        otherCommandReadyWatchers.set(index, watcher);
    };

    return {
        accountId,
        filePath,
        state,
        configManager,
        clientManager,
        channelManager,
        loopManager,
        voiceManager,
        adventureManager,
        dailyResetManager,
        checkDailyReset() {
            dailyResetManager.checkAndReset();
        },
        getDisplayName() {
            return state.client?.user?.tag || accountId;
        },
        connect() {
            const statusChanged = !!state.config.botStatus?.running || !state.config.botStatus?.paused;
            runtimeRunning = false;
            state.config.botStatus = { running: false, paused: true };
            if (statusChanged) configManager.save();
            if (readyLoopWatcher) {
                clearInterval(readyLoopWatcher);
                readyLoopWatcher = null;
            }
            loopManager.stopAll();
            loopsActive = false;
            channelManager.stopRotation();

            if (!state.client) {
                log.info(`${accountPrefix(state)}🔌 Connect/Login akun tanpa start loop.`);
                clientManager.initialize();
                return true;
            }

            if (!state.client.isReady()) {
                log.info(`${accountPrefix(state)}🔌 Client sudah ada, menunggu ready tanpa start loop.`);
                return true;
            }

            log.info(`${accountPrefix(state)}✅ Client sudah ready, tetap paused; loop tidak dijalankan.`);
            channelManager.updateActive();
            return true;
        },
        start() {
            const wasRuntimeRunning = runtimeRunning;
            const statusChanged = !state.config.botStatus?.running || !!state.config.botStatus?.paused;
            runtimeRunning = true;
            state.config.botStatus = { running: true, paused: false };
            if (statusChanged) configManager.save();

            if (!state.client) {
                log.info(`${accountPrefix(state)}🚀 Menjalankan akun paralel.`);
                clientManager.initialize();
                startLoopsWhenReady();
                return;
            }

            if (!state.client.isReady()) {
                if (!wasRuntimeRunning) {
                    log.info(`${accountPrefix(state)}▶️ Resume diminta; menunggu sesi Discord yang sudah ada siap tanpa login ulang.`);
                }
                startLoopsWhenReady();
                return;
            }

            if (!wasRuntimeRunning || !loopsActive) {
                if (!wasRuntimeRunning) log.info(`${accountPrefix(state)}▶️ Melanjutkan loop akun paralel.`);
                activateReadyRuntime(wasRuntimeRunning ? 'reconcile' : 'start');
            }
        },
        startOtherCommand(index) {
            const command = state.config.otherCommands?.[index];
            if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) return false;

            if (state.client?.isReady()) return loopManager.startOtherCommand(index);

            if (!state.client) {
                log.info(`${accountPrefix(state)}▶️ Menjalankan Other Command tanpa START Global.`);
                clientManager.initialize();
            }
            startOtherCommandWhenReady(index);
            return true;
        },
        stopOtherCommand(index) {
            if (otherCommandReadyWatchers.has(index)) {
                clearInterval(otherCommandReadyWatchers.get(index));
                otherCommandReadyWatchers.delete(index);
            }
            loopManager.stopOtherCommand(index);
            return true;
        },
        joinVoice(source = 'dashboard-button') {
            if (!state.client?.isReady()) {
                log.warn(`${accountPrefix(state)}⚠️ Client belum ready, tombol Join Voice dibatalkan.`);
                return false;
            }
            voiceManager.joinConfigured(source).catch(err => log.error(`${accountPrefix(state)}❌ Join VC dari dashboard gagal: ${err.message}`));
            return true;
        },
        pause() {
            const wasRuntimeRunning = runtimeRunning;
            const statusChanged = !!state.config.botStatus?.running || !state.config.botStatus?.paused;
            runtimeRunning = false;
            state.config.botStatus = { running: false, paused: true };
            if (statusChanged) configManager.save();
            if (!wasRuntimeRunning && !loopsActive) return;
            if (wasRuntimeRunning) log.info(`${accountPrefix(state)}⏸ Menjeda akun paralel.`);
            loopManager.stopAll();
            loopsActive = false;
            channelManager.stopRotation();
        },
        destroy() {
            this.pause();
            loopManager.stopOtherCommands();
            if (readyLoopWatcher) clearInterval(readyLoopWatcher);
            readyLoopWatcher = null;
            otherCommandReadyWatchers.forEach(watcher => clearInterval(watcher));
            otherCommandReadyWatchers.clear();
            if (huntbotManager && typeof huntbotManager.stop === 'function') {
                huntbotManager.stop({ notify: false });
            }
            if (bossManager && typeof bossManager.stop === 'function') {
                bossManager.stop();
            }
            boss2Manager.stop();
            gemsManager.stop();
            adventureManager.stop();
            if (state.client) {
                try { state.client.destroy(); } catch (error) { log.warn(`${accountPrefix(state)}Gagal destroy client: ${error.message}`); }
                state.client = null;
            }
        },
        reloadConfig(nextConfig) {
            const oldConfig = state.config;
            const oldToken = state.activeToken;
            const oldLoopSignature = getLoopConfigSignature(oldConfig);
            const oldVoice = safeJsonStringify(oldConfig.settings?.voice || {});
            const oldAdventure = safeJsonStringify(oldConfig.settings?.adventure || {});
            const oldChannels = safeJsonStringify(oldConfig.channels || []);
            const oldStatus = safeJsonStringify(oldConfig.botStatus || {});

            state.config = ensureRuntimeShape(nextConfig);
            state.activeToken = state.config.token || '';

            const tokenChanged = oldToken !== state.activeToken;
            const voiceChanged = oldVoice !== safeJsonStringify(state.config.settings?.voice || {});
            const adventureChanged = oldAdventure !== safeJsonStringify(state.config.settings?.adventure || {});
            const channelsChanged = oldChannels !== safeJsonStringify(state.config.channels || []);
            const statusChanged = oldStatus !== safeJsonStringify(state.config.botStatus || {});
            const loopConfigChanged = oldLoopSignature !== getLoopConfigSignature(state.config);

            if (tokenChanged) {
                log.warn(`${accountPrefix(state)}Token berubah, runtime akan dibuat ulang.`);
                this.destroy();
                return;
            }

            if (statusChanged) log.info(`${accountPrefix(state)}🔁 Status config berubah: running=${!!state.config.botStatus?.running}, paused=${!!state.config.botStatus?.paused}`);
            if (channelsChanged) log.info(`${accountPrefix(state)}📡 Config channel berubah (${(state.config.channels || []).length} channel).`);
            if (voiceChanged) log.info(`${accountPrefix(state)}🔊 Config voice berubah: enabled=${state.config.settings?.voice?.enabled === true}, channel=${state.config.settings?.voice?.channelId || '-'}`);
            if (adventureChanged && state.config.settings?.adventure?.enabled !== true) adventureManager.stop();
            if (loopConfigChanged && !channelsChanged) log.info(`${accountPrefix(state)}⚙️ Config loop/delay berubah.`);

            if (!runtimeRunning || !state.client?.isReady()) return;

            if (channelsChanged) channelManager.updateActive();
            if (loopConfigChanged || channelsChanged) {
                loopsActive = false;
                activateReadyRuntime('config');
            } else if (voiceChanged) {
                joinConfiguredVoice('config');
            }
        }
    };
};

module.exports.getAccountIdFromToken = getAccountIdFromToken;
module.exports.ensureRuntimeShape = ensureRuntimeShape;
