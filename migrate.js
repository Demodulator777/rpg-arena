const initSqlJs = require('sql.js');
const fs = require('fs');

const DB_FILE = './game.db';

async function addGemsColumns() {
    try {
        const SQL = await initSqlJs();
        const fileData = fs.readFileSync(DB_FILE);
        const db = new SQL.Database(fileData);

        // Check and add gems column
        const stmt = db.prepare("PRAGMA table_info(characters)");
        const columns = [];
        while (stmt.step()) {
            columns.push(stmt.getAsObject());
        }
        stmt.free();

        const hasGems = columns.some(col => col.name === 'gems');

        if (!hasGems) {
            console.log('Adding premium currency columns...');
            db.run("ALTER TABLE characters ADD COLUMN gems INTEGER DEFAULT 0");
            db.run("ALTER TABLE characters ADD COLUMN total_gems_earned INTEGER DEFAULT 0");
            db.run("ALTER TABLE characters ADD COLUMN total_gems_spent INTEGER DEFAULT 0");

            // Save the database
            const data = db.export();
            fs.writeFileSync(DB_FILE, Buffer.from(data));
            console.log('Migration complete!');
        } else {
            console.log('Premium currency columns already exist.');
        }

    } catch (err) {
        console.error('Migration error:', err);
    }
}

addGemsColumns();