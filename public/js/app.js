// ── State ─────────────────────────────────────────────────────────────────
let token = localStorage.getItem('rpg_token');
let username = localStorage.getItem('rpg_username');
let character = null;
let trainTimer = null, unreadTimer = null;
let lbData = [];
let forgeTab = 'refine', invTab = 'equipment';
let forgeData = null;
let lbSort = 'total_gold_earned';
let shopInventory = [];
let currentShopCategory = 'weapons';
let activeMissionInterval = null;
let overlayInterval = null;
let travelOverlayInterval = null;
let playerLocation = 'forest';
let playerTravelTarget = null;
let playerTravelEndTime = 0;
let playerTravelStartTime = 0;
const FREE_CANCEL_WINDOW = 300;

// ── Hit & Block Zone Definitions ──────────────────────────────────────────
const HIT_ZONES = {
    head:         { label: 'Head',         dmgMult: 1.5,  hitChance: 0.60, desc: 'High risk, high reward. Devastating if it lands.' },
    throat:       { label: 'Throat',       dmgMult: 1.3,  hitChance: 0.65, desc: 'Strong damage with decent accuracy.' },
    chest:        { label: 'Chest',        dmgMult: 1.0,  hitChance: 0.85, desc: 'Reliable and consistent. The safe default.' },
    heart:        { label: 'Heart',        dmgMult: 1.75, hitChance: 0.45, desc: 'Highest damage in the game. Very hard to land.' },
    solar_plexus: { label: 'Solar Plexus', dmgMult: 1.2,  hitChance: 0.75, desc: 'Good balance of damage and accuracy.' },
    stomach:      { label: 'Stomach',      dmgMult: 1.1,  hitChance: 0.80, desc: 'Safe and reliable with solid damage.' },
    left_arm:     { label: 'Left Arm',     dmgMult: 0.8,  hitChance: 0.90, desc: 'Low damage but very consistent. Beats most guards.' },
    right_arm:    { label: 'Right Arm',    dmgMult: 0.8,  hitChance: 0.90, desc: 'Mirror of left arm. Consistent and safe.' },
    left_leg:     { label: 'Left Leg',     dmgMult: 0.7,  hitChance: 0.92, desc: 'Nearly guaranteed to connect. Counters turtling.' },
    right_leg:    { label: 'Right Leg',    dmgMult: 0.7,  hitChance: 0.92, desc: 'Mirror of left leg. Reliable chip damage.' }
};

const BLOCK_ZONES = {
    high_guard:    { label: 'High Guard',    protects: ['head','throat'],           reduction: 0.85, desc: 'Counters head/throat attacks. Leaves legs open.' },
    cross_guard:   { label: 'Cross Guard',   protects: ['heart','chest'],           reduction: 0.85, desc: 'Protects vital centre mass. Best all-round guard.' },
    mid_guard:     { label: 'Mid Guard',     protects: ['solar_plexus','stomach'],  reduction: 0.80, desc: 'Solid mid defence. Weak to head and legs.' },
    left_guard:    { label: 'Left Guard',    protects: ['left_arm','left_leg'],     reduction: 0.75, desc: 'Covers your left side. Punishes predictable attackers.' },
    right_guard:   { label: 'Right Guard',   protects: ['right_arm','right_leg'],   reduction: 0.75, desc: 'Covers your right side. Same tradeoffs as left guard.' },
    full_turtle:   { label: 'Full Turtle',   protects: ['chest','stomach'],         reduction: 0.70, special: 'next_round_hit_penalty', desc: 'Heavy cover but slows your next attack by 15%.' },
    weave_left:    { label: 'Weave Left',    protects: ['head','left_arm'],         reduction: 0.80, special: 'attacker_miss_20', desc: 'Evasive. 20% chance the attacker misses entirely.' },
    weave_right:   { label: 'Weave Right',   protects: ['head','right_arm'],        reduction: 0.80, special: 'attacker_miss_20', desc: 'Mirror of weave left. Dodgy and unpredictable.' },
    counter_stance:{ label: 'Counter Stance',protects: ['any'],                     reduction: 0.60, special: 'counter_25', desc: '25% chance to counter for 50% damage back. Risky.' },
    no_block:      { label: 'No Block',      protects: [],                          reduction: 0.00, special: 'attacker_bonus_10', desc: 'Pure aggression. You take full hits but deal 10% more damage.' }
};

const DEFAULT_ATTACK_ZONES = ['chest','chest','solar_plexus','chest','head','solar_plexus','chest','stomach','chest','solar_plexus'];
const DEFAULT_BLOCK_ZONES  = ['cross_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','mid_guard','cross_guard','high_guard'];

// ── Zone Definitions ──────────────────────────────────────────────────────
const ZONES = {
    forest: {
        name: 'Whispering Forest', emoji: '🌲', minLevel: 1,
        mapImg: '/images/zones/forest.jpg', bgImg: '/images/zones/forest-bg.jpg',
        pos: { x: 22, y: 38 },
        description: 'A dense, ancient forest filled with wildlife and bandits.',
        spots: [
            { id: 'forest_camp', name: 'Hunting Camp', difficulty: 'easy', img: '/images/spots/hunting-camp.jpg',
                description: 'A small camp where hunters gather resources.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [{ name:'Hunt the Wolves',img:'/images/missions/wolves.jpg'},{name:'Gather Firewood',img:'/images/missions/firewood.jpg'},{name:'Collect Wild Herbs',img:'/images/missions/herbs.jpg'},{name:'Track the Deer',img:'/images/missions/deer.jpg'}]
            },
            { id: 'forest_bandits', name: 'Bandit Hideout', difficulty: 'medium', img: '/images/spots/bandit-hideout.jpg',
                description: 'A group of bandits has set up camp here.', missionDuration: 600, payoutMultiplier: 1.5,
                missions: [{name:'Clear the Bandits',img:'/images/missions/bandits.jpg'},{name:'Scout the Path',img:'/images/missions/scout.jpg'},{name:'Recover Stolen Goods',img:'/images/missions/goods.jpg'},{name:'Rescue the Captive',img:'/images/missions/rescue.jpg'}]
            },
            { id: 'forest_ruins', name: 'Old Ruins', difficulty: 'hard', img: '/images/spots/forest-ruins.jpg',
                description: 'Ancient ruins hidden deep in the forest.', missionDuration: 600, payoutMultiplier: 2.0,
                missions: [{name:'Explore the Ruins',img:'/images/missions/ruins.jpg'},{name:'Defeat the Forest Guardian',img:'/images/missions/guardian.jpg'},{name:'Find the Lost Relic',img:'/images/missions/relic.jpg'},{name:'Cleanse the Corruption',img:'/images/missions/cleanse.jpg'}]
            }
        ],
        payoutBase: { easy:[20,50], medium:[50,120], hard:[120,250] },
        xpBase: { easy:[1,5], medium:[5,10], hard:[10,15] }
    },
    swamp: {
        name: 'Rotting Swamp', emoji: '🌿', minLevel: 5,
        mapImg: '/images/zones/swamp.jpg', bgImg: '/images/zones/swamp-bg.jpg',
        pos: { x: 40, y: 58 },
        description: 'A murky, poisonous swamp filled with dangerous creatures.',
        spots: [
            { id: 'swamp_edge', name: 'Swamp Edge', difficulty: 'easy', img: '/images/spots/swamp-edge.jpg',
                description: 'The safer outskirts of the swamp.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [{name:'Harvest Poison Glands',img:'/images/missions/poison.jpg'},{name:'Collect Swamp Crystals',img:'/images/missions/crystals.jpg'},{name:'Gather Herbs',img:'/images/missions/herbs.jpg'},{name:'Catch Swamp Frogs',img:'/images/missions/frogs.jpg'}]
            },
            { id: 'swamp_village', name: 'Abandoned Village', difficulty: 'medium', img: '/images/spots/abandoned-village.jpg',
                description: 'A village consumed by the swamp.', missionDuration: 600, payoutMultiplier: 1.5,
                missions: [{name:'Find the Lost Merchant',img:'/images/missions/merchant.jpg'},{name:'Purge the Undead',img:'/images/missions/undead.jpg'},{name:'Rescue the Prisoner',img:'/images/missions/prisoner.jpg'},{name:'Loot the Houses',img:'/images/missions/loot.jpg'}]
            },
            { id: 'swamp_heart', name: 'Swamp Heart', difficulty: 'hard', img: '/images/spots/swamp-heart.jpg',
                description: 'The center of the swamp, where the Bog Witch dwells.', missionDuration: 600, payoutMultiplier: 2.5,
                missions: [{name:'Slay the Bog Witch',img:'/images/missions/bog-witch.jpg'},{name:'Destroy the Corrupted Heart',img:'/images/missions/heart.jpg'},{name:'Purify the Waters',img:'/images/missions/purify.jpg'},{name:'Face the Swamp Horror',img:'/images/missions/horror.jpg'}]
            }
        ],
        payoutBase: { easy:[60,130], medium:[130,280], hard:[280,500] },
        xpBase: { easy:[1,5], medium:[5,10], hard:[10,15] }
    },
    mountains: {
        name: 'Frozen Mountains', emoji: '⛰️', minLevel: 10,
        mapImg: '/images/zones/mountains.jpg', bgImg: '/images/zones/mountains-bg.jpg',
        pos: { x: 62, y: 25 },
        description: 'Snow-capped peaks with treacherous paths.',
        spots: [
            { id: 'mountain_base', name: 'Mountain Base', difficulty: 'easy', img: '/images/spots/mountain-base.jpg',
                description: 'The foothills of the mountain range.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [{name:'Mine Iron Ore',img:'/images/missions/mine.jpg'},{name:'Chart the Ice Caves',img:'/images/missions/caves.jpg'},{name:'Hunt Mountain Goats',img:'/images/missions/goats.jpg'},{name:'Collect Frost Herbs',img:'/images/missions/frost-herbs.jpg'}]
            },
            { id: 'mountain_peak', name: 'Frozen Peak', difficulty: 'medium', img: '/images/spots/frozen-peak.jpg',
                description: 'The highest peak, constantly battered by storms.', missionDuration: 600, payoutMultiplier: 1.8,
                missions: [{name:'Claim the Summit',img:'/images/missions/summit.jpg'},{name:'Recover the Artifact',img:'/images/missions/artifact.jpg'},{name:'Defeat the Mountain Troll',img:'/images/missions/troll.jpg'},{name:'Find the Frozen Temple',img:'/images/missions/temple.jpg'}]
            },
            { id: 'ice_cavern', name: 'Ice Cavern', difficulty: 'hard', img: '/images/spots/ice-cavern.jpg',
                description: 'Deep caves filled with ice and mystery.', missionDuration: 600, payoutMultiplier: 2.5,
                missions: [{name:'Slay the Ice Drake',img:'/images/missions/drake.jpg'},{name:'Mine the Mithril Vein',img:'/images/missions/mithril.jpg'},{name:'Awaken the Frozen Giant',img:'/images/missions/giant.jpg'},{name:'Retrieve the Frost Core',img:'/images/missions/frost-core.jpg'}]
            }
        ],
        payoutBase: { easy:[150,300], medium:[300,600], hard:[600,1100] },
        xpBase: { easy:[1,5], medium:[5,10], hard:[10,15] }
    },
    ruins: {
        name: 'Ancient Ruins', emoji: '🏚️', minLevel: 20,
        mapImg: '/images/zones/ruins.jpg', bgImg: '/images/zones/ruins-bg.jpg',
        pos: { x: 75, y: 52 },
        description: 'Remains of an ancient civilization, now haunted.',
        spots: [
            { id: 'ruins_perimeter', name: 'Ruins Perimeter', difficulty: 'easy', img: '/images/spots/ruins-perimeter.jpg',
                description: 'The outer walls of the ancient city.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [{name:'Decode the Rune Stones',img:'/images/missions/runes.jpg'},{name:'Clear the Vines',img:'/images/missions/vines.jpg'},{name:'Scout the Entrance',img:'/images/missions/entrance.jpg'},{name:'Collect Ancient Debris',img:'/images/missions/debris.jpg'}]
            },
            { id: 'ruins_temple', name: 'Sunken Temple', difficulty: 'medium', img: '/images/spots/sunken-temple.jpg',
                description: 'A temple half-buried in the ground.', missionDuration: 600, payoutMultiplier: 1.8,
                missions: [{name:'Destroy the Corrupted Altar',img:'/images/missions/altar.jpg'},{name:'Find the Lost Grimoire',img:'/images/missions/grimoire.jpg'},{name:'Capture the Shadow Elemental',img:'/images/missions/elemental.jpg'},{name:'Purify the Holy Ground',img:'/images/missions/holy.jpg'}]
            },
            { id: 'ruins_crypt', name: 'Ancient Crypt', difficulty: 'hard', img: '/images/spots/ancient-crypt.jpg',
                description: 'Burial place of ancient kings, now filled with undead.', missionDuration: 600, payoutMultiplier: 2.8,
                missions: [{name:'Banish the Wraith Lord',img:'/images/missions/wraith.jpg'},{name:'Loot the Sealed Vault',img:'/images/missions/vault.jpg'},{name:'Break the Undead Curse',img:'/images/missions/curse.jpg'},{name:"Claim the King's Crown",img:'/images/missions/crown.jpg'}]
            }
        ],
        payoutBase: { easy:[400,750], medium:[750,1400], hard:[1400,2500] },
        xpBase: { easy:[1,5], medium:[5,10], hard:[10,15] }
    },
    dark_city: {
        name: 'Dark City', emoji: '🏙️', minLevel: 35,
        mapImg: '/images/zones/dark-city.jpg', bgImg: '/images/zones/dark-city-bg.jpg',
        pos: { x: 55, y: 72 },
        description: 'A corrupted city ruled by dark forces.',
        spots: [
            { id: 'city_outskirts', name: 'City Outskirts', difficulty: 'easy', img: '/images/spots/city-outskirts.jpg',
                description: 'The ruined outer districts of the city.', missionDuration: 600, payoutMultiplier: 1.0,
                missions: [{name:'Assassinate the Crime Lord',img:'/images/missions/crime-lord.jpg'},{name:'Infiltrate the Shadow Guild',img:'/images/missions/guild.jpg'},{name:'Sabotage the Dark Portal',img:'/images/missions/portal.jpg'},{name:'Free the Slaves',img:'/images/missions/slaves.jpg'}]
            },
            { id: 'city_cathedral', name: 'Dark Cathedral', difficulty: 'medium', img: '/images/spots/dark-cathedral.jpg',
                description: 'A cathedral twisted by dark magic.', missionDuration: 1800, payoutMultiplier: 2.0,
                missions: [{name:'Destroy the Ritual Site',img:'/images/missions/ritual.jpg'},{name:'Hunt the Demon Enforcer',img:'/images/missions/demon.jpg'},{name:'Claim the Black Market',img:'/images/missions/black-market.jpg'},{name:'Steal the Dark Codex',img:'/images/missions/codex.jpg'}]
            },
            { id: 'city_palace', name: 'Shadow Palace', difficulty: 'hard', img: '/images/spots/shadow-palace.jpg',
                description: "Seat of power for the city's dark lord.", missionDuration: 600, payoutMultiplier: 3.0,
                missions: [{name:'Confront the Shadow Lord',img:'/images/missions/shadow-lord.jpg'},{name:'Seal the Void Rift',img:'/images/missions/rift.jpg'},{name:'Claim the Demon Crown',img:'/images/missions/demon-crown.jpg'},{name:'Purge the City Forever',img:'/images/missions/purge.jpg'}]
            }
        ],
        payoutBase: { easy:[1200,2200], medium:[2200,4000], hard:[4000,7500] },
        xpBase: { easy:[1,5], medium:[5,10], hard:[10,15] }
    }
};

const ZONE_ROUTES = {
    forest:    { swamp:60, mountains:90 },
    swamp:     { forest:60, mountains:90, ruins:120, dark_city:90 },
    mountains: { forest:90, swamp:90, ruins:120 },
    ruins:     { swamp:120, mountains:120, dark_city:60 },
    dark_city: { swamp:90, ruins:60 }
};

function getShortestPath(from, to) {
    if (from === to) return { path:[from], time:0 };
    const dist={}, prev={}, unvisited=new Set(Object.keys(ZONES));
    for (const z of unvisited) dist[z]=Infinity;
    dist[from]=0;
    while (unvisited.size) {
        let u=null;
        for (const z of unvisited) { if (u===null||dist[z]<dist[u]) u=z; }
        if (u===to||dist[u]===Infinity) break;
        unvisited.delete(u);
        for (const [nb,t] of Object.entries(ZONE_ROUTES[u]||{})) { const alt=dist[u]+t; if (alt<dist[nb]) { dist[nb]=alt; prev[nb]=u; } }
    }
    const path=[]; let cur=to;
    while (cur) { path.unshift(cur); cur=prev[cur]; }
    if (path[0]!==from) return null;
    return { path, time:dist[to] };
}

// ── API ───────────────────────────────────────────────────────────────────
async function api(method, path, body=null) {
    const fullUrl=`/api${path}`;
    const opts={ method, headers:{'Content-Type':'application/json'} };
    const storedToken=localStorage.getItem('rpg_token');
    if (storedToken) opts.headers['Authorization']=`Bearer ${storedToken}`;
    if (body) opts.body=JSON.stringify(body);
    console.log(`[API] ${method} ${fullUrl}`, body?body:'');
    try {
        const res=await fetch(fullUrl,opts);
        console.log(`[API] ${method} ${fullUrl} → ${res.status}`);
        const text=await res.text();
        if (!res.ok) {
            console.error('[API ERROR]',res.status,text.substring(0,300));
            let errMsg;
            try { const ed=JSON.parse(text); errMsg=ed.error||`HTTP ${res.status}`; } catch { errMsg=text.trim()||`Request failed (${res.status})`; }
            throw new Error(errMsg);
        }
        if (!text.trim()) { console.warn('[API] Empty response body'); return {}; }
        try { const data=JSON.parse(text); console.log('[API] Response parsed:',data); return data; }
        catch (pe) { console.error('[API] JSON parse failed:',pe,'Raw:',text.substring(0,200)); throw new Error('Invalid response from server'); }
    } catch (err) { console.error('[API FAIL]',method,fullUrl,err); throw err; }
}

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    initMissionTimer();
    if (token) {
        try { character=await api('GET','/game/character'); showScreen('game'); }
        catch (e) {
            if (e.message==='No character found') showScreen('create');
            else { token=null; localStorage.removeItem('rpg_token'); showScreen('auth'); }
        }
    } else showScreen('auth');
});

// ── Auth ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',i===(tab==='login'?0:1)));
    document.getElementById('tab-login').classList.toggle('active',tab==='login');
    document.getElementById('tab-register').classList.toggle('active',tab==='register');
    setError('auth-error','');
}
async function login() {
    try {
        const data=await api('POST','/auth/login',{username:document.getElementById('login-user').value.trim(),password:document.getElementById('login-pass').value});
        token=data.token; username=data.username;
        localStorage.setItem('rpg_token',token); localStorage.setItem('rpg_username',username);
        try { character=await api('GET','/game/character'); showScreen('game'); } catch { showScreen('create'); }
    } catch(e) { setError('auth-error',e.message); }
}
async function register() {
    try {
        const data=await api('POST','/auth/register',{username:document.getElementById('reg-user').value.trim(),password:document.getElementById('reg-pass').value});
        token=data.token; username=data.username;
        localStorage.setItem('rpg_token',token); localStorage.setItem('rpg_username',username);
        showScreen('create');
    } catch(e) { setError('auth-error',e.message); }
}
document.addEventListener('DOMContentLoaded',()=>{
    const pairs=[['login-user','login-pass'],['reg-user','reg-pass']];
    pairs.forEach(([u,p])=>{
        const uel=document.getElementById(u), pel=document.getElementById(p);
        const fn=u.startsWith('login')?login:register;
        if(uel) uel.addEventListener('keypress',e=>{if(e.key==='Enter'){e.preventDefault();fn();}});
        if(pel) pel.addEventListener('keypress',e=>{if(e.key==='Enter'){e.preventDefault();fn();}});
    });
});
function logout() {
    token=null; username=null; character=null;
    localStorage.removeItem('rpg_token'); localStorage.removeItem('rpg_username');
    [trainTimer,unreadTimer].forEach(t=>clearInterval(t));
    showScreen('auth');
}

// ── Character Creation ────────────────────────────────────────────────────
let selectedClass=null;
function selectClass(el) { document.querySelectorAll('.class-card').forEach(c=>c.classList.remove('selected')); el.classList.add('selected'); selectedClass=el.dataset.class; }
async function createCharacter() {
    const name=document.getElementById('char-name').value.trim();
    if (!name) return setError('create-error','Enter a name');
    if (!selectedClass) return setError('create-error','Choose a class');
    try {
        await api('POST','/game/character',{name,class:selectedClass});
        localStorage.removeItem('rpg_token'); localStorage.removeItem('rpg_username');
        alert('Character created! Please log in again.');
        showScreen('auth');
    } catch(e) { setError('create-error',e.message); }
}

// ── Screens & Tabs ────────────────────────────────────────────────────────
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
    if (name==='game') { renderTopBar(); renderCharacter(); startPolling(); showTab('character'); }
}
const TAB_ORDER=['character','loadout','skills','train','upgrade','missions','forge','inventory','shop','leaderboard','inbox'];
function showTab(name) {
    document.querySelectorAll('.game-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(`tab-${name}`)?.classList.add('active');
    const idx=TAB_ORDER.indexOf(name);
    if (idx>=0) document.querySelectorAll('.nav-btn')[idx]?.classList.add('active');
    if (name==='character')   renderCharacter();
    if (name==='loadout')     renderLoadout();
    if (name==='train')       renderTraining();
    if (name==='upgrade')     renderUpgrade();
    if (name==='skills')      renderSkills();
    if (name==='missions')    loadMissions();
    if (name==='forge')       loadForge();
    if (name==='inventory')   { syncInvTabButtons(); loadInventory(); }
    if (name==='leaderboard') loadLeaderboard();
    if (name==='shop')        loadShop();
    if (name==='inbox')       loadInbox();
}

// ── Top Bar ───────────────────────────────────────────────────────────────
function renderTopBar() {
    if (!character) return;
    const c=character;
    const hpCur=c.hp_current??c.hp_max;
    const hpPct=Math.min(100,Math.round((hpCur/c.hp_max)*100));
    const lxp=c.level*25;
    const xpPct=Math.min(100,Math.round((c.xp/lxp)*100));
    const hpColor=hpPct>60?'#2ecc71':hpPct>30?'#f39c12':'#e74c3c';
    const set=(id,fn)=>{ const el=document.getElementById(id); if(el) fn(el); };
    set('topbar-avatar',el=>{ el.src=`/images/class/${c.class}.png`; el.alt=c.class; el.onerror=function(){this.style.display='none';}; });
    set('topbar-hp-fill',el=>{ el.style.width=hpPct+'%'; el.style.background=hpColor; });
    set('topbar-hp-text',el=>{ el.textContent=`${hpCur} / ${c.hp_max}`; });
    set('topbar-xp-fill',el=>{ el.style.width=xpPct+'%'; });
    set('topbar-xp-text',el=>{ el.textContent=`${c.xp} / ${lxp} XP`; });
    const mp=c.mission_points??0, mpMax=c.mp_max||240;
    const mpPct=Math.min(100,Math.round((mp/mpMax)*100));
    const dms=c.daily_mp_spent??0, unl=c.skills_unlocked;
    set('topbar-mp-fill',el=>{ el.style.width=mpPct+'%'; });
    set('topbar-mp-text',el=>{
        el.textContent=`${mp} / ${mpMax} MP`;
        el.title=unl?'Skills unlocked today!':`Spend ${60-dms} more MP on missions to unlock skills today`;
    });
    set('topbar-mp',el=>{
        if(!el) return;
        el.textContent=unl?`🔮 ${mp} ✨`:`🔮 ${mp} (${dms}/60)`;
        el.title=unl?'Skills unlocked today!':`Spend ${60-dms} more MP on missions to unlock skills`;
    });
    set('topbar-gold',el=>{ el.textContent=`💰 ${c.gold.toLocaleString()}`; });
    set('topbar-gems',el=>{ el.textContent=`💎 ${(c.gems||0).toLocaleString()}`; });
    set('topbar-level',el=>{ el.textContent=`Lv.${c.level}`; });
    set('topbar-name',el=>{ el.textContent=c.name; });
    const evEl=document.getElementById('topbar-event');
    if (evEl) {
        const ev=c.active_event;
        if (ev) { evEl.textContent=ev.name||''; evEl.classList.remove('hidden'); }
        else evEl.classList.add('hidden');
    }
}

// ── Polling ───────────────────────────────────────────────────────────────
function startPolling() {
    [trainTimer,unreadTimer].forEach(t=>clearInterval(t));
    trainTimer=setInterval(async()=>{
        try {
            character=await api('GET','/game/character');
            renderTopBar();
            if (document.getElementById('tab-character')?.classList.contains('active')) renderCharacter();
            if (document.getElementById('tab-train')?.classList.contains('active'))     renderTraining();
            if (document.getElementById('tab-upgrade')?.classList.contains('active'))   renderUpgrade();
            if (document.getElementById('tab-missions')?.classList.contains('active')) {
                await checkTravelStatus();
                renderWorldMap();
                await checkAndShowMissionOverlay();
            }
        } catch {}
    },5000);
    unreadTimer=setInterval(pollUnread,15000);
    pollUnread();
}
async function pollUnread() {
    try {
        const d=await api('GET','/game/messages/unread-count');
        const b=document.getElementById('unread-badge');
        if (d.count>0){b.textContent=d.count;b.classList.remove('hidden');}else b.classList.add('hidden');
    } catch {}
}

// ── Character Sheet ───────────────────────────────────────────────────────
function renderCharacter() {
    if (!character) return;
    const c=character;
    const eq=c.equipped||{};
    const lxp=c.level*100;
    const xpPct=Math.min(100,(c.xp/lxp)*100);
    const hpCur=c.hp_current??c.hp_max;
    const hpPct=Math.min(100,(hpCur/c.hp_max)*100);
    const hpColor=hpPct>60?'#2ecc71':hpPct>30?'#f39c12':'#e74c3c';
    const maxStat=Math.max(c.strength,c.defense,c.agility,c.magic,c.vitality||10,c.hit_chance||0,c.crit_chance||0,30);

    // Equipment slot tiles
    const eqSlots=[
        {slot:'weapon',  icon:'⚔️', label:'Weapon'},
        {slot:'armor',   icon:'🛡️', label:'Armor'},
        {slot:'accessory',icon:'💍',label:'Accessory'},
        {slot:'amulet',  icon:'📿', label:'Amulet'},
        {slot:'ring',    icon:'💍', label:'Ring'},
        {slot:'boots',   icon:'👢', label:'Boots'},
    ];
    const eqGrid=eqSlots.map(({slot,icon,label},idx)=>{
        const avatarDiv = idx === 3 ? `
            <div class="eq-avatar-center">
                <img src="/images/class/${c.class}.png" alt="${c.class}" onerror="this.style.opacity='0'">
            </div>` : '';
        const item=eq[slot];
        if (!item) return avatarDiv + `
            <div class="eq-slot empty">
                <span class="eq-slot-icon">${icon}</span>
                <span class="eq-slot-label">${label}</span>
            </div>`;
        const qc=item.quality==='legendary'?'#f1c40f':item.quality==='rare'?'#9b59b6':'rgba(255,255,255,0.5)';
        const imgSrc=item.img||(item.name?`/images/assets/${item.name.toLowerCase().replace(/\s+/g,'-')}.png`:null);
        return avatarDiv + `
            <div class="eq-slot filled" style="border-color:${qc}44"
                onmouseenter="showEqTooltip(event,${JSON.stringify(JSON.stringify(item))})"
                onmouseleave="scheduleHideTooltip()">
                <span class="eq-slot-icon">${itemIcon(item,'56px')}</span>
                <span class="eq-slot-label" style="color:${qc}">${item.name}</span>
                ${item.quality&&item.quality!=='common'?`<span style="position:absolute;top:3px;right:4px;font-size:0.44rem;color:${qc};text-transform:uppercase">${item.quality}</span>`:''}
            </div>`;
    }).join('');

    const charSheet=document.getElementById('char-sheet');
    if (!charSheet) return;
    charSheet.innerHTML=`
    <div class="char-panel full char-hero-panel">
      <div class="char-hero-bg" style="background-image:url('/images/class/${c.class}-bg.jpg')"></div>
      <div class="char-hero-content">
        <div class="char-hero-left">
          <div class="char-avatar-ring">
            <img src="/images/class/${c.class}.png" alt="${c.class}" class="char-avatar-img" onerror="this.style.display='none'">
          </div>
          <div class="char-hero-badge">${capitalize(c.class)}</div>
        </div>
        <div class="char-hero-right">
          <div class="char-hero-name">${c.name}</div>
          <div class="char-hero-sub">Level ${c.level} · <span style="color:var(--gold)">💰 ${c.gold.toLocaleString()}</span> · <span style="color:var(--purple)">💎 ${(c.gems||0).toLocaleString()}</span></div>
          <div class="char-hp-row">
            <span class="char-hp-label">HP</span>
            <div class="char-hp-track"><div class="char-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
            <span class="char-hp-text" style="color:${hpColor}">${hpCur} / ${c.hp_max}</span>
          </div>
          <div class="char-xp-row">
            <span class="char-hp-label">XP</span>
            <div class="char-hp-track"><div class="char-hp-fill" style="width:${xpPct}%;background:#3498db"></div></div>
            <span class="char-hp-text">${c.xp} / ${lxp}</span>
          </div>
          <div class="char-hp-row">
            <span class="char-hp-label" style="color:#9b59b6">MP</span>
            <div class="char-hp-track"><div class="char-hp-fill" style="width:${Math.round((c.mission_points||0)/240*100)}%;background:#9b59b6"></div></div>
            <span class="char-hp-text" style="color:#9b59b6">${c.mission_points||0} / 240</span>
          </div>
        </div>
      </div>
    </div>
    <div class="char-panel">
      <h3>STATS</h3>
      ${statRow('💪','Strength',c.strength,maxStat,'str')}
      ${statRow('🛡️','Defense',c.defense,maxStat,'def')}
      ${statRow('⚡','Agility',c.agility,maxStat,'agi')}
      ${statRow('✨','Magic',c.magic,maxStat,'mag')}
      ${statRow('❤️','Vitality',c.vitality||10,maxStat,'vit')}
      ${(c.hit_chance||0)>0?statRow('🎯','Hit Chance',c.hit_chance,maxStat,'hit'):''}
      ${(c.crit_chance||0)>0?statRow('💥','Crit Chance',c.crit_chance,maxStat,'crit'):''}
      <div style="margin-top:13px;font-size:0.74rem;color:var(--text-dim);border-top:1px solid var(--border);padding-top:11px">
        DMG: <strong style="color:var(--text-bright)">${Math.floor(c.strength/4)}${eq.weapon?` +${eq.weapon.stats?.dmg_min||0}–${eq.weapon.stats?.dmg_max||0}`:''}</strong>
        ${eq.weapon?.stats?.elem_dmg_type?`&nbsp; ${elemEmoji(eq.weapon.stats.elem_dmg_type)} <strong>${eq.weapon.stats.elem_dmg}</strong>`:''}
        ${hpCur<c.hp_max?'<span style="float:right;color:rgba(255,255,255,0.3)">⏳ +10% HP/hr</span>':''}
      </div>
    </div>
    <div class="char-panel">
      <h3>EQUIPMENT</h3>
      <div class="eq-grid">${eqGrid}</div>
    </div>
    <div class="char-panel">
      <h3>RECORD</h3>
      <div class="record-row">
        <div class="record-item"><div class="record-num wins">${c.wins}</div><div class="record-lbl">WINS</div></div>
        <div class="record-item"><div class="record-num">${c.wins+c.losses}</div><div class="record-lbl">BATTLES</div></div>
        <div class="record-item"><div class="record-num losses">${c.losses}</div><div class="record-lbl">LOSSES</div></div>
      </div>
      ${c.wins+c.losses>0?`<div style="margin-top:14px;background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 14px;font-size:0.78rem;color:var(--text-dim)">Win rate <strong style="color:var(--green);float:right">${Math.round(c.wins/(c.wins+c.losses)*100)}%</strong></div>`:''}
      ${c.trainingActive?`<div style="margin-top:12px;font-size:0.8rem;color:var(--gold)">⏳ Training ${c.training_stat}... ${c.trainingSecondsLeft}s</div>`:''}
      ${c.trainingDone?`<div style="margin-top:12px;font-size:0.8rem;color:var(--green)">✅ Training done! Collect it.</div>`:''}
    </div>`;
    renderTopBar();
}
function statRow(icon,label,val,max,cls) {
    return `<div class="stat-row"><span class="stat-icon">${icon}</span><span class="stat-label">${label}</span>
    <div class="stat-bar-wrap"><div class="stat-bar"><div class="stat-fill ${cls}-fill" style="width:${Math.round(val/Math.max(max,1)*100)}%"></div></div></div>
    <span class="stat-val">${val}</span></div>`;
}
function elemEmoji(t) { return {pyro:'🔥',water:'💧',wind:'🌀',electro:'⚡'}[t]||''; }

// ── Loadout Editor ────────────────────────────────────────────────────────
function renderLoadout() {
    if (!character) return;
    const attackZones=JSON.parse(character.attack_zones||'null')||DEFAULT_ATTACK_ZONES;
    const blockZones=JSON.parse(character.block_zones||'null')||DEFAULT_BLOCK_ZONES;
    const el=document.getElementById('loadout-content');
    if (!el) return;
    el.innerHTML=`
        <div style="margin-bottom:16px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;font-size:0.8rem;color:rgba(255,255,255,0.5)">
            ⚔️ Set your attack and block zone for each of the 10 combat rounds. Your opponent cannot see your choices.
        </div>
        <div style="display:grid;grid-template-columns:32px 1fr 1fr;gap:8px;align-items:center;margin-bottom:8px;font-size:0.7rem;color:rgba(255,255,255,0.4);letter-spacing:0.08em;text-transform:uppercase;padding:0 4px">
            <span></span><span>Attack Zone</span><span>Block Zone</span>
        </div>
        ${Array.from({length:10},(_,i)=>`
        <div style="display:grid;grid-template-columns:32px 1fr 1fr;gap:8px;align-items:start;margin-bottom:8px">
            <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:600;color:rgba(255,255,255,0.5);margin-top:8px">${i+1}</div>
            <div class="zone-select-wrap">
                <select id="atk-${i}" class="zone-select" onchange="onZoneSelectChange(this,'attack')">
                    ${Object.entries(HIT_ZONES).map(([k,v])=>`<option value="${k}" ${attackZones[i]===k?'selected':''}>${v.label}</option>`).join('')}
                </select>
                <div class="zone-tooltip" id="atk-tip-${i}">${HIT_ZONES[attackZones[i]]?.desc||''}</div>
            </div>
            <div class="zone-select-wrap">
                <select id="blk-${i}" class="zone-select" onchange="onZoneSelectChange(this,'block')">
                    ${Object.entries(BLOCK_ZONES).map(([k,v])=>`<option value="${k}" ${blockZones[i]===k?'selected':''}>${v.label}</option>`).join('')}
                </select>
                <div class="zone-tooltip" id="blk-tip-${i}">${BLOCK_ZONES[blockZones[i]]?.desc||''}</div>
            </div>
        </div>`).join('')}
        <button class="btn-primary" style="width:100%;margin-top:12px" onclick="saveLoadout()">Save Loadout</button>
        <div id="loadout-msg" class="msg-bar hidden"></div>
    `;
}
function onZoneSelectChange(sel, type) {
    const idx=sel.id.split('-')[1];
    const zoneData=type==='attack'?HIT_ZONES[sel.value]:BLOCK_ZONES[sel.value];
    const tip=document.getElementById(`${type==='attack'?'atk':'blk'}-tip-${idx}`);
    if (tip&&zoneData) tip.textContent=zoneData.desc;
}
async function saveLoadout() {
    const attackZones=Array.from({length:10},(_,i)=>document.getElementById(`atk-${i}`)?.value||'chest');
    const blockZones=Array.from({length:10},(_,i)=>document.getElementById(`blk-${i}`)?.value||'cross_guard');
    try {
        await api('POST','/game/loadout',{attackZones,blockZones});
        character.attack_zones=JSON.stringify(attackZones);
        character.block_zones=JSON.stringify(blockZones);
        showMsg('loadout-msg','Loadout saved!');
    } catch(e) { showMsg('loadout-msg',e.message,true); }
}

// ── Training ──────────────────────────────────────────────────────────────
function renderTraining() {
    if (!character) return;
    const c=character,statusEl=document.getElementById('train-status');
    const allBtns=document.querySelectorAll('.btn-train'),oldBtn=document.getElementById('collect-btn');
    if (c.trainingDone) {
        statusEl.className='train-status-bar ready'; statusEl.textContent=`✅ ${capitalize(c.training_stat)} training complete!`; statusEl.classList.remove('hidden');
        allBtns.forEach(b=>b.disabled=true);
        if (!oldBtn) { const btn=document.createElement('button'); btn.id='collect-btn'; btn.className='btn-primary'; btn.style.cssText='grid-column:1/-1;margin-top:8px'; btn.textContent=`⚡ Collect +1 ${capitalize(c.training_stat)}`; btn.onclick=collectTraining; document.getElementById('train-grid').after(btn); }
    } else if (c.trainingActive) {
        statusEl.className='train-status-bar'; statusEl.textContent=`⏳ Training ${capitalize(c.training_stat)}... ${c.trainingSecondsLeft}s`; statusEl.classList.remove('hidden');
        allBtns.forEach(b=>b.disabled=true); if(oldBtn)oldBtn.remove();
    } else { statusEl.classList.add('hidden'); allBtns.forEach(b=>b.disabled=false); if(oldBtn)oldBtn.remove(); }
}
async function startTrain(stat) {
    try { await api('POST','/game/train',{stat}); character=await api('GET','/game/character'); renderTraining(); showMsg('train-msg',`Training ${stat}!`); }
    catch(e) { showMsg('train-msg',e.message,true); }
}
async function collectTraining() {
    try { const d=await api('POST','/game/train/collect'); character=d.character; renderTraining(); renderCharacter(); showMsg('train-msg',d.message); }
    catch(e) { showMsg('train-msg',e.message,true); }
}

// ── Upgrade ───────────────────────────────────────────────────────────────
function renderUpgrade() {
    if (!character) return;
    const c=character, costs=c.upgradeCosts||{};
    const disc={ warrior:{strength:30,defense:15,vitality:10}, mage:{magic:35,agility:10}, rogue:{agility:35,strength:10}, paladin:{defense:25,magic:20,vitality:15} };
    const cd=disc[c.class]||{};
    const ev=c.active_event;
    const hasStatDiscount=ev?.key==='discount_stats';
    document.getElementById('upgrade-gold').textContent=`💰 ${c.gold.toLocaleString()} Gold available`;
    const evBanner=hasStatDiscount?`<div style="background:rgba(241,196,15,0.12);border:1px solid rgba(241,196,15,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:#f1c40f">📉 <strong>Stat Sale active!</strong> All upgrades 30% off!</div>`:'';
    const stats=[
        {key:'strength',icon:'💪',label:'Strength'},
        {key:'defense',icon:'🛡️',label:'Defense'},
        {key:'agility',icon:'⚡',label:'Agility',hint:'Dodge incoming hits'},
        {key:'magic',icon:'✨',label:'Magic'},
        {key:'vitality',icon:'❤️',label:'Vitality',hint:'Also boosts current HP'},
        {key:'hit_chance',icon:'🎯',label:'Hit Chance',hint:'Accuracy vs agility'},
        {key:'crit_chance',icon:'💥',label:'Crit Chance',hint:'% chance to hit max dmg'},
    ];
    document.getElementById('upgrade-grid').innerHTML=evBanner+stats.map(s=>{
        let cost=costs[s.key]||'?';
        const disc2=cd[s.key];
        if (hasStatDiscount&&typeof cost==='number') cost=Math.max(1,Math.floor(cost*0.70));
        const can=c.gold>=cost;
        const displayName=s.label||capitalize(s.key);
        return `<div class="upgrade-card">
      <div class="upgrade-card-header"><span class="upgrade-card-icon">${s.icon}</span><span class="upgrade-card-name">${displayName}</span><span class="upgrade-card-val">${c[s.key]||0}</span></div>
      ${s.hint?`<div style="font-size:0.72rem;color:var(--text-dim);margin:2px 0 4px">${s.hint}</div>`:''}
      ${disc2?`<div class="upgrade-discount">✦ ${disc2}% class discount</div>`:''}
      ${hasStatDiscount?`<div class="upgrade-discount" style="color:#f1c40f">📉 30% event discount</div>`:''}
      <div class="upgrade-cost">Next: <strong>${cost} gold</strong></div>
      <button class="btn-upgrade" onclick="upgradestat('${s.key}')" ${can?'':'disabled'}>${can?`+1 for ${cost}g`:`Need ${cost-c.gold} more`}</button>
    </div>`;
    }).join('');
}
async function upgradestat(stat) {
    try { const d=await api('POST','/game/upgrade',{stat}); character=d.character; renderUpgrade(); renderCharacter(); showMsg('upgrade-msg',d.message); }
    catch(e) { showMsg('upgrade-msg',e.message,true); }
}

// ── Event Banner Helper ───────────────────────────────────────────────────
function renderEventBanner(containerId) {
    const el=document.getElementById(containerId); if(!el) return;
    const ev=character?.active_event;
    if (!ev) { el.classList.add('hidden'); return; }
    const now=Math.floor(Date.now()/1000);
    const left=Math.max(0,ev.ends_at-now);
    const h=Math.floor(left/3600), m=Math.floor((left%3600)/60);
    const timeStr=h>0?`${h}h ${m}m`:`${m}m`;
    el.classList.remove('hidden');
    el.style.display='flex';
    el.innerHTML=`<span style="font-size:1.4rem">${ev.name?.split(' ')[0]||'🎉'}</span>
    <div><div style="font-weight:700;color:var(--gold)">${ev.name||'Event Active'}</div>
    <div style="font-size:0.8rem;color:var(--text-dim)">${ev.desc||''} · Ends in ${timeStr}</div></div>`;
}

// ── Skills Tab ────────────────────────────────────────────────────────────
function renderSkills() {
    if (!character) return;
    const c=character;
    const mp=character?.mission_points??0, mpMax=character?.mp_max||240;
    const dailyMpSpent=character?.daily_mp_spent??0;
    const unlocked=character?.skills_unlocked||(dailyMpSpent>=60);
    const mpPct=Math.min(100,Math.round((mp/mpMax)*100));
    const unlockPct=Math.min(100,Math.round((dailyMpSpent/60)*100));
    const now=Math.floor(Date.now()/1000);

    const mpEl=document.getElementById('skills-mp-bar');
    if (mpEl) mpEl.innerHTML=`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-weight:700;color:#9b59b6">🔮 Mission Points</span>
            <span style="font-weight:700;color:#9b59b6">${mp} / ${mpMax}</span>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:6px;height:10px;overflow:hidden;margin-bottom:8px">
            <div style="width:${mpPct}%;height:100%;background:linear-gradient(90deg,#8e44ad,#9b59b6);border-radius:6px;transition:width 0.4s"></div>
        </div>
        ${!unlocked?`
        <div style="margin-bottom:10px;padding:10px 14px;background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.3);border-radius:8px">
            <div style="font-size:0.8rem;color:#9b59b6;font-weight:600;margin-bottom:6px">🔒 Skills unlock by spending 60 MP on missions today</div>
            <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:6px;overflow:hidden">
                <div style="width:${unlockPct}%;height:100%;background:#9b59b6;border-radius:4px"></div>
            </div>
            <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px">${dailyMpSpent} / 60 MP spent today</div>
        </div>`:''}
        <div style="font-size:0.74rem;color:var(--text-dim)">MP regenerates +10/hr · Skill activation is <strong style="color:#9b59b6">free</strong> · 1 skill per day · 5h duration</div>`;

    renderEventBanner('skills-event-banner');

    const skills=c.class_skills||[];
    const activeSkills=c.active_skills||{};
    const lastUsed=c.skill_last_used||{};
    const todayMidnight=Math.floor(now/86400)*86400;
    const anyUsedToday=Object.values(lastUsed).some(t=>t>=todayMidnight);

    const grid=document.getElementById('skills-grid');
    if (!grid) return;
    if (!skills.length) { grid.innerHTML='<p style="color:var(--text-dim)">No skills for your class.</p>'; return; }

    grid.innerHTML=skills.map(sk=>{
        const isActive=activeSkills[sk.id]&&activeSkills[sk.id]>now;
        const usedToday=(lastUsed[sk.id]||0)>=todayMidnight;
        const expiresIn=isActive?Math.ceil((activeSkills[sk.id]-now)/60):0;
        const expiresStr=expiresIn>=60?`${Math.floor(expiresIn/60)}h ${expiresIn%60}m`:`${expiresIn}m`;
        const canActivate=unlocked&&!isActive&&!anyUsedToday;

        let btnLabel, btnDisabled;
        if (!unlocked)     { btnLabel=`🔒 Spend ${60-dailyMpSpent} more MP on missions today`; btnDisabled=true; }
        else if (isActive) { btnLabel=`⏳ Active — ${expiresStr} left`; btnDisabled=true; }
        else if (anyUsedToday&&!usedToday){ btnLabel=`✅ Another skill active today`; btnDisabled=true; }
        else if (usedToday){ btnLabel=`✅ Used today`; btnDisabled=true; }
        else               { btnLabel=`✨ Activate (Free)`; btnDisabled=false; }

        const cardBg=isActive
            ?'background:linear-gradient(135deg,rgba(155,89,182,0.25),rgba(142,68,173,0.15));border-color:rgba(155,89,182,0.5)'
            :(usedToday||anyUsedToday&&!isActive)
                ?'background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.06);opacity:0.6'
                :unlocked?'background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.1)'
                    :'background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.05);opacity:0.5';

        return `<div style="border:1px solid;border-radius:12px;padding:16px;${cardBg}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <span style="font-size:1.8rem">${sk.emoji}</span>
                <div>
                    <div style="font-weight:700;font-size:1rem;color:var(--text-bright)">${sk.name}</div>
                    ${isActive?`<div style="font-size:0.72rem;color:#9b59b6;font-weight:600">✨ ACTIVE · ${expiresStr} remaining</div>`:
            usedToday?`<div style="font-size:0.72rem;color:var(--text-dim)">Used today — resets at midnight</div>`:''}
                </div>
            </div>
            <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:12px;line-height:1.45">${sk.desc}</div>
            <button onclick="activateSkill('${sk.id}')" ${btnDisabled?'disabled':''}
                style="width:100%;padding:8px;border-radius:8px;border:1px solid ${canActivate?'rgba(155,89,182,0.5)':'rgba(255,255,255,0.1)'};
                background:${canActivate?'rgba(155,89,182,0.2)':'rgba(255,255,255,0.04)'};
                color:${canActivate?'#9b59b6':'var(--text-dim)'};cursor:${canActivate?'pointer':'not-allowed'};
                font-size:0.82rem;font-weight:600;transition:all 0.2s">${btnLabel}</button>
        </div>`;
    }).join('');
}

async function activateSkill(skillId) {
    try {
        const d=await api('POST','/game/skills/activate',{skillId});
        character=d.character;
        renderSkills(); renderTopBar();
        showMsg('skills-msg',d.message);
    } catch(e) { showMsg('skills-msg',e.message,true); }
}

// ── Missions ──────────────────────────────────────────────────────────────
async function loadMissions() {
    try {
        const char=character||await api('GET','/game/character');
        if (!character) character=char;
        await checkTravelStatus();
        renderWorldMap();
        await checkAndShowMissionOverlay();
    } catch(e) {
        console.error('Error loading missions:',e);
        const layer=document.getElementById('map-nodes-layer');
        if (layer) layer.innerHTML=`<p style="color:red;padding:20px">Failed to load: ${e.message}</p>`;
    }
}

function renderWorldMap() {
    const layer=document.getElementById('map-nodes-layer');
    if (!layer) return;
    const currentZone=character?.location||'forest';
    const playerLevel=character?.level||1;
    const drawnPairs=new Set();
    let svgLines=`<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">`;
    for (const [fromId,neighbors] of Object.entries(ZONE_ROUTES)) {
        for (const toId of Object.keys(neighbors)) {
            const key=[fromId,toId].sort().join('-');
            if (drawnPairs.has(key)) continue;
            drawnPairs.add(key);
            const from=ZONES[fromId],to=ZONES[toId];
            if (!from||!to) continue;
            const isActive=[currentZone,playerTravelTarget].includes(fromId)||[currentZone,playerTravelTarget].includes(toId);
            svgLines+=`<line x1="${from.pos.x}%" y1="${from.pos.y}%" x2="${to.pos.x}%" y2="${to.pos.y}%" style="stroke:${isActive?'rgba(241,196,15,0.5)':'rgba(255,255,255,0.15)'};stroke-width:2;stroke-dasharray:6 4;fill:none"/>`;
        }
    }
    svgLines+='</svg>';
    const pinsHtml=Object.entries(ZONES).map(([zoneId,zone])=>{
        const isUnlocked=playerLevel>=zone.minLevel;
        const isCurrent=currentZone===zoneId;
        const isTraveling=playerTravelTarget===zoneId;
        const pinStyle=`position:absolute;left:${zone.pos.x}%;top:${zone.pos.y}%;transform:translate(-50%,-50%);cursor:${isUnlocked?'pointer':'not-allowed'};z-index:10;text-align:center;transition:transform 0.2s;${!isUnlocked?'opacity:0.4':''}`;
        const badge=isCurrent?'📍':!isUnlocked?'🔒':isTraveling?'🚶':'';
        const ringStyle=`width:72px;height:72px;border-radius:50%;border:3px solid ${isCurrent?'#f1c40f':'rgba(255,255,255,0.3)'};object-fit:cover;display:block;background:#2c3e50;${!isUnlocked?'filter:grayscale(1)':''}${isCurrent?';box-shadow:0 0 0 3px rgba(241,196,15,0.4)':''}${isTraveling?';animation:pulse 1.5s infinite':''}`;
        return `<div style="${pinStyle}" onclick="onMapNodeClick('${zoneId}')" title="${zone.name}">
            <div style="position:relative;display:inline-block">
                ${badge?`<span style="position:absolute;top:-4px;right:-4px;font-size:14px;line-height:1;z-index:2">${badge}</span>`:''}
                <img style="${ringStyle}" src="${zone.mapImg}" alt="${zone.name}" onerror="this.style.background='#2c3e50'">
            </div>
            <div style="text-align:center;margin-top:5px;font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap">${zone.name}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.6);text-align:center">${isUnlocked?(isCurrent?'HERE':''):'Lv.'+zone.minLevel}</div>
        </div>`;
    }).join('');
    layer.innerHTML=svgLines+pinsHtml;
}

function onMapNodeClick(zoneId) {
    const zone=ZONES[zoneId]; if(!zone) return;
    if ((character?.level||1)<zone.minLevel) { showMsg('missions-msg',`Requires level ${zone.minLevel}`,true); return; }
    openLocationModal(zoneId);
}

function openLocationModal(zoneId) {
    const zone=ZONES[zoneId]; if(!zone) return;
    const modal=document.getElementById('mission-location-modal');
    const header=document.getElementById('mission-location-header');
    const spotsEl=document.getElementById('mission-spots-grid');
    const activeEl=document.getElementById('mission-location-active');
    if (!modal) return;
    const currentZone=character?.location||'forest';
    const isCurrent=currentZone===zoneId;
    const isTraveling=!!playerTravelTarget;
    let travelInfo='';
    if (!isCurrent) {
        const route=getShortestPath(currentZone,zoneId);
        if (route) {
            const mins=Math.ceil(route.time/60);
            const via=route.path.length>2?` via ${route.path.slice(1,-1).map(z=>ZONES[z]?.name||z).join(' → ')}`:'' ;
            travelInfo=`${mins} min${via}`;
        }
    }
    const dc={easy:'#2ecc71',medium:'#f39c12',hard:'#e74c3c'};
    const db2={easy:'rgba(39,174,96,0.2)',medium:'rgba(243,156,18,0.2)',hard:'rgba(192,57,43,0.2)'};

    header.innerHTML=`
        <div class="mz-hero" style="background-image:url('${zone.bgImg||zone.mapImg}')">
            <div class="mz-hero-overlay">
                <div class="mz-hero-title">${zone.name}</div>
                <div class="mz-hero-desc">${zone.description}</div>
                <div class="mz-hero-actions">
                    ${isCurrent
        ?`<span class="mz-here-badge">📍 You are here</span>`
        :`<button class="mz-travel-btn" onclick="doTravelToZone('${zoneId}')" ${isTraveling?'disabled':''}>
                            🚶 Travel here${travelInfo?' · '+travelInfo:''}
                          </button>`
    }
                </div>
            </div>
        </div>`;

    spotsEl.innerHTML=`
        <div class="mz-section-label">Choose a location</div>
        <div class="mz-spots-grid">
            ${zone.spots.map(spot=>{
        const locked=!isCurrent;
        return `<div class="mz-spot-card ${locked?'mz-spot-locked':''}" onclick="${locked?'':` openSpotMissions('${zoneId}','${spot.id}')`}">
                    <div class="mz-spot-img-wrap">
                        <img class="mz-spot-img" src="${spot.img}" alt="${spot.name}" onerror="this.src=''">
                        <span class="mz-spot-diff-badge" style="background:${db2[spot.difficulty]};color:${dc[spot.difficulty]}">${spot.difficulty.toUpperCase()}</span>
                        ${locked?'<div class="mz-spot-locked-overlay">🔒 Travel here first</div>':''}
                    </div>
                    <div class="mz-spot-info">
                        <div class="mz-spot-name">${spot.name}</div>
                        <div class="mz-spot-stats">🔮 20–60 MP &nbsp;·&nbsp; ⏱️ 10–30 min &nbsp;·&nbsp; 💰 ${zone.payoutBase[spot.difficulty][0]}–${zone.payoutBase[spot.difficulty][1]}</div>
                    </div>
                </div>`;
    }).join('')}
        </div>`;

    activeEl.innerHTML='';
    modal.classList.remove('hidden');
}

function closeMissionModal2() { const m=document.getElementById('mission-location-modal'); if(m) m.classList.add('hidden'); }

function openSpotMissions(zoneId, spotId) {
    const zone=ZONES[zoneId]; if(!zone) return;
    const spot=zone.spots.find(s=>s.id===spotId); if(!spot) return;
    const activeEl=document.getElementById('mission-location-active');
    const dc={easy:'#2ecc71',medium:'#f39c12',hard:'#e74c3c'};
    const mp=character?.mission_points??0;
    const sizes=[
        {key:'small',  label:'Small',  mpCost:20, duration:'10 min', mult:'1×',  desc:'Quick mission, standard rewards'},
        {key:'medium', label:'Medium', mpCost:40, duration:'20 min', mult:'1.8×',desc:'Longer mission, better rewards'},
        {key:'large',  label:'Large',  mpCost:60, duration:'30 min', mult:'3×',  desc:'Epic mission, best rewards'},
    ];
    activeEl.innerHTML=`
        <div class="mz-section-label" style="margin-top:24px">${spot.name} — pick mission size</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
            ${sizes.map(sz=>{
        const canAfford=mp>=sz.mpCost;
        const border=canAfford?`1px solid ${dc[spot.difficulty]}44`:'1px solid rgba(255,255,255,0.08)';
        const bg=canAfford?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.02)';
        const opacity=canAfford?'1':'0.45';
        return `<div onclick="${canAfford?`pickMissionSize('${zoneId}','${spotId}','${sz.key}')`:''}"
                    style="border:${border};border-radius:10px;padding:14px 10px;text-align:center;cursor:${canAfford?'pointer':'not-allowed'};background:${bg};opacity:${opacity};transition:all 0.2s">
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-bright);margin-bottom:4px">${sz.label}</div>
                    <div style="font-size:0.8rem;color:#9b59b6;font-weight:600;margin-bottom:6px">🔮 ${sz.mpCost} MP</div>
                    <div style="font-size:0.75rem;color:var(--text-dim)">⏱ ${sz.duration}</div>
                    <div style="font-size:0.75rem;color:${dc[spot.difficulty]};margin-top:2px">${sz.mult} rewards</div>
                    ${!canAfford?`<div style="font-size:0.7rem;color:var(--red-light);margin-top:6px">Need ${sz.mpCost-mp} more MP</div>`:''}
                </div>`;
    }).join('')}
        </div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:16px;text-align:center">Your MP: <strong style="color:#9b59b6">${mp} / 240</strong> · MP regenerates +10/hr</div>
        <div class="mz-section-label">Choose a mission</div>
        <div class="mz-missions-grid" id="spot-missions-list">
            ${spot.missions.map((m,idx)=>`
            <div class="mz-mission-card" id="mission-opt-${idx}" style="opacity:0.4;pointer-events:none">
                <div class="mz-mission-img-wrap">
                    <img class="mz-mission-img" src="${m.img}" alt="${m.name}" onerror="this.style.background='#1c2b38'">
                    <div class="mz-mission-img-overlay"><div class="mz-mission-start-btn">▶ Start</div></div>
                </div>
                <div class="mz-mission-info">
                    <div class="mz-mission-name">${m.name}</div>
                    <div class="mz-mission-reward" style="color:${dc[spot.difficulty]}">
                        💰 ${zone.payoutBase[spot.difficulty][0]}–${zone.payoutBase[spot.difficulty][1]}
                        &nbsp;·&nbsp; ⭐ ${zone.xpBase[spot.difficulty][0]}–${zone.xpBase[spot.difficulty][1]} XP
                    </div>
                </div>
            </div>`).join('')}
        </div>`;
    activeEl.dataset.zoneId=zoneId;
    activeEl.dataset.spotId=spotId;
    activeEl.dataset.selectedSize='';
}

function pickMissionSize(zoneId, spotId, sizeKey) {
    const activeEl=document.getElementById('mission-location-active');
    activeEl.dataset.selectedSize=sizeKey;
    const zone=ZONES[zoneId], spot=zone?.spots.find(s=>s.id===spotId);
    const dc={easy:'#2ecc71',medium:'#f39c12',hard:'#e74c3c'};
    const mults={small:1.0,medium:1.8,large:3.0};
    const mult=mults[sizeKey]||1;
    spot.missions.forEach((m,idx)=>{
        const card=document.getElementById(`mission-opt-${idx}`);
        if (card) {
            card.style.opacity='1';
            card.style.pointerEvents='auto';
            card.onclick=()=>doStartMission(zoneId,spotId,idx,sizeKey);
            const reward=card.querySelector('.mz-mission-reward');
            if (reward) reward.innerHTML=`💰 ${Math.floor(zone.payoutBase[spot.difficulty][0]*mult)}–${Math.floor(zone.payoutBase[spot.difficulty][1]*mult)} &nbsp;·&nbsp; ⭐ ${Math.floor(zone.xpBase[spot.difficulty][0]*mult)}–${Math.floor(zone.xpBase[spot.difficulty][1]*mult)} XP`;
        }
    });
    document.querySelectorAll('#mission-location-active [onclick^="pickMissionSize"]').forEach(el=>{
        el.style.background=el.getAttribute('onclick')?.includes(sizeKey)?'rgba(155,89,182,0.2)':'rgba(255,255,255,0.05)';
        el.style.borderColor=el.getAttribute('onclick')?.includes(sizeKey)?'rgba(155,89,182,0.5)':'';
    });
}

async function doStartMission(zoneId, spotId, missionIdx, size='small') {
    const zone=ZONES[zoneId]; const spot=zone?.spots.find(s=>s.id===spotId); if(!spot) return;
    if (character?.location!==zoneId) { showMsg('missions-msg','Travel to this zone first!',true); closeMissionModal2(); return; }
    if ((character?.hp_current??character?.hp_max)<=0) { showMsg('missions-msg','Out of HP! Wait for regeneration.',true); closeMissionModal2(); return; }
    const chosenMission=spot.missions[missionIdx]||spot.missions[0];
    const missionName=chosenMission.name;
    try {
        const result=await api('POST','/game/missions/start',{zoneId,spotId,missionIdx,missionName,size});
        character=await api('GET','/game/character');
        renderTopBar();
        closeMissionModal2();
        const confirmedName=result?.mission?.missionName||result?.mission?.mission_name||missionName;
        const endsAt=result?.mission?.ends_at||(Math.floor(Date.now()/1000)+result?.mission?.duration||600);
        showMissionOverlay({id:result?.mission?.id||1,zone:zoneId,ends_at:endsAt},confirmedName);
        renderWorldMap();
        setTimeout(()=>checkAndShowMissionOverlay(),1000);
    } catch(e) { showMsg('missions-msg',e.message,true); }
}

async function doTravelToZone(zoneId) {
    const active=await api('GET','/game/missions/active').catch(()=>null);
    if (active&&active.id) { showMsg('missions-msg','Cannot travel while on a mission!',true); return; }
    if (playerTravelTarget) { showMsg('missions-msg','Already traveling!',true); return; }
    const currentZone=character?.location||'forest';
    const route=getShortestPath(currentZone,zoneId);
    if (!route) { showMsg('missions-msg','No route available!',true); return; }
    try {
        const result=await api('POST','/game/travel/start',{targetZone:zoneId});
        playerTravelTarget=zoneId; playerTravelEndTime=result.travelEnd; playerTravelStartTime=result.travelStart||Math.floor(Date.now()/1000);
        closeMissionModal2(); showTravelOverlay(); renderWorldMap();
    } catch(e) { showMsg('missions-msg',e.message,true); }
}

async function collectMission() {
    try {
        const d=await api('POST','/game/missions/collect');
        character=d.character;
        hideMissionOverlay(); renderTopBar();
        let msg=`💰 +${d.goldEarned} gold · ⭐ +${d.xpEarned} XP`;
        if (d.won===false) msg=`💀 Defeated · ${msg}`;
        if (d.leveledUp) msg+=` · 🎉 LEVEL UP! Now Lv.${d.newLevel}`;
        if (d.drops?.length) msg+=` · 📦 ${d.drops.map(dr=>`${dr.qty}× ${dr.mat.replace(/_/g,' ')}`).join(', ')}`;
        if (d.battleLog) showBattleReportModal(d.battleLog,d.won,msg);
        else showMissionModal(msg);
        renderWorldMap(); renderCharacter();
    } catch(e) { alert(e.message); }
}

// ── Mission Overlay ───────────────────────────────────────────────────────
async function checkAndShowMissionOverlay() {
    try {
        const active=await api('GET','/game/missions/active');
        if (active&&active.id) { showMissionOverlay(active,active.mission_name||active.missionName||'Mission'); }
        else hideMissionOverlay();
    } catch { hideMissionOverlay(); }
}
function showMissionOverlay(active, displayName) {
    const overlay=document.getElementById('mission-overlay'); if(!overlay) return;
    if (overlayInterval) { clearInterval(overlayInterval); overlayInterval=null; }
    const nameEl=document.getElementById('overlay-mission-name');
    const zoneEl=document.getElementById('overlay-mission-zone');
    const timerEl=document.getElementById('overlay-mission-timer');
    const subtextEl=document.getElementById('overlay-mission-subtext');
    const fillEl=document.getElementById('overlay-progress-fill');
    const collectBtn=document.getElementById('overlay-collect-btn');
    if (nameEl) nameEl.textContent=displayName;
    if (zoneEl) zoneEl.textContent='📍 '+(ZONES[active.zone]?.name||active.zone||'');
    const totalDuration=active.ends_at-(active.started_at||(active.ends_at-600));
    function tick() {
        const now=Math.floor(Date.now()/1000), left=Math.max(0,active.ends_at-now);
        const m=Math.floor(left/60), s=left%60, done=left<=0;
        const pct=done?100:Math.min(100,((totalDuration-left)/Math.max(totalDuration,1))*100);
        if (timerEl) { timerEl.textContent=done?'✅ Complete!':`${m}:${String(s).padStart(2,'0')}`; timerEl.className='mission-overlay-timer'+(done?' done':''); }
        if (subtextEl) subtextEl.textContent=done?'Collect your rewards!':'Returning when complete...';
        if (fillEl) { fillEl.style.width=pct+'%'; fillEl.className='mission-overlay-progress-fill'+(done?' done':''); }
        if (collectBtn) collectBtn.disabled=!done;
        if (done&&overlayInterval) { clearInterval(overlayInterval); overlayInterval=null; }
    }
    tick();
    if (active.ends_at>Math.floor(Date.now()/1000)) overlayInterval=setInterval(tick,1000);
    overlay.classList.remove('hidden');
}
function hideMissionOverlay() {
    if (overlayInterval) { clearInterval(overlayInterval); overlayInterval=null; }
    const o=document.getElementById('mission-overlay'); if(o) o.classList.add('hidden');
}
async function overlayCollectMission() { await collectMission(); }

// ── Travel Overlay ────────────────────────────────────────────────────────
function showTravelOverlay() {
    const overlay=document.getElementById('travel-overlay'); if(!overlay) return;
    if (travelOverlayInterval) { clearInterval(travelOverlayInterval); travelOverlayInterval=null; }
    const nameEl=document.getElementById('travel-overlay-name');
    const fromEl=document.getElementById('travel-overlay-from');
    const timerEl=document.getElementById('travel-overlay-timer');
    const fillEl=document.getElementById('travel-overlay-fill');
    const cancelBtn=document.getElementById('travel-cancel-btn');
    if (nameEl) nameEl.textContent=ZONES[playerTravelTarget]?.name||playerTravelTarget;
    if (fromEl) fromEl.textContent=`From ${ZONES[playerLocation]?.name||playerLocation}`;
    const totalDuration=playerTravelEndTime-playerTravelStartTime||60;
    function tick() {
        const now=Math.floor(Date.now()/1000), left=Math.max(0,playerTravelEndTime-now);
        const m=Math.floor(left/60), s=left%60;
        const elapsed=now-playerTravelStartTime;
        const pct=Math.min(100,(elapsed/totalDuration)*100);
        const isFree=playerTravelStartTime===0||elapsed<FREE_CANCEL_WINDOW;
        if (timerEl) timerEl.textContent=left>0?`${m}:${String(s).padStart(2,'0')}`:'Arriving...';
        if (fillEl)  fillEl.style.width=pct+'%';
        if (cancelBtn) {
            const gems=character?.gems||0, canAfford=isFree||gems>=1;
            cancelBtn.disabled=!canAfford;
            cancelBtn.textContent=isFree?'Cancel (Free)':`Cancel (1 💎)${gems<1?' — no gems':''}`;
            cancelBtn.style.borderColor=isFree?'rgba(231,76,60,0.5)':'rgba(155,89,182,0.5)';
            cancelBtn.style.color=isFree?'#e74c3c':'#9b59b6';
            cancelBtn.style.background=isFree?'rgba(231,76,60,0.15)':'rgba(155,89,182,0.15)';
        }
        if (left<=0) { clearInterval(travelOverlayInterval); travelOverlayInterval=null; hideTravelOverlay(); checkTravelStatus().then(()=>renderWorldMap()); }
    }
    tick();
    travelOverlayInterval=setInterval(tick,1000);
    overlay.classList.remove('hidden');
}
function hideTravelOverlay() {
    if (travelOverlayInterval) { clearInterval(travelOverlayInterval); travelOverlayInterval=null; }
    const o=document.getElementById('travel-overlay'); if(o) o.classList.add('hidden');
}
async function cancelTravel() {
    const now=Math.floor(Date.now()/1000), elapsed=now-playerTravelStartTime;
    const isFreeCancel=playerTravelStartTime===0||elapsed<FREE_CANCEL_WINDOW;
    const gems=character?.gems||0;
    if (!isFreeCancel&&gems<1) { showMsg('missions-msg','Not enough gems to cancel!',true); return; }
    if (!confirm(isFreeCancel?'Cancel travel for free?':'Cancel travel for 1 💎?')) return;
    try {
        await api('POST','/game/travel/cancel',{paid:!isFreeCancel});
        playerTravelTarget=null; playerTravelEndTime=0; playerTravelStartTime=0;
        character=await api('GET','/game/character');
        hideTravelOverlay(); renderWorldMap(); renderCharacter();
        showMsg('missions-msg',isFreeCancel?'Travel cancelled.':'Travel cancelled (1 💎 spent).');
    } catch(e) { showMsg('missions-msg',e.message,true); }
}
function updateTravelStatusBar() { if(playerTravelTarget) showTravelOverlay(); else hideTravelOverlay(); }
async function checkTravelStatus() {
    try {
        const status=await api('GET','/game/travel/status');
        if (character) character.location=status.location; else character={location:status.location};
        playerLocation=status.location;
        playerTravelTarget=status.travelTarget||null;
        playerTravelEndTime=status.travelEndTime||0;
        playerTravelStartTime=status.travelStartTime||0;
        if (playerTravelTarget) showTravelOverlay(); else hideTravelOverlay();
        return status;
    } catch(e) { console.error('Failed to check travel status:',e); return null; }
}

// ── Mission timer ─────────────────────────────────────────────────────────
let missionTimerInterval=null;
function initMissionTimer() { resumeMissionCountdown(); }
function resumeMissionCountdown() {
    const saved=localStorage.getItem('mission_end_time'); if(!saved) return;
    const endTime=parseInt(saved,10), remaining=endTime-Date.now();
    if (remaining>0) startMissionCountdown(remaining,()=>{}); else localStorage.removeItem('mission_end_time');
}
function startMissionCountdown(durationMs,onComplete) {
    const endTime=Date.now()+durationMs; localStorage.setItem('mission_end_time',endTime.toString());
    if (missionTimerInterval) clearInterval(missionTimerInterval);
    missionTimerInterval=setInterval(()=>{ const r=endTime-Date.now(); if(r<=0){clearInterval(missionTimerInterval);missionTimerInterval=null;localStorage.removeItem('mission_end_time');if(onComplete)onComplete();} },1000);
}
function showMissionModal(message) {
    const modal=document.getElementById('mission-rewards-modal'), msgEl=document.getElementById('mission-rewards-message');
    if (!modal||!msgEl) return; msgEl.innerHTML=message; modal.classList.remove('hidden');
}
function closeMissionModal() { const m=document.getElementById('mission-rewards-modal'); if(m) m.classList.add('hidden'); }

// ── Battle Report Modal ────────────────────────────────────────────────────
function showBattleReportModal(log, won, summary) {
    const modal=document.getElementById('battle-result-modal');
    if (!modal) { showMissionModal(summary); return; }
    const out=document.getElementById('battle-outcome'), logEl=document.getElementById('battle-log');
    if (out) {
        out.className=won?'won':'lost';
        out.innerHTML=won?`🏆 VICTORY!<br><small style="font-size:0.75rem;color:var(--text-dim)">${summary}</small>`:`💀 DEFEATED<br><small style="font-size:0.75rem;color:var(--text-dim)">${summary}</small>`;
    }
    if (logEl) logEl.innerHTML=log.map(l=>`<div class="battle-log-line${l==='---'?' separator':''}">${l==='---'?'───────────────────':l}</div>`).join('');
    modal.classList.remove('hidden');
}

// ── Forge ─────────────────────────────────────────────────────────────────
async function loadForge() {
    document.getElementById('forge-content').innerHTML='<p class="loading">Loading forge...</p>';
    try { forgeData=await api('GET','/game/forge/recipes'); renderForge(); }
    catch(e) { document.getElementById('forge-content').innerHTML=`<p class="loading">${e.message}</p>`; }
}
function setForgeTab(tab,btn) { forgeTab=tab; document.querySelectorAll('.forge-tabs .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderForge(); }
function renderForge() {
    if (!forgeData) return;
    document.getElementById('forge-gold').textContent=`💰 ${forgeData.gold} Gold`;
    const el=document.getElementById('forge-content');
    if (forgeTab==='refine') {
        el.innerHTML=`<div class="forge-grid">${forgeData.components.map(c=>{
            const recipeStr=Object.entries(c.recipe).map(([mat,qty])=>{ const have=(forgeData.mats[mat]?.qty||0); return `<span style="color:${have>=qty?'var(--green)':'var(--red-light)'}">${qty}× ${mat.replace(/_/g,' ')} (have ${have})</span>`; }).join(', ');
            return `<div class="forge-card"><div class="forge-card-header"><span style="font-size:1.3rem">${c.emoji||'⚙️'}</span><span class="forge-card-name">${c.name}</span></div><div class="forge-recipe">Requires: ${recipeStr}</div><div class="forge-cost">+ ${c.goldCost} gold</div><button class="btn-forge" onclick="refine('${c.id}')" ${c.canCraft?'':'disabled'}>${c.canCraft?'Refine':'Cannot Refine'}</button></div>`;
        }).join('')}</div>`;
    } else {
        el.innerHTML=`<div class="forge-grid">${forgeData.equipment.map(r=>{
            const compStr=Object.entries(r.components).map(([comp,qty])=>{ const have=(forgeData.mats[comp]?.qty||0); return `<span style="color:${have>=qty?'var(--green)':'var(--red-light)'}">${qty}× ${comp.replace(/_/g,' ')} (have ${have})</span>`; }).join(', ');
            const statStr=Object.entries(r.stats).filter(([k])=>!k.includes('type')).map(([k,v])=>`${k.replace(/_/g,' ')} +${v}`).join(' · ');
            const locked=!r.zoneUnlocked;
            return `<div class="forge-card ${locked?'locked':''}"><div class="forge-card-header"><span style="font-size:1.3rem">${r.emoji||'⚔️'}</span><span class="forge-card-name">${r.name}</span><span class="forge-tier">T${r.tier}</span></div><div class="forge-desc">${r.desc}</div><div style="font-size:0.75rem;color:var(--gold);margin:4px 0">${statStr}</div>${locked?`<div style="font-size:0.75rem;color:var(--red-light)">🔒 Complete a mission in ${r.requiredZone.replace('_',' ')} first</div>`:`<div class="forge-recipe">Components: ${compStr}</div>`}<div class="forge-cost">+ ${r.goldCost.toLocaleString()} gold</div><button class="btn-forge" onclick="craftItem('${r.id}')" ${r.canCraft?'':'disabled'}>${locked?'Locked':r.canCraft?'Craft':'Cannot Craft'}</button></div>`;
        }).join('')}</div>`;
    }
}
async function refine(componentId) { try { const d=await api('POST','/game/forge/refine',{componentId}); showMsg('forge-msg',d.message); loadForge(); } catch(e) { showMsg('forge-msg',e.message,true); } }
async function craftItem(recipeId) { try { const d=await api('POST','/game/forge/craft',{recipeId}); showMsg('forge-msg',d.message); loadForge(); loadInventory(); } catch(e) { showMsg('forge-msg',e.message,true); } }

// ── Inventory ─────────────────────────────────────────────────────────────
async function loadInventory() {
    document.getElementById('inventory-content').innerHTML='<p class="loading">Loading...</p>';
    try { const d=await api('GET','/game/inventory'); renderInventory(d); }
    catch(e) { document.getElementById('inventory-content').innerHTML=`<p class="loading">${e.message}</p>`; }
}
function setInvTab(tab,btn) { invTab=tab; document.querySelectorAll('#tab-inventory .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); loadInventory(); }
function syncInvTabButtons() {
    const tabs=['equipment','consumables','materials'];
    document.querySelectorAll('#tab-inventory .filter-btn').forEach((btn,i)=>{
        btn.classList.toggle('active', tabs[i]===invTab);
    });
}
function renderInventory(data) {
    const el=document.getElementById('inventory-content');
    if (invTab==='equipment') {
        const gear=data.items.filter(i=>i.item_type==='equipment');
        if (!gear.length) { el.innerHTML='<p class="empty">No equipment yet. Craft some at the Forge!</p>'; return; }
        window._invGearData={};
        gear.forEach(i=>{ window._invGearData[i.id]={...i, equippedInSlot:data.equipped?.[i.item_data.slot]}; });
        el.innerHTML=`<div class="inv-hint">Hover to inspect &nbsp;·&nbsp; Click to equip / unequip</div>
        <div class="inv-equipment-grid">${gear.map(i=>{
            const d=i.item_data, eq=i.equipped;
            const qc=d.quality==='legendary'?'inv-legendary':d.quality==='rare'?'inv-rare':'';
            return '<div class="inv-item-cell '+(eq?'inv-item-equipped ':'')+qc+'" onmouseenter="showItemTooltip(event,'+i.id+')" onmouseleave="scheduleHideTooltip()" onclick="toggleEquipItem('+i.id+',\''+d.slot+'\','+(eq?'true':'false')+')">'
                +'<div class="inv-item-icon">'+itemIcon(d,'2rem')+'</div>'
                +(eq?'<div class="inv-item-equipped-dot"></div>':'')
                +'<div class="inv-item-name-label">'+(d.name||'').split(' ').slice(-1)[0]+'</div>'
                +'</div>';
        }).join('')}</div>
        <div id="item-tooltip" class="item-tooltip hidden" onmouseenter="cancelHideTooltip()" onmouseleave="scheduleHideTooltip()"></div>
        <div id="inv-msg" class="msg-bar hidden" style="margin-top:12px"></div>`;
    } else if (invTab==='consumables') {
        const cons=data.items.filter(i=>i.item_type==='consumable');
        if (!cons.length) { el.innerHTML='<p class="empty">No consumables. Buy potions from the Shop!</p>'; return; }
        el.innerHTML='<div class="inv-grid">'+cons.map(i=>{
            const d=i.item_data;
            const eff=d.effect?(d.effect.type==='heal'?'❤️ Restore '+d.effect.value+' HP':d.effect.type==='xp'?'⭐ +'+d.effect.value+' XP':d.effect.type==='temp_stat'?'💪 +'+d.effect.value+' '+d.effect.stat:''):'';
            const sp=Math.max(1,Math.floor((d.price||0)*0.3));
            const sn=(d.name||'').replace(/'/g,"\\'");
            return '<div class="inv-card">'
                +'<div class="inv-card-header"><span style="font-size:1.4rem">'+(d.emoji||'🧪')+'</span><span class="inv-card-name">'+(d.name||'')+'</span><span style="font-size:0.75rem;color:var(--text-dim);margin-left:auto">×'+(d.qty||1)+'</span></div>'
                +'<div class="inv-stat-str">'+eff+'</div>'
                +'<div class="inv-slot" style="font-size:0.75rem;color:var(--text-dim);margin:4px 0 10px">'+(d.desc||'')+'</div>'
                +'<div style="display:flex;gap:8px">'
                +'<button class="btn-sm" style="flex:1;background:rgba(39,174,96,0.15);border-color:rgba(39,174,96,0.4);color:#2ecc71" onclick="useItem('+i.id+',\''+sn+'\')">Use</button>'
                +'<button class="btn-sm danger" onclick="sellItem('+i.id+',\''+sn+'\','+sp+')">Sell '+sp+'g</button>'
                +'</div></div>';
        }).join('')+'</div>';
    } else {
        const mats=data.items.filter(i=>i.item_type==='raw_mat'||i.item_type==='component');
        if (!mats.length) { el.innerHTML='<p class="empty">No materials yet. Complete missions to gather resources!</p>'; return; }
        el.innerHTML='<div class="mat-grid">'+mats.map(i=>{
            const d=i.item_data;
            return '<div class="mat-card"><div style="font-size:1.6rem">'+(d.emoji||'📦')+'</div><div class="mat-name">'+(d.name||d.id)+'</div><div class="mat-qty">× '+(d.qty||1)+'</div><div class="mat-type" style="color:var(--text-dim);font-size:0.7rem">'+(i.item_type==='component'?'Component':'Raw Material')+'</div></div>';
        }).join('')+'</div>';
    }
}

let _hideTooltipTimer=null;
function scheduleHideTooltip(){ _hideTooltipTimer=setTimeout(hideItemTooltip,150); }
function cancelHideTooltip(){ if(_hideTooltipTimer){clearTimeout(_hideTooltipTimer);_hideTooltipTimer=null;} }

function showItemTooltip(event,itemId) {
    cancelHideTooltip();
    const tooltip=document.getElementById('item-tooltip');
    if(!tooltip) return;
    const info=window._invGearData?.[itemId];
    if(!info) return;
    const d=info.item_data, eq=info.equippedInSlot, isEquipped=info.equipped;
    const allStats=new Set([...Object.keys(d.stats||{}),...Object.keys(eq?.stats||{})].filter(k=>!k.includes('type')));
    const qColor={legendary:'#ffd700',rare:'#9b59b6',common:'rgba(255,255,255,0.5)'}[d.quality||'common'];
    const imgSrc=d.img||(d.name&&!d.consumable?`/images/assets/${d.name.toLowerCase().replace(/\s+/g,'-')}.png`:null);

    let statsHtml='';
    for(const stat of allStats){
        const nv=d.stats?.[stat]||0, ov=eq?.stats?.[stat]||0, diff=nv-ov;
        const dc=diff>0?'#2ecc71':diff<0?'#e74c3c':'rgba(255,255,255,0.3)';
        const ds=diff>0?'▲'+diff:diff<0?'▼'+Math.abs(diff):'';
        statsHtml+=`<div class="tt-stat"><span class="tt-stat-name">${stat.replace(/_/g,' ')}</span><span class="tt-stat-val">${nv}</span>${eq&&!isEquipped&&ds?`<span style="font-size:0.68rem;color:${dc}">${ds}</span>`:''}</div>`;
    }
    const sp=Math.max(1,Math.floor((d.price||0)*0.3));
    const sn=(d.name||'').replace(/'/g,"\\'");

    tooltip.innerHTML=`
        <div class="tt-preview">
            ${imgSrc
                ?`<img src="${imgSrc}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="tt-preview-emoji" style="display:none">${d.emoji||'📦'}</span>`
                :`<span class="tt-preview-emoji">${d.emoji||'📦'}</span>`}
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${d.name||''}</div>
            <div class="tt-meta">${capitalize(d.slot||'')}${d.quality&&d.quality!=='common'?' · <span style="color:'+qColor+'">'+d.quality+'</span>':''}</div>
            ${d.desc?`<div class="tt-desc">${d.desc}</div>`:''}
            <div class="tt-stats">${statsHtml||`<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>`}</div>
            ${eq&&!isEquipped?`<div class="tt-vs">vs equipped: <strong>${eq.name}</strong></div>`:''}
        </div>
        <div class="tt-actions">
            ${isEquipped
                ?`<button class="tt-btn tt-btn-secondary" onclick="unequipSlot('${d.slot}')">Unequip</button>`
                :`<button class="tt-btn tt-btn-primary" onclick="equipItem(${itemId})">Equip</button>`}
            <button class="tt-btn tt-btn-danger" onclick="sellItem(${itemId},'${sn}',${sp})" ${isEquipped?'disabled':''}>Sell ${sp}g</button>
        </div>`;

    tooltip.classList.remove('hidden');
    const r=event.currentTarget.getBoundingClientRect();
    tooltip.style.left='-9999px'; tooltip.style.top='-9999px';
    const tw=tooltip.offsetWidth||220, th=tooltip.offsetHeight||340;
    let left=r.right+12, top=r.top;
    if(left+tw>window.innerWidth-8) left=r.left-tw-12;
    if(top+th>window.innerHeight-8) top=window.innerHeight-th-8;
    tooltip.style.left=Math.max(8,left)+'px';
    tooltip.style.top=Math.max(8,top)+'px';
}

function hideItemTooltip(){ const t=document.getElementById('item-tooltip'); if(t) t.classList.add('hidden'); }

// Tooltip for eq slots in character sheet + profile modal (no inv data needed)
function showEqTooltip(event, itemJson) {
    cancelHideTooltip();
    const tooltip=document.getElementById('item-tooltip');
    if(!tooltip) return;
    let item; try { item=JSON.parse(itemJson); } catch { return; }
    const qColor={legendary:'#ffd700',rare:'#9b59b6',common:'rgba(255,255,255,0.5)'}[item.quality||'common'];
    const imgSrc=item.img||(item.name?`/images/assets/${item.name.toLowerCase().replace(/\s+/g,'-')}.png`:null);
    const statsHtml=Object.entries(item.stats||{})
        .filter(([k])=>!k.includes('type'))
        .filter(([,v])=>v!==0)
        .map(([k,v])=>`<div class="tt-stat"><span class="tt-stat-name">${k.replace(/_/g,' ')}</span><span class="tt-stat-val" style="color:${v>0?'#2ecc71':'#e74c3c'}">${v>0?'+':''}${v}</span></div>`)
        .join('');
    tooltip.innerHTML=`
        <div class="tt-preview">
            ${imgSrc?`<img src="${imgSrc}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="tt-preview-emoji" style="display:none">${item.emoji||'📦'}</span>`:`<span class="tt-preview-emoji">${item.emoji||'📦'}</span>`}
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${item.name||''}</div>
            <div class="tt-meta">${capitalize(item.slot||'item')}${item.quality&&item.quality!=='common'?` · <span style="color:${qColor}">${item.quality}</span>`:''}</div>
            ${item.desc?`<div class="tt-desc">${item.desc}</div>`:''}
            <div class="tt-stats">${statsHtml||'<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>'}</div>
        </div>`;
    tooltip.classList.remove('hidden');
    const r=event.currentTarget.getBoundingClientRect();
    tooltip.style.left='-9999px'; tooltip.style.top='-9999px';
    const tw=tooltip.offsetWidth||220, th=tooltip.offsetHeight||300;
    let left=r.right+12, top=r.top;
    if(left+tw>window.innerWidth-8) left=r.left-tw-12;
    if(top+th>window.innerHeight-8) top=window.innerHeight-th-8;
    tooltip.style.left=Math.max(8,left)+'px';
    tooltip.style.top=Math.max(8,top)+'px';
}
function toggleEquipItem(invId,slot,isEquipped){ hideItemTooltip(); if(isEquipped) unequipSlot(slot); else equipItem(invId); }
async function equipItem(invId) { try { await api('POST',`/game/equip/${invId}`); loadInventory(); character=await api('GET','/game/character'); renderCharacter(); showMsg('inv-msg','Equipped!'); } catch(e) { showMsg('inv-msg',e.message,true); } }
async function unequipSlot(slot) { try { await api('POST',`/game/unequip/${slot}`); loadInventory(); character=await api('GET','/game/character'); renderCharacter(); showMsg('inv-msg','Unequipped.'); } catch(e) { showMsg('inv-msg',e.message,true); } }
async function sellItem(invId, name, price) {
    if (!confirm(`Sell ${name} for ${price} gold?`)) return;
    try { const d=await api('POST',`/game/sell/${invId}`); character=d.character; renderTopBar(); loadInventory(); showMsg('inv-msg',d.message); }
    catch(e) { showMsg('inv-msg',e.message,true); }
}
async function useItem(invId, name) {
    try { const d=await api('POST',`/game/use/${invId}`); character=d.character; renderTopBar(); renderCharacter(); loadInventory(); showMsg('inv-msg',d.message); }
    catch(e) { showMsg('inv-msg',e.message,true); }
}

// ── Shop ──────────────────────────────────────────────────────────────────
function loadShop() {
    if (!character) { api('GET','/game/character').then(c=>{character=c;renderShopContent();}).catch(()=>{}); }
    else renderShopContent();
}
function renderShopContent() {
    if (!character) return;
    document.getElementById('shop-gold').textContent=`💰 ${character.gold.toLocaleString()} Gold`;
    document.getElementById('shop-gems').textContent=`💎 ${(character.gems||0).toLocaleString()} Gems`;
    const ld=document.getElementById('current-level-display'); if(ld) ld.textContent=character.level;
    const pb=document.getElementById('level-progress-bar'); if(pb) pb.style.width=`${(character.level/50)*100}%`;
    refreshShop();
}
function renderShop() {
    if (!character||!shopInventory.length) return;
    const el=document.getElementById('shop-content');
    const filtered=currentShopCategory==='all'?shopInventory:shopInventory.filter(item=>{
        const cat=item.category||item.slot||'';
        if(currentShopCategory==='weapons') return cat==='weapon';
        if(currentShopCategory==='armor') return cat==='armor';
        if(currentShopCategory==='accessories') return cat==='accessory';
        if(currentShopCategory==='consumables') return item.consumable||cat==='consumable';
        if(currentShopCategory==='premium') return item.priceType==='gems'||cat==='premium';
        return cat===currentShopCategory;
    });
    if(!filtered.length){el.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim)">No items in this category.</div>`;return;}
    el.innerHTML=filtered.map(item=>{
        const pt=item.priceType||'gold', ci=pt==='gems'?'💎':'💰', cc=pt==='gems'?'#9b59b6':'var(--gold)';
        const isAvail=character.level>=(item.level||1), classOk=!item.classes||item.classes.includes(character.class);
        const hasEnough=pt==='gems'?(character.gems||0)>=item.price:character.gold>=item.price;
        let cardClass='shop-card'; if(!isAvail)cardClass+=' locked-future'; if(!classOk)cardClass+=' class-locked'; if(item.quality==='legendary')cardClass+=' legendary'; else if(item.quality==='rare')cardClass+=' rare';
        const statsHtml=item.stats?Object.entries(item.stats).filter(([k])=>!k.includes('type')&&!k.includes('elem')).map(([k,v])=>v!==0?`<div class="shop-card-stat"><span class="shop-card-stat-label">${k.replace(/_/g,' ')}</span><span class="shop-card-stat-value ${v>0?'positive':'negative'}">${v>0?'+':''}${v}</span></div>`:'').join(''):'';
        const elemHtml=item.stats?.elem_dmg?`<div class="shop-card-stat"><span class="shop-card-stat-label">Elemental</span><span class="shop-card-stat-value">+${item.stats.elem_dmg} ${item.stats.elem_dmg_type}</span></div>`:'';
        const effectHtml=item.effect?(()=>{
            const e=item.effect;
            let label='';
            if(e.type==='heal') label=`Heals ${e.value} HP`;
            else if(e.type==='heal_full') label='Restores 100% HP';
            else if(e.type==='temp_stat') label=`+${e.value} ${capitalize(e.stat||'')}`;
            else if(e.type==='xp_multiplier') label=`${e.value}× XP boost`;
            else if(e.type==='gold_multiplier') label=`${e.value}× Gold boost`;
            else if(e.type==='xp') label=`+${e.value} XP`;
            else label=`${e.type}${e.value?' '+e.value:''}`;
            return `<div class="shop-card-stat"><span class="shop-card-stat-label">Effect</span><span class="shop-card-stat-value positive">${label}</span></div>`;
        })():'';
        return `<div class="${cardClass}">${pt==='gems'?'<span class="premium-badge">💎 PREMIUM</span>':''}${item.quality==='legendary'?'<span class="legendary-badge">👑 LEGENDARY</span>':''}
            <div class="shop-card-header"><span class="shop-card-icon">${itemIcon(item,'2rem')}</span><span class="shop-card-name">${item.name}</span><span class="shop-card-tier">Lv.${item.level||1}</span></div>
            <div class="shop-card-desc">${item.desc}</div>
            <div class="shop-card-requirements ${isAvail&&classOk?'met':'not-met'}">${!isAvail?`<div>🔒 Required: Level ${item.level}</div>`:''} ${item.classes?`<div>📋 Classes: ${item.classes.join('/')}</div>`:''}</div>
            ${statsHtml?`<div class="shop-card-stats">${statsHtml}${elemHtml}${effectHtml}</div>`:''}
            <div class="shop-card-footer"><span class="shop-card-price" style="color:${cc}">${ci} ${item.price.toLocaleString()}</span>
            <button class="btn-shop" onclick="buyItem('${item.id}')" ${isAvail&&classOk&&hasEnough?'':'disabled'}>${!isAvail?`Level ${item.level}`:!classOk?'Class Locked':!hasEnough?`Need ${item.price-(pt==='gems'?(character.gems||0):character.gold)}`:'Buy'}</button></div>
        </div>`;
    }).join('');
}
async function buyItem(itemId) {
    const item=shopInventory.find(i=>i.id===itemId); if(!item){showMsg('shop-msg','Item not found!',true);return;}
    const pt=item.priceType||'gold';
    if (character.level<(item.level||1)){showMsg('shop-msg',`Requires level ${item.level}!`,true);return;}
    if (item.classes&&!item.classes.includes(character.class)){showMsg('shop-msg',`Not available for ${capitalize(character.class)}!`,true);return;}
    if (pt==='gems'&&(character.gems||0)<item.price){showMsg('shop-msg','Not enough gems!',true);return;}
    if (pt!=='gems'&&character.gold<item.price){showMsg('shop-msg','Not enough gold!',true);return;}
    if(item._buying){showMsg('shop-msg','Purchase already in progress...',true);return;}
    item._buying=true;
    try {
        const result=await api('POST','/game/shop/buy',{itemId:item.id,category:item.category||'weapon',price:item.price,priceType:pt,item});
        character=result.character;
        shopInventory=shopInventory.filter(i=>i.id!==itemId);
        showMsg('shop-msg',`✅ ${item.name} purchased and added to your inventory!`);
        renderShop(); renderTopBar();
        if (item.consumable) { invTab='consumables'; loadInventory(); }
    } catch(e) { item._buying=false; showMsg('shop-msg',e.message,true); }
}
function setShopCategory(category,btn) { currentShopCategory=category; document.querySelectorAll('.shop-tabs .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderShop(); }
async function refreshShop() { if(!character)return; shopInventory=await generateShopInventory(character.level); renderShop(); }
async function generateShopInventory(playerLevel) { try { const r=await api('GET','/game/shop/items'); return r.items; } catch { return []; } }

// ── Leaderboard ───────────────────────────────────────────────────────────
function setLbSort(sort,btn) { lbSort=sort; document.querySelectorAll('.lb-filters .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); loadLeaderboard(); }
async function loadLeaderboard() {
    document.getElementById('leaderboard-list').innerHTML='<p class="loading">Loading...</p>';
    const mmBox = document.getElementById('matchmaking-box');
    if (mmBox && !mmBox.dataset.loaded) { mmBox.dataset.loaded='1'; findOpponent('similar'); }
    try { lbData=await api('GET',`/game/leaderboard?sort=${lbSort}`); renderLeaderboard(); }
    catch(e) { document.getElementById('leaderboard-list').innerHTML=`<p class="loading">${e.message}</p>`; }
}
function filterLeaderboard() { renderLeaderboard(); }
function renderLeaderboard() {
    const q=(document.getElementById('lb-search')?.value||'').toLowerCase();
    const filtered=q?lbData.filter(p=>p.name.toLowerCase().includes(q)||p.username.toLowerCase().includes(q)):lbData;
    if (!filtered.length){document.getElementById('leaderboard-list').innerHTML='<p class="empty">No players found.</p>';return;}
    document.getElementById('leaderboard-list').innerHTML=filtered.map((p,i)=>{
        const rank=p.rank||(i+1), rc=rank===1?'gold-rank':rank===2?'silver-rank':rank===3?'bronze-rank':'';
        const rs=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`#${rank}`;
        const tg=p.total_gold_earned?.toLocaleString()||p.gold.toLocaleString();
        return `<div class="lb-row" onclick="openProfile(${p.id})">
            <div class="lb-rank ${rc}">${rs}</div>
            <img src="/images/class/${p.class}.png" alt="${p.class}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.12);flex-shrink:0" onerror="this.style.display='none'">
            <div class="lb-info"><div class="lb-name">${p.name}${p.username===username?' <span style="color:var(--gold);font-size:0.7rem">(you)</span>':''}</div><div class="lb-sub">Lv.${p.level} ${capitalize(p.class)} · @${p.username}</div></div>
            <div class="lb-stats">
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--green)">${p.wins}</div><div class="lb-stat-lbl">WON</div></div>
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--red-light)">${p.losses}</div><div class="lb-stat-lbl">LOST</div></div>
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--gold)">💰 ${tg}</div><div class="lb-stat-lbl">EARNED</div></div>
            </div>
        </div>`;
    }).join('');
}

// ── Profile ───────────────────────────────────────────────────────────────
async function openProfile(id) {
    const modal=document.getElementById('profile-modal'), content=document.getElementById('profile-content');
    if (!modal||!content) return;
    content.innerHTML='<p class="loading">Loading profile...</p>'; modal.classList.remove('hidden');
    try {
        const p=await api('GET',`/game/player/${id}`);
        const classIcon={warrior:'🛡️',mage:'🔮',rogue:'🗡️',paladin:'✨'}[p.class]||'⚔️';
        const name=p.name||'Unknown', uname=p.username||'???', level=p.level??'?';
        const isMe=p.user_id===character?.user_id;
        const wins=p.wins??0, losses=p.losses??0, wr=(wins+losses>0)?Math.round((wins/(wins+losses))*100):0;
        const str=p.strength??0,def=p.defense??0,agi=p.agility??0,mag=p.magic??0,vit=p.vitality??10;
        const hc=p.hit_chance||0,cc=p.crit_chance||0;
        const maxStat=Math.max(str,def,agi,mag,vit,hc,cc,30);

        const eq=p.equipped||{};
        const slots=[['weapon','⚔️'],['armor','🛡️'],['accessory','💍'],['amulet','📿'],['ring','💍'],['boots','👢']];
        const eqHtml=slots.map(([slot,fallback], idx)=>{
            const avatarDiv = idx === 3 ? `<div style="display:flex;align-items:center;justify-content:center;"><img src="/images/class/${p.class}.png" style="width:116px;height:116px;object-fit:contain" onerror="this.style.opacity='0'"></div>` : '';
            const item=eq[slot];
            const sq=`width:80px;height:80px;border-radius:10px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px;position:relative;overflow:hidden;transition:all 0.15s;cursor:default;`;
            if(!item) return avatarDiv+`<div style="${sq}background:rgba(255,255,255,0.025);border:1px dashed rgba(255,255,255,0.1)"><span style="font-size:1.5rem;opacity:0.2">${fallback}</span></div>`;
            const qc=item.quality==='legendary'?'#f1c40f':item.quality==='rare'?'#9b59b6':'rgba(255,255,255,0.5)';
            const itemJson=JSON.stringify(JSON.stringify(item));
            return avatarDiv+`<div style="${sq}background:rgba(255,255,255,0.04);border:1px solid ${qc}33;"
                onmouseenter="this.style.background='rgba(255,255,255,0.09)';this.style.transform='translateY(-2px)';showEqTooltip(event,${itemJson})"
                onmouseleave="this.style.background='rgba(255,255,255,0.04)';this.style.transform='';scheduleHideTooltip()"
            >${itemIcon(item,'60px')}<span style="font-size:0.48rem;color:${qc};text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</span>${item.quality&&item.quality!=='common'?`<span style="position:absolute;top:2px;right:3px;font-size:0.44rem;color:${qc};text-transform:uppercase">${item.quality}</span>`:''}</div>`;
        }).join('');

        content.innerHTML=`
      <div class="profile-header">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="/images/class/${p.class}.png" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.15)" onerror="this.style.display='none'">
          <div><div class="profile-name">${classIcon} ${name}</div><div class="profile-class">Lv.${level} ${capitalize(p.class||'')} · @${uname}</div></div>
        </div>
        <button class="btn-secondary" onclick="closeProfile()">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div style="background:var(--bg3);border-radius:8px;padding:14px">
          <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:8px;letter-spacing:0.08em;text-transform:uppercase">Combat Stats</div>
          ${miniStat('💪','STR',str,maxStat,'str')}
          ${miniStat('🛡️','DEF',def,maxStat,'def')}
          ${miniStat('⚡','AGI',agi,maxStat,'agi')}
          ${miniStat('✨','MAG',mag,maxStat,'mag')}
          ${miniStat('❤️','VIT',vit,maxStat,'vit')}
          ${hc>0?miniStat('🎯','HIT',hc,maxStat,'hit'):''}
          ${cc>0?miniStat('💥','CRIT',cc,maxStat,'crit'):''}
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:14px">
          <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:8px;letter-spacing:0.08em;text-transform:uppercase">Record</div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Wins</span><span style="color:var(--green);font-weight:600">${wins}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Losses</span><span style="color:var(--red-light);font-weight:600">${losses}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Win rate</span><span style="color:var(--text-bright);font-weight:600">${wr}%</span></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:7px;margin-top:2px"><span style="color:var(--text-dim);font-size:0.82rem">Total Earned</span><span style="color:var(--gold);font-weight:600">💰 ${(p.total_gold_earned??p.gold??0).toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Total Lost</span><span style="color:var(--red-light);font-weight:600">💸 ${(p.total_gold_lost??0).toLocaleString()}</span></div>
          </div>
        </div>
      </div>
      ${Object.keys(eq).length?`
      <div style="background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:12px">
        <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:10px;letter-spacing:0.08em;text-transform:uppercase">Equipment</div>
        <div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:10px;align-items:center">${eqHtml}</div>
      </div>`:''}
      ${!isMe ? (() => {
            const gc=p.globalCooldown||0, ptc=p.perTargetCooldown||0, hpLow=p.hpLow;
            const myBattleCd=character?.battle_cooldown_remaining||0;
            let blocked=false, reason='';
            if(hpLow){blocked=true;reason='Too little HP';}
            else if(gc>0){blocked=true;const h=Math.ceil(gc/3600),m=Math.ceil(gc/60);reason='Recovery '+(h>=1?h+'h':m+'m');}
            else if(ptc>0){blocked=true;const h=Math.ceil(ptc/3600),m=Math.ceil(ptc/60);reason='Cooldown '+(h>=1?h+'h':m+'m');}
            else if(myBattleCd>0){blocked=true;const m=Math.ceil(myBattleCd/60);reason='Wait '+m+'m to fight again';}
            const atkBtn=blocked
                ?`<button class="btn-attack" disabled style="opacity:0.4;cursor:not-allowed" title="${reason}">🛡️ ${reason}</button>`
                :`<button class="btn-attack" onclick="closeProfile();attackFromProfile(${id},'${name.replace(/'/g,"\\'")}')">⚔️ Attack</button>`;
            return `<div class="profile-actions">${atkBtn}<button class="btn-secondary" onclick="closeProfile();openCompose(${id},'${name.replace(/'/g,"\\'")}')">✉️ Message</button></div>`;
        })() : ''}`;
    } catch(e) { content.innerHTML=`<p class="error">Failed to load profile: ${e.message||'Unknown error'}</p>`; }
}
function miniStat(icon,label,val,max,cls) {
    return `<div class="stat-row" style="padding:5px 0"><span class="stat-icon" style="font-size:0.9rem">${icon}</span><span class="stat-label" style="font-size:0.78rem">${label}</span>
    <div class="stat-bar-wrap"><div class="stat-bar"><div class="stat-fill ${cls}-fill" style="width:${Math.round(val/Math.max(max,1)*100)}%"></div></div></div>
    <span class="stat-val" style="font-size:0.9rem">${val}</span></div>`;
}
function closeProfile() { document.getElementById('profile-modal').classList.add('hidden'); }
async function attackFromProfile(id,name) { await attack(id,name); }

// ── Matchmaking ────────────────────────────────────────────────────────────
let _matchmakingTarget = null;

async function findOpponent(direction='similar') {
    const box = document.getElementById('matchmaking-box');
    if (box) box.innerHTML = '<p class="loading">Finding opponent...</p>';
    try {
        const p = await api('GET', `/game/matchmaking?direction=${direction}`);
        _matchmakingTarget = p;
        if (!p) {
            if (box) box.innerHTML = '<p class="empty">No available opponents right now.</p>';
            return;
        }
        const ci={warrior:'🛡️',mage:'🔮',rogue:'🗡️',paladin:'✨'};
        const power = (p.strength||0)+(p.defense||0)+(p.agility||0)+(p.magic||0)+p.level*5;
        const myPower = character ? (character.strength+character.defense+character.agility+character.magic+character.level*5) : 0;
        const powerDiff = power - myPower;
        const diffLabel = powerDiff > 10 ? '⬆️ Stronger' : powerDiff < -10 ? '⬇️ Weaker' : '↔️ Similar';
        if (box) box.innerHTML = `
            <div class="matchmaking-card">
                <div style="display:flex;align-items:center;gap:14px">
                    <img src="/images/class/${p.class}.png" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.15)" onerror="this.style.display='none'">
                    <div style="flex:1">
                        <div style="font-size:1rem;font-weight:700;color:#fff;cursor:pointer" onclick="openProfile(${p.id})">${ci[p.class]||'⚔️'} ${escHtml(p.name)}</div>
                        <div style="font-size:0.78rem;color:var(--text-dim)">Lv.${p.level} ${capitalize(p.class)} · ${p.wins}W/${p.losses}L</div>
                        <div style="font-size:0.72rem;margin-top:3px;color:var(--gold)">${diffLabel} · Power ${power}</div>
                    </div>
                    <button class="btn-attack" onclick="attack(${p.id},'${p.name}')">⚔️ Attack</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                <button class="btn-secondary" style="flex:1" onclick="findOpponent('weaker')">⬇️ Weaker</button>
                <button class="btn-secondary" style="flex:1" onclick="findOpponent('similar')">↔️ Similar</button>
                <button class="btn-secondary" style="flex:1" onclick="findOpponent('stronger')">⬆️ Stronger</button>
            </div>`;
    } catch(e) {
        if (box) box.innerHTML = `<p class="empty">${e.message}</p>`;
    }
}
async function attack(targetId,targetName) {
    if ((character?.hp_current??character?.hp_max)<=0){alert('You are out of HP! Wait for regeneration.');return;}
    try { const r=await api('POST',`/game/attack/${targetId}`); character=r.character; renderTopBar(); showBattleResult(r,targetName); }
    catch(e) { alert(e.message); }
}
function showBattleResult(r,targetName) {
    const out=document.getElementById('battle-outcome'), log=document.getElementById('battle-log');
    if (!out||!log) return;
    out.className=r.won?'won':'lost';
    out.innerHTML=r.won
        ?`🏆 VICTORY!<br><small style="font-size:0.75rem;color:var(--text-dim)">${r.xpGained > 0 ? `+${r.xpGained} XP` : r.xpGained < 0 ? `${r.xpGained} XP` : '0 XP'} · +${r.goldGained} Gold${r.leveledUp?' · 🎉 LEVEL UP!':''}</small>`
        :`💀 DEFEATED<br><small style="font-size:0.75rem;color:var(--text-dim)">+${r.xpGained} XP${r.goldLost ? ` · -${r.goldLost} Gold` : ''}</small>`;
    log.innerHTML=r.log.map(l=>`<div class="battle-log-line${l==='---'?' separator':''}">${l==='---'?'───────────────────':l}</div>`).join('');
    document.getElementById('battle-result-modal').classList.remove('hidden');
}
function closeBattle() { document.getElementById('battle-result-modal').classList.add('hidden'); renderCharacter(); }

// ── History ───────────────────────────────────────────────────────────────
async function loadHistory() {
    const list=document.getElementById('history-list'); list.innerHTML='<p class="loading">Loading...</p>';
    try {
        const battles=await api('GET','/game/battles');
        if (!battles.length){list.innerHTML='<p class="empty">No battles yet.</p>';return;}
        const myId=character.id;
        list.innerHTML=battles.map(b=>{
            const won=b.winner_id===myId, opp=b.attacker_id===myId?b.defender_name:b.attacker_name;
            const type=b.battle_type==='mission'?'⚔️ Mission':b.attacker_id===myId?'⚔️ Attacked':'🛡️ Defended vs';
            return `<div class="history-item" onclick="showHistoryLog(${JSON.stringify(b.log).replace(/"/g,'&quot;')},'${b.attacker_name}','${b.defender_name}')">
        <div class="history-header"><div class="history-vs">${type} <strong>${opp}</strong></div><div class="history-result ${won?'won':'lost'}">${won?'🏆 WIN':'💀 LOSS'}</div></div>
        <div class="history-date">${new Date(b.fought_at*1000).toLocaleDateString()}</div>
      </div>`;
        }).join('');
    } catch(e) { list.innerHTML=`<p class="loading">${e.message}</p>`; }
}
function showHistoryLog(logJson,a,d) {
    const log=typeof logJson==='string'?JSON.parse(logJson):logJson;
    const out=document.getElementById('battle-outcome');
    out.innerHTML=`📜 ${a} vs ${d}`; out.className='';
    document.getElementById('battle-log').innerHTML=log.map(l=>`<div class="battle-log-line${l==='---'?' separator':''}">${l==='---'?'───────────────────':l}</div>`).join('');
    document.getElementById('battle-result-modal').classList.remove('hidden');
}

// ── Inbox ─────────────────────────────────────────────────────────────────
window._reportCache = {};

async function loadInbox() {
    const el=document.getElementById('inbox-content'); el.innerHTML='<p class="loading">Loading...</p>';
    try {
        const messages=await api('GET','/game/messages');
        window._reportCache = {};

        let html=`<button class="compose-btn" onclick="openCompose(null,null)">✉️ New Message</button>`;
        if (!messages.length) html+='<p class="empty">Your inbox is empty.</p>';
        else html+=`<div class="inbox-list">${messages.map(m=>{
            const isReport = m.body && m.body.startsWith('BATTLE_REPORT:');
            if (isReport) {
                let report = null;
                try { report = JSON.parse(m.body.slice('BATTLE_REPORT:'.length)); } catch {}
                if (report) window._reportCache[m.id] = report;
                const isMission = report?.type === 'mission';
                const icon = isMission ? (report?.won ? '✅' : '💀') : (report?.won ? '🏆' : '⚔️');
                const tag  = isMission ? 'Mission Report' : 'Battle Report';
                const tagColor = isMission ? 'rgba(52,152,219,0.75)' : 'rgba(231,76,60,0.7)';
                return `<div class="msg-row ${m.read?'':'unread'}" id="msg-${m.id}">
                    <div class="msg-header">
                        <div class="msg-from ${m.read?'':'unread-from'}" style="display:flex;align-items:center;gap:7px">
                            <span style="font-size:0.65rem;padding:2px 8px;border-radius:4px;background:${tagColor};color:#fff;font-weight:700;letter-spacing:0.04em">${tag}</span>
                            ${icon} ${escHtml(m.subject)}
                        </div>
                        <div class="msg-date">${new Date(m.sent_at*1000).toLocaleDateString()}</div>
                    </div>
                    ${report ? `<div style="font-size:0.73rem;color:rgba(255,255,255,0.4);margin-top:4px">
                        vs ${escHtml(report.opponentName||report.npcName||'?')}
                        ${report.goldEarned ? ` · 💰 +${report.goldEarned}` : ''}
                        ${report.goldLost   ? ` · 💸 -${report.goldLost}`  : ''}
                        ${report.xpEarned   ? ` · ⭐ +${report.xpEarned} XP` : ''}
                    </div>` : ''}
                    <div class="msg-actions-report" style="display:flex;gap:8px;margin-top:8px">
                        <button class="btn-sm" onclick="viewBattleReport(${m.id})">📜 View Report</button>
                        <button class="btn-sm danger" onclick="deleteMessage(${m.id})">🗑 Delete</button>
                    </div>
                </div>`;
            }
            return `<div class="msg-row ${m.read?'':'unread'}" id="msg-${m.id}">
                <div class="msg-header"><div class="msg-from ${m.read?'':'unread-from'}">From: ${m.sender_name}</div><div class="msg-date">${new Date(m.sent_at*1000).toLocaleDateString()}</div></div>
                <div class="msg-subject">${escHtml(m.subject)}</div>
                <div class="msg-body-full" style="display:none">${escHtml(m.body)}</div>
                <div class="msg-actions" style="display:none"><button class="btn-sm" onclick="openCompose(${m.sender_id},'${m.sender_name}')">↩ Reply</button><button class="btn-sm danger" onclick="deleteMessage(${m.id})">🗑 Delete</button></div>
            </div>`;
        }).join('')}</div>`;
        el.innerHTML=html;

        messages.filter(m=>!m.body?.startsWith('BATTLE_REPORT:')).forEach(m=>{
            const row=document.getElementById(`msg-${m.id}`); if(!row) return;
            row.addEventListener('click',async(e)=>{
                if (e.target.tagName==='BUTTON') return;
                const b=row.querySelector('.msg-body-full'),ac=row.querySelector('.msg-actions'),exp=b.style.display!=='none';
                b.style.display=exp?'none':'block'; ac.style.display=exp?'none':'flex';
                if(!m.read&&!exp){m.read=1;row.classList.remove('unread');row.querySelector('.msg-from').classList.remove('unread-from');await api('POST',`/game/messages/${m.id}/read`);pollUnread();}
            });
        });

        messages.filter(m=>m.body?.startsWith('BATTLE_REPORT:')&&!m.read).forEach(async m=>{
            m.read=1;
            const row=document.getElementById(`msg-${m.id}`);
            if(row){row.classList.remove('unread');const f=row.querySelector('.msg-from');if(f)f.classList.remove('unread-from');}
            try{await api('POST',`/game/messages/${m.id}/read`);}catch{}
        });
        pollUnread();

    } catch(e) { el.innerHTML=`<p class="loading">${e.message}</p>`; }
}

function viewBattleReport(msgId) {
    const report = window._reportCache?.[msgId];
    if (!report) { alert('Report not found. Try reloading the inbox.'); return; }
    const summary = [
        report.won ? '✅ Victory' : '💀 Defeated',
        report.goldEarned ? `💰 ${report.goldEarned>0?'+':''}${report.goldEarned} gold` : null,
        report.xpEarned   ? `⭐ +${report.xpEarned} XP` : null,
    ].filter(Boolean).join(' · ');
    showBattleReportModal(report.log, report.won, summary);
}
async function deleteMessage(id) { try { await api('DELETE',`/game/messages/${id}`); loadInbox(); } catch(e) { alert(e.message); } }

// ── Compose ───────────────────────────────────────────────────────────────
function openCompose(rid,rname) {
    document.getElementById('compose-receiver-id').value=rid||'';
    document.getElementById('compose-receiver-name').textContent=rname?`To: ${rname}`:'Select recipient via player profile';
    document.getElementById('compose-subject').value=''; document.getElementById('compose-body').value='';
    setError('compose-error',''); document.getElementById('compose-modal').classList.remove('hidden');
}
function closeCompose() { document.getElementById('compose-modal').classList.add('hidden'); }
async function sendMessage() {
    const rid=document.getElementById('compose-receiver-id').value, sub=document.getElementById('compose-subject').value.trim(), body=document.getElementById('compose-body').value.trim();
    if (!rid) return setError('compose-error','No recipient. Use Message on a player profile.');
    if (!sub) return setError('compose-error','Subject required');
    if (!body) return setError('compose-error','Body required');
    try { await api('POST','/game/messages/send',{receiver_id:parseInt(rid),subject:sub,body}); closeCompose(); if(document.getElementById('tab-inbox').classList.contains('active'))loadInbox(); }
    catch(e) { setError('compose-error',e.message); }
}

// ── Item Generators ───────────────────────────────────────────────────────
const ITEM_GENERATORS = {
    weapon:{ namePrefixes:['Iron','Steel','Bronze','Silver','Golden','Crystal','Obsidian','Dragon','Mythril','Adamant'],nameSuffixes:['Sword','Blade','Axe','Dagger','Bow','Staff','Hammer','Spear','Mace','Scythe'],emojis:['⚔️','🗡️','🪓','🏹','🪄','🔨','🔪','⚒️'],baseStats:{dmg_min:{min:2,max:4,scale:1.2},dmg_max:{min:4,max:7,scale:1.3},strength:{min:0,max:2,scale:0.5},agility:{min:0,max:2,scale:0.4},magic:{min:0,max:2,scale:0.4}},classBonus:{warrior:{strength:1.2},rogue:{agility:1.2},mage:{magic:1.2},paladin:{strength:1.1,magic:0.8}} },
    armor:{ namePrefixes:['Leather','Chain','Plate','Scale','Crystal','Obsidian','Dragon','Mythril','Adamant'],nameSuffixes:['Armor','Vest','Cuirass','Breastplate','Hauberk','Mail','Plate'],emojis:['🛡️','🧥','🥼','👕','🦺'],baseStats:{defense:{min:1,max:3,scale:1.3},hp_max:{min:5,max:15,scale:1.4},strength:{min:0,max:1,scale:0.2},agility:{min:-1,max:0,scale:0.1}},classBonus:{warrior:{defense:1.2,hp_max:1.1},paladin:{defense:1.2,hp_max:1.1},rogue:{agility:0.2},mage:{magic:0.2}} },
    accessory:{ namePrefixes:['Iron','Silver','Golden','Crystal','Ruby','Sapphire','Emerald','Diamond','Mythril'],nameSuffixes:['Ring','Amulet','Necklace','Bracelet','Circlet','Brooch','Talisman'],emojis:['💍','📿','👑','🔮','✨'],baseStats:{strength:{min:0,max:2,scale:0.4},defense:{min:0,max:1,scale:0.3},agility:{min:0,max:2,scale:0.4},magic:{min:0,max:2,scale:0.4},hp_max:{min:5,max:20,scale:0.8}},classBonus:{warrior:{strength:1.2,defense:1.1},rogue:{agility:1.2,strength:0.8},mage:{magic:1.3,hp_max:0.8},paladin:{defense:1.1,magic:1.1}} },
    consumable:{ namePrefixes:['Small','Medium','Large','Greater','Superior','Divine'],nameSuffixes:['Health Potion','Mana Potion','Strength Elixir','Agility Draught','Defense Tonic','XP Tome'],emojis:['🧪','⚗️','🧴','💊','📖','🍵'],effects:[{type:'heal',baseValue:50,scale:1.5},{type:'heal',baseValue:100,scale:1.4},{type:'temp_stat',stat:'strength',baseValue:2,scale:1.2,duration:1800},{type:'temp_stat',stat:'agility',baseValue:2,scale:1.2,duration:1800},{type:'temp_stat',stat:'defense',baseValue:2,scale:1.2,duration:1800},{type:'xp',baseValue:100,scale:1.5},{type:'xp',baseValue:250,scale:1.4}] }
};
function calculateItemPrice(item,level) {
    const basePrice=50+(level*30), sm=Object.values(item.stats||{}).reduce((s,v)=>s+Math.max(0,v),1);
    return Math.floor(basePrice*sm*(item.tier||1));
}

// ── Item Icon Helper ──────────────────────────────────────────────────────
function itemIcon(item, size='2rem') {
    if (!item) return '';
    // Derive img path from name if not stored (items created before img field was added)
    const imgSrc = item.img || (item.name && !item.consumable
        ? `/images/assets/${item.name.toLowerCase().replace(/\s+/g,'-')}.png`
        : null);
    if (imgSrc) return `<img src="${imgSrc}" style="width:${size};height:${size};object-fit:contain;border-radius:4px;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none;font-size:${size};line-height:1">${item.emoji||'📦'}</span>`;
    return `<span style="font-size:${size};line-height:1">${item.emoji||'📦'}</span>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────
function setError(id,msg){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.classList.toggle('hidden',!msg);}
function showMsg(id,msg,isError=false){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.style.background=isError?'rgba(192,57,43,0.1)':'';el.style.borderColor=isError?'rgba(192,57,43,0.4)':'';el.style.color=isError?'var(--red-light)':'';el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),4000);}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function capitalize(s){return s?s[0].toUpperCase()+s.slice(1):'';}
