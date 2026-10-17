const test = require('node:test');
const assert = require('node:assert/strict');

const createGemsManager = require('../src/managers/gems');
const { normalizeGemsSettings, parseInventoryCodes, decideInventoryAction } = createGemsManager;

const TRIGGER = '**🌱 | neozen** menghabiskan 5 <:lucent:1523362382355759266>';
const inventory = (codes, name = 'neozen') =>
    `**====== Inventaris ${name} ======**\n${codes.map(code => `\`${code}\`<:item:1>⁰¹`).join('    ')}`;

function setup(settings = {}) {
    const state = {
        client: { user: { id: 'me', username: 'neozen' } },
        config: { settings: { gems: { enabled: true, delayMinMs: 0, delayMaxMs: 0, lootboxWaitMs: 0, ...settings } } }
    };
    const sent = [];
    const commandSender = { send: async (cmd, type, channelId) => { sent.push([cmd, channelId]); return true; } };
    const manager = createGemsManager(state, { getGemsSettings: () => normalizeGemsSettings(state.config.settings.gems) }, commandSender);
    return { state, manager, sent };
}

const message = (content, overrides = {}) => ({
    id: String(Math.random()),
    content,
    embeds: [],
    components: [],
    author: { id: 'lucy' },
    channel: { id: 'ch-1' },
    ...overrides
});

test('normalizeGemsSettings fills defaults', () => {
    const settings = normalizeGemsSettings(undefined);
    assert.equal(settings.enabled, false);
    assert.equal(settings.inventoryCommand, 'linv');
    assert.equal(settings.lootboxCommand, 'llb f all');
    assert.deepEqual(settings.requiredGems, ['57', '71', '78']);
    assert.deepEqual(settings.optionalGems, ['85']);
    assert.equal(settings.recheckMinutes, 5);
    assert.deepEqual(normalizeGemsSettings({ requiredGems: '1, 2', optionalGems: '' }).optionalGems, []);
});

test('parseInventoryCodes reads backtick codes ignoring leading zeros', () => {
    assert.deepEqual([...parseInventoryCodes(inventory(['049', '057', '71']))], ['49', '57', '71']);
});

test('decideInventoryAction: lootbox first, then use gems with optional 85 only when present', () => {
    const settings = normalizeGemsSettings({});
    assert.equal(decideInventoryAction(parseInventoryCodes(inventory(['049', '057'])), settings).type, 'lootbox');
    assert.equal(decideInventoryAction(parseInventoryCodes(inventory(['057', '071', '078'])), settings).command, 'luse 57 71 78');
    assert.equal(decideInventoryAction(parseInventoryCodes(inventory(['057', '071', '078', '085'])), settings).command, 'luse 57 71 78 85');
    assert.deepEqual(decideInventoryAction(parseInventoryCodes(inventory(['057', '085'])), settings), { type: 'missing', missing: ['71', '78'] });
});

test('trigger -> linv -> use gems', async () => {
    const { manager, sent } = setup();
    assert.equal(await manager.handle(message(TRIGGER)), 'trigger');
    assert.deepEqual(sent, [['linv', 'ch-1']]);
    assert.equal(await manager.handle(message(inventory(['057', '071', '078', '085', '100']))), 'use');
    assert.deepEqual(sent.at(-1), ['luse 57 71 78 85', 'ch-1']);
    manager.stop();
});

test('inventory with 049 opens lootbox then re-checks inventory', async () => {
    const { manager, sent } = setup();
    await manager.handle(message(TRIGGER));
    assert.equal(await manager.handle(message(inventory(['049', '057']))), 'lootbox');
    assert.deepEqual(sent.map(([cmd]) => cmd), ['linv', 'llb f all', 'linv']);
    assert.equal(await manager.handle(message(inventory(['057', '071', '078']))), 'use');
    assert.deepEqual(sent.at(-1)[0], 'luse 57 71 78');
    manager.stop();
});

test('incomplete gems schedule an inventory re-check every N minutes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { manager, sent, state } = setup();
    await manager.handle(message(TRIGGER));
    assert.equal(await manager.handle(message(inventory(['057']))), 'missing');
    assert.ok(state.gems.recheckTimer);
    t.mock.timers.tick(5 * 60000 - 1);
    assert.equal(sent.length, 1);
    t.mock.timers.tick(1);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(sent.map(([cmd]) => cmd), ['linv', 'linv']);
    manager.stop();
});

test('trigger is ignored while gems & lootbox are exhausted until the re-check pause elapses', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { manager, sent, state } = setup();
    await manager.handle(message(TRIGGER));
    assert.equal(await manager.handle(message(inventory(['057']))), 'missing');
    assert.equal(state.gems.exhausted, true);
    assert.equal(await manager.handle(message(TRIGGER)), 'paused');
    assert.equal(await manager.handle(message(TRIGGER)), 'paused');
    assert.deepEqual(sent.map(([cmd]) => cmd), ['linv']);

    t.mock.timers.tick(5 * 60000);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(sent.map(([cmd]) => cmd), ['linv', 'linv']);
    assert.equal(await manager.handle(message(inventory(['057', '071', '078']))), 'use');
    assert.equal(state.gems.exhausted, false);

    assert.equal(await manager.handle(message(TRIGGER)), 'trigger');
    assert.deepEqual(sent.map(([cmd]) => cmd), ['linv', 'linv', 'luse 57 71 78', 'linv']);
    manager.stop();
});

test('duplicate trigger while waiting for inventory does not resend linv', async () => {
    const { manager, sent } = setup();
    await manager.handle(message(TRIGGER));
    assert.equal(await manager.handle(message(TRIGGER)), 'pending');
    assert.deepEqual(sent.map(([cmd]) => cmd), ['linv']);
    manager.stop();
});

test('ignores other accounts, unsolicited inventories and disabled setting', async () => {
    const { manager, sent, state } = setup();
    assert.equal(await manager.handle(message('**🌱 | neozen2** menghabiskan 5 <:lucent:1523362382355759266>')), null);
    assert.equal(await manager.handle(message(inventory(['057', '071', '078']))), null);
    assert.equal(await manager.handle(message(TRIGGER, { author: { id: 'me' } })), null);
    state.config.settings.gems.enabled = false;
    assert.equal(await manager.handle(message(TRIGGER)), null);
    assert.deepEqual(sent, []);
});

test('reads inventory from Components V2 / embeds', async () => {
    const { manager, sent } = setup({ accountName: 'neozen' });
    await manager.handle(message(TRIGGER));
    await manager.handle(message('', { components: [{ type: 17, components: [{ type: 10, content: inventory(['057', '071', '078']) }] }] }));
    assert.equal(sent.at(-1)[0], 'luse 57 71 78');
    manager.stop();
});
