// ============================================================
//  dungeon.js  –  Battle Arena Dungeon System
//  Completely self-contained. Requires: global `state` object,
//  `apiFetch(method, path, body)`, `showTab(tab)` helpers from app.js
// ============================================================

(function (global) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const MP_PER_TOKEN      = 20;
  const TOKENS_PER_RUN    = 50;
  const MONSTER_RESPAWN_H = 12;
  const TRAVEL_BASE_MS    = 8000;   // ms per room travel (real-time, shortened for UX)
  const RUN_ESCAPE_CHANCE = 0.75;   // 75% success, 25% fight anyway
  const STEAL_CHANCE      = 0.18;   // 18% per fight monster steals
  const ROOMS_PER_FLOOR   = 12;     // rooms including boss

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
  function getDungeonDef() {
    const floor = D.floor || 1;
    const t = getFloorTheme(floor);
    return { id:'tower', name:DUNGEON.name, icon:DUNGEON.icon, theme:t.theme, themeGlow:t.themeGlow, themeName:t.name, monsters:getMonstersForFloor(floor), boss:getBossForFloor(floor) };
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
    activeDungeon: null,    // dungeonId
    floor: 1,
    rooms: [],              // generated maze
    playerPos: 0,           // room index
    exploredRooms: new Set(),
    combat: null,           // active combat state
    travelTimer: null,
    isTraveling: false,
    dungeonLog: [],
    savedProgress: {},      // { dungeonId: { floor, pos, rooms, explored } }
  };

  // ── Helpers ────────────────────────────────────────────────
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function chance(p)      { return Math.random() < p; }
  function clamp(v,a,b)   { return Math.max(a, Math.min(b, v)); }
  function elapsed(ts, hours) { return (Date.now() - ts) >= hours * 3600000; }

  function getChar() {
    return (typeof state !== 'undefined' && state.character) ? state.character : null;
  }

  function getDungeonDef(id) { return DUNGEONS.find(d => d.id === id); }

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

  // ── Token Economy ──────────────────────────────────────────
  function addTokensFromMP(mpSpent) {
    const gained = Math.floor(mpSpent / MP_PER_TOKEN);
    if (gained > 0) {
      D.tokens += gained;
      saveState();
      updateTokenDisplay();
      log(`⚗️ Gained ${gained} Boss Clearance Token${gained>1?'s':''} from MP spent.`, 'log-token');
    }
    return gained;
  }
  global.dungeonAddTokens = addTokensFromMP;  // called by app.js when MP is spent

  function updateTokenDisplay() {
    const el = document.getElementById('dungeon-token-count');
    if (el) el.textContent = D.tokens;
  }

  // ── Map Generation ─────────────────────────────────────────
  function generateFloor(dungeonId, floor) {
    const rooms = [];
    const gridW = 5, gridH = 4;
    const total = gridW * gridH;   // 20 grid slots, we'll use ~12 rooms

    // Place rooms on a grid with connectivity
    const used = new Array(total).fill(false);
    const chosen = [];

    // Start room always at bottom-left
    chosen.push(gridH * gridW - gridW); // bottom-left
    used[gridH * gridW - gridW] = true;

    // Grow the dungeon organically
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

    // Boss room at position farthest from start
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

      // Connections
      const connections = [];
      for (let j = 0; j < chosen.length; j++) {
        if (i === j) continue;
        const jx = chosen[j] % gridW, jy = Math.floor(chosen[j] / gridW);
        if ((Math.abs(x-jx) === 1 && y === jy) || (Math.abs(y-jy) === 1 && x === jx)) {
          connections.push(j);
        }
      }

      // Monster in room (not start, not boss)
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
    return { atk, def, hp: c.hp, maxHp: c.maxHp || 100 };
  }

  function runCombatRound(playerStats, monster) {
    const log = [];
    // Player attacks
    const pDmg = Math.max(1, Math.floor(playerStats.atk - monster.def * 0.5 + rand(-3,3)));
    monster.currentHp -= pDmg;
    log.push({ actor: 'player', text: `You strike for ${pDmg} damage!`, dmg: pDmg });

    // Monster attacks back if alive
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
    const c = getChar();

    // Check for saved progress
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

    // Check respawn
    if (room.monster.lastKilled && !elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H)) {
      const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - room.monster.lastKilled) / 3600000).toFixed(1);
      log(`💤 Monster respawns in ${hoursLeft}h`, 'log-info');
      return;
    }

    D.combat = {
      roomIdx,
      monster: { ...room.monster },
      playerHpBefore: getChar()?.hp || 100,
      roundLog: [],
    };
    renderCombatPanel();
  }

  function fightRound() {
    if (!D.combat) return;
    const pStats = calcPlayerStats();
    const { log: roundLog, playerDmgTaken, monsterDead } = runCombatRound(pStats, D.combat.monster);

    D.combat.roundLog.push(...roundLog);

    // Apply damage to player
    const c = getChar();
    if (c && playerDmgTaken > 0) {
      c.hp = Math.max(0, (c.hp || 100) - playerDmgTaken);
      // Sync back
      if (typeof apiFetch === 'function') {
        apiFetch('POST', '/api/dungeon/damage', { damage: playerDmgTaken }).catch(()=>{});
      }
    }

    // Monster steal attempt
    if (!monsterDead && D.combat.monster.steal && chance(STEAL_CHANCE)) {
      tryStealFromPlayer(D.combat.roomIdx);
    }

    if (monsterDead) {
      onMonsterDefeated(D.combat.roomIdx);
    } else if (c && c.hp <= 0) {
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
      // Force one monster attack
      const pStats = calcPlayerStats();
      const mDmg = Math.max(1, Math.floor(D.combat.monster.atk - pStats.def * 0.5 + rand(-2,2)));
      const c = getChar();
      if (c) c.hp = Math.max(0, (c.hp||100) - mDmg);
      log(`💥 ${D.combat.monster.name} hits you for ${mDmg} as you flee!`, 'log-danger');
      if (c && c.hp <= 0) { onPlayerDeath(); return; }
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
    // Remove from player
    c.inventory = c.inventory.filter(i => i !== stolen);
    D.rooms[roomIdx].monster.stolenItems.push(stolen);
    log(`💰 ${D.combat.monster.name} stole your ${stolen.name}!`, 'log-danger');
  }

  function onMonsterDefeated(roomIdx) {
    const room = D.rooms[roomIdx];
    room.monster.lastKilled = Date.now();

    // Return stolen items
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

    // Loot drop
    const loot = rollMinorLoot(D.activeDungeon);
    applyLoot(loot);

    log(`✅ ${room.monster.name} defeated!`, 'log-success');
    D.combat = null;
    saveState();
    renderDungeonView();
  }

  function onPlayerDeath() {
    log(`💀 You have been slain! Progress saved.`, 'log-danger');
    // Save progress
    D.savedProgress['tower'] = {
      floor: D.floor,
      pos: D.playerPos,
      rooms: D.rooms,
      explored: [...D.exploredRooms],
    };
    D.combat = null;
    D.activeDungeon = null;
    saveState();
    setTimeout(() => renderDungeonList(), 1500);
  }

  function fightBoss(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.isBoss) return;
    if (D.tokens < TOKENS_PER_RUN) {
      log(`🗝️ Need ${TOKENS_PER_RUN} tokens to challenge the boss. You have ${D.tokens}.`, 'log-danger');
      return;
    }
    D.tokens -= TOKENS_PER_RUN;
    saveState();
    updateTokenDisplay();
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

    // Apply to player
    const c = getChar();
    if (c) {
      c.gold = (c.gold||0) + loot.gold;
      c.gems = (c.gems||0) + loot.gems;
      if (!c.inventory) c.inventory = [];
      c.inventory.push(loot.premiumItem);
    }

    // Advance floor
    D.floor++;
    if (D.floor > (D.highestFloor||1)) D.highestFloor = D.floor;
    delete D.savedProgress['tower'];
    D.rooms = generateFloor(D.activeDungeon, D.floor);
    D.playerPos = D.rooms.findIndex(r => r.isStart);
    D.exploredRooms = new Set([D.playerPos]);
    D.combat = null;
    saveState();

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

  // ── Render ─────────────────────────────────────────────────
  function renderDungeonTab() {
    const container = document.getElementById('tab-dungeon');
    if (!container) return;
    loadState();

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
          <div class="dungeon-token-wrap">
            <div class="dungeon-token-pill">
              <span class="dungeon-token-icon">🗝️</span>
              <span>Boss Clearance Tokens:</span>
              <span id="dungeon-token-count" class="dungeon-token-num">${D.tokens}</span>
            </div>
            <div class="dungeon-token-hint">20 MP spent = 1 Token · ${TOKENS_PER_RUN} Tokens per boss attempt</div>
          </div>
        </div>
        <div id="dungeon-main-area"></div>
        <div id="dungeon-log-panel" class="dungeon-log-panel">
          <div class="dungeon-log-title">📜 Dungeon Log</div>
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
    const def = getDungeonDef(D.activeDungeon);
    if (!def) return;

    const currentRoom = D.rooms[D.playerPos];

    area.innerHTML = `
      <div class="dungeon-active" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">

        <div class="dungeon-active-header">
          <div class="dungeon-active-name">${def.icon} ${def.name}</div>
          <div class="dungeon-active-floor">Floor ${D.floor}</div>
          <button class="dungeon-btn dungeon-btn-exit" onclick="dungeonExit()">⬅ Exit (Save Progress)</button>
        </div>

        <div class="dungeon-travel-bar-wrap">
          <div id="dungeon-travel-bar" class="dungeon-travel-bar"></div>
        </div>

        <div class="dungeon-content-row">
          <div class="dungeon-map-wrap">
            <div class="dungeon-map-label">📍 Dungeon Map</div>
            <div id="dungeon-map-grid" class="dungeon-map-grid">
              ${renderMapGrid()}
            </div>
          </div>

          <div class="dungeon-room-panel">
            <div class="dungeon-room-header">
              ${currentRoom.isBoss ? `<span class="dungeon-room-type boss-room-badge">⚠️ BOSS ROOM</span>` :
                currentRoom.isStart ? `<span class="dungeon-room-type start-room-badge">🚪 Entrance</span>` :
                currentRoom.type === 'treasure' ? `<span class="dungeon-room-type treasure-room-badge">💰 Treasure Room</span>` :
                `<span class="dungeon-room-type">🏚️ Corridor</span>`
              }
              <span class="dungeon-room-id">Room ${D.playerPos + 1}</span>
            </div>

            ${renderRoomInfo(currentRoom)}

            <div class="dungeon-connections">
              <div class="dungeon-conn-label">Passages:</div>
              ${currentRoom.connections.map(ci => {
                const cr = D.rooms[ci];
                const explored = D.exploredRooms.has(ci);
                const monsterAlive = cr.monster && (!cr.monster.lastKilled || !elapsed(cr.monster.lastKilled, MONSTER_RESPAWN_H));
                return `
                  <button class="dungeon-conn-btn ${monsterAlive ? 'has-monster' : ''} ${cr.isBoss ? 'is-boss' : ''}"
                          onclick="dungeonTravel(${ci})" ${D.isTraveling ? 'disabled' : ''}>
                    ${explored
                      ? `${cr.isBoss ? '⚠️' : cr.type === 'treasure' ? '💰' : monsterAlive ? '👹' : '🏚️'} Room ${ci+1}`
                      : '❓ Unknown Room'
                    }
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMapGrid() {
    const def = getDungeonDef(D.activeDungeon);
    const gridW = 5;
    const cells = [];

    // Build grid
    const grid = {};
    for (let i = 0; i < D.rooms.length; i++) {
      const r = D.rooms[i];
      grid[`${r.x},${r.y}`] = i;
    }

    // Get grid bounds
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
          const monsterAlive = room.monster && (!room.monster.lastKilled || !elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H));

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
    const monsterAlive = room.monster && (!room.monster.lastKilled || !elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H));
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
    const area = document.getElementById('dungeon-main-area');
    if (!area || !D.combat) return;
    const def = getDungeonDef(D.activeDungeon);
    const m = D.combat.monster;
    const pStats = calcPlayerStats();
    const hpPct = Math.round(m.currentHp / m.maxHp * 100);
    const pHpPct = Math.round((pStats.hp / pStats.maxHp) * 100);

    const roundEntries = D.combat.roundLog.slice(-10).reverse().map(e =>
      `<div class="combat-log-entry ${e.actor}">${e.text}</div>`
    ).join('');

    area.innerHTML = `
      <div class="dungeon-combat-panel" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
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

  function showMsg(msg, type='info') {
    log(msg, type === 'error' ? 'log-danger' : 'log-info');
  }

  function updateTravelBtn(idx, disabled) {
    const btns = document.querySelectorAll('.dungeon-conn-btn');
    btns.forEach(b => b.disabled = disabled);
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
    renderDungeonList();
  };
  global.closeDungeonVictory = () => {
    const m = document.getElementById('dungeon-boss-modal');
    if (m) m.classList.add('hidden');
    renderDungeonView();
  };
  global.renderDungeonTab    = renderDungeonTab;

  // Override boss-defeat check in fightRound
  const _origFightRound = fightRound;
  global.dungeonAttack = function() {
    if (!D.combat) return;
    const pStats = calcPlayerStats();
    const { log: roundLog, playerDmgTaken, monsterDead } = runCombatRound(pStats, D.combat.monster);
    D.combat.roundLog.push(...roundLog);

    const c = getChar();
    if (c && playerDmgTaken > 0) c.hp = Math.max(0, (c.hp||100) - playerDmgTaken);

    if (!monsterDead && D.combat.monster.steal && chance(STEAL_CHANCE)) {
      tryStealFromPlayer(D.combat.roomIdx);
    }

    if (monsterDead) {
      if (D.combat.monster.isBoss) onBossDefeated();
      else onMonsterDefeated(D.combat.roomIdx);
    } else if (c && c.hp <= 0) {
      onPlayerDeath();
    } else {
      renderCombatPanel();
    }
  };

  // ── CSS Injection ──────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dungeon-styles')) return;
    const style = document.createElement('style');
    style.id = 'dungeon-styles';
    style.textContent = `
      /* ── Dungeon Variables ── */
      :root {
        --dungeon-bg: #080c14;
        --dungeon-surface: #0e1420;
        --dungeon-border: rgba(255,255,255,0.07);
        --dungeon-text: #c8d4e8;
        --dungeon-muted: rgba(200,212,232,0.4);
        --dungeon-accent: #7c3aed;
        --dungeon-gold: #f1c40f;
        --dungeon-danger: #e74c3c;
        --dungeon-success: #2ecc71;
        --dungeon-token: #f39c12;
      }


      /* ── Tower Entry ── */
      .dungeon-tower-entry {
        background: var(--dungeon-surface);
        border: 1px solid var(--dtheme, #7c3aed);
        border-radius: 16px; padding: 20px;
        box-shadow: 0 0 30px var(--dglow, rgba(124,58,237,0.2));
        margin-bottom: 16px;
      }
      .dungeon-tower-top { display:flex; gap:16px; align-items:flex-start; margin-bottom:16px; }
      .dungeon-tower-icon { font-size:3rem; }
      .dungeon-tower-info { flex:1; }
      .dungeon-tower-next {
        background: rgba(0,0,0,0.3); border:1px solid var(--dungeon-border);
        border-radius:10px; padding:14px; margin-top:12px;
      }
      /* ── Floor Preview ── */
      .dungeon-floor-history { margin-top:8px; }
      .dungeon-floor-preview-row { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; }
      .dungeon-floor-preview-card {
        flex:0 0 auto; width:90px; padding:10px 6px;
        background: var(--dungeon-surface); border:1px solid;
        border-radius:10px; text-align:center; display:flex;
        flex-direction:column; align-items:center; gap:4px;
      }
      /* ── Wrapper ── */
      .dungeon-wrapper {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-bottom: 32px;
      }

      /* ── Topbar ── */
      .dungeon-topbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        padding: 16px 20px;
        background: var(--dungeon-surface);
        border: 1px solid var(--dungeon-border);
        border-radius: 14px;
      }
      .dungeon-title-wrap { display:flex; align-items:center; gap:12px; }
      .dungeon-title-icon { font-size:2rem; }
      .dungeon-title-text { font-family:'Cinzel Decorative',serif; font-size:1.25rem; color:#e2e8f0; letter-spacing:0.05em; }
      .dungeon-title-sub  { font-size:0.75rem; color:var(--dungeon-muted); margin-top:2px; }
      .dungeon-token-wrap { text-align:right; }
      .dungeon-token-pill {
        display: inline-flex; align-items:center; gap:8px;
        background: rgba(243,156,18,0.1); border:1px solid rgba(243,156,18,0.3);
        border-radius:20px; padding:6px 14px;
        font-size:0.85rem; color:var(--dungeon-token);
      }
      .dungeon-token-num  { font-weight:700; font-size:1.1rem; }
      .dungeon-token-hint { font-size:0.7rem; color:var(--dungeon-muted); margin-top:4px; }

      /* ── Dungeon List ── */
      .dungeon-list { display:flex; flex-direction:column; gap:14px; }
      .dungeon-card {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 18px 20px;
        background: var(--dungeon-surface);
        border: 1px solid var(--dungeon-border);
        border-radius: 14px;
        transition: border-color 0.2s, box-shadow 0.2s;
        position: relative;
        overflow: hidden;
      }
      .dungeon-card::before {
        content:''; position:absolute; left:0; top:0; bottom:0; width:4px;
        background:var(--dtheme,#7c3aed);
        box-shadow: 0 0 16px var(--dglow,rgba(124,58,237,0.4));
      }
      .dungeon-card:not(.dungeon-card-locked):hover {
        border-color:var(--dtheme,#7c3aed);
        box-shadow: 0 0 24px var(--dglow,rgba(124,58,237,0.2));
      }
      .dungeon-card-locked { opacity:0.5; filter:grayscale(0.4); }
      .dungeon-card-icon { font-size:2.5rem; min-width:48px; text-align:center; margin-top:4px; }
      .dungeon-card-info { flex:1; }
      .dungeon-card-name { font-family:'Cinzel',serif; font-size:1.1rem; color:#e2e8f0; margin-bottom:4px; }
      .dungeon-card-desc { font-size:0.8rem; color:var(--dungeon-muted); margin-bottom:8px; }
      .dungeon-card-meta { display:flex; flex-wrap:wrap; gap:10px; font-size:0.75rem; color:var(--dungeon-muted); margin-bottom:8px; }
      .dungeon-save-badge { color:var(--dungeon-token); background:rgba(243,156,18,0.1); border-radius:10px; padding:2px 8px; }
      .dungeon-boss-preview { font-size:0.85rem; color:var(--dungeon-text); margin-bottom:4px; }
      .dungeon-boss-icon   { margin-right:6px; }
      .dungeon-boss-name   { font-weight:600; }
      .dungeon-boss-drops  { font-size:0.72rem; color:var(--dungeon-muted); }
      .dungeon-card-action { display:flex; align-items:center; min-width:140px; justify-content:flex-end; }

      /* ── Buttons ── */
      .dungeon-btn {
        padding: 8px 16px; border-radius:8px; font-size:0.82rem; font-weight:600;
        cursor:pointer; border:1px solid; transition:all 0.15s; letter-spacing:0.03em;
        font-family:'Cinzel',serif;
      }
      .dungeon-btn:disabled { opacity:0.4; cursor:not-allowed; }
      .dungeon-btn-enter  { background:rgba(124,58,237,0.15); border-color:rgba(124,58,237,0.5); color:#a78bfa; }
      .dungeon-btn-enter:hover:not(:disabled) { background:rgba(124,58,237,0.3); }
      .dungeon-btn-locked { background:rgba(100,100,100,0.1); border-color:#555; color:#666; }
      .dungeon-btn-exit   { background:rgba(231,76,60,0.1); border-color:rgba(231,76,60,0.3); color:#e74c3c; font-size:0.75rem; padding:6px 12px; }
      .dungeon-btn-fight  { background:rgba(231,76,60,0.15); border-color:rgba(231,76,60,0.4); color:#e74c3c; }
      .dungeon-btn-fight:hover:not(:disabled) { background:rgba(231,76,60,0.3); }
      .dungeon-btn-run    { background:rgba(52,152,219,0.1); border-color:rgba(52,152,219,0.3); color:#3498db; }
      .dungeon-btn-run:hover:not(:disabled) { background:rgba(52,152,219,0.25); }
      .boss-fight-btn { width:100%; margin-top:12px; padding:10px; font-size:0.9rem; border-color:rgba(241,196,15,0.5); background:rgba(241,196,15,0.08); color:var(--dungeon-gold); }
      .boss-fight-btn:hover:not(:disabled) { background:rgba(241,196,15,0.2); box-shadow:0 0 20px rgba(241,196,15,0.15); }

      /* ── Active Dungeon ── */
      .dungeon-active { display:flex; flex-direction:column; gap:12px; }
      .dungeon-active-header {
        display:flex; align-items:center; gap:16px; flex-wrap:wrap;
        padding:12px 16px;
        background:var(--dungeon-surface);
        border:1px solid var(--dungeon-border);
        border-radius:12px;
      }
      .dungeon-active-name  { font-family:'Cinzel Decorative',serif; font-size:1.1rem; color:#e2e8f0; flex:1; }
      .dungeon-active-floor {
        background:rgba(255,255,255,0.06); border:1px solid var(--dungeon-border);
        border-radius:8px; padding:4px 12px; font-size:0.8rem; color:var(--dungeon-muted);
      }

      /* ── Travel bar ── */
      .dungeon-travel-bar-wrap {
        height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;
      }
      .dungeon-travel-bar {
        height:100%; width:0%; background:linear-gradient(90deg,var(--dtheme,#7c3aed),#a78bfa);
        border-radius:2px;
      }

      /* ── Content row ── */
      .dungeon-content-row { display:flex; gap:14px; flex-wrap:wrap; }
      .dungeon-map-wrap    { flex:0 0 auto; }
      .dungeon-map-label   { font-size:0.72rem; color:var(--dungeon-muted); margin-bottom:8px; letter-spacing:0.08em; text-transform:uppercase; }
      .dungeon-room-panel  { flex:1; min-width:240px; background:var(--dungeon-surface); border:1px solid var(--dungeon-border); border-radius:12px; padding:16px; }

      /* ── Map Grid ── */
      .dungeon-map-grid {
        background: rgba(0,0,0,0.4); border:1px solid var(--dungeon-border);
        border-radius:10px; padding:10px;
      }
      .dungeon-grid-inner { display:grid; gap:5px; }
      .map-room, .map-void {
        width:38px; height:38px; border-radius:6px; display:flex; align-items:center;
        justify-content:center; font-size:1rem; transition:all 0.2s;
      }
      .map-void      { background:transparent; }
      .map-room-fog  { background:rgba(30,30,50,0.6); border:1px solid rgba(255,255,255,0.05); color:transparent; }
      .map-room-player { background:rgba(124,58,237,0.3); border:2px solid var(--dtheme,#7c3aed); box-shadow:0 0 10px var(--dglow); }
      .map-room-boss { background:rgba(231,76,60,0.2); border:1px solid rgba(231,76,60,0.5); animation:boss-pulse 2s ease-in-out infinite; }
      .map-room-treasure { background:rgba(241,196,15,0.15); border:1px solid rgba(241,196,15,0.4); }
      .map-room-monster { background:rgba(231,76,60,0.1); border:1px solid rgba(231,76,60,0.25); }
      .map-room-clear { background:rgba(46,204,113,0.08); border:1px solid rgba(46,204,113,0.2); }
      @keyframes boss-pulse { 0%,100%{box-shadow:0 0 4px rgba(231,76,60,0.3)} 50%{box-shadow:0 0 16px rgba(231,76,60,0.6)} }

      /* ── Room Panel ── */
      .dungeon-room-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .dungeon-room-type   { font-size:0.78rem; color:var(--dungeon-muted); }
      .dungeon-room-id     { font-size:0.72rem; color:var(--dungeon-muted); }
      .boss-room-badge    { color:#e74c3c; font-weight:700; animation:boss-pulse 1.5s infinite; }
      .start-room-badge   { color:#3498db; }
      .treasure-room-badge { color:var(--dungeon-gold); }

      /* ── Monster Info ── */
      .dungeon-room-monster { display:flex; flex-direction:column; gap:10px; }
      .monster-icon         { font-size:2.5rem; text-align:center; }
      .monster-name         { font-family:'Cinzel',serif; font-size:1rem; color:#e2e8f0; text-align:center; }
      .monster-hp-bar-wrap  { height:6px; background:rgba(255,255,255,0.08); border-radius:3px; margin:4px 0; }
      .monster-hp-bar       { height:100%; background:#e74c3c; border-radius:3px; transition:width 0.3s; }
      .monster-stats        { font-size:0.75rem; color:var(--dungeon-muted); text-align:center; }
      .monster-btns         { display:flex; gap:8px; justify-content:center; }
      .stolen-items-notice  { background:rgba(231,76,60,0.1); border:1px solid rgba(231,76,60,0.25); border-radius:8px; padding:8px; font-size:0.75rem; color:#e74c3c; text-align:center; }

      /* ── Boss Room ── */
      .dungeon-boss-room  { text-align:center; }
      .boss-icon-big      { font-size:3rem; margin-bottom:8px; }
      .boss-name-big      { font-family:'Cinzel Decorative',serif; font-size:1.2rem; color:#e74c3c; margin-bottom:8px; }
      .boss-stats         { font-size:0.8rem; color:var(--dungeon-muted); margin-bottom:6px; }
      .boss-drop-preview  { font-size:0.75rem; color:var(--dungeon-gold); }

      /* ── Connections ── */
      .dungeon-connections  { margin-top:14px; border-top:1px solid var(--dungeon-border); padding-top:12px; }
      .dungeon-conn-label   { font-size:0.7rem; color:var(--dungeon-muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px; }
      .dungeon-conn-btn {
        display:inline-flex; align-items:center; gap:6px;
        margin:4px 4px 0 0; padding:7px 14px;
        background:rgba(255,255,255,0.04); border:1px solid var(--dungeon-border);
        border-radius:8px; color:var(--dungeon-text); font-size:0.8rem; cursor:pointer;
        transition:all 0.15s;
      }
      .dungeon-conn-btn:hover:not(:disabled) { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.15); }
      .dungeon-conn-btn.has-monster { border-color:rgba(231,76,60,0.35); color:#e74c3c; }
      .dungeon-conn-btn.is-boss     { border-color:rgba(241,196,15,0.4);  color:var(--dungeon-gold); }
      .dungeon-conn-btn:disabled { opacity:0.4; cursor:not-allowed; }

      /* ── Combat Panel ── */
      .dungeon-combat-panel {
        background: var(--dungeon-surface);
        border: 1px solid var(--dtheme,#7c3aed);
        border-radius:16px; padding:20px;
        box-shadow: 0 0 30px var(--dglow,rgba(124,58,237,0.2));
      }
      .combat-boss-warning { text-align:center; color:#e74c3c; font-weight:700; letter-spacing:0.1em; font-size:0.85rem; margin-bottom:4px; animation:boss-pulse 1s infinite; }
      .combat-title        { font-family:'Cinzel',serif; font-size:1.1rem; color:#e2e8f0; text-align:center; margin-bottom:16px; }
      .combat-fighters     { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
      .combat-fighter      { flex:1; text-align:center; }
      .combat-vs           { font-family:'Cinzel Decorative',serif; color:var(--dungeon-muted); font-size:1.2rem; }
      .fighter-icon        { font-size:2.5rem; margin-bottom:6px; }
      .fighter-name        { font-size:0.85rem; color:var(--dungeon-text); margin-bottom:6px; }
      .fighter-hp-bar-wrap { height:8px; background:rgba(255,255,255,0.08); border-radius:4px; margin-bottom:4px; }
      .fighter-hp-bar      { height:100%; border-radius:4px; transition:width 0.4s ease; }
      .player-hp           { background:linear-gradient(90deg,#2ecc71,#27ae60); }
      .monster-hp          { background:linear-gradient(90deg,#e74c3c,#c0392b); }
      .fighter-stats       { font-size:0.72rem; color:var(--dungeon-muted); }
      .combat-log {
        max-height:140px; overflow-y:auto; padding:10px 12px;
        background:rgba(0,0,0,0.3); border-radius:8px;
        border:1px solid var(--dungeon-border); margin-bottom:14px;
      }
      .combat-log-entry { font-size:0.8rem; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
      .combat-log-entry.player  { color:#a78bfa; }
      .combat-log-entry.monster { color:#e74c3c; }
      .combat-actions { display:flex; gap:10px; justify-content:center; }

      /* ── Dungeon Log ── */
      .dungeon-log-panel { background:var(--dungeon-surface); border:1px solid var(--dungeon-border); border-radius:12px; padding:14px 16px; }
      .dungeon-log-title { font-size:0.72rem; color:var(--dungeon-muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px; }
      .dungeon-log-entries { max-height:160px; overflow-y:auto; }
      .dungeon-log-entry { font-size:0.78rem; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04); color:var(--dungeon-text); }
      .log-enter   { color:#a78bfa; }
      .log-travel  { color:var(--dungeon-muted); }
      .log-arrive  { color:#3498db; }
      .log-loot    { color:var(--dungeon-gold); }
      .log-success { color:var(--dungeon-success); }
      .log-danger  { color:var(--dungeon-danger); }
      .log-token   { color:var(--dungeon-token); }
      .log-boss    { color:var(--dungeon-gold); font-weight:700; }
      .log-info    { color:var(--dungeon-muted); }

      /* ── Boss Victory Modal ── */
      .dungeon-victory-box { text-align:center; }
      .victory-icon        { font-size:3.5rem; margin-bottom:8px; }
      .victory-title       { font-family:'Cinzel Decorative',serif; font-size:1.6rem; color:var(--dungeon-gold); text-shadow:0 0 20px rgba(241,196,15,0.5); margin-bottom:4px; }
      .victory-boss-name   { font-size:0.9rem; color:var(--dungeon-muted); margin-bottom:16px; }
      .victory-loot        { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
      .loot-row            { font-size:1rem; color:var(--dungeon-text); }
      .victory-next        { font-size:0.8rem; color:var(--dungeon-muted); }

      /* ── Room clear ── */
      .dungeon-room-clear { padding:12px; text-align:center; }
    `;
    document.head.appendChild(style);
  }

  // ── Init ───────────────────────────────────────────────────
  injectStyles();
  loadState();

})(window);
