var API = function(path) {
    var token = localStorage.getItem('rpg_token');
    return fetch('/api/game' + path, { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });
};

function init() {
    var token = localStorage.getItem('rpg_token');
    if (!token) { renderNoAccess('Not logged in.'); return; }
    API('/admin/check').then(function(check) {
        if (!check.isAdmin) { renderNoAccess('Admin access required.'); return; }
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
            '<button class="tab-btn" data-tab="banners">Banners</button>' +
            '<button class="tab-btn" data-tab="rewards">Rewards</button>' +
            '<button class="tab-btn" data-tab="actions">Action Log</button>' +
        '</div>' +
        '<div id="tab-csp" class="tab-content active"><div class="loading">Loading CSP violations...</div></div>' +
        '<div id="tab-bugs" class="tab-content"><div class="loading">Loading bug reports...</div></div>' +
        '<div id="tab-banners" class="tab-content"><div class="loading">Loading banners...</div></div>' +
        '<div id="tab-rewards" class="tab-content"><div class="loading">Loading rewards...</div></div>' +
        '<div id="tab-actions" class="tab-content"><div class="loading">Loading action log...</div></div>';

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
    else if (name === 'banners') loadBanners();
    else if (name === 'rewards') loadRewards();
    else if (name === 'actions') loadActions();
}

function loadCsp() {
    var el = document.getElementById('tab-csp');
    API('/admin/csp-violations').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No violations reported</p>'; return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
            '<th class="sortable" onclick="sortTable(\'csp\',\'id\')">#</th>' +
            '<th class="sortable" onclick="sortTable(\'csp\',\'reported_at\')">Reported</th>' +
            '<th class="sortable" onclick="sortTable(\'csp\',\'character_name\')">Character</th>' +
            '<th class="sortable" onclick="sortTable(\'csp\',\'user_id\')">User ID</th>' +
            '<th class="sortable" onclick="sortTable(\'csp\',\'blocked_uri\')">Blocked URI</th>' +
            '<th class="sortable" onclick="sortTable(\'csp\',\'violated_directive\')">Directive</th>' +
            '<th class="sortable" onclick="sortTable(\'csp\',\'document_uri\')">Document</th>' +
        '</tr></thead><tbody id="csp-tbody"></tbody></table></div>';
        window._cspData = data;
        renderCspTable(data);
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function renderCspTable(data) {
    var tbody = document.getElementById('csp-tbody');
    tbody.innerHTML = data.map(function(v) {
        return '<tr><td style="color:#6a6a70">' + v.id + '</td><td style="white-space:nowrap">' + v.reported_at + '</td><td>' + (v.character_name || '<span style="color:#4a4a50">—</span>') + '</td><td style="color:#6a6a70">' + (v.user_id || '') + '</td><td style="color:#e0c060;word-break:break-all">' + (v.blocked_uri || '') + '</td><td>' + (v.violated_directive || '') + '</td><td style="font-size:11px;word-break:break-all;max-width:180px">' + (v.document_uri || '') + '</td></tr>';
    }).join('');
}

function loadBugs() {
    var el = document.getElementById('tab-bugs');
    API('/admin/bug-reports').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No bug reports</p>'; return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
            '<th class="sortable" onclick="sortTable(\'bugs\',\'id\')">#</th>' +
            '<th class="sortable" onclick="sortTable(\'bugs\',\'report_timestamp\')">Date</th>' +
            '<th class="sortable" onclick="sortTable(\'bugs\',\'username\')">User</th>' +
            '<th class="sortable" onclick="sortTable(\'bugs\',\'character_name\')">Character</th>' +
            '<th class="sortable" onclick="sortTable(\'bugs\',\'category\')">Category</th>' +
            '<th class="sortable" onclick="sortTable(\'bugs\',\'title\')">Title</th>' +
            '<th>Screenshot</th>' +
        '</tr></thead><tbody id="bugs-tbody"></tbody></table></div>';
        window._bugsData = data;
        renderBugsTable(data);
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function renderBugsTable(data) {
    var tbody = document.getElementById('bugs-tbody');
    tbody.innerHTML = data.map(function(b) {
        return '<tr><td style="color:#6a6a70">' + b.id + '</td><td style="white-space:nowrap">' + b.report_timestamp + '</td><td>' + (b.username || '') + '</td><td>' + (b.character_name || '') + '</td><td><span class="badge badge-' + (b.category === 'bug' ? 'yes' : 'no') + '">' + (b.category || '') + '</span></td><td class="bug-title" title="' + esc(b.title) + '">' + esc(b.title) + '</td><td>' + (b.has_screenshot ? '<a href="/api/game/bug-report/screenshot/' + b.id + '" target="_blank" style="color:#5dade2">View</a>' : '<span style="color:#4a4a50">No</span>') + '</td></tr>';
    }).join('');
}

function loadBanners() {
    var el = document.getElementById('tab-banners');
    API('/admin/banners').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No banners</p>'; return; }
        el.innerHTML = '<div class="card-grid">' + data.map(function(b) {
            var name = b.name || 'Unnamed';
            var desc = b.description || '';
            var start = b.start_time ? new Date(b.start_time * 1000).toLocaleDateString() : '?';
            var end = b.end_time ? new Date(b.end_time * 1000).toLocaleDateString() : '?';
            var pulls = b.total_pulls || 0;
            var winners = b.winners || 0;
            return '<div class="banner-card"><div class="name">' + esc(name) + '</div><div class="meta">' + start + ' → ' + end + '</div><div class="desc">' + esc(desc) + '</div><div><span class="stat">🎟️ ' + pulls + ' pulls</span><span class="stat">🏆 ' + winners + ' winners</span></div></div>';
        }).join('') + '</div>';
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function loadRewards() {
    var el = document.getElementById('tab-rewards');
    API('/admin/rewards').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No reward batches sent</p>'; return; }
        el.innerHTML = '<div class="card-grid">' + data.map(function(r) {
            var scope = r.scope || 'everyone';
            var subj = r.subject || '';
            var body = r.body || '';
            var count = r.recipient_count || 0;
            var time = r.created_at ? new Date(r.created_at * 1000).toLocaleString() : '?';
            var payload = '';
            try { var p = JSON.parse(r.reward_payload || '{}'); payload = Object.keys(p).map(function(k) { return k + ': ' + p[k]; }).join(', '); } catch(e) {}
            return '<div class="banner-card"><div class="row" style="display:flex;justify-content:space-between;align-items:start;gap:8px"><span class="name" style="font-size:14px">' + esc(subj) + '</span><span class="reward-scope scope-' + scope + '">' + scope + '</span></div><div class="meta">' + time + ' · ' + count + ' recipients</div><div class="desc">' + esc(body) + '</div>' + (payload ? '<div style="font-size:11px;color:#c8a86e;margin-top:4px">' + payload + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

var sortState = {};
function sortTable(tab, col) {
    var key = tab + '_' + col;
    var dir = sortState[key] === 'asc' ? 'desc' : 'asc';
    sortState[key] = dir;
    var data = window['_' + tab + 'Data'];
    if (!data) return;
    data.sort(function(a, b) {
        var va = a[col] || '', vb = b[col] || '';
        if (col === 'id' || col === 'character_level') { va = Number(va); vb = Number(vb); }
        return dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    if (tab === 'csp') renderCspTable(data);
    else if (tab === 'bugs') renderBugsTable(data);
    else if (tab === 'actions') renderActionsTable(data);
}

function loadActions() {
    var el = document.getElementById('tab-actions');
    API('/admin/action-log?limit=500').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No actions recorded</p>'; return; }
        var filterHtml = '<div style="margin-bottom:10px"><input id="actions-filter" type="text" placeholder="Filter by player name..." style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #2a2a35;background:#14141e;color:#e0dcd0;font-size:13px;outline:none" oninput="filterActionsTable()"></div>';
        el.innerHTML = filterHtml + '<div class="table-wrap"><table><thead><tr>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'ts\')">Time</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'type\')">Type</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'char_name\')">Player</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'label\')">Action</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'detail\')">Detail</th>' +
        '</tr></thead><tbody id="actions-tbody"></tbody></table></div>';
        window._actionsData = data;
        renderActionsTable(data);
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function filterActionsTable() {
    var q = (document.getElementById('actions-filter').value || '').toLowerCase();
    var data = window._actionsData || [];
    if (!q) { renderActionsTable(data); return; }
    renderActionsTable(data.filter(function(a) { return (a.char_name || '').toLowerCase().indexOf(q) !== -1; }));
}

function renderActionsTable(data) {
    var tbody = document.getElementById('actions-tbody');
    tbody.innerHTML = data.map(function(a) {
        var time = a.ts ? new Date(a.ts * 1000).toLocaleString() : '?';
        var typeClass = a.type === 'battle' ? 'badge-yes' : 'badge-no';
        var typeIcon = a.type === 'battle' ? '⚔️' : a.type === 'mission' ? '📋' : '📍';
        return '<tr><td style="white-space:nowrap;font-size:11px">' + time + '</td>' +
            '<td><span class="badge ' + typeClass + '">' + typeIcon + ' ' + a.type + '</span></td>' +
            '<td>' + esc(a.char_name) + '</td>' +
            '<td>' + esc(a.label) + '</td>' +
            '<td style="color:#8a8a90;font-size:11px">' + esc(a.detail) + '</td></tr>';
    }).join('');
}


function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

init();
