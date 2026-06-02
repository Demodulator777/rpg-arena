let currentTournament = null;
let myCharId = null;

function getToken() {
  const t = localStorage.getItem('rpg_token') || sessionStorage.getItem('rpg_token');
  if (!t) { document.getElementById('main-content').innerHTML = '<div class="no-tournament"><p>Please log in first.</p><a href="/" style="color:#e040ff">Go to game</a></div>'; return null; }
  return t;
}

async function api(method, path, body) {
  const token = getToken(); if (!token) throw new Error('No token');
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function load() {
  try {
    const [charData, tournamentData] = await Promise.all([
      api('GET', '/api/game/character'),
      api('GET', '/api/tournaments/current')
    ]);
    myCharId = charData.id;
    render(charData, tournamentData);
  } catch (e) {
    document.getElementById('main-content').innerHTML = `<div class="no-tournament">Error loading: ${e.message}</div>`;
  }
}

function render(char, data) {
  currentTournament = data;
  if (!data || !data.tournament) {
    document.getElementById('main-content').innerHTML = `<div class="no-tournament">No tournament active right now. Check back at 8PM!</div>`;
    return;
  }
  const t = data.tournament;
  const participants = data.participants || [];
  const matches = data.matches || [];
  const myEntry = participants.find(p => p.char_id === myCharId);
  const statusClass = `status-${t.status}`;
  const statusLabel = t.status === 'pending' ? '⏳ Open for Registration' : t.status === 'active' ? '⚔️ In Progress' : '🏆 Complete';
  const roundGroups = {};
  for (const m of matches) {
    if (!roundGroups[m.round_index]) roundGroups[m.round_index] = [];
    roundGroups[m.round_index].push(m);
  }
  const rounds = Object.keys(roundGroups).sort((a,b) => a-b);
  const winners = awaitTournamentHistory();

  document.getElementById('main-content').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <span class="tournament-status ${statusClass}">${statusLabel}</span>
      <span style="font-size:0.8rem;color:#8890a0;margin-left:12px">${participants.length} fighters</span>
    </div>
    ${t.status === 'pending' ? `
      <div class="join-section">
        <div class="cost">Entry fee: <strong>500g</strong>${myEntry ? '' : ` · Your gold: <strong>${char.gold}g</strong>`}</div>
        ${myEntry ? '<div style="color:#2ecc71;font-size:0.9rem">✅ You have joined!</div>'
                 : `<button class="btn-join" onclick="joinTournament()" ${char.gold < 500 ? 'disabled' : ''}>
                      ${char.gold < 500 ? 'Not enough gold' : '⚔️ Join Tournament'}
                    </button>`}
        ${participants.length > 0 ? `
          <div style="margin-top:12px;font-size:0.78rem;color:#8890a0">
            ${participants.length < 8 ? `⚠️ ${8 - participants.length} more fighters needed to start` : '✅ Minimum fighters met!'}
          </div>` : ''}
      </div>` : ''}
    ${t.status === 'active' ? `
      <div style="text-align:center;font-size:0.82rem;color:#8890a0;margin-bottom:16px">
        ⚔️ Battles are being fought every minute — refresh to see results
      </div>` : ''}
    ${t.status === 'complete' ? `
      <div style="text-align:center;margin-bottom:16px">
        ${t.winner_is_npc
          ? `<div style="color:#8890a0;font-size:0.9rem">🤖 NPC won — no player receives tournament win</div>`
          : `<div style="color:#e040ff;font-size:1.1rem;font-weight:700">🏆 Winner: ${participants.find(p => p.char_id === t.winner_char_id)?.name || 'Unknown'}</div>`}
      </div>` : ''}
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab(this,'standings')">Standings</button>
      <button class="tab-btn" onclick="switchTab(this,'matches')">Matches (${matches.length})</button>
      <button class="tab-btn" onclick="switchTab(this,'history')">History</button>
    </div>
    <div id="tab-standings">
      <table class="standings-table">
        <tr><th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Pts</th><th>W</th><th>L</th><th>D</th></tr>
        ${participants.map((p,i) => `
          <tr class="rank-${i < 3 ? i+1 : ''}">
            <td>${i+1}</td>
            <td>${p.name} ${p.is_npc ? '<span class="npc-badge">NPC</span>' : ''} ${p.char_id === myCharId ? '<span class="me-badge">YOU</span>' : ''}</td>
            <td style="font-size:0.72rem;color:#8890a0">${capitalize(p.class)}</td>
            <td>${p.level}</td>
            <td style="font-weight:700;color:${p.points >= 6 ? '#2ecc71' : p.points >= 3 ? '#f1c40f' : '#c8d0e0'}">${p.points}</td>
            <td style="color:#2ecc71">${p.wins}</td>
            <td style="color:#e74c3c">${p.losses}</td>
            <td style="color:#f1c40f">${p.draws}</td>
          </tr>`).join('')}
      </table>
    </div>
    <div id="tab-matches" style="display:none">
      ${rounds.length === 0 ? '<div style="color:#8890a0;text-align:center;padding:20px">No matches yet</div>' : rounds.map(r => `
        <div class="matches-section">
          <div class="round-label">Round ${+r + 1}</div>
          ${roundGroups[r].map(m => {
            const p1 = participants.find(p => p.id === m.participant1_id);
            const p2 = participants.find(p => p.id === m.participant2_id);
            const w = m.winner_id ? participants.find(p => p.id === m.winner_id) : null;
            const winnerName = w?.name || 'Unknown';
            const isDraw = m.is_draw;
            return `<div class="match-card" onclick="showBattleLog(${JSON.stringify(m.battle_log).replace(/"/g,'&quot;')})">
              <div class="match-result">
                ${p1?.name || '?'}
                ${isDraw ? '<span class="match-draw"> vs </span>' : w?.id === m.participant1_id ? '<span class="match-winner">▶</span>' : '<span class="match-loser">▶</span>'}
                ${p2?.name || '?'}
              </div>
              <div style="flex:1;text-align:right;font-size:0.75rem">
                ${isDraw ? '<span class="match-draw">Draw</span>' : `<span class="match-winner">${winnerName} wins</span>`}
              </div>
            </div>`;
          }).join('')}
        </div>`).join('')}
    </div>
    <div id="tab-history" style="display:none">
      <div class="history-section" id="history-list">
        <div style="color:#8890a0;text-align:center;padding:20px">Loading history...</div>
      </div>
    </div>
  `;
  if (t.status === 'complete') loadHistory();
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

async function joinTournament() {
  try {
    const btn = document.querySelector('.btn-join');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining...'; }
    await api('POST', '/api/tournaments/join');
    await load();
  } catch (e) {
    alert(e.message);
    await load();
  }
}

function switchTab(btn, tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-standings').style.display = tab === 'standings' ? 'block' : 'none';
  document.getElementById('tab-matches').style.display = tab === 'matches' ? 'block' : 'none';
  document.getElementById('tab-history').style.display = tab === 'history' ? 'block' : 'none';
  if (tab === 'history') loadHistory();
}

async function loadHistory() {
  const el = document.getElementById('history-list');
  if (!el) return;
  try {
    const list = await api('GET', '/api/tournaments');
    const completed = list.filter(t => t.status === 'complete');
    if (completed.length === 0) {
      el.innerHTML = '<div style="color:#8890a0;text-align:center;padding:20px">No tournaments completed yet</div>';
      return;
    }
    el.innerHTML = completed.map(t => {
      const date = t.ended_at ? new Date(t.ended_at + 'Z').toLocaleDateString() : '?';
      const winner = t.winner_char_id && t.winner_char_id > 0 ? `<span class="h-winner">Player #${t.winner_char_id}</span>` : '<span class="h-npc">NPC (no winner)</span>';
      return `<div class="history-item">
        <span class="h-date">${date}</span>
        <span>${t.participant_count || '?'} fighters</span>
        <span>${t.winner_is_npc ? '<span class="h-npc">NPC win</span>' : winner}</span>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div style="color:#e74c3c;text-align:center">Error loading history</div>`;
  }
}

async function loadWinners() {
  try {
    const list = await api('GET', '/api/tournaments');
    return list.filter(t => t.status === 'complete' && t.winner_char_id === myCharId && !t.winner_is_npc).length;
  } catch { return 0; }
}

function showBattleLog(log) {
  const lines = typeof log === 'string' ? JSON.parse(log) : (log || []);
  document.getElementById('log-lines').innerHTML = lines.map(l => `<div class="log-line">${l}</div>`).join('');
  document.getElementById('battle-log-modal').style.display = 'flex';
}

load();
