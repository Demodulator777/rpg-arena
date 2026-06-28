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
            sql: 'SELECT id, username, user_session, is_admin, is_moderator FROM users WHERE id = ?',
            args: [decoded.userId]
        });
        
        if (!user.rows[0]) {
            return res.status(401).json({ error: 'User not found' });
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
            sessionId,
            tabSession
        };
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};