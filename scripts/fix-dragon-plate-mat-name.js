// One-off data fix: rename 'Dragon Plate' material stacks to 'Dragon Plate Mat'
// so they no longer collide with the Dragon Plate EQUIPMENT icon (dragon-plate.png)
// and instead resolve to dragon-plate-mat.png.
const path = require('path');
const { createClient } = require('@libsql/client');

async function fix(dbFile) {
  const db = createClient({ url: 'file:' + path.join(__dirname, '..', 'data', dbFile) });
  const rows = await db.execute(`SELECT id, item_data FROM inventory WHERE item_type IN ('component','raw_mat') AND item_data LIKE '%Dragon Plate%'`);
  let updated = 0;
  for (const r of rows.rows) {
    const before = String(r.item_data);
    const after = before
      .replace('"name":"Dragon Plate"', '"name":"Dragon Plate Mat"')
      .replace('"name": "Dragon Plate"', '"name": "Dragon Plate Mat"');
    if (after !== before) {
      await db.execute({ sql: 'UPDATE inventory SET item_data=? WHERE id=?', args: [after, r.id] });
      updated++;
    }
  }
  console.log(`${dbFile}: ${rows.rows.length} candidates, ${updated} renamed`);
  db.close();
}

(async () => {
  await fix('game.db');
  await fix('game-server1.db');
})().catch(e => { console.error(e); process.exit(1); });
