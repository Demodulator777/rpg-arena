const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('./db');
const auth = require('./middleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'rpg-arena-secret-change-in-prod';
const MAX_REGISTERED_USERS = 500;

function normalizeReferralCode(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

router.post('/register', async (req, res) => {
  const { username, password, referralCode } = req.body;
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

    const normalizedReferral = normalizeReferralCode(referralCode);
    let referrerUserId = null;
    if (normalizedReferral) {
      if (normalizedReferral === normalizeReferralCode(username)) {
        return res.status(400).json({ error: 'You cannot use your own username as a referral code.' });
      }
      const referrerResult = await db.execute({
        sql: 'SELECT id FROM users WHERE lower(username) = ?',
        args: [normalizedReferral]
      });
      if (referrerResult.rows.length === 0) {
        return res.status(400).json({ error: 'Referral username not found.' });
      }
      referrerUserId = referrerResult.rows[0].id;
    }

    const hash = await bcrypt.hash(password, 10);
    
    // Insert new user with assistant enabled by default
    const result = await db.execute({
      sql: 'INSERT INTO users (username, password_hash, assistant_enabled, referred_by_user_id) VALUES (?, ?, ?, ?)',
      args: [username, hash, 1, referrerUserId]
    });

    if (referrerUserId) {
      await db.execute({
        sql: `UPDATE users
              SET pending_referral_gold = COALESCE(pending_referral_gold, 0) + 1000,
                  referrals_registered = COALESCE(referrals_registered, 0) + 1
              WHERE id = ?`,
        args: [referrerUserId]
      });
    }
    
    const token = jwt.sign(
      { userId: result.lastInsertRowid, username }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.json({ token, username, referred: !!referrerUserId });
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

    // Always allow login - new session overwrites old (logs off other device)
    
    // Generate token
    const token = jwt.sign(
      { userId: user.id, username: user.username }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    // Store session
    await db.execute({
      sql: 'UPDATE users SET user_session = ? WHERE id = ?',
      args: [JSON.stringify({ ts: Date.now() }), user.id]
    });
    
    // Clear any existing dungeon session (new login invalidates old)
    await db.execute({
      sql: 'UPDATE characters SET dungeon_session = NULL WHERE user_id = ?',
      args: [user.id]
    });
    
    res.json({ token, username: user.username });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', auth, async (req, res) => {
  try {
    const db = await getDb();
    await db.execute({
      sql: 'UPDATE users SET user_session = NULL WHERE id = ?',
      args: [req.user.userId]
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
