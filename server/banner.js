const express = require('express');
const { getDb } = require('./db');

const router = express.Router();

const BANNER_COST_GEMS = 100;
const PULLS_PER_PURCHASE = 5;

async function dbGet(db, sql, args = []) {
    const r = await db.execute({ sql, args });
    return r.rows[0] ?? null;
}
async function dbRun(db, sql, args = []) {
    return db.execute({ sql, args });
}
async function dbAll(db, sql, args = []) {
    const r = await db.execute({ sql, args });
    return r.rows;
}

function generateBannerItemStats(lootItem, playerLevel) {
    const level = Math.max(1, playerLevel);
    const qualityScale = lootItem.rarity === 'legendary' ? 1.15 :
                       lootItem.rarity === 'epic' ? 1.0 :
                       lootItem.rarity === 'rare' ? 0.8 : 0.6;

    const stats = {};
    const slot = lootItem.type;

    if (slot === 'weapon') {
        stats.dmg_min = Math.floor(Math.min(220, 8 + (level * 1.2 * qualityScale)));
        stats.dmg_max = Math.floor(Math.min(380, 15 + (level * 2.5 * qualityScale)));
        stats.strength = Math.floor(Math.min(90, level * 0.22 * qualityScale));
        stats.agility = Math.floor(Math.min(60, level * 0.15 * qualityScale));
    } else if (slot === 'armor') {
        stats.defense = Math.floor(Math.min(140, level * 0.65 * qualityScale));
        stats.armor = Math.floor(Math.min(70, level * 0.40 * qualityScale));
        stats.hp_max = Math.floor(Math.min(480, level * 1.8 * qualityScale));
    } else if (slot === 'helmet') {
        stats.defense = Math.floor(Math.min(90, level * 0.45 * qualityScale));
        stats.hp_max = Math.floor(Math.min(300, level * 1.2 * qualityScale));
        stats.strength = Math.floor(Math.min(50, level * 0.12 * qualityScale));
    } else if (slot === 'shield') {
        stats.defense = Math.floor(Math.min(110, level * 0.55 * qualityScale));
        stats.armor = Math.floor(Math.min(60, level * 0.30 * qualityScale));
    } else if (slot === 'boots') {
        stats.defense = Math.floor(Math.min(70, level * 0.35 * qualityScale));
        stats.agility = Math.floor(Math.min(50, level * 0.18 * qualityScale));
        stats.hp_max = Math.floor(Math.min(200, level * 0.8 * qualityScale));
    }

    const resistScale = qualityScale * 0.12;
    const resistCap = lootItem.rarity === 'legendary' ? 40 : 34;
    stats.elem_resist_pyro = Math.floor(Math.min(resistCap, level * resistScale));
    stats.elem_resist_water = Math.floor(Math.min(resistCap, level * resistScale));
    stats.elem_resist_wind = Math.floor(Math.min(resistCap, level * resistScale));
    stats.elem_resist_electro = Math.floor(Math.min(resistCap, level * resistScale));

    return stats;
}

const ODDS_TABLE = {
    0: 0.001,  // 0.1%
    1: 0.001,
    2: 0.001,
    3: 0.001,
    4: 0.001,
    5: 0.001,
    6: 0.10,   // 10%
    7: 0.40,   // 40%
    8: 0.45,   // 45%
    9: 0.50,   // 50%
    10: 1.0,   // 100% guaranteed
};

function getBannerOdds(pullCount) {
    if (pullCount >= 10) return 1.0;
    if (pullCount >= 9) return 0.50;
    if (pullCount >= 8) return 0.45;
    if (pullCount >= 7) return 0.40;
    if (pullCount >= 6) return 0.10;
    return 0.001;
}

async function getActiveBanner(db) {
    const now = Math.floor(Date.now() / 1000);
    const banner = await dbGet(db,
        `SELECT id, name, image, start_at, end_at, loot_table FROM banner_events WHERE start_at <= ? AND end_at > ? LIMIT 1`,
        [now, now]
    );
    if (!banner) return null;
    banner.loot_table = banner.loot_table ? JSON.parse(banner.loot_table) : [];
    return banner;
}

const SPITEFORGED_LOOT = [
    { id: 'spiteforged_weapon', name: 'Spiteforged Trident', type: 'weapon', rarity: 'legendary' },
    { id: 'spiteforged_armor', name: 'Carapace of Last Refrains', type: 'armor', rarity: 'legendary' },
    { id: 'spiteforged_helmet', name: 'Crown of Scornful Gaze', type: 'helmet', rarity: 'legendary' },
    { id: 'spiteforged_shield', name: 'Bulwark of Denied Mercy', type: 'shield', rarity: 'legendary' },
    { id: 'spiteforged_boots', name: 'Treads of the Unforgiving', type: 'boots', rarity: 'legendary' },
];

async function seedDefaultBanner(db) {
    const now = Math.floor(Date.now() / 1000);
    const existing = await db.execute({ 
        sql: `SELECT id FROM banner_events WHERE start_at <= ? AND end_at > ?`, 
        args: [now, now] 
    });
    if (existing.rows.length > 0) return;
    
    const weekFromNow = now + 7 * 24 * 60 * 60;
    
    await db.execute({ 
        sql: `INSERT INTO banner_events (name, image, start_at, end_at, loot_table) VALUES (?, ?, ?, ?, ?)`,
        args: ['Spiteforged Banner', 'spiteforged', now, weekFromNow, JSON.stringify(SPITEFORGED_LOOT)]
    });
    console.log('🎴 Seeded default Spiteforged banner');
}

async function getPlayerBannerStats(db, userId, bannerId) {
    const row = await dbGet(db,
        `SELECT pull_count, total_pulls, carry_pulls, won FROM player_banner_pulls WHERE user_id = ? AND banner_id = ?`,
        [userId, bannerId]
    );
    if (!row) {
        return {
            pullCount: 0,
            totalPulls: 0,
            carryPulls: 0,
            won: false,
        };
    }
    return {
        pullCount: row.pull_count || 0,
        totalPulls: row.total_pulls || 0,
        carryPulls: row.carry_pulls || 0,
        won: !!row.won,
    };
}

async function getAllPlayerBannerStats(db, userId) {
    const rows = await dbAll(db,
        `SELECT banner_id, pull_count, total_pulls, carry_pulls, won FROM player_banner_pulls WHERE user_id = ?`,
        [userId]
    );
    return rows.reduce((acc, row) => {
        acc[row.banner_id] = {
            pullCount: row.pull_count || 0,
            totalPulls: row.total_pulls || 0,
            carryPulls: row.carry_pulls || 0,
            won: !!row.won,
        };
        return acc;
    }, {});
}

function rollBannerLoot(banner, playerLevel, won = false) {
    const items = [];
    const itemCount = PULLS_PER_PURCHASE;
    
    for (let i = 0; i < itemCount; i++) {
        const roll = Math.random();
        if (won && i === 0) {
            const guaranteed = banner.loot_table[Math.floor(Math.random() * banner.loot_table.length)];
            const itemStats = generateBannerItemStats(guaranteed, playerLevel);
            items.push({ ...guaranteed, stats: itemStats, guaranteed: true });
        } else if (roll < 0.01) {
            const bannerItem = banner.loot_table[Math.floor(Math.random() * banner.loot_table.length)];
            const itemStats = generateBannerItemStats(bannerItem, playerLevel);
            items.push({ ...bannerItem, stats: itemStats });
        } else if (roll < 0.20) {
            items.push({ type: 'gold', amount: Math.floor(Math.random() * 5000) + 1000, rarity: 'common' });
        } else if (roll < 0.50) {
            items.push({ type: 'gold', amount: Math.floor(Math.random() * 2000) + 500, rarity: 'common' });
        } else {
            items.push({ type: 'dust', amount: Math.floor(Math.random() * 100) + 50, rarity: 'common' });
        }
    }
    return items;
}

// GET /banner/current - Get active banner
router.get('/current', async (req, res) => {
    try {
        const db = await getDb();
        const banner = await getActiveBanner(db);
        if (!banner) {
            return res.json({ active: false, banner: null });
        }
        
        const stats = await getPlayerBannerStats(db, req.user.userId, banner.id);
        const allStats = await getAllPlayerBannerStats(db, req.user.userId);
        const effectivePulls = (stats.carryPulls || 0) + stats.pullCount;
        const currentOdds = getBannerOdds(effectivePulls);
        
        res.json({
            active: true,
            banner: {
                id: banner.id,
                name: banner.name,
                image: banner.image,
                startAt: banner.start_at,
                endAt: banner.end_at,
                lootTable: banner.loot_table,
            },
            stats: {
                pullCount: stats.pullCount,
                totalPulls: stats.totalPulls,
                carryPulls: stats.carryPulls,
                effectivePulls,
                currentOdds,
                won: stats.won,
                nextOddsUp: effectivePulls >= 5 ? getBannerOdds(effectivePulls + 1) : null,
            },
            allStats,
            cost: BANNER_COST_GEMS,
            pullsPerPurchase: PULLS_PER_PURCHASE,
        });
    } catch (e) {
        console.error('Banner GET error:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /banner/pull - Purchase a pull
router.post('/pull', async (req, res) => {
    try {
        const db = await getDb();
        const banner = await getActiveBanner(db);
        if (!banner) {
            return res.status(400).json({ error: 'No active banner event' });
        }
        
        const char = await dbGet(db,
            `SELECT level, gems FROM characters WHERE user_id = ?`,
            [req.user.userId]
        );
        if (!char || char.gems < BANNER_COST_GEMS) {
            return res.status(400).json({ error: 'Not enough gems' });
        }
        
        let stats = await getPlayerBannerStats(db, req.user.userId, banner.id);
        const newPullCount = stats.pullCount + 1;
        const newTotalPulls = stats.totalPulls + 1;
        const effectivePulls = (stats.carryPulls || 0) + newPullCount;
        const odds = getBannerOdds(effectivePulls);
        const won = Math.random() < odds;
        
        const gemsAfter = char.gems - BANNER_COST_GEMS;
        await dbRun(db, `UPDATE characters SET gems = ? WHERE user_id = ?`, [gemsAfter, req.user.userId]);
        
        // Update or insert player banner stats
        const existing = await dbGet(db, `SELECT id FROM player_banner_pulls WHERE user_id = ? AND banner_id = ?`, [req.user.userId, banner.id]);
        
        if (existing) {
            await dbRun(db,
                `UPDATE player_banner_pulls SET pull_count = pull_count + 1, total_pulls = total_pulls + 1, won = CASE WHEN won = 1 THEN 1 ELSE ? END WHERE user_id = ? AND banner_id = ?`,
                [won ? 1 : 0, req.user.userId, banner.id]
            );
        } else {
            await dbRun(db,
                `INSERT INTO player_banner_pulls (user_id, banner_id, pull_count, total_pulls, carry_pulls, won) VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.userId, banner.id, newPullCount, newTotalPulls, 0, won ? 1 : 0]
            );
        }
        
        if (won) {
            await dbRun(db,
                `UPDATE player_banner_pulls SET carry_pulls = 0, won = 1 WHERE user_id = ? AND banner_id = ?`,
                [req.user.userId, banner.id]
            );
            
            await dbRun(db,
                `INSERT INTO inbox_messages (user_id, char_id, sender_name, subject, message_text, reward_json, created_at)
                 VALUES (?, NULL, 'Event Banner', 'Banner Set Won!', ?, ?, ?, ?)`,
                [
                    req.user.userId,
                    `You won the ${banner.name} set!`,
                    JSON.stringify({ bannerName: banner.name, playerLevel: char.level }),
                    JSON.stringify(banner.loot_table.map(item => ({
                        ...item,
                        stats: generateBannerItemStats(item, char.level)
                    }))),
                    Math.floor(Date.now() / 1000),
                ]
            );
        }
        
        const items = rollBannerLoot(banner, char.level, won);
        const newStats = await getPlayerBannerStats(db, req.user.userId, banner.id);
        const newEffectivePulls = (newStats.carryPulls || 0) + newStats.pullCount;
        
        res.json({
            won,
            items,
            gems: gemsAfter,
            stats: {
                pullCount: newStats.pullCount,
                totalPulls: newStats.totalPulls,
                carryPulls: newStats.carryPulls,
                effectivePulls: newEffectivePulls,
                currentOdds: getBannerOdds(newEffectivePulls),
                won: newStats.won,
            },
        });
    } catch (e) {
        console.error('Banner pull error:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /banner/history - Get banner history
router.get('/history', async (req, res) => {
    try {
        const db = await getDb();
const rows = await dbAll(db,
            `SELECT bh.*, be.name as banner_name, be.loot_table
             FROM player_banner_pulls bh
             JOIN banner_events be ON be.id = bh.banner_id
             WHERE bh.user_id = ? AND bh.won = 1
             ORDER BY bh.won DESC`,
            [req.user.userId]
        );
        
        res.json({
            sets: rows.map(row => ({
                bannerId: row.banner_id,
                bannerName: row.banner_name,
                wonAt: row.won_at || row.total_pulls,
                items: row.loot_table ? JSON.parse(row.loot_table) : [],
            })),
        });
    } catch (e) {
        console.error('Banner history error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Migrations
const BANNER_MIGRATIONS = [
    `CREATE TABLE IF NOT EXISTS banner_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        image TEXT,
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        loot_table TEXT DEFAULT '[]',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS player_banner_pulls (
        user_id INTEGER NOT NULL,
        banner_id INTEGER NOT NULL,
        pull_count INTEGER DEFAULT 0,
        total_pulls INTEGER DEFAULT 0,
        carry_pulls INTEGER DEFAULT 0,
        won INTEGER DEFAULT 0,
        won_at INTEGER,
        PRIMARY KEY (user_id, banner_id),
        FOREIGN KEY (banner_id) REFERENCES banner_events(id)
    )`,
];

// ── Admin Routes ──────────────────────────────────────────────────────────────
const adminRouter = express.Router();

// Use same API key as other admin endpoints
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.API_KEY || 'admin-secret-key';

function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

adminRouter.use(adminAuth);

// GET /admin/banner/list - List all banners
adminRouter.get('/list', async (req, res) => {
    try {
        const db = await getDb();
        const banners = await dbAll(db, `SELECT * FROM banner_events ORDER BY start_at DESC`);
        res.json({ banners });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /admin/banner/create - Create new banner
adminRouter.post('/create', async (req, res) => {
    try {
        const { name, image, start_at, end_at, loot_table } = req.body;
        if (!name || !start_at || !end_at) {
            return res.status(400).json({ error: 'Missing required fields: name, start_at, end_at' });
        }
        
        const db = await getDb();
        const lootJson = JSON.stringify(loot_table || []);
        const result = await dbRun(db,
            `INSERT INTO banner_events (name, image, start_at, end_at, loot_table) VALUES (?, ?, ?, ?, ?)`,
            [name, image || null, start_at, end_at, lootJson]
        );
        
        // Get inserted banner - use max id since lastInsertRowid may not work
        const inserted = await dbGet(db, `SELECT id, name, image, start_at, end_at, loot_table FROM banner_events WHERE name = ? ORDER BY id DESC LIMIT 1`, [name]);
        res.json({ success: true, banner: inserted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /admin/banner/:id - Update banner
adminRouter.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, image, start_at, end_at, loot_table } = req.body;
        
        const db = await getDb();
        const updates = [];
        const values = [];
        
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (image !== undefined) { updates.push('image = ?'); values.push(image); }
        if (start_at !== undefined) { updates.push('start_at = ?'); values.push(start_at); }
        if (end_at !== undefined) { updates.push('end_at = ?'); values.push(end_at); }
        if (loot_table !== undefined) { updates.push('loot_table = ?'); values.push(JSON.stringify(loot_table)); }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(id);
        await dbRun(db, `UPDATE banner_events SET ${updates.join(', ')} WHERE id = ?`, values);
        
        const banner = await dbGet(db, `SELECT * FROM banner_events WHERE id = ?`, [id]);
        res.json({ success: true, banner });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /admin/banner/:id - Delete banner
adminRouter.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        await dbRun(db, `DELETE FROM player_banner_pulls WHERE banner_id = ?`, [id]);
        await dbRun(db, `DELETE FROM banner_events WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/banner/:id/stats - Get banner stats
adminRouter.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        
        const totalPulls = await dbGet(db, `SELECT SUM(total_pulls) as total FROM player_banner_pulls WHERE banner_id = ?`, [id]);
        const winners = await dbGet(db, `SELECT COUNT(*) as count FROM player_banner_pulls WHERE banner_id = ? AND won = 1`, [id]);
        const topPullers = await dbAll(db, `
            SELECT p.*, c.name as char_name
            FROM player_banner_pulls p
            JOIN characters c ON c.user_id = p.user_id
            WHERE p.banner_id = ?
            ORDER BY p.total_pulls DESC
            LIMIT 10
        `, [id]);
        
        res.json({
            totalPulls: totalPulls?.total || 0,
            winners: winners?.count || 0,
            topPullers
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = { router, admin: adminRouter, BANNER_MIGRATIONS, seedDefaultBanner };
