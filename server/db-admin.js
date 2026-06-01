const express = require('express');
const router = express.Router();
const { getDb } = require('./db');
const { dbGet } = require('./routes');
const auth = require('./middleware');

// Admin check helper
const requireAdmin = async (req, res, next) => {
    try {
        const db = await getDb();
        const user = await db.execute({ sql: 'SELECT is_admin FROM users WHERE id = ?', args: [req.user.userId] });
        if (user.rows[0]?.is_admin) {
            next();
        } else {
            res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

router.get('/tables', auth, requireAdmin, async (req, res) => {
    try {
        const db = await getDb();
        const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
        res.json(result.rows.map(r => r.name));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/query', auth, requireAdmin, async (req, res) => {
    try {
        const db = await getDb();
        const { table, page = 1 } = req.body;
        if (!table) return res.status(400).json({ error: 'Table required' });
        
        const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
        const limit = 50;
        const offset = (Number(page) - 1) * limit;
        
        const countRes = await db.execute(`SELECT COUNT(*) as total FROM "${safeTable}"`);
        const total = countRes.rows[0].total;
        const result = await db.execute(`SELECT * FROM "${safeTable}" LIMIT ${limit} OFFSET ${offset}`);
        
        res.json({ rows: result.rows, total, page: Number(page), limit });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/update', auth, requireAdmin, async (req, res) => {
    try {
        const db = await getDb();
        const { table, field, value, id } = req.body;
        if (!table || !field || id === undefined) return res.status(400).json({ error: 'Missing parameters' });
        
        const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
        const safeField = field.replace(/[^a-zA-Z0-9_]/g, '');
        
        await db.execute({
            sql: `UPDATE "${safeTable}" SET "${safeField}" = ? WHERE id = ?`,
            args: [value, id]
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/delete', auth, requireAdmin, async (req, res) => {
    try {
        const db = await getDb();
        const { table, id } = req.body;
        if (!table || id === undefined) return res.status(400).json({ error: 'Missing parameters' });
        
        const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
        
        await db.execute({
            sql: `DELETE FROM "${safeTable}" WHERE id = ?`,
            args: [id]
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
