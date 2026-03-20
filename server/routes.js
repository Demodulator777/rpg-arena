const express = require('express');
const { getDb } = require('./db');
const auth = require('./middleware');
const { ZONES, RAW_MATERIALS, COMPONENTS, EQUIPMENT_RECIPES, generateMission, TIER_COLORS, TIER_LABELS } = require('./gamedata');

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
        ];
        for (const sql of migrations) {
            try { db.prepare(sql).run(); } catch {} // Ignore "column already exists"
        }
        db.prepare(`CREATE TABLE IF NOT EXISTS attack_cooldowns (
                                                                    attacker_id INTEGER,
                                                                    defender_id INTEGER,
                                                                    expires_at INTEGER,
                                                                    PRIMARY KEY (attacker_id, defender_id)
            )`).run();
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
const UPGRADE_BASE = 25;
const UPGRADE_EXPONENT = 1.5;
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

// ── Battle helpers ─────────────────────────────────────────────────────────
function applyHpRegen(db, characterId) {
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
    if (!char) return;
    const now = Math.floor(Date.now() / 1000);
    const hoursElapsed = Math.floor((now - (char.last_regen_at || 0)) / HP_REGEN_INTERVAL);
    if (hoursElapsed < 1) return;
    // Use computed hp_max (vitality + defense + gear) not the stale DB column
    const equippedArray = getEquippedItemsArray(db, characterId);
    const trueHpMax = calcHpMax(char, equippedArray);
    const currentHp = char.hp_current ?? trueHpMax;
    if (currentHp >= trueHpMax) {
        db.prepare('UPDATE characters SET hp_current = ?, last_regen_at = ? WHERE id = ?').run(trueHpMax, now, characterId);
        return;
    }
    const regenAmount = Math.floor(trueHpMax * HP_REGEN_RATE * hoursElapsed);
    const newHp = Math.min(trueHpMax, currentHp + regenAmount);
    db.prepare('UPDATE characters SET hp_current = ?, last_regen_at = ? WHERE id = ?').run(newHp, now, characterId);
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

function simulateRound(roundNum, attacker, defender, atkZone, blkZone, atkPenalty) {
    const hit = HIT_ZONES[atkZone]  || HIT_ZONES.chest;
    const blk = BLOCK_ZONES[blkZone] || BLOCK_ZONES.cross_guard;
    let atkHitChance = hit.hitChance + ((attacker.agility || 0) * 0.005);
    if (atkPenalty) atkHitChance *= 0.85;
    const atkBonusDmg = (blk.special === 'attacker_bonus_10') ? 1.10 : 1.0;
    let forceMiss = false;
    if ((blk.special === 'attacker_miss_20') && Math.random() < 0.20) forceMiss = true;
    const atkHit = !forceMiss && Math.random() <= atkHitChance;
    let logLine = '', finalDmg = 0;
    let nextAtkPenalty = false;
    if (!atkHit) {
        logLine = `Round ${roundNum}: ${attacker.name} swings — MISS`;
    } else {
        let rawDmg = attacker.dmgMin + Math.floor(Math.random() * (attacker.dmgMax - attacker.dmgMin + 1));
        rawDmg = Math.floor(rawDmg * hit.dmgMult * atkBonusDmg);
        const blockCovers = blk.protects.includes(atkZone) || blk.protects.includes('any');
        const blockFails  = Math.random() < 0.10;
        if (blockCovers && !blockFails) {
            finalDmg = Math.max(0, Math.floor(rawDmg * (1 - blk.reduction)));
            logLine = finalDmg === 0
                ? `Round ${roundNum}: ${attacker.name} hits — BLOCKED (${rawDmg} absorbed)`
                : `Round ${roundNum}: ${attacker.name} hits — BLOCKED partially — ${finalDmg} slips through`;
        } else {
            finalDmg = rawDmg;
            logLine = `Round ${roundNum}: ${attacker.name} lands a hit — ${finalDmg} damage`;
        }
        if (blk.special === 'next_round_hit_penalty') nextAtkPenalty = true;
        if (blk.special === 'counter_25' && Math.random() < 0.25) {
            const counterDmg = Math.floor(finalDmg * 0.50);
            logLine += ` — COUNTERED for ${counterDmg}`;
            return { logLine, damageDealt: finalDmg, damageCounter: counterDmg, nextAtkPenalty };
        }
    }
    return { logLine, damageDealt: atkHit ? finalDmg : 0, damageCounter: 0, nextAtkPenalty };
}

function runBattle(fighterA, fighterB) {
    const log = [];
    let hpA = fighterA.hp, hpB = fighterB.hp;
    let penaltyA = false, penaltyB = false;
    let totalDmgToA = 0, totalDmgToB = 0;

    log.push(`⚔️  ${fighterA.name}  vs  ${fighterB.name}`);
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

        hpA = Math.max(0, hpA - dmgToA);
        hpB = Math.max(0, hpB - dmgToB);

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
    if (hpA <= 0 && hpB <= 0) {
        // Both KO — most damage dealt wins
        winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
    } else if (hpA <= 0) {
        winnerId = fighterB.id;
    } else if (hpB <= 0) {
        winnerId = fighterA.id;
    } else {
        // 10 rounds, no KO — most total damage dealt wins
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
        baseStats: { dmg_min:{min:2,max:4,scale:1.2}, dmg_max:{min:4,max:7,scale:1.3}, strength:{min:0,max:2,scale:0.5}, agility:{min:0,max:2,scale:0.4}, magic:{min:0,max:2,scale:0.4} },
        classBonus: { warrior:{strength:1.2}, rogue:{agility:1.2}, mage:{magic:1.2}, paladin:{strength:1.1,magic:0.8} }
    },
    armor: {
        namePrefixes: ['Leather','Chain','Plate','Scale','Crystal','Obsidian','Dragon','Mythril','Adamant'],
        nameSuffixes: ['Armor','Vest','Cuirass','Breastplate','Hauberk','Mail','Plate'],
        emojis: ['🛡️','🧥','🥼','👕','🦺'],
        baseStats: { defense:{min:1,max:3,scale:1.3}, hp_max:{min:5,max:15,scale:1.4}, strength:{min:0,max:1,scale:0.2}, agility:{min:-1,max:0,scale:0.1} },
        classBonus: { warrior:{defense:1.2,hp_max:1.1}, paladin:{defense:1.2,hp_max:1.1}, rogue:{agility:0.2}, mage:{magic:0.2} }
    },
    accessory: {
        namePrefixes: ['Iron','Silver','Golden','Crystal','Ruby','Sapphire','Emerald','Diamond','Mythril'],
        nameSuffixes: ['Ring','Amulet','Necklace','Bracelet','Circlet','Brooch','Talisman'],
        emojis: ['💍','📿','👑','🔮','✨'],
        baseStats: { strength:{min:0,max:2,scale:0.4}, defense:{min:0,max:1,scale:0.3}, agility:{min:0,max:2,scale:0.4}, magic:{min:0,max:2,scale:0.4}, hp_max:{min:5,max:20,scale:0.8} },
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
    if (type !== 'consumable' && generator.baseStats) {
        for (const [statName, statConfig] of Object.entries(generator.baseStats)) {
            const scaledMin = Math.floor(statConfig.min + (level * statConfig.scale * 0.3));
            const scaledMax = Math.floor(statConfig.max + (level * statConfig.scale * 0.5));
            let value = scaledMin + Math.floor(Math.random() * (scaledMax - scaledMin + 1));
            value = Math.floor(value * (0.8 + Math.random() * 0.4));
            if (statName.includes('dmg_min') && value < 1) value = 1;
            if (statName.includes('dmg_max') && value < 2) value = 2;
            stats[statName] = Math.max(statConfig.min || -10, value);
        }
    }
    const prefix = generator.namePrefixes[Math.floor(Math.random() * generator.namePrefixes.length)];
    const suffix = generator.nameSuffixes[Math.floor(Math.random() * generator.nameSuffixes.length)];
    const name = `${prefix} ${suffix}`;
    const emoji = generator.emojis[Math.floor(Math.random() * generator.emojis.length)];
    const imgSlug = name.toLowerCase().replace(/\s+/g, '-');
    const item = {
        id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
        name, emoji, tier, level,
        img: `/images/assets/${imgSlug}.png`,
        desc: `A ${name.toLowerCase()} for level ${level} adventurers.`,
        stats,
        slot: type === 'weapon' ? 'weapon' : type === 'armor' ? 'armor' : 'accessory',
        category: type, price: 0,
        quality: Math.random() > 0.9 ? 'legendary' : Math.random() > 0.7 ? 'rare' : 'common'
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
    if (type === 'weapon' && Math.random() < 0.15) {
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
    ['strength','defense','agility','magic','vitality'].forEach(s => { costs[s] = upgradeCost(s, char[s] || 0, char.class); });
    return { ...char, upgradeCosts: costs };
}

function getEquippedItems(db, charId) {
    const eq = db.prepare('SELECT * FROM equipment WHERE char_id = ?').get(charId);
    if (!eq) return {};
    const slots = {};
    ['weapon','armor','boots','amulet','ring','accessory'].forEach(slot => {
        const itemId = eq[`${slot}_id`];
        if (itemId) {
            const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(itemId);
            if (inv) slots[slot] = { ...JSON.parse(inv.item_data), inventoryId: inv.id };
        }
    });
    return slots;
}

// Returns equipped items as array (for calcHpMax / calcBaseDamage)
function getEquippedItemsArray(db, charId) {
    const eq = db.prepare('SELECT * FROM equipment WHERE char_id = ?').get(charId);
    if (!eq) return [];
    const items = [];
    ['weapon','armor','boots','amulet','ring','accessory'].forEach(slot => {
        const itemId = eq[`${slot}_id`];
        if (itemId) {
            const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(itemId);
            if (inv) items.push(inv);
        }
    });
    return items;
}

function getInventoryMaterials(db, charId) {
    const items = db.prepare(`SELECT * FROM inventory WHERE char_id = ? AND item_type IN ('raw_mat','component')`).all(charId);
    const map = {};
    items.forEach(i => {
        const d = JSON.parse(i.item_data);
        const key = d.id;
        if (!map[key]) map[key] = { ...d, qty: 0, invId: i.id };
        map[key].qty += d.qty || 1;
    });
    return map;
}

// Full character response including new fields
function buildCharacterResponse(char, db) {
    const equippedObj   = getEquippedItems(db, char.id);
    const equippedArray = getEquippedItemsArray(db, char.id);
    const hpMax     = calcHpMax(char, equippedArray);
    const hpCurrent = Math.min(char.hp_current ?? hpMax, hpMax);
    const withCosts = withUpgradeCosts({ ...char, hp_max: hpMax, hp_current: hpCurrent });
    const withTrain = withTrainingStatus(withCosts);
    const now = Math.floor(Date.now() / 1000);
    const lastBattle = char.last_battle_at || 0;
    const battleCooldownRemaining = (lastBattle + 600 > now) ? (lastBattle + 600 - now) : 0;
    return {
        ...withTrain,
        vitality:     char.vitality    || 10,
        gems:         char.gems        || 0,
        hp_max:       hpMax,
        hp_current:   hpCurrent,
        attack_zones: char.attack_zones || null,
        block_zones:  char.block_zones  || null,
        equipped:     equippedObj,
        last_battle_at: char.last_battle_at || 0,
        battle_cooldown_remaining: battleCooldownRemaining,
    };
}

// ── Character creation ─────────────────────────────────────────────────────
router.post('/character', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { name, class: characterClass } = req.body;
        console.log('🔍 Debug - Request body:', req.body);
        console.log('🔍 Debug - User object:', req.user);
        const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.user.username);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const userId = user.id;
        const existing = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(userId);
        if (existing) return res.status(400).json({ error: 'Character already exists' });
        const params = [
            userId, name, characterClass,
            1, 0, 50000,
            10, 10, 10, 10, 10,   // strength, defense, agility, magic, vitality
            100, 100,
            0, 0,
            null, null,
            0, 0,
            50000,
            0, 0,
            'forest', null, 0,
            0, 0, 0, 0
        ];
        const result = db.prepare(`
            INSERT INTO characters (
                user_id, name, class, level, xp, gold,
                strength, defense, agility, magic, vitality,
                hp_max, hp_current, wins, losses,
                training_stat, training_ends_at,
                total_gold_earned, total_gold_lost,
                gems, total_gems_earned, total_gems_spent,
                location, travel_target, travel_end_time,
                elem_resist_pyro, elem_resist_water, elem_resist_wind, elem_resist_electro
            ) VALUES (${params.map(() => '?').join(', ')})
        `).run(...params);
        const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(userId);
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
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });
        // Apply HP regen before returning
        applyHpRegen(db, char.id);
        const freshChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(char.id);
        res.json(buildCharacterResponse(freshChar, db));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Upgrade ────────────────────────────────────────────────────────────────
router.post('/upgrade', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { stat } = req.body;
        if (!['strength','defense','agility','magic','vitality'].includes(stat)) return res.status(400).json({ error: 'Invalid stat' });
        const cost = upgradeCost(stat, char[stat] || 0, char.class);
        if (char.gold < cost) return res.status(400).json({ error: `Need ${cost} gold, have ${char.gold}.` });
        db.prepare(`UPDATE characters SET ${stat}=${stat}+1, gold=gold-? WHERE user_id=?`).run(cost, req.user.userId);
        const updated = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        res.json({ message:`+1 ${stat}! Spent ${cost} gold.`, character: buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Training ───────────────────────────────────────────────────────────────
router.post('/train', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const now = Math.floor(Date.now() / 1000);
        if (char.training_stat && char.training_ends_at && now >= char.training_ends_at) {
            db.prepare(`UPDATE characters SET ${char.training_stat}=${char.training_stat}+?,training_stat=NULL,training_ends_at=NULL WHERE id=?`).run(TRAINING_GAIN, char.id);
        }
        const ref = db.prepare('SELECT * FROM characters WHERE id = ?').get(char.id);
        if (ref.training_stat && now < ref.training_ends_at) return res.status(400).json({ error: `Already training. ${ref.training_ends_at - now}s left.` });
        const { stat } = req.body;
        if (!['strength','defense','agility','magic'].includes(stat)) return res.status(400).json({ error: 'Invalid stat' });
        db.prepare('UPDATE characters SET training_stat=?,training_ends_at=? WHERE id=?').run(stat, now+TRAINING_DURATION_SEC, char.id);
        res.json({ message:`Training ${stat}!`, endsAt: now+TRAINING_DURATION_SEC, stat });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/train/collect', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char || !char.training_stat) return res.status(400).json({ error: 'Not training' });
        const now = Math.floor(Date.now() / 1000);
        if (now < char.training_ends_at) return res.status(400).json({ error: `${char.training_ends_at - now}s remaining.` });
        db.prepare(`UPDATE characters SET ${char.training_stat}=${char.training_stat}+?,training_stat=NULL,training_ends_at=NULL WHERE id=?`).run(TRAINING_GAIN, char.id);
        const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(char.id);
        res.json({ message:`+${TRAINING_GAIN} ${char.training_stat}!`, character: buildCharacterResponse(updated, db) });
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
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        db.prepare('UPDATE characters SET attack_zones = ?, block_zones = ? WHERE id = ?')
            .run(JSON.stringify(attackZones), JSON.stringify(blockZones), char.id);
        res.json({ message: 'Loadout saved.' });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Missions ───────────────────────────────────────────────────────────────
router.get('/missions', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const active = db.prepare(`SELECT * FROM missions WHERE char_id=? AND collected=0`).get(char.id);
        const unlockedZones = Object.entries(ZONES)
            .filter(([,z]) => char.level >= z.minLevel)
            .map(([key, z]) => ({ key, ...z }));
        res.json({ active: active ? { ...active, mat_drops: JSON.parse(active.mat_drops) } : null, unlockedZones, charLevel: char.level });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/missions/start', auth, async (req, res) => {
    console.log('=== MISSION START ===', req.body);
    try {
        const db = await getDb();
        const { zoneId, spotId } = req.body;
        const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        if (character.location !== zoneId) return res.status(400).json({ error: 'You must be at this zone to start missions' });
        // Check HP
        const hpCurrent = character.hp_current ?? character.hp_max;
        if (hpCurrent <= 0) return res.status(400).json({ error: 'Out of HP. Wait for regeneration.' });
        // Check battle cooldown — can't start a mission right after a fight
        const now = Math.floor(Date.now() / 1000);
        const lastBattle = character.last_battle_at || 0;
        if (lastBattle + 600 > now) {
            const secs = (lastBattle + 600) - now;
            return res.status(400).json({ error: `Cannot start a mission so soon after battle. Wait ${secs < 60 ? secs+'s' : Math.ceil(secs/60)+'m'}.` });
        }
        const existing = db.prepare('SELECT * FROM active_missions WHERE character_id = ?').get(character.id);
        if (existing) return res.status(400).json({ error: 'You already have an active mission' });
        const zone = ZONES[zoneId];
        const spot = zone?.spots.find(s => s.id === spotId);
        if (!spot) return res.status(404).json({ error: 'Mission spot not found' });
        const difficulty = spot.difficulty;
        const [minGold, maxGold] = zone.payoutBase[difficulty];
        const [minXp, maxXp]     = zone.xpBase[difficulty];
        const goldReward = Math.floor(Math.random() * (maxGold - minGold + 1)) + minGold;
        const xpReward   = Math.floor(Math.random() * (maxXp   - minXp   + 1)) + minXp;
        const sentName   = req.body.missionName;
        const missionList = spot.missions.map(m => typeof m === 'string' ? m : m.name);
        const missionName = (sentName && missionList.includes(sentName))
            ? sentName : missionList[Math.floor(Math.random() * missionList.length)];
        const insertResult = db.prepare(`
            INSERT INTO active_missions
            (character_id, zone, spot, spot_name, mission_name, difficulty, gold_reward, xp_reward, started_at, ends_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(character.id, zoneId, spotId, spot.name, missionName, difficulty, goldReward, xpReward, now, now + spot.missionDuration);
        res.json({
            success: true,
            mission: {
                id: insertResult.lastInsertRowid, zone: zoneId, spot: spotId, spot_name: spot.name,
                mission_name: missionName, missionName, difficulty, gold_reward: goldReward,
                xp_reward: xpReward, started_at: now, ends_at: now + spot.missionDuration, duration: spot.missionDuration
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
        const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });

        // Apply regen before battle
        applyHpRegen(db, character.id);
        const freshChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(character.id);

        const mission = db.prepare('SELECT * FROM active_missions WHERE character_id = ?').get(character.id);
        if (!mission) return res.status(400).json({ error: 'No active mission' });
        const now = Math.floor(Date.now() / 1000);
        if (now < mission.ends_at) return res.status(400).json({ error: 'Mission not yet complete' });

        // ── Build player fighter ───────────────────────────────────────────
        const equippedArray = getEquippedItemsArray(db, freshChar.id);
        const hpMax     = calcHpMax(freshChar, equippedArray);
        const hpCurrent = freshChar.hp_current ?? hpMax;
        const { dmgMin, dmgMax } = calcBaseDamage(freshChar, equippedArray);
        const playerFighter = {
            id: freshChar.id, name: freshChar.name,
            hp: hpCurrent, dmgMin, dmgMax, agility: freshChar.agility || 0,
            attackZones: JSON.parse(freshChar.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones:  JSON.parse(freshChar.block_zones  || 'null') || DEFAULT_BLOCK_ZONES,
        };

        const npc    = buildNpc(mission.difficulty, freshChar.level);
        const battle = runBattle(playerFighter, npc);
        const playerWon = battle.winnerId === freshChar.id;

        // ── Rewards ────────────────────────────────────────────────────────
        let goldEarned = playerWon ? mission.gold_reward : Math.floor(mission.gold_reward * 0.10);
        let xpEarned   = playerWon ? mission.xp_reward   : Math.floor(mission.xp_reward   * 0.30);
        goldEarned = Math.floor(goldEarned * (1 + freshChar.level * 0.05));
        xpEarned   = Math.floor(xpEarned   * (1 + freshChar.level * 0.10));

        const newHp = Math.max(0, battle.hpRemainingA);

        let newXp    = (freshChar.xp || 0) + xpEarned;
        let newLevel = freshChar.level;
        let leveledUp = false;
        while (newXp >= LEVEL_XP(newLevel)) { newXp -= LEVEL_XP(newLevel); newLevel++; leveledUp = true; }

        const newWins   = freshChar.wins   + (playerWon ? 1 : 0);
        const newLosses = freshChar.losses + (playerWon ? 0 : 1);

        db.prepare(`UPDATE characters SET xp=?,gold=gold+?,level=?,wins=?,losses=?,hp_current=?,total_gold_earned=total_gold_earned+? WHERE id=?`)
            .run(newXp, goldEarned, newLevel, newWins, newLosses, newHp, goldEarned, freshChar.id);

        db.prepare('DELETE FROM active_missions WHERE character_id = ?').run(freshChar.id);

        // ── Material drops ─────────────────────────────────────────────────
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
                const existing = db.prepare(`SELECT * FROM inventory WHERE char_id=? AND item_type='raw_mat' AND json_extract(item_data,'$.id')=?`).get(freshChar.id, mat.id);
                if (existing) {
                    const d = JSON.parse(existing.item_data); d.qty = (d.qty || 1) + qty;
                    db.prepare('UPDATE inventory SET item_data=? WHERE id=?').run(JSON.stringify(d), existing.id);
                } else {
                    db.prepare(`INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)`).run(freshChar.id, 'raw_mat', JSON.stringify({ ...mat, qty }));
                }
                drops.push({ mat: mat.id, qty });
            }
        }

        // ── Save battle to history ─────────────────────────────────────────
        try {
            db.prepare(`INSERT INTO battles (attacker_id,defender_id,winner_id,attacker_name,defender_name,log,fought_at,battle_type,xp_gained,gold_gained) VALUES (?,?,?,?,?,?,?,?,?,?)`)
                .run(freshChar.id, -1, playerWon ? freshChar.id : -1, freshChar.name, npc.name, JSON.stringify(battle.log), now, 'mission', xpEarned, goldEarned);
        } catch {}

        // ── Auto-message: mission report to self ───────────────────────────
        try {
            const subject = playerWon
                ? `✅ Mission Report: ${mission.mission_name}`
                : `💀 Mission Failed: ${mission.mission_name}`;
            const payload = JSON.stringify({ log: battle.log, won: playerWon, goldEarned, xpEarned, type: 'mission', npcName: npc.name });
            db.prepare('INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)').run(freshChar.id, freshChar.id, subject, `BATTLE_REPORT:${payload}`);
        } catch {}

        const updatedChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(freshChar.id);
        res.json({
            success: true,
            won: playerWon,
            battleLog: battle.log,
            message: `${playerWon ? 'Victory' : 'Defeated'} — ${goldEarned} gold, ${xpEarned} XP`,
            goldEarned, xpEarned, leveledUp, newLevel: leveledUp ? newLevel : undefined,
            drops, hpRemaining: newHp,
            character: buildCharacterResponse(updatedChar, db),
        });
    } catch (e) { console.error('Mission collect error:', e); res.status(500).json({ error: e.message }); }
});

// ── Active mission status ──────────────────────────────────────────────────
router.get('/missions/active', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const mission = db.prepare('SELECT * FROM active_missions WHERE character_id = ?').get(character.id);
        if (!mission) return res.json(null);
        res.json(mission);
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Inventory ──────────────────────────────────────────────────────────────
router.get('/inventory', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const items = db.prepare('SELECT * FROM inventory WHERE char_id = ? ORDER BY item_type, acquired_at DESC').all(char.id);
        const equipped = getEquippedItems(db, char.id);
        const equippedIds = Object.values(equipped).map(e => e.inventoryId).filter(Boolean);
        res.json({ items: items.map(i => ({ ...i, item_data: JSON.parse(i.item_data), equipped: equippedIds.includes(i.id) })), equipped });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Forge ──────────────────────────────────────────────────────────────────
router.get('/forge/recipes', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const completedZones = new Set(
            db.prepare('SELECT DISTINCT zone FROM missions WHERE char_id=? AND collected=1').all(char.id).map(r => r.zone)
        );
        const mats = getInventoryMaterials(db, char.id);
        const components = Object.entries(COMPONENTS).map(([id, comp]) => {
            const canCraft = char.gold >= comp.goldCost && Object.entries(comp.recipe).every(([mat, qty]) => (mats[mat]?.qty || 0) >= qty);
            return { id, ...comp, canCraft, playerMats: mats };
        });
        const equipment = EQUIPMENT_RECIPES.map(rec => {
            const zoneUnlocked = completedZones.has(rec.requiredZone) || char.level >= (ZONES[rec.requiredZone]?.minLevel || 1);
            const comps = getInventoryMaterials(db, char.id);
            const canCraft = zoneUnlocked && char.gold >= rec.goldCost && Object.entries(rec.components).every(([comp, qty]) => (comps[comp]?.qty || 0) >= qty);
            return { ...rec, zoneUnlocked, canCraft };
        });
        res.json({ components, equipment, gold: char.gold, mats });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/forge/refine', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { componentId } = req.body;
        const comp = COMPONENTS[componentId];
        if (!comp) return res.status(400).json({ error: 'Unknown component' });
        if (char.gold < comp.goldCost) return res.status(400).json({ error: `Need ${comp.goldCost} gold` });
        const mats = getInventoryMaterials(db, char.id);
        for (const [mat, qty] of Object.entries(comp.recipe)) {
            if ((mats[mat]?.qty || 0) < qty) return res.status(400).json({ error: `Need ${qty}x ${RAW_MATERIALS[mat]?.name || mat}` });
        }
        for (const [mat, qty] of Object.entries(comp.recipe)) {
            const inv = db.prepare(`SELECT * FROM inventory WHERE char_id=? AND item_type='raw_mat' AND json_extract(item_data,'$.id')=?`).get(char.id, mat);
            if (inv) {
                const d = JSON.parse(inv.item_data); d.qty = (d.qty || 1) - qty;
                if (d.qty <= 0) db.prepare('DELETE FROM inventory WHERE id=?').run(inv.id);
                else db.prepare('UPDATE inventory SET item_data=? WHERE id=?').run(JSON.stringify(d), inv.id);
            }
        }
        const existingComp = db.prepare(`SELECT * FROM inventory WHERE char_id=? AND item_type='component' AND json_extract(item_data,'$.id')=?`).get(char.id, componentId);
        if (existingComp) {
            const d = JSON.parse(existingComp.item_data); d.qty = (d.qty || 1) + 1;
            db.prepare('UPDATE inventory SET item_data=? WHERE id=?').run(JSON.stringify(d), existingComp.id);
        } else {
            db.prepare('INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)').run(char.id, 'component', JSON.stringify({ id:componentId, ...comp, qty:1 }));
        }
        db.prepare('UPDATE characters SET gold=gold-? WHERE id=?').run(comp.goldCost, char.id);
        res.json({ message:`Refined: ${comp.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/forge/craft', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { recipeId } = req.body;
        const recipe = EQUIPMENT_RECIPES.find(r => r.id === recipeId);
        if (!recipe) return res.status(400).json({ error: 'Unknown recipe' });
        if (char.gold < recipe.goldCost) return res.status(400).json({ error: `Need ${recipe.goldCost} gold` });
        const completedZones = new Set(db.prepare('SELECT DISTINCT zone FROM missions WHERE char_id=? AND collected=1').all(char.id).map(r => r.zone));
        if (!completedZones.has(recipe.requiredZone) && char.level < (ZONES[recipe.requiredZone]?.minLevel || 1))
            return res.status(400).json({ error: `Complete a mission in ${ZONES[recipe.requiredZone]?.name} first.` });
        const mats = getInventoryMaterials(db, char.id);
        for (const [comp, qty] of Object.entries(recipe.components)) {
            if ((mats[comp]?.qty || 0) < qty) return res.status(400).json({ error: `Need ${qty}x ${COMPONENTS[comp]?.name || comp}` });
        }
        for (const [comp, qty] of Object.entries(recipe.components)) {
            const inv = db.prepare(`SELECT * FROM inventory WHERE char_id=? AND item_type='component' AND json_extract(item_data,'$.id')=?`).get(char.id, comp);
            if (inv) {
                const d = JSON.parse(inv.item_data); d.qty = (d.qty || 1) - qty;
                if (d.qty <= 0) db.prepare('DELETE FROM inventory WHERE id=?').run(inv.id);
                else db.prepare('UPDATE inventory SET item_data=? WHERE id=?').run(JSON.stringify(d), inv.id);
            }
        }
        db.prepare('UPDATE characters SET gold=gold-? WHERE id=?').run(recipe.goldCost, char.id);
        db.prepare('INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)').run(char.id, 'equipment', JSON.stringify(recipe));
        res.json({ message:`Crafted: ${recipe.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Equipment ──────────────────────────────────────────────────────────────
router.post('/equip/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = db.prepare('SELECT * FROM inventory WHERE id=? AND char_id=?').get(req.params.inventoryId, char.id);
        if (!item || item.item_type !== 'equipment') return res.status(400).json({ error: 'Item not found' });
        const data = JSON.parse(item.item_data);
        const allowedSlots = ['weapon','armor','boots','amulet','ring','accessory'];
        if (!allowedSlots.includes(data.slot)) return res.status(400).json({ error: `Invalid slot: ${data.slot}` });
        let eq = db.prepare('SELECT * FROM equipment WHERE char_id=?').get(char.id);
        if (!eq) { db.prepare('INSERT INTO equipment (char_id) VALUES (?)').run(char.id); eq = db.prepare('SELECT * FROM equipment WHERE char_id=?').get(char.id); }
        // Ensure accessory_id column exists (migration safety)
        if (data.slot === 'accessory') {
            try { db.prepare('ALTER TABLE equipment ADD COLUMN accessory_id INTEGER').run(); } catch {}
        }
        db.prepare(`UPDATE equipment SET ${data.slot}_id=? WHERE char_id=?`).run(item.id, char.id);
        res.json({ message:`Equipped ${data.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/unequip/:slot', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const slot = req.params.slot;
        if (!['weapon','armor','boots','amulet','ring','accessory'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
        db.prepare(`UPDATE equipment SET ${slot}_id=NULL WHERE char_id=?`).run(char.id);
        res.json({ message:`Unequipped ${slot}.` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Travel ─────────────────────────────────────────────────────────────────
router.post('/travel/start', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { targetZone } = req.body;
        const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const zone = ZONES[targetZone];
        if (!zone) return res.status(400).json({ error: 'Invalid zone' });
        if (character.location === targetZone) return res.status(400).json({ error: 'Already at this zone' });
        if (character.level < zone.minLevel) return res.status(400).json({ error: `Requires level ${zone.minLevel}` });
        if (character.travel_end_time > Math.floor(Date.now() / 1000)) return res.status(400).json({ error: 'Already traveling' });
        const now = Math.floor(Date.now() / 1000);
        const travelTime = zone.travelTime;
        const travelEnd  = now + travelTime;
        db.prepare('UPDATE characters SET travel_target=?,travel_end_time=?,travel_start_time=? WHERE id=?').run(targetZone, travelEnd, now, character.id);
        res.json({ success:true, message:`Traveling to ${zone.name}`, travelEnd, travelStart:now, duration:travelTime });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/travel/cancel', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { paid } = req.body;
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        if (!char.travel_target || !char.travel_end_time || char.travel_end_time <= now) return res.status(400).json({ error: 'Not currently traveling' });
        const travelStart = char.travel_start_time || (char.travel_end_time - 3600);
        const isFreeCancel = (now - travelStart) < 300;
        if (!isFreeCancel) {
            if (!paid) return res.status(400).json({ error: 'Cancel window expired, must pay 1 gem' });
            if ((char.gems || 0) < 1) return res.status(400).json({ error: 'Not enough gems' });
            db.prepare('UPDATE characters SET gems=gems-1 WHERE id=?').run(char.id);
        }
        db.prepare('UPDATE characters SET travel_target=NULL,travel_end_time=0,travel_start_time=0 WHERE id=?').run(char.id);
        res.json({ success:true, wasFree:isFreeCancel });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/travel/status', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = db.prepare('SELECT id,location,travel_target,travel_end_time,travel_start_time FROM characters WHERE user_id=?').get(req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        if (character.travel_target && character.travel_end_time && character.travel_end_time <= now) {
            db.prepare('UPDATE characters SET location=?,travel_target=NULL,travel_end_time=0 WHERE id=?').run(character.travel_target, character.id);
            character.location     = character.travel_target;
            character.travel_target = null;
            character.travel_end_time = 0;
        }
        res.json({
            location:       character.location || 'forest',
            travelTarget:   character.travel_target,
            travelEndTime:  character.travel_end_time || 0,
            travelStartTime:character.travel_start_time || 0,
            traveling:      !!character.travel_target,
            timeRemaining:  character.travel_target ? Math.max(0, character.travel_end_time - now) : 0,
        });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Sell item ──────────────────────────────────────────────────────────────
router.post('/sell/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = db.prepare('SELECT * FROM inventory WHERE id=? AND char_id=?').get(req.params.inventoryId, char.id);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        // Cannot sell equipped items
        const eq = db.prepare('SELECT * FROM equipment WHERE char_id=?').get(char.id);
        if (eq) {
            const equippedIds = ['weapon','armor','boots','amulet','ring','accessory'].map(s => eq[`${s}_id`]).filter(Boolean);
            if (equippedIds.includes(item.id)) return res.status(400).json({ error: 'Unequip the item before selling.' });
        }
        const data = JSON.parse(item.item_data);
        // Sell price = 30% of item price, minimum 1 gold
        const sellPrice = Math.max(1, Math.floor((data.price || 0) * 0.3));
        db.prepare('DELETE FROM inventory WHERE id=?').run(item.id);
        db.prepare('UPDATE characters SET gold=gold+? WHERE id=?').run(sellPrice, char.id);
        const updated = db.prepare('SELECT * FROM characters WHERE id=?').get(char.id);
        res.json({ message:`Sold ${data.name} for ${sellPrice} gold.`, goldEarned: sellPrice, character: buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Use consumable ─────────────────────────────────────────────────────────
router.post('/use/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        applyHpRegen(db, char.id);
        const freshChar = db.prepare('SELECT * FROM characters WHERE id=?').get(char.id);
        const item = db.prepare('SELECT * FROM inventory WHERE id=? AND char_id=?').get(req.params.inventoryId, char.id);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.item_type !== 'consumable') return res.status(400).json({ error: 'Not a consumable' });
        const data = JSON.parse(item.item_data);
        const effect = data.effect;
        if (!effect) return res.status(400).json({ error: 'Item has no effect' });
        const equippedArray = getEquippedItemsArray(db, freshChar.id);
        const hpMax = calcHpMax(freshChar, equippedArray);
        let message = '';
        if (effect.type === 'heal') {
            const newHp = Math.min(hpMax, (freshChar.hp_current ?? hpMax) + effect.value);
            db.prepare('UPDATE characters SET hp_current=? WHERE id=?').run(newHp, char.id);
            message = `Restored ${newHp - (freshChar.hp_current ?? hpMax)} HP.`;
        } else if (effect.type === 'xp') {
            let newXp = (freshChar.xp || 0) + effect.value;
            let newLevel = freshChar.level;
            while (newXp >= LEVEL_XP(newLevel)) { newXp -= LEVEL_XP(newLevel); newLevel++; }
            db.prepare('UPDATE characters SET xp=?,level=? WHERE id=?').run(newXp, newLevel, char.id);
            message = `Gained ${effect.value} XP.${newLevel > freshChar.level ? ' Level up!' : ''}`;
        } else if (effect.type === 'temp_stat') {
            // Temp stats: just give the bonus permanently for simplicity (no duration system yet)
            db.prepare(`UPDATE characters SET ${effect.stat}=${effect.stat}+? WHERE id=?`).run(effect.value, char.id);
            message = `+${effect.value} ${effect.stat} for this session.`;
        } else {
            message = `Used ${data.name}.`;
        }
        // Consume one from stack or delete
        const qty = data.qty || 1;
        if (qty > 1) {
            data.qty = qty - 1;
            db.prepare('UPDATE inventory SET item_data=? WHERE id=?').run(JSON.stringify(data), item.id);
        } else {
            db.prepare('DELETE FROM inventory WHERE id=?').run(item.id);
        }
        const updated = db.prepare('SELECT * FROM characters WHERE id=?').get(char.id);
        res.json({ message, character: buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Shop ───────────────────────────────────────────────────────────────────
router.post('/shop/buy', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { itemId, category, price, priceType, item } = req.body;
        const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!character) return res.status(404).json({ error: 'No character' });
        if (!item) return res.status(400).json({ error: 'Invalid item data' });
        if (priceType === 'gems') { if ((character.gems||0) < price) return res.status(400).json({ error: 'Not enough gems' }); }
        else { if (character.gold < price) return res.status(400).json({ error: 'Not enough gold' }); }
        if (priceType === 'gems') {
            db.prepare('UPDATE characters SET gems=gems-?,total_gems_spent=total_gems_spent+? WHERE id=?').run(price, price, character.id);
        } else {
            db.prepare('UPDATE characters SET gold=gold-? WHERE id=?').run(price, character.id);
        }
        if (item.consumable) {
            const existing = db.prepare(`SELECT * FROM inventory WHERE char_id=? AND item_type='consumable' AND json_extract(item_data,'$.id')=?`).get(character.id, item.id);
            if (existing) {
                const data = JSON.parse(existing.item_data); data.qty = (data.qty||1)+1;
                db.prepare('UPDATE inventory SET item_data=? WHERE id=?').run(JSON.stringify(data), existing.id);
            } else {
                db.prepare(`INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,'consumable',?)`).run(character.id, JSON.stringify({ ...item, qty:1 }));
            }
        } else {
            db.prepare(`INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,'equipment',?)`).run(character.id, JSON.stringify(item));
        }
        const updatedChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(character.id);
        res.json({ success:true, newGold:updatedChar.gold, newGems:updatedChar.gems, character:updatedChar, message:`Purchased ${item.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/shop/items', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        const userId = req.user.userId;
        const userLastGen = db.prepare('SELECT MAX(generation_date) as last_date FROM shop_items WHERE user_id=?').get(userId);
        if (!userLastGen.last_date || shouldResetShop(userLastGen.last_date)) {
            db.prepare('DELETE FROM shop_items WHERE user_id=?').run(userId);
            const newItems = generateBackendInventory(character.level);
            const stmt = db.prepare('INSERT INTO shop_items (user_id,item_data,generation_date) VALUES (?,?,?)');
            for (const item of newItems) stmt.run(userId, JSON.stringify(item), now);
            res.json({ items: newItems, resetTime: getNextMidnight() });
        } else {
            const rows = db.prepare('SELECT item_data,sold FROM shop_items WHERE user_id=? ORDER BY id').all(userId);
            const items = rows.map(row => { const item = JSON.parse(row.item_data); item.sold = row.sold; return item; });
            res.json({ items, resetTime: getNextMidnight(userLastGen.last_date) });
        }
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

function generateBackendInventory(playerLevel) {
    const inventory = [];
    const itemCount = 30 + Math.floor(Math.random() * 10);
    for (let i = 0; i < itemCount; i++) {
        const rand = Math.random();
        const type = rand < 0.3 ? 'weapon' : rand < 0.55 ? 'armor' : rand < 0.75 ? 'accessory' : 'consumable';
        const item = generateBackendRandomItem(playerLevel, type);
        if (item) inventory.push(item);
    }
    for (let i = 0; i < 3; i++) {
        inventory.push({ id:`premium_${Date.now()}_${i}`, name:['XP Booster','Gold Booster','Legendary Crate'][i], emoji:['⚡','💰','📦'][i], desc:'Premium item - increases gains!', price:[200,200,500][i], priceType:'gems', level:1, category:'premium', consumable:true, effect:{type:['xp_multiplier','gold_multiplier','lootbox'][i],value:2,duration:3600} });
    }
    return inventory.sort(() => Math.random() - 0.5);
}
function getNextMidnight() { const next = new Date(); next.setDate(next.getDate()+1); next.setHours(0,0,0,0); return next.getTime(); }
function shouldResetShop(lastGenerationDate) {
    if (!lastGenerationDate) return true;
    const now = new Date(), lastGen = new Date(lastGenerationDate * 1000);
    return now.getDate() !== lastGen.getDate() || now.getMonth() !== lastGen.getMonth() || now.getFullYear() !== lastGen.getFullYear();
}

// ── Matchmaking — find similar opponent ────────────────────────────────────
router.get('/matchmaking', auth, async (req, res) => {
    try {
        const db = await getDb();
        const me = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!me) return res.status(404).json({ error: 'No character' });
        const direction = req.query.direction || 'similar'; // 'similar' | 'weaker' | 'stronger'
        const now = Math.floor(Date.now() / 1000);

        // Ensure cooldown column exists
        try { db.prepare('ALTER TABLE characters ADD COLUMN attack_cooldown_until INTEGER DEFAULT 0').run(); } catch {}
        try { db.prepare('CREATE TABLE IF NOT EXISTS attack_cooldowns (attacker_id INTEGER, defender_id INTEGER, expires_at INTEGER, PRIMARY KEY (attacker_id, defender_id))').run(); } catch {}

        // Total power score = sum of combat stats
        const myPower = (me.strength||0) + (me.defense||0) + (me.agility||0) + (me.magic||0) + me.level * 5;

        let candidates = db.prepare(`
            SELECT c.*, u.username,
                   (c.strength + c.defense + c.agility + c.magic + c.level*5) as power
            FROM characters c
                     JOIN users u ON c.user_id=u.id
            WHERE c.id != ?
          AND (c.attack_cooldown_until IS NULL OR c.attack_cooldown_until < ?)
          AND (c.travel_target IS NULL OR c.travel_end_time <= ?)
          AND (c.hp_current IS NULL OR c.hp_current >= 10)
        `).all(me.id, now, now);

        // Exclude players the attacker is personally on cooldown for
        const myCooldowns = db.prepare('SELECT defender_id FROM attack_cooldowns WHERE attacker_id=? AND expires_at>?').all(me.id, now).map(r => r.defender_id);
        candidates = candidates.filter(c => !myCooldowns.includes(c.id));

        if (!candidates.length) return res.json(null);

        let target;
        if (direction === 'weaker') {
            const weaker = candidates.filter(c => c.power < myPower).sort((a,b) => b.power - a.power);
            target = weaker[0] || null;
        } else if (direction === 'stronger') {
            const stronger = candidates.filter(c => c.power > myPower).sort((a,b) => a.power - b.power);
            target = stronger[0] || null;
        } else {
            // Closest power level
            candidates.sort((a,b) => Math.abs(a.power - myPower) - Math.abs(b.power - myPower));
            target = candidates[0] || null;
        }

        if (!target) return res.json(null);
        res.json(target);
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Attack (zone-based) ────────────────────────────────────────────────────
router.post('/attack/:targetId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const attacker = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!attacker) return res.status(404).json({ error: 'No character' });
        const defender = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.targetId);
        if (!defender) return res.status(404).json({ error: 'Target not found' });
        if (String(defender.user_id) === String(req.user.userId)) return res.status(400).json({ error: 'Cannot attack yourself' });

        const now = Math.floor(Date.now() / 1000);

        // ── Cooldown checks ───────────────────────────────────────────────
        // 1. Attacker can't attack while on a mission
        const atkMission = db.prepare('SELECT id FROM active_missions WHERE character_id=?').get(attacker.id);
        if (atkMission) return res.status(400).json({ error: 'Cannot attack while on a mission.' });

        // 2. Attacker can't attack while traveling
        if (attacker.travel_target && attacker.travel_end_time > now)
            return res.status(400).json({ error: 'Cannot attack while traveling.' });

        // 3. Attacker 10-min global cooldown after any recent battle (can't spam different players either)
        const atkCooldown = attacker.last_battle_at || 0;
        if (atkCooldown + 600 > now) {
            const secs = (atkCooldown + 600) - now;
            return res.status(400).json({ error: `You must wait ${secs < 60 ? secs+'s' : Math.ceil(secs/60)+'m'} before your next attack.` });
        }

        // 4. Defender can't be attacked while on a mission
        const defMission = db.prepare('SELECT id FROM active_missions WHERE character_id=?').get(defender.id);
        if (defMission) return res.status(400).json({ error: 'That player is currently on a mission.' });

        // 5. Defender can't be attacked while traveling
        if (defender.travel_target && defender.travel_end_time > now)
            return res.status(400).json({ error: 'That player is currently traveling.' });

        // 6. Defender 1h global cooldown — any attacker must wait 1h after someone else attacked them
        const defGlobalCooldown = defender.attack_cooldown_until || 0;
        if (defGlobalCooldown > now) {
            const mins = Math.ceil((defGlobalCooldown - now) / 60);
            return res.status(400).json({ error: `That player is in recovery. ${mins < 60 ? mins+'m' : Math.ceil(mins/60)+'h'} remaining.` });
        }

        // 7. Per-target 12h cooldown — same attacker can't re-attack same defender for 12h
        try { db.prepare('CREATE TABLE IF NOT EXISTS attack_cooldowns (attacker_id INTEGER, defender_id INTEGER, expires_at INTEGER, PRIMARY KEY (attacker_id, defender_id))').run(); } catch {}
        const perTarget = db.prepare('SELECT expires_at FROM attack_cooldowns WHERE attacker_id=? AND defender_id=?').get(attacker.id, defender.id);
        if (perTarget && perTarget.expires_at > now) {
            const secs = perTarget.expires_at - now;
            const timeStr = secs < 3600 ? Math.ceil(secs/60)+'m' : Math.ceil(secs/3600)+'h';
            return res.status(400).json({ error: `You cannot attack ${defender.name} again for ${timeStr}.` });
        }

        applyHpRegen(db, attacker.id);
        applyHpRegen(db, defender.id);
        const freshA = db.prepare('SELECT * FROM characters WHERE id=?').get(attacker.id);
        const freshD = db.prepare('SELECT * FROM characters WHERE id=?').get(defender.id);

        const hpA = freshA.hp_current ?? freshA.hp_max;
        if (hpA <= 0) return res.status(400).json({ error: 'You are out of HP. Wait for regen.' });

        // Defender must have at least 10 HP to be attackable
        const equippedD0 = getEquippedItemsArray(db, freshD.id);
        const hpMaxD0 = calcHpMax(freshD, equippedD0);
        const hpD = freshD.hp_current ?? hpMaxD0;
        if (hpD < 10) return res.status(400).json({ error: `${freshD.name} has too little HP to be challenged. Let them recover first.` });

        const equippedA = getEquippedItemsArray(db, freshA.id);
        const equippedD = getEquippedItemsArray(db, freshD.id);
        const { dmgMin:dmgMinA, dmgMax:dmgMaxA } = calcBaseDamage(freshA, equippedA);
        const { dmgMin:dmgMinD, dmgMax:dmgMaxD } = calcBaseDamage(freshD, equippedD);
        const hpMaxA = calcHpMax(freshA, equippedA);
        const hpMaxD = calcHpMax(freshD, equippedD);

        const fighterA = {
            id: freshA.id, name: freshA.name,
            hp: hpA, dmgMin: dmgMinA, dmgMax: dmgMaxA, agility: freshA.agility || 0,
            attackZones: JSON.parse(freshA.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones:  JSON.parse(freshA.block_zones  || 'null') || DEFAULT_BLOCK_ZONES,
        };
        const fighterB = {
            id: freshD.id, name: freshD.name,
            hp: freshD.hp_current ?? hpMaxD, dmgMin: dmgMinD, dmgMax: dmgMaxD, agility: freshD.agility || 0,
            attackZones: JSON.parse(freshD.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones:  JSON.parse(freshD.block_zones  || 'null') || DEFAULT_BLOCK_ZONES,
        };

        const battle      = runBattle(fighterA, fighterB);
        const attackerWon = battle.winnerId === freshA.id;

        // Level-based XP — fighting higher levels earns more, stomping lower levels loses XP
        function calculateBattleXP(winnerLevel, loserLevel) {
            const levelDiff = loserLevel - winnerLevel;
            if (levelDiff <= -5) return -3;
            if (levelDiff <= -3) return -2;
            if (levelDiff <= -2) return -1;
            if (levelDiff <= -1) return 0;
            if (levelDiff === 0) return 1;
            if (levelDiff <= 1) return 1;
            if (levelDiff <= 2) return 2;
            return 3;
        }

        const xpGained = attackerWon
            ? calculateBattleXP(freshA.level, freshD.level)
            : 0; // loser gets no XP

        // Gold stake — 10% of the LOSER's gold goes to the winner
        const atkGoldStake = Math.floor((freshA.gold || 0) * 0.10);
        const defGoldStake = Math.floor((freshD.gold || 0) * 0.10);
        // Attacker gold change: +defStake if won, -atkStake if lost
        const goldGained = attackerWon ? defGoldStake : -atkGoldStake;
        // Defender gold change: opposite
        const defGoldChange = attackerWon ? -defGoldStake : atkGoldStake;

        const newHpA = Math.max(0, battle.hpRemainingA);
        const newHpD = Math.max(0, battle.hpRemainingB);

        // Attacker update — XP can be negative (bullying lower levels)
        let atkXp = Math.max(0, (freshA.xp || 0) + xpGained), atkLevel = freshA.level, leveledUp = false;
        while (atkXp >= LEVEL_XP(atkLevel)) { atkXp -= LEVEL_XP(atkLevel); atkLevel++; leveledUp = true; }
        const atkGoldEarned = goldGained > 0 ? goldGained : 0;
        const atkGoldLost   = goldGained < 0 ? -goldGained : 0;
        db.prepare(`UPDATE characters SET xp=?,gold=MAX(0,gold+?),level=?,wins=wins+?,losses=losses+?,hp_current=?,total_gold_earned=total_gold_earned+?,total_gold_lost=total_gold_lost+? WHERE id=?`)
            .run(atkXp, goldGained, atkLevel, attackerWon?1:0, attackerWon?0:1, newHpA, atkGoldEarned, atkGoldLost, freshA.id);

        // Defender update
        const defGoldEarned = defGoldChange > 0 ? defGoldChange : 0;
        const defGoldLost   = defGoldChange < 0 ? -defGoldChange : 0;
        db.prepare(`UPDATE characters SET gold=MAX(0,gold+?),wins=wins+?,losses=losses+?,hp_current=?,total_gold_earned=total_gold_earned+?,total_gold_lost=total_gold_lost+? WHERE id=?`)
            .run(defGoldChange, attackerWon?0:1, attackerWon?1:0, newHpD, defGoldEarned, defGoldLost, freshD.id);

        // Save battle to history (separate try so failures don't block messages)
        try {
            db.prepare(`INSERT INTO battles (attacker_id,defender_id,winner_id,attacker_name,defender_name,log,fought_at,battle_type,xp_gained,gold_gained) VALUES (?,?,?,?,?,?,?,?,?,?)`)
                .run(freshA.id, freshD.id, battle.winnerId, freshA.name, freshD.name, JSON.stringify(battle.log), now, 'pvp', xpGained, Math.abs(goldGained));
        } catch (e) {
            try { db.prepare('INSERT INTO battles (attacker_id,defender_id,winner_id,log) VALUES (?,?,?,?)').run(freshA.id, freshD.id, battle.winnerId, JSON.stringify(battle.log)); } catch {}
        }

        // ── Set cooldowns ──────────────────────────────────────────────────
        // Attacker: 10-min global cooldown before they can attack anyone again
        try {
            db.prepare('UPDATE characters SET last_battle_at=? WHERE id=?').run(now, freshA.id);
        } catch {
            try { db.prepare('ALTER TABLE characters ADD COLUMN last_battle_at INTEGER DEFAULT 0').run(); } catch {}
            try { db.prepare('UPDATE characters SET last_battle_at=? WHERE id=?').run(now, freshA.id); } catch {}
        }
        // Per-target: same attacker can't re-attack same defender for 12h
        try {
            db.prepare('INSERT OR REPLACE INTO attack_cooldowns (attacker_id,defender_id,expires_at) VALUES (?,?,?)').run(freshA.id, freshD.id, now + 43200);
        } catch {}
        // Global defender: anyone must wait 1h before attacking this defender again
        try {
            db.prepare('UPDATE characters SET attack_cooldown_until=? WHERE id=?').run(now + 3600, freshD.id);
        } catch {
            try { db.prepare('ALTER TABLE characters ADD COLUMN attack_cooldown_until INTEGER DEFAULT 0').run(); } catch {}
            try { db.prepare('UPDATE characters SET attack_cooldown_until=? WHERE id=?').run(now + 3600, freshD.id); } catch {}
        }

        // Auto-message: battle report to both fighters (separate try)
        try {
            const goldStakeDisplay = attackerWon ? defGoldStake : atkGoldStake;
            const defSubject = attackerWon
                ? `⚔️ ${freshA.name} attacked and defeated you! (-${defGoldStake} gold)`
                : `🛡️ You defended against ${freshA.name} and won! (+${atkGoldStake} gold)`;
            const defPayload = JSON.stringify({ log: battle.log, won: !attackerWon, goldEarned: defGoldChange > 0 ? defGoldChange : 0, goldLost: defGoldChange < 0 ? -defGoldChange : 0, xpEarned: 0, type: 'pvp', opponentName: freshA.name });
            db.prepare('INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)').run(freshA.id, freshD.id, defSubject, `BATTLE_REPORT:${defPayload}`);
        } catch (e) { console.error('Failed to send defender report:', e); }

        try {
            const atkSubject = attackerWon
                ? `⚔️ You defeated ${freshD.name}! (+${defGoldStake} gold)`
                : `💀 You lost to ${freshD.name}. (-${atkGoldStake} gold)`;
            const atkPayload = JSON.stringify({ log: battle.log, won: attackerWon, goldEarned: goldGained > 0 ? goldGained : 0, goldLost: goldGained < 0 ? -goldGained : 0, xpEarned: xpGained, type: 'pvp', opponentName: freshD.name });
            db.prepare('INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)').run(freshA.id, freshA.id, atkSubject, `BATTLE_REPORT:${atkPayload}`);
        } catch (e) { console.error('Failed to send attacker report:', e); }

        const updatedAttacker = db.prepare('SELECT * FROM characters WHERE id=?').get(freshA.id);
        res.json({
            won: attackerWon, log: battle.log,
            xpGained,
            goldGained: goldGained > 0 ? goldGained : 0,
            goldLost:   goldGained < 0 ? -goldGained : 0,
            leveledUp,
            character: buildCharacterResponse(updatedAttacker, db),
        });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Leaderboard ────────────────────────────────────────────────────────────
router.get('/leaderboard', auth, async (req, res) => {
    try {
        const db = await getDb();
        const allowedSorts = ['wins','losses','gold','level','total_gold_earned'];
        const sort = allowedSorts.includes(req.query.sort) ? req.query.sort : 'total_gold_earned';
        const players = db.prepare(`SELECT c.id,c.name,c.class,c.level,c.xp,c.gold,c.total_gold_earned,c.strength,c.defense,c.agility,c.magic,c.wins,c.losses,u.username
                                    FROM characters c JOIN users u ON c.user_id=u.id ORDER BY c.${sort} DESC,c.level DESC LIMIT 2000`).all();
        res.json(players.map((p,i) => ({ ...p, rank:i+1 })));
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Player profile ─────────────────────────────────────────────────────────
router.get('/player/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        const me = db.prepare('SELECT id FROM characters WHERE user_id=?').get(req.user.userId);
        const player = db.prepare(`SELECT c.*,u.username FROM characters c JOIN users u ON c.user_id=u.id WHERE c.id=?`).get(req.params.id);
        if (!player) return res.status(404).json({ error: 'Not found' });
        const now = Math.floor(Date.now() / 1000);
        // Check if this player is on global attack cooldown
        const globalCooldown = (player.attack_cooldown_until || 0) > now ? player.attack_cooldown_until - now : 0;
        // Check per-target cooldown (can I attack this person right now?)
        let perTargetCooldown = 0;
        if (me) {
            try {
                const cd = db.prepare('SELECT expires_at FROM attack_cooldowns WHERE attacker_id=? AND defender_id=?').get(me.id, player.id);
                if (cd && cd.expires_at > now) perTargetCooldown = cd.expires_at - now;
            } catch {}
        }
        // Check if on mission or traveling
        const onMission = !!db.prepare('SELECT id FROM active_missions WHERE character_id=?').get(player.id);
        const onTravel  = !!(player.travel_target && player.travel_end_time > now);
        const hpLow     = (player.hp_current !== null && player.hp_current !== undefined) && player.hp_current < 10;
        const battles = db.prepare(`SELECT b.*,a.name as attacker_name,d.name as defender_name,w.name as winner_name
                                    FROM battles b JOIN characters a ON b.attacker_id=a.id JOIN characters d ON b.defender_id=d.id JOIN characters w ON b.winner_id=w.id
                                    WHERE b.attacker_id=? OR b.defender_id=? ORDER BY b.fought_at DESC LIMIT 5`).all(player.id, player.id);
        res.json({ ...player, globalCooldown, perTargetCooldown, onMission, onTravel, recentBattles: battles.map(b => ({ ...b, log: JSON.parse(b.log) })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Battle history ─────────────────────────────────────────────────────────
router.get('/battles', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const battles = db.prepare(`SELECT b.*,a.name as attacker_name,a.class as attacker_class,d.name as defender_name,d.class as defender_class,w.name as winner_name
                                    FROM battles b JOIN characters a ON b.attacker_id=a.id JOIN characters d ON b.defender_id=d.id JOIN characters w ON b.winner_id=w.id
                                    WHERE b.attacker_id=? OR b.defender_id=? ORDER BY b.fought_at DESC LIMIT 10`).all(char.id, char.id);
        res.json(battles.map(b => ({ ...b, log: JSON.parse(b.log) })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Messages ───────────────────────────────────────────────────────────────
router.get('/messages', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const messages = db.prepare(`SELECT m.*,s.name as sender_name,r.name as receiver_name FROM messages m
                                                                                                       JOIN characters s ON m.sender_id=s.id JOIN characters r ON m.receiver_id=r.id
                                     WHERE m.receiver_id=? ORDER BY m.sent_at DESC LIMIT 50`).all(char.id);
        res.json(messages);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/messages/unread-count', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!char) return res.json({ count:0 });
        const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE receiver_id=? AND read=0').get(char.id);
        res.json({ count: row?.count || 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/messages/send', auth, async (req, res) => {
    try {
        const db = await getDb();
        const sender = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        if (!sender) return res.status(404).json({ error: 'No character' });
        const { receiver_id, subject, body } = req.body;
        if (!receiver_id || !subject || !body) return res.status(400).json({ error: 'Missing fields' });
        if (String(receiver_id) === String(sender.id)) return res.status(400).json({ error: 'Cannot message yourself' });
        db.prepare('INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)').run(sender.id, receiver_id, subject, body);
        res.json({ message:'Sent!' });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});
router.post('/messages/:id/read', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        db.prepare('UPDATE messages SET read=1 WHERE id=? AND receiver_id=?').run(req.params.id, char.id);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/messages/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.user.userId);
        db.prepare('DELETE FROM messages WHERE id=? AND receiver_id=?').run(req.params.id, char.id);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
