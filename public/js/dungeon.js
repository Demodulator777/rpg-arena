// ============================================================
//  dungeon.js  –  Battle Arena Dungeon System (Visual Redesign)
//  Requires: global `state` object,
//  `api(method, path, body)` from app.js, `showTab(tab)` helper
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
  const MONSTER_RESPAWN_DAYS = 7;  // Changed to 7 days
  const MONSTER_RESPAWN_MS = MONSTER_RESPAWN_DAYS * 24 * 3600000;
  const TRAVEL_BASE_MS    = 3000;  // Shorter travel time
  const RUN_ESCAPE_CHANCE = 0.75;
  const STEAL_CHANCE      = 0.18;
  const ROOMS_PER_FLOOR   = 8;     // Fewer rooms for better pacing

  // ── Dungeon Images ─────────────────────────────────────────
  const DUNGEON_IMAGES = {
    entrance: '/images/dungeon/entrance.jpg',
    corridor: '/images/dungeon/corridor.jpg',
    treasure: '/images/dungeon/treasure.jpg',
    boss: '/images/dungeon/boss-chamber.jpg',
    boss_cleared: '/images/dungeon/boss-cleared.jpg',
    stairs: '/images/dungeon/stairs.jpg',
    void: '/images/dungeon/void.jpg',
    crypt: '/images/dungeon/crypt.jpg',
    throne: '/images/dungeon/throne.jpg',
  };

  // ── Room Type Descriptions ─────────────────────────────────
  const ROOM_DESCRIPTIONS = {
    start: [
      "You stand at the entrance of a dark, foreboding tower. Ancient stone arches loom above you, and a cold wind whispers from within.",
      "The entrance is carved with ancient runes that pulse with a faint, ominous light. The air smells of dust and decay.",
      "A massive iron door stands ajar, revealing a shadowy corridor beyond. The stones beneath your feet are worn smooth by countless footsteps."
    ],
    corridor: [
      "A narrow passage stretches before you. Torches flicker on the walls, casting dancing shadows that seem to move on their own.",
      "The corridor widens here, with alcoves carved into the walls. Old tapestries hang torn and faded, depicting forgotten battles.",
      "You walk through a hall lined with ancient statues. Their stone eyes seem to follow your every move."
    ],
    treasure: [
      "A glint of gold catches your eye! This chamber holds scattered treasures from fallen adventurers.",
      "Piles of gold and gems lie scattered about. The remains of previous explorers serve as a grim reminder of the tower's dangers.",
      "An ornate chest sits in the center of the room. Is it a trap, or does it hold the rewards you seek?"
    ],
    boss: [
      "The air grows heavy as you approach the end of the floor. A massive chamber opens before you, and you sense a powerful presence within.",
      "Grand pillars rise to the ceiling, their tops lost in darkness. This is the throne room of the floor's master.",
      "The temperature drops as you enter. Frost clings to the walls, and your breath forms clouds in the cold air. Something ancient awaits."
    ],
    boss_cleared: [
      "The chamber is silent now. The boss has been vanquished, and a shimmering portal appears at the far end, leading deeper into the tower.",
      "Victory! The oppressive presence is gone. A stone staircase descends to the next floor, its steps glowing with soft light.",
      "With the guardian defeated, the way forward is clear. A magical gateway pulses with energy, ready to transport you to greater challenges."
    ]
  };

  // ── Direction Descriptions ─────────────────────────────────
  const DIRECTION_DESCRIPTIONS = {
    forward: { text: "Continue forward into the darkness", icon: "⬆️" },
    left: { text: "Take the left passage", icon: "⬅️" },
    right: { text: "Take the right passage", icon: "➡️" },
    back: { text: "Return the way you came", icon: "⬇️" },
  };

  // ── Dungeon State ──────────────────────────────────────────
  let D = {
    tokens: 0,
    activeDungeon: null,
    floor: 1,
    highestFloor: 1,
    currentRoom: null,      // { id, type, monster, looted, directions, description }
    rooms: [],              // Array of all rooms on current floor
    currentRoomIndex: 0,
    combat: null,
    travelTimer: null,
    isTraveling: false,
    dungeonLog: [],
    savedProgress: {},
    bossDefeated: false,    // Track if boss on current floor is defeated
    floorHistory: [],       // Track visited rooms for back navigation
    dungeonInventory: [],
    blacksmithUnlocked: false,
  };

  // ── Helper Functions ──────────────────────────────────────
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function chance(p) { return Math.random() < p; }
  function elapsed(ts, ms) { return (Date.now() - ts) >= ms; }

  function getChar() {
    if (typeof character !== 'undefined' && character) return character;
    return null;
  }

  function log(msg, cls = '') {
    D.dungeonLog.unshift({ msg, cls, ts: Date.now() });
    if (D.dungeonLog.length > 60) D.dungeonLog.pop();
    renderLog();
  }

  function saveState() {
    try { localStorage.setItem('dungeon_state', JSON.stringify(D)); } catch (e) { }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('dungeon_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        D = { ...D, ...parsed };
      }
    } catch (e) { }
  }

  // ── Dungeon Generation (Simplified) ────────────────────────
  function generateFloor(floor, bossDefeated = false) {
    const rooms = [];
    
    // Start room (entrance)
    rooms.push({
      id: 0,
      type: 'start',
      monster: null,
      looted: true,
      directions: ['forward'],
      description: ROOM_DESCRIPTIONS.start[Math.floor(Math.random() * ROOM_DESCRIPTIONS.start.length)],
      image: DUNGEON_IMAGES.entrance,
    });
    
    // Generate intermediate rooms (random types)
    const roomTypes = [];
    for (let i = 0; i < ROOMS_PER_FLOOR - 2; i++) {
      const r = Math.random();
      if (r < 0.6) roomTypes.push('corridor');
      else if (r < 0.85) roomTypes.push('treasure');
      else roomTypes.push('corridor');
    }
    // Shuffle room types
    for (let i = roomTypes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roomTypes[i], roomTypes[j]] = [roomTypes[j], roomTypes[i]];
    }
    
    // Add intermediate rooms
    for (let i = 0; i < roomTypes.length; i++) {
      const hasMonster = !bossDefeated && roomTypes[i] !== 'treasure' && chance(0.7);
      let monster = null;
      
      if (hasMonster) {
        const floorTheme = getFloorTheme(floor);
        const monsters = getMonstersForFloor(floor);
        const m = monsters[Math.floor(Math.random() * monsters.length)];
        const respawnTime = m.lastKilled ? m.lastKilled + MONSTER_RESPAWN_MS : 0;
        const isRespawned = m.lastKilled && Date.now() >= respawnTime;
        
        if (!m.lastKilled || isRespawned) {
          monster = {
            ...m,
            currentHp: m.hp + floor * 5,
            maxHp: m.hp + floor * 5,
            atk: m.atk + floor * 2,
            def: m.def + floor,
            lastKilled: m.lastKilled,
            stolenItems: [],
          };
        }
      }
      
      rooms.push({
        id: i + 1,
        type: roomTypes[i],
        monster: monster,
        looted: roomTypes[i] !== 'treasure',
        directions: ['forward'],
        description: getRoomDescription(roomTypes[i]),
        image: getRoomImage(roomTypes[i]),
      });
    }
    
    // Boss room
    rooms.push({
      id: rooms.length,
      type: bossDefeated ? 'boss_cleared' : 'boss',
      monster: bossDefeated ? null : getBossForFloor(floor),
      looted: bossDefeated,
      directions: bossDefeated ? ['forward'] : [],
      description: bossDefeated ? ROOM_DESCRIPTIONS.boss_cleared[Math.floor(Math.random() * ROOM_DESCRIPTIONS.boss_cleared.length)] : ROOM_DESCRIPTIONS.boss[Math.floor(Math.random() * ROOM_DESCRIPTIONS.boss.length)],
      image: bossDefeated ? DUNGEON_IMAGES.boss_cleared : DUNGEON_IMAGES.boss,
    });
    
    return rooms;
  }
  
  function getRoomDescription(type) {
    if (type === 'corridor') {
      const descs = [
        "A long stone hallway stretches before you. Flickering torches cast dancing shadows on the walls.",
        "You walk through a narrow passage. Water drips somewhere in the distance, echoing through the silence.",
        "The corridor opens into a wider chamber. Old weapons and shields hang on the walls, relics of fallen warriors.",
        "Ancient runes are carved into the walls here. They glow faintly, pulsing with a rhythm that matches your heartbeat.",
        "The floor is scattered with bones and debris. Something large passed through here recently."
      ];
      return descs[Math.floor(Math.random() * descs.length)];
    } else if (type === 'treasure') {
      const descs = [
        "A small chest sits in the corner of this room. Cobwebs cover the walls, but the chest gleams as if recently polished.",
        "Gold coins are scattered across the floor. An ornate urn stands in the center, possibly containing something valuable.",
        "The remains of a merchant caravan lie here. Supplies are scattered about, but something catches your eye."
      ];
      return descs[Math.floor(Math.random() * descs.length)];
    }
    return "You enter another chamber of the tower.";
  }
  
  function getRoomImage(type) {
    if (type === 'corridor') return DUNGEON_IMAGES.corridor;
    if (type === 'treasure') return DUNGEON_IMAGES.treasure;
    if (type === 'boss') return DUNGEON_IMAGES.boss;
    if (type === 'boss_cleared') return DUNGEON_IMAGES.boss_cleared;
    return DUNGEON_IMAGES.entrance;
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
    const pDmg = Math.max(1, Math.floor(playerStats.atk - monster.def * 0.5 + rand(-3, 3)));
    monster.currentHp -= pDmg;
    log.push({ actor: 'player', text: `You strike for ${pDmg} damage!`, dmg: pDmg });

    if (monster.currentHp > 0) {
      const mDmg = Math.max(1, Math.floor(monster.atk - playerStats.def * 0.5 + rand(-2, 2)));
      log.push({ actor: 'monster', text: `${monster.name} hits you for ${mDmg}!`, dmg: mDmg });
      return { log, playerDmgTaken: mDmg, monsterDead: false };
    }
    return { log, playerDmgTaken: 0, monsterDead: true };
  }

  // ── Loot Functions ─────────────────────────────────────────
  function rollMinorLoot() {
    const floor = D.floor || 1;
    const availableMaterials = DUNGEON_MATERIALS.filter(m => floor >= m.floorMin);
    
    if (availableMaterials.length > 0 && chance(0.35)) {
      const material = availableMaterials[Math.floor(Math.random() * availableMaterials.length)];
      const qty = 1 + Math.floor(Math.random() * Math.min(3, Math.floor(floor / 5) + 1));
      return { type: 'dungeon_material', materialId: material.id, qty };
    }
    
    const total = MINION_LOOT.reduce((s, l) => s + l.weight, 0);
    let r = rand(0, total - 1);
    for (const entry of MINION_LOOT) {
      r -= entry.weight;
      if (r < 0) {
        if (entry.type === 'gold') return { type: 'gold', amount: rand(entry.min, entry.max) };
        if (entry.type === 'item_common') return { type: 'item', item: COMMON_ITEMS[rand(0, COMMON_ITEMS.length - 1)] };
        return { type: entry.type, ...entry };
      }
    }
    return { type: 'gold', amount: rand(5, 20) };
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

  function applyLoot(loot) {
    const c = getChar();
    if (!c) return;
    
    if (loot.type === 'gold') {
      c.gold = (c.gold || 0) + loot.amount;
      log(`💰 Found ${loot.amount} gold`, 'log-loot');
      apiFetch('POST', '/game/dungeon/add-gold', { amount: loot.amount }).catch(e => console.error('Failed to sync gold:', e));
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
      if (updatedChar) {
        if (typeof character !== 'undefined') Object.assign(character, updatedChar);
        if (typeof window.character !== 'undefined') window.character = updatedChar;
        if (typeof renderTopBar === 'function') renderTopBar();
        if (typeof renderCharacter === 'function') renderCharacter();
      }
    } catch (e) { console.error('Failed to refresh character:', e); }
  }

  // ── Core Actions ───────────────────────────────────────────
  function enterDungeon(dungeonId) {
    const def = getDungeonDef(dungeonId);
    if (!def) return;
    
    // Check for saved progress
    if (D.savedProgress['tower']) {
      const s = D.savedProgress[dungeonId];
      D.activeDungeon = 'tower';
      D.floor = s.floor;
      D.rooms = s.rooms;
      D.currentRoomIndex = s.pos;
      D.bossDefeated = s.bossDefeated || false;
      D.currentRoom = D.rooms[D.currentRoomIndex];
      D.floorHistory = s.floorHistory || [];
      
      log(`🔮 Resuming Floor ${D.floor}...`, 'log-enter');
      renderDungeonView();
      return;
    }
    
    // New run
    D.activeDungeon = 'tower';
    D.floor = 1;
    D.bossDefeated = false;
    D.rooms = generateFloor(1, false);
    D.currentRoomIndex = 0;
    D.currentRoom = D.rooms[0];
    D.floorHistory = [0];
    D.dungeonLog = [];
    saveState();
    saveProgressToDB();
    
    log(`⚔️ Entered The Endless Tower – Floor 1`, 'log-enter');
    renderDungeonView();
  }
  
  function travelToDirection(direction) {
    if (D.isTraveling || D.combat) return;
    
    // Determine next room based on direction
    let nextIndex = D.currentRoomIndex + 1;
    
    if (direction === 'back' && D.floorHistory.length > 1) {
      D.floorHistory.pop();
      nextIndex = D.floorHistory[D.floorHistory.length - 1];
    } else if (direction === 'forward') {
      D.floorHistory.push(nextIndex);
    } else {
      // For left/right, just go forward but with different flavor text
      D.floorHistory.push(nextIndex);
    }
    
    if (nextIndex >= D.rooms.length) {
      log("The path ends here. You need to defeat the boss to proceed.", 'log-info');
      return;
    }
    
    const targetRoom = D.rooms[nextIndex];
    
    D.isTraveling = true;
    log(`🚶 Traveling ${direction}...`, 'log-travel');
    
    const travelMs = TRAVEL_BASE_MS + rand(0, 1500);
    const bar = document.getElementById('dungeon-travel-bar');
    if (bar) {
      bar.style.transition = `width ${travelMs}ms linear`;
      bar.style.width = '100%';
    }
    
    D.travelTimer = setTimeout(() => {
      D.currentRoomIndex = nextIndex;
      D.currentRoom = targetRoom;
      D.isTraveling = false;
      saveState();
      saveProgressToDB();
      
      if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }
      
      log(`📍 Arrived at ${targetRoom.type === 'boss' ? 'BOSS CHAMBER' : targetRoom.type === 'treasure' ? 'TREASURE ROOM' : 'a chamber'}`, 'log-arrive');
      
      // Check for treasure
      if (targetRoom.type === 'treasure' && !targetRoom.looted) {
        targetRoom.looted = true;
        const loot = rollMinorLoot();
        applyLoot(loot);
      }
      
      // Check for monster
      if (targetRoom.monster && !targetRoom.monster.lastKilled) {
        initiateFight();
      } else if (targetRoom.monster && targetRoom.monster.lastKilled) {
        const respawnTime = targetRoom.monster.lastKilled + MONSTER_RESPAWN_MS;
        if (Date.now() >= respawnTime) {
          // Monster respawned
          targetRoom.monster.currentHp = targetRoom.monster.maxHp;
          targetRoom.monster.lastKilled = null;
          initiateFight();
        } else {
          const daysLeft = Math.ceil((respawnTime - Date.now()) / (24 * 3600000));
          log(`💤 The ${targetRoom.monster.name} lies slain. It will respawn in ${daysLeft} days.`, 'log-info');
        }
      }
      
      renderDungeonView();
    }, travelMs);
  }
  
  function initiateFight() {
    const room = D.currentRoom;
    if (!room || !room.monster) return;
    
    D.combat = {
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
      apiFetch('POST', '/game/dungeon/update-health', { hp: c.hp_current }).catch(() => { });
    }
    
    if (monsterDead) {
      if (D.currentRoom.type === 'boss') onBossDefeated();
      else onMonsterDefeated();
    } else if (c && (c.hp_current || c.hp || 100) <= 0) {
      onPlayerDeath();
    } else {
      renderCombatPanel();
    }
  }
  
  function onMonsterDefeated() {
    const room = D.currentRoom;
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
    const boss = D.currentRoom.monster;
    const loot = rollBossLoot(boss);
    
    log(`🏆 FLOOR ${D.floor} CLEARED! ${boss.name} vanquished!`, 'log-boss');
    log(`💰 Loot: ${loot.gold} gold | 💎 ${loot.gems} gems | 📜 Premium ${loot.premiumItem.days} days`, 'log-success');
    
    const c = getChar();
    if (c) {
      c.gold = (c.gold || 0) + loot.gold;
      c.gems = (c.gems || 0) + loot.gems;
      if (!c.inventory) c.inventory = [];
      c.inventory.push(loot.premiumItem);
    }
    
    // Mark boss as defeated on this floor
    D.bossDefeated = true;
    D.currentRoom.type = 'boss_cleared';
    D.currentRoom.monster = null;
    D.currentRoom.image = DUNGEON_IMAGES.boss_cleared;
    D.currentRoom.description = ROOM_DESCRIPTIONS.boss_cleared[Math.floor(Math.random() * ROOM_DESCRIPTIONS.boss_cleared.length)];
    D.currentRoom.directions = ['forward'];
    
    // Add stairs/portal to next floor
    const stairsRoom = {
      id: D.rooms.length,
      type: 'stairs',
      monster: null,
      looted: true,
      directions: ['forward'],
      description: "A shimmering portal pulses with energy, ready to transport you to the next floor of the tower.",
      image: DUNGEON_IMAGES.stairs,
    };
    D.rooms.push(stairsRoom);
    
    // Unlock blacksmith after floor 5
    if (D.floor === 5 && !D.blacksmithUnlocked) {
      D.blacksmithUnlocked = true;
      log('🔨 A traveling blacksmith has arrived! Visit him to craft items from dungeon materials.', 'log-success');
    }
    
    saveState();
    saveProgressToDB();
    D.combat = null;
    renderDungeonView();
  }
  
  function goToNextFloor() {
    D.floor++;
    if (D.floor > (D.highestFloor || 1)) D.highestFloor = D.floor;
    D.bossDefeated = false;
    D.rooms = generateFloor(D.floor, false);
    D.currentRoomIndex = 0;
    D.currentRoom = D.rooms[0];
    D.floorHistory = [0];
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
      pos: D.currentRoomIndex,
      rooms: D.rooms,
      floorHistory: D.floorHistory,
      bossDefeated: D.bossDefeated,
    };
    D.combat = null;
    D.activeDungeon = null;
    saveState();
    saveProgressToDB();
    setTimeout(() => renderDungeonList(), 1500);
  }
  
  function tryRun() {
    if (chance(RUN_ESCAPE_CHANCE)) {
      log(`💨 Escaped successfully!`, 'log-success');
      D.combat = null;
      renderDungeonView();
    } else {
      log(`⚠️ Failed to escape! Monster attacks!`, 'log-danger');
      const pStats = calcPlayerStats();
      const mDmg = Math.max(1, Math.floor(D.combat.monster.atk - pStats.def * 0.5 + rand(-2, 2)));
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
  
  async function fightBoss() {
    if (D.currentRoom.type !== 'boss' || !D.currentRoom.monster) return;
    
    const success = await spendTokens(TOKENS_PER_RUN);
    if (!success) {
      log(`🗝️ Need ${TOKENS_PER_RUN} tokens to challenge the boss. You have ${D.tokens}.`, 'log-danger');
      return;
    }
    
    D.combat = {
      monster: { ...D.currentRoom.monster },
      playerHpBefore: getChar()?.hp_current || getChar()?.hp || 100,
      roundLog: [],
    };
    renderCombatPanel();
  }
  
  // ── Database Sync ─────────────────────────────────────────
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
          pos: D.currentRoomIndex,
          rooms: D.rooms,
          floorHistory: D.floorHistory,
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
  
  // ── Render Functions ──────────────────────────────────────
  function renderDungeonTab() {
    const container = document.getElementById('tab-dungeon');
    if (!container) return;
    loadState();
    if (character) loadDungeonDataFromDB();
    
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
    
    const hasSave = !!D.savedProgress['tower'];
    const curFloor = hasSave ? D.savedProgress['tower'].floor : 1;
    const highFloor = D.highestFloor || 1;
    const nextBoss = getBossForFloor(curFloor);
    const nextTheme = getFloorTheme(curFloor);
    
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
          <div style="font-size:0.7rem;color:var(--dungeon-muted);text-transform:uppercase;margin-bottom:10px">Next Boss — Floor ${curFloor}</div>
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            <div style="font-size:2.5rem">${nextBoss.icon}</div>
            <div>
              <div style="font-family:'Cinzel',serif;color:#e2e8f0;font-size:1rem">${nextBoss.name}</div>
              <div style="font-size:0.75rem;color:var(--dungeon-muted)">❤️ ${nextBoss.hp} · ⚔️ ${nextBoss.atk} · 🛡️ ${nextBoss.def}</div>
              <div style="font-size:0.72rem;color:var(--dungeon-gold)">💎 ${nextBoss.loot.gems[0]}–${nextBoss.loot.gems[1]} gems · 📜 Premium Scroll</div>
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
    if (!area || !D.currentRoom) return;
    
    const room = D.currentRoom;
    const def = getDungeonDef(D.activeDungeon);
    const floorTheme = getFloorTheme(D.floor);
    
    // Determine available directions
    let directions = [];
    if (D.currentRoomIndex < D.rooms.length - 1) {
      directions.push('forward');
    }
    if (D.floorHistory.length > 1) {
      directions.push('back');
    }
    
    // Check if at stairs to next floor
    const isStairs = room.type === 'stairs';
    const hasMonster = room.monster && (!room.monster.lastKilled || Date.now() >= room.monster.lastKilled + MONSTER_RESPAWN_MS);
    const isBossRoom = room.type === 'boss';
    const isBossCleared = room.type === 'boss_cleared';
    
    area.innerHTML = `
      <div class="dungeon-view" style="--dtheme:${floorTheme.theme};--dglow:${floorTheme.themeGlow}">
        <div class="dungeon-header">
          <div class="dungeon-floor-info">
            <span class="dungeon-floor-badge">Floor ${D.floor}</span>
            <span class="dungeon-room-type">${isBossRoom ? 'BOSS CHAMBER' : isBossCleared ? 'CLEARED' : room.type === 'treasure' ? 'TREASURE' : 'CHAMBER'}</span>
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
          ${isStairs ? `
            <button class="dungeon-btn dungeon-btn-stairs" onclick="goToNextFloor()">
              ⬆️ Ascend to Floor ${D.floor + 1}
            </button>
          ` : hasMonster ? `
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
              <div class="cleared-text">The boss has been defeated. The way forward is clear.</div>
              ${D.currentRoomIndex + 1 < D.rooms.length ? `
                <button class="dungeon-btn" onclick="travelToDirection('forward')">Continue Forward →</button>
              ` : ''}
            </div>
          ` : room.type === 'treasure' && room.looted ? `
            <div class="treasure-preview">
              <div class="treasure-icon">💰</div>
              <div class="treasure-text">You've already looted this treasure room.</div>
            </div>
          ` : null}
          
          <div class="dungeon-directions">
            ${directions.map(dir => `
              <button class="dungeon-direction-btn" onclick="travelToDirection('${dir}')" ${D.isTraveling ? 'disabled' : ''}>
                ${DIRECTION_DESCRIPTIONS[dir]?.icon || '➡️'} ${DIRECTION_DESCRIPTIONS[dir]?.text || dir}
              </button>
            `).join('')}
          </div>
          
          ${D.blacksmithUnlocked && !isBossRoom && !hasMonster && !isStairs ? `
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
    
    area.innerHTML = `
      <div class="dungeon-blacksmith">
        <div class="blacksmith-header">
          <span class="blacksmith-icon">🔨</span>
          <div>
            <div class="blacksmith-title">Dungeon Blacksmith</div>
            <div class="blacksmith-desc">Trade your dungeon materials for powerful items</div>
          </div>
          <button class="dungeon-btn dungeon-btn-exit" onclick="closeBlacksmith()">← Back to Dungeon</button>
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
      `<div class="dungeon-log-entry ${e.cls || ''}">${e.msg}</div>`
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
  
  function canCraftRecipe(recipe) {
    for (const [materialId, qty] of Object.entries(recipe.materials)) {
      const item = D.dungeonInventory.find(i => i.id === materialId);
      if (!item || item.qty < qty) return false;
    }
    return true;
  }
  
  function craftRecipe(recipeId) {
    const recipe = DUNGEON_RECIPES.find(r => r.id === recipeId);
    if (!recipe) return false;
    if (!canCraftRecipe(recipe)) return false;
    
    for (const [materialId, qty] of Object.entries(recipe.materials)) {
      const index = D.dungeonInventory.findIndex(i => i.id === materialId);
      if (index !== -1) {
        D.dungeonInventory[index].qty -= qty;
        if (D.dungeonInventory[index].qty <= 0) {
          D.dungeonInventory.splice(index, 1);
        }
      }
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
    return true;
  }
  
  function updateTravelBtn(idx, disabled) {
    const btns = document.querySelectorAll('.dungeon-direction-btn');
    btns.forEach(b => b.disabled = disabled);
  }
  
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
  global.dungeonTravel = travelToDirection;
  global.dungeonFight = () => initiateFight();
  global.dungeonRun = () => tryRun();
  global.dungeonAttack = fightRound;
  global.dungeonRunCombat = () => tryRun();
  global.dungeonFightBoss = fightBoss;
  global.goToNextFloor = goToNextFloor;
  global.dungeonExit = () => {
    if (D.activeDungeon) {
      D.savedProgress[D.activeDungeon] = {
        floor: D.floor,
        pos: D.currentRoomIndex,
        rooms: D.rooms,
        floorHistory: D.floorHistory,
        bossDefeated: D.bossDefeated,
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
  global.openBlacksmith = openBlacksmith;
  global.closeBlacksmith = closeBlacksmith;
  global.continueDungeon = continueDungeon;
  global.craftRecipeFromBlacksmith = (recipeId) => {
    if (craftRecipe(recipeId)) {
      renderBlacksmith();
    } else {
      log('Missing materials!', 'log-danger');
    }
  };
  global.renderDungeonTab = function() {
    renderDungeonTab();
    if (character) loadDungeonDataFromDB();
  };
  global.travelToDirection = travelToDirection;
  
  // ── Init ───────────────────────────────────────────────────
  loadCSS();
  loadState();
  
})(window);
