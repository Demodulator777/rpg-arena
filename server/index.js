const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', process.env.NODE_ENV === 'production' ? '.env.production' : '.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');
console.log('DB URL:', process.env.TURSO_DATABASE_URL ? 'SET' : 'MISSING');
console.log('DB TOKEN:', process.env.TURSO_AUTH_TOKEN ? 'SET' : 'MISSING');
if (process.env.NODE_ENV === 'production') {
    const required = ['JWT_SECRET', 'ADMIN_PANEL_PASSWORD', 'ADMIN_KEY'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
        console.error(`FATAL: Missing required production env vars: ${missing.join(', ')}`);
        console.error('Set them in your environment / .env before starting in production.');
        process.exit(1);
    }
}
const { getDb } = require('./db');

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
// Restrict CORS to explicitly configured origins. Same-origin clients don't
// need CORS at all, so with no CORS_ORIGIN set we send no wildcard header.
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: corsOrigins.length ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Password', 'X-Tab-Session', 'X-Build-Version'],
    maxAge: 86400
}));
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Favicon (silence 404)
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use((req, res, next) => {
const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com https://*.gstatic.com",
    "worker-src 'self'",
    "connect-src 'self' https://accounts.google.com https://*.gstatic.com",
    "img-src 'self' data: blob: https://accounts.google.com https://*.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "media-src 'self'",
    "frame-src https://accounts.google.com",
    "child-src https://accounts.google.com",
    "manifest-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "report-uri /api/csp-violation"
];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Frame protection (belt-and-suspenders alongside CSP frame-ancestors 'none')
  res.setHeader('X-Frame-Options', 'DENY');
  // HSTS — only honored by browsers over HTTPS; harmless if served over HTTP.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Disallow use of browser features we don't need (ZAP/Permissions-Policy scan)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), speaker=(), vibrate=()');
  next();
});

// Import middleware and modules
const auth = require('./middleware');
const skillsModule = require('./skills');
const bannerModule = require('./banner');
const tournamentModule = require('./tournaments');
const { runHourlyHpRegen, runHourlyElementalRegen, ensureBotRunner, autoProcessUpkeep, computeWeeklyLeaderboard, purgeAllOldData, migrateBase64Logos, backfillWeeklyPerformance, processPendingWars, processAutoMissions } = require('./routes');

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
  // Pending profile pics table
  try { await db.execute({ sql: `CREATE TABLE IF NOT EXISTS pending_profile_pics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        char_id INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL
    )`, args: [] }); } catch {}

  // Seed default banner if none exists
  await bannerModule.seedDefaultBanner(db);

  // Quick DB init only — heavy startup runs after server starts
  await tournamentModule.initTournamentTables();
  await tournamentModule.createRelevantBrackets();
  tournamentModule.startTournament();
  tournamentModule.startScheduler();

  // Mount routes - ORDER MATTERS!
  app.use('/api/auth', require('./auth'));
  app.use('/api/game', require('./routes').router);

  // Secrets/settings endpoints (no auth)
  app.get('/api/server/settings', async (req, res) => {
    try {
      const r = await db.execute({ sql: `SELECT key, value FROM server_settings WHERE key IN ('s1_launch_at','beta_open','maintenance_message')`, args: [] });
      const out = {};
      for (const row of r.rows) out[row.key] = row.value === '' ? '' : row.value;
      res.json({ now: Date.now(), ...out });
    } catch (e) { try { res.status(500).json({ error: e.message }); } catch {} }
  });

  // CSP violation reporting endpoint (no auth — browsers send these directly)
  // Must be BEFORE app.use('/api', auth, ...) which would require auth
  app.post('/api/csp-violation', async (req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        // Skip storing when bot detection is disabled
        const botRow = await db.execute({ sql: "SELECT value FROM server_settings WHERE key='bot_detection_enabled'", args: [] });
        if (botRow.rows.length && botRow.rows[0].value === 'false') return;
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
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push('/' + path.relative(publicDir, full).replace(/\\/g, '/'));
      }
    }
    walk(publicDir);
    const js = 'window.ASSET_MANIFEST=' + JSON.stringify(files) + ';';
    fs.writeFileSync(path.join(publicDir, 'asset-manifest.js'), js);
    console.log(`[assets] wrote asset-manifest.js (${files.length} files)`);
  } catch (e) { console.error('[assets] error:', e.message); }

  // Serve static files from /public
  // Profile-pic images must always revalidate — otherwise a newly approved avatar
  // (or its earlier 404) stays cached client-side and other players never see it.
  app.use('/images/profile-pics', express.static(path.join(__dirname, '../public/images/profile-pics'), {
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    },
  }));
  // Squad logos must also revalidate: re-uploads overwrite one canonical filename, and
  // awaiting browsers must pick up the new image (and not cache a deleted one).
  app.use('/images/squads', express.static(path.join(__dirname, '../public/images/squads'), {
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    },
  }));
  app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    // HTML entry pages (index.html) must revalidate every load so new ?v= asset
    // references reach clients instead of being pinned by the 24h cache. Versioned
    // assets (js/css?v=...) keep the long max-age.
    setHeaders: (res, filePath) => {
      if (path.extname(filePath).toLowerCase() === '.html') {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  }));
  // Serve admin panel HTML
  app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/panel.html'));
  });

  // Additional routes (must be before app.listen)
  app.use('/api', auth, tournamentModule.router);
  app.use('/skills', auth, skillsModule.router);
  app.get('/admin/banner', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/banner.html'));
  });
  app.get('/api/game/admin/password', auth, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    res.json({ password: process.env.ADMIN_PANEL_PASSWORD || '' });
  });
  const { router: bannerRouter, admin: adminRouter } = require('./banner');
  app.use('/banner', auth, bannerRouter);
  app.use('/admin/banner', adminRouter);
  const dbAdminRouter = require('./db-admin');
  app.use('/api/db', auth, dbAdminRouter);
  app.get('/api/csp-violations', auth, async (req, res) => {
    try { const r = await db.execute({ sql: 'SELECT * FROM csp_violations ORDER BY id DESC LIMIT 200' }); res.json(r.rows); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js'))
        res.setHeader('Cache-Control', 'max-age=0, must-revalidate');
      if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      if (filePath.endsWith('.data')) res.setHeader('Content-Type', 'application/octet-stream');
    }
  }));
  app.use('/test', express.static(path.join(__dirname, '../public/test'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      if (filePath.endsWith('.data')) res.setHeader('Content-Type', 'application/octet-stream');
    }
  }));

  // Catch-all 404 — must be registered AFTER all routes so Express's built-in
  // finalhandler never runs (finalhandler overwrites our CSP header with
  // `default-src 'none'`, which ZAP flags as a directive with no fallback).
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.status(404).send('404 Not Found');
  });

  const PORT = process.env.PORT || 3009;
  // Start listening BEFORE heavy background work
  server.listen(PORT, () => {
    console.log(`\u2694\uFE0F  RPG Arena running on http://localhost:${PORT}`);
    // WebSocket multiplayer
    const { setupMultiplayer } = require('./multiplayer');
    setupMultiplayer(server);
    console.log(`\uD83C\uDFAE  Multiplayer ready on ws://localhost:${PORT}`);
    // Start bot runner after server is listening
    ensureBotRunner().catch(e => console.error('[BotRunner] init error:', e.message));
  });

  // ── Background startup (runs after server is already listening) ──

  // Resume active tournaments (can be slow with many rounds)
  tournamentModule.resumeActiveTournaments().catch(e => console.error('[Tournament] resume error:', e.message));

  // Migrate existing base64 squad logos to file storage
  migrateBase64Logos().catch(e => console.error('[Logo Migration] error:', e.message));

  // Backfill current week hall of fame performance data from existing battles/messages
  backfillWeeklyPerformance().catch(e => console.error('[WeeklyPerf] backfill error:', e.message));

  // Hourly HP regen — fire at each :00
  const msUntilHour = (60 - new Date().getMinutes()) * 60000 - new Date().getSeconds() * 1000;
  setTimeout(() => {
    runHourlyHpRegen(db).catch(e => console.error('HP regen tick failed:', e.message));
    runHourlyElementalRegen(db).catch(e => console.error('Elemental regen tick failed:', e.message));
    setInterval(() => {
      runHourlyHpRegen(db).catch(e => console.error('HP regen tick failed:', e.message));
      runHourlyElementalRegen(db).catch(e => console.error('Elemental regen tick failed:', e.message));
    }, 3600000);
  }, msUntilHour);

  // Auto upkeep — runs at most once per UTC day. `autoProcessUpkeep` itself
  // guards against re-processing the same day, so a restart mid-day can never
  // re-deduct gold or re-activate the squad stat discount.
  const msUntilNextUpkeepDay = 86400000 - (Date.now() % 86400000);
  setTimeout(() => {
    autoProcessUpkeep(db).catch(e => console.error('[Upkeep] tick failed:', e.message));
    setInterval(() => {
      autoProcessUpkeep(db).catch(e => console.error('[Upkeep] tick failed:', e.message));
    }, 86400000);
  }, msUntilNextUpkeepDay);
  autoProcessUpkeep(db).catch(e => console.error('[Upkeep] init failed:', e.message));

  // Clan wars — auto-advance/resolve pending wars so the global report posts
  // even when no one is viewing the war panel. Tick every 30s.
  setInterval(() => {
    processPendingWars(db).catch(e => console.error('[War] tick failed:', e.message));
  }, 30000);
  processPendingWars(db).catch(e => console.error('[War] init failed:', e.message));

  // Auto-complete missions (Arcane Reservoir premium) — runs server-side so it
  // keeps farming even while the account is logged off. Tick every 10s.
  setInterval(() => {
    processAutoMissions(db).catch(e => console.error('[AutoMission] tick failed:', e.message));
  }, 10000);
  processAutoMissions(db).catch(e => console.error('[AutoMission] init failed:', e.message));

  // Weekly leaderboard — check every 10 minutes if a new week needs awarding
  setInterval(() => {
    computeWeeklyLeaderboard(db).catch(e => console.error('[WeeklyLB] tick failed:', e.message));
  }, 600000);
  computeWeeklyLeaderboard(db).catch(e => console.error('[WeeklyLB] init failed:', e.message));

  // Periodic table cleanup — every hour, purge old rows from fast-growing tables
  setInterval(() => {
    purgeAllOldData(db).catch(e => console.error('[purge] tick failed:', e.message));
  }, 3600000);
  purgeAllOldData(db).catch(e => console.error('[purge] init failed:', e.message));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
