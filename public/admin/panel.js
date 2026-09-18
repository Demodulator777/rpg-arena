var API = function(path) {
    var token = localStorage.getItem('rpg_token');
    return fetch('/api/game' + path, { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });
};

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// The admin panel is served per-origin (each server runs its own process + DB on a
// subdomain). This selector controls WHICH server's panel you're interacting with by
// navigating between the two origins' /admin-panel pages.
var ADMIN_SERVERS = [
    { id: 'beta',    host: 'battle-online.com',   url: 'https://battle-online.com/admin-panel' },
    { id: 'server1', host: 's1.battle-online.com', url: 'https://s1.battle-online.com/admin-panel' }
];
function adminCurrentServer() {
    var host = String(location.hostname || '').toLowerCase().replace(/^www\./, '');
    var s = null;
    for (var i = 0; i < ADMIN_SERVERS.length; i++) if (ADMIN_SERVERS[i].host === host) { s = ADMIN_SERVERS[i]; break; }
    return s ? s.id : 'beta';
}
function initAdminServerSwitcher() {
    var sel = document.getElementById('admin-server-select');
    if (!sel) return;
    sel.value = adminCurrentServer();
    sel.addEventListener('change', function () {
        var id = sel.value;
        var target = null;
        for (var i = 0; i < ADMIN_SERVERS.length; i++) if (ADMIN_SERVERS[i].id === id) { target = ADMIN_SERVERS[i]; break; }
        if (target && target.id !== adminCurrentServer()) window.location.href = target.url;
    });
}

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
        { id: 'profile-pic-review', label: 'Profile Pic Review' },
    ];
if (!isModOnly) {
        tabs.push(
            { id: 'banners', label: 'Banners' },
            { id: 'rewards', label: 'Rewards' },
            { id: 'vouchers', label: 'Vouchers' },
            { id: 'weekly', label: 'Weekly Stats' },
            { id: 'db', label: 'Database' },
            { id: 'tournaments', label: 'Tournaments' },
            { id: 'bots', label: 'Bots' },
            { id: 'settings', label: 'Settings' },
            { id: 'android', label: 'Android Testers' },
            { id: 'console', label: 'Console' },
            { id: 'moderators', label: 'Moderators' },
            { id: 'ringforge', label: 'Ring Forge' }
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
    updatePendingBadge();
    setInterval(updatePendingBadge, 30000);
}

function loadTab(name) {
    if (name === 'csp') loadCsp();
    else if (name === 'dom') loadDom();
    else if (name === 'stale') loadStale();
    else if (name === 'bugs') loadBugs();
    else if (name === 'banners') loadBanners();
    else if (name === 'rewards') loadRewards();
    else if (name === 'vouchers') loadVouchers();
    else if (name === 'db') loadDbAdmin();
    else if (name === 'tournaments') loadTournaments();
    else if (name === 'actions') loadActions();
    else if (name === 'flagged') loadFlagged();
    else if (name === 'bots') loadBots();
    else if (name === 'console') loadConsole();
    else if (name === 'moderators') loadModerators();
    else if (name === 'weekly') loadWeekly();
    else if (name === 'bans') loadBans();
    else if (name === 'profile-pic-review') renderProfilePicReview();
else if (name === 'settings') loadSettings();
    else if (name === 'android') loadAndroid();
    else if (name === 'ringforge') loadRingForge();
}

function loadAndroid() {
    var el = document.getElementById('tab-android');
    el.innerHTML = '<div class="loading">Loading applicants...</div>';
    var tok = function() { return localStorage.getItem('rpg_token'); };
    fetch('/api/game/admin/android-applicants', { headers: { 'Authorization': 'Bearer ' + tok() } })
        .then(function(r) { return r.json(); })
        .then(function(list) {
            if (!Array.isArray(list)) {
                el.innerHTML = '<div class="loading">' + ((list && list.error) || 'Error loading') + '</div>';
                return;
            }
            var statuses = ['pending', 'accepted', 'rejected', 'removed'];
            var rows = list.map(function(a) {
                var d = a.created_at ? new Date(a.created_at).toLocaleString() : '';
                var opts = statuses.map(function(s) {
                    return '<option' + (s === a.status ? ' selected' : '') + '>' + s + '</option>';
                }).join('');
                return '<tr>' +
                    '<td>' + (a.email || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td>' +
                    '<td>' + (a.status || '') + '</td>' +
                    '<td>' + d + '</td>' +
                    '<td><select data-apply-email="' + encodeURIComponent(a.email || '') + '">' + opts + '</select></td>' +
                    '</tr>';
            }).join('');
            el.innerHTML =
                '<h2>Android Testers</h2>' +
                '<p style="color:#8a8a90;font-size:12px">Closed-testing applicants from the auth screen. Update a status to accept/reject after adding them in the Play Console.</p>' +
                '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
                '<thead><tr style="text-align:left;color:#8a8a90">' +
                '<th style="padding:6px">Email</th><th style="padding:6px">Status</th><th style="padding:6px">Applied</th><th style="padding:6px">Set status</th>' +
                '</tr></thead><tbody>' + rows + '</tbody></table>';
            el.querySelectorAll('select[data-apply-email]').forEach(function(sel) {
                sel.addEventListener('change', function() {
                    fetch('/api/game/admin/android-applicants/' + encodeURIComponent(sel.dataset.applyEmail) + '/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok() },
                        body: JSON.stringify({ status: sel.value })
                    }).catch(function() {});
                });
            });
        })
        .catch(function() { el.innerHTML = '<div class="loading">Error loading applicants</div>'; });
}

function loadSettings() {
    var el = document.getElementById('tab-settings');
    el.innerHTML = '<div class="loading">Loading settings...</div>';

    el.innerHTML = '<h2>Feature Toggles</h2>' +
        '<div class="card-compact">' +
            '<div class="row">' +
                '<span class="lbl">Spirit Beast</span>' +
                '<span id="sb-status-text" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8a8a90">...</span>' +
                '<button class="db-btn" id="sb-toggle-btn" style="font-size:11px;padding:2px 10px">Toggle</button>' +
            '</div>' +
        '</div>';

    var sbTimer = document.getElementById('sb-status-text');
    var sbBtn = document.getElementById('sb-toggle-btn');

    function refreshSettings() {
        fetch('/api/game/admin/settings', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } })
            .then(function(r) { return r.json(); })
            .then(function(s) {
                var on = !!s.spirit_beast_enabled;
                sbTimer.textContent = on ? '✅ ON' : '❌ OFF';
                sbTimer.style.color = on ? '#50c878' : '#e06060';
            }).catch(function() { sbTimer.textContent = '?'; });
    }
    refreshSettings();

    sbBtn.addEventListener('click', function() {
        var currentlyOn = sbTimer.textContent.indexOf('ON') !== -1;
        fetch('/api/game/admin/settings/spirit-beast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
            body: JSON.stringify({ enabled: !currentlyOn })
        }).then(function(r) {
            if (!r.ok) { sbTimer.textContent = '❌ write failed'; sbTimer.style.color = '#e06060'; return; }
            refreshSettings();
        }).catch(function() { sbTimer.textContent = '❌ network error'; sbTimer.style.color = '#e06060'; });
    });
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
        var pk = res.pk || 'id';
        var cols = Object.keys(data[0]);
        var html = '<div class="db-scroll"><table>' +
            '<thead><tr>' + cols.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th>Actions</th></tr></thead>' +
            '<tbody>';
        
        data.forEach(function(row, rowIdx) {
            var rid = 'db-r' + page + '-' + rowIdx;
            var keyVal = row[pk] ?? '';
            html += '<tr id="' + rid + '">';
            cols.forEach(function(c) {
                var val = String(row[c] ?? '');
                html += '<td title="' + esc(val) + '">' +
                    '<span class="dsp">' + esc(val) + '</span>' +
                    '<input type="text" value="' + esc(val) + '" class="ed" ' +
                    'data-table="' + table + '" data-field="' + c + '" data-key="' + pk + '" data-id="' + keyVal + '">' +
                    '</td>';
            });
            html += '<td class="td-actions">' +
                '<button class="db-btn db-btn-edit ed-btn" data-rid="' + rid + '">Edit</button>' +
                '<button class="db-btn db-btn-apply ap-btn" data-rid="' + rid + '" style="display:none">Apply</button>' +
                '<button class="db-btn db-btn-cancel ca-btn" data-rid="' + rid + '" style="display:none">Cancel</button>' +
                '<button class="db-btn db-btn-del del-btn" data-table="' + table + '" data-key="' + pk + '" data-id="' + keyVal + '" data-page="' + page + '">Delete</button>' +
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
                if (confirm('Delete this record?')) deleteRecord(table, btn.dataset.id, page, btn.dataset.key);
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

function deleteRecord(table, id, page, key) {
    fetch('/api/db/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ table: table, id: id, key: key })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.success) alert('Failed to delete: ' + res.error);
        else queryTable(table, page);
    });
}

function saveCell(input) {
    return fetch('/api/db/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ table: input.dataset.table, field: input.dataset.field, value: input.value, id: input.dataset.id, key: input.dataset.key })
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
            '<th>Reported Player</th>' +
            '<th class="sortable" data-tab="bugs" data-col="title">Title</th>' +
            '<th>Screenshot</th>' +
        '</tr></thead><tbody id="bugs-tbody"></tbody></table></div>';
        window._bugsData = data;
        renderBugsTable(data);
    }).catch(function(e) { el.innerHTML = '<p class="error">' + e.message + '</p>'; });
}

function reportBadge(cat) {
    var map = { 'cheating': 'yes', 'abuse': 'yes', 'bug': 'yes' };
    return '<span class="badge badge-' + (map[cat] ? 'yes' : 'no') + '">' + esc(cat || '') + '</span>';
}
function renderBugsTable(data) {
    var tbody = document.getElementById('bugs-tbody');
    tbody.innerHTML = data.map(function(b) {
        return '<tr><td style="color:#6a6a70">' + b.id + '</td><td style="white-space:nowrap">' + b.report_timestamp + '</td><td>' + (b.username || '') + '</td><td>' + (b.character_name || '') + '</td><td>' + reportBadge(b.category) + '</td><td style="white-space:nowrap">' + (b.reported_player ? '<b style="color:#e74c3c">@' + esc(b.reported_player) + '</b>' : '') + '</td><td class="bug-title" title="' + esc(b.title) + '">' + esc(b.title) + '</td><td>' + (b.has_screenshot ? '<a href="/api/game/bug-report/screenshot/' + b.id + '" target="_blank" style="color:#5dade2">View</a>' : '<span style="color:#4a4a50">No</span>') + '</td></tr>';
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
        '<button class="db-btn weekly-recompute-squad" style="background:#7d3c98;color:#fff;padding:6px 14px;font-size:12px">🏰 Recompute Squad Winners</button>' +
        '</div><div id="weekly-summary" class="loading">Loading...</div><div id="weekly-table-wrap"></div>';
    // Event delegation for weekly actions
    if (!el._weeklyDelegation) {
        el._weeklyDelegation = true;
        el.addEventListener('click', function(e) {
            var target = e.target;
            if (target.classList.contains('weekly-load-btn')) {
                loadWeeklyData();
            } else if (target.classList.contains('weekly-recompute-squad')) {
                recomputeWeeklySquad();
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
        var squads = res.squads || [];
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

        // Squad weekly rollup (top-10 members' wins/damage, mirrors leaderboard scoring)
        if (squads.length) {
            var squadHtml = '<div style="margin-bottom:14px"><h3 style="margin:0 0 6px;border:none;font-size:15px">🏰 Squad Weekly (sum of top-10 members)</h3><div class="table-wrap" style="margin-bottom:8px"><table><thead><tr>' +
                '<th>#</th><th>Squad</th>' +
                '<th>Members</th><th>Wins (top10)</th><th>Win Contribs</th><th>Damage (top10)</th><th>Dmg Contribs</th>' +
                '</tr></thead><tbody>';
            squads.forEach(function(s, i) {
                squadHtml += '<tr>' +
                    '<td>' + (i + 1) + '</td>' +
                    '<td><strong>' + escHtml(s.name) + '</strong> ' + (s.tag ? '<span style="color:#8a8a92">[' + escHtml(s.tag) + ']</span>' : '') + '</td>' +
                    '<td>' + s.member_count + '</td>' +
                    '<td style="color:#60e060"><strong>' + Number(s.total_wins).toLocaleString() + '</strong></td>' +
                    '<td>' + s.counted_wins + '</td>' +
                    '<td style="color:#f1c40f"><strong>' + Number(s.total_dmg).toLocaleString() + '</strong></td>' +
                    '<td>' + s.counted_dmg + '</td>' +
                    '</tr>';
            });
            squadHtml += '</tbody></table></div></div>';
            tableWrap.innerHTML = squadHtml;
        }

        if (stats.length === 0) {
            tableWrap.innerHTML += '<p class="error" style="padding:24px">No battle data for this week.</p>';
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
        tableWrap.innerHTML += html;
        window._weeklyData = stats;
    }).catch(function(e) {
        summary.innerHTML = '<p class="error">Error loading weekly stats: ' + escHtml(e.message) + '</p>';
    });
}

function recomputeWeeklySquad() {
    var dateInput = document.getElementById('weekly-date');
    if (!dateInput) return;
    var parts = dateInput.value.split('-');
    var monday = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0));
    var weekTs = Math.floor(monday.getTime() / 1000);
    if (!window.confirm('Recompute squad winners for this week and overwrite the stored Hall of Fame record? Rewards already sent are left as-is.')) return;
    fetch('/api/game/admin/weekly-squad-recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ week_start: weekTs })
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function(res) {
        var lines = ['Squad standings recomputed for week ' + new Date(res.week_start * 1000).toISOString().slice(0, 10) + ':'];
        if (res.dmgTop10) lines.push('Damage top10: ' + res.dmgTop10.map(function(x) { return x.name + ' (' + Number(x.total_dmg || 0).toLocaleString() + ')'; }).join(', '));
        if (res.winTop10) lines.push('Wins top10: ' + res.winTop10.map(function(x) { return x.name + ' (' + Number(x.total_wins || 0) + ')'; }).join(', '));
        window.alert(lines.join('\n'));
        loadWeeklyData();
    }).catch(function(e) {
        window.alert('Error: ' + (e.message || e));
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
        '<span id="story-boost-toggle-wrap" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8a8a90">Story Boost: <span id="story-boost-status-text">...</span> <button class="db-btn" id="story-boost-toggle-btn" style="font-size:11px;padding:2px 10px">Toggle</button></span>' +
        '<span id="s1-launch-wrap" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8a8a90">S1 Launch: <input type="datetime-local" id="s1-launch-input" style="font-size:11px;background:#14141a;color:#e6e6ee;border:1px solid #333"> <button class="db-btn" id="s1-launch-save" style="font-size:11px;padding:2px 10px">Set</button></span>' +
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
    var storyBoostText = document.getElementById('story-boost-status-text');
    var storyBoostBtn = document.getElementById('story-boost-toggle-btn');
    var tok = function() { return localStorage.getItem('rpg_token'); };

    function refreshSettings() {
        fetch('/api/game/admin/settings', { headers: { 'Authorization': 'Bearer ' + tok() } }).then(function(r) { return r.json(); }).then(function(s) {
            var swOn = s.sw_enabled === true || s.sw_enabled === 'true' || s.sw_enabled === '1';
            var botOn = s.bot_detection_enabled === true || s.bot_detection_enabled === 'true';
            var storyBoostOn = s.story_boost_enabled === true || s.story_boost_enabled === 'true' || s.story_boost_enabled === undefined;
            swText.textContent = swOn ? '✅ ON' : '❌ OFF';
            swText.style.color = swOn ? '#50c878' : '#e06060';
            botText.textContent = botOn ? '✅ ON' : '❌ OFF';
            botText.style.color = botOn ? '#50c878' : '#e06060';
            storyBoostText.textContent = storyBoostOn ? '✅ ON' : '❌ OFF';
            storyBoostText.style.color = storyBoostOn ? '#50c878' : '#e06060';
        }).catch(function() { swText.textContent = '?'; botText.textContent = '?'; storyBoostText.textContent = '?'; });
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

    storyBoostBtn.addEventListener('click', function() {
        var currentlyOn = storyBoostText.textContent.indexOf('ON') !== -1;
        fetch('/api/game/admin/settings/story-boost', { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + tok() }, body: JSON.stringify({ enabled: !currentlyOn }) }).then(function() { refreshSettings(); });
    });

    var s1Input = document.getElementById('s1-launch-input');
    var s1Save = document.getElementById('s1-launch-save');
    var toLocalInput = function(ms) {
        var d = new Date(ms);
        var p = function(n){ return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    };
    function refreshS1Launch() {
        fetch('/api/server/settings').then(function(r){ return r.json(); }).then(function(data) {
            var t = Number(data.s1_launch_at) || 0;
            if (s1Input && t) s1Input.value = toLocalInput(t);
        }).catch(function() {});
    }
    refreshS1Launch();
    if (s1Save && s1Input) s1Save.addEventListener('click', function() {
        if (!s1Input.value) { alert('Pick a date/time first.'); return; }
        var launchAt = new Date(s1Input.value).getTime();
        fetch('/api/game/admin/settings/s1-launch', { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + tok() }, body: JSON.stringify({ launch_at: launchAt }) })
            .then(function(r){ return r.json(); })
            .then(function(d) { if (d.success) alert('S1 launch set to ' + new Date(d.launch_at).toString()); })
            .catch(function(e) { alert(e.message || 'Failed to set launch time'); });
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

// ── Flagged Characters ───────────────────────────────────────────────
function toggleConfirmed(charName, confirmed) {
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/flagged/' + encodeURIComponent(charName) + '/confirm', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: confirmed })
    })
        .then(function(r) { return r.json(); })
        .then(function() { loadFlagged(); })
        .catch(function(e) { alert('Failed to update confirmed status: ' + e.message); });
}

function loadFlagged() {
    var el = document.getElementById('tab-flagged');
    el.innerHTML = '<div class="card-compact">' +
        '<div class="row"><div class="lbl"><b>Selective Scan</b></div>' +
        '<div class="val" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
        '<div style="position:relative;display:inline-block">' +
        '<input type="text" id="scan-char-input" placeholder="Character name" class="ed" style="width:150px" autocomplete="off">' +
        '<div id="scan-autocomplete-list" style="position:absolute;top:100%;left:0;right:0;background:#1a1a24;border:1px solid #2a2a35;border-radius:4px;max-height:200px;overflow-y:auto;display:none;z-index:100"></div>' +
        '</div>' +
        '<button class="db-btn btn-apply" data-action="scan-character" style="padding:4px 10px;font-size:11px">Scan</button>' +
        '<span id="scan-status" style="margin-left:4px;font-size:11px;color:#8a8a90"></span>' +
        '</div></div>' +
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
                '<th>Scan</th>' +
                '<th>Name</th>' +
                '<th>Reason</th>' +
                '<th title="Total flag events">Flags</th>' +
                '<th title="Distinct signal types">Signals</th>' +
                '<th>Detected</th>' +
                '<th>Last Seen</th>' +
                '<th>Confirmed (TOS)</th>' +
                '<th></th></tr></thead><tbody>';
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var det = r.detected_at ? new Date(r.detected_at * 1000).toLocaleString() : '?';
                var seen = r.last_seen_at ? new Date(r.last_seen_at * 1000).toLocaleString() : '?';
                var scanEnabled = r.scan_enabled !== 0;
                var toggleBtn = '<span data-action="toggle-scan" data-char="' + esc(r.char_name) + '" data-enabled="' + (scanEnabled ? '1' : '0') + '" style="cursor:pointer;font-size:14px;user-select:none">' + (scanEnabled ? '\uD83D\uDFE2' : '\uD83D\uDD34') + '</span>';
                var confirmedBtn = '<span class="toggle-confirmed-btn" data-char="' + esc(r.char_name) + '" data-confirmed="' + (r.confirmed ? '1' : '0') + '" style="cursor:pointer;font-size:12px;padding:2px 6px;background:' + (r.confirmed ? '#1a3a1a' : '#3a1a1a') + ';border-radius:4px;color:' + (r.confirmed ? '#4ade80' : '#e06060') + '">' + (r.confirmed ? 'Yes' : 'No') + '</span>';
                var signalBadge = (r.distinct_signals || 0) > 1
                    ? '<span style="color:#e06060;font-weight:700">' + (r.distinct_signals || 0) + '</span>'
                    : '<span style="color:#6a6a70">' + (r.distinct_signals || 0) + '</span>';
                html += '<tr class="flag-row" data-char="' + esc(r.char_name) + '">' +
                    '<td style="text-align:center">' + toggleBtn + '</td>' +
                    '<td><a href="#" class="flag-name-link" data-name="' + esc(r.char_name) + '" style="color:#e06060;font-weight:700;text-decoration:none">' + esc(r.char_name) + '</a></td>' +
                    '<td style="color:#8a8a90;font-size:11px" title="Types: ' + esc(r.signal_types || '') + '">' + esc(r.reason || '') + '</td>' +
                    '<td style="text-align:center;font-size:12px;cursor:pointer" class="flag-expand-btn" title="Click to see events">' + (r.signal_count || 0) + ' \u25B6</td>' +
                    '<td style="text-align:center;font-size:12px">' + signalBadge + '</td>' +
                    '<td style="font-size:11px">' + det + '</td>' +
                    '<td style="font-size:11px">' + seen + '</td>' +
                    '<td style="text-align:center">' + confirmedBtn + '</td>' +
                    '<td style="text-align:center"><button class="db-btn" data-action="scan-single" data-char="' + esc(r.char_name) + '" style="font-size:10px;padding:2px 6px">Scan</button></td></tr>' +
                    '<tr id="flag-events-' + esc(r.char_name) + '" style="display:none"><td colspan="9"><div style="padding:8px;background:#15151a;border-radius:4px;max-height:300px;overflow-y:auto"><div class="loading" style="padding:8px">Loading events...</div></div></td></tr>';
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
                        this.innerHTML = this.innerHTML.replace('\u25BC', '\u25B6');
                        return;
                    }
                    eventsRow.style.display = '';
                    this.innerHTML = this.innerHTML.replace('\u25B6', '\u25BC');
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
                                        '<span style="color:#8a8a90">' + new Date((e.ts || e.created_at) * 1000).toLocaleString() + '</span> ' +
                                        '<span style="color:#c8a86e">' + esc(e.type || e.signal_type) + '</span>: ' + esc(e.detail || e.reason) +
                                    '</div>';
                                }).join('');
                            });
                    }
                });
            });
        });
}

// ── Autocomplete ──
var _scanAcTimer = null;
document.addEventListener('input', function(e) {
    var input = e.target.closest('#scan-char-input');
    if (!input) return;
    if (_scanAcTimer) clearTimeout(_scanAcTimer);
    _scanAcTimer = setTimeout(function() {
        var q = input.value.trim();
        var list = document.getElementById('scan-autocomplete-list');
        if (q.length < 1) { list.style.display = 'none'; return; }
        var token = localStorage.getItem('rpg_token');
        fetch('/api/game/admin/character-search?q=' + encodeURIComponent(q), { headers: { 'Authorization': 'Bearer ' + token } })
            .then(function(r) { return r.json(); })
            .then(function(names) {
                if (!names || !names.length) { list.style.display = 'none'; return; }
                list.innerHTML = names.map(function(n) {
                    return '<div class="scan-ac-item" data-name="' + esc(n) + '" style="padding:6px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid #2a2a35;color:#c8d6e5">' + esc(n) + '</div>';
                }).join('');
                list.style.display = 'block';
            });
    }, 200);
});
document.addEventListener('click', function(e) {
    var item = e.target.closest('.scan-ac-item');
    if (item) {
        document.getElementById('scan-char-input').value = item.getAttribute('data-name');
        document.getElementById('scan-autocomplete-list').style.display = 'none';
        return;
    }
    var list = document.getElementById('scan-autocomplete-list');
    if (list && !e.target.closest('#scan-char-input')) list.style.display = 'none';
});

// ── Scan button (header) ──
document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="scan-character"]');
    if (!btn) return;
    scanCharacter();
});

// ── Scan single row ──
document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="scan-single"]');
    if (!btn) return;
    var charName = btn.getAttribute('data-char');
    scanCharacterByName(charName);
});

// ── Toggle scan_enabled per row ──
document.addEventListener('click', function(e) {
    var span = e.target.closest('[data-action="toggle-scan"]');
    if (!span) return;
    var charName = span.getAttribute('data-char');
    var current = span.getAttribute('data-enabled') === '1';
    var newEnabled = current ? 0 : 1;
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/toggle-character-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ char_name: charName, scan_enabled: newEnabled })
    }).then(function(r) { return r.json(); }).then(function() {
        loadFlagged();
    });
});

// ── Toggle confirmed (TOS) ──
document.addEventListener('click', function(e) {
    var span = e.target.closest('.toggle-confirmed-btn');
    if (!span) return;
    var charName = span.getAttribute('data-char');
    var confirmed = span.getAttribute('data-confirmed') === '1' ? 0 : 1;
    toggleConfirmed(charName, confirmed);
});

function scanCharacter() {
    var name = document.getElementById('scan-char-input').value.trim();
    if (!name) return;
    scanCharacterByName(name);
}

function scanCharacterByName(name) {
    var status = document.getElementById('scan-status');
    status.textContent = 'Activating monitoring for ' + name + '...';
    var token = localStorage.getItem('rpg_token');
    fetch('/api/game/admin/scan-character/' + encodeURIComponent(name), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.error) { status.textContent = 'Error: ' + res.error; return; }
            var parts = [];
            parts.push('Monitoring active');
            if (res.data) {
                var d = res.data;
                parts.push(d.api_log_24h + ' API calls');
                parts.push(d.missions_24h + ' missions');
                parts.push(d.battles_24h + ' battles');
            }
            if (res.detected) {
                parts.push('\u26A0 BOT: ' + res.reason);
            } else {
                parts.push('Gathering data\u2026');
            }
            status.textContent = parts.join(' | ');
            loadFlagged();
        })
        .catch(function(e) { status.textContent = 'Error: ' + e.message; });
}

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
initAdminServerSwitcher();

function renderProfilePicReview() {
    var el = document.getElementById('tab-profile-pic-review');
    el.innerHTML = '<div class="loading">Loading pending uploads...</div>';
    API('/admin/pending-profile-pics').then(function(res) {
        var pending = res.pending || [];
        if (!pending.length) { el.innerHTML = '<p>No pending profile pictures.</p>'; return; }
        var html = '<div style="display:flex;flex-wrap:wrap;gap:10px">';
        pending.forEach(function(p) {
            html += '<div class="card" style="width:150px;text-align:center;padding:10px">' +
                '<img src="' + escHtml(p.url) + '" style="width:100px;height:100px;object-fit:cover;border-radius:50%" onerror="this.style.display=\'none\'">' +
                '<div style="font-size:12px;margin:5px 0">' + escHtml(p.char_name) + '</div>' +
                '<button class="db-btn" data-action="approve-pic" data-id="' + p.id + '" style="background:#2ecc71;margin-right:5px">Approve</button>' +
                '<button class="db-btn" data-action="reject-pic" data-id="' + p.id + '" style="background:#e74c3c">Reject</button>' +
                '</div>';
        });
        el.innerHTML = html + '</div>';
    }).catch(function(e) { el.innerHTML = '<p class="error">Error: ' + escHtml(e.message) + '</p>'; });
}

window.reviewPic = function(id, approve) {
    fetch('/api/game/admin/profile-pic/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify({ id: id, approve: approve })
    }).then(function() { renderProfilePicReview(); updatePendingBadge(); });
};

document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="approve-pic"], [data-action="reject-pic"]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var approve = btn.getAttribute('data-action') === 'approve-pic';
    reviewPic(id, approve);
});

function updatePendingBadge() {
    API('/admin/pending-profile-pics/count').then(function(res) {
        var tab = document.querySelector('[data-tab="profile-pic-review"]');
        if (tab) tab.textContent = 'Profile Pic Review (' + res.count + ')';
    });
}

// ── Voucher codes ───────────────────────────────────────────────────────────
function voucherPost(path, body) {
    return fetch('/api/game' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
        body: JSON.stringify(body || {})
    }).then(function(r) {
        return r.json().then(function(j) {
            if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
            return j;
        });
    });
}

function loadVouchers() {
    var el = document.getElementById('tab-vouchers');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading vouchers...</div>';
    API('/admin/vouchers').then(function(list) {
        var rows = (list || []).map(function(v) {
            var status = Number(v.active) ? '<span style="color:#2ecc71;font-weight:700">Active</span>' : '<span style="color:#e74c3c;font-weight:700">Inactive</span>';
            var uses = v.use_count + (v.max_uses ? ' / ' + v.max_uses : '');
            return '<tr>' +
                '<td style="font-family:monospace;font-weight:700;color:#c8a86e">' + escHtml(v.code) + '</td>' +
                '<td>' + escHtml(v.reward_summary || '') + '</td>' +
                '<td>' + status + '</td>' +
                '<td>' + uses + '</td>' +
                '<td>' + (v.redemption_count || 0) + '</td>' +
                '<td>' + (v.created_at ? new Date(v.created_at * 1000).toLocaleString() : '') + '</td>' +
                '<td style="white-space:nowrap">' +
                    '<button data-voucher-toggle="' + v.id + '" style="padding:4px 10px;margin-right:4px;border:1px solid #c8a86e;background:#1a1a28;color:#c8a86e;border-radius:4px;cursor:pointer;font-size:11px">' + (Number(v.active) ? 'Deactivate' : 'Activate') + '</button>' +
                    '<button data-voucher-delete="' + v.id + '" data-voucher-code="' + escHtml(v.code) + '" style="padding:4px 10px;border:1px solid #e74c3c;background:#1a1a28;color:#e74c3c;border-radius:4px;cursor:pointer;font-size:11px">Delete</button>' +
                '</td>' +
            '</tr>';
        }).join('');
        el.innerHTML =
            '<h2 style="margin-top:0">Voucher Codes</h2>' +
            '<p style="color:#8a8a90;font-size:12px">Rewards are delivered directly to <b>every character</b> of the redeeming account (gold, gems, materials). Each account can redeem a code once; optional max-uses caps total redemptions.</p>' +
            '<div style="background:#14141e;border:1px solid #2a2a35;border-radius:8px;padding:14px;margin-bottom:16px">' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end">' +
                    '<div><label style="display:block;font-size:11px;color:#8a8a90;margin-bottom:4px">Code</label><input id="voucher-new-code" placeholder="SUMMER2026" maxlength="32" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #2a2a35;background:#0a0a0f;color:#e0dcd0"></div>' +
                    '<div><label style="display:block;font-size:11px;color:#8a8a90;margin-bottom:4px">Gold</label><input id="voucher-new-gold" type="number" min="0" placeholder="0" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #2a2a35;background:#0a0a0f;color:#e0dcd0"></div>' +
                    '<div><label style="display:block;font-size:11px;color:#8a8a90;margin-bottom:4px">Gems</label><input id="voucher-new-gems" type="number" min="0" placeholder="0" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #2a2a35;background:#0a0a0f;color:#e0dcd0"></div>' +
                    '<div><label style="display:block;font-size:11px;color:#8a8a90;margin-bottom:4px">Material type</label><select id="voucher-new-mtype" style="width:100%;padding:8px;border-radius:6px;border:1px solid #2a2a35;background:#0a0a0f;color:#e0dcd0"><option value="">None</option><option value="raw_mat">Raw material</option><option value="component">Component</option></select></div>' +
                    '<div><label style="display:block;font-size:11px;color:#8a8a90;margin-bottom:4px">Material id</label><input id="voucher-new-mid" placeholder="demon_alloy" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #2a2a35;background:#0a0a0f;color:#e0dcd0"></div>' +
                    '<div><label style="display:block;font-size:11px;color:#8a8a90;margin-bottom:4px">Material qty</label><input id="voucher-new-mqty" type="number" min="0" placeholder="0" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #2a2a35;background:#0a0a0f;color:#e0dcd0"></div>' +
                    '<div><label style="display:block;font-size:11px;color:#8a8a90;margin-bottom:4px">Max uses (blank = unlimited)</label><input id="voucher-new-maxuses" type="number" min="1" placeholder="Unlimited" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #2a2a35;background:#0a0a0f;color:#e0dcd0"></div>' +
                    '<button id="voucher-create-btn" style="padding:8px 16px;background:linear-gradient(180deg,#2ecc71,#1f8b4d);border:none;border-radius:6px;color:#fff;font-weight:700;cursor:pointer">Create</button>' +
                '</div>' +
                '<div id="voucher-create-msg" style="margin-top:10px;font-size:12px;color:#8a8a90;min-height:14px"></div>' +
            '</div>' +
            '<div class="table-wrap"><table><thead><tr style="text-align:left;color:#8a8a90">' +
                '<th style="padding:8px">Code</th><th style="padding:8px">Rewards</th><th style="padding:8px">Status</th><th style="padding:8px">Uses</th><th style="padding:8px">Accounts</th><th style="padding:8px">Created</th><th style="padding:8px">Actions</th>' +
            '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" style="padding:12px;color:#8a8a90">No vouchers yet.</td></tr>') + '</tbody></table></div>';

        var msgEl = document.getElementById('voucher-create-msg');
        var post = function(path, body, okMsg) {
            return voucherPost(path, body).then(function(d) {
                msgEl.textContent = d.message || okMsg || 'Done.';
                msgEl.style.color = '#2ecc71';
                loadVouchers();
            }).catch(function(e) {
                msgEl.textContent = e.message;
                msgEl.style.color = '#e06060';
            });
        };
        document.getElementById('voucher-create-btn').addEventListener('click', function() {
            post('/admin/vouchers/create', {
                code: document.getElementById('voucher-new-code').value,
                gold: document.getElementById('voucher-new-gold').value,
                gems: document.getElementById('voucher-new-gems').value,
                materialType: document.getElementById('voucher-new-mtype').value,
                materialId: document.getElementById('voucher-new-mid').value,
                materialQty: document.getElementById('voucher-new-mqty').value,
                maxUses: document.getElementById('voucher-new-maxuses').value
            }, 'Voucher created.');
        });
        el.querySelectorAll('[data-voucher-toggle]').forEach(function(btn) {
            btn.addEventListener('click', function() { post('/admin/vouchers/toggle', { id: Number(btn.dataset.voucherToggle) }, 'Updated.'); });
        });
        el.querySelectorAll('[data-voucher-delete]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!confirm('Delete voucher ' + btn.dataset.voucherCode + '?')) return;
                post('/admin/vouchers/delete', { id: Number(btn.dataset.voucherDelete) }, 'Deleted.');
            });
        });
}).catch(function(e) {
        el.innerHTML = '<div class="loading">' + escHtml(e.message || 'Error loading vouchers') + '</div>';
    });
}

// ── Ring Forge (build spinning ring assets from layered transparent images) ──
function loadRingForge() {
    var el = document.getElementById('tab-ringforge');
    el.innerHTML = '<div class="loading">Loading ring forge...</div>';
    el.innerHTML =
        '<div class="rf-layout">' +
            '<div class="rf-rail">' +
                '<div class="rf-card">' +
                    '<h3>Elements</h3>' +
                    '<button class="rf-add-btn" id="rf-add-btn">+ Add Image Layer (PNG)</button>' +
                    '<input type="file" id="rf-file" accept="image/png" multiple style="display:none">' +
                '</div>' +
                '<div class="rf-card"><h3>Layers</h3><div class="rf-layers" id="rf-layers"></div></div>' +
                '<div class="rf-card"><h3>Selected Layer</h3><div id="rf-inspector"></div></div>' +
                '<div class="rf-card"><h3>Ring Library</h3><div id="rf-lib"></div></div>' +
            '</div>' +
            '<div class="rf-stage">' +
                '<div class="rf-stage-block">' +
                    '<div class="rf-stage-label">Assembly &mdash; drag layers, align to center</div>' +
                    '<div class="rf-checker"><canvas id="rf-edit" width="480" height="480"></canvas></div>' +
                    '<div class="rf-stage-hint">Gold crosshair and rings mark true center &mdash; keep the design symmetric around it so the spin reads cleanly.</div>' +
                '</div>' +
                '<div class="rf-stage-block">' +
                    '<div class="rf-stage-label">Live Preview &mdash; clockwise spin</div>' +
                    '<div class="rf-preview-frame rf-checker"><canvas id="rf-preview" width="480" height="480" style="width:210px;height:210px;"></canvas></div>' +
                '</div>' +
                '<div class="rf-stage-block">' +
                    '<div class="rf-stage-label">Ring Text Marker &mdash; mark the arc band</div>' +
                    '<div class="rf-checker"><canvas id="rf-textmark" width="480" height="300"></canvas></div>' +
                    '<div class="rf-stage-hint">Adjust the sliders until the yellow band hugs the lettering. Drag the center crosshair to reposition.</div>' +
                    '<div class="rf-textmark-row">' +
                        '<select id="rf-textmark-ring"></select>' +
                        '<button class="rf-export-btn" id="rf-textmark-load">Load Ring</button>' +
                    '</div>' +
                    '<div class="rf-textmark-controls">' +
                        '<label>cx <input type="number" id="rf-textmark-cx" step="0.01" min="0" max="1" value="0.500" style="width:64px"></label>' +
                        '<label>cy <input type="number" id="rf-textmark-cy" step="0.01" min="0" max="1" value="0.500" style="width:64px"></label>' +
                        '<label>r <input type="range" id="rf-textmark-r" min="0.05" max="0.70" step="0.01" value="0.42" style="width:100px;accent-color:#8b6bff"></label>' +
                        '<label>thick <input type="range" id="rf-textmark-thick" min="0.02" max="0.20" step="0.01" value="0.07" style="width:90px;accent-color:#8b6bff"></label>' +
                        '<label>a0 <input type="number" id="rf-textmark-a0" step="5" min="-180" max="180" value="-150" style="width:60px">deg</label>' +
                        '<label>a1 <input type="number" id="rf-textmark-a1" step="5" min="-180" max="180" value="-30" style="width:60px">deg</label>' +
                    '</div>' +
                    '<div class="rf-textmark-row">' +
                        '<button class="rf-save-btn" id="rf-textmark-save">Save Band</button>' +
                        '<button class="rf-del-btn" id="rf-textmark-clear">Clear</button>' +
                    '</div>' +
                    '<div class="rf-textmark-coords" id="rf-textmark-coords">Adjust the sliders to define the arc band.</div>' +
                '</div>' +
                '<div class="rf-save-bar">' +
                    '<input class="rf-ring-id-input" id="rf-id" placeholder="award-ring-2">' +
                    '<button class="rf-export-btn" id="rf-export">Export PNG</button>' +
                    '<button class="rf-save-btn" id="rf-save">Save to Server</button>' +
                '</div>' +
                '<div class="rf-status" id="rf-status"></div>' +
            '</div>' +
        '</div>';

    var STAGE = 480;
    var editCanvas = document.getElementById('rf-edit');
    var previewCanvas = document.getElementById('rf-preview');
    var ectx = editCanvas.getContext('2d');
    var pctx = previewCanvas.getContext('2d');
    var compCanvas = document.createElement('canvas');
    compCanvas.width = STAGE; compCanvas.height = STAGE;
    var cctx = compCanvas.getContext('2d');
    var center = STAGE / 2;

    var layers = [];
    var selectedId = null;
    var dragging = false;
    var dragOffset = { x: 0, y: 0 };
    var nextId = 1;

    var layersEl = document.getElementById('rf-layers');
    var inspectorEl = document.getElementById('rf-inspector');
    var statusEl = document.getElementById('rf-status');
    var idInput = document.getElementById('rf-id');

    function radiusOf(l) { return Math.max(l.w, l.h) * l.scale / 2; }
    function rfStatus(msg, ok) {
        statusEl.textContent = msg;
        statusEl.style.color = ok ? '#2ecc71' : '#e06060';
    }

    function drawLayerInto(ctx, l) {
        ctx.save();
        ctx.globalAlpha = l.opacity;
        ctx.translate(center + l.x, center + l.y);
        ctx.rotate(l.rotation * Math.PI / 180);
        ctx.scale(l.scale, l.scale);
        ctx.drawImage(l.img, -l.w / 2, -l.h / 2, l.w, l.h);
        ctx.restore();
    }
    function drawGuides(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(201,163,78,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center, 0); ctx.lineTo(center, STAGE);
        ctx.moveTo(0, center); ctx.lineTo(STAGE, center);
        ctx.stroke();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(201,163,78,0.22)';
        [0.25, 0.5, 0.75, 1].forEach(function (f) {
            ctx.beginPath();
            ctx.arc(center, center, (STAGE / 2) * f, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.restore();
    }
    function drawSelection(ctx, l) {
        ctx.save();
        ctx.strokeStyle = '#8b6bff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(center + l.x, center + l.y, radiusOf(l) * 1.06, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    function render() {
        ectx.clearRect(0, 0, STAGE, STAGE);
        drawGuides(ectx);
        layers.forEach(function (l) { drawLayerInto(ectx, l); });
        var sel = layers.length && layers.filter(function (l) { return l.id === selectedId; })[0];
        if (sel) drawSelection(ectx, sel);

        cctx.clearRect(0, 0, STAGE, STAGE);
        layers.forEach(function (l) { drawLayerInto(cctx, l); });
        pctx.clearRect(0, 0, STAGE, STAGE);
        pctx.drawImage(compCanvas, 0, 0);

        renderLayerList();
        renderInspector();
    }
    function renderLayerList() {
        layersEl.innerHTML = '';
        if (!layers.length) {
            layersEl.innerHTML = '<div class="rf-empty">No layers yet.<br>Add PNGs with transparent backgrounds or pull one from the library.</div>';
            return;
        }
        for (var i = layers.length - 1; i >= 0; i--) {
            (function (l) {
                var row = document.createElement('div');
                row.className = 'rf-layer' + (l.id === selectedId ? ' selected' : '');
                var thumb = document.createElement('div');
                thumb.className = 'rf-thumb';
                var img = document.createElement('img');
                img.src = l.img.src;
                thumb.appendChild(img);
                var name = document.createElement('div');
                name.className = 'rf-layer-name';
                name.textContent = l.name;
                name.title = l.name;
                row.appendChild(thumb);
                row.appendChild(name);
                var up = document.createElement('button');
                up.className = 'rf-icon-btn'; up.innerHTML = '&#9650;'; up.title = 'Bring forward';
                var down = document.createElement('button');
                down.className = 'rf-icon-btn'; down.innerHTML = '&#9660;'; down.title = 'Send backward';
                var del = document.createElement('button');
                del.className = 'rf-icon-btn del'; del.innerHTML = '&times;'; del.title = 'Delete layer';
                var btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:2px;';
                btns.appendChild(up); btns.appendChild(down); btns.appendChild(del);
                row.appendChild(btns);
                row.addEventListener('click', function (e) {
                    if (e.target.closest('.rf-icon-btn')) return;
                    selectedId = l.id; render();
                });
                up.addEventListener('click', function () { moveLayer(l.id, 1); });
                down.addEventListener('click', function () { moveLayer(l.id, -1); });
                del.addEventListener('click', function () { deleteLayer(l.id); });
                layersEl.appendChild(row);
            })(layers[i]);
        }
    }
    function moveLayer(id, dir) {
        var i = layers.findIndex(function (l) { return l.id === id; });
        var j = i + dir;
        if (j < 0 || j >= layers.length) return;
        var tmp = layers[i]; layers[i] = layers[j]; layers[j] = tmp;
        render();
    }
    function deleteLayer(id) {
        layers = layers.filter(function (l) { return l.id !== id; });
        if (selectedId === id) selectedId = null;
        render();
    }
    function renderInspector() {
        var l = layers.filter(function (x) { return x.id === selectedId; })[0];
        if (!l) {
            inspectorEl.innerHTML = '<div class="rf-no-sel">No layer selected &mdash; click a layer to edit scale, rotation, opacity and position.</div>';
            return;
        }
        function numVal(v, d) { return Math.round((v || d) * 100) / 100; }
        inspectorEl.innerHTML =
            '<div class="rf-field"><div class="rf-field-label">Scale <b id="rf-sv">' + l.scale.toFixed(2) + 'x</b></div>' +
                '<input type="range" id="rf-ss" min="0.05" max="3" step="0.01" value="' + l.scale + '"></div>' +
            '<div class="rf-field"><div class="rf-field-label">Rotation <b id="rf-rv">' + Math.round(l.rotation) + '&deg;</b></div>' +
                '<input type="range" id="rf-rs" min="0" max="360" step="1" value="' + l.rotation + '"></div>' +
            '<div class="rf-field"><div class="rf-field-label">Opacity <b id="rf-ov">' + Math.round(l.opacity * 100) + '%</b></div>' +
                '<input type="range" id="rf-os" min="0" max="1" step="0.01" value="' + l.opacity + '"></div>' +
            '<button class="rf-center-btn" id="rf-center">Center on ring axis</button>';
        inspectorEl.querySelector('#rf-ss').addEventListener('input', function (e) {
            l.scale = numVal(parseFloat(e.target.value), 1);
            document.getElementById('rf-sv').textContent = l.scale.toFixed(2) + 'x';
            quickRender();
        });
        inspectorEl.querySelector('#rf-rs').addEventListener('input', function (e) {
            l.rotation = numVal(parseFloat(e.target.value), 0);
            document.getElementById('rf-rv').innerHTML = Math.round(l.rotation) + '&deg;';
            quickRender();
        });
        inspectorEl.querySelector('#rf-os').addEventListener('input', function (e) {
            l.opacity = numVal(parseFloat(e.target.value), 1);
            document.getElementById('rf-ov').textContent = Math.round(l.opacity * 100) + '%';
            quickRender();
        });
        inspectorEl.querySelector('#rf-center').addEventListener('click', function () {
            l.x = 0; l.y = 0; render();
        });
    }
    function quickRender() {
        ectx.clearRect(0, 0, STAGE, STAGE);
        drawGuides(ectx);
        layers.forEach(function (l) { drawLayerInto(ectx, l); });
        var sel = layers.filter(function (l) { return l.id === selectedId; })[0];
        if (sel) drawSelection(ectx, sel);
        cctx.clearRect(0, 0, STAGE, STAGE);
        layers.forEach(function (l) { drawLayerInto(cctx, l); });
        pctx.clearRect(0, 0, STAGE, STAGE);
        pctx.drawImage(compCanvas, 0, 0);
    }

    function addImage(img, label) {
        var maxDim = STAGE * 0.6;
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var scaleFit = Math.min(1, maxDim / Math.max(w, h));
        layers.push({
            id: nextId++, name: label || ('layer-' + nextId),
            img: img, x: 0, y: 0,
            scale: scaleFit, rotation: 0, opacity: 1,
            w: w, h: h
        });
        selectedId = layers[layers.length - 1].id;
        render();
    }

    // Add element images
    document.getElementById('rf-add-btn').addEventListener('click', function () {
        document.getElementById('rf-file').click();
    });
    document.getElementById('rf-file').addEventListener('change', function (e) {
        Array.prototype.forEach.call(e.target.files, function (file) {
            var reader = new FileReader();
            reader.onload = function () {
                var img = new Image();
                img.onload = function () { addImage(img, file.name.replace(/\.[^.]+$/, '')); };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    });

    // Drag on edit canvas
    function rfCanvasPos(e) {
        var rect = editCanvas.getBoundingClientRect();
        var sx = STAGE / rect.width, sy = STAGE / rect.height;
        return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    }
    editCanvas.addEventListener('mousedown', function (e) {
        var p = rfCanvasPos(e);
        for (var i = layers.length - 1; i >= 0; i--) {
            var l = layers[i];
            var dx = p.x - (center + l.x), dy = p.y - (center + l.y);
            if (Math.sqrt(dx * dx + dy * dy) <= Math.max(radiusOf(l), 12)) {
                selectedId = l.id;
                dragging = true;
                dragOffset = { x: dx, y: dy };
                editCanvas.classList.add('dragging');
                render();
                return;
            }
        }
    });
    window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var l = layers.filter(function (x) { return x.id === selectedId; })[0];
        if (!l) return;
        var p = rfCanvasPos(e);
        l.x = p.x - dragOffset.x - center;
        l.y = p.y - dragOffset.y - center;
        quickRender();
    });
    window.addEventListener('mouseup', function () {
        if (dragging) { dragging = false; editCanvas.classList.remove('dragging'); render(); }
    });

    function renderComposited() {
        cctx.clearRect(0, 0, STAGE, STAGE);
        layers.forEach(function (l) { drawLayerInto(cctx, l); });
    }

    // Export PNG (download)
    document.getElementById('rf-export').addEventListener('click', function () {
        renderComposited();
        var url = compCanvas.toDataURL('image/png');
        var a = document.createElement('a');
        a.href = url;
        a.download = (idInput.value.trim() || 'ring') + '.png';
        a.click();
        rfStatus('Exported PNG with alpha.', true);
        render();
    });

    // Save to server (overwrites the canonical file for the given ring id)
    document.getElementById('rf-save').addEventListener('click', function () {
        var ringId = idInput.value.trim();
        if (!ringId) { rfStatus('Enter a ring id first (e.g. award-ring-2).', false); return; }
        renderComposited();
        compCanvas.toBlob(function (bl) {
            if (!bl) { rfStatus('PNG encoding failed.', false); return; }
            var fd = new FormData();
            fd.append('ring', bl, ringId + '.png');
            fd.append('ringId', ringId);
            rfStatus('Saving ' + ringId + '...', true);
            fetch('/api/game/admin/rings/save', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
                body: fd
            }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
              .then(function (res) {
                  if (!res.ok) { rfStatus((res.d && res.d.error) || 'Save failed.', false); return; }
                  rfStatus('Saved -> ' + (res.d.url || ringId + '.png'), true);
                  loadRingLibrary();
              })
              .catch(function (err) { rfStatus('Save error: ' + err.message, false); });
        }, 'image/png');
    });

    // Library: existing ring assets
    function renderLibrary(rings) {
        var lib = document.getElementById('rf-lib');
        if (!rings.length) {
            lib.innerHTML = '<div class="rf-empty">No rings on disk yet.<br>Save your first composition to create one.</div>';
            return;
        }
        lib.innerHTML = '';
        rings.forEach(function (r) {
            var item = document.createElement('div');
            item.className = 'rf-ring-item';
            var img = document.createElement('img');
            img.src = r.url;
            img.onerror = function () { img.style.opacity = '0.25'; };
            var name = document.createElement('div');
            name.className = 'rf-ring-name';
            name.textContent = r.id;
            name.title = r.id;
            var use = document.createElement('button');
            use.className = 'db-btn db-btn-apply'; use.textContent = 'Base';
            use.title = 'Load as centered base layer';
            use.addEventListener('click', function () { loadRingInto(r); });
            var del = document.createElement('button');
            del.className = 'db-btn db-btn-del'; del.textContent = 'X';
            del.title = 'Delete this ring asset';
            del.addEventListener('click', function () { deleteRing(r.id); });
            item.appendChild(img);
            item.appendChild(name);
            item.appendChild(use);
            item.appendChild(del);
            lib.appendChild(item);
        });
    }
    function loadRingInto(r) {
        var img = new Image();
        img.onload = function () { addImage(img, r.id); };
        img.onerror = function () { rfStatus('Could not load ' + r.id, false); };
        img.src = r.url;
    }
    function deleteRing(ringId) {
        if (!confirm('Delete ring asset ' + ringId + '.png?')) return;
        fetch('/api/game/admin/rings/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
            body: JSON.stringify({ ringId: ringId })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.error) { rfStatus(d.error, false); return; }
            rfStatus('Deleted ' + ringId, true);
            loadRingLibrary();
        }).catch(function (err) { rfStatus('Delete error: ' + err.message, false); });
    }
    function loadRingLibrary() {
        fetch('/api/game/admin/rings', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } })
            .then(function (r) { return r.json(); })
            .then(function (d) { renderLibrary((d && d.rings) || []); })
            .catch(function () { document.getElementById('rf-lib').innerHTML = '<div class="rf-empty">Failed to load library.</div>'; });
    }
    loadRingLibrary();
    render();
    textMarkerInit();
}

// ── Ring Text Marker (arc band: visible & adjustable via sliders) ──
function textMarkerInit() {
    var mk = document.getElementById('rf-textmark');
    if (!mk) return;
    var mctx = mk.getContext('2d');
    var MW = mk.width, MH = mk.height;
    var select = document.getElementById('rf-textmark-ring');
    var thickSlider = document.getElementById('rf-textmark-thick');
    var rSlider = document.getElementById('rf-textmark-r');
    var a0Slider = document.getElementById('rf-textmark-a0');
    var a1Slider = document.getElementById('rf-textmark-a1');
    var coordInputs = {
        cx: document.getElementById('rf-textmark-cx'),
        cy: document.getElementById('rf-textmark-cy')
    };
    var coordsEl = document.getElementById('rf-textmark-coords');
    var img = null;
    var natW = 0, natH = 0;
    var sc = 1, offX = 0, offY = 0;
    var curRingId = null;

    // band: cx,cy fractions; r,thickness fractions of min dim; startAngle,endAngle radians
    var band = { cx: 0.5, cy: 0.5, r: 0.42, thickness: 0.07, startAngle: -2.6, endAngle: -0.5 };
    var centerDrag = null;

    function auth() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') }; }

    function status(msg, ok) {
        coordsEl.textContent = msg;
        coordsEl.style.color = ok ? '#80d080' : '#e0b080';
        if (ok) setTimeout(function () { render(); }, 800);
    }

    function readSliders() {
        band.cx = parseFloat(coordInputs.cx.value) || 0.5;
        band.cy = parseFloat(coordInputs.cy.value) || 0.5;
        band.r = parseFloat(rSlider.value) || 0.42;
        band.thickness = parseFloat(thickSlider.value) || 0.07;
        band.startAngle = (parseFloat(a0Slider.value) || 0) * Math.PI / 180;
        band.endAngle = (parseFloat(a1Slider.value) || 0) * Math.PI / 180;
    }

    function writeSliders() {
        coordInputs.cx.value = band.cx.toFixed(3);
        coordInputs.cy.value = band.cy.toFixed(3);
        rSlider.value = band.r;
        thickSlider.value = band.thickness;
        a0Slider.value = (band.startAngle * 180 / Math.PI).toFixed(1);
        a1Slider.value = (band.endAngle * 180 / Math.PI).toFixed(1);
    }

    function natPoint(px, py) { return { x: (px - offX) / sc, y: (py - offY) / sc }; }

    function render() {
        mctx.clearRect(0, 0, MW, MH);
        if (!img) {
            mctx.fillStyle = '#1a1a28'; mctx.fillRect(0, 0, MW, MH);
            mctx.fillStyle = '#6a6a70'; mctx.font = '12px monospace';
            mctx.fillText('Pick a ring above and click "Load Ring".', 20, MH / 2);
            return;
        }
        mctx.fillStyle = '#171220'; mctx.fillRect(0, 0, MW, MH);
        var drawW = Math.min(MW - 40, (natW / natH) * (MH - 40));
        var drawH = Math.min(MH - 40, (natH / natW) * (MW - 40));
        sc = drawW / natW; offX = (MW - drawW) / 2; offY = (MH - drawH) / 2;
        mctx.drawImage(img, offX, offY, drawW, drawH);

        var ccx = offX + band.cx * sc, ccy = offY + band.cy * sc;
        // center crosshair (draggable)
        mctx.strokeStyle = '#ffd166'; mctx.lineWidth = 1.5;
        mctx.beginPath(); mctx.moveTo(ccx - 8, ccy); mctx.lineTo(ccx + 8, ccy); mctx.stroke();
        mctx.beginPath(); mctx.moveTo(ccx, ccy - 8); mctx.lineTo(ccx, ccy + 8); mctx.stroke();

        // arc band preview
        if (band.r > 0 && (band.endAngle - band.startAngle) > 0.005) {
            var ir = Math.max(1, (band.r - band.thickness / 2) * sc);
            var or2 = Math.max(2, (band.r + band.thickness / 2) * sc);
            mctx.fillStyle = 'rgba(255,209,102,0.22)';
            mctx.beginPath();
            mctx.arc(ccx, ccy, or2, band.startAngle, band.endAngle);
            mctx.arc(ccx, ccy, ir, band.endAngle, band.startAngle, true);
            mctx.closePath();
            mctx.fill();
            mctx.strokeStyle = 'rgba(255,209,102,0.5)'; mctx.lineWidth = 1;
            mctx.stroke();
            // endpoint dots
            mctx.fillStyle = '#ff8080';
            mctx.beginPath(); mctx.arc(ccx + Math.cos(band.startAngle) * band.r * sc, ccy + Math.sin(band.startAngle) * band.r * sc, 4, 0, Math.PI * 2); mctx.fill();
            mctx.fillStyle = '#80ff80';
            mctx.beginPath(); mctx.arc(ccx + Math.cos(band.endAngle) * band.r * sc, ccy + Math.sin(band.endAngle) * band.r * sc, 4, 0, Math.PI * 2); mctx.fill();
        }
    }

    function bandToNorm() {
        if (!img || band.r <= 0) return null;
        return {
            cx: +band.cx.toFixed(4), cy: +band.cy.toFixed(4),
            r: +band.r.toFixed(4), thickness: +band.thickness.toFixed(4),
            startAngle: +band.startAngle.toFixed(4), endAngle: +band.endAngle.toFixed(4)
        };
    }

    function showCoords() {
        var n = bandToNorm();
        coordsEl.style.color = '#c8a86e';
        if (!n || n.r <= 0) { coordsEl.textContent = 'Adjust the sliders below to define the arc band.'; return; }
        coordsEl.textContent = 'cx=' + n.cx + ' cy=' + n.cy + ' r=' + n.r + ' thick=' + n.thickness + ' a0=' + (n.startAngle*180/Math.PI).toFixed(1) + '\u00b0 a1=' + (n.endAngle*180/Math.PI).toFixed(1) + '\u00b0';
    }

    function loadRings() {
        fetch('/api/game/admin/rings', { headers: auth() })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var list = (d && d.rings) || [];
                select.innerHTML = '';
                list.forEach(function (ring) {
                    var o = document.createElement('option');
                    o.value = ring.id; o.textContent = ring.id;
                    select.appendChild(o);
                });
                fetch('/api/game/admin/ring-text', { headers: auth() })
                    .then(function (r) { return r.json(); })
                    .then(function (d) { window.__rfTextMap = (d && d.map) || {}; })
                    .catch(function () { window.__rfTextMap = {}; });
            })
            .catch(function () { select.innerHTML = '<option value="">No rings</option>'; });
    }

    function loadCurrentRing() {
        var id = select.value;
        if (!id) { status('Pick a ring id first.', false); return; }
        curRingId = id;
        var url = '/images/assets/awards/' + id + '.png';
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function () {
            img = im; natW = im.naturalWidth || im.width; natH = im.naturalHeight || im.height;
            var m = (window.__rfTextMap || {})[curRingId];
            if (m) {
                band.cx = m.cx; band.cy = m.cy;
                band.r = m.r; band.thickness = m.thickness || 0.07;
                band.startAngle = m.startAngle; band.endAngle = m.endAngle;
            } else {
                band.cx = 0.5; band.cy = 0.5;
                band.r = 0.42; band.thickness = 0.07;
                band.startAngle = -2.6; band.endAngle = -0.5;
            }
            centerDrag = null;
            writeSliders();
            render(); showCoords();
        };
        im.onerror = function () { status('Could not load ' + id, false); };
        im.src = url;
    }

    document.getElementById('rf-textmark-load').addEventListener('click', loadCurrentRing);

    function clickPos(e) {
        var r = mk.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (MW / r.width), y: (e.clientY - r.top) * (MH / r.height) };
    }

    mk.addEventListener('mousedown', function (e) {
        if (!img) return;
        var p = clickPos(e);
        var dcx = p.x - (offX + band.cx * sc), dcy = p.y - (offY + band.cy * sc);
        if (Math.sqrt(dcx * dcx + dcy * dcy) < 24) {
            centerDrag = { dx: dcx, dy: dcy };
        }
    });
    window.addEventListener('mousemove', function (e) {
        if (!centerDrag || !img) return;
        var p = clickPos(e);
        band.cx = (p.x - centerDrag.dx - offX) / sc / natW;
        band.cy = (p.y - centerDrag.dy - offY) / sc / natH;
        render();
    });
    window.addEventListener('mouseup', function () {
        if (centerDrag) {
            centerDrag = null;
            writeSliders(); showCoords();
        }
    });

    // sliders update live
    [coordInputs.cx, coordInputs.cy, rSlider, thickSlider, a0Slider, a1Slider].forEach(function (el) {
        if (el) el.addEventListener('input', function () { render(); showCoords(); });
    });

    document.getElementById('rf-textmark-save').addEventListener('click', function () {
        if (!curRingId) { status('Load a ring first.', false); return; }
        var n = bandToNorm();
        if (!n || n.r <= 0) { status('Set the arc band via sliders first.', false); return; }
        fetch('/api/game/admin/ring-text', {
            method: 'POST', headers: auth(),
            body: JSON.stringify({ ringId: curRingId, cx: n.cx, cy: n.cy, r: n.r, thickness: n.thickness, startAngle: n.startAngle, endAngle: n.endAngle })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.error) { status(d.error, false); return; }
            status('Saved band for ' + curRingId + ' (r=' + n.r + ' thick=' + n.thickness + ' a0=' + (n.startAngle*180/Math.PI).toFixed(1) + '\u00b0 a1=' + (n.endAngle*180/Math.PI).toFixed(1) + '\u00b0)', true);
            (window.__rfTextMap = window.__rfTextMap || {})[curRingId] = n;
        }).catch(function (err) { status('Save error: ' + err.message, false); });
    });

    document.getElementById('rf-textmark-clear').addEventListener('click', function () {
        if (!curRingId) { status('Load a ring first.', false); return; }
        fetch('/api/game/admin/ring-text/delete', {
            method: 'POST', headers: auth(),
            body: JSON.stringify({ ringId: curRingId })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.error) { status(d.error, false); return; }
            band = { cx: 0.5, cy: 0.5, r: 0, thickness: 0.07, startAngle: 0, endAngle: 0 };
            centerDrag = null; writeSliders(); render(); showCoords();
            if (window.__rfTextMap) delete window.__rfTextMap[curRingId];
            status('Cleared band for ' + curRingId, true);
        }).catch(function (err) { status('Clear error: ' + err.message, false); });
    });

    loadRings();
    render();
}
