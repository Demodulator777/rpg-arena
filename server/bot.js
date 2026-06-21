const BASE = 'http://localhost:3009';
const TOKEN_FILE = './.bot_tokens.json';
const MEMORY_FILE = './.bot_memory.json';
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────
const ACCOUNTS = [
  { username: 'bot_warrior', password: 'botpass123', class: 'warrior' },
  { username: 'bot_mage',    password: 'botpass123', class: 'mage' },
  { username: 'bot_rogue',   password: 'botpass123', class: 'rogue' },
  { username: 'bot_paladin', password: 'botpass123', class: 'paladin' },
  { username: 'bot_ranger',  password: 'botpass123', class: 'paladin' },
  { username: 'bot_knight',  password: 'botpass123', class: 'warrior' },
  { username: 'bot_warlock', password: 'botpass123', class: 'mage' },
  { username: 'bot_shadow',  password: 'botpass123', class: 'rogue' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  const url = path.startsWith('/skills') ? `${BASE}${path}` : `${BASE}/api${path}`;
  return fetch(url, opts).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(name, msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}][${name}] ${msg}`);
}

// ── Token persistence ──────────────────────────────────────────────────────
function loadTokens() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, TOKEN_FILE), 'utf8')); }
  catch { return {}; }
}
function saveTokens(tokens) {
  fs.writeFileSync(path.join(__dirname, TOKEN_FILE), JSON.stringify(tokens, null, 2));
}

// ── Bot memory persistence (shared defeat tracking) ──────────────────────
function loadMemory() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, MEMORY_FILE), 'utf8')); }
  catch { return {}; }
}
function saveMemory(mem) {
  fs.writeFileSync(path.join(__dirname, MEMORY_FILE), JSON.stringify(mem, null, 2));
}

// ── Dungeon monster pool ───────────────────────────────────────────────────
const DUNGEON_MONSTERS = [
  { id: 'skeleton', name: 'Skeleton Warrior' },
  { id: 'ghost', name: 'Ghost' },
  { id: 'zombie', name: 'Zombie' },
  { id: 'lich', name: 'Lich' },
  { id: 'fire_imp', name: 'Fire Imp' },
  { id: 'lava_golem', name: 'Lava Golem' },
  { id: 'salamander', name: 'Salamander' },
  { id: 'pyromancer', name: 'Pyromancer' },
  { id: 'void_wraith', name: 'Void Wraith' },
  { id: 'frost_troll', name: 'Frost Troll' },
  { id: 'shadow_assassin', name: 'Shadow Assassin' },
];

// ── Adaptive zone helpers ──────────────────────────────────────────────────
const DEFAULT_ATTACK = ['chest','chest','solar_plexus','chest','head','solar_plexus','chest','stomach','chest','solar_plexus'];
const DEFAULT_BLOCK  = ['cross_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','mid_guard','cross_guard','high_guard'];
const ALL_ATTACK_ZONES = ['head','throat','chest','heart','solar_plexus','stomach','left_arm','right_arm','left_leg','right_leg'];
const ALL_BLOCK_ZONES  = ['high_guard','cross_guard','mid_guard','left_guard','right_guard','full_turtle','weave_left','weave_right','counter_stance','no_block'];

function loadAdaptiveState(name) {
  const mem = loadMemory();
  const s = mem._adaptive?.[name];
  if (!s) return null;
  return {
    cycle: s.cycle || 0,
    battlesInCycle: s.battlesInCycle || 0,
    atkPerRound: s.atkPerRound || {},
    blkPerRound: s.blkPerRound || {},
    atkPerZone: s.atkPerZone || {},
    blkPerZone: s.blkPerZone || {},
    attackZones: s.attackZones || null,
    blockZones: s.blockZones || null,
    seedIds: s.seedIds || [],
  };
}

function saveAdaptiveState(name, state) {
  const mem = loadMemory();
  if (!mem._adaptive) mem._adaptive = {};
  mem._adaptive[name] = {
    cycle: state.cycle,
    battlesInCycle: state.battlesInCycle,
    atkPerRound: state.atkPerRound,
    blkPerRound: state.blkPerRound,
    atkPerZone: state.atkPerZone,
    blkPerZone: state.blkPerZone,
    attackZones: state.attackZones,
    blockZones: state.blockZones,
    seedIds: state.seedIds || [],
  };
  saveMemory(mem);
}

function clearAdaptiveCycle(name) {
  const mem = loadMemory();
  if (mem._adaptive?.[name]) {
    mem._adaptive[name].atkPerRound = {};
    mem._adaptive[name].blkPerRound = {};
    mem._adaptive[name].atkPerZone = {};
    mem._adaptive[name].blkPerZone = {};
    mem._adaptive[name].battlesInCycle = 0;
    mem._adaptive[name].seedIds = [];
    saveMemory(mem);
  }
}

function classifyCombatLine(line) {
  if (!line) return 'unknown';
  if (/\bBLOCKED\b/.test(line) && !/BLOCK PENETRATION/.test(line)) return 'blocked';
  if (/lands a hit|lands a glancing blow|glances off|BACKSTAB|RAGING BLOW|BLOCK PENETRATION/.test(line)) return 'hit';
  if (/uses |unleashes |casts |summons /.test(line)) return 'hit';
  if (/attacks —/.test(line) && /FORCE FIELD/.test(line)) return 'hit';
  if (/DIVINE SHIELD absorbed/.test(line)) return 'skipped';
  if (/swings — MISS|swings — DODGED/.test(line)) return 'skipped';
  return 'unknown';
}
function getDefeats(botName) {
  const mem = loadMemory();
  return mem[botName] || [];
}
function isLootboxDone(botName) {
  const mem = loadMemory();
  return mem._lootboxDone && mem._lootboxDone[botName] === true;
}
function markLootboxDone(botName) {
  const mem = loadMemory();
  if (!mem._lootboxDone) mem._lootboxDone = {};
  mem._lootboxDone[botName] = true;
  saveMemory(mem);
}
function recordDefeat(botName, opponentId, opponentName, botLevel) {
  const mem = loadMemory();
  if (!mem[botName]) mem[botName] = [];
  const existing = mem[botName].find(e => e.opponentId === opponentId);
  if (existing) {
    existing.lostAt = Date.now();
    existing.botLevel = botLevel;
    existing.losses = (existing.losses || 1) + 1;
  } else {
    mem[botName].push({ opponentId, opponentName, lostAt: Date.now(), botLevel, losses: 1 });
  }
  saveMemory(mem);
}

// ── Bot account class ──────────────────────────────────────────────────────
class BotAccount {
  constructor(cfg) {
    this.cfg = cfg;
    this.token = null;
    this.character = null;
    this.name = cfg.username;
    this.cooldowns = { pvp: 0, perTarget: {} };
    this.missionEnd = 0;
    this.tournamentJoined = false;
    this._gearSetup = false;
    this._lootboxSetup = false;
    // Adaptive loadout state
    const as = loadAdaptiveState(this.name);
    if (as && as.attackZones) {
      this._atkZones = [...as.attackZones];
      this._blkZones = [...as.blockZones];
      this._cycle = as.cycle;
      this._battlesInCycle = as.battlesInCycle;
      this._atkPerRound = { ...(as.atkPerRound || {}) };
      this._blkPerRound = { ...(as.blkPerRound || {}) };
      this._atkPerZone = { ...(as.atkPerZone || {}) };
      this._blkPerZone = { ...(as.blkPerZone || {}) };
      this._seedIds = as.seedIds || [];
    } else {
      this._atkZones = [...DEFAULT_ATTACK];
      this._blkZones = [...DEFAULT_BLOCK];
      this._cycle = 0;
      this._battlesInCycle = 0;
      this._atkPerRound = {};
      this._blkPerRound = {};
      this._atkPerZone = {};
      this._blkPerZone = {};
      this._seedIds = [];
    }
  }

  async ensureAuth() {
    const tokens = loadTokens();
    if (tokens[this.cfg.username]) {
      this.token = tokens[this.cfg.username];
      try {
        const char = await api('GET', '/game/character', null, this.token);
        if (char && char.id) {
          this.character = char;
          log(this.name, `Authenticated (level ${char.level} ${char.class})`);
          return;
        }
      } catch { this.token = null; }
    }
    // Register or login
    try {
      const reg = await api('POST', '/auth/register', { username: this.cfg.username, password: this.cfg.password });
      this.token = reg.token;
      log(this.name, 'Registered');
    } catch {
      const login = await api('POST', '/auth/login', { username: this.cfg.username, password: this.cfg.password });
      this.token = login.token;
      log(this.name, 'Logged in');
    }
    tokens[this.cfg.username] = this.token;
    saveTokens(tokens);
    // Check if account already has a character
    try {
      const existing = await api('GET', '/game/character', null, this.token);
      if (existing && existing.id) {
        this.character = existing;
        log(this.name, `Using existing ${existing.class} character (level ${existing.level})`);
        return;
      }
    } catch {}
    // Create character
    const char = await api('POST', '/game/character', { class: this.cfg.class, name: this.cfg.username }, this.token);
    this.character = char;
    log(this.name, `Created ${this.cfg.class} character`);
  }

  async refreshCharacter() {
    try {
      this.character = await api('GET', '/game/character', null, this.token);
    } catch { log(this.name, 'Failed to refresh character'); }
  }

  // ── Mana Potions ────────────────────────────────────────────────────────
  async useManaPotion() {
    const mp = this.character.mission_points || 0;
    if (mp >= 40) return;
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      const manaPot = items.find(i => {
        if (i.item_type !== 'consumable') return false;
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.effect?.type === 'mp' && (Number(d.qty) || 1) > 0;
        } catch { return false; }
      });
      if (!manaPot) {
        log(this.name, `No mana potions (MP: ${mp})`);
        return;
      }
      const result = await api('POST', `/game/use/${manaPot.id}`, null, this.token);
      log(this.name, `Used mana potion (MP restored)`);
      if (result.character) this.character = result.character;
    } catch (e) {
      log(this.name, `Mana potion failed: ${e.message}`);
    }
  }

  // ── Missions ────────────────────────────────────────────────────────────
  getMissionSpot() {
    const spots = { easy: 'city_outskirts', medium: 'city_cathedral', hard: 'city_palace' };
    return spots;
  }

  async ensureTravelTarget(zoneKey) {
    try {
      await this.refreshCharacter();
      const now = Math.floor(Date.now() / 1000);
      const loc = this.character.location;
      if (loc === zoneKey) return true;
      // Check if currently traveling
      if (this.character.travel_target) {
        const status = await api('GET', '/game/travel/status', null, this.token);
        if (status && status.travelEnd && status.travelEnd > now) return false;
      }
      // Try target zone first; if blocked by gatekeeper, step backward through the chain
      const zonePath = ['swamp', 'mountains', 'ruins', 'dark_city'];
      const candidates = [zoneKey, ...zonePath.slice(0, zonePath.indexOf(zoneKey)).reverse()];
      for (const z of candidates) {
        if (z === loc) continue;
        try {
          const result = await api('POST', '/game/travel/start', { targetZone: z }, this.token);
          log(this.name, `Traveling to ${z} (${result.duration || '?'}s)`);
          return false;
        } catch (e2) {
          // Gatekeeper / prereq error — try the previous zone in the chain
          if (e2.message.includes('challenge') || e2.message.includes('unlock')) continue;
          log(this.name, `Travel to ${z} failed: ${e2.message}`);
          return false;
        }
      }
      log(this.name, `No reachable zone toward ${zoneKey}`);
      return false;
    } catch (e) {
      log(this.name, `Travel to ${zoneKey} failed: ${e.message}`);
      return false;
    }
  }

  async doMission() {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.missionEnd) return false;

      const spots = this.getMissionSpot();
      const spotId = spots.hard;
      const zoneKey = 'dark_city';

      // Travel to dark_city if not there
      if (!(await this.ensureTravelTarget(zoneKey))) return false;

      const mpCost = 20;
      const size = 'small';

      const result = await api('POST', '/game/missions/start', { zoneId: zoneKey, spotId, size }, this.token);
      this.missionEnd = now + 600;
      // Update mission_points locally if API doesn't return full character
      if (result.character) this.character = result.character;
      else if (this.character) this.character.mission_points = (this.character.mission_points || 0) - mpCost;
      log(this.name, `Started small hard mission in ${zoneKey} (10m)`);
      // Convert MP to dungeon tokens
      await this.convertMpToTokens(mpCost);
      return true;
    } catch (e) {
      log(this.name, `Mission start failed: ${e.message}`);
      return false;
    }
  }

  async collectMission() {
    try {
      const result = await api('POST', '/game/missions/collect', null, this.token);
      const won = result.won || result.playerWon;
      log(this.name, `Mission collect: ${won ? 'WON' : 'LOST'} | gold:${result.goldEarned || 0} xp:${result.xpEarned || 0}`);
      if (result.character) this.character = result.character;
      return true;
    } catch (e) {
      if (e.message.includes('No active mission') || e.message.includes('Mission rewards already collected')) {
        this.missionEnd = 0;
        return true;
      }
      log(this.name, `Mission collect failed: ${e.message}`);
      return false;
    }
  }

  // ── Health Potion ──────────────────────────────────────────────────────
  async healIfLow() {
    const hp = this.character.hp_current || 0;
    const maxHp = this.character.hp_max || 100;
    if (hp >= maxHp * 0.3) return false;
    log(this.name, `HP ${hp}/${maxHp} — below 30%, using potion`);
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      // Only use full HP potions
      const healPots = items.filter(i => {
        if (i.item_type !== 'consumable') return false;
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.effect?.type === 'heal_full';
        } catch { return false; }
      });
      if (healPots.length > 0) {
        const result = await api('POST', `/game/use/${healPots[0].id}`, null, this.token);
        if (result.character) this.character = result.character;
        log(this.name, `Used health potion (HP restored)`);
        return true;
      }
      // No potions — try to buy full HP potion from shop
      const shop = await api('GET', '/game/shop/items', null, this.token);
      const shopItems = shop.items || [];
      const fullPots = shopItems.filter(i =>
        (i.priceType === 'gems' || i.priceType === 'gold') &&
        i.price <= ((i.priceType === 'gems' ? this.character.gems : this.character.gold) || 0) &&
        i.effect?.type === 'heal_full' && i.level <= (this.character.level || 1)
      );
      fullPots.sort((a, b) => (a.price || 0) - (b.price || 0));
      const bestPot = fullPots.length > 0 ? fullPots[0] : null;
      if (bestPot) {
        const priceLabel = bestPot.priceType === 'gems' ? `${bestPot.price}💎` : `${bestPot.price}g`;
        const buyResult = await api('POST', '/game/shop/buy', { item: { id: bestPot.id, category: 'consumable' } }, this.token);
        if (buyResult.character) this.character = buyResult.character;
        log(this.name, `Bought ${bestPot.name} for ${priceLabel}`);
        // Use it
        await sleep(300);
        const inv2 = await api('GET', '/game/inventory', null, this.token);
        const pot = (inv2.items || []).find(i => {
          if (i.item_type !== 'consumable') return false;
          try {
            const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
            return d.id === bestPot.id;
          } catch { return false; }
        });
        if (pot) {
          const r = await api('POST', `/game/use/${pot.id}`, null, this.token);
          if (r.character) this.character = r.character;
          log(this.name, `Used ${bestPot.name}`);
        }
        return true;
      }
      log(this.name, `No health potions available`);
      return false;
    } catch (e) {
      log(this.name, `Health potion failed: ${e.message}`);
      return false;
    }
  }

  // ── PvP ─────────────────────────────────────────────────────────────────
  async doPvp() {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.cooldowns.pvp) return false;

      // Check + heal if low HP
      const hp = this.character.hp_current || 0;
      const maxHp = this.character.hp_max || 100;
      if (hp <= 0) {
        log(this.name, 'HP too low for PvP');
        return false;
      }
      if (hp < maxHp * 0.3) {
        await this.healIfLow();
        // Re-check after heal attempt
        if ((this.character.hp_current || 0) < maxHp * 0.3) {
          log(this.name, 'Still low HP after heal — skipping PvP');
          return false;
        }
      }

      const target = await api('GET', '/game/matchmaking?direction=similar', null, this.token);
      if (!target || !target.id) {
        log(this.name, 'No PvP targets found');
        return false;
      }

      // Skip if target is another bot (username starts with bot_)
      if (target.username && target.username.startsWith('bot_')) {
        log(this.name, `Skipping ${target.name} (bot)`);
        return false;
      }

      const targetId = target.id;
      const myLevel = this.character.level || 1;
      const tgtLevel = target.level || 1;

      // Don't risk gold on PvP if holding >10k
      if ((this.character.gold || 0) > 10000) {
        log(this.name, `Skipping PvP — holding ${this.character.gold} gold (limit 10k)`);
        return false;
      }

      // Level gap check
      if (tgtLevel < myLevel - 10) {
        log(this.name, `Skipping ${target.name} (level ${tgtLevel}) — too far below (I'm ${myLevel})`);
        return false;
      }

      // Power check: skip if target is significantly stronger
      const myPower = (this.character.strength || 0) + (this.character.agility || 0) + (this.character.magic || 0) + (this.character.defense || 0) + myLevel * 5;
      const tgtPower = (target.strength || 0) + (target.agility || 0) + (target.magic || 0) + (target.defense || 0) + tgtLevel * 5;
      if (tgtPower > myPower * 1.3) {
        log(this.name, `Skipping ${target.name} (power ${tgtPower}) — too strong (I'm ${myPower})`);
        return false;
      }

      // Per-target cooldown (once per 24h)
      if (this.cooldowns.perTarget[targetId] && now < this.cooldowns.perTarget[targetId]) return false;

      // Defeat memory: skip if we've lost to this player before and aren't much stronger now
      const defeats = getDefeats(this.name);
      const prev = defeats.find(e => e.opponentId === targetId);
      if (prev) {
        if (tgtPower >= myPower * 0.9) {
          log(this.name, `Skipping ${target.name} — lost ${prev.losses}x before and not significantly stronger`);
          return false;
        }
      }

      const result = await api('POST', `/game/attack/${targetId}`, null, this.token);
      this.cooldowns.pvp = now + 600;
      this.cooldowns.perTarget[targetId] = now + 86400;
      const won = result.won || result.isDraw === false;
      log(this.name, `PvP vs ${target.name || targetId}: ${result.won ? 'WON' : result.isDraw ? 'DRAW' : 'LOST'} | gold:${result.goldGained || 0}`);
      if (!won && !result.isDraw) {
        recordDefeat(this.name, targetId, target.name || 'unknown', myLevel);
      }
      if (result.character) this.character = result.character;
      // Track zone performance from battle log
      if (result.log) this._trackPvpOutcome(result.log, target.name || targetId);
      return true;
    } catch (e) {
      if (e.message.includes('cooldown') || e.message.includes('Cooldown')) {
        this.cooldowns.pvp = Math.floor(Date.now() / 1000) + 600;
      }
      log(this.name, `PvP failed: ${e.message}`);
      return false;
    }
  }

  // ── Tournaments ──────────────────────────────────────────────────────────
  async joinTournament() {
    try {
      await api('POST', '/tournaments/join', null, this.token);
      this.tournamentJoined = true;
      log(this.name, 'Joined tournament');
      return true;
    } catch (e) {
      log(this.name, `Tournament join failed: ${e.message}`);
      return false;
    }
  }

  // ── Premium ──────────────────────────────────────────────────────────────
  async activatePremium() {
    if (this.character.premiumActive) return;
    const gems = this.character.gems || 0;
    const priority = ['fortune_hunter', 'warlord', 'iron_fortress', 'apprentice', 'vault_keeper', 'arcane_reservoir'];
    for (const id of priority) {
      try {
        const features = await api('GET', '/game/premium/features', null, this.token);
        const feat = features.features?.find(f => f.id === id);
        if (!feat || feat.active || gems < feat.cost) continue;
        await api('POST', '/game/premium/activate', { featureId: id }, this.token);
        log(this.name, `Activated premium: ${id}`);
        await sleep(500);
      } catch {}
    }
  }

  // ── Gear Shopping ────────────────────────────────────────────────────────
  async shopGear() {
    try {
      const shop = await api('GET', '/game/shop/items', null, this.token);
      const gear = (shop.items || []).filter(i =>
        i.priceType === 'gold' && i.price <= this.character.gold &&
        ['weapon', 'helm', 'armor', 'gloves', 'boots', 'ring', 'amulet', 'belt'].includes(i.slot) &&
        i.level <= this.character.level
      );
      for (const item of gear) {
        try {
          await api('POST', '/game/shop/buy', { item: { id: item.id, category: item.slot } }, this.token);
          log(this.name, `Bought ${item.name} (${item.slot})`);
          await sleep(300);
        } catch (e) {
          log(this.name, `Buy ${item.name} failed: ${e.message}`);
        }
      }
    } catch (e) {
      log(this.name, `shopGear error: ${e.message}`);
    }
  }

  // ── Equip Best Gear ──────────────────────────────────────────────────────
  async equipBest() {
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      const slotGroups = [
        { name: 'weapon',    slots: ['weapon'] },
        { name: 'armor',     slots: ['armor'] },
        { name: 'helmet',    slots: ['helmet'] },
        { name: 'shield',    slots: ['shield'] },
        { name: 'boots',     slots: ['boots'] },
        { name: 'jewelry',   slots: ['ring', 'amulet'] },
        { name: 'accessory', slots: ['accessory'] },
      ];
      for (const group of slotGroups) {
        let equippedId = null, equippedScore = -1;
        let best = null, bestScore = -1;
        for (const item of items) {
          try {
            const d = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (!group.slots.includes(d.slot)) continue;
            const lvl = d.upgradeLevel || item.upgrade_level || 0;
            const sum = (d.stats ? Object.values(d.stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0) +
                        (d.wp_stats ? Object.values(d.wp_stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0);
            const score = lvl * 10000 + sum;
            if (item.equipped) { equippedId = item.id; equippedScore = score; }
            if (score > bestScore) {
              best = item; bestScore = score;
            }
          } catch {}
        }
        // Only equip if best has strictly higher score than currently equipped
        if (!best || bestScore <= equippedScore) continue;
        // Jewelry: always re-equip best (ring/amulet share one slot with separate DB columns)
        if (group.name === 'jewelry' || !best.equipped) {
          try {
            await api('POST', `/game/equip/${best.id}`, null, this.token);
            log(this.name, `Equipped ${group.name} (score ${bestScore})`);
            await sleep(200);
          } catch (e) {
            log(this.name, `Equip ${group.name} failed: ${e.message}`);
          }
        }
      }
    } catch (e) {
      log(this.name, `equipBest error: ${e.message}`);
    }
  }

  // ── Gear Upgrades ────────────────────────────────────────────────────────
  async upgradeGear() {
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      const gold = this.character.gold || 0;
      if (gold < 5000) return;
      // Find equipped items that can be upgraded
      for (const item of items) {
        if (!item.equipped) continue;
        try {
          const d = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
          const upLvl = d.upgradeLevel || 0;
          const maxLvl = d.quality === 'legendary' ? 5 : d.quality === 'rare' ? 4 : 3;
          if (upLvl >= maxLvl) continue;
          // Try iron_ingot first (cheapest component)
          await api('POST', `/game/equipment/upgrade/${item.id}`, { componentId: 'iron_ingot', expectedUpgradeLevel: upLvl }, this.token);
          log(this.name, `Upgraded ${d.name} to +${upLvl + 1}`);
          await sleep(500);
        } catch (e) {
          if (e.message.includes('component') || e.message.includes('material')) continue;
        }
      }
    } catch {}
  }

  // ── Upgrades ─────────────────────────────────────────────────────────────
  async upgradeStats() {
    const classFocus = {
      warrior: ['strength', 'vitality', 'defense'],
      mage: ['magic', 'vitality', 'agility'],
      rogue: ['agility', 'strength', 'crit_chance'],
      paladin: ['strength', 'defense', 'magic'],
    };
    const focus = classFocus[this.cfg.class] || ['strength', 'vitality'];
    let gold = this.character.gold || 0;
    if (gold < 50) return;

    for (let round = 0; round < 5; round++) {
      for (const stat of focus) {
        if (gold < 50) return;
        try {
          const result = await api('POST', '/game/upgrade', { stat }, this.token);
          log(this.name, `Upgraded ${stat}`);
          if (result.character) {
            gold = result.character.gold ?? (this.character.gold || 0);
            this.character = result.character;
          }
          await sleep(300);
        } catch { return; }
      }
    }
  }

  // ── Elemental Companion ──────────────────────────────────────────────────
  async feedElemental() {
    try {
      const elemData = await api('GET', '/game/elemental', null, this.token);
      if (!elemData || !elemData.elemental) return;
      // Scan inventory for feedable materials
      const inv = await api('GET', '/game/inventory', null, this.token);
      const feedable = (inv.items || []).filter(i => {
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          if (d.type !== 'raw_mat' && d.category !== 'material') return false;
          // Must be in ELEM_FEED_VALUES which includes: dgn_* (cinders, droplets, sparks, feathers, etc.)
          return d.id && (d.id.includes('dgn_') || d.id.includes('crystal') || d.id.includes('essence'));
        } catch { return false; }
      });
      if (feedable.length === 0) return;
      // Feed the highest-XP materials first (essences > cores > embers > cinders)
      feedable.sort((a, b) => {
        const da = typeof a.item_data === 'string' ? JSON.parse(a.item_data) : a.item_data;
        const db = typeof b.item_data === 'string' ? JSON.parse(b.item_data) : b.item_data;
        const va = da.value || da.xp || 0;
        const vb = db.value || db.xp || 0;
        return vb - va;
      });
      // Feed top 5 items each tick to spread load
      const batch = feedable.slice(0, 5);
      for (const item of batch) {
        await api('POST', '/game/elemental/feed', { inventory_id: item.id, qty: (item.quantity || 1) }, this.token);
        await sleep(200);
      }
      log(this.name, `Fed ${batch.length} materials to elemental`);
    } catch (e) {
      // Elemental not discovered yet — that's fine
      if (e.message.includes('No elemental')) return;
      log(this.name, `Feed elemental failed: ${e.message}`);
    }
  }

  // ── Adaptive Zone Tracking ───────────────────────────────────────────────
  _trackPvpOutcome(logLines, opponentName, silent = false) {
    const myName = this.character?.name || this.name;
    // Gather combat lines in order — first is bot's attack, second is enemy's attack, per round
    const combatLines = logLines.filter(l => /^Round \d+:/.test(l));
    for (let i = 0; i + 1 < combatLines.length; i += 2) {
      const myLine = combatLines[i];
      const enemyLine = combatLines[i + 1];
      const myRound = (i / 2);
      const myAtk = this._atkZones[myRound % 10];
      const myBlk = this._blkZones[myRound % 10];
      const roundKey = String(myRound % 10);
      // Bot's attack outcome
      const myOutcome = classifyCombatLine(myLine);
      if (myOutcome === 'hit' || myOutcome === 'blocked') {
        // Per-round tracking
        if (!this._atkPerRound[roundKey]) this._atkPerRound[roundKey] = { zone: myAtk, hits: 0, blocks: 0 };
        if (myOutcome === 'hit') this._atkPerRound[roundKey].hits++;
        else this._atkPerRound[roundKey].blocks++;
        // Per-zone aggregate
        if (!this._atkPerZone[myAtk]) this._atkPerZone[myAtk] = { hits: 0, blocks: 0 };
        if (myOutcome === 'hit') this._atkPerZone[myAtk].hits++;
        else this._atkPerZone[myAtk].blocks++;
      }
      // Enemy's attack outcome (bot's defense)
      const enemyOutcome = classifyCombatLine(enemyLine);
      if (enemyOutcome === 'hit' || enemyOutcome === 'blocked') {
        // Per-round tracking
        if (!this._blkPerRound[roundKey]) this._blkPerRound[roundKey] = { zone: myBlk, blocks: 0, hits: 0 };
        if (enemyOutcome === 'blocked') this._blkPerRound[roundKey].blocks++;
        else this._blkPerRound[roundKey].hits++;
        // Per-zone aggregate
        if (!this._blkPerZone[myBlk]) this._blkPerZone[myBlk] = { blocks: 0, hits: 0 };
        if (enemyOutcome === 'blocked') this._blkPerZone[myBlk].blocks++;
        else this._blkPerZone[myBlk].hits++;
      }
    }
    this._battlesInCycle++;
    if (!silent) log(this.name, `Adaptive cycle ${this._cycle}: battle ${this._battlesInCycle}/10 tracked (${opponentName})`);
    this._persistAdaptive();
    // Check if it's time to adapt
    if (this._battlesInCycle >= 10) {
      this._analyzeAndAdapt();
    }
  }

  async seedAdaptiveFromHistory() {
    // Fetch last 10 PvP battles and add their zone data to current stats.
    // Only seeds battles the bot initiated (attacker), and only battles not already tracked.
    const maxSeed = Math.max(0, 10 - this._battlesInCycle);
    if (maxSeed === 0) return;
    try {
      const battles = await api('GET', '/game/battles', null, this.token);
      if (!Array.isArray(battles) || battles.length === 0) return;
      const myName = this.character?.name;
      if (!myName) return;
      const myBattles = battles.filter(b => b.attacker_name === myName);
      if (myBattles.length === 0) return;
      // Deduplicate using battle IDs already tracked
      const seenIds = new Set(this._seedIds || []);
      const fresh = myBattles.filter(b => !seenIds.has(b.id));
      if (fresh.length === 0) return;
      if (fresh.length > maxSeed) fresh.length = maxSeed;
      log(this.name, `Seeding ${fresh.length} battle(s) from history (${this._battlesInCycle}/10 → ${this._battlesInCycle + fresh.length}/10)...`);
      if (!this._seedIds) this._seedIds = [];
      // Process oldest first
      for (const battle of fresh.reverse()) {
        if (Array.isArray(battle.log)) {
          this._trackPvpOutcome(battle.log, battle.defender_name || 'history', true);
        }
        this._seedIds.push(battle.id);
      }
      this._persistAdaptive();
      log(this.name, `Seeded ${fresh.length} battles — ${Object.keys(this._atkPerZone).length} atk zones, ${Object.keys(this._blkPerZone).length} blk zones`);
      if (this._battlesInCycle >= 10) {
        this._analyzeAndAdapt();
      }
    } catch (e) {
      log(this.name, `Seed adaptive from history failed: ${e.message}`);
    }
  }

  _analyzeAndAdapt() {
    log(this.name, `Analyzing zone performance (cycle ${this._cycle}, ${this._battlesInCycle} battles)...`);

    // ── Per-position attack analysis ──
    // For each round position, decide whether to keep or replace
    const atkThreshold = 0.30; // replace if blocked >= 30%
    const atkPositions = [];
    for (let r = 0; r < 10; r++) {
      const s = this._atkPerRound[String(r)];
      if (s) {
        const total = s.hits + s.blocks;
        const blockRate = total > 0 ? s.blocks / total : 0;
        atkPositions.push({ round: r, zone: s.zone, blockRate, hits: s.hits, blocks: s.blocks });
      } else {
        atkPositions.push({ round: r, zone: this._atkZones[r], blockRate: 0, hits: 0, blocks: 0 });
      }
    }

    // Per-zone aggregate (for picking replacements)
    const atkZoneScores = Object.entries(this._atkPerZone).map(([zone, st]) => {
      const total = st.hits + st.blocks;
      return { zone, blockRate: total > 0 ? st.blocks / total : 0, hits: st.hits, blocks: st.blocks };
    });
    atkZoneScores.sort((a, b) => a.blockRate - b.blockRate);
    const bestAtkZones = atkZoneScores.filter(z => z.blockRate < atkThreshold);
    const fallbackAtk = bestAtkZones.length > 0 ? bestAtkZones : atkZoneScores.slice(0, Math.max(1, Math.ceil(atkZoneScores.length / 2)));

    const newAtk = [];
    for (const pos of atkPositions) {
      const total = pos.hits + pos.blocks;
      if (total > 0 && pos.blockRate >= atkThreshold) {
        // This position needs a new zone — pick from best-performing zones
        const pick = fallbackAtk[Math.floor(Math.random() * fallbackAtk.length)];
        newAtk.push(pick.zone);
      } else {
        // Keep the current zone
        newAtk.push(pos.zone);
      }
    }

    // ── Per-position block analysis ──
    const blkThreshold = 0.30; // replace if hit-through >= 30%
    const blkPositions = [];
    for (let r = 0; r < 10; r++) {
      const s = this._blkPerRound[String(r)];
      if (s) {
        const total = s.blocks + s.hits;
        const hitRate = total > 0 ? s.hits / total : 0;
        blkPositions.push({ round: r, zone: s.zone, hitRate, blocks: s.blocks, hits: s.hits });
      } else {
        blkPositions.push({ round: r, zone: this._blkZones[r], hitRate: 0, blocks: 0, hits: 0 });
      }
    }

    const blkZoneScores = Object.entries(this._blkPerZone).map(([zone, st]) => {
      const total = st.blocks + st.hits;
      return { zone, hitRate: total > 0 ? st.hits / total : 0, blocks: st.blocks, hits: st.hits };
    });
    blkZoneScores.sort((a, b) => a.hitRate - b.hitRate);
    const bestBlkZones = blkZoneScores.filter(z => z.hitRate < blkThreshold);
    const fallbackBlk = bestBlkZones.length > 0 ? bestBlkZones : blkZoneScores.slice(0, Math.max(1, Math.ceil(blkZoneScores.length / 2)));

    const newBlk = [];
    for (const pos of blkPositions) {
      const total = pos.blocks + pos.hits;
      if (total > 0 && pos.hitRate >= blkThreshold) {
        const pick = fallbackBlk[Math.floor(Math.random() * fallbackBlk.length)];
        newBlk.push(pick.zone);
      } else {
        newBlk.push(pos.zone);
      }
    }

    // Log per-position detail
    for (const pos of atkPositions) {
      if (pos.hits + pos.blocks > 0) {
        const pct = (pos.blockRate * 100).toFixed(0);
        const flag = pos.blockRate >= atkThreshold ? ' ⚠️ CHANGE' : ' ✓';
        log(this.name, `  Atk round ${pos.round+1} [${pos.zone}]: ${pos.hits} hits / ${pos.blocks} blocked (${pct}%)${flag}`);
      }
    }
    for (const pos of blkPositions) {
      if (pos.blocks + pos.hits > 0) {
        const pct = (pos.hitRate * 100).toFixed(0);
        const flag = pos.hitRate >= blkThreshold ? ' ⚠️ CHANGE' : ' ✓';
        log(this.name, `  Blk round ${pos.round+1} [${pos.zone}]: ${pos.blocks} blocks / ${pos.hits} hit through (${pct}%)${flag}`);
      }
    }

    const changedAtk = atkPositions.filter((p) => p.hits + p.blocks > 0 && p.blockRate >= atkThreshold).length;
    const changedBlk = blkPositions.filter((p) => p.blocks + p.hits > 0 && p.hitRate >= blkThreshold).length;
    log(this.name, `Changed ${changedAtk} attack positions, ${changedBlk} block positions`);

    this._atkZones = newAtk;
    this._blkZones = newBlk;
    this._cycle++;
    this._battlesInCycle = 0;
    this._atkPerRound = {};
    this._blkPerRound = {};
    this._atkPerZone = {};
    this._blkPerZone = {};
    this._seedIds = [];
    log(this.name, `🔄 New loadout cycle ${this._cycle}: atk=[${newAtk.join(',')}] blk=[${newBlk.join(',')}]`);
    this._persistAdaptive();
    // Apply new loadout on the server
    this.setLoadout().catch(() => {});
  }

  _persistAdaptive() {
    saveAdaptiveState(this.name, {
      cycle: this._cycle,
      battlesInCycle: this._battlesInCycle,
      atkPerRound: this._atkPerRound,
      blkPerRound: this._blkPerRound,
      atkPerZone: this._atkPerZone,
      blkPerZone: this._blkPerZone,
      attackZones: this._atkZones,
      blockZones: this._blkZones,
      seedIds: this._seedIds,
    });
  }

  // ── Loadout ──────────────────────────────────────────────────────────────
  async setLoadout() {
    try {
      await api('POST', '/game/loadout', { attackZones: this._atkZones, blockZones: this._blkZones }, this.token);
    } catch {}
  }

  // ── One-time gear setup at startup ──────────────────────────────────────
  async setupGear() {
    try {
      await this.refreshCharacter();
      await this.buyAndOpenLootboxes();
      await this.equipBest();
      const gold = this.character.gold || 0;
      if (gold >= 5000) {
        await this.shopGear();
        await this.equipBest();
        await this.upgradeGear();
      } else {
        log(this.name, `Skipping shop/upgrades — only ${gold} gold`);
      }
      this._gearSetup = true;
      log(this.name, `Gear setup complete`);
      await this.seedAdaptiveFromHistory();
    } catch (e) {
      log(this.name, `Gear setup failed: ${e.message}`);
    }
  }

  // ── One-time lootbox opening at startup ─────────────────────────────────
  async hasEmptySlots() {
    try {
      const inv = await api('GET', '/game/inventory', null, this.token);
      const equipped = (inv.items || []).filter(i => i.equipped);
      const filled = new Set();
      for (const item of equipped) {
        try {
          const d = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
          if (d.slot) filled.add(d.slot);
        } catch {}
      }
      const required = ['weapon', 'armor', 'helmet', 'boots'];
      return required.some(s => !filled.has(s));
    } catch { return false; }
  }

  async openAllLootboxes() {
    try {
      const inv = await api('GET', '/game/inventory', null, this.token);
      const lootboxes = (inv.items || []).filter(i => {
        if (i.item_type !== 'consumable') return false;
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.category === 'lootbox';
        } catch { return false; }
      });
      for (const box of lootboxes) {
        const total = box.quantity || 1;
        log(this.name, `Opening ${total}x ${box.name || box.id}...`);
        for (let i = 0; i < total; i++) {
          await api('POST', `/game/lootbox/open/${box.id}`, null, this.token);
          await sleep(200);
        }
      }
      return lootboxes.length > 0;
    } catch { return false; }
  }

  async buyAndOpenLootboxes() {
    if (this._lootboxSetup) return;
    if (isLootboxDone(this.name)) { this._lootboxSetup = true; return; }
    try {
      // Always open any existing lootboxes first
      await this.openAllLootboxes();
      await this.equipBest();

      // Then buy more if slots are empty
      if (!(await this.hasEmptySlots())) {
        log(this.name, `All gear slots filled — skipping lootbox buying`);
        this._lootboxSetup = true;
        markLootboxDone(this.name);
        return;
      }
      let boughtAny = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.refreshCharacter();
        const gems = this.character.gems || 0;
        const canBuy = Math.min(50, Math.floor(gems / 5));
        if (canBuy < 1) {
          if (!boughtAny) log(this.name, `No gems for lootboxes (${gems})`);
          break;
        }
        boughtAny = true;
        log(this.name, `Buying ${canBuy} epic lootboxes (${canBuy * 5}💎) — attempt ${attempt + 1}`);
        for (let i = 0; i < canBuy; i++) {
          await api('POST', '/game/shop/buy', { item: { id: 'lootbox_epic', category: 'lootbox' } }, this.token);
        }
        await sleep(500);
        await this.openAllLootboxes();
        await this.equipBest();
        if (!(await this.hasEmptySlots())) {
          log(this.name, `All gear slots filled`);
          break;
        }
        log(this.name, `Still missing gear — buying more...`);
      }
      this._lootboxSetup = true;
      if (boughtAny) markLootboxDone(this.name);
      log(this.name, `Lootboxes done`);
    } catch (e) {
      log(this.name, `Lootbox setup failed: ${e.message}`);
    }
  }

  // ── Dungeon ───────────────────────────────────────────────────────────────
  async convertMpToTokens(mpAmount) {
    try { await api('POST', '/dungeon/mp-spent', { mpSpent: mpAmount }, this.token); }
    catch { /* non-critical */ }
  }

  async _getDungeonData() {
    try { return await api('GET', '/dungeon/data', null, this.token); }
    catch { return null; }
  }

  async _generateDungeonFloor(floor) {
    const roomCount = 10;
    const rooms = [];
    for (let i = 0; i < roomCount; i++) {
      const isBoss = i === roomCount - 1;
      const isStart = i === 0;
      const m = DUNGEON_MONSTERS[Math.floor(Math.random() * DUNGEON_MONSTERS.length)];
      const y = 23 - Math.floor(i * 23 / roomCount);
      rooms.push({
        id: i, x: 11, y,
        isStart, isBoss,
        isMiniBoss: false, isArea: false,
        connections: isStart ? [i + 1] : (isBoss ? [i - 1] : [i - 1, i + 1]),
        monsters: isBoss ? [] : [
          { id: m.id, name: m.name, icon: '👾', hp: 80, atk: 10, def: 5, steal: false, isMiniBoss: false, tokenCost: 0, currentHp: 80, maxHp: 80, lastKilled: null, stolenItems: [] }
        ],
        looted: false,
        type: isBoss ? 'boss' : isStart ? 'start' : 'corridor',
        visual: { color: '#4a4a4a' }
      });
    }
    const floorRunId = `floor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const progress = { rooms, playerPos: 0, exploredRooms: [0], crawler: null, floorRunId };
    await api('POST', '/dungeon/progress', { floor, highestFloor: floor, progress, activeDungeon: 'tower', combat: null }, this.token);
    return { rooms, floorRunId };
  }

  async _doDungeonCombat(combatId, turnNonce) {
    let nonce = turnNonce;
    while (true) {
      const result = await api('POST', '/dungeon/combat/act', { combatId, action: 'fight', turnNonce: nonce }, this.token);
      nonce = result.turnNonce;
      if (result.ended) return result;
      await sleep(500);
    }
  }

  async doDungeonRun() {
    try {
      const data = await this._getDungeonData();
      if (!data) return false;

      const floor = data.floor || 1;
      const tokens = data.tokens || 0;
      if (tokens < 50) {
        log(this.name, `Not enough tokens for boss (${tokens}/50)`);
        return false;
      }

      // Generate fresh floor layout
      const gen = await this._generateDungeonFloor(floor);
      const bossIndex = gen.rooms.length - 1;

      // Heal before entering
      const hp = this.character.hp_current ?? 0;
      const maxHp = this.character.hp_max || 100;
      if (hp < maxHp * 0.5) await this.healIfLow();

      // Clear rooms in order
      for (let i = 0; i < bossIndex; i++) {
        try {
          const start = await api('POST', '/dungeon/combat/start', { floor, roomIndex: i, kind: 'room', floorRunId: gen.floorRunId }, this.token);
          if (!start.success) continue;
          const result = await this._doDungeonCombat(start.combatId, start.turnNonce);
          if (result.outcome === 'player_dead') { log(this.name, `Died in room ${i}`); return false; }
          log(this.name, `Cleared room ${i + 1}/${bossIndex}`);
        } catch { /* skip if combat fails */ }
        await sleep(300);
      }

      // Boss fight
      try {
        const bossStart = await api('POST', '/dungeon/combat/start', { floor, roomIndex: bossIndex, kind: 'boss', floorRunId: gen.floorRunId }, this.token);
        if (!bossStart.success) { log(this.name, `Boss start failed: ${bossStart.error}`); return false; }
        const result = await this._doDungeonCombat(bossStart.combatId, bossStart.turnNonce);
        if (result.outcome === 'boss_defeated') {
          log(this.name, `Boss defeated on floor ${floor}!`);
          if (result.newFloor) log(this.name, `Advancing to floor ${result.newFloor}`);
        } else if (result.outcome === 'player_dead') { log(this.name, `Died on boss floor ${floor}`); return false; }
        else { log(this.name, `Boss ended: ${result.outcome}`); return false; }
      } catch (e) { log(this.name, `Boss combat error: ${e.message}`); return false; }

      // Claim bounty
      try {
        const bounty = await api('POST', '/dungeon/guild/bounty/claim', {}, this.token);
        if (bounty.success) log(this.name, `Bounty claimed: ${bounty.message || 'ok'}`);
      } catch { /* bounty not available */ }

      return true;
    } catch (e) { log(this.name, `Dungeon run failed: ${e.message}`); return false; }
  }

  // ── Main loop ────────────────────────────────────────────────────────────
  async tick() {
    if (!this.token) await this.ensureAuth();

    // Check tournaments 2h before (19:30) to 2h after (23:30)
    const now = new Date();
    const hour = now.getUTCHours() + 1;
    const min = now.getMinutes();
    if (!this.tournamentJoined) {
      const inWindow = (hour === 19 && min >= 30) || (hour >= 20 && hour <= 22) || (hour === 23 && min <= 30);
      if (inWindow) {
        await this.joinTournament();
      }
    }
    if (hour >= 0 && hour < 6) this.tournamentJoined = false;

    await this.healIfLow();
    await this.collectMission();
    await this.useManaPotion();
    await this.doMission();
    await this.openAllLootboxes();
    await this.equipBest();
    await this.feedElemental();
    await this.setLoadout();
    await this.doPvp();
    await this.activatePremium();
    await this.upgradeStats();
    await this.doDungeonRun();
    await this.refreshCharacter();
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     RPG Arena Bot Runner v1.0        ║');
  console.log('╚══════════════════════════════════════╝');

  const bots = ACCOUNTS.map(cfg => new BotAccount(cfg));

  // Initial auth + gear setup for all bots
  for (const bot of bots) {
    try {
      await bot.ensureAuth();
      await bot.setupGear();
    } catch (e) { log(bot.name, `Init failed: ${e.message}`); }
  }

  // Main loop
  while (true) {
    const startTime = Date.now();
    for (const bot of bots) {
      try { await bot.tick(); } catch (e) { log(bot.name, `Tick error: ${e.message}`); }
      await sleep(1000);
    }
    const elapsed = Date.now() - startTime;
    const wait = Math.max(10000, 30000 - elapsed);
    await sleep(wait);
  }
}

main().catch(console.error);
