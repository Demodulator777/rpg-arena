// ── State ─────────────────────────────────────────────────────────────────
let token = localStorage.getItem('rpg_token');
let username = localStorage.getItem('rpg_username');
let character = null;
let trainTimer = null, unreadTimer = null;
let lbData = [];
let forgeTab = 'refine', invTab = 'weapons';
let forgeData = null;
let lbSort = 'total_gold_earned';
let shopInventory = [];
let currentShopCategory = 'weapons';
let activeMissionInterval = null;
let overlayInterval = null;
let travelOverlayInterval = null;
let restOverlayInterval = null;
let playerLocation = 'forest';
let playerTravelTarget = null;
let playerTravelEndTime = 0;
let playerTravelStartTime = 0;
const FREE_CANCEL_WINDOW = 300;

// ── Stat display labels ───────────────────────────────────────────────────
const STAT_LABELS = {
    dmg_min:        'Min Dmg',
    dmg_max:        'Max Dmg',
    armor:          '🛡 Armor',
    hp_max:         '❤️ HP',
    defense:        '🛡️ Defense',
    strength:       '💪 Strength',
    agility:        '⚡ Agility',
    magic:          '✨ Magic',
    vitality:       '❤️ Vitality',
    hit_chance:     '🎯 Hit Chance',
    crit_chance:    '💥 Crit Chance',
    pyro_dmg:       '🔥 Fire Dmg',
    water_dmg:      '💧 Water Dmg',
    wind_dmg:       '🌀 Wind Dmg',
    electro_dmg:    '⚡ Electro Dmg',
    pyro_resist:    '🔥 Fire Resist',
    water_resist:   '💧 Water Resist',
    wind_resist:    '🌀 Wind Resist',
    electro_resist: '⚡ Electro Resist',
};

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

// ── Component Upgrade Values (for frontend) ────────────────────────────────
const COMPONENT_UPGRADE_VALUES = {
    iron_ingot: { bonus: 2, goldCost: 5000, name: 'Iron Ingot' },
    hardwood_plank: { bonus: 2, goldCost: 5000, name: 'Hardwood Plank' },
    tanned_hide: { bonus: 2, goldCost: 5000, name: 'Tanned Hide' },
    poison_extract: { bonus: 3, goldCost: 8000, name: 'Poison Extract' },
    frost_core: { bonus: 3, goldCost: 8000, name: 'Frost Core' },
    mithril_ingot: { bonus: 4, goldCost: 12000, name: 'Mithril Ingot' },
    arcane_shard: { bonus: 4, goldCost: 12000, name: 'Arcane Shard' },
    dragon_plate: { bonus: 6, goldCost: 20000, name: 'Dragon Plate' },
    void_crystal: { bonus: 6, goldCost: 20000, name: 'Void Crystal' },
    shadow_weave: { bonus: 8, goldCost: 30000, name: 'Shadow Weave' },
    demon_alloy: { bonus: 10, goldCost: 50000, name: 'Demon Alloy' }
};

const POSSIBLE_STATS = [
    'strength', 'defense', 'agility', 'magic', 'vitality',
    'hit_chance', 'crit_chance', 'armor', 'hp_max',
    'pyro_dmg', 'water_dmg', 'wind_dmg', 'electro_dmg',
    'pyro_resist', 'water_resist', 'wind_resist', 'electro_resist'
];

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
    if (!document.getElementById('item-tooltip')) {
        const tt=document.createElement('div');
        tt.id='item-tooltip'; tt.className='item-tooltip hidden';
        tt.addEventListener('mouseenter', cancelHideTooltip);
        tt.addEventListener('mouseleave', scheduleHideTooltip);
        document.body.appendChild(tt);
    }
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
const TAB_ORDER=['character','premium','loadout','skills','train','upgrade','missions','forge','inventory','shop','leaderboard','inbox', 'dungeon'];
function showTab(name) {
    document.querySelectorAll('.game-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(`tab-${name}`)?.classList.add('active');
    const idx=TAB_ORDER.indexOf(name);
    if (idx>=0) document.querySelectorAll('.nav-btn')[idx]?.classList.add('active');
    if (name==='character')   renderCharacter();
    if (name==='premium')     loadPremium();
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
    if (name==='dungeon')     renderDungeonTab();
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
    set('topbar-mp-text',el=>{ el.textContent=`${mp} / ${mpMax} MP`; el.title=unl?'Skills unlocked today!':`Spend ${60-dms} more MP on missions to unlock skills today`; });
    set('topbar-mp',el=>{ el.textContent=unl?`🔮 ${mp} ✨`:`🔮 ${mp} (${dms}/60)`; el.title=unl?'Skills unlocked today!':`Spend ${60-dms} more MP on missions to unlock skills`; });
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
    updatePotionBadge();
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
    },60000);
    unreadTimer=setInterval(pollUnread,60000);
    pollUnread();
}
async function pollUnread() {
    try {
        const d=await api('GET','/game/messages/unread-count');
        const b=document.getElementById('unread-badge');
        if (d.count>0){b.textContent=d.count;b.classList.remove('hidden');}else b.classList.add('hidden');
    } catch {}
}

// ── Equipment slot helpers ────────────────────────────────────────────────

function buildEqSlotSmall(slot, eq, icon, label) {
    const item = eq[slot];
    if (!item) return `<div class="eq-slot-small empty"><span style="font-size:1rem;opacity:0.3">${icon}</span><span class="eq-slot-label">${label}</span></div>`;
    const qc = item.quality==='legendary'?'#f1c40f':item.quality==='rare'?'#9b59b6':'rgba(255,255,255,0.5)';
    const itemData = escHtml(JSON.stringify(item));
    return `<div class="eq-slot-small filled" style="border-color:${qc}44"
        onmouseenter="showEqTooltip(event,this.dataset.item)" onmouseleave="scheduleHideTooltip()" data-item="${itemData}">
        <span style="font-size:1.1rem;line-height:1">${itemIcon(item,'slot')}</span>
    </div>`;
}

function renderCharacter() {
    if (!character) return;
    const c = character;
    const eq = c.equipped||{};
    const lxp = c.level*25;
    const xpPct = Math.min(100,(c.xp/lxp)*100);
    const hpCur = c.hp_current??c.hp_max;
    const hpPct = Math.min(100,(hpCur/c.hp_max)*100);
    const hpColor = hpPct>60?'#2ecc71':hpPct>30?'#f39c12':'#e74c3c';
    const maxStat = Math.max(c.strength,c.defense,c.agility,c.magic,c.vitality||10,c.hit_chance||0,c.crit_chance||0,30);

    const STAT_KEYS = ['strength','defense','agility','magic','vitality','hit_chance','crit_chance','hp_max','armor'];
    const itemBonus = {};
    STAT_KEYS.forEach(k => { itemBonus[k] = 0; });
    Object.values(eq).forEach(item => {
        if (!item?.stats) return;
        STAT_KEYS.forEach(k => { if (item.stats[k]) itemBonus[k] += item.stats[k]; });
    });

    const baseStr  = c.strength    || 0;
    const baseDef  = c.defense     || 0;
    const baseAgi  = c.agility     || 0;
    const baseMag  = c.magic       || 0;
    const baseVit  = c.vitality    || 10;
    const baseHit  = c.hit_chance  || 0;
    const baseCrit = c.crit_chance || 0;

    const wep = eq.weapon;
    const baseDmgMin = Math.floor(baseStr * 0.5);
    const baseDmgMax = baseDmgMin + 4;
    const weapDmgMin = wep?.stats?.dmg_min || 0;
    const weapDmgMax = wep?.stats?.dmg_max || 0;
    const finalDmgMin = baseDmgMin + weapDmgMin;
    const finalDmgMax = baseDmgMax + weapDmgMax;
    const dmgTooltip = `Base: ${baseDmgMin}–${baseDmgMax} (STR ${baseStr}×0.5) + Weapon: +${weapDmgMin}–${weapDmgMax}`;

    function statRowBreakdown(icon, label, base, bonus, max, cls) {
        const total = base + bonus;
        const pct = Math.round(total / Math.max(max, 1) * 100);
        const bonusTag = bonus !== 0
            ? `<span style="font-size:0.62rem;color:${bonus>0?'#2ecc71':'#e74c3c'};margin-left:3px">${bonus>0?'+':''}${bonus}</span>`
            : '';
        return `<div class="stat-row">
            <span class="stat-icon">${icon}</span>
            <span class="stat-label">${label}</span>
            <div class="stat-bar-wrap"><div class="stat-bar"><div class="stat-fill ${cls}-fill" style="width:${pct}%"></div></div></div>
            <span class="stat-val">${base}${bonusTag}</span>
            <span style="font-size:0.8rem;font-weight:700;color:var(--text-bright);min-width:36px;text-align:right">${total}</span>
        </div>`;
    }

    const baseArmor = Math.floor(baseDef / 4);
    const armorVal  = baseArmor + (itemBonus.armor || 0);

    const elemDmgObj    = c.elem_dmg    || {};
    const elemResistObj = c.elem_resist || {};
    const elemEmojis    = { pyro:'🔥', water:'💧', wind:'🌀', electro:'⚡' };
    const activeDmg     = Object.entries(elemDmgObj).filter(([,v]) => v > 0);
    const activeResist  = Object.entries(elemResistObj).filter(([,v]) => v > 0);
    const elemDmgStr    = activeDmg.map(([e,v])   => `${elemEmojis[e]}+${v}`).join(' ');
    const elemResistStr = activeResist.map(([e,v]) => `${elemEmojis[e]}${v}`).join(' ');

    const eqSlots=[
        {slot:'helmet', icon:'⛑️', label:'Helmet'},
        {slot:'armor',  icon:'🛡️', label:'Armor'},
        {slot:'weapon', icon:'⚔️', label:'Weapon'},
        {slot:'amulet', icon:'📿', label:'Amulet / Ring'},
        {slot:'shield', icon:'🛡', label:'Shield'},
        {slot:'boots',  icon:'👢', label:'Boots'},
    ];
    const resolvedEq = { ...eq, amulet: eq.amulet || eq.ring || null };
const mainEqGrid = eqSlots.map(({slot,icon,label},idx) => {
    const avatarDiv = idx === 3 ? `
        <div class="eq-avatar-center">
            <img src="/images/class/${c.class}.png" alt="${c.class}" onerror="this.style.opacity='0'">
        </div>` : '';
    const item = resolvedEq[slot];
    if (!item) return avatarDiv + `
        <div class="eq-slot empty">
            <span class="eq-slot-icon">${icon}</span>
            <span class="eq-slot-label">${label}</span>
        </div>`;
    const qc = item.quality==='legendary'?'#f1c40f':item.quality==='rare'?'#9b59b6':'rgba(255,255,255,0.5)';
    const itemData = escHtml(JSON.stringify(item));
    return avatarDiv + `
        <div class="eq-slot filled" style="border-color:${qc}44"
            onmouseenter="showEqTooltip(event,this.dataset.item)"
            onmouseleave="scheduleHideTooltip()"
            data-item="${itemData}">
            <span class="eq-slot-icon">${itemIcon(item,'slot')}</span>
        </div>`;
}).join('');

const eqGrid = `
<div class="eq-grid">${mainEqGrid}</div>
<div class="eq-accessory-row">
    ${buildEqSlotSmall('accessory', eq, '🔮', 'Accessory')}
</div>`;

    // FIX: Use c.mp_max from backend response (already includes premium bonus)
    const mpCurrent = c.mission_points || 0;
    const mpMax = c.mp_max || 240;  // This should already include Arcane Reservoir 2x bonus
    const mpPct = Math.min(100, Math.round((mpCurrent / mpMax) * 100));

    const charSheet = document.getElementById('char-sheet');
    if (!charSheet) return;
    charSheet.innerHTML = `
    <div class="char-panel">
      <h3>STATS</h3>
      ${statRowBreakdown('💪','Strength', baseStr, itemBonus.strength||0, maxStat,'str')}
      ${statRowBreakdown('🛡️','Defense',  baseDef,  itemBonus.defense||0,  maxStat,'def')}
      ${statRowBreakdown('⚡','Agility',  baseAgi,  itemBonus.agility||0,  maxStat,'agi')}
      ${statRowBreakdown('✨','Magic',    baseMag,  itemBonus.magic||0,    maxStat,'mag')}
      ${statRowBreakdown('❤️','Vitality', baseVit,  itemBonus.vitality||0, maxStat,'vit')}
      ${baseHit>0||itemBonus.hit_chance?statRowBreakdown('🎯','Hit Chance',  baseHit,  itemBonus.hit_chance||0,  maxStat,'hit'):''}
      ${baseCrit>0||itemBonus.crit_chance?statRowBreakdown('💥','Crit Chance',baseCrit, itemBonus.crit_chance||0, maxStat,'crit'):''}
      <div style="margin-top:13px;font-size:0.74rem;color:var(--text-dim);border-top:1px solid var(--border);padding-top:11px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span title="${escHtml(dmgTooltip)}" style="cursor:help">
          ⚔️ DMG: <strong style="color:var(--text-bright)">${finalDmgMin}–${finalDmgMax}</strong>
        </span>
        <span>🛡 Armor: <strong style="color:#5dade2">${armorVal}</strong></span>
        ${elemDmgStr    ? `<span style="color:#f1c40f">${elemDmgStr}</span>`    : ''}
        ${elemResistStr ? `<span style="color:#5dade2">Res: ${elemResistStr}</span>` : ''}
        ${hpCur<c.hp_max?'<span style="margin-left:auto;color:rgba(255,255,255,0.3)">⏳ +10% HP/hr</span>':''}
      </div>
    </div>
    <div class="char-panel">
      <h3>EQUIPMENT</h3>
      ${eqGrid}
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
// ── Loadout visual config ─────────────────────────────────────────────────
// Zone positions as % of figure container (left%, top%)
// Anatomically placed on a generic humanoid silhouette
const ZONE_POSITIONS = {
    head:         { x: 50,  y:  6  },
    throat:       { x: 50,  y: 16  },
    chest:        { x: 50,  y: 27  },
    heart:        { x: 38,  y: 27  },
    solar_plexus: { x: 50,  y: 38  },
    stomach:      { x: 50,  y: 49  },
    left_arm:     { x: 22,  y: 33  },
    right_arm:    { x: 78,  y: 33  },
    left_leg:     { x: 36,  y: 72  },
    right_leg:    { x: 64,  y: 72  },
};

// Colors per attack zone
const ZONE_COLORS = {
    head:         '#e74c3c',
    throat:       '#e67e22',
    chest:        '#3498db',
    heart:        '#9b59b6',
    solar_plexus: '#1abc9c',
    stomach:      '#2ecc71',
    left_arm:     '#f39c12',
    right_arm:    '#f1c40f',
    left_leg:     '#5dade2',
    right_leg:    '#a29bfe',
};

// Colors per block zone (mapped to what they protect)
const BLOCK_COLORS = {
    high_guard:    '#e74c3c',
    cross_guard:   '#3498db',
    mid_guard:     '#2ecc71',
    left_guard:    '#f39c12',
    right_guard:   '#f1c40f',
    full_turtle:   '#636e72',
    weave_left:    '#fd79a8',
    weave_right:   '#fdcb6e',
    counter_stance:'#9b59b6',
    no_block:      '#d63031',
};

// Which body positions to highlight for a given block zone
const BLOCK_HIGHLIGHT_ZONES = {
    high_guard:    ['head','throat'],
    cross_guard:   ['heart','chest'],
    mid_guard:     ['solar_plexus','stomach'],
    left_guard:    ['left_arm','left_leg'],
    right_guard:   ['right_arm','right_leg'],
    full_turtle:   ['chest','stomach'],
    weave_left:    ['head','left_arm'],
    weave_right:   ['head','right_arm'],
    counter_stance: Object.keys(ZONE_POSITIONS),
    no_block:      [],
};

let _loadoutActiveRound = 0;
let _loadoutAttackZones = [...DEFAULT_ATTACK_ZONES];
let _loadoutBlockZones  = [...DEFAULT_BLOCK_ZONES];

function renderLoadout() {
    if (!character) return;
    _loadoutAttackZones = JSON.parse(character.attack_zones||'null') || [...DEFAULT_ATTACK_ZONES];
    _loadoutBlockZones  = JSON.parse(character.block_zones||'null')  || [...DEFAULT_BLOCK_ZONES];
    const el = document.getElementById('loadout-content');
    if (!el) return;
    el.innerHTML = `
        <div style="margin-bottom:14px;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;font-size:0.78rem;color:rgba(255,255,255,0.45)">
            ⚔️ Select a round, then click a zone dot to change it. Your opponent cannot see your choices.
        </div>
        <div id="loadout-rounds" style="display:flex;gap:5px;margin-bottom:20px;flex-wrap:wrap"></div>
        <div class="loadout-figures-row" style="margin-bottom:16px">
            <div class="loadout-figure-col">
                <div style="text-align:center;font-size:0.65rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#e74c3c;margin-bottom:10px">⚔️ Attack Zone</div>
                <div id="loadout-atk-grid" class="loadout-dot-grid"></div>
                <div id="loadout-atk-info" class="loadout-zone-info"></div>
            </div>
            <div class="loadout-figure-col">
                <div style="text-align:center;font-size:0.65rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#3498db;margin-bottom:10px">🛡️ Block Zone</div>
                <div id="loadout-blk-grid" class="loadout-dot-grid"></div>
                <div id="loadout-blk-info" class="loadout-zone-info"></div>
            </div>
        </div>
        <div style="display:none" id="loadout-hidden-inputs">
            ${Array.from({length:10},(_,i)=>`<input id="atk-${i}" value="${_loadoutAttackZones[i]||'chest'}"><input id="blk-${i}" value="${_loadoutBlockZones[i]||'cross_guard'}">`).join('')}
        </div>
        <button class="btn-primary" style="width:100%;margin-top:4px" onclick="saveLoadout()">Save Loadout</button>
        <div id="loadout-msg" class="msg-bar hidden"></div>`;
    _loadoutActiveRound = 0;
    renderLoadoutRoundTabs();
    renderLoadoutDotGrid('atk');
    renderLoadoutDotGrid('blk');
    document.addEventListener('click', closeLoadoutPopup, true);
}

function renderLoadoutRoundTabs() {
    const el = document.getElementById('loadout-rounds');
    if (!el) return;
    el.innerHTML = Array.from({length:10}, (_,i) => {
        const atkZone  = _loadoutAttackZones[i] || 'chest';
        const blkZone  = _loadoutBlockZones[i]  || 'cross_guard';
        const atkColor = ZONE_COLORS[atkZone]   || '#aaa';
        const blkColor = BLOCK_COLORS[blkZone]  || '#aaa';
        const isActive = i === _loadoutActiveRound;
        return `<div onclick="selectLoadoutRound(${i})" style="
            flex:1;min-width:42px;padding:7px 4px;border-radius:8px;cursor:pointer;text-align:center;
            border:2px solid ${isActive?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.1)'};
            background:${isActive?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.03)'};transition:all 0.15s">
            <div style="font-size:0.62rem;color:${isActive?'#fff':'rgba(255,255,255,0.4)'};font-weight:700;margin-bottom:5px">${i+1}</div>
            <div style="display:flex;gap:3px;justify-content:center">
                <div style="width:10px;height:10px;border-radius:50%;background:${atkColor};box-shadow:0 0 5px ${atkColor}88" title="${HIT_ZONES[atkZone]?.label||atkZone}"></div>
                <div style="width:10px;height:10px;border-radius:50%;background:${blkColor};box-shadow:0 0 5px ${blkColor}88" title="${BLOCK_ZONES[blkZone]?.label||blkZone}"></div>
            </div>
        </div>`;
    }).join('');
}

function renderLoadoutDotGrid(type) {
    const isAtk = type === 'atk';
    const el = document.getElementById(`loadout-${type}-grid`);
    if (!el) return;
    const charClass   = character?.class || 'warrior';
    const currentZone = isAtk
        ? (_loadoutAttackZones[_loadoutActiveRound] || 'chest')
        : (_loadoutBlockZones[_loadoutActiveRound]  || 'cross_guard');
    const blockHighlights = !isAtk ? (BLOCK_HIGHLIGHT_ZONES[currentZone] || []) : [];

    const dots = Object.entries(ZONE_POSITIONS).map(([zoneKey, pos]) => {
        let isSelected, color;
        if (isAtk) {
            isSelected = currentZone === zoneKey;
            color = ZONE_COLORS[zoneKey] || '#aaa';
        } else {
            isSelected = blockHighlights.includes(zoneKey);
            color = isSelected ? (BLOCK_COLORS[currentZone] || '#3498db') : 'rgba(255,255,255,0.18)';
        }
        const size   = isSelected ? 22 : 18;
        const glow   = isSelected ? `box-shadow:0 0 14px ${color},0 0 5px ${color};` : '';
        const border = isSelected ? 'border:2px solid rgba(255,255,255,0.85);' : 'border:1px solid rgba(255,255,255,0.2);';
        const label  = HIT_ZONES[zoneKey]?.label || zoneKey;
        return `<div
            data-zone="${zoneKey}"
            title="${label}"
            onclick="onLoadoutDotClick(event,'${type}','${zoneKey}')"
            style="position:absolute;
                left:calc(${pos.x}% - ${size/2}px);
                top:calc(${pos.y}% - ${size/2}px);
                width:${size}px;height:${size}px;
                border-radius:50%;background:${color};
                ${border}${glow}
                cursor:pointer;transition:all 0.15s;z-index:2;"></div>`;
    }).join('');

    el.innerHTML = `
        <div id="loadout-${type}-wrap"
             class="loadout-wrap"
             style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);
                    border-radius:10px;overflow:hidden">
            <img src="/images/class/${charClass}.png"
                 style="position:absolute;inset:0;width:100%;height:92%;
                        object-fit:contain;object-position:center top;
                        opacity:0.2;pointer-events:none;z-index:0"
                 onerror="this.style.display='none'">
            ${dots}
        </div>`;

    updateLoadoutZoneInfo(type, currentZone);
}

function onLoadoutDotClick(e, type, zoneKey) {
    e.stopPropagation();
    closeLoadoutPopup();
    const dot = e.currentTarget;
    const rect = dot.getBoundingClientRect();
    showLoadoutPopup(type, rect);
}

function showLoadoutPopup(type, anchorRect) {
    const isAtk = type === 'atk';
    const entries = isAtk ? Object.entries(HIT_ZONES) : Object.entries(BLOCK_ZONES);
    const currentZone = isAtk
        ? (_loadoutAttackZones[_loadoutActiveRound] || 'chest')
        : (_loadoutBlockZones[_loadoutActiveRound]  || 'cross_guard');

    const popup = document.createElement('div');
    popup.id = 'loadout-popup';
    popup.style.cssText = `position:fixed;z-index:9999;
        background:rgba(8,12,22,0.97);border:1px solid rgba(255,255,255,0.14);
        border-radius:10px;padding:6px;min-width:175px;max-width:215px;
        box-shadow:0 12px 40px rgba(0,0,0,0.85);max-height:320px;overflow-y:auto;`;

    popup.innerHTML = entries.map(([k, v]) => {
        const isActive = currentZone === k;
        const color = isAtk ? (ZONE_COLORS[k]||'#aaa') : (BLOCK_COLORS[k]||'#aaa');
        const stat  = isAtk
            ? `\u00d7${v.dmgMult} \u00b7 ${Math.round(v.hitChance*100)}% hit`
            : `${Math.round(v.reduction*100)}% block`;
        return `<div onclick="pickLoadoutZone('${type}','${k}')"
            style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;cursor:pointer;
                   background:${isActive?`${color}22`:'transparent'};
                   border:1px solid ${isActive?color:'transparent'};
                   transition:background 0.1s;margin-bottom:2px"
            onmouseenter="this.style.background='rgba(255,255,255,0.07)'"
            onmouseleave="this.style.background='${isActive?`${color}22`:'transparent'}'">
            <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
                <div style="font-size:0.73rem;color:${isActive?'#fff':'rgba(255,255,255,0.75)'};font-weight:${isActive?'700':'400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.label}</div>
                <div style="font-size:0.6rem;color:rgba(255,255,255,0.3)">${stat}</div>
            </div>
            ${isActive?`<div style="font-size:0.65rem;color:${color}">\u2713</div>`:''}
        </div>`;
    }).join('');

    document.body.appendChild(popup);

    const pw = popup.offsetWidth  || 185;
    const ph = popup.offsetHeight || 300;
    let left = anchorRect.right + 10;
    let top  = anchorRect.top - 10;
    if (left + pw > window.innerWidth  - 8) left = anchorRect.left - pw - 10;
    if (top  + ph > window.innerHeight - 8) top  = window.innerHeight - ph - 8;
    if (top < 8) top = 8;
    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
}

function pickLoadoutZone(type, zoneKey) {
    if (type === 'atk') _loadoutAttackZones[_loadoutActiveRound] = zoneKey;
    else                 _loadoutBlockZones[_loadoutActiveRound]  = zoneKey;
    const inp = document.getElementById(`${type}-${_loadoutActiveRound}`);
    if (inp) inp.value = zoneKey;
    renderLoadoutRoundTabs();
    renderLoadoutDotGrid(type);
}

function closeLoadoutPopup(e) {
    const popup = document.getElementById('loadout-popup');
    if (!popup) return;
    if (e && popup.contains(e.target)) return;
    popup.remove();
}

function updateLoadoutZoneInfo(type, zoneKey) {
    const el = document.getElementById(`loadout-${type}-info`);
    if (!el) return;
    const isAtk = type === 'atk';
    if (isAtk) {
        const z = HIT_ZONES[zoneKey]; if (!z) return;
        const color = ZONE_COLORS[zoneKey] || '#aaa';
        el.innerHTML = `<span style="color:${color};font-weight:700">${z.label}</span>
            <span style="color:rgba(255,255,255,0.35)"> · ×${z.dmgMult} dmg · ${Math.round(z.hitChance*100)}% hit</span>
            <div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-top:2px">${z.desc}</div>`;
    } else {
        const z = BLOCK_ZONES[zoneKey]; if (!z) return;
        const color = BLOCK_COLORS[zoneKey] || '#aaa';
        el.innerHTML = `<span style="color:${color};font-weight:700">${z.label}</span>
            <span style="color:rgba(255,255,255,0.35)"> · ${Math.round(z.reduction*100)}% block</span>
            <div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-top:2px">${z.desc}</div>`;
    }
}

function selectLoadoutRound(i) {
    _loadoutActiveRound = i;
    closeLoadoutPopup();
    renderLoadoutRoundTabs();
    renderLoadoutDotGrid('atk');
    renderLoadoutDotGrid('blk');
}

function onZoneSelectChange(sel, type) { /* legacy stub */ }

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
    const hasApprentice = !!(c.premium_features && c.premium_features['apprentice']);
    document.getElementById('upgrade-gold').textContent=`💰 ${c.gold.toLocaleString()} Gold available`;
    const evBanner=hasStatDiscount?`<div style="background:rgba(241,196,15,0.12);border:1px solid rgba(241,196,15,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:#f1c40f">📉 <strong>Stat Sale active!</strong> All upgrades 30% off!</div>`:'';
    const apprenticeBanner=hasApprentice?`<div style="background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:#9b59b6">📚 <strong>Apprentice Premium:</strong> Additional 20% off all upgrades!</div>`:'';
    const stats=[
        {key:'strength',icon:'💪',label:'Strength'},
        {key:'defense',icon:'🛡️',label:'Defense'},
        {key:'agility',icon:'⚡',label:'Agility',hint:'Dodge incoming hits'},
        {key:'magic',icon:'✨',label:'Magic'},
        {key:'vitality',icon:'❤️',label:'Vitality',hint:'Also boosts current HP'},
        {key:'hit_chance',icon:'🎯',label:'Hit Chance',hint:'Accuracy vs agility'},
        {key:'crit_chance',icon:'💥',label:'Crit Chance',hint:'% chance to hit max dmg'},
    ];
    document.getElementById('upgrade-grid').innerHTML=evBanner+apprenticeBanner+stats.map(s=>{
        let cost=costs[s.key]||'?';
        const disc2=cd[s.key];
        if (hasStatDiscount&&typeof cost==='number') cost=Math.max(1,Math.floor(cost*0.70));
        if (hasApprentice&&typeof cost==='number') cost=Math.max(1,Math.floor(cost*0.80));
        const can=c.gold>=cost;
        const displayName=s.label||capitalize(s.key);
        return `<div class="upgrade-card">
      <div class="upgrade-card-header"><span class="upgrade-card-icon">${s.icon}</span><span class="upgrade-card-name">${displayName}</span><span class="upgrade-card-val">${c[s.key]||0}</span></div>
      ${s.hint?`<div style="font-size:0.72rem;color:var(--text-dim);margin:2px 0 4px">${s.hint}</div>`:''}
      ${disc2?`<div class="upgrade-discount">✦ ${disc2}% class discount</div>`:''}
      ${hasStatDiscount?`<div class="upgrade-discount" style="color:#f1c40f">📉 30% event discount</div>`:''}
      ${hasApprentice?`<div class="upgrade-discount" style="color:#9b59b6">📚 20% apprentice discount</div>`:''}
      <div class="upgrade-cost">Next: <strong>${cost} gold</strong></div>
      <button class="btn-upgrade" onclick="upgradestat('${s.key}')" ${can?'':'disabled'}>${can?`+1 for ${cost}g`:`Need ${cost-c.gold} more`}</button>
    </div>`;
    }).join('');
}
let _upgradingStats = {};
async function upgradestat(stat) {
    if (_upgradingStats[stat]) return;
    _upgradingStats[stat] = true;
    document.querySelectorAll('.btn-upgrade').forEach(b => b.disabled = true);
    try {
        const d = await api('POST', '/game/upgrade', { stat });
        character = d.character;
        renderUpgrade();
        renderCharacter();
        showMsg('upgrade-msg', d.message);
    } catch(e) {
        showMsg('upgrade-msg', e.message, true);
        renderUpgrade();
    } finally {
        _upgradingStats[stat] = false;
    }
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
                    <div style="font-size:0.75rem;color:${dc[spot.difficulty]};margin-top:2px">💰 ${sz.mult} gold</div>
                    <div style="font-size:0.7rem;color:#f1c40f;margin-top:2px">⭐ ${sz.key === 'small' ? '0-6' : sz.key === 'medium' ? '0-9' : '0-12'} XP</div>
                    ${!canAfford?`<div style="font-size:0.7rem;color:var(--red-light);margin-top:6px">Need ${sz.mpCost-mp} more MP</div>`:''}
                </div>`;
    }).join('')}
        </div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:16px;text-align:center">Your MP: <strong style="color:#9b59b6">${mp} / ${character?.mp_max || 240}</strong> · MP regenerates +10/hr</div>
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
                        💰 ${zone.payoutBase[spot.difficulty][0]}–${zone.payoutBase[spot.difficulty][1]} gold
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

let _missionStarting = false;
async function doStartMission(zoneId, spotId, missionIdx, size='small') {
    if (_missionStarting) return;
    _missionStarting = true;
    const zone = ZONES[zoneId];
    const spot = zone?.spots.find(s => s.id === spotId);
    if (!spot) { _missionStarting = false; return; }
    if (character?.location !== zoneId) { showMsg('missions-msg', 'Travel to this zone first!', true); closeMissionModal2(); _missionStarting = false; return; }
    if ((character?.hp_current ?? character?.hp_max) <= 0) { showMsg('missions-msg', 'Out of HP! Wait for regeneration.', true); closeMissionModal2(); _missionStarting = false; return; }
    closeMissionModal2();
    const chosenMission = spot.missions[missionIdx] || spot.missions[0];
    const missionName = chosenMission.name;
    try {
        const result = await api('POST', '/game/missions/start', { zoneId, spotId, missionIdx, missionName, size });

        // ── Dungeon token generation ──
        const mpCosts = { small: 20, medium: 40, large: 60 };
        if (typeof dungeonAddTokens === 'function') dungeonAddTokens(mpCosts[size] || 20);

        character = await api('GET', '/game/character');
        renderTopBar();
        const confirmedName = result?.mission?.missionName || result?.mission?.mission_name || missionName;
        const endsAt = result?.mission?.ends_at || (Math.floor(Date.now() / 1000) + (result?.mission?.duration || 600));
        showMissionOverlay({ id: result?.mission?.id || 1, zone: zoneId, ends_at: endsAt }, confirmedName);
        renderWorldMap();
        setTimeout(() => checkAndShowMissionOverlay(), 1000);
    } catch(e) {
        showMsg('missions-msg', e.message, true);
    } finally {
        _missionStarting = false;
    }
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
        if (d.battleLog) showBattleReportModal(d.battleLog, d.won, msg, d.totalDmgDealt, d.totalDmgTaken);
        else showMissionModal(msg);
        renderWorldMap(); renderCharacter();
    } catch(e) { alert(e.message); }
}

// ── Mission Overlay ───────────────────────────────────────────────────────
async function checkAndShowMissionOverlay() {
    try {
        const active=await api('GET','/game/missions/active');
        if (active&&active.id) {
            hideRestOverlay();
            showMissionOverlay(active,active.mission_name||active.missionName||'Mission');
            return;
        }
        hideMissionOverlay();
        // Re-fetch character to get fresh battle_cooldown_ends_at — the cached
        // `character` object may be stale (e.g. set before the last battle completed).
        const freshChar = await api('GET', '/game/character');
        if (freshChar) character = freshChar;
        const endsAt = character?.battle_cooldown_ends_at || 0;
        const lastBattle = character?.last_battle_at || 0;
        const now = Math.floor(Date.now() / 1000);
        if (endsAt > now && lastBattle > 0) {
            showRestOverlay(lastBattle, endsAt);
        } else {
            hideRestOverlay();
        }
    } catch { hideMissionOverlay(); hideRestOverlay(); }
}

function showRestOverlay(startedAt, endsAt) {
    const overlay = document.getElementById('rest-overlay'); if (!overlay) return;
    if (restOverlayInterval) { clearInterval(restOverlayInterval); restOverlayInterval = null; }
    const timerEl = document.getElementById('rest-overlay-timer');
    const fillEl  = document.getElementById('rest-overlay-fill');
    const recoverBtn = document.getElementById('rest-recover-btn');
    const totalDuration = endsAt - startedAt;
    function tick() {
        const now = Math.floor(Date.now() / 1000);
        const left = Math.max(0, endsAt - now);
        const elapsed = now - startedAt;
        const pct = Math.min(100, (elapsed / Math.max(totalDuration, 1)) * 100);
        const m = Math.floor(left / 60), s = left % 60;
        if (timerEl) timerEl.textContent = left > 0 ? `${m}:${String(s).padStart(2,'0')}` : 'Ready!';
        if (fillEl)  fillEl.style.width = pct + '%';
        if (recoverBtn) {
            const hasGems = (character?.gems || 0) >= 1;
            recoverBtn.disabled = !hasGems;
            recoverBtn.textContent = hasGems ? '⚡ Recover Now (1 💎)' : '⚡ Recover Now (need 💎)';
            recoverBtn.style.opacity = hasGems ? '1' : '0.4';
        }
        if (left <= 0) {
            clearInterval(restOverlayInterval); restOverlayInterval = null;
            hideRestOverlay();
        }
    }
    tick();
    restOverlayInterval = setInterval(tick, 1000);
    overlay.classList.remove('hidden');
}

function hideRestOverlay() {
    if (restOverlayInterval) { clearInterval(restOverlayInterval); restOverlayInterval = null; }
    const o = document.getElementById('rest-overlay'); if (o) o.classList.add('hidden');
}

async function instantBattleRecovery() {
    const gems = character?.gems || 0;
    if (gems < 1) {
        showMsg('missions-msg', 'Need 1 💎 gem to recover instantly!', true);
        return;
    }
    if (!confirm('Skip battle cooldown for 1 💎?')) return;
    const btn = document.getElementById('rest-recover-btn');
    if (btn) btn.disabled = true;
    try {
        const d = await api('POST', '/game/battle/recover');
        character = d.character;
        renderTopBar();
        hideRestOverlay();
        showMsg('missions-msg', '⚡ Recovered! You can now start a mission.');
    } catch(e) {
        showMsg('missions-msg', e.message, true);
        if (btn) btn.disabled = false;
    }
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

// ── Battle Report Modal ───────────────────────────────────────────────────

// ── Forge ─────────────────────────────────────────────────────────────────
async function loadForge() {
    document.getElementById('forge-content').innerHTML='<p class="loading">Loading forge...</p>';
    try { forgeData=await api('GET','/game/forge/recipes'); renderForge(); }
    catch(e) { document.getElementById('forge-content').innerHTML=`<p class="loading">${e.message}</p>`; }
}
function setForgeTab(tab,btn) { forgeTab=tab; document.querySelectorAll('.forge-tabs .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderForge(); }
function renderForge() {
    if (!forgeData) return;
    document.getElementById('forge-gold').textContent=`💰 ${forgeData.gold.toLocaleString()} Gold`;
    const el=document.getElementById('forge-content');

    if (forgeTab==='refine') {
        el.innerHTML=`<div class="forge-grid">${forgeData.components.map(c=>{
            const recipeStr=Object.entries(c.recipe).map(([mat,qty])=>{
                const have=(forgeData.mats[mat]?.qty||0);
                return `<span style="color:${have>=qty?'var(--green)':'var(--red-light)'}">${qty}× ${mat.replace(/_/g,' ')} (have ${have})</span>`;
            }).join(', ');
            return `<div class="forge-card">
                <div class="forge-card-header"><span style="font-size:1.3rem">${c.emoji||'⚙️'}</span><span class="forge-card-name">${c.name}</span></div>
                <div style="font-size:0.75rem;color:var(--text-dim);margin:4px 0 6px">${c.desc}</div>
                <div class="forge-recipe">Requires: ${recipeStr}</div>
                <div class="forge-cost">+ ${c.goldCost.toLocaleString()} gold</div>
                <button class="btn-forge" onclick="refine('${c.id}')" ${c.canCraft?'':'disabled'}>${c.canCraft?'Refine':'Cannot Refine'}</button>
            </div>`;
        }).join('')}</div>`;
        return;
    }

    const sets = forgeData.sets || {};
    const bySet = {};
    for (const r of forgeData.equipment) {
        if (!bySet[r.setId]) bySet[r.setId] = [];
        bySet[r.setId].push(r);
    }

    const rarityColor = { epic:'#9b59b6', legendary:'#f1c40f', rare:'#3498db', common:'#aaa' };
    const slotIcon = { weapon:'⚔️', armor:'🛡️', helmet:'⛑️', shield:'🔰', boots:'👢' };

    el.innerHTML = Object.entries(bySet).map(([setId, pieces]) => {
        const setDef = sets[setId] || { name: setId, emoji:'⚒️', bonus3:{desc:''}, bonus5:{desc:''} };
        const ownedCount = pieces.filter(p => p.owned).length;
        const ownedPct = Math.round(ownedCount / pieces.length * 100);

        const progressBar = `
            <div style="margin:8px 0 4px;display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${ownedPct}%;background:${rarityColor[pieces[0].quality]||'#9b59b6'};border-radius:3px;transition:width 0.3s"></div>
                </div>
                <span style="font-size:0.7rem;color:var(--text-dim)">${ownedCount}/${pieces.length}</span>
            </div>`;

        const bonusHtml = `
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px">
                <div style="padding:5px 10px;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid rgba(255,255,255,0.08);font-size:0.7rem;color:${ownedCount>=3?'var(--green)':'var(--text-dim)'}">
                    ✦ 3/5: ${setDef.bonus3?.desc||'Set bonus'}
                </div>
                <div style="padding:5px 10px;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid rgba(255,255,255,0.08);font-size:0.7rem;color:${ownedCount>=5?'var(--gold)':'var(--text-dim)'}">
                    ✦ 5/5: ${setDef.bonus5?.desc||'Full set bonus'}
                </div>
            </div>`;

        const pieceCards = pieces.map(r => {
            const locked = !r.zoneUnlocked;
            const qColor = rarityColor[r.quality] || '#aaa';
            const compStr = Object.entries(r.components).map(([comp,qty]) => {
                const have = (forgeData.mats[comp]?.qty||0);
                return `<span style="color:${have>=qty?'var(--green)':'var(--red-light)'}">${qty}× ${comp.replace(/_/g,' ')} (have ${have})</span>`;
            }).join(', ');
            const statStr = Object.entries(r.stats||{})
                .filter(([k,v]) => typeof v === 'number' && v !== 0)
                .map(([k,v]) => {
                    const label = {dmg_min:'Min',dmg_max:'Max',defense:'DEF',armor:'ARM',hp_max:'HP',strength:'STR',agility:'AGI',magic:'MAG',vitality:'VIT',hit_chance:'HIT',crit_chance:'CRIT',pyro_dmg:'🔥',water_dmg:'💧',wind_dmg:'🌀',electro_dmg:'⚡',pyro_resist:'🔥RES',water_resist:'💧RES',wind_resist:'🌀RES',electro_resist:'⚡RES'}[k]||k;
                    return `<span style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:0.65rem">${label} +${v}</span>`;
                }).join(' ');

            return `<div class="forge-card ${locked?'locked':''}" style="border-color:${r.owned?qColor+'66':'rgba(255,255,255,0.08)'}">
                ${r.owned ? `<div style="position:absolute;top:8px;right:8px;background:${qColor}22;border:1px solid ${qColor}55;border-radius:10px;padding:2px 8px;font-size:0.62rem;color:${qColor}">✓ OWNED</div>` : ''}
                <div class="forge-card-header">
                    <span style="font-size:1.3rem">${r.emoji||slotIcon[r.slot]||'⚔️'}</span>
                    <div>
                        <div style="display:flex;align-items:center;gap:6px">
                            <span class="forge-card-name">${r.name}</span>
                            <span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;background:${qColor}22;color:${qColor};border:1px solid ${qColor}44;text-transform:uppercase;font-weight:700">${r.quality}</span>
                        </div>
                        <div style="font-size:0.7rem;color:var(--text-dim)">${slotIcon[r.slot]||''} ${capitalize(r.slot)} · Lv.${r.level}</div>
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">${statStr}</div>
                ${locked
                    ? `<div style="font-size:0.75rem;color:var(--red-light);margin:4px 0">🔒 Complete a mission in ${(r.requiredZone||'').replace('_',' ')} first</div>`
                    : `<div class="forge-recipe" style="margin:4px 0">Components: ${compStr}</div>`}
                <div class="forge-cost">+ ${r.goldCost.toLocaleString()} gold</div>
                <button class="btn-forge ${r.owned?'btn-forge-owned':''}" onclick="craftItem('${r.id}')" ${r.canCraft&&!r.owned?'':'disabled'}>
                    ${locked?'🔒 Locked':r.owned?'✓ Already Crafted':r.canCraft?`⚒️ Craft ${r.name}`:'Missing materials'}
                </button>
            </div>`;
        }).join('');

        return `<div style="margin-bottom:32px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <span style="font-size:1.4rem">${setDef.emoji}</span>
                <div>
                    <div style="font-family:'Cinzel',serif;font-size:1rem;font-weight:700;color:var(--text-bright)">${setDef.name}</div>
                    <div style="font-size:0.72rem;color:var(--text-dim)">Collect all 5 pieces for full set bonuses</div>
                </div>
            </div>
            ${progressBar}
            ${bonusHtml}
            <div class="forge-grid">${pieceCards}</div>
        </div>`;
    }).join('');
}
async function refine(componentId) { try { const d=await api('POST','/game/forge/refine',{componentId}); showMsg('forge-msg',d.message); loadForge(); } catch(e) { showMsg('forge-msg',e.message,true); } }
async function craftItem(recipeId) { try { const d=await api('POST','/game/forge/craft',{recipeId}); showMsg('forge-msg',d.message); loadForge(); loadInventory(); } catch(e) { showMsg('forge-msg',e.message,true); } }

// ── Inventory ─────────────────────────────────────────────────────────────
async function loadInventory() {
    document.getElementById('inventory-content').innerHTML='<p class="loading">Loading...</p>';
    try { const d=await api('GET','/game/inventory'); renderInventory(d); }
    catch(e) { document.getElementById('inventory-content').innerHTML=`<p class="loading">${e.message}</p>`; }
}

function setInvTab(tab, btn) {
    invTab = tab;
    document.querySelectorAll('#tab-inventory .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadInventory();
}

function syncInvTabButtons() {
    const tabs = ['weapons', 'armor', 'helmets', 'shields', 'boots', 'jewelry', 'accessory', 'consumables', 'materials', 'lootboxes'];
    document.querySelectorAll('#tab-inventory .filter-btn').forEach((btn, i) => {
        btn.classList.toggle('active', tabs[i] === invTab);
    });
}

function renderGearGrid(el, gear, equipped) {
    window._invGearData = {};
    gear.forEach(i => {
        const d = typeof i.item_data === 'object' ? i.item_data : {};
        window._invGearData[i.id] = { ...i, equippedInSlot: equipped?.[d.slot] };
    });
    const equippedIds = Object.values(equipped || {}).map(e => e.inventoryId).filter(Boolean);
    el.innerHTML = `<div class="inv-hint">Hover/Click to inspect &nbsp;·&nbsp; Use buttons to equip/upgrade</div>
    <div class="inv-equipment-grid">${gear.map(i => {
        const d = typeof i.item_data === 'object' ? i.item_data : {};
        const isEquipped = equippedIds.includes(i.id);
        const upgradeLevel = i.upgrade_level || 0;
        const qc = d.quality==='legendary'?'inv-legendary':d.quality==='rare'?'inv-rare':'';
        const upgradeBadge = upgradeLevel > 0 ? `<div class="upgrade-badge">+${upgradeLevel}</div>` : '';
        
        return `
        <div class="inv-item-cell ${isEquipped?'inv-item-equipped ' : ''}${qc}" style="position:relative;">
            <div class="inv-item-icon" 
                 onmouseenter="showItemTooltip(event, ${i.id})" 
                 onmouseleave="scheduleHideTooltip()"
                 onclick="showItemTooltip(event, ${i.id})">${itemIcon(d,'64px')}</div>
            ${upgradeBadge}
            ${isEquipped ? '<div class="inv-item-equipped-dot"></div>' : ''}
            <div class="inv-item-name-label">${(d.name||'').split(' ').slice(-1)[0]}</div>
            <div class="inv-item-actions" style="display:flex; gap:4px; margin-top:5px;">
                <button class="btn-sm" style="font-size:0.6rem; padding:2px 6px;" onclick="event.stopPropagation(); toggleEquipItem(${i.id},'${d.slot}',${isEquipped})">${isEquipped ? 'Unequip' : 'Equip'}</button>
                ${upgradeLevel < 5 ? `<button class="btn-sm" style="font-size:0.6rem; padding:2px 6px; background:rgba(155,89,182,0.2);" onclick="event.stopPropagation(); openUpgradeModal(${i.id})">⬆️ Upgrade</button>` : ''}
            </div>
        </div>`;
    }).join('')}</div>
    <div id="inv-msg" class="msg-bar hidden" style="margin-top:12px"></div>`;
}

async function upgradeItem(inventoryId) {
    try {
        // First, get available components from inventory
        const invData = await api('GET', '/game/inventory');
        const item = invData.items.find(i => i.id === inventoryId);
        if (!item) return;
        
        const itemData = item.item_data;
        const currentUpgrade = item.upgrade_level || 0;
        
        if (currentUpgrade >= 5) {
            showMsg('inv-msg', 'Item already at max upgrade level (+5)!', true);
            return;
        }
        
        // Get all components
        const components = invData.items.filter(i => i.item_type === 'component');
        
        if (components.length === 0) {
            showMsg('inv-msg', 'You need components to upgrade! Craft them in the forge.', true);
            return;
        }
        
        // Build simple component selection
        let componentList = '';
        const componentOptions = {};
        components.forEach((comp, idx) => {
            const compData = comp.item_data;
            componentList += `${idx + 1}. ${compData.name} (x${compData.qty || 1})\n`;
            componentOptions[idx + 1] = compData.id;
        });
        
        const choice = prompt(`Select a component to upgrade ${itemData.name}:\n\n${componentList}\n\nEnter number (1-${components.length}):`);
        if (!choice) return;
        
        const selectedComponentId = componentOptions[parseInt(choice)];
        if (!selectedComponentId) {
            showMsg('inv-msg', 'Invalid selection!', true);
            return;
        }
        
        // Let backend handle everything
        const result = await api('POST', `/game/equipment/upgrade/${inventoryId}`, { componentId: selectedComponentId });
        
        if (result.success) {
            let message = result.message;
            if (result.upgradedStats && result.upgradedStats.length > 0) {
                message += `\n\nStats improved:\n`;
                result.upgradedStats.forEach(s => {
                    const statName = s.stat.replace(/_/g, ' ');
                    message += `• ${statName}: ${s.oldValue} → ${s.newValue} (+${s.increase})\n`;
                });
            }
            showMsg('inv-msg', message);
            loadInventory();
            if (typeof renderCharacter === 'function') renderCharacter();
        } else {
            showMsg('inv-msg', result.message, true);
        }
    } catch (error) {
        console.error('Upgrade error:', error);
        showMsg('inv-msg', error.message, true);
    }
}
function renderInventory(data) {
    const el = document.getElementById('inventory-content');

    function getSlot(i) {
        const d = typeof i.item_data === 'object' ? i.item_data : {};
        return d.slot || '';
    }
    
    // Helper to check if item is a loot box
    const isLootBox = (item) => item.item_data?.category === 'lootbox';
    
    // Helper to get item image path - CORRECTED: /images/assets/item-name.png
    const getItemImage = (itemName) => {
        if (!itemName) return '';
        const imageName = itemName.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `/images/assets/${imageName}.png`;
    };

    const gearTab = (slots, emptyMsg) => {
        const gear = data.items.filter(i => i.item_type === 'equipment' && slots.includes(getSlot(i)));
        if (!gear.length) { el.innerHTML = `<p class="empty">${emptyMsg}</p>`; return; }
        renderGearGrid(el, gear, data.equipped);
    };

    if      (invTab === 'weapons')    gearTab(['weapon'],          'No weapons yet.');
    else if (invTab === 'armor')      gearTab(['armor'],           'No armor yet.');
    else if (invTab === 'helmets')    gearTab(['helmet'],          'No helmets yet.');
    else if (invTab === 'shields')    gearTab(['shield'],          'No shields yet.');
    else if (invTab === 'boots')      gearTab(['boots'],           'No boots yet.');
    else if (invTab === 'jewelry')    gearTab(['ring','amulet'],   'No rings or amulets yet.');
    else if (invTab === 'accessory')  gearTab(['accessory'],       'No accessories yet.');
    else if (invTab === 'lootboxes') {
        // LOOT BOXES TAB with image support
        const lootBoxes = data.items.filter(i => i.item_type === 'consumable' && isLootBox(i));
        if (!lootBoxes.length) {
            el.innerHTML = '<p class="empty">No loot boxes. Buy them from the shop!</p>';
            return;
        }
        el.innerHTML = '<div class="inv-grid">' + lootBoxes.map(i => {
            const d = i.item_data;
            const sp = Math.max(1, Math.floor((d.price || 0) * 0.3));
            const itemImage = d.image || getItemImage(d.name);
            return `<div class="inv-card">
                <div class="inv-card-header">
                    <img src="${itemImage}" style="width:36px;height:36px;object-fit:contain;border-radius:8px" onerror="this.style.display='none';this.nextSibling.style.display='inline'">
                    <span style="font-size:1.4rem;display:none">${d.emoji || '🎁'}</span>
                    <span class="inv-card-name">${d.name}</span>
                    <span style="font-size:0.75rem;color:var(--text-dim);margin-left:auto">×${d.qty || 1}</span>
                </div>
                <div class="inv-stat-str">${d.desc}</div>
                <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="btn-primary" style="flex:1" onclick="openLootBox(${i.id}, '${d.name.replace(/'/g, "\\'")}')">🎁 Open</button>
                    <button class="btn-sm danger" onclick="sellItem(${i.id}, '${d.name.replace(/'/g, "\\'")}', ${sp})">Sell ${sp}g</button>
                </div>
            </div>`;
        }).join('') + '</div>';
        return;
    }
    else if (invTab === 'consumables') {
        // CONSUMABLES TAB with image support (excluding loot boxes)
        const cons = data.items.filter(i => i.item_type === 'consumable' && !isLootBox(i));
        if (!cons.length) { el.innerHTML = '<p class="empty">No consumables. Buy potions from the Shop!</p>'; return; }
        el.innerHTML = '<div class="inv-grid">' + cons.map(i => {
            const d = i.item_data;
            const eff = d.effect ? (
                d.effect.type==='heal'      ? '❤️ Restore '+d.effect.value+' HP' :
                d.effect.type==='heal_full' ? '❤️ Full HP restore' :
                d.effect.type==='xp'        ? '⭐ +'+d.effect.value+' XP' :
                d.effect.type==='temp_stat' ? '💪 +'+d.effect.value+' '+d.effect.stat : ''
            ) : '';
            const sp = Math.max(1, Math.floor((d.price||0)*0.3));
            const sn = (d.name||'').replace(/'/g,"\\'");
            const itemImage = d.image || getItemImage(d.name);
            return '<div class="inv-card">'
                +'<div class="inv-card-header">'
                +'<img src="'+itemImage+'" style="width:36px;height:36px;object-fit:contain;border-radius:8px" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'inline\'">'
                +'<span style="font-size:1.4rem;display:none">'+(d.emoji||'🧪')+'</span>'
                +'<span class="inv-card-name">'+(d.name||'')+'</span>'
                +'<span style="font-size:0.75rem;color:var(--text-dim);margin-left:auto">×'+(d.qty||1)+'</span>'
                +'</div>'
                +'<div class="inv-stat-str">'+eff+'</div>'
                +'<div class="inv-slot" style="font-size:0.75rem;color:var(--text-dim);margin:4px 0 10px">'+(d.desc||'')+'</div>'
                +'<div style="display:flex;gap:8px">'
                +'<button class="btn-sm" style="flex:1;background:rgba(39,174,96,0.15);border-color:rgba(39,174,96,0.4);color:#2ecc71" onclick="useItem('+i.id+',\''+sn+'\')">Use</button>'
                +'<button class="btn-sm danger" onclick="sellItem('+i.id+',\''+sn+'\','+sp+')">Sell '+sp+'g</button>'
                +'</div></div>';
        }).join('') + '</div>';
    } else {
        // MATERIALS TAB with image support
        const mats = data.items.filter(i => i.item_type==='raw_mat' || i.item_type==='component');
        if (!mats.length) { el.innerHTML = '<p class="empty">No materials yet. Complete missions to gather resources!</p>'; return; }
        el.innerHTML = '<div class="mat-grid">' + mats.map(i => {
            const d = i.item_data;
            const itemImage = d.image || getItemImage(d.name);
            return '<div class="mat-card">'
                +'<img src="'+itemImage+'" style="width:48px;height:48px;object-fit:contain;margin-bottom:8px;border-radius:12px" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'">'
                +'<div style="font-size:1.6rem;display:none">'+(d.emoji||'📦')+'</div>'
                +'<div class="mat-name">'+(d.name||d.id)+'</div>'
                +'<div class="mat-qty">× '+(d.qty||1)+'</div>'
                +'<div class="mat-type" style="color:var(--text-dim);font-size:0.7rem">'+(i.item_type==='component'?'Component':'Raw Material')+'</div>'
                +'</div>';
        }).join('') + '</div>';
    }
}
let _hideTooltipTimer=null;
function scheduleHideTooltip(){ _hideTooltipTimer=setTimeout(hideItemTooltip,150); }
function cancelHideTooltip(){ if(_hideTooltipTimer){clearTimeout(_hideTooltipTimer);_hideTooltipTimer=null;} }
// ── Open Loot Box ─────────────────────────────────────────────────────────
function showItemTooltip(event, itemId) {
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    const info = window._invGearData?.[itemId];
    if (!info) return;
    const d = info.item_data, eq = info.equippedInSlot, isEquipped = info.equipped;
    const allStats = new Set([...Object.keys(d.stats||{}),...Object.keys(eq?.stats||{})].filter(k=>!k.includes('type')));
    const qColor = {legendary:'#ffd700',rare:'#9b59b6',common:'rgba(255,255,255,0.5)'}[d.quality||'common'];
    const imgSrc = d.img||(d.name&&!d.consumable?`/images/assets/${d.name.toLowerCase().replace(/\s+/g,'-')}.png`:null);

    let statsHtml = '';
    for (const stat of allStats) {
        if (stat === 'elem_dmg' || stat === 'elem_dmg_type' || stat === 'elem_resist') continue;
        const nv = d.stats?.[stat]||0, ov = eq?.stats?.[stat]||0, diff = nv - ov;
        const dc = diff>0?'#2ecc71':diff<0?'#e74c3c':'rgba(255,255,255,0.3)';
        const ds = diff>0?'▲'+diff:diff<0?'▼'+Math.abs(diff):'';
        const label = STAT_LABELS[stat] || stat.replace(/_/g,' ');
        statsHtml += `<div class="tt-stat"><span class="tt-stat-name">${label}</span><span class="tt-stat-val">${nv}</span>${eq&&!isEquipped&&ds?`<span style="font-size:0.68rem;color:${dc}">${ds}</span>`:''}</div>`;
    }

    const sp = Math.max(1, Math.floor((d.price||0)*0.3));
    const sn = (d.name||'').replace(/'/g,"\\'");

    tooltip.innerHTML = `
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
    const r = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = '-9999px'; tooltip.style.top = '-9999px';
    const tw = tooltip.offsetWidth||220, th = tooltip.offsetHeight||340;
    let left = r.right+12, top = r.top;
    if (left+tw>window.innerWidth-8) left = r.left-tw-12;
    if (top+th>window.innerHeight-8) top = window.innerHeight-th-8;
    tooltip.style.left = Math.max(8,left)+'px';
    tooltip.style.top  = Math.max(8,top)+'px';
}

function hideItemTooltip() { const t=document.getElementById('item-tooltip'); if(t) t.classList.add('hidden'); }

function showShopItemTooltip(event, itemJson) {
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    let item; try { item = typeof itemJson === 'string' ? JSON.parse(itemJson) : itemJson; } catch { return; }
    const qColor = {legendary:'#ffd700', rare:'#9b59b6', common:'rgba(255,255,255,0.5)'}[item.quality||'common'];
    const imgSrc = item.img || (item.name && !item.consumable ? `/images/assets/${item.name.toLowerCase().replace(/\s+/g,'-')}.png` : null);

    // Find currently equipped item in the same slot for comparison
    let slot = item.slot || item.category;
    let equipped = null;
    let equippedSlotName = '';
    
    // FIX: For rings and amulets, treat them as the same slot
    if (slot === 'ring' || slot === 'amulet') {
        // Check both slots for ANY jewelry
        if (character?.equipped?.ring) {
            equipped = character.equipped.ring;
            equippedSlotName = 'ring';
        } else if (character?.equipped?.amulet) {
            equipped = character.equipped.amulet;
            equippedSlotName = 'amulet';
        }
    } else {
        equipped = character?.equipped?.[slot] || null;
        equippedSlotName = slot;
    }
    
    const allStats = new Set([
        ...Object.keys(item.stats||{}),
        ...Object.keys(equipped?.stats||{})
    ].filter(k => !k.includes('type') && k !== 'elem_dmg' && k !== 'elem_dmg_type' && k !== 'elem_resist'));

    let statsHtml = '';
    for (const stat of allStats) {
        const nv = item.stats?.[stat] || 0;
        const ov = equipped?.stats?.[stat] || 0;
        const diff = nv - ov;
        const dc = diff > 0 ? '#2ecc71' : diff < 0 ? '#e74c3c' : 'rgba(255,255,255,0.3)';
        const ds = diff > 0 ? '▲'+diff : diff < 0 ? '▼'+Math.abs(diff) : '';
        const label = STAT_LABELS[stat] || stat.replace(/_/g,' ');
        statsHtml += `<div class="tt-stat"><span class="tt-stat-name">${label}</span><span class="tt-stat-val">${nv}</span>${equipped && ds ? `<span style="font-size:0.68rem;color:${dc}">${ds}</span>` : ''}</div>`;
    }

    // Consumable effect line
    let effectHtml = '';
    if (item.effect) {
        const e = item.effect;
        let label = '';
        if (e.type==='heal')               label = `❤️ Restore ${e.value} HP`;
        else if (e.type==='heal_full')     label = '❤️ Full HP restore';
        else if (e.type==='temp_stat')     label = `💪 +${e.value} ${capitalize(e.stat||'')}`;
        else if (e.type==='xp_multiplier') label = `${e.value}× XP boost`;
        else if (e.type==='gold_multiplier') label = `${e.value}× Gold boost`;
        else if (e.type==='xp')            label = `⭐ +${e.value} XP`;
        if (label) effectHtml = `<div class="tt-stat"><span class="tt-stat-name">Effect</span><span class="tt-stat-val" style="color:#2ecc71">${label}</span></div>`;
    }

    const bodyStats = statsHtml || effectHtml
        ? `${statsHtml}${effectHtml}`
        : '<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>';

    // Build the comparison text
    let vsText = '';
    if (slot === 'ring' || slot === 'amulet') {
        if (equipped) {
            vsText = `<div class="tt-vs">vs equipped ${equippedSlotName}: <strong>${equipped.name}</strong></div>`;
        } else {
            vsText = `<div class="tt-vs" style="color:rgba(255,255,255,0.25)">No jewelry currently equipped</div>`;
        }
    } else {
        vsText = equipped
            ? `<div class="tt-vs">vs equipped: <strong>${equipped.name}</strong></div>`
            : `<div class="tt-vs" style="color:rgba(255,255,255,0.25)">Nothing equipped in this slot</div>`;
    }

    tooltip.innerHTML = `
        <div class="tt-preview">
            ${imgSrc
                ? `<img src="${imgSrc}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="tt-preview-emoji" style="display:none">${item.emoji||'📦'}</span>`
                : `<span class="tt-preview-emoji">${item.emoji||'📦'}</span>`}
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${item.name||''}</div>
            <div class="tt-meta">${capitalize(slot||'item')}${item.quality&&item.quality!=='common'?` · <span style="color:${qColor}">${item.quality}</span>`:''}</div>
            ${item.desc ? `<div class="tt-desc">${item.desc}</div>` : ''}
            <div class="tt-stats">${bodyStats}</div>
            ${vsText}
        </div>`;

    tooltip.classList.remove('hidden');
    const r = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = '-9999px'; tooltip.style.top = '-9999px';
    const tw = tooltip.offsetWidth||220, th = tooltip.offsetHeight||320;
    let left = r.right + 12, top = r.top;
    if (left + tw > window.innerWidth - 8) left = r.left - tw - 12;
    if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top  = Math.max(8, top)  + 'px';
}

function showEqTooltip(event, itemJson) {
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    let item; try { item = typeof itemJson==='string'?JSON.parse(itemJson):itemJson; } catch { return; }
    const qColor = {legendary:'#ffd700',rare:'#9b59b6',common:'rgba(255,255,255,0.5)'}[item.quality||'common'];
    const imgSrc = item.img||(item.name?`/images/assets/${item.name.toLowerCase().replace(/\s+/g,'-')}.png`:null);

    let statsHtml = Object.entries(item.stats||{})
        .filter(([k]) => k !== 'elem_dmg' && k !== 'elem_dmg_type' && k !== 'elem_resist')
        .filter(([,v]) => typeof v === 'number' && v !== 0)
        .map(([k,v]) => {
            const label = STAT_LABELS[k] || k.replace(/_/g,' ');
            return `<div class="tt-stat"><span class="tt-stat-name">${label}</span><span class="tt-stat-val" style="color:${v>0?'#2ecc71':'#e74c3c'}">${v>0?'+':''}${v}</span></div>`;
        }).join('');

    tooltip.innerHTML = `
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
    const r = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = '-9999px'; tooltip.style.top = '-9999px';
    const tw = tooltip.offsetWidth||220, th = tooltip.offsetHeight||300;
    let left = r.right+12, top = r.top;
    if (left+tw>window.innerWidth-8) left = r.left-tw-12;
    if (top+th>window.innerHeight-8) top = window.innerHeight-th-8;
    tooltip.style.left = Math.max(8,left)+'px';
    tooltip.style.top  = Math.max(8,top)+'px';
}

function toggleEquipItem(invId, slot, isEquipped) { hideItemTooltip(); if(isEquipped) unequipSlot(slot); else equipItem(invId); }
async function equipItem(invId) {
    try {
        const invData = await api('GET', '/game/inventory');
        const item = invData.items.find(i => i.id === invId);
        if (!item) throw new Error('Item not found');
        
        const slot = item.item_data.slot;
        
        // If it's a ring or amulet, unequip the other jewelry slot first
        if (slot === 'ring' || slot === 'amulet') {
            const otherSlot = slot === 'ring' ? 'amulet' : 'ring';
            // Check if character.equipped exists and if the other slot has an item
            if (character?.equipped && character.equipped[otherSlot]) {
                const otherItem = character.equipped[otherSlot];
                // Unequip the other jewelry slot first
                await api('POST', `/game/unequip/${otherSlot}`);
                console.log(`🔄 Replaced ${otherItem.name} with new item`);
            }
        }
        
        // Now equip the new item
        await api('POST', `/game/equip/${invId}`);
        loadInventory();
        character = await api('GET', '/game/character');
        renderCharacter();
        showMsg('inv-msg', 'Equipped!');
    } catch(e) { 
        console.error('Equip error:', e);
        showMsg('inv-msg', e.message, true); 
    }
}
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

    const filtered = currentShopCategory === 'all' ? shopInventory : shopInventory.filter(item => {
        const slot = item.slot || item.category || '';
        const cat  = item.category || '';
        if (currentShopCategory === 'weapons')   return slot === 'weapon';
        if (currentShopCategory === 'armor')     return slot === 'armor';
        if (currentShopCategory === 'helmets')   return slot === 'helmet';
        if (currentShopCategory === 'shields')   return slot === 'shield';
        if (currentShopCategory === 'boots')     return slot === 'boots';
        if (currentShopCategory === 'jewelry')   return slot === 'ring' || slot === 'amulet';
        if (currentShopCategory === 'accessory') return slot === 'accessory';
        if (currentShopCategory === 'consumables') return !!(item.consumable || cat === 'consumable');
        if (currentShopCategory === 'premium')   return item.priceType === 'gems' || cat === 'premium';
        if (currentShopCategory === 'lootboxes') return item.category === 'lootbox';
        return false;
    });

    if (!filtered.length) { el.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim)">No items in this category.</div>`; return; }
    el.innerHTML=filtered.map(item=>{
        const pt=item.priceType||'gold', ci=pt==='gems'?'💎':'💰', cc=pt==='gems'?'#9b59b6':'var(--gold)';
        const gemCost = item.gemCost || 0;
        const isAvail=character.level>=(item.level||1), classOk=!item.classes||item.classes.includes(character.class);
        const hasEnoughGold = pt==='gems' ? (character.gems||0)>=item.price : character.gold>=item.price;
        const hasEnoughGems = gemCost === 0 || (character.gems||0) >= gemCost;
        const hasEnough = hasEnoughGold && hasEnoughGems;
        let cardClass='shop-card';
        if(!isAvail)cardClass+=' locked-future';
        if(!classOk)cardClass+=' class-locked';
        if(item.quality==='legendary')cardClass+=' legendary';
        else if(item.quality==='rare')cardClass+=' rare';

        const statsHtml = item.stats ? Object.entries(item.stats)
            .filter(([k]) => k !== 'elem_dmg' && k !== 'elem_dmg_type' && k !== 'elem_resist')
            .filter(([,v]) => typeof v === 'number' && v !== 0)
            .map(([k,v]) => {
                const label = STAT_LABELS[k] || k.replace(/_/g,' ');
                return `<div class="shop-card-stat"><span class="shop-card-stat-label">${label}</span><span class="shop-card-stat-value ${v>0?'positive':'negative'}">${v>0?'+':''}${v}</span></div>`;
            }).join('') : '';

        const elemHtml = '';

        const effectHtml=item.effect?(()=>{
            const e=item.effect; let label='';
            if(e.type==='heal') label=`Heals ${e.value} HP`;
            else if(e.type==='heal_full') label='Restores 100% HP';
            else if(e.type==='temp_stat') label=`+${e.value} ${capitalize(e.stat||'')}`;
            else if(e.type==='xp_multiplier') label=`${e.value}× XP boost`;
            else if(e.type==='gold_multiplier') label=`${e.value}× Gold boost`;
            else if(e.type==='xp') label=`+${e.value} XP`;
            else label=`${e.type}${e.value?' '+e.value:''}`;
            return `<div class="shop-card-stat"><span class="shop-card-stat-label">Effect</span><span class="shop-card-stat-value positive">${label}</span></div>`;
        })():'';

        const shopItemData = escHtml(JSON.stringify(item));
        return `<div class="${cardClass}">${pt==='gems'&&!item.gemCost?'<span class="premium-badge">💎 PREMIUM</span>':item.gemCost?'<span class="premium-badge" style="background:linear-gradient(135deg,#0d6e3a,#1abc9c)">✨ GEM DEAL</span>':''}${item.quality==='legendary'?'<span class="legendary-badge">👑 LEGENDARY</span>':''}
            <div class="shop-card-header" onmouseenter="showShopItemTooltip(event,this.dataset.shopitem)" onmouseleave="scheduleHideTooltip()" data-shopitem="${shopItemData}">
                <span class="shop-card-icon">${itemIcon(item,'2rem')}</span>
                <span class="shop-card-name">${item.name}</span>
                <span class="shop-card-tier">Lv.${item.level||1}</span>
            </div>
            <div class="shop-card-desc">${item.desc}</div>
            <div class="shop-card-requirements ${isAvail&&classOk?'met':'not-met'}">${!isAvail?`<div>🔒 Required: Level ${item.level}</div>`:''} ${item.classes?`<div>📋 Classes: ${item.classes.join('/')}</div>`:''}</div>
            ${statsHtml||elemHtml?`<div class="shop-card-stats">${statsHtml}${elemHtml}${effectHtml}</div>`:''}
            <div class="shop-card-footer">
                <div style="display:flex;flex-direction:column;gap:2px">
                    <span class="shop-card-price" style="color:${cc}">${ci} ${item.price.toLocaleString()}${gemCost?` <span style="color:#9b59b6">+ ${gemCost}💎</span>`:''}</span>
                </div>
                <button class="btn-shop" onclick="buyItem('${item.id}')" ${isAvail&&classOk&&hasEnough?'':'disabled'}>${
                    !isAvail ? `Level ${item.level}` :
                    !classOk ? 'Class Locked' :
                    !hasEnoughGold ? `Need ${item.price - (pt==='gems'?(character.gems||0):character.gold)} more` :
                    !hasEnoughGems ? `Need ${gemCost-(character.gems||0)} 💎` :
                    'Buy'
                }</button>
            </div>
        </div>`;
    }).join('');
}
async function buyItem(itemId) {
    const item=shopInventory.find(i=>i.id===itemId); if(!item){showMsg('shop-msg','Item not found!',true);return;}
    const pt=item.priceType||'gold';
    const gemCost=item.gemCost||0;
    if (character.level<(item.level||1)){showMsg('shop-msg',`Requires level ${item.level}!`,true);return;}
    if (item.classes&&!item.classes.includes(character.class)){showMsg('shop-msg',`Not available for ${capitalize(character.class)}!`,true);return;}
    if (pt==='gems'&&(character.gems||0)<item.price){showMsg('shop-msg','Not enough gems!',true);return;}
    if (pt!=='gems'&&character.gold<item.price){showMsg('shop-msg','Not enough gold!',true);return;}
    if (gemCost>0&&(character.gems||0)<gemCost){showMsg('shop-msg',`This item also costs ${gemCost} 💎 — not enough gems!`,true);return;}
    if(item._buying){showMsg('shop-msg','Purchase already in progress...',true);return;}
    item._buying=true;
    try {
        await api('POST','/game/shop/buy',{itemId:item.id,category:item.category||item.slot||'weapon',price:item.price,priceType:pt,item});
        
        // Refresh character properly from the game endpoint instead of using result.character
        const refreshedChar = await api('GET','/game/character');
        character = refreshedChar;
        
        shopInventory=shopInventory.filter(i=>i.id!==itemId);
        showMsg('shop-msg',`✅ ${item.name} purchased and added to your inventory!`);
        renderShop(); 
        renderTopBar();
        renderCharacter(); // Force re-render character sheet with correct HP
        
        if (item.consumable) { 
            invTab='consumables'; 
            loadInventory(); 
        }
    } catch(e) { 
        item._buying=false; 
        showMsg('shop-msg',e.message,true); 
    }
}
function setShopCategory(category, btn) {
    currentShopCategory = category;
    document.querySelectorAll('.shop-tabs .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderShop();
}
async function refreshShop() { if(!character)return; shopInventory=await generateShopInventory(character.level); renderShop(); }
async function generateShopInventory(playerLevel) { try { const r=await api('GET','/game/shop/items'); return r.items; } catch { return []; } }

// ── Premium ───────────────────────────────────────────────────────────────
async function loadPremium() {
    const el = document.getElementById('premium-content');
    if (!el) return;
    el.innerHTML = '<p class="loading">Loading...</p>';
    try {
        const data = await api('GET', '/game/premium/features');
        renderPremium(data);
    } catch(e) { el.innerHTML = `<p class="loading">${e.message}</p>`; }
}

function renderPremium(data) {
    const el = document.getElementById('premium-content');
    if (!el) return;
    const { features, synergies, ultimate, gems } = data;
    const activeCount = features.filter(f => f.active).length;
    const now = Math.floor(Date.now() / 1000);

    const ultimateBanner = ultimate ? `
        <div style="background:linear-gradient(135deg,rgba(241,196,15,0.15),rgba(155,89,182,0.15));border:1px solid rgba(241,196,15,0.4);border-radius:12px;padding:16px 20px;margin-bottom:20px;text-align:center">
            <div style="font-size:1.5rem;margin-bottom:4px">🌟 ASCENDANT</div>
            <div style="font-size:0.82rem;color:var(--gold);font-weight:600">All 6 features active · +50% XP from all sources · +1% to all stats</div>
        </div>` : (activeCount >= 2 ? `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:0.78rem;color:var(--text-dim)">
            ${activeCount}/6 features active${synergies.length ? ` · <span style="color:var(--gold)">${synergies.map(s=>`${s.emoji} ${s.name}`).join(', ')} synergy active!</span>` : ' · Activate more for synergy bonuses'}
        </div>` : `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:0.78rem;color:var(--text-dim)">
            ${activeCount}/6 features active · Activate all 6 for the 🌟 Ascendant ultimate bonus
        </div>`);

    const synergyHtml = synergies.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
            ${synergies.map(s => `
            <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(241,196,15,0.08);border:1px solid rgba(241,196,15,0.3);border-radius:20px;font-size:0.76rem;color:var(--gold)">
                ${s.emoji} <strong>${s.name}</strong> · ${s.desc}
            </div>`).join('')}
        </div>` : '';

    const cardsHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
        ${features.map(f => {
            const isActive = f.active;
            const daysLeft = isActive ? Math.ceil(f.expiresIn / 86400) : 0;
            const borderColor = isActive ? 'rgba(241,196,15,0.5)' : 'var(--border)';
            const bg = isActive ? 'linear-gradient(145deg,rgba(241,196,15,0.08),rgba(241,196,15,0.04))' : 'linear-gradient(145deg,var(--bg2),var(--bg3))';
            return `<div style="background:${bg};border:1px solid ${borderColor};border-radius:var(--radius);padding:18px;position:relative;overflow:hidden">
                ${isActive ? `<div style="position:absolute;top:8px;right:8px;background:rgba(241,196,15,0.15);border:1px solid rgba(241,196,15,0.4);border-radius:10px;padding:2px 8px;font-size:0.62rem;color:var(--gold);font-weight:700">${daysLeft}d left</div>` : ''}
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                    <span style="font-size:2rem">${f.emoji}</span>
                    <div>
                        <div style="font-family:'Cinzel',serif;font-size:0.9rem;font-weight:700;color:var(--text-bright)">${f.name}</div>
                        <div style="font-size:0.62rem;color:var(--gold)">${f.cost} 💎 / 30 days</div>
                    </div>
                </div>
                <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:14px;line-height:1.5">${f.desc}</div>
                <button onclick="activatePremium('${f.id}')"
                    style="width:100%;padding:8px;border-radius:var(--radius-sm);border:1px solid ${isActive ? 'rgba(241,196,15,0.4)' : 'rgba(155,89,182,0.4)'};background:${isActive ? 'rgba(241,196,15,0.1)' : 'rgba(155,89,182,0.12)'};color:${isActive ? 'var(--gold)' : '#9b59b6'};font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.15s"
                    ${gems < f.cost && !isActive ? 'disabled' : ''}>
                    ${isActive ? `✅ Active · Renew for ${f.cost} 💎` : (gems >= f.cost ? `✨ Activate · ${f.cost} 💎` : `Need ${f.cost - gems} more 💎`)}
                </button>
            </div>`;
        }).join('')}
    </div>`;

    el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:10px 14px;background:rgba(155,89,182,0.08);border:1px solid rgba(155,89,182,0.25);border-radius:var(--radius-sm)">
            <span style="font-size:0.82rem;color:var(--text-dim)">Your gems</span>
            <span style="font-size:1.1rem;font-weight:700;color:#9b59b6">💎 ${gems.toLocaleString()}</span>
        </div>
        ${ultimateBanner}
        ${synergyHtml}
        ${cardsHtml}`;
}

async function activatePremium(featureId) {
    try {
        const d = await api('POST', '/game/premium/activate', { featureId });
        character = d.character;
        renderTopBar();
        showMsg('premium-msg', d.message);
        loadPremium();
    } catch(e) { showMsg('premium-msg', e.message, true); }
}

// ── Shop Reroll ────────────────────────────────────────────────────────────
async function rerollShop() {
    if (!character) return;
    if ((character.gems || 0) < 1) { showMsg('shop-msg', 'Need 1 💎 gem to reroll the shop!', true); return; }
    if (!confirm('Reroll the entire shop for 1 💎?')) return;
    try {
        const d = await api('POST', '/game/shop/reroll');
        shopInventory = d.items;
        character.gems = d.newGems;
        renderTopBar();
        renderShop();
        showMsg('shop-msg', d.message);
    } catch(e) { showMsg('shop-msg', e.message, true); }
}

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
        // REMOVE the fallback - only use total_gold_earned
        const totalEarned = p.total_gold_earned || 0;
        return `<div class="lb-row" onclick="openProfile(${p.id})">
            <div class="lb-rank ${rc}">${rs}</div>
            <img src="/images/class/${p.class}.png" alt="${p.class}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.12);flex-shrink:0" onerror="this.style.display='none'">
            <div class="lb-info"><div class="lb-name">${p.name}${p.username===username?' <span style="color:var(--gold);font-size:0.7rem">(you)</span>':''}</div><div class="lb-sub">Lv.${p.level} ${capitalize(p.class)} · @${p.username}</div></div>
            <div class="lb-stats">
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--green)">${p.wins}</div><div class="lb-stat-lbl">WON</div></div>
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--red-light)">${p.losses}</div><div class="lb-stat-lbl">LOST</div></div>
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--gold)">💰 ${totalEarned.toLocaleString()}</div><div class="lb-stat-lbl">EARNED</div></div>
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

        const profileResolvedEq = { ...eq, amulet: eq.amulet || eq.ring || null };
        const profileSlots=[
            {slot:'helmet', icon:'⛑️', col:1, row:1},
            {slot:'armor',  icon:'🛡️', col:1, row:2},
            {slot:'weapon', icon:'⚔️', col:1, row:3},
            {slot:'amulet', icon:'📿', col:3, row:1},
            {slot:'shield', icon:'🛡',  col:3, row:2},
            {slot:'boots',  icon:'👢', col:3, row:3},
        ];
const profileEqHtml =
    `<div style="grid-column:2;grid-row:1/4;display:flex;align-items:center;justify-content:center;">
        <img src="/images/class/${p.class}.png" style="width:240px;height:210px;object-fit:contain;object-position:center top" onerror="this.style.opacity='0'">
    </div>`
    + profileSlots.map(({slot,icon,col,row}) => {
        const item = profileResolvedEq[slot];
        const sq = `grid-column:${col};grid-row:${row};width:80px;height:80px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px;position:relative;overflow:hidden;transition:all 0.15s;cursor:default;`;
        if (!item) return `<div style="${sq}background:rgba(255,255,255,0.025);border:1px dashed rgba(255,255,255,0.1)"><span style="font-size:1.5rem;opacity:0.2">${icon}</span></div>`;
        const qc = item.quality === 'legendary' ? '#f1c40f' : item.quality === 'rare' ? '#9b59b6' : 'rgba(255,255,255,0.5)';
        const itemData = escHtml(JSON.stringify(item));
        return `<div style="${sq}background:rgba(255,255,255,0.04);border:1px solid ${qc}33;"
            data-item="${itemData}"
            onmouseenter="this.style.background='rgba(255,255,255,0.09)';this.style.transform='translateY(-2px)';showEqTooltip(event,this.dataset.item)"
            onmouseleave="this.style.background='rgba(255,255,255,0.04)';this.style.transform='';scheduleHideTooltip()"
        >
            ${itemIcon(item, '60px')}
        </div>`;
    }).join('');

        const smallSlots = [['accessory','🔮','Accessory']];
        const smallSlotsHtml = smallSlots.map(([slot,icon,label]) => {
            const item = eq[slot];
            if (!item) return `<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;border:1px dashed rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);font-size:0.7rem;color:rgba(255,255,255,0.25)">${icon} ${label}</div>`;
            const qc=item.quality==='legendary'?'#f1c40f':item.quality==='rare'?'#9b59b6':'rgba(255,255,255,0.5)';
            const itemData=escHtml(JSON.stringify(item));
            return `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;border:1px solid ${qc}33;background:rgba(255,255,255,0.03);cursor:default"
                data-item="${itemData}"
                onmouseenter="showEqTooltip(event,this.dataset.item)" onmouseleave="scheduleHideTooltip()">
                ${itemIcon(item,'1.2rem')}
                <span style="color:${qc};font-size:0.7rem">${item.name}</span>
                <span style="color:rgba(255,255,255,0.25);font-size:0.65rem">· ${label}</span>
            </div>`;
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
        <div style="display:grid;grid-template-columns:80px 160px 80px;grid-template-rows:repeat(3,80px);gap:6px;align-items:center;justify-content:center;margin:0 auto;width:fit-content">${profileEqHtml}</div>
        ${smallSlotsHtml?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${smallSlotsHtml}</div>`:''}
      </div>`:''}
      ${!isMe ? (() => {
            // FIX: Check per-target cooldown (12h) BEFORE global cooldown (1h).
            // ptc = your specific cooldown against this player (12h after attacking them)
            // gc  = their global protection cooldown (1h, applies to all attackers)
            // By checking ptc first, the profile correctly shows "Cooldown 12h" to the
            // attacker who just hit them, rather than being hidden behind the 1h gc display.
            const gc=p.globalCooldown||0, ptc=p.perTargetCooldown||0, hpLow=p.hpLow;
            const myBattleCd=character?.battle_cooldown_remaining||0;
            let blocked=false, reason='';
            if(hpLow){blocked=true;reason='Too little HP';}
            else if(ptc>0){blocked=true;const h=Math.ceil(ptc/3600),m=Math.ceil(ptc/60);reason='Cooldown '+(h>=1?h+'h':m+'m');}
            else if(gc>0){blocked=true;const h=Math.ceil(gc/3600),m=Math.ceil(gc/60);reason='Recovery '+(h>=1?h+'h':m+'m');}
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
        if (!p) { if (box) box.innerHTML = '<p class="empty">No available opponents right now.</p>'; return; }
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
    } catch(e) { if (box) box.innerHTML = `<p class="empty">${e.message}</p>`; }
}
async function attack(targetId,targetName) {
    if ((character?.hp_current??character?.hp_max)<=0){alert('You are out of HP! Wait for regeneration.');return;}
    try { const r=await api('POST',`/game/attack/${targetId}`); character=r.character; renderTopBar(); showBattleResult(r,targetName); }
    catch(e) { alert(e.message); }
}
function showBattleResult(r, targetName) {
    const summary = r.won
        ? `+${r.goldGained} gold · +${r.xpGained} XP`
        : `-${r.goldLost} gold`;
    showBattleReportModal(r.log, r.won, summary, r.totalDmgDealt, r.totalDmgTaken);
}

function showBattleReportModal(log, won, summary, dmgDealt, dmgTaken) {
    const modal = document.getElementById('battle-result-modal');
    if (!modal) { showMissionModal(summary); return; }
    
    const fighters = document.getElementById('battle-fighters');
    const out = document.getElementById('battle-outcome');
    const logEl = document.getElementById('battle-log');
    
    let enemyName = 'Enemy';
    const vsLine = log.find(l => l.includes(' vs '));
    if (vsLine) {
        const parts = vsLine.split(' vs ');
        if (parts[1]) enemyName = parts[1].trim();
    }
    
    if (fighters && character) {
        fighters.innerHTML = `
            <div class="fighter-card">
                <img src="/images/class/${character.class}.png" class="fighter-avatar" onerror="this.style.display='none'">
                <div class="fighter-name">${character.name}</div>
                <div class="fighter-class">${capitalize(character.class)} Lv.${character.level}</div>
            </div>
            <div class="fighter-vs">VS</div>
            <div class="fighter-card">
                <div class="fighter-avatar" style="font-size:2rem">👾</div>
                <div class="fighter-name">${enemyName}</div>
                <div class="fighter-class">Enemy</div>
            </div>`;
    }
    
    if (out) {
        out.className = won ? 'won' : 'lost';
        out.innerHTML = won
            ? `🏆 VICTORY!<br><small style="font-size:0.75rem;color:var(--text-dim)">${summary} · ⚔️ ${dmgDealt ?? '?'} dmg dealt · 💔 ${dmgTaken ?? '?'} dmg taken</small>`
            : `💀 DEFEATED<br><small style="font-size:0.75rem;color:var(--text-dim)">${summary} · ⚔️ ${dmgDealt ?? '?'} dmg dealt · 💔 ${dmgTaken ?? '?'} dmg taken</small>`;
    }
    
    if (logEl) {
        logEl.innerHTML = log.map(l => {
            if (l === '---') return '<div class="battle-log-line separator">───────────────────</div>';
            let className = '';
            if (l.startsWith(character?.name)) className = 'battle-log-player';
            else if (l.startsWith(enemyName)) className = 'battle-log-opponent';
            return `<div class="battle-log-line ${className}">${l}</div>`;
        }).join('');
    }
    
    modal.classList.remove('hidden');
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
    const summary = [report.won?'✅ Victory':'💀 Defeated', report.goldEarned?`💰 ${report.goldEarned>0?'+':''}${report.goldEarned} gold`:null, report.xpEarned?`⭐ +${report.xpEarned} XP`:null].filter(Boolean).join(' · ');
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

// ── Item Icon Helper ──────────────────────────────────────────────────────
function itemIcon(item, size='2rem') {
    if (!item) return '';
    const imgSrc = item.img || (item.name && !item.consumable ? `/images/assets/${item.name.toLowerCase().replace(/\s+/g,'-')}.png` : null);
    const iStyle = size==='slot' ? 'max-width:100%;max-height:100%;object-fit:contain;display:block' : `width:${size};height:${size};object-fit:contain;border-radius:4px;display:block`;
    const sStyle = size==='slot' ? 'font-size:2.2rem;line-height:1' : `font-size:${size};line-height:1`;
    if (imgSrc) return `<img src="${imgSrc}" style="${iStyle}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none;${sStyle}">${item.emoji||'📦'}</span>`;
    return `<span style="${sStyle}">${item.emoji||'📦'}</span>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────
function setError(id,msg){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.classList.toggle('hidden',!msg);}
function showMsg(id,msg,isError=false){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.style.background=isError?'rgba(192,57,43,0.1)':'';el.style.borderColor=isError?'rgba(192,57,43,0.4)':'';el.style.color=isError?'var(--red-light)':'';el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),4000);}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function capitalize(s){return s?s[0].toUpperCase()+s.slice(1):'';}

// ── Bug Report System ─────────────────────────────────────────────────────

let bugReportScreenshot = null;

function initBugReport() {
    const btn = document.getElementById('bug-report-btn');
    if (btn) {
        btn.addEventListener('click', openBugReport);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('bug-report-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeBugReport();
        });
    }
    
    // Handle form submission
    const form = document.getElementById('bug-report-form');
    if (form) {
        form.addEventListener('submit', submitBugReport);
    }
    
    // Handle file upload
    const fileInput = document.getElementById('screenshot-file');
    if (fileInput) {
        fileInput.addEventListener('change', handleScreenshotUpload);
    }
    
    // Handle drag & drop
    const dropzone = document.getElementById('screenshot-dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#9b59b6';
            dropzone.style.background = 'rgba(155, 89, 182, 0.1)';
        });
        
        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--border)';
            dropzone.style.background = 'var(--bg3)';
        });
        
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--border)';
            dropzone.style.background = 'var(--bg3)';
            
            const files = e.dataTransfer.files;
            if (files && files[0] && files[0].type.startsWith('image/')) {
                handleFile(files[0]);
            } else {
                showBugReportStatus('Please drop an image file (PNG, JPG)', 'error');
            }
        });
    }
}

function openBugReport() {
    const modal = document.getElementById('bug-report-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('bug-report-form').reset();
        document.getElementById('bug-report-status').classList.add('hidden');
        bugReportScreenshot = null;
        const preview = document.getElementById('screenshot-preview');
        if (preview) preview.classList.add('hidden');
        const uploadArea = document.getElementById('screenshot-upload-area');
        if (uploadArea) uploadArea.classList.add('hidden');
        
        // Auto-fill browser info
        const browserInput = document.getElementById('bug-browser');
        if (browserInput && !browserInput.value) {
            browserInput.value = getBrowserInfo();
        }
    }
}

function closeBugReport() {
    const modal = document.getElementById('bug-report-modal');
    if (modal) modal.classList.add('hidden');
    bugReportScreenshot = null;
}

// Add this new function for image compression
async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                // Calculate new dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }
                
                // Create canvas and resize
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress and convert to base64
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

function toggleScreenshotUpload() {
    const checkbox = document.getElementById('include-screenshot');
    const uploadArea = document.getElementById('screenshot-upload-area');
    if (uploadArea) {
        uploadArea.classList.toggle('hidden', !checkbox.checked);
        if (!checkbox.checked) {
            bugReportScreenshot = null;
            const preview = document.getElementById('screenshot-preview');
            if (preview) preview.classList.add('hidden');
        }
    }
}

function handleScreenshotUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    }
}

// REPLACE this function with the async version
async function handleFile(file) {
    // Check file size first (limit to 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
        showBugReportStatus('Image too large! Maximum 5MB. Please choose a smaller image.', 'error');
        return;
    }
    
    showBugReportStatus('Compressing image...', 'info');
    
    try {
        // Compress and resize the image
        const compressedImage = await compressImage(file, 800, 800, 0.7);
        bugReportScreenshot = compressedImage;
        
        // Show compressed size in preview
        const compressedSizeKB = Math.round(compressedImage.length / 1024);
        showScreenshotPreview(bugReportScreenshot, compressedSizeKB);
        
        if (compressedSizeKB > 500) {
            showBugReportStatus(`Image compressed to ${compressedSizeKB}KB. This is still large but should work.`, 'info');
            setTimeout(() => {
                const statusDiv = document.getElementById('bug-report-status');
                if (statusDiv && statusDiv.classList.contains('info')) {
                    statusDiv.classList.add('hidden');
                }
            }, 3000);
        } else {
            showBugReportStatus('Screenshot ready!', 'success');
            setTimeout(() => {
                const statusDiv = document.getElementById('bug-report-status');
                if (statusDiv && statusDiv.classList.contains('success')) {
                    statusDiv.classList.add('hidden');
                }
            }, 2000);
        }
    } catch (error) {
        console.error('Error compressing image:', error);
        showBugReportStatus('Failed to compress image. Please try a different image.', 'error');
        bugReportScreenshot = null;
    }
}

// UPDATE this function to show compressed size
function showScreenshotPreview(dataUrl, sizeKB = null) {
    const preview = document.getElementById('screenshot-preview');
    if (preview) {
        const sizeText = sizeKB ? `<div style="font-size: 10px; color: #9b59b6; margin-top: 4px; text-align: center;">📸 ${sizeKB}KB</div>` : '';
        preview.innerHTML = `
            <div style="position: relative; display: inline-block;">
                <img src="${dataUrl}" alt="Screenshot preview" style="max-width: 100%; max-height: 200px; border-radius: 6px; border: 1px solid var(--border);">
                <button onclick="removeScreenshot()" style="position: absolute; top: -8px; right: -8px; background: #e74c3c; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; color: white; font-size: 14px; display: flex; align-items: center; justify-content: center;">✕</button>
                ${sizeText}
            </div>
        `;
        preview.classList.remove('hidden');
    }
}

function removeScreenshot() {
    bugReportScreenshot = null;
    const preview = document.getElementById('screenshot-preview');
    if (preview) preview.classList.add('hidden');
    const fileInput = document.getElementById('screenshot-file');
    if (fileInput) fileInput.value = '';
}

function getBrowserInfo() {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return `Chrome ${ua.match(/Chrome\/(\d+)/)?.[1] || ''}`;
    if (ua.includes('Firefox')) return `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1] || ''}`;
    if (ua.includes('Safari')) return `Safari ${ua.match(/Version\/(\d+)/)?.[1] || ''}`;
    if (ua.includes('Edge')) return `Edge ${ua.match(/Edg\/(\d+)/)?.[1] || ''}`;
    return navigator.userAgent;
}

async function submitBugReport(event) {
    event.preventDefault();
    
    const category = document.getElementById('bug-category').value;
    const title = document.getElementById('bug-title').value.trim();
    const description = document.getElementById('bug-description').value.trim();
    const steps = document.getElementById('bug-steps').value.trim();
    const browser = document.getElementById('bug-browser').value.trim();
    
    if (!category || !title || !description) {
        showBugReportStatus('Please fill in all required fields.', 'error');
        return;
    }
    
    showBugReportStatus('Submitting report...', 'info');
    
    const report = {
        timestamp: new Date().toISOString(),
        user: {
            username: username || 'guest',
            character_name: character?.name || 'unknown',
            character_level: character?.level || 0,
            character_class: character?.class || 'unknown'
        },
        report: {
            category,
            title,
            description,
            steps_to_reproduce: steps || 'Not provided',
            browser
        },
        screenshot: bugReportScreenshot || null,
        game_state: {
            location: character?.location || 'unknown',
            hp: character?.hp_current || 0,
            gold: character?.gold || 0,
            level: character?.level || 0
        }
    };
    
    try {
        const response = await fetch('/api/game/bug-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showBugReportStatus('✅ Report submitted successfully! Thank you for helping improve the game.', 'success');
            setTimeout(() => closeBugReport(), 2000);
        } else {
            showBugReportStatus(`Failed to submit: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Bug report error:', error);
        showBugReportStatus('Failed to submit report. Please try again.', 'error');
    }
}

function showBugReportStatus(message, type) {
    const statusDiv = document.getElementById('bug-report-status');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `bug-report-status ${type}`;
        statusDiv.classList.remove('hidden');
    }
}

// Initialize bug report system when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    initBugReport();
});

// ── Convert MP to Special Mana Potion ─────────────────────────────────────
let _convertingMp = false;

async function convertMpToPotion() {
    if (_convertingMp) return;
    _convertingMp = true;
    
    const btn = document.getElementById('convert-mp-btn');
    
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.innerHTML = '⏳ Converting...';
    }
    
    try {
        const response = await api('POST', '/game/convert-mp-to-potion');
        
        if (response.success) {
            // Update character data
            character = response.character;
            
            // Update displays
            renderTopBar();
            updatePotionBadge();
            
            // Show success message
            showMsg('convert-mp-status', response.message);
        } else {
            showMsg('convert-mp-status', response.error || 'Failed to convert MP', true);
        }
    } catch (error) {
        console.error('MP conversion error:', error);
        showMsg('convert-mp-status', error.message || 'Failed to convert MP', true);
    } finally {
        _convertingMp = false;
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerHTML = '💎✨ Convert MP';
        }
        
        // Auto-hide status message after 3 seconds
        setTimeout(() => {
            const status = document.getElementById('convert-mp-status');
            if (status) status.classList.add('hidden');
        }, 3000);
    }
}

async function updatePotionBadge() {
    try {
        const inv = await api('GET', '/game/inventory');
        let total = 0;
        for (const item of inv.items) {
            const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
            if (data.id === 'special_mana_potion') {
                total += data.qty || 1;
            }
        }
        
        const badge = document.getElementById('potion-badge');
        if (badge) {
            if (total > 0) {
                badge.textContent = total;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error('Failed to update potion badge:', e);
    }
}
let currentUpgradeItemId = null;

async function openUpgradeModal(inventoryId) {
    currentUpgradeItemId = inventoryId;
    
    try {
        const invData = await api('GET', '/game/inventory');
        const item = invData.items.find(i => i.id === inventoryId);
        if (!item) return;
        
        const itemData = item.item_data;
        const currentUpgrade = item.upgrade_level || 0;
        
        if (currentUpgrade >= 5) {
            showMsg('inv-msg', 'Item already at max upgrade level (+5)!', true);
            return;
        }
        
        // Get available components
        const components = invData.items.filter(i => i.item_type === 'component');
        
        if (components.length === 0) {
            showMsg('inv-msg', 'You need components to upgrade! Craft them in the forge.', true);
            return;
        }
        
        // Build component list HTML
        let componentsHtml = '';
        components.forEach(comp => {
            const compData = comp.item_data;
            const qty = compData.qty || 1;
            componentsHtml += `
                <div class="upgrade-component-card" onclick="selectComponent('${compData.id}', '${compData.name}', ${qty})">
                    <div class="component-icon">${compData.emoji || '🔧'}</div>
                    <div class="component-info">
                        <div class="component-name">${compData.name}</div>
                        <div class="component-qty">Owned: ${qty}</div>
                    </div>
                </div>
            `;
        });
        
        const modalContent = document.getElementById('upgrade-modal-content');
        modalContent.innerHTML = `
            <div class="upgrade-item-info">
                <div class="upgrade-item-name">${itemData.name}</div>
                <div class="upgrade-item-current">Current Level: +${currentUpgrade}</div>
                <div class="upgrade-item-next">Next Level: +${currentUpgrade + 1}</div>
            </div>
            <div class="upgrade-section-title">Select a component to use:</div>
            <div class="upgrade-components-grid">
                ${componentsHtml}
            </div>
            <div id="upgrade-selected-info" class="upgrade-selected-info hidden">
                <div class="upgrade-selected-title">Selected Component:</div>
                <div id="selected-component-details"></div>
                <button class="btn-primary" onclick="confirmUpgrade()" style="margin-top: 16px;">Confirm Upgrade</button>
            </div>
        `;
        
        document.getElementById('upgrade-modal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error opening upgrade modal:', error);
        showMsg('inv-msg', error.message, true);
    }
}

let selectedComponentId = null;
let selectedComponentName = null;

function selectComponent(componentId, componentName, qty) {
    if (qty < 1) {
        showMsg('inv-msg', `You don't have any ${componentName}!`, true);
        return;
    }
    
    selectedComponentId = componentId;
    selectedComponentName = componentName;
    
    // Highlight selected card
    document.querySelectorAll('.upgrade-component-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    // Show selected info
    const selectedInfo = document.getElementById('upgrade-selected-info');
    const detailsDiv = document.getElementById('selected-component-details');
    
    // Get upgrade info from backend (or estimate)
    detailsDiv.innerHTML = `
        <div class="selected-component-name">${componentName}</div>
        <div class="selected-component-bonus">Bonus: +? stats</div>
        <div class="selected-component-cost">Gold Cost: ?</div>
    `;
    
    selectedInfo.classList.remove('hidden');
}

async function confirmUpgrade() {
    if (!selectedComponentId) {
        showMsg('inv-msg', 'Please select a component first!', true);
        return;
    }
    
    try {
        const result = await api('POST', `/game/equipment/upgrade/${currentUpgradeItemId}`, { 
            componentId: selectedComponentId 
        });
        
        if (result.success) {
            let message = result.message;
            if (result.upgradedStats && result.upgradedStats.length > 0) {
                message += `\n\nStats improved:\n`;
                result.upgradedStats.forEach(s => {
                    const statName = s.stat.replace(/_/g, ' ');
                    message += `• ${statName}: ${s.oldValue} → ${s.newValue} (+${s.increase})\n`;
                });
            }
            showMsg('inv-msg', message);
            closeUpgradeModal();
            loadInventory();
            if (typeof renderCharacter === 'function') renderCharacter();
        } else {
            showMsg('inv-msg', result.message, true);
        }
    } catch (error) {
        showMsg('inv-msg', error.message, true);
    }
}

function closeUpgradeModal() {
    document.getElementById('upgrade-modal').classList.add('hidden');
    currentUpgradeItemId = null;
    selectedComponentId = null;
    selectedComponentName = null;
}
