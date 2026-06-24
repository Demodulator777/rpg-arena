// Run: node scripts/migrate-weapon-types.js
// Derives weapon_type from item_data JSON field, weapon name, or known recipe overrides.

const { createClient } = require('@libsql/client');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const NAME_PATTERNS = [
  ['scythe',   ['Spiteforged Trident', 'Fang of the Worldpyre', 'Voidborn Scythe']],
  ['dagger',   ['Shadewalker\'s Kiss']],
  ['staff',    []],
  ['bow',      []],
  ['spear',    []],
  ['hammer',   ['Ironclad Warhammer']],
  ['mace',     []],
  ['sword',    ['Abyssal Blade']],
  ['blade',    []],
  ['axe',      []],
];

async function main() {
  const dbUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(PROJECT_ROOT, 'data', 'game.db')}`;
  const db = createClient({ url: dbUrl });

  // Ensure column exists
  try {
    await db.execute(`ALTER TABLE inventory ADD COLUMN weapon_type TEXT DEFAULT NULL`);
    console.log('✅ Column weapon_type added');
  } catch (e) {
    if (e.message?.includes('duplicate column')) console.log('ℹ️  Column already exists');
    else console.log('ℹ️  Column add skipped:', e.message);
  }

  let total = 0;

  // 1. Extract weaponType from JSON field (newly-crafted items)
  const r1 = await db.execute(`
    UPDATE inventory SET weapon_type = json_extract(item_data, '$.weaponType')
    WHERE item_type = 'equipment'
      AND weapon_type IS NULL
      AND json_extract(item_data, '$.slot') = 'weapon'
      AND json_extract(item_data, '$.weaponType') IS NOT NULL
  `);
  total += r1.rowsAffected ?? 0;

  // 2. Derive from name: for each type, match name containing the keyword
  for (const [type, overrides] of NAME_PATTERNS) {
    // Match by keyword in name (e.g. "Scythe" → scythe)
    const rc = await db.execute({
      sql: `UPDATE inventory SET weapon_type = ? WHERE item_type = 'equipment' AND weapon_type IS NULL AND json_extract(item_data, '$.slot') = 'weapon' AND json_extract(item_data, '$.name') LIKE ?`,
      args: [type, `%${type[0].toUpperCase() + type.slice(1)}%`],
    });
    total += rc.rowsAffected ?? 0;

    // Match by specific recipe overrides (e.g. "Spiteforged Trident" → scythe)
    for (const name of overrides) {
      const ro = await db.execute({
        sql: `UPDATE inventory SET weapon_type = ? WHERE item_type = 'equipment' AND weapon_type IS NULL AND json_extract(item_data, '$.slot') = 'weapon' AND (json_extract(item_data, '$.name') = ? OR json_extract(item_data, '$.id') = ?)`,
        args: [type, name, name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')],
      });
      total += ro.rowsAffected ?? 0;
    }
  }

  // 3. Handle weapons with known `id` that don't match by name (recipes with non-standard names)
  const specificOverrides = [
    ['scythe', 'spiteforged_weapon', 'Spiteforged Trident'],
    ['scythe', 'wyrmflame_weapon', 'Fang of the Worldpyre'],
    ['dagger', 'shadewalker_weapon', 'Shadewalker\'s Kiss'],
    ['sword', 'eclipsed_seraph_weapon', 'Fallen Grace'],
    ['hammer', 'ironclad_weapon', 'Ironclad Warhammer'],
    ['spear', 'sentinel_weapon', 'Sentinel Spear'],
  ];
  for (const [type, recipeId, recipeName] of specificOverrides) {
    const rs = await db.execute({
      sql: `UPDATE inventory SET weapon_type = ? WHERE item_type = 'equipment' AND weapon_type IS NULL AND json_extract(item_data, '$.slot') = 'weapon' AND (json_extract(item_data, '$.name') = ? OR json_extract(item_data, '$.id') = ? OR json_extract(item_data, '$.name') LIKE ?)`,
      args: [type, recipeName, recipeId, `%${recipeName.replace(/[^a-z0-9\s]/gi, '').trim()}%`],
    });
    total += rs.rowsAffected ?? 0;
  }

  console.log(`✅ Updated ${total} rows`);

  // Summary
  const summary = await db.execute(`
    SELECT weapon_type, COUNT(*) AS cnt
    FROM inventory
    WHERE item_type = 'equipment' AND json_extract(item_data, '$.slot') = 'weapon'
    GROUP BY weapon_type
    ORDER BY cnt DESC
  `);
  console.log('\n📊 Weapon type summary:');
  for (const row of summary.rows) {
    console.log(`   ${row.weapon_type || '(null)'}: ${row.cnt}`);
  }

  await db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
