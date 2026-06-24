// Run: node scripts/migrate-bot-configs.js
// Migrates hardcoded bot accounts from bot.js / bot2.js into the bot_configs table.

const { createClient } = require('@libsql/client');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const BOT_ACCOUNTS = [
  // bot.js (v1) — 8 accounts
  { username: 'bot_warrior', password: 'botpass123', class: 'warrior',  script_version: 'bot', extra_config: '{}' },
  { username: 'bot_mage',    password: 'botpass123', class: 'mage',     script_version: 'bot', extra_config: '{}' },
  { username: 'bot_rogue',   password: 'botpass123', class: 'rogue',    script_version: 'bot', extra_config: '{}' },
  { username: 'bot_paladin', password: 'botpass123', class: 'paladin',  script_version: 'bot', extra_config: '{}' },
  { username: 'bot_ranger',  password: 'botpass123', class: 'paladin',  script_version: 'bot', extra_config: '{}' },
  { username: 'bot_knight',  password: 'botpass123', class: 'warrior',  script_version: 'bot', extra_config: '{}' },
  { username: 'bot_warlock', password: 'botpass123', class: 'mage',     script_version: 'bot', extra_config: '{}' },
  { username: 'bot_shadow',  password: 'botpass123', class: 'rogue',    script_version: 'bot', extra_config: '{}' },

  // bot2.js (v2) — 8 original test bots
  { username: 'b2_warrior', password: 'botpass123', class: 'warrior',  script_version: 'bot2', extra_config: '{}' },
  { username: 'b2_mage',    password: 'botpass123', class: 'mage',     script_version: 'bot2', extra_config: '{}' },
  { username: 'b2_rogue',   password: 'botpass123', class: 'rogue',    script_version: 'bot2', extra_config: '{}' },
  { username: 'b2_paladin', password: 'botpass123', class: 'paladin',  script_version: 'bot2', extra_config: '{}' },
  { username: 'b2_ranger',  password: 'botpass123', class: 'paladin',  script_version: 'bot2', extra_config: '{}' },
  { username: 'b2_knight',  password: 'botpass123', class: 'warrior',  script_version: 'bot2', extra_config: '{}' },
  { username: 'b2_warlock', password: 'botpass123', class: 'mage',     script_version: 'bot2', extra_config: '{}' },
  { username: 'b2_shadow',  password: 'botpass123', class: 'rogue',    script_version: 'bot2', extra_config: '{}' },

  // bot2.js (v2) — 12 epic-name bots
  { username: 'xX_Sh4d0w_Xx',  password: 'botpass123', class: 'rogue',   script_version: 'bot2', extra_config: '{"skipPvp":true,"startBuild":3}' },
  { username: 'Cr1ms0n_R34p3r',password: 'botpass123', class: 'warrior', script_version: 'bot2', extra_config: '{"skipPvp":true}' },
  { username: 'VoïdWalker',    password: 'botpass123', class: 'mage',    script_version: 'bot2', extra_config: '{"skipPvp":true}' },
  { username: 'Lùnar_Tiger',   password: 'botpass123', class: 'rogue',   script_version: 'bot2', extra_config: '{"skipPvp":true,"startBuild":3}' },
  { username: 'Blaze_Fury',    password: 'botpass123', class: 'warrior', script_version: 'bot2', extra_config: '{"skipPvp":true,"startBuild":3}' },
  { username: 'Ragnarök',      password: 'botpass123', class: 'warrior', script_version: 'bot2', extra_config: '{"skipPvp":true}' },
  { username: 'N3cr0m4nc3r',   password: 'botpass123', class: 'mage',    script_version: 'bot2', extra_config: '{"skipPvp":true,"startBuild":3}' },
  { username: 'NïghtHawk42',   password: 'botpass123', class: 'paladin', script_version: 'bot2', extra_config: '{"skipPvp":true}' },
  { username: 'Shadow_Sp1r1t', password: 'botpass123', class: 'rogue',   script_version: 'bot2', extra_config: '{"skipPvp":true}' },
  { username: 'Ärc4nus',       password: 'botpass123', class: 'mage',    script_version: 'bot2', extra_config: '{"skipPvp":true}' },
];

async function main() {
  const dbUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(PROJECT_ROOT, 'data', 'game.db')}`;
  const db = createClient({ url: dbUrl });

  // Ensure table exists
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS bot_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      class TEXT NOT NULL,
      script_version TEXT NOT NULL DEFAULT 'bot2',
      enabled INTEGER NOT NULL DEFAULT 0,
      extra_config TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`);
  } catch (e) { console.log('ℹ️  Table create:', e.message); }

  let inserted = 0, skipped = 0;
  for (const acc of BOT_ACCOUNTS) {
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO bot_configs (username, password, class, script_version, extra_config, enabled) VALUES (?, ?, ?, ?, ?, 0)`,
        args: [acc.username, acc.password, acc.class, acc.script_version, acc.extra_config],
      });
      inserted++;
    } catch (e) {
      if (e.message?.includes('UNIQUE')) { skipped++; }
      else { console.error(`Error inserting ${acc.username}:`, e.message); skipped++; }
    }
  }

  console.log(`✅ Inserted ${inserted} bot configs (${skipped} skipped — likely already exist)`);

  // Summary
  const result = await db.execute('SELECT script_version, COUNT(*) AS cnt FROM bot_configs GROUP BY script_version');
  for (const row of result.rows) {
    console.log(`   ${row.script_version}: ${row.cnt}`);
  }

  await db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
