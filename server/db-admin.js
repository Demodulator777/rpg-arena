const express = require('express');
const router = express.Router();
const { getDb } = require('./db');

// Basic auth for the admin panel
const adminAuth = (req, res, next) => {
    const password = req.query.password || req.body.password;
    if (password === process.env.ADMIN_PANEL_PASSWORD) {
        next();
    } else {
        res.status(403).send('Forbidden');
    }
};

router.use(adminAuth);

router.get('/', async (req, res) => {
    try {
        const db = await getDb();
        const tablesResult = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
        const tables = tablesResult.rows.map(r => r.name);
        
        let data = [];
        let columns = [];
        const selectedTable = req.query.table;

        if (selectedTable && tables.includes(selectedTable)) {
            const result = await db.execute(`SELECT * FROM "${selectedTable}" LIMIT 100`);
            data = result.rows;
            if (data.length > 0) columns = Object.keys(data[0]);
        }

        res.send(`
            <html>
                <body style="font-family:sans-serif; background:#f4f4f9; padding:20px;">
                    <h1>DB Admin</h1>
                    <div style="display:flex; gap:20px;">
                        <nav style="width:200px; background:#fff; padding:15px; border-radius:8px;">
                            <h3>Tables</h3>
                            ${tables.map(t => `<a href="?table=${t}&password=${req.query.password}" style="display:block; padding:5px 0;">${t}</a>`).join('')}
                        </nav>
                        <div style="flex-grow:1; background:#fff; padding:20px; border-radius:8px;">
                            ${selectedTable ? `<h2>Table: ${selectedTable}</h2>` : '<h3>Select a table</h3>'}
                            <table border="1" style="width:100%; border-collapse:collapse;">
                                <thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                                <tbody>
                                    ${data.map(row => `<tr>${columns.map(c => `<td>${row[c]}</td>`).join('')}</tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

module.exports = router;
