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
  const TRAVEL_BASE_MS    = 8000;
  const TRAVEL_DISCOVERED_MS = 2200;
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
    desc: 'Convert 100 dungeon gold into 80 real gold + 1 reputation point' },
  
  { id: 'exchange_materials', name: 'Material Bounty', icon: '📦', 
    cost: { crypt_dust: 10, void_shard: 5 }, reward: { gold: 200, reputation: 2 },
    desc: 'Trade 10 Crypt Dust and 5 Void Shards for 200 gold' },
  
  { id: 'exchange_rare', name: 'Rare Material Bounty', icon: '✨', 
    cost: { dragon_scale: 3, soul_essence: 2 }, reward: { gold: 500, reputation: 5, item: 'Rare Item Chest' },
    desc: 'Trade rare materials for a Rare Item Chest + reputation' },
  
  { id: 'exchange_legendary', name: 'Legendary Exchange', icon: '👑', 
    cost: { abyssal_core: 2, titan_heart: 1 }, reward: { gold: 2000, reputation: 20, item: 'Legendary Item Chest' },
    desc: 'Trade legendary materials for a Legendary Item Chest + major reputation' },
];

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
    { name:'Shadow Stalker',     icon:'🐺', baseHp:400, baseAtk:55, baseDef:25, tokenCost:5,  minFloor:5, image:'/images/dungeon/miniboss1.jpg' },
    { name:'Crystal Golem',      icon:'💎', baseHp:600, baseAtk:40, baseDef:45, tokenCost:6,  minFloor:15, image:'/images/dungeon/miniboss2.jpg' },
    { name:'Flame Revenant',     icon:'🔥', baseHp:350, baseAtk:70, baseDef:20, tokenCost:7,  minFloor:20, image:'/images/dungeon/miniboss3.jpg' },
    { name:'Frost Wyrmling',     icon:'❄️', baseHp:450, baseAtk:60, baseDef:30, tokenCost:8,  minFloor:25, image:'/images/dungeon/miniboss4.jpg' },
    { name:'Void Stalker',       icon:'🌑', baseHp:500, baseAtk:75, baseDef:28, tokenCost:9,  minFloor:30, image:'/images/dungeon/miniboss5.jpg' },
    { name:'Doom Knight',        icon:'⚔️', baseHp:700, baseAtk:65, baseDef:50, tokenCost:10, minFloor:35, image:'/images/dungeon/miniboss6.jpg' },
];

const CRAWLER_BASE = {
    id: 'the_crawler',
    name: 'The Crawler',
    icon: '🕷️',
    image: '/images/dungeon/crawler.jpg',
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
        const monsters = room.monsters.map(monster => rebalanceMiniBossMonster(monster, floor));
        return { ...room, monsters };
    });
}

function getCrawlerForFloor(floor) {
    const boss = getBossForFloor(floor);
    return {
        id: CRAWLER_BASE.id,
        name: CRAWLER_BASE.name,
        icon: CRAWLER_BASE.icon,
        image: CRAWLER_BASE.image,
        hp: Math.round(boss.hp * 1.45),
        atk: Math.round(boss.atk * 1.35),
        def: Math.round(boss.def * 1.25),
        steal: false,
        isCrawler: true,
        currentHp: Math.round(boss.hp * 1.45),
        maxHp: Math.round(boss.hp * 1.45),
        lastKilled: null,
        stolenItems: [],
    };
}

  const MONSTER_POOL = [
    { id:'skeleton',    name:'Skeleton Warrior', icon:'💀', hp:80,  atk:12, def:5,  steal:true,  minFloor:1  },
    { id:'ghost',       name:'Wailing Ghost',    icon:'👻', hp:60,  atk:18, def:2,  steal:false, minFloor:1  },
    { id:'zombie',      name:'Rotting Zombie',   icon:'🧟', hp:120, atk:8,  def:8,  steal:true,  minFloor:1  },
    { id:'lich',        name:'Lich Apprentice',  icon:'🧙', hp:70,  atk:22, def:3,  steal:false, minFloor:3  },
    { id:'fire_imp',    name:'Fire Imp',         icon:'😈', hp:90,  atk:20, def:6,  steal:false, minFloor:3  },
    { id:'lava_golem',  name:'Lava Golem',       icon:'🗿', hp:180, atk:14, def:22, steal:false, minFloor:5  },
    { id:'salamander',  name:'Fire Salamander',  icon:'🦎', hp:110, atk:25, def:8,  steal:true,  minFloor:5  },
    { id:'pyromancer',  name:'Pyromancer Shade', icon:'🔥', hp:85,  atk:32, def:4,  steal:false, minFloor:7  },
    { id:'void_wraith', name:'Void Wraith',      icon:'🌑', hp:130, atk:38, def:10, steal:true,  minFloor:8  },
    { id:'abyssal_eye', name:'Abyssal Eye',      icon:'👁️', hp:100, atk:45, def:5,  steal:false, minFloor:10 },
    { id:'shadow_lord', name:'Shadow Lord',      icon:'🕷️', hp:200, atk:30, def:28, steal:true,  minFloor:12 },
    { id:'void_titan',  name:'Void Titan',       icon:'💠', hp:250, atk:42, def:35, steal:true,  minFloor:15 },
    { id:'dread_knight',name:'Dread Knight',     icon:'⚔️', hp:300, atk:50, def:40, steal:true,  minFloor:20 },
    { id:'elder_lich',  name:'Elder Lich',       icon:'💜', hp:220, atk:60, def:20, steal:false, minFloor:25 },
    { id:'shadow_stalker', name:'Shadow Stalker', icon:'🐺', hp:400, atk:55, def:25, steal:true, minFloor:10, isMiniBoss: true, tokenCost: 5 },
    { id:'crystal_golem', name:'Crystal Golem', icon:'💎', hp:600, atk:40, def:45, steal:false, minFloor:15, isMiniBoss: true, tokenCost: 6 },
    { id:'flame_revenant', name:'Flame Revenant', icon:'🔥', hp:350, atk:70, def:20, steal:false, minFloor:20, isMiniBoss: true, tokenCost: 7 },
    { id:'frost_wyrmling', name:'Frost Wyrmling', icon:'❄️', hp:450, atk:60, def:30, steal:true, minFloor:25, isMiniBoss: true, tokenCost: 8 },
    { id:'void_stalker', name:'Void Stalker', icon:'🌑', hp:500, atk:75, def:28, steal:true, minFloor:30, isMiniBoss: true, tokenCost: 9 },
    { id:'doom_knight', name:'Doom Knight', icon:'⚔️', hp:700, atk:65, def:50, steal:true, minFloor:35, isMiniBoss: true, tokenCost: 10 },
  ];

const BOSS_POOL = [
    { name:'Death Knight Malachar', icon:'⚔️💀', image:'/images/boss/malachar.jpg', baseHp:600,  baseAtk:45, baseDef:20, steal:true  },
    { name:'Ignarath the Eternal',  icon:'🌋🔥', image:'/images/boss/ignarath.jpg',  baseHp:700,  baseAtk:55, baseDef:25, steal:false },
    { name:'Nyxaroth the Devourer', icon:'🌑👁️', image:'/images/boss/nyxaroth.jpg',  baseHp:800,  baseAtk:65, baseDef:30, steal:true  },
    { name:'The Hollow King',       icon:'👑💀', image:'/images/boss/hollowking.jpg', baseHp:900,  baseAtk:70, baseDef:35, steal:true  },
    { name:'Voidborn Colossus',     icon:'💠🌑', image:'/images/boss/voidborn.jpg',   baseHp:1000, baseAtk:80, baseDef:40, steal:false },
    { name:'The Undying Empress',   icon:'👸🔥', image:'/images/boss/empress.jpg',    baseHp:1100, baseAtk:90, baseDef:45, steal:true  },
    { name:'Abyssal Sovereign',     icon:'🌊💀', image:'/images/boss/sovereign.jpg',  baseHp:1200, baseAtk:95, baseDef:50, steal:true  },
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
    { type:'gold',       weight:84, min:12, max:70  },
    { type:'potion_hp',  weight:7,  icon:'??' },
    { type:'potion_mp',  weight:3, name:'Mana Potion',    icon:'??', mp:30    },
    { type:'item_common',weight:6 },
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
    { name:'Iron Shard',       icon:'🔩', type:'material', rarity:'common' },
    { name:'Bone Fragment',    icon:'🦴', type:'material', rarity:'common' },
    { name:'Dim Crystal',      icon:'💎', type:'material', rarity:'common' },
    { name:'Frayed Cloth',     icon:'🧵', type:'material', rarity:'common' },
    { name:'Tarnished Coin',   icon:'🪙', type:'material', rarity:'common' },
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
        parsed.rooms = normalizeMiniBossRooms(parsed.rooms || [], parsed.floor || 1);
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
      
      if (response.progress && response.progress.activeDungeon) {
        D.savedProgress[response.progress.activeDungeon] = {
          floor: response.progress.floor,
          pos: response.progress.playerPos,
          rooms: normalizeMiniBossRooms(response.progress.rooms || [], response.progress.floor || 1),
          explored: response.progress.exploredRooms,
          combat: response.progress.combat,
          crawler: response.progress.crawler || null,
          floorRunId: response.progress.floorRunId || null
        };
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
      roundLog: [{
        actor: 'monster',
        text: source === 'chase'
          ? `The Crawler catches up to you and blocks the path ahead!`
          : `The Crawler drops from the dark and pins your escape route!`
      }],
      isCrawler: true,
    };
    log(`🕷️ The Crawler is upon you! Running may be your only chance.`, 'log-danger');
    saveState();
    saveProgressToDB();
    renderCombatPanel();
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
  
  let atk, def;
  
  // Calculate based on class
  switch(c.class) {
    case 'mage':
      // Mages use Magic for damage, Agility for dodge (defense)
      atk = (c.magic || 10) * 2.5 + (c.intelligence || 0) * 0.5;
      def = (c.defense || 5) + (c.agility || 10) * 0.2;
      break;
      
    case 'rogue':
      // Rogues use Agility for damage and dodge
      atk = (c.agility || 10) * 2.2 + (c.strength || 10) * 0.8;
      def = (c.defense || 5) + (c.agility || 10) * 0.4;
      break;
      
    case 'paladin':
      // Paladins use Strength and Magic hybrid
      atk = (c.strength || 10) * 1.5 + (c.magic || 10) * 1.0;
      def = (c.defense || 5) + (c.strength || 10) * 0.3 + (c.magic || 10) * 0.2;
      break;
      
    case 'warrior':
    default:
      // Warriors use Strength for damage, Agility for some dodge
      atk = (c.strength || 10) * 2 + (c.agility || 10) * 0.5;
      def = (c.defense || 5) + (c.strength || 10) * 0.3;
      break;
  }
  
  const hp = c.hp_current || c.hp || 100;
  const maxHp = c.hp_max || 100;
  
  return { 
    atk: Math.floor(atk), 
    def: Math.floor(def), 
    hp: hp, 
    maxHp: maxHp 
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
    if (D.savedProgress['tower']) {
        const s = D.savedProgress[dungeonId];
        D.activeDungeon = 'tower';
        D.floor = s.floor;
        D.rooms = normalizeMiniBossRooms(s.rooms || [], s.floor || 1);
        D.playerPos = s.pos;
        D.exploredRooms = new Set(s.explored);
        D.crawler = s.crawler || null;
        D.floorRunId = s.floorRunId || createFloorRunId();
        
        if (!D.rooms || D.rooms.length === 0) {
            D.rooms = normalizeMiniBossRooms(generateFloor('tower', D.floor), D.floor);
            D.playerPos = D.rooms.findIndex(r => r.isStart);
            D.exploredRooms = new Set([D.playerPos]);
            D.crawler = spawnCrawlerForCurrentFloor();
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
    const startFloor = D.floor || 1;  // already set by loadDungeonDataFromDB
    D.rooms = normalizeMiniBossRooms(generateFloor('tower', startFloor), startFloor);
    
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

    const travelMs = TRAVEL_BASE_MS + rand(0, 3000);
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

    // Check if already cleared (server-side protection)
    if (room.monstersCleared) {
        log(`⚠️ This room has already been cleared!`, 'log-warning');
        return;
    }

    // Check if any monsters are alive
    const anyAlive = room.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
    if (!anyAlive) {
        const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - room.monsters[0].lastKilled) / 3600000).toFixed(1);
        log(`💤 Monsters respawn in ${hoursLeft}h`, 'log-info');
        return;
    }

    D.combat = {
        roomIdx,
        monsters: room.monsters.map(m => ({ ...m, currentHp: m.currentHp || m.maxHp })),
        currentMonsterIndex: 0,
        playerHpBefore: getChar()?.hp_current || getChar()?.hp || 100,
        roundLog: [],
    };
    renderCombatPanel();
}

function fightRound() {
    if (!D.combat) return;
    
    const c = getChar();
    if (!c) return;
    
    const currentHp = c.hp_current || c.hp || 100;
    const pStats = { 
        atk: calcPlayerStats().atk, 
        def: calcPlayerStats().def, 
        hp: currentHp, 
        maxHp: c.hp_max || 100 
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
        D.combat.currentMonsterIndex = nextIndex;
        renderCombatPanel();
    }
} else {
    renderCombatPanel();
}

function onCrawlerDefeated() {
    if (!D.crawler) return;
    D.crawler.defeated = true;
    D.crawler.active = false;
    D.crawler.encountered = false;
    D.crawler.chaseTurnsLeft = 0;
    D.crawler.monster.currentHp = 0;
    log(`🏆 Against all odds, you bring down The Crawler!`, 'log-boss');
    D.combat = null;
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
                log(`⚠️ Room already cleared — no loot gained.`, 'log-warning');
                room.monstersCleared = Date.now(); // sync local state
                D.combat = null;
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
            saveState();
            saveProgressToDB();
            renderDungeonView();
        })
        .catch(e => {
            // Network error or server rejection — do NOT grant loot
            console.error('Failed to mark room cleared:', e);
            log(`⚠️ Server error confirming room clear. No loot granted. Try reconnecting.`, 'log-warning');
            D.combat = null;
            saveState();
            saveProgressToDB();
            renderDungeonView();
        });
}

function tryRun(roomIdx) {
    if (chance(RUN_ESCAPE_CHANCE)) {
        log(`💨 Escaped successfully!`, 'log-success');
        if (D.combat && D.combat.isCrawler && D.crawler) {
            D.crawler.active = true;
            D.crawler.roomIdx = roomIdx;
        }
        
        // Release room entry
        if (!(D.combat && D.combat.isCrawler)) {
            apiFetch('POST', '/game/dungeon/room-exit', { floor: D.floor, roomIndex: roomIdx })
                .catch(e => console.error('Failed to exit room:', e));
        }
        
        D.combat = null;
        saveState();
        saveProgressToDB();
        renderDungeonView();
    } else {
        log(`⚠️ Failed to escape! The monsters attack!`, 'log-danger');
        const c = getChar();
        if (c && D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
            const pStats = calcPlayerStats();
            let totalDamage = 0;
            
            for (let i = 0; i < D.combat.monsters.length; i++) {
                const m = D.combat.monsters[i];
                if (m.currentHp > 0) {
                    const mDmg = Math.max(1, Math.floor(m.atk - pStats.def * 0.5 + rand(-2, 2)));
                    totalDamage += mDmg;
                    log(`💥 ${m.name} hits you for ${mDmg}!`, 'log-danger');
                }
            }
            
            c.hp_current = Math.max(0, (c.hp_current || c.hp || 100) - totalDamage);
            c.hp = c.hp_current;
            
            if (c.hp_current <= 0) {
                onPlayerDeath();
                return;
            }
            renderCombatPanel();
        }
    }
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
    const c = getChar();
    if (c && c.hp_current !== undefined) c.hp = c.hp_current;
    
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
    D.activeDungeon = null;
    saveState();
    saveProgressToDB();
    setTimeout(() => renderDungeonList(), 1500);
}

async function fightBoss(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.isBoss) return;
    
    const success = await spendTokens(TOKENS_PER_RUN);
    if (!success) {
      log(`🗝️ Need ${TOKENS_PER_RUN} tokens to challenge the boss. You have ${D.tokens}.`, 'log-danger');
      return;
    }
    
    const _def = getDungeonDef();
    const boss = _def.boss;

    D.combat = {
      roomIdx,
      monsters: [{  // Changed to array
        ...boss,
        currentHp: boss.hp,
        maxHp: boss.hp,
        stolenItems: [],
        isBoss: true,
      }],
      currentMonsterIndex: 0,
      roundLog: [],
    };
    renderCombatPanel();
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

        const canJoin = raid.status === 'forming' && !raid.isMember && raid.memberCount < 6;
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
                    ${canStart ? `<button class="exchange-btn" ${actionAttrs('startGuildRaid', raid.id)}>Start Raid</button>` : ''}
                    ${canClaim ? `<button class="exchange-btn" ${actionAttrs('claimGuildRaidReward', raid.id)}>Claim Reward</button>` : ''}
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
        const canJoin = raid.status === 'forming' && !raid.isMember && raid.memberCount < 6;
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
                    ` : ''}
                    ${canJoin ? `<button class="exchange-btn" ${actionAttrs('joinGuildRaid', raid.id)}>Join Raid</button>` : ''}
                    ${canStart ? `<button class="exchange-btn" ${actionAttrs('startGuildRaid', raid.id)}>Start Raid</button>` : ''}
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

function createGuildRaid() {
    const floor = Number(document.getElementById('guild-raid-floor')?.value || 1);
    const autoStartPlayers = Number(document.getElementById('guild-raid-autostart')?.value || 0);
    apiFetch('POST', '/game/dungeon/guild/raid/create', { floor, autoStartPlayers })
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
    apiFetch('POST', '/game/dungeon/guild/raid/update-settings', { raidId, autoStartPlayers })
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
    return `<div class="dungeon-floor-preview-card" style="border-color:${t.theme}55">
        <div style="font-size:0.62rem;color:var(--dungeon-muted)">Floor ${fl}</div>
        <img src="${boss.image}" alt="${boss.name}" style="width:48px;height:48px;object-fit:cover;border-radius:50%;margin:5px 0;border:1px solid ${t.theme}" data-error-hide="true" data-error-next-display="block">
        <div style="display:none;font-size:1.4rem">${boss.icon}</div>
        <div style="font-size:0.62rem;color:#e2e8f0;text-align:center;line-height:1.3">${boss.name.split(' ').slice(0,2).join(' ')}</div>
        <div style="font-size:0.6rem;color:var(--dungeon-muted)">❤️${boss.hp}</div>
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

    const overlay = document.getElementById('dungeon-overlay');
    if (overlay) overlay.innerHTML = '';
    
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

    area.innerHTML = `
      <div class="dungeon-game" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
        <div class="dungeon-game-screen">
          ${roomImage ? `
            <img class="dungeon-game-scene" src="${roomImage}" alt="Dungeon Scene" data-error-hide="true">
          ` : `<div class="dungeon-game-scene dungeon-game-scene-fallback"></div>`}
          <div class="dungeon-game-vignette"></div>

<div class="dungeon-hud-top">
  <div class="dungeon-hud-title">${def.icon} ${def.name}</div>
  <div class="dungeon-hud-floor">Floor ${D.floor}</div>
  <div class="dungeon-hud-actions">
    <button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('openGuild')}>Guild</button>
    <button class="dungeon-btn dungeon-btn-exit dungeon-btn-hud" ${actionAttrs('dungeonExit')}>Exit</button>
  </div>
</div>

          <div class="dungeon-hud-minimap">
            <div class="dungeon-hud-minimap-title">Map</div>
            <div id="dungeon-minimap" class="dungeon-minimap">${renderMapGrid()}</div>
          </div>

          <div class="dungeon-hud-center">
            <div class="dungeon-hud-room ${currentRoom.monsters && currentRoom.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)) ? 'has-monster' : ''}">
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
    const monsterCount = room.monsters ? room.monsters.length : 0;
    const aliveCount = room.monsters ? room.monsters.filter(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)).length : 0;

    if (room.isBoss) {
        const def = getDungeonDef(D.activeDungeon);
        const boss = def.boss;
        return `
            <div class="dungeon-boss-room">
                <img src="${boss.image}" alt="${boss.name}" style="width:80px;height:80px;object-fit:cover;border-radius:50%;margin-bottom:10px;border:2px solid var(--dungeon-gold)" data-error-hide="true" data-error-next-display="block">
                <div style="display:none;font-size:3rem">${boss.icon}</div>
                <div class="boss-name-big">${boss.name}</div>
                <div class="boss-stats">
                    ❤️ ${boss.hp} HP · ⚔️ ${boss.atk} ATK · 🛡️ ${boss.def} DEF
                </div>
                <div class="boss-drop-preview">
                    Drops: 💰${boss.loot.gold[0]}-${boss.loot.gold[1]} gold · 💎${boss.loot.gems[0]}-${boss.loot.gems[1]} gems · ✨ Random Premium Feature (${boss.loot.premiumDays[0]}-${boss.loot.premiumDays[1]} days)
                </div>
                <button class="dungeon-btn dungeon-btn-fight boss-fight-btn" ${actionAttrs('dungeonFightBoss', room.id)}>
                    ⚔️ Challenge Boss (${TOKENS_PER_RUN} Tokens Required)
                </button>
            </div>
        `;
    }

    if (room.isMiniBoss && anyMonsterAlive) {
        const m = aliveMonster;
        const hpPct = Math.round(m.currentHp / m.maxHp * 100);
        return `
            <div class="dungeon-room-monster">
                <div class="monster-icon">⚠️ ${m.icon}</div>
                <div class="monster-info">
                    <div class="monster-name">MINI-BOSS: ${m.name}</div>
                    <div class="monster-hp-bar-wrap">
                        <div class="monster-hp-bar" style="width:${hpPct}%"></div>
                    </div>
                    <div class="monster-stats">❤️ ${m.currentHp}/${m.maxHp} · ⚔️ ${m.atk} · 🛡️ ${m.def}</div>
                </div>
                <div class="monster-btns">
                    <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonFightMiniBoss', room.id)}>⚔️ Challenge Mini-Boss</button>
                </div>
            </div>
        `;
    }

    if (anyMonsterAlive) {
        const m = aliveMonster;
        const hpPct = Math.round(m.currentHp / m.maxHp * 100);
        const monsterNames = room.monsters.map(m => m.name).join(', ');
        
        return `
            <div class="dungeon-room-monster">
                <div class="monster-icon">${monsterCount > 1 ? `👥 ${monsterCount}x` : m.icon}</div>
                <div class="monster-info">
                    <div class="monster-name">${monsterCount > 1 ? `${monsterCount} Enemies` : m.name}</div>
                    <div class="monster-list" style="font-size:0.7rem;color:var(--dungeon-muted);margin-bottom:6px">
                        ${monsterNames}
                    </div>
                    <div class="monster-hp-bar-wrap">
                        <div class="monster-hp-bar" style="width:${hpPct}%"></div>
                    </div>
                    <div class="monster-stats">
                        ${monsterCount > 1 ? `${aliveCount} enemies remaining` : `❤️ ${m.currentHp}/${m.maxHp} · ⚔️ ${m.atk} · 🛡️ ${m.def}`}
                        ${m.steal && monsterCount === 1 ? '· 🎒 Can steal' : ''}
                    </div>
                    ${monsterCount > 1 ? `<div class="monster-warning" style="font-size:0.65rem;color:#e74c3c;margin-top:4px">⚠️ All enemies attack together each round!</div>` : ''}
                </div>
                <div class="monster-btns">
                    <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonFight', room.id)}>⚔️ Fight</button>
                    <button class="dungeon-btn dungeon-btn-run" ${actionAttrs('dungeonRun', room.id)}>💨 Run (75%)</button>
                </div>
                ${m.stolenItems && m.stolenItems.length > 0 ? `
                    <div class="stolen-items-notice">
                        🎒 Carrying stolen items: ${m.stolenItems.map(i=>i.name).join(', ')}
                    </div>` : ''}
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
    const def = getDungeonDef(D.activeDungeon);
    const monsters = D.combat.monsters;
    const currentMonster = monsters[D.combat.currentMonsterIndex];
    const pStats = calcPlayerStats();
    const hpPct = Math.round(currentMonster.currentHp / currentMonster.maxHp * 100);
    const pHpPct = Math.round((pStats.hp / pStats.maxHp) * 100);
    
    // Build monster list HTML
    const monsterListHtml = monsters.map((m, idx) => {
        const isCurrent = idx === D.combat.currentMonsterIndex;
        const isDead = m.currentHp <= 0;
        const hpPercent = isDead ? 0 : Math.round(m.currentHp / m.maxHp * 100);
        return `
            <div class="combat-monster-entry ${isCurrent ? 'current-target' : ''} ${isDead ? 'defeated' : ''}" style="margin-bottom:8px;padding:6px;border-radius:6px;background:${isCurrent ? 'rgba(255,255,255,0.1)' : 'transparent'}">
                <div style="display:flex;align-items:center;gap:8px">
                    <span class="fighter-icon" style="font-size:1.2rem">${isDead ? '💀' : m.icon}</span>
                    <div style="flex:1">
                        <div style="font-size:0.7rem">${m.name} ${isCurrent ? '(current)' : ''}</div>
                        <div class="fighter-hp-bar-wrap" style="height:6px">
                            <div class="fighter-hp-bar monster-hp" style="width:${hpPercent}%;height:6px"></div>
                        </div>
                    </div>
                    <div style="font-size:0.65rem">${isDead ? 'DEFEATED' : `${m.currentHp}/${m.maxHp}`}</div>
                </div>
            </div>
        `;
    }).join('');

    const roundEntries = D.combat.roundLog.slice(-10).reverse().map(e =>
        `<div class="combat-log-entry ${e.actor}">${e.text}</div>`
    ).join('');

    overlay.innerHTML = `
        <div class="dungeon-overlay-backdrop"></div>
        <div class="dungeon-overlay-card dungeon-combat-panel" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
            <div class="combat-header">
                ${D.combat.isCrawler ? `<div class="combat-boss-warning">🕷️ THE CRAWLER</div>` : currentMonster.isBoss ? `<div class="combat-boss-warning">⚠️ BOSS BATTLE</div>` : ''}
                <div class="combat-title">${D.combat.isCrawler ? 'Run or be torn apart.' : `⚔️ Combat: ${monsters.length} Enemies`}</div>
            </div>

            <div class="combat-fighters">
                <div class="combat-fighter player-fighter">
                    <div class="fighter-icon">🧙</div>
                    <div class="fighter-name">You</div>
                    <div class="fighter-hp-bar-wrap">
                        <div class="fighter-hp-bar player-hp" style="width:${pHpPct}%"></div>
                    </div>
                    <div class="fighter-stats">${pStats.hp} / ${pStats.maxHp} HP</div>
                </div>

                <div class="combat-vs">VS</div>

                <div class="combat-fighter monster-fighter" style="flex-direction:column;align-items:stretch">
                    <div class="fighter-name" style="margin-bottom:8px">Enemies</div>
                    ${monsterListHtml}
                </div>
            </div>

            <div class="combat-log">${roundEntries || '<div class="combat-log-entry" style="color:var(--dungeon-muted)">Battle begins...</div>'}</div>

            <div class="combat-actions">
                <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonAttack')}>⚔️ Strike</button>
                <button class="dungeon-btn dungeon-btn-run" ${actionAttrs('dungeonRunCombat')}>💨 Flee (75%)</button>
            </div>
        </div>
    `;
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
    
    // Save to database FIRST
    saveProgressToDB();
    
    // Release lock
    stopLockRefresh();
    
    // THEN clear the active dungeon
    D.activeDungeon = null;
    D.combat = null;
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
  
  // Make sure D.dungeonInventory exists
  if (!D.dungeonInventory) D.dungeonInventory = [];
  
  apiFetch('GET', '/game/dungeon/guild').then(guildData => {
    const reputation = guildData.guildReputation || 0;
    const dungeonGold = guildData.dungeonGold || 0;
    const bounty = guildData.bounty || null;
    
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
              // Check if player can afford this exchange
              let canExchange = true;
              let missingReason = '';
              
              if (exchange.cost.dungeonGold && dungeonGold < exchange.cost.dungeonGold) {
                canExchange = false;
                missingReason = `Need ${exchange.cost.dungeonGold} dungeon gold`;
              }
              
              // Check material costs
              if (exchange.cost.crypt_dust) {
                const have = D.dungeonInventory.find(i => i.id === 'crypt_dust')?.qty || 0;
                if (have < exchange.cost.crypt_dust) {
                  canExchange = false;
                  missingReason = `Need ${exchange.cost.crypt_dust - have} more Crypt Dust`;
                }
              }
              if (exchange.cost.void_shard) {
                const have = D.dungeonInventory.find(i => i.id === 'void_shard')?.qty || 0;
                if (have < exchange.cost.void_shard) {
                  canExchange = false;
                  missingReason = `Need ${exchange.cost.void_shard - have} more Void Shards`;
                }
              }
              if (exchange.cost.dragon_scale) {
                const have = D.dungeonInventory.find(i => i.id === 'dragon_scale')?.qty || 0;
                if (have < exchange.cost.dragon_scale) canExchange = false;
              }
              if (exchange.cost.soul_essence) {
                const have = D.dungeonInventory.find(i => i.id === 'soul_essence')?.qty || 0;
                if (have < exchange.cost.soul_essence) canExchange = false;
              }
              if (exchange.cost.abyssal_core) {
                const have = D.dungeonInventory.find(i => i.id === 'abyssal_core')?.qty || 0;
                if (have < exchange.cost.abyssal_core) canExchange = false;
              }
              if (exchange.cost.titan_heart) {
                const have = D.dungeonInventory.find(i => i.id === 'titan_heart')?.qty || 0;
                if (have < exchange.cost.titan_heart) canExchange = false;
              }
              
              const discount = currentRank.discount / 100;
              const discountedGold = exchange.reward.gold ? Math.floor(exchange.reward.gold * (1 + discount)) : exchange.reward.gold;
              
              return `
                <div class="exchange-card ${canExchange ? 'exchange-available' : 'exchange-unavailable'}">
                  <div class="exchange-icon">${exchange.icon}</div>
                  <div class="exchange-info">
                    <div class="exchange-name">${exchange.name}</div>
                    <div class="exchange-desc">${exchange.desc}</div>
                    <div class="exchange-cost">
                      ${exchange.cost.dungeonGold ? `<span class="cost-item">💰 ${exchange.cost.dungeonGold} Dungeon Gold</span>` : ''}
                      ${exchange.cost.crypt_dust ? `<span class="cost-item">💀 ${exchange.cost.crypt_dust}x Crypt Dust</span>` : ''}
                      ${exchange.cost.void_shard ? `<span class="cost-item">🔮 ${exchange.cost.void_shard}x Void Shard</span>` : ''}
                      ${exchange.cost.dragon_scale ? `<span class="cost-item">🐉 ${exchange.cost.dragon_scale}x Dragon Scale</span>` : ''}
                      ${exchange.cost.soul_essence ? `<span class="cost-item">✨ ${exchange.cost.soul_essence}x Soul Essence</span>` : ''}
                      ${exchange.cost.abyssal_core ? `<span class="cost-item">🌑 ${exchange.cost.abyssal_core}x Abyssal Core</span>` : ''}
                      ${exchange.cost.titan_heart ? `<span class="cost-item">💠 ${exchange.cost.titan_heart}x Titan Heart</span>` : ''}
                    </div>
                    <div class="exchange-reward">
                      <span class="reward-gold">💰 ${discountedGold.toLocaleString()} Gold</span>
                      ${exchange.reward.reputation ? `<span class="reward-rep">⭐ +${exchange.reward.reputation} Reputation</span>` : ''}
                      ${exchange.reward.item ? `<span class="reward-item">📦 ${exchange.reward.item}</span>` : ''}
                      ${currentRank.discount > 0 ? `<span class="reward-discount">✨ +${currentRank.discount}% Gold Bonus (${currentRank.name})</span>` : ''}
                    </div>
<button class="exchange-btn" ${actionAttrs('exchangeAtGuild', exchange.id)} ${!canExchange ? 'disabled' : ''}>
                      ${canExchange ? 'Exchange' : missingReason || 'Missing Requirements'}
                    </button>
                  </div>
                </div>
              `;
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
  renderGuild();
}

function closeGuild() {
  const overlay = document.getElementById('dungeon-overlay');
  if (overlay) overlay.innerHTML = '';
  renderDungeonView();
}

function exchangeAtGuild(exchangeId) {
  apiFetch('POST', '/game/dungeon/guild/exchange', { exchangeId })
    .then(response => {
      if (response.success) {
        log(response.message, 'log-success');
        // Refresh dungeon gold and reputation
        const goldEl = document.getElementById('dungeon-gold-count');
        if (goldEl) goldEl.textContent = response.dungeonGold;
        renderGuild(); // Refresh guild view
        refreshCharacter(); // Refresh main character
      }
    })
    .catch(e => console.error('Exchange failed:', e));
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
    
    const miniBoss = room.monsters[0];  // Changed from room.monster
    D.combat = {
        roomIdx,
        monsters: [{ ...miniBoss, currentHp: miniBoss.maxHp }],  // Changed to array
        currentMonsterIndex: 0,
        playerHpBefore: getChar()?.hp_current || getChar()?.hp || 100,
        roundLog: [],
        isMiniBoss: true,
    };
    renderCombatPanel();
}

  // ── CSS Loading ──────────────────────────────────────────
  function loadCSS() {
    if (document.getElementById('dungeon-css')) return;
    const link = document.createElement('link');
    link.id = 'dungeon-css';
    link.rel = 'stylesheet';
    link.href = 'css/dungeon.css';
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
global.claimGuildBounty = claimGuildBounty;
  global.createGuildRaid    = createGuildRaid;
  global.joinGuildRaid      = joinGuildRaid;
  global.startGuildRaid     = startGuildRaid;
  global.claimGuildRaidReward = claimGuildRaidReward;
  global.updateGuildRaidSettings = updateGuildRaidSettings;
  global.recruitGuildRaidMercenary = recruitGuildRaidMercenary;
  global.dungeonEnter        = enterDungeon;
  global.dungeonTravel       = travelToRoom;
  global.dungeonFight        = initiateFight;
global.dungeonRun = (roomIdx) => {
    const room = D.rooms[roomIdx];
    if (room && room.monsters && room.monsters.length > 0) {
        // Check if any monsters are alive
        const anyAlive = room.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
        if (!anyAlive) {
            log(`💤 All monsters are dead or respawning.`, 'log-info');
            return;
        }
        
        D.combat = { 
            roomIdx, 
            monsters: room.monsters.map(m => ({ 
                ...m, 
                currentHp: m.currentHp || m.maxHp,
                lastKilled: m.lastKilled
            })),
            currentMonsterIndex: 0,
            roundLog: [] 
        };
        tryRun(roomIdx);
    }
};
  global.dungeonAttack       = fightRound;
  global.dungeonRunCombat    = () => { if(D.combat) tryRun(D.combat.roomIdx); };
  global.dungeonFightBoss    = fightBoss;
  global.dungeonExit         = dungeonExit;
  global.closeDungeonVictory = closeDungeonVictory;
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
