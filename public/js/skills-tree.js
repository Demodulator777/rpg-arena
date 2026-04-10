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
            upgradePenalties, upgradeDiscounts, extraStats } = _stData;
    const charClass = character.class || 'warrior';

    const classColors = { warrior:'#e74c3c', mage:'#9b59b6', rogue:'#2ecc71', paladin:'#f1c40f' };
    const accent = classColors[charClass] || '#3498db';

    // ── Header ─────────────────────────────────────────────────────────────────
    let html = `
    <div style="padding:0 0 20px">

        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:16px;
                    background:rgba(255,255,255,0.03);border:1px solid ${accent}33;border-radius:12px">
            <img src="/images/class/${charClass}.png" style="width:56px;height:56px;border-radius:50%;
                 object-fit:cover;border:2px solid ${accent}66" onerror="this.style.display='none'">
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
        
        <!-- DISCOVERY MESSAGE - ADD THIS HERE -->
        <div style="padding:8px 14px;border-radius:8px;background:rgba(155,89,182,0.08);
                  border:1px solid rgba(155,89,182,0.25);margin-bottom:14px;font-size:0.72rem;
                  color:rgba(255,255,255,0.5);text-align:center">
            🔍 <strong>Discovery-based skill tree</strong> — Only trainable skills are visible. 
            Experiment to uncover hidden paths!
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
                ? `<button class="btn-primary" style="padding:8px 18px;font-size:0.82rem" onclick="stCollect()">⚡ Collect Skill</button>`
                : `<button class="btn-secondary" style="padding:6px 14px;font-size:0.78rem;color:var(--red-light)" onclick="stCancel()">Cancel (50% refund)</button>`
            }
        </div>`;
    }

    // ── Branches ──────────────────────────────────────────────────────────────
    if (!tree.branches || !Object.keys(tree.branches).length) {
        html += `<p style="color:rgba(255,255,255,0.4);padding:20px;text-align:center">No branches found for ${charClass}.</p>`;
    } else {
        for (const [branchId, branch] of Object.entries(tree.branches)) {
            html += renderBranch(branchId, branch, accent, activeTraining, charClass);
        }
    }

    html += `</div>`;
    root.innerHTML = html;
}

// ── Branch renderer ───────────────────────────────────────────────────────────
function renderBranch(branchId, branch, accent, activeTraining, charClass) {
    const learnedCount = Object.values(branch.skills).filter(s => s.learned).length;
    const total        = Object.keys(branch.skills).length;

    // Branch header colour
    const branchColors = {
        berserker:'#e74c3c', iron_guard:'#5dade2', battle_commander:'#f39c12',
        gladiator:'#f1c40f', arcane_foundation:'#9b59b6', pyromancer:'#e74c3c',
        cryomancer:'#5dade2', stormcaller:'#f1c40f', light_path:'#ffeaa7',
        shadow_path:'#6c5ce7', assassin:'#e74c3c', trickster:'#00b894',
        shadowblade:'#636e72', dual_wielder:'#fd79a8', protector:'#74b9ff',
        divine_warrior:'#fdcb6e', inquisitor:'#a29bfe', crusader:'#e17055',
    };
    const bc = branchColors[branchId] || accent;

    let html = `
    <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:8px;
                    border-bottom:1px solid ${bc}33">
            <span style="font-size:1.4rem">${branch.emoji || '⚔️'}</span>
            <div style="flex:1">
                <div style="font-family:'Cinzel',serif;font-size:0.9rem;font-weight:700;color:${bc}">
                    ${branch.name}
                    ${activeTraining ? '' : `<button class="btn-respec-branch" onclick="stRespecBranch('${branchId}')" style="font-size:0.6rem;padding:2px 8px;margin-left:8px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);border-radius:4px;color:#e74c3c;cursor:pointer">⟳ Reset Branch</button>`}
                    ${branch.exclusive_with
                        ? `<span style="font-size:0.6rem;padding:2px 6px;background:${bc}22;border-radius:4px;color:${bc};margin-left:6px;font-family:sans-serif">EXCLUSIVE</span>`
                        : ''}
                    ${branch.hidden
                        ? `<span style="font-size:0.6rem;padding:2px 6px;background:rgba(255,255,255,0.06);border-radius:4px;color:rgba(255,255,255,0.4);margin-left:6px;font-family:sans-serif">SECRET</span>`
                        : ''}
                </div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">${branch.description || ''}</div>
            </div>
            <div style="font-size:0.68rem;color:${bc}">
                ${learnedCount}/${total}
            </div>
        </div>

        <div style="display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding-bottom:4px">
    `;

    // Render skills in tier order
    const sorted = Object.values(branch.skills).sort((a, b) => (a.tier || 0) - (b.tier || 0));
    for (let i = 0; i < sorted.length; i++) {
        const sk = sorted[i];
        if (i > 0) html += renderConnector(sorted[i-1], sk);
        html += renderSkillCard(sk, bc, activeTraining, branchId, charClass);
    }

    html += `</div></div>`;
    return html;
}

// ── Skill card ────────────────────────────────────────────────────────────────
// ── Skill card ────────────────────────────────────────────────────────────────
function renderSkillCard(sk, branchColor, activeTraining, branchId, charClass) {
    const learned = sk.learned;
    const trainable = sk.trainable;
    const locked = sk.locked;
    const training = activeTraining?.skill_id === sk.id;
    const progress = sk.progress || 0;
    const hasArcaneReservoir = character?.premium_features?.arcane_reservoir;
    const maxHours = hasArcaneReservoir ? 12 : 8;
    
    let borderColor, bgColor, labelColor;
    if (learned) {
        borderColor = branchColor;
        bgColor = `${branchColor}18`;
        labelColor = branchColor;
    } else if (training) {
        borderColor = '#f1c40f';
        bgColor = 'rgba(241,196,15,0.08)';
        labelColor = '#f1c40f';
    } else if (trainable) {
        borderColor = `${branchColor}88`;
        bgColor = `${branchColor}08`;
        labelColor = 'rgba(255,255,255,0.75)';
    } else {
        borderColor = 'rgba(255,255,255,0.06)';
        bgColor = 'rgba(255,255,255,0.02)';
        labelColor = 'rgba(255,255,255,0.2)';
    }

    // For locked/unseen skills, show mystery text
    const displayName = locked && !learned ? '???' : sk.name;
    const displayDesc = locked && !learned ? 'Unknown skill. Train previous skills to discover.' : sk.desc;
    const displayEmoji = locked && !learned ? '❓' : (sk.emoji || '⚔️');

    // Effect summary - hide for locked skills
    const effectSummary = (!locked || learned) ? stEffectSummary(sk.effects || []) : '';

    // Progress bar for skills in training or with partial progress
    let progressHtml = '';
    if (training && activeTraining) {
        const trainProgress = activeTraining.progress || 0;
        progressHtml = `
            <div style="margin-top: 8px;">
                <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 4px; overflow: hidden;">
                    <div style="width: ${trainProgress}%; height: 100%; background: ${branchColor}; border-radius: 4px; transition: width 0.3s;"></div>
                </div>
                <div style="font-size: 0.6rem; color: rgba(255,255,255,0.4); margin-top: 2px; text-align: center;">
                    ${Math.floor(trainProgress)}% complete
                </div>
                <div style="font-size: 0.55rem; color: #f1c40f; text-align: center; margin-top: 2px;">
                    ⏳ ${stFormatTime(activeTraining.timeLeft)} remaining
                </div>
            </div>
        `;
    } else if (progress > 0 && progress < 100 && !learned) {
        progressHtml = `
            <div style="margin-top: 8px;">
                <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 4px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: ${branchColor}; border-radius: 4px;"></div>
                </div>
                <div style="font-size: 0.6rem; color: rgba(255,255,255,0.4); margin-top: 2px; text-align: center;">
                    ${Math.floor(progress)}% trained
                </div>
            </div>
        `;
    }
    
    // Next threshold material cost
    let thresholdHtml = '';
    if (trainable && sk.nextThresholdCost && Object.keys(sk.nextThresholdCost).length > 0) {
        const matStrs = Object.entries(sk.nextThresholdCost).map(([k, v]) => `${v}× ${k.replace(/_/g, ' ')}`);
        thresholdHtml = `<div style="font-size: 0.6rem; color: #f39c12; margin-top: 4px; text-align: center;">🔓 Next: ${matStrs.join(', ')}</div>`;
    }

    // Cost display
    let costHtml = '';
    if (!learned && !training && trainable) {
        costHtml = `<div style="font-size:0.62rem;color:rgba(255,255,255,0.3);margin-top:3px">
            💰 ${(sk.goldCost || 0).toLocaleString()}`;
        const mats = sk.materials || {};
        const matStrs = Object.entries(mats).filter(([, v]) => v).map(([k, v]) => `${v}× ${k.replace(/_/g, ' ')}`);
        if (matStrs.length) costHtml += ` · ${matStrs.join(', ')}`;
        costHtml += `</div>`;
    } else if (locked) {
        costHtml = `<div style="font-size:0.62rem;color:rgba(255,255,255,0.15);margin-top:3px">???</div>`;
    }

    // Training options (hours selector + buttons)
    let trainOptionsHtml = '';
    if (trainable && !training && !learned) {
        const hoursOptions = [];
        for (let h = 1; h <= maxHours; h++) {
            hoursOptions.push(`<option value="${h}">${h}h</option>`);
        }
        trainOptionsHtml = `
            <div style="display: flex; gap: 4px; margin-top: 8px;">
                <select id="train-hours-${sk.id}" style="background: rgba(0,0,0,0.6); border: 1px solid ${branchColor}66; border-radius: 4px; padding: 4px; color: white; font-size: 0.65rem; width: 55px;">
                    ${hoursOptions.join('')}
                </select>
                <button onclick="stStartTrain('${sk.id}','${branchId}', false)" 
                    style="flex:1; padding: 5px 6px; border-radius: 4px; border: 1px solid ${branchColor}66;
                           background: ${branchColor}18; color: ${branchColor}; font-size: 0.65rem; font-weight: 600;
                           cursor: pointer; transition: all 0.15s;"
                    onmouseenter="this.style.background='${branchColor}33'"
                    onmouseleave="this.style.background='${branchColor}18'">
                    Train
                </button>
                <button onclick="stStartTrain('${sk.id}','${branchId}', true)" 
                    style="padding: 5px 6px; border-radius: 4px; border: 1px solid #f1c40f66;
                           background: rgba(241,196,15,0.15); color: #f1c40f; font-size: 0.65rem; font-weight: 600;
                           cursor: pointer; transition: all 0.15s;"
                    onmouseenter="this.style.background='rgba(241,196,15,0.3)'"
                    onmouseleave="this.style.background='rgba(241,196,15,0.15)'"
                    title="2x speed (costs 500 gold per hour)">
                    2x
                </button>
            </div>
        `;
    }

    // Button for learned or training state
    let btnHtml = '';
    if (learned) {
        btnHtml = `<div style="text-align:center;font-size:0.62rem;font-weight:700;color:${branchColor};margin-top:8px;letter-spacing:0.06em">✓ LEARNED</div>`;
    } else if (training) {
        btnHtml = `<button onclick="stCancelTraining()"
            style="width:100%;margin-top:8px;padding:5px 8px;border-radius:6px;border:1px solid #e74c3c66;
                   background:rgba(231,76,60,0.15);color:#e74c3c;font-size:0.68rem;font-weight:700;
                   cursor:pointer;transition:all 0.15s"
            onmouseenter="this.style.background='rgba(231,76,60,0.3)'"
            onmouseleave="this.style.background='rgba(231,76,60,0.15)'">
            Cancel Training
        </button>`;
    } else if (trainable) {
        btnHtml = trainOptionsHtml;
    } else {
        btnHtml = `<div style="text-align:center;font-size:0.6rem;color:rgba(255,255,255,0.2);margin-top:8px">???</div>`;
    }

    return `
    <div style="min-width:150px;max-width:170px;flex-shrink:0;
                border:1px solid ${borderColor};border-radius:10px;
                background:${bgColor};padding:12px;position:relative">
        <div style="text-align:center;font-size:2rem;margin-bottom:6px;line-height:1">${displayEmoji}</div>
        <div style="font-size:0.74rem;font-weight:700;color:${labelColor};text-align:center;line-height:1.2;margin-bottom:5px">${displayName}</div>
        <div style="font-size:0.64rem;color:rgba(255,255,255,0.4);line-height:1.35;margin-bottom:4px">${displayDesc}</div>
        ${effectSummary ? `<div style="font-size:0.6rem;color:${branchColor};margin-top:4px;font-weight:600">${effectSummary}</div>` : ''}
        ${progressHtml}
        ${thresholdHtml}
        ${costHtml}
        ${btnHtml}
        ${!locked && sk.tier ? `<div style="position:absolute;top:6px;right:6px;font-size:0.55rem;color:rgba(255,255,255,0.2);font-weight:700">T${sk.tier}</div>` : ''}
    </div>`;
}

async function stCancelTraining() {
    if (!confirm('Cancel current training? You will receive a partial gold refund if you paid for double speed.')) return;
    try {
        const d = await api('POST', '/skills/train/cancel');
        showMsg('skill-tree-msg', d.message);
        await renderSkillTreeTab();
        character = await api('GET', '/game/character');
        renderTopBar();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

// ── Arrow connector ───────────────────────────────────────────────────────────
function renderConnector(prevSk, nextSk) {
    const bothLearned = prevSk.learned && nextSk.learned;
    const color = bothLearned ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
    return `<div style="display:flex;align-items:center;align-self:center;flex-shrink:0;color:${color};font-size:1rem;padding:0 2px">→</div>`;
}

// ── Effect summary helper ─────────────────────────────────────────────────────
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

// ── Spinner ───────────────────────────────────────────────────────────────────
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
    
    const hasArcaneReservoir = character?.premium_features?.arcane_reservoir;
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
        if (!confirm(`Train "${sk.name}" at 2x speed?\nCost: ${goldCost} gold\nTime: ${hours} hours (2x progress)\nRequires: ${costLine}`)) return;
    } else {
        if (!confirm(`Train "${sk.name}"?\nTime: ${hours} hours\nRequires: ${costLine}`)) return;
    }
    
     try {
        const d = await api('POST', '/skills/train/start', { skillId, branchId, hours, doubleSpeed });
        showMsg('skill-tree-msg', d.message);
        await renderSkillTreeTab();
        character = await api('GET', '/game/character');
        renderTopBar();
        
        // Start training overlay polling
        startTrainingPolling();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

async function updateTrainingStatus() {
    try {
        const status = await api('GET', '/skills/training/status');
        if (status.active) {
            const progress = Math.floor(status.progress);
            const remaining = formatTime(status.remainingSeconds);
            document.getElementById('training-indicator').innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; background: rgba(155,89,182,0.2); padding: 4px 10px; border-radius: 20px;">
                    <span>⚔️ Training: ${progress}%</span>
                    <div style="width: 60px; background: rgba(255,255,255,0.2); border-radius: 4px; height: 4px;">
                        <div style="width: ${progress}%; background: #9b59b6; height: 4px; border-radius: 4px;"></div>
                    </div>
                    <span style="font-size: 0.7rem;">${remaining}</span>
                    <button onclick="cancelTraining()" style="background: rgba(231,76,60,0.3); border: none; border-radius: 12px; padding: 2px 6px; font-size: 0.6rem; cursor: pointer;">✕</button>
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
    if (!confirm('Cancel current training? You will receive a partial gold refund if you paid for double speed.')) return;
    try {
        const d = await api('POST', '/skills/train/cancel');
        showMsg('skill-tree-msg', d.message);
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
    if (!confirm('Cancel training? You will receive a 50% gold refund. Materials are NOT returned.')) return;
    try {
        const d = await api('POST', '/skills/cancel');
        showMsg('skill-tree-msg', d.message);
        await renderSkillTreeTab();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

async function stRespecBranch(branchId) {
    if (!confirm(`Reset all skills in the "${branchId}" branch? This will refund 50% of gold and materials spent.`)) return;
    try {
        const d = await api('POST', '/skills/respec', { branchId });
        character = await api('GET', '/game/character');
        renderTopBar();
        renderCharacter();
        showMsg('skill-tree-msg', d.message);
        await renderSkillTreeTab();
    } catch (e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

// ── Poll training timer (updates once per minute while tab is visible) ────────
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

// ── Hook into existing showTab ────────────────────────────────────────────────
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

// ── Expose globals ────────────────────────────────────────────────────────────
window.renderSkillTreeTab = renderSkillTreeTab;
window.stStartTrain       = stStartTrain;
window.stCollect          = stCollect;
window.stCancel           = stCancel;
