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
            '<button class="tab-btn" data-tab="tournaments">Tournaments</button>' +
            '<button class="tab-btn" data-tab="actions">Action Log</button>' +
        '</div>' +
        '<div id="tab-csp" class="tab-content active"><div class="loading">Loading CSP violations...</div></div>' +
        '<div id="tab-bugs" class="tab-content"><div class="loading">Loading bug reports...</div></div>' +
        '<div id="tab-banners" class="tab-content"><div class="loading">Loading banners...</div></div>' +
        '<div id="tab-rewards" class="tab-content"><div class="loading">Loading rewards...</div></div>' +
        '<div id="tab-db" class="tab-content"><div class="loading">Loading database...</div></div>' +
        '<div id="tab-tournaments" class="tab-content"><div class="loading">Loading tournaments...</div></div>' +
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
    else if (name === 'tournaments') loadTournaments();
    else if (name === 'actions') loadActions();
}

function loadDbAdmin() {
    var el = document.getElementById('tab-db');
    el.innerHTML = '<div class="loading">Loading database...</div>';
    fetch('/api/db/tables', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } })
        .then(function(r) { return r.json(); })
        .then(function(tables) {
            el.innerHTML =
                '<div class="db-admin-layout">' +
                    '<div class="db-table-list" id="db-table-list"></div>' +
                    '<div class="db-content" id="db-content">' +
                        '<div class="no-data">Select a table to browse</div>' +
                    '</div>' +
                '</div>' +
                '<div class="db-sql-console">' +
                    '<div class="db-sql-header" id="db-sql-header">' +
                        '<span class="db-sql-arrow">▶</span> SQL Console' +
                    '</div>' +
                    '<div class="db-sql-body" id="db-sql-body">' +
                        '<textarea class="db-sql-input" id="db-sql-input" placeholder="Enter SQL query...&#10;Ctrl+Enter to run"></textarea>' +
                        '<div class="db-sql-toolbar">' +
                            '<button class="db-btn db-btn-apply" id="db-sql-run">Run (Ctrl+Enter)</button>' +
                        '</div>' +
                        '<div class="db-sql-results" id="db-sql-results"></div>' +
                    '</div>' +
                '</div>';
            
            var listEl = document.getElementById('db-table-list');
            tables.forEach(function(t) {
                var btn = document.createElement('button');
                btn.textContent = t;
                btn.addEventListener('click', function() {
                    listEl.querySelectorAll('.active').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    queryTable(t);
                });
                listEl.appendChild(btn);
            });
            if (tables.length) {
                listEl.querySelector('button').classList.add('active');
                queryTable(tables[0]);
            }

            // SQL Console toggle
            document.getElementById('db-sql-header').addEventListener('click', function() {
                var body = document.getElementById('db-sql-body');
                var arrow = this.querySelector('.db-sql-arrow');
                var isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                arrow.textContent = isOpen ? '▶' : '▼';
            });

            // SQL Run
            document.getElementById('db-sql-run').addEventListener('click', runSql);
            document.getElementById('db-sql-input').addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runSql(); }
            });
        });
}

function runSql() {
    var input = document.getElementById('db-sql-input');
    var results = document.getElementById('db-sql-results');
    var sql = input.value.trim();
    if (!sql) return;
    results.innerHTML = '<div class="loading">Running...</div>';
    fetch('/api/db/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ sql: sql })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (res.error) { results.innerHTML = '<div class="db-sql-error">' + esc(res.error) + '</div>'; return; }
        if (res.type === 'select') {
            if (!res.rows.length) { results.innerHTML = '<div class="no-data">0 rows returned</div>'; return; }
            var cols = res.columns || Object.keys(res.rows[0]);
            var html = '<div class="db-scroll"><table><thead><tr>' +
                cols.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') +
                '</tr></thead><tbody>';
            res.rows.forEach(function(row) {
                html += '<tr>';
                cols.forEach(function(c) {
                    var v = String(row[c] ?? '');
                    html += '<td title="' + esc(v) + '">' + esc(v) + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></div><div style="margin-top:4px;color:#6a6a70;font-size:11px">' + res.rows.length + ' row(s) returned</div>';
            results.innerHTML = html;
        } else {
            results.innerHTML = '<div style="color:#60e060;padding:8px">Query executed. Rows affected: ' + res.changes + '</div>';
        }
    }).catch(function(e) {
        results.innerHTML = '<div class="db-sql-error">' + esc(e.message) + '</div>';
    });
}

function queryTable(table, page = 1) {
    var el = document.getElementById('db-content');
    el.innerHTML = '<div class="loading">Loading...</div>';
    fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ table: table, page: page })
    }).then(function(r) { return r.json(); }).then(function(res) {
        var data = res.rows;
        if (!data.length) { el.innerHTML = '<div class="no-data">No rows found</div>'; return; }
        
        var totalPages = Math.ceil(res.total / res.limit);
        var cols = Object.keys(data[0]);
        var html = '<div class="db-scroll"><table>' +
            '<thead><tr>' + cols.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th>Actions</th></tr></thead>' +
            '<tbody>';
        
        data.forEach(function(row, rowIdx) {
            var rid = 'db-r' + page + '-' + rowIdx;
            html += '<tr id="' + rid + '">';
            cols.forEach(function(c) {
                var val = String(row[c] ?? '');
                html += '<td title="' + esc(val) + '">' +
                    '<span class="dsp">' + esc(val) + '</span>' +
                    '<input type="text" value="' + esc(val) + '" class="ed" ' +
                    'data-table="' + table + '" data-field="' + c + '" data-id="' + row.id + '">' +
                    '</td>';
            });
            html += '<td class="td-actions">' +
                '<button class="db-btn db-btn-edit ed-btn" data-rid="' + rid + '">Edit</button>' +
                '<button class="db-btn db-btn-apply ap-btn" data-rid="' + rid + '" style="display:none">Apply</button>' +
                '<button class="db-btn db-btn-cancel ca-btn" data-rid="' + rid + '" style="display:none">Cancel</button>' +
                '<button class="db-btn db-btn-del del-btn" data-table="' + table + '" data-id="' + row.id + '" data-page="' + page + '">Delete</button>' +
                '</td>';
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        html += '<div class="db-pagination" id="db-pagination"></div>';
        
        el.innerHTML = html;
        
        function enterEditMode(row) {
            if (!row) return;
            row.querySelectorAll('.dsp').forEach(function(s) { s.style.display = 'none'; });
            row.querySelectorAll('.ed').forEach(function(inp) { inp.style.display = 'block'; });
            row.querySelector('.ed-btn').style.display = 'none';
            row.querySelector('.del-btn').style.display = 'none';
            row.querySelector('.ap-btn').style.display = 'inline-block';
            row.querySelector('.ca-btn').style.display = 'inline-block';
        }
        
        // Edit buttons
        el.querySelectorAll('.ed-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { enterEditMode(document.getElementById(btn.dataset.rid)); });
        });
        
        // Click on display span also enters edit mode
        el.querySelectorAll('.dsp').forEach(function(s) {
            s.addEventListener('click', function() { enterEditMode(s.closest('tr')); });
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
            if (i === page) btn.classList.add('active');
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

function adminApi(method, path, body) {
    var token = localStorage.getItem('rpg_token');
    var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch('/api' + path, opts).then(function(r) { return r.json(); });
}

function loadTournaments() {
    var el = document.getElementById('tab-tournaments');
    adminApi('GET', '/tournaments').then(function(list) {
        // Only show tournaments that have participants (skip empty auto-created ones)
        var current = list.filter(function(t) { return (t.status === 'pending' || t.status === 'active') && (t.real_participants > 0 || t.status === 'active'); });
        const modes = ['deathmatch','normal','damage','least_damage','elimination','no_equip','all_vs_all'];
        var modeOpts = modes.map(function(m) { return '<option value="' + m + '">' + m.replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase()}) + '</option>'; }).join('');
        // Build level group options
        var levelGroups = [];
        for (var lg = 1; lg <= 500; lg += 10) levelGroups.push(lg + '-' + Math.min(lg + 9, 500));
        levelGroups.push('501+');
        var groupOpts = levelGroups.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
        var html = '<div class="card-compact"><div class="row"><span class="lbl">Mode</span>' +
          '<select id="admin-tournament-mode" style="background:#2a2a30;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:4px 8px">' + modeOpts + '</select></div>' +
          '<div class="row" style="margin-top:6px"><span class="lbl">Level Group</span>' +
          '<select id="admin-tournament-group" style="background:#2a2a30;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:4px 8px">' + groupOpts + '</select></div>' +
          '<div class="row" style="margin-top:6px"><span class="lbl">Create Tournament</span>' +
          '<button class="db-btn db-btn-apply" id="btn-create-tournament">➕ Create</button></div>' +
          '<div class="row" style="margin-top:6px"><span class="lbl">Manual Start</span>' +
          '<button class="db-btn db-btn-apply" id="btn-start-tournament">⚔️ Start Now (Test)</button></div>' +
          '<div style="margin-top:8px;font-size:11px;color:#6a6a70">Creates/starts tournament for the selected level group. Fills NPCs if &lt;8 players.</div></div>';
        if (current.length) {
            html += '<div class="card-compact" style="margin-top:8px"><h2>Current Tournaments</h2>';
            html += '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Group</th><th>Mode</th><th>Status</th><th>Fighters</th><th>Actions</th></tr></thead><tbody>';
            current.forEach(function(t) {
                var isActive = t.status === 'active';
                var fighters = t.status === 'pending' ? (t.real_participants || 0) : (t.participant_count || t.real_participants || 0);
                html += '<tr>' +
                  '<td>#' + t.id + '</td>' +
                  '<td>' + (t.level_group || '1-10') + '</td>' +
                  '<td>' + (t.mode || 'deathmatch') + '</td>' +
                  '<td>' + t.status + '</td>' +
                  '<td>' + fighters + '</td>' +
                  '<td>' +
                    (isActive ? '<button class="db-btn db-btn-cancel" data-action="cancel-tournament" data-id="' + t.id + '" style="margin-right:4px;padding:2px 6px;font-size:11px">✕ Cancel</button>' : '') +
                    (isActive ? '<button class="db-btn db-btn-apply" data-action="finalize-tournament" data-id="' + t.id + '" style="margin-right:4px;padding:2px 6px;font-size:11px">✓ Finalize</button>' : '') +
                    '<button class="db-btn db-btn-edit" data-action="restart-tournament" data-id="' + t.id + '" style="padding:2px 6px;font-size:11px">⟳ Restart</button>' +
                  '</td></tr>';
            });
            html += '</tbody></table></div></div>';
            html += '<div class="card-compact" style="margin-top:8px">' +
              '<div class="row"><span class="lbl">Add Player</span>' +
              '<select id="admin-add-player-group" style="background:#2a2a30;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:4px 8px">' + groupOpts + '</select>' +
              '<input id="admin-player-search" type="text" placeholder="Search character..." style="flex:1;background:#2a2a30;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:4px 8px">' +
              '<select id="admin-player-result" style="flex:1;background:#2a2a30;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:4px 8px;display:none"></select>' +
              '<button class="db-btn db-btn-apply" id="btn-add-player" disabled>Add</button></div>' +
              '<div style="font-size:11px;color:#6a6a70;margin-top:4px">Adds player to the pending tournament for the selected group</div></div>';
        }
        html += '<h2>Past Tournaments</h2>';
        var completedList = list.filter(function(t) { return t.status === 'complete'; });
        if (completedList.length === 0) {
            html += '<p style="color:#6a6a70;text-align:center;padding:20px">No completed tournaments yet</p>';
        } else {
            html += '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Group</th><th>Mode</th><th>Participants</th><th>Winner</th></tr></thead><tbody>';
            completedList.forEach(function(t) {
                var date = t.ended_at ? new Date(t.ended_at + 'Z').toLocaleDateString() : '?';
                html += '<tr><td>' + t.id + '</td><td>' + date + '</td><td>' + (t.level_group || '1-10') + '</td><td>' + (t.mode || 'deathmatch') + '</td><td>' + (t.participant_count || '?') + '</td><td>' + (t.winner_is_npc ? '<span style="color:#6a6a70">NPC</span>' : '<span style="color:#60e060">Player #' + t.winner_char_id + '</span>') + '</td></tr>';
            });
            html += '</tbody></table></div>';
        }
        el.innerHTML = html;
        // Set dropdown to match existing pending tournament's mode
        var firstPending = current.length ? current[0] : null;
        if (firstPending) {
            var sel = document.getElementById('admin-tournament-mode');
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === (firstPending.mode || 'deathmatch')) { sel.selectedIndex = i; break; }
            }
            var gSel = document.getElementById('admin-tournament-group');
            for (var i = 0; i < gSel.options.length; i++) {
                if (gSel.options[i].value === (firstPending.level_group || '1-10')) { gSel.selectedIndex = i; break; }
            }
        }
        // ── Cancel ──
        document.querySelectorAll('[data-action="cancel-tournament"]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                if (!confirm('Cancel tournament #' + id + '?')) return;
                this.textContent = '...';
                adminApi('POST', '/tournaments/cancel/' + id).then(function(r) {
                    loadTournaments();
                }).catch(function(e) {
                    alert('Error: ' + e.message);
                    loadTournaments();
                });
            });
        });
        // ── Restart ──
        document.querySelectorAll('[data-action="restart-tournament"]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                if (!confirm('Restart tournament #' + id + '? This will clear match results.')) return;
                this.textContent = '...';
                adminApi('POST', '/tournaments/restart/' + id).then(function(r) {
                    loadTournaments();
                }).catch(function(e) {
                    alert('Error: ' + e.message);
                    loadTournaments();
                });
            });
        });
        // ── Finalize ──
        document.querySelectorAll('[data-action="finalize-tournament"]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                if (!confirm('Finalize tournament #' + id + '? Computes standings and completes it.')) return;
                this.textContent = '...';
                adminApi('POST', '/tournaments/finalize/' + id).then(function(r) {
                    alert('✅ Tournament #' + id + ' finalized: ' + r.status + (r.winner_char_id ? ' (winner char #' + r.winner_char_id + ')' : ''));
                    loadTournaments();
                }).catch(function(e) {
                    alert('Error: ' + e.message);
                    loadTournaments();
                });
            });
        });
        // ── Add Player ──
        var searchInput = document.getElementById('admin-player-search');
        var resultSelect = document.getElementById('admin-player-result');
        var addBtn = document.getElementById('btn-add-player');
        if (searchInput) {
            var searchTimeout;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                var q = this.value.trim();
                if (q.length < 2) { resultSelect.style.display = 'none'; addBtn.disabled = true; return; }
                searchTimeout = setTimeout(function() {
                    adminApi('GET', '/characters/search?q=' + encodeURIComponent(q)).then(function(chars) {
                        if (!chars.length) { resultSelect.style.display = 'none'; addBtn.disabled = true; return; }
                        resultSelect.innerHTML = chars.map(function(c) { return '<option value="' + c.id + '">#' + c.id + ' ' + c.name + ' (' + c.class + ' Lv.' + c.level + ')</option>'; }).join('');
                        resultSelect.style.display = 'block';
                        addBtn.disabled = false;
                    }).catch(function() { resultSelect.style.display = 'none'; addBtn.disabled = true; });
                }, 300);
            });
            addBtn.addEventListener('click', function() {
                var charId = resultSelect.value;
                var group = document.getElementById('admin-add-player-group').value;
                var pendingForGroup = list.filter(function(t) { return t.status === 'pending' && (t.level_group || '1-10') === group; });
                // If first join, also show tournament with 0 participants
                if (!pendingForGroup.length) {
                    pendingForGroup = list.filter(function(t) { return t.status === 'pending' && (t.level_group || '1-10') === group; });
                }
                if (!pendingForGroup.length) { alert('No pending tournament for group ' + group); return; }
                var tid = pendingForGroup[pendingForGroup.length - 1].id;
                addBtn.textContent = 'Adding...';
                addBtn.disabled = true;
                adminApi('POST', '/tournaments/add-player/' + tid, { char_id: Number(charId) }).then(function(r) {
                    addBtn.textContent = '✅ Added';
                    setTimeout(function() { loadTournaments(); }, 1500);
                }).catch(function(e) {
                    addBtn.textContent = 'Error';
                    setTimeout(function() { loadTournaments(); }, 3000);
                });
            });
        }
        // ── Create ──
        document.getElementById('btn-create-tournament').addEventListener('click', function() {
            var btn = this;
            var mode = document.getElementById('admin-tournament-mode').value;
            var group = document.getElementById('admin-tournament-group').value;
            btn.textContent = 'Creating...';
            btn.disabled = true;
            adminApi('POST', '/tournaments/create', { mode: mode, level_group: group }).then(function(r) {
                btn.textContent = '✅ Created';
                setTimeout(function() { loadTournaments(); }, 1500);
            }).catch(function(e) {
                btn.textContent = 'Error';
                setTimeout(function() { loadTournaments(); }, 3000);
            });
        });
        // ── Start ──
        document.getElementById('btn-start-tournament').addEventListener('click', function() {
            var btn = this;
            var mode = document.getElementById('admin-tournament-mode').value;
            var group = document.getElementById('admin-tournament-group').value;
            btn.textContent = 'Starting...';
            btn.disabled = true;
            adminApi('POST', '/tournaments/start-test', { mode: mode, level_group: group }).then(function(r) {
                btn.textContent = '✅ Started';
                setTimeout(function() { loadTournaments(); }, 2000);
            }).catch(function(e) {
                btn.textContent = 'Error';
                setTimeout(function() { loadTournaments(); }, 3000);
            });
        });
    }).catch(function(e) {
        el.innerHTML = '<p class="error">' + e.message + '</p>';
    });
}

init();
