const { normalizeBoss2Settings } = require('../../managers/boss2');
const { normalizeGemsSettings } = require('../../managers/gems');
const { normalizeRestSettings } = require('../../managers/rest');
const { normalizeSendCount } = require('../../utils');
module.exports = function createConfigManager({ configPath, fileService, CONSTANTS }) {
    return {
    get() {
        return fileService.readJson(configPath);
    },

    save(config) {
        return fileService.writeJson(configPath, config);
    },

    ensureShape(config) {
        config.port = config.port || CONSTANTS.DEFAULT_PORT;
        config.botStatus = config.botStatus || { running: false, paused: false };
        config.channels = Array.isArray(config.channels) ? config.channels : [];
        config.macrodroidId = config.macrodroidId || "";
        config.autosolver = config.autosolver || false;
        config.maxLogLines = config.maxLogLines || CONSTANTS.MAX_LOG_LINES;
        
        config.settings = config.settings || {};
        config.delays = config.delays || {};
        config.safety = config.safety || { cctv: false };
        config.tiketandhb = config.tiketandhb || { channelId: "" };
        config.huntbot = config.huntbot || { enabled: true, autoMode: true, defaultUpgrade: 'duration', defaultDuration: '1D', notifyProgress: true, sellAllAfterReturn: false };
        config.huntbot.sellAllAfterReturn = config.huntbot.sellAllAfterReturn === true;
        config.multiAccount = config.multiAccount || { enabled: true, maxAccounts: 0 };
        config.multiAccount.enabled = config.multiAccount.enabled !== false;
        config.multiAccount.maxAccounts = Math.max(0, Math.min(4, parseInt(config.multiAccount.maxAccounts, 10) || 0));

        config.settings.twoCaptchaKey = config.settings.twoCaptchaKey || "";
        config.settings.control = config.settings.control || { start: 'wcash', pause: 'wbuy 1', allowIds: [] };
        config.settings.lucyControl = config.settings.lucyControl || { start: 'lucy start', pause: 'lucy pause', allowIds: [] };
        config.settings.channelRotation = config.settings.channelRotation || { enabled: false, minMs: 180000, maxMs: 360000 };
        config.settings.boss = config.settings.boss || { enabled: true, allowedGuilds: [] };
        config.settings.boss2 = normalizeBoss2Settings(config.settings.boss2);
        config.settings.gems = normalizeGemsSettings(config.settings.gems);
        config.settings.rest = normalizeRestSettings(config.settings.rest);
        config.settings.adventure = config.settings.adventure || { enabled: false, targetId: '', channelId: '', guildId: '' };
        config.settings.messageFilter = config.settings.messageFilter || { enabled: true, channelIds: [], guildIds: [], debug: false, debugOnlyOwO: false };
        config.settings.messageDebug = config.settings.messageDebug || { enabled: false, targetId: '', channelId: '', guildId: '' };
        config.settings.telegram = config.settings.telegram || { token: "", chatId: "" };
        config.settings.voice = config.settings.voice || { enabled: false, channelId: "" };
        config.otherCommands = Array.isArray(config.otherCommands) ? config.otherCommands : [];
        config.otherCommands = [0, 1, 2].map(index => {
            const command = config.otherCommands[index] || {};
            return {
                text: String(command.text || ''),
                delayMs: Math.max(0, this.toInt(command.delayMs, 5000)),
                count: normalizeSendCount(command.count),
                channelId: String(command.channelId || ''),
                captchaEnabled: false,
                enabled: command.enabled === true
            };
        });

        // Ensure captcha config shape
        config.captcha = config.captcha || {};
        config.captcha.enabled = config.captcha.enabled !== false;
        config.captcha.primarySolver = config.captcha.primarySolver || 'NopechaSolver';
        config.captcha.fallbackSolvers = Array.isArray(config.captcha.fallbackSolvers) ? config.captcha.fallbackSolvers : [];
        config.captcha.maxTotalTimeMs = config.captcha.maxTotalTimeMs || 600000;
        config.captcha.retryPerSolver = config.captcha.retryPerSolver || 2;
        config.captcha.apiKeys = config.captcha.apiKeys || { NopechaSolver: '', TwoCaptchaSolver: '' };

        Object.keys(CONSTANTS.DEFAULT_DELAYS).forEach(key => {
            config.delays[key] = {
                ...CONSTANTS.DEFAULT_DELAYS[key],
                ...(config.delays[key] || {})
            };
        });

        return config;
    },

    applySave(config, body) {
        config.token = body.token || config.token; 
        config.port = this.toInt(body.port, config.port);
        config.macrodroidId = body.macrodroidId || '';
        config.autosolver = this.toBool(body.autosolver);
        config.multiAccount = config.multiAccount || {};
        config.multiAccount.enabled = true;
        config.multiAccount.maxAccounts = Math.max(0, Math.min(4, this.toInt(body.maxAccounts, config.multiAccount.maxAccounts || 0)));

        const channels = [body.chan1, body.chan2, body.chan3]
            .filter(ch => ch && String(ch).trim() !== '')
            .map(ch => String(ch).trim());
        config.channels = channels;

        config.settings.battle = this.toBool(body.battle);
        config.settings.hunt = this.toBool(body.hunt);
        config.settings.pray = this.toBool(body.pray);
        config.settings.custom = this.toBool(body.custom);
        config.settings.twoCaptchaKey = body.twoCaptchaKey || '';

        config.settings.text1 = body.text1 || '';
        config.settings.text2 = body.text2 || '';

        config.otherCommands = [0, 1, 2].map(index => {
            const current = config.otherCommands[index] || {};
            return {
                text: String(body[`other${index + 1}Text`] || '').trim(),
                delayMs: Math.max(0, this.toInt(body[`other${index + 1}Delay`], Math.floor((current.delayMs || 5000) / 1000))) * 1000,
                count: normalizeSendCount(body[`other${index + 1}Count`], normalizeSendCount(current.count)),
                channelId: String(body[`other${index + 1}Channel`] || '').trim(),
                captchaEnabled: false,
                enabled: current.enabled === true
            };
        });

        config.delays.hunt.min = this.toInt(body.huntMin, config.delays.hunt.min);
        config.delays.hunt.max = this.toInt(body.huntMax, config.delays.hunt.max);
        config.delays.battle.min = this.toInt(body.battleMin, config.delays.battle.min);
        config.delays.battle.max = this.toInt(body.battleMax, config.delays.battle.max);
        config.delays.pray.min = this.toInt(body.prayMin, config.delays.pray.min);
        config.delays.pray.max = this.toInt(body.prayMax, config.delays.pray.max);
        config.delays.custom1.min = this.toInt(body.c1Min, config.delays.custom1.min);
        config.delays.custom1.max = this.toInt(body.c1Max, config.delays.custom1.max);
        config.delays.custom2.min = this.toInt(body.c2Min, config.delays.custom2.min);
        config.delays.custom2.max = this.toInt(body.c2Max, config.delays.custom2.max);

        config.settings.telegram.token = body.tgToken || '';
        config.settings.telegram.chatId = body.tgChat || '';

        config.maxLogLines = this.toInt(body.maxLogLines, 15);
        config.settings.autoResume = this.toBool(body.autoResume);
        
        config.settings.control.start = body.ctrlStart || 'wcash';
        config.settings.control.pause = body.ctrlPause || 'wbuy 1';
        config.settings.control.allowIds = this.toArray(body.ctrlAllowIds);

        config.settings.lucyControl = {
            start: String(body.lucyCtrlStart || '').trim() || 'lucy start',
            pause: String(body.lucyCtrlPause || '').trim() || 'lucy pause',
            allowIds: this.toArray(body.lucyCtrlAllowIds)
        };

        config.settings.channelRotation.enabled = this.toBool(body.crEnabled);
        config.settings.channelRotation.minMs = this.toInt(body.crMin, 180000);
        config.settings.channelRotation.maxMs = this.toInt(body.crMax, 360000);

        config.settings.boss.enabled = this.toBool(body.bossEnabled);
        config.settings.boss.allowedGuilds = this.toArray(body.bossGuilds);

        config.settings.boss2 = normalizeBoss2Settings({
            enabled: this.toBool(body.boss2Enabled),
            allowedGuilds: this.toArray(body.boss2Guilds),
            channelIds: this.toArray(body.boss2ChannelIds),
            botIds: this.toArray(body.boss2BotIds),
            appearText: body.boss2AppearText,
            defeatedText: body.boss2DefeatedText,
            buttonId: body.boss2ButtonId,
            fightsPerBoss: body.boss2FightsPerBoss,
            delayMinMs: body.boss2DelayMin,
            delayMaxMs: body.boss2DelayMax
        });

        config.settings.gems = normalizeGemsSettings({
            ...config.settings.gems,
            enabled: this.toBool(body.gemsEnabled),
            channelId: body.gemsChannelId,
            botIds: this.toArray(body.gemsBotIds),
            accountName: body.gemsAccountName,
            triggerText: body.gemsTriggerText,
            inventoryCommand: body.gemsInventoryCommand,
            lootboxItem: body.gemsLootboxItem,
            lootboxCommand: body.gemsLootboxCommand,
            requiredGems: body.gemsRequired,
            optionalGems: body.gemsOptional ?? '',
            useCommand: body.gemsUseCommand,
            recheckMinutes: body.gemsRecheckMinutes,
            delayMinMs: body.gemsDelayMin,
            delayMaxMs: body.gemsDelayMax
        });

        const restHours = parseFloat(String(body.restBudgetHours ?? '').replace(',', '.'));
        config.settings.rest = normalizeRestSettings({
            schedule: {
                enabled: this.toBool(body.restScheduleEnabled),
                start: body.restScheduleStart,
                end: body.restScheduleEnd
            },
            budget: {
                enabled: this.toBool(body.restBudgetEnabled),
                maxMinutes: Number.isFinite(restHours) ? Math.round(restHours * 60) : config.settings.rest?.budget?.maxMinutes,
                minSessionMinutes: body.restBudgetMinSession,
                maxSessionMinutes: body.restBudgetMaxSession
            }
        });

        config.settings.adventure.targetId = String(body.adventureTargetId || '').trim();
        config.settings.adventure.channelId = String(body.adventureChannelId || '').trim();
        config.settings.adventure.guildId = String(body.adventureGuildId || '').trim();

        config.settings.messageFilter.enabled = this.toBool(body.mfEnabled);
        config.settings.messageFilter.channelIds = this.toArray(body.mfChannelIds);
        config.settings.messageFilter.guildIds = this.toArray(body.mfGuildIds);
        config.settings.messageFilter.debug = this.toBool(body.mfDebug);
        config.settings.messageFilter.debugOnlyOwO = this.toBool(body.mfDebugOnlyOwO);

        config.settings.messageDebug.enabled = this.toBool(body.messageDebugEnabled);
        config.settings.messageDebug.targetId = String(body.messageDebugTargetId || '').trim();
        config.settings.messageDebug.channelId = String(body.messageDebugChannelId || '').trim();
        config.settings.messageDebug.guildId = String(body.messageDebugGuildId || '').trim();

        config.settings.voice.enabled = this.toBool(body.voiceEnabled);
        config.settings.voice.channelId = body.voiceChannelId || '';

        config.huntbot.enabled = this.toBool(body.hbEnabled);
        config.huntbot.autoMode = this.toBool(body.hbAutoMode);
        config.huntbot.notifyProgress = this.toBool(body.hbNotify);
        config.huntbot.sellAllAfterReturn = this.toBool(body.hbSellAllAfterReturn);
        config.huntbot.defaultUpgrade = body.hbUpgrade || 'duration';
        config.huntbot.defaultDuration = body.hbDuration || '1D';
        config.tiketandhb.channelId = body.tiketandhbChannel || '';
        
        config.safety.cctv = this.toBool(body.cctvEnabled);

        // === CAPTCHA SETTINGS (Full Fallback Support) ===
        config.captcha = config.captcha || {};
        config.captcha.enabled = this.toBool(body.captchaEnabled);
        config.captcha.primarySolver = body.captchaPrimary || 'NopechaSolver';
        
        // Fallback solvers (dari checkbox)
        const fallbackList = [];
        if (body.fallbackNopecha) fallbackList.push('NopechaSolver');
        if (body.fallbackTwoCaptcha) fallbackList.push('TwoCaptchaSolver');
        config.captcha.fallbackSolvers = fallbackList;

        config.captcha.apiKeys = config.captcha.apiKeys || {};
        config.captcha.apiKeys.NopechaSolver = body.nopechaApiKey || '';
        config.captcha.apiKeys.TwoCaptchaSolver = body.twoCaptchaApiKey || '';

        return config;
    },

    applyAction(config, action) {
        switch (action) {
            case 'adventureStart':
                config.settings.adventure.enabled = true;
                break;
            case 'adventureStop':
                config.settings.adventure.enabled = false;
                break;
            case 'start':
                config.botStatus.running = true;
                config.botStatus.paused = false;
                break;
            case 'pause':
                config.botStatus.paused = true;
                config.botStatus.running = false;
                break;
            default: {
                const match = /^other(Command)?(Start|Stop)([1-3])$/.exec(String(action || ''));
                if (match) {
                    const index = Number(match[3]) - 1;
                    config.otherCommands = config.otherCommands || [];
                    config.otherCommands[index] = config.otherCommands[index] || {};
                    config.otherCommands[index].enabled = match[2] === 'Start';
                }
            }
        }
        return config;
    },

    toInt(value, fallback = 0) {
        const num = parseInt(value, 10);
        return Number.isFinite(num) ? num : fallback;
    },

    toBool(value) {
        return !!value;
    },

    toArray(value) {
        if (!value) return [];
        return value.split(',').map(s => s.trim()).filter(Boolean);
    },

    computeStatus(config) {
        const isPaused = !!config.botStatus?.paused;
        const isRunning = !!config.botStatus?.running;

        let statusText = '⏹ OFFLINE';
        let statusClass = 'offline';

        if (isRunning) {
            statusText = isPaused ? '⏸ PAUSED' : '▶ RUNNING';
            statusClass = isPaused ? 'paused' : 'running';
        }

        return { statusText, statusClass };
    }
    };
};
