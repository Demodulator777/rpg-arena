// ═══════════════════════════════════════════════════════════════════════════════
// skills-tree.js  —  Frontend for the Skill Tree Tab
// Drop this file in /public/js/ and add <script src="/js/skills-tree.js"></script>
// to your HTML AFTER app.js.
//
// In index.html, replace the "Train" tab content with:
//   <div id="tab-train" class="game-tab">
//       <div id="skill-tree-root"></div>
//   </div>
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let _stData      = null;   // last fetched skill tree response
let _stLoading   = false;
let _stTips      = [];     // tooltip payloads for the current render
let _stTipHideTimer = null;

// ── Entry point — called by showTab('train') in app.js ───────────────────────
async function renderSkillTreeTab() {
    const root = document.getElementById('skill-tree-root');
    if (!root) return;
    root.innerHTML = stSpinner('Loading skill tree...');
    try {
        _stData    = await api('GET', '/skills/tree');
        _stLoading = false;
        renderSkillTreeUI(root);
    } catch (e) {
        root.innerHTML = `<p style="color:var(--red-light);padding:20px">${e.message}</p>`;
    }
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderSkillTreeUI(root) {
    if (!_stData || !character) { root.innerHTML = stSpinner('Loading...'); return; }
    const { tree, learned, passiveBonuses, activeTraining, magePath: mPath, dualWieldUnlocked,
            upgradePenalties, upgradeDiscounts, extraStats, busyState } = _stData;
    const charClass = character.class || 'warrior';

    const classColors = { warrior:'#e74c3c', mage:'#9b59b6', rogue:'#2ecc71', paladin:'#f1c40f' };
    const accent = classColors[charClass] || '#3498db';

// ── Header ────────────────────────────────────────────────────────────────────
    let html = `
    <div style="padding:0 0 20px">

        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:16px;
                    background:rgba(255,255,255,0.03);border:1px solid ${accent}33;border-radius:12px">
            <img src="/images/class/${charClass}.png" style="width:56px;height:56px;border-radius:50%;
                 object-fit:cover;border:2px solid ${accent}66" data-error-hide="true">
            <div style="flex:1">
                <div style="font-family:'Cinzel',serif;font-size:1.1rem;font-weight:700;color:${accent}">
                    ${capitalize(charClass)} Skill Tree
                </div>
                <div style="font-size:0.76rem;color:rgba(255,255,255,0.45);margin-top:3px;line-height:1.4">
                    ${tree.description || ''}
                </div>
            </div>
            <div style="text-align:right;font-size:0.72rem;color:rgba(255,255,255,0.35)">
            <div><span style="color:var(--gold)">💰 ${(character.gold||0).toLocaleString()}</span></div>
                <div style="margin-top:3px">${learned.length} skill${learned.length!==1?'s':''} learned</div>
            </div>
        </div>
        
        <!-- DISCOVERY MESSAGE -->
        <div style="padding:8px 14px;border-radius:8px;background:rgba(155,89,182,0.08);
                  border:1px solid rgba(155,89,182,0.25);margin-bottom:14px;font-size:0.72rem;
                  color:rgba(255,255,255,0.5);text-align:center">
            🌳 <strong>Living skill tree</strong> — train a skill to reveal the next step of its path. Master a full path to unlock its evolution.
        </div>`;

// ── Class stat modifier notice ─────────────────────────────────────────────
    const penalties = upgradePenalties  || {};
    const discounts = upgradeDiscounts  || {};
    if (Object.keys(penalties).length || Object.keys(discounts).length) {
        const pArr = Object.entries(penalties).map(([s,v]) => `<span style="color:#e74c3c">+${Math.round(v*100)}% ${s.replace('_',' ')} cost</span>`);
        const dArr = Object.entries(discounts).map(([s,v]) => `<span style="color:#2ecc71">-${Math.round(v*100)}% ${s.replace('_',' ')} cost</span>`);
        html += `
        <div style="font-size:0.72rem;padding:8px 12px;border-radius:8px;
                    background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);
                    margin-bottom:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <span style="color:rgba(255,255,255,0.35)">Class stat costs:</span>
            ${[...pArr,...dArr].join(' &nbsp;·&nbsp; ')}
        </div>`;
    }

// ── Mage path notice ──────────────────────────────────────────────────────
    if (charClass === 'mage' && mPath) {
        const pathColor = mPath === 'shadow' ? '#9b59b6' : '#f1c40f';
    const pathName  = mPath === 'shadow' ? '🌑 Shadow Path' : '☀️ Light Path';
        html += `
        <div style="padding:8px 14px;border-radius:8px;border:1px solid ${pathColor}55;
                    background:${pathColor}11;font-size:0.78rem;color:${pathColor};
                    margin-bottom:14px;font-weight:600">
            You walk the ${pathName}. The opposite path is forever closed.
        </div>`;
    }

// ── Rogue dual-wield notice ───────────────────────────────────────────────
    if (charClass === 'rogue') {
        if (dualWieldUnlocked) {
            html += `<div style="padding:8px 14px;border-radius:8px;border:1px solid #2ecc7155;
                                 background:#2ecc7111;font-size:0.78rem;color:#2ecc71;margin-bottom:14px">
                        ⚔️⚔️ <strong>Dual Wield Unlocked!</strong> Equip a second weapon in your shield slot.
                     </div>`;
        }
        html += `<div style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);
                              background:rgba(255,255,255,0.02);font-size:0.72rem;color:rgba(255,255,255,0.4);
                              margin-bottom:14px">
                    🛡️ No shield equipped? You passively gain <strong style="color:#2ecc71">+5 Agility</strong>.
                    Current shield-less wins tracked: <strong>${extraStats?.wins_no_shield || 0}</strong>
                 </div>`;
    }

// ── Active training session ───────────────────────────────────────────────
    if (activeTraining) {
        const done = activeTraining.done;
        const left = activeTraining.timeLeft || 0;
        const timeStr = stFormatTime(left);
        html += `
        <div id="st-training-bar" style="padding:14px 16px;border-radius:10px;
                  border:1px solid ${done ? '#2ecc7155' : accent+'44'};
                  background:${done ? 'rgba(46,204,113,0.08)' : `${accent}11`};
                  margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="flex:1">
                <div style="font-weight:700;font-size:0.9rem;color:${done?'#2ecc71':accent}">
                    ${done ? '✅ Training Complete!' : `⏳ Training: ${activeTraining.skill_id.replace(/_/g,' ')}`}
                </div>
                <div style="font-size:0.74rem;color:rgba(255,255,255,0.4);margin-top:3px">
                    ${done ? 'Collect your new skill below.' : `${timeStr} remaining`}
                </div>
            </div>
            ${done
                ? `<button class="btn-primary" style="padding:8px 18px;font-size:0.82rem" ${actionAttrs('stCollect')}>⚡ Collect Skill</button>`
                : `<button class="btn-secondary" style="padding:6px 14px;font-size:0.78rem;color:var(--red-light)" ${actionAttrs('stCancel')}>Cancel (partial refund)</button>`
            }
        </div>`;
    }

// ── Skill tree graph ──────────────────────────────────────────────────────
    if (!tree.branches || !Object.keys(tree.branches).length) {
        html += `<p style="color:rgba(255,255,255,0.4);padding:20px;text-align:center">No branches found for ${charClass}.</p>`;
    } else {
        html += stRenderTree(tree, accent, activeTraining, charClass, busyState);
    }

    html += `</div>`;
    root.innerHTML = html;
    stAttachSkillTips(root);
}

// ── Branch renderer ───────────────────────────────────────────────────────
// ═══ Skill tree graph — starter → rail → branch paths → doctrine splits ═══
function stTreeCss() {
    return `<style>
    .st-tree { --st-line: rgba(255,255,255,0.22); --st-line-lit: rgba(232,184,75,0.7); }
    .st-scroll { overflow-x:auto; padding: 4px 2px 16px; }
    .st-tree-wrap { display:flex; flex-direction:column; align-items:center; width:max-content; margin:0 auto; }
    .st-starter-row { display:flex; justify-content:center; padding-bottom:0; width:100%; }
    .st-tree-stem { width:3px; height:20px; background:var(--st-line); }
    .st-fork-row { position:relative; width:100%; height:3px; }
    .st-fork-line { position:absolute; top:0; height:3px; background:var(--st-line); border-radius:2px; }
    .st-fork-lit { position:absolute; top:0; height:3px; background:var(--st-line-lit); border-radius:2px; z-index:1; }
    .st-branches { display:flex; align-items:stretch; }
    .st-branch-col { flex:1 1 0; min-width:158px; display:flex; flex-direction:column; align-items:center; padding:0 5px; }
    .st-stub { width:3px; height:20px; background:var(--st-line); flex-shrink:0; }
    .st-stub.lit { background:var(--st-line-lit); }
    .st-link { width:3px; height:16px; background:var(--st-line); flex-shrink:0; }
    .st-link.lit { background:var(--st-line-lit); }
    .st-blob { width:100%; max-width:150px; border-radius:12px; border:1px solid rgba(255,255,255,0.12);
               background:rgba(255,255,255,0.03); padding:10px 8px 9px; text-align:center; position:relative;
               box-sizing:border-box; }
    .st-blob-icon { width:44px; height:44px; margin:0 auto 6px; display:flex; align-items:center; justify-content:center; font-size:2rem; line-height:1; }
    .st-blob-icon img { width:100%; height:100%; object-fit:contain; }
    .st-blob-name { font-size:0.72rem; font-weight:700; line-height:1.25; color:rgba(255,255,255,0.82); }
    .st-blob-sub { font-size:0.6rem; color:rgba(255,255,255,0.42); margin-top:4px; line-height:1.35; }
    .st-progress { height:4px; border-radius:3px; background:rgba(255,255,255,0.1); overflow:hidden; margin-top:6px; }
    .st-progress > div { height:100%; border-radius:3px; }
    .st-badge { position:absolute; top:6px; right:7px; font-size:0.62rem; line-height:1; }
    .st-train-row { display:flex; gap:3px; margin-top:8px; }
    .st-train-row select { flex:0 0 46px; background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.22); border-radius:4px; color:#fff; font-size:0.62rem; padding:3px 2px; }
    .st-train-row button { flex:1; border-radius:4px; font-size:0.62rem; font-weight:700; padding:4px 2px; cursor:pointer; }
    .st-state-training { animation: stPulse 1.8s ease-in-out infinite; }
    @keyframes stPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(241,196,15,0); } 50% { box-shadow: 0 0 14px 2px rgba(241,196,15,0.35); } }
    .st-future { border-style:dashed; opacity:0.55; }
    .st-doctrines { display:flex; gap:10px; width:100%; }
    .st-sub-col { flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:center; }
    .st-sub-rail-row { position:relative; height:20px; width:100%; }
    .st-sub-rail { position:absolute; top:18px; height:2px; background:var(--st-line); }
    .st-sub-col .st-blob { max-width:none; width:100%; }
    .st-closed-note { font-size:0.58rem; color:rgba(224,82,82,0.8); letter-spacing:0.08em; font-weight:700; }
    </style>`;
}

function stBranchColor(branchId, accent) {
    const branchColors = {
        berserker:'#e74c3c', iron_guard:'#5dade2', battle_commander:'#f39c12',
        gladiator:'#f1c40f', arcane_foundation:'#9b59b6', pyromancer:'#e74c3c',
        cryomancer:'#5dade2', stormcaller:'#f1c40f', light_path:'#ffeaa7',
        shadow_path:'#6c5ce7', assassin:'#e74c3c', trickster:'#00b894',
        shadowblade:'#636e72', dual_wielder:'#fd79a8', protector:'#74b9ff',
        divine_warrior:'#fdcb6e', inquisitor:'#a29bfe', crusader:'#e17055',
    };
    return branchColors[branchId] || accent;
}

// Square skill node: skill image with emoji fallback, name, progress, train controls.
// Square skill node: skill image with emoji fallback, name, progress, train controls.
function stSkillBlob(sk, bc, activeTraining, busyState) {
    const skillKey = sk.id;
    const learned = sk.learned;
    const trainable = sk.trainable;
    const training = (activeTraining?.skillId || activeTraining?.skill_id) === skillKey;
    const progress = Math.floor(sk.progress || 0);
    const isEvo = sk.type === 'evolution';

    let borderColor = 'rgba(255,255,255,0.12)', bg = 'rgba(255,255,255,0.03)', nameColor = 'rgba(255,255,255,0.82)';
    if (learned) { borderColor = bc; bg = bc + '14'; nameColor = bc; }
    else if (training) { borderColor = '#f1c40f'; bg = 'rgba(241,196,15,0.07)'; nameColor = '#f1c40f'; }
    else if (trainable) { borderColor = bc + '99'; bg = bc + '0a'; }
    if (isEvo && !learned) { borderColor = trainable ? '#f1c40f' : 'rgba(241,196,15,0.35)'; bg = trainable ? 'rgba(241,196,15,0.06)' : 'rgba(241,196,15,0.02)'; nameColor = trainable ? '#f1c40f' : 'rgba(241,196,15,0.5)'; }

    let sub = '';
    let progressHtml = '';
    if (training && activeTraining) {
        const tp = (activeTraining.progressPercent ?? activeTraining.progressCurrent ?? activeTraining.progress ?? 0);
        const gain = Math.max(0, tp - Number(activeTraining.progressStart ?? activeTraining.progress_start ?? tp));
        const gainTxt = gain >= 0.1 ? `· +${gain.toFixed(1)}%` : '';
        sub = `⏳ ${stFormatTime(activeTraining.remainingSeconds || activeTraining.remaining || 0)} left`;
        progressHtml = `<div class="st-progress"><div style="width:${tp}%;background:#f1c40f"></div></div>
            <div class="st-blob-sub">${tp < 10 ? tp.toFixed(1) : Math.floor(tp)}%${gainTxt}</div>`;
        sub = `${progress < 10 ? progress.toFixed(1) : Math.floor(progress)}% learned`;
        progressHtml = `<div class="st-progress"><div style="width:${progress}%;background:${bc}"></div></div>`;
    } else if (learned) {
        sub = '✓ Mastered';
    } else if (progress > 0) {
        sub = `${progress}% learned`;
        progressHtml = `<div class="st-progress"><div style="width:${progress}%;background:${bc}"></div></div>`;
    } else if (sk.locked && sk.unlockConditionDesc) {
        sub = '🔒 ' + sk.unlockConditionDesc;
    }

    let controls = '';
    if (trainable && !training && !learned) {
        const missionActive = !!busyState?.missionBusy;
        const cooldown = Number(busyState?.battleCooldownRemaining || 0) > 0;
        const traveling = !!busyState?.traveling;
        const missionCollect = !!busyState?.missionReadyToCollect;
        if (missionActive || cooldown || traveling || missionCollect) {
            const label = missionCollect ? 'Collect mission' : missionActive ? 'Mission active' : cooldown ? 'Battle cooldown' : 'Traveling';
            controls = `<div class="st-blob-sub" style="margin-top:7px">🔒 ${label}</div>`;
        } else {
            const hasArcaneReservoir = !!(character?.premium_features?.arcane_reservoir);
            const maxHours = hasArcaneReservoir ? 12 : 8;
            let opts = '';
            for (let h = 1; h <= maxHours; h++) opts += `<option value="${h}">${h}h</option>`;
            controls = `
            <div class="st-train-row">
                <select id="train-hours-${skillKey}">${opts}</select>
                <button ${actionAttrs('stStartTrain', skillKey, sk.branchId || sk._branchId, false)}
                    style="border:1px solid ${bc}88;background:${bc}18;color:${bc}">Train</button>
                <button ${actionAttrs('stStartTrain', skillKey, sk.branchId || sk._branchId, true)} title="2x speed (500 gold/hour)"
                    style="border:1px solid #f1c40f66;background:rgba(241,196,15,0.15);color:#f1c40f">2x</button>
            </div>`;
        }
    }

        const badge = learned ? `<span class="st-badge" style="color:${bc}">✓</span>`
        : training ? `<span class="st-badge" style="color:#f1c40f">⚡</span>`
        : isEvo ? `<span class="st-badge" style="color:rgba(241,196,15,0.6)">🧬</span>` : '';

    const stateText = training ? 'Training in progress'
        : learned ? 'Mastered'
        : trainable ? 'Ready to train'
        : (sk.locked && sk.unlockConditionDesc) ? sk.unlockConditionDesc
        : (progress > 0 ? 'In progress' : 'Locked');
    const tipIdx = _stTips.length;
    _stTips.push({
        emoji: sk.emoji || '⚔️',
        img: `/images/assets/skills/${skillKey}.png`,
        name: sk.name,
        color: isEvo ? '#f1c40f' : bc,
        meta: `Tier ${sk.tier || '?'}${isEvo ? ' · Evolution' : ''}`,
        desc: sk.desc || '',
        effects: stEffectParts(sk.effects),
        state: stateText
    });

    return `<div class="st-blob${training ? ' st-state-training' : ''}" style="border-color:${borderColor};background:${bg};cursor:help" data-sttip="${tipIdx}">
        ${badge}
        <div class="st-blob-icon"><img src="/images/assets/skills/${skillKey}.png" alt="" data-error-hide="true" data-error-next-display="inline-flex"><span style="display:none;font-size:2rem;line-height:1">${sk.emoji || '⚔️'}</span></div>
        <div class="st-blob-name" style="color:${nameColor}">${sk.name}</div>
        ${sub ? `<div class="st-blob-sub">${sub}</div>` : ''}
        ${progressHtml}
        ${controls}
    </div>`;
}

// Dimmed placeholder for a skill whose data is not yet known.
function stFutureBlob() {
    const tipIdx = _stTips.length;
    _stTips.push({
        emoji: '❓',
        name: '???',
        color: 'rgba(255,255,255,0.4)',
        meta: 'Unknown skill',
        desc: 'Keep training this path to reveal the next step.',
        effects: [],
        state: ''
    });
    return `<div class="st-blob st-future" style="cursor:help" data-sttip="${tipIdx}">
        <div class="st-blob-icon" style="color:rgba(255,255,255,0.25)">❓</div>
        <div class="st-blob-name" style="color:rgba(255,255,255,0.3)">???</div>
    </div>`;
}

// Dimmed but informative locked blob — shows real skill name, icon, and effects
// but styled as locked so the player knows it exists and what they'd get.
function stLockedBlob(sk, bc) {
    const tipIdx = stPushTip({
        emoji: sk.emoji || '⚔️',
        img: `/images/assets/skills/${sk.id}.png`,
        name: sk.name,
        color: bc,
        meta: `Tier ${sk.tier || '?'} · Locked`,
        desc: sk.desc || sk.description || '',
        effects: stEffectParts(sk.effects),
        state: '🔒 Complete previous skill to unlock'
    });
    return `<div class="st-blob st-future" style="border-color:${bc}22;background:${bc}06;cursor:help" data-sttip="${tipIdx}">
        <div class="st-blob-icon" style="opacity:0.45"><img src="/images/assets/skills/${sk.id}.png" alt="" data-error-hide="true" data-error-next-display="inline-flex"><span style="display:none;font-size:1.6rem;line-height:1">${sk.emoji || '⚔️'}</span></div>
        <div class="st-blob-name" style="color:rgba(255,255,255,0.45)">${sk.name || '???'}</div>
        <div class="st-blob-sub" style="color:rgba(255,255,255,0.3)">🔒</div>
    </div>`;
}

// Branch header node.
function stBranchBlob(branchId, branch, bc, accent) {
    const skills = Object.values(branch.skills).filter(s => s.type !== 'evolution');
    const learnedCount = skills.filter(s => s.learned).length;
    const total = skills.length;
    const canUnlearn = Object.values(branch.skills).some(s => (s.progress || 0) > 0) && !branch.isStarter;
    const tipIdx = _stTips.length;
    _stTips.push({
        emoji: branch.emoji || '⚔️',
        name: branch.name,
        color: bc,
        meta: 'Skill path',
        desc: branch.description || '',
        effects: [],
        state: `${learnedCount}/${total} mastered${branch.exclusiveLocked ? ' · forever closed' : ''}`
    });
    return `<div style="width:100%;margin:4px 0 0;cursor:help" data-sttip="${tipIdx}">
        <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:8px;background:${bc}0d;border:1px solid ${bc}33">
            <span style="font-size:1.2rem;line-height:1">${branch.emoji || '⚔️'}</span>
            <span style="font-size:0.78rem;font-weight:700;color:${bc}">${branch.name}</span>
            <span style="font-size:0.6rem;color:${bc}99;margin-left:auto;white-space:nowrap">${learnedCount}/${total}</span>
            ${canUnlearn ? `<button ${actionAttrs('stUnlearnStep', branchId)} title="Unlearn the last skill of this path (50% gold refund)"
                style="font-size:0.52rem;padding:1px 6px;background:rgba(231,76,60,0.12);border:1px solid rgba(231,76,60,0.3);border-radius:4px;color:#e74c3c;cursor:pointer">↩</button>` : ''}
            ${branch.exclusiveLocked ? `<span style="font-size:0.52rem;color:#e74c3c;background:rgba(231,76,60,0.12);border-radius:4px;padding:1px 5px;white-space:nowrap">🔒 CLOSED</span>` : ''}
        </div>
    </div>`;
}


// ── Game-styled hover tooltip (reuses #item-tooltip) ─────────────────────────
function stEffectParts(effects) {
    const parts = [];
    for (const eff of effects || []) {
        if (eff.type === 'passive_stat') parts.push('+ ' + eff.value + ' ' + String(eff.stat).replace(/_/g, ' '));
        else if (eff.type === 'passive_pct' && eff.value > 0) parts.push('+' + Math.round(eff.value * 100) + '% ' + String(eff.stat).replace(/_/g, ' '));
        else if (eff.type === 'passive_pct' && eff.value < 0) parts.push(Math.round(eff.value * 100) + '% ' + String(eff.stat).replace(/_/g, ' '));
        else if (eff.type === 'resist_bonus') parts.push('+' + eff.value + ' all resists');
        else if (eff.type === 'active_combat') parts.push('⚡ ' + String(eff.id).replace(/_/g, ' '));
        else if (eff.type === 'class_modifier') parts.push('🔧 ' + String(eff.id).replace(/_/g, ' '));
    }
    return parts;
}

function stPushTip(data) { _stTips.push(data); return _stTips.length - 1; }

function stHideTipNow() {
    const t = document.getElementById('item-tooltip');
    if (t) t.classList.add('hidden');
}
function stHideTipSoon() {
    if (_stTipHideTimer) clearTimeout(_stTipHideTimer);
    _stTipHideTimer = setTimeout(stHideTipNow, 150);
}
function stCancelHideTip() {
    if (_stTipHideTimer) { clearTimeout(_stTipHideTimer); _stTipHideTimer = null; }
}

function stShowTipFor(el) {
    const d = _stTips[Number(el.getAttribute('data-sttip'))];
    if (!d) return;
    stCancelHideTip();
    let tip = document.getElementById('item-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'item-tooltip';
        tip.className = 'item-tooltip hidden';
        document.body.appendChild(tip);
    }
    const effectLines = (d.effects || []).map(p =>
        '<div class="tt-stat"><span class="tt-stat-name" style="text-transform:none">' + p + '</span></div>'
    ).join('');
    tip.innerHTML =
        '<div class="tt-preview" style="padding:12px">' +
            (d.img
                ? '<img src="' + d.img + '" alt="" data-error-hide="true" data-error-next-display="inline-flex" style="width:80px;height:80px"><span class="tt-preview-emoji" style="display:none;font-size:3rem">' + (d.emoji || '') + '</span>'
                : '<span class="tt-preview-emoji" style="font-size:3rem">' + (d.emoji || '') + '</span>') +
        '</div>' +
        '<div class="tt-body">' +
            '<div class="tt-name" style="color:' + (d.color || 'var(--text-bright)') + '">' + d.name + '</div>' +
            (d.meta ? '<div class="tt-meta">' + d.meta + '</div>' : '') +
            (d.desc ? '<div class="tt-desc">' + d.desc + '</div>' : '') +
            (effectLines ? '<div class="tt-stats">' + effectLines + '</div>' : '') +
            (d.state ? '<div class="tt-vs">' + d.state + '</div>' : '') +
        '</div>';
    tip.classList.remove('hidden');
    tip.style.height = '';
    tip.style.pointerEvents = 'none';
    const r = el.getBoundingClientRect();
    const zf = (typeof uiZoomFactor === 'function') ? uiZoomFactor() : 1;
    const vw = window.innerWidth / zf, vh = window.innerHeight / zf;
    const tw = tip.offsetWidth || 220, th = tip.offsetHeight || 260;
    const isNarrow = vw < 500;
    let left, top;
    if (isNarrow) {
        left = Math.max(8, Math.round(r.left / zf + r.width / zf / 2 - tw / 2));
        top = Math.round(r.bottom / zf + 8);
    } else {
        left = r.right / zf + 12;
        top = r.top / zf;
        if (left + tw > vw - 8) left = r.left / zf - tw - 12;
    }
    if (top + th > vh - 8) top = vh - th - 8;
    if (top < 8) top = 8;
    tip.style.left = Math.max(8, Math.round(left)) + 'px';
    tip.style.top = Math.round(top) + 'px';
}

function stAttachSkillTips(root) {
    if (!root) return;
    root.querySelectorAll('[data-sttip]').forEach(el => {
        el.addEventListener('mouseenter', () => stShowTipFor(el));
        el.addEventListener('mouseleave', stHideTipSoon);
    });
}

// Vertical chain of skill blobs with lit/dim connectors. Reveals the path as
// skills get trained: unrevealed tail renders as dimmed "???" blobs.
function stChain(branch, bc, activeTraining, busyState, branchId) {
    const entries = Object.entries(branch.skills)
        .map(([id, sk]) => [id, Object.assign({ _branchId: branchId }, sk)])
        .sort(([, a], [, b]) => (a.tier || 0) - (b.tier || 0));
    let html = '';
    let revealed = true;
    for (const [id, sk] of entries) {
        const isRevealed = revealed && (sk.started || sk.learned || sk.trainable || sk.prereqsMet);
        if (!isRevealed) {
            if (html) html += `<div class="st-link"></div>`;
            html += (sk.name || sk.effects) ? stLockedBlob(sk, bc) : stFutureBlob();
            revealed = false;
            continue;
        }
        const litLink = sk.learned || (sk.progress || 0) > 0;
        if (html) html += `<div class="st-link${litLink ? ' lit' : ''}"></div>`;
        html += stSkillBlob(sk, bc, activeTraining, busyState);
    }
    return html;
}

// Full tree: starter → stem → fork → branch columns (→ doctrine splits).
function stRenderTree(tree, accent, activeTraining, charClass, busyState) {
    _stTips = [];
    const branches = tree.branches;
    const ids = Object.keys(branches);
    const starterId = ids.find(id => branches[id].isStarter);
    const mains = ids.filter(id => id !== starterId && !branches[id].parent_branch);
    const childrenOf = pid => ids.filter(id => branches[id].parent_branch === pid);

    const n = Math.max(1, mains.length);

    let html = `<div class="st-tree">${stTreeCss()}<div class="st-scroll">`;

    // All tree content shares a single wrapper so starter, stem, fork, and columns
    // have the same width context (critical for mobile alignment).
    const hasBranches = mains.length > 0;
    if (hasBranches) {
        html += `<div class="st-tree-wrap">`;
    }

    // Starter node
    if (starterId) {
        const starter = branches[starterId];
        const firstSkill = Object.values(starter.skills)[0];
        if (firstSkill) {
            html += `<div class="st-starter-row">
                ${stSkillBlob(Object.assign({ _branchId: starterId }, firstSkill), accent, activeTraining, busyState)}
            </div>`;
        }
    }

    // Stem
    if (hasBranches) {
        html += `<div class="st-tree-stem"></div>`;
    }

    // Fork: horizontal bar spanning all branch column centers
    if (hasBranches) {
        const activeBranchId = mains.find(id => branchTreeHasProgressLocal(tree.branches[id], tree, id));
        const forkLeftPct  = ((2 * 0 + 1) / (2 * n)) * 100;
        const forkRightPct = ((2 * (n - 1) + 1) / (2 * n)) * 100;
        const activeIdx = activeBranchId ? mains.indexOf(activeBranchId) : -1;
        const litCenterPct = activeIdx >= 0 ? ((2 * activeIdx + 1) / (2 * n)) * 100 : -1;

        // Fork bar
        html += `<div class="st-fork-row">
            <div class="st-fork-line" style="left:${forkLeftPct}%;right:${100 - forkRightPct}%"></div>
            ${litCenterPct >= 0 ? `<div class="st-fork-lit" style="left:${forkLeftPct}%;width:${Math.max(0.5, litCenterPct - forkLeftPct + 0.5)}%"></div>` : ''}
        </div>`;

        // Branch columns
        html += `<div class="st-branches">`;
        for (let mi = 0; mi < mains.length; mi++) {
            const branchId = mains[mi];
            const branch = branches[branchId];
            const bc = stBranchColor(branchId, accent);
            const closed = !!branch.exclusiveLocked;
            const doctrineIds = childrenOf(branchId).filter(id => branches[id]);
            const isActive = mains[mi] === activeBranchId;

            html += `<div class="st-branch-col">`;
            html += `<div class="st-stub${isActive ? ' lit' : ''}"></div>`;
            html += stBranchBlob(branchId, branch, bc, accent);

            if (closed) {
                html += `<div class="st-link"></div><div class="st-blob st-future" style="padding:16px 8px">
                <div class="st-closed-note">🔒 PATH<br>CLOSED</div></div>`;
            } else {
                html += `<div class="st-link"></div>`;
                html += stChain(branch, bc, activeTraining, busyState, branchId);

                // Doctrine split below the parent chain
                if (doctrineIds.length > 1 || (doctrineIds.length === 1 && branchTreeHasProgressLocal(branches[doctrineIds[0]], tree, doctrineIds[0]))) {
                    const subN = doctrineIds.length;
                    const subSide = (100 / subN) / 2;
                    html += `<div class="st-link"></div>
                        <div class="st-doctrines">`;
                    for (const dId of doctrineIds) {
                        const dBranch = branches[dId];
                        const dbc = stBranchColor(dId, accent);
                        html += `<div class="st-sub-col">
                            <div class="st-sub-rail-row"><div class="st-sub-rail" style="left:${subSide}%;right:${subSide}%"></div></div>
                            <div class="st-stub"></div>
                            ${stBranchBlob(dId, dBranch, dbc, accent)}
                            <div class="st-link"></div>
                            ${stChain(dBranch, dbc, activeTraining, busyState, dId)}
                        </div>`;
                    }
                    html += `</div>`;
                }
            }
            html += `</div>`;
        }
        html += `</div>`;
    }

    if (hasBranches) html += `</div>`;
    html += `</div></div>`;
    return html;
}

function branchTreeHasProgressLocal(branch, tree, branchId) {
    if (!branch) return false;
    if (Object.values(branch.skills || {}).some(s => (s.progress || 0) > 0)) return true;
    for (const [id, b] of Object.entries(tree?.branches || {})) {
        if (b.parent_branch === branchId && Object.values(b.skills || {}).some(s => (s.progress || 0) > 0)) return true;
    }
    return false;
}


function stEffectSummary(effects) {
    const parts = [];
    for (const eff of effects) {
        if (eff.type === 'passive_stat') {
            parts.push(`+${eff.value} ${eff.stat.replace(/_/g,' ')}`);
        } else if (eff.type === 'passive_pct' && eff.value > 0) {
            parts.push(`+${Math.round(eff.value*100)}% ${eff.stat.replace(/_/g,' ')}`);
        } else if (eff.type === 'resist_bonus') {
            parts.push(`+${eff.value} all resists`);
        } else if (eff.type === 'active_combat') {
            parts.push(`⚡ ${eff.id.replace(/_/g,' ')}`);
        } else if (eff.type === 'class_modifier') {
            parts.push(`🔧 ${eff.id.replace(/_/g,' ')}`);
        }
    }
    return parts.slice(0, 3).join(' · ');
}

// ── Time formatter ────────────────────────────────────────────────────────────
function stFormatTime(seconds) {
    if (!seconds) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h >= 24) return `${Math.floor(h/24)}d ${h%24}h`;
    if (h)       return `${h}h ${m}m`;
    return `${m}m`;
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function stSpinner(msg) {
    return `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.35)">${msg}</div>`;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function stStartTrain(skillId, branchId, doubleSpeed = false) {
    if (!_stData) return;
    const branch = _stData.tree?.branches?.[branchId];
    const sk = branch?.skills?.[skillId];
    if (!sk) return;
    
    const hoursSelect = document.getElementById(`train-hours-${skillId}`);
    const hours = hoursSelect ? parseInt(hoursSelect.value) : 8;
    
    const hasArcaneReservoir = !!(character?.premium_features?.arcane_reservoir);
    const maxHours = hasArcaneReservoir ? 12 : 8;
    
    if (hours < 1 || hours > maxHours) {
        showMsg('skill-tree-msg', `Training hours must be between 1 and ${maxHours}`, true);
        return;
    }
    
    const mats = sk.nextThresholdCost || {};
    const matStrs = Object.entries(mats).filter(([,v])=>v).map(([k,v]) => `${v}× ${k.replace(/_/g,' ')}`);
    const costLine = [`⏱ ${hours} hour${hours > 1 ? 's' : ''}`, ...matStrs].join(', ');
    
    if (doubleSpeed) {
        const goldCost = hours * 500;
        if ((character?.gold || 0) < goldCost) {
            showMsg('skill-tree-msg', `Need ${goldCost} gold for double speed training!`, true);
            return;
        }
        const ok = await openGameConfirmDialog({
            title: `Train "${sk.name}" at 2x speed?`,
            message: `Cost: ${goldCost} gold<br>Time: ${hours} hours (2x progress)<br>Requires: ${costLine}`,
            confirmLabel: 'Train (2x)',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;
    } else {
        const ok = await openGameConfirmDialog({
            title: `Train "${sk.name}"?`,
            message: `Time: ${hours} hours<br>Requires: ${costLine}`,
            confirmLabel: 'Train',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;
    }
    
     try {
        const d = await api('POST', '/skills/train/start', { skillId, branchId, hours, doubleSpeed });
        showMsg('skill-tree-msg', d.message);
        character = await api('GET', '/game/character');
        renderTopBar();
        await renderSkillTreeTab();
        if (typeof startTrainingPolling === 'function') startTrainingPolling();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

async function updateTrainingStatus() {
    try {
        const status = await api('GET', '/skills/training/status');
        if (status.active) {
            const progress = Math.floor((status.progressPercent ?? status.progressCurrent ?? status.progress_current ?? status.progress ?? 0));
            const remaining = formatTime(status.remainingSeconds || status.remaining || 0);
            document.getElementById('training-indicator').innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; background: rgba(155,89,182,0.2); padding: 4px 10px; border-radius: 20px;">
            <span>⚔️ Training: ${progress}%</span>
                    <div style="width: 60px; background: rgba(255,255,255,0.2); border-radius: 4px; height: 4px;">
                        <div style="width: ${progress}%; background: #9b59b6; height: 4px; border-radius: 4px;"></div>
                    </div>
                    <span style="font-size: 0.7rem;">${remaining}</span>
                    <button ${actionAttrs('cancelTraining')} style="background: rgba(231,76,60,0.3); border: none; border-radius: 12px; padding: 2px 6px; font-size: 0.6rem; cursor: pointer;">✕</button>
                </div>
            `;
            document.getElementById('training-indicator').classList.remove('hidden');
        } else {
            document.getElementById('training-indicator').classList.add('hidden');
        }
    } catch(e) {
        console.error('Failed to get training status:', e);
    }
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

async function cancelTraining() {
    const ok = await openGameConfirmDialog({
        title: 'Cancel Training?',
        message: 'You will receive a partial gold refund if you paid for double speed.',
        confirmLabel: 'Cancel Training',
        cancelLabel: 'Keep Training',
        danger: true,
    });
    if (!ok) return;
    try {
        const d = await api('POST', '/skills/cancel');
        showMsg('skill-tree-msg', d.message);
        character = await api('GET', '/game/character');
        renderTopBar();
        await renderSkillTreeTab();
    } catch(e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

async function stCollect() {
    try {
        const d = await api('POST', '/skills/collect');
        character = await api('GET', '/game/character');
        renderTopBar();
        renderCharacter();
        showMsg('skill-tree-msg', d.message);
        await renderSkillTreeTab();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

async function stCancel() {
    const ok = await openGameConfirmDialog({
        title: 'Cancel Training?',
        message: 'You will receive a partial gold refund (pro-rated by time remaining). Materials are NOT returned.',
        confirmLabel: 'Cancel Training',
        cancelLabel: 'Keep Training',
        danger: true,
    });
    if (!ok) return;
    try {
        const d = await api('POST', '/skills/cancel');
        showMsg('skill-tree-msg', d.message);
        character = await api('GET', '/game/character');
        renderTopBar();
        await renderSkillTreeTab();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

async function stUnlearnStep(branchId) {
    if (!confirm(`Unlearn the last skill you trained in "${branchId}"? This removes one step at a time and refunds 50% of that skill's gold cost.`)) return;
    try {
        const d = await api('POST', '/skills/unlearn-step', { branchId });
        character = await api('GET', '/game/character');
        renderTopBar();
        renderCharacter();
        showMsg('skill-tree-msg', d.message);
        await renderSkillTreeTab();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

// ── Poll training timer (updates once per minute while tab is visible) ───────
let _stPollTimer = null;
function startSkillTreePoll() {
    stopSkillTreePoll();
    _stPollTimer = setInterval(async () => {
        const root = document.getElementById('skill-tree-root');
        const tab  = document.getElementById('tab-train');
        if (!root || !tab?.classList.contains('active')) return;
        try {
            const status = await api('GET', '/skills/training/status');
            if (status && _stData) {
                _stData.activeTraining = status;
                renderSkillTreeUI(root);
            }
        } catch {}
    }, 30000);
}
function stopSkillTreePoll() {
    if (_stPollTimer) { clearInterval(_stPollTimer); _stPollTimer = null; }
}

// ── Hook into existing showTab ───────────────────────────────────────────────
// Monkey-patch the existing showTab so we intercept the 'train' tab.
(function patchShowTab() {
    const _orig = window.showTab;
    window.showTab = function(name) {
        _orig(name);
        if (name === 'train') {
            renderSkillTreeTab();
            startSkillTreePoll();
        } else {
            stopSkillTreePoll();
        }
    };
})();

// ── Expose globals ───────────────────────────────────────────────────────────
window.renderSkillTreeTab = renderSkillTreeTab;
window.stStartTrain       = stStartTrain;
window.stCollect          = stCollect;
window.stCancel           = stCancel;
window.stUnlearnStep      = stUnlearnStep;
