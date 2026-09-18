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

// Resolves the primary-key column of a table. Falls back to the first column
// (or 'id') so tables whose PK isn't named `id` (e.g. character_story_progress
// uses character_id) can still be edited/deleted from the admin DB editor.
async function getTablePk(db, safeTable) {
    const info = await db.execute({ sql: `PRAGMA table_info("${safeTable}")`, args: [] });
    const pk = info.rows.find(r => r.pk > 0) || info.rows[0];
    return pk ? String(pk.name) : 'id';
}

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
        const { table, page = 1, filter = '' } = req.body;
        if (!table) return res.status(400).json({ error: 'Table required' });
        
        const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
        const limit = 50;
        const offset = (Number(page) - 1) * limit;
        
        const tableInfo = await db.execute({ sql: `PRAGMA table_info("${safeTable}")`, args: [] });
        const pkCol = tableInfo.rows.find(r => r.pk > 0) || tableInfo.rows[0];
        const pk = pkCol ? String(pkCol.name) : 'id';

        let whereSql = '';
        const args = [];
        if (filter.trim()) {
            const kw = '%' + filter.trim() + '%';
            const nameCols = ['name','char_name','sender_name','receiver_name','attacker_name','defender_name','winner_name','character_name','username','monster_name','item_name','title','description','body','message','action','type','class','role'];
            const existingCols = new Set(tableInfo.rows.map(r => r.name));
            const validCols = nameCols.filter(c => existingCols.has(c));
            if (validCols.length > 0) {
                whereSql = ' WHERE ' + validCols.map(c => `"${c}" LIKE ?`).join(' OR ');
                for (var i = 0; i < validCols.length; i++) args.push(kw);
            }
        }
        
        const countRes = await db.execute({ sql: `SELECT COUNT(*) as total FROM "${safeTable}"${whereSql}`, args });
        const total = countRes.rows[0].total;
        const result = await db.execute({ sql: `SELECT * FROM "${safeTable}"${whereSql} LIMIT ? OFFSET ?`, args: args.concat([limit, offset]) });
        
        res.json({ rows: result.rows, total, page: Number(page), limit, pk });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/update', auth, requireAdmin, async (req, res) => {
    try {
        const db = await getDb();
        const { table, field, value, id, key } = req.body;
        if (!table || !field || id === undefined) return res.status(400).json({ error: 'Missing parameters' });
        
        const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
        const safeField = field.replace(/[^a-zA-Z0-9_]/g, '');
        const safeKey = String(key || 'id').replace(/[^a-zA-Z0-9_]/g, '');
        
        await db.execute({
            sql: `UPDATE "${safeTable}" SET "${safeField}" = ? WHERE "${safeKey}" = ?`,
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
        const { table, id, key } = req.body;
        if (!table || id === undefined) return res.status(400).json({ error: 'Missing parameters' });
        
        const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
        const safeKey = String(key || 'id').replace(/[^a-zA-Z0-9_]/g, '');
        
        await db.execute({
            sql: `DELETE FROM "${safeTable}" WHERE "${safeKey}" = ?`,
            args: [id]
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/execute', auth, requireAdmin, async (req, res) => {
    try {
        const db = await getDb();
        const { sql } = req.body;
        if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'SQL required' });

        const trimmed = sql.trim();
        const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(trimmed);

        if (isSelect) {
            const result = await db.execute(trimmed);
            res.json({ type: 'select', rows: result.rows, columns: result.columns });
        } else {
            const result = await db.execute(trimmed);
            res.json({ type: 'exec', changes: result.changes ?? 0 });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
