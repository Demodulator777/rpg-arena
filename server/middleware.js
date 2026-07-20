const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'rpg-arena-secret-change-in-prod';

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
        if (currentSession) {
            try {
                const sess = JSON.parse(currentSession);
                // Compare session IDs - if they don't match, another login happened
                const dbSessionId = sess.id || null;
                if (decoded.sessionId && dbSessionId && decoded.sessionId !== dbSessionId) {
                    return res.status(401).json({ error: 'Session expired' });
                }
            } catch {}
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

        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};
