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

let countdownInterval = null;

function render(char, data) {
  currentTournament = data;
  if (countdownInterval) clearInterval(countdownInterval);

  if (!data || !data.tournament) {
    document.getElementById('main-content').innerHTML = `
      <div class="no-tournament">
        <p>No tournament active right now.</p>
        <div id="tournament-countdown" style="font-size:1.4rem; font-weight:800; color:#f1c40f; margin:15px 0;">--:--:--</div>
        <p style="font-size:0.85rem; color:#8890a0;">until next tournament registration opens</p>
      </div>`;
    startCountdown(data.nextTournamentTime);
    return;
  }
  const t = data.tournament;
  const participants = data.participants || [];
  const matches = data.matches || [];
  const myEntry = participants.find(p => p.char_id === myCharId);
  const statusClass = `status-${t.status}`;
  const statusLabel = t.status === 'pending' ? '⏳ Open for Registration' : t.status === 'active' ? '⚔️ In Progress' : '🏆 Complete';
  const modeLabel = t.mode === 'normal' ? '🏁 Normal (10 rounds)' : '💀 Deathmatch (unlimited)';
  const roundGroups = {};
  for (const m of matches) {
    if (!roundGroups[m.round_index]) roundGroups[m.round_index] = [];
    roundGroups[m.round_index].push(m);
  }
  const rounds = Object.keys(roundGroups).sort((a,b) => a-b);

  document.getElementById('main-content').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <span class="tournament-status ${statusClass}">${statusLabel}</span>
      <span style="font-size:0.8rem;color:#8890a0;margin-left:8px">${modeLabel}</span>
      <span style="font-size:0.8rem;color:#8890a0;margin-left:8px">${participants.length} fighters</span>
    </div>
    ${t.status === 'pending' ? `
      <div class="join-section">
        <div id="tournament-countdown" style="font-size:1.2rem; font-weight:800; color:#f1c40f; margin-bottom:10px;">--:--:--</div>
        <div class="cost">Entry fee: <strong>500g</strong>${myEntry ? '' : ` · Your gold: <strong>${char.gold}g</strong>`}</div>
        ${myEntry ? '<div style="color:#2ecc71;font-size:0.9rem">✅ You have joined!</div>'
                 : `<button class="btn-join" data-action="joinTournament" ${char.gold < 500 ? 'disabled' : ''}>
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
        ${myEntry ? `<div style="margin-top:6px;font-size:0.95rem;color:#c8d0e0">Your rank: <strong>#${participants.indexOf(myEntry) + 1}</strong> of ${participants.length}</div>` : ''}
      </div>` : ''}
    <div class="tabs">
      <button class="tab-btn active" data-action="tab" data-tab="standings">Standings</button>
      <button class="tab-btn" data-action="tab" data-tab="matches">Matches (${matches.length})</button>
      <button class="tab-btn" data-action="tab" data-tab="history">History</button>
    </div>
    <div id="tab-standings">
      <table class="standings-table">
        <thead><tr><th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Pts</th><th>W</th><th>L</th><th>D</th></tr></thead>
        <tbody>${participants.map((p,i) => `
          <tr class="rank-${i < 3 ? i+1 : ''}">
            <td>${i+1}</td>
            <td>${p.name} ${p.is_npc ? '<span class="npc-badge">NPC</span>' : ''} ${p.char_id === myCharId ? '<span class="me-badge">YOU</span>' : ''}</td>
            <td style="font-size:0.72rem;color:#8890a0">${capitalize(p.class)}</td>
            <td>${p.level}</td>
            <td style="font-weight:700;color:${p.points >= 6 ? '#2ecc71' : p.points >= 3 ? '#f1c40f' : '#c8d0e0'}">${p.points}</td>
            <td style="color:#2ecc71">${p.wins}</td>
            <td style="color:#e74c3c">${p.losses}</td>
            <td style="color:#f1c40f">${p.draws}</td>
          </tr>`).join('')}</tbody>
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
            var bl = m.battle_log; if (typeof bl === 'string') { try { bl = JSON.parse(bl); } catch { bl = []; } } if (!Array.isArray(bl)) bl = [];
            const logStr = escJson(JSON.stringify(bl));
            return `<div class="match-card" data-action="showLog" data-log='${logStr}'>
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
  if (t.status === 'pending') startCountdown(data.nextTournamentTime);
}

function startCountdown(targetTime) {
  if (!targetTime) return;
  const el = document.getElementById('tournament-countdown');
  if (!el) return;

  function update() {
    const now = Date.now();
    const diff = targetTime - now;
    if (diff <= 0) {
      el.textContent = "00:00:00";
      clearInterval(countdownInterval);
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

function escJson(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
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

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
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
      const winner = t.winner_char_id && t.winner_char_id > 0 ? `<span class="h-winner">Player #${t.winner_char_id}</span>` : '<span class="h-npc">NPC</span>';
      return `<div class="history-item" data-action="viewHistory" data-id="${t.id}">
        <span class="h-date">${date}</span>
        <span>${t.participant_count || '?'} fighters</span>
        <span>${t.winner_is_npc ? '<span class="h-npc">NPC win</span>' : winner}</span>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div style="color:#e74c3c;text-align:center">Error loading history</div>`;
  }
}

function esc(s) { return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function viewHistory(tournamentId) {
  const el = document.getElementById('history-list');
  if (!el) return;
  try {
    const data = await api('GET', '/api/tournaments/' + tournamentId);
    const t = data.tournament;
    const participants = data.participants || [];
    const matches = data.matches || [];
    const myEntry = participants.find(p => p.char_id === myCharId);
    var html = '<button class="btn-back" data-action="loadHistory">← Back to History</button>';
    html += '<div style="margin-top:8px;font-size:0.95rem;text-align:center">';
    if (t.winner_is_npc) {
      html += '<span style="color:#8890a0">🤖 NPC won</span>';
    } else {
      var winnerName2 = esc((participants.find(function(p) { return p.char_id === t.winner_char_id; })||{}).name || 'Unknown');
      html += '<span style="color:#e040ff;font-weight:700">🏆 Winner: ' + winnerName2 + '</span>';
    }
    if (myEntry) {
      html += ' · <span style="color:#c8d0e0">Your rank: #' + (participants.indexOf(myEntry) + 1) + ' of ' + participants.length + '</span>';
    }
    html += '</div>';
    html += '<table class="standings-table"><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Pts</th><th>W</th><th>L</th><th>D</th></tr></thead><tbody>';
    participants.forEach(function(p, i) {
      var pName = esc(p.name);
      html += '<tr class="rank-' + (i < 3 ? i + 1 : '') + '"><td>' + (i + 1) + '</td><td>' + pName + (p.is_npc ? ' <span class="npc-badge">NPC</span>' : '') + (p.char_id === myCharId ? ' <span class="me-badge">YOU</span>' : '') + '</td><td style="font-size:0.72rem;color:#8890a0">' + capitalize(p.class) + '</td><td>' + p.level + '</td><td style="font-weight:700;color:' + (p.points >= 6 ? '#2ecc71' : p.points >= 3 ? '#f1c40f' : '#c8d0e0') + '">' + p.points + '</td><td style="color:#2ecc71">' + p.wins + '</td><td style="color:#e74c3c">' + p.losses + '</td><td style="color:#f1c40f">' + p.draws + '</td></tr>';
    });
    html += '</tbody></table>';
    if (matches.length > 0) {
      html += '<h3 style="margin-top:16px">Matches</h3>';
      const roundGroups = {};
      matches.forEach(function(m) {
        if (!roundGroups[m.round_index]) roundGroups[m.round_index] = [];
        roundGroups[m.round_index].push(m);
      });
      var sortedRounds = Object.keys(roundGroups).sort(function(a,b) { return a - b; });
      sortedRounds.forEach(function(r) {
        html += '<div class="matches-section"><div class="round-label">Round ' + (+r + 1) + '</div>';
        roundGroups[r].forEach(function(m) {
          var p1n = esc((participants.find(function(p) { return p.id === m.participant1_id; })||{}).name || '?');
          var p2n = esc((participants.find(function(p) { return p.id === m.participant2_id; })||{}).name || '?');
          var w = null;
          if (m.winner_id) w = participants.find(function(p) { return p.id === m.winner_id; });
          var wn = esc((w||{}).name || 'Unknown');
          var isDraw = m.is_draw;
          var bl2 = m.battle_log; if (typeof bl2 === 'string') { try { bl2 = JSON.parse(bl2); } catch { bl2 = []; } } if (!Array.isArray(bl2)) bl2 = [];
          var logStr = escJson(JSON.stringify(bl2));
          html += '<div class="match-card" data-action="showLog" data-log=\'' + logStr + '\'><div class="match-result">' + p1n + (isDraw ? ' <span class="match-draw"> vs </span>' : (w && w.id === m.participant1_id ? ' <span class="match-winner">▶</span>' : ' <span class="match-loser">▶</span>')) + p2n + '</div><div style="flex:1;text-align:right;font-size:0.75rem">' + (isDraw ? '<span class="match-draw">Draw</span>' : '<span class="match-winner">' + wn + ' wins</span>') + '</div></div>';
        });
        html += '</div>';
      });
    }
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#e74c3c;text-align:center">Error: ' + e.message + '</div>';
  }
}

function showBattleLog(logStr) {
  let log;
  try { log = JSON.parse(logStr); } catch { log = []; }
  document.getElementById('log-lines').innerHTML = (log||[]).map(l => `<div class="log-line">${l}</div>`).join('');
  document.getElementById('battle-log-modal').style.display = 'flex';
}

function closeLog() {
  document.getElementById('battle-log-modal').style.display = 'none';
}

document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'joinTournament') { e.preventDefault(); joinTournament(); }
  else if (action === 'tab') { switchTab(el.dataset.tab); }
  else if (action === 'showLog') { showBattleLog(el.dataset.log); }
  else if (action === 'closeLog') { closeLog(); }
  else if (action === 'viewHistory') { viewHistory(Number(el.dataset.id)); }
  else if (action === 'loadHistory') { loadHistory(); }
});

load();
