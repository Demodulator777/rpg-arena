// ============================================================
//  dungeon.js  –  Battle Arena Dungeon System (Enhanced Visual)
//  Maintains working structure with visual upgrades
// ============================================================

(function (global) {
  'use strict';

  // ── API Wrapper ──────────────────────────────────────────
  const apiFetch = global.api || (async () => {
    console.error('[Dungeon] api not available!');
    return { success: false, error: 'api not available' };
  });

  // ── Constants ──────────────────────────────────────────────
  const MP_PER_TOKEN      = 20;
  const TOKENS_PER_RUN    = 50;
  const MONSTER_RESPAWN_DAYS = 7;
  const MONSTER_RESPAWN_MS = MONSTER_RESPAWN_DAYS * 24 * 3600000;
  const TRAVEL_BASE_MS    = 3000;
  const RUN_ESCAPE_CHANCE = 0.75;
  const STEAL_CHANCE      = 0.18;
  const ROOMS_PER_FLOOR   = 8;

  // ── Dungeon Images ─────────────────────────────────────────
  const DUNGEON_IMAGES = {
    entrance: '/images/dungeon/entrance.jpg',
    corridor: '/images/dungeon/corridor.jpg',
    treasure: '/images/dungeon/treasure.jpg',
    boss: '/images/dungeon/boss-chamber.jpg',
    boss_cleared: '/images/dungeon/boss-cleared.jpg',
    stairs: '/images/dungeon/stairs.jpg',
  };

  // ── Room Descriptions ──────────────────────────────────────
  const ROOM_DESCRIPTIONS = {
    start: [
      "You stand at the entrance of a dark, foreboding tower. Ancient stone arches loom above you.",
      "The entrance is carved with ancient runes that pulse with a faint, ominous light.",
      "A massive iron door stands ajar, revealing a shadowy corridor beyond."
    ],
    corridor: [
      "A narrow passage stretches before you. Torches flicker on the walls.",
      "The corridor widens here, with alcoves carved into the walls.",
      "You walk through a hall lined with ancient statues."
    ],
    treasure: [
      "A glint of gold catches your eye! This chamber holds scattered treasures.",
      "Piles of gold and gems lie scattered about.",
      "An ornate chest sits in the center of the room."
    ],
    boss: [
      "The air grows heavy. A massive chamber opens before you, and you sense a powerful presence.",
      "Grand pillars rise to the ceiling. This is the throne room of the floor's master.",
      "The temperature drops as you enter. Something ancient awaits."
    ],
    boss_cleared: [
      "The chamber is silent now. The boss has been vanquished.",
      "Victory! The oppressive presence is gone.",
      "With the guardian defeated, the way forward is clear."
    ]
  };

  // ── Dungeon Materials & Recipes ──────────────────────────────────────────
  const DUNGEON_MATERIALS = [
    { id: 'crypt_dust', name: 'Crypt Dust', icon: '💀', desc: 'Dust from ancient crypts', value: 5, floorMin: 1 },
    { id: 'void_shard', name: 'Void Shard', icon: '🔮', desc: 'Shards of pure darkness', value: 10, floorMin: 3 },
    { id: 'dragon_scale', name: 'Dragon Scale', icon: '🐉', desc: 'Gleaming dragon scales', value: 25, floorMin: 5 },
    { id: 'soul_essence', name: 'Soul Essence', icon: '✨', desc: 'Captured soul energy', value: 50, floorMin: 8 },
    { id: 'abyssal_core', name: 'Abyssal Core', icon: '🌑', desc: 'Core from void creatures', value: 100, floorMin: 12 },
    { id: 'titan_heart', name: 'Titan Heart', icon: '💠', desc: 'Heart of a void titan', value: 200, floorMin: 15 },
  ];

  const DUNGEON_RECIPES = [
    { id: 'health_potion', name: 'Health Potion', icon: '🧪', materials: { crypt_dust: 2 }, result: { type: 'consumable', heal: 100, name: 'Health Potion' } },
    { id: 'mana_potion', name: 'Mana Potion', icon: '💧', materials: { crypt_dust: 2 }, result: { type: 'consumable', mp: 30, name: 'Mana Potion' } },
    { id: 'strength_elixir', name: 'Strength Elixir', icon: '💪', materials: { void_shard: 3 }, result: { type: 'consumable', effect: { type: 'temp_stat', stat: 'strength', value: 5 }, name: 'Strength Elixir' } },
    { id: 'defense_elixir', name: 'Defense Elixir', icon: '🛡️', materials: { void_shard: 3 }, result: { type: 'consumable', effect: { type: 'temp_stat', stat: 'defense', value: 5 }, name: 'Defense Elixir' } },
    { id: 'dragon_scale_armor', name: 'Dragon Scale Armor', icon: '🛡️', materials: { dragon_scale: 5, void_shard: 2 }, result: { type: 'equipment', slot: 'armor', name: 'Dragon Scale Armor', quality: 'rare' } },
    { id: 'soul_binding', name: 'Soul Binding', icon: '🔗', materials: { soul_essence: 3, crypt_dust: 5 }, result: { type: 'premium_scroll', days: 3, name: 'Soul Binding Scroll' } },
    { id: 'abyssal_blade', name: 'Abyssal Blade', icon: '⚔️', materials: { abyssal_core: 2, dragon_scale: 3, void_shard: 5 }, result: { type: 'equipment', slot: 'weapon', name: 'Abyssal Blade', quality: 'legendary' } },
    { id: 'titan_heart_ring', name: 'Titan Heart Ring', icon: '💍', materials: { titan_heart: 1, soul_essence: 5 }, result: { type: 'equipment', slot: 'ring', name: 'Titan Heart Ring', quality: 'legendary' } },
  ];

  // ── Infinite Floor Tower ─────────────────────────────────
  const DUNGEON = { id:'tower', name:'The Endless Tower', icon:'🗼', desc:'An infinite tower of darkness.' };

  const FLOOR_THEMES = [
    { theme:'#7c3aed', themeGlow:'rgba(124,58,237,0.35)', name:'Crypt Depths' },
    { theme:'#dc2626', themeGlow:'rgba(220,38,38,0.35)',  name:'Volcanic Halls' },
    { theme:'#1e3a5f', themeGlow:'rgba(30,58,95,0.4)',    name:'Abyssal Void' },
    { theme:'#065f46', themeGlow:'rgba(6,95,70,0.4)',     name:'Cursed Jungle' },
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
    dungeonInventory: [],
    blacksmithUnlocked: false,
    bossDefeated: false,
  };

  // ── Helpers ────────────────────────────────────────────────
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function chance(p)      { return Math.random() < p; }
  function elapsed(ts, ms) { return (Date.now() - ts) >= ms; }

  function getChar() {
    if (typeof character !== 'undefined' && character) return character;
    return null;
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

  // ── Dungeon Inventory Functions ────────────────────────────
  function addDungeonMaterial(materialId, qty = 1) {
    const material = DUNGEON_MATERIALS.find(m => m.id === materialId);
    if (!material) return;
    const existing = D.dungeonInventory.find(i => i.id === materialId);
    if (existing) {
      existing.qty += qty;
    } else {
      D.dungeonInventory.push({ ...material, qty });
    }
    saveState();
    log(`📦 Found ${qty}x ${material.name}`, 'log-loot');
  }

  function removeDungeonMaterial(materialId, qty) {
    const index = D.dungeonInventory.findIndex(i => i.id === materialId);
    if (index === -1) return false;
    if (D.dungeonInventory[index].qty >= qty) {
      D.dungeonInventory[index].qty -= qty;
      if (D.dungeonInventory[index].qty <= 0) D.dungeonInventory.splice(index, 1);
      saveState();
      return true;
    }
    return false;
  }

  function canCraftRecipe(recipe) {
    for (const [materialId, qty] of Object.entries(recipe.materials)) {
      const item = D.dungeonInventory.find(i => i.id === materialId);
      if (!item || item.qty < qty) return false;
    }
    return true;
  }

  // ── Map Generation (Simplified for visual mode) ────────────
  function generateFloor(floor, bossDefeated = false) {
    const rooms = [];
    
    // Start room
    rooms.push({
      id: 0,
      type: 'start',
      monster: null,
      looted: true,
      image: DUNGEON_IMAGES.entrance,
      description: ROOM_DESCRIPTIONS.start[Math.floor(Math.random() * ROOM_DESCRIPTIONS.start.length)],
    });
    
    // Generate intermediate rooms
    for (let i = 0; i < ROOMS_PER_FLOOR - 2; i++) {
      const type = chance(0.3) ? 'treasure' : 'corridor';
      const hasMonster = !bossDefeated && type !== 'treasure' && chance(0.7);
      let monster = null;
      
      if (hasMonster) {
        const monsters = getMonstersForFloor(floor);
        const m = monsters[Math.floor(Math.random() * monsters.length)];
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
      
      rooms.push({
        id: i + 1,
        type: type,
        monster: monster,
        looted: false,
        image: type === 'treasure' ? DUNGEON_IMAGES.treasure : DUNGEON_IMAGES.corridor,
        description: type === 'treasure' ? ROOM_DESCRIPTIONS.treasure[Math.floor(Math.random() * ROOM_DESCRIPTIONS.treasure.length)] : ROOM_DESCRIPTIONS.corridor[Math.floor(Math.random() * ROOM_DESCRIPTIONS.corridor.length)],
      });
    }
    
    // Boss room
    rooms.push({
      id: ROOMS_PER_FLOOR - 1,
      type: bossDefeated ? 'boss_cleared' : 'boss',
      monster: bossDefeated ? null : getBossForFloor(floor),
      looted: bossDefeated,
      image: bossDefeated ? DUNGEON_IMAGES.boss_cleared : DUNGEON_IMAGES.boss,
      description: bossDefeated ? ROOM_DESCRIPTIONS.boss_cleared[Math.floor(Math.random() * ROOM_DESCRIPTIONS.boss_cleared.length)] : ROOM_DESCRIPTIONS.boss[Math.floor(Math.random() * ROOM_DESCRIPTIONS.boss.length)],
    });
    
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
    return { atk: Math.floor(atk), def: Math.floor(def), hp: hp, maxHp: maxHp };
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

  function rollMinorLoot() {
    const floor = D.floor || 1;
    const availableMaterials = DUNGEON_MATERIALS.filter(m => floor >= m.floorMin);
    
    if (availableMaterials.length > 0 && chance(0.35)) {
      const material = availableMaterials[Math.floor(Math.random() * availableMaterials.length)];
      const qty = 1 + Math.floor(Math.random() * Math.min(3, Math.floor(floor / 5) + 1));
      return { type: 'dungeon_material', materialId: material.id, qty };
    }
    
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

  function applyLoot(loot) {
    const c = getChar();
    if (!c) return;
    
    if (loot.type === 'gold') {
      c.gold = (c.gold||0) + loot.amount;
      log(`💰 Found ${loot.amount} gold`, 'log-loot');
      apiFetch('POST', '/game/dungeon/add-gold', { amount: loot.amount }).catch(()=>{});
    } else if (loot.type === 'dungeon_material') {
      addDungeonMaterial(loot.materialId, loot.qty);
    } else {
      addDungeonMaterial('crypt_dust', 1);
      log(`📦 Found materials`, 'log-loot');
    }
    refreshCharacter();
  }

  async function refreshCharacter() {
    try {
      const updatedChar = await apiFetch('GET', '/game/character');
      if (updatedChar && typeof character !== 'undefined') {
        Object.assign(character, updatedChar);
        if (typeof renderTopBar === 'function') renderTopBar();
        if (typeof renderCharacter === 'function') renderCharacter();
      }
    } catch(e) { console.error('Failed to refresh character:', e); }
  }

  // ── Database Sync Functions ─────────────────────────────────
  async function loadDungeonDataFromDB() {
    try {
      const response = await apiFetch('GET', '/game/dungeon/data');
      if (response && response.success) {
        D.tokens = response.tokens || 0;
        D.floor = response.floor || 1;
        D.highestFloor = response.highestFloor || 1;
        if (response.progress && response.progress.activeDungeon) {
          D.savedProgress[response.progress.activeDungeon] = response.progress;
        }
        updateTokenDisplay();
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
    } catch (e) { console.error('Failed to save tokens to DB:', e); }
  }

  async function saveProgressToDB() {
    try {
      await apiFetch('POST', '/game/dungeon/progress', {
        floor: D.floor,
        highestFloor: D.highestFloor,
        progress: {
          activeDungeon: D.activeDungeon,
          pos: D.playerPos,
          rooms: D.rooms,
          exploredRooms: [...D.exploredRooms],
          bossDefeated: D.bossDefeated,
        }
      });
    } catch (e) { console.error('Failed to save progress to DB:', e); }
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

  // ── Core Actions ───────────────────────────────────────────
  function enterDungeon(dungeonId) {
    const def = getDungeonDef(dungeonId);
    if (!def) return;

    if (D.savedProgress['tower']) {
      const s = D.savedProgress[dungeonId];
      D.activeDungeon = 'tower';
      D.floor = s.floor;
      D.rooms = s.rooms;
      D.playerPos = s.pos;
      D.exploredRooms = new Set(s.exploredRooms || [s.pos]);
      D.bossDefeated = s.bossDefeated || false;
      log(`🔮 Resuming Floor ${D.floor}...`, 'log-enter');
      renderDungeonView();
      return;
    }

    D.activeDungeon = 'tower';
    D.floor = 1;
    D.bossDefeated = false;
    D.rooms = generateFloor(1, false);
    D.playerPos = 0;
    D.exploredRooms = new Set([0]);
    D.dungeonLog = [];
    saveState();
    saveProgressToDB();

    log(`⚔️ Entered The Endless Tower – Floor 1`, 'log-enter');
    renderDungeonView();
  }

  function travelToRoom(targetIdx) {
    if (D.isTraveling || D.combat) return;
    if (targetIdx >= D.rooms.length) return;
    
    const target = D.rooms[targetIdx];
    
    D.isTraveling = true;
    log(`🚶 Traveling deeper...`, 'log-travel');
    
    const travelMs = TRAVEL_BASE_MS + rand(0, 1500);
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
      
      log(`📍 Arrived at ${target.type === 'boss' ? 'BOSS CHAMBER' : target.type === 'treasure' ? 'TREASURE ROOM' : 'a chamber'}`, 'log-arrive');
      
      if (target.type === 'treasure' && !target.looted) {
        target.looted = true;
        const loot = rollMinorLoot();
        applyLoot(loot);
      }
      
      if (target.monster && (!target.monster.lastKilled || Date.now() >= target.monster.lastKilled + MONSTER_RESPAWN_MS)) {
        initiateFight();
      } else if (target.monster && target.monster.lastKilled) {
        const daysLeft = Math.ceil((target.monster.lastKilled + MONSTER_RESPAWN_MS - Date.now()) / (24 * 3600000));
        log(`💤 The ${target.monster.name} lies slain. It will respawn in ${daysLeft} days.`, 'log-info');
        renderDungeonView();
      } else {
        renderDungeonView();
      }
    }, travelMs);
  }

  function initiateFight() {
    const room = D.rooms[D.playerPos];
    if (!room || !room.monster) return;
    
    D.combat = {
      roomIdx: D.playerPos,
      monster: { ...room.monster },
      playerHpBefore: getChar()?.hp_current || getChar()?.hp || 100,
      roundLog: [],
    };
    renderCombatPanel();
  }

  function fightRound() {
    if (!D.combat) return;
    const pStats = calcPlayerStats();
    const { log: roundLog, playerDmgTaken, monsterDead } = runCombatRound(pStats, D.combat.monster);
    
    D.combat.roundLog.push(...roundLog);
    
    const c = getChar();
    if (c && playerDmgTaken > 0) {
      c.hp_current = Math.max(0, (c.hp_current || c.hp || 100) - playerDmgTaken);
      c.hp = c.hp_current;
      apiFetch('POST', '/game/dungeon/update-health', { hp: c.hp_current }).catch(()=>{});
    }
    
    if (monsterDead) {
      if (D.rooms[D.combat.roomIdx].type === 'boss') onBossDefeated();
      else onMonsterDefeated();
    } else if (c && (c.hp_current || c.hp || 100) <= 0) {
      onPlayerDeath();
    } else {
      renderCombatPanel();
    }
  }

  function tryRun() {
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

  function onMonsterDefeated() {
    const room = D.rooms[D.combat.roomIdx];
    room.monster.lastKilled = Date.now();
    
    const loot = rollMinorLoot();
    applyLoot(loot);
    
    log(`✅ ${room.monster.name} defeated!`, 'log-success');
    D.combat = null;
    saveState();
    saveProgressToDB();
    renderDungeonView();
  }

  function onBossDefeated() {
    const boss = D.rooms[D.combat.roomIdx].monster;
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
    
    D.bossDefeated = true;
    D.rooms[D.combat.roomIdx].type = 'boss_cleared';
    D.rooms[D.combat.roomIdx].monster = null;
    D.rooms[D.combat.roomIdx].image = DUNGEON_IMAGES.boss_cleared;
    D.rooms[D.combat.roomIdx].description = ROOM_DESCRIPTIONS.boss_cleared[Math.floor(Math.random() * ROOM_DESCRIPTIONS.boss_cleared.length)];
    
    if (D.floor === 5 && !D.blacksmithUnlocked) {
      D.blacksmithUnlocked = true;
      log('🔨 A traveling blacksmith has arrived!', 'log-success');
    }
    
    D.combat = null;
    saveState();
    saveProgressToDB();
    renderDungeonView();
  }

  function goToNextFloor() {
    D.floor++;
    if (D.floor > (D.highestFloor||1)) D.highestFloor = D.floor;
    D.bossDefeated = false;
    D.rooms = generateFloor(D.floor, false);
    D.playerPos = 0;
    D.exploredRooms = new Set([0]);
    D.combat = null;
    saveState();
    saveProgressToDB();
    
    log(`⬆️ Ascending to Floor ${D.floor}...`, 'log-enter');
    renderDungeonView();
  }

  function onPlayerDeath() {
    log(`💀 You have been slain! Progress saved.`, 'log-danger');
    D.savedProgress['tower'] = {
      floor: D.floor,
      pos: D.playerPos,
      rooms: D.rooms,
      exploredRooms: [...D.exploredRooms],
      bossDefeated: D.bossDefeated,
    };
    D.combat = null;
    D.activeDungeon = null;
    saveState();
    saveProgressToDB();
    setTimeout(() => renderDungeonList(), 1500);
  }

  async function fightBoss() {
    const room = D.rooms[D.playerPos];
    if (room.type !== 'boss' || !room.monster) return;
    
    const success = await spendTokens(TOKENS_PER_RUN);
    if (!success) {
      log(`🗝️ Need ${TOKENS_PER_RUN} tokens to challenge the boss. You have ${D.tokens}.`, 'log-danger');
      return;
    }
    
    D.combat = {
      roomIdx: D.playerPos,
      monster: { ...room.monster },
      playerHpBefore: getChar()?.hp_current || getChar()?.hp || 100,
      roundLog: [],
    };
    renderCombatPanel();
  }

  // ── Render Functions ─────────────────────────────────────────────────
  function renderDungeonTab() {
    const container = document.getElementById('tab-dungeon');
    if (!container) return;
    loadState();
    
    if (character) {
      loadDungeonDataFromDB();
    }

    container.innerHTML = `
      <div class="dungeon-wrapper">
        <div class="dungeon-topbar">
          <div class="dungeon-title-wrap">
            <span class="dungeon-title-icon">🗼</span>
            <div>
              <div class="dungeon-title-text">Endless Tower</div>
              <div class="dungeon-title-sub">Ascend through darkness. Claim your glory.</div>
            </div>
          </div>
          <div class="dungeon-token-wrap">
            <div class="dungeon-token-pill">
              <span class="dungeon-token-icon">🗝️</span>
              <span>Boss Tokens:</span>
              <span id="dungeon-token-count" class="dungeon-token-num">${D.tokens}</span>
            </div>
            <div class="dungeon-token-hint">20 MP = 1 Token · ${TOKENS_PER_RUN} per boss</div>
          </div>
        </div>
        <div id="dungeon-main-area"></div>
        <div id="dungeon-log-panel" class="dungeon-log-panel">
          <div class="dungeon-log-title">📜 Journal</div>
          <div id="dungeon-log-entries"></div>
        </div>
      </div>
    `;

    if (D.activeDungeon) {
      if (D.combat) renderCombatPanel();
      else renderDungeonView();
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

    area.innerHTML = `
      <div class="dungeon-tower-entry" style="--dtheme:${nextTheme.theme};--dglow:${nextTheme.themeGlow}">
        <div class="dungeon-tower-top">
          <div class="dungeon-tower-icon">🗼</div>
          <div class="dungeon-tower-info">
            <div class="dungeon-card-name">The Endless Tower</div>
            <div class="dungeon-card-desc">An infinite tower of darkness. Clear each floor to ascend. Bosses grow stronger forever.</div>
            <div class="dungeon-card-meta">
              <span>🏆 Best: Floor ${highFloor}</span>
              <span>🗝️ ${D.tokens} tokens</span>
              ${hasSave ? `<span class="dungeon-save-badge">📌 Saved on Floor ${curFloor}</span>` : ''}
              ${D.blacksmithUnlocked ? `<span class="dungeon-save-badge" style="background:rgba(241,196,15,0.1);color:var(--dungeon-gold)">🔨 Blacksmith Available</span>` : ''}
            </div>
          </div>
        </div>
        <div class="dungeon-tower-next">
          <div class="next-boss-label">Next Boss — Floor ${curFloor}</div>
          <div class="next-boss-content">
            <div class="next-boss-icon">${nextBoss.icon}</div>
            <div class="next-boss-info">
              <div class="next-boss-name">${nextBoss.name}</div>
              <div class="next-boss-stats">❤️ ${nextBoss.hp} · ⚔️ ${nextBoss.atk} · 🛡️ ${nextBoss.def}</div>
              <div class="next-boss-drops">💎 ${nextLoot.gems[0]}–${nextLoot.gems[1]} gems · 📜 Premium Scroll</div>
            </div>
          </div>
        </div>
        <button class="dungeon-btn dungeon-btn-enter" onclick="dungeonEnter('tower')">
          ${hasSave ? '🔮 Resume Delve' : '⚔️ Begin the Ascent'}
        </button>
      </div>
    `;
  }

  function renderDungeonView() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    if (!D.rooms || D.rooms.length === 0) {
      area.innerHTML = '<div class="error">Dungeon not generated. Please re-enter.</div>';
      return;
    }
    
    const room = D.rooms[D.playerPos];
    if (!room) return;
    
    const def = getDungeonDef(D.activeDungeon);
    const floorTheme = getFloorTheme(D.floor);
    const hasNextRoom = D.playerPos + 1 < D.rooms.length;
    const hasMonster = room.monster && (!room.monster.lastKilled || Date.now() >= room.monster.lastKilled + MONSTER_RESPAWN_MS);
    const isBossRoom = room.type === 'boss';
    const isBossCleared = room.type === 'boss_cleared';
    const isTreasure = room.type === 'treasure';
    const isStart = room.type === 'start';
    
    area.innerHTML = `
      <div class="dungeon-view" style="--dtheme:${floorTheme.theme};--dglow:${floorTheme.themeGlow}">
        <div class="dungeon-header">
          <div class="dungeon-floor-info">
            <span class="dungeon-floor-badge">Floor ${D.floor}</span>
            <span class="dungeon-room-type">${isBossRoom ? 'BOSS CHAMBER' : isBossCleared ? 'CLEARED' : isTreasure ? 'TREASURE' : isStart ? 'ENTRANCE' : 'CHAMBER'}</span>
          </div>
          <button class="dungeon-btn dungeon-btn-exit" onclick="dungeonExit()">Exit</button>
        </div>
        
        <div class="dungeon-image-container">
          <img class="dungeon-scene-image" src="${room.image}" alt="Dungeon Scene" onerror="this.style.display='none'">
          <div class="dungeon-image-overlay"></div>
        </div>
        
        <div class="dungeon-description">
          <p>${room.description}</p>
        </div>
        
        <div class="dungeon-travel-bar-wrap">
          <div id="dungeon-travel-bar" class="dungeon-travel-bar"></div>
        </div>
        
        <div class="dungeon-actions">
          ${hasMonster ? `
            <div class="monster-preview">
              <div class="monster-preview-icon">${room.monster.icon}</div>
              <div class="monster-preview-info">
                <div class="monster-preview-name">${room.monster.name}</div>
                <div class="monster-preview-stats">❤️ ${room.monster.currentHp}/${room.monster.maxHp} HP · ⚔️ ${room.monster.atk} ATK</div>
              </div>
              <div class="monster-preview-buttons">
                <button class="dungeon-btn dungeon-btn-fight" onclick="dungeonFight()">⚔️ Fight</button>
                <button class="dungeon-btn dungeon-btn-run" onclick="dungeonRun()">💨 Run (75%)</button>
              </div>
            </div>
          ` : isBossRoom ? `
            <div class="boss-preview">
              <div class="boss-preview-icon">${room.monster.icon}</div>
              <div class="boss-preview-info">
                <div class="boss-preview-name">${room.monster.name}</div>
                <div class="boss-preview-stats">❤️ ${room.monster.hp} HP · ⚔️ ${room.monster.atk} ATK · 🛡️ ${room.monster.def} DEF</div>
                <div class="boss-preview-loot">Drops: 💎 ${room.monster.loot.gems[0]}–${room.monster.loot.gems[1]} gems · 📜 Premium Scroll</div>
              </div>
              <button class="dungeon-btn dungeon-btn-boss" onclick="dungeonFightBoss()">
                ⚔️ Challenge Boss (${TOKENS_PER_RUN} Tokens)
              </button>
            </div>
          ` : isBossCleared ? `
            <div class="cleared-preview">
              <div class="cleared-icon">🏆</div>
              <div class="cleared-text">The boss has been defeated.</div>
              ${hasNextRoom ? `<button class="dungeon-btn dungeon-btn-stairs" onclick="goToNextFloor()">⬆️ Ascend to Floor ${D.floor + 1}</button>` : ''}
            </div>
          ` : isTreasure && room.looted ? `
            <div class="treasure-preview">
              <div class="treasure-icon">💰</div>
              <div class="treasure-text">You've already looted this treasure room.</div>
            </div>
          ` : null}
          
          ${hasNextRoom && !isBossRoom && !isBossCleared ? `
            <div class="dungeon-directions">
              <button class="dungeon-direction-btn" onclick="travelToRoom(${D.playerPos + 1})" ${D.isTraveling ? 'disabled' : ''}>
                ➡️ Continue Forward
              </button>
            </div>
          ` : isBossCleared && hasNextRoom ? `
            <div class="dungeon-directions">
              <button class="dungeon-direction-btn" onclick="travelToRoom(${D.playerPos + 1})" ${D.isTraveling ? 'disabled' : ''}>
                ➡️ Continue to Next Area
              </button>
            </div>
          ` : null}
          
          ${D.blacksmithUnlocked && !hasMonster && !isBossRoom && !isStart && D.playerPos > 0 ? `
            <button class="dungeon-btn dungeon-btn-blacksmith" onclick="openBlacksmith()">
              🔨 Visit Blacksmith
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderCombatPanel() {
    const area = document.getElementById('dungeon-main-area');
    if (!area || !D.combat) return;
    const def = getDungeonDef(D.activeDungeon);
    const m = D.combat.monster;
    const pStats = calcPlayerStats();
    const hpPct = Math.round(m.currentHp / m.maxHp * 100);
    const pHpPct = Math.round((pStats.hp / pStats.maxHp) * 100);
    const floorTheme = getFloorTheme(D.floor);

    const roundEntries = D.combat.roundLog.slice(-10).reverse().map(e =>
      `<div class="combat-log-entry ${e.actor}">${e.text}</div>`
    ).join('');

    area.innerHTML = `
      <div class="dungeon-combat-panel" style="--dtheme:${floorTheme.theme};--dglow:${floorTheme.themeGlow}">
        <div class="combat-header">
          ${m.isBoss ? `<div class="combat-boss-warning">⚠️ BOSS BATTLE ⚠️</div>` : ''}
          <div class="combat-title">⚔️ Combat: ${m.name}</div>
        </div>
        
        <div class="combat-fighters">
          <div class="combat-fighter player-fighter">
            <div class="fighter-icon">🧙</div>
            <div class="fighter-name">${getChar()?.name || 'You'}</div>
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
        
        <div class="combat-log">${roundEntries || '<div class="combat-log-entry">Battle begins...</div>'}</div>
        
        <div class="combat-actions">
          <button class="dungeon-btn dungeon-btn-fight" onclick="dungeonAttack()">⚔️ Strike</button>
          ${!m.isBoss ? `<button class="dungeon-btn dungeon-btn-run" onclick="dungeonRunCombat()">💨 Flee (75%)</button>` : ''}
        </div>
      </div>
    `;
  }

  function renderBlacksmith() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    const floorTheme = getFloorTheme(D.floor);
    
    area.innerHTML = `
      <div class="dungeon-blacksmith" style="--dtheme:${floorTheme.theme};--dglow:${floorTheme.themeGlow}">
        <div class="blacksmith-header">
          <span class="blacksmith-icon">🔨</span>
          <div>
            <div class="blacksmith-title">Dungeon Blacksmith</div>
            <div class="blacksmith-desc">Trade your dungeon materials for powerful items</div>
          </div>
          <button class="dungeon-btn dungeon-btn-exit" onclick="closeBlacksmith()">← Back</button>
        </div>
        
        <div class="blacksmith-inventory">
          <div class="inventory-title">📦 Dungeon Materials</div>
          <div class="materials-grid">
            ${D.dungeonInventory.length === 0 ? '<div class="empty-mats">No materials yet. Defeat monsters to find them!</div>' :
              D.dungeonInventory.map(mat => `
                <div class="material-card">
                  <div class="material-icon">${mat.icon}</div>
                  <div class="material-info">
                    <div class="material-name">${mat.name}</div>
                    <div class="material-desc">${mat.desc}</div>
                    <div class="material-qty">x${mat.qty}</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
        
        <div class="blacksmith-recipes">
          <div class="recipes-title">⚒️ Crafting Recipes</div>
          <div class="recipes-grid">
            ${DUNGEON_RECIPES.map(recipe => {
              const canCraft = canCraftRecipe(recipe);
              const materialsNeeded = Object.entries(recipe.materials).map(([id, qty]) => {
                const mat = DUNGEON_MATERIALS.find(m => m.id === id);
                const have = D.dungeonInventory.find(i => i.id === id)?.qty || 0;
                return `<span class="material-needed ${have >= qty ? 'has' : 'needs'}">${mat?.icon || '📦'} ${qty}x ${mat?.name || id}</span>`;
              }).join(' + ');
              
              return `
                <div class="recipe-card ${canCraft ? 'craftable' : 'uncraftable'}">
                  <div class="recipe-icon">${recipe.icon}</div>
                  <div class="recipe-info">
                    <div class="recipe-name">${recipe.name}</div>
                    <div class="recipe-materials">${materialsNeeded}</div>
                    <button class="craft-btn" onclick="craftRecipeFromBlacksmith('${recipe.id}')" ${!canCraft ? 'disabled' : ''}>
                      ${canCraft ? '🔨 Craft' : '❌ Missing Materials'}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <button class="dungeon-btn" onclick="continueDungeon()" style="width:100%;margin-top:16px">Continue Exploring</button>
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

  function openBlacksmith() {
    renderBlacksmith();
  }

  function closeBlacksmith() {
    renderDungeonView();
  }

  function continueDungeon() {
    renderDungeonView();
  }

  function craftRecipeFromBlacksmith(recipeId) {
    const recipe = DUNGEON_RECIPES.find(r => r.id === recipeId);
    if (!recipe) return;
    if (!canCraftRecipe(recipe)) {
      log('Missing materials!', 'log-danger');
      return;
    }
    
    for (const [materialId, qty] of Object.entries(recipe.materials)) {
      removeDungeonMaterial(materialId, qty);
    }
    
    const c = getChar();
    if (c) {
      if (!c.inventory) c.inventory = [];
      const resultItem = { ...recipe.result, qty: 1 };
      c.inventory.push(resultItem);
      log(`🔨 Crafted: ${recipe.result.name}!`, 'log-success');
    }
    
    saveState();
    renderBlacksmith();
    refreshCharacter();
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
          <div class="loot-row">📜 <strong>${loot.premiumItem.days} days</strong> Premium</div>
        </div>
        <div class="victory-next">Advancing to Floor ${D.floor}...</div>
        <button class="btn-primary" onclick="closeDungeonVictory()">Continue</button>
      </div>
    `;
  }

  function closeDungeonVictory() {
    const m = document.getElementById('dungeon-boss-modal');
    if (m) m.classList.add('hidden');
    renderDungeonView();
  }

  function dungeonExit() {
    if (D.activeDungeon) {
      D.savedProgress[D.activeDungeon] = {
        floor: D.floor,
        pos: D.playerPos,
        rooms: D.rooms,
        exploredRooms: [...D.exploredRooms],
        bossDefeated: D.bossDefeated,
      };
    }
    D.activeDungeon = null;
    D.combat = null;
    saveState();
    saveProgressToDB();
    renderDungeonList();
  }

  function updateTravelBtn(idx, disabled) {
    const btns = document.querySelectorAll('.dungeon-direction-btn, .dungeon-conn-btn');
    btns.forEach(b => b.disabled = disabled);
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

  // ── Global API ────────────────────────────────────────────
  global.dungeonEnter = enterDungeon;
  global.dungeonTravel = travelToRoom;
  global.dungeonFight = initiateFight;
  global.dungeonRun = tryRun;
  global.dungeonAttack = fightRound;
  global.dungeonRunCombat = tryRun;
  global.dungeonFightBoss = fightBoss;
  global.goToNextFloor = goToNextFloor;
  global.dungeonExit = dungeonExit;
  global.closeDungeonVictory = closeDungeonVictory;
  global.openBlacksmith = openBlacksmith;
  global.closeBlacksmith = closeBlacksmith;
  global.continueDungeon = continueDungeon;
  global.craftRecipeFromBlacksmith = craftRecipeFromBlacksmith;
  global.renderDungeonTab = function() {
    renderDungeonTab();
    if (character) loadDungeonDataFromDB();
  };

  // ── Init ───────────────────────────────────────────────────
  loadCSS();
  loadState();

})(window);
