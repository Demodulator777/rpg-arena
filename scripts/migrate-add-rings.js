const { getDb } = require('../server/db');

async function migrate() {
    const db = await getDb();
    try {
        console.log('Checking ring columns on characters table...');
        const tableInfo = await db.execute('PRAGMA table_info(characters)');
        const existing = new Set(tableInfo.rows.map(r => r.name));

        const statements = [];
        if (!existing.has('unlocked_rings')) {
            statements.push("ALTER TABLE characters ADD COLUMN unlocked_rings TEXT DEFAULT '[]'");
        }
        if (!existing.has('active_ring')) {
            statements.push('ALTER TABLE characters ADD COLUMN active_ring TEXT');
        }

        if (statements.length === 0) {
            console.log('✅ Nothing to do — both columns already exist.');
            return;
        }

        for (const sql of statements) {
            await db.execute(sql);
            console.log(`   → applied: ${sql}`);
        }
        console.log('✅ Ring columns migration complete.');
    } catch (e) {
        console.error('❌ Migration failed:', e.message);
        process.exitCode = 1;
    }
}

migrate();
