const log = require('../../logger');
const { randomInt, accountPrefix } = require('../utils');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
module.exports = (state, commandSender) => ({

    // Pastikan storage loop tersimpan di state runtime masing-masing akun.
    init() {
        state.nextAt = state.nextAt || {};
        state.loops = state.loops || {};
        state.isBusy = !!state.isBusy;
        if (typeof state.startupJitterMs !== 'number') {
            state.startupJitterMs = randomInt(0, 4500);
        }
    },

    // Helper: schedule + simpan next run time
    _scheduleLoop(key, fn, delayMs) {
        const delay = Math.max(0, Number(delayMs) || 0);

        state.nextAt[key] = Date.now() + delay;

        if (state.loops[key]) clearTimeout(state.loops[key]);
        state.loops[key] = null;
        // Saat istirahat jadwal disimpan di nextAt saja; startAll() melanjutkannya setelah istirahat.
        if (state.rest?.active) return;
        state.loops[key] = setTimeout(fn, delay);
    },

    // Delay normal (murni dari config)
    _getDefaultDelay(key) {
        const d = state.config?.delays?.[key];

        if (d?.min != null && d?.max != null) return randomInt(d.min, d.max);

        if (key === 'custom1') {
            const min = state.config?.delays?.custom1?.min || 60000;
            const max = state.config?.delays?.custom1?.max || 120000;
            return randomInt(min, max);
        }

        if (key === 'custom2') {
            const min = state.config?.delays?.custom2?.min || 60000;
            const max = state.config?.delays?.custom2?.max || 120000;
            return randomInt(min, max);
        }

        return 1000;
    },

    // Helper: resume berdasarkan sisa waktu
    _resumeLoop(key, fn) {
        const next = state.nextAt[key];

        if (typeof next !== 'number') {
            fn();
            return;
        }

        const remaining = next - Date.now();

        if (remaining <= 0) {
            fn();
            return;
        }

        this._scheduleLoop(key, fn, remaining);
    },


    async hunt() {
        if (state.config.botStatus.paused || !state.config.settings?.hunt) return;

        // HAPUS: commandSender.clearResponseTimeout();

        try {
            await commandSender.send('wb', 'Battle');
        } catch (error) {
            console.error(`❌ Gagal Hunt: ${error.message || error}`);
        } finally {
            const d = randomInt(
                state.config.delays.hunt.min,
                state.config.delays.hunt.max
            );

            this._scheduleLoop('hunt', () => this.hunt(), d);
        }
    },
    
    async battle() {
        if (state.config.botStatus.paused || !state.config.settings?.battle) return;

        while (state.isBusy) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        state.isBusy = true;

        try {
            await commandSender.send('wb', 'Battle');
            await new Promise(resolve => setTimeout(resolve, 10));
            if (state.config.botStatus.paused || !state.config.settings?.battle) return;
            await commandSender.send('wh', 'Hunt');
        } catch (error) {
            log.error(`${accountPrefix(state)}❌ Gagal Battle/Hunt: ${error.message || error}`);
        } finally {
            state.isBusy = false;

            const d = randomInt(
                state.config.delays.battle.min,
                state.config.delays.battle.max
            );
            this._scheduleLoop('battle', () => this.battle(), d);
        }
    },

    async pray() {
        if (state.config.botStatus.paused || !state.config.settings?.pray) return;

        try {
            await commandSender.send('wpray', 'Pray');
        } catch (error) {
            log.error(`${accountPrefix(state)}❌ Gagal Pray: ${error.message || error}`);
        } finally {
            const d = randomInt(
                state.config.delays.pray.min,
                state.config.delays.pray.max
            );
            this._scheduleLoop('pray', () => this.pray(), d);
        }
    },

    async custom1() {
        if (state.config.botStatus.paused || !state.config.settings?.custom) return;

        const text = state.config.settings.text1?.trim();
        if (!text) return;

        while (state.isBusy) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        state.isBusy = true;

        try {
            await commandSender.send(text, 'Custom1');
        } catch (error) {
            log.error(`${accountPrefix(state)}❌ Gagal Custom1: ${error.message || error}`);
        } finally {
            state.isBusy = false;

            const min = state.config.delays.custom1?.min || 60000;
            const max = state.config.delays.custom1?.max || 120000;
            const d = randomInt(min, max);
            this._scheduleLoop('custom1', () => this.custom1(), d);
        }
    },

    async custom2() {
        if (state.config.botStatus.paused || !state.config.settings?.custom) return;

        const text = state.config.settings.text2?.trim();
        if (!text) return;

        try {
            await commandSender.send(text, 'Custom2');
        } catch (error) {
            log.error(`${accountPrefix(state)}❌ Gagal Custom2: ${error.message || error}`);
        } finally {
            const min = state.config.delays.custom2?.min || 60000;
            const max = state.config.delays.custom2?.max || 120000;
            const d = randomInt(min, max);
            this._scheduleLoop('custom2', () => this.custom2(), d);
        }
    },

    async otherCommand(index, remaining) {
        const command = state.config.otherCommands?.[index];
        const key = `other${index + 1}`;
        if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) return;

        // count kosong/0 = infinite.
        const infinite = !(Number(command.count) > 0);
        const sendsLeft = infinite
            ? Infinity
            : Math.max(1, Number.isFinite(Number(remaining)) && Number(remaining) > 0 ? Number(remaining) : Number(command.count));
        const pauseOnCaptcha = command.captchaEnabled !== false;
        if (state.rest?.active || (pauseOnCaptcha && state.hasActiveCaptcha)) {
            this._scheduleOtherCommandDelay(index, sendsLeft, 0);
            return;
        }

        let sent = false;
        try {
            sent = await commandSender.send(
                command.text.trim(),
                `Other Command ${index + 1}`,
                command.channelId.trim(),
                // CAPTCHA OFF hanya berlaku untuk Custom Command ini, bukan fitur lain.
                pauseOnCaptcha ? {} : { allowDuringCaptcha: true, allowWhilePaused: true }
            );
        } catch (error) {
            log.error(`${accountPrefix(state)}❌ Gagal Other Command ${index + 1}: ${error.message || error}`);
        }

        if (!command.enabled) return;

        // Hanya command yang benar-benar terkirim yang mengurangi target pengiriman.
        if (!sent) {
            this._scheduleOtherCommandDelay(index, sendsLeft, command.delayMs);
        } else if (sendsLeft > 1) {
            this._scheduleOtherCommandDelay(index, infinite ? Infinity : sendsLeft - 1, command.delayMs);
        } else {
            state.loops[key] = null;
            command.enabled = false;
            if (typeof state.persistConfig === 'function') state.persistConfig();
            log.info(`${accountPrefix(state)}✅ Other Command ${index + 1} selesai (${command.count} pengiriman).`);
        }
    },

    _scheduleOtherCommandDelay(index, remaining, delayMs) {
        const key = `other${index + 1}`;
        const command = state.config.otherCommands?.[index];
        if (!command?.enabled) return;

        state.otherCommandDelays = state.otherCommandDelays || {};
        const delay = {
            index,
            remaining,
            remainingMs: Math.max(0, Number(delayMs) || 0),
            startedAt: null,
            timer: null,
            paused: command.captchaEnabled !== false && state.hasActiveCaptcha,
            restPaused: !!state.rest?.active
        };
        state.otherCommandDelays[key] = delay;

        const resumeDelay = () => {
            if (state.otherCommandDelays?.[key] !== delay || !command.enabled) return;
            if (delay.paused || delay.restPaused) return;
            delay.startedAt = Date.now();
            delay.timer = setTimeout(() => {
                if (state.otherCommandDelays?.[key] !== delay || !command.enabled) return;
                state.otherCommandDelays[key] = null;
                state.loops[key] = null;
                this.otherCommand(index, remaining);
            }, delay.remainingMs);
            state.loops[key] = delay.timer;
            state.nextAt[key] = Date.now() + delay.remainingMs;
        };
        delay.resume = resumeDelay;
        resumeDelay();
    },

    // reason 'captcha' (default) hanya untuk slot dengan captcha; 'rest' menjeda semua slot.
    pauseOtherCommandDelays({ reason = 'captcha' } = {}) {
        const flag = reason === 'rest' ? 'restPaused' : 'paused';
        Object.entries(state.otherCommandDelays || {}).forEach(([key, delay]) => {
            const command = state.config.otherCommands?.[delay?.index];
            if (!delay || delay[flag]) return;
            if (reason !== 'rest' && command?.captchaEnabled === false) return;
            const wasRunning = !delay.paused && !delay.restPaused;
            delay[flag] = true;
            if (!wasRunning) return;
            if (delay.timer) clearTimeout(delay.timer);
            delay.timer = null;
            delay.remainingMs = Math.max(0, delay.remainingMs - (Date.now() - (delay.startedAt || Date.now())));
            delay.startedAt = null;
            state.loops[key] = null;
            delete state.nextAt[key];
        });
    },

    resumeOtherCommandDelays({ reason = 'captcha' } = {}) {
        const flag = reason === 'rest' ? 'restPaused' : 'paused';
        Object.values(state.otherCommandDelays || {}).forEach(delay => {
            if (!delay?.[flag]) return;
            delay[flag] = false;
            if (!delay.paused && !delay.restPaused) delay.resume();
        });
    },

    startOtherCommand(index) {
        const command = state.config.otherCommands?.[index];
        if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) return false;

        const key = `other${index + 1}`;
        const delay = state.otherCommandDelays?.[key];
        if (delay?.timer) clearTimeout(delay.timer);
        if (state.otherCommandDelays) state.otherCommandDelays[key] = null;
        if (state.loops[key]) clearTimeout(state.loops[key]);
        state.loops[key] = null;
        this.otherCommand(index, command.count);
        return true;
    },

    stopOtherCommand(index) {
        const command = state.config.otherCommands?.[index];
        const key = `other${index + 1}`;
        const delay = state.otherCommandDelays?.[key];
        if (delay?.timer) clearTimeout(delay.timer);
        if (state.otherCommandDelays) state.otherCommandDelays[key] = null;
        if (state.loops[key]) clearTimeout(state.loops[key]);
        state.loops[key] = null;
        if (command) command.enabled = false;
        if (typeof state.persistConfig === 'function') state.persistConfig();
        log.info(`${accountPrefix(state)}⏹️ Other Command ${index + 1} dihentikan.`);
    },

    stopOtherCommands() {
        (state.config.otherCommands || []).forEach((_, index) => this.stopOtherCommand(index));
    },

    startAll() {
        this.init();
        this.stopAll();

        if (state.rest?.active) {
            log.info(`${accountPrefix(state)}😴 Start loop ditunda: sedang istirahat.`);
            return false;
        }

        const isFirstLoopStartup = !state.hasUsedFirstLoopStartupStagger;
        state.hasUsedFirstLoopStartupStagger = true;

        let stagger = isFirstLoopStartup ? (state.startupJitterMs || 0) : randomInt(0, 1200);
        const accountJitter = stagger;
        const bump = () => {
            stagger += isFirstLoopStartup ? 5000 : randomInt(800, 1000);
            return stagger;
        };

        if (isFirstLoopStartup) {
            log.info(`${accountPrefix(state)}⏳ First loop startup: command awal loop diantrikan per 5 detik + jitter akun ${accountJitter}ms.`);
        }

        const scheduleStartup = (key, fn) => {
            state.loops[key] = setTimeout(() => {
                state.loops[key] = null;
                this._resumeLoop(key, fn);
            }, bump());
        };

        if (state.config.settings?.battle)
            scheduleStartup('battle', () => this.battle());

        if (state.config.settings?.hunt && typeof this.hunt === 'function')
            scheduleStartup('hunt', () => this.hunt());

        if (state.config.settings?.pray)
            scheduleStartup('pray', () => this.pray());

        if (state.config.settings?.custom) {
            if (state.config.settings.text1?.trim())
                scheduleStartup('custom1', () => this.custom1());

            if (state.config.settings.text2?.trim())
                scheduleStartup('custom2', () => this.custom2());
        }

        log.success(`${accountPrefix(state)}🔄 Semua loop dimulai / resume`);
        return true;
    },

    stopAll() {
        let stopped = false;
        ['battle', 'hunt', 'pray', 'custom1', 'custom2'].forEach(key => {
            if (state.loops[key]) {
                clearTimeout(state.loops[key]);
                state.loops[key] = null;
                stopped = true;
            }
        });

        if (state.responseTimeout) {
            clearTimeout(state.responseTimeout);
            state.responseTimeout = null;
            stopped = true;
        }

        if (stopped) log.info(`${accountPrefix(state)}⏹️ Semua loop dihentikan`);
    }
});
