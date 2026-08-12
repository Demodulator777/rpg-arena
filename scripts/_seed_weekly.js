const path = require('path');
const { getDb } = require(path.join(__dirname, '..', 'server', 'db'));
const PREV_WEEK = 1785715200; // The synthetic week ID we seeded
(async () => {
    const db = await getDb();
    await db.execute('DELETE FROM weekly_leaderboard_awards WHERE week_start = ?', [PREV_WEEK]);
    console.log('Synthetic row deleted.');
})();
