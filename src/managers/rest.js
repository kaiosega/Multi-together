const log = require('../../logger');
const { accountPrefix } = require('../utils');

const MINUTE_MS = 60000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WIB_OFFSET_MS = 7 * 60 * MINUTE_MS;
const TICK_MS = 15000;
const MAX_BUDGET_MINUTES = 20 * 60;
const TIME_RE = /^([01]?\d|2[0-3])[.:]([0-5]\d)$/;

const REST_DEFAULTS = {
    schedule: { enabled: false, start: '05:00', end: '10:00' },
    budget: { enabled: false, maxMinutes: 300, minSessionMinutes: 15, maxSessionMinutes: 60 }
};

const toInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) ? num : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeTime = (value, fallback) => {
    const match = TIME_RE.exec(String(value || '').trim());
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : fallback;
};

const normalizeRestSettings = (raw = {}) => {
    const schedule = raw?.schedule || {};
    const budget = raw?.budget || {};
    const d = REST_DEFAULTS;
    const maxMinutes = clamp(toInt(budget.maxMinutes, d.budget.maxMinutes), 1, MAX_BUDGET_MINUTES);
    const minSessionMinutes = clamp(toInt(budget.minSessionMinutes, d.budget.minSessionMinutes), 1, maxMinutes);
    const maxSessionMinutes = clamp(toInt(budget.maxSessionMinutes, d.budget.maxSessionMinutes), minSessionMinutes, maxMinutes);
    return {
        schedule: {
            enabled: schedule.enabled === true,
            start: normalizeTime(schedule.start, d.schedule.start),
            end: normalizeTime(schedule.end, d.schedule.end)
        },
        budget: { enabled: budget.enabled === true, maxMinutes, minSessionMinutes, maxSessionMinutes }
    };
};

const timeToMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

// Awal hari (00:00 WIB) dari timestamp, dalam epoch ms.
const wibDayStart = (ts) => Math.floor((ts + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS;

const nextWibTime = (ts, minutes) => {
    let candidate = wibDayStart(ts) + minutes * MINUTE_MS;
    if (candidate <= ts) candidate += DAY_MS;
    return candidate;
};

const formatWib = (ts) => {
    if (!Number.isFinite(ts)) return '-';
    const d = new Date(ts + WIB_OFFSET_MS);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} WIB`;
};

const formatDuration = (ms) => {
    const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE_MS));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}j ${m}m` : `${m}m`;
};

// Jadwal: { active, until, nextStart }. start === end dianggap tidak aktif.
const evaluateSchedule = (schedule, now) => {
    if (!schedule.enabled) return { active: false };
    const start = timeToMinutes(schedule.start);
    const end = timeToMinutes(schedule.end);
    if (start === end) return { active: false };
    const minuteOfDay = Math.floor(((now + WIB_OFFSET_MS) % DAY_MS) / MINUTE_MS);
    const active = start < end
        ? minuteOfDay >= start && minuteOfDay < end
        : minuteOfDay >= start || minuteOfDay < end;
    return {
        active,
        until: active ? nextWibTime(now, end) : null,
        nextStart: active ? null : nextWibTime(now, start)
    };
};

// Bagi totalMs menjadi sesi acak (min..max) lalu sebar acak tanpa tumpang tindih di [from, to).
const planSessions = ({ from, to, totalMs, minSessionMs, maxSessionMs, random = Math.random }) => {
    const span = Math.max(0, to - from);
    let remaining = Math.min(Math.max(0, totalMs), span);
    const durations = [];
    while (remaining > 0) {
        if (remaining <= maxSessionMs) {
            // Sisa yang lebih pendek dari sesi minimum dibuang agar total tetap <= batas.
            if (remaining >= minSessionMs || durations.length === 0) durations.push(remaining);
            break;
        }
        const duration = Math.round(minSessionMs + random() * (maxSessionMs - minSessionMs));
        durations.push(duration);
        remaining -= duration;
    }

    const free = span - durations.reduce((sum, item) => sum + item, 0);
    const weights = Array.from({ length: durations.length + 1 }, () => random() + 0.05);
    const weightSum = weights.reduce((sum, item) => sum + item, 0);
    const sessions = [];
    let cursor = from;
    durations.forEach((duration, index) => {
        cursor += Math.floor(free * weights[index] / weightSum);
        sessions.push({ start: cursor, end: cursor + duration });
        cursor += duration;
    });
    return sessions;
};

const budgetSignature = (budget) => `${budget.maxMinutes}/${budget.minSessionMinutes}/${budget.maxSessionMinutes}`;

const createRestManager = (state, configManager, hooks = {}, options = {}) => {
    const now = options.now || (() => Date.now());
    const random = options.random || Math.random;
    const prefix = () => `${accountPrefix(state)}😴 Istirahat: `;
    const getSettings = () => (typeof configManager.getRestSettings === 'function'
        ? configManager.getRestSettings()
        : normalizeRestSettings(state.config?.settings?.rest));

    const rest = state.rest = state.rest || {
        active: false,
        reasons: [],
        since: null,
        until: null,
        budgetActiveSince: null,
        plan: null,
        timer: null
    };

    const persistPlan = () => {
        if (!state.config) return;
        state.config.restState = rest.plan ? { ...rest.plan, sessions: rest.plan.sessions.map(s => ({ ...s })) } : null;
        try { configManager.save(); } catch (error) { log.warn(`${prefix()}Gagal simpan rencana istirahat: ${error.message}`); }
    };

    const restorePlan = (budget, ts) => {
        const saved = state.config?.restState;
        if (!saved || !Array.isArray(saved.sessions) || !(saved.windowEnd > ts) || saved.signature !== budgetSignature(budget)) return null;
        return {
            windowStart: Number(saved.windowStart),
            windowEnd: Number(saved.windowEnd),
            signature: saved.signature,
            maxMs: budget.maxMinutes * MINUTE_MS,
            usedMs: Math.max(0, Number(saved.usedMs) || 0),
            sessions: saved.sessions.map(s => ({ start: Number(s.start), end: Number(s.end) }))
        };
    };

    const createPlan = (budget, ts, { windowStart = ts, windowEnd = ts + DAY_MS, usedMs = 0 } = {}) => {
        const maxMs = budget.maxMinutes * MINUTE_MS;
        return {
            windowStart,
            windowEnd,
            signature: budgetSignature(budget),
            maxMs,
            usedMs,
            sessions: planSessions({
                from: ts,
                to: windowEnd,
                totalMs: maxMs - usedMs,
                minSessionMs: budget.minSessionMinutes * MINUTE_MS,
                maxSessionMs: budget.maxSessionMinutes * MINUTE_MS,
                random
            })
        };
    };

    const closeBudgetSession = (ts) => {
        if (rest.budgetActiveSince == null || !rest.plan) return;
        rest.plan.usedMs = Math.min(rest.plan.maxMs, rest.plan.usedMs + Math.max(0, ts - rest.budgetActiveSince));
        rest.budgetActiveSince = null;
        persistPlan();
    };

    const ensurePlan = (budget, ts) => {
        if (!budget.enabled) {
            if (rest.plan) {
                rest.plan = null;
                persistPlan();
            }
            return null;
        }
        if (!rest.plan) {
            rest.plan = restorePlan(budget, ts) || createPlan(budget, ts);
            log.info(`${prefix()}Rencana 24 jam dibuat: ${rest.plan.sessions.map(s => `${formatWib(s.start)}–${formatWib(s.end)}`).join(', ') || '-'}.`);
            persistPlan();
        } else if (ts >= rest.plan.windowEnd) {
            closeBudgetSession(rest.plan.windowEnd);
            const windowStart = ts - rest.plan.windowEnd < DAY_MS ? rest.plan.windowEnd : ts;
            rest.plan = createPlan(budget, ts, { windowStart, windowEnd: windowStart + DAY_MS });
            log.info(`${prefix()}Periode 24 jam baru dimulai, sesi istirahat dijadwalkan ulang.`);
            persistPlan();
        } else if (rest.plan.signature !== budgetSignature(budget)) {
            closeBudgetSession(ts);
            const usedMs = Math.min(rest.plan.usedMs, budget.maxMinutes * MINUTE_MS);
            rest.plan = createPlan(budget, ts, { windowStart: rest.plan.windowStart, windowEnd: rest.plan.windowEnd, usedMs });
            log.info(`${prefix()}Batas istirahat diubah, sisa sesi dijadwalkan ulang.`);
            persistPlan();
        }
        return rest.plan;
    };

    const usedBudgetMs = (ts) => {
        if (!rest.plan) return 0;
        const running = rest.budgetActiveSince != null ? Math.max(0, ts - rest.budgetActiveSince) : 0;
        return Math.min(rest.plan.maxMs, rest.plan.usedMs + running);
    };

    const evaluateBudget = (budget, ts) => {
        const plan = ensurePlan(budget, ts);
        if (!plan) return { active: false };
        const leftMs = plan.maxMs - usedBudgetMs(ts);
        const session = plan.sessions.find(s => ts >= s.start && ts < s.end);
        const next = plan.sessions.find(s => s.start > ts);
        if (!session || leftMs <= 0) return { active: false, nextStart: next ? next.start : null };
        const sessionStart = rest.budgetActiveSince ?? ts;
        return { active: true, until: Math.min(session.end, sessionStart + (plan.maxMs - plan.usedMs)) };
    };

    const api = {
        tick() {
            const ts = now();
            const settings = getSettings();
            const schedule = evaluateSchedule(settings.schedule, ts);
            const budget = evaluateBudget(settings.budget, ts);

            if (budget.active && rest.budgetActiveSince == null) rest.budgetActiveSince = ts;
            if (!budget.active && rest.budgetActiveSince != null) closeBudgetSession(ts);

            const reasons = [schedule.active && 'schedule', budget.active && 'budget'].filter(Boolean);
            const until = Math.max(schedule.active ? schedule.until : 0, budget.active ? budget.until : 0) || null;
            rest.nextStart = [schedule.nextStart, budget.nextStart].filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null;

            if (reasons.length > 0 && !rest.active) {
                rest.active = true;
                rest.since = ts;
                rest.reasons = reasons;
                rest.until = until;
                log.warn(`${prefix()}mulai (${reasons.map(r => (r === 'schedule' ? 'jadwal' : 'batas 24 jam')).join(' + ')}) sampai ${formatWib(until)}. Semua loop dijeda (Boss2 tetap aktif).`);
                if (typeof hooks.onStart === 'function') hooks.onStart(api.getStatus());
            } else if (reasons.length === 0 && rest.active) {
                const status = api.getStatus();
                rest.active = false;
                rest.reasons = [];
                rest.since = null;
                rest.until = null;
                log.success(`${prefix()}selesai. Loop dilanjutkan kembali.`);
                if (typeof hooks.onEnd === 'function') hooks.onEnd(status);
            } else if (rest.active) {
                rest.reasons = reasons;
                rest.until = until;
            }
            return rest.active;
        },

        start() {
            if (rest.timer) return;
            api.tick();
            rest.timer = setInterval(() => {
                try { api.tick(); } catch (error) { log.error(`${prefix()}Tick gagal: ${error.message}`); }
            }, options.tickMs || TICK_MS);
            if (typeof rest.timer.unref === 'function') rest.timer.unref();
        },

        stop() {
            if (rest.timer) clearInterval(rest.timer);
            rest.timer = null;
            if (rest.budgetActiveSince != null) closeBudgetSession(now());
            rest.active = false;
            rest.reasons = [];
        },

        isActive() {
            return rest.active === true;
        },

        getStatus() {
            const ts = now();
            const settings = getSettings();
            const plan = rest.plan;
            return {
                enabled: settings.schedule.enabled || settings.budget.enabled,
                active: rest.active,
                reasons: [...(rest.reasons || [])],
                since: rest.since,
                until: rest.until,
                remainingMs: rest.active && rest.until ? Math.max(0, rest.until - ts) : null,
                nextStart: rest.active ? null : rest.nextStart ?? null,
                schedule: settings.schedule,
                budget: plan ? {
                    enabled: settings.budget.enabled,
                    windowStart: plan.windowStart,
                    windowEnd: plan.windowEnd,
                    maxMs: plan.maxMs,
                    usedMs: usedBudgetMs(ts),
                    plannedMs: plan.sessions.reduce((sum, s) => sum + (s.end - s.start), 0),
                    sessions: plan.sessions.map(s => ({ ...s }))
                } : { enabled: settings.budget.enabled }
            };
        }
    };
    return api;
};

const REASON_LABELS = { schedule: 'jadwal', budget: 'batas 24 jam' };

const describeRestStatus = (status) => {
    if (!status) return ['Runtime akun belum berjalan.'];
    if (!status.enabled) return ['⏹ Istirahat nonaktif.'];
    const lines = [];
    if (status.active) {
        const reasons = status.reasons.map(r => REASON_LABELS[r] || r).join(' + ');
        lines.push(`😴 Sedang istirahat (${reasons}) sejak ${formatWib(status.since)}, selesai ${formatWib(status.until)} — sisa ${formatDuration(status.remainingMs)}.`);
    } else {
        lines.push(`▶ Tidak istirahat. Istirahat berikutnya: ${formatWib(status.nextStart)}.`);
    }
    if (status.schedule?.enabled) lines.push(`🕔 Jadwal: ${status.schedule.start} – ${status.schedule.end} WIB setiap hari.`);
    const budget = status.budget || {};
    if (budget.enabled && Number.isFinite(budget.maxMs)) {
        lines.push(`⏳ Batas 24 jam: terpakai ${formatDuration(budget.usedMs)} dari ${formatDuration(budget.maxMs)} (periode ${formatWib(budget.windowStart)} – ${formatWib(budget.windowEnd)}).`);
        lines.push(`🎲 Sesi acak: ${budget.sessions.map(s => `${formatWib(s.start)} – ${formatWib(s.end)}`).join(', ') || '-'}.`);
    }
    return lines;
};

createRestManager.REST_DEFAULTS = REST_DEFAULTS;
createRestManager.describeRestStatus = describeRestStatus;
createRestManager.normalizeRestSettings = normalizeRestSettings;
createRestManager.evaluateSchedule = evaluateSchedule;
createRestManager.planSessions = planSessions;
createRestManager.formatWib = formatWib;
createRestManager.formatDuration = formatDuration;
module.exports = createRestManager;
