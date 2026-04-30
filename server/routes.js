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
const _weeklyClaimableCountCache = new Map();

function invalidateWeeklyClaimableCountCache(charId) {
    const prefix = `${charId}:`;
    for (const key of _weeklyClaimableCountCache.keys()) {
        if (key.startsWith(prefix)) {
            _weeklyClaimableCountCache.delete(key);
        }
    }
}

function normalizeReferralCode(value) {
    return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function normalizeRewardMaterialId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'baisbetterthanbk';
const MESSAGE_RETENTION_SECONDS = 14 * 24 * 60 * 60;
const CHAT_RETENTION_SECONDS = 12 * 60 * 60;
const CHAT_MESSAGE_MAX_LENGTH = 280;
const CHAT_PROFANITY_WORDS = [
    'asshole',
    'bitch',
    'bullshit',
    'cunt',
    'dick',
    'fuck',
    'fucker',
    'fucking',
    'motherfucker',
    'nigga',
    'nigger',
    'pussy',
    'shit',
    'slut',
    'whore'
];

function parseAdminPassword(req) {
    return String(req.query?.password || req.body?.password || '').trim();
}

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskProfanityWord(word) {
    const clean = String(word || '');
    if (clean.length <= 2) return '*'.repeat(clean.length || 1);
    return `${clean[0]}${'*'.repeat(Math.max(1, clean.length - 2))}${clean[clean.length - 1]}`;
}

function sanitizeChatMessage(input) {
    let text = String(input || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
        text = text.slice(0, CHAT_MESSAGE_MAX_LENGTH).trim();
    }
    for (const bannedWord of CHAT_PROFANITY_WORDS) {
        const re = new RegExp(`\\b${escapeRegex(bannedWord)}\\b`, 'gi');
        text = text.replace(re, (match) => maskProfanityWord(match));
    }
    return text;
}

function isTutorialCharacter(char) {
    if (!char) return false;
    return Number(char.wins || 0) < 4 && !Number(char.tutorial_skipped || 0);
}

function serializeChatMessage(row, currentCharId) {
    return {
        id: Number(row.id || 0),
        sender_char_id: Number(row.sender_char_id || 0),
        sender_name: row.sender_name || 'Unknown',
        recipient_char_id: row.recipient_char_id ? Number(row.recipient_char_id) : null,
        recipient_name: row.recipient_name || null,
        message_text: row.message_text || '',
        created_at: Number(row.created_at || 0),
        edited: !!row.edited,
        edited_at: row.edited_at ? Number(row.edited_at) : null,
        is_private: !!row.recipient_char_id,
        is_outgoing: Number(row.sender_char_id || 0) === Number(currentCharId || 0)
    };
}

function buildAdminRewardPayload(input = {}) {
    const gold = Math.max(0, Number(input.gold || 0));
    const gems = Math.max(0, Number(input.gems || 0));
    const materialType = String(input.materialType || '').trim().toLowerCase();
    const materialId = normalizeRewardMaterialId(input.materialId);
    const materialQty = Math.max(0, Number(input.materialQty || 0));
    const payload = {};
    if (gold > 0) payload.gold = gold;
    if (gems > 0) payload.gems = gems;
    if (materialId && materialQty > 0 && (materialType === 'raw_mat' || materialType === 'component')) {
        payload.material = { type: materialType, id: materialId, qty: materialQty };
    }
    return Object.keys(payload).length ? payload : null;
}

function adminRewardInputLooksFilled(input = {}) {
    const values = [
        input.gold,
        input.gems,
        input.materialType,
        input.materialId,
        input.materialQty
    ];
    return values.some(v => String(v ?? '').trim() !== '' && String(v ?? '').trim() !== '0');
}

function describeAdminRewardPayload(payload) {
    if (!payload || typeof payload !== 'object') return 'Message only';
    const parts = [];
    if (payload.gold) parts.push(`${Number(payload.gold).toLocaleString()} gold`);
    if (payload.gems) parts.push(`${Number(payload.gems).toLocaleString()} gems`);
    if (payload.material?.id && payload.material?.qty) parts.push(`${Number(payload.material.qty).toLocaleString()}x ${payload.material.id}`);
    return parts.length ? parts.join(' + ') : 'Message only';
}

async function purgeExpiredMessages(db) {
    const cutoff = Math.floor(Date.now() / 1000) - MESSAGE_RETENTION_SECONDS;
    await dbRun(db, 'DELETE FROM messages WHERE sent_at < ?', [cutoff]);
}

async function purgeExpiredChatMessages(db) {
    const cutoff = Math.floor(Date.now() / 1000) - CHAT_RETENTION_SECONDS;
    await dbRun(db, 'DELETE FROM chat_messages WHERE created_at < ?', [cutoff]);
}

async function queueReferralRewards(db, userId, rewards = {}) {
    if (!userId) return;
    const gold = Math.max(0, Number(rewards.gold || 0));
    const gems = Math.max(0, Number(rewards.gems || 0));
    const registered = Math.max(0, Number(rewards.registered || 0));
    const level5 = Math.max(0, Number(rewards.level5 || 0));
    await dbRun(
        db,
        `UPDATE users
         SET pending_referral_gold = COALESCE(pending_referral_gold, 0) + ?,
             pending_referral_gems = COALESCE(pending_referral_gems, 0) + ?,
             referrals_registered = COALESCE(referrals_registered, 0) + ?,
             referrals_level5 = COALESCE(referrals_level5, 0) + ?
         WHERE id = ?`,
        [gold, gems, registered, level5, userId]
    );
}

async function handleReferralLevelMilestone(db, userId, previousLevel, newLevel) {
    if (!userId || Number(previousLevel || 0) >= 5 || Number(newLevel || 0) < 5) return;
    const user = await dbGet(db, 'SELECT id, referred_by_user_id, referral_level5_rewarded FROM users WHERE id = ?', [userId]);
    if (!user || !user.referred_by_user_id || Number(user.referral_level5_rewarded || 0) !== 0) return;
    await queueReferralRewards(db, user.referred_by_user_id, { gems: 5, level5: 1 });
    await dbRun(db, 'UPDATE users SET referral_level5_rewarded = 1 WHERE id = ?', [user.id]);
}

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

const GUILD_RAID_CREATE_REPUTATION = 10;
const GUILD_RAID_MAX_MEMBERS = 6;
const GUILD_RAID_GLOBAL_COOLDOWN = 20 * 60 * 60;
const GUILD_RAID_MERCENARY_COST_GEMS = 1;
const GUILD_RAID_BOSS_POOL = [
    { name: 'Death Knight Malachar', image: '/images/boss/malachar.jpg', baseHp: 600, baseAtk: 45, baseDef: 20 },
    { name: 'Ignarath the Eternal', image: '/images/boss/ignarath.jpg', baseHp: 700, baseAtk: 55, baseDef: 25 },
    { name: 'Nyxaroth the Devourer', image: '/images/boss/nyxaroth.jpg', baseHp: 800, baseAtk: 65, baseDef: 30 },
    { name: 'The Hollow King', image: '/images/boss/hollowking.jpg', baseHp: 900, baseAtk: 70, baseDef: 35 },
    { name: 'Voidborn Colossus', image: '/images/boss/voidborn.jpg', baseHp: 1000, baseAtk: 80, baseDef: 40 },
    { name: 'The Undying Empress', image: '/images/boss/empress.jpg', baseHp: 1100, baseAtk: 90, baseDef: 45 },
    { name: 'Abyssal Sovereign', image: '/images/boss/sovereign.jpg', baseHp: 1200, baseAtk: 95, baseDef: 50 },
];

function getGuildRaidBossForFloor(floor) {
    const safeFloor = Math.max(1, Number(floor) || 1);
    const idx = (safeFloor - 1) % GUILD_RAID_BOSS_POOL.length;
    const tier = Math.floor((safeFloor - 1) / GUILD_RAID_BOSS_POOL.length);
    const base = GUILD_RAID_BOSS_POOL[idx];
    const scale = 1 + (safeFloor - 1) * 0.18 + tier * 0.5;
    const hp = Math.round(base.baseHp * scale * 6);
    const atk = Math.round(base.baseAtk * scale * 6);
    const def = Math.round(base.baseDef * scale * 6);
    return {
        floor: safeFloor,
        name: base.name,
        image: base.image,
        hp,
        atk,
        def,
        dmgMin: Math.max(1, Math.round(atk * 0.78)),
        dmgMax: Math.max(2, Math.round(atk * 1.18)),
    };
}

const GUILD_RAID_MERCENARY_POOL = [
    { key: 'skeleton', name: 'Skeleton Warrior', class: 'mercenary', hpBase: 95, atkBase: 18, defBase: 8, agiBase: 10, magicBase: 2 },
    { key: 'ghost', name: 'Wailing Ghost', class: 'mercenary', hpBase: 82, atkBase: 16, defBase: 6, agiBase: 14, magicBase: 8 },
    { key: 'zombie', name: 'Rotting Zombie', class: 'mercenary', hpBase: 118, atkBase: 17, defBase: 12, agiBase: 6, magicBase: 1 },
    { key: 'fire_imp', name: 'Fire Imp', class: 'mercenary', hpBase: 76, atkBase: 20, defBase: 5, agiBase: 16, magicBase: 12 },
    { key: 'void_wraith', name: 'Void Wraith', class: 'mercenary', hpBase: 88, atkBase: 22, defBase: 7, agiBase: 18, magicBase: 14 },
    { key: 'abyssal_eye', name: 'Abyssal Eye', class: 'mercenary', hpBase: 92, atkBase: 19, defBase: 9, agiBase: 12, magicBase: 16 },
    { key: 'shadow_lord', name: 'Shadow Lord', class: 'mercenary', hpBase: 110, atkBase: 24, defBase: 11, agiBase: 15, magicBase: 10 },
    { key: 'dread_knight', name: 'Dread Knight', class: 'mercenary', hpBase: 128, atkBase: 26, defBase: 14, agiBase: 11, magicBase: 6 },
];

function generateRaidMercenary(floor, slotIndex) {
    const safeFloor = Math.max(1, Number(floor) || 1);
    const base = GUILD_RAID_MERCENARY_POOL[Math.floor(Math.random() * GUILD_RAID_MERCENARY_POOL.length)];
    const scale = 1 + safeFloor * 0.14 + (Math.random() * 0.18);
    const hp = Math.round(base.hpBase * scale);
    const strength = Math.round(base.atkBase * scale);
    const defense = Math.round(base.defBase * scale);
    const agility = Math.round(base.agiBase * scale);
    const magic = Math.round(base.magicBase * scale);
    const hitChance = Math.min(95, 62 + safeFloor + Math.floor(Math.random() * 10));
    const critChance = Math.min(35, 5 + Math.floor(safeFloor / 3) + Math.floor(Math.random() * 6));
    const armor = Math.max(0, Math.round(defense * 0.45));
    const dmgMin = Math.max(1, Math.round(strength * 0.58));
    const dmgMax = Math.max(dmgMin + 1, Math.round(strength * 0.92));
    return {
        id: `merc_${slotIndex}_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        slotIndex,
        key: base.key,
        name: base.name,
        level: Math.max(1, safeFloor),
        recruited: false,
        costGems: GUILD_RAID_MERCENARY_COST_GEMS,
        stats: { hp, strength, defense, agility, magic, hitChance, critChance, armor, dmgMin, dmgMax },
        fighter: {
            id: `raid_merc_${slotIndex}_${safeFloor}`,
            name: base.name,
            class: base.class,
            hp,
            dmgMin,
            dmgMax,
            strength,
            agility,
            magic,
            defense,
            hit_chance: hitChance,
            crit_chance: critChance,
            armor,
            elem_dmg: { pyro: 0, water: 0, wind: 0, electro: 0 },
            elem_resist: { pyro: 0, water: 0, wind: 0, electro: 0 },
            skillEffects: {},
            skillMods: {},
            activeSkills: {},
            attackZones: DEFAULT_ATTACK_ZONES,
            blockZones: DEFAULT_BLOCK_ZONES,
            dualWield: false,
        }
    };
}

function generateRaidMercenaryPool(floor, count = 10) {
    return Array.from({ length: count }, (_, idx) => generateRaidMercenary(floor, idx));
}

async function ensureRaidMercenaryPool(db, raid) {
    if (!raid) return [];
    let pool = [];
    try { pool = JSON.parse(raid.mercenary_pool || '[]') || []; } catch {}
    if (Array.isArray(pool) && pool.length) return pool;
    if (raid.status !== 'forming') return [];
    pool = generateRaidMercenaryPool(raid.floor, 10);
    await dbRun(db, 'UPDATE guild_raids SET mercenary_pool = ? WHERE id = ?', [JSON.stringify(pool), raid.id]);
    raid.mercenary_pool = JSON.stringify(pool);
    return pool;
}

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
            'ALTER TABLE characters ADD COLUMN unlocked_profile_pics TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN tutorial_skipped INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN last_free_gems_claim_at INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN physical_only_wins INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN mission_gems_earned INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN global_cooldown_until INTEGER DEFAULT 0',
            'ALTER TABLE characters ADD COLUMN raid_cooldown_until INTEGER DEFAULT 0',
            'ALTER TABLE guild_raids ADD COLUMN mercenary_pool TEXT DEFAULT NULL',
            'ALTER TABLE guild_raid_members ADD COLUMN is_npc INTEGER DEFAULT 0',
            'ALTER TABLE guild_raid_members ADD COLUMN member_name TEXT DEFAULT NULL',
            'ALTER TABLE guild_raid_members ADD COLUMN member_class TEXT DEFAULT NULL',
            'ALTER TABLE guild_raid_members ADD COLUMN member_level INTEGER DEFAULT 1',
            'ALTER TABLE guild_raid_members ADD COLUMN member_payload TEXT DEFAULT NULL',
            `ALTER TABLE characters ADD COLUMN current_map TEXT DEFAULT 'overworld'`,
            `ALTER TABLE active_missions ADD COLUMN map_type TEXT DEFAULT 'overworld'`,
            'ALTER TABLE users ADD COLUMN active_character_id INTEGER DEFAULT NULL',
            'ALTER TABLE users ADD COLUMN assistant_enabled INTEGER DEFAULT 1',
            'ALTER TABLE users ADD COLUMN user_session TEXT DEFAULT NULL',
            'ALTER TABLE users ADD COLUMN skip_battle_animations INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN profile_pic TEXT DEFAULT NULL',
            'ALTER TABLE characters ADD COLUMN profile_pic TEXT DEFAULT NULL',
            'ALTER TABLE users ADD COLUMN referred_by_user_id INTEGER DEFAULT NULL',
            'ALTER TABLE users ADD COLUMN referral_level5_rewarded INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN pending_referral_gold INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN pending_referral_gems INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN referrals_registered INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN referrals_level5 INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN inbox_badge_messages INTEGER DEFAULT 1',
            'ALTER TABLE users ADD COLUMN inbox_badge_battles INTEGER DEFAULT 1',
            'ALTER TABLE users ADD COLUMN inbox_badge_missions INTEGER DEFAULT 1',
            'ALTER TABLE users ADD COLUMN chat_enabled INTEGER DEFAULT 1',
            'ALTER TABLE users ADD COLUMN inbox_autoread_messages INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN inbox_autoread_battles INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN inbox_autoread_missions INTEGER DEFAULT 0',
            'ALTER TABLE shop_items ADD COLUMN char_id INTEGER DEFAULT NULL',
            'ALTER TABLE character_weekly_state ADD COLUMN mission_fights_base INTEGER DEFAULT 0',
            'ALTER TABLE messages ADD COLUMN sender_label TEXT DEFAULT NULL',
            'ALTER TABLE messages ADD COLUMN reward_payload TEXT DEFAULT NULL',
            'ALTER TABLE messages ADD COLUMN reward_claimed INTEGER DEFAULT 0',
            'ALTER TABLE messages ADD COLUMN system_message INTEGER DEFAULT 0',
            'ALTER TABLE messages ADD COLUMN admin_batch_id INTEGER DEFAULT NULL',
`CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_user_id INTEGER NOT NULL,
                sender_char_id INTEGER NOT NULL,
                sender_name TEXT NOT NULL,
                recipient_char_id INTEGER DEFAULT NULL,
                recipient_name TEXT DEFAULT NULL,
                message_text TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                edited INTEGER DEFAULT 0,
                edited_at INTEGER DEFAULT NULL
            )`,
            'CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_chat_messages_visibility ON chat_messages(recipient_char_id, id DESC)',
            'ALTER TABLE chat_messages ADD COLUMN edited INTEGER DEFAULT 0',
            'ALTER TABLE chat_messages ADD COLUMN edited_at INTEGER',
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
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER,
            receiver_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0,
            sent_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            sender_label TEXT DEFAULT NULL,
            reward_payload TEXT DEFAULT NULL,
            reward_claimed INTEGER NOT NULL DEFAULT 0,
            system_message INTEGER NOT NULL DEFAULT 0,
            admin_batch_id INTEGER DEFAULT NULL
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
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS admin_reward_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            scope TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            reward_payload TEXT,
            recipient_count INTEGER NOT NULL DEFAULT 0
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS guild_raids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            leader_char_id INTEGER NOT NULL,
            leader_user_id INTEGER NOT NULL,
            floor INTEGER NOT NULL,
            boss_name TEXT NOT NULL,
            boss_image TEXT,
            boss_hp INTEGER NOT NULL DEFAULT 0,
            boss_atk INTEGER NOT NULL DEFAULT 0,
            boss_def INTEGER NOT NULL DEFAULT 0,
            auto_start_mode TEXT NOT NULL DEFAULT 'manual',
            scheduled_start_at INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'forming',
            created_at INTEGER NOT NULL,
            started_at INTEGER NOT NULL DEFAULT 0,
            completed_at INTEGER NOT NULL DEFAULT 0,
            result_summary TEXT,
            result_log TEXT
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS guild_raid_members (
            raid_id INTEGER NOT NULL,
            char_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at INTEGER NOT NULL,
            claimed_at INTEGER NOT NULL DEFAULT 0,
            reward_payload TEXT,
            PRIMARY KEY (raid_id, char_id)
        )`, args: [] });
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS dungeon_room_instances (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            char_id INTEGER NOT NULL,
            floor_number INTEGER NOT NULL,
            room_index INTEGER NOT NULL,
            status TEXT DEFAULT 'active',
            session_id TEXT,
            created_at INTEGER
        )`, args: [] });
        
        // Add session_id column if missing (for existing DBs)
        try {
            await db.execute({ sql: `ALTER TABLE dungeon_room_instances ADD COLUMN session_id TEXT DEFAULT NULL`, args: [] });
        } catch {}
        try {
            await db.execute({ sql: `ALTER TABLE dungeon_room_instances ADD COLUMN created_at INTEGER DEFAULT NULL`, args: [] });
        } catch {}
        
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

function buildExtendedAchievements() {
    const extras = [];
    const addFromBase = (base, overrides) => extras.push({ ...base, ...overrides });

    const battlesBase = ACHIEVEMENTS.find((a) => a.id === 'battles_500');
    addFromBase(battlesBase, {
        id: 'battles_1000',
        name: 'Battleforged',
        desc: 'Fight 1,000 total battles.',
        target: 1000,
        rewards: { gold: 250000, gems: 20, lootbox: { id: 'lootbox_rare', qty: 1 } },
    });
    addFromBase(battlesBase, {
        id: 'battles_2500',
        name: 'Endless Combatant',
        desc: 'Fight 2,500 total battles.',
        target: 2500,
        rewards: { gold: 700000, gems: 70, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(battlesBase, {
        id: 'battles_5000',
        name: 'Avatar of War',
        desc: 'Fight 5,000 total battles.',
        target: 5000,
        rewards: { gold: 1800000, gems: 160, lootbox: { id: 'lootbox_legendary', qty: 1 }, premium: { id: 'iron_fortress', days: 14 } },
    });

    const goldBase = ACHIEVEMENTS.find((a) => a.id === 'gold_1000000');
    addFromBase(goldBase, {
        id: 'gold_2500000',
        name: 'Imperial Vault',
        desc: 'Earn 2,500,000 total gold.',
        target: 2500000,
        rewards: { gold: 500000, gems: 50, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(goldBase, {
        id: 'gold_5000000',
        name: 'Kingmaker Treasury',
        desc: 'Earn 5,000,000 total gold.',
        target: 5000000,
        rewards: { gold: 1000000, gems: 120, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });
    addFromBase(goldBase, {
        id: 'gold_10000000',
        name: 'Golden Empire',
        desc: 'Earn 10,000,000 total gold.',
        target: 10000000,
        rewards: { gold: 2500000, gems: 250, premium: { id: 'fortune_hunter', days: 21 } },
    });

    const floorBase = ACHIEVEMENTS.find((a) => a.id === 'floor_50');
    addFromBase(floorBase, {
        id: 'floor_75',
        name: 'Nether Ascendant',
        desc: 'Reach dungeon floor 75.',
        target: 75,
        rewards: { gold: 400000, gems: 90, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(floorBase, {
        id: 'floor_100',
        name: 'Hundred-Floor Horror',
        desc: 'Reach dungeon floor 100.',
        target: 100,
        rewards: { gold: 750000, gems: 150, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });
    addFromBase(floorBase, {
        id: 'floor_150',
        name: 'Master of the Abyss',
        desc: 'Reach dungeon floor 150.',
        target: 150,
        rewards: { gold: 1500000, gems: 260, premium: { id: 'iron_fortress', days: 21 } },
    });
    addFromBase(floorBase, {
        id: 'floor_200',
        name: 'Dungeon Godslayer',
        desc: 'Reach dungeon floor 200.',
        target: 200,
        rewards: { gold: 3000000, gems: 400, lootbox: { id: 'lootbox_legendary', qty: 2 }, premium: { id: 'fortune_hunter', days: 30 } },
    });

    const mpBase = ACHIEVEMENTS.find((a) => a.id === 'mp_5000');
    addFromBase(mpBase, {
        id: 'mp_10000',
        name: 'Arcane Marathon',
        desc: 'Spend 10,000 total MP.',
        target: 10000,
        rewards: { gold: 350000, gems: 50, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(mpBase, {
        id: 'mp_25000',
        name: 'Mana Furnace',
        desc: 'Spend 25,000 total MP.',
        target: 25000,
        rewards: { gold: 900000, gems: 120, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });
    addFromBase(mpBase, {
        id: 'mp_50000',
        name: 'Engine of Progress',
        desc: 'Spend 50,000 total MP.',
        target: 50000,
        rewards: { gold: 2000000, gems: 220, premium: { id: 'apprentice', days: 30 } },
    });

    const missionWinsBase = ACHIEVEMENTS.find((a) => a.id === 'mission_wins_250');
    addFromBase(missionWinsBase, {
        id: 'mission_wins_1000',
        name: 'Campaign Veteran',
        desc: 'Win 1,000 missions.',
        target: 1000,
        rewards: { gold: 400000, gems: 45, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(missionWinsBase, {
        id: 'mission_wins_2500',
        name: 'Contract Emperor',
        desc: 'Win 2,500 missions.',
        target: 2500,
        rewards: { gold: 1200000, gems: 120, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });
    addFromBase(missionWinsBase, {
        id: 'mission_wins_5000',
        name: 'Unstoppable Expedition',
        desc: 'Win 5,000 missions.',
        target: 5000,
        rewards: { gold: 2500000, gems: 240, premium: { id: 'fortune_hunter', days: 21 } },
    });

    const missionSpotsBase = ACHIEVEMENTS.find((a) => a.id === 'mission_spots_10');
    addFromBase(missionSpotsBase, {
        id: 'mission_spots_15',
        name: 'Master Pathfinder',
        desc: 'Fight in all 15 mission locations.',
        target: 15,
        rewards: { gold: 75000, gems: 18, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    extras.push(
        {
            id: 'mission_fights_25',
            chain: 'mission_fights_total',
            category: 'missions',
            name: 'First Contract Rush',
            desc: 'Fight 25 missions.',
            icon: '🧾',
            metric: 'mission_fights_total',
            target: 25,
            rewards: { gold: 8000, consumable: { id: 'potion_mana', qty: 2 } },
        },
        {
            id: 'mission_fights_100',
            chain: 'mission_fights_total',
            category: 'missions',
            name: 'Road Worn',
            desc: 'Fight 100 missions.',
            icon: '🥾',
            metric: 'mission_fights_total',
            target: 100,
            rewards: { gold: 30000, lootbox: { id: 'lootbox_common', qty: 1 } },
        },
        {
            id: 'mission_fights_500',
            chain: 'mission_fights_total',
            category: 'missions',
            name: 'Campaign Machine',
            desc: 'Fight 500 missions.',
            icon: '⚙️',
            metric: 'mission_fights_total',
            target: 500,
            rewards: { gold: 175000, gems: 18, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'mission_fights_2000',
            chain: 'mission_fights_total',
            category: 'missions',
            name: 'Endless March',
            desc: 'Fight 2,000 missions.',
            icon: '🚩',
            metric: 'mission_fights_total',
            target: 2000,
            rewards: { gold: 900000, gems: 80, lootbox: { id: 'lootbox_epic', qty: 1 } },
        }
    );

    const dungeonKillsBase = ACHIEVEMENTS.find((a) => a.id === 'dungeon_kills_300');
    addFromBase(dungeonKillsBase, {
        id: 'dungeon_kills_1000',
        name: 'Nightmare Reaper',
        desc: 'Defeat 1,000 dungeon monsters.',
        target: 1000,
        rewards: { gold: 400000, gems: 50, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(dungeonKillsBase, {
        id: 'dungeon_kills_2500',
        name: 'Catacomb Catastrophe',
        desc: 'Defeat 2,500 dungeon monsters.',
        target: 2500,
        rewards: { gold: 1200000, gems: 125, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });
    addFromBase(dungeonKillsBase, {
        id: 'dungeon_kills_5000',
        name: 'Lord of the Underdeep',
        desc: 'Defeat 5,000 dungeon monsters.',
        target: 5000,
        rewards: { gold: 2500000, gems: 240, premium: { id: 'iron_fortress', days: 21 } },
    });

    const skeletonBase = ACHIEVEMENTS.find((a) => a.id === 'skeleton_kills_15');
    addFromBase(skeletonBase, {
        id: 'skeleton_kills_50',
        name: 'Bonecrusher',
        desc: 'Defeat 50 Skeleton Warriors in the dungeon.',
        target: 50,
        rewards: { gold: 45000, gems: 6, lootbox: { id: 'lootbox_common', qty: 1 } },
    });
    addFromBase(skeletonBase, {
        id: 'skeleton_kills_150',
        name: 'Marrow Shatterer',
        desc: 'Defeat 150 Skeleton Warriors in the dungeon.',
        target: 150,
        rewards: { gold: 150000, gems: 20, lootbox: { id: 'lootbox_rare', qty: 1 } },
    });
    addFromBase(skeletonBase, {
        id: 'skeleton_kills_500',
        name: 'Graveyard Extinction',
        desc: 'Defeat 500 Skeleton Warriors in the dungeon.',
        target: 500,
        rewards: { gold: 500000, gems: 60, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });

    const wraithBase = ACHIEVEMENTS.find((a) => a.id === 'void_wraith_kills_10');
    addFromBase(wraithBase, {
        id: 'void_wraith_kills_25',
        name: 'Shade Hunter',
        desc: 'Defeat 25 Void Wraiths in the dungeon.',
        target: 25,
        rewards: { gold: 90000, gems: 16, lootbox: { id: 'lootbox_rare', qty: 1 } },
    });
    addFromBase(wraithBase, {
        id: 'void_wraith_kills_100',
        name: 'Wraith Exorcist',
        desc: 'Defeat 100 Void Wraiths in the dungeon.',
        target: 100,
        rewards: { gold: 300000, gems: 45, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(wraithBase, {
        id: 'void_wraith_kills_250',
        name: 'Nether Exterminator',
        desc: 'Defeat 250 Void Wraiths in the dungeon.',
        target: 250,
        rewards: { gold: 800000, gems: 110, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });

    const winsBase = ACHIEVEMENTS.find((a) => a.id === 'wins_2500');
    addFromBase(winsBase, {
        id: 'wins_5000',
        name: 'Arena Tyrant',
        desc: 'Reach 5,000 victories.',
        target: 5000,
        rewards: { gold: 3000000, gems: 320, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });
    addFromBase(winsBase, {
        id: 'wins_10000',
        name: 'Immortal Gladiator',
        desc: 'Reach 10,000 victories.',
        target: 10000,
        rewards: { gold: 6000000, gems: 600, premium: { id: 'fortune_hunter', days: 30 } },
    });

    const spotMilestoneDefs = [
        { target: 25, suffix: 'Veteran', rewards: { gold: 35000, gems: 4, lootbox: { id: 'lootbox_common', qty: 1 } } },
        { target: 100, suffix: 'Master', rewards: { gold: 125000, gems: 12, lootbox: { id: 'lootbox_rare', qty: 1 } } },
        { target: 250, suffix: 'Legend', rewards: { gold: 400000, gems: 30, lootbox: { id: 'lootbox_epic', qty: 1 } } },
    ];
    ACHIEVEMENTS
        .filter((a) => a.metric === 'mission_spot_wins' && a.target === 10)
        .forEach((base) => {
            spotMilestoneDefs.forEach((tier) => {
                extras.push({
                    ...base,
                    id: `${base.metric_key}_wins_${tier.target}`,
                    name: `${base.metric_label} ${tier.suffix}`,
                    desc: `Win ${tier.target} missions at ${base.metric_label}.`,
                    target: tier.target,
                    rewards: tier.rewards,
                });
            });
        });

    extras.push(
        {
            id: 'raids_participated_1',
            chain: 'raids_participated',
            category: 'raids',
            name: 'First Into the Breach',
            desc: 'Participate in 1 raid.',
            icon: '⚔️',
            metric: 'raids_participated',
            target: 1,
            rewards: { gold: 10000, gems: 2 },
        },
        {
            id: 'raids_participated_5',
            chain: 'raids_participated',
            category: 'raids',
            name: 'Raid Regular',
            desc: 'Participate in 5 raids.',
            icon: '🛡️',
            metric: 'raids_participated',
            target: 5,
            rewards: { gold: 35000, lootbox: { id: 'lootbox_common', qty: 1 } },
        },
        {
            id: 'raids_participated_15',
            chain: 'raids_participated',
            category: 'raids',
            name: 'Siegeborn',
            desc: 'Participate in 15 raids.',
            icon: '🏰',
            metric: 'raids_participated',
            target: 15,
            rewards: { gold: 110000, gems: 12, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'raids_participated_40',
            chain: 'raids_participated',
            category: 'raids',
            name: 'Vanguard of the Guild',
            desc: 'Participate in 40 raids.',
            icon: '🏹',
            metric: 'raids_participated',
            target: 40,
            rewards: { gold: 325000, gems: 35, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'raids_participated_100',
            chain: 'raids_participated',
            category: 'raids',
            name: 'Raid Legend',
            desc: 'Participate in 100 raids.',
            icon: '👑',
            metric: 'raids_participated',
            target: 100,
            rewards: { gold: 900000, gems: 110, lootbox: { id: 'lootbox_legendary', qty: 1 } },
        },
        {
            id: 'raids_won_1',
            chain: 'raids_won',
            category: 'raids',
            name: 'Boss Breaker',
            desc: 'Win 1 raid.',
            icon: '🏆',
            metric: 'raids_won',
            target: 1,
            rewards: { gold: 12000, gems: 3 },
        },
        {
            id: 'raids_won_3',
            chain: 'raids_won',
            category: 'raids',
            name: 'Boss Hunter',
            desc: 'Win 3 raids.',
            icon: '💥',
            metric: 'raids_won',
            target: 3,
            rewards: { gold: 40000, lootbox: { id: 'lootbox_common', qty: 1 } },
        },
        {
            id: 'raids_won_10',
            chain: 'raids_won',
            category: 'raids',
            name: 'Raid Victor',
            desc: 'Win 10 raids.',
            icon: '🔥',
            metric: 'raids_won',
            target: 10,
            rewards: { gold: 125000, gems: 15, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'raids_won_25',
            chain: 'raids_won',
            category: 'raids',
            name: 'Citadel Crusher',
            desc: 'Win 25 raids.',
            icon: '⚡',
            metric: 'raids_won',
            target: 25,
            rewards: { gold: 360000, gems: 40, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'raids_won_60',
            chain: 'raids_won',
            category: 'raids',
            name: 'Myth of the Six',
            desc: 'Win 60 raids.',
            icon: '🌟',
            metric: 'raids_won',
            target: 60,
            rewards: { gold: 1000000, gems: 130, lootbox: { id: 'lootbox_legendary', qty: 1 } },
        },
        {
            id: 'hard_missions_5',
            chain: 'hard_missions_completed',
            category: 'missions',
            name: 'Danger Seeker',
            desc: 'Win 5 hard missions.',
            icon: '⚠️',
            metric: 'hard_missions_completed',
            target: 5,
            rewards: { gold: 20000, consumable: { id: 'special_mana_potion', qty: 1 } },
        },
        {
            id: 'hard_missions_25',
            chain: 'hard_missions_completed',
            category: 'missions',
            name: 'Hazard Collector',
            desc: 'Win 25 hard missions.',
            icon: '☠️',
            metric: 'hard_missions_completed',
            target: 25,
            rewards: { gold: 85000, gems: 10, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'hard_missions_100',
            chain: 'hard_missions_completed',
            category: 'missions',
            name: 'Calamity Walker',
            desc: 'Win 100 hard missions.',
            icon: '🌋',
            metric: 'hard_missions_completed',
            target: 100,
            rewards: { gold: 350000, gems: 45, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'elemental_kills_10',
            chain: 'elemental_kills',
            category: 'combat',
            name: 'Spark of Power',
            desc: 'Win 10 battles while dealing elemental damage.',
            icon: '⚡',
            metric: 'elemental_kills',
            target: 10,
            rewards: { gold: 12000, consumable: { id: 'potion_mana', qty: 2 } },
        },
        {
            id: 'elemental_kills_50',
            chain: 'elemental_kills',
            category: 'combat',
            name: 'Stormcaller',
            desc: 'Win 50 battles while dealing elemental damage.',
            icon: '🌩️',
            metric: 'elemental_kills',
            target: 50,
            rewards: { gold: 60000, gems: 8, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'elemental_kills_200',
            chain: 'elemental_kills',
            category: 'combat',
            name: 'Elemental Cataclysm',
            desc: 'Win 200 battles while dealing elemental damage.',
            icon: '🌪️',
            metric: 'elemental_kills',
            target: 200,
            rewards: { gold: 275000, gems: 35, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'gems_earn_25',
            chain: 'gems_earned',
            category: 'wealth',
            name: 'Gem Seeker',
            desc: 'Earn 25 gems from missions.',
            icon: '💎',
            metric: 'mission_gems_earned',
            target: 25,
            rewards: { gold: 15000, lootbox: { id: 'lootbox_common', qty: 1 } },
        },
        {
            id: 'gems_earn_100',
            chain: 'gems_earned',
            category: 'wealth',
            name: 'Crystal Touch',
            desc: 'Earn 100 gems from missions.',
            icon: '🔷',
            metric: 'mission_gems_earned',
            target: 100,
            rewards: { gold: 75000, consumable: { id: 'special_mana_potion', qty: 2 } },
        },
        {
            id: 'gems_earn_500',
            chain: 'gems_earned',
            category: 'wealth',
            name: 'Crown Jeweler',
            desc: 'Earn 500 gems from missions.',
            icon: '👑',
            metric: 'mission_gems_earned',
            target: 500,
            rewards: { gold: 350000, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'gems_earn_1500',
            chain: 'gems_earned',
            category: 'wealth',
            name: 'Radiant Treasury',
            desc: 'Earn 1,500 gems from missions.',
            icon: '💠',
            metric: 'mission_gems_earned',
            target: 1500,
            rewards: { gold: 1200000, lootbox: { id: 'lootbox_legendary', qty: 1 }, premium: { id: 'apprentice', days: 21 } },
        },
        {
            id: 'monster_types_5',
            chain: 'monster_types_total_dungeon',
            category: 'dungeon',
            name: 'Bestiary Starter',
            desc: 'Defeat 5 different monster types in the dungeon.',
            icon: '📖',
            metric: 'monster_types_total',
            metric_source: 'dungeon',
            target: 5,
            rewards: { gold: 18000, lootbox: { id: 'lootbox_common', qty: 1 } },
        },
        {
            id: 'monster_types_10',
            chain: 'monster_types_total_dungeon',
            category: 'dungeon',
            name: 'Catalog of Horrors',
            desc: 'Defeat 10 different monster types in the dungeon.',
            icon: '🕮',
            metric: 'monster_types_total',
            metric_source: 'dungeon',
            target: 10,
            rewards: { gold: 90000, gems: 12, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'monster_types_20',
            chain: 'monster_types_total_dungeon',
            category: 'dungeon',
            name: 'Scholar of the Abyss',
            desc: 'Defeat 20 different monster types in the dungeon.',
            icon: '🧠',
            metric: 'monster_types_total',
            metric_source: 'dungeon',
            target: 20,
            rewards: { gold: 250000, gems: 40, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'shieldless_wins_10',
            chain: 'wins_without_shield',
            category: 'class',
            name: 'Light on Your Feet',
            desc: 'Win 10 battles as a rogue without a shield equipped.',
            icon: '🗡️',
            metric: 'wins_without_shield',
            target: 10,
            rewards: { gold: 18000, consumable: { id: 'potion_mana', qty: 2 } },
        },
        {
            id: 'shieldless_wins_50',
            chain: 'wins_without_shield',
            category: 'class',
            name: 'Untouchable Rogue',
            desc: 'Win 50 battles as a rogue without a shield equipped.',
            icon: '🦊',
            metric: 'wins_without_shield',
            target: 50,
            rewards: { gold: 85000, gems: 10, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'shieldless_wins_200',
            chain: 'wins_without_shield',
            category: 'class',
            name: 'Shadow Duelist',
            desc: 'Win 200 battles as a rogue without a shield equipped.',
            icon: '🌒',
            metric: 'wins_without_shield',
            target: 200,
            rewards: { gold: 300000, gems: 35, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'physical_only_wins_10',
            chain: 'physical_only_wins',
            category: 'combat',
            name: 'Bare Steel',
            desc: 'Win 10 battles without dealing any elemental damage.',
            icon: '⚔️',
            metric: 'physical_only_wins',
            target: 10,
            rewards: { gold: 15000, consumable: { id: 'potion_mana', qty: 2 } },
        },
        {
            id: 'physical_only_wins_50',
            chain: 'physical_only_wins',
            category: 'combat',
            name: 'Pure Duelist',
            desc: 'Win 50 battles using only physical damage.',
            icon: '🛡️',
            metric: 'physical_only_wins',
            target: 50,
            rewards: { gold: 70000, gems: 8, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'physical_only_wins_200',
            chain: 'physical_only_wins',
            category: 'combat',
            name: 'Master of Steel',
            desc: 'Win 200 battles using only physical damage.',
            icon: '🏛️',
            metric: 'physical_only_wins',
            target: 200,
            rewards: { gold: 275000, gems: 30, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'referrals_1',
            chain: 'referrals_registered',
            category: 'community',
            name: 'First Recruit',
            desc: 'Refer 1 player to Battle Arena.',
            icon: '🤝',
            metric: 'referrals_registered',
            target: 1,
            rewards: { gold: 5000, gems: 5 },
        },
        {
            id: 'referrals_3',
            chain: 'referrals_registered',
            category: 'community',
            name: 'Arena Scout',
            desc: 'Refer 3 players to Battle Arena.',
            icon: '📯',
            metric: 'referrals_registered',
            target: 3,
            rewards: { gold: 15000, lootbox: { id: 'lootbox_common', qty: 1 } },
        },
        {
            id: 'referrals_10',
            chain: 'referrals_registered',
            category: 'community',
            name: 'Crowd Caller',
            desc: 'Refer 10 players to Battle Arena.',
            icon: '🎺',
            metric: 'referrals_registered',
            target: 10,
            rewards: { gold: 75000, gems: 20, lootbox: { id: 'lootbox_rare', qty: 1 } },
        },
        {
            id: 'referrals_level5_1',
            chain: 'referrals_level5',
            category: 'community',
            name: 'Mentor Spark',
            desc: 'Have 1 referred player reach level 5.',
            icon: '🌟',
            metric: 'referrals_level5',
            target: 1,
            rewards: { gold: 10000, gems: 5 },
        },
        {
            id: 'referrals_level5_5',
            chain: 'referrals_level5',
            category: 'community',
            name: 'Battle Mentor',
            desc: 'Have 5 referred players reach level 5.',
            icon: '🧭',
            metric: 'referrals_level5',
            target: 5,
            rewards: { gold: 60000, gems: 25, lootbox: { id: 'lootbox_epic', qty: 1 } },
        },
        {
            id: 'referrals_level5_15',
            chain: 'referrals_level5',
            category: 'community',
            name: 'Arena Patron',
            desc: 'Have 15 referred players reach level 5.',
            icon: '👑',
            metric: 'referrals_level5',
            target: 15,
            rewards: { gold: 250000, gems: 80, lootbox: { id: 'lootbox_legendary', qty: 1 } },
        }
    );

    const referralsBase = ACHIEVEMENTS.find((a) => a.id === 'referrals_10');
    addFromBase(referralsBase, {
        id: 'referrals_25',
        name: 'Herald of the Arena',
        desc: 'Refer 25 players to Battle Arena.',
        target: 25,
        rewards: { gold: 250000, gems: 60, lootbox: { id: 'lootbox_epic', qty: 1 } },
    });
    addFromBase(referralsBase, {
        id: 'referrals_50',
        name: 'Architect of the Crowd',
        desc: 'Refer 50 players to Battle Arena.',
        target: 50,
        rewards: { gold: 900000, gems: 180, lootbox: { id: 'lootbox_legendary', qty: 1 }, premium: { id: 'fortune_hunter', days: 14 } },
    });

    const referralsLevelBase = ACHIEVEMENTS.find((a) => a.id === 'referrals_level5_15');
    addFromBase(referralsLevelBase, {
        id: 'referrals_level5_30',
        name: 'Guild Builder',
        desc: 'Have 30 referred players reach level 5.',
        target: 30,
        rewards: { gold: 600000, gems: 140, lootbox: { id: 'lootbox_legendary', qty: 1 } },
    });
    addFromBase(referralsLevelBase, {
        id: 'referrals_level5_60',
        name: 'Arena Founder',
        desc: 'Have 60 referred players reach level 5.',
        target: 60,
        rewards: { gold: 1800000, gems: 320, premium: { id: 'apprentice', days: 30 }, lootbox: { id: 'lootbox_legendary', qty: 2 } },
    });

    return extras;
}

ACHIEVEMENTS.push(...buildExtendedAchievements());

async function buildAchievementMetricSnapshot(db, char) {
    const [missionRows, monsterRows, referralRow, raidRow] = await Promise.all([
        dbAll(db, 'SELECT fights, wins, spot_id FROM character_mission_spot_stats WHERE char_id = ?', [char.id]),
        dbAll(db, 'SELECT source, monster_key, kills FROM character_monster_stats WHERE char_id = ?', [char.id]),
        char.user_id
            ? dbGet(db, 'SELECT referrals_registered, referrals_level5 FROM users WHERE id = ?', [char.user_id])
            : Promise.resolve(null),
        dbGet(db, `SELECT
                COUNT(CASE WHEN gr.status = 'completed' THEN 1 END) AS raids_participated,
                COUNT(CASE WHEN gr.status = 'completed' AND gm.reward_payload IS NOT NULL THEN 1 END) AS raids_won
            FROM guild_raid_members gm
            JOIN guild_raids gr ON gr.id = gm.raid_id
            WHERE gm.char_id = ?`, [char.id])
    ]);

    const missionTotals = {
        wins: 0,
        fights: 0,
        discovered: missionRows.length,
        bySpot: {},
    };
    for (const row of missionRows) {
        const wins = Number(row.wins || 0);
        const fights = Number(row.fights || 0);
        missionTotals.wins += wins;
        missionTotals.fights += fights;
        missionTotals.bySpot[row.spot_id] = { wins, fights };
    }

    const monsterTotals = {
        all: { kills: 0, keys: new Set(), byKey: {} },
        bySource: {},
    };
    for (const row of monsterRows) {
        const source = row.source || 'unknown';
        const key = row.monster_key;
        const kills = Number(row.kills || 0);
        monsterTotals.all.kills += kills;
        if (key) {
            monsterTotals.all.keys.add(key);
            monsterTotals.all.byKey[key] = (monsterTotals.all.byKey[key] || 0) + kills;
        }
        if (!monsterTotals.bySource[source]) {
            monsterTotals.bySource[source] = { kills: 0, keys: new Set(), byKey: {} };
        }
        monsterTotals.bySource[source].kills += kills;
        if (key) {
            monsterTotals.bySource[source].keys.add(key);
            monsterTotals.bySource[source].byKey[key] = (monsterTotals.bySource[source].byKey[key] || 0) + kills;
        }
    }

    return {
        wins: char.wins || 0,
        battles: (char.wins || 0) + (char.losses || 0),
        gold_earned: char.total_gold_earned || 0,
        gems_earned: char.total_gems_earned || 0,
        mission_gems_earned: char.mission_gems_earned || 0,
        mp_spent: char.total_mp_spent || 0,
        dungeon_floor: char.dungeon_highest_floor || 1,
        hard_missions_completed: char.hard_missions_completed || 0,
        elemental_kills: char.elemental_kills || 0,
        physical_only_wins: char.physical_only_wins || 0,
        wins_without_shield: char.wins_without_shield || 0,
        raids_participated: Number(raidRow?.raids_participated || 0),
        raids_won: Number(raidRow?.raids_won || 0),
        referrals_registered: Number(referralRow?.referrals_registered || 0),
        referrals_level5: Number(referralRow?.referrals_level5 || 0),
        missionTotals,
        monsterTotals,
    };
}

async function getAchievementMetricValue(db, char, achievement, snapshot = null) {
    const metrics = snapshot || await buildAchievementMetricSnapshot(db, char);
    const metric = achievement.metric;
    if (metric === 'wins') return metrics.wins;
    if (metric === 'battles') return metrics.battles;
    if (metric === 'gold_earned') return metrics.gold_earned;
    if (metric === 'gems_earned') return metrics.gems_earned;
    if (metric === 'mission_gems_earned') return metrics.mission_gems_earned;
    if (metric === 'mp_spent') return metrics.mp_spent;
    if (metric === 'dungeon_floor') return metrics.dungeon_floor;
    if (metric === 'hard_missions_completed') return metrics.hard_missions_completed;
    if (metric === 'elemental_kills') return metrics.elemental_kills;
    if (metric === 'physical_only_wins') return metrics.physical_only_wins;
    if (metric === 'wins_without_shield') return metrics.wins_without_shield;
    if (metric === 'raids_participated') return metrics.raids_participated;
    if (metric === 'raids_won') return metrics.raids_won;
    if (metric === 'referrals_registered') return metrics.referrals_registered;
    if (metric === 'referrals_level5') return metrics.referrals_level5;

    if (metric === 'mission_wins_total') return metrics.missionTotals.wins;
    if (metric === 'mission_fights_total') return metrics.missionTotals.fights;
    if (metric === 'mission_spots_discovered') return metrics.missionTotals.discovered;

    if (metric === 'mission_spot_wins' || metric === 'mission_spot_fights') {
        if (!achievement.metric_key) return 0;
        const row = metrics.missionTotals.bySpot[achievement.metric_key];
        if (!row) return 0;
        return metric === 'mission_spot_wins' ? row.wins : row.fights;
    }

    if (metric === 'monster_kills_total' || metric === 'monster_types_total' || metric === 'monster_kills') {
        const sourceMetrics = achievement.metric_source
            ? (metrics.monsterTotals.bySource[achievement.metric_source] || { kills: 0, keys: new Set(), byKey: {} })
            : metrics.monsterTotals.all;
        if (metric === 'monster_kills_total') return sourceMetrics.kills;
        if (metric === 'monster_types_total') return sourceMetrics.keys.size;
        if (!achievement.metric_key) return 0;
        return sourceMetrics.byKey[achievement.metric_key] || 0;
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
        { id:'venomfang',        name:'Venomfang',          emoji:'🐍', desc:'Each hit poisons for 8% bonus damage per round for 5h.',  effect:'poison',          value:0.08 },
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

async function getGuildRaidMembers(db, raidId) {
    return dbAll(db, `SELECT m.*,
            COALESCE(c.name, m.member_name) AS name,
            COALESCE(c.class, m.member_class) AS class,
            COALESCE(c.level, m.member_level, 1) AS level
        FROM guild_raid_members m
        LEFT JOIN characters c ON c.id = m.char_id
        WHERE m.raid_id = ?
        ORDER BY m.joined_at ASC, m.char_id ASC`, [raidId]);
}

async function getGuildRaidById(db, raidId) {
    return dbGet(db, 'SELECT * FROM guild_raids WHERE id = ?', [raidId]);
}

async function getOpenRaidForLeader(db, leaderCharId) {
    return dbGet(db, `SELECT * FROM guild_raids
        WHERE leader_char_id = ? AND status = 'forming'
        ORDER BY created_at DESC LIMIT 1`, [leaderCharId]);
}

async function getActiveRaidMembershipForUser(db, userId) {
    return dbGet(db, `SELECT gr.id, gr.status
        FROM guild_raid_members gm
        JOIN guild_raids gr ON gr.id = gm.raid_id
        WHERE gm.user_id = ? AND gr.status = 'forming'
        LIMIT 1`, [userId]);
}

async function getActiveRaidMembershipForChar(db, charId) {
    return dbGet(db, `SELECT gr.id, gr.status
        FROM guild_raid_members gm
        JOIN guild_raids gr ON gr.id = gm.raid_id
        WHERE gm.char_id = ? AND gr.status = 'forming'
        LIMIT 1`, [charId]);
}

async function getCharacterBusyState(db, char) {
    const now = Math.floor(Date.now() / 1000);
    const raidCooldownUntil = Number(char.raid_cooldown_until || 0);
    if (raidCooldownUntil > now) {
        return { busy: true, reason: `Raid cooldown active for ${Math.ceil((raidCooldownUntil - now) / 3600)}h.` };
    }
    return { busy: false, reason: '' };
}

function buildRaidRewardPayload(floor, includeItem = false) {
    const safeFloor = Math.max(1, Number(floor) || 1);
    const gold = 900 + safeFloor * 220;
    const gems = 1;
    const payload = { gold, gems };
    if (includeItem) {
        payload.lootbox = { id: 'lootbox_rare', qty: 1 };
    }
    return payload;
}

function buildRaidBossFighter(raid) {
    return {
        id: `raid_boss_${raid.id}`,
        name: raid.boss_name,
        class: 'raid_boss',
        hp: Number(raid.boss_hp || 1),
        dmgMin: Math.max(1, Math.round((raid.boss_atk || 1) * 0.78)),
        dmgMax: Math.max(2, Math.round((raid.boss_atk || 1) * 1.18)),
        strength: Number(raid.boss_atk || 1),
        agility: Math.max(12, Math.round((raid.floor || 1) * 1.5) + 10),
        magic: Math.round((raid.boss_atk || 1) * 0.55),
        defense: Number(raid.boss_def || 0),
        hit_chance: Math.min(95, 28 + Number(raid.floor || 1)),
        crit_chance: Math.min(35, 8 + Math.floor(Number(raid.floor || 1) / 3)),
        armor: Number(raid.boss_def || 0),
        elem_dmg: { pyro: 0, water: 0, wind: 0, electro: 0 },
        elem_resist: { pyro: 0, water: 0, wind: 0, electro: 0 },
        skillEffects: {},
        skillMods: {},
        activeSkills: {},
        attackZones: DEFAULT_ATTACK_ZONES,
        blockZones: DEFAULT_BLOCK_ZONES,
        dualWield: false,
    };
}

function buildRaidPartyFighter(raidId, members, fighters) {
    const base = {
        id: `raid_party_${raidId}`,
        name: 'Raid Party',
        class: 'raid_party',
        hp: 0,
        dmgMin: 0,
        dmgMax: 0,
        strength: 0,
        agility: 0,
        magic: 0,
        defense: 0,
        hit_chance: 0,
        crit_chance: 0,
        armor: 0,
        elem_dmg: { pyro: 0, water: 0, wind: 0, electro: 0 },
        elem_resist: { pyro: 0, water: 0, wind: 0, electro: 0 },
        skillEffects: {},
        skillMods: {},
        activeSkills: {},
        attackZones: DEFAULT_ATTACK_ZONES,
        blockZones: DEFAULT_BLOCK_ZONES,
        dualWield: false,
    };
    for (const fighter of fighters) {
        base.hp += Number(fighter.hp || 0);
        base.dmgMin += Number(fighter.dmgMin || 0);
        base.dmgMax += Number(fighter.dmgMax || 0);
        base.strength += Number(fighter.strength || 0);
        base.agility += Number(fighter.agility || 0);
        base.magic += Number(fighter.magic || 0);
        base.defense += Number(fighter.defense || 0);
        base.hit_chance += Number(fighter.hit_chance || 0);
        base.crit_chance += Number(fighter.crit_chance || 0);
        base.armor += Number(fighter.armor || 0);
        for (const elem of ELEMENTS) {
            base.elem_dmg[elem] += Number(fighter.elem_dmg?.[elem] || 0);
            base.elem_resist[elem] += Number(fighter.elem_resist?.[elem] || 0);
        }
    }
    const count = Math.max(1, fighters.length);
    base.hit_chance = Math.min(95, Math.round(base.hit_chance / count));
    base.crit_chance = Math.min(60, Math.round(base.crit_chance / count));
    return base;
}

function getGuildRaidAutoStartThreshold(raid) {
    const autoMode = String(raid?.auto_start_mode || 'manual');
    if (autoMode.startsWith('count_')) {
        return Math.max(1, Math.min(GUILD_RAID_MAX_MEMBERS, Number(autoMode.split('_')[1] || 0)));
    }
    if (autoMode === 'full') {
        return GUILD_RAID_MAX_MEMBERS;
    }
    return 0;
}

async function finalizeGuildRaid(db, raid, members) {
    if (!raid || !['forming', 'starting'].includes(String(raid.status || '')) || !members?.length) return raid;
    const now = Math.floor(Date.now() / 1000);
    if (String(raid.status || '') === 'forming') {
        const claim = await dbRun(
            db,
            'UPDATE guild_raids SET status = ?, started_at = ? WHERE id = ? AND status = ?',
            ['starting', now, raid.id, 'forming']
        );
        const claimed = claim?.rowsAffected ?? claim?.changes ?? 0;
        if (!claimed) return getGuildRaidById(db, raid.id);
        raid = await getGuildRaidById(db, raid.id);
        if (!raid) return null;
    }
    const fighters = [];
    const memberChars = [];
    for (const member of members) {
        if (Number(member.is_npc || 0) !== 0) {
            let payload = null;
            try { payload = member.member_payload ? JSON.parse(member.member_payload) : null; } catch {}
            if (payload?.fighter) {
                fighters.push(payload.fighter);
            }
            continue;
        }
        const char = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [member.char_id]);
        if (!char) continue;
        await applyHpRegen(db, char.id);
        const refreshed = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        if (!refreshed) continue;
        memberChars.push(refreshed);
        fighters.push(await buildCombatFighter(db, refreshed));
    }
    if (!fighters.length) {
        await dbRun(db, 'UPDATE guild_raids SET status = ?, completed_at = ? WHERE id = ?', ['completed', now, raid.id]);
        return getGuildRaidById(db, raid.id);
    }

    const party = buildRaidPartyFighter(raid.id, members, fighters);
    const boss = buildRaidBossFighter(raid);
    const battle = runBattle(party, boss, null, { guaranteedHit: true });
    const raidWon = String(battle.winnerId) === String(party.id);
    const totalHpBefore = fighters.reduce((sum, fighter) => sum + Number(fighter.hp || 0), 0);
    const hpRatio = totalHpBefore > 0 ? Math.max(0, Math.min(1, Number(battle.hpRemainingA || 0) / totalHpBefore)) : 0;
    const raidCooldownUntil = now + GUILD_RAID_GLOBAL_COOLDOWN;
    const resultSummary = raidWon
        ? `${party.name} defeated ${raid.boss_name} on Floor ${raid.floor}.`
        : `${raid.boss_name} crushed the party on Floor ${raid.floor}.`;
    const reportBody = [
        resultSummary,
        '',
        `Boss: ${raid.boss_name}`,
        `Floor: ${raid.floor}`,
        `Party size: ${members.length}`,
        '',
        ...(battle.log || [])
    ].join('\n');

    for (let i = 0; i < memberChars.length; i++) {
        const char = memberChars[i];
        const fighter = fighters[i];
        const rewardPayload = raidWon ? buildRaidRewardPayload(raid.floor, Math.random() < 0.5) : null;
        const nextHp = raidWon
            ? Math.max(1, Math.floor(Number(fighter.hp || 1) * hpRatio))
            : Math.max(0, Math.floor(Number(fighter.hp || 1) * hpRatio));
        await dbRun(
            db,
            'UPDATE characters SET hp_current = ?, raid_cooldown_until = ? WHERE id = ?',
            [nextHp, raidCooldownUntil, char.id]
        );
        await dbRun(
            db,
            'UPDATE guild_raid_members SET reward_payload = ? WHERE raid_id = ? AND char_id = ?',
            [rewardPayload ? JSON.stringify(rewardPayload) : null, raid.id, char.id]
        );
        await dbRun(
            db,
            `INSERT INTO messages (sender_id, receiver_id, sender_label, subject, body, reward_payload, reward_claimed, system_message)
             VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
            [
                char.id,
                char.id,
                'Guild Raid Board',
                `Raid Report: Floor ${raid.floor} ${raidWon ? 'Victory' : 'Defeat'}`,
                reportBody,
                rewardPayload ? JSON.stringify(rewardPayload) : null
            ]
        );
    }

    await dbRun(
        db,
        'UPDATE guild_raids SET status = ?, completed_at = ?, result_summary = ?, result_log = ? WHERE id = ?',
        ['completed', now, resultSummary, JSON.stringify(battle.log || []), raid.id]
    );
    return getGuildRaidById(db, raid.id);
}

async function tryStartGuildRaidIfReady(db, raidId, options = {}) {
    const forceStart = options.forceStart === true;
    let raid = await getGuildRaidById(db, raidId);
    if (!raid || String(raid.status || '') !== 'forming') return raid;
    const members = await getGuildRaidMembers(db, raidId);
    if (!members.length) return raid;
    if (!forceStart) {
        const threshold = getGuildRaidAutoStartThreshold(raid);
        if (threshold <= 0 || members.length < threshold) {
            return raid;
        }
    }
    return finalizeGuildRaid(db, raid, members);
}

async function maybeAutoStartGuildRaids(db) {
    const formingRaids = await dbAll(db, `SELECT gr.*,
        (SELECT COUNT(*) FROM guild_raid_members gm WHERE gm.raid_id = gr.id) AS member_count
        FROM guild_raids gr
        WHERE gr.status = 'forming'
        ORDER BY gr.created_at ASC`);
    for (const raid of formingRaids) {
        const threshold = getGuildRaidAutoStartThreshold(raid);
        if (threshold <= 0 || Number(raid.member_count || 0) < threshold) continue;
        await tryStartGuildRaidIfReady(db, raid.id);
    }
}

async function buildGuildRaidView(db, raid, viewerCharId, viewerUserId) {
    const members = await getGuildRaidMembers(db, raid.id);
    const viewerMember = members.find(m => String(m.char_id) === String(viewerCharId) || String(m.user_id) === String(viewerUserId)) || null;
    const autoStartMode = String(raid.auto_start_mode || 'manual');
    const autoStartPlayers = autoStartMode.startsWith('count_')
        ? Math.max(1, Math.min(GUILD_RAID_MAX_MEMBERS, Number(autoStartMode.split('_')[1] || 0)))
        : autoStartMode === 'full'
            ? GUILD_RAID_MAX_MEMBERS
            : 0;
    const mercenaryPool = await ensureRaidMercenaryPool(db, raid);
    return {
        id: raid.id,
        floor: Number(raid.floor || 1),
        bossName: raid.boss_name,
        bossImage: raid.boss_image || '',
        bossHp: Number(raid.boss_hp || 0),
        bossAtk: Number(raid.boss_atk || 0),
        bossDef: Number(raid.boss_def || 0),
        status: raid.status,
        autoStartMode,
        autoStartPlayers,
        createdAt: Number(raid.created_at || 0),
        startedAt: Number(raid.started_at || 0),
        completedAt: Number(raid.completed_at || 0),
        resultSummary: raid.result_summary || '',
        mercenaryPool,
        memberCount: members.length,
        isLeader: String(raid.leader_char_id) === String(viewerCharId),
        isMember: !!viewerMember,
        members: members.map(member => ({
            charId: member.char_id,
            userId: member.user_id,
            name: member.name,
            class: member.class,
            level: member.level,
            isNpc: Number(member.is_npc || 0) !== 0,
            joinedAt: Number(member.joined_at || 0),
            claimedAt: Number(member.claimed_at || 0),
            isLeader: String(member.char_id) === String(raid.leader_char_id),
        })),
    };
}

async function getGuildRaidList(db, viewerCharId, viewerUserId) {
    await maybeAutoStartGuildRaids(db);
    const raids = await dbAll(db, `SELECT * FROM guild_raids
        WHERE status = 'forming'
        ORDER BY created_at DESC
        LIMIT 12`);
    const payload = [];
    for (const raid of raids) {
        payload.push(await buildGuildRaidView(db, raid, viewerCharId, viewerUserId));
    }
    return payload;
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

async function recordDamageStyleWin(db, charId, elementalDamageTotal) {
    if (!charId) return;
    if ((elementalDamageTotal || 0) > 0) {
        await dbRun(db, 'UPDATE characters SET elemental_kills = elemental_kills + 1 WHERE id=?', [charId]);
    } else {
        await dbRun(db, 'UPDATE characters SET physical_only_wins = physical_only_wins + 1 WHERE id=?', [charId]);
    }
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
    const dmg = { pyro:0, water:0, wind:0, electro:0 };
    const setBonuses = getEquippedSetBonuses(equippedItems);
    for (const elem of ELEMENTS) {
        dmg[elem] += setBonuses[`${elem}_dmg`] || 0;
    }
    for (const item of equippedItems) {
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
    const resist = { pyro:0, water:0, wind:0, electro:0 };
    const setBonuses = getEquippedSetBonuses(equippedItems);
    for (const elem of ELEMENTS) {
        resist[elem] += setBonuses[`${elem}_resist`] || 0;
    }
    for (const item of equippedItems) {
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
            remaining: shieldValue
        };
    }
    
    return {
        active: false,
        value: 0,
        remaining: 0
    };
}

function applyMagicDamageModifiers(attacker, defender) {
    let damageBonus = 0;
    let resistance = 0;
    
    // Magic adds bonus damage. For mages, that bonus is applied to elemental damage later.
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

    const defAgi = (defender.agility || 0) * (1 + (defender.agility_bonus || 0));
    const totalHitStat = Math.max(0, (attacker.hit_chance || 0) + (attacker.hit_bonus || 0));
    const zoneAdjustedHitStat = totalHitStat * hit.hitChance;
    const effectiveDefAgi = defAgi * 0.5;
    let atkHitChance = Math.max(0.05, Math.min(0.95, (zoneAdjustedHitStat - effectiveDefAgi + 50) / 100));
    if (atkPenalty) atkHitChance = Math.max(0.05, atkHitChance * 0.85);
    if (hasSkill(atkSkills, 'war_cry') && roundNum <= 3) atkHitChance = 1.0;
    if (ignoreDefenderZones) atkHitChance = 1.0;

    let dodgeChance = 0;
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
        const magicToElemental = attacker.class === 'mage';
        physicalDmg = Math.max(0, physicalDmg + (magicToElemental ? 0 : damageBonus) - resistance);

        const blockCovers = !ignoreDefenderZones && (blk.protects.includes(atkZone) || blk.protects.includes('any'));
        const blockFails = Math.random() < 0.001;

        const elemDmgs = attacker.elem_dmg || {};
        let mageElemBonusApplied = false;
        for (const elem of ELEMENTS) {
            let ed = elemDmgs[elem] || 0;
            if (ed <= 0) continue;
            if (hasSkill(atkSkills, 'arcane_surge')) ed = Math.floor(ed * 1.20);
            if (hasSkill(atkSkills, 'hex')) ed = Math.floor(ed * 1.15);
            if (magicToElemental && !mageElemBonusApplied) {
                ed += damageBonus;
                mageElemBonusApplied = true;
            }
            const elemResist = (defender.elem_resist || {})[elem] || 0;
            const magicResist = Math.floor((defender.magic || 0) * 0.05);
            ed = Math.max(0, ed - elemResist - magicResist);
            totalElemDmg += Math.floor(ed);
        }

        const critTag = isCrit ? ' ⚡CRIT' : '';

        if (magicToElemental) {
            const mageBaseElemRaw = Math.max(1, Math.floor((rawPhysicalDmg * hit.dmgMult * atkBonusDmg) * 0.05));
            const avgElemResist = Math.floor(ELEMENTS.reduce((sum, elem) => sum + ((defender.elem_resist || {})[elem] || 0), 0) / ELEMENTS.length);
            const magicResist = Math.floor((defender.magic || 0) * 0.05);
            const mageBaseElemDmg = Math.max(0, mageBaseElemRaw - avgElemResist - magicResist);
            totalElemDmg += mageBaseElemDmg;
        }

        if (blockCovers && !blockFails) {
            logLine = `Round ${roundNum}: ${attacker.name} hits${critTag} — BLOCKED`;
            totalElemDmg = 0; 
        } else {
            finalDmg = physicalDmg;

            if (finalDmg > 0 && (defender.armor || 0) > 0) {
                const physReduction = Math.min(finalDmg - 1, defender.armor);
                finalDmg = Math.max(1, finalDmg - physReduction);
            }

            if (totalElemDmg > 0) finalDmg += totalElemDmg;
            let venomfangBonus = 0;
            if (hasSkill(atkSkills, 'venomfang')) {
                const venomfangPct = CLASS_SKILLS[attacker.class]?.find(s => s.id === 'venomfang')?.value || 0.08;
                venomfangBonus = Math.max(1, Math.round(finalDmg * venomfangPct));
                finalDmg += venomfangBonus;
            }

            let justAbsorbed = false;
            let absorbedAmount = 0;
            if (defenderShield && defenderShield.active && defenderShield.remaining > 0 && finalDmg > 0) {
                absorbedAmount = Math.min(defenderShield.remaining, finalDmg);
                finalDmg -= absorbedAmount;
                defenderShield.remaining -= absorbedAmount;
                justAbsorbed = true;
            }

            logLine = `Round ${roundNum}: ${attacker.name} lands a hit${critTag} — ${Math.floor(finalDmg)} damage`;
            if (totalElemDmg > 0) logLine += ` including ${Math.floor(totalElemDmg)} elemental damage`;
            if (venomfangBonus > 0) logLine += ` ☠️ (+${venomfangBonus} poison)`;

            if (justAbsorbed) {
                if (finalDmg <= 0) {
                    logLine = `Round ${roundNum}: ${attacker.name} attacks — ✨ FORCE FIELD absorbed ${absorbedAmount} damage!`;
                } else {
                    logLine = `Round ${roundNum}: ${attacker.name} attacks — ✨ FORCE FIELD absorbed ${absorbedAmount} damage! ${Math.floor(finalDmg)} gets through`;
                }
                if (defenderShield.remaining <= 0) logLine += ` 💔 Force field shatters!`;
            }

            if (justAbsorbed && defenderShield.remaining > 0) {
                logLine += ` ${defenderShield.remaining} durability remains.`;
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
function runBattle(fighterA, fighterB, forceWinnerId = null, options = {}) {
    if (options?.guaranteedHit) {
        fighterA = {
            ...fighterA,
            ignoreDefenderZones: true,
            hit_chance: 100,
            attackZones: Array(10).fill('chest'),
            blockZones: Array(10).fill('no_block')
        };
        fighterB = {
            ...fighterB,
            ignoreDefenderZones: true,
            hit_chance: 100,
            attackZones: Array(10).fill('chest'),
            blockZones: Array(10).fill('no_block')
        };
    }
    const log = [];
    let hpA = fighterA.hp, hpB = fighterB.hp;
    let penaltyA = false, penaltyB = false;
    let totalDmgToA = 0, totalDmgToB = 0;
    let totalElemDmgDealtA = 0;
    let totalElemDmgDealtB = 0;
    
    let shieldA = calculateMagicShield(fighterB, fighterA);
    let shieldB = calculateMagicShield(fighterA, fighterB);

    log.push(`⚔️  ${fighterA.name}  vs  ${fighterB.name}`);
    const skA = Object.keys(fighterA.activeSkills || {});
    const skB = Object.keys(fighterB.activeSkills || {});
    if (skA.length) log.push(`✨ ${fighterA.name}'s active skills: ${skA.join(', ')}`);
    if (skB.length) log.push(`✨ ${fighterB.name}'s active skills: ${skB.join(', ')}`);
    
    if (shieldA.active) log.push(`✨ ${fighterA.name}'s magic creates a force field with ${shieldA.value} durability!`);
    if (shieldB.active) log.push(`✨ ${fighterB.name}'s magic creates a force field with ${shieldB.value} durability!`);
    log.push('---');

    let roundEndedPrematurely = false;
    let winnerId = null;
    let roundsCompleted = 0;

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
        totalElemDmgDealtB += resB.totalElemDmg;
        
        totalDmgToA += dmgToA;
        totalDmgToB += dmgToB;
        roundsCompleted = round;
        
        hpA = Math.min(fighterA.hpMax || 9999, Math.max(0, hpA - dmgToA + (resA.healBack || 0)));
        hpB = Math.min(fighterB.hpMax || 9999, Math.max(0, hpB - dmgToB + (resB.healBack || 0)));
        
        log.push(resA.logLine);
        log.push(resB.logLine);
        penaltyA = resB.nextAtkPenalty;
        penaltyB = resA.nextAtkPenalty;
        
        if (hpA <= 0 || hpB <= 0) {
            roundEndedPrematurely = true;
            if (hpA <= 0 && hpB <= 0) {
                log.push(`Round ${round}: Both fighters fall simultaneously!`);
                winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
            } else if (hpA <= 0) {
                log.push(`Round ${round}: ${fighterA.name} has fallen!`);
                winnerId = fighterB.id;
            } else {
                log.push(`Round ${round}: ${fighterB.name} has fallen!`);
                winnerId = fighterA.id;
            }
            break;
        }
        if (round < 10) log.push('---');
    }
    
    // Handle tutorial/forced wins
    if (forceWinnerId) {
        if (roundEndedPrematurely) {
            if (winnerId !== forceWinnerId) {
                // If we need fighterA to win but fighterB won by KO
                // This is rare in tutorial, but we handle it by "faking" fighterB's survival
                if (forceWinnerId === fighterA.id) {
                    hpA = Math.max(1, hpA);
                    hpB = 0;
                    winnerId = fighterA.id;
                    // Replace the "fallen" line or just add one
                    log.push(`Round ${log.length}: ${fighterB.name} has fallen!`);
                } else {
                    hpB = Math.max(1, hpB);
                    hpA = 0;
                    winnerId = fighterB.id;
                    log.push(`Round ${log.length}: ${fighterA.name} has fallen!`);
                }
            }
        } else {
            // Winner decided by damage race
            if (forceWinnerId === fighterA.id && totalDmgToB < totalDmgToA) {
                // Swap or nudge damage totals
                const originalTotalB = totalDmgToB;
                totalDmgToB = totalDmgToA + Math.floor(Math.random() * 5) + 1;
                // Add the extra damage to the last round or just fudge it
            } else if (forceWinnerId === fighterB.id && totalDmgToA < totalDmgToB) {
                totalDmgToA = totalDmgToB + Math.floor(Math.random() * 5) + 1;
            }
            winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
        }
    } else if (!roundEndedPrematurely) {
        winnerId = totalDmgToB >= totalDmgToA ? fighterA.id : fighterB.id;
    }

    log.push('---');
    if (winnerId === fighterA.id) {
        log.push(`${roundEndedPrematurely ? `After ${roundsCompleted} rounds` : 'After 10 rounds'}: ${fighterA.name} dealt ${totalDmgToB} damage, ${fighterB.name} dealt ${totalDmgToA} damage`);
        log.push(`Winner: ${roundEndedPrematurely ? fighterA.name + ' wins!' : fighterA.name + ' wins by dealing more damage!'}`);
    } else {
        log.push(`${roundEndedPrematurely ? `After ${roundsCompleted} rounds` : 'After 10 rounds'}: ${fighterB.name} dealt ${totalDmgToA} damage, ${fighterA.name} dealt ${totalDmgToB} damage`);
        log.push(`Winner: ${roundEndedPrematurely ? fighterB.name + ' wins!' : fighterB.name + ' wins by dealing more damage!'}`);
    }
    
    return {
        log,
        winnerId,
        hpRemainingA: hpA,
        hpRemainingB: hpB,
        totalDmgToA,
        totalDmgToB,
        totalElemDmgDealt: totalElemDmgDealtA,
        totalElemDmgDealtA,
        totalElemDmgDealtB
    };
}

function createTutorialBattleResult(playerFighter, npc) {
    const playerStartHp = Math.max(1, playerFighter.hp || playerFighter.hpMax || 1);
    const npcStartHp = Math.max(12, npc.hp || npc.hpMax || 12);
    const opener = Math.min(
        npcStartHp - 1,
        Math.max(6, Math.floor((playerFighter.dmgMax || playerFighter.dmgMin || 8) * 0.75))
    );
    const counter = Math.min(
        Math.max(1, playerStartHp - 1),
        Math.max(1, Math.floor((npc.dmgMin || 4) * 0.35))
    );
    const finisher = Math.max(1, npcStartHp - opener);
    const hpAfterCounter = Math.max(1, playerStartHp - counter);
        return {
            winnerId: playerFighter.id,
            hpRemainingA: hpAfterCounter,
            hpRemainingB: 0,
            totalDmgToA: counter,
            totalDmgToB: npcStartHp,
            totalElemDmgDealt: 0,
            totalElemDmgDealtA: 0,
            totalElemDmgDealtB: 0,
            log: [
            `🎓 Tutorial battle begins against ${npc.name}.`,
            `${playerFighter.name} lands a clean opening hit for ${opener} damage. ${npc.name} has ${finisher} HP left.`,
            `${npc.name} strikes back for ${counter} damage, but ${playerFighter.name} stays in control at ${hpAfterCounter} HP.`,
            `${playerFighter.name} answers with a finishing blow for ${finisher} damage.`,
            `✨ Tutorial victory! You win the lesson and claim your reward.`
        ]
    };
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
    
    // Calculate base stats (scales with effective level) - reduced for easier early game
    const baseHp = 60 + (effectiveLevel * 20);
    const baseDmgMin = 8 + (effectiveLevel * 0.5);
    const baseDmgMax = 16 + (effectiveLevel * 0.8);
    const baseAgi = 8 + (effectiveLevel * 0.3);
    const baseMagic = 6 + (effectiveLevel * 0.2);
    const baseVitality = 8 + (effectiveLevel * 0.3);
    const baseHitChance = 70 + (effectiveLevel * 0.2);
    const baseCritChance = 5 + (effectiveLevel * 0.1);
    const baseArmor = 5 + (effectiveLevel * 0.2);
    
    // Apply difficulty multipliers
    const hp = Math.floor(baseHp * mult.hpMult);
    const dmgMin = Math.floor(baseDmgMin * mult.dmgMult);
    const dmgMax = Math.floor(baseDmgMax * mult.dmgMult);
    const agility = Math.floor(baseAgi * mult.agiMult);
    const magic = Math.floor(baseMagic * mult.dmgMult);
    const vitality = Math.floor(baseVitality * mult.hpMult);
    const hit_chance = Math.min(85, Math.floor(baseHitChance));
    const crit_chance = Math.min(30, Math.floor(baseCritChance * mult.dmgMult));
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

    const elemDmg = calcElemDmg(equippedArray);
    const elemResist = calcElemResist(char, equippedArray);

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
    { id:'potion_light_hp',    name:'Light Health Potion',     emoji:'🧪', level:5,  price:200,  priceType:'gold', desc:'Restores 100 HP.',          effect:{ type:'heal', value:100 }, consumable:true, category:'consumable' },
    { id:'potion_light_agi',   name:'Light Agility Draught',   emoji:'⚗️', level:5,  price:250,  priceType:'gold', desc:'+3 Agility for session.',   effect:{ type:'temp_stat', stat:'agility',  value:3 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_hp', name:'Health Potion',           emoji:'🧪', level:10, price:450,  priceType:'gold', desc:'Restores 200 HP.',          effect:{ type:'heal', value:200 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_str',name:'Strength Elixir',         emoji:'⚗️', level:10, price:550,  priceType:'gold', desc:'+5 Strength for session.',  effect:{ type:'temp_stat', stat:'strength', value:5 }, consumable:true, category:'consumable' },
    { id:'potion_moderate_mag',name:"Mage's Focus Tonic",      emoji:'🔮', level:10, price:550,  priceType:'gold', desc:'+5 Magic for session.',     effect:{ type:'temp_stat', stat:'magic',    value:5 }, consumable:true, category:'consumable' },
    { id:'potion_greater_hp',  name:'Greater Health Potion',   emoji:'🧪', level:20, price:900,  priceType:'gold', desc:'Restores 300 HP.',          effect:{ type:'heal', value:300 }, consumable:true, category:'consumable' },
    { id:'potion_greater_def', name:'Greater Defense Tonic',   emoji:'🧴', level:20, price:1100, priceType:'gold', desc:'+8 Defense for session.',   effect:{ type:'temp_stat', stat:'defense',  value:8 }, consumable:true, category:'consumable' },
    { id:'potion_greater_agi', name:'Greater Agility Draught', emoji:'⚗️', level:20, price:1100, priceType:'gold', desc:'+8 Agility for session.',   effect:{ type:'temp_stat', stat:'agility',  value:8 }, consumable:true, category:'consumable' },
    { id:'potion_superior_hp', name:'Superior Health Potion',  emoji:'🧪', level:35, price:2200, priceType:'gold', desc:'Restores 500 HP.',          effect:{ type:'heal', value:500 }, consumable:true, category:'consumable' },
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
    const metricSnapshot = await buildAchievementMetricSnapshot(db, char);
    const items = [];
    for (const def of ACHIEVEMENTS) {
        const progress = await getAchievementMetricValue(db, char, def, metricSnapshot);
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

async function getWeeklyClaimableCount(db, char) {
    try {
        const cacheKey = `${char.id}:${getCurrentWeekStart()}`;
        const cached = _weeklyClaimableCountCache.get(cacheKey);
        const nowMs = Date.now();
        if (cached && (nowMs - cached.at) < 30000) {
            return cached.value;
        }
        const weeklyState = await ensureWeeklyTaskState(db, char);
        const weekStart = Number(weeklyState?.week_start || getCurrentWeekStart());
        const claimedRows = await dbAll(db, 'SELECT task_id FROM character_weekly_claims WHERE char_id = ? AND week_start = ?', [char.id, weekStart]);
        const claimedSet = new Set(claimedRows.map(r => r.task_id));

        let count = 0;
        for (const task of WEEKLY_TASKS) {
            if (claimedSet.has(task.id)) continue;
            const progress = await getWeeklyTaskProgress(db, char, weeklyState, task.metric);
            if (progress >= task.target) {
                count++;
            }
        }
        _weeklyClaimableCountCache.set(cacheKey, { value: count, at: nowMs });
        return count;
    } catch (e) {
        console.error('Error getting weekly claimable count:', e);
        return 0;
    }
}

async function buildCharacterResponse(char, db) {
    const equippedObj   = await getEquippedItems(db, char.id);
    const equippedArray = await getEquippedItemsArray(db, char.id);
const userSettings = char.user_id
        ? await dbGet(db, 'SELECT username, assistant_enabled, skip_battle_animations, pending_referral_gold, pending_referral_gems, referrals_registered, referrals_level5, inbox_badge_messages, inbox_badge_battles, inbox_badge_missions, chat_enabled, inbox_autoread_messages, inbox_autoread_battles, inbox_autoread_missions, profile_pic FROM users WHERE id = ?', [char.user_id])
        : null;
    const pendingReferralGold = Number(userSettings?.pending_referral_gold || 0);
    const pendingReferralGems = Number(userSettings?.pending_referral_gems || 0);
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
    let eventInfo = activeEvent ? { ...GLOBAL_EVENTS[0], ends_at: activeEvent.ends_at } : null;
    try {
        const db = await getDb();
        const bannerRows = await db.execute({ sql: `SELECT * FROM banner_events WHERE start_at <= ? AND end_at > ? LIMIT 1`, args: [now, now] });
        if (bannerRows.rows.length > 0) {
            const b = bannerRows.rows[0];
            eventInfo = { key: 'banner', name: b.name, desc: `Banner event: ${b.name}`, ends_at: b.end_at, isBanner: true };
        }
    } catch (e) { console.error('banner check:', e); }

    const armorValue = calcArmorValue(char, equippedArray);
    const elemDmg    = calcElemDmg(equippedArray);
    const elemResist = calcElemResist(char, equippedArray);

    // Rogue no-shield agility bonus
    let noShieldAgiBonus = 0;
    if (char.class === 'rogue') {  // Use 'char' here since that's the parameter name in buildCharacterResponse
        const hasShield = !!equippedObj.shield;
        if (!hasShield) {
            // 5% agility bonus when no shield equipped
            noShieldAgiBonus = Math.floor((char.agility || 0) * 0.05);
        }
    }

    const weeklyClaimableCount = await getWeeklyClaimableCount(db, char);

    return {
        ...withTrain,
        tutorial_skipped: char.tutorial_skipped || 0,
        wins:         (char.wins        || 0),
        losses:       (char.losses      || 0),
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
        mp_last_regen_at: char.mp_last_regen_at || 0,
        daily_mp_spent: dailyMpSpent,
        skills_unlocked: skillsUnlocked,
        active_skills: activeSkills,
        skill_last_used: skillLastUsed,
        class_skills: CLASS_SKILLS[char.class] || [],
        attack_zones: char.attack_zones || null,
        block_zones:  char.block_zones  || null,
        equipped:     equippedObj,
        last_regen_at: char.last_regen_at || 0,
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
        weekly_claimable_count: weeklyClaimableCount,
        assistant_enabled: Number(userSettings?.assistant_enabled ?? 1) !== 0,
        skip_battle_animations: Number(userSettings?.skip_battle_animations ?? 0) !== 0,
        referral_code: userSettings?.username || null,
        referrals_registered: Number(userSettings?.referrals_registered || 0),
        referrals_level5: Number(userSettings?.referrals_level5 || 0),
        pending_referral_gold: pendingReferralGold,
        pending_referral_gems: pendingReferralGems,
        global_cooldown_until: Number(char.global_cooldown_until || 0),
        inbox_badge_messages: Number(userSettings?.inbox_badge_messages ?? 1) !== 0,
        inbox_badge_battles: Number(userSettings?.inbox_badge_battles ?? 1) !== 0,
        inbox_badge_missions: Number(userSettings?.inbox_badge_missions ?? 1) !== 0,
        chat_enabled: Number(userSettings?.chat_enabled ?? 1) !== 0,
inbox_autoread_messages: Number(userSettings?.inbox_autoread_messages ?? 0) !== 0,
        inbox_autoread_battles: Number(userSettings?.inbox_autoread_battles ?? 0) !== 0,
        inbox_autoread_missions: Number(userSettings?.inbox_autoread_missions ?? 0) !== 0,
        profile_pic: char.profile_pic || `${char.class}.png`,
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

router.post('/tutorial/skip', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        console.log('Before skip - tutorial_skipped:', char.tutorial_skipped);
        
        // Skip tutorial - set flag
        await db.execute({ sql: 'UPDATE characters SET tutorial_skipped = 1 WHERE id = ?', args: [char.id] });
        console.log('After skip - updated');
        
        const updated = await getCurrentCharacter(db, req.user.userId);
        console.log('After skip - tutorial_skipped:', updated.tutorial_skipped);
        
        return res.json({ success: true, character: await buildCharacterResponse(updated, db) });
    } catch (e) {
        console.error('skip tutorial error:', e);
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

router.get('/profile-pics', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'class, unlocked_profile_pics');
        if (!char) return res.status(404).json({ error: 'No character found' });
        
        const unlocked = JSON.parse(char.unlocked_profile_pics || '[]');
        const defaultPic = `${char.class}.png`;
        
        const allPics = [
            { id: defaultPic, name: 'Default', class: char.class, unlocked: true }
        ];
        
        // Add unlocked themed pics
        for (const picId of unlocked) {
            allPics.push({
                id: `${picId}.png`,
                name: picId.split('-')[1] ? picId.split('-')[1].charAt(0).toUpperCase() + picId.split('-')[1].slice(1) : picId,
                class: picId.split('-')[0],
                unlocked: true
            });
        }
        
        res.json({ 
            current: defaultPic,
            available: allPics 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/profile-pic/set', auth, async (req, res) => {
    try {
        const db = await getDb();
        const { profilePic } = req.body;
        if (!profilePic) return res.status(400).json({ error: 'No profile pic specified' });
        
        const char = await getCurrentCharacter(db, req.user.userId, 'id, class, unlocked_profile_pics');
        if (!char) return res.status(404).json({ error: 'No character found' });
        
        const unlocked = JSON.parse(char.unlocked_profile_pics || '[]');
        const defaultPic = `${char.class}.png`;
        const targetPic = profilePic.replace('.png', '');
        
        // Check if valid (either default or unlocked)
        const isDefault = targetPic === defaultPic.replace('.png', '');
        const isUnlocked = unlocked.includes(targetPic);
        
        if (!isDefault && !isUnlocked) {
            return res.status(403).json({ error: 'Profile pic not unlocked' });
        }
        
        // Store selected pic on character
        await dbRun(db, 'UPDATE characters SET profile_pic = ? WHERE id = ?', [profilePic, char.id]);
        
        res.json({ success: true, profilePic });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/referrals/claim', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });

        const userRewards = await dbGet(
            db,
            'SELECT pending_referral_gold, pending_referral_gems FROM users WHERE id = ?',
            [req.user.userId]
        );
        const pendingGold = Number(userRewards?.pending_referral_gold || 0);
        const pendingGems = Number(userRewards?.pending_referral_gems || 0);
        if (pendingGold <= 0 && pendingGems <= 0) {
            return res.status(400).json({ error: 'No referral rewards are waiting to be claimed.' });
        }

        await dbRun(
            db,
            `UPDATE characters
             SET gold = gold + ?,
                 gems = gems + ?,
                 total_gold_earned = total_gold_earned + ?,
                 total_gems_earned = COALESCE(total_gems_earned, 0) + ?
             WHERE id = ?`,
            [pendingGold, pendingGems, pendingGold, pendingGems, char.id]
        );
        await dbRun(
            db,
            'UPDATE users SET pending_referral_gold = 0, pending_referral_gems = 0 WHERE id = ?',
            [req.user.userId]
        );

        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        const rewardBits = [];
        if (pendingGold > 0) rewardBits.push(`${pendingGold} gold`);
        if (pendingGems > 0) rewardBits.push(`${pendingGems} gems`);
        res.json({
            success: true,
            message: `Claimed referral rewards: ${rewardBits.join(' and ')}.`,
            character: await buildCharacterResponse(freshChar, db)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/settings', auth, async (req, res) => {
    try {
        const db = await getDb();
        const updates = [];
        const args = [];

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'assistantEnabled')) {
            updates.push('assistant_enabled = ?');
            args.push(req.body.assistantEnabled ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'skipBattleAnimations')) {
            updates.push('skip_battle_animations = ?');
            args.push(req.body.skipBattleAnimations ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'inboxBadgeMessages')) {
            updates.push('inbox_badge_messages = ?');
            args.push(req.body.inboxBadgeMessages ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'inboxBadgeBattles')) {
            updates.push('inbox_badge_battles = ?');
            args.push(req.body.inboxBadgeBattles ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'inboxBadgeMissions')) {
            updates.push('inbox_badge_missions = ?');
            args.push(req.body.inboxBadgeMissions ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'chatEnabled')) {
            updates.push('chat_enabled = ?');
            args.push(req.body.chatEnabled ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'inboxAutoReadMessages')) {
            updates.push('inbox_autoread_messages = ?');
            args.push(req.body.inboxAutoReadMessages ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'inboxAutoReadBattles')) {
            updates.push('inbox_autoread_battles = ?');
            args.push(req.body.inboxAutoReadBattles ? 1 : 0);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'inboxAutoReadMissions')) {
            updates.push('inbox_autoread_missions = ?');
            args.push(req.body.inboxAutoReadMissions ? 1 : 0);
        }
        if (!updates.length) {
            return res.status(400).json({ error: 'No settings provided.' });
        }

        args.push(req.user.userId);
        await dbRun(db, `UPDATE users SET ${updates.join(', ')} WHERE id = ?`, args);

        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.json({ success: true });
        const freshChar = await dbGet(db, 'SELECT * FROM characters WHERE id = ?', [char.id]);
        res.json({ success: true, character: await buildCharacterResponse(freshChar, db) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
        invalidateWeeklyClaimableCountCache(char.id);

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
        const now = Math.floor(Date.now() / 1000);
        const { zoneId, spotId, missionIdx, size: reqSize } = req.body;
        const character = await getCurrentCharacter(db, userId);
        if (!character) return res.status(404).json({ error: 'Character not found' });
        const activeTraining = await dbGet(db, 'SELECT * FROM skill_training WHERE char_id = ? AND ends_at > ?',
            [character.id, now]);
        if (activeTraining) {
            return res.status(400).json({ error: 'Cannot start missions while training skills. Complete or cancel training first.' });
        }
        if (Number(character.global_cooldown_until || 0) > now) {
            const remain = Number(character.global_cooldown_until || 0) - now;
            return res.status(400).json({ error: `Raid recovery active for ${remain < 3600 ? Math.ceil(remain / 60) + 'm' : Math.ceil(remain / 3600) + 'h'}.` });
        }

        const currentMap = character.current_map || 'overworld';
        let zone;

        if (currentMap === 'abyss') {
            zone = ABYSS_ZONES[zoneId];
        } else {
            zone = ZONES[zoneId];
        }

        if (!zone) return res.status(404).json({ error: 'Zone not found' });

        const spot = zone.spots.find(s => s.id === spotId);
        if (!spot) return res.status(404).json({ error: 'Spot not found' });

// Tutorial Lock Check: Wins < 4 only allows Easy (unless skipped)
const isTutorial = isTutorialCharacter(character);
if (isTutorial && (spot.difficulty === 'medium' || spot.difficulty === 'hard')) {
    return res.status(403).json({ error: 'Tutorial: You must complete 4 battles before attempting Medium or Hard missions.' });
}

// Only small missions for tutorial (first 4 wins)
if (isTutorial && reqSize && reqSize !== 'small') {
    return res.status(403).json({ error: 'Tutorial: Only Small missions are available until you win 4 battles.' });
}

const sizeKey = isTutorial ? 'small' : (['small', 'medium', 'large'].includes(reqSize) ? reqSize : 'small');
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
        const missionName = (missionIdx !== undefined && missionList[missionIdx]) ? missionList[missionIdx] : missionList[Math.floor(Math.random() * missionList.length)];
        
        const activePrem = getActivePremium(character);
        const baseDuration = sizeConf.duration;
        let duration = eventHas('short_missions') ? Math.max(30, Math.floor(baseDuration / 2)) : baseDuration;
        if (hasPremium(activePrem, 'fortune_hunter')) duration = Math.max(30, Math.floor(duration * 0.50));
        
        // Tutorial force duration
        if (isTutorial) duration = 10;
        
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
                pyro:    (calcElemDmg(equippedArray).pyro    || 0) + (skillPassives.pyro_dmg    || 0),
                water:   (calcElemDmg(equippedArray).water   || 0) + (skillPassives.water_dmg   || 0),
                wind:    (calcElemDmg(equippedArray).wind    || 0) + (skillPassives.wind_dmg    || 0),
                electro: (calcElemDmg(equippedArray).electro || 0) + (skillPassives.electro_dmg || 0),
            },
            elem_resist: {
                pyro:    (calcElemResist(freshChar, equippedArray).pyro    || 0) + (skillPassives.pyro_resist    || 0),
                water:   (calcElemResist(freshChar, equippedArray).water   || 0) + (skillPassives.water_resist   || 0),
                wind:    (calcElemResist(freshChar, equippedArray).wind    || 0) + (skillPassives.wind_resist    || 0),
                electro: (calcElemResist(freshChar, equippedArray).electro || 0) + (skillPassives.electro_resist || 0),
            },
            skillEffects: skillActives,
            skillMods: skillMods,
            activeSkills: charActiveSkills,
            attackZones: JSON.parse(freshChar.attack_zones || 'null') || DEFAULT_ATTACK_ZONES,
            blockZones: JSON.parse(freshChar.block_zones || 'null') || DEFAULT_BLOCK_ZONES,
            dualWield: freshChar.class === 'rogue' && rogueHasDualWield(learnedIds),
        };
        
        const isTutorial = isTutorialCharacter(freshChar);

        // Build NPC and override its name with the mission name
        const npc = buildNpc(mission.difficulty, freshChar.level, zoneLevel, playerStats);
        const npcName = getNPCNameFromMission(mission.mission_name);
        npc.name = npcName;
        npc.class = 'npc';  // Add class for mage penalty check (not a mage)
        
        // Force win for new characters (first 4 battles)
        let forceWinnerId = null;
        if (isTutorial) {
            forceWinnerId = freshChar.id;
        }
        
        const battle = isTutorial
            ? createTutorialBattleResult(playerFighter, npc)
            : runBattle(playerFighter, npc, forceWinnerId);
        let playerWon = battle.winnerId === freshChar.id;
        
        // Add tutorial note if we used forceWinnerId to flip a loss
        if (forceWinnerId && isTutorial) {
            if (!battle.log.some(line => line.includes('Tutorial victory'))) {
                battle.log.push('✨ Tutorial victory - experience gained!');
            }
        }
        
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
        
        let goldEarned;
        let xpEarned;
        if (isTutorial) {
            goldEarned = 250;
            xpEarned = 1;
        } else {
            goldEarned = playerWon ? mission.gold_reward : Math.floor(mission.gold_reward * 0.10);
            xpEarned = playerWon ? mission.xp_reward : 0;

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
        }
        
        const gemChance = isTutorial ? 0 : (isEvent ? 0.15 : 0.05);
        let gemsFound = 0;
        if (playerWon && Math.random() < gemChance) gemsFound = 1;

        // Tutorial Check: Don't deplete HP for the first 4 battles
        const newHp = isTutorial ? (freshChar.hp_current ?? playerFighter.hpMax) : Math.max(0, battle.hpRemainingA);

        let newXp = (freshChar.xp || 0) + xpEarned, newLevel = freshChar.level, leveledUp = false;
        while (newXp >= LEVEL_XP(newLevel)) { newXp -= LEVEL_XP(newLevel); newLevel++; leveledUp = true; }
        let newWins = freshChar.wins + (playerWon ? 1 : 0);
        let newLosses = freshChar.losses + (playerWon ? 0 : 1);

        let tutorialMessage = null;
        if (isTutorial && newWins === 4) {
            tutorialMessage = "✨ Tutorial complete! Your character is now ready for the real challenge. Note: Further missions will now affect your HP. Check the 'Upgrade' tab to build your stats, the 'Shop' to buy items, and your 'Inventory' to manage your gear!";
        }

        // Handle level up: reset HP to full and give loot box
        let levelUpMessage = null;
        let finalHp = newHp;
        if (leveledUp) {
            const equippedArray = await getEquippedItemsArray(db, freshChar.id);
            const newCharWithLevel = { ...freshChar, level: newLevel };
            const newHpMax = calcHpMax(newCharWithLevel, equippedArray);
            finalHp = newHpMax;
            
            // Give a common loot box for leveling up
            const lootBox = LOOT_BOXES.find(box => box.id === 'lootbox_common');
            if (lootBox) {
                await addStackableInventoryItem(db, freshChar.id, 'consumable', lootBox, 1);
            }
            levelUpMessage = `🎉 Level Up! You reached level ${newLevel}! HP restored to full and you received a Common Loot Box!`;
        }

        const missionClaimResult = await dbRun(
            db,
            'DELETE FROM active_missions WHERE character_id = ? AND started_at = ? AND ends_at = ?',
            [freshChar.id, mission.started_at, mission.ends_at]
        );
        const claimedMission = missionClaimResult?.rowsAffected ?? missionClaimResult?.changes ?? 0;
        if (!claimedMission) {
            return res.status(409).json({ error: 'Mission rewards already collected.' });
        }

        await dbRun(db, `UPDATE characters SET xp=?,gold=gold+?,gems=gems+?,level=?,wins=?,losses=?,hp_current=?,total_gold_earned=total_gold_earned+?,total_gems_earned=COALESCE(total_gems_earned, 0)+?,mission_gems_earned=COALESCE(mission_gems_earned, 0)+? WHERE id=?`,
            [newXp, goldEarned, gemsFound, newLevel, newWins, newLosses, finalHp, goldEarned, gemsFound, gemsFound, freshChar.id]);
        await handleReferralLevelMilestone(db, freshChar.user_id, freshChar.level, newLevel);
        
        // ── Skill tree stat tracking ───────────────────────────────────────
        if (playerWon && mission.difficulty === 'hard') {
            await dbRun(db, 'UPDATE characters SET hard_missions_completed = hard_missions_completed + 1 WHERE id=?', [freshChar.id]);
        }
        if (playerWon) {
            await dbRun(db, 'UPDATE characters SET total_missions_completed = total_missions_completed + 1 WHERE id=?', [freshChar.id]);
        }
        if (playerWon) {
            await recordDamageStyleWin(db, freshChar.id, battle.totalElemDmgDealtA || battle.totalElemDmgDealt || 0);
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
        const addMaterialDrop = async (mat, qty) => {
            const existing = await dbGet(db, `SELECT * FROM inventory WHERE char_id=? AND item_type='raw_mat' AND json_extract(item_data,'$.id')=?`, [freshChar.id, mat.id]);
            if (existing) {
                const d = JSON.parse(existing.item_data);
                d.qty = (d.qty || 1) + qty;
                await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(d), existing.id]);
            } else {
                await dbRun(db, `INSERT INTO inventory (char_id,item_type,item_data) VALUES (?,?,?)`, [freshChar.id, 'raw_mat', JSON.stringify({ ...mat, qty })]);
            }
            drops.push({ mat: mat.id, qty });
        };

        if (isTutorial && playerWon) {
            const tutorialDropCount = Math.min(2, mats.length);
            const tutorialPool = [...mats].sort(() => Math.random() - 0.5).slice(0, tutorialDropCount);
            for (const mat of tutorialPool) {
                await addMaterialDrop(mat, 1 + Math.floor(Math.random() * 2));
            }
        } else {
            const dropChance = playerWon ? 0.6 : 0.2;
            for (const mat of mats) {
                if (Math.random() < dropChance) {
                    await addMaterialDrop(mat, 1 + Math.floor(Math.random() * 3));
                }
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
            levelUpMessage,
            drops, hpRemaining: finalHp,
            tutorialMessage,
            activeEvent: isEvent ? GLOBAL_EVENTS[0] : null,
            character: await buildCharacterResponse(updatedChar, db),
            totalDmgDealt: battle.totalDmgToB,
            totalDmgTaken: battle.totalDmgToA,
            missionName: mission.mission_name,
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
    
    item.desc = recipe.desc || '';
    
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
        if (Number(character.global_cooldown_until || 0) > now) {
            const remain = Number(character.global_cooldown_until || 0) - now;
            return res.status(400).json({ error: `Raid recovery active for ${remain < 3600 ? Math.ceil(remain / 60) + 'm' : Math.ceil(remain / 3600) + 'h'}.` });
        }
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
                    // Force win for new characters (first 4 battles)
                    let forceWinnerId = null;
                    const isTutorial = isTutorialCharacter(freshChar);
                    if (isTutorial) {
                        forceWinnerId = freshChar.id;
                    }
                    
                    const battle = runBattle(playerFighter, guardian, forceWinnerId);
                    let playerWon = battle.winnerId === freshChar.id;
                    
                    // Add tutorial note
                    if (forceWinnerId && isTutorial) {
                        if (!battle.log.some(line => line.includes('Tutorial victory'))) {
                            battle.log.push('✨ Tutorial victory!');
                        }
                    }
                    
                    // Tutorial Check: Don't deplete HP for the first 4 battles
                    const newHp = isTutorial ? (freshChar.hp_current ?? playerFighter.hpMax) : Math.max(0, battle.hpRemainingA);

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

        const currentQty = Math.max(1, Number(data.qty || 1));
        if (currentQty > 1) {
            data.qty = currentQty - 1;
            await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(data), item.id]);
        } else {
            await dbRun(db, 'DELETE FROM inventory WHERE id=?', [item.id]);
        }
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
            await handleReferralLevelMilestone(db, char.user_id, char.level, newLevel);
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
            'UPDATE characters SET gems = gems + 500, last_free_gems_claim_at = ? WHERE id = ?',
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
        if (Number(me.global_cooldown_until || 0) > now) {
            return res.json({ active: false, globalCooldown: Number(me.global_cooldown_until || 0) });
        }
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
        if (Number(attacker.global_cooldown_until || 0) > now) {
            const remain = Number(attacker.global_cooldown_until || 0) - now;
            return res.status(400).json({ error: `Raid recovery active for ${remain < 3600 ? Math.ceil(remain / 60) + 'm' : Math.ceil(remain / 3600) + 'h'}.` });
        }
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
                pyro:    (calcElemDmg(equippedA).pyro    || 0) + (skillPassivesA.pyro_dmg    || 0),
                water:   (calcElemDmg(equippedA).water   || 0) + (skillPassivesA.water_dmg   || 0),
                wind:    (calcElemDmg(equippedA).wind    || 0) + (skillPassivesA.wind_dmg    || 0),
                electro: (calcElemDmg(equippedA).electro || 0) + (skillPassivesA.electro_dmg || 0),
            },
            elem_resist: {
                pyro:    (calcElemResist(freshA, equippedA).pyro    || 0) + (skillPassivesA.pyro_resist    || 0),
                water:   (calcElemResist(freshA, equippedA).water   || 0) + (skillPassivesA.water_resist   || 0),
                wind:    (calcElemResist(freshA, equippedA).wind    || 0) + (skillPassivesA.wind_resist    || 0),
                electro: (calcElemResist(freshA, equippedA).electro || 0) + (skillPassivesA.electro_resist || 0),
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
                pyro:    (calcElemDmg(equippedD).pyro    || 0) + (skillPassivesD.pyro_dmg    || 0),
                water:   (calcElemDmg(equippedD).water   || 0) + (skillPassivesD.water_dmg   || 0),
                wind:    (calcElemDmg(equippedD).wind    || 0) + (skillPassivesD.wind_dmg    || 0),
                electro: (calcElemDmg(equippedD).electro || 0) + (skillPassivesD.electro_dmg || 0),
            },
            elem_resist: {
                pyro:    (calcElemResist(freshD, equippedD).pyro    || 0) + (skillPassivesD.pyro_resist    || 0),
                water:   (calcElemResist(freshD, equippedD).water   || 0) + (skillPassivesD.water_resist   || 0),
                wind:    (calcElemResist(freshD, equippedD).wind    || 0) + (skillPassivesD.wind_resist    || 0),
                electro: (calcElemResist(freshD, equippedD).electro || 0) + (skillPassivesD.electro_resist || 0),
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
            await recordDamageStyleWin(db, freshA.id, battle.totalElemDmgDealtA || battle.totalElemDmgDealt || 0);
        } else {
            await recordShieldlessWin(db, freshD, equippedD);
            await recordDamageStyleWin(db, freshD.id, battle.totalElemDmgDealtB || 0);
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
        
        // Handle level up: reset HP to full and give loot box
        let atkFinalHp = newHpA;
        let atkLevelUpMessage = null;
        if (leveledUp) {
            const equippedArray = await getEquippedItemsArray(db, freshA.id);
            const newCharWithLevel = { ...freshA, level: atkLevel };
            const newHpMax = calcHpMax(newCharWithLevel, equippedArray);
            atkFinalHp = newHpMax;
            
            const lootBox = LOOT_BOXES.find(box => box.id === 'lootbox_common');
            if (lootBox) {
                await addStackableInventoryItem(db, freshA.id, 'consumable', lootBox, 1);
            }
            atkLevelUpMessage = `🎉 Level Up! You reached level ${atkLevel}! HP restored to full and you received a Common Loot Box!`;
        }
        
        await ensureWeeklyTaskState(db, freshA);
        await ensureWeeklyTaskState(db, freshD);
        await dbRun(db, `UPDATE characters SET xp=?,gold=MAX(0,gold+?),level=?,wins=wins+?,losses=losses+?,hp_current=?,total_gold_earned=total_gold_earned+?,total_gold_lost=total_gold_lost+? WHERE id=?`,
            [atkXp, goldGained, atkLevel, attackerWon?1:0, attackerWon?0:1, atkFinalHp, goldGained>0?goldGained:0, goldGained<0?-goldGained:0, freshA.id]);
        await handleReferralLevelMilestone(db, freshA.user_id, freshA.level, atkLevel);
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
            leveledUp, atkLevelUpMessage,
            character: await buildCharacterResponse(updatedAttacker, db),
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
        const players = await dbAll(db, `SELECT c.id,c.name,c.class,c.level,c.xp,c.total_gold_earned,c.strength,c.defense,c.agility,c.magic,c.wins,c.losses,c.profile_pic,
            (SELECT COUNT(*) FROM character_achievements ca WHERE ca.char_id = c.id) AS achievements_completed
            FROM characters c 
            ORDER BY c.${sort} DESC,c.level DESC LIMIT 2000`, []);
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
            profile_pic: player.profile_pic || `${player.class}.png`,
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
        await purgeExpiredMessages(db);
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });
        const messages = await dbAll(db, `SELECT m.*,COALESCE(m.sender_label, s.name, 'Arena Staff') as sender_name,r.name as receiver_name FROM messages m
            LEFT JOIN characters s ON m.sender_id=s.id JOIN characters r ON m.receiver_id=r.id
            WHERE m.receiver_id=? ORDER BY m.sent_at DESC LIMIT 50`, [char.id]);
        res.json(messages);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/messages/unread-count', auth, async (req, res) => {
    try {
        const db = await getDb();
        await purgeExpiredMessages(db);
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.json({ count:0 });
        const prefs = await dbGet(
            db,
            'SELECT inbox_badge_messages, inbox_badge_battles, inbox_badge_missions FROM users WHERE id = ?',
            [req.user.userId]
        );
        const includeMessages = Number(prefs?.inbox_badge_messages ?? 1) !== 0;
        const includeBattles = Number(prefs?.inbox_badge_battles ?? 1) !== 0;
        const includeMissions = Number(prefs?.inbox_badge_missions ?? 1) !== 0;
        const rows = await dbAll(db, 'SELECT body FROM messages WHERE receiver_id=? AND read=0', [char.id]);
        let count = 0;
        for (const row of rows) {
            const body = String(row?.body || '');
            if (body.startsWith('BATTLE_REPORT:')) {
                let report = null;
                try { report = JSON.parse(body.slice('BATTLE_REPORT:'.length)); } catch {}
                const type = String(report?.type || '').toLowerCase();
                if (type === 'mission') {
                    if (includeMissions) count++;
                } else {
                    if (includeBattles) count++;
                }
            } else if (includeMessages) {
                count++;
            }
        }
        res.json({ count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/messages/send', auth, async (req, res) => {
    try {
        const db = await getDb();
        await purgeExpiredMessages(db);
        const sender = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!sender) return res.status(404).json({ error: 'No character' });
        const { receiver_id, subject, body } = req.body;
        if (!receiver_id || !subject || !body) return res.status(400).json({ error: 'Missing fields' });
        if (String(receiver_id) === String(sender.id)) return res.status(400).json({ error: 'Cannot message yourself' });
        await dbRun(db, 'INSERT INTO messages (sender_id,receiver_id,subject,body) VALUES (?,?,?,?)', [sender.id, receiver_id, subject, body]);
        res.json({ message:'Sent!' });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});
router.get('/chat/history', auth, async (req, res) => {
    try {
        const db = await getDb();
        await purgeExpiredChatMessages(db);
        const char = await getCurrentCharacter(db, req.user.userId, 'id,name');
        if (!char) return res.status(404).json({ error: 'No character' });
        const sinceId = Math.max(0, Number(req.query?.since || 0));
        let rows = [];
        if (sinceId > 0) {
            rows = await dbAll(
                db,
                `SELECT *
                 FROM chat_messages
                 WHERE (
                        recipient_char_id IS NULL
                        OR (recipient_char_id IS NOT NULL AND (sender_char_id = ? OR recipient_char_id = ?))
                    )
                   AND id > ?
                 ORDER BY id ASC
                 LIMIT 80`,
                [char.id, char.id, sinceId]
            );
        } else {
            rows = await dbAll(
                db,
                `SELECT *
                 FROM chat_messages
                 WHERE
                    recipient_char_id IS NULL
                    OR (recipient_char_id IS NOT NULL AND (sender_char_id = ? OR recipient_char_id = ?))
                 ORDER BY id DESC
                 LIMIT 60`,
                [char.id, char.id]
            );
            rows.reverse();
        }
        res.json({ messages: rows.map(row => serializeChatMessage(row, char.id)) });
    } catch (e) {
        console.error('Chat history failed:', e);
        res.status(500).json({ error: e.message });
    }
});
router.get('/chat/characters', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });

        const rawQuery = String(req.query?.q || '').trim().toLowerCase();
        const prefixQuery = rawQuery ? `${rawQuery}%` : '';
        const containsQuery = rawQuery ? `%${rawQuery}%` : '';

        const rows = await dbAll(
            db,
            `SELECT id, name
             FROM characters
             WHERE id != ?
               AND (
                    ? = ''
                    OR lower(name) LIKE ?
                    OR lower(name) LIKE ?
               )
             ORDER BY
                CASE
                    WHEN ? != '' AND lower(name) = ? THEN 0
                    WHEN ? != '' AND lower(name) LIKE ? THEN 1
                    ELSE 2
                END,
                name COLLATE NOCASE ASC
             LIMIT 8`,
            [
                char.id,
                rawQuery,
                prefixQuery,
                containsQuery,
                rawQuery,
                rawQuery,
                rawQuery,
                prefixQuery
            ]
        );

        res.json({
            characters: rows.map(row => ({
                id: Number(row.id),
                name: row.name
            }))
        });
    } catch (e) {
        console.error('Chat character lookup failed:', e);
        res.status(500).json({ error: e.message });
    }
});
router.post('/chat/send', auth, async (req, res) => {
    try {
        const db = await getDb();
        await purgeExpiredChatMessages(db);
        const sender = await getCurrentCharacter(db, req.user.userId, 'id,name');
        if (!sender) return res.status(404).json({ error: 'No character' });

        const rawMessage = String(req.body?.message || '');
        const messageText = sanitizeChatMessage(rawMessage);
        if (!messageText) return res.status(400).json({ error: 'Message required.' });

        const recipientInput = String(req.body?.recipientName || '').trim();
        let recipient = null;
        if (recipientInput) {
            recipient = await dbGet(
                db,
                'SELECT id, name FROM characters WHERE lower(name) = lower(?) LIMIT 1',
                [recipientInput]
            );
            if (!recipient) return res.status(404).json({ error: 'Character not found.' });
            if (Number(recipient.id) === Number(sender.id)) {
                return res.status(400).json({ error: 'Cannot message yourself.' });
            }
        }

        const createdAt = Math.floor(Date.now() / 1000);
        await dbRun(
            db,
            `INSERT INTO chat_messages
                (sender_user_id, sender_char_id, sender_name, recipient_char_id, recipient_name, message_text, created_at)
             VALUES (?,?,?,?,?,?,?)`,
            [
                req.user.userId,
                sender.id,
                sender.name,
                recipient?.id || null,
                recipient?.name || null,
                messageText,
                createdAt
            ]
        );

const inserted = await dbGet(db, 'SELECT * FROM chat_messages WHERE id = last_insert_rowid()');
        res.json({
            success: true,
            message: serializeChatMessage(inserted, sender.id)
        });
    } catch (e) {
        console.error('Chat send failed:', e);
        res.status(500).json({ error: e.message });
    }
});

router.put('/chat/edit/:id', auth, async (req, res) => {
    console.log('[CHAT EDIT] Request received:', req.method, req.params.id, req.body);
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });

        const messageId = req.params.id;
        const rawMessage = String(req.body?.message || '');
        const messageText = sanitizeChatMessage(rawMessage);
        if (!messageText) return res.status(400).json({ error: 'Message required.' });

        const existing = await dbGet(db, 'SELECT * FROM chat_messages WHERE id = ?', [messageId]);
        if (!existing) return res.status(404).json({ error: 'Message not found.' });
        if (Number(existing.sender_char_id) !== Number(char.id)) {
            return res.status(403).json({ error: 'You can only edit your own messages.' });
        }

        const editedAt = Math.floor(Date.now() / 1000);
        await dbRun(db, 'UPDATE chat_messages SET message_text = ?, edited = 1, edited_at = ? WHERE id = ?', 
            [messageText, editedAt, messageId]);

        const updated = await dbGet(db, 'SELECT * FROM chat_messages WHERE id = ?', [messageId]);
        res.json({
            success: true,
            message: serializeChatMessage(updated, char.id)
        });
    } catch (e) {
        console.error('Chat edit failed:', e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/chat/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ error: 'No character' });

        const messageId = req.params.id;
        const existing = await dbGet(db, 'SELECT * FROM chat_messages WHERE id = ?', [messageId]);
        if (!existing) return res.status(404).json({ error: 'Message not found.' });
        if (Number(existing.sender_char_id) !== Number(char.id)) {
            return res.status(403).json({ error: 'You can only delete your own messages.' });
        }

        await dbRun(db, 'DELETE FROM chat_messages WHERE id = ?', [messageId]);
        res.json({ success: true });
    } catch (e) {
        console.error('Chat delete failed:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/messages/:id/read', auth, async (req, res) => {
    try {
        const db = await getDb();
        await purgeExpiredMessages(db);
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ ok: false });
        await dbRun(db, 'UPDATE messages SET read=1 WHERE id=? AND receiver_id=?', [req.params.id, char.id]);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/messages/:id/claim-reward', auth, async (req, res) => {
    try {
        const db = await getDb();
        await purgeExpiredMessages(db);
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character' });
        const msg = await dbGet(db, 'SELECT * FROM messages WHERE id=? AND receiver_id=?', [req.params.id, char.id]);
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        if (Number(msg.reward_claimed || 0) !== 0) return res.status(400).json({ error: 'Reward already claimed.' });
        if (!msg.reward_payload) return res.status(400).json({ error: 'This message has no reward.' });

        let reward;
        try { reward = JSON.parse(msg.reward_payload); } catch { reward = null; }
        if (!reward || typeof reward !== 'object') return res.status(400).json({ error: 'Reward payload is invalid.' });

        // Validate the full reward first so we never partially grant gold/gems and then fail on materials.
        let validatedMaterialReward = null;
        if (reward.material?.id && reward.material?.qty) {
            const normalizedMaterialId = normalizeRewardMaterialId(reward.material.id);
            const preferredType = reward.material.type === 'component' ? 'component' : 'raw_mat';
            const preferredMap = preferredType === 'component' ? COMPONENTS : RAW_MATERIALS;
            const fallbackType = preferredType === 'component' ? 'raw_mat' : 'component';
            const fallbackMap = fallbackType === 'component' ? COMPONENTS : RAW_MATERIALS;
            const preferredDef = preferredMap?.[normalizedMaterialId];
            const fallbackDef = fallbackMap?.[normalizedMaterialId];
            const resolvedType = preferredDef ? preferredType : (fallbackDef ? fallbackType : null);
            const resolvedDef = preferredDef || fallbackDef || null;
            if (!resolvedDef || !resolvedType) {
                return res.status(400).json({ error: 'Reward material no longer exists.' });
            }
            validatedMaterialReward = {
                type: resolvedType,
                id: normalizedMaterialId,
                qty: Math.max(1, Number(reward.material.qty || 1)),
                def: resolvedDef
            };
        }

        if (reward.gold) {
            const gold = Math.max(0, Number(reward.gold || 0));
            if (gold > 0) {
                await dbRun(db, 'UPDATE characters SET gold=gold+?, total_gold_earned=total_gold_earned+? WHERE id=?', [gold, gold, char.id]);
            }
        }
        if (reward.gems) {
            const gems = Math.max(0, Number(reward.gems || 0));
            if (gems > 0) {
                await dbRun(db, 'UPDATE characters SET gems=gems+?, total_gems_earned=COALESCE(total_gems_earned,0)+? WHERE id=?', [gems, gems, char.id]);
            }
        }
        if (reward.lootbox?.id) {
            const lootBox = LOOT_BOXES.find(box => box.id === reward.lootbox.id);
            if (lootBox) {
                await addStackableInventoryItem(db, char.id, 'consumable', lootBox, reward.lootbox.qty || 1);
            }
        }
        if (validatedMaterialReward) {
            await addStackableInventoryItem(
                db,
                char.id,
                validatedMaterialReward.type,
                { id: validatedMaterialReward.id, ...validatedMaterialReward.def },
                validatedMaterialReward.qty
            );
        }

        await dbRun(db, 'UPDATE messages SET reward_claimed=1, read=1 WHERE id=? AND receiver_id=?', [msg.id, char.id]);
        const updatedChar = await dbGet(db, 'SELECT * FROM characters WHERE id=?', [char.id]);
        res.json({
            success: true,
            message: `Claimed: ${describeAdminRewardPayload(reward)}.`,
            character: await buildCharacterResponse(updatedChar, db)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.delete('/messages/:id', auth, async (req, res) => {
    try {
        const db = await getDb();
        await purgeExpiredMessages(db);
        const char = await getCurrentCharacter(db, req.user.userId, 'id');
        if (!char) return res.status(404).json({ ok: false });
        await dbRun(db, 'DELETE FROM messages WHERE id=? AND receiver_id=?', [req.params.id, char.id]);
        res.json({ ok:true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/rewards/list', async (req, res) => {
    try {
        const password = parseAdminPassword(req);
        if (password !== ADMIN_PANEL_PASSWORD) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Global Rewards - Login</title>
                    <style>
                        body { background:#0a0a0f; color:#e2e8f0; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family: ui-sans-serif, system-ui, sans-serif; }
                        .login-box { background:#16213e; padding:32px; border-radius:14px; border:1px solid rgba(155,89,182,0.45); width:min(420px, 92vw); box-shadow:0 18px 50px rgba(0,0,0,0.35); }
                        h2 { margin:0 0 16px; color:#f1c40f; }
                        p { color:#94a3b8; margin:0 0 18px; }
                        input, button { width:100%; padding:12px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:#0f172a; color:#fff; box-sizing:border-box; }
                        button { margin-top:12px; background:linear-gradient(180deg, #9b59b6, #7d3c98); cursor:pointer; border:none; font-weight:700; }
                    </style>
                </head>
                <body>
                    <div class="login-box">
                        <h2>🎁 Global Rewards Access</h2>
                        <p>Enter the admin password to send thank-you letters, global messages, and reward mail.</p>
                        <form method="GET">
                            <input type="password" name="password" placeholder="Enter password">
                            <button type="submit">Open Rewards Panel</button>
                        </form>
                    </div>
                </body>
                </html>
            `);
        }

        const db = await getDb();
        await purgeExpiredMessages(db);
        const usersCount = Number((await dbGet(db, 'SELECT COUNT(*) AS count FROM users', []))?.count || 0);
        const charsCount = Number((await dbGet(db, 'SELECT COUNT(*) AS count FROM characters', []))?.count || 0);
        const lettersCount = Number((await dbGet(db, 'SELECT COUNT(*) AS count FROM messages WHERE system_message = 1', []))?.count || 0);
        const batches = await dbAll(db, 'SELECT * FROM admin_reward_batches ORDER BY created_at DESC LIMIT 20', []);
        const statusText = String(req.query?.status || '').trim();
        const statusError = String(req.query?.error || '').trim();

        const rowsHtml = batches.map(batch => {
            let rewardText = 'Message only';
            try { rewardText = describeAdminRewardPayload(JSON.parse(batch.reward_payload || 'null')); } catch {}
            return `<tr>
                <td>${batch.id}</td>
                <td>${new Date(Number(batch.created_at || 0) * 1000).toLocaleString()}</td>
                <td>${escapeHtml(batch.scope || '')}</td>
                <td>${escapeHtml(batch.subject || '')}</td>
                <td>${escapeHtml(rewardText)}</td>
                <td>${Number(batch.recipient_count || 0).toLocaleString()}</td>
            </tr>`;
        }).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Global Rewards Admin</title>
                <meta charset="UTF-8">
                <style>
                    * { box-sizing:border-box; }
                    body { margin:0; background:#0a0a0f; color:#e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; }
                    .wrap { max-width:1200px; margin:0 auto; padding:28px; }
                    h1 { margin:0 0 18px; color:#f1c40f; }
                    .stats { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; margin-bottom:20px; }
                    .stat, .panel { background:#16213e; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; }
                    .stat-value { font-size:1.8rem; font-weight:800; color:#9b59b6; }
                    .stat-label { font-size:0.8rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; margin-top:6px; }
                    .panel { margin-bottom:20px; }
                    .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }
                    .full { grid-column:1 / -1; }
                    label { display:block; font-size:0.78rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
                    input, textarea, select, button { width:100%; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:#0f172a; color:#fff; padding:12px 14px; font:inherit; }
                    textarea { min-height:120px; resize:vertical; }
                    .submit-btn { background:linear-gradient(180deg, #2ecc71, #1f8b4d); border:none; font-weight:800; cursor:pointer; }
                    .hint { color:#94a3b8; font-size:0.85rem; line-height:1.5; }
                    .status { margin-top:14px; padding:12px 14px; border-radius:10px; background:rgba(46,204,113,0.12); border:1px solid rgba(46,204,113,0.25); display:none; }
                    .status.error { background:rgba(231,76,60,0.12); border-color:rgba(231,76,60,0.25); }
                    table { width:100%; border-collapse:collapse; }
                    th, td { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left; font-size:0.9rem; vertical-align:top; }
                    th { color:#94a3b8; font-size:0.76rem; letter-spacing:0.08em; text-transform:uppercase; }
                    @media (max-width: 800px) { .stats, .grid { grid-template-columns:1fr; } }
                </style>
            </head>
            <body>
                <div class="wrap">
                    <h1>🎁 Global Rewards Admin</h1>
                    <div class="stats">
                        <div class="stat"><div class="stat-value">${usersCount.toLocaleString()}</div><div class="stat-label">Accounts</div></div>
                        <div class="stat"><div class="stat-value">${charsCount.toLocaleString()}</div><div class="stat-label">Characters</div></div>
                        <div class="stat"><div class="stat-value">${lettersCount.toLocaleString()}</div><div class="stat-label">System Letters Sent</div></div>
                    </div>
                    <div class="panel">
                        <h2 style="margin-top:0">Send Reward Letter</h2>
                        <p class="hint">Default delivery is the active character for each account, so multi-character users do not receive the same global reward four times unless you explicitly choose every character.</p>
                        <form method="POST" action="/api/game/rewards/send?password=${encodeURIComponent(password)}">
                            <div class="grid">
                                <div>
                                    <label>Delivery Scope</label>
                                    <select name="scope">
                                        <option value="active_per_account">Active character per account</option>
                                        <option value="all_characters">Every character</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Subject</label>
                                    <input type="text" name="subject" maxlength="140" placeholder="Thank you for helping test Battle Arena">
                                </div>
                                <div class="full">
                                    <label>Message Body</label>
                                    <textarea name="body" placeholder="Write the thank-you letter players will see in their inbox."></textarea>
                                </div>
                                <div>
                                    <label>Gold Reward</label>
                                    <input type="number" name="gold" min="0" step="1" placeholder="0">
                                </div>
                                <div>
                                    <label>Gem Reward</label>
                                    <input type="number" name="gems" min="0" step="1" placeholder="0">
                                </div>
                                <div>
                                    <label>Material Type</label>
                                    <select name="materialType">
                                        <option value="">No material</option>
                                        <option value="raw_mat">Raw Material</option>
                                        <option value="component">Component</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Material Id</label>
                                    <input type="text" name="materialId" placeholder="mithril_ore or demon_alloy">
                                </div>
                                <div>
                                    <label>Material Quantity</label>
                                    <input type="number" name="materialQty" min="0" step="1" placeholder="0">
                                </div>
                                <div style="display:flex;align-items:end">
                                    <button type="submit" class="submit-btn">Send Global Letter</button>
                                </div>
                            </div>
                        </form>
                        <div class="status ${statusError ? 'error' : ''}" style="display:${statusText || statusError ? 'block' : 'none'}">
                            ${escapeHtml(statusError || statusText || '')}
                        </div>
                    </div>
                    <div class="panel">
                        <h2 style="margin-top:0">Recent Reward Batches</h2>
                        <table>
                            <thead><tr><th>ID</th><th>Sent</th><th>Scope</th><th>Subject</th><th>Reward</th><th>Recipients</th></tr></thead>
                            <tbody>${rowsHtml || '<tr><td colspan="6">No reward batches sent yet.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

router.post('/rewards/send', async (req, res) => {
    try {
        const password = parseAdminPassword(req);
        if (password !== ADMIN_PANEL_PASSWORD) {
            const wantsHtml = String(req.headers.accept || '').includes('text/html');
            if (wantsHtml) {
                return res.redirect(`/api/game/rewards/list?password=${encodeURIComponent(password)}&error=${encodeURIComponent('Forbidden')}`);
            }
            return res.status(403).json({ error: 'Forbidden' });
        }

        const db = await getDb();
        await purgeExpiredMessages(db);
        const scope = String(req.body?.scope || 'active_per_account');
        const subject = String(req.body?.subject || '').trim();
        const body = String(req.body?.body || '').trim();
        const wantsHtml = String(req.headers.accept || '').includes('text/html');
        if (!subject || !body) {
            if (wantsHtml) {
                return res.redirect(`/api/game/rewards/list?password=${encodeURIComponent(password)}&error=${encodeURIComponent('Subject and message body are required.')}`);
            }
            return res.status(400).json({ error: 'Subject and message body are required.' });
        }

        const rewardPayload = buildAdminRewardPayload(req.body || {});
        const attemptedReward = adminRewardInputLooksFilled(req.body || {});
        if (attemptedReward && !rewardPayload) {
            const msg = 'Reward fields were filled, but the reward data is incomplete. Use gold/gems, or provide material type + material id + material quantity.';
            if (wantsHtml) {
                return res.redirect(`/api/game/rewards/list?password=${encodeURIComponent(password)}&error=${encodeURIComponent(msg)}`);
            }
            return res.status(400).json({ error: msg });
        }
        const recipients = scope === 'all_characters'
            ? await dbAll(db, 'SELECT id FROM characters ORDER BY id ASC', [])
            : await dbAll(db, `
                SELECT c.id
                FROM users u
                JOIN characters c ON c.id = u.active_character_id
                WHERE u.active_character_id IS NOT NULL
                ORDER BY c.id ASC
            `, []);

        if (!recipients.length) {
            if (wantsHtml) {
                return res.redirect(`/api/game/rewards/list?password=${encodeURIComponent(password)}&error=${encodeURIComponent('No recipients found for that scope.')}`);
            }
            return res.status(400).json({ error: 'No recipients found for that scope.' });
        }

        const createdAt = Math.floor(Date.now() / 1000);
        const batch = await dbRun(
            db,
            'INSERT INTO admin_reward_batches (created_at, scope, subject, body, reward_payload, recipient_count) VALUES (?,?,?,?,?,?)',
            [createdAt, scope, subject, body, rewardPayload ? JSON.stringify(rewardPayload) : null, recipients.length]
        );
        const batchId = Number(batch?.lastInsertRowid || 0) || null;

        for (const row of recipients) {
            await dbRun(
                db,
                `INSERT INTO messages (sender_id, receiver_id, sender_label, subject, body, reward_payload, reward_claimed, system_message, admin_batch_id)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`,
                [row.id, row.id, 'Arena Staff', subject, body, rewardPayload ? JSON.stringify(rewardPayload) : null, batchId]
            );
        }

        const successMessage = `Sent ${rewardPayload ? 'reward letter' : 'global message'} to ${recipients.length.toLocaleString()} recipient${recipients.length === 1 ? '' : 's'}.`;
        if (wantsHtml) {
            return res.redirect(`/api/game/rewards/list?password=${encodeURIComponent(password)}&status=${encodeURIComponent(successMessage)}`);
        }
        res.json({
            success: true,
            message: successMessage,
            batchId
        });
    } catch (error) {
        const password = parseAdminPassword(req);
        const wantsHtml = String(req.headers.accept || '').includes('text/html');
        if (wantsHtml) {
            return res.redirect(`/api/game/rewards/list?password=${encodeURIComponent(password)}&error=${encodeURIComponent(error.message || 'Failed to send rewards.')}`);
        }
        res.status(500).json({ error: error.message });
    }
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

router.get('/dungeon/lock-check', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    
    // Check for active dungeon lock with expiry
    let locked = false;
    if (char.dungeon_session) {
      try {
        const sess = JSON.parse(char.dungeon_session);
        const now = Date.now();
        // Lock expires after 30 seconds of inactivity
        if (sess && sess.ts && (now - sess.ts) < 30000) {
          locked = true;
        }
      } catch {}
    }
    
    res.json({ locked });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/lock-acquire', auth, async (req, res) => {
  // Auth lock now handles single-device login, dungeon lock not needed
  res.json({ success: true });
});

router.post('/dungeon/lock-release', auth, async (req, res) => {
  res.json({ success: true });
});

router.post('/dungeon/lock-refresh', auth, async (req, res) => {
  res.json({ success: true });
});

// Atomic room entry - prevents double reward exploits
router.post('/dungeon/room-enter', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { floor, roomIndex } = req.body;
    const { userId } = req.user;
    
    // Check if already cleared - don't allow re-entry
    const alreadyCleared = await db.execute({
      sql: `SELECT id FROM dungeon_room_instances WHERE user_id = ? AND floor_number = ? AND room_index = ? AND status = 'cleared'`,
      args: [userId, floor, roomIndex]
    });
    if (alreadyCleared.rows.length > 0) {
      return res.status(409).json({ error: 'Room already cleared', locked: true });
    }

    // Room entry itself should never block combat; the actual one-reward guarantee
    // is enforced in /dungeon/room-clear.
    res.json({ success: true });
  } catch (e) {
    console.error('room-enter error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Release room when escaping or dying
router.post('/dungeon/room-exit', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { floor, roomIndex } = req.body;
    
    await db.execute({
      sql: `DELETE FROM dungeon_room_instances WHERE user_id = ? AND floor_number = ? AND room_index = ?`,
      args: [req.user.userId, floor, roomIndex]
    });
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark room cleared and claim reward atomically
// Only FIRST clear gets reward - reject duplicates
// routes.js  — replace the FIRST router.post('/dungeon/room-clear', ...) block (lines 7784-7823)

router.post('/dungeon/room-clear', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { floor, roomIndex, floorRunId } = req.body;
    const { userId } = req.user;
    const char = await getCurrentCharacter(db, userId);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const runKey = String(floorRunId || `${floor}_legacy`);

    // Atomically attempt to insert the cleared record.
    // The cleared id is scoped to the current floor instance so restarting the same
    // floor later doesn't collide with an old clear from a previous run.
    let inserted = false;
    try {
      const clearedId = `${char.id}_${runKey}_${roomIndex}_cleared`;
      await db.execute({
        sql: `INSERT INTO dungeon_room_instances
                (id, user_id, char_id, floor_number, room_index, status)
              VALUES (?, ?, ?, ?, ?, 'cleared')`,
        args: [clearedId, userId, char.id, floor, roomIndex]
      });
      inserted = true;
    } catch (uniqueErr) {
      const msg = String(uniqueErr?.message || '');
      if (msg.includes('UNIQUE') || msg.includes('duplicate') || msg.includes('constraint')) {
        inserted = false;
      } else {
        throw uniqueErr;
      }
    }

    if (!inserted) {
      // Already cleared by another session — block reward
      return res.status(409).json({ error: 'Room already cleared', cleared: true });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('room-clear error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/lock-release', auth, async (req, res) => {
  res.json({ success: true });
});

router.post('/dungeon/lock-refresh', auth, async (req, res) => {
  res.json({ success: true });
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

router.post('/dungeon/claim-room', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { roomId, floor } = req.body;
    const char = await getCurrentCharacter(db, req.user.userId);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    
    let savedProgress = { rooms: [], exploredRooms: [] };
    if (char.dungeon_progress) {
      try { savedProgress = JSON.parse(char.dungeon_progress); } catch {}
    }
    
    const room = savedProgress.rooms?.find(r => r.id === roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    // Already cleared
    if (room.monstersCleared) {
      return res.json({ cleared: true });
    }
    
    // Already claimed by another (older claim)
    if (room.inCombat && room.inCombat < Date.now() - 300000) {
      room.inCombat = null;
    }
    if (room.inCombat && room.inCombat !== req.user.userId) {
      return res.json({ claimed: true });
    }
    
    // Lock the room for this player (5 min timeout)
    room.inCombat = req.user.userId;
    
    await dbRun(db, `UPDATE characters SET dungeon_progress = ? WHERE id = ?`,
      [JSON.stringify(savedProgress), char.id]
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/release-room', auth, async (req, res) => {
  try {
    const db = await getDb();
    const { roomId, cleared } = req.body;
    const char = await getCurrentCharacter(db, req.user.userId);
    if (!char) return res.status(404).json({ error: 'Character not found' });
    
    let savedProgress = { rooms: [], exploredRooms: [] };
    if (char.dungeon_progress) {
      try { savedProgress = JSON.parse(char.dungeon_progress); } catch {}
    }
    
    const room = savedProgress.rooms?.find(r => r.id === roomId);
    if (room) {
      if (cleared) {
        room.monstersCleared = Date.now();
      }
      room.inCombat = null;
      
      await dbRun(db, `UPDATE characters SET dungeon_progress = ? WHERE id = ?`,
        [JSON.stringify(savedProgress), char.id]
      );
    }
    
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
    const char = await getCurrentCharacter(db, req.user.userId, 'id, user_id, dungeon_gold, guild_reputation, dungeon_highest_floor, raid_cooldown_until');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const bounty = await ensureActiveGuildBounty(db, char.id);
    const raids = await getGuildRaidList(db, char.id, req.user.userId);
    res.json({ 
      success: true, 
      dungeonGold: char?.dungeon_gold || 0,
      guildReputation: char?.guild_reputation || 0,
      highestFloor: Number(char?.dungeon_highest_floor || 1),
      raidCooldownUntil: Number(char?.raid_cooldown_until || 0),
      bounty,
      raids
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/raid/create', auth, async (req, res) => {
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const char = await getCurrentCharacter(db, req.user.userId, 'id, user_id, name, guild_reputation, dungeon_highest_floor, raid_cooldown_until');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const busy = await getCharacterBusyState(db, char);
    if (busy.busy) return res.status(400).json({ error: busy.reason });
    if (Number(char.guild_reputation || 0) < GUILD_RAID_CREATE_REPUTATION) {
      return res.status(403).json({ error: 'Apprentice rank required to create raids.' });
    }
    const existingLead = await getOpenRaidForLeader(db, char.id);
    if (existingLead) return res.status(400).json({ error: 'You already lead an active forming raid.' });
    const existingMember = await getActiveRaidMembershipForUser(db, req.user.userId);
    if (existingMember) return res.status(400).json({ error: 'You are already committed to another forming raid.' });

    const requestedFloor = Math.max(1, Number(req.body?.floor || 1));
    const maxFloor = Math.max(1, Number(char.dungeon_highest_floor || 1));
    if (requestedFloor > maxFloor) {
      return res.status(400).json({ error: `You can only create raids up to floor ${maxFloor}.` });
    }

    const requestedAutoStartPlayers = Math.max(0, Math.min(GUILD_RAID_MAX_MEMBERS, Number(req.body?.autoStartPlayers || 0)));
    const autoStartMode = requestedAutoStartPlayers > 0 ? `count_${requestedAutoStartPlayers}` : 'manual';

    const boss = getGuildRaidBossForFloor(requestedFloor);
    const mercenaryPool = generateRaidMercenaryPool(requestedFloor, 10);
    const created = await dbRun(db, `INSERT INTO guild_raids
      (leader_char_id, leader_user_id, floor, boss_name, boss_image, boss_hp, boss_atk, boss_def, auto_start_mode, scheduled_start_at, status, created_at, mercenary_pool)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'forming', ?, ?)`,
      [char.id, req.user.userId, requestedFloor, boss.name, boss.image, boss.hp, boss.atk, boss.def, autoStartMode, 0, now, JSON.stringify(mercenaryPool)]
    );
    const raidId = Number(created.lastInsertRowid);
    await dbRun(db, `INSERT INTO guild_raid_members (raid_id, char_id, user_id, joined_at)
      VALUES (?, ?, ?, ?)`, [raidId, char.id, req.user.userId, now]);
    await tryStartGuildRaidIfReady(db, raidId);
    const raids = await getGuildRaidList(db, char.id, req.user.userId);
    res.json({
      success: true,
      message: requestedAutoStartPlayers === 1
        ? `Solo raid launched for Floor ${requestedFloor}. Check your inbox for the report.`
        : `Raid created for Floor ${requestedFloor}.`,
      raids
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/raid/update-settings', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId, 'id, user_id');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const raidId = Number(req.body?.raidId || 0);
    const raid = await getGuildRaidById(db, raidId);
    if (!raid || raid.status !== 'forming') return res.status(404).json({ error: 'Raid not available.' });
    if (String(raid.leader_char_id) !== String(char.id)) {
      return res.status(403).json({ error: 'Only the raid leader can change raid settings.' });
    }
    const requestedAutoStartPlayers = Math.max(0, Math.min(GUILD_RAID_MAX_MEMBERS, Number(req.body?.autoStartPlayers || 0)));
    const autoStartMode = requestedAutoStartPlayers > 0 ? `count_${requestedAutoStartPlayers}` : 'manual';
    const updateResult = await dbRun(db, 'UPDATE guild_raids SET auto_start_mode = ? WHERE id = ? AND status = ?', [autoStartMode, raidId, 'forming']);
    const updated = updateResult?.rowsAffected ?? updateResult?.changes ?? 0;
    if (!updated) return res.status(409).json({ error: 'Raid already started before settings could be updated.' });
    await tryStartGuildRaidIfReady(db, raidId);
    const raids = await getGuildRaidList(db, char.id, req.user.userId);
    res.json({ success: true, message: 'Raid start settings updated.', raids });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/raid/join', auth, async (req, res) => {
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const char = await getCurrentCharacter(db, req.user.userId, 'id, user_id, name, raid_cooldown_until');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const busy = await getCharacterBusyState(db, char);
    if (busy.busy) return res.status(400).json({ error: busy.reason });
    const raidId = Number(req.body?.raidId || 0);
    const raid = await getGuildRaidById(db, raidId);
    if (!raid || raid.status !== 'forming') return res.status(404).json({ error: 'Raid not available.' });
    const existingMember = await getActiveRaidMembershipForUser(db, req.user.userId);
    if (existingMember) return res.status(400).json({ error: 'You are already committed to another forming raid.' });
    const members = await getGuildRaidMembers(db, raidId);
    if (members.some(member => String(member.user_id) === String(req.user.userId))) {
      return res.status(400).json({ error: 'Your account is already in this raid.' });
    }
    if (members.length >= GUILD_RAID_MAX_MEMBERS) return res.status(400).json({ error: 'Raid is already full.' });
    const joinResult = await dbRun(db, `INSERT INTO guild_raid_members (raid_id, char_id, user_id, joined_at)
      SELECT ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM guild_raids WHERE id = ? AND status = 'forming')`,
      [raidId, char.id, req.user.userId, now, raidId]
    );
    const joined = joinResult?.rowsAffected ?? joinResult?.changes ?? 0;
    if (!joined) return res.status(409).json({ error: 'Raid started before you could join.' });
    await tryStartGuildRaidIfReady(db, raidId);
    const raids = await getGuildRaidList(db, char.id, req.user.userId);
    res.json({ success: true, message: 'Joined the raid party.', raids });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/raid/recruit', auth, async (req, res) => {
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const char = await getCurrentCharacter(db, req.user.userId, 'id, user_id, gems');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const raidId = Number(req.body?.raidId || 0);
    const recruitId = String(req.body?.recruitId || '');
    const raid = await getGuildRaidById(db, raidId);
    if (!raid || raid.status !== 'forming') return res.status(404).json({ error: 'Raid not available.' });
    if (String(raid.leader_char_id) !== String(char.id)) {
      return res.status(403).json({ error: 'Only the raid leader can recruit mercenaries.' });
    }
    const members = await getGuildRaidMembers(db, raidId);
    if (members.length >= GUILD_RAID_MAX_MEMBERS) return res.status(400).json({ error: 'Raid is already full.' });
    let pool = [];
    try { pool = JSON.parse(raid.mercenary_pool || '[]') || []; } catch {}
    const recruit = pool.find(entry => String(entry.id) === recruitId);
    if (!recruit) return res.status(404).json({ error: 'Mercenary offer not found.' });
    if (recruit.recruited) return res.status(400).json({ error: 'That mercenary has already been recruited.' });
    if ((char.gems || 0) < GUILD_RAID_MERCENARY_COST_GEMS) return res.status(400).json({ error: `Need ${GUILD_RAID_MERCENARY_COST_GEMS} gem to recruit.` });

    recruit.recruited = true;
    recruit.recruitedAt = now;
    recruit.recruitedByCharId = char.id;
    const poolUpdate = await dbRun(db, 'UPDATE guild_raids SET mercenary_pool = ? WHERE id = ? AND status = ?', [JSON.stringify(pool), raidId, 'forming']);
    const poolUpdated = poolUpdate?.rowsAffected ?? poolUpdate?.changes ?? 0;
    if (!poolUpdated) return res.status(409).json({ error: 'Raid started before the mercenary could be recruited.' });
    await dbRun(db, 'UPDATE characters SET gems = gems - ? WHERE id = ?', [GUILD_RAID_MERCENARY_COST_GEMS, char.id]);

    const npcCharId = -((raidId * 1000) + (Number(recruit.slotIndex || 0) + 1));
    const recruitInsert = await dbRun(db, `INSERT INTO guild_raid_members
      (raid_id, char_id, user_id, joined_at, is_npc, member_name, member_class, member_level, member_payload)
      SELECT ?, ?, 0, ?, 1, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM guild_raids WHERE id = ? AND status = 'forming')`,
      [raidId, npcCharId, now, recruit.name, recruit.fighter.class || 'mercenary', Number(recruit.level || raid.floor || 1), JSON.stringify(recruit), raidId]
    );
    const inserted = recruitInsert?.rowsAffected ?? recruitInsert?.changes ?? 0;
    if (!inserted) {
      recruit.recruited = false;
      delete recruit.recruitedAt;
      delete recruit.recruitedByCharId;
      await dbRun(db, 'UPDATE guild_raids SET mercenary_pool = ? WHERE id = ?', [JSON.stringify(pool), raidId]);
      await dbRun(db, 'UPDATE characters SET gems = gems + ? WHERE id = ?', [GUILD_RAID_MERCENARY_COST_GEMS, char.id]);
      return res.status(409).json({ error: 'Raid started before the mercenary could join.' });
    }

    await tryStartGuildRaidIfReady(db, raidId);
    const raids = await getGuildRaidList(db, char.id, req.user.userId);
    const updated = await getCurrentCharacter(db, req.user.userId, 'gems');
    res.json({ success: true, message: `${recruit.name} joined the raid.`, gems: updated?.gems || 0, raids });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/raid/start', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId, 'id, user_id');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const raidId = Number(req.body?.raidId || 0);
    const raid = await getGuildRaidById(db, raidId);
    if (!raid || raid.status !== 'forming') return res.status(404).json({ error: 'Raid not available.' });
    if (String(raid.leader_char_id) !== String(char.id)) {
      return res.status(403).json({ error: 'Only the raid leader can start this raid.' });
    }
    await tryStartGuildRaidIfReady(db, raid.id, { forceStart: true });
    const raids = await getGuildRaidList(db, char.id, req.user.userId);
    res.json({ success: true, message: 'Raid battle resolved.', raids });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dungeon/guild/raid/claim', auth, async (req, res) => {
  try {
    const db = await getDb();
    const char = await getCurrentCharacter(db, req.user.userId, 'id, user_id, gold, gems');
    if (!char) return res.status(404).json({ error: 'Character not found' });
    const raidId = Number(req.body?.raidId || 0);
    const raid = await getGuildRaidById(db, raidId);
    if (!raid || raid.status !== 'completed') return res.status(404).json({ error: 'Raid rewards are not ready.' });
    const member = await dbGet(db, 'SELECT * FROM guild_raid_members WHERE raid_id = ? AND char_id = ?', [raidId, char.id]);
    if (!member) return res.status(404).json({ error: 'You are not a member of this raid.' });
    if (Number(member.claimed_at || 0) > 0) return res.status(400).json({ error: 'Raid reward already claimed.' });
    let payload = null;
    try { payload = member.reward_payload ? JSON.parse(member.reward_payload) : null; } catch {}
    if (!payload) return res.status(400).json({ error: 'This raid did not grant a reward.' });

    if (payload.gold) {
      await dbRun(db, 'UPDATE characters SET gold = gold + ?, total_gold_earned = total_gold_earned + ? WHERE id = ?', [payload.gold, payload.gold, char.id]);
    }
    if (payload.gems) {
      await dbRun(db, 'UPDATE characters SET gems = gems + ?, total_gems_earned = COALESCE(total_gems_earned, 0) + ? WHERE id = ?', [payload.gems, payload.gems, char.id]);
    }
    if (payload.lootbox?.id) {
      const lootBox = LOOT_BOXES.find(box => box.id === payload.lootbox.id);
      if (lootBox) {
        await addStackableInventoryItem(db, char.id, 'consumable', lootBox, payload.lootbox.qty || 1);
      }
    } else if (
      payload.item?.itemType === 'consumable' &&
      String(payload.item?.itemData?.name || '').trim().toLowerCase() === 'rare item chest'
    ) {
      // Backward-compatibility for already-sent raid reports before loot boxes were wired correctly.
      const lootBox = LOOT_BOXES.find(box => box.id === 'lootbox_rare');
      if (lootBox) {
        await addStackableInventoryItem(db, char.id, 'consumable', lootBox, 1);
      }
    }
    const legacyRaidChest =
      payload.item?.itemType === 'consumable' &&
      String(payload.item?.itemData?.name || '').trim().toLowerCase() === 'rare item chest';
    if (payload.item?.itemType && payload.item?.itemData && !legacyRaidChest) {
      await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?, ?, ?)', [char.id, payload.item.itemType, JSON.stringify(payload.item.itemData)]);
    }
    await dbRun(db, 'UPDATE guild_raid_members SET claimed_at = ? WHERE raid_id = ? AND char_id = ?', [Math.floor(Date.now() / 1000), raidId, char.id]);
    const updated = await getCurrentCharacter(db, req.user.userId, 'gold, gems');
    const raids = await getGuildRaidList(db, char.id, req.user.userId);
    res.json({ success: true, message: 'Raid reward claimed.', gold: updated?.gold || 0, gems: updated?.gems || 0, raids });
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
        const { componentId, expectedUpgradeLevel } = req.body;
        const char = await getCurrentCharacter(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        const item = await dbGet(db, 'SELECT * FROM inventory WHERE id=? AND char_id=?', [req.params.inventoryId, char.id]);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        
        const itemData = JSON.parse(item.item_data);
        
        if (item.item_type !== 'equipment') {
            return res.status(400).json({ error: 'Only equipment can be upgraded!' });
        }
        
        const currentUpgrade = item.upgrade_level || 0;
        const normalizedExpectedUpgrade = Number.isFinite(Number(expectedUpgradeLevel))
            ? Number(expectedUpgradeLevel)
            : currentUpgrade;
        const quality = itemData.quality || 'common';
        let maxUpgrade = 3;
        if (quality === 'legendary') maxUpgrade = 5;
        else if (quality === 'epic' || quality === 'rare') maxUpgrade = 4;

        if (normalizedExpectedUpgrade !== currentUpgrade) {
            return res.status(409).json({ error: 'This upgrade view is outdated. Reopen the item and try again.' });
        }

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
        
        const baseItemName = String(itemData.name || '').replace(/\s\+\d+$/, '').trim();
        const baseItemDesc = String(itemData.desc || '')
            .replace(/^undefined\s*/i, '')
            .replace(/\s*\[Upgraded \+\d+ using [^\]]+\]\s*$/i, '')
            .trim();
        const previousUpgradeHistory = Array.isArray(itemData.upgradeHistory)
            ? itemData.upgradeHistory
            : (Array.isArray(itemData.upgrade_history) ? itemData.upgrade_history : []);
        const nextUpgradeHistory = [
            ...previousUpgradeHistory,
            {
                level: nextUpgrade,
                component: componentData.name,
                bonus: bonusValue,
                stats: upgradedStatsList
            }
        ];

        const upgradedItemData = {
            ...itemData,
            name: baseItemName || itemData.name || '',
            stats: upgradedStats,
            upgradedStats: upgradedStatsList,
            upgradeLevel: nextUpgrade,
            upgradeHistory: nextUpgradeHistory
        };
        if (baseItemDesc) upgradedItemData.desc = baseItemDesc;
        else delete upgradedItemData.desc;
        
        const itemUpdateResult = await dbRun(
            db,
            'UPDATE inventory SET item_data=?, upgrade_level=? WHERE id=? AND char_id=? AND upgrade_level=?',
            [JSON.stringify(upgradedItemData), nextUpgrade, item.id, char.id, normalizedExpectedUpgrade]
        );

        if (!itemUpdateResult.rowsAffected && itemUpdateResult.rowsAffected !== undefined ? true : itemUpdateResult.changes === 0) {
            return res.status(409).json({ error: 'Upgrade already in progress. Please wait for the current upgrade to finish.' });
        }

        if (componentQty <= 1) {
            await dbRun(db, 'DELETE FROM inventory WHERE id=?', [component.id]);
        } else {
            componentData.qty = componentQty - 1;
            await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(componentData), component.id]);
        }
        
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

router.get('/assistant/suggestions', auth, async (req, res) => {
    try {
        console.log('📋 Assistant suggestions requested, userId:', req.user.userId);
        const db = await getDb();
        const userId = req.user.userId;

        const userSettings = await dbGet(db, 'SELECT assistant_enabled FROM users WHERE id = ?', [userId]);
        const assistantEnabled = Number(userSettings?.assistant_enabled ?? 1) !== 0;
        console.log('User assistant enabled:', assistantEnabled);

        if (!assistantEnabled) {
            console.log('Assistant disabled by user preference');
            return res.json({ suggestions: [], enabled: false });
        }
        
        const char = await getCurrentCharacter(db, userId);
        if (!char) {
            console.log('No character found');
            return res.json({ suggestions: [], enabled: true });
        }
        
        console.log('Character wins:', char.wins, 'level:', char.level);
        const suggestions = [];
        
        const charResponse = await buildCharacterResponse(char, db);
        
        // Check training - safe query
        let hasUnclaimedTrain = false;
        try {
            hasUnclaimedTrain = char.training_ends_at && char.training_ends_at <= Math.floor(Date.now() / 1000);
        } catch (e) { /* ignore */ }
        
        // Check active missions - use correct table name
        let hasActiveMission = false;
        let hasAvailableMission = false;
        try {
            const missionsResult = await db.execute({
                sql: 'SELECT * FROM active_missions WHERE character_id = ? LIMIT 1',
                args: [char.id]
            });
            hasActiveMission = missionsResult.rows?.length > 0;
            hasAvailableMission = !hasActiveMission;
        } catch (e) {
            console.log('Assistant: active_missions table not available');
            hasAvailableMission = true; // Assume available if table missing
        }
        
        // Check unclaimed rewards - may fail if table doesn't exist
        let hasUnclaimedRewards = false;
        try {
            const unclaimedResult = await db.execute({
                sql: 'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND body LIKE "BATTLE_REPORT:%" AND read = 0',
                args: [char.id]
            });
            hasUnclaimedRewards = Number(unclaimedResult.rows?.[0]?.count || 0) > 0;
        } catch (e) {
            console.log('Assistant: messages table query failed');
        }
        
        const canUpgradeStats = (charResponse.strength < 20 * char.level) || 
                               (charResponse.defense < 15 * char.level) ||
                               (charResponse.agility < 18 * char.level) ||
                               (charResponse.magic < 12 * char.level);
        
        if (hasUnclaimedTrain) {
            suggestions.push({
                type: 'training',
                message: 'Training complete! Collect your stat bonus.',
                action: 'train',
                tab: 'upgrade'
            });
        }
        
        if (hasAvailableMission) {
            suggestions.push({
                type: 'mission',
                message: 'You have an available mission! Start it to earn rewards.',
                action: 'missions',
                tab: 'missions'
            });
        }
        
        if (hasUnclaimedRewards) {
            suggestions.push({
                type: 'rewards',
                message: 'You have unclaimed battle rewards in your inbox.',
                action: 'inbox',
                tab: 'inbox'
            });
        }
        
        // Tutorial phase - show guidance
        const firstFourWins = isTutorialCharacter(char);
        if (firstFourWins) {
            suggestions.push({
                type: 'newbie',
                message: 'Complete battles to level up and unlock more features!',
                action: 'missions',
                tab: 'missions'
            });
            suggestions.push({
                type: 'guide',
                message: '💡 Tip: Visit the Upgrade tab to build your stats!',
                action: 'train',
                tab: 'upgrade'
            });
        } else {
            // Post-tutorial guidance
            suggestions.push({
                type: 'guide_stats',
                message: '💡 Level up faster: Train your stats at the Trainer.',
                action: 'train',
                tab: 'upgrade'
            });
            suggestions.push({
                type: 'guide_gear',
                message: '💡 Get better gear from the Shop or by crafting at the Forge.',
                action: 'shop',
                tab: 'shop'
            });
            suggestions.push({
                type: 'guide_upgrade',
                message: '💡 You can upgrade your equipment in the Inventory tab.',
                action: 'inventory',
                tab: 'inventory'
            });
        }
        
        res.json({ 
            suggestions, 
            enabled: assistantEnabled,
            highlightTabs: []
        });
    } catch (e) {
        console.error('Assistant error:', e);
        res.json({ suggestions: [], enabled: true, highlightTabs: [] });
    }
});

// Tab-specific assistant messages endpoint
router.get('/assistant/tab-help/:tab', auth, async (req, res) => {
    const db = await getDb();
    const { tab } = req.params;
    const char = await getCurrentCharacter(db, req.user.userId);
    const userSettings = await dbGet(db, 'SELECT assistant_enabled FROM users WHERE id = ?', [req.user.userId]);
    if (Number(userSettings?.assistant_enabled ?? 1) === 0) {
        return res.json({ message: '', enabled: false });
    }
    const wins = char?.wins || 0;
    
    const tabHelp = {
        missions: {
            message: '💡 Missions are the main way to earn gold! Complete missions to earn gold, XP, and loot. Start with Easy missions - Medium and Hard will be available after you complete more battles.',
            showAfter: 0
        },
        upgrade: {
            message: '💡 Here you can spend gold to upgrade your character stats: Strength, Defense, Agility, and Magic. Higher stats mean more damage and better survivability!',
            showAfter: 0
        },
        loadout: {
            message: '💡 In Loadout you can set your attack and defense zones. Choose wisely - each zone has different bonuses!',
            showAfter: 0
        },
        skills: {
            message: '💡 Skills are class-specific abilities that can turn the tide of battle. Activate skills that match your playstyle - offensive for damage, defensive for survival.',
            showAfter: 0
        },
        train: {
            message: '💡 Training lets you learn new skills from the skill tree. Each class has unique skills - choose wisely to build your character, starter skill unlocks more branches.',
            showAfter: 0
        },
        forge: {
            message: '💡 The Forge is where you refine raw materials and craft powerful gear. Higher quality materials create better equipment!',
            showAfter: 2
        },
        inventory: {
            message: '💡 Manage your gear here. Click on items to equip them, or use the Upgrade button to enhance equipment with crafting materials.',
            showAfter: 0
        },
        shop: {
            message: '💡 Buy new weapons, armor, and accessories here. Check back regularly - the inventory changes every day! Save gold for better gear.',
            showAfter: 0
        },
        dungeon: {
            message: '💡 The Dungeon is an endless labyrinth adventure! Explore rooms, fight monsters, find treasure. Be careful - strong monsters can deplete your health fast. You can run from combat by clicking "Run" to live another day!',
            showAfter: 0
        },
        inbox: {
            message: '💡 Your inbox contains battle reports and messages. Check battle reports to see how you performed!',
            showAfter: 0
        },
        leaderboard: {
            message: '💡 See how you rank against other players! Compete for the top spots in gold earned, wins, and level.',
            showAfter: 0
        }
    };
    
    const help = tabHelp[tab];
    if (!help) {
        return res.json({ message: null });
    }
    
    // Check if should show based on wins
    if (wins < help.showAfter) {
        return res.json({ message: null });
    }
    
    res.json({ message: help.message });
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
