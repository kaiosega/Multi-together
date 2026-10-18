const CONSTANTS = require('./constants');

const getDiscordUsername = (state) => {
    const user = state?.client?.user;
    if (user?.tag) return user.tag;
    if (user?.username) return user.username;
    return state?.accountUsername || state?.discordUsername || '';
};

const accountPrefix = (state) => {
    if (!state?.accountId) return '';
    const username = getDiscordUsername(state);
    return username
        ? `[account:${state.accountId} user:${username}] `
        : `[account:${state.accountId}] `;
};

// --- UTILITY FUNCTIONS ---
module.exports = {
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    
    removeInvisibleChars: (str) => str.replace(CONSTANTS.INVISIBLE_CHARS_REGEX, ''),

    getDiscordUsername,

    accountPrefix,
    
    // Jumlah pengiriman Custom Command Lucy: kosong/0 = infinite (0), undefined = fallback.
    normalizeSendCount: (value, fallback = 1) => {
        if (value === undefined) return fallback;
        if (value === null || String(value).trim() === '') return 0;
        const num = parseInt(value, 10);
        return Number.isFinite(num) && num > 0 ? num : 0;
    },

    safeJsonStringify: (obj) => {
        try {
            return JSON.stringify(obj);
        } catch {
            return '';
        }
    },
    
    deepCopy: (obj) => {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch {
            return obj;
        }
    }
};