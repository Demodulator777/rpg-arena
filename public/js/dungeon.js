// ============================================================
//  dungeon.js  — Battle Arena Dungeon System (Redesign)
//  Requires: global `api(method, path, body)` from app.js
//            global `character` object
//            global `renderTopBar`, `renderCharacter` helpers
// ============================================================

(function (global) {
  'use strict';

  const apiFetch = global.api || (async () => {
    console.error('[Dungeon] api() not available');
    return { success: false, error: 'api not available' };
  });

  // ── Constants ──────────────────────────────────────────────
  const MP_PER_TOKEN       = 20;
  const TOKENS_PER_RUN     = 50;
  const MONSTER_RESPAWN_H  = 12;
  const TRAVEL_BASE_MS     = 7000;
  const RUN_ESCAPE_CHANCE  = 0.75;
  const STEAL_CHANCE       = 0.18;
  const ROOMS_PER_FLOOR    = 12;

  // ── Room visuals (emoji fallback when image 404s) ──────────
  const ROOM_EMOJI = {
    start:    '🚪',
    corridor: '🏚️',
    treasure: '💰',
    boss:     '💀',
  };

  // ── Dungeon & Floors ────────────────────────────────────────
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
    { name:'Death Knight Malachar', icon:'⚔️', baseHp:600,  baseAtk:45, baseDef:20, steal:true  },
    { name:'Ignarath the Eternal',  icon:'🌋', baseHp:700,  baseAtk:55, baseDef:25, steal:false },
    { name:'Nyxaroth the Devourer', icon:'👁️', baseHp:800,  baseAtk:65, baseDef:30, steal:true  },
    { name:'The Hollow King',       icon:'👑', baseHp:900,  baseAtk:70, baseDef:35, steal:true  },
    { name:'Voidborn Colossus',     icon:'💠', baseHp:1000, baseAtk:80, baseDef:40, steal:false },
    { name:'The Undying Empress',   icon:'👸', baseHp:1100, baseAtk:90, baseDef:45, steal:true  },
    { name:'Abyssal Sovereign',     icon:'🌊', baseHp:1200, baseAtk:95, baseDef:50, steal:true  },
  ];

  const ROMAN = ['','II','III','IV','V','VI','VII','VIII','IX','X'];

  const MINION_LOOT = [
    { type:'gold',       weight:40, min:5,  max:40  },
    { type:'potion_hp',  weight:25, name:'Health Potion',  icon:'🧪', heal:50  },
    { type:'potion_mp',  weight:15, name:'Mana Potion',    icon:'💧', mp:30    },
    { type:'item_common',weight:20 },
  ];

  const COMMON_ITEMS = [
    { name:'Iron Shard',     icon:'🔩', type:'material', rarity:'common' },
    { name:'Bone Fragment',  icon:'🦴', type:'material', rarity:'common' },
    { name:'Dim Crystal',    icon:'💎', type:'material', rarity:'common' },
    { name:'Frayed Cloth',   icon:'🧵', type:'material', rarity:'common' },
    { name:'Tarnished Coin', icon:'🪙', type:'material', rarity:'common' },
  ];

  const GUILD_EXCHANGES = [
    { id:'exchange_gold',      name:'Exchange Dungeon Gold',   icon:'💰',
      cost:{ dungeonGold:100 }, reward:{ gold:80, reputation:1 },
      desc:'Convert 100 dungeon gold into 80 real gold + 1 reputation' },
    { id:'exchange_materials', name:'Material Bounty',         icon:'📦',
      cost:{ crypt_dust:10, void_shard:5 }, reward:{ gold:200, reputation:2 },
      desc:'Trade materials for 200 gold' },
    { id:'exchange_rare',      name:'Rare Material Bounty',    icon:'✨',
      cost:{ dragon_scale:3, soul_essence:2 }, reward:{ gold:500, reputation:5, item:'Rare Item Chest' },
      desc:'Trade rare materials for a Rare Item Chest' },
    { id:'exchange_legendary', name:'Legendary Exchange',      icon:'👑',
      cost:{ abyssal_core:2, titan_heart:1 }, reward:{ gold:2000, reputation:20, item:'Legendary Item Chest' },
      desc:'Trade legendary materials for a Legendary Item Chest' },
  ];

  const GUILD_RANKS = [
    { rank:0, name:'Novice',      reputationNeeded:0,    discount:0  },
    { rank:1, name:'Apprentice',  reputationNeeded:10,   discount:5  },
    { rank:2, name:'Journeyman',  reputationNeeded:50,   discount:10 },
    { rank:3, name:'Expert',      reputationNeeded:200,  discount:15 },
    { rank:4, name:'Master',      reputationNeeded:500,  discount:20 },
    { rank:5, name:'Grand Master',reputationNeeded:1000, discount:25 },
  ];

  // ── State ──────────────────────────────────────────────────
  let D = {
    tokens:          0,
    activeDungeon:   null,
    floor:           1,
    highestFloor:    1,
    rooms:           [],
    playerPos:       0,
    exploredRooms:   new Set(),
    combat:          null,
    travelTimer:     null,
    isTraveling:     false,
    dungeonLog:      [],
    savedProgress:   {},
    dungeonInventory:[],
    guildReputation: 0,
  };

  // ── Helpers ────────────────────────────────────────────────
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function chance(p)      { return Math.random() < p; }
  function elapsed(ts, h) { return (Date.now() - ts) >= h * 3600000; }
  function getChar()      { return (typeof character !== 'undefined' && character) ? character : null; }

  function log(msg, cls='') {
    D.dungeonLog.unshift({ msg, cls, ts: Date.now() });
    if (D.dungeonLog.length > 60) D.dungeonLog.pop();
    renderLog();
  }

  // ── Persistence ────────────────────────────────────────────
  function saveLocal() {
    try {
      const s = { ...D, exploredRooms: [...D.exploredRooms] };
      localStorage.setItem('dungeon_v2', JSON.stringify(s));
    } catch(e) {}
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem('dungeon_v2');
      if (raw) {
        const p = JSON.parse(raw);
        p.exploredRooms = new Set(p.exploredRooms || []);
        D = { ...D, ...p };
      }
    } catch(e) {}
  }

  // ── Turso / server sync ────────────────────────────────────
  // All DB ops use upsert (INSERT … ON CONFLICT DO UPDATE)
  // so the first call automatically creates the row.

  async function syncLoad() {
    try {
      const res = await apiFetch('GET', '/game/dungeon/data');
      if (!res || !res.success) { loadLocal(); return; }

      D.tokens       = res.tokens       ?? D.tokens;
      D.floor        = res.floor        ?? D.floor;
      D.highestFloor = res.highestFloor ?? D.highestFloor;

      // Restore in-progress run if server has one
      if (res.progress && res.progress.rooms_json) {
        try {
          const rooms   = JSON.parse(res.progress.rooms_json);
          const explored= JSON.parse(res.progress.explored_json || '[]');
          const combat  = res.progress.combat_json ? JSON.parse(res.progress.combat_json) : null;

          if (rooms && rooms.length > 0) {
            D.savedProgress['tower'] = {
              floor:   res.progress.floor   ?? D.floor,
              pos:     res.progress.player_pos ?? 0,
              rooms,
              explored,
              combat,
            };
          }
        } catch(e) { console.warn('[Dungeon] Failed to parse saved rooms', e); }
      }

      updateTokenDisplay();

      // Gold display
      const goldRes = await apiFetch('GET', '/game/dungeon/gold');
      if (goldRes?.success) {
        const el = document.getElementById('dungeon-gold-count');
        if (el) el.textContent = goldRes.dungeonGold ?? 0;
      }
    } catch(e) {
      console.error('[Dungeon] syncLoad failed', e);
      loadLocal();
    }
  }

  async function syncSaveProgress() {
    try {
      const prog = D.savedProgress['tower'] ?? null;
      await apiFetch('POST', '/game/dungeon/progress', {
        floor:          D.floor,
        highestFloor:   D.highestFloor,
        playerPos:      D.playerPos,
        activeDungeon:  D.activeDungeon ?? 'tower',
        rooms_json:     prog ? JSON.stringify(prog.rooms)               : JSON.stringify(D.rooms),
        explored_json:  prog ? JSON.stringify(prog.explored)            : JSON.stringify([...D.exploredRooms]),
        combat_json:    D.combat ? JSON.stringify(D.combat)             : null,
      });
    } catch(e) { console.error('[Dungeon] syncSaveProgress failed', e); }
    saveLocal();
  }

  async function syncTokens() {
    try { await apiFetch('POST', '/game/dungeon/tokens', { tokens: D.tokens }); } catch(e) {}
    saveLocal();
  }

  async function spendTokens(amount) {
    if (D.tokens < amount) return false;
    D.tokens -= amount;
    updateTokenDisplay();
    await syncTokens();
    return true;
  }

  function addTokensFromMP(mpSpent) {
    apiFetch('POST', '/game/dungeon/mp-spent', { mpSpent })
      .then(res => {
        if (res?.totalTokens !== undefined) {
          D.tokens = res.totalTokens;
          updateTokenDisplay();
          saveLocal();
          log(`⚗️ Gained ${res.tokensEarned} token${res.tokensEarned !== 1 ? 's' : ''} from MP`, 'log-token');
        }
      })
      .catch(e => console.error('[Dungeon] mp-spent failed', e));
  }

  global.dungeonAddTokens = addTokensFromMP;

  function updateTokenDisplay() {
    const el = document.getElementById('dungeon-token-count');
    if (el) el.textContent = D.tokens;
  }

  async function refreshCharacter() {
    try {
      const c = await apiFetch('GET', '/game/character');
      if (c) {
        if (typeof character !== 'undefined') Object.assign(character, c);
        if (typeof window.character !== 'undefined') window.character = c;
        if (typeof renderTopBar === 'function') renderTopBar();
        if (typeof renderCharacter === 'function') renderCharacter();
      }
    } catch(e) {}
  }

  // ── Floor helpers ──────────────────────────────────────────
  function getFloorTheme(floor) {
    return FLOOR_THEMES[Math.floor((floor - 1) / 10) % FLOOR_THEMES.length];
  }

  function getMonstersForFloor(floor) {
    return MONSTER_POOL
      .filter(m => m.minFloor <= floor)
      .map(m => ({
        ...m,
        hp:  Math.round(m.hp  + floor * 8),
        atk: Math.round(m.atk + floor * 2.5),
        def: Math.round(m.def + floor * 1.2),
      }));
  }

  function getBossForFloor(floor) {
    const idx   = (floor - 1) % BOSS_POOL.length;
    const tier  = Math.floor((floor - 1) / BOSS_POOL.length);
    const b     = BOSS_POOL[idx];
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

  function getDungeonDef() {
    const floor  = D.floor || 1;
    const t      = getFloorTheme(floor);
    return {
      id: 'tower', name: 'The Endless Tower', icon: '🗼',
      theme: t.theme, themeGlow: t.themeGlow, themeName: t.name,
      monsters: getMonstersForFloor(floor),
      boss:     getBossForFloor(floor),
    };
  }

  // ── Map Generation ─────────────────────────────────────────
  function generateFloor(floor) {
    const gridW = 5, gridH = 4;
    const total = gridW * gridH;
    const used  = new Array(total).fill(false);
    const chosen = [];

    // start bottom-left
    const startCell = gridH * gridW - gridW;
    chosen.push(startCell);
    used[startCell] = true;

    while (chosen.length < ROOMS_PER_FLOOR - 1) {
      const base = chosen[rand(0, chosen.length - 1)];
      const bx = base % gridW, by = Math.floor(base / gridW);
      const neighbors = [];
      if (bx > 0 && !used[by*gridW+(bx-1)]) neighbors.push(by*gridW+(bx-1));
      if (bx < gridW-1 && !used[by*gridW+(bx+1)]) neighbors.push(by*gridW+(bx+1));
      if (by > 0 && !used[(by-1)*gridW+bx]) neighbors.push((by-1)*gridW+bx);
      if (by < gridH-1 && !used[(by+1)*gridW+bx]) neighbors.push((by+1)*gridW+bx);
      if (!neighbors.length) continue;
      const pick = neighbors[rand(0, neighbors.length-1)];
      used[pick] = true;
      chosen.push(pick);
    }

    // Boss = farthest from start
    let farthest = chosen[0], maxDist = 0;
    const sx = chosen[0] % gridW, sy = Math.floor(chosen[0] / gridW);
    for (const c of chosen) {
      const d = Math.abs(c % gridW - sx) + Math.abs(Math.floor(c / gridW) - sy);
      if (d > maxDist) { maxDist = d; farthest = c; }
    }

    const rooms = [];
    for (let i = 0; i < chosen.length; i++) {
      const idx  = chosen[i];
      const x    = idx % gridW, y = Math.floor(idx / gridW);
      const isBoss  = idx === farthest;
      const isStart = i === 0;

      const connections = [];
      for (let j = 0; j < chosen.length; j++) {
        if (i === j) continue;
        const jx = chosen[j] % gridW, jy = Math.floor(chosen[j] / gridW);
        if ((Math.abs(x-jx)===1 && y===jy) || (x===jx && Math.abs(y-jy)===1)) {
          connections.push(j);
        }
      }

      let monster = null;
      const monsters = getMonstersForFloor(floor);
      if (!isStart && !isBoss && chance(0.7) && monsters.length) {
        const m = monsters[rand(0, monsters.length-1)];
        monster = {
          ...m,
          currentHp: m.hp + floor * 5,
          maxHp:     m.hp + floor * 5,
          atk:  m.atk + floor * 2,
          def:  m.def + floor,
          lastKilled: null,
          stolenItems: [],
        };
      }

      const type = isBoss ? 'boss' : isStart ? 'start' : (chance(0.15) ? 'treasure' : 'corridor');

      rooms.push({ id:i, gridIdx:idx, x, y, isBoss, isStart, connections, monster, looted:false, type });
    }
    return rooms;
  }

  // ── Combat ─────────────────────────────────────────────────
  function calcPlayerStats() {
    const c = getChar();
    if (!c) return { atk:10, def:5, hp:100, maxHp:100 };
    return {
      atk:   Math.floor((c.strength||10)*2 + (c.agility||10)*0.5),
      def:   Math.floor((c.defense||5) + (c.agility||10)*0.3),
      hp:    c.hp_current ?? c.hp ?? 100,
      maxHp: c.hp_max ?? 100,
    };
  }

  function runCombatRound(pStats, monster) {
    const entries = [];
    const pDmg = Math.max(1, Math.floor(pStats.atk - monster.def * 0.5 + rand(-3,3)));
    monster.currentHp -= pDmg;
    entries.push({ actor:'player',  text:`You strike for ${pDmg} damage!` });
    if (monster.currentHp > 0) {
      const mDmg = Math.max(1, Math.floor(monster.atk - pStats.def * 0.5 + rand(-2,2)));
      entries.push({ actor:'monster', text:`${monster.name} hits you for ${mDmg}!` });
      return { entries, playerDmgTaken:mDmg, monsterDead:false };
    }
    return { entries, playerDmgTaken:0, monsterDead:true };
  }

  // ── Loot ───────────────────────────────────────────────────
  function rollMinorLoot() {
    const total = MINION_LOOT.reduce((s,l) => s+l.weight, 0);
    let r = rand(0, total-1);
    for (const entry of MINION_LOOT) {
      r -= entry.weight;
      if (r < 0) {
        if (entry.type === 'gold')        return { type:'gold', amount: rand(entry.min, entry.max) };
        if (entry.type === 'item_common') return { type:'item', item: COMMON_ITEMS[rand(0, COMMON_ITEMS.length-1)] };
        return { type: entry.type, ...entry };
      }
    }
    return { type:'gold', amount: rand(5,20) };
  }

  function rollBossLoot(boss) {
    const l = boss.loot;
    return {
      gold:  rand(l.gold[0], l.gold[1]),
      gems:  rand(l.gems[0], l.gems[1]),
      premiumItem: {
        name: 'Premium Activation Scroll', icon:'📜',
        days: rand(l.premiumDays[0], l.premiumDays[1]),
        type: 'premium_scroll', rarity: l.itemRarity,
      },
    };
  }

  function applyLoot(loot) {
    if (loot.type === 'gold') {
      log(`💰 Found ${loot.amount} dungeon gold`, 'log-loot');
      apiFetch('POST', '/game/dungeon/add-gold', { amount: loot.amount }).catch(() => {});
      refreshGoldDisplay();
    } else if (loot.type === 'potion_hp') {
      const item = { name:loot.name, icon:loot.icon, type:'consumable', effect:{ type:'heal', value:loot.heal }, rarity:'common', qty:1 };
      apiFetch('POST', '/game/inventory/add', { item }).catch(() => {});
      log(`🧪 Found ${loot.name}`, 'log-loot');
    } else if (loot.type === 'potion_mp') {
      const item = { name:loot.name, icon:loot.icon, type:'consumable', effect:{ type:'mp', value:loot.mp }, rarity:'common', qty:1 };
      apiFetch('POST', '/game/inventory/add', { item }).catch(() => {});
      log(`💧 Found ${loot.name}`, 'log-loot');
    } else if (loot.type === 'item') {
      apiFetch('POST', '/game/inventory/add', { item: loot.item }).catch(() => {});
      log(`📦 Found ${loot.item.icon} ${loot.item.name}`, 'log-loot');
    }
    refreshCharacter();
  }

  function refreshGoldDisplay() {
    apiFetch('GET', '/game/dungeon/gold').then(res => {
      const el = document.getElementById('dungeon-gold-count');
      if (el && res?.success) el.textContent = res.dungeonGold ?? 0;
    }).catch(() => {});
  }

  // ── Core Actions ───────────────────────────────────────────
  function enterDungeon() {
    if (D.savedProgress['tower']) {
      const s = D.savedProgress['tower'];
      D.activeDungeon  = 'tower';
      D.floor          = s.floor  ?? D.floor;
      D.playerPos      = s.pos    ?? 0;
      D.rooms          = s.rooms  ?? [];
      D.exploredRooms  = new Set(s.explored ?? []);
      D.combat         = s.combat ?? null;

      if (!D.rooms.length) {
        D.rooms = generateFloor(D.floor);
        D.playerPos = D.rooms.findIndex(r => r.isStart) || 0;
        D.exploredRooms = new Set([D.playerPos]);
      }

      log(`🔮 Resuming Floor ${D.floor}…`, 'log-enter');
    } else {
      D.activeDungeon  = 'tower';
      D.floor          = D.floor || 1;
      D.rooms          = generateFloor(D.floor);
      D.playerPos      = D.rooms.findIndex(r => r.isStart);
      if (D.playerPos === -1) D.playerPos = 0;
      D.exploredRooms  = new Set([D.playerPos]);
      D.dungeonLog     = [];
      D.combat         = null;
      log(`⚔️ Entered The Endless Tower — Floor ${D.floor}`, 'log-enter');
    }

    saveLocal();
    syncSaveProgress();

    if (D.combat) renderCombatPanel();
    else renderDungeonView();
  }

  function travelToRoom(targetIdx) {
    if (D.isTraveling || D.combat) return;
    const current = D.rooms[D.playerPos];
    if (!current?.connections.includes(targetIdx)) return;

    D.isTraveling = true;
    renderDirectionButtons(true); // disable during travel

    const travelMs = TRAVEL_BASE_MS + rand(0, 3000);
    const bar = document.getElementById('dungeon-travel-bar');
    if (bar) { bar.style.transition = `width ${travelMs}ms linear`; bar.style.width = '100%'; }

    log(`🚶 Moving to room ${targetIdx + 1}…`, 'log-travel');

    D.travelTimer = setTimeout(() => {
      D.playerPos = targetIdx;
      D.exploredRooms.add(targetIdx);
      D.isTraveling = false;
      if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }

      saveLocal();
      syncSaveProgress();

      const target = D.rooms[targetIdx];
      log(`📍 Arrived: ${target.isBoss ? '⚠️ BOSS CHAMBER' : target.type === 'treasure' ? '💰 Treasure Room' : `Room ${targetIdx+1}`}`, 'log-arrive');

      if (target.type === 'treasure' && !target.looted) {
        target.looted = true;
        applyLoot(rollMinorLoot());
      }

      renderDungeonView();
    }, travelMs);
  }

  function initiateFight(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room?.monster) return;
    if (room.monster.lastKilled && !elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H)) {
      const h = (MONSTER_RESPAWN_H - (Date.now() - room.monster.lastKilled) / 3600000).toFixed(1);
      log(`💤 Respawns in ${h}h`, 'log-info');
      return;
    }
    D.combat = { roomIdx, monster: { ...room.monster }, roundLog:[], playerHpBefore: getChar()?.hp_current ?? 100 };
    renderCombatPanel();
  }

  function fightRound() {
    if (!D.combat) return;
    const c = getChar();
    if (!c) return;

    const pStats = calcPlayerStats();
    const { entries, playerDmgTaken, monsterDead } = runCombatRound(pStats, D.combat.monster);
    D.combat.roundLog.push(...entries);

    if (playerDmgTaken > 0) {
      const newHp = Math.max(0, pStats.hp - playerDmgTaken);
      c.hp_current = newHp;
      c.hp = newHp;
      apiFetch('POST', '/game/dungeon/update-health', { hp: newHp }).catch(() => {});
      if (typeof renderTopBar === 'function') renderTopBar();
    }

    if ((c.hp_current ?? c.hp ?? 100) <= 0) { onPlayerDeath(); return; }

    if (!monsterDead && D.combat.monster.steal && chance(STEAL_CHANCE)) tryStealFromPlayer(D.combat.roomIdx);

    if (monsterDead) {
      if (D.combat.monster.isBoss) onBossDefeated();
      else onMonsterDefeated(D.combat.roomIdx);
    } else {
      renderCombatPanel();
    }
  }

  function tryRun(roomIdx) {
    if (chance(RUN_ESCAPE_CHANCE)) {
      log(`💨 Escaped!`, 'log-success');
      D.combat = null;
      renderDungeonView();
    } else {
      const pStats = calcPlayerStats();
      const mDmg = Math.max(1, Math.floor(D.combat.monster.atk - pStats.def * 0.5 + rand(-2,2)));
      const c = getChar();
      if (c) { c.hp_current = Math.max(0, (c.hp_current ?? c.hp ?? 100) - mDmg); c.hp = c.hp_current; }
      log(`⚠️ Failed to flee! Took ${mDmg} damage!`, 'log-danger');
      if ((c?.hp_current ?? 0) <= 0) { onPlayerDeath(); return; }
      D.combat = null;
      renderDungeonView();
    }
  }

  function tryStealFromPlayer(roomIdx) {
    const c = getChar();
    if (!c?.inventory?.length) return;
    const unequipped = c.inventory.filter(i => !i.equipped);
    if (!unequipped.length) return;
    const stolen = unequipped[rand(0, unequipped.length-1)];
    c.inventory = c.inventory.filter(i => i !== stolen);
    D.rooms[roomIdx].monster.stolenItems.push(stolen);
    log(`💰 ${D.combat.monster.name} stole your ${stolen.name}!`, 'log-danger');
  }

  function onMonsterDefeated(roomIdx) {
    const room = D.rooms[roomIdx];
    room.monster.lastKilled = Date.now();

    if (room.monster.stolenItems?.length) {
      const c = getChar();
      if (c) { if (!c.inventory) c.inventory = []; c.inventory.push(...room.monster.stolenItems); }
      log(`🎒 Recovered: ${room.monster.stolenItems.map(i=>i.name).join(', ')}`, 'log-success');
      room.monster.stolenItems = [];
    }

    applyLoot(rollMinorLoot());
    log(`✅ ${room.monster.name} defeated!`, 'log-success');
    D.combat = null;
    saveLocal();
    syncSaveProgress();
    renderDungeonView();
  }

  function onPlayerDeath() {
    log(`💀 You have been slain! Progress saved.`, 'log-danger');
    const c = getChar(); if (c) c.hp = c.hp_current = 0;
    D.savedProgress['tower'] = {
      floor: D.floor, pos: D.playerPos,
      rooms: D.rooms, explored: [...D.exploredRooms], combat: null,
    };
    D.combat = null;
    D.activeDungeon = null;
    saveLocal();
    syncSaveProgress();
    setTimeout(() => renderDungeonList(), 1500);
  }

  async function fightBoss(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room?.isBoss) return;
    if (!(await spendTokens(TOKENS_PER_RUN))) {
      log(`🗝️ Need ${TOKENS_PER_RUN} tokens. Have ${D.tokens}.`, 'log-danger');
      return;
    }
    const boss = getDungeonDef().boss;
    D.combat = {
      roomIdx,
      monster: { ...boss, currentHp: boss.hp, maxHp: boss.hp, stolenItems: [], isBoss: true },
      roundLog: [],
    };
    renderCombatPanel();
  }

  function onBossDefeated() {
    const boss = getDungeonDef().boss;
    const loot = rollBossLoot(boss);

    log(`🏆 FLOOR ${D.floor} CLEARED! ${boss.name} vanquished!`, 'log-boss');
    log(`💰 ${loot.gold} gold · 💎 ${loot.gems} gems · 📜 ${loot.premiumItem.days}d Premium`, 'log-success');

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
      newFloor: D.floor, highestFloor: D.highestFloor, tokens: D.tokens, loot,
    }).catch(() => {});

    delete D.savedProgress['tower'];
    D.rooms = generateFloor(D.floor);
    D.playerPos = D.rooms.findIndex(r => r.isStart) || 0;
    D.exploredRooms = new Set([D.playerPos]);
    D.combat = null;
    saveLocal();
    syncSaveProgress();
    showBossVictoryModal(boss, loot);
  }

  // ── ─── RENDER ────────────────────────────────────────────
  function renderDungeonTab() {
    const container = document.getElementById('tab-dungeon');
    if (!container) return;

    loadLocal();

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
              <span>🗝️ Boss Tokens:</span>
              <span id="dungeon-token-count" class="dungeon-token-num">${D.tokens}</span>
            </div>
            <div class="dungeon-token-pill gold-pill">
              <span>💰 Dungeon Gold:</span>
              <span id="dungeon-gold-count" class="dungeon-token-num">0</span>
            </div>
          </div>
          <div class="dungeon-token-hint">20 MP = 1 Token · ${TOKENS_PER_RUN} Tokens per boss</div>
        </div>
        <div id="dungeon-main-area"></div>
        <div id="dungeon-log-panel" class="dungeon-log-panel">
          <div class="dungeon-log-title">📜 Adventure Log</div>
          <div id="dungeon-log-entries" class="dungeon-log-entries"></div>
        </div>
      </div>
    `;

    if (getChar()) syncLoad().then(() => {
      if (D.activeDungeon) {
        if (D.combat) renderCombatPanel();
        else renderDungeonView();
      } else {
        renderDungeonList();
      }
      renderLog();
    });
    else renderDungeonList();
  }

  // ── Dungeon List (tower selection) ─────────────────────────
  function renderDungeonList() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    D.activeDungeon = null;

    const hasSave  = !!D.savedProgress['tower'];
    const curFloor = hasSave ? D.savedProgress['tower'].floor : D.floor;
    const highFloor = D.highestFloor || 1;
    const nextBoss  = getBossForFloor(curFloor);
    const t         = getFloorTheme(curFloor);

    const previewCards = [0,1,2,3,4].map(offset => {
      const fl = curFloor + offset;
      const b  = getBossForFloor(fl);
      const ft = getFloorTheme(fl);
      return `<div class="dungeon-floor-preview-card" style="border-color:${ft.theme}55">
        <div style="font-size:.6rem;color:var(--dg-text-dim)">Floor ${fl}</div>
        <div style="font-size:1.3rem">${b.icon}</div>
        <div style="font-size:.6rem;color:#e2e8f0;text-align:center;line-height:1.3">${b.name.split(' ').slice(0,2).join(' ')}</div>
        <div style="font-size:.58rem;color:var(--dg-text-dim)">❤️${b.hp}</div>
      </div>`;
    }).join('');

    area.innerHTML = `
      <div class="dungeon-tower-entry" style="--dtheme:${t.theme};--dglow:${t.themeGlow}">
        <div class="dungeon-tower-top">
          <div class="dungeon-tower-icon">🗼</div>
          <div class="dungeon-tower-info">
            <div class="dungeon-card-name">The Endless Tower</div>
            <div class="dungeon-card-desc">An infinite tower of darkness. Clear each floor to ascend. Bosses grow stronger with every tier.</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:.75rem;color:var(--dg-text-dim)">
              <span>🏆 Best: <strong style="color:var(--dg-text)">Floor ${highFloor}</strong></span>
              <span>🗝️ <strong style="color:var(--dg-token)">${D.tokens}</strong> tokens · ${TOKENS_PER_RUN} per boss</span>
              ${hasSave ? `<span class="dungeon-save-badge">📌 Saved — Floor ${curFloor}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="dungeon-tower-next">
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            <div style="font-size:2.4rem;filter:drop-shadow(0 0 8px rgba(214,59,59,.6))">${nextBoss.icon}</div>
            <div>
              <div style="font-family:'Cinzel',serif;color:#e8d0d0;font-size:.95rem">${nextBoss.name}</div>
              <div style="font-size:.72rem;color:var(--dg-text-dim);margin-top:2px">❤️ ${nextBoss.hp} · ⚔️ ${nextBoss.atk} · 🛡️ ${nextBoss.def}</div>
              <div style="font-size:.68rem;color:var(--dg-gold);margin-top:4px">
                💰${nextBoss.loot.gold[0]}–${nextBoss.loot.gold[1]} · 💎${nextBoss.loot.gems[0]}–${nextBoss.loot.gems[1]} · 📜${nextBoss.loot.premiumDays[0]}–${nextBoss.loot.premiumDays[1]}d
              </div>
            </div>
          </div>
        </div>

        <button class="dungeon-btn dungeon-btn-enter" style="width:100%;padding:12px;font-size:.95rem;margin-top:18px"
                onclick="dungeonEnter()">
          ${hasSave ? `🔮 Resume — Floor ${curFloor}` : '⚔️ Begin the Ascent'}
        </button>
      </div>

      <div class="dungeon-floor-history" style="margin-top:8px">
        <div style="font-size:.62rem;color:var(--dg-text-dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">📈 Upcoming floors</div>
        <div class="dungeon-floor-preview-row">${previewCards}</div>
      </div>
    `;
  }

  // ── Active Dungeon View ─────────────────────────────────────
  function renderDungeonView() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;

    if (!D.rooms?.length) {
      area.innerHTML = '<div style="padding:20px;color:var(--dg-text-dim)">Generating dungeon…</div>';
      return;
    }

    if (D.playerPos < 0 || D.playerPos >= D.rooms.length) {
      D.playerPos = D.rooms.findIndex(r => r.isStart) || 0;
    }

    const def  = getDungeonDef();
    const room = D.rooms[D.playerPos];

    // Determine scene visuals
    const sceneEmoji = ROOM_EMOJI[room.type] || '🏚️';
    const imagePath  = room.isBoss    ? '/images/dungeon/boss-chamber.jpg'
                     : room.isStart   ? '/images/dungeon/entrance.jpg'
                     : room.type === 'treasure' ? '/images/dungeon/treasure.jpg'
                     : '/images/dungeon/corridor.jpg';

    const descriptions = {
      start:    'You stand at the dungeon entrance. Ancient runes pulse on the weathered stones. Choose your path wisely.',
      corridor: 'A narrow passage stretches before you. Torches flicker on the walls, casting restless shadows.',
      treasure: 'A glint of gold catches your eye — an ornate chest rests at the center of this chamber.',
      boss:     'The air grows heavy with dark power. Grand pillars rise into darkness. Something terrible awaits.',
    };
    const roomDesc = descriptions[room.type] || descriptions.corridor;

    area.innerHTML = `
      <div class="dungeon-active" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">

        <!-- Header -->
        <div class="dungeon-active-header">
          <div class="dungeon-active-name">${def.icon} ${def.name}</div>
          <div class="dungeon-active-floor">Floor ${D.floor} · ${def.themeName}</div>
          <div style="display:flex;gap:8px">
            <button class="dungeon-btn" style="font-size:.7rem;padding:5px 12px" onclick="openGuild()">🏛️ Guild</button>
            <button class="dungeon-btn dungeon-btn-exit" onclick="dungeonExit()">✕ Exit</button>
          </div>
        </div>

        <!-- Scene image with emoji fallback -->
        <div class="dungeon-scene">
          <img
            class="dungeon-scene-image"
            src="${imagePath}"
            alt="${room.type}"
            onload="this.classList.add('loaded')"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
          />
          <div class="dungeon-scene-fallback" style="display:none">${sceneEmoji}</div>
          <div class="dungeon-scene-gradient"></div>
        </div>

        <!-- Room description -->
        <div class="dungeon-room-description">${roomDesc}</div>

        <!-- Travel progress bar -->
        <div class="dungeon-travel-bar-wrap">
          <div id="dungeon-travel-bar" class="dungeon-travel-bar"></div>
        </div>

        <!-- Map + Room info -->
        <div class="dungeon-game-body">
          <!-- Fog-of-war minimap -->
          <div class="dungeon-minimap-panel">
            <div class="dungeon-minimap-label">Map — Floor ${D.floor}</div>
            ${renderMinimapSVG()}
          </div>

          <!-- Room content panel -->
          <div class="dungeon-room-panel">
            <div class="dungeon-room-header">
              ${getRoomBadge(room)}
              <span class="dungeon-room-id">Room ${D.playerPos + 1} / ${D.rooms.length}</span>
            </div>
            ${renderRoomContent(room)}
          </div>
        </div>

        <!-- Direction buttons — centered at bottom -->
        <div class="dungeon-directions-area">
          <div class="dungeon-directions-label">Choose your path</div>
          <div class="dungeon-directions-row" id="dungeon-dir-btns">
            ${renderDirectionButtonsHTML(room)}
          </div>
        </div>

      </div>
    `;
  }

  // ── SVG Fog-of-War Minimap ─────────────────────────────────
  function renderMinimapSVG() {
    // ── Hand-drawn parchment cartography minimap ──────────────
    // Sepia ink on aged paper. Rooms are rough sketched shapes.
    // Fog of war = dark vellum. Revealed = warm candlelight ink.
    const W = 200, H = 240, PAD = 20;
    const rooms = D.rooms;

    const
  }

  // ── Room UI Fragments ──────────────────────────────────────
  function getRoomBadge(room) {
    if (room.isBoss)   return `<span class="dungeon-room-type-badge badge-boss">⚠️ Boss Chamber</span>`;
    if (room.isStart)  return `<span class="dungeon-room-type-badge badge-start">🚪 Entrance</span>`;
    if (room.type === 'treasure') return `<span class="dungeon-room-type-badge badge-treasure">💰 Treasure Room</span>`;
    return `<span class="dungeon-room-type-badge">🏚️ Corridor</span>`;
  }

  function renderRoomContent(room) {
    const monsterAlive = room.monster &&
      (!room.monster.lastKilled || !elapsed(room.monster.lastKilled, MONSTER_RESPAWN_H));

    if (room.isBoss) {
      const boss = getDungeonDef().boss;
      return `
        <div class="dungeon-boss-card">
          <div class="boss-portrait">${boss.icon}</div>
          <div class="boss-name">${boss.name}</div>
          <div class="boss-stat-row">❤️ ${boss.hp} HP · ⚔️ ${boss.atk} ATK · 🛡️ ${boss.def} DEF</div>
          <div class="boss-drop-row">💰 ${boss.loot.gold[0]}–${boss.loot.gold[1]} · 💎 ${boss.loot.gems[0]}–${boss.loot.gems[1]} · 📜 ${boss.loot.premiumDays[0]}–${boss.loot.premiumDays[1]}d Premium</div>
          <button class="dungeon-btn boss-fight-btn" onclick="dungeonFightBoss(${room.id})">
            ⚔️ Challenge Boss (${TOKENS_PER_RUN} Tokens)
          </button>
        </div>`;
    }

    if (monsterAlive) {
      const m = room.monster;
      const hpPct = Math.round(m.currentHp / m.maxHp * 100);
      return `
        <div class="dungeon-monster-card">
          <div class="monster-portrait">${m.icon}</div>
          <div class="monster-details">
            <div class="monster-name">${m.name}</div>
            <div class="monster-hp-track"><div class="monster-hp-fill" style="width:${hpPct}%"></div></div>
            <div class="monster-stat-row">❤️ ${m.currentHp}/${m.maxHp} · ⚔️ ${m.atk} · 🛡️ ${m.def}${m.steal ? ' · 🎒 Steals' : ''}</div>
          </div>
          <div class="monster-actions">
            <button class="dungeon-btn dungeon-btn-fight" onclick="dungeonFight(${room.id})">⚔️ Fight</button>
            <button class="dungeon-btn dungeon-btn-run"   onclick="dungeonRun(${room.id})">💨 Flee (75%)</button>
          </div>
          ${m.stolenItems?.length ? `<div class="stolen-warning">🎒 Carrying your items: ${m.stolenItems.map(i=>i.name).join(', ')}</div>` : ''}
        </div>`;
    }

    if (room.monster?.lastKilled) {
      const h = (MONSTER_RESPAWN_H - (Date.now() - room.monster.lastKilled) / 3600000).toFixed(1);
      return `<div class="dungeon-room-clear"><div class="clear-icon">💤</div><div class="clear-text">Monster respawns in ${h}h</div></div>`;
    }

    if (room.type === 'treasure') {
      return `<div class="dungeon-treasure-card">
        <div style="font-size:2rem;margin-bottom:8px">${room.looted ? '📭' : '💰'}</div>
        <div style="font-family:'IM Fell English',serif;font-style:italic;color:var(--dg-gold);font-size:.85rem">
          ${room.looted ? 'The chest is empty. You already claimed its contents.' : 'A glittering chest — treasure collected!'}
        </div>
      </div>`;
    }

    if (room.isStart) {
      return `<div class="dungeon-room-clear"><div class="clear-icon">🚪</div><div class="clear-text">The dungeon entrance. Choose your path to explore.</div></div>`;
    }

    return `<div class="dungeon-room-clear"><div class="clear-icon">🏚️</div><div class="clear-text">An empty corridor. All is silent.</div></div>`;
  }

  // ── Direction Buttons ──────────────────────────────────────
  function renderDirectionButtonsHTML(room) {
    if (!room.connections?.length) {
      return `<span style="font-size:.8rem;color:var(--dg-text-dim);font-style:italic">No connected passages.</span>`;
    }

    return room.connections.map(ci => {
      const cr       = D.rooms[ci];
      const explored = D.exploredRooms.has(ci);
      const monsterAlive = cr.monster && (!cr.monster.lastKilled || !elapsed(cr.monster.lastKilled, MONSTER_RESPAWN_H));

      let icon = '🚶', label = `Room ${ci+1}`, cls = '';

      if (!explored) {
        icon = '❓'; label = 'Unknown';
      } else if (cr.isBoss) {
        icon = '⚠️'; label = 'Boss Chamber'; cls = 'dir-boss';
      } else if (cr.type === 'treasure') {
        icon = '💰'; label = `Treasure Room`;
      } else if (monsterAlive) {
        icon = '👹'; label = cr.monster.name.split(' ')[0]; cls = 'dir-monster';
      } else {
        icon = '🏚️'; label = `Room ${ci+1}`;
      }

      return `<button class="dungeon-dir-btn ${cls}" onclick="dungeonTravel(${ci})" ${D.isTraveling ? 'disabled' : ''}>
        ${icon} ${label}
      </button>`;
    }).join('');
  }

  function renderDirectionButtons(disabled) {
    const row = document.getElementById('dungeon-dir-btns');
    if (!row) return;
    row.querySelectorAll('.dungeon-dir-btn').forEach(b => b.disabled = disabled);
  }

  // ── Combat Panel ───────────────────────────────────────────
  function renderCombatPanel() {
    const area = document.getElementById('dungeon-main-area');
    if (!area || !D.combat) return;

    const def    = getDungeonDef();
    const m      = D.combat.monster;
    const pStats = calcPlayerStats();
    const hpPct  = Math.round(m.currentHp / m.maxHp * 100);
    const pHpPct = Math.round((pStats.hp / pStats.maxHp) * 100);

    const logHTML = D.combat.roundLog.slice(-10).reverse()
      .map(e => `<div class="combat-entry actor-${e.actor}">${e.text}</div>`).join('');

    area.innerHTML = `
      <div class="dungeon-combat-panel" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
        <div class="combat-header">
          ${m.isBoss ? `<div class="combat-boss-warning">⚠️ BOSS BATTLE ⚠️</div>` : ''}
          <div class="combat-title">⚔️ ${m.name}</div>
        </div>

        <div class="combat-fighters">
          <div class="combat-fighter">
            <div class="fighter-portrait">🧙</div>
            <div class="fighter-name">You</div>
            <div class="fighter-hp-track">
              <div class="fighter-hp-fill player-hp" style="width:${pHpPct}%"></div>
            </div>
            <div class="fighter-hp-text">${pStats.hp} / ${pStats.maxHp} HP</div>
          </div>

          <div class="combat-vs">VS</div>

          <div class="combat-fighter">
            <div class="fighter-portrait">${m.icon}</div>
            <div class="fighter-name">${m.name}</div>
            <div class="fighter-hp-track">
              <div class="fighter-hp-fill monster-hp" style="width:${hpPct}%"></div>
            </div>
            <div class="fighter-hp-text">${m.currentHp} / ${m.maxHp} HP</div>
          </div>
        </div>

        <div class="combat-log">
          ${logHTML || '<div class="combat-entry" style="color:var(--dg-text-dim);font-style:italic">The battle begins…</div>'}
        </div>

        <div class="combat-actions">
          <button class="dungeon-btn dungeon-btn-fight" onclick="dungeonAttack()">⚔️ Strike</button>
          ${!m.isBoss ? `<button class="dungeon-btn dungeon-btn-run" onclick="dungeonRunCombat()">💨 Flee (75%)</button>` : ''}
        </div>
      </div>
    `;
  }

  // ── Log render ─────────────────────────────────────────────
  function renderLog() {
    const el = document.getElementById('dungeon-log-entries');
    if (!el) return;
    el.innerHTML = D.dungeonLog.slice(0, 20)
      .map(e => `<div class="dungeon-log-entry ${e.cls||''}">${e.msg}</div>`).join('');
  }

  // ── Boss Victory Modal ─────────────────────────────────────
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
        <div class="victory-next">Advancing to Floor ${D.floor}…</div>
        <button class="btn-primary" style="margin-top:16px;width:100%" onclick="closeDungeonVictory()">Continue Delving</button>
      </div>
    `;
  }

  // ── Guild ──────────────────────────────────────────────────
  function renderGuild() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;

    apiFetch('GET', '/game/dungeon/guild').then(data => {
      const reputation  = data.guildReputation ?? 0;
      const dungeonGold = data.dungeonGold ?? 0;

      let currentRank = GUILD_RANKS[0];
      for (let i = GUILD_RANKS.length - 1; i >= 0; i--) {
        if (reputation >= GUILD_RANKS[i].reputationNeeded) { currentRank = GUILD_RANKS[i]; break; }
      }
      const nextRank  = GUILD_RANKS[Math.min(currentRank.rank + 1, GUILD_RANKS.length - 1)];
      const repNeeded = nextRank.rank > currentRank.rank ? nextRank.reputationNeeded - reputation : 0;
      const repPct    = nextRank.rank > currentRank.rank ? (reputation / nextRank.reputationNeeded) * 100 : 100;

      area.innerHTML = `
        <div class="guild-container">
          <div class="guild-header">
            <span class="guild-icon">🏛️</span>
            <div>
              <div class="guild-title">Adventurer's Guild</div>
              <div class="guild-subtitle">Exchange dungeon spoils for real rewards</div>
            </div>
            <button class="dungeon-btn dungeon-btn-exit" style="margin-left:auto" onclick="closeGuild()">← Back</button>
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

          <div style="margin-bottom:18px">
            <div class="rep-bar-label">Progress to ${nextRank.name}</div>
            <div class="rep-bar-track"><div class="rep-bar-fill" style="width:${repPct}%"></div></div>
            <div class="rep-bar-text">${repNeeded > 0 ? repNeeded + ' reputation needed' : 'MAX RANK'}</div>
          </div>

          <div class="guild-section-title">📜 Available Exchanges</div>
          <div class="exchanges-grid">
            ${GUILD_EXCHANGES.map(ex => {
              let canExchange = true, missingReason = '';
              if (ex.cost.dungeonGold && dungeonGold < ex.cost.dungeonGold) {
                canExchange = false; missingReason = `Need ${ex.cost.dungeonGold - dungeonGold} more gold`;
              }
              const matChecks = ['crypt_dust','void_shard','dragon_scale','soul_essence','abyssal_core','titan_heart'];
              for (const mat of matChecks) {
                if (ex.cost[mat]) {
                  const have = (D.dungeonInventory ?? []).find(i => i.id === mat)?.qty || 0;
                  if (have < ex.cost[mat]) { canExchange = false; if (!missingReason) missingReason = `Need more ${mat.replace('_',' ')}`; }
                }
              }
              const bonusGold = ex.reward.gold ? Math.floor(ex.reward.gold * (1 + currentRank.discount / 100)) : 0;
              return `
                <div class="exchange-card ${canExchange ? 'exchange-available' : 'exchange-unavailable'}">
                  <div class="exchange-icon">${ex.icon}</div>
                  <div class="exchange-info">
                    <div class="exchange-name">${ex.name}</div>
                    <div class="exchange-desc">${ex.desc}</div>
                    <div class="exchange-cost">
                      ${ex.cost.dungeonGold ? `<span class="cost-item">💰 ${ex.cost.dungeonGold}</span>` : ''}
                      ${ex.cost.crypt_dust  ? `<span class="cost-item">💀 ${ex.cost.crypt_dust}x Crypt Dust</span>` : ''}
                      ${ex.cost.void_shard  ? `<span class="cost-item">🔮 ${ex.cost.void_shard}x Void Shard</span>` : ''}
                    </div>
                    <div class="exchange-reward">
                      ${ex.reward.gold ? `<span class="reward-gold">💰 ${bonusGold.toLocaleString()}</span>` : ''}
                      ${ex.reward.reputation ? `<span class="reward-rep">⭐ +${ex.reward.reputation}</span>` : ''}
                      ${ex.reward.item ? `<span class="reward-item">📦 ${ex.reward.item}</span>` : ''}
                      ${currentRank.discount > 0 ? `<span class="reward-discount">+${currentRank.discount}% bonus</span>` : ''}
                    </div>
                    <button class="exchange-btn" onclick="exchangeAtGuild('${ex.id}')" ${!canExchange ? 'disabled' : ''}>
                      ${canExchange ? 'Exchange' : missingReason || 'Requirements not met'}
                    </button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      `;
    }).catch(e => { console.error('[Dungeon] Guild load failed', e); });
  }

  // ── Dungeon Exit ───────────────────────────────────────────
  function dungeonExit() {
    if (D.activeDungeon) {
      D.savedProgress['tower'] = {
        floor:    D.floor,
        pos:      D.playerPos,
        rooms:    D.rooms,
        explored: [...D.exploredRooms],
        combat:   D.combat,
      };
    }
    D.activeDungeon = null;
    D.combat        = null;
    saveLocal();
    syncSaveProgress();
    renderDungeonList();
  }

  // ── CSS loader ─────────────────────────────────────────────
  function loadCSS() {
    if (document.getElementById('dungeon-css')) return;
    const link = document.createElement('link');
    link.id = 'dungeon-css'; link.rel = 'stylesheet'; link.href = 'css/dungeon.css';
    document.head.appendChild(link);
  }

  // ── Global API ─────────────────────────────────────────────
  global.dungeonEnter        = enterDungeon;
  global.dungeonTravel       = travelToRoom;
  global.dungeonFight        = initiateFight;
  global.dungeonFightBoss    = fightBoss;
  global.dungeonAttack       = fightRound;
  global.dungeonRunCombat    = () => { if (D.combat) tryRun(D.combat.roomIdx); };
  global.dungeonRun          = (roomIdx) => {
    D.combat = { roomIdx, monster: { ...D.rooms[roomIdx].monster }, roundLog:[] };
    tryRun(roomIdx);
  };
  global.dungeonExit         = dungeonExit;
  global.closeDungeonVictory = () => {
    const m = document.getElementById('dungeon-boss-modal');
    if (m) m.classList.add('hidden');
    renderDungeonView();
  };
  global.openGuild           = () => renderGuild();
  global.closeGuild          = () => renderDungeonView();
  global.exchangeAtGuild     = (id) => {
    apiFetch('POST', '/game/dungeon/guild/exchange', { exchangeId: id }).then(res => {
      if (res?.success) {
        log(res.message || 'Exchange successful!', 'log-success');
        const el = document.getElementById('dungeon-gold-count');
        if (el) el.textContent = res.dungeonGold ?? '?';
        renderGuild();
        refreshCharacter();
      }
    }).catch(e => console.error('[Dungeon] Exchange failed', e));
  };
  global.renderDungeonTab    = renderDungeonTab;

  // ── Init ───────────────────────────────────────────────────
  loadCSS();
  loadLocal();

})(window);
