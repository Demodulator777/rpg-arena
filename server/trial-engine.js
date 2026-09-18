// Trial of the Arcane — trial champion combat engine.
//
// In the event, the player does NOT use their own character. Instead they
// command a FIXED party of 4 trial champions (identical for every player).
// Each champion has its own HP, its own energy pool, and a unique set of
// abilities.
//
// REAL-TIME FLOW (server tick clock):
//   1. The client polls /combat/act on a ~1s heartbeat with actions for the
//      ACTIVE champion. Each request carries `now` (client Date.now()) and
//      `dtMs` (time since the previous tick) — the server advances the battle
//      by that delta, so nothing progresses while the tab is closed.
//   2. Cooldowns are WALL-CLOCK millisecond stamps stored on the session state
//      (champ.cdUntil[abilityId] = now + cooldownMs). Normal attack 5s,
//      burst 15s, ultimate 30s — per character, ticked by the clock, not by
//      turns. Skipping is a local no-op; there are no acted flags.
//      ENERGY: bursts cost nothing and generate energy just like normal attacks;
//      only the ULTIMATE spends energy (a full bar). Normal attacks AND bursts
//      are the generators that feed the ultimate's gauge.
//   3. Every 3000ms (strikeTickAt) each alive, unfrozen monster strikes a
//      random alive champion (50% reduced through Guard, absorbed by shields).
//      Frozen monsters hold their windows until freezeUntil elapses.
//   4. Burn DoT ticks on the same 3s grid (burnTickAt × burnTicksLeft).
//      Buffs run on millisecond expiry stamps (guardUntil, dmgBuffUntil,
//      partyBuffUntil) — "2 rounds" became 6s, "3 rounds" became 9s.
//
// A run ends when all 4 champions are downed (player_dead) or every monster
// in the room is dead (room_cleared / event_complete on the boss).

const TRIAL_CHARACTERS = [
    {
        id: 'pyra',
        name: 'Pyra',
        icon: '🔥',
        role: 'Pyromancer',
        className: 'mage',
        image: '/images/class/pyra.png',
        hp: 1500,
        atk: 170,
        def: 45,
        energy: 0,
        maxEnergy: 120,
        energyGain: 18,
        abilities: [
            { id: 'arcbolt',  type: 'attack',   name: 'Arc Bolt',   icon: '🔥', cost: 0,   cooldownMs: 5000,  desc: 'Deal 110% ATK damage. 5s cooldown — generates 18 energy.' },
            { id: 'fireball', type: 'burst',    name: 'Fireball',   icon: '🔥', cost: 0,  cooldownMs: 15000, desc: 'Deal 160% ATK damage + BURN the target (80 dmg every 3s for 2 ticks). No energy cost — generates 18 energy, 15s cooldown.' },
            { id: 'inferno',  type: 'ultimate', name: 'Inferno',    icon: '🌋', cost: 120, cooldownMs: 30000, desc: 'ULTIMATE — deal 190% ATK damage + BURN the target (80 dmg every 3s for 2 ticks). Needs a full energy bar, 30s cooldown.' },
        ],
    },
    {
        id: 'frost',
        name: 'Frost',
        icon: '❄️',
        role: 'Cryomancer',
        className: 'mage',
        image: '/images/class/frost.png',
        hp: 1450,
        atk: 160,
        def: 50,
        energy: 0,
        maxEnergy: 120,
        energyGain: 17,
        abilities: [
            { id: 'froststrike', type: 'attack',   name: 'Frost Strike', icon: '❄️', cost: 0,   cooldownMs: 5000,  desc: 'Deal 110% ATK damage. 5s cooldown — generates 17 energy.' },
            { id: 'deepfreeze',  type: 'burst',    name: 'Deep Freeze',  icon: '🧊', cost: 0,  cooldownMs: 15000, desc: 'Deal 55% ATK damage + FREEZE the target for 6s (it cannot strike). No energy cost — generates 17 energy, 15s cooldown.' },
            { id: 'blizzard',    type: 'ultimate', name: 'Blizzard',     icon: '🌨️', cost: 120, cooldownMs: 30000, desc: 'ULTIMATE — deal 150% ATK damage + 50% chance to FREEZE the target for 3s. Needs a full energy bar, 30s cooldown.' },
        ],
    },
    {
        id: 'vorn',
        name: 'Vorn',
        icon: '🛡️',
        role: 'Warden',
        className: 'warrior',
        image: '/images/class/vorn.png',
        hp: 2000,
        atk: 140,
        def: 70,
        energy: 0,
        maxEnergy: 120,
        energyGain: 16,
        abilities: [
            { id: 'shieldbash', type: 'attack',   name: 'Shield Bash', icon: '🛡️', cost: 0,   cooldownMs: 5000,  desc: 'Deal 115% ATK damage + gain a 120 shield. 5s cooldown — generates 16 energy.' },
            { id: 'guard',      type: 'burst',    name: 'Guard',       icon: '⛨',  cost: 0,  cooldownMs: 15000, desc: 'Take 50% less monster damage for 9s. No energy cost — generates 16 energy, 15s cooldown.' },
            { id: 'warcry',     type: 'ultimate', name: 'War Cry',     icon: '📯',  cost: 120, cooldownMs: 30000, desc: 'ULTIMATE — party damage buff: +35% ATK for all champions for 9s. Needs a full energy bar, 30s cooldown.' },
        ],
    },
    {
        id: 'aria',
        name: 'Aria',
        icon: '✨',
        role: 'Mender',
        className: 'paladin',
        image: '/images/class/aria.png',
        hp: 1600,
        atk: 130,
        def: 55,
        energy: 0,
        maxEnergy: 120,
        energyGain: 17,
        abilities: [
            { id: 'smite',   type: 'attack',   name: 'Smite',   icon: '✨', cost: 0,   cooldownMs: 5000,  desc: 'Deal 115% ATK damage. 5s cooldown — generates 17 energy.' },
            { id: 'mend',    type: 'burst',    name: 'Mend',    icon: '💚', cost: 0,  cooldownMs: 15000, desc: 'Heal the lowest-HP ally (or revive a downed one) for 30% max HP + channel 25% of the heal as radiant damage. No energy cost — generates 17 energy, 15s cooldown.' },
            { id: 'renewal', type: 'ultimate', name: 'Renewal', icon: '💫', cost: 120, cooldownMs: 30000, desc: 'ULTIMATE — heal ALL allies for 22% max HP (revives downed allies) + channel radiant damage into the target. Needs a full energy bar, 30s cooldown.' },
        ],
    },
];

function buildTrialParty() {
    return TRIAL_CHARACTERS.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        role: c.role,
        className: c.className,
        image: c.image,
        hp: c.hp,
        maxHp: c.hp,
        atk: c.atk,
        def: c.def,
        // Champions open the fight with an EMPTY energy bar — normal attacks are
        // the generator that fills it toward bursts and the ultimate.
        energy: 0,
        maxEnergy: c.maxEnergy,
        energyGain: c.energyGain,
        // Real-time cooldown stamps (epoch ms) per ability id + DoT/buff clocks.
        cdUntil: {},
        alive: true,
        shield: 0,
        guardUntil: 0,
        dmgBuff: 0,
        dmgBuffUntil: 0,
        abilities: c.abilities.map(a => ({ ...a })),
    }));
}

// Bring sessions from older formats up to the current real-time kit.
// ONLY fires when something actually needs replacing — live HP, energy and
// cooldown stamps are preserved where valid:
//   • turn-era kit (abilities without `cooldownMs`, acted flags, burstCd,
//     guardTurns, dmgBuffTurns) → full kit swap, clocks re-based
//   • missing cdUntil / tick stamps → initialized in place, HP/energy kept
function migrateTrialParty(party) {
    if (!Array.isArray(party)) return party;
    return party.map((c) => {
        const def = TRIAL_CHARACTERS.find(t => t.id === c.id);
        if (!def) return c;
        const firstAbil = (c.abilities || [])[0] || {};
        if (!firstAbil.cooldownMs) {
            // Turn-era session: full normalization to the real-time kit.
            return {
                ...c,
                maxEnergy: def.maxEnergy,
                energyGain: def.energyGain,
                burstCd: undefined,
                acted: undefined,
                guardTurns: undefined,
                dmgBuffTurns: undefined,
                cdUntil: {},
                guardUntil: 0,
                dmgBuffUntil: 0,
                abilities: def.abilities.map(a => ({ ...a })),
            };
        }
        // Current kit — ensure the real-time fields all exist.
        const needsCd = !c.cdUntil || typeof c.cdUntil !== 'object';
        const needsStamps = typeof c.guardUntil !== 'number' || typeof c.dmgBuffUntil !== 'number';
        if (!needsCd && !needsStamps) return c; // untouched
        return {
            ...c,
            ...(needsCd ? { cdUntil: (c.cdUntil && typeof c.cdUntil === 'object') ? c.cdUntil : {} } : {}),
            ...(typeof c.guardUntil !== 'number' ? { guardUntil: 0 } : {}),
            ...(typeof c.dmgBuffUntil !== 'number' ? { dmgBuffUntil: 0 } : {}),
        };
    });
}

function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function aliveMonsters(state) {
    return state.monsters.filter(m => Number(m.currentHp || 0) > 0);
}

function aliveChampions(state) {
    return state.party.filter(c => c.alive);
}

// Find the champion with the lowest HP percentage (dead champions count as 0).
function lowestHpAlly(state) {
    let best = null;
    let bestRatio = Infinity;
    for (const c of state.party) {
        const ratio = c.alive ? c.hp / Math.max(1, c.maxHp) : 0;
        if (ratio < bestRatio) { bestRatio = ratio; best = c; }
    }
    return best;
}

// ── Real-time battle clock ────────────────────────────────────────────────
// Monsters strike (and burn DoT ticks) on a shared 3-second grid.
const TRIAL_STRIKE_MS = 3000;

// Shared combat math for ticks and actions: damage accounting (kills, bosses,
// overflow), Battle Focus scaling and buff-aware ATK. Overflow: damage past
// the kill is still counted as dealt (a 40 hit on a 1-HP foe deals 40).
function trialCombatKit(state, now, log, focusMult) {
    const killed = [];
    const partyBuffActive = Number(state.partyBuffUntil || 0) > now ? Number(state.partyBuff || 0) : 0;
    const dmgMult = 1 + partyBuffActive;
    const atkFor = (ch) => Math.max(1, ch.atk
        * (1 + (Number(ch.dmgBuffUntil || 0) > now ? Number(ch.dmgBuff || 0) : 0))
        * dmgMult);
    const hitDmg = (ch, t) => Math.max(1, Math.floor(atkFor(ch) - Number(t.def || 0) * 0.5 + roll(-3, 3)));
    const dealFlat = (t, amount) => {
        const prevHp = Math.max(0, Number(t.currentHp || 0));
        const d = Math.max(1, Math.round(amount * focusMult));
        const overflow = Math.max(0, d - prevHp);
        t.currentHp = Math.max(0, prevHp - d);
        state._eventDmg = Math.max(0, Number(state._eventDmg || 0)) + d;
        if (overflow > 0) state._eventOverflow = Math.max(0, Number(state._eventOverflow || 0)) + overflow;
        if (prevHp > 0 && t.currentHp <= 0) {
            // Kill accounting lives on the RUN-level state (never resets between
            // rooms). _runBosses counts TRUE bosses only (the Sovereign).
            if (!killed.includes(t.name)) killed.push(t.name);
            state._runKills = Math.max(0, Number(state._runKills || 0)) + 1;
            if (t.isBoss) state._runBosses = Math.max(0, Number(state._runBosses || 0)) + 1;
        }
        return d;
    };
    const hit = (ch, t, mult = 1) => dealFlat(t, hitDmg(ch, t) * mult);
    return { killed, dealFlat, hit, atkFor };
}

function freezeMonster(t, now, ms) {
    t.freezeUntil = Math.max(now, Number(t.freezeUntil || 0)) + Math.max(1000, ms);
}

function burnMonster(t, now, ticks) {
    if (Number(t.currentHp || 0) <= 0) return;
    t.burnTicksLeft = Math.max(Number(t.burnTicksLeft || 0), ticks);
    if (typeof t.burnTickAt !== 'number') t.burnTickAt = now + TRIAL_STRIKE_MS;
}

function pickTargetMonster(state, idx) {
    let t = state.monsters[Number(idx)];
    if (!t || Number(t.currentHp || 0) <= 0) t = aliveMonsters(state)[0];
    return t || null;
}

// Battle Focus: the skill check rolled ONCE at battle start. Its linear score
// becomes a damage multiplier for the WHOLE battle — 1.5× at a perfect
// bullseye down to 0.5× at the rim — applied to every point of party damage
// (which is also what the score's damage conversion is built from).
function bankBattleFocus(state, ctxFocusMult, log) {
    if (ctxFocusMult !== undefined && ctxFocusMult !== null && Number(ctxFocusMult) > 0) {
        const focusMult = Math.max(0.5, Math.min(1.5, Number(ctxFocusMult)));
        if (Number(state._focusMult || 0) !== focusMult) {
            state._focusMult = focusMult;
            log.push({ actor: 'system', text: focusMult >= 1
                ? `🌟 Battle Focus ×${focusMult.toFixed(2)} — damage and score boosted for this battle!`
                : `💤 Battle Focus ×${focusMult.toFixed(2)} — damage and score reduced for this battle.` });
        }
        return focusMult;
    }
    return Math.max(0.5, Math.min(1.5, Number(state._focusMult || 1)));
}

// Advance the battle clock by `dtMs` up to `now`: burn DoT, freeze expiries,
// buff expiries and the 3s monster strike grid. Runs BEFORE actions on every
// heartbeat; also runs on action submits so idle time is always accounted.
function tickTrialCombat(state, now, dtMs) {
    const log = [];
    if (!state || state.kind !== 'trial' || !Array.isArray(state.party) || !Array.isArray(state.monsters)) return log;
    if (!Number.isFinite(now) || now <= 0) now = Date.now();
    // Battle-clock advance: the client's heartbeat delta, clamped so a laggy
    // tab can't fast-forward hours of strikes in one tick.
    const advance = Math.max(0, Math.min(10000, Math.floor(Number(dtMs) || 0)));
    // Clock guard: `now` may only move FORWARD relative to the last processed
    // tick. A janky tab racing a stale heartbeat could otherwise hand us a
    // regressed `now`, silently skipping strike windows (NPCs "stop attacking").
    if (typeof state._lastTickAt === 'number' && state._lastTickAt > now) {
        now = state._lastTickAt;
    }
    if (Number(state._battleClock || 0) > 0) state._battleClock += advance;
    else state._battleClock = now;

    const focusMult = bankBattleFocus(state, null, log);
    const kit = trialCombatKit(state, now, log, focusMult);

    // Per-monster tick stamps (fresh + migrated sessions).
    for (const m of state.monsters) {
        if (typeof m.strikeTickAt !== 'number') m.strikeTickAt = now + TRIAL_STRIKE_MS;
        if (typeof m.burnTickAt !== 'number') m.burnTickAt = now + TRIAL_STRIKE_MS;
        if (typeof m.burnTicksLeft !== 'number') m.burnTicksLeft = Math.max(0, Number(m.burnTurns || 0));
    }

    // Burn DoT ticks on the strike grid (can kill before a strike lands).
    for (const m of state.monsters) {
        if (Number(m.currentHp || 0) <= 0) continue;
        let guard = 0;
        while (now >= Number(m.burnTickAt || Infinity) && guard++ < 5) {
            m.burnTickAt = Number(m.burnTickAt) + TRIAL_STRIKE_MS;
            if (Number(m.burnTicksLeft || 0) > 0) {
                m.burnTicksLeft = Math.max(0, Number(m.burnTicksLeft) - 1);
                // Burn is party-applied damage — it scales with Battle Focus too.
                const d = kit.dealFlat(m, 80);
                log.push({ actor: 'system', text: `🔥 ${m.name} burns for ${d} damage.` });
            }
        }
    }

    // Freeze expiry (Deep Freeze 6s ≈ two missed strike windows, Blizzard 3s).
    for (const m of state.monsters) {
        if (Number(m.freezeUntil || 0) > 0 && now >= Number(m.freezeUntil)) {
            m.freezeUntil = 0;
            if (Number(m.currentHp || 0) > 0) log.push({ actor: 'system', text: `🧊 ${m.name} thawed out!` });
        }
    }

    // Buff expiries — guards, personal damage buffs, party buff.
    for (const c of state.party) {
        if (Number(c.dmgBuffUntil || 0) > 0 && now >= Number(c.dmgBuffUntil)) { c.dmgBuffUntil = 0; c.dmgBuff = 0; }
        if (Number(c.guardUntil || 0) > 0 && now >= Number(c.guardUntil)) c.guardUntil = 0;
    }
    if (Number(state.partyBuffUntil || 0) > 0 && now >= Number(state.partyBuffUntil)) {
        state.partyBuffUntil = 0;
        state.partyBuff = 0;
    }

    // Monster strikes: every 3s each alive monster hits a random alive champion.
    for (const m of state.monsters) {
        if (Number(m.currentHp || 0) <= 0) continue;
        let windows = 0;
        while (now >= Number(m.strikeTickAt || Infinity) && windows++ < 5) {
            m.strikeTickAt = Number(m.strikeTickAt) + TRIAL_STRIKE_MS;
            if (Number(m.freezeUntil || 0) > now) {
                // The window passes while frozen — but don't spam the log.
                if (!m._frozenLogAt || now - m._frozenLogAt > 5000) {
                    log.push({ actor: 'monster', text: `🧊 ${m.name} is frozen and cannot strike!` });
                    m._frozenLogAt = now;
                }
                continue;
            }
            const candidates = aliveChampions(state);
            if (candidates.length === 0) break;
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            const raw = Math.max(1, Math.floor(Number(m.atk || 1) - target.def * 0.5 + roll(-2, 2)));
            let dmg = raw;
            if (Number(target.guardUntil || 0) > now) dmg = Math.max(1, Math.floor(dmg * 0.5));
            if (Number(target.shield || 0) > 0) {
                const absorb = Math.min(target.shield, dmg);
                target.shield = Math.max(0, Number(target.shield) - absorb);
                dmg = Math.max(0, dmg - absorb);
            }
            target.hp = Math.max(0, target.hp - dmg);
            state._eventDmgTaken = Math.max(0, Number(state._eventDmgTaken || 0)) + dmg;
            log.push({ actor: 'monster', text: `💥 ${m.name} strikes ${target.name} for ${dmg} damage!` });
            if (target.hp <= 0 && target.alive) {
                target.alive = false;
                log.push({ actor: 'monster', text: `☠️ ${target.name} is down!` });
            }
        }
    }
    for (const c of state.party) {
        if (c.hp <= 0 && c.alive) c.alive = false;
    }
    return log;
}

// Execute the ACTIVE champion's ability in real time. Cooldowns are wall-clock
// stamps; energy only spends on ultimates (the whole bar); normal attacks AND
// bursts are the generators that feed the ultimate.
function trialUseAbility(state, characterIndex, abilityId, now, targetMonsterIndex) {
    const log = [];
    if (!state || state.kind !== 'trial' || !Array.isArray(state.party)) return { ok: false, log, killed: [] };
    if (!Number.isFinite(now) || now <= 0) now = Date.now();
    const focusMult = bankBattleFocus(state, null, log);
    const kit = trialCombatKit(state, now, log, focusMult);

    const champ = state.party[Number(characterIndex)];
    if (!champ) { log.push({ actor: 'system', text: 'Invalid champion.' }); return { ok: false, log, killed: [] }; }
    if (!champ.alive) { log.push({ actor: 'system', text: `${champ.name} is down and cannot act.` }); return { ok: false, log, killed: [] }; }
const ability = (champ.abilities || []).find(a => a.id === abilityId);
    if (!ability) { log.push({ actor: 'system', text: 'Unknown ability.' }); return { ok: false, log, killed: [] }; }
    // Resolve the action's target: the client-picked monster, falling back to the
    // first alive one. Heal/guard-style abilities pass it through and ignore it.
    const targetMonster = pickTargetMonster(state, targetMonsterIndex);
    // Cooldown is reported BEFORE energy so the rejection reason matches what
    // the button shows (a recharging burst says "recharging", not "no energy").
    const cdLeftMs = Math.max(0, Number((champ.cdUntil || {})[ability.id] || 0) - now);
    if (cdLeftMs > 0) {
        log.push({ actor: 'system', text: `${champ.name}'s ${ability.name} is recharging (${Math.ceil(cdLeftMs / 1000)}s left).` });
        return { ok: false, log, killed: [] };
    }
    const energy = Number(champ.energy || 0);
    const cost = Number(ability.cost || 0);
    if (energy < cost) { log.push({ actor: 'system', text: `Not enough energy (needs ${cost}).` }); return { ok: false, log, killed: [] }; }

    champ.energy = Math.max(0, energy - cost);
    champ.cdUntil = champ.cdUntil || {};
    champ.cdUntil[ability.id] = now + Math.max(1000, Number(ability.cooldownMs || 5000));
    // Normal attacks AND bursts are both generators — each feeds the ultimate's
    // bar (energy is never spent by bursts). Ultimates drain the whole bar.
    if (ability.type === 'attack' || ability.type === 'burst') {
        champ.energy = Math.min(Number(champ.maxEnergy || 120), Number(champ.energy || 0) + Number(champ.energyGain || 0));
    }
    const popFreeze = (t) => {
        if (Number(t.freezeUntil || 0) > 0) { const was = Number(t.freezeUntil) > now; t.freezeUntil = 0; return was; }
        return false;
    };
    const popBurn = (t) => {
        if (Number(t.burnTicksLeft || 0) > 0) { t.burnTicksLeft = 0; return true; }
        return false;
    };

    // Combo points are bonus score for chaining elemental effects (fire on a
    // frozen foe, frost on a frozen/burning foe, burn DoT).
    let combos = 0;
    const comboPts = (n, label, target) => {
        combos += n;
        state.comboPoints = Math.max(0, Number(state.comboPoints || 0)) + n;
        log.push({ actor: 'combo', text: `🔀 ${label} +${n} pts${target ? ` (${target.name})` : ''}!` });
    };

    const healChamp = (c, pct, targetMonster) => {
        const amt = Math.max(1, Math.round(c.maxHp * pct));
        if (!c.alive) {
            c.hp = amt;
            c.alive = true;
            log.push({ actor: 'player', text: `✨ ${c.name} revived with ${amt} HP!` });
        } else {
            c.hp = Math.min(c.maxHp, c.hp + amt);
            log.push({ actor: 'player', text: `✨ ${c.name} restored to ${c.hp} HP.` });
        }
        // Every champion contributes damage: heals CHANNEL 25% of the restored
        // amount into the targeted monster as radiant damage (revives included).
        if (targetMonster && Number(targetMonster.currentHp || 0) > 0) {
            const d = kit.dealFlat(targetMonster, Math.floor(amt * 0.25));
            log.push({ actor: 'player', text: `🌟 Radiant channel → ${targetMonster.name} for ${d} damage!` });
        }
    };

    switch (ability.id) {
        case 'fireball': {
            if (targetMonster) {
                const wasFrozen = popFreeze(targetMonster);
                const d = kit.hit(champ, targetMonster, wasFrozen ? 1.6 * 1.25 : 1.6);
                burnMonster(targetMonster, now, 2);
                log.push({ actor: 'player', text: `🔥 ${champ.name} Fireball → ${targetMonster.name} for ${d} damage!` });
                if (wasFrozen) comboPts(150, 'Vaporize!', targetMonster);
            }
            break;
        }
        case 'inferno': {
            if (targetMonster) {
                const wasFrozen = popFreeze(targetMonster);
                const d = kit.hit(champ, targetMonster, 1.9 * (wasFrozen ? 1.25 : 1));
                burnMonster(targetMonster, now, 2);
                log.push({ actor: 'player', text: `🌋 ${champ.name} Inferno → ${targetMonster.name} for ${d} damage${wasFrozen ? '!' : ' & BURN!'}` });
                if (wasFrozen) comboPts(150, 'Vaporize!', targetMonster);
            }
            break;
        }
        case 'arcbolt': {
            if (targetMonster) {
                const wasFrozen = popFreeze(targetMonster);
                const wasBurning = !wasFrozen && popBurn(targetMonster);
                const mult = 1.1 * (wasFrozen ? 1.5 : wasBurning ? 1.25 : 1);
                const d = kit.hit(champ, targetMonster, mult);
                log.push({ actor: 'player', text: `🔥 ${champ.name} Arc Bolt → ${targetMonster.name} for ${d} damage!` });
                if (wasFrozen) comboPts(100, 'Shatter!', targetMonster);
                else if (wasBurning) comboPts(100, 'Thermal Shock!', targetMonster);
            }
            break;
        }
        case 'froststrike': {
            if (targetMonster) {
                const wasFrozen = popFreeze(targetMonster);
                const wasBurning = !wasFrozen && popBurn(targetMonster);
                const mult = 1.1 * (wasFrozen ? 1.5 : wasBurning ? 1.25 : 1);
                const d = kit.hit(champ, targetMonster, mult);
                log.push({ actor: 'player', text: `❄️ ${champ.name} Frost Strike → ${targetMonster.name} for ${d} damage!` });
                if (wasFrozen) comboPts(100, 'Shatter!', targetMonster);
                else if (wasBurning) comboPts(100, 'Thermal Shock!', targetMonster);
            }
            break;
        }
        case 'smite': {
            if (targetMonster) {
                const wasFrozen = popFreeze(targetMonster);
                const wasBurning = !wasFrozen && popBurn(targetMonster);
                const mult = 1.15 * (wasFrozen ? 1.5 : wasBurning ? 1.25 : 1);
                const d = kit.hit(champ, targetMonster, mult);
                log.push({ actor: 'player', text: `✨ ${champ.name} Smite → ${targetMonster.name} for ${d} damage!` });
                if (wasFrozen) comboPts(100, 'Shatter!', targetMonster);
                else if (wasBurning) comboPts(100, 'Thermal Shock!', targetMonster);
            }
            break;
        }
        case 'deepfreeze': {
            if (targetMonster) {
                const wasFrozen = popFreeze(targetMonster);
                const wasBurning = !wasFrozen && popBurn(targetMonster);
                const mult = wasFrozen ? 0.55 * 1.5 : wasBurning ? 0.55 * 1.25 : 0.55;
                const d = kit.hit(champ, targetMonster, mult);
                if (!wasFrozen && !wasBurning) freezeMonster(targetMonster, now, 6000);
                log.push({ actor: 'player', text: `🧊 ${champ.name} Deep Freeze → ${targetMonster.name} for ${d} damage${wasFrozen || wasBurning ? '!' : ' & FREEZE (6s)!'}` });
                if (wasFrozen) comboPts(100, 'Shatter!', targetMonster);
                else if (wasBurning) comboPts(100, 'Thermal Shock!', targetMonster);
            }
            break;
        }
        case 'blizzard': {
            if (targetMonster) {
                const wasFrozen = popFreeze(targetMonster);
                const wasBurning = !wasFrozen && popBurn(targetMonster);
                const mult = wasFrozen ? 1.5 * 1.5 : wasBurning ? 1.5 * 1.25 : 1.5;
                const d = kit.hit(champ, targetMonster, mult);
                let frozeNow = false;
                if (!wasFrozen && !wasBurning && Math.random() < 0.5) { freezeMonster(targetMonster, now, 3000); frozeNow = true; }
                log.push({ actor: 'player', text: `🌨️ ${champ.name} Blizzard → ${targetMonster.name} for ${d} damage${frozeNow ? ' & FREEZE!' : '!'}` });
                if (wasFrozen) comboPts(100, 'Shatter!', targetMonster);
                else if (wasBurning) comboPts(100, 'Thermal Shock!', targetMonster);
            }
            break;
        }
        case 'shieldbash': {
            if (targetMonster) {
                const d = kit.hit(champ, targetMonster, 1.15);
                champ.shield = Math.max(Number(champ.shield || 0), 120);
                log.push({ actor: 'player', text: `🛡️ ${champ.name} Shield Bash → ${targetMonster.name} for ${d} damage (+120 shield)!` });
            }
            break;
        }
        case 'guard': {
            champ.guardUntil = now + 9000;
            log.push({ actor: 'player', text: `⛨ ${champ.name} guards — 50% less damage for 9s.` });
            break;
        }
        case 'warcry': {
            state.partyBuff = 0.35;
            state.partyBuffUntil = now + 9000;
            log.push({ actor: 'player', text: `📯 ${champ.name} roars — party +35% damage for 9s!` });
            break;
        }
        case 'mend': {
            const target = lowestHpAlly(state);
            if (target) healChamp(target, 0.30, targetMonster);
            break;
        }
        case 'renewal': {
            for (const c of state.party) healChamp(c, 0.22, targetMonster);
            break;
        }
        default:
            log.push({ actor: 'system', text: 'Ability not implemented.' });
            break;
    }

    return { ok: true, log, killed: kit.killed, comboPoints: combos };
}

module.exports = {
    TRIAL_CHARACTERS,
    TRIAL_STRIKE_MS,
    buildTrialParty,
    migrateTrialParty,
    tickTrialCombat,
    trialUseAbility,
};
