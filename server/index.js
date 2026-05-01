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
    "script-src 'self' 'unsafe-eval'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
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
  
  // Mount banner router with auth middleware
  const { router: bannerRouter, admin: adminRouter, seedDefaultBanner } = require('./banner');
  app.use('/banner', auth, bannerRouter);
  app.use('/admin/banner', adminRouter);
  
// Static files - AFTER API routes
  app.use(express.static(path.join(__dirname, '../public')));
  
  // Serve test folder
  app.use('/test', express.static(path.join(__dirname, '../public/test')));
  
  const PORT = process.env.PORT || 3009;
  app.listen(PORT, () => console.log(`⚔️  RPG Arena running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
