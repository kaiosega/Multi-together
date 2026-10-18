const CONSTANTS = require('../constants');
const log = require('../../logger');
const { sleep, randomInt, accountPrefix } = require('../utils');
const statsService = require('../services/stats');

module.exports = (state, channelManager, emergencyHandler) => ({
    async send(cmd, type = '', targetChannelId = '', options = {}) {
        const allowDuringCaptcha = options.allowDuringCaptcha === true;
        const allowWhilePaused = options.allowWhilePaused === true;
        if (state.hasActiveCaptcha && !allowDuringCaptcha) {
            log.warn(`${accountPrefix(state)}⚠️ Command [${cmd}] ditahan: CAPTCHA sedang aktif.`);
            return false;
        }
        if (state.rest?.active && options.allowDuringRest !== true) {
            log.info(`${accountPrefix(state)}😴 Command [${cmd}] ditahan: sedang istirahat.`);
            return false;
        }
        if ((state.config.botStatus.paused || !state.config.botStatus.running) && !state.isStartupReadyRoutine && !allowWhilePaused) return false;
        if (!state.client?.isReady()) return false;

        const requestedChannelId = String(targetChannelId || '').trim();
        if (!requestedChannelId && !state.activeChannelId && !channelManager.updateActive()) return false;

        const channel = state.client.channels.cache.get(requestedChannelId || state.activeChannelId);
        if (!channel) return false;

        await channel.sendTyping();
        await sleep(randomInt(CONSTANTS.MIN_TYPING_DELAY, CONSTANTS.MAX_TYPING_DELAY));

        if (state.hasActiveCaptcha && !allowDuringCaptcha) {
            log.warn(`${accountPrefix(state)}⚠️ Command [${cmd}] dibatalkan setelah typing: CAPTCHA sedang aktif.`);
            return false;
        }

        const maxRetries = 2;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (state.hasActiveCaptcha && !allowDuringCaptcha) {
                log.warn(`${accountPrefix(state)}⚠️ Command [${cmd}] dibatalkan sebelum pengiriman: CAPTCHA sedang aktif.`);
                return false;
            }
            try {
                await channel.send(cmd);
                statsService.recordCommand(state, cmd, type);
                log.info(`${accountPrefix(state)}📨 Sent: ${cmd} [${type}]`);

                if (type === 'Battle' || type === 'Hunt') {
                    this.setResponseTimeout(type);
                }
                return true;
            } catch (e) {
                lastError = e;

                const isRateLimit = e.code === 429 || (e.message && e.message.toLowerCase().includes('rate limit'));
                const isNetworkError = e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.message?.includes('fetch');

                if (attempt < maxRetries && (isRateLimit || isNetworkError)) {
                    const delay = 1500 * attempt;
                    log.warn(`${accountPrefix(state)}⚠️ Gagal kirim command [${cmd}] (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms... (${e.message})`);
                    await sleep(delay);
                    continue;
                }

                // Final error after retries or non-retryable error
                log.error(`${accountPrefix(state)}❌ Gagal mengirim command [${cmd}] [${type}] setelah ${attempt} percobaan: ${e.message}`, {
                    code: e.code,
                    status: e.status,
                    command: cmd,
                    type: type,
                    stack: e.stack?.split('\n').slice(0, 5).join('\n') // partial stack
                });
                break;
            }
        }

        return false;
    },

    setResponseTimeout(type) {
        if (state.responseTimeout) {
            log.warn(`${accountPrefix(state)}⏳ Timeout already active, skipping new timeout for ${type}`);
            return;
        }

        state.responseTimeout = setTimeout(() => {
            log.error(`${accountPrefix(state)}⛔ TIMEOUT 40s - No response from OwO for ${type}`);
            emergencyHandler.pause('TIMEOUT 40s (OwO No Response)');
        }, CONSTANTS.RESPONSE_TIMEOUT_MS);

        log.info(`${accountPrefix(state)}⏲️ Response timeout set for ${type}: ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s`);
    },

    clearResponseTimeout() {
        if (state.responseTimeout) {
            clearTimeout(state.responseTimeout);
            state.responseTimeout = null;
            log.info(`${accountPrefix(state)}✅ Response timeout cleared - OwO responded in time`);
        }
    }
});
