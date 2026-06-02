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
            '<button class="tab-btn" data-tab="db">Database</button>' +
            '<button class="tab-btn" data-tab="actions">Action Log</button>' +
        '</div>' +
        '<div id="tab-csp" class="tab-content active"><div class="loading">Loading CSP violations...</div></div>' +
        '<div id="tab-bugs" class="tab-content"><div class="loading">Loading bug reports...</div></div>' +
        '<div id="tab-banners" class="tab-content"><div class="loading">Loading banners...</div></div>' +
        '<div id="tab-rewards" class="tab-content"><div class="loading">Loading rewards...</div></div>' +
        '<div id="tab-db" class="tab-content"><div class="loading">Loading database...</div></div>' +
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
    else if (name === 'db') loadDbAdmin();
    else if (name === 'actions') loadActions();
}

function loadDbAdmin() {
    var el = document.getElementById('tab-db');
    el.innerHTML = '<div class="loading">Loading database...</div>';
    fetch('/api/db/tables', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } })
        .then(function(r) { return r.json(); })
        .then(function(tables) {
            var tableList = tables.map(function(t) { 
                var btn = document.createElement('button');
                btn.textContent = t;
                btn.addEventListener('click', function() { queryTable(t); });
                return btn;
            });
            
            el.innerHTML = '<div style="display:flex;gap:20px;padding:10px">' +
                '<div id="db-table-list" style="width:200px;display:flex;flex-direction:column;gap:5px"></div>' +
                '<div id="db-content" style="flex-grow:1;overflow-x:auto">Select a table</div>' +
            '</div>';
            
            var listEl = document.getElementById('db-table-list');
            tableList.forEach(function(b) { listEl.appendChild(b); });
        });
}

function queryTable(table, page = 1) {
    var el = document.getElementById('db-content');
    el.innerHTML = 'Loading...';
    fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ table: table, page: page })
    }).then(function(r) { return r.json(); }).then(function(res) {
        var data = res.rows;
        if (!data.length) { el.innerHTML = 'No data'; return; }
        
        var totalPages = Math.ceil(res.total / res.limit);
        var cols = Object.keys(data[0]);
        var html = '<div class="db-scroll"><table style="width:100%;border-collapse:collapse;border:1px solid #444">' +
            '<thead><tr style="background:#222">' + cols.map(function(c) { return '<th style="padding:5px;border:1px solid #444">' + esc(c) + '</th>'; }).join('') + '<th style="padding:5px;border:1px solid #444;white-space:nowrap">Actions</th></tr></thead>' +
            '<tbody>';
        
        data.forEach(function(row, rowIdx) {
            var rid = 'db-r' + page + '-' + rowIdx;
            html += '<tr id="' + rid + '">';
            cols.forEach(function(c) {
                var val = String(row[c] ?? '');
                html += '<td style="padding:5px;border:1px solid #444;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(val) + '">' +
                    '<span class="dsp">' + esc(val) + '</span>' +
                    '<input type="text" value="' + esc(val) + '" class="ed" style="display:none;width:100%;min-width:80px;padding:3px 5px;border:1px solid #555;background:#1a1a28;color:inherit;border-radius:3px;font:inherit;font-size:12px" ' +
                    'data-table="' + table + '" data-field="' + c + '" data-id="' + row.id + '">' +
                    '</td>';
            });
            html += '<td style="padding:5px;border:1px solid #444;text-align:center;white-space:nowrap">' +
                '<button class="ed-btn" data-rid="' + rid + '" style="background:#2a5a2a;color:white;border:none;padding:3px 8px;cursor:pointer;border-radius:3px;font-size:11px">Edit</button>' +
                '<button class="ap-btn" data-rid="' + rid + '" style="display:none;background:#2a6a8a;color:white;border:none;padding:3px 8px;cursor:pointer;border-radius:3px;font-size:11px">Apply</button>' +
                '<button class="ca-btn" data-rid="' + rid + '" style="display:none;background:#6a2a2a;color:white;border:none;padding:3px 8px;cursor:pointer;border-radius:3px;font-size:11px">Cancel</button>' +
                '<button class="del-btn" data-table="' + table + '" data-id="' + row.id + '" data-page="' + page + '" style="background:#aa0000;color:white;border:none;padding:3px 8px;cursor:pointer;border-radius:3px;font-size:11px">Delete</button>' +
                '</td>';
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        html += '<div id="db-pagination" style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap"></div>';
        
        el.innerHTML = html;
        
        // Edit buttons
        el.querySelectorAll('.ed-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var row = document.getElementById(btn.dataset.rid);
                if (!row) return;
                row.querySelectorAll('.dsp').forEach(function(s) { s.style.display = 'none'; });
                row.querySelectorAll('.ed').forEach(function(inp) { inp.style.display = 'block'; });
                btn.style.display = 'none';
                row.querySelector('.del-btn').style.display = 'none';
                row.querySelector('.ap-btn').style.display = 'inline-block';
                row.querySelector('.ca-btn').style.display = 'inline-block';
            });
        });
        
        // Apply buttons
        el.querySelectorAll('.ap-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var row = document.getElementById(btn.dataset.rid);
                if (!row) return;
                var inputs = row.querySelectorAll('.ed');
                var promises = [];
                inputs.forEach(function(inp) {
                    if (inp.value !== inp.defaultValue) {
                        promises.push(saveCell(inp));
                    }
                });
                if (!promises.length) { switchRowView(row); return; }
                Promise.all(promises).then(function() {
                    inputs.forEach(function(inp) {
                        inp.defaultValue = inp.value;
                        var td = inp.closest('td');
                        var dsp = td.querySelector('.dsp');
                        if (dsp) dsp.textContent = inp.value;
                    });
                    switchRowView(row);
                }).catch(function() { switchRowView(row); });
            });
        });
        
        // Cancel buttons
        el.querySelectorAll('.ca-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var row = document.getElementById(btn.dataset.rid);
                if (!row) return;
                row.querySelectorAll('.ed').forEach(function(inp) { inp.value = inp.defaultValue; });
                switchRowView(row);
            });
        });
        
        // Delete buttons
        el.querySelectorAll('.del-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (confirm('Delete this record?')) deleteRecord(table, btn.dataset.id, page);
            });
        });

        // Pagination
        var pagEl = document.getElementById('db-pagination');
        for (var i = 1; i <= totalPages; i++) {
            var btn = document.createElement('button');
            btn.textContent = i;
            if (i === page) btn.style.background = '#555';
            else btn.addEventListener('click', (function(p) { return function() { queryTable(table, p); }; })(i));
            pagEl.appendChild(btn);
        }
    });
}

function switchRowView(row) {
    row.querySelectorAll('.dsp').forEach(function(s) { s.style.display = ''; });
    row.querySelectorAll('.ed').forEach(function(inp) { inp.style.display = 'none'; });
    row.querySelector('.ed-btn').style.display = 'inline-block';
    row.querySelector('.ap-btn').style.display = 'none';
    row.querySelector('.ca-btn').style.display = 'none';
    row.querySelector('.del-btn').style.display = 'inline-block';
}

function deleteRecord(table, id, page) {
    fetch('/api/db/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ table: table, id: id })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.success) alert('Failed to delete: ' + res.error);
        else queryTable(table, page);
    });
}

function saveCell(input) {
    return fetch('/api/db/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ table: input.dataset.table, field: input.dataset.field, value: input.value, id: input.dataset.id })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.success) { alert('Failed to update: ' + res.error); throw new Error(res.error); }
    });
};

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
        var filterHtml = '<div style="margin-bottom:10px"><input id="actions-filter" type="text" placeholder="Filter by player name..." style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid #2a2a35;background:#14141e;color:#e0dcd0;font-size:13px;outline:none"></div>';
        el.innerHTML = filterHtml + '<div class="table-wrap"><table><thead><tr>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'ts\')">Time</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'type\')">Type</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'char_name\')">Player</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'label\')">Action</th>' +
            '<th class="sortable" onclick="sortTable(\'actions\',\'detail\')">Detail</th>' +
        '</tr></thead><tbody id="actions-tbody"></tbody></table></div>';
        window._actionsData = data;
        renderActionsTable(data);
        var filterInput = document.getElementById('actions-filter');
        if (filterInput) filterInput.addEventListener('input', filterActionsTable);
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
