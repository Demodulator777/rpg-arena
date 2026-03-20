const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../game.db');
let _db = null;

function saveDb(sqlDb) {
  const data = sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDb() {
  const SQL = await initSqlJs();
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    sqlDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      gold INTEGER DEFAULT 500,
      strength INTEGER DEFAULT 10,
      defense INTEGER DEFAULT 10,
      agility INTEGER DEFAULT 10,
      magic INTEGER DEFAULT 10,
      hp_max INTEGER DEFAULT 100,
      hp_current INTEGER DEFAULT 100,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      training_stat TEXT DEFAULT NULL,
      training_ends_at INTEGER DEFAULT NULL,
      total_gold_earned INTEGER DEFAULT NULL,
      total_gold_lost INTEGER DEFAULT NULL,
      gems INTEGER DEFAULT NULL,
      total_gems_earned INTEGER DEFAULT NULL,
      total_gems_spent INTEGER DEFAULT NULL,
      elem_resist_pyro INTEGER DEFAULT 0,
      elem_resist_water INTEGER DEFAULT 0,
      elem_resist_wind INTEGER DEFAULT 0,
      elem_resist_electro INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id INTEGER NOT NULL,
      defender_id INTEGER NOT NULL,
      winner_id INTEGER NOT NULL,
      log TEXT NOT NULL,
      fought_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (attacker_id) REFERENCES characters(id),
      FOREIGN KEY (defender_id) REFERENCES characters(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      sent_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (sender_id) REFERENCES characters(id),
      FOREIGN KEY (receiver_id) REFERENCES characters(id)
    );
    CREATE TABLE IF NOT EXISTS missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL,
      zone TEXT NOT NULL,
      mission_name TEXT NOT NULL,
      payout_tier TEXT NOT NULL,
      gold_reward INTEGER NOT NULL,
      xp_reward INTEGER NOT NULL,
      mat_drops TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      collected INTEGER DEFAULT 0,
      FOREIGN KEY (char_id) REFERENCES characters(id)
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      item_data TEXT NOT NULL,
      acquired_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (char_id) REFERENCES characters(id)
    );
    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER UNIQUE NOT NULL,
      weapon_id INTEGER DEFAULT NULL,
      armor_id INTEGER DEFAULT NULL,
      boots_id INTEGER DEFAULT NULL,
      amulet_id INTEGER DEFAULT NULL,
      ring_id INTEGER DEFAULT NULL,
      FOREIGN KEY (char_id) REFERENCES characters(id)
    );
  `);

  saveDb(sqlDb);
  return sqlDb;
}

function wrapDb(sqlDb) {
  return {
    prepare(sql) {
      return {
        run(...params) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          sqlDb.run(sql, flat);
          saveDb(sqlDb);
          return {};
        },
        get(...params) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const results = sqlDb.exec(sql, flat);
          if (!results.length || !results[0].values.length) return undefined;
          const { columns, values } = results[0];
          const row = {};
          columns.forEach((col, i) => { row[col] = values[0][i]; });
          return row;
        },
        all(...params) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const results = sqlDb.exec(sql, flat);
          if (!results.length) return [];
          const { columns, values } = results[0];
          return values.map(row => {
            const obj = {};
            columns.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
          });
        }
      };
    }
  };
}

async function getDb() {
  if (!_db) {
    const raw = await initDb();
    _db = wrapDb(raw);
  }
  return _db;
}

module.exports = { getDb };
