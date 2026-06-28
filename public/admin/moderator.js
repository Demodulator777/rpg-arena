var API = function(path) {
    var token = localStorage.getItem('rpg_token');
    return fetch('/api/game' + path, { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });
};

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function init() {
    var token = localStorage.getItem('rpg_token');
    if (!token) { renderNoAccess('Not logged in.'); return; }
    API('/admin/check').then(function(check) {
        if (!check.isAdmin && !check.isModerator) { renderNoAccess('Moderator access required.'); return; }
        renderLayout();
    }).catch(function(e) {
        renderNoAccess('Failed to verify access: ' + e.message);
    });
}

function renderNoAccess(msg) {
    document.getElementById('app').innerHTML = '<h2 style="color:#e06060;text-align:center;margin-top:60px">Access Denied</h2><p style="text-align:center;color:#8a8a90;margin-top:8px">' + msg + '</p>';
}

function renderLayout() {
    document.getElementById('app').innerHTML =
        '<div class="tabs" id="tabs">' +
            '<button class="tab-btn active" data-tab="csp">CSP Violations</button>' +
            '<button class="tab-btn" data-tab="bugs">Bug Reports</button>' +
            '<button class="tab-btn" data-tab="actions">Action Log</button>' +
            '<button class="tab-btn" data-tab="flagged">Flagged Characters</button>' +
        '</div>' +
        '<div id="tab-csp" class="tab-content active"><div class="loading">Loading CSP violations...</div></div>' +
        '<div id="tab-bugs" class="tab-content"><div class="loading">Loading bug reports...</div></div>' +
        '<div id="tab-actions" class="tab-content"><div class="loading">Loading action log...</div></div>' +
        '<div id="tab-flagged" class="tab-content"><div class="loading">Loading flagged characters...</div></div>';

    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            btn.classList.add('active');
            var tab = document.getElementById('tab-' + btn.dataset.tab);
            tab.classList.add('active');
            if (!tab.dataset.loaded) { tab.dataset.loaded = '1'; loadTab(btn.dataset.tab); }
        });
    });
    loadTab('csp');
}

function loadTab(name) {
    if (name === 'csp') loadCsp();
    else if (name === 'bugs') loadBugs();
    else if (name === 'actions') loadActions();
    else if (name === 'flagged') loadFlagged();
}

function loadCsp() {
    var tab = document.getElementById('tab-csp');
    API('/admin/csp-violations').then(function(rows) {
        if (!rows.length) { tab.innerHTML = '<div style="text-align:center;padding:40px;color:#6a6a70">No CSP violations.</div>'; return; }
        var html = '<h2 style="margin-bottom:10px">CSP Violations <span class="count-badge">' + rows.length + '</span></h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Blocked URI</th><th>Document URI</th><th>Violated Directive</th><th>Character</th><th>Timestamp</th></tr></thead><tbody>';
        rows.forEach(function(r) {
            html += '<tr><td>' + r.id + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + escHtml(r.blocked_uri) + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + escHtml(r.document_uri) + '</td><td>' + escHtml(r.violated_directive) + '</td><td>' + escHtml(r.character_name || '') + '</td><td>' + new Date(r.created_at * 1000).toLocaleString() + '</td></tr>';
        });
        html += '</tbody></table></div>';
        tab.innerHTML = html;
    }).catch(function(e) { tab.innerHTML = '<div class="loading" style="color:#e06060">Error: ' + e.message + '</div>'; });
}

function loadBugs() {
    var tab = document.getElementById('tab-bugs');
    API('/admin/bug-reports').then(function(rows) {
        if (!rows.length) { tab.innerHTML = '<div style="text-align:center;padding:40px;color:#6a6a70">No bug reports.</div>'; return; }
        var html = '<h2 style="margin-bottom:10px">Bug Reports <span class="count-badge">' + rows.length + '</span></h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Character</th><th>Class</th><th>Category</th><th>Title</th><th>Description</th><th>Location</th><th>Timestamp</th></tr></thead><tbody>';
        rows.forEach(function(r) {
            html += '<tr><td>' + r.id + '</td><td>' + escHtml(r.character_name || r.username || '') + '</td><td>' + escHtml(r.character_class || '') + '</td><td>' + escHtml(r.category || '') + '</td><td class="bug-title">' + escHtml(r.title || '') + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + escHtml(r.description || '') + '</td><td>' + escHtml(r.game_location || '') + '</td><td>' + (r.report_timestamp ? new Date(r.report_timestamp * 1000).toLocaleString() : '') + '</td></tr>';
        });
        html += '</tbody></table></div>';
        tab.innerHTML = html;
    }).catch(function(e) { tab.innerHTML = '<div class="loading" style="color:#e06060">Error: ' + e.message + '</div>'; });
}

function loadActions() {
    var tab = document.getElementById('tab-actions');
    var filter = (tab._filter || '');
    var html = '<div class="filter-bar"><input type="text" id="action-filter" placeholder="Filter by character name..." value="' + escHtml(filter) + '"><button onclick="applyActionFilter()" style="padding:8px 16px;background:#2a2a35;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e2e8f0;cursor:pointer">Filter</button></div>';
    html += '<div id="action-results"><div class="loading">Loading action log...</div></div>';
    tab.innerHTML = html;
    fetchActions(filter);
}

function applyActionFilter() {
    var input = document.getElementById('action-filter');
    var tab = document.getElementById('tab-actions');
    tab._filter = input.value;
    document.getElementById('action-results').innerHTML = '<div class="loading">Loading...</div>';
    fetchActions(input.value);
}

function fetchActions(nameFilter) {
    var tab = document.getElementById('tab-actions');
    var url = '/admin/action-log';
    if (nameFilter) url += '?name=' + encodeURIComponent(nameFilter);
    API(url).then(function(actions) {
        if (!actions.length) { document.getElementById('action-results').innerHTML = '<div style="text-align:center;padding:40px;color:#6a6a70">No actions found.</div>'; return; }
        var html = '<h2 style="margin-bottom:10px">Action Log <span class="count-badge">' + actions.length + '</span></h2><div class="table-wrap"><table><thead><tr><th>Time</th><th>Character</th><th>Type</th><th>Action</th><th>Detail</th></tr></thead><tbody>';
        actions.forEach(function(a) {
            html += '<tr><td>' + new Date(a.ts * 1000).toLocaleString() + '</td><td>' + escHtml(a.char_name || '') + '</td><td><span class="badge ' + (a.type === 'battle' ? 'badge-yes' : 'badge-warn') + '">' + escHtml(a.type) + '</span></td><td>' + escHtml(a.label || '') + '</td><td>' + escHtml(a.detail || '') + '</td></tr>';
        });
        html += '</tbody></table></div>';
        document.getElementById('action-results').innerHTML = html;
    }).catch(function(e) {
        document.getElementById('action-results').innerHTML = '<div class="loading" style="color:#e06060">Error: ' + e.message + '</div>';
    });
}

function loadFlagged() {
    var tab = document.getElementById('tab-flagged');
    API('/admin/flagged-characters').then(function(rows) {
        if (!rows.length) { tab.innerHTML = '<div style="text-align:center;padding:40px;color:#6a6a70">No flagged characters.</div>'; return; }
        var html = '<h2 style="margin-bottom:10px">Flagged Characters <span class="count-badge">' + rows.length + '</span></h2><div class="table-wrap"><table><thead><tr><th>Character</th><th>Reason</th><th>Detected</th><th>Last Seen</th><th>Confirmed</th></tr></thead><tbody>';
        rows.forEach(function(r) {
            html += '<tr class="clickable" onclick="showCharLogs(\'' + escHtml(r.char_name) + '\')"><td>' + escHtml(r.char_name) + '</td><td>' + escHtml(r.reason || '') + '</td><td>' + (r.detected_at ? new Date(r.detected_at * 1000).toLocaleString() : '') + '</td><td>' + (r.last_seen_at ? new Date(r.last_seen_at * 1000).toLocaleString() : '') + '</td><td><span class="badge ' + (r.confirmed ? 'badge-yes' : 'badge-no') + '">' + (r.confirmed ? 'Yes' : 'No') + '</span></td></tr>';
        });
        html += '</tbody></table></div>';
        tab.innerHTML = html;
        tab.dataset.loaded = '1';
    }).catch(function(e) { tab.innerHTML = '<div class="loading" style="color:#e06060">Error: ' + e.message + '</div>'; });
}

function showCharLogs(name) {
    var tab = document.getElementById('tab-flagged');
    tab.innerHTML = '<div class="loading">Loading logs for ' + escHtml(name) + '...</div>';
    API('/admin/character-logs/' + encodeURIComponent(name)).then(function(data) {
        var html = '<button onclick="loadFlagged()" style="margin-bottom:12px;padding:6px 14px;background:#2a2a35;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e2e8f0;cursor:pointer">&larr; Back to flagged</button>';
        html += '<h2 style="margin-bottom:10px">Logs for ' + escHtml(name) + '</h2>';
        html += '<h3 style="margin-bottom:6px;color:var(--text-dim)">API Calls (' + (data.api_log ? data.api_log.length : 0) + ')</h3>';
        html += '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th></tr></thead><tbody>';
        if (data.api_log) {
            data.api_log.forEach(function(e) {
                html += '<tr><td>' + new Date(e.ts * 1000).toLocaleString() + '</td><td>' + escHtml(e.method) + '</td><td>' + escHtml(e.path) + '</td><td>' + e.status + '</td></tr>';
            });
        }
        html += '</tbody></table></div>';
        html += '<h3 style="margin-top:16px;margin-bottom:6px;color:var(--text-dim)">Battles (' + (data.battles ? data.battles.length : 0) + ')</h3>';
        html += '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Attacker</th><th>Defender</th><th>Winner</th></tr></thead><tbody>';
        if (data.battles) {
            data.battles.forEach(function(b) {
                var winnerName = b.attacker_name;
                if (b.winner_id) {
                    var bw = data.battles.find(function(x) { return x.id === b.id && x.winner_id; });
                }
                html += '<tr><td>' + new Date(b.ts * 1000).toLocaleString() + '</td><td>' + escHtml(b.attacker_name || '') + '</td><td>' + escHtml(b.defender_name || '') + '</td><td>' + escHtml(b.winner_id ? (b.winner_id === 1 ? b.attacker_name : b.defender_name) : 'Draw') + '</td></tr>';
            });
        }
        html += '</tbody></table></div>';
        tab.innerHTML = html;
    }).catch(function(e) { tab.innerHTML = '<div class="loading" style="color:#e06060">Error: ' + e.message + '</div>'; });
}

init();
