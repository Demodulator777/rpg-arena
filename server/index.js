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

// Import middleware and modules
const auth = require('./middleware');  // This is your middleware
const skillsModule = require('./skills');

// Init DB first, then start server
getDb().then(() => {
  // Mount routes - ORDER MATTERS!
  app.use('/api/auth', require('./auth'));
  app.use('/api/game', require('./routes'));
  
  // Mount skills router with auth middleware
  app.use('/skills', auth, skillsModule.router);
  
  // Static files - AFTER API routes
  app.use(express.static(path.join(__dirname, '../public')));
  
  // Catch-all route for SPA - MUST BE LAST
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  const PORT = process.env.PORT || 3009;
  app.listen(PORT, () => console.log(`⚔️  RPG Arena running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
