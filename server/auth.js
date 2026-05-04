const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}
const { getDb } = require('./db');
const auth = require('./middleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'rpg-arena-secret-change-in-prod';
const MAX_REGISTERED_USERS = 500;
const PASSWORD_RESET_TTL_SEC = 60 * 60; // 1 hour

function normalizeReferralCode(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const e = String(email || '').trim();
  if (!e) return false;
  // Simple validation: good enough for UX; real delivery validation is out of scope.
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(e);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function getPublicBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function getSmtpConfig() {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();

  // Defaults for common Gmail setup; override via env at any time.
  let host = String(process.env.SMTP_HOST || '').trim();
  let port = Number(process.env.SMTP_PORT || 0);
  if (!host && user && user.toLowerCase().endsWith('@gmail.com')) host = 'smtp.gmail.com';
  if (!port && host === 'smtp.gmail.com') port = 465;

  if (!host || !port || !user || !pass || !from) return null;
  return { host, port, user, pass, from };
}

async function sendPasswordResetEmail({ to, username, resetLink }) {
  const cfg = getSmtpConfig();
  if (!cfg || !nodemailer) return { sent: false, reason: 'smtp_not_configured' };

  const secure = cfg.port === 465;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const subject = 'Battle Arena password reset';
  const text =
`Hello ${username || 'fighter'},

We received a request to reset your Battle Arena password.

Reset link (valid for 1 hour):
${resetLink}

If you didn’t request this, you can ignore this email.`;

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
  });

  return { sent: true };
}

router.post('/register', async (req, res) => {
  const { username, password, referralCode, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const db = await getDb();

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

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

    if (normalizedEmail) {
      const existingEmail = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
        args: [normalizedEmail]
      });
      if (existingEmail.rows.length > 0) {
        return res.status(400).json({ error: 'That email is already used by another account.' });
      }
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
      sql: 'INSERT INTO users (username, password_hash, email, assistant_enabled, referred_by_user_id) VALUES (?, ?, ?, ?, ?)',
      args: [username, hash, normalizedEmail || null, 1, referrerUserId]
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
    
    // Create initial session id so single-device enforcement works consistently.
    const sessionId = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    await db.execute({
      sql: 'UPDATE users SET user_session = ? WHERE id = ?',
      args: [JSON.stringify({ id: sessionId, ts: now }), result.lastInsertRowid]
    });

    const token = jwt.sign(
      { userId: result.lastInsertRowid, username, sessionId },
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

    // Generate unique session ID
    const sessionId = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    
    // Generate token with session ID
    const token = jwt.sign(
      { userId: user.id, username: user.username, sessionId }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    // Store session with ID
    await db.execute({
      sql: 'UPDATE users SET user_session = ? WHERE id = ?',
      args: [JSON.stringify({ id: sessionId, ts: now }), user.id]
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

// Set / change optional recovery email
router.post('/email', auth, async (req, res) => {
  try {
    const db = await getDb();
    const emailRaw = req.body?.email;

    // Allow clearing by sending empty string/null
    const normalized = normalizeEmail(emailRaw);
    if (normalized && !isValidEmail(normalized)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Uniqueness enforced by DB index; do a friendly check first for nicer errors.
    if (normalized) {
      const existing = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ? LIMIT 1',
        args: [normalized, req.user.userId]
      });
      if (existing.rows.length) {
        return res.status(400).json({ error: 'That email is already used by another account.' });
      }
    }

    await db.execute({
      sql: 'UPDATE users SET email = ? WHERE id = ?',
      args: [normalized || null, req.user.userId]
    });

    res.json({ success: true, email: normalized || null });
  } catch (e) {
    // If unique index triggers, surface a friendly error.
    if (String(e?.message || '').toLowerCase().includes('unique')) {
      return res.status(400).json({ error: 'That email is already used by another account.' });
    }
    console.error('Email update error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Forgot password: always returns success to avoid account enumeration.
router.post('/password/forgot', async (req, res) => {
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const identifier = String(req.body?.identifier || '').trim();
    if (!identifier) {
      return res.json({ success: true, message: 'If the account exists, a reset link will be sent.' });
    }

    const identEmail = normalizeEmail(identifier);
    const looksLikeEmail = identifier.includes('@');

    const userResult = await db.execute({
      sql: looksLikeEmail
        ? 'SELECT id, username, email FROM users WHERE email = ? COLLATE NOCASE LIMIT 1'
        : 'SELECT id, username, email FROM users WHERE username = ? LIMIT 1',
      args: [looksLikeEmail ? identEmail : identifier]
    });

    const user = userResult.rows?.[0] || null;
    if (!user || !user.email) {
      return res.json({ success: true, message: 'If the account exists, a reset link will be sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(token);
    const expiresAt = now + PASSWORD_RESET_TTL_SEC;

    await db.execute({
      sql: 'UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ?, password_reset_requested_at = ? WHERE id = ?',
      args: [tokenHash, expiresAt, now, user.id]
    });

    const baseUrl = getPublicBaseUrl(req);
    const resetLink = `${baseUrl}/?reset_token=${encodeURIComponent(token)}`;

    const mailResult = await sendPasswordResetEmail({ to: user.email, username: user.username, resetLink })
      .catch((err) => ({ sent: false, reason: 'smtp_error', err }));

    if (!mailResult?.sent) {
      // Fallback: log to server so you can still test end-to-end.
      console.log(`[password-reset] (NOT SENT) user=${user.username} email=${user.email} link=${resetLink} reason=${mailResult?.reason || 'unknown'}`);
      if (mailResult?.err) console.error('[password-reset] send error:', mailResult.err);
    }

    res.json({ success: true, message: 'If the account exists, a reset link will be sent.' });
  } catch (e) {
    console.error('Forgot password error:', e);
    res.json({ success: true, message: 'If the account exists, a reset link will be sent.' });
  }
});

router.post('/password/reset', async (req, res) => {
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token) return res.status(400).json({ error: 'Reset token required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const tokenHash = sha256Hex(token);
    const userResult = await db.execute({
      sql: 'SELECT id, username, password_reset_expires_at FROM users WHERE password_reset_token_hash = ? LIMIT 1',
      args: [tokenHash]
    });
    if (!userResult.rows.length) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    const user = userResult.rows[0];
    const exp = Number(user.password_reset_expires_at || 0);
    if (!exp || exp < now) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    const hash = await bcrypt.hash(newPassword, 10);

    // Force re-login on all devices by replacing the session id.
    const sessionId = crypto.randomBytes(16).toString('hex');
    await db.execute({
      sql: `UPDATE users
            SET password_hash = ?,
                password_reset_token_hash = NULL,
                password_reset_expires_at = NULL,
                password_reset_requested_at = NULL,
                user_session = ?
            WHERE id = ?`,
      args: [hash, JSON.stringify({ id: sessionId, ts: Date.now() }), user.id]
    });

    res.json({ success: true, message: 'Password reset successfully. Please log in again.' });
  } catch (e) {
    console.error('Password reset error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
