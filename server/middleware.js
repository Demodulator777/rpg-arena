require('dotenv').config();
const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'rpg-arena-dev-secret');

// Per-user throttle for the log-only IP-change signal (avoids spammy inserts).
const lastIpChangeLog = new Map(); // userId -> last logged ts

module.exports = async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token' });
    
    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get the user from database to ensure they still exist
        const db = await getDb();
        const user = await db.execute({
            sql: 'SELECT id, username, user_session, is_admin, is_moderator, ban_level, ban_expires_at, ban_reason FROM users WHERE id = ?',
            args: [decoded.userId]
        });

        if (!user.rows[0]) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Check ban status BEFORE session check (banned user shouldn't get session errors)
        const banLevel = Number(user.rows[0].ban_level || 0);
        const banExpires = Number(user.rows[0].ban_expires_at || 0);
        const now = Math.floor(Date.now() / 1000);
        if (banLevel >= 3) {
            return res.status(403).json({ error: 'Your account has been permanently banned.', ban: true, ban_level: banLevel, ban_reason: user.rows[0].ban_reason });
        }
        if (banLevel === 2 && banExpires > 0 && now < banExpires) {
            const remaining = Math.ceil((banExpires - now) / 60);
            return res.status(403).json({ error: `Your account is temporarily locked. Try again in ${remaining} minutes.`, ban: true, ban_level: banLevel, ban_reason: user.rows[0].ban_reason, ban_expires_at: banExpires });
        }
        // For level 2 that expired: auto-clear
        if (banLevel === 2 && (banExpires <= 0 || now >= banExpires)) {
            await db.execute({ sql: 'UPDATE users SET ban_level=0, ban_reason=NULL, banned_by=NULL WHERE id=?', args: [user.rows[0].id] });
        }

        // Check if session matches (logout when new login elsewhere)
        const currentSession = user.rows[0].user_session;
        let dbSessionId = null;
        let sessionParsed = false;
        if (currentSession) {
            try {
                const sess = JSON.parse(currentSession);
                dbSessionId = sess.id || null;
                sessionParsed = true;
            } catch {}
        }
        // If the token carries a session but the DB has none, the user logged out
        // (or the session was cleared) -> reject so the old token stops working.
        if (decoded.sessionId && !currentSession) {
            return res.status(401).json({ error: 'Session expired' });
        }
        // If the session id changed, another login happened elsewhere -> reject.
        if (decoded.sessionId && sessionParsed && dbSessionId && decoded.sessionId !== dbSessionId) {
            return res.status(401).json({ error: 'Session expired' });
        }
        // IP-change detection (log-only). IP binding can't tell legit same-ISP
        // churn from token theft, so we never reject — we only record the change
        // as a signal for admin/bot-detection review. Strong session controls
        // (logout invalidation + session-id re-login invalidation) do the real work.
        if (decoded.ip && decoded.userId) {
            const curIp = String(req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || '').trim().slice(0, 45);
            if (curIp && curIp !== decoded.ip) {
                const now = Date.now();
                const last = lastIpChangeLog.get(decoded.userId) || 0;
                if (now - last > 10 * 60 * 1000) {
                    lastIpChangeLog.set(decoded.userId, now);
                    try {
                        db.execute({ sql: `CREATE TABLE IF NOT EXISTS session_ip_changes (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            issued_ip TEXT NOT NULL DEFAULT '',
                            seen_ip TEXT NOT NULL DEFAULT '',
                            created_at INTEGER NOT NULL
                        )` });
                        db.execute({
                            sql: 'INSERT INTO session_ip_changes (user_id, issued_ip, seen_ip, created_at) VALUES (?,?,?,?)',
                            args: [decoded.userId, decoded.ip, curIp, Math.floor(now / 1000)]
                        }).catch(() => {});
                    } catch {}
                    console.warn(`[ip-change] user ${decoded.userId}: issued ${decoded.ip}, seen ${curIp}`);
                }
            }
        }
        
        // Set req.user with userId, username, and tabSession for dungeon tracking
        let tabSession = req.headers['x-tab-session'] || null;
        let sessionId = null;
        if (currentSession) {
            try {
                const sess = JSON.parse(currentSession);
                sessionId = sess.id || null;
            } catch {}
        }
        req.user = { 
            userId: user.rows[0].id, 
            username: user.rows[0].username,
            isAdmin: !!user.rows[0].is_admin,
            isModerator: !!user.rows[0].is_moderator,
            banLevel,
            banWarning: banLevel === 1,
            banReason: banLevel === 1 ? (user.rows[0].ban_reason || null) : null,
            sessionId,
            tabSession
        };

        // Attach ban warning header to every response for level 1
        if (banLevel === 1) {
            const _json = res.json.bind(res);
            res.json = function(body) {
                res.set('X-Ban-Warning', user.rows[0].ban_reason || 'Warning');
                return _json(body);
            };
        }

        // Update IP address and last_online_at on each request (non-blocking)
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || '';
        db.execute({ sql: 'UPDATE users SET ip_address=?, last_online_at=? WHERE id=? AND (ip_address IS NULL OR ip_address!=? OR last_online_at < ?)', args: [clientIp, now, user.rows[0].id, clientIp, now - 60] }).catch(() => {});

        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};
