const { createClient } = require('@libsql/client');

let db = null;

async function getDb() {
  if (db) return db;
  
  // Check for required environment variables
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.warn('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables, using local db')
    db = createClient({
      url: "file:local.db",
  });
    
    return db;
  }
  
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  
  // Test connection
  try {
    await db.execute('SELECT 1');
    console.log('✅ Connected to Turso database');
  } catch (error) {
    console.error('❌ Failed to connect to Turso:', error);
    throw error;
  }
  
  return db;
}

module.exports = { getDb };
