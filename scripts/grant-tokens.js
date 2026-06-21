// One-time: grant 1000 dungeon tokens to bot characters (IDs 51-58)
// Usage: node scripts/grant-tokens.js
// Supports TURSO_DATABASE_URL / TURSO_AUTH_TOKEN env vars (like the server)

const { createClient } = require('@libsql/client');
const path = require('path');

const isLocal = !process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL.startsWith('file:');
const url = process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, '..', 'data', 'game.db');
const db = createClient({ url, authToken: isLocal ? undefined : process.env.TURSO_AUTH_TOKEN });

async function main() {
  const result = await db.execute({
    sql: "UPDATE characters SET dungeon_tokens = COALESCE(dungeon_tokens, 0) + 1000 WHERE id BETWEEN 51 AND 58",
    args: []
  });
  console.log(`Updated ${result.rowsAffected} row(s)`);

  const rows = await db.execute({
    sql: "SELECT id, name, dungeon_tokens FROM characters WHERE id BETWEEN 51 AND 58",
    args: []
  });
  for (const row of rows.rows) {
    console.log(`  #${row.id} ${row.name}: ${row.dungeon_tokens} tokens`);
  }
  await db.close();
}

main().catch(console.error);
