const fs = require('fs');
const fileService = require('../services/fileService');
module.exports = function createPageRenderer({ CONSTANTS, configManager, profileManager, statsService, getStyles, getDashboardStatsCard, getLogCard, getLogRefreshScript, renderSettingsTabs }) {
function renderPage(config) {
        console.log('[DASHBOARD] Rendering page with config:', { port: config.port, token: config.token ? '***' : 'MISSING' });

        const { statusText, statusClass } = configManager.computeStatus(config);
        const channels = config.channels || [];
        const custom1 = config.delays.custom1 || CONSTANTS.DEFAULT_DELAYS.custom1;
        const custom2 = config.delays.custom2 || CONSTANTS.DEFAULT_DELAYS.custom2;
        const hasTelegram = config.settings?.telegram?.token && config.settings?.telegram?.chatId;

        const huntbot = config.huntbot || {};
        const control = config.settings.control || {};
        const lucyControl = config.settings.lucyControl || {};
        const rotation = config.settings.channelRotation || {};
        const boss = config.settings.boss || {};
        const boss2 = config.settings.boss2 || {};
        const gems = config.settings.gems || {};
        const adventure = config.settings.adventure || {};
        const msgFilter = config.settings.messageFilter || {};
        const messageDebug = config.settings.messageDebug || {};
        const voice = config.settings.voice || {};
        const statsSnapshot = statsService.getSnapshot(config);
        const viewingProfileId = config.viewingProfileId || '';
        const isControlPanel = !viewingProfileId;

        const profiles = profileManager.getSavedProfiles();
        const activeProfileId = profileManager.getUserId(config.token);
        const profileOptions = profiles.map(id => {
            const profilePath = profileManager.getProfilePath(id);
            const profileConfig = fs.existsSync(profilePath)
                ? configManager.ensureShape(fileService.readJson(profilePath))
                : null;
            const profileStatus = profileConfig?.botStatus || { running: false, paused: true };
            const isRunning = !!profileStatus.running && !profileStatus.paused;
            return {
                id,
                meta: profileManager.getProfileMeta(id),
                displayName: profileManager.getProfileDisplayName(id),
                isActive: id === activeProfileId,
                isViewing: id === viewingProfileId,
                running: isRunning,
                paused: !isRunning,
                statusText: isRunning ? 'START' : 'PAUSE',
                statusClass: isRunning ? 'running' : 'paused'
            };
        });

        // Captcha config
        const captchaConfig = config.captcha || {};
        const nopechaKey = (captchaConfig.apiKeys && captchaConfig.apiKeys.NopechaSolver) || '';
        const twoCaptchaKey = (captchaConfig.apiKeys && captchaConfig.apiKeys.TwoCaptchaSolver) || '';
        const fallbackSolvers = captchaConfig.fallbackSolvers || [];

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>OWO FARMING</title>
            ${getStyles()}
        </head>
        <body>
            <div class="container">
                <h2>OWO Farming Dashboard</h2>
                <div class="subtitle">${isControlPanel ? 'Control Panel utama untuk mengontrol semua akun dan slot paralel; halaman ini bukan akun default.' : `Sedang melihat akun: ${viewingProfileId}`}</div>

                <div id="userProfileBox" class="profile-box profile-box-top" data-control-panel="${isControlPanel ? 'true' : 'false'}">
                    ${isControlPanel ? '🧭 Control Panel — tidak ada akun default. Pilih akun tersimpan untuk melihat profil Discord.' : '⏳ Menghubungi Discord API...'}
                </div>

                <form id="configForm" action="/save" method="POST">
                    ${viewingProfileId ? `<input type="hidden" name="viewingProfileId" value="${viewingProfileId}">` : ''}
                    <div class="action-group">
                        ${viewingProfileId ? '<a href="/" class="btn btn-home">⌂ MENU UTAMA</a>' : ''}
                        ${viewingProfileId ? '<button type="submit" name="action" value="connectProfile" class="btn btn-connect">🔌 CONNECT / LOGIN</button>' : ''}
                        <button type="submit" name="action" value="${viewingProfileId ? 'startProfile' : 'start'}" class="btn btn-start">▶ ${viewingProfileId ? 'START / RESUME COMMANDS' : 'START ALL COMMANDS'}</button>
                        <button type="submit" name="action" value="${viewingProfileId ? 'pauseProfile' : 'pause'}" class="btn btn-pause">⏸ ${viewingProfileId ? 'PAUSE COMMANDS' : 'PAUSE ALL COMMANDS'}</button>
                        ${viewingProfileId ? '<button type="submit" name="action" value="joinVoice" class="btn btn-voice">🔊 JOIN VOICE</button>' : ''}
                        ${viewingProfileId ? '<button type="submit" name="action" value="logoutProfile" class="btn btn-logout">🚪 LOGOUT</button>' : ''}
                    </div>

                    ${renderSettingsTabs({
                        config,
                        profileOptions,
                        channels,
                        custom1,
                        custom2,
                        huntbot,
                        control,
                        lucyControl,
                        rotation,
                        boss,
                        boss2,
                        gems,
                        adventure,
                        msgFilter,
                        messageDebug,
                        voice,
                        captchaConfig,
                        nopechaKey,
                        twoCaptchaKey,
                        fallbackSolvers
                    })}
                    <button type="submit" name="action" value="save" class="btn btn-save" style="margin-top: 10px;">💾 SAVE CONFIGURATION</button>
                </form>

                <div class="status-box ${statusClass}">
                    <span style="font-size: 16px;">${statusText}</span>

                    ${hasTelegram ? '<div class="telegram-badge">📱 Telegram Active</div>' : ''}
                </div>

                ${getDashboardStatsCard(statsSnapshot)}
                ${getLogCard()}
            </div>
            <div id="saveToast" class="save-toast" role="status" aria-live="polite"></div>

            ${getLogRefreshScript(profileOptions, viewingProfileId, isControlPanel)}

            <script>
            (() => {
                const output = document.getElementById('messageDebugOutput');
                const copyButton = document.getElementById('copyMessageDebugButton');
                const clearButton = document.getElementById('clearMessageDebugButton');
                if (!output) return;

                const profileId = ${JSON.stringify(viewingProfileId)};
                const refresh = async () => {
                    try {
                        const query = profileId ? '?profileId=' + encodeURIComponent(profileId) : '';
                        const response = await fetch('/api/message-debug' + query, { credentials: 'include' });
                        if (!response.ok) throw new Error('Gagal memuat debug pesan');
                        const payload = await response.json();
                        output.textContent = payload.entries?.length
                            ? JSON.stringify(payload.entries, null, 2)
                            : 'Belum ada pesan yang cocok. Aktifkan fitur lalu kirim/terima pesan sesuai filter.';
                    } catch (error) {
                        output.textContent = 'Gagal memuat debug pesan: ' + error.message;
                    }
                };

                refresh();
                setInterval(refresh, 2000);

                copyButton?.addEventListener('click', async () => {
                    const text = output.textContent || '';
                    if (!text || text.startsWith('Belum ada')) return;

                    try {
                        await navigator.clipboard.writeText(text);
                        copyButton.textContent = '✓ Tersalin';
                    } catch {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(output);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        document.execCommand('copy');
                        selection.removeAllRanges();
                        copyButton.textContent = '✓ Tersalin';
                    }

                    setTimeout(() => { copyButton.textContent = '📋 Salin output'; }, 1500);
                });

                clearButton?.addEventListener('click', async () => {
                    clearButton.disabled = true;
                    try {
                        const response = await fetch('/api/message-debug/clear', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                            body: new URLSearchParams(profileId ? { profileId } : {}).toString()
                        });
                        if (!response.ok) throw new Error('Gagal membersihkan output');
                        output.textContent = 'Output debug telah dibersihkan.';
                    } catch (error) {
                        output.textContent = 'Gagal membersihkan output: ' + error.message;
                    } finally {
                        clearButton.disabled = false;
                    }
                });
            })();
            </script>

            <script>
            (() => {
                const form = document.getElementById('configForm');
                const toast = document.getElementById('saveToast');
                if (!form) return;
                let toastTimeout;

                function showToast(type, message) {
                    if (!toast) return;
                    clearTimeout(toastTimeout);
                    toast.className = 'save-toast ' + type + ' visible';
                    toast.textContent = (type === 'success' ? '✓ ' : '✗ ') + message;
                    toastTimeout = setTimeout(() => {
                        toast.classList.remove('visible');
                    }, 2500);
                }

                function toUrlEncodedBody(formData) {
                    const params = new URLSearchParams();
                    formData.forEach((value, key) => {
                        params.append(key, value);
                    });
                    return params.toString();
                }

                form.addEventListener('submit', async (event) => {
                    const submitter = event.submitter;
                    event.preventDefault();

                    if (!submitter || submitter.form !== form) return;

                    const originalText = submitter.textContent;
                    submitter.disabled = true;
                    submitter.textContent = '⏳ PROCESSING...';

                    try {
                        const formData = new FormData(form);

                        // Preserve the exact action submitted by the clicked button.
                        // This supports both action=... and profileAction=... buttons.
                        if (submitter.name) {
                            formData.set(submitter.name, submitter.value);
                        }

                        // Explicitly serialize the form instead of relying on the browser's
                        // FormData-to-URLSearchParams conversion. This keeps the payload
                        // compatible with the URL-encoded parser used by POST /save.
                        // Do not read form.action: controls named "action" shadow that
                        // DOM property and can turn it into a RadioNodeList (which stringifies
                        // to /[object RadioNodeList]).
                        const saveUrl = form.getAttribute('action') || '/save';
                        const response = await fetch(saveUrl, {
                            method: 'POST',
                            body: toUrlEncodedBody(formData),
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                                'X-Requested-With': 'XMLHttpRequest',
                                'Accept': 'application/json'
                            }
                        });

                        const contentType = response.headers.get('content-type') || '';
                        let result = null;

                        if (!contentType.includes('application/json')) {
                            const responseText = await response.text();
                            throw new Error(
                                responseText.trim() || 'Server returned an invalid response'
                            );
                        }
                        result = await response.json();

                        if (!response.ok || (result && result.success === false)) {
                            throw new Error(
                                (result && result.message) ||
                                ('HTTP ' + response.status)
                            );
                        }

                        submitter.textContent = '✓ BERHASIL';
                        showToast('success', 'Tersimpan');

                        setTimeout(() => {
                            submitter.disabled = false;
                            submitter.textContent = originalText;
                        }, 1000);
                    } catch (error) {
                        console.error('[DASHBOARD] Action error:', error);
                        submitter.disabled = false;
                        submitter.textContent = '✗ GAGAL';
                        showToast('error', error.message ? 'Gagal: ' + error.message : 'Gagal');

                        setTimeout(() => {
                            submitter.textContent = originalText;
                        }, 1500);
                    }
                });
            })();
            </script>
        </body>
        </html>
        `;
    }

    return renderPage;
};