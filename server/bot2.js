const BASE = 'http://localhost:3009';
const TOKEN_FILE = './.bot2_tokens.json';
const MEMORY_FILE = './.bot2_memory.json';
const fs = require('fs');
const path = require('path');

const ACCOUNTS = [
  // Original test bots
  { username: 'b2_warrior', password: 'botpass123', class: 'warrior' },
  { username: 'b2_mage',    password: 'botpass123', class: 'mage' },
  { username: 'b2_rogue',   password: 'botpass123', class: 'rogue' },
  { username: 'b2_paladin', password: 'botpass123', class: 'paladin' },
  { username: 'b2_ranger',  password: 'botpass123', class: 'paladin' },
  { username: 'b2_knight',  password: 'botpass123', class: 'warrior' },
  { username: 'b2_warlock', password: 'botpass123', class: 'mage' },
  { username: 'b2_shadow',  password: 'botpass123', class: 'rogue' },
  // Epic-name bots
  { username: 'xX_Sh4d0w_Xx',  password: 'botpass123', class: 'rogue',   startBuild: 3, skipPvp: true },
  { username: 'Cr1ms0n_R34p3r', password: 'botpass123', class: 'warrior', skipPvp: true },
  { username: 'VoïdWalker',    password: 'botpass123', class: 'mage',    skipPvp: true },
  { username: 'Lùnar_Tiger',   password: 'botpass123', class: 'rogue',   startBuild: 3, skipPvp: true },
  { username: 'Blaze_Fury',    password: 'botpass123', class: 'warrior', startBuild: 3, skipPvp: true },
  { username: 'Ragnarök',      password: 'botpass123', class: 'warrior', skipPvp: true },
  { username: 'N3cr0m4nc3r',   password: 'botpass123', class: 'mage',    startBuild: 3, skipPvp: true },
  { username: 'NïghtHawk42',   password: 'botpass123', class: 'paladin', skipPvp: true },
  { username: 'Shadow_Sp1r1t', password: 'botpass123', class: 'rogue',   skipPvp: true },
  { username: 'Ärc4nus',       password: 'botpass123', class: 'mage',    skipPvp: true },
];

// Each class has multiple build strategies to test
const BUILDS = {
  warrior: [
    { name: 'heavy_str',   focus: ['strength', 'hit_chance', 'crit_chance'],                    gear: ['strength', 'hit_chance', 'crit_chance'] },
    { name: 'tank',        focus: ['vitality', 'defense', 'hit_chance'],                        gear: ['defense', 'vitality', 'hit_chance'] },
    { name: 'balanced',    focus: ['strength', 'defense', 'hit_chance','crit_chance'],           gear: ['strength', 'defense', 'hit_chance', 'crit_chance'] },
    { name: 'crit_meta',   focus: ['crit_chance', 'hit_chance', 'crit_chance', 'hit_chance', 'strength'], gear: ['crit_chance', 'hit_chance', 'strength', 'agility'] },
  ],
  mage: [
    { name: 'glass_cannon', focus: ['magic', 'crit_chance', 'hit_chance'],                      gear: ['magic', 'crit_chance', 'hit_chance'] },
    { name: 'battlemage',   focus: ['magic', 'defense', 'hit_chance'],                          gear: ['magic', 'defense', 'hit_chance'] },
    { name: 'swift_mage',   focus: ['agility', 'magic', 'crit_chance'],                         gear: ['magic', 'agility', 'crit_chance'] },
    { name: 'glass_meta',   focus: ['crit_chance', 'hit_chance', 'crit_chance', 'hit_chance', 'magic'], gear: ['crit_chance', 'hit_chance', 'magic', 'agility'] },
  ],
  rogue: [
    { name: 'shadow_blade', focus: ['agility', 'crit_chance', 'hit_chance'],                    gear: ['agility', 'crit_chance', 'hit_chance'] },
    { name: 'assassin',     focus: ['strength', 'agility', 'crit_chance'],                      gear: ['strength', 'agility', 'crit_chance'] },
    { name: 'dancer',       focus: ['agility', 'vitality', 'hit_chance'],                       gear: ['agility', 'hit_chance', 'crit_chance'] },
    { name: 'shadow_meta',  focus: ['crit_chance', 'hit_chance', 'crit_chance', 'hit_chance', 'agility'], gear: ['crit_chance', 'hit_chance', 'agility', 'strength'] },
  ],
  paladin: [
    { name: 'holy_guard',   focus: ['strength', 'defense', 'crit_chance'],                      gear: ['strength', 'defense', 'crit_chance'] },
    { name: 'crusader',     focus: ['strength', 'magic', 'hit_chance'],                         gear: ['strength', 'magic', 'hit_chance'] },
    { name: 'templar',      focus: ['defense', 'vitality', 'hit_chance'],                       gear: ['defense', 'vitality', 'hit_chance'] },
  ],
};

const ZONE_PROGRESSION = [
  { zone: 'forest',     spots: ['forest_camp', 'forest_bandits', 'forest_ruins'],     guardian: null },
  { zone: 'swamp',      spots: ['swamp_edge', 'swamp_village', 'swamp_heart'],        guardian: 'swamp' },
  { zone: 'mountains',  spots: ['mountain_base', 'mountain_peak', 'ice_cavern'],       guardian: 'mountains' },
  { zone: 'ruins',      spots: ['ruins_perimeter', 'ruins_temple', 'ruins_crypt'],     guardian: 'ruins' },
  { zone: 'dark_city',  spots: ['city_outskirts', 'city_cathedral', 'city_palace'],    guardian: 'dark_city' },
];
const DIFF_LABELS = ['easy', 'medium', 'hard'];

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

const botLogger = require('./bot-logger');

function log(name, msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}][${name}] ${msg}`);
  botLogger.write(name, msg);
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
    this._skipPvp = cfg.skipPvp ?? false;
    this._guardianWinThreshold = {};

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
      this._buildIndex = cfg.startBuild ?? 0;
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

    // Progression system
    const prog = mem._progression?.[this.name];
    this._zoneIndex = prog?.zoneIndex ?? 0;
    this._diffTier = prog?.diffTier ?? 0;
    this._tutorialDone = prog?.tutorialDone ?? false;
    this._tierStats = prog?.tierStats ?? {};
    this._lastLootboxLevel = prog?.lastLootboxLevel ?? 0;
    this._lootboxSetup = this._lastLootboxLevel > 0;
  }

  _persistProgression() {
    const mem = loadMemory();
    if (!mem._progression) mem._progression = {};
    mem._progression[this.name] = {
      zoneIndex: this._zoneIndex,
      diffTier: this._diffTier,
      tutorialDone: this._tutorialDone,
      tierStats: this._tierStats,
      lastLootboxLevel: this._lastLootboxLevel,
    };
    saveMemory(mem);
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
      const data = await api('GET', '/game/achievements', null, this.token);
      if (!data || !data.items) return;
      const claimable = data.items.filter(a => a.claimable);
      if (claimable.length === 0) return;
      for (const a of claimable) {
        try {
          const result = await api('POST', `/game/achievements/${a.id}/claim`, null, this.token);
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
      return !['weapon', 'armor', 'helmet', 'boots', 'shield', 'ring', 'amulet', 'accessory'].every(s => filled.has(s));
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
    const lvl = this.character?.level || 1;
    if (this._lootboxSetup && (lvl - this._lastLootboxLevel) < 5) return;
    try {
      await this.openAllLootboxes();
      await this.equipBest();
      if (!(await this.hasEmptySlots())) {
        log(this.name, 'All gear slots filled');
        this._lootboxSetup = true;
        this._lastLootboxLevel = lvl;
        this._persistProgression();
        return;
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        await this.refreshCharacter();
        const gems = this.character.gems || 0;
        const reserved = 5;
        const canBuy = Math.min(30, Math.floor(Math.max(0, gems - reserved) / 5));
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
      this._lastLootboxLevel = lvl;
      this._persistProgression();
      log(this.name, `Lootbox setup done (next check at level ${lvl + 5})`);
    } catch (e) {
      log(this.name, `Lootbox setup failed: ${e.message}`);
    }
  }

  // ── Equip Best Gear ────────────────────────────────────────────────────
  _weaponOk(d) {
    const name = (d.name || '').toLowerCase();
    const isWpn = (kw) => name.includes(kw) || (d.weaponType || '').includes(kw);
    const cls = this.cfg.class;
    if (cls === 'paladin') {
      return isWpn('mace') || isWpn('hammer') || isWpn('staff') || isWpn('axe') || isWpn('blade') || isWpn('spear') || isWpn('scythe') || isWpn('sword') || isWpn('greatsword');
    }
    if (cls === 'warrior') {
      return !isWpn('staff') && !isWpn('dagger');
    }
    if (cls === 'mage') {
      return isWpn('scythe') || isWpn('staff');
    }
    if (cls === 'rogue') {
      return isWpn('dagger') || isWpn('bow') || isWpn('scythe');
    }
    return true;
  }

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
            if (group.name === 'weapon' && !this._weaponOk(d)) continue;
            const lvl = d.upgradeLevel || item.upgrade_level || 0;
            const sum = (d.stats ? Object.values(d.stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0) +
                        (d.wp_stats ? Object.values(d.wp_stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0);
            const score = lvl * 10000 + sum;
            if (item.equipped) { equippedId = item.id; equippedScore = score; }
            if (score > bestScore) { best = item; bestScore = score; }
          } catch {}
        }
        if (!best || bestScore <= equippedScore) continue;
        if (group.name === 'jewelry' || !best.equipped) {
          try {
            await api('POST', `/game/equip/${best.id}`, null, this.token);
            await sleep(200);
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  async sellWorstGear() {
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      const equipped = items.filter(i => i.equipped);
      const equippedSlots = new Set();
      for (const eq of equipped) {
        try {
          const d = typeof eq.item_data === 'string' ? JSON.parse(eq.item_data) : eq.item_data;
          if (d.slot) equippedSlots.add(d.slot);
        } catch {}
      }
      let sold = 0;
      for (const item of items) {
        if (item.equipped) continue;
        if (item.item_type !== 'equipment') continue;
        try {
          const d = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
          if (!d.slot || !equippedSlots.has(d.slot)) continue;
          await api('POST', `/game/sell/${item.id}`, null, this.token);
          sold++;
          await sleep(100);
        } catch {}
      }
      if (sold > 0) log(this.name, `Sold ${sold} weaker gear items`);
    } catch {}
  }

  // ── Shop Gear (buy missing slots from shop) ────────────────────────────
  async shopGear() {
    try {
      const shop = await api('GET', '/game/shop/items', null, this.token);
      const gear = (shop.items || []).filter(i =>
        i.priceType === 'gold' && i.price <= this.character.gold &&
        ['weapon', 'helm', 'armor', 'accessory', 'boots', 'ring', 'amulet', 'shield'].includes(i.slot) &&
        i.level <= this.character.level &&
        (i.slot !== 'weapon' || this._weaponOk(i))
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
    await this.sellWorstGear();

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
      let manaPot = (inventory.items || []).find(i => {
        if (i.item_type !== 'consumable') return false;
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.effect?.type === 'mp' && (Number(d.qty) || 1) > 0;
        } catch { return false; }
      });
      // Buy from shop if none in inventory
      if (!manaPot && (this.character.gems || 0) >= 5) {
        await api('POST', '/game/shop/buy', { item: { id: 'potion_mana', category: 'consumable' } }, this.token);
        await sleep(200);
        const inv2 = await api('GET', '/game/inventory', null, this.token);
        manaPot = (inv2.items || []).find(i => {
          if (i.item_type !== 'consumable') return false;
          try {
            const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
            return d.effect?.type === 'mp';
          } catch { return false; }
        });
        if (manaPot) log(this.name, 'Bought mana potion (5💎)');
      }
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
      const now = Math.floor(Date.now() / 1000);

      // Check travel status — may trigger gatekeeper fight
      if (this.character.travel_target) {
        const status = await api('GET', '/game/travel/status', null, this.token);
        if (status.encounterResult && status.encounterResult.won === false) {
          const lostZone = status.encounterResult.targetZone;
          // Revert zone progression — stay in current zone, do hard missions
          const curLoc = status.character?.location || loc;
          const curIdx = ZONE_PROGRESSION.findIndex(z => z.zone === curLoc);
          if (curIdx >= 0 && this._zoneIndex !== curIdx) {
            this._zoneIndex = curIdx;
            this._diffTier = 2;
            this._tierStats[`${curIdx}_2`] = { wins: 0, losses: 0, draws: 0, battles: 0 };
            this._persistProgression();
            log(this.name, `Guardian loss — reverted to ${curLoc} hard`);
          }
          // Need 15 more wins before retrying this zone
          this._guardianWinThreshold[lostZone] = (this.character.wins || 0) + 15;
          if (status.character) this.character = status.character;
          log(this.name, `Lost to ${status.encounterResult.guardianName} — need 15 more wins before retrying ${lostZone}`);
        }
        if (status && status.travelEnd && status.travelEnd > now) return false;
      }

      // Build candidates, skip zones with guardian win threshold
      const zonePath = ['swamp', 'mountains', 'ruins', 'dark_city'];
      const candidates = [zoneKey, ...zonePath.slice(0, zonePath.indexOf(zoneKey)).reverse()];
      for (const z of candidates) {
        if (z === loc) continue;
        const threshold = this._guardianWinThreshold[z];
        if (threshold && (this.character.wins || 0) < threshold) continue;
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

      const isTutorial = (this.character.wins || 0) < 4;
      if (!isTutorial) {
        const hp = this.character.hp_current || 0;
        const maxHp = this.character.hp_max || 100;
        if (hp <= 0) {
          log(this.name, `HP 0 — skipping mission`);
          return false;
        }
        if (hp < maxHp * 0.3) {
          log(this.name, `HP ${hp}/${maxHp} — waiting for heal`);
          return false;
        }
      }

      const zoneData = ZONE_PROGRESSION[this._zoneIndex];
      if (!zoneData) return false;

      const spotId = zoneData.spots[this._diffTier];
      if (!spotId) return false;

      if (!(await this.ensureTravelTarget(zoneData.zone))) return false;

      const result = await api('POST', '/game/missions/start', { zoneId: zoneData.zone, spotId, size: 'small' }, this.token);
      this.missionEnd = now + 600;
      if (result.character) this.character = result.character;

      log(this.name, `Started ${DIFF_LABELS[this._diffTier]} mission in ${zoneData.zone} (${spotId})`);
      return true;
    } catch (e) {
      if (e.message.includes('cooldown')) { this.missionEnd = Date.now() / 1000 + 300; return false; }
      return false;
    }
  }

  async collectMission() {
    try {
      const result = await api('POST', '/game/missions/collect', null, this.token);
      if (result) {
        if (result.character) this.character = result.character;
        this._handleMissionResult(result);
      }
      return true;
    } catch (e) {
      if (e.message.includes('No active mission') || e.message.includes('already collected')) {
        this.missionEnd = 0;
        return true;
      }
      return false;
    }
  }

  _handleMissionResult(result) {
    if (!result || result.won === undefined) return;

    const key = `${this._zoneIndex}_${this._diffTier}`;
    if (!this._tierStats[key]) this._tierStats[key] = { wins: 0, losses: 0, draws: 0, battles: 0 };

    if (result.won) this._tierStats[key].wins++;
    else if (result.isDraw) this._tierStats[key].draws++;
    else this._tierStats[key].losses++;
    this._tierStats[key].battles++;

    // Tutorial auto-advance to medium after 4 forced wins
    if (!this._tutorialDone && this.character && (this.character.wins || 0) >= 4) {
      this._tutorialDone = true;
      if (this._diffTier === 0) {
        this._diffTier = 1;
        this._tierStats[`${this._zoneIndex}_0`] = { wins: 0, losses: 0, draws: 0, battles: 0 };
      }
      log(this.name, 'Tutorial complete — advancing to medium difficulty');
    }

    this._evaluateMissionProgression();
    this._persistProgression();
  }

  _evaluateMissionProgression() {
    const key = `${this._zoneIndex}_${this._diffTier}`;
    const stats = this._tierStats[key];
    if (!stats || stats.battles < 10) return;

    const winRate = stats.battles > 0 ? stats.wins / stats.battles : 0;
    const zoneData = ZONE_PROGRESSION[this._zoneIndex];

    if (winRate >= 0.7 && stats.battles >= 10) {
      if (this._diffTier < 2) {
        const oldDiff = DIFF_LABELS[this._diffTier];
        this._diffTier++;
        log(this.name, `Advancing ${oldDiff} → ${DIFF_LABELS[this._diffTier]} in ${zoneData.zone} (${stats.wins}W/${stats.losses}L)`);
        this._tierStats[key] = { wins: 0, losses: 0, draws: 0, battles: 0 };
      } else if (this._zoneIndex < ZONE_PROGRESSION.length - 1) {
        const nextZone = ZONE_PROGRESSION[this._zoneIndex + 1].zone;
        const threshold = this._guardianWinThreshold[nextZone];
        if (threshold && (this.character.wins || 0) < threshold) {
          log(this.name, `Hard mastered but guardian blocks ${nextZone} — need ${threshold - (this.character.wins || 0)} more wins`);
        } else {
          log(this.name, `Hard mastered in ${zoneData.zone} (${stats.wins}W/${stats.losses}L) — moving to ${nextZone}`);
          this._zoneIndex++;
          this._diffTier = 0;
          this._tierStats[`${this._zoneIndex}_0`] = { wins: 0, losses: 0, draws: 0, battles: 0 };
        }
      }
    } else if (winRate < 0.3 && this._diffTier > 0 && stats.battles >= 10) {
      const oldDiff = DIFF_LABELS[this._diffTier];
      this._diffTier--;
      log(this.name, `Struggling in ${oldDiff} — dropping to ${DIFF_LABELS[this._diffTier]} in ${zoneData.zone} (${stats.wins}W/${stats.losses}L)`);
      this._tierStats[key] = { wins: 0, losses: 0, draws: 0, battles: 0 };
    }
  }

  // ── Health ─────────────────────────────────────────────────────────────
  _setPotionCooldown(message) {
    const match = message.match(/cooldown for (\d+)m\s*(\d+)s/);
    if (match) {
      const remaining = parseInt(match[1]) * 60 + parseInt(match[2]);
      this._potionCooldownUntil = Math.floor(Date.now() / 1000) + remaining;
    }
  }

  async healIfLow() {
    const hp = this.character.hp_current || 0;
    const maxHp = this.character.hp_max || 100;
    if (hp >= maxHp * 0.3) return false;
    const now = Math.floor(Date.now() / 1000);
    if (this._potionCooldownUntil && now < this._potionCooldownUntil) {
      log(this.name, `Potion cooldown: ${Math.round((this._potionCooldownUntil - now) / 60)}m remaining`);
      return false;
    }
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
        try {
          const result = await api('POST', `/game/use/${healPots[0].id}`, null, this.token);
          if (result.character) this.character = result.character;
          log(this.name, 'Used health potion');
          return true;
        } catch (e) {
          log(this.name, `Heal potion use failed: ${e.message}`);
          this._setPotionCooldown(e.message);
          return false;
        }
      }
      // Buy full elixir from shop (5💎)
      if ((this.character.gems || 0) >= 5) {
        try {
          const buyResult = await api('POST', '/game/shop/buy', { item: { id: 'potion_full_elixir', category: 'consumable' } }, this.token);
          if (buyResult.character) this.character = buyResult.character;
          await sleep(200);
          const inv2 = await api('GET', '/game/inventory', null, this.token);
          const pot = (inv2.items || []).find(i => {
            try {
              const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
              return d.effect?.type === 'heal_full';
            } catch { return false; }
          });
          if (pot) {
            try {
              await api('POST', `/game/use/${pot.id}`, null, this.token);
              log(this.name, 'Bought and used Full Elixir (5💎)');
              return true;
            } catch (e) {
              log(this.name, `Full Elixir use failed (cooldown): ${e.message}`);
              this._setPotionCooldown(e.message);
            }
          }
        } catch (e) {
          log(this.name, `Buy Full Elixir failed: ${e.message}`);
        }
      }
      log(this.name, 'No health potions');
      return false;
    } catch (e) {
      log(this.name, `healIfLow error: ${e.message}`);
      return false;
    }
  }

  // ── Skill Training ──────────────────────────────────────────────────────
  async trainSkills() {
    try {
      // Check if already training
      const status = await api('GET', '/skills/training/status', null, this.token);
      if (status.active) return false;

      // Fetch skill tree
      const tree = await api('GET', '/skills/tree', null, this.token);
      const branches = tree.tree?.branches;
      if (!branches) return false;

      // Find starter branch (isStarter flag)
      const starterEntry = Object.entries(branches).find(([, b]) => b.isStarter);
      if (!starterEntry) return false;
      const [starterKey, starterBranch] = starterEntry;
      const starterSkill = Object.values(starterBranch.skills)[0];

      // Train basic training if not learned and trainable
      if (!starterSkill.learned && starterSkill.trainable) {
        log(this.name, `Starting training: ${starterSkill.name}`);
        await api('POST', '/skills/train/start', { skillId: starterSkill.id, branchId: starterKey, hours: 8, doubleSpeed: false }, this.token);
        return true;
      }

      // Basic training done or in progress — pick a specialization branch
      const preferredBranches = {
        warrior:  ['berserker', 'iron_guard', 'battle_commander', 'gladiator'],
        mage:     ['pyromancer', 'stormcaller', 'cryomancer', 'shadow_path'],
        rogue:    ['assassin', 'shadowblade', 'trickster'],
        paladin:  ['divine_warrior', 'protector', 'inquisitor', 'crusader'],
        shadow:   ['shadow_path', 'pyromancer', 'stormcaller', 'cryomancer'],
      };
      const charClass = (this.character.class || 'warrior').toLowerCase();
      const prefOrder = preferredBranches[charClass] || Object.keys(branches);

      for (const prefKey of prefOrder) {
        const branch = branches[prefKey];
        if (!branch || branch.isStarter) continue;

        // Check if branch requires a skill we haven't learned
        if (branch.requires?.skill) {
          const needed = branch.requires.skill;
          const treeLearned = tree.learned || [];
          // Also check progress-based unlock (minProgress)
          if (!treeLearned.includes(needed)) {
            const progressNeeded = branch.requires.minProgress || 100;
            const currentProgress = tree.progressMap?.[needed] || 0;
            if (currentProgress < progressNeeded) continue;
          }
        }

        // Find first unlearned, trainable skill in this branch
        const skillEntry = Object.entries(branch.skills).find(([, s]) => {
          if (s.learned) return false;
          if (!s.trainable) return false;
          if (s.locked) return false;
          return true;
        });

        if (skillEntry) {
          const [skillKey, skill] = skillEntry;
          log(this.name, `Starting training: ${skill.name} (${branch.name})`);
          await api('POST', '/skills/train/start', { skillId: skill.id, branchId: prefKey, hours: 8, doubleSpeed: false }, this.token);
          return true;
        }
      }

      return false;
    } catch (e) {
      log(this.name, `trainSkills: ${e.message}`);
      return false;
    }
  }

  // ── PvP ───────────────────────────────────────────────────────────────
  async doPvp() {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.cooldowns.pvp) return false;
      // Skip PvP if configured to skip
      if (this._skipPvp) return false;
      // Complete tutorial (4 forced wins) before PvP
      if ((this.character.wins || 0) < 4) return false;
      // Skip PvP while holding more than 10k gold to avoid losing it
      if ((this.character.gold || 0) > 10000) return false;
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

      // Never attack newbies (level 1)
      if (tgtLevel <= 1) {
        log(this.name, `Skipping ${target.name} (level ${tgtLevel}) — newbie protection`);
        return false;
      }

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
    const isDead = (this.character.hp_current || 0) <= 0;
    if (isDead) {
      log(this.name, `HP 0 — skipping combat activities this tick`);
    } else {
      await this.useManaPotion();
      await this.doMission();
      await this.claimAchievements();
      await this.buyAndOpenLootboxes();
      await this.openAllLootboxes();
      await this.equipBest();
      await this.sellWorstGear();
      await this.feedElemental();
      await this.doPvp();
      await this.activateAllPremium();
      await this.doUpgradeCycle();
    }
    await this.trainSkills();
    await this.refreshCharacter();

    // Report progression status periodically
    const zoneData = ZONE_PROGRESSION[this._zoneIndex];
    const key = `${this._zoneIndex}_${this._diffTier}`;
    const stats = this._tierStats[key];
    const s = stats ? `${stats.wins}W/${stats.losses}L/${stats.draws}D` : 'no data';
    const progInfo = `${zoneData?.zone || '?'} ${DIFF_LABELS[this._diffTier]} [${s}]`;

    if (this._totalBattles > 0 && this._totalBattles % 10 === 0) {
      const wr = this._buildBattles > 0 ? Math.round(this._buildWins / this._buildBattles * 100) : 0;
      log(this.name, `[Stats] Build: ${this._currentBuild.name} | ${this._buildWins}W/${this._buildLosses}L (${wr}%) | Total battles: ${this._totalBattles} | Progress: ${progInfo}`);
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

module.exports = { TestBot };
if (require.main === module) main().catch(console.error);
