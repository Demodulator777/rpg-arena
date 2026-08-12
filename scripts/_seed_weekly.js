const path = require('path');
const { getDb } = require(path.join(__dirname, '..', 'server', 'db'));
const PREV_WEEK = 1785715200;
(async () => {
    const db = await getDb();
    const cols = [
        'week_start',
        'winner_char_id', 'winner_name', 'winner_class', 'winner_dmg', 'winner_battles', 'reward_sent', 'top10_data',
        'win_winner_char_id', 'win_winner_name', 'win_winner_class', 'win_winner_wins', 'win_winner_battles', 'win_reward_sent', 'win_top10_data',
        'squad_winner_id', 'squad_winner_name', 'squad_winner_tag', 'squad_winner_logo', 'squad_winner_members', 'squad_winner_dmg', 'squad_dmg_reward_sent', 'squad_dmg_top10_data',
        'squad_win_winner_id', 'squad_win_winner_name', 'squad_win_winner_tag', 'squad_win_winner_logo', 'squad_win_winner_members', 'squad_win_wins', 'squad_win_reward_sent', 'squad_win_top10_data',
    ];
    const vals = [
        PREV_WEEK,
        1, 'Forsaken', 'warrior', 50000, 120, 1, '[]',
        2, 'Forsaken', 'mage', 40, 130, 1, '[]',
        55, 'Dark Legion', 'DL', 'data:image/png;base64,AAA', 24, 250000, 1, JSON.stringify([{ squad_id: 55, name: 'Dark Legion', tag: 'DL', member_count: 24, total_dmg: 250000 }, { squad_id: 56, name: 'Stormwatch', tag: 'SW', member_count: 18, total_dmg: 210000 }]),
        56, 'Stormwatch', 'SW', 'data:image/png;base64,BBB', 18, 85, 1, JSON.stringify([{ squad_id: 56, name: 'Stormwatch', tag: 'SW', member_count: 18, total_wins: 85 }]),
    ];
    console.log('columns:', cols.length, 'values:', vals.length);
    const ph = cols.map(() => '?').join(',');
    await db.execute(`INSERT OR REPLACE INTO weekly_leaderboard_awards (${cols.join(',')}) VALUES (${ph})`, vals);
    console.log('Seeded previous-week row', PREV_WEEK);
    const chk = await db.execute('SELECT week_start, squad_winner_name, squad_winner_dmg, squad_dmg_reward_sent, squad_win_winner_name, squad_win_wins, squad_win_reward_sent FROM weekly_leaderboard_awards WHERE week_start=?', [PREV_WEEK]);
    console.log('check:', JSON.stringify(chk.rows));
})();
