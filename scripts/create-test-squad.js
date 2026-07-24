const path = require('path');
const { createClient } = require('@libsql/client');

const ACCOUNTS = [
  { username: 'BlazingKnight99',  class: 'warrior' },
  { username: 'ShadowWeaver_X',   class: 'mage' },
  { username: 'NightOwlRogue',    class: 'rogue' },
  { username: 'CrimsonTide42',    class: 'paladin' },
  { username: 'Frostbane_ELITE',  class: 'mage' },
  { username: 'VoidWalkerOG',     class: 'rogue' },
  { username: 'StormChaser_Z',    class: 'mage' },
  { username: 'IronVanguard_7',   class: 'warrior' },
  { username: 'PhantomBladeX',    class: 'rogue' },
  { username: 'DuskHunter_YT',    class: 'paladin' },
  { username: 'EmberFang_23',     class: 'warrior' },
  { username: 'SoulReaper_V2',    class: 'rogue' },
  { username: 'ThunderStrike_GG', class: 'mage' },
  { username: 'ObsidianFury',     class: 'warrior' },
  { username: 'CrystalMage_88',   class: 'mage' },
  { username: 'RavenClaw_BH',     class: 'rogue' },
  { username: 'WildRiftzZ',       class: 'paladin' },
  { username: 'StarSage_PvP',     class: 'mage' },
  { username: 'DarkEmissary',     class: 'paladin' },
  { username: 'BladeDancer_Xx',   class: 'rogue' },
];

const PASSWORD = 'squadtest123';

async function main() {
  const dbUrl = process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, '..', 'data', 'game.db');
  const db = createClient({
    url: dbUrl,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  let inserted = 0;
  for (const acc of ACCOUNTS) {
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO bot_configs (username, password, class, script_version, enabled, extra_config, created_at)
              VALUES (?, ?, ?, 'bot2', 1, '{}', strftime('%s','now'))`,
        args: [acc.username, PASSWORD, acc.class],
      });
      inserted++;
      console.log(`  + ${acc.username} (${acc.class})`);
    } catch (e) {
      console.error(`  ! ${acc.username}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${inserted} account(s) inserted.`);
  console.log('Bot runner will auto-register users and characters on the next tick.');
  await db.close();
}

main().catch(console.error);
