const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Init DB first, then start server
getDb().then(() => {
  app.use('/api/auth', require('./auth'));
  app.use('/api/game', require('./routes'));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  const PORT = process.env.PORT || 3009;
  app.listen(PORT, () => console.log(`⚔️  RPG Arena running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
