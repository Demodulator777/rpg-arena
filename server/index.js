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

// Favicon (silence 404)
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use((req, res, next) => {
const cspDirectives = [
    "default-src 'self'",
    "script-src 'self'",
    "worker-src 'self'",
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
const auth = require('./middleware');
const skillsModule = require('./skills');
const bannerModule = require('./banner');
const tournamentModule = require('./tournaments');
const { runHourlyHpRegen, ensureBotRunner, autoProcessUpkeep, computeWeeklyLeaderboard } = require('./routes');

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
  
  // Init tournament tables and scheduler
  await tournamentModule.initTournamentTables();
  await tournamentModule.resumeActiveTournaments();
  await tournamentModule.createRelevantBrackets();
  tournamentModule.startTournament();
  tournamentModule.startScheduler();

  // Hourly HP regen — fire at each :00
  const msUntilHour = (60 - new Date().getMinutes()) * 60000 - new Date().getSeconds() * 1000;
  setTimeout(() => {
    runHourlyHpRegen(db).catch(e => console.error('HP regen tick failed:', e.message));
    setInterval(() => {
      runHourlyHpRegen(db).catch(e => console.error('HP regen tick failed:', e.message));
    }, 3600000);
  }, msUntilHour);
  
  // Auto upkeep — check every 60s for due payments
  setInterval(() => {
    autoProcessUpkeep(db).catch(e => console.error('[Upkeep] tick failed:', e.message));
  }, 60000);
  // Fire once on startup too
  autoProcessUpkeep(db).catch(e => console.error('[Upkeep] init failed:', e.message));

  // Weekly leaderboard — check every 10 minutes if a new week needs awarding
  setInterval(() => {
    computeWeeklyLeaderboard(db).catch(e => console.error('[WeeklyLB] tick failed:', e.message));
  }, 600000);
  // Fire once on startup too
  computeWeeklyLeaderboard(db).catch(e => console.error('[WeeklyLB] init failed:', e.message));
  
  // Mount routes - ORDER MATTERS!
  app.use('/api/auth', require('./auth'));
  app.use('/api/game', require('./routes').router);

  // CSP violation reporting endpoint (no auth — browsers send these directly)
  // Must be BEFORE app.use('/api', auth, ...) which would require auth
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

  // Asset manifest for loading screen preload — written as static JSON at startup
  try {
    const fs = require('fs');
    const publicDir = path.join(__dirname, '../public');
    const files = [];
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        const rel = path.relative(publicDir, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (entry.name === 'test') continue;
          walk(fullPath);
        } else {
          files.push('/' + rel);
        }
      }
    }
    walk(publicDir);
    fs.writeFileSync(path.join(publicDir, 'asset-manifest.js'), 'window.ASSET_MANIFEST=' + JSON.stringify(files) + ';');
    console.log('[assets] wrote asset-manifest.js (' + files.length + ' files)');
  } catch (e) {
    console.error('[assets] failed to write asset-manifest.json:', e.message);
  }

  // Tournament routes
  app.use('/api', auth, tournamentModule.router);
  
  // Mount skills router with auth middleware
  app.use('/skills', auth, skillsModule.router);
  
  // Tournament page
  app.get('/tournaments', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/tournaments.html'));
  });
  
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
  const dbAdminRouter = require('./db-admin');
  app.use('/api/db', auth, dbAdminRouter);

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
        // Let service worker cache static assets. Use must-revalidate so browser
        // always checks with server but SW can store and serve from cache.
        if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'max-age=0, must-revalidate');
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
  app.listen(PORT, () => {
    console.log(`⚔️  RPG Arena running on http://localhost:${PORT}`);
    // Start bot runner after server is listening
    ensureBotRunner().catch(e => console.error('[BotRunner] init error:', e.message));
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
