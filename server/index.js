require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
console.log('DB URL:', process.env.TURSO_DATABASE_URL ? 'SET' : 'MISSING');
console.log('DB TOKEN:', process.env.TURSO_AUTH_TOKEN ? 'SET' : 'MISSING');
const { getDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
const cspDirectives = [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "report-uri /api/csp-violation"
];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Import middleware and modules
const auth = require('./middleware');  // This is your middleware
const skillsModule = require('./skills');
const bannerModule = require('./banner');

// Init DB first, then start server
getDb().then(async (db) => {
  // Run banner migrations
  for (const sql of bannerModule.BANNER_MIGRATIONS) {
    try { await db.execute({ sql }); } catch {}
  }
  
  // CSP violations table
  try { await db.execute({ sql: `CREATE TABLE IF NOT EXISTS csp_violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reported_at TEXT NOT NULL DEFAULT (datetime('now')),
    blocked_uri TEXT,
    document_uri TEXT,
    violated_directive TEXT,
    effective_directive TEXT,
    original_policy TEXT,
    source_file TEXT,
    line_number INTEGER,
    column_number INTEGER,
    raw_body TEXT
  )` }); } catch {}
  
  // Seed default banner if none exists
  await bannerModule.seedDefaultBanner(db);
  
  // Mount routes - ORDER MATTERS!
  app.use('/api/auth', require('./auth'));
  app.use('/api/game', require('./routes'));
  
  // Mount skills router with auth middleware
  app.use('/skills', auth, skillsModule.router);
  
  // Admin pages (must be before API router for the HTML route)
  app.get('/admin/banner', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/banner.html'));
  });
  
  // Admin panel (HTML page — auth check happens client-side via JS)
  app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/panel.html'));
  });
  
  // API endpoint to get admin password for password-protected admin pages
  app.get('/api/game/admin/password', auth, async (req, res) => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'baisbetterthanbk';
    res.json({ password: ADMIN_PANEL_PASSWORD });
  });
  
  // Mount banner router with auth middleware
  const { router: bannerRouter, admin: adminRouter, seedDefaultBanner } = require('./banner');
  app.use('/banner', auth, bannerRouter);
  app.use('/admin/banner', adminRouter);
  
  // Database Admin Panel API
  app.use('/api/db', require('./db-admin'));

  // CSP violation reporting endpoint (no auth — browsers send these directly)
  app.post('/api/csp-violation', async (req, res) => {    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = {}; }
        const report = parsed['csp-report'] || parsed.body || parsed;
        await db.execute({
          sql: `INSERT INTO csp_violations (blocked_uri, document_uri, violated_directive, effective_directive, original_policy, source_file, line_number, column_number, raw_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            report['blocked-uri'] || '',
            report['document-uri'] || '',
            report['violated-directive'] || '',
            report['effective-directive'] || '',
            report['original-policy'] || '',
            report['source-file'] || '',
            report['line-number'] || null,
            report['column-number'] || null,
            JSON.stringify(parsed)
          ]
        });
      } catch (e) { console.error('CSP save error:', e); }
    });
    res.status(204).end();
  });
  
  // View CSP violations (auth required)
  app.get('/api/csp-violations', auth, async (req, res) => {
    try {
      const result = await db.execute({
        sql: 'SELECT * FROM csp_violations ORDER BY id DESC LIMIT 200',
      });
      res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  
// Static files - AFTER API routes
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        // Prevent stale client bundles after deploys (especially iOS/WebKit).
        // Keep long-lived caching for images/etc; only disable caching for HTML/CSS/JS.
        if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-store');
        }
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
        if (filePath.endsWith('.data')) {
            res.setHeader('Content-Type', 'application/octet-stream');
        }
    }
}));

// Serve test folder
app.use('/test', express.static(path.join(__dirname, '../public/test'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
        if (filePath.endsWith('.data')) {
            res.setHeader('Content-Type', 'application/octet-stream');
        }
    }
}));
  
  const PORT = process.env.PORT || 3009;
  app.listen(PORT, () => console.log(`⚔️  RPG Arena running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
