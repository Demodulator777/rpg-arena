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
            sql: 'SELECT id, username, user_session FROM users WHERE id = ?',
            args: [decoded.userId]
        });
        
        if (!user.rows[0]) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        // Check if session matches (logout when new login happens)
        const currentSession = user.rows[0].user_session;
        if (currentSession) {
            try {
                const sess = JSON.parse(currentSession);
                // If token was issued before current session, it's invalid
                // decoded.iat is seconds, sess.ts is milliseconds
                if (decoded.iat && sess.ts && (decoded.iat * 1000) < sess.ts) {
                    return res.status(401).json({ error: 'Session expired' });
                }
            } catch {}
        }
        
        // Set req.user with both userId and username
        req.user = { 
            userId: user.rows[0].id, 
            username: user.rows[0].username 
        };
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};
