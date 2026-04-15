const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'rpg-arena-secret-change-in-prod';
const MAX_REGISTERED_USERS = 500;

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const db = await getDb();

    // Check if username already exists
    const existingUser = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username]
    });
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const userCountResult = await db.execute('SELECT COUNT(*) AS count FROM users');
    const userCount = Number(userCountResult.rows?.[0]?.count || 0);
    if (userCount >= MAX_REGISTERED_USERS) {
      return res.status(403).json({ error: `Server is currently full. The beta user limit of ${MAX_REGISTERED_USERS} accounts has been reached.` });
    }

    const hash = await bcrypt.hash(password, 10);
    
    // Insert new user
    const result = await db.execute({
      sql: 'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      args: [username, hash]
    });
    
    const token = jwt.sign(
      { userId: result.lastInsertRowid, username }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.json({ token, username });
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const db = await getDb();
    const { username, password } = req.body;
    
    // Get user from database
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username]
    });
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Compare password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, username: user.username }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.json({ token, username: user.username });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
