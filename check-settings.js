const { createClient } = require('@libsql/client');
const path = require('path');
const db = createClient({ url: 'file:' + path.join(process.cwd(), 'data', 'game.db') });
(async () => {
  const t = await db.execute('SELECT sql FROM sqlite_master WHERE type="table" AND name="server_settings"');
  console.log('SCHEMA:', JSON.stringify(t.rows));
  const r = await db.execute('SELECT * FROM server_settings');
  console.log('ROWS:', JSON.stringify(r.rows));
  // test insert/replace
  await db.execute('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)', ['spirit_beast_enabled', 'true']);
  const r2 = await db.execute('SELECT * FROM server_settings');
  console.log('AFTER WRITE true:', JSON.stringify(r2.rows));
  await db.execute('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)', ['spirit_beast_enabled', 'false']);
  const r3 = await db.execute('SELECT * FROM server_settings');
  console.log('AFTER WRITE false:', JSON.stringify(r3.rows));
})().catch(e => console.error('ERR', e.message));
