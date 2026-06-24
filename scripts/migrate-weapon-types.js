// Run: node scripts/migrate-weapon-types.js
// Populates weapon_type column from item_data JSON for all weapon equipment.

const { createClient } = require('@libsql/client');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

async function main() {
  const dbUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(PROJECT_ROOT, 'data', 'game.db')}`;
  const db = createClient({ url: dbUrl });

  // 1. Ensure column exists
  try {
    await db.execute(`ALTER TABLE inventory ADD COLUMN weapon_type TEXT DEFAULT NULL`);
    console.log('✅ Column weapon_type added (or already existed)');
  } catch (e) {
    console.log('ℹ️  Column add skipped:', e.message);
  }

  // 2. Extract weaponType from item_data JSON (covers newly-crafted items that have it)
  const r1 = await db.execute(`
    UPDATE inventory
    SET weapon_type = json_extract(item_data, '$.weaponType')
    WHERE item_type = 'equipment'
      AND weapon_type IS NULL
      AND json_extract(item_data, '$.slot') = 'weapon'
      AND json_extract(item_data, '$.weaponType') IS NOT NULL
  `);
  console.log(`✅ Extracted weaponType from JSON: ${r1.rowsAffected ?? 0} rows`);

  // 3. Hardcode known scythe weapons (Spiteforged Trident, Fang of the Worldpyre)
  const r2 = await db.execute(`
    UPDATE inventory
    SET weapon_type = 'scythe'
    WHERE item_type = 'equipment'
      AND weapon_type IS NULL
      AND json_extract(item_data, '$.slot') = 'weapon'
      AND (
        json_extract(item_data, '$.id') IN ('spiteforged_weapon', 'wyrmflame_weapon')
        OR json_extract(item_data, '$.name') IN ('Spiteforged Trident', 'Fang of the Worldpyre')
      )
  `);
  console.log(`✅ Set scythe for known recipes: ${r2.rowsAffected ?? 0} rows`);

  // 4. Fallback: anything with "scythe" in the name or weaponType in JSON already
  const r3 = await db.execute(`
    UPDATE inventory
    SET weapon_type = 'scythe'
    WHERE item_type = 'equipment'
      AND weapon_type IS NULL
      AND json_extract(item_data, '$.slot') = 'weapon'
      AND json_extract(item_data, '$.weaponType') = 'scythe'
  `);
  console.log(`✅ Fallback scythe from JSON: ${r3.rowsAffected ?? 0} rows`);

  // 5. Summary
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

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
