const SPITEFORGED_LOOT = [
    { id: 'spiteforged_weapon', name: 'Spiteforged Trident', type: 'weapon', rarity: 'legendary' },
    { id: 'spiteforged_armor', name: 'Carapace of Last Refrains', type: 'armor', rarity: 'legendary' },
    { id: 'spiteforged_helmet', name: 'Crown of Scornful Gaze', type: 'helmet', rarity: 'legendary' },
    { id: 'spiteforged_shield', name: 'Bulwark of Denied Mercy', type: 'shield', rarity: 'legendary' },
    { id: 'spiteforged_boots', name: 'Treads of the Unforgiving', type: 'boots', rarity: 'legendary' },
];

const ECLIPSED_SERAPH_LOOT = [
    { id: 'eclipsed_seraph_weapon', name: 'Fallen Grace', type: 'weapon', rarity: 'legendary' },
    { id: 'eclipsed_seraph_armor', name: 'Vestments of the Black Halo', type: 'armor', rarity: 'legendary' },
    { id: 'eclipsed_seraph_helmet', name: 'Halo of Ruination', type: 'helmet', rarity: 'legendary' },
    { id: 'eclipsed_seraph_shield', name: 'Wingguard of the Forsaken', type: 'shield', rarity: 'legendary' },
    { id: 'eclipsed_seraph_boots', name: 'Heavenfall Sabatons', type: 'boots', rarity: 'legendary' },
];

function getKey() {
    return new URLSearchParams(location.search).get('key') || '';
}
async function api(method, path, body) {
    const url = '/admin/banner' + path + (path.includes('?') ? '&' : '?') + 'key=' + getKey();
    const res = await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
}
function showMsg(msg, isError) {
    const el = document.getElementById('message');
    el.textContent = msg;
    el.className = isError ? 'error' : 'success';
    setTimeout(() => el.style.display = 'none', 4000);
}
function now() { return Math.floor(Date.now() / 1000); }
function formatTs(ts) { return new Date(ts * 1000).toLocaleString(); }
function days(n) { return n * 24 * 60 * 60; }

async function loadBanners() {
    try {
        const data = await api('GET', '/list');
        const banners = data.banners || [];
        const current = banners.find(b => b.start_at <= now() && b.end_at > now());
        
        document.getElementById('current').innerHTML = current ? 
            '<div class="banner-card active">' +
                '<div class="banner-name">' + current.name + '</div>' +
                '<div class="banner-dates">Ends: ' + formatTs(current.end_at) + '</div>' +
                '<div class="banner-status active">ACTIVE</div>' +
            '</div>' :
            '<div class="banner-card"><div class="banner-status inactive">No active banner</div></div>';
        
        const html = banners.map(b => {
            const active = b.start_at <= now() && b.end_at > now();
            const card = document.createElement('div');
            card.className = 'banner-card ' + (active ? 'active' : 'inactive');
            card.innerHTML = 
                '<div class="banner-name">' + b.name + '</div>' +
                '<div class="banner-dates">' + formatTs(b.start_at) + ' - ' + formatTs(b.end_at) + '</div>' +
                '<div class="banner-status ' + (active ? 'active' : 'inactive') + '">' + (active ? 'ACTIVE' : 'Inactive') + '</div>' +
                '<div class="actions">' +
                    '<button class="btn ' + (active ? 'btn-danger' : 'btn-success') + ' btn-action" data-action="' + (active ? 'deactivate' : 'activate') + '" data-id="' + b.id + '">' + (active ? 'Deactivate' : 'Activate') + '</button>' +
                    '<button class="btn btn-secondary btn-action" data-action="delete" data-id="' + b.id + '">Delete</button>' +
                '</div>';
            return card.outerHTML;
        }).join('') || '<p>No banners yet</p>';
        
        document.getElementById('banners').innerHTML = html;
        
        document.querySelectorAll('#banners .btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const id = parseInt(btn.dataset.id);
                if (action === 'activate') activateBanner(id);
                else if (action === 'deactivate') deactivateBanner(id);
                else if (action === 'delete') deleteBanner(id);
            });
        });
    } catch (e) {
        showMsg(e.message, true);
    }
}

async function createBanner() {
    const name = document.getElementById('new-name').value;
    const duration = parseInt(document.getElementById('new-duration').value);
    const start = now();
    const end = start + days(duration);
    
    try {
        await api('POST', '/create', { name, image: 'spiteforged', start_at: start, end_at: end, loot_table: SPITEFORGED_LOOT });
        showMsg('Created ' + name, false);
        loadBanners();
    } catch (e) {
        showMsg(e.message, true);
    }
}

async function activateBanner(id) {
    const start = now();
    const end = start + days(7);
    try {
        await api('PUT', '/' + id, { start_at: start, end_at: end });
        showMsg('Activated', false);
        loadBanners();
    } catch (e) {
        showMsg(e.message, true);
    }
}

async function deactivateBanner(id) {
    const start = now() - days(1);
    try {
        await api('PUT', '/' + id, { end_at: start });
        showMsg('Deactivated', false);
        loadBanners();
    } catch (e) {
        showMsg(e.message, true);
    }
}

async function deactivateAll() {
    try {
        const data = await api('GET', '/list');
        for (const b of data.banners) {
            const active = b.start_at <= now() && b.end_at > now();
            if (active) await api('PUT', '/' + b.id, { end_at: now() - 1 });
        }
        showMsg('All deactivated', false);
        loadBanners();
    } catch (e) {
        showMsg(e.message, true);
    }
}

async function deleteBanner(id) {
    if (!confirm('Delete banner #' + id + '?')) return;
    try {
        await api('DELETE', '/' + id);
        showMsg('Deleted', false);
        loadBanners();
    } catch (e) {
        showMsg(e.message, true);
    }
}

async function activateSpiteforged() {
    try {
        const data = await api('GET', '/list');
        const existing = data.banners.find(b => b.name && b.name.toLowerCase().includes('spiteforged'));
        if (existing) {
            const start = now();
            const end = start + days(7);
            await api('PUT', '/' + existing.id, { start_at: start, end_at: end });
            showMsg('Spiteforged activated for 7 days', false);
        } else {
            const start = now();
            const end = start + days(7);
            await api('POST', '/create', { name: 'Spiteforged Banner', image: 'spiteforged', start_at: start, end_at: end, loot_table: SPITEFORGED_LOOT });
            showMsg('Spiteforged banner created', false);
        }
        loadBanners();
    } catch (e) {
        showMsg(e.message, true);
    }
}

async function activateEclipsedSeraph() {
    try {
        const data = await api('GET', '/list');
        const existing = data.banners.find(b => b.name && b.name.toLowerCase().includes('eclipsed seraph'));
        if (existing) {
            const start = now();
            const end = start + days(7);
            await api('PUT', '/' + existing.id, { start_at: start, end_at: end });
            showMsg('Eclipsed Seraph activated for 7 days', false);
        } else {
            const start = now();
            const end = start + days(7);
            await api('POST', '/create', { name: 'Eclipsed Seraph Banner', image: 'eclipsed_seraph', start_at: start, end_at: end, loot_table: ECLIPSED_SERAPH_LOOT });
            showMsg('Eclipsed Seraph banner created', false);
        }
        loadBanners();
    } catch (e) {
        showMsg(e.message, true);
    }
}

document.getElementById('btn-spiteforged').addEventListener('click', activateSpiteforged);
document.getElementById('btn-eclipsed-seraph').addEventListener('click', activateEclipsedSeraph);
document.getElementById('btn-deactivate-all').addEventListener('click', deactivateAll);
document.getElementById('btn-refresh').addEventListener('click', loadBanners);
document.getElementById('btn-create').addEventListener('click', createBanner);

loadBanners();
