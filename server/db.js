const { createClient } = require('@libsql/client');
const path = require('path');

let db = null;

async function getDb() {
  if (db) return db;
  
  const isLocal = !process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL.startsWith('file:');
  const url = process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, '..', 'data', 'game.db');
  
  db = createClient({
    url: url,
    authToken: isLocal ? undefined : process.env.TURSO_AUTH_TOKEN,
  });

  if (isLocal) {
    try {
      await db.execute('PRAGMA journal_mode=WAL');
      await db.execute('PRAGMA busy_timeout=5000');
      await db.execute('PRAGMA wal_autocheckpoint=1000');
    } catch (e) { console.warn('⚠️ Could not set SQLite PRAGMAs:', e.message); }
  }

  try {
    await db.execute('SELECT 1');
    console.log(`✅ Connected to database (${isLocal ? 'local' : 'Turso'})`);
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    throw error;
  }
  
  return db;
}

module.exports = { getDb };
