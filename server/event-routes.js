const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('./middleware');
const { getDb, dbGet, dbAll } = require('./routes');
const { generateEventFloor, getEventFloor, buildEventRoomMonsters, buildEventBoss, EVENT_ROOM_COUNT } = require('./event-engine');
const { buildTrialParty, migrateTrialParty, tickTrialCombat, trialUseAbility } = require('./trial-engine');

function dbRun(db, sql, args = []) { return db.execute({ sql, args }); }

async function getActiveCharacterId(db, userId) {
    const user = await dbGet(db, 'SELECT active_character_id FROM users WHERE id = ?', [userId]);
    let activeCharacterId = user?.active_character_id || null;
    if (activeCharacterId) {
        const existing = await dbGet(db, 'SELECT id FROM characters WHERE id = ? AND user_id = ?', [activeCharacterId, userId]);
        if (existing) return activeCharacterId;
    }
    const fallback = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ? ORDER BY id ASC LIMIT 1', [userId]);
    if (!fallback) return null;
    return fallback.id;
}

// Enter the Trial of the Arcane. The floor is DETERMINISTIC (fixed seed) so every
// player crawls the identical 10-room dungeon. Combat itself is fully
// server-authoritative via /game/dungeon/combat/start|act with kind='event'.
async function getEventEndsAt(db) {
    const now = Math.floor(Date.now() / 1000);
    const banner = await dbGet(
        db,
        "SELECT end_at FROM banner_events WHERE event_key = 'trial_arcane' AND start_at <= ? AND end_at > ? LIMIT 1",
        [now, now]
    );
    return banner ? (Number(banner.end_at) || null) : null;
}

router.post('/enter', auth, async (req, res) => {
    try {
        const db = await getDb();
        const activeCharId = await getActiveCharacterId(db, req.user.userId);
        if (!activeCharId) return res.status(404).json({ error: 'Character not found' });
        const char = await dbGet(db, "SELECT * FROM characters WHERE id = ? AND user_id = ?", [activeCharId, req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        if (Number(char.dungeon_highest_floor || 0) < 5) {
            return res.status(403).json({ error: 'Reach dungeon floor 5 to unlock the Trial.', eventEndsAt: await getEventEndsAt(db) });
        }

        // No run limit — players can attempt the Trial as many times as they want.
        const attempts = await dbGet(db, "SELECT COUNT(*) as count FROM event_attempts WHERE character_id = ?", [char.id]);
        const used = Number(attempts?.count || 0);

        const floor = generateEventFloor();
        const now = Date.now();
        await dbRun(
            db,
            "REPLACE INTO event_runs (character_id, room_index, score, total_dmg, kills, bosses, start_time) VALUES (?, 1, 0, 0, 0, 0, ?)",
            [char.id, now]
        );

        const run = await dbGet(db, "SELECT room_index, score, kills, bosses, total_dmg, start_time FROM event_runs WHERE character_id = ?", [char.id]);
        res.json({
            success: true,
            isActive: true,
            floor,
            run,
            attemptsUsed: used,
            attemptsLimit: null,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Begin the trial — starts the run timer (score bonus is measured from here, not from entering the event).
router.post('/start', auth, async (req, res) => {
    try {
        const db = await getDb();
        const activeCharId = await getActiveCharacterId(db, req.user.userId);
        if (!activeCharId) return res.status(404).json({ error: 'Character not found' });
        const char = await dbGet(db, "SELECT * FROM characters WHERE id = ? AND user_id = ?", [activeCharId, req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        const run = await dbGet(db, "SELECT room_index FROM event_runs WHERE character_id = ?", [char.id]);
        if (!run) return res.status(400).json({ error: 'No active event run. Enter the event first.' });
        const now = Date.now();
        await dbRun(db, "UPDATE event_runs SET start_time = ? WHERE character_id = ?", [now, char.id]);
        res.json({ success: true, startTime: now });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Trial combat — fixed 4-champion party, geared to beat the tuned monster scaling. ──
// The client uses these endpoints instead of /game/dungeon/combat/start|act in event mode.
// Sessions are stored in dungeon_combat_sessions with combat_type='trial'.

router.post('/combat/start', auth, async (req, res) => {
    try {
        const db = await getDb();
        // Resolve the ACTIVE character like /enter does — a plain `WHERE user_id = ?`
        // lookup returns an arbitrary row when a user owns several characters, which
        // made live event scoring land on the wrong character's run (or none).
        const activeCharId = await getActiveCharacterId(db, req.user.userId);
        if (!activeCharId) return res.status(404).json({ error: 'Character not found' });
        const char = await dbGet(db, 'SELECT id, user_id FROM characters WHERE id = ? AND user_id = ?', [activeCharId, req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });

        const run = await dbGet(db, 'SELECT room_index FROM event_runs WHERE character_id = ?', [char.id]);
        if (!run) return res.status(400).json({ error: 'Start the event first from the banner.' });

        const roomIndex = Math.max(0, Number(req.body?.roomIndex ?? 0));
        if (roomIndex !== Math.max(1, Number(run.room_index || 1))) {
            return res.status(400).json({ error: 'Clear the event rooms in order.' });
        }

        // Repopulate monsters fresh from the deterministic floor (never reuse mutated HP).
        const eventRooms = getEventFloor();
        const eventRoom = Array.isArray(eventRooms) ? eventRooms[roomIndex] : null;
        if (!eventRoom) return res.status(400).json({ error: 'No enemies in this room.' });
        const monsters = (Array.isArray(eventRoom.monsters) && eventRoom.monsters.length)
            ? eventRoom.monsters.map(m => ({ ...m, lastKilled: null, currentHp: m.currentHp ?? m.hp ?? m.maxHp, maxHp: m.maxHp ?? m.hp ?? m.currentHp }))
            : [];

        // End any previous trial session for this char+room so a stale client can't resume it.
        await dbRun(
            db,
            "UPDATE dungeon_combat_sessions SET status = 'ended', updated_at = ? WHERE char_id = ? AND combat_type = 'trial' AND status = 'active'",
            [Math.floor(Date.now() / 1000), char.id]
        );

        const seed = crypto.randomBytes(4).readUInt32LE(0) >>> 0;
        const now = Math.floor(Date.now() / 1000);
        const combatId = `trl_${char.id}_${roomIndex}_${seed}_${now}`;

        // Run-level kill/boss counters continue across rooms: seed the fresh
        // session's counters from the totals already banked on the event run.
        const prevRun = await dbGet(db, 'SELECT kills, bosses FROM event_runs WHERE character_id = ?', [char.id]);
        const state = {
            kind: 'trial',
            roomIndex,
            round: 1,
            party: buildTrialParty(),
            monsters,
            currentMonsterIndex: 0,
            escapeReady: false,
            _eventDmg: 0,
            _eventDmgTaken: 0,
            _runKills: Math.max(0, Math.floor(Number(prevRun?.kills || 0))),
            _runBosses: Math.max(0, Math.floor(Number(prevRun?.bosses || 0))),
            partyBuff: 0,
            partyBuffTurns: 0,
        };

        await dbRun(
            db,
            `INSERT INTO dungeon_combat_sessions
             (id, user_id, char_id, floor_number, room_index, combat_type, status, seed, rng_state, turn_nonce, state_json, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?, ?, ?)`,
            [combatId, char.user_id, char.id, 1, roomIndex, 'trial', 'active', seed, seed, 0, JSON.stringify(state), now, now]
        );

        res.json({
            success: true,
            combatId,
            turnNonce: 0,
            kind: 'trial',
            party: state.party,
            monsters: state.monsters,
            currentMonsterIndex: 0,
            escapeReady: false,
            log: [{ actor: 'monster', text: 'The Trial begins!' }],
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/combat/act', auth, async (req, res) => {
    try {
        const db = await getDb();
        const combatId = String(req.body?.combatId || '');
        const clientNonce = Number(req.body?.turnNonce ?? -1);
        if (!combatId) return res.status(400).json({ error: 'Missing combatId.' });

        // Own the session by USER: combat belongs to whichever character started it
        // (see /combat/start, which resolves the ACTIVE character like /enter does).
        // Scoring follows the session's char_id, so kills/combos/room points always
        // land on that character's event run — never an arbitrary user row.
        const row = await dbGet(
            db,
            `SELECT id, turn_nonce, state_json, char_id
             FROM dungeon_combat_sessions
             WHERE id = ? AND user_id = ? AND combat_type = 'trial' AND status = 'active'
                 LIMIT 1`,
            [combatId, req.user.userId]
        );
        if (!row?.id) return res.status(404).json({ error: 'Combat session not found.' });
        const char = { id: row.char_id };

        const serverNonce = Number(row.turn_nonce || 0);
        if (clientNonce !== serverNonce) {
            return res.status(409).json({ error: 'Out-of-sync action (double-submit or stale state).', turnNonce: serverNonce });
        }

        const state = JSON.parse(row.state_json || '{}');
        if (!Array.isArray(state.party) || state.party.length === 0) {
            return res.status(400).json({ error: 'Corrupt trial session.' });
        }

        // Sessions created before the attack-kit rework (old six-ability kit, 60
        // starting energy, passive regen) are normalized in place to the current
        // three-button kit: energy banked from 0, no burst cooldown. The migrated
        // state is persisted so the response always echoes a consistent kit.
        const migratedParty = migrateTrialParty(state.party);
        if (JSON.stringify(migratedParty) !== JSON.stringify(state.party)) {
            state.party = migratedParty;
            await dbRun(
                db,
                'UPDATE dungeon_combat_sessions SET state_json = ?, updated_at = ? WHERE id = ?',
                [JSON.stringify(state), Math.floor(Date.now() / 1000), combatId]
            );
        }

        // In-flight sessions may predate run-level kill counters — seed them from
        // the totals already banked on the event run so accounting stays continuous.
        if (typeof state._runKills !== 'number' || typeof state._runBosses !== 'number') {
            const runRow = await dbGet(db, 'SELECT kills, bosses FROM event_runs WHERE character_id = ?', [char.id]);
            state._runKills = Math.max(0, Math.floor(Number(runRow?.kills || 0)));
            state._runBosses = Math.max(0, Math.floor(Number(runRow?.bosses || 0)));
        }
        // In-flight sessions may also predate the Battle Focus / Final Blow fields —
        // default them so a mid-update battle can still close out correctly.
        if (typeof state._roomGains !== 'number') state._roomGains = 0;
        if (typeof state._focusMult !== 'number') state._focusMult = 1;

        // REAL-TIME combat: the client heartbeats this endpoint (~1s) and sends
        // `now` (its Date.now()) + `dtMs` (time since its previous tick). The
        // server advances the battle by that delta — burn DoT, freeze expiry,
        // buff expiry and the 3s monster-strike grid — then executes at most
        // ONE ability for the ACTIVE champion.
        // `focusMult` — the skill check rolled ONCE at battle start (linear 1.0 at
        // dead-center → 0 at the rim). The server clamps it to 0.5–1.5× and applies
        // it to ALL party damage for the whole battle; the same factor scales the
        // live kill/boss/combo score, so a great roll boosts points too.
        // `skillCheckMult` is now ONLY the closing "Final Blow" check multiplier.
        // `closing` marks that final check's submit.
        const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
        const closing = !!req.body?.closing;
        const now = (() => {
            const v = Number(req.body?.now);
            return (Number.isFinite(v) && v > 1e12) ? Math.floor(v) : Date.now();
        })();
        const dtMs = Math.max(0, Math.min(10000, Math.floor(Number(req.body?.dtMs) || 0)));
        const parseMult = (v) => (typeof v === 'number' && Number.isFinite(v) ? v
            : (typeof v === 'string' && v.trim() !== '' ? parseFloat(v) : undefined));
        const rawScm = parseMult(req.body?.skillCheckMult);
        const skillCheckMult = closing ? rawScm : undefined; // per-turn checks no longer exist
        const rawFm = parseMult(req.body?.focusMult);
        const focusMult = rawFm !== undefined ? Math.max(0.5, Math.min(1.5, rawFm)) : undefined;
        // Effective battle-focus factor for scoring this call: the client's fresh roll
        // on the first action, otherwise the factor already banked on the session.
        const focusScoreMult = focusMult !== undefined
            ? focusMult
            : Math.max(0.5, Math.min(1.5, Number(state._focusMult || 1)));

        // Server-authoritative stamping: the first tick records the battle's real
        // start time; afterwards only the DELTA advances the clock, so a client
        // can never teleport cooldowns or strike windows into the future.
        if (typeof state._lastTickAt !== 'number' || state._lastTickAt <= 0) {
            state._lastTickAt = now - dtMs;
            if (typeof state._battleStart !== 'number' || state._battleStart <= 0) state._battleStart = now;
        }
        // Live scoring: credit kills, boss kills and elemental combos to the DB score
        // the moment they happen so the HUD score ticks up in real time. Snapshot HP
        // BEFORE the tick+action so only NEW deaths this call are counted (trial
        // monsters stay in the array once dead; kill value is banked once).
        const hpSnapshot = Array.isArray(state.monsters)
            ? state.monsters.map(m => Number(m.currentHp || 0) > 0)
            : [];
        // Same idea for damage taken: no longer skill-check-driven, but still deducted
        // from score live (1 point per 100 HP lost).
        const prevTaken = Math.max(0, Math.floor(Number(state._eventDmgTaken || 0)));
        // Combo points accumulate on the session across the whole battle — snapshot
        // before the tick+action so only the NEW combo points this call are paid.
        const prevCombo = Math.max(0, Math.floor(Number(state.comboPoints || 0)));

        // Ticking: burn DoT, freeze/buff expiry, 3s monster strikes. Also runs
        // on pure heartbeats (no action) — the clock never stops while the tab
        // is open, and it stops the moment it closes (server-clock truth).
        let log = [];
        if (dtMs > 0 || !state._battleClock) log.push(...tickTrialCombat(state, now, dtMs));
        state._lastTickAt = now;

        // Bank the Battle Focus roll on the first action (once per battle).
        if (focusMult !== undefined && Math.max(0.5, Math.min(1.5, focusMult)) !== Math.max(0.5, Math.min(1.5, Number(state._focusMult || 1)))) {
            state._focusMult = Math.max(0.5, Math.min(1.5, focusMult));
            log.push({ actor: 'system', text: focusMult >= 1
                ? `🌟 Battle Focus ×${focusMult.toFixed(2)} — damage and score boosted for this battle!`
                : `💤 Battle Focus ×${focusMult.toFixed(2)} — damage and score reduced for this battle.` });
        }

        // The action (if any) targets the ACTIVE champion only — the client is
        // the source of which champion is selected; the server validates the
        // ability, its energy cost and its wall-clock cooldown.
        const act = actions.find(a => a && typeof a.characterIndex === 'number') || null;
        if (act) {
            const r = trialUseAbility(state, act.characterIndex, String(act.abilityId || ''), now, act.currentMonsterIndex);
            log.push(...r.log);
        }

        // Real-time: after the tick + action, evaluate the outcome directly.
        const nextState = state;
        let ended = false;
        let outcome = null;
        if (nextState.party.every(c => !c.alive)) {
            ended = true;
            outcome = 'player_dead';
        } else if (nextState.monsters.every(m => Number(m.currentHp || 0) <= 0)) {
            ended = true;
            outcome = nextState.monsters.some(m => m.isBoss) ? 'event_complete' : 'room_cleared';
        }
        const comboPoints = Math.max(0, Math.floor(Number(state.comboPoints || 0))) - prevCombo;

        const killDelta = Array.isArray(nextState.monsters)
            ? nextState.monsters.reduce((n, m, i) => n + (hpSnapshot[i] && Number(m.currentHp || 0) <= 0 ? 1 : 0), 0)            : 0;
        const bossDelta = Array.isArray(nextState.monsters)
            ? nextState.monsters.reduce((n, m, i) => n + (hpSnapshot[i] && Number(m.currentHp || 0) <= 0 && (m.isBoss || m.isMiniBoss) ? 1 : 0), 0)
            : 0;
        const comboNow = Math.max(0, Math.floor(Number(comboPoints || 0)));
        // Live score gains are scaled by the Battle Focus roll — a precise start-of-
        // battle check boosts every kill, boss kill and combo the whole fight through.
        let gainedDelta = Math.round((killDelta * 100 + bossDelta * 500 + comboNow) * focusScoreMult);
        // Track what this battle has earned in total (debug + HUD reference).
        if (gainedDelta > 0) {
            state._roomGains = Math.max(0, Math.floor(Number(state._roomGains || 0))) + gainedDelta;
            await dbRun(db, 'UPDATE event_runs SET score = score + ? WHERE character_id = ?', [gainedDelta, char.id]);
        }

        // Run-level kill/boss accounting lives on the persistent session state and
        // is banked on EVERY action (absolute values), so totals can never miss
        // deaths that happened in non-clearing turns — the old delta-on-clear
        // approach silently dropped them ("cleared the whole thing, 9 kills??").
        if (Number(nextState._runKills || 0) > 0 || Number(nextState._runBosses || 0) > 0) {
            await dbRun(
                db,
                'UPDATE event_runs SET kills = ?, bosses = ? WHERE character_id = ?',
                [Math.max(0, Math.floor(Number(nextState._runKills || 0))), Math.max(0, Math.floor(Number(nextState._runBosses || 0))), char.id]
            );
        }

        let eventStats = null;
        let pendingFinalBlow = false;
        if (ended && (outcome === 'room_cleared' || outcome === 'event_complete')) {
            const isEventBossRoom = nextState.monsters.some(m => m.isBoss);
            if (!closing) {
                // First arrival at a cleared room: do NOT finalize. The battle stays
                // open for the Final Blow skill check (the battle's second and LAST
                // check), whose multiplier scales everything this battle earned —
                // so the check can never be skipped by ending the turn.
                nextState._pendingFinalBlow = true;
                pendingFinalBlow = true;
                log.push({ actor: 'system', text: '⚔️ Final Blow! Center the strike to multiply this battle\'s points!' });
            } else {
                // Closing submit: the Final Blow multiplier (linear 1.0 center → 0 rim)
                // scales the battle's accumulated live gains (kills, bosses, combos —
                // already Battle-Focus-scaled): a perfect strike pays 100%, a rim hit
                // still pays 50%. This is the battle's point payout; the room then
                // advances (or the event completes on the Sovereign).
                const mult = typeof skillCheckMult === 'number' ? Math.max(0, Math.min(1, skillCheckMult)) : 1;
                const roomGains = Math.max(0, Math.floor(Number(nextState._roomGains || 0)));
                // Final total for this battle = live gains × (0.5 + 0.5 × accuracy).
                // The live credits already sit in the score, so only the DELTA is paid
                // here: a bullseye tops the battle up to 100% of the scaled total, a
                // rim hit claws part of it back — total contribution lands exactly on
                // roomPts either way (never double-counted).
                const roomPts = Math.round(roomGains * (0.5 + 0.5 * mult));
                const adjust = roomPts - roomGains;
                const eventDmg = Math.max(0, Math.floor(Number(nextState._eventDmg || 0)));
                const kills = nextState.monsters.length;
                const bossCount = nextState.monsters.filter(m => m.isBoss || m.isMiniBoss).length;
                nextState.comboPoints = 0;
                const nextRoom = isEventBossRoom ? EVENT_ROOM_COUNT : Math.max(1, Number(nextState.roomIndex || 0) + 1);
                // kills/bosses are already absolute in event_runs (banked on every action).
                await dbRun(
                    db,
                    `UPDATE event_runs
                     SET room_index = ?, score = MAX(0, score + ?), total_dmg = total_dmg + ?
                     WHERE character_id = ?`,
                    [nextRoom, adjust, eventDmg, char.id]
                );
                gainedDelta += adjust;
                nextState._pendingFinalBlow = false;
                nextState._roomGains = 0;
                const after = await dbGet(db, 'SELECT room_index, score, kills, bosses, total_dmg FROM event_runs WHERE character_id = ?', [char.id]);
                eventStats = { ...after, points: roomPts, roomKills: kills, roomBosses: bossCount, eventDmg, comboPoints: 0, skillMult: mult, eventComplete: isEventBossRoom };
                log.push({ actor: 'system', text: adjust >= 0
                    ? `🌟 Final Blow ×${(0.5 + 0.5 * mult).toFixed(2)} — +${adjust} bonus battle points!`
                    : `🌟 Final Blow ×${(0.5 + 0.5 * mult).toFixed(2)} — ${Math.abs(adjust)} battle points lost.` });
            }
        }

        // Damage taken costs points, live: every 100 HP the party actually loses (after
        // shields and the Defensive Focus guard) deducts 1 score point. Landing the skill
        // check closer to center halves retaliation → fewe points lost — the skill check
        // therefore shapes the score in real time.
        const takenNow = Math.max(0, Math.floor(Number(nextState._eventDmgTaken || 0) - prevTaken));
        const deductPts = Math.floor(takenNow / 100);
        if (deductPts > 0) {
            await dbRun(db, 'UPDATE event_runs SET score = MAX(0, score - ?) WHERE character_id = ?', [deductPts, char.id]);
        }

        const nextNonce = serverNonce + 1;
        const nowSec = Math.floor(Date.now() / 1000);
        // Keep the session alive through ANY room/event clear until the closing
        // "Final Blow" skill check lands (see `closing`) — it is the battle's point
        // payout and must never be skippable, including End-Turn clears.
        const pendingFinalBlowKeep = ended && (outcome === 'room_cleared' || outcome === 'event_complete') && !closing;
        await dbRun(
            db,
            `UPDATE dungeon_combat_sessions
             SET turn_nonce = ?, state_json = ?, updated_at = ?, status = ?
             WHERE id = ?`,
            [nextNonce, JSON.stringify(nextState), nowSec, (ended && !pendingFinalBlowKeep) ? 'ended' : 'active', combatId]
        );

        const scoreRow = await dbGet(db, 'SELECT score FROM event_runs WHERE character_id = ?', [char.id]);

        res.json({
            success: true,
            turnNonce: nextNonce,
            kind: 'trial',
            serverNow: now,
            round: nextState.round,
            party: nextState.party,
            monsters: nextState.monsters,
            currentMonsterIndex: nextState.currentMonsterIndex,
            escapeReady: !!nextState.escapeReady,
            ended,
            outcome,
            closing,
            pendingFinalBlow,
            battleFocus: focusScoreMult,
            comboPoints: comboNow,
            scoreDelta: Math.max(0, Math.floor(Number(gainedDelta || 0))),
            scoreDeducted: deductPts,
            dmgTaken: takenNow,
            currentScore: scoreRow ? Number(scoreRow.score || 0) : null,
            newKills: killDelta,
            newBosses: bossDelta,
            runKills: Math.max(0, Math.floor(Number(nextState._runKills || 0))),
            runBosses: Math.max(0, Math.floor(Number(nextState._runBosses || 0))),
            eventStats,
            log,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Finalize a run (win, death, or manual exit) — records the attempt + leaderboard score.
router.post('/finish', auth, async (req, res) => {
    try {
        const db = await getDb();
        const activeCharId = await getActiveCharacterId(db, req.user.userId);
        if (!activeCharId) return res.status(404).json({ error: 'Character not found' });
        const char = await dbGet(db, "SELECT * FROM characters WHERE id = ? AND user_id = ?", [activeCharId, req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });

        const run = await dbGet(db, "SELECT * FROM event_runs WHERE character_id = ?", [char.id]);
        if (!run) return res.status(400).json({ error: 'No active event run.' });

        const timeTaken = Math.max(0, (Date.now() - Number(run.start_time || Date.now())) / 60000);
        // Time bonus only applies to a FULL clear — losing or leaving gives no bonus.
        const cleared = Number(run.room_index || 0) >= EVENT_ROOM_COUNT;
        const bonus = cleared ? Math.max(0, Math.floor((10 - timeTaken) * 1000)) : 0;
        const finalScore = Math.max(0, Number(run.score || 0) + bonus);

        const prev = await dbGet(db, "SELECT COUNT(*) as count FROM event_attempts WHERE character_id = ?", [char.id]);
        const attemptNo = Number(prev?.count || 0) + 1;
        await dbRun(
            db,
            "INSERT INTO event_attempts (character_id, attempt_no, score, clear_time, cleared_at, cleared) VALUES (?, ?, ?, ?, ?, ?)",
            [char.id, attemptNo, finalScore, timeTaken, new Date().toISOString(), cleared ? 1 : 0]
        );

        const best = await dbGet(db, "SELECT best_score FROM event_leaderboard WHERE character_id = ?", [char.id]);
        if (!best || finalScore > Number(best.best_score || 0)) {
            await dbRun(
                db,
                "REPLACE INTO event_leaderboard (character_id, best_score, best_time) VALUES (?, ?, ?)",
                [char.id, finalScore, timeTaken]
            );
        }

        await dbRun(db, "DELETE FROM event_runs WHERE character_id = ?", [char.id]);

        const attempts = await dbGet(db, "SELECT COUNT(*) as count FROM event_attempts WHERE character_id = ?", [char.id]);
        res.json({
            success: true,
            score: finalScore,
            baseScore: Number(run.score || 0),
            timeBonus: Math.floor(bonus),
            timeTaken,
            cleared,
            attemptsUsed: Number(attempts?.count || 0),
            attemptsLimit: null,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/leaderboard', auth, async (req, res) => {
    const db = await getDb();
    const rows = await dbAll(
        db,
        "SELECT c.name AS char_name, l.best_score, l.best_time FROM event_leaderboard l JOIN characters c ON l.character_id = c.id ORDER BY l.best_score DESC LIMIT 10",
        []
    );
    res.json({ leaderboard: rows });
});

// Check if event is active via banner
router.get('/status', auth, async (req, res) => {
    const db = await getDb();
    const activeCharId = await getActiveCharacterId(db, req.user.userId);
    const char = activeCharId ? await dbGet(db, "SELECT * FROM characters WHERE id = ? AND user_id = ?", [activeCharId, req.user.userId]) : null;
    const attempts = char ? await dbGet(db, "SELECT COUNT(*) as count FROM event_attempts WHERE character_id = ?", [char.id]) : null;
    res.json({ isActive: true, attemptsUsed: Number(attempts?.count || 0), attemptsLimit: null, eventEndsAt: await getEventEndsAt(db) });
});

module.exports = router;