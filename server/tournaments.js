const express = require('express');
const router = express.Router();
const auth = require('./middleware');
const { getDb } = require('./db');
const {
  simulateRound, calculateMagicShield, calcHpMax,
  calcBaseDamage, calcArmorValue, calcElemDmg, calcElemResist,
  getEquippedStatTotal, getEquippedItemsArray, mergeActiveSkills, getActiveSkills,
  hasSkill, hasClassModifier, getActiveCombatEffect, getEffectiveMagic, applyMagicDamageModifiers,
  getEquippedSetBonuses, skillPassiveBonus,
  DEFAULT_ATTACK_ZONES, DEFAULT_BLOCK_ZONES, EQUIPMENT_SLOTS
} = require('./routes');
const {
  computePassiveBonusesWithProgress,
  computeActiveCombatEffectsWithProgress,
  computeClassModifiersWithProgress,
  rogueHasDualWield
} = require('./skills');

const TOURNAMENT_COST = 500;
const MIN_PLAYERS = 8;
const ROUND_INTERVAL_MS = 60_000;
const DAILY_HOUR = 20;
const NORMAL_ROUNDS = 10;

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
    }
    // Re-read from DB to get real auto-increment IDs for NPCs
    participants = await dbAll_t(db, 'SELECT * FROM tournament_participants WHERE tournament_id = ?', [t.id]);
    console.log(`   Added ${npcsNeeded} NPCs, total: ${participants.length}`);
  }
  await dbRun_t(db, 'UPDATE tournaments SET status = ?, started_at = datetime(\'now\'), participant_count = ? WHERE id = ?', ['active', participants.length, t.id]);
  const schedule = generateRoundRobin(participants.map(p => p.id));
  for (let r = 0; r < schedule.length; r++) {
    const round = schedule[r];
    if (!fast && r > 0) await new Promise(resolve => setTimeout(resolve, ROUND_INTERVAL_MS));
    for (const [p1Id, p2Id] of round) {
      await fightMatch(db, t.id, r, p1Id, p2Id, participants, t.mode);
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
    const nd = participant.npc_data ? (typeof participant.npc_data === 'string' ? JSON.parse(participant.npc_data) : participant.npc_data) : {};
    const agi = participant.agility || 10;
    const str = participant.strength || 10;
    const def = participant.defense || 10;
    return {
      id: `npc_${participant.id}`,
      name: participant.name,
      class: participant.class,
      level: participant.level,
      hp: participant.hp_max,
      hpMax: participant.hp_max,
      dmgMin: nd.dmg_min || Math.max(1, Math.floor(str * 0.5)),
      dmgMax: nd.dmg_max || Math.max(2, Math.floor(str * 0.5) + 4),
      strength: str,
      agility: agi,
      magic: participant.magic || 10,
      defense: def,
      hit_chance: nd.hit_chance || Math.floor(agi / 2),
      crit_chance: nd.crit_chance || Math.floor(agi / 4),
      armor: nd.armor || Math.floor(def / 4),
      agility_bonus: 0,
      dmg_bonus: 0,
      elem_dmg: { pyro:0, water:0, wind:0, electro:0 },
      elem_resist: { pyro:0, water:0, wind:0, electro:0 },
      skillEffects: nd.skillEffects || [],
      skillMods: nd.skillMods || [],
      baseActiveSkills: {},
      activeSkills: {},
      attackZones: DEFAULT_ATTACK_ZONES,
      blockZones: DEFAULT_BLOCK_ZONES
    };
  }
  const char = await dbGet_t(db, 'SELECT * FROM characters WHERE id = ?', [participant.char_id]);
  const equippedArray = await getEquippedItemsArray(db, participant.char_id);
  const hpMax = calcHpMax(char, equippedArray);
  const { dmgMin, dmgMax } = calcBaseDamage(char, equippedArray);
  const armor = calcArmorValue(char, equippedArray);
  const statsElemDmg = calcElemDmg(equippedArray);
  const statsElemResist = calcElemResist(char, equippedArray);
  const setBonuses = getEquippedSetBonuses(equippedArray);

  const learnedRows = await dbAll_t(db, 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', [char.id]);
  const learnedIds = learnedRows.map(r => r.skill_id);
  const skillPassives = await computePassiveBonusesWithProgress(db, char.class, learnedIds, char.id);
  const skillActives  = await computeActiveCombatEffectsWithProgress(db, char.class, learnedIds, char.id);
  const skillMods     = await computeClassModifiersWithProgress(db, char.class, learnedIds, char.id);

  let noShieldAgi = 0;
  if (char.class === 'rogue') {
    const hasShield = equippedArray.some(i => {
      try { const d = JSON.parse(i.item_data); return d.slot === 'shield' && d.rogueOffhand !== true; }
      catch { return false; }
    });
    if (!hasShield) noShieldAgi = Math.floor((char.agility || 0) * 0.05);
  }

  const fighterHpMax = hpMax + skillPassiveBonus(char.vitality || 0, skillPassives.vitality) * 25;

  return {
    id: `char_${char.id}`,
    name: char.name,
    class: char.class,
    level: char.level,
    hp: Math.min(fighterHpMax, char.hp_current ?? fighterHpMax),
    hpMax: fighterHpMax,
    dmgMin: dmgMin + skillPassiveBonus(dmgMin, skillPassives.dmg_min),
    dmgMax: dmgMax + skillPassiveBonus(dmgMax, skillPassives.dmg_max),
    strength: (char.strength || 0) + (setBonuses.strength || 0) + skillPassiveBonus(char.strength || 0, skillPassives.strength) + getEquippedStatTotal(equippedArray, 'strength'),
    agility: (char.agility || 0) + (setBonuses.agility || 0) + skillPassiveBonus(char.agility || 0, skillPassives.agility) + noShieldAgi + getEquippedStatTotal(equippedArray, 'agility'),
    magic: (char.magic || 0) + (setBonuses.magic || 0) + skillPassiveBonus(char.magic || 0, skillPassives.magic) + getEquippedStatTotal(equippedArray, 'magic'),
    defense: (char.defense || 0) + (setBonuses.defense || 0) + skillPassiveBonus(char.defense || 0, skillPassives.defense) + getEquippedStatTotal(equippedArray, 'defense'),
    hit_chance: (char.hit_chance || 0) + (setBonuses.hit_chance || 0) + skillPassiveBonus(char.hit_chance || 0, skillPassives.hit_chance) + getEquippedStatTotal(equippedArray, 'hit_chance'),
    crit_chance: (char.crit_chance || 0) + (setBonuses.crit_chance || 0) + skillPassiveBonus(char.crit_chance || 0, skillPassives.crit_chance) + getEquippedStatTotal(equippedArray, 'crit_chance'),
    armor: armor + skillPassiveBonus(armor, skillPassives.armor),
    agility_bonus: 0,
    dmg_bonus: skillPassives.dmg_bonus || 0,
    elem_dmg: {
      pyro:    (statsElemDmg.pyro    || 0) + (skillPassives.pyro_dmg    || 0),
      water:   (statsElemDmg.water   || 0) + (skillPassives.water_dmg   || 0),
      wind:    (statsElemDmg.wind    || 0) + (skillPassives.wind_dmg    || 0),
      electro: (statsElemDmg.electro || 0) + (skillPassives.electro_dmg || 0)
    },
    elem_resist: {
      pyro:    (statsElemResist.pyro    || 0) + (skillPassives.pyro_resist    || 0),
      water:   (statsElemResist.water   || 0) + (skillPassives.water_resist   || 0),
      wind:    (statsElemResist.wind    || 0) + (skillPassives.wind_resist    || 0),
      electro: (statsElemResist.electro || 0) + (skillPassives.electro_resist || 0)
    },
    skillEffects: skillActives,
    skillMods: skillMods,
    baseActiveSkills: getActiveSkills(char),
    activeSkills: mergeActiveSkills(getActiveSkills(char), skillActives),
    attackZones: (() => { try { return JSON.parse(char.attack_zones); } catch { return null; } })() || DEFAULT_ATTACK_ZONES,
    blockZones: (() => { try { return JSON.parse(char.block_zones); } catch { return null; } })() || DEFAULT_BLOCK_ZONES,
    dualWield: char.class === 'rogue' && rogueHasDualWield(learnedIds)
  };
}

function deathmatchBattle(fighterA, fighterB) {
  const log = [];
  let hpA = fighterA.hp, hpB = fighterB.hp;
  let penaltyA = false, penaltyB = false;
  let totalDmgToA = 0, totalDmgToB = 0;

  let shieldA = calculateMagicShield(fighterB, fighterA);
  let shieldB = calculateMagicShield(fighterA, fighterB);

  log.push(`⚔️  ${fighterA.name}  vs  ${fighterB.name}`);
  const skA = Object.keys(fighterA.baseActiveSkills || {});
  const skB = Object.keys(fighterB.baseActiveSkills || {});
  if (skA.length) log.push(`✨ ${fighterA.name}'s active skills: ${skA.join(', ')}`);
  if (skB.length) log.push(`✨ ${fighterB.name}'s active skills: ${skB.join(', ')}`);
  if (shieldA.active) log.push(`✨ ${fighterA.name}'s magic creates a force field with ${shieldA.value} durability!`);
  if (shieldB.active) log.push(`✨ ${fighterB.name}'s magic creates a force field with ${shieldB.value} durability!`);
  log.push('---');

  let winnerId = null, roundsCompleted = 0;

  for (let round = 1; ; round++) {
    const idx = (round - 1) % 10;
    const atkZoneA = (fighterA.attackZones || DEFAULT_ATTACK_ZONES)[idx] || 'chest';
    const blkZoneA = (fighterA.blockZones || DEFAULT_BLOCK_ZONES)[idx] || 'cross_guard';
    const atkZoneB = (fighterB.attackZones || DEFAULT_ATTACK_ZONES)[idx] || 'chest';
    const blkZoneB = (fighterB.blockZones || DEFAULT_BLOCK_ZONES)[idx] || 'cross_guard';

    const resA = simulateRound(round, fighterA, fighterB, atkZoneA, blkZoneB, penaltyA, shieldA, shieldB);
    const resB = simulateRound(round, fighterB, fighterA, atkZoneB, blkZoneA, penaltyB, shieldB, shieldA);

    const dmgToB = resA.damageDealt + resB.damageCounter;
    const dmgToA = resB.damageDealt + resA.damageCounter;

    totalDmgToA += dmgToA;
    totalDmgToB += dmgToB;
    roundsCompleted = round;

    hpA = Math.min(fighterA.hpMax || 9999, Math.max(0, hpA - dmgToA + (resA.healBack || 0)));
    hpB = Math.min(fighterB.hpMax || 9999, Math.max(0, hpB - dmgToB + (resB.healBack || 0)));

    const burnToA = (resA.attackerBurnDmg || 0) + (resB.defenderBurnDmg || 0);
    const burnToB = (resB.attackerBurnDmg || 0) + (resA.defenderBurnDmg || 0);
    if (burnToA > 0) { hpA = Math.max(0, hpA - burnToA); log.push(`🔥 ${fighterA.name} takes ${burnToA} burn damage`); }
    if (burnToB > 0) { hpB = Math.max(0, hpB - burnToB); log.push(`🔥 ${fighterB.name} takes ${burnToB} burn damage`); }

    if (resA.roundStartHeal > 0) hpA = Math.min(fighterA.hpMax || 9999, hpA + resA.roundStartHeal);
    if (resB.roundStartHeal > 0) hpB = Math.min(fighterB.hpMax || 9999, hpB + resB.roundStartHeal);
    if (resA.postDmgHeal > 0) hpA = Math.min(fighterA.hpMax || 9999, hpA + resA.postDmgHeal);
    if (resA.postDmgHealDefender > 0) hpB = Math.min(fighterB.hpMax || 9999, hpB + resA.postDmgHealDefender);
    if (resB.postDmgHeal > 0) hpB = Math.min(fighterB.hpMax || 9999, hpB + resB.postDmgHeal);
    if (resB.postDmgHealDefender > 0) hpA = Math.min(fighterA.hpMax || 9999, hpA + resB.postDmgHealDefender);

    fighterA.hp = hpA; fighterB.hp = hpB;

    log.push(resA.logLine);
    log.push(resB.logLine);
    penaltyA = resB.nextAtkPenalty;
    penaltyB = resA.nextAtkPenalty;

    if (hpA <= 0 || hpB <= 0) {
      let resurrected = false;
      for (const item of [[fighterA, hpA], [fighterB, hpB]]) {
        const f = item[0], hp = item[1];
        if (hp > 0) continue;
        const resMod = hasClassModifier(f, 'resurrection');
        if (resMod && !f._resurrectionUsed) {
          f._resurrectionUsed = true;
          const restoreHp = Math.max(1, Math.floor((f.hpMax || 9999) * resMod.hp_pct));
          if (f === fighterA) hpA = restoreHp; else hpB = restoreHp;
          log.push(`✨ ${f.name} is resurrected with ${restoreHp} HP!`);
          resurrected = true;
        }
        if (!resurrected) {
          const rfEff = getActiveCombatEffect(f, 'rebirth_flame');
          if (rfEff && !f._rebirthFlameUsed) {
            f._rebirthFlameUsed = true;
            const restoreHp = Math.max(1, Math.floor((f.hpMax || 9999) * (rfEff.revive_hp_pct || 0.20)));
            if (f === fighterA) hpA = restoreHp; else hpB = restoreHp;
            const other = f === fighterA ? fighterB : fighterA;
            const otherDmg = f === fighterA ? Math.max(0, dmgToA) : Math.max(0, dmgToB);
            other._burnDotDmg = (other._burnDotDmg || 0) + Math.max(1, Math.floor((otherDmg || 9999) * (rfEff.burn_dot || 0.10)));
            log.push(`🔥🕊️ ${f.name} is reborn in flame with ${restoreHp} HP — ${other.name} is burning!`);
            resurrected = true;
          }
        }
      }
      if (resurrected) { log.push('---'); continue; }

      if (hpA <= 0 && hpB <= 0) {
        if (totalDmgToB === totalDmgToA) {
          const tieA = hasClassModifier(fighterB, 'tie_breaker');
          const tieB = hasClassModifier(fighterA, 'tie_breaker');
          if (tieA) { log.push(`Round ${round}: Both fighters fall — but ${fighterA.name} breaks the tie!`); winnerId = fighterA.id; }
          else if (tieB) { log.push(`Round ${round}: Both fighters fall — but ${fighterB.name} breaks the tie!`); winnerId = fighterB.id; }
          else { log.push(`Round ${round}: Both fighters fall simultaneously — it's a draw!`); winnerId = 0; }
        } else {
          log.push(`Round ${round}: Both fighters fall simultaneously!`);
          winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
        }
      } else if (hpA <= 0) {
        log.push(`Round ${round}: ${fighterA.name} has fallen!`);
        winnerId = fighterB.id;
      } else {
        log.push(`Round ${round}: ${fighterB.name} has fallen!`);
        winnerId = fighterA.id;
      }
      break;
    }
    log.push('---');
  }

  log.push('---');
  if (winnerId === 0) log.push(`Draw! After ${roundsCompleted} rounds`);
  else if (winnerId === fighterA.id) log.push(`After ${roundsCompleted} rounds — ${fighterA.name} wins!`);
  else log.push(`After ${roundsCompleted} rounds — ${fighterB.name} wins!`);

  return {
    log, winnerId, isDraw: winnerId === 0,
    hpRemainingA: Math.round(hpA), hpRemainingB: Math.round(hpB),
    totalDmgToA: Math.round(totalDmgToA), totalDmgToB: Math.round(totalDmgToB)
  };
}

function normalBattle(fighterA, fighterB) {
  const log = [];
  let hpA = fighterA.hp, hpB = fighterB.hp;
  let penaltyA = false, penaltyB = false;
  let totalDmgToA = 0, totalDmgToB = 0;

  let shieldA = calculateMagicShield(fighterB, fighterA);
  let shieldB = calculateMagicShield(fighterA, fighterB);

  log.push(`⚔️  ${fighterA.name}  vs  ${fighterB.name}`);
  const skA = Object.keys(fighterA.baseActiveSkills || {});
  const skB = Object.keys(fighterB.baseActiveSkills || {});
  if (skA.length) log.push(`✨ ${fighterA.name}'s active skills: ${skA.join(', ')}`);
  if (skB.length) log.push(`✨ ${fighterB.name}'s active skills: ${skB.join(', ')}`);
  if (shieldA.active) log.push(`✨ ${fighterA.name}'s magic creates a force field with ${shieldA.value} durability!`);
  if (shieldB.active) log.push(`✨ ${fighterB.name}'s magic creates a force field with ${shieldB.value} durability!`);
  log.push('🏁 NORMAL MODE — 10 rounds max');
  log.push('---');

  let winnerId = null, roundsCompleted = 0;

  for (let round = 1; round <= NORMAL_ROUNDS; round++) {
    const idx = (round - 1) % 10;
    const atkZoneA = (fighterA.attackZones || DEFAULT_ATTACK_ZONES)[idx] || 'chest';
    const blkZoneA = (fighterA.blockZones || DEFAULT_BLOCK_ZONES)[idx] || 'cross_guard';
    const atkZoneB = (fighterB.attackZones || DEFAULT_ATTACK_ZONES)[idx] || 'chest';
    const blkZoneB = (fighterB.blockZones || DEFAULT_BLOCK_ZONES)[idx] || 'cross_guard';

    const resA = simulateRound(round, fighterA, fighterB, atkZoneA, blkZoneB, penaltyA, shieldA, shieldB);
    const resB = simulateRound(round, fighterB, fighterA, atkZoneB, blkZoneA, penaltyB, shieldB, shieldA);

    const dmgToB = resA.damageDealt + resB.damageCounter;
    const dmgToA = resB.damageDealt + resA.damageCounter;

    totalDmgToA += dmgToA;
    totalDmgToB += dmgToB;
    roundsCompleted = round;

    hpA = Math.min(fighterA.hpMax || 9999, Math.max(0, hpA - dmgToA + (resA.healBack || 0)));
    hpB = Math.min(fighterB.hpMax || 9999, Math.max(0, hpB - dmgToB + (resB.healBack || 0)));

    const burnToA = (resA.attackerBurnDmg || 0) + (resB.defenderBurnDmg || 0);
    const burnToB = (resB.attackerBurnDmg || 0) + (resA.defenderBurnDmg || 0);
    if (burnToA > 0) { hpA = Math.max(0, hpA - burnToA); log.push(`🔥 ${fighterA.name} takes ${burnToA} burn damage`); }
    if (burnToB > 0) { hpB = Math.max(0, hpB - burnToB); log.push(`🔥 ${fighterB.name} takes ${burnToB} burn damage`); }

    if (resA.roundStartHeal > 0) hpA = Math.min(fighterA.hpMax || 9999, hpA + resA.roundStartHeal);
    if (resB.roundStartHeal > 0) hpB = Math.min(fighterB.hpMax || 9999, hpB + resB.roundStartHeal);
    if (resA.postDmgHeal > 0) hpA = Math.min(fighterA.hpMax || 9999, hpA + resA.postDmgHeal);
    if (resA.postDmgHealDefender > 0) hpB = Math.min(fighterB.hpMax || 9999, hpB + resA.postDmgHealDefender);
    if (resB.postDmgHeal > 0) hpB = Math.min(fighterB.hpMax || 9999, hpB + resB.postDmgHeal);
    if (resB.postDmgHealDefender > 0) hpA = Math.min(fighterA.hpMax || 9999, hpA + resB.postDmgHealDefender);

    fighterA.hp = hpA; fighterB.hp = hpB;

    log.push(resA.logLine);
    log.push(resB.logLine);
    penaltyA = resB.nextAtkPenalty;
    penaltyB = resA.nextAtkPenalty;

    if (hpA <= 0 || hpB <= 0) {
      let resurrected = false;
      for (const item of [[fighterA, hpA], [fighterB, hpB]]) {
        const f = item[0], hp = item[1];
        if (hp > 0) continue;
        const resMod = hasClassModifier(f, 'resurrection');
        if (resMod && !f._resurrectionUsed) {
          f._resurrectionUsed = true;
          const restoreHp = Math.max(1, Math.floor((f.hpMax || 9999) * resMod.hp_pct));
          if (f === fighterA) hpA = restoreHp; else hpB = restoreHp;
          log.push(`✨ ${f.name} is resurrected with ${restoreHp} HP!`);
          resurrected = true;
        }
        if (!resurrected) {
          const rfEff = getActiveCombatEffect(f, 'rebirth_flame');
          if (rfEff && !f._rebirthFlameUsed) {
            f._rebirthFlameUsed = true;
            const restoreHp = Math.max(1, Math.floor((f.hpMax || 9999) * (rfEff.revive_hp_pct || 0.20)));
            if (f === fighterA) hpA = restoreHp; else hpB = restoreHp;
            const other = f === fighterA ? fighterB : fighterA;
            const otherDmg = f === fighterA ? Math.max(0, dmgToA) : Math.max(0, dmgToB);
            other._burnDotDmg = (other._burnDotDmg || 0) + Math.max(1, Math.floor((otherDmg || 9999) * (rfEff.burn_dot || 0.10)));
            log.push(`🔥🕊️ ${f.name} is reborn in flame with ${restoreHp} HP — ${other.name} is burning!`);
            resurrected = true;
          }
        }
      }
      if (resurrected) { log.push('---'); continue; }

      if (hpA <= 0 && hpB <= 0) {
        if (totalDmgToB === totalDmgToA) {
          const tieA = hasClassModifier(fighterB, 'tie_breaker');
          const tieB = hasClassModifier(fighterA, 'tie_breaker');
          if (tieA) { log.push(`Round ${round}: Both fighters fall — but ${fighterA.name} breaks the tie!`); winnerId = fighterA.id; }
          else if (tieB) { log.push(`Round ${round}: Both fighters fall — but ${fighterB.name} breaks the tie!`); winnerId = fighterB.id; }
          else { log.push(`Round ${round}: Both fighters fall simultaneously — it's a draw!`); winnerId = 0; }
        } else {
          log.push(`Round ${round}: Both fighters fall simultaneously!`);
          winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
        }
      } else if (hpA <= 0) {
        log.push(`Round ${round}: ${fighterA.name} has fallen!`);
        winnerId = fighterB.id;
      } else {
        log.push(`Round ${round}: ${fighterB.name} has fallen!`);
        winnerId = fighterA.id;
      }
      break;
    }
    log.push('---');
  }

  log.push('---');
  if (winnerId !== null) {
    if (winnerId === 0) log.push(`Draw! After ${roundsCompleted} rounds`);
    else if (winnerId === fighterA.id) log.push(`After ${roundsCompleted} rounds — ${fighterA.name} wins!`);
    else log.push(`After ${roundsCompleted} rounds — ${fighterB.name} wins!`);
  } else {
    roundsCompleted = NORMAL_ROUNDS;
    if (totalDmgToB > totalDmgToA) {
      log.push(`After ${NORMAL_ROUNDS} rounds — ${fighterA.name} wins by damage (${totalDmgToB.toLocaleString()} vs ${totalDmgToA.toLocaleString()})`);
      winnerId = fighterA.id;
    } else if (totalDmgToA > totalDmgToB) {
      log.push(`After ${NORMAL_ROUNDS} rounds — ${fighterB.name} wins by damage (${totalDmgToA.toLocaleString()} vs ${totalDmgToB.toLocaleString()})`);
      winnerId = fighterB.id;
    } else {
      log.push(`After ${NORMAL_ROUNDS} rounds — Draw! Both dealt ${totalDmgToA.toLocaleString()} damage`);
      winnerId = 0;
    }
  }

  return {
    log, winnerId, isDraw: winnerId === 0,
    hpRemainingA: Math.round(hpA), hpRemainingB: Math.round(hpB),
    totalDmgToA: Math.round(totalDmgToA), totalDmgToB: Math.round(totalDmgToB)
  };
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

async function fightMatch(db, tournamentId, roundIndex, p1Id, p2Id, participants, mode) {
  const p1 = participants.find(p => p.id === p1Id);
  const p2 = participants.find(p => p.id === p2Id);
  if (!p1 || !p2) return;
  const f1 = await buildFighter(db, p1, participants);
  const f2 = await buildFighter(db, p2, participants);
  const result = mode === 'normal' ? normalBattle(f1, f2) : deathmatchBattle(f1, f2);
  const winnerPid = result.isDraw ? null : (result.winnerId === f1.id ? p1.id : p2.id);
  const dmgToP1 = Math.round(result.totalDmgToA);
  const dmgToP2 = Math.round(result.totalDmgToB);
  await dbRun_t(db, `INSERT INTO tournament_matches (tournament_id, round_index, participant1_id, participant2_id, winner_id, is_draw, battle_log, dmg_to_p1, dmg_to_p2, fought_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [tournamentId, roundIndex, p1.id, p2.id, winnerPid, result.isDraw ? 1 : 0, JSON.stringify(result.log), dmgToP1, dmgToP2]);
  if (result.isDraw) {
    await dbRun_t(db, 'UPDATE tournament_participants SET points = points + 1, draws = draws + 1 WHERE id IN (?, ?)', [p1.id, p2.id]);
  } else if (winnerPid) {
    const loserPid = winnerPid === p1.id ? p2.id : p1.id;
    const winnerPart = participants.find(p => p.id === winnerPid);
    await dbRun_t(db, 'UPDATE tournament_participants SET points = points + 3, wins = wins + 1 WHERE id = ?', [winnerPid]);
    await dbRun_t(db, 'UPDATE tournament_participants SET losses = losses + 1 WHERE id = ?', [loserPid]);
    if (winnerPart && !winnerPart.is_npc && winnerPart.char_id) {
      await dbRun_t(db, 'UPDATE characters SET gems = COALESCE(gems, 0) + 1, gold = COALESCE(gold, 0) + 500 WHERE id = ?', [winnerPart.char_id]);
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
    await dbRun_t(db, 'UPDATE characters SET tournament_wins = COALESCE(tournament_wins, 0) + 1, gems = COALESCE(gems, 0) + 10, gold = COALESCE(gold, 0) + 5000 WHERE id = ?', [winner.char_id]);
  }
  const matches = await dbAll_t(db, 'SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round_index, id', [tournamentId]);
  for (let i = 0; i < standings.length; i++) {
    const p = standings[i];
    if (p.is_npc || !p.char_id) continue;
    const rank = i + 1;
    const pMatches = matches.filter(m => m.participant1_id === p.id || m.participant2_id === p.id);
    const subject = `🏟️ Tournament #${tournamentId} — You placed #${rank} of ${standings.length}!`;
    const body = `You fought ${pMatches.length} match(es) with ${p.wins} wins, ${p.losses} losses, ${p.draws} draws.`;
    await dbRun_t(db, 'INSERT INTO messages (sender_id, receiver_id, subject, body, system_message) VALUES (?,?,?,?,1)',
      [p.char_id, p.char_id, subject, body]);
    for (const mm of pMatches) {
      const oppId = mm.participant1_id === p.id ? mm.participant2_id : mm.participant1_id;
      const opponent = standings.find(s => s.id === oppId);
      const won = mm.winner_id === p.id;
      const isDraw = mm.is_draw;
      let log;
      try { log = typeof mm.battle_log === 'string' ? JSON.parse(mm.battle_log) : (mm.battle_log || []); } catch { log = []; }
      const dmgDealt = p.id === mm.participant1_id ? (mm.dmg_to_p2 || 0) : (mm.dmg_to_p1 || 0);
      const dmgTaken = p.id === mm.participant1_id ? (mm.dmg_to_p1 || 0) : (mm.dmg_to_p2 || 0);
      const goldEarned = won ? 500 : 0;
      const payload = JSON.stringify({
        log, won, isDraw: !!isDraw, goldEarned, goldLost: 0,
        type: 'tournament',
        opponentName: opponent?.name || 'Unknown',
        opponentClass: opponent?.class || null,
        opponentLevel: opponent?.level || null,
        totalDmgDealt: dmgDealt, totalDmgTaken: dmgTaken,
        tournamentMatch: true, roundIndex: mm.round_index
      });
      const matchSubject = isDraw ? `🤝 Tournament Draw vs ${opponent?.name || '?'} (Round ${mm.round_index + 1})`
        : won ? `🏆 Tournament Win vs ${opponent?.name || '?'} (Round ${mm.round_index + 1})`
        : `💀 Tournament Loss vs ${opponent?.name || '?'} (Round ${mm.round_index + 1})`;
      await dbRun_t(db, 'INSERT INTO messages (sender_id, receiver_id, subject, body) VALUES (?,?,?,?)',
        [p.char_id, p.char_id, matchSubject, `BATTLE_REPORT:${payload}`]);
    }
  }
  console.log(`🏆 Tournament #${tournamentId} complete! Winner: ${winner.name}${winnerIsNpc ? ' (NPC)' : ''}`);
}

async function ensureCurrentTournament() {
  const db = await getDb();
  let current = await dbGet_t(db, "SELECT * FROM tournaments WHERE status IN ('pending','active') ORDER BY id DESC LIMIT 1");
  if (!current) {
    const last = await dbGet_t(db, "SELECT mode FROM tournaments ORDER BY id DESC LIMIT 1");
    const mode = !last || last.mode === 'deathmatch' ? 'normal' : 'deathmatch';
    await dbRun_t(db, "INSERT INTO tournaments (status, created_at, mode) VALUES ('pending', datetime('now'), ?)", [mode]);
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
    const t = await dbGet_t(db, "SELECT * FROM tournaments ORDER BY id DESC LIMIT 1");
    if (!t) return res.json(null);
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
      [t.id, char.id, char.name, char.class, char.level, char.strength, char.defense, char.agility, char.magic, char.vitality || 10, char.hp_current]);
    res.json({ message: 'Joined tournament!', cost: TOURNAMENT_COST });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tournaments/create', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const db = await getDb();
    const last = await dbGet_t(db, "SELECT mode FROM tournaments ORDER BY id DESC LIMIT 1");
    const mode = !last || last.mode === 'deathmatch' ? 'normal' : 'deathmatch';
    await dbRun_t(db, "INSERT INTO tournaments (status, created_at, mode) VALUES ('pending', datetime('now'), ?)", [mode]);
    const t = await dbGet_t(db, "SELECT * FROM tournaments WHERE status = 'pending' ORDER BY id DESC LIMIT 1");
    res.json({ message: 'Tournament created', tournament: t });
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
  try { await dbRun_t(db, "ALTER TABLE tournament_matches ADD COLUMN dmg_to_p1 INTEGER DEFAULT 0"); } catch {}
  try { await dbRun_t(db, "ALTER TABLE tournament_matches ADD COLUMN dmg_to_p2 INTEGER DEFAULT 0"); } catch {}
  try { await dbRun_t(db, "ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'deathmatch'"); } catch {}
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
