const test = require('node:test');
const assert = require('node:assert/strict');

const createMessageHandler = require('../src/managers/message');

function createHarness({ allowIds = [] } = {}) {
    const calls = [];
    const state = {
        client: { isReady: () => true, user: { id: 'self' } },
        config: {
            botStatus: { running: false, paused: true },
            settings: {
                boss2: { enabled: false },
                gems: { enabled: false },
                adventure: { enabled: false, targetId: 't', channelId: 'c', guildId: 'g' }
            },
            otherCommands: [{ enabled: false }, { enabled: false }, { enabled: false }]
        }
    };
    const configManager = {
        getControlCommands: () => ({ startCmd: 'wcash', pauseCmd: 'wbuy 1', allowIds: [] }),
        getLucyControlCommands: () => ({ startCmd: 'lucy start', pauseCmd: 'lucy pause', allowIds }),
        save: () => calls.push('save')
    };
    const loopManager = {
        startAll: () => calls.push('owoStartAll'),
        stopAll: () => calls.push('owoStopAll'),
        startOtherCommand: (index) => calls.push(`startOther${index}`),
        stopOtherCommand: (index) => calls.push(`stopOther${index}`)
    };
    const telegramService = { send: (text) => calls.push(`tg:${text}`) };
    const adventureManager = {
        start: async (opts) => { calls.push(`advStart:${opts?.restart}`); return true; },
        stop: () => calls.push('advStop')
    };
    const handler = createMessageHandler(
        state, configManager, {}, {}, loopManager, {}, telegramService, null, null, {}, null,
        adventureManager,
        { stop: () => calls.push('boss2Stop') },
        { stop: () => calls.push('gemsStop') }
    );
    const send = (content, authorId = 'self') => handler.handleControlCommands({ content, author: { id: authorId }, channel: { id: 'ch' } });
    return { state, calls, send };
}

const lucyFlags = (state) => [
    state.config.settings.boss2.enabled,
    state.config.settings.gems.enabled,
    state.config.settings.adventure.enabled,
    ...state.config.otherCommands.map(command => command.enabled)
];

test('Lucy start word enables every Lucy feature and starts its schedulers without touching OwO', async () => {
    const { state, calls, send } = createHarness();
    await send('Lucy Start');

    assert.deepEqual(lucyFlags(state), [true, true, true, true, true, true]);
    assert.ok(calls.includes('save'));
    assert.ok(calls.includes('advStart:true'));
    assert.ok(['startOther0', 'startOther1', 'startOther2'].every(call => calls.includes(call)));
    assert.ok(calls.some(call => call.startsWith('tg:') && call.includes('Lucy Started')));
    assert.ok(!calls.includes('owoStartAll'));
    assert.deepEqual(state.config.botStatus, { running: false, paused: true });
});

test('Lucy pause word disables every Lucy feature and stops timers', async () => {
    const { state, calls, send } = createHarness();
    await send('lucy start');
    calls.length = 0;
    await send('lucy pause');

    assert.deepEqual(lucyFlags(state), [false, false, false, false, false, false]);
    for (const call of ['save', 'advStop', 'stopOther0', 'stopOther1', 'stopOther2', 'boss2Stop', 'gemsStop']) {
        assert.ok(calls.includes(call), `expected ${call}`);
    }
    assert.ok(calls.some(call => call.startsWith('tg:') && call.includes('Lucy Paused')));
    assert.ok(!calls.includes('owoStopAll'));
});

test('Lucy control ignores senders outside lucyControl.allowIds', async () => {
    const { state, calls, send } = createHarness({ allowIds: ['friend'] });
    await send('lucy start', 'stranger');
    assert.deepEqual(lucyFlags(state), [false, false, false, false, false, false]);
    assert.deepEqual(calls, []);

    await send('lucy start', 'friend');
    assert.deepEqual(lucyFlags(state), [true, true, true, true, true, true]);
});
