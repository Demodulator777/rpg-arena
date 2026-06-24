const { createClient } = require('@libsql/client');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

async function main() {
  const dbUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(PROJECT_ROOT, 'data', 'game.db')}`;
  const db = createClient({ url: dbUrl });

  const rows = await db.execute(`
    SELECT id, json_extract(item_data, '$.id') AS item_id,
           json_extract(item_data, '$.name') AS item_name,
           json_extract(item_data, '$.slot') AS item_slot,
           json_extract(item_data, '$.weaponType') AS wt
    FROM inventory
    WHERE item_type = 'equipment'
      AND json_extract(item_data, '$.slot') = 'weapon'
      AND weapon_type IS NULL
  `);

  for (const row of rows.rows) {
    console.log(`id=${row.id} item_id=${row.item_id} name=${row.item_name} slot=${row.item_slot} wt=${row.wt}`);
  }

  await db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
