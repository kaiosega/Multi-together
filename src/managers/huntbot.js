const CONSTANTS = require('../constants');
const log = require('../../logger');
const { sleep, randomInt, removeInvisibleChars, accountPrefix } = require('../utils');
//const HUNTBOT_CHANNEL_ID = '1378917898063446156';

const RETURN_TIME_PATTERN = /I WILL BE BACK IN\s+([\d\sDHM]+)/i;
const SHORT_RETURN_TIME_PATTERN = /BACK IN\s+([\d\sDHM]+)/i;
const HUNTBOT_PROGRESS_PATTERN = /BEEP BOOP|I AM STILL HUNTING|I WILL BE BACK IN|\d+\.?\d*%\s*DONE|ANIMALS\s*CAPTURED/i;
const HUNTBOT_CHANNEL_RESPONSE_PATTERN = /BEEP BOOP|I AM STILL HUNTING|I WILL BE BACK IN|BACK IN|\d+\.?\d*%\s*DONE|ANIMALS\s*CAPTURED|YOU SPENT|Here is your password!|sold.*for a total of|sacrificed.*for a total of|You successfully upgraded/i;

const HUNTBOT_RESPONSE_WINDOW_MS = 2 * 60 * 1000;

const getMessageReferenceId = (msg = {}) => (
    msg.reference?.messageId ||
    msg.messageReference?.messageId ||
    msg.reference?.id ||
    msg.messageReference?.id ||
    null
);

const parseReturnTimeMs = (returnTime = '') => {
    const days = parseInt(String(returnTime).match(/(\d+)\s*D/i)?.[1] || '0', 10);
    const hours = parseInt(String(returnTime).match(/(\d+)\s*H/i)?.[1] || '0', 10);
    const minutes = parseInt(String(returnTime).match(/(\d+)\s*M/i)?.[1] || '0', 10);
    return ((days * 24 * 60) + (hours * 60) + minutes) * 60 * 1000;
};

const collectEmbedText = (embed = {}) => [
    embed.title,
    embed.description,
    embed.author?.name,
    embed.footer?.text,
    ...(embed.fields || []).flatMap(field => [field.name, field.value])
].filter(Boolean).join('\n');

module.exports = (state, huntbotState, configManager, commandSender, telegramService, captchaSolver) => ({

    // ============== MAIN ENTRY POINT ==============
    processHuntBotMessage(msg) {
        const content = removeInvisibleChars(msg.content || "");
        const author = msg.author.id;
        
        // Only process OwO messages
        if (!CONSTANTS.OWO_IDS.includes(author)) return false;

        const myName = this.getMyName(msg);
        
        // CEK EMBED (untuk progress update / hasil command whb yang sering tidak masuk content biasa)
        if (msg.embeds && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
                const embedText = removeInvisibleChars(collectEmbedText(embed));
                const embedAuthorName = String(embed.author?.name || '').toLowerCase();
                const isOwnEmbed = this.isOwnHuntbotResponse(msg, embedText, myName);

                if (isOwnEmbed && /YOU SPENT/i.test(embedText) && RETURN_TIME_PATTERN.test(embedText)) {
                    return this.processHuntStartedMessage(msg, embedText);
                }

                if (isOwnEmbed && (embedAuthorName.includes('huntbot') || HUNTBOT_PROGRESS_PATTERN.test(embedText))) {
                    return this.processEmbedMessage(msg, embed, myName);
                }
            }
        }

        const isOwnResponse = this.isOwnHuntbotResponse(msg, content, myName);

        // Pengecualian khusus untuk pesan pulang/progress HuntBot hanya boleh diproses
        // jika respons tersebut bisa dikaitkan ke command akun runtime ini.
        const isReturnMessage = isOwnResponse && content.includes("BEEP BOOP. I AM BACK WITH");
        const isHuntbotProgressMessage = isOwnResponse && HUNTBOT_PROGRESS_PATTERN.test(content);


        // CEK CONTENT 
        if (isOwnResponse) {
            
            if (isReturnMessage) {
                return this.processReturnMessage(msg, content);
            }
            
            if (content.includes("sold") && content.includes("for a total of")) {
                return this.processSellMessage(msg, content);
            }
            
            if (content.includes("sacrificed") && content.includes("for a total of")) {
                return this.processSacrificeMessage(msg, content);
            }
            
            if (content.includes("You successfully upgraded")) {
                return this.processUpgradeText(msg, content);
            }
            
            if (content.includes("Here is your password!")) {
                return this.processPasswordMessage(msg);
            }
            
            if (/YOU SPENT/i.test(content) && RETURN_TIME_PATTERN.test(content)) {
                return this.processHuntStartedMessage(msg, content);
            }

            if (isHuntbotProgressMessage) {
                return this.processProgressEmbed(msg, null, content, 'TEXT');
            }
        }

        return false;
    },


    // ============== HELPER METHODS ==============
isPaused() {
    return !!state.config?.botStatus?.paused;
},

    shouldAbort(actionName = "") {
        // 1. Cek langsung status CAPTCHA spesifik
        if (state.hasActiveCaptcha) { 
            log.warn(`${accountPrefix(state)}🛑 HuntBot action '${actionName}' dibatalkan: CAPTCHA aktif!`);
            return true;
        }

        if (state.rest?.active) {
            log.info(`${accountPrefix(state)}😴 HuntBot action '${actionName}' ditunda: sedang istirahat.`);
            return true;
        }

        // 2. Cek toggle setting huntbot. Config versi baru menyimpan HuntBot di root
        // `huntbot`, tetapi sebagian config lama pernah memakai `settings.huntbot`.
        if (state.config?.huntbot?.enabled === false || state.config?.settings?.huntbot?.enabled === false) {
            log.warn(`${accountPrefix(state)}🛑 HuntBot action '${actionName}' dibatalkan: huntbot OFF`);
            return true;
        }
        
        return false;
    },




    pruneTrackedCommands() {
        const now = Date.now();
        huntbotState.outgoingCommands = huntbotState.outgoingCommands || new Map();
        for (const [messageId, meta] of huntbotState.outgoingCommands.entries()) {
            if (!meta?.sentAt || now - meta.sentAt > HUNTBOT_RESPONSE_WINDOW_MS) {
                huntbotState.outgoingCommands.delete(messageId);
            }
        }
    },

    trackOutgoingCommand(sentMessage, cmd) {
        if (!sentMessage?.id) return false;
        huntbotState.outgoingCommands = huntbotState.outgoingCommands || new Map();
        huntbotState.outgoingCommands.set(sentMessage.id, {
            cmd,
            channelId: sentMessage.channel?.id || sentMessage.channelId || state.config.tiketandhb?.channelId,
            sentAt: sentMessage.createdTimestamp || Date.now()
        });
        this.pruneTrackedCommands();
        return true;
    },

    trackManualHuntbotCommand(msg) {
        const myId = state.client?.user?.id;
        const content = String(msg.content || '').trim();
        if (!myId || msg.author?.id !== myId) return false;
        if (msg.channel?.id !== state.config.tiketandhb?.channelId) return false;
        if (!/^whb(?:\s|$)/i.test(content)) return false;

        const tracked = this.trackOutgoingCommand(msg, content);
        if (tracked) {
            log.info(`${accountPrefix(state)}🧭 Manual HuntBot command tracked: ${content}`);
        }
        return tracked;
    },

    isOwnHuntbotResponse(msg, text = '', myName = this.getMyName(msg)) {
        const huntbotChannelId = state.config.tiketandhb?.channelId;
        if (msg.channel?.id !== huntbotChannelId) return false;

        const rawText = String(text || '');
        const normalizedText = rawText.toLowerCase();
        const myId = state.client?.user?.id;
        const containsMyName = myName && normalizedText.includes(String(myName).toLowerCase());
        const isMentioned = myId && (rawText.includes(`<@${myId}>`) || msg.mentions?.users?.has(myId));
        if (containsMyName || isMentioned) return true;

        // Balasan `whb 1d` saat HuntBot belum bisa dijemput sering berupa plain text
        // `I WILL BE BACK IN ...` tanpa nama akun. Karena tiap akun memakai channel
        // HuntBot/tiket khusus, teks HuntBot di channel config akun ini dianggap milik akun ini.
        if (HUNTBOT_CHANNEL_RESPONSE_PATTERN.test(rawText)) return true;

        this.pruneTrackedCommands();
        const referenceId = getMessageReferenceId(msg);
        if (!referenceId) return false;

        const commandMeta = huntbotState.outgoingCommands?.get(referenceId);
        if (!commandMeta) return false;
        if (commandMeta.channelId && commandMeta.channelId !== msg.channel.id) return false;

        return Date.now() - commandMeta.sentAt <= HUNTBOT_RESPONSE_WINDOW_MS;
    },



    getMyName(msg) {
        return msg.guild?.members?.me?.displayName || state.client.user.username;
    },

    // 7. HUNT BERJALAN (EMBED)
    processEmbedMessage(msg, embed, myName) {
        log.info(`${accountPrefix(state)}📊 HuntBot embed detected`);

        const embedText = removeInvisibleChars(collectEmbedText(embed));
        if (/BEEP BOOP|BACK IN|I WILL BE BACK IN/i.test(embedText)) {
            return this.processProgressEmbed(msg, embed, embedText);
        }

        if (embed.fields && embed.fields.length > 0) {
            for (const field of embed.fields) {
                if (field.value && /BEEP BOOP|BACK IN|I WILL BE BACK IN/i.test(field.value)) {
                    return this.processProgressEmbed(msg, embed, field.value);
                }
            }
        }
        
        return false;
    },

    // ============== PROCESS SACRIFICE ==============
    processSacrificeMessage(msg, content) {
        log.info(`${accountPrefix(state)}🔪 HuntBot sacrificed items`);
        
        const cleanContent = removeInvisibleChars(content);
        log.info(`${accountPrefix(state)}🔍 Clean Sacrifice: ${cleanContent}`);
        
        const essenceMatch = cleanContent.match(/total of.*?([\d,]+)/i);
        
        let essenceGained = 0;

        if (essenceMatch) {
            essenceGained = parseInt(essenceMatch[1].replace(/,/g, ''));
            log.info(`${accountPrefix(state)}🔍 Essence gained: ${essenceGained}`);
        } else {
            log.warn(`${accountPrefix(state)}❌ Could not extract essence from: ${cleanContent}`);
        }
        
        telegramService.send(
            `🔪 <b>Sacrifice Complete</b>\n` +
            `Essence gained: ${essenceGained.toLocaleString()}`
        );
        
// huntbot.js
if (huntbotState.autoMode) {
    // Ambil dari state.config (mengikuti pola loop.js yang sudah berhasil)
    const upgradeType = state.config?.huntbot?.defaultUpgrade || "duration";

    log.info(`${accountPrefix(state)}🧭 HuntBot default upgrade dari config: ${upgradeType}`);

    this.scheduleDelayedAction(() => this.upgrade(upgradeType, "all"), 1000);
}

        
        return true;
    },

    // ============== PROCESS UPGRADE ==============
    processUpgradeText(msg, content) {
        log.info(`${accountPrefix(state)}⬆️ Processing upgrade text response`);
        
        const cleanContent = removeInvisibleChars(content);
        log.info(`${accountPrefix(state)}🔍 Clean Upgrade: ${cleanContent}`);
        
        let duration = null;
        let level = null;
        let progress = null;
        let essence = null;
        
        const essenceMatch = cleanContent.match(/total of.*?>\s*([\d,]+)/i);
        if (essenceMatch) {
            essence = parseInt(essenceMatch[1].replace(/,/g, ''));
            log.info(`${accountPrefix(state)}🔍 Essence used: ${essence}`);
        }
        
        const durationMatch = cleanContent.match(/duration:\s*([\d.]+H)\s*-\s*Lvl\s*(\d+)\s*\[(\d+)\/(\d+)\]/i);
        if (durationMatch) {
            duration = durationMatch[1];
            level = parseInt(durationMatch[2]);
            progress = `${durationMatch[3]}/${durationMatch[4]}`;
            log.info(`${accountPrefix(state)}🔍 Duration: ${duration}, Level: ${level}, Progress: ${progress}`);
        } else {
            log.warn(`${accountPrefix(state)}❌ Could not extract duration/level from upgrade`);
        }
        
        huntbotState.lastUpgradeLevel = { duration, level, progress, essence, raw: content };
        
        telegramService.send(
            `⬆️ <b>Upgrade Complete</b>\n` +
            `Duration: ${duration || 'N/A'}\n` +
            `Level: ${level || 'N/A'}\n` +
            `Essence: ${essence ? essence.toLocaleString() : 'N/A'}`
        );
        
        if (huntbotState.autoMode) {
            this.scheduleDelayedAction(() => this.startHunt("1D"), 1000);
        }
        
        return true;
    },

    // ============== PROCESS PROGRESS (EMBED) ==============
    processProgressEmbed(msg, embed, progressText, source = 'EMBED') {
        log.info(`${accountPrefix(state)}📊 HuntBot progress update (${source})`);
        
        const cleanText = removeInvisibleChars(progressText);
        log.info(`${accountPrefix(state)}🔍 Clean Progress: ${cleanText}`);
        
        let returnTime = null;
        
        const backInMatch = cleanText.match(SHORT_RETURN_TIME_PATTERN);
        if (backInMatch) {
            returnTime = backInMatch[1].trim();
        }
        
        const percentMatch = cleanText.match(/(\d+\.?\d*)%\s*DONE/i);
        const percentage = percentMatch ? parseFloat(percentMatch[1]) : null;
        
        const animalsMatch = cleanText.match(/(\d+)\s*ANIMALS\s*CAPTURED/i);
        const animals = animalsMatch ? parseInt(animalsMatch[1]) : null;
        
        log.info(`${accountPrefix(state)}📊 Extracted - Time: ${returnTime}, Percentage: ${percentage}%, Animals: ${animals}`);
        
        huntbotState.lastProgress = { percentage, animals, returnTime, raw: progressText };
        
        if (percentage !== null && percentage >= 90) {
            telegramService.send(
                `⚠️ <b>HuntBot Almost Done!</b>\n` +
                `${percentage}% complete\n` +
                `Animals: ${animals || 'unknown'}`
            );
        }
        
        if (returnTime) {
            huntbotState.activeHunt = huntbotState.activeHunt || {};
            huntbotState.activeHunt.returnTime = returnTime;
            
            const totalMs = parseReturnTimeMs(returnTime);
            
            if (totalMs > 0) {
                huntbotState.activeHunt.endTime = Date.now() + totalMs;
                
                const endTimeStr = new Date(huntbotState.activeHunt.endTime).toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                log.info(`${accountPrefix(state)}📊 End time updated: ${endTimeStr} WIB`);
                
                // FIX UTAMA: Pastikan monitoring menyala setelah membaca embed
                this.startMonitoring();
            }
        }
        
        return true;
    },

    // ============== PROCESS RETURN ==============
    processReturnMessage(msg, content) {
        log.info(`${accountPrefix(state)}🤖 HuntBot returned with animals!`);
        
        const cleanContent = removeInvisibleChars(content);
        
        const animalMatch = cleanContent.match(/WITH ([\d,]+) ANIMALS/i);
        const essenceMatch = cleanContent.match(/([\d,]+) ESSENCE/i);
        const expMatch = cleanContent.match(/([\d,]+) EXPERIENCE/i);
        
        const animals = animalMatch ? parseInt(animalMatch[1].replace(/,/g, '')) : 0;
        const essence = essenceMatch ? parseInt(essenceMatch[1].replace(/,/g, '')) : 0;
        const exp = expMatch ? parseInt(expMatch[1].replace(/,/g, '')) : 0;
        
        huntbotState.lastResponse = { animals, essence, exp };
        
        telegramService.send(
            `🤖 <b>HuntBot Returned!</b>\n` +
            `Animals: ${animals.toLocaleString()}\n` +
            `Essence: ${essence.toLocaleString()}\n` +
            `Experience: ${exp.toLocaleString()}`
        );
        
        if (huntbotState.autoMode) {
            const useSellAll = state.config?.huntbot?.sellAllAfterReturn === true;
            if (useSellAll) {
                log.info(`${accountPrefix(state)}💰 Sell All setelah penjemputan aktif: mengirim wsell all lalu skip upgrade.`);
                this.scheduleDelayedAction(() => this.sellAll(), 1000);
            } else {
                this.scheduleDelayedAction(() => this.sacrificeAll(), 1000);
            }
        }
        
        return true;
    },

    // ============== PROCESS SELL ==============
    processSellMessage(msg, content) {
        log.info(`${accountPrefix(state)}💰 HuntBot sold items`);
        const cleanContent = removeInvisibleChars(content);
        const cowoncyMatch = cleanContent.match(/total of .*?([\d,]+)/i);
        const cowoncy = cowoncyMatch ? parseInt(cowoncyMatch[1].replace(/,/g, '')) : 0;
        
        telegramService.send(`💰 <b>Sale Complete</b>\nCowoncy gained: ${cowoncy.toLocaleString()}`);

        if (huntbotState.autoMode && state.config?.huntbot?.sellAllAfterReturn === true) {
            const duration = CONSTANTS.HUNTBOT.DEFAULT_DURATION;
            log.info(`${accountPrefix(state)}🚀 Sell All selesai: skip wupg dan memulai HuntBot lagi (${duration}).`);
            this.scheduleDelayedAction(() => this.startHunt(duration), 1000);
        }

        return true;
    },

    // ============== PROCESS PASSWORD (CAPTCHA) ==============
    async processPasswordMessage(msg) {
        log.info(`${accountPrefix(state)}🔐 HuntBot password received`);
        
        const attachment = msg.attachments?.first();
        if (!attachment || !attachment.url) {
            log.error(`${accountPrefix(state)}No image attachment found for captcha`);
            return false;
        }
        
        try {
            const password = await captchaSolver.solve(attachment.url);
            
            if (password) {
                log.success(`${accountPrefix(state)}✅ Captcha solved: ${password}`);
                huntbotState.pendingCaptcha = { password, messageId: msg.id };
                
                log.info(`${accountPrefix(state)}🤖 Mengirim password secara otomatis...`);
                this.scheduleDelayedAction(() => {
                    this.startHunt(CONSTANTS.HUNTBOT.DEFAULT_DURATION, password);
                }, 1000);
                
                telegramService.send(`🔐 <b>Captcha Solved & Sent</b>\nPassword: ${password}`);
            }
            return true;
        } catch (error) {
            log.error(`${accountPrefix(state)}Failed to solve captcha: ${error.message}`);
            return false;
        }
    },

    // ============== PROCESS HUNT STARTED ==============
    processHuntStartedMessage(msg, content) {
        log.info(`${accountPrefix(state)}🚀 HuntBot started successfully`);
        
        const cleanContent = removeInvisibleChars(content);
        const spentMatch = cleanContent.match(/YOU SPENT ([\d,]+) COWONCY/i);
        const returnTimeMatch = cleanContent.match(RETURN_TIME_PATTERN);
        
        const spent = spentMatch ? parseInt(spentMatch[1].replace(/,/g, '')) : 0;
        const returnTime = returnTimeMatch ? returnTimeMatch[1].trim() : "unknown";
        
        log.info(`${accountPrefix(state)}⏳ I WILL BE BACK IN ${returnTime}`);
        
        huntbotState.activeHunt = {
            startTime: Date.now(),
            returnTime,
            spent,
            messageId: msg.id
        };
        
        if (returnTime !== "unknown") {
            const totalMs = parseReturnTimeMs(returnTime);
            if (totalMs > 0) {
                huntbotState.activeHunt.endTime = Date.now() + totalMs;
            }
        }
        
        telegramService.send(
            `🚀 <b>HuntBot Started!</b>\n` +
            `Spent: ${spent.toLocaleString()} cowoncy\n` +
            `Returns in: ${returnTime}`
        );
        
        this.startMonitoring();
        
        return true;
    },

    // ============== INITIALIZATION ==============
    init(options = {}) {
        log.info(`${accountPrefix(state)}⚙️ Initializing HuntBot Manager...`);
        const config = configManager.read() || {};
        
        // Memastikan loop menyala apapun kondisinya
        this.startMonitoring();
        
        // Mengecek apakah config.huntbot ada DAN autoMode-nya true (Struktur DeepSeek)
        const isAutoModeOn = (config.huntbot && config.huntbot.autoMode === true) || 
                             config.autoHuntbot === true || 
                             huntbotState.autoMode === true;
        
        if (isAutoModeOn) {
            log.info(`${accountPrefix(state)}🤖 HuntBot Auto-start detected in config.`);
            huntbotState.autoMode = false; // Reset sementara agar startAutoMode bisa me-restart statusnya
            this.startAutoMode({
                skipInitialCheck: options.skipInitialCheck,
                allowPaused: options.skipInitialCheck === true
            });
        } else {
            log.warn(`${accountPrefix(state)}⚠️ Auto Mode terdeteksi OFF di config.json`);
        }
    },

    // ============== CUSTOM SENDER ==============
// HUNTBOT.JS

async sendHuntBotCommand(cmd) {
    // 1. PERBAIKAN: Menggunakan state secara konsisten dan mengecek hasActiveCaptcha sebagai boolean.
    // Ditambahkan log agar kamu tahu persis kapan command ditahan.
    if (this.shouldAbort(`sendHuntBotCommand(${cmd})`)) return;

    try {
        const huntbotChannelId = state.config.tiketandhb.channelId;
        const channel = state.client.channels.cache.get(huntbotChannelId);

        if (!channel) {
            log.error(`${accountPrefix(state)}❌ Channel HuntBot (${huntbotChannelId}) belum ter-cache atau ID salah!`);

            return;
        }

        await channel.sendTyping();
        await sleep(randomInt(500, 1000)); 
        
        // 2. Re-check setelah sleep, biar pause yang dinyalakan saat nunggu tetap kepake
        // Asumsi: shouldAbort adalah metode valid dari class/objek ini yang mengecek status pause bot.
        if (this.shouldAbort(`sendHuntBotCommand(${cmd}) post-sleep`)) return;

        const sentMessage = await channel.send(cmd);
        this.trackOutgoingCommand(sentMessage, cmd);
        log.info(`${accountPrefix(state)}💬 [HuntBot Channel] Terkirim: ${cmd}`);

    } catch (error) {
        log.error(`${accountPrefix(state)}❌ Gagal mengirim command HuntBot: ${error.message}`);
    }
},


    // ============== COMMAND METHODS ==============
async checkStatus() {
    if (this.shouldAbort('checkStatus')) return;
    await this.sendHuntBotCommand(CONSTANTS.HUNTBOT.COMMANDS.CHECK);
},


    async sellAll() {
        await this.sendHuntBotCommand(CONSTANTS.HUNTBOT.COMMANDS.SELL);
    },

    async sacrificeAll() {
        await this.sendHuntBotCommand(CONSTANTS.HUNTBOT.COMMANDS.SACRIFICE);
    },

    async upgrade(type = CONSTANTS.HUNTBOT.DEFAULT_UPGRADE, amount = "all") {
        const cmd = `${CONSTANTS.HUNTBOT.COMMANDS.UPGRADE} ${type} ${amount}`;
        await this.sendHuntBotCommand(cmd);
    },

    async startHunt(duration = CONSTANTS.HUNTBOT.DEFAULT_DURATION, password = "") {
        if (password) {
            huntbotState.activeHunt = null;
            huntbotState.notifiedSoon = false;
        }

        const cmd = password 
            ? `${CONSTANTS.HUNTBOT.COMMANDS.CHECK} ${duration} ${password}`
            : `${CONSTANTS.HUNTBOT.COMMANDS.CHECK} ${duration}`;
        
        await this.sendHuntBotCommand(cmd);
    },

    // ============== AUTO MODE & MONITORING ==============
        // ============== AUTO MODE & MONITORING ==============
    startAutoMode(options = {}) {
        if (this.shouldAbort('startAutoMode', { allowPaused: options.allowPaused === true })) return;
        
        if (huntbotState.autoMode) return;
        huntbotState.autoMode = true;
        log.success(`${accountPrefix(state)}🤖 HuntBot Auto Mode ACTIVE`);
        telegramService.send("🤖 <b>HuntBot Auto Mode</b>\nStarting auto loop...");
        
        this.startMonitoring();
        if (!options.skipInitialCheck) {
            this.checkStatus();
        } else {
            log.info(`${accountPrefix(state)}🤖 Initial HuntBot check dilewati karena startup ready sequence yang mengirim whb.`);
        }
    },


    stopAutoMode(options = {}) {
        huntbotState.autoMode = false;
        
        // PENGAMAN: Pastikan objek loops ada
        huntbotState.loops = huntbotState.loops || {};

        if (huntbotState.loops.monitor) {
            clearInterval(huntbotState.loops.monitor);
            huntbotState.loops.monitor = null;
        }
        log.info(`${accountPrefix(state)}🤖 HuntBot Auto Mode STOPPED`);
        if (options.notify !== false) {
            telegramService.send("🤖 <b>HuntBot Auto Mode</b>\nLoop stopped.");
        }
    },

scheduleDelayedAction(fn, delayMs) {
    huntbotState.timeouts = huntbotState.timeouts || new Set();
    const timer = setTimeout(() => {
        huntbotState.timeouts.delete(timer);
        if (!this.shouldAbort('delayed HuntBot action')) fn();
    }, delayMs);
    huntbotState.timeouts.add(timer);
    return timer;
},

startMonitoring() {
    huntbotState.loops = huntbotState.loops || {};

    if (huntbotState.loops.monitor) {
        clearInterval(huntbotState.loops.monitor);
    }
    log.info(`${accountPrefix(state)}⏱️ Mesin monitoring waktu HuntBot diaktifkan.`);

    huntbotState.loops.monitor = setInterval(() => {


        this.checkActiveHunt();
    }, 60000);
},

checkActiveHunt() {
    if (state.hasActiveCaptcha || state.rest?.active) return;
    if (!huntbotState.activeHunt?.endTime) return;
        
        const now = Date.now();
        const timeLeft = huntbotState.activeHunt.endTime - now;
        
        // Notif 5 menit sebelum selesai (H-5)
        if (timeLeft > 0 && timeLeft <= 5 * 60 * 1000 && !huntbotState.notifiedSoon) {
            huntbotState.notifiedSoon = true;
            log.info(`${accountPrefix(state)}⏰ Waktu sisa < 5 menit. Mengirim notifikasi Telegram...`);
            telegramService.send(`⏰ <b>HuntBot Returning Soon!</b>\nLess than 5 minutes remaining!`);
        }
        
        // Auto check saat waktu habis (Bot menjemput secara otomatis)
        if (timeLeft <= 0) {
            log.info(`${accountPrefix(state)}⏰ Waktu HuntBot telah habis!`);
            
            // Reset status agar tidak dikirim berulang kali
            huntbotState.notifiedSoon = false;
            huntbotState.activeHunt = null; 
            
            if (huntbotState.autoMode) {
                log.info(`${accountPrefix(state)}🚀 Auto-Mode ON: Menjemput HuntBot dengan command whb...`);
                this.checkStatus();
            } else {
                log.warn(`${accountPrefix(state)}⚠️ Auto-Mode OFF: Huntbot Selesai, menunggu aksi manual.`);
                telegramService.send(`⏰ <b>HuntBot Selesai!</b>\nSilakan kirim 'whb' secara manual untuk menjemput.`);
            }
        }
    },

    stop(options = {}) {
        this.stopAutoMode(options);
        if (huntbotState.timeouts) {
            for (const timer of huntbotState.timeouts) clearTimeout(timer);
            huntbotState.timeouts.clear();
        }
        huntbotState.activeHunt = null;
        huntbotState.pendingCaptcha = null;
    },

    getStatus() {
        return {
            autoMode: huntbotState.autoMode,
            activeHunt: huntbotState.activeHunt,
            lastUpgrade: huntbotState.lastUpgradeLevel,
            lastProgress: huntbotState.lastProgress,
            hasPendingCaptcha: !!huntbotState.pendingCaptcha
        };
    }
});
