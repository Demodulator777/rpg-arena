const express = require('express');
const router = express.Router();
const auth = require('./middleware');
const { getDb } = require('./db');

const TOURNAMENT_COST = 500;
const MIN_PLAYERS = 8;
const ROUND_INTERVAL_MS = 60_000;
const DAILY_HOUR = 20;

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const ELEM_EMOJIS = { pyro:'🔥', water:'💧', wind:'🌀', electro:'⚡' };

function deathmatchBattle(p1, p2) {
  const aEquip = getEquipStats(p1.equipped || {});
  const dEquip = getEquipStats(p2.equipped || {});
  const log = [];
  let aHp = p1.hp_max, dHp = p2.hp_max;
  log.push(`⚔️ ${p1.name} vs ${p2.name}!`);
  log.push(`📊 ${p1.name}: STR ${p1.strength} | DEF ${p1.defense} | AGI ${p1.agility} | MAG ${p1.magic}`);
  log.push(`📊 ${p2.name}: STR ${p2.strength} | DEF ${p2.defense} | AGI ${p2.agility} | MAG ${p2.magic}`);
  log.push(`---`);
  let round = 0;
  while (aHp > 0 && dHp > 0) {
    round++;
    log.push(`🔔 Round ${round}`);
    const aFirst = calcInit(p1, aEquip) >= calcInit(p2, dEquip);
    const [first, fEquip, second, sEquip] = aFirst ? [p1, aEquip, p2, dEquip] : [p2, dEquip, p1, aEquip];
    let fHp = aFirst ? aHp : dHp;
    let sHp = aFirst ? dHp : aHp;
    const h1 = calcHit(first, fEquip, second, sEquip);
    sHp = Math.max(0, sHp - h1.totalDmg);
    let msg1 = `  ${first.name} → ${second.name}: ${h1.physDmg} phys`;
    if (h1.magicBurst) msg1 += ` + ${h1.burstDmg} MB`;
    if ((h1.elemDmg||0)>0) msg1 += ` + ${h1.elemDmg} ${ELEM_EMOJIS[h1.elemType]||''}`;
    if (h1.dodged) msg1 += ` (dodge)`;
    msg1 += ` = ${h1.totalDmg} | ${second.name} ${sHp}HP`;
    log.push(msg1);
    if (aFirst) { aHp = fHp; dHp = sHp; } else { dHp = fHp; aHp = sHp; }
    if (sHp <= 0) break;
    const h2 = calcHit(second, sEquip, first, fEquip);
    fHp = Math.max(0, fHp - h2.totalDmg);
    let msg2 = `  ${second.name} → ${first.name}: ${h2.physDmg} phys`;
    if (h2.magicBurst) msg2 += ` + ${h2.burstDmg} MB`;
    if ((h2.elemDmg||0)>0) msg2 += ` + ${h2.elemDmg} ${ELEM_EMOJIS[h2.elemType]||''}`;
    if (h2.dodged) msg2 += ` (dodge)`;
    msg2 += ` = ${h2.totalDmg} | ${first.name} ${fHp}HP`;
    log.push(msg2);
    if (aFirst) { aHp = fHp; dHp = sHp; } else { dHp = fHp; aHp = sHp; }
    if (fHp <= 0) break;
  }
  let winnerId = null, isDraw = 0;
  if (aHp <= 0 && dHp <= 0) { isDraw = 1; log.push(`💥 Double KO! Draw.`); }
  else if (dHp <= 0) { winnerId = p1.id; log.push(`🏆 ${p1.name} wins! (${aHp} HP left)`); }
  else if (aHp <= 0) { winnerId = p2.id; log.push(`🏆 ${p2.name} wins! (${dHp} HP left)`); }
  return { winnerId, isDraw, log, p1FinalHp: aHp, p2FinalHp: dHp };
}

function getEquipStats(equip) {
  if (!equip) return {};
  const stats = { dmg_min:0, dmg_max:0, def_bonus:0, agi_bonus:0, mag_bonus:0, str_bonus:0, elem_dmg:0, elem_dmg_type:null, elem_resist_pyro:0, elem_resist_water:0, elem_resist_wind:0, elem_resist_electro:0 };
  const slots = ['weapon','armor','boots','amulet','ring'];
  slots.forEach(slot => {
    const item = equip[slot]; if (!item||!item.stats) return;
    const s = item.stats;
    if (s.dmg_min) stats.dmg_min += s.dmg_min;
    if (s.dmg_max) stats.dmg_max += s.dmg_max;
    if (s.def_bonus) stats.def_bonus += s.def_bonus;
    if (s.agi_bonus) stats.agi_bonus += s.agi_bonus;
    if (s.mag_bonus) stats.mag_bonus += s.mag_bonus;
    if (s.str_bonus) stats.str_bonus += s.str_bonus;
    if (s.elem_dmg && s.elem_dmg > stats.elem_dmg) { stats.elem_dmg = s.elem_dmg; stats.elem_dmg_type = s.elem_dmg_type; }
    if (s.elem_resist_pyro) stats.elem_resist_pyro += s.elem_resist_pyro;
    if (s.elem_resist_water) stats.elem_resist_water += s.elem_resist_water;
    if (s.elem_resist_wind) stats.elem_resist_wind += s.elem_resist_wind;
    if (s.elem_resist_electro) stats.elem_resist_electro += s.elem_resist_electro;
  });
  return stats;
}

function getResist(defender, dEquip, elemType) {
  if (!elemType) return 0;
  const baseResist = defender[`elem_resist_${elemType}`] || 0;
  const equipResist = dEquip[`elem_resist_${elemType}`] || 0;
  return Math.min(80, baseResist + equipResist);
}

function calcHit(attacker, aEquip, defender, dEquip) {
  const totalStr = attacker.strength + (aEquip.str_bonus || 0);
  const totalDef = defender.defense + (dEquip.def_bonus || 0);
  const totalAgi = defender.agility + (dEquip.agi_bonus || 0);
  const totalMag = attacker.magic + (aEquip.mag_bonus || 0);
  const physBase = Math.floor(totalStr / 4);
  const weaponRoll = aEquip.dmg_max > 0 ? roll(aEquip.dmg_min, aEquip.dmg_max) : 0;
  const rawPhys = physBase + weaponRoll + roll(1, 6);
  const mitigation = totalDef * 0.35;
  const dodged = Math.random() < (totalAgi / 350);
  let physDmg = Math.max(1, Math.round(rawPhys - mitigation));
  if (dodged) physDmg = Math.floor(physDmg / 2);
  const magicBurst = Math.random() < (totalMag / 200);
  const burstDmg = magicBurst ? Math.floor(totalMag * 0.4) : 0;
  let elemDmg = 0, elemType = aEquip.elem_dmg_type;
  if (elemType && aEquip.elem_dmg > 0) {
    const rawElem = roll(Math.floor(aEquip.elem_dmg * 0.7), aEquip.elem_dmg);
    const elemMult = attacker.class === 'mage' ? 1.5 : 1.0;
    const resist = getResist(defender, dEquip, elemType);
    elemDmg = Math.max(0, Math.floor(rawElem * elemMult * (1 - resist / 100)));
  }
  return { physDmg, burstDmg, magicBurst: !!magicBurst, dodged, elemDmg, elemType, totalDmg: physDmg + burstDmg + elemDmg };
}

function calcInit(char, equip) {
  return (char.agility + (equip.agi_bonus || 0)) + roll(1, 20);
}

function calcHpMaxFromStats(p) {
  const base = 80 + (p.vitality || 10) * 8 + (p.level || 1) * 5;
  return base;
}

function scheduleDailyTournamentStart() {
  const now = Date.now();
  const next = new Date();
  next.setHours(DAILY_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const msUntil = next - now;
  setTimeout(async () => {
    try { await startTournament(); } catch (e) { console.error('Tournament start error:', e); }
    setInterval(async () => {
      try { await startTournament(); } catch (e) { console.error('Tournament start error:', e); }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
  console.log(`⏰ Next tournament scheduled at ${next.toLocaleString()}`);
}

async function startTournament() {
  const db = await getDb();
  const pending = await dbAll_t(db, 'SELECT * FROM tournaments WHERE status = ?', ['pending']);
  for (const t of pending) {
    await runTournament(db, t);
  }
}

async function runTournament(db, t, fast) {
  let participants = await dbAll_t(db, 'SELECT * FROM tournament_participants WHERE tournament_id = ?', [t.id]);
  const realCount = participants.filter(p => !p.is_npc).length;
  console.log(`🏟️ Tournament #${t.id}: ${participants.length} participants (${realCount} real)`);
  if (participants.length < MIN_PLAYERS) {
    const npcsNeeded = MIN_PLAYERS - participants.length;
    for (let i = 0; i < npcsNeeded; i++) {
      const npc = generateNpc(participants.length + i);
      await dbRun_t(db, `INSERT INTO tournament_participants (tournament_id, is_npc, npc_data, name, class, level, strength, defense, agility, magic, vitality, hp_max)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, JSON.stringify(npc), npc.name, npc.class, npc.level, npc.strength, npc.defense, npc.agility, npc.magic, npc.vitality, npc.hp_max]);
      participants.push({
        id: -Date.now() - i, tournament_id: t.id, char_id: null, is_npc: 1,
        npc_data: JSON.stringify(npc), name: npc.name, class: npc.class,
        level: npc.level, strength: npc.strength, defense: npc.defense,
        agility: npc.agility, magic: npc.magic, vitality: npc.vitality,
        hp_max: npc.hp_max, points: 0, wins: 0, losses: 0, draws: 0
      });
    }
    console.log(`   Added ${npcsNeeded} NPCs, total: ${participants.length}`);
  }
  await dbRun_t(db, 'UPDATE tournaments SET status = ?, started_at = datetime(\'now\'), participant_count = ? WHERE id = ?', ['active', participants.length, t.id]);
  const schedule = generateRoundRobin(participants.map(p => p.id));
  for (let r = 0; r < schedule.length; r++) {
    const round = schedule[r];
    if (!fast && r > 0) await new Promise(resolve => setTimeout(resolve, ROUND_INTERVAL_MS));
    for (const [p1Id, p2Id] of round) {
      await fightMatch(db, t.id, r, p1Id, p2Id, participants);
    }
    participants = await dbAll_t(db, 'SELECT * FROM tournament_participants WHERE tournament_id = ?', [t.id]);
  }
  await finalizeTournament(db, t.id);
}

function generateNpc(seed) {
  const classes = ['warrior', 'mage', 'rogue', 'paladin', 'ranger'];
  const names = [
    'Aldric', 'Borin', 'Cedra', 'Dorn', 'Elara', 'Fenric', 'Greta', 'Haldor',
    'Irina', 'Jorik', 'Kaelen', 'Lira', 'Mordecai', 'Nyx', 'Orin', 'Petra',
    'Quinn', 'Riven', 'Sera', 'Thorne', 'Uma', 'Valen', 'Wren', 'Xander',
    'Yara', 'Zeph', 'Astra', 'Beckett', 'Cassian', 'Dante'
  ];
  const cls = classes[seed % classes.length];
  const name = names[seed % names.length];
  const level = 30 + (seed % 30);
  const statTotal = 60 + level * 4 + roll(1, 40);
  const base = Math.floor(statTotal / 4);
  const hpMax = 80 + 10 * 8 + level * 5 + roll(1, 50);
  switch (cls) {
    case 'warrior': return { name: `${name} the Iron`, class: cls, level, strength: base + 15, defense: base + 10, agility: base - 5, magic: base - 10, vitality: 14, hp_max: hpMax + 40 };
    case 'mage': return { name: `${name} the Arcane`, class: cls, level, strength: base - 10, defense: base - 5, agility: base, magic: base + 15, vitality: 8, hp_max: hpMax - 20 };
    case 'rogue': return { name: `${name} the Shadow`, class: cls, level, strength: base + 5, defense: base - 5, agility: base + 15, magic: base, vitality: 10, hp_max: hpMax };
    case 'paladin': return { name: `${name} the Just`, class: cls, level, strength: base + 10, defense: base + 12, agility: base - 3, magic: base + 5, vitality: 13, hp_max: hpMax + 20 };
    case 'ranger': return { name: `${name} the Hunt`, class: cls, level, strength: base + 8, defense: base + 5, agility: base + 10, magic: base, vitality: 11, hp_max: hpMax + 10 };
    default: return { name, class: cls, level, strength: base, defense: base, agility: base, magic: base, vitality: 10, hp_max: hpMax };
  }
}

async function buildFighter(db, participant, participants) {
  if (participant.is_npc) {
    return {
      id: `npc_${participant.id}`,
      name: participant.name,
      class: participant.class,
      level: participant.level,
      strength: participant.strength,
      defense: participant.defense,
      agility: participant.agility,
      magic: participant.magic,
      vitality: participant.vitality,
      hp_max: participant.hp_max,
      equipped: {}
    };
  }
  const char = await dbGet_t(db, 'SELECT * FROM characters WHERE id = ?', [participant.char_id]);
  const equippedArray = await getEquippedItemsArray_t(db, participant.char_id);
  let equipped = {};
  if (equippedArray) {
    for (const item of equippedArray) {
      if (item.slot && item.slot !== 'consumable') {
        const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : (item.item_data || {});
        equipped[item.slot] = data;
      }
    }
  }
  const hpMax = calcHpMax(char, equippedArray);
  return {
    id: `char_${char.id}`,
    name: char.name,
    class: char.class,
    level: char.level,
    strength: char.strength,
    defense: char.defense,
    agility: char.agility,
    magic: char.magic,
    vitality: char.vitality || 10,
    hp_max: hpMax,
    equipped
  };
}

function calcHpMax(char, equippedArray) {
  const vit = char.vitality || 10;
  const lvl = char.level || 1;
  let bonus = 0;
  if (equippedArray) {
    for (const item of equippedArray) {
      const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : (item.item_data || {});
      if (data.stats?.vitality) bonus += data.stats.vitality;
    }
  }
  return 80 + vit * 8 + lvl * 5 + bonus;
}

async function getEquippedItemsArray_t(db, charId) {
  const row = await dbGet_t(db, 'SELECT * FROM equipment WHERE char_id = ?', [charId]);
  if (!row) return [];
  const items = [];
  const slots = ['weapon', 'armor', 'boots', 'amulet', 'ring'];
  for (const slot of slots) {
    if (row[slot + '_id']) {
      const inv = await dbGet_t(db, 'SELECT * FROM inventory WHERE id = ?', [row[slot + '_id']]);
      if (inv) {
        const data = typeof inv.item_data === 'string' ? JSON.parse(inv.item_data) : inv.item_data;
        items.push({ ...inv, slot, item_data: data });
      }
    }
  }
  return items;
}

function generateRoundRobin(playerIds) {
  const ids = [...playerIds];
  if (ids.length % 2 !== 0) ids.push(null);
  const rounds = [];
  const n = ids.length;
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const p1 = ids[i], p2 = ids[n - 1 - i];
      if (p1 !== null && p2 !== null) round.push([p1, p2]);
    }
    rounds.push(round);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}

async function fightMatch(db, tournamentId, roundIndex, p1Id, p2Id, participants) {
  const p1 = participants.find(p => p.id === p1Id);
  const p2 = participants.find(p => p.id === p2Id);
  if (!p1 || !p2) return;
  const f1 = await buildFighter(db, p1, participants);
  const f2 = await buildFighter(db, p2, participants);
  const result = deathmatchBattle(f1, f2);
  await dbRun_t(db, `INSERT INTO tournament_matches (tournament_id, round_index, participant1_id, participant2_id, winner_id, is_draw, battle_log, fought_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [tournamentId, roundIndex, p1.id, p2.id, result.winnerId, result.isDraw, JSON.stringify(result.log)]);
  if (result.isDraw) {
    await dbRun_t(db, 'UPDATE tournament_participants SET points = points + 1, draws = draws + 1 WHERE id IN (?, ?)', [p1.id, p2.id]);
  } else if (result.winnerId) {
    const winnerPid = result.winnerId === f1.id ? p1.id : p2.id;
    const loserPid = result.winnerId === f1.id ? p2.id : p1.id;
    const winnerPart = participants.find(p => p.id === winnerPid);
    await dbRun_t(db, 'UPDATE tournament_participants SET points = points + 3, wins = wins + 1 WHERE id = ?', [winnerPid]);
    await dbRun_t(db, 'UPDATE tournament_participants SET losses = losses + 1 WHERE id = ?', [loserPid]);
    if (winnerPart && !winnerPart.is_npc && winnerPart.char_id) {
      await dbRun_t(db, 'UPDATE characters SET gems = COALESCE(gems, 0) + 1 WHERE id = ?', [winnerPart.char_id]);
    }
  }
}

async function finalizeTournament(db, tournamentId) {
  const standings = await dbAll_t(db, 'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY points DESC, wins DESC', [tournamentId]);
  const winner = standings[0];
  if (!winner) return;
  const winnerIsNpc = !!winner.is_npc;
  await dbRun_t(db, 'UPDATE tournaments SET status = ?, ended_at = datetime(\'now\'), winner_char_id = ?, winner_is_npc = ? WHERE id = ?',
    ['complete', winner.char_id, winnerIsNpc ? 1 : 0, tournamentId]);
  if (!winnerIsNpc && winner.char_id) {
    await dbRun_t(db, 'UPDATE characters SET tournament_wins = COALESCE(tournament_wins, 0) + 1, gems = COALESCE(gems, 0) + 10 WHERE id = ?', [winner.char_id]);
  }
  console.log(`🏆 Tournament #${tournamentId} complete! Winner: ${winner.name}${winnerIsNpc ? ' (NPC)' : ''}`);
}

async function ensureCurrentTournament() {
  const db = await getDb();
  let current = await dbGet_t(db, "SELECT * FROM tournaments WHERE status IN ('pending','active') ORDER BY id DESC LIMIT 1");
  if (!current) {
    await dbRun_t(db, "INSERT INTO tournaments (status, created_at) VALUES ('pending', datetime('now'))");
    current = await dbGet_t(db, "SELECT * FROM tournaments WHERE status IN ('pending','active') ORDER BY id DESC LIMIT 1");
  }
  return current;
}

function generateRandomNpcStats(level) {
  return {
    level,
    strength: 30 + level * 2 + Math.floor(Math.random() * 20),
    defense: 30 + level * 2 + Math.floor(Math.random() * 20),
    agility: 30 + level * 2 + Math.floor(Math.random() * 20),
    magic: 30 + level * 2 + Math.floor(Math.random() * 20),
    vitality: 8 + Math.floor(Math.random() * 8)
  };
}

async function dbGet_t(db, sql, args = []) { const r = await db.execute({ sql, args }); return r.rows[0] ?? null; }
async function dbAll_t(db, sql, args = []) { const r = await db.execute({ sql, args }); return r.rows; }
async function dbRun_t(db, sql, args = []) { return db.execute({ sql, args }); }

// ── API Routes ─────────────────────────────────────────────────────────────

router.get('/tournaments', auth, async (req, res) => {
  try {
    const db = await getDb();
    const list = await dbAll_t(db, 'SELECT * FROM tournaments ORDER BY id DESC LIMIT 20');
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/tournaments/current', auth, async (req, res) => {
  try {
    const db = await getDb();
    const t = await dbGet_t(db, "SELECT * FROM tournaments WHERE status IN ('pending','active') ORDER BY id DESC LIMIT 1");
    if (!t) return res.json(null);
    const participants = await dbAll_t(db, 'SELECT * FROM tournament_participants WHERE tournament_id = ?', [t.id]);
    const matches = await dbAll_t(db, 'SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round_index, id', [t.id]);
    res.json({ tournament: t, participants, matches });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tournaments/join', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await dbGet_t(db, 'SELECT * FROM characters WHERE id = (SELECT active_character_id FROM users WHERE id = ?)', [req.user.userId]);
    if (!char) return res.status(400).json({ error: 'No active character' });
    const t = await dbGet_t(db, "SELECT * FROM tournaments WHERE status = 'pending' ORDER BY id DESC LIMIT 1");
    if (!t) return res.status(400).json({ error: 'No upcoming tournament' });
    const existing = await dbGet_t(db, 'SELECT id FROM tournament_participants WHERE tournament_id = ? AND char_id = ?', [t.id, char.id]);
    if (existing) return res.status(400).json({ error: 'Already joined' });
    if (char.gold < TOURNAMENT_COST) return res.status(400).json({ error: `Need ${TOURNAMENT_COST} gold to join` });
    await dbRun_t(db, 'UPDATE characters SET gold = gold - ? WHERE id = ?', [TOURNAMENT_COST, char.id]);
    await dbRun_t(db, `INSERT INTO tournament_participants (tournament_id, char_id, name, class, level, strength, defense, agility, magic, vitality, hp_max)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [t.id, char.id, char.name, char.class, char.level, char.strength, char.defense, char.agility, char.magic, char.vitality || 10, calcHpMax(char, [])]);
    res.json({ message: 'Joined tournament!', cost: TOURNAMENT_COST });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tournaments/start-test', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const db = await getDb();
    const pending = await dbAll_t(db, "SELECT * FROM tournaments WHERE status = 'pending' ORDER BY id DESC LIMIT 1");
    if (!pending.length) return res.status(400).json({ error: 'No pending tournament' });
    runTournament(db, pending[0], true).catch(e => console.error('test run error:', e));
    res.json({ message: 'Tournament starting instantly with NPCs if needed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/tournaments/:id', auth, async (req, res) => {
  try {
    const db = await getDb();
    const t = await dbGet_t(db, 'SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Not found' });
    const participants = await dbAll_t(db, 'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY points DESC, wins DESC', [t.id]);
    const matches = await dbAll_t(db, 'SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round_index, id', [t.id]);
    for (const m of matches) {
      if (m.battle_log && typeof m.battle_log === 'string') {
        try { m.battle_log = JSON.parse(m.battle_log); } catch {}
      }
    }
    res.json({ tournament: t, participants, matches });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function initTournamentTables() {
  const db = await getDb();
  await dbRun_t(db, `CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT, ended_at TEXT,
    winner_char_id INTEGER, winner_is_npc INTEGER DEFAULT 0,
    participant_count INTEGER DEFAULT 0
  )`);
  await dbRun_t(db, `CREATE TABLE IF NOT EXISTS tournament_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    char_id INTEGER, is_npc INTEGER DEFAULT 0,
    npc_data TEXT, name TEXT NOT NULL, class TEXT DEFAULT 'warrior',
    level INTEGER DEFAULT 1, strength INTEGER DEFAULT 10,
    defense INTEGER DEFAULT 10, agility INTEGER DEFAULT 10,
    magic INTEGER DEFAULT 10, vitality INTEGER DEFAULT 10,
    hp_max INTEGER DEFAULT 100, points INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, draws INTEGER DEFAULT 0
  )`);
  await dbRun_t(db, `CREATE TABLE IF NOT EXISTS tournament_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    round_index INTEGER NOT NULL,
    participant1_id INTEGER NOT NULL,
    participant2_id INTEGER NOT NULL,
    winner_id INTEGER, is_draw INTEGER DEFAULT 0,
    battle_log TEXT, fought_at TEXT
  )`);
  try { await dbRun_t(db, "ALTER TABLE characters ADD COLUMN tournament_wins INTEGER DEFAULT 0"); } catch {}
}

function startScheduler() {
  scheduleDailyTournamentStart();
  setInterval(async () => {
    try {
      await ensureCurrentTournament();
    } catch (e) { console.error('Tournament ensure error:', e); }
  }, 5 * 60 * 1000);
}

module.exports = { router, initTournamentTables, startScheduler, ensureCurrentTournament, TOURNAMENT_COST };
