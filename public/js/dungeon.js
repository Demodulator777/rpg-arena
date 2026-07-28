// ============================================================
//  dungeon.js  –  Battle Arena Dungeon System
//  Requires: global `state` object,
//  `api(method, path, body)` from app.js, `showTab(tab)` helper
// ============================================================

(function (global) {
  'use strict';

  // ── API Wrapper (uses your existing api function) ──────────────────────────
  const apiFetch = global.api || (async () => {
    console.error('[Dungeon] api not available!');
    return { success: false, error: 'api not available' };
  });

  // ── Constants ──────────────────────────────────────────────
  const MP_PER_TOKEN      = 20;
  const TOKENS_PER_RUN    = 50;
  const MONSTER_RESPAWN_H = 48;
  const TRAVEL_BASE_MS    = 200;
  const TRAVEL_DISCOVERED_MS = 200;
  const RUN_ESCAPE_CHANCE = 0.75;
  const STEAL_CHANCE      = 0.18;
  const ROOMS_PER_FLOOR   = 100;
  const DIR_IMGS = { up: 'uparrow.png', down: 'downarrow.png', left: 'leftarrow.png', right: 'rightarrow.png' };

  // ── Dungeon Visuals ─────────────────────────────────────────
  const DUNGEON_VISUALS = {
    start: {
      image: '/images/dungeon/entrance.jpg',
      description: "You stand at the entrance of a dark, foreboding tower. Ancient runes pulse with faint light on the weathered stones."
    },
    corridor: {
      image: '/images/dungeon/corridor.jpg',
      description: "A narrow passage stretches before you. Torches flicker on the walls, casting dancing shadows."
    },
    area: {
      image: '/images/dungeon/stairs.jpg',
      description: "An open chamber where multiple paths converge. Stone arches lead in several directions."
    },
    treasure: {
      image: '/images/dungeon/treasure.jpg',
      description: "A glint of gold catches your eye! An ornate chest sits in the center of this chamber."
    },
    miniboss: {
      image: '/images/dungeon/boss-chamber.jpg',
      description: "A powerful guardian blocks this passage. Defeat it to proceed."
    },
    boss: {
      image: '/images/dungeon/boss-chamber.jpg',
      description: "The air grows heavy. Grand pillars rise to the ceiling. This is the throne room of the floor's master."
    }
  };

  // ── Adventurer's Guild ─────────────────────────────────────────
const GUILD_EXCHANGES = [
  { id: 'exchange_gold', name: 'Exchange Dungeon Gold', icon: '💰',
    cost: { dungeonGold: 100 }, reward: { gold: 80, reputation: 1 },
    desc: 'Convert 100 dungeon gold into 80 real gold + 1 reputation point', minRep: 0 },
  { id: 'buy_elem_common', name: 'Buy Common Element', icon: '🔥',
    cost: { dungeonGold: 40 }, reward: { elemTier: 'common' },
    desc: 'Purchase 1 random common elemental material (3 XP)', minRep: 0 },
  { id: 'buy_elem_uncommon', name: 'Buy Uncommon Element', icon: '💧',
    cost: { dungeonGold: 100 }, reward: { elemTier: 'uncommon' },
    desc: 'Purchase 1 random uncommon elemental material (8 XP)', minRep: 10 },
  { id: 'buy_elem_rare', name: 'Buy Rare Element', icon: '⚡',
    cost: { dungeonGold: 180 }, reward: { elemTier: 'rare' },
    desc: 'Purchase 1 random rare elemental material (15 XP)', minRep: 50 },
  { id: 'buy_elem_epic', name: 'Buy Epic Element', icon: '🌪️',
    cost: { dungeonGold: 300 }, reward: { elemTier: 'epic' },
    desc: 'Purchase 1 random epic elemental material (25 XP)', minRep: 200 },
  { id: 'buy_elem_legendary', name: 'Buy Legendary Element', icon: '👑',
    cost: { dungeonGold: 500 }, reward: { elemTier: 'legendary' },
    desc: 'Purchase 1 random legendary elemental material (45 XP)', minRep: 500 },
  { id: 'swap_elem_common', name: 'Swap Common Elements', icon: '🔄',
    cost: { tier_common: 2 }, reward: { elemTier: 'common' },
    desc: 'Trade 2 common elemental materials for 1 random common', minRep: 0 },
  { id: 'swap_elem_uncommon', name: 'Swap Uncommon Elements', icon: '🔄',
    cost: { tier_uncommon: 2 }, reward: { elemTier: 'uncommon' },
    desc: 'Trade 2 uncommon elemental materials for 1 random uncommon', minRep: 10 },
  { id: 'swap_elem_rare', name: 'Swap Rare Elements', icon: '🔄',
    cost: { tier_rare: 2 }, reward: { elemTier: 'rare' },
    desc: 'Trade 2 rare elemental materials for 1 random rare', minRep: 50 },
  { id: 'swap_elem_epic', name: 'Swap Epic Elements', icon: '🔄',
    cost: { tier_epic: 2 }, reward: { elemTier: 'epic' },
    desc: 'Trade 2 epic elemental materials for 1 random epic', minRep: 200 },
  { id: 'swap_elem_legendary', name: 'Swap Legendary Elements', icon: '🔄',
    cost: { tier_legendary: 2 }, reward: { elemTier: 'legendary' },
    desc: 'Trade 2 legendary elemental materials for 1 random legendary', minRep: 500 },
];

const ELEM_TIER_INFO = {
  common: { name: 'Common', xp: 3, cost: 40, elements: ['pyro', 'water', 'electro', 'wind'] },
  uncommon: { name: 'Uncommon', xp: 8, cost: 100, elements: ['pyro', 'water', 'electro', 'wind'] },
  rare: { name: 'Rare', xp: 15, cost: 180, elements: ['pyro', 'water', 'electro', 'wind'] },
  epic: { name: 'Epic', xp: 25, cost: 300, elements: ['pyro', 'water', 'electro', 'wind'] },
  legendary: { name: 'Legendary', xp: 45, cost: 500, elements: ['pyro', 'water', 'electro', 'wind'] },
};

const ELEM_TIER_ITEMS = {
  common: ['dgn_pyro_cinder', 'dgn_water_droplet', 'dgn_electro_spark', 'dgn_wind_feather'],
  uncommon: ['dgn_pyro_ember', 'dgn_water_crystal', 'dgn_electro_shard', 'dgn_wind_whisper'],
  rare: ['dgn_pyro_core', 'dgn_water_core', 'dgn_electro_core', 'dgn_wind_core'],
  epic: ['dgn_pyro_essence', 'dgn_water_essence', 'dgn_electro_essence', 'dgn_wind_essence'],
  legendary: ['dgn_pyro_primordial', 'dgn_water_primordial', 'dgn_electro_primordial', 'dgn_wind_primordial'],
};

// Guild reputation levels
const GUILD_RANKS = [
  { rank: 0, name: 'Novice', reputationNeeded: 0, discount: 0 },
  { rank: 1, name: 'Apprentice', reputationNeeded: 10, discount: 5 },
  { rank: 2, name: 'Journeyman', reputationNeeded: 50, discount: 10 },
  { rank: 3, name: 'Expert', reputationNeeded: 200, discount: 15 },
  { rank: 4, name: 'Master', reputationNeeded: 500, discount: 20 },
  { rank: 5, name: 'Grand Master', reputationNeeded: 1000, discount: 25 },
];

// Add to state
// Add to D object:
// guildReputation: 0,

  // ── Infinite Floor Tower ─────────────────────────────────
  const DUNGEON = { id:'tower', name:'The Endless Tower', icon:'🗼', desc:'An infinite tower of darkness. Clear each floor to ascend.' };

  const FLOOR_THEMES = [
    { theme:'#7c3aed', themeGlow:'rgba(124,58,237,0.35)', name:'Crypt Depths'    },
    { theme:'#dc2626', themeGlow:'rgba(220,38,38,0.35)',  name:'Volcanic Halls'  },
    { theme:'#1e3a5f', themeGlow:'rgba(30,58,95,0.4)',    name:'Abyssal Void'    },
    { theme:'#065f46', themeGlow:'rgba(6,95,70,0.4)',     name:'Cursed Jungle'   },
    { theme:'#92400e', themeGlow:'rgba(146,64,14,0.4)',   name:'Celestial Ruins' },
  ];

  // ── Mini-Boss Pool ──────────────────────────────────────────
const MINI_BOSS_POOL = [
    { name:'Shadow Stalker', icon:'🐺', baseHp:400, baseAtk:55, baseDef:25, tokenCost:5,  minFloor:5,  image:'/images/dungeon/monsters/shadow_stalker.jpg', lore:'The Shadow Stalker is a tough dog-like creature that attacks from the shadows.' },
    { name:'Crystal Golem',  icon:'💎', baseHp:600, baseAtk:40, baseDef:45, tokenCost:6,  minFloor:15, image:'/images/dungeon/monsters/crystal_golem.jpg', lore:'Crystal Golems are Hard as Diamond and hit with the force of the mountain.' },
    { name:'Flame Revenant', icon:'🔥', baseHp:350, baseAtk:70, baseDef:20, tokenCost:7,  minFloor:20, image:'/images/dungeon/monsters/flame_revenant.jpg', lore:'Flame Revenants are the burning echoes of fallen pyromancers, wreathed in unquenchable fire that hungers for living kindling.' },
    { name:'Frost Wyrmling', icon:'❄️', baseHp:450, baseAtk:60, baseDef:30, tokenCost:8,  minFloor:25, image:'/images/dungeon/monsters/frost_wyrmling.jpg', lore:'Frost Wyrmlings are juvenile dragons born in the deepest caverns, where the cold itself whispers ancient draconic secrets.' },
    { name:'Void Stalker',   icon:'🌑', baseHp:500, baseAtk:75, baseDef:28, tokenCost:9,  minFloor:30, image:'/images/dungeon/monsters/void_stalker.jpg', lore:'Void Stalkers are hunters from the space between worlds, phasing in and out of reality to corner their prey.' },
    { name:'Doom Knight',    icon:'⚔️', baseHp:700, baseAtk:65, baseDef:50, tokenCost:10, minFloor:35, image:'/images/dungeon/monsters/doom_knight.jpg', lore:'Doom Knights are oath-bound to a forgotten god of war, their armor fused to flesh in an eternal pact of slaughter.' },
];

const CRAWLER_BASE = {
    id: 'the_crawler',
    name: 'The Crawler',
    icon: '🕷️',
    image: '/images/dungeon/monsters/crawler.jpg',
};

function getMiniBossForFloor(floor) {
    const available = MINI_BOSS_POOL.filter(m => m.minFloor <= floor);
    if (available.length === 0) return null;
    const miniBoss = available[rand(0, available.length - 1)];
    const scale = 1
        + Math.max(0, floor - miniBoss.minFloor) * 0.12
        + Math.max(0, floor - 1) * 0.035;
    
    return {
        name: miniBoss.name,
        icon: miniBoss.icon,
        image: miniBoss.image,
        hp: Math.round(miniBoss.baseHp * scale * 2),
        atk: Math.round(miniBoss.baseAtk * scale),
        def: Math.round(miniBoss.baseDef * scale * 2),
        tokenCost: 0,
        isMiniBoss: true,
        currentHp: Math.round(miniBoss.baseHp * scale * 2),
        maxHp: Math.round(miniBoss.baseHp * scale * 2),
        lastKilled: null,
        stolenItems: [],
        lore: miniBoss.lore,
    };
}

function rebalanceMiniBossMonster(monster, floor) {
    if (!monster || !monster.isMiniBoss) return monster;
    if (Number(monster.rebalanceVersion || 0) >= 1) return monster;

    const template = MINI_BOSS_POOL.find(entry =>
        entry.name === monster.name ||
        String(entry.name || '').toLowerCase().replace(/[^\w]+/g, '_') === monster.id
    );
    if (!template) {
        if (!monster.image) return hydrateMonsterImage({ ...monster, rebalanceVersion: 1 });
        return { ...monster, rebalanceVersion: 1 };
    }

    const safeFloor = Math.max(1, Number(floor) || 1);
    const scale = 1
        + Math.max(0, safeFloor - template.minFloor) * 0.12
        + Math.max(0, safeFloor - 1) * 0.035;

    const newMaxHp = Math.round(template.baseHp * scale * 2);
    const newDef = Math.round(template.baseDef * scale * 2);
    const newAtk = Math.round(template.baseAtk * scale);
    const previousMax = Math.max(1, Number(monster.maxHp || monster.hp || newMaxHp));
    const hpRatio = Math.max(0, Math.min(1, Number(monster.currentHp ?? previousMax) / previousMax));
    const nextCurrentHp = monster.lastKilled ? 0 : Math.max(1, Math.round(newMaxHp * hpRatio));

    return {
        ...monster,
        image: monster.image || template.image,
        atk: newAtk,
        def: newDef,
        hp: newMaxHp,
        maxHp: newMaxHp,
        currentHp: nextCurrentHp,
        tokenCost: 0,
        rebalanceVersion: 1,
    };
}

function normalizeMiniBossRooms(rooms, floor) {
    if (!Array.isArray(rooms)) return [];
    return rooms.map(room => {
        if (!Array.isArray(room.monsters) || !room.monsters.length) return room;
        const now = Date.now();
        const respawnMs = MONSTER_RESPAWN_H * 3600000;
        const monsters = room.monsters.map(monster => {
            // If a monster was killed long ago, treat it as respawned so it doesn't render at 0 HP.
            // (Some older saved states keep lastKilled/currentHp=0 even after the respawn window.)
            let lastKilled = monster?.lastKilled ?? null;
            if (typeof lastKilled === 'number' && lastKilled > 0 && lastKilled < 1000000000000) {
                // seconds -> ms
                lastKilled = lastKilled * 1000;
            }
            const hydrated = hydrateMonsterImage(monster || {});
            if (typeof lastKilled === 'number' && lastKilled > 0 && (now - lastKilled) >= respawnMs) {
                const maxHp = Number(monster?.maxHp || monster?.hp || 1);
                return rebalanceMiniBossMonster({
                    ...hydrated,
                    lastKilled: null,
                    maxHp,
                    currentHp: Math.max(1, maxHp),
                }, floor);
            }
            return rebalanceMiniBossMonster(hydrated, floor);
        });
        return { ...room, monsters };
    });
}

function hydrateMonsterImage(monster) {
    // Fix old image paths (miniboss*.jpg → monsters/*.jpg)
    const oldPath = monster.image && /\/images\/dungeon\/miniboss\d*\.jpg/i.test(monster.image);
    if (!monster.image || oldPath) {
        const id = monster.id || (monster.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const byName = (m) => (m.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const found = MONSTER_POOL.find(m => m.id === id)
            || MONSTER_POOL.find(m => byName(m) === id)
            || MINI_BOSS_POOL.find(m => byName(m) === id)
            || BOSS_POOL.find(m => byName(m) === id)
            || CRAWLER_BASE && byName(CRAWLER_BASE) === id && CRAWLER_BASE;
        if (found && found.image) return { ...monster, image: found.image };
    }
    return monster;
}

function normalizeRoomMonsters(rooms, floor) {
    if (!Array.isArray(rooms)) return [];
    const now = Date.now();
    const respawnMs = MONSTER_RESPAWN_H * 3600000;
    return rooms.map(room => {
        if (!room || !Array.isArray(room.monsters) || room.monsters.length === 0) return room;
        const monsters = room.monsters.map(monster => {
            if (!monster) return monster;

            let lastKilled = monster.lastKilled ?? null;
            if (typeof lastKilled === 'number' && lastKilled > 0 && lastKilled < 1000000000000) {
                // seconds -> ms
                lastKilled = lastKilled * 1000;
            }

            const maxHp = Number(monster.maxHp ?? monster.hp ?? 1);
            const currentHp = Number(monster.currentHp ?? maxHp);
            const hydrated = hydrateMonsterImage(monster);

            // If the respawn window elapsed, treat as alive again.
            if (typeof lastKilled === 'number' && lastKilled > 0 && (now - lastKilled) >= respawnMs) {
                return rebalanceMiniBossMonster({
                    ...hydrated,
                    lastKilled: null,
                    maxHp,
                    currentHp: Math.max(1, maxHp),
                }, floor);
            }

            // Guard against older saved states: monsters with 0 HP but no lastKilled would appear "alive".
            if (!lastKilled && currentHp <= 0) {
                return rebalanceMiniBossMonster({
                    ...hydrated,
                    lastKilled: now,
                    maxHp,
                    currentHp: 0,
                }, floor);
            }

            return rebalanceMiniBossMonster({ ...hydrated, lastKilled }, floor);
        });
        return { ...room, monsters };
    });
}

function getCrawlerForFloor(floor) {
    const boss = getBossForFloor(floor);
    // The Crawler is meant to be an "oh no" encounter: stronger than the floor boss.
    // Per balance: 2x HP and 2x DEF (relative to previous crawler tuning).
    const hpMult = 2.9 * 2;
    const defMult = 2.5 * 2;
    return {
        id: CRAWLER_BASE.id,
        name: CRAWLER_BASE.name,
        icon: CRAWLER_BASE.icon,
        image: CRAWLER_BASE.image,
        hp: Math.round(boss.hp * hpMult),
        atk: Math.round(boss.atk * 2.7),
        def: Math.round(boss.def * defMult),
        steal: false,
        isCrawler: true,
        lore: 'The Crawler is Doom manifest. A being of endless growth, it mimics the strength of its next meal to provide entertainment. Nothing escapes its hunt.',
        currentHp: Math.round(boss.hp * hpMult),
        maxHp: Math.round(boss.hp * hpMult),
        lastKilled: null,
        stolenItems: [],
    };
}

  const MONSTER_POOL = [
    { id:'skeleton',    name:'Skeleton Warrior', icon:'💀', image:'/images/dungeon/monsters/skeleton.jpg', hp:80,  atk:12, def:5,  steal:true,  minFloor:1,  lore:'Skeleton Warriors are basic dungeon fodder. Easy to put down, hard to keep down.' },
    { id:'ghost',       name:'Wailing Ghost',    icon:'👻', image:'/images/dungeon/monsters/ghost.jpg', hp:60,  atk:18, def:2,  steal:false, minFloor:1,  lore:'Wailing Ghosts are psychic entities, attacking the mind instead of the body.' },
    { id:'zombie',      name:'Rotting Zombie',   icon:'🧟', image:'/images/dungeon/monsters/zombie.jpg', hp:120, atk:8,  def:8,  steal:true,  minFloor:1,  lore:'Rotting Zombies are the direct refusal of the dungeon to waste perfectly good corrupted adventurers. Fight the remains of those before you!' },
    { id:'lich',        name:'Lich Apprentice',  icon:'🧙', image:'/images/dungeon/monsters/lich.jpg', hp:70,  atk:22, def:3,  steal:false, minFloor:3,  lore:'The Lich apprentice is weak but threatens with the power of the unholy arcane arts.' },
    { id:'fire_imp',    name:'Fire Imp',         icon:'😈', image:'/images/dungeon/monsters/fire_imp.jpg', hp:90,  atk:20, def:6,  steal:false, minFloor:3,  lore:'Fire Imps are infernal manifestations of demonic influence. Holy water is highly recommended.' },
    { id:'lava_golem',  name:'Lava Golem',       icon:'🗿', image:'/images/dungeon/monsters/lava_golem.jpg', hp:180, atk:14, def:22, steal:false, minFloor:5,  lore:'Lava Golems are Magma given form. Cooling them exposes just how brittle a foundation they have.' },
    { id:'salamander',  name:'Fire Salamander',  icon:'🦎', image:'/images/dungeon/monsters/salamander.jpg', hp:110, atk:25, def:8,  steal:true,  minFloor:5,  lore:'Fire Salamanders exist in the underground around lava pools. Peaceful until disturbed.' },
    { id:'pyromancer',  name:'Pyromancer Shade', icon:'🔥', image:'/images/dungeon/monsters/pyromancer.jpg', hp:85,  atk:32, def:4,  steal:false, minFloor:7,  lore:'Pyromancer Shade is an after image of a long forgotten pyromancer from history. The stories forget, the powers do not.' },
    { id:'void_wraith', name:'Void Wraith',      icon:'🌑', image:'/images/dungeon/monsters/void_wraith.jpg', hp:130, atk:38, def:10, steal:true,  minFloor:8,  lore:'Void Wraiths are weak beings that exist on the after images of mana. Even a slight scent of mana will cause them to swarm.' },
    { id:'abyssal_eye', name:'Abyssal Eye',      icon:'👁️', image:'/images/dungeon/monsters/abyssal_eye.jpg', hp:100, atk:45, def:5,  steal:false, minFloor:10, lore:'Abyssal Eye is a manifestation of local corruption exposing reality to the watchful eye of the Abyss.' },
    { id:'shadow_lord', name:'Shadow Lord',      icon:'🕷️', image:'/images/dungeon/monsters/shadow_lord.jpg', hp:200, atk:30, def:28, steal:true,  minFloor:12, lore:'Shadow Lords are weak imitations of what lurks in the darkness. Intangible made corporeal.' },
    { id:'void_titan',  name:'Void Titan',       icon:'💠', image:'/images/dungeon/monsters/void_titan.jpg', hp:250, atk:42, def:35, steal:true,  minFloor:15, lore:'Void Titans are gigantic void touched titans from the netherrealm. Caution is advised.' },
    { id:'dread_knight',name:'Dread Knight',     icon:'⚔️', image:'/images/dungeon/monsters/dread_knight.jpg', hp:300, atk:50, def:40, steal:true,  minFloor:20, lore:'Dread Knights are fear incarnate. Survivors are often mentally broken from the experience.' },
    { id:'elder_lich',  name:'Elder Lich',       icon:'💜', image:'/images/dungeon/monsters/elder_lich.jpg', hp:220, atk:60, def:20, steal:false, minFloor:25, lore:'Elder Lich is a long dead Mage that forsook life and turned to undeath in their greed.' },
    { id:'shadow_stalker', name:'Shadow Stalker', icon:'🐺', image:'/images/dungeon/monsters/shadow_stalker.jpg', hp:400, atk:55, def:25, steal:true, minFloor:10, isMiniBoss: true, tokenCost: 5, lore:'The Shadow Stalker is a tough dog-like creature that attacks from the shadows.' },
    { id:'crystal_golem', name:'Crystal Golem', icon:'💎', image:'/images/dungeon/monsters/crystal_golem.jpg', hp:600, atk:40, def:45, steal:false, minFloor:15, isMiniBoss: true, tokenCost: 6, lore:'Crystal Golems are Hard as Diamond and hit with the force of the mountain.' },
    { id:'flame_revenant', name:'Flame Revenant', icon:'🔥', image:'/images/dungeon/monsters/flame_revenant.jpg', hp:350, atk:70, def:20, steal:false, minFloor:20, isMiniBoss: true, tokenCost: 7, lore:'Flame Revenants are the burning echoes of fallen pyromancers, wreathed in unquenchable fire that hungers for living kindling.' },
    { id:'frost_wyrmling', name:'Frost Wyrmling', icon:'❄️', image:'/images/dungeon/monsters/frost_wyrmling.jpg', hp:450, atk:60, def:30, steal:true, minFloor:25, isMiniBoss: true, tokenCost: 8, lore:'Frost Wyrmlings are juvenile dragons born in the deepest caverns, where the cold itself whispers ancient draconic secrets.' },
    { id:'void_stalker', name:'Void Stalker', icon:'🌑', image:'/images/dungeon/monsters/void_stalker.jpg', hp:500, atk:75, def:28, steal:true, minFloor:30, isMiniBoss: true, tokenCost: 9, lore:'Void Stalkers are hunters from the space between worlds, phasing in and out of reality to corner their prey.' },
    { id:'doom_knight', name:'Doom Knight', icon:'⚔️', image:'/images/dungeon/monsters/doom_knight.jpg', hp:700, atk:65, def:50, steal:true, minFloor:35, isMiniBoss: true, tokenCost: 10, lore:'Doom Knights are oath-bound to a forgotten god of war, their armor fused to flesh in an eternal pact of slaughter.' },
  ];

const BOSS_POOL = [
    { name:'Death Knight Malachar', icon:'⚔️💀', image:'/images/boss/malachar.jpg', baseHp:600,  baseAtk:45, baseDef:20, steal:true,  lore:'The Death Knight is the remnant of a forgotten warrior bound in undeath to oppose all who enter his final abode.' },
    { name:'Ignarath the Eternal',  icon:'🌋🔥', image:'/images/boss/ignarath.jpg',  baseHp:700,  baseAtk:55, baseDef:25, steal:false, lore:'Ignarath is a fusion of demonic and necrotic energy warped to resemble a human abomination. Win quickly or be forever lost to corruption\'s touch.' },
    { name:'Nyxaroth the Devourer', icon:'🌑👁️', image:'/images/boss/nyxaroth.jpg',  baseHp:800,  baseAtk:65, baseDef:30, steal:true,  lore:'Nyxaroth is a mindless predator of unequal quickness and fury. Few survive to whisper tales of the calamity that follows her wake.' },
    { name:'Vizorax the Unholy',    icon:'👹🔥', image:'/images/boss/vizorax.jpg',    baseHp:850,  baseAtk:60, baseDef:35, steal:true,  lore:'Vizorax the Unholy, a Demon from the depths who adds a piece of each defeated opponent to his living armor. Said to be so magically potent reality bends to his whims.' },
    { name:'The Hollow King',       icon:'👑💀', image:'/images/boss/hollowking.jpg', baseHp:900,  baseAtk:70, baseDef:35, steal:true,  lore:'The Hollow King is a monarch of a fallen kingdom, his crown fused to a skull that still commands legions of the damned.' },
    { name:'Voidborn Colossus',     icon:'💠🌑', image:'/images/boss/voidborn.jpg',   baseHp:1000, baseAtk:80, baseDef:40, steal:false, lore:'Voidborn Colossi are living fortresses of compressed void matter, each step cracking the fabric of reality.' },
    { name:'The Undying Empress',   icon:'👸🔥', image:'/images/boss/empress.jpg',    baseHp:1100, baseAtk:90, baseDef:45, steal:true,  lore:'The Undying Empress is rumored to have sacrificed an entire civilization to fuel her immortality, pure speculation as none exist to bear witness to the truths of her existence.' },
    { name:'Abyssal Sovereign',     icon:'🌊💀', image:'/images/boss/sovereign.jpg',  baseHp:1200, baseAtk:95, baseDef:50, steal:true,  lore:'An abomination that crawled out of the void, the Abyssal Sovereign desecrates reality with his presence as he seeks to consume all to fuel his existence.' },
];
  const ROMAN = ['','II','III','IV','V','VI','VII','VIII','IX','X'];

function getBossForFloor(floor) {
    const idx  = (floor - 1) % BOSS_POOL.length;
    const tier = Math.floor((floor - 1) / BOSS_POOL.length);
    const b    = BOSS_POOL[idx];
    const scale = 1 + (floor - 1) * 0.18 + tier * 0.5;
    
    // Calculate gems with cap at 15
    let gemMin = Math.max(1, floor);
    let gemMax = Math.max(2, floor * 2);
    // Cap both at 15 maximum
    gemMin = Math.min(15, gemMin);
    gemMax = Math.min(15, gemMax);
    
    return {
        name:  b.name + (tier > 0 ? ' ' + (ROMAN[Math.min(tier, ROMAN.length-1)] || 'X+') : ''),
        icon:  b.icon,
        image: b.image,
        hp:    Math.round(b.baseHp  * scale),
        atk:   Math.round(b.baseAtk * scale),
        def:   Math.round(b.baseDef * scale),
        steal: b.steal,
        lore:  b.lore,
        loot: {
            gold:        [100 + floor * 30,  300 + floor * 80],
            gems:        [gemMin, gemMax],  // Now capped at 15
            premiumDays: floor <= 5 ? [5,10] : floor <= 15 ? [7,14] : [10,30],
            itemRarity:  floor <= 5 ? 'rare' : floor <= 15 ? 'epic' : 'legendary',
        },
    };
}
  
  function getFloorTheme(floor) {
    return FLOOR_THEMES[Math.floor((floor - 1) / 10) % FLOOR_THEMES.length];
  }
  
  function getMonstersForFloor(floor) {
    return MONSTER_POOL.filter(m => m.minFloor <= floor).map(m => ({
      ...m,
      hp:  Math.round(m.hp  + floor * 8),
      atk: Math.round(m.atk + floor * 2.5),
      def: Math.round(m.def + floor * 1.2),
    }));
  }
  
  // getDungeonDef: returns live computed def for current floor
  function getDungeonDef(id) {
    if (id === 'tower' || !id) {
      if (D && D.floor) {
        const floor = D.floor || 1;
        const t = getFloorTheme(floor);
        return { 
          id: 'tower', 
          name: DUNGEON.name, 
          icon: DUNGEON.icon, 
          theme: t.theme, 
          themeGlow: t.themeGlow, 
          themeName: t.name, 
          monsters: getMonstersForFloor(floor), 
          boss: getBossForFloor(floor) 
        };
      }
      return DUNGEON;
    }
    return DUNGEON;
  }

  // ── Loot Tables ────────────────────────────────────────────
  const MINION_LOOT = [
    { type:'gold',       weight:76, min:12, max:70  },
    { type:'potion_hp',  weight:4,  icon:'??' },
    { type:'potion_mp',  weight:1,  name:'Mana Potion',    icon:'??', mp:30    },
    { type:'item_common',weight:12 },
  ];

  function getHealthPotionDropForFloor(floor) {
    const safeFloor = Math.max(1, Number(floor) || 1);
    if (safeFloor >= 25) {
      return { name:'Major Health Potion', icon:'??', heal:500 };
    }
    if (safeFloor >= 12) {
      return { name:'Greater Health Potion', icon:'??', heal:200 };
    }
    return { name:'Small Health Potion', icon:'??', heal:100 };
  }

  const COMMON_ITEMS = [
    { name:'Pyro Cinder',       icon:'🔥', type:'material', rarity:'common' },
    { name:'Water Droplet',     icon:'💧', type:'material', rarity:'common' },
    { name:'Electro Spark',     icon:'⚡', type:'material', rarity:'common' },
    { name:'Wind Feather',      icon:'🌪️', type:'material', rarity:'common' },
  ];

  // ── State ──────────────────────────────────────────────────
let D = {
  tokens: 0,
  activeDungeon: null,
  dungeonGold: 0,
  floor: 1,
  highestFloor: 1,
  rooms: [],
  playerPos: 0,
  exploredRooms: new Set(),
  floorRunId: null,
  crawler: null,
  combat: null,
  travelTimer: null,
  isTraveling: false,
  dungeonLog: [],
  savedProgress: {},
  dungeonInventory: [],  // Make sure this exists
  blacksmithUnlocked: false,
  guildReputation: 0,    // Add this
  lockRefreshInterval: null,
  _combatActive: false,
};

// Release lock when leaving tab
window.addEventListener('beforeunload', () => {
  if (D.activeDungeon) {
    navigator.sendBeacon('/game/dungeon/lock-release');
  }
});

// Also release on visibility change (mobile)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && D.activeDungeon) {
    navigator.sendBeacon('/game/dungeon/lock-release');
  }
});

  // ── Helpers ────────────────────────────────────────────────
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function chance(p)      { return Math.random() < p; }
  function elapsed(ts, hours) { return (Date.now() - ts) >= hours * 3600000; }

  function getChar() {
    return (typeof character !== 'undefined' && character) ? character : null;
  }

  function log(msg, cls='') {
    D.dungeonLog.unshift({ msg, cls, ts: Date.now() });
    if (D.dungeonLog.length > 60) D.dungeonLog.pop();
    renderLog();
  }

  function saveState() {
    try { localStorage.setItem('dungeon_state', JSON.stringify(D)); } catch(e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('dungeon_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.exploredRooms = new Set(parsed.exploredRooms || []);
        parsed.crawler = parsed.crawler || null;
        parsed.floorRunId = parsed.floorRunId || null;
        const loadedRooms = parsed.rooms || [];
        const loadedFloor = parsed.floor || 1;
        parsed.rooms = normalizeRoomMonsters(normalizeMiniBossRooms(loadedRooms, loadedFloor), loadedFloor);
        D = { ...D, ...parsed };
      }
    } catch(e) {}
  }

  function createFloorRunId() {
    return `floor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

async function refreshCharacter() {
  try {
    const updatedChar = await apiFetch('GET', '/game/character');
    if (updatedChar) {
      if (typeof character !== 'undefined') {
        Object.assign(character, updatedChar);
      }
      if (typeof window.character !== 'undefined') {
        window.character = updatedChar;
      }
      if (typeof renderTopBar === 'function') renderTopBar();
      if (typeof renderCharacter === 'function') renderCharacter();
    }
    
    // Also refresh dungeon gold display
    const goldRes = await apiFetch('GET', '/game/dungeon/gold');
    if (goldRes && goldRes.success) {
      const goldEl = document.getElementById('dungeon-gold-count');
      if (goldEl) goldEl.textContent = goldRes.dungeonGold;
    }
  } catch(e) {
    console.error('Failed to refresh character:', e);
  }
}

  async function loadDungeonDataFromDB() {
  try {
    const response = await apiFetch('GET', '/game/dungeon/data');
    if (response && response.conflict) {
      log(`⚠️ Dungeon already active on another device. Please close it there first.`, 'log-danger');
      setTimeout(() => renderDungeonList(), 2000);
      return false;
    }
    if (response && response.success) {
      D.tokens = response.tokens || 0;
      D.floor = response.floor || 1;
      D.highestFloor = response.highestFloor || 1;
      
      if (response.progress) {
        // Edge case: if activeDungeon is null (death/exit path), we still want resume to work.
        const key = response.progress.activeDungeon || 'tower';
        const progressFloor = response.progress.floor || 1;
        const rooms = normalizeRoomMonsters(
          normalizeMiniBossRooms(response.progress.rooms || [], progressFloor),
          progressFloor
        );
        if (rooms && rooms.length) {
          D.savedProgress[key] = {
            floor: response.progress.floor,
            pos: response.progress.playerPos,
            rooms,
            explored: response.progress.exploredRooms,
            combat: response.progress.combat,
            crawler: response.progress.crawler || null,
            floorRunId: response.progress.floorRunId || null
          };
        }
      }
      
      updateTokenDisplay();
      
      // Also load dungeon gold
      const goldRes = await apiFetch('GET', '/game/dungeon/gold');
      if (goldRes && goldRes.success) {
        D.dungeonGold = goldRes.dungeonGold || 0;
        const goldEl = document.getElementById('dungeon-gold-count');
        if (goldEl) goldEl.textContent = goldRes.dungeonGold;
      }
      
      return true;
    }
  } catch (e) {
    console.error('Failed to load dungeon data from DB:', e);
    loadState();
  }
  return false;
}

  async function saveTokensToDB() {
    try {
      await apiFetch('POST', '/game/dungeon/tokens', { tokens: D.tokens });
      saveState();
    } catch (e) {
      console.error('Failed to save tokens to DB:', e);
    }
  }

  async function saveProgressToDB() {
    try {
      await apiFetch('POST', '/game/dungeon/progress', {
        floor: D.floor,
        highestFloor: D.highestFloor || D.floor,
        // Persist the *current runtime* dungeon state so rooms don't come back empty on resume.
        progress: {
          rooms: D.rooms || [],
          playerPos: D.playerPos || 0,
          exploredRooms: [...(D.exploredRooms || [])],
          crawler: D.crawler || null,
          floorRunId: D.floorRunId || null
        },
        activeDungeon: D.activeDungeon,
        combat: D.combat
      });
    } catch (e) {
      console.error('Failed to save progress to DB:', e);
    }
  }

  async function spendTokens(amount) {
    if (D.tokens >= amount) {
      D.tokens -= amount;
      updateTokenDisplay();
      await saveTokensToDB();
      return true;
    }
    return false;
  }

  // ── Token Economy ──────────────────────────────────────────
  function addTokensFromMP(mpSpent) {
    apiFetch('POST', '/game/dungeon/mp-spent', { mpSpent })
      .then(response => {
        if (response && response.totalTokens !== undefined) {
          D.tokens = response.totalTokens;
          updateTokenDisplay();
          saveState();
          log(`⚗️ Gained ${response.tokensEarned} Boss Clearance Token${response.tokensEarned > 1 ? 's' : ''} from MP spent.`, 'log-token');
        }
      })
      .catch(e => console.error('Failed to process MP:', e));
    
    return Math.floor(mpSpent / MP_PER_TOKEN);
  }
  
  global.dungeonAddTokens = addTokensFromMP;

  function updateTokenDisplay() {
    const el = document.getElementById('dungeon-token-count');
    if (el) el.textContent = D.tokens;
  }

// ── Map Generation ─────────────────────────────────────────
  function generateFloor(dungeonId, floor) {
    const rooms = [];
    const gridW = 24, gridH = 24;
    const total = gridW * gridH;

    const used = new Array(total).fill(false);
    const chosen = [];
    const depthMap = {};
    const edgeMap = {};
    const startIdx = gridH * gridW - gridW; // Start at bottom-center
    const stack = [startIdx];

    chosen.push(startIdx);
    used[startIdx] = true;
    depthMap[startIdx] = 0;
    edgeMap[startIdx] = new Set();

    // First pass: Create main branching structure with DFS
    while (chosen.length < ROOMS_PER_FLOOR * 0.7 && stack.length > 0) {
      const current = stack[stack.length - 1];
      const cx = current % gridW;
      const cy = Math.floor(current / gridW);
      const neighbors = [];

      if (cx > 0 && !used[cy * gridW + (cx - 1)]) neighbors.push(cy * gridW + (cx - 1));
      if (cx < gridW - 1 && !used[cy * gridW + (cx + 1)]) neighbors.push(cy * gridW + (cx + 1));
      if (cy > 0 && !used[(cy - 1) * gridW + cx]) neighbors.push((cy - 1) * gridW + cx);
      if (cy < gridH - 1 && !used[(cy + 1) * gridW + cx]) neighbors.push((cy + 1) * gridW + cx);

      if (!neighbors.length) {
        stack.pop();
        continue;
      }

      const pick = neighbors[rand(0, neighbors.length - 1)];
      used[pick] = true;
      chosen.push(pick);
      depthMap[pick] = (depthMap[current] || 0) + 1;
      edgeMap[pick] = edgeMap[pick] || new Set();
      edgeMap[current] = edgeMap[current] || new Set();
      edgeMap[current].add(pick);
      edgeMap[pick].add(current);
      stack.push(pick);
    }

    // Second pass: Create open areas (rooms with 3-4 connections)
    // These are wider zones where trails converge
    const areaCount = Math.floor(ROOMS_PER_FLOOR * 0.15);
    for (let a = 0; a < areaCount; a++) {
      // Pick a random existing room to expand around
      const anchorIdx = chosen[rand(1, chosen.length - 1)];
      const ax = anchorIdx % gridW;
      const ay = Math.floor(anchorIdx / gridW);
      
      // Try to add 2-3 new connections from this area
      const directions = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }
      ];
      const shuffledDirs = directions.sort(() => Math.random() - 0.5);
      let addedFromArea = 0;
      
      for (const dir of shuffledDirs) {
        if (addedFromArea >= 2) break;
        const nx = ax + dir.dx;
        const ny = ay + dir.dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        const nIdx = ny * gridW + nx;
        if (!used[nIdx]) {
          used[nIdx] = true;
          chosen.push(nIdx);
          depthMap[nIdx] = (depthMap[anchorIdx] || 0) + 1;
          edgeMap[nIdx] = new Set();
          edgeMap[anchorIdx] = edgeMap[anchorIdx] || new Set();
          edgeMap[anchorIdx].add(nIdx);
          edgeMap[nIdx].add(anchorIdx);
          addedFromArea++;
        } else {
          // Connect to existing room for cross-link
          if (!edgeMap[anchorIdx].has(nIdx) && nIdx !== anchorIdx) {
            edgeMap[anchorIdx].add(nIdx);
            edgeMap[nIdx].add(anchorIdx);
          }
        }
      }
    }

    // Third pass: Add cross-links between nearby parallel paths
    // This makes adjacent rooms connectable even if not directly on same trail
    for (let i = 0; i < chosen.length; i++) {
      const idx = chosen[i];
      const x = idx % gridW;
      const y = Math.floor(idx / gridW);
      
      // Check orthogonal neighbors - if both exist and aren't connected, add cross-link
      // This creates shortcuts between parallel trails
      if (x > 0) {
        const leftIdx = y * gridW + (x - 1);
        if (used[leftIdx] && !edgeMap[idx].has(leftIdx)) {
          // 25% chance to cross-link adjacent rooms
          if (Math.random() < 0.25) {
            edgeMap[idx].add(leftIdx);
            edgeMap[leftIdx].add(idx);
          }
        }
      }
      if (y > 0) {
        const aboveIdx = (y - 1) * gridW + x;
        if (used[aboveIdx] && !edgeMap[idx].has(aboveIdx)) {
          if (Math.random() < 0.25) {
            edgeMap[idx].add(aboveIdx);
            edgeMap[aboveIdx].add(idx);
          }
        }
      }
    }

    // Fill remaining rooms to reach target count
    while (chosen.length < ROOMS_PER_FLOOR && stack.length > 0) {
      const current = stack[stack.length - 1];
      const cx = current % gridW;
      const cy = Math.floor(current / gridW);
      const neighbors = [];

      if (cx > 0 && !used[cy * gridW + (cx - 1)]) neighbors.push(cy * gridW + (cx - 1));
      if (cx < gridW - 1 && !used[cy * gridW + (cx + 1)]) neighbors.push(cy * gridW + (cx + 1));
      if (cy > 0 && !used[(cy - 1) * gridW + cx]) neighbors.push((cy - 1) * gridW + cx);
      if (cy < gridH - 1 && !used[(cy + 1) * gridW + cx]) neighbors.push((cy + 1) * gridW + cx);

      if (!neighbors.length) {
        stack.pop();
        continue;
      }

      const pick = neighbors[rand(0, neighbors.length - 1)];
      used[pick] = true;
      chosen.push(pick);
      depthMap[pick] = (depthMap[current] || 0) + 1;
      edgeMap[pick] = edgeMap[pick] || new Set();
      edgeMap[current] = edgeMap[current] || new Set();
      edgeMap[current].add(pick);
      edgeMap[pick].add(current);
      stack.push(pick);
    }

    const start = chosen[0];
    let farthest = chosen[0], maxDepth = 0;
    for (const c of chosen) {
      const d = depthMap[c] || 0;
      if (d > maxDepth) {
        maxDepth = d;
        farthest = c;
      }
    }

    const dungeonDef = getDungeonDef(dungeonId);
    const availableMonsters = dungeonDef?.monsters || [];

    const roomIndexByGrid = {};
    for (let i = 0; i < chosen.length; i++) {
      roomIndexByGrid[chosen[i]] = i;
    }

    for (let i = 0; i < chosen.length; i++) {
      const idx = chosen[i];
      const x = idx % gridW, y = Math.floor(idx / gridW);
      const isBoss = (idx === farthest);
      const isStart = (i === 0);
      
      const connectionCount = (edgeMap[idx] || new Set()).size;
      const isArea = connectionCount >= 3;
      const miniBossTemplate = getMiniBossForFloor(floor);
      const isMiniBoss = !isStart && !isBoss && !!miniBossTemplate && Math.random() < 0.10;

      const connections = [...(edgeMap[idx] || [])]
        .map(gridNeighbor => roomIndexByGrid[gridNeighbor])
        .filter(conn => Number.isInteger(conn) && conn !== i);

      // Determine how many monsters based on floor (every 10 floors adds 1 more enemy)
      let monsterCount = 1;
      if (floor >= 30) monsterCount = 4;
      else if (floor >= 20) monsterCount = 3;
      else if (floor >= 10) monsterCount = 2;
      else monsterCount = 1;

      let monsters = [];
      
      // ONLY spawn monsters in non-start, non-boss rooms
      if (!isStart && !isBoss) {
        if (isMiniBoss) {
          const miniBossDef = miniBossTemplate;
          if (miniBossDef) {
            monsters = [{
              id: miniBossDef.id || miniBossDef.name.toLowerCase().replace(/[^\w]+/g, '_'),
              name: miniBossDef.name,
              icon: miniBossDef.icon,
              image: miniBossDef.image,
              hp: miniBossDef.hp,
              atk: miniBossDef.atk,
              def: miniBossDef.def,
              steal: miniBossDef.steal || false,
              isMiniBoss: true,
              tokenCost: miniBossDef.tokenCost || 0,
              currentHp: miniBossDef.currentHp || miniBossDef.hp,
              maxHp: miniBossDef.maxHp || miniBossDef.hp,
              lastKilled: null,
              stolenItems: [],
            }];
          }
        } else if (availableMonsters.length > 0) {
          const spawnChance = Math.random();
          if (spawnChance < 0.7) {  // 70% chance for any monster
            monsters = [];
            const actualCount = Math.min(monsterCount, 4);
            for (let m = 0; m < actualCount; m++) {
              const monsterDef = availableMonsters[rand(0, availableMonsters.length - 1)];
              if (monsterDef) {
                const isMB = monsterDef.isMiniBoss === true;
                const scaledHp = Math.floor(monsterDef.hp + (Math.pow(floor, 1.3) * (isMB ? 15 : 12)));
                const scaledAtk = Math.floor(monsterDef.atk + (Math.pow(floor, 1.2) * (isMB ? 4 : 3)));
                const scaledDef = Math.floor(monsterDef.def + (Math.pow(floor, 1.1) * (isMB ? 2 : 1.5)));
                
                monsters.push({
                  id: monsterDef.id,
                  name: monsterDef.name,
                  icon: monsterDef.icon,
                  image: monsterDef.image,
                  hp: scaledHp,
                  atk: scaledAtk,
                  def: scaledDef,
                  steal: monsterDef.steal || false,
                  isMiniBoss: isMB,
                  tokenCost: monsterDef.tokenCost || 0,
                  currentHp: scaledHp,
                  maxHp: scaledHp,
                  lastKilled: null,
                  stolenItems: [],
                });
              }
            }
          }
        }
      }

      // Determine room type and visual
      let roomType = isBoss ? 'boss' : isStart ? 'start' : (isMiniBoss ? 'miniboss' : (isArea ? 'area' : (Math.random() < 0.15 ? 'treasure' : 'corridor')));
      let visualData = null;
      if (roomType === 'boss') visualData = DUNGEON_VISUALS.boss;
      else if (roomType === 'start') visualData = DUNGEON_VISUALS.start;
      else if (roomType === 'miniboss') visualData = DUNGEON_VISUALS.miniboss;
      else if (roomType === 'area') visualData = DUNGEON_VISUALS.area;
      else if (roomType === 'treasure') visualData = DUNGEON_VISUALS.treasure;
      else visualData = DUNGEON_VISUALS.corridor;
      
      // Ensure visualData is always set
      if (!visualData) visualData = DUNGEON_VISUALS.corridor;

      rooms.push({
        id: i,
        gridIdx: idx,
        x, y,
        isBoss,
        isMiniBoss: isMiniBoss || false,
        isStart,
        isArea,
        connections,
        monsters: monsters,
        looted: false,
        type: roomType,
        visual: visualData
      });
    }

    return rooms;
  }

  function spawnCrawlerForCurrentFloor() {
    if (!Array.isArray(D.rooms) || D.rooms.length === 0) return null;
    const eligibleRooms = D.rooms.filter(room => !room.isStart && !room.isBoss);
    if (!eligibleRooms.length) return null;
    const spawnRoom = eligibleRooms[rand(0, eligibleRooms.length - 1)];
    const monster = getCrawlerForFloor(D.floor || 1);
    return {
      roomIdx: spawnRoom.id,
      monster,
      active: true,
      encountered: false,
      chaseTurnsLeft: 0,
      defeated: false,
    };
  }

  function ensureCrawlerState() {
    if (!D.activeDungeon || !Array.isArray(D.rooms) || D.rooms.length === 0) return;
    if (D.crawler && typeof D.crawler.roomIdx === 'number' && D.crawler.monster) return;
    D.crawler = spawnCrawlerForCurrentFloor();
  }

  function getCrawlerRoom() {
    if (!D.crawler || D.crawler.defeated || !D.crawler.active) return null;
    return D.rooms[D.crawler.roomIdx] || null;
  }

  function buildRoomPath(startIdx, targetIdx) {
    if (startIdx === targetIdx) return [startIdx];
    const visited = new Set([startIdx]);
    const queue = [[startIdx]];
    while (queue.length) {
      const path = queue.shift();
      const roomIdx = path[path.length - 1];
      const room = D.rooms[roomIdx];
      if (!room) continue;
      for (const nextIdx of room.connections || []) {
        if (visited.has(nextIdx)) continue;
        const nextPath = [...path, nextIdx];
        if (nextIdx === targetIdx) return nextPath;
        visited.add(nextIdx);
        queue.push(nextPath);
      }
    }
    return [];
  }

  function logCrawlerPresence() {
    if (!D.crawler || D.crawler.defeated || !D.crawler.active) return;
    const path = buildRoomPath(D.playerPos, D.crawler.roomIdx);
    if (path.length === 2) {
      log(`🕷️ You hear skittering just beyond the next chamber...`, 'log-danger');
    } else if (path.length === 3) {
      log(`🕷️ The stone beneath your feet trembles for a moment. Something huge is moving nearby.`, 'log-warning');
    }
  }

  function startCrawlerEncounter(source = 'encounter') {
  ensureCrawlerState();
  if (!D.crawler || D.crawler.defeated || !D.crawler.monster) return false;

    // Prevent crawler combat at 0 HP (otherwise player can get stuck and/or server rejects later).
    const c0 = getChar();
    const hp0 = Number(c0?.hp_current ?? c0?.hp ?? c0?.hp_max ?? 0);
    if (Number.isFinite(hp0) && hp0 <= 0) {
      const msg = 'You are at 0 HP. Leave the dungeon to recover before fighting again.';
      if (typeof openGameDialog === 'function') {
        openGameDialog({ title: 'Out of HP', message: msg, confirmLabel: 'OK', showCancel: false }).catch(() => {});
      } else {
        alert(msg);
      }
      return false;
    }

    // Achievement tracking
    apiFetch('POST', '/game/dungeon/crawler-event', { event: 'encounter' }).catch(() => {});
    D.crawler.roomIdx = D.playerPos;
    D.crawler.active = true;
    if (!D.crawler.encountered) {
      D.crawler.encountered = true;
      D.crawler.chaseTurnsLeft = 3;
    }
    D.combat = {
      roomIdx: D.playerPos,
      monsters: [{
        ...D.crawler.monster,
        currentHp: D.crawler.monster.currentHp || D.crawler.monster.maxHp,
        maxHp: D.crawler.monster.maxHp || D.crawler.monster.hp,
      }],
      currentMonsterIndex: 0,
      // Server will provide the authoritative intro line; avoid duplicating it client-side.
      roundLog: [],
      isCrawler: true,
      serverAuth: true,
      resolving: true,
      combatId: null,
      turnNonce: 0,
    };
    log(`🕷️ The Crawler is upon you! Running may be your only chance.`, 'log-danger');
    saveState();
    saveProgressToDB();
    renderCombatPanel();

    // Server-authoritative crawler combat session (prevents client-side manipulation).
    apiFetch('POST', '/game/dungeon/crawler-combat/start', { floor: D.floor, roomIndex: D.playerPos })
      .then(res => {
        if (!D.combat || !D.combat.isCrawler) return;
        if (!res || !res.success) throw new Error(res?.error || 'Failed to start crawler combat.');
        D.combat.combatId = res.combatId;
        D.combat.turnNonce = Number(res.turnNonce || 0);
        if (res.monster) {
          D.combat.monsters = [{
            ...D.combat.monsters[0],
            ...res.monster,
            currentHp: res.monster.currentHp ?? res.monster.hp ?? D.combat.monsters[0].currentHp,
            maxHp: res.monster.maxHp ?? res.monster.hp ?? D.combat.monsters[0].maxHp,
          }];
          if (D.crawler && D.crawler.monster) {
            D.crawler.monster.currentHp = D.combat.monsters[0].currentHp;
            D.crawler.monster.maxHp = D.combat.monsters[0].maxHp;
          }
        }
        if (Array.isArray(res.log) && res.log.length) {
          D.combat.roundLog.push(...res.log);
        }
        D.combat.resolving = false;
        saveState();
        saveProgressToDB();
        renderCombatPanel();
      })
      .catch(err => {
        console.error('Failed to start crawler combat:', err);
        if (D.combat && D.combat.isCrawler) {
          D.combat.resolving = false;
          D.combat.roundLog.push({ actor: 'monster', text: '⚠️ Server combat unavailable. Try reconnecting.' });
          renderCombatPanel();
        }
      });
    return true;
  }

  function moveCrawlerAfterPlayerMove() {
    ensureCrawlerState();
    if (!D.crawler || D.crawler.defeated || !D.crawler.active || D.combat) return false;

    if (D.crawler.roomIdx === D.playerPos) {
      return startCrawlerEncounter(D.crawler.encountered ? 'chase' : 'encounter');
    }

    let nextRoomIdx = D.crawler.roomIdx;
    if (D.crawler.encountered && D.crawler.chaseTurnsLeft > 0) {
      const chasePath = buildRoomPath(D.crawler.roomIdx, D.playerPos);
      if (chasePath.length > 1) nextRoomIdx = chasePath[1];
      D.crawler.chaseTurnsLeft -= 1;
      if (D.crawler.chaseTurnsLeft <= 0 && nextRoomIdx !== D.playerPos) {
        D.crawler.encountered = false;
        D.crawler.chaseTurnsLeft = 0;
        log(`🕷️ The skittering fades. The Crawler loses your trail... for now.`, 'log-warning');
      }
    } else {
      const currentRoom = D.rooms[D.crawler.roomIdx];
      const options = (currentRoom?.connections || []).filter(idx => idx !== D.playerPos);
      if (options.length) nextRoomIdx = options[rand(0, options.length - 1)];
    }

    D.crawler.roomIdx = nextRoomIdx;
    D.crawler.active = true;
    D.crawler.monster.currentHp = Math.max(1, D.crawler.monster.currentHp || D.crawler.monster.maxHp || D.crawler.monster.hp);

    if (D.crawler.roomIdx === D.playerPos) {
      return startCrawlerEncounter('chase');
    }

    saveState();
    saveProgressToDB();
    logCrawlerPresence();
    return false;
  }

  // ── Combat Engine ──────────────────────────────────────────
function calcPlayerStats() {
  const c = getChar();
  if (!c) return { atk: 10, def: 5, hp: 100, maxHp: 100 };
  
  // Sum equipment + wp_stats bonuses
  const eq = c.equipped || {};
  const eqBonuses = { strength:0, defense:0, agility:0, magic:0, dmg_min:0, dmg_max:0, armor:0, pyro_dmg:0, water_dmg:0, wind_dmg:0, electro_dmg:0, pyro_resist:0, water_resist:0, wind_resist:0, electro_resist:0 };
  Object.values(eq).forEach(item => {
    if (!item) return;
    ['strength','defense','agility','magic','dmg_min','dmg_max','armor','pyro_dmg','water_dmg','wind_dmg','electro_dmg','pyro_resist','water_resist','wind_resist','electro_resist'].forEach(k => {
      if (item.stats?.[k]) eqBonuses[k] += Number(item.stats[k]);
      if (item.wp_stats?.[k]) eqBonuses[k] += Number(item.wp_stats[k]);
    });
  });

  const strength = (c.strength || 10) + eqBonuses.strength;
  const defense  = (c.defense || 5)  + eqBonuses.defense;
  const agility  = (c.agility || 10) + eqBonuses.agility;
  const magic    = (c.magic || 10)   + eqBonuses.magic;
  let atk = 0;
  let def = 0;

  switch(c.class) {
    case 'mage':
      atk = magic * 2.2 + strength * 0.2;
      def = defense * 0.4 + magic * 0.2;
      break;
    case 'rogue': {
      const hasShield = eq.shield && eq.shield.rogueOffhand !== true;
      const noShieldAgi = !hasShield ? Math.floor(agility * 0.05) : 0;
      atk = agility * 1.7 + strength * 0.5;
      def = defense * 0.5 + (agility + noShieldAgi) * 0.3;
      break;
    }
    case 'paladin':
      atk = strength * 1.2 + magic * 1.0;
      def = defense * 1.2 + magic * 0.3;
      break;
    default: // warrior
      atk = strength * 2 + agility * 0.5;
      def = defense + strength * 0.3;
  }

  const weaponDmg = Math.floor((eqBonuses.dmg_min + eqBonuses.dmg_max) / 2);
  atk += weaponDmg;
  def += eqBonuses.armor + (c.armor_value || 0);
  
  const hp = Number(c.hp_current ?? c.hp ?? 100);
  const maxHp = Number(c.hp_max ?? 100);
  
  return { 
    atk: Math.floor(atk), 
    def: Math.floor(def), 
    hp: Number.isFinite(hp) ? hp : 100,
    maxHp: Number.isFinite(maxHp) ? maxHp : 100
  };
}

function runCombatRound(playerStats, monsters, currentMonsterIndex) {
    const log = [];
    const currentMonster = monsters[currentMonsterIndex];
    
    // Player attacks current monster
    const pDmg = Math.max(1, Math.floor(playerStats.atk - currentMonster.def * 0.5 + rand(-3, 3)));
    currentMonster.currentHp -= pDmg;
    log.push({ actor: 'player', text: `You strike ${currentMonster.name} for ${pDmg} damage!`, dmg: pDmg });
    
    // ALL alive monsters attack back
    let totalPlayerDmg = 0;
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (m.currentHp > 0) {
            const mDmg = Math.max(1, Math.floor(m.atk - playerStats.def * 0.5 + rand(-2, 2)));
            totalPlayerDmg += mDmg;
            log.push({ actor: 'monster', text: `${m.name} hits you for ${mDmg}!`, dmg: mDmg });
        }
    }
    
    const monsterDead = currentMonster.currentHp <= 0;
    const allMonstersDead = monsters.every(m => m.currentHp <= 0);
    
    return { log, playerDmgTaken: totalPlayerDmg, monsterDead, allMonstersDead, currentMonsterIndex };
}

  function rollMinorLoot(dungeonId) {
    const total = MINION_LOOT.reduce((s,l) => s+l.weight, 0);
    let r = rand(0, total-1);
    for (const entry of MINION_LOOT) {
      r -= entry.weight;
      if (r < 0) {
        if (entry.type === 'gold') return { type:'gold', amount: rand(entry.min, entry.max) };
        if (entry.type === 'potion_hp') return { type:'potion_hp', ...getHealthPotionDropForFloor(D.floor || 1) };
        if (entry.type === 'item_common') return { type:'item', item: COMMON_ITEMS[rand(0, COMMON_ITEMS.length-1)] };
        return { type: entry.type, ...entry };
      }
    }
    return { type:'gold', amount: rand(12,35) };
  }

function rollBossLoot(bossDef) {
  const l = bossDef.loot;
  
  // Generate premium feature (5-10 days)
  const premiumFeatures = [
    { id: 'arcane_reservoir', name: 'Arcane Reservoir', emoji: '🔮', desc: '2× max MP and 2× MP regen' },
    { id: 'warlord', name: 'Warlord', emoji: '⚔️', desc: '+15% damage and +10% hit chance' },
    { id: 'iron_fortress', name: 'Iron Fortress', emoji: '🏰', desc: '+10% agility and +15% armor' },
    { id: 'apprentice', name: 'Apprentice', emoji: '📚', desc: 'All upgrade costs reduced by 20%' },
    { id: 'vault_keeper', name: 'Vault Keeper', emoji: '🏦', desc: 'Lose only 5% gold on PvP defeat' },
    { id: 'fortune_hunter', name: 'Fortune Hunter', emoji: '💰', desc: '+30% gold from missions, cooldowns 50% shorter' }
  ];
  
  const randomFeature = premiumFeatures[Math.floor(Math.random() * premiumFeatures.length)];
  const durationDays = rand(l.premiumDays[0], l.premiumDays[1]); // 5-10 days
  
  return {
    gold: rand(l.gold[0], l.gold[1]),
    gems: Math.min(15, rand(l.gems[0], l.gems[1])), // Cap gems at 15
    premium: {
      id: randomFeature.id,
      name: randomFeature.name,
      emoji: randomFeature.emoji,
      days: durationDays,
      seconds: durationDays * 24 * 3600,
      desc: randomFeature.desc
    }
  };
}

  // ── Apply Loot (Syncs with server) ──────────────────────────
  function applyLoot(loot) {
  const c = getChar();
  if (!c) return;
  
  if (loot.type === 'gold') {
    // Add to dungeon gold (separate from main gold)
    log(`💰 Found ${loot.amount} dungeon gold`, 'log-loot');
    apiFetch('POST', '/game/dungeon/add-gold', { amount: loot.amount }).catch(e => console.error('Failed to sync dungeon gold:', e));
    
    // Also update local display if we have a dungeon gold display
    updateDungeonGoldDisplay();
  } 
  else if (loot.type === 'potion_hp') {
    const potion = { 
      name: loot.name, 
      icon: loot.icon, 
      type: 'consumable', 
      effect: { type: 'heal', value: loot.heal },
      rarity: 'common',
      qty: 1
    };
    apiFetch('POST', '/game/inventory/add', { item: potion }).catch(e => console.error('Failed to add item:', e));
    log(`🧪 Found ${loot.name}`, 'log-loot');
  } 
  else if (loot.type === 'potion_mp') {
    const potion = { 
      name: loot.name, 
      icon: loot.icon, 
      type: 'consumable', 
      effect: { type: 'mp', value: loot.mp },
      rarity: 'common',
      qty: 1
    };
    apiFetch('POST', '/game/inventory/add', { item: potion }).catch(e => console.error('Failed to add item:', e));
    log(`💧 Found ${loot.name}`, 'log-loot');
  } 
  else if (loot.type === 'item') {
    apiFetch('POST', '/game/inventory/add', { item: loot.item }).catch(e => console.error('Failed to add item:', e));
    log(`📦 Found ${loot.item.icon} ${loot.item.name}`, 'log-loot');
  }
  
  // Refresh character to update UI
  refreshCharacter();
}

function updateDungeonGoldDisplay() {
  const el = document.getElementById('dungeon-gold-count');
  if (el) {
    el.textContent = D.dungeonGold || 0;
    apiFetch('GET', '/game/dungeon/gold').then(res => {
      if (res && res.success) {
        D.dungeonGold = res.dungeonGold || 0;
        el.textContent = res.dungeonGold;
      }
    }).catch(() => {});
  }
}

function enterDungeon(dungeonId) {
    const def = getDungeonDef(dungeonId);
    if (!def) return;

    // Try to acquire lock first
    apiFetch('POST', '/game/dungeon/lock-acquire')
        .then(res => {
            if (res.locked || res.error) {
                alert('⚠️ Dungeon is already active on another device.\nPlease close it there first.');
                return;
            }
            // Lock acquired - now verify and enter
            startDungeonEnter(dungeonId);
            startLockRefresh();
        })
        .catch(e => {
            console.error('Failed to acquire lock:', e);
            alert('⚠️ Failed to enter dungeon. Please try again.');
        });
}

  // Prefetch server-authoritative combat state as soon as you enter a room with enemies.
  // This makes the "Fight" button feel instant even on higher latency connections.
  function prefetchCombatForRoom(roomIdx) {
    if (D.combat) return;
    const room = D.rooms?.[roomIdx];
    if (!room || !Array.isArray(room.monsters) || room.monsters.length === 0) return;
    const anyAlive = room.monsters.some(m => !m.lastKilled || elapsed(Number(m.lastKilled), MONSTER_RESPAWN_H));
    if (!anyAlive) return;

    const key = `${D.floor}:${roomIdx}:${String(D.floorRunId || '')}`;
    if (D._combatPrefetch && D._combatPrefetch.key === key) return;

    D._combatPrefetch = {
      key,
      res: null,
      promise: apiFetch('POST', '/game/dungeon/combat/start', { floor: D.floor, roomIndex: roomIdx, kind: 'room', floorRunId: D.floorRunId })
        .then(res => {
          if (D._combatPrefetch && D._combatPrefetch.key === key) D._combatPrefetch.res = res;
          return res;
        })
        .catch(() => null),
    };
  }

function startLockRefresh() {
    D.lockRefreshInterval = setInterval(() => {
        apiFetch('POST', '/game/dungeon/lock-refresh').catch(() => {});
    }, 15000);
}

function stopLockRefresh() {
    if (D.lockRefreshInterval) {
        clearInterval(D.lockRefreshInterval);
        D.lockRefreshInterval = null;
    }
    apiFetch('POST', '/game/dungeon/lock-release').catch(() => {});
}

function startDungeonEnter(dungeonId) {
    // Verify lock is held before proceeding
    if (!D.hasLock) {
        // No lock - need to acquire first
        apiFetch('POST', '/game/dungeon/lock-acquire')
            .then(res => {
                if (res.locked || res.error) {
                    alert('⚠️ Dungeon is already active on another device.');
                    return;
                }
                D.hasLock = true;
                proceedStartDungeon(dungeonId);
            })
            .catch(e => {
                console.error('Lock verification failed:', e);
                alert('⚠️ Failed to verify lock.');
            });
        return;
    }
    
    proceedStartDungeon(dungeonId);
}

function proceedStartDungeon(dungeonId) {
    fetchElemental();
    if (D.savedProgress['tower']) {
        const s = D.savedProgress[dungeonId];
        D.activeDungeon = 'tower';
        global.__dungeonActive = true;
        D.floor = s.floor;
        D.rooms = normalizeRoomMonsters(normalizeMiniBossRooms(s.rooms || [], s.floor || 1), s.floor || 1);
        D.playerPos = s.pos;
        D.exploredRooms = new Set(s.explored);
        D.crawler = s.crawler || null;
        D.floorRunId = s.floorRunId || createFloorRunId();

        // Defensive: if saved rooms were generated with a different floor (or older rules),
        // the floor number and the monster counts can desync (e.g. 2 enemies on floor 3).
        // In that case, regenerate the floor for the current floor to restore consistency.
        const expectedMaxEnemies = (floor) => {
            const f = Math.max(1, Number(floor) || 1);
            if (f >= 30) return 4;
            if (f >= 20) return 3;
            if (f >= 10) return 2;
            return 1;
        };
        const expMax = expectedMaxEnemies(D.floor);
        const hasInvalidCounts = Array.isArray(D.rooms) && D.rooms.some(r => {
            if (!r || r.isStart || r.isBoss || r.isMiniBoss || r.type === 'miniboss') return false;
            const ms = Array.isArray(r.monsters) ? r.monsters : [];
            return ms.length > expMax;
        });
        if (hasInvalidCounts) {
            const savedCrawler = D.crawler;
            D.rooms = normalizeMiniBossRooms(generateFloor('tower', D.floor), D.floor);
            D.playerPos = D.rooms.findIndex(r => r.isStart);
            D.exploredRooms = new Set([D.playerPos]);
            // Preserve saved crawler state so closing/reopening doesn't erase its position or chase progress
            D.crawler = savedCrawler && savedCrawler.monster ? savedCrawler : spawnCrawlerForCurrentFloor();
            D.floorRunId = createFloorRunId();
            saveState();
            saveProgressToDB();
        }
        
        if (!D.rooms || D.rooms.length === 0) {
            const savedCrawler = D.crawler;
            D.rooms = normalizeMiniBossRooms(generateFloor('tower', D.floor), D.floor);
            D.playerPos = D.rooms.findIndex(r => r.isStart);
            D.exploredRooms = new Set([D.playerPos]);
            D.crawler = savedCrawler && savedCrawler.monster ? savedCrawler : spawnCrawlerForCurrentFloor();
            D.floorRunId = createFloorRunId();
            saveState();
            saveProgressToDB();
        }
        ensureCrawlerState();
        
        log(`🔮 Resuming Floor ${D.floor}...`, 'log-enter');
        renderDungeonView();
        return;
    }

    // ── Fresh run — start from the player's current floor (loaded from DB) ──
    D.activeDungeon = 'tower';
    global.__dungeonActive = true;
    const startFloor = D.floor || 1;  // already set by loadDungeonDataFromDB
    D.rooms = normalizeRoomMonsters(normalizeMiniBossRooms(generateFloor('tower', startFloor), startFloor), startFloor);
    
    if (!D.rooms || D.rooms.length === 0) {
        log('Failed to generate dungeon. Please try again.', 'log-danger');
        return;
    }
    
    D.playerPos = D.rooms.findIndex(r => r.isStart);
    if (D.playerPos === -1) D.playerPos = 0;
    
    D.exploredRooms = new Set([D.playerPos]);
    D.crawler = spawnCrawlerForCurrentFloor();
    D.floorRunId = createFloorRunId();
    D.dungeonLog = [];
    saveState();
    saveProgressToDB();

    log(`⚔️ Entered The Endless Tower – Floor ${startFloor}`, 'log-enter');
    renderDungeonView();
}

function travelToRoom(targetIdx) {
    if (D.isTraveling || D.combat) return;
    const current = D.rooms[D.playerPos];
    if (!current.connections.includes(targetIdx)) return;
    
    const target = D.rooms[targetIdx];
    const hasAliveMonsters = current.monsters && current.monsters.some(m =>
        !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)
    );
    const hasEvaded = current.monstersEvaded === true;
    const canLeaveWithoutFight = current.isMiniBoss || current.type === 'miniboss';
    
    if (hasAliveMonsters && !hasEvaded && !canLeaveWithoutFight) {
        log(`⚠️ You must defeat or escape from the ${current.monsters.length} enemies in this room before leaving!`, 'log-danger');
        return;
    }
    
    if (current.monstersEvaded) {
        current.monstersEvaded = false;
    }

    const targetAlreadyExplored = D.exploredRooms.has(targetIdx);
    const bar = document.getElementById('dungeon-travel-bar');
    const finishTravel = () => {
        D.playerPos = targetIdx;
        D.exploredRooms.add(targetIdx);
        D.isTraveling = false;
        D.travelTimer = null;
        saveState();
        saveProgressToDB();

        if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '0%';
        }

        log(`📍 Arrived at ${target.isBoss ? '⚠️ BOSS ROOM' : target.type === 'treasure' ? '💰 Treasure Room' : `Room ${targetIdx+1}`}`, 'log-arrive');

        if (target.type === 'treasure' && !target.looted) {
            target.looted = true;
            const loot = rollMinorLoot(D.activeDungeon);
            applyLoot(loot);
        }
        if (!moveCrawlerAfterPlayerMove()) {
            renderDungeonView();
        }
    };

    if (targetAlreadyExplored) {
        finishTravel();
        return;
    }

    D.isTraveling = true;
    updateTravelBtn(targetIdx, true);
    log(`🚶 Traveling to Room ${targetIdx + 1}...`, 'log-travel');

    const travelMs = TRAVEL_BASE_MS;
    if (bar) {
        bar.style.transition = `width ${travelMs}ms linear`;
        bar.style.width = '100%';
    }

    D.travelTimer = setTimeout(finishTravel, travelMs);
}
function initiateFight(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.monsters || room.monsters.length === 0) return;
    startCombat(roomIdx);
}

function startCombat(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.monsters || room.monsters.length === 0) return;

    // Prevent entering combat at 0 HP (otherwise the UI can get stuck "connecting" and server will reject anyway).
    const c0 = getChar();
    const hp0 = Number(c0?.hp_current ?? c0?.hp ?? c0?.hp_max ?? 0);
    if (Number.isFinite(hp0) && hp0 <= 0) {
        const msg = 'You are at 0 HP. Leave the dungeon to recover before fighting again.';
        if (typeof openGameDialog === 'function') {
            openGameDialog({ title: 'Out of HP', message: msg, confirmLabel: 'OK', showCancel: false }).catch(() => {});
        } else {
            alert(msg);
        }
        return;
    }

    // Check if already cleared (server-side protection)
    // Hardening: invalid persisted timestamps (string/boolean/etc.) should not soft-lock combat.
    if (room.monstersCleared && (!Number.isFinite(Number(room.monstersCleared)) || Number(room.monstersCleared) <= 0)) room.monstersCleared = null;
    room.monsters.forEach(m => { if (m && m.lastKilled && (!Number.isFinite(Number(m.lastKilled)) || Number(m.lastKilled) <= 0)) m.lastKilled = null; });
    if (room.monstersCleared) {
        // Cooldown is aligned with MONSTER_RESPAWN_H. After respawn, allow clearing again.
        if (!elapsed(Number(room.monstersCleared), MONSTER_RESPAWN_H)) {
            const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - Number(room.monstersCleared)) / 3600000).toFixed(1);
            log(`💤 Loot on cooldown (${hoursLeft}h) — you can still fight.`, 'log-info');
            // Cooldown should only block loot, not combat itself.
        }
        // Only clear the flag when cooldown elapsed; otherwise keep it so we still know loot is gated.
        if (elapsed(Number(room.monstersCleared), MONSTER_RESPAWN_H)) room.monstersCleared = null;
    }

    // Check if any monsters are alive
    const anyAlive = room.monsters.some(m => !m.lastKilled || elapsed(Number(m.lastKilled), MONSTER_RESPAWN_H));
    if (!anyAlive) {
        const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - Number(room.monsters[0].lastKilled)) / 3600000).toFixed(1);
        log(`💤 Monsters respawn in ${hoursLeft}h`, 'log-info');
        return;
    }

    // Server-authoritative combat: don't show client-computed monster stats (they may differ).
    const clientStartId = `combat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    D.combat = {
        roomIdx,
        monsters: [],
        currentMonsterIndex: 0,
        // hp_current can be 0; don't fall back to 100.
        playerHpBefore: Number(getChar()?.hp_current ?? getChar()?.hp ?? 100),
        roundLog: [],
        serverAuth: true,
        resolving: true,
        combatId: null,
        turnNonce: 0,
        clientStartId,
        manaPoints: 0,
        manaCap: 100,
        attackType: 'regular',
    };
    renderCombatPanel();
    // If the player scrolled the page before entering combat, scroll the tab content to the bottom
    // so the combat overlay sits flush with the viewport bottom.
    try {
      const scrollContainer = document.querySelector('.tab-content-area') || document.documentElement;
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, left: 0, behavior: 'instant' });
    } catch(e) { try { (document.querySelector('.tab-content-area') || document.documentElement).scrollTop = 99999; } catch(_) {} }

    // Some users can have a stale character snapshot (e.g., hp_current from a previous tab/session).
    // Refresh in the background so the HP bar stabilizes quickly without delaying combat start.
    Promise.resolve(refreshCharacter?.())
        .catch(() => {})
        .finally(() => {
            if (!D.combat || D.combat.clientStartId !== clientStartId) return;
            D.combat.playerHpBefore = Number(getChar()?.hp_current ?? getChar()?.hp ?? D.combat.playerHpBefore ?? 100);
            renderCombatPanel();
        });

    // Wait for any pending room-exit to complete before starting new combat, otherwise
    // the race can create a session that gets immediately ended by the in-flight exit query.
    const exitGuard = Promise.resolve(D._exitingRoom).then(() => { D._exitingRoom = null; });

    const preKey = `${D.floor}:${roomIdx}:${String(D.floorRunId || '')}`;
    const startPromise = exitGuard.then(() => {
        return (D._combatPrefetch && D._combatPrefetch.key === preKey)
            ? (D._combatPrefetch.res ? Promise.resolve(D._combatPrefetch.res) : (D._combatPrefetch.promise || Promise.resolve(null)))
            : apiFetch('POST', '/game/dungeon/combat/start', { floor: D.floor, roomIndex: roomIdx, kind: 'room', floorRunId: D.floorRunId });
    });

    startPromise
        .then(res => {
            if (!D.combat || D.combat.roomIdx !== roomIdx) return;
            if (!res || !res.success) throw new Error(res?.error || 'Failed to start combat.');
            if (res?.debug) console.debug('[dungeon combat start]', res.debug);
            D.combat.combatId = res.combatId;
            D.combat.turnNonce = Number(res.turnNonce || 0);
            if (Array.isArray(res.monsters) && res.monsters.length) {
                D.combat.monsters = res.monsters.map(m => ({
                    ...m,
                    currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                    maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                }));
                D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
            }
            if (typeof res.manaPoints === 'number') D.combat.manaPoints = res.manaPoints;
            if (typeof res.manaCap === 'number') D.combat.manaCap = res.manaCap;
            if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
            D.combat.resolving = false;
            saveState();
            // Best-effort: sync progress + fresh character snapshot after combat has started.
            saveProgressToDB();
            Promise.resolve(refreshCharacter?.()).catch(() => {});
            renderCombatPanel();
        })
        .catch(err => {
            console.error('Failed to start server combat:', err);
            if (D.combat && D.combat.roomIdx === roomIdx) {
                D.combat.resolving = false;
                D.combat.roundLog.push({ actor: 'monster', text: '⚠️ Server combat unavailable. Try reconnecting.' });
                renderCombatPanel();
            }
        });
}

function fightRound() {
    if (!D.combat) return;
    D.combat._lastAttackType = D.combat.attackType || 'regular';

    const atkType = D.combat.attackType || 'regular';

    // Don't attempt burst/ultimate without enough mana
    const manaNeeded = atkType === 'ultimate' ? 100 : atkType === 'burst' ? 60 : 0;
    if (manaNeeded > 0 && (D.combat.manaPoints ?? 0) < manaNeeded) {
        D.combat.attackType = 'regular';
        D.combat.roundLog.push({ actor: 'player', text: '⚠️ Not enough mana — switched to regular attack.' });
        D.combat._skillCheckDone = false;
        renderCombatPanel();
        return;
    }

    // Burst/Ultimate trigger skill check before the round
    if ((atkType === 'burst' || atkType === 'ultimate') && !D.combat._skillCheckDone) {
      showSkillCheck(atkType, (mult) => {
        console.log('[SKILL_CHECK] Got multiplier:', mult, 'from attack:', atkType);
        D.combat.skillCheckMult = mult;
        D.combat._skillCheckDone = true;
        fightRound();
      });
      return;
    }

    if (D.combat.serverAuth) {
        // Crawler has its own endpoints for now.
        if (D.combat.isCrawler) {
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            D.combat.roundLog.push({ actor: 'player', text: '...' });
            renderCombatPanel();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        apiFetch('POST', '/game/dungeon/crawler-combat/act', { combatId: D.combat.combatId, action: 'fight', turnNonce: D.combat.turnNonce })
            .then(res => {
                if (!D.combat || !D.combat.isCrawler) return;
                if (!res || !res.success) throw new Error(res?.error || 'Crawler action failed.');
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (res.monster) {
                    const m = { ...D.combat.monsters[0], ...res.monster };
                    m.currentHp = Number(res.monster.currentHp ?? m.currentHp ?? m.maxHp ?? m.hp);
                    m.maxHp = Number(res.monster.maxHp ?? m.maxHp ?? m.hp);
                    D.combat.monsters = [m];
                    if (D.crawler && D.crawler.monster) {
                        D.crawler.monster.currentHp = m.currentHp;
                        D.crawler.monster.maxHp = m.maxHp;
                    }
                }
                const c = getChar();
                if (c && res.player && typeof res.player.hp === 'number') {
                    const serverMaxHp = Number(res.player.maxHp || 0) || 0;
                    if (serverMaxHp > 0 && (!Number.isFinite(Number(c.hp_max)) || Number(c.hp_max) < serverMaxHp)) {
                        // Keep client snapshot in sync with server-computed "true" max HP (gear/set bonuses).
                        c.hp_max = serverMaxHp;
                    }
                    const maxHp = serverMaxHp > 0 ? serverMaxHp : (Number(c.hp_max || 0) || 0);
                    const nextHp = Number(res.player.hp);
                    if (maxHp > 0 && (nextHp < 0 || nextHp > maxHp)) {
                        console.warn('[dungeon] Ignoring invalid server HP', { nextHp, maxHp, serverMaxHp });
                    } else {
                        c.hp_current = res.player.hp;
                        c.hp = res.player.hp;
                        if (typeof renderTopBar === 'function') renderTopBar();
                    }
                }
                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }
                if (res.ended && res.outcome === 'crawler_defeated') {
                    // Keep existing client handling (marks crawler defeated + UI), but battle math already validated server-side.
                    D.combat.resolving = false;
                    onCrawlerDefeated();
                    return;
                }
                D.combat.resolving = false;
                saveState();
                saveProgressToDB();
                renderCombatPanel();
                triggerCombatAnimations();
            })
            .catch(err => {
                console.error('Crawler fight action failed:', err);
                if (D.combat && D.combat.isCrawler) {
                    D.combat.resolving = false;
                    D.combat.roundLog.push({ actor: 'monster', text: `⚠️ ${String(err.message || err)}` });
                    renderCombatPanel();
                    triggerCombatAnimations();
                }
            });
        return;
        }

        // Regular room + boss combat uses unified endpoint.
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            D.combat.roundLog.push({ actor: 'monster', text: '⚠️ Still connecting to server combat...' });
            renderCombatPanel();
            triggerCombatAnimations();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        const skillCheckMult = D.combat.skillCheckMult ?? 1;
        console.log('[SKILL_CHECK] Sending skillCheckMult:', skillCheckMult, 'attackType:', D.combat.attackType);
        apiFetch('POST', '/game/dungeon/combat/act', { combatId: D.combat.combatId, action: 'fight', turnNonce: D.combat.turnNonce, currentMonsterIndex: D.combat.currentMonsterIndex, attackType: D.combat.attackType || 'regular', skillCheckMult })
            .then(res => {
                // Save pre-update monster card state for animation targeting
                const oldOverlay = document.getElementById('dungeon-overlay');
                const oldMside = oldOverlay?.querySelector('.monster-side');
                const oldMc = oldMside?.querySelector('.monster-combat-card');
                if (oldMc && D.combat) {
                    const r = oldMc.getBoundingClientRect();
                    const oldIdx = D.combat.currentMonsterIndex;
                    D.combat._prevMonsterRect = { left: r.left, top: r.top, width: r.width, height: r.height };
                    D.combat._prevMonsterName = D.combat.monsters?.[oldIdx]?.name;
                    D.combat._prevMonsterIdx = oldIdx;
                }
                D.combat._skillCheckDone = false;
                D.combat.skillCheckMult = undefined;
                if (!D.combat) return;
                if (!res || !res.success) throw new Error(res?.error || 'Combat action failed.');
                if (res?.debug) console.debug('[dungeon combat act]', res.debug);
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (Array.isArray(res.monsters) && res.monsters.length) {
                    D.combat.monsters = res.monsters.map(m => ({
                        ...m,
                        currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                        maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                    }));
                    D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
                }
                if (res.player && typeof res.player.hp === 'number') {
                    const c = getChar();
                    if (c) {
                        // Safety: don't apply obviously bogus HP from transient server bugs.
                        const serverMaxHp = Number(res.player.maxHp || 0) || 0;
                        if (serverMaxHp > 0 && (!Number.isFinite(Number(c.hp_max)) || Number(c.hp_max) < serverMaxHp)) {
                            c.hp_max = serverMaxHp;
                        }
                        const maxHp = serverMaxHp > 0 ? serverMaxHp : (Number(c.hp_max || 0) || 0);
                        const nextHp = Number(res.player.hp);
                        if (maxHp > 0 && (nextHp < 0 || nextHp > maxHp)) {
                            console.warn('[dungeon] Ignoring invalid server HP', { nextHp, maxHp, serverMaxHp });
                        } else {
                        c.hp_current = res.player.hp;
                        c.hp = res.player.hp;
                        if (typeof renderTopBar === 'function') renderTopBar();
                        }
                    }
                }
                // Update mana state from server response
                if (typeof res.manaPoints === 'number') D.combat.manaPoints = res.manaPoints;
                if (typeof res.manaCap === 'number') D.combat.manaCap = res.manaCap;

                // Auto-reset attack type if not enough mana for it
                if (D.combat.attackType === 'ultimate' && (D.combat.manaPoints ?? 0) < 100) D.combat.attackType = 'regular';
                else if (D.combat.attackType === 'burst' && (D.combat.manaPoints ?? 0) < 60) D.combat.attackType = 'regular';

                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }

                if (res.ended && res.outcome === 'room_cleared') {
                    // Loot is granted server-side; we just refresh UI.
                    const room = D.rooms && D.rooms[D.combat.roomIdx];
                    if (room && Array.isArray(room.monsters)) {
                        room.monsters.forEach(m => { m.lastKilled = Date.now(); m.currentHp = 0; });
                        room.monstersEvaded = false;
                        room.monstersCleared = Date.now();
                    }
                    if (Array.isArray(res.lootGranted) && res.lootGranted.length) {
                        for (const it of res.lootGranted) {
                            if (it.type === 'dungeon_gold') log(`💰 +${it.amount} dungeon gold`, 'log-loot');
                            else log(`🎁 Loot granted: ${it.name || it.id || it.type}`, 'log-loot');
                        }
                    } else if (res.cleared) {
                        log(`⚠️ Room already cleared — no loot gained.`, 'log-warning');
                    }
                    if (room && room.id) {
                        apiFetch('POST', '/game/dungeon/release-room', { roomId: room.id, cleared: true }).catch(() => {});
                    }
                    // Play final round animations then clean up
                    D.combat.resolving = false;
                    saveTargetRectForAnim();
                    // Ensure at least one monster has HP > 0 so the card renders for the death animation
                    if (D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
                        const anyAlive = D.combat.monsters.some(m => m.currentHp > 0);
                        if (!anyAlive) D.combat.monsters[D.combat.monsters.length - 1].currentHp = 1;
                    }
                    renderCombatPanel();
                    // Set D.combat.monsters HP to 0 AFTER rendering (so monster card shows)
                    // but BEFORE triggerCombatAnimations (so dead monsters aren't counter-attackers)
                    if (D.combat && Array.isArray(D.combat.monsters)) {
                        D.combat.monsters.forEach(m => { m.currentHp = 0; });
                    }
                    triggerCombatAnimations();
                    // Dissolve the fallen monster card after the hit
                    setTimeout(() => {
                        const card = document.querySelector('.monster-combat-card');
                        if (card) {
                            pixelDissolveCard(card);
                        } else if (D.combat._prevMonsterRect) {
                            const r = D.combat._prevMonsterRect;
                            spawnFallbackParticles(r.left + r.width / 2, r.top + r.height / 2, 24);
                        }
                    }, 600);
                    setTimeout(() => {
                        D.combat = null;
                        saveState();
                        saveProgressToDB();
                        refreshCharacter();
                        renderDungeonView();
                    }, 2200);
                    return;
                }

                if (res.ended && res.outcome === 'boss_defeated') {
                    const loot = res.bossLoot;
                    const boss = D.combat.monsters?.[0] || { name: 'Boss', icon: '⚠️' };
                    if (loot) {
                        log(`🏆 FLOOR ${D.floor} CLEARED! ${boss.name} vanquished!`, 'log-boss');
                        log(`💰 Loot: ${loot.gold} gold | 💎 ${loot.gems} gems | ✨ ${loot.premium?.name || 'Premium'}`, 'log-success');
                    }
                    if (typeof res.tokens === 'number') {
                        D.tokens = res.tokens;
                        updateTokenDisplay();
                    }
                    if (typeof res.newFloor === 'number') {
                        D.floor = res.newFloor;
                        if (typeof res.highestFloor === 'number') D.highestFloor = res.highestFloor;
                    }

                    // Regenerate next floor locally (map gen is still client-side).
                    delete D.savedProgress['tower'];
                    D.rooms = normalizeMiniBossRooms(generateFloor(D.activeDungeon, D.floor), D.floor);
                    D.playerPos = D.rooms.findIndex(r => r.isStart);
                    D.exploredRooms = new Set([D.playerPos]);
                    D.crawler = spawnCrawlerForCurrentFloor();
                    D.floorRunId = createFloorRunId();
                    D.combat = null;
                    saveState();
                    saveProgressToDB();
                    refreshCharacter();
                    if (loot) showBossVictoryModal(boss, loot);
                    else renderDungeonView();
                    return;
                }

                D.combat.resolving = false;
                saveState();
                saveProgressToDB();

                // --- Mid-combat monster death handling ---
                // Server returns `currentMonsterIndex` pointing to the same monster we attacked,
                // even when it dies — so detect death by HP, not index comparison.
                const regPrevIdx = D.combat._prevMonsterIdx;
                const regMonsterJustDied = (
                    regPrevIdx != null &&
                    D.combat.monsters[regPrevIdx]?.currentHp <= 0 &&
                    D.combat.monsters.some(m => m.currentHp > 0)
                );

                if (regMonsterJustDied) {
                    const regNextIdx = D.combat.monsters.findIndex(m => m.currentHp > 0);
                    const regOldRect = D.combat._prevMonsterRect;
                    const regOldCard = document.querySelector('.monster-combat-card');
                    const regOldHtml = regOldCard ? regOldCard.outerHTML : null;

                    // 1) Player lunge
                    const regPCard = document.querySelector('.combat-fighters > .fighter-card:first-child');
                    if (regPCard) {
                        const regAtk = D.combat._lastAttackType || 'regular';
                        if (regAtk === 'ultimate') {
                            regPCard.classList.add('combat-anim-player-ultimate');
                            const cp = document.querySelector('.dungeon-combat-panel');
                            if (cp) { cp.classList.add('combat-anim-screen-shake'); setTimeout(() => cp.classList.remove('combat-anim-screen-shake'), 400); }
                            setTimeout(() => regPCard.classList.remove('combat-anim-player-ultimate'), 1000);
                        } else if (regAtk === 'burst') {
                            regPCard.classList.add('combat-anim-player-burst');
                            setTimeout(() => regPCard.classList.remove('combat-anim-player-burst'), 800);
                        } else {
                            regPCard.classList.add('combat-anim-player-lunge');
                            setTimeout(() => regPCard.classList.remove('combat-anim-player-lunge'), 600);
                        }
                    }

                    // 2) Damage float at old monster position (t=400ms)
                    const regLastPlayerLog = D.combat.roundLog.slice().reverse().find(e => e.actor === 'player');
                    const regDmg = regLastPlayerLog
                        ? (regLastPlayerLog.text.match(/(\d+)\s*damage/i) || regLastPlayerLog.text.match(/for\s+(\d+)/i) || regLastPlayerLog.text.match(/(\d+)!/))
                        : null;
                    const regPlayerDmgVal = regDmg ? parseInt(regDmg[1]) : null;
                    const regAtkType = D.combat._lastAttackType || 'regular';
                    if (regPlayerDmgVal != null && regOldRect) {
                        setTimeout(() => {
                            const el = document.createElement('div');
                            let cls = 'combat-damage-float';
                            if (regAtkType === 'ultimate') cls += ' ultimate';
                            else if (regAtkType === 'burst') cls += ' burst';
                            el.className = cls;
                            el.textContent = `-${regPlayerDmgVal}`;
                            el.style.cssText = `position:fixed;left:${regOldRect.left + regOldRect.width/2 - 30}px;top:${regOldRect.top + 20}px;z-index:500000`;
                            document.body.appendChild(el);
                            setTimeout(() => el.remove(), 900);
                        }, 400);
                    }

                    // 3) Dissolve old card (t=600ms)
                    setTimeout(() => {
                        const pr = D.combat._prevMonsterRect;
                        if (regOldCard && regOldCard.parentNode) {
                            pixelDissolveCard(regOldCard);
                        } else if (pr && regOldHtml) {
                            const ghost = document.createElement('div');
                            ghost.style.cssText = `position:fixed;left:${pr.left}px;top:${pr.top}px;width:${pr.width}px;height:${pr.height}px;z-index:500000;pointer-events:none;overflow:hidden`;
                            ghost.innerHTML = regOldHtml;
                            document.body.appendChild(ghost);
                            pixelDissolveCard(ghost);
                        } else if (pr) {
                            spawnFallbackParticles(pr.left + pr.width/2, pr.top + pr.height/2, 24);
                        }
                    }, 600);

                    // 4) After dissolve, swap to next monster + play counter-attacks (t=1800ms)
                    const regPreRoundLen = D.combat.roundLog.length - (Array.isArray(res.log) ? res.log.length : 0);
                    const regPlayerCount = (Array.isArray(res.log) ? res.log : []).filter(e => e.actor === 'player').length;
                    const regLastPlayerLogIdx = regPreRoundLen + regPlayerCount - 1;

                    setTimeout(() => {
                        if (!D.combat) return;
                        D.combat.currentMonsterIndex = regNextIdx;
                        renderCombatPanel();
                        D.combat._lastAnimatedLogIdx = regLastPlayerLogIdx;
                        triggerCombatAnimations();
                    }, 1800);
                } else {
                    renderCombatPanel();
                    triggerCombatAnimations();
                }
            })
            .catch(err => {
                console.error('Server combat action failed:', err);
                if (D.combat) {
                    D.combat._skillCheckDone = false;
                    D.combat.resolving = false;
                    D.combat.roundLog.push({ actor: 'monster', text: `⚠️ ${String(err.message || err)}` });
                    renderCombatPanel();
                    triggerCombatAnimations();
                }
            });
        return;
    }

    const c = getChar();
    if (!c) return;
    
    // hp_current can be 0; avoid `||` fallbacks (they "auto-heal" dead characters in UI).
    const currentHp = Number(c.hp_current ?? c.hp ?? 100);
    const pStats = { 
        atk: calcPlayerStats().atk, 
        def: calcPlayerStats().def, 
        hp: currentHp, 
        maxHp: Number(c.hp_max ?? 100) 
    };
    
    const { log: roundLog, playerDmgTaken, monsterDead, allMonstersDead, currentMonsterIndex } = 
        runCombatRound(pStats, D.combat.monsters, D.combat.currentMonsterIndex);
    
    D.combat.roundLog.push(...roundLog);
    
    if (playerDmgTaken > 0) {
        const newHp = Math.max(0, currentHp - playerDmgTaken);
        c.hp_current = newHp;
        c.hp = newHp;
        apiFetch('POST', '/game/dungeon/update-health', { hp: newHp }).catch(e => console.error('Failed to sync health:', e));
        if (typeof renderTopBar === 'function') renderTopBar();
    }
    
    if (c.hp_current <= 0) {
        onPlayerDeath();
        return;
    }
    
    // Monster steal attempt
    if (!monsterDead && D.combat.monsters[currentMonsterIndex].steal && chance(STEAL_CHANCE)) {
        tryStealFromPlayer(D.combat.roomIdx, currentMonsterIndex);
    }
    
    if (monsterDead) {
    const defeatedMonster = D.combat.monsters[currentMonsterIndex];
    log(`✅ ${defeatedMonster.name} defeated!`, 'log-success');

    let nextIndex = -1;
    for (let i = 0; i < D.combat.monsters.length; i++) {
        if (D.combat.monsters[i].currentHp > 0) {
            nextIndex = i;
            break;
        }
    }

    if (nextIndex === -1 || allMonstersDead) {
        if (D.combat.isCrawler || defeatedMonster.isCrawler) {
            onCrawlerDefeated();
        } else if (defeatedMonster.isBoss) {
            onBossDefeated();
        } else {
            onRoomCleared(D.combat.roomIdx);
        }
    } else {
        // Save defeated monster card info BEFORE switching index or re-rendering
        saveTargetRectForAnim();
        const clDefeatedCard = document.querySelector('.monster-combat-card');
        const clDefeatedHtml = clDefeatedCard ? clDefeatedCard.outerHTML : null;
        const clOldRect = D.combat._prevMonsterRect;

        // 1) Player lunge
        const clPCard = document.querySelector('.combat-fighters > .fighter-card:first-child');
        if (clPCard) {
            const clAtk = D.combat._lastAttackType || 'regular';
            if (clAtk === 'ultimate') {
                clPCard.classList.add('combat-anim-player-ultimate');
                const cp = document.querySelector('.dungeon-combat-panel');
                if (cp) { cp.classList.add('combat-anim-screen-shake'); setTimeout(() => cp.classList.remove('combat-anim-screen-shake'), 400); }
                setTimeout(() => clPCard.classList.remove('combat-anim-player-ultimate'), 1000);
            } else if (clAtk === 'burst') {
                clPCard.classList.add('combat-anim-player-burst');
                setTimeout(() => clPCard.classList.remove('combat-anim-player-burst'), 800);
            } else {
                clPCard.classList.add('combat-anim-player-lunge');
                setTimeout(() => clPCard.classList.remove('combat-anim-player-lunge'), 600);
            }
        }

        // 2) Damage float at old monster position (t=400ms)
        const clLastPlayerLog = D.combat.roundLog.slice().reverse().find(e => e.actor === 'player');
        const clDmg = clLastPlayerLog
            ? (clLastPlayerLog.text.match(/(\d+)\s*damage/i) || clLastPlayerLog.text.match(/for\s+(\d+)/i) || clLastPlayerLog.text.match(/(\d+)!/))
            : null;
        const clPlayerDmgVal = clDmg ? parseInt(clDmg[1]) : null;
        const clAtkType = D.combat._lastAttackType || 'regular';
        if (clPlayerDmgVal != null && clOldRect) {
            setTimeout(() => {
                const el = document.createElement('div');
                let cls = 'combat-damage-float';
                if (clAtkType === 'ultimate') cls += ' ultimate';
                else if (clAtkType === 'burst') cls += ' burst';
                el.className = cls;
                el.textContent = `-${clPlayerDmgVal}`;
                el.style.cssText = `position:fixed;left:${clOldRect.left + clOldRect.width/2 - 30}px;top:${clOldRect.top + 20}px;z-index:500000`;
                document.body.appendChild(el);
                setTimeout(() => el.remove(), 900);
            }, 400);
        }

        // 3) Dissolve old card (t=600ms)
        setTimeout(() => {
            const pr = D.combat._prevMonsterRect;
            if (clDefeatedCard && clDefeatedCard.parentNode) {
                pixelDissolveCard(clDefeatedCard);
            } else if (pr && clDefeatedHtml) {
                const ghost = document.createElement('div');
                ghost.style.cssText = `position:fixed;left:${pr.left}px;top:${pr.top}px;width:${pr.width}px;height:${pr.height}px;z-index:500000;pointer-events:none;overflow:hidden`;
                ghost.innerHTML = clDefeatedHtml;
                document.body.appendChild(ghost);
                pixelDissolveCard(ghost);
            } else if (pr) {
                spawnFallbackParticles(pr.left + pr.width/2, pr.top + pr.height/2, 24);
            }
        }, 600);

        // 4) After dissolve, swap to next monster + play counter-attacks (t=1800ms)
        const clPlayerCount = roundLog.filter(e => e.actor === 'player').length;
        const clPreRoundLen = D.combat.roundLog.length - roundLog.length;
        const clLastPlayerLogIdx = clPreRoundLen + clPlayerCount - 1;

        setTimeout(() => {
            if (!D.combat) return;
            D.combat.currentMonsterIndex = nextIndex;
            renderCombatPanel();
            D.combat._lastAnimatedLogIdx = clLastPlayerLogIdx;
            triggerCombatAnimations();
        }, 1800);
    }
} else {
    saveTargetRectForAnim();
    renderCombatPanel();
    triggerCombatAnimations();
}

  function onCrawlerDefeated() {
    if (!D.crawler) return;
    D.crawler.defeated = true;
    D.crawler.active = false;
    D.crawler.encountered = false;
    D.crawler.chaseTurnsLeft = 0;
    D.crawler.monster.currentHp = 0;
    log(`🏆 Against all odds, you bring down The Crawler!`, 'log-boss');
    apiFetch('POST', '/game/dungeon/crawler-event', { event: 'defeat' }).catch(() => {});
    D.combat = null;
    D._combatPrefetch = null;
    saveState();
    saveProgressToDB();
    renderDungeonView();
  }
}

function onRoomCleared(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room) return;

    const monsters = Array.isArray(room.monsters) ? room.monsters : [];
    const defeatedMonsters = monsters.reduce((acc, monster) => {
        const key = monster.id || monster.name;
        if (!key) return acc;
        const existing = acc.find(entry => entry.id === key);
        if (existing) existing.count += 1;
        else acc.push({ id: monster.id || monster.name, name: monster.name || monster.id, count: 1 });
        return acc;
    }, []);

    // Mark all monsters as killed
    monsters.forEach(m => {
        m.lastKilled = Date.now();
        m.currentHp = 0;
    });

    // Clear evaded flag if it was set
    room.monstersEvaded = false;

    // Mark room as cleared on server FIRST to prevent double loot
    apiFetch('POST', '/game/dungeon/room-clear', { floor: D.floor, roomIndex: roomIdx, floorRunId: D.floorRunId })
        .then(res => {
            // res.cleared means server says already cleared — no reward
            if (res && res.cleared) {
                const extra = res.serverError && res.error ? ` (${String(res.error).slice(0, 120)})` : '';
                log(`⚠️ Room already cleared — no loot gained.${extra}`, 'log-warning');
                room.monstersCleared = Date.now(); // sync local state
                D.combat = null;
                D._combatPrefetch = null;
                saveState();
                saveProgressToDB();
                renderDungeonView();
                return;
            }

            // Server confirmed this is the first clear — grant loot
            let totalGold = 0;
            for (const monster of monsters) {
                const loot = rollMinorLoot(D.activeDungeon);
                if (loot.type === 'gold') totalGold += loot.amount;
                else applyLoot(loot);
            }
            if (totalGold > 0) applyLoot({ type: 'gold', amount: totalGold });

            if (defeatedMonsters.length) {
                apiFetch('POST', '/game/dungeon/monster-defeated', { monsters: defeatedMonsters })
                    .catch(e => console.error('Failed to sync monster defeats:', e));
            }

            apiFetch('POST', '/game/dungeon/release-room', { roomId: room.id, cleared: true })
                .catch(e => console.error('Failed to release room:', e));

            D.combat = null;
            D._combatPrefetch = null;
            saveState();
            saveProgressToDB();
            renderDungeonView();
        })
        .catch(e => {
            // Network error or server rejection — do NOT grant loot
            console.error('Failed to mark room cleared:', e);
            log(`⚠️ Server error confirming room clear. No loot granted. Try reconnecting.`, 'log-warning');
            D.combat = null;
            D._combatPrefetch = null;
            saveState();
            saveProgressToDB();
            renderDungeonView();
        });
}

function tryRun(roomIdx) {
    if (!D.combat) return;
    const pushCombatLog = (actor, text) => {
        if (!D.combat) return;
        if (!Array.isArray(D.combat.roundLog)) D.combat.roundLog = [];
        D.combat.roundLog.push({ actor, text });
    };

    // If we've already "successfully escaped", require an explicit decision.
    if (D.combat.escapeReady) {
        renderCombatPanel();
        return;
    }

    pushCombatLog('player', `💨 You attempt to flee...`);

    // Server-authoritative fleeing (Crawler uses its own endpoint; others use unified endpoint).
    if (D.combat.serverAuth && D.combat.isCrawler) {
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            pushCombatLog('monster', `⚠️ Still connecting to server combat...`);
            renderCombatPanel();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        apiFetch('POST', '/game/dungeon/crawler-combat/act', { combatId: D.combat.combatId, action: 'run', turnNonce: D.combat.turnNonce })
            .then(res => {
                if (!D.combat || !D.combat.isCrawler) return;
                if (!res || !res.success) throw new Error(res?.error || 'Crawler flee failed.');
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (res.monster) {
                    const m = { ...D.combat.monsters[0], ...res.monster };
                    m.currentHp = Number(res.monster.currentHp ?? m.currentHp ?? m.maxHp ?? m.hp);
                    m.maxHp = Number(res.monster.maxHp ?? m.maxHp ?? m.hp);
                    D.combat.monsters = [m];
                    if (D.crawler && D.crawler.monster) {
                        D.crawler.monster.currentHp = m.currentHp;
                        D.crawler.monster.maxHp = m.maxHp;
                    }
                }
                const c = getChar();
                if (c && res.player && typeof res.player.hp === 'number') {
                    c.hp_current = res.player.hp;
                    c.hp = res.player.hp;
                    if (typeof renderTopBar === 'function') renderTopBar();
                }
                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }
                if (res.escapeReady) {
                    D.combat.escapeReady = true;
                    const room = D.rooms && D.rooms[roomIdx];
                    if (room) room.monstersEvaded = true;
                }
                D.combat.resolving = false;
                saveState();
                saveProgressToDB();
                saveTargetRectForAnim();
                renderCombatPanel();
                triggerCombatAnimations();
            })
            .catch(err => {
                console.error('Crawler flee action failed:', err);
                if (D.combat && D.combat.isCrawler) {
                    D.combat.resolving = false;
                    pushCombatLog('monster', `⚠️ ${String(err.message || err)}`);
                    renderCombatPanel();
                }
            });
        return;
    }

    if (D.combat.serverAuth) {
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            pushCombatLog('monster', `⚠️ Still connecting to server combat...`);
            renderCombatPanel();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        apiFetch('POST', '/game/dungeon/combat/act', { combatId: D.combat.combatId, action: 'run', turnNonce: D.combat.turnNonce })
            .then(res => {
                if (!D.combat) return;
                if (!res || !res.success) throw new Error(res?.error || 'Flee failed.');
                if (res?.debug) console.debug('[dungeon combat act]', res.debug);
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (Array.isArray(res.monsters) && res.monsters.length) {
                    D.combat.monsters = res.monsters.map(m => ({
                        ...m,
                        currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                        maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                    }));
                    D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
                }
                const c = getChar();
                if (c && res.player && typeof res.player.hp === 'number') {
                    c.hp_current = res.player.hp;
                    c.hp = res.player.hp;
                    if (typeof renderTopBar === 'function') renderTopBar();
                }
                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }
                if (res.escapeReady) {
                    D.combat.escapeReady = true;
                    const room = D.rooms && D.rooms[roomIdx];
                    if (room) room.monstersEvaded = true;
                }
                D.combat.resolving = false;
                saveState();
                saveProgressToDB();
                saveTargetRectForAnim();
                renderCombatPanel();
                triggerCombatAnimations();
            })
            .catch(err => {
                console.error('Server flee failed:', err);
                if (D.combat) {
                    D.combat.resolving = false;
                    pushCombatLog('monster', `⚠️ ${String(err.message || err)}`);
                    renderCombatPanel();
                }
            });
        return;
    }

    if (chance(RUN_ESCAPE_CHANCE)) {
        pushCombatLog('player', `✅ Escape successful. You can leave now, or keep fighting.`);

        // Mark the room as evaded so travel is allowed even if multiple monsters are alive.
        // (Reset in travelToRoom once you actually leave.)
        const room = D.rooms && D.rooms[roomIdx];
        if (room) room.monstersEvaded = true;

        if (D.combat && D.combat.isCrawler && D.crawler) {
            D.crawler.active = true;
            D.crawler.roomIdx = roomIdx;
        }

        // Keep the combat modal open: user must choose "Get Out" (or keep fighting).
        D.combat.escapeReady = true;
        renderCombatPanel();
    } else {
        pushCombatLog('monster', `⚠️ Escape failed! The enemies strike!`);
        const c = getChar();
        if (c && D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
            const pStats = calcPlayerStats();
            let totalDamage = 0;
            
            for (let i = 0; i < D.combat.monsters.length; i++) {
                const m = D.combat.monsters[i];
                if (m.currentHp > 0) {
                    const mDmg = Math.max(1, Math.floor(m.atk - pStats.def * 0.5 + rand(-2, 2)));
                    totalDamage += mDmg;
                    pushCombatLog('monster', `💥 ${m.name} hits you for ${mDmg}!`);
                }
            }
            
            // hp_current can be 0; don't treat it as "missing".
            c.hp_current = Math.max(0, Number((c.hp_current ?? c.hp ?? 100)) - totalDamage);
            c.hp = c.hp_current;
            pushCombatLog('player', `💔 You take ${totalDamage} damage.`);
            
            if (c.hp_current <= 0) {
                onPlayerDeath();
                return;
            }
            renderCombatPanel();
        }
    }
}

function confirmEscape(roomIdx) {
    if (!D.combat) return;

    // Release room entry (regular rooms only; crawler escape keeps chase logic intact).
    if (!(D.combat && D.combat.isCrawler)) {
        D._exitingRoom = apiFetch('POST', '/game/dungeon/room-exit', { floor: D.floor, roomIndex: roomIdx })
            .catch(e => console.error('Failed to exit room:', e));
    }

    D.combat = null;
    D._combatPrefetch = null;
    saveState();
    saveProgressToDB();
    renderDungeonView();
}

function cancelEscape() {
    if (!D.combat) return;
    D.combat.escapeReady = false;
    if (!Array.isArray(D.combat.roundLog)) D.combat.roundLog = [];
    D.combat.roundLog.push({ actor: 'player', text: `⚔️ You decide to keep fighting.` });
    renderCombatPanel();
}

function tryStealFromPlayer(roomIdx, monsterIndex) {
    const c = getChar();
    if (!c || !c.inventory || c.inventory.length === 0) return;
    const invItems = c.inventory.filter(i => !i.equipped);
    if (invItems.length === 0) return;
    const stolen = invItems[rand(0, invItems.length-1)];
    c.inventory = c.inventory.filter(i => i !== stolen);
    D.combat.monsters[monsterIndex].stolenItems.push(stolen);
    log(`💰 ${D.combat.monsters[monsterIndex].name} stole your ${stolen.name}!`, 'log-danger');
}

  function onMonsterDefeated(roomIdx) {
    const room = D.rooms[roomIdx];
    room.monster.lastKilled = Date.now();

    let recovered = [];
    if (room.monster.stolenItems && room.monster.stolenItems.length > 0) {
      recovered = room.monster.stolenItems;
      const c = getChar();
      if (c) {
        if (!c.inventory) c.inventory = [];
        c.inventory.push(...recovered);
      }
      room.monster.stolenItems = [];
      log(`🎒 Recovered stolen items: ${recovered.map(i=>i.name).join(', ')}!`, 'log-success');
    }

    const loot = rollMinorLoot(D.activeDungeon);
    applyLoot(loot);

    log(`✅ ${room.monster.name} defeated!`, 'log-success');
    D.combat = null;
    saveState();
    saveProgressToDB();
    renderDungeonView();
  }

function onPlayerDeath() {
    log(`💀 You have been slain! Progress saved.`, 'log-danger');
    if (D.combat && (D.combat.isCrawler || D.combat.monsters?.some(m => m.isCrawler))) {
        apiFetch('POST', '/game/dungeon/crawler-event', { event: 'death' }).catch(() => {});
    }
    const c = getChar();
    if (c && c.hp_current !== undefined) c.hp = c.hp_current;

    // Ensure we never keep the page scroll-locked after combat ends (death returns to dungeon UI).
    document.body.classList.remove('modal-lock');
    document.body.classList.remove('combat-lock');
    
    // Play player card dissolve before cleanup
    const pCard = document.querySelector('.combat-fighters > .fighter-card:first-child');
    if (pCard) pixelDissolveCard(pCard);

    setTimeout(() => {
        // Release room entry and lock
        if (D.combat && D.combat.roomIdx !== undefined) {
            apiFetch('POST', '/game/dungeon/room-exit', { floor: D.floor, roomIndex: D.combat.roomIdx })
                .catch(e => console.error('Failed to exit room:', e));
        }
        stopLockRefresh();
        
        D.savedProgress['tower'] = {
          floor: D.floor,
          pos: D.playerPos,
          rooms: D.rooms,
          explored: [...D.exploredRooms],
          crawler: D.crawler,
          floorRunId: D.floorRunId,
        };
        D.combat = null;
        D._combatPrefetch = null;
        D.activeDungeon = null;
        global.__dungeonActive = false;
        saveState();
        saveProgressToDB();
        setTimeout(() => renderDungeonList(), 1500);
    }, 800);
}

async function fightBoss(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.isBoss) return;
    
    // Check tokens before attempting boss fight
    const tokensNeeded = 50;
    if ((D.tokens || 0) < tokensNeeded) {
        log(`⚠️ Need ${tokensNeeded} tokens to challenge the boss. You have ${D.tokens || 0}.`, 'log-warning');
        return;
    }

    // Prevent entering boss combat at 0 HP (server rejects; client should show a clear modal instead).
    const c0 = getChar();
    const hp0 = Number(c0?.hp_current ?? c0?.hp ?? c0?.hp_max ?? 0);
    if (Number.isFinite(hp0) && hp0 <= 0) {
        const msg = 'You are at 0 HP. Leave the dungeon to recover before challenging the boss.';
        if (typeof openGameDialog === 'function') {
            await openGameDialog({ title: 'Out of HP', message: msg, confirmLabel: 'OK', showCancel: false });
        } else {
            alert(msg);
        }
        return;
    }

    // Boss fights are server-authoritative (includes token gate + loot).
    const _def = getDungeonDef();
    const boss = _def.boss;
    D.combat = {
        roomIdx,
        monsters: [{
            ...boss,
            currentHp: boss.hp,
            maxHp: boss.hp,
            stolenItems: [],
            isBoss: true,
        }],
        currentMonsterIndex: 0,
        roundLog: [],
        serverAuth: true,
        resolving: true,
        combatId: null,
        turnNonce: 0,
        manaPoints: 0,
        manaCap: 100,
    };
    renderCombatPanel();

    Promise.resolve(refreshCharacter?.()).catch(() => {}).finally(() => {
    apiFetch('POST', '/game/dungeon/combat/start', { floor: D.floor, roomIndex: roomIdx, kind: 'boss', floorRunId: D.floorRunId })
        .then(res => {
            if (!D.combat || D.combat.roomIdx !== roomIdx) return;
            if (!res || !res.success) throw new Error(res?.error || 'Failed to start boss combat.');
            D.combat.combatId = res.combatId;
            D.combat.turnNonce = Number(res.turnNonce || 0);
            if (Array.isArray(res.monsters) && res.monsters.length) {
                D.combat.monsters = res.monsters.map(m => ({
                    ...m,
                    currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                    maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                }));
                D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
            }
            if (typeof res.manaPoints === 'number') D.combat.manaPoints = res.manaPoints;
            if (typeof res.manaCap === 'number') D.combat.manaCap = res.manaCap;
            if (typeof res.tokens === 'number') {
                D.tokens = res.tokens;
                updateTokenDisplay();
            }
            if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
            D.combat.resolving = false;
            saveState();
            saveProgressToDB();
            renderCombatPanel();
        })
        .catch(err => {
            console.error('Failed to start boss combat:', err);
            if (D.combat && D.combat.roomIdx === roomIdx) {
                D.combat.resolving = false;
                D.combat.roundLog.push({ actor: 'monster', text: `⚠️ ${String(err.message || err)}` });
                renderCombatPanel();
            }
        });
    });
}

function onBossDefeated() {
  const dungeonDef = getDungeonDef(D.activeDungeon);
  const boss = dungeonDef.boss;
  const loot = rollBossLoot(boss);

  log(`🏆 FLOOR ${D.floor} CLEARED! ${boss.name} vanquished!`, 'log-boss');
  log(`💰 Loot: ${loot.gold} gold | 💎 ${loot.gems} gems | ✨ ${loot.premium.name} (${loot.premium.days} days)`, 'log-success');

  const c = getChar();
  if (c) {
    c.gold = (c.gold||0) + loot.gold;
    c.gems = (c.gems||0) + loot.gems;
  }

  D.floor++;
  if (D.floor > (D.highestFloor||1)) D.highestFloor = D.floor;
  
  // Send to backend with proper premium data
  apiFetch('POST', '/game/dungeon/boss-defeated', {
    newFloor: D.floor,
    highestFloor: D.highestFloor,
    tokens: D.tokens,
    bossId: boss.id || boss.name,
    bossName: boss.name,
    loot: {
      gold: loot.gold,
      gems: loot.gems,
      premium: loot.premium  // Send full premium object
    }
  }).then(() => {
    refreshCharacter();
  }).catch(e => console.error('Failed to save boss defeat:', e));
  
  delete D.savedProgress['tower'];
  D.rooms = normalizeMiniBossRooms(generateFloor(D.activeDungeon, D.floor), D.floor);
  D.playerPos = D.rooms.findIndex(r => r.isStart);
  D.exploredRooms = new Set([D.playerPos]);
  D.crawler = spawnCrawlerForCurrentFloor();
  D.floorRunId = createFloorRunId();
  D.combat = null;
  D._combatPrefetch = null;
  saveState();
  saveProgressToDB();

  showBossVictoryModal(boss, loot);
}

function renderDungeonTab() {
    const container = document.getElementById('tab-dungeon');
    if (!container) return;
    loadState();
    
    if (character) {
        // Load persisted dungeon data, then rerender the list so resume works reliably.
        loadDungeonDataFromDB().then(() => {
            // Move HTML rendering INSIDE here, after data is loaded
            container.innerHTML = `
                <div class="dungeon-wrapper">
                    <div class="dungeon-topbar">
                        <div class="dungeon-title-wrap">
                            <span class="dungeon-title-icon">⚔️</span>
                            <div>
                                <div class="dungeon-title-text">Dungeon Raids</div>
                                <div class="dungeon-title-sub">Delve deep. Conquer darkness. Claim glory.</div>
                            </div>
                        </div>
                        <div class="dungeon-token-wrap" style="display: flex; gap: 12px;">
                            <div class="dungeon-token-pill">
                                <span class="dungeon-token-icon">🗝️</span>
                                <span>Boss Tokens:</span>
                                <span id="dungeon-token-count" class="dungeon-token-num">${D.tokens}</span>
                            </div>
                            <div class="dungeon-token-pill" style="background: rgba(241,196,15,0.1); border-color: rgba(241,196,15,0.3);">
                                <span class="dungeon-token-icon">💰</span>
                                <span>Dungeon Gold:</span>
                                <span id="dungeon-gold-count" class="dungeon-token-num">${D.dungeonGold || 0}</span>
                            </div>
                        </div>
                        <div class="dungeon-token-hint">20 MP spent = 1 Token · ${TOKENS_PER_RUN} Tokens per boss</div>
                    </div>
                    <div id="dungeon-main-area"></div>
                </div>
            `;
            
            if (!D.activeDungeon) {
                renderDungeonList();
            } else {
                if (D.combat) renderCombatPanel();
                else renderDungeonView();
            }
            updateDungeonGoldDisplay();
            renderLog();
        });
    } else {
        // If no character, just render basic HTML
        container.innerHTML = `
            <div class="dungeon-wrapper">
                <div class="dungeon-topbar">
                    <div class="dungeon-title-wrap">
                        <span class="dungeon-title-icon">⚔️</span>
                        <div>
                            <div class="dungeon-title-text">Dungeon Raids</div>
                            <div class="dungeon-title-sub">Delve deep. Conquer darkness. Claim glory.</div>
                        </div>
                    </div>
                    <div class="dungeon-token-wrap" style="display: flex; gap: 12px;">
                        <div class="dungeon-token-pill">
                            <span class="dungeon-token-icon">🗝️</span>
                            <span>Boss Tokens:</span>
                            <span id="dungeon-token-count" class="dungeon-token-num">${D.tokens}</span>
                        </div>
                        <div class="dungeon-token-pill" style="background: rgba(241,196,15,0.1); border-color: rgba(241,196,15,0.3);">
                            <span class="dungeon-token-icon">💰</span>
                            <span>Dungeon Gold:</span>
                            <span id="dungeon-gold-count" class="dungeon-token-num">${D.dungeonGold || 0}</span>
                        </div>
                    </div>
                    <div class="dungeon-token-hint">20 MP spent = 1 Token · ${TOKENS_PER_RUN} Tokens per boss</div>
                </div>
                <div id="dungeon-main-area"></div>
            </div>
        `;
        renderDungeonList();
        renderLog();
    }
}

function formatRaidDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
}

function renderDungeonRaidHub(guildData) {
    const reputation = Number(guildData.guildReputation || 0);
    const allRaids = Array.isArray(guildData.raids) ? guildData.raids : [];
    const highestFloor = Math.max(1, Number(guildData.highestFloor || 1));
    const now = Math.floor(Date.now() / 1000);
    const raidCooldownUntil = Number(guildData.raidCooldownUntil || 0);
    const cooldownLeft = raidCooldownUntil > now ? (raidCooldownUntil - now) : 0;
    const apprenticeReq = GUILD_RANKS.find(r => r.name === 'Apprentice')?.reputationNeeded || 10;
    const canCreateRaid = reputation >= apprenticeReq;
    const isRaidLocked = cooldownLeft > 0;
    // Commitment is character-scoped (not account-scoped), so switching characters can run parallel raids.
    // Commitment is character-scoped (not account-scoped), so switching characters can run parallel raids.
    const existingRaid = allRaids.find(raid => raid.status === 'forming' && (raid.isLeader || raid.isMember));
    const hasRaidCommitment = !!existingRaid;
    const createLocked = isRaidLocked || hasRaidCommitment;
    const raids = isRaidLocked ? [] : allRaids;
    const raidFloorOptions = Array.from({ length: highestFloor }, (_, idx) => idx + 1)
        .map(floor => `<option value="${floor}">Floor ${floor}</option>`)
        .join('');

    const raidCards = raids.length ? raids.map(raid => {
        const members = Array.isArray(raid.members) ? raid.members : [];
        const membersHtml = members.map(member => `
            <span class="cost-item ${member.isLeader ? 'raid-member-leader' : ''}">
                ${member.isLeader ? 'Leader' : 'Member'} · ${member.name} Lv.${member.level}
            </span>
        `).join('');

        const rewardBits = [];
        if (raid.reward?.gold) rewardBits.push(`${Number(raid.reward.gold).toLocaleString()} Gold`);
        if (raid.reward?.gems) rewardBits.push(`${Number(raid.reward.gems).toLocaleString()} Gems`);
        if (raid.reward?.item?.itemData?.name) rewardBits.push(raid.reward.item.itemData.name);

        const canJoin = raid.status === 'forming' && !raid.isMember && !raid.isAccountMember && raid.memberCount < 6;
        const canStart = raid.status === 'forming' && raid.isLeader;
        const canClaim = raid.status === 'completed' && raid.isMember && !raid.rewardClaimed && raid.reward;
        const autoStartLabel = raid.autoStartMode === 'full'
            ? 'Auto-start when full'
            : raid.autoStartMode === 'scheduled'
                ? `Scheduled: ${formatRaidTime(raid.scheduledStartAt)}`
                : 'Manual start';
        const resultLog = Array.isArray(raid.resultLog) && raid.resultLog.length
            ? `<div class="raid-result-log">${raid.resultLog.map(line => `<div class="raid-result-line">${line}</div>`).join('')}</div>`
            : '';

        return `
            <div class="exchange-card exchange-available raid-card raid-status-${raid.status}">
                <div class="exchange-icon raid-card-icon">Raid</div>
                <div class="exchange-info">
                    <div class="exchange-name">Floor ${raid.floor} Raid: ${raid.bossName}</div>
                    <div class="exchange-desc">Up to six players combine into one strike against a floor-scaled raid boss.</div>
                    <div class="exchange-cost">
                        <span class="cost-item">Status: ${raid.status}</span>
                        <span class="cost-item">${autoStartLabel}</span>
                        <span class="cost-item">Boss HP ${Number(raid.bossHp || 0).toLocaleString()}</span>
                    </div>
                    <div class="exchange-cost">${membersHtml}</div>
                    ${raid.resultSummary ? `<div class="exchange-desc raid-summary">${raid.resultSummary}</div>` : ''}
                    ${rewardBits.length ? `<div class="exchange-reward"><span class="reward-item">Rewards: ${rewardBits.join(' · ')}</span></div>` : ''}
                    ${resultLog}
                    ${canJoin ? `<button class="exchange-btn" ${actionAttrs('joinGuildRaid', raid.id)}>Join Raid</button>` : ''}
                    ${raid.status === 'forming' && raid.isAccountMember && !raid.isMember ? `<div class="exchange-desc raid-summary" style="margin-top:8px;color:var(--text-dim)">Another character on your account is already in this raid.</div>` : ''}
                    ${canStart ? `<button class="exchange-btn" ${actionAttrs('startGuildRaid', raid.id)}>Start Raid</button>` : ''}
                    ${canClaim ? `<button class="exchange-btn" ${actionAttrs('claimGuildRaidReward', raid.id)}>Claim Reward</button>` : ''}
                    ${raid.status === 'forming' && raid.isMember && !raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('leaveGuildRaid', raid.id)}>Leave Raid</button>` : ''}
                    ${raid.status === 'forming' && raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('deleteGuildRaid', raid.id)}>Delete Raid</button>` : ''}
                </div>
            </div>
        `;
    }).join('') : `
        <div class="exchange-card exchange-unavailable">
            <div class="exchange-info">
                <div class="exchange-name">No active raids yet</div>
                <div class="exchange-desc">When an Apprentice posts a raid, it will appear here for everyone to join.</div>
            </div>
        </div>
    `;

    return `
        <div class="dungeon-raid-hub-head">
            <div class="dungeon-raid-hub-title">Raids</div>
            <div class="dungeon-raid-hub-subtitle">Apprentice-ranked players can open raids for anyone to join.</div>
        </div>
        ${cooldownLeft > 0 ? `<div class="rep-bar-text" style="margin-bottom:10px">Raid recovery active: ${formatRaidDuration(cooldownLeft)} remaining.</div>` : ''}
        ${canCreateRaid ? `
            <div class="exchange-card exchange-available raid-create-card">
                <div class="exchange-icon raid-card-icon">Raid</div>
                <div class="exchange-info">
                    <div class="exchange-name">Create a Raid</div>
                    <div class="exchange-desc">Choose any floor up to your highest cleared dungeon floor. You can start manually, when full, or on a schedule.</div>
                    <div class="raid-create-grid">
                        <label class="raid-field">
                            <span>Floor</span>
                            <select id="guild-raid-floor" class="raid-input">${raidFloorOptions}</select>
                        </label>
                        <label class="raid-field">
                            <span>Start mode</span>
                            <select id="guild-raid-mode" class="raid-input">
                                <option value="manual">Manual</option>
                                <option value="full">Auto-start when full</option>
                                <option value="scheduled">Scheduled</option>
                            </select>
                        </label>
                        <label class="raid-field raid-field-wide">
                            <span>Scheduled start</span>
                            <input id="guild-raid-scheduled-at" class="raid-input" type="datetime-local">
                        </label>
                    </div>
                    <button class="exchange-btn" ${actionAttrs('createGuildRaid')}>Create Raid</button>
                </div>
            </div>
        ` : `
            <div class="exchange-card exchange-unavailable">
                <div class="exchange-info">
                    <div class="exchange-name">Raids unlock at Apprentice</div>
                    <div class="exchange-desc">Reach ${apprenticeReq} guild reputation to create raids. You can still join raids listed below.</div>
                </div>
            </div>
        `}
        <div class="exchanges-grid raids-grid">${raidCards}</div>
    `;
}

function refreshRaidUi() {
    const raidHub = document.getElementById('dungeon-raid-hub');
    if (raidHub) {
        renderDungeonList();
    } else {
        renderGuild();
    }
}

function createGuildRaid() {
    const floor = Number(document.getElementById('guild-raid-floor')?.value || 1);
    const autoStartMode = String(document.getElementById('guild-raid-mode')?.value || 'manual');
    const scheduledStartAt = autoStartMode === 'scheduled' ? readGuildRaidScheduleTs() : 0;
    apiFetch('POST', '/game/dungeon/guild/raid/create', { floor, autoStartMode, scheduledStartAt })
        .then(response => {
            if (response?.success) {
                log(response.message || 'Raid created.', 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid create failed:', e));
}

function joinGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/join', { raidId })
        .then(response => {
            if (response?.success) {
                log(response.message || 'Joined raid.', 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid join failed:', e));
}

function leaveGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/leave', { raidId })
        .then(response => {
            if (response && response.success) {
                log(response.message || 'Left raid.', 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid leave failed:', e));
}

function deleteGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/delete', { raidId })
        .then(response => {
            if (response && response.success) {
                log(response.message || 'Raid deleted.', 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid delete failed:', e));
}

function startGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/start', { raidId })
        .then(response => {
            if (response?.success) {
                log(response.message || 'Raid battle resolved.', 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid start failed:', e));
}

function claimGuildRaidReward(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/claim', { raidId })
        .then(response => {
            if (response?.success) {
                log(response.message || 'Raid reward claimed.', 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid reward claim failed:', e));
}

function renderDungeonRaidHub(guildData) {
    const reputation = Number(guildData.guildReputation || 0);
    const allRaids = Array.isArray(guildData.raids) ? guildData.raids : [];
    const highestFloor = Math.max(1, Number(guildData.highestFloor || 1));
    const now = Math.floor(Date.now() / 1000);
    const raidCooldownUntil = Number(guildData.raidCooldownUntil || 0);
    const cooldownLeft = raidCooldownUntil > now ? (raidCooldownUntil - now) : 0;
    const apprenticeReq = GUILD_RANKS.find(r => r.name === 'Apprentice')?.reputationNeeded || 10;
    const canCreateRaid = reputation >= apprenticeReq;
    const isRaidLocked = cooldownLeft > 0;
    // Commitment is character-scoped (not account-scoped), so switching characters can run parallel raids.
    const existingRaid = allRaids.find(raid => raid.status === 'forming' && (raid.isLeader || raid.isMember));
    const hasRaidCommitment = !!existingRaid;
    const createLocked = isRaidLocked || hasRaidCommitment;
    const raids = isRaidLocked ? [] : allRaids;
    const raidFloorOptions = Array.from({ length: highestFloor }, (_, idx) => idx + 1)
        .map(floor => `<option value="${floor}">Floor ${floor}</option>`)
        .join('');

    const raidCards = raids.length ? raids.map(raid => {
        const members = Array.isArray(raid.members) ? raid.members : [];
        const membersHtml = members.map(member => `
            <span class="cost-item ${member.isLeader ? 'raid-member-leader' : ''}">
                ${member.isLeader ? 'Leader' : 'Member'} В· ${member.name} Lv.${member.level}
            </span>
        `).join('');
        const canJoin = raid.status === 'forming' && !raid.isMember && !raid.isAccountMember && raid.memberCount < 6;
        const canStart = raid.status === 'forming' && raid.isLeader;
        const autoStartLabel = raid.autoStartPlayers > 0
            ? `Auto-start at ${raid.autoStartPlayers} player${raid.autoStartPlayers === 1 ? '' : 's'}`
            : 'Manual start';
        const mercenaryCards = raid.isLeader && Array.isArray(raid.mercenaryPool) && raid.mercenaryPool.length
            ? `
                <div class="raid-mercenary-head">Recruit Mercenaries</div>
                <div class="raid-mercenary-sub">Spend 1 gem to add a dungeon recruit to this raid. They count toward party size and strength.</div>
                <div class="raid-mercenary-board">
                    ${raid.mercenaryPool.map(merc => `
                        <div class="raid-mercenary-card ${merc.recruited ? 'is-recruited' : ''}">
                            <div class="raid-mercenary-name">${merc.name}</div>
                            <div class="raid-mercenary-stats">
                                HP ${merc.stats.hp} · ATK ${merc.stats.dmgMin}-${merc.stats.dmgMax} · DEF ${merc.stats.defense}
                            </div>
                            <div class="raid-mercenary-stats">
                                AGI ${merc.stats.agility} · MAG ${merc.stats.magic} · HIT ${merc.stats.hitChance}% · CRIT ${merc.stats.critChance}%
                            </div>
                            ${merc.recruited
                                ? `<div class="raid-mercenary-status">Recruited</div>`
                                : `<button class="exchange-btn raid-mercenary-btn" ${actionAttrs('recruitGuildRaidMercenary', raid.id, merc.id)}>Recruit · 1 Gem</button>`}
                        </div>
                    `).join('')}
                </div>
            `
            : '';

        return `
            <div class="exchange-card exchange-available raid-card raid-status-${raid.status}">
                <div class="exchange-icon raid-card-icon">Raid</div>
                <div class="exchange-info">
                    <div class="exchange-name">Floor ${raid.floor} Raid: ${raid.bossName}</div>
                    <div class="exchange-desc">The whole party strikes as one. Raid attacks always connect and do not use zone setups.</div>
                    <div class="exchange-cost">
                        <span class="cost-item">Status: ${raid.status}</span>
                        <span class="cost-item">${autoStartLabel}</span>
                        <span class="cost-item">Boss HP ${Number(raid.bossHp || 0).toLocaleString()}</span>
                    </div>
                    <div class="exchange-cost">${membersHtml}</div>
                    <div class="exchange-desc raid-summary">Raid results and rewards are sent to your inbox after completion.</div>
                    ${raid.isLeader ? `
                        <div class="raid-setting-row">
                            <select id="raid-start-threshold-${raid.id}" class="raid-input raid-inline-input">
                                <option value="0" ${raid.autoStartPlayers === 0 ? 'selected' : ''}>Manual start</option>
                                <option value="1" ${raid.autoStartPlayers === 1 ? 'selected' : ''}>Auto at 1</option>
                                <option value="2" ${raid.autoStartPlayers === 2 ? 'selected' : ''}>Auto at 2</option>
                                <option value="3" ${raid.autoStartPlayers === 3 ? 'selected' : ''}>Auto at 3</option>
                                <option value="4" ${raid.autoStartPlayers === 4 ? 'selected' : ''}>Auto at 4</option>
                                <option value="5" ${raid.autoStartPlayers === 5 ? 'selected' : ''}>Auto at 5</option>
                                <option value="6" ${raid.autoStartPlayers === 6 ? 'selected' : ''}>Auto at 6</option>
                            </select>
                            <button class="exchange-btn raid-settings-btn" ${actionAttrs('updateGuildRaidSettings', raid.id)}>Update Start</button>
                        </div>
                        <div class="raid-setting-row" style="margin-top:6px;gap:12px;display:flex;flex-wrap:wrap">
                            <label style="flex:1;min-width:120px">
                                <span style="font-size:0.7rem;color:var(--text-dim)">Min Level: <span id="raid-min-level-val-${raid.id}">${raid.minLevel || 1}</span></span>
                                <input type="range" id="raid-min-level-${raid.id}" class="raid-input raid-inline-input" min="1" max="999" value="${raid.minLevel || 1}">
                            </label>
                            <label style="flex:1;min-width:120px">
                                <span style="font-size:0.7rem;color:var(--text-dim)">Max Level: <span id="raid-max-level-val-${raid.id}">${raid.maxLevel || 999}</span></span>
                                <input type="range" id="raid-max-level-${raid.id}" class="raid-input raid-inline-input" min="1" max="999" value="${raid.maxLevel || 999}">
                            </label>
                        </div>
                    ` : ''}
                    ${canJoin ? `<button class="exchange-btn" ${actionAttrs('joinGuildRaid', raid.id)}>Join Raid</button>` : ''}
                    ${raid.status === 'forming' && raid.isAccountMember && !raid.isMember ? `<button class="exchange-btn" disabled title="Another character on your account is already in this raid.">Join Raid</button>` : ''}
                    ${raid.status === 'forming' && raid.isAccountMember && !raid.isMember ? `<div class="exchange-desc raid-summary" style="margin-top:8px;color:var(--text-dim)">Another character on your account is already in this raid.</div>` : ''}
                    ${canStart ? `<button class="exchange-btn" ${actionAttrs('startGuildRaid', raid.id)}>Start Raid</button>` : ''}
                    ${raid.status === 'forming' && raid.isMember && !raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('leaveGuildRaid', raid.id)}>Leave Raid</button>` : ''}
                    ${raid.status === 'forming' && raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('deleteGuildRaid', raid.id)}>Delete Raid</button>` : ''}
                    ${mercenaryCards}
                </div>
            </div>
        `;
    }).join('') : `
        <div class="exchange-card exchange-unavailable">
            <div class="exchange-info">
                <div class="exchange-name">No active raids yet</div>
                <div class="exchange-desc">When an Apprentice posts a raid, it will appear here for everyone to join.</div>
            </div>
        </div>
    `;

    return `
        <div class="dungeon-raid-hub-head">
            <div class="dungeon-raid-hub-title">Raids</div>
            <div class="dungeon-raid-hub-subtitle">Apprentice-ranked players can open raids for anyone to join. Finished raids are delivered through inbox reports.</div>
        </div>
        ${cooldownLeft > 0 ? `<div class="rep-bar-text" style="margin-bottom:10px">Raid recovery active: ${formatRaidDuration(cooldownLeft)} remaining.</div>` : ''}
        ${canCreateRaid ? `
            <div class="exchange-card exchange-available raid-create-card">
                <div class="exchange-icon raid-card-icon">Raid</div>
                <div class="exchange-info">
                    <div class="exchange-name">Create a Raid</div>
                    <div class="exchange-desc">${isRaidLocked
                        ? `Raid recovery is active. You can create or view raids again in ${formatRaidDuration(cooldownLeft)}.`
                        : hasRaidCommitment
                            ? `You are already committed to a forming raid${existingRaid?.isLeader ? ' as leader' : ''}. Finish or leave that raid before creating another one.`
                            : 'Choose any floor up to your highest cleared dungeon floor. Start manually or auto-launch when the party reaches the selected size.'}</div>
                    <div class="raid-create-grid">
                        <label class="raid-field">
                            <span>Floor</span>
                            <select id="guild-raid-floor" class="raid-input" ${createLocked ? 'disabled' : ''}>${raidFloorOptions}</select>
                        </label>
                        <label class="raid-field">
                            <span>Auto-start at</span>
                            <select id="guild-raid-autostart" class="raid-input" ${createLocked ? 'disabled' : ''}>
                                <option value="0">Manual only</option>
                                <option value="1">1 player</option>
                                <option value="2">2 players</option>
                                <option value="3">3 players</option>
                                <option value="4">4 players</option>
                                <option value="5">5 players</option>
                                <option value="6">6 players</option>
                            </select>
                        </label>
                        <label class="raid-field">
                            <span>Min Level: <span id="guild-raid-min-level-val">1</span></span>
                            <input type="range" id="guild-raid-min-level" class="raid-input" min="1" max="999" value="1" data-change-action="updateMinLevelSlider">
                        </label>
                        <label class="raid-field">
                            <span>Max Level: <span id="guild-raid-max-level-val">999</span></span>
                            <input type="range" id="guild-raid-max-level" class="raid-input" min="1" max="999" value="999" data-change-action="updateMaxLevelSlider">
                        </label>
                    </div>
                    <button class="exchange-btn ${createLocked ? 'disabled' : ''}" ${createLocked ? 'disabled' : actionAttrs('createGuildRaid')}>${isRaidLocked ? `Raid Ready In ${formatRaidDuration(cooldownLeft)}` : hasRaidCommitment ? 'Already In Raid' : 'Create Raid'}</button>
                </div>
            </div>
        ` : `
            <div class="exchange-card exchange-unavailable">
                <div class="exchange-info">
                    <div class="exchange-name">Raids unlock at Apprentice</div>
                    <div class="exchange-desc">Reach ${apprenticeReq} guild reputation to create raids. You can still join raids listed below.</div>
                </div>
            </div>
        `}
        ${isRaidLocked ? '' : `<div class="exchanges-grid raids-grid">${raidCards}</div>`}
    `;
}

function updateMinLevelSlider() {
    const val = document.getElementById('guild-raid-min-level')?.value;
    const display = document.getElementById('guild-raid-min-level-val');
    if (val && display) display.textContent = val;
}

function updateMaxLevelSlider() {
    const val = document.getElementById('guild-raid-max-level')?.value;
    const display = document.getElementById('guild-raid-max-level-val');
    if (val && display) display.textContent = val;
}

function createGuildRaid() {
    const floor = Number(document.getElementById('guild-raid-floor')?.value || 1);
    const autoStartPlayers = Number(document.getElementById('guild-raid-autostart')?.value || 0);
    const minLevel = Number(document.getElementById('guild-raid-min-level')?.value || 1);
    const maxLevel = Number(document.getElementById('guild-raid-max-level')?.value || 999);
    apiFetch('POST', '/game/dungeon/guild/raid/create', { floor, autoStartPlayers, minLevel, maxLevel })
        .then(response => {
            if (response?.success) {
                log(response.message || 'Raid created.', 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid create failed:', e));
}

function updateGuildRaidSettings(raidId) {
    const autoStartPlayers = Number(document.getElementById(`raid-start-threshold-${raidId}`)?.value || 0);
    const minLevel = Number(document.getElementById(`raid-min-level-${raidId}`)?.value || 1);
    const maxLevel = Number(document.getElementById(`raid-max-level-${raidId}`)?.value || 999);
    apiFetch('POST', '/game/dungeon/guild/raid/update-settings', { raidId, autoStartPlayers, minLevel, maxLevel })
        .then(response => {
            if (response?.success) {
                log(response.message || 'Raid settings updated.', 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid settings update failed:', e));
}

function recruitGuildRaidMercenary(raidId, recruitId) {
    apiFetch('POST', '/game/dungeon/guild/raid/recruit', { raidId, recruitId })
        .then(response => {
            if (response?.success) {
                log(response.message || 'Mercenary recruited.', 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid mercenary recruit failed:', e));
}

function renderDungeonList() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    D.activeDungeon = null;
    global.__dungeonActive = false;
    D._combatActive = false;

    // Safety: if combat ended unexpectedly (death/disconnect), ensure scrolling is restored.
    document.body.classList.remove('modal-lock');
    document.body.classList.remove('combat-lock');

    // Check BOTH saved progress AND database floor value
    const hasSave = !!D.savedProgress['tower'];
    const hasDatabaseProgress = (D.floor > 1) || (D.highestFloor > 1);
    const hasAnyProgress = hasSave || hasDatabaseProgress;
    
    // Use the highest floor from either saved progress or database
    const savedFloor = hasSave ? D.savedProgress['tower'].floor : 1;
    const curFloor = Math.max(savedFloor, D.floor || 1);
    const highFloor = D.highestFloor || 1;
    const nextBoss = getBossForFloor(curFloor);
    const nextTheme = getFloorTheme(curFloor);
    const nextLoot = nextBoss.loot;

const previewFloors = [0,1,2,3,4].map(offset => {
    const fl = curFloor + offset;
    const boss = getBossForFloor(fl);
    const t = getFloorTheme(fl);
    return `<div class="dungeon-floor-preview-card" style="--card-accent:${t.theme}">
        <div class="fp-banner">
            <img src="${boss.image}" alt="${boss.name}">
            <div class="fp-floor-badge">F${fl}</div>
        </div>
        <div class="fp-name">${boss.name.split(' ').slice(0,2).join(' ')}</div>
        <div class="fp-stats">
            <span>❤️${boss.hp}</span>
            <span>⚔️${boss.atk}</span>
            <span>🛡️${boss.def}</span>
        </div>
    </div>`;
}).join('');

    area.innerHTML = `
      <div class="dungeon-tower-entry" style="--dtheme:${nextTheme.theme};--dglow:${nextTheme.themeGlow}">
        <div class="dungeon-tower-top">
          <div class="dungeon-tower-icon">🗼</div>
          <div class="dungeon-tower-info">
            <div class="dungeon-card-name">The Endless Tower</div>
            <div class="dungeon-card-desc">An infinite tower of darkness. Clear each floor to ascend. Bosses grow stronger forever.</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:0.78rem;color:var(--dungeon-muted)">
              <span>🏆 Your best: <strong style="color:var(--dungeon-text)">Floor ${highFloor}</strong></span>
              <span>🗝️ <strong style="color:var(--dungeon-token)">${D.tokens}</strong> tokens · ${TOKENS_PER_RUN} per boss</span>
              ${hasSave ? `<span class="dungeon-save-badge">📌 Saved on Floor ${curFloor}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="dungeon-tower-next">
          <div style="font-size:0.7rem;color:var(--dungeon-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">
            Next boss — Floor ${curFloor}
          </div>
<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <img src="${nextBoss.image}" alt="${nextBoss.name}" style="width:64px;height:64px;object-fit:cover;border-radius:50%;border:2px solid ${nextTheme.theme}" data-error-hide="true" data-error-next-display="flex">
    <div style="display:none;font-size:2.5rem">${nextBoss.icon}</div>
    <div>
        <div style="font-family:'Cinzel',serif;color:#e2e8f0;font-size:1rem">${nextBoss.name}</div>
        <div style="font-size:0.75rem;color:var(--dungeon-muted);margin-top:2px">
            ❤️ ${nextBoss.hp} HP · ⚔️ ${nextBoss.atk} ATK · 🛡️ ${nextBoss.def} DEF
        </div>
        <div style="font-size:0.72rem;color:var(--dungeon-gold);margin-top:4px">
            Drops: 💰${nextLoot.gold[0]}–${nextLoot.gold[1]} · 💎${nextLoot.gems[0]}–${nextLoot.gems[1]} · ✨ Random Premium (${nextLoot.premiumDays[0]}–${nextLoot.premiumDays[1]} days)
        </div>
    </div>
</div>
        </div>

        <button class="dungeon-btn dungeon-btn-enter" style="width:100%;padding:12px;font-size:1rem;margin-top:16px"
            ${actionAttrs('dungeonEnter', 'tower')}>
        ${hasAnyProgress ? '🔮 Resume Delve (Floor '+curFloor+')' : '⚔️ Begin the Ascent'}
    </button>
      </div>

      <div class="dungeon-floor-history">
        <div style="font-size:0.7rem;color:var(--dungeon-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">📈 Upcoming floors</div>
        <div class="dungeon-floor-preview-row">${previewFloors}</div>
      </div>
      <div id="dungeon-raid-hub" class="dungeon-floor-history dungeon-raid-hub-shell">
        <div class="dungeon-raid-hub-head">
          <div class="dungeon-raid-hub-title">Raids</div>
          <div class="dungeon-raid-hub-subtitle">Loading guild raids...</div>
        </div>
      </div>
    `;

    apiFetch('GET', '/game/dungeon/guild')
      .then(guildData => {
        const raidHub = document.getElementById('dungeon-raid-hub');
        if (raidHub) raidHub.innerHTML = renderDungeonRaidHub(guildData);
        // Set level slider constraints after render
        const constraintMax = guildData.level ? Number(guildData.level) + Math.floor(Number(guildData.level) / 3) : 999;
        const maxSlider = document.getElementById('guild-raid-max-level');
        const minSlider = document.getElementById('guild-raid-min-level');
        if (maxSlider) { maxSlider.max = constraintMax; maxSlider.value = constraintMax; }
        if (minSlider) { minSlider.max = constraintMax; }
        const maxVal = document.getElementById('guild-raid-max-level-val');
        if (maxVal) maxVal.textContent = constraintMax;
      })
      .catch(e => {
        console.error('Failed to load raid hub:', e);
        const raidHub = document.getElementById('dungeon-raid-hub');
        if (raidHub) {
          raidHub.innerHTML = `
            <div class="dungeon-raid-hub-head">
              <div class="dungeon-raid-hub-title">Raids</div>
              <div class="dungeon-raid-hub-subtitle">Raid hub failed to load from the server.</div>
            </div>
          `;
        }
      });
  }

  function renderDungeonView() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    if (!_cachedElemental && getChar()?.elemental) fetchElemental();
    document.body.classList.remove('modal-lock');
    document.body.classList.add('combat-lock');

    const _oldOverlay = document.getElementById('dungeon-overlay');
    if (_oldOverlay) _oldOverlay.innerHTML = '';
    // Keep combat-lock on to prevent topbar/sidebar reappearance from shifting layout.
    // Only remove when leaving dungeon entirely.
    
    if (!D.rooms || D.rooms.length === 0) {
      console.error('No rooms generated');
      area.innerHTML = '<div class="error">Dungeon not generated. Please re-enter.</div>';
      return;
    }
    
    if (!D.rooms[D.playerPos]) {
      console.error('Invalid player position:', D.playerPos, 'Rooms:', D.rooms.length);
      const startIndex = D.rooms.findIndex(r => r.isStart);
      if (startIndex !== -1) D.playerPos = startIndex;
      else {
        area.innerHTML = '<div class="error">Invalid dungeon state. Please re-enter.</div>';
        return;
      }
    }
    
    const def = getDungeonDef(D.activeDungeon);
    if (!def) return;

    const currentRoom = D.rooms[D.playerPos];
    const visual = currentRoom.visual || (currentRoom.isBoss ? DUNGEON_VISUALS.boss : currentRoom.isStart ? DUNGEON_VISUALS.start : DUNGEON_VISUALS.corridor);
    const roomImage = visual.image || '';
    const roomDescription = visual.description || (currentRoom.isBoss ? "A massive chamber opens before you." : "You enter another room of the tower.");
    const latestLogMessage = D.dungeonLog && D.dungeonLog[0] ? D.dungeonLog[0].msg : '';
    const exploredCount = D.exploredRooms ? D.exploredRooms.size : 0;
    const totalRoomCount = Array.isArray(D.rooms) ? D.rooms.length : 0;
    const roomLabel = currentRoom.isBoss
      ? 'Boss Room'
      : currentRoom.isStart
        ? 'Entrance'
        : currentRoom.type === 'treasure'
          ? 'Treasure Room'
          : currentRoom.type === 'miniboss'
            ? 'Mini-Boss Chamber'
            : currentRoom.isArea || currentRoom.type === 'area'
              ? 'Open Chamber'
              : 'Corridor';

    const roomHasAliveMonsters =
      !!(currentRoom.monsters && currentRoom.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)));
    // On small screens, we need more vertical room for the enemy preview/actions. Hide bottom travel UI during encounters.
    const isEncounter = roomHasAliveMonsters && !currentRoom.isBoss && !currentRoom.monstersEvaded;

    area.innerHTML = `
      <div class="dungeon-game ${isEncounter ? 'dungeon-has-encounter' : ''}" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
        <div class="dungeon-game-screen">
          ${roomImage ? `
            <img class="dungeon-game-scene" src="${roomImage}" alt="Dungeon Scene" data-error-hide="true">
          ` : `<div class="dungeon-game-scene dungeon-game-scene-fallback"></div>`}
          <div class="dungeon-game-vignette"></div>

<div class="dungeon-hud-top">
  <div class="dungeon-hud-title">${def.icon} ${def.name}</div>
  <div class="dungeon-hud-floor">Floor ${D.floor}</div>
  <div class="dungeon-hud-actions">
    ${!getChar()?.elemental && (D.floor||1) >= 5 ? `<button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('dungeonDiscoverElemental')}>✨ Spirit</button>` : ''}
    <button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('openGuild')}>Guild</button>
    <button class="dungeon-btn dungeon-btn-exit dungeon-btn-hud" ${actionAttrs('dungeonExit')}>Exit</button>
  </div>
</div>

          <div class="dungeon-hud-minimap">
            <div class="dungeon-hud-minimap-title">Map</div>
            <div id="dungeon-minimap" class="dungeon-minimap">${renderMapGrid()}</div>
          </div>

          <div class="dungeon-hud-center">
            <div class="dungeon-hud-room ${roomHasAliveMonsters ? 'has-monster' : ''}">
              <div class="dungeon-hud-room-title">
                ${roomLabel}
                <span class="dungeon-hud-room-id"> � Room ${D.playerPos + 1}</span>
              </div>
              <div class="dungeon-hud-room-desc">${roomDescription}</div>
              <div class="dungeon-hud-room-progress">${exploredCount}/${totalRoomCount} explored</div>
              ${latestLogMessage ? `<div class="dungeon-hud-room-log"><span>${latestLogMessage}</span></div>` : ''}
              <div class="dungeon-hud-room-info">
                ${renderRoomInfo(currentRoom)}
              </div>
            </div>
          </div>

          <div class="dungeon-hud-bottom">
            <div class="dungeon-travel-bar-wrap dungeon-travel-bar-wrap-hud">
              <div id="dungeon-travel-bar" class="dungeon-travel-bar"></div>
            </div>
            <div class="dungeon-path-options">
              ${(() => {
                // Get all connectable rooms: direct connections + nearby discovered rooms
                const currentRoom = D.rooms[D.playerPos];
                const connectable = [...(currentRoom.connections || [])];
                
                // Add adjacent discovered rooms that aren't in connections yet
                D.rooms.forEach((r, idx) => {
                  if (idx === D.playerPos) return;
                  if (!D.exploredRooms.has(idx)) return;
                  if (connectable.includes(idx)) return;
                  
                  // Check if adjacent in grid
                  const dx = Math.abs(r.x - currentRoom.x);
                  const dy = Math.abs(r.y - currentRoom.y);
                  if (dx <= 1 && dy <= 1 && (dx + dy) > 0 && (r.connections || []).includes(D.playerPos)) {
                    connectable.push(idx);
                  }
                });
                
                return connectable.map(ci => {
                  const cr = D.rooms[ci];
                  const explored = D.exploredRooms.has(ci);
                  const directionArrow = explored ? getRoomDirectionArrow(D.playerPos, ci) : null;
                  const arrowImg = directionArrow ? DIR_IMGS[directionArrow] : 'question.png';
                  const monsterAlive = cr.monsters && cr.monsters.length > 0 && cr.monsters.some(m => 
                    !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)
                  );
                  const text = explored ? `Room ${ci+1}` : 'Unknown';
                  return `
                    <button class="dungeon-path-btn ${monsterAlive ? 'has-monster' : ''} ${cr.isBoss ? 'is-boss' : ''}"
                            ${actionAttrs('dungeonTravel', ci)} ${D.isTraveling ? 'disabled' : ''}>
                      <span class="dungeon-path-btn-icon"><img class="dungeon-path-btn-arrow-img" src="/images/assets/${arrowImg}" alt="${directionArrow || 'unknown'}"></span>
                      <span class="dungeon-path-btn-text">${text}</span>
                      ${explored ? `<span class="dungeon-path-btn-roomno">#${ci + 1}</span>` : ''}
                    </button>
                  `;
                }).join('');
              })()}
            </div>
          </div>

          <div id="dungeon-overlay" class="dungeon-overlay"></div>
        </div>
      </div>
    `;

    // Always scroll overlay to bottom so HUD/action buttons are in view.
    setTimeout(() => {
      try {
        const o = document.getElementById('dungeon-overlay');
        if (o) o.scrollTop = o.scrollHeight;
      } catch(_) {}
    }, 50);

    if (roomHasAliveMonsters && !currentRoom.isBoss && !currentRoom.monstersEvaded) {
      prefetchCombatForRoom(D.playerPos);
    }
    renderLog();
  }


  function hydrateDungeonPathButtons(connectionIds) {
    const buttons = document.querySelectorAll('.dungeon-path-btn');
    buttons.forEach((btn, index) => {
      const targetIdx = connectionIds[index];
      const iconEl = btn.querySelector('.dungeon-path-btn-icon');
      if (!iconEl || targetIdx == null) return;
      const explored = D.exploredRooms.has(targetIdx);
      const directionArrow = explored ? getRoomDirectionArrow(D.playerPos, targetIdx) : null;
      const arrowImg = directionArrow ? DIR_IMGS[directionArrow] : 'question.png';
      iconEl.innerHTML = `<img class="dungeon-path-btn-arrow-img" src="/images/assets/${arrowImg}" alt="${directionArrow || 'unknown'}">`;
    });
  }
function getRoomDirectionArrow(fromIdx, toIdx) {
    const fromRoom = D.rooms[fromIdx];
    const toRoom = D.rooms[toIdx];
    if (!fromRoom || !toRoom) return 'right';

    const dx = toRoom.x - fromRoom.x;
    const dy = toRoom.y - fromRoom.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) return 'right';
      if (dx < 0) return 'left';
    }
    if (dy < 0) return 'up';
    if (dy > 0) return 'down';
    return 'right';
  }

function isRoomVisible(idx) {
    if (D.exploredRooms.has(idx)) return true;
    const currentRoom = D.rooms[D.playerPos];
    if (!currentRoom || !Array.isArray(currentRoom.connections)) return false;
    
    // Direct path connection
    if (currentRoom.connections.includes(idx)) return true;
    
    // Adjacent rooms in the grid (within 1 tile in any direction)
    const targetRoom = D.rooms[idx];
    const dx = Math.abs(targetRoom.x - currentRoom.x);
    const dy = Math.abs(targetRoom.y - currentRoom.y);
    if (dx <= 1 && dy <= 1 && (dx + dy) > 0) return true;
    
    return false;
}
function renderMapGrid() {
    const grid = {};
    for (let i = 0; i < D.rooms.length; i++) {
        const r = D.rooms[i];
        grid[`${r.x},${r.y}`] = i;
    }

    const currentRoom = D.rooms[D.playerPos];
    const crawlerRoomIdx = D.crawler && !D.crawler.defeated && D.crawler.active ? D.crawler.roomIdx : null;
    const centerX = currentRoom.x;
    const centerY = currentRoom.y;
    
    const viewSize = 5;
    const offset = Math.floor(viewSize / 2);
    const viewMinX = centerX - offset;
    const viewMaxX = centerX + offset;
    const viewMinY = centerY - offset;
    const viewMaxY = centerY + offset;
    
    const cellSize = 38;
    const roomSize = 16;
    const corridorWidth = 14;
    const gridWidth = (viewMaxX - viewMinX + 1) * cellSize;
    const gridHeight = (viewMaxY - viewMinY + 1) * cellSize;
    
let svg = `<svg class="dungeon-maze-svg" viewBox="0 0 ${gridWidth} ${gridHeight}" style="display:block;width:100%;height:auto;background:rgba(10,15,25,0.9);">`;
    
    for (let y = viewMinY; y <= viewMaxY; y++) {
        for (let x = viewMinX; x <= viewMaxX; x++) {
            const key = `${x},${y}`;
            if (grid[key] !== undefined) {
                const idx = grid[key];
                const room = D.rooms[idx];
                const cx = (x - viewMinX) * cellSize + cellSize / 2;
                const cy = (y - viewMinY) * cellSize + cellSize / 2;
                
                room._mapX = cx;
                room._mapY = cy;
                room._mapIdx = idx;
            } else {
                const cx = (x - viewMinX) * cellSize + cellSize / 2;
                const cy = (y - viewMinY) * cellSize + cellSize / 2;
                svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="rgba(100,100,120,0.25)" stroke="none"/>`;
            }
        }
    }
    
    const drawnCorridors = new Set();
    for (let y = viewMinY; y <= viewMaxY; y++) {
        for (let x = viewMinX; x <= viewMaxX; x++) {
            const key = `${x},${y}`;
            if (grid[key] !== undefined) {
                const idx = grid[key];
                const room = D.rooms[idx];
                const isPlayer = idx === D.playerPos;
                const explored = D.exploredRooms.has(idx);
                const visible = isRoomVisible(idx);
                const showRoom = visible || explored || crawlerRoomIdx === idx;
                
                if (!showRoom || room._mapX === undefined) continue;
                
                const cx = room._mapX;
                const cy = room._mapY;
                
                for (const connIdx of (room.connections || [])) {
                    const connRoom = D.rooms[connIdx];
                    if (!connRoom) continue;
                    const connExplored = D.exploredRooms.has(connIdx);
                    const connVisible = isRoomVisible(connIdx);
                    if (!connExplored && !connVisible) continue;
                    if (connRoom._mapX === undefined) continue;
                    
                    const corridorKey = [Math.min(idx, connIdx), Math.max(idx, connIdx)].join('-');
                    if (drawnCorridors.has(corridorKey)) continue;
                    drawnCorridors.add(corridorKey);
                    
                    const tcx = connRoom._mapX;
                    const tcy = connRoom._mapY;
                    
                    const isPlayerRoom = idx === D.playerPos || connIdx === D.playerPos;
                    const corridorColor = isPlayerRoom ? '#6366f1' : '#374151';
                    const corridorGlow = isPlayerRoom ? '#818cf8' : '#4b5563';
                    
                    svg += `<line x1="${cx}" y1="${cy}" x2="${tcx}" y2="${tcy}" stroke="${corridorGlow}" stroke-width="${corridorWidth + 6}" stroke-linecap="round" opacity="0.3"/>`;
                    svg += `<line x1="${cx}" y1="${cy}" x2="${tcx}" y2="${tcy}" stroke="${corridorColor}" stroke-width="${corridorWidth}" stroke-linecap="round"/>`;
                }
                
                let roomColor = '#1f2937';
                let roomBorder = '#4b5563';
                let roomGlow = 'none';
                if (isPlayer) {
                    roomColor = '#c026d3';
                    roomBorder = '#f0abfc';
                    roomGlow = '#f0abfc';
                } else if (room.isBoss) {
                    roomColor = '#7f1d1d';
                    roomBorder = '#ef4444';
                    roomGlow = '#ef4444';
                } else if (room.isMiniBoss || room.type === 'miniboss') {
                    roomColor = '#581c87';
                    roomBorder = '#c084fc';
                    roomGlow = '#c084fc';
                } else if (room.type === 'treasure') {
                    roomColor = '#713f12';
                    roomBorder = '#fbbf24';
                    roomGlow = '#fbbf24';
                } else if (room.type === 'area' || room.isArea) {
                    roomColor = '#1e40af';
                    roomBorder = '#3b82f6';
                    roomGlow = '#3b82f6';
                } else if (room.monsters && room.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H))) {
                    roomColor = '#7f1d1d';
                    roomBorder = '#f87171';
                    roomGlow = '#f87171';
                } else {
                    roomColor = '#14532d';
                    roomBorder = '#22c55e';
                    roomGlow = '#22c55e';
                }
                
                if (!explored && visible) {
                    roomColor = '#1f2937';
                    roomBorder = '#6b7280';
                    roomGlow = 'none';
                }
                
                if (roomGlow !== 'none') {
                    const pulseClass = isPlayer ? ' class="maze-player-pulse"' : '';
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 2 + 6}" fill="${roomGlow}" opacity="0.4"${pulseClass}/>`;
                }
                
                svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 2}" fill="${roomColor}" stroke="${roomBorder}" stroke-width="2"/>`;
                
                if (isPlayer) {
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 4}" fill="#fff" opacity="0.95"/>`;
                }

                if (crawlerRoomIdx === idx) {
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 2 + 8}" fill="rgba(239,68,68,0.18)" stroke="rgba(248,113,113,0.55)" stroke-width="2"/>`;
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 3}" fill="#991b1b" stroke="#fca5a5" stroke-width="1.5"/>`;
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 7}" fill="#fee2e2" opacity="0.95"/>`;
                }
                
                if (room.isBoss) {
                    svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" fill="#fff">👑</text>`;
                }
            }
        }
    }
    
    for (let i = 0; i < D.rooms.length; i++) {
        delete D.rooms[i]._mapX;
        delete D.rooms[i]._mapY;
        delete D.rooms[i]._mapIdx;
    }
    
    svg += '</svg>';
    return svg;
}
function renderRoomInfo(room) {
    // Check if there are any monsters (array) and if any are alive
    const hasMonsters = room.monsters && room.monsters.length > 0;
    const anyMonsterAlive = hasMonsters && room.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
    const allMonstersRespawning = hasMonsters && room.monsters.every(m => m.lastKilled && !elapsed(m.lastKilled, MONSTER_RESPAWN_H));
    
    // Get first alive monster for display (if multiple)
    const aliveMonster = anyMonsterAlive ? room.monsters.find(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)) : null;
    // Hydrate missing or old-path images directly from pool templates
    const monsterImg = aliveMonster?.image;
    if (aliveMonster && (!monsterImg || /\/images\/dungeon\/miniboss\d*\.jpg/i.test(monsterImg))) {
        const id = aliveMonster.id || (aliveMonster.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const byName = (m) => (m.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const found = MONSTER_POOL.find(m => m.id === id)
            || MONSTER_POOL.find(m => byName(m) === id)
            || MINI_BOSS_POOL.find(m => byName(m) === id);
        if (found && found.image) aliveMonster.image = found.image;
    }
    const monsterCount = room.monsters ? room.monsters.length : 0;
    const aliveCount = room.monsters ? room.monsters.filter(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)).length : 0;

    if (room.isBoss) {
        const def = getDungeonDef(D.activeDungeon);
        const boss = def.boss;
        return `
            <div class="dungeon-boss-room">
                <div style="width:82px;height:110px;margin:0 auto 6px;border-radius:10px;overflow:hidden;border:2px solid var(--dungeon-gold)">
                    <img src="${boss.image}" alt="${boss.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">
                </div>
                <div class="boss-name-big" style="margin-top:0">${boss.name}</div>
                <div class="fighter-class" style="margin-bottom:8px">⚔️ ${boss.atk || '?'} · 🛡️ ${boss.def || '?'}</div>
                <div class="boss-drop-preview" style="margin-bottom:8px">
                    💰${boss.loot.gold[0]}-${boss.loot.gold[1]}g · 💎${boss.loot.gems[0]}-${boss.loot.gems[1]} · ✨${boss.loot.premiumDays[0]}-${boss.loot.premiumDays[1]}d premium
                </div>
                <button class="dungeon-btn dungeon-btn-fight boss-fight-btn" ${actionAttrs('dungeonFightBoss', room.id)}>
                    ⚔️ Challenge Boss (${TOKENS_PER_RUN} Tokens Required)
                </button>
            </div>
        `;
    }

    if (room.isMiniBoss && anyMonsterAlive) {
        const m = aliveMonster;
        const hasImg = !!m.image;
        return `
            <div class="dungeon-room-monster">
                <div style="width:82px;height:110px;margin:0 auto 4px;border-radius:10px;overflow:hidden;border:2px solid rgba(201,146,42,0.45)">
                    ${hasImg ? `<img src="${m.image}" alt="${m.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">` : ''}
                    <span class="battle-fighter-fallback" style="${hasImg ? 'display:none' : ''}">${m.icon || '👾'}</span>
                </div>
                <div class="fighter-name" style="margin-bottom:2px;font-weight:700">MINI-BOSS: ${m.name}</div>
                <div class="fighter-class">⚔️ ${m.atk || '?'} · 🛡️ ${m.def || '?'}</div>
                <div class="monster-btns" style="margin-top:6px">
                    <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonFightMiniBoss', room.id)}>⚔️ Challenge Mini-Boss</button>
                </div>
            </div>
        `;
    }

    if (anyMonsterAlive) {
        const aliveMonsters = room.monsters.filter(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
        const aliveCount = aliveMonsters.length;
        if (!D._roomMonsterOffset) D._roomMonsterOffset = {};
        const roomIdx = D.rooms.indexOf(room);
        const perPage = window.innerWidth <= 768 ? 1 : 3;
        let offset = D._roomMonsterOffset[roomIdx] ?? 0;
        if (offset >= aliveCount) offset = Math.max(0, aliveCount - perPage);
        const visible = aliveMonsters.slice(offset, offset + perPage);
        const hasPrev = offset > 0;
        const hasNext = offset + perPage < aliveCount;

        const cardsHtml = visible.map(m => {
            const hi = !!m.image;
            return `
                <div style="text-align:center">
                    <div style="width:82px;height:110px;margin:0 auto 4px;border-radius:10px;overflow:hidden;border:2px solid rgba(100,180,255,0.35);display:flex;align-items:center;justify-content:center">
                        ${hi ? `<img src="${m.image}" alt="${m.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">` : ''}
                        <span class="battle-fighter-fallback" style="${hi ? 'display:none' : ''}">${m.icon || '👾'}</span>
                    </div>
                    <div class="fighter-name" style="font-size:0.7rem;font-weight:600;max-width:82px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.name}">${m.name}</div>
                    <div class="fighter-class" style="font-size:0.6rem">⚔️ ${m.atk || '?'} · 🛡️ ${m.def || '?'}</div>
                </div>
            `;
        }).join('');

        const arrowStyle = 'width:28px;height:80px;border:none;background:rgba(0,0,0,0.2);color:rgba(201,146,42,0.7);cursor:pointer;border-radius:6px;font-size:1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0';
        const prevArrow = hasPrev ? `<button style="${arrowStyle}" data-action="roomDeckNav" data-args='[-1]'>◀</button>` : `<div style="width:28px;flex-shrink:0"></div>`;
        const nextArrow = hasNext ? `<button style="${arrowStyle}" data-action="roomDeckNav" data-args='[1]'>▶</button>` : `<div style="width:28px;flex-shrink:0"></div>`;

        return `
            <div class="dungeon-room-monster" style="text-align:center">
                <div style="display:flex;align-items:center;justify-content:center;gap:4px">
                    ${prevArrow}
                    <div style="display:flex;gap:8px;justify-content:center">
                        ${cardsHtml}
                    </div>
                    ${nextArrow}
                </div>
                ${aliveCount > 1 ? `<div class="deck-counter" style="margin-top:2px">${offset + 1}–${Math.min(offset + perPage, aliveCount)} of ${aliveCount}</div>` : ''}
                <div class="monster-btns" style="margin-top:6px">
                    <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonFight', room.id)}>⚔️ Fight</button>
                </div>
                ${(() => { const anyStolen = room.monsters.find(m => m.stolenItems?.length); return anyStolen ? `
                    <div class="stolen-items-notice" style="margin-top:4px">
                        🎒 Monster carries stolen items
                    </div>` : '';
                })()}
            </div>
        `;
    }

    if (allMonstersRespawning && room.monsters && room.monsters[0]) {
        const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - room.monsters[0].lastKilled) / 3600000).toFixed(1);
        return `
            <div class="dungeon-room-clear">
                <div style="color:var(--dungeon-muted);font-size:0.9rem">💤 ${monsterCount} monster${monsterCount > 1 ? 's' : ''} respawn${monsterCount > 1 ? '' : 's'} in ${hoursLeft}h</div>
                ${room.type === 'treasure' ? '<div style="color:#f1c40f;margin-top:8px">💰 Treasure already looted</div>' : ''}
            </div>
        `;
    }

    return `
        <div class="dungeon-room-clear">
            <div style="color:var(--dungeon-muted)">
                ${room.isStart ? '🚪 Dungeon Entrance — choose a path to explore.' :
                    room.type === 'treasure' ? (room.looted ? '💰 Treasure already collected.' : '✨ Peaceful chamber. Treasure collected!') :
                    '🏚️ Empty corridor. All clear.'}
            </div>
        </div>
    `;
}
  function renderCombatPanel() {
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay || !D.combat) return;
    D._combatActive = true;
    // Combat should fully take over the screen: prevent background scrolling.
    document.body.classList.add('modal-lock');
    document.body.classList.add('combat-lock');
    const def = getDungeonDef(D.activeDungeon);
    const monsters = D.combat.monsters;

    const currentMonster = monsters[D.combat.currentMonsterIndex] || {};
    const pStats = calcPlayerStats();
    const pHpPct = Math.round((pStats.hp / pStats.maxHp) * 100);
    const isLoadingMonsters = !!D.combat.serverAuth && !!D.combat.resolving && (!Array.isArray(monsters) || monsters.length === 0);
    
    const c = getChar();
    const playerClass = c?.class || 'warrior';
    const playerLevel = c?.level || 1;
    const playerSplash = `/images/class/${playerClass}-st.png`;

    // Build monster deck view — single card with <> navigation
    const aliveMonsters = monsters.filter(m => m.currentHp > 0);
    const aliveCount = aliveMonsters.length;
    let viewIdx = D.combat.currentMonsterIndex;
    if (!monsters[viewIdx] || monsters[viewIdx].currentHp <= 0) {
        viewIdx = aliveCount ? monsters.indexOf(aliveMonsters[0]) : 0;
    }
    const alivePos = aliveCount ? aliveMonsters.findIndex(m => monsters.indexOf(m) === viewIdx) + 1 : 0;
    const findAlive = (start, dir) => { for (let i = start + dir; i >= 0 && i < monsters.length; i += dir) { if (monsters[i].currentHp > 0) return i; } return -1; };
    const prevAlive = findAlive(viewIdx, -1);
    const nextAlive = findAlive(viewIdx, 1);

    const monsterDeckHtml = isLoadingMonsters
        ? `<div style="padding:10px;color:var(--dungeon-muted)">Loading enemies...</div>`
        : aliveCount === 0
        ? `<div style="padding:10px;color:var(--dungeon-muted);text-align:center">All enemies defeated!</div>`
        : (() => {
        const m = monsters[viewIdx];
        const hpPercent = Math.round(m.currentHp / m.maxHp * 100);
        const hasImg = !!m.image;
        const isSelected = viewIdx === D.combat.currentMonsterIndex;
        const targetBorder = isSelected ? '3px solid rgba(201,146,42,0.9)' : '2px solid rgba(201,146,42,0.35)';
        const hpBars = Number(m.hpBars || 1);
        const bossBarsHtml = hpBars > 1 ? (() => {
            const barSize = Math.ceil(m.maxHp / hpBars);
            const fullBars = Math.max(0, Math.floor((m.currentHp || 0) / barSize));
            let bars = '';
            for (let i = 0; i < hpBars; i++) {
                const pct = i < fullBars ? 100 : i === fullBars ? ((m.currentHp % barSize) / barSize) * 100 : 0;
                bars += '<div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-bottom:2px"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#e74c3c,#c0392b);border-radius:2px;transition:width 0.2s"></div></div>';
            }
            return bars;
        })() : '';

        return `
            <div class="monster-side">
                <div class="fighter-card monster-combat-card ${isSelected ? 'current-target' : ''}" data-action="selectMonster" data-args='[${viewIdx}]' style="cursor:pointer">
                    <div class="fighter-avatar" style="display:flex;align-items:center;justify-content:center;overflow:hidden;border:${targetBorder}">
                        <button class="deck-arrow deck-arrow-left" data-action="deckNav" data-args='["prev"]' ${prevAlive === -1 ? 'disabled' : ''}>◀</button>
                        ${hasImg ? `<img src="${m.image}" alt="${m.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">` : ''}
                        <span class="battle-fighter-fallback" style="${hasImg ? 'display:none' : ''}">${m.icon || '👾'}</span>
                        <button class="deck-arrow deck-arrow-right" data-action="deckNav" data-args='["next"]' ${nextAlive === -1 ? 'disabled' : ''}>▶</button>
                    </div>
                    <div class="fighter-name" data-action="toggleMonsterLore" data-args='[${viewIdx}]' title="${(m.lore || '').replace(/"/g,'&quot;')}">${m.name}</div>
                    <div class="fighter-class">⚔️ ${m.atk || 0} · 🛡️ ${m.def || 0}</div>
                    <div style="width:72px;margin:4px auto">
                        ${bossBarsHtml || `<div class="fighter-hp-bar-wrap" style="width:100%;height:5px;margin:0"><div class="fighter-hp-bar monster-hp" style="width:${hpPercent}%"></div></div>`}
                    </div>
                    <div class="fighter-stats">${m.currentHp}/${m.maxHp}</div>
                </div>
                <div class="deck-counter">Monster ${alivePos}/${aliveCount}</div>
            </div>`;
    })();

    const roundEntries = D.combat.roundLog.slice(-10).reverse().map(e =>
        `<div class="combat-log-entry ${e.actor}">${e.text}</div>`
    ).join('');

    const escapeReady = !!D.combat.escapeReady;
    const isBusy = !!D.combat.resolving;

    overlay.innerHTML = `
        <div class="dungeon-overlay-backdrop"></div>
        <div class="dungeon-overlay-card dungeon-combat-panel" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
            <div class="combat-header">
                ${D.combat.isCrawler ? `<div class="combat-boss-warning">🕷️ THE CRAWLER</div>` : currentMonster.isBoss ? `<div class="combat-boss-warning">⚠️ BOSS BATTLE</div>` : ''}
                <div class="combat-title">${D.combat.isCrawler ? 'Run or be torn apart.' : `You vs ${monsters.length} ${monsters.length === 1 ? 'Monster' : 'Monsters'}`}</div>
            </div>

            <div class="combat-fighters">
                <div class="fighter-card">
                    <div class="fighter-avatar fighter-avatar-splash">
                        <img src="${playerSplash}" alt="${playerClass}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">
                        <span class="battle-fighter-fallback" style="display:none">🧙</span>
                    </div>
                    <div class="fighter-name">You</div>
                    <div class="fighter-class">${capitalize(playerClass)} Lv.${playerLevel}</div>
                    <div class="fighter-hp-bar-wrap" style="width:130px;height:6px;margin:4px auto">
                        <div class="fighter-hp-bar player-hp" style="width:${pHpPct}%"></div>
                    </div>
                    <div class="fighter-stats">${pStats.hp} / ${pStats.maxHp} HP</div>
                    <div style="margin-top:4px;width:130px">
                        <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--dungeon-muted);margin-bottom:2px">
                            <span>🔷 Mana</span>
                            <span>${D.combat.manaPoints ?? 0}/${D.combat.manaCap ?? 100}</span>
                        </div>
                        <div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
                            <div style="width:${Math.round(((D.combat.manaPoints ?? 0) / (D.combat.manaCap ?? 100)) * 100)}%;height:100%;background:linear-gradient(90deg,#4fc3f7,#29b6f6);border-radius:2px;transition:width 0.2s"></div>
                        </div>
                    </div>
                </div>

                <div class="fighter-vs">VS</div>

                ${monsterDeckHtml}
            </div>

            <div class="combat-log">${roundEntries || '<div class="combat-log-entry" style="color:var(--dungeon-muted)">Battle begins...</div>'}</div>

             <div class="combat-actions">
                 ${escapeReady
                     ? `
                         <button class="dungeon-btn dungeon-btn-run" ${actionAttrs('dungeonEscapeConfirm')}>🚪 Get Out</button>
                         <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonEscapeCancel')}>⚔️ Keep Fighting</button>
                       `
                     : `
                         <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
                           <button class="dungeon-btn ${D.combat.attackType === 'regular' ? 'dungeon-btn-fight' : 'dungeon-btn-run'}" style="font-size:0.75rem;padding:6px 10px" ${isBusy ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('selectAttack', 'regular')}>⚔️ Strike</button>
                           <button class="dungeon-btn ${D.combat.attackType === 'burst' ? 'dungeon-btn-fight' : 'dungeon-btn-run'}" style="font-size:0.75rem;padding:6px 10px" ${isBusy || (D.combat.manaPoints ?? 0) < 60 ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('selectAttack', 'burst')}>💥 Burst (60)</button>
                           <button class="dungeon-btn ${D.combat.attackType === 'ultimate' ? 'dungeon-btn-fight' : 'dungeon-btn-run'}" style="font-size:0.75rem;padding:6px 10px" ${isBusy || (D.combat.manaPoints ?? 0) < 100 ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('selectAttack', 'ultimate')}>⚡ Ultimate (100)</button>
                         </div>
                         <div style="display:flex;gap:4px;justify-content:center;margin-top:4px">
                           <button class="dungeon-btn dungeon-btn-fight" style="font-size:0.85rem;padding:8px 20px" ${isBusy ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('dungeonAttack')}>⚔️ Attack</button>
                           <button class="dungeon-btn dungeon-btn-run" ${isBusy ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('dungeonRunCombat')}>💨 Flee (75%)</button>
                         </div>
                       `}
             </div>
         </div>
    `;
}

function saveTargetRectForAnim() {
    if (!D.combat) return;
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay) return;
    const monsterSide = overlay.querySelector('.monster-side');
    const card = monsterSide ? monsterSide.querySelector('.monster-combat-card') : null;
    if (card) {
        const r = card.getBoundingClientRect();
        D.combat._prevMonsterRect = { left: r.left, top: r.top, width: r.width, height: r.height };
        D.combat._prevMonsterName = D.combat.monsters?.[D.combat.currentMonsterIndex]?.name;
        D.combat._prevMonsterIdx = D.combat.currentMonsterIndex;
    }
}

function triggerCombatAnimations() {
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay || !D.combat) return;
    const roundLog = D.combat.roundLog;
    if (!roundLog || roundLog.length < 1) return;

    const lastAnimatedIdx = D.combat._lastAnimatedLogIdx ?? -1;
    const newEntries = lastAnimatedIdx < 0 ? [...roundLog] : roundLog.slice(lastAnimatedIdx + 1);
    if (newEntries.length === 0) return;
    D.combat._lastAnimatedLogIdx = roundLog.length - 1;

    const playerCard = overlay.querySelector('.combat-fighters > .fighter-card:first-child');
    const monsterSide = overlay.querySelector('.monster-side');
    let currentMonsterCard = monsterSide ? monsterSide.querySelector('.monster-combat-card') : null;

    const prevRect = D.combat._prevMonsterRect;
    const prevName = D.combat._prevMonsterName;
    const prevIdx = D.combat._prevMonsterIdx;
    const monsterChanged = prevRect && prevIdx != null && (
        !currentMonsterCard || D.combat.currentMonsterIndex !== prevIdx
    );

    if (!playerCard || !monsterSide || (!currentMonsterCard && !monsterChanged)) return;

    const currentMonster = D.combat.monsters[D.combat.currentMonsterIndex];
    const attackType = D.combat._lastAttackType || 'regular';
    const isBigAttack = attackType === 'burst' || attackType === 'ultimate';

    const parseDmg = (text) => {
        const m = text.match(/(\d+)\s*damage/i) || text.match(/for\s+(\d+)/i) || text.match(/(\d+)!/);
        return m ? parseInt(m[1]) : null;
    };

    const spawnDmgFloat = (target, dmg, isHeal, styleType) => {
        if (dmg == null) return;
        const el = document.createElement('div');
        let cls = 'combat-damage-float';
        if (isHeal) cls += ' heal';
        if (styleType === 'ultimate') cls += ' ultimate';
        else if (styleType === 'burst') cls += ' burst';
        el.className = cls;
        el.textContent = isHeal ? `+${dmg}` : `-${dmg}`;
        if (monsterChanged && target === currentMonsterCard && prevRect) {
            el.style.left = (prevRect.left + prevRect.width / 2 - 30) + 'px';
            el.style.top = (prevRect.top + 20) + 'px';
        } else {
            const rect = target.getBoundingClientRect();
            el.style.left = (rect.left + rect.width / 2 - 30) + 'px';
            el.style.top = (rect.top + 20) + 'px';
        }
        el.style.position = 'fixed';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 900);
    };

    const findMonsterByName = (text) => {
        if (!text) return null;
        const lower = text.toLowerCase();
        let best = null, bestIdx = Infinity, bestLen = 0;
        for (let i = 0; i < D.combat.monsters.length; i++) {
            const m = D.combat.monsters[i];
            if (m.currentHp <= 0) continue;
            const name = m.name.toLowerCase();
            const idx = lower.indexOf(name);
            if (idx !== -1 && (idx < bestIdx || (idx === bestIdx && name.length > bestLen))) {
                best = m;
                bestIdx = idx;
                bestLen = name.length;
            }
        }
        return best;
    };

    // Separate new entries by actor
    const monsterEntries = newEntries.filter(e => e.actor === 'monster');
    const playerEntries = newEntries.filter(e => e.actor === 'player');

    // Collect unique monster attackers (preserving order)
    const monsterAttacks = [];
    const seen = new Set();
    for (const entry of monsterEntries) {
        const mon = findMonsterByName(entry.text);
        if (mon && !seen.has(mon.name)) {
            seen.add(mon.name);
            monsterAttacks.push({ monster: mon, dmg: parseDmg(entry.text) });
        }
    }

    const lastPlayerEntry = playerEntries[playerEntries.length - 1];
    const playerDmg = lastPlayerEntry ? parseDmg(lastPlayerEntry.text) : null;

    const combatPanel = overlay.querySelector('.dungeon-combat-panel');

    // --- Animation sequence ---

    // 1) Player attack (t=0)
    if (playerEntries.length > 0) {
        if (attackType === 'ultimate') {
            playerCard.classList.add('combat-anim-player-ultimate');
            if (combatPanel) {
                setTimeout(() => combatPanel.classList.add('combat-anim-screen-shake'), 200);
                setTimeout(() => combatPanel.classList.remove('combat-anim-screen-shake'), 600);
            }
            setTimeout(() => playerCard.classList.remove('combat-anim-player-ultimate'), 1000);
        } else if (attackType === 'burst') {
            playerCard.classList.add('combat-anim-player-burst');
            setTimeout(() => playerCard.classList.remove('combat-anim-player-burst'), 800);
        } else {
            playerCard.classList.add('combat-anim-player-lunge');
            setTimeout(() => playerCard.classList.remove('combat-anim-player-lunge'), 600);
        }
    }

    // 2) Player damage on current monster (t=400ms)
    if (playerDmg != null) {
        setTimeout(() => {
            currentMonsterCard.classList.add('combat-anim-monster-hit');
            spawnDmgFloat(currentMonsterCard, playerDmg, false, attackType);
            setTimeout(() => currentMonsterCard.classList.remove('combat-anim-monster-hit'), 500);
        }, 400);
    }

    // 3) Monster counter-attacks (t=1100ms onwards, sequential)
    let baseDelay = 1100;
    for (let i = 0; i < monsterAttacks.length; i++) {
        const attack = monsterAttacks[i];
        const isCurrent = attack.monster === currentMonster;
        const d = baseDelay + i * 1100;

        if (isCurrent) {
            setTimeout(() => {
                currentMonsterCard.classList.add('combat-anim-monster-strike');
                spawnDmgFloat(playerCard, attack.dmg, false);
                setTimeout(() => {
                    currentMonsterCard.classList.remove('combat-anim-monster-strike');
                    currentMonsterCard.classList.add('combat-anim-monster-hit');
                    setTimeout(() => currentMonsterCard.classList.remove('combat-anim-monster-hit'), 400);
                }, 400);
            }, d);
        } else {
            // Delay DOM insertion until this monster's turn
            setTimeout(() => {
                const tempCard = buildTempMonsterCard(attack.monster);
                monsterSide.appendChild(tempCard);
                void tempCard.offsetHeight;
                tempCard.classList.add('combat-anim-monster-attack-from-deck');
                setTimeout(() => spawnDmgFloat(playerCard, attack.dmg, false), 350);

                tempCard.addEventListener('animationend', function onEnd(e) {
                    if (e.animationName === 'combat-monster-attack-from-deck') {
                        tempCard.removeEventListener('animationend', onEnd);
                        tempCard.classList.remove('combat-anim-monster-attack-from-deck');
                        tempCard.classList.add('combat-anim-monster-retreat');
                        tempCard.addEventListener('animationend', function onRetreat(e2) {
                            if (e2.animationName === 'combat-monster-retreat') {
                                tempCard.removeEventListener('animationend', onRetreat);
                                if (tempCard.parentNode) tempCard.remove();
                            }
                        });
                    }
                });
            }, d);
        }
    }

    // Player shake if first monster attacker is non-current (handles solo monster hits)
    if (monsterAttacks.length > 0 && monsterAttacks[0].monster !== currentMonster) {
        const shakeDelay = baseDelay + 350;
        setTimeout(() => {
            playerCard.classList.add('combat-anim-monster-hit');
            setTimeout(() => playerCard.classList.remove('combat-anim-monster-hit'), 400);
        }, shakeDelay);
    }
}

function inlineStyles(src) {
    const clone = src.cloneNode(true);
    const walk = (orig, cpy) => {
        const cs = getComputedStyle(orig);
        for (let i = 0; i < cs.length; i++) {
            const prop = cs[i];
            cpy.style[prop] = cs.getPropertyValue(prop);
        }
        for (let i = 0; i < orig.children.length; i++) {
            if (cpy.children[i]) walk(orig.children[i], cpy.children[i]);
        }
    };
    walk(src, clone);
    return clone;
}

function captureElementToCanvas(el) {
    const rect = el.getBoundingClientRect();
    const w = Math.ceil(rect.width);
    const h = Math.ceil(rect.height);
    if (w <= 0 || h <= 0) return null;
    const styled = inlineStyles(el);
    const html = styled.outerHTML
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden">${html}</div>
        </foreignObject>
    </svg>`;
    const img = new Image();
    return new Promise(resolve => {
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
        img.onerror = () => resolve(null);
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
}

function pixelDissolveCard(card) {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    captureElementToCanvas(card).then(canvas => {
        if (!canvas) {
            spawnFallbackParticles(cx, cy, 24);
            return;
        }
        const dataUrl = canvas.toDataURL();
        const gridCols = 8;
        const gridRows = 10;
        const cellW = canvas.width / gridCols;
        const cellH = canvas.height / gridRows;
        card.style.opacity = '0';

        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const p = document.createElement('div');
                p.style.position = 'fixed';
                p.style.width = cellW + 'px';
                p.style.height = cellH + 'px';
                p.style.left = (rect.left + c * cellW) + 'px';
                p.style.top = (rect.top + r * cellH) + 'px';
                p.style.backgroundImage = `url(${dataUrl})`;
                p.style.backgroundSize = `${canvas.width}px ${canvas.height}px`;
                p.style.backgroundPosition = `-${c * cellW}px -${r * cellH}px`;
                p.style.pointerEvents = 'none';
                p.style.zIndex = '500000';
                p.style.borderRadius = '1px';

                const angle = Math.random() * 2 * Math.PI;
                const dist = 30 + Math.random() * 120;
                const tx = Math.cos(angle) * dist;
                const ty = Math.sin(angle) * dist - 40;
                const rot = (Math.random() - 0.5) * 720;
                const delay = Math.random() * 0.3;
                p.style.transition = `transform 0.7s cubic-bezier(0.25,0.46,0.45,0.94) ${delay}s, opacity 0.7s ease ${delay}s`;
                p.style.transform = 'translate(0,0) rotate(0deg)';
                document.body.appendChild(p);
                requestAnimationFrame(() => {
                    p.style.transform = `translate(${tx}px,${ty}px) rotate(${rot}deg)`;
                    p.style.opacity = '0';
                });
                setTimeout(() => p.remove(), 1500);
            }
        }
        // extra sparkle particles
        spawnFallbackParticles(cx, cy, 12);
    });
}

function spawnFallbackParticles(x, y, count) {
    count = count || 18;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'combat-dissolve-particle';
        const angle = Math.random() * 2 * Math.PI;
        const dist = 40 + Math.random() * 100;
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.setProperty('--px', px + 'px');
        p.style.setProperty('--py', py + 'px');
        p.style.background = Math.random() < 0.3
            ? 'radial-gradient(circle, #ff8c00, #ff4500)'
            : Math.random() < 0.5
                ? 'radial-gradient(circle, #ffd700, #ff8c00)'
                : 'radial-gradient(circle, #fff4e0, #ffd700)';
        const size = 3 + Math.random() * 5;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }
}

function buildTempMonsterCard(monster) {
    const hasImg = !!monster.image;
    const iconEl = hasImg
        ? `<img src="${monster.image}" alt="${monster.name}" style="width:100%;height:100%;object-fit:cover">`
        : `<span class="battle-fighter-fallback">${monster.icon || '👾'}</span>`;
    const el = document.createElement('div');
    el.className = 'combat-temp-monster-card';
    el.innerHTML = `
        <div class="fighter-card monster-combat-card" style="border:2px solid rgba(201,146,42,0.35)">
            <div class="fighter-avatar" style="display:flex;align-items:center;justify-content:center;overflow:hidden;width:80px;height:80px">
                ${iconEl}
            </div>
            <div class="fighter-name">${monster.name}</div>
            <div class="fighter-class">⚔️ ${monster.atk || 0} · 🛡️ ${monster.def || 0}</div>
            <div style="width:72px;margin:4px auto">
                <div class="fighter-hp-bar-wrap" style="width:100%;height:5px;margin:0">
                    <div class="fighter-hp-bar monster-hp" style="width:${Math.round(monster.currentHp / monster.maxHp * 100)}%"></div>
                </div>
            </div>
            <div class="fighter-stats">${monster.currentHp}/${monster.maxHp}</div>
        </div>`;
    return el;
}

function renderLog() {
    const roomLog = document.querySelector('.dungeon-hud-room-log');
    if (roomLog) {
      roomLog.innerHTML = `<span>${D.dungeonLog[0]?.msg || ''}</span>`;
      roomLog.style.display = D.dungeonLog[0]?.msg ? 'block' : 'none';
    }
  }

  function showBossVictoryModal(boss, loot) {
  let modal = document.getElementById('dungeon-boss-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dungeon-boss-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-box dungeon-victory-box">
      <div class="victory-icon">${boss.icon}</div>
      <div class="victory-title">BOSS DEFEATED!</div>
      <div class="victory-boss-name">${boss.name}</div>
      <div class="victory-loot">
        <div class="loot-row">💰 <strong>${loot.gold.toLocaleString()}</strong> Gold</div>
        <div class="loot-row">💎 <strong>${loot.gems}</strong> Gems</div>
        <div class="loot-row premium-reward">
          ✨ <strong>${loot.premium.emoji} ${loot.premium.name}</strong> (${loot.premium.days} days)
          <div class="premium-desc">${loot.premium.desc}</div>
        </div>
      </div>
      <div class="victory-next">Advancing to Floor ${D.floor}...</div>
      <button class="btn-primary" style="margin-top:16px;width:100%" ${actionAttrs('closeDungeonVictory')}>Continue Delving</button>
    </div>
  `;
}

function toggleMonsterLore(idx) {
  const cards = document.querySelectorAll('.monster-combat-card');
  const card = cards[idx];
  if (!card) return;
  const m = D.combat?.monsters?.[idx];
  if (!m || !m.lore) return;
  const existing = card.querySelector('.monster-lore-popup');
  if (existing) { existing.remove(); return; }
  const popup = document.createElement('div');
  popup.className = 'monster-lore-popup';
  popup.textContent = m.lore;
  card.appendChild(popup);
  popup.addEventListener('click', e => { e.stopPropagation(); popup.remove(); });
}
function deckNav(dir) {
  if (!D.combat || !D.combat.monsters) return;
  const monsters = D.combat.monsters;
  const current = D.combat.currentMonsterIndex;
  const step = dir === 'prev' ? -1 : 1;
  for (let i = current + step; i >= 0 && i < monsters.length; i += step) {
    if (monsters[i].currentHp > 0) {
      D.combat.currentMonsterIndex = i;
      renderCombatPanel();
      return;
    }
  }
}

function selectMonster(idx) {
  if (!D.combat || !D.combat.monsters) return;
  if (D.combat.monsters[idx] && D.combat.monsters[idx].currentHp > 0) {
    D.combat.currentMonsterIndex = idx;
    renderCombatPanel();
  }
}

function selectAttack(type) {
  if (!D.combat) return;
  D.combat.attackType = type;
  renderCombatPanel();
}

// Skill check mini-game for Burst/Ultimate
// Shows an oscillating dot on a bar with zones; player taps to stop it.
function showSkillCheck(attackType, callback) {
  const isUlt = attackType === 'ultimate';
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'skill-check-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85)';
  overlay.innerHTML = `
<div style="background:#1a1a2e;border:2px solid ${isUlt ? '#e74c3c' : '#3498db'};border-radius:12px;padding:24px 32px;text-align:center;max-width:450px;width:90%;user-select:none">
  <div style="font-size:1.1rem;font-weight:bold;color:${isUlt ? '#e74c3c' : '#3498db'};margin-bottom:16px">
    ${isUlt ? '⚡ Ultimate' : '💥 Burst'} — Tap to stop!
  </div>
  <div style="position:relative;height:36px;margin:8px 0;border-radius:6px;overflow:hidden;background:#2c2c3e" id="skill-check-track">
    <div style="position:absolute;inset:0;display:flex">
      <div style="flex:0 0 25%;background:rgba(231,76,60,0.25)"></div>
      <div style="flex:0 0 15%;background:rgba(241,196,15,0.25)"></div>
      <div style="flex:0 0 20%;background:rgba(46,204,113,0.35)"></div>
      <div style="flex:0 0 15%;background:rgba(241,196,15,0.25)"></div>
      <div style="flex:0 0 25%;background:rgba(231,76,60,0.25)"></div>
    </div>
    <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:4px;height:36px;background:rgba(255,255,255,0.15);z-index:1"></div>
    <div id="skill-check-marker" style="position:absolute;top:2px;left:50%;transform:translateX(-50%);width:10px;height:32px;background:${isUlt ? '#e74c3c' : '#3498db'};border-radius:3px;z-index:2;transition:none"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:rgba(255,255,255,0.4);margin-top:2px;padding:0 4px">
    <span>MISS</span>
    <span>GOOD</span>
    <span>PERFECT</span>
    <span>GOOD</span>
    <span>MISS</span>
  </div>
  <div id="skill-check-cycle" style="font-size:0.8rem;color:rgba(255,255,255,0.5);margin-top:12px">Cycle 1/10</div>
</div>`;
  document.body.appendChild(overlay);

  const marker = overlay.querySelector('#skill-check-marker');
  const cycleEl = overlay.querySelector('#skill-check-cycle');
  let pos = 50; // 0-100, percentage position on the bar
  let dir = 1; // 1 = right, -1 = left
  let bounces = 0; // count edge hits (0 or 100)
  const maxBounces = 20; // 10 full left-right cycles
  let speed = isUlt ? (2.5 + Math.random() * 2.5) : (1.2 + Math.random() * 1.2);
  let animId = null;
  let done = false;

  function getMult(p) {
    if (p >= 40 && p <= 60) return 1.0; // perfect
    if ((p >= 25 && p < 40) || (p > 60 && p <= 75)) return 0.75; // good
    return 0.5; // miss
  }

  function resolve() {
    if (done) return;
    done = true;
    if (animId) cancelAnimationFrame(animId);
    overlay.remove();
    callback(getMult(pos));
  }

  function animate() {
    if (done) return;
    pos += dir * speed;
    if (pos >= 100) { pos = 100; dir = -1; bounces++; updateCycle(); }
    else if (pos <= 0) { pos = 0; dir = 1; bounces++; updateCycle(); }
    marker.style.left = pos + '%';
    if (bounces >= maxBounces) { resolve(); return; }
    // Vary speed each bounce
    if (bounces % 2 === 0 && speed > 0) {
      speed = isUlt
        ? (1.5 + Math.random() * 4.5)
        : (1.0 + Math.random() * 2.0);
    }
    animId = requestAnimationFrame(animate);
  }

  function updateCycle() {
    cycleEl.textContent = 'Cycle ' + Math.ceil(bounces / 2) + '/10';
  }

  overlay.addEventListener('click', resolve);
  animId = requestAnimationFrame(animate);
}

function roomDeckNav(dir) {
  if (!D._roomMonsterOffset) D._roomMonsterOffset = {};
  const room = D.rooms?.[D.playerPos];
  if (!room || !Array.isArray(room.monsters)) return;
  const aliveMonsters = room.monsters.filter(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
  if (aliveMonsters.length < 2) return;
  const perPage = window.innerWidth <= 768 ? 1 : 3;
  const currentOffset = D._roomMonsterOffset[D.playerPos] ?? 0;
  let newOffset = currentOffset + dir * perPage;
  if (newOffset < 0) newOffset = 0;
  const maxOffset = Math.max(0, aliveMonsters.length - perPage);
  if (newOffset > maxOffset) newOffset = maxOffset;
  if (newOffset === currentOffset) return;
  D._roomMonsterOffset[D.playerPos] = newOffset;
  const infoEl = document.querySelector('.dungeon-hud-room-info');
  if (infoEl) infoEl.innerHTML = renderRoomInfo(room);
}

  function updateTravelBtn(idx, disabled) {
    const btns = document.querySelectorAll('.dungeon-conn-btn');
    btns.forEach(b => b.disabled = disabled);
  }

function dungeonExit() {
    if (D.activeDungeon) {
        D.savedProgress[D.activeDungeon] = {
            floor: D.floor, 
            pos: D.playerPos,
            rooms: D.rooms, 
            explored: [...D.exploredRooms],
            crawler: D.crawler,
            floorRunId: D.floorRunId,
        };
    }

    // We are leaving the dungeon: clear local state first so /dungeon/progress can also clear any
    // server-side combat session (which otherwise can keep HP potions locked indefinitely).
    const prevFloor = D.floor;
    const prevRoomIdx = D.playerPos;
    D.activeDungeon = null;
    global.__dungeonActive = false;
    D.combat = null;
    D._combatPrefetch = null;
    D._combatActive = false;
    document.body.classList.remove('modal-lock');
    document.body.classList.remove('combat-lock');

    // Best-effort: release any room claim + end any active combat session for this room.
    // (Older clients/versions may not have done this, leaving stale `dungeon_combat_sessions.status='active'`.)
    apiFetch('POST', '/game/dungeon/room-exit', { floor: prevFloor, roomIndex: prevRoomIdx }).catch(() => {});

    // Save to database (activeDungeon is now null, so server clears active combat sessions).
    saveProgressToDB();

    // Release lock
    stopLockRefresh();

    saveState();
    renderDungeonList();
}

function closeDungeonVictory() {
    const m = document.getElementById('dungeon-boss-modal');
    if (m) m.classList.add('hidden');
    renderDungeonView();
  }

  function renderGuild() {
  const overlay = document.getElementById('dungeon-overlay');
  const area = document.getElementById('dungeon-main-area');
  if (!overlay && !area) return;

  D.dungeonGold = D.dungeonGold || 0;

  apiFetch('GET', '/game/dungeon/guild').then(guildData => {
    const reputation = guildData.guildReputation || 0;
    const dungeonGold = guildData.dungeonGold || 0;
    const bounty = guildData.bounty || null;
    const elemInv = guildData.elemInventory || {};

    D.dungeonGold = dungeonGold;
    D._elemInv = elemInv;

    // Calculate current rank
    let currentRank = GUILD_RANKS[0];
    for (let i = GUILD_RANKS.length - 1; i >= 0; i--) {
      if (reputation >= GUILD_RANKS[i].reputationNeeded) {
        currentRank = GUILD_RANKS[i];
        break;
      }
    }

    const nextRank = GUILD_RANKS[Math.min(currentRank.rank + 1, GUILD_RANKS.length - 1)];
    const repNeeded = nextRank.rank > currentRank.rank ? nextRank.reputationNeeded - reputation : 0;
    const repProgress = nextRank.rank > currentRank.rank ? (reputation / nextRank.reputationNeeded) * 100 : 100;
    const bountyProgress = bounty ? Math.min(100, Math.round(((bounty.progress || 0) / Math.max(1, bounty.target_count || 1)) * 100)) : 0;

    const guildHtml = `
      <div class="guild-container">
        <div class="guild-header">
          <span class="guild-icon">🏛️</span>
          <div>
            <div class="guild-title">Adventurer's Guild</div>
            <div class="guild-subtitle">Exchange dungeon spoils for real rewards</div>
          </div>
<button class="dungeon-btn dungeon-btn-exit" ${actionAttrs('closeGuild')}>← Back to Dungeon</button>
        </div>

        <div class="guild-stats">
          <div class="guild-stat-card">
            <div class="guild-stat-icon">💰</div>
            <div class="guild-stat-info">
              <div class="guild-stat-label">Dungeon Gold</div>
              <div class="guild-stat-value">${dungeonGold.toLocaleString()}</div>
            </div>
          </div>
          <div class="guild-stat-card">
            <div class="guild-stat-icon">⭐</div>
            <div class="guild-stat-info">
              <div class="guild-stat-label">Reputation</div>
              <div class="guild-stat-value">${reputation}</div>
              <div class="guild-stat-rank">${currentRank.name}</div>
            </div>
          </div>
        </div>

        <div class="guild-reputation-bar">
          <div class="rep-bar-label">Progress to ${nextRank.name}</div>
          <div class="rep-bar-track">
            <div class="rep-bar-fill" style="width: ${repProgress}%"></div>
          </div>
          <div class="rep-bar-text">${repNeeded > 0 ? repNeeded + ' reputation needed' : 'MAX RANK'}</div>
        </div>

        ${bounty ? `
        <div class="guild-exchanges" style="margin-top:18px">
          <div class="guild-section-title">🎯 Active Bounty</div>
          <div class="exchange-card exchange-available">
            <div class="exchange-icon">🎯</div>
            <div class="exchange-info">
              <div class="exchange-name">Hunt ${bounty.target_name}</div>
              <div class="exchange-desc">Defeat ${bounty.target_count}x ${bounty.target_name} in dungeon rooms and report back here for your payout.</div>
              <div class="exchange-cost">
                <span class="cost-item">Progress: ${bounty.progress || 0}/${bounty.target_count || 0}</span>
              </div>
              <div class="rep-bar-track" style="margin:10px 0 8px">
                <div class="rep-bar-fill" style="width: ${bountyProgress}%"></div>
              </div>
              <div class="exchange-reward">
                <span class="reward-gold">💰 ${(bounty.reward_gold || 0).toLocaleString()} Gold</span>
                <span class="reward-rep">⭐ +${bounty.reward_reputation || 0} Reputation</span>
              </div>
<button class="exchange-btn" ${actionAttrs('claimGuildBounty')} ${(bounty.progress || 0) < (bounty.target_count || 0) ? 'disabled' : ''}>
                ${(bounty.progress || 0) < (bounty.target_count || 0) ? 'Bounty In Progress' : 'Claim Bounty'}
              </button>
            </div>
          </div>
        </div>` : ''}

        <div class="guild-exchanges">
          <div class="guild-section-title">📜 Available Exchanges</div>
          <div class="exchanges-grid">
            ${GUILD_EXCHANGES.map(exchange => {
              let canExchange = true;
              let missingReason = '';
              let isLocked = false;

              // Reputation check
              if (exchange.minRep > 0 && reputation < exchange.minRep) {
                isLocked = true;
                canExchange = false;
                missingReason = '🔒 Unlocks at ' + exchange.minRep + ' reputation';
              }

              // Dungeon gold check
              if (canExchange && exchange.cost.dungeonGold && dungeonGold < exchange.cost.dungeonGold) {
                canExchange = false;
                missingReason = 'Need ' + exchange.cost.dungeonGold + ' dungeon gold';
              }

              // Tier material check (swap exchanges)
              let tierCostKey = null, tierCostQty = 0;
              for (const [key, qty] of Object.entries(exchange.cost)) {
                if (key.startsWith('tier_')) {
                  tierCostKey = key.replace('tier_', '');
                  tierCostQty = qty;
                  break;
                }
              }
              let totalTierMats = 0;
              if (tierCostKey && canExchange) {
                const tierItems = ELEM_TIER_ITEMS ? ELEM_TIER_ITEMS[tierCostKey] : [];
                for (const id of (tierItems || [])) {
                  totalTierMats += elemInv[id] || 0;
                }
                if (totalTierMats < tierCostQty) {
                  canExchange = false;
                  missingReason = 'Need ' + tierCostQty + ' ' + tierCostKey + ' materials (have ' + totalTierMats + ')';
                }
              }

              const discount = currentRank.discount / 100;
              const discountedGold = exchange.reward.gold ? Math.floor(exchange.reward.gold * (1 + discount)) : exchange.reward.gold;

              // Build cost display
              let costHtml = '';
              if (exchange.cost.dungeonGold) {
                costHtml += '<span class="cost-item">💰 ' + exchange.cost.dungeonGold + ' Dungeon Gold</span>';
              }
              if (tierCostKey) {
                costHtml += '<span class="cost-item">📦 ' + tierCostQty + 'x ' + capitalize(tierCostKey) + '</span>';
              }

              // Build reward display
              let rewardHtml = '';
              if (discountedGold) {
                rewardHtml += '<span class="reward-gold">💰 ' + discountedGold.toLocaleString() + ' Gold</span>';
              }
              if (exchange.reward.reputation) {
                rewardHtml += '<span class="reward-rep">⭐ +' + exchange.reward.reputation + ' Reputation</span>';
              }
              if (exchange.reward.elemTier) {
                const ti = ELEM_TIER_INFO[exchange.reward.elemTier];
                rewardHtml += '<span class="reward-item">📦 1x ' + (ti ? ti.name : capitalize(exchange.reward.elemTier)) + ' Element</span>';
              }
              if (exchange.reward.item) {
                rewardHtml += '<span class="reward-item">📦 ' + exchange.reward.item + '</span>';
              }
              if (currentRank.discount > 0 && discountedGold > 0) {
                rewardHtml += '<span class="reward-discount">✨ +' + currentRank.discount + '% Gold Bonus (' + currentRank.name + ')</span>';
              }

              return '<div class="exchange-card ' + (isLocked ? 'exchange-unavailable' : canExchange ? 'exchange-available' : 'exchange-unavailable') + '">' +
                '<div class="exchange-icon">' + exchange.icon + '</div>' +
                '<div class="exchange-info">' +
                  '<div class="exchange-name">' + exchange.name + '</div>' +
                  '<div class="exchange-desc">' + exchange.desc + '</div>' +
                  '<div class="exchange-cost">' + costHtml + '</div>' +
                  '<div class="exchange-reward">' + rewardHtml + '</div>' +
                  '<button class="exchange-btn" ' + actionAttrs('exchangeAtGuild', exchange.id) + ' ' + ((!canExchange || D._guildExchangeInFlight) ? 'disabled' : '') + '>' +
                    (isLocked ? '🔒 Locked' : canExchange ? 'Exchange' : missingReason || 'Missing Requirements') +
                  '</button>' +
                '</div>' +
              '</div>';
            }).join('')}
          </div>
        </div>

<button class="dungeon-btn" ${actionAttrs('closeGuild')} style="width:100%;margin-top:20px">Continue Exploring</button>
      </div>
    `;

    // Fix: Ensure the overlay is properly positioned relative to body
    if (overlay) {
      overlay.innerHTML = `
<div class="dungeon-overlay-backdrop" ${actionAttrs('closeGuild')}></div>
        <div class="dungeon-overlay-card guild-overlay-card">
          ${guildHtml}
        </div>
      `;

      // Force scroll to top when opening
      setTimeout(() => {
        const container = overlay.querySelector('.guild-container');
        if (container) {
          container.scrollTop = 0;
        }
      }, 50);
    } else if (area) {
      area.innerHTML = guildHtml;
    }
  }).catch(e => console.error('Failed to load guild data:', e));
}

function openGuild() {
  const overlay = document.getElementById('dungeon-overlay');
  if (overlay) overlay.classList.add('guild-active');
  document.body.classList.add('modal-lock');
  renderGuild();
}

function closeGuild() {
  const overlay = document.getElementById('dungeon-overlay');
  if (overlay) {
    overlay.innerHTML = '';
    overlay.classList.remove('guild-active');
  }
  document.body.classList.remove('modal-lock');
  renderDungeonView();
}

function exchangeAtGuild(exchangeId) {
  if (D._guildExchangeInFlight) return;
  D._guildExchangeInFlight = true;
  D._pendingExchangeModal = false;
  apiFetch('POST', '/game/dungeon/guild/exchange', { exchangeId })
    .then(response => {
      if (response.success) {
        const msg = response.goldGained ? `Exchanged dungeon gold → ${response.goldGained} gold${response.rankBonus > 0 ? ` (${response.rankBonus}% rank bonus)` : ''}` : response.message;
        log(msg, 'log-success');
        const goldEl = document.getElementById('dungeon-gold-count');
        if (goldEl) goldEl.textContent = response.dungeonGold;
        refreshCharacter();
        if (response.grantedItem) {
          D._pendingExchangeModal = true;
          showExchangeRewardModal(response.grantedItem);
        }
      }
    })
    .catch(e => console.error('Exchange failed:', e))
    .finally(() => {
      D._guildExchangeInFlight = false;
      if (!D._pendingExchangeModal) renderGuild();
    });
}

function showExchangeRewardModal(item) {
  const overlay = document.getElementById('dungeon-overlay');
  if (!overlay) return;
  // Remove any old reward modal
  const old = overlay.querySelector('.exchange-reward-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.className = 'exchange-reward-modal';
  modal.innerHTML = `
<div style="text-align:center;padding:20px 24px">
  <div style="font-size:2.5rem;margin-bottom:8px">${item.emoji || '📦'}</div>
  <div style="font-size:1.1rem;margin-bottom:6px;color:#fff">You obtained:</div>
  <div style="font-size:1.3rem;font-weight:bold;color:#ffcc00;margin-bottom:4px">${item.name}</div>
  <div style="font-size:0.85rem;opacity:0.6;text-transform:capitalize;color:#aaa">${item.rarity} Elemental Material</div>
<button class="dungeon-btn" style="margin-top:16px;width:100%;cursor:pointer" data-action="closeExchangeRewardModal">OK</button>
</div>`;
  modal.setAttribute('data-action', 'closeExchangeRewardModal');
  overlay.appendChild(modal);
  overlay.style.display = 'flex';
}

function claimGuildBounty() {
  apiFetch('POST', '/game/dungeon/guild/bounty/claim', {})
    .then(response => {
      if (response.success) {
        log(response.message, 'log-success');
        renderGuild();
        refreshCharacter();
      }
    })
    .catch(e => console.error('Bounty claim failed:', e));
}

  async function fightMiniBoss(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.isMiniBoss) return;

    // Mini-bosses must use the same server-authoritative combat flow as normal rooms.
    // The old local-only mini-boss combat path could desync HP (including snapping to full HP after the fight).
    startCombat(roomIdx);
}

  // ── CSS Loading ──────────────────────────────────────────
  function loadCSS() {
    if (document.getElementById('dungeon-css')) return;
    const link = document.createElement('link');
    link.id = 'dungeon-css';
    link.rel = 'stylesheet';
    link.href = 'css/dungeon.css?v=2026-05-08-hud-layer-fix';
    document.head.appendChild(link);
  }

  // ── Global API (called from HTML onclick) ──────────────────
  global.dungeonFightMiniBoss = fightMiniBoss;
  global.debugDungeon = function() {
    console.log('=== DUNGEON DEBUG ===');
    console.log('Floor:', D.floor);
    console.log('Total rooms:', D.rooms.length);
    console.log('Rooms with monsters:', D.rooms.filter(r => r.monsters && r.monsters.length > 0).length);
    console.log('Monsters available from pool:', getMonstersForFloor(D.floor).length);
    
    // Check first 3 non-start, non-boss rooms
    const testRooms = D.rooms.filter(r => !r.isStart && !r.isBoss).slice(0, 3);
    testRooms.forEach((r, i) => {
        console.log(`Room ${i}: type=${r.type}, monsterCount=${r.monsters?.length || 0}, monsters=`, r.monsters);
    });
    
    // Check if the monster spawn chance is working
    console.log('Sample dungeonDef monsters:', getDungeonDef('tower').monsters.length);
};
global.debugDungeonDetails = function() {
    console.log('=== DETAILED DEBUG ===');
    
    // Check first 10 rooms
    D.rooms.slice(0, 10).forEach((r, i) => {
        console.log(`Room ${i}: isStart=${r.isStart}, isBoss=${r.isBoss}, type=${r.type}, connections=${r.connections?.length}, hasMonsters=${!!r.monsters}`);
    });
    
    // Also check if dungeonDef is truthy in the loop
    const dungeonDef = getDungeonDef('tower');
    console.log('dungeonDef exists:', !!dungeonDef);
    console.log('dungeonDef.monsters length:', dungeonDef.monsters.length);
    
    // Test chance function
    let trueCount = 0;
    for(let i = 0; i < 100; i++) {
        if (chance(0.7)) trueCount++;
    }
    console.log('chance(0.7) test:', trueCount, 'out of 100');
};
  // ── Elemental Spirit System ──────────────────────────────────
  let _cachedElemental = null;

  async function fetchElemental() {
    try {
      const r = await apiFetch('GET', '/game/elemental');
      _cachedElemental = r?.elemental || null;
      return _cachedElemental;
    } catch { return _cachedElemental; }
  }

  function renderElementalPanel() {
    const char = getChar();
    if (!char) return '';
    const hasElem = !!char.elemental;
    const floor = D.floor || 1;

    if (!hasElem && floor >= 5) {
      return `<div class="dungeon-elem-panel">
        <div class="dungeon-elem-header">🐉 Elemental Spirit</div>
        <div class="dungeon-elem-body">
          <p style="font-size:0.7rem;color:var(--text-dim);margin:0 0 6px">An ancient altar glows faintly. You sense a connection to a spirit beast on this floor.</p>
          <button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('dungeonDiscoverElemental')}>✨ Discover Elemental</button>
        </div>
      </div>`;
    }

    if (!hasElem) return '';

    const e = _cachedElemental;
    if (!e) return '';

    const hpPct = e.hpMax > 0 ? Math.round((e.hp_current / e.hpMax) * 100) : 0;
    const xpPct = e.xpNext > 0 ? Math.round(((e.xp || 0) / e.xpNext) * 100) : 0;
    const elemEmoji = e.element === 'pyro' ? '🔥' : e.element === 'water' ? '💧' : e.element === 'wind' ? '🌪️' : '⚡';

    return `<div class="dungeon-elem-panel">
      <div class="dungeon-elem-header">🐉 ${e.name} ${elemEmoji}</div>
      <div class="dungeon-elem-body">
        <div style="font-size:0.7rem;color:var(--text-dim)">Lv.${e.level} ${e.element}</div>
        <div style="font-size:0.65rem;margin:4px 0"><span class="stat-hp">❤️</span> ${e.hp_current}/${e.hpMax}</div>
        <div class="dungeon-elem-bar"><div class="dungeon-elem-bar-fill hp-fill" style="width:${hpPct}%"></div></div>
        <div style="font-size:0.65rem;margin:4px 0">XP ${e.xp || 0}/${e.xpNext}</div>
        <div class="dungeon-elem-bar"><div class="dungeon-elem-bar-fill xp-fill" style="width:${xpPct}%"></div></div>
        <button class="dungeon-btn dungeon-btn-hud" style="margin-top:6px" ${actionAttrs('dungeonShowFeedModal')}>🍽️ Feed Materials</button>
      </div>
    </div>`;
  }

  let _spiritResolve = null;

  function removeSpiritModal() {
    const el = document.getElementById('spirit-discover-modal');
    if (el) el.remove();
  }

  global.dungeonDiscoverElemental = async function() {
    const spiritTypes = ['Phoenix', 'Wyrm', 'Wolf', 'Drake', 'Serpent', 'Fox', 'Tiger', 'Griffin', 'Kitsune', 'Leviathan'];
    const spiritType = spiritTypes[Math.floor(Math.random() * spiritTypes.length)];

    const name = await new Promise(resolve => {
      _spiritResolve = resolve;
      const div = document.createElement('div');
      div.id = 'spirit-discover-modal';
      div.innerHTML = `
        <div class="spirit-overlay"></div>
        <div class="spirit-dialog">
          <div class="spirit-dialog-title">🐉 Spirit Beast Found!</div>
          <div class="spirit-dialog-body">
            Deep within the tower, you discover a mystical ${spiritType} spirit.
            Its essence pulses with ancient power, waiting to bond with a worthy champion.
            The spirit will fight alongside you in battle.
          </div>
          <label class="spirit-dialog-label">Name your Spirit Beast:</label>
          <input id="spirit-name-input" class="spirit-dialog-input" type="text" maxlength="24" placeholder="Enter a name..." value="${spiritType}">
          <div class="spirit-dialog-actions">
            <button class="btn-secondary">Skip</button>
            <button class="btn-primary">✨ Bond</button>
          </div>
        </div>
      `;
      function cancel() { removeSpiritModal(); _spiritResolve(null); }
      function confirm() {
        const input = document.getElementById('spirit-name-input');
        const n = input ? input.value.trim().slice(0, 24) : 'Elemental';
        removeSpiritModal();
        _spiritResolve(n);
      }
      div.querySelector('.spirit-overlay').addEventListener('click', cancel);
      div.querySelector('.btn-secondary').addEventListener('click', cancel);
      div.querySelector('.btn-primary').addEventListener('click', confirm);
      document.body.appendChild(div);
      setTimeout(() => document.getElementById('spirit-name-input')?.focus(), 100);
    });

    if (!name) { log('❌ Discovery cancelled', 'log-info'); return; }

    // Show loading
    const loadingEl = document.createElement('div');
    loadingEl.id = 'spirit-discover-modal';
    loadingEl.innerHTML = `<div class="spirit-overlay"></div><div class="spirit-dialog" style="text-align:center;padding:30px">✨ Bonding spirit...</div>`;
    document.body.appendChild(loadingEl);

    try {
      const r = await apiFetch('POST', '/game/elemental/discover', { name });
      loadingEl.remove();
      if (r.elemental) {
        _cachedElemental = r.elemental;
        const charR = await apiFetch('GET', '/game/character');
        if (charR) Object.assign(getChar(), charR);
        renderDungeonView();
        log(`🐉 ${r.message || 'Spirit beast bonded!'}`, 'log-arrive');
      } else {
        log('⚠️ ' + (r.error || 'Failed to bond'), 'log-danger');
      }
    } catch (e) {
      loadingEl.remove();
      console.error('[Discover] Error:', e);
      log('⚠️ Error bonding spirit: ' + e.message, 'log-danger');
    }
  };

  global.dungeonShowFeedModal = async function() {
    const elem = _cachedElemental;
    if (!elem) return;

    // Fetch inventory for raw materials
    const invR = await apiFetch('GET', '/game/inventory');
    const mats = (invR?.items || []).filter(i => {
      const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
      return (d.type === 'raw_mat' || d.category === 'material') && d.qty > 0;
    });

    if (mats.length === 0) {
      log('📭 No materials to feed. Clear dungeon rooms for drops!', 'log-info');
      return;
    }

    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay) return;

    const xpPct = elem.xpNext > 0 ? Math.round(((elem.xp || 0) / elem.xpNext) * 100) : 0;
    let html = `<div class="dungeon-overlay-backdrop" ${actionAttrs('closeDungeonOverlay')}></div>
      <div class="dungeon-modal">
        <div class="dungeon-modal-title">🍽️ Feed ${elem.name}</div>
        <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:8px">
          Lv.${elem.level}  XP ${elem.xp || 0}/${elem.xpNext} (${xpPct}%)
        </div>
        <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">`;

    for (const inv of mats) {
      const d = typeof inv.item_data === 'string' ? JSON.parse(inv.item_data) : inv.item_data;
      const qty = d.qty || 1;
      html += `<div class="dungeon-elem-feed-row" ${actionAttrs('dungeonFeedElemental', inv.id)} style="cursor:pointer">
        <span>${d.emoji || '📦'} ${d.name} (${qty})</span>
      </div>`;
    }

    html += `</div>
      <button class="dungeon-btn" style="margin-top:10px;width:100%" ${actionAttrs('closeDungeonOverlay')}>Cancel</button>
    </div>`;

    overlay.innerHTML = html;
  };

  global.dungeonFeedElemental = async function(invId, triggerEl, event) {
    const overlay = document.getElementById('dungeon-overlay');
    if (overlay) overlay.innerHTML = '';

    try {
      const r = await apiFetch('POST', '/game/elemental/feed', { inventory_id: invId });
      if (r.elemental) {
        _cachedElemental = r.elemental;
        log(r.message || '🍽️ Fed elemental!', 'log-arrive');
        // Refresh character data
        const charR = await apiFetch('GET', '/game/character');
        if (charR) Object.assign(getChar(), charR);
        renderDungeonView();
      } else {
        log('⚠️ ' + (r.error || 'Failed to feed'), 'log-danger');
      }
    } catch (e) {
      log('⚠️ Error feeding elemental', 'log-danger');
    }
  };

  global.dungeonElementalInfo = async function() {
    await fetchElemental();
    renderDungeonView();
  };

  global.closeDungeonOverlay = function() {
    const overlay = document.getElementById('dungeon-overlay');
    if (overlay) overlay.innerHTML = '';
  };

  global.debugDungeonMonsters = function() {
    console.log('=== MONSTER CREATION DEBUG ===');
    
    // Check if the condition is being evaluated
    const dungeonDef = getDungeonDef('tower');
    console.log('dungeonDef exists:', !!dungeonDef);
    console.log('dungeonDef.monsters length:', dungeonDef.monsters.length);
    
    // Check a specific room that should have monsters (room 1)
    const room1 = D.rooms[1];
    console.log('Room 1 details:', {
        isStart: room1.isStart,
        isBoss: room1.isBoss,
        type: room1.type,
        connections: room1.connections,
        monsters: room1.monsters
    });
    
    // Manually test if a monster would be created for room 1
    const shouldCreateMonster = !room1.isStart && !room1.isBoss && dungeonDef && chance(0.7);
    console.log('Should create monster for room 1?', shouldCreateMonster);
    
    // Check if the monster pool has valid monsters
    console.log('Monster pool sample:', dungeonDef.monsters[0]);
};
  global.testMonsterCreation = function() {
    const dungeonDef = getDungeonDef('tower');
    let monsterCount = 0;
    for(let i = 0; i < 100; i++) {
        if (!false && !false && dungeonDef && Math.random() < 0.7) {
            monsterCount++;
        }
    }
    console.log('Monster creation would happen', monsterCount, 'out of 100 times');
};
  function resetDungeonState() {
    D = {
      tokens: 0,
      activeDungeon: null,
      floor: 1,
      highestFloor: 1,
      rooms: [],
      playerPos: 0,
      exploredRooms: new Set(),
      floorRunId: null,
      crawler: null,
      combat: null,
      travelTimer: null,
      isTraveling: false,
      dungeonLog: [],
      savedProgress: {},
      dungeonInventory: [],
      dungeonGold: 0,
      blacksmithUnlocked: false,
      guildReputation: 0,
    };
    try { localStorage.removeItem('dungeon_state'); } catch(e) {}
  }

  global.resetDungeonState = resetDungeonState;
  global.openGuild = openGuild;
global.closeGuild = closeGuild;
global.exchangeAtGuild = exchangeAtGuild;
global.closeExchangeRewardModal = function() {
  const modal = document.querySelector('.exchange-reward-modal');
  if (modal) modal.remove();
  D._pendingExchangeModal = false;
  renderGuild();
};
global.claimGuildBounty = claimGuildBounty;
  global.createGuildRaid    = createGuildRaid;
  global.joinGuildRaid      = joinGuildRaid;
  global.leaveGuildRaid     = leaveGuildRaid;
  global.deleteGuildRaid    = deleteGuildRaid;
  global.startGuildRaid     = startGuildRaid;
  global.claimGuildRaidReward = claimGuildRaidReward;
  global.updateGuildRaidSettings = updateGuildRaidSettings;
  global.recruitGuildRaidMercenary = recruitGuildRaidMercenary;
  global.dungeonEnter        = enterDungeon;
  global.dungeonTravel       = travelToRoom;
  global.dungeonFight        = initiateFight;
  global.dungeonAttack       = fightRound;
  global.dungeonRunCombat    = () => { if(D.combat) tryRun(D.combat.roomIdx); };
  global.dungeonEscapeConfirm = () => { if(D.combat) confirmEscape(D.combat.roomIdx); };
  global.dungeonEscapeCancel  = () => { cancelEscape(); };
  global.dungeonFightBoss    = fightBoss;
  global.dungeonExit         = dungeonExit;
  global.closeDungeonVictory = closeDungeonVictory;
  global.toggleMonsterLore   = toggleMonsterLore;
  global.deckNav             = deckNav;
  global.selectMonster       = selectMonster;
  global.selectAttack        = selectAttack;
  global.roomDeckNav         = roomDeckNav;
  global.dungeonElementalInfo = globalThis.dungeonElementalInfo;
  global.dungeonDiscoverElemental = globalThis.dungeonDiscoverElemental;
  global.dungeonShowFeedModal = globalThis.dungeonShowFeedModal;
  global.dungeonFeedElemental = globalThis.dungeonFeedElemental;
  global.closeDungeonOverlay = globalThis.closeDungeonOverlay;
  global.renderDungeonTab    = function() {
    renderDungeonTab();
    if (character) {
      loadDungeonDataFromDB();
    }
  };

  // ── Init ───────────────────────────────────────────────────
  loadCSS();
  loadState();

})(window);
