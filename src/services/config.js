const { normalizeBoss2Settings } = require('../managers/boss2');
const { normalizeGemsSettings } = require('../managers/gems');
const { normalizeRestSettings } = require('../managers/rest');
const fs = require('fs');
const CONSTANTS = require('../constants');
const { safeJsonStringify } = require('../utils');

const ensureRuntimeShape = (config = {}) => {
    config.settings = config.settings || {};
    config.settings.voice = config.settings.voice || { enabled: false, channelId: '' };
    config.settings.adventure = config.settings.adventure || { enabled: false, targetId: '', channelId: '', guildId: '' };
    config.settings.lucyControl = config.settings.lucyControl || { start: 'lucy start', pause: 'lucy pause', allowIds: [] };
    config.settings.rest = normalizeRestSettings(config.settings.rest);
    return config;
};

module.exports = (state) => ({
    read() {
        try {
            const raw = fs.readFileSync('./config.json', 'utf8');
            return ensureRuntimeShape(JSON.parse(raw));
        } catch (e) {
            return null;
        }
    },

    save() {
        ensureRuntimeShape(state.config);
        fs.writeFileSync('./config.json', JSON.stringify(state.config, null, 2));
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
            startCmd: String(ctrl.start || "wo").toLowerCase(),
            pauseCmd: String(ctrl.pause || "winv").toLowerCase(),
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
