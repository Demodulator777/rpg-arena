class EventUI {
    constructor() {
        this.container = document.getElementById('event-container');
        this.currentRoom = 0;
        this.score = 0;
        this.state = 'idle';
        this.charName = null;
        this._resolveCharName();
    }

    _resolveCharName() {
        const sources = [
            () => (typeof character !== 'undefined' && character && character.name) ? character.name : null,
            () => (typeof global !== 'undefined' && global && global.character && global.character.name) ? global.character.name : null,
            () => (typeof getChar === 'function' && getChar() && getChar().name) ? getChar().name : null,
        ];
        for (const src of sources) {
            try {
                const name = src();
                if (name) { this.charName = name; return; }
            } catch (e) { /* ignore */ }
        }
    }

    async _ensureCharName() {
        if (this.charName) return;
        try {
            const res = await fetch('/game/character', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } });
            if (res.ok) {
                const data = await res.json();
                this.charName = data.name || null;
            }
        } catch (e) { /* ignore */ }
    }

    async loadStatus() {
        try {
            const res = await fetch('/api/event/status', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } });
            if (!res.ok) throw new Error('Failed to load event status');
            return await res.json();
        } catch (e) {
            return { error: e.message };
        }
    }

    async renderLeaderboard() {
        const listEl = this.container.querySelector('.event-lb-list');
        if (!listEl) return;
        await this._ensureCharName();
        listEl.innerHTML = '<div class="event-lb-empty">Loading leaderboard...</div>';

        try {
            const res = await fetch('/api/event/leaderboard', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } });
            if (!res.ok) throw new Error('Failed to load leaderboard');
            const data = await res.json();

            if (!Array.isArray(data.leaderboard) || data.leaderboard.length === 0) {
                listEl.innerHTML = '<div class="event-lb-empty">No scores yet. Be the first!</div>';
                return;
            }

            const rankIcons = ['🥇', '🥈', '🥉'];
            listEl.innerHTML = data.leaderboard.map((r, i) => {
                const isSelf = this.charName && r.char_name === this.charName;
                const cls = isSelf ? 'event-lb-row event-lb-row-self' : 'event-lb-row';
                const rank = i < 3 ? rankIcons[i] : `#${i + 1}`;
                return `<div class="${cls}">
                    <span class="event-lb-rank">${rank}</span>
                    <span class="event-lb-name">${this._esc(r.char_name)}</span>
                    <span class="event-lb-score">${Number(r.best_score || 0).toLocaleString()}</span>
                    <span class="event-lb-time">${Number(r.best_time || 0).toFixed(1)}m</span>
                </div>`;
            }).join('');
        } catch (e) {
            listEl.innerHTML = `<div class="event-lb-empty" style="color:var(--red-light)">${this._esc(e.message)}</div>`;
        }
    }

    async enterEvent() {
        const btn = this.container.querySelector('#event-enter-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Entering...'; }

        try {
            const res = await fetch('/api/event/enter', { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to enter event');

            this.currentRoom = 0;
            this.score = 0;
            this.state = 'active';
            this.renderCombat();
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Enter Trial'; }
            this.showError(e.message);
        }
    }

    async fightRoom() {
        const btn = this.container.querySelector('#fight-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Fighting...'; }

        try {
            const res = await fetch('/api/event/combat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') },
                body: JSON.stringify({ roomIndex: this.currentRoom })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Combat failed');

            this.currentRoom = data.nextRoom;
            this.score += data.points;
            if (this.currentRoom >= 10) this.finishEvent();
            else this.renderCombat();
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Fight Room'; }
            this.showError(e.message);
        }
    }

    async finishEvent() {
        try {
            const res = await fetch('/api/event/finish', { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('rpg_token') } });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to finish event');
            this.state = 'finished';
            this.container.innerHTML = `
                <div class="event-landing">
                    <div class="event-result-card">
                        <div class="event-result-title">Event Finished</div>
                        <div class="event-result-score">Final Score: ${Number(data.score || 0).toLocaleString()}</div>
                        <div class="event-result-details">
                            ${data.timeBonus ? `<div class="event-result-detail">⏱️ Time Bonus: +${Number(data.timeBonus).toLocaleString()}</div>` : ''}
                            <div class="event-result-detail">⏱️ Time: ${Number(data.timeTaken || 0).toFixed(1)}m</div>
                            <div class="event-result-detail">🏆 Attempts: ${data.attemptsUsed || 0}</div>
                            ${data.cleared ? '<div class="event-result-detail" style="color:#2ecc71">✅ Cleared!</div>' : '<div class="event-result-detail" style="color:#e74c3c">❌ Not cleared</div>'}
                        </div>
                    </div>
                    <div class="event-lb-box">
                        <div class="event-lb-title">🏆 Leaderboard</div>
                        <div class="event-lb-list"></div>
                    </div>
                    <div class="event-error"></div>
                    <button class="event-btn event-btn-secondary" id="event-retry-btn">Retry</button>
                </div>
            `;
            document.getElementById('event-retry-btn').addEventListener('click', () => {
                this.state = 'idle';
                this.currentRoom = 0;
                this.score = 0;
                this.renderLanding();
            });
            this.renderLeaderboard();
        } catch (e) {
            this.showError(e.message);
        }
    }

    renderCombat() {
        this.container.innerHTML = `
            <div class="event-landing">
                <div class="event-hud">
                    <div class="event-hud-pill"><span class="event-hud-ico">⭐</span> <span class="event-hud-num">${this.score.toLocaleString()}</span></div>
                    <div class="event-hud-pill"><span class="event-hud-ico">🚩</span> <span class="event-hud-num">${this.currentRoom + 1}/10</span></div>
                </div>
                <div class="event-combat-hint">Room ${this.currentRoom + 1} — defeat all enemies to advance</div>
                <button id="fight-btn" class="event-btn event-btn-primary">Fight Room</button>
            </div>
        `;
        document.getElementById('fight-btn').addEventListener('click', () => this.fightRoom());
    }

    async renderLanding() {
        this.container.innerHTML = `
            <div class="event-landing">
                <div class="event-landing-header">
                    <div class="event-landing-icon">🔮</div>
                    <div class="event-landing-title">Trial of the Arcane</div>
                    <div class="event-landing-sub">10 rooms · Fixed seed · Compete for the highest score</div>
                </div>
                <div class="event-landing-info">
                    <div class="event-info-pill" id="event-status-pill">Loading...</div>
                    <div class="event-info-pill" id="event-attempts-pill">--</div>
                </div>
                <div class="event-landing-actions">
                    <button id="event-enter-btn" class="event-btn event-btn-primary">Enter Trial</button>
                </div>
                <div class="event-lb-box">
                    <div class="event-lb-title">🏆 Leaderboard</div>
                    <div class="event-lb-list"><div class="event-lb-empty">Loading...</div></div>
                </div>
                <div class="event-error"></div>
            </div>
        `;
        document.getElementById('event-enter-btn').addEventListener('click', () => this.enterEvent());

        const status = await this.loadStatus();
        const statusPill = this.container.querySelector('#event-status-pill');
        const attemptsPill = this.container.querySelector('#event-attempts-pill');
        if (statusPill) {
            if (status.error) {
                statusPill.textContent = '⚠️ ' + this._esc(status.error);
                statusPill.style.color = '#e74c3c';
            } else {
                const endsAt = Number(status.eventEndsAt || 0);
                statusPill.textContent = endsAt ? `⏰ Ends: ${this._formatCountdown(endsAt)}` : '🔮 Event Active';
            }
        }
        if (attemptsPill) {
            attemptsPill.textContent = `Attempts: ${Number(status.attemptsUsed || 0)}`;
        }

        this.renderLeaderboard();
    }

    showError(msg) {
        const errEl = this.container.querySelector('.event-error');
        if (!errEl) return;
        errEl.textContent = this._esc(msg);
        errEl.style.display = 'block';
        setTimeout(() => { errEl.style.display = 'none'; }, 4000);
    }

    _esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    _formatCountdown(epochSec) {
        const diff = Math.max(0, epochSec - Math.floor(Date.now() / 1000));
        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`;
    }
}
window.EventUI = EventUI;
