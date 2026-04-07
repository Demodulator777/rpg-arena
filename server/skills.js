// ═══════════════════════════════════════════════════════════════════════════════
// skills.js — Class Skill Tree System (REWORKED)
// ═══════════════════════════════════════════════════════════════════════════════
//
// All passive bonuses are PERCENTAGE-BASED to scale with character progression
// Unlock conditions are meaningful and require long-term investment
//
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

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
    missions_5:       { type: 'total_missions', value: 5, desc: 'Complete 5 missions' },
    
    // Tier 2 (Apprentice)
    wins_20:          { type: 'wins', value: 20, desc: 'Win 20 battles' },
    level_10:         { type: 'level', value: 10, desc: 'Reach level 10' },
    missions_15:      { type: 'total_missions', value: 15, desc: 'Complete 15 missions' },
    gold_earned_10k:  { type: 'total_gold_earned', value: 10000, desc: 'Earn 10,000 gold total' },
    
    // Tier 3 (Journeyman)
    wins_50:          { type: 'wins', value: 50, desc: 'Win 50 battles' },
    level_20:         { type: 'level', value: 20, desc: 'Reach level 20' },
    missions_30:      { type: 'total_missions', value: 30, desc: 'Complete 30 missions' },
    gold_earned_50k:  { type: 'total_gold_earned', value: 50000, desc: 'Earn 50,000 gold total' },
    hard_mission_5:   { type: 'hard_missions', value: 5, desc: 'Complete 5 hard missions' },
    dungeon_floor_5:  { type: 'dungeon_highest_floor', value: 5, desc: 'Reach dungeon floor 5' },
    
    // Tier 4 (Expert)
    wins_150:         { type: 'wins', value: 150, desc: 'Win 150 battles' },
    level_35:         { type: 'level', value: 35, desc: 'Reach level 35' },
    missions_75:      { type: 'total_missions', value: 75, desc: 'Complete 75 missions' },
    gold_earned_200k: { type: 'total_gold_earned', value: 200000, desc: 'Earn 200,000 gold total' },
    hard_mission_15:  { type: 'hard_missions', value: 15, desc: 'Complete 15 hard missions' },
    dungeon_floor_15: { type: 'dungeon_highest_floor', value: 15, desc: 'Reach dungeon floor 15' },
    
    // Tier 5 (Master/Grandmaster)
    wins_500:         { type: 'wins', value: 500, desc: 'Win 500 battles' },
    level_60:         { type: 'level', value: 60, desc: 'Reach level 60' },
    missions_200:     { type: 'total_missions', value: 200, desc: 'Complete 200 missions' },
    gold_earned_1m:   { type: 'total_gold_earned', value: 1000000, desc: 'Earn 1,000,000 gold total' },
    hard_mission_30:  { type: 'hard_missions', value: 30, desc: 'Complete 30 hard missions' },
    dungeon_floor_30: { type: 'dungeon_highest_floor', value: 30, desc: 'Reach dungeon floor 30' },
    
    // Special conditions
    kills_no_shield:    { type: 'wins_no_shield', value: 30, desc: 'Win 30 battles without a shield equipped' },
    elem_dmg_kill_100:  { type: 'elemental_kills', value: 100, desc: 'Defeat 100 enemies with elemental damage' },
    zero_deaths_dungeon:{ type: 'dungeon_no_death_run', value: 1, desc: 'Complete a dungeon run without dying' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SKILL TREES — All bonuses are PERCENTAGE-BASED
// ═══════════════════════════════════════════════════════════════════════════════

const SKILL_TREES = {

    // ═══════════════════════════════════════════════════════════════════════════
    // WARRIOR
    // ═══════════════════════════════════════════════════════════════════════════
    warrior: {
        description: 'Masters of physical combat. Strength, defense, and tactical prowess.',
            exclusive_branches: [['berserker', 'iron_guard', 'battle_commander', 'gladiator']],
    upgrade_penalties: {},
    upgrade_discounts: { strength: 0.30, defense: 0.15, vitality: 0.10 },

        branches: {
            berserker: {
                name: 'Berserker',
                emoji: '🔥',
                description: 'Sacrifice defense for overwhelming offense.',
                skills: {
                    bloodlust: {
                        id: 'bloodlust', tier: 1, name: 'Bloodlust', emoji: '🩸',
                        type: 'passive_pct',
                        desc: '+8% Strength and +5% damage permanently.',
                        effects: [
                            { type: 'passive_pct', stat: 'strength', value: 0.08 },
                            { type: 'passive_pct', stat: 'dmg_output', value: 0.05 }
                        ],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'wins_5',
                    },
                    reckless_swing: {
                        id: 'reckless_swing', tier: 2, name: 'Reckless Swing', emoji: '⚡',
                        type: 'active_combat',
                        desc: '+35% damage, -10% block effectiveness.',
                        effects: [{ type: 'active_combat', id: 'reckless_swing', atk_dmg_bonus: 0.35, block_penalty: 0.10 }],
                        requires: ['bloodlust'],
                        goldCost: 2000,
                        materials: { iron_ingot: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_20',
                    },
                    frenzy: {
                        id: 'frenzy', tier: 3, name: 'Frenzy', emoji: '💢',
                        type: 'passive_pct',
                        desc: '+12% Strength and +8% Agility. Damage increases by 3% per consecutive hit.',
                        effects: [
                            { type: 'passive_pct', stat: 'strength', value: 0.12 },
                            { type: 'passive_pct', stat: 'agility', value: 0.08 },
                            { type: 'active_combat', id: 'frenzy_stacks', max_stacks: 5, per_stack_dmg: 0.03 }
                        ],
                        requires: ['reckless_swing'],
                        goldCost: 5000,
                        materials: { mithril_ingot: 2, dragon_scale_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    berserker_rage: {
                        id: 'berserker_rage', tier: 4, name: 'Berserker Rage', emoji: '🌋',
                        type: 'active_combat',
                        desc: '+60% damage, ignore 40% armor on every 3rd hit.',
                        effects: [
                            { type: 'active_combat', id: 'berserker_rage', atk_dmg_bonus: 0.60, ignore_armour_pct: 0.40, interval: 3 }
                        ],
                        requires: ['frenzy'],
                        goldCost: 15000,
                        materials: { dragon_scale_shard: 3, demon_core: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'wins_150',
                    },
                    unstoppable: {
                        id: 'unstoppable', tier: 5, name: 'Unstoppable', emoji: '🔱',
                        type: 'passive_pct',
                        desc: '+20% damage, +15% Critical Damage. Cannot be stunned or knocked back.',
                        effects: [
                            { type: 'passive_pct', stat: 'dmg_output', value: 0.20 },
                            { type: 'passive_pct', stat: 'crit_dmg', value: 0.15 },
                            { type: 'class_modifier', id: 'stun_immune' }
                        ],
                        requires: ['berserker_rage'],
                        goldCost: 50000,
                        materials: { void_crystal: 3, legendary_fragment: 5 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_500',
                    },
                },
            },

            iron_guard: {
                name: 'Iron Guard',
                emoji: '🏰',
                description: 'Immovable defense. Take hits and protect allies.',
                skills: {
                    toughness: {
                        id: 'toughness', tier: 1, name: 'Toughness', emoji: '🪨',
                        type: 'passive_pct',
                        desc: '+10% Defense and +8% Max HP permanently.',
                        effects: [
                            { type: 'passive_pct', stat: 'defense', value: 0.10 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.08 }
                        ],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'level_5',
                    },
                    shield_mastery: {
                        id: 'shield_mastery', tier: 2, name: 'Shield Mastery', emoji: '🛡️',
                        type: 'passive_pct',
                        desc: '+30% block effectiveness on all guard stances.',
                        effects: [{ type: 'passive_pct', stat: 'block_effectiveness', value: 0.30 }],
                        requires: ['toughness'],
                        goldCost: 2000,
                        materials: { iron_ingot: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'missions_15',
                    },
                    iron_skin: {
                        id: 'iron_skin', tier: 3, name: 'Iron Skin', emoji: '⚙️',
                        type: 'passive_pct',
                        desc: '+15% Armor and +12% Vitality permanently.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.15 },
                            { type: 'passive_pct', stat: 'vitality', value: 0.12 }
                        ],
                        requires: ['shield_mastery'],
                        goldCost: 6000,
                        materials: { mithril_ingot: 3, tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    last_stand: {
                        id: 'last_stand', tier: 4, name: 'Last Stand', emoji: '⚔️',
                        type: 'active_combat',
                        desc: 'Below 25% HP: +50% damage, +40% block, and heal 5% max HP per round.',
                        effects: [
                            { type: 'active_combat', id: 'last_stand', hp_threshold: 0.25, dmg_bonus: 0.50, block_bonus: 0.40, heal_pct: 0.05 }
                        ],
                        requires: ['iron_skin'],
                        goldCost: 18000,
                        materials: { dragon_plate: 2, void_crystal: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'dungeon_floor_15',
                    },
                    fortress: {
                        id: 'fortress', tier: 5, name: 'Fortress', emoji: '🗼',
                        type: 'passive_pct',
                        desc: '+25% Armor, +30% Max HP, +15% Defense. Reduce all damage by 15%.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.30 },
                            { type: 'passive_pct', stat: 'defense', value: 0.15 },
                            { type: 'passive_pct', stat: 'dmg_taken', value: -0.15 }
                        ],
                        requires: ['last_stand'],
                        goldCost: 60000,
                        materials: { legendary_fragment: 6, demon_alloy: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
                    },
                },
            },

            battle_commander: {
                name: 'Battle Commander',
                emoji: '📯',
                description: 'Tactical mastery. Precision strikes and critical hits.',
                skills: {
                    combat_discipline: {
                        id: 'combat_discipline', tier: 1, name: 'Combat Discipline', emoji: '📋',
                        type: 'passive_pct',
                        desc: '+8% Hit Chance permanently.',
                        effects: [{ type: 'passive_pct', stat: 'hit_chance', value: 0.08 }],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'wins_5',
                    },
                    precision_strike: {
                        id: 'precision_strike', tier: 2, name: 'Precision Strike', emoji: '🎯',
                        type: 'passive_pct',
                        desc: '+10% Crit Chance and +5% Hit Chance.',
                        effects: [
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.10 },
                            { type: 'passive_pct', stat: 'hit_chance', value: 0.05 }
                        ],
                        requires: ['combat_discipline'],
                        goldCost: 2500,
                        materials: { hardwood_plank: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_20',
                    },
                    war_cry: {
                        id: 'war_cry', tier: 3, name: 'War Cry', emoji: '📯',
                        type: 'active_combat',
                        desc: 'First 3 rounds: 100% hit chance and +20% crit chance.',
                        effects: [{ type: 'active_combat', id: 'war_cry', no_miss_rounds: 3, crit_bonus: 0.20 }],
                        requires: ['precision_strike'],
                        goldCost: 7000,
                        materials: { frost_core: 2, iron_ingot: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    execute: {
                        id: 'execute', tier: 4, name: 'Execute', emoji: '💀',
                        type: 'active_combat',
                        desc: '+150% damage against enemies below 30% HP.',
                        effects: [{ type: 'active_combat', id: 'execute', hp_threshold: 0.30, dmg_bonus: 1.50 }],
                        requires: ['war_cry'],
                        goldCost: 20000,
                        materials: { void_crystal: 2, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_15',
                    },
                    supreme_commander: {
                        id: 'supreme_commander', tier: 5, name: 'Supreme Commander', emoji: '👑',
                        type: 'passive_pct',
                        desc: '+15% Hit Chance, +15% Crit Chance. Critical hits deal 25% more damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'hit_chance', value: 0.15 },
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.15 },
                            { type: 'passive_pct', stat: 'crit_dmg', value: 0.25 },
                            { type: 'class_modifier', id: 'tie_breaker' }
                        ],
                        requires: ['execute'],
                        goldCost: 70000,
                        materials: { legendary_fragment: 8, shadow_weave: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_500',
                    },
                },
            },

            gladiator: {
                name: 'Gladiator',
                emoji: '🏟️',
                description: 'Arena fighter. Bonus rewards and faster recovery.',
                skills: {
                    arena_veteran: {
                        id: 'arena_veteran', tier: 1, name: 'Arena Veteran', emoji: '🏅',
                        type: 'passive_pct',
                        desc: '+15% gold from PvP wins.',
                        effects: [{ type: 'passive_pct', stat: 'pvp_gold_earn', value: 0.15 }],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'wins_5',
                    },
                    battle_hardened: {
                        id: 'battle_hardened', tier: 2, name: 'Battle Hardened', emoji: '💪',
                        type: 'passive_pct',
                        desc: '+8% Strength, +8% Defense, +6% Vitality.',
                        effects: [
                            { type: 'passive_pct', stat: 'strength', value: 0.08 },
                            { type: 'passive_pct', stat: 'defense', value: 0.08 },
                            { type: 'passive_pct', stat: 'vitality', value: 0.06 }
                        ],
                        requires: ['arena_veteran'],
                        goldCost: 3000,
                        materials: { iron_ingot: 2, tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_20',
                    },
                    counter_attack: {
                        id: 'counter_attack', tier: 3, name: 'Counter Attack', emoji: '↩️',
                        type: 'active_combat',
                        desc: '40% chance to counter for 75% damage.',
                        effects: [{ type: 'active_combat', id: 'counter_attack', counter_chance: 0.40, counter_dmg_pct: 0.75 }],
                        requires: ['battle_hardened'],
                        goldCost: 8000,
                        materials: { mithril_ingot: 2, poison_extract: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    gladiator_rush: {
                        id: 'gladiator_rush', tier: 4, name: 'Gladiator Rush', emoji: '🏃',
                        type: 'active_combat',
                        desc: 'First round: +100% damage, cannot be blocked.',
                        effects: [{ type: 'active_combat', id: 'gladiator_rush', round_1_dmg_bonus: 1.00, pierce_block_round: 1 }],
                        requires: ['counter_attack'],
                        goldCost: 22000,
                        materials: { dragon_plate: 2, void_crystal: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'gold_earned_200k',
                    },
                    champion: {
                        id: 'champion', tier: 5, name: 'Champion', emoji: '🥇',
                        type: 'passive_pct',
                        desc: '+50% gold from PvP. PvP cooldown reduced by 60%. +10% all stats.',
                        effects: [
                            { type: 'passive_pct', stat: 'pvp_gold_earn', value: 0.50 },
                            { type: 'class_modifier', id: 'pvp_cooldown_reduction', value: 0.60 },
                            { type: 'passive_pct', stat: 'all_stats', value: 0.10 }
                        ],
                        requires: ['gladiator_rush'],
                        goldCost: 80000,
                        materials: { legendary_fragment: 8, demon_alloy: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_500',
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
        exclusive_branches: [[
        'arcane_foundation',
        'pyromancer', 
        'cryomancer', 
        'stormcaller', 
        'light_path', 
        'shadow_path'
    ]],

        branches: {
            arcane_foundation: {
                name: 'Arcane Foundation',
                emoji: '✨',
                description: 'The bedrock of magical power.',
                skills: {
                    arcane_attunement: {
                        id: 'arcane_attunement', tier: 1, name: 'Arcane Attunement', emoji: '🔮',
                        type: 'passive_pct',
                        desc: '+12% Magic. Magic adds 15% to all damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.12 },
                            { type: 'class_modifier', id: 'magic_dmg_scale', value: 0.15 }
                        ],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'level_5',
                    },
                    mana_shield: {
                        id: 'mana_shield', tier: 2, name: 'Mana Shield', emoji: '🛡️',
                        type: 'active_combat',
                        desc: 'Absorb (Magic × 0.4) damage per battle.',
                        effects: [{ type: 'active_combat', id: 'mana_shield', shield_from_magic_ratio: 0.40 }],
                        requires: ['arcane_attunement'],
                        goldCost: 2000,
                        materials: { arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'missions_15',
                    },
                    spell_mastery: {
                        id: 'spell_mastery', tier: 3, name: 'Spell Mastery', emoji: '📖',
                        type: 'passive_pct',
                        desc: '+25% to all elemental damage.',
                        effects: [{ type: 'passive_pct', stat: 'elem_dmg', value: 0.25 }],
                        requires: ['mana_shield'],
                        goldCost: 7000,
                        materials: { arcane_shard: 3, void_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    arcane_mastery: {
                        id: 'arcane_mastery', tier: 4, name: 'Arcane Mastery', emoji: '🌟',
                        type: 'passive_pct',
                        desc: '+20% Magic. Magic scaling increases to 35%.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.20 },
                            { type: 'class_modifier', id: 'magic_dmg_scale', value: 0.35 }
                        ],
                        requires: ['spell_mastery'],
                        goldCost: 20000,
                        materials: { void_crystal: 2, arcane_shard: 5 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'elem_dmg_kill_100',
                    },
                },
            },

            pyromancer: {
                name: 'Pyromancer',
                emoji: '🔥',
                description: 'Master of fire. High burst damage and burning.',
                skills: {
                    fire_bolt: {
                        id: 'fire_bolt', tier: 2, name: 'Fire Bolt', emoji: '🔥',
                        type: 'passive_pct',
                        desc: '+15% Fire Damage.',
                        effects: [{ type: 'passive_pct', stat: 'pyro_dmg', value: 0.15 }],
                        requires: ['arcane_attunement'],
                        goldCost: 1500,
                        materials: { arcane_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    immolate: {
                        id: 'immolate', tier: 3, name: 'Immolate', emoji: '🌋',
                        type: 'passive_pct',
                        desc: '+20% Fire Damage. Enemies burn for 5% of damage dealt per round.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.20 },
                            { type: 'active_combat', id: 'burn_dot', dot_pct: 0.05, elem: 'pyro' }
                        ],
                        requires: ['fire_bolt'],
                        goldCost: 6000,
                        materials: { arcane_shard: 3, dragon_scale_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    inferno: {
                        id: 'inferno', tier: 4, name: 'Inferno', emoji: '☄️',
                        type: 'active_combat',
                        desc: 'Once per battle: deal (Magic × 2.5) fire damage, ignore resistance.',
                        effects: [{ type: 'active_combat', id: 'inferno', magic_mult: 2.5, ignore_resist: true, uses: 1 }],
                        requires: ['immolate'],
                        goldCost: 22000,
                        materials: { void_crystal: 2, dragon_scale_shard: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_15',
                    },
                    fire_lord: {
                        id: 'fire_lord', tier: 5, name: 'Fire Lord', emoji: '👑',
                        type: 'passive_pct',
                        desc: '+30% Fire Damage, +15% Magic. Burning deals 100% more damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.30 },
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'class_modifier', id: 'burn_amplify', bonus: 1.00 }
                        ],
                        requires: ['inferno'],
                        goldCost: 80000,
                        materials: { legendary_fragment: 6, demon_core: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
                    },
                },
            },

            cryomancer: {
                name: 'Cryomancer',
                emoji: '❄️',
                description: 'Master of ice. Slowing and controlling enemies.',
                skills: {
                    frost_bolt: {
                        id: 'frost_bolt', tier: 2, name: 'Frost Bolt', emoji: '❄️',
                        type: 'passive_pct',
                        desc: '+15% Water Damage.',
                        effects: [{ type: 'passive_pct', stat: 'water_dmg', value: 0.15 }],
                        requires: ['arcane_attunement'],
                        goldCost: 1500,
                        materials: { frost_core: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    chill: {
                        id: 'chill', tier: 3, name: 'Chill', emoji: '🌨️',
                        type: 'active_combat',
                        desc: '+20% Water Damage. Chilled enemies have -20% hit chance for 2 rounds.',
                        effects: [
                            { type: 'passive_pct', stat: 'water_dmg', value: 0.20 },
                            { type: 'active_combat', id: 'chill_debuff', hit_penalty: 0.20, duration_rounds: 2 }
                        ],
                        requires: ['frost_bolt'],
                        goldCost: 6000,
                        materials: { frost_core: 3, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    blizzard: {
                        id: 'blizzard', tier: 4, name: 'Blizzard', emoji: '🌀',
                        type: 'active_combat',
                        desc: 'Deals (Magic × 1.5) water damage over 5 rounds.',
                        effects: [{ type: 'active_combat', id: 'blizzard', magic_mult: 1.5, split_rounds: 5 }],
                        requires: ['chill'],
                        goldCost: 22000,
                        materials: { void_crystal: 2, frost_core: 5 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_15',
                    },
                    absolute_zero: {
                        id: 'absolute_zero', tier: 5, name: 'Absolute Zero', emoji: '🧊',
                        type: 'passive_pct',
                        desc: '+30% Water Damage, +15% Magic, +25% Water Resist.',
                        effects: [
                            { type: 'passive_pct', stat: 'water_dmg', value: 0.30 },
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'passive_pct', stat: 'water_resist', value: 0.25 }
                        ],
                        requires: ['blizzard'],
                        goldCost: 80000,
                        materials: { legendary_fragment: 6, void_crystal: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
                    },
                },
            },

            stormcaller: {
                name: 'Stormcaller',
                emoji: '⚡',
                description: 'Master of lightning and wind. High critical damage.',
                skills: {
                    static_charge: {
                        id: 'static_charge', tier: 2, name: 'Static Charge', emoji: '⚡',
                        type: 'passive_pct',
                        desc: '+12% Electro Damage, +8% Wind Damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'electro_dmg', value: 0.12 },
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.08 }
                        ],
                        requires: ['arcane_attunement'],
                        goldCost: 1500,
                        materials: { arcane_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    lightning_strike: {
                        id: 'lightning_strike', tier: 3, name: 'Lightning Strike', emoji: '⛈️',
                        type: 'active_combat',
                        desc: '25% chance to arc for +75% electro damage.',
                        effects: [{ type: 'active_combat', id: 'lightning_arc', proc_chance: 0.25, bonus_pct: 0.75, elem: 'electro' }],
                        requires: ['static_charge'],
                        goldCost: 6000,
                        materials: { arcane_shard: 3, void_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    tempest: {
                        id: 'tempest', tier: 4, name: 'Tempest', emoji: '🌪️',
                        type: 'active_combat',
                        desc: 'Once per battle: 100% crit, guaranteed hit, double elemental damage.',
                        effects: [{ type: 'active_combat', id: 'tempest', guaranteed_hit: true, guaranteed_crit: true, elem_mult: 2.0, uses: 1 }],
                        requires: ['lightning_strike'],
                        goldCost: 22000,
                        materials: { void_crystal: 2, arcane_shard: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_15',
                    },
                    storm_lord: {
                        id: 'storm_lord', tier: 5, name: 'Storm Lord', emoji: '🌩️',
                        type: 'passive_pct',
                        desc: '+25% Electro, +20% Wind, +15% Magic, +10% Agility.',
                        effects: [
                            { type: 'passive_pct', stat: 'electro_dmg', value: 0.25 },
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.20 },
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'passive_pct', stat: 'agility', value: 0.10 }
                        ],
                        requires: ['tempest'],
                        goldCost: 80000,
                        materials: { legendary_fragment: 6, void_crystal: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
                    },
                },
            },

            light_path: {
                name: 'Path of Light',
                emoji: '☀️',
                description: 'Holy magic. Healing and protection.',
                exclusive_with: 'shadow_path',
                skills: {
                    holy_spark: {
                        id: 'holy_spark', tier: 3, name: 'Holy Spark', emoji: '✨',
                        type: 'passive_pct',
                        desc: '+10% Magic, +12% Max HP. Heal 8% HP at battle start.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.10 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.12 },
                            { type: 'active_combat', id: 'battle_start_heal', heal_pct: 0.08 }
                        ],
                        requires: ['arcane_attunement'],
                        goldCost: 6000,
                        materials: { arcane_shard: 2, frost_core: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    radiance: {
                        id: 'radiance', tier: 4, name: 'Radiance', emoji: '🌟',
                        type: 'active_combat',
                        desc: 'Heal 12% HP per round. Enemy deals 15% less damage.',
                        effects: [{ type: 'active_combat', id: 'radiance', heal_pct_per_round: 0.12, enemy_dmg_debuff: 0.15 }],
                        requires: ['holy_spark'],
                        goldCost: 25000,
                        materials: { void_crystal: 2, legendary_fragment: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_35',
                    },
                    divine_ascension: {
                        id: 'divine_ascension', tier: 5, name: 'Divine Ascension', emoji: '👼',
                        type: 'passive_pct',
                        desc: '+20% Magic, +25% HP, +20% all resists. Resurrect once per battle with 30% HP.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.20 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.25 },
                            { type: 'resist_bonus', elems: ['pyro','water','wind','electro'], value: 20 },
                            { type: 'class_modifier', id: 'resurrection', hp_pct: 0.30 }
                        ],
                        requires: ['radiance'],
                        goldCost: 100000,
                        materials: { legendary_fragment: 8, void_crystal: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
                    },
                },
            },

            shadow_path: {
                name: 'Path of Shadow',
                emoji: '🌑',
                description: 'Dark magic. Life drain and curses.',
                exclusive_with: 'light_path',
                skills: {
                    dark_pact: {
                        id: 'dark_pact', tier: 3, name: 'Dark Pact', emoji: '🌑',
                        type: 'passive_pct',
                        desc: '+15% Magic, -8% Max HP. Drain 10% of damage dealt.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.15 },
                            { type: 'passive_pct', stat: 'hp_max', value: -0.08 },
                            { type: 'active_combat', id: 'life_drain', pct: 0.10 }
                        ],
                        requires: ['arcane_attunement'],
                        goldCost: 6000,
                        materials: { shadow_essence: 2, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    void_curse: {
                        id: 'void_curse', tier: 4, name: 'Void Curse', emoji: '💀',
                        type: 'active_combat',
                        desc: 'Curse: -25% resistance, -15% hit chance for whole battle.',
                        effects: [{ type: 'active_combat', id: 'void_curse', enemy_elem_resist_debuff: 0.25, enemy_hit_debuff: 0.15 }],
                        requires: ['dark_pact'],
                        goldCost: 25000,
                        materials: { void_crystal: 3, demon_core: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_35',
                    },
                    oblivion: {
                        id: 'oblivion', tier: 5, name: 'Oblivion', emoji: '🕳️',
                        type: 'passive_pct',
                        desc: '+25% Magic, -15% Max HP. Drain 25% damage. Shadow magic ignores all resistances.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: -0.15 },
                            { type: 'active_combat', id: 'life_drain', pct: 0.25 },
                            { type: 'class_modifier', id: 'ignore_resist_shadow' }
                        ],
                        requires: ['void_curse'],
                        goldCost: 100000,
                        materials: { legendary_fragment: 8, demon_core: 5, shadow_weave: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
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
        exclusive_branches: [['assassin', 'trickster', 'shadowblade']],
        upgrade_penalties: { defense: 0.30, magic: 0.20 },
        upgrade_discounts: { agility: 0.35, strength: 0.10 },

        passive_modifiers: [
            { condition: 'no_shield', stat: 'agility', bonus: 5, desc: '+5 Agility when no shield is equipped' },
        ],

        branches: {
            assassin: {
                name: 'Assassin',
                emoji: '🗡️',
                description: 'Lethal precision. High crit damage and finishing blows.',
                skills: {
                    backstab: {
                        id: 'backstab', tier: 1, name: 'Backstab', emoji: '🔪',
                        type: 'active_combat',
                        desc: 'Round 1: +80% damage, cannot be blocked.',
                        effects: [{ type: 'active_combat', id: 'backstab', round: 1, dmg_bonus: 0.80, pierce_block: true }],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'wins_5',
                    },
                    expose_weakness: {
                        id: 'expose_weakness', tier: 2, name: 'Expose Weakness', emoji: '🎯',
                        type: 'passive_pct',
                        desc: '+12% Crit Chance.',
                        effects: [{ type: 'passive_pct', stat: 'crit_chance', value: 0.12 }],
                        requires: ['backstab'],
                        goldCost: 2000,
                        materials: { poison_extract: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_20',
                    },
                    venomfang: {
                        id: 'venomfang', tier: 3, name: 'Venomfang', emoji: '🐍',
                        type: 'active_combat',
                        desc: 'Each hit applies poison: 8% of damage per round.',
                        effects: [{ type: 'active_combat', id: 'venomfang', poison_pct: 0.08 }],
                        requires: ['expose_weakness'],
                        goldCost: 6000,
                        materials: { poison_extract: 4, tanned_hide: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    death_mark: {
                        id: 'death_mark', tier: 4, name: 'Death Mark', emoji: '☠️',
                        type: 'active_combat',
                        desc: 'Mark enemy: next hit deals (Agility × 3) bonus damage.',
                        effects: [{ type: 'active_combat', id: 'death_mark', agility_mult: 3.0, uses: 1 }],
                        requires: ['venomfang'],
                        goldCost: 20000,
                        materials: { void_crystal: 2, poison_extract: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_15',
                    },
                    shadow_reaper: {
                        id: 'shadow_reaper', tier: 5, name: 'Shadow Reaper', emoji: '💀',
                        type: 'passive_pct',
                        desc: '+20% Crit Chance, +15% Strength, +15% Agility. Crits ignore 50% armor.',
                        effects: [
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.20 },
                            { type: 'passive_pct', stat: 'strength', value: 0.15 },
                            { type: 'passive_pct', stat: 'agility', value: 0.15 },
                            { type: 'class_modifier', id: 'crit_armour_pierce', pct: 0.50 }
                        ],
                        requires: ['death_mark'],
                        goldCost: 80000,
                        materials: { legendary_fragment: 8, shadow_weave: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_500',
                    },
                },
            },

            trickster: {
                name: 'Trickster',
                emoji: '🃏',
                description: 'Unpredictable and evasive. High dodge and misdirection.',
                skills: {
                    feint: {
                        id: 'feint', tier: 1, name: 'Feint', emoji: '💨',
                        type: 'passive_pct',
                        desc: '+10% Agility.',
                        effects: [{ type: 'passive_pct', stat: 'agility', value: 0.10 }],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'wins_5',
                    },
                    shadow_step: {
                        id: 'shadow_step', tier: 2, name: 'Shadow Step', emoji: '👻',
                        type: 'active_combat',
                        desc: '+50% dodge chance for whole battle.',
                        effects: [{ type: 'active_combat', id: 'shadow_step', dodge_bonus: 0.50 }],
                        requires: ['feint'],
                        goldCost: 2000,
                        materials: { tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'missions_15',
                    },
                    smoke_bomb: {
                        id: 'smoke_bomb', tier: 3, name: 'Smoke Bomb', emoji: '💣',
                        type: 'active_combat',
                        desc: 'Rounds 1-3: enemy has 40% chance to miss.',
                        effects: [{ type: 'active_combat', id: 'smoke_bomb', enemy_miss_chance: 0.40, rounds: [1, 2, 3] }],
                        requires: ['shadow_step'],
                        goldCost: 7000,
                        materials: { poison_extract: 3, tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    phantom_strikes: {
                        id: 'phantom_strikes', tier: 4, name: 'Phantom Strikes', emoji: '🌀',
                        type: 'active_combat',
                        desc: '+15% Agility. Dodge procs 25% damage counter.',
                        effects: [
                            { type: 'passive_pct', stat: 'agility', value: 0.15 },
                            { type: 'active_combat', id: 'phantom_counter', counter_on_dodge_pct: 0.25 }
                        ],
                        requires: ['smoke_bomb'],
                        goldCost: 20000,
                        materials: { void_crystal: 2, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_35',
                    },
                    ghost_form: {
                        id: 'ghost_form', tier: 5, name: 'Ghost Form', emoji: '👁️',
                        type: 'passive_pct',
                        desc: '+25% Agility. 50% chance to negate incoming crits.',
                        effects: [
                            { type: 'passive_pct', stat: 'agility', value: 0.25 },
                            { type: 'active_combat', id: 'negate_crit', chance: 0.50 }
                        ],
                        requires: ['phantom_strikes'],
                        goldCost: 80000,
                        materials: { legendary_fragment: 8, shadow_weave: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_500',
                    },
                },
            },

            shadowblade: {
                name: 'Shadowblade',
                emoji: '🌑',
                description: 'Shadow-infused blades. Bonus elemental damage.',
                skills: {
                    shadow_coat: {
                        id: 'shadow_coat', tier: 2, name: 'Shadow Coat', emoji: '🌑',
                        type: 'passive_pct',
                        desc: '+12% Wind Damage.',
                        effects: [{ type: 'passive_pct', stat: 'wind_dmg', value: 0.12 }],
                        requires: ['backstab'],
                        goldCost: 2000,
                        materials: { shadow_essence: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    nightfall: {
                        id: 'nightfall', tier: 3, name: 'Nightfall', emoji: '🌒',
                        type: 'active_combat',
                        desc: '+18% Wind Damage. Reduce enemy hit chance by 20%.',
                        effects: [
                            { type: 'passive_pct', stat: 'wind_dmg', value: 0.18 },
                            { type: 'active_combat', id: 'darkness_debuff', enemy_hit_debuff: 0.20 }
                        ],
                        requires: ['shadow_coat'],
                        goldCost: 7000,
                        materials: { shadow_essence: 3, void_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    void_blade: {
                        id: 'void_blade', tier: 4, name: 'Void Blade', emoji: '🗡️',
                        type: 'active_combat',
                        desc: '30% chance to deal bonus electro+wind damage equal to 150% Agility.',
                        effects: [{ type: 'active_combat', id: 'void_blade', proc_chance: 0.30, bonus_from_stat: 'agility', bonus_mult: 1.50, elems: ['electro', 'wind'] }],
                        requires: ['nightfall'],
                        goldCost: 22000,
                        materials: { void_crystal: 3, shadow_essence: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'dungeon_floor_15',
                    },
                },
            },

            dual_wielder: {
                name: 'Dual Wielder',
                emoji: '⚔️⚔️',
                description: 'Secret path. Wield two weapons at once.',
                hidden: true,
                skills: {
                    off_hand_training: {
                        id: 'off_hand_training', tier: 3, name: 'Off-Hand Training', emoji: '🤜',
                        type: 'class_modifier',
                        desc: 'Equip second weapon in shield slot. Off-hand deals 60% damage.',
                        effects: [{ type: 'class_modifier', id: 'dual_wield_unlock', off_hand_dmg_pct: 0.60 }],
                        requires: [],
                        goldCost: 12000,
                        materials: { mithril_ingot: 4, tanned_hide: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'kills_no_shield',
                    },
                    ambidexterity: {
                        id: 'ambidexterity', tier: 4, name: 'Ambidexterity', emoji: '🤝',
                        type: 'passive_pct',
                        desc: 'Off-hand damage increases to 85%. +10% Attack Speed.',
                        effects: [
                            { type: 'class_modifier', id: 'dual_wield_dmg_pct', off_hand_dmg_pct: 0.85 },
                            { type: 'passive_pct', stat: 'attack_speed', value: 0.10 }
                        ],
                        requires: ['off_hand_training'],
                        goldCost: 25000,
                        materials: { void_crystal: 3, shadow_essence: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'wins_150',
                    },
                    blade_storm: {
                        id: 'blade_storm', tier: 5, name: 'Blade Storm', emoji: '🌀',
                        type: 'active_combat',
                        desc: 'Once per battle: both weapons strike for full damage, ignore blocks.',
                        effects: [{ type: 'active_combat', id: 'blade_storm', dual_strike: true, pierce_block: true, uses: 1 }],
                        requires: ['ambidexterity'],
                        goldCost: 60000,
                        materials: { legendary_fragment: 8, shadow_weave: 3, void_crystal: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_500',
                    },
                    twin_agility: {
                        id: 'twin_agility', tier: 4, name: 'Twin Agility', emoji: '💨',
                        type: 'passive_pct',
                        desc: '+20% Agility permanently.',
                        effects: [{ type: 'passive_pct', stat: 'agility', value: 0.20 }],
                        requires: ['off_hand_training'],
                        goldCost: 15000,
                        materials: { tanned_hide: 5, frost_core: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: null,
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
        exclusive_branches: [['protector', 'divine_warrior', 'inquisitor', 'crusader']],
        upgrade_penalties: { agility: 0.60, strength: 0.20 },
        upgrade_discounts: { defense: 0.25, magic: 0.20, vitality: 0.15 },

        branches: {
            protector: {
                name: 'Protector',
                emoji: '🏰',
                description: 'Maximum survivability.',
                skills: {
                    stalwart: {
                        id: 'stalwart', tier: 1, name: 'Stalwart', emoji: '⚓',
                        type: 'passive_pct',
                        desc: '+12% Defense, +10% Vitality.',
                        effects: [
                            { type: 'passive_pct', stat: 'defense', value: 0.12 },
                            { type: 'passive_pct', stat: 'vitality', value: 0.10 }
                        ],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'level_5',
                    },
                    aegis: {
                        id: 'aegis', tier: 2, name: 'Aegis', emoji: '🛡️',
                        type: 'passive_pct',
                        desc: '+40% block effectiveness.',
                        effects: [{ type: 'passive_pct', stat: 'block_effectiveness', value: 0.40 }],
                        requires: ['stalwart'],
                        goldCost: 2500,
                        materials: { iron_ingot: 5 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'missions_15',
                    },
                    fortress_stance: {
                        id: 'fortress_stance', tier: 3, name: 'Fortress Stance', emoji: '🗼',
                        type: 'active_combat',
                        desc: '+15% Armor, +12% Defense. First hit each battle is auto-blocked.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.15 },
                            { type: 'passive_pct', stat: 'defense', value: 0.12 },
                            { type: 'active_combat', id: 'auto_block_first_hit' }
                        ],
                        requires: ['aegis'],
                        goldCost: 8000,
                        materials: { mithril_ingot: 3, iron_ingot: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    impenetrable: {
                        id: 'impenetrable', tier: 4, name: 'Impenetrable', emoji: '💎',
                        type: 'passive_pct',
                        desc: '+20% Armor, +25% Max HP. Reduce physical damage by 20%.',
                        effects: [
                            { type: 'passive_pct', stat: 'armor', value: 0.20 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.25 },
                            { type: 'passive_pct', stat: 'phys_dmg_taken', value: -0.20 }
                        ],
                        requires: ['fortress_stance'],
                        goldCost: 25000,
                        materials: { dragon_plate: 3, void_crystal: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'dungeon_floor_15',
                    },
                    guardian: {
                        id: 'guardian', tier: 5, name: 'Guardian', emoji: '👑',
                        type: 'passive_pct',
                        desc: '+30% Defense, +25% Armor, +40% HP. Reduce ALL damage by 25%.',
                        effects: [
                            { type: 'passive_pct', stat: 'defense', value: 0.30 },
                            { type: 'passive_pct', stat: 'armor', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.40 },
                            { type: 'passive_pct', stat: 'dmg_taken', value: -0.25 }
                        ],
                        requires: ['impenetrable'],
                        goldCost: 100000,
                        materials: { legendary_fragment: 8, demon_alloy: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
                    },
                },
            },

            divine_warrior: {
                name: 'Divine Warrior',
                emoji: '✨',
                description: 'Holy strikes and divine healing.',
                skills: {
                    divine_favor: {
                        id: 'divine_favor', tier: 1, name: 'Divine Favor', emoji: '🙏',
                        type: 'passive_pct',
                        desc: '+10% Magic.',
                        effects: [{ type: 'passive_pct', stat: 'magic', value: 0.10 }],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'level_5',
                    },
                    holy_strike: {
                        id: 'holy_strike', tier: 2, name: 'Holy Strike', emoji: '⚡',
                        type: 'active_combat',
                        desc: '+25% damage. Heal 12% of damage dealt.',
                        effects: [{ type: 'active_combat', id: 'holy_strike', dmg_bonus: 0.25, heal_pct: 0.12 }],
                        requires: ['divine_favor'],
                        goldCost: 2500,
                        materials: { arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_20',
                    },
                    consecrate: {
                        id: 'consecrate', tier: 3, name: 'Consecrate', emoji: '🌿',
                        type: 'active_combat',
                        desc: 'Reflect 25% of damage received.',
                        effects: [{ type: 'active_combat', id: 'consecrate', reflect_pct: 0.25 }],
                        requires: ['holy_strike'],
                        goldCost: 8000,
                        materials: { arcane_shard: 3, iron_ingot: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    divine_judgment: {
                        id: 'divine_judgment', tier: 4, name: 'Divine Judgment', emoji: '⚖️',
                        type: 'active_combat',
                        desc: 'Once per battle: deal (Defense × 2.5) holy damage, ignore armor.',
                        effects: [{ type: 'active_combat', id: 'divine_judgment', defense_mult: 2.5, ignore_armour: true, uses: 1 }],
                        requires: ['consecrate'],
                        goldCost: 25000,
                        materials: { void_crystal: 2, dragon_plate: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_35',
                    },
                    avatar_of_justice: {
                        id: 'avatar_of_justice', tier: 5, name: 'Avatar of Justice', emoji: '☀️',
                        type: 'passive_pct',
                        desc: '+20% Magic, +15% Defense. Reflect 35% damage. Heal 12% per round.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.20 },
                            { type: 'passive_pct', stat: 'defense', value: 0.15 },
                            { type: 'active_combat', id: 'consecrate', reflect_pct: 0.35 },
                            { type: 'active_combat', id: 'holy_regen', heal_pct_per_round: 0.12 }
                        ],
                        requires: ['divine_judgment'],
                        goldCost: 100000,
                        materials: { legendary_fragment: 8, shadow_weave: 2, void_crystal: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
                    },
                },
            },

            inquisitor: {
                name: 'Inquisitor',
                emoji: '🔎',
                description: 'Punish weakness. Bonus damage to vulnerable enemies.',
                skills: {
                    judgement: {
                        id: 'judgement', tier: 1, name: 'Judgement', emoji: '⚖️',
                        type: 'passive_pct',
                        desc: '+8% Hit Chance, +6% Crit Chance.',
                        effects: [
                            { type: 'passive_pct', stat: 'hit_chance', value: 0.08 },
                            { type: 'passive_pct', stat: 'crit_chance', value: 0.06 }
                        ],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'wins_5',
                    },
                    expose: {
                        id: 'expose', tier: 2, name: 'Expose', emoji: '🎯',
                        type: 'active_combat',
                        desc: '+20% Crit Chance for whole battle.',
                        effects: [{ type: 'active_combat', id: 'expose', crit_bonus: 0.20 }],
                        requires: ['judgement'],
                        goldCost: 2500,
                        materials: { hardwood_plank: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_20',
                    },
                    crusader_oath: {
                        id: 'crusader_oath', tier: 3, name: 'Crusader\'s Oath', emoji: '📜',
                        type: 'active_combat',
                        desc: '+50% damage against enemies below 40% HP.',
                        effects: [{ type: 'active_combat', id: 'crusader_oath', hp_threshold: 0.40, dmg_bonus: 0.50 }],
                        requires: ['expose'],
                        goldCost: 9000,
                        materials: { void_shard: 2, iron_ingot: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    sanctioned_strike: {
                        id: 'sanctioned_strike', tier: 4, name: 'Sanctioned Strike', emoji: '✝️',
                        type: 'active_combat',
                        desc: 'Critical hits heal for 30% of crit damage.',
                        effects: [{ type: 'active_combat', id: 'sanctioned_strike', crit_heal_pct: 0.30 }],
                        requires: ['crusader_oath'],
                        goldCost: 25000,
                        materials: { arcane_shard: 3, mithril_ingot: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'zero_deaths_dungeon',
                    },
                    divine_shield: {
                        id: 'divine_shield', tier: 5, name: 'Divine Shield', emoji: '🌟',
                        type: 'active_combat',
                        desc: 'Negate first hit each battle. Crit heal increased to 50%.',
                        effects: [
                            { type: 'active_combat', id: 'divine_shield', negate_first_hit: true },
                            { type: 'active_combat', id: 'sanctioned_strike', crit_heal_pct: 0.50 }
                        ],
                        requires: ['sanctioned_strike'],
                        goldCost: 100000,
                        materials: { legendary_fragment: 8, demon_core: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_500',
                    },
                },
            },

            crusader: {
                name: 'Crusader',
                emoji: '⚔️',
                description: 'Holy fire damage and relentless advance.',
                skills: {
                    holy_aura: {
                        id: 'holy_aura', tier: 2, name: 'Holy Aura', emoji: '🌅',
                        type: 'passive_pct',
                        desc: '+15% Fire Damage, +8% all resistances.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.15 },
                            { type: 'resist_bonus', elems: ['pyro','water','wind','electro'], value: 8 }
                        ],
                        requires: ['stalwart'],
                        goldCost: 2500,
                        materials: { arcane_shard: 2, iron_ingot: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    righteous_fury: {
                        id: 'righteous_fury', tier: 3, name: 'Righteous Fury', emoji: '💥',
                        type: 'active_combat',
                        desc: '+20% Fire Damage. Damage increases by 8% per round.',
                        effects: [
                            { type: 'passive_pct', stat: 'pyro_dmg', value: 0.20 },
                            { type: 'active_combat', id: 'momentum', dmg_per_round_pct: 0.08 }
                        ],
                        requires: ['holy_aura'],
                        goldCost: 9000,
                        materials: { dragon_scale_shard: 2, arcane_shard: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    holy_crusade: {
                        id: 'holy_crusade', tier: 4, name: 'Holy Crusade', emoji: '🏳️',
                        type: 'active_combat',
                        desc: 'Once per battle: deal (Magic + Defense) × 1.8 holy damage, ignore resist.',
                        effects: [{ type: 'active_combat', id: 'holy_crusade', stats_sum: ['magic', 'defense'], multiplier: 1.8, ignore_resist: true, uses: 1 }],
                        requires: ['righteous_fury'],
                        goldCost: 28000,
                        materials: { void_crystal: 2, dragon_plate: 2, arcane_shard: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_15',
                    },
                    undying_crusader: {
                        id: 'undying_crusader', tier: 5, name: 'Undying Crusader', emoji: '🕊️',
                        type: 'passive_pct',
                        desc: '+25% Magic, +20% all resists, +30% HP. Holy fire deals +60% damage.',
                        effects: [
                            { type: 'passive_pct', stat: 'magic', value: 0.25 },
                            { type: 'passive_pct', stat: 'hp_max', value: 0.30 },
                            { type: 'resist_bonus', elems: ['pyro','water','wind','electro'], value: 20 },
                            { type: 'class_modifier', id: 'holy_fire_amplify', bonus: 0.60 }
                        ],
                        requires: ['holy_crusade'],
                        goldCost: 100000,
                        materials: { legendary_fragment: 8, demon_alloy: 3, void_crystal: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_30',
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

module.exports = {
    router,
    SKILL_TREES,
    SKILL_TRAIN_DURATIONS,
    UNLOCK_CONDITIONS,
    SKILL_TREE_MIGRATIONS,
    computePassiveBonuses,
    computeActiveCombatEffects,
    computeClassModifiers,
    applyClassUpgradeCostModifier,
    rogueHasDualWield,
    magePath,
    meetsUnlockCondition,
    getVisibleSkillTree,
};
