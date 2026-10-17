const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const createDashboardApp = require('../src/dashboard/app');

function authHeader() {
    return `Basic ${Buffer.from('dashboard:zuya2000').toString('base64')}`;
}

async function withDashboard(callback) {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-save-'));
    fs.writeFileSync(path.join(baseDir, 'config.json'), JSON.stringify({ token: '', settings: {} }));
    const { app } = createDashboardApp({ baseDir });
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));

    try {
        await callback(`http://127.0.0.1:${server.address().port}`, baseDir);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
}

test('POST /save parses URL-encoded dashboard data and reports persistence as JSON', async () => {
    await withDashboard(async (url, baseDir) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json'
            },
            body: new URLSearchParams({ action: 'save', token: 'saved-token', chan1: '12345' })
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true, message: 'Configuration saved' });
        const savedConfig = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf8'));
        assert.equal(savedConfig.token, 'saved-token');
        assert.deepEqual(savedConfig.channels, ['12345']);
    });
});

test('POST /save returns a JSON failure for an invalid AJAX action request', async () => {
    await withDashboard(async (url) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json'
            },
            body: new URLSearchParams({ action: 'loadProfile' })
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { success: false, message: 'Profile must be selected' });
    });
});

test('POST /save uses the JSON Accept header when the AJAX header is unavailable', async () => {
    await withDashboard(async (url) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                Accept: 'application/json'
            },
            body: new URLSearchParams({ action: 'save', token: 'accept-header-token' })
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true, message: 'Configuration saved' });
    });
});

test('dashboard renders an accessible save status toast', async () => {
    await withDashboard(async (url) => {
        const response = await fetch(url, { headers: { Authorization: authHeader() } });
        const html = await response.text();

        assert.equal(response.status, 200);
        assert.match(html, /id="saveToast" class="save-toast" role="status" aria-live="polite"/);
        assert.match(html, /function toUrlEncodedBody\(formData\)/);
        assert.match(html, /credentials: 'include'/);
        assert.match(html, /const saveUrl = form\.getAttribute\('action'\) \|\| '\/save';/);
        assert.doesNotMatch(html, /fetch\(form\.action,/);
        assert.match(html, /showToast\('success', 'Tersimpan'\)/);
        assert.match(html, /showToast\('error', error\.message \? 'Gagal: ' \+ error\.message : 'Gagal'\)/);
    });
});

test('Lucy Custom Commands never enable CAPTCHA, even if a legacy field is submitted', async () => {
    await withDashboard(async (url, baseDir) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                Accept: 'application/json'
            },
            body: new URLSearchParams({
                action: 'save',
                other1Text: '!test',
                other1Channel: '12345',
                other1Delay: '5',
                other1Count: '10',
                other1Captcha: 'on'
            })
        });

        assert.equal(response.status, 200);
        const savedConfig = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf8'));
        assert.equal(savedConfig.otherCommands[0].text, '!test');
        assert.deepEqual(savedConfig.otherCommands.map(command => command.captchaEnabled), [false, false, false]);
    });
});

test('POST /save persists Lucy Discord control and the dashboard renders the Lucy menu', async () => {
    await withDashboard(async (url, baseDir) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                Accept: 'application/json'
            },
            body: new URLSearchParams({
                action: 'save',
                ctrlStart: 'wcash',
                lucyCtrlStart: 'lgo',
                lucyCtrlPause: 'lstop',
                lucyCtrlAllowIds: '111, 222'
            })
        });

        assert.equal(response.status, 200);
        const savedConfig = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf8'));
        assert.deepEqual(savedConfig.settings.lucyControl, { start: 'lgo', pause: 'lstop', allowIds: ['111', '222'] });
        assert.equal(savedConfig.settings.control.start, 'wcash');

        const page = await (await fetch(url, { headers: { Authorization: authHeader() } })).text();
        assert.match(page, /<span>Lucy<\/span>/);
        for (const tabId of ['tab-lucy-commands', 'tab-lucy-boss2', 'tab-lucy-gems', 'tab-lucy-adventure', 'tab-lucy-control']) {
            assert.match(page, new RegExp(`id="${tabId}"`));
            assert.match(page, new RegExp(`switchTab\\(event, '${tabId}'\\)`));
        }
        assert.doesNotMatch(page, /tab-other/);
        assert.doesNotMatch(page, /name="other1Captcha"/);
        assert.match(page, /data-menu-label="Automasi OwO"/);
        assert.match(page, /Custom Command Lucy 1/);
        assert.match(page, /LUCY DISCORD CONTROL/);
        assert.match(page, /name="lucyCtrlStart" value="lgo"/);
        assert.match(page, /name="lucyCtrlAllowIds" value="111,222"/);
        assert.match(page, /name="text1"/);

        const automation = page.slice(page.indexOf('id="tab-automation"'), page.indexOf('id="tab-control"'));
        assert.match(automation, /HUNTBOT AUTOMATION/);
        assert.match(automation, /BOSS AUTOMATION \(OwO\)/);
        assert.doesNotMatch(automation, /AUTO BOSS2|AUTO USE GEMS|AUTO ADVENTURE/);
    });
});

test('Message Debug settings persist target, channel, and guild filters', async () => {
    await withDashboard(async (url, baseDir) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                Accept: 'application/json'
            },
            body: new URLSearchParams({
                action: 'save',
                messageDebugEnabled: 'on',
                messageDebugTargetId: '111',
                messageDebugChannelId: '222',
                messageDebugGuildId: '333'
            })
        });

        assert.equal(response.status, 200);
        const savedConfig = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf8'));
        assert.deepEqual(savedConfig.settings.messageDebug, {
            enabled: true,
            targetId: '111',
            channelId: '222',
            guildId: '333'
        });
    });
});

test('dashboard renders Message Debug controls and raw JSON output', async () => {
    await withDashboard(async (url) => {
        const response = await fetch(url, { headers: { Authorization: authHeader() } });
        const html = await response.text();

        assert.equal(response.status, 200);
        assert.match(html, /data-menu-label="Debug Pesan"/);
        assert.match(html, /name="messageDebugTargetId"/);
        assert.match(html, /name="messageDebugChannelId"/);
        assert.match(html, /name="messageDebugGuildId"/);
        assert.match(html, /id="messageDebugOutput"/);
        assert.match(html, /id="copyMessageDebugButton"/);
        assert.match(html, /id="clearMessageDebugButton"/);
    });
});

test('POST /save persists Auto Boss2 settings and the dashboard renders them', async () => {
    await withDashboard(async (url, baseDir) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json'
            },
            body: new URLSearchParams({
                action: 'save',
                boss2Enabled: 'on',
                boss2Guilds: 'g1, g2',
                boss2ChannelIds: 'c1',
                boss2BotIds: 'bot1',
                boss2AppearText: 'Guild Boss Telah Muncul',
                boss2DefeatedText: 'Boss Telah Dikalahkan',
                boss2ButtonId: 'raid:fight',
                boss2FightsPerBoss: '2',
                boss2DelayMin: '1000',
                boss2DelayMax: '3000'
            })
        });

        assert.equal(response.status, 200);
        const savedConfig = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf8'));
        assert.deepEqual(savedConfig.settings.boss2, {
            enabled: true,
            allowedGuilds: ['g1', 'g2'],
            channelIds: ['c1'],
            botIds: ['bot1'],
            appearText: 'Guild Boss Telah Muncul',
            defeatedText: 'Boss Telah Dikalahkan',
            buttonId: 'raid:fight',
            fightsPerBoss: 2,
            delayMinMs: 1000,
            delayMaxMs: 3000
        });

        const page = await (await fetch(url, { headers: { Authorization: authHeader() } })).text();
        assert.match(page, /AUTO BOSS2/);
        assert.match(page, /name="boss2ButtonId" value="raid:fight"/);
    });
});

test('POST /save persists Auto Use Gems settings and the dashboard renders them', async () => {
    await withDashboard(async (url, baseDir) => {
        const response = await fetch(`${url}/save`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(),
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json'
            },
            body: new URLSearchParams({
                action: 'save',
                gemsEnabled: 'on',
                gemsChannelId: 'c1',
                gemsBotIds: 'lucy',
                gemsAccountName: 'neozen',
                gemsTriggerText: 'menghabiskan 5 <:lucent:1523362382355759266>',
                gemsInventoryCommand: 'linv',
                gemsLootboxItem: '049',
                gemsLootboxCommand: 'llb f all',
                gemsRequired: '57, 71, 78',
                gemsOptional: '85',
                gemsUseCommand: 'luse',
                gemsRecheckMinutes: '5',
                gemsDelayMin: '1000',
                gemsDelayMax: '2000'
            })
        });

        assert.equal(response.status, 200);
        const savedConfig = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf8'));
        const gems = savedConfig.settings.gems;
        assert.equal(gems.enabled, true);
        assert.equal(gems.channelId, 'c1');
        assert.deepEqual(gems.botIds, ['lucy']);
        assert.equal(gems.accountName, 'neozen');
        assert.deepEqual(gems.requiredGems, ['57', '71', '78']);
        assert.deepEqual(gems.optionalGems, ['85']);
        assert.equal(gems.recheckMinutes, 5);
        assert.equal(gems.delayMaxMs, 2000);

        const page = await (await fetch(url, { headers: { Authorization: authHeader() } })).text();
        assert.match(page, /AUTO USE GEMS/);
        assert.match(page, /name="gemsLootboxCommand" value="llb f all"/);
    });
});
