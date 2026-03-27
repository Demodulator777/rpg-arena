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
  const MONSTER_RESPAWN_H = 12;
  const TRAVEL_BASE_MS    = 8000;
  const RUN_ESCAPE_CHANCE = 0.75;
  const STEAL_CHANCE      = 0.18;
  const ROOMS_PER_FLOOR   = 12;

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
    treasure: {
      image: '/images/dungeon/treasure.jpg',
      description: "A glint of gold catches your eye! An ornate chest sits in the center of this chamber."
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
  ];

  const BOSS_POOL = [
    { name:'Death Knight Malachar', icon:'⚔️💀', baseHp:600,  baseAtk:45, baseDef:20, steal:true  },
    { name:'Ignarath the Eternal',  icon:'🌋🔥', baseHp:700,  baseAtk:55, baseDef:25, steal:false },
    { name:'Nyxaroth the Devourer', icon:'🌑👁️', baseHp:800,  baseAtk:65, baseDef:30, steal:true  },
    { name:'The Hollow King',       icon:'👑💀', baseHp:900,  baseAtk:70, baseDef:35, steal:true  },
    { name:'Voidborn Colossus',     icon:'💠🌑', baseHp:1000, baseAtk:80, baseDef:40, steal:false },
    { name:'The Undying Empress',   icon:'👸🔥', baseHp:1100, baseAtk:90, baseDef:45, steal:true  },
    { name:'Abyssal Sovereign',     icon:'🌊💀', baseHp:1200, baseAtk:95, baseDef:50, steal:true  },
  ];
  const ROMAN = ['','II','III','IV','V','VI','VII','VIII','IX','X'];

  function getBossForFloor(floor) {
    const idx  = (floor - 1) % BOSS_POOL.length;
    const tier = Math.floor((floor - 1) / BOSS_POOL.length);
    const b    = BOSS_POOL[idx];
    const scale = 1 + (floor - 1) * 0.18 + tier * 0.5;
    return {
      name:  b.name + (tier > 0 ? ' ' + (ROMAN[Math.min(tier, ROMAN.length-1)] || 'X+') : ''),
      icon:  b.icon,
      hp:    Math.round(b.baseHp  * scale),
      atk:   Math.round(b.baseAtk * scale),
      def:   Math.round(b.baseDef * scale),
      steal: b.steal,
      loot: {
        gold:        [100 + floor * 30,  300 + floor * 80],
        gems:        [Math.max(1, floor), Math.max(2, floor * 2)],
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
    { type:'gold',       weight:40, min:5,  max:40  },
    { type:'potion_hp',  weight:25, name:'Health Potion',  icon:'🧪', heal:50  },
    { type:'potion_mp',  weight:15, name:'Mana Potion',    icon:'💧', mp:30    },
    { type:'item_common',weight:20 },
  ];

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
  floor: 1,
  highestFloor: 1,
  rooms: [],
  playerPos: 0,
  exploredRooms: new Set(),
  combat: null,
  travelTimer: null,
  isTraveling: false,
  dungeonLog: [],
  savedProgress: {},
  dungeonInventory: [],  // Make sure this exists
  blacksmithUnlocked: false,
  guildReputation: 0,    // Add this
};

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
        D = { ...D, ...parsed };
      }
    } catch(e) {}
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
    if (response && response.success) {
      D.tokens = response.tokens || 0;
      D.floor = response.floor || 1;
      D.highestFloor = response.highestFloor || 1;
      
      if (response.progress && response.progress.activeDungeon) {
        D.savedProgress[response.progress.activeDungeon] = {
          floor: response.progress.floor,
          pos: response.progress.playerPos,
          rooms: response.progress.rooms,
          explored: response.progress.exploredRooms,
          combat: response.progress.combat
        };
      }
      
      updateTokenDisplay();
      
      // Also load dungeon gold
      const goldRes = await apiFetch('GET', '/game/dungeon/gold');
      if (goldRes && goldRes.success) {
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
          exploredRooms: [...(D.exploredRooms || [])]
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
    const gridW = 5, gridH = 4;
    const total = gridW * gridH;

    const used = new Array(total).fill(false);
    const chosen = [];

    chosen.push(gridH * gridW - gridW);
    used[gridH * gridW - gridW] = true;

    while (chosen.length < ROOMS_PER_FLOOR - 1) {
      const base = chosen[rand(0, chosen.length - 1)];
      const bx = base % gridW, by = Math.floor(base / gridW);
      const neighbors = [];
      if (bx > 0 && !used[by*gridW+(bx-1)]) neighbors.push(by*gridW+(bx-1));
      if (bx < gridW-1 && !used[by*gridW+(bx+1)]) neighbors.push(by*gridW+(bx+1));
      if (by > 0 && !used[(by-1)*gridW+bx]) neighbors.push((by-1)*gridW+bx);
      if (by < gridH-1 && !used[(by+1)*gridW+bx]) neighbors.push((by+1)*gridW+bx);
      if (neighbors.length === 0) continue;
      const pick = neighbors[rand(0, neighbors.length-1)];
      used[pick] = true;
      chosen.push(pick);
    }

    const start = chosen[0];
    let farthest = chosen[0], maxDist = 0;
    for (const c of chosen) {
      const cx = c % gridW, cy = Math.floor(c / gridW);
      const sx = start % gridW, sy = Math.floor(start / gridW);
      const d = Math.abs(cx-sx) + Math.abs(cy-sy);
      if (d > maxDist) { maxDist = d; farthest = c; }
    }

    const dungeonDef = getDungeonDef(dungeonId);

    for (let i = 0; i < chosen.length; i++) {
      const idx = chosen[i];
      const x = idx % gridW, y = Math.floor(idx / gridW);
      const isBoss = (idx === farthest);
      const isStart = (i === 0);

      const connections = [];
      for (let j = 0; j < chosen.length; j++) {
        if (i === j) continue;
        const jx = chosen[j] % gridW, jy = Math.floor(chosen[j] / gridW);
        if ((Math.abs(x-jx) === 1 && y === jy) || (Math.abs(y-jy) === 1 && x === jx)) {
          connections.push(j);
        }
      }

      let monster = null;
      if (!isStart && !isBoss && dungeonDef && chance(0.7)) {
        const m = dungeonDef.monsters[rand(0, dungeonDef.monsters.length-1)];
        monster = {
          ...m,
          currentHp: m.hp + floor * 5,
          maxHp: m.hp + floor * 5,
          atk: m.atk + floor * 2,
          def: m.def + floor,
          lastKilled: null,
          stolenItems: [],
        };
      }

      // Determine room type and visual
      let roomType = isBoss ? 'boss' : isStart ? 'start' : (chance(0.15) ? 'treasure' : 'corridor');
      let visualData = null;
      if (roomType === 'boss') visualData = DUNGEON_VISUALS.boss;
      else if (roomType === 'start') visualData = DUNGEON_VISUALS.start;
      else if (roomType === 'treasure') visualData = DUNGEON_VISUALS.treasure;
      else visualData = DUNGEON_VISUALS.corridor;

      rooms.push({
        id: i,
        gridIdx: idx,
        x, y,
        isBoss,
        isStart,
        connections,
        monster,
        looted: false,
        type: roomType,
        visual: visualData
      });
    }

    return rooms;
  }

  // ── Combat Engine ──────────────────────────────────────────
function calcPlayerStats() {
  const c = getChar();
  if (!c) return { atk: 10, def: 5, hp: 100, maxHp: 100 };
  
  const atk = (c.strength || 10) * 2 + (c.agility || 10) * 0.5;
  const def = (c.defense || 5) + (c.agility || 10) * 0.3;
  const hp = c.hp_current || c.hp || 100;
  const maxHp = c.hp_max || 100;
  
  return { 
    atk: Math.floor(atk), 
    def: Math.floor(def), 
    hp: hp, 
    maxHp: maxHp 
  };
}

  function runCombatRound(playerStats, monster) {
    const log = [];
    const pDmg = Math.max(1, Math.floor(playerStats.atk - monster.def * 0.5 + rand(-3,3)));
    monster.currentHp -= pDmg;
    log.push({ actor: 'player', text: `You strike for ${pDmg} damage!`, dmg: pDmg });

    if (monster.currentHp > 0) {
      const mDmg = Math.max(1, Math.floor(monster.atk - playerStats.def * 0.5 + rand(-2,2)));
      log.push({ actor: 'monster', text: `${monster.name} hits you for ${mDmg}!`, dmg: mDmg });
      return { log, playerDmgTaken: mDmg, monsterDead: false };
    }

    return { log, playerDmgTaken: 0, monsterDead: true };
  }

  function rollMinorLoot(dungeonId) {
    const total = MINION_LOOT.reduce((s,l) => s+l.weight, 0);
    let r = rand(0, total-1);
    for (const entry of MINION_LOOT) {
      r -= entry.weight;
      if (r < 0) {
        if (entry.type === 'gold') return { type:'gold', amount: rand(entry.min, entry.max) };
        if (entry.type === 'item_common') return { type:'item', item: COMMON_ITEMS[rand(0, COMMON_ITEMS.length-1)] };
        return { type: entry.type, ...entry };
      }
    }
    return { type:'gold', amount: rand(5,20) };
  }

  function rollBossLoot(bossDef) {
    const l = bossDef.loot;
    return {
      gold: rand(l.gold[0], l.gold[1]),
      gems: rand(l.gems[0], l.gems[1]),
      premiumItem: {
        name: 'Premium Activation Scroll',
        icon: '📜',
        days: rand(l.premiumDays[0], l.premiumDays[1]),
        type: 'premium_scroll',
        rarity: l.itemRarity,
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
    apiFetch('GET', '/game/dungeon/gold').then(res => {
      if (res && res.success) {
        el.textContent = res.dungeonGold;
      }
    }).catch(() => {});
  }
}

function enterDungeon(dungeonId) {
    const def = getDungeonDef(dungeonId);
    if (!def) return;

    if (D.savedProgress['tower']) {
        const s = D.savedProgress[dungeonId];
        D.activeDungeon = 'tower';
        D.floor = s.floor;
        D.rooms = s.rooms;
        D.playerPos = s.pos;
        D.exploredRooms = new Set(s.explored);
        
        if (!D.rooms || D.rooms.length === 0) {
            D.rooms = generateFloor('tower', D.floor);
            D.playerPos = D.rooms.findIndex(r => r.isStart);
            D.exploredRooms = new Set([D.playerPos]);
            saveState();
            saveProgressToDB();
        }
        
        log(`🔮 Resuming Floor ${D.floor}...`, 'log-enter');
        renderDungeonView();
        return;
    }

    // ── Fresh run — start from the player's current floor (loaded from DB) ──
    D.activeDungeon = 'tower';
    const startFloor = D.floor || 1;  // already set by loadDungeonDataFromDB
    D.rooms = generateFloor('tower', startFloor);
    
    if (!D.rooms || D.rooms.length === 0) {
        log('Failed to generate dungeon. Please try again.', 'log-danger');
        return;
    }
    
    D.playerPos = D.rooms.findIndex(r => r.isStart);
    if (D.playerPos === -1) D.playerPos = 0;
    
    D.exploredRooms = new Set([D.playerPos]);
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

    D.isTraveling = true;
    updateTravelBtn(targetIdx, true);
    log(`🚶 Traveling to Room ${targetIdx + 1}...`, 'log-travel');

    const travelMs = TRAVEL_BASE_MS + rand(0, 3000);
    const bar = document.getElementById('dungeon-travel-bar');
    if (bar) {
      bar.style.transition = `width ${travelMs}ms linear`;
      bar.style.width = '100%';
    }

    D.travelTimer = setTimeout(() => {
      D.playerPos = targetIdx;
      D.exploredRooms.add(targetIdx);
      D.isTraveling = false;
      saveState();
      saveProgressToDB();

      if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }

      log(`📍 Arrived at ${target.isBoss ? '⚠️ BOSS ROOM' : target.type === 'treasure' ? '💰 Treasure Room' : `Room ${targetIdx+1}`}`, 'log-arrive');

      if (target.type === 'treasure' && !target.looted) {
        target.looted = true;
        const loot = rollMinorLoot(D.activeDungeon);
        applyLoot(loot);
      }

      renderDungeonView();
    }, travelMs);
  }

  function initiateFight(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.monster) return;

    if (room.monster.lastKilled && !elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H)) {
      const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - room.monster.lastKilled) / 3600000).toFixed(1);
      log(`💤 Monster respawns in ${hoursLeft}h`, 'log-info');
      return;
    }

    D.combat = {
      roomIdx,
      monster: { ...room.monster },
      playerHpBefore: getChar()?.hp_current || getChar()?.hp || 100,
      roundLog: [],
    };
    renderCombatPanel();
  }

function fightRound() {
  if (!D.combat) return;
  
  // Get fresh character stats before combat round
  const c = getChar();
  if (!c) return;
  
  // Use current health from character
  const currentHp = c.hp_current || c.hp || 100;
  const pStats = { 
    atk: calcPlayerStats().atk, 
    def: calcPlayerStats().def, 
    hp: currentHp, 
    maxHp: c.hp_max || 100 
  };
  
  const { log: roundLog, playerDmgTaken, monsterDead } = runCombatRound(pStats, D.combat.monster);
  
  D.combat.roundLog.push(...roundLog);
  
  if (playerDmgTaken > 0) {
    const newHp = Math.max(0, currentHp - playerDmgTaken);
    c.hp_current = newHp;
    c.hp = newHp;
    
    // Sync health to server
    apiFetch('POST', '/game/dungeon/update-health', { hp: newHp }).catch(e => console.error('Failed to sync health:', e));
    
    // Also update the top bar display
    if (typeof renderTopBar === 'function') renderTopBar();
  }
  
  // Check for death
  if (c.hp_current <= 0) {
    onPlayerDeath();
    return;
  }
  
  // Monster steal attempt
  if (!monsterDead && D.combat.monster.steal && chance(STEAL_CHANCE)) {
    tryStealFromPlayer(D.combat.roomIdx);
  }
  
  if (monsterDead) {
    if (D.combat.monster.isBoss) onBossDefeated();
    else onMonsterDefeated(D.combat.roomIdx);
  } else {
    renderCombatPanel();
  }
}

  function tryRun(roomIdx) {
    if (chance(RUN_ESCAPE_CHANCE)) {
      log(`💨 Escaped successfully!`, 'log-success');
      D.combat = null;
      renderDungeonView();
    } else {
      log(`⚠️ Failed to escape! Monster attacks!`, 'log-danger');
      const pStats = calcPlayerStats();
      const mDmg = Math.max(1, Math.floor(D.combat.monster.atk - pStats.def * 0.5 + rand(-2,2)));
      const c = getChar();
      if (c) {
        c.hp_current = Math.max(0, (c.hp_current || c.hp || 100) - mDmg);
        c.hp = c.hp_current;
      }
      log(`💥 ${D.combat.monster.name} hits you for ${mDmg} as you flee!`, 'log-danger');
      if (c && (c.hp_current || c.hp || 100) <= 0) { onPlayerDeath(); return; }
      D.combat = null;
      renderDungeonView();
    }
  }

  function tryStealFromPlayer(roomIdx) {
    const c = getChar();
    if (!c || !c.inventory || c.inventory.length === 0) return;
    const invItems = c.inventory.filter(i => !i.equipped);
    if (invItems.length === 0) return;
    const stolen = invItems[rand(0, invItems.length-1)];
    c.inventory = c.inventory.filter(i => i !== stolen);
    D.rooms[roomIdx].monster.stolenItems.push(stolen);
    log(`💰 ${D.combat.monster.name} stole your ${stolen.name}!`, 'log-danger');
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
    
    D.savedProgress['tower'] = {
      floor: D.floor,
      pos: D.playerPos,
      rooms: D.rooms,
      explored: [...D.exploredRooms],
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
      monster: {
        ...boss,
        currentHp: boss.hp,
        maxHp: boss.hp,
        stolenItems: [],
        isBoss: true,
      },
      roundLog: [],
    };
    renderCombatPanel();
  }

  function onBossDefeated() {
    const dungeonDef = getDungeonDef(D.activeDungeon);
    const boss = dungeonDef.boss;
    const loot = rollBossLoot(boss);

    log(`🏆 FLOOR ${D.floor} CLEARED! ${boss.name} vanquished!`, 'log-boss');
    log(`💰 Loot: ${loot.gold} gold | 💎 ${loot.gems} gems | 📜 Premium ${loot.premiumItem.days} days`, 'log-success');

    const c = getChar();
    if (c) {
      c.gold = (c.gold||0) + loot.gold;
      c.gems = (c.gems||0) + loot.gems;
      if (!c.inventory) c.inventory = [];
      c.inventory.push(loot.premiumItem);
    }

    D.floor++;
    if (D.floor > (D.highestFloor||1)) D.highestFloor = D.floor;
    
    apiFetch('POST', '/game/dungeon/boss-defeated', {
      newFloor: D.floor,
      highestFloor: D.highestFloor,
      tokens: D.tokens,
      loot: loot
    }).then(() => {
      // Ensure gold/gems/premium item are reflected in the rest of UI.
      refreshCharacter();
    }).catch(e => console.error('Failed to save boss defeat:', e));
    
    delete D.savedProgress['tower'];
    D.rooms = generateFloor(D.activeDungeon, D.floor);
    D.playerPos = D.rooms.findIndex(r => r.isStart);
    D.exploredRooms = new Set([D.playerPos]);
    D.combat = null;
    saveState();
    saveProgressToDB();

    showBossVictoryModal(boss, loot);
  }

  // ── Render Functions ─────────────────────────────────────────────────
  function renderDungeonTab() {
    const container = document.getElementById('tab-dungeon');
    if (!container) return;
    loadState();
    
    if (character) {
      // Load persisted dungeon data, then rerender the list so resume works reliably.
      loadDungeonDataFromDB().then(() => {
        if (!D.activeDungeon) {
          renderDungeonList();
        } else {
          // In case something resumes with an active dungeon
          if (D.combat) renderCombatPanel();
          else renderDungeonView();
        }
      });
    }

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
          <span id="dungeon-gold-count" class="dungeon-token-num">0</span>
        </div>
      </div>
      <div class="dungeon-token-hint">20 MP spent = 1 Token · ${TOKENS_PER_RUN} Tokens per boss</div>
    </div>
    <div id="dungeon-main-area"></div>
  </div>
`;
    if (D.activeDungeon) {
      renderDungeonView();
      if (D.combat) renderCombatPanel();
    } else {
      renderDungeonList();
    }
    renderLog();
  }

  function renderDungeonList() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    D.activeDungeon = null;

    const hasSave   = !!D.savedProgress['tower'];
    const curFloor  = hasSave ? D.savedProgress['tower'].floor : 1;
    const highFloor = D.highestFloor || 1;
    const nextBoss  = getBossForFloor(curFloor);
    const nextTheme = getFloorTheme(curFloor);
    const nextLoot  = nextBoss.loot;

    const previewFloors = [0,1,2,3,4].map(offset => {
      const fl = curFloor + offset;
      const boss = getBossForFloor(fl);
      const t = getFloorTheme(fl);
      return `<div class="dungeon-floor-preview-card" style="border-color:${t.theme}55">
        <div style="font-size:0.62rem;color:var(--dungeon-muted)">Floor ${fl}</div>
        <div style="font-size:1.4rem">${boss.icon}</div>
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
            <div style="font-size:2.5rem">${nextBoss.icon}</div>
            <div>
              <div style="font-family:'Cinzel',serif;color:#e2e8f0;font-size:1rem">${nextBoss.name}</div>
              <div style="font-size:0.75rem;color:var(--dungeon-muted);margin-top:2px">
                ❤️ ${nextBoss.hp} HP · ⚔️ ${nextBoss.atk} ATK · 🛡️ ${nextBoss.def} DEF
              </div>
              <div style="font-size:0.72rem;color:var(--dungeon-gold);margin-top:4px">
                Drops: 💰${nextLoot.gold[0]}–${nextLoot.gold[1]} · 💎${nextLoot.gems[0]}–${nextLoot.gems[1]} · 📜${nextLoot.premiumDays[0]}–${nextLoot.premiumDays[1]}d Premium
              </div>
            </div>
          </div>
        </div>

        <button class="dungeon-btn dungeon-btn-enter" style="width:100%;padding:12px;font-size:1rem;margin-top:16px"
                onclick="dungeonEnter('tower')">
          ${hasSave ? '🔮 Resume Delve (Floor '+curFloor+')' : '⚔️ Begin the Ascent'}
        </button>
      </div>

      <div class="dungeon-floor-history">
        <div style="font-size:0.7rem;color:var(--dungeon-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">📈 Upcoming floors</div>
        <div class="dungeon-floor-preview-row">${previewFloors}</div>
      </div>
    `;
  }

  function renderDungeonView() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;

    // Combat overlay is separate from the main HUD; clear it whenever we re-render the room.
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

    area.innerHTML = `
      <div class="dungeon-game" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
        <div class="dungeon-game-screen">
          ${roomImage ? `
            <img class="dungeon-game-scene" src="${roomImage}" alt="Dungeon Scene" onerror="this.style.display='none'">
          ` : `<div class="dungeon-game-scene dungeon-game-scene-fallback"></div>`}
          <div class="dungeon-game-vignette"></div>

<div class="dungeon-hud-top">
  <div class="dungeon-hud-title">${def.icon} ${def.name}</div>
  <div id="dungeon-log-entries" class="dungeon-hud-log-inline"></div>
  <div class="dungeon-hud-floor">Floor ${D.floor}</div>
  <div class="dungeon-hud-actions">
    <button class="dungeon-btn dungeon-btn-hud" onclick="openGuild()">🏛️ Guild</button>
    <button class="dungeon-btn dungeon-btn-exit dungeon-btn-hud" onclick="dungeonExit()">Exit</button>
  </div>
</div>

          <div class="dungeon-hud-log">
            <div class="dungeon-hud-log-title">Log</div>
            <div id="dungeon-log-entries" class="dungeon-hud-log-entries"></div>
          </div>

          <div class="dungeon-hud-minimap">
            <div class="dungeon-hud-minimap-title">Map</div>
            <div id="dungeon-minimap" class="dungeon-minimap">${renderMapGrid()}</div>
          </div>

          <div class="dungeon-hud-center">
            <div class="dungeon-hud-room">
              <div class="dungeon-hud-room-title">
                ${currentRoom.isBoss ? `⚠️ Boss Room` :
                  currentRoom.isStart ? `🚪 Entrance` :
                  currentRoom.type === 'treasure' ? `💰 Treasure Room` :
                  `🏚️ Corridor`}
                <span class="dungeon-hud-room-id"> · Room ${D.playerPos + 1}</span>
              </div>
              <div class="dungeon-hud-room-desc">${roomDescription}</div>
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
              ${currentRoom.connections.map(ci => {
                const cr = D.rooms[ci];
                const explored = D.exploredRooms.has(ci);
                // Monster is considered "alive" only if it has never been killed, or the respawn cooldown has elapsed.
                const monsterAlive = cr.monster && (!cr.monster.lastKilled || elapsed(cr.monster.lastKilled, MONSTER_RESPAWN_H));
                const icon = explored
                  ? (cr.isBoss ? '⚠️' : cr.type === 'treasure' ? '💰' : monsterAlive ? '👹' : '🏚️')
                  : '❓';
                const text = explored ? `Room ${ci+1}` : 'Unknown';
                return `
                  <button class="dungeon-path-btn ${monsterAlive ? 'has-monster' : ''} ${cr.isBoss ? 'is-boss' : ''}"
                          onclick="dungeonTravel(${ci})" ${D.isTraveling ? 'disabled' : ''}>
                    <span class="dungeon-path-btn-icon">${icon}</span>
                    <span class="dungeon-path-btn-text">${text}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div id="dungeon-overlay" class="dungeon-overlay"></div>
        </div>
      </div>
    `;

    // After rebuilding HUD DOM, repopulate the log entries.
    renderLog();
  }

  function renderMapGrid() {
    const grid = {};
    for (let i = 0; i < D.rooms.length; i++) {
      const r = D.rooms[i];
      grid[`${r.x},${r.y}`] = i;
    }

    const xs = D.rooms.map(r=>r.x), ys = D.rooms.map(r=>r.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);

    let html = `<div class="dungeon-grid-inner" style="grid-template-columns:repeat(${maxX-minX+1},1fr);grid-template-rows:repeat(${maxY-minY+1},1fr)">`;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${x},${y}`;
        if (grid[key] !== undefined) {
          const idx = grid[key];
          const room = D.rooms[idx];
          const isPlayer = idx === D.playerPos;
          const explored = D.exploredRooms.has(idx);
          const monsterAlive = room.monster && (!room.monster.lastKilled || elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H));

          let roomClass = 'map-room';
          if (!explored) roomClass += ' map-room-fog';
          else if (isPlayer) roomClass += ' map-room-player';
          else if (room.isBoss) roomClass += ' map-room-boss';
          else if (room.type === 'treasure') roomClass += ' map-room-treasure';
          else if (monsterAlive) roomClass += ' map-room-monster';
          else roomClass += ' map-room-clear';

          html += `<div class="${roomClass}" title="${explored ? (room.isBoss ? 'BOSS' : `Room ${idx+1}`) : '???'}">
            ${explored ? (isPlayer ? '🧙' : room.isBoss ? '💀' : room.type==='treasure' ? '💎' : monsterAlive ? '👹' : '✓') : ''}
          </div>`;
        } else {
          html += `<div class="map-void"></div>`;
        }
      }
    }

    html += '</div>';
    return html;
  }

  function renderRoomInfo(room) {
    const monsterAlive = room.monster && (!room.monster.lastKilled || elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H));
    const monsterRespawning = room.monster && room.monster.lastKilled && !elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H);

    if (room.isBoss) {
      const def = getDungeonDef(D.activeDungeon);
      const boss = def.boss;
      return `
        <div class="dungeon-boss-room">
          <div class="boss-icon-big">${boss.icon}</div>
          <div class="boss-name-big">${boss.name}</div>
          <div class="boss-stats">
            ❤️ ${boss.hp} HP · ⚔️ ${boss.atk} ATK · 🛡️ ${boss.def} DEF
          </div>
          <div class="boss-drop-preview">
            Drops: 💰${boss.loot.gold[0]}-${boss.loot.gold[1]} · 💎${boss.loot.gems[0]}-${boss.loot.gems[1]} · 📜${boss.loot.premiumDays[0]}-${boss.loot.premiumDays[1]}d Premium
          </div>
          <button class="dungeon-btn dungeon-btn-fight boss-fight-btn" onclick="dungeonFightBoss(${room.id})">
            ⚔️ Challenge Boss (${TOKENS_PER_RUN} Tokens Required)
          </button>
        </div>
      `;
    }

    if (monsterAlive) {
      const m = room.monster;
      const hpPct = Math.round(m.currentHp / m.maxHp * 100);
      return `
        <div class="dungeon-room-monster">
          <div class="monster-icon">${m.icon}</div>
          <div class="monster-info">
            <div class="monster-name">${m.name}</div>
            <div class="monster-hp-bar-wrap">
              <div class="monster-hp-bar" style="width:${hpPct}%"></div>
            </div>
            <div class="monster-stats">❤️ ${m.currentHp}/${m.maxHp} · ⚔️ ${m.atk} · 🛡️ ${m.def} ${m.steal?'· 🎒 Can steal':''}</div>
          </div>
          <div class="monster-btns">
            <button class="dungeon-btn dungeon-btn-fight" onclick="dungeonFight(${room.id})">⚔️ Fight</button>
            <button class="dungeon-btn dungeon-btn-run" onclick="dungeonRun(${room.id})">💨 Run (75%)</button>
          </div>
          ${m.stolenItems.length > 0 ? `
            <div class="stolen-items-notice">
              🎒 Carrying your stolen items: ${m.stolenItems.map(i=>i.name).join(', ')}
            </div>` : ''}
        </div>
      `;
    }

    if (monsterRespawning) {
      const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - room.monster.lastKilled) / 3600000).toFixed(1);
      return `
        <div class="dungeon-room-clear">
          <div style="color:var(--dungeon-muted);font-size:0.9rem">💤 Monster respawns in ${hoursLeft}h</div>
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
    const m = D.combat.monster;
    const pStats = calcPlayerStats();
    const hpPct = Math.round(m.currentHp / m.maxHp * 100);
    const pHpPct = Math.round((pStats.hp / pStats.maxHp) * 100);

    const roundEntries = D.combat.roundLog.slice(-10).reverse().map(e =>
      `<div class="combat-log-entry ${e.actor}">${e.text}</div>`
    ).join('');

    overlay.innerHTML = `
      <div class="dungeon-overlay-backdrop"></div>
      <div class="dungeon-overlay-card dungeon-combat-panel" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
          <div class="combat-header">
            ${m.isBoss ? `<div class="combat-boss-warning">⚠️ BOSS BATTLE</div>` : ''}
            <div class="combat-title">⚔️ Combat: ${m.name}</div>
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

            <div class="combat-fighter monster-fighter">
              <div class="fighter-icon">${m.icon}</div>
              <div class="fighter-name">${m.name}</div>
              <div class="fighter-hp-bar-wrap">
                <div class="fighter-hp-bar monster-hp" style="width:${hpPct}%"></div>
              </div>
              <div class="fighter-stats">${m.currentHp} / ${m.maxHp} HP</div>
            </div>
          </div>

          <div class="combat-log">${roundEntries || '<div class="combat-log-entry" style="color:var(--dungeon-muted)">Battle begins...</div>'}</div>

          <div class="combat-actions">
            <button class="dungeon-btn dungeon-btn-fight" onclick="dungeonAttack()">⚔️ Strike</button>
            ${!m.isBoss ? `<button class="dungeon-btn dungeon-btn-run" onclick="dungeonRunCombat()">💨 Flee (75%)</button>` : ''}
          </div>
      </div>
    `;
  }

  function renderLog() {
    const el = document.getElementById('dungeon-log-entries');
    if (!el) return;
    el.innerHTML = D.dungeonLog.slice(0, 20).map(e =>
      `<div class="dungeon-log-entry ${e.cls||''}">${e.msg}</div>`
    ).join('');
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
          <div class="loot-row">💰 <strong>${loot.gold}</strong> Gold</div>
          <div class="loot-row">💎 <strong>${loot.gems}</strong> Gems</div>
          <div class="loot-row">📜 <strong>${loot.premiumItem.days} days</strong> Premium Activation</div>
        </div>
        <div class="victory-next">Advancing to Floor ${D.floor}...</div>
        <button class="btn-primary" style="margin-top:16px;width:100%" onclick="closeDungeonVictory()">Continue Delving</button>
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
        floor: D.floor, pos: D.playerPos,
        rooms: D.rooms, explored: [...D.exploredRooms],
      };
    }
    D.activeDungeon = null;
    D.combat = null;
    saveState();
    saveProgressToDB();
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
    
    const guildHtml = `
      <div class="guild-container">
        <div class="guild-header">
          <span class="guild-icon">🏛️</span>
          <div>
            <div class="guild-title">Adventurer's Guild</div>
            <div class="guild-subtitle">Exchange dungeon spoils for real rewards</div>
          </div>
          <button class="dungeon-btn dungeon-btn-exit" onclick="closeGuild()">← Back to Dungeon</button>
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
                    <button class="exchange-btn" onclick="exchangeAtGuild('${exchange.id}')" ${!canExchange ? 'disabled' : ''}>
                      ${canExchange ? 'Exchange' : missingReason || 'Missing Requirements'}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <button class="dungeon-btn" onclick="closeGuild()" style="width:100%;margin-top:20px">Continue Exploring</button>
      </div>
    `;

    if (overlay) {
      overlay.innerHTML = `
        <div class="dungeon-overlay-backdrop" onclick="closeGuild()"></div>
        <div class="dungeon-overlay-card guild-overlay-card">
          ${guildHtml}
        </div>
      `;
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
  global.openGuild = openGuild;
global.closeGuild = closeGuild;
global.exchangeAtGuild = exchangeAtGuild;
  global.dungeonEnter        = enterDungeon;
  global.dungeonTravel       = travelToRoom;
  global.dungeonFight        = initiateFight;
  global.dungeonRun          = (roomIdx) => {
    D.combat = { roomIdx, monster: { ...D.rooms[roomIdx].monster }, roundLog: [] };
    tryRun(roomIdx);
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
