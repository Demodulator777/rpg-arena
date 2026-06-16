const BASE = 'http://localhost:3009';
const TOKEN_FILE = './.bot_tokens.json';
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────
const ACCOUNTS = [
  { username: 'bot_warrior', password: 'botpass123', class: 'warrior' },
  { username: 'bot_mage',    password: 'botpass123', class: 'mage' },
  { username: 'bot_rogue',   password: 'botpass123', class: 'rogue' },
  { username: 'bot_paladin', password: 'botpass123', class: 'paladin' },
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

  // ── Missions ────────────────────────────────────────────────────────────
  getBestMissionZone() {
    const lvl = this.character.level || 1;
    const zones = [
      { key: 'forest',  minLvl: 1 },
      { key: 'swamp',   minLvl: 5 },
      { key: 'mountains', minLvl: 10 },
      { key: 'ruins',   minLvl: 20 },
      { key: 'dark_city', minLvl: 35 },
    ];
    let best = zones[0];
    for (const z of zones) {
      if (lvl >= z.minLvl) best = z;
    }
    return best;
  }

  getSpotForDifficulty(zoneKey, difficulty) {
    const zones = {
      forest:    { spots:['forest_camp','forest_bandits','forest_ruins'], diffs:['easy','medium','hard'] },
      swamp:     { spots:['swamp_edge','swamp_village','swamp_heart'], diffs:['easy','medium','hard'] },
      mountains: { spots:['mountain_base','mountain_peak','ice_cavern'], diffs:['easy','medium','hard'] },
      ruins:     { spots:['ruins_perimeter','ruins_temple','ruins_crypt'], diffs:['easy','medium','hard'] },
      dark_city: { spots:['city_outskirts','city_cathedral','city_palace'], diffs:['easy','medium','hard'] },
    };
    const zone = zones[zoneKey];
    if (!zone) return null;
    const idx = zone.diffs.indexOf(difficulty);
    if (idx === -1) return null;
    return zone.spots[idx];
  }

  async doMission() {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.missionEnd) return false;

      const wins = this.character.wins || 0;
      const tutorial = wins < 4;

      const zone = this.getBestMissionZone();
      const difficulty = tutorial ? 'easy' : (this.character.level >= (zone.minLvl + 5) ? 'hard' : (this.character.level >= zone.minLvl + 2 ? 'medium' : 'easy'));
      const spotId = this.getSpotForDifficulty(zone.key, difficulty);
      if (!spotId) return false;

      const size = tutorial ? 'small' : ((this.character.mission_points || 0) >= 60 ? 'large' : (this.character.mission_points || 0) >= 40 ? 'medium' : 'small');

      await api('POST', '/game/missions/start', { zoneId: zone.key, spotId, size }, this.token);
      this.missionEnd = now + (size === 'large' ? 1800 : size === 'medium' ? 1200 : 600);
      log(this.name, `Started ${size} ${difficulty} mission in ${zone.key} (ends in ${size === 'large' ? 30 : size === 'medium' ? 20 : 10}m)`);
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

  // ── PvP ─────────────────────────────────────────────────────────────────
  async doPvp() {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.cooldowns.pvp) return false;

      // Check HP
      if ((this.character.hp_current || 0) <= 0) {
        log(this.name, 'HP too low for PvP');
        return false;
      }

      const target = await api('GET', '/game/matchmaking?direction=similar', null, this.token);
      if (!target || !target.id) {
        log(this.name, 'No PvP targets found');
        return false;
      }

      const targetId = target.id;
      // Check per-target cooldown
      if (this.cooldowns.perTarget[targetId] && now < this.cooldowns.perTarget[targetId]) return false;

      const result = await api('POST', `/game/attack/${targetId}`, null, this.token);
      this.cooldowns.pvp = now + 600;
      this.cooldowns.perTarget[targetId] = now + 43200;
      const won = result.won || result.isDraw === false;
      log(this.name, `PvP vs ${target.name || targetId}: ${result.won ? 'WON' : result.isDraw ? 'DRAW' : 'LOST'} | gold:${result.goldGained || 0}`);
      if (result.character) this.character = result.character;
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
        const features = await api('GET', '/premium/features', null, this.token);
        const feat = features.features?.find(f => f.id === id);
        if (!feat || feat.active || gems < feat.cost) continue;
        await api('POST', '/premium/activate', { featureId: id }, this.token);
        log(this.name, `Activated premium: ${id}`);
        await sleep(500);
      } catch {}
    }
  }

  // ── Gear Shopping ────────────────────────────────────────────────────────
  async shopGear() {
    try {
      const shop = await api('GET', '/shop/items', null, this.token);
      if (!shop.items) return;
      const gold = this.character.gold || 0;
      const gemCost = this.character.gems || 0;
      const slotPriority = { weapon: 1, armor: 2, helmet: 3, boots: 4, ring: 5, shield: 6, amulet: 7, accessory: 8 };
      const inventory = await api('GET', '/inventory', null, this.token);
      const equipped = inventory.equipped || {};
      const buyable = shop.items.filter(i => i.priceType !== 'gems' && i.price <= gold && i.slot && slotPriority[i.slot]);
      const bought = [];
      for (const item of buyable.sort((a, b) => (slotPriority[a.slot] || 99) - (slotPriority[b.slot] || 99))) {
        if (bought.includes(item.slot)) continue;
        const current = equipped[item.slot];
        if (current && current.name === item.name) continue;
        try {
          await api('POST', '/shop/buy', { item: { id: item.id, category: item.slot } }, this.token);
          log(this.name, `Bought ${item.name} (${item.slot})`);
          bought.push(item.slot);
          await sleep(300);
        } catch {}
      }
    } catch {}
  }

  // ── Equip Best Gear ──────────────────────────────────────────────────────
  async equipBest() {
    try {
      const inventory = await api('GET', '/inventory', null, this.token);
      const items = inventory.items || [];
      const equipped = inventory.equipped || {};
      const slots = ['weapon', 'armor', 'helmet', 'shield', 'boots', 'ring', 'amulet', 'accessory'];
      for (const slot of slots) {
        const candidates = items.filter(i => {
          try {
            const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
            return d.slot === slot && !i.equipped;
          } catch { return false; }
        });
        if (candidates.length === 0) continue;
        // Pick the one with highest stat sum
        let best = null, bestSum = -1;
        for (const c of candidates) {
          try {
            const d = typeof c.item_data === 'string' ? JSON.parse(c.item_data) : c.item_data;
            const sum = (d.stats ? Object.values(d.stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0) +
                        (d.wp_stats ? Object.values(d.wp_stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0);
            if (sum > bestSum) { best = c; bestSum = sum; }
          } catch {}
        }
        if (best) {
          try {
            await api('POST', `/equip/${best.id}`, null, this.token);
            log(this.name, `Equipped ${slot} (stat sum: ${bestSum})`);
            await sleep(200);
          } catch {}
        }
      }
    } catch {}
  }

  // ── Gear Upgrades ────────────────────────────────────────────────────────
  async upgradeGear() {
    try {
      const inventory = await api('GET', '/inventory', null, this.token);
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
          await api('POST', `/equipment/upgrade/${item.id}`, { componentId: 'iron_ingot', expectedUpgradeLevel: upLvl }, this.token);
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
    const gold = this.character.gold || 0;
    if (gold < 100) return;

    for (const stat of focus) {
      try {
        await api('POST', '/game/upgrade', { stat }, this.token);
        log(this.name, `Upgraded ${stat}`);
        await sleep(200);
      } catch {}
    }
  }

  // ── Loadout ──────────────────────────────────────────────────────────────
  async setLoadout() {
    try {
      const attackZones = ['chest','chest','solar_plexus','chest','head','solar_plexus','chest','stomach','chest','solar_plexus'];
      const blockZones = ['cross_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','mid_guard','cross_guard','high_guard'];
      await api('POST', '/game/loadout', { attackZones, blockZones }, this.token);
    } catch {}
  }

  // ── Main loop ────────────────────────────────────────────────────────────
  async tick() {
    if (!this.token) await this.ensureAuth();

    // Check tournaments at 21:25-21:35 daily
    const now = new Date();
    const hour = now.getUTCHours() + 1;
    const min = now.getMinutes();
    if (hour === 21 && min >= 25 && min <= 35 && !this.tournamentJoined) {
      await this.joinTournament();
    }
    if (hour === 22) this.tournamentJoined = false;

    await this.collectMission();
    await this.doMission();
    await this.doPvp();
    await this.activatePremium();
    if ((this.character.gold || 0) > 5000) {
      await this.shopGear();
      await this.equipBest();
      await this.upgradeGear();
    }
    await this.upgradeStats();
    await this.setLoadout();
    await this.refreshCharacter();
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     RPG Arena Bot Runner v1.0        ║');
  console.log('╚══════════════════════════════════════╝');

  const bots = ACCOUNTS.map(cfg => new BotAccount(cfg));

  // Initial auth for all bots
  for (const bot of bots) {
    try { await bot.ensureAuth(); } catch (e) { log(bot.name, `Init failed: ${e.message}`); }
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
