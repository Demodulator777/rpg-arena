const { BotAccount } = require('./bot');
const { TestBot } = require('./bot2');

class BotRunner {
  constructor(getDb) {
    this.getDb = getDb;
    this.instances = new Map();
    this._timer = null;
  }

  async init() {
    await this._syncFromDb();
    this._startLoop();
  }

  async _syncFromDb() {
    try {
      const db = await this.getDb();
      const result = await db.execute('SELECT * FROM bot_configs WHERE enabled = 1');
      const rows = result.rows || [];
      const activeIds = new Set();

      for (const row of rows) {
        const id = Number(row.id);
        activeIds.add(id);
        const existing = this.instances.get(id);
        // Restart if version changed or not running
        if (existing) {
          if (existing._scriptVersion === row.script_version) continue;
          this.instances.delete(id);
          console.log(`[BotRunner] Stopped ${row.username} (version switch)`);
        }

        try {
          const BotClass = row.script_version === 'bot2' ? TestBot : BotAccount;
          const extra = row.extra_config ? JSON.parse(row.extra_config) : {};
          const bot = new BotClass({ username: row.username, password: row.password, class: row.class, ...extra });
          bot._configId = id;
          bot._scriptVersion = row.script_version;
          await bot.ensureAuth();
          if (typeof bot.startup === 'function') await bot.startup();
          else if (typeof bot.setupGear === 'function') await bot.setupGear();
          this.instances.set(id, bot);
          console.log(`[BotRunner] Started ${row.username} (v${row.script_version})`);
        } catch (e) {
          console.error(`[BotRunner] Failed to start ${row.username}: ${e.message}`);
        }
      }

      for (const [id] of this.instances) {
        if (!activeIds.has(id)) {
          this.instances.delete(id);
          console.log(`[BotRunner] Stopped bot config ${id}`);
        }
      }
    } catch (e) {
      console.error('[BotRunner] sync error:', e.message);
    }
  }

  _startLoop() {
    const tick = async () => {
      for (const [id, bot] of this.instances) {
        try { await bot.tick(); } catch (e) {
          const logFn = bot.log || console.log;
          if (typeof logFn === 'function') logFn(bot.name || id, `Tick error: ${e.message}`);
          else console.error(`[BotRunner] ${bot.name || id} tick error:`, e.message);
        }
      }
      this._timer = setTimeout(tick, 15000);
    };
    this._timer = setTimeout(tick, 5000);
  }

  getStatus() {
    const list = [];
    for (const [id, bot] of this.instances) {
      list.push({
        id,
        username: bot.name || bot.cfg?.username || '?',
        class: bot.character?.class || bot.cfg?.class || '?',
        version: bot._scriptVersion || '?',
        running: true,
        level: bot.character?.level || 0,
        hp: bot.character?.hp_current || 0,
        hpMax: bot.character?.hp_max || 0,
        gold: bot.character?.gold || 0,
      });
    }
    return list;
  }

  async refresh() {
    await this._syncFromDb();
  }

  shutdown() {
    if (this._timer) clearTimeout(this._timer);
    this.instances.clear();
  }
}

module.exports = BotRunner;
