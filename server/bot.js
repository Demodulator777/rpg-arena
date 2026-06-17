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
function getDefeats(botName) {
  const mem = loadMemory();
  return mem[botName] || [];
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
      const difficulty = tutorial ? 'easy' : 'hard';
      const spotId = this.getSpotForDifficulty(zone.key, difficulty);
      if (!spotId) return false;

      const size = 'small';

      const result = await api('POST', '/game/missions/start', { zoneId: zone.key, spotId, size }, this.token);
      this.missionEnd = now + (size === 'large' ? 1800 : size === 'medium' ? 1200 : 600);
      // Update mission_points locally if API doesn't return full character
      if (result.character) this.character = result.character;
      else if (this.character) this.character.mission_points = (this.character.mission_points || 0) - (size === 'large' ? 60 : size === 'medium' ? 40 : 20);
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

  // ── Health Potion ──────────────────────────────────────────────────────
  async healIfLow() {
    const hp = this.character.hp_current || 0;
    const maxHp = this.character.hp_max || 100;
    if (hp >= maxHp * 0.3) return false;
    log(this.name, `HP ${hp}/${maxHp} — below 30%, using potion`);
    try {
      const inventory = await api('GET', '/game/inventory', null, this.token);
      const items = inventory.items || [];
      // Find best heal potion (heal_full > heal value)
      const healPots = items.filter(i => {
        if (i.item_type !== 'consumable') return false;
        try {
          const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
          return d.effect?.type === 'heal' || d.effect?.type === 'heal_full';
        } catch { return false; }
      });
      // Sort by heal value descending
      healPots.sort((a, b) => {
        const da = typeof a.item_data === 'string' ? JSON.parse(a.item_data) : a.item_data;
        const db = typeof b.item_data === 'string' ? JSON.parse(b.item_data) : b.item_data;
        const va = da.effect?.type === 'heal_full' ? 99999 : (da.effect?.value || 0);
        const vb = db.effect?.type === 'heal_full' ? 99999 : (db.effect?.value || 0);
        return vb - va;
      });
      if (healPots.length > 0) {
        const result = await api('POST', `/game/use/${healPots[0].id}`, null, this.token);
        if (result.character) this.character = result.character;
        log(this.name, `Used health potion (HP restored)`);
        return true;
      }
      // No potions — try to buy one from shop
      const shop = await api('GET', '/shop/items', null, this.token);
      const pots = (shop.items || []).filter(i =>
        i.priceType === 'gold' && i.price <= (this.character.gold || 0) &&
        i.effect?.type === 'heal' && i.level <= (this.character.level || 1)
      );
      pots.sort((a, b) => (b.effect?.value || 0) - (a.effect?.value || 0));
      if (pots.length > 0) {
        const buyResult = await api('POST', '/shop/buy', { item: { id: pots[0].id, category: 'consumable' } }, this.token);
        if (buyResult.character) this.character = buyResult.character;
        log(this.name, `Bought ${pots[0].name} for ${pots[0].price}g`);
        // Use it
        await sleep(300);
        const inv2 = await api('GET', '/game/inventory', null, this.token);
        const pot = (inv2.items || []).find(i => {
          if (i.item_type !== 'consumable') return false;
          try {
            const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
            return d.id === pots[0].id;
          } catch { return false; }
        });
        if (pot) {
          const r = await api('POST', `/game/use/${pot.id}`, null, this.token);
          if (r.character) this.character = r.character;
          log(this.name, `Used ${pots[0].name}`);
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

      const targetId = target.id;
      const myLevel = this.character.level || 1;
      const tgtLevel = target.level || 1;

      // Level gap check
      if (tgtLevel < myLevel - 10) {
        log(this.name, `Skipping ${target.name} (level ${tgtLevel}) — too far below (I'm ${myLevel})`);
        return false;
      }

      // Per-target cooldown (once per 24h)
      if (this.cooldowns.perTarget[targetId] && now < this.cooldowns.perTarget[targetId]) return false;

      // Defeat memory: skip if we've lost to this player before and aren't much stronger now
      const defeats = getDefeats(this.name);
      const prev = defeats.find(e => e.opponentId === targetId);
      if (prev) {
        const myPower = (this.character.strength || 0) + (this.character.agility || 0) + (this.character.magic || 0) + (this.character.defense || 0) + myLevel * 5;
        const tgtPower = (target.strength || 0) + (target.agility || 0) + (target.magic || 0) + (target.defense || 0) + tgtLevel * 5;
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
      const inventory = await api('GET', '/game/inventory', null, this.token);
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
        let best = null, bestLvl = -1, bestSum = -1;
        for (const item of items) {
          try {
            const d = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (!group.slots.includes(d.slot)) continue;
            const lvl = d.upgradeLevel || item.upgrade_level || 0;
            const sum = (d.stats ? Object.values(d.stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0) +
                        (d.wp_stats ? Object.values(d.wp_stats).reduce((a, b) => a + (Number(b) || 0), 0) : 0);
            if (lvl > bestLvl || (lvl === bestLvl && sum > bestSum)) {
              best = item; bestLvl = lvl; bestSum = sum;
            }
          } catch {}
        }
        // Jewelry slot: always re-equip best (ring/amulet share one slot with separate DB columns)
        const skipEquip = group.name !== 'jewelry' && best && best.equipped;
        if (best && !skipEquip) {
          try {
            await api('POST', `/game/equip/${best.id}`, null, this.token);
            log(this.name, `Equipped ${group.name} +${bestLvl}`);
            await sleep(200);
          } catch {}
        }
      }
    } catch {}
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

  // ── Loadout ──────────────────────────────────────────────────────────────
  async setLoadout() {
    try {
      const attackZones = ['chest','chest','solar_plexus','chest','head','solar_plexus','chest','stomach','chest','solar_plexus'];
      const blockZones = ['cross_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','mid_guard','cross_guard','high_guard'];
      await api('POST', '/game/loadout', { attackZones, blockZones }, this.token);
    } catch {}
  }

  // ── One-time gear setup at startup ──────────────────────────────────────
  async setupGear() {
    try {
      await this.refreshCharacter();
      const gold = this.character.gold || 0;
      if (gold < 5000) {
        log(this.name, `Skipping gear setup — only ${gold} gold`);
        return;
      }
      await this.shopGear();
      await this.equipBest();
      await this.upgradeGear();
      this._gearSetup = true;
      log(this.name, `Gear setup complete`);
    } catch (e) {
      log(this.name, `Gear setup failed: ${e.message}`);
    }
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
    await this.useManaPotion();
    await this.doMission();
    await this.doPvp();
    await this.activatePremium();
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
