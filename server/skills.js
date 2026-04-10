// ═══════════════════════════════════════════════════════════════════════════════
// skills.js — Class Skill Tree System (REWORKED)
// ═══════════════════════════════════════════════════════════════════════════════
//
// All passive bonuses are PERCENTAGE-BASED to scale with character progression
// Unlock conditions are meaningful and require long-term investment
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const { getDb } = require('./db');

async function dbGet(db, sql, args = []) { const r = await db.execute({ sql, args }); return r.rows[0] ?? null; }
async function dbAll(db, sql, args = []) { const r = await db.execute({ sql, args }); return r.rows; }
async function dbRun(db, sql, args = []) { return db.execute({ sql, args }); }

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

// ── Training durations (seconds) ─────────────────────────────────────────────
const SKILL_TRAIN_DURATIONS = {
    novice:      3600,        //  1 hour
    apprentice:  10800,       //  3 hours
    journeyman:  28800,       //  8 hours
    expert:      86400,       //  1 day
    master:      259200,      //  3 days
    grandmaster: 604800,      //  7 days
};

// ── Quest / unlock conditions ─────────────────────────────────────────────────
const UNLOCK_CONDITIONS = {
    // Tier 1 (Novice)
    wins_5:           { type: 'wins', value: 5, desc: 'Win 5 battles' },
    level_5:          { type: 'level', value: 5, desc: 'Reach level 5' },
    
    // Tier 2 (Apprentice)
    wins_20:          { type: 'wins', value: 20, desc: 'Win 20 battles' },
    level_10:         { type: 'level', value: 10, desc: 'Reach level 10' },
    
    // Tier 3 (Journeyman)
    wins_50:          { type: 'wins', value: 50, desc: 'Win 50 battles' },
    level_20:         { type: 'level', value: 20, desc: 'Reach level 20' },
    gold_earned_50k:  { type: 'total_gold_earned', value: 50000, desc: 'Earn 50,000 gold total' },
    dungeon_floor_5:  { type: 'dungeon_highest_floor', value: 5, desc: 'Reach dungeon floor 5' },
    
    // Tier 4 (Expert)
    wins_150:         { type: 'wins', value: 150, desc: 'Win 150 battles' },
    level_35:         { type: 'level', value: 35, desc: 'Reach level 35' },
    gold_earned_200k: { type: 'total_gold_earned', value: 200000, desc: 'Earn 200,000 gold total' },
    dungeon_floor_15: { type: 'dungeon_highest_floor', value: 15, desc: 'Reach dungeon floor 15' },
    
    // Tier 5 (Master)
    wins_500:         { type: 'wins', value: 500, desc: 'Win 500 battles' },
    level_60:         { type: 'level', value: 60, desc: 'Reach level 60' },
    gold_earned_1m:   { type: 'total_gold_earned', value: 1000000, desc: 'Earn 1,000,000 gold total' },
    dungeon_floor_30: { type: 'dungeon_highest_floor', value: 30, desc: 'Reach dungeon floor 30' },
    
    // Special conditions
    kills_no_shield:    { type: 'wins_no_shield', value: 30, desc: 'Win 30 battles without a shield equipped' },
    elem_dmg_kill_100:  { type: 'elemental_kills', value: 100, desc: 'Defeat 100 enemies with elemental damage' },
    zero_deaths_dungeon:{ type: 'dungeon_no_death_run', value: 1, desc: 'Complete a dungeon run without dying' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Create skill thresholds
// ═══════════════════════════════════════════════════════════════════════════════
function createThresholds(materialsByLevel) {
    return {
        10: { materials: materialsByLevel[10] || {}, unlocks: 'next_skill' },
        25: { materials: materialsByLevel[25] || {} },
        50: { materials: materialsByLevel[50] || {} },
        75: { materials: materialsByLevel[75] || {} },
        100: { materials: materialsByLevel[100] || {}, unlocks: 'next_skill' },
    };
}

// Default thresholds for skills
const DEFAULT_THRESHOLDS = {
    tier2: createThresholds({
        10: {}, 25: { iron_ingot: 3 }, 50: { iron_ingot: 5 }, 75: { mithril_ingot: 2 }, 100: { mithril_ingot: 3 }
    }),
    tier3: createThresholds({
        10: {}, 25: { mithril_ingot: 3 }, 50: { mithril_ingot: 5 }, 75: { dragon_scale_shard: 2 }, 100: { dragon_scale_shard: 3 }
    }),
    tier4: createThresholds({
        10: {}, 25: { dragon_scale_shard: 3 }, 50: { dragon_scale_shard: 5 }, 75: { void_crystal: 2 }, 100: { void_crystal: 3 }
    }),
    tier5: createThresholds({
        10: {}, 25: { void_crystal: 3 }, 50: { legendary_fragment: 3 }, 75: { legendary_fragment: 5 }, 100: { demon_core: 2 }
    }),
};

// Add these after DEFAULT_THRESHOLDS

// Mage thresholds (arcane shards instead of iron)
const MAGE_THRESHOLDS = {
    tier2: createThresholds({
        10: {}, 25: { arcane_shard: 2 }, 50: { arcane_shard: 4 }, 75: { void_shard: 2 }, 100: { void_shard: 3 }
    }),
    tier3: createThresholds({
        10: {}, 25: { void_shard: 3 }, 50: { void_shard: 5 }, 75: { dragon_scale_shard: 2 }, 100: { dragon_scale_shard: 3 }
    }),
    tier4: createThresholds({
        10: {}, 25: { dragon_scale_shard: 3 }, 50: { dragon_scale_shard: 5 }, 75: { void_crystal: 2 }, 100: { void_crystal: 3 }
    }),
    tier5: createThresholds({
        10: {}, 25: { void_crystal: 3 }, 50: { legendary_fragment: 3 }, 75: { legendary_fragment: 5 }, 100: { demon_core: 2 }
    }),
};

// Rogue thresholds (leather/shadow essence)
const ROGUE_THRESHOLDS = {
    tier2: createThresholds({
        10: {}, 25: { tanned_hide: 3 }, 50: { tanned_hide: 5 }, 75: { shadow_essence: 2 }, 100: { shadow_essence: 3 }
    }),
    tier3: createThresholds({
        10: {}, 25: { shadow_essence: 3 }, 50: { shadow_essence: 5 }, 75: { poison_extract: 3 }, 100: { poison_extract: 5 }
    }),
    tier4: createThresholds({
        10: {}, 25: { poison_extract: 5 }, 50: { void_crystal: 2 }, 75: { void_crystal: 3 }, 100: { legendary_fragment: 2 }
    }),
    tier5: createThresholds({
        10: {}, 25: { legendary_fragment: 3 }, 50: { legendary_fragment: 5 }, 75: { shadow_weave: 2 }, 100: { demon_core: 2 }
    }),
};

// Paladin thresholds (holy essence)
const PALADIN_THRESHOLDS = {
    tier2: createThresholds({
        10: {}, 25: { arcane_shard: 2 }, 50: { arcane_shard: 4 }, 75: { holy_essence: 2 }, 100: { holy_essence: 3 }
    }),
    tier3: createThresholds({
        10: {}, 25: { holy_essence: 3 }, 50: { holy_essence: 5 }, 75: { dragon_scale_shard: 2 }, 100: { dragon_scale_shard: 3 }
    }),
    tier4: createThresholds({
        10: {}, 25: { dragon_scale_shard: 3 }, 50: { dragon_scale_shard: 5 }, 75: { void_crystal: 2 }, 100: { void_crystal: 3 }
    }),
    tier5: createThresholds({
        10: {}, 25: { void_crystal: 3 }, 50: { legendary_fragment: 3 }, 75: { legendary_fragment: 5 }, 100: { demon_alloy: 2 }
    }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// SKILL TREES
// ═══════════════════════════════════════════════════════════════════════════════

const SKILL_TREES = {

    // ═══════════════════════════════════════════════════════════════════════════
    // WARRIOR
    // ═══════════════════════════════════════════════════════════════════════════
    warrior: {
        description: 'Masters of physical combat. Four distinct combat philosophies await.',
        upgrade_penalties: {},
        upgrade_discounts: { strength: 0.30, defense: 0.15, vitality: 0.10 },

        branches: {
            // STARTER SKILL
            warrior_training: {
                name: 'Warrior Training',
                emoji: '⚔️',
                description: 'The foundation of all warrior combat styles.',
                isStarter: true,
                skills: {
                    basic_training: {
                        id: 'basic_training', tier: 1, name: 'Basic Training', emoji: '🛡️',
                        type: 'progressive',
                        desc: '+5% Strength and +5% Defense.',
                        effects: [
                            { type: 'passive_pct', stat: 'strength', value: 0.05 },
                            { type: 'passive_pct', stat: 'defense', value: 0.05 }
                        ],
                        requires: [],
                        unlockCondition: null,
                        thresholds: createThresholds({
                            10: {}, 25: { iron_ingot: 2 }, 50: { iron_ingot: 4 }, 75: { mithril_ingot: 2 }, 100: { mithril_ingot: 4 }
                        }),
                    },
                },
            },

            // BRANCH 1: Berserker
            berserker: {
                name: 'Berserker',
                emoji: '🔥',
                description: 'Abandon defence, maximise destruction. High risk, highest reward.',
                requires: { skill: 'basic_training', minProgress: 10 },
                skills: {
                    bloodlust: {
                        id: 'bloodlust', tier: 2, name: 'Bloodlust', emoji: '🩸',
                        type: 'progressive',
                        desc: '+8% Strength permanently.',
                        effects: [{ type: 'passive_pct', stat: 'strength', value: 0.08 }],
                        requires: ['basic_training'],
                        unlockCondition: 'wins_5',
                        thresholds: DEFAULT_THRESHOLDS.tier2,
                    },
                    reckless_swing: {
                        id: 'reckless_swing', tier: 3, name: 'Reckless Swing', emoji: '⚡',
                        type: 'progressive',
                        desc: '+35% damage, -10% block effectiveness.',
                        effects: [{ type: 'active_combat', id: 'reckless_swing', atk_dmg_bonus: 0.35, block_penalty: 0.10 }],
                        requires: ['bloodlust'],
                        unlockCondition: 'wins_20',
                        thresholds: DEFAULT_THRESHOLDS.tier3,
                    },
                    frenzy: {
                        id: 'frenzy', tier: 4, name: 'Frenzy', emoji: '💢',
                        type: 'progressive',
                        desc: '+12% Strength and +8% Agility. Damage increases by 3% per consecutive hit.',
                        effects: [
                            { type: 'passive_pct', stat: 'strength', value: 0.12 },
                            { type: 'passive_pct', stat: 'agility', value: 0.08 },
                            { type: 'active_combat', id: 'frenzy_stacks', max_stacks: 5, per_stack_dmg: 0.03 }
                        ],
                        requires: ['reckless_swing'],
                        unlockCondition: 'wins_50',
                        thresholds: DEFAULT_THRESHOLDS.tier4,
                    },
                    berserker_rage: {
                        id: 'berserker_rage', tier: 5, name: 'Berserker Rage', emoji: '🌋',
                        type: 'progressive',
                        desc: '+60% damage, ignore 40% armor on every 3rd hit.',
                        effects: [{ type: 'active_combat', id: 'berserker_rage', atk_dmg_bonus: 0.60, ignore_armour_pct: 0.40, interval: 3 }],
                        requires: ['frenzy'],
                        unlockCondition: 'wins_150',
                        thresholds: DEFAULT_THRESHOLDS.tier5,
                    },
                    unstoppable: {
                        id: 'unstoppable', tier: 5, name: 'Unstoppable', emoji: '🔱',
                        type: 'progressive',
                        desc: '+20% damage, +15% Critical Damage. Cannot be stunned.',
                        effects: [
                            { type: 'passive_pct', stat: 'dmg_output', value: 0.20 },
                            { type: 'passive_pct', stat: 'crit_dmg', value: 0.15 },
                            { type: 'class_modifier', id: 'stun_immune' }
                        ],
                        requires: ['berserker_rage'],
                        unlockCondition: 'wins_500',
                        thresholds: createThresholds({
                            10: {}, 25: { void_crystal: 2 }, 50: { legendary_fragment: 3 }, 75: { legendary_fragment: 5 }, 100: { demon_core: 2 }
                        }),
                    },
                },
            },

            // BRANCH 2: Iron Guard
            iron_guard: {
                name: 'Iron Guard',
                emoji: '🏰',
                description: 'Become an immovable fortress. Exceptional defence and damage mitigation.',
                requires: { skill: 'basic_training', minProgress: 10 },
                skills: {
                    toughness: {
                        id: 'toughness', tier: 2, name: 'Toughness', emoji: '🪨',
                        type: 'progressive',
                        desc: '+10% Defense and +8% Max HP.',
                        effects: [
                            { type: 'passive_pct', stat: 'defense', value: 0.10 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.08 }
                        ],
                        requires: ['basic_training'],
                        unlockCondition: 'level_5',
                        thresholds: DEFAULT_THRESHOLDS.tier2,
                    },
                    shield_mastery: {
                        id: 'shield_mastery', tier: 3, name: 'Shield Mastery', emoji: '🛡️',
                        type: 'progressive',
                        desc: '+30% block effectiveness on all guard stances.',
                        effects: [{ type: 'passive_pct', stat: 'block_effectiveness', value: 0.30 }],
                        requires: ['toughness'],
                        unlockCondition: 'level_10',
                        thresholds: DEFAULT_THRESHOLDS.tier3,
                    },
                    iron_skin: {
                        id: 'iron_skin', tier: 4, name: 'Iron Skin', emoji: '⚙️',
                        type: 'progressive',
                        desc: '+15% Armor and +12% Vitality.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.15 },
                            { type: 'passive_pct', stat: 'vitality', value: 0.12 }
                        ],
                        requires: ['shield_mastery'],
                        unlockCondition: 'level_20',
                        thresholds: DEFAULT_THRESHOLDS.tier4,
                    },
                    last_stand: {
                        id: 'last_stand', tier: 5, name: 'Last Stand', emoji: '⚔️',
                        type: 'progressive',
                        desc: 'Below 25% HP: +50% damage, +40% block, heal 5% max HP per round.',
                        effects: [{ type: 'active_combat', id: 'last_stand', hp_threshold: 0.25, dmg_bonus: 0.50, block_bonus: 0.40, heal_pct: 0.05 }],
                        requires: ['iron_skin'],
                        unlockCondition: 'level_35',
                        thresholds: DEFAULT_THRESHOLDS.tier5,
                    },
                    fortress: {
                        id: 'fortress', tier: 5, name: 'Fortress', emoji: '🗼',
                        type: 'progressive',
                        desc: '+25% Armor, +30% Max HP, +15% Defense. Reduce all damage by 15%.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.30 },
                            { type: 'passive_pct', stat: 'defense', value: 0.15 },
                            { type: 'passive_pct', stat: 'dmg_taken', value: -0.15 }
                        ],
                        requires: ['last_stand'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { dragon_plate: 2 }, 50: { legendary_fragment: 4 }, 75: { legendary_fragment: 6 }, 100: { demon_alloy: 2 }
                        }),
                    },
                },
            },

            // BRANCH 3: Battle Commander
            battle_commander: {
                name: 'Battle Commander',
                emoji: '📯',
                description: 'Tactical mastery. Higher hit chance, critical strikes.',
                requires: { skill: 'basic_training', minProgress: 10 },
                skills: {
                    combat_discipline: {
                        id: 'combat_discipline', tier: 2, name: 'Combat Discipline', emoji: '📋',
                        type: 'progressive',
                        desc: '+8% Hit Chance permanently.',
                        effects: [{ type: 'passive_pct', stat: 'hit_chance', value: 0.08 }],
                        requires: ['basic_training'],
                        unlockCondition: 'wins_5',
                        thresholds: DEFAULT_THRESHOLDS.tier2,
                    },
                    precision_strike: {
                        id: 'precision_strike', tier: 3, name: 'Precision Strike', emoji: '🎯',
                        type: 'progressive',
                        desc: '+10% Crit Chance and +5% Hit Chance.',
                        effects: [
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.10 },
                            { type: 'passive_pct', stat: 'hit_chance', value: 0.05 }
                        ],
                        requires: ['combat_discipline'],
                        unlockCondition: 'wins_20',
                        thresholds: DEFAULT_THRESHOLDS.tier3,
                    },
                    war_cry: {
                        id: 'war_cry', tier: 4, name: 'War Cry', emoji: '📯',
                        type: 'progressive',
                        desc: 'First 3 rounds: 100% hit chance and +20% crit chance.',
                        effects: [{ type: 'active_combat', id: 'war_cry', no_miss_rounds: 3, crit_bonus: 0.20 }],
                        requires: ['precision_strike'],
                        unlockCondition: 'wins_50',
                        thresholds: DEFAULT_THRESHOLDS.tier4,
                    },
                    execute: {
                        id: 'execute', tier: 5, name: 'Execute', emoji: '💀',
                        type: 'progressive',
                        desc: '+150% damage against enemies below 30% HP.',
                        effects: [{ type: 'active_combat', id: 'execute', hp_threshold: 0.30, dmg_bonus: 1.50 }],
                        requires: ['war_cry'],
                        unlockCondition: 'wins_150',
                        thresholds: DEFAULT_THRESHOLDS.tier5,
                    },
                    supreme_commander: {
                        id: 'supreme_commander', tier: 5, name: 'Supreme Commander', emoji: '👑',
                        type: 'progressive',
                        desc: '+15% Hit Chance, +15% Crit Chance. Critical hits deal 25% more damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'hit_chance', value: 0.15 },
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.15 },
                            { type: 'passive_pct', stat: 'crit_dmg', value: 0.25 },
                            { type: 'class_modifier', id: 'tie_breaker' }
                        ],
                        requires: ['execute'],
                        unlockCondition: 'wins_500',
                        thresholds: createThresholds({
                            10: {}, 25: { void_crystal: 2 }, 50: { legendary_fragment: 4 }, 75: { legendary_fragment: 6 }, 100: { shadow_weave: 2 }
                        }),
                    },
                },
            },

            // BRANCH 4: Gladiator
            gladiator: {
                name: 'Gladiator',
                emoji: '🏟️',
                description: 'Arena fighter. Bonus rewards and faster recovery.',
                requires: { skill: 'basic_training', minProgress: 10 },
                skills: {
                    arena_veteran: {
                        id: 'arena_veteran', tier: 2, name: 'Arena Veteran', emoji: '🏅',
                        type: 'progressive',
                        desc: '+15% gold from PvP wins.',
                        effects: [{ type: 'passive_pct', stat: 'pvp_gold_earn', value: 0.15 }],
                        requires: ['basic_training'],
                        unlockCondition: 'wins_5',
                        thresholds: DEFAULT_THRESHOLDS.tier2,
                    },
                    battle_hardened: {
                        id: 'battle_hardened', tier: 3, name: 'Battle Hardened', emoji: '💪',
                        type: 'progressive',
                        desc: '+8% Strength, +8% Defense, +6% Vitality.',
                        effects: [
                            { type: 'passive_pct', stat: 'strength', value: 0.08 },
                            { type: 'passive_pct', stat: 'defense', value: 0.08 },
                            { type: 'passive_pct', stat: 'vitality', value: 0.06 }
                        ],
                        requires: ['arena_veteran'],
                        unlockCondition: 'wins_20',
                        thresholds: DEFAULT_THRESHOLDS.tier3,
                    },
                    counter_attack: {
                        id: 'counter_attack', tier: 4, name: 'Counter Attack', emoji: '↩️',
                        type: 'progressive',
                        desc: '40% chance to counter for 75% damage.',
                        effects: [{ type: 'active_combat', id: 'counter_attack', counter_chance: 0.40, counter_dmg_pct: 0.75 }],
                        requires: ['battle_hardened'],
                        unlockCondition: 'wins_50',
                        thresholds: DEFAULT_THRESHOLDS.tier4,
                    },
                    gladiator_rush: {
                        id: 'gladiator_rush', tier: 5, name: 'Gladiator Rush', emoji: '🏃',
                        type: 'progressive',
                        desc: 'First round: +100% damage, cannot be blocked.',
                        effects: [{ type: 'active_combat', id: 'gladiator_rush', round_1_dmg_bonus: 1.00, pierce_block_round: 1 }],
                        requires: ['counter_attack'],
                        unlockCondition: 'wins_150',
                        thresholds: DEFAULT_THRESHOLDS.tier5,
                    },
                    champion: {
                        id: 'champion', tier: 5, name: 'Champion', emoji: '🥇',
                        type: 'progressive',
                        desc: '+50% gold from PvP. PvP cooldown reduced by 60%. +10% all stats.',
                        effects: [
                            { type: 'passive_pct', stat: 'pvp_gold_earn', value: 0.50 },
                            { type: 'class_modifier', id: 'pvp_cooldown_reduction', value: 0.60 },
                            { type: 'passive_pct', stat: 'all_stats', value: 0.10 }
                        ],
                        requires: ['gladiator_rush'],
                        unlockCondition: 'wins_500',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 3 }, 50: { legendary_fragment: 5 }, 75: { demon_alloy: 2 }, 100: { shadow_weave: 2 }
                        }),
                    },
                },
            },
        },
    },

        // ═══════════════════════════════════════════════════════════════════════════
    // MAGE
    // ═══════════════════════════════════════════════════════════════════════════
    mage: {
        description: 'Arcane scholars. Elemental mastery and magical devastation.',
        upgrade_penalties: { strength: 1.50, defense: 0.30 },
        upgrade_discounts: { magic: 0.35, agility: 0.10 },
        exclusive_branches: [['light_path', 'shadow_path']],

        branches: {
            // STARTER SKILL
            mage_training: {
                name: 'Mage Training',
                emoji: '🔮',
                description: 'The foundation of all magical power.',
                isStarter: true,
                skills: {
                    arcane_attunement: {
                        id: 'arcane_attunement', tier: 1, name: 'Arcane Attunement', emoji: '🔮',
                        type: 'progressive',
                        desc: '+12% Magic. Magic adds 15% to all damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.12 },
                            { type: 'class_modifier', id: 'magic_dmg_scale', value: 0.15 }
                        ],
                        requires: [],
                        unlockCondition: null,
                        thresholds: createThresholds({
                            10: {}, 25: { arcane_shard: 2 }, 50: { arcane_shard: 4 }, 75: { void_shard: 2 }, 100: { void_shard: 4 }
                        }),
                    },
                },
            },

            // BRANCH 1: Pyromancer
            pyromancer: {
                name: 'Pyromancer',
                emoji: '🔥',
                description: 'Command the flames. High burst fire damage with burning effects.',
                requires: { skill: 'arcane_attunement', minProgress: 10 },
                skills: {
                    fire_bolt: {
                        id: 'fire_bolt', tier: 2, name: 'Fire Bolt', emoji: '🔥',
                        type: 'progressive',
                        desc: '+15% Fire Damage.',
                        effects: [{ type: 'passive_pct', stat: 'pyro_dmg', value: 0.15 }],
                        requires: ['arcane_attunement'],
                        unlockCondition: null,
                        thresholds: MAGE_THRESHOLDS.tier2,
                    },
                    immolate: {
                        id: 'immolate', tier: 3, name: 'Immolate', emoji: '🌋',
                        type: 'progressive',
                        desc: '+20% Fire Damage. Enemies burn for 5% of damage dealt per round.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.20 },
                            { type: 'active_combat', id: 'burn_dot', dot_pct: 0.05, elem: 'pyro' }
                        ],
                        requires: ['fire_bolt'],
                        unlockCondition: 'level_10',
                        thresholds: MAGE_THRESHOLDS.tier3,
                    },
                    inferno: {
                        id: 'inferno', tier: 4, name: 'Inferno', emoji: '☄️',
                        type: 'progressive',
                        desc: 'Once per battle: deal (Magic × 2.5) fire damage, ignore resistance.',
                        effects: [{ type: 'active_combat', id: 'inferno', magic_mult: 2.5, ignore_resist: true, uses: 1 }],
                        requires: ['immolate'],
                        unlockCondition: 'level_20',
                        thresholds: MAGE_THRESHOLDS.tier4,
                    },
                    fire_lord: {
                        id: 'fire_lord', tier: 5, name: 'Fire Lord', emoji: '👑',
                        type: 'progressive',
                        desc: '+30% Fire Damage, +15% Magic. Burning deals 100% more damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.30 },
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'class_modifier', id: 'burn_amplify', bonus: 1.00 }
                        ],
                        requires: ['inferno'],
                        unlockCondition: 'level_35',
                        thresholds: MAGE_THRESHOLDS.tier5,
                    },
                    fire_mastery: {
                        id: 'fire_mastery', tier: 5, name: 'Fire Mastery', emoji: '👑🔥',
                        type: 'progressive',
                        desc: '+40% Fire Damage. Inferno can be used twice per battle.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.40 },
                            { type: 'active_combat', id: 'inferno', magic_mult: 3.0, ignore_resist: true, uses: 2 }
                        ],
                        requires: ['fire_lord'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { void_crystal: 3 }, 50: { legendary_fragment: 4 }, 75: { legendary_fragment: 6 }, 100: { demon_core: 3 }
                        }),
                    },
                },
            },

            // BRANCH 2: Cryomancer
            cryomancer: {
                name: 'Cryomancer',
                emoji: '❄️',
                description: 'Freeze and shatter. Water damage that slows and debilitates enemies.',
                requires: { skill: 'arcane_attunement', minProgress: 10 },
                skills: {
                    frost_bolt: {
                        id: 'frost_bolt', tier: 2, name: 'Frost Bolt', emoji: '❄️',
                        type: 'progressive',
                        desc: '+15% Water Damage.',
                        effects: [{ type: 'passive_pct', stat: 'water_dmg', value: 0.15 }],
                        requires: ['arcane_attunement'],
                        unlockCondition: null,
                        thresholds: MAGE_THRESHOLDS.tier2,
                    },
                    chill: {
                        id: 'chill', tier: 3, name: 'Chill', emoji: '🌨️',
                        type: 'progressive',
                        desc: '+20% Water Damage. Chilled enemies have -20% hit chance for 2 rounds.',
                        effects: [
                            { type: 'passive_pct', stat: 'water_dmg', value: 0.20 },
                            { type: 'active_combat', id: 'chill_debuff', hit_penalty: 0.20, duration_rounds: 2 }
                        ],
                        requires: ['frost_bolt'],
                        unlockCondition: 'level_10',
                        thresholds: MAGE_THRESHOLDS.tier3,
                    },
                    blizzard: {
                        id: 'blizzard', tier: 4, name: 'Blizzard', emoji: '🌀',
                        type: 'progressive',
                        desc: 'Deals (Magic × 1.5) water damage over 5 rounds.',
                        effects: [{ type: 'active_combat', id: 'blizzard', magic_mult: 1.5, split_rounds: 5 }],
                        requires: ['chill'],
                        unlockCondition: 'level_20',
                        thresholds: MAGE_THRESHOLDS.tier4,
                    },
                    absolute_zero: {
                        id: 'absolute_zero', tier: 5, name: 'Absolute Zero', emoji: '🧊',
                        type: 'progressive',
                        desc: '+30% Water Damage, +15% Magic, +25% Water Resist.',
                        effects: [
                            { type: 'passive_pct', stat: 'water_dmg', value: 0.30 },
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'passive_pct', stat: 'water_resist', value: 0.25 }
                        ],
                        requires: ['blizzard'],
                        unlockCondition: 'level_35',
                        thresholds: MAGE_THRESHOLDS.tier5,
                    },
                    permafrost: {
                        id: 'permafrost', tier: 5, name: 'Permafrost', emoji: '🧊❄️',
                        type: 'progressive',
                        desc: '+40% Water Damage. Chill effect lasts 4 rounds and reduces hit chance by 30%.',
                        effects: [
                            { type: 'passive_pct', stat: 'water_dmg', value: 0.40 },
                            { type: 'active_combat', id: 'chill_debuff', hit_penalty: 0.30, duration_rounds: 4 }
                        ],
                        requires: ['absolute_zero'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { void_crystal: 3 }, 50: { legendary_fragment: 4 }, 75: { legendary_fragment: 6 }, 100: { demon_core: 3 }
                        }),
                    },
                },
            },

            // BRANCH 3: Stormcaller
            stormcaller: {
                name: 'Stormcaller',
                emoji: '⚡',
                description: 'Harness wind and lightning. High crit electro damage with mobility.',
                requires: { skill: 'arcane_attunement', minProgress: 10 },
                skills: {
                    static_charge: {
                        id: 'static_charge', tier: 2, name: 'Static Charge', emoji: '⚡',
                        type: 'progressive',
                        desc: '+12% Electro Damage, +8% Wind Damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'electro_dmg', value: 0.12 },
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.08 }
                        ],
                        requires: ['arcane_attunement'],
                        unlockCondition: null,
                        thresholds: MAGE_THRESHOLDS.tier2,
                    },
                    lightning_strike: {
                        id: 'lightning_strike', tier: 3, name: 'Lightning Strike', emoji: '⛈️',
                        type: 'progressive',
                        desc: '25% chance to arc for +75% electro damage.',
                        effects: [{ type: 'active_combat', id: 'lightning_arc', proc_chance: 0.25, bonus_pct: 0.75, elem: 'electro' }],
                        requires: ['static_charge'],
                        unlockCondition: 'level_10',
                        thresholds: MAGE_THRESHOLDS.tier3,
                    },
                    tempest: {
                        id: 'tempest', tier: 4, name: 'Tempest', emoji: '🌪️',
                        type: 'progressive',
                        desc: 'Once per battle: 100% crit, guaranteed hit, double elemental damage.',
                        effects: [{ type: 'active_combat', id: 'tempest', guaranteed_hit: true, guaranteed_crit: true, elem_mult: 2.0, uses: 1 }],
                        requires: ['lightning_strike'],
                        unlockCondition: 'level_20',
                        thresholds: MAGE_THRESHOLDS.tier4,
                    },
                    storm_lord: {
                        id: 'storm_lord', tier: 5, name: 'Storm Lord', emoji: '🌩️',
                        type: 'progressive',
                        desc: '+25% Electro, +20% Wind, +15% Magic, +10% Agility.',
                        effects: [
                            { type: 'passive_pct', stat: 'electro_dmg', value: 0.25 },
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.20 },
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'passive_pct', stat: 'agility', value: 0.10 }
                        ],
                        requires: ['tempest'],
                        unlockCondition: 'level_35',
                        thresholds: MAGE_THRESHOLDS.tier5,
                    },
                    tempest_mastery: {
                        id: 'tempest_mastery', tier: 5, name: 'Tempest Mastery', emoji: '🌩️⚡',
                        type: 'progressive',
                        desc: '+35% Electro, +30% Wind. Tempest can be used twice per battle.',
                        effects: [
                            { type: 'passive_pct', stat: 'electro_dmg', value: 0.35 },
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.30 },
                            { type: 'active_combat', id: 'tempest', guaranteed_hit: true, guaranteed_crit: true, elem_mult: 2.5, uses: 2 }
                        ],
                        requires: ['storm_lord'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { void_crystal: 3 }, 50: { legendary_fragment: 4 }, 75: { legendary_fragment: 6 }, 100: { demon_core: 3 }
                        }),
                    },
                },
            },

            // BRANCH 4: Light Path (mutually exclusive with Shadow)
            light_path: {
                name: 'Path of Light',
                emoji: '☀️',
                description: 'Holy power. Healing, shields, and righteous damage.',
                exclusive_with: 'shadow_path',
                requires: { skill: 'arcane_attunement', minProgress: 10 },
                skills: {
                    holy_spark: {
                        id: 'holy_spark', tier: 2, name: 'Holy Spark', emoji: '✨',
                        type: 'progressive',
                        desc: '+10% Magic, +12% Max HP. Heal 8% HP at battle start.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.10 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.12 },
                            { type: 'active_combat', id: 'battle_start_heal', heal_pct: 0.08 }
                        ],
                        requires: ['arcane_attunement'],
                        unlockCondition: 'level_10',
                        thresholds: MAGE_THRESHOLDS.tier2,
                    },
                    radiance: {
                        id: 'radiance', tier: 3, name: 'Radiance', emoji: '🌟',
                        type: 'progressive',
                        desc: 'Heal 12% HP per round. Enemy deals 15% less damage.',
                        effects: [{ type: 'active_combat', id: 'radiance', heal_pct_per_round: 0.12, enemy_dmg_debuff: 0.15 }],
                        requires: ['holy_spark'],
                        unlockCondition: 'level_20',
                        thresholds: MAGE_THRESHOLDS.tier3,
                    },
                    divine_light: {
                        id: 'divine_light', tier: 4, name: 'Divine Light', emoji: '☀️',
                        type: 'progressive',
                        desc: 'Once per battle: heal 50% max HP to self or ally.',
                        effects: [{ type: 'active_combat', id: 'divine_light', heal_pct: 0.50, uses: 1 }],
                        requires: ['radiance'],
                        unlockCondition: 'level_35',
                        thresholds: MAGE_THRESHOLDS.tier4,
                    },
                    divine_ascension: {
                        id: 'divine_ascension', tier: 5, name: 'Divine Ascension', emoji: '👼',
                        type: 'progressive',
                        desc: '+20% Magic, +25% HP, +20% all resists. Resurrect once per battle with 30% HP.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.20 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.25 },
                            { type: 'resist_bonus', elems: ['pyro', 'water', 'wind', 'electro'], value: 20 },
                            { type: 'class_modifier', id: 'resurrection', hp_pct: 0.30 }
                        ],
                        requires: ['divine_light'],
                        unlockCondition: 'level_50',
                        thresholds: MAGE_THRESHOLDS.tier5,
                    },
                    holy_avatar: {
                        id: 'holy_avatar', tier: 5, name: 'Holy Avatar', emoji: '👼✨',
                        type: 'progressive',
                        desc: '+30% Magic, +35% HP. Divine Light can be used twice. Resurrection heals to 50%.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.30 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.35 },
                            { type: 'active_combat', id: 'divine_light', heal_pct: 0.50, uses: 2 },
                            { type: 'class_modifier', id: 'resurrection', hp_pct: 0.50 }
                        ],
                        requires: ['divine_ascension'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { void_crystal: 3 }, 50: { legendary_fragment: 5 }, 75: { legendary_fragment: 7 }, 100: { demon_core: 4 }
                        }),
                    },
                },
            },

            // BRANCH 5: Shadow Path (mutually exclusive with Light)
            shadow_path: {
                name: 'Path of Shadow',
                emoji: '🌑',
                description: 'Dark sorcery. Life drain, curses, and void magic.',
                exclusive_with: 'light_path',
                requires: { skill: 'arcane_attunement', minProgress: 10 },
                skills: {
                    dark_pact: {
                        id: 'dark_pact', tier: 2, name: 'Dark Pact', emoji: '🌑',
                        type: 'progressive',
                        desc: '+15% Magic, -8% Max HP. Drain 10% of damage dealt.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'passive_pct', stat: 'hp_max', value: -0.08 },
                            { type: 'active_combat', id: 'life_drain', pct: 0.10 }
                        ],
                        requires: ['arcane_attunement'],
                        unlockCondition: 'level_10',
                        thresholds: MAGE_THRESHOLDS.tier2,
                    },
                    void_curse: {
                        id: 'void_curse', tier: 3, name: 'Void Curse', emoji: '💀',
                        type: 'progressive',
                        desc: 'Curse: -25% resistance, -15% hit chance for whole battle.',
                        effects: [{ type: 'active_combat', id: 'void_curse', enemy_elem_resist_debuff: 0.25, enemy_hit_debuff: 0.15 }],
                        requires: ['dark_pact'],
                        unlockCondition: 'level_20',
                        thresholds: MAGE_THRESHOLDS.tier3,
                    },
                    shadow_step: {
                        id: 'shadow_step_mage', tier: 4, name: 'Shadow Step', emoji: '👻',
                        type: 'progressive',
                        desc: 'Teleport to avoid the first attack each battle. +15% dodge chance.',
                        effects: [
                            { type: 'active_combat', id: 'shadow_step_mage', teleport_first_hit: true },
                            { type: 'passive_pct', stat: 'dodge_chance', value: 0.15 }
                        ],
                        requires: ['void_curse'],
                        unlockCondition: 'level_35',
                        thresholds: MAGE_THRESHOLDS.tier4,
                    },
                    oblivion: {
                        id: 'oblivion', tier: 5, name: 'Oblivion', emoji: '🕳️',
                        type: 'progressive',
                        desc: '+25% Magic, -15% Max HP. Drain 25% damage. Shadow magic ignores all resistances.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: -0.15 },
                            { type: 'active_combat', id: 'life_drain', pct: 0.25 },
                            { type: 'class_modifier', id: 'ignore_resist_shadow' }
                        ],
                        requires: ['shadow_step'],
                        unlockCondition: 'level_50',
                        thresholds: MAGE_THRESHOLDS.tier5,
                    },
                    void_lord: {
                        id: 'void_lord', tier: 5, name: 'Void Lord', emoji: '🌑👑',
                        type: 'progressive',
                        desc: '+35% Magic. Life drain increased to 35%. Void Curse affects all enemies.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.35 },
                            { type: 'active_combat', id: 'life_drain', pct: 0.35 },
                            { type: 'active_combat', id: 'void_curse', aoe: true }
                        ],
                        requires: ['oblivion'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { void_crystal: 4 }, 50: { legendary_fragment: 5 }, 75: { legendary_fragment: 8 }, 100: { demon_core: 4 }
                        }),
                    },
                },
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ROGUE
    // ═══════════════════════════════════════════════════════════════════════════
    rogue: {
        description: 'Masters of stealth and precision. High critical damage and evasion.',
        upgrade_penalties: { defense: 0.30, magic: 0.20 },
        upgrade_discounts: { agility: 0.35, strength: 0.10 },
        passive_modifiers: [
            { condition: 'no_shield', stat: 'agility', bonus: 5, desc: '+5 Agility when no shield is equipped' },
        ],

        branches: {
            // STARTER SKILL
            rogue_training: {
                name: 'Rogue Training',
                emoji: '🗡️',
                description: 'The foundation of all rogue techniques.',
                isStarter: true,
                skills: {
                    basic_training: {
                        id: 'rogue_basic', tier: 1, name: 'Basic Training', emoji: '🗡️',
                        type: 'progressive',
                        desc: '+8% Agility and +5% Crit Chance.',
                        effects: [
                            { type: 'passive_pct', stat: 'agility', value: 0.08 },
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.05 }
                        ],
                        requires: [],
                        unlockCondition: null,
                        thresholds: createThresholds({
                            10: {}, 25: { tanned_hide: 2 }, 50: { tanned_hide: 4 }, 75: { shadow_essence: 2 }, 100: { shadow_essence: 4 }
                        }),
                    },
                },
            },

            // BRANCH 1: Assassin
            assassin: {
                name: 'Assassin',
                emoji: '🗡️',
                description: 'Lethal precision. High crit damage and finishing blows.',
                requires: { skill: 'rogue_basic', minProgress: 10 },
                skills: {
                    backstab: {
                        id: 'backstab', tier: 2, name: 'Backstab', emoji: '🔪',
                        type: 'progressive',
                        desc: 'Round 1: +80% damage, cannot be blocked.',
                        effects: [{ type: 'active_combat', id: 'backstab', round: 1, dmg_bonus: 0.80, pierce_block: true }],
                        requires: ['rogue_basic'],
                        unlockCondition: null,
                        thresholds: ROGUE_THRESHOLDS.tier2,
                    },
                    expose_weakness: {
                        id: 'expose_weakness', tier: 3, name: 'Expose Weakness', emoji: '🎯',
                        type: 'progressive',
                        desc: '+12% Crit Chance.',
                        effects: [{ type: 'passive_pct', stat: 'crit_chance', value: 0.12 }],
                        requires: ['backstab'],
                        unlockCondition: 'wins_20',
                        thresholds: ROGUE_THRESHOLDS.tier3,
                    },
                    venomfang: {
                        id: 'venomfang', tier: 4, name: 'Venomfang', emoji: '🐍',
                        type: 'progressive',
                        desc: 'Each hit applies poison: 8% of damage per round.',
                        effects: [{ type: 'active_combat', id: 'venomfang', poison_pct: 0.08 }],
                        requires: ['expose_weakness'],
                        unlockCondition: 'wins_50',
                        thresholds: ROGUE_THRESHOLDS.tier4,
                    },
                    death_mark: {
                        id: 'death_mark', tier: 5, name: 'Death Mark', emoji: '☠️',
                        type: 'progressive',
                        desc: 'Mark enemy: next hit deals (Agility × 3) bonus damage.',
                        effects: [{ type: 'active_combat', id: 'death_mark', agility_mult: 3.0, uses: 1 }],
                        requires: ['venomfang'],
                        unlockCondition: 'wins_150',
                        thresholds: ROGUE_THRESHOLDS.tier5,
                    },
                    shadow_reaper: {
                        id: 'shadow_reaper', tier: 5, name: 'Shadow Reaper', emoji: '💀',
                        type: 'progressive',
                        desc: '+20% Crit Chance, +15% Strength, +15% Agility. Crits ignore 50% armor.',
                        effects: [
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.20 },
                            { type: 'passive_pct', stat: 'strength', value: 0.15 },
                            { type: 'passive_pct', stat: 'agility', value: 0.15 },
                            { type: 'class_modifier', id: 'crit_armour_pierce', pct: 0.50 }
                        ],
                        requires: ['death_mark'],
                        unlockCondition: 'wins_500',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 3 }, 50: { legendary_fragment: 5 }, 75: { shadow_weave: 2 }, 100: { demon_core: 3 }
                        }),
                    },
                },
            },

            // BRANCH 2: Trickster
            trickster: {
                name: 'Trickster',
                emoji: '🃏',
                description: 'Unpredictable and evasive. High dodge and misdirection.',
                requires: { skill: 'rogue_basic', minProgress: 10 },
                skills: {
                    feint: {
                        id: 'feint', tier: 2, name: 'Feint', emoji: '💨',
                        type: 'progressive',
                        desc: '+10% Agility.',
                        effects: [{ type: 'passive_pct', stat: 'agility', value: 0.10 }],
                        requires: ['rogue_basic'],
                        unlockCondition: null,
                        thresholds: ROGUE_THRESHOLDS.tier2,
                    },
                    shadow_step: {
                        id: 'shadow_step', tier: 3, name: 'Shadow Step', emoji: '👻',
                        type: 'progressive',
                        desc: '+50% dodge chance for whole battle.',
                        effects: [{ type: 'active_combat', id: 'shadow_step', dodge_bonus: 0.50 }],
                        requires: ['feint'],
                        unlockCondition: 'level_10',
                        thresholds: ROGUE_THRESHOLDS.tier3,
                    },
                    smoke_bomb: {
                        id: 'smoke_bomb', tier: 4, name: 'Smoke Bomb', emoji: '💣',
                        type: 'progressive',
                        desc: 'Rounds 1-3: enemy has 40% chance to miss.',
                        effects: [{ type: 'active_combat', id: 'smoke_bomb', enemy_miss_chance: 0.40, rounds: [1, 2, 3] }],
                        requires: ['shadow_step'],
                        unlockCondition: 'level_20',
                        thresholds: ROGUE_THRESHOLDS.tier4,
                    },
                    phantom_strikes: {
                        id: 'phantom_strikes', tier: 5, name: 'Phantom Strikes', emoji: '🌀',
                        type: 'progressive',
                        desc: '+15% Agility. Dodge procs 25% damage counter.',
                        effects: [
                            { type: 'passive_pct', stat: 'agility', value: 0.15 },
                            { type: 'active_combat', id: 'phantom_counter', counter_on_dodge_pct: 0.25 }
                        ],
                        requires: ['smoke_bomb'],
                        unlockCondition: 'level_35',
                        thresholds: ROGUE_THRESHOLDS.tier5,
                    },
                    ghost_form: {
                        id: 'ghost_form', tier: 5, name: 'Ghost Form', emoji: '👁️',
                        type: 'progressive',
                        desc: '+25% Agility. 50% chance to negate incoming crits.',
                        effects: [
                            { type: 'passive_pct', stat: 'agility', value: 0.25 },
                            { type: 'active_combat', id: 'negate_crit', chance: 0.50 }
                        ],
                        requires: ['phantom_strikes'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 3 }, 50: { legendary_fragment: 5 }, 75: { shadow_weave: 2 }, 100: { demon_core: 3 }
                        }),
                    },
                },
            },

            // BRANCH 3: Shadowblade
            shadowblade: {
                name: 'Shadowblade',
                emoji: '🌑',
                description: 'Strike from darkness. Shadow-infused blades deal bonus elemental damage.',
                requires: { skill: 'rogue_basic', minProgress: 10 },
                skills: {
                    shadow_coat: {
                        id: 'shadow_coat', tier: 2, name: 'Shadow Coat', emoji: '🌑',
                        type: 'progressive',
                        desc: '+12% Wind Damage.',
                        effects: [{ type: 'passive_pct', stat: 'wind_dmg', value: 0.12 }],
                        requires: ['rogue_basic'],
                        unlockCondition: null,
                        thresholds: ROGUE_THRESHOLDS.tier2,
                    },
                    nightfall: {
                        id: 'nightfall', tier: 3, name: 'Nightfall', emoji: '🌒',
                        type: 'progressive',
                        desc: '+18% Wind Damage. Reduce enemy hit chance by 20%.',
                        effects: [
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.18 },
                            { type: 'active_combat', id: 'darkness_debuff', enemy_hit_debuff: 0.20 }
                        ],
                        requires: ['shadow_coat'],
                        unlockCondition: 'level_10',
                        thresholds: ROGUE_THRESHOLDS.tier3,
                    },
                    void_blade: {
                        id: 'void_blade', tier: 4, name: 'Void Blade', emoji: '🗡️',
                        type: 'progressive',
                        desc: '30% chance to deal bonus electro+wind damage equal to 150% Agility.',
                        effects: [{ type: 'active_combat', id: 'void_blade', proc_chance: 0.30, bonus_from_stat: 'agility', bonus_mult: 1.50, elems: ['electro', 'wind'] }],
                        requires: ['nightfall'],
                        unlockCondition: 'level_20',
                        thresholds: ROGUE_THRESHOLDS.tier4,
                    },
                    shadow_master: {
                        id: 'shadow_master', tier: 5, name: 'Shadow Master', emoji: '🌑👑',
                        type: 'progressive',
                        desc: '+25% Wind Damage, +15% Agility. Void Blade procs on every hit.',
                        effects: [
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.25 },
                            { type: 'passive_pct', stat: 'agility', value: 0.15 },
                            { type: 'active_combat', id: 'void_blade', proc_chance: 1.00, bonus_from_stat: 'agility', bonus_mult: 1.50, elems: ['electro', 'wind'] }
                        ],
                        requires: ['void_blade'],
                        unlockCondition: 'level_50',
                        thresholds: ROGUE_THRESHOLDS.tier5,
                    },
                    shadow_incarnate: {
                        id: 'shadow_incarnate', tier: 5, name: 'Shadow Incarnate', emoji: '🌑✨',
                        type: 'progressive',
                        desc: '+35% Wind Damage, +20% Agility. Darkness debuff reduces hit chance by 35%.',
                        effects: [
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.35 },
                            { type: 'passive_pct', stat: 'agility', value: 0.20 },
                            { type: 'active_combat', id: 'darkness_debuff', enemy_hit_debuff: 0.35 }
                        ],
                        requires: ['shadow_master'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 4 }, 50: { legendary_fragment: 6 }, 75: { shadow_weave: 3 }, 100: { demon_core: 4 }
                        }),
                    },
                },
            },

            // BRANCH 4: Dual Wielder (Secret - unlocks with kills_no_shield)
            dual_wielder: {
                name: 'Dual Wielder',
                emoji: '⚔️⚔️',
                description: 'Secret path. Drop the shield, double the blades.',
                hidden: true,
                requires: { skill: 'rogue_basic', minProgress: 50, condition: 'kills_no_shield' },
                skills: {
                    off_hand_training: {
                        id: 'off_hand_training', tier: 3, name: 'Off-Hand Training', emoji: '🤜',
                        type: 'progressive',
                        desc: 'Equip second weapon in shield slot. Off-hand deals 60% damage.',
                        effects: [{ type: 'class_modifier', id: 'dual_wield_unlock', off_hand_dmg_pct: 0.60 }],
                        requires: ['rogue_basic'],
                        unlockCondition: 'kills_no_shield',
                        thresholds: ROGUE_THRESHOLDS.tier3,
                    },
                    ambidexterity: {
                        id: 'ambidexterity', tier: 4, name: 'Ambidexterity', emoji: '🤝',
                        type: 'progressive',
                        desc: 'Off-hand damage increases to 85%. +10% Attack Speed.',
                        effects: [
                            { type: 'class_modifier', id: 'dual_wield_dmg_pct', off_hand_dmg_pct: 0.85 },
                            { type: 'passive_pct', stat: 'attack_speed', value: 0.10 }
                        ],
                        requires: ['off_hand_training'],
                        unlockCondition: 'wins_150',
                        thresholds: ROGUE_THRESHOLDS.tier4,
                    },
                    blade_storm: {
                        id: 'blade_storm', tier: 5, name: 'Blade Storm', emoji: '🌀',
                        type: 'progressive',
                        desc: 'Once per battle: both weapons strike for full damage, ignore blocks.',
                        effects: [{ type: 'active_combat', id: 'blade_storm', dual_strike: true, pierce_block: true, uses: 1 }],
                        requires: ['ambidexterity'],
                        unlockCondition: 'wins_500',
                        thresholds: ROGUE_THRESHOLDS.tier5,
                    },
                    twin_agility: {
                        id: 'twin_agility', tier: 5, name: 'Twin Agility', emoji: '💨',
                        type: 'progressive',
                        desc: '+25% Agility permanently.',
                        effects: [{ type: 'passive_pct', stat: 'agility', value: 0.25 }],
                        requires: ['off_hand_training'],
                        unlockCondition: null,
                        thresholds: createThresholds({
                            10: {}, 25: { shadow_essence: 4 }, 50: { void_crystal: 2 }, 75: { legendary_fragment: 3 }, 100: { shadow_weave: 2 }
                        }),
                    },
                },
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PALADIN
    // ═══════════════════════════════════════════════════════════════════════════
    paladin: {
        description: 'Holy warriors. Unbreakable defense and divine justice.',
        upgrade_penalties: { agility: 0.60, strength: 0.20 },
        upgrade_discounts: { defense: 0.25, magic: 0.20, vitality: 0.15 },

        branches: {
            // STARTER SKILL
            paladin_training: {
                name: 'Paladin Training',
                emoji: '✨',
                description: 'The foundation of all paladin oaths.',
                isStarter: true,
                skills: {
                    divine_favor: {
                        id: 'divine_favor', tier: 1, name: 'Divine Favor', emoji: '🙏',
                        type: 'progressive',
                        desc: '+10% Magic and +8% Defense.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.10 },
                            { type: 'passive_pct', stat: 'defense', value: 0.08 }
                        ],
                        requires: [],
                        unlockCondition: null,
                        thresholds: createThresholds({
                            10: {}, 25: { arcane_shard: 2 }, 50: { arcane_shard: 4 }, 75: { holy_essence: 2 }, 100: { holy_essence: 4 }
                        }),
                    },
                },
            },

            // BRANCH 1: Protector
            protector: {
                name: 'Protector',
                emoji: '🏰',
                description: 'Maximum survivability. Shields, blocks, and unbreakable defence.',
                requires: { skill: 'divine_favor', minProgress: 10 },
                skills: {
                    stalwart: {
                        id: 'stalwart', tier: 2, name: 'Stalwart', emoji: '⚓',
                        type: 'progressive',
                        desc: '+12% Defense, +10% Vitality.',
                        effects: [
                            { type: 'passive_pct', stat: 'defense', value: 0.12 },
                            { type: 'passive_pct', stat: 'vitality', value: 0.10 }
                        ],
                        requires: ['divine_favor'],
                        unlockCondition: null,
                        thresholds: PALADIN_THRESHOLDS.tier2,
                    },
                    aegis: {
                        id: 'aegis', tier: 3, name: 'Aegis', emoji: '🛡️',
                        type: 'progressive',
                        desc: '+40% block effectiveness.',
                        effects: [{ type: 'passive_pct', stat: 'block_effectiveness', value: 0.40 }],
                        requires: ['stalwart'],
                        unlockCondition: 'level_10',
                        thresholds: PALADIN_THRESHOLDS.tier3,
                    },
                    fortress_stance: {
                        id: 'fortress_stance', tier: 4, name: 'Fortress Stance', emoji: '🗼',
                        type: 'progressive',
                        desc: '+15% Armor, +12% Defense. First hit each battle is auto-blocked.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.15 },
                            { type: 'passive_pct', stat: 'defense', value: 0.12 },
                            { type: 'active_combat', id: 'auto_block_first_hit' }
                        ],
                        requires: ['aegis'],
                        unlockCondition: 'level_20',
                        thresholds: PALADIN_THRESHOLDS.tier4,
                    },
                    impenetrable: {
                        id: 'impenetrable', tier: 5, name: 'Impenetrable', emoji: '💎',
                        type: 'progressive',
                        desc: '+20% Armor, +25% Max HP. Reduce physical damage by 20%.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.20 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.25 },
                            { type: 'passive_pct', stat: 'phys_dmg_taken', value: -0.20 }
                        ],
                        requires: ['fortress_stance'],
                        unlockCondition: 'level_35',
                        thresholds: PALADIN_THRESHOLDS.tier5,
                    },
                    guardian: {
                        id: 'guardian', tier: 5, name: 'Guardian', emoji: '👑',
                        type: 'progressive',
                        desc: '+30% Defense, +25% Armor, +40% HP. Reduce ALL damage by 25%.',
                        effects: [
                            { type: 'passive_pct', stat: 'defense', value: 0.30 },
                            { type: 'passive_pct', stat: 'armor', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.40 },
                            { type: 'passive_pct', stat: 'dmg_taken', value: -0.25 }
                        ],
                        requires: ['impenetrable'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 3 }, 50: { legendary_fragment: 5 }, 75: { demon_alloy: 2 }, 100: { demon_alloy: 3 }
                        }),
                    },
                },
            },

            // BRANCH 2: Divine Warrior
            divine_warrior: {
                name: 'Divine Warrior',
                emoji: '✨',
                description: 'Holy strikes and divine healing.',
                requires: { skill: 'divine_favor', minProgress: 10 },
                skills: {
                    holy_strike: {
                        id: 'holy_strike', tier: 2, name: 'Holy Strike', emoji: '⚡',
                        type: 'progressive',
                        desc: '+25% damage. Heal 12% of damage dealt.',
                        effects: [{ type: 'active_combat', id: 'holy_strike', dmg_bonus: 0.25, heal_pct: 0.12 }],
                        requires: ['divine_favor'],
                        unlockCondition: null,
                        thresholds: PALADIN_THRESHOLDS.tier2,
                    },
                    consecrate: {
                        id: 'consecrate', tier: 3, name: 'Consecrate', emoji: '🌿',
                        type: 'progressive',
                        desc: 'Reflect 25% of damage received.',
                        effects: [{ type: 'active_combat', id: 'consecrate', reflect_pct: 0.25 }],
                        requires: ['holy_strike'],
                        unlockCondition: 'wins_20',
                        thresholds: PALADIN_THRESHOLDS.tier3,
                    },
                    divine_judgment: {
                        id: 'divine_judgment', tier: 4, name: 'Divine Judgment', emoji: '⚖️',
                        type: 'progressive',
                        desc: 'Once per battle: deal (Defense × 2.5) holy damage, ignore armor.',
                        effects: [{ type: 'active_combat', id: 'divine_judgment', defense_mult: 2.5, ignore_armour: true, uses: 1 }],
                        requires: ['consecrate'],
                        unlockCondition: 'level_20',
                        thresholds: PALADIN_THRESHOLDS.tier4,
                    },
                    avatar_of_justice: {
                        id: 'avatar_of_justice', tier: 5, name: 'Avatar of Justice', emoji: '☀️',
                        type: 'progressive',
                        desc: '+20% Magic, +15% Defense. Reflect 35% damage. Heal 12% per round.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.20 },
                            { type: 'passive_pct', stat: 'defense', value: 0.15 },
                            { type: 'active_combat', id: 'consecrate', reflect_pct: 0.35 },
                            { type: 'active_combat', id: 'holy_regen', heal_pct_per_round: 0.12 }
                        ],
                        requires: ['divine_judgment'],
                        unlockCondition: 'level_35',
                        thresholds: PALADIN_THRESHOLDS.tier5,
                    },
                    divine_wrath: {
                        id: 'divine_wrath', tier: 5, name: 'Divine Wrath', emoji: '☀️⚡',
                        type: 'progressive',
                        desc: '+30% Magic, +20% Defense. Divine Judgment can be used twice. Reflect 45% damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.30 },
                            { type: 'passive_pct', stat: 'defense', value: 0.20 },
                            { type: 'active_combat', id: 'divine_judgment', defense_mult: 3.0, ignore_armour: true, uses: 2 },
                            { type: 'active_combat', id: 'consecrate', reflect_pct: 0.45 }
                        ],
                        requires: ['avatar_of_justice'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 4 }, 50: { legendary_fragment: 6 }, 75: { demon_alloy: 3 }, 100: { demon_alloy: 4 }
                        }),
                    },
                },
            },

            // BRANCH 3: Inquisitor
            inquisitor: {
                name: 'Inquisitor',
                emoji: '🔎',
                description: 'Punish weakness. Bonus damage to vulnerable enemies.',
                requires: { skill: 'divine_favor', minProgress: 10 },
                skills: {
                    judgement: {
                        id: 'judgement', tier: 2, name: 'Judgement', emoji: '⚖️',
                        type: 'progressive',
                        desc: '+8% Hit Chance, +6% Crit Chance.',
                        effects: [
                            { type: 'passive_pct', stat: 'hit_chance', value: 0.08 },
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.06 }
                        ],
                        requires: ['divine_favor'],
                        unlockCondition: null,
                        thresholds: PALADIN_THRESHOLDS.tier2,
                    },
                    expose: {
                        id: 'expose', tier: 3, name: 'Expose', emoji: '🎯',
                        type: 'progressive',
                        desc: '+20% Crit Chance for whole battle.',
                        effects: [{ type: 'active_combat', id: 'expose', crit_bonus: 0.20 }],
                        requires: ['judgement'],
                        unlockCondition: 'wins_20',
                        thresholds: PALADIN_THRESHOLDS.tier3,
                    },
                    crusader_oath: {
                        id: 'crusader_oath', tier: 4, name: 'Crusader\'s Oath', emoji: '📜',
                        type: 'progressive',
                        desc: '+50% damage against enemies below 40% HP.',
                        effects: [{ type: 'active_combat', id: 'crusader_oath', hp_threshold: 0.40, dmg_bonus: 0.50 }],
                        requires: ['expose'],
                        unlockCondition: 'wins_50',
                        thresholds: PALADIN_THRESHOLDS.tier4,
                    },
                    sanctioned_strike: {
                        id: 'sanctioned_strike', tier: 5, name: 'Sanctioned Strike', emoji: '✝️',
                        type: 'progressive',
                        desc: 'Critical hits heal for 30% of crit damage.',
                        effects: [{ type: 'active_combat', id: 'sanctioned_strike', crit_heal_pct: 0.30 }],
                        requires: ['crusader_oath'],
                        unlockCondition: 'level_35',
                        thresholds: PALADIN_THRESHOLDS.tier5,
                    },
                    divine_shield: {
                        id: 'divine_shield', tier: 5, name: 'Divine Shield', emoji: '🌟',
                        type: 'progressive',
                        desc: 'Negate first hit each battle. Crit heal increased to 50%. +15% Crit Chance.',
                        effects: [
                            { type: 'active_combat', id: 'divine_shield', negate_first_hit: true },
                            { type: 'active_combat', id: 'sanctioned_strike', crit_heal_pct: 0.50 },
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.15 }
                        ],
                        requires: ['sanctioned_strike'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 4 }, 50: { legendary_fragment: 6 }, 75: { demon_alloy: 3 }, 100: { demon_alloy: 4 }
                        }),
                    },
                },
            },

            // BRANCH 4: Crusader
            crusader: {
                name: 'Crusader',
                emoji: '⚔️',
                description: 'Holy fire damage and relentless advance.',
                requires: { skill: 'divine_favor', minProgress: 10 },
                skills: {
                    holy_aura: {
                        id: 'holy_aura', tier: 2, name: 'Holy Aura', emoji: '🌅',
                        type: 'progressive',
                        desc: '+15% Fire Damage, +8% all resistances.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.15 },
                            { type: 'resist_bonus', elems: ['pyro', 'water', 'wind', 'electro'], value: 8 }
                        ],
                        requires: ['divine_favor'],
                        unlockCondition: null,
                        thresholds: PALADIN_THRESHOLDS.tier2,
                    },
                    righteous_fury: {
                        id: 'righteous_fury', tier: 3, name: 'Righteous Fury', emoji: '💥',
                        type: 'progressive',
                        desc: '+20% Fire Damage. Damage increases by 8% per round.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.20 },
                            { type: 'active_combat', id: 'momentum', dmg_per_round_pct: 0.08 }
                        ],
                        requires: ['holy_aura'],
                        unlockCondition: 'level_10',
                        thresholds: PALADIN_THRESHOLDS.tier3,
                    },
                    holy_crusade: {
                        id: 'holy_crusade', tier: 4, name: 'Holy Crusade', emoji: '🏳️',
                        type: 'progressive',
                        desc: 'Once per battle: deal (Magic + Defense) × 1.8 holy damage, ignore resist.',
                        effects: [{ type: 'active_combat', id: 'holy_crusade', stats_sum: ['magic', 'defense'], multiplier: 1.8, ignore_resist: true, uses: 1 }],
                        requires: ['righteous_fury'],
                        unlockCondition: 'level_20',
                        thresholds: PALADIN_THRESHOLDS.tier4,
                    },
                    undying_crusader: {
                        id: 'undying_crusader', tier: 5, name: 'Undying Crusader', emoji: '🕊️',
                        type: 'progressive',
                        desc: '+25% Magic, +20% all resists, +30% HP. Holy fire deals +60% damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.30 },
                            { type: 'resist_bonus', elems: ['pyro', 'water', 'wind', 'electro'], value: 20 },
                            { type: 'class_modifier', id: 'holy_fire_amplify', bonus: 0.60 }
                        ],
                        requires: ['holy_crusade'],
                        unlockCondition: 'level_35',
                        thresholds: PALADIN_THRESHOLDS.tier5,
                    },
                    crusader_king: {
                        id: 'crusader_king', tier: 5, name: 'Crusader King', emoji: '👑⚔️',
                        type: 'progressive',
                        desc: '+35% Magic, +30% all resists. Holy Crusade can be used twice. Holy fire deals +100% damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.35 },
                            { type: 'resist_bonus', elems: ['pyro', 'water', 'wind', 'electro'], value: 30 },
                            { type: 'active_combat', id: 'holy_crusade', stats_sum: ['magic', 'defense'], multiplier: 2.0, ignore_resist: true, uses: 2 },
                            { type: 'class_modifier', id: 'holy_fire_amplify', bonus: 1.00 }
                        ],
                        requires: ['undying_crusader'],
                        unlockCondition: 'level_60',
                        thresholds: createThresholds({
                            10: {}, 25: { legendary_fragment: 5 }, 50: { legendary_fragment: 8 }, 75: { demon_alloy: 4 }, 100: { demon_alloy: 6 }
                        }),
                    },
                },
            },
        },
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS (same as before, but computePassiveBonuses needs to handle percentage)
// ═══════════════════════════════════════════════════════════════════════════════

function meetsUnlockCondition(char, condId, stats = {}) {
    if (!condId) return true;
    const cond = UNLOCK_CONDITIONS[condId];
    if (!cond) return false;
    const target = stats[cond.type] ?? char[cond.type] ?? 0;
    return target >= cond.value;
}

function getVisibleSkillTree(className, char, learnedMap = {}, extraStats = {}, hasActiveTraining = false) {
    const tree = SKILL_TREES[className];
    if (!tree) return null;

    const result = { ...tree, branches: {} };
    
    // Track which branches are locked due to exclusivity
    const exclusiveGroups = tree.exclusive_branches || [];
    let activeBranch = null;
    
    // Find which branch the player has already invested in
    for (const group of exclusiveGroups) {
        for (const branchId of group) {
            const branch = tree.branches[branchId];
            if (branch && Object.keys(branch.skills).some(skillId => learnedMap[skillId])) {
                activeBranch = branchId;
                break;
            }
        }
        if (activeBranch) break;
    }

    for (const [branchId, branch] of Object.entries(tree.branches)) {
        // Skip completely hidden branches (like dual_wielder) until unlocked
        if (branch.hidden) {
            const anyVisible = Object.values(branch.skills).some(sk =>
                meetsUnlockCondition(char, sk.unlockCondition, extraStats)
            );
            if (!anyVisible) continue;
        }
        
        // Check if this branch is locked by exclusivity
        let isExclusiveLocked = false;
        if (activeBranch && activeBranch !== branchId) {
            // Check if they are in the same exclusive group
            for (const group of exclusiveGroups) {
                if (group.includes(activeBranch) && group.includes(branchId)) {
                    isExclusiveLocked = true;
                    break;
                }
            }
        }

        const enrichedSkills = {};
        let hasVisibleSkill = false;

        for (const [skId, sk] of Object.entries(branch.skills)) {
            const learned = !!learnedMap[skId];
            const prereqsMet = sk.requires.every(r => !!learnedMap[r]);
            const condMet = meetsUnlockCondition(char, sk.unlockCondition, extraStats);
            
            // If branch is exclusive-locked, only show already learned skills
            const isVisible = learned || (!isExclusiveLocked && prereqsMet && condMet);
            
            if (!isVisible) continue;
            
            hasVisibleSkill = true;
            const trainable = !learned && prereqsMet && condMet && !hasActiveTraining && !isExclusiveLocked;
            const isLocked = !learned && !trainable;
            
            enrichedSkills[skId] = {
                ...sk,
                learned,
                trainable: trainable,
                locked: isLocked || isExclusiveLocked,
                exclusiveLocked: isExclusiveLocked && !learned,
                prereqsMet,
                condMet,
                unlockConditionDesc: isLocked ? '???' : (sk.unlockConditionDesc || null),
            };
        }

        // Only show branch if it has at least one visible skill OR it's the active branch
        if (hasVisibleSkill || activeBranch === branchId) {
            result.branches[branchId] = { 
                ...branch, 
                skills: enrichedSkills,
                description: learnedMap[Object.keys(branch.skills)[0]] ? branch.description : '???',
                exclusiveLocked: isExclusiveLocked && activeBranch !== branchId,
            };
        }
    }

    return result;
}

// Get skill thresholds
function getSkillThresholds(skillId, className) {
    const tree = SKILL_TREES[className];
    for (const branch of Object.values(tree.branches)) {
        if (branch.skills[skillId]) {
            return branch.skills[skillId].thresholds || {};
        }
    }
    return {};
}

// Check if player can train past a threshold
function canTrainPastThreshold(char, skillId, targetProgress, db) {
    const thresholds = getSkillThresholds(skillId, char.class);
    const currentProgress = getSkillProgress(char.id, skillId, db);
    
    // Find the next threshold
    const nextThreshold = Object.keys(thresholds)
        .map(Number)
        .find(t => t > currentProgress && t <= targetProgress);
    
    if (!nextThreshold) return true;
    
    const requiredMats = thresholds[nextThreshold].materials;
    if (!requiredMats || Object.keys(requiredMats).length === 0) return true;
    
    // Check if player has materials
    return hasMaterials(char.id, requiredMats, db);
}

// Calculate skill effectiveness based on progress
function getSkillEffectiveness(skillId, charId, db) {
    const progress = getSkillProgress(charId, skillId, db);
    const skill = getSkillById(skillId, char.class);
    
    if (!skill || !skill.effects) return null;
    
    const effectiveness = Math.min(1, progress / 100);
    
    // Scale all effects by effectiveness
    const scaledEffects = skill.effects.map(effect => {
        const scaled = { ...effect };
        if (effect.dmg_bonus) scaled.dmg_bonus = effect.dmg_bonus * effectiveness;
        if (effect.crit_bonus) scaled.crit_bonus = effect.crit_bonus * effectiveness;
        if (effect.dodge_bonus) scaled.dodge_bonus = effect.dodge_bonus * effectiveness;
        // Add more as needed
        return scaled;
    });
    
    return { effects: scaledEffects, progress, effectiveness };
}

function computePassiveBonuses(className, learnedSkillIds) {
    const tree = SKILL_TREES[className];
    if (!tree) return {};
    const bonuses = {};

    const addBonus = (stat, value, isPercent = true) => {
        if (isPercent) {
            bonuses[stat] = (bonuses[stat] || 0) + value;
        } else {
            bonuses[`${stat}_flat`] = (bonuses[`${stat}_flat`] || 0) + value;
        }
    };

    for (const branch of Object.values(tree.branches)) {
        for (const sk of Object.values(branch.skills)) {
            if (!learnedSkillIds.includes(sk.id)) continue;
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'passive_pct') {
                    addBonus(eff.stat, eff.value, true);
                } else if (eff.type === 'passive_stat') {
                    addBonus(eff.stat, eff.value, false);
                } else if (eff.type === 'resist_bonus') {
                    for (const elem of (eff.elems || [])) {
                        addBonus(`${elem}_resist`, eff.value, false);
                    }
                }
            }
        }
    }

    return bonuses;
}

function computeActiveCombatEffects(className, learnedSkillIds) {
    const tree = SKILL_TREES[className];
    if (!tree) return [];
    const effects = [];
    for (const branch of Object.values(tree.branches)) {
        for (const sk of Object.values(branch.skills)) {
            if (!learnedSkillIds.includes(sk.id)) continue;
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'active_combat') effects.push({ ...eff, sourceSkill: sk.id });
            }
        }
    }
    return effects;
}

function computeClassModifiers(className, learnedSkillIds) {
    const tree = SKILL_TREES[className];
    if (!tree) return [];
    const mods = [];
    for (const branch of Object.values(tree.branches)) {
        for (const sk of Object.values(branch.skills)) {
            if (!learnedSkillIds.includes(sk.id)) continue;
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'class_modifier') mods.push({ ...eff, sourceSkill: sk.id });
            }
        }
    }
    return mods;
}

function applyClassUpgradeCostModifier(className, stat, baseCost, learnedSkills = []) {
    const tree = SKILL_TREES[className];
    if (!tree) return baseCost;
    
    let cost = baseCost;
    const penalty = tree.upgrade_penalties?.[stat] || 0;
    cost = Math.floor(cost * (1 + penalty));
    const discount = tree.upgrade_discounts?.[stat] || 0;
    cost = Math.floor(cost * (1 - discount));
    return Math.max(10, cost);
}

function rogueHasDualWield(learnedSkillIds) {
    return learnedSkillIds.includes('off_hand_training');
}

function magePath(learnedSkillIds) {
    const shadowSkills = Object.keys(SKILL_TREES.mage.branches.shadow_path.skills);
    const lightSkills  = Object.keys(SKILL_TREES.mage.branches.light_path.skills);
    if (shadowSkills.some(s => learnedSkillIds.includes(s))) return 'shadow';
    if (lightSkills.some(s  => learnedSkillIds.includes(s))) return 'light';
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB SCHEMA ADDITIONS
// ═══════════════════════════════════════════════════════════════════════════════
const SKILL_TREE_MIGRATIONS = [
    `CREATE TABLE IF NOT EXISTS character_skill_tree (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id     INTEGER NOT NULL,
        skill_id    TEXT    NOT NULL,
        branch_id   TEXT    NOT NULL,
        class       TEXT    NOT NULL,
        learned_at  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(char_id, skill_id)
    )`,
    `CREATE TABLE IF NOT EXISTS skill_training (
        char_id      INTEGER PRIMARY KEY,
        skill_id     TEXT    NOT NULL,
        branch_id    TEXT    NOT NULL,
        started_at   INTEGER NOT NULL,
        ends_at      INTEGER NOT NULL
    )`,
    `ALTER TABLE characters ADD COLUMN hard_missions_completed INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN total_missions_completed INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN wins_without_shield INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN elemental_kills INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN dungeon_no_death_runs INTEGER DEFAULT 0`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS ROUTER (same as before)
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();

async function loadCharWithSkills(db, userId) {
    const char = await db.execute({ sql: 'SELECT * FROM characters WHERE user_id=?', args: [userId] });
    const c = char.rows[0];
    if (!c) return { char: null, learned: [], learnedMap: {} };
    const rows = await db.execute({
        sql: 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', args: [c.id]
    });
    const learned = rows.rows.map(r => r.skill_id);
    const learnedMap = Object.fromEntries(learned.map(s => [s, true]));
    return { char: c, learned, learnedMap };
}

router.get('/tree', async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = await getDb();
        const { char, learned, learnedMap } = await loadCharWithSkills(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });

        const extraStats = {
            wins_no_shield:       char.wins_without_shield          || 0,
            hard_missions:        char.hard_missions_completed       || 0,
            total_missions:       char.total_missions_completed      || 0,
            elemental_kills:      char.elemental_kills               || 0,
            dungeon_no_death_run: char.dungeon_no_death_runs         || 0,
        };

        const trainingRow = await db.execute({
            sql: 'SELECT * FROM skill_training WHERE char_id=?', args: [char.id]
        });
        const hasActiveTraining = trainingRow.rows.length > 0 && trainingRow.rows[0].ends_at > Math.floor(Date.now() / 1000);

        const tree = getVisibleSkillTree(char.class, char, learnedMap, extraStats, hasActiveTraining);
        const passives = computePassiveBonuses(char.class, learned);
        const mods = computeClassModifiers(char.class, learned);
        const dualWield = char.class === 'rogue' && rogueHasDualWield(learned);
        const mPath = char.class === 'mage' ? magePath(learned) : null;

        const activeTraining = trainingRow.rows[0] || null;
        if (activeTraining) {
            const now = Math.floor(Date.now() / 1000);
            activeTraining.timeLeft = Math.max(0, activeTraining.ends_at - now);
            activeTraining.done = now >= activeTraining.ends_at;
        }

        res.json({
            tree,
            learned,
            passiveBonuses: passives,
            classModifiers: mods,
            dualWieldUnlocked: dualWield,
            magePath: mPath,
            upgradePenalties:  SKILL_TREES[char.class]?.upgrade_penalties  || {},
            upgradeDiscounts:  SKILL_TREES[char.class]?.upgrade_discounts   || {},
            activeTraining,
            extraStats,
        });
    } catch (e) {
        console.error('skill tree GET error', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/train', async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = await getDb();
        const { char, learned, learnedMap } = await loadCharWithSkills(db, req.user.userId);
        if (!char) return res.status(404).json({ error: 'No character found' });

        const { skillId, branchId } = req.body;
        const tree = SKILL_TREES[char.class];
        if (!tree) return res.status(400).json({ error: 'No skill tree for class' });

        const branch = tree.branches[branchId];
        if (!branch) return res.status(400).json({ error: 'Branch not found' });

        const sk = branch.skills[skillId];
        if (!sk) return res.status(400).json({ error: 'Skill not found' });

        if (learnedMap[skillId]) return res.status(400).json({ error: 'Already learned this skill' });

        if (branch.exclusive_with) {
            const oppBranch = tree.branches[branch.exclusive_with];
            if (oppBranch && Object.keys(oppBranch.skills).some(s => learnedMap[s])) {
                return res.status(400).json({
                    error: `Cannot learn ${branch.name} — you have already started ${oppBranch.name}. These paths are mutually exclusive.`
                });
            }
        }

        const missingPrereq = sk.requires.find(r => !learnedMap[r]);
        if (missingPrereq) {
            return res.status(400).json({ error: `Requires skill: ${missingPrereq}` });
        }

        const extraStats = {
            wins_no_shield:       char.wins_without_shield       || 0,
            hard_missions:        char.hard_missions_completed    || 0,
            total_missions:       char.total_missions_completed   || 0,
            elemental_kills:      char.elemental_kills            || 0,
            dungeon_no_death_run: char.dungeon_no_death_runs      || 0,
        };
        if (!meetsUnlockCondition(char, sk.unlockCondition, extraStats)) {
            const cond = UNLOCK_CONDITIONS[sk.unlockCondition];
            return res.status(400).json({ error: `Unlock requirement not met: ${cond?.desc || sk.unlockCondition}` });
        }

        const existingTraining = await db.execute({
            sql: 'SELECT * FROM skill_training WHERE char_id=?', args: [char.id]
        });
        if (existingTraining.rows.length) {
            const et = existingTraining.rows[0];
            const now = Math.floor(Date.now() / 1000);
            const left = Math.max(0, et.ends_at - now);
            return res.status(400).json({
                error: `Already training ${et.skill_id}. ${left < 60 ? left+'s' : Math.ceil(left/60)+'m'} remaining.`
            });
        }

        if ((char.gold || 0) < sk.goldCost) {
            return res.status(400).json({ error: `Need ${sk.goldCost} gold (you have ${char.gold})` });
        }

        const mats = sk.materials || {};
        for (const [matId, qty] of Object.entries(mats)) {
            if (!qty) continue;
            const matRow = await db.execute({
                sql: `SELECT * FROM inventory WHERE char_id=? AND (item_type='raw_mat' OR item_type='component') AND json_extract(item_data,'$.id')=?`,
                args: [char.id, matId]
            });
            const have = matRow.rows[0] ? (JSON.parse(matRow.rows[0].item_data).qty || 1) : 0;
            if (have < qty) {
                return res.status(400).json({ error: `Need ${qty}× ${matId.replace(/_/g,' ')} (you have ${have})` });
            }
        }

        await db.execute({ sql: 'UPDATE characters SET gold=gold-? WHERE id=?', args: [sk.goldCost, char.id] });

        for (const [matId, qty] of Object.entries(mats)) {
            if (!qty) continue;
            const matRow = await db.execute({
                sql: `SELECT * FROM inventory WHERE char_id=? AND (item_type='raw_mat' OR item_type='component') AND json_extract(item_data,'$.id')=?`,
                args: [char.id, matId]
            });
            if (matRow.rows[0]) {
                const d = JSON.parse(matRow.rows[0].item_data);
                d.qty = (d.qty || 1) - qty;
                if (d.qty <= 0) {
                    await db.execute({ sql: 'DELETE FROM inventory WHERE id=?', args: [matRow.rows[0].id] });
                } else {
                    await db.execute({ sql: 'UPDATE inventory SET item_data=? WHERE id=?', args: [JSON.stringify(d), matRow.rows[0].id] });
                }
            }
        }

        const now = Math.floor(Date.now() / 1000);
        const endsAt = now + sk.trainDuration;
        await db.execute({
            sql: 'INSERT INTO skill_training (char_id, skill_id, branch_id, started_at, ends_at) VALUES (?,?,?,?,?)',
            args: [char.id, skillId, branchId, now, endsAt]
        });

        const mins = Math.round(sk.trainDuration / 60);
        const timeStr = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;

        res.json({
            success: true,
            message: `⚔️ Training started: ${sk.name} (${timeStr})`,
            skillId, branchId,
            endsAt,
            duration: sk.trainDuration,
        });
    } catch (e) {
        console.error('skill train error', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/collect', async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = await getDb();
        const char = (await db.execute({ sql: 'SELECT * FROM characters WHERE user_id=?', args: [req.user.userId] })).rows[0];
        if (!char) return res.status(404).json({ error: 'No character' });

        const training = (await db.execute({ sql: 'SELECT * FROM skill_training WHERE char_id=?', args: [char.id] })).rows[0];
        if (!training) return res.status(400).json({ error: 'No training in progress' });

        const now = Math.floor(Date.now() / 1000);
        if (now < training.ends_at) {
            const left = training.ends_at - now;
            return res.status(400).json({ error: `Training not complete. ${Math.ceil(left/60)}m remaining.` });
        }

        const tree = SKILL_TREES[char.class];
        const branch = tree?.branches[training.branch_id];
        const sk = branch?.skills[training.skill_id];

        await db.execute({
            sql: 'INSERT OR IGNORE INTO character_skill_tree (char_id, skill_id, branch_id, class, learned_at) VALUES (?,?,?,?,?)',
            args: [char.id, training.skill_id, training.branch_id, char.class, now]
        });

        if (sk) {
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'passive_pct') {
                    // For percentage bonuses, we need to handle differently
                    // Store in a separate table or apply as multiplier
                    // For now, we'll just log - actual implementation depends on your stat system
                    console.log(`Percentage bonus: ${eff.stat} +${eff.value * 100}%`);
                } else if (eff.type === 'passive_stat') {
                    await db.execute({
                        sql: `UPDATE characters SET ${eff.stat} = COALESCE(${eff.stat},0) + ? WHERE id=?`,
                        args: [eff.value, char.id]
                    });
                } else if (eff.type === 'resist_bonus') {
                    for (const elem of (eff.elems || [])) {
                        await db.execute({
                            sql: `UPDATE characters SET elem_resist_${elem} = COALESCE(elem_resist_${elem},0) + ? WHERE id=?`,
                            args: [eff.value, char.id]
                        });
                    }
                }
            }
        }

        await db.execute({ sql: 'DELETE FROM skill_training WHERE char_id=?', args: [char.id] });

        res.json({
            success: true,
            message: `✅ ${sk?.name || training.skill_id} learned!`,
            skillId: training.skill_id,
        });
    } catch (e) {
        console.error('skill collect error', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/cancel', async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = await getDb();
        const char = (await db.execute({ sql: 'SELECT * FROM characters WHERE user_id=?', args: [req.user.userId] })).rows[0];
        if (!char) return res.status(404).json({ error: 'No character' });

        const training = (await db.execute({ sql: 'SELECT * FROM skill_training WHERE char_id=?', args: [char.id] })).rows[0];
        if (!training) return res.status(400).json({ error: 'No training in progress' });

        const tree = SKILL_TREES[char.class];
        const branch = tree?.branches[training.branch_id];
        const sk = branch?.skills[training.skill_id];
        const refund = sk ? Math.floor(sk.goldCost * 0.50) : 0;

        await db.execute({ sql: 'DELETE FROM skill_training WHERE char_id=?', args: [char.id] });
        if (refund > 0) {
            await db.execute({ sql: 'UPDATE characters SET gold=gold+? WHERE id=?', args: [refund, char.id] });
        }

        res.json({ success: true, message: `Training cancelled. Refunded ${refund} gold.`, refund });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/training/status', async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = await getDb();
        const char = (await db.execute({ sql: 'SELECT id FROM characters WHERE user_id=?', args: [req.user.userId] })).rows[0];
        if (!char) return res.status(404).json({ error: 'No character' });

        const training = (await db.execute({ sql: 'SELECT * FROM skill_training WHERE char_id=?', args: [char.id] })).rows[0];
        if (!training) return res.json(null);

        const now = Math.floor(Date.now() / 1000);
        res.json({
            ...training,
            timeLeft: Math.max(0, training.ends_at - now),
            done: now >= training.ends_at,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/respec', async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = await getDb();
        const { branchId } = req.body;
        
        const char = (await db.execute({ sql: 'SELECT * FROM characters WHERE user_id=?', args: [req.user.userId] })).rows[0];
        if (!char) return res.status(404).json({ error: 'No character' });
        
        // Get all skills in this branch that are learned
        const tree = SKILL_TREES[char.class];
        const branch = tree?.branches[branchId];
        if (!branch) return res.status(400).json({ error: 'Branch not found' });
        
        const learnedSkills = [];
        let totalRefund = 0;
        
        for (const [skId, sk] of Object.entries(branch.skills)) {
            const learned = await db.execute({
                sql: 'SELECT * FROM character_skill_tree WHERE char_id=? AND skill_id=?',
                args: [char.id, skId]
            });
            if (learned.rows.length) {
                learnedSkills.push(skId);
                totalRefund += Math.floor(sk.goldCost * 0.5);
            }
        }
        
        if (learnedSkills.length === 0) {
            return res.status(400).json({ error: 'No skills learned in this branch' });
        }
        
        // Remove learned skills
        for (const skId of learnedSkills) {
            await db.execute({
                sql: 'DELETE FROM character_skill_tree WHERE char_id=? AND skill_id=?',
                args: [char.id, skId]
            });
        }
        
        // Refund gold
        if (totalRefund > 0) {
            await db.execute({
                sql: 'UPDATE characters SET gold=gold+? WHERE id=?',
                args: [totalRefund, char.id]
            });
        }
        
        res.json({ 
            success: true, 
            message: `Reset ${learnedSkills.length} skills. Refunded ${totalRefund} gold.`,
            refund: totalRefund 
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/train/start', async (req, res) => {
    try {
        const db = await getDb();  // ← THIS RETURNS THE CONNECTION
        const { skillId, branchId, hours, doubleSpeed } = req.body;
        
        // Use the helpers with the db connection
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        // Check if already training - use the helper
        const training = await dbGet(db, 'SELECT * FROM skill_training WHERE char_id = ?', [char.id]);
        if (training) {
            return res.status(400).json({ error: 'Already training. Complete or cancel current training.' });
        }
        
        // Get current progress
        const progressRow = await dbGet(db, 'SELECT progress FROM character_skill_tree WHERE char_id = ? AND skill_id = ?', [char.id, skillId]);
        const currentProgress = progressRow?.progress || 0;
        
        // Validate hours
        const activePrem = getActivePremium(char);
        const maxHours = hasPremium(activePrem, 'arcane_reservoir') ? 12 : 8;
        if (hours < 1 || hours > maxHours) {
            return res.status(400).json({ error: `Training hours must be between 1 and ${maxHours}` });
        }
        
        // Get skill data
        const tree = SKILL_TREES[char.class];
        const branch = tree?.branches[branchId];
        const skill = branch?.skills[skillId];
        if (!skill) return res.status(404).json({ error: 'Skill not found' });
        
        // Calculate target progress
        const progressPerHour = doubleSpeed ? 2 : 1;
        const targetProgress = Math.min(100, currentProgress + (hours * progressPerHour));
        
        // Deduct gold for double speed
        let goldCost = 0;
        if (doubleSpeed) {
            goldCost = hours * 500;
            if (char.gold < goldCost) {
                return res.status(400).json({ error: `Need ${goldCost} gold for double speed training` });
            }
            await dbRun(db, 'UPDATE characters SET gold = gold - ? WHERE id = ?', [goldCost, char.id]);
        }
        
        const now = Math.floor(Date.now() / 1000);
        const endsAt = now + (hours * 3600);
        
        // Insert training session - use dbRun helper
        await dbRun(db, `
            INSERT INTO skill_training (char_id, skill_id, branch_id, progress_start, progress_target, hours_to_train, double_speed, started_at, ends_at, last_tick_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [char.id, skillId, branchId, currentProgress, targetProgress, hours, doubleSpeed ? 1 : 0, now, endsAt, now]);
        
        // Set training cooldown
        await dbRun(db, 'UPDATE characters SET training_cooldown_until = ? WHERE id = ?', [endsAt, char.id]);
        
        res.json({
            success: true,
            message: `Training started! ${hours} hour${hours > 1 ? 's' : ''}${doubleSpeed ? ' (2x speed)' : ''}`,
            endsAt,
            currentProgress,
            targetProgress
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});
router.post('/skills/train/tick', async (req, res) => {
    try {
        const db = await getDb();
        const char = await dbGet(db, 'SELECT * FROM characters WHERE user_id = ?', [req.user.userId]);
        if (!char) return res.status(404).json({ error: 'Character not found' });
        
        const training = await dbGet(db, 'SELECT * FROM skill_training WHERE char_id = ?', [char.id]);
        if (!training) return res.json({ active: false });
        
        const now = Math.floor(Date.now() / 1000);
        if (now >= training.ends_at) {
            // Training complete
            await dbRun(db, 'DELETE FROM skill_training WHERE id = ?', [training.id]);
            await dbRun(db, 'UPDATE characters SET training_cooldown_until = 0 WHERE id = ?', [char.id]);
            
            // Update skill progress in character_skill_tree
            await dbRun(db, `
                UPDATE character_skill_tree 
                SET progress = ? 
                WHERE char_id = ? AND skill_id = ?
            `, [training.progress_target, char.id, training.skill_id]);
            
            return res.json({ 
                active: false, 
                complete: true,
                message: 'Training complete!',
                newProgress: training.progress_target
            });
        }
        
        // Calculate elapsed time since last tick
        const lastTick = training.last_tick_at;
        const elapsed = now - lastTick;
        const hoursElapsed = elapsed / 3600;
        const progressPerHour = training.double_speed ? 2 : 1;
        const progressGain = hoursElapsed * progressPerHour;
        
        const newProgress = Math.min(training.progress_target, training.progress_start + progressGain);
        
        // Update progress
        await dbRun(db, `
            UPDATE skill_training 
            SET progress_current = ?, last_tick_at = ? 
            WHERE id = ?
        `, [newProgress, now, training.id]);
        
        // Update character_skill_tree progress
        await dbRun(db, `
            UPDATE character_skill_tree 
            SET progress = ? 
            WHERE char_id = ? AND skill_id = ?
        `, [newProgress, char.id, training.skill_id]);
        
        res.json({
            active: true,
            progress: newProgress,
            target: training.progress_target,
            endsAt: training.ends_at,
            remaining: training.ends_at - now
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Add to skills.js - Progressive calculation helpers

async function getSkillProgress(db, charId, skillId) {
    const result = await db.execute({
        sql: 'SELECT progress FROM character_skill_tree WHERE char_id = ? AND skill_id = ?',
        args: [charId, skillId]
    });
    return result.rows[0]?.progress || 0;
}

async function getAllSkillProgress(db, charId) {
    const result = await db.execute({
        sql: 'SELECT skill_id, progress FROM character_skill_tree WHERE char_id = ?',
        args: [charId]
    });
    const progressMap = {};
    for (const row of result.rows) {
        progressMap[row.skill_id] = row.progress;
    }
    return progressMap;
}

function calculateEffectiveEffects(skill, progress) {
    const effectiveness = Math.min(1, progress / 100);
    const effectiveEffects = [];
    
    for (const effect of (skill.effects || [])) {
        const effectiveEffect = { ...effect };
        
        if (effect.dmg_bonus) effectiveEffect.dmg_bonus = effect.dmg_bonus * effectiveness;
        if (effect.crit_bonus) effectiveEffect.crit_bonus = effect.crit_bonus * effectiveness;
        if (effect.dodge_bonus) effectiveEffect.dodge_bonus = effect.dodge_bonus * effectiveness;
        if (effect.block_bonus) effectiveEffect.block_bonus = effect.block_bonus * effectiveness;
        if (effect.reflect_pct) effectiveEffect.reflect_pct = effect.reflect_pct * effectiveness;
        if (effect.heal_pct) effectiveEffect.heal_pct = effect.heal_pct * effectiveness;
        if (effect.dot_pct) effectiveEffect.dot_pct = effect.dot_pct * effectiveness;
        if (effect.poison_pct) effectiveEffect.poison_pct = effect.poison_pct * effectiveness;
        if (effect.counter_dmg_pct) effectiveEffect.counter_dmg_pct = effect.counter_dmg_pct * effectiveness;
        if (effect.atk_dmg_bonus) effectiveEffect.atk_dmg_bonus = effect.atk_dmg_bonus * effectiveness;
        if (effect.block_penalty) effectiveEffect.block_penalty = effect.block_penalty * effectiveness;
        
        effectiveEffects.push(effectiveEffect);
    }
    
    return { effects: effectiveEffects, effectiveness };
}

async function computePassiveBonusesWithProgress(db, className, learnedSkillIds, charId) {
    const tree = SKILL_TREES[className];
    if (!tree) return {};
    const bonuses = {};
    const progressMap = await getAllSkillProgress(db, charId);
    
    for (const branch of Object.values(tree.branches)) {
        for (const sk of Object.values(branch.skills)) {
            if (!learnedSkillIds.includes(sk.id)) continue;
            const progress = progressMap[sk.id] || 0;
            const effectiveness = Math.min(1, progress / 100);
            
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'passive_pct') {
                    bonuses[eff.stat] = (bonuses[eff.stat] || 0) + (eff.value * effectiveness);
                } else if (eff.type === 'passive_stat') {
                    bonuses[eff.stat] = (bonuses[eff.stat] || 0) + (eff.value * effectiveness);
                } else if (eff.type === 'resist_bonus') {
                    for (const elem of (eff.elems || [])) {
                        bonuses[`${elem}_resist`] = (bonuses[`${elem}_resist`] || 0) + (eff.value * effectiveness);
                    }
                }
            }
        }
    }
    return bonuses;
}

async function computeActiveCombatEffectsWithProgress(db, className, learnedSkillIds, charId) {
    const tree = SKILL_TREES[className];
    if (!tree) return [];
    const effects = [];
    const progressMap = await getAllSkillProgress(db, charId);
    
    for (const branch of Object.values(tree.branches)) {
        for (const sk of Object.values(branch.skills)) {
            if (!learnedSkillIds.includes(sk.id)) continue;
            const progress = progressMap[sk.id] || 0;
            const { effects: effectiveEffects } = calculateEffectiveEffects(sk, progress);
            
            for (const eff of effectiveEffects) {
                if (eff.type === 'active_combat') effects.push({ ...eff, sourceSkill: sk.id });
            }
        }
    }
    return effects;
}

async function computeClassModifiersWithProgress(db, className, learnedSkillIds, charId) {
    const tree = SKILL_TREES[className];
    if (!tree) return [];
    const mods = [];
    const progressMap = await getAllSkillProgress(db, charId);
    
    for (const branch of Object.values(tree.branches)) {
        for (const sk of Object.values(branch.skills)) {
            if (!learnedSkillIds.includes(sk.id)) continue;
            const progress = progressMap[sk.id] || 0;
            const effectiveness = Math.min(1, progress / 100);
            
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'class_modifier') {
                    const effectiveEff = { ...eff };
                    if (eff.off_hand_dmg_pct) effectiveEff.off_hand_dmg_pct = eff.off_hand_dmg_pct * effectiveness;
                    mods.push(effectiveEff);
                }
            }
        }
    }
    return mods;
}

module.exports = {
    router,
    SKILL_TREES,
    SKILL_TRAIN_DURATIONS,
    UNLOCK_CONDITIONS,
    SKILL_TREE_MIGRATIONS,
    // Old functions (keep for compatibility)
    computePassiveBonuses,
    computeActiveCombatEffects,
    computeClassModifiers,
    applyClassUpgradeCostModifier,
    rogueHasDualWield,
    magePath,
    meetsUnlockCondition,
    getVisibleSkillTree,
    // NEW progressive functions
    computePassiveBonusesWithProgress,
    computeActiveCombatEffectsWithProgress,
    computeClassModifiersWithProgress,
    getSkillProgress,
    getAllSkillProgress,
    calculateEffectiveEffects,
};
