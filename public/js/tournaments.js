let currentTournament = null;
let myCharId = null;
let countdownInterval = null;

function _tContainer() {
  return document.getElementById('tab-tournament') || document.getElementById('main-content');
}

async function _tapi(method, path, body) {
  if (typeof window.api === 'function') {
    const p = path.replace(/^\/api\//, '/');
    return window.api(method, p, body);
  }
  const token = localStorage.getItem('rpg_token') || sessionStorage.getItem('rpg_token');
  if (!token) throw new Error('No token');
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
      _tapi('GET', '/api/game/character'),
      _tapi('GET', '/api/tournaments/current')
    ]);
    myCharId = charData.id;
    render(charData, tournamentData);
  } catch (e) {
    const c = _tContainer();
    if (c) c.innerHTML = `<div class="no-tournament">Error loading: ${e.message}</div>`;
  }
}

function render(char, data) {
  currentTournament = data;
  if (countdownInterval) clearInterval(countdownInterval);

  if (!data || !data.tournament) {
    const c = _tContainer();
    if (!c) return;
    c.innerHTML = `
      <div class="t-banner">
        <div class="t-banner-img"></div>
        <div class="t-banner-overlay"></div>
        <div class="t-banner-content">
          <div class="t-banner-title">Tournament Arena</div>
          <div class="t-banner-sub">The next battle for glory draws near…</div>
        </div>
      </div>
      <div class="no-tournament">
        <span id="tournament-countdown">--:--:--</span>
        <p style="font-size:0.82rem; color:#8890a0; font-family:'IM Fell English',serif; font-style:italic;">until next tournament registration opens</p>
      </div>`;
    startCountdown(data.nextTournamentTime);
    return;
  }
  const t = data.tournament;
  let participants = data.participants || [];
  const matches = data.matches || [];
  const myEntry = participants.find(p => p.char_id === myCharId);
  const statusClass = `status-${t.status}`;
  const statusLabel = t.status === 'pending' ? '⏳ Open for Registration' : t.status === 'active' ? '⚔️ In Progress' : '🏆 Complete';
  const modeLabels = {
    normal: '🏁 Normal (10 rounds)',
    damage: '💥 Damage (highest dealt wins)',
    least_damage: '🛡️ Least Damage Taken wins',
    elimination: '🗡️ Elimination (single-elimination)',
    deathmatch: '💀 Deathmatch (unlimited)',
    no_equip: '⚔️ No Equipment (stats only)',
    all_vs_all: '👥 All vs All (last standing)'
  };
  const modeLabel = modeLabels[t.mode] || t.mode;
  const isDamageMode = t.mode === 'damage' || t.mode === 'least_damage';
  const isAllVsAll = t.mode === 'all_vs_all';

  if (t.battle_log && typeof t.battle_log === 'string') {
    try { t.battle_log = JSON.parse(t.battle_log); } catch {}
  }

  if (isAllVsAll) {
    participants = [...participants].sort((a, b) => {
      if (a.eliminated_round === null) return -1;
      if (b.eliminated_round === null) return 1;
      return b.eliminated_round - a.eliminated_round;
    });
  } else if (t.mode === 'elimination') {
    participants = [...participants].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  } else if (isDamageMode) {
    participants = [...participants].sort((a, b) => t.mode === 'damage'
      ? (b.total_damage_dealt || 0) - (a.total_damage_dealt || 0)
      : (a.total_damage_taken || 0) - (b.total_damage_taken || 0));
  }

  const roundGroups = {};
  for (const m of matches) {
    if (!roundGroups[m.round_index]) roundGroups[m.round_index] = [];
    roundGroups[m.round_index].push(m);
  }
  const rounds = Object.keys(roundGroups).sort((a,b) => a-b);

  function standingsHeaders() {
    if (t.mode === 'damage') return '<th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Dealt</th><th>Taken</th>';
    if (t.mode === 'least_damage') return '<th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Taken</th><th>Dealt</th>';
    if (t.mode === 'all_vs_all') return '<th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Elim.</th><th>W</th><th>L</th>';
    if (t.mode === 'elimination') return '<th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>W</th><th>L</th>';
    return '<th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Pts</th><th>W</th><th>L</th><th>D</th>';
  }
  function standingsRow(p, i) {
    const rankCls = i < 3 ? ` rank-${i+1}` : '';
    const pName = esc(p.name);
    const badges = (p.is_npc ? ' <span class="npc-badge">NPC</span>' : '') + (p.char_id === myCharId ? ' <span class="me-badge">YOU</span>' : '');
    const cls = `style="font-size:0.72rem;color:#8890a0"`;
    if (t.mode === 'damage') {
      return `<tr class="${rankCls}"><td>${i+1}</td><td>${pName}${badges}</td><td ${cls}>${capitalize(p.class)}</td><td>${p.level}</td><td style="font-weight:700;color:#e74c3c">${p.total_damage_dealt||0}</td><td style="color:#f39c12">${p.total_damage_taken||0}</td></tr>`;
    }
    if (t.mode === 'least_damage') {
      return `<tr class="${rankCls}"><td>${i+1}</td><td>${pName}${badges}</td><td ${cls}>${capitalize(p.class)}</td><td>${p.level}</td><td style="font-weight:700;color:#2ecc71">${p.total_damage_taken||0}</td><td style="color:#8890a0">${p.total_damage_dealt||0}</td></tr>`;
    }
    if (t.mode === 'all_vs_all') {
      const elim = p.eliminated_round ? `#${p.eliminated_round}` : '🏆';
      return `<tr class="${rankCls}"><td>${i+1}</td><td>${pName}${badges}</td><td ${cls}>${capitalize(p.class)}</td><td>${p.level}</td><td style="font-weight:700;color:${p.eliminated_round ? '#e74c3c' : '#f1c40f'}">${elim}</td><td style="color:#2ecc71">${p.wins}</td><td style="color:#e74c3c">${p.losses}</td></tr>`;
    }
    if (t.mode === 'elimination') {
      return `<tr class="${rankCls}"><td>${i+1}</td><td>${pName}${badges}</td><td ${cls}>${capitalize(p.class)}</td><td>${p.level}</td><td style="color:#2ecc71">${p.wins||0}</td><td style="color:#e74c3c">${p.losses||0}</td></tr>`;
    }
    return `<tr class="${rankCls}"><td>${i+1}</td><td>${pName}${badges}</td><td ${cls}>${capitalize(p.class)}</td><td>${p.level}</td><td style="font-weight:700;color:${p.points >= 6 ? '#2ecc71' : p.points >= 3 ? '#f1c40f' : '#c8d0e0'}">${p.points}</td><td style="color:#2ecc71">${p.wins}</td><td style="color:#e74c3c">${p.losses}</td><td style="color:#f1c40f">${p.draws}</td></tr>`;
  }

  const c = _tContainer();
  if (!c) return;
  c.innerHTML = `
    <div class="t-banner" style="text-align:center;margin-bottom:20px;position:relative;display:inline-block;width:100%">
      <img src="/images/tournaments/banner.png" alt="" style="display:block;width:486px;max-width:100%;height:auto;margin:0 auto">
      <div class="t-banner-mode" style="position:absolute;left:0;right:0;text-align:center;pointer-events:none;font-family:'Marcellus',serif;font-size:clamp(1.2rem,3.5vw,2rem);font-weight:900;color:#f5e6c8;text-shadow:0 0 40px rgba(244,197,66,0.6),0 0 20px rgba(0,0,0,0.9),0 4px 12px rgba(0,0,0,1);letter-spacing:0.2em;text-transform:uppercase;-webkit-text-stroke:2px rgba(0,0,0,0.8)">${t.mode.replace(/_/g,' ')}</div></div>
    </div>
    <div class="t-header-row">
      <span class="tournament-status ${statusClass}">${statusLabel}</span>
      <span>${participants.length} fighters</span>
    </div>
    <div class="t-divider">⟡</div>
    ${t.status === 'pending' ? `
      <div class="join-section">
        <div id="tournament-countdown">--:--:--</div>
        <div class="cost">Entry fee: <strong>500 GOLD</strong>${myEntry ? '' : ` · Your gold: <strong>${char.gold} GOLD</strong>`}</div>
        ${myEntry
          ? '<div class="joined-badge">✅ Enlisted for Battle</div>'
          : `<button class="btn-join" data-action="joinTournament" ${char.gold < 500 ? 'disabled' : ''}>
               ${char.gold < 500 ? '⚠ Insufficient Gold' : '⚔️ Join Tournament'}
             </button>`}
        ${participants.length > 0 ? `
          <div class="fighters-needed ${participants.length >= 8 ? 'ready' : ''}">
            ${participants.length < 8 ? `⚠ ${8 - participants.length} more warriors needed to commence` : '✅ Minimum fighters assembled!'}
          </div>` : ''}
      </div>` : ''}
    ${t.status === 'active' ? `
      <p class="t-active-notice">⚔ Battles are being fought every minute — refresh to see results</p>` : ''}
    ${t.status === 'complete' ? `
      <div class="t-winner-panel">
        ${t.winner_is_npc
          ? `<div style="color:#8890a0;font-family:'IM Fell English',serif;font-style:italic">🤖 An NPC claimed victory — no player receives the tournament prize</div>`
          : `<div style="font-size:0.72rem;color:var(--t-gold-dim);font-family:'Cinzel',serif;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px">Champion</div>
             <div class="t-winner-name">🏆 ${esc((participants.find(p => p.char_id === t.winner_char_id))?.name || 'Unknown')}</div>`}
        ${myEntry ? `<div class="t-your-rank">Your rank: #${participants.indexOf(myEntry) + 1} of ${participants.length}</div>` : ''}
      </div>` : ''}
    <div class="tabs">
      <button class="tab-btn active" data-action="tournamentTab" data-args='["standings"]'>Standings</button>
      <button class="tab-btn" data-action="tournamentTab" data-args='["matches"]'>Matches (${matches.length})</button>
      <button class="tab-btn" data-action="tournamentTab" data-args='["history"]'>History</button>
    </div>
    <div id="tab-standings">
      <div class="standings-wrap">
        <table class="standings-table">
          <thead><tr>${standingsHeaders()}</tr></thead>
          <tbody>${participants.map((p,i) => standingsRow(p,i)).join('')}</tbody>
        </table>
      </div>
    </div>
    <div id="tab-matches" style="display:none">
      ${rounds.length === 0
        ? (t.battle_log
          ? '<div style="text-align:center;padding:20px"><button class="btn-join" data-action="showAllVsAllLog">👥 View Full Battle Log</button></div>'
          : '<div style="color:#8890a0;text-align:center;padding:20px;font-family:\'IM Fell English\',serif;font-style:italic">No matches yet</div>')
        : rounds.map(r => `
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
            return `<div class="match-card" data-action="showLog" data-args='${JSON.stringify([logStr])}'>
              <div class="match-result">
                ${p1?.name || '?'}
                ${isDraw ? '<span class="match-draw"> vs </span>' : w?.id === m.participant1_id ? '<span class="match-winner"> ▶ </span>' : '<span class="match-loser"> ▶ </span>'}
                ${p2?.name || '?'}
              </div>
              <div style="flex:1;text-align:right;font-size:0.75rem;padding-right:30px">
                ${isDraw ? '<span class="match-draw">Draw</span>' : `<span class="match-winner">${winnerName} wins</span>`}
              </div>
            </div>`;
          }).join('')}
        </div>`).join('')}
    </div>
    <div id="tab-history" style="display:none">
      <div class="history-section" id="history-list">
        <div style="color:#8890a0;text-align:center;padding:20px;font-family:'IM Fell English',serif;font-style:italic">Loading history…</div>
      </div>
    </div>
  `;
  if (t.status === 'complete') tournamentLoadHistory();
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
    await _tapi('POST', '/api/tournaments/join');
    await load();
  } catch (e) {
    alert(e.message);
    await load();
  }
}

function tournamentTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    var a;
    try { a = JSON.parse(b.dataset.args); } catch { a = []; }
    b.classList.toggle('active', a[0] === tab);
  });
  document.getElementById('tab-standings').style.display = tab === 'standings' ? 'block' : 'none';
  document.getElementById('tab-matches').style.display = tab === 'matches' ? 'block' : 'none';
  document.getElementById('tab-history').style.display = tab === 'history' ? 'block' : 'none';
  if (tab === 'history') tournamentLoadHistory();
}

async function tournamentLoadHistory() {
  const el = document.getElementById('history-list');
  if (!el) return;
  try {
    const list = await _tapi('GET', '/api/tournaments');
    const completed = list.filter(t => t.status === 'complete');
    if (completed.length === 0) {
      el.innerHTML = '<div style="color:#8890a0;text-align:center;padding:20px">No tournaments completed yet</div>';
      return;
    }
    el.innerHTML = completed.map(t => {
      const date = t.ended_at ? new Date(t.ended_at + 'Z').toLocaleDateString() : '?';
      const winner = t.winner_name ? `<span class="h-winner">${esc(t.winner_name)}</span>` : '<span class="h-npc">NPC</span>';
      const modeHints = { normal:'🏁', damage:'💥', least_damage:'🛡️', elimination:'🗡️', deathmatch:'💀', no_equip:'⚔️', all_vs_all:'👥' };
      const modeIcon = modeHints[t.mode] || '🏟️';
      return `<div class="history-item" data-action="tournamentViewHistory" data-args='[${t.id}]'>
        <span class="h-date">${date}</span>
        <span>${modeIcon}</span>
        <span>${t.participant_count || '?'} fighters</span>
        <span>${t.winner_is_npc ? '<span class="h-npc">NPC win</span>' : winner}</span>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div style="color:#e74c3c;text-align:center">Error loading history</div>`;
  }
}

function esc(s) { return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function tournamentViewHistory(tournamentId) {
  const el = document.getElementById('history-list');
  if (!el) return;
  try {
    const data = await _tapi('GET', '/api/tournaments/' + tournamentId);
    const t = data.tournament;
    let participants = data.participants || [];
    const matches = data.matches || [];
    const myEntry = participants.find(p => p.char_id === myCharId);
    const isDamageMode = t.mode === 'damage' || t.mode === 'least_damage';
    const isAllVsAll = t.mode === 'all_vs_all';

    if (isAllVsAll) {
      participants = [...participants].sort((a, b) => {
        if (a.eliminated_round === null) return -1;
        if (b.eliminated_round === null) return 1;
        return b.eliminated_round - a.eliminated_round;
      });
    } else if (isDamageMode) {
      participants = [...participants].sort((a, b) => t.mode === 'damage'
        ? (b.total_damage_dealt || 0) - (a.total_damage_dealt || 0)
        : (a.total_damage_taken || 0) - (b.total_damage_taken || 0));
    }

    var html = '<button class="btn-back" data-action="tournamentLoadHistory">← Back to History</button>';
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
    if (isDamageMode) {
      var dmgHdr = t.mode === 'damage'
        ? '<th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Dealt</th><th>Taken</th>'
        : '<th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Taken</th><th>Dealt</th>';
      html += '<div class="standings-wrap"><table class="standings-table"><thead><tr>' + dmgHdr + '</tr></thead><tbody>';
      participants.forEach(function(p, i) {
        var pName = esc(p.name);
        var badges = (p.is_npc ? ' <span class="npc-badge">NPC</span>' : '') + (p.char_id === myCharId ? ' <span class="me-badge">YOU</span>' : '');
        if (t.mode === 'damage') {
          html += '<tr class="rank-' + (i < 3 ? i + 1 : '') + '"><td>' + (i + 1) + '</td><td>' + pName + badges + '</td><td style="font-size:0.72rem;color:#8890a0">' + capitalize(p.class) + '</td><td>' + p.level + '</td><td style="font-weight:700;color:#e74c3c">' + (p.total_damage_dealt || 0) + '</td><td style="color:#f39c12">' + (p.total_damage_taken || 0) + '</td></tr>';
        } else {
          html += '<tr class="rank-' + (i < 3 ? i + 1 : '') + '"><td>' + (i + 1) + '</td><td>' + pName + badges + '</td><td style="font-size:0.72rem;color:#8890a0">' + capitalize(p.class) + '</td><td>' + p.level + '</td><td style="font-weight:700;color:#2ecc71">' + (p.total_damage_taken || 0) + '</td><td style="color:#8890a0">' + (p.total_damage_dealt || 0) + '</td></tr>';
        }
      });
      html += '</tbody></table></div>';
    } else if (isAllVsAll) {
      html += '<div class="standings-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Elim.</th><th>W</th><th>L</th></tr></thead><tbody>';
      participants.forEach(function(p, i) {
        var pName = esc(p.name);
        var elim = p.eliminated_round ? '#' + p.eliminated_round : '🏆';
        var badges = (p.is_npc ? ' <span class="npc-badge">NPC</span>' : '') + (p.char_id === myCharId ? ' <span class="me-badge">YOU</span>' : '');
        html += '<tr class="rank-' + (i < 3 ? i + 1 : '') + '"><td>' + (i + 1) + '</td><td>' + pName + badges + '</td><td style="font-size:0.72rem;color:#8890a0">' + capitalize(p.class) + '</td><td>' + p.level + '</td><td style="font-weight:700;color:' + (p.eliminated_round ? '#e74c3c' : '#f1c40f') + '">' + elim + '</td><td style="color:#2ecc71">' + (p.wins || 0) + '</td><td style="color:#e74c3c">' + (p.losses || 0) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    } else if (t.mode === 'elimination') {
      html += '<div class="standings-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>W</th><th>L</th></tr></thead><tbody>';
      participants.forEach(function(p, i) {
        var pName = esc(p.name);
        var badges = (p.is_npc ? ' <span class="npc-badge">NPC</span>' : '') + (p.char_id === myCharId ? ' <span class="me-badge">YOU</span>' : '');
        html += '<tr class="rank-' + (i < 3 ? i + 1 : '') + '"><td>' + (i + 1) + '</td><td>' + pName + badges + '</td><td style="font-size:0.72rem;color:#8890a0">' + capitalize(p.class) + '</td><td>' + p.level + '</td><td style="color:#2ecc71">' + (p.wins || 0) + '</td><td style="color:#e74c3c">' + (p.losses || 0) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="standings-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Lvl</th><th>Pts</th><th>W</th><th>L</th><th>D</th></tr></thead><tbody>';
      participants.forEach(function(p, i) {
        var pName = esc(p.name);
        html += '<tr class="rank-' + (i < 3 ? i + 1 : '') + '"><td>' + (i + 1) + '</td><td>' + pName + (p.is_npc ? ' <span class="npc-badge">NPC</span>' : '') + (p.char_id === myCharId ? ' <span class="me-badge">YOU</span>' : '') + '</td><td style="font-size:0.72rem;color:#8890a0">' + capitalize(p.class) + '</td><td>' + p.level + '</td><td style="font-weight:700;color:' + (p.points >= 6 ? '#2ecc71' : p.points >= 3 ? '#f1c40f' : '#c8d0e0') + '">' + p.points + '</td><td style="color:#2ecc71">' + p.wins + '</td><td style="color:#e74c3c">' + p.losses + '</td><td style="color:#f1c40f">' + p.draws + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    if (t.mode === 'all_vs_all' && t.battle_log) {
      html += '<h3 style="margin-top:16px">Battle Log</h3>';
      var blStr = typeof t.battle_log === 'string' ? t.battle_log : JSON.stringify(t.battle_log);
      html += '<div style="text-align:center;padding:10px"><button class="btn-join" data-action="showLog" data-args=\'' + escJson(JSON.stringify([blStr])) + '\'>👥 View Full Battle Log</button></div>';
    } else if (matches.length > 0) {
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
          html += '<div class="match-card" data-action="showLog" data-args=\'' + JSON.stringify([logStr]) + '\'><div class="match-result">' + p1n + (isDraw ? ' <span class="match-draw"> vs </span>' : (w && w.id === m.participant1_id ? ' <span class="match-winner">▶</span>' : ' <span class="match-loser">▶</span>')) + p2n + '</div><div style="flex:1;text-align:right;font-size:0.75rem">' + (isDraw ? '<span class="match-draw">Draw</span>' : '<span class="match-winner">' + wn + ' wins</span>') + '</div></div>';
        });
        html += '</div>';
      });
    }
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#e74c3c;text-align:center">Error: ' + e.message + '</div>';
  }
}

function showLog(logStr) {
  let log;
  try { log = JSON.parse(logStr); } catch { log = []; }

  // Inject modal into DOM if not already present
  if (!document.getElementById('battle-log-modal')) {
    const modal = document.createElement('div');
    modal.id = 'battle-log-modal';
    modal.className = 'battle-log-modal';
    modal.innerHTML = `
      <div class="battle-log-content">
        <div class="battle-log-header">
          <span class="battle-log-title">⚔ Battle Log</span>
          <button class="btn-close-log" onclick="closeLog()">✕</button>
        </div>
        <div id="log-lines"></div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeLog(); });
    document.body.appendChild(modal);
  }

  document.getElementById('log-lines').innerHTML =
    (log||[]).map(l => `<div class="log-line">${l}</div>`).join('') ||
    '<div class="log-line" style="opacity:0.4;font-style:italic">No entries recorded.</div>';
  document.getElementById('battle-log-modal').style.display = 'flex';
}

function closeLog() {
  const m = document.getElementById('battle-log-modal');
  if (m) m.style.display = 'none';
}

function showAllVsAllLog() {
  if (!currentTournament || !currentTournament.tournament) return;
  var bl = currentTournament.tournament.battle_log;
  showLog(typeof bl === 'string' ? bl : JSON.stringify(bl));
}

function loadTournamentTab() {
  const c = _tContainer();
  if (!c) return;
  load();
}
window.loadTournamentTab = loadTournamentTab;

// Auto-load for standalone page
if (document.getElementById('tab-tournament') === null) {
  load();
}
