module.exports = function createSettingsTabs({ escapeHtml }) {
    function renderMainSettings({ config, profileOptions, channels, custom1, custom2 }) {
        const usedSlots = Math.min(4, profileOptions.length);
        const remainingSlots = Math.max(0, 4 - usedSlots);

        return `
                    <div id="tab-main" class="tab-content active">

                        <div class="card" style="border-color: var(--accent);">
                            <label style="color: var(--accent);">👥 MULTI ACCOUNT</label>
                            
                            <div style="margin-bottom: 12px;">
                                <div class="account-chip-wrap">
                                    ${profileOptions.length ? profileOptions.map(profile => `
                                        <span class="account-chip-group">
                                            <a class="account-chip ${profile.statusClass || 'paused'} ${profile.isViewing ? 'viewing' : ''}" href="/?profileId=${encodeURIComponent(profile.id)}" title="Lihat akun ${escapeHtml(profile.id)}">
                                                <span class="account-chip-name">${escapeHtml(profile.displayName)}</span>
                                                <span class="account-chip-id">${escapeHtml(profile.id)}</span>
                                                <span class="account-chip-status">${profile.running ? '● START' : '● PAUSE'}</span>
                                            </a>
                                            <button type="submit" name="profileAction" value="connect:${escapeHtml(profile.id)}" class="account-chip-action connect" title="Connect/Login akun ${escapeHtml(profile.id)} tanpa start loop">🔌</button>
                                            <button type="submit" name="profileAction" value="start:${escapeHtml(profile.id)}" class="account-chip-action start" title="Start/Resume commands akun ${escapeHtml(profile.id)}">▶</button>
                                            <button type="submit" name="profileAction" value="pause:${escapeHtml(profile.id)}" class="account-chip-action pause" title="Pause commands akun ${escapeHtml(profile.id)}">⏸</button>
                                            <button type="submit" name="profileAction" value="delete:${escapeHtml(profile.id)}" class="account-chip-action delete" title="Hapus slot akun ${escapeHtml(profile.id)}" onclick="return confirm('Hapus slot akun ini? Slot akan berkurang 1.');">🗑</button>
                                        </span>
                                    `).join('') : '<div class="input-hint">Belum ada profil.</div>'}
                                </div>
                                <label>Slot akun paralel otomatis</label>
                                <div class="slot-indicator" aria-live="polite">
                                    <span>📦 Terpakai: <strong>${usedSlots}/4</strong></span>
                                    <span>🟢 Sisa slot: <strong>${remainingSlots}</strong></span>
                                </div>
                                <input type="hidden" name="selectedProfile" id="selectedProfile" value="">
                                <div id="selectedProfilePreview" class="profile-preview" aria-live="polite"></div>
                            </div>

                            <div class="divider"></div>

                            <div>
                                <label>ATAU MASUKKUN TOKEN AKUN BARU</label>
                                <div class="row">
                                    <div class="col">
                                        <input type="password" name="newToken" placeholder="Token">
                                    </div>
                                    <div class="col" style="flex: 0.4;">
                                        <button type="submit" name="action" value="newProfile" class="btn" style="background: var(--green); color: white;">➕ BUAT</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <label>🔐 TEMPLATE TOKEN / KONFIG UTAMA</label>
                            <input type="password" name="token" value="${config.token || ''}" placeholder="Token">
                        </div>

                        <div class="card">
                            <label>📡 ACTIVE CHANNELS (max 3)</label>
                            <input type="text" name="chan1" value="${channels[0] || ''}" placeholder="Channel ID 1">
                            <input type="text" name="chan2" value="${channels[1] || ''}" placeholder="Channel ID 2">
                            <input type="text" name="chan3" value="${channels[2] || ''}" placeholder="Channel ID 3">
                        </div>

                        <div class="card">
                            <label>⚔️ MAIN COMMANDS</label>

                            <div class="toggle-row">
                                <span><span style="margin-right: 8px;">🏹</span> Hunt</span>
                                <input type="checkbox" name="hunt" ${config.settings.hunt ? 'checked' : ''}>
                            </div>
                            <div class="row">
                                <div class="col"><input type="number" name="huntMin" value="${config.delays.hunt.min}" placeholder="Min"></div>
                                <div class="col"><input type="number" name="huntMax" value="${config.delays.hunt.max}" placeholder="Max"></div>
                            </div>

                            <div class="divider"></div>

                            <div class="toggle-row">
                                <span><span style="margin-right: 8px;">⚔️</span> Battle</span>
                                <input type="checkbox" name="battle" ${config.settings.battle ? 'checked' : ''}>
                            </div>
                            <div class="row">
                                <div class="col"><input type="number" name="battleMin" value="${config.delays.battle.min}" placeholder="Min"></div>
                                <div class="col"><input type="number" name="battleMax" value="${config.delays.battle.max}" placeholder="Max"></div>
                            </div>

                            <div class="divider"></div>

                            <div class="toggle-row">
                                <span><span style="margin-right: 8px;">🙏</span> Pray</span>
                                <input type="checkbox" name="pray" ${config.settings.pray ? 'checked' : ''}>
                            </div>
                            <div class="row">
                                <div class="col"><input type="number" name="prayMin" value="${config.delays.pray.min}" placeholder="Min"></div>
                                <div class="col"><input type="number" name="prayMax" value="${config.delays.pray.max}" placeholder="Max"></div>
                            </div>
                        </div>

                        <div class="card">
                            <label>💬 CUSTOM COMMANDS</label>
                            <div style="margin-bottom: 12px;">
                                <input type="text" name="text1" value="${config.settings.text1 || ''}" placeholder="Command 1">
                                <div class="row" style="margin-top: 8px;">
                                    <div class="col"><input type="number" name="c1Min" value="${custom1.min}" placeholder="Min"></div>
                                    <div class="col"><input type="number" name="c1Max" value="${custom1.max}" placeholder="Max"></div>
                                </div>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <input type="text" name="text2" value="${config.settings.text2 || ''}" placeholder="Command 2">
                                <div class="row" style="margin-top: 8px;">
                                    <div class="col"><input type="number" name="c2Min" value="${custom2.min}" placeholder="Min"></div>
                                    <div class="col"><input type="number" name="c2Max" value="${custom2.max}" placeholder="Max"></div>
                                </div>
                            </div>
                            <div class="toggle-row">
                                <span>🔘 Enable Custom Commands</span>
                                <input type="checkbox" name="custom" ${config.settings.custom ? 'checked' : ''}>
                            </div>
                        </div>
                    </div>

        `;
    }

    function renderAdvancedSettings({ config, huntbot, control, rotation, boss, msgFilter, messageDebug, voice, captchaConfig, nopechaKey, twoCaptchaKey, fallbackSolvers }) {
        return `
                    <div id="tab-notifications" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>📱 Notifikasi</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>📱 TELEGRAM NOTIFICATIONS</label>
                            <input type="text" name="tgToken" value="${config.settings.telegram.token || ''}" placeholder="Bot Token">
                            <input type="text" name="tgChat" value="${config.settings.telegram.chatId || ''}" placeholder="Chat ID">

                        </div>
                    </div>

                    <div id="tab-captcha" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🛡️ Captcha</h3>
                            </div>

                        </div>

                        <!-- === CAPTCHA SETTINGS (Full Fallback UI) === -->
                        <div class="card" style="border-color: #f59e0b;">
                            <label style="color: #f59e0b;">🛡️ CAPTCHA SETTINGS (CaptchaAsu)</label>
                            
                            <div class="toggle-row">
                                <span>Enable Auto Solver (CaptchaAsu)</span>
                                <input type="checkbox" name="autosolver" ${config.autosolver ? 'checked' : ''}>
                            </div>

                            <div class="divider"></div>

                            <label>Primary Solver</label>
                            <select name="captchaPrimary" class="input-select">
                                <option value="NopechaSolver" ${captchaConfig.primarySolver === 'NopechaSolver' ? 'selected' : ''}>NopechaSolver</option>
                                <option value="TwoCaptchaSolver" ${captchaConfig.primarySolver === 'TwoCaptchaSolver' ? 'selected' : ''}>TwoCaptchaSolver</option>
                            </select>

                            <div class="divider"></div>

                            <label>Fallback Solvers</label>
                            <div style="margin: 8px 0;">
                                <label style="display: inline-flex; align-items: center; gap: 8px; margin-right: 20px;">
                                    <input type="checkbox" name="fallbackNopecha" value="NopechaSolver" ${fallbackSolvers.includes('NopechaSolver') ? 'checked' : ''}>
                                    <span>NopechaSolver</span>
                                </label>
                                <label style="display: inline-flex; align-items: center; gap: 8px;">
                                    <input type="checkbox" name="fallbackTwoCaptcha" value="TwoCaptchaSolver" ${fallbackSolvers.includes('TwoCaptchaSolver') ? 'checked' : ''}>
                                    <span>TwoCaptchaSolver</span>
                                </label>
                            </div>

                            <div class="divider"></div>

                            <label>Nopecha API Key</label>
                            <input type="password" name="nopechaApiKey" value="${escapeHtml(nopechaKey)}" placeholder="API Key">

                            <label style="margin-top: 12px;">TwoCaptcha API Key</label>
                            <input type="password" name="twoCaptchaApiKey" value="${escapeHtml(twoCaptchaKey)}" placeholder="API Key">

                        </div>
                    </div>

                    <div id="tab-integrations" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🔌 Integrasi Sistem</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>🔌 SYSTEM INTEGRATIONS</label>
                            <label>Dashboard Port</label>
                            <input type="number" name="port" value="${config.port}">
                            <label>MacroDroid ID</label>
                            <input type="text" name="macrodroidId" value="${config.macrodroidId || ''}">
                            <label>2Captcha API Key</label>
                            <input type="password" name="twoCaptchaKey" value="${config.settings.twoCaptchaKey || ''}">
                        </div>
                    </div>

                    <div id="tab-safety" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🛡️ Safety & Filter</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>🛡️ SAFETY & FILTER</label>
                            <div class="toggle-row">
                                <span>Enable CCTV Monitoring</span>
                                <input type="checkbox" name="cctvEnabled" ${config.safety?.cctv ? 'checked' : ''}>
                            </div>
                            
                            <div class="divider"></div>
                            
                            <label>📨 Message Filter</label>
                            <div class="toggle-row">
                                <span>Enable Filter</span>
                                <input type="checkbox" name="mfEnabled" ${msgFilter.enabled ? 'checked' : ''}>
                            </div>
                            <label>Channel IDs</label>
                            <input type="text" name="mfChannelIds" value="${(msgFilter.channelIds || []).join(',')}" placeholder="Channel IDs">
                            <label>Guild IDs</label>
                            <input type="text" name="mfGuildIds" value="${(msgFilter.guildIds || []).join(',')}" placeholder="Guild IDs">
                            <div class="toggle-row">
                                <span>Debug Mode</span>
                                <input type="checkbox" name="mfDebug" ${msgFilter.debug ? 'checked' : ''}>
                            </div>
                            <div class="toggle-row">
                                <span>Debug Only OwO</span>
                                <input type="checkbox" name="mfDebugOnlyOwO" ${msgFilter.debugOnlyOwO ? 'checked' : ''}>
                            </div>
                        </div>
                    </div>

                    <div id="tab-message-debug" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🔎 Debug Pesan</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🔎 MESSAGE DEBUG</label>
                            <div class="toggle-row">
                                <span>Aktifkan ekstraksi pesan</span>
                                <input type="checkbox" name="messageDebugEnabled" ${messageDebug.enabled ? 'checked' : ''}>
                            </div>
                            <div class="input-hint">Filter bersifat opsional. Bila seluruh ID kosong, semua pesan pada akun yang sedang dipantau akan ditangkap.</div>
                            <label>Target User ID</label>
                            <input type="text" name="messageDebugTargetId" value="${escapeHtml(messageDebug.targetId || '')}" placeholder="Author/User ID">
                            <label>Target Channel ID</label>
                            <input type="text" name="messageDebugChannelId" value="${escapeHtml(messageDebug.channelId || '')}" placeholder="Channel ID">
                            <label>Target Guild ID</label>
                            <input type="text" name="messageDebugGuildId" value="${escapeHtml(messageDebug.guildId || '')}" placeholder="Guild/Server ID">
                            <div class="divider"></div>
                            <label>RAW JSON PESAN TERAKHIR</label>
                            <div class="input-hint">Jenis pesan ditandai sebagai <code>text</code>, <code>embed</code>, atau <code>components</code>. Untuk komponen, JSON menyertakan semua tombol dan properti yang diterima.</div>
                            <div class="debug-output-actions">
                                <button type="button" id="copyMessageDebugButton" class="btn btn-secondary debug-action-button">📋 Salin output</button>
                                <button type="button" id="clearMessageDebugButton" class="btn btn-danger debug-action-button">🗑 Bersihkan output</button>
                            </div>
                            <pre id="messageDebugOutput" class="debug-output" aria-live="polite">Memuat debug pesan...</pre>
                        </div>
                    </div>

                    <div id="tab-automation" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🤖 Automasi OwO</h3>
                            </div>

                        </div>
                                                                        
                        <div class="card">
                            <label>🤖 HUNTBOT AUTOMATION</label>
                            <div class="toggle-row">
                                <span>Enable HuntBot</span>
                                <input type="checkbox" name="hbEnabled" ${huntbot.enabled ? 'checked' : ''}>
                            </div>
                            <div class="toggle-row">
                                <span>Auto Mode</span>
                                <input type="checkbox" name="hbAutoMode" ${huntbot.autoMode ? 'checked' : ''}>
                            </div>
                            <div class="toggle-row">
                                <span>Notify Progress</span>
                                <input type="checkbox" name="hbNotify" ${huntbot.notifyProgress ? 'checked' : ''}>
                            </div>
                            <div class="toggle-row">
                                <span>Sell All Setelah Jemput (skip wupg)</span>
                                <input type="checkbox" name="hbSellAllAfterReturn" ${huntbot.sellAllAfterReturn ? 'checked' : ''}>
                            </div>
                            <div class="input-hint">Jika aktif: setelah HuntBot pulang, bot mengirim <code>wsell all</code>, tidak menjalankan <code>wupg ...</code>, lalu lanjut <code>whb 1D</code>.</div>
                            <div class="divider"></div>
                            <label>Default Upgrade Type</label>
                            <input type="text" name="hbUpgrade" value="${huntbot.defaultUpgrade || 'duration'}" placeholder="Upgrade">
                            <label>Default Hunt Duration</label>
                            <input type="text" name="hbDuration" value="${huntbot.defaultDuration || '1D'}" placeholder="1D">
                            
                            <div class="divider"></div>
                            <label>Tiket & Huntbot Channel ID</label>
                            <input type="text" name="tiketandhbChannel" value="${config.tiketandhb?.channelId || ''}" placeholder="Channel ID">
                        </div>


                        <div class="card">
                            <label>🔊 VOICE CHANNEL</label>
                            <div class="toggle-row">
                                <span>Auto Join Voice Channel</span>
                                <input type="checkbox" name="voiceEnabled" ${voice.enabled ? 'checked' : ''}>
                            </div>
                            <label>Voice Channel ID</label>
                            <input type="text" name="voiceChannelId" value="${voice.channelId || ''}" placeholder="Channel ID">
                        </div>

                        <div class="card">
                            <label>🐉 BOSS AUTOMATION (OwO)</label>
                            <div class="toggle-row">
                                <span>Enable Auto-Boss</span>
                                <input type="checkbox" name="bossEnabled" ${boss.enabled ? 'checked' : ''}>
                            </div>
                            <label>Allowed Guilds</label>
                            <input type="text" name="bossGuilds" value="${(boss.allowedGuilds || []).join(',')}" placeholder="Guild ID">
                        </div>

                        <div class="card">
                            <label>🔄 CHANNEL ROTATION</label>
                            <div class="toggle-row">
                                <span>Enable Rotation</span>
                                <input type="checkbox" name="crEnabled" ${rotation.enabled ? 'checked' : ''}>
                            </div>
                            <div class="row">
                                <div class="col"><input type="number" name="crMin" value="${rotation.minMs}" placeholder="Min"></div>
                                <div class="col"><input type="number" name="crMax" value="${rotation.maxMs}" placeholder="Max"></div>
                            </div>
                        </div>

                    </div>

                    <div id="tab-control" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🎮 Kontrol & Sistem</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>🎮 CONTROL & SYSTEM</label>
                            <div class="toggle-row">
                                <span>Auto Resume</span>
                                <input type="checkbox" name="autoResume" ${config.settings.autoResume ? 'checked' : ''}>
                            </div>
                            <div class="divider"></div>
                            <div class="row">
                                <div class="col">
                                    <label>Start Word</label>
                                    <input type="text" name="ctrlStart" value="${control.start || 'wcash'}" placeholder="wcash">
                                </div>
                                <div class="col">
                                    <label>Pause Word</label>
                                    <input type="text" name="ctrlPause" value="${control.pause || 'wbuy 1'}" placeholder="wbuy 1">
                                </div>
                            </div>
                            <label>Allowed User IDs</label>
                            <input type="text" name="ctrlAllowIds" value="${(control.allowIds || []).join(',')}" placeholder="User ID">
                            
                            <div class="divider"></div>
                            <label>Max Log Lines in Dashboard</label>
                            <input type="number" name="maxLogLines" value="${config.maxLogLines || 15}">
                        </div>

                    </div>
        `;
    }

    function renderLucySettings({ config, boss2 = {}, gems = {}, adventure = {}, lucyControl = {} }) {
        return `
                    <div id="tab-lucy-commands" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🧩 Custom Commands Lucy</h3>
                            </div>
                        </div>
                        <div class="input-hint">Setiap slot dikirim ke channel pilihannya sendiri. Start menjalankan sejumlah pengiriman yang diatur; Stop membatalkan slot tersebut.</div>
                        ${(config.otherCommands || []).map((command, index) => {
                            const slot = index + 1;
                            return `
                                <div class="card">
                                    <label>Custom Command Lucy ${slot}</label>
                                    <label>Command Text</label>
                                    <input type="text" name="other${slot}Text" value="${escapeHtml(command.text)}" placeholder="Contoh: !test">
                                    <div class="row">
                                        <div class="col"><label>Delay / Jeda (detik)</label><input type="number" min="0" step="1" name="other${slot}Delay" value="${Math.floor((command.delayMs || 0) / 1000)}"></div>
                                        <div class="col"><label>Jumlah Pengiriman</label><input type="number" min="1" step="1" name="other${slot}Count" value="${command.count || 1}"></div>
                                    </div>
                                    <label>Target Channel</label>
                                    <input type="text" name="other${slot}Channel" value="${escapeHtml(command.channelId)}" placeholder="Discord Channel ID">
                                    <div class="action-group" style="margin-top: 12px;">
                                        <button type="submit" name="action" value="otherCommandStart${slot}" class="btn btn-start">▶ START</button>
                                        <button type="submit" name="action" value="otherCommandStop${slot}" class="btn btn-pause">⏸ STOP</button>
                                        <span class="input-hint">${command.enabled ? '▶ Menunggu / berjalan' : '⏹ Berhenti'}</span>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>

                    <div id="tab-lucy-boss2" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🐲 Auto Boss2</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🐲 AUTO BOSS2 (DRAFT)</label>
                            <div class="input-hint">Saat pesan "Guild Boss Telah Muncul" terdeteksi dan tombol Fight aktif, bot otomatis Fight. Berhenti saat boss dikalahkan/kabur (tombol mati), lalu mencatat waktu "Boss baru". Kosongkan filter untuk semua.</div>
                            <div class="toggle-row">
                                <span>Enable Auto Boss2</span>
                                <input type="checkbox" name="boss2Enabled" ${boss2.enabled ? 'checked' : ''}>
                            </div>
                            <label>Allowed Guilds</label>
                            <input type="text" name="boss2Guilds" value="${escapeHtml((boss2.allowedGuilds || []).join(','))}" placeholder="Guild ID">
                            <label>Allowed Channels</label>
                            <input type="text" name="boss2ChannelIds" value="${escapeHtml((boss2.channelIds || []).join(','))}" placeholder="Channel ID">
                            <label>Bot Author IDs</label>
                            <input type="text" name="boss2BotIds" value="${escapeHtml((boss2.botIds || []).join(','))}" placeholder="User ID bot boss">
                            <label>Teks Boss Muncul</label>
                            <input type="text" name="boss2AppearText" value="${escapeHtml(boss2.appearText || '')}" placeholder="Guild Boss Telah Muncul">
                            <label>Teks Boss Dikalahkan</label>
                            <input type="text" name="boss2DefeatedText" value="${escapeHtml(boss2.defeatedText || '')}" placeholder="Boss Telah Dikalahkan">
                            <label>Button Custom ID</label>
                            <input type="text" name="boss2ButtonId" value="${escapeHtml(boss2.buttonId || '')}" placeholder="raid:fight">
                            <label>Jumlah Fight per Boss (1-3)</label>
                            <input type="number" min="1" max="3" name="boss2FightsPerBoss" value="${boss2.fightsPerBoss ?? 3}" placeholder="3">
                            <label>Jeda sebelum tiap Fight (ms)</label>
                            <div class="row">
                                <div class="col"><input type="number" min="0" name="boss2DelayMin" value="${boss2.delayMinMs ?? 1000}" placeholder="Min"></div>
                                <div class="col"><input type="number" min="0" name="boss2DelayMax" value="${boss2.delayMaxMs ?? 1000}" placeholder="Max"></div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-lucy-gems" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>💎 Auto Use Gems</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>💎 AUTO USE GEMS</label>
                            <div class="input-hint">Saat pesan "| nama** menghabiskan 5 lucent" terdeteksi: kirim cek inventaris. Jika ada item lootbox → buka lootbox lalu cek lagi. Jika gems wajib lengkap → pakai (gems opsional ikut dipakai jika ada). Jika tidak lengkap → cek inventaris ulang tiap X menit sampai lengkap.</div>
                            <div class="toggle-row">
                                <span>Enable Auto Use Gems</span>
                                <input type="checkbox" name="gemsEnabled" ${gems.enabled ? 'checked' : ''}>
                            </div>
                            <label>Channel ID (kosong = channel pesan trigger)</label>
                            <input type="text" name="gemsChannelId" value="${escapeHtml(gems.channelId || '')}" placeholder="Channel ID">
                            <label>Bot Author IDs (kosong = semua)</label>
                            <input type="text" name="gemsBotIds" value="${escapeHtml((gems.botIds || []).join(','))}" placeholder="User ID bot Lucy">
                            <label>Nama Akun (kosong = otomatis dari username/nickname)</label>
                            <input type="text" name="gemsAccountName" value="${escapeHtml(gems.accountName || '')}" placeholder="neozen">
                            <label>Teks Trigger Gems Habis</label>
                            <input type="text" name="gemsTriggerText" value="${escapeHtml(gems.triggerText || '')}" placeholder="menghabiskan 5 <:lucent:1523362382355759266>">
                            <label>Command Cek Inventaris</label>
                            <input type="text" name="gemsInventoryCommand" value="${escapeHtml(gems.inventoryCommand || '')}" placeholder="linv">
                            <div class="row">
                                <div class="col"><label>Kode Item Lootbox</label><input type="text" name="gemsLootboxItem" value="${escapeHtml(gems.lootboxItem || '')}" placeholder="049"></div>
                                <div class="col"><label>Command Lootbox</label><input type="text" name="gemsLootboxCommand" value="${escapeHtml(gems.lootboxCommand || '')}" placeholder="llb f all"></div>
                            </div>
                            <div class="row">
                                <div class="col"><label>Gems Wajib</label><input type="text" name="gemsRequired" value="${escapeHtml((gems.requiredGems || []).join(','))}" placeholder="57,71,78"></div>
                                <div class="col"><label>Gems Opsional</label><input type="text" name="gemsOptional" value="${escapeHtml((gems.optionalGems || []).join(','))}" placeholder="85"></div>
                            </div>
                            <label>Command Pakai Gems</label>
                            <input type="text" name="gemsUseCommand" value="${escapeHtml(gems.useCommand || '')}" placeholder="luse">
                            <label>Jeda Cek Inventaris saat Gems &amp; Lootbox Habis (menit)</label>
                            <input type="number" min="1" name="gemsRecheckMinutes" value="${gems.recheckMinutes ?? 5}" placeholder="5">
                            <label>Jeda sebelum kirim command (ms)</label>
                            <div class="row">
                                <div class="col"><input type="number" min="0" name="gemsDelayMin" value="${gems.delayMinMs ?? 1500}" placeholder="Min"></div>
                                <div class="col"><input type="number" min="0" name="gemsDelayMax" value="${gems.delayMaxMs ?? 3000}" placeholder="Max"></div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-lucy-adventure" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🗺️ Auto Adventure</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🗺️ AUTO ADVENTURE</label>
                            <div class="input-hint">Memproses response target hanya pada guild dan channel yang ditentukan.</div>
                            <label>Target Author ID</label>
                            <input type="text" name="adventureTargetId" value="${escapeHtml(adventure.targetId || '')}" placeholder="Discord User ID">
                            <label>Adventure Channel ID</label>
                            <input type="text" name="adventureChannelId" value="${escapeHtml(adventure.channelId || '')}" placeholder="Channel ID">
                            <label>Adventure Guild ID</label>
                            <input type="text" name="adventureGuildId" value="${escapeHtml(adventure.guildId || '')}" placeholder="Guild ID">
                            <div class="action-group" style="margin-top: 12px;">
                                <button type="submit" name="action" value="adventureStart" class="btn btn-start">▶ AUTO ADVENTURE ON</button>
                                <button type="submit" name="action" value="adventureStop" class="btn btn-pause">⏸ AUTO ADVENTURE OFF</button>
                            </div>
                            <span class="input-hint">${adventure.enabled ? '▶ Auto Adventure aktif' : '⏹ Auto Adventure nonaktif'}</span>
                        </div>
                    </div>

                    <div id="tab-lucy-control" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🎮 Kontrol Lucy</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🎮 LUCY DISCORD CONTROL</label>
                            <div class="input-hint">Kirim kata ini di Discord (dari akun sendiri atau User ID yang diizinkan) untuk menjalankan/menjeda semua fitur Lucy: Custom Commands Lucy, Auto Boss2, Auto Use Gems, dan Auto Adventure. Tidak memengaruhi loop OwO.</div>
                            <div class="row">
                                <div class="col">
                                    <label>Start Word</label>
                                    <input type="text" name="lucyCtrlStart" value="${escapeHtml(lucyControl.start || 'lucy start')}" placeholder="lucy start">
                                </div>
                                <div class="col">
                                    <label>Pause Word</label>
                                    <input type="text" name="lucyCtrlPause" value="${escapeHtml(lucyControl.pause || 'lucy pause')}" placeholder="lucy pause">
                                </div>
                            </div>
                            <label>Allowed User IDs</label>
                            <input type="text" name="lucyCtrlAllowIds" value="${escapeHtml((lucyControl.allowIds || []).join(','))}" placeholder="User ID">
                        </div>
                    </div>
        `;
    }

    function renderSettingsTabs(context) {
        return `
                    <div class="settings-nav">
                        <button type="button" class="hamburger-btn" onclick="toggleSettingsMenu(event)" aria-expanded="false" aria-controls="settingsMenu">
                            <span aria-hidden="true">☰</span>
                            <span>Pengaturan</span>
                        </button>
                        <div class="settings-current" id="settingsCurrentLabel">Main Settings</div>
                        <div class="settings-menu" id="settingsMenu">
                            <div class="settings-menu-group">
                                <span>Dasar</span>
                                <button type="button" class="settings-menu-item active" data-menu-label="Main Settings" onclick="switchTab(event, 'tab-main')">🏠 Main Settings</button>
                            </div>
                            <div class="settings-menu-group">
                                <span>Advanced / Add-ons</span>
                                <button type="button" class="settings-menu-item" data-menu-label="Notifikasi" onclick="switchTab(event, 'tab-notifications')">📱 Notifikasi</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Captcha" onclick="switchTab(event, 'tab-captcha')">🛡️ Captcha</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Integrasi Sistem" onclick="switchTab(event, 'tab-integrations')">🔌 Integrasi Sistem</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Safety & Filter" onclick="switchTab(event, 'tab-safety')">🛡️ Safety & Filter</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Debug Pesan" onclick="switchTab(event, 'tab-message-debug')">🔎 Debug Pesan</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Automasi OwO" onclick="switchTab(event, 'tab-automation')">🤖 Automasi OwO</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Kontrol & Sistem" onclick="switchTab(event, 'tab-control')">🎮 Kontrol & Sistem</button>
                            </div>
                            <div class="settings-menu-group">
                                <span>Lucy</span>
                                <button type="button" class="settings-menu-item" data-menu-label="Custom Commands Lucy" onclick="switchTab(event, 'tab-lucy-commands')">🧩 Custom Commands Lucy</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Auto Boss2" onclick="switchTab(event, 'tab-lucy-boss2')">🐲 Auto Boss2</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Auto Use Gems" onclick="switchTab(event, 'tab-lucy-gems')">💎 Auto Use Gems</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Auto Adventure" onclick="switchTab(event, 'tab-lucy-adventure')">🗺️ Auto Adventure</button>
                                <button type="button" class="settings-menu-item" data-menu-label="Kontrol Lucy" onclick="switchTab(event, 'tab-lucy-control')">🎮 Kontrol Lucy</button>
                            </div>
                        </div>
                    </div>

${renderMainSettings(context)}
${renderAdvancedSettings(context)}
${renderLucySettings(context)}
        `;
    }

    return { renderMainSettings, renderAdvancedSettings, renderLucySettings, renderSettingsTabs };
};
