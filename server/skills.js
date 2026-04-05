// ═══════════════════════════════════════════════════════════════════════════════
// skills.js — Class Skill Tree System
// ═══════════════════════════════════════════════════════════════════════════════
//
// Architecture:
//   - Each class has a skill tree with branching paths
//   - Skills can be PASSIVE (always-on stat bonuses) or ACTIVE (triggered in combat)
//   - Training costs time (in seconds) + gold + optional material requirements
//   - Some skills are locked behind quests / prerequisite conditions
//   - Rogue can unlock dual-wield (drops shield slot, gains agility bonus)
//   - Mage has a Light/Dark specialization split
//   - Paladin is pure tank — heavy penalties on offensive stat upgrades
//   - Warrior has broad, combinable branches
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
// These are evaluated at runtime against the character record.
// Each condition is a plain object; the evaluator is in skillsRouter.
const UNLOCK_CONDITIONS = {
    wins_10:          { type: 'wins',         value: 10,  desc: 'Win 10 battles' },
    wins_25:          { type: 'wins',         value: 25,  desc: 'Win 25 battles' },
    wins_50:          { type: 'wins',         value: 50,  desc: 'Win 50 battles' },
    wins_100:         { type: 'wins',         value: 100, desc: 'Win 100 battles' },
    level_10:         { type: 'level',        value: 10,  desc: 'Reach level 10' },
    level_20:         { type: 'level',        value: 20,  desc: 'Reach level 20' },
    level_30:         { type: 'level',        value: 30,  desc: 'Reach level 30' },
    level_40:         { type: 'level',        value: 40,  desc: 'Reach level 40' },
    level_50:         { type: 'level',        value: 50,  desc: 'Reach level 50' },
    missions_20:      { type: 'total_missions', value: 20, desc: 'Complete 20 missions' },
    missions_50:      { type: 'total_missions', value: 50, desc: 'Complete 50 missions' },
    missions_100:     { type: 'total_missions', value: 100, desc: 'Complete 100 missions' },
    gold_earned_50k:  { type: 'total_gold_earned', value: 50000,  desc: 'Earn 50,000 gold total' },
    gold_earned_200k: { type: 'total_gold_earned', value: 200000, desc: 'Earn 200,000 gold total' },
    hard_mission_10:  { type: 'hard_missions', value: 10, desc: 'Complete 10 hard missions' },
    dungeon_floor_5:  { type: 'dungeon_highest_floor', value: 5,  desc: 'Reach dungeon floor 5' },
    dungeon_floor_10: { type: 'dungeon_highest_floor', value: 10, desc: 'Reach dungeon floor 10' },
    dungeon_floor_20: { type: 'dungeon_highest_floor', value: 20, desc: 'Reach dungeon floor 20' },
    // Rogue-specific
    kills_no_shield:  { type: 'wins_no_shield', value: 15, desc: 'Win 15 battles without a shield equipped' },
    // Mage-specific
    elem_dmg_kill_20: { type: 'elemental_kills', value: 20, desc: 'Defeat 20 enemies with elemental damage' },
    // Paladin-specific
    zero_deaths_dungeon: { type: 'dungeon_no_death_run', value: 1, desc: 'Complete a dungeon run without dying' },
};

// ── Effect type registry ──────────────────────────────────────────────────────
// passive_stat     → always-on flat bonus to a character stat
// passive_pct      → always-on percentage multiplier on a stat
// active_combat    → usable in battle (already handled by simulateRound / runBattle)
// class_modifier   → changes class rules (e.g. dual-wield, magic scaling)
// upgrade_discount → reduces gold cost of a stat upgrade
// resist_bonus     → elemental resistance bonus
// class_penalty    → adds a penalty to a stat (e.g. mage STR penalty)

// ═══════════════════════════════════════════════════════════════════════════════
// SKILL TREES
// ═══════════════════════════════════════════════════════════════════════════════

const SKILL_TREES = {

    // ─────────────────────────────────────────────────────────────────────────
    // WARRIOR — The Versatile Fighter
    // Branches: Berserker | Iron Guard | Battle Commander | Gladiator
    // All branches can be partially combined for hybrid builds.
    // ─────────────────────────────────────────────────────────────────────────
    warrior: {
        description: 'Warriors are masters of physical combat. Four distinct combat philosophies await — or blend them for a build uniquely your own.',
        upgrade_penalties: {},  // Warriors have no stat upgrade penalties
        upgrade_discounts: { strength: 0.30, defense: 0.15, vitality: 0.10 },

        branches: {

            // ── Branch 1: Berserker ─────────────────────────────────────────
            berserker: {
                name: 'Berserker',
                emoji: '🔥',
                description: 'Abandon defence, maximise destruction. High risk, highest reward.',
                skills: {
                    bloodlust: {
                        id: 'bloodlust', tier: 1, name: 'Bloodlust', emoji: '🩸',
                        type: 'passive_stat',
                        desc: '+4 Strength permanently.',
                        effects: [{ type: 'passive_stat', stat: 'strength', value: 4 }],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    reckless_swing: {
                        id: 'reckless_swing', tier: 2, name: 'Reckless Swing', emoji: '⚡',
                        type: 'active_combat',
                        desc: '+30% damage on all attacks, but -15% block effectiveness.',
                        effects: [
                            { type: 'active_combat', id: 'reckless_swing', atk_dmg_bonus: 0.30, block_penalty: 0.15 },
                        ],
                        requires: ['bloodlust'],
                        goldCost: 1500,
                        materials: { iron_ingot: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_10',
                    },
                    frenzy: {
                        id: 'frenzy', tier: 3, name: 'Frenzy', emoji: '💢',
                        type: 'passive_stat',
                        desc: '+6 Strength and +3 Agility permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'strength', value: 6 },
                            { type: 'passive_stat', stat: 'agility',  value: 3 },
                        ],
                        requires: ['reckless_swing'],
                        goldCost: 4000,
                        materials: { mithril_ingot: 2, dragon_scale_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_25',
                    },
                    berserker_rage: {
                        id: 'berserker_rage', tier: 4, name: 'Berserker Rage', emoji: '🌋',
                        type: 'active_combat',
                        desc: '+50% damage, ignore enemy armour on every 3rd hit. -20% block.',
                        effects: [
                            { type: 'active_combat', id: 'berserker_rage', atk_dmg_bonus: 0.50, ignore_armour_interval: 3, block_penalty: 0.20 },
                        ],
                        requires: ['frenzy'],
                        goldCost: 12000,
                        materials: { dragon_scale_shard: 3, demon_core: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'wins_50',
                    },
                    unstoppable: {
                        id: 'unstoppable', tier: 5, name: 'Unstoppable', emoji: '🔱',
                        type: 'passive_pct',
                        desc: '+10% to all damage dealt permanently. Cannot be stunned.',
                        effects: [
                            { type: 'passive_pct', stat: 'dmg_output', value: 0.10 },
                            { type: 'class_modifier', id: 'stun_immune' },
                        ],
                        requires: ['berserker_rage'],
                        goldCost: 35000,
                        materials: { void_crystal: 2, legendary_fragment: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.master,
                        unlockCondition: 'wins_100',
                    },
                },
            },

            // ── Branch 2: Iron Guard ────────────────────────────────────────
            iron_guard: {
                name: 'Iron Guard',
                emoji: '🏰',
                description: 'Become an immovable fortress. Exceptional defence and damage mitigation.',
                skills: {
                    toughness: {
                        id: 'toughness', tier: 1, name: 'Toughness', emoji: '🪨',
                        type: 'passive_stat',
                        desc: '+5 Defense and +20 max HP permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'defense', value: 5 },
                            { type: 'passive_stat', stat: 'hp_max',  value: 20 },
                        ],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    shield_mastery: {
                        id: 'shield_mastery', tier: 2, name: 'Shield Mastery', emoji: '🛡️',
                        type: 'passive_pct',
                        desc: '+25% block effectiveness on all guard stances.',
                        effects: [{ type: 'passive_pct', stat: 'block_effectiveness', value: 0.25 }],
                        requires: ['toughness'],
                        goldCost: 2000,
                        materials: { iron_ingot: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    iron_skin: {
                        id: 'iron_skin', tier: 3, name: 'Iron Skin', emoji: '⚙️',
                        type: 'passive_stat',
                        desc: '+8 Armor value and +4 Vitality permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'armor',   value: 8 },
                            { type: 'passive_stat', stat: 'vitality', value: 4 },
                        ],
                        requires: ['shield_mastery'],
                        goldCost: 5000,
                        materials: { mithril_ingot: 3, tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    last_stand: {
                        id: 'last_stand', tier: 4, name: 'Last Stand', emoji: '⚔️',
                        type: 'active_combat',
                        desc: 'When HP drops below 20%, gain +40% damage and +30% block for the rest of battle.',
                        effects: [
                            { type: 'active_combat', id: 'last_stand', hp_threshold: 0.20, dmg_bonus: 0.40, block_bonus: 0.30 },
                        ],
                        requires: ['iron_skin'],
                        goldCost: 15000,
                        materials: { dragon_plate: 2, void_crystal: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'wins_50',
                    },
                    fortress: {
                        id: 'fortress', tier: 5, name: 'Fortress', emoji: '🗼',
                        type: 'passive_stat',
                        desc: '+15 Armor, +50 HP, +10 Defense permanently. Reduce all incoming damage by 10%.',
                        effects: [
                            { type: 'passive_stat', stat: 'armor',    value: 15 },
                            { type: 'passive_stat', stat: 'hp_max',   value: 50 },
                            { type: 'passive_stat', stat: 'defense',  value: 10 },
                            { type: 'passive_pct',  stat: 'dmg_taken', value: -0.10 },
                        ],
                        requires: ['last_stand'],
                        goldCost: 40000,
                        materials: { legendary_fragment: 4, demon_alloy: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_10',
                    },
                },
            },

            // ── Branch 3: Battle Commander ──────────────────────────────────
            battle_commander: {
                name: 'Battle Commander',
                emoji: '📯',
                description: 'Tactical mastery. Higher hit chance, critical strikes, and battle-turning abilities.',
                skills: {
                    combat_discipline: {
                        id: 'combat_discipline', tier: 1, name: 'Combat Discipline', emoji: '📋',
                        type: 'passive_stat',
                        desc: '+5 Hit Chance permanently.',
                        effects: [{ type: 'passive_stat', stat: 'hit_chance', value: 5 }],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    precision_strike: {
                        id: 'precision_strike', tier: 2, name: 'Precision Strike', emoji: '🎯',
                        type: 'passive_stat',
                        desc: '+4 Crit Chance and +3 Hit Chance permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'crit_chance', value: 4 },
                            { type: 'passive_stat', stat: 'hit_chance',  value: 3 },
                        ],
                        requires: ['combat_discipline'],
                        goldCost: 2500,
                        materials: { hardwood_plank: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_10',
                    },
                    war_cry: {
                        id: 'war_cry', tier: 3, name: 'War Cry', emoji: '📯',
                        type: 'active_combat',
                        desc: 'First 3 hits in battle cannot miss.',
                        effects: [{ type: 'active_combat', id: 'war_cry', no_miss_rounds: 3 }],
                        requires: ['precision_strike'],
                        goldCost: 6000,
                        materials: { frost_core: 2, iron_ingot: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_25',
                    },
                    execute: {
                        id: 'execute', tier: 4, name: 'Execute', emoji: '💀',
                        type: 'active_combat',
                        desc: '+100% damage against enemies below 25% HP.',
                        effects: [{ type: 'active_combat', id: 'execute', hp_threshold: 0.25, dmg_bonus: 1.0 }],
                        requires: ['war_cry'],
                        goldCost: 14000,
                        materials: { void_crystal: 2, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_10',
                    },
                    supreme_commander: {
                        id: 'supreme_commander', tier: 5, name: 'Supreme Commander', emoji: '👑',
                        type: 'passive_stat',
                        desc: '+10 Hit Chance, +8 Crit Chance permanently. Win ties on equal damage.',
                        effects: [
                            { type: 'passive_stat', stat: 'hit_chance',  value: 10 },
                            { type: 'passive_stat', stat: 'crit_chance', value: 8  },
                            { type: 'class_modifier', id: 'tie_breaker' },
                        ],
                        requires: ['execute'],
                        goldCost: 45000,
                        materials: { legendary_fragment: 5, shadow_weave: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_100',
                    },
                },
            },

            // ── Branch 4: Gladiator ─────────────────────────────────────────
            gladiator: {
                name: 'Gladiator',
                emoji: '🏟️',
                description: 'Arena-hardened. Specialises in PvP duels, earning more from fights and recovering faster.',
                skills: {
                    arena_veteran: {
                        id: 'arena_veteran', tier: 1, name: 'Arena Veteran', emoji: '🏅',
                        type: 'passive_pct',
                        desc: '+10% gold earned from PvP wins.',
                        effects: [{ type: 'passive_pct', stat: 'pvp_gold_earn', value: 0.10 }],
                        requires: [],
                        goldCost: 400,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: 'wins_10',
                    },
                    battle_hardened: {
                        id: 'battle_hardened', tier: 2, name: 'Battle Hardened', emoji: '💪',
                        type: 'passive_stat',
                        desc: '+3 Strength, +3 Defense, +2 Vitality permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'strength', value: 3 },
                            { type: 'passive_stat', stat: 'defense',  value: 3 },
                            { type: 'passive_stat', stat: 'vitality', value: 2 },
                        ],
                        requires: ['arena_veteran'],
                        goldCost: 3000,
                        materials: { iron_ingot: 2, tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_25',
                    },
                    counter_attack: {
                        id: 'counter_attack', tier: 3, name: 'Counter Attack', emoji: '↩️',
                        type: 'active_combat',
                        desc: '35% chance to counter any hit for 60% damage.',
                        effects: [{ type: 'active_combat', id: 'counter_attack', counter_chance: 0.35, counter_dmg_pct: 0.60 }],
                        requires: ['battle_hardened'],
                        goldCost: 7000,
                        materials: { mithril_ingot: 2, poison_extract: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    gladiator_rush: {
                        id: 'gladiator_rush', tier: 4, name: 'Gladiator Rush', emoji: '🏃',
                        type: 'active_combat',
                        desc: 'First round deals +80% damage regardless of block zone.',
                        effects: [{ type: 'active_combat', id: 'gladiator_rush', round_1_dmg_bonus: 0.80, pierce_block_round: 1 }],
                        requires: ['counter_attack'],
                        goldCost: 18000,
                        materials: { dragon_plate: 2, void_crystal: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'gold_earned_50k',
                    },
                    champion: {
                        id: 'champion', tier: 5, name: 'Champion', emoji: '🥇',
                        type: 'passive_pct',
                        desc: '+25% gold from PvP. PvP battle cooldown reduced by 50%.',
                        effects: [
                            { type: 'passive_pct', stat: 'pvp_gold_earn',     value: 0.25 },
                            { type: 'class_modifier', id: 'pvp_cooldown_half' },
                        ],
                        requires: ['gladiator_rush'],
                        goldCost: 50000,
                        materials: { legendary_fragment: 5, demon_alloy: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_100',
                    },
                },
            },
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // MAGE — The Arcane Scholar
    // Branches: Pyromancer | Cryomancer | Stormcaller | Light Path | Shadow Path
    // Light / Shadow are mutually exclusive (choosing one locks the other).
    // Elemental branches are open to all but have diminishing returns if spread thin.
    // Physical stats (Strength) have a steep upgrade surcharge.
    // ─────────────────────────────────────────────────────────────────────────
    mage: {
        description: 'Mages channel arcane energies. All damage scales from Magic. Choose elemental mastery, then walk the path of Light or Shadow — but never both.',
        upgrade_penalties: { strength: 1.50, defense: 0.30 },   // +50% STR cost, +30% DEF cost
        upgrade_discounts: { magic: 0.35, agility: 0.10 },

        // Mutual exclusion: picking any Light skill locks Shadow branch, and vice versa
        exclusive_branches: [['light_path', 'shadow_path']],

        branches: {

            // ── Branch 1: Arcane Foundation (gateway — all mages start here) ─
            arcane_foundation: {
                name: 'Arcane Foundation',
                emoji: '✨',
                description: 'The bedrock of all magical power. Unlocks elemental specialisations.',
                skills: {
                    arcane_attunement: {
                        id: 'arcane_attunement', tier: 1, name: 'Arcane Attunement', emoji: '🔮',
                        type: 'passive_stat',
                        desc: '+6 Magic permanently. All damage now scales 15% from Magic stat.',
                        effects: [
                            { type: 'passive_stat',    stat: 'magic', value: 6 },
                            { type: 'class_modifier',  id: 'magic_dmg_scale', value: 0.15 },
                        ],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    mana_shield: {
                        id: 'mana_shield', tier: 2, name: 'Mana Shield', emoji: '🛡️',
                        type: 'active_combat',
                        desc: 'Force field absorbs (Magic ÷ 3) damage each battle.',
                        effects: [{ type: 'active_combat', id: 'mana_shield', shield_from_magic_ratio: 0.333 }],
                        requires: ['arcane_attunement'],
                        goldCost: 1500,
                        materials: { arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    spell_mastery: {
                        id: 'spell_mastery', tier: 3, name: 'Spell Mastery', emoji: '📖',
                        type: 'passive_pct',
                        desc: '+20% to all elemental damage dealt.',
                        effects: [{ type: 'passive_pct', stat: 'elem_dmg', value: 0.20 }],
                        requires: ['mana_shield'],
                        goldCost: 5000,
                        materials: { arcane_shard: 3, void_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    arcane_mastery: {
                        id: 'arcane_mastery', tier: 4, name: 'Arcane Mastery', emoji: '🌟',
                        type: 'passive_stat',
                        desc: '+10 Magic permanently. Magic damage scaling increases to 30%.',
                        effects: [
                            { type: 'passive_stat',   stat: 'magic', value: 10 },
                            { type: 'class_modifier', id: 'magic_dmg_scale', value: 0.30 },
                        ],
                        requires: ['spell_mastery'],
                        goldCost: 15000,
                        materials: { void_crystal: 2, arcane_shard: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'elem_dmg_kill_20',
                    },
                },
            },

            // ── Branch 2: Pyromancer ────────────────────────────────────────
            pyromancer: {
                name: 'Pyromancer',
                emoji: '🔥',
                description: 'Command the flames. High burst fire damage with burning effects.',
                skills: {
                    fire_bolt: {
                        id: 'fire_bolt', tier: 2, name: 'Fire Bolt', emoji: '🔥',
                        type: 'passive_stat',
                        desc: '+5 Pyro Damage permanently.',
                        effects: [{ type: 'passive_stat', stat: 'pyro_dmg', value: 5 }],
                        requires: ['arcane_attunement'],
                        goldCost: 1200,
                        materials: { arcane_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    immolate: {
                        id: 'immolate', tier: 3, name: 'Immolate', emoji: '🌋',
                        type: 'passive_stat',
                        desc: '+8 Pyro Damage. Enemies take 3 bonus pyro damage per round (burn).',
                        effects: [
                            { type: 'passive_stat',   stat: 'pyro_dmg', value: 8 },
                            { type: 'active_combat',  id: 'burn_dot', dot_dmg: 3, elem: 'pyro' },
                        ],
                        requires: ['fire_bolt'],
                        goldCost: 5000,
                        materials: { arcane_shard: 3, dragon_scale_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    inferno: {
                        id: 'inferno', tier: 4, name: 'Inferno', emoji: '☄️',
                        type: 'active_combat',
                        desc: 'Once per battle: deal (Magic × 1.5) pure fire damage ignoring all resistance.',
                        effects: [{ type: 'active_combat', id: 'inferno', magic_mult: 1.5, ignore_resist: true, uses: 1 }],
                        requires: ['immolate'],
                        goldCost: 18000,
                        materials: { void_crystal: 2, dragon_scale_shard: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_10',
                    },
                    fire_lord: {
                        id: 'fire_lord', tier: 5, name: 'Fire Lord', emoji: '👑',
                        type: 'passive_stat',
                        desc: '+15 Pyro Damage, +10 Magic permanently. Enemies with burn take 50% more damage.',
                        effects: [
                            { type: 'passive_stat',   stat: 'pyro_dmg', value: 15 },
                            { type: 'passive_stat',   stat: 'magic',    value: 10 },
                            { type: 'class_modifier', id: 'burn_amplify', bonus: 0.50 },
                        ],
                        requires: ['inferno'],
                        goldCost: 50000,
                        materials: { legendary_fragment: 4, demon_core: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_10',
                    },
                },
            },

            // ── Branch 3: Cryomancer ────────────────────────────────────────
            cryomancer: {
                name: 'Cryomancer',
                emoji: '❄️',
                description: 'Freeze and shatter. Water damage that slows and debilitates enemies.',
                skills: {
                    frost_bolt: {
                        id: 'frost_bolt', tier: 2, name: 'Frost Bolt', emoji: '❄️',
                        type: 'passive_stat',
                        desc: '+5 Water Damage permanently.',
                        effects: [{ type: 'passive_stat', stat: 'water_dmg', value: 5 }],
                        requires: ['arcane_attunement'],
                        goldCost: 1200,
                        materials: { frost_core: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    chill: {
                        id: 'chill', tier: 3, name: 'Chill', emoji: '🌨️',
                        type: 'active_combat',
                        desc: '+8 Water Damage. Chilled enemies have -10% hit chance for 2 rounds after being hit.',
                        effects: [
                            { type: 'passive_stat',  stat: 'water_dmg', value: 8 },
                            { type: 'active_combat', id: 'chill_debuff', hit_penalty: 0.10, duration_rounds: 2 },
                        ],
                        requires: ['frost_bolt'],
                        goldCost: 5000,
                        materials: { frost_core: 3, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    blizzard: {
                        id: 'blizzard', tier: 4, name: 'Blizzard', emoji: '🌀',
                        type: 'active_combat',
                        desc: 'Deals (Magic × 1.2) water damage split across all 10 rounds.',
                        effects: [{ type: 'active_combat', id: 'blizzard', magic_mult: 1.2, split_rounds: 10 }],
                        requires: ['chill'],
                        goldCost: 18000,
                        materials: { void_crystal: 2, frost_core: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_10',
                    },
                    absolute_zero: {
                        id: 'absolute_zero', tier: 5, name: 'Absolute Zero', emoji: '🧊',
                        type: 'passive_stat',
                        desc: '+15 Water Damage, +8 Magic, +20 Water Resist permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'water_dmg',    value: 15 },
                            { type: 'passive_stat', stat: 'magic',        value: 8  },
                            { type: 'passive_stat', stat: 'water_resist', value: 20 },
                        ],
                        requires: ['blizzard'],
                        goldCost: 50000,
                        materials: { legendary_fragment: 4, void_crystal: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_10',
                    },
                },
            },

            // ── Branch 4: Stormcaller ───────────────────────────────────────
            stormcaller: {
                name: 'Stormcaller',
                emoji: '⚡',
                description: 'Harness wind and lightning. High crit electro damage with mobility.',
                skills: {
                    static_charge: {
                        id: 'static_charge', tier: 2, name: 'Static Charge', emoji: '⚡',
                        type: 'passive_stat',
                        desc: '+4 Electro Damage, +3 Wind Damage permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'electro_dmg', value: 4 },
                            { type: 'passive_stat', stat: 'wind_dmg',    value: 3 },
                        ],
                        requires: ['arcane_attunement'],
                        goldCost: 1200,
                        materials: { arcane_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    lightning_strike: {
                        id: 'lightning_strike', tier: 3, name: 'Lightning Strike', emoji: '⛈️',
                        type: 'active_combat',
                        desc: '30% chance each hit to arc for +50% electro bonus damage.',
                        effects: [{ type: 'active_combat', id: 'lightning_arc', proc_chance: 0.30, bonus_pct: 0.50, elem: 'electro' }],
                        requires: ['static_charge'],
                        goldCost: 5000,
                        materials: { arcane_shard: 3, void_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    tempest: {
                        id: 'tempest', tier: 4, name: 'Tempest', emoji: '🌪️',
                        type: 'active_combat',
                        desc: 'Once per battle: 100% hit chance, guaranteed crit, both wind + electro damage.',
                        effects: [{ type: 'active_combat', id: 'tempest', guaranteed_hit: true, guaranteed_crit: true, uses: 1 }],
                        requires: ['lightning_strike'],
                        goldCost: 18000,
                        materials: { void_crystal: 2, arcane_shard: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_10',
                    },
                    storm_lord: {
                        id: 'storm_lord', tier: 5, name: 'Storm Lord', emoji: '🌩️',
                        type: 'passive_stat',
                        desc: '+12 Electro Damage, +8 Wind Damage, +8 Magic, +6 Agility permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'electro_dmg', value: 12 },
                            { type: 'passive_stat', stat: 'wind_dmg',    value: 8  },
                            { type: 'passive_stat', stat: 'magic',       value: 8  },
                            { type: 'passive_stat', stat: 'agility',     value: 6  },
                        ],
                        requires: ['tempest'],
                        goldCost: 50000,
                        materials: { legendary_fragment: 4, void_crystal: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_10',
                    },
                },
            },

            // ── Branch 5: Light Path (mutually exclusive with Shadow) ────────
            light_path: {
                name: 'Path of Light',
                emoji: '☀️',
                description: 'Holy power. Healing, shields, and righteous damage. Locks out Shadow.',
                exclusive_with: 'shadow_path',
                skills: {
                    holy_spark: {
                        id: 'holy_spark', tier: 3, name: 'Holy Spark', emoji: '✨',
                        type: 'passive_stat',
                        desc: '+5 Magic, +15 max HP. Heal 5% of max HP at the start of each battle.',
                        effects: [
                            { type: 'passive_stat',   stat: 'magic',  value: 5  },
                            { type: 'passive_stat',   stat: 'hp_max', value: 15 },
                            { type: 'active_combat',  id: 'battle_start_heal', heal_pct: 0.05 },
                        ],
                        requires: ['arcane_attunement'],
                        goldCost: 5000,
                        materials: { arcane_shard: 2, frost_core: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    radiance: {
                        id: 'radiance', tier: 4, name: 'Radiance', emoji: '🌟',
                        type: 'active_combat',
                        desc: 'Heal 15% max HP each round. Enemy deals 10% less damage (blinded).',
                        effects: [{ type: 'active_combat', id: 'radiance', heal_pct_per_round: 0.15, enemy_dmg_debuff: 0.10 }],
                        requires: ['holy_spark'],
                        goldCost: 20000,
                        materials: { void_crystal: 2, legendary_fragment: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_30',
                    },
                    divine_ascension: {
                        id: 'divine_ascension', tier: 5, name: 'Divine Ascension', emoji: '👼',
                        type: 'passive_stat',
                        desc: '+15 Magic, +40 HP, +10 all Elemental Resistances. Once per battle resurrect with 20% HP.',
                        effects: [
                            { type: 'passive_stat',   stat: 'magic',         value: 15 },
                            { type: 'passive_stat',   stat: 'hp_max',        value: 40 },
                            { type: 'resist_bonus',   elems: ['pyro','water','wind','electro'], value: 10 },
                            { type: 'class_modifier', id: 'resurrection',    hp_pct: 0.20 },
                        ],
                        requires: ['radiance'],
                        goldCost: 60000,
                        materials: { legendary_fragment: 6, void_crystal: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_20',
                    },
                },
            },

            // ── Branch 6: Shadow Path (mutually exclusive with Light) ────────
            shadow_path: {
                name: 'Path of Shadow',
                emoji: '🌑',
                description: 'Dark sorcery. Life drain, curses, and void magic. Locks out Light.',
                exclusive_with: 'light_path',
                skills: {
                    dark_pact: {
                        id: 'dark_pact', tier: 3, name: 'Dark Pact', emoji: '🌑',
                        type: 'passive_stat',
                        desc: '+8 Magic, -10 max HP. Drain 8% of damage dealt as HP.',
                        effects: [
                            { type: 'passive_stat',   stat: 'magic',  value: 8   },
                            { type: 'passive_stat',   stat: 'hp_max', value: -10 },
                            { type: 'active_combat',  id: 'life_drain', pct: 0.08 },
                        ],
                        requires: ['arcane_attunement'],
                        goldCost: 5000,
                        materials: { shadow_essence: 2, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    void_curse: {
                        id: 'void_curse', tier: 4, name: 'Void Curse', emoji: '💀',
                        type: 'active_combat',
                        desc: 'Cursed enemy has -20% elemental resistance and -10% hit chance for the whole battle.',
                        effects: [{ type: 'active_combat', id: 'void_curse', enemy_elem_resist_debuff: 0.20, enemy_hit_debuff: 0.10 }],
                        requires: ['dark_pact'],
                        goldCost: 20000,
                        materials: { void_crystal: 3, demon_core: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_30',
                    },
                    oblivion: {
                        id: 'oblivion', tier: 5, name: 'Oblivion', emoji: '🕳️',
                        type: 'passive_stat',
                        desc: '+20 Magic, -20 max HP. Life drain increases to 20%. Shadow magic ignores all resistances.',
                        effects: [
                            { type: 'passive_stat',   stat: 'magic',  value: 20  },
                            { type: 'passive_stat',   stat: 'hp_max', value: -20 },
                            { type: 'active_combat',  id: 'life_drain', pct: 0.20 },
                            { type: 'class_modifier', id: 'ignore_resist_shadow' },
                        ],
                        requires: ['void_curse'],
                        goldCost: 60000,
                        materials: { legendary_fragment: 6, demon_core: 4, shadow_weave: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_20',
                    },
                },
            },
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ROGUE — The Shadow Striker
    // Branches: Assassin | Trickster | Shadowblade | Dual Wielder (hidden)
    // Dual Wield is a secret branch unlocked only after meeting hidden conditions.
    // Rogues start with an inherent shield→agility trade: +5 AGI when no shield equipped.
    // ─────────────────────────────────────────────────────────────────────────
    rogue: {
        description: 'Rogues thrive in speed and cunning. No shield? No problem — pure agility is your armour.',
        upgrade_penalties: { defense: 0.30, magic: 0.20 },
        upgrade_discounts: { agility: 0.35, strength: 0.10 },

        // Passive bonus when no shield equipped (evaluated each time combat starts)
        passive_modifiers: [
            { condition: 'no_shield', stat: 'agility', bonus: 5, desc: '+5 Agility when no shield is equipped' },
        ],

        branches: {

            // ── Branch 1: Assassin ──────────────────────────────────────────
            assassin: {
                name: 'Assassin',
                emoji: '🗡️',
                description: 'Kill swiftly, kill silently. High crit, first-strike power, lethal finishers.',
                skills: {
                    backstab: {
                        id: 'backstab', tier: 1, name: 'Backstab', emoji: '🔪',
                        type: 'active_combat',
                        desc: 'Round 1 attack deals +60% damage and cannot be blocked.',
                        effects: [{ type: 'active_combat', id: 'backstab', round: 1, dmg_bonus: 0.60, pierce_block: true }],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    expose_weakness: {
                        id: 'expose_weakness', tier: 2, name: 'Expose Weakness', emoji: '🎯',
                        type: 'passive_stat',
                        desc: '+6 Crit Chance permanently.',
                        effects: [{ type: 'passive_stat', stat: 'crit_chance', value: 6 }],
                        requires: ['backstab'],
                        goldCost: 1800,
                        materials: { poison_extract: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_10',
                    },
                    venomfang: {
                        id: 'venomfang', tier: 3, name: 'Venomfang', emoji: '🐍',
                        type: 'active_combat',
                        desc: 'Each hit applies poison: +5 bonus damage per round for the whole battle.',
                        effects: [{ type: 'active_combat', id: 'venomfang', poison_dot: 5 }],
                        requires: ['expose_weakness'],
                        goldCost: 5000,
                        materials: { poison_extract: 4, tanned_hide: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_25',
                    },
                    death_mark: {
                        id: 'death_mark', tier: 4, name: 'Death Mark', emoji: '☠️',
                        type: 'active_combat',
                        desc: 'Once per battle: mark enemy — next hit deals (Agility × 2) bonus damage.',
                        effects: [{ type: 'active_combat', id: 'death_mark', agility_mult: 2.0, uses: 1 }],
                        requires: ['venomfang'],
                        goldCost: 15000,
                        materials: { void_crystal: 2, poison_extract: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_10',
                    },
                    shadow_reaper: {
                        id: 'shadow_reaper', tier: 5, name: 'Shadow Reaper', emoji: '💀',
                        type: 'passive_stat',
                        desc: '+10 Crit Chance, +8 Strength, +8 Agility permanently. Crits ignore 50% of armour.',
                        effects: [
                            { type: 'passive_stat',   stat: 'crit_chance', value: 10 },
                            { type: 'passive_stat',   stat: 'strength',    value: 8  },
                            { type: 'passive_stat',   stat: 'agility',     value: 8  },
                            { type: 'class_modifier', id: 'crit_armour_pierce', pct: 0.50 },
                        ],
                        requires: ['death_mark'],
                        goldCost: 45000,
                        materials: { legendary_fragment: 5, shadow_weave: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_100',
                    },
                },
            },

            // ── Branch 2: Trickster ─────────────────────────────────────────
            trickster: {
                name: 'Trickster',
                emoji: '🃏',
                description: 'Unpredictable and evasive. High dodge, misdirection, and counter-play.',
                skills: {
                    feint: {
                        id: 'feint', tier: 1, name: 'Feint', emoji: '💨',
                        type: 'passive_stat',
                        desc: '+5 Agility permanently.',
                        effects: [{ type: 'passive_stat', stat: 'agility', value: 5 }],
                        requires: [],
                        goldCost: 500,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    shadow_step: {
                        id: 'shadow_step', tier: 2, name: 'Shadow Step', emoji: '👻',
                        type: 'active_combat',
                        desc: '+40% dodge chance for the whole battle.',
                        effects: [{ type: 'active_combat', id: 'shadow_step', dodge_bonus: 0.40 }],
                        requires: ['feint'],
                        goldCost: 2000,
                        materials: { tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    smoke_bomb: {
                        id: 'smoke_bomb', tier: 3, name: 'Smoke Bomb', emoji: '💣',
                        type: 'active_combat',
                        desc: 'Rounds 1–2: enemy has 30% chance to miss entirely.',
                        effects: [{ type: 'active_combat', id: 'smoke_bomb', enemy_miss_chance: 0.30, rounds: [1, 2] }],
                        requires: ['shadow_step'],
                        goldCost: 5500,
                        materials: { poison_extract: 3, tanned_hide: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_25',
                    },
                    phantom_strikes: {
                        id: 'phantom_strikes', tier: 4, name: 'Phantom Strikes', emoji: '🌀',
                        type: 'active_combat',
                        desc: '+10 Agility, +8 Agility in dodge form. Dodge also procs 20% damage counter.',
                        effects: [
                            { type: 'passive_stat',  stat: 'agility', value: 10 },
                            { type: 'active_combat', id: 'phantom_counter', counter_on_dodge_pct: 0.20 },
                        ],
                        requires: ['smoke_bomb'],
                        goldCost: 16000,
                        materials: { void_crystal: 2, arcane_shard: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_30',
                    },
                    ghost_form: {
                        id: 'ghost_form', tier: 5, name: 'Ghost Form', emoji: '👁️',
                        type: 'passive_pct',
                        desc: '+20% Agility permanently. Incoming crits have 40% chance to be negated entirely.',
                        effects: [
                            { type: 'passive_pct',   stat: 'agility', value: 0.20 },
                            { type: 'active_combat', id: 'negate_crit', chance: 0.40 },
                        ],
                        requires: ['phantom_strikes'],
                        goldCost: 45000,
                        materials: [ { legendary_fragment: 5 }, { shadow_weave: 1 } ],
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_100',
                    },
                },
            },

            // ── Branch 3: Shadowblade ───────────────────────────────────────
            shadowblade: {
                name: 'Shadowblade',
                emoji: '🌑',
                description: 'Strike from darkness. Shadow-infused blades deal bonus elemental damage.',
                skills: {
                    shadow_coat: {
                        id: 'shadow_coat', tier: 2, name: 'Shadow Coat', emoji: '🌑',
                        type: 'passive_stat',
                        desc: '+4 Wind Damage permanently (blade trailing shadow).',
                        effects: [{ type: 'passive_stat', stat: 'wind_dmg', value: 4 }],
                        requires: ['backstab'],
                        goldCost: 2000,
                        materials: { shadow_essence: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    nightfall: {
                        id: 'nightfall', tier: 3, name: 'Nightfall', emoji: '🌒',
                        type: 'active_combat',
                        desc: '+8 Wind Damage. Reduce enemy hit chance by 15% (darkness disorientation).',
                        effects: [
                            { type: 'passive_stat',  stat: 'wind_dmg', value: 8 },
                            { type: 'active_combat', id: 'darkness_debuff', enemy_hit_debuff: 0.15 },
                        ],
                        requires: ['shadow_coat'],
                        goldCost: 6000,
                        materials: { shadow_essence: 3, void_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    void_blade: {
                        id: 'void_blade', tier: 4, name: 'Void Blade', emoji: '🗡️',
                        type: 'active_combat',
                        desc: 'Every hit has 25% chance to deal bonus electro + wind damage equal to Agility.',
                        effects: [{ type: 'active_combat', id: 'void_blade', proc_chance: 0.25, bonus_from_stat: 'agility', elems: ['electro', 'wind'] }],
                        requires: ['nightfall'],
                        goldCost: 16000,
                        materials: { void_crystal: 3, shadow_essence: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'dungeon_floor_5',
                    },
                },
            },

            // ── Branch 4: Dual Wielder (HIDDEN — unlocked through secret quest) ──
            dual_wielder: {
                name: 'Dual Wielder',
                emoji: '⚔️⚔️',
                description: 'Secret path. Drop the shield, double the blades. Your second weapon attacks every round.',
                hidden: true,   // Not shown until unlocked
                skills: {
                    off_hand_training: {
                        id: 'off_hand_training', tier: 3, name: 'Off-Hand Training', emoji: '🤜',
                        type: 'class_modifier',
                        desc: 'Unlock the ability to equip a second weapon in place of your shield slot. Off-hand weapon deals 60% damage.',
                        effects: [
                            { type: 'class_modifier', id: 'dual_wield_unlock', off_hand_dmg_pct: 0.60 },
                        ],
                        requires: [],   // no skill prereqs; gated by quest condition only
                        goldCost: 10000,
                        materials: { mithril_ingot: 3, tanned_hide: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        // This skill reveals itself only after the player wins 15 battles without a shield equipped
                        unlockCondition: 'kills_no_shield',
                        quest_hint: 'A wandering duelist seems impressed by your courage in fighting without a shield...',
                    },
                    ambidexterity: {
                        id: 'ambidexterity', tier: 4, name: 'Ambidexterity', emoji: '🤝',
                        type: 'passive_pct',
                        desc: 'Off-hand weapon damage increases from 60% to 80%.',
                        effects: [{ type: 'class_modifier', id: 'dual_wield_dmg_pct', off_hand_dmg_pct: 0.80 }],
                        requires: ['off_hand_training'],
                        goldCost: 18000,
                        materials: { void_crystal: 2, shadow_essence: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'wins_50',
                    },
                    blade_storm: {
                        id: 'blade_storm', tier: 5, name: 'Blade Storm', emoji: '🌀',
                        type: 'active_combat',
                        desc: 'Once per battle: both weapons attack simultaneously (full damage each), ignoring all blocks.',
                        effects: [{ type: 'active_combat', id: 'blade_storm', dual_strike: true, pierce_block: true, uses: 1 }],
                        requires: ['ambidexterity'],
                        goldCost: 40000,
                        materials: { legendary_fragment: 5, shadow_weave: 2, void_crystal: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_100',
                    },
                    twin_agility: {
                        id: 'twin_agility', tier: 4, name: 'Twin Agility', emoji: '💨',
                        type: 'passive_stat',
                        desc: '+12 Agility permanently (compensates for no shield dodge loss).',
                        effects: [{ type: 'passive_stat', stat: 'agility', value: 12 }],
                        requires: ['off_hand_training'],
                        goldCost: 12000,
                        materials: { tanned_hide: 4, frost_core: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: null,
                    },
                },
            },
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // PALADIN — The Holy Tank
    // Branches: Protector | Divine Warrior | Inquisitor | Crusader
    // Pure tank philosophy — heavy penalties on Agility and Strength upgrades,
    // massive discounts on Defense, Vitality, Magic.
    // ─────────────────────────────────────────────────────────────────────────
    paladin: {
        description: 'Paladins are living walls of divine steel. Their purpose is to endure, protect, and punish those who dare strike them.',
        upgrade_penalties: { agility: 0.60, strength: 0.20 },  // +60% AGI cost, +20% STR cost
        upgrade_discounts: { defense: 0.25, magic: 0.20, vitality: 0.15 },

        branches: {

            // ── Branch 1: Protector ─────────────────────────────────────────
            protector: {
                name: 'Protector',
                emoji: '🏰',
                description: 'Maximum survivability. Shields, blocks, and unbreakable defence.',
                skills: {
                    stalwart: {
                        id: 'stalwart', tier: 1, name: 'Stalwart', emoji: '⚓',
                        type: 'passive_stat',
                        desc: '+6 Defense, +4 Vitality permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'defense',  value: 6 },
                            { type: 'passive_stat', stat: 'vitality', value: 4 },
                        ],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    aegis: {
                        id: 'aegis', tier: 2, name: 'Aegis', emoji: '🛡️',
                        type: 'passive_pct',
                        desc: '+30% shield block effectiveness.',
                        effects: [{ type: 'passive_pct', stat: 'block_effectiveness', value: 0.30 }],
                        requires: ['stalwart'],
                        goldCost: 2500,
                        materials: { iron_ingot: 5 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    fortress_stance: {
                        id: 'fortress_stance', tier: 3, name: 'Fortress Stance', emoji: '🗼',
                        type: 'active_combat',
                        desc: '+10 Armor, +8 Defense in battle. First hit each battle is automatically blocked.',
                        effects: [
                            { type: 'passive_stat',  stat: 'armor',   value: 10 },
                            { type: 'passive_stat',  stat: 'defense', value: 8  },
                            { type: 'active_combat', id: 'auto_block_first_hit' },
                        ],
                        requires: ['aegis'],
                        goldCost: 8000,
                        materials: { mithril_ingot: 3, iron_ingot: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'level_20',
                    },
                    impenetrable: {
                        id: 'impenetrable', tier: 4, name: 'Impenetrable', emoji: '💎',
                        type: 'passive_stat',
                        desc: '+15 Armor, +30 max HP. Reduce all physical damage by 15%.',
                        effects: [
                            { type: 'passive_stat', stat: 'armor',    value: 15 },
                            { type: 'passive_stat', stat: 'hp_max',   value: 30 },
                            { type: 'passive_pct',  stat: 'phys_dmg_taken', value: -0.15 },
                        ],
                        requires: ['fortress_stance'],
                        goldCost: 20000,
                        materials: { dragon_plate: 3, void_crystal: 1 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'dungeon_floor_5',
                    },
                    guardian: {
                        id: 'guardian', tier: 5, name: 'Guardian', emoji: '👑',
                        type: 'passive_stat',
                        desc: '+20 Defense, +20 Armor, +60 HP. Reduce ALL incoming damage by 20%.',
                        effects: [
                            { type: 'passive_stat', stat: 'defense', value: 20 },
                            { type: 'passive_stat', stat: 'armor',   value: 20 },
                            { type: 'passive_stat', stat: 'hp_max',  value: 60 },
                            { type: 'passive_pct',  stat: 'dmg_taken', value: -0.20 },
                        ],
                        requires: ['impenetrable'],
                        goldCost: 60000,
                        materials: { legendary_fragment: 6, demon_alloy: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_20',
                    },
                },
            },

            // ── Branch 2: Divine Warrior ─────────────────────────────────────
            divine_warrior: {
                name: 'Divine Warrior',
                emoji: '✨',
                description: 'Holy strikes and divine healing. Punishment wrapped in righteousness.',
                skills: {
                    divine_favor: {
                        id: 'divine_favor', tier: 1, name: 'Divine Favor', emoji: '🙏',
                        type: 'passive_stat',
                        desc: '+5 Magic permanently (fuels divine abilities).',
                        effects: [{ type: 'passive_stat', stat: 'magic', value: 5 }],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    holy_strike: {
                        id: 'holy_strike', tier: 2, name: 'Holy Strike', emoji: '⚡',
                        type: 'active_combat',
                        desc: '+20% damage. Heal 10% of all damage dealt.',
                        effects: [{ type: 'active_combat', id: 'holy_strike', dmg_bonus: 0.20, heal_pct: 0.10 }],
                        requires: ['divine_favor'],
                        goldCost: 2500,
                        materials: { arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: null,
                    },
                    consecrate: {
                        id: 'consecrate', tier: 3, name: 'Consecrate', emoji: '🌿',
                        type: 'active_combat',
                        desc: 'Reflect 20% of all damage received back to attacker.',
                        effects: [{ type: 'active_combat', id: 'consecrate', reflect_pct: 0.20 }],
                        requires: ['holy_strike'],
                        goldCost: 7000,
                        materials: { arcane_shard: 3, iron_ingot: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_25',
                    },
                    divine_judgment: {
                        id: 'divine_judgment', tier: 4, name: 'Divine Judgment', emoji: '⚖️',
                        type: 'active_combat',
                        desc: 'Once per battle: deal (Defense × 2) holy damage ignoring all armour.',
                        effects: [{ type: 'active_combat', id: 'divine_judgment', defense_mult: 2.0, ignore_armour: true, uses: 1 }],
                        requires: ['consecrate'],
                        goldCost: 18000,
                        materials: { void_crystal: 2, dragon_plate: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'level_30',
                    },
                    avatar_of_justice: {
                        id: 'avatar_of_justice', tier: 5, name: 'Avatar of Justice', emoji: '☀️',
                        type: 'passive_stat',
                        desc: '+10 Magic, +10 Defense permanently. Reflect increases to 30%. Heal 15% per round.',
                        effects: [
                            { type: 'passive_stat',   stat: 'magic',   value: 10 },
                            { type: 'passive_stat',   stat: 'defense', value: 10 },
                            { type: 'active_combat',  id: 'consecrate', reflect_pct: 0.30 },
                            { type: 'active_combat',  id: 'holy_regen', heal_pct_per_round: 0.15 },
                        ],
                        requires: ['divine_judgment'],
                        goldCost: 55000,
                        materials: { legendary_fragment: 6, shadow_weave: 1, void_crystal: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_20',
                    },
                },
            },

            // ── Branch 3: Inquisitor ─────────────────────────────────────────
            inquisitor: {
                name: 'Inquisitor',
                emoji: '🔎',
                description: 'Punish weakness. Bonus damage against enemies who have been hit hard, or try to run.',
                skills: {
                    judgement: {
                        id: 'judgement', tier: 1, name: 'Judgement', emoji: '⚖️',
                        type: 'passive_stat',
                        desc: '+4 Hit Chance, +3 Crit Chance permanently.',
                        effects: [
                            { type: 'passive_stat', stat: 'hit_chance',  value: 4 },
                            { type: 'passive_stat', stat: 'crit_chance', value: 3 },
                        ],
                        requires: [],
                        goldCost: 600,
                        materials: {},
                        trainDuration: SKILL_TRAIN_DURATIONS.novice,
                        unlockCondition: null,
                    },
                    expose: {
                        id: 'expose', tier: 2, name: 'Expose', emoji: '🎯',
                        type: 'active_combat',
                        desc: '+15% Crit Chance for the whole battle.',
                        effects: [{ type: 'active_combat', id: 'expose', crit_bonus: 0.15 }],
                        requires: ['judgement'],
                        goldCost: 2500,
                        materials: { hardwood_plank: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.apprentice,
                        unlockCondition: 'wins_10',
                    },
                    crusader_oath: {
                        id: 'crusader_oath', tier: 3, name: 'Crusader\'s Oath', emoji: '📜',
                        type: 'active_combat',
                        desc: '+30% damage against enemies below 50% HP.',
                        effects: [{ type: 'active_combat', id: 'crusader_oath', hp_threshold: 0.50, dmg_bonus: 0.30 }],
                        requires: ['expose'],
                        goldCost: 8000,
                        materials: { void_shard: 2, iron_ingot: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    sanctioned_strike: {
                        id: 'sanctioned_strike', tier: 4, name: 'Sanctioned Strike', emoji: '✝️',
                        type: 'active_combat',
                        desc: 'Critical hits also heal you for 20% of crit damage.',
                        effects: [{ type: 'active_combat', id: 'sanctioned_strike', crit_heal_pct: 0.20 }],
                        requires: ['crusader_oath'],
                        goldCost: 18000,
                        materials: { arcane_shard: 3, mithril_ingot: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'zero_deaths_dungeon',
                    },
                    divine_shield: {
                        id: 'divine_shield', tier: 5, name: 'Divine Shield', emoji: '🌟',
                        type: 'active_combat',
                        desc: 'Negate the very first hit received each battle. Sanctioned Strike heal increases to 35%.',
                        effects: [
                            { type: 'active_combat', id: 'divine_shield',      negate_first_hit: true },
                            { type: 'active_combat', id: 'sanctioned_strike',  crit_heal_pct: 0.35 },
                        ],
                        requires: ['sanctioned_strike'],
                        goldCost: 55000,
                        materials: { legendary_fragment: 6, demon_core: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'wins_100',
                    },
                },
            },

            // ── Branch 4: Crusader ───────────────────────────────────────────
            crusader: {
                name: 'Crusader',
                emoji: '⚔️',
                description: 'Advance relentlessly. Elemental holy damage and unstoppable momentum.',
                skills: {
                    holy_aura: {
                        id: 'holy_aura', tier: 2, name: 'Holy Aura', emoji: '🌅',
                        type: 'passive_stat',
                        desc: '+6 Pyro Damage (holy fire), +4 all Elemental Resistances.',
                        effects: [
                            { type: 'passive_stat',  stat: 'pyro_dmg', value: 6 },
                            { type: 'resist_bonus',  elems: ['pyro','water','wind','electro'], value: 4 },
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
                        desc: '+10 Pyro Damage. Damage increases by 5% per round (building momentum).',
                        effects: [
                            { type: 'passive_stat',  stat: 'pyro_dmg', value: 10 },
                            { type: 'active_combat', id: 'momentum', dmg_per_round_pct: 0.05 },
                        ],
                        requires: ['holy_aura'],
                        goldCost: 8000,
                        materials: { dragon_scale_shard: 2, arcane_shard: 3 },
                        trainDuration: SKILL_TRAIN_DURATIONS.journeyman,
                        unlockCondition: 'wins_50',
                    },
                    holy_crusade: {
                        id: 'holy_crusade', tier: 4, name: 'Holy Crusade', emoji: '🏳️',
                        type: 'active_combat',
                        desc: 'Once per battle: deal (Magic + Defense) as holy fire damage, ignoring all resistance.',
                        effects: [{ type: 'active_combat', id: 'holy_crusade', stats_sum: ['magic', 'defense'], ignore_resist: true, uses: 1 }],
                        requires: ['righteous_fury'],
                        goldCost: 20000,
                        materials: { void_crystal: 2, dragon_plate: 2, arcane_shard: 2 },
                        trainDuration: SKILL_TRAIN_DURATIONS.expert,
                        unlockCondition: 'hard_mission_10',
                    },
                    undying_crusader: {
                        id: 'undying_crusader', tier: 5, name: 'Undying Crusader', emoji: '🕊️',
                        type: 'passive_stat',
                        desc: '+15 Magic, +15 all Elemental Resistances, +40 HP. Holy fire deals +40% more damage.',
                        effects: [
                            { type: 'passive_stat',   stat: 'magic',  value: 15 },
                            { type: 'passive_stat',   stat: 'hp_max', value: 40 },
                            { type: 'resist_bonus',   elems: ['pyro','water','wind','electro'], value: 15 },
                            { type: 'class_modifier', id: 'holy_fire_amplify', bonus: 0.40 },
                        ],
                        requires: ['holy_crusade'],
                        goldCost: 60000,
                        materials: { legendary_fragment: 6, demon_alloy: 2, legendary_fragment: 4 },
                        trainDuration: SKILL_TRAIN_DURATIONS.grandmaster,
                        unlockCondition: 'dungeon_floor_20',
                    },
                },
            },
        },
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS — Server-side evaluation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check whether a character meets an unlock condition.
 * @param {Object} char   - character row from DB
 * @param {string} condId - key in UNLOCK_CONDITIONS, or null
 * @param {Object} stats  - additional computed stats (e.g. { wins_no_shield, hard_missions })
 */
function meetsUnlockCondition(char, condId, stats = {}) {
    if (!condId) return true;
    const cond = UNLOCK_CONDITIONS[condId];
    if (!cond) return false;
    const target = stats[cond.type] ?? char[cond.type] ?? 0;
    return target >= cond.value;
}

/**
 * Get the skill tree for a class, with hidden branches filtered unless unlocked.
 * @param {string} className  - 'warrior' | 'mage' | 'rogue' | 'paladin'
 * @param {Object} char       - character row
 * @param {Object} learnedMap - { skillId: true } of already-learned skills
 * @param {Object} extraStats - additional computed values for unlock checks
 */
function getVisibleSkillTree(className, char, learnedMap = {}, extraStats = {}) {
    const tree = SKILL_TREES[className];
    if (!tree) return null;

    const result = { ...tree, branches: {} };

    for (const [branchId, branch] of Object.entries(tree.branches)) {
        if (branch.hidden) {
            // Only reveal if any skill in the branch is unlockable
            const anyVisible = Object.values(branch.skills).some(sk =>
                meetsUnlockCondition(char, sk.unlockCondition, extraStats)
            );
            if (!anyVisible) continue;
        }

        const enrichedSkills = {};
        for (const [skId, sk] of Object.entries(branch.skills)) {
            const learned     = !!learnedMap[skId];
            const prereqsMet  = sk.requires.every(r => !!learnedMap[r]);
            const condMet     = meetsUnlockCondition(char, sk.unlockCondition, extraStats);
            const locked      = !prereqsMet || !condMet;

            // Exclusive branch check
            let exclusiveLocked = false;
            if (branch.exclusive_with && learnedMap) {
                const oppBranch = tree.branches[branch.exclusive_with];
                if (oppBranch) {
                    exclusiveLocked = Object.keys(oppBranch.skills).some(s => !!learnedMap[s]);
                }
            }

            enrichedSkills[skId] = {
                ...sk,
                learned,
                locked: locked || exclusiveLocked,
                prereqsMet,
                condMet,
                exclusiveLocked,
                unlockConditionDesc: sk.unlockCondition ? (UNLOCK_CONDITIONS[sk.unlockCondition]?.desc ?? '') : null,
            };
        }

        result.branches[branchId] = { ...branch, skills: enrichedSkills };
    }

    return result;
}

/**
 * Aggregate all passive bonuses from a character's learned skills.
 * Returns an object of stat→bonus suitable for adding to the character sheet.
 * @param {string} className
 * @param {string[]} learnedSkillIds
 */
function computePassiveBonuses(className, learnedSkillIds) {
    const tree   = SKILL_TREES[className];
    if (!tree) return {};
    const bonuses = {};

    const addBonus = (stat, value) => {
        bonuses[stat] = (bonuses[stat] || 0) + value;
    };

    for (const branch of Object.values(tree.branches)) {
        for (const sk of Object.values(branch.skills)) {
            if (!learnedSkillIds.includes(sk.id)) continue;
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'passive_stat') {
                    addBonus(eff.stat, eff.value);
                } else if (eff.type === 'resist_bonus') {
                    for (const elem of (eff.elems || [])) {
                        addBonus(`${elem}_resist`, eff.value);
                    }
                }
                // passive_pct and class_modifier are handled separately at combat time
            }
        }
    }

    return bonuses;
}

/**
 * Get all active-combat effect descriptors for a character's learned skills.
 * Used to build the fighter object in runBattle().
 */
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

/**
 * Get all class_modifier effects for a character's learned skills.
 */
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

/**
 * Get effective upgrade cost for a stat, including class penalties from skill tree data.
 * Called from the upgrade endpoint to add surcharges/discounts on top of base formula.
 * @param {string} className
 * @param {string} stat
 * @param {number} baseCost - already-computed base gold cost
 * @returns {number} adjusted cost
 */
function applyClassUpgradeCostModifier(className, stat, baseCost, learnedSkills = []) {
    const tree = SKILL_TREES[className];
    if (!tree) return baseCost;
    
    let cost = baseCost;
    
    // ALWAYS apply class penalties (no skill needed)
    const penalty = tree.upgrade_penalties?.[stat] || 0;
    cost = Math.floor(cost * (1 + penalty));
    
    // Only apply discounts if the relevant skill is learned
    // You'd need to map stats to specific skills that grant discounts
    const discount = tree.upgrade_discounts?.[stat] || 0;
    if (discount > 0 && hasDiscountSkill(className, stat, learnedSkills)) {
        cost = Math.floor(cost * (1 - discount));
    }
    
    return Math.max(10, cost);
}

/**
 * Check if a rogue has dual-wield unlocked.
 */
function rogueHasDualWield(learnedSkillIds) {
    return learnedSkillIds.includes('off_hand_training');
}

/**
 * Check if a mage is on the shadow or light path (or neither).
 */
function magePath(learnedSkillIds) {
    const shadowSkills = Object.keys(SKILL_TREES.mage.branches.shadow_path.skills);
    const lightSkills  = Object.keys(SKILL_TREES.mage.branches.light_path.skills);
    if (shadowSkills.some(s => learnedSkillIds.includes(s))) return 'shadow';
    if (lightSkills.some(s  => learnedSkillIds.includes(s))) return 'light';
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB SCHEMA ADDITIONS  (run these migrations in your db init block)
// ═══════════════════════════════════════════════════════════════════════════════
const SKILL_TREE_MIGRATIONS = [
    // Stores learned tree skills (different from old active_skills)
    `CREATE TABLE IF NOT EXISTS character_skill_tree (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        char_id     INTEGER NOT NULL,
        skill_id    TEXT    NOT NULL,
        branch_id   TEXT    NOT NULL,
        class       TEXT    NOT NULL,
        learned_at  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(char_id, skill_id)
    )`,
    // In-progress skill training sessions
    `CREATE TABLE IF NOT EXISTS skill_training (
        char_id      INTEGER PRIMARY KEY,
        skill_id     TEXT    NOT NULL,
        branch_id    TEXT    NOT NULL,
        started_at   INTEGER NOT NULL,
        ends_at      INTEGER NOT NULL
    )`,
    // Track stats needed for unlock conditions (updated by game events)
    `ALTER TABLE characters ADD COLUMN hard_missions_completed INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN total_missions_completed INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN wins_without_shield INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN elemental_kills INTEGER DEFAULT 0`,
    `ALTER TABLE characters ADD COLUMN dungeon_no_death_runs INTEGER DEFAULT 0`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();

// auth middleware is passed in — see module.exports at bottom

// ── Helper: load character & learned skills ───────────────────────────────────
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

// ── GET /skills/tree ──────────────────────────────────────────────────────────
// Returns the full visible skill tree for the player's class, enriched with
// learned / locked / prereq info.
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

        const tree     = getVisibleSkillTree(char.class, char, learnedMap, extraStats);
        const passives = computePassiveBonuses(char.class, learned);
        const mods     = computeClassModifiers(char.class, learned);
        const dualWield = char.class === 'rogue' && rogueHasDualWield(learned);
        const mPath     = char.class === 'mage'  ? magePath(learned) : null;

        // Current training session
        const trainingRow = await db.execute({
            sql: 'SELECT * FROM skill_training WHERE char_id=?', args: [char.id]
        });
        const activeTraining = trainingRow.rows[0] || null;
        if (activeTraining) {
            const now = Math.floor(Date.now() / 1000);
            activeTraining.timeLeft = Math.max(0, activeTraining.ends_at - now);
            activeTraining.done     = now >= activeTraining.ends_at;
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

// ── POST /skills/train ────────────────────────────────────────────────────────
// Start training a skill. Character must meet prereqs, conditions, have gold/mats.
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

        // Already learned?
        if (learnedMap[skillId]) return res.status(400).json({ error: 'Already learned this skill' });

        // Exclusive branch check
        if (branch.exclusive_with) {
            const oppBranch = tree.branches[branch.exclusive_with];
            if (oppBranch && Object.keys(oppBranch.skills).some(s => learnedMap[s])) {
                return res.status(400).json({
                    error: `Cannot learn ${branch.name} — you have already started ${oppBranch.name}. These paths are mutually exclusive.`
                });
            }
        }

        // Prereqs
        const missingPrereq = sk.requires.find(r => !learnedMap[r]);
        if (missingPrereq) {
            return res.status(400).json({ error: `Requires skill: ${missingPrereq}` });
        }

        // Unlock condition
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

        // Already training?
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

        // Gold cost
        if ((char.gold || 0) < sk.goldCost) {
            return res.status(400).json({ error: `Need ${sk.goldCost} gold (you have ${char.gold})` });
        }

        // Material costs
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

        // Deduct gold
        await db.execute({ sql: 'UPDATE characters SET gold=gold-? WHERE id=?', args: [sk.goldCost, char.id] });

        // Deduct materials
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

        // Insert training session
        const now = Math.floor(Date.now() / 1000);
        const endsAt = now + sk.trainDuration;
        await db.execute({
            sql: 'INSERT INTO skill_training (char_id, skill_id, branch_id, started_at, ends_at) VALUES (?,?,?,?,?)',
            args: [char.id, skillId, branchId, now, endsAt]
        });

        const mins = Math.round(sk.trainDuration / 60);
        const timeStr = mins >= 60
            ? `${Math.floor(mins/60)}h ${mins%60}m`
            : `${mins}m`;

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

// ── POST /skills/collect ──────────────────────────────────────────────────────
// Collect a completed training session — permanently learns the skill.
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

        // Insert into learned table
        await db.execute({
            sql: 'INSERT OR IGNORE INTO character_skill_tree (char_id, skill_id, branch_id, class, learned_at) VALUES (?,?,?,?,?)',
            args: [char.id, training.skill_id, training.branch_id, char.class, now]
        });

        // Apply any immediate passive_stat bonuses to character
        const learnedIds = (await db.execute({ sql: 'SELECT skill_id FROM character_skill_tree WHERE char_id=?', args: [char.id] })).rows.map(r => r.skill_id);
        const newBonuses = computePassiveBonuses(char.class, learnedIds);
        // We'll store the delta — easier than recomputing every time
        if (sk) {
            for (const eff of (sk.effects || [])) {
                if (eff.type === 'passive_stat') {
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

        // Remove training session
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

// ── POST /skills/cancel ───────────────────────────────────────────────────────
// Cancel in-progress training. Refunds 50% gold, no materials.
router.post('/cancel', async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = await getDb();
        const char = (await db.execute({ sql: 'SELECT * FROM characters WHERE user_id=?', args: [req.user.userId] })).rows[0];
        if (!char) return res.status(404).json({ error: 'No character' });

        const training = (await db.execute({ sql: 'SELECT * FROM skill_training WHERE char_id=?', args: [char.id] })).rows[0];
        if (!training) return res.status(400).json({ error: 'No training in progress' });

        const tree   = SKILL_TREES[char.class];
        const branch = tree?.branches[training.branch_id];
        const sk     = branch?.skills[training.skill_id];
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

// ── GET /skills/training/status ───────────────────────────────────────────────
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

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
    router,
    SKILL_TREES,
    SKILL_TRAIN_DURATIONS,
    UNLOCK_CONDITIONS,
    SKILL_TREE_MIGRATIONS,
    // Combat helpers used by app.js
    computePassiveBonuses,
    computeActiveCombatEffects,
    computeClassModifiers,
    applyClassUpgradeCostModifier,
    rogueHasDualWield,
    magePath,
    meetsUnlockCondition,
    getVisibleSkillTree,
};
