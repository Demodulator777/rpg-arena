const express = require('express');
const { getDb } = require('./db');
const auth = require('./middleware');
const { ZONES, RAW_MATERIALS, COMPONENTS, EQUIPMENT_RECIPES, generateMission, TIER_COLORS, TIER_LABELS } = require('./gamedata');

// Patch BigInt serialization — Turso returns BigInt for IDs, JSON.stringify chokes on them
BigInt.prototype.toJSON = function() { return Number(this); };

const router = express.Router();

// ── DB Migrations (run once on startup) ───────────────────────────────────
(async () => {
    try {
        const db = await getDb();
        const migrations = [
            'ALTER TABLE characters ADD COLUMN attack_cooldown_until INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN last_battle_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN vitality INTEGER DEFAULT 10',
            'ALTER TABLE characters ADD COLUMN attack_zones TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN block_zones TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN last_regen_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN travel_start_time INTEGER DEFAULT 0',
            'ALTER TABLE equipment ADD COLUMN accessory_id INTEGER',
            'ALTER TABLE characters ADD COLUMN hit_chance INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN crit_chance INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN mission_points INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN mp_last_regen_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN total_mp_earned INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN daily_mp_spent INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN daily_mp_reset_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN active_skills TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN skill_last_used TEXT DEFAULT NULL',
        ];
        for (const sql of migrations) {
            try { await db.execute({ sql, args: [] }); } catch {} // Ignore "column already exists"
        }
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS global_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_key TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            ends_at INTEGER NOT NULL
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS attack_cooldowns (
            attacker_id INTEGER,
            defender_id INTEGER,
            expires_at INTEGER,
            PRIMARY KEY (attacker_id, defender_id)
        )`, args: [] });
        console.log('✅ DB migrations applied');
    } catch (e) { console.error('Migration error:', e.message); }
})();

// ── Class definitions ──────────────────────────────────────────────────────
const CLASSES = {
    warrior:  { strength:16, defense:14, agility:10, magic:5,  hp_max:130 },
    mage:     { strength:8,  defense:8,  agility:10, magic:20, hp_max:90  },
    rogue:    { strength:12, defense:8,  agility:20, magic:6,  hp_max:100 },
    paladin:  { strength:12, defense:16, agility:8,  magic:12, hp_max:120 },
};
const CLASS_DISCOUNTS = {
    warrior:  { strength:0.30, defense:0.15, agility:0,    magic:0,    vitality:0.10 },
    mage:     { strength:0,    defense:0,    agility:0.10, magic:0.35, vitality:0    },
    rogue:    { strength:0.10, defense:0,    agility:0.35, magic:0,    vitality:0    },
    paladin:  { strength:0.10, defense:0.25, agility:0,    magic:0.20, vitality:0.15 },
};
const UPGRADE_BASE = 5;
const UPGRADE_EXPONENT = 1.25;
function upgradeCost(stat, currentVal, charClass) {
    const raw = Math.floor(UPGRADE_BASE * Math.pow(currentVal, UPGRADE_EXPONENT));
    const discount = CLASS_DISCOUNTS[charClass]?.[stat] || 0;
    return Math.max(10, Math.floor(raw * (1 - discount)));
}

const TRAINING_DURATION_SEC = 6000;
const TRAINING_GAIN = 1;
const LEVEL_XP = (l) => l * 25;

// ── Zone-based battle constants ────────────────────────────────────────────
const HIT_ZONES = {
    head:         { dmgMult: 1.50, hitChance: 0.60 },
    throat:       { dmgMult: 1.30, hitChance: 0.65 },
    chest:        { dmgMult: 1.00, hitChance: 0.85 },
    heart:        { dmgMult: 1.75, hitChance: 0.45 },
    solar_plexus: { dmgMult: 1.20, hitChance: 0.75 },
    stomach:      { dmgMult: 1.10, hitChance: 0.80 },
    left_arm:     { dmgMult: 0.80, hitChance: 0.90 },
    right_arm:    { dmgMult: 0.80, hitChance: 0.90 },
    left_leg:     { dmgMult: 0.70, hitChance: 0.92 },
    right_leg:    { dmgMult: 0.70, hitChance: 0.92 },
};
const BLOCK_ZONES = {
    high_guard:    { protects: ['head','throat'],           reduction: 0.85 },
    cross_guard:   { protects: ['heart','chest'],           reduction: 0.85 },
    mid_guard:     { protects: ['solar_plexus','stomach'],  reduction: 0.80 },
    left_guard:    { protects: ['left_arm','left_leg'],     reduction: 0.75 },
    right_guard:   { protects: ['right_arm','right_leg'],   reduction: 0.75 },
    full_turtle:   { protects: ['chest','stomach'],         reduction: 0.70, special: 'next_round_hit_penalty' },
    weave_left:    { protects: ['head','left_arm'],         reduction: 0.80, special: 'attacker_miss_20' },
    weave_right:   { protects: ['head','right_arm'],        reduction: 0.80, special: 'attacker_miss_20' },
    counter_stance:{ protects: ['any'],                     reduction: 0.60, special: 'counter_25' },
    no_block:      { protects: [],                          reduction: 0.00, special: 'attacker_bonus_10' },
};
const DEFAULT_ATTACK_ZONES = ['chest','chest','solar_plexus','chest','head','solar_plexus','chest','stomach','chest','solar_plexus'];
const DEFAULT_BLOCK_ZONES  = ['cross_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','mid_guard','cross_guard','high_guard'];
const HP_REGEN_RATE     = 0.10;
const HP_REGEN_INTERVAL = 3600;
const MP_MAX            = 240;
const MP_REGEN_AMOUNT   = 10;
const MP_SKILL_UNLOCK   = 60;
const MISSION_SIZES = {
    small:  { mpCost: 20, duration: 600,  label: 'Small',  rewardMult: 1.0 },
    medium: { mpCost: 40, duration: 1200, label: 'Medium', rewardMult: 1.8 },
    large:  { mpCost: 60, duration: 1800, label: 'Large',  rewardMult: 3.0 },
};
const SKILL_DURATION = 5 * 3600;

// ── Class Skills ───────────────────────────────────────────────────────────
const CLASS_SKILLS = {
    warrior: [
        { id:'berserker_rage',   name:'Berserker Rage',   emoji:'🔥', desc:'+25% damage on all attacks for 5h.',                                            effect:'dmg_bonus',       value:0.25 },
        { id:'iron_wall',        name:'Iron Wall',         emoji:'🏰', desc:'+30% block effectiveness on all guards for 5h.',                               effect:'block_bonus',     value:0.30 },
        { id:'war_cry',          name:'War Cry',           emoji:'📯', desc:'Your hits cannot miss for the first 3 rounds for 5h.',                         effect:'no_miss_rounds',  value:3    },
    ],
    mage: [
        { id:'arcane_surge',     name:'Arcane Surge',      emoji:'🌟', desc:'+20% elemental damage for 5h.',                                                effect:'elem_dmg_bonus',  value:0.20 },
        { id:'hex',              name:'Hex',                emoji:'💜', desc:'Reduces opponent elemental resistance by 15% for 5h.',                        effect:'elem_res_debuff', value:0.15 },
        { id:'magic_circle',     name:'Magic Circle',       emoji:'🔵', desc:'Avoid 20% of all incoming hits for 5h.',                                      effect:'magic_dodge',     value:0.20 },
    ],
    rogue: [
        { id:'shadow_step',      name:'Shadow Step',        emoji:'🌑', desc:'+40% dodge chance for 5h.',                                                   effect:'dodge_bonus',     value:0.40 },
        { id:'expose',           name:'Expose',             emoji:'🎯', desc:'+15% crit chance for 5h.',                                                    effect:'crit_bonus',      value:0.15 },
        { id:'venomfang',        name:'Venomfang',          emoji:'🐍', desc:'Each hit poisons for 5 bonus damage per round for 5h.',                       effect:'poison',          value:5    },
    ],
    paladin: [
        { id:'divine_shield',    name:'Divine Shield',      emoji:'✨', desc:'Negate the first hit received each battle round for 5h.',                     effect:'first_hit_negate',value:1    },
        { id:'holy_strike',      name:'Holy Strike',        emoji:'⚡', desc:'+20% damage and heal 10% of damage dealt per hit for 5h.',                    effect:'holy_strike',     value:0.20 },
        { id:'consecrate',       name:'Consecrate',         emoji:'🌿', desc:'Reflect 15% of damage received back to attacker for 5h.',                    effect:'reflect',         value:0.15 },
    ],
};

// ── Global Events ──────────────────────────────────────────────────────────
const ADMIN_EVENT_ACTIVE  = false;
const ADMIN_EVENT_ENDS_AT = 0;
const ADMIN_EVENT_NAME    = '🎉 Grand Festival';
const ADMIN_EVENT_DESC    = 'Everything discounted! Cheaper stats, doubled gold, halved missions, more gems, doubled XP, reduced PvP cooldowns!';
const GLOBAL_EVENTS = [
    { key:'grand_festival', name: ADMIN_EVENT_NAME, desc: ADMIN_EVENT_DESC, duration: 4*3600 },
];

function getActiveEvent() {
    const now = Math.floor(Date.now() / 1000);
    if (ADMIN_EVENT_ACTIVE && ADMIN_EVENT_ENDS_AT > now) {
        return { event_key: 'grand_festival', started_at: ADMIN_EVENT_ENDS_AT - 4*3600, ends_at: ADMIN_EVENT_ENDS_AT };
    }
    return null;
}
function eventHas(bonus) {
    const ev = getActiveEvent();
    if (!ev) return false;
    return ev.event_key === 'grand_festival';
}

// ── Async DB helpers ───────────────────────────────────────────────────────
// Single row
async function dbGet(db, sql, args = []) {
    const r = await db.execute({ sql, args });
    return r.rows[0] ?? null;
}
// All rows
async function dbAll(db, sql, args = []) {
    const r = await db.execute({ sql, args });
    return r.rows;
}
// Run (insert/update/delete)
async function dbRun(db, sql, args = []) {
    return db.execute({ sql, args });
}

// ── MP Regen ───────────────────────────────────────────────────────────────
async function applyMpRegen(db, characterId) {
    const char = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [characterId]);
    if (!char) return;
    const now = Math.floor(Date.now() / 1000);
    const currentHourStart = Math.floor(now / 3600) * 3600;
    const lastRegen = char.mp_last_regen_at || 0;
    const lastRegenHour = Math.floor(lastRegen / 3600) * 3600;
    if (currentHourStart <= lastRegenHour) return;
    const hoursElapsed = Math.max(1, Math.floor((currentHourStart - lastRegenHour) / 3600));
    const currentMp = char.mission_points ?? 0;
    if (currentMp >= MP_MAX) {
        await dbRun(db, 'UPDATE characters SET mp_last_regen_at=? WHERE id=?', [currentHourStart, characterId]);
        return;
    }
    const gained = Math.min(10 * hoursElapsed, MP_MAX - currentMp);
    await dbRun(db, 'UPDATE characters SET mission_points=?, mp_last_regen_at=? WHERE id=?', [currentMp + gained, currentHourStart, characterId]);
}

function getActiveSkills(char) {
    if (!char.active_skills) return {};
    try {
        const skills = JSON.parse(char.active_skills);
        const now = Math.floor(Date.now() / 1000);
        const active = {};
        for (const [id, expiresAt] of Object.entries(skills)) {
            if (expiresAt > now) active[id] = expiresAt;
        }
        return active;
    } catch { return {}; }
}
function hasSkill(activeSkills, skillId) { return !!activeSkills[skillId]; }

// ── HP Regen ───────────────────────────────────────────────────────────────
async function applyHpRegen(db, characterId) {
    const char = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [characterId]);
    if (!char) return;
    const now = Math.floor(Date.now() / 1000);
    const hoursElapsed = Math.floor((now - (char.last_regen_at || 0)) / HP_REGEN_INTERVAL);
    if (hoursElapsed < 1) return;
    const equippedArray = await getEquippedItemsArray(db, characterId);
    const trueHpMax = calcHpMax(char, equippedArray);
    const currentHp = char.hp_current ?? trueHpMax;
    if (currentHp >= trueHpMax) {
        await dbRun(db, 'UPDATE characters SET hp_current=?, last_regen_at=? WHERE id=?', [trueHpMax, now, characterId]);
        return;
    }
    const regenAmount = Math.floor(trueHpMax * HP_REGEN_RATE * hoursElapsed);
    const newHp = Math.min(trueHpMax, currentHp + regenAmount);
    await dbRun(db, 'UPDATE characters SET hp_current=?, last_regen_at=? WHERE id=?', [newHp, now, characterId]);
}

function calcHpMax(char, equippedItems) {
    let base = 50 + ((char.vitality || 10) * 25) + ((char.defense || 0) * 2);
    for (const item of equippedItems) {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (data?.stats?.hp_max) base += data.stats.hp_max;
        } catch {}
    }
    return base;
}
function calcBaseDamage(char, equippedItems) {
    let dmgMin = Math.floor((char.strength || 1) * 0.5);
    let dmgMax = dmgMin + 4;
    for (const item of equippedItems) {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (data?.stats?.dmg_min) dmgMin += data.stats.dmg_min;
            if (data?.stats?.dmg_max) dmgMax += data.stats.dmg_max;
        } catch {}
    }
    return { dmgMin, dmgMax };
}

// ── Battle logic (pure — no DB) ────────────────────────────────────────────
function simulateRound(roundNum, attacker, defender, atkZone, blkZone, atkPenalty) {
    const hit = HIT_ZONES[atkZone]  || HIT_ZONES.chest;
    const blk = BLOCK_ZONES[blkZone] || BLOCK_ZONES.cross_guard;
    const atkSkills = attacker.activeSkills || {};
    const defSkills = defender.activeSkills || {};

    let atkHitChance = hit.hitChance + ((attacker.hit_chance || 0) * 0.005);
    if (atkPenalty) atkHitChance *= 0.85;
    if (hasSkill(atkSkills, 'war_cry') && roundNum <= 3) atkHitChance = 1.0;

    const defAgi = defender.agility || 0;
    const atkAgi = attacker.agility || 0;
    let dodgeChance = Math.max(0, Math.min(0.999, (defAgi - atkAgi) / 200));
    if (hasSkill(defSkills, 'shadow_step')) dodgeChance = Math.min(0.999, dodgeChance + 0.40);
    if (hasSkill(defSkills, 'magic_circle')) dodgeChance = Math.min(0.999, dodgeChance + 0.20);

    let atkBonusDmg = (blk.special === 'attacker_bonus_10') ? 1.10 : 1.0;
    if (hasSkill(atkSkills, 'berserker_rage')) atkBonusDmg *= 1.25;
    if (hasSkill(atkSkills, 'holy_strike')) atkBonusDmg *= 1.20;

    let forceMiss = false;
    if (Math.random() < dodgeChance) forceMiss = true;
    if (!forceMiss && (blk.special === 'attacker_miss_20') && Math.random() < 0.20) forceMiss = true;

    let divineNegate = false;
    if (!forceMiss && hasSkill(defSkills, 'divine_shield') && Math.random() < 0.50) divineNegate = true;

    const atkHit = !forceMiss && !divineNegate && Math.random() <= atkHitChance;
    let logLine = '', finalDmg = 0, nextAtkPenalty = false, healBack = 0;

    if (!atkHit) {
        if (divineNegate) logLine = `Round ${roundNum}: ${attacker.name} swings — ✨ DIVINE SHIELD absorbed the blow!`;
        else if (forceMiss && dodgeChance > 0.001) logLine = `Round ${roundNum}: ${attacker.name} swings — DODGED by ${defender.name}`;
        else logLine = `Round ${roundNum}: ${attacker.name} swings — MISS`;
    } else {
        const baseCritChance = (attacker.crit_chance || 0) / 100;
        const critBonus = hasSkill(atkSkills, 'expose') ? 0.15 : 0;
        const isCrit = Math.random() < (baseCritChance + critBonus);
        let rawDmg = isCrit ? attacker.dmgMax
            : attacker.dmgMin + Math.floor(Math.random() * (attacker.dmgMax - attacker.dmgMin + 1));
        rawDmg = Math.floor(rawDmg * hit.dmgMult * atkBonusDmg);

        let elemBonus = attacker.elem_dmg || 0;
        if (hasSkill(atkSkills, 'arcane_surge')) elemBonus = Math.floor(elemBonus * 1.20);
        if (hasSkill(atkSkills, 'hex') && elemBonus > 0) elemBonus = Math.floor(elemBonus * 1.15);
        rawDmg += elemBonus;

        const blockCovers = blk.protects.includes(atkZone) || blk.protects.includes('any');
        const blockFails  = Math.random() < 0.01;
        if (blockCovers && !blockFails) {
            let reduction = blk.reduction;
            if (hasSkill(defSkills, 'iron_wall')) reduction = Math.min(0.99, reduction + 0.30);
            finalDmg = Math.max(0, Math.floor(rawDmg * (1 - reduction)));
            const critTag = isCrit ? ' ⚡CRIT' : '';
            logLine = finalDmg === 0
                ? `Round ${roundNum}: ${attacker.name} hits${critTag} — BLOCKED (${rawDmg} absorbed)`
                : `Round ${roundNum}: ${attacker.name} hits${critTag} — BLOCKED partially — ${finalDmg} slips through`;
        } else {
            finalDmg = rawDmg;
            logLine = `Round ${roundNum}: ${attacker.name} lands a hit${isCrit ? ' ⚡ CRITICAL HIT!' : ''} — ${finalDmg} damage`;
        }

        if (hasSkill(atkSkills, 'venomfang')) { finalDmg += 5; logLine += ' ☠️+5 poison'; }
        if (hasSkill(atkSkills, 'holy_strike') && finalDmg > 0) {
            healBack = Math.floor(finalDmg * 0.10); logLine += ` 💚+${healBack} heal`;
        }
        if (hasSkill(defSkills, 'consecrate') && finalDmg > 0) {
            const reflect = Math.floor(finalDmg * 0.15);
            logLine += ` 🌿 ${reflect} reflected`;
            return { logLine, damageDealt: finalDmg, damageCounter: reflect, nextAtkPenalty, healBack };
        }
        if (blk.special === 'next_round_hit_penalty') nextAtkPenalty = true;
        if (blk.special === 'counter_25' && Math.random() < 0.25) {
            const counterDmg = Math.floor(finalDmg * 0.50);
            logLine += ` — COUNTERED for ${counterDmg}`;
            return { logLine, damageDealt: finalDmg, damageCounter: counterDmg, nextAtkPenalty, healBack };
        }
    }
    return { logLine, damageDealt: atkHit ? finalDmg : 0, damageCounter: 0, nextAtkPenalty, healBack };
}

function runBattle(fighterA, fighterB) {
    const log = [];
    let hpA = fighterA.hp, hpB = fighterB.hp;
    let penaltyA = false, penaltyB = false;
    let totalDmgToA = 0, totalDmgToB = 0;

    log.push(`⚔️  ${fighterA.name}  vs  ${fighterB.name}`);
    const skA = Object.keys(fighterA.activeSkills || {});
    const skB = Object.keys(fighterB.activeSkills || {});
    if (skA.length) log.push(`✨ ${fighterA.name}'s active skills: ${skA.join(', ')}`);
    if (skB.length) log.push(`✨ ${fighterB.name}'s active skills: ${skB.join(', ')}`);
    log.push('---');

    for (let round = 1; round <= 10; round++) {
        const atkZoneA = fighterA.attackZones[round-1] || 'chest';
        const blkZoneA = fighterA.blockZones[round-1]  || 'cross_guard';
        const atkZoneB = fighterB.attackZones[round-1] || 'chest';
        const blkZoneB = fighterB.blockZones[round-1]  || 'cross_guard';
        const resA = simulateRound(round, fighterA, fighterB, atkZoneA, blkZoneB, penaltyA);
        const resB = simulateRound(round, fighterB, fighterA, atkZoneB, blkZoneA, penaltyB);
        const dmgToB = resA.damageDealt;
        const dmgToA = resB.damageDealt + resA.damageCounter + resB.damageCounter;
        totalDmgToA += dmgToA;
        totalDmgToB += dmgToB;
        hpA = Math.max(0, hpA - dmgToA + (resA.healBack || 0));
        hpB = Math.max(0, hpB - dmgToB + (resB.healBack || 0));
        log.push(resA.logLine);
        log.push(resB.logLine);
        penaltyA = resB.nextAtkPenalty;
        penaltyB = resA.nextAtkPenalty;
        if (hpA <= 0 || hpB <= 0) {
            if (hpA <= 0 && hpB <= 0) log.push(`Round ${round}: Both fighters fall simultaneously!`);
            else if (hpA <= 0) log.push(`Round ${round}: ${fighterA.name} has fallen!`);
            else log.push(`Round ${round}: ${fighterB.name} has fallen!`);
            break;
        }
        if (round < 10) log.push('---');
    }
    log.push('---');
    let winnerId;
    if (hpA <= 0 && hpB <= 0) winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
    else if (hpA <= 0) winnerId = fighterB.id;
    else if (hpB <= 0) winnerId = fighterA.id;
    else {
        winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
        log.push(`After 10 rounds: ${fighterA.name} dealt ${totalDmgToB} · ${fighterB.name} dealt ${totalDmgToA}`);
    }
    log.push(`🏆 ${winnerId === fighterA.id ? fighterA.name : fighterB.name} wins!`);
    return { log, winnerId, hpRemainingA: hpA, hpRemainingB: hpB, totalDmgToA, totalDmgToB };
}

function buildNpc(difficulty, playerLevel) {
    const configs = {
        easy:   { hpBase:40, hpScale:3,  atkMin:3,  atkMax:7,  agi:5,  name:'Weak Foe' },
        medium: { hpBase:60, hpScale:5,  atkMin:6,  atkMax:12, agi:10, name:'Seasoned Foe' },
        hard:   { hpBase:80, hpScale:8,  atkMin:10, atkMax:18, agi:15, name:'Elite Foe' },
    };
    const cfg = configs[difficulty] || configs.easy;
    const npcAttack = {
        easy:   ['chest','chest','chest','solar_plexus','chest','chest','stomach','chest','solar_plexus','chest'],
        medium: ['chest','solar_plexus','head','chest','solar_plexus','chest','throat','solar_plexus','chest','head'],
        hard:   ['head','solar_plexus','chest','heart','head','solar_plexus','throat','chest','heart','solar_plexus'],
    };
    const npcBlock = {
        easy:   ['cross_guard','cross_guard','cross_guard','mid_guard','cross_guard','cross_guard','mid_guard','cross_guard','cross_guard','mid_guard'],
        medium: ['cross_guard','high_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','high_guard','mid_guard'],
        hard:   ['cross_guard','high_guard','counter_stance','cross_guard','weave_left','high_guard','counter_stance','mid_guard','cross_guard','weave_right'],
    };
    return {
        id: -1, name: cfg.name,
        hp: cfg.hpBase + (playerLevel * cfg.hpScale),
        dmgMin: cfg.atkMin, dmgMax: cfg.atkMax, agility: cfg.agi,
        attackZones: npcAttack[difficulty] || npcAttack.easy,
        blockZones:  npcBlock[difficulty]  || npcBlock.easy,
    };
}

// ── Item generation ────────────────────────────────────────────────────────
const ITEM_GENERATORS = {
    weapon: {
        namePrefixes: ['Iron','Steel','Bronze','Silver','Golden','Crystal','Obsidian','Dragon','Mythril','Adamant'],
        nameSuffixes: ['Sword','Blade','Axe','Dagger','Bow','Staff','Hammer','Spear','Mace','Scythe'],
        emojis: ['⚔️','🗡️','🪓','🏹','🪄','🔨','🔪','⚒️'],
        baseStats: { dmg_min:{min:2,max:4,scale:1.2}, dmg_max:{min:4,max:7,scale:1.3}, strength:{min:0,max:2,scale:0.5} },
        tier3Stats: { agility:{min:0,max:2,scale:0.4} },
        tier5Stats: { crit_chance:{min:1,max:5,scale:0.3}, hit_chance:{min:1,max:4,scale:0.2} },
        classBonus: { warrior:{strength:1.2}, rogue:{agility:1.2}, mage:{magic:1.2}, paladin:{strength:1.1,magic:0.8} }
    },
    armor: {
        namePrefixes: ['Leather','Chain','Plate','Scale','Crystal','Obsidian','Dragon','Mythril','Adamant'],
        nameSuffixes: ['Armor','Vest','Cuirass','Breastplate','Hauberk','Mail','Plate'],
        emojis: ['🛡️','🧥','🥼','👕','🦺'],
        baseStats: { defense:{min:1,max:3,scale:1.3}, hp_max:{min:5,max:15,scale:1.4}, strength:{min:0,max:1,scale:0.2} },
        tier3Stats: { agility:{min:0,max:1,scale:0.2} },
        tier5Stats: { elem_resist:{min:1,max:8,scale:0.4} },
        classBonus: { warrior:{defense:1.2,hp_max:1.1}, paladin:{defense:1.2,hp_max:1.1}, rogue:{agility:0.2}, mage:{magic:0.2} }
    },
    accessory: {
        namePrefixes: ['Iron','Silver','Golden','Crystal','Ruby','Sapphire','Emerald','Diamond','Mythril'],
        nameSuffixes: ['Ring','Amulet','Necklace','Bracelet','Circlet','Brooch','Talisman'],
        emojis: ['💍','📿','👑','🔮','✨'],
        baseStats: { strength:{min:0,max:2,scale:0.4}, defense:{min:0,max:1,scale:0.3}, hp_max:{min:5,max:20,scale:0.8} },
        tier3Stats: { agility:{min:0,max:2,scale:0.4}, magic:{min:0,max:2,scale:0.4} },
        tier5Stats: { crit_chance:{min:1,max:6,scale:0.4}, hit_chance:{min:1,max:5,scale:0.3} },
        classBonus: { warrior:{strength:1.2,defense:1.1}, rogue:{agility:1.2,strength:0.8}, mage:{magic:1.3,hp_max:0.8}, paladin:{defense:1.1,magic:1.1} }
    },
    consumable: {
        namePrefixes: ['Small','Medium','Large','Greater','Superior','Divine'],
        nameSuffixes: ['Health Potion','Mana Potion','Strength Elixir','Agility Draught','Defense Tonic'],
        emojis: ['🧪','⚗️','🧴','💊'],
        effects: [
            {type:'heal',baseValue:50,scale:1.5},
            {type:'temp_stat',stat:'strength',baseValue:2,scale:1.2,duration:1800},
            {type:'temp_stat',stat:'agility',baseValue:2,scale:1.2,duration:1800},
            {type:'temp_stat',stat:'defense',baseValue:2,scale:1.2,duration:1800},
            {type:'xp',baseValue:50,scale:1.5}
        ]
    }
};

const POTION_CATALOGUE = [
    { id:'potion_minor_hp',    name:'Minor Health Potion',     emoji:'🧪', level:1,  price:80,   priceType:'gold', desc:'Restores 30 HP.',          effect:{ type:'heal', value:30  }, consumable:true, category:'consumable' },
    { id:'potion_minor_str',   name:'Minor Strength Draught',  emoji:'⚗️', level:1,  price:120,  priceType:'gold', desc:'+2 Strength for session.',  effect:{ type:'temp_stat', stat:'strength', value:2 }, consumable:true, category:'consumable' },
    { id:'potion_minor_def',   name:'Minor Defense Tonic',     emoji:'🧴', level:1,  price:120,  priceType:'gold', desc:'+2 Defense for session.',   effect:{ type:'temp_stat', stat:'defense',  value:2 }, consumable:true, category:'consumable' },
    { id:'potion_light_hp',    name:'Light Health Potion',     emoji:'🧪', level:5,  price:200,  priceType:'gold', desc:'Restores 80 HP.',          effect:{ type:'heal', value:80  }, consumable:true, category:'consumable' },
    { id:'potion_light_agi',   name:'Light Agility Draught',   emoji:'⚗️', level:5,  price:250,  priceType:'gold', desc:'+3 Agility for session.',  effect:{ type:'temp_stat', stat:'agility',  value:3 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_hp', name:'Health Potion',           emoji:'🧪', level:10, price:450,  priceType:'gold', desc:'Restores 180 HP.',         effect:{ type:'heal', value:180 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_str',name:'Strength Elixir',         emoji:'⚗️', level:10, price:550,  priceType:'gold', desc:'+5 Strength for session.', effect:{ type:'temp_stat', stat:'strength', value:5 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_mag',name:'Mage\'s Focus Tonic',     emoji:'🔮', level:10, price:550,  priceType:'gold', desc:'+5 Magic for session.',    effect:{ type:'temp_stat', stat:'magic',    value:5 }, consumable:true, category:'consumable' },
    { id:'potion_greater_hp',  name:'Greater Health Potion',   emoji:'🧪', level:20, price:900,  priceType:'gold', desc:'Restores 400 HP.',         effect:{ type:'heal', value:400 }, consumable:true, category:'consumable' },
    { id:'potion_greater_def', name:'Greater Defense Tonic',   emoji:'🧴', level:20, price:1100, priceType:'gold', desc:'+8 Defense for session.',  effect:{ type:'temp_stat', stat:'defense',  value:8 }, consumable:true, category:'consumable' },
    { id:'potion_greater_agi', name:'Greater Agility Draught', emoji:'⚗️', level:20, price:1100, priceType:'gold', desc:'+8 Agility for session.',  effect:{ type:'temp_stat', stat:'agility',  value:8 }, consumable:true, category:'consumable' },
    { id:'potion_superior_hp', name:'Superior Health Potion',  emoji:'🧪', level:35, price:2200, priceType:'gold', desc:'Restores 900 HP.',         effect:{ type:'heal', value:900 }, consumable:true, category:'consumable' },
    { id:'potion_superior_str',name:'Superior Strength Elixir',emoji:'⚗️', level:35, price:2800, priceType:'gold', desc:'+15 Strength for session.',effect:{ type:'temp_stat', stat:'strength', value:15 }, consumable:true, category:'consumable' },
    { id:'potion_superior_mag',name:'Superior Mage\'s Focus',  emoji:'🔮', level:35, price:2800, priceType:'gold', desc:'+15 Magic for session.',   effect:{ type:'temp_stat', stat:'magic',    value:15 }, consumable:true, category:'consumable' },
    { id:'potion_full_elixir', name:'Full Elixir',              emoji:'💊', level:1,  price:5,    priceType:'gems', desc:'Fully restores all HP.',   effect:{ type:'heal_full', value:1 }, consumable:true, category:'consumable' },
];
function getPotionsForLevel(playerLevel) { return POTION_CATALOGUE.filter(p => playerLevel >= p.level); }
function calculateBackendItemPrice(item, level) {
    const basePrice = 50 + (level * 30);
    const statMultiplier = Object.values(item.stats || {}).reduce((sum, val) => sum + Math.max(0, val), 1);
    return Math.floor(basePrice * statMultiplier * (item.tier || 1));
}
function generateBackendRandomItem(level, type) {
    const generator = ITEM_GENERATORS[type];
    if (!generator) return null;
    const tier = Math.min(5, Math.ceil(level / 10) + 1);
    const stats = {};
    function rollStat(statConfig, lvl) {
        const scaledMin = Math.floor(statConfig.min + (lvl * statConfig.scale * 0.3));
        const scaledMax = Math.floor(statConfig.max + (lvl * statConfig.scale * 0.5));
        let value = scaledMin + Math.floor(Math.random() * Math.max(1, scaledMax - scaledMin + 1));
        value = Math.floor(value * (0.8 + Math.random() * 0.4));
        if (statConfig.min !== undefined) value = Math.max(statConfig.min, value);
        return value;
    }
    if (type !== 'consumable' && generator.baseStats) {
        for (const [statName, statConfig] of Object.entries(generator.baseStats)) {
            const v = rollStat(statConfig, level);
            if (statName.includes('dmg_min') && v < 1) { stats[statName] = 1; continue; }
            if (statName.includes('dmg_max') && v < 2) { stats[statName] = 2; continue; }
            stats[statName] = v;
        }
        if (tier >= 3 && generator.tier3Stats) {
            for (const [statName, statConfig] of Object.entries(generator.tier3Stats)) {
                if (Math.random() < 0.6) stats[statName] = rollStat(statConfig, level);
            }
        }
        if (tier >= 5 && generator.tier5Stats) {
            for (const [statName, statConfig] of Object.entries(generator.tier5Stats)) {
                if (Math.random() < 0.5) stats[statName] = rollStat(statConfig, level);
            }
        }
    }
    const prefix = generator.namePrefixes[Math.floor(Math.random() * generator.namePrefixes.length)];
    const suffix = generator.nameSuffixes[Math.floor(Math.random() * generator.nameSuffixes.length)];
    const name = `${prefix} ${suffix}`;
    const emoji = generator.emojis[Math.floor(Math.random() * generator.emojis.length)];
    const item = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
    name, emoji, tier, level,
    img: `/images/assets/${imgSlug}.png`,
        desc: `A ${name.toLowerCase()} for level ${level} adventurers.`,
        stats,
        slot: type === 'weapon' ? 'weapon' : type === 'armor' ? 'armor' : 'accessory',
        category: type, price: 0,
        quality: tier >= 5 ? (Math.random() > 0.5 ? 'legendary' : 'rare') :
                 tier >= 3 ? (Math.random() > 0.7 ? 'rare' : 'common') : 'common'
    };
    if (type === 'consumable') {
        item.price = 20 + level * 15;
        item.consumable = true;
        if (generator.effects) {
            const effectTemplate = generator.effects[Math.floor(Math.random() * generator.effects.length)];
            item.effect = { ...effectTemplate };
            if (item.effect.type === 'heal') item.effect.value = Math.floor(effectTemplate.baseValue * (1 + level * 0.2));
            else if (item.effect.type === 'xp') item.effect.value = Math.floor(effectTemplate.baseValue * (1 + level * 0.3));
            else if (item.effect.type === 'temp_stat') item.effect.value = Math.floor(effectTemplate.baseValue + level * 0.3);
        }
    } else {
        item.price = calculateBackendItemPrice(item, level);
    }
    if (Math.random() < 0.1 && type !== 'consumable') {
        const classes = ['warrior','mage','rogue','paladin'];
        item.classes = [classes[Math.floor(Math.random() * classes.length)]];
    }
    if (type === 'weapon' && tier >= 3 && Math.random() < (tier >= 5 ? 0.40 : 0.15)) {
        const elements = ['pyro','water','wind','electro'];
        stats.elem_dmg_type = elements[Math.floor(Math.random() * elements.length)];
        stats.elem_dmg = Math.floor(level * 0.5 + Math.random() * level);
    }
    return item;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function withTrainingStatus(char) {
    const now = Math.floor(Date.now() / 1000);
    const trainingDone   = char.training_stat && char.training_ends_at && now >= char.training_ends_at;
    const trainingActive = char.training_stat && char.training_ends_at && now < char.training_ends_at;
    return { ...char, trainingDone:!!trainingDone, trainingActive:!!trainingActive,
        trainingSecondsLeft: trainingActive ? char.training_ends_at - now : 0 };
}
function withUpgradeCosts(char) {
    const costs = {};
    ['strength','defense','agility','magic','vitality','hit_chance','crit_chance'].forEach(s => { costs[s] = upgradeCost(s, char[s] || 0, char.class); });
    return { ...char, upgradeCosts: costs };
}

async function getEquippedItems(db, charId) {
    const eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id = ?', [charId]);
    if (!eq) return {};
    const slots = {};
    for (const slot of ['weapon','armor','boots','amulet','ring','accessory']) {
        const itemId = eq[`${slot}_id`];
        if (itemId) {
            const inv = await dbGet(db, 'SELECT * FROM inventory WHERE id = ?', [itemId]);
            if (inv) slots[slot] = { ...JSON.parse(inv.item_data), inventoryId: inv.id };
        }
    }
    return slots;
}

async function getEquippedItemsArray(db, charId) {
    const eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id = ?', [charId]);
    if (!eq) return [];
    const items = [];
    for (const slot of ['weapon','armor','boots','amulet','ring','accessory']) {
        const itemId = eq[`${slot}_id`];
        if (itemId) {
            const inv = await dbGet(db, 'SELECT * FROM inventory WHERE id = ?', [itemId]);
            if (inv) items.push(inv);
        }
    }
    return items;
}

async function getInventoryMaterials(db, charId) {
    const items = await dbAll(db, `SELECT * FROM inventory WHERE char_id = ? AND item_type IN ('raw_mat','component')`, [charId]);
    const map = {};
    items.forEach(i => {
        const d = JSON.parse(i.item_data);
        const key = d.id;
        if (!map[key]) map[key] = { ...d, qty: 0, invId: i.id };
        map[key].qty += d.qty || 1;
    });
    return map;
}

async function buildCharacterResponse(char, db) {
    const equippedObj   = await getEquippedItems(db, char.id);
    const equippedArray = await getEquippedItemsArray(db, char.id);
    const hpMax     = calcHpMax(char, equippedArray);
    const hpCurrent = Math.min(char.hp_current ?? hpMax, hpMax);
    const withCosts = withUpgradeCosts({ ...char, hp_max: hpMax, hp_current: hpCurrent });
    const withTrain = withTrainingStatus(withCosts);
    const now = Math.floor(Date.now() / 1000);
    const lastBattle = char.last_battle_at || 0;
    const battleCooldownRemaining = (lastBattle + 600 > now) ? (lastBattle + 600 - now) : 0;

    const rawSkills = char.active_skills ? (() => { try { return JSON.parse(char.active_skills); } catch { return {}; } })() : {};
    const activeSkills = {};
    for (const [id, exp] of Object.entries(rawSkills)) { if (exp > now) activeSkills[id] = exp; }

    const skillLastUsed = char.skill_last_used ? (() => { try { return JSON.parse(char.skill_last_used); } catch { return {}; } })() : {};

    const todayStart2 = Math.floor(now / 86400) * 86400;
    const dailyMpSpent = (char.daily_mp_reset_at || 0) >= todayStart2 ? (char.daily_mp_spent || 0) : 0;
    const skillsUnlocked = dailyMpSpent >= MP_SKILL_UNLOCK;
    const activeEvent = getActiveEvent();
    const eventInfo = activeEvent ? { ...GLOBAL_EVENTS[0], ends_at: activeEvent.ends_at } : null;

    return {
        ...withTrain,
        vitality:     char.vitality    || 10,
        gems:         char.gems        || 0,
        hp_max:       hpMax,
        hp_current:   hpCurrent,
        hit_chance:   char.hit_chance  || 0,
        crit_chance:  char.crit_chance || 0,
        mission_points: Math.min(MP_MAX, char.mission_points ?? 0),
        mp_max:       MP_MAX,
        daily_mp_spent: dailyMpSpent,
        skills_unlocked: skillsUnlocked,
        active_skills: activeSkills,
        skill_last_used: skillLastUsed,
        class_skills: CLASS_SKILLS[char.class] || [],
        attack_zones: char.attack_zones || null,
        block_zones:  char.block_zones  || null,
        equipped:     equippedObj,
        last_battle_at: char.last_battle_at || 0,
        battle_cooldown_remaining: battleCooldownRemaining,
        active_event: eventInfo,
    };
}

// ── Character creation ─────────────────────────────────────────────────────
router.post('/character', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { name, class: characterClass } = req.body;
        const user = await dbGet(db, 'SELECT id FROM users WHERE username = ?', [req.user.username]);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const userId = user.id;
        const existing = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [userId]);
        if (existing) return res.status(400).json({ error: 'Character already exists' });
        await dbRun(db, `
            INSERT INTO characters (
                user_id, name, class, level, xp, gold,
                strength, defense, agility, magic, vitality,
                hp_max, hp_current, wins, losses,
                training_stat, training_ends_at,
                total_gold_earned, total_gold_lost,
                gems, total_gems_earned, total_gems_spent,
                location, travel_target, travel_end_time,
                elem_resist_pyro, elem_resist_water, elem_resist_wind, elem_resist_electro
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, name, characterClass, 1, 0, 50000, 10, 10, 10, 10, 10, 100, 100, 0, 0, null, null, 0, 0, 50000, 0, 0, 'forest', null, 0, 0, 0, 0, 0]);
        const character = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [userId]);
        res.json(character);
    } catch (e) {
        console.error('❌ Character creation error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Get character ──────────────────────────────────────────────────────────
router.get('/character', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character found' });
        await applyHpRegen(db, char.id);
        await applyMpRegen(db, char.id);
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json(await buildCharacterResponse(freshChar, db));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Upgrade ────────────────────────────────────────────────────────────────
router.post('/upgrade', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { stat } = req.body;
        if (!['strength','defense','agility','magic','vitality','hit_chance','crit_chance'].includes(stat))
            return res.status(400).json({ error: 'Invalid stat' });
        let cost = upgradeCost(stat, char[stat] || 0, char.class);
        if (eventHas('discount_stats')) cost = Math.max(1, Math.floor(cost * 0.70));
        if (char.gold < cost) return res.status(400).json({ error: `Need ${cost} gold, have ${char.gold}.` });
        await dbRun(db, `UPDATE characters SET ${stat}=${stat}+1, gold=gold-? WHERE user_id=?`, [cost, req.user.userId]);
        if (stat === 'vitality') {
            await dbRun(db, 'UPDATE characters SET hp_current=hp_current+25 WHERE user_id=?', [req.user.userId]);
        }
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        res.json({ message:`+1 ${stat}! Spent ${cost} gold.`, character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Training ───────────────────────────────────────────────────────────────
router.post('/train', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const now = Math.floor(Date.now() / 1000);
        if (char.training_stat && char.training_ends_at && now >= char.training_ends_at) {
            await dbRun(db, `UPDATE characters SET ${char.training_stat}=${char.training_stat}+?,training_stat=NULL,training_ends_at=NULL WHERE id=?`, [TRAINING_GAIN, char.id]);
        }
        const ref = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        if (ref.training_stat && now < ref.training_ends_at)
            return res.status(400).json({ error: `Already training. ${ref.training_ends_at - now}s left.` });
        const { stat } = req.body;
        if (!['strength','defense','agility','magic'].includes(stat))
            return res.status(400).json({ error: 'Invalid stat' });
        await dbRun(db, 'UPDATE characters SET training_stat=?,training_ends_at=? WHERE id=?', [stat, now+TRAINING_DURATION_SEC, char.id]);
        res.json({ message:`Training ${stat}!`, endsAt: now+TRAINING_DURATION_SEC, stat });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/train/collect', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char || !char.training_stat) return res.status(400).json({ error: 'Not training' });
        const now = Math.floor(Date.now() / 1000);
        if (now < char.training_ends_at) return res.status(400).json({ error: `${char.training_ends_at - now}s remaining.` });
        await dbRun(db, `UPDATE characters SET ${char.training_stat}=${char.training_stat}+?,training_stat=NULL,training_ends_at=NULL WHERE id=?`, [TRAINING_GAIN, char.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json({ message:`+${TRAINING_GAIN} ${char.training_stat}!`, character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Loadout ────────────────────────────────────────────────────────────────
router.post('/loadout', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { attackZones, blockZones } = req.body;
        if (!Array.isArray(attackZones) || attackZones.length !== 10) return res.status(400).json({ error: 'attackZones must be array of 10' });
        if (!Array.isArray(blockZones)  || blockZones.length  !== 10) return res.status(400).json({ error: 'blockZones must be array of 10' });
        for (const z of attackZones) { if (!HIT_ZONES[z])   return res.status(400).json({ error: `Invalid attack zone: ${z}` }); }
        for (const z of blockZones)  { if (!BLOCK_ZONES[z]) return res.status(400).json({ error: `Invalid block zone: ${z}` }); }
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        await dbRun(db, 'UPDATE characters SET attack_zones=?, block_zones=? WHERE id=?', [JSON.stringify(attackZones), JSON.stringify(blockZones), char.id]);
        res.json({ message: 'Loadout saved.' });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Missions ───────────────────────────────────────────────────────────────
router.get('/missions', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const active = await dbGet(db, 'SELECT * FROM active_missions WHERE character_id=?', [char.id]);
        const unlockedZones = Object.entries(ZONES)
            .filter(([,z]) => char.level >= z.minLevel)
            .map(([key, z]) => ({ key, ...z }));
        res.json({ active: active ? { ...active, mat_drops: JSON.parse(active.mat_drops || '[]') } : null, unlockedZones, charLevel: char.level });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/missions/start', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { zoneId, spotId, missionName: sentName, size: reqSize } = req.body;
        const character = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        if (character.location !== zoneId) return res.status(400).json({ error: 'You must be at this zone to start missions' });

        const hpCurrent = character.hp_current ?? character.hp_max;
        if (hpCurrent <= 0) return res.status(400).json({ error: 'Out of HP. Wait for regeneration.' });

        const now = Math.floor(Date.now() / 1000);
        const lastBattle = character.last_battle_at || 0;
        if (lastBattle + 600 > now) {
            const secs = (lastBattle + 600) - now;
            return res.status(400).json({ error: `Cannot start a mission so soon after battle. Wait ${secs < 60 ? secs+'s' : Math.ceil(secs/60)+'m'}.` });
        }

        const existing = await dbGet(db, 'SELECT * FROM active_missions WHERE character_id = ?', [character.id]);
        if (existing) return res.status(400).json({ error: 'You already have an active mission' });

        const sizeKey = ['small','medium','large'].includes(reqSize) ? reqSize : 'small';
        const sizeConf = MISSION_SIZES[sizeKey];

        const todayStart = Math.floor(now / 86400) * 86400;
        const lastReset = character.daily_mp_reset_at || 0;
        let dailyMpSpent = character.daily_mp_spent || 0;
        if (lastReset < todayStart) {
            dailyMpSpent = 0;
            await dbRun(db, 'UPDATE characters SET daily_mp_spent=0, daily_mp_reset_at=? WHERE id=?', [todayStart, character.id]);
        }

        await applyMpRegen(db, character.id);
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [character.id]);
        const currentMp = freshChar.mission_points ?? 0;
        if (currentMp < sizeConf.mpCost)
            return res.status(400).json({ error: `Not enough MP. ${sizeConf.label} mission costs ${sizeConf.mpCost} MP, you have ${currentMp}.` });

        const zone = ZONES[zoneId];
        const spot = zone?.spots.find(s => s.id === spotId);
        if (!spot) return res.status(404).json({ error: 'Mission spot not found' });

        await dbRun(db, 'UPDATE characters SET mission_points=mission_points-?, daily_mp_spent=daily_mp_spent+? WHERE id=?',
            [sizeConf.mpCost, sizeConf.mpCost, character.id]);

        const difficulty = spot.difficulty;
        const [minGold, maxGold] = zone.payoutBase[difficulty];
        const [minXp, maxXp]     = zone.xpBase[difficulty];
        const goldReward = Math.floor((Math.floor(Math.random() * (maxGold - minGold + 1)) + minGold) * sizeConf.rewardMult);
        const xpReward   = Math.floor((Math.floor(Math.random() * (maxXp   - minXp   + 1)) + minXp)   * sizeConf.rewardMult);

        const missionList = spot.missions.map(m => typeof m === 'string' ? m : m.name);
        const missionName = (sentName && missionList.includes(sentName))
            ? sentName : missionList[Math.floor(Math.random() * missionList.length)];

        const baseDuration = sizeConf.duration;
        const duration = eventHas('short_missions') ? Math.max(30, Math.floor(baseDuration / 2)) : baseDuration;

        const insertResult = await dbRun(db, `
            INSERT INTO active_missions (character_id, zone, spot, spot_name, mission_name, difficulty, gold_reward, xp_reward, started_at, ends_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [character.id, zoneId, spotId, spot.name, missionName, difficulty, goldReward, xpReward, now, now + duration]);

        res.json({
            success: true,
            mission: {
                id: Number(insertResult.lastInsertRowid), zone: zoneId, spot: spotId, spot_name: spot.name,
                mission_name: missionName, missionName, difficulty, size: sizeKey,
                gold_reward: goldReward, xp_reward: xpReward,
                started_at: now, ends_at: now + duration, duration
            }
        });
    } catch (e) {
        console.error('Mission start error:', e);
        res.status(500).json({ error: e?.message || String(e) });
    }
});

router.post('/missions/collect', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!character) return res.status(404).json({ error: 'Character not found' });

        await applyHpRegen(db, character.id);
        await applyMpRegen(db, character.id);
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [character.id]);

        const mission = await dbGet(db, 'SELECT * FROM active_missions WHERE character_id = ?', [character.id]);
        if (!mission) return res.status(400).json({ error: 'No active mission' });
        const now = Math.floor(Date.now() / 1000);
        if (now < mission.ends_at) return res.status(400).json({ error: 'Mission not yet complete' });

        const isEvent = eventHas('grand_festival');

        const equippedArray = await getEquippedItemsArray(db, freshChar.id);
        const hpMax     = calcHpMax(freshChar, equippedArray);
        const hpCurrent = freshChar.hp_current ?? hpMax;
        const { dmgMin, dmgMax } = calcBaseDamage(freshChar, equippedArray);
        const charActiveSkills = getActiveSkills(freshChar);
        const playerFighter = {
            id: freshChar.id, name: freshChar.name,
            hp: hpCurrent, dmgMin, dmgMax, agility: freshChar.agility || 0,
            hit_chance: freshChar.hit_chance || 0,
            crit_chance: freshChar.crit_chance || 0,
            activeSkills: charActiveSkills,
            attackZones: JSON.parse(freshChar.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones:  JSON.parse(freshChar.block_zones  || 'null') || DEFAULT_BLOCK_ZONES,
        };

        const npc = buildNpc(mission.difficulty, freshChar.level);
        npc.activeSkills = {};
        const battle = runBattle(playerFighter, npc);
        const playerWon = battle.winnerId === freshChar.id;

        let goldEarned = playerWon ? mission.gold_reward : Math.floor(mission.gold_reward * 0.10);
        let xpEarned   = playerWon ? mission.xp_reward   : Math.floor(mission.xp_reward   * 0.30);
        goldEarned = Math.floor(goldEarned * (1 + freshChar.level * 0.05));
        xpEarned   = Math.floor(xpEarned   * (1 + freshChar.level * 0.10));
        if (isEvent) goldEarned *= 2;
        if (isEvent) xpEarned   *= 2;

        const gemChance = isEvent ? 0.15 : 0.05;
        let gemsFound = 0;
        if (playerWon && Math.random() < gemChance) gemsFound = 1;

        const newHp = Math.max(0, battle.hpRemainingA);
        let newXp = (freshChar.xp || 0) + xpEarned, newLevel = freshChar.level, leveledUp = false;
        while (newXp >= LEVEL_XP(newLevel)) { newXp -= LEVEL_XP(newLevel); newLevel++; leveledUp = true; }
        const newWins   = freshChar.wins   + (playerWon ? 1 : 0);
        const newLosses = freshChar.losses + (playerWon ? 0 : 1);

        await dbRun(db, `UPDATE characters SET xp=?,gold=gold+?,gems=gems+?,level=?,wins=?,losses=?,hp_current=?,total_gold_earned=total_gold_earned+? WHERE id=?`,
            [newXp, goldEarned, gemsFound, newLevel, newWins, newLosses, newHp, goldEarned, freshChar.id]);
        await dbRun(db, 'DELETE FROM active_missions WHERE character_id = ?', [freshChar.id]);

        // Material drops
        const drops = [];
        const matsByZone = {
            forest:    [{id:'rough_wood',emoji:'🪵',name:'Rough Wood'},{id:'wolf_pelt',emoji:'🐺',name:'Wolf Pelt'}],
            swamp:     [{id:'swamp_crystal',emoji:'💎',name:'Swamp Crystal'},{id:'poison_gland',emoji:'🐸',name:'Poison Gland'}],
            mountains: [{id:'iron_ore',emoji:'⛏️',name:'Iron Ore'},{id:'frost_herb',emoji:'❄️',name:'Frost Herb'}],
            ruins:     [{id:'ancient_rune',emoji:'🔮',name:'Ancient Rune'},{id:'bone_dust',emoji:'💀',name:'Bone Dust'}],
            dark_city: [{id:'shadow_essence',emoji:'🌑',name:'Shadow Essence'},{id:'dark_shard',emoji:'🖤',name:'Dark Shard'}],
        };
        const mats = matsByZone[mission.zone] || matsByZone.forest;
        const dropChance = playerWon ? 0.6 : 0.2;
        for (const mat of mats) {
            if (Math.random() < dropChance) {
                const qty = 1 + Math.floor(Math.random() * 3);
                const existing = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='raw_mat' AND json_extract(item_data,'$.id')=?`, [freshChar.id, mat.id]);
                if (existing) {
                    const d = JSON.parse(existing.item_data); d.qty = (d.qty || 1) + qty;
                    await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), existing.id]);
                } else {
                    await dbRun(db, `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)`, [freshChar.id, 'raw_mat', JSON.stringify({ ...mat, qty })]);
                }
                drops.push({ mat: mat.id, qty });
            }
        }

        try {
            await dbRun(db, `INSERT INTO battles (attacker_id,defender_id,winner_id,attacker_name,defender_name,log,fought_at,battle_type,xp_gained,gold_gained) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [freshChar.id, -1, playerWon ? freshChar.id : -1, freshChar.name, npc.name, JSON.stringify(battle.log), now, 'mission', xpEarned, goldEarned]);
        } catch {}
        try {
            const subject = playerWon ? `✅ Mission Report: ${mission.mission_name}` : `💀 Mission Failed: ${mission.mission_name}`;
            const payload = JSON.stringify({ log: battle.log, won: playerWon, goldEarned, xpEarned, type: 'mission', npcName: npc.name });
            await dbRun(db, 'INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)', [freshChar.id, freshChar.id, subject, `BATTLE_REPORT:${payload}`]);
        } catch {}

        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [freshChar.id]);
        res.json({
            success: true, won: playerWon, battleLog: battle.log,
            message: `${playerWon ? 'Victory' : 'Defeated'} — ${goldEarned} gold${gemsFound ? `, 💎 ${gemsFound} gem found!` : ''}, ${xpEarned} XP`,
            goldEarned, xpEarned, gemsFound, leveledUp, newLevel: leveledUp ? newLevel : undefined,
            drops, hpRemaining: newHp,
            activeEvent: isEvent ? GLOBAL_EVENTS[0] : null,
            character: await buildCharacterResponse(updatedChar, db),
        });
    } catch (e) { console.error('Mission collect error:', e); res.status(500).json({ error: e.message }); }
});

router.get('/missions/active', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const mission = await dbGet(db, 'SELECT * FROM active_missions WHERE character_id = ?', [character.id]);
        res.json(mission || null);
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Inventory ──────────────────────────────────────────────────────────────
router.get('/inventory', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const items = await dbAll(db, 'SELECT * FROM inventory WHERE char_id = ? ORDER BY item_type, acquired_at DESC', [char.id]);
        const equipped = await getEquippedItems(db, char.id);
        const equippedIds = Object.values(equipped).map(e => e.inventoryId).filter(Boolean);
        res.json({ items: items.map(i => ({ ...i, item_data: JSON.parse(i.item_data), equipped: equippedIds.includes(i.id) })), equipped });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Forge ──────────────────────────────────────────────────────────────────
router.get('/forge/recipes', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const completedRows = await dbAll(db, 'SELECT DISTINCT zone FROM missions WHERE char_id=? AND collected=1', [char.id]);
        const completedZones = new Set(completedRows.map(r => r.zone));
        const mats = await getInventoryMaterials(db, char.id);
        const components = Object.entries(COMPONENTS).map(([id, comp]) => {
            const canCraft = char.gold >= comp.goldCost && Object.entries(comp.recipe).every(([mat, qty]) => (mats[mat]?.qty || 0) >= qty);
            return { id, ...comp, canCraft, playerMats: mats };
        });
        const equipment = EQUIPMENT_RECIPES.map(rec => {
            const zoneUnlocked = completedZones.has(rec.requiredZone) || char.level >= (ZONES[rec.requiredZone]?.minLevel || 1);
            const canCraft = zoneUnlocked && char.gold >= rec.goldCost && Object.entries(rec.components).every(([comp, qty]) => (mats[comp]?.qty || 0) >= qty);
            return { ...rec, zoneUnlocked, canCraft };
        });
        res.json({ components, equipment, gold: char.gold, mats });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/forge/refine', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { componentId } = req.body;
        const comp = COMPONENTS[componentId];
        if (!comp) return res.status(400).json({ error: 'Unknown component' });
        if (char.gold < comp.goldCost) return res.status(400).json({ error: `Need ${comp.goldCost} gold` });
        const mats = await getInventoryMaterials(db, char.id);
        for (const [mat, qty] of Object.entries(comp.recipe)) {
            if ((mats[mat]?.qty || 0) < qty) return res.status(400).json({ error: `Need ${qty}x ${RAW_MATERIALS[mat]?.name || mat}` });
        }
        for (const [mat, qty] of Object.entries(comp.recipe)) {
            const inv = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='raw_mat' AND json_extract(item_data,'$.id')=?`, [char.id, mat]);
            if (inv) {
                const d = JSON.parse(inv.item_data); d.qty = (d.qty || 1) - qty;
                if (d.qty <= 0) await dbRun(db, 'DELETE FROM inventory WHERE id=?', [inv.id]);
                else await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), inv.id]);
            }
        }
        const existingComp = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='component' AND json_extract(item_data,'$.id')=?`, [char.id, componentId]);
        if (existingComp) {
            const d = JSON.parse(existingComp.item_data); d.qty = (d.qty || 1) + 1;
            await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), existingComp.id]);
        } else {
            await dbRun(db, 'INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)', [char.id, 'component', JSON.stringify({ id:componentId, ...comp, qty:1 })]);
        }
        await dbRun(db, 'UPDATE characters SET gold=gold-? WHERE id=?', [comp.goldCost, char.id]);
        res.json({ message:`Refined: ${comp.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/forge/craft', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { recipeId } = req.body;
        const recipe = EQUIPMENT_RECIPES.find(r => r.id === recipeId);
        if (!recipe) return res.status(400).json({ error: 'Unknown recipe' });
        if (char.gold < recipe.goldCost) return res.status(400).json({ error: `Need ${recipe.goldCost} gold` });
        const completedRows = await dbAll(db, 'SELECT DISTINCT zone FROM missions WHERE char_id=? AND collected=1', [char.id]);
        const completedZones = new Set(completedRows.map(r => r.zone));
        if (!completedZones.has(recipe.requiredZone) && char.level < (ZONES[recipe.requiredZone]?.minLevel || 1))
            return res.status(400).json({ error: `Complete a mission in ${ZONES[recipe.requiredZone]?.name} first.` });
        const mats = await getInventoryMaterials(db, char.id);
        for (const [comp, qty] of Object.entries(recipe.components)) {
            if ((mats[comp]?.qty || 0) < qty) return res.status(400).json({ error: `Need ${qty}x ${COMPONENTS[comp]?.name || comp}` });
        }
        for (const [comp, qty] of Object.entries(recipe.components)) {
            const inv = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='component' AND json_extract(item_data,'$.id')=?`, [char.id, comp]);
            if (inv) {
                const d = JSON.parse(inv.item_data); d.qty = (d.qty || 1) - qty;
                if (d.qty <= 0) await dbRun(db, 'DELETE FROM inventory WHERE id=?', [inv.id]);
                else await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), inv.id]);
            }
        }
        await dbRun(db, 'UPDATE characters SET gold=gold-? WHERE id=?', [recipe.goldCost, char.id]);
        await dbRun(db, 'INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)', [char.id, 'equipment', JSON.stringify(recipe)]);
        res.json({ message:`Crafted: ${recipe.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Equipment ──────────────────────────────────────────────────────────────
router.post('/equip/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item || item.item_type !== 'equipment') return res.status(400).json({ error: 'Item not found' });
        const data = JSON.parse(item.item_data);
        const allowedSlots = ['weapon','armor','boots','amulet','ring','accessory'];
        if (!allowedSlots.includes(data.slot)) return res.status(400).json({ error: `Invalid slot: ${data.slot}` });
        let eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id=?', [char.id]);
        if (!eq) {
            await dbRun(db, 'INSERT INTO equipment (char_id) VALUES (?)', [char.id]);
            eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id=?', [char.id]);
        }
        await dbRun(db, `UPDATE equipment SET ${data.slot}_id=? WHERE char_id=?`, [item.id, char.id]);
        res.json({ message:`Equipped ${data.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/unequip/:slot', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const slot = req.params.slot;
        if (!['weapon','armor','boots','amulet','ring','accessory'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
        await dbRun(db, `UPDATE equipment SET ${slot}_id=NULL WHERE char_id=?`, [char.id]);
        res.json({ message:`Unequipped ${slot}.` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Travel ─────────────────────────────────────────────────────────────────
router.post('/travel/start', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { targetZone } = req.body;
        const character = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const zone = ZONES[targetZone];
        if (!zone) return res.status(400).json({ error: 'Invalid zone' });
        if (character.location === targetZone) return res.status(400).json({ error: 'Already at this zone' });
        if (character.level < zone.minLevel) return res.status(400).json({ error: `Requires level ${zone.minLevel}` });
        const now = Math.floor(Date.now() / 1000);
        if (character.travel_end_time > now) return res.status(400).json({ error: 'Already traveling' });
        const travelEnd = now + zone.travelTime;
        await dbRun(db, 'UPDATE characters SET travel_target=?,travel_end_time=?,travel_start_time=? WHERE id=?', [targetZone, travelEnd, now, character.id]);
        res.json({ success:true, message:`Traveling to ${zone.name}`, travelEnd, travelStart:now, duration:zone.travelTime });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/travel/cancel', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { paid } = req.body;
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        if (!char.travel_target || !char.travel_end_time || char.travel_end_time <= now)
            return res.status(400).json({ error: 'Not currently traveling' });
        const travelStart = char.travel_start_time || (char.travel_end_time - 3600);
        const isFreeCancel = (now - travelStart) < 300;
        if (!isFreeCancel) {
            if (!paid) return res.status(400).json({ error: 'Cancel window expired, must pay 1 gem' });
            if ((char.gems || 0) < 1) return res.status(400).json({ error: 'Not enough gems' });
            await dbRun(db, 'UPDATE characters SET gems=gems-1 WHERE id=?', [char.id]);
        }
        await dbRun(db, 'UPDATE characters SET travel_target=NULL,travel_end_time=0,travel_start_time=0 WHERE id=?', [char.id]);
        res.json({ success:true, wasFree:isFreeCancel });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/travel/status', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await dbGet(db, 'SELECT id,location,travel_target,travel_end_time,travel_start_time FROM characters WHERE user_id=?', [req.user.userId]);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        if (character.travel_target && character.travel_end_time && character.travel_end_time <= now) {
            await dbRun(db, 'UPDATE characters SET location=?,travel_target=NULL,travel_end_time=0 WHERE id=?', [character.travel_target, character.id]);
            character.location = character.travel_target;
            character.travel_target = null;
            character.travel_end_time = 0;
        }
        res.json({
            location:        character.location || 'forest',
            travelTarget:    character.travel_target,
            travelEndTime:   character.travel_end_time || 0,
            travelStartTime: character.travel_start_time || 0,
            traveling:       !!character.travel_target,
            timeRemaining:   character.travel_target ? Math.max(0, character.travel_end_time - now) : 0,
        });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Sell item ──────────────────────────────────────────────────────────────
router.post('/sell/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        const eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id=?', [char.id]);
        if (eq) {
            const equippedIds = ['weapon','armor','boots','amulet','ring','accessory'].map(s => eq[`${s}_id`]).filter(Boolean);
            if (equippedIds.includes(item.id)) return res.status(400).json({ error: 'Unequip the item before selling.' });
        }
        const data = JSON.parse(item.item_data);
        const sellPrice = Math.max(1, Math.floor((data.price || 0) * 0.3));
        await dbRun(db, 'DELETE FROM inventory WHERE id=?', [item.id]);
        await dbRun(db, 'UPDATE characters SET gold=gold+? WHERE id=?', [sellPrice, char.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        res.json({ message:`Sold ${data.name} for ${sellPrice} gold.`, goldEarned: sellPrice, character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Use consumable ─────────────────────────────────────────────────────────
router.post('/use/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item || item.item_type !== 'consumable') return res.status(400).json({ error: 'Item not found' });
        const data = JSON.parse(item.item_data);
        if (!data.effect) return res.status(400).json({ error: 'No effect' });
        const equippedArray = await getEquippedItemsArray(db, char.id);
        const hpMax = calcHpMax(char, equippedArray);
        let message = '';
        if (data.effect.type === 'heal') {
            const newHp = Math.min(hpMax, (char.hp_current ?? hpMax) + data.effect.value);
            await dbRun(db, 'UPDATE characters SET hp_current=? WHERE id=?', [newHp, char.id]);
            message = `Restored ${data.effect.value} HP.`;
        } else if (data.effect.type === 'heal_full') {
            await dbRun(db, 'UPDATE characters SET hp_current=? WHERE id=?', [hpMax, char.id]);
            message = `Fully restored HP!`;
        } else if (data.effect.type === 'temp_stat') {
            message = `+${data.effect.value} ${data.effect.stat} for session.`;
        } else if (data.effect.type === 'xp') {
            let newXp = (char.xp || 0) + data.effect.value, newLevel = char.level;
            while (newXp >= LEVEL_XP(newLevel)) { newXp -= LEVEL_XP(newLevel); newLevel++; }
            await dbRun(db, 'UPDATE characters SET xp=?,level=? WHERE id=?', [newXp, newLevel, char.id]);
            message = `Gained ${data.effect.value} XP!`;
        }
        const d = JSON.parse(item.item_data); d.qty = (d.qty || 1) - 1;
        if (d.qty <= 0) await dbRun(db, 'DELETE FROM inventory WHERE id=?', [item.id]);
        else await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), item.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        res.json({ message, character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Shop ───────────────────────────────────────────────────────────────────
router.post('/shop/buy', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { item, price, priceType } = req.body;
        const character = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!character) return res.status(404).json({ error: 'No character' });
        if (!item) return res.status(400).json({ error: 'Invalid item data' });
        if (priceType === 'gems') { if ((character.gems||0) < price) return res.status(400).json({ error: 'Not enough gems' }); }
        else { if (character.gold < price) return res.status(400).json({ error: 'Not enough gold' }); }
        if (priceType === 'gems') {
            await dbRun(db, 'UPDATE characters SET gems=gems-?,total_gems_spent=total_gems_spent+? WHERE id=?', [price, price, character.id]);
        } else {
            await dbRun(db, 'UPDATE characters SET gold=gold-? WHERE id=?', [price, character.id]);
        }
        if (item.consumable) {
            const existing = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='consumable' AND json_extract(item_data,'$.id')=?`, [character.id, item.id]);
            if (existing) {
                const data = JSON.parse(existing.item_data); data.qty = (data.qty||1)+1;
                await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(data), existing.id]);
            } else {
                await dbRun(db, `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,'consumable',?)`, [character.id, JSON.stringify({ ...item, qty:1 })]);
            }
        } else {
            await dbRun(db, `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,'equipment',?)`, [character.id, JSON.stringify(item)]);
            try { await dbRun(db, `UPDATE shop_items SET sold=1 WHERE user_id=? AND json_extract(item_data,'$.id')=?`, [req.user.userId, item.id]); } catch {}
        }
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [character.id]);
        res.json({ success:true, newGold:updatedChar.gold, newGems:updatedChar.gems, character:updatedChar, message:`Purchased ${item.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/shop/items', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        const userId = req.user.userId;
        const userLastGenRow = await dbGet(db, 'SELECT MAX(generation_date) as last_date FROM shop_items WHERE user_id=?', [userId]);
        const lastDate = userLastGenRow?.last_date;
        if (!lastDate || shouldResetShop(lastDate)) {
            await dbRun(db, 'DELETE FROM shop_items WHERE user_id=?', [userId]);
            const newItems = generateBackendInventory(character.level);
            const equipOnly = newItems.filter(i => !i.consumable);
            for (const item of equipOnly) {
                await dbRun(db, 'INSERT INTO shop_items (user_id,item_data,generation_date) VALUES (?,?,?)', [userId, JSON.stringify(item), now]);
            }
            const potions = getPotionsForLevel(character.level);
            res.json({ items: [...potions, ...equipOnly], resetTime: getNextMidnight() });
        } else {
            const rows = await dbAll(db, 'SELECT item_data,sold FROM shop_items WHERE user_id=? ORDER BY id', [userId]);
            const equipItems = rows.filter(r => !r.sold).map(row => JSON.parse(row.item_data));
            const potions = getPotionsForLevel(character.level);
            res.json({ items: [...potions, ...equipItems], resetTime: getNextMidnight(lastDate) });
        }
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

function generateBackendInventory(playerLevel) {
    const inventory = [];
    const itemCount = 30 + Math.floor(Math.random() * 10);
    for (let i = 0; i < itemCount; i++) {
        const rand = Math.random();
        const type = rand < 0.35 ? 'weapon' : rand < 0.65 ? 'armor' : 'accessory';
        const item = generateBackendRandomItem(playerLevel, type);
        if (item) inventory.push(item);
    }
    inventory.push(...getPotionsForLevel(playerLevel));
    for (let i = 0; i < 3; i++) {
        inventory.push({ id:`premium_${Date.now()}_${i}`, name:['XP Booster','Gold Booster','Legendary Crate'][i], emoji:['⚡','💰','📦'][i], desc:'Premium item!', price:[200,200,500][i], priceType:'gems', level:1, category:'premium', consumable:true, effect:{type:['xp_multiplier','gold_multiplier','lootbox'][i],value:2,duration:3600} });
    }
    return inventory.sort(() => Math.random() - 0.5);
}
function getNextMidnight() { const next = new Date(); next.setDate(next.getDate()+1); next.setHours(0,0,0,0); return next.getTime(); }
function shouldResetShop(lastGenerationDate) {
    if (!lastGenerationDate) return true;
    const now = new Date(), lastGen = new Date(lastGenerationDate * 1000);
    return now.getDate() !== lastGen.getDate() || now.getMonth() !== lastGen.getMonth() || now.getFullYear() !== lastGen.getFullYear();
}

// ── Matchmaking ────────────────────────────────────────────────────────────
router.get('/matchmaking', auth, async (req, res) => {
    try {
        const db = await getDb();
        const me = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!me) return res.status(404).json({ error: 'No character' });
        const direction = req.query.direction || 'similar';
        const now = Math.floor(Date.now() / 1000);
        const myPower = (me.strength||0) + (me.defense||0) + (me.agility||0) + (me.magic||0) + me.level * 5;
        let candidates = await dbAll(db, `
            SELECT c.*, u.username,
                   (c.strength + c.defense + c.agility + c.magic + c.level*5) as power
            FROM characters c JOIN users u ON c.user_id=u.id
            WHERE c.id != ?
              AND (c.attack_cooldown_until IS NULL OR c.attack_cooldown_until < ?)
              AND (c.hp_current IS NULL OR c.hp_current >= 10)
        `, [me.id, now]);
        const myCooldownRows = await dbAll(db, 'SELECT defender_id FROM attack_cooldowns WHERE attacker_id=? AND expires_at>?', [me.id, now]);
        const myCooldowns = myCooldownRows.map(r => r.defender_id);
        candidates = candidates.filter(c => !myCooldowns.includes(c.id));
        if (!candidates.length) return res.json(null);
        let target;
        if (direction === 'weaker') target = candidates.filter(c => c.power < myPower).sort((a,b) => b.power - a.power)[0] || null;
        else if (direction === 'stronger') target = candidates.filter(c => c.power > myPower).sort((a,b) => a.power - b.power)[0] || null;
        else { candidates.sort((a,b) => Math.abs(a.power - myPower) - Math.abs(b.power - myPower)); target = candidates[0] || null; }
        res.json(target || null);
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Attack ─────────────────────────────────────────────────────────────────
router.post('/attack/:targetId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const attacker = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!attacker) return res.status(404).json({ error: 'No character' });
        const defender = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [req.params.targetId]);
        if (!defender) return res.status(404).json({ error: 'Target not found' });
        if (String(defender.user_id) === String(req.user.userId)) return res.status(400).json({ error: 'Cannot attack yourself' });

        const now = Math.floor(Date.now() / 1000);
        const atkMission = await dbGet(db, 'SELECT id FROM active_missions WHERE character_id=?', [attacker.id]);
        if (atkMission) return res.status(400).json({ error: 'Cannot attack while on a mission.' });
        if (attacker.travel_target && attacker.travel_end_time > now)
            return res.status(400).json({ error: 'Cannot attack while traveling.' });

        const pvpCooldown = eventHas('discount_duels') ? 120 : 600;
        const atkCooldown = attacker.last_battle_at || 0;
        if (atkCooldown + pvpCooldown > now) {
            const secs = (atkCooldown + pvpCooldown) - now;
            return res.status(400).json({ error: `Wait ${secs < 60 ? secs+'s' : Math.ceil(secs/60)+'m'} before next attack.` });
        }

        const defGlobalCooldown = defender.attack_cooldown_until || 0;
        if (defGlobalCooldown > now) {
            const mins = Math.ceil((defGlobalCooldown - now) / 60);
            return res.status(400).json({ error: `That player is in recovery. ${mins < 60 ? mins+'m' : Math.ceil(mins/60)+'h'} remaining.` });
        }

        const perTarget = await dbGet(db, 'SELECT expires_at FROM attack_cooldowns WHERE attacker_id=? AND defender_id=?', [attacker.id, defender.id]);
        if (perTarget && perTarget.expires_at > now) {
            const secs = perTarget.expires_at - now;
            return res.status(400).json({ error: `Cannot attack ${defender.name} again for ${secs < 3600 ? Math.ceil(secs/60)+'m' : Math.ceil(secs/3600)+'h'}.` });
        }

        await applyHpRegen(db, attacker.id);
        await applyHpRegen(db, defender.id);
        const freshA = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [attacker.id]);
        const freshD = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [defender.id]);

        const hpA = freshA.hp_current ?? freshA.hp_max;
        if (hpA <= 0) return res.status(400).json({ error: 'You are out of HP. Wait for regen.' });

        const equippedD0 = await getEquippedItemsArray(db, freshD.id);
        const hpD = freshD.hp_current ?? calcHpMax(freshD, equippedD0);
        if (hpD < 10) return res.status(400).json({ error: `${freshD.name} has too little HP. Let them recover first.` });

        const equippedA = await getEquippedItemsArray(db, freshA.id);
        const equippedD = await getEquippedItemsArray(db, freshD.id);
        const { dmgMin:dmgMinA, dmgMax:dmgMaxA } = calcBaseDamage(freshA, equippedA);
        const { dmgMin:dmgMinD, dmgMax:dmgMaxD } = calcBaseDamage(freshD, equippedD);
        const hpMaxA = calcHpMax(freshA, equippedA);
        const hpMaxD = calcHpMax(freshD, equippedD);

        const fighterA = {
            id: freshA.id, name: freshA.name,
            hp: hpA, dmgMin: dmgMinA, dmgMax: dmgMaxA, agility: freshA.agility || 0,
            hit_chance: freshA.hit_chance || 0, crit_chance: freshA.crit_chance || 0,
            activeSkills: getActiveSkills(freshA),
            attackZones: JSON.parse(freshA.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones:  JSON.parse(freshA.block_zones  || 'null') || DEFAULT_BLOCK_ZONES,
        };
        const fighterB = {
            id: freshD.id, name: freshD.name,
            hp: freshD.hp_current ?? hpMaxD, dmgMin: dmgMinD, dmgMax: dmgMaxD, agility: freshD.agility || 0,
            hit_chance: freshD.hit_chance || 0, crit_chance: freshD.crit_chance || 0,
            activeSkills: getActiveSkills(freshD),
            attackZones: JSON.parse(freshD.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones:  JSON.parse(freshD.block_zones  || 'null') || DEFAULT_BLOCK_ZONES,
        };

        const battle = runBattle(fighterA, fighterB);
        const attackerWon = battle.winnerId === freshA.id;

        function calculateBattleXP(winnerLevel, loserLevel) {
            const d = loserLevel - winnerLevel;
            if (d <= -5) return -3; if (d <= -3) return -2; if (d <= -2) return -1;
            if (d <= -1) return 0; if (d <= 0) return 1; if (d <= 1) return 1;
            if (d <= 2) return 2; return 3;
        }
        const xpGained = attackerWon ? calculateBattleXP(freshA.level, freshD.level) : 0;
        const atkGoldStake = Math.floor((freshA.gold || 0) * 0.10);
        const defGoldStake = Math.floor((freshD.gold || 0) * 0.10);
        const goldGained   = attackerWon ? defGoldStake  : -atkGoldStake;
        const defGoldChange = attackerWon ? -defGoldStake : atkGoldStake;

        const newHpA = Math.max(0, battle.hpRemainingA);
        const newHpD = Math.max(0, battle.hpRemainingB);

        let atkXp = Math.max(0, (freshA.xp || 0) + xpGained), atkLevel = freshA.level, leveledUp = false;
        while (atkXp >= LEVEL_XP(atkLevel)) { atkXp -= LEVEL_XP(atkLevel); atkLevel++; leveledUp = true; }

        await dbRun(db, `UPDATE characters SET xp=?,gold=MAX(0,gold+?),level=?,wins=wins+?,losses=losses+?,hp_current=?,total_gold_earned=total_gold_earned+?,total_gold_lost=total_gold_lost+? WHERE id=?`,
            [atkXp, goldGained, atkLevel, attackerWon?1:0, attackerWon?0:1, newHpA, goldGained>0?goldGained:0, goldGained<0?-goldGained:0, freshA.id]);
        await dbRun(db, `UPDATE characters SET gold=MAX(0,gold+?),wins=wins+?,losses=losses+?,hp_current=?,total_gold_earned=total_gold_earned+?,total_gold_lost=total_gold_lost+? WHERE id=?`,
            [defGoldChange, attackerWon?0:1, attackerWon?1:0, newHpD, defGoldChange>0?defGoldChange:0, defGoldChange<0?-defGoldChange:0, freshD.id]);

        try {
            await dbRun(db, `INSERT INTO battles (attacker_id,defender_id,winner_id,attacker_name,defender_name,log,fought_at,battle_type,xp_gained,gold_gained) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [freshA.id, freshD.id, battle.winnerId, freshA.name, freshD.name, JSON.stringify(battle.log), now, 'pvp', xpGained, Math.abs(goldGained)]);
        } catch (e) {
            try { await dbRun(db, 'INSERT INTO battles (attacker_id,defender_id,winner_id,log) VALUES (?,?,?,?)', [freshA.id, freshD.id, battle.winnerId, JSON.stringify(battle.log)]); } catch {}
        }

        await dbRun(db, 'UPDATE characters SET last_battle_at=? WHERE id=?', [now, freshA.id]);
        try { await dbRun(db, 'INSERT OR REPLACE INTO attack_cooldowns (attacker_id,defender_id,expires_at) VALUES (?,?,?)', [freshA.id, freshD.id, now + 43200]); } catch {}
        await dbRun(db, 'UPDATE characters SET attack_cooldown_until=? WHERE id=?', [now + 3600, freshD.id]);

        try {
            const defSubject = attackerWon ? `⚔️ ${freshA.name} attacked and defeated you! (-${defGoldStake} gold)` : `🛡️ You defended against ${freshA.name} and won! (+${atkGoldStake} gold)`;
            const defPayload = JSON.stringify({ log: battle.log, won: !attackerWon, goldEarned: defGoldChange>0?defGoldChange:0, goldLost: defGoldChange<0?-defGoldChange:0, xpEarned:0, type:'pvp', opponentName:freshA.name });
            await dbRun(db, 'INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)', [freshA.id, freshD.id, defSubject, `BATTLE_REPORT:${defPayload}`]);
        } catch (e) { console.error('Failed to send defender report:', e); }
        try {
            const atkSubject = attackerWon ? `⚔️ You defeated ${freshD.name}! (+${defGoldStake} gold)` : `💀 You lost to ${freshD.name}. (-${atkGoldStake} gold)`;
            const atkPayload = JSON.stringify({ log: battle.log, won: attackerWon, goldEarned: goldGained>0?goldGained:0, goldLost: goldGained<0?-goldGained:0, xpEarned:xpGained, type:'pvp', opponentName:freshD.name });
            await dbRun(db, 'INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)', [freshA.id, freshA.id, atkSubject, `BATTLE_REPORT:${atkPayload}`]);
        } catch (e) { console.error('Failed to send attacker report:', e); }

        const updatedAttacker = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [freshA.id]);
        res.json({ won:attackerWon, log:battle.log, xpGained, goldGained:goldGained>0?goldGained:0, goldLost:goldGained<0?-goldGained:0, leveledUp, character:await buildCharacterResponse(updatedAttacker, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Leaderboard ────────────────────────────────────────────────────────────
router.get('/leaderboard', auth, async (req, res) => {
    try {
        const db = await getDb();
        const allowedSorts = ['wins','losses','gold','level','total_gold_earned'];
        const sort = allowedSorts.includes(req.query.sort) ? req.query.sort : 'total_gold_earned';
        const players = await dbAll(db, `SELECT c.id,c.name,c.class,c.level,c.xp,c.gold,c.total_gold_earned,c.strength,c.defense,c.agility,c.magic,c.wins,c.losses,u.username
            FROM characters c JOIN users u ON c.user_id=u.id ORDER BY c.${sort} DESC,c.level DESC LIMIT 2000`, []);
        res.json(players.map((p,i) => ({ ...p, rank:i+1 })));
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Player profile ─────────────────────────────────────────────────────────
router.get('/player/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        const me = await dbGet(db, 'SELECT id FROM characters WHERE user_id=?', [req.user.userId]);
        const player = await dbGet(db, 'SELECT c.*,u.username FROM characters c JOIN users u ON c.user_id=u.id WHERE c.id=?', [req.params.id]);
        if (!player) return res.status(404).json({ error: 'Not found' });
        const now = Math.floor(Date.now() / 1000);
        const globalCooldown = (player.attack_cooldown_until || 0) > now ? player.attack_cooldown_until - now : 0;
        let perTargetCooldown = 0;
        if (me) {
            try {
                const cd = await dbGet(db, 'SELECT expires_at FROM attack_cooldowns WHERE attacker_id=? AND defender_id=?', [me.id, player.id]);
                if (cd && cd.expires_at > now) perTargetCooldown = cd.expires_at - now;
            } catch {}
        }
        const equippedArray = await getEquippedItemsArray(db, player.id);
        const hpMax = calcHpMax(player, equippedArray);
        const hpLow = (player.hp_current ?? hpMax) < 10;
        const equipped = await getEquippedItems(db, player.id);
        const battles = await dbAll(db, `SELECT b.*,a.name as attacker_name,d.name as defender_name,w.name as winner_name
            FROM battles b JOIN characters a ON b.attacker_id=a.id JOIN characters d ON b.defender_id=d.id JOIN characters w ON b.winner_id=w.id
            WHERE b.attacker_id=? OR b.defender_id=? ORDER BY b.fought_at DESC LIMIT 5`, [player.id, player.id]);
        res.json({
            id:player.id, name:player.name, class:player.class, level:player.level, username:player.username,
            strength:player.strength, defense:player.defense, agility:player.agility,
            magic:player.magic, vitality:player.vitality||10,
            hit_chance:player.hit_chance||0, crit_chance:player.crit_chance||0,
            hp_max:hpMax, wins:player.wins, losses:player.losses,
            gold:player.gold, total_gold_earned:player.total_gold_earned, total_gold_lost:player.total_gold_lost,
            globalCooldown, perTargetCooldown, hpLow, equipped,
            recentBattles: battles.map(b => ({ ...b, log: JSON.parse(b.log) })),
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Battle history ─────────────────────────────────────────────────────────
router.get('/battles', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const battles = await dbAll(db, `SELECT b.*,a.name as attacker_name,a.class as attacker_class,d.name as defender_name,d.class as defender_class,w.name as winner_name
            FROM battles b JOIN characters a ON b.attacker_id=a.id JOIN characters d ON b.defender_id=d.id JOIN characters w ON b.winner_id=w.id
            WHERE b.attacker_id=? OR b.defender_id=? ORDER BY b.fought_at DESC LIMIT 10`, [char.id, char.id]);
        res.json(battles.map(b => ({ ...b, log: JSON.parse(b.log) })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Messages ───────────────────────────────────────────────────────────────
router.get('/messages', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        const messages = await dbAll(db, `SELECT m.*,s.name as sender_name,r.name as receiver_name FROM messages m
            JOIN characters s ON m.sender_id=s.id JOIN characters r ON m.receiver_id=r.id
            WHERE m.receiver_id=? ORDER BY m.sent_at DESC LIMIT 50`, [char.id]);
        res.json(messages);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/messages/unread-count', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.json({ count:0 });
        const row = await dbGet(db, 'SELECT COUNT(*) as count FROM messages WHERE receiver_id=? AND read=0', [char.id]);
        res.json({ count: row?.count || 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/messages/send', auth, async (req, res) => {
    try {
        const db = await getDb();
        const sender = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!sender) return res.status(404).json({ error: 'No character' });
        const { receiver_id, subject, body } = req.body;
        if (!receiver_id || !subject || !body) return res.status(400).json({ error: 'Missing fields' });
        if (String(receiver_id) === String(sender.id)) return res.status(400).json({ error: 'Cannot message yourself' });
        await dbRun(db, 'INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)', [sender.id, receiver_id, subject, body]);
        res.json({ message:'Sent!' });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});
router.post('/messages/:id/read', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ ok: false });
        await dbRun(db, 'UPDATE messages SET read=1 WHERE id=? AND receiver_id=?', [req.params.id, char.id]);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/messages/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ ok: false });
        await dbRun(db, 'DELETE FROM messages WHERE id=? AND receiver_id=?', [req.params.id, char.id]);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Class Skills ───────────────────────────────────────────────────────────
router.post('/skills/activate', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'No character' });
        await applyMpRegen(db, char.id);
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        const { skillId } = req.body;
        const classSkills = CLASS_SKILLS[freshChar.class] || [];
        const skill = classSkills.find(s => s.id === skillId);
        if (!skill) return res.status(400).json({ error: 'Invalid skill for your class' });
        const now = Math.floor(Date.now() / 1000);
        const todayStart = Math.floor(now / 86400) * 86400;
        if ((freshChar.daily_mp_reset_at || 0) < todayStart) {
            await dbRun(db, 'UPDATE characters SET daily_mp_spent=0, daily_mp_reset_at=? WHERE id=?', [todayStart, freshChar.id]);
            freshChar.daily_mp_spent = 0;
        }
        const dailyMpSpent = freshChar.daily_mp_spent || 0;
        if (dailyMpSpent < MP_SKILL_UNLOCK) {
            const needed = MP_SKILL_UNLOCK - dailyMpSpent;
            return res.status(400).json({ error: `Skills unlock by spending 60 MP on missions today. Spend ${needed} more MP!` });
        }
        const lastUsed = freshChar.skill_last_used ? (() => { try { return JSON.parse(freshChar.skill_last_used); } catch { return {}; } })() : {};
        const usedToday = Object.entries(lastUsed).find(([, t]) => t >= todayStart);
        if (usedToday) {
            const usedDef = classSkills.find(s => s.id === usedToday[0]);
            const hoursLeft = Math.ceil((todayStart + 86400 - now) / 3600);
            return res.status(400).json({ error: `Already activated ${usedDef?.name || 'a skill'} today. Resets in ${hoursLeft}h.` });
        }
        const activeSkills = freshChar.active_skills ? (() => { try { return JSON.parse(freshChar.active_skills); } catch { return {}; } })() : {};
        if (activeSkills[skillId] && activeSkills[skillId] > now) {
            const rem = activeSkills[skillId] - now;
            return res.status(400).json({ error: `${skill.name} is already active (${Math.floor(rem/3600)}h ${Math.ceil((rem%3600)/60)}m left).` });
        }
        activeSkills[skillId] = now + SKILL_DURATION;
        lastUsed[skillId] = now;
        await dbRun(db, 'UPDATE characters SET active_skills=?, skill_last_used=? WHERE id=?', [JSON.stringify(activeSkills), JSON.stringify(lastUsed), freshChar.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [freshChar.id]);
        res.json({ message:`✨ ${skill.emoji} ${skill.name} activated for 5 hours!`, character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Global event status ────────────────────────────────────────────────────
router.get('/events/active', auth, async (req, res) => {
    try {
        const ev = getActiveEvent();
        if (!ev) return res.json(null);
        const def = GLOBAL_EVENTS.find(e => e.key === ev.event_key);
        res.json({ ...def, ends_at: ev.ends_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
