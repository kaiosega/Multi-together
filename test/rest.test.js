const test = require('node:test');
const assert = require('node:assert/strict');

const createRestManager = require('../src/managers/rest');
const { normalizeRestSettings, evaluateSchedule, planSessions, describeRestStatus } = createRestManager;

const MIN = 60000;
const HOUR = 60 * MIN;
// 00:00 WIB tanggal 17/10/2026 = 16/10/2026 17:00 UTC.
const wib = (h, m = 0) => Date.UTC(2026, 9, 16, 17, 0) + h * HOUR + m * MIN;

function setup(rest, startAt) {
    let now = startAt;
    const state = { config: { settings: { rest } } };
    const starts = [];
    const ends = [];
    const configManager = { save() {}, getRestSettings: () => normalizeRestSettings(state.config.settings.rest) };
    const manager = createRestManager(state, configManager, {
        onStart: status => starts.push(status),
        onEnd: status => ends.push(status)
    }, { now: () => now });
    return { state, manager, starts, ends, setNow: (value) => { now = value; } };
}

test('normalizeRestSettings fills defaults and clamps values', () => {
    const defaults = normalizeRestSettings(undefined);
    assert.deepEqual(defaults.schedule, { enabled: false, start: '05:00', end: '10:00' });
    assert.equal(defaults.budget.enabled, false);
    assert.equal(defaults.budget.maxMinutes, 300);

    const custom = normalizeRestSettings({
        schedule: { enabled: true, start: '7.30', end: 'abc' },
        budget: { enabled: true, maxMinutes: 5000, minSessionMinutes: 90, maxSessionMinutes: 10 }
    });
    assert.equal(custom.schedule.start, '07:30');
    assert.equal(custom.schedule.end, '10:00');
    assert.equal(custom.budget.maxMinutes, 1200);
    assert.equal(custom.budget.minSessionMinutes, 90);
    assert.equal(custom.budget.maxSessionMinutes, 90);
});

test('evaluateSchedule uses WIB and supports windows across midnight', () => {
    const schedule = { enabled: true, start: '05:00', end: '10:00' };
    assert.deepEqual(evaluateSchedule(schedule, wib(4, 59)), { active: false, until: null, nextStart: wib(5) });
    assert.deepEqual(evaluateSchedule(schedule, wib(5)), { active: true, until: wib(10), nextStart: null });
    assert.equal(evaluateSchedule(schedule, wib(10)).active, false);
    assert.equal(evaluateSchedule(schedule, wib(10)).nextStart, wib(29));

    const overnight = { enabled: true, start: '22:00', end: '02:00' };
    assert.equal(evaluateSchedule(overnight, wib(23)).until, wib(26));
    assert.equal(evaluateSchedule(overnight, wib(1)).until, wib(2));
    assert.equal(evaluateSchedule(overnight, wib(3)).active, false);
    assert.equal(evaluateSchedule({ ...schedule, enabled: false }, wib(6)).active, false);
});

test('planSessions splits the budget into random, non-overlapping sessions inside the window', () => {
    for (let i = 0; i < 50; i++) {
        const sessions = planSessions({ from: 0, to: 24 * HOUR, totalMs: 5 * HOUR, minSessionMs: 15 * MIN, maxSessionMs: 60 * MIN });
        const total = sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
        assert.ok(total <= 5 * HOUR, 'total must not exceed the budget');
        assert.ok(total > 5 * HOUR - 15 * MIN);
        assert.ok(sessions.length >= 5);
        sessions.forEach((s, index) => {
            assert.ok(s.end - s.start >= 15 * MIN && s.end - s.start <= 60 * MIN);
            assert.ok(s.start >= 0 && s.end <= 24 * HOUR);
            if (index > 0) assert.ok(s.start >= sessions[index - 1].end, 'sessions must not overlap');
        });
    }
});

test('schedule mode starts rest at the start time and resumes at the end time (hooks fire once)', () => {
    const { manager, state, starts, ends, setNow } = setup({ schedule: { enabled: true, start: '05:00', end: '10:00' } }, wib(4, 59));
    assert.equal(manager.tick(), false);
    setNow(wib(5));
    assert.equal(manager.tick(), true);
    assert.equal(manager.tick(), true);
    assert.equal(starts.length, 1);
    assert.equal(state.rest.active, true);
    const status = manager.getStatus();
    assert.equal(status.until, wib(10));
    assert.equal(status.remainingMs, 5 * HOUR);
    assert.match(describeRestStatus(status)[0], /Sedang istirahat \(jadwal\).*sisa 5j 0m/);

    setNow(wib(10));
    assert.equal(manager.tick(), false);
    assert.equal(ends.length, 1);
    assert.equal(state.rest.active, false);
});

test('budget mode keeps cumulative rest within the 24h limit and replans the next window', () => {
    const rest = { budget: { enabled: true, maxMinutes: 60, minSessionMinutes: 10, maxSessionMinutes: 20 } };
    const { manager, state, starts, ends, setNow } = setup(rest, wib(0));
    manager.tick();
    const firstPlan = state.rest.plan;
    assert.ok(firstPlan.sessions.length >= 3);
    assert.ok(state.config.restState, 'plan is persisted to config');

    let restingMinutes = 0;
    for (let minute = 0; minute < 24 * 60; minute++) {
        setNow(wib(0, minute));
        if (manager.tick()) restingMinutes += 1;
    }
    assert.ok(restingMinutes <= 60, `rested ${restingMinutes} minutes`);
    assert.ok(restingMinutes >= 50);
    assert.equal(starts.length, ends.length + (state.rest.active ? 1 : 0));
    assert.ok(manager.getStatus().budget.usedMs <= 60 * MIN);

    setNow(wib(24, 1));
    manager.tick();
    assert.equal(state.rest.plan.windowStart, firstPlan.windowEnd);
    assert.notDeepEqual(state.rest.plan.sessions, firstPlan.sessions);
});

test('budget plan and used time are restored from config after a restart', () => {
    const rest = { budget: { enabled: true, maxMinutes: 120, minSessionMinutes: 10, maxSessionMinutes: 30 } };
    const first = setup(rest, wib(0));
    first.manager.tick();
    const saved = JSON.parse(JSON.stringify(first.state.config.restState));

    const second = setup(rest, wib(0, 1));
    second.state.config.restState = saved;
    second.manager.tick();
    assert.deepEqual(second.state.rest.plan.sessions, saved.sessions);
});

test('describeRestStatus reports disabled state', () => {
    const { manager } = setup({}, wib(6));
    manager.tick();
    assert.deepEqual(describeRestStatus(manager.getStatus()), ['⏹ Istirahat nonaktif.']);
});
