const express = require('express');
const { getDb } = require('./db');
const auth = require('./middleware');
const skillsModule = require('./skills');
const { ZONES, ABYSS_ZONES, ABYSS_ROUTES, ABYSS_ENTRY, RAW_MATERIALS, COMPONENTS, EQUIPMENT_RECIPES, CRAFTING_SETS, generateMission, TIER_COLORS, TIER_LABELS, LOOT_BOXES } = require('./gamedata');

// Import skill tree functions
const { 
    applyClassUpgradeCostModifier, 
    computePassiveBonuses, 
    computeActiveCombatEffects, 
    computeClassModifiers, 
    rogueHasDualWield,
    // NEW progressive functions
    computePassiveBonusesWithProgress,
    computeActiveCombatEffectsWithProgress,
    computeClassModifiersWithProgress
} = require('./skills');

BigInt.prototype.toJSON = function() { return Number(this); };

const router = express.Router();
const _missionStartLock = new Set();

// Define ELEMENTS array (was missing!)
const ELEMENTS = ['pyro', 'water', 'wind', 'electro'];

// ── Adventurer's Guild Exchanges ─────────────────────────────────────
const GUILD_EXCHANGES = [
    { id: 'exchange_gold', name: 'Exchange Dungeon Gold', cost: { dungeonGold: 100 }, reward: { gold: 80, reputation: 1 } },
    { id: 'exchange_materials', name: 'Material Bounty', cost: { crypt_dust: 10, void_shard: 5 }, reward: { gold: 200, reputation: 2 } },
    { id: 'exchange_rare', name: 'Rare Material Bounty', cost: { dragon_scale: 3, soul_essence: 2 }, reward: { gold: 500, reputation: 5, item: 'Rare Item Chest' } },
    { id: 'exchange_legendary', name: 'Legendary Exchange', cost: { abyssal_core: 2, titan_heart: 1 }, reward: { gold: 2000, reputation: 20, item: 'Legendary Item Chest' } },
];

const DUNGEON_GUILD_BOUNTY_POOL = [
    { id: 'bounty_skeleton', monsterKey: 'skeleton', monsterName: 'Skeleton Warrior', minCount: 5, maxCount: 9, rewardGold: 450, rewardReputation: 3 },
    { id: 'bounty_ghost', monsterKey: 'ghost', monsterName: 'Wailing Ghost', minCount: 5, maxCount: 8, rewardGold: 480, rewardReputation: 3 },
    { id: 'bounty_zombie', monsterKey: 'zombie', monsterName: 'Rotting Zombie', minCount: 5, maxCount: 8, rewardGold: 500, rewardReputation: 3 },
    { id: 'bounty_fire_imp', monsterKey: 'fire_imp', monsterName: 'Fire Imp', minCount: 4, maxCount: 7, rewardGold: 600, rewardReputation: 4 },
    { id: 'bounty_void_wraith', monsterKey: 'void_wraith', monsterName: 'Void Wraith', minCount: 4, maxCount: 6, rewardGold: 720, rewardReputation: 5 },
    { id: 'bounty_abyssal_eye', monsterKey: 'abyssal_eye', monsterName: 'Abyssal Eye', minCount: 3, maxCount: 5, rewardGold: 850, rewardReputation: 6 },
    { id: 'bounty_shadow_lord', monsterKey: 'shadow_lord', monsterName: 'Shadow Lord', minCount: 2, maxCount: 4, rewardGold: 1100, rewardReputation: 8 },
    { id: 'bounty_dread_knight', monsterKey: 'dread_knight', monsterName: 'Dread Knight', minCount: 2, maxCount: 4, rewardGold: 1400, rewardReputation: 10 },
];

const WEEKLY_TASK_MATERIAL_OPTIONS = [
    'mithril_ore',
    'frost_essence',
    'dragon_scale_shard',
    'arcane_dust',
    'void_shard'
];

const WEEKLY_TASKS = [
    {
        id: 'weekly_mp_1000',
        name: 'Arcane Expenditure',
        icon: '🔮',
        desc: 'Spend 1,000 MP this week.',
        metric: 'mp_spent',
        target: 1000,
        rewards: { gems: 5 }
    },
    {
        id: 'weekly_wins_12',
        name: 'Victor\'s Purse',
        icon: '⚔️',
        desc: 'Win 12 battles this week.',
        metric: 'wins',
        target: 12,
        rewards: { gold: 25000 }
    },
    {
        id: 'weekly_material_choice',
        name: 'Quartermaster\'s Pick',
        icon: '🧱',
        desc: 'Complete 10 battles this week and choose rare materials.',
        metric: 'battles',
        target: 10,
        rewards: { choose_material: { qty: 5, options: WEEKLY_TASK_MATERIAL_OPTIONS } }
    },
    {
        id: 'weekly_battles_25',
        name: 'Warpath',
        icon: '🎁',
        desc: 'Complete 25 battles this week.',
        metric: 'battles',
        target: 25,
        rewards: { lootbox: { id: 'lootbox_rare', qty: 1 } }
    }
];

// ── DB Migrations ─────────────────────────────────────────────────────────
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
            'ALTER TABLE equipment ADD COLUMN helmet_id INTEGER',
            'ALTER TABLE equipment ADD COLUMN shield_id INTEGER',
            'ALTER TABLE characters ADD COLUMN hit_chance INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN crit_chance INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN mission_points INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN mp_last_regen_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN total_mp_earned INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN total_mp_spent INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN daily_mp_spent INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN daily_mp_reset_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN active_skills TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN skill_last_used TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN premium_features TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN dungeon_tokens INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN dungeon_floor INTEGER DEFAULT 1',
            'ALTER TABLE characters ADD COLUMN dungeon_highest_floor INTEGER DEFAULT 1',
            'ALTER TABLE characters ADD COLUMN dungeon_progress TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN dungeon_gold INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN guild_reputation INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN last_health_potion_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN unlocked_zones TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN last_free_gems_claim_at INTEGER DEFAULT 0',
            `ALTER TABLE characters ADD COLUMN current_map TEXT DEFAULT 'overworld'`,
            `ALTER TABLE active_missions ADD COLUMN map_type TEXT DEFAULT 'overworld'`,
            'ALTER TABLE users ADD COLUMN active_character_id INTEGER DEFAULT NULL',
            'ALTER TABLE shop_items ADD COLUMN char_id INTEGER DEFAULT NULL',
            'ALTER TABLE character_weekly_state ADD COLUMN mission_fights_base INTEGER DEFAULT 0',
        ];
        for (const sql of migrations) {
            try { await db.execute({ sql, args: [] }); } catch {}
        }
        try {
            const charTable = await dbGet(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='characters'");
            const charSql = charTable?.sql || '';
            const hasLegacySingleCharConstraint =
                /user_id\s+INTEGER\s+UNIQUE\s+NOT\s+NULL/i.test(charSql) ||
                /user_id\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i.test(charSql);
            if (hasLegacySingleCharConstraint) {
                const rebuiltSql = charSql
                    .replace(/^CREATE TABLE\s+characters/i, 'CREATE TABLE characters_new')
                    .replace(/user_id\s+INTEGER\s+UNIQUE\s+NOT\s+NULL/i, 'user_id INTEGER NOT NULL')
                    .replace(/user_id\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i, 'user_id INTEGER NOT NULL');
                await db.execute({ sql: 'PRAGMA foreign_keys = OFF', args: [] });
                await db.execute({ sql: rebuiltSql, args: [] });
                await db.execute({ sql: 'INSERT INTO characters_new SELECT * FROM characters', args: [] });
                await db.execute({ sql: 'DROP TABLE characters', args: [] });
                await db.execute({ sql: 'ALTER TABLE characters_new RENAME TO characters', args: [] });
                await db.execute({ sql: 'PRAGMA foreign_keys = ON', args: [] });
            }
        } catch (e) {
            console.error('Character schema migration error:', e.message);
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
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS account_attack_cooldowns (
            attacker_user_id INTEGER,
            defender_user_id INTEGER,
            expires_at INTEGER,
            PRIMARY KEY (attacker_user_id, defender_user_id)
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS bug_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_timestamp TEXT NOT NULL,
            username TEXT,
            character_name TEXT,
            character_level INTEGER DEFAULT 0,
            character_class TEXT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            steps_to_reproduce TEXT,
            browser TEXT,
            game_location TEXT,
            game_hp INTEGER DEFAULT 0,
            game_gold INTEGER DEFAULT 0,
            game_level INTEGER DEFAULT 0,
            has_screenshot INTEGER DEFAULT 0
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS bug_screenshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bug_report_id INTEGER NOT NULL,
            filename TEXT,
            image_data BLOB NOT NULL,
            mime_type TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS character_achievements (
            char_id INTEGER NOT NULL,
            achievement_id TEXT NOT NULL,
            claimed_at INTEGER NOT NULL,
            PRIMARY KEY (char_id, achievement_id)
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS character_mission_spot_stats (
            char_id INTEGER NOT NULL,
            map_type TEXT NOT NULL DEFAULT 'overworld',
            zone_id TEXT NOT NULL,
            spot_id TEXT NOT NULL,
            fights INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            last_fought_at INTEGER NOT NULL DEFAULT 0,
            last_won_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (char_id, map_type, spot_id)
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS character_monster_stats (
            char_id INTEGER NOT NULL,
            source TEXT NOT NULL,
            monster_key TEXT NOT NULL,
            monster_name TEXT NOT NULL,
            kills INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            last_defeated_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (char_id, source, monster_key)
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS character_guild_bounties (
            char_id INTEGER PRIMARY KEY,
            bounty_id TEXT NOT NULL,
            target_source TEXT NOT NULL,
            target_key TEXT NOT NULL,
            target_name TEXT NOT NULL,
            target_count INTEGER NOT NULL DEFAULT 0,
            progress INTEGER NOT NULL DEFAULT 0,
            reward_gold INTEGER NOT NULL DEFAULT 0,
            reward_reputation INTEGER NOT NULL DEFAULT 0,
            completed_at INTEGER NOT NULL DEFAULT 0,
            claimed_at INTEGER NOT NULL DEFAULT 0,
            rolled_at INTEGER NOT NULL DEFAULT 0
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS character_weekly_state (
            char_id INTEGER PRIMARY KEY,
            week_start INTEGER NOT NULL,
            mp_spent_base INTEGER NOT NULL DEFAULT 0,
            wins_base INTEGER NOT NULL DEFAULT 0,
            losses_base INTEGER NOT NULL DEFAULT 0,
            mission_fights_base INTEGER NOT NULL DEFAULT 0
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS character_weekly_claims (
            char_id INTEGER NOT NULL,
            week_start INTEGER NOT NULL,
            task_id TEXT NOT NULL,
            claimed_at INTEGER NOT NULL,
            PRIMARY KEY (char_id, week_start, task_id)
        )`, args: [] });
        
        // Skill tree migrations
        const { SKILL_TREE_MIGRATIONS } = require('./skills');
        for (const sql of SKILL_TREE_MIGRATIONS) {
            try { await db.execute({ sql, args: [] }); } catch {}
        }
        
        console.log('✅ DB migrations applied');
    } catch (e) { console.error('Migration error:', e.message); }
})();

// ── Class definitions ─────────────────────────────────────────────────────
const CLASSES = {
    warrior:  { strength:16, defense:14, agility:10, magic:5,  hp_max:130 },
    mage:     { strength:8,  defense:8,  agility:10, magic:20, hp_max:90  },
    rogue:    { strength:12, defense:8,  agility:20, magic:6,  hp_max:100 },
    paladin:  { strength:12, defense:16, agility:8,  magic:12, hp_max:120 },
};
const CLASS_DISCOUNTS = {
    // Positive = discount (benefit), Negative = penalty
    warrior:  { strength:0.30, defense:0.15, agility:0,    magic:0,    vitality:0.10 },
    mage:     { strength:-0.50, defense:-0.30, agility:0.10, magic:0.35, vitality:0    },  // -50% = +50% cost
    rogue:    { strength:0.10, defense:-0.30, agility:0.35, magic:-0.20, vitality:0    },  // -30% defense cost penalty
    paladin:  { strength:-0.20, defense:0.25, agility:-0.60, magic:0.20, vitality:0.15 },  // -60% agility cost penalty
};
const UPGRADE_BASE = 5;
const UPGRADE_EXPONENT = 1.705;
function upgradeCost(stat, currentVal, charClass) {
    const raw = Math.floor(UPGRADE_BASE * Math.pow(currentVal, UPGRADE_EXPONENT));
    // No class discounts here - those come from skill tree
    return Math.max(10, raw);
}

// ── Component Upgrade Values ─────────────────────────────────────────────
const COMPONENT_UPGRADE_VALUES = {
    iron_ingot: { bonus: 2, name: 'Iron Ingot' },
    hardwood_plank: { bonus: 2, name: 'Hardwood Plank' },
    tanned_hide: { bonus: 2, name: 'Tanned Hide' },
    poison_extract: { bonus: 3, name: 'Poison Extract' },
    frost_core: { bonus: 3, name: 'Frost Core' },
    mithril_ingot: { bonus: 4, name: 'Mithril Ingot' },
    arcane_shard: { bonus: 4, name: 'Arcane Shard' },
    dragon_plate: { bonus: 6, name: 'Dragon Plate' },
    void_crystal: { bonus: 6, name: 'Void Crystal' },
    legendary_fragment: { bonus: 5, name: 'Legendary Fragment' },
    demon_core: { bonus: 7, name: 'Demon Core' },
    shadow_weave: { bonus: 8, name: 'Shadow Weave' },
    demon_alloy: { bonus: 10, name: 'Demon Alloy' }
};

// Also define POSSIBLE_STATS if not already defined
const POSSIBLE_STATS = [
    'strength', 'defense', 'agility', 'magic', 'vitality',
    'hit_chance', 'crit_chance', 'armor', 'hp_max',
    'dmg_min', 'dmg_max', 'pyro_dmg', 'water_dmg', 'wind_dmg', 'electro_dmg',
    'pyro_resist', 'water_resist', 'wind_resist', 'electro_resist'
];

const TRAINING_DURATION_SEC = 6000;
const TRAINING_GAIN = 1;
const LEVEL_XP = (l) => l * 25;

// ── Upgrade Equipment ─────────────────────────────────────────────────────
const UPGRADE_MATERIALS = {
    1: {  // +1 upgrade
        materials: { legendary_fragment: 1 },
        goldCost: 10000,
        successRate: 1.0  // 100%
    },
    2: {  // +2 upgrade
        materials: { legendary_fragment: 2 },
        goldCost: 25000,
        successRate: 0.9  // 90%
    },
    3: {  // +3 upgrade
        materials: { legendary_fragment: 3, demon_core: 1 },
        goldCost: 50000,
        successRate: 0.7  // 70%
    },
    4: {  // +4 upgrade
        materials: { legendary_fragment: 5, demon_core: 2, void_crystal: 1 },
        goldCost: 100000,
        successRate: 0.5  // 50%
    },
    5: {  // +5 upgrade (max)
        materials: { legendary_fragment: 8, demon_core: 3, void_crystal: 2, shadow_weave: 1 },
        goldCost: 200000,
        successRate: 0.3  // 30%
    }
};
console.log('COMPONENT_UPGRADE_VALUES defined?', typeof COMPONENT_UPGRADE_VALUES);
console.log('Keys:', Object.keys(COMPONENT_UPGRADE_VALUES || {}));

// ── Zone-based battle constants ───────────────────────────────────────────
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
    counter_stance:{ protects: ['chest','solar_plexus'],   reduction: 0.55, special: 'counter_25' },
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
const PREMIUM_DURATION = 30 * 24 * 3600; // 30 days
const HEALTH_POTION_COOLDOWN = 30 * 60;

// ── Premium Features ───────────────────────────────────────────────────────
const PREMIUM_FEATURES = {
    arcane_reservoir: {
        id: 'arcane_reservoir', name: 'Arcane Reservoir', emoji: '🔮', cost: 30,
        desc: '2× max MP (480) and 2× MP regen (+20/hr instead of +10/hr).',
        effect: { mp_max_mult: 2, mp_regen_mult: 2 },
    },
    warlord: {
        id: 'warlord', name: 'Warlord', emoji: '⚔️', cost: 25,
        desc: '+15% damage and +10% hit chance on attacks.',
        effect: { atk_dmg_bonus: 0.15, atk_hit_bonus: 0.10 },
    },
    iron_fortress: {
        id: 'iron_fortress', name: 'Iron Fortress', emoji: '🏰', cost: 25,
        desc: '+10% agility and +15% armor when defending.',
        effect: { def_agility_bonus: 0.10, def_armor_bonus: 0.15 },
    },
    apprentice: {
        id: 'apprentice', name: 'Apprentice', emoji: '📚', cost: 15,
        desc: 'All stat upgrade costs reduced by 20%.',
        effect: { upgrade_discount: 0.20 },
    },
    vault_keeper: {
        id: 'vault_keeper', name: 'Vault Keeper', emoji: '🏦', cost: 20,
        desc: 'Lose only 5% gold on PvP defeat instead of 10%.',
        effect: { gold_loss_reduction: 0.50 },
    },
    fortune_hunter: {
        id: 'fortune_hunter', name: 'Fortune Hunter', emoji: '💰', cost: 20,
        desc: '+30% gold from missions. Mission and duel cooldowns 50% shorter.',
        effect: { gold_bonus: 0.30, cooldown_reduction: 0.50 },
    },
};

// ── Premium Synergy Bonuses ────────────────────────────────────────────────
const PREMIUM_SYNERGIES = [
    {
        requires: ['warlord', 'iron_fortress'],
        name: 'Veteran', emoji: '🎖️',
        desc: '+5% crit chance while both Warlord and Iron Fortress are active.',
        effect: { crit_bonus: 0.05 },
    },
    {
        requires: ['arcane_reservoir', 'fortune_hunter'],
        name: 'Midas Flow', emoji: '✨',
        desc: 'Mission MP cost reduced by 10 while both Arcane Reservoir and Fortune Hunter are active.',
        effect: { mp_cost_reduction: 10 },
    },
    {
        requires: ['vault_keeper', 'apprentice'],
        name: 'Merchant Prince', emoji: '👑',
        desc: 'Sell items for 40% of value instead of 30% while both are active.',
        effect: { sell_bonus: 0.10 },
    },
];

const PREMIUM_ULTIMATE = {
    name: 'Ascendant', emoji: '🌟',
    desc: 'All 6 features active: +50% XP from all sources and +1% to all stats.',
    effect: { xp_bonus: 0.50, all_stats_pct: 0.01 },
};

function getActivePremium(char) {
    if (!char.premium_features) return {};
    try {
        const feats = JSON.parse(char.premium_features);
        const now = Math.floor(Date.now() / 1000);
        const active = {};
        for (const [id, expiresAt] of Object.entries(feats)) {
            if (expiresAt > now) active[id] = expiresAt;
        }
        return active;
    } catch { return {}; }
}

function hasPremium(activePremium, featureId) {
    return !!activePremium[featureId];
}

function getActiveSynergies(activePremium) {
    const active = [];
    for (const syn of PREMIUM_SYNERGIES) {
        if (syn.requires.every(id => hasPremium(activePremium, id))) {
            active.push(syn);
        }
    }
    return active;
}

function hasUltimate(activePremium) {
    return Object.keys(PREMIUM_FEATURES).every(id => hasPremium(activePremium, id));
}

// ── Dungeon Premium Rewards ────────────────────────────────────────────────
const PREMIUM_FEATURE_IDS = Object.keys(PREMIUM_FEATURES);

function getRandomPremiumFeature(days = null) {
    // Randomly select one of the available premium features
    const featureId = PREMIUM_FEATURE_IDS[Math.floor(Math.random() * PREMIUM_FEATURE_IDS.length)];
    const feature = PREMIUM_FEATURES[featureId];
    
    // Random duration between 5-10 days (in seconds)
    const durationDays = days || (5 + Math.floor(Math.random() * 6)); // 5-10 days
    const durationSeconds = durationDays * 24 * 3600;
    
    return {
        id: featureId,
        name: feature.name,
        emoji: feature.emoji,
        durationDays: durationDays,
        durationSeconds: durationSeconds,
        description: feature.desc
    };
}

function applyPremiumFeatureToCharacter(char, featureId, durationSeconds) {
    const now = Math.floor(Date.now() / 1000);
    let activePrem = {};
    
    try {
        if (char.premium_features) {
            activePrem = JSON.parse(char.premium_features);
        }
    } catch {}
    
    // Add or extend the premium feature
    const currentExpiry = activePrem[featureId] || 0;
    const newExpiry = Math.max(currentExpiry, now) + durationSeconds;
    activePrem[featureId] = newExpiry;
    
    return activePrem;
}

const ACHIEVEMENTS = [
    {
        id: 'wins_1',
        chain: 'wins',
        category: 'victories',
        name: 'First Blood',
        desc: 'Win your first PvP battle.',
        icon: '⚔️',
        metric: 'wins',
        target: 1,
        rewards: { gold: 1000, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'wins_10',
        chain: 'wins',
        category: 'victories',
        name: 'Arena Regular',
        desc: 'Reach 10 victories.',
        icon: '🛡️',
        metric: 'wins',
        target: 10,
        rewards: { gold: 5000, consumable: { id: 'potion_mana', qty: 2 } },
    },
    {
        id: 'wins_25',
        chain: 'wins',
        category: 'victories',
        name: 'Battle-Tested',
        desc: 'Reach 25 victories.',
        icon: '🏅',
        metric: 'wins',
        target: 25,
        rewards: { gold: 12000, lootbox: { id: 'lootbox_novice', qty: 1 } },
    },
    {
        id: 'wins_50',
        chain: 'wins',
        category: 'victories',
        name: 'Champion Spark',
        desc: 'Reach 50 victories.',
        icon: '🔥',
        metric: 'wins',
        target: 50,
        rewards: { gold: 25000, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'wins_100',
        chain: 'wins',
        category: 'victories',
        name: 'Centurion of the Arena',
        desc: 'Reach 100 victories.',
        icon: '💎',
        metric: 'wins',
        target: 100,
        rewards: { gold: 50000, gems: 10, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
    {
        id: 'wins_500',
        chain: 'wins',
        category: 'victories',
        name: 'Warpath',
        desc: 'Reach 500 victories.',
        icon: '👑',
        metric: 'wins',
        target: 500,
        rewards: { gold: 200000, gems: 35, lootbox: { id: 'lootbox_epic', qty: 1 } },
    },
    {
        id: 'wins_1000',
        chain: 'wins',
        category: 'victories',
        name: 'Legend of Steel',
        desc: 'Reach 1,000 victories.',
        icon: '🌟',
        metric: 'wins',
        target: 1000,
        rewards: { gold: 500000, gems: 80, premium: { id: 'apprentice', days: 7 } },
    },
    {
        id: 'wins_2500',
        chain: 'wins',
        category: 'victories',
        name: 'Mythic Conqueror',
        desc: 'Reach 2,500 victories.',
        icon: '🏆',
        metric: 'wins',
        target: 2500,
        rewards: { gold: 1500000, gems: 200, lootbox: { id: 'lootbox_legendary', qty: 1 }, premium: { id: 'fortune_hunter', days: 14 } },
    },
    {
        id: 'battles_25',
        chain: 'battles',
        category: 'battles',
        name: 'Scarred Veteran',
        desc: 'Fight 25 total battles.',
        icon: '🗡️',
        metric: 'battles',
        target: 25,
        rewards: { gold: 4000, consumable: { id: 'potion_mana', qty: 1 } },
    },
    {
        id: 'battles_100',
        chain: 'battles',
        category: 'battles',
        name: 'Seasoned Duelist',
        desc: 'Fight 100 total battles.',
        icon: '📜',
        metric: 'battles',
        target: 100,
        rewards: { gold: 15000, lootbox: { id: 'lootbox_novice', qty: 1 } },
    },
    {
        id: 'battles_500',
        chain: 'battles',
        category: 'battles',
        name: 'Arena Fixture',
        desc: 'Fight 500 total battles.',
        icon: '⚜️',
        metric: 'battles',
        target: 500,
        rewards: { gold: 100000, consumable: { id: 'special_mana_potion', qty: 2 } },
    },
    {
        id: 'gold_10000',
        chain: 'gold_earned',
        category: 'wealth',
        name: 'First Fortune',
        desc: 'Earn 10,000 total gold.',
        icon: '💰',
        metric: 'gold_earned',
        target: 10000,
        rewards: { gold: 3000, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'gold_100000',
        chain: 'gold_earned',
        category: 'wealth',
        name: 'Treasure Hoard',
        desc: 'Earn 100,000 total gold.',
        icon: '🪙',
        metric: 'gold_earned',
        target: 100000,
        rewards: { gold: 25000, gems: 5, consumable: { id: 'potion_mana', qty: 3 } },
    },
    {
        id: 'gold_1000000',
        chain: 'gold_earned',
        category: 'wealth',
        name: 'Golden Legend',
        desc: 'Earn 1,000,000 total gold.',
        icon: '🏦',
        metric: 'gold_earned',
        target: 1000000,
        rewards: { gold: 200000, gems: 30, lootbox: { id: 'lootbox_epic', qty: 1 } },
    },
    {
        id: 'floor_5',
        chain: 'dungeon_floor',
        category: 'dungeon',
        name: 'Into the Deep',
        desc: 'Reach dungeon floor 5.',
        icon: '🕳️',
        metric: 'dungeon_floor',
        target: 5,
        rewards: { gold: 7500, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'floor_10',
        chain: 'dungeon_floor',
        category: 'dungeon',
        name: 'Abyss Diver',
        desc: 'Reach dungeon floor 10.',
        icon: '🌑',
        metric: 'dungeon_floor',
        target: 10,
        rewards: { gold: 20000, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'floor_25',
        chain: 'dungeon_floor',
        category: 'dungeon',
        name: 'Underworld Walker',
        desc: 'Reach dungeon floor 25.',
        icon: '👁️',
        metric: 'dungeon_floor',
        target: 25,
        rewards: { gold: 75000, gems: 20, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
    {
        id: 'floor_50',
        chain: 'dungeon_floor',
        category: 'dungeon',
        name: 'Abyss Sovereign',
        desc: 'Reach dungeon floor 50.',
        icon: '👹',
        metric: 'dungeon_floor',
        target: 50,
        rewards: { gold: 250000, gems: 60, premium: { id: 'iron_fortress', days: 10 } },
    },
    {
        id: 'mp_60',
        chain: 'mp_spent',
        category: 'missions',
        name: 'Mana Investor',
        desc: 'Spend 60 total MP on missions and conversions.',
        icon: '🔮',
        metric: 'mp_spent',
        target: 60,
        rewards: { gold: 2500, consumable: { id: 'potion_mana', qty: 1 } },
    },
    {
        id: 'mp_300',
        chain: 'mp_spent',
        category: 'missions',
        name: 'Mission Addict',
        desc: 'Spend 300 total MP.',
        icon: '✨',
        metric: 'mp_spent',
        target: 300,
        rewards: { gold: 10000, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'mp_1000',
        chain: 'mp_spent',
        category: 'missions',
        name: 'Arcane Workhorse',
        desc: 'Spend 1,000 total MP.',
        icon: '🧪',
        metric: 'mp_spent',
        target: 1000,
        rewards: { gold: 40000, gems: 8, lootbox: { id: 'lootbox_novice', qty: 1 } },
    },
    {
        id: 'mp_5000',
        chain: 'mp_spent',
        category: 'missions',
        name: 'Master of Endurance',
        desc: 'Spend 5,000 total MP.',
        icon: '🌌',
        metric: 'mp_spent',
        target: 5000,
        rewards: { gold: 175000, gems: 30, lootbox: { id: 'lootbox_epic', qty: 1 } },
    },
    {
        id: 'mission_wins_10',
        chain: 'mission_wins_total',
        category: 'missions',
        name: 'Field Operative',
        desc: 'Win 10 missions.',
        icon: '🗺️',
        metric: 'mission_wins_total',
        target: 10,
        rewards: { gold: 5000, consumable: { id: 'potion_mana', qty: 2 } },
    },
    {
        id: 'mission_wins_50',
        chain: 'mission_wins_total',
        category: 'missions',
        name: 'Contract Finisher',
        desc: 'Win 50 missions.',
        icon: '📜',
        metric: 'mission_wins_total',
        target: 50,
        rewards: { gold: 25000, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'mission_wins_250',
        chain: 'mission_wins_total',
        category: 'missions',
        name: 'Mercenary Legend',
        desc: 'Win 250 missions.',
        icon: '⚔️',
        metric: 'mission_wins_total',
        target: 250,
        rewards: { gold: 125000, gems: 20, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
    {
        id: 'mission_spots_3',
        chain: 'mission_spots_discovered',
        category: 'missions',
        name: 'Trailblazer',
        desc: 'Fight in 3 different mission locations.',
        icon: '🧭',
        metric: 'mission_spots_discovered',
        target: 3,
        rewards: { gold: 3500, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'mission_spots_10',
        chain: 'mission_spots_discovered',
        category: 'missions',
        name: 'Worldwalker',
        desc: 'Fight in 10 different mission locations.',
        icon: '🌍',
        metric: 'mission_spots_discovered',
        target: 10,
        rewards: { gold: 30000, gems: 6, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'forest_camp_wins_10',
        chain: 'mission_spot_forest_camp_wins',
        category: 'missions',
        name: 'Keeper of the Camp',
        desc: 'Win 10 missions at Hunting Camp.',
        icon: '🌲',
        metric: 'mission_spot_wins',
        metric_key: 'forest_camp',
        metric_label: 'Hunting Camp',
        target: 10,
        rewards: { gold: 8000, consumable: { id: 'potion_mana', qty: 2 } },
    },
    {
        id: 'city_palace_wins_10',
        chain: 'mission_spot_city_palace_wins',
        category: 'missions',
        name: 'Shadowbreaker',
        desc: 'Win 10 missions at Shadow Palace.',
        icon: '🏙️',
        metric: 'mission_spot_wins',
        metric_key: 'city_palace',
        metric_label: 'Shadow Palace',
        target: 10,
        rewards: { gold: 90000, gems: 12, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
    {
        id: 'forest_bandits_wins_10',
        chain: 'mission_spot_forest_bandits_wins',
        category: 'missions',
        name: 'Banditbane',
        desc: 'Win 10 missions at Bandit Hideout.',
        icon: '🪓',
        metric: 'mission_spot_wins',
        metric_key: 'forest_bandits',
        metric_label: 'Bandit Hideout',
        target: 10,
        rewards: { gold: 9000, consumable: { id: 'potion_mana', qty: 2 } },
    },
    {
        id: 'forest_ruins_wins_10',
        chain: 'mission_spot_forest_ruins_wins',
        category: 'missions',
        name: 'Relic Seeker',
        desc: 'Win 10 missions at Old Ruins.',
        icon: '🏚️',
        metric: 'mission_spot_wins',
        metric_key: 'forest_ruins',
        metric_label: 'Old Ruins',
        target: 10,
        rewards: { gold: 12000, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'swamp_edge_wins_10',
        chain: 'mission_spot_swamp_edge_wins',
        category: 'missions',
        name: 'Bog Skimmer',
        desc: 'Win 10 missions at Swamp Edge.',
        icon: '🌿',
        metric: 'mission_spot_wins',
        metric_key: 'swamp_edge',
        metric_label: 'Swamp Edge',
        target: 10,
        rewards: { gold: 15000, consumable: { id: 'potion_mana', qty: 2 } },
    },
    {
        id: 'swamp_village_wins_10',
        chain: 'mission_spot_swamp_village_wins',
        category: 'missions',
        name: 'Marsh Reclaimer',
        desc: 'Win 10 missions at Abandoned Village.',
        icon: '🏚️',
        metric: 'mission_spot_wins',
        metric_key: 'swamp_village',
        metric_label: 'Abandoned Village',
        target: 10,
        rewards: { gold: 20000, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'swamp_heart_wins_10',
        chain: 'mission_spot_swamp_heart_wins',
        category: 'missions',
        name: 'Heart of the Mire',
        desc: 'Win 10 missions at Swamp Heart.',
        icon: '🧫',
        metric: 'mission_spot_wins',
        metric_key: 'swamp_heart',
        metric_label: 'Swamp Heart',
        target: 10,
        rewards: { gold: 32000, gems: 4, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'mountain_base_wins_10',
        chain: 'mission_spot_mountain_base_wins',
        category: 'missions',
        name: 'Foothill Forger',
        desc: 'Win 10 missions at Mountain Base.',
        icon: '⛰️',
        metric: 'mission_spot_wins',
        metric_key: 'mountain_base',
        metric_label: 'Mountain Base',
        target: 10,
        rewards: { gold: 25000, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'mountain_peak_wins_10',
        chain: 'mission_spot_mountain_peak_wins',
        category: 'missions',
        name: 'Storm Summit',
        desc: 'Win 10 missions at Frozen Peak.',
        icon: '❄️',
        metric: 'mission_spot_wins',
        metric_key: 'mountain_peak',
        metric_label: 'Frozen Peak',
        target: 10,
        rewards: { gold: 35000, gems: 4, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'ice_cavern_wins_10',
        chain: 'mission_spot_ice_cavern_wins',
        category: 'missions',
        name: 'Frost Delver',
        desc: 'Win 10 missions at Ice Cavern.',
        icon: '🧊',
        metric: 'mission_spot_wins',
        metric_key: 'ice_cavern',
        metric_label: 'Ice Cavern',
        target: 10,
        rewards: { gold: 50000, gems: 6, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
    {
        id: 'ruins_perimeter_wins_10',
        chain: 'mission_spot_ruins_perimeter_wins',
        category: 'missions',
        name: 'Outer Wallbreaker',
        desc: 'Win 10 missions at Ruins Perimeter.',
        icon: '🧱',
        metric: 'mission_spot_wins',
        metric_key: 'ruins_perimeter',
        metric_label: 'Ruins Perimeter',
        target: 10,
        rewards: { gold: 60000, gems: 6, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'ruins_temple_wins_10',
        chain: 'mission_spot_ruins_temple_wins',
        category: 'missions',
        name: 'Sunken Ritebreaker',
        desc: 'Win 10 missions at Sunken Temple.',
        icon: '🛕',
        metric: 'mission_spot_wins',
        metric_key: 'ruins_temple',
        metric_label: 'Sunken Temple',
        target: 10,
        rewards: { gold: 85000, gems: 8, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
    {
        id: 'ruins_crypt_wins_10',
        chain: 'mission_spot_ruins_crypt_wins',
        category: 'missions',
        name: 'Crypt Unsealer',
        desc: 'Win 10 missions at Ancient Crypt.',
        icon: '⚰️',
        metric: 'mission_spot_wins',
        metric_key: 'ruins_crypt',
        metric_label: 'Ancient Crypt',
        target: 10,
        rewards: { gold: 115000, gems: 10, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
    {
        id: 'city_outskirts_wins_10',
        chain: 'mission_spot_city_outskirts_wins',
        category: 'missions',
        name: 'Street Purger',
        desc: 'Win 10 missions at City Outskirts.',
        icon: '🏘️',
        metric: 'mission_spot_wins',
        metric_key: 'city_outskirts',
        metric_label: 'City Outskirts',
        target: 10,
        rewards: { gold: 150000, gems: 10, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'city_cathedral_wins_10',
        chain: 'mission_spot_city_cathedral_wins',
        category: 'missions',
        name: 'Cathedral Cleanser',
        desc: 'Win 10 missions at Dark Cathedral.',
        icon: '⛪',
        metric: 'mission_spot_wins',
        metric_key: 'city_cathedral',
        metric_label: 'Dark Cathedral',
        target: 10,
        rewards: { gold: 220000, gems: 15, lootbox: { id: 'lootbox_epic', qty: 1 } },
    },
    {
        id: 'dungeon_kills_25',
        chain: 'dungeon_kills',
        category: 'dungeon',
        name: 'Crypt Cleaner',
        desc: 'Defeat 25 dungeon monsters.',
        icon: '💀',
        metric: 'monster_kills_total',
        metric_source: 'dungeon',
        target: 25,
        rewards: { gold: 9000, lootbox: { id: 'lootbox_common', qty: 1 } },
    },
    {
        id: 'dungeon_kills_100',
        chain: 'dungeon_kills',
        category: 'dungeon',
        name: 'Dungeon Exterminator',
        desc: 'Defeat 100 dungeon monsters.',
        icon: '🕷️',
        metric: 'monster_kills_total',
        metric_source: 'dungeon',
        target: 100,
        rewards: { gold: 40000, consumable: { id: 'special_mana_potion', qty: 1 } },
    },
    {
        id: 'dungeon_kills_300',
        chain: 'dungeon_kills',
        category: 'dungeon',
        name: 'Terror of the Underdeep',
        desc: 'Defeat 300 dungeon monsters.',
        icon: '👁️',
        metric: 'monster_kills_total',
        metric_source: 'dungeon',
        target: 300,
        rewards: { gold: 150000, gems: 25, lootbox: { id: 'lootbox_epic', qty: 1 } },
    },
    {
        id: 'skeleton_kills_15',
        chain: 'monster_skeleton',
        category: 'dungeon',
        name: 'Bonebreaker',
        desc: 'Defeat 15 Skeleton Warriors in the dungeon.',
        icon: '🦴',
        metric: 'monster_kills',
        metric_source: 'dungeon',
        metric_key: 'skeleton',
        metric_label: 'Skeleton Warrior',
        target: 15,
        rewards: { gold: 12000, consumable: { id: 'potion_mana', qty: 2 } },
    },
    {
        id: 'void_wraith_kills_10',
        chain: 'monster_void_wraith',
        category: 'dungeon',
        name: 'Wraithbane',
        desc: 'Defeat 10 Void Wraiths in the dungeon.',
        icon: '👻',
        metric: 'monster_kills',
        metric_source: 'dungeon',
        metric_key: 'void_wraith',
        metric_label: 'Void Wraith',
        target: 10,
        rewards: { gold: 50000, gems: 10, lootbox: { id: 'lootbox_rare', qty: 1 } },
    },
];

async function getAchievementMetricValue(db, char, achievement) {
    const metric = achievement.metric;
    if (metric === 'wins') return char.wins || 0;
    if (metric === 'battles') return (char.wins || 0) + (char.losses || 0);
    if (metric === 'gold_earned') return char.total_gold_earned || 0;
    if (metric === 'mp_spent') return char.total_mp_spent || 0;
    if (metric === 'dungeon_floor') return char.dungeon_highest_floor || 1;

    if (metric === 'mission_wins_total' || metric === 'mission_fights_total' || metric === 'mission_spots_discovered') {
        const rows = await dbAll(db, 'SELECT fights, wins, spot_id FROM character_mission_spot_stats WHERE char_id = ?', [char.id]);
        if (metric === 'mission_wins_total') return rows.reduce((sum, row) => sum + (row.wins || 0), 0);
        if (metric === 'mission_fights_total') return rows.reduce((sum, row) => sum + (row.fights || 0), 0);
        return rows.length;
    }

    if (metric === 'mission_spot_wins' || metric === 'mission_spot_fights') {
        if (!achievement.metric_key) return 0;
        const row = await dbGet(
            db,
            'SELECT fights, wins FROM character_mission_spot_stats WHERE char_id = ? AND spot_id = ?',
            [char.id, achievement.metric_key]
        );
        if (!row) return 0;
        return metric === 'mission_spot_wins' ? (row.wins || 0) : (row.fights || 0);
    }

    if (metric === 'monster_kills_total' || metric === 'monster_types_total') {
        const rows = achievement.metric_source
            ? await dbAll(db, 'SELECT monster_key, kills FROM character_monster_stats WHERE char_id = ? AND source = ?', [char.id, achievement.metric_source])
            : await dbAll(db, 'SELECT monster_key, kills FROM character_monster_stats WHERE char_id = ?', [char.id]);
        if (metric === 'monster_kills_total') return rows.reduce((sum, row) => sum + (row.kills || 0), 0);
        return rows.length;
    }

    if (metric === 'monster_kills') {
        if (!achievement.metric_key) return 0;
        const row = achievement.metric_source
            ? await dbGet(
                db,
                'SELECT kills FROM character_monster_stats WHERE char_id = ? AND source = ? AND monster_key = ?',
                [char.id, achievement.metric_source, achievement.metric_key]
            )
            : await dbGet(
                db,
                'SELECT SUM(kills) AS kills FROM character_monster_stats WHERE char_id = ? AND monster_key = ?',
                [char.id, achievement.metric_key]
            );
        return row?.kills || 0;
    }

    return 0;
}

function formatDurationShort(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

function getCurrentWeekStart(now = Math.floor(Date.now() / 1000)) {
    const date = new Date(now * 1000);
    const utcDay = date.getUTCDay();
    const diffToMonday = utcDay === 0 ? 6 : utcDay - 1;
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - diffToMonday);
    return Math.floor(date.getTime() / 1000);
}

function getNextWeekStart(now = Math.floor(Date.now() / 1000)) {
    return getCurrentWeekStart(now) + 7 * 24 * 3600;
}

async function getMissionFightTotal(db, charId) {
    const row = await dbGet(db, 'SELECT COALESCE(SUM(fights), 0) AS total FROM character_mission_spot_stats WHERE char_id = ?', [charId]);
    return Number(row?.total || 0);
}

async function ensureWeeklyTaskState(db, char) {
    const weekStart = getCurrentWeekStart();
    const existing = await dbGet(db, 'SELECT * FROM character_weekly_state WHERE char_id = ?', [char.id]);
    if (existing && Number(existing.week_start) === weekStart) return existing;
    const missionFightsBase = await getMissionFightTotal(db, char.id);

    await dbRun(db, `INSERT INTO character_weekly_state
        (char_id, week_start, mp_spent_base, wins_base, losses_base, mission_fights_base)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(char_id) DO UPDATE SET
            week_start = excluded.week_start,
            mp_spent_base = excluded.mp_spent_base,
            wins_base = excluded.wins_base,
            losses_base = excluded.losses_base,
            mission_fights_base = excluded.mission_fights_base`,
        [char.id, weekStart, char.total_mp_spent || 0, char.wins || 0, char.losses || 0, missionFightsBase]
    );
    await dbRun(db, 'DELETE FROM character_weekly_claims WHERE char_id = ? AND week_start <> ?', [char.id, weekStart]);
    return dbGet(db, 'SELECT * FROM character_weekly_state WHERE char_id = ?', [char.id]);
}

async function getWeeklyTaskProgress(db, char, weeklyState, metric) {
    if (!weeklyState) return 0;
    if (metric === 'mp_spent') {
        return Math.max(0, (char.total_mp_spent || 0) - (weeklyState.mp_spent_base || 0));
    }
    if (metric === 'wins') {
        return Math.max(0, (char.wins || 0) - (weeklyState.wins_base || 0));
    }
    if (metric === 'battles') {
        const pvpBattles = Math.max(0, ((char.wins || 0) + (char.losses || 0)) - ((weeklyState.wins_base || 0) + (weeklyState.losses_base || 0)));
        const missionBattles = Math.max(0, (await getMissionFightTotal(db, char.id)) - (weeklyState.mission_fights_base || 0));
        return pvpBattles + missionBattles;
    }
    return 0;
}

function buildWeeklyRewardSummary(rewards) {
    const parts = [];
    if (rewards.gold) parts.push(`💰 ${rewards.gold.toLocaleString()} gold`);
    if (rewards.gems) parts.push(`💎 ${rewards.gems}`);
    if (rewards.lootbox) parts.push(`📦 ${rewards.lootbox.qty}x ${LOOT_BOXES.find(b => b.id === rewards.lootbox.id)?.name || 'Loot Box'}`);
    if (rewards.choose_material) parts.push(`🧱 Choose ${rewards.choose_material.qty}x rare material`);
    return parts;
}

function getWeeklyTaskMaterialChoices(task) {
    const options = task?.rewards?.choose_material?.options || [];
    return options
        .map((id) => {
            const def = RAW_MATERIALS[id];
            if (!def) return null;
            return {
                id,
                name: def.name || id.replace(/_/g, ' '),
                emoji: def.emoji || '🧱',
                rarity: def.rarity || 'rare'
            };
        })
        .filter(Boolean);
}

async function getWeeklyTasksPayload(db, char) {
    const weeklyState = await ensureWeeklyTaskState(db, char);
    const weekStart = Number(weeklyState?.week_start || getCurrentWeekStart());
    const claimedRows = await dbAll(db, 'SELECT task_id, claimed_at FROM character_weekly_claims WHERE char_id = ? AND week_start = ?', [char.id, weekStart]);
    const claimedMap = new Map(claimedRows.map((row) => [row.task_id, Number(row.claimed_at || 0)]));
    const items = await Promise.all(WEEKLY_TASKS.map(async (task) => {
        const progress = await getWeeklyTaskProgress(db, char, weeklyState, task.metric);
        const claimedAt = claimedMap.get(task.id) || 0;
        return {
            ...task,
            progress,
            claimed: !!claimedAt,
            claimed_at: claimedAt,
            claimable: !claimedAt && progress >= task.target,
            reward_summary: buildWeeklyRewardSummary(task.rewards),
            material_choices: task.rewards?.choose_material ? getWeeklyTaskMaterialChoices(task) : []
        };
    }));
    return {
        weekStart,
        nextResetAt: getNextWeekStart(),
        totals: {
            total: items.length,
            claimable: items.filter((item) => item.claimable).length,
            claimed: items.filter((item) => item.claimed).length
        },
        items
    };
}

function buildAchievementRewardSummary(rewards) {
    const parts = [];
    if (rewards.gold) parts.push(`💰 ${rewards.gold.toLocaleString()} gold`);
    if (rewards.gems) parts.push(`💎 ${rewards.gems}`);
    if (rewards.lootbox) parts.push(`📦 ${rewards.lootbox.qty}x ${LOOT_BOXES.find(b => b.id === rewards.lootbox.id)?.name || 'Loot Box'}`);
    if (rewards.consumable) parts.push(`🧪 ${rewards.consumable.qty}x ${rewards.consumable.id === 'special_mana_potion' ? 'Special Mana Potion' : 'Mana Potion'}`);
    if (rewards.premium) parts.push(`✨ ${PREMIUM_FEATURES[rewards.premium.id]?.name || rewards.premium.id} (${rewards.premium.days}d)`);
    return parts;
}

// ── All equipment slots ───────────────────────────────────────────────────
const EQUIPMENT_SLOTS = ['weapon','armor','helmet','shield','boots','ring', 'amulet', 'accessory'];

// ── Class Skills ──────────────────────────────────────────────────────────
const CLASS_SKILLS = {
    warrior: [
        { id:'berserker_rage',   name:'Berserker Rage',   emoji:'🔥', desc:'+25% damage on all attacks for 5h.',                        effect:'dmg_bonus',       value:0.25 },
        { id:'iron_wall',        name:'Iron Wall',         emoji:'🏰', desc:'+30% block effectiveness on all guards for 5h.',            effect:'block_bonus',     value:0.30 },
        { id:'war_cry',          name:'War Cry',           emoji:'📯', desc:'Your hits cannot miss for the first 3 rounds for 5h.',      effect:'no_miss_rounds',  value:3    },
    ],
    mage: [
        { id:'arcane_surge',     name:'Arcane Surge',      emoji:'🌟', desc:'+20% elemental damage for 5h.',                            effect:'elem_dmg_bonus',  value:0.20 },
        { id:'hex',              name:'Hex',                emoji:'💜', desc:'Reduces opponent elemental resistance by 15% for 5h.',     effect:'elem_res_debuff', value:0.15 },
        { id:'magic_circle',     name:'Magic Circle',       emoji:'🔵', desc:'Avoid 20% of all incoming hits for 5h.',                  effect:'magic_dodge',     value:0.20 },
    ],
    rogue: [
        { id:'shadow_step',      name:'Shadow Step',        emoji:'🌑', desc:'+40% dodge chance for 5h.',                               effect:'dodge_bonus',     value:0.40 },
        { id:'expose',           name:'Expose',             emoji:'🎯', desc:'+15% crit chance for 5h.',                                effect:'crit_bonus',      value:0.15 },
        { id:'venomfang',        name:'Venomfang',          emoji:'🐍', desc:'Each hit poisons for 5 bonus damage per round for 5h.',   effect:'poison',          value:5    },
    ],
    paladin: [
        { id:'divine_shield',    name:'Divine Shield',      emoji:'✨', desc:'Negate the first hit received each battle round for 5h.', effect:'first_hit_negate',value:1    },
        { id:'holy_strike',      name:'Holy Strike',        emoji:'⚡', desc:'+20% damage and heal 10% of damage dealt per hit for 5h.',effect:'holy_strike',     value:0.20 },
        { id:'consecrate',       name:'Consecrate',         emoji:'🌿', desc:'Reflect 15% of damage received back to attacker for 5h.',effect:'reflect',         value:0.15 },
    ],
};

// ── Global Events ─────────────────────────────────────────────────────────
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

// ── DB helpers ────────────────────────────────────────────────────────────
async function dbGet(db, sql, args = []) { const r = await db.execute({ sql, args }); return r.rows[0] ?? null; }
async function dbAll(db, sql, args = []) { const r = await db.execute({ sql, args }); return r.rows; }
async function dbRun(db, sql, args = []) { return db.execute({ sql, args }); }

function normalizeMonsterKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'unknown';
}

async function recordTotalMpSpent(db, charId, amount) {
    const spent = Math.max(0, Number(amount) || 0);
    if (!spent) return;
    const char = await dbGet(db, 'SELECT id, total_mp_spent, wins, losses FROM characters WHERE id = ?', [charId]);
    if (char) await ensureWeeklyTaskState(db, char);
    await dbRun(db, 'UPDATE characters SET total_mp_spent = COALESCE(total_mp_spent, 0) + ? WHERE id = ?', [spent, charId]);
}

async function recordMissionSpotResult(db, { charId, mapType = 'overworld', zoneId, spotId, won, now }) {
    if (!charId || !zoneId || !spotId) return;
    const ts = now || Math.floor(Date.now() / 1000);
    const didWin = won ? 1 : 0;
    const char = await dbGet(
        db,
        'SELECT id, total_mp_spent, wins, losses FROM characters WHERE id = ?',
        [charId]
    );
    if (char) await ensureWeeklyTaskState(db, char);
    await dbRun(db, `INSERT INTO character_mission_spot_stats
        (char_id, map_type, zone_id, spot_id, fights, wins, last_fought_at, last_won_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(char_id, map_type, spot_id) DO UPDATE SET
            zone_id = excluded.zone_id,
            fights = fights + 1,
            wins = wins + excluded.wins,
            last_fought_at = excluded.last_fought_at,
            last_won_at = CASE WHEN excluded.wins > 0 THEN excluded.last_won_at ELSE last_won_at END`,
        [charId, mapType, zoneId, spotId, didWin, ts, didWin ? ts : 0]
    );
}

async function ensureActiveGuildBounty(db, charId) {
    let bounty = await dbGet(db, 'SELECT * FROM character_guild_bounties WHERE char_id = ?', [charId]);
    if (bounty && !bounty.claimed_at) return bounty;

    const template = DUNGEON_GUILD_BOUNTY_POOL[Math.floor(Math.random() * DUNGEON_GUILD_BOUNTY_POOL.length)];
    const targetCount = template.minCount + Math.floor(Math.random() * (template.maxCount - template.minCount + 1));
    const now = Math.floor(Date.now() / 1000);
    const nextBounty = {
        bountyId: `${template.id}_${now}`,
        targetSource: 'dungeon',
        targetKey: template.monsterKey,
        targetName: template.monsterName,
        targetCount,
        rewardGold: template.rewardGold + (targetCount - template.minCount) * 60,
        rewardReputation: template.rewardReputation + Math.max(0, targetCount - template.minCount > 1 ? 1 : 0),
        progress: 0,
        completedAt: 0,
        claimedAt: 0,
        rolledAt: now
    };

    await dbRun(db, `INSERT INTO character_guild_bounties
        (char_id, bounty_id, target_source, target_key, target_name, target_count, progress, reward_gold, reward_reputation, completed_at, claimed_at, rolled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(char_id) DO UPDATE SET
            bounty_id = excluded.bounty_id,
            target_source = excluded.target_source,
            target_key = excluded.target_key,
            target_name = excluded.target_name,
            target_count = excluded.target_count,
            progress = excluded.progress,
            reward_gold = excluded.reward_gold,
            reward_reputation = excluded.reward_reputation,
            completed_at = excluded.completed_at,
            claimed_at = excluded.claimed_at,
            rolled_at = excluded.rolled_at`,
        [charId, nextBounty.bountyId, nextBounty.targetSource, nextBounty.targetKey, nextBounty.targetName, nextBounty.targetCount, nextBounty.progress, nextBounty.rewardGold, nextBounty.rewardReputation, nextBounty.completedAt, nextBounty.claimedAt, nextBounty.rolledAt]
    );
    return dbGet(db, 'SELECT * FROM character_guild_bounties WHERE char_id = ?', [charId]);
}

async function recordMonsterDefeat(db, { charId, source = 'mission', monsterKey, monsterName, count = 1, now }) {
    const kills = Math.max(1, Number(count) || 1);
    const key = normalizeMonsterKey(monsterKey || monsterName);
    const name = String(monsterName || monsterKey || 'Unknown Monster');
    const ts = now || Math.floor(Date.now() / 1000);
    if (!charId || !key) return;

    await dbRun(db, `INSERT INTO character_monster_stats
        (char_id, source, monster_key, monster_name, kills, wins, last_defeated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(char_id, source, monster_key) DO UPDATE SET
            monster_name = excluded.monster_name,
            kills = kills + excluded.kills,
            wins = wins + excluded.wins,
            last_defeated_at = excluded.last_defeated_at`,
        [charId, source, key, name, kills, kills, ts]
    );

    const bounty = await ensureActiveGuildBounty(db, charId);
    if (bounty && !bounty.claimed_at && bounty.target_source === source && bounty.target_key === key) {
        const nextProgress = Math.min((bounty.progress || 0) + kills, bounty.target_count || 0);
        const completedAt = nextProgress >= (bounty.target_count || 0) ? (bounty.completed_at || ts) : 0;
        await dbRun(db, 'UPDATE character_guild_bounties SET progress = ?, completed_at = ? WHERE char_id = ?', [nextProgress, completedAt, charId]);
    }
}

function hasShieldEquipped(items = []) {
    return (items || []).some(item => {
        try {
            const raw = item?.item_data ? JSON.parse(item.item_data) : item;
            return raw?.slot === 'shield';
        } catch {
            return false;
        }
    });
}

async function recordShieldlessWin(db, char, equippedItems) {
    if (!char?.id || char.class !== 'rogue') return;
    if (hasShieldEquipped(equippedItems)) return;
    await dbRun(db, 'UPDATE characters SET wins_without_shield = wins_without_shield + 1 WHERE id=?', [char.id]);
}

async function listUserCharacters(db, userId) {
    return dbAll(db, `SELECT id, user_id, name, class, level, xp, gold, gems, wins, losses, location, current_map
        FROM characters WHERE user_id = ? ORDER BY id ASC`, [userId]);
}

async function ensureActiveCharacter(db, userId, preferredCharacterId = null) {
    const user = await dbGet(db, 'SELECT active_character_id FROM users WHERE id = ?', [userId]);
    let activeCharacterId = preferredCharacterId || user?.active_character_id || null;

    if (activeCharacterId) {
        const existing = await dbGet(db, 'SELECT id FROM characters WHERE id = ? AND user_id = ?', [activeCharacterId, userId]);
        if (existing) {
            if (user?.active_character_id !== activeCharacterId) {
                await dbRun(db, 'UPDATE users SET active_character_id = ? WHERE id = ?', [activeCharacterId, userId]);
            }
            return activeCharacterId;
        }
    }

    const fallback = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ? ORDER BY id ASC LIMIT 1', [userId]);
    if (!fallback) {
        await dbRun(db, 'UPDATE users SET active_character_id = NULL WHERE id = ?', [userId]);
        return null;
    }

    await dbRun(db, 'UPDATE users SET active_character_id = ? WHERE id = ?', [fallback.id, userId]);
    return fallback.id;
}

async function getCurrentCharacter(db, userId, fields = '*') {
    const activeCharacterId = await ensureActiveCharacter(db, userId);
    if (!activeCharacterId) return null;
    return dbGet(db, `SELECT ${fields} FROM characters WHERE id = ? AND user_id = ?`, [activeCharacterId, userId]);
}

// ── MP Regen ──────────────────────────────────────────────────────────────
async function applyMpRegen(db, characterId) {
    const char = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [characterId]);
    if (!char) return;
    const now = Math.floor(Date.now() / 1000);
    const currentHourStart = Math.floor(now / 3600) * 3600;
    const lastRegen = char.mp_last_regen_at || 0;
    const lastRegenHour = Math.floor(lastRegen / 3600) * 3600;
    if (currentHourStart <= lastRegenHour) return;
    const hoursElapsed = Math.max(1, Math.floor((currentHourStart - lastRegenHour) / 3600));
    const activePrem = getActivePremium(char);
    const regenPerHour = hasPremium(activePrem, 'arcane_reservoir') ? 20 : 10;
    const mpMax = hasPremium(activePrem, 'arcane_reservoir') ? MP_MAX * 2 : MP_MAX;
    const currentMp = char.mission_points ?? 0;
    if (currentMp >= mpMax) {
        await dbRun(db, 'UPDATE characters SET mp_last_regen_at=? WHERE id=?', [currentHourStart, characterId]);
        return;
    }
    const gained = Math.min(regenPerHour * hoursElapsed, mpMax - currentMp);
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

// ── HP Regen ──────────────────────────────────────────────────────────────
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
    const setBonuses = getEquippedSetBonuses(equippedItems);
    if (setBonuses.hp_max) base += setBonuses.hp_max;
    if (setBonuses.vitality) base += setBonuses.vitality * 25;
    if (setBonuses.defense) base += setBonuses.defense * 2;
    for (const item of equippedItems) {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (data?.stats?.hp_max) base += data.stats.hp_max;
        } catch {}
    }
    return base;
}

function calcBaseDamage(char, equippedItems) {
    const setBonuses = getEquippedSetBonuses(equippedItems);
    const totalStrength = (char.strength || 1) + (setBonuses.strength || 0);
    let dmgMin = Math.floor(totalStrength * 0.5);
    let dmgMax = dmgMin + 4;
    if (setBonuses.dmg_min) dmgMin += setBonuses.dmg_min;
    if (setBonuses.dmg_max) dmgMax += setBonuses.dmg_max;
    for (const item of equippedItems) {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (data?.stats?.dmg_min) dmgMin += data.stats.dmg_min;
            if (data?.stats?.dmg_max) dmgMax += data.stats.dmg_max;
        } catch {}
    }
    return { dmgMin, dmgMax };
}

// ── Armor & Elemental helpers ─────────────────────────────────────────────
function calcArmorValue(char, equippedItems) {
    const setBonuses = getEquippedSetBonuses(equippedItems);
    let armor = Math.floor(((char.defense || 0) + (setBonuses.defense || 0)) / 4);
    if (setBonuses.armor) armor += setBonuses.armor;
    for (const item of equippedItems) {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (data?.stats?.armor) armor += data.stats.armor;
        } catch {}
    }
    return armor;
}

function calcElemDmg(equippedItems) {
    if (!equippedItems) equippedItems = [];
    const dmg = { pyro:0, water:0, wind:0, electro:0 };
    const setBonuses = getEquippedSetBonuses(equippedItems);
    for (const elem of ELEMENTS) {
        dmg[elem] += setBonuses[`${elem}_dmg`] || 0;
    }
    for (const item of equippedItems) {
        if (!item) continue;
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (!data?.stats) continue;
            for (const elem of ELEMENTS) {
                if (data.stats[`${elem}_dmg`]) dmg[elem] += data.stats[`${elem}_dmg`];
            }
        } catch {}
    }
    return dmg;
}

function calcElemResist(char, equippedItems) {
    if (!equippedItems) equippedItems = [];
    const resist = { pyro:0, water:0, wind:0, electro:0 };
    const setBonuses = getEquippedSetBonuses(equippedItems);
    for (const elem of ELEMENTS) {
        resist[elem] += setBonuses[`${elem}_resist`] || 0;
    }
    for (const item of equippedItems) {
        if (!item) continue;
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (!data?.stats) continue;
            for (const elem of ELEMENTS) {
                if (data.stats[`${elem}_resist`]) resist[elem] += data.stats[`${elem}_resist`];
            }
        } catch {}
    }
    return resist;
}

function getEquippedSetCounts(equippedItems) {
    const counts = {};
    for (const item of equippedItems) {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (!data?.setId) continue;
            counts[data.setId] = (counts[data.setId] || 0) + 1;
        } catch {}
    }
    return counts;
}

function getEquippedSetBonuses(equippedItems) {
    const counts = getEquippedSetCounts(equippedItems);
    const total = {};
    for (const [setId, count] of Object.entries(counts)) {
        const def = CRAFTING_SETS[setId];
        if (!def) continue;
        if (count >= 3 && def.bonus3) {
            for (const [key, value] of Object.entries(def.bonus3)) {
                if (key === 'desc' || typeof value !== 'number') continue;
                total[key] = (total[key] || 0) + value;
            }
        }
        if (count >= 5 && def.bonus5) {
            for (const [key, value] of Object.entries(def.bonus5)) {
                if (key === 'desc' || typeof value !== 'number') continue;
                total[key] = (total[key] || 0) + value;
            }
        }
    }
    return total;
}

function getEquippedWeaponData(equippedItems) {
    for (const item of equippedItems) {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (data?.slot === 'weapon') return data;
        } catch {}
    }
    return null;
}

// ── Magic Shield & Elemental Damage Functions ─────────────────────────────────
function calculateMagicShield(attacker, defender) {
    const attackerCrit = attacker.crit_chance || 0;
    const defenderMagic = defender.magic || 0;
    
    // Shield created from magic advantage over opponent's crit
    if (defenderMagic > attackerCrit) {
        const magicAdvantage = defenderMagic - attackerCrit;
        const shieldValue = Math.floor(magicAdvantage / 4);
        
        return {
            active: true,
            value: shieldValue,
            remaining: shieldValue,
            usedInBattle: false
        };
}

    const elemDmg = calcElemDmg(equippedArray || []);
    const elemResist = calcElemResist(char, equippedArray || []);

    return {
        active: false,
        value: 0,
        remaining: 0,
        usedInBattle: false
    };
}

function applyMagicDamageModifiers(attacker, defender) {
    let damageBonus = 0;
    let resistance = 0;
    
    // Magic increases damage dealt (applies to all damage types)
    if (attacker.magic) {
        damageBonus = Math.floor(attacker.magic * 0.1); // 10% of magic as bonus damage
    }
    
    // Magic reduces damage taken
    if (defender.magic) {
        resistance = Math.floor(defender.magic * 0.05); // 5% of magic as damage reduction
    }
    
    return { damageBonus, resistance };
}

function simulateRound(roundNum, attacker, defender, atkZone, blkZone, atkPenalty, attackerShield, defenderShield) {
    const hit = HIT_ZONES[atkZone] || HIT_ZONES.chest;
    const blk = BLOCK_ZONES[blkZone] || BLOCK_ZONES.cross_guard;
    const atkSkills = attacker.activeSkills || {};
    const defSkills = defender.activeSkills || {};
    const ignoreDefenderZones = !!attacker.ignoreDefenderZones;

    let rogueWeaponPenalty = 1.0;
    if (attacker.class === 'rogue') {
        const weapon = attacker.weapon || null;
        const isDagger = weapon && (weapon.name?.toLowerCase().includes('dagger') || weapon.type === 'dagger');
        if (!isDagger && weapon) rogueWeaponPenalty = 0.60;
    }
    
    let physicalDamagePenalty = 1.0;
    if (attacker.class === 'mage') physicalDamagePenalty = 0.40;

    let atkHitChance = hit.hitChance + ((attacker.hit_chance || 0) * 0.005) + ((attacker.hit_bonus || 0) * 0.005);
    if (atkPenalty) atkHitChance *= 0.85;
    if (hasSkill(atkSkills, 'war_cry') && roundNum <= 3) atkHitChance = 1.0;
    if (ignoreDefenderZones) atkHitChance = 1.0;

    const defAgi = (defender.agility || 0) * (1 + (defender.agility_bonus || 0));
    const atkAgi = attacker.agility || 0;
    let agiDiff = Math.max(0, defAgi - atkAgi);
    let dodgeChance = Math.min(0.10, agiDiff / 200);
    if (hasSkill(defSkills, 'shadow_step')) dodgeChance = Math.min(0.999, dodgeChance + 0.40);
    if (hasSkill(defSkills, 'magic_circle')) dodgeChance = Math.min(0.999, dodgeChance + 0.20);
    if (ignoreDefenderZones) dodgeChance = 0;

    let forceMiss = Math.random() < dodgeChance;

    let atkBonusDmg = (blk.special === 'attacker_bonus_10') ? 1.10 : 1.0;
    if (attacker.dmg_bonus) atkBonusDmg *= (1 + attacker.dmg_bonus);
    if (hasSkill(atkSkills, 'berserker_rage')) atkBonusDmg *= 1.25;
    if (hasSkill(atkSkills, 'holy_strike')) atkBonusDmg *= 1.20;

    if (!ignoreDefenderZones && !forceMiss && (blk.special === 'attacker_miss_20') && Math.random() < 0.20) forceMiss = true;

    let divineNegate = false;
    if (!forceMiss && hasSkill(defSkills, 'divine_shield') && Math.random() < 0.50) divineNegate = true;

    const atkHit = !forceMiss && !divineNegate && Math.random() <= atkHitChance;
    let logLine = '', finalDmg = 0, nextAtkPenalty = false, healBack = 0, rawPhysicalDmg = 0, damageCounter = 0, totalElemDmg = 0;

    if (!atkHit) {
        if (divineNegate) logLine = `Round ${roundNum}: ${attacker.name} swings — ✨ DIVINE SHIELD absorbed the blow!`;
        else if (forceMiss && dodgeChance > 0.001) logLine = `Round ${roundNum}: ${attacker.name} swings — DODGED by ${defender.name}`;
        else logLine = `Round ${roundNum}: ${attacker.name} swings — MISS`;
    } else {
        const rawCritChance = (attacker.crit_chance || 0) - (defender.crit_chance || 0);
        const baseCritChance = Math.max(0, Math.min(0.95, rawCritChance / 100));
        const critBonus = hasSkill(atkSkills, 'expose') ? 0.15 : 0;
        const isCrit = Math.random() < Math.min(0.95, baseCritChance + critBonus);
        
        rawPhysicalDmg = isCrit ? attacker.dmgMax : attacker.dmgMin + Math.floor(Math.random() * (attacker.dmgMax - attacker.dmgMin + 1));
        rawPhysicalDmg = Math.floor(rawPhysicalDmg * rogueWeaponPenalty);
        let physicalDmg = Math.floor(rawPhysicalDmg * physicalDamagePenalty);
        physicalDmg = Math.floor(physicalDmg * hit.dmgMult * atkBonusDmg);
        
        const { damageBonus, resistance } = applyMagicDamageModifiers(attacker, defender);
        physicalDmg = Math.max(0, physicalDmg + damageBonus - resistance);

        const blockCovers = !ignoreDefenderZones && (blk.protects.includes(atkZone) || blk.protects.includes('any'));
        const blockFails = Math.random() < 0.001;

        const elemDmgs = attacker.elem_dmg || {};
        for (const elem of ELEMENTS) {
            let ed = elemDmgs[elem] || 0;
            if (ed <= 0) continue;
            if (hasSkill(atkSkills, 'arcane_surge')) ed = Math.floor(ed * 1.20);
            if (hasSkill(atkSkills, 'hex')) ed = Math.floor(ed * 1.15);
            const elemResist = (defender.elem_resist || {})[elem] || 0;
            const magicResist = Math.floor((defender.magic || 0) * 0.05);
            ed = Math.max(0, ed - elemResist - magicResist);
            totalElemDmg += Math.floor(ed);
        }

        const critTag = isCrit ? ' ⚡CRIT' : '';

        if (blockCovers && !blockFails) {
            logLine = `Round ${roundNum}: ${attacker.name} hits${critTag} — BLOCKED`;
            totalElemDmg = 0; 
        } else {
            finalDmg = physicalDmg;

            let justAbsorbed = false;
            let absorbedAmount = 0;
            if (defenderShield && defenderShield.active && defenderShield.remaining > 0 && !defenderShield.usedInBattle) {
                absorbedAmount = Math.min(defenderShield.remaining, finalDmg);
                finalDmg -= absorbedAmount;
                defenderShield.remaining -= absorbedAmount;
                defenderShield.usedInBattle = true;
                justAbsorbed = true;
            }

            if (finalDmg > 0 && (defender.armor || 0) > 0) {
                const physReduction = Math.min(finalDmg - 1, defender.armor);
                finalDmg = Math.max(1, finalDmg - physReduction);
            }

            if (totalElemDmg > 0) finalDmg += totalElemDmg;
            if (hasSkill(atkSkills, 'venomfang')) finalDmg += 5;

            logLine = `Round ${roundNum}: ${attacker.name} lands a hit${critTag} — ${Math.floor(finalDmg)} damage`;
            if (totalElemDmg > 0) logLine += ` including ${Math.floor(totalElemDmg)} elemental damage`;
            if (hasSkill(atkSkills, 'venomfang')) logLine += ' ☠️ (+5 poison)';

            if (justAbsorbed) {
                if (finalDmg <= 0) {
                    logLine = `Round ${roundNum}: ${attacker.name} attacks — ✨ FORCE FIELD absorbed ${absorbedAmount} damage!`;
                } else {
                    logLine = `Round ${roundNum}: ${attacker.name} attacks — ✨ FORCE FIELD absorbed ${absorbedAmount} damage! ${Math.floor(finalDmg)} gets through`;
                }
                if (defenderShield.remaining <= 0) logLine += ` 💔 Force field shatters!`;
            }

            if (hasSkill(atkSkills, 'holy_strike') && finalDmg > 0) {
                healBack = Math.floor(finalDmg * 0.10);
                logLine += ` 💚 +${healBack} heal`;
            }
            if (hasSkill(defSkills, 'consecrate') && finalDmg > 0) {
                const reflect = Math.floor(finalDmg * 0.15);
                logLine += ` 🌿 ${reflect} reflected`;
                damageCounter += reflect;
            }
            if (blk.special === 'next_round_hit_penalty') nextAtkPenalty = true;
            if (blk.special === 'counter_25' && Math.random() < 0.25) {
                const counterDmg = Math.floor(finalDmg * 0.50);
                logLine += ` — COUNTERED for ${counterDmg}`;
                damageCounter += counterDmg;
            }
        }
    }
    return { logLine, damageDealt: finalDmg, damageCounter, nextAtkPenalty, healBack, totalElemDmg };
}
function runBattle(fighterA, fighterB) {
    const log = [];
    let hpA = fighterA.hp, hpB = fighterB.hp;
    let penaltyA = false, penaltyB = false;
    let totalDmgToA = 0, totalDmgToB = 0;
    let totalElemDmgDealtA = 0;
    
    let shieldA = calculateMagicShield(fighterB, fighterA);
    let shieldB = calculateMagicShield(fighterA, fighterB);
    shieldA.usedInBattle = false;
    shieldB.usedInBattle = false;

    log.push(`⚔️  ${fighterA.name}  vs  ${fighterB.name}`);
    const skA = Object.keys(fighterA.activeSkills || {});
    const skB = Object.keys(fighterB.activeSkills || {});
    if (skA.length) log.push(`✨ ${fighterA.name}'s active skills: ${skA.join(', ')}`);
    if (skB.length) log.push(`✨ ${fighterB.name}'s active skills: ${skB.join(', ')}`);
    
    if (shieldA.active) log.push(`✨ ${fighterA.name}'s magic creates a force field worth ${shieldA.value} damage!`);
    if (shieldB.active) log.push(`✨ ${fighterB.name}'s magic creates a force field worth ${shieldB.value} damage!`);
    log.push('---');

    for (let round = 1; round <= 10; round++) {
        const atkZoneA = fighterA.attackZones[round-1] || 'chest';
        const blkZoneA = fighterA.blockZones[round-1]  || 'cross_guard';
        const atkZoneB = fighterB.attackZones[round-1] || 'chest';
        const blkZoneB = fighterB.blockZones[round-1]  || 'cross_guard';
        
        const resA = simulateRound(round, fighterA, fighterB, atkZoneA, blkZoneB, penaltyA, shieldA, shieldB);
        const resB = simulateRound(round, fighterB, fighterA, atkZoneB, blkZoneA, penaltyB, shieldB, shieldA);
        
        const dmgToB = resA.damageDealt + resB.damageCounter;
        const dmgToA = resB.damageDealt + resA.damageCounter;
        
        totalElemDmgDealtA += resA.totalElemDmg;
        
        totalDmgToA += dmgToA;
        totalDmgToB += dmgToB;
        
        hpA = Math.min(fighterA.hpMax || 9999, Math.max(0, hpA - dmgToA + (resA.healBack || 0)));
        hpB = Math.min(fighterB.hpMax || 9999, Math.max(0, hpB - dmgToB + (resB.healBack || 0)));
        
        log.push(resA.logLine);
        log.push(resB.logLine);
        penaltyA = resB.nextAtkPenalty;
        penaltyB = resA.nextAtkPenalty;
        
        if (hpA <= 0 || hpB <= 0) {
            if (hpA <= 0 && hpB <= 0) {
                log.push(`Round ${round}: Both fighters fall simultaneously!`);
                const winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
                log.push(`🏆 ${winnerId === fighterA.id ? fighterA.name : fighterB.name} wins by dealing more damage!`);
                return { log, winnerId, hpRemainingA: hpA, hpRemainingB: hpB, totalDmgToA, totalDmgToB, totalElemDmgDealt: totalElemDmgDealtA };
            } else if (hpA <= 0) {
                log.push(`Round ${round}: ${fighterA.name} has fallen!`);
                log.push(`🏆 ${fighterB.name} wins!`);
                return { log, winnerId: fighterB.id, hpRemainingA: hpA, hpRemainingB: hpB, totalDmgToA, totalDmgToB, totalElemDmgDealt: totalElemDmgDealtA };
            } else {
                log.push(`Round ${round}: ${fighterB.name} has fallen!`);
                log.push(`🏆 ${fighterA.name} wins!`);
                return { log, winnerId: fighterA.id, hpRemainingA: hpA, hpRemainingB: hpB, totalDmgToA, totalDmgToB, totalElemDmgDealt: totalElemDmgDealtA };
            }
        }
        if (round < 10) log.push('---');
    }
    
    log.push('---');
    let winnerId;
    if (totalDmgToB >= totalDmgToA) {
        winnerId = fighterA.id;
        log.push(`After 10 rounds: ${fighterA.name} dealt ${totalDmgToB} damage, ${fighterB.name} dealt ${totalDmgToA} damage`);
        log.push(`🏆 ${fighterA.name} wins by dealing more damage!`);
    } else {
        winnerId = fighterB.id;
        log.push(`After 10 rounds: ${fighterB.name} dealt ${totalDmgToA} damage, ${fighterA.name} dealt ${totalDmgToB} damage`);
        log.push(`🏆 ${fighterB.name} wins by dealing more damage!`);
    }
    
    return { log, winnerId, hpRemainingA: hpA, hpRemainingB: hpB, totalDmgToA, totalDmgToB, totalElemDmgDealt: totalElemDmgDealtA };
}

function buildNpc(difficulty, playerLevel, zoneLevel = 1, playerStats = null) {
    // Base difficulty multipliers
    const difficultyMultipliers = {
        easy: { hpMult: 0.8, dmgMult: 0.7, agiMult: 0.7, armorMult: 0.6, elemMult: 0.5 },
        medium: { hpMult: 1.2, dmgMult: 1.5, agiMult: 1.0, armorMult: 1.0, elemMult: 1.0 },
        hard: { hpMult: 1.8, dmgMult: 2.0, agiMult: 1.3, armorMult: 1.5, elemMult: 1.8 },
        normal: { hpMult: 1.0, dmgMult: 1.0, agiMult: 1.0, armorMult: 1.0, elemMult: 1.0 },
        nightmare: { hpMult: 1.0, dmgMult: 1.0, agiMult: 1.0, armorMult: 1.0, elemMult: 1.0 } // Base, will be overridden
    };
    
    let mult = difficultyMultipliers[difficulty] || difficultyMultipliers.medium;
    
    // For Nightmare difficulty, scale based on player stats
    let powerScale = 1.0;
    if (difficulty === 'nightmare' && playerStats) {
        // Calculate player power score
const playerPower = (playerStats.hp_max || 100) * 0.5 +
                    (playerStats.strength || 0) * 2 +
                    (playerStats.defense || 0) * 1.5 +
                    (playerStats.agility || 0) * 1.2 +
                    (playerStats.magic || 0) * 2.5 +
                    (playerStats.hit_chance || 0) * 3 +
                    (playerStats.crit_chance || 0) * 5;
        
        // Scale NPC to be 80-150% of player power
        powerScale = Math.max(0.8, Math.min(1.5, playerPower / 5000));
        
        // Override multipliers for Nightmare
        mult = {
            hpMult: 1.2 * powerScale,
            dmgMult: 1.3 * powerScale,
            agiMult: 1.1 * powerScale,
            armorMult: 1.2 * powerScale,
            elemMult: 1.4 * powerScale
        };
    }
    
    // NPC name configs
    const configs = {
        easy: { name: 'Raider' },
        medium: { name: 'Warlord' },
        hard: { name: 'Legion Commander' },
        normal: { name: 'Abyss Minion' },
        nightmare: { name: 'Abyss Horror' }
    };
    const cfg = configs[difficulty] || configs.hard;
    
    // Base stats scale with player level AND zone level
    const effectiveLevel = playerLevel + (zoneLevel * 2);
    
    // Calculate base stats (scales with effective level)
    const baseHp = 80 + (effectiveLevel * 30);
    const baseDmgMin = 15 + (effectiveLevel * 0.8);
    const baseDmgMax = 30 + (effectiveLevel * 1.2);
    const baseAgi = 12 + (effectiveLevel * 0.5);
    const baseMagic = 10 + (effectiveLevel * 0.4);
    const baseVitality = 10 + (effectiveLevel * 0.4);
    const baseHitChance = 85 + (effectiveLevel * 0.3);
    const baseCritChance = 10 + (effectiveLevel * 0.2);
    const baseArmor = 10 + (effectiveLevel * 0.3);
    
    // Apply difficulty multipliers
    const hp = Math.floor(baseHp * mult.hpMult);
    const dmgMin = Math.floor(baseDmgMin * mult.dmgMult);
    const dmgMax = Math.floor(baseDmgMax * mult.dmgMult);
    const agility = Math.floor(baseAgi * mult.agiMult);
    const magic = Math.floor(baseMagic * mult.dmgMult);
    const vitality = Math.floor(baseVitality * mult.hpMult);
    const hit_chance = Math.min(95, Math.floor(baseHitChance));
    const crit_chance = Math.min(40, Math.floor(baseCritChance * mult.dmgMult));
    const armor = Math.floor(baseArmor * mult.armorMult);
    
    // Random attack/block zones
    const allAttackZones = ['head', 'throat', 'chest', 'heart', 'solar_plexus', 'stomach', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
    const attackZones = [];
    for (let i = 0; i < 10; i++) {
        attackZones.push(allAttackZones[Math.floor(Math.random() * allAttackZones.length)]);
    }
    
    const allBlockZones = ['high_guard', 'cross_guard', 'mid_guard', 'left_guard', 'right_guard', 'full_turtle', 'weave_left', 'weave_right', 'counter_stance', 'no_block'];
    const blockZones = [];
    for (let i = 0; i < 10; i++) {
        blockZones.push(allBlockZones[Math.floor(Math.random() * allBlockZones.length)]);
    }
    
    // Elemental damage/resist scaling
    const elemTypes = ['pyro', 'water', 'wind', 'electro'];
    const elem_dmg = { pyro: 0, water: 0, wind: 0, electro: 0 };
    const elem_resist = { pyro: 0, water: 0, wind: 0, electro: 0 };
    
    // Higher chance for elemental damage in harder difficulties and higher zones
    const elemChance = Math.min(0.6, 0.1 + (effectiveLevel / 200) + (mult.elemMult * 0.2));
    
    if (Math.random() < elemChance) {
        const numElem = difficulty === 'hard' || difficulty === 'nightmare' ? 3 : (difficulty === 'medium' ? 2 : 1);
        const shuffled = [...elemTypes].sort(() => Math.random() - 0.5);
        for (let i = 0; i < numElem; i++) {
            const elem = shuffled[i];
            const elemBase = 10 + (effectiveLevel * 0.5);
            const dmg = Math.floor(elemBase * mult.elemMult);
            elem_dmg[elem] = Math.max(1, dmg);
        }
    }
    
    // Elemental resistances
    const resistChance = Math.min(0.6, 0.1 + (effectiveLevel / 200));
    if (Math.random() < resistChance) {
        const numResist = difficulty === 'hard' || difficulty === 'nightmare' ? 3 : (difficulty === 'medium' ? 2 : 1);
        const shuffled = [...elemTypes].sort(() => Math.random() - 0.5);
        for (let i = 0; i < numResist; i++) {
            const elem = shuffled[i];
            const resistBase = 10 + (effectiveLevel * 0.4);
            const resist = Math.floor(resistBase * mult.armorMult);
            elem_resist[elem] = Math.max(1, resist);
        }
    }
    
    // Zone prefix for name
    let zonePrefix = '';
    if (zoneLevel === 1) zonePrefix = 'Forest';
    else if (zoneLevel === 5) zonePrefix = 'Swamp';
    else if (zoneLevel === 10) zonePrefix = 'Mountain';
    else if (zoneLevel === 20) zonePrefix = 'Ruins';
    else if (zoneLevel === 35) zonePrefix = 'Dark';
    else if (zoneLevel >= 39 && zoneLevel < 50) zonePrefix = 'Shadowfen';
    else if (zoneLevel >= 50 && zoneLevel < 60) zonePrefix = 'Crimson';
    else if (zoneLevel >= 60 && zoneLevel < 70) zonePrefix = 'Void';
    else if (zoneLevel >= 70 && zoneLevel < 80) zonePrefix = 'Citadel';
    else if (zoneLevel >= 80) zonePrefix = 'Eternal';
    
    return {
        id: -1, 
        name: zonePrefix ? `${zonePrefix} ${cfg.name}` : cfg.name,
        hp: hp,
        hpMax: hp,
        dmgMin: dmgMin,
        dmgMax: dmgMax,
        agility: agility,
        magic: magic,
        vitality: vitality,
        hit_chance: hit_chance,
        crit_chance: crit_chance,
        armor: armor,
        elem_dmg: elem_dmg,
        elem_resist: elem_resist,
        attackZones: attackZones,
        blockZones: blockZones,
        activeSkills: {},
    };
}

async function buildCombatFighter(db, char) {
    const equippedArray = await getEquippedItemsArray(db, char.id);
    const setBonuses = getEquippedSetBonuses(equippedArray);
    const hpMax = calcHpMax(char, equippedArray);
    const hpCurrent = char.hp_current ?? hpMax;
    const { dmgMin, dmgMax } = calcBaseDamage(char, equippedArray);
    const charActiveSkills = getActiveSkills(char);
    const learnedRows = await dbAll(db, 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', [char.id]);
    const learnedIds = learnedRows.map(r => r.skill_id);
    const skillPassives = await computePassiveBonusesWithProgress(db, char.class, learnedIds, char.id);
    const skillActives = await computeActiveCombatEffectsWithProgress(db, char.class, learnedIds, char.id);
    const skillMods = await computeClassModifiersWithProgress(db, char.class, learnedIds, char.id);

    let noShieldAgiBonus = 0;
    if (char.class === 'rogue') {
        const hasShield = equippedArray.some(item => {
            try {
                const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
                return data?.slot === 'shield';
            } catch {
                return false;
            }
        });
        if (!hasShield) noShieldAgiBonus = Math.floor((char.agility || 0) * 0.05);
    }

    const weaponItem = equippedArray.find(item => {
        try {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            return data?.slot === 'weapon';
        } catch { return false; }
    });
    let weapon = null;
    if (weaponItem) {
        try {
            weapon = typeof weaponItem.item_data === 'string' ? JSON.parse(weaponItem.item_data) : weaponItem.item_data;
        } catch {}
    }

    const elemDmg = calcElemDmg(equippedArray || []);
    const elemResist = calcElemResist(char, equippedArray || []);

    return {
        id: char.id,
        name: char.name,
        class: char.class,
        weapon: weapon,
        hp: hpCurrent,
        dmgMin: dmgMin + (skillPassives.dmg_min || 0),
        dmgMax: dmgMax + (skillPassives.dmg_max || 0),
        strength: (char.strength || 0) + (setBonuses.strength || 0) + (skillPassives.strength || 0),
        agility: (char.agility || 0) + (setBonuses.agility || 0) + (skillPassives.agility || 0) + noShieldAgiBonus,
        magic: (char.magic || 0) + (setBonuses.magic || 0) + (skillPassives.magic || 0),
        defense: (char.defense || 0) + (setBonuses.defense || 0) + (skillPassives.defense || 0),
        hit_chance: (char.hit_chance || 0) + (setBonuses.hit_chance || 0) + (skillPassives.hit_chance || 0),
        crit_chance: (char.crit_chance || 0) + (setBonuses.crit_chance || 0) + (skillPassives.crit_chance || 0),
        armor: calcArmorValue(char, equippedArray) + (skillPassives.armor || 0),
        elem_dmg: {
            pyro: (elemDmg.pyro || 0) + (skillPassives.pyro_dmg || 0),
            water: (elemDmg.water || 0) + (skillPassives.water_dmg || 0),
            wind: (elemDmg.wind || 0) + (skillPassives.wind_dmg || 0),
            electro: (elemDmg.electro || 0) + (skillPassives.electro_dmg || 0),
        },
        elem_resist: {
            pyro: (elemResist.pyro || 0) + (skillPassives.pyro_resist || 0),
            water: (elemResist.water || 0) + (skillPassives.water_resist || 0),
            wind: (elemResist.wind || 0) + (skillPassives.wind_resist || 0),
            electro: (elemResist.electro || 0) + (skillPassives.electro_resist || 0),
        },
        skillEffects: skillActives,
        skillMods,
        activeSkills: charActiveSkills,
        attackZones: JSON.parse(char.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
        blockZones: JSON.parse(char.block_zones || 'null') || DEFAULT_BLOCK_ZONES,
        dualWield: char.class === 'rogue' && rogueHasDualWield(learnedIds),
    };
}
const cfgNames = {
    easy: 'Raider',
    medium: 'Warlord', 
    hard: 'Legion Commander'
};

const ZONE_LEVELS = {
    forest: 1,
    swamp: 5,
    mountains: 10,
    ruins: 20,
    dark_city: 35,
};

const OVERWORLD_TRAVEL_ROUTES = {
    forest: { swamp: 60, mountains: 90 },
    swamp: { forest: 60, mountains: 90, ruins: 120, dark_city: 90 },
    mountains: { forest: 90, swamp: 90, ruins: 120 },
    ruins: { swamp: 120, mountains: 120, dark_city: 60 },
    dark_city: { swamp: 90, ruins: 60 }
};

const TRAVEL_GUARDIANS = {
    overworld: {
        swamp: { difficulty: 'medium', name: 'Bog Warden' },
        mountains: { difficulty: 'hard', name: 'Frost Sentinel' },
        ruins: { difficulty: 'hard', name: 'Crypt Keeper' },
        dark_city: { difficulty: 'nightmare', name: 'Shadow Gatekeeper' },
    },
    abyss: {
        crimson: { difficulty: 'nightmare', name: 'Crimson Gatekeeper' },
        void: { difficulty: 'nightmare', name: 'Void Gatekeeper' },
        citadel: { difficulty: 'nightmare', name: 'Citadel Watcher' },
        eternal_dark: { difficulty: 'nightmare', name: 'Eternal Warden' },
    }
};

function parseTravelUnlocks(raw) {
    const defaults = { overworld: ['forest'], abyss: ['shadowfen'] };
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return { ...defaults, overworld: Array.from(new Set([...defaults.overworld, ...parsed])) };
        }
        return {
            overworld: Array.from(new Set([...(defaults.overworld || []), ...((parsed && parsed.overworld) || [])])),
            abyss: Array.from(new Set([...(defaults.abyss || []), ...((parsed && parsed.abyss) || [])])),
        };
    } catch {
        return defaults;
    }
}

function stringifyTravelUnlocks(unlocks) {
    return JSON.stringify({
        overworld: Array.from(new Set(unlocks.overworld || ['forest'])),
        abyss: Array.from(new Set(unlocks.abyss || ['shadowfen'])),
    });
}

function getTravelUnlockSet(char, currentMap = 'overworld') {
    const unlocks = parseTravelUnlocks(char?.unlocked_zones);
    const key = currentMap === 'abyss' ? 'abyss' : 'overworld';
    const set = new Set(unlocks[key] || []);
    if (currentMap === 'abyss') set.add('shadowfen');
    else set.add('forest');
    if (char?.location) set.add(char.location);
    return set;
}

async function unlockTravelZone(db, char, targetZone, currentMap = 'overworld') {
    const unlocks = parseTravelUnlocks(char?.unlocked_zones);
    const key = currentMap === 'abyss' ? 'abyss' : 'overworld';
    unlocks[key] = Array.from(new Set([...(unlocks[key] || []), targetZone]));
    const encoded = stringifyTravelUnlocks(unlocks);
    await dbRun(db, 'UPDATE characters SET unlocked_zones=? WHERE id=?', [encoded, char.id]);
    char.unlocked_zones = encoded;
    return unlocks;
}

function buildTravelGuardian(targetZone, currentMap, playerLevel, playerStats = null) {
    const zoneMap = currentMap === 'abyss' ? ABYSS_ZONES : ZONES;
    const guardianDef = (TRAVEL_GUARDIANS[currentMap] || {})[targetZone];
    if (!guardianDef) return null;
    const zone = zoneMap[targetZone];
    const zoneLevel = zone?.minLevel || 1;
    const npc = buildNpc(guardianDef.difficulty, playerLevel, zoneLevel, playerStats);
    npc.name = guardianDef.name;
    npc.class = 'npc';
    npc.ignoreDefenderZones = true;
    return npc;
}

function getTravelGraph(currentMap) {
    return currentMap === 'abyss' ? ABYSS_ROUTES : OVERWORLD_TRAVEL_ROUTES;
}

function getShortestTravel(currentMap, fromZone, toZone, allowedNodes = null) {
    if (fromZone === toZone) return { time: 0, path: [fromZone] };
    const graph = getTravelGraph(currentMap);
    const dist = {};
    const prev = {};
    const nodes = new Set(Object.keys(graph));
    nodes.add(fromZone);
    nodes.add(toZone);
    for (const node of nodes) dist[node] = Infinity;
    dist[fromZone] = 0;

    const unvisited = new Set(nodes);
    while (unvisited.size) {
        let current = null;
        for (const node of unvisited) {
            if (current === null || dist[node] < dist[current]) current = node;
        }
        if (current === null || dist[current] === Infinity) break;
        unvisited.delete(current);
        if (current === toZone) break;

        for (const [neighbor, cost] of Object.entries(graph[current] || {})) {
            if (allowedNodes && neighbor !== toZone && !allowedNodes.has(neighbor)) continue;
            const alt = dist[current] + cost;
            if (alt < (dist[neighbor] ?? Infinity)) {
                dist[neighbor] = alt;
                prev[neighbor] = current;
                unvisited.add(neighbor);
            }
        }
    }

    if (!Number.isFinite(dist[toZone])) return null;
    const path = [];
    let cursor = toZone;
    while (cursor) {
        path.unshift(cursor);
        cursor = prev[cursor];
    }
    if (path[0] !== fromZone) return null;
    return { time: dist[toZone], path };
}

function getAssetImagePath(name, basePath = '/images/assets') {
    const slug = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug ? `${basePath}/${slug}.png` : null;
}

// ── Item Generators ─────────────────────────────────────────────────────────
// ELEMENTS already defined at top

function maxElemStats(level) {
    if (level >= 86) return 6;
    if (level >= 71) return 5;
    if (level >= 51) return 4;
    if (level >= 25) return 3;
    if (level >= 10) return 2;
    return 1;
}

function rollElemStats(stats, level, tier, canDmg, canResist) {
    const baseChance = tier >= 5 ? 0.75 : tier >= 3 ? 0.55 : tier >= 2 ? 0.35 : 0.15;
    if (Math.random() > baseChance) return;

    const maxStats = maxElemStats(level);
    const minCount = level >= 45 ? 2 : level >= 30 ? 1 : 0;
    const maxRoll  = Math.max(minCount, Math.min(maxStats, Math.ceil(level / 20)));
    const count    = minCount + Math.floor(Math.random() * Math.max(1, maxRoll - minCount + 1));

    const shuffled = [...ELEMENTS].sort(() => Math.random() - 0.5);
    let rolled = 0;

    for (const elem of shuffled) {
        if (rolled >= count) break;
        const doDmg    = canDmg    && (!canResist || Math.random() < 0.4);
        const doResist = canResist && !doDmg;
        if (!doDmg && !doResist) continue;

        const dmgKey    = `${elem}_dmg`;
        const resistKey = `${elem}_resist`;

        if (doDmg && !stats[dmgKey]) {
            const base   = 1 + Math.floor(level * 0.12);
            const range  = Math.floor(level * 0.08);
            const dmgVal = base + Math.floor(Math.random() * Math.max(1, range));
            stats[dmgKey] = dmgVal;
            rolled++;
            if (!stats[resistKey] && Math.random() < 0.5) {
                stats[resistKey] = Math.floor(dmgVal * (1.4 + Math.random() * 0.3));
            }
            if (elem === 'pyro' && Math.random() < 0.20) {
                stats['water_resist'] = (stats['water_resist'] || 0) - (1 + Math.floor(dmgVal * 0.3));
            }
        } else if (doResist && !stats[resistKey]) {
            const base  = 2 + Math.floor(level * 0.18);
            const range = Math.floor(level * 0.12);
            stats[resistKey] = base + Math.floor(Math.random() * Math.max(1, range));
            rolled++;
        }
    }
}

const ITEM_GENERATORS = {
    weapon: {
        namePrefixes: ['Iron','Steel','Bronze','Silver','Golden','Crystal','Obsidian','Dragon','Mythril','Adamant'],
        nameSuffixes: ['Sword','Blade','Axe','Dagger','Bow','Staff','Hammer','Spear','Mace','Scythe'],
        emojis: ['⚔️','🗡️','🪓','🏹','🪄','🔨','🔪','⚒️'],
        baseStats: {
            dmg_min:  { min:4,  max:10,  scale:2.0 },
            dmg_max:  { min:8,  max:20,  scale:4.0 },
            strength: { min:0,  max:3,   scale:0.5 },
        },
        tier2Stats: {
            hit_chance: { min:1, max:3, scale:0.25, chance:0.4 },
        },
        tier3Stats: {
            agility:     { min:0, max:3, scale:0.4, chance:0.5 },
            hit_chance:  { min:1, max:4, scale:0.3, chance:0.5 },
            magic:       { min:0, max:3, scale:0.3, chance:0.4 },
            crit_chance: { min:2, max:7, scale:0.45, chance:0.4 },
        },
        tier5Stats: {
            crit_chance: { min:3, max:10, scale:0.5, chance:0.6 },
            strength:    { min:1, max:4, scale:0.35, chance:0.5 },
        },
        elemDmg: true, elemResist: false,
    },
    armor: {
        namePrefixes: ['Leather','Chain','Plate','Scale','Crystal','Obsidian','Dragon','Mythril','Adamant'],
        nameSuffixes: ['Armor','Vest','Cuirass','Breastplate','Hauberk','Mail','Plate'],
        emojis: ['🛡️','🧥','🥼','👕','🦺'],
        baseStats: {
            defense: { min:2,  max:6,  scale:1.2 },
            armor:   { min:1,  max:4,  scale:0.8 },
            hp_max:  { min:10, max:25, scale:1.5 },
        },
        tier2Stats: {
            vitality: { min:0, max:2, scale:0.25, chance:0.4 },
        },
        tier3Stats: {
            vitality:    { min:1, max:3, scale:0.4, chance:0.5 },
            magic:       { min:0, max:2, scale:0.25, chance:0.4 },
            crit_chance: { min:1, max:4, scale:0.3, chance:0.4 },
        },
        tier5Stats: {
            crit_chance: { min:2, max:6, scale:0.35, chance:0.55 },
            strength:    { min:0, max:3, scale:0.35, chance:0.5 },
        },
        elemDmg: false, elemResist: true,
    },
    helmet: {
        namePrefixes: ['Leather','Iron','Steel','Battle','Shadow','Crystal','Dragon','Mythril','Adamant'],
        nameSuffixes: ['Helm','Helmet','Visor','Cap','Hood','Cowl','Crown','Circlet','Headguard'],
        emojis: ['⛑️','🪖','👑','🎭'],
        baseStats: {
            defense: { min:1, max:4,  scale:0.9 },
            armor:   { min:1, max:3,  scale:0.5 },
            hp_max:  { min:5, max:18, scale:1.2 },
        },
        tier2Stats: {
            hit_chance: { min:1, max:3, scale:0.25, chance:0.4 },
        },
        tier3Stats: {
            hit_chance:  { min:1, max:4, scale:0.3, chance:0.5 },
            magic:       { min:0, max:3, scale:0.3, chance:0.4 },
            crit_chance: { min:2, max:6, scale:0.4, chance:0.4 },
        },
        tier5Stats: {
            crit_chance: { min:2, max:8, scale:0.5, chance:0.55 },
        },
        elemDmg: true, elemResist: true,
    },
    shield: {
        namePrefixes: ['Wooden','Iron','Steel','Tower','Dragon','Mythril','Crystal','Obsidian','Adamant'],
        nameSuffixes: ['Shield','Buckler','Aegis','Bulwark','Barrier','Wall','Guard'],
        emojis: ['🛡️','🔰'],
        baseStats: {
            defense: { min:3,  max:7,  scale:1.5 },
            armor:   { min:2,  max:5,  scale:1.0 },
            hp_max:  { min:8,  max:22, scale:1.2 },
        },
        tier2Stats: {
            vitality: { min:0, max:2, scale:0.25, chance:0.4 },
        },
        tier3Stats: {
            vitality:    { min:1, max:3, scale:0.4, chance:0.5 },
            crit_chance: { min:1, max:4, scale:0.35, chance:0.4 },
        },
        tier5Stats: {
            crit_chance: { min:2, max:6, scale:0.35, chance:0.55 },
            defense:     { min:1, max:4, scale:0.4, chance:0.5 },
        },
        elemDmg: false, elemResist: true,
    },
    boots: {
        namePrefixes: ['Leather','Iron','Steel','Shadow','Swift','Dragon','Mythril'],
        nameSuffixes: ['Boots','Greaves','Sabatons','Treads','Stompers','Walkers'],
        emojis: ['👢','🥾','👟'],
        baseStats: {
            agility: { min:1, max:5, scale:1.0 },
            defense: { min:0, max:2, scale:0.4 },
            armor:   { min:0, max:3, scale:0.5 },
        },
        tier2Stats: {
            hit_chance: { min:1, max:2, scale:0.2, chance:0.4 },
            armor:      { min:1, max:2, scale:0.25, chance:0.35 },
        },
        tier3Stats: {
            hit_chance:  { min:1, max:4, scale:0.3, chance:0.5 },
            agility:     { min:1, max:3, scale:0.35, chance:0.5 },
            armor:       { min:1, max:3, scale:0.35, chance:0.4 },
            crit_chance: { min:1, max:4, scale:0.35, chance:0.4 },
        },
        tier5Stats: {
            crit_chance: { min:2, max:7, scale:0.45, chance:0.55 },
            agility:     { min:1, max:4, scale:0.4, chance:0.5 },
            armor:       { min:2, max:5, scale:0.4, chance:0.45 },
        },
        elemDmg: false, elemResist: true,
    },
    ring: {
        namePrefixes: ['Iron','Silver','Golden','Obsidian','Ruby','Sapphire','Emerald','Diamond','Bone'],
        nameSuffixes: ['Ring','Band','Loop','Signet','Seal'],
        emojis: ['💍','⭕','🔵','🟢','🔴'],
        baseStats: {
            strength: { min:0, max:3, scale:0.45 },
            magic:    { min:0, max:3, scale:0.45 },
            agility:  { min:0, max:3, scale:0.4 },
        },
        tier2Stats: {
            hit_chance: { min:1, max:3, scale:0.25, chance:0.4 },
        },
        tier3Stats: {
            hit_chance:  { min:1, max:4, scale:0.3, chance:0.5 },
            magic:       { min:1, max:3, scale:0.35, chance:0.5 },
            crit_chance: { min:2, max:5, scale:0.4, chance:0.45 },
        },
        tier5Stats: {
            crit_chance: { min:3, max:9, scale:0.5, chance:0.6 },
            magic:       { min:1, max:4, scale:0.35, chance:0.5 },
        },
        elemDmg: true, elemResist: true,
    },
    amulet: {
        namePrefixes: ['Ancient','Blessed','Cursed','Enchanted','Void','Holy','Shadow','Dragon','Arcane'],
        nameSuffixes: ['Amulet','Pendant','Talisman','Necklace','Locket','Medallion'],
        emojis: ['📿','🔱','⚜️','🌟','💫'],
        baseStats: {
            magic:   { min:1, max:4, scale:0.6 },
            defense: { min:0, max:2, scale:0.35 },
            hp_max:  { min:5, max:20, scale:1.0 },
        },
        tier2Stats: {
            magic: { min:1, max:2, scale:0.25, chance:0.4 },
        },
        tier3Stats: {
            magic:       { min:1, max:4, scale:0.4, chance:0.5 },
            hit_chance:  { min:1, max:3, scale:0.25, chance:0.5 },
            crit_chance: { min:2, max:6, scale:0.45, chance:0.45 },
        },
        tier5Stats: {
            crit_chance: { min:3, max:9, scale:0.5, chance:0.6 },
            magic:       { min:2, max:5, scale:0.4, chance:0.5 },
        },
        elemDmg: true, elemResist: true,
    },
    accessory: {
        namePrefixes: ['Iron','Silver','Golden','Crystal','Ruby','Sapphire','Emerald','Diamond','Bone'],
        nameSuffixes: ['Charm','Token','Seal','Signet','Talisman','Rune'],
        emojis: ['🔮','✨','🪬','💠','🔷'],
        baseStats: {
            strength: { min:0, max:2, scale:0.35 },
            agility:  { min:0, max:2, scale:0.35 },
            magic:    { min:0, max:2, scale:0.35 },
        },
        tier2Stats: {
            hit_chance: { min:1, max:2, scale:0.2, chance:0.4 },
        },
        tier3Stats: {
            hit_chance:  { min:1, max:3, scale:0.25, chance:0.5 },
            magic:       { min:0, max:3, scale:0.3, chance:0.4 },
            crit_chance: { min:2, max:5, scale:0.4, chance:0.4 },
        },
        tier5Stats: {
            crit_chance: { min:3, max:8, scale:0.5, chance:0.55 },
        },
        elemDmg: true, elemResist: true,
    },
};

function generateBackendRandomItem(level, type) {
    const generator = ITEM_GENERATORS[type];
    if (!generator) return null;
    const tier = Math.min(5, Math.ceil(level / 20) + 1);
    const stats = {};

    function rollStat(cfg, lvl) {
        const mn = Math.floor(cfg.min + lvl * cfg.scale * 0.3);
        const mx = Math.floor(cfg.max + lvl * cfg.scale * 0.6);
        let v = mn + Math.floor(Math.random() * Math.max(1, mx - mn + 1));
        v = Math.floor(v * (0.85 + Math.random() * 0.30));
        return Math.max(cfg.min, v);
    }

    const quality = (() => {
        const legendaryChance = 0.001;
        if (Math.random() < legendaryChance) return 'legendary';
        
        let rareChance = 0;
        if (tier >= 5) rareChance = 0.20;
        else if (tier >= 4) rareChance = 0.12;
        else if (tier >= 3) rareChance = 0.07;
        else if (tier >= 2) rareChance = 0.03;
        else rareChance = 0.01;
        
        return Math.random() < rareChance ? 'rare' : 'common';
    })();

    function getStatChance(baseChance) {
        if (quality === 'legendary') return Math.min(0.95, baseChance + 0.35);
        if (quality === 'rare') return Math.min(0.85, baseChance + 0.20);
        return baseChance;
    }

    if (generator.baseStats) {
        for (const [k, cfg] of Object.entries(generator.baseStats)) {
            let shouldRoll = true;
            if (k === 'hit_chance' || k === 'agility') {
                shouldRoll = Math.random() < getStatChance(0.5);
            } else if (k === 'crit_chance') {
                shouldRoll = Math.random() < getStatChance(0.35);
            }
            if (shouldRoll) {
                let v = rollStat(cfg, level);
                if (k === 'dmg_min' && v < 1) v = 1;
                if (k === 'dmg_max' && v < 2) v = 2;
                if (v > 0) stats[k] = v;
            }
        }
    }
    
    if (stats.dmg_min && stats.dmg_max) {
        const minGap = Math.max(8, Math.floor(stats.dmg_max * 0.25));
        if (stats.dmg_max < stats.dmg_min + minGap) {
            stats.dmg_max = stats.dmg_min + minGap;
        }
    }
    
    if (tier >= 2 && generator.tier2Stats) {
        for (const [k, cfg] of Object.entries(generator.tier2Stats)) {
            let baseChance = cfg.chance || 0.45;
            if (k === 'hit_chance' || k === 'agility') {
                baseChance = 0.5;
            } else if (k === 'crit_chance') {
                baseChance = 0.35;
            }
            const chance = getStatChance(baseChance);
            if (Math.random() < chance) {
                const v = rollStat(cfg, level);
                if (v > 0) stats[k] = v;
            }
        }
    }
    
    if (tier >= 3 && generator.tier3Stats) {
        for (const [k, cfg] of Object.entries(generator.tier3Stats)) {
            let baseChance = cfg.chance || 0.5;
            if (k === 'hit_chance' || k === 'agility') {
                baseChance = 0.5;
            } else if (k === 'crit_chance') {
                baseChance = 0.35;
            }
            const chance = getStatChance(baseChance);
            if (Math.random() < chance) {
                const v = rollStat(cfg, level);
                if (v > 0) stats[k] = v;
            }
        }
    }
    
    if (tier >= 5 && generator.tier5Stats) {
        for (const [k, cfg] of Object.entries(generator.tier5Stats)) {
            let baseChance = cfg.chance || 0.45;
            if (k === 'hit_chance' || k === 'agility') {
                baseChance = 0.5;
            } else if (k === 'crit_chance') {
                baseChance = 0.35;
            }
            const chance = getStatChance(baseChance);
            if (Math.random() < chance) {
                const v = rollStat(cfg, level);
                if (v > 0) stats[k] = v;
            }
        }
    }

    rollElemStats(stats, level, tier, generator.elemDmg, generator.elemResist);

    const prefix = generator.namePrefixes[Math.floor(Math.random() * generator.namePrefixes.length)];
    const suffix = generator.nameSuffixes[Math.floor(Math.random() * generator.nameSuffixes.length)];
    const name   = `${prefix} ${suffix}`;
    const emoji  = generator.emojis[Math.floor(Math.random() * generator.emojis.length)];
    const imgSlug = name.toLowerCase().replace(/\s+/g, '-');
    
    const slotMap = { weapon:'weapon', armor:'armor', helmet:'helmet', shield:'shield', accessory:'accessory', jewelry:'amulet', ring:'ring', amulet:'amulet', boots:'boots' };

    const item = {
        id:      `${type}_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
        name, emoji, tier, level,
        img:     `/images/assets/${imgSlug}.png`,
        desc:    generateItemLore(name, type, prefix, suffix, quality),
        stats,
        slot:    slotMap[type] || type,
        category: type,
        price:   0,
        quality,
    };
    item.price = calculateBackendItemPrice(item, level);
    item.original_price = item.price;  // ← ADDED: Store original price

    if (Math.random() < 0.20) {
        const maxGems = Math.min(30, Math.max(1, Math.floor(tier * 4 + level * 0.15)));
        const gemCost = 1 + Math.floor(Math.random() * maxGems);
        item.gemCost = gemCost;
        item.price   = Math.max(1, Math.floor(item.price * (1 - Math.min(0.20, gemCost / 150))));
        item.original_price = item.price;  // ← ADDED: Update original price after gem discount
        item.desc    = `✨ ${item.desc}`;
    }

    if (Math.random() < 0.06) {
        const classes = ['warrior','mage','rogue','paladin'];
        item.classes = [classes[Math.floor(Math.random() * classes.length)]];
    }
    return item;
}

function generateItemLore(name, type, prefix, suffix, quality) {
    const loreParts = {
        prefix: {
            'Dragon':   ['forged from dragon scales', 'tempered in dragon fire', 'etched with draconic runes'],
            'Mythril':  ['woven from mythril veins', 'lighter than air yet unyielding', 'mined from the deepest seams'],
            'Adamant':  ['harder than any known ore', 'capable of cutting stone', 'said to be unbreakable'],
            'Obsidian': ['carved from volcanic glass', 'born of ancient eruptions', 'sharp as a razor\'s edge'],
            'Crystal':  ['grown over centuries underground', 'resonating with arcane energy', 'humming with inner light'],
            'Golden':   ['gilded in pure mountain gold', 'worth a king\'s ransom', 'shimmering with wealth'],
            'Silver':   ['blessed by moonlight', 'polished to a mirror sheen', 'favored by rogues and priests alike'],
            'Shadow':   ['absorbed the darkness of the void', 'wreathed in perpetual shadow', 'invisible in dim light'],
            'Ancient':  ['recovered from a forgotten tomb', 'older than any kingdom', 'inscribed with a dead language'],
            'Blessed':  ['consecrated by a high priest', 'humming with holy energy', 'said to repel evil'],
            'Cursed':   ['carrying the weight of a dark oath', 'bound to a restless soul', 'whispering in the dark'],
            'Holy':     ['radiating divine warmth', 'crafted in a sacred forge', 'glowing with righteous light'],
            'Arcane':   ['pulsing with raw magical energy', 'traced with glowing sigils', 'humming with arcane power'],
            'Swift':    ['light as a feather', 'built for speed above all', 'crafted for the fastest warriors'],
            'Iron':     ['crude but dependable', 'hammered into shape by a steady hand', 'reliable in any battle'],
            'Steel':    ['folded a thousand times over', 'tempered to perfection', 'hardened through fire and water'],
            'Leather':  ['stitched from tanned beast hide', 'supple yet tough', 'worn smooth from years of use'],
            'Tower':    ['wide enough to shelter two', 'an immovable wall in battle', 'tested against siege weapons'],
            'Wooden':   ['carved from a century-old oak', 'lightweight and surprisingly resilient', 'reinforced with iron bands'],
            'Battle':   ['scarred from a hundred conflicts', 'tested on the bloodiest fields', 'a veteran\'s companion'],
            'Void':     ['touched by the emptiness between worlds', 'draining warmth from its surroundings', 'unsettling to behold'],
            'Bone':     ['carved from the remains of a great beast', 'rattling with an uneasy energy', 'bleached white by sun and wind'],
            'Ruby':     ['set with a blood-red gemstone', 'warm to the touch', 'catching light like a flame'],
            'Sapphire': ['inlaid with a deep blue gem', 'cool as the northern sea', 'prized by mages and scholars'],
            'Emerald':  ['adorned with a verdant stone', 'said to grow sharper in forests', 'humming with natural energy'],
            'Diamond':  ['encrusted with the hardest gem known', 'refracting light into rainbows', 'beyond the price of most kings'],
            'Enchanted':['bound with a permanent enchantment', 'glowing faintly in the dark', 'responding to its wielder\'s will'],
        },
        suffix: {
            'Sword':      ['its edge never seems to dull', 'balanced for both slash and thrust'],
            'Blade':      ['thin enough to slip between ribs', 'honed to an impossible edge'],
            'Axe':        ['capable of felling trees in one blow', 'built for pure destructive force'],
            'Dagger':     ['small enough to conceal anywhere', 'favored by assassins throughout history'],
            'Bow':        ['its string never snaps', 'silent enough to hunt ghosts'],
            'Staff':      ['amplifying the wielder\'s magic tenfold', 'humming with channeled power'],
            'Hammer':     ['every strike sending shockwaves through armor', 'heavier than it looks'],
            'Spear':      ['its reach giving a decisive advantage', 'balanced for both thrust and throw'],
            'Mace':       ['capable of crumpling armor like parchment', 'devastating against the undead'],
            'Scythe':     ['originally a farming tool, now a weapon of terror', 'wide arc cuts through crowds'],
            'Armor':      ['distributed weight across the entire torso', 'showing countless old dents and repairs'],
            'Vest':       ['allowing full range of movement', 'light enough to forget you\'re wearing it'],
            'Cuirass':    ['molded perfectly to the warrior\'s chest', 'the centerpiece of a veteran\'s kit'],
            'Breastplate':['turned aside many a killing blow', 'engraved with a personal crest'],
            'Helm':       ['protecting the most vital target on the battlefield', 'dented but never broken'],
            'Helmet':     ['fitted with a sturdy visor', 'padding worn smooth from years of use'],
            'Crown':      ['commanding instant respect from allies and enemies alike', 'heavier than it appears'],
            'Shield':     ['absorbing blows that would have ended lesser warriors', 'scarred but unbroken'],
            'Buckler':    ['small enough to punch with', 'fast enough to deflect arrows mid-flight'],
            'Aegis':      ['said to have turned aside a dragon\'s claw', 'legendary among defenders'],
            'Boots':      ['waterproofed with rendered fat', 'silent on any surface'],
            'Greaves':    ['articulated for full leg mobility', 'protecting shins from sweeping attacks'],
            'Ring':       ['worn smooth from generations of use', 'always the perfect fit'],
            'Amulet':     ['passed down through three warrior bloodlines', 'warm against the skin'],
            'Pendant':    ['swaying gently even in still air', 'given as a token of power'],
            'Charm':      ['carried for luck by its previous owner — who survived', 'small enough to hide in a fist'],
            'Talisman':   ['said to ward off dark magic', 'inscribed with a prayer of protection'],
        }
    };

    const prefixLore  = loreParts.prefix[prefix]  || [`crafted with great skill`];
    const suffixLore  = loreParts.suffix[suffix]   || [`built to endure the harshest battles`];
    const chosenPre   = prefixLore[Math.floor(Math.random() * prefixLore.length)];
    const chosenSuf   = suffixLore[Math.floor(Math.random() * suffixLore.length)];

    const qualityTag = quality === 'legendary' ? ' A true legend.' : quality === 'rare' ? ' Rarely seen.' : '';

    const firstChar = name[0].toLowerCase();
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    const article = vowels.includes(firstChar) ? 'An' : 'A';
    
    const nameLower = name.toLowerCase();
    
    return `${article} ${nameLower} ${chosenPre}, ${chosenSuf}.${qualityTag}`;
}

function calculateBackendItemPrice(item, level) {
    const basePrice = 20 + (level * 13);
    
    const statSum = Object.values(item.stats || {}).reduce((sum, val) => {
        if (typeof val === 'number' && val > 0) {
            return sum + val;
        }
        return sum;
    }, 0);
    
    const statMultiplier = Math.max(1, 1 + (statSum * 1.2));
    
    const tierMultiplier = item.tier === 5 ? 2.0 : 
                           item.tier === 4 ? 1.6 : 
                           item.tier === 3 ? 1.3 : 
                           item.tier === 2 ? 1.1 : 1.0;
    
    const qualityMultiplier = item.quality === 'legendary' ? 1.35 : 
                              item.quality === 'rare' ? 1.15 : 1.0;
    
    let price = Math.floor(basePrice * statMultiplier * tierMultiplier * qualityMultiplier);
    
    if (item.quality === 'legendary') price = Math.max(price, 35000);
    else if (item.quality === 'rare') price = Math.max(price, 10000);
    else if (item.tier >= 3) price = Math.max(price, 3000);
    
    return price;
}

const POTION_CATALOGUE = [
    { id:'potion_minor_hp',    name:'Minor Health Potion',     emoji:'🧪', level:1,  price:80,   priceType:'gold', desc:'Restores 30 HP.',          effect:{ type:'heal', value:30  }, consumable:true, category:'consumable' },
    { id:'potion_minor_str',   name:'Minor Strength Draught',  emoji:'⚗️', level:1,  price:120,  priceType:'gold', desc:'+2 Strength for session.',  effect:{ type:'temp_stat', stat:'strength', value:2 }, consumable:true, category:'consumable' },
    { id:'potion_minor_def',   name:'Minor Defense Tonic',     emoji:'🧴', level:1,  price:120,  priceType:'gold', desc:'+2 Defense for session.',   effect:{ type:'temp_stat', stat:'defense',  value:2 }, consumable:true, category:'consumable' },
    { id:'potion_light_hp',    name:'Light Health Potion',     emoji:'🧪', level:5,  price:200,  priceType:'gold', desc:'Restores 80 HP.',           effect:{ type:'heal', value:80  }, consumable:true, category:'consumable' },
    { id:'potion_light_agi',   name:'Light Agility Draught',   emoji:'⚗️', level:5,  price:250,  priceType:'gold', desc:'+3 Agility for session.',   effect:{ type:'temp_stat', stat:'agility',  value:3 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_hp', name:'Health Potion',           emoji:'🧪', level:10, price:450,  priceType:'gold', desc:'Restores 180 HP.',          effect:{ type:'heal', value:180 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_str',name:'Strength Elixir',         emoji:'⚗️', level:10, price:550,  priceType:'gold', desc:'+5 Strength for session.',  effect:{ type:'temp_stat', stat:'strength', value:5 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_mag',name:"Mage's Focus Tonic",      emoji:'🔮', level:10, price:550,  priceType:'gold', desc:'+5 Magic for session.',     effect:{ type:'temp_stat', stat:'magic',    value:5 }, consumable:true, category:'consumable' },
    { id:'potion_greater_hp',  name:'Greater Health Potion',   emoji:'🧪', level:20, price:900,  priceType:'gold', desc:'Restores 400 HP.',          effect:{ type:'heal', value:400 }, consumable:true, category:'consumable' },
    { id:'potion_greater_def', name:'Greater Defense Tonic',   emoji:'🧴', level:20, price:1100, priceType:'gold', desc:'+8 Defense for session.',   effect:{ type:'temp_stat', stat:'defense',  value:8 }, consumable:true, category:'consumable' },
    { id:'potion_greater_agi', name:'Greater Agility Draught', emoji:'⚗️', level:20, price:1100, priceType:'gold', desc:'+8 Agility for session.',   effect:{ type:'temp_stat', stat:'agility',  value:8 }, consumable:true, category:'consumable' },
    { id:'potion_superior_hp', name:'Superior Health Potion',  emoji:'🧪', level:35, price:2200, priceType:'gold', desc:'Restores 900 HP.',          effect:{ type:'heal', value:900 }, consumable:true, category:'consumable' },
    { id:'potion_superior_str',name:'Superior Strength Elixir',emoji:'⚗️', level:35, price:2800, priceType:'gold', desc:'+15 Strength for session.', effect:{ type:'temp_stat', stat:'strength', value:15 }, consumable:true, category:'consumable' },
    { id:'potion_superior_mag',name:"Superior Mage's Focus",   emoji:'🔮', level:35, price:2800, priceType:'gold', desc:'+15 Magic for session.',    effect:{ type:'temp_stat', stat:'magic',    value:15 }, consumable:true, category:'consumable' },
    { id:'potion_full_elixir', name:'Full Elixir',             emoji:'💊', level:1,  price:5,    priceType:'gems', desc:'Fully restores all HP.',    effect:{ type:'heal_full', value:1 }, consumable:true, category:'consumable' },
    { id:'potion_mana',        name:'Mana Potion',             emoji:'💧', level:1,  price:5,    priceType:'gems', desc:'Restores 100 MP.',          effect:{ type:'mp', value:100 }, consumable:true, category:'consumable' },
];

function getPotionsForLevel(playerLevel) { 
    return POTION_CATALOGUE.filter(p => playerLevel >= p.level); 
}

// ── Helpers ───────────────────────────────────────────────────────────────
function withTrainingStatus(char) {
    const now = Math.floor(Date.now() / 1000);
    const trainingDone   = char.training_stat && char.training_ends_at && now >= char.training_ends_at;
    const trainingActive = char.training_stat && char.training_ends_at && now < char.training_ends_at;
    return { ...char, trainingDone:!!trainingDone, trainingActive:!!trainingActive,
        trainingSecondsLeft: trainingActive ? char.training_ends_at - now : 0 };
}
function withUpgradeCosts(char) {
    const costs = {};
    const stats = ['strength','defense','agility','magic','vitality','hit_chance','crit_chance'];
    
    for (const stat of stats) {
        // Get base cost from CLASS_DISCOUNTS
        let baseCost = upgradeCost(stat, char[stat] || 0, char.class);
        
        // Apply skill tree penalties/discounts
        let finalCost = applyClassUpgradeCostModifier(char.class, stat, baseCost);
        
        costs[stat] = finalCost;
    }
    
    return { ...char, upgradeCosts: costs };
}

async function getEquippedItems(db, charId) {
    const char = await dbGet(db, 'SELECT class FROM characters WHERE id=?', [charId]);
    const eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id = ?', [charId]);
    if (!eq) return {};

    // Check if rogue has dual-wield unlocked
    let dualWield = false;
    if (char?.class === 'rogue') {
        const dwRow = await dbGet(db,
            `SELECT 1 FROM character_skill_tree WHERE char_id=? AND skill_id='off_hand_training'`, [charId]);
        dualWield = !!dwRow;
    }

    const slots = {};
    for (const slot of EQUIPMENT_SLOTS) {
        if (slot === 'shield' && dualWield) {
            // Shield slot is now "off-hand weapon" for dual-wielders
            const itemId = eq[`shield_id`];
            if (itemId) {
                const inv = await dbGet(db, 'SELECT * FROM inventory WHERE id = ?', [itemId]);
                if (inv) {
                    const data = JSON.parse(inv.item_data);
                    if (data.slot === 'weapon') {
                        slots['off_hand'] = { ...data, inventoryId: inv.id };
                    } else {
                        slots[slot] = { ...data, inventoryId: inv.id };
                    }
                }
            }
        } else {
            const itemId = eq[`${slot}_id`];
            if (itemId) {
                const inv = await dbGet(db, 'SELECT * FROM inventory WHERE id = ?', [itemId]);
                if (inv) slots[slot] = { ...JSON.parse(inv.item_data), inventoryId: inv.id };
            }
        }
    }
    return slots;
}

async function getEquippedItemsArray(db, charId) {
    const eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id = ?', [charId]);
    if (!eq) return [];
    const items = [];
    for (const slot of EQUIPMENT_SLOTS) {
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

function makeConsumableRewardItem(itemId) {
    if (itemId === 'special_mana_potion') {
        return {
            id: 'special_mana_potion',
            name: 'Special Mana Potion',
            emoji: '💎',
            desc: 'Restores 60 MP. Crafted from your own MP reserve.',
            effect: { type: 'mp', value: 60 },
            consumable: true,
            category: 'consumable',
            qty: 1
        };
    }
    return {
        id: 'potion_mana',
        name: 'Mana Potion',
        emoji: '💧',
        desc: 'Restores 100 MP.',
        effect: { type: 'mp', value: 100 },
        consumable: true,
        category: 'consumable',
        qty: 1
    };
}

async function addStackableInventoryItem(db, charId, itemType, itemData, qty = 1) {
    const existing = await dbGet(
        db,
        `SELECT * FROM inventory WHERE char_id=? AND item_type=? AND json_extract(item_data,'$.id')=?`,
        [charId, itemType, itemData.id]
    );
    if (existing) {
        const current = JSON.parse(existing.item_data);
        current.qty = (current.qty || 1) + qty;
        await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(current), existing.id]);
        return;
    }
    await dbRun(db, 'INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)', [
        charId,
        itemType,
        JSON.stringify({ ...itemData, qty })
    ]);
}

async function grantAchievementRewards(db, char, rewards) {
    if (rewards.gold) {
        await dbRun(db, 'UPDATE characters SET gold = gold + ? WHERE id = ?', [rewards.gold, char.id]);
    }
    if (rewards.gems) {
        await dbRun(db, 'UPDATE characters SET gems = gems + ?, total_gems_earned = COALESCE(total_gems_earned, 0) + ? WHERE id = ?', [rewards.gems, rewards.gems, char.id]);
    }
    if (rewards.lootbox) {
        const lootBox = LOOT_BOXES.find(box => box.id === rewards.lootbox.id);
        if (lootBox) {
            await addStackableInventoryItem(db, char.id, 'consumable', lootBox, rewards.lootbox.qty || 1);
        }
    }
    if (rewards.consumable) {
        await addStackableInventoryItem(db, char.id, 'consumable', makeConsumableRewardItem(rewards.consumable.id), rewards.consumable.qty || 1);
    }
    if (rewards.premium) {
        const refreshedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        const activePrem = applyPremiumFeatureToCharacter(refreshedChar, rewards.premium.id, rewards.premium.days * 24 * 3600);
        await dbRun(db, 'UPDATE characters SET premium_features = ? WHERE id = ?', [JSON.stringify(activePrem), char.id]);
    }
}

async function getCharacterAchievements(db, char) {
    const claimedRows = await dbAll(db, 'SELECT achievement_id, claimed_at FROM character_achievements WHERE char_id = ?', [char.id]);
    const claimedMap = new Map(claimedRows.map(row => [row.achievement_id, row.claimed_at]));
    const items = [];
    for (const def of ACHIEVEMENTS) {
        const progress = await getAchievementMetricValue(db, char, def);
        const completed = progress >= def.target;
        const claimedAt = claimedMap.get(def.id) || null;
        items.push({
            ...def,
            progress,
            completed,
            claimed: !!claimedAt,
            claimable: completed && !claimedAt,
            claimed_at: claimedAt,
            reward_summary: buildAchievementRewardSummary(def.rewards)
        });
    }
    return {
        items,
        totals: {
            completed: items.filter(item => item.completed).length,
            claimed: items.filter(item => item.claimed).length,
            claimable: items.filter(item => item.claimable).length,
            total: items.length
        }
    };
}

async function buildCharacterResponse(char, db) {
    const equippedObj   = await getEquippedItems(db, char.id);
    const equippedArray = await getEquippedItemsArray(db, char.id);
    const setBonuses = getEquippedSetBonuses(equippedArray);
    const setCounts = getEquippedSetCounts(equippedArray);
    const hpMax     = calcHpMax(char, equippedArray);
    const hpCurrent = Math.min(char.hp_current ?? hpMax, hpMax);
    const withCosts = withUpgradeCosts({ ...char, hp_max: hpMax, hp_current: hpCurrent });
    const withTrain = withTrainingStatus(withCosts);
    const now = Math.floor(Date.now() / 1000);

    const activePremium   = getActivePremium(char);
    const activeSynergies = getActiveSynergies(activePremium);
    const ultimateActive  = hasUltimate(activePremium);
    const mpMaxMult       = hasPremium(activePremium, 'arcane_reservoir') ? 2 : 1;
    const effectiveMpMax  = MP_MAX * mpMaxMult;
    const upgradeDiscount = hasPremium(activePremium, 'apprentice') ? 0.20 : 0;

    const lastBattle = char.last_battle_at || 0;
    const pvpCd = hasPremium(activePremium, 'fortune_hunter') ? Math.floor(600 * 0.50) : 600;
    const battleCooldownEndsAt = lastBattle > 0 ? lastBattle + pvpCd : 0;
    const battleCooldownRemaining = battleCooldownEndsAt > now ? battleCooldownEndsAt - now : 0;

    const rawSkills = char.active_skills ? (() => { try { return JSON.parse(char.active_skills); } catch { return {}; } })() : {};
    const activeSkills = {};
    for (const [id, exp] of Object.entries(rawSkills)) { if (exp > now) activeSkills[id] = exp; }

    const skillLastUsed = char.skill_last_used ? (() => { try { return JSON.parse(char.skill_last_used); } catch { return {}; } })() : {};

    const todayStart2 = Math.floor(now / 86400) * 86400;
    const dailyMpSpent = (char.daily_mp_reset_at || 0) >= todayStart2 ? (char.daily_mp_spent || 0) : 0;
    const skillsUnlocked = dailyMpSpent >= MP_SKILL_UNLOCK;
    const activeEvent = getActiveEvent();
    const eventInfo = activeEvent ? { ...GLOBAL_EVENTS[0], ends_at: activeEvent.ends_at } : null;

const armorValue = calcArmorValue(char, equippedArray);
    const elemDmg = calcElemDmg(equippedArray || []);
    const elemResist = calcElemResist(char, equippedArray || []);
    
    // Rogue no-shield agility bonus
let noShieldAgiBonus = 0;
if (char.class === 'rogue') {  // Use 'char' here since that's the parameter name in buildCharacterResponse
    const hasShield = !!equippedObj.shield;
    if (!hasShield) {
        // 5% agility bonus when no shield equipped
        noShieldAgiBonus = Math.floor((char.agility || 0) * 0.05);
    }
}

    return {
        ...withTrain,
        vitality:     (char.vitality    || 10),
        gems:         char.gems        || 0,
        hp_max:       hpMax,
        hp_current:   hpCurrent,
        strength:     (char.strength    || 0),
        defense:      (char.defense     || 0),
        agility:      (char.agility     || 0),
        magic:        (char.magic       || 0),
        hit_chance:   (char.hit_chance  || 0),
        crit_chance:  (char.crit_chance || 0),
        mission_points: Math.min(effectiveMpMax, char.mission_points ?? 0),
        mp_max:       effectiveMpMax,
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
        battle_cooldown_ends_at:   battleCooldownEndsAt,
        active_event: eventInfo,
        armor_value:  armorValue,
        elem_dmg:     elemDmg,
        elem_resist:  elemResist,
        premium_features:  activePremium,
        premium_synergies: activeSynergies,
        premium_ultimate:  ultimateActive,
        upgrade_discount:  upgradeDiscount,
        no_shield_agi_bonus: noShieldAgiBonus,
        equipped_set_counts: setCounts,
        equipped_set_bonuses: setBonuses,
    };
}

// ── Character creation ────────────────────────────────────────────────────
router.post('/character', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { name, class: characterClass } = req.body;
        const userId = req.user.userId;
        const classDef = CLASSES[characterClass];
        if (!classDef) return res.status(400).json({ error: 'Invalid class.' });
        const existingCount = await dbGet(db, 'SELECT COUNT(*) AS count FROM characters WHERE user_id = ?', [userId]);
        if ((existingCount?.count || 0) >= 4) return res.status(400).json({ error: 'You can only create up to 4 characters on one account.' });
        const existingClass = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ? AND class = ?', [userId, characterClass]);
        if (existingClass) return res.status(400).json({ error: `You already have a ${characterClass} character.` });
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
        `, [
            userId,
            name,
            characterClass,
            1,
            0,
            5000,
            classDef.strength,
            classDef.defense,
            classDef.agility,
            classDef.magic,
            10,
            classDef.hp_max,
            classDef.hp_max,
            0,
            0,
            null,
            null,
            0,
            0,
            500,
            0,
            0,
            'forest',
            null,
            0,
            0,
            0,
            0,
            0
        ]);
        const created = await dbGet(db, 'SELECT id FROM characters WHERE user_id = ? AND class = ? ORDER BY id DESC LIMIT 1', [userId, characterClass]);
        await ensureActiveCharacter(db, userId, created?.id || null);
        const character = await getCurrentCharacter(db, userId);
        res.json(await buildCharacterResponse(character, db));
    } catch (e) {
        console.error('❌ Character creation error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Get character ─────────────────────────────────────────────────────────
router.get('/characters', auth, async (req, res) => {
    try {
        const db = await getDb();
        const activeCharacterId = await ensureActiveCharacter(db, req.user.userId);
        const characters = await listUserCharacters(db, req.user.userId);
        res.json({ activeCharacterId, maxCharacters: 4, availableClasses: Object.keys(CLASSES), characters });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/character/select', auth, async (req, res) => {
    try {
        const db = await getDb();
        const characterId = Number(req.body?.characterId || 0);
        if (!characterId) return res.status(400).json({ error: 'Character id required.' });
        const target = await dbGet(db, 'SELECT id FROM characters WHERE id = ? AND user_id = ?', [characterId, req.user.userId]);
        if (!target) return res.status(404).json({ error: 'Character not found.' });
        await ensureActiveCharacter(db, req.user.userId, characterId);
        const current = await getCurrentCharacter(db, req.user.userId);
        res.json({ success: true, character: await buildCharacterResponse(current, db) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/character', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });
        await applyHpRegen(db, char.id);
        await applyMpRegen(db, char.id);
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json(await buildCharacterResponse(freshChar, db));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/achievements', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });
        res.json(await getCharacterAchievements(db, char));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/achievements/:achievementId/claim', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });

        const achievement = ACHIEVEMENTS.find(item => item.id === req.params.achievementId);
        if (!achievement) return res.status(404).json({ error: 'Achievement not found' });

        const progress = await getAchievementMetricValue(db, char, achievement);
        if (progress < achievement.target) {
            return res.status(400).json({ error: 'Achievement not completed yet' });
        }

        const existingClaim = await dbGet(
            db,
            'SELECT achievement_id FROM character_achievements WHERE char_id = ? AND achievement_id = ?',
            [char.id, achievement.id]
        );
        if (existingClaim) {
            return res.status(400).json({ error: 'Achievement already claimed' });
        }

        await grantAchievementRewards(db, char, achievement.rewards);
        await dbRun(
            db,
            'INSERT INTO character_achievements (char_id, achievement_id, claimed_at) VALUES (?, ?, ?)',
            [char.id, achievement.id, Math.floor(Date.now() / 1000)]
        );

        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json({
            success: true,
            message: `Claimed ${achievement.name}!`,
            character: await buildCharacterResponse(freshChar, db),
            achievementId: achievement.id
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/weekly-tasks', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });
        res.json(await getWeeklyTasksPayload(db, char));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/weekly-tasks/:taskId/claim', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });

        const task = WEEKLY_TASKS.find((item) => item.id === req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Weekly task not found' });

        const weeklyState = await ensureWeeklyTaskState(db, char);
        const weekStart = Number(weeklyState?.week_start || getCurrentWeekStart());
        const progress = await getWeeklyTaskProgress(db, char, weeklyState, task.metric);
        if (progress < task.target) {
            return res.status(400).json({ error: 'Weekly task not completed yet' });
        }

        const existingClaim = await dbGet(
            db,
            'SELECT task_id FROM character_weekly_claims WHERE char_id = ? AND week_start = ? AND task_id = ?',
            [char.id, weekStart, task.id]
        );
        if (existingClaim) {
            return res.status(400).json({ error: 'Weekly task already claimed' });
        }

        if (task.rewards.gold) {
            await dbRun(db, 'UPDATE characters SET gold = gold + ? WHERE id = ?', [task.rewards.gold, char.id]);
        }
        if (task.rewards.gems) {
            await dbRun(db, 'UPDATE characters SET gems = gems + ?, total_gems_earned = COALESCE(total_gems_earned, 0) + ? WHERE id = ?', [task.rewards.gems, task.rewards.gems, char.id]);
        }
        if (task.rewards.lootbox) {
            const lootBox = LOOT_BOXES.find((box) => box.id === task.rewards.lootbox.id);
            if (lootBox) {
                await addStackableInventoryItem(db, char.id, 'consumable', lootBox, task.rewards.lootbox.qty || 1);
            }
        }
        if (task.rewards.choose_material) {
            const materialId = String(req.body?.materialId || '').trim();
            const optionSet = new Set(task.rewards.choose_material.options || []);
            if (!materialId || !optionSet.has(materialId)) {
                return res.status(400).json({ error: 'Choose a valid material reward first' });
            }
            const mat = RAW_MATERIALS[materialId];
            if (!mat) return res.status(400).json({ error: 'Material reward is unavailable' });
            await addStackableInventoryItem(db, char.id, 'raw_mat', { id: materialId, ...mat }, task.rewards.choose_material.qty || 1);
        }

        await dbRun(
            db,
            'INSERT INTO character_weekly_claims (char_id, week_start, task_id, claimed_at) VALUES (?, ?, ?, ?)',
            [char.id, weekStart, task.id, Math.floor(Date.now() / 1000)]
        );

        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json({
            success: true,
            message: `Claimed ${task.name}!`,
            character: await buildCharacterResponse(freshChar, db),
            weekly: await getWeeklyTasksPayload(db, freshChar)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Upgrade (UPDATED with skill tree cost modifier) ───────────────────────
router.post('/upgrade', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { stat } = req.body;
        if (!['strength','defense','agility','magic','vitality','hit_chance','crit_chance'].includes(stat))
            return res.status(400).json({ error: 'Invalid stat' });
        
        // Get learned skills for this character (for skill-specific discounts)
        const learnedRows = await dbAll(db, 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', [char.id]);
        const learnedIds = learnedRows.map(r => r.skill_id);
        
        // Get base cost from upgradeCost (includes CLASS_DISCOUNTS)
        let cost = upgradeCost(stat, char[stat] || 0, char.class);
        
        // Apply skill tree modifiers (class penalties/discounts from SKILL_TREES)
        cost = applyClassUpgradeCostModifier(char.class, stat, cost, learnedIds);
        
        if (eventHas('discount_stats')) cost = Math.max(1, Math.floor(cost * 0.70));
        const activePrem = getActivePremium(char);
        if (hasPremium(activePrem, 'apprentice')) cost = Math.max(1, Math.floor(cost * 0.80));
        
        const result = await dbRun(db,
            `UPDATE characters SET ${stat}=${stat}+1, gold=gold-? WHERE user_id=? AND gold>=?`,
            [cost, req.user.userId, cost]
        );
        if (!result.rowsAffected && result.rowsAffected !== undefined ? true : result.changes === 0) {
            const fresh = await dbGet(db, 'SELECT gold FROM characters WHERE user_id=?', [req.user.userId]);
            return res.status(400).json({ error: `Need ${cost} gold, have ${fresh?.gold ?? 0}.` });
        }
        
        // FIX: When upgrading vitality, properly update HP
        if (stat === 'vitality') {
            const equippedArray = await getEquippedItemsArray(db, char.id);
            const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
            const oldMaxHp = calcHpMax(char, equippedArray);
            const newMaxHp = calcHpMax(updatedChar, equippedArray);
            const hpIncrease = newMaxHp - oldMaxHp;
            await dbRun(db, 'UPDATE characters SET hp_current = hp_current + ? WHERE id = ?', [hpIncrease, char.id]);
        }
        
        const updated = await getCurrentCharacter(db, req.user.userId);
        res.json({ message: `+1 ${stat}! Spent ${cost} gold.`, character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Training (old stat training, keep as is) ──────────────────────────────
router.post('/train', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
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
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char || !char.training_stat) return res.status(400).json({ error: 'Not training' });
        const now = Math.floor(Date.now() / 1000);
        if (now < char.training_ends_at) return res.status(400).json({ error: `${char.training_ends_at - now}s remaining.` });
        await dbRun(db, `UPDATE characters SET ${char.training_stat}=${char.training_stat}+?,training_stat=NULL,training_ends_at=NULL WHERE id=?`, [TRAINING_GAIN, char.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json({ message:`+${TRAINING_GAIN} ${char.training_stat}!`, character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Loadout ───────────────────────────────────────────────────────────────
router.post('/loadout', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { attackZones, blockZones } = req.body;
        if (!Array.isArray(attackZones) || attackZones.length !== 10) return res.status(400).json({ error: 'attackZones must be array of 10' });
        if (!Array.isArray(blockZones)  || blockZones.length  !== 10) return res.status(400).json({ error: 'blockZones must be array of 10' });
        for (const z of attackZones) { if (!HIT_ZONES[z])   return res.status(400).json({ error: `Invalid attack zone: ${z}` }); }
        for (const z of blockZones)  { if (!BLOCK_ZONES[z]) return res.status(400).json({ error: `Invalid block zone: ${z}` }); }
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'Character not found' });
        await dbRun(db, 'UPDATE characters SET attack_zones=?, block_zones=? WHERE id=?', [JSON.stringify(attackZones), JSON.stringify(blockZones), char.id]);
        res.json({ message: 'Loadout saved.' });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Missions ──────────────────────────────────────────────────────────────
router.get('/missions', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        
        const active = await dbGet(db, 'SELECT * FROM active_missions WHERE character_id=?', [char.id]);
        const currentMap = char.current_map || 'overworld';
        const zones = getAllZones(currentMap);
        
        const unlockedZones = Object.entries(zones)
            .filter(([,z]) => char.level >= z.minLevel)
            .map(([key, z]) => ({ key, ...z }));
        
        res.json({ 
            active: active ? { ...active, mat_drops: JSON.parse(active.mat_drops || '[]') } : null, 
            unlockedZones, 
            charLevel: char.level,
            currentMap 
        });
    } catch (e) { 
        console.error(e); 
        res.status(500).json({ error: e.message }); 
    }
});

router.post('/missions/start', auth, async (req, res) => {
    const userId = req.user.userId;
    if (_missionStartLock.has(userId)) {
        return res.status(400).json({ error: 'Mission start already in progress.' });
    }
    _missionStartLock.add(userId);
    try {
        const db = await getDb();
        const { zoneId, spotId, missionName: sentName, size: reqSize } = req.body;
        const character = await getCurrentCharacter(db, userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const activeTraining = await dbGet(db, 'SELECT * FROM skill_training WHERE char_id = ? AND ends_at > ?', 
            [character.id, Math.floor(Date.now() / 1000)]);
        if (activeTraining) {
            return res.status(400).json({ error: 'Cannot start missions while training skills. Complete or cancel training first.' });
        }
        const currentMap = character.current_map || 'overworld';
        let zone;
        
        // Check the correct zone source based on current map
        if (currentMap === 'abyss') {
            zone = ABYSS_ZONES[zoneId];
        } else {
            zone = ZONES[zoneId];
        }
        
        if (!zone) {
            console.error('Zone not found:', zoneId, 'Map:', currentMap);
            return res.status(404).json({ error: 'Zone not found' });
        if (character.location !== zoneId) return res.status(400).json({ error: 'You must be at this zone to start missions' });
        }
        const hpCurrent = character.hp_current ?? character.hp_max;
        if (hpCurrent <= 0) return res.status(400).json({ error: 'Out of HP. Wait for regeneration.' });
        
        const now = Math.floor(Date.now() / 1000);
        const lastBattle = character.last_battle_at || 0;
        const activePrem = getActivePremium(character);
        const pvpCd = hasPremium(activePrem, 'fortune_hunter') ? Math.floor(600 * 0.50) : 600;
        
        if (lastBattle + 600 > now) {
            const secs = (lastBattle + pvpCd) - now;
            return res.status(400).json({ error: `Cannot start a mission so soon after battle. Wait ${secs < 60 ? secs + 's' : Math.ceil(secs / 60) + 'm'}.` });
        }
        
        const sizeKey = ['small', 'medium', 'large'].includes(reqSize) ? reqSize : 'small';
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
        
        const spot = zone.spots.find(s => s.id === spotId);
        if (!spot) return res.status(404).json({ error: 'Mission spot not found' });
        
        const difficulty = spot.difficulty;
        const [minGold, maxGold] = zone.payoutBase[difficulty];
        
        let minXp = 0, maxXp = 0;
        if (sizeKey === 'small') {
            minXp = 0;
            maxXp = 6;
        } else if (sizeKey === 'medium') {
            minXp = 0;
            maxXp = 9;
        } else {
            minXp = 0;
            maxXp = 12;
        }
        
        let xpReward = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
        xpReward = Math.max(0, xpReward);
        
        const goldReward = Math.floor((Math.floor(Math.random() * (maxGold - minGold + 1)) + minGold) * sizeConf.rewardMult);
        
        const missionList = spot.missions.map(m => typeof m === 'string' ? m : m.name);
        const missionName = (sentName && missionList.includes(sentName)) ? sentName : missionList[Math.floor(Math.random() * missionList.length)];
        
        const baseDuration = sizeConf.duration;
        let duration = eventHas('short_missions') ? Math.max(30, Math.floor(baseDuration / 2)) : baseDuration;
        if (hasPremium(activePrem, 'fortune_hunter')) duration = Math.max(30, Math.floor(duration * 0.50));
        
        let effectiveMpCost = sizeConf.mpCost;
        const midasFlow = PREMIUM_SYNERGIES.find(s => s.requires.includes('arcane_reservoir') && s.requires.includes('fortune_hunter'));
        if (midasFlow && hasPremium(activePrem, 'arcane_reservoir') && hasPremium(activePrem, 'fortune_hunter')) {
            effectiveMpCost = Math.max(0, effectiveMpCost - midasFlow.effect.mp_cost_reduction);
        }
        
        if (currentMp < effectiveMpCost) {
            return res.status(400).json({ error: `Not enough MP. ${sizeConf.label} mission costs ${effectiveMpCost} MP, you have ${currentMp}.` });
        }
        
        const insertResult = await dbRun(db, `
    INSERT INTO active_missions (character_id, zone, spot, spot_name, mission_name, difficulty, gold_reward, xp_reward, started_at, ends_at, map_type, size)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM active_missions WHERE character_id = ?)
`, [character.id, zoneId, spotId, spot.name, missionName, difficulty, goldReward, xpReward, now, now + duration, currentMap, sizeKey, character.id]);
        
        const didInsert = insertResult.rowsAffected ?? insertResult.changes ?? 0;
        if (!didInsert) return res.status(400).json({ error: 'You already have an active mission.' });
        
        await dbRun(db, 'UPDATE characters SET mission_points=mission_points-?, daily_mp_spent=daily_mp_spent+? WHERE id=?',
            [effectiveMpCost, effectiveMpCost, character.id]);
        await recordTotalMpSpent(db, character.id, effectiveMpCost);
        
        res.json({
            success: true,
            mission: {
                id: Number(insertResult.lastInsertRowid), 
                zone: zoneId, 
                spot: spotId, 
                spot_name: spot.name,
                mission_name: missionName, 
                missionName, 
                difficulty, 
                size: sizeKey,
                gold_reward: goldReward, 
                xp_reward: xpReward,
                started_at: now, 
                ends_at: now + duration, 
                duration,
                map_type: currentMap
            }
        });
    } catch (e) {
        console.error('Mission start error:', e);
        res.status(500).json({ error: e?.message || String(e) });
    } finally {
        _missionStartLock.delete(userId);
    }
});

// ── Missions Collect (UPDATED with skill tree passive bonuses) ────────────
router.post('/missions/collect', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        await applyHpRegen(db, character.id);
        await applyMpRegen(db, character.id);
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [character.id]);
        const mission = await dbGet(db, 'SELECT * FROM active_missions WHERE character_id = ?', [character.id]);
        if (!mission) return res.status(400).json({ error: 'No active mission' });
        let zoneLevel = 1;
        if (mission.map_type === 'abyss') {
            const zone = ABYSS_ZONES[mission.zone];
            zoneLevel = zone?.minLevel || 39;
        } else {
            const zone = ZONES[mission.zone];
            zoneLevel = zone?.minLevel || 1;
        }        
        const now = Math.floor(Date.now() / 1000);
        if (now < mission.ends_at) return res.status(400).json({ error: 'Mission not yet complete' });
        let playerStats = null;
        if (mission.difficulty === 'nightmare') {
    playerStats = {
        hp_max: freshChar.hp_max,
        strength: freshChar.strength,
        defense: freshChar.defense,
        agility: freshChar.agility,
        magic: freshChar.magic,
        hit_chance: freshChar.hit_chance,
        crit_chance: freshChar.crit_chance
    };
}
        const isEvent = eventHas('grand_festival');
        const activePremCollect = getActivePremium(freshChar);
        const hasUlt = hasUltimate(activePremCollect);
        const equippedArray = await getEquippedItemsArray(db, freshChar.id);
        const hpMax = calcHpMax(freshChar, equippedArray);
        const hpCurrent = freshChar.hp_current ?? hpMax;
        const setBonuses = getEquippedSetBonuses(equippedArray);
        const { dmgMin, dmgMax } = calcBaseDamage(freshChar, equippedArray);
        const charActiveSkills = getActiveSkills(freshChar);
        
        // ── Skill tree passive bonuses ──────────────────────────────────────
        const learnedRows = await dbAll(db, 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', [freshChar.id]);
        const learnedIds = learnedRows.map(r => r.skill_id);
        const skillPassives = await computePassiveBonusesWithProgress(db, freshChar.class, learnedIds, freshChar.id);
const skillActives  = await computeActiveCombatEffectsWithProgress(db, freshChar.class, learnedIds, freshChar.id);
const skillMods     = await computeClassModifiersWithProgress(db, freshChar.class, learnedIds, freshChar.id);
        
        // Rogue no-shield agility bonus
let noShieldAgiBonus = 0;
if (freshChar.class === 'rogue') {
    const equipped = await getEquippedItems(db, freshChar.id);  // Get equipped items
    const hasShield = !!equipped.shield;
    if (!hasShield) {
        noShieldAgiBonus = Math.floor((freshChar.agility || 0) * 0.05);
    }
}      
        const playerFighter = {
            id: freshChar.id,
            name: freshChar.name,
            class: freshChar.class,
            hp: hpCurrent,
            hpMax: hpMax,
            dmgMin: dmgMin + (skillPassives.dmg_min || 0),
            dmgMax: dmgMax + (skillPassives.dmg_max || 0),
            strength: (freshChar.strength || 0) + (setBonuses.strength || 0) + (skillPassives.strength || 0),
            agility: (freshChar.agility || 0) + (setBonuses.agility || 0) + (skillPassives.agility || 0) + noShieldAgiBonus,
            magic: (freshChar.magic || 0) + (setBonuses.magic || 0) + (skillPassives.magic || 0),
            defense: (freshChar.defense || 0) + (setBonuses.defense || 0) + (skillPassives.defense || 0),
            hit_chance: (freshChar.hit_chance || 0) + (setBonuses.hit_chance || 0) + (skillPassives.hit_chance || 0),
            crit_chance: (freshChar.crit_chance || 0) + (setBonuses.crit_chance || 0) + (skillPassives.crit_chance || 0),
            armor: calcArmorValue(freshChar, equippedArray) + (skillPassives.armor || 0),
            elem_dmg: {
                pyro:    (calcElemDmg(equippedArray || []).pyro    || 0) + (skillPassives.pyro_dmg    || 0),
                water:   (calcElemDmg(equippedArray || []).water   || 0) + (skillPassives.water_dmg   || 0),
                wind:    (calcElemDmg(equippedArray || []).wind    || 0) + (skillPassives.wind_dmg    || 0),
                electro: (calcElemDmg(equippedArray || []).electro || 0) + (skillPassives.electro_dmg || 0),
            },
            elem_resist: {
                pyro:    (calcElemResist(freshChar, equippedArray || []).pyro    || 0) + (skillPassives.pyro_resist    || 0),
                water:   (calcElemResist(freshChar, equippedArray || []).water   || 0) + (skillPassives.water_resist   || 0),
                wind:    (calcElemResist(freshChar, equippedArray || []).wind    || 0) + (skillPassives.wind_resist    || 0),
                electro: (calcElemResist(freshChar, equippedArray || []).electro || 0) + (skillPassives.electro_resist || 0),
            },
            skillEffects: skillActives,
            skillMods: skillMods,
            activeSkills: charActiveSkills,
            attackZones: JSON.parse(freshChar.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones: JSON.parse(freshChar.block_zones || 'null') || DEFAULT_BLOCK_ZONES,
            dualWield: freshChar.class === 'rogue' && rogueHasDualWield(learnedIds),
        };
        
        // Build NPC and override its name with the mission name
        const npc = buildNpc(mission.difficulty, freshChar.level, zoneLevel, playerStats);
        const npcName = getNPCNameFromMission(mission.mission_name);
        npc.name = npcName;
        npc.class = 'npc';  // Add class for mage penalty check (not a mage)
        
        const battle = runBattle(playerFighter, npc);
        const playerWon = battle.winnerId === freshChar.id;
        await recordMissionSpotResult(db, {
            charId: freshChar.id,
            mapType: mission.map_type || 'overworld',
            zoneId: mission.zone,
            spotId: mission.spot,
            won: playerWon,
            now
        });
        if (playerWon) {
            await recordMonsterDefeat(db, {
                charId: freshChar.id,
                source: mission.map_type === 'abyss' ? 'abyss_mission' : 'mission',
                monsterKey: npcName,
                monsterName: npcName,
                count: 1,
                now
            });
            await recordShieldlessWin(db, freshChar, equippedArray);
        }
        
        let goldEarned = playerWon ? mission.gold_reward : Math.floor(mission.gold_reward * 0.10);
let xpEarned = playerWon ? mission.xp_reward : 0;

// Add damage-based bonus
const sizeConf = MISSION_SIZES[mission.size || 'small'];
const mpMultiplier = sizeConf.mpCost / 60;
const damageDiff = Math.max(0, battle.totalDmgToB - battle.totalDmgToA);
const damageGold = Math.floor(damageDiff * mpMultiplier);

goldEarned += damageGold;

if (isEvent) {
    goldEarned *= 2;
    xpEarned *= 2;
}
if (hasPremium(activePremCollect, 'fortune_hunter')) {
    goldEarned = Math.floor(goldEarned * 1.30);
}
if (hasUlt) {
    xpEarned = Math.floor(xpEarned * 1.50);
}
        
        const gemChance = isEvent ? 0.15 : 0.05;
        let gemsFound = 0;
        if (playerWon && Math.random() < gemChance) gemsFound = 1;
        const newHp = Math.max(0, battle.hpRemainingA);
        let newXp = (freshChar.xp || 0) + xpEarned, newLevel = freshChar.level, leveledUp = false;
        while (newXp >= LEVEL_XP(newLevel)) { newXp -= LEVEL_XP(newLevel); newLevel++; leveledUp = true; }
        const newWins = freshChar.wins + (playerWon ? 1 : 0);
        const newLosses = freshChar.losses + (playerWon ? 0 : 1);
        await dbRun(db, `UPDATE characters SET xp=?,gold=gold+?,gems=gems+?,level=?,wins=?,losses=?,hp_current=?,total_gold_earned=total_gold_earned+? WHERE id=?`,
            [newXp, goldEarned, gemsFound, newLevel, newWins, newLosses, newHp, goldEarned, freshChar.id]);
        await dbRun(db, 'DELETE FROM active_missions WHERE character_id = ?', [freshChar.id]);
        
        // ── Skill tree stat tracking ───────────────────────────────────────
        if (playerWon && mission.difficulty === 'hard') {
            await dbRun(db, 'UPDATE characters SET hard_missions_completed = hard_missions_completed + 1 WHERE id=?', [freshChar.id]);
        }
        if (playerWon) {
            await dbRun(db, 'UPDATE characters SET total_missions_completed = total_missions_completed + 1 WHERE id=?', [freshChar.id]);
        }
        if (playerWon && battle.totalElemDmgDealt > 0) {
            await dbRun(db, 'UPDATE characters SET elemental_kills = elemental_kills + 1 WHERE id=?', [freshChar.id]);
        }
        
        const drops = [];
let matsByZone;
if (mission.map_type === 'abyss') {
    matsByZone = {
        shadowfen: [
            { id:'void_shard', emoji:'🔮', name:'Void Shard' },
            { id:'shadow_essence', emoji:'🌑', name:'Shadow Essence' },
            { id:'abyss_crystal', emoji:'💎', name:'Abyss Crystal' }
        ],
        crimson: [
            { id:'crimson_crystal', emoji:'🔴', name:'Crimson Crystal' },
            { id:'fire_essence', emoji:'🔥', name:'Fire Essence' },
            { id:'infernal_core', emoji:'💀', name:'Infernal Core' }
        ],
        void: [
            { id:'void_crystal', emoji:'🔮', name:'Void Crystal' },
            { id:'null_essence', emoji:'🌑', name:'Null Essence' },
            { id:'abyss_fragment', emoji:'🧩', name:'Abyss Fragment' }
        ],
        citadel: [
            { id:'shadowsteel', emoji:'⚙️', name:'Shadowsteel' },
            { id:'soul_essence', emoji:'👻', name:'Soul Essence' },
            { id:'obsidian_shard', emoji:'🪨', name:'Obsidian Shard' }
        ],
        eternal_dark: [
            { id:'dark_essence', emoji:'🌑', name:'Dark Essence' },
            { id:'primordial_shard', emoji:'✨', name:'Primordial Shard' },
            { id:'eternal_core', emoji:'💠', name:'Eternal Core' }
        ]
    };
} else {
    matsByZone = {
        forest: [
            { id:'wood', emoji:'🪵', name:'Wood' },
            { id:'wolf_pelt', emoji:'🐺', name:'Wolf Pelt' },
            { id:'herbs', emoji:'🌿', name:'Herbs' }
        ],
        swamp: [
            { id:'iron_ore', emoji:'⛏️', name:'Iron Ore' },
            { id:'poison_gland', emoji:'🐸', name:'Poison Gland' },
            { id:'swamp_crystal', emoji:'💎', name:'Swamp Crystal' }
        ],
        mountains: [
            { id:'mithril_ore', emoji:'✨', name:'Mithril Ore' },
            { id:'frost_essence', emoji:'❄️', name:'Frost Essence' },
            { id:'dragon_scale_shard', emoji:'🐉', name:'Dragon Scale Shard' }
        ],
        ruins: [
            { id:'arcane_dust', emoji:'✨', name:'Arcane Dust' },
            { id:'rune_fragment', emoji:'🔮', name:'Rune Fragment' },
            { id:'void_shard', emoji:'🌑', name:'Void Shard' }
        ],
        dark_city: [
            { id:'shadow_essence', emoji:'🌑', name:'Shadow Essence' },
            { id:'demon_core', emoji:'👹', name:'Demon Core' }
        ],
    };
}
const mats = matsByZone[mission.zone] || (mission.map_type === 'abyss' ? matsByZone.shadowfen : matsByZone.forest);
        const dropChance = playerWon ? 0.6 : 0.2;
        for (const mat of mats) {
            if (Math.random() < dropChance) {
                const qty = 1 + Math.floor(Math.random() * 3);
                const existing = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='raw_mat' AND json_extract(item_data,'$.id')=?`, [freshChar.id, mat.id]);
                if (existing) {
                    const d = JSON.parse(existing.item_data);
                    d.qty = (d.qty || 1) + qty;
                    await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), existing.id]);
                } else {
                    await dbRun(db, `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)`, [freshChar.id, 'raw_mat', JSON.stringify({ ...mat, qty })]);
                }
                drops.push({ mat: mat.id, qty });
            }
        }
        
        try {
    await dbRun(db, `INSERT INTO battles (
        attacker_id, defender_id, winner_id, attacker_name, defender_name, log, 
        fought_at, battle_type, xp_gained, gold_gained, total_dmg_dealt, total_dmg_taken
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [freshChar.id, -1, playerWon ? freshChar.id : -1, freshChar.name, mission.mission_name, 
         JSON.stringify(battle.log), now, 'mission', xpEarned, goldEarned, 
         battle.totalDmgToB, battle.totalDmgToA]);
} catch {}
        
        try {
            const subject = playerWon ? `✅ Mission Report: ${mission.mission_name}` : `💀 Mission Failed: ${mission.mission_name}`;
const payload = JSON.stringify({ 
    log: battle.log, 
    won: playerWon, 
    goldEarned, 
    xpEarned, 
    type: 'mission', 
    npcName: npcName,  // Use the extracted NPC name here
    missionName: mission.mission_name,
    totalDmgDealt: battle.totalDmgToB,
    totalDmgTaken: battle.totalDmgToA
});
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
            totalDmgDealt: battle.totalDmgToB,
            totalDmgTaken: battle.totalDmgToA,
            missionName: mission.mission_name,  // ADD MISSION NAME TO RESPONSE
        });
    } catch (e) {
        console.error('Mission collect error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/missions/active', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const mission = await dbGet(db, 'SELECT * FROM active_missions WHERE character_id = ?', [character.id]);
        res.json(mission || null);
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/battle/recover', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        if ((char.gems || 0) < 1) return res.status(400).json({ error: 'Need 1 💎 gem to recover instantly' });
        const now = Math.floor(Date.now() / 1000);
        const activePrem = getActivePremium(char);
        const pvpCd = hasPremium(activePrem, 'fortune_hunter') ? Math.floor(600 * 0.50) : 600;
        const cooldownEnds = (char.last_battle_at || 0) + pvpCd;
        if (cooldownEnds <= now) return res.status(400).json({ error: 'No active battle cooldown to clear' });
        await dbRun(db, 'UPDATE characters SET last_battle_at = 0, gems = gems - 1 WHERE id = ?', [char.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json({ success: true, message: '⚡ Battle cooldown cleared!', character: await buildCharacterResponse(updated, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Inventory ─────────────────────────────────────────────────────────────
router.get('/inventory', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });
        const items = await dbAll(db, 'SELECT * FROM inventory WHERE char_id = ? ORDER BY item_type, acquired_at DESC', [char.id]);
        const equipped = await getEquippedItems(db, char.id);
        const equippedIds = Object.values(equipped).map(e => e.inventoryId).filter(Boolean);
        res.json({ items: items.map(i => ({ ...i, item_data: JSON.parse(i.item_data), equipped: equippedIds.includes(i.id) })), equipped });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Add item (used by dungeon loot) ──────────────────────────────────
router.post('/inventory/add', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { item } = req.body || {};
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });
        if (!item || typeof item !== 'object') return res.status(400).json({ error: 'Invalid item data' });

        const slugify = (s) => String(s || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

        const qty = Math.max(1, Number(item.qty || 1));
        const dataBase = { ...item, qty };

        const isConsumable = item.type === 'consumable' || item.effect || item.consumable;
        if (isConsumable) {
            const d = { ...dataBase };
            d.id = d.id || slugify(d.name) || `consumable_${Date.now()}`;
            d.effect = d.effect || item.effect;

            const existing = await dbGet(
                db,
                `SELECT * FROM inventory WHERE char_id=? AND item_type='consumable' AND json_extract(item_data,'$.id')=?`,
                [char.id, d.id]
            );

            if (existing) {
                const merged = JSON.parse(existing.item_data);
                merged.qty = (merged.qty || 1) + qty;
                await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(merged), existing.id]);
            } else {
                await dbRun(db, `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,'consumable',?)`, [
                    char.id,
                    JSON.stringify(d)
                ]);
            }

            return res.json({ success: true });
        }

        if (item.type === 'material') {
            const d = { ...dataBase };
            d.id = d.id || slugify(d.name) || `mat_${Date.now()}`;
            d.emoji = d.emoji || d.icon;
            d.rarity = d.rarity || 'common';

            const existing = await dbGet(
                db,
                `SELECT * FROM inventory WHERE char_id=? AND item_type='raw_mat' AND json_extract(item_data,'$.id')=?`,
                [char.id, d.id]
            );

            if (existing) {
                const merged = JSON.parse(existing.item_data);
                merged.qty = (merged.qty || 1) + qty;
                await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(merged), existing.id]);
            } else {
                await dbRun(db, `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,'raw_mat',?)`, [
                    char.id,
                    JSON.stringify(d)
                ]);
            }

            return res.json({ success: true });
        }

        await dbRun(
            db,
            `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?, 'equipment', ?)`,
            [char.id, JSON.stringify(dataBase)]
        );

        return res.json({ success: true });
    } catch (e) {
        console.error('inventory/add error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Forge ─────────────────────────────────────────────────────────────────
router.get('/forge/recipes', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const completedRows = await dbAll(db, 'SELECT DISTINCT zone FROM missions WHERE char_id=? AND collected=1', [char.id]);
        const completedZones = new Set(completedRows.map(r => r.zone));
        const mats = await getInventoryMaterials(db, char.id);

        const equippedArray = await getEquippedItemsArray(db, char.id);
        const equippedRecipeIds = new Set();
        for (const row of equippedArray) {
            try {
                const d = typeof row.item_data === 'string' ? JSON.parse(row.item_data) : row.item_data;
                if (d.id) equippedRecipeIds.add(d.id);
            } catch {}
        }

        const components = Object.entries(COMPONENTS).map(([id, comp]) => {
            const canCraft = char.gold >= comp.goldCost && Object.entries(comp.recipe).every(([mat, qty]) => (mats[mat]?.qty || 0) >= qty);
            return { id, ...comp, canCraft, playerMats: mats };
        });
        const equipment = EQUIPMENT_RECIPES.map(rec => {
            const zoneUnlocked = completedZones.has(rec.requiredZone) || char.level >= (ZONES[rec.requiredZone]?.minLevel || 1);
            const canCraft = zoneUnlocked && char.gold >= rec.goldCost && Object.entries(rec.components).every(([comp, qty]) => (mats[comp]?.qty || 0) >= qty);
            const scaledPreview = scaleItemToLevel(rec, char.level);
            return {
                ...rec,
                ...scaledPreview,
                goldCost: rec.goldCost,
                zoneUnlocked,
                canCraft,
                equipped: equippedRecipeIds.has(rec.id)
            };
        });
        res.json({ components, equipment, gold: char.gold, mats, sets: CRAFTING_SETS });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/forge/refine', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
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
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { recipeId } = req.body;
        const recipe = EQUIPMENT_RECIPES.find(r => r.id === recipeId);
        if (!recipe) return res.status(400).json({ error: 'Unknown recipe' });
        
        if (char.level < (recipe.minLevel || 1)) {
            return res.status(400).json({ error: `Requires level ${recipe.minLevel} to craft this item.` });
        }
        
        if (char.gold < recipe.goldCost) return res.status(400).json({ error: `Need ${recipe.goldCost} gold` });
        
        const mats = await getInventoryMaterials(db, char.id);
        for (const [comp, qty] of Object.entries(recipe.components)) {
            if ((mats[comp]?.qty || 0) < qty) return res.status(400).json({ error: `Need ${qty}x ${COMPONENTS[comp]?.name || comp}` });
        }
        
        for (const [comp, qty] of Object.entries(recipe.components)) {
            const inv = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='component' AND json_extract(item_data,'$.id')=?`, [char.id, comp]);
            if (inv) {
                const d = JSON.parse(inv.item_data);
                d.qty = (d.qty || 1) - qty;
                if (d.qty <= 0) await dbRun(db, 'DELETE FROM inventory WHERE id=?', [inv.id]);
                else await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), inv.id]);
            }
        }
        
        await dbRun(db, 'UPDATE characters SET gold=gold-? WHERE id=?', [recipe.goldCost, char.id]);
        
        const scaledItem = scaleItemToLevel(recipe, char.level);
        scaledItem.original_price = scaledItem.price;
        
        await dbRun(db, 'INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)', 
            [char.id, 'equipment', JSON.stringify(scaledItem)]);
        
        res.json({ message: `⚒️ Crafted: ${recipe.name} (Level ${char.level})!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

function scaleItemToLevel(recipe, playerLevel) {
    const level = Math.max(recipe.minLevel || 1, playerLevel);
    const item = { ...recipe };
    
    const baseStats = { ...(recipe.baseStats || recipe.stats || {}) };
    delete item.baseStats;
    delete item.stats;
    
    item.level = level;
    item.tier = Math.min(5, Math.ceil(level / 15) + 1);
    
    const qualityScale =
        item.quality === 'legendary' ? 1.15 :
        item.quality === 'epic' ? 1.0 :
        item.quality === 'rare' ? 0.9 : 0.8;
    
    const scaledStats = {};
    for (const [stat, value] of Object.entries(baseStats)) {
        let scaledValue = value;

        if (stat === 'dmg_min') {
            scaledValue = Math.floor(value + (level * 1.0 * qualityScale));
            scaledValue = Math.min(220, scaledValue);
        } else if (stat === 'dmg_max') {
            scaledValue = Math.floor(value + (level * 2.3 * qualityScale));
            scaledValue = Math.min(380, scaledValue);
        } else if (stat === 'strength' || stat === 'agility' || stat === 'magic') {
            scaledValue = Math.floor(value + (level * 0.20 * qualityScale));
            scaledValue = Math.min(90, scaledValue);
        } else if (stat === 'vitality') {
            scaledValue = Math.floor(value + (level * 0.10 * qualityScale));
            scaledValue = Math.min(45, scaledValue);
        } else if (stat === 'defense') {
            scaledValue = Math.floor(value + (level * 0.68 * qualityScale));
            scaledValue = Math.min(140, scaledValue);
        } else if (stat === 'armor') {
            scaledValue = Math.floor(value + (level * 0.42 * qualityScale));
            scaledValue = Math.min(70, scaledValue);
        } else if (stat === 'hp_max') {
            scaledValue = Math.floor(value + (level * 2.0 * qualityScale));
            scaledValue = Math.min(480, scaledValue);
        } else if (stat === 'hit_chance' || stat === 'crit_chance') {
            scaledValue = Math.floor(value + (level * 0.15 * qualityScale));
            scaledValue = Math.min(35, scaledValue);
        } else if (stat.includes('_dmg')) {
            scaledValue = Math.floor(value + (level * 0.24 * qualityScale));
            scaledValue = Math.min(70, scaledValue);
        } else if (stat.includes('_resist')) {
            scaledValue = Math.floor(value + (level * 0.11 * qualityScale));
            const resistCap = item.setId === 'voidborn' && item.slot === 'weapon' ? 40 : 34;
            scaledValue = Math.min(resistCap, scaledValue);
        }
        
        if (scaledValue > 0) scaledStats[stat] = scaledValue;
    }
    
    item.stats = scaledStats;
    
    const levelDiff = Math.max(0, level - (recipe.minLevel || 1));
    const priceScale = 1 + (levelDiff * 0.05);
    item.price = Math.floor(recipe.goldCost * priceScale);
    item.goldCost = item.price;
    item.img = item.img || getAssetImagePath(item.name);
    
    item.desc = `${recipe.desc} (Crafted at level ${level})`;
    
    return item;
}

// ── Equipment ─────────────────────────────────────────────────────────────
router.post('/equip/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item || item.item_type !== 'equipment') return res.status(400).json({ error: 'Item not found' });
        const data = JSON.parse(item.item_data);
        if (!EQUIPMENT_SLOTS.includes(data.slot)) return res.status(400).json({ error: `Invalid slot: ${data.slot}` });
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
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });
        const slot = req.params.slot;
        if (!EQUIPMENT_SLOTS.includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
        await dbRun(db, `UPDATE equipment SET ${slot}_id=NULL WHERE char_id=?`, [char.id]);
        res.json({ message:`Unequipped ${slot}.` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Travel ────────────────────────────────────────────────────────────────
router.post('/travel/start', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { targetZone } = req.body;
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        
        const currentMap = character.current_map || 'overworld';
        let zone;
        let travelTime;
        
        // Check if target is in Abyss or Overworld
        if (currentMap === 'abyss' && ABYSS_ZONES[targetZone]) {
            zone = ABYSS_ZONES[targetZone];
        } else if (ZONES[targetZone]) {
            zone = ZONES[targetZone];
        } else {
            return res.status(400).json({ error: 'Invalid zone' });
        }
        
        if (!zone) return res.status(400).json({ error: 'Invalid zone' });
        if (character.location === targetZone) return res.status(400).json({ error: 'Already at this zone' });
        const now = Math.floor(Date.now() / 1000);
        if (character.travel_end_time > now) return res.status(400).json({ error: 'Already traveling' });
        const allowedNodes = getTravelUnlockSet(character, currentMap);
        allowedNodes.add(character.location);
        allowedNodes.add(targetZone);
        const route = getShortestTravel(currentMap, character.location, targetZone, allowedNodes);
        if (!route) return res.status(400).json({ error: 'You must unlock the connecting zones first.' });
        travelTime = route.time;
        
        const travelEnd = now + travelTime;
        await dbRun(db, 'UPDATE characters SET travel_target=?,travel_end_time=?,travel_start_time=? WHERE id=?', 
            [targetZone, travelEnd, now, character.id]);
        
        const unlocked = getTravelUnlockSet(character, currentMap).has(targetZone);
        res.json({
            success: true,
            message: unlocked ? `Traveling to ${zone.name}` : `Traveling to ${zone.name} — a gatekeeper may intercept you`,
            travelEnd,
            travelStart: now,
            duration: travelTime,
            requiresUnlockFight: !unlocked
        });
    } catch (e) { 
        console.error(e); 
        res.status(500).json({ error: e.message }); 
    }
});

router.post('/travel/cancel', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { paid } = req.body;
        const char = await getCurrentCharacter(db, req.user.userId);
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
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        
        const now = Math.floor(Date.now() / 1000);
        let currentMap = character.current_map || 'overworld';
        let encounterResult = null;
        
        // Check if travel completed
        if (character.travel_target && character.travel_end_time && character.travel_end_time <= now) {
            let targetZone = character.travel_target;
            const zoneUnlocked = getTravelUnlockSet(character, currentMap).has(targetZone);

            if (!zoneUnlocked) {
                await applyHpRegen(db, character.id);
                const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [character.id]);
                const playerFighter = await buildCombatFighter(db, freshChar);
                const guardian = buildTravelGuardian(targetZone, currentMap, freshChar.level, playerFighter);

                if (guardian) {
                    const battle = runBattle(playerFighter, guardian);
                    const playerWon = battle.winnerId === freshChar.id;
                    const newHp = Math.max(0, battle.hpRemainingA);

                    if (playerWon) {
                        await unlockTravelZone(db, freshChar, targetZone, currentMap);
                        await dbRun(db, 'UPDATE characters SET location=?, hp_current=?, travel_target=NULL, travel_end_time=0, travel_start_time=0 WHERE id=?',
                            [targetZone, newHp, freshChar.id]);
                        character.unlocked_zones = freshChar.unlocked_zones;
                        character.location = targetZone;
                    } else {
                        await dbRun(db, 'UPDATE characters SET hp_current=?, travel_target=NULL, travel_end_time=0, travel_start_time=0 WHERE id=?',
                            [newHp, freshChar.id]);
                    }

                    encounterResult = {
                        type: 'travel_guardian',
                        won: playerWon,
                        guardianName: guardian.name,
                        targetZone,
                        unlocked: playerWon,
                        log: battle.log,
                        totalDmgDealt: battle.totalDmgToB,
                        totalDmgTaken: battle.totalDmgToA,
                    };
                } else {
                    await unlockTravelZone(db, character, targetZone, currentMap);
                    await dbRun(db, 'UPDATE characters SET location=?, travel_target=NULL, travel_end_time=0, travel_start_time=0 WHERE id=?',
                        [targetZone, character.id]);
                    character.location = targetZone;
                }
            } else {
                await dbRun(db, 'UPDATE characters SET location=?, travel_target=NULL, travel_end_time=0, travel_start_time=0 WHERE id=?', 
                    [targetZone, character.id]);
                character.location = targetZone;
            }

            character.travel_target = null;
            character.travel_end_time = 0;
            character.travel_start_time = 0;
        }
        const responseCharacter = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [character.id]);
        const unlocks = parseTravelUnlocks(responseCharacter.unlocked_zones);
        const overworldUnlocked = Array.from(new Set([...(unlocks.overworld || []), 'forest', responseCharacter.current_map === 'overworld' ? responseCharacter.location : null].filter(Boolean)));
        const abyssUnlocked = Array.from(new Set([...(unlocks.abyss || []), 'shadowfen', responseCharacter.current_map === 'abyss' ? responseCharacter.location : null].filter(Boolean)));
        
        res.json({
            location: responseCharacter.location || 'forest',
            currentMap: responseCharacter.current_map || currentMap,
            travelTarget: responseCharacter.travel_target,
            travelEndTime: responseCharacter.travel_end_time || 0,
            travelStartTime: responseCharacter.travel_start_time || 0,
            traveling: !!responseCharacter.travel_target,
            timeRemaining: responseCharacter.travel_target ? Math.max(0, responseCharacter.travel_end_time - now) : 0,
            unlockedZones: overworldUnlocked,
            unlockedAbyssZones: abyssUnlocked,
            encounterResult,
            character: await buildCharacterResponse(responseCharacter, db),
        });
    } catch (e) { 
        console.error(e); 
        res.status(500).json({ error: e.message }); 
    }
});

// Helper to get zone data based on current map
function getZoneData(zoneId, currentMap = 'overworld') {
    if (currentMap === 'abyss' && ABYSS_ZONES[zoneId]) {
        return ABYSS_ZONES[zoneId];
    }
    return ZONES[zoneId];
}

// Helper to get all zones for current map
function getAllZones(currentMap = 'overworld') {
    if (currentMap === 'abyss') {
        return ABYSS_ZONES;
    }
    return ZONES;
}

// ── Sell item ─────────────────────────────────────────────────────────────
router.post('/sell/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        const eq = await dbGet(db, 'SELECT * FROM equipment WHERE char_id=?', [char.id]);
        if (eq) {
            const equippedIds = EQUIPMENT_SLOTS.map(s => eq[`${s}_id`]).filter(Boolean);
            if (equippedIds.includes(item.id)) return res.status(400).json({ error: 'Unequip the item before selling.' });
        }
        const data = JSON.parse(item.item_data);
        
        // Use original_price if available, otherwise fall back to price
        const originalPrice = data.original_price || data.price;
        
        const activePremSell = getActivePremium(char);
        const merchantPrince = hasPremium(activePremSell, 'vault_keeper') && hasPremium(activePremSell, 'apprentice');
        const sellRate = merchantPrince ? 0.40 : 0.30;
        const sellPrice = Math.max(1, Math.floor(originalPrice * sellRate));
        
        await dbRun(db, 'DELETE FROM inventory WHERE id=?', [item.id]);
        await dbRun(db, 'UPDATE characters SET gold=gold+? WHERE id=?', [sellPrice, char.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        res.json({ message: `Sold ${data.name} for ${sellPrice} gold.`, goldEarned: sellPrice, character: await buildCharacterResponse(updated, db) });
    } catch (e) { 
        console.error(e); 
        res.status(500).json({ error: e.message }); 
    }
});

// ── Use consumable ────────────────────────────────────────────────────────
router.post('/use/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item || item.item_type !== 'consumable') return res.status(400).json({ error: 'Item not found' });
        const data = JSON.parse(item.item_data);
        if (!data.effect) return res.status(400).json({ error: 'No effect' });
        
        const equippedArray = await getEquippedItemsArray(db, char.id);
        const trueHpMax = calcHpMax(char, equippedArray);
        const now = Math.floor(Date.now() / 1000);
        
        let message = '';
        let updated = false;
        const isHealthPotion = data.effect.type === 'heal' || data.effect.type === 'heal_full';
        if (isHealthPotion) {
            const lastUse = char.last_health_potion_at || 0;
            const cooldownLeft = (lastUse + HEALTH_POTION_COOLDOWN) - now;
            if (cooldownLeft > 0) {
                return res.status(400).json({ error: `Health potions are on cooldown for ${formatDurationShort(cooldownLeft)}.` });
            }
        }
        
        if (data.effect.type === 'heal') {
            const currentHp = char.hp_current ?? trueHpMax;
            const newHp = Math.min(trueHpMax, currentHp + data.effect.value);
            await dbRun(db, 'UPDATE characters SET hp_current=?, last_health_potion_at=? WHERE id=?', [newHp, now, char.id]);
            message = `Restored ${data.effect.value} HP. (${newHp}/${trueHpMax})`;
            updated = true;
        } else if (data.effect.type === 'heal_full') {
            await dbRun(db, 'UPDATE characters SET hp_current=?, last_health_potion_at=? WHERE id=?', [trueHpMax, now, char.id]);
            message = `Fully restored HP! (${trueHpMax}/${trueHpMax})`;
            updated = true;
        } else if (data.effect.type === 'temp_stat') {
            message = `+${data.effect.value} ${data.effect.stat} for session.`;
            updated = true;
        } else if (data.effect.type === 'xp') {
            let newXp = (char.xp || 0) + data.effect.value, newLevel = char.level;
            while (newXp >= LEVEL_XP(newLevel)) { newXp -= LEVEL_XP(newLevel); newLevel++; }
            await dbRun(db, 'UPDATE characters SET xp=?,level=? WHERE id=?', [newXp, newLevel, char.id]);
            message = `Gained ${data.effect.value} XP!`;
            updated = true;
        } else if (data.effect.type === 'mp') {
            const activePrem = getActivePremium(char);
            const mpMax = hasPremium(activePrem, 'arcane_reservoir') ? MP_MAX * 2 : MP_MAX;
            const currentMp = char.mission_points ?? 0;
            const newMp = Math.min(mpMax, currentMp + data.effect.value);
            await dbRun(db, 'UPDATE characters SET mission_points=? WHERE id=?', [newMp, char.id]);
            message = `Restored ${data.effect.value} MP. (${newMp}/${mpMax})`;
            updated = true;
        }
        
        if (updated) {
            const d = JSON.parse(item.item_data);
            d.qty = (d.qty || 1) - 1;
            if (d.qty <= 0) {
                await dbRun(db, 'DELETE FROM inventory WHERE id=?', [item.id]);
            } else {
                await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), item.id]);
            }
        }
        
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        res.json({ message, character: await buildCharacterResponse(updatedChar, db) });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Shop ──────────────────────────────────────────────────────────────────
function getMonthlyGemsClaimWindow(now = Math.floor(Date.now() / 1000)) {
    const nowDate = new Date(now * 1000);
    const year = nowDate.getUTCFullYear();
    const month = nowDate.getUTCMonth();
    const monthStart = Math.floor(Date.UTC(year, month, 1) / 1000);
    const nextMonthStart = Math.floor(Date.UTC(year, month + 1, 1) / 1000);
    return { monthStart, nextMonthStart };
}

function hasClaimedMonthlyGems(claimedAt, now = Math.floor(Date.now() / 1000)) {
    if (!claimedAt) return false;
    const { monthStart } = getMonthlyGemsClaimWindow(now);
    return Number(claimedAt) >= monthStart;
}

router.get('/gems/monthly-claim/status', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        const claimedAt = Number(character.last_free_gems_claim_at || 0);
        const eligible = !hasClaimedMonthlyGems(claimedAt, now);
        const { nextMonthStart } = getMonthlyGemsClaimWindow(now);
        res.json({
            amount: 500,
            eligible,
            claimedAt,
            nextClaimAt: eligible ? now : nextMonthStart
        });
    } catch (e) {
        console.error('Monthly gems status error:', e);
        res.status(500).json({ error: e.message || 'Failed to load monthly gems status' });
    }
});

router.post('/gems/monthly-claim', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });

        const now = Math.floor(Date.now() / 1000);
        const claimedAt = Number(character.last_free_gems_claim_at || 0);
        const { nextMonthStart } = getMonthlyGemsClaimWindow(now);
        if (hasClaimedMonthlyGems(claimedAt, now)) {
            return res.status(400).json({
                error: 'Free gems already claimed this month.',
                nextClaimAt: nextMonthStart
            });
        }

        await dbRun(
            db,
            'UPDATE characters SET gems = gems + 500, total_gems_earned = COALESCE(total_gems_earned, 0) + 500, last_free_gems_claim_at = ? WHERE id = ?',
            [now, character.id]
        );
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [character.id]);
        res.json({
            success: true,
            amount: 500,
            nextClaimAt: nextMonthStart,
            character: await buildCharacterResponse(updatedChar, db),
            message: 'Claimed 500 free gems for this month.'
        });
    } catch (e) {
        console.error('Monthly gems claim error:', e);
        res.status(500).json({ error: e.message || 'Failed to claim free gems' });
    }
});

router.post('/shop/buy', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { item, price, priceType } = req.body;
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'No character' });
        if (!item) return res.status(400).json({ error: 'Invalid item data' });

        const gemCost = item.gemCost || 0;

        if (priceType === 'gems') {
            if ((character.gems||0) < price) return res.status(400).json({ error: 'Not enough gems' });
        } else {
            if (character.gold < price) return res.status(400).json({ error: 'Not enough gold' });
            if (gemCost > 0 && (character.gems||0) < gemCost)
                return res.status(400).json({ error: `Not enough gems — this item also costs ${gemCost} 💎` });
        }

        if (priceType === 'gems') {
            await dbRun(db, 'UPDATE characters SET gems=gems-?,total_gems_spent=total_gems_spent+? WHERE id=?', [price, price, character.id]);
        } else {
            await dbRun(db, 'UPDATE characters SET gold=gold-? WHERE id=?', [price, character.id]);
            if (gemCost > 0) {
                await dbRun(db, 'UPDATE characters SET gems=gems-?,total_gems_spent=total_gems_spent+? WHERE id=?', [gemCost, gemCost, character.id]);
            }
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
            try { await dbRun(db, `UPDATE shop_items SET sold=1 WHERE char_id=? AND json_extract(item_data,'$.id')=?`, [character.id, item.id]); } catch {}
        }
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [character.id]);
        res.json({ success:true, newGold:updatedChar.gold, newGems:updatedChar.gems, character:updatedChar, message:`Purchased ${item.name}!` });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/shop/items', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const now = Math.floor(Date.now() / 1000);
        const charId = character.id;
        const charLastGenRow = await dbGet(db, 'SELECT MAX(generation_date) as last_date FROM shop_items WHERE char_id=?', [charId]);
        const lastDate = charLastGenRow?.last_date;
        
        const lootBoxes = LOOT_BOXES.map(box => ({
            ...box,
            alwaysAvailable: true
        }));
        
        let equipmentItems = [];
        
        if (!lastDate || shouldResetShop(lastDate)) {
            await dbRun(db, 'DELETE FROM shop_items WHERE char_id=?', [charId]);
            const newItems = generateBackendInventory(character.level);
            const equipOnly = newItems.filter(i => !i.consumable);
            for (const item of equipOnly) {
                await dbRun(db, 'INSERT INTO shop_items (user_id,char_id,item_data,generation_date) VALUES (?,?,?,?)', [req.user.userId, charId, JSON.stringify(item), now]);
            }
            equipmentItems = equipOnly;
        } else {
            const rows = await dbAll(db, 'SELECT item_data,sold FROM shop_items WHERE char_id=? ORDER BY id', [charId]);
            equipmentItems = rows.filter(r => !r.sold).map(row => JSON.parse(row.item_data));
        }
        
        const potions = getPotionsForLevel(character.level);
        
        res.json({ 
            items: [...potions, ...lootBoxes, ...equipmentItems], 
            resetTime: getNextMidnight(lastDate) 
        });
    } catch (e) { 
        console.error(e); 
        res.status(500).json({ error: e.message }); 
    }
});

function generateBackendInventory(playerLevel) {
    const inventory = [];
    const allTypes = ['weapon','armor','helmet','shield','boots','ring','amulet','accessory'];
    for (const type of allTypes) {
        for (let i = 0; i < 2; i++) {
            const item = generateBackendRandomItem(playerLevel, type);
            if (item) inventory.push(item);
        }
    }
    const typeWeights = [
        { type:'weapon',    w:0.20 },
        { type:'armor',     w:0.15 },
        { type:'helmet',    w:0.12 },
        { type:'shield',    w:0.12 },
        { type:'accessory', w:0.10 },
        { type:'amulet',    w:0.10 },
        { type:'ring',      w:0.10 },
        { type:'boots',     w:0.11 },
    ];
    const extraCount = 16 + Math.floor(Math.random() * 8);
    for (let i = 0; i < extraCount; i++) {
        const rand = Math.random();
        let cum = 0, type = 'weapon';
        for (const { type: t, w } of typeWeights) { cum += w; if (rand < cum) { type = t; break; } }
        const item = generateBackendRandomItem(playerLevel, type);
        if (item) inventory.push(item);
    }
    inventory.push(...getPotionsForLevel(playerLevel));
    for (let i = 0; i < 3; i++) {
        inventory.push({
            id:`premium_${Date.now()}_${i}`, name:['XP Booster','Gold Booster','Legendary Crate'][i],
            emoji:['⚡','💰','📦'][i], desc:'Premium item!', price:[200,200,500][i],
            priceType:'gems', level:1, category:'premium', consumable:true,
            effect:{ type:['xp_multiplier','gold_multiplier','lootbox'][i], value:2, duration:3600 }
        });
    }
    return inventory.sort(() => Math.random() - 0.5);
}
function getNextMidnight() { const next = new Date(); next.setDate(next.getDate()+1); next.setHours(0,0,0,0); return next.getTime(); }
function shouldResetShop(lastGenerationDate) {
    if (!lastGenerationDate) return true;
    const now = new Date(), lastGen = new Date(lastGenerationDate * 1000);
    return now.getDate() !== lastGen.getDate() || now.getMonth() !== lastGen.getMonth() || now.getFullYear() !== lastGen.getFullYear();
}

// ── Matchmaking ───────────────────────────────────────────────────────────
router.get('/matchmaking', auth, async (req, res) => {
    try {
        const db = await getDb();
        const me = await getCurrentCharacter(db, req.user.userId);
        if (!me) return res.status(404).json({ error: 'No character' });
        const direction = req.query.direction || 'similar';
        const now = Math.floor(Date.now() / 1000);
        const myPower = (me.strength||0) + (me.defense||0) + (me.agility||0) + (me.magic||0) + me.level * 5;

        let candidates = await dbAll(db, `
            SELECT c.*, u.username,
                   (c.strength + c.defense + c.agility + c.magic + c.level*5) as power
            FROM characters c JOIN users u ON c.user_id=u.id
            WHERE c.id != ?
              AND c.user_id != ?
              AND (c.attack_cooldown_until IS NULL OR c.attack_cooldown_until < ?)
        `, [me.id, req.user.userId, now]);

        await Promise.all(candidates.map(c => applyHpRegen(db, c.id)));

        candidates = await dbAll(db, `
            SELECT c.*, u.username,
                   (c.strength + c.defense + c.agility + c.magic + c.level*5) as power
            FROM characters c JOIN users u ON c.user_id=u.id
            WHERE c.id != ?
              AND c.user_id != ?
              AND (c.attack_cooldown_until IS NULL OR c.attack_cooldown_until < ?)
              AND (c.hp_current IS NULL OR c.hp_current >= 10)
        `, [me.id, req.user.userId, now]);

        const myCooldownRows = await dbAll(db, 'SELECT defender_user_id FROM account_attack_cooldowns WHERE attacker_user_id=? AND expires_at>?', [req.user.userId, now]);
        const myCooldowns = new Set(myCooldownRows.map(r => r.defender_user_id));
        candidates = candidates.filter(c => !myCooldowns.has(c.user_id));

        if (!candidates.length) return res.json({ active: false });
        let target;
        if (direction === 'weaker') target = candidates.filter(c => c.power < myPower).sort((a,b) => b.power - a.power)[0] || null;
        else if (direction === 'stronger') target = candidates.filter(c => c.power > myPower).sort((a,b) => a.power - b.power)[0] || null;
        else { candidates.sort((a,b) => Math.abs(a.power - myPower) - Math.abs(b.power - myPower)); target = candidates[0] || null; }
        res.json(target || null);
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Attack (UPDATED with skill tree passive bonuses) ─────────────────────
router.post('/attack/:targetId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const attacker = await getCurrentCharacter(db, req.user.userId);
        if (!attacker) return res.status(404).json({ error: 'No character' });
        const activeTraining = await dbGet(db, 'SELECT * FROM skill_training WHERE char_id = ? AND ends_at > ?', 
            [attacker.id, Math.floor(Date.now() / 1000)]);
        if (activeTraining) {
            return res.status(400).json({ error: 'Cannot attack while training skills. Complete or cancel training first.' });
        }
        const defender = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [req.params.targetId]);
        if (!defender) return res.status(404).json({ error: 'Target not found' });
        if (String(defender.user_id) === String(req.user.userId)) return res.status(400).json({ error: 'You cannot attack characters on your own account.' });
        const now = Math.floor(Date.now() / 1000);
        const atkMission = await dbGet(db, 'SELECT id FROM active_missions WHERE character_id=?', [attacker.id]);
        if (atkMission) return res.status(400).json({ error: 'Cannot attack while on a mission.' });
        if (attacker.travel_target && attacker.travel_end_time > now)
            return res.status(400).json({ error: 'Cannot attack while traveling.' });
        const pvpCooldown = eventHas('discount_duels') ? 120 : 600;
        const atkCooldown = attacker.last_battle_at || 0;
        const activePremAtk = getActivePremium(attacker);
        const effectivePvpCooldown = hasPremium(activePremAtk, 'fortune_hunter') ? Math.floor(pvpCooldown * 0.50) : pvpCooldown;
        if (atkCooldown + effectivePvpCooldown > now) {
            const secs = (atkCooldown + effectivePvpCooldown) - now;
            return res.status(400).json({ error: `Wait ${secs < 60 ? secs+'s' : Math.ceil(secs/60)+'m'} before next attack.` });
        }
        const defGlobalCooldown = defender.attack_cooldown_until || 0;
        if (defGlobalCooldown > now) {
            const mins = Math.ceil((defGlobalCooldown - now) / 60);
            return res.status(400).json({ error: `That player is in recovery. ${mins < 60 ? mins+'m' : Math.ceil(mins/60)+'h'} remaining.` });
        }
        const perTarget = await dbGet(db, 'SELECT expires_at FROM account_attack_cooldowns WHERE attacker_user_id=? AND defender_user_id=?', [req.user.userId, defender.user_id]);
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
        const premA = getActivePremium(freshA);
        const premD = getActivePremium(freshD);
        const veteranA = hasPremium(premA, 'warlord') && hasPremium(premA, 'iron_fortress');
        const veteranD = hasPremium(premD, 'warlord') && hasPremium(premD, 'iron_fortress');
        const armorA = calcArmorValue(freshA, equippedA);
        const armorD = calcArmorValue(freshD, equippedD);
        
        // ── Skill tree passive bonuses for attacker ─────────────────────────
        const learnedRowsA = await dbAll(db, 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', [freshA.id]);
        const learnedIdsA = learnedRowsA.map(r => r.skill_id);
        const skillPassivesA = computePassiveBonuses(freshA.class, learnedIdsA);
        const skillActivesA  = computeActiveCombatEffects(freshA.class, learnedIdsA);
        const skillModsA     = computeClassModifiers(freshA.class, learnedIdsA);
        
        // Rogue no-shield agility bonus for attacker
        let noShieldAgiBonusA = 0;
        if (freshA.class === 'rogue') {
            const hasShield = equippedA.some(i => {
                try { return JSON.parse(i.item_data).slot === 'shield'; } 
                catch { return false; }
            });
            if (!hasShield) noShieldAgiBonusA = 5;
        }
        
        // ── Skill tree passive bonuses for defender ─────────────────────────
        const learnedRowsD = await dbAll(db, 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', [freshD.id]);
        const learnedIdsD = learnedRowsD.map(r => r.skill_id);
        const skillPassivesD = computePassiveBonuses(freshD.class, learnedIdsD);
        const skillActivesD  = computeActiveCombatEffects(freshD.class, learnedIdsD);
        const skillModsD     = computeClassModifiers(freshD.class, learnedIdsD);
        
        // Rogue no-shield agility bonus for defender
        let noShieldAgiBonusD = 0;
        if (freshD.class === 'rogue') {
            const hasShield = equippedD.some(i => {
                try { return JSON.parse(i.item_data).slot === 'shield'; } 
                catch { return false; }
            });
            if (!hasShield) noShieldAgiBonusD = 5;
        }

        const setBonusesA = getEquippedSetBonuses(equippedA);
        const fighterA = {
            id: freshA.id, name: freshA.name, class: freshA.class,
            hp: hpA,
            dmgMin: dmgMinA + (skillPassivesA.dmg_min || 0),
            dmgMax: dmgMaxA + (skillPassivesA.dmg_max || 0),
            strength: (freshA.strength || 0) + (setBonusesA.strength || 0) + (skillPassivesA.strength || 0),
            agility: (freshA.agility || 0) + (setBonusesA.agility || 0) + (skillPassivesA.agility || 0) + noShieldAgiBonusA,
            magic: (freshA.magic || 0) + (setBonusesA.magic || 0) + (skillPassivesA.magic || 0),
            defense: (freshA.defense || 0) + (setBonusesA.defense || 0) + (skillPassivesA.defense || 0),
            hit_chance: (freshA.hit_chance || 0) + (setBonusesA.hit_chance || 0) + (skillPassivesA.hit_chance || 0) + (hasPremium(premA, 'warlord') ? (freshA.hit_chance || 0) * 0.10 : 0),
            crit_chance: (freshA.crit_chance || 0) + (setBonusesA.crit_chance || 0) + (skillPassivesA.crit_chance || 0) + (veteranA ? Math.ceil((freshA.crit_chance || 0) * 0.05) : 0),
            armor: armorA + (skillPassivesA.armor || 0) + (hasPremium(premA, 'iron_fortress') ? Math.max(1, Math.floor(armorA * 0.15)) : 0),
            agility_bonus: hasPremium(premA, 'iron_fortress') ? 0.10 : 0,
            dmg_bonus: (hasPremium(premA, 'warlord') ? 0.15 : 0) + (skillPassivesA.dmg_bonus || 0),
            elem_dmg: {
                pyro:    (calcElemDmg(equippedA || []).pyro    || 0) + (skillPassivesA.pyro_dmg    || 0),
                water:   (calcElemDmg(equippedA || []).water   || 0) + (skillPassivesA.water_dmg   || 0),
                wind:    (calcElemDmg(equippedA || []).wind    || 0) + (skillPassivesA.wind_dmg    || 0),
                electro: (calcElemDmg(equippedA || []).electro || 0) + (skillPassivesA.electro_dmg || 0),
            },
            elem_resist: {
                pyro:    (calcElemResist(freshA, equippedA || []).pyro    || 0) + (skillPassivesA.pyro_resist    || 0),
                water:   (calcElemResist(freshA, equippedA || []).water   || 0) + (skillPassivesA.water_resist   || 0),
                wind:    (calcElemResist(freshA, equippedA || []).wind    || 0) + (skillPassivesA.wind_resist    || 0),
                electro: (calcElemResist(freshA, equippedA || []).electro || 0) + (skillPassivesA.electro_resist || 0),
            },
            skillEffects: skillActivesA,
            skillMods: skillModsA,
            activeSkills: getActiveSkills(freshA),
            attackZones: JSON.parse(freshA.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones: JSON.parse(freshA.block_zones || 'null') || DEFAULT_BLOCK_ZONES,
            dualWield: freshA.class === 'rogue' && rogueHasDualWield(learnedIdsA),
        };
        
        const setBonusesD = getEquippedSetBonuses(equippedD);
        const fighterB = {
            id: freshD.id, name: freshD.name,
            hp: freshD.hp_current ?? hpMaxD,
            dmgMin: dmgMinD + (skillPassivesD.dmg_min || 0),
            dmgMax: dmgMaxD + (skillPassivesD.dmg_max || 0),
            strength: (freshD.strength || 0) + (setBonusesD.strength || 0) + (skillPassivesD.strength || 0),
            agility: (freshD.agility || 0) + (setBonusesD.agility || 0) + (skillPassivesD.agility || 0) + noShieldAgiBonusD,
            magic: (freshD.magic || 0) + (setBonusesD.magic || 0) + (skillPassivesD.magic || 0),
            defense: (freshD.defense || 0) + (setBonusesD.defense || 0) + (skillPassivesD.defense || 0),
            hit_chance: (freshD.hit_chance || 0) + (setBonusesD.hit_chance || 0) + (skillPassivesD.hit_chance || 0) + (hasPremium(premD, 'warlord') ? (freshD.hit_chance || 0) * 0.10 : 0),
            crit_chance: (freshD.crit_chance || 0) + (setBonusesD.crit_chance || 0) + (skillPassivesD.crit_chance || 0) + (veteranD ? Math.ceil((freshD.crit_chance || 0) * 0.05) : 0),
            armor: armorD + (skillPassivesD.armor || 0) + (hasPremium(premD, 'iron_fortress') ? Math.max(1, Math.floor(armorD * 0.01)) : 0),
            agility_bonus: hasPremium(premD, 'iron_fortress') ? 0.10 : 0,
            dmg_bonus: (hasPremium(premD, 'warlord') ? 0.15 : 0) + (skillPassivesD.dmg_bonus || 0),
            elem_dmg: {
                pyro:    (calcElemDmg(equippedD || []).pyro    || 0) + (skillPassivesD.pyro_dmg    || 0),
                water:   (calcElemDmg(equippedD || []).water   || 0) + (skillPassivesD.water_dmg   || 0),
                wind:    (calcElemDmg(equippedD || []).wind    || 0) + (skillPassivesD.wind_dmg    || 0),
                electro: (calcElemDmg(equippedD || []).electro || 0) + (skillPassivesD.electro_dmg || 0),
            },
            elem_resist: {
                pyro:    (calcElemResist(freshD, equippedD || []).pyro    || 0) + (skillPassivesD.pyro_resist    || 0),
                water:   (calcElemResist(freshD, equippedD || []).water   || 0) + (skillPassivesD.water_resist   || 0),
                wind:    (calcElemResist(freshD, equippedD || []).wind    || 0) + (skillPassivesD.wind_resist    || 0),
                electro: (calcElemResist(freshD, equippedD || []).electro || 0) + (skillPassivesD.electro_resist || 0),
            },
            skillEffects: skillActivesD,
            skillMods: skillModsD,
            activeSkills: getActiveSkills(freshD),
            attackZones: JSON.parse(freshD.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones: JSON.parse(freshD.block_zones || 'null') || DEFAULT_BLOCK_ZONES,
            dualWield: freshD.class === 'rogue' && rogueHasDualWield(learnedIdsD),
        };
        
        const battle = runBattle(fighterA, fighterB);
        const attackerWon = battle.winnerId === freshA.id;
        
        if (attackerWon) {
            await recordShieldlessWin(db, freshA, equippedA);
        } else {
            await recordShieldlessWin(db, freshD, equippedD);
        }
        
        function calculateBattleXP(winnerLevel, loserLevel) {
            const d = loserLevel - winnerLevel;
            if (d <= -5) return -3; if (d <= -3) return -2; if (d <= -2) return -1;
            if (d <= -1) return 0; if (d <= 0) return 1; if (d <= 1) return 1;
            if (d <= 2) return 2; return 3;
        }
        const xpGained = attackerWon ? calculateBattleXP(freshA.level, freshD.level) : 0;
        const atkGoldStake = Math.floor((freshA.gold || 0) * 0.10);
        const defStakeRate = hasPremium(premD, 'vault_keeper') ? 0.05 : 0.10;
        const defGoldStake = Math.floor((freshD.gold || 0) * defStakeRate);
        const goldGained   = attackerWon ? defGoldStake  : -atkGoldStake;
        const defGoldChange = attackerWon ? -defGoldStake : atkGoldStake;

        const pvpCooldownA = hasPremium(premA, 'fortune_hunter') ? Math.floor(pvpCooldown * 0.50) : pvpCooldown;
        const newHpA = Math.max(0, battle.hpRemainingA);
        const newHpD = Math.max(0, battle.hpRemainingB);
        let atkXp = Math.max(0, (freshA.xp || 0) + xpGained), atkLevel = freshA.level, leveledUp = false;
        while (atkXp >= LEVEL_XP(atkLevel)) { atkXp -= LEVEL_XP(atkLevel); atkLevel++; leveledUp = true; }
        await ensureWeeklyTaskState(db, freshA);
        await ensureWeeklyTaskState(db, freshD);
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
        try {
            await dbRun(
                db,
                'INSERT OR REPLACE INTO account_attack_cooldowns (attacker_user_id,defender_user_id,expires_at) VALUES (?,?,?)',
                [req.user.userId, freshD.user_id, now + 43200]
            );
        } catch {}
        await dbRun(db, 'UPDATE characters SET attack_cooldown_until=? WHERE id=?', [now + 3600, freshD.id]);
        try {
            const defSubject = attackerWon ? `⚔️ ${freshA.name} attacked and defeated you! (-${defGoldStake} gold)` : `🛡️ You defended against ${freshA.name} and won! (+${atkGoldStake} gold)`;
            const defPayload = JSON.stringify({
                log: battle.log,
                won: !attackerWon,
                goldEarned: defGoldChange>0?defGoldChange:0,
                goldLost: defGoldChange<0?-defGoldChange:0,
                xpEarned:0,
                type:'pvp',
                opponentName:freshA.name,
                opponentClass:freshA.class,
                totalDmgDealt:battle.totalDmgToA,
                totalDmgTaken:battle.totalDmgToB
            });
            await dbRun(db, 'INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)', [freshA.id, freshD.id, defSubject, `BATTLE_REPORT:${defPayload}`]);
        } catch (e) { console.error('Failed to send defender report:', e); }
        try {
            const atkSubject = attackerWon ? `⚔️ You defeated ${freshD.name}! (+${defGoldStake} gold)` : `💀 You lost to ${freshD.name}. (-${atkGoldStake} gold)`;
            const atkPayload = JSON.stringify({
                log: battle.log,
                won: attackerWon,
                goldEarned: goldGained>0?goldGained:0,
                goldLost: goldGained<0?-goldGained:0,
                xpEarned:xpGained,
                type:'pvp',
                opponentName:freshD.name,
                opponentClass:freshD.class,
                totalDmgDealt:battle.totalDmgToB,
                totalDmgTaken:battle.totalDmgToA
            });
            await dbRun(db, 'INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)', [freshA.id, freshA.id, atkSubject, `BATTLE_REPORT:${atkPayload}`]);
        } catch (e) { console.error('Failed to send attacker report:', e); }
        const updatedAttacker = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [freshA.id]);
        res.json({ 
            won: attackerWon, log: battle.log, xpGained, 
            goldGained: goldGained>0?goldGained:0, goldLost: goldGained<0?-goldGained:0, 
            leveledUp, character: await buildCharacterResponse(updatedAttacker, db),
            totalDmgDealt: battle.totalDmgToB,
            totalDmgTaken: battle.totalDmgToA,
        });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Leaderboard ───────────────────────────────────────────────────────────
router.get('/leaderboard', auth, async (req, res) => {
    try {
        const db = await getDb();
        const allowedSorts = ['wins','losses','gold','level','total_gold_earned'];
        const sort = allowedSorts.includes(req.query.sort) ? req.query.sort : 'total_gold_earned';
        const players = await dbAll(db, `SELECT c.id,c.name,c.class,c.level,c.xp,c.total_gold_earned,c.strength,c.defense,c.agility,c.magic,c.wins,c.losses,
            (SELECT COUNT(*) FROM character_achievements ca WHERE ca.char_id = c.id) AS achievements_completed
            FROM characters c ORDER BY c.${sort} DESC,c.level DESC LIMIT 2000`, []);
        res.json(players.map((p,i) => ({ ...p, rank:i+1 })));
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Player profile ────────────────────────────────────────────────────────
router.get('/player/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        const me = await getCurrentCharacter(db, req.user.userId, 'id');

        await applyHpRegen(db, req.params.id);

        const player = await dbGet(db, 'SELECT c.* FROM characters c WHERE c.id=?', [req.params.id]);
        if (!player) return res.status(404).json({ error: 'Not found' });

        const now = Math.floor(Date.now() / 1000);
        const globalCooldown = (player.attack_cooldown_until || 0) > now ? player.attack_cooldown_until - now : 0;
        let perTargetCooldown = 0;
        if (me) {
            try {
                const cd = await dbGet(db, 'SELECT expires_at FROM account_attack_cooldowns WHERE attacker_user_id=? AND defender_user_id=?', [req.user.userId, player.user_id]);
                if (cd && cd.expires_at > now) perTargetCooldown = cd.expires_at - now;
            } catch {}
        }
        const equippedArray = await getEquippedItemsArray(db, player.id);
        const hpMax = calcHpMax(player, equippedArray);

        const hpLow = (player.hp_current ?? hpMax) < 10;

        const equipped = await getEquippedItems(db, player.id);
        const achievementCountRow = await dbGet(db, 'SELECT COUNT(*) AS count FROM character_achievements WHERE char_id = ?', [player.id]);
        const battles = await dbAll(db, `SELECT b.*,a.name as attacker_name,d.name as defender_name,w.name as winner_name
            FROM battles b JOIN characters a ON b.attacker_id=a.id JOIN characters d ON b.defender_id=d.id JOIN characters w ON b.winner_id=w.id
            WHERE b.attacker_id=? OR b.defender_id=? ORDER BY b.fought_at DESC LIMIT 5`, [player.id, player.id]);
        res.json({
            id:player.id, user_id: player.user_id, name:player.name, class:player.class, level:player.level,
            strength:player.strength, defense:player.defense, agility:player.agility,
            magic:player.magic, vitality:player.vitality||10,
            hit_chance:player.hit_chance||0, crit_chance:player.crit_chance||0,
            hp_max:hpMax,
            hp_current: player.hp_current ?? hpMax,
            wins:player.wins, losses:player.losses,
            dungeon_highest_floor: player.dungeon_highest_floor || 0,
            achievements_completed: achievementCountRow?.count || 0,
            gold:player.gold, total_gold_earned:player.total_gold_earned, total_gold_lost:player.total_gold_lost,
            globalCooldown, perTargetCooldown, hpLow, equipped,
            recentBattles: battles.map(b => ({ ...b, log: JSON.parse(b.log) })),
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Battle history ────────────────────────────────────────────────────────
router.get('/battles', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });
        const battles = await dbAll(db, `SELECT b.*,a.name as attacker_name,a.class as attacker_class,d.name as defender_name,d.class as defender_class,w.name as winner_name
            FROM battles b JOIN characters a ON b.attacker_id=a.id JOIN characters d ON b.defender_id=d.id JOIN characters w ON b.winner_id=w.id
            WHERE b.attacker_id=? OR b.defender_id=? ORDER BY b.fought_at DESC LIMIT 10`, [char.id, char.id]);
        res.json(battles.map(b => ({ ...b, log: JSON.parse(b.log) })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Messages ──────────────────────────────────────────────────────────────
router.get('/messages', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
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
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.json({ count:0 });
        const row = await dbGet(db, 'SELECT COUNT(*) as count FROM messages WHERE receiver_id=? AND read=0', [char.id]);
        res.json({ count: row?.count || 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/messages/send', auth, async (req, res) => {
    try {
        const db = await getDb();
        const sender = await getCurrentCharacter(db, req.user.userId, 'id');
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
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ ok: false });
        await dbRun(db, 'UPDATE messages SET read=1 WHERE id=? AND receiver_id=?', [req.params.id, char.id]);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/messages/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ ok: false });
        await dbRun(db, 'DELETE FROM messages WHERE id=? AND receiver_id=?', [req.params.id, char.id]);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dungeon endpoints (unchanged, keep as is) ─────────────────────────────
router.get('/dungeon/data', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    
    const tokens = char.dungeon_tokens || 0;
    const floor = char.dungeon_floor || 1;
    const highestFloor = char.dungeon_highest_floor || 1;
    let progress = null;
    
    if (char.dungeon_progress) {
      try {
        progress = JSON.parse(char.dungeon_progress);
      } catch(e) {}
    }
    
    res.json({
      success: true,
      tokens,
      floor,
      highestFloor,
      progress
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/tokens', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { tokens } = req.body;
    const char = await getCurrentCharacter(db, req.user.userId, 'id');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    await dbRun(db, 'UPDATE characters SET dungeon_tokens = ? WHERE id = ?', [tokens, char.id]);
    res.json({ success: true, tokens });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/progress', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { floor, highestFloor, progress, activeDungeon, combat } = req.body;
    const char = await getCurrentCharacter(db, req.user.userId, 'id');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    
    const progressData = {
      activeDungeon: activeDungeon || null,
      floor: floor || 1,
      rooms: progress?.rooms || [],
      playerPos: progress?.playerPos || 0,
      exploredRooms: progress?.exploredRooms || [],
      combat: combat || null
    };
    
    await dbRun(db, `UPDATE characters SET 
      dungeon_floor = ?,
      dungeon_highest_floor = ?,
      dungeon_progress = ?
      WHERE id = ?`,
      [floor, highestFloor, JSON.stringify(progressData), char.id]
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/mp-spent', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { mpSpent } = req.body;
    const tokensEarned = Math.floor(mpSpent / 20);
    
    if (tokensEarned > 0) {
      const char = await getCurrentCharacter(db, req.user.userId, 'id, dungeon_tokens');
      if (!char) return res.status(404).json({ error: 'Character not found' });
      const result = await dbRun(db, `
        UPDATE characters 
        SET dungeon_tokens = dungeon_tokens + ?
        WHERE id = ?
        RETURNING dungeon_tokens
      `, [tokensEarned, char.id]);
      
      const updatedChar = await getCurrentCharacter(db, req.user.userId, 'dungeon_tokens');
      res.json({ success: true, tokensEarned, totalTokens: updatedChar.dungeon_tokens });
    } else {
      res.json({ success: true, tokensEarned: 0, totalTokens: null });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/add-gold', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { amount } = req.body;
    const char = await getCurrentCharacter(db, req.user.userId, 'id');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    await dbRun(db, 'UPDATE characters SET dungeon_gold = dungeon_gold + ? WHERE id = ?', 
      [amount, char.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/update-health', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { hp } = req.body;
    const char = await getCurrentCharacter(db, req.user.userId, 'id');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    await dbRun(db, 'UPDATE characters SET hp_current = ? WHERE id = ?', [hp, char.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/monster-defeated', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId, 'id');
    if (!char) return res.status(404).json({ error: 'Character not found' });

    const monsters = Array.isArray(req.body?.monsters) ? req.body.monsters : [];
    const now = Math.floor(Date.now() / 1000);
    for (const monster of monsters) {
      const count = Math.max(1, Number(monster?.count) || 1);
      const monsterKey = normalizeMonsterKey(monster?.id || monster?.name);
      const monsterName = String(monster?.name || monster?.id || 'Unknown Monster');
      await recordMonsterDefeat(db, {
        charId: char.id,
        source: 'dungeon',
        monsterKey,
        monsterName,
        count,
        now
      });
    }

    const bounty = await ensureActiveGuildBounty(db, char.id);
    res.json({ success: true, bounty });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/boss-defeated', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { loot, newFloor, highestFloor, bossName, bossId } = req.body || {};

    const char = await getCurrentCharacter(db, req.user.userId);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const now = Math.floor(Date.now() / 1000);
    await recordMonsterDefeat(db, {
      charId: char.id,
      source: 'dungeon_boss',
      monsterKey: bossId || bossName || `floor_${newFloor || char.dungeon_floor || 1}_boss`,
      monsterName: bossName || `Floor ${newFloor || char.dungeon_floor || 1} Boss`,
      count: 1,
      now
    });

    let message = '';
    
    if (loot && typeof loot === 'object') {
      if (loot.gold) {
        await dbRun(db, 'UPDATE characters SET gold = gold + ? WHERE id = ?', 
          [loot.gold, char.id]);
        message += `💰 +${loot.gold} gold! `;
      }
      
      if (loot.gems) {
        const cappedGems = Math.min(15, loot.gems);
        await dbRun(db, 'UPDATE characters SET gems = gems + ? WHERE id = ?', 
          [cappedGems, char.id]);
        message += `💎 +${cappedGems} gems! `;
      }
      
      if (loot.premium) {
        const now = Math.floor(Date.now() / 1000);
        let activePrem = {};
        
        try {
          if (char.premium_features) {
            activePrem = JSON.parse(char.premium_features);
          }
        } catch {}
        
        const currentExpiry = activePrem[loot.premium.id] || 0;
        const newExpiry = Math.max(currentExpiry, now) + (loot.premium.days * 24 * 3600);
        activePrem[loot.premium.id] = newExpiry;
        
        await dbRun(db, 'UPDATE characters SET premium_features = ? WHERE id = ?', 
          [JSON.stringify(activePrem), char.id]);
        
        message += `✨ ${loot.premium.emoji} ${loot.premium.name} activated for ${loot.premium.days} days! `;
      }
    }

    if (newFloor) {
      const hf = highestFloor || newFloor;
      await dbRun(
        db,
        'UPDATE characters SET dungeon_floor = ?, dungeon_highest_floor = ? WHERE id = ?',
        [newFloor, hf, char.id]
      );
    }
    
    if (loot?.premium) {
      try {
        const subject = `🎉 Dungeon Boss Defeated - Premium Reward!`;
        const body = `You defeated the boss on floor ${newFloor} and received ${loot.premium.emoji} ${loot.premium.name} for ${loot.premium.days} days! Check the Premium tab to see your new feature.\n\n${loot.premium.desc}`;
        await dbRun(db, 'INSERT INTO messages (sender_id, receiver_id, subject, body) VALUES (?, ?, ?, ?)',
          [char.id, char.id, subject, body]);
      } catch (e) { console.error('Failed to send premium notification:', e); }
    }

    const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
    
    res.json({ 
      success: true, 
      message: message.trim(),
      character: await buildCharacterResponse(updatedChar, db)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/dungeon/gold', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId, 'dungeon_gold');
    res.json({ success: true, dungeonGold: char?.dungeon_gold || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/dungeon/guild', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId, 'id, dungeon_gold, guild_reputation');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const bounty = await ensureActiveGuildBounty(db, char.id);
    res.json({ 
      success: true, 
      dungeonGold: char?.dungeon_gold || 0,
      guildReputation: char?.guild_reputation || 0,
      bounty
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/exchange', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { exchangeId } = req.body;
    const exchange = GUILD_EXCHANGES.find(e => e.id === exchangeId);
    if (!exchange) return res.status(400).json({ error: 'Invalid exchange' });
    
    const char = await getCurrentCharacter(db, req.user.userId, 'id, dungeon_gold, guild_reputation');
    
    if (exchange.cost.dungeonGold && (char.dungeon_gold || 0) < exchange.cost.dungeonGold) {
      return res.status(400).json({ error: `Need ${exchange.cost.dungeonGold} dungeon gold` });
    }
    
    if (exchange.cost.dungeonGold) {
      await dbRun(db, 'UPDATE characters SET dungeon_gold = dungeon_gold - ? WHERE id = ?', 
        [exchange.cost.dungeonGold, char.id]);
    }
    
    if (exchange.reward.gold) {
      await dbRun(db, 'UPDATE characters SET gold = gold + ? WHERE id = ?', 
        [exchange.reward.gold, char.id]);
    }
    
    if (exchange.reward.reputation) {
      await dbRun(db, 'UPDATE characters SET guild_reputation = guild_reputation + ? WHERE id = ?', 
        [exchange.reward.reputation, char.id]);
    }
    
    if (exchange.reward.item) {
      const item = { 
        name: exchange.reward.item, 
        type: 'chest', 
        quality: exchange.id.includes('legendary') ? 'legendary' : 'rare',
        qty: 1 
      };
      await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?, ?, ?)',
        [char.id, 'consumable', JSON.stringify(item)]);
    }
    
    const updated = await getCurrentCharacter(db, req.user.userId, 'dungeon_gold, guild_reputation');
    
    res.json({ 
      success: true, 
      message: `Exchanged for ${exchange.reward.gold ? exchange.reward.gold + ' gold' : ''}${exchange.reward.reputation ? ' + ' + exchange.reward.reputation + ' reputation' : ''}!`,
      dungeonGold: updated.dungeon_gold,
      guildReputation: updated.guild_reputation
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/bounty/claim', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId, 'id, guild_reputation, gold');
    if (!char) return res.status(404).json({ error: 'Character not found' });

    const bounty = await ensureActiveGuildBounty(db, char.id);
    if (!bounty) return res.status(404).json({ error: 'No active bounty found' });
    if ((bounty.progress || 0) < (bounty.target_count || 0)) {
      return res.status(400).json({ error: `Bounty incomplete: ${bounty.progress || 0}/${bounty.target_count || 0}` });
    }
    if (bounty.claimed_at) {
      return res.status(400).json({ error: 'This bounty was already claimed' });
    }

    const now = Math.floor(Date.now() / 1000);
    await dbRun(
      db,
      'UPDATE characters SET gold = gold + ?, guild_reputation = guild_reputation + ? WHERE id = ?',
      [bounty.reward_gold || 0, bounty.reward_reputation || 0, char.id]
    );
    await dbRun(db, 'UPDATE character_guild_bounties SET claimed_at = ? WHERE char_id = ?', [now, char.id]);
    const nextBounty = await ensureActiveGuildBounty(db, char.id);
    const updated = await getCurrentCharacter(db, req.user.userId, 'gold, guild_reputation');

    res.json({
      success: true,
      message: `Bounty complete! +${bounty.reward_gold || 0} gold and +${bounty.reward_reputation || 0} reputation.`,
      gold: updated?.gold || 0,
      guildReputation: updated?.guild_reputation || 0,
      bounty: nextBounty
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Class Skills (the old 5h skills, keep as is) ─────────────────────────
router.post('/skills/activate', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
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

// ── Global event status ───────────────────────────────────────────────────
router.get('/events/active', auth, async (req, res) => {
    try {
        const ev = getActiveEvent();
        if (!ev) return res.json({ active: false });
        const def = GLOBAL_EVENTS.find(e => e.key === ev.event_key);
        res.json({ ...def, ends_at: ev.ends_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Premium Features ──────────────────────────────────────────────────────
router.get('/premium/features', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const active = getActivePremium(char);
        const synergies = getActiveSynergies(active);
        const ultimate = hasUltimate(active);
        const now = Math.floor(Date.now() / 1000);
        res.json({
            features: Object.values(PREMIUM_FEATURES).map(f => ({
                ...f,
                active: !!active[f.id],
                expiresAt: active[f.id] || 0,
                expiresIn: active[f.id] ? Math.max(0, active[f.id] - now) : 0,
            })),
            synergies,
            ultimate,
            gems: char.gems || 0,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/premium/activate', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const { featureId } = req.body;
        const feature = PREMIUM_FEATURES[featureId];
        if (!feature) return res.status(400).json({ error: 'Unknown feature' });
        if ((char.gems || 0) < feature.cost) return res.status(400).json({ error: `Need ${feature.cost} 💎 gems` });
        const now = Math.floor(Date.now() / 1000);
        const current = getActivePremium(char);
        const base = (current[featureId] && current[featureId] > now) ? current[featureId] : now;
        current[featureId] = base + PREMIUM_DURATION;
        await dbRun(db, 'UPDATE characters SET premium_features=?, gems=gems-? WHERE id=?',
            [JSON.stringify(current), feature.cost, char.id]);
        const updated = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        res.json({ message: `${feature.emoji} ${feature.name} activated for 30 days!`, character: await buildCharacterResponse(updated, db) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Shop reroll ────────────────────────────────────────────────────────────
router.post('/shop/reroll', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        if ((char.gems || 0) < 1) return res.status(400).json({ error: 'Need 1 💎 gem to reroll the shop' });
        await dbRun(db, 'UPDATE characters SET gems=gems-1 WHERE id=?', [char.id]);
        await dbRun(db, 'DELETE FROM shop_items WHERE char_id=?', [char.id]);
        const now = Math.floor(Date.now() / 1000);
        const newItems = generateBackendInventory(char.level);
        const equipOnly = newItems.filter(i => !i.consumable);
        for (const item of equipOnly) {
            await dbRun(db, 'INSERT INTO shop_items (user_id,char_id,item_data,generation_date) VALUES (?,?,?,?)',
                [req.user.userId, char.id, JSON.stringify(item), now]);
        }
        const potions = getPotionsForLevel(char.level);
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        res.json({
            items: [...potions, ...equipOnly],
            newGems: updatedChar.gems,
            message: '🎲 Shop rerolled!',
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const fs = require('fs');
const path = require('path');

// ── Bug Report to Database with Images ────────────────────────────────────
router.post('/bug-report', async (req, res) => {
    try {
        const db = await getDb();
        const report = req.body;
        const timestamp = new Date().toISOString();
        if (!report?.report?.category || !report?.report?.title || !report?.report?.description) {
            return res.status(400).json({ success: false, error: 'Missing required bug report fields' });
        }
        
        const result = await dbRun(db, `
            INSERT INTO bug_reports (
                report_timestamp, username, character_name, character_level, character_class,
                category, title, description, steps_to_reproduce, browser,
                game_location, game_hp, game_gold, game_level,
                has_screenshot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            timestamp,
            report.user?.username || 'guest',
            report.user?.character_name || 'unknown',
            report.user?.character_level || 0,
            report.user?.character_class || 'unknown',
            report.report.category, report.report.title, report.report.description, 
            report.report.steps_to_reproduce || null, report.report.browser || null,
            report.game_state?.location || 'unknown',
            report.game_state?.hp || 0,
            report.game_state?.gold || 0,
            report.game_state?.level || 0,
            report.screenshot ? 1 : 0
        ]);
        
        const bugReportId = result.lastInsertRowid;
        
        if (report.screenshot) {
            const mimeMatch = report.screenshot.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
            const base64Data = report.screenshot.split(',')[1];
            if (!base64Data) {
                return res.status(400).json({ success: false, error: 'Invalid screenshot payload' });
            }
            const mimeType = mimeMatch ? `image/${mimeMatch[1]}` : 'image/png';
            const ext = (mimeMatch?.[1] || 'png').replace(/[^a-zA-Z0-9]/g, '');
            const screenshotBuffer = Buffer.from(base64Data, 'base64');
            const filename = `bug_${bugReportId}.${ext}`;
            
            await dbRun(db, `
                INSERT INTO bug_screenshots (bug_report_id, filename, image_data, mime_type)
                VALUES (?, ?, ?, ?)
            `, [bugReportId, filename, screenshotBuffer, mimeType]);
        }
        
        console.log(`Bug report #${bugReportId} saved from ${report.user?.username || 'guest'}`);
        
        res.json({ 
            success: true, 
            id: bugReportId,
            message: 'Report submitted successfully!'
        });
    } catch (error) {
        console.error('Bug report error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/bug-report/screenshot/:bugReportId', async (req, res) => {
    try {
        const db = await getDb();
        const screenshot = await dbGet(db, `
            SELECT image_data, mime_type FROM bug_screenshots WHERE bug_report_id = ?
        `, [req.params.bugReportId]);
        
        if (screenshot && screenshot.image_data) {
            res.setHeader('Content-Type', screenshot.mime_type);
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(Buffer.from(screenshot.image_data));
        } else {
            res.status(404).send('Screenshot not found');
        }
    } catch (error) {
        console.error('Error loading screenshot:', error);
        res.status(500).send('Error loading screenshot');
    }
});

router.get('/bug-reports/list', async (req, res) => {
    try {
        const db = await getDb();
        
        const password = req.query.password;
        if (password !== 'baisbetterthanbk') {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Bug Reports - Login</title>
                    <style>
                        body { background: #1a1a2e; color: #eee; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: monospace; }
                        .login-box { background: #16213e; padding: 30px; border-radius: 10px; border: 1px solid #9b59b6; }
                        input, button { padding: 10px; margin: 10px 0; background: #0f0f1a; border: 1px solid #333; color: #eee; border-radius: 5px; }
                        button { background: #9b59b6; cursor: pointer; }
                    </style>
                </head>
                <body>
                    <div class="login-box">
                        <h2>🔒 Bug Reports Access</h2>
                        <form method="GET">
                            <input type="password" name="password" placeholder="Enter password" style="width: 100%">
                            <button type="submit">View Reports</button>
                        </form>
                    </div>
                </body>
                </html>
            `);
        }
        
        const reports = await dbAll(db, `
            SELECT id, report_timestamp as timestamp, username, character_name, character_level, 
                   character_class, category, title, description, steps_to_reproduce, browser,
                   game_location, game_hp, game_gold, game_level, has_screenshot
            FROM bug_reports 
            ORDER BY id DESC 
            LIMIT 200
        `, []);
        
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bug Reports - Admin</title>
                <meta charset="UTF-8">
                <style>
                    * { box-sizing: border-box; }
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; 
                        background: #0a0a0f; 
                        color: #e2e8f0; 
                        padding: 20px; 
                        margin: 0;
                    }
                    .container { max-width: 1200px; margin: 0 auto; }
                    h1 { color: #f1c40f; border-bottom: 2px solid #9b59b6; padding-bottom: 10px; display: inline-block; }
                    .stats { background: #16213e; padding: 15px; border-radius: 8px; margin: 20px 0; display: flex; gap: 20px; }
                    .stat { flex: 1; text-align: center; }
                    .stat-number { font-size: 28px; font-weight: bold; color: #9b59b6; }
                    .stat-label { font-size: 12px; color: #94a3b8; }
                    .report { 
                        border: 1px solid #2d2d3a; 
                        margin: 20px 0; 
                        padding: 20px; 
                        border-radius: 12px; 
                        background: #16213e;
                        transition: transform 0.2s;
                    }
                    .report:hover { transform: translateX(5px); border-color: #9b59b6; }
                    .header { 
                        color: #f1c40f; 
                        font-size: 14px; 
                        margin-bottom: 15px; 
                        border-bottom: 1px solid #2d2d3a; 
                        padding-bottom: 8px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .report-id { font-size: 18px; font-weight: bold; color: #9b59b6; }
                    .timestamp { color: #64748b; font-size: 12px; }
                    .field { margin: 12px 0; }
                    .label { 
                        color: #9b59b6; 
                        font-weight: bold; 
                        display: inline-block; 
                        min-width: 130px;
                        font-size: 13px;
                    }
                    .value { color: #e2e8f0; word-break: break-word; }
                    pre { 
                        background: #0f0f1a; 
                        padding: 12px; 
                        border-radius: 8px; 
                        overflow-x: auto; 
                        white-space: pre-wrap;
                        font-family: monospace;
                        font-size: 13px;
                        margin: 5px 0;
                        border-left: 3px solid #9b59b6;
                    }
                    .screenshot-link {
                        display: inline-block;
                        background: #9b59b6;
                        color: white;
                        padding: 8px 16px;
                        border-radius: 6px;
                        text-decoration: none;
                        font-size: 13px;
                        margin-top: 10px;
                        transition: background 0.2s;
                    }
                    .screenshot-link:hover { background: #8e44ad; }
                    .badge {
                        display: inline-block;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: bold;
                        margin-left: 10px;
                    }
                    .badge-bug { background: #e74c3c; color: white; }
                    .badge-ui { background: #3498db; color: white; }
                    .badge-mission { background: #2ecc71; color: white; }
                    .badge-dungeon { background: #9b59b6; color: white; }
                    .badge-other { background: #95a5a6; color: white; }
                    .game-state {
                        background: #0f0f1a;
                        padding: 10px;
                        border-radius: 6px;
                        margin-top: 10px;
                        font-family: monospace;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🐛 Bug Reports</h1>
                    <div class="stats">
                        <div class="stat">
                            <div class="stat-number">${reports.length}</div>
                            <div class="stat-label">Total Reports</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${reports.filter(r => r.has_screenshot).length}</div>
                            <div class="stat-label">With Screenshots</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${new Set(reports.map(r => r.username)).size}</div>
                            <div class="stat-label">Unique Reporters</div>
                        </div>
                    </div>
        `;
        
        for (const r of reports) {
            const categoryBadge = {
                combat: 'badge-bug',
                ui: 'badge-ui',
                mission: 'badge-mission',
                dungeon: 'badge-dungeon',
                other: 'badge-other'
            }[r.category] || 'badge-other';
            
            html += `
                <div class="report">
                    <div class="header">
                        <div>
                            <span class="report-id">#${r.id}</span>
                            <span class="badge ${categoryBadge}">${r.category}</span>
                        </div>
                        <div class="timestamp">${new Date(r.timestamp).toLocaleString()}</div>
                    </div>
                    
                    <div class="field">
                        <span class="label">👤 From:</span>
                        <span class="value">${escapeHtml(r.username || 'guest')} (${r.character_name}, Lv.${r.character_level} ${r.character_class})</span>
                    </div>
                    
                    <div class="field">
                        <span class="label">📝 Title:</span>
                        <span class="value"><strong>${escapeHtml(r.title)}</strong></span>
                    </div>
                    
                    <div class="field">
                        <span class="label">📄 Description:</span>
                        <pre>${escapeHtml(r.description)}</pre>
                    </div>
                    
                    ${r.steps_to_reproduce ? `
                    <div class="field">
                        <span class="label">🔁 Steps to Reproduce:</span>
                        <pre>${escapeHtml(r.steps_to_reproduce)}</pre>
                    </div>
                    ` : ''}
                    
                    <div class="field">
                        <span class="label">🎮 Game State:</span>
                        <div class="game-state">
                            Location: ${r.game_location || 'unknown'} | 
                            HP: ${r.game_hp} | 
                            Gold: ${r.game_gold} | 
                            Level: ${r.game_level}
                        </div>
                    </div>
                    
                    ${r.browser ? `
                    <div class="field">
                        <span class="label">🌐 Browser:</span>
                        <span class="value">${escapeHtml(r.browser)}</span>
                    </div>
                    ` : ''}
                    
                    ${r.has_screenshot ? `
                    <div class="field">
                        <a class="screenshot-link" href="/api/game/bug-report/screenshot/${r.id}" target="_blank">
                            📸 View Screenshot
                        </a>
                    </div>
                    ` : ''}
                </div>
            `;
        }
        
        html += `
                </div>
            </body>
            </html>
        `;
        
        res.send(html);
    } catch (error) {
        console.error('Error loading reports:', error);
        res.status(500).send('Error: ' + error.message);
    }
});

router.get('/bug-report/screenshot/:reportId', async (req, res) => {
    try {
        const db = await getDb();
        const screenshot = await dbGet(db, `
            SELECT image_data, mime_type FROM bug_screenshots WHERE report_id = ?
        `, [req.params.reportId]);
        
        if (screenshot && screenshot.image_data) {
            res.setHeader('Content-Type', screenshot.mime_type);
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(Buffer.from(screenshot.image_data));
        } else {
            res.status(404).send(`
                <html>
                <body style="background: #1a1a2e; color: white; text-align: center; padding: 50px; font-family: monospace;">
                    <h1>📸 Screenshot Not Found</h1>
                    <p>No screenshot was attached to this report.</p>
                    <a href="/api/game/bug-reports/list?password=your-secret-password" style="color: #9b59b6;">← Back to Reports</a>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('Error loading screenshot:', error);
        res.status(500).send('Error loading screenshot');
    }
});

// ── Convert MP to Special Mana Potion ─────────────────────────────────────
router.post('/convert-mp-to-potion', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        
        await applyMpRegen(db, character.id);
        
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [character.id]);
        const currentMp = freshChar.mission_points ?? 0;
        const activePrem = getActivePremium(freshChar);
        const mpMax = hasPremium(activePrem, 'arcane_reservoir') ? MP_MAX * 2 : MP_MAX;
        
        if (currentMp < 60) {
            return res.status(400).json({ error: `Need 60 MP to create a potion. You have ${currentMp}/${mpMax} MP.` });
        }
        
        const existingPotions = await dbAll(db, `
            SELECT * FROM inventory 
            WHERE char_id = ? 
            AND item_type = 'consumable' 
            AND json_extract(item_data, '$.id') = 'special_mana_potion'
        `, [freshChar.id]);
        
        let totalPotionQty = 0;
        for (const potion of existingPotions) {
            const data = JSON.parse(potion.item_data);
            totalPotionQty += data.qty || 1;
        }
        
        if (totalPotionQty >= 5) {
            return res.status(400).json({ error: `You already have ${totalPotionQty}/5 Special Mana Potions. Use some before creating more.` });
        }
        
        await dbRun(db, 'UPDATE characters SET mission_points = mission_points - 60 WHERE id = ?', [freshChar.id]);
        await recordTotalMpSpent(db, freshChar.id, 60);
        
        const potionData = {
            id: 'special_mana_potion',
            name: 'Special Mana Potion',
            emoji: '💎',
            desc: 'Restores 60 MP. Crafted from your own MP reserve.',
            effect: { type: 'mp', value: 60 },
            consumable: true,
            category: 'consumable',
            qty: 1
        };
        
        if (existingPotions.length > 0) {
            const existing = existingPotions[0];
            const data = JSON.parse(existing.item_data);
            data.qty = (data.qty || 1) + 1;
            await dbRun(db, 'UPDATE inventory SET item_data = ? WHERE id = ?', [JSON.stringify(data), existing.id]);
        } else {
            await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?, ?, ?)', 
                [freshChar.id, 'consumable', JSON.stringify(potionData)]);
        }
        
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [freshChar.id]);
        const newTotalPotions = totalPotionQty + 1;
        
        res.json({
            success: true,
            message: `✨ Converted 60 MP into a Special Mana Potion! (${newTotalPotions}/5)`,
            character: await buildCharacterResponse(updatedChar, db),
            potionCount: newTotalPotions
        });
    } catch (e) {
        console.error('MP to Potion conversion error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Open Loot Box ─────────────────────────────────────────────────────────
router.post('/lootbox/open/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        const inventoryItem = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!inventoryItem) return res.status(404).json({ error: 'Item not found' });
        
        const itemData = JSON.parse(inventoryItem.item_data);
        
        if (itemData.category !== 'lootbox') {
            return res.status(400).json({ error: 'This item is not a loot box!' });
        }
        
        const currentQty = itemData.qty || 1;
        if (currentQty < 1) {
            return res.status(400).json({ error: 'You don\'t have any of this loot box!' });
        }
        
        const loot = generateLootFromBox(itemData.lootType, char.level);
        
        if (currentQty <= 1) {
            await dbRun(db, 'DELETE FROM inventory WHERE id=?', [inventoryItem.id]);
        } else {
            itemData.qty = currentQty - 1;
            await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(itemData), inventoryItem.id]);
        }
        
        const addedItems = [];
        for (const lootItem of loot.items) {
            if (lootItem.stackable) {
                const existing = await dbGet(db, `
                    SELECT * FROM inventory 
                    WHERE char_id=? AND item_type=? AND json_extract(item_data,'$.id')=?
                `, [char.id, lootItem.type, lootItem.id]);
                
                if (existing) {
                    const existingData = JSON.parse(existing.item_data);
                    existingData.qty = (existingData.qty || 1) + lootItem.qty;
                    await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(existingData), existing.id]);
                } else {
                    await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?,?,?)',
                        [char.id, lootItem.type, JSON.stringify(lootItem)]);
                }
            } else {
                await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?,?,?)',
                    [char.id, lootItem.type, JSON.stringify(lootItem)]);
            }
            addedItems.push(lootItem);
        }
        
        let gemsFound = 0;
        if (loot.gems > 0) {
            gemsFound = loot.gems;
            await dbRun(db, 'UPDATE characters SET gems=gems+? WHERE id=?', [gemsFound, char.id]);
        }
        
        let goldFound = 0;
        if (loot.gold > 0) {
            goldFound = loot.gold;
            await dbRun(db, 'UPDATE characters SET gold=gold+? WHERE id=?', [goldFound, char.id]);
        }
        
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        
        res.json({
            success: true,
            message: `🎁 Opened ${itemData.name}!`,
            loot: addedItems,
            gemsFound,
            goldFound,
            character: await buildCharacterResponse(updatedChar, db)
        });
        
    } catch (e) {
        console.error('Loot box error:', e);
        res.status(500).json({ error: e.message });
    }
});

function generateLootFromBox(boxType, playerLevel) {
    const result = {
        items: [],
        gems: 0,
        gold: 0
    };
    
    const drops = {
        common: {
            itemsCount: 5,
            materials: [
                { id: 'wood', name: 'Wood', emoji: '🪵', weight: 30, qty: [1, 3] },
                { id: 'iron_ore', name: 'Iron Ore', emoji: '⛏️', weight: 25, qty: [1, 2] },
                { id: 'wolf_pelt', name: 'Wolf Pelt', emoji: '🐺', weight: 20, qty: [1, 2] },
                { id: 'herbs', name: 'Herbs', emoji: '🌿', weight: 25, qty: [1, 3] }
            ],
            gear: [
                { quality: 'common', chance: 0.15, level: playerLevel },
                { quality: 'rare', chance: 0.03, level: playerLevel }
            ],
            goldRange: [50, 200],
            gemChance: 0.01,
            gemRange: [1, 1]
        },
        novice: {
            itemsCount: 5,
            materials: [
                { id: 'iron_ore', name: 'Iron Ore', emoji: '⛏️', weight: 25, qty: [2, 4] },
                { id: 'mithril_ore', name: 'Mithril Ore', emoji: '✨', weight: 15, qty: [1, 2] },
                { id: 'poison_gland', name: 'Poison Gland', emoji: '🧪', weight: 20, qty: [1, 2] },
                { id: 'swamp_crystal', name: 'Swamp Crystal', emoji: '💎', weight: 15, qty: [1, 2] },
                { id: 'frost_essence', name: 'Frost Essence', emoji: '❄️', weight: 10, qty: [1, 2] }
            ],
            gear: [
                { quality: 'common', chance: 0.20, level: playerLevel },
                { quality: 'rare', chance: 0.08, level: playerLevel },
                { quality: 'epic', chance: 0.02, level: playerLevel }
            ],
            goldRange: [200, 500],
            gemChance: 0.03,
            gemRange: [1, 2]
        },
        rare: {
            itemsCount: 5,
            materials: [
                { id: 'mithril_ore', name: 'Mithril Ore', emoji: '✨', weight: 25, qty: [2, 4] },
                { id: 'dragon_scale_shard', name: 'Dragon Scale Shard', emoji: '🐉', weight: 20, qty: [1, 2] },
                { id: 'arcane_dust', name: 'Arcane Dust', emoji: '🌟', weight: 20, qty: [2, 4] },
                { id: 'void_shard', name: 'Void Shard', emoji: '🔮', weight: 15, qty: [1, 2] },
                { id: 'shadow_essence', name: 'Shadow Essence', emoji: '👁️', weight: 10, qty: [1, 2] }
            ],
            gear: [
                { quality: 'rare', chance: 0.30, level: playerLevel },
                { quality: 'epic', chance: 0.10, level: playerLevel },
                { quality: 'legendary', chance: 0.02, level: playerLevel }
            ],
            goldRange: [500, 1500],
            gemChance: 0.05,
            gemRange: [1, 3]
        },
        epic: {
            itemsCount: 5,
            materials: [
                { id: 'void_shard', name: 'Void Shard', emoji: '🔮', weight: 30, qty: [2, 4] },
                { id: 'shadow_essence', name: 'Shadow Essence', emoji: '👁️', weight: 25, qty: [2, 4] },
                { id: 'demon_core', name: 'Demon Core', emoji: '💀', weight: 20, qty: [1, 2] },
                { id: 'legendary_fragment', name: 'Legendary Fragment', emoji: '⭐', weight: 15, qty: [1, 2] }
            ],
            gear: [
                { quality: 'epic', chance: 0.40, level: playerLevel },
                { quality: 'legendary', chance: 0.08, level: playerLevel }
            ],
            goldRange: [1000, 3000],
            gemChance: 0.10,
            gemRange: [1, 5]
        },
        legendary: {
            itemsCount: 5,
            materials: [
                { id: 'legendary_fragment', name: 'Legendary Fragment', emoji: '⭐', weight: 50, qty: [2, 5] },
                { id: 'demon_core', name: 'Demon Core', emoji: '💀', weight: 30, qty: [2, 4] }
            ],
            gear: [
                { quality: 'epic', chance: 0.50, level: playerLevel },
                { quality: 'legendary', chance: 0.50, level: playerLevel }
            ],
            goldRange: [2000, 5000],
            gemChance: 0.25,
            gemRange: [2, 10]
        }
    };
    
    const boxDrops = drops[boxType];
    const createMaterialDrop = () => {
        const totalWeight = boxDrops.materials.reduce((sum, m) => sum + m.weight, 0);
        let roll = Math.random() * totalWeight;
        let selected = boxDrops.materials[0];
        for (const mat of boxDrops.materials) {
            if (roll < mat.weight) {
                selected = mat;
                break;
            }
            roll -= mat.weight;
        }

        const qty = Math.floor(Math.random() * (selected.qty[1] - selected.qty[0] + 1) + selected.qty[0]);
        return {
            id: selected.id,
            name: selected.name,
            emoji: selected.emoji,
            type: 'raw_mat',
            qty: qty,
            stackable: true,
            rarity: 'common'
        };
    };
    
    if (Math.random() < 0.6) {
        const goldAmount = Math.floor(Math.random() * (boxDrops.goldRange[1] - boxDrops.goldRange[0] + 1) + boxDrops.goldRange[0]);
        result.gold = goldAmount;
    }
    
    if (Math.random() < boxDrops.gemChance) {
        const gemAmount = Math.floor(Math.random() * (boxDrops.gemRange[1] - boxDrops.gemRange[0] + 1) + boxDrops.gemRange[0]);
        result.gems = gemAmount;
    }
    
    for (let i = 0; i < boxDrops.itemsCount; i++) {
        const isMaterial = Math.random() < 0.6;
        
        if (isMaterial) {
            result.items.push(createMaterialDrop());
        } else {
            let roll = Math.random();
            let selectedQuality = null;
            for (const gear of boxDrops.gear) {
                if (roll < gear.chance) {
                    selectedQuality = gear.quality;
                    break;
                }
                roll -= gear.chance;
            }
            
            if (selectedQuality) {
                const itemTypes = ['weapon', 'armor', 'helmet', 'shield', 'boots', 'ring', 'amulet', 'accessory'];
                const randomType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
                const item = generateBackendRandomItem(playerLevel, randomType);
                item.quality = selectedQuality;
                item.desc = `✨ ${item.desc}`;
                result.items.push({
                    ...item,
                    type: 'equipment',
                    stackable: false,
                    qty: 1
                });
            } else {
                result.items.push(createMaterialDrop());
            }
        }
    }
    
    if (boxType === 'legendary') {
        const hasLegendary = result.items.some(item => item.quality === 'legendary');
        if (!hasLegendary) {
            const itemTypes = ['weapon', 'armor', 'helmet', 'shield', 'boots', 'ring', 'amulet', 'accessory'];
            const randomType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            const legendaryItem = generateBackendRandomItem(playerLevel, randomType);
            legendaryItem.quality = 'legendary';
            legendaryItem.desc = `👑 ${legendaryItem.desc}`;
            
            const index = result.items.findIndex(i => i.quality !== 'legendary');
            if (index !== -1) {
                result.items[index] = {
                    ...legendaryItem,
                    type: 'equipment',
                    stackable: false,
                    qty: 1
                };
            }
        }
    }
    
    return result;
}

router.post('/equipment/upgrade/:inventoryId', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { componentId } = req.body;
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        
        const itemData = JSON.parse(item.item_data);
        
        if (item.item_type !== 'equipment') {
            return res.status(400).json({ error: 'Only equipment can be upgraded!' });
        }
        
        const currentUpgrade = item.upgrade_level || 0;
        const quality = itemData.quality || 'common';
        let maxUpgrade = 3;
        if (quality === 'legendary') maxUpgrade = 5;
        else if (quality === 'epic' || quality === 'rare') maxUpgrade = 4;

        if (currentUpgrade >= maxUpgrade) {
            return res.status(400).json({ error: `Item already at max upgrade level (+${maxUpgrade}) for ${quality} quality!` });
        }
        
        const component = await dbGet(db, `
            SELECT * FROM inventory 
            WHERE char_id=? AND item_type='component' 
            AND json_extract(item_data, '$.id')=?
        `, [char.id, componentId]);
        
        if (!component) {
            return res.status(400).json({ error: `You don't have this component!` });
        }
        
        const componentData = JSON.parse(component.item_data);
        const componentQty = componentData.qty || 1;
        
        if (componentQty < 1) {
            return res.status(400).json({ error: `You don't have this component!` });
        }
        
        const upgradeValue = COMPONENT_UPGRADE_VALUES[componentId];
        if (!upgradeValue) {
            return res.status(400).json({ error: 'This component cannot be used for upgrading!' });
        }
        
        if (componentQty <= 1) {
            await dbRun(db, 'DELETE FROM inventory WHERE id=?', [component.id]);
        } else {
            componentData.qty = componentQty - 1;
            await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(componentData), component.id]);
        }
        
        const upgradedStats = { ...itemData.stats };
        const bonusValue = upgradeValue.bonus;
        
        let upgradedStatsList = [];
        let statPool = [...POSSIBLE_STATS];
        
        for (let i = statPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [statPool[i], statPool[j]] = [statPool[j], statPool[i]];
        }
        
        upgradedStatsList = statPool.slice(0, 2);
        
        for (const stat of upgradedStatsList) {
            const currentValue = upgradedStats[stat] || 0;
            upgradedStats[stat] = currentValue + bonusValue;
        }
        
        const nextUpgrade = currentUpgrade + 1;
        
        const upgradedItemData = {
            ...itemData,
            stats: upgradedStats,
            upgradedStats: upgradedStatsList,
            upgradeLevel: nextUpgrade,
            name: `${itemData.name.split(' +')[0]} +${nextUpgrade}`,
            desc: `${itemData.desc} [Upgraded +${nextUpgrade} using ${componentData.name}]`
        };
        
        await dbRun(db, 'UPDATE inventory SET item_data=?, upgrade_level=? WHERE id=?', 
            [JSON.stringify(upgradedItemData), nextUpgrade, item.id]);
        
        res.json({
            success: true,
            message: `✨ ${itemData.name} upgraded to +${nextUpgrade} using ${componentData.name}! (+${bonusValue} to ${upgradedStatsList.length} stats)`,
            newUpgradeLevel: nextUpgrade,
            upgradedStats: upgradedStatsList.map(stat => ({
                stat,
                oldValue: itemData.stats?.[stat] || 0,
                newValue: upgradedStats[stat],
                increase: bonusValue
            })),
            componentUsed: componentData.name,
            character: await buildCharacterResponse(char, db)
        });
        
    } catch (e) {
        console.error('Upgrade error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Exchange Legendary Fragments for Materials ─────────────────────────────
const MATERIAL_EXCHANGES = {
    // Common materials (tier 1)
    wood: { name: 'Wood', emoji: '🪵', rarity: 1, fragmentCost: 5 },
    iron_ore: { name: 'Iron Ore', emoji: '⛏️', rarity: 1, fragmentCost: 5 },
    wolf_pelt: { name: 'Wolf Pelt', emoji: '🐺', rarity: 1, fragmentCost: 5 },
    herbs: { name: 'Herbs', emoji: '🌿', rarity: 1, fragmentCost: 5 },
    
    // Uncommon materials (tier 2)
    poison_gland: { name: 'Poison Gland', emoji: '🧪', rarity: 2, fragmentCost: 10 },
    swamp_crystal: { name: 'Swamp Crystal', emoji: '💎', rarity: 2, fragmentCost: 10 },
    frost_essence: { name: 'Frost Essence', emoji: '❄️', rarity: 2, fragmentCost: 10 },
    mithril_ore: { name: 'Mithril Ore', emoji: '✨', rarity: 2, fragmentCost: 10 },
    
    // Rare materials (tier 3)
    dragon_scale_shard: { name: 'Dragon Scale Shard', emoji: '🐉', rarity: 3, fragmentCost: 15 },
    arcane_dust: { name: 'Arcane Dust', emoji: '🌟', rarity: 3, fragmentCost: 15 },
    rune_fragment: { name: 'Rune Fragment', emoji: '🔮', rarity: 3, fragmentCost: 15 },
    void_shard: { name: 'Void Shard', emoji: '🌑', rarity: 3, fragmentCost: 15 },
    
    // Epic materials (tier 4)
    shadow_essence: { name: 'Shadow Essence', emoji: '👁️', rarity: 4, fragmentCost: 20 },
    demon_core: { name: 'Demon Core', emoji: '💀', rarity: 4, fragmentCost: 20 },
    legendary_fragment: { name: 'Legendary Fragment', emoji: '⭐', rarity: 4, fragmentCost: 20 }, // Exchange fragments for more fragments? No, skip this
    
    // Legendary materials (tier 5)
    void_crystal: { name: 'Void Crystal', emoji: '🔮', rarity: 5, fragmentCost: 25 },
    shadow_weave: { name: 'Shadow Weave', emoji: '🌙', rarity: 5, fragmentCost: 25 },
    demon_alloy: { name: 'Demon Alloy', emoji: '⚙️', rarity: 5, fragmentCost: 25 },
};

router.post('/exchange/fragments', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { materialId, quantity = 1 } = req.body;
        
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        const exchange = MATERIAL_EXCHANGES[materialId];
        if (!exchange) return res.status(400).json({ error: 'Invalid material for exchange' });
        
        // Calculate total fragment cost
        const totalFragmentsNeeded = exchange.fragmentCost * quantity;
        
        // Check if player has enough legendary fragments
const fragmentItem = await dbGet(db, `
    SELECT * FROM inventory 
    WHERE char_id = ? 
    AND item_type IN ('raw_mat', 'component')
    AND json_extract(item_data, '$.id') = 'legendary_fragment'
`, [char.id]);
        
        let availableFragments = 0;
        if (fragmentItem) {
            const fragmentData = JSON.parse(fragmentItem.item_data);
            availableFragments = fragmentData.qty || 1;
        }
        
        if (availableFragments < totalFragmentsNeeded) {
            return res.status(400).json({ 
                error: `Need ${totalFragmentsNeeded} Legendary Fragments, you have ${availableFragments}` 
            });
        }
        
        // Deduct legendary fragments
        if (fragmentItem) {
            const fragmentData = JSON.parse(fragmentItem.item_data);
            const newQty = (fragmentData.qty || 1) - totalFragmentsNeeded;
            
            if (newQty <= 0) {
                await dbRun(db, 'DELETE FROM inventory WHERE id = ?', [fragmentItem.id]);
            } else {
                fragmentData.qty = newQty;
                await dbRun(db, 'UPDATE inventory SET item_data = ? WHERE id = ?', 
                    [JSON.stringify(fragmentData), fragmentItem.id]);
            }
        }
        
        // Add the requested material/component.
        // Some exchange targets are real components (for example demon_alloy),
        // so we must preserve their proper inventory type and metadata.
        const targetType = COMPONENTS[materialId] ? 'component' : 'raw_mat';
        const targetDef = COMPONENTS[materialId] || RAW_MATERIALS[materialId];
        if (!targetDef) {
            return res.status(400).json({ error: 'Unknown exchange target' });
        }

        // Repair older bugged rows too: if this item was previously inserted as the
        // wrong type, merge all quantities into one correctly typed row.
        const existingRows = await dbAll(db, `
            SELECT * FROM inventory
            WHERE char_id = ?
            AND item_type IN ('raw_mat', 'component')
            AND json_extract(item_data, '$.id') = ?
        `, [char.id, materialId]);

        const totalExistingQty = existingRows.reduce((sum, row) => {
            const data = JSON.parse(row.item_data);
            return sum + (data.qty || 1);
        }, 0);

        const desiredData = {
            id: materialId,
            ...targetDef,
            qty: totalExistingQty + quantity
        };

        const correctRow = existingRows.find(row => row.item_type === targetType) || null;

        if (correctRow) {
            await dbRun(db, 'UPDATE inventory SET item_data = ? WHERE id = ?', [
                JSON.stringify(desiredData),
                correctRow.id
            ]);

            for (const row of existingRows) {
                if (row.id !== correctRow.id) {
                    await dbRun(db, 'DELETE FROM inventory WHERE id = ?', [row.id]);
                }
            }
        } else {
            for (const row of existingRows) {
                await dbRun(db, 'DELETE FROM inventory WHERE id = ?', [row.id]);
            }
            await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?, ?, ?)', [
                char.id,
                targetType,
                JSON.stringify(desiredData)
            ]);
        }
        
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        
        res.json({
            success: true,
            message: `Exchanged ${totalFragmentsNeeded} Legendary Fragments for ${quantity}x ${exchange.name}!`,
            character: await buildCharacterResponse(updatedChar, db),
            materialId,
            quantity,
            fragmentsSpent: totalFragmentsNeeded
        });
        
    } catch (e) {
        console.error('Exchange error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Helper function to extract NPC name from mission name
function getNPCNameFromMission(missionName) {
    // Define patterns for different mission types
    const patterns = [
        // "Slay the Bog Witch" -> "Bog Witch"
        { regex: /Slay the (.+)/i, transform: (match) => match[1] },
        // "Hunt the Wolves" -> "Wolves"
        { regex: /Hunt the (.+)/i, transform: (match) => match[1] },
        // "Clear the Bandits" -> "Bandits"
        { regex: /Clear the (.+)/i, transform: (match) => match[1] },
        // "Defeat the Forest Guardian" -> "Forest Guardian"
        { regex: /Defeat the (.+)/i, transform: (match) => match[1] },
        // "Face the Swamp Horror" -> "Swamp Horror"
        { regex: /Face the (.+)/i, transform: (match) => match[1] },
        // "Destroy the Corrupted Heart" -> "Corrupted Heart"
        { regex: /Destroy the (.+)/i, transform: (match) => match[1] },
        // "Purify the Waters" -> "Waters Guardian"
        { regex: /Purify the (.+)/i, transform: (match) => `${match[1]} Guardian` },
        // "Confront the Shadow Lord" -> "Shadow Lord"
        { regex: /Confront the (.+)/i, transform: (match) => match[1] },
        // "Slay the Ice Drake" -> "Ice Drake"
        { regex: /Slay the (.+)/i, transform: (match) => match[1] },
        // "Awaken the Frozen Giant" -> "Frozen Giant"
        { regex: /Awaken the (.+)/i, transform: (match) => match[1] },
        // "Banish the Wraith Lord" -> "Wraith Lord"
        { regex: /Banish the (.+)/i, transform: (match) => match[1] },
    ];
    
    for (const pattern of patterns) {
        const match = missionName.match(pattern.regex);
        if (match) {
            let npcName = pattern.transform(match);
            // Remove "the " if present at the start
            npcName = npcName.replace(/^the\s+/i, '');
            return npcName;
        }
    }
    
    // Default: return the mission name as-is, but remove common prefixes
    let defaultName = missionName
        .replace(/^(Slay|Hunt|Clear|Defeat|Face|Destroy|Purify|Confront|Banish|Awaken)\s+/i, '')
        .replace(/^the\s+/i, '');
    return defaultName;
}

// Get available exchanges
router.get('/exchange/fragments/list', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        // Get player's legendary fragment count
        const fragmentItem = await dbGet(db, `
            SELECT * FROM inventory 
            WHERE char_id = ? AND item_type = 'component' 
            AND json_extract(item_data, '$.id') = 'legendary_fragment'
        `, [char.id]);
        
        let fragmentCount = 0;
        if (fragmentItem) {
            const fragmentData = JSON.parse(fragmentItem.item_data);
            fragmentCount = fragmentData.qty || 1;
        }
        
        // Group materials by rarity
        const exchanges = {};
        for (const [id, data] of Object.entries(MATERIAL_EXCHANGES)) {
            if (id === 'legendary_fragment') continue; // Skip self-exchange
            const rarity = data.rarity;
            if (!exchanges[rarity]) exchanges[rarity] = [];
            exchanges[rarity].push({
                id,
                name: data.name,
                emoji: data.emoji,
                fragmentCost: data.fragmentCost,
                canAfford: fragmentCount >= data.fragmentCost
            });
        }
        
        res.json({
            success: true,
            fragmentCount,
            exchanges
        });
    } catch (e) {
        console.error('Exchange list error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/travel/abyss/enter', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        
        // Check level requirement
        if (character.level < 39) {
            return res.status(400).json({ error: 'Requires level 39 to enter the Abyss' });
        }
        
        // Check if already in Abyss
        if (character.current_map === 'abyss') {
            return res.status(400).json({ error: 'Already in the Abyss' });
        }
        
        // Teleport to Shadowfen Depths
        await dbRun(db, 'UPDATE characters SET current_map = ?, location = ? WHERE id = ?', 
            ['abyss', 'shadowfen', character.id]);
        
        res.json({ 
            success: true, 
            location: 'shadowfen',
            message: 'You enter the Abyss...'
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/travel/abyss/exit', auth, async (req, res) => {
    try {
        const db = await getDb();
        const character = await getCurrentCharacter(db, req.user.userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        
        // Check if in Abyss
        if (character.current_map !== 'abyss') {
            return res.status(400).json({ error: 'Not in the Abyss' });
        }
        
        // Return to Dark City
        await dbRun(db, 'UPDATE characters SET current_map = ?, location = ? WHERE id = ?', 
            ['overworld', 'dark_city', character.id]);
        
        res.json({ 
            success: true, 
            location: 'dark_city',
            message: 'You return from the Abyss.'
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/abyss/data', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'current_map, level');
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        res.json({
            success: true,
            zones: ABYSS_ZONES,
            routes: ABYSS_ROUTES,
            currentMap: char.current_map || 'overworld',
            playerLevel: char.level
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Helper to check if character is currently training
async function isCharacterTraining(db, characterId) {
    const training = await dbGet(db, 'SELECT * FROM skill_training WHERE char_id = ? AND ends_at > ?', 
        [characterId, Math.floor(Date.now() / 1000)]);
    return !!training;
}

module.exports = router;

