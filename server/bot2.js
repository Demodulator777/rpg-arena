const BASE = 'http://localhost:3009';
const TOKEN_FILE = './.bot2_tokens.json';
const MEMORY_FILE = './.bot2_memory.json';
const fs = require('fs');
const path = require('path');

const ACCOUNTS = [
  { username: 'b2_warrior', password: 'botpass123', class: 'warrior' },
  { username: 'b2_mage',    password: 'botpass123', class: 'mage' },
  { username: 'b2_rogue',   password: 'botpass123', class: 'rogue' },
  { username: 'b2_paladin', password: 'botpass123', class: 'paladin' },
  { username: 'b2_ranger',  password: 'botpass123', class: 'paladin' },
  { username: 'b2_knight',  password: 'botpass123', class: 'warrior' },
  { username: 'b2_warlock', password: 'botpass123', class: 'mage' },
  { username: 'b2_shadow',  password: 'botpass123', class: 'rogue' },
];

// Each class has multiple build strategies to test
const BUILDS = {
  warrior: [
    { name: 'heavy_str', focus: ['strength', 'vitality', 'defense'], gear: ['strength', 'vitality'] },
    { name: 'tank',      focus: ['vitality', 'defense', 'strength'], gear: ['defense', 'vitality'] },
    { name: 'balanced',  focus: ['strength', 'defense', 'agility'],  gear: ['strength', 'defense'] },
  ],
  mage: [
    { name: 'glass_cannon', focus: ['magic', 'agility', 'vitality'],     gear: ['magic', 'crit_chance'] },
    { name: 'battlemage',    focus: ['magic', 'strength', 'defense'],    gear: ['magic', 'defense'] },
    { name: 'swift_mage',    focus: ['agility', 'magic', 'vitality'],    gear: ['magic', 'agility'] },
  ],
  rogue: [
    { name: 'shadow_blade', focus: ['agility', 'strength', 'crit_chance'], gear: ['agility', 'crit_chance'] },
    { name: 'assassin',     focus: ['strength', 'agility', 'crit_chance'], gear: ['strength', 'agility'] },
    { name: 'dancer',       focus: ['agility', 'vitality', 'strength'],    gear: ['agility', 'defense'] },
  ],
  paladin: [
    { name: 'holy_guard',   focus: ['strength', 'defense', 'magic'],    gear: ['strength', 'defense'] },
    { name: 'crusader',     focus: ['strength', 'magic', 'vitality'],   gear: ['strength', 'magic'] },
    { name: 'templar',      focus: ['defense', 'vitality', 'strength'], gear: ['defense', 'vitality'] },
  ],
};

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

function loadTokens() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, TOKEN_FILE), 'utf8')); }
  catch { return {}; }
}
function saveTokens(tokens) {
  fs.writeFileSync(path.join(__dirname, TOKEN_FILE), JSON.stringify(tokens, null, 2));
}

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, MEMORY_FILE), 'utf8')); }
  catch { return {}; }
}
function saveMemory(mem) {
  fs.writeFileSync(path.join(__dirname, MEMORY_FILE), JSON.stringify(mem, null, 2));
}

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

const DEFAULT_ATTACK = ['chest','chest','solar_plexus','chest','head','solar_plexus','chest','stomach','chest','solar_plexus'];
const DEFAULT_BLOCK  = ['cross_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','mid_guard','cross_guard','high_guard'];
const ALL_ATTACK_ZONES = ['head','throat','chest','heart','solar_plexus','stomach','left_arm','right_arm','left_leg','right_leg'];
const ALL_BLOCK_ZONES  = ['high_guard','cross_guard','mid_guard','left_guard','right_guard','full_turtle','weave_left','weave_right','counter_stance','no_block'];

const CONSECUTIVE_LOSS_SWITCH = 5;
const MIN_BATTLES_BEFORE_SWITCH = 15;

class TestBot {
  constructor(cfg) {
    this.cfg = cfg;
    this.token = null;
    this.character = null;
    this.name = cfg.username;
    this.cooldowns = { pvp: 0, perTarget: {} };
    this.missionEnd = 0;
    this.tournamentJoined = false;
    this._lootboxSetup = false;
    this._skipDungeon = false;

    // Build system
    const classBuilds = BUILDS[cfg.class] || BUILDS.warrior;
    const mem = loadMemory();
    const state = mem._builds?.[this.name];
    if (state) {
      this._buildIndex = state.buildIndex || 0;
      this._buildWins = state.wins || 0;
      this._buildLosses = state.losses || 0;
      this._buildBattles = state.battles || 0;
      this._consecutiveLosses = state.consecutiveLosses || 0;
      this._totalBattles = state.totalBattles || 0;
    } else {
      this._buildIndex = 0;
      this._buildWins = 0;
      this._buildLosses = 0;
      this._buildBattles = 0;
      this._consecutiveLosses = 0;
      this._totalBattles = 0;
    }
    this._builds = classBuilds;
    this._currentBuild = this._builds[this._buildIndex] || this._builds[0];

    this._atkZones = [...DEFAULT_ATTACK];
    this._blkZones = [...DEFAULT_BLOCK];
  }

  _persistBuildState() {
    const mem = loadMemory();
    if (!mem._builds) mem._builds = {};
    mem._builds[this.name] = {
      buildIndex: this._buildIndex,
      wins: this._buildWins,
      losses: this._buildLosses,
      battles: this._buildBattles,
      consecutiveLosses: this._consecutiveLosses,
      totalBattles: this._totalBattles,
    };
    saveMemory(mem);
  }

  async ensureAuth() {
    const tokens = loadTokens();
    if (tokens[this.cfg.username]) {
      this.token = tokens[this.cfg.username];
      try {
        const char = await api('GET', '/game/character', null, this.token);
        if (char && char.id) {
          this.character = char;
          log(this.name, `Authenticated (level ${char.level} ${char.class}, build: ${this._currentBuild.name})`);
          return;
        }
      } catch { this.token = null; }
    }
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
    try {
      const existing = await api('GET', '/game/character', null, this.token);
      if (existing && existing.id) {
        this.character = existing;
        log(this.name, `Using existing ${existing.class} character (level ${existing.level})`);
        return;
      }
    } catch {}
    const char = await api('POST', '/game/character', { class: this.cfg.class, name: this.cfg.username }, this.token);
    this.character = char;
    log(this.name, `Created ${this.cfg.class} character`);
  }

  async refreshCharacter() {
    try {
      this.character = await api('GET', '/game/character', null, this.token);
    } catch {}
  }

  // ── Achievements ───────────────────────────────────────────────────────
  async claimAchievements() {
    try {
      const data = await api('GET', '/achievements', null, this.token);
      if (!data || !data.items) return;
      const claimable = data.items.filter(a => a.claimable);
      if (claimable.length === 0) return;
      for (const a of claimable) {
        try {
          const result = await api('POST', `/achievements/${a.id}/claim`, null, this.token);
          if (result.character) this.character = result.character;
          log(this.name, `Claimed achievement: ${a.name} (${a.reward_summary || 'rewards'})`);
          await sleep(200);
        } catch {}
      }
    } catch {}
  }

  // ── Premium (activate all features) ─────────────────────────────────────
  async activateAllPremium() {
    try {
      const features = await api('GET', '/game/premium/features', null, this.token);
      if (!features || !features.features) return;
      const gems = this.character.gems || 0;
      const allFeatures = [
        'fortune_hunter', 'warlord', 'iron_fortress', 'apprentice',
        'vault_keeper', 'arcane_reservoir'
      ];
      let activated = 0;
      for (const id of allFeatures) {
        const feat = features.features.find(f => f.id === id);
        if (!feat || feat.active || gems < feat.cost) continue;
        try {
          await api('POST', '/game/premium/activate', { featureId: id }, this.token);
          log(this.name, `Activated premium: ${id}`);
          activated++;
          await sleep(300);
        } catch {}
      }
      if (activated > 0) await this.refreshCharacter();
    } catch {}
  }

  // ── Buy & Open Lootboxes ───────────────────────────────────────────────
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
      return !['weapon', 'armor', 'helmet', 'boots', 'shield', 'ring', 'amulet', 'belt', 'gloves'].every(s => filled.has(s));
    } catch { return true; }
  }

  async openAllLootboxes() {
    try {
      const inv = await api('GET', '/game/inventory', null, this.token);
      const lootboxes = (inv.items || []).filter(i => {
        if (i.item_type !== 'consumable') return false;
        try { const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data; return d.category === 'lootbox'; }
        catch { return false; }
      });
      for (const box of lootboxes) {
        const total = box.quantity || 1;
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
    try {
      await this.openAllLootboxes();
      await this.equipBest();
      if (!(await this.hasEmptySlots())) {
        log(this.name, 'All gear slots filled');
        this._lootboxSetup = true;
        return;
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        await this.refreshCharacter();
        const gems = this.character.gems || 0;
        const canBuy = Math.min(30, Math.floor(gems / 5));
        if (canBuy < 1) { break; }
        log(this.name, `Buying ${canBuy} epic lootboxes (${canBuy * 5}💎)`);
        for (let i = 0; i < canBuy; i++) {
          await api('POST', '/game/shop/buy', { item: { id: 'lootbox_epic', category: 'lootbox' } }, this.token);
        }
        await sleep(500);
        await this.openAllLootboxes();
        await this.equipBest();
        if (!(await this.hasEmptySlots())) {
          log(this.name, 'All gear slots filled');
          break;
        }
      }
      this._lootboxSetup = true;
      log(this.name, 'Lootbox setup done');
    } catch (e) {
      log(this.name, `Lootbox setup failed: ${e.message}`);
    }
  }

  // ── Equip Best Gear ────────────────────────────────────────────────────
  async equipBest() {
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      const slotGroups = [
        { name: 'weapon',  slots: ['weapon'] },
        { name: 'armor',   slots: ['armor'] },
        { name: 'helmet',  slots: ['helmet'] },
        { name: 'shield',  slots: ['shield'] },
        { name: 'boots',   slots: ['boots'] },
        { name: 'jewelry', slots: ['ring', 'amulet'] },
        { name: 'gloves',  slots: ['gloves'] },
        { name: 'belt',    slots: ['belt'] },
      ];
      const buildPref = this._currentBuild.gear || [];
      for (const group of slotGroups) {
        let equippedId = null, equippedScore = -1;
        let best = null, bestScore = -1;
        for (const item of items) {
          try {
            const d = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (!group.slots.includes(d.slot)) continue;
            const stats = d.stats || d.wp_stats || {};
            let score = (d.upgradeLevel || 0) * 10000;
            for (const [stat, val] of Object.entries(stats)) {
              const multiplier = buildPref.includes(stat) ? 3 : 1;
              score += Number(val) * multiplier;
            }
            if (item.equipped) { equippedId = item.id; equippedScore = score; }
            if (score > bestScore) { best = item; bestScore = score; }
          } catch {}
        }
        if (!best || bestScore <= equippedScore) continue;
        if (group.name === 'jewelry' || !best.equipped) {
          try {
            await api('POST', `/game/equip/${best.id}`, null, this.token);
            await sleep(150);
          } catch {}
        }
      }
    } catch {}
  }

  // ── Shop Gear (buy missing slots from shop) ────────────────────────────
  async shopGear() {
    try {
      const shop = await api('GET', '/game/shop/items', null, this.token);
      const gear = (shop.items || []).filter(i =>
        i.priceType === 'gold' && i.price <= this.character.gold &&
        ['weapon', 'helm', 'armor', 'gloves', 'boots', 'ring', 'amulet', 'belt', 'shield'].includes(i.slot) &&
        i.level <= this.character.level
      );
      for (const item of gear) {
        try {
          await api('POST', '/game/shop/buy', { item: { id: item.id, category: item.slot } }, this.token);
          log(this.name, `Bought ${item.name} (${item.slot})`);
          await sleep(200);
        } catch {}
      }
    } catch {}
  }

  // ── Upgrades (stat) ────────────────────────────────────────────────────
  async upgradeStats() {
    const focus = this._currentBuild.focus;
    let gold = this.character.gold || 0;
    if (gold < 50) return;
    for (let round = 0; round < 8; round++) {
      for (const stat of focus) {
        if (gold < 50) return;
        try {
          const result = await api('POST', '/game/upgrade', { stat }, this.token);
          if (result.character) {
            gold = result.character.gold ?? (this.character.gold || 0);
            this.character = result.character;
          }
          await sleep(200);
        } catch { return; }
      }
    }
  }

  // ── Upgrade Gear ───────────────────────────────────────────────────────
  async upgradeGear() {
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      const gold = this.character.gold || 0;
      if (gold < 2000) return;
      for (const item of items) {
        if (!item.equipped) continue;
        try {
          const d = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
          const upLvl = d.upgradeLevel || 0;
          if (upLvl >= 3) continue;
          await api('POST', `/game/equipment/upgrade/${item.id}`, { componentId: 'iron_ingot', expectedUpgradeLevel: upLvl }, this.token);
          log(this.name, `Upgraded gear to +${upLvl + 1}`);
          await sleep(300);
        } catch {}
      }
    } catch {}
  }

  // ── Start Up Sequence ─────────────────────────────────────────────────
  async startup() {
    log(this.name, '=== Starting up ===');
    await this.ensureAuth();

    // 1. Activate all premium features first (cheaper upgrades)
    await this.activateAllPremium();
    await this.refreshCharacter();

    // 2. Open any existing lootboxes + buy more
    await this.buyAndOpenLootboxes();
    await this.equipBest();

    // 3. Claim any available achievements for gold
    await this.claimAchievements();
    await this.refreshCharacter();

    // 4. Buy gear from shop if we have gold
    const gold = this.character.gold || 0;
    if (gold >= 5000) {
      await this.shopGear();
      await this.equipBest();
    }

    // 5. Upgrade stats with whatever gold we have
    await this.upgradeStats();

    // 6. Upgrade gear
    await this.upgradeGear();

    log(this.name, `=== Start up complete. Lvl ${this.character.level} | Gold: ${this.character.gold || 0} | Gems: ${this.character.gems || 0} | Build: ${this._currentBuild.name} ===`);
  }

  // ── Mana Potions ───────────────────────────────────────────────────────
  async useManaPotion() {
    const mp = this.character.mission_points || 0;
    if (mp >= 40) return;
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const manaPot = (inventory.items || []).find(i => {
        if (i.item_type !== 'consumable') return false;
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.effect?.type === 'mp' && (Number(d.qty) || 1) > 0;
        } catch { return false; }
      });
      if (!manaPot) return;
      const result = await api('POST', `/game/use/${manaPot.id}`, null, this.token);
      if (result.character) this.character = result.character;
    } catch {}
  }

  // ── Missions ───────────────────────────────────────────────────────────
  async ensureTravelTarget(zoneKey) {
    try {
      await this.refreshCharacter();
      const loc = this.character.location;
      if (loc === zoneKey) return true;
      if (this.character.travel_target) {
        const status = await api('GET', '/game/travel/status', null, this.token);
        if (status && status.travelEnd && status.travelEnd > Math.floor(Date.now() / 1000)) return false;
      }
      const zonePath = ['swamp', 'mountains', 'ruins', 'dark_city'];
      const candidates = [zoneKey, ...zonePath.slice(0, zonePath.indexOf(zoneKey)).reverse()];
      for (const z of candidates) {
        if (z === loc) continue;
        try {
          await api('POST', '/game/travel/start', { targetZone: z }, this.token);
          log(this.name, `Traveling to ${z}`);
          return false;
        } catch (e2) {
          if (e2.message.includes('challenge') || e2.message.includes('unlock')) continue;
          return false;
        }
      }
      return false;
    } catch { return false; }
  }

  async doMission() {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.missionEnd) return false;
      // Start in forest (easy zone), scale up as we level
      const zoneMap = [
        { maxLvl: 3,  zone: 'forest', spot: 'city_outskirts' },
        { maxLvl: 7,  zone: 'forest', spot: 'city_palace' },
        { maxLvl: 15, zone: 'swamp',  spot: 'swamp_village' },
        { maxLvl: 25, zone: 'mountains', spot: 'mountain_peak' },
        { maxLvl: 40, zone: 'ruins',  spot: 'ruins_temple' },
      ];
      const lvl = this.character.level || 1;
      const tier = zoneMap.find(t => lvl <= t.maxLvl) || zoneMap[zoneMap.length - 1];
      if (!(await this.ensureTravelTarget(tier.zone))) return false;
      const difficulty = lvl <= 5 ? 'easy' : lvl <= 15 ? 'medium' : 'hard';
      const result = await api('POST', '/game/missions/start', { zoneId: tier.zone, spotId: tier.spot, size: 'small', difficulty }, this.token);
      this.missionEnd = now + 600;
      if (result.character) this.character = result.character;
      log(this.name, `Started ${difficulty} mission in ${tier.zone}`);
      return true;
    } catch (e) {
      if (e.message.includes('cooldown')) { this.missionEnd = Date.now() / 1000 + 300; return false; }
      return false;
    }
  }

  async collectMission() {
    try {
      const result = await api('POST', '/game/missions/collect', null, this.token);
      if (result.character) this.character = result.character;
      return true;
    } catch (e) {
      if (e.message.includes('No active mission') || e.message.includes('already collected')) {
        this.missionEnd = 0;
        return true;
      }
      return false;
    }
  }

  // ── Health ─────────────────────────────────────────────────────────────
  async healIfLow() {
    const hp = this.character.hp_current || 0;
    const maxHp = this.character.hp_max || 100;
    if (hp >= maxHp * 0.3) return false;
    log(this.name, `HP ${hp}/${maxHp} — healing`);
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const healPots = (inventory.items || []).filter(i => {
        if (i.item_type !== 'consumable') return false;
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.effect?.type === 'heal_full';
        } catch { return false; }
      });
      if (healPots.length > 0) {
        const result = await api('POST', `/game/use/${healPots[0].id}`, null, this.token);
        if (result.character) this.character = result.character;
        log(this.name, 'Used health potion');
        return true;
      }
      // Buy from shop
      const shop = await api('GET', '/game/shop/items', null, this.token);
      const fullPots = (shop.items || []).filter(i =>
        i.effect?.type === 'heal_full' && i.price <= ((i.priceType === 'gems' ? this.character.gems : this.character.gold) || 0)
      );
      fullPots.sort((a, b) => (a.price || 0) - (b.price || 0));
      if (fullPots.length > 0) {
        const bestPot = fullPots[0];
        const buyResult = await api('POST', '/game/shop/buy', { item: { id: bestPot.id, category: 'consumable' } }, this.token);
        if (buyResult.character) this.character = buyResult.character;
        await sleep(200);
        const inv2 = await api('GET', '/game/inventory', null, this.token);
        const pot = (inv2.items || []).find(i => {
          try {
            const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
            return d.id === bestPot.id;
          } catch { return false; }
        });
        if (pot) {
          await api('POST', `/game/use/${pot.id}`, null, this.token);
          log(this.name, `Bought and used ${bestPot.name}`);
        }
        return true;
      }
      log(this.name, 'No health potions');
      return false;
    } catch { return false; }
  }

  // ── PvP ───────────────────────────────────────────────────────────────
  async doPvp() {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.cooldowns.pvp) return false;
      const hp = this.character.hp_current || 0;
      if (hp <= 0) return false;
      if (hp < (this.character.hp_max || 100) * 0.3) await this.healIfLow();
      if ((this.character.hp_current || 0) <= 0) return false;

      const target = await api('GET', '/game/matchmaking?direction=similar', null, this.token);
      if (!target || !target.id) return false;
      // Skip other bots
      if (target.username && (target.username.startsWith('bot_') || target.username.startsWith('b2_'))) return false;

      const targetId = target.id;
      const myLevel = this.character.level || 1;
      const tgtLevel = target.level || 1;

      // Per-target cooldown
      if (this.cooldowns.perTarget[targetId] && now < this.cooldowns.perTarget[targetId]) return false;

      const result = await api('POST', `/game/attack/${targetId}`, null, this.token);
      this.cooldowns.pvp = now + 300;
      this.cooldowns.perTarget[targetId] = now + 86400;
      const won = result.won || result.isDraw === false;
      log(this.name, `PvP vs ${target.name || targetId} (lvl ${tgtLevel}): ${won ? 'WON' : result.isDraw ? 'DRAW' : 'LOST'}`);

      if (won) {
        this._buildWins++;
        this._consecutiveLosses = 0;
      } else if (!result.isDraw) {
        this._buildLosses++;
        this._consecutiveLosses++;
      }
      this._buildBattles++;
      this._totalBattles++;
      this._persistBuildState();

      if (result.character) this.character = result.character;

      // Check if we need to switch build
      this._evaluateBuild();

      return true;
    } catch (e) {
      if (e.message.includes('cooldown') || e.message.includes('Cooldown')) {
        this.cooldowns.pvp = Math.floor(Date.now() / 1000) + 300;
      }
      return false;
    }
  }

  // ── Build Evaluation ──────────────────────────────────────────────────
  _evaluateBuild() {
    const needsSwitch = (
      (this._buildBattles >= MIN_BATTLES_BEFORE_SWITCH && this._buildBattles > 0 && (this._buildWins / this._buildBattles) < 0.35)
      || (this._consecutiveLosses >= CONSECUTIVE_LOSS_SWITCH && this._buildBattles >= 5)
    );
    if (!needsSwitch) return;
    const oldBuild = this._currentBuild.name;
    const winRate = this._buildBattles > 0 ? Math.round(this._buildWins / this._buildBattles * 100) : 0;
    log(this.name, `Build "${oldBuild}" win rate ${winRate}% (${this._buildWins}W/${this._buildLosses}L after ${this._buildBattles}battles) — switching`);

    // Switch to next build
    this._buildIndex = (this._buildIndex + 1) % this._builds.length;
    this._currentBuild = this._builds[this._buildIndex];
    this._buildWins = 0;
    this._buildLosses = 0;
    this._buildBattles = 0;
    this._consecutiveLosses = 0;
    this._persistBuildState();
    log(this.name, `Switched to build: "${this._currentBuild.name}"`);
  }

  // ── Tournaments ────────────────────────────────────────────────────────
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

  async convertMpToTokens(mpAmount) {
    try { await api('POST', '/game/dungeon/mp-spent', { mpSpent: mpAmount }, this.token); }
    catch {}
  }

  async _cleanupDungeonSession() {
    try {
      const data = await api('GET', '/game/dungeon/data', null, this.token).catch(() => null);
      if (!data) return;
      await api('POST', '/game/dungeon/combat/start', { floor: data.floor || 1, roomIndex: -1, kind: 'room', floorRunId: 'cleanup_' + Date.now() }, this.token);
    } catch {}
  }

  // ── Feed Elemental ─────────────────────────────────────────────────────
  async feedElemental() {
    try {
      const elemData = await api('GET', '/game/elemental', null, this.token);
      if (!elemData || !elemData.elemental) return;
      const inv = await api('GET', '/game/inventory', null, this.token);
      const feedable = (inv.items || []).filter(i => {
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.type === 'raw_mat' && d.id && (d.id.includes('dgn_') || d.id.includes('crystal') || d.id.includes('essence'));
        } catch { return false; }
      });
      if (feedable.length === 0) return;
      feedable.sort((a, b) => {
        const da = typeof a.item_data === 'string' ? JSON.parse(a.item_data) : a.item_data;
        const db = typeof b.item_data === 'string' ? JSON.parse(b.item_data) : b.item_data;
        return (db.value || db.xp || 0) - (da.value || da.xp || 0);
      });
      const batch = feedable.slice(0, 5);
      for (const item of batch) {
        await api('POST', '/game/elemental/feed', { inventory_id: item.id, qty: (item.quantity || 1) }, this.token);
        await sleep(200);
      }
      log(this.name, `Fed ${batch.length} materials to elemental`);
    } catch {}
  }

  // ── Periodic Upgrade Cycle ────────────────────────────────────────────
  async doUpgradeCycle() {
    const gold = this.character.gold || 0;
    if (gold < 500) return;
    // Claim achievements first for more gold
    await this.claimAchievements();
    await this.refreshCharacter();
    // Upgrade stats
    await this.upgradeStats();
    await this.refreshCharacter();
    // Upgrade gear
    await this.upgradeGear();
    await this.equipBest();
  }

  // ── Main Tick ──────────────────────────────────────────────────────────
  async tick() {
    if (!this.token) await this.ensureAuth();

    const now = new Date();
    const hour = now.getUTCHours() + 1;
    const min = now.getMinutes();
    if (!this.tournamentJoined) {
      const inWindow = (hour === 19 && min >= 30) || (hour >= 20 && hour <= 22) || (hour === 23 && min <= 30);
      if (inWindow) await this.joinTournament();
    }
    if (hour >= 0 && hour < 6) this.tournamentJoined = false;

    await this.healIfLow();
    await this.collectMission();
    await this.useManaPotion();
    await this.doMission();
    await this.claimAchievements();
    await this.openAllLootboxes();
    await this.equipBest();
    await this.feedElemental();
    await this.doPvp();
    await this.activateAllPremium();
    await this.doUpgradeCycle();
    await this.refreshCharacter();

    // Report build status periodically
    if (this._totalBattles > 0 && this._totalBattles % 10 === 0) {
      const wr = this._buildBattles > 0 ? Math.round(this._buildWins / this._buildBattles * 100) : 0;
      log(this.name, `[Stats] Build: ${this._currentBuild.name} | ${this._buildWins}W/${this._buildLosses}L (${wr}%) | Total battles: ${this._totalBattles}`);
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     RPG Arena Bot2 — Testing         ║');
  console.log('╚══════════════════════════════════════╝');

  const bots = ACCOUNTS.map(cfg => new TestBot(cfg));

  // Initial auth + startup for all bots
  for (const bot of bots) {
    try {
      await bot.startup();
    } catch (e) {
      log(bot.name, `Startup failed: ${e.message}`);
    }
  }

  // Main loop
  while (true) {
    const startTime = Date.now();
    for (const bot of bots) {
      try { await bot.tick(); } catch (e) { log(bot.name, `Tick error: ${e.message}`); }
      await sleep(800);
    }
    const elapsed = Date.now() - startTime;
    const wait = Math.max(10000, 30000 - elapsed);
    await sleep(wait);
  }
}

main().catch(console.error);
