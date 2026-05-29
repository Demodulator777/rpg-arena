const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function migrate() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (!tursoUrl || !tursoToken) {
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    process.exit(1);
  }

  console.log('Connecting to Turso...');
  const source = createClient({ url: tursoUrl, authToken: tursoToken });
  await source.execute('SELECT 1');
  console.log('Connected to Turso');

  console.log('Connecting to local db...');
  const localDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  const localPath = 'file:' + path.join(localDir, 'game.db');
  const dest = createClient({ url: localPath });
  await dest.execute('SELECT 1');
  console.log('Connected to local db');

  // Disable FK checks so tables can be created in any order
  await dest.execute('PRAGMA foreign_keys = OFF');

  // Drop all existing objects for a clean slate
  for (const type of ['table', 'index', 'trigger', 'view']) {
    const objs = await dest.execute(
      `SELECT name FROM sqlite_master WHERE type='${type}' AND name NOT LIKE 'sqlite_%'`
    );
    for (const row of objs.rows) {
      await dest.execute(`DROP ${type.toUpperCase()} IF EXISTS "${row.name}"`);
    }
  }

  const tablesReq = await source.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'"
  );
  const tables = tablesReq.rows.map(r => r.name);

  for (const table of tables) {
    console.log(`  Migrating ${table}...`);
    const schemaReq = await source.execute(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`
    );
    const createSql = schemaReq.rows[0].sql;

    try { await dest.execute(createSql); } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }

    const dataReq = await source.execute(`SELECT * FROM "${table}"`);
    const rows = dataReq.rows;
    if (!rows.length) { console.log(`    (empty)`); continue; }

    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(',');
    const colList = cols.map(c => `"${c}"`).join(',');
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

    for (const row of rows) {
      const vals = cols.map(c => row[c]);
      await dest.execute({ sql: insertSql, args: vals });
    }
    console.log(`    ${rows.length} rows`);
  }

  await dest.execute('PRAGMA foreign_keys = ON');
  console.log('\nDone!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
