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
  };

  // ── Helpers ────────────────────────────────────────────────
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function chance(p)      { return Math.random() < p; }
  function elapsed(ts, hours) { return (Date.now() - ts) >= hours * 3600000; }

  function getChar() {
    return (typeof state !== 'undefined' && state.character) ? state.character : null;
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

  // ── Database Sync Functions ─────────────────────────────────
  async function loadDungeonDataFromDB() {
    try {
      const response = await apiFetch('GET', '/api/dungeon/data');
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
      await apiFetch('POST', '/api/dungeon/tokens', { tokens: D.tokens });
      saveState();
    } catch (e) {
      console.error('Failed to save tokens to DB:', e);
    }
  }

  async function saveProgressToDB() {
    try {
      const progress = D.savedProgress[D.activeDungeon] || null;
      
      await apiFetch('POST', '/api/dungeon/progress', {
        floor: D.floor,
        highestFloor: D.highestFloor || D.floor,
        progress: progress ? {
          rooms: progress.rooms,
          playerPos: progress.pos,
          exploredRooms: [...progress.explored]
        } : null,
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
    apiFetch('POST', '/api/dungeon/mp-spent', { mpSpent })
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

      rooms.push({
        id: i,
        gridIdx: idx,
        x, y,
        isBoss,
        isStart,
        connections,
        monster,
        looted: false,
        type: isBoss ? 'boss' : isStart ? 'start' : (chance(0.15) ? 'treasure' : 'corridor'),
      });
    }

    return rooms;
  }

  // ── Combat Engine ──────────────────────────────────────────
  function calcPlayerStats() {
    const c = getChar();
    if (!c) return { atk: 10, def: 5, hp: 100, maxHp: 100 };
    const atk = (c.strength||10) * 2 + (c.agility||10) * 0.5;
    const def = (c.defense||5) + (c.agility||10) * 0.3;
    return { atk, def, hp: c.hp_current || c.hp || 100, maxHp: c.hp_max || 100 };
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
      D.exploredRooms = new Set(s.explored);
      log(`🔮 Resuming Floor ${D.floor}...`, 'log-enter');
      renderDungeonView();
      return;
    }

    D.activeDungeon = 'tower';
    D.floor = 1;
    D.rooms = generateFloor('tower', 1);
    D.playerPos = D.rooms.findIndex(r => r.isStart);
    D.exploredRooms = new Set([D.playerPos]);
    D.dungeonLog = [];
    saveState();
    saveProgressToDB();

    log(`⚔️ Entered The Endless Tower – Floor 1`, 'log-enter');
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
    const pStats = calcPlayerStats();
    const { log: roundLog, playerDmgTaken, monsterDead } = runCombatRound(pStats, D.combat.monster);

    D.combat.roundLog.push(...roundLog);

    const c = getChar();
    if (c && playerDmgTaken > 0) {
      c.hp_current = Math.max(0, (c.hp_current || c.hp || 100) - playerDmgTaken);
      c.hp = c.hp_current;
      if (typeof api === 'function') {
        api('POST', '/api/dungeon/damage', { damage: playerDmgTaken }).catch(()=>{});
      }
    }

    if (!monsterDead && D.combat.monster.steal && chance(STEAL_CHANCE)) {
      tryStealFromPlayer(D.combat.roomIdx);
    }

    if (monsterDead) {
      if (D.combat.monster.isBoss) onBossDefeated();
      else onMonsterDefeated(D.combat.roomIdx);
    } else if (c && (c.hp_current || c.hp || 100) <= 0) {
      onPlayerDeath();
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
    
    apiFetch('POST', '/api/dungeon/boss-defeated', {
      newFloor: D.floor,
      highestFloor: D.highestFloor,
      tokens: D.tokens,
      loot: loot
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

  function applyLoot(loot) {
    const c = getChar();
    if (!c) return;
    if (loot.type === 'gold') {
      c.gold = (c.gold||0) + loot.amount;
      log(`💰 Found ${loot.amount} gold`, 'log-loot');
    } else if (loot.type === 'potion_hp') {
      if (!c.inventory) c.inventory = [];
      c.inventory.push({ name: loot.name, icon: loot.icon, type:'consumable', heal: loot.heal, rarity:'common' });
      log(`🧪 Found ${loot.name}`, 'log-loot');
    } else if (loot.type === 'potion_mp') {
      if (!c.inventory) c.inventory = [];
      c.inventory.push({ name: loot.name, icon: loot.icon, type:'consumable', mp: loot.mp, rarity:'common' });
      log(`💧 Found ${loot.name}`, 'log-loot');
    } else if (loot.type === 'item') {
      if (!c.inventory) c.inventory = [];
      c.inventory.push(loot.item);
      log(`📦 Found ${loot.item.icon} ${loot.item.name}`, 'log-loot');
    }
  }

  // ── Render Functions (truncated for brevity - keep your existing render functions) ──
  // ... (keep all your existing render functions: renderDungeonTab, renderDungeonList, 
  // renderDungeonView, renderMapGrid, renderRoomInfo, renderCombatPanel, renderLog, 
  // showBossVictoryModal, updateTravelBtn, etc.)

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
  global.dungeonExit         = () => {
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
  };
  global.closeDungeonVictory = () => {
    const m = document.getElementById('dungeon-boss-modal');
    if (m) m.classList.add('hidden');
    renderDungeonView();
  };
  global.renderDungeonTab    = renderDungeonTab;

  // ── Init ───────────────────────────────────────────────────
  loadCSS();
  loadState();
  loadDungeonDataFromDB();

})(window);
