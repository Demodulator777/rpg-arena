// ── Zone definitions ───────────────────────────────────────────────────────
const ZONES = {
    forest: {
        name: 'Whispering Forest', emoji: '🌲', minLevel: 1, travelTime: 30,
        description: 'A dense, ancient forest filled with wildlife and bandits.',
        mapImg: '/images/zones/forest.jpg', bgImg: '/images/zones/forest-bg.jpg',
        pos: { x:22, y:38 },
        spots: [
            { id:'forest_camp',    name:'Hunting Camp',   difficulty:'easy',   description:'A small camp where hunters gather resources.',    missionDuration:600,  payoutMultiplier:1.0, missions:[{name:'Hunt the Wolves',img:'/images/missions/wolves.jpg'},{name:'Gather Firewood',img:'/images/missions/firewood.jpg'},{name:'Collect Wild Herbs',img:'/images/missions/herbs.jpg'},{name:'Track the Deer',img:'/images/missions/deer.jpg'}] },
            { id:'forest_bandits', name:'Bandit Hideout', difficulty:'medium', description:'A group of bandits has set up camp here.',         missionDuration:600,  payoutMultiplier:1.5, missions:[{name:'Clear the Bandits',img:'/images/missions/bandits.jpg'},{name:'Scout the Path',img:'/images/missions/scout.jpg'},{name:'Recover Stolen Goods',img:'/images/missions/goods.jpg'},{name:'Rescue the Captive',img:'/images/missions/rescue.jpg'}] },
            { id:'forest_ruins',   name:'Old Ruins',      difficulty:'hard',   description:'Ancient ruins hidden deep in the forest.',         missionDuration:600,  payoutMultiplier:2.0, missions:[{name:'Explore the Ruins',img:'/images/missions/ruins.jpg'},{name:'Defeat the Forest Guardian',img:'/images/missions/guardian.jpg'},{name:'Find the Lost Relic',img:'/images/missions/relic.jpg'},{name:'Cleanse the Corruption',img:'/images/missions/cleanse.jpg'}] },
        ],
        payoutBase:{ easy:[20,50], medium:[50,120], hard:[120,250] },
        xpBase:{ easy:[0,5], medium:[5,10], hard:[10,15] },
        rawMats:['iron_ore','wood','wolf_pelt','herbs'], matDropChance:0.7, matDropCount:[1,2],
    },
    swamp: {
        name: 'Rotting Swamp', emoji: '🌿', minLevel: 5, travelTime: 60,
        description: 'A murky, poisonous swamp filled with dangerous creatures.',
        mapImg: '/images/zones/swamp.jpg', bgImg: '/images/zones/swamp-bg.jpg',
        pos: { x:40, y:58 },
        spots: [
            { id:'swamp_edge',    name:'Swamp Edge',        difficulty:'easy',   description:'The safer outskirts of the swamp.',                   missionDuration:600, payoutMultiplier:1.0, missions:[{name:'Harvest Poison Glands',img:'/images/missions/poison.jpg'},{name:'Collect Swamp Crystals',img:'/images/missions/crystals.jpg'},{name:'Gather Herbs',img:'/images/missions/herbs.jpg'},{name:'Catch Swamp Frogs',img:'/images/missions/frogs.jpg'}] },
            { id:'swamp_village', name:'Abandoned Village', difficulty:'medium', description:'A village consumed by the swamp.',                     missionDuration:600, payoutMultiplier:1.5, missions:[{name:'Find the Lost Merchant',img:'/images/missions/merchant.jpg'},{name:'Purge the Undead',img:'/images/missions/undead.jpg'},{name:'Rescue the Prisoner',img:'/images/missions/prisoner.jpg'},{name:'Loot the Houses',img:'/images/missions/loot.jpg'}] },
            { id:'swamp_heart',   name:'Swamp Heart',       difficulty:'hard',   description:'The center of the swamp, where the Bog Witch dwells.', missionDuration:600, payoutMultiplier:2.5, missions:[{name:'Slay the Bog Witch',img:'/images/missions/bog-witch.jpg'},{name:'Destroy the Corrupted Heart',img:'/images/missions/heart.jpg'},{name:'Purify the Waters',img:'/images/missions/purify.jpg'},{name:'Face the Swamp Horror',img:'/images/missions/horror.jpg'}] },
        ],
        payoutBase:{ easy:[60,130], medium:[130,280], hard:[280,500] },
        xpBase:{ easy:[0,5], medium:[5,10], hard:[10,15] },
        rawMats:['iron_ore','wood','poison_gland','swamp_crystal','herbs'], matDropChance:0.75, matDropCount:[1,3],
    },
    mountains: {
        name: 'Frozen Mountains', emoji: '⛰️', minLevel: 10, travelTime: 90,
        description: 'Snow-capped peaks with treacherous paths.',
        mapImg: '/images/zones/mountains.jpg', bgImg: '/images/zones/mountains-bg.jpg',
        pos: { x:62, y:25 },
        spots: [
            { id:'mountain_base', name:'Mountain Base', difficulty:'easy',   description:'The foothills of the mountain range.',              missionDuration:600, payoutMultiplier:1.0, missions:[{name:'Mine Iron Ore',img:'/images/missions/mine.jpg'},{name:'Chart the Ice Caves',img:'/images/missions/caves.jpg'},{name:'Hunt Mountain Goats',img:'/images/missions/goats.jpg'},{name:'Collect Frost Herbs',img:'/images/missions/frost-herbs.jpg'}] },
            { id:'mountain_peak', name:'Frozen Peak',   difficulty:'medium', description:'The highest peak, constantly battered by storms.',  missionDuration:600, payoutMultiplier:1.8, missions:[{name:'Claim the Summit',img:'/images/missions/summit.jpg'},{name:'Recover the Artifact',img:'/images/missions/artifact.jpg'},{name:'Defeat the Mountain Troll',img:'/images/missions/troll.jpg'},{name:'Find the Frozen Temple',img:'/images/missions/temple.jpg'}] },
            { id:'ice_cavern',    name:'Ice Cavern',    difficulty:'hard',   description:'Deep caves filled with ice and mystery.',            missionDuration:600, payoutMultiplier:2.5, missions:[{name:'Slay the Ice Drake',img:'/images/missions/drake.jpg'},{name:'Mine the Mithril Vein',img:'/images/missions/mithril.jpg'},{name:'Awaken the Frozen Giant',img:'/images/missions/giant.jpg'},{name:'Retrieve the Frost Core',img:'/images/missions/frost-core.jpg'}] },
        ],
        payoutBase:{ easy:[150,300], medium:[300,600], hard:[600,1100] },
        xpBase:{ easy:[0,5], medium:[5,10], hard:[10,15] },
        rawMats:['iron_ore','mithril_ore','mountain_stone','frost_essence','dragon_scale_shard'], matDropChance:0.8, matDropCount:[1,3],
    },
    ruins: {
        name: 'Ancient Ruins', emoji: '🏚️', minLevel: 20, travelTime: 120,
        description: 'Remains of an ancient civilization, now haunted.',
        mapImg: '/images/zones/ruins.jpg', bgImg: '/images/zones/ruins-bg.jpg',
        pos: { x:75, y:52 },
        spots: [
            { id:'ruins_perimeter', name:'Ruins Perimeter', difficulty:'easy',   description:'The outer walls of the ancient city.',               missionDuration:480,  payoutMultiplier:1.0, missions:[{name:'Decode the Rune Stones',img:'/images/missions/runes.jpg'},{name:'Clear the Vines',img:'/images/missions/vines.jpg'},{name:'Scout the Entrance',img:'/images/missions/entrance.jpg'},{name:'Collect Ancient Debris',img:'/images/missions/debris.jpg'}] },
            { id:'ruins_temple',    name:'Sunken Temple',   difficulty:'medium', description:'A temple half-buried in the ground.',                missionDuration:900,  payoutMultiplier:1.8, missions:[{name:'Destroy the Corrupted Altar',img:'/images/missions/altar.jpg'},{name:'Find the Lost Grimoire',img:'/images/missions/grimoire.jpg'},{name:'Capture the Shadow Elemental',img:'/images/missions/elemental.jpg'},{name:'Purify the Holy Ground',img:'/images/missions/holy.jpg'}] },
            { id:'ruins_crypt',     name:'Ancient Crypt',   difficulty:'hard',   description:'Burial place of ancient kings, now filled with undead.', missionDuration:1200, payoutMultiplier:2.8, missions:[{name:'Banish the Wraith Lord',img:'/images/missions/wraith.jpg'},{name:'Loot the Sealed Vault',img:'/images/missions/vault.jpg'},{name:'Break the Undead Curse',img:'/images/missions/curse.jpg'},{name:"Claim the King's Crown",img:'/images/missions/crown.jpg'}] },
        ],
        payoutBase:{ easy:[400,750], medium:[750,1400], hard:[1000,2000] },
        xpBase:{ easy:[0,5], medium:[5,10], hard:[10,15] },
        rawMats:['mithril_ore','arcane_dust','void_shard','ancient_relic','rune_fragment'], matDropChance:0.82, matDropCount:[2,4],
    },
    dark_city: {
        name: 'Dark City', emoji: '🏙️', minLevel: 35, travelTime: 180,
        description: 'A corrupted city ruled by dark forces.',
        mapImg: '/images/zones/dark-city.jpg', bgImg: '/images/zones/dark-city-bg.jpg',
        pos: { x:55, y:72 },
        spots: [
            { id:'city_outskirts',  name:'City Outskirts', difficulty:'easy',   description:'The ruined outer districts of the city.',      missionDuration:900,  payoutMultiplier:1.0, missions:[{name:'Assassinate the Crime Lord',img:'/images/missions/crime-lord.jpg'},{name:'Infiltrate the Shadow Guild',img:'/images/missions/guild.jpg'},{name:'Sabotage the Dark Portal',img:'/images/missions/portal.jpg'},{name:'Free the Slaves',img:'/images/missions/slaves.jpg'}] },
            { id:'city_cathedral',  name:'Dark Cathedral', difficulty:'medium', description:'A cathedral twisted by dark magic.',            missionDuration:1800, payoutMultiplier:2.0, missions:[{name:'Destroy the Ritual Site',img:'/images/missions/ritual.jpg'},{name:'Hunt the Demon Enforcer',img:'/images/missions/demon.jpg'},{name:'Claim the Black Market',img:'/images/missions/black-market.jpg'},{name:'Steal the Dark Codex',img:'/images/missions/codex.jpg'}] },
            { id:'city_palace',     name:'Shadow Palace',  difficulty:'hard',   description:"Seat of power for the city's dark lord.",      missionDuration:2700, payoutMultiplier:3.0, missions:[{name:'Confront the Shadow Lord',img:'/images/missions/shadow-lord.jpg'},{name:'Seal the Void Rift',img:'/images/missions/rift.jpg'},{name:'Claim the Demon Crown',img:'/images/missions/demon-crown.jpg'},{name:'Purge the City Forever',img:'/images/missions/purge.jpg'}] },
        ],
        payoutBase:{ easy:[800,1200], medium:[1000,1500], hard:[1200,2200] },
        xpBase:{ easy:[0,5], medium:[5,10], hard:[10,15] },
        rawMats:['void_shard','arcane_dust','demon_core','shadow_essence','legendary_fragment'], matDropChance:0.88, matDropCount:[2,5],
    },
};

const ABYSS_ZONES = {
    shadowfen: {
        name: 'Shadowfen Depths', emoji: '🌑', minLevel: 39,
        mapImg: '/images/zones/abyss/shadowfen.jpg',
        bgImg: '/images/zones/abyss/shadowfen-bg.jpg',
        pos: { x: 20, y: 80 },
        travelTime: 180,
        description: 'The corrupted entrance to the Abyss. Darkness seeps from every crack.',
        spots: [
            { id: 'shadowfen_camp', name: 'Twilight Encampment', difficulty: 'normal', img: '/images/spots/abyss/camp.jpg',
                description: 'A dimly lit camp at the edge of darkness.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [
                    { name: 'Clear the Shadow Spawn', img: '/images/missions/abyss/shadow_spawn.jpg' },
                    { name: 'Gather Void Essence', img: '/images/missions/abyss/void_essence.jpg' },
                    { name: 'Close the Minor Rift', img: '/images/missions/abyss/rift.jpg' }
                ] },
            { id: 'shadowfen_temple', name: 'Sunken Temple', difficulty: 'hard', img: '/images/spots/abyss/temple.jpg',
                description: 'An ancient temple swallowed by darkness.', missionDuration: 600, payoutMultiplier: 1.5,
                missions: [
                    { name: 'Purge the Corrupted Priest', img: '/images/missions/abyss/priest.jpg' },
                    { name: 'Recover the Dark Relic', img: '/images/missions/abyss/relic.jpg' },
                    { name: 'Break the Seal', img: '/images/missions/abyss/seal.jpg' }
                ] },
            { id: 'shadowfen_rift', name: 'Abyssal Rift', difficulty: 'nightmare', img: '/images/spots/abyss/rift.jpg',
                description: 'A tear in reality where nightmares pour through.', missionDuration: 600, payoutMultiplier: 2.5,
                missions: [
                    { name: 'Slay the Void Lord', img: '/images/missions/abyss/void_lord.jpg' },
                    { name: 'Seal the Dimensional Rift', img: '/images/missions/abyss/seal_rift.jpg' },
                    { name: 'Face the Abyssal Horror', img: '/images/missions/abyss/horror.jpg' }
                ] }
        ],
        payoutBase: { normal: [1000, 1500], hard: [1200, 1750], nightmare: [1500, 2550] },
        rawMats: ['void_shard', 'shadow_essence', 'abyss_crystal'], 
        matDropChance: 0.7, 
        matDropCount: [2, 5]
    },
    crimson: {
        name: 'Crimson Wastes', emoji: '🌋', minLevel: 50,
        mapImg: '/images/zones/abyss/crimson.jpg',
        bgImg: '/images/zones/abyss/crimson-bg.jpg',
        pos: { x: 40, y: 75 },
        travelTime: 240,
        description: 'A desolate landscape of blood-red sands and eternal fire.',
        spots: [
            { id: 'crimson_outpost', name: 'Blood Outpost', difficulty: 'normal', img: '/images/spots/abyss/outpost.jpg',
                description: 'A fortified outpost against the crimson tide.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [
                    { name: 'Repel the Fire Demons', img: '/images/missions/abyss/demons.jpg' },
                    { name: 'Gather Crimson Crystals', img: '/images/missions/abyss/crystals.jpg' },
                    { name: 'Rescue the Survivors', img: '/images/missions/abyss/survivors.jpg' }
                ] },
            { id: 'crimson_forge', name: 'Eternal Forge', difficulty: 'hard', img: '/images/spots/abyss/forge.jpg',
                description: 'A forge that never stops burning.', missionDuration: 600, payoutMultiplier: 1.5,
                missions: [
                    { name: 'Defeat the Flame Keeper', img: '/images/missions/abyss/flame_keeper.jpg' },
                    { name: 'Retrieve the Infernal Core', img: '/images/missions/abyss/core.jpg' },
                    { name: 'Quench the Eternal Fire', img: '/images/missions/abyss/quench.jpg' }
                ] },
            { id: 'crimson_palace', name: 'Crimson Palace', difficulty: 'nightmare', img: '/images/spots/abyss/palace.jpg',
                description: 'The throne of the Crimson King.', missionDuration: 600, payoutMultiplier: 2.5,
                missions: [
                    { name: 'Slay the Crimson King', img: '/images/missions/abyss/crimson_king.jpg' },
                    { name: 'Shatter the Blood Throne', img: '/images/missions/abyss/throne.jpg' },
                    { name: 'Purge the Crimson Curse', img: '/images/missions/abyss/curse.jpg' }
                ] }
        ],
        payoutBase: { normal: [1000, 1600], hard: [1200, 1850], nightmare: [1500, 2650] },
        rawMats: ['crimson_crystal', 'fire_essence', 'infernal_core'], 
        matDropChance: 0.75, 
        matDropCount: [2, 5]
    },
    void: {
        name: 'Abyssal Void', emoji: '🕳️', minLevel: 60,
        mapImg: '/images/zones/abyss/void.jpg',
        bgImg: '/images/zones/abyss/void-bg.jpg',
        pos: { x: 55, y: 65 },
        travelTime: 300,
        description: 'The space between worlds. Reality bends here.',
        spots: [
            { id: 'void_edge', name: 'Void Edge', difficulty: 'normal', img: '/images/spots/abyss/void_edge.jpg',
                description: 'Where reality begins to fray.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [
                    { name: 'Stabilize the Rift', img: '/images/missions/abyss/stabilize.jpg' },
                    { name: 'Hunt Void Walkers', img: '/images/missions/abyss/walkers.jpg' },
                    { name: 'Collect Null Crystals', img: '/images/missions/abyss/null_crystals.jpg' }
                ] },
            { id: 'void_heart', name: 'Void Heart', difficulty: 'hard', img: '/images/spots/abyss/void_heart.jpg',
                description: 'The pulsating core of the Abyss.', missionDuration: 600, payoutMultiplier: 1.5,
                missions: [
                    { name: 'Destroy the Void Core', img: '/images/missions/abyss/core.jpg' },
                    { name: 'Defeat the Null Behemoth', img: '/images/missions/abyss/behemoth.jpg' },
                    { name: 'Absorb Void Energy', img: '/images/missions/abyss/energy.jpg' }
                ] },
            { id: 'void_throne', name: 'Empty Throne', difficulty: 'nightmare', img: '/images/spots/abyss/throne.jpg',
                description: 'The seat of the Void Lord.', missionDuration: 600, payoutMultiplier: 2.5,
                missions: [
                    { name: 'Challenge the Void Lord', img: '/images/missions/abyss/void_lord.jpg' },
                    { name: 'Seal the Abyss', img: '/images/missions/abyss/seal_abyss.jpg' },
                    { name: 'Claim the Void Crown', img: '/images/missions/abyss/crown.jpg' }
                ] }
        ],
        payoutBase: { normal: [1100, 1600], hard: [1200, 1950], nightmare: [1600, 2650] },
        rawMats: ['void_crystal', 'null_essence', 'abyss_fragment'], 
        matDropChance: 0.8, 
        matDropCount: [3, 6]
    },
    citadel: {
        name: 'Void Citadel', emoji: '🏰', minLevel: 70,
        mapImg: '/images/zones/abyss/citadel.jpg',
        bgImg: '/images/zones/abyss/citadel-bg.jpg',
        pos: { x: 70, y: 55 },
        travelTime: 360,
        description: 'A fortress built from nightmares.',
        spots: [
            { id: 'citadel_gates', name: 'Citadel Gates', difficulty: 'normal', img: '/images/spots/abyss/gates.jpg',
                description: 'The imposing entrance to the citadel.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [
                    { name: 'Breach the Gates', img: '/images/missions/abyss/breach.jpg' },
                    { name: 'Defeat the Gatekeepers', img: '/images/missions/abyss/gatekeepers.jpg' },
                    { name: 'Gather Shadowsteel', img: '/images/missions/abyss/shadowsteel.jpg' }
                ] },
            { id: 'citadel_halls', name: 'Haunted Halls', difficulty: 'hard', img: '/images/spots/abyss/halls.jpg',
                description: 'Corridors filled with trapped souls.', missionDuration: 600, payoutMultiplier: 1.5,
                missions: [
                    { name: 'Purify the Halls', img: '/images/missions/abyss/purify.jpg' },
                    { name: 'Defeat the Soul Weaver', img: '/images/missions/abyss/soul_weaver.jpg' },
                    { name: 'Free the Captive Souls', img: '/images/missions/abyss/souls.jpg' }
                ] },
            { id: 'citadel_peak', name: 'Obsidian Peak', difficulty: 'nightmare', img: '/images/spots/abyss/peak.jpg',
                description: 'The highest point of the citadel.', missionDuration: 600, payoutMultiplier: 2.5,
                missions: [
                    { name: 'Slay the Obsidian Dragon', img: '/images/missions/abyss/dragon.jpg' },
                    { name: 'Claim the Citadel', img: '/images/missions/abyss/claim.jpg' },
                    { name: 'Destroy the Dark Crystal', img: '/images/missions/abyss/crystal.jpg' }
                ] }
        ],
        payoutBase: { normal: [1150, 1650], hard: [1200, 2050], nightmare: [1450, 2850] },
        rawMats: ['shadowsteel', 'soul_essence', 'obsidian_shard'], 
        matDropChance: 0.85, 
        matDropCount: [3, 7]
    },
    eternal_dark: {
        name: 'The Eternal Dark', emoji: '🌌', minLevel: 80,
        mapImg: '/images/zones/abyss/eternal.jpg',
        bgImg: '/images/zones/abyss/eternal-bg.jpg',
        pos: { x: 85, y: 40 },
        travelTime: 420,
        description: 'The source of all darkness. Few return.',
        spots: [
            { id: 'dark_approach', name: 'Path of Shadows', difficulty: 'normal', img: '/images/spots/abyss/path.jpg',
                description: 'The final approach to true darkness.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [
                    { name: 'Navigate the Shadows', img: '/images/missions/abyss/navigate.jpg' },
                    { name: 'Defeat the Shadow Sentinels', img: '/images/missions/abyss/sentinels.jpg' },
                    { name: 'Gather Dark Essence', img: '/images/missions/abyss/dark_essence.jpg' }
                ] },
            { id: 'dark_throne', name: 'Throne of Night', difficulty: 'hard', img: '/images/spots/abyss/throne_night.jpg',
                description: 'The seat of the Shadow King.', missionDuration: 600, payoutMultiplier: 1.5,
                missions: [
                    { name: 'Confront the Shadow King', img: '/images/missions/abyss/shadow_king.jpg' },
                    { name: 'Break the Night Crown', img: '/images/missions/abyss/crown_night.jpg' },
                    { name: 'Restore the Light', img: '/images/missions/abyss/restore_light.jpg' }
                ] },
            { id: 'dark_heart', name: 'Heart of Darkness', difficulty: 'nightmare', img: '/images/spots/abyss/heart.jpg',
                description: 'The core of all evil.', missionDuration: 600, payoutMultiplier: 3.0,
                missions: [
                    { name: 'Face the Primordial Darkness', img: '/images/missions/abyss/primordial.jpg' },
                    { name: 'Seal the Eternal Dark', img: '/images/missions/abyss/seal_dark.jpg' },
                    { name: 'Ascend to True Power', img: '/images/missions/abyss/ascend.jpg' }
                ] }
        ],
        payoutBase: { normal: [1150, 1650], hard: [1200, 2050], nightmare: [1250, 3500] },
        rawMats: ['dark_essence', 'primordial_shard', 'eternal_core'], 
        matDropChance: 0.9, 
        matDropCount: [4, 8]
    }
};

const ABYSS_ROUTES = {
    shadowfen: { crimson: 180 },
    crimson: { shadowfen: 180, void: 240 },
    void: { crimson: 240, citadel: 300 },
    citadel: { void: 300, eternal_dark: 360 },
    eternal_dark: { citadel: 360 }
};

// Also need route from Dark City to Abyss entrance
const ABYSS_ENTRY = {
    dark_city: { shadowfen: 120 }  // Travel from Dark City to Shadowfen Depths
};

// ── Raw materials (your originals) ────────────────────────────────────────
const RAW_MATERIALS = {
    iron_ore:           { name:'Iron Ore',           emoji:'🪨', rarity:'common'    },
    wood:               { name:'Wood',               emoji:'🪵', rarity:'common'    },
    wolf_pelt:          { name:'Wolf Pelt',          emoji:'🐺', rarity:'common'    },
    herbs:              { name:'Herbs',              emoji:'🌿', rarity:'common'    },
    poison_gland:       { name:'Poison Gland',       emoji:'🧪', rarity:'uncommon'  },
    swamp_crystal:      { name:'Swamp Crystal',      emoji:'💎', rarity:'uncommon'  },
    mountain_stone:     { name:'Mountain Stone',     emoji:'⛏️', rarity:'uncommon'  },
    mithril_ore:        { name:'Mithril Ore',        emoji:'✨', rarity:'rare'      },
    frost_essence:      { name:'Frost Essence',      emoji:'❄️', rarity:'rare'      },
    dragon_scale_shard: { name:'Dragon Scale Shard', emoji:'🐉', rarity:'rare'      },
    arcane_dust:        { name:'Arcane Dust',        emoji:'🌟', rarity:'rare'      },
    void_shard:         { name:'Void Shard',         emoji:'🔮', rarity:'epic'      },
    ancient_relic:      { name:'Ancient Relic',      emoji:'🏺', rarity:'epic'      },
    rune_fragment:      { name:'Rune Fragment',      emoji:'📜', rarity:'epic'      },
    demon_core:         { name:'Demon Core',         emoji:'💀', rarity:'legendary' },
    shadow_essence:     { name:'Shadow Essence',     emoji:'👁️', rarity:'legendary' },
    legendary_fragment: { name:'Legendary Fragment', emoji:'⭐', rarity:'legendary' },
    abyss_crystal:      { name:'Abyss Crystal',      emoji:'💎', rarity:'epic'      },
    crimson_crystal:    { name:'Crimson Crystal',    emoji:'🔴', rarity:'epic'      },
    fire_essence:       { name:'Fire Essence',       emoji:'🔥', rarity:'rare'      },
    infernal_core:      { name:'Infernal Core',      emoji:'💀', rarity:'legendary' },
    null_essence:       { name:'Null Essence',       emoji:'🌑', rarity:'epic'      },
    abyss_fragment:     { name:'Abyss Fragment',     emoji:'🧩', rarity:'epic'      },
    shadowsteel:        { name:'Shadowsteel',        emoji:'⚙️', rarity:'rare'      },
    soul_essence:       { name:'Soul Essence',       emoji:'👻', rarity:'epic'      },
    obsidian_shard:     { name:'Obsidian Shard',     emoji:'🪨', rarity:'rare'      },
    dark_essence:       { name:'Dark Essence',       emoji:'🌑', rarity:'epic'      },
    primordial_shard:   { name:'Primordial Shard',   emoji:'✨', rarity:'legendary' },
    eternal_core:       { name:'Eternal Core',       emoji:'💠', rarity:'legendary' },
};

// ── Components (your originals) ───────────────────────────────────────────
const COMPONENTS = {
    iron_ingot:     { name:'Iron Ingot',     emoji:'🔩', recipe:{ iron_ore:3 },                              goldCost:20,   rarity:'common'    },
    hardwood_plank: { name:'Hardwood Plank', emoji:'🪚', recipe:{ wood:3 },                                  goldCost:15,   rarity:'common'    },
    mithril_ingot:  { name:'Mithril Ingot',  emoji:'⚙️', recipe:{ mithril_ore:3 },                          goldCost:80,   rarity:'rare'      },
    tanned_hide:    { name:'Tanned Hide',    emoji:'🧶', recipe:{ wolf_pelt:2, herbs:1 },                    goldCost:25,   rarity:'uncommon'  },
    poison_extract: { name:'Poison Extract', emoji:'⚗️', recipe:{ poison_gland:2 },                         goldCost:40,   rarity:'uncommon'  },
    arcane_shard:   { name:'Arcane Shard',   emoji:'💠', recipe:{ swamp_crystal:2, arcane_dust:1 },          goldCost:120,  rarity:'rare'      },
    frost_core:     { name:'Frost Core',     emoji:'🧊', recipe:{ frost_essence:2 },                        goldCost:150,  rarity:'rare'      },
    dragon_plate:   { name:'Dragon Plate',   emoji:'🛡️', recipe:{ dragon_scale_shard:3, mithril_ore:2 },    goldCost:300,  rarity:'epic'      },
    void_crystal:   { name:'Void Crystal',   emoji:'🔮', recipe:{ void_shard:2, rune_fragment:1 },           goldCost:500,  rarity:'epic'      },
    shadow_weave:   { name:'Shadow Weave',   emoji:'🕸️', recipe:{ shadow_essence:2, arcane_dust:2 },         goldCost:800,  rarity:'epic'      },
    demon_alloy:    { name:'Demon Alloy',    emoji:'⚡', recipe:{ demon_core:1, mithril_ore:3 },             goldCost:1200, rarity:'legendary' },
    abyss_weave:    { name:'Abyss Weave',    emoji:'🕸️', recipe:{ abyss_crystal:2, shadow_essence:1 },        goldCost:1000, rarity:'epic'      },
    void_plate:     { name:'Void Plate',     emoji:'🛡️', recipe:{ null_essence:2, abyss_fragment:1 },         goldCost:1100, rarity:'epic'      },
    crimson_alloy:  { name:'Crimson Alloy',  emoji:'⚡', recipe:{ crimson_crystal:2, infernal_core:1 },        goldCost:1200, rarity:'legendary' },
    shadowsteel_bar:{ name:'Shadowsteel Bar',emoji:'⚙️', recipe:{ shadowsteel:3, soul_essence:1 },            goldCost:900,  rarity:'rare'      },
    eternal_essence:{ name:'Eternal Essence',emoji:'💠', recipe:{ dark_essence:2, primordial_shard:1, eternal_core:1 }, goldCost:1500, rarity:'legendary' },
};

// ── Rarity colours ────────────────────────────────────────────────────────
const TIER_COLORS = {
    small:'#7a7590', normal:'#3498db', good:'#9b59b6', epic:'#e67e22',
    common:'#aaa', uncommon:'#2ecc71', rare:'#3498db', legendary:'#f1c40f',
};
const TIER_LABELS = {
    small:'Small', normal:'Normal', good:'Good', epic:'⚡ Epic',
    common:'Common', uncommon:'Uncommon', rare:'Rare', legendary:'Legendary',
};

// ── Crafting Sets ─────────────────────────────────────────────────────────
// 3 sets × 5 pieces. All components use the original names above.
const EQUIPMENT_RECIPES = [

    // ══════════════════════════════════════════════
    //  SET 1 — IRONCLAD  (No zone requirement)
    //  Tank — max physical defence, armor, HP
    // ══════════════════════════════════════════════
    {
        id:'ironclad_weapon', setId:'ironclad', setPiece:'weapon',
        name:'Ironclad Warhammer', emoji:'🔨', quality:'epic',
        slot:'weapon',
        desc:'A heavy warhammer that shatters shields and bones alike.',
        stats:{ dmg_min:12, dmg_max:28, strength:6, armor:3, defense:27, crit_chance:8 },
        components:{ iron_ingot:4, tanned_hide:2 }, goldCost:800,
    },
    {
        id:'ironclad_armor', setId:'ironclad', setPiece:'armor',
        name:'Ironclad Plate', emoji:'🛡️', quality:'epic',
        slot:'armor',
        desc:'Heavy iron plate armour, nearly impenetrable by physical blows.',
        stats:{ defense:38, armor:14, hp_max:60, vitality:3,  hit_chance:-2, crit_chance:3},
        components:{ iron_ingot:5, tanned_hide:2 }, goldCost:1000,
    },
    {
        id:'ironclad_helmet', setId:'ironclad', setPiece:'helmet',
        name:'Ironclad Greathelm', emoji:'⛑️', quality:'epic',
        slot:'helmet',
        desc:'Full-face iron helm with reinforced cheekguards.',
        stats:{ defense:28, armor:8, hp_max:30, hit_chance:4, crit_chance:6 },
        components:{ iron_ingot:3, tanned_hide:2 }, goldCost:700,
    },
    {
        id:'ironclad_shield', setId:'ironclad', setPiece:'shield',
        name:'Ironclad Tower Shield', emoji:'🔰', quality:'epic',
        slot:'shield',
        desc:'A massive iron tower shield — almost nothing gets through.',
        stats:{ defense:36, armor:15, hp_max:40, hit_chance:-4, crit_chance:3},
        components:{ iron_ingot:6, hardwood_plank:2 }, goldCost:900,
    },
    {
        id:'ironclad_boots', setId:'ironclad', setPiece:'boots',
        name:'Ironclad Sabatons', emoji:'👢', quality:'epic',
        slot:'boots',
        desc:'Heavy iron boots that anchor you in place during battle.',
        stats:{ defense:32, armor:13, agility:-2, hp_max:20, hit_chance:-2, crit_chance:6 },
        components:{ iron_ingot:2, tanned_hide:3 }, goldCost:600,
    },

    // ══════════════════════════════════════════════
    //  SET 2 — SENTINEL  (No zone requirement)
    //  Balanced — hit/crit chance, elemental resist
    // ══════════════════════════════════════════════
    {
        id:'sentinel_weapon', setId:'sentinel', setPiece:'weapon',
        name:'Sentinel Spear', emoji:'⚔️', quality:'epic',
        slot:'weapon',
        desc:'A razor-sharp mithril spear etched with sentinel runes.',
        stats:{ dmg_min:16, dmg_max:30, strength:8, hit_chance:8, crit_chance:5, wind_dmg:6, wind_resist:10 },
        components:{ mithril_ingot:4, frost_core:1 }, goldCost:4000,
    },
    {
        id:'sentinel_armor', setId:'sentinel', setPiece:'armor',
        name:'Sentinel Chainmail', emoji:'🧥', quality:'epic',
        slot:'armor',
        desc:'Mithril chain links woven tight — flexible yet impenetrable.',
        stats:{ defense:20, armor:12, hp_max:90, vitality:5, water_resist:14 },
        components:{ mithril_ingot:4, dragon_plate:1 }, goldCost:5000,
    },
    {
        id:'sentinel_helmet', setId:'sentinel', setPiece:'helmet',
        name:'Sentinel Visor', emoji:'🪖', quality:'epic',
        slot:'helmet',
        desc:'A sleek mithril helm with a full visor. Clarity in combat.',
        stats:{ defense:12, armor:7, hp_max:50, hit_chance:10, crit_chance:6 },
        components:{ mithril_ingot:3, arcane_shard:1 }, goldCost:3500,
    },
    {
        id:'sentinel_shield', setId:'sentinel', setPiece:'shield',
        name:'Sentinel Aegis', emoji:'🛡️', quality:'epic',
        slot:'shield',
        desc:'Mithril shield engraved with sentinel ward runes.',
        stats:{ defense:22, armor:14, hp_max:60, wind_resist:18, water_resist:12 },
        components:{ mithril_ingot:5, dragon_plate:1 }, goldCost:5500,
    },
    {
        id:'sentinel_boots', setId:'sentinel', setPiece:'boots',
        name:'Sentinel Greaves', emoji:'🥾', quality:'epic',
        slot:'boots',
        desc:'Light mithril greaves that boost footwork without slowing you.',
        stats:{ defense:10, armor:6, agility:10, hit_chance:6, crit_chance:4 },
        components:{ mithril_ingot:2, frost_core:1, tanned_hide:1 }, goldCost:3000,
    },

    // ══════════════════════════════════════════════
    //  SET 3 — VOIDBORN  (No zone requirement)
    //  Magic attacker — elemental devastation + all-resist
    // ══════════════════════════════════════════════
    {
        id:'voidborn_weapon', setId:'voidborn', setPiece:'weapon',
        name:'Voidborn Scythe', emoji:'🪄', quality:'legendary',
        slot:'weapon',
        desc:'A scythe wreathed in void energy, harvesting souls with each swing.',
        stats:{ dmg_min:18, dmg_max:36, magic:14, crit_chance:12, hit_chance:8, agility:3,
                pyro_dmg:8, water_dmg:8, wind_dmg:8, electro_dmg:8,
                pyro_resist:15, water_resist:15, wind_resist:15, electro_resist:15 },
        components:{ void_crystal:3, shadow_weave:2, demon_alloy:1 }, goldCost:18000,
    },
    {
        id:'voidborn_armor', setId:'voidborn', setPiece:'armor',
        name:'Voidborn Robes', emoji:'🌑', quality:'legendary',
        slot:'armor',
        desc:'Robes threaded with void crystal fibers. Reality warps around the wearer.',
        stats:{ defense:28, armor:16, hp_max:40, magic:12, vitality:8,
                pyro_dmg:10, pyro_resist:12 },
        components:{ void_crystal:2, shadow_weave:4, arcane_shard:2 }, goldCost:22000,
    },
    {
        id:'voidborn_helmet', setId:'voidborn', setPiece:'helmet',
        name:'Voidborn Crown', emoji:'👑', quality:'legendary',
        slot:'helmet',
        desc:'A crown forged from void alloy. The wearer sees through all illusions.',
        stats:{ defense:18, armor:10, hp_max:20, magic:10, crit_chance:14, hit_chance:10,
                electro_dmg:10, electro_resist:12 },
        components:{ void_crystal:2, shadow_weave:2, arcane_shard:2 }, goldCost:16000,
    },
    {
        id:'voidborn_shield', setId:'voidborn', setPiece:'shield',
        name:'Voidborn Bulwark', emoji:'🟣', quality:'legendary',
        slot:'shield',
        desc:'A pulsing void shield that absorbs energy attacks entirely.',
        stats:{ defense:32, armor:20, hp_max:30, magic:8,
                water_dmg:10, water_resist:12 },
        components:{ void_crystal:4, demon_alloy:2 }, goldCost:24000,
    },
    {
        id:'voidborn_boots', setId:'voidborn', setPiece:'boots',
        name:'Voidborn Striders', emoji:'🟤', quality:'legendary',
        slot:'boots',
        desc:'Boots that phase partially into the void, allowing impossible movement.',
        stats:{ defense:16, armor:9, agility:7, crit_chance:10, hit_chance:8,
                wind_dmg:10, wind_resist:12 },
        components:{ void_crystal:2, shadow_weave:2, frost_core:1 }, goldCost:14000,
    },

    // ══════════════════════════════════════════════
    //  SET 4 — SPITEFORGED  (Banner Set)
    //  Physical attacker — strength/crit + all-resist (no elemental damage)
    // ══════════════════════════════════════════════
    {
        id:'spiteforged_weapon', setId:'spiteforged', setPiece:'weapon',
        name:'Spiteforged Trident', emoji:'🔱', quality:'legendary',
        slot:'weapon',
        desc:'Three bladed vows of hatred, quenched in black surf and driven to pierce pride, plate, and prayer alike.',
        stats:{ dmg_min:24, dmg_max:49, strength:14, crit_chance:12, hit_chance:8, agility:3,
                pyro_resist:10, water_resist:10, wind_resist:10, electro_resist:10 },
        components:{ void_crystal:3, demon_alloy:2, tanned_hide:2 }, goldCost:18000,
    },
    {
        id:'spiteforged_armor', setId:'spiteforged', setPiece:'armor',
        name:'Carapace of Last Refrains', emoji:'🐢', quality:'legendary',
        slot:'armor',
        desc:'A war-shell plated with the echoes of final curses, hardening every grudge into stubborn, iron resolve.',
stats:{ dmg_min:1, dmg_max:4, defense:30, armor:18, hp_max:140, strength:10, vitality:6,
                 electro_resist:10 },
        components:{ void_crystal:2, demon_alloy:4, tanned_hide:2 }, goldCost:22000,
    },
    {
        id:'spiteforged_helmet', setId:'spiteforged', setPiece:'helmet',
        name:'Crown of Scornful Gaze', emoji:'👁️', quality:'legendary',
        slot:'helmet',
        desc:'Its sleepless eye judges every challenger first, weighing them only for the manner of their humiliation.',
stats:{ dmg_min:3, dmg_max:3, defense:20, armor:10, hp_max:90, crit_chance:15, hit_chance:10,
                 wind_resist:10},
        components:{ void_crystal:2, demon_alloy:2, frost_core:1 }, goldCost:16000,
    },
    {
        id:'spiteforged_shield', setId:'spiteforged', setPiece:'shield',
        name:'Bulwark of Denied Mercy', emoji:'🛡️', quality:'legendary',
        slot:'shield',
        desc:'A spitebound wall raised by warriors who survived by refusing mercy, surrender, and clean endings.',
stats:{ dmg_min:1, dmg_max:2, defense:34, armor:22, hp_max:110, strength:8,
                 pyro_resist:10, },
        components:{ void_crystal:4, demon_alloy:3, hardwood_plank:2 }, goldCost:24000,
    },
    {
        id:'spiteforged_boots', setId:'spiteforged', setPiece:'boots',
        name:'Treads of the Unforgiving', emoji:'👢', quality:'legendary',
        slot:'boots',
        desc:'Each step lands like a sentence passed, hounding the fleeing until regret is the only ground left beneath them.',
stats:{ dmg_min:1, dmg_max:1.5, defense:18, armor:10, agility:7, crit_chance:12, hit_chance:8,
                 water_resist:10 },
        components:{ void_crystal:2, demon_alloy:2, tanned_hide:3 }, goldCost:14000,
    },

    // ══════════════════════════════════════════════
    //  SET 5 — SHADEWALKER  (Rogue set)
    //  Shadow assassin — agility/crit + all-resist (no elemental damage, low armor)
    // ══════════════════════════════════════════════
    {
        id:'shadewalker_weapon', setId:'shadewalker', setPiece:'weapon',
        name:"Shadewalker's Kiss", emoji:'🗡️', quality:'legendary',
        slot:'weapon',
        desc:'A dagger that drinks the light from the air before it drinks blood. No blade is keener, no strike more silent.',
        stats:{ dmg_min:13, dmg_max:27, agility:12, crit_chance:10, hit_chance:8,
                pyro_resist:10, water_resist:10, wind_resist:10, electro_resist:10 },
        components:{ shadow_weave:3, void_crystal:2, tanned_hide:1 }, goldCost:18000,
    },
    {
        id:'shadewalker_armor', setId:'shadewalker', setPiece:'armor',
        name:"Shadewalker's Gambeson", emoji:'🖤', quality:'legendary',
        slot:'armor',
        desc:'Light quilted armor that moves like water and hides like shadow. No leather creaks, no buckle shines — only the kill reveals you were there.',
        stats:{ defense:14, armor:6, hp_max:70, agility:6, hit_chance:12,
                water_resist:10 },
        components:{ shadow_weave:2, tanned_hide:3, void_crystal:1 }, goldCost:15000,
    },
    {
        id:'shadewalker_helmet', setId:'shadewalker', setPiece:'helmet',
        name:"Shadewalker's Shroud", emoji:'🌫️', quality:'legendary',
        slot:'helmet',
        desc:'Woven from midnight silk and the last breath of a dying star. Those who wear it fade into the dark long before they strike.',
        stats:{ dmg_min:1, dmg_max:2, defense:22, armor:8, hp_max:100, agility:8, crit_chance:8,
                wind_resist:10, },
        components:{ shadow_weave:4, void_crystal:2, frost_core:1 }, goldCost:20000,
    },
    {
        id:'shadewalker_shield', setId:'shadewalker', setPiece:'shield', craftClass:'rogue',
        name:"Shadewalker's Echo", emoji:'🔪', quality:'legendary',
        slot:'shield', rogueOffhand:true,
        desc:'Twin to the Kiss, this blade waits in silence for the perfect opening. Rogues wield it in their off-hand as naturally as breathing. Non-rogues cannot grasp its balance.',
        stats:{ dmg_min:7, dmg_max:15, agility:10, crit_chance:5, hit_chance:4,
                electro_resist:10 },
        components:{ shadow_weave:2, void_crystal:2, demon_alloy:1 }, goldCost:16000,
    },
    {
        id:'shadewalker_boots', setId:'shadewalker', setPiece:'boots',
        name:"Shadewalker's Grace", emoji:'👟', quality:'legendary',
        slot:'boots',
        desc:'Soles that never scuff, never squeak, never leave a trail. Every step is a whisper, every landing is silence.',
        stats:{ defense:12, armor:5, agility:12, hit_chance:6, crit_chance:6, pyro_resist:10 },
        components:{ shadow_weave:2, tanned_hide:2, frost_core:1 }, goldCost:13000,
    },
    // ══════════════════════════════════════════════
    //  SET 6 — ABYSSAL KNIGHT  (Abyss-only mats)
    //  Hybrid — all-round stats
    // ══════════════════════════════════════════════
    {
        id:'abyssal_weapon', setId:'abyssal', setPiece:'weapon',
        name:"Abyssal Blade", emoji:'⚔️', quality:'legendary',
        slot:'weapon',
        desc:'A blade forged in the void between worlds, hungry for essence.',
        stats:{ dmg_min:51, dmg_max:37, strength:15, agility:7, hit_chance:28, crit_chance:20,
                pyro_dmg:7, electro_dmg:7 },
        components:{ abyss_weave:3, void_plate:2, crimson_alloy:1 }, goldCost:18000,
    },
    {
        id:'abyssal_armor', setId:'abyssal', setPiece:'armor',
        name:"Abyssal Carapace", emoji:'🛡️', quality:'legendary',
        slot:'armor',
        desc:'Living armor woven from crystallized abyss energy.',
        stats:{ defense:45, armor:18, hp_max:80, vitality:5, strength:8,
                pyro_resist:15, water_resist:15, crit_chance:12 },
        components:{ void_plate:3, shadowsteel_bar:2, eternal_essence:1 }, goldCost:20000,
    },
    {
        id:'abyssal_helmet', setId:'abyssal', setPiece:'helmet',
        name:"Abyssal Crown", emoji:'👑', quality:'legendary',
        slot:'helmet',
        desc:'A crown that whispers secrets from the deep dark.',
        stats:{ defense:20, armor:6, dmg_min:5, magic:35, hit_chance:10, crit_chance:8,
                wind_resist:10, electro_resist:15 },
        components:{ shadowsteel_bar:2, eternal_essence:2, abyss_weave:1 }, goldCost:18000,
    },
    {
        id:'abyssal_shield', setId:'abyssal', setPiece:'shield',
        name:"Abyssal Bulwark", emoji:'🔰', quality:'legendary',
        slot:'shield',
        desc:'A barrier that drinks the light and returns only silence.',
        stats:{ defense:30, armor:33, hp_max:5, strength:6, vitality:4,
                water_resist:15, wind_resist:20, crit_chance:5, dmg_min:3 },
        components:{ void_plate:3, abyss_weave:2, crimson_alloy:1 }, goldCost:19000,
    },
    {
        id:'abyssal_boots', setId:'abyssal', setPiece:'boots',
        name:"Abyssal Greaves", emoji:'👟', quality:'legendary',
        slot:'boots',
        desc:'Step between shadows — these greaves know no distance.',
        stats:{ defense:15, armor:5, agility:14, hit_chance:8, crit_chance:15,
                pyro_resist:10, electro_resist:10, dmg_min:2 },
        components:{ shadowsteel_bar:2, abyss_weave:2, eternal_essence:1 }, goldCost:16000,
    },
];

// ── Set bonus definitions ─────────────────────────────────────────────────
const CRAFTING_SETS = {
    ironclad: {
        name:'Ironclad Set', emoji:'⚙️',
        bonus3:{ defense:10, armor:5,  hp_max:50,  desc:'2/5: +10 DEF · +5 Armor · +50 HP' },
        bonus5:{ defense:20, armor:12, hp_max:100, vitality:5, desc:'5/5: +20 DEF · +12 Armor · +100 HP · +5 VIT' },
    },
    sentinel: {
        name:'Sentinel Set', emoji:'🔷',
        bonus3:{ hit_chance:8,  crit_chance:5,  defense:8,  desc:'2/5: +8 Hit · +5 Crit · +8 DEF' },
        bonus5:{ hit_chance:16, crit_chance:12, agility:10, defense:15, desc:'5/5: +16 Hit · +12 Crit · +10 AGI · +15 DEF' },
    },
    voidborn: {
        name:'Voidborn Set', emoji:'🌑',
        bonus3:{ magic:12, crit_chance:8,  desc:'2/5: +12 MAG · +8 Crit' },
        bonus5:{
            magic:25, crit_chance:18, hit_chance:12,
            pyro_resist:20, water_resist:20, wind_resist:20, electro_resist:20,
            desc:'5/5: +25 MAG · +18 Crit · +12 Hit · +20 all Elem Resist'
        },
    },
    spiteforged: {
        name:'Spiteforged Set', emoji:'🔱',
        bonus3:{ strength:12, crit_chance:10, hit_chance:6,
            pyro_resist:10, water_resist:10, wind_resist:10, electro_resist:10,
            desc:'2/5: +12 STR · +10 Crit · +6 Hit · +10 all Elem Resist' },
        bonus5:{
            strength:25, crit_chance:20, hit_chance:15,
            pyro_resist:20, water_resist:20, wind_resist:20, electro_resist:20,
            desc:'5/5: +25 STR · +20 Crit · +15 Hit · +20 all Elem Resist'
        },
    },
    shadewalker: {
        name:'Shadewalker Set', emoji:'🗡️',
        bonus3:{ agility:15, crit_chance:10, hit_chance:8,
            pyro_resist:10, water_resist:10, wind_resist:10, electro_resist:10,
            desc:'2/5: +15 AGI · +10 Crit · +8 Hit · +10 all Elem Resist' },
        bonus5:{
            agility:30, crit_chance:18, hit_chance:15,
            pyro_resist:20, water_resist:20, wind_resist:20, electro_resist:20,
            desc:'5/5: +30 AGI · +18 Crit · +15 Hit · +20 all Elem Resist'
        },
    },
    abyssal: {
        name:'Abyssal Knight Set', emoji:'⚔️',
        bonus3:{ strength:10, agility:10, defense:15, hp_max:80,
            desc:'2/5: +10 STR · +10 AGI · +15 DEF · +80 HP' },
        bonus5:{
            strength:22, agility:20, defense:30, hp_max:160, armor:10,
            pyro_resist:15, water_resist:15, wind_resist:15, electro_resist:15,
            desc:'5/5: +22 STR · +20 AGI · +30 DEF · +160 HP · +10 Armor · +15 all Elem Resist'
        },
    },
};

const LOOT_BOXES = [
    {
        id: 'lootbox_common',
        name: 'Common Loot Box',
        emoji: '📦',
        desc: 'Contains 5 items: materials, common gear, or gold. 1% chance for a gem!',
        price: 5000,
        priceType: 'gold',
        rarity: 'common',
        consumable: true,
        category: 'lootbox',
        lootType: 'common'
    },
    {
        id: 'lootbox_novice',
        name: 'Novice Loot Box',
        emoji: '📦✨',
        desc: 'Better loot! Contains 5 items: uncommon materials, occasional rare gear. 3% chance for a gem!',
        price: 20000,
        priceType: 'gold',
        rarity: 'uncommon',
        consumable: true,
        category: 'lootbox',
        lootType: 'novice'
    },
    {
        id: 'lootbox_rare',
        name: 'Rare Loot Box',
        emoji: '🎁✨',
        desc: 'Premium loot! Contains 5 items: rare materials, good chance for rare/epic gear. 5% chance for a gem!',
        price: 50000,
        priceType: 'gold',
        rarity: 'rare',
        consumable: true,
        category: 'lootbox',
        lootType: 'rare'
    },
    {
        id: 'lootbox_epic',
        name: 'Epic Loot Box',
        emoji: '💎✨',
        desc: 'Epic loot! Contains 5 items: epic materials, high chance for epic/legendary gear. 10% chance for a gem!',
        price: 5,
        priceType: 'gems',
        rarity: 'epic',
        consumable: true,
        category: 'lootbox',
        lootType: 'epic'
    },
    {
        id: 'lootbox_legendary',
        name: 'Legendary Loot Box',
        emoji: '👑✨',
        desc: 'Guaranteed legendary item! Plus 4 additional epic/legendary items. 25% chance for a gem!',
        price: 100,
        priceType: 'gems',
        rarity: 'legendary',
        consumable: true,
        category: 'lootbox',
        lootType: 'legendary'
    }
];

// ── Mission generation ────────────────────────────────────────────────────
function randBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick(entries) {
    const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight || 0), 0);
    if (totalWeight <= 0) return entries[0]?.id || null;
    let roll = Math.random() * totalWeight;
    for (const entry of entries) {
        roll -= Math.max(0, entry.weight || 0);
        if (roll <= 0) return entry.id;
    }
    return entries[entries.length - 1]?.id || null;
}

function buildZoneLocalMaterialPool(zone) {
    return (zone.rawMats || []).map(id => {
        const rarity = RAW_MATERIALS[id]?.rarity || 'common';
        const rarityWeight = {
            common: 14,
            uncommon: 10,
            rare: 6,
            epic: 3,
            legendary: 1
        }[rarity] || 1;
        return { id, weight: rarityWeight };
    });
}

function buildBonusMaterialPool(zone) {
    const localSet = new Set(zone.rawMats || []);
    return Object.entries(RAW_MATERIALS)
        .filter(([id, def]) => !localSet.has(id) && def.rarity !== 'common')
        .map(([id, def]) => ({
            id,
            weight: {
                uncommon: 8,
                rare: 6,
                epic: 3,
                legendary: 1
            }[def.rarity] || 1
        }));
}

function rollMissionMaterial(zone, difficulty, slotIndex, totalCount) {
    const localPool = buildZoneLocalMaterialPool(zone);
    if (!localPool.length) return null;

    const bonusEligible = difficulty === 'hard' && slotIndex === totalCount - 1;
    if (!bonusEligible) return weightedPick(localPool);

    const bonusPool = buildBonusMaterialPool(zone);
    const bonusChance = 0.22;
    if (bonusPool.length && Math.random() < bonusChance) {
        return weightedPick(bonusPool);
    }
    return weightedPick(localPool);
}

function generateMission(zoneId, spotId, charLevel) {
    const zone = ZONES[zoneId];
    const spot = zone?.spots.find(s => s.id === spotId);
    if (!spot) return null;
    const difficulty = spot.difficulty;
    const [gMin, gMax] = zone.payoutBase[difficulty];
    const [xMin, xMax] = zone.xpBase[difficulty];
    const levelMult = 1 + ((charLevel || 1) - zone.minLevel) * 0.03;
    const gold = Math.floor(randBetween(gMin, gMax) * levelMult * spot.payoutMultiplier);
    const xp   = Math.floor(randBetween(xMin, xMax) * levelMult * spot.payoutMultiplier);
    const drops = [];
    if (Math.random() < zone.matDropChance) {
        const count = randBetween(zone.matDropCount[0], zone.matDropCount[1]);
        for (let i = 0; i < count; i++) {
            const mat = rollMissionMaterial(zone, difficulty, i, count);
            if (!mat) continue;
            const existing = drops.find(d => d.mat === mat);
            if (existing) existing.qty++;
            else drops.push({ mat, qty:1 });
        }
    }
    const missionList = spot.missions.map(m => typeof m === 'string' ? m : m.name);
    const missionName = missionList[Math.floor(Math.random() * missionList.length)];
    const now = Math.floor(Date.now() / 1000);
    return {
        zone:zoneId, spot:spotId, spotName:spot.name, difficulty, missionName,
        gold, xp, drops, duration:spot.missionDuration, endsAt:now + spot.missionDuration,
    };
}

module.exports = {
    ZONES, ABYSS_ZONES, ABYSS_ROUTES, ABYSS_ENTRY, RAW_MATERIALS, COMPONENTS, EQUIPMENT_RECIPES, CRAFTING_SETS,
    generateMission, TIER_COLORS, TIER_LABELS, randBetween, LOOT_BOXES
};
