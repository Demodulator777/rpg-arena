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
        if (!check.isAdmin && !check.isModerator) { renderNoAccess('Access denied.'); return; }
        window._isAdmin = check.isAdmin;
        window._isModerator = check.isModerator;
        renderLayout();
    }).catch(function(e) {
        renderNoAccess('Failed to verify access: ' + e.message);
    });
}

function renderNoAccess(msg) {
    document.getElementById('app').innerHTML = '<h2 style="color:#e06060;text-align:center;margin-top:60px">Access Denied</h2><p style="text-align:center;color:#8a8a90;margin-top:8px">' + msg + '</p>';
}

function renderLayout() {
    var isModOnly = window._isModerator && !window._isAdmin;
    var tabs = [
        { id: 'csp', label: 'CSP Violations' },
        { id: 'dom', label: 'DOM Mutations' },
        { id: 'stale', label: 'Stale Clients' },
        { id: 'bugs', label: 'Bug Reports' },
        { id: 'actions', label: 'Action Log' },
        { id: 'flagged', label: 'Flagged' },
        { id: 'bans', label: 'Bans' },
    ];
    if (!isModOnly) {
        tabs.push(
            { id: 'banners', label: 'Banners' },
            { id: 'rewards', label: 'Rewards' },
            { id: 'weekly', label: 'Weekly Stats' },
            { id: 'db', label: 'Database' },
            { id: 'tournaments', label: 'Tournaments' },
            { id: 'bots', label: 'Bots' },
            { id: 'console', label: 'Console' },
            { id: 'moderators', label: 'Moderators' }
        );
    }
    document.getElementById('app').innerHTML =
        '<div class="tabs" id="tabs">' +
            tabs.map(function(t) { return '<button class="tab-btn' + (t.id === 'csp' ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>'; }).join('') +
        '</div>' +
        tabs.map(function(t) { return '<div id="tab-' + t.id + '" class="tab-content' + (t.id === 'csp' ? ' active' : '') + '"><div class="loading">Loading ' + t.label.toLowerCase() + '...</div></div>'; }).join('') +
        '';

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
    else if (name === 'dom') loadDom();
    else if (name === 'stale') loadStale();
    else if (name === 'bugs') loadBugs();
    else if (name === 'banners') loadBanners();
    else if (name === 'rewards') loadRewards();
    else if (name === 'db') loadDbAdmin();
    else if (name === 'tournaments') loadTournaments();
    else if (name === 'actions') loadActions();
    else if (name === 'flagged') loadFlagged();
    else if (name === 'bots') loadBots();
    else if (name === 'console') loadConsole();
    else if (name === 'moderators') loadModerators();
    else if (name === 'weekly') loadWeekly();
    else if (name === 'bans') loadBans();
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

            // Table select dropdown for mobile
            var sel = document.createElement('select');
            sel.className = 'db-table-select';
            sel.addEventListener('change', function() {
                listEl.querySelectorAll('.active').forEach(function(b) { b.classList.remove('active'); });
                queryTable(this.value);
            });
            tables.forEach(function(t) {
                var opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                sel.appendChild(opt);
            });
            listEl.appendChild(sel);

            tables.forEach(function(t) {
                var btn = document.createElement('button');
                btn.textContent = t;
                btn.addEventListener('click', function() {
                    listEl.querySelectorAll('.active').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    sel.value = t;
                    queryTable(t);
                });
                listEl.appendChild(btn);
            });
            if (tables.length) {
                listEl.querySelector('button').classList.add('active');
                sel.value = tables[0];
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

function queryTable(table, page, filterOverride) {
    if (!page) page = 1;
    var el = document.getElementById('db-content');
    var existingInput = document.getElementById('db-filter-input');
    var filterVal = filterOverride !== undefined ? filterOverride : (existingInput ? existingInput.value : '');
    el.innerHTML = '<div class="db-filter-bar"><input type="text" id="db-filter-input" class="db-filter-input" placeholder="Filter by name, user, character... (press Enter to apply)" value="' + esc(filterVal) + '"></div><div class="loading">Loading...</div>';
    document.getElementById('db-filter-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { queryTable(table, 1); }
    });
    fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ table: table, page: page, filter: filterVal })
    }).then(function(r) { return r.json(); }).then(function(res) {
        var data = res.rows;
        if (!data.length) { el.innerHTML = '<div class="db-filter-bar"><input type="text" id="db-filter-input" class="db-filter-input" placeholder="Filter by name, user, character... (press Enter to apply)" value="' + esc(filterVal) + '"></div><div class="no-data">No rows found</div>';
            document.getElementById('db-filter-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') { queryTable(table, 1); } });
            return; }
        
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
        // Restore filter bar (empty result state destroys it)
        var fi = document.getElementById('db-filter-input');
        if (!fi) {
            var filterDiv = document.createElement('div');
            filterDiv.className = 'db-filter-bar';
            filterDiv.innerHTML = '<input type="text" id="db-filter-input" class="db-filter-input" placeholder="Filter by name, user, character... (press Enter to apply)" value="' + esc(filterVal) + '">';
            el.insertBefore(filterDiv, el.firstChild);
        }
        document.getElementById('db-filter-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { queryTable(table, 1); }
        });
        
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
            else btn.addEventListener('click', (function(p) { return function() { var fi = document.getElementById('db-filter-input'); var fv = fi ? fi.value : ''; queryTable(table, p, fv); }; })(i));
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
            '<th class="sortable" data-tab="csp" data-col="id">#</th>' +
            '<th class="sortable" data-tab="csp" data-col="reported_at">Reported</th>' +
            '<th class="sortable" data-tab="csp" data-col="character_name">Character</th>' +
            '<th class="sortable" data-tab="csp" data-col="user_id">User ID</th>' +
            '<th class="sortable" data-tab="csp" data-col="blocked_uri">Blocked URI</th>' +
            '<th class="sortable" data-tab="csp" data-col="violated_directive">Directive</th>' +
            '<th class="sortable" data-tab="csp" data-col="document_uri">Document</th>' +
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

// ── DOM Mutations Tab ──────────────────────────────────────────────────────

function loadDom() {
    var el = document.getElementById('tab-dom');
    API('/admin/dom-mutations').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No DOM mutations reported</p>'; return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
            '<th>#</th>' +
            '<th>Time</th>' +
            '<th>Character</th>' +
            '<th>Type</th>' +
            '<th>Target</th>' +
            '<th>Detail</th>' +
            '<th>URL</th>' +
        '</tr></thead><tbody>' + data.map(function(v) {
            var detail = v.detail || '';
            var snippet = detail.length > 120 ? detail.slice(0, 120) + '...' : detail;
            return '<tr>' +
                '<td style="color:#6a6a70">' + v.id + '</td>' +
                '<td style="white-space:nowrap">' + (v.created_at ? new Date(v.created_at * 1000).toLocaleString() : '') + '</td>' +
                '<td>' + (v.char_name || '<span style="color:#4a4a50">—</span>') + '</td>' +
                '<td><code style="background:#2a2a30;padding:1px 6px;border-radius:3px">' + (v.mutation_type || '') + '</code></td>' +
                '<td style="font-size:11px;word-break:break-all;max-width:150px">' + (v.target_info || '') + '</td>' +
                '<td style="font-size:11px;word-break:break-all;max-width:250px"><span title="' + detail.replace(/"/g,'&quot;') + '">' + snippet + '</span></td>' +
                '<td style="font-size:11px;word-break:break-all;max-width:120px">' + (v.url || '') + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

// ── Stale Clients Tab ──────────────────────────────────────────────────────

function loadStale() {
    var el = document.getElementById('tab-stale');
    API('/admin/stale-clients').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No stale clients reported</p>'; return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
            '<th>#</th>' +
            '<th>Time</th>' +
            '<th>User</th>' +
            '<th>Character</th>' +
            '<th>Version</th>' +
            '<th>Path</th>' +
        '</tr></thead><tbody>' + data.map(function(v) {
            return '<tr>' +
                '<td style="color:#6a6a70">' + v.id + '</td>' +
                '<td style="white-space:nowrap">' + (v.created_at ? new Date(v.created_at * 1000).toLocaleString() : '') + '</td>' +
                '<td style="color:#6a6a70">' + (v.user_id || '') + '</td>' +
                '<td>' + (v.char_name || '<span style="color:#4a4a50">—</span>') + '</td>' +
                '<td><code style="background:#2a2a30;padding:1px 6px;border-radius:3px">' + (v.version || '') + '</code></td>' +
                '<td style="font-size:11px;word-break:break-all;max-width:250px">' + (v.path || '') + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function loadBugs() {
    var el = document.getElementById('tab-bugs');
    API('/admin/bug-reports').then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No bug reports</p>'; return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
            '<th class="sortable" data-tab="bugs" data-col="id">#</th>' +
            '<th class="sortable" data-tab="bugs" data-col="report_timestamp">Date</th>' +
            '<th class="sortable" data-tab="bugs" data-col="username">User</th>' +
            '<th class="sortable" data-tab="bugs" data-col="character_name">Character</th>' +
            '<th class="sortable" data-tab="bugs" data-col="category">Category</th>' +
            '<th class="sortable" data-tab="bugs" data-col="title">Title</th>' +
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

function loadActions(name) {
    var el = document.getElementById('tab-actions');
    var url = '/admin/action-log?limit=500';
    if (name) url += '&name=' + encodeURIComponent(name);
    API(url).then(function(data) {
        if (!data.length) { el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No actions recorded</p>'; return; }
        var nameVal = name || '';
        var filterHtml = '<div style="margin-bottom:10px;display:flex;gap:8px"><input id="actions-filter" type="text" placeholder="Filter by player name..." value="' + esc(nameVal) + '" style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid #2a2a35;background:#14141e;color:#e0dcd0;font-size:13px;outline:none"><button id="actions-filter-btn" class="btn-sm" style="padding:8px 14px">Filter</button></div>';
        el.innerHTML = filterHtml + '<div class="table-wrap"><table><thead><tr>' +
            '<th class="sortable" data-tab="actions" data-col="ts">Time</th>' +
            '<th class="sortable" data-tab="actions" data-col="type">Type</th>' +
            '<th>Action</th>' +
            '<th class="sortable" data-tab="actions" data-col="char_name">Player</th>' +
            '<th>Detail</th>' +
        '</tr></thead><tbody id="actions-tbody"></tbody></table></div>';
        window._actionsData = data;
        renderActionsTable(data);
        document.getElementById('actions-filter').addEventListener('keydown', function(e) { if (e.key === 'Enter') loadActions(this.value.trim()); });
        document.getElementById('actions-filter-btn').addEventListener('click', function() { loadActions(document.getElementById('actions-filter').value.trim()); });
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function renderActionsTable(data) {
    var tbody = document.getElementById('actions-tbody');
    tbody.innerHTML = data.map(function(a) {
        var time = a.ts ? new Date(a.ts * 1000).toLocaleString() : '?';
        var typeBadge, labelHtml, detailHtml, playerHtml;
        if (a._source === 'api_log') {
            var noBadge = a.tab_viewed ? '' : ' ⚠️';
            var nameColor = a.bot ? 'color:#e06060;font-weight:700' : 'color:#5dade2';
            typeBadge = '<span class="badge badge-yes" style="font-size:10px">API</span>';
            labelHtml = '<span style="font-size:12px">' + esc(a.label || '') + '</span>';
            detailHtml = '<span style="color:#8a8a90;font-size:11px">' + esc(a.detail || '') + '</span>';
            playerHtml = '<a href="#" class="action-player-link" data-name="' + esc(a.char_name) + '" style="text-decoration:none;' + nameColor + '">' + esc(a.char_name || '?') + '</a>' + noBadge;
        } else if (a._source === 'bot_detection') {
            var nameColor = 'color:#e06060;font-weight:700';
            typeBadge = '<span class="badge badge-warn" style="font-size:10px">🤖 BOT</span>';
            labelHtml = esc(a.label || '');
            detailHtml = '<span style="color:#e06060;font-size:11px">' + esc(a.detail || '') + '</span>';
            playerHtml = '<a href="#" class="action-player-link" data-name="' + esc(a.char_name) + '" style="text-decoration:none;' + nameColor + '">' + esc(a.char_name) + '</a>';
        } else {
            var typeClass = a.type === 'battle' ? 'badge-yes' : 'badge-no';
            var typeIcon = a.type === 'battle' ? '⚔️' : '📍';
            var nameColor = a.bot ? 'color:#e06060;font-weight:700' : 'color:#5dade2';
            typeBadge = '<span class="badge ' + typeClass + '" style="font-size:10px">' + typeIcon + ' ' + a.type.replace('_',' ') + '</span>';
            labelHtml = esc(a.label || '');
            detailHtml = '<span style="color:#8a8a90;font-size:11px">' + esc(a.detail || '') + '</span>';
            playerHtml = '<a href="#" class="action-player-link" data-name="' + esc(a.char_name) + '" style="text-decoration:none;' + nameColor + '">' + esc(a.char_name) + '</a>';
        }
        return '<tr><td style="white-space:nowrap;font-size:11px">' + time + '</td>' +
            '<td>' + typeBadge + '</td>' +
            '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + labelHtml + '</td>' +
            '<td>' + playerHtml + '</td>' +
            '<td>' + detailHtml + '</td></tr>';
    }).join('');
}

document.addEventListener('click', function(e) {
    var link = e.target.closest('.action-player-link');
    if (!link) return;
    e.preventDefault();
    var name = link.getAttribute('data-name');
    if (name) loadActions(name);
});


// CSP-safe sortable header delegation (replaces inline onclick)
document.addEventListener('click', function(e) {
    var th = e.target.closest('.sortable[data-tab][data-col]');
    if (!th) return;
    sortTable(th.getAttribute('data-tab'), th.getAttribute('data-col'));
});

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

function loadBots() {
    var el = document.getElementById('tab-bots');
    el.innerHTML = '<div class="loading">Loading bots...</div>';
    API('/admin/bots').then(function(data) {
        if (!data.length) {
            el.innerHTML = '<p style="text-align:center;color:#6a6a70;padding:40px">No bot configs. Add one via the Database tab (bot_configs table).</p>';
            return;
        }
        var rows = data.map(function(b) {
            var running = b.running ? '<span style="color:#4ade80">● Running</span>' : '<span style="color:#6a6a70">● Stopped</span>';
            var hp = b.hpMax > 0 ? (b.hp || 0) + '/' + b.hpMax : '-';
            var toggleLabel = b.enabled ? 'Stop' : 'Start';
            var verLabel = b.script_version === 'bot2' ? 'v2' : 'v1';
            var dungeonLabel = b.dungeonEnabled ? 'On' : 'Off';
            return '<tr>' +
                '<td style="padding:6px 12px">' + esc(b.username) + '</td>' +
                '<td style="padding:6px 12px">' + esc(b.class) + '</td>' +
                '<td style="padding:6px 12px">' + verLabel + '</td>' +
                '<td style="padding:6px 12px">' + running + '</td>' +
                '<td style="padding:6px 12px">' + (b.level || 0) + '</td>' +
                '<td style="padding:6px 12px">' + hp + '</td>' +
                '<td style="padding:6px 12px">' + (b.gold || 0) + '</td>' +
                '<td style="padding:6px 12px;white-space:nowrap">' +
                    '<button class="db-btn" data-bot-id="' + b.id + '" data-action="toggle">' + toggleLabel + '</button> ' +
                    '<button class="db-btn" data-bot-id="' + b.id + '" data-action="switch-version">→v' + (b.script_version === 'bot2' ? '1' : '2') + '</button> ' +
                    '<button class="db-btn" data-bot-id="' + b.id + '" data-action="dungeon-toggle">DNG ' + dungeonLabel + '</button> ' +
                    '<button class="db-btn db-btn-del" data-bot-id="' + b.id + '" data-action="delete">X</button>' +
                '</td></tr>';
        }).join('');
        el.innerHTML = '<div class="table-wrap"><table class="sortable"><thead><tr>' +
            '<th>Username</th><th>Class</th><th>Ver</th><th>Status</th><th>Lv</th><th>HP</th><th>Gold</th><th>Actions</th>' +
            '</tr></thead><tbody id="bots-tbody">' + rows + '</tbody></table></div>';

        // Event delegation for CSP-safe bot actions (no inline onclick)
        document.getElementById('bots-tbody').addEventListener('click', function(e) {
            var btn = e.target.closest('[data-bot-id]');
            if (!btn) return;
            var id = parseInt(btn.getAttribute('data-bot-id'));
            var action = btn.getAttribute('data-action');
            if (action === 'toggle') toggleBot(id);
            else if (action === 'switch-version') switchBotVersion(id);
            else if (action === 'dungeon-toggle') toggleBotDungeon(id);
            else if (action === 'delete') deleteBot(id);
        });
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function toggleBot(id) {
    adminApi('POST', '/game/admin/bots/' + id + '/toggle').then(function(r) {
        if (r.error) { alert(r.error); return; }
        loadBots();
    }).catch(function(e) { alert(e.message); loadBots(); });
}

function switchBotVersion(id) {
    if (!confirm('Switch bot version? This will restart the bot.')) return;
    adminApi('POST', '/game/admin/bots/' + id + '/switch-version').then(function(r) {
        if (r.error) { alert(r.error); return; }
        loadBots();
    }).catch(function(e) { alert(e.message); loadBots(); });
}

function deleteBot(id) {
    if (!confirm('Delete this bot config?')) return;
    adminApi('DELETE', '/game/admin/bots/' + id).then(function(r) {
        if (r.error) { alert(r.error); return; }
        loadBots();
    }).catch(function(e) { alert(e.message); loadBots(); });
}

function toggleBotDungeon(id) {
    adminApi('POST', '/game/admin/bots/' + id + '/dungeon-toggle').then(function(r) {
        if (r.error) { alert(r.error); return; }
        loadBots();
    }).catch(function(e) { alert(e.message); loadBots(); });
}

// ── Weekly Stats ──────────────────────────────────────────────────────────
function loadWeekly() {
    var el = document.getElementById('tab-weekly');
    var now = new Date();
    var day = now.getUTCDay();
    var diff = day === 0 ? 6 : day - 1;
    var monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff, 0, 0, 0, 0));
    var weekTs = Math.floor(monday.getTime() / 1000);
    el.innerHTML = '<div style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<h2 style="margin:0;border:none">📊 Weekly Stats</h2>' +
        '<input type="date" id="weekly-date" value="' + monday.toISOString().slice(0,10) + '" style="padding:6px 10px;background:#14141e;border:1px solid #2a2a35;border-radius:6px;color:inherit;font-size:13px">' +
        '<button class="db-btn weekly-load-btn" style="background:#c8a86e;color:#0a0a0f;padding:6px 14px;font-size:12px">📅 Load Week</button>' +
        '</div><div id="weekly-summary" class="loading">Loading...</div><div id="weekly-table-wrap"></div>';
    // Event delegation for weekly actions
    if (!el._weeklyDelegation) {
        el._weeklyDelegation = true;
        el.addEventListener('click', function(e) {
            var target = e.target;
            if (target.classList.contains('weekly-load-btn')) {
                loadWeeklyData();
            } else if (target.classList.contains('weekly-sort')) {
                sortWeekly(target.dataset.col);
            }
        });
    }
    loadWeeklyData();
}

function loadWeeklyData() {
    var dateInput = document.getElementById('weekly-date');
    if (!dateInput) return;
    var parts = dateInput.value.split('-');
    var monday = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0));
    var weekTs = Math.floor(monday.getTime() / 1000);
    var summary = document.getElementById('weekly-summary');
    var tableWrap = document.getElementById('weekly-table-wrap');
    summary.innerHTML = '<div class="loading">Loading...</div>';
    tableWrap.innerHTML = '';
    API('/admin/weekly-stats?week_start=' + weekTs).then(function(res) {
        var stats = res.stats || [];
        var totalBattles = res.total_battles || 0;
        var totalPlayers = stats.length;
        var totalWins = stats.reduce(function(s, r) { return s + r.wins; }, 0);
        var totalLosses = stats.reduce(function(s, r) { return s + r.losses; }, 0);
        var totalDraws = stats.reduce(function(s, r) { return s + r.draws; }, 0);

        summary.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px">' +
            '  <div class="card-compact"><div class="lbl">Total Battles</div><div class="val" style="font-size:18px;font-weight:700">' + totalBattles.toLocaleString() + '</div></div>' +
            '  <div class="card-compact"><div class="lbl">Active Players</div><div class="val" style="font-size:18px;font-weight:700">' + totalPlayers + '</div></div>' +
            '  <div class="card-compact"><div class="lbl">W / L / D</div><div class="val" style="font-size:18px;font-weight:700">' + totalWins + ' / ' + totalLosses + ' / ' + totalDraws + '</div></div>' +
            '</div>';

        if (stats.length === 0) {
            tableWrap.innerHTML = '<p class="error" style="padding:24px">No battle data for this week.</p>';
            return;
        }
        var html = '<div class="table-wrap"><table><thead><tr>' +
            '<th>#</th><th>Name</th>' +
            '<th class="weekly-sort" data-col="class" style="cursor:pointer">Class</th>' +
            '<th class="weekly-sort" data-col="level" style="cursor:pointer">Lv</th>' +
            '<th>Skills</th>' +
            '<th class="weekly-sort" data-col="battles" style="cursor:pointer">Battles</th>' +
            '<th class="weekly-sort" data-col="wins" style="cursor:pointer">W</th>' +
            '<th class="weekly-sort" data-col="losses" style="cursor:pointer">L</th>' +
            '<th class="weekly-sort" data-col="draws" style="cursor:pointer">D</th>' +
            '<th class="weekly-sort" data-col="win_rate" style="cursor:pointer">Win %</th>' +
            '<th class="weekly-sort" data-col="dmg_dealt" style="cursor:pointer">Dmg ⚔️</th>' +
            '<th class="weekly-sort" data-col="dmg_taken" style="cursor:pointer">Dmg 💥</th>' +
            '</tr></thead><tbody>';
        stats.forEach(function(r, i) {
            var className = r.class ? r.class.charAt(0).toUpperCase() + r.class.slice(1) : '?';
            var classEmoji = {Warrior:'🛡️',Mage:'🔮',Rogue:'🗡️',Paladin:'✨'}[className] || '⚔️';
            html += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td><strong>' + escHtml(r.name) + '</strong></td>' +
                '<td>' + classEmoji + ' ' + className + '</td>' +
                '<td>' + r.level + '</td>' +
                '<td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(r.skills) + '">' + escHtml(r.skills) + '</td>' +
                '<td><strong>' + r.total_battles + '</strong></td>' +
                '<td style="color:#60e060">' + r.wins + '</td>' +
                '<td style="color:#e06060">' + r.losses + '</td>' +
                '<td>' + r.draws + '</td>' +
                '<td><strong>' + r.win_rate + '%</strong></td>' +
                '<td>' + Number(r.dmg_dealt || 0).toLocaleString() + '</td>' +
                '<td>' + Number(r.dmg_taken || 0).toLocaleString() + '</td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="margin-top:8px;font-size:11px;color:#6a6a70">Sort by most battles. Click column headers to sort.</div>';
        tableWrap.innerHTML = html;
        window._weeklyData = stats;
    }).catch(function(e) {
        summary.innerHTML = '<p class="error">Error loading weekly stats: ' + escHtml(e.message) + '</p>';
    });
}

function sortWeekly(col) {
    var data = window._weeklyData;
    if (!data) return;
    var colMap = { class:'class', level:'level', battles:'total_battles', wins:'wins', losses:'losses', draws:'draws', win_rate: function(r) { return parseFloat(r.win_rate); }, dmg_dealt:'dmg_dealt', dmg_taken:'dmg_taken' };
    var key = colMap[col];
    data.sort(function(a, b) {
        var va = typeof key === 'function' ? key(a) : a[key];
        var vb = typeof key === 'function' ? key(b) : b[key];
        if (typeof va === 'string') return va.localeCompare(vb);
        return (vb || 0) - (va || 0);
    });
    // Re-render table with sorted data
    var tableWrap = document.getElementById('weekly-table-wrap');
    var html = '<div class="table-wrap"><table><thead><tr>' +
        '<th>#</th><th>Name</th>' +
        '<th class="weekly-sort" data-col="class" style="cursor:pointer">Class</th>' +
        '<th class="weekly-sort" data-col="level" style="cursor:pointer">Lv</th>' +
        '<th>Skills</th>' +
        '<th class="weekly-sort" data-col="battles" style="cursor:pointer">Battles</th>' +
        '<th class="weekly-sort" data-col="wins" style="cursor:pointer">W</th>' +
            '<th class="weekly-sort" data-col="losses" style="cursor:pointer">L</th>' +
            '<th class="weekly-sort" data-col="draws" style="cursor:pointer">D</th>' +
            '<th class="weekly-sort" data-col="win_rate" style="cursor:pointer">Win %</th>' +
            '<th class="weekly-sort" data-col="dmg_dealt" style="cursor:pointer">Dmg ⚔️</th>' +
            '<th class="weekly-sort" data-col="dmg_taken" style="cursor:pointer">Dmg 💥</th>' +
            '</tr></thead><tbody>';
    data.forEach(function(r, i) {
        var className = r.class ? r.class.charAt(0).toUpperCase() + r.class.slice(1) : '?';
        var classEmoji = {Warrior:'🛡️',Mage:'🔮',Rogue:'🗡️',Paladin:'✨'}[className] || '⚔️';
        html += '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escHtml(r.name) + '</strong></td>' +
            '<td>' + classEmoji + ' ' + className + '</td>' +
            '<td>' + r.level + '</td>' +
            '<td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(r.skills) + '">' + escHtml(r.skills) + '</td>' +
            '<td><strong>' + r.total_battles + '</strong></td>' +
            '<td style="color:#60e060">' + r.wins + '</td>' +
            '<td style="color:#e06060">' + r.losses + '</td>' +
            '<td>' + r.draws + '</td>' +
            '<td><strong>' + r.win_rate + '%</strong></td>' +
            '<td>' + Number(r.dmg_dealt || 0).toLocaleString() + '</td>' +
            '<td>' + Number(r.dmg_taken || 0).toLocaleString() + '</td>' +
            '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top:8px;font-size:11px;color:#6a6a70">Sorted by ' + col + ' (desc).</div>';
    tableWrap.innerHTML = html;
}

var _consoleTimer = null;
var _consoleSince = null;

function loadConsole() {
    var el = document.getElementById('tab-console');
    el.innerHTML = '<div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<button class="db-btn" id="console-clear">Clear</button>' +
        '<button class="db-btn" id="console-refresh">Refresh Now</button>' +
        '<span style="color:#6a6a70;font-size:12px">Auto-refreshing every 3s</span>' +
        '<span style="flex:1"></span>' +
        '<span id="sw-toggle-wrap" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8a8a90">SW: <span id="sw-status-text">...</span> <button class="db-btn" id="sw-toggle-btn" style="font-size:11px;padding:2px 10px">Toggle</button></span>' +
        '<span id="bot-toggle-wrap" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8a8a90">Bot Detection: <span id="bot-status-text">...</span> <button class="db-btn" id="bot-toggle-btn" style="font-size:11px;padding:2px 10px">Toggle</button></span>' +
        '</div>' +
        '<div id="console-output" style="background:#0a0a0f;color:#c8d6e5;font-family:monospace;font-size:12px;padding:12px;border-radius:6px;max-height:70vh;overflow-y:auto;white-space:pre-wrap;word-break:break-all">Waiting for logs...</div>';

    _consoleSince = null;
    if (_consoleTimer) clearTimeout(_consoleTimer);
    pollConsole();

    document.getElementById('console-clear').addEventListener('click', function() {
        adminApi('POST', '/game/admin/bots/logs/clear').then(function() {
            var out = document.getElementById('console-output');
            out.textContent = 'Logs cleared.';
            _consoleSince = null;
        }).catch(function(e) { alert(e.message); });
    });

    document.getElementById('console-refresh').addEventListener('click', function() {
        _consoleSince = null;
        var out = document.getElementById('console-output');
        out.textContent = 'Refreshing...';
        if (_consoleTimer) clearTimeout(_consoleTimer);
        pollConsole();
    });

    // SW status toggle
    var swText = document.getElementById('sw-status-text');
    var swBtn = document.getElementById('sw-toggle-btn');
    var botText = document.getElementById('bot-status-text');
    var botBtn = document.getElementById('bot-toggle-btn');
    var tok = function() { return localStorage.getItem('rpg_token'); };

    function refreshSettings() {
        fetch('/api/game/admin/settings', { headers: { 'Authorization': 'Bearer ' + tok() } }).then(function(r) { return r.json(); }).then(function(s) {
            swText.textContent = s.sw_enabled === 'true' ? '✅ ON' : '❌ OFF';
            swText.style.color = s.sw_enabled === 'true' ? '#50c878' : '#e06060';
            botText.textContent = s.bot_detection_enabled === 'true' ? '✅ ON' : '❌ OFF';
            botText.style.color = s.bot_detection_enabled === 'true' ? '#50c878' : '#e06060';
        }).catch(function() { swText.textContent = '?'; botText.textContent = '?'; });
    }
    refreshSettings();

    swBtn.addEventListener('click', function() {
        var currentlyOn = swText.textContent.indexOf('ON') !== -1;
        fetch('/api/game/admin/sw-toggle', { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + tok() }, body: JSON.stringify({ enabled: !currentlyOn }) }).then(function() { refreshSettings(); });
    });
    
    botBtn.addEventListener('click', function() {
        var currentlyOn = botText.textContent.indexOf('ON') !== -1;
        fetch('/api/game/admin/settings/bot-detection', { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + tok() }, body: JSON.stringify({ enabled: !currentlyOn }) }).then(function() { refreshSettings(); });
    });
}

function pollConsole() {
    var url = '/admin/bots/logs' + (_consoleSince ? '?since=' + encodeURIComponent(_consoleSince) : '');
    API(url).then(function(data) {
        var out = document.getElementById('console-output');
        if (!out) return;
        if (!data.logs || !data.logs.length) {
            if (!_consoleSince && out.textContent === 'Waiting for logs...') {
                out.textContent = 'No bot logs yet. Waiting...';
            }
            return;
        }
        if (out.textContent === 'Waiting for logs...' || out.textContent === 'Refreshing...' || out.textContent === 'No bot logs yet. Waiting...' || out.textContent === 'Logs cleared.') {
            out.textContent = '';
        }
        data.logs.forEach(function(e) {
            var line = '[' + e.ts.slice(11, 19) + '][' + e.name + '] ' + e.msg;
            out.appendChild(document.createTextNode(line));
            out.appendChild(document.createElement('br'));
        });
        _consoleSince = data.logs[data.logs.length - 1].ts;
        out.scrollTop = out.scrollHeight;
    }).catch(function(e) {
        var out = document.getElementById('console-output');
        if (out) out.textContent = 'Poll error: ' + (e.message || e);
    });

    _consoleTimer = setTimeout(pollConsole, 3000);
}

function toggleConfirmed(charName, confirmed) {
    adminApi('POST', '/admin/flagged/' + encodeURIComponent(charName) + '/confirm', { confirmed: confirmed })
        .then(function() { loadFlagged(); })
        .catch(function(e) { alert('Failed to update confirmed status: ' + e.message); });
}

// ── Flagged Characters ───────────────────────────────────────────────
function loadFlagged() {
    var el = document.getElementById('tab-flagged');
    el.innerHTML = '<div class="card-compact">' +
        '<div class="row"><div class="lbl">Selective Scan</div>' +
        '<div class="val"><input type="text" id="scan-char-input" placeholder="Character name" class="ed" style="width:150px">' +
        '<button class="db-btn btn-apply" onclick="scanCharacter()">Scan</button>' +
        '<span id="scan-status" style="margin-left:10px;font-size:12px"></span></div></div>' +
    '</div><div class="loading">Loading flagged characters...</div>';
    
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/flagged-characters', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { return r.json(); })
        .then(function(rows) {
            if (!rows || !rows.length) {
                el.querySelector('.loading').outerHTML = '<div class="card-compact"><p style="color:#6a6a70;text-align:center">No flagged characters.</p></div>';
                return;
            }
            var html = '<div class="table-wrap"><table><thead><tr>' +
                '<th>Name</th>' +
                '<th>Reason</th>' +
                '<th title="Total flag events">Flags</th>' +
                '<th title="Distinct signal types">Signals</th>' +
                '<th>Detected</th>' +
                '<th>Last Seen</th>' +
                '<th>Confirmed</th>' +
                '<th></th></tr></thead><tbody>';
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var det = r.detected_at ? new Date(r.detected_at * 1000).toLocaleString() : '?';
                var seen = r.last_seen_at ? new Date(r.last_seen_at * 1000).toLocaleString() : '?';
                var confirmedBtn = '<button class="db-btn ' + (r.confirmed ? 'btn-yes' : 'btn-no') + '" style="font-size:10px;padding:2px 6px" onclick="toggleConfirmed(\'' + esc(r.char_name) + '\', ' + !r.confirmed + ')">' + (r.confirmed ? '✅ Yes' : '❌ No') + '</button>';
                var signalBadge = (r.distinct_signals || 0) > 1
                    ? '<span style="color:#e06060;font-weight:700">' + (r.distinct_signals || 0) + '</span>'
                    : '<span style="color:#6a6a70">' + (r.distinct_signals || 0) + '</span>';
                html += '<tr class="flag-row" data-char="' + esc(r.char_name) + '">' +
                    '<td><a href="#" class="flag-name-link" data-name="' + esc(r.char_name) + '" style="color:#e06060;font-weight:700;text-decoration:none">' + esc(r.char_name) + '</a></td>' +
                    '<td style="color:#8a8a90;font-size:11px" title="Types: ' + esc(r.signal_types || '') + '">' + esc(r.reason || '') + '</td>' +
                    '<td style="text-align:center;font-size:12px;cursor:pointer" class="flag-expand-btn" title="Click to see events">' + (r.signal_count || 0) + ' ▶</td>' +
                    '<td style="text-align:center;font-size:12px">' + signalBadge + '</td>' +
                    '<td style="font-size:11px">' + det + '</td>' +
                    '<td style="font-size:11px">' + seen + '</td>' +
                    '<td>' + confirmedBtn + '</td></tr>' +
                    '<tr id="flag-events-' + esc(r.char_name) + '" style="display:none"><td colspan="8"><div style="padding:8px;background:#15151a;border-radius:4px;max-height:300px;overflow-y:auto"><div class="loading" style="padding:8px">Loading events...</div></div></td></tr>';
            }
            html += '</tbody></table></div>';
            el.querySelector('.loading').outerHTML = html;
            // Expand/collapse flag events
            el.querySelectorAll('.flag-expand-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var row = this.closest('.flag-row');
                    var name = row.getAttribute('data-char');
                    var eventsRow = document.getElementById('flag-events-' + name);
                    if (!eventsRow) return;
                    if (eventsRow.style.display !== 'none') {
                        eventsRow.style.display = 'none';
                        this.innerHTML = this.innerHTML.replace('▼', '▶');
                        return;
                    }
                    eventsRow.style.display = '';
                    this.innerHTML = this.innerHTML.replace('▶', '▼');
                    var div = eventsRow.querySelector('div');
                    var content = div ? div.querySelector('div') : null;
                    if (!content) return;
                    if (content.textContent === 'Loading events...' || content.classList.contains('loading')) {
                        var token = localStorage.getItem('rpg_token');
                        fetch('/api/game/admin/flagged-events/' + encodeURIComponent(name), { headers: { 'Authorization': 'Bearer ' + token } })
                            .then(function(r) { return r.json(); })
                            .then(function(events) {
                                content.innerHTML = events.map(function(e) {
                                    return '<div style="font-size:11px;padding:4px;border-bottom:1px solid #2a2a35">' +
                                        '<span style="color:#8a8a90">' + new Date(e.ts * 1000).toLocaleString() + '</span> ' +
                                        '<span style="color:#c8a86e">' + esc(e.type) + '</span>: ' + esc(e.detail) +
                                    '</div>';
                                }).join('');
                            });
                    }
                });
            });
        });
}

function scanCharacter() {
    var name = document.getElementById('scan-char-input').value.trim();
    if (!name) return;
    var status = document.getElementById('scan-status');
    status.textContent = 'Scanning...';
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/scan-character/' + encodeURIComponent(name), { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            status.textContent = res.detected ? 'Bot detected! (' + res.reason + ')' : 'No bot detected.';
            if (res.detected) loadFlagged(); // Reload to show new flag
        })
        .catch(function(e) { status.textContent = 'Error: ' + e.message; });
}
window.scanCharacter = scanCharacter;

function renderCharacterLogs(name) {
    var el = document.getElementById('tab-flagged');
    el.innerHTML = '<div class="loading">Loading logs for ' + esc(name) + '...</div>';
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/character-logs/' + encodeURIComponent(name), { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var html = '<div style="margin-bottom:8px"><button class="tab-btn flagged-back-btn" style="display:inline-block;padding:4px 12px;border:1px solid #2a2a35;background:#14141e;color:#8a8a90;border-radius:4px;cursor:pointer">← Back to flagged</button>';
            html += ' <span style="color:#e06060;font-weight:700;font-size:14px">' + esc(name) + '</span></div>';

            // API logs
            html += '<h2>API Log (' + (data.api_log || []).length + ')</h2>';
            html += '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th></tr></thead><tbody>';
            var api = data.api_log || [];
            for (var i = 0; i < api.length; i++) {
                var a = api[i];
                var t = a.ts ? new Date(a.ts * 1000).toLocaleString() : '?';
                var methodClass = a.method === 'POST' ? 'badge-yes' : 'badge-no';
                html += '<tr><td style="font-size:11px">' + t + '</td>' +
                    '<td><span class="badge ' + methodClass + '" style="font-size:10px">' + esc(a.method) + '</span></td>' +
                    '<td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.path || '') + '</td>' +
                    '<td style="font-size:11px">' + (a.status || '') + '</td></tr>';
            }
            html += '</tbody></table></div>';

            // Battles
            html += '<h2 style="margin-top:16px">Battles (' + (data.battles || []).length + ')</h2>';
            html += '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Attacker</th><th>Defender</th><th>Winner</th></tr></thead><tbody>';
            var bat = data.battles || [];
            for (var i = 0; i < bat.length; i++) {
                var b = bat[i];
                var t = b.ts ? new Date(b.ts * 1000).toLocaleString() : '?';
                var winnerLabel = b.winner_id === 0 ? 'Draw' : (b.winner_id ? 'Attacker' : 'Defender');
                html += '<tr><td style="font-size:11px">' + t + '</td>' +
                    '<td style="font-size:12px">' + esc(b.attacker_name || '?') + '</td>' +
                    '<td style="font-size:12px">' + esc(b.defender_name || '?') + '</td>' +
                    '<td style="font-size:11px">' + winnerLabel + '</td></tr>';
            }
            html += '</tbody></table></div>';

            el.innerHTML = html;
        })
        .catch(function(e) {
            el.innerHTML = '<div class="error">Failed to load logs: ' + esc(e.message) + '</div>';
        });
}

// Click handler for flagged character names
document.addEventListener('click', function(e) {
    var link = e.target.closest('.flag-name-link');
    if (!link) return;
    e.preventDefault();
    var name = link.getAttribute('data-name');
    if (name) renderCharacterLogs(name);
});

document.addEventListener('click', function(e) {
    var btn = e.target.closest('.flagged-back-btn');
    if (!btn) return;
    e.preventDefault();
    loadFlagged();
});

document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="grant-mod"]');
    if (!btn) return;
    e.preventDefault();
    var sel = document.getElementById('mod-user-select');
    if (!sel || !sel.value) return;
    fetch('/api/game/admin/set-moderator', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('rpg_token')}, body:JSON.stringify({userId:parseInt(sel.value), moderator:true}) }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        loadModerators();
    }).catch(function(e) { alert('Error: ' + e.message); });
});

document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="revoke-mod"]');
    if (!btn) return;
    e.preventDefault();
    var userId = parseInt(btn.getAttribute('data-user-id'));
    var username = btn.getAttribute('data-username');
    if (!confirm('Revoke moderator from ' + username + '?')) return;
    fetch('/api/game/admin/set-moderator', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('rpg_token')}, body:JSON.stringify({userId:userId, moderator:false}) }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function() {
        loadModerators();
    }).catch(function(e) { alert('Error: ' + e.message); });
});

function loadModerators() {
    var tab = document.getElementById('tab-moderators');
    API('/admin/moderators').then(function(mods) {
        API('/admin/users').then(function(users) {
            var html = '<h3 style="margin-bottom:12px">Manage Moderators</h3>';
            html += '<div style="display:flex;gap:8px;margin-bottom:20px;align-items:center">';
            html += '<select id="mod-user-select" style="flex:1;padding:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e2e8f0">';
            html += '<option value="">-- Select user --</option>';
            var existingModIds = {};
            mods.forEach(function(m) { existingModIds[m.id] = true; });
            users.forEach(function(u) {
                if (!u.is_admin) html += '<option value="' + u.id + '">' + escHtml(u.username) + (u.is_moderator ? ' (moderator)' : '') + '</option>';
            });
            html += '</select>';
            html += '<button data-action="grant-mod" style="padding:8px 16px;background:#2d7a4a;border:none;border-radius:6px;color:#fff;cursor:pointer">Grant Moderator</button>';
            html += '</div>';
            html += '<h4 style="margin-bottom:8px;color:var(--text-dim)">Current Moderators</h4>';
            html += '<table style="width:100%;border-collapse:collapse"><tr style="background:rgba(255,255,255,0.03)"><th style="padding:8px;text-align:left">Username</th><th style="padding:8px;text-align:left">Role</th><th style="padding:8px;text-align:left">Actions</th></tr>';
            mods.forEach(function(m) {
                var role = m.is_admin ? 'Admin' : (m.is_moderator ? 'Moderator' : 'User');
                html += '<tr><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05)">' + escHtml(m.username) + '</td>';
                html += '<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05)">' + role + '</td>';
                html += '<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05)">';
                if (!m.is_admin) html += '<button data-action="revoke-mod" data-user-id="' + m.id + '" data-username="' + escHtml(m.username) + '" style="padding:4px 10px;background:#8a3a3a;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:0.75rem">Revoke</button>';
                else html += '<span style="color:var(--gold);font-size:0.75rem">👑</span>';
                html += '</td></tr>';
            });
            html += '</table>';
            tab.innerHTML = html;
            tab.dataset.loaded = '1';
        });
    }).catch(function(e) {
        tab.innerHTML = '<div style="color:#e06060">Error: ' + e.message + '</div>';
    });
}

function grantModerator() {
    var sel = document.getElementById('mod-user-select');
    if (!sel || !sel.value) return;
    API('/admin/set-moderator', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('rpg_token')}, body:JSON.stringify({userId:parseInt(sel.value), moderator:true}) }).then(function() {
        loadModerators();
    }).catch(function(e) { alert('Error: ' + e.message); });
}

function revokeModerator(userId, username) {
    if (!confirm('Revoke moderator from ' + username + '?')) return;
    API('/admin/set-moderator', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('rpg_token')}, body:JSON.stringify({userId:userId, moderator:false}) }).then(function() {
        loadModerators();
    }).catch(function(e) { alert('Error: ' + e.message); });
}

// ── Bans ──────────────────────────────────────────────────────────────
function loadBans() {
    var el = document.getElementById('tab-bans');
    el.innerHTML = '<div class="loading">Loading users...</div>';
    var token = localStorage.getItem('rpg_token');
    var headers = { 'Authorization': 'Bearer ' + token };
    fetch('/api/game/admin/users', { headers: headers })
        .then(function(r) { return r.json(); })
        .then(function(users) {
            if (!users || !users.length) {
                el.innerHTML = '<div class="card-compact"><p style="color:#6a6a70;text-align:center">No users found.</p></div>';
                return;
            }
            var h = '<div class="table-wrap"><table><thead><tr>' +
                '<th>ID</th><th>Username</th><th>Role</th><th>Ban Level</th><th>Reason</th><th>Expires</th><th>Banned By</th>' +
                (window._isAdmin ? '<th>IP</th>' : '') +
                '<th>Actions</th>' +
                '</tr></thead><tbody>';
            for (var i = 0; i < users.length; i++) {
                var u = users[i];
                var role = u.is_admin ? '👑 Admin' : u.is_moderator ? '⭐ Mod' : 'User';
                var banLvl = ['None', '⚠️ Warning', '🔒 Temp', '🔒 Permanent'][u.ban_level] || 'Unknown';
                var expires = u.ban_expires_at ? new Date(u.ban_expires_at * 1000).toLocaleString() : '—';
                var reason = esc(u.ban_reason || '—');
                var canAct = !u.is_admin || window._isAdmin;
                h += '<tr style="' + (u.ban_level > 0 ? 'background:rgba(224,96,96,0.08)' : '') + '">' +
                    '<td>' + u.id + '</td>' +
                    '<td>' + esc(u.username) + '</td>' +
                    '<td>' + role + '</td>' +
                    '<td>' + banLvl + '</td>' +
                    '<td>' + reason + '</td>' +
                    '<td style="font-size:11px">' + expires + '</td>' +
                    '<td>' + (u.banned_by || '—') + '</td>' +
                    (window._isAdmin
                        ? '<td>' + (u.ip_address ? '<a href="#" data-ip-action="search" data-ip="' + escHtml(u.ip_address) + '" style="color:#8ab4f8;text-decoration:none;font-size:11px">' + escHtml(u.ip_address) + '</a>' : '<span style="color:#555">—</span>') + '</td>'
                        : '') +
                    '<td style="white-space:nowrap">' +
                        (u.ban_level > 0
                            ? '<button class="db-btn btn-yes" data-ban-action="unban" data-user-id="' + u.id + '" style="font-size:10px;padding:2px 6px">Unban</button>'
                            : '') +
                        (canAct
                            ? ' <button class="db-btn" data-ban-action="show-dialog" data-user-id="' + u.id + '" data-username="' + escHtml(u.username) + '" style="font-size:10px;padding:2px 6px">Ban</button>'
                            : ' <span style="color:#6a6a70;font-size:10px">Protected</span>') +
                    '</td></tr>';
            }
            h += '</tbody></table></div>';
            el.innerHTML = h;
        })
        .catch(function(e) { el.innerHTML = '<div class="error">' + e.message + '</div>'; });
}

function showBanDialog(userId, username) {
    var el = document.getElementById('tab-bans');
    var html = '<div class="card-compact" style="margin-bottom:10px;border-color:#c8a86e44">' +
        '<div style="font-size:14px;font-weight:600;margin-bottom:8px">Ban: ' + esc(username) + '</div>' +
        '<label style="display:block;margin-bottom:6px;font-size:12px">Level:' +
            '<select id="ban-level" style="display:block;width:100%;margin-top:2px;padding:4px;background:#14141e;color:#e0dcd0;border:1px solid #2a2a35;border-radius:4px">' +
                '<option value="1">⚠️ Warning</option>' +
                '<option value="2">🔒 Temporary Lock</option>' +
                '<option value="3">🔒 Permanent Ban</option>' +
            '</select></label>' +
        '<label style="display:block;margin-bottom:6px;font-size:12px">Reason:' +
            '<input id="ban-reason" type="text" style="display:block;width:100%;margin-top:2px;padding:4px;background:#14141e;color:#e0dcd0;border:1px solid #2a2a35;border-radius:4px" placeholder="ToS violation...">' +
        '</label>' +
        '<label id="ban-duration-group" style="display:block;margin-bottom:8px;font-size:12px">Duration (minutes):' +
            '<input id="ban-duration" type="number" min="1" value="60" style="display:block;width:100%;margin-top:2px;padding:4px;background:#14141e;color:#e0dcd0;border:1px solid #2a2a35;border-radius:4px">' +
        '</label>' +
        '<div style="display:flex;gap:6px">' +
            '<button class="db-btn btn-yes" data-ban-action="apply" data-user-id="' + userId + '" style="font-size:11px;padding:4px 12px">Apply</button>' +
            '<button class="db-btn" data-ban-action="cancel" style="font-size:11px;padding:4px 12px">Cancel</button>' +
        '</div></div>';
    // Insert above table
    var existing = el.querySelector('.table-wrap');
    if (existing) {
        existing.insertAdjacentHTML('beforebegin', html);
    } else {
        el.innerHTML = html + el.innerHTML;
    }
    // Toggle duration field based on level
    document.getElementById('ban-level').addEventListener('change', function() {
        var grp = document.getElementById('ban-duration-group');
        grp.style.display = this.value === '2' ? 'block' : 'none';
    });
    if (document.getElementById('ban-level').value !== '2') {
        document.getElementById('ban-duration-group').style.display = 'none';
    }
}

function applyBan(userId) {
    var level = parseInt(document.getElementById('ban-level').value);
    var reason = document.getElementById('ban-reason').value;
    var duration = parseInt(document.getElementById('ban-duration').value) || 60;
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/users/' + userId + '/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ level: level, reason: reason, duration_minutes: duration })
    }).then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.error) { alert('Error: ' + res.error); return; }
        loadBans();
    }).catch(function(e) { alert('Error: ' + e.message); });
}

function unbanUser(userId) {
    if (!confirm('Unban this user?')) return;
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/users/' + userId + '/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.error) { alert('Error: ' + res.error); return; }
        loadBans();
    }).catch(function(e) { alert('Error: ' + e.message); });
}

function loadUsersByIp(ip) {
    var el = document.getElementById('tab-bans');
    el.innerHTML = '<div class="loading">Searching IP: ' + escHtml(ip) + '...</div>';
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/users-by-ip?ip=' + encodeURIComponent(ip), { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { return r.json(); })
        .then(function(users) {
            if (!users || !users.length) {
                el.innerHTML = '<div class="card-compact"><p style="color:#6a6a70;text-align:center">No users found with IP: ' + escHtml(ip) + '</p>' +
                    '<div style="margin-top:10px;text-align:center"><button class="db-btn" data-ban-action="cancel" style="font-size:11px;padding:4px 12px">← Back</button></div></div>';
                return;
            }
            var h = '<div style="margin-bottom:8px"><button class="db-btn" data-ban-action="cancel" style="font-size:11px;padding:4px 10px">← Back</button> <span style="color:#8ab4f8;font-size:12px">IP: ' + escHtml(ip) + ' (' + users.length + ' users)</span></div>';
            h += '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Ban Level</th><th>Reason</th><th>Actions</th></tr></thead><tbody>';
            for (var i = 0; i < users.length; i++) {
                var u = users[i];
                var role = u.is_admin ? '👑 Admin' : u.is_moderator ? '⭐ Mod' : 'User';
                var banLvl = ['None', '⚠️ Warning', '🔒 Temp', '🔒 Permanent'][u.ban_level] || 'Unknown';
                var reason = esc(u.ban_reason || '—');
                var canAct = !u.is_admin || window._isAdmin;
                h += '<tr style="' + (u.ban_level > 0 ? 'background:rgba(224,96,96,0.08)' : '') + '">' +
                    '<td>' + u.id + '</td>' +
                    '<td>' + esc(u.username) + '</td>' +
                    '<td>' + role + '</td>' +
                    '<td>' + banLvl + '</td>' +
                    '<td>' + reason + '</td>' +
                    '<td>' +
                        (canAct
                            ? '<button class="db-btn" data-ban-action="show-dialog" data-user-id="' + u.id + '" data-username="' + escHtml(u.username) + '" style="font-size:10px;padding:2px 6px">Ban</button>'
                            : '<span style="color:#6a6a70;font-size:10px">Protected</span>') +
                    '</td></tr>';
            }
            h += '</tbody></table></div>';
            el.innerHTML = h;
        })
        .catch(function(e) { el.innerHTML = '<div class="error">' + e.message + '</div>'; });
}

document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-ban-action]');
    if (!btn) return;
    e.preventDefault();
    var action = btn.getAttribute('data-ban-action');
    var userId = parseInt(btn.getAttribute('data-user-id'));
    switch (action) {
        case 'show-dialog':
            showBanDialog(userId, btn.getAttribute('data-username'));
            break;
        case 'apply':
            applyBan(userId);
            break;
        case 'unban':
            unbanUser(userId);
            break;
        case 'cancel':
            loadBans();
            break;
    }
});

document.addEventListener('click', function(e) {
    var link = e.target.closest('[data-ip-action="search"]');
    if (!link) return;
    e.preventDefault();
    var ip = link.getAttribute('data-ip');
    if (ip) loadUsersByIp(ip);
});

init();
