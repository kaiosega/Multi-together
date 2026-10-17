const CONSTANTS = require('../constants');
const log = require('../../logger');
const { accountPrefix } = require('../utils');
const statsService = require('../services/stats');

const MESSAGE_DEBUG_LIMIT = 25;

const toJsonValue = (value) => {
    if (value === undefined || value === null) return value;
    try {
        if (typeof value.toJSON === 'function') return value.toJSON();
        return value;
    } catch {
        return '[Tidak dapat diserialisasi ke JSON]';
    }
};

module.exports = (state, configManager, bossManager, captchaHandler, loopManager, channelManager, telegramService, macrodroidService, huntbotManager, commandSender, voiceManager, adventureManager, boss2Manager, gemsManager) => ({
    async handleUpdate(msg) {
        if (!state.client?.isReady() || !boss2Manager) return;
        try {
            if (msg.partial) msg = await msg.fetch();
            await boss2Manager.handle(msg);
        } catch (error) {
            log.error(`${accountPrefix(state)}Gagal memproses edit pesan: ${error.message}`);
        }
    },

    async handle(msg) {
        if (!state.client?.isReady()) return;

        this.captureMessageDebug(msg);
        await this.handleControlCommands(msg);

        if (bossManager && typeof bossManager.trackManualTicketCommand === 'function') {
            bossManager.trackManualTicketCommand(msg);
        }

        if (huntbotManager && typeof huntbotManager.trackManualHuntbotCommand === 'function') {
            huntbotManager.trackManualHuntbotCommand(msg);
        }

        // ✅ FITUR BARU: Deteksi SEMUA pesan dari admin/orang lain di channel aktif
        await this.handleUserMessages(msg);

        // Adventure adalah automasi mandiri; jangan letakkan di handleOwOMessage.
        if (adventureManager) await adventureManager.handle(msg);

        if (boss2Manager) await boss2Manager.handle(msg);

        if (gemsManager) await gemsManager.handle(msg);

        if (CONSTANTS.OWO_IDS.includes(msg.author.id)) {
            await this.handleOwOMessage(msg);
        }

        if (msg.channel.type === 'DM' && CONSTANTS.OWO_IDS.includes(msg.author.id)) {
            if ((msg.content || '').toLowerCase().includes('verified')) {
                captchaHandler.resume();
                return;
            }
        }
    },

    captureMessageDebug(msg) {
        const debug = state.config.settings?.messageDebug || {};
        if (debug.enabled !== true) return false;

        const targetId = String(debug.targetId || '').trim();
        const channelId = String(debug.channelId || '').trim();
        const guildId = String(debug.guildId || '').trim();
        if ((targetId && String(msg.author?.id || '') !== targetId) ||
            (channelId && String(msg.channel?.id || msg.channelId || '') !== channelId) ||
            (guildId && String(msg.guild?.id || msg.guildId || '') !== guildId)) {
            return false;
        }

        const hasEmbeds = Array.isArray(msg.embeds) && msg.embeds.length > 0;
        const hasComponents = Array.isArray(msg.components) && msg.components.length > 0;
        const messageType = hasComponents ? 'components' : hasEmbeds ? 'embed' : 'text';
        const entry = {
            capturedAt: new Date().toISOString(),
            messageType,
            message: {
                id: msg.id,
                content: msg.content || '',
                author: toJsonValue(msg.author),
                channelId: msg.channel?.id || msg.channelId || null,
                guildId: msg.guild?.id || msg.guildId || null,
                embeds: (msg.embeds || []).map(toJsonValue),
                components: (msg.components || []).map(toJsonValue),
                attachments: toJsonValue(msg.attachments)
            }
        };

        state.messageDebugEntries = state.messageDebugEntries || [];
        state.messageDebugEntries.unshift(entry);
        if (state.messageDebugEntries.length > MESSAGE_DEBUG_LIMIT) state.messageDebugEntries.length = MESSAGE_DEBUG_LIMIT;

        log.info(`${accountPrefix(state)}🔎 Debug pesan ditangkap: ${messageType}, message=${msg.id}, channel=${entry.message.channelId || '-'}, guild=${entry.message.guildId || '-'}`);
        return true;
    },

    async handleControlCommands(msg) {
        const { startCmd, pauseCmd, allowIds } = configManager.getControlCommands();
        const text = String(msg.content || '').trim().toLowerCase();
        const isSelf = !!state.client.user && msg.author.id === state.client.user.id;

        if (text && typeof configManager.getLucyControlCommands === 'function') {
            const lucy = configManager.getLucyControlCommands();
            const isLucyController = isSelf || lucy.allowIds.includes(msg.author.id);
            if (isLucyController && (text === lucy.startCmd || text === lucy.pauseCmd)) {
                this.setLucyFeatures(text === lucy.startCmd);
                return;
            }
        }

        // Keamanan: Hanya eksekusi jika pengirim adalah akun bot itu sendiri atau ID yang diizinkan
        const isController = isSelf || allowIds.includes(msg.author.id);

        if (!isController) return;

        if (text === startCmd) {
            state.activeChannelId = msg.channel.id;
            state.config.botStatus.paused = false;
            state.config.botStatus.running = true;
            statsService.syncBotUptime(state);
            configManager.save();
            log.success(`${accountPrefix(state)}▶️ Start via Discord control.`);
            loopManager.startAll();
            telegramService.send(`▶️ <b>Bot Started</b> via Discord command`);
            return;
        }

        if (text === pauseCmd) {
            state.config.botStatus.paused = true;
            state.config.botStatus.running = false;
            statsService.syncBotUptime(state);
            configManager.save();
            log.warn(`${accountPrefix(state)}⏸️ Pause via Discord control.`);
            loopManager.stopAll();
            telegramService.send(`⏸️ <b>Bot Paused</b> via Discord command`);
            return;
        }

        // --- 🔊 FITUR BARU: JOIN VC ---
        if (text.startsWith("vjoin ")) {
            const args = text.split(" ");
            const channelId = args[1];

            if (channelId && voiceManager) {
                try {
                    const result = await voiceManager.join(channelId, { persist: true, source: 'command' });

                    if (!result) {
                        msg.react("❌").catch(()=>{});
                        return;
                    }

                    msg.react("✅").catch(()=>{});

                } catch (err) {
                    log.error(`${accountPrefix(state)}Gagal join VC: ${err.message}`);
                    msg.react("⚠️").catch(()=>{});
                }
            }
            return;
        }

        // --- 🔇 FITUR BARU: LEAVE VC ---
        if (text === "vleave") {
            try {
                if (!msg.guildId || !voiceManager) return;

                if (voiceManager.leave(msg.guildId)) {
                    log.info(`${accountPrefix(state)}🔇 Keluar dari VC di server ${msg.guild?.name || msg.guildId}`);
                    msg.react("👋").catch(()=>{});
                } else {
                    msg.react("❓").catch(()=>{});
                }
            } catch (err) {
                log.error(`${accountPrefix(state)}Gagal leave VC: ${err.message}`);
            }
            return;
        }
    },

    // Lucy (Boss2, Gems, Adventure, Custom Commands Lucy) berjalan terpisah dari loop OwO.
    setLucyFeatures(enabled) {
        const settings = state.config.settings = state.config.settings || {};
        settings.boss2 = { ...(settings.boss2 || {}), enabled };
        settings.gems = { ...(settings.gems || {}), enabled };
        settings.adventure = { ...(settings.adventure || {}), enabled };
        const otherCommands = Array.isArray(state.config.otherCommands) ? state.config.otherCommands : [];
        otherCommands.forEach(command => { if (command) command.enabled = enabled; });
        configManager.save();

        // Sama seperti route dashboard (multiAccountManager.start/stopAdventure & start/stopOtherCommand):
        // flag saja tidak cukup karena timer/loop yang sudah terjadwal tidak dibatalkan/dimulai ulang.
        if (enabled) {
            if (adventureManager) {
                adventureManager.start({ restart: true }).catch(error => log.error(`${accountPrefix(state)}❌ Auto Adventure gagal dimulai: ${error.message}`));
            }
            otherCommands.forEach((_, index) => loopManager?.startOtherCommand?.(index));
            log.success(`${accountPrefix(state)}▶️ Lucy start via Discord control.`);
            telegramService?.send?.(`▶️ <b>Lucy Started</b> via Discord command`);
        } else {
            adventureManager?.stop?.();
            otherCommands.forEach((_, index) => loopManager?.stopOtherCommand?.(index));
            boss2Manager?.stop?.();
            gemsManager?.stop?.();
            log.warn(`${accountPrefix(state)}⏸️ Lucy pause via Discord control.`);
            telegramService?.send?.(`⏸️ <b>Lucy Paused</b> via Discord command`);
        }
    },

    // ✅ FITUR BARU: Fungsi pengawas CCTV (Semua pesan dari user lain)
    async handleUserMessages(msg) {
        const myId = state.client?.user?.id;

        if (state.config.safety.cctv === false || !myId) return;

        if (msg.author.id === myId || msg.author.bot) return;

        const isActiveChannel = (state.activeChannelId && msg.channel.id === state.activeChannelId) ||
                                (state.config.channels && state.config.channels.includes(msg.channel.id));

        if (!isActiveChannel) return;

        const isMentioned = msg.mentions?.users?.has(myId) || msg.content.includes(myId);
        const isReplyToMe = msg.type === 'REPLY' && msg.mentions?.repliedUser?.id === myId;

        let alertType = "PESAN BARU";
        if (isMentioned) alertType = "MENTION / TAG";
        if (isReplyToMe) alertType = "REPLY MESSAGE";

        log.warn(`${accountPrefix(state)}💬 ${alertType} terdeteksi dari ${msg.author.username}! Meneruskan ke Telegram...`);

        const senderName = msg.author.username;
        const channelName = msg.channel.name || 'DM/Unknown';
        const content = msg.content || '[Hanya Attachment / Kosong]';
        const serverId = msg.guild ? msg.guild.id : '@me';
        const messageUrl = `https://discord.com/channels/${serverId}/${msg.channel.id}/${msg.id}`;

        const tgMessage = `👀 <b>${alertType} DETECTED!</b>\n` +
                          `👤 <b>Dari:</b> ${senderName}\n` +
                          `🏠 <b>Channel:</b> #${channelName}\n` +
                          `📝 <b>Pesan:</b> <i>${content}</i>\n\n` +
                          `🔗 <a href="${messageUrl}">Klik untuk melihat pesan</a>`;

        telegramService.send(tgMessage);

        if (macrodroidService) {
            await macrodroidService.trigger("pesanbaru");
        }
    },

    async handleOwOMessage(msg) {
        const isForMe = this._isResponseForMe(msg);

        if (state.responseTimeout && isForMe) {
            commandSender.clearResponseTimeout();
        }

        if (captchaHandler.isCaptcha(msg.content)) {
            const myId = state.client?.user?.id;
            const isMentioned = myId ? (msg.mentions?.users?.has(myId) || msg.content.includes(myId)) : false;

            if (isMentioned) {
                captchaHandler.handle(msg);
                return;
            }
        }

        await bossManager.handle(msg);

        if (msg.channel.id === state.config.tiketandhb.channelId) {
            bossManager.processTicketMessage(msg);
        }

        if (huntbotManager && typeof huntbotManager.processHuntBotMessage === 'function') {
            huntbotManager.processHuntBotMessage(msg);
        }
    },

    _isResponseForMe(msg) {
        try {
            const myName = (msg.guild?.members?.me?.displayName || state.client.user.username).toLowerCase();

            if (msg.embeds && msg.embeds.length > 0) {
                const embed = msg.embeds[0];
                const authorName = (embed.author?.name || "").toLowerCase();
                const description = (embed.description || "").toLowerCase();

                if (authorName.includes(myName) && authorName.includes("goes into battle")) {
                    return true;
                }

                if (authorName.includes(myName) || description.includes(`**${myName}**`)) {
                    return true;
                }

                const footerText = (embed.footer?.text || "").toLowerCase();
                const fieldsText = embed.fields?.map(f => `${f.name} ${f.value}`.toLowerCase()).join(" ") || "";

                if (footerText.includes(myName) || fieldsText.includes(myName)) {
                    return true;
                }
            }

            const content = (msg.content || "").toLowerCase();
            if (content.includes(myName)) {
                return true;
            }

            return false;
        } catch (err) {
            return false;
        }
    }
});
