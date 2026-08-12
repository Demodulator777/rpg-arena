const path = require('path');
const { getDb } = require(path.join(__dirname, '..', 'server', 'db'));
(async () => {
    const db = await getDb();
    const rows = await db.execute(`SELECT * FROM weekly_leaderboard_awards WHERE squad_winner_id>0 OR squad_win_winner_id>0 ORDER BY week_start DESC LIMIT 5`);
    console.log('award rows:', JSON.stringify(rows.rows.map(r => ({ week_start: r.week_start, sd: r.squad_winner_name + ' ' + r.squad_winner_dmg, sw: r.squad_win_winner_name + ' ' + r.squad_win_wins })), null, 2));
})();