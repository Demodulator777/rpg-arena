// ── Zone definitions ───────────────────────────────────────────────────────
// ── Zone definitions with multiple mission spots ──────────────────────────
const ZONES = {
    forest: {
        name: 'Whispering Forest',
        emoji: '🌲',
        minLevel: 1,
        travelTime: 30, // seconds to travel here from starting point
        description: 'A dense, ancient forest filled with wildlife and bandits.',
        spots: [
            {
                id: 'forest_camp',
                name: 'Hunting Camp',
                difficulty: 'easy',
                description: 'A small camp where hunters gather resources.',
                missionDuration: 600, // 1 minute
                payoutMultiplier: 1.0,
                missions: ['Hunt the Wolves', 'Gather Firewood', 'Collect Wild Herbs', 'Track the Deer']
            },
            {
                id: 'forest_bandits',
                name: 'Bandit Hideout',
                difficulty: 'medium',
                description: 'A group of bandits has set up camp here.',
                missionDuration: 600, // 2 minutes
                payoutMultiplier: 1.5,
                missions: ['Clear the Bandits', 'Scout the Path', 'Recover Stolen Goods', 'Rescue the Captive']
            },
            {
                id: 'forest_ruins',
                name: 'Old Ruins',
                difficulty: 'hard',
                description: 'Ancient ruins hidden deep in the forest.',
                missionDuration: 600, // 3 minutes
                payoutMultiplier: 2.0,
                missions: ['Explore the Ruins', 'Defeat the Forest Guardian', 'Find the Lost Relic', 'Cleanse the Corruption']
            }
        ],
        payoutBase: { easy: [20,50], medium: [50,120], hard: [120,250] },
        xpBase: { easy: [0,5], medium: [5,10], hard: [10,15] },
        rawMats: ['iron_ore', 'wood', 'wolf_pelt', 'herbs'],
        matDropChance: 0.7,
        matDropCount: [1,2]
    },

    swamp: {
        name: 'Rotting Swamp',
        emoji: '🌿',
        minLevel: 5,
        travelTime: 60, // seconds from forest
        description: 'A murky, poisonous swamp filled with dangerous creatures.',
        spots: [
            {
                id: 'swamp_edge',
                name: 'Swamp Edge',
                difficulty: 'easy',
                description: 'The safer outskirts of the swamp.',
                missionDuration: 600,
                payoutMultiplier: 1.0,
                missions: ['Harvest Poison Glands', 'Collect Swamp Crystals', 'Gather Herbs', 'Catch Swamp Frogs']
            },
            {
                id: 'swamp_village',
                name: 'Abandoned Village',
                difficulty: 'medium',
                description: 'A village consumed by the swamp.',
                missionDuration: 600,
                payoutMultiplier: 1.5,
                missions: ['Find the Lost Merchant', 'Purge the Undead', 'Rescue the Prisoner', 'Loot the Houses']
            },
            {
                id: 'swamp_heart',
                name: 'Swamp Heart',
                difficulty: 'hard',
                description: 'The center of the swamp, where the Bog Witch dwells.',
                missionDuration: 600,
                payoutMultiplier: 2.5,
                missions: ['Slay the Bog Witch', 'Destroy the Corrupted Heart', 'Purify the Waters', 'Face the Swamp Horror']
            }
        ],
        payoutBase: { easy: [60,130], medium: [130,280], hard: [280,500] },
        xpBase: { easy: [0,5], medium: [5,10], hard: [10,15] },
        rawMats: ['iron_ore', 'wood', 'poison_gland', 'swamp_crystal', 'herbs'],
        matDropChance: 0.75,
        matDropCount: [1,3]
    },

    mountains: {
        name: 'Frozen Mountains',
        emoji: '⛰️',
        minLevel: 10,
        travelTime: 90, // seconds from swamp
        description: 'Snow-capped peaks with treacherous paths.',
        spots: [
            {
                id: 'mountain_base',
                name: 'Mountain Base',
                difficulty: 'easy',
                description: 'The foothills of the mountain range.',
                missionDuration: 600,
                payoutMultiplier: 1.0,
                missions: ['Mine Iron Ore', 'Chart the Ice Caves', 'Hunt Mountain Goats', 'Collect Frost Herbs']
            },
            {
                id: 'mountain_peak',
                name: 'Frozen Peak',
                difficulty: 'medium',
                description: 'The highest peak, constantly battered by storms.',
                missionDuration: 600,
                payoutMultiplier: 1.8,
                missions: ['Claim the Summit', 'Recover the Artifact', 'Defeat the Mountain Troll', 'Find the Frozen Temple']
            },
            {
                id: 'ice_cavern',
                name: 'Ice Cavern',
                difficulty: 'hard',
                description: 'Deep caves filled with ice and mystery.',
                missionDuration: 600,
                payoutMultiplier: 2.5,
                missions: ['Slay the Ice Drake', 'Mine the Mithril Vein', 'Awaken the Frozen Giant', 'Retrieve the Frost Core']
            }
        ],
        payoutBase: { easy: [150,300], medium: [300,600], hard: [600,1100] },
        xpBase: { easy: [0,5], medium: [5,10], hard: [10,15] },
        rawMats: ['iron_ore', 'mithril_ore', 'mountain_stone', 'frost_essence', 'dragon_scale_shard'],
        matDropChance: 0.8,
        matDropCount: [1,3]
    },

    ruins: {
        name: 'Ancient Ruins',
        emoji: '🏚️',
        minLevel: 20,
        travelTime: 120, // seconds from mountains
        description: 'Remains of an ancient civilization, now haunted.',
        spots: [
            {
                id: 'ruins_perimeter',
                name: 'Ruins Perimeter',
                difficulty: 'easy',
                description: 'The outer walls of the ancient city.',
                missionDuration: 480,
                payoutMultiplier: 1.0,
                missions: ['Decode the Rune Stones', 'Clear the Vines', 'Scout the Entrance', 'Collect Ancient Debris']
            },
            {
                id: 'ruins_temple',
                name: 'Sunken Temple',
                difficulty: 'medium',
                description: 'A temple half-buried in the ground.',
                missionDuration: 900,
                payoutMultiplier: 1.8,
                missions: ['Destroy the Corrupted Altar', 'Find the Lost Grimoire', 'Capture the Shadow Elemental', 'Purify the Holy Ground']
            },
            {
                id: 'ruins_crypt',
                name: 'Ancient Crypt',
                difficulty: 'hard',
                description: 'Burial place of ancient kings, now filled with undead.',
                missionDuration: 1200,
                payoutMultiplier: 2.8,
                missions: ['Banish the Wraith Lord', 'Loot the Sealed Vault', 'Break the Undead Curse', 'Claim the King\'s Crown']
            }
        ],
        payoutBase: { easy: [400,750], medium: [750,1400], hard: [1400,2500] },
        xpBase: { easy: [0,5], medium: [5,10], hard: [10,15] },
        rawMats: ['mithril_ore', 'arcane_dust', 'void_shard', 'ancient_relic', 'rune_fragment'],
        matDropChance: 0.82,
        matDropCount: [2,4]
    },

    dark_city: {
        name: 'Dark City',
        emoji: '🏙️',
        minLevel: 35,
        travelTime: 180, // seconds from ruins
        description: 'A corrupted city ruled by dark forces.',
        spots: [
            {
                id: 'city_outskirts',
                name: 'City Outskirts',
                difficulty: 'easy',
                description: 'The ruined outer districts of the city.',
                missionDuration: 900,
                payoutMultiplier: 1.0,
                missions: ['Assassinate the Crime Lord', 'Infiltrate the Shadow Guild', 'Sabotage the Dark Portal', 'Free the Slaves']
            },
            {
                id: 'city_cathedral',
                name: 'Dark Cathedral',
                difficulty: 'medium',
                description: 'A cathedral twisted by dark magic.',
                missionDuration: 1800,
                payoutMultiplier: 2.0,
                missions: ['Destroy the Ritual Site', 'Hunt the Demon Enforcer', 'Claim the Black Market', 'Steal the Dark Codex']
            },
            {
                id: 'city_palace',
                name: 'Shadow Palace',
                difficulty: 'hard',
                description: 'Seat of power for the city\'s dark lord.',
                missionDuration: 2700,
                payoutMultiplier: 3.0,
                missions: ['Confront the Shadow Lord', 'Seal the Void Rift', 'Claim the Demon Crown', 'Purge the City Forever']
            }
        ],
        payoutBase: { easy: [1200,2200], medium: [2200,4000], hard: [4000,7500] },
        xpBase: { easy: [0,5], medium: [5,10], hard: [10,15] },
        rawMats: ['void_shard', 'arcane_dust', 'demon_core', 'shadow_essence', 'legendary_fragment'],
        matDropChance: 0.88,
        matDropCount: [2,5]
    }
};

// Player travel state
let playerLocation = 'forest'; // Starting zone
let playerTravelEndTime = 0;
let playerTravelTarget = null;

// ── Raw materials ──────────────────────────────────────────────────────────
const RAW_MATERIALS = {
  iron_ore:           { name: 'Iron Ore',           emoji: '🪨', rarity: 'common'   },
  wood:               { name: 'Wood',               emoji: '🪵', rarity: 'common'   },
  wolf_pelt:          { name: 'Wolf Pelt',          emoji: '🐺', rarity: 'common'   },
  herbs:              { name: 'Herbs',              emoji: '🌿', rarity: 'common'   },
  poison_gland:       { name: 'Poison Gland',       emoji: '🧪', rarity: 'uncommon' },
  swamp_crystal:      { name: 'Swamp Crystal',      emoji: '💎', rarity: 'uncommon' },
  mountain_stone:     { name: 'Mountain Stone',     emoji: '⛏️', rarity: 'uncommon' },
  mithril_ore:        { name: 'Mithril Ore',        emoji: '✨', rarity: 'rare'     },
  frost_essence:      { name: 'Frost Essence',      emoji: '❄️', rarity: 'rare'     },
  dragon_scale_shard: { name: 'Dragon Scale Shard', emoji: '🐉', rarity: 'rare'     },
  arcane_dust:        { name: 'Arcane Dust',        emoji: '🌟', rarity: 'rare'     },
  void_shard:         { name: 'Void Shard',         emoji: '🔮', rarity: 'epic'     },
  ancient_relic:      { name: 'Ancient Relic',      emoji: '🏺', rarity: 'epic'     },
  rune_fragment:      { name: 'Rune Fragment',       emoji: '📜', rarity: 'epic'     },
  demon_core:         { name: 'Demon Core',         emoji: '💀', rarity: 'legendary'},
  shadow_essence:     { name: 'Shadow Essence',     emoji: '👁️', rarity: 'legendary'},
  legendary_fragment: { name: 'Legendary Fragment', emoji: '⭐', rarity: 'legendary'},
};

// ── Forge components (refined from raw mats) ───────────────────────────────
const COMPONENTS = {
  iron_ingot:      { name: 'Iron Ingot',      emoji: '🔩', recipe: { iron_ore: 3 },                     goldCost: 20  },
  hardwood_plank:  { name: 'Hardwood Plank',  emoji: '🪚', recipe: { wood: 3 },                          goldCost: 15  },
  mithril_ingot:   { name: 'Mithril Ingot',   emoji: '⚙️', recipe: { mithril_ore: 3 },                  goldCost: 80  },
  tanned_hide:     { name: 'Tanned Hide',     emoji: '🧶', recipe: { wolf_pelt: 2, herbs: 1 },           goldCost: 25  },
  poison_extract:  { name: 'Poison Extract',  emoji: '⚗️', recipe: { poison_gland: 2 },                 goldCost: 40  },
  arcane_shard:    { name: 'Arcane Shard',    emoji: '💠', recipe: { swamp_crystal: 2, arcane_dust: 1 }, goldCost: 120 },
  frost_core:      { name: 'Frost Core',      emoji: '🧊', recipe: { frost_essence: 2 },                goldCost: 150 },
  dragon_plate:    { name: 'Dragon Plate',    emoji: '🛡️', recipe: { dragon_scale_shard: 3, mithril_ore: 2 }, goldCost: 300 },
  void_crystal:    { name: 'Void Crystal',    emoji: '🔮', recipe: { void_shard: 2, rune_fragment: 1 },  goldCost: 500 },
  shadow_weave:    { name: 'Shadow Weave',    emoji: '🕸️', recipe: { shadow_essence: 2, arcane_dust: 2 }, goldCost: 800 },
  demon_alloy:     { name: 'Demon Alloy',     emoji: '⚡', recipe: { demon_core: 1, mithril_ore: 3 },    goldCost: 1200},
};

// ── Equipment recipes ──────────────────────────────────────────────────────
// Each piece: slot, name, stats, required zone(s) to have done missions in, component cost
const EQUIPMENT_RECIPES = [
  // ── WEAPONS ──
  { id:'iron_sword',    slot:'weapon', name:'Iron Sword',      emoji:'⚔️',  tier:1,
    stats:{ dmg_min:3, dmg_max:7 }, components:{ iron_ingot:2 }, goldCost:80,
    requiredZone:'forest', desc:'A basic iron blade.' },
  { id:'poison_dagger', slot:'weapon', name:'Poison Dagger',   emoji:'🗡️', tier:2,
    stats:{ dmg_min:4, dmg_max:9, elem_dmg_type:'water', elem_dmg:4 }, components:{ iron_ingot:1, poison_extract:1 }, goldCost:200,
    requiredZone:'swamp', desc:'Drips with toxic extract.' },
  { id:'frost_blade',   slot:'weapon', name:'Frost Blade',     emoji:'🧊', tier:3,
    stats:{ dmg_min:8, dmg_max:16, elem_dmg_type:'wind', elem_dmg:8 }, components:{ mithril_ingot:2, frost_core:1 }, goldCost:600,
    requiredZone:'mountains', desc:'Chills the air with every swing.' },
  { id:'rune_staff',    slot:'weapon', name:'Runic Staff',     emoji:'🪄', tier:4,
    stats:{ dmg_min:5, dmg_max:10, elem_dmg_type:'electro', elem_dmg:18 }, components:{ arcane_shard:2, void_crystal:1 }, goldCost:1500,
    requiredZone:'ruins', desc:'Crackles with arcane energy.' },
  { id:'shadow_blade',  slot:'weapon', name:'Shadow Blade',    emoji:'🌑', tier:5,
    stats:{ dmg_min:18, dmg_max:30, elem_dmg_type:'pyro', elem_dmg:22 }, components:{ demon_alloy:1, shadow_weave:1, void_crystal:1 }, goldCost:5000,
    requiredZone:'dark_city', desc:'Forged in demon fire.' },

  // ── ARMOR ──
  { id:'leather_armor', slot:'armor', name:'Leather Armor',   emoji:'🥋', tier:1,
    stats:{ def_bonus:4, elem_resist_water:2 }, components:{ tanned_hide:2 }, goldCost:70,
    requiredZone:'forest', desc:'Light but reliable.' },
  { id:'mithril_plate', slot:'armor', name:'Mithril Plate',   emoji:'🛡️', tier:3,
    stats:{ def_bonus:12, elem_resist_pyro:5, elem_resist_wind:3 }, components:{ mithril_ingot:3, dragon_plate:1 }, goldCost:800,
    requiredZone:'mountains', desc:'Near impenetrable alloy.' },
  { id:'void_robe',     slot:'armor', name:'Void Robe',       emoji:'🌑', tier:5,
    stats:{ def_bonus:8, elem_resist_pyro:10, elem_resist_water:10, elem_resist_wind:10, elem_resist_electro:10 }, components:{ shadow_weave:2, void_crystal:2 }, goldCost:4000,
    requiredZone:'dark_city', desc:'Absorbs elemental punishment.' },

  // ── BOOTS ──
  { id:'swift_boots',   slot:'boots', name:'Swift Boots',     emoji:'👟', tier:1,
    stats:{ agi_bonus:3 }, components:{ tanned_hide:1, hardwood_plank:1 }, goldCost:60,
    requiredZone:'forest', desc:'Light-footed leather.' },
  { id:'wind_treads',   slot:'boots', name:'Wind Treads',     emoji:'💨', tier:3,
    stats:{ agi_bonus:10, elem_resist_wind:5 }, components:{ frost_core:1, tanned_hide:2 }, goldCost:700,
    requiredZone:'mountains', desc:'Blessed by mountain winds.' },
  { id:'shadow_steps',  slot:'boots', name:'Shadow Steps',    emoji:'👣', tier:5,
    stats:{ agi_bonus:18, elem_resist_electro:8 }, components:{ shadow_weave:1, void_crystal:1 }, goldCost:3500,
    requiredZone:'dark_city', desc:'Leave no trace.' },

  // ── AMULETS ──
  { id:'herb_amulet',   slot:'amulet', name:'Herb Amulet',    emoji:'📿', tier:1,
    stats:{ mag_bonus:3, elem_dmg_type:'water', elem_dmg:2 }, components:{ herbs: 4 }, goldCost:50,
    requiredZone:'forest', desc:'Nature-infused pendant.' },
  { id:'arcane_pendant',slot:'amulet', name:'Arcane Pendant', emoji:'🔮', tier:3,
    stats:{ mag_bonus:12, elem_dmg_type:'electro', elem_dmg:10 }, components:{ arcane_shard:2, rune_fragment:1 }, goldCost:900,
    requiredZone:'ruins', desc:'Pulses with arcane power.' },
  { id:'demon_amulet',  slot:'amulet', name:'Demon Amulet',   emoji:'😈', tier:5,
    stats:{ mag_bonus:20, elem_dmg_type:'pyro', elem_dmg:25 }, components:{ demon_core:1, void_crystal:1 }, goldCost:6000,
    requiredZone:'dark_city', desc:'Bound to a demon\'s soul.' },

  // ── RINGS ──
  { id:'iron_ring',     slot:'ring', name:'Iron Ring',        emoji:'💍', tier:1,
    stats:{ str_bonus:2, def_bonus:2 }, components:{ iron_ingot:1 }, goldCost:40,
    requiredZone:'forest', desc:'Simple reinforced band.' },
  { id:'crystal_ring',  slot:'ring', name:'Crystal Ring',     emoji:'💎', tier:2,
    stats:{ mag_bonus:5, elem_dmg_type:'water', elem_dmg:3 }, components:{ arcane_shard:1, swamp_crystal:1 }, goldCost:300,
    requiredZone:'swamp', desc:'Swamp crystal set in silver.' },
  { id:'void_band',     slot:'ring', name:'Void Band',        emoji:'⭕', tier:5,
    stats:{ str_bonus:8, mag_bonus:8, agi_bonus:8, def_bonus:8 }, components:{ void_crystal:2, demon_alloy:1 }, goldCost:8000,
    requiredZone:'dark_city', desc:'A ring of pure chaos.' },
];

// ── Payout tier picker ─────────────────────────────────────────────────────
function rollTier(zone) {
  const w = ZONES[zone].payoutWeights;
  const total = w.small + w.normal + w.good + w.epic;
  let r = Math.random() * total;
  if ((r -= w.small) < 0)  return 'small';
  if ((r -= w.normal) < 0) return 'normal';
  if ((r -= w.good) < 0)   return 'good';
  return 'epic';
}

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMission(zoneId, spotId, charLevel) {
    const zone = ZONES[zoneId];
    const spot = zone.spots.find(s => s.id === spotId);
    if (!spot) return null;

    const difficulty = spot.difficulty;
    const [gMin, gMax] = zone.payoutBase[difficulty];
    const [xMin, xMax] = zone.xpBase[difficulty];

    // Level scaling
    const levelMult = 1 + (charLevel - zone.minLevel) * 0.03;
    const gold = Math.floor(randBetween(gMin, gMax) * levelMult * spot.payoutMultiplier);
    const xp   = Math.floor(randBetween(xMin, xMax) * levelMult * spot.payoutMultiplier);

    // Material drops
    const drops = [];
    if (Math.random() < zone.matDropChance) {
        const count = randBetween(zone.matDropCount[0], zone.matDropCount[1]);
        for (let i = 0; i < count; i++) {
            const mat = zone.rawMats[Math.floor(Math.random() * zone.rawMats.length)];
            const existing = drops.find(d => d.mat === mat);
            if (existing) existing.qty++;
            else drops.push({ mat, qty: 1 });
        }
    }

    const missionName = spot.missions[Math.floor(Math.random() * spot.missions.length)];
    const now = Math.floor(Date.now() / 1000);

    return {
        zone: zoneId,
        spot: spotId,
        spotName: spot.name,
        difficulty,
        missionName,
        gold,
        xp,
        drops,
        duration: spot.missionDuration,
        endsAt: now + spot.missionDuration
    };
}

// Travel to a different zone
function startTravel(targetZone) {
    const currentZone = playerLocation;
    const target = ZONES[targetZone];

    if (!target) return false;
    if (targetZone === currentZone) return false;

    // Calculate travel time (simplified - could be based on distance)
    const travelTime = target.travelTime;

    playerTravelTarget = targetZone;
    playerTravelEndTime = Math.floor(Date.now() / 1000) + travelTime;

    return true;
}

// Check travel status
function getTravelStatus() {
    const now = Math.floor(Date.now() / 1000);

    if (!playerTravelTarget) {
        return { traveling: false, location: playerLocation };
    }

    if (now >= playerTravelEndTime) {
        // Arrived!
        playerLocation = playerTravelTarget;
        playerTravelTarget = null;
        playerTravelEndTime = 0;
        return { traveling: false, location: playerLocation, justArrived: true };
    }

    // Still traveling
    const secondsLeft = playerTravelEndTime - now;
    return {
        traveling: true,
        from: playerLocation,
        to: playerTravelTarget,
        secondsLeft,
        progress: 1 - (secondsLeft / (playerTravelEndTime - (playerTravelEndTime - secondsLeft)))
    };
}

const TIER_COLORS = { small:'#7a7590', normal:'#3498db', good:'#9b59b6', epic:'#e67e22' };
const TIER_LABELS = { small:'Small', normal:'Normal', good:'Good', epic:'⚡ Epic' };

module.exports = { ZONES, RAW_MATERIALS, COMPONENTS, EQUIPMENT_RECIPES, generateMission, TIER_COLORS, TIER_LABELS, randBetween };
