const path = require('path');
const { createClient } = require('@libsql/client');

const BOTS = [
  { username: 'sq_sword_01', class: 'warrior' },
  { username: 'sq_sword_02', class: 'warrior' },
  { username: 'sq_shield_01', class: 'warrior' },
  { username: 'sq_shield_02', class: 'warrior' },
  { username: 'sq_mage_01', class: 'mage' },
  { username: 'sq_mage_02', class: 'mage' },
  { username: 'sq_mage_03', class: 'mage' },
  { username: 'sq_rogue_01', class: 'rogue' },
  { username: 'sq_rogue_02', class: 'rogue' },
  { username: 'sq_rogue_03', class: 'rogue' },
  { username: 'sq_pally_01', class: 'paladin' },
  { username: 'sq_pally_02', class: 'paladin' },
  { username: 'sq_ranger_01', class: 'paladin' },
  { username: 'sq_ranger_02', class: 'paladin' },
  { username: 'sq_war_01', class: 'warrior' },
  { username: 'sq_war_02', class: 'warrior' },
  { username: 'sq_mystic_01', class: 'mage' },
  { username: 'sq_mystic_02', class: 'mage' },
  { username: 'sq_blade_01', class: 'rogue' },
  { username: 'sq_blade_02', class: 'rogue' },
];

const PASSWORD = 'squadbot123';

async function main() {
  const dbUrl = process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, '..', 'data', 'game.db');
  const db = createClient({
    url: dbUrl,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  let inserted = 0;
  for (const bot of BOTS) {
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO bot_configs (username, password, class, script_version, enabled, extra_config, created_at)
              VALUES (?, ?, ?, 'bot2', 1, '{}', strftime('%s','now'))`,
        args: [bot.username, PASSWORD, bot.class],
      });
      inserted++;
      console.log(`  + ${bot.username} (${bot.class})`);
    } catch (e) {
      console.error(`  ! ${bot.username}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${inserted} bot config(s) inserted.`);
  console.log('The bot runner will auto-register users and characters on next tick.');
  await db.close();
}

main().catch(console.error);
