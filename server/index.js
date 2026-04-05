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
app.use(express.static(path.join(__dirname, '../public')));

// Import the skills module
const skillsModule = require('./skills');
const auth = require('./auth');  // Make sure auth is exported from auth.js

// Init DB first, then start server
getDb().then(() => {
  // Mount routes in correct order - API routes FIRST
  app.use('/api/auth', require('./auth'));
  app.use('/api/game', require('./routes'));
  
  // Mount skills router - this is CRITICAL and must be BEFORE the catch-all
  // Note: auth middleware needs to be properly imported
  app.use('/skills', auth, skillsModule.router);
  
  // Optional: Add a test route to verify skills router is working
  app.get('/skills-test', (req, res) => {
    res.json({ message: 'Skills router test - if you see this, server is working' });
  });

  // Catch-all route for SPA - must be LAST
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  const PORT = process.env.PORT || 3009;
  app.listen(PORT, () => console.log(`⚔️  RPG Arena running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
