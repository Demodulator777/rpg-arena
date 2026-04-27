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

function generateBannerLoot(charLevel) {
    const result = {
        items: [],
        gems: 0,
        gold: 0
    };
    
    const createMaterialDrop = () => {
        const totalWeight = BANNER_DROPS.materials.reduce((sum, m) => sum + m.weight, 0);
        let roll = Math.random() * totalWeight;
        let selected = BANNER_DROPS.materials[0];
        for (const mat of BANNER_DROPS.materials) {
            if (roll < mat.weight) {
                selected = mat;
                break;
            }
            roll -= mat.weight;
        }

        const qty = Math.floor(Math.random() * (selected.qty[1] - selected.qty[0] + 1) + selected.qty[0]);
        return {
            id: selected.id,
            name: selected.name,
            emoji: selected.emoji,
            type: 'raw_mat',
            qty: qty,
            stackable: true,
            rarity: 'common'
        };
    };
    
    if (Math.random() < 0.6) {
        const goldAmount = Math.floor(Math.random() * (BANNER_DROPS.goldRange[1] - BANNER_DROPS.goldRange[0] + 1) + BANNER_DROPS.goldRange[0]);
        result.gold = goldAmount;
    }
    
    if (Math.random() < BANNER_DROPS.gemChance) {
        const gemAmount = Math.floor(Math.random() * (BANNER_DROPS.gemRange[1] - BANNER_DROPS.gemRange[0] + 1) + BANNER_DROPS.gemRange[0]);
        result.gems = gemAmount;
    }
    
    for (let i = 0; i < BANNER_DROPS.itemsCount; i++) {
        result.items.push(createMaterialDrop());
    }
    
    return result;
}

async function saveLootToInventory(db, charId, loot) {
    const addedItems = [];
    
    for (const lootItem of loot.items) {
        if (lootItem.stackable) {
            const existing = await dbGet(db, `
                SELECT * FROM inventory 
                WHERE char_id=? AND item_type=? AND json_extract(item_data,'$.id')=?
            `, [charId, lootItem.type, lootItem.id]);
            
            if (existing) {
                const existingData = JSON.parse(existing.item_data);
                existingData.qty = (existingData.qty || 1) + lootItem.qty;
                await dbRun(db, 'UPDATE inventory SET item_data=? WHERE id=?', [JSON.stringify(existingData), existing.id]);
            } else {
                await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?,?,?)',
                    [charId, lootItem.type, JSON.stringify(lootItem)]);
            }
        } else {
            await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?,?,?)',
                [charId, lootItem.type, JSON.stringify(lootItem)]);
        }
        addedItems.push(lootItem);
    }
    
    if (loot.gold > 0) {
        await dbRun(db, 'UPDATE characters SET gold=gold+? WHERE id=?', [loot.gold, charId]);
    }
    
    if (loot.gems > 0) {
        await dbRun(db, 'UPDATE characters SET gems=gems+? WHERE id=?', [loot.gems, charId]);
    }
    
    return addedItems;
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

const BANNER_DROPS = {
    itemsCount: 5,
    materials: [
        { id: 'iron_ore', name: 'Iron Ore', emoji: '⛏️', weight: 20, qty: [2, 5] },
        { id: 'mithril_ore', name: 'Mithril Ore', emoji: '✨', weight: 15, qty: [2, 4] },
        { id: 'dragon_scale_shard', name: 'Dragon Scale Shard', emoji: '🐉', weight: 15, qty: [1, 3] },
        { id: 'void_shard', name: 'Void Shard', emoji: '🔮', weight: 15, qty: [1, 3] },
        { id: 'arcane_dust', name: 'Arcane Dust', emoji: '🌟', weight: 20, qty: [3, 6] },
        { id: 'shadow_essence', name: 'Shadow Essence', emoji: '👁️', weight: 10, qty: [1, 2] },
        { id: 'legendary_fragment', name: 'Legendary Fragment', emoji: '⭐', weight: 5, qty: [1, 2] }
    ],
    gear: [
        { quality: 'common', chance: 0.30, level: 1 },
        { quality: 'rare', chance: 0.10, level: 1 },
        { quality: 'epic', chance: 0.03, level: 1 }
    ],
    goldRange: [500, 2000],
    gemChance: 0.05,
    gemRange: [1, 3]
};

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
            `SELECT id, level, gems FROM characters WHERE user_id = ?`,
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
        const existing = await dbGet(db, `SELECT 1 FROM player_banner_pulls WHERE user_id = ? AND banner_id = ?`, [req.user.userId, banner.id]);
        
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
            console.log('🎴 WON! Saving full banner set to inventory for user:', req.user.userId);
            await dbRun(db,
                `UPDATE player_banner_pulls SET carry_pulls = 0, won = 1, pull_count = 0, total_pulls = total_pulls WHERE user_id = ? AND banner_id = ?`,
                [req.user.userId, banner.id]
            );
            
            if (char) {
                for (const item of banner.loot_table) {
                    const fullItem = {
                        ...item,
                        type: 'equipment',
                        stackable: false,
                        qty: 1,
                        rarity: 'legendary'
                    };
                    await dbRun(db, 'INSERT INTO inventory (char_id, item_type, item_data) VALUES (?,?,?)',
                        [char.id, 'equipment', JSON.stringify(fullItem)]);
                }
            }
        }
        
        const loot = generateBannerLoot(char.level);
        await saveLootToInventory(db, char.id, loot);
        let newStats;
        try {
            newStats = await getPlayerBannerStats(db, req.user.userId, banner.id);
        } catch {
            newStats = { pullCount: 0, totalPulls: 0, carryPulls: 0, won: false };
        }
        
        res.json({
            won,
            items: loot.items,
            wonItems: won ? banner.loot_table : [],
            gems: gemsAfter,
            goldFound: loot.gold,
            gemsFound: loot.gems,
            stats: {
                pullCount: newStats.pullCount,
                totalPulls: newStats.totalPulls,
                carryPulls: newStats.carryPulls,
                effectivePulls: 0,
                currentOdds: getBannerOdds(0),
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
