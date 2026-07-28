// ── Service Worker — static asset cache (stale-while-revalidate) ──
// Registered in init below after game loads

// ── Loading Overlay ───────────────────────────────────────────────────────
(function(){

    // ── Dots ──────────────────────────────────────────────────────────────
    var dots = document.getElementById('loading-dots');
    if (dots) {
        var frames = ['\u00A0', '.', '..', '...'];
        var di = 0;
        setInterval(function() { di = (di + 1) % frames.length; dots.textContent = frames[di]; }, 400);
    }

    // ── Ring color cycling ─────────────────────────────────────────────────
    var palette = [
        '#c084fc','#818cf8','#38bdf8','#34d399',
        '#fbbf24','#f472b6','#fb923c','#a78bfa',
        '#2dd4bf','#e879f9'
    ];
    var ringLayers = document.querySelectorAll('.ring-layer');
    function animateLayer(layer, minDelay, maxDelay) {
        var color   = palette[Math.floor(Math.random() * palette.length)];
        var opacity = (Math.random() * 0.5).toFixed(3);
        layer.style.setProperty('--ring-color', color);
        var img = layer.querySelector('.loading-ring');
        if (img) img.style.opacity = opacity;
        var delay = minDelay + Math.random() * (maxDelay - minDelay);
        setTimeout(function() { animateLayer(layer, minDelay, maxDelay); }, delay);
    }
    var ringCfgs = [{ min:2800,max:4200 },{ min:2000,max:3400 },{ min:1600,max:2800 }];
    ringLayers.forEach(function(layer, idx) {
        var cfg = ringCfgs[idx] || ringCfgs[0];
        setTimeout(function() { animateLayer(layer, cfg.min, cfg.max); }, idx * 600 + Math.random() * 400);
    });

    // ── Star & Constellation canvas ────────────────────────────────────────
    var starCanvas = document.getElementById('loading-stars');
    if (starCanvas) {
        var sc = starCanvas.getContext('2d');
        var stars = [], constellations = [], starRaf;
        var NUM_STARS = 130, MAX_DIST = 130;
        function resizeStars() { starCanvas.width = window.innerWidth; starCanvas.height = window.innerHeight; }
        resizeStars();
        window.addEventListener('resize', resizeStars);
        var starColors = ['rgba(255,255,255,','rgba(200,215,255,','rgba(220,200,255,','rgba(255,240,200,','rgba(180,230,255,'];
        for (var s = 0; s < NUM_STARS; s++) {
            stars.push({ x:Math.random(), y:Math.random(), r:0.4+Math.random()*1.4,
                color:starColors[Math.floor(Math.random()*starColors.length)],
                opacity:0, target:Math.random()*0.85+0.05, speed:0.003+Math.random()*0.009,
                waitFrames:Math.floor(Math.random()*180), waited:0 });
        }
        function spawnConst() {
            var seed = Math.floor(Math.random()*stars.length);
            var sx = stars[seed].x*starCanvas.width, sy = stars[seed].y*starCanvas.height;
            var nearby = [seed];
            var shuffled = stars.map(function(_,i){return i;}).sort(function(){return Math.random()-0.5;});
            for (var k=0; k<shuffled.length && nearby.length<6; k++) {
                var ii=shuffled[k]; if(ii===seed) continue;
                var dx=stars[ii].x*starCanvas.width-sx, dy=stars[ii].y*starCanvas.height-sy;
                if (Math.sqrt(dx*dx+dy*dy)<MAX_DIST) nearby.push(ii);
            }
            if (nearby.length>=3) constellations.push({indices:nearby,opacity:0,dir:1});
        }
        var starFrame=0, nextSpawn=120;
        function drawStars() {
            if (!document.getElementById('loading-overlay')) { cancelAnimationFrame(starRaf); return; }
            sc.clearRect(0,0,starCanvas.width,starCanvas.height);
            starFrame++;
            if (starFrame>=nextSpawn) { spawnConst(); nextSpawn=starFrame+100+Math.floor(Math.random()*160); }
            for (var c=constellations.length-1;c>=0;c--) {
                var con=constellations[c];
                con.opacity+=con.dir*0.008;
                if (con.opacity>=0.45){con.opacity=0.45;con.dir=-1;}
                if (con.opacity<=0){constellations.splice(c,1);continue;}
                sc.strokeStyle='rgba(160,195,255,'+con.opacity.toFixed(3)+')';
                sc.lineWidth=0.6; sc.beginPath();
                var p0=stars[con.indices[0]];
                sc.moveTo(p0.x*starCanvas.width,p0.y*starCanvas.height);
                for (var j=1;j<con.indices.length;j++) {
                    var pj=stars[con.indices[j]],prev=stars[con.indices[j-1]];
                    var ddx=pj.x*starCanvas.width-prev.x*starCanvas.width;
                    var ddy=pj.y*starCanvas.height-prev.y*starCanvas.height;
                    if(Math.sqrt(ddx*ddx+ddy*ddy)<MAX_DIST) sc.lineTo(pj.x*starCanvas.width,pj.y*starCanvas.height);
                    else sc.moveTo(pj.x*starCanvas.width,pj.y*starCanvas.height);
                }
                sc.stroke();
            }
            for (var i=0;i<stars.length;i++) {
                var st=stars[i];
                if(Math.abs(st.opacity-st.target)<st.speed){
                    if(st.waited<st.waitFrames){st.waited++;}
                    else{st.target=Math.random()*0.85+0.05;st.waitFrames=Math.floor(Math.random()*200+60);st.speed=0.003+Math.random()*0.009;st.waited=0;}
                } else { st.opacity+=(st.target-st.opacity)>0?st.speed:-st.speed; }
                var px=st.x*starCanvas.width,py=st.y*starCanvas.height;
                sc.beginPath(); sc.arc(px,py,st.r*2.5,0,Math.PI*2);
                sc.fillStyle=st.color+(st.opacity*0.18).toFixed(3)+')'; sc.fill();
                sc.beginPath(); sc.arc(px,py,st.r,0,Math.PI*2);
                sc.fillStyle=st.color+st.opacity.toFixed(3)+')'; sc.fill();
            }
            starRaf=requestAnimationFrame(drawStars);
        }
        starRaf=requestAnimationFrame(drawStars);
    }

    // ── Runic particle canvas ──────────────────────────────────────────────
    var pCanvas = document.getElementById('loading-particles');
    if (pCanvas) {
        var pc = pCanvas.getContext('2d');
        var particles = [], pRaf;
        // Rune-like glyphs — simple strokes that feel arcane
        var glyphs = ['✦','✧','⊕','⊗','◈','⟁','⌬','⍟','⎊','⏣','⋆','∴','∵','⁂'];
        var pColors = [
            'rgba(192,132,252,', 'rgba(129,140,248,', 'rgba(56,189,248,',
            'rgba(52,211,153,',  'rgba(251,191,36,',  'rgba(244,114,182,'
        ];
        function resizeP() {
            var rect = pCanvas.parentElement.getBoundingClientRect();
            pCanvas.width  = rect.width  + 240;
            pCanvas.height = rect.height + 240;
        }
        resizeP();
        window.addEventListener('resize', resizeP);

        function spawnParticle() {
            var w = pCanvas.width, h = pCanvas.height;
            // spawn along bottom edge of the canvas, within ring area roughly
            var angle = Math.random() * Math.PI * 2;
            var r = 80 + Math.random() * 160; // spawn in a ring around center
            particles.push({
                x: w/2 + Math.cos(angle)*r,
                y: h/2 + Math.sin(angle)*r,
                vx: (Math.random()-0.5)*0.4,
                vy: -(0.3 + Math.random()*0.7), // float upward
                opacity: 0,
                maxOpacity: 0.15 + Math.random()*0.35,
                fadeIn: true,
                size: 7 + Math.random()*9,
                glyph: glyphs[Math.floor(Math.random()*glyphs.length)],
                color: pColors[Math.floor(Math.random()*pColors.length)],
                life: 0,
                maxLife: 120 + Math.floor(Math.random()*180),
                spin: (Math.random()-0.5)*0.02
            });
        }

        var pFrame = 0;
        function drawParticles() {
            if (!document.getElementById('loading-overlay')) { cancelAnimationFrame(pRaf); return; }
            pc.clearRect(0, 0, pCanvas.width, pCanvas.height);
            pFrame++;
            // spawn a new particle every ~40 frames
            if (pFrame % 40 === 0) spawnParticle();

            for (var i = particles.length-1; i >= 0; i--) {
                var p = particles[i];
                p.x  += p.vx;
                p.y  += p.vy;
                p.life++;
                // fade in first 30 frames, fade out last 40
                if (p.life < 30) { p.opacity = (p.life/30) * p.maxOpacity; }
                else if (p.life > p.maxLife - 40) { p.opacity = ((p.maxLife-p.life)/40) * p.maxOpacity; }
                else { p.opacity = p.maxOpacity; }
                if (p.life >= p.maxLife) { particles.splice(i,1); continue; }

                pc.save();
                pc.translate(p.x, p.y);
                pc.rotate(p.life * p.spin);
                pc.font = p.size + 'px serif';
                pc.textAlign = 'center';
                pc.textBaseline = 'middle';
                pc.fillStyle = p.color + p.opacity.toFixed(3) + ')';
                pc.fillText(p.glyph, 0, 0);
                pc.restore();
            }
            pRaf = requestAnimationFrame(drawParticles);
        }
        // seed a few particles immediately
        for (var pi=0; pi<5; pi++) spawnParticle();
        pRaf = requestAnimationFrame(drawParticles);
    }

    // ── Progress bar ────────────────────────────────────────────────────────
    function setLoadingProgress(pct, text) {
        var fill = document.getElementById('loading-bar-fill');
        var status = document.getElementById('loading-status');
        if (fill) fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (status && text) status.textContent = text;
    }
    window._setLoadingProgress = setLoadingProgress;

    // ── Cleanup on load ────────────────────────────────────────────────────
    function dismissOverlay() {
        var ov  = document.getElementById('loading-overlay');
        var app = document.getElementById('app');
        if (app) app.style.display = 'block';
        if (ov && !ov.classList.contains('hidden')) {
            ov.classList.add('hidden');
            setTimeout(function() { if (ov.parentNode) ov.remove(); }, 800);
        }
    }

    // Expose so init code can call it after first render
    window._dismissOverlay = dismissOverlay;
})();
// ── State ─────────────────────────────────────────────────────────────────
let token = localStorage.getItem('rpg_token');
let username = localStorage.getItem('rpg_username');
let tabSession = sessionStorage.getItem('rpg_tab_session') || (() => { const id = Date.now().toString(36) + Math.random().toString(36).slice(2); sessionStorage.setItem('rpg_tab_session', id); return id; })();
let character = null;
let trainTimer = null, unreadTimer = null, topbarLiveTimer = null, chatPollTimer = null;
let lbData = [];
let forgeTab = 'refine', invTab = 'weapons';
let forgeData = null;
let lbSort = 'total_gold_earned';
let shopInventory = [];
let currentShopCategory = 'weapons';
let monthlyFreeGemsStatus = null;
let specialManaPotionCount = 0;
let specialManaPotionCountFetchedAt = 0;
let potionBadgeRequest = null;
let activeMissionInterval = null;
let overlayInterval = null;
let travelOverlayInterval = null;
let restOverlayInterval = null;
let battlePlaybackTimer = null;
let battlePlaybackQueue = [];
let battlePlaybackIndex = 0;
let battlePlaybackMeta = null;
let alwaysSkipBattleAnimations = false;
let assistantEnabled = true;
let showUpgradeTab = localStorage.getItem('rpg_show_upgrade') !== 'false';
let playerLocation = 'forest';
let playerTravelTarget = null;
let playerTravelEndTime = 0;
let playerTravelStartTime = 0;
let unlockedTravelZones = new Set(['forest']);
let unlockedAbyssZones = new Set();
const FREE_CANCEL_WINDOW = 300;
let abyssData = null;
let trainingInterval = null;
let trainingOverlayInterval = null;
let accountCharacters = [];
let activeCharacterId = null;
let maxCharacterSlots = 4;
let availableCharacterClasses = ['warrior', 'mage', 'rogue', 'paladin'];
let chatEnabled = true;
let chatMessages = [];
let chatLatestId = 0;
let chatPmTarget = '';
let chatWidgetCollapsed = true;
let chatExpanded = false;
let chatActiveView = 'global';
let chatActivePmThread = '';
let chatUnreadPmIds = new Set();
let chatSeenGlobalId = 0;
let chatSeenPmThreadIds = {};
let chatHighlightedGlobalIds = new Set();
let chatHighlightedPmIds = new Set();
let chatReadStateForCharId = 0;
let chatReadStateLoadedFromStorage = false;
let chatClosedPmThreads = new Set();
let chatStatusText = '';
let chatStatusIsError = false;
let chatStatusTimer = null;
let chatWidgetPosition = null;
let chatDragState = null;
let chatRecipientSuggestions = [];
let chatMentionSuggestions = [];
let chatSuggestionTimer = null;
let chatSuggestionRequestId = 0;
let chatMentionRange = null;
const CHAT_STATE_VERSION = 1;
function bustStaleChatState() {
    const ver = parseInt(localStorage.getItem('rpg_chat_state_version') || '0', 10);
    if (ver < CHAT_STATE_VERSION) {
        localStorage.removeItem('rpg_chat_editing_id');
        localStorage.removeItem('rpg_chat_state_version');
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('rpg_chat_read_state_')) {
                    localStorage.removeItem(key);
                }
            }
        } catch {}
        localStorage.setItem('rpg_chat_state_version', String(CHAT_STATE_VERSION));
    }
}

function isTutorialCharacter(char = character) {
    if (!char) return false;
    return Number(char.wins || 0) < 4 && !Number(char.tutorial_skipped || 0);
}

async function loadAbyssData() {
    try {
        abyssData = await api('GET', '/game/abyss/data');
    } catch (e) {
        console.error('Failed to load Abyss data:', e);
        abyssData = null;
    }
}

// ── Stat display labels ───────────────────────────────────────────────────
const STAT_LABELS = {
    dmg_min:        'Min Dmg',
    dmg_max:        'Max Dmg',
    armor:          'Armor',
    hp_max:         'HP',
    defense:        'Defense',
    strength:       'Strength',
    agility:        'Agility',
    magic:          'Magic',
    vitality:       'Vitality',
    hit_chance:     'Hit Chance',
    crit_chance:    'Crit Chance',
    pyro_dmg:       'Fire Dmg',
    water_dmg:      'Water Dmg',
    wind_dmg:       'Wind Dmg',
    electro_dmg:    'Electro Dmg',
    pyro_resist:    'Fire Resist',
    water_resist:   'Water Resist',
    wind_resist:    'Wind Resist',
    electro_resist: 'Electro Resist',
};

const STAT_ICON_ASSETS = {
    dmg_min:'strength', dmg_max:'strength', armor:'defense', hp_max:'vitality',
    defense:'defense', strength:'strength', agility:'agility', magic:'magic', vitality:'vitality',
    hit_chance:'accuracy', crit_chance:'critical',
    pyro_dmg:'pyro', water_dmg:'hydro', wind_dmg:'wind', electro_dmg:'electro',
    pyro_resist:'pyro', water_resist:'hydro', wind_resist:'wind', electro_resist:'electro',
};

function statLabelHtml(stat) {
    var asset = STAT_ICON_ASSETS[stat];
    if (asset) {
        var label = STAT_LABELS[stat] || stat.replace(/_/g,' ');
        return '<img class="stat-icon-img" src="/images/assets/' + asset + '.png" alt="' + escHtml(label) + '" loading="lazy" decoding="async" data-error-hide="true" style="width:14px;height:14px;vertical-align:middle;margin-right:3px;display:inline-block"> ' + label;
    }
    return STAT_LABELS[stat] || stat.replace(/_/g,' ');
}

// ── Hit & Block Zone Definitions ──────────────────────────────────────────
const HIT_ZONES = {
    head:         { label: 'Head',         dmgMult: 1.5,  hitChance: 0.80, desc: 'High risk, high reward. Devastating if it lands.' },
    throat:       { label: 'Throat',       dmgMult: 1.3,  hitChance: 0.85, desc: 'Strong damage with decent accuracy.' },
    chest:        { label: 'Chest',        dmgMult: 1.0,  hitChance: 1.00, desc: 'Reliable and consistent. The safe default.' },
    heart:        { label: 'Heart',        dmgMult: 1.75, hitChance: 0.75, desc: 'Highest damage in the game. Hard to land.' },
    solar_plexus: { label: 'Solar Plexus', dmgMult: 1.2,  hitChance: 0.90, desc: 'Good balance of damage and accuracy.' },
    stomach:      { label: 'Stomach',      dmgMult: 1.1,  hitChance: 0.95, desc: 'Safe and reliable with solid damage.' },
    left_arm:     { label: 'Left Arm',     dmgMult: 0.8,  hitChance: 1.10, desc: 'Low damage but very accurate. Beats most guards.' },
    right_arm:    { label: 'Right Arm',    dmgMult: 0.8,  hitChance: 1.10, desc: 'Mirror of left arm. Consistent and safe.' },
    left_leg:     { label: 'Left Leg',     dmgMult: 0.7,  hitChance: 1.25, desc: 'Nearly guaranteed to connect. Counters turtling.' },
    right_leg:    { label: 'Right Leg',    dmgMult: 0.7,  hitChance: 1.25, desc: 'Mirror of left leg. Reliable chip damage.' }
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
    counter_stance:{ label: 'Counter Stance',protects: ['chest','solar_plexus'],    reduction: 0.55, special: 'counter_25', desc: '25% chance to counter for 50% damage back. Covers center line only.' },
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
    forest:    { swamp:60 },
    swamp:     { forest:60, mountains:90 },
    mountains: { swamp:90, ruins:120 },
    ruins:     { mountains:120, dark_city:60 },
    dark_city: { ruins:60 }
};

const TRAVEL_GATEKEEPER_PREREQS = {
    overworld: {
        mountains: { unlockZone: 'swamp', guardianName: 'Bog Warden' },
        ruins: { unlockZone: 'mountains', guardianName: 'Frost Sentinel' },
        dark_city: { unlockZone: 'ruins', guardianName: 'Crypt Keeper' }
    }
};

// ── Component Upgrade Values (for frontend) ────────────────────────────────
const COMPONENT_UPGRADE_VALUES = {
    iron_ingot: { bonus: 2, goldCost: 20, name: 'Iron Ingot', emoji: '🔩', recipe: { iron_ore: 3 }, source: 'Forest, Swamp, Mountains' },
    hardwood_plank: { bonus: 2, goldCost: 15, name: 'Hardwood Plank', emoji: '🪚', recipe: { wood: 3 }, source: 'Forest, Swamp' },
    tanned_hide: { bonus: 2, goldCost: 25, name: 'Tanned Hide', emoji: '🧶', recipe: { wolf_pelt: 2, herbs: 1 }, source: 'Forest, Swamp' },
    poison_extract: { bonus: 3, goldCost: 40, name: 'Poison Extract', emoji: '⚗️', recipe: { poison_gland: 2 }, source: 'Swamp' },
    frost_core: { bonus: 3, goldCost: 150, name: 'Frost Core', emoji: '🧊', recipe: { frost_essence: 2 }, source: 'Mountains' },
    mithril_ingot: { bonus: 4, goldCost: 80, name: 'Mithril Ingot', emoji: '⚙️', recipe: { mithril_ore: 3 }, source: 'Mountains, Ruins' },
    arcane_shard: { bonus: 4, goldCost: 120, name: 'Arcane Shard', emoji: '💠', recipe: { swamp_crystal: 2, arcane_dust: 1 }, source: 'Swamp, Ruins, Dark City' },
    dragon_plate: { bonus: 6, goldCost: 300, name: 'Dragon Plate', emoji: '🛡️', recipe: { dragon_scale_shard: 3, mithril_ore: 2 }, source: 'Mountains' },
    void_crystal: { bonus: 6, goldCost: 500, name: 'Void Crystal', emoji: '🔮', recipe: { void_shard: 2, rune_fragment: 1 }, source: 'Ruins, Dark City' },
    shadow_weave: { bonus: 8, goldCost: 800, name: 'Shadow Weave', emoji: '🕸️', recipe: { shadow_essence: 2, arcane_dust: 2 }, source: 'Dark City' },
    demon_alloy: { bonus: 10, goldCost: 1200, name: 'Demon Alloy', emoji: '⚡', recipe: { demon_core: 1, mithril_ore: 3 }, source: 'Dark City' },
    crimson_alloy: { bonus: 10, goldCost: 1200, name: 'Crimson Alloy', emoji: '⚡', recipe: { crimson_crystal: 2, infernal_core: 1 }, source: 'Crimson Zone, Abyss', statPick: true }
};

const RAW_MATERIAL_INFO = {
    iron_ore: { name: 'Iron Ore', source: 'Forest, Swamp, Mountains' },
    wood: { name: 'Wood', source: 'Forest, Swamp' },
    wolf_pelt: { name: 'Wolf Pelt', source: 'Forest' },
    herbs: { name: 'Herbs', source: 'Forest, Swamp' },
    poison_gland: { name: 'Poison Gland', source: 'Swamp' },
    swamp_crystal: { name: 'Swamp Crystal', source: 'Swamp' },
    frost_essence: { name: 'Frost Essence', source: 'Mountains' },
    mithril_ore: { name: 'Mithril Ore', source: 'Mountains, Ruins' },
    arcane_dust: { name: 'Arcane Dust', source: 'Ruins, Dark City' },
    dragon_scale_shard: { name: 'Dragon Scale Shard', source: 'Mountains' },
    void_shard: { name: 'Void Shard', source: 'Ruins, Dark City' },
    rune_fragment: { name: 'Rune Fragment', source: 'Ruins' },
    shadow_essence: { name: 'Shadow Essence', source: 'Dark City' },
    demon_core: { name: 'Demon Core', source: 'Dark City' },
    legendary_fragment: { name: 'Legendary Fragment', source: 'Dark City, Bosses' },
    crimson_crystal: { name: 'Crimson Crystal', source: 'Crimson Zone, Abyss' },
    infernal_core: { name: 'Infernal Core', source: 'Crimson Zone, Abyss' }
};

const POSSIBLE_STATS = [
    'strength', 'defense', 'agility', 'magic', 'vitality',
    'hit_chance', 'crit_chance', 'armor', 'hp_max',
    'dmg_min', 'dmg_max',
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

function getTravelGatekeeperPrereq(zoneId, currentMap = 'overworld') {
    return (TRAVEL_GATEKEEPER_PREREQS[currentMap] || {})[zoneId] || null;
}

function buildCurvedRoutePath(fromPos, toPos, pairKey) {
    const x1 = Number(fromPos?.x || 0);
    const y1 = Number(fromPos?.y || 0);
    const x2 = Number(toPos?.x || 0);
    const y2 = Number(toPos?.y || 0);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const perpX = -dy / len;
    const perpY = dx / len;
    const sign = String(pairKey || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
    const bend = Math.min(7, Math.max(3, len * 0.18)) * sign;
    const cx = mx + (perpX * bend);
    const cy = my + (perpY * bend);
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// ── API ───────────────────────────────────────────────────────────────────
async function api(method, path, body=null) {
    // Don't add /api prefix for skills and banner routes
    let fullUrl;
    if (path.startsWith('/skills') || path.startsWith('/banner')) {
        fullUrl = path;
    } else {
        fullUrl = `/api${path}`;
    }

    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const storedToken = localStorage.getItem('rpg_token');
    if (storedToken) opts.headers['Authorization'] = `Bearer ${storedToken}`;
    opts.headers['X-Build-Version'] = '2026-07-09-v1';
    if (window.tabSession) opts.headers['X-Tab-Session'] = window.tabSession;
    if (body instanceof FormData) {
        opts.body = body;
        delete opts.headers['Content-Type'];
    } else if (body) {
        opts.body = JSON.stringify(body);
    }

    // Trusted-event check: flag state-changing calls without recent user interaction
    if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && 
        path.indexOf('/auth/') === -1 && 
        path.indexOf('/missions/tab-viewed') === -1 &&
        window.__botDetectionEnabled !== false) {
        var msSinceEvent = Date.now() - (window.__lastTrustedEvent || 0);
        if (msSinceEvent > 3000) {
            var token2 = localStorage.getItem('rpg_token');
            if (token2) {
                fetch('/api/game/admin/report-dom-mutation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token2 },
                    body: JSON.stringify({ mutation_type: 'untrusted_api', target_info: path.slice(0, 100), detail: method + ' ' + path + ' (' + msSinceEvent + 'ms since last trusted event)' })
                }).catch(function(){});
            }
        }
    }

    try {
        const res = await fetch(fullUrl, opts);
        const text = await res.text();

        // Check for ban warning header (level 1 warning)
        const banWarning = res.headers.get('X-Ban-Warning');
        if (banWarning && !window.__banWarningShown) {
            window.__banWarningShown = true;
            const msg = decodeURIComponent(banWarning);
            setTimeout(function() { openGameNoticeDialog({ title: '⚠️ Warning', message: 'You have been detected violating the Terms of Service.<br><br><strong>Reason:</strong> ' + escHtml(msg), confirmLabel: 'I Understand' }); }, 100);
        }
        // Check for ban rejection (level 2/3)
        if (res.status === 403) {
            var banData = null;
            try { var _bd = JSON.parse(text); if (_bd.ban) banData = _bd; } catch (_) {}
            if (banData) {
                if (!window.__banLockShown) {
                    window.__banLockShown = true;
                    var banTitle = banData.ban_level === 2 ? '🔒 Account Locked' : '🔒 Account Banned';
                    var banMsg = banData.ban_level === 2
                        ? 'Your account is temporarily locked.'
                        : 'Your account has been permanently banned.';
                    if (banData.ban_reason) banMsg += '<br><br><strong>Reason:</strong> ' + escHtml(banData.ban_reason);
                    if (banData.ban_expires_at) {
                        var remainingSecs = banData.ban_expires_at - Math.floor(Date.now() / 1000);
                        if (remainingSecs > 0) {
                            var mins = Math.ceil(remainingSecs / 60);
                            if (mins >= 60) {
                                var hrs = Math.floor(mins / 60);
                                mins = mins % 60;
                                banMsg += '<br><br><strong>Time remaining:</strong> ' + hrs + 'h ' + mins + 'm';
                            } else {
                                banMsg += '<br><br><strong>Time remaining:</strong> ' + mins + ' minutes';
                            }
                        }
                    }
                    setTimeout(function() { openGameNoticeDialog({ title: banTitle, message: banMsg, confirmLabel: 'OK' }); }, 100);
                }
                logout();
                throw new Error(banData.error || 'Account banned');
            }
        }
        if (!res.ok) {
            console.error('[API ERROR]', res.status, text.substring(0, 300));
            let errMsg;
            try { const ed = JSON.parse(text); errMsg = ed.error || `HTTP ${res.status}`; }
            catch { errMsg = text.trim() || `Request failed (${res.status})`; }

            // Handle single-device login enforcement without spamming alerts:
            // we only want to auto-logout when the server says the session was replaced.
            if (res.status === 401 && errMsg === 'Session expired') {
                if (!window.__forcedLogoutShown) {
                    window.__forcedLogoutShown = true;
                    logout();
                    alert('Logged out: your account was logged in from another device/browser.');
                }
                throw new Error(errMsg);
            }
            // If the token is missing/invalid, don't spam alerts; just surface the error.
            // (The UI can navigate to login as needed.)
            if (res.status === 401 && (errMsg === 'No token' || errMsg === 'Invalid token')) {
                if (!window.__auth401Seen) window.__auth401Seen = true;
                throw new Error(errMsg);
            }

            throw new Error(errMsg);
        }
        if (!text.trim()) return {};
        try { const data = JSON.parse(text); return data; }
        catch (pe) { console.error('[API] JSON parse failed:', pe, 'Raw:', text.substring(0, 200)); throw new Error('Invalid response from server'); }
    } catch (err) { console.error('[API FAIL]', method, fullUrl, err); throw err; }
}

function formatTrainingProgressText(status) {
    const total = Number(status?.progressPercent ?? status?.progressCurrent ?? status?.progress_current ?? 0);
    const start = Number(status?.progressStart ?? status?.progress_start ?? total);
    const gained = Math.max(0, total - start);
    const totalText = `${total < 10 ? total.toFixed(1) : Math.floor(total)}% total learned`;
    const gainText = gained >= 0.1 ? ` · +${gained.toFixed(1)}% this session` : '';
    const hoursToFull = Number(status?.hoursToFull ?? 0);
    return `${totalText}${gainText} · ${hoursToFull.toFixed(1)}h to full`;
}

async function loadCharacterRoster() {
    if (!token) return;
    try {
        const data = await api('GET', '/game/characters');
        accountCharacters = data.characters || [];
        activeCharacterId = data.activeCharacterId || character?.id || null;
        maxCharacterSlots = data.maxCharacters || 4;
        availableCharacterClasses = data.availableClasses || availableCharacterClasses;
        renderCharacterSwitcherButton();
        renderCharacterSwitcher();
        syncCreateClassAvailability();
    } catch (e) {
        console.error('Failed to load character roster:', e);
    }
}

async function syncActiveCharacterState() {
    if (!token) return;
    try {
        character = await api('GET', '/game/character');
        activeCharacterId = character?.id || null;
        await loadCharacterRoster();
        renderTopBar();
    } catch (e) {
        console.error('Failed to sync active character state:', e);
    }
}

function renderCharacterSwitcherButton() {
    const btn = document.getElementById('topbar-character-switch');
    if (!btn) return;
    const total = accountCharacters.length || 0;
    btn.textContent = `🧭 ${total}/${maxCharacterSlots}`;
    btn.title = total > 0
        ? `Switch character (${total}/${maxCharacterSlots})`
        : 'Create your first character';
}

function syncCreateClassAvailability() {
    ensureCreateClassArt();
    const usedClasses = new Set(accountCharacters.map(c => String(c.class || '').toLowerCase()));
    document.querySelectorAll('.class-card').forEach(card => {
        const className = String(card.dataset.class || '').toLowerCase();
        const taken = usedClasses.has(className);
        card.classList.toggle('class-card-taken', taken);
        card.style.pointerEvents = taken ? 'none' : '';
        card.title = taken ? 'You already have this class' : '';
        if (taken && selectedClass === className) {
            selectedClass = null;
            card.classList.remove('selected');
        }
    });
}

function ensureCreateClassArt() {
    document.querySelectorAll('.class-card').forEach(card => {
        if (card.dataset.artReady === 'true') return;
        const className = String(card.dataset.class || '').toLowerCase();
        const fallbackMap = {
            warrior: '🛡️',
            mage: '🔮',
            rogue: '🗡️',
            paladin: '✨',
        };
        const oldIcon = card.querySelector('.class-icon');
        const art = document.createElement('div');
        art.className = 'class-art';
        art.innerHTML = `
            <img src="/images/class/${className}-st.png" alt="${capitalize(className)} art" class="class-art-img" data-error-hide="true" data-error-next-display="flex">
            <div class="class-art-fallback" style="display:none">${fallbackMap[className] || '⚔️'}</div>
        `;
        if (oldIcon) oldIcon.replaceWith(art);
        else card.prepend(art);
        card.dataset.artReady = 'true';
    });
}

function openCharacterCreation() {
    closeCharacterSwitcher();
    selectedClass = null;
    document.getElementById('char-name').value = '';
    setError('create-error', '');
    document.querySelectorAll('.class-card').forEach(card => card.classList.remove('selected'));
    syncCreateClassAvailability();
    showScreen('create');
}

async function openCharacterSwitcher() {
    closeTopbarMenu();
    await syncActiveCharacterState();
    renderCharacterSwitcher();
    document.getElementById('character-switch-modal')?.classList.remove('hidden');
}

function closeCharacterSwitcher() {
    document.getElementById('character-switch-modal')?.classList.add('hidden');
}

function getSkillUnlockMenuState() {
    const mp = character?.mission_points ?? 0;
    const mpMax = character?.mp_max || 120;
    const dailySpent = character?.daily_mp_spent ?? 0;
    const unlocked = !!character?.skills_unlocked;
    return {
        mp,
        mpMax,
        dailySpent,
        unlocked,
        remaining: Math.max(0, 60 - dailySpent)
    };
}

function renderTopbarMenu() {
    const content = document.getElementById('topbar-menu-content');
    if (!content || !character) return;
    const eventName = character?.active_event?.name || 'No active event right now';
    const { mp, mpMax, dailySpent, unlocked, remaining } = getSkillUnlockMenuState();
    const referralCode = character?.referral_code || username || '';
    const referralLink = referralCode ? getReferralLink(referralCode) : '';
    const switcherLabel = `🧭 Switch Character (${accountCharacters.length}/${maxCharacterSlots})`;
    const mpLabel = unlocked
        ? `Skills unlocked today · ${mp}/${mpMax} MP`
        : `Spend ${remaining} more MP to unlock skills · ${mp}/${mpMax} MP`;

    content.innerHTML = `
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Live Status</div>
            <div class="topbar-menu-info-card">
                <div class="topbar-menu-info-title">Active Event</div>
                <div class="topbar-menu-info-value" data-banner-action="true" style="cursor:pointer">${escHtml(eventName)}</div>
            </div>
            <div class="topbar-menu-info-card">
                <div class="topbar-menu-info-title">Skill Unlock</div>
                <div class="topbar-menu-info-value">${escHtml(mpLabel)}</div>
                <button class="topbar-menu-action" ${actionAttrs('showTabAndCloseMenu', 'skills')}>
                    ${unlocked ? 'Open Skills' : `Go to Skills (${dailySpent}/60)`}
                </button>
            </div>
        </div>
<div class="topbar-menu-section">
            <div class="topbar-menu-label">Quick Actions</div>
            <div class="topbar-menu-grid">
                <button class="topbar-menu-action" ${actionAttrs('openCharacterSwitcher')}>
                    🧭 ${switcherLabel}
                </button>
                <button class="topbar-menu-action" ${actionAttrs('openGameGuide')}>
                    📘 Open Game Guide
                    <span class="topbar-menu-meta">How progression, classes, and builds work</span>
                </button>
                <button class="topbar-menu-action" ${actionAttrs('showTabAndCloseMenu', 'event')}>
                    🎴 Active Event
                    <span class="topbar-menu-meta">Limited time banner pulls</span>
                </button>
                <button class="topbar-menu-action ${character.weekly_claimable_count > 0 ? 'claimable-highlight' : ''}" ${actionAttrs('openWeeklyTasksModal')}>
                    📅 Weekly Tasks
                    ${character.weekly_claimable_count > 0 ? '<span class="exclamation-point">!</span>' : ''}
                    <span class="topbar-menu-meta">Earn gems, gold, materials, and loot boxes</span>
                </button>
                <button class="topbar-menu-action topbar-menu-action-mp" ${actionAttrs('convertMpToPotion')}>
                    💎✨ Convert MP
                    <span class="topbar-menu-meta">${specialManaPotionCount}/5 Special Mana Potions</span>
                </button>
                <button class="topbar-menu-action" ${actionAttrs('openBugReportFromMenu')}>
                    🐛 Report a Bug
                </button>
                <button class="topbar-menu-action topbar-menu-action-danger" ${actionAttrs('logoutFromMenu')}>
                    Logout
                </button>
            </div>
        </div>
                <button class="topbar-menu-action" ${actionAttrs('openBugReportFromMenu')}>
                    🐛 Report a Bug
                </button>
                <button class="topbar-menu-action topbar-menu-action-danger" ${actionAttrs('logoutFromMenu')}>
                    Logout
                </button>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Invite Players</div>
            <div class="topbar-menu-info-card topbar-menu-referral-card">
                <span class="topbar-menu-referral-kicker">Referral Link</span>
                <span class="topbar-menu-referral-code">@${escHtml(referralCode || 'Unavailable')}</span>
                <div class="topbar-menu-referral-stats">
                    <div class="topbar-menu-referral-stat">
                        <span class="topbar-menu-referral-stat-label">Registered</span>
                        <span class="topbar-menu-referral-stat-value">${Number(character?.referrals_registered || 0)}</span>
                    </div>
                    <div class="topbar-menu-referral-stat">
                        <span class="topbar-menu-referral-stat-label">Reached Lv.5</span>
                        <span class="topbar-menu-referral-stat-value">${Number(character?.referrals_level5 || 0)}</span>
                    </div>
                </div>
                <div class="topbar-menu-referral-link-wrap">
                    <span class="topbar-menu-referral-link-label">Invite URL</span>
                    <span class="topbar-menu-referral-link">${escHtml(referralLink)}</span>
                </div>
                <button class="topbar-menu-inline-btn" ${actionAttrs('copyReferralLink')}>
                    Copy Invite Link
                </button>
                <div id="topbar-menu-flash" class="topbar-menu-flash hidden"></div>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Settings</div>
            <button class="topbar-menu-toggle ${alwaysSkipBattleAnimations ? 'active' : ''}" ${actionAttrs('toggleAlwaysSkipBattleAnimations')}>
                <span>Always skip battle animations</span>
                <span class="topbar-menu-toggle-state">${alwaysSkipBattleAnimations ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${assistantEnabled ? 'active' : ''}" ${actionAttrs('toggleAssistant')}>
                <span>Assistant helper</span>
                <span class="topbar-menu-toggle-state">${assistantEnabled ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${chatEnabled ? 'active' : ''}" ${actionAttrs('toggleChatEnabled')}>
                <span>Global chat widget</span>
                <span class="topbar-menu-toggle-state">${chatEnabled ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_messages !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'messages')}>
                <span>Inbox badge: messages</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_messages !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_battles !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'battles')}>
                <span>Inbox badge: battle reports</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_battles !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_missions !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'missions')}>
                <span>Inbox badge: mission reports</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_missions !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${showUpgradeTab ? 'active' : ''}" ${actionAttrs('toggleUpgradeTab')}>
                <span>Upgrade tab in character menu</span>
                <span class="topbar-menu-toggle-state">${showUpgradeTab ? 'On' : 'Off'}</span>
            </button>
            <div class="topbar-menu-info-card" style="margin-top:10px">
                <div class="topbar-menu-info-title">Recovery Email (Optional)</div>
                <div class="topbar-menu-meta" style="margin-top:2px">Used only for password reset. Leave blank to disable recovery email.</div>
                <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
                    <input id="settings-email" class="input-field" style="flex:1;margin:0" placeholder="you@example.com" value="${escHtml(character?.email || '')}">
                    <button class="topbar-menu-inline-btn" style="flex-shrink:0" ${actionAttrs('saveRecoveryEmail')}>Save</button>
                </div>
                <div id="settings-email-msg" class="topbar-menu-flash hidden" style="margin-top:10px"></div>
            </div>
        </div>`;
}

function renderTopbarMenu() {
    const content = document.getElementById('topbar-menu-content');
    if (!content || !character) return;
    const eventName = character?.active_event?.name || 'No active event right now';
    const { mp, mpMax, dailySpent, unlocked, remaining } = getSkillUnlockMenuState();
    const referralCode = character?.referral_code || username || '';
    const referralLink = referralCode ? getReferralLink(referralCode) : '';
    const switcherLabel = `Switch Character (${accountCharacters.length}/${maxCharacterSlots})`;
    const mpLabel = unlocked
        ? `Skills unlocked today · ${mp}/${mpMax} MP`
        : `Spend ${remaining} more MP to unlock skills · ${mp}/${mpMax} MP`;

    content.innerHTML = `
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Live Status</div>
            <div class="topbar-menu-info-card">
                <div class="topbar-menu-info-title">Active Event</div>
                <div class="topbar-menu-info-value" data-banner-action="true" style="cursor:pointer">${escHtml(eventName)}</div>
            </div>
            <div class="topbar-menu-info-card">
                <div class="topbar-menu-info-title">Skill Unlock</div>
                <div class="topbar-menu-info-value">${escHtml(mpLabel)}</div>
                <button class="topbar-menu-action" ${actionAttrs('showTabAndCloseMenu', 'skills')}>
                    ${unlocked ? 'Open Skills' : `Go to Skills (${dailySpent}/60)`}
                </button>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Quick Actions</div>
            <div class="topbar-menu-grid">
                <button class="topbar-menu-action" ${actionAttrs('openCharacterSwitcher')}>
                    🧭 ${switcherLabel}
                </button>
                <button class="topbar-menu-action" ${actionAttrs('openGameGuide')}>
                    📘 Open Game Guide
                    <span class="topbar-menu-meta">How progression, classes, and builds work</span>
                </button>
                <button class="topbar-menu-action ${character.weekly_claimable_count > 0 ? 'claimable-highlight' : ''}" ${actionAttrs('openWeeklyTasksModal')}>
                    📅 Weekly Tasks
                    ${character.weekly_claimable_count > 0 ? '<span class="exclamation-point">!</span>' : ''}
                    <span class="topbar-menu-meta">Earn gems, gold, materials, and loot boxes</span>
                </button>
                <button class="topbar-menu-action topbar-menu-action-mp" ${actionAttrs('convertMpToPotion')}>
                    💎✨ Convert MP
                    <span class="topbar-menu-meta">${specialManaPotionCount}/5 Special Mana Potions</span>
                </button>
                <button class="topbar-menu-action" ${actionAttrs('openBugReportFromMenu')}>
                    🐛 Report a Bug
                </button>
                <button class="topbar-menu-action topbar-menu-action-danger" ${actionAttrs('logoutFromMenu')}>
                    Logout
                </button>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Invite Players</div>
            <div class="topbar-menu-info-card topbar-menu-referral-card">
                <span class="topbar-menu-referral-kicker">Referral Link</span>
                <span class="topbar-menu-referral-code">@${escHtml(referralCode || 'Unavailable')}</span>
                <span class="topbar-menu-meta">Registered: ${Number(character?.referrals_registered || 0)} · Reached Lv.5: ${Number(character?.referrals_level5 || 0)}</span>
                <button class="topbar-menu-inline-btn" ${actionAttrs('copyReferralLink')}>
                    Copy Invite Link
                </button>
                <span class="topbar-menu-referral-link">${escHtml(referralLink)}</span>
                <div id="topbar-menu-flash" class="topbar-menu-flash hidden"></div>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Settings</div>
            <button class="topbar-menu-toggle ${alwaysSkipBattleAnimations ? 'active' : ''}" ${actionAttrs('toggleAlwaysSkipBattleAnimations')}>
                <span>Always skip battle animations</span>
                <span class="topbar-menu-toggle-state">${alwaysSkipBattleAnimations ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${assistantEnabled ? 'active' : ''}" ${actionAttrs('toggleAssistant')}>
                <span>Assistant helper</span>
                <span class="topbar-menu-toggle-state">${assistantEnabled ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${chatEnabled ? 'active' : ''}" ${actionAttrs('toggleChatEnabled')}>
                <span>Global chat widget</span>
                <span class="topbar-menu-toggle-state">${chatEnabled ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_messages !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'messages')}>
                <span>Inbox badge: messages</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_messages !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_battles !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'battles')}>
                <span>Inbox badge: battle reports</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_battles !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_missions !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'missions')}>
                <span>Inbox badge: mission reports</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_missions !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${showUpgradeTab ? 'active' : ''}" ${actionAttrs('toggleUpgradeTab')}>
                <span>Upgrade tab in character menu</span>
                <span class="topbar-menu-toggle-state">${showUpgradeTab ? 'On' : 'Off'}</span>
            </button>
            <div class="topbar-menu-info-card" style="margin-top:10px">
                <div class="topbar-menu-info-title">Recovery Email (Optional)</div>
                <div class="topbar-menu-meta" style="margin-top:2px">Used only for password reset. Leave blank to disable recovery email.</div>
                <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
                    <input id="settings-email" class="input-field" style="flex:1;margin:0" placeholder="you@example.com" value="${escHtml(character?.email || '')}">
                    <button class="topbar-menu-inline-btn" style="flex-shrink:0" ${actionAttrs('saveRecoveryEmail')}>Save</button>
                </div>
                <div id="settings-email-msg" class="topbar-menu-flash hidden" style="margin-top:10px"></div>
            </div>
        </div>`;
}

async function openTopbarMenu() {
    await syncActiveCharacterState();
    renderTopbarMenu();
    enhanceTopbarReferralSection();
    document.getElementById('topbar-menu-modal')?.classList.remove('hidden');
}

function closeTopbarMenu() {
    document.getElementById('topbar-menu-modal')?.classList.add('hidden');
}

function showTabAndCloseMenu(tabName) {
    closeTopbarMenu();
    showTab(tabName);
}
window.showTabAndCloseMenu = showTabAndCloseMenu;

function openBugReportFromMenu() {
    closeTopbarMenu();
    openBugReport();
}

function logoutFromMenu() {
    closeTopbarMenu();
    logout();
}

function getReferralLink(referralCode) {
    if (!referralCode) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('ref', referralCode.replace(/^@+/, ''));
    return url.toString();
}

function setTopbarMenuFlash(message, isError = false) {
    const flash = document.getElementById('topbar-menu-flash');
    if (!flash) return;
    if (flash._hideTimer) {
        clearTimeout(flash._hideTimer);
        flash._hideTimer = null;
    }
    flash.textContent = message;
    flash.classList.remove('hidden');
    flash.classList.toggle('error', !!isError);
    flash._hideTimer = setTimeout(() => {
        flash.classList.add('hidden');
        flash.classList.remove('error');
        flash._hideTimer = null;
    }, isError ? 3200 : 2200);
}

function enhanceTopbarReferralSection() {
    const card = document.querySelector('#topbar-menu-content .topbar-menu-referral-card');
    if (!card) return;

    card.querySelectorAll('.topbar-menu-referral-pending, .topbar-menu-referral-claim-note, .topbar-menu-inline-btn-claim').forEach(el => el.remove());

    const pendingGold = Number(character?.pending_referral_gold || 0);
    const pendingGems = Number(character?.pending_referral_gems || 0);
    if (pendingGold <= 0 && pendingGems <= 0) return;

    const actions = card.querySelector('.topbar-menu-referral-actions');
    const flash = card.querySelector('#topbar-menu-flash');
    if (!actions || !flash) return;

    const pendingWrap = document.createElement('div');
    pendingWrap.className = 'topbar-menu-referral-stats topbar-menu-referral-pending';

    if (pendingGold > 0) {
        const goldRow = document.createElement('div');
        goldRow.className = 'topbar-menu-referral-stat topbar-menu-referral-stat-claimable';
        goldRow.innerHTML = `
            <span class="topbar-menu-referral-stat-label">Pending Gold</span>
            <span class="topbar-menu-referral-stat-value">${pendingGold.toLocaleString()}</span>
        `;
        pendingWrap.appendChild(goldRow);
    }

    if (pendingGems > 0) {
        const gemsRow = document.createElement('div');
        gemsRow.className = 'topbar-menu-referral-stat topbar-menu-referral-stat-claimable';
        gemsRow.innerHTML = `
            <span class="topbar-menu-referral-stat-label">Pending Gems</span>
            <span class="topbar-menu-referral-stat-value">${pendingGems.toLocaleString()}</span>
        `;
        pendingWrap.appendChild(gemsRow);
    }

    const note = document.createElement('div');
    note.className = 'topbar-menu-referral-claim-note';
    note.textContent = 'Claim on this character to send the rewards here.';

    const claimBtn = document.createElement('button');
    claimBtn.className = 'topbar-menu-inline-btn topbar-menu-inline-btn-claim';
    claimBtn.setAttribute('type', 'button');
    claimBtn.setAttribute('data-action', 'claimReferralRewards');
    claimBtn.textContent = 'Claim Rewards';

    card.insertBefore(pendingWrap, flash);
    card.insertBefore(note, flash);
    actions.insertBefore(claimBtn, actions.firstChild);
}

async function copyReferralLink() {
    const referralCode = character?.referral_code || username || '';
    const referralLink = getReferralLink(referralCode);
    if (!referralLink) return;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(referralLink);
        } else {
            const input = document.createElement('input');
            input.value = referralLink;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
        }
        setTopbarMenuFlash('Referral link copied.');
    } catch (e) {
        setTopbarMenuFlash('Could not copy the referral link.', true);
    }
}

async function claimReferralRewards() {
    try {
        const response = await api('POST', '/game/referrals/claim');
        if (response?.character) {
            character = response.character;
            syncClientPreferencesFromCharacter();
            renderTopBar();
            renderTopbarMenu();
            enhanceTopbarReferralSection();
        }
        setTopbarMenuFlash(response?.message || 'Referral rewards claimed.');
    } catch (e) {
        setTopbarMenuFlash(e.message || 'Could not claim referral rewards.', true);
    }
}

function renderTopbarMenu() {
    const content = document.getElementById('topbar-menu-content');
    if (!content || !character) return;
    const eventName = character?.active_event?.name || 'No active event right now';
    const { mp, mpMax, dailySpent, unlocked, remaining } = getSkillUnlockMenuState();
    const referralCode = character?.referral_code || username || '';
    const referralLink = referralCode ? getReferralLink(referralCode) : '';
    const switcherLabel = `Switch Character (${accountCharacters.length}/${maxCharacterSlots})`;
    const mpLabel = unlocked
        ? `Skills unlocked today · ${mp}/${mpMax} MP`
        : `Spend ${remaining} more MP to unlock skills · ${mp}/${mpMax} MP`;

    content.innerHTML = `
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Live Status</div>
            <div class="topbar-menu-info-card">
                <div class="topbar-menu-info-title">Active Event</div>
                <div class="topbar-menu-info-value" data-banner-action="true" style="cursor:pointer">${escHtml(eventName)}</div>
            </div>
            <div class="topbar-menu-info-card">
                <div class="topbar-menu-info-title">Skill Unlock</div>
                <div class="topbar-menu-info-value">${escHtml(mpLabel)}</div>
                <button class="topbar-menu-action" ${actionAttrs('showTabAndCloseMenu', 'skills')}>
                    ${unlocked ? 'Open Skills' : `Go to Skills (${dailySpent}/60)`}
                </button>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Quick Actions</div>
            <div class="topbar-menu-grid">
                <button class="topbar-menu-action" ${actionAttrs('openCharacterSwitcher')}>
                    🧭 ${switcherLabel}
                </button>
                <button class="topbar-menu-action" ${actionAttrs('openGameGuide')}>
                    📘 Open Game Guide
                    <span class="topbar-menu-meta">How progression, classes, and builds work</span>
                </button>
                <button class="topbar-menu-action ${character.weekly_claimable_count > 0 ? 'claimable-highlight' : ''}" ${actionAttrs('openWeeklyTasksModal')}>
                    📅 Weekly Tasks
                    ${character.weekly_claimable_count > 0 ? '<span class="exclamation-point">!</span>' : ''}
                    <span class="topbar-menu-meta">Earn gems, gold, materials, and loot boxes</span>
                </button>
                <button class="topbar-menu-action topbar-menu-action-mp" ${actionAttrs('convertMpToPotion')}>
                    💎✨ Convert MP
                    <span class="topbar-menu-meta">${specialManaPotionCount}/5 Special Mana Potions</span>
                </button>
                <button class="topbar-menu-action" ${actionAttrs('openBugReportFromMenu')}>
                    🐛 Report a Bug
                </button>
                <button class="topbar-menu-action topbar-menu-action-danger" ${actionAttrs('logoutFromMenu')}>
                    Logout
                </button>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Invite Players</div>
            <div class="topbar-menu-info-card topbar-menu-referral-card">
                <span class="topbar-menu-referral-kicker">Referral Link</span>
                <span class="topbar-menu-referral-code">@${escHtml(referralCode || 'Unavailable')}</span>
                <div class="topbar-menu-referral-stats">
                    <div class="topbar-menu-referral-stat">
                        <span class="topbar-menu-referral-stat-label">Registered</span>
                        <span class="topbar-menu-referral-stat-value">${Number(character?.referrals_registered || 0)}</span>
                    </div>
                    <div class="topbar-menu-referral-stat">
                        <span class="topbar-menu-referral-stat-label">Reached Lv.5</span>
                        <span class="topbar-menu-referral-stat-value">${Number(character?.referrals_level5 || 0)}</span>
                    </div>
                </div>
                <div class="topbar-menu-referral-link-wrap">
                    <span class="topbar-menu-referral-link-label">Invite URL</span>
                    <span class="topbar-menu-referral-link">${escHtml(referralLink)}</span>
                </div>
                <div class="topbar-menu-referral-actions">
                    <button class="topbar-menu-inline-btn" ${actionAttrs('copyReferralLink')}>
                        Copy Invite Link
                    </button>
                </div>
                <div id="topbar-menu-flash" class="topbar-menu-flash hidden"></div>
            </div>
        </div>
        <div class="topbar-menu-section">
            <div class="topbar-menu-label">Settings</div>
            <button class="topbar-menu-toggle ${alwaysSkipBattleAnimations ? 'active' : ''}" ${actionAttrs('toggleAlwaysSkipBattleAnimations')}>
                <span>Always skip battle animations</span>
                <span class="topbar-menu-toggle-state">${alwaysSkipBattleAnimations ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${assistantEnabled ? 'active' : ''}" ${actionAttrs('toggleAssistant')}>
                <span>Assistant helper</span>
                <span class="topbar-menu-toggle-state">${assistantEnabled ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${chatEnabled ? 'active' : ''}" ${actionAttrs('toggleChatEnabled')}>
                <span>Global chat widget</span>
                <span class="topbar-menu-toggle-state">${chatEnabled ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_messages !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'messages')}>
                <span>Inbox badge: messages</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_messages !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_battles !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'battles')}>
                <span>Inbox badge: battle reports</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_battles !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${character?.inbox_badge_missions !== false ? 'active' : ''}" ${actionAttrs('toggleInboxBadgeSetting', 'missions')}>
                <span>Inbox badge: mission reports</span>
                <span class="topbar-menu-toggle-state">${character?.inbox_badge_missions !== false ? 'On' : 'Off'}</span>
            </button>
            <button class="topbar-menu-toggle ${showUpgradeTab ? 'active' : ''}" ${actionAttrs('toggleUpgradeTab')}>
                <span>Upgrade tab in character menu</span>
                <span class="topbar-menu-toggle-state">${showUpgradeTab ? 'On' : 'Off'}</span>
            </button>
            <div class="topbar-menu-info-card" style="margin-top:10px">
                <div class="topbar-menu-info-title">Recovery Email (Optional)</div>
                <div class="topbar-menu-meta" style="margin-top:2px">Used only for password reset. Leave blank to disable recovery email.</div>
                <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
                    <input id="settings-email" class="input-field" style="flex:1;margin:0" placeholder="you@example.com" value="${escHtml(character?.email || '')}">
                    <button class="topbar-menu-inline-btn" style="flex-shrink:0" ${actionAttrs('saveRecoveryEmail')}>Save</button>
                </div>
                <div id="settings-email-msg" class="topbar-menu-flash hidden" style="margin-top:10px"></div>
            </div>
        </div>`;
}

function syncClientPreferencesFromCharacter() {
    if (!character) return;
    alwaysSkipBattleAnimations = !!character.skip_battle_animations;
    assistantEnabled = character.assistant_enabled !== false;
    chatEnabled = character.chat_enabled !== false;
    updateTopbarChatButton();
}

function updateHubUpgradeButtonVisibility() {
    const btn = document.getElementById('hub-btn-upgrade');
    if (btn) btn.style.display = showUpgradeTab ? '' : 'none';
}

async function toggleUpgradeTab() {
    showUpgradeTab = !showUpgradeTab;
    localStorage.setItem('rpg_show_upgrade', showUpgradeTab);
    renderTopbarMenu();
    updateHubUpgradeButtonVisibility();
    if (!showUpgradeTab) {
        const active = document.querySelector('.game-tab.active');
        if (active && active.id === 'tab-upgrade') showTab('character');
    }
}

async function toggleAlwaysSkipBattleAnimations() {
    const nextValue = !alwaysSkipBattleAnimations;
    const response = await api('POST', '/game/settings', { skipBattleAnimations: nextValue });
    if (response?.character) character = response.character;
    syncClientPreferencesFromCharacter();
    renderTopbarMenu();
}

async function toggleAssistant() {
    const nextValue = !assistantEnabled;
    const response = await api('POST', '/game/settings', { assistantEnabled: nextValue });
    if (response?.character) character = response.character;
    syncClientPreferencesFromCharacter();
    renderTopbarMenu();
    if (!assistantEnabled) {
        document.getElementById('assistant-notification')?.classList.add('hidden');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('assistant-highlight'));
    }
}

async function toggleChatEnabled() {
    const nextValue = !chatEnabled;
    const response = await api('POST', '/game/settings', { chatEnabled: nextValue });
    if (response?.character) character = response.character;
    syncClientPreferencesFromCharacter();
    updateTopbarChatButton();
    renderTopbarMenu();
    syncChatPolling();
    renderChatWidget();
}

function updateTopbarChatButton() {
    const btn = document.getElementById('topbar-chat-btn');
    if (!btn) return;
    if (chatEnabled) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

async function toggleInboxBadgeSetting(settingKey) {
    const payload = {};
    if (settingKey === 'messages') payload.inboxBadgeMessages = !(character?.inbox_badge_messages !== false);
    if (settingKey === 'battles') payload.inboxBadgeBattles = !(character?.inbox_badge_battles !== false);
    if (settingKey === 'missions') payload.inboxBadgeMissions = !(character?.inbox_badge_missions !== false);
    const response = await api('POST', '/game/settings', payload);
    if (response?.character) character = response.character;
    syncClientPreferencesFromCharacter();
    renderTopbarMenu();
    pollUnread();
}

async function saveRecoveryEmail() {
    const input = document.getElementById('settings-email');
    const email = input ? String(input.value || '').trim() : '';
    try {
        const res = await api('POST', '/auth/email', { email });
        if (character) character.email = res?.email || null;
        setTopbarMenuFlash(res?.email ? 'Recovery email saved.' : 'Recovery email cleared.');
        await openGameNoticeDialog({
            title: 'Recovery Email',
            message: res?.email
                ? `<div style="font-size:0.95rem;line-height:1.6;color:var(--text-bright)">Recovery email saved.</div><div style="margin-top:8px;font-size:0.85rem;color:var(--text-dim)">${escHtml(res.email)}</div>`
                : `<div style="font-size:0.95rem;line-height:1.6;color:var(--text-bright)">Recovery email cleared.</div><div style="margin-top:8px;font-size:0.85rem;color:var(--text-dim)">Password reset will be unavailable unless you add one.</div>`,
            confirmLabel: 'OK',
        });
    } catch (e) {
        setTopbarMenuFlash(e.message || 'Failed to save email.', true);
        await openGameNoticeDialog({
            title: 'Recovery Email',
            message: `<div style="font-size:0.95rem;line-height:1.6;color:var(--text-bright)">Could not save recovery email.</div><div style="margin-top:8px;font-size:0.85rem;color:var(--red-light)">${escHtml(e.message || 'Unknown error')}</div>`,
            confirmLabel: 'OK',
            danger: true,
        });
    }
}

function renderCharacterSwitcher() {
    const content = document.getElementById('character-switch-content');
    if (!content) return;
    const remaining = Math.max(0, maxCharacterSlots - accountCharacters.length);
    content.innerHTML = `
        <div class="character-switch-header">
            <div>
                <div class="character-switch-title">Your Characters</div>
                <div class="character-switch-sub">${accountCharacters.length}/${maxCharacterSlots} slots used</div>
            </div>
            ${remaining > 0 ? `<button class="btn-primary character-switch-create" ${actionAttrs('openCharacterCreation')}>+ New Character</button>` : ''}
        </div>
        <div class="character-switch-grid">
            ${accountCharacters.map(c => {
        const isActive = (c.id === (activeCharacterId || character?.id));
        return `<button class="character-switch-card ${isActive ? 'active' : ''}" ${isActive ? 'disabled' : actionAttrs('selectCharacter', c.id)}>
                    <img src="/images/class/${c.class}.png" alt="${c.class}" class="character-switch-avatar" data-error-hide="true">
                    <div class="character-switch-info">
                        <div class="character-switch-name">${escHtml(c.name)}</div>
                        <div class="character-switch-meta">Lv.${c.level} ${capitalize(c.class)}</div>
                    </div>
                    <div class="character-switch-state">${isActive ? 'Active' : 'Play'}</div>
                </button>`;
    }).join('')}
            ${Array.from({ length: remaining }, (_, i) => `
                <button class="character-switch-card empty" ${actionAttrs('openCharacterCreation')}>
                    <div class="character-switch-empty">Empty Slot ${accountCharacters.length + i + 1}</div>
                    <div class="character-switch-meta">Create another class</div>
                </button>
            `).join('')}
        </div>`;
}

async function selectCharacter(characterId) {
    try {
        const data = await api('POST', '/game/character/select', { characterId });
        character = data.character;
        activeCharacterId = character.id;

        // Reset dungeon state to prevent old floor/rooms from showing
        if (typeof resetDungeonState === 'function') {
            resetDungeonState();
        }

        await loadCharacterRoster();
        closeCharacterSwitcher();
        renderTopBar();
        const activeTab = TAB_ORDER.find(name => document.getElementById(`tab-${name}`)?.classList.contains('active')) || 'character';
        showTab(activeTab);
    } catch (e) {
        alert(e.message);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    window._setLoadingProgress(0, 'Initializing...');
    bindLegacyInlineHandlers(document);
    legacyHandlerObserver.observe(document.body, { childList: true, subtree: true });
    const characterHubTrigger = document.getElementById('character-hub-trigger');
    if (characterHubTrigger) {
        characterHubTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleCharacterHubInline();
        });
    }
    const inventoryHubTrigger = document.getElementById('inventory-hub-trigger');
    if (inventoryHubTrigger) {
        inventoryHubTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleInventoryHubInline();
        });
    }
    const missionsHubTrigger = document.getElementById('missions-hub-trigger');
    if (missionsHubTrigger) {
        missionsHubTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMissionsHubInline();
        });
    }
    document.querySelectorAll('#character-inline-hub .nav-sub-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const [tabName] = parseActionArgs(btn);
            if (tabName) navigateCharacterHub(tabName);
        });
    });
    document.querySelectorAll('#inventory-inline-hub .nav-sub-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const [tabName] = parseActionArgs(btn);
            if (tabName) navigateInventoryHub(tabName);
        });
    });
    document.querySelectorAll('#missions-inline-hub .nav-sub-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const [tabName] = parseActionArgs(btn);
            if (tabName) navigateMissionsHub(tabName);
        });
    });
    if (!document.getElementById('item-tooltip')) {
        const tt=document.createElement('div');
        tt.id='item-tooltip'; tt.className='item-tooltip hidden';
        tt.addEventListener('mouseenter', cancelHideTooltip);
        tt.addEventListener('mouseleave', scheduleHideTooltip);
        document.body.appendChild(tt);
    }
    updateHubUpgradeButtonVisibility();
    initMissionTimer();
    window._setLoadingProgress(10, 'Connecting to server...');
    if (token) {
        try {
            window._setLoadingProgress(30, 'Loading character data...');
            const [charData] = await Promise.all([
                api('GET','/game/character'),
                loadCharacterRoster()
            ]);
            character = charData;
            window._setLoadingProgress(60, 'Rendering interface...');
            showScreen('game');
            // Check SW status — only preload assets if SW is enabled (to warm cache)
            var swEnabled = false;
            var botDetectionEnabled = true;
            if ('serviceWorker' in navigator) {
                try {
                    var swRes = await fetch('/api/game/sw-status');
                    var swData = await swRes.json();
                    swEnabled = swData.enabled;
                    botDetectionEnabled = swData.botDetectionEnabled !== false;
                } catch(e) {}
            } else {
                try {
                    var swRes2 = await fetch('/api/game/sw-status');
                    var swData2 = await swRes2.json();
                    botDetectionEnabled = swData2.botDetectionEnabled !== false;
                } catch(e) {}
            }
            window.__botDetectionEnabled = botDetectionEnabled;
            if (swEnabled) {
                var manifest = window.ASSET_MANIFEST || [];
                if (!manifest.length) { console.error('[preload] ASSET_MANIFEST empty or missing'); }
                var total = manifest.length;
                var loaded = 0;
                window._setLoadingProgress(65, 'Loading assets (0/' + total + ')...');
                var batchSize = 8;
                for (var i = 0; i < total; i += batchSize) {
                    var batch = manifest.slice(i, i + batchSize);
                    await Promise.all(batch.map(function(url) {
                        return fetch(url).then(function() {
                            loaded++;
                            var pct = 65 + Math.floor((loaded / total) * 30);
                            window._setLoadingProgress(pct, 'Loading assets (' + loaded + '/' + total + ')...');
                        }).catch(function() {
                            loaded++;
                        });
                    }));
                }
            }
            window._setLoadingProgress(100, '');
            if (window._dismissOverlay) window._dismissOverlay();
        }
        catch (e) {
            if (e.message==='No character found') { await loadCharacterRoster(); showScreen('create'); if (window._dismissOverlay) window._dismissOverlay(); }
            else { token=null; localStorage.removeItem('rpg_token'); showScreen('auth'); if (window._dismissOverlay) window._dismissOverlay(); }
        }
    } else { showScreen('auth'); if (window._dismissOverlay) window._dismissOverlay(); }
});

// ── Client-side CSP violation reporter ─────────────────────────────────────
document.addEventListener('securitypolicyviolation', (e) => {
    if (window.__botDetectionEnabled === false) return;
    const body = {
        blocked_uri: e.blockedURI,
        document_uri: e.documentURI,
        violated_directive: e.violatedDirective,
        effective_directive: e.effectiveDirective,
        original_policy: e.originalPolicy,
        source_file: e.sourceFile,
        line_number: e.lineNumber,
        column_number: e.columnNumber
    };
    const token = localStorage.getItem('rpg_token');
    if (token) {
        fetch('/api/game/admin/csp-violation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(body)
        }).catch(() => {});
    }
});

// ── DOM Mutation Observer (detect client-side tampering) ──────────────────
// Watches for injected script/iframe/style elements and inline event handlers.
// Uses ASSET_MANIFEST + DOM snapshot to ignore the game's own assets.
(function(){
    var reportQueue = [];
    var reportTimer = null;
    function flushReports() {
        if (!reportQueue.length) return;
        // Skip flushing when bot detection is disabled
        if (window.__botDetectionEnabled === false) { reportQueue = []; return; }
        var batch = reportQueue.splice(0);
        var token = localStorage.getItem('rpg_token');
        if (!token) return;
        fetch('/api/game/admin/report-dom-mutation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ mutation_type: 'batch', detail: JSON.stringify(batch.slice(0, 20)), target_info: batch.length + ' mutations' })
        }).catch(function(){});
    }
    function queueReport(type, target, detail) {
        if (window.__botDetectionEnabled === false) return;
        reportQueue.push({ type: type, target: (target || '').slice(0, 200), detail: (detail || '').slice(0, 500), ts: Date.now() });
        if (!reportTimer) reportTimer = setTimeout(function() { reportTimer = null; flushReports(); }, 10000);
    }
    var suspiciousTags = { 'SCRIPT':1, 'IFRAME':1, 'EMBED':1, 'OBJECT':1, 'APPLET':1, 'FRAME':1, 'FRAMESET':1, 'LINK':1, 'STYLE':1, 'BASE':1 };
    // Build set of known asset URLs from manifest (loaded before app.js)
    var knownUrls = {};
    if (window.ASSET_MANIFEST) {
        window.ASSET_MANIFEST.forEach(function(url) { knownUrls[url] = 1; });
    }
    // Also snapshot script/link elements already in DOM — only add legit asset URLs to knownUrls
    if (document.querySelectorAll) {
        document.querySelectorAll('script[src], link[href]').forEach(function(el) {
            var u = el.src || el.href;
            if (u && (u.indexOf('/js/') !== -1 || u.indexOf('/css/') !== -1 || u.indexOf('/images/') !== -1 || u.indexOf('asset-manifest') !== -1)) {
                knownUrls[u] = 1;
            }
        });
    }
    function startObserver() {
        if (window.__botDetectionEnabled === false) return;
        var obs = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                if (m.type === 'childList' && m.addedNodes.length) {
                    m.addedNodes.forEach(function(n) {
                        if (n.nodeType === 1 && suspiciousTags[n.tagName]) {
                            var src = n.src || n.href || n.data || '';
                            if (src && knownUrls[src]) return;
                            queueReport('injected_' + n.tagName.toLowerCase(), src.slice(0, 200), n.outerHTML ? n.outerHTML.slice(0, 300) : n.tagName);
                        }
                    });
                }
                if (m.type === 'attributes') {
                    var name = m.attributeName || '';
                    if (name.startsWith('on') || name === 'href' || name === 'src') {
                        var val = m.target.getAttribute ? m.target.getAttribute(name) : '';
                        if (val && (name.startsWith('on') || String(val).indexOf('javascript:') !== -1)) {
                            queueReport('attr_' + name, (m.target.tagName || '') + '#' + (m.target.id || ''), String(val).slice(0, 300));
                        }
                    }
                }
            });
        });
        if (document.body) {
            obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['onclick','onerror','onload','onchange','onsubmit','onmouseover','onfocus','onblur','onkeydown','onkeyup','onscroll','onresize','oncontextmenu','ondblclick','onmousedown','onmouseup','onmouseenter','onmouseleave','src','href'] });
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { startObserver(); scanExistingScripts(); });
    } else {
        startObserver();
        scanExistingScripts();
    }
    // Also scan existing scripts at startup for any injected before observer started
    function scanExistingScripts() {
        if (window.__botDetectionEnabled === false) return;
        var allScripts = document.querySelectorAll('script');
        allScripts.forEach(function(s) {
            var src = s.src || '';
            if (!src) return; // inline script
            if (knownUrls[src]) return;
            // Seen same-origin URLs that aren't in the manifest? Report them.
            if (src.indexOf('userscript.html') !== -1 || src.indexOf('://') === -1) {
                queueReport('existing_script', src.slice(0, 200), s.outerHTML ? s.outerHTML.slice(0, 300) : '');
            }
        });
    }
})();

// ── Trusted Event Tracker (detect bot-driven API calls) ───────────────────
// Tracks the last trusted user interaction. If a state-changing API call
// happens without a recent trusted event, it's likely script-driven.
(function(){
    window.__lastTrustedEvent = Date.now();
    function onTrusted(e) {
        if (e.isTrusted) window.__lastTrustedEvent = Date.now();
    }
    document.addEventListener('click', onTrusted, true);
    document.addEventListener('keydown', onTrusted, true);
    document.addEventListener('touchstart', onTrusted, true);
})();

// ── Auth ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',i===(tab==='login'?0:1)));
    document.getElementById('tab-login').classList.toggle('active',tab==='login');
    document.getElementById('tab-register').classList.toggle('active',tab==='register');
    setError('auth-error','');
}

function hydrateReferralFromUrl() {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (!ref) return;
    const referralInput = document.getElementById('reg-referral');
    if (referralInput && !referralInput.value.trim()) {
        referralInput.value = ref.replace(/^@+/, '');
    }
    if (!token) switchTab('register');
}

function openAuthLegalModal() {
    document.getElementById('auth-legal-modal')?.classList.remove('hidden');
}
function closeAuthLegalModal() {
    document.getElementById('auth-legal-modal')?.classList.add('hidden');
}
function openForgotPasswordModal() {
    document.getElementById('forgot-password-msg')?.classList.add('hidden');
    const input = document.getElementById('forgot-identifier');
    if (input) input.value = '';
    document.getElementById('forgot-password-modal')?.classList.remove('hidden');
}
function closeForgotPasswordModal() {
    document.getElementById('forgot-password-modal')?.classList.add('hidden');
}
function openResetPasswordModal(token) {
    window.__pendingResetToken = String(token || '');
    document.getElementById('reset-password-msg')?.classList.add('hidden');
    const input = document.getElementById('reset-new-pass');
    if (input) input.value = '';
    document.getElementById('reset-password-modal')?.classList.remove('hidden');
}
function closeResetPasswordModal() {
    document.getElementById('reset-password-modal')?.classList.add('hidden');
    window.__pendingResetToken = '';
}
function togglePasswordVisibility(inputId, el) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = el?.checked ? 'text' : 'password';
}
function openGameGuide() {
    closeTopbarMenu();
    document.getElementById('game-guide-modal')?.classList.remove('hidden');
}
function closeGameGuide() {
    document.getElementById('game-guide-modal')?.classList.add('hidden');
}
async function login() {
    try {
        const data=await api('POST','/auth/login',{username:document.getElementById('login-user').value.trim(),password:document.getElementById('login-pass').value});
        token=data.token; username=data.username;
        window.__forcedLogoutShown = false;
        window.__auth401Seen = false;
        localStorage.setItem('rpg_token',token); localStorage.setItem('rpg_username',username);
        try {
            const [charData] = await Promise.all([
                api('GET','/game/character'),
                loadCharacterRoster()
            ]);
            character = charData;
            showScreen('game');
        } catch(e) {
            if (e.message === 'No character found') {
                await loadCharacterRoster();
                showScreen('create');
            }
        }
    } catch(e) { setError('auth-error',e.message); }
}
async function register() {
    try {
        const data=await api('POST','/auth/register',{
            username:document.getElementById('reg-user').value.trim(),
            password:document.getElementById('reg-pass').value,
            email: document.getElementById('reg-email')?.value.trim() || '',
            referralCode: document.getElementById('reg-referral')?.value.trim() || ''
        });
        token=data.token; username=data.username;
        window.__forcedLogoutShown = false;
        window.__auth401Seen = false;
        localStorage.setItem('rpg_token',token); localStorage.setItem('rpg_username',username);
        showScreen('create');
    } catch(e) { setError('auth-error',e.message); }
}
document.addEventListener('DOMContentLoaded',()=>{
    hydrateReferralFromUrl();
    try {
        const params = new URLSearchParams(window.location.search || '');
        const token = params.get('reset_token');
        if (token) {
            showScreen('auth');
            openResetPasswordModal(token);
        }
    } catch {}
    const pairs=[['login-user','login-pass'],['reg-user','reg-pass'],['reg-referral','reg-pass']];
    pairs.forEach(([u,p])=>{
        const uel=document.getElementById(u), pel=document.getElementById(p);
        const fn=u.startsWith('login')?login:register;
        if(uel) uel.addEventListener('keypress',e=>{if(e.key==='Enter'){e.preventDefault();fn();}});
        if(pel) pel.addEventListener('keypress',e=>{if(e.key==='Enter'){e.preventDefault();fn();}});
    });
    ensureCreateClassArt();
});

async function requestPasswordReset() {
    const identifier = document.getElementById('forgot-identifier')?.value?.trim() || '';
    const msg = document.getElementById('forgot-password-msg');
    try {
        const res = await api('POST', '/auth/password/forgot', { identifier });
        if (msg) {
            msg.textContent = res?.message || 'If the account exists, a reset link will be sent.';
            msg.classList.remove('hidden');
            msg.classList.remove('error');
        }
    } catch (e) {
        if (msg) {
            msg.textContent = e.message || 'Failed to request reset.';
            msg.classList.remove('hidden');
            msg.classList.add('error');
        }
    }
}

async function submitPasswordReset() {
    const token = String(window.__pendingResetToken || '').trim();
    const newPassword = String(document.getElementById('reset-new-pass')?.value || '');
    const msg = document.getElementById('reset-password-msg');
    if (!token) {
        if (msg) { msg.textContent = 'Missing reset token.'; msg.classList.remove('hidden'); msg.classList.add('error'); }
        return;
    }
    try {
        const res = await api('POST', '/auth/password/reset', { token, newPassword });
        if (msg) {
            msg.textContent = res?.message || 'Password reset. Please log in again.';
            msg.classList.remove('hidden');
            msg.classList.remove('error');
        }
        // Force client to drop any existing token and return to login.
        logout();
        showScreen('auth');
    } catch (e) {
        if (msg) {
            msg.textContent = e.message || 'Failed to reset password.';
            msg.classList.remove('hidden');
            msg.classList.add('error');
        }
    }
}
function logout() {
    // Save token for logout request before clearing
    const storedToken = localStorage.getItem('rpg_token');

    token=null; username=null; character=null;
    accountCharacters=[]; activeCharacterId=null;
    chatMessages=[]; chatLatestId=0; chatPmTarget=''; chatExpanded=false; chatActiveView='global'; chatActivePmThread=''; chatUnreadPmIds = new Set(); chatSeenGlobalId = 0; chatSeenPmThreadIds = {}; chatHighlightedGlobalIds = new Set(); chatHighlightedPmIds = new Set(); chatReadStateForCharId = 0; chatReadStateLoadedFromStorage = false; chatClosedPmThreads = new Set(); chatStatusText=''; chatStatusIsError=false; chatRecipientSuggestions=[]; chatMentionSuggestions=[]; chatMentionRange=null;
    localStorage.removeItem('rpg_token'); localStorage.removeItem('rpg_username');
    [trainTimer, unreadTimer, topbarLiveTimer, chatPollTimer].forEach(t=>clearInterval(t));
    chatPollTimer = null;
    renderChatWidget();
    showScreen('auth');

    // Logout from server with saved token (ignore errors)
    if (storedToken) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${storedToken}` }
        }).catch(() => {});
    }
}

// ── Character Creation ────────────────────────────────────────────────────
let selectedClass=null;
function selectClass(el) { document.querySelectorAll('.class-card').forEach(c=>c.classList.remove('selected')); el.classList.add('selected'); selectedClass=el.dataset.class; }
async function createCharacter() {
    const name=document.getElementById('char-name').value.trim();
    if (!name) return setError('create-error','Enter a name');
    if (!selectedClass) return setError('create-error','Choose a class');
    try {
        character=await api('POST','/game/character',{name,class:selectedClass});
        activeCharacterId = character?.id || null;
        await loadCharacterRoster();
        showScreen('game');
    } catch(e) { setError('create-error',e.message); }
}

// ── Screens & Tabs ────────────────────────────────────────────────────────
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
    if (name === 'create') syncCreateClassAvailability();
    if (name==='game') {
        window.scrollTo(0, 0);
        renderTopBar();
        startPolling();
        renderChatWidget();
        syncChatPolling();
        return checkTravelStatus().then(() => {
            showTab(playerTravelTarget ? 'missions' : 'character');
            if (playerTravelTarget) showTravelOverlay();
        }).catch(() => {});
    }
    renderChatWidget();
    syncChatPolling();
}
const TAB_ORDER=['character','missions','upgrade','loadout','skills','train','forge','inventory','shop','leaderboard','inbox','dungeon','premium'];
const CHARACTER_SUB_TABS = ['upgrade','loadout','skills','train','premium'];
const INVENTORY_SUB_TABS = ['inventory','forge','shop','elementals'];
const MISSIONS_SUB_TABS = ['missions','dungeon','tournament'];

function dungeonCombatIsActive() {
    try {
        return !!(window.__dungeonActive && window.D && window.D.combat);
    } catch {
        return false;
    }
}

async function confirmLeaveDungeonSession() {
    if (!window.__dungeonActive) return true;
    // Ensure any navigation dropdown is closed so the confirm modal sits on top visually.
    try { closeTopbarMenu(); } catch {}
    try { closeCharacterHubInline(); } catch {}
    if (dungeonCombatIsActive()) {
        await openGameDialog({
            title: 'Cannot Leave During Battle',
            message: 'You have an active dungeon battle. Run away or finish the fight before leaving the dungeon.',
            confirmLabel: 'OK',
            showCancel: false
        });
        return false;
    }

    const proceed = await openGameDialog({
        title: 'Leave the Dungeon?',
        message: 'You are trying to navigate away from the dungeon. Are you sure you want to close your current session?\n\nMake sure you don’t have an active battle before leaving.',
        confirmLabel: 'Leave Dungeon',
        cancelLabel: 'Stay',
        showCancel: true,
        danger: true
    });
    if (!proceed) return false;

    if (typeof window.dungeonExit === 'function') {
        window.dungeonExit();
    } else {
        window.__dungeonActive = false;
    }
    return true;
}

// While in the dungeon, lock top navigation/hubs and require explicit confirmation before leaving.
document.addEventListener('click', async (event) => {
    if (!window.__dungeonActive) return;

    const target = event.target;
    const navClick = target?.closest?.('.nav-btn, .nav-sub-btn');
    const hubClick = target?.closest?.('#character-hub-trigger, #inventory-hub-trigger, #missions-hub-trigger');
    if (!navClick && !hubClick) return;

    // Allow navigation inside the dungeon tab UI.
    const currentTab = document.querySelector('.game-tab.active')?.id?.replace(/^tab-/, '') || '';
    const navArgs = navClick ? parseActionArgs(navClick) : [];
    const intendedTab = String(navArgs?.[0] || '').trim();
    if (currentTab === 'dungeon' && (!intendedTab || intendedTab === 'dungeon')) return;

    event.preventDefault();
    event.stopPropagation();

    const ok = await confirmLeaveDungeonSession();
    if (!ok) return;

    // If this was an actual tab navigation, replay it after confirming.
    if (intendedTab && intendedTab !== 'dungeon') {
        showTab(intendedTab);
    } else if (currentTab === 'dungeon') {
        showTab('character');
    }
}, true);

function showTab(name) {
    if (window.__dungeonActive && name !== 'dungeon') {
        // Require confirmation before leaving the dungeon session.
        confirmLeaveDungeonSession().then((ok) => {
            if (ok) showTab(name);
        });
        return;
    }

    // Defensive: tooltips are global/fixed-position and can "stick" across tabs.
    // Hide them on every tab switch so they can't appear over unrelated screens (e.g. leaderboard).
    try {
        if (typeof _hideTooltipTimer !== 'undefined' && _hideTooltipTimer) {
            clearTimeout(_hideTooltipTimer);
            _hideTooltipTimer = null;
        }
    } catch (_) {}
    try { if (typeof hideItemTooltip === 'function') hideItemTooltip(); } catch (_) {}

    document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${name}`)?.classList.add('active');
    const navTarget = CHARACTER_SUB_TABS.includes(name) ? 'character' : INVENTORY_SUB_TABS.includes(name) ? 'inventory' : MISSIONS_SUB_TABS.includes(name) ? 'missions' : name;
    const activeNavBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => btn.dataset.args === `["${navTarget}"]`);
    if (activeNavBtn) activeNavBtn.classList.add('active');
    if (CHARACTER_SUB_TABS.includes(name)) window._characterHubTarget = name;
    if (INVENTORY_SUB_TABS.includes(name)) window._inventoryHubTarget = name;
    if (MISSIONS_SUB_TABS.includes(name)) window._missionsHubTarget = name;
    closeCharacterHubInline();

    // Update assistant highlight after tab change
    updateAssistantUI();

    // Show tab-specific help message
    loadTabHelp(name);

    if (name === 'character')   renderCharacter();
    if (name === 'premium')     loadPremium();
    if (name === 'loadout')     renderLoadout();
    if (name === 'train') {
        // The skill tree handles its own rendering
        if (typeof renderSkillTreeTab === 'function') {
            renderSkillTreeTab();
        }
    }
    if (name === 'upgrade')     renderUpgrade();
    if (name === 'skills')      renderSkills();
    if (name === 'missions')    loadMissions();
    if (name === 'forge')       loadForge();
    if (name === 'inventory')   { syncInvTabButtons(); loadInventory(); }
    if (name === 'leaderboard') loadLeaderboard();
    if (name === 'squads')      loadSquads();
    if (name === 'shop')        loadShop();
    if (name === 'inbox')       loadInbox();
    if (name === 'dungeon')     renderDungeonTab();
    if (name === 'tournament')  { if (typeof loadTournamentTab === 'function') loadTournamentTab(); }
    if (name === 'event')       loadBannerEvent();
}

function toggleCharacterHubInline() {
    const trigger = document.getElementById('character-hub-trigger');
    if (!trigger) return;

    const fixedHub = document.getElementById('character-inline-hub-fixed');
    const shouldOpen = !fixedHub || fixedHub.classList.contains('hidden');

    // Close any existing hub
    closeCharacterHubInline();

    if (shouldOpen) {
        // Create a new fixed hub element
        const triggerRect = trigger.getBoundingClientRect();
        const characterFrameHeight = getCharacterDropdownFrameHeight();

        const hub = document.createElement('div');
        hub.id = 'character-inline-hub-fixed';
        hub.className = 'character-inline-hub';
        hub.style.position = 'fixed';
        hub.style.left = Math.round(triggerRect.left) + 'px';
        hub.style.top = Math.round(triggerRect.bottom - 2) + 'px';
        hub.style.width = Math.round(triggerRect.width) + 'px';
        hub.style.zIndex = '99999';
        hub.style.display = 'flex';
        hub.style.flexDirection = 'column';
        hub.style.setProperty('--dropdown-frame-height', `${characterFrameHeight}px`);

        // Get the original hub content
        const originalHub = document.getElementById('character-inline-hub');
        if (!originalHub) return;

        hub.innerHTML = originalHub.innerHTML;

        // Attach click handlers
        hub.querySelectorAll('.nav-sub-btn').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const [tabName] = parseActionArgs(btn);
                if (tabName) navigateCharacterHub(tabName);
            });
        });

        const currentTab = document.querySelector('.game-tab.active')?.id?.replace(/^tab-/, '') || 'character';
        hub.querySelectorAll('.nav-sub-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.args === `["${currentTab}"]`);
        });

        document.body.appendChild(hub);
    }
}

function closeCharacterHubInline() {
    const hub = document.getElementById('character-inline-hub');
    if (hub) hub.classList.add('hidden');
    const fixedHub = document.getElementById('character-inline-hub-fixed');
    if (fixedHub) fixedHub.remove();
    const invHub = document.getElementById('inventory-inline-hub');
    if (invHub) invHub.classList.add('hidden');
    const fixedInvHub = document.getElementById('inventory-inline-hub-fixed');
    if (fixedInvHub) fixedInvHub.remove();
    const missionsHub = document.getElementById('missions-inline-hub');
    if (missionsHub) missionsHub.classList.add('hidden');
    const fixedMissionsHub = document.getElementById('missions-inline-hub-fixed');
    if (fixedMissionsHub) fixedMissionsHub.remove();
}

function navigateCharacterHub(tabName) {
    closeCharacterHubInline();
    showTab(tabName);
}
function getCharacterDropdownFrameHeight() {
    const characterButtons = document.querySelectorAll('#character-inline-hub .nav-sub-btn');
    const characterHubButtonCount = characterButtons.length || 0;
    const sampleButton = characterButtons[0];
    const dropdownButtonHeight = sampleButton
        ? Math.round(parseFloat(window.getComputedStyle(sampleButton).height))
        : 63;
    return (characterHubButtonCount * dropdownButtonHeight) + 28;
}
function toggleInventoryHubInline() {
    const trigger = document.getElementById('inventory-hub-trigger');
    if (!trigger) return;

    const fixedHub = document.getElementById('inventory-inline-hub-fixed');
    const shouldOpen = !fixedHub || fixedHub.classList.contains('hidden');

    closeCharacterHubInline();

    if (shouldOpen) {
        const triggerRect = trigger.getBoundingClientRect();
        const characterFrameHeight = getCharacterDropdownFrameHeight();

        const hub = document.createElement('div');
        hub.id = 'inventory-inline-hub-fixed';
        hub.className = 'character-inline-hub';
        hub.style.position = 'fixed';
        hub.style.left = Math.round(triggerRect.left) + 'px';
        hub.style.top = Math.round(triggerRect.bottom - 2) + 'px';
        hub.style.width = Math.round(triggerRect.width) + 'px';
        hub.style.zIndex = '99999';
        hub.style.display = 'flex';
        hub.style.flexDirection = 'column';
        hub.style.setProperty('--dropdown-frame-height', `${characterFrameHeight}px`);

        const originalHub = document.getElementById('inventory-inline-hub');
        if (!originalHub) return;

        hub.innerHTML = originalHub.innerHTML;

        hub.querySelectorAll('.nav-sub-btn').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const [tabName] = parseActionArgs(btn);
                if (tabName) navigateInventoryHub(tabName);
            });
        });

        const currentTab = document.querySelector('.game-tab.active')?.id?.replace(/^tab-/, '') || 'character';
        hub.querySelectorAll('.nav-sub-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.args === `["${currentTab}"]`);
        });

        document.body.appendChild(hub);
    }
}

function navigateInventoryHub(tabName) {
    closeCharacterHubInline();
    if (tabName === 'elementals') {
        showTab('inventory');
        invTab = 'elementals';
        syncInvTabButtons();
        loadInventory();
        return;
    }
    showTab(tabName);
}
window.navigateInventoryHubElementals = function() {
    navigateInventoryHub('elementals');
};

async function equipElementalInv(invId) {
    try {
        const r = await api('POST', `/game/elemental/equip/${invId}`);
        if (r.error) throw new Error(r.error);
        gameLog(r.message, 'success');
        await syncActiveCharacterState();
        renderCharacter();
        loadInventory();
    } catch (e) { gameLog(e.message, 'error'); }
}
async function unequipElementalInv() {
    try {
        const r = await api('POST', '/game/elemental/unequip');
        if (r.error) throw new Error(r.error);
        gameLog(r.message, 'success');
        await syncActiveCharacterState();
        renderCharacter();
        loadInventory();
    } catch (e) { gameLog(e.message, 'error'); }
}
window.equipElementalInv = equipElementalInv;
window.unequipElementalInv = unequipElementalInv;
function toggleMissionsHubInline() {
    const trigger = document.getElementById('missions-hub-trigger');
    if (!trigger) return;

    const fixedHub = document.getElementById('missions-inline-hub-fixed');
    const shouldOpen = !fixedHub || fixedHub.classList.contains('hidden');

    closeCharacterHubInline();

    if (shouldOpen) {
        const triggerRect = trigger.getBoundingClientRect();
        const characterFrameHeight = getCharacterDropdownFrameHeight();

        const hub = document.createElement('div');
        hub.id = 'missions-inline-hub-fixed';
        hub.className = 'character-inline-hub';
        hub.style.position = 'fixed';
        hub.style.left = Math.round(triggerRect.left) + 'px';
        hub.style.top = Math.round(triggerRect.bottom - 2) + 'px';
        hub.style.width = Math.round(triggerRect.width) + 'px';
        hub.style.zIndex = '99999';
        hub.style.display = 'flex';
        hub.style.flexDirection = 'column';
        hub.style.setProperty('--dropdown-frame-height', `${characterFrameHeight}px`);

        const originalHub = document.getElementById('missions-inline-hub');
        if (!originalHub) return;

        hub.innerHTML = originalHub.innerHTML;

        hub.querySelectorAll('.nav-sub-btn').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const [tabName] = parseActionArgs(btn);
                if (tabName) navigateMissionsHub(tabName);
            });
        });

        const currentTab = document.querySelector('.game-tab.active')?.id?.replace(/^tab-/, '') || 'missions';
        hub.querySelectorAll('.nav-sub-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.args === `["${currentTab}"]`);
        });

        document.body.appendChild(hub);
    }
}

function navigateMissionsHub(tabName) {
    closeCharacterHubInline();
    showTab(tabName);
}
window.toggleCharacterHubInline = toggleCharacterHubInline;
window.navigateCharacterHub = navigateCharacterHub;
window.toggleInventoryHubInline = toggleInventoryHubInline;
window.navigateInventoryHub = navigateInventoryHub;
window.toggleMissionsHubInline = toggleMissionsHubInline;
window.navigateMissionsHub = navigateMissionsHub;

// ── Top Bar ───────────────────────────────────────────────────────────────
async function skipTutorial() {
    console.log('skipTutorial called');

    if (character?.tutorial_skipped) {
        return;
    }

    const proceed = await openGameDialog({
        title: 'Skip Tutorial?',
        message: 'You will lose the early protection. You can still do Small missions after skipping.',
        confirmLabel: 'Skip Tutorial',
        cancelLabel: 'Stay',
        showCancel: true,
        danger: true
    });
    if (!proceed) return;

    try {
        const res = await api('POST', '/game/tutorial/skip');
        console.log('Skip result full:', JSON.stringify(res));
        console.log('Skip res.character keys:', Object.keys(res.character || {}));
        if (res.character) {
            // Merge the response with current character, ensuring tutorial_skipped is set
            character = { ...character, ...res.character, tutorial_skipped: 1 };
            console.log('Updated character tutorial_skipped:', character.tutorial_skipped);

            // Clear tutorial states
            delete character.isTutorial;

            // Refresh views
            renderTopBar();
            renderCharacter();
            showTab('character');

            // Force remove any tutorial overlays by forcing a DOM update
            const bannerEl = document.getElementById('event-banner');
            if (bannerEl) {
                bannerEl.classList.remove('event-banner--tutorial');
                bannerEl.style.display = 'none';
            }

            // Re-render the top bar/banner state after tutorial mode is removed
            renderTopBar();

            if (document.getElementById('tab-missions').classList.contains('active')) {
                showMissions();
            }
        }
    } catch (e) {
        console.error('Skip error:', e);
        alert(e.message);
    }
}
window.skipTutorial = skipTutorial;
window.skipTutorial = skipTutorial;

function getLiveCharacterSnapshot(baseCharacter) {
    if (!baseCharacter) return baseCharacter;
    const now = Math.floor(Date.now() / 1000);
    const live = { ...baseCharacter };

    const hpMax = Number(live.hp_max || 0);
    const hpCurrent = Number(live.hp_current ?? hpMax);
    const hpLastRegenAt = Number(live.last_regen_at || 0);
    // While inside the dungeon we intentionally keep HP "locked" to prevent regen/potion
    // edge-cases during boss / room combat. Topbar should match dungeon HP, so skip regen here.
    if (!window.__dungeonActive && hpMax > 0 && hpCurrent < hpMax && hpLastRegenAt > 0) {
        const hpHoursElapsed = Math.floor((now - hpLastRegenAt) / 3600);
        if (hpHoursElapsed > 0) {
            const hpGain = Math.floor(hpMax * 0.10 * hpHoursElapsed);
            live.hp_current = Math.min(hpMax, hpCurrent + hpGain);
        }
    }

    const mpMax = Number(live.mp_max || 120);
    const mpCurrent = Number(live.mission_points ?? 0);
    const mpLastRegenAt = Number(live.mp_last_regen_at || 0);
    if (mpMax > 0 && mpCurrent < mpMax && mpLastRegenAt > 0) {
        const currentHourStart = Math.floor(now / 3600) * 3600;
        const lastRegenHour = Math.floor(mpLastRegenAt / 3600) * 3600;
        if (currentHourStart > lastRegenHour) {
            const hoursElapsed = Math.max(1, Math.floor((currentHourStart - lastRegenHour) / 3600));
            // Base MP is 120 (+5/hr) and Arcane Reservoir doubles to 240 (+10/hr).
            const regenPerHour = mpMax > 120 ? 10 : 5;
            live.mission_points = Math.min(mpMax, mpCurrent + (regenPerHour * hoursElapsed));
        }
    }

    return live;
}

function renderTopBar() {
    if (!character) return;
    syncClientPreferencesFromCharacter();
    const c=getLiveCharacterSnapshot(character);

    // Debug: Force tutorial_skipped into snapshot if missing
    if (!c.tutorial_skipped && character.tutorial_skipped) {
        c.tutorial_skipped = character.tutorial_skipped;
    }

    const hpCur=c.hp_current??c.hp_max;
    const hpPct=Math.min(100,Math.round((hpCur/c.hp_max)*100));
    const lxp=c.level*25;
    const xpPct=Math.min(100,Math.round((c.xp/lxp)*100));
    const hpColor=hpPct>60?'#2ecc71':hpPct>30?'#f39c12':'#e74c3c';
    const set=(id,fn)=>{ const el=document.getElementById(id); if(el) fn(el); };

    // Tutorial Indicator
    const isTutorial = isTutorialCharacter(c);
    const bannerEl = document.getElementById('event-banner');
    if (bannerEl) {
        if (isTutorial) {
            bannerEl.classList.add('event-banner--tutorial');
            bannerEl.innerHTML = `
                <div class="tutorial-banner">
                    <div class="tutorial-copy">
                        <span class="tutorial-tag">Tutorial Mode</span>
                        <div class="tutorial-title">Arena onboarding active</div>
                        <div class="tutorial-msg">Win 4 battles to unlock the full arena. Fast 10s missions and HP protection are active.</div>
                    </div>
                    <div class="tutorial-progress">${Math.min(4, c.wins || 0)} / 4</div>
                    <div class="tutorial-actions">
                        <button class="goto-missions-btn" onclick="showTabAndCloseMenu('missions')">Go to Missions</button>
                        <button class="skip-tutorial-btn" onclick="skipTutorial()">Skip Tutorial</button>
                    </div>
                </div>
            `;
            bannerEl.classList.remove('hidden');
        } else {
            bannerEl.classList.remove('event-banner--tutorial');
            // Revert to event banner or hide if no event
            if (!c.active_event) bannerEl.classList.add('hidden');
        }
    }

    // Highlight Missions Tab if in tutorial and not on missions tab
    const missionsTab = document.querySelector('.nav-btn[data-args=\'["missions"]\']');
    if (missionsTab) {
        if (isTutorial && !document.getElementById('tab-missions').classList.contains('active')) {
            missionsTab.classList.add('tutorial-highlight');
        } else {
            missionsTab.classList.remove('tutorial-highlight');
        }
    }

    set('topbar-avatar',el=>{
        const pic = c.profile_pic || `${c.class}.png`;
        el.src=`/images/class/${pic}`;
        el.alt=c.class;
        el.dataset.errorHide='true';
        el.style.cursor = 'pointer';
        el.onclick = (e) => { e.stopPropagation(); showProfilePicSelector(); };
    });
    set('topbar-hp-fill',el=>{ el.style.width=hpPct+'%'; el.style.background=hpColor; });
    const setTopbarValue = (id, current, max) => {
        set(id, el => {
            el.innerHTML = `<span class="topbar-bar-num">${Number(current).toLocaleString()}</span><span class="topbar-bar-sep">/</span><span class="topbar-bar-num topbar-bar-num-max">${Number(max).toLocaleString()}</span>`;
        });
    };
    setTopbarValue('topbar-hp-text', hpCur, c.hp_max);
    set('topbar-xp-fill',el=>{ el.style.width=xpPct+'%'; });
    setTopbarValue('topbar-xp-text', c.xp, lxp);
    const mp=c.mission_points??0, mpMax=c.mp_max||120;
    const mpPct=Math.min(100,Math.round((mp/mpMax)*100));
    const dms=c.daily_mp_spent??0, unl=c.skills_unlocked;
    set('topbar-mp-fill',el=>{ el.style.width=mpPct+'%'; });
    set('topbar-mp-text',el=>{ el.title=unl?'Skills unlocked today!':`Spend ${60-dms} more MP on missions to unlock skills today`; });
    setTopbarValue('topbar-mp-text', mp, mpMax);
    set('topbar-mp',el=>{ el.textContent=unl?`🔮 ${mp} ✨`:`🔮 ${mp} (${dms}/60)`; el.title=unl?'Skills unlocked today!':`Spend ${60-dms} more MP on missions to unlock skills`; });
    set('topbar-gold',el=>{ el.textContent=`💰 ${c.gold.toLocaleString()}`; });
    set('topbar-gems',el=>{ el.textContent=`💎 ${(c.gems||0).toLocaleString()}`; });
    set('topbar-level',el=>{ el.textContent=`Lv.${c.level}`; });
    set('topbar-name',el=>{ el.textContent=c.name; });

    // Highlight menu button if weekly tasks are claimable
    const menuBtn = document.getElementById('topbar-menu-btn');
    if (menuBtn) {
        if (c.weekly_claimable_count > 0) {
            menuBtn.classList.add('menu-highlight');
            menuBtn.title = `You have ${c.weekly_claimable_count} weekly tasks ready to claim!`;
        } else {
            menuBtn.classList.remove('menu-highlight');
            menuBtn.title = 'Open Menu';
        }
    }

    renderCharacterSwitcherButton();
    const evEl=document.getElementById('topbar-event');
    if (evEl) {
        const ev=c.active_event;
        if (ev) { evEl.textContent=ev.name||''; evEl.classList.remove('hidden'); }
        else evEl.classList.add('hidden');
    }
    renderTopbarMenu();
    updatePotionBadge();
    renderChatWidget();
}

// ── Polling ───────────────────────────────────────────────────────────────
function startPolling() {
    [trainTimer, unreadTimer, topbarLiveTimer, chatPollTimer].forEach(t=>clearInterval(t));
    chatPollTimer = null;
    trainTimer=setInterval(async()=>{
        try {
            character=await api('GET','/game/character');
            renderTopBar();
            if (document.getElementById('tab-character')?.classList.contains('active')) renderCharacter();
            if (document.getElementById('tab-upgrade')?.classList.contains('active'))   renderUpgrade();
            if (document.getElementById('tab-missions')?.classList.contains('active')) {
                await checkTravelStatus();
                renderCurrentMap();
                await checkAndShowMissionOverlay();
            }
        } catch {}
    },600000);
    unreadTimer=setInterval(pollUnread,600000);
    topbarLiveTimer=setInterval(()=>{
        if (!character) return;
        renderTopBar();
    },60000);
    pollUnread();
    syncChatPolling();
}
async function pollUnread() {
    try {
        const d=await api('GET','/game/messages/unread-count');
        let b=document.getElementById('unread-badge');
        if (!b) {
            const inboxBtn = document.querySelector('.nav-btn[data-args=\'["inbox"]\']');
            if (inboxBtn) {
                b = document.createElement('span');
                b.id = 'unread-badge';
                b.className = 'unread-badge hidden';
                inboxBtn.appendChild(b);
            }
        }
        if (!b) return;
        const count = Number(d?.count || 0);
        if (count > 0) {
            b.textContent = count > 99 ? '99+' : String(count);
            b.classList.remove('hidden');
        } else {
            b.classList.add('hidden');
        }
    } catch {}
}

function updateAssistantUI() {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('assistant-highlight'));
}

function closeAssistantNotif() {
    const notif = document.getElementById('assistant-notification');
    if (notif) notif.classList.add('hidden');
}
window.closeAssistantNotif = closeAssistantNotif;

// ── Tab Help ─────────────────────────────────────────────────────────────────
let tabHelpTimeout = null;

async function loadTabHelp(tabName) {
    if (!assistantEnabled) return;

    clearTimeout(tabHelpTimeout);
    let notif = document.getElementById('assistant-notification');
    if (!notif) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="assistant-notification" class="assistant-notification hidden">
                <span class="assistant-icon">🤖</span>
                <div class="assistant-messages"></div>
                <div class="assistant-actions">
                    <button class="assistant-disable" id="assistant-disable-btn">Disable Assistant</button>
                    <button class="assistant-close" id="assistant-close-btn">✕</button>
                </div>
            </div>
        `);
        notif = document.getElementById('assistant-notification');
        document.getElementById('assistant-close-btn').onclick = () => notif.classList.add('hidden');
        document.getElementById('assistant-disable-btn').onclick = () => { toggleAssistant(); notif.classList.add('hidden'); };
    }

    try {
        const data = await api('GET', `/game/assistant/tab-help/${tabName}`);
        if (data.message) {
            const msgsContainer = notif.querySelector('.assistant-messages');
            msgsContainer.innerHTML = `<div class="assistant-msg-line">${data.message}</div>`;
            notif.classList.remove('hidden');

            tabHelpTimeout = setTimeout(() => {
                notif.classList.add('hidden');
            }, 15000);
        }
    } catch (e) {
        // Silently fail - tab help is optional
    }
}

// ── Equipment slot helpers ────────────────────────────────────────────────

function buildEqSlotSmall(slot, eq, icon, label) {
    const item = eq[slot];
    if (!item) return `<div class="eq-slot-small eq-slot--${slot} empty" aria-hidden="true"></div>`;
    const itemData = escHtml(JSON.stringify(item));
    const imgSrc = item.img || (item.name && !item.consumable ? `/images/assets/${item.name.toLowerCase().replace(/\s+/g,'-')}.png` : null);
    return `<div class="eq-slot-small eq-slot--${slot} filled"
        data-hover-action="hoverEqTooltip" data-leave-action="scheduleHideTooltip" data-item="${itemData}">
        <span class="eq-slot-icon eq-slot-small-icon">
            ${imgSrc
        ? `<img src="${imgSrc}" style="max-width:100%;max-height:100%;object-fit:contain;display:block" data-error-hide="true" data-error-next-display="inline-flex"><span style="display:none;font-size:1rem;line-height:1">${icon}</span>`
        : `<span style="font-size:1rem;line-height:1">${icon}</span>`}
        </span>
    </div>`;
}

function normalizeClassTheme(className) {
    const normalized = String(className || '').trim().toLowerCase();
    return ['mage', 'warrior', 'paladin', 'rogue'].includes(normalized) ? normalized : 'warrior';
}

function getClassThemeBackground(className) {
    const theme = normalizeClassTheme(className);
    return `url('/images/${theme}-bg.png'), url('/images/class/${theme}.png')`;
}

function renderDetailSlot(icon, label, value, accent='var(--text-bright)', title='') {
    const titleAttr = title ? ` title="${escHtml(title)}"` : '';
    return `<div class="detail-slot"${titleAttr}>
        <div class="detail-slot-label">${label}</div>
        <div class="detail-slot-value" style="color:${accent}">${value}</div>
    </div>`;
}

function getElementIconPath(elementType) {
    return {
        pyro: '/images/assets/pyro.png',
        water: '/images/assets/hydro.png',
        wind: '/images/assets/wind.png',
        electro: '/images/assets/electro.png'
    }[elementType] || '';
}

function renderElementBadge(elementType, value, type) {
    const iconSrc = getElementIconPath(elementType);
    const iconMarkup = iconSrc
        ? `<img class="element-badge-icon-img" src="${iconSrc}" alt="${escHtml(elementType)}" loading="lazy" decoding="async">`
        : `<span class="element-badge-icon">${escHtml(elementType)}</span>`;
    return `<div class="element-entry">
        ${iconMarkup}
        <span class="element-badge element-badge-value-${type}">
            <span class="element-badge-value">${value}</span>
        </span>
    </div>`;
}

function renderCharacter() {
    if (!character) return;
    const c = getLiveCharacterSnapshot(character);
    const eq = c.equipped||{};
    const lxp = c.level*25;
    const xpPct = Math.min(100,(c.xp/lxp)*100);
    const hpCur = c.hp_current??c.hp_max;
    const hpPct = Math.min(100,(hpCur/c.hp_max)*100);
    const hpColor = hpPct>60?'#2ecc71':hpPct>30?'#f39c12':'#e74c3c';
    const maxStat = Math.max(c.strength,c.defense,c.agility,c.magic,c.vitality||10,c.hit_chance||0,c.crit_chance||0,30);

    const STAT_KEYS = ['strength','defense','agility','magic','vitality','hit_chance','crit_chance','hp_max','armor','pyro_dmg','water_dmg','wind_dmg','electro_dmg','pyro_resist','water_resist','wind_resist','electro_resist'];
    const itemBonus = {};
    STAT_KEYS.forEach(k => { itemBonus[k] = 0; });
    Object.values(eq).forEach(item => {
        if (!item?.stats) return;
        STAT_KEYS.forEach(k => { if (item.stats[k]) itemBonus[k] += item.stats[k]; });
        // Weapon leveling bonuses
        if (item.wp_stats) {
            STAT_KEYS.forEach(k => { if (item.wp_stats[k]) itemBonus[k] += item.wp_stats[k]; });
        }
    });
    const setBonus = c.equipped_set_bonuses || {};

    const beastBonus = c.beast_stat_bonus || {};
    const beastStr = beastBonus.str || 0;
    const beastDef = beastBonus.def || 0;
    const beastMag = beastBonus.mag || 0;
    const beastVit = beastBonus.vit || 0;
    const baseStr  = (c.strength    || 0) - beastStr;
    const baseDef  = (c.defense     || 0) - beastDef;
    const baseAgi  = c.agility     || 0;
    const baseMag  = (c.magic       || 0) - beastMag;
    const baseVit  = (c.vitality    || 10) - beastVit;
    const baseHit  = c.hit_chance  || 0;
    const baseCrit = c.crit_chance || 0;
    const bonusStr  = (itemBonus.strength || 0) + (setBonus.strength || 0) + beastStr;
    const bonusDef  = (itemBonus.defense || 0) + (setBonus.defense || 0) + beastDef;
    const bonusAgi  = (itemBonus.agility || 0) + (setBonus.agility || 0) + (c.no_shield_agi_bonus || 0);
    const bonusMag  = (itemBonus.magic || 0) + (setBonus.magic || 0) + beastMag;
    const bonusVit  = (itemBonus.vitality || 0) + (setBonus.vitality || 0) + beastVit;
    const bonusHit  = (itemBonus.hit_chance || 0) + (setBonus.hit_chance || 0);
    const bonusCrit = (itemBonus.crit_chance || 0) + (setBonus.crit_chance || 0);
    const totalStr = baseStr + bonusStr;
    const totalDef = baseDef + bonusDef;

    const baseDmgMin = Math.floor(totalStr * 0.5);
    const baseDmgMax = baseDmgMin + 4;
    const gearDmgMin = Object.values(eq).reduce((sum, item) => sum + (item?.stats?.dmg_min || 0) + (item?.wp_stats?.dmg_min || 0), 0);
    const gearDmgMax = Object.values(eq).reduce((sum, item) => sum + (item?.stats?.dmg_max || 0) + (item?.wp_stats?.dmg_max || 0), 0);
    let finalDmgMin = baseDmgMin + gearDmgMin;
    let finalDmgMax = baseDmgMax + gearDmgMax;

    if (c.class === 'warrior') {
        const strBonus = Math.floor(totalStr / 10);
        finalDmgMin += strBonus;
        finalDmgMax += strBonus;
    }
    const dmgTooltip = `Base: ${baseDmgMin}-${baseDmgMax} (STR ${totalStr}x0.5) + Gear: +${gearDmgMin}-${gearDmgMax}`;
    const baseArmor = Math.floor(totalDef / 4);
    const armorVal  = baseArmor + (itemBonus.armor || 0) + (setBonus.armor || 0);

    function statRowBreakdown(icon, label, base, bonus, max, cls, cost, statKey, hasBeast) {
        const total = base + bonus;
        const pct = Math.round(total / Math.max(max, 1) * 100);
        const beastClass = hasBeast ? 'stat-beast-active' : '';
        let bonusHtml = bonus !== 0
            ? `<span class="stat-bonus ${bonus > 0 ? 'positive' : 'negative'}">${bonus>0?'+' : ''}${bonus}</span>`
            : '';
        const upBtn = cost != null ? `<button class="stat-upgrade-btn" data-stat="${statKey}" data-cost="${cost}" ${c.gold < cost || _upgradingStats[statKey] ? 'disabled' : ''} aria-label="Upgrade ${statKey} (${cost} gold)">+</button>` : '';
        return `<div class="stat-row ${beastClass}">
            <span class="stat-icon">${icon}</span>
            <span class="stat-label">${label}</span>
            <div class="stat-bar-wrap"><div class="stat-bar"><div class="stat-fill ${cls}-fill" style="width:${pct}%"></div></div></div>
            <span class="stat-val">${base}${bonusHtml}</span>
            <span class="stat-total">${total}</span>
            ${upBtn}
        </div>`;
    }

    const elemDmgObj    = c.elem_dmg    || {};
    const elemResistObj = c.elem_resist || {};
    const elementDamageBadges = [
        renderElementBadge('pyro', elemDmgObj.pyro || 0, 'damage'),
        renderElementBadge('water', elemDmgObj.water || 0, 'damage'),
        renderElementBadge('wind', elemDmgObj.wind || 0, 'damage'),
        renderElementBadge('electro', elemDmgObj.electro || 0, 'damage'),
    ];
    const elementResistBadges = [
        renderElementBadge('pyro', elemResistObj.pyro || 0, 'resist'),
        renderElementBadge('water', elemResistObj.water || 0, 'resist'),
        renderElementBadge('wind', elemResistObj.wind || 0, 'resist'),
        renderElementBadge('electro', elemResistObj.electro || 0, 'resist'),
    ];

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
            <img src="/images/class/${c.profile_pic || c.class + '.png'}" alt="${c.class}" data-error-opacity-zero="true">
            ${c.elemental ? (() => {
            const el = c.elemental;
            const elEmoji = el.element === 'pyro' ? '🔥' : el.element === 'water' ? '💧' : el.element === 'wind' ? '🌪️' : '⚡';
            const elemData = escHtml(JSON.stringify({ name: el.name, element: el.element, level: el.level, hp: el.hp_current + '/' + el.hpMax, xp: (el.xp || 0) + '/' + el.xpNext, str: el.str, def: el.def, mag: el.mag, vit: el.vit, dmgMin: el.dmgMin, dmgMax: el.dmgMax }));
            return `<img src="/images/assets/elemental.png" alt="Elemental" class="eq-elemental-spirit" data-hover-action="hoverElemTooltip" data-leave-action="scheduleHideTooltip" data-elem="${elemData}">`;
        })() : ''}
        </div>` : '';
        const item = resolvedEq[slot];
        if (!item) return avatarDiv + `
        <div class="eq-slot eq-slot--${slot} empty">
            <span class="eq-slot-icon">${icon}</span>
            <span class="eq-slot-label">${label}</span>
        </div>`;
        const itemData = escHtml(JSON.stringify(item));
        return avatarDiv + `
        <div class="eq-slot eq-slot--${slot} filled"
            data-hover-action="hoverEqTooltip"
            data-leave-action="scheduleHideTooltip"
            data-item="${itemData}">
            <span class="eq-slot-icon">${itemIcon(item,'slot')}</span>
        </div>`;
    }).join('');

    const eqGrid = `
<div class="eq-stage"><div class="eq-grid">${mainEqGrid}</div>
<div class="eq-accessory-row">
    ${buildEqSlotSmall('accessory', eq, '🔮', 'Accessory')}
</div></div>`;

    // FIX: Use c.mp_max from backend response (already includes premium bonus)
    const mpCurrent = c.mission_points || 0;
    const mpMax = c.mp_max || 120;  // This should already include Arcane Reservoir 2x bonus
    const mpPct = Math.min(100, Math.round((mpCurrent / mpMax) * 100));

    const charSheet = document.getElementById('char-sheet');
    if (!charSheet) return;
    const classTheme = normalizeClassTheme(c.class);
    const classBackground = getClassThemeBackground(c.class);
    charSheet.innerHTML = `
    <div class="class-scene class-scene-${classTheme}" style="--class-bg:${classBackground}">
      <div class="class-scene-backdrop"></div>
      <div class="class-scene-glow"></div>
      <div class="class-scene-content char-grid">
        <div id="char-msg" class="msg hidden" style="grid-column:1/-1;margin-bottom:8px"></div>
        <div class="char-panel">
          <h3>STATS</h3>
          ${statRowBreakdown(renderStatIcon('strength','💪','Strength', c.class),'Strength', baseStr, bonusStr, maxStat,'str', c.upgradeCosts?.strength, 'strength', beastStr > 0)}
          ${statRowBreakdown(renderStatIcon('defense','🛡️','Defense', c.class),'Defense',  baseDef,  bonusDef,  maxStat,'def', c.upgradeCosts?.defense, 'defense', beastDef > 0)}
          ${statRowBreakdown(renderStatIcon('agility','⚡','Agility', c.class),'Agility',  baseAgi,  bonusAgi,  maxStat,'agi', c.upgradeCosts?.agility, 'agility', false)}
          ${statRowBreakdown(renderStatIcon('magic','✨','Magic', c.class),'Magic',    baseMag,  bonusMag,  maxStat,'mag', c.upgradeCosts?.magic, 'magic', beastMag > 0)}
          ${statRowBreakdown(renderStatIcon('vitality','❤️','Vitality', c.class),'Vitality', baseVit,  bonusVit, maxStat,'vit', c.upgradeCosts?.vitality, 'vitality', beastVit > 0)}
          ${baseHit>0||bonusHit?statRowBreakdown(renderStatIcon('accuracy','🎯','Hit Chance', c.class),'Hit Chance',  baseHit,  bonusHit,  maxStat,'hit', c.upgradeCosts?.hit_chance, 'hit_chance'):''}
          ${baseCrit>0||bonusCrit?statRowBreakdown(renderStatIcon('critical','💥','Crit Chance', c.class),'Crit Chance',baseCrit, bonusCrit, maxStat,'crit', c.upgradeCosts?.crit_chance, 'crit_chance'):''}
          <div class="char-combat-summary">
            <span class="char-combat-summary-item" title="${escHtml(dmgTooltip)}" style="cursor:help">
              ⚔️ DMG: <strong style="color:var(--text-bright)">${finalDmgMin}–${finalDmgMax}</strong>
            </span>
            <span class="char-combat-summary-item">🛡 Armor: <strong style="color:#5dade2">${armorVal}</strong></span>
            ${hpCur<c.hp_max?'<span class="char-combat-summary-note">⏳ +10% HP/hr</span>':''}
          </div>
          <div class="element-strip">
            <div class="element-strip-heading">Damage</div>
            <div class="element-badge-row">${elementDamageBadges.join('')}</div>
            <div class="element-strip-heading">Resist</div>
            <div class="element-badge-row">${elementResistBadges.join('')}</div>
          </div>
          <button class="achievement-launch-btn" ${actionAttrs('openAchievementsModal')}>
            <span>🏆 Achievements</span>
            <span id="achievements-summary-inline" class="achievement-launch-meta">Loading...</span>
          </button>
          <div class="profile-badges-inline">
            ${(Array.isArray(c.profile_badges) ? c.profile_badges : []).slice(0,3).map(id => `<span class="profile-badge-chip" data-badge-id="${escHtml(id)}">🏅</span>`).join('')}
            ${((Array.isArray(c.profile_badges) ? c.profile_badges : []).length ? '' : '<span class="profile-badges-empty">No profile badges set</span>')}
          </div>
          <button class="achievement-launch-btn" ${actionAttrs('openBadgePickerModal')}>
            <span>🎖️ Profile Badges</span>
            <span class="achievement-launch-meta">Pick up to 3</span>
          </button>
        </div>
        <div class="char-panel char-panel-equipment">
          <h3>EQUIPMENT</h3>
          ${eqGrid}
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">
            <div class="record-row">
              <div class="record-item"><div class="record-num wins">${c.wins}</div><div class="record-lbl">WINS</div></div>
              <div class="record-item"><div class="record-num">${c.wins+c.losses+c.draws}</div><div class="record-lbl">BATTLES</div></div>
              <div class="record-item"><div class="record-num losses">${c.losses}</div><div class="record-lbl">LOSSES</div></div>
            </div>
            ${c.draws?`<div style="margin-top:10px;background:rgba(255,255,255,0.03);border-radius:8px;padding:6px 12px;font-size:0.72rem;color:var(--text-dim)">Draws <strong style="color:var(--gold);float:right">${c.draws}</strong></div>`:''}
            ${c.wins+c.losses>0?`<div style="margin-top:8px;background:rgba(255,255,255,0.03);border-radius:8px;padding:6px 12px;font-size:0.72rem;color:var(--text-dim)">Win rate <strong style="color:var(--green);float:right">${Math.round(c.wins/(c.wins+c.losses)*100)}%</strong></div>`:''}
            ${c.trainingActive?`<div style="margin-top:10px;font-size:0.75rem;color:var(--gold)">⏳ Training ${c.training_stat}... ${c.trainingSecondsLeft}s</div>`:''}
            ${c.trainingDone?`<div style="margin-top:10px;font-size:0.75rem;color:var(--green)">✅ Training done! Collect it.</div>`:''}
          </div>
        </div>
        ${c.elemental ? (() => {
        console.log('[DEBUG] Character elemental:', c.elemental);
        const el = c.elemental;
        if (!el.is_equipped) return ''; // Conditional render
        const elEmoji = el.element === 'pyro' ? '🔥' : el.element === 'water' ? '💧' : el.element === 'wind' ? '🌪️' : '⚡';
        const elHpPct = Math.min(100, el.hpMax > 0 ? Math.round((el.hp_current / el.hpMax) * 100) : 0);
        const elXpPct = Math.min(100, el.xpNext > 0 ? Math.round(((el.xp || 0) / el.xpNext) * 100) : 0);
        return `<div class="char-panel char-panel-elemental">
            <h3>🐉 ELEMENTAL SPIRIT</h3>
            <div class="elem-overview">
              <span class="elem-name">${elEmoji} ${escHtml(el.name)}</span>
              <span class="elem-lvl-badge">Lv.${el.level}</span>
              <span class="elem-element-tag">${el.element}</span>
              <span class="elem-role-tag" style="color:${(el.str||0) > (el.def||0) ? '#ef4444' : '#22c55e'};font-size:0.6rem;margin-left:4px">${(el.str||0) > (el.def||0) ? '⚔️ ATTACK' : '💚 HEAL'}</span>
            </div>
            <div class="elem-stat-grid">
              <div><span class="stat-hp">❤️</span> ${el.hp_current}/${el.hpMax}</div>
              <div class="elem-bar"><div class="elem-bar-fill hp-fill" style="width:${elHpPct}%"></div></div>
              <div>XP ${el.xp || 0}/${el.xpNext}</div>
              <div class="elem-bar"><div class="elem-bar-fill xp-fill" style="width:${elXpPct}%"></div></div>
              <div>💪 ${el.str}</div>
              <div>🛡️ ${el.def}</div>
              <div>✨ ${el.mag}</div>
              <div>❤️ ${el.vit}</div>
              <div>⚔️ ${el.dmgMin}-${el.dmgMax}</div>
            </div>
            <div style="margin:8px 0 4px;padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:6px">
              <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:4px">Element Affinity:</div>
              ${(() => {
            const meta = {pyro:['🔥','#ef4444'],water:['💧','#3b82f6'],electro:['⚡','#a855f7'],wind:['🌪️','#22c55e']};
            const affs = [{k:'pyro',v:Number(el.pyro_affinity||0)},{k:'water',v:Number(el.water_affinity||0)},{k:'electro',v:Number(el.electro_affinity||0)},{k:'wind',v:Number(el.wind_affinity||0)}];
            const curV = affs.find(a=>a.k===el.element)?.v||0;
            const maxV = Math.max(...affs.map(a=>a.v),1);
            return affs.map(a => {
                const [emo,clr] = meta[a.k];
                const isCur = a.k === el.element;
                const gap = curV - a.v;
                const pct = Math.round((a.v/maxV)*100);
                return `<div style="display:flex;align-items:center;gap:4px;padding:1px 0">
                    <span style="font-size:0.7rem">${emo}</span>
                    <div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
                      <div style="height:100%;width:${pct}%;background:${clr};border-radius:3px"></div>
                    </div>
                    <span style="font-size:0.6rem;color:var(--text-dim);min-width:16px;text-align:right">${a.v}</span>
                    ${isCur?'<span style="font-size:0.55rem;color:var(--gold)">◀</span>':`<span style="font-size:0.55rem;color:${gap>0?'var(--text-dim)':'#ef4444'}">${gap>0?'+'+gap:'⚡'}</span>`}
                  </div>`;
            }).join('');
        })()}
            </div>
            ${el.stat_points > 0 ? `
            <div class="elem-stat-assign">
              <div style="font-size:0.75rem;margin:8px 0 4px;color:var(--gold);border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">
                📊 Assign Stats <span style="float:right">Points: <strong class="elem-pts-left">${el.stat_points}</strong></span>
              </div>
              <div class="elem-assign-row" data-elem-assign="str"><span>💪 Str</span><span class="elem-assign-val">0</span><div class="elem-qty-btn elem-assign-dec">−</div><div class="elem-qty-btn elem-assign-inc">+</div></div>
              <div class="elem-assign-row" data-elem-assign="def"><span>🛡️ Def</span><span class="elem-assign-val">0</span><div class="elem-qty-btn elem-assign-dec">−</div><div class="elem-qty-btn elem-assign-inc">+</div></div>
              <div class="elem-assign-row" data-elem-assign="mag"><span>✨ Mag</span><span class="elem-assign-val">0</span><div class="elem-qty-btn elem-assign-dec">−</div><div class="elem-qty-btn elem-assign-inc">+</div></div>
              <div class="elem-assign-row" data-elem-assign="vit"><span>❤️ Vit</span><span class="elem-assign-val">0</span><div class="elem-qty-btn elem-assign-dec">−</div><div class="elem-qty-btn elem-assign-inc">+</div></div>
              <div class="elem-assign-go" data-elem-id="${el.id}" data-action="elemAssignStats">Assign</div>
            </div>
            ` : ''}
            <div id="elem-feed-section-${el.id}">
              <div style="font-size:0.75rem;margin:10px 0 6px;color:var(--text-dim);border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">🍽️ Feed Materials</div>
              <div class="elem-feed-loading" style="font-size:0.7rem;color:var(--text-dim)">Loading...</div>
            </div>
          </div>`;
    })() : ''}
        <div class="char-panel char-panel-setups" id="char-setups-panel">
          <h3>⚙️ SETUPS</h3>
          <div id="char-setups-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"></div>
        </div>
        </div>
      </div>
    </div>`;
    ensureAchievementsModal();
    ensureBadgePickerModal();
    renderTopBar();
    loadAchievements();
    refreshInlineBadgeChips();
    charSheet.querySelectorAll('.stat-upgrade-btn').forEach(btn => {
        // Desktop: hover shows cost popup, click upgrades
        btn.addEventListener('mouseenter', () => showStatUpgradeInfo(btn, true));
        btn.addEventListener('mouseleave', hideTooltip);
        // Mobile: long press shows cost popup, tap upgrades
        if ('ontouchstart' in window) {
            let longPressTimer, longPressed = false;
            btn.addEventListener('touchstart', () => {
                longPressed = false;
                longPressTimer = setTimeout(() => { longPressed = true; showStatUpgradeInfo(btn); }, 500);
            }, { passive: true });
            btn.addEventListener('touchmove', () => clearTimeout(longPressTimer), { passive: true });
            btn.addEventListener('touchend', () => {
                clearTimeout(longPressTimer);
                if (!longPressed) upgradestat(btn.dataset.stat);
                longPressed = false;
            });
        }
        btn.addEventListener('click', () => upgradestat(btn.dataset.stat));
    });
    // Elemental stat assignment +/- buttons
    charSheet.querySelectorAll('.elem-assign-row').forEach(row => {
        const stat = row.dataset.elemAssign;
        const valEl = row.querySelector('.elem-assign-val');
        const ptsEl = document.querySelector('.elem-pts-left');
        const assignBtn = row.closest('.elem-stat-assign')?.querySelector('.elem-assign-go');
        row.querySelector('.elem-assign-inc').onclick = () => {
            if (assignBtn?.disabled || assignBtn?.getAttribute('aria-disabled') === 'true') return;
            const cur = parseInt(valEl.textContent) || 0;
            const pts = parseInt(ptsEl?.textContent) || 0;
            if (pts > 0) { valEl.textContent = cur + 1; if (ptsEl) ptsEl.textContent = pts - 1; }
        };
        row.querySelector('.elem-assign-dec').onclick = () => {
            if (assignBtn?.disabled || assignBtn?.getAttribute('aria-disabled') === 'true') return;
            const cur = parseInt(valEl.textContent) || 0;
            const pts = parseInt(ptsEl?.textContent) || 0;
            if (cur > 0) { valEl.textContent = cur - 1; if (ptsEl) ptsEl.textContent = pts + 1; }
        };
    });
    if (c.elemental) loadElemFeedItems(c.elemental.id);
    loadSetups();
}

// ── Equipment Setups ────────────────────────────────────────────────────
async function loadSetups() {
    const grid = document.getElementById('char-setups-grid');
    if (!grid) return;
    try {
        const data = await api('GET', '/game/setups');
        const setups = data || [];
        grid.innerHTML = setups.map(s => {
            const isEmpty = !s.data || Object.keys(s.data).length === 0;
            const slotLabel = s.name || `Setup ${s.slot}`;
            return `<div class="setup-card" data-slot="${s.slot}" style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;border:1px solid rgba(255,255,255,0.06)">
        <input class="setup-name" value="${escHtml(slotLabel)}" maxlength="24" style="width:100%;background:transparent;border:none;color:var(--text-bright);font-size:0.85rem;font-weight:600;outline:none;margin-bottom:6px;padding:2px 4px;border-radius:4px" data-slot="${s.slot}">
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="setup-save" data-slot="${s.slot}" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:rgba(75,175,80,0.15);color:#4caf50;cursor:pointer;font-size:0.75rem">💾 Save</button>
          <button class="setup-load" data-slot="${s.slot}" ${isEmpty?'disabled':''} style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:rgba(100,150,255,0.15);color:#6496ff;cursor:pointer;font-size:0.75rem;${isEmpty?'opacity:0.4;cursor:default':''}">📂 Load</button>
        </div>
        ${isEmpty ? '<div style="font-size:0.65rem;color:var(--text-dim);margin-top:4px">Empty — save current gear</div>' : `<div style="font-size:0.65rem;color:var(--text-dim);margin-top:4px">${Object.keys(s.data).length} item(s)</div>`}
      </div>`;
        }).join('');

        // Cancel flag to prevent blur renaming from racing with Save click
        var _cancelSetupRename = false;

        // Bind events
        grid.querySelectorAll('.setup-save').forEach(btn => {
            btn.addEventListener('click', async () => {
                _cancelSetupRename = true;
                const slot = btn.dataset.slot;
                const nameInput = grid.querySelector(`.setup-name[data-slot="${slot}"]`);
                const name = nameInput ? nameInput.value.trim() || `Setup ${slot}` : `Setup ${slot}`;
                btn.textContent = '...';
                btn.disabled = true;
                try {
                    await api('PUT', `/game/setups/${slot}`, { name, snapshot: true });
                    await loadSetups();
                    showMsg('char-msg', `Setup ${slot} saved!`);
                } catch (e) { showMsg('char-msg', e.message, true); loadSetups(); }
            });
        });

        grid.querySelectorAll('.setup-load').forEach(btn => {
            btn.addEventListener('click', async () => {
                _cancelSetupRename = true;
                if (btn.disabled) return;
                const slot = btn.dataset.slot;
                const nameInput = grid.querySelector('.setup-name[data-slot="' + slot + '"]');
                const setupName = nameInput ? nameInput.value.trim() || 'Setup ' + slot : 'Setup ' + slot;
                const confirmed = await openGameDialog({
                    title: 'Load: ' + setupName,
                    message: 'Load this setup? Current equipment will be replaced.',
                    confirmLabel: 'Load',
                    cancelLabel: 'Cancel',
                    showCancel: true,
                    danger: true
                });
                if (!confirmed) return;
                btn.textContent = '...';
                btn.disabled = true;
                try {
                    const result = await api('POST', '/game/setups/' + slot + '/load');
                    if (result.character) {
                        character = result.character;
                        renderCharacter();
                        loadInventory();
                        showMsg('char-msg', 'Setup ' + slot + ' loaded!');
                    }
                } catch (e) { showMsg('char-msg', e.message, true); loadSetups(); }
            });
        });

        // Save name on enter/blur (deferred via setTimeout to avoid racing with Save/Load)
        grid.querySelectorAll('.setup-name').forEach(inp => {
            inp.addEventListener('blur', () => {
                var slot = inp.dataset.slot;
                var name = inp.value.trim() || 'Setup ' + slot;
                setTimeout(async () => {
                    if (_cancelSetupRename) { _cancelSetupRename = false; return; }
                    try {
                        await api('PUT', '/game/setups/' + slot, { name: name });
                    } catch {}
                }, 0);
            });
            inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); this.blur(); } });
        });
    } catch (e) { grid.innerHTML = `<div style="font-size:0.7rem;color:var(--text-dim)">Setups error: ${e.message}</div>`; }
}

const ELEM_FEED_IDS = new Set([
    'dgn_pyro_cinder','dgn_water_droplet','dgn_electro_spark','dgn_wind_feather',
    'dgn_pyro_ember','dgn_water_crystal','dgn_electro_shard','dgn_wind_whisper',
    'dgn_pyro_core','dgn_water_core','dgn_electro_core','dgn_wind_core',
    'dgn_pyro_essence','dgn_water_essence','dgn_electro_essence','dgn_wind_essence',
    'dgn_pyro_primordial','dgn_water_primordial','dgn_electro_primordial','dgn_wind_primordial',
]);
async function elemFeedItem(elemId, invId, el) {
    if (el.disabled) return;
    el.disabled = true;
    const originalLabel = el.textContent;
    el.textContent = '⏳ Feeding...';

    try {
        const r = await api('POST', '/game/elemental/feed', { elemental_id: elemId, inventory_id: invId });
        if (r.elemental) {
            const charR = await api('GET', '/game/character');
            if (charR) Object.assign(character, charR);
            renderCharacter(); // Re-render the character tab to update everything
            gameLog(r.message || '🍽️ Fed elemental!', 'info');
        } else {
            gameLog('⚠️ ' + (r.error || 'Failed to feed'), 'error');
            el.disabled = false;
            el.textContent = originalLabel;
        }
    } catch (e) {
        console.error('[Feed] Error:', e);
        gameLog('⚠️ ' + (e.message || 'Error feeding elemental'), 'error');
        el.disabled = false;
        el.textContent = originalLabel;
    }
}

// Ensure the function is globally accessible
window.elemFeedItem = elemFeedItem;

// Elemental stat assignment handler (called via data-action="elemAssignStats")
window.elemAssignStats = async function(el, event) {
    const panel = el?.closest('.char-panel-elemental');
    if (!panel) return;
    const stats = {};
    panel.querySelectorAll('.elem-assign-row').forEach(row => {
        const stat = row.dataset.elemAssign;
        stats[stat] = parseInt(row.querySelector('.elem-assign-val')?.textContent) || 0;
    });
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const origText = el.textContent;
    el.textContent = '...';
    try {
        const r = await api('POST', '/game/elemental/assign-stats', stats);
        if (r.elemental) {
            const charR = await api('GET', '/game/character');
            if (charR) Object.assign(character, charR);
            renderCharacter();
            gameLog(r.message || 'Stats assigned!', 'info');
        } else {
            el.textContent = origText;
            gameLog('⚠️ ' + (r.error || 'Failed to assign'), 'error');
        }
    } catch (e) {
        console.error('[ElemAssign]', e);
        el.textContent = origText;
        gameLog('⚠️ ' + e.message, 'error');
    }
};

async function loadElemFeedItems(elemId) {
    try {
        const inv = await api('GET', '/game/inventory');
        const section = document.getElementById(`elem-feed-section-${elemId}`);
        if (!section) return;
        const listEl = section.querySelector('.elem-feed-loading');
        if (!listEl) return;
        const mats = (inv?.items || []).filter(i => {
            const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : (i.item_data || {});
            const isRawMat = d.type === 'raw_mat' || d.category === 'material';
            return isRawMat && (d.qty || 1) > 0 && ELEM_FEED_IDS.has(d.id);
        });
        if (!mats.length) {
            listEl.textContent = '📭 No materials. Clear dungeon rooms for drops!';
            return;
        }
        listEl.innerHTML = '';
        mats.forEach(inv => {
            const d = typeof inv.item_data === 'string' ? JSON.parse(inv.item_data) : (inv.item_data || {});
            const stack = d.qty || 1;
            const name = escHtml(d.name);
            const emoji = d.emoji || '📦';
            const row = document.createElement('div');
            row.className = 'elem-feed-row';
            row.style.cssText = 'position:relative;z-index:1';
            const dec = document.createElement('div');
            dec.className = 'elem-qty-btn';
            dec.textContent = '−';
            const input = document.createElement('input');
            input.className = 'elem-qty-input';
            input.type = 'number';
            input.min = '1';
            input.max = String(stack);
            input.value = '1';
            const inc = document.createElement('div');
            inc.className = 'elem-qty-btn';
            inc.textContent = '+';
            const go = document.createElement('div');
            go.className = 'elem-feed-go';
            go.textContent = 'Feed';
            const ctrls = document.createElement('div');
            ctrls.className = 'elem-feed-ctrls';
            ctrls.append(dec, input, inc, go);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'elem-feed-name';
            nameSpan.textContent = `${emoji} ${name}`;
            const stackSpan = document.createElement('span');
            stackSpan.className = 'elem-feed-stack';
            stackSpan.textContent = `×${stack}`;
            row.append(nameSpan, stackSpan, ctrls);
            dec.onclick = () => {
                let v = parseInt(input.value) || 1;
                input.value = Math.max(1, Math.min(stack, v - 1));
            };
            inc.onclick = () => {
                let v = parseInt(input.value) || 1;
                input.value = Math.max(1, Math.min(stack, v + 1));
            };
            input.onchange = () => {
                let v = parseInt(input.value) || 1;
                input.value = Math.max(1, Math.min(stack, v));
            };
            go.onclick = async () => {
                if (go._feeding) return;
                const qty = parseInt(input.value) || 1;
                go._feeding = true;
                go.textContent = '...';
                try {
                    const r = await api('POST', '/game/elemental/feed', { inventory_id: inv.id, qty });
                    if (r.elemental) {
                        const charR = await api('GET', '/game/character');
                        if (charR) Object.assign(character, charR);
                        renderCharacter();
                        gameLog(r.message || '🍽️ Fed elemental!', 'info');
                    } else {
                        gameLog('⚠️ ' + (r.error || 'Failed to feed'), 'error');
                        go._feeding = false;
                        go.textContent = 'Feed';
                    }
                } catch (e) {
                    console.error('[Feed] Error:', e);
                    gameLog('⚠️ ' + (e.message || 'Error feeding elemental'), 'error');
                    go._feeding = false;
                    go.textContent = 'Feed';
                }
            };
            listEl.appendChild(row);
        });
    } catch (e) {
        const section = document.getElementById(`elem-feed-section-${elemId}`);
        if (section) {
            const listEl = section.querySelector('.elem-feed-loading');
            if (listEl) listEl.textContent = '⚠️ Failed to load materials';
        }
    }
}
function statRow(icon,label,val,max,cls) {
    return `<div class="stat-row"><span class="stat-icon">${icon}</span><span class="stat-label">${label}</span>
    <div class="stat-bar-wrap"><div class="stat-bar"><div class="stat-fill ${cls}-fill" style="width:${Math.round(val/Math.max(max,1)*100)}%"></div></div></div>
    <span class="stat-val">${val}</span></div>`;
}
function getClassStatIconFilter(className, profile = false) {
    const normalized = String(className || '').trim().toLowerCase();
    if (normalized === 'mage') {
        return profile
            ? 'brightness(0) saturate(100%) invert(70%) sepia(83%) saturate(2634%) hue-rotate(188deg) brightness(112%) contrast(110%)'
            : 'brightness(0) saturate(100%) invert(66%) sepia(77%) saturate(2113%) hue-rotate(189deg) brightness(108%) contrast(106%)';
    }
    if (normalized === 'warrior') {
        return profile
            ? 'brightness(0) saturate(100%) invert(61%) sepia(62%) saturate(2464%) hue-rotate(342deg) brightness(106%) contrast(112%)'
            : 'brightness(0) saturate(100%) invert(57%) sepia(56%) saturate(2010%) hue-rotate(344deg) brightness(102%) contrast(108%)';
    }
    if (normalized === 'paladin') {
        return profile
            ? 'brightness(0) saturate(100%) invert(84%) sepia(52%) saturate(1117%) hue-rotate(358deg) brightness(104%) contrast(108%)'
            : 'brightness(0) saturate(100%) invert(78%) sepia(44%) saturate(1044%) hue-rotate(358deg) brightness(101%) contrast(105%)';
    }
    if (normalized === 'rogue') {
        return profile
            ? 'brightness(0) saturate(100%) invert(77%) sepia(53%) saturate(1067%) hue-rotate(98deg) brightness(105%) contrast(110%)'
            : 'brightness(0) saturate(100%) invert(71%) sepia(45%) saturate(941%) hue-rotate(100deg) brightness(101%) contrast(106%)';
    }
    return profile ? 'brightness(0) invert(1) opacity(0.96)' : 'brightness(0) invert(1) opacity(0.92)';
}
function renderStatIcon(assetKey, fallback, label, className = '', profile = false) {
    const filter = getClassStatIconFilter(className, profile);
    const glow = profile ? 'drop-shadow(0 0 7px rgba(255,255,255,0.28))' : 'drop-shadow(0 0 5px rgba(255,255,255,0.2))';
    return `<img class="stat-icon-img" src="/images/assets/${assetKey}.png" alt="${label}" loading="lazy" decoding="async" data-error-hide="true" style="filter:${filter} ${glow};"><span class="stat-icon-fallback">${fallback}</span>`;
}
function elemEmoji(t) { return {pyro:'🔥',water:'💧',wind:'🌀',electro:'⚡'}[t]||''; }
function getSkillImagePath(skillId) {
    return `/images/assets/skills/${String(skillId || '').replace(/_/g, '-')}.png`;
}

async function loadAchievements() {
    const summaryEl = document.getElementById('achievements-summary-inline');
    if (summaryEl) summaryEl.textContent = 'Loading...';
    try {
        const data = await api('GET', '/game/achievements');
        window._achievementsData = data;
        renderAchievementsSummary(data);
    } catch (e) {
        if (summaryEl) summaryEl.textContent = 'Unavailable';
    }
}

function renderAchievementRewardSummary(achievement) {
    return (achievement.reward_summary || []).map(text => `<span class="achievement-reward-chip">${escHtml(text)}</span>`).join('');
}

function getVisibleAchievements(items) {
    return items.sort((a, b) => {
        if (a.claimable !== b.claimable) return a.claimable ? -1 : 1;
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.target || 0) - (b.target || 0);
    });
}

function renderAchievementsSummary(data) {
    const el = document.getElementById('achievements-summary-inline');
    if (!el) return;
    const totals = data?.totals || { claimable: 0, claimed: 0, total: 0 };
    el.textContent = totals.claimable > 0 ? `${totals.claimable} ready` : `${totals.claimed}/${totals.total} claimed`;
}

let achievementsFilter = 'total';

function setAchievementsFilter(filter) {
    achievementsFilter = filter;
    renderAchievementsPanel(window._achievementsData);
}

function renderAchievementsPanel(data, targetId='achievements-modal-content') {
    const el = document.getElementById(targetId);
    if (!el) return;
    const allItems = getVisibleAchievements(data?.items || []);
    const totals = data?.totals || { claimed: 0, total: 0, claimable: 0 };
    const items = allItems.filter(a => {
        if (achievementsFilter === 'claimed') return a.claimed;
        if (achievementsFilter === 'ready') return a.claimable;
        return true;
    });
    if (!items.length) {
        el.innerHTML = `
        <div class="achievements-summary">
            <div class="${achievementsFilter === 'claimed' ? 'active' : ''}" ${actionAttrs('setAchievementsFilter', 'claimed')}><strong>${totals.claimed}</strong> claimed</div>
            <div class="${achievementsFilter === 'ready' ? 'active' : ''}" ${actionAttrs('setAchievementsFilter', 'ready')}><strong>${totals.claimable}</strong> ready</div>
            <div class="${achievementsFilter === 'total' ? 'active' : ''}" ${actionAttrs('setAchievementsFilter', 'total')}><strong>${totals.total}</strong> total</div>
        </div>
        <div class="achievements-panel-loading" style="margin-top:12px">No achievements in this filter.</div>`;
        return;
    }

    el.innerHTML = `
        <div class="achievements-summary">
            <div class="${achievementsFilter === 'claimed' ? 'active' : ''}" ${actionAttrs('setAchievementsFilter', 'claimed')}><strong>${totals.claimed}</strong> claimed</div>
            <div class="${achievementsFilter === 'ready' ? 'active' : ''}" ${actionAttrs('setAchievementsFilter', 'ready')}><strong>${totals.claimable}</strong> ready</div>
            <div class="${achievementsFilter === 'total' ? 'active' : ''}" ${actionAttrs('setAchievementsFilter', 'total')}><strong>${totals.total}</strong> total</div>
        </div>
        <div class="achievements-list">
            ${items.map(achievement => {
        const pct = Math.max(0, Math.min(100, Math.round((achievement.progress / Math.max(achievement.target, 1)) * 100)));
        const cardClass = achievement.claimed ? 'claimed' : achievement.claimable ? 'claimable' : 'locked';
        const progressText = achievement.claimed
            ? 'Claimed'
            : achievement.claimable
                ? 'Ready to claim'
                : `${achievement.progress.toLocaleString()} / ${achievement.target.toLocaleString()}`;
        const nextLabel = achievement.claimed
            ? 'Max tier cleared'
            : `Next milestone: ${achievement.target.toLocaleString()}`;
        return `<div class="achievement-card ${cardClass}">
                    <div class="achievement-card-head">
                        <div class="achievement-icon">${achievement.icon}</div>
                        <div class="achievement-copy">
                            <div class="achievement-name">${escHtml(achievement.name)}</div>
                            <div class="achievement-desc">${escHtml(achievement.desc)}</div>
                            <div class="achievement-tier-note">${nextLabel}</div>
                        </div>
                    </div>
                    <div class="achievement-progress-row">
                        <div class="achievement-progress-bar"><div class="achievement-progress-fill" style="width:${pct}%"></div></div>
                        <div class="achievement-progress-text">${progressText}</div>
                    </div>
                    <div class="achievement-rewards">${renderAchievementRewardSummary(achievement)}</div>
                    ${achievement.claimed
            ? '<button class="achievement-claim-btn claimed" disabled>Claimed</button>'
            : achievement.claimable
                ? `<button class="achievement-claim-btn" ${actionAttrs('claimAchievement', achievement.id)}>Claim Reward</button>`
                : '<button class="achievement-claim-btn locked" disabled>In Progress</button>'}
                </div>`;
    }).join('')}
        </div>`;
}

function ensureAchievementsModal() {
    if (document.getElementById('achievements-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div id="achievements-modal" class="modal-overlay hidden">
            <div class="modal-box achievements-modal-box">
                <div class="modal-header">
                    <h3>Achievements</h3>
                    <button class="btn-secondary" ${actionAttrs('closeAchievementsModal')}>✕</button>
                </div>
                <div id="achievements-modal-content" class="achievements-panel-loading">Loading achievements...</div>
                <div id="achievements-msg" class="msg-bar hidden" style="margin-top:12px"></div>
            </div>
        </div>
    `);
}

async function openAchievementsModal() {
    ensureAchievementsModal();
    const modal = document.getElementById('achievements-modal');
    const content = document.getElementById('achievements-modal-content');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="achievements-panel-loading">Loading achievements...</div>';
    try {
        const data = await api('GET', '/game/achievements');
        window._achievementsData = data;
        renderAchievementsSummary(data);
        renderAchievementsPanel(data, 'achievements-modal-content');
    } catch (e) {
        content.innerHTML = `<div class="achievements-panel-loading">${escHtml(e.message)}</div>`;
    }
}

function closeAchievementsModal() {
    document.getElementById('achievements-modal')?.classList.add('hidden');
}

function ensureBadgePickerModal() {
    if (document.getElementById('badge-picker-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div id="badge-picker-modal" class="modal-overlay hidden">
            <div class="modal-box achievements-modal-box">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
                    <div>
                        <div style="font-family:'Cinzel',serif;font-size:1.1rem;color:var(--gold-light);font-weight:800">Profile Badges</div>
                        <div style="font-size:0.78rem;color:var(--text-dim)">Pick up to 3 completed achievements to show on your profile and leaderboard.</div>
                    </div>
                    <button class="btn-secondary btn-sm" data-action="closeBadgePickerModal">Close</button>
                </div>
                <div id="badge-picker-content" class="achievements-panel-loading">Loading...</div>
                <div id="badge-picker-msg" class="topbar-menu-flash hidden" style="margin-top:10px"></div>
            </div>
        </div>
    `);
}

function closeBadgePickerModal() {
    document.getElementById('badge-picker-modal')?.classList.add('hidden');
}
window.closeBadgePickerModal = closeBadgePickerModal;

function getAchievementItemMap() {
    const items = window._achievementsData?.items || [];
    const map = new Map();
    for (const a of items) {
        if (a?.id) map.set(String(a.id), a);
    }
    return map;
}

function refreshInlineBadgeChips() {
    const map = getAchievementItemMap();
    document.querySelectorAll('.profile-badge-chip').forEach(el => {
        const id = String(el.dataset.badgeId || '');
        const def = map.get(id);
        el.textContent = def?.icon || '🏅';
        el.title = def?.name || id || 'Badge';
    });
}

async function openBadgePickerModal() {
    ensureBadgePickerModal();
    const modal = document.getElementById('badge-picker-modal');
    const content = document.getElementById('badge-picker-content');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="achievements-panel-loading">Loading achievements...</div>';
    try {
        const data = window._achievementsData || await api('GET', '/game/achievements');
        window._achievementsData = data;
        renderAchievementsSummary(data);
        renderBadgePicker(data);
        refreshInlineBadgeChips();
    } catch (e) {
        content.innerHTML = `<div class="achievements-panel-loading">${escHtml(e.message)}</div>`;
    }
}
window.openBadgePickerModal = openBadgePickerModal;

function renderBadgePicker(data) {
    const content = document.getElementById('badge-picker-content');
    if (!content) return;
    const items = (data?.items || []).filter(a => a?.completed);
    const current = Array.isArray(character?.profile_badges) ? character.profile_badges.slice(0, 3).map(String) : [];

    const optionsHtml = ['<option value=\"\">(None)</option>'].concat(
        items.map(a => `<option value="${escHtml(a.id)}">${escHtml(`${a.icon || '🏅'} ${a.name}`)}</option>`)
    ).join('');

    const buildSelect = (idx) => `
        <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:0.7rem;color:var(--text-dim);font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Badge ${idx + 1}</div>
            <select id="badge-slot-${idx}" class="input-field" style="width:100%">${optionsHtml}</select>
        </div>`;

    content.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr;gap:12px">
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
                ${[0,1,2].map(buildSelect).join('')}
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end">
                <button class="btn-secondary" data-action="closeBadgePickerModal">Cancel</button>
                <button class="btn-primary" data-action="saveProfileBadges">Save Badges</button>
            </div>
            <div style="font-size:0.72rem;color:var(--text-dim)">Only completed achievements can be displayed. Duplicate selections will be ignored.</div>
        </div>
    `;

    for (let i = 0; i < 3; i++) {
        const sel = document.getElementById(`badge-slot-${i}`);
        if (!sel) continue;
        sel.value = current[i] || '';
    }
}

async function saveProfileBadges() {
    try {
        const picks = [0,1,2].map(i => document.getElementById(`badge-slot-${i}`)?.value || '').filter(Boolean);
        const res = await api('POST', '/game/profile/badges', { badges: picks });
        if (res?.character) character = res.character;
        renderCharacter();
        closeBadgePickerModal();
        await openGameNoticeDialog({ title: '🎖️ Profile Badges', message: 'Your profile badges were updated.' });
    } catch (e) {
        await openGameNoticeDialog({ title: '🎖️ Profile Badges', message: e.message || String(e) });
    }
}
window.saveProfileBadges = saveProfileBadges;

async function claimAchievement(achievementId) {
    try {
        const result = await api('POST', `/game/achievements/${achievementId}/claim`);
        character = result.character;
        renderTopBar();
        const data = await api('GET', '/game/achievements');
        window._achievementsData = data;
        renderAchievementsSummary(data);
        renderAchievementsPanel(data, 'achievements-modal-content');
        renderCharacter();
        showMsg('achievements-msg', result.message);
    } catch (e) {
        showMsg('achievements-msg', e.message, true);
    }
}

function renderWeeklyTaskRewardSummary(task) {
    return (task.reward_summary || []).map(text => `<span class="achievement-reward-chip">${escHtml(text)}</span>`).join('');
}

function formatWeeklyResetTime(unixTs) {
    if (!unixTs) return 'soon';
    return new Date(unixTs * 1000).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function renderWeeklyTasksPanel(data, targetId='weekly-tasks-modal-content') {
    const el = document.getElementById(targetId);
    if (!el) return;
    const items = data?.items || [];
    const totals = data?.totals || { total: 0, claimed: 0, claimable: 0 };
    if (!items.length) {
        el.innerHTML = '<div class="achievements-panel-loading">No weekly tasks right now.</div>';
        return;
    }

    el.innerHTML = `
        <div class="achievements-summary weekly-tasks-summary">
            <div><strong>${totals.claimed}</strong> claimed</div>
            <div><strong>${totals.claimable}</strong> ready</div>
            <div><strong>${totals.total}</strong> tasks</div>
            <div><strong>${formatWeeklyResetTime(data?.nextResetAt)}</strong> reset</div>
        </div>
        <div class="achievements-list">
            ${items.map(task => {
        const pct = Math.max(0, Math.min(100, Math.round((task.progress / Math.max(task.target, 1)) * 100)));
        const cardClass = task.claimed ? 'claimed' : task.claimable ? 'claimable' : 'locked';
        const progressText = task.claimed
            ? 'Claimed'
            : task.claimable
                ? 'Ready to claim'
                : `${task.progress.toLocaleString()} / ${task.target.toLocaleString()}`;
        const materialChoices = task.material_choices?.length ? `
                    <div class="weekly-task-materials">
                        ${task.material_choices.map(choice => `
                            <button class="weekly-task-material-btn" ${actionAttrs('claimWeeklyTask', task.id, choice.id)}>
                                <span>${choice.emoji}</span>
                                <span>${escHtml(choice.name)}</span>
                            </button>
                        `).join('')}
                    </div>` : '';
        const actionHtml = task.claimed
            ? '<button class="achievement-claim-btn claimed" disabled>Claimed</button>'
            : task.claimable
                ? (task.material_choices?.length
                    ? `<div class="weekly-task-claim-block"><div class="weekly-task-choice-note">Choose your material reward:</div>${materialChoices}</div>`
                    : `<button class="achievement-claim-btn" ${actionAttrs('claimWeeklyTask', task.id)}>Claim Reward</button>`)
                : '<button class="achievement-claim-btn locked" disabled>In Progress</button>';
        return `<div class="achievement-card ${cardClass}">
                    <div class="achievement-card-head">
                        <div class="achievement-icon">${task.icon}</div>
                        <div class="achievement-copy">
                            <div class="achievement-name">${escHtml(task.name)}</div>
                            <div class="achievement-desc">${escHtml(task.desc)}</div>
                            <div class="achievement-tier-note">Weekly objective</div>
                        </div>
                    </div>
                    <div class="achievement-progress-row">
                        <div class="achievement-progress-bar"><div class="achievement-progress-fill" style="width:${pct}%"></div></div>
                        <div class="achievement-progress-text">${progressText}</div>
                    </div>
                    <div class="achievement-rewards">${renderWeeklyTaskRewardSummary(task)}</div>
                    ${actionHtml}
                </div>`;
    }).join('')}
        </div>`;
}

function ensureWeeklyTasksModal() {
    if (document.getElementById('weekly-tasks-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div id="weekly-tasks-modal" class="modal-overlay hidden">
            <div class="modal-box achievements-modal-box">
                <div class="modal-header">
                    <h3>Weekly Tasks</h3>
                    <button class="btn-secondary" ${actionAttrs('closeWeeklyTasksModal')}>✕</button>
                </div>
                <div id="weekly-tasks-modal-content" class="achievements-panel-loading">Loading weekly tasks...</div>
                <div id="weekly-tasks-msg" class="msg-bar hidden" style="margin-top:12px"></div>
            </div>
        </div>
    `);
}

async function openWeeklyTasksModal() {
    closeTopbarMenu();
    ensureWeeklyTasksModal();
    const modal = document.getElementById('weekly-tasks-modal');
    const content = document.getElementById('weekly-tasks-modal-content');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="achievements-panel-loading">Loading weekly tasks...</div>';
    try {
        const data = await api('GET', '/game/weekly-tasks');
        window._weeklyTasksData = data;
        renderWeeklyTasksPanel(data);
    } catch (e) {
        content.innerHTML = `<div class="achievements-panel-loading">${escHtml(e.message)}</div>`;
    }
}

function closeWeeklyTasksModal() {
    document.getElementById('weekly-tasks-modal')?.classList.add('hidden');
}

async function claimWeeklyTask(taskId, materialId = null) {
    try {
        const result = await api('POST', `/game/weekly-tasks/${taskId}/claim`, materialId ? { materialId } : {});
        character = result.character;
        renderTopBar();
        renderCharacter();
        window._weeklyTasksData = result.weekly;
        renderWeeklyTasksPanel(result.weekly);
        showMsg('weekly-tasks-msg', result.message);
    } catch (e) {
        showMsg('weekly-tasks-msg', e.message, true);
    }
}

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
    counter_stance: ['chest','solar_plexus'],
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
        <button class="btn-primary" style="width:100%;margin-top:4px" ${actionAttrs('saveLoadout')}>Save Loadout</button>
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
        return `<div ${actionAttrs('selectLoadoutRound', i)} style="
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


async function checkTrainingStatus() {
    try {
        const status = await api('GET', '/skills/training/status');
        const overlay = document.getElementById('training-overlay');
        if (!overlay) return;

        if (status && status.active) {
            const remaining = status.remainingSeconds || status.remaining || 0;
            const percent = Math.floor((status.progressPercent ?? status.progressCurrent ?? status.progress_current ?? 0));
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;

            const skillNameEl = document.getElementById('training-skill-name');
            const timerEl = document.getElementById('training-overlay-timer');
            const fillEl = document.getElementById('training-overlay-fill');
            const progressTextEl = document.getElementById('training-progress-text');

            if (skillNameEl) skillNameEl.textContent = `Training: ${status.skillName || (status.skillId || status.skill_id || '').replace(/_/g, ' ')}`;
            if (timerEl) timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
            if (fillEl) fillEl.style.width = `${percent}%`;
            if (progressTextEl) progressTextEl.textContent = formatTrainingProgressText(status);

            overlay.classList.remove('hidden');
            return;
        }

        overlay.classList.add('hidden');
        if (trainingInterval) {
            clearInterval(trainingInterval);
            trainingInterval = null;
        }
    } catch(e) {
        console.error('Failed to check training status:', e);
    }
}

// Start polling for training status (every second for smooth countdown)
function startTrainingPolling() {
    if (trainingInterval) clearInterval(trainingInterval);
    trainingInterval = setInterval(checkTrainingStatus, 1000);
    checkTrainingStatus();
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
            ${actionAttrs('onLoadoutDotClick', type, zoneKey)}
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
                 data-error-hide="true">
            ${dots}
        </div>`;

    updateLoadoutZoneInfo(type, currentZone);
}

function onLoadoutDotClick(type, zoneKey, el, event) {
    event?.stopPropagation();
    closeLoadoutPopup();
    const dot = el;
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
        return `<div ${actionAttrs('pickLoadoutZone', type, k)}
            style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;cursor:pointer;
                   background:${isActive?`${color}22`:'transparent'};
                   border:1px solid ${isActive?color:'transparent'};
                   transition:background 0.1s;margin-bottom:2px">
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
function renderUpgrade() {
    if (!character) return;
    const c = character;
    const costs = c.upgradeCosts || {};

    const ev = c.active_event;
    const hasStatDiscount = ev?.key === 'discount_stats';
    const hasApprentice = !!(c.premium_features && c.premium_features['apprentice']);

    document.getElementById('upgrade-gold').innerHTML = `
        <div class="upgrade-wallet">
            <span class="upgrade-wallet-label">War Chest</span>
            <span class="upgrade-wallet-value">💰 ${c.gold.toLocaleString()}</span>
        </div>`;

    const evBanner = hasStatDiscount ? `<div style="background:rgba(241,196,15,0.12);border:1px solid rgba(241,196,15,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:#f1c40f">📉 <strong>Stat Sale active!</strong> All upgrades 30% off!</div>` : '';
    const apprenticeBanner = hasApprentice ? `<div style="background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:#9b59b6">📚 <strong>Apprentice Premium:</strong> Additional 20% off all upgrades!</div>` : '';
    const squadBanner = c.squad_discount_pct > 0 ? `<div style="background:rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:#2ecc71">🏰 <strong>Squad Base:</strong> ${c.squad_discount_pct}% off all upgrades!</div>` : '';

    const stats = [
        { key: 'strength', asset: 'strength', icon: '💪', label: 'Strength' },
        { key: 'defense', asset: 'defense', icon: '🛡️', label: 'Defense' },
        { key: 'agility', asset: 'agility', icon: '⚡', label: 'Agility', hint: 'Dodge incoming hits' },
        { key: 'magic', asset: 'magic', icon: '✨', label: 'Magic' },
        { key: 'vitality', asset: 'vitality', icon: '❤️', label: 'Vitality', hint: 'Also boosts current HP' },
        { key: 'hit_chance', asset: 'accuracy', icon: '🎯', label: 'Hit Chance', hint: 'Accuracy vs agility' },
        { key: 'crit_chance', asset: 'critical', icon: '💥', label: 'Crit Chance', hint: 'Chance to hit max dmg' },
    ];

    document.getElementById('upgrade-grid').innerHTML = evBanner + apprenticeBanner + squadBanner + stats.map(s => {
        // Use the cost directly from backend (already includes all modifiers: skill tree, event, premium)
        let cost = costs[s.key];
        if (cost === undefined || cost === null) cost = '?';

        const can = c.gold >= cost;
        const displayName = s.label || capitalize(s.key);
        const currentValue = c[s.key] || 0;
        const projectedValue = typeof cost === 'number' ? currentValue + 1 : currentValue;
        const statusText = can ? 'Ready to ascend' : `${Math.max(0, cost - c.gold).toLocaleString()} gold short`;

        return `<div class="upgrade-card">
            <div class="upgrade-card-aura"></div>
            <div class="upgrade-card-header">
                <div class="upgrade-card-badge">
                    <span class="upgrade-card-icon">${renderStatIcon(s.asset, s.icon, displayName, c.class)}</span>
                </div>
                <div class="upgrade-card-title-group">
                    <span class="upgrade-card-name">${displayName}</span>
                    <span class="upgrade-card-status ${can ? 'ready' : 'locked'}">${statusText}</span>
                </div>
                <span class="upgrade-card-val">${currentValue}</span>
            </div>
            ${s.hint ? `<div class="upgrade-card-hint">${s.hint}</div>` : ''}
            <div class="upgrade-discount-row">
                ${hasStatDiscount ? `<div class="upgrade-discount sale">📉 30% event discount</div>` : ''}
                ${hasApprentice ? `<div class="upgrade-discount premium">📚 20% apprentice discount</div>` : ''}
            </div>
            <div class="upgrade-stat-track">
                <div class="upgrade-stat-fill" style="width:${Math.min(100, Math.round((currentValue / Math.max(currentValue + 25, 25)) * 100))}%"></div>
            </div>
            <div class="upgrade-card-footer">
                <div class="upgrade-cost-block">
                    <span class="upgrade-cost-label">Next Rank</span>
                    <span class="upgrade-cost-value">${currentValue} → ${projectedValue}</span>
                    <span class="upgrade-cost-price">💰 ${typeof cost === 'number' ? cost.toLocaleString() : cost}</span>
                </div>
                <button class="btn-upgrade" ${actionAttrs('upgradestat', s.key)} ${can ? '' : 'disabled'}>
                    ${can ? 'Ascend +1' : 'Insufficient Gold'}
                </button>
            </div>
        </div>`;
    }).join('');
}

let _upgradingStats = {};
function showStatUpgradeInfo(btn, noAutoHide) {
    const stat = btn.dataset.stat;
    const cost = parseInt(btn.dataset.cost);
    const statNames = { strength:'Strength', defense:'Defense', agility:'Agility', magic:'Magic', vitality:'Vitality', hit_chance:'Hit Chance', crit_chance:'Crit Chance' };
    const name = statNames[stat] || stat;
    let tt = document.getElementById('item-tooltip');
    if (!tt) { tt = document.createElement('div'); tt.id = 'item-tooltip'; tt.className = 'item-tooltip hidden'; document.body.appendChild(tt); }
    const fmt = (n) => (n || 0).toLocaleString();
    tt.innerHTML = `<div style="padding:12px 14px;text-align:center;line-height:1.6"><div style="font-weight:700;margin-bottom:4px;font-size:14px">${name}</div><div style="font-size:13px">💰 Upgrade Cost: <strong>${fmt(cost)}</strong> gold</div></div>`;
    tt.style.height = '';
    tt.style.width = '';
    tt.classList.remove('hidden');
    const tw = tt.offsetWidth || 200, th = tt.offsetHeight || 80;
    const r = btn.getBoundingClientRect();
    let left = r.right + 12, top = r.top;
    if (left + tw > window.innerWidth - 8) left = r.left - tw - 12;
    if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
    tt.style.left = Math.max(8, left) + 'px';
    tt.style.top = Math.max(8, top) + 'px';
    clearTimeout(tt._hideTimer);
    if (!noAutoHide) tt._hideTimer = setTimeout(() => tt.classList.add('hidden'), 3000);
}
function hideTooltip() {
    const tt = document.getElementById('item-tooltip');
    if (tt) { clearTimeout(tt._hideTimer); tt.classList.add('hidden'); }
}

async function upgradestat(stat) {
    if (_upgradingStats[stat]) return;
    _upgradingStats[stat] = true;
    document.querySelectorAll('.btn-upgrade').forEach(b => b.disabled = true);
    try {
        const d = await api('POST', '/game/upgrade', { stat });
        character = d.character;
        _upgradingStats[stat] = false;
        document.querySelectorAll('.btn-upgrade').forEach(b => b.disabled = false);
        renderUpgrade();
        renderCharacter();
        showMsg('upgrade-msg', d.message);
    } catch(e) {
        _upgradingStats[stat] = false;
        document.querySelectorAll('.btn-upgrade').forEach(b => b.disabled = false);
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
    const mp=character?.mission_points??0, mpMax=character?.mp_max||120;
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
        <div style="font-size:0.74rem;color:var(--text-dim)">MP regenerates +5/hr · Skill activation is <strong style="color:#9b59b6">free</strong> · 1 skill per day · 5h duration</div>`;

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
        const skillImg = getSkillImagePath(sk.id);
        return `<div style="border:1px solid;border-radius:12px;padding:16px;${cardBg};display:flex;flex-direction:column;height:100%">
            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:8px">
                <div style="width:100%;max-width:213px;height:320px;margin:0 auto;border-radius:14px;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;overflow:hidden">
                    <img src="${skillImg}" alt="${escHtml(sk.name)}" style="width:213px;height:320px;object-fit:cover;display:block" data-error-hide="true" data-error-next-display="flex">
                    <span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:4rem">${sk.emoji}</span>
                </div>
                <div>
                    <div style="font-weight:700;font-size:1rem;color:var(--text-bright)">${sk.name}</div>
                    ${isActive?`<div style="font-size:0.72rem;color:#9b59b6;font-weight:600">✨ ACTIVE · ${expiresStr} remaining</div>`:
            usedToday?`<div style="font-size:0.72rem;color:var(--text-dim)">Used today — resets at midnight</div>`:''}
                </div>
            </div>
            <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:12px;line-height:1.45;flex:1">${sk.desc}</div>
            <button ${actionAttrs('activateSkill', sk.id)} ${btnDisabled?'disabled':''}
                style="width:100%;padding:8px;border-radius:8px;border:1px solid ${canActivate?'rgba(155,89,182,0.5)':'rgba(255,255,255,0.1)'};
                background:${canActivate?'rgba(155,89,182,0.2)':'rgba(255,255,255,0.04)'};margin-top:auto;
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
    // Signal tab view for bot detection
    api('POST', '/game/missions/tab-viewed').catch(() => {});
    try {
        const char = character || await api('GET', '/game/character');
        if (!character) character = char;
        await checkTravelStatus();

        // Load Abyss data if not loaded
        if (!abyssData) {
            await loadAbyssData();
        }

        // Check which map to render
        if (character.current_map === 'abyss' && abyssData) {
            renderAbyssMap();
        } else {
            renderWorldMap();
        }

        await checkAndShowMissionOverlay();
        await checkTrainingStatus();
    } catch(e) {
        console.error('Error loading missions:', e);
        const layer = document.getElementById('map-nodes-layer');
        if (layer) layer.innerHTML = `<p style="color:red;padding:20px">Failed to load: ${e.message}</p>`;
    }
}

function renderWorldMap() {
    const layer=document.getElementById('map-nodes-layer');
    if (!layer) return;
    const currentZone=character?.location||'forest';
    const playerLevel=character?.level||1;
    const drawnPairs=new Set();
    let svgLines=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">`;
    for (const [fromId,neighbors] of Object.entries(ZONE_ROUTES)) {
        for (const toId of Object.keys(neighbors)) {
            const key=[fromId,toId].sort().join('-');
            if (drawnPairs.has(key)) continue;
            drawnPairs.add(key);
            const from=ZONES[fromId],to=ZONES[toId];
            if (!from||!to) continue;
            const isActive=[currentZone,playerTravelTarget].includes(fromId)||[currentZone,playerTravelTarget].includes(toId);
            const path = buildCurvedRoutePath(from.pos, to.pos, key);
            svgLines+=`<path d="${path}" style="stroke:${isActive?'rgba(241,196,15,0.5)':'rgba(255,255,255,0.15)'};stroke-width:2;stroke-dasharray:6 4;fill:none;stroke-linecap:round"/>`;
        }
    }
    svgLines+='</svg>';

    let pinsHtml=Object.entries(ZONES).map(([zoneId,zone])=>{
        const prereq = getTravelGatekeeperPrereq(zoneId, 'overworld');
        const prereqMet = !prereq || unlockedTravelZones.has(prereq.unlockZone) || currentZone===prereq.unlockZone;
        const isUnlocked=(unlockedTravelZones.has(zoneId) || currentZone===zoneId) && prereqMet;
        const isCurrent=currentZone===zoneId;
        const isTraveling=playerTravelTarget===zoneId;
        const pinStyle=`position:absolute;left:${zone.pos.x}%;top:${zone.pos.y}%;transform:translate(-50%,-50%);cursor:pointer;z-index:10;text-align:center;transition:transform 0.2s;${!isUnlocked?'opacity:0.82':''}`;
        const badge=isCurrent?'📍':isTraveling?'🚶':!isUnlocked?'⚔️':'';
        const ringStyle=`width:72px;height:72px;border-radius:50%;border:3px solid ${isCurrent?'#f1c40f':!isUnlocked?'rgba(231,76,60,0.7)':'rgba(255,255,255,0.3)'};object-fit:cover;display:block;background:#2c3e50;${!isUnlocked?';filter:saturate(0.85);box-shadow:0 0 0 2px rgba(231,76,60,0.2)':''}${isCurrent?';box-shadow:0 0 0 3px rgba(241,196,15,0.4)':''}${isTraveling?';animation:pulse 1.5s infinite':''}`;
        return `<div style="${pinStyle}" ${actionAttrs('onMapNodeClick', zoneId)} title="${zone.name}">
            <div style="position:relative;display:inline-block">
                ${badge?`<span style="position:absolute;top:-4px;right:-4px;font-size:14px;line-height:1;z-index:2">${badge}</span>`:''}
                <img style="${ringStyle}" src="${zone.mapImg}" alt="${zone.name}" data-error-background="#2c3e50">
            </div>
            <div style="text-align:center;margin-top:5px;font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap">${zone.name}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.6);text-align:center">${isUnlocked?(isCurrent?'HERE':''):(prereq && !prereqMet ? `Beat ${prereq.guardianName}` : 'Gatekeeper')}</div>
        </div>`;
    }).join('');

    // Add Abyss Gate (appears at level 39, after Dark City is unlocked)
    const darkCityUnlocked = unlockedTravelZones.has('dark_city') || currentZone === 'dark_city';
    if (playerLevel >= 39 && darkCityUnlocked) {
        pinsHtml += ` 
            <div style="position:absolute;left:90%;top:85%;transform:translate(-50%,-50%);cursor:pointer;z-index:10;text-align:center;"  
                 ${actionAttrs('onMapNodeClick', 'abyss_gate')} title="Abyss Gate"> 
                <div style="position:relative;display:inline-block"> 
                    <img style="width:72px;height:72px;border-radius:50%;border:3px solid #9b59b6;object-fit:cover;display:block;background:#2c3e50;box-shadow:0 0 15px rgba(155,89,182,0.5);animation:pulse 2s infinite;"  
                         src="/images/zones/abyss_gate.jpg" alt="Abyss Gate" data-error-background="#2c3e50"> 
                </div> 
                <div style="text-align:center;margin-top:5px;font-size:11px;font-weight:600;color:#9b59b6;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap">Abyss Gate</div> 
                <div style="font-size:10px;color:rgba(155,89,182,0.8);text-align:center">Lv.39+</div> 
            </div> 
        `;
    }

    layer.innerHTML=svgLines+pinsHtml;
    // Restore overworld map background
    const bgImg = document.getElementById('world-map-bg');
    if (bgImg) bgImg.src = '/images/world-map.jpg';
}

function onMapNodeClick(zoneId) {
    // Check if it's the Abyss Gate (only in overworld)
    if (zoneId === 'abyss_gate') {
        enterAbyssGate();
        return;
    }

    // Determine which map we're on
    const currentMap = character?.current_map || 'overworld';
    let zone;

    if (currentMap === 'abyss' && abyssData) {
        zone = abyssData.zones[zoneId];
    } else {
        zone = ZONES[zoneId];
    }

    if (!zone) return;
    openLocationModal(zoneId);
}

async function enterAbyssGate() {
    const shadowfenUnlocked = unlockedAbyssZones.has('shadowfen');
    try {
        // Use a manual fetch so we can surface battle logs on non-200 responses.
        const storedToken = localStorage.getItem('rpg_token');
        const headers = { 'Content-Type': 'application/json' };
        if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;
        if (window.tabSession) headers['X-Tab-Session'] = window.tabSession;

        const doEnter = async (confirmChallenge) => {
            const body = confirmChallenge ? JSON.stringify({ confirmChallenge: true }) : '{}';
            const res = await fetch('/api/game/travel/abyss/enter', { method: 'POST', headers, body });
            const text = await res.text();
            const payload = text && text.trim() ? (() => { try { return JSON.parse(text); } catch { return { error: text.trim() }; } })() : {};
            return { res, payload };
        };

        // First attempt: enter (server may reply that a challenge is required).
        let { res, payload } = await doEnter(false);

        if (!res.ok && payload?.requiresChallenge) {
            const proceed = await openGameDialog({
                title: '⚠️ Gatekeeper Warning',
                message: `<p><strong>${escHtml(payload.guardianName || 'Gatekeeper')}</strong> guards Shadowfen Depths!</p>
                          <p>This gatekeeper will challenge you to combat. If you are defeated, your health will be depleted.</p>
                          <p>Are you sure you want to proceed?</p>`,
                confirmLabel: 'Challenge for Entry',
                cancelLabel: 'Cancel',
                showCancel: true,
                danger: true
            });
            if (!proceed) return;
            ({ res, payload } = await doEnter(true));
        } else if (!res.ok && !payload?.requiresChallenge) {
            // If not a challenge flow, still give a simple enter confirm for unlocked entry.
            const proceed = await openGameDialog({
                title: shadowfenUnlocked ? 'Enter the Abyss?' : 'Enter the Abyss?',
                message: `<p>You are about to enter the Abyss.</p>`,
                confirmLabel: 'Enter',
                cancelLabel: 'Cancel',
                showCancel: true
            });
            if (!proceed) return;
            ({ res, payload } = await doEnter(false));
        }

        if (!res.ok) {
            // If the server provided a battle log, show it as a battle report.
            if (Array.isArray(payload?.battleLog) && payload?.guardianName) {
                showBattleReportModal(
                    payload.battleLog,
                    false,
                    `💀 Defeated · ${payload.guardianName}`,
                    null,
                    null,
                    { enemyName: payload.guardianName, battleType: 'travel_guardian' }
                );
            } else {
                showMsg('missions-msg', payload?.error || `HTTP ${res.status}`, true);
            }
            // Refresh to pick up HP changes (loss case).
            await checkTravelStatus();
            renderCurrentMap();
            return;
        }

        if (payload?.success) {
            character.location = payload.location;
            character.current_map = 'abyss';
            await checkTravelStatus();
            renderCurrentMap();
            showMsg('missions-msg', payload.message || 'You step through the Abyss Gate into darkness...');

            const enc = payload.encounterResult;
            if (enc && Array.isArray(enc.log) && enc.guardianName) {
                showBattleReportModal(
                    enc.log,
                    true,
                    `🏆 Victory · Unlocked Shadowfen Depths`,
                    enc.totalDmgDealt ?? null,
                    enc.totalDmgTaken ?? null,
                    { enemyName: enc.guardianName, battleType: 'travel_guardian' }
                );
            }
        }
    } catch (e) {
        showMsg('missions-msg', e.message, true);
    }
}

function openLocationModal(zoneId) {
    // Determine which map we're on
    const currentMap = character?.current_map || 'overworld';
    let zone;

    if (currentMap === 'abyss' && abyssData) {
        zone = abyssData.zones[zoneId];
    } else {
        zone = ZONES[zoneId];
    }

    if (!zone) {
        console.error('Zone not found:', zoneId);
        return;
    }

    const modal = document.getElementById('mission-location-modal');
    const header = document.getElementById('mission-location-header');
    const spotsEl = document.getElementById('mission-spots-grid');
    const activeEl = document.getElementById('mission-location-active');
    if (!modal) return;

    const currentZone = character?.location || 'forest';
    const isCurrent = currentZone === zoneId;
    const isTraveling = !!playerTravelTarget;
    const hasActiveMission = !!window.activeMission;
    const actionBlocked = isTraveling || hasActiveMission;

    const isUnlocked = currentMap === 'abyss'
        ? (unlockedAbyssZones.has(zoneId) || isCurrent)
        : (unlockedTravelZones.has(zoneId) || isCurrent);
    const prereq = currentMap === 'abyss' ? null : getTravelGatekeeperPrereq(zoneId, 'overworld');
    const prereqMet = currentMap === 'abyss' ? true : (!prereq || unlockedTravelZones.has(prereq.unlockZone) || currentZone === prereq.unlockZone);
    const canChallengeThisGatekeeper = isUnlocked || prereqMet;
    let travelInfo = '';
    if (!isCurrent) {
        travelInfo = !canChallengeThisGatekeeper
            ? `Please challenge ${prereq.guardianName} first`
            : isUnlocked
                ? `Travel required to reach ${zone.name}`
                : `Defeat the gatekeeper to unlock ${zone.name}`;
    }

    const dc = { easy: '#2ecc71', medium: '#f39c12', hard: '#e74c3c', normal: '#3498db', nightmare: '#9b59b6' };
    const db2 = { easy: 'rgba(39,174,96,0.2)', medium: 'rgba(243,156,18,0.2)', hard: 'rgba(192,57,43,0.2)', normal: 'rgba(52,152,219,0.2)', nightmare: 'rgba(155,89,182,0.2)' };

    header.innerHTML = `
        <div class="mz-hero" style="background-image:url('${zone.bgImg || zone.mapImg}')">
            <div class="mz-hero-overlay">
                <div class="mz-hero-title">${zone.name}</div>
                <div class="mz-hero-desc">${zone.description}</div>
                <div class="mz-hero-actions">
                    ${isCurrent
        ? `<span class="mz-here-badge">📍 You are here</span>`
        : `<button class="mz-travel-btn" ${actionAttrs('travelToZone', zoneId)} ${actionBlocked || !canChallengeThisGatekeeper ? 'disabled' : ''}>
                            ${isUnlocked ? '🚶 Travel here' : '⚔️ Challenge for entry'}${travelInfo ? ' · ' + travelInfo : ''}
                          </button>`
    }
                </div>
            </div>
        </div>`;

    spotsEl.innerHTML = `
        <div class="mz-section-label">Choose a location</div>
        <div class="mz-spots-grid">
            ${zone.spots.map(spot => {
        let locked = !isCurrent || actionBlocked;
        let lockMsg = actionBlocked
            ? (hasActiveMission ? '🔒 Mission already in progress' : '🔒 Travel already in progress')
            : '🔒 Travel here first';

        // Tutorial Lock: Wins < 4 only allows Easy
        const isTutorial = isTutorialCharacter(character);

        if (!actionBlocked && isTutorial && (spot.difficulty === 'medium' || spot.difficulty === 'hard')) {
            locked = true;
            lockMsg = '🔒 Tutorial: Win 4 battles to unlock';
        }

        return `<div class="mz-spot-card ${locked ? 'mz-spot-locked' : ''}" ${locked ? '' : actionAttrs('openSpotMissions', zoneId, spot.id)}>
                    <div class="mz-spot-img-wrap">
                        <img class="mz-spot-img" src="${spot.img}" alt="${spot.name}" data-error-src="">
                        <span class="mz-spot-diff-badge" style="background:${db2[spot.difficulty]};color:${dc[spot.difficulty]}">${spot.difficulty.toUpperCase()}</span>
                        ${locked ? `<div class="mz-spot-locked-overlay">${lockMsg}</div>` : ''}
                    </div>
                    <div class="mz-spot-info">
                        <div class="mz-spot-name">${spot.name}</div>
                        <div style="height:20px;line-height:20px">&nbsp;</div>
                    </div>
                </div>`;
    }).join('')}
        </div>`;

    activeEl.innerHTML = '';
    modal.classList.remove('hidden');
}

function openSpotMissions(zoneId, spotId) {
    const currentMap = character?.current_map || 'overworld';
    let zone;

    if (currentMap === 'abyss' && abyssData) {
        zone = abyssData.zones[zoneId];
    } else {
        zone = ZONES[zoneId];
    }

    if (!zone) return;

    const spot = zone.spots.find(s => s.id === spotId);
    if (!spot) return;

    const activeEl = document.getElementById('mission-location-active');
    const dc = { easy: '#2ecc71', medium: '#f39c12', hard: '#e74c3c', normal: '#3498db', nightmare: '#9b59b6' };
    const mp = character?.mission_points ?? 0;
    const actionBlocked = !!window.activeMission || !!playerTravelTarget;

    // Tutorial state
    const isTutorial = isTutorialCharacter(character);

    const sizes = [
        { key: 'small', label: 'Small', mpCost: 20, duration: isTutorial ? '10s' : '10 min', mult: '1×', desc: 'Quick mission, standard rewards' },
        { key: 'medium', label: 'Medium', mpCost: 40, duration: '20 min', mult: '1.8×', desc: 'Longer mission, better rewards' },
        { key: 'large', label: 'Large', mpCost: 60, duration: '30 min', mult: '2.5×', desc: 'Epic mission, best rewards' },
    ];

    activeEl.innerHTML = `
        <div class="mz-section-label" style="margin-top:24px">${spot.name} — pick mission size</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
            ${sizes.map(sz => {
        let locked = isTutorial && sz.key !== 'small';
        const canAfford = mp >= sz.mpCost && !locked;
        const isDisabled = actionBlocked || !canAfford;

        const border = (!isDisabled && canAfford) ? `1px solid ${dc[spot.difficulty]}44` : '1px solid rgba(255,255,255,0.08)';
        const bg = (!isDisabled && canAfford) ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
        const opacity = actionBlocked ? '0.38' : ((canAfford || (locked && mp >= sz.mpCost)) ? '1' : '0.45');

        let lockOverlay = '';
        if (locked) {
            lockOverlay = `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;text-align:center;padding:5px;font-weight:700">🔒 Tutorial: Win 4 battles</div>`;
        } else if (actionBlocked) {
            lockOverlay = `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.62);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:0.68rem;color:rgba(255,255,255,0.82);text-align:center;padding:8px 10px;font-weight:700">${window.activeMission ? 'Mission in progress' : 'Travel in progress'}</div>`;
        }

        return `<div ${(!isDisabled && !locked) ? actionAttrs('pickMissionSize', zoneId, spotId, sz.key) : ''} data-mission-size="${sz.key}"
                    style="position:relative;border:${border};border-radius:10px;padding:14px 10px;text-align:center;cursor:${(!isDisabled && canAfford) ? 'pointer' : 'not-allowed'};background:${bg};opacity:${opacity};transition:all 0.2s">
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-bright);margin-bottom:4px">${sz.label}</div>
                    <div style="font-size:0.8rem;color:#9b59b6;font-weight:600;margin-bottom:6px">🔮 ${sz.mpCost} MP</div>
                    <div style="font-size:0.75rem;color:var(--text-dim)">⏱ ${sz.duration}</div>
                    ${(!canAfford && !locked && !actionBlocked) ? `<div style="font-size:0.7rem;color:var(--red-light);margin-top:6px">Need ${sz.mpCost - mp} more MP</div>` : ''}
                    ${lockOverlay}
                </div>`;
    }).join('')}
        </div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:16px;text-align:center">Your MP: <strong style="color:#9b59b6">${mp} / ${character?.mp_max || 120}</strong> · MP regenerates +5/hr</div>
        <div class="mz-section-label">Choose a mission</div>
        <div class="mz-missions-grid" id="spot-missions-list">
            ${spot.missions.map((m, idx) => `
                <div class="mz-mission-card" id="mission-opt-${idx}" style="opacity:0.4;pointer-events:none">
                    <div class="mz-mission-img-wrap">
                        <img class="mz-mission-img" src="${m.img}" alt="${m.name}" data-error-background="#1c2b38">
                        <div class="mz-mission-img-overlay"><div class="mz-mission-start-btn">▶ Start</div></div>
                    </div>
                    <div class="mz-mission-info">
                        <div class="mz-mission-name">${m.name}</div>
                        <div style="height:20px;line-height:20px">&nbsp;</div>
                    </div>
                </div>
            `).join('')}
        </div>`;

    activeEl.dataset.zoneId = zoneId;
    activeEl.dataset.spotId = spotId;
    activeEl.dataset.selectedSize = '';

    queueMobileMissionModalScroll(activeEl);
}

function queueMobileMissionModalScroll(target) {
    if (window.innerWidth > 768) return;
    const resolveTarget = () => {
        if (!target) return null;
        if (typeof target === 'string') return document.querySelector(target);
        return target;
    };
    requestAnimationFrame(() => {
        const el = resolveTarget();
        if (!el) return;
        const scrollHost = el.closest('.modal-box') || el.parentElement;
        if (scrollHost && scrollHost.scrollHeight > scrollHost.clientHeight) {
            const hostRect = scrollHost.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const nextTop = scrollHost.scrollTop + (elRect.top - hostRect.top) - 18;
            scrollHost.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
        } else {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

function pickMissionSize(zoneId, spotId, sizeKey) {
    if (window.activeMission || playerTravelTarget) return;
    api('POST', '/game/missions/ui-tick', {}).catch(() => {});

    const currentMap = character?.current_map || 'overworld';
    let zone;

    if (currentMap === 'abyss' && abyssData) {
        zone = abyssData.zones[zoneId];
    } else {
        zone = ZONES[zoneId];
    }

    if (!zone) return;

    const spot = zone.spots.find(s => s.id === spotId);
    if (!spot) return;

    const activeEl = document.getElementById('mission-location-active');
    activeEl.dataset.selectedSize = sizeKey;

    const dc = { easy: '#2ecc71', medium: '#f39c12', hard: '#e74c3c', normal: '#3498db', nightmare: '#9b59b6' };
    const mults = { small: 1.0, medium: 1.8, large: 2.5 };
    const mult = mults[sizeKey] || 1;

    spot.missions.forEach((m, idx) => {
        const card = document.getElementById(`mission-opt-${idx}`);
        if (card) {
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
            card.replaceWith(card.cloneNode(true));
            const freshCard = document.getElementById(`mission-opt-${idx}`);
            if (freshCard) {
                freshCard.style.opacity = '1';
                freshCard.style.pointerEvents = 'auto';
                freshCard.addEventListener('click', () => doStartMission(zoneId, spotId, idx, sizeKey));
                const reward = freshCard.querySelector('.mz-mission-reward');
                if (reward) {
                    reward.style.height = '20px';
                    reward.style.lineHeight = '20px';
                    reward.innerHTML = '&nbsp;';
                }
            }
        }
    });

    // Highlight selected size
    document.querySelectorAll('#mission-location-active [data-mission-size]').forEach(el => {
        const isSelected = el.getAttribute('data-mission-size') === sizeKey;
        el.style.background = isSelected ? 'rgba(155,89,182,0.2)' : 'rgba(255,255,255,0.05)';
        el.style.borderColor = isSelected ? 'rgba(155,89,182,0.5)' : '';
    });

    queueMobileMissionModalScroll('#spot-missions-list');
}

let _missionStarting = false;
async function doStartMission(zoneId, spotId, missionIdx, size = 'small') {
    if (_missionStarting) return;
    _missionStarting = true;

    const currentMap = character?.current_map || 'overworld';
    let zone;

    if (currentMap === 'abyss' && abyssData) {
        zone = abyssData.zones[zoneId];
    } else {
        zone = ZONES[zoneId];
    }

    const spot = zone?.spots.find(s => s.id === spotId);
    if (!spot) { _missionStarting = false; return; }
    if (character?.location !== zoneId) { showMsg('missions-msg', 'Travel to this zone first!', true); closeMissionModal2(); _missionStarting = false; return; }
    if ((character?.hp_current ?? character?.hp_max) <= 0) { showMsg('missions-msg', 'Out of HP! Wait for regeneration.', true); closeMissionModal2(); _missionStarting = false; return; }

    closeMissionModal2();
    const chosenMission = spot.missions[missionIdx] || spot.missions[0];
    const missionName = chosenMission.name;

    try {
        const result = await api('POST', '/game/missions/start', { zoneId, spotId, missionIdx, missionName, size });

        window.activeMission = true;  // <-- ADD THIS LINE

        // Dungeon token generation
        const mpCosts = { small: 20, medium: 40, large: 60 };
        if (typeof dungeonAddTokens === 'function') dungeonAddTokens(mpCosts[size] || 20);

        character = await api('GET', '/game/character');
        renderTopBar();
        const confirmedName = result?.mission?.missionName || result?.mission?.mission_name || missionName;
        const endsAt = result?.mission?.ends_at || (Math.floor(Date.now() / 1000) + (result?.mission?.duration || 600));
        showMissionOverlay({ id: result?.mission?.id || 1, zone: zoneId, ends_at: endsAt }, confirmedName);
        renderWorldMap(); // or renderCurrentMap?
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
        closeMissionModal2(); showTravelOverlay(); renderCurrentMap();
    } catch(e) { showMsg('missions-msg',e.message,true); }
}

async function travelToZone(zoneId) {
    try {
        const currentMap = character?.current_map || 'overworld';
        const prereq = getTravelGatekeeperPrereq(zoneId, currentMap);
        const currentZone = character?.location || 'forest';
        const zoneAlreadyUnlocked = currentMap === 'abyss'
            ? unlockedAbyssZones.has(zoneId)
            : unlockedTravelZones.has(zoneId);
        if (prereq && !unlockedTravelZones.has(prereq.unlockZone) && currentZone !== prereq.unlockZone) {
            showMsg('missions-msg', `Please challenge "${prereq.guardianName}" first.`, true);
            return;
        }
        // Check if target zone has a gatekeeper and show warning
        const guardianZones = {
            overworld: { swamp: 'Bog Warden', mountains: 'Frost Sentinel', ruins: 'Crypt Keeper', dark_city: 'Shadow Gatekeeper' },
            abyss: { crimson: 'Crimson Gatekeeper', void: 'Void Gatekeeper', citadel: 'Citadel Watcher', eternal_dark: 'Eternal Warden' }
        };
        const guardian = guardianZones[currentMap]?.[zoneId];

        if (guardian && !zoneAlreadyUnlocked) {
            const hpCurrent = character?.hp_current || 0;
            const hpMax = character?.hp_max || 1;
            const hpPercent = Math.round((hpCurrent / hpMax) * 100);
            const proceed = await openGameDialog({
                title: '⚠️ Gatekeeper Warning',
                message: `<p><strong>${guardian}</strong> guards this location!</p>
                          <p>This gatekeeper will challenge you to combat. If you are defeated, your health will be depleted.</p>
                          <p><strong>Current HP:</strong> ${hpCurrent}/${hpMax} (${hpPercent}%)</p>
                          <p>Are you sure you want to proceed?</p>`,
                confirmLabel: 'Challenge',
                cancelLabel: 'Cancel',
                showCancel: true,
                danger: true
            });
            if (!proceed) return;
        }

        // Close the modal first
        closeMissionModal2();

        const result = await api('POST', '/game/travel/start', { targetZone: zoneId });
        if (result.success) {
            // Start travel timer
            playerTravelTarget = zoneId;
            playerTravelEndTime = result.travelEnd;
            playerTravelStartTime = result.travelStart;
            showTravelOverlay();
            renderCurrentMap(); // or renderAbyssMap/WorldMap
            showMsg('missions-msg', `Traveling to ${zoneId}...`);
        }
    } catch (e) {
        showMsg('missions-msg', e.message, true);
    }
}

async function collectMission() {
    try {
        const d = await api('POST', '/game/missions/collect');
        character = d.character;
        window.activeMission = false;
        hideMissionOverlay();
        renderTopBar();
        let msg=`💰 +${d.goldEarned} gold`;
        if (d.gemsFound) msg += ` · 💎 +${d.gemsFound} gem${d.gemsFound > 1 ? 's' : ''}`;
        msg += ` · ⭐ +${d.xpEarned} XP`;
        if (d.won===false) msg=`💀 Defeated · ${msg}`;
        if (d.leveledUp) msg+=` · 🎉 LEVEL UP! Now Lv.${d.newLevel}`;
        if (d.drops?.length) msg+=` · 📦 ${d.drops.map(dr=>`${dr.qty}× ${dr.mat.replace(/_/g,' ')}`).join(', ')}`;

        // Show level up modal if applicable
        if (d.levelUpMessage) {
            await openGameDialog({
                title: '🎉 Level Up!',
                message: d.levelUpMessage,
                confirmLabel: 'Awesome!',
                showCancel: false
            });
        }

        if (d.battleLog) showBattleReportModal(d.battleLog, d.won, msg, d.totalDmgDealt, d.totalDmgTaken, {
            enemyName: d.npcName || 'Enemy',
            enemyLevel: d.npcLevel ?? null,
            missionName: d.missionName || '',
            battleType: 'mission',
            tutorialMessage: d.tutorialMessage,
            battleStats: d.battleStats || null
        });
        else showMissionModal(msg);
        renderCurrentMap(); renderCharacter();
    } catch(e) { alert(e.message); }
}

// ── Mission Overlay ───────────────────────────────────────────────────────

async function checkAndShowMissionOverlay() {
    try {
        const activeMission = await api('GET', '/game/missions/active').catch(() => null);
        if (activeMission && activeMission.id) {
            window.activeMission = true;
            hideRestOverlay();
            hideTrainingOverlay();
            hideTravelOverlay();
            showMissionOverlay(activeMission, activeMission.mission_name || activeMission.missionName || 'Mission');
            return;
        }
        window.activeMission = false;

        const trainingStatus = await api('GET', '/skills/training/status').catch(() => null);
        if (trainingStatus && trainingStatus.active) {
            hideRestOverlay();
            hideMissionOverlay();
            hideTravelOverlay();
            showTrainingOverlay(
                trainingStatus.skillName || 'Skill Training',
                trainingStatus.endsAt,
                trainingStatus
            );
            return;
        }
        hideTrainingOverlay();

        hideMissionOverlay();
        if (playerTravelTarget) {
            hideRestOverlay();
            showTravelOverlay();
            return;
        }
        hideTravelOverlay();

        const freshChar = await api('GET', '/game/character').catch(() => null);
        if (freshChar) character = freshChar;

        const endsAt = character?.battle_cooldown_ends_at || 0;
        const lastBattle = character?.last_battle_at || 0;
        const now = Math.floor(Date.now() / 1000);

        if (endsAt > now && lastBattle > 0) {
            showRestOverlay(lastBattle, endsAt);
            return;
        }

        hideRestOverlay();
        if (playerTravelTarget) {
            showTravelOverlay();
            return;
        }
        hideTravelOverlay();
    } catch (e) {
        console.error('Error in checkAndShowMissionOverlay:', e);
        hideMissionOverlay();
        hideRestOverlay();
        hideTrainingOverlay();
        hideTravelOverlay();
    }
}

function showTrainingOverlay(skillName, endsAt, status = null) {
    const overlay = document.getElementById('training-overlay');
    if (!overlay) return;

    const skillEl = document.getElementById('training-skill-name');
    const progressTextEl = document.getElementById('training-progress-text');
    const fillEl = document.getElementById('training-overlay-fill');
    if (skillEl) skillEl.textContent = skillName;

    if (status) {
        const percent = Math.floor((status.progressPercent ?? status.progressCurrent ?? status.progress_current ?? 0));
        if (progressTextEl) progressTextEl.textContent = formatTrainingProgressText(status);
        if (fillEl) fillEl.style.width = `${percent}%`;
    }

    overlay.classList.remove('hidden');
    window.currentTrainingEnd = endsAt;

    if (trainingOverlayInterval) clearInterval(trainingOverlayInterval);
    trainingOverlayInterval = setInterval(checkTrainingStatus, 1000);
    checkTrainingStatus();
}

function hideTrainingOverlay() {
    const overlay = document.getElementById('training-overlay');
    if (overlay) overlay.classList.add('hidden');
    window.currentTrainingEnd = null;
    if (trainingOverlayInterval) {
        clearInterval(trainingOverlayInterval);
        trainingOverlayInterval = null;
    }
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
    const ok = await openGameDialog({ title: 'Skip Cooldown', message: 'Skip battle cooldown for 1 💎?', showCancel: true, confirmLabel: 'Skip' });
    if (!ok) return;
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
let overlayMissionCollectBusy = false;
function showMissionOverlay(active, displayName) {
    const overlay=document.getElementById('mission-overlay'); if(!overlay) return;
    if (overlayInterval) { clearInterval(overlayInterval); overlayInterval=null; }
    overlayMissionCollectBusy = false;
    const nameEl=document.getElementById('overlay-mission-name');
    const zoneEl=document.getElementById('overlay-mission-zone');
    const timerEl=document.getElementById('overlay-mission-timer');
    const subtextEl=document.getElementById('overlay-mission-subtext');
    const fillEl=document.getElementById('overlay-progress-fill');
    const collectBtn=document.getElementById('overlay-collect-btn');
    if (collectBtn) collectBtn.textContent = 'Collect Rewards';
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
        if (collectBtn) collectBtn.disabled=!done || overlayMissionCollectBusy;
        if (done&&overlayInterval) { clearInterval(overlayInterval); overlayInterval=null; }
    }
    tick();
    if (active.ends_at>Math.floor(Date.now()/1000)) overlayInterval=setInterval(tick,1000);
    overlay.classList.remove('hidden');
}
function hideMissionOverlay() {
    if (overlayInterval) { clearInterval(overlayInterval); overlayInterval = null; }
    overlayMissionCollectBusy = false;
    const o = document.getElementById('mission-overlay');
    if(o) o.classList.add('hidden');
    window.activeMission = false;
}
async function overlayCollectMission() {
    if (overlayMissionCollectBusy) return;
    overlayMissionCollectBusy = true;
    const collectBtn = document.getElementById('overlay-collect-btn');
    const previousText = collectBtn ? collectBtn.textContent : '';
    if (collectBtn) {
        collectBtn.disabled = true;
        collectBtn.textContent = 'Collecting...';
    }
    await collectMission();
    const overlayHidden = document.getElementById('mission-overlay')?.classList.contains('hidden');
    if (!overlayHidden) {
        overlayMissionCollectBusy = false;
        if (collectBtn) {
            collectBtn.disabled = false;
            collectBtn.textContent = previousText || 'Collect Rewards';
        }
    }
}

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
        if (left<=0) { clearInterval(travelOverlayInterval); travelOverlayInterval=null; hideTravelOverlay(); checkTravelStatus().then(()=>renderCurrentMap()); }
    }
    tick();
    travelOverlayInterval=setInterval(tick,1000);
    overlay.classList.remove('hidden');
}
function hideTravelOverlay() {
    const overlay = document.getElementById('travel-overlay');   // change ID if yours is different
    if (overlay) overlay.classList.add('hidden');
}
async function cancelTravel() {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - playerTravelStartTime;
    const isFreeCancel = playerTravelStartTime === 0 || elapsed < FREE_CANCEL_WINDOW;
    const gems = character?.gems || 0;

    if (!isFreeCancel && gems < 1) {
        showMsg('missions-msg', 'Not enough gems to cancel!', true);
        return;
    }

    if (!confirm(isFreeCancel ? 'Cancel travel for free?' : 'Cancel travel for 1 💎?')) return;

    try {
        await api('POST', '/game/travel/cancel', { paid: !isFreeCancel });

        // Clear travel targets - DO NOT change location
        playerTravelTarget = null;
        playerTravelEndTime = 0;
        playerTravelStartTime = 0;

        // Refresh character to get updated gems
        character = await api('GET', '/game/character');

        // Hide travel overlay
        hideTravelOverlay();

        // Re-render the current map (stay in same zone)
        renderCurrentMap();

        showMsg('missions-msg', isFreeCancel ? 'Travel cancelled.' : 'Travel cancelled (1 💎 spent).');
    } catch (e) {
        showMsg('missions-msg', e.message, true);
    }
}
function updateTravelStatusBar() { if(playerTravelTarget) showTravelOverlay(); else hideTravelOverlay(); }
const ABYSS_ZONES = {
    shadowfen: { name: 'Shadowfen Depths', emoji: '🌑', minLevel: 39 },
    crimson:   { name: 'Crimson Wasteland', emoji: '🌋', minLevel: 45 },
    void:      { name: 'Abyssal Void', emoji: '🕳️', minLevel: 55 },
    citadel:   { name: 'The Dark Citadel', emoji: '🏰', minLevel: 70 },
    eternal_dark: { name: 'Eternal Darkness', emoji: '🌌', minLevel: 85 }
};

async function checkTravelStatus() {
    try {
        const status=await api('GET','/game/travel/status');
        if (status.character) {
            character = status.character;
            renderTopBar();
            if (document.getElementById('tab-character')?.classList.contains('active')) renderCharacter();
        } else if (character) {
            character.location=status.location;
            character.current_map = status.currentMap || character.current_map;
        } else {
            character={location:status.location,current_map:status.currentMap||'overworld'};
        }
        playerLocation=status.location;
        playerTravelTarget=status.travelTarget||null;
        playerTravelEndTime=status.travelEndTime||0;
        playerTravelStartTime=status.travelStartTime||0;
        unlockedTravelZones = new Set(status.unlockedZones || ['forest']);
        unlockedAbyssZones = new Set(status.unlockedAbyssZones || []);

        if (playerTravelTarget) showTravelOverlay(); else hideTravelOverlay();

        if (status.encounterResult) {
            const result = status.encounterResult;
            const currentMap = status.currentMap || character?.current_map || 'overworld';
            const zoneMap = currentMap === 'abyss' ? ABYSS_ZONES : ZONES;
            const zoneDef = zoneMap[result.targetZone];
            const zoneLabel = zoneDef ? zoneDef.name : (result.targetZone || 'the zone');

            const summary = result.won
                ? `Unlocked ${zoneLabel} · ⚔️ ${result.guardianName} defeated`
                : `${result.guardianName} drove you back from ${zoneLabel}`;

            showBattleReportModal(result.log || [], result.won, summary, result.totalDmgDealt, result.totalDmgTaken);
            showMsg('missions-msg', result.won ? `${zoneLabel} unlocked.` : `You were forced back to ${status.location}.`, !result.won);

            // Re-render map to show progress
            renderCurrentMap();
        }
        return status;
    } catch(e) {
        console.error('Failed to check travel status:', e);
        return null;
    }
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

let gameDialogResolver = null;

function ensureGameDialogModal() {
    if (document.getElementById('game-dialog-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div id="game-dialog-modal" class="modal-overlay hidden">
            <div class="modal-box game-dialog-box">
                <div class="modal-header">
                    <h3 id="game-dialog-title">Notice</h3>
                    <button class="btn-secondary" ${actionAttrs('closeGameDialog')}>✕</button>
                </div>
                <div id="game-dialog-message" class="game-dialog-message"></div>
                <div class="game-dialog-actions">
                    <button id="game-dialog-cancel" class="btn-secondary" ${actionAttrs('resolveGameDialog', false)}>Cancel</button>
                    <button id="game-dialog-confirm" class="btn-primary" ${actionAttrs('resolveGameDialog', true)}>Continue</button>
                </div>
            </div>
        </div>`);
}

function openGameDialog({ title = 'Notice', message = '', confirmLabel = 'Continue', cancelLabel = 'Cancel', showCancel = false, danger = false } = {}) {
    ensureGameDialogModal();
    const modal = document.getElementById('game-dialog-modal');
    const titleEl = document.getElementById('game-dialog-title');
    const msgEl = document.getElementById('game-dialog-message');
    const cancelBtn = document.getElementById('game-dialog-cancel');
    const confirmBtn = document.getElementById('game-dialog-confirm');
    if (!modal || !titleEl || !msgEl || !confirmBtn || !cancelBtn) return Promise.resolve(false);

    titleEl.textContent = title;
    msgEl.innerHTML = message;
    cancelBtn.textContent = cancelLabel;
    cancelBtn.classList.toggle('hidden', !showCancel);
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle('btn-danger', !!danger);
    confirmBtn.classList.toggle('btn-primary', !danger);
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
        gameDialogResolver = resolve;
    });
}

function resolveGameDialog(confirmed) {
    const modal = document.getElementById('game-dialog-modal');
    if (modal) modal.classList.add('hidden');
    const resolver = gameDialogResolver;
    gameDialogResolver = null;
    if (resolver) resolver(!!confirmed);
}

function closeGameDialog() {
    resolveGameDialog(false);
}

function openGameConfirmDialog(options = {}) {
    return openGameDialog({ ...options, showCancel: true });
}

function openGameNoticeDialog(options = {}) {
    return openGameDialog({ ...options, showCancel: false });
}

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
            return `<div class="forge-card" style="display:flex;flex-direction:column;min-height:220px">
                <div class="forge-card-header"><span style="font-size:1.3rem">${c.emoji||'⚙️'}</span><span class="forge-card-name">${c.name}</span></div>
                <div style="font-size:0.75rem;color:var(--text-dim);margin:4px 0 6px">${c.desc||''}</div>
                <div class="forge-recipe">Requires: ${recipeStr}</div>
                <div class="forge-cost">+ ${c.goldCost.toLocaleString()} gold</div>
                <button class="btn-forge" style="margin-top:auto" ${actionAttrs('refine', c.id)} ${c.canCraft?'':'disabled'}>${c.canCraft?'Refine':'Cannot Refine'}</button>
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

    const rarityColor = { epic:'#e67e22', legendary:'#f1c40f', rare:'#9b59b6', common:'#aaa' };
    const slotIcon = { weapon:'⚔️', armor:'🛡️', helmet:'⛑️', shield:'🔰', boots:'👢' };

    const weap = forgeData.weapon;
    const weaponHtml = weap ? `
        <button class="forge-card" style="margin-bottom:20px;border-color:#f1c40f44;display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;width:100%;text-align:left;font:inherit;color:inherit;background:none;border-width:1px;border-style:solid;border-radius:12px" ${actionAttrs('openWeaponUpgrade')}>
            <span style="font-size:1.5rem;flex-shrink:0">${itemIcon(weap,'2.2rem')}</span>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px">
                    <span class="forge-card-name">${escHtml(weap.name)}</span>
                    <span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;background:#f1c40f22;color:#f1c40f;border:1px solid #f1c40f44;font-weight:700">Lv.${weap.wp_level}/5</span>
                    ${weap.maxed?'<span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;background:#2ecc7122;color:#2ecc71;border:1px solid #2ecc7144">MAXED</span>':''}
                </div>
                <div style="display:flex;gap:12px;margin-top:4px;font-size:0.7rem;color:var(--text-dim)">
                    <span>XP ${weap.wp_xp}/${weap.wp_xp_target}</span>
                    <span>Feed ${weap.wp_feed}/${weap.wp_feed_target}</span>
                    ${weap.wp_stat_points>0?`<span style="color:var(--gold)">✨ ${weap.wp_stat_points}pts</span>`:''}
                </div>
            </div>
            <span style="font-size:0.75rem;color:var(--gold);flex-shrink:0">${weap.maxed?'MAXED':'Upgrade →'}</span>
        </button>` : '';

    el.innerHTML = weaponHtml + Object.entries(bySet).map(([setId, pieces]) => {
        const setDef = sets[setId] || { name: setId, emoji:'⚒️', bonus3:{desc:''}, bonus5:{desc:''} };
        const equippedCount = pieces.filter(p => p.equipped).length;
        const equippedPct = Math.round(equippedCount / pieces.length * 100);

        const progressBar = `
            <div style="margin:8px 0 4px;display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${equippedPct}%;background:${rarityColor[pieces[0].quality]||'#9b59b6'};border-radius:3px;transition:width 0.3s"></div>
                </div>
                <span style="font-size:0.7rem;color:var(--text-dim)">${equippedCount}/${pieces.length}</span>
            </div>`;

        const bonusHtml = `
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px">
                <div style="padding:5px 10px;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid rgba(255,255,255,0.08);font-size:0.7rem;color:${equippedCount>=2?'var(--green)':'var(--text-dim)'}">
                    ✦ 2/5: ${setDef.bonus3?.desc||'Set bonus'}
                </div>
                <div style="padding:5px 10px;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid rgba(255,255,255,0.08);font-size:0.7rem;color:${equippedCount>=5?'var(--gold)':'var(--text-dim)'}">
                    ✦ 5/5: ${setDef.bonus5?.desc||'Full set bonus'}
                </div>
            </div>`;

        const pieceCards = pieces.map(r => {
            const locked = !r.zoneUnlocked;
            const qColor = rarityColor[r.quality] || '#aaa';
            const forgeItemData = escHtml(JSON.stringify(r));
            const compStr = Object.entries(r.components).map(([comp,qty]) => {
                const have = (forgeData.mats[comp]?.qty||0);
                return `<span style="color:${have>=qty?'var(--green)':'var(--red-light)'}">${qty}× ${comp.replace(/_/g,' ')} (have ${have})</span>`;
            }).join(', ');

            return `<div class="forge-card ${locked?'locked':''}" style="border-color:${r.equipped?qColor+'66':'rgba(255,255,255,0.08)'};display:flex;flex-direction:column;min-height:260px">
                ${r.equipped ? `<div style="position:absolute;top:8px;right:8px;background:${qColor}22;border:1px solid ${qColor}55;border-radius:10px;padding:2px 8px;font-size:0.62rem;color:${qColor}">✓ EQUIPPED</div>` : ''}
                <div class="forge-card-header" data-hover-action="hoverForgeItemTooltip" data-leave-action="scheduleHideTooltip" data-forgeitem="${forgeItemData}" style="cursor:help">
                    <span style="font-size:1.3rem;display:flex;align-items:center;justify-content:center;min-width:34px">${itemIcon(r,'1.8rem')}</span>
                    <div>
                        <div style="display:flex;align-items:center;gap:6px">
                            <span class="forge-card-name">${r.name}</span>
                            <span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;background:${qColor}22;color:${qColor};border:1px solid ${qColor}44;text-transform:uppercase;font-weight:700">${r.quality}</span>
                        </div>
                        <div style="font-size:0.7rem;color:var(--text-dim)">${slotIcon[r.slot]||''} ${capitalize(r.slot)} · Lv.${r.level}</div>
                    </div>
                </div>
                <div style="font-size:0.72rem;color:var(--text-dim);margin:6px 0 2px">Hover the item header to preview scaled stats</div>
                ${locked
                ? `<div style="font-size:0.75rem;color:var(--red-light);margin:4px 0">🔒 Complete a mission in ${(r.requiredZone||'').replace('_',' ')} first</div>`
                : `<div class="forge-recipe" style="margin:4px 0">Components: ${compStr}</div>`}
                ${r.craftClass ? `<div style="font-size:0.7rem;color:var(--text-dim);margin:2px 0">📋 Classes: ${r.craftClass}</div>` : ''}
                <div class="forge-cost">+ ${r.goldCost.toLocaleString()} gold</div>
                <button class="btn-forge" style="margin-top:auto" ${actionAttrs('craftItem', r.id)} ${r.canCraft?'':'disabled'}>
                    ${locked?'🔒 Locked':r.canCraft?`⚒️ Craft ${r.name}`:'Missing materials'}
                </button>
            </div>`;
        }).join('');

        return `<div style="margin-bottom:32px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <span style="font-size:1.4rem">${setDef.emoji}</span>
                <div>
                    <div style="font-family:'Cinzel',serif;font-size:1rem;font-weight:700;color:var(--text-bright)">${setDef.name}</div>
                    <div style="font-size:0.72rem;color:var(--text-dim)">Equip pieces to activate 2/5 and 5/5 set bonuses</div>
                </div>
            </div>
            ${progressBar}
            ${bonusHtml}
            <div class="forge-grid">${pieceCards}</div>
        </div>`;
    }).join('');

    const upgradeBtn = document.getElementById('weapon-upgrade-card');
    if (upgradeBtn && !upgradeBtn.dataset._bound) {
        upgradeBtn.dataset._bound = '1';
        upgradeBtn.addEventListener('click', openWeaponUpgrade);
    }
}

function openWeaponUpgrade() {
    const weap = forgeData?.weapon;
    if (!weap) return;
    const dialog = document.getElementById('weapon-upgrade-dialog');
    if (!dialog) return;
    buildWeaponDialog(dialog, weap);
    dialog.showModal();
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
}

function buildWeaponDialog(dialog, weap) {
    window._pendingWeaponStats = {};
    const validStatLabels = { dmg_min:'Min Dmg', dmg_max:'Max Dmg', strength:'STR', agility:'AGI', magic:'MAG', defense:'DEF', vitality:'VIT', hit_chance:'Hit', crit_chance:'Crit', armor:'Armor', hp_max:'HP', pyro_dmg:'Pyro Dmg', water_dmg:'Water Dmg', wind_dmg:'Wind Dmg', electro_dmg:'Electro Dmg', pyro_resist:'Pyro Res', water_resist:'Water Res', wind_resist:'Wind Res', electro_resist:'Electro Res' };

    dialog.innerHTML = `
        <div style="padding:20px;display:flex;flex-direction:column;gap:12px;max-height:80vh;overflow-y:auto">
            <div style="display:flex;align-items:center;gap:10px;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:10px">
                    <span style="font-size:1.5rem">${itemIcon(weap,'2.2rem')}</span>
                    <div>
                        <div style="font-size:1rem;font-weight:700">${escHtml(weap.name)}</div>
                        <div style="font-size:0.7rem;color:var(--text-dim)">Weapon Leveling · earn XP from missions/PvP, feed materials to progress</div>
                    </div>
                </div>
                <button class="btn-secondary" style="font-size:0.85rem;padding:4px 10px" data-action="closeWeaponDialog">✕</button>
            </div>
            ${weap.maxed ? `<div style="text-align:center;padding:12px;background:#2ecc7122;border:1px solid #2ecc7144;border-radius:10px;font-weight:700;color:#2ecc71">⬆️ WEAPON MAXED</div>`
        : `
            <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px">
                <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:4px">
                    <span>Level <strong>${weap.wp_level}/5</strong></span>
                    <span>⬆️ Next at ${weap.wp_xp_target} XP + ${weap.wp_feed_target} Feed</span>
                </div>
                <div style="margin:8px 0">
                    <div style="display:flex;justify-content:space-between;font-size:0.7rem;margin-bottom:3px">
                        <span>⚡ XP</span><span>${weap.wp_xp}/${weap.wp_xp_target}</span>
                    </div>
                    <div style="height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
                        <div style="height:100%;width:${Math.min(100,(weap.wp_xp/weap.wp_xp_target)*100)}%;background:linear-gradient(90deg,#3498db,#9b59b6);border-radius:4px;transition:width 0.3s"></div>
                    </div>
                </div>
                <div style="margin:8px 0">
                    <div style="display:flex;justify-content:space-between;font-size:0.7rem;margin-bottom:3px">
                        <span>📦 Feed</span><span>${weap.wp_feed}/${weap.wp_feed_target}</span>
                    </div>
                    <div style="height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
                        <div style="height:100%;width:${Math.min(100,(weap.wp_feed/weap.wp_feed_target)*100)}%;background:linear-gradient(90deg,#e67e22,#e74c3c);border-radius:4px;transition:width 0.3s"></div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:12px">
                    <button class="btn-forge" style="flex:1" data-action="openWeaponFeedDialog">📦 Feed Materials</button>
                    ${(weap.wp_xp>=weap.wp_xp_target&&weap.wp_feed>=weap.wp_feed_target)
            ? `<button class="btn-forge" style="flex:1;background:linear-gradient(135deg,#2ecc71,#27ae60)" data-action="weaponLevelUp">⬆️ Level Up!</button>`
            : ''}
                </div>
            </div>`}

            ${weap.wp_stat_points>0 ? `
            <div style="background:rgba(241,196,15,0.06);border:1px solid rgba(241,196,15,0.2);border-radius:10px;padding:12px">
                <div id="weapon-stats-header" style="font-size:0.8rem;font-weight:700;color:var(--gold);margin-bottom:8px">✨ ${weap.wp_stat_points} Stat Points Available</div>
                <div id="weapon-dialog-stats" style="display:flex;flex-direction:column;gap:4px"></div>
                <button class="btn-forge" id="btn-dialog-apply-stats" style="margin-top:10px;display:none;width:100%" data-action="applyWeaponStats">Apply Stats</button>
            </div>` : ''}
        </div>`;

    if (weap.wp_stat_points > 0) renderDialogStatGrid(weap);
    dialog.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', async () => {
            const action = el.dataset.action;
            if (action === 'closeWeaponDialog') { dialog.close(); return; }
            if (action === 'openWeaponFeedDialog') { openWeaponFeedDialog(dialog, weap); return; }
            if (action === 'weaponLevelUp') { await doWeaponLevelUp(dialog, weap); return; }
            if (action === 'applyWeaponStats') { await doApplyWeaponStats(dialog, weap); return; }
        });
    });
}

function renderDialogStatGrid(weap) {
    const container = document.getElementById('weapon-dialog-stats');
    if (!container) return;
    const validStats = ['dmg_min','dmg_max','strength','agility','magic','defense','vitality','hit_chance','crit_chance','armor','hp_max','pyro_dmg','water_dmg','wind_dmg','electro_dmg','pyro_resist','water_resist','wind_resist','electro_resist'];
    const labels = { dmg_min:'Min Dmg', dmg_max:'Max Dmg', strength:'STR', agility:'AGI', magic:'MAG', defense:'DEF', vitality:'VIT', hit_chance:'Hit', crit_chance:'Crit', armor:'Armor', hp_max:'HP', pyro_dmg:'Pyro Dmg', water_dmg:'Water Dmg', wind_dmg:'Wind Dmg', electro_dmg:'Electro Dmg', pyro_resist:'Pyro Res', water_resist:'Water Res', wind_resist:'Wind Res', electro_resist:'Electro Res' };
    const pending = window._pendingWeaponStats || {};
    const totalUsed = Object.values(pending).reduce((s,v) => s+v, 0);
    container.innerHTML = validStats.map(s => {
        const base = weap.wp_stats[s] || 0;
        const add = pending[s] || 0;
        return `<div style="display:grid;grid-template-columns:1fr 35px 35px auto;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:0.7rem">
            <span>${labels[s]||s}</span>
            <span style="text-align:right;color:var(--text-dim)">${base}</span>
            <span style="text-align:left;color:var(--green)">${add>0?`+${add}`:''}</span>
            <div style="display:flex;gap:2px;justify-self:end">
                <button class="btn-sm stat-minus" data-stat="${s}" ${add<=0?'disabled':''} style="font-size:0.65rem;padding:1px 5px;min-width:22px">−</button>
                <button class="btn-sm stat-plus" data-stat="${s}" ${totalUsed>=weap.wp_stat_points?'disabled':''} style="font-size:0.65rem;padding:1px 5px;min-width:22px">+</button>
            </div>
        </div>`;
    }).join('');
    container.querySelectorAll('.stat-plus').forEach(btn => {
        btn.addEventListener('click', () => {
            const stat = btn.dataset.stat;
            if (!window._pendingWeaponStats) window._pendingWeaponStats = {};
            const used = Object.values(window._pendingWeaponStats).reduce((s,v) => s+v, 0);
            if (used >= (weap?.wp_stat_points || 0)) return;
            window._pendingWeaponStats[stat] = (window._pendingWeaponStats[stat] || 0) + 1;
            renderDialogStatGrid(weap);
        });
    });
    container.querySelectorAll('.stat-minus').forEach(btn => {
        btn.addEventListener('click', () => {
            const stat = btn.dataset.stat;
            if (!window._pendingWeaponStats) window._pendingWeaponStats = {};
            if ((window._pendingWeaponStats[stat] || 0) <= 0) return;
            window._pendingWeaponStats[stat] -= 1;
            if (window._pendingWeaponStats[stat] <= 0) delete window._pendingWeaponStats[stat];
            renderDialogStatGrid(weap);
        });
    });
    const applyBtn = document.getElementById('btn-dialog-apply-stats');
    if (applyBtn) applyBtn.style.display = totalUsed > 0 ? 'block' : 'none';
    const header = document.getElementById('weapon-stats-header');
    if (header) {
        const remaining = (weap?.wp_stat_points || 0) - totalUsed;
        header.textContent = `✨ ${remaining} / ${weap?.wp_stat_points || 0} Stat Points`;
    }
}

async function openWeaponFeedDialog(dialog, weap) {
    if (!forgeData?.mats) return;
    const entries = Object.entries(forgeData.mats)
        .filter(([,m]) => m.qty > 0 && m.type === 'raw_mat')
        .sort((a,b) => (({legendary:0,epic:1,rare:2,uncommon:3,common:4})[a[1]?.rarity||'common']||0) - (({legendary:0,epic:1,rare:2,uncommon:3,common:4})[b[1]?.rarity||'common']||0));
    if (!entries.length) {
        dialog.innerHTML = `
            <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-weight:700;font-size:0.95rem">📦 Feed Materials</span>
                    <button class="btn-secondary" style="font-size:0.75rem;padding:3px 8px" id="feed-back-btn">← Back</button>
                </div>
                <div style="text-align:center;padding:24px;color:var(--text-dim);font-size:0.85rem">No raw materials to feed. Gather materials from missions and PvP.</div>
            </div>`;
        dialog.querySelector('#feed-back-btn').addEventListener('click', () => buildWeaponDialog(dialog, weap));
        return;
    }

    const savedHtml = dialog.innerHTML;
    dialog.innerHTML = `
        <div style="padding:16px;display:flex;flex-direction:column;gap:8px;max-height:70vh">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:700;font-size:0.95rem">📦 Feed Materials</span>
                <button class="btn-secondary" style="font-size:0.75rem;padding:3px 8px" id="feed-back-btn">← Back</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:0.65rem;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:6px;justify-content:center">
                <span style="color:var(--text-dim)">Common +1</span>
                <span style="color:#2ecc71">Uncommon +3</span>
                <span style="color:#3498db">Rare +8</span>
                <span style="color:#9b59b6">Epic +20</span>
                <span style="color:#f1c40f">Legendary +50</span>
            </div>
            <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
                ${entries.map(([id, mat]) =>
        `<div class="feed-row" data-invid="${mat.invId || id}" data-max="${mat.qty}" style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;font-size:0.85rem">
                        <span style="font-size:1.1rem;flex-shrink:0">${mat.emoji||'📦'}</span>
                        <span style="flex:1;min-width:0">${mat.name||id}</span>
                        <span style="color:var(--text-dim);font-size:0.7rem;flex-shrink:0">×${mat.qty}</span>
                        <span style="font-size:0.6rem;padding:1px 4px;border-radius:4px;flex-shrink:0;background:${({common:'rgba(255,255,255,0.06)',uncommon:'rgba(46,204,113,0.2)',rare:'rgba(52,152,219,0.2)',epic:'rgba(155,89,182,0.2)',legendary:'rgba(241,196,15,0.2)'})[mat.rarity]||'rgba(255,255,255,0.06)'};color:${({common:'var(--text-dim)',uncommon:'#2ecc71',rare:'#3498db',epic:'#9b59b6',legendary:'#f1c40f'})[mat.rarity]||'var(--text-dim)'}">${mat.rarity||'common'}</span>
                        <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
                            <button class="btn-sm qty-btn" data-dir="-1" style="font-size:0.7rem;padding:2px 5px;min-width:20px">−</button>
                            <input class="qty-input" type="number" min="1" max="${mat.qty}" value="1" style="width:36px;text-align:center;font-size:0.75rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:inherit;padding:2px 0">
                            <button class="btn-sm qty-btn" data-dir="1" style="font-size:0.7rem;padding:2px 5px;min-width:20px">+</button>
                            <button class="btn-sm feed-go-btn" style="font-size:0.65rem;padding:2px 6px;background:var(--green-dim);border:1px solid rgba(46,204,113,0.3)">Feed</button>
                        </div>
                    </div>`
    ).join('')}
            </div>
            <div id="feed-error-msg" class="msg-bar hidden" style="font-size:0.75rem;padding:6px 10px;border-radius:6px;text-align:center"></div>
        </div>`;

    dialog.querySelectorAll('.feed-row').forEach(row => {
        const max = parseInt(row.dataset.max) || 1;
        const input = row.querySelector('.qty-input');
        const feedBtn = row.querySelector('.feed-go-btn');
        const feedInvId = row.dataset.invid;

        row.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                let v = parseInt(input.value) || 1;
                v = Math.max(1, Math.min(max, v + parseInt(btn.dataset.dir)));
                input.value = v;
            });
        });

        input.addEventListener('change', () => {
            let v = parseInt(input.value) || 1;
            v = Math.max(1, Math.min(max, v));
            input.value = v;
        });

        feedBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const qty = parseInt(input.value) || 1;
            feedBtn.disabled = true;
            feedBtn.textContent = '...';
            try {
                const d = await api('POST','/game/forge/weapon/feed',{inventoryId: feedInvId, qty});
                if (d.overfeed) {
                    feedBtn.disabled = false;
                    feedBtn.textContent = 'Feed';
                    dialog.close();
                    const confirmed = await openGameDialog({
                        title: '⚠️ Overfeed Warning',
                        message: `Feeding ${d.consumeQty}x ${d.rarity} will add +${d.totalWeight} feed.<br><br>The feed bar needs ${d.feedNeeded} total, currently at ${d.curFeed} (${d.feedRemaining} remaining).<br><br><b>+${d.overflow} feed will be wasted.</b><br><br>Materials will still be consumed. Continue?`,
                        confirmLabel: 'Feed Anyway',
                        cancelLabel: 'Cancel',
                        showCancel: true,
                        danger: true,
                    });
                    if (confirmed) {
                        const d2 = await api('POST','/game/forge/weapon/feed',{inventoryId: feedInvId, qty, confirmOverfeed: true});
                        forgeData = await api('GET','/game/forge/recipes');
                        showMsg('forge-msg', d2.message);
                        buildWeaponDialog(dialog, forgeData.weapon);
                    }
                    dialog.showModal();
                    return;
                }
                forgeData = await api('GET','/game/forge/recipes');
                showMsg('forge-msg', d.message);
                buildWeaponDialog(dialog, forgeData.weapon);
            } catch(e) {
                const feedErr = document.getElementById('feed-error-msg');
                if (feedErr) { feedErr.textContent = e.message; feedErr.classList.remove('hidden'); feedErr.style.background = 'rgba(192,57,43,0.1)'; feedErr.style.borderColor = 'rgba(192,57,43,0.4)'; feedErr.style.color = 'var(--red-light)'; }
                feedBtn.disabled = false; feedBtn.textContent = 'Feed';
            }
        });
    });
    const backBtn = document.getElementById('feed-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => buildWeaponDialog(dialog, weap));
}

async function doWeaponLevelUp(dialog, weap) {
    try {
        const d = await api('POST','/game/forge/weapon/levelup');
        window._pendingWeaponStats = {};
        character = await api('GET','/game/character');
        renderTopBar();
        renderCharacter();
        forgeData = await api('GET','/game/forge/recipes');
        showMsg('forge-msg', d.message);
        buildWeaponDialog(dialog, forgeData.weapon);
    } catch(e) { showMsg('forge-msg', e.message, true); }
}

async function doApplyWeaponStats(dialog, weap) {
    try {
        const stats = window._pendingWeaponStats || {};
        if (!Object.keys(stats).length) return;
        await api('POST','/game/forge/weapon/stats',{ stats });
        window._pendingWeaponStats = {};
        character = await api('GET','/game/character');
        renderTopBar();
        renderCharacter();
        forgeData = await api('GET','/game/forge/recipes');
        buildWeaponDialog(dialog, forgeData.weapon);
        showMsg('forge-msg','Stats applied!');
    } catch(e) { showMsg('forge-msg', e.message, true); }
}

async function refine(componentId) {
    try {
        const d = await api('POST','/game/forge/refine',{componentId});
        character = await api('GET','/game/character');
        renderTopBar();
        renderCharacter();
        await loadForge();
        showMsg('forge-msg', d.message);
    } catch(e) {
        showMsg('forge-msg',e.message,true);
    }
}
async function craftItem(recipeId) {
    try {
        const d = await api('POST','/game/forge/craft',{recipeId});
        character = await api('GET','/game/character');
        renderTopBar();
        renderCharacter();
        await loadForge();
        await loadInventory();
        showMsg('forge-msg', d.message);
    } catch(e) {
        showMsg('forge-msg',e.message,true);
    }
}

// ── Inventory ─────────────────────────────────────────────────────────────
// ── Inventory State ────────────────────────────────────────────────────────
let invBulkMode = false;
let invBulkSelected = {}; // { invId: { name, price } }

async function loadInventory() {
    document.getElementById('inventory-content').innerHTML='<p class="loading">Loading...</p>';
    try {
        const d=await api('GET','/game/inventory');
        syncPotionBadgeFromInventory(d);
        renderInventory(d);
    }
    catch(e) { document.getElementById('inventory-content').innerHTML=`<p class="loading">${e.message}</p>`; }
}

function setInvTab(tab, btn) {
    invTab = tab;
    if (!invBulkMode) invBulkSelected = {};
    document.querySelectorAll('#tab-inventory .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadInventory();
}

function syncInvTabButtons() {
    const tabs = ['weapons', 'armor', 'helmets', 'shields', 'boots', 'jewelry', 'accessory', 'consumables', 'materials', 'lootboxes', 'elementals'];
    document.querySelectorAll('#tab-inventory .filter-btn').forEach((btn, i) => {
        btn.classList.toggle('active', tabs[i] === invTab);
    });
}

function getInventorySellRate() {
    const activePrem = character?.premium_features || {};
    return (activePrem.vault_keeper && activePrem.apprentice) ? 0.40 : 0.30;
}

function getInventorySellCap(itemData) {
    const explicitCap = Number(itemData?.sell_price_cap || 0);
    if (explicitCap > 0) return explicitCap;
    if (itemData?.source === 'banner') return 1000;
    return 0;
}

function getInventorySellPrice(itemData) {
    const originalPrice = Number(itemData?.original_price || itemData?.price || 0);
    const rawSellPrice = Math.max(1, Math.floor(originalPrice * getInventorySellRate()));
    const cap = getInventorySellCap(itemData);
    return cap > 0 ? Math.min(rawSellPrice, cap) : rawSellPrice;
}

function renderGearGrid(el, gear, equipped) {
    window._invGearData = {};
    gear.forEach(i => {
        const d = typeof i.item_data === 'object' ? i.item_data : {};
        window._invGearData[i.id] = { ...i, equippedInSlot: equipped?.[d.slot] };
    });
    const equippedIds = Object.values(equipped || {}).map(e => e.inventoryId).filter(Boolean);

    // Calculate premium sell rate for display in tooltip (tooltip will handle it)
    // But we can also show a small badge for merchant prince
    const activePrem = character?.premium_features || {};
    const hasVaultKeeper = !!activePrem.vault_keeper;
    const hasApprentice = !!activePrem.apprentice;
    const merchantPrince = hasVaultKeeper && hasApprentice;
    const premiumBadge = merchantPrince ? '<span class="premium-sell-badge" style="font-size:0.55rem; background:rgba(155,89,182,0.3); padding:2px 4px; border-radius:4px; margin-left:4px;">40%</span>' : '';

    el.innerHTML += `<div class="inv-hint">Hover/Click to inspect &nbsp;·&nbsp; Use buttons to equip/upgrade ${premiumBadge}</div>
    <div class="inv-equipment-grid">${gear.map(i => {
        const d = typeof i.item_data === 'object' ? i.item_data : {};
        const isEquipped = equippedIds.includes(i.id);
        const upgradeLevel = i.upgrade_level || 0;
        const qc = d.quality==='legendary'?'inv-legendary':d.quality==='epic'?'inv-epic':d.quality==='rare'?'inv-rare':'';
        const upgradeBadge = upgradeLevel > 0 ? `<div class="upgrade-badge">+${upgradeLevel}</div>` : '';
        const maxUpgrade = d.quality === 'legendary' ? 5 : (d.quality === 'epic' || d.quality === 'rare' ? 4 : 3);
        const setupBadges = (i.setups || []).map(sn => `<span class="setup-badge" title="In setup: ${escHtml(sn)}">🔧 ${escHtml(sn)}</span>`).join('');
        const isSelected = invBulkMode && invBulkSelected[i.id];
        const sellPrice = getInventorySellPrice(d);

        return `
        <div class="inv-item-cell ${isEquipped?'inv-item-equipped ' : ''}${qc} ${isSelected ? 'inv-item-selected' : ''}" style="position:relative;${invBulkMode ? 'cursor:pointer' : ''}" ${invBulkMode ? actionAttrs('toggleInvBulkSelect', i.id, d.name || '', sellPrice) : ''} ${!invBulkMode ? actionAttrs('openItemTooltip', i.id) : ''}>
            ${invBulkMode ? `<div class="inv-bulk-check" style="position:absolute;top:4px;left:4px;z-index:2;width:20px;height:20px;border-radius:50%;background:${isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.15)'};border:2px solid ${isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.3)'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${isSelected ? '✓' : ''}</div>` : ''}
            <div class="inv-item-icon" 
                 ${!invBulkMode ? `data-hover-action="hoverItemTooltip" data-args='[${i.id}]' data-leave-action="scheduleHideTooltip"` : ''}
                 ${!invBulkMode ? actionAttrs('openItemTooltip', i.id) : ''}>${itemIcon(d,'64px')}</div>
            ${upgradeBadge}
            ${isEquipped ? '<div class="inv-item-equipped-dot"></div>' : ''}
            <div class="inv-item-name-label">${(d.name||'').split(' ').slice(-1)[0]}</div>
            ${setupBadges ? `<div class="inv-item-setup-badges">${setupBadges}</div>` : ''}
            <div class="inv-item-actions" style="display:flex; gap:4px; margin-top:5px;">
                ${invBulkMode ? `<span style="font-size:0.7rem;color:var(--text-dim)">${sellPrice}g</span>` : `<button class="btn-sm" style="font-size:0.6rem; padding:2px 6px;" ${actionAttrs('toggleEquipItem', i.id, d.slot, isEquipped)}>${isEquipped ? 'Unequip' : 'Equip'}</button>`}
                ${!invBulkMode && upgradeLevel < maxUpgrade ? `<button class="btn-sm" style="font-size:0.6rem; padding:2px 6px; background:rgba(155,89,182,0.2);" ${actionAttrs('openUpgradeModal', i.id)}>⬆️ Upgrade</button>` : ''}
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
        const quality = itemData.quality || 'common';
        const maxUpgrade = quality === 'legendary' ? 5 : (quality === 'epic' || quality === 'rare' ? 4 : 3);

        if (currentUpgrade >= maxUpgrade) {
            showMsg('inv-msg', `Item already at max upgrade level (+${maxUpgrade}) for ${quality} quality!`, true);
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
// ── OPEN LOOT BOX WITH MODAL ───────────────────────────────────────────────
function renderInventory(data) {
    const el = document.getElementById('inventory-content');

    // Bulk sell mode bar
    const bulkBar = '<div data-bulk-bar style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:6px 10px;background:rgba(201,146,42,0.06);border:1px solid rgba(201,146,42,0.15);border-radius:var(--radius-sm)">' +
        '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;user-select:none">' +
        `<input type="checkbox" id="inv-bulk-toggle" ${invBulkMode ? 'checked' : ''} data-change-action="toggleInvBulkMode"> Bulk Sell</label>` +
        (invBulkMode ? '<span style="font-size:0.75rem;color:var(--text-dim)">Click items to mark for sale</span>' : '') +
        `<span data-bulk-count style="flex:1;text-align:right;font-size:0.85rem;color:var(--gold);display:${invBulkMode && Object.keys(invBulkSelected).length > 0 ? 'inline' : 'none'}">` +
            (Object.keys(invBulkSelected).length > 0 ? `${Object.keys(invBulkSelected).length} selected` : '') +
        `</span>` +
        `<button class="btn-sm danger" style="display:${invBulkMode && Object.keys(invBulkSelected).length > 0 ? 'inline-block' : 'none'}" data-action="sellBulkSelected">` +
            (Object.keys(invBulkSelected).length > 0 ? `Sell (${Object.values(invBulkSelected).reduce((s, i) => s + i.price, 0).toLocaleString()}g)` : '') +
        `</button>` +
        '</div>';

    function getSlot(i) {
        const d = typeof i.item_data === 'object' ? i.item_data : {};
        return d.slot || '';
    }

    // Helper to check if item is a loot box
    const isLootBox = (item) => item.item_data?.category === 'lootbox';

    // Helper to get item image path
    const getItemImage = (itemName) => {
        if (!itemName) return '';
        const baseName = String(itemName).replace(/\s\+\d+$/, '');
        const imageName = baseName.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `/images/assets/${imageName}.png`;
    };

    const gearTab = (slots, emptyMsg) => {
        const gear = data.items.filter(i => i.item_type === 'equipment' && slots.includes(getSlot(i)));
        if (!gear.length) { el.innerHTML = bulkBar + `<p class="empty">${emptyMsg}</p>`; return; }
        el.innerHTML = bulkBar;
        renderGearGrid(el, gear, data.equipped);
    };

    if (invTab === 'weapons') {
        gearTab(['weapon'], 'No weapons yet.');
    } else if (invTab === 'armor') {
        gearTab(['armor'], 'No armor yet.');
    } else if (invTab === 'helmets') {
        gearTab(['helmet'], 'No helmets yet.');
    } else if (invTab === 'shields') {
        gearTab(['shield'], 'No shields yet.');
    } else if (invTab === 'boots') {
        gearTab(['boots'], 'No boots yet.');
    } else if (invTab === 'jewelry') {
        gearTab(['ring', 'amulet'], 'No rings or amulets yet.');
    } else if (invTab === 'accessory') {
        gearTab(['accessory'], 'No accessories yet.');
    } else if (invTab === 'lootboxes') {
        // LOOT BOXES TAB
        const lootBoxes = data.items.filter(i => i.item_type === 'consumable' && isLootBox(i));
        if (!lootBoxes.length) {
            el.innerHTML = bulkBar + '<p class="empty">No loot boxes. Buy them from the shop!</p>';
            return;
        }
        el.innerHTML = bulkBar + '<div class="inv-consumable-grid">' + lootBoxes.map(i => {
            const d = i.item_data;
            const sp = getInventorySellPrice(d);
            const itemImage = d.image || getItemImage(d.name);
            return `<div class="inv-consumable-card lootbox-card">
                <div class="inv-consumable-top">
                    <div class="inv-consumable-icon">
                        <img src="${itemImage}" data-error-hide="true" data-error-next-display="inline">
                        <span style="font-size:2rem;display:none">${d.emoji || '🎁'}</span>
                    </div>
                    <div class="inv-consumable-copy">
                        <div class="inv-consumable-name">${d.name}</div>
                        <div class="inv-consumable-qty">×${d.qty || 1}</div>
                    </div>
                </div>
                <div class="inv-consumable-desc">${d.desc}</div>
                <div class="inv-consumable-actions">
                    <button class="btn-primary inv-consumable-btn" ${actionAttrs('openLootBox', i.id, d.name)}>🎁 Open</button>
                    <button class="btn-sm danger inv-consumable-btn" ${invBulkMode ? actionAttrs('sellItemWithQty', i.id, d.name, sp, d.qty || 1) : actionAttrs('sellItem', i.id, d.name, sp)}>Sell ${sp}g</button>
                </div>
            </div>`;
        }).join('') + '</div>';
        return;
    } else if (invTab === 'elementals') {
        el.innerHTML = bulkBar + '<div class="loading">Loading elementals...</div>';
        (async () => {
            try {
                const r = await api('GET', '/game/elementals');
                if (r.error) throw new Error(r.error);
                if (!r.elementals || r.elementals.length === 0) {
                    el.innerHTML = bulkBar + '<p class="empty">No elementals. Discover one in the Elemental tab!</p>';
                    return;
                }
                el.innerHTML = bulkBar + '<div class="elem-inv-grid">' + r.elementals.map(e => {
                    const elEmoji = e.element === 'pyro' ? '🔥' : e.element === 'water' ? '💧' : e.element === 'wind' ? '🌪️' : '⚡';
                    const hpPct = e.hpMax > 0 ? Math.round((e.hp_current / e.hpMax) * 100) : 0;
                    const xpPct = e.xpNext > 0 ? Math.round(((e.xp || 0) / e.xpNext) * 100) : 0;
                    const elemData = escHtml(JSON.stringify({ name: e.name, element: e.element, level: e.level, hp: e.hp_current + '/' + e.hpMax, xp: (e.xp || 0) + '/' + e.xpNext, str: e.str, def: e.def, mag: e.mag, vit: e.vit, dmgMin: e.dmgMin, dmgMax: e.dmgMax }));
                    return `<div class="elem-inv-card ${e.equipped ? 'equipped' : ''}">
                        <div class="elem-inv-top">
                            <div class="elem-inv-icon"><img src="/images/assets/elemental.png" alt="Elemental" data-hover-action="hoverElemTooltip" data-leave-action="scheduleHideTooltip" data-elem="${elemData}"></div>
                            <div class="elem-inv-copy">
                                <div class="elem-inv-name">${escHtml(e.name)}</div>
                                <div class="elem-inv-meta">${elEmoji} ${e.element} · Lv.${e.level}</div>
                            </div>
                            ${e.equipped ? '<span class="equipped-badge">Equipped</span>' : ''}
                        </div>
                        <div class="elem-inv-stat">💪 Str ${e.str}</div>
                        <div class="elem-inv-stat">🛡️ Def ${e.def}</div>
                        <div class="elem-inv-stat">✨ Mag ${e.mag}</div>
                        <div class="elem-inv-stat">❤️ Vit ${e.vit}</div>
                        <div class="elem-inv-stat">⚔️ Dmg ${e.dmgMin}-${e.dmgMax}</div>
                        <div class="elem-inv-bars">
                            <div class="elem-bar-label">HP ${e.hp_current}/${e.hpMax}</div>
                            <div class="elem-bar"><div class="elem-bar-fill hp-fill" style="width:${hpPct}%"></div></div>
                            <div class="elem-bar-label">XP ${e.xp || 0}/${e.xpNext}</div>
                            <div class="elem-bar"><div class="elem-bar-fill xp-fill" style="width:${xpPct}%"></div></div>
                        </div>
                        <div class="elem-inv-actions">
                            ${e.equipped
                        ? `<button class="btn-secondary" data-action="unequipElementalInv" data-args='[${e.id}]'>Unequip</button>`
                        : `<button class="btn-primary" data-action="equipElementalInv" data-args='[${e.id}]'>Equip</button>`
                    }
                        </div>
                    </div>`;
                }).join('') + '</div>';
            } catch (e) {
                el.innerHTML = bulkBar + `<div class="error">Failed to load elementals: ${e.message}</div>`;
            }
        })();
        return;
    } else if (invTab === 'consumables') {
        // CONSUMABLES TAB
        const cons = data.items.filter(i => i.item_type === 'consumable' && !isLootBox(i));
        if (!cons.length) { el.innerHTML = bulkBar + '<p class="empty">No consumables. Buy potions from the Shop!</p>'; return; }
        el.innerHTML = bulkBar + '<div class="inv-consumable-grid">' + cons.map(i => {
            const d = i.item_data;
            const eff = d.effect ? (
                d.effect.type === 'heal' ? '❤️ Restore ' + d.effect.value + ' HP' :
                    d.effect.type === 'heal_full' ? '❤️ Full HP restore' :
                        d.effect.type === 'xp' ? '⭐ +' + d.effect.value + ' XP' :
                            d.effect.type === 'temp_stat' ? '💪 +' + d.effect.value + ' ' + d.effect.stat :
                                d.effect.type === 'mp' ? '🔮 Restore ' + d.effect.value + ' MP' : ''
            ) : '';
            const sp = getInventorySellPrice(d);
            const itemImage = d.image || getItemImage(d.name);
            return `<div class="inv-consumable-card">
                <div class="inv-consumable-top">
                    <div class="inv-consumable-icon">
                        <img src="${itemImage}" data-error-hide="true" data-error-next-display="inline">
                        <span style="font-size:2rem;display:none">${d.emoji || '🧪'}</span>
                    </div>
                    <div class="inv-consumable-copy">
                        <div class="inv-consumable-name">${d.name || ''}</div>
                        <div class="inv-consumable-qty">×${d.qty || 1}</div>
                    </div>
                </div>
                <div class="inv-consumable-effect">${eff}</div>
                <div class="inv-consumable-desc">${d.desc || ''}</div>
                <div class="inv-consumable-actions">
                    <button class="btn-sm inv-consumable-btn inv-consumable-use" ${actionAttrs('useItem', i.id, d.name || '')}>Use</button>
                    ${(d.effect?.type === 'heal' || d.effect?.type === 'heal_full') && character?.elemental ? `<button class="btn-sm inv-consumable-btn" ${actionAttrs('useItemOnBeast', i.id, d.name || '')}>Use on Beast</button>` : ''}
                    <button class="btn-sm danger inv-consumable-btn" ${invBulkMode ? actionAttrs('sellItemWithQty', i.id, d.name || '', sp, d.qty || 1) : actionAttrs('sellItem', i.id, d.name || '', sp)}>Sell ${sp}g</button>
                </div>
            </div>`;
        }).join('') + '</div>';
    } else if (invTab === 'materials') {
        // MATERIALS TAB with exchange options
        const mats = data.items.filter(i => i.item_type === 'raw_mat' || i.item_type === 'component');
        if (!mats.length) {
            el.innerHTML = bulkBar + '<p class="empty">No materials yet. Complete missions to gather resources!</p>';
            return;
        }

        // Get legendary fragment count for exchange
        let fragmentCount = 0;
        const fragmentItem = mats.find(i => i.item_data?.id === 'legendary_fragment');
        if (fragmentItem) {
            fragmentCount = fragmentItem.item_data?.qty || 1;
        }

        // Define exchange rates
        const exchangeRates = {
            abyss_crystal: { name: 'Abyss Crystal', emoji: '💎', fragmentCost: 20 },
            abyss_fragment: { name: 'Abyss Fragment', emoji: '🧩', fragmentCost: 30 },
            abyss_weave: { name: 'Abyss Weave', emoji: '🕸️', fragmentCost: 35 },
            eternal_essence: { name: 'Eternal Essence', emoji: '💠', fragmentCost: 40 },
            shadowsteel_bar: { name: 'Shadowsteel Bar', emoji: '⚙️', fragmentCost: 45 },
            crimson_alloy: { name: 'Crimson Alloy', emoji: '⚡', fragmentCost: 50 },
            void_plate: { name: 'Void Plate', emoji: '🛡️', fragmentCost: 55 },
            abyss_crystal: { name: 'Abyss Crystal', emoji: '💎', fragmentCost: 20 },
            abyss_fragment: { name: 'Abyss Fragment', emoji: '🧩', fragmentCost: 30 },
            wood: { name: 'Wood', emoji: '🪵', fragmentCost: 5 },
            iron_ore: { name: 'Iron Ore', emoji: '⛏️', fragmentCost: 5 },
            wolf_pelt: { name: 'Wolf Pelt', emoji: '🐺', fragmentCost: 5 },
            herbs: { name: 'Herbs', emoji: '🌿', fragmentCost: 5 },
            poison_gland: { name: 'Poison Gland', emoji: '🧪', fragmentCost: 10 },
            swamp_crystal: { name: 'Swamp Crystal', emoji: '💎', fragmentCost: 10 },
            frost_essence: { name: 'Frost Essence', emoji: '❄️', fragmentCost: 10 },
            mithril_ore: { name: 'Mithril Ore', emoji: '✨', fragmentCost: 10 },
            dragon_scale_shard: { name: 'Dragon Scale Shard', emoji: '🐉', fragmentCost: 15 },
            arcane_dust: { name: 'Arcane Dust', emoji: '🌟', fragmentCost: 15 },
            void_shard: { name: 'Void Shard', emoji: '🌑', fragmentCost: 15 },
            shadow_essence: { name: 'Shadow Essence', emoji: '👁️', fragmentCost: 20 },
            demon_core: { name: 'Demon Core', emoji: '💀', fragmentCost: 20 },
            void_crystal: { name: 'Void Crystal', emoji: '🔮', fragmentCost: 25 },
            shadow_weave: { name: 'Shadow Weave', emoji: '🌙', fragmentCost: 25 },
            demon_alloy: { name: 'Demon Alloy', emoji: '⚙️', fragmentCost: 25 },
        };

        // Separate owned materials (excluding legendary fragments from the owned display)
        const ownedMaterials = mats.filter(m => m.item_data?.id !== 'legendary_fragment');

        el.innerHTML = bulkBar + `
            <div style="margin-bottom: 16px; padding: 12px; background: rgba(155,89,182,0.1); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="font-size: 1.2rem;">⭐</span>
                    <strong>Legendary Fragments: ${fragmentCount}</strong>
                </div>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Exchange fragments for materials below</div>
            </div>
            
            <div class="section-title">📦 Your Materials</div>
            <div class="mat-grid">
                ${ownedMaterials.map(i => {
            const d = i.item_data;
            const itemImage = d.image || getItemImage(d.name);
            return `<div class="mat-card" style="position:relative">
                        ${invBulkMode ? `<div style="position:absolute;top:4px;right:4px;font-size:0.7rem;color:var(--text-dim)">${getInventorySellPrice(d)}g</div>` : ''}
                        <img src="${itemImage}" style="width:48px;height:48px;object-fit:contain;margin-bottom:8px;border-radius:12px" data-error-hide="true" data-error-next-display="block">
                        <div style="font-size:1.6rem;display:none">${d.emoji || '📦'}</div>
                        <div class="mat-name">${d.name || d.id}</div>
                        <div class="mat-qty">× ${d.qty || 1}</div>
                        <div class="mat-type" style="color:var(--text-dim);font-size:0.7rem">${i.item_type === 'component' ? 'Component' : 'Raw Material'}</div>
                        ${invBulkMode ? `<button class="btn-sm danger" style="margin-top:6px;font-size:0.65rem;padding:2px 6px" ${actionAttrs('sellItemWithQty', i.id, d.name || d.id, getInventorySellPrice(d), d.qty || 1)}>Sell ${getInventorySellPrice(d)}g</button>` : ''}
                    </div>`;
        }).join('')}
            </div>
            
            <div class="section-title" style="margin-top: 24px;">⭐ Exchange Fragments for Materials</div>
            <div class="mat-grid">
                ${Object.entries(exchangeRates).map(([id, rate]) => {
            const canAfford = fragmentCount >= rate.fragmentCost;
            return `<div class="mat-card" style="position: relative;">
                        <div style="font-size: 2rem; margin-bottom: 8px;">${rate.emoji}</div>
                        <div class="mat-name">${rate.name}</div>
                        <div class="mat-qty" style="color: #f1c40f;">Cost: ${rate.fragmentCost} ⭐</div>
                        <button class="btn-sm" ${actionAttrs('exchangeFragmentForMaterial', id, 1)} ${!canAfford ? 'disabled' : ''} 
                            style="margin-top: 8px; width: 100%;">Exchange x1</button>
                        <button class="btn-sm" ${actionAttrs('exchangeFragmentForMaterial', id, 5)} ${fragmentCount < rate.fragmentCost * 5 ? 'disabled' : ''}
                            style="margin-top: 4px; width: 100%;">Exchange x5</button>
                    </div>`;
        }).join('')}
            </div>
        `;
    }
}
// ── Weapon class suitability ──────────────────────────────────────────────
function isWeaponSuitedForClass(weapon, cls) {
    if (!weapon || !cls || weapon.slot !== 'weapon') return true;
    const name = (weapon.name || '').toLowerCase();
    const wpnType = weapon.weaponType || weapon.weapon_type || weapon.type || '';
    const is = (s) => name.includes(s) || wpnType === s;
    let result = true;
    if (cls === 'rogue')   result = is('dagger') || is('bow') || is('scythe');
    else if (cls === 'mage')    result = is('scythe') || is('staff');
    else if (cls === 'paladin') result = is('mace') || is('hammer') || is('staff') || is('axe') || is('blade') || is('spear') || is('scythe') || is('sword');
    else if (cls === 'warrior') result = !(is('staff') || is('dagger'));
    if (!result) console.log('[WPNDEBUG]', weapon.name, 'type='+weapon.type, 'weaponType='+weapon.weaponType, 'weapon_type='+weapon.weapon_type, 'wpnType='+wpnType, 'name='+name, 'cls='+cls);
    return result;
}
const CLASS_WARN_HTML = '<div style="color:#e74c3c;font-size:0.72rem;margin-top:4px;padding:4px 6px;background:rgba(231,76,60,0.1);border-radius:4px">⚠️ This weapon is not suited for your class</div>';

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

    // NORMALIZE JEWELRY SLOT - rings and amulets are the same slot
    let itemSlot = d.slot;
    let equippedItem = eq;

    if (itemSlot === 'ring' || itemSlot === 'amulet') {
        itemSlot = 'jewelry';
        // For equipped comparison, check both ring and amulet slots
        if (!equippedItem && character?.equipped) {
            equippedItem = character.equipped.ring || character.equipped.amulet;
        }
    }

    const allStats = new Set([...Object.keys(d.stats||{}),...Object.keys(equippedItem?.stats||{})].filter(k=>!k.includes('type')));
    const qColor = {legendary:'#ffd700',epic:'#e67e22',rare:'#9b59b6',common:'rgba(255,255,255,0.5)'}[d.quality||'common'];
    const displayName = getDisplayItemName(d, info.upgrade_level || 0);
    const displayDesc = getDisplayItemDesc(d);
    const imgSrc = d.img || (d.name && !d.consumable ? getAssetImagePath(d.name) : null);

    let statsHtml = '';
    for (const stat of allStats) {
        if (stat === 'elem_dmg' || stat === 'elem_dmg_type' || stat === 'elem_resist') continue;
        const nv = d.stats?.[stat]||0, ov = equippedItem?.stats?.[stat]||0, diff = nv - ov;
        const dc = diff>0?'#2ecc71':diff<0?'#e74c3c':'rgba(255,255,255,0.3)';
        const ds = diff>0?'▲'+diff:diff<0?'▼'+Math.abs(diff):'';
        const label = statLabelHtml(stat);
        statsHtml += `<div class="tt-stat"><span class="tt-stat-name">${label}</span><span class="tt-stat-val">${nv}</span>${equippedItem && !isEquipped && ds ? `<span style="font-size:0.68rem;color:${dc}">${ds}</span>` : ''}</div>`;
    }

    const classWarn = !isWeaponSuitedForClass(d, character?.class) ? CLASS_WARN_HTML : '';
    const sp = getInventorySellPrice(d);
    const sn = (d.name||'').replace(/'/g,"\\'");

    tooltip.innerHTML = `
        <div class="tt-preview">
            <button class="tt-close" id="tt-close-btn" ${actionAttrs('closeItemTooltip')}>✕</button>
            ${imgSrc
        ?`<img src="${imgSrc}" data-error-hide="true" data-error-next-display="block"><span class="tt-preview-emoji" style="display:none">${d.emoji||'📦'}</span>`
        :`<span class="tt-preview-emoji">${d.emoji||'📦'}</span>`}
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${displayName}</div>
            <div class="tt-meta">${capitalize(itemSlot||'')}${d.quality&&d.quality!=='common'?' · <span style="color:'+qColor+'">'+d.quality+'</span>':''}</div>
            ${displayDesc?`<div class="tt-desc">${displayDesc}</div>`:''}
            <div class="tt-stats">${statsHtml||`<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>`}</div>
            ${classWarn}
            ${equippedItem && !isEquipped ? `<div class="tt-vs">vs equipped: <strong>${equippedItem.name}</strong></div>` : ''}
        </div>
        <div class="tt-actions">
            ${isEquipped
        ?`<button class="tt-btn tt-btn-secondary" ${actionAttrs('unequipSlot', d.slot)}>Unequip</button>`
        :`<button class="tt-btn tt-btn-primary" ${actionAttrs('equipItem', itemId)}>Equip</button>`}
            <button class="tt-btn tt-btn-danger" ${actionAttrs('sellItem', itemId, d.name || '', sp)} ${isEquipped?'disabled':''}>Sell ${sp}g</button>
        </div>`;

    tooltip.classList.remove('hidden');
    const r = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = '-9999px'; tooltip.style.top = '-9999px';

    // Always give the tooltip a definite height (clamped to the viewport).
    // With only max-height, some browsers won't size grid `1fr` rows correctly and the footer can get clipped.
    tooltip.style.height = '';
    const tw = tooltip.offsetWidth||220, th = tooltip.offsetHeight||340;
    const maxH = Math.max(220, window.innerHeight - 16);
    const finalH = Math.min(Math.max(220, th), maxH);
    tooltip.style.height = finalH + 'px';
    const th2 = tooltip.offsetHeight || finalH;
    let left = r.right+12, top = r.top;
    if (left+tw>window.innerWidth-8) left = r.left-tw-12;
    if (top+th2>window.innerHeight-8) top = window.innerHeight-th2-8;
    tooltip.style.left = Math.max(8,left)+'px';
    tooltip.style.top  = Math.max(8,top)+'px';
}

function hideItemTooltip() { const t=document.getElementById('item-tooltip'); if(t) t.classList.add('hidden'); }
function closeItemTooltip() { hideItemTooltip(); }

function withCurrentTarget(event, el) {
    return {
        ...event,
        currentTarget: el,
        target: event?.target || el
    };
}

function hoverItemTooltip(itemId, el, event) {
    // Tooltips should not trigger on leaderboard rows (they can include nested elements that
    // accidentally carry legacy data attributes from other UI components).
    if (el?.closest?.('#leaderboard-list')) return;
    showItemTooltip(withCurrentTarget(event, el), itemId);
}

function openItemTooltip(itemId, el, event) {
    if (el?.closest?.('#leaderboard-list')) return;
    showItemTooltip(withCurrentTarget(event, el), itemId);
}

function hoverEqTooltip(el, event) {
    if (!el?.dataset?.item) return;
    if (el?.closest?.('#leaderboard-list')) return;
    showEqTooltip(withCurrentTarget(event, el), el.dataset.item);
}
function hoverElemTooltip(el, event) {
    if (!el?.dataset?.elem) return;
    let d;
    try { d = JSON.parse(el.dataset.elem); } catch { return; }
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    const elEmoji = d.element === 'pyro' ? '🔥' : d.element === 'water' ? '💧' : d.element === 'wind' ? '🌪️' : '⚡';
    tooltip.innerHTML = `
        <div class="tt-preview"><img src="/images/assets/elemental.png" alt="Elemental" style="width:148px;height:148px;object-fit:contain"></div>
        <div class="tt-body">
            <div class="tt-name" style="color:#a855f7">${escHtml(d.name)}</div>
            <div class="tt-meta">${elEmoji} ${d.element} · Lv.${d.level}</div>
            <div class="tt-stats">
                <div class="tt-stat"><span class="tt-stat-name">${statLabelHtml('strength')}</span><span class="tt-stat-val">${d.str}</span></div>
                <div class="tt-stat"><span class="tt-stat-name">${statLabelHtml('defense')}</span><span class="tt-stat-val">${d.def}</span></div>
                <div class="tt-stat"><span class="tt-stat-name">${statLabelHtml('magic')}</span><span class="tt-stat-val">${d.mag}</span></div>
                <div class="tt-stat"><span class="tt-stat-name">${statLabelHtml('vitality')}</span><span class="tt-stat-val">${d.vit}</span></div>
            </div>
        </div>`;
    tooltip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    tooltip.style.left = '-9999px'; tooltip.style.top = '-9999px';
    const tw = tooltip.offsetWidth || 220;
    let left = r.right + 12, top = r.top;
    if (left + tw > window.innerWidth - 8) left = r.left - tw - 12;
    if (top + tooltip.offsetHeight > window.innerHeight - 8) top = window.innerHeight - tooltip.offsetHeight - 8;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';
}

function hoverShopItemTooltip(el, event) {
    if (!el?.dataset?.shopitem) return;
    showShopItemTooltip(withCurrentTarget(event, el), el.dataset.shopitem);
}

function openShopItemTooltip(el, event) {
    if (!el?.dataset?.shopitem) return;
    showShopItemTooltip(withCurrentTarget(event, el), el.dataset.shopitem);
}

function hoverForgeItemTooltip(el, event) {
    if (!el?.dataset?.forgeitem) return;
    showForgeItemTooltip(withCurrentTarget(event, el), el.dataset.forgeitem);
}

function showItemTooltip(event, itemId) {
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    const info = window._invGearData?.[itemId];
    if (!info) return;
    const d = info.item_data, eq = info.equippedInSlot, isEquipped = info.equipped;

    // NORMALIZE JEWELRY SLOT - rings and amulets are the same slot
    let itemSlot = d.slot;
    let equippedItem = eq;

    if (itemSlot === 'ring' || itemSlot === 'amulet') {
        itemSlot = 'jewelry';
        // For equipped comparison, check both ring and amulet slots
        if (!equippedItem && character?.equipped) {
            equippedItem = character.equipped.ring || character.equipped.amulet;
        }
    }

    const allStats = new Set([...Object.keys(d.stats||{}),...Object.keys(equippedItem?.stats||{})].filter(k=>!k.includes('type')));
    const qColor = {legendary:'#ffd700',epic:'#e67e22',rare:'#9b59b6',common:'rgba(255,255,255,0.5)'}[d.quality||'common'];
    const displayName = getDisplayItemName(d, info.upgrade_level || 0);
    const displayDesc = getCanonicalItemDesc(d.desc);
    const imgSrc = d.img || (d.name && !d.consumable ? getAssetImagePath(d.name) : null);

    let statsHtml = '';
    for (const stat of allStats) {
        if (stat === 'elem_dmg' || stat === 'elem_dmg_type' || stat === 'elem_resist') continue;
        const nv = d.stats?.[stat]||0, ov = equippedItem?.stats?.[stat]||0, diff = nv - ov;
        const dc = diff>0?'#2ecc71':diff<0?'#e74c3c':'rgba(255,255,255,0.3)';
        const ds = diff>0?'▲'+diff:diff<0?'▼'+Math.abs(diff):'';
        const label = statLabelHtml(stat);
        statsHtml += `<div class="tt-stat"><span class="tt-stat-name">${label}</span><span class="tt-stat-val">${nv}</span>${equippedItem && !isEquipped && ds ? `<span style="font-size:0.68rem;color:${dc}">${ds}</span>` : ''}</div>`;
    }

    const classWarn = !isWeaponSuitedForClass(d, character?.class) ? CLASS_WARN_HTML : '';
    // Calculate sell price with premium discounts
    const activePrem = character?.premium_features || {};
    const hasVaultKeeper = !!activePrem.vault_keeper;
    const hasApprentice = !!activePrem.apprentice;
    const merchantPrince = hasVaultKeeper && hasApprentice;
    const sellPrice = getInventorySellPrice(d);
    const sn = (d.name||'').replace(/'/g,"\\'");

    tooltip.innerHTML = `
        <div class="tt-preview">
            <button class="tt-close" id="tt-close-btn" ${actionAttrs('closeItemTooltip')}>✕</button>
            ${imgSrc
        ?`<img src="${imgSrc}" data-error-hide="true" data-error-next-display="block"><span class="tt-preview-emoji" style="display:none">${d.emoji||'📦'}</span>`
        :`<span class="tt-preview-emoji">${d.emoji||'📦'}</span>`}
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${displayName}</div>
            <div class="tt-meta">${capitalize(itemSlot||'')}${d.quality&&d.quality!=='common'?' · <span style="color:'+qColor+'">'+d.quality+'</span>':''}</div>
            ${displayDesc?`<div class="tt-desc">${displayDesc}</div>`:''}
            <div class="tt-stats">${statsHtml||`<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>`}</div>
            ${classWarn}
            ${equippedItem && !isEquipped ? `<div class="tt-vs">vs equipped: <strong>${equippedItem.name}</strong></div>` : ''}
        </div>
        <div class="tt-actions">
            ${isEquipped
        ?`<button class="tt-btn tt-btn-secondary" ${actionAttrs('unequipSlot', d.slot)}>Unequip</button>`
        :`<button class="tt-btn tt-btn-primary" ${actionAttrs('equipItem', itemId)}>Equip</button>`}
            <button class="tt-btn tt-btn-danger" ${actionAttrs('sellItem', itemId, d.name || '', sellPrice)} ${isEquipped?'disabled':''}>
                Sell ${sellPrice}g ${merchantPrince ? '(40%)' : '(30%)'}
            </button>
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

function showEqTooltip(event, itemJson) {
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    let item; try { item = typeof itemJson==='string'?JSON.parse(itemJson):itemJson; } catch { return; }
    const qColor = {legendary:'#ffd700',epic:'#e67e22',rare:'#9b59b6',common:'rgba(255,255,255,0.5)'}[item.quality||'common'];
    const imgSrc = item.img || (item.name ? getAssetImagePath(item.name) : null);
    const displayName = getDisplayItemName(item, item.upgrade_level || 0);
    const displayDesc = getDisplayItemDesc(item);

    const classWarn = !isWeaponSuitedForClass(item, character?.class) ? CLASS_WARN_HTML : '';
    let statsHtml = Object.entries(item.stats||{})
        .filter(([k]) => k !== 'elem_dmg' && k !== 'elem_dmg_type' && k !== 'elem_resist')
        .filter(([,v]) => typeof v === 'number' && v !== 0)
        .map(([k,v]) => {
            const label = statLabelHtml(k);
            const total = v + (item.wp_stats?.[k] || 0);
            return `<div class="tt-stat"><span class="tt-stat-name">${label}</span><span class="tt-stat-val" style="color:${total>0?'#2ecc71':'#e74c3c'}">${total>0?'+':''}${total}</span></div>`;
        }).join('');

    tooltip.innerHTML = `
        <div class="tt-preview">
            ${imgSrc?`<img src="${imgSrc}" data-error-hide="true" data-error-next-display="block"><span class="tt-preview-emoji" style="display:none">${item.emoji||'📦'}</span>`:`<span class="tt-preview-emoji">${item.emoji||'📦'}</span>`}
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${displayName}</div>
            <div class="tt-meta">${capitalize(item.slot||'item')}${item.quality&&item.quality!=='common'?` · <span style="color:${qColor}">${item.quality}</span>`:''}</div>
            ${displayDesc?`<div class="tt-desc">${displayDesc}</div>`:''}
            <div class="tt-stats">${statsHtml||'<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>'}</div>
            ${classWarn}
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

function showForgeItemTooltip(event, itemJson) {
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;

    let item;
    try {
        item = typeof itemJson === 'string' ? JSON.parse(itemJson) : itemJson;
    } catch {
        return;
    }

    const qColor = {legendary:'#ffd700',rare:'#9b59b6',epic:'#3498db',common:'rgba(255,255,255,0.5)'}[item.quality||'common'];
    const imgSrc = item.img || (item.name ? getAssetImagePath(item.name) : null);

    const classWarn = !isWeaponSuitedForClass(item, character?.class) ? CLASS_WARN_HTML : '';

    let equippedItem = null;
    if (character?.equipped) {
        if (item.slot === 'ring' || item.slot === 'amulet') equippedItem = character.equipped.ring || character.equipped.amulet || null;
        else equippedItem = character.equipped[item.slot] || null;
    }

    const allStats = new Set([
        ...Object.keys(item.stats || {}),
        ...Object.keys(equippedItem?.stats || {})
    ].filter(k => !k.includes('type')));

    const statsHtml = Array.from(allStats)
        .filter(stat => stat !== 'elem_dmg' && stat !== 'elem_dmg_type' && stat !== 'elem_resist')
        .map(stat => {
            const nv = item.stats?.[stat] || 0;
            const ov = equippedItem?.stats?.[stat] || 0;
            const diff = nv - ov;
            const dc = diff > 0 ? '#2ecc71' : diff < 0 ? '#e74c3c' : 'rgba(255,255,255,0.3)';
            const ds = diff > 0 ? `▲${diff}` : diff < 0 ? `▼${Math.abs(diff)}` : '';
        const label = statLabelHtml(stat);
            return `<div class="tt-stat"><span class="tt-stat-name">${label}</span><span class="tt-stat-val">${nv > 0 ? '+' : ''}${nv}</span>${equippedItem && ds ? `<span style="font-size:0.68rem;color:${dc}">${ds}</span>` : ''}</div>`;
        }).join('');

    const compText = item.components
        ? Object.entries(item.components).map(([comp, qty]) => `${qty}x ${comp.replace(/_/g, ' ')}`).join(', ')
        : '';

    tooltip.innerHTML = `
        <div class="tt-preview">
            ${imgSrc ? `<img src="${imgSrc}" data-error-hide="true" data-error-next-display="block"><span class="tt-preview-emoji" style="display:none">${item.emoji||'📦'}</span>` : `<span class="tt-preview-emoji">${item.emoji||'📦'}</span>`}
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${item.name || ''}</div>
            <div class="tt-meta">${capitalize(item.slot||'item')}${item.quality&&item.quality!=='common'?` · <span style="color:${qColor}">${item.quality}</span>`:''}${item.level?` · Lv.${item.level}`:''}</div>
            ${item.desc?`<div class="tt-desc">${item.desc}</div>`:''}
            <div class="tt-stats">${statsHtml || '<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>'}</div>
            ${classWarn}
            ${equippedItem ? `<div class="tt-vs">vs equipped: <strong>${equippedItem.name}</strong></div>` : ''}
            ${compText ? `<div class="tt-vs">Components: <strong>${compText}</strong></div>` : ''}
            ${item.goldCost ? `<div class="tt-price" style="margin-top:8px;font-weight:700;color:var(--gold)">Craft Cost: 💰 ${Number(item.goldCost).toLocaleString()}</div>` : ''}
        </div>`;

    tooltip.classList.remove('hidden');
    const r = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    const tw = tooltip.offsetWidth || 220;
    const th = tooltip.offsetHeight || 340;
    let left = r.right + 12;
    let top = r.top;
    if (left + tw > window.innerWidth - 8) left = r.left - tw - 12;
    if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';
}
// ============================================
// LOOT BOX MODAL SYSTEM WITH IMAGE SUPPORT
// ============================================

// Global modal state
let lootboxModalState = {
    isOpen: false,
    skipRequested: false,
    currentQueue: [],
    currentIndex: 0,
    revealTimer: null,
    currentResult: null,
    currentBoxName: '',
    onCloseCallback: null
};

// Create modal HTML dynamically and inject into body
function createLootboxModal() {
    // Check if modal already exists
    if (document.getElementById('lootbox-exclusive-modal')) return;

    const modalHTML = `
        <div id="lootbox-exclusive-modal" class="lootbox-modal-overlay">
            <div class="lootbox-modal-container">
                <div class="lootbox-modal-header">
                    <h3>🎁 OPENING LOOTBOX</h3>
                    <button id="lootbox-skip-all-btn" class="lootbox-skip-btn">⏩ SKIP ALL</button>
                </div>
                <div id="lootbox-stage-content" class="lootbox-stage">
                    <div class="lootbox-loader-spinner">
                        <div class="lootbox-spinner"></div>
                        <p>Opening treasure...</p>
                    </div>
                </div>
                <div class="lootbox-modal-footer">
                    <button id="lootbox-close-btn" class="lootbox-close-btn" style="display: none;">✨ CLOSE ✨</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add modal styles if not already present
    if (!document.getElementById('lootbox-modal-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'lootbox-modal-styles';
        styleSheet.textContent = `
            /* LOOTBOX MODAL EXCLUSIVE STYLES - No collision with existing CSS */
            .lootbox-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.92);
                backdrop-filter: blur(16px);
                z-index: 99999;
                display: flex;
                justify-content: center;
                align-items: center;
                visibility: hidden;
                opacity: 0;
                transition: visibility 0.2s, opacity 0.3s ease-out;
                font-family: 'Segoe UI', 'Poppins', system-ui, sans-serif;
            }
            
            .lootbox-modal-overlay.active {
                visibility: visible;
                opacity: 1;
            }
            
            .lootbox-modal-container {
                background: linear-gradient(145deg, #1a1f2e, #0c0f1a);
                width: 92%;
                max-width: 580px;
                border-radius: 56px;
                border: 1px solid rgba(255, 200, 80, 0.4);
                box-shadow: 0 30px 60px rgba(0,0,0,0.8), 0 0 0 2px rgba(255,200,100,0.15) inset;
                overflow: hidden;
                transform: scale(0.92);
                transition: transform 0.3s cubic-bezier(0.2, 0.95, 0.4, 1.1);
            }
            
            .active .lootbox-modal-container {
                transform: scale(1);
            }
            
            .lootbox-modal-header {
                padding: 20px 24px 12px 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(255, 220, 100, 0.25);
                background: rgba(0,0,0,0.2);
            }
            
            .lootbox-modal-header h3 {
                margin: 0;
                font-size: 1.6rem;
                background: linear-gradient(135deg, #FFE6B0, #FFB347);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                letter-spacing: 1px;
            }
            
            .lootbox-skip-btn {
                background: rgba(40, 35, 55, 0.95);
                border: 1px solid #ffb347aa;
                color: #ffdd99;
                padding: 6px 16px;
                border-radius: 60px;
                font-weight: bold;
                cursor: pointer;
                font-size: 0.8rem;
                transition: all 0.2s;
                backdrop-filter: blur(4px);
            }
            
            .lootbox-skip-btn:hover {
                background: #ffb347;
                color: #1a1a2a;
                border-color: #fff0c0;
                transform: scale(0.96);
            }
            
            .lootbox-stage {
                min-height: 420px;
                padding: 28px 20px 32px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 16px;
            }
            
            /* Individual item reveal card with awesome pop effect */
            .lootbox-item-card {
                background: linear-gradient(135deg, rgba(20, 25, 45, 0.95), rgba(10, 12, 25, 0.98));
                backdrop-filter: blur(12px);
                width: 100%;
                border-radius: 32px;
                padding: 18px 22px;
                display: flex;
                align-items: center;
                gap: 20px;
                border-left: 6px solid #ffcc44;
                border-right: 1px solid rgba(255,200,100,0.3);
                transform: translateX(-40px) scale(0.85);
                opacity: 0;
                animation: lootboxPopIn 0.5s cubic-bezier(0.34, 1.3, 0.55, 1) forwards;
                box-shadow: 0 12px 28px rgba(0,0,0,0.5), 0 0 15px rgba(255,200,0,0.2);
                position: relative;
                overflow: hidden;
                isolation: isolate;
            }

            .lootbox-item-card::before,
            .lootbox-item-card::after {
                content: "";
                position: absolute;
                pointer-events: none;
            }

            .lootbox-item-card::before {
                width: 960px;
                height: 960px;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%) scale(0.92);
                border-radius: 50%;
                opacity: 0;
                filter: blur(14px);
                animation: lootboxRarityRotate 5.5s linear infinite;
                transition: opacity 0.25s ease;
            }

            .lootbox-item-card::after {
                inset: 0;
                opacity: 0;
                background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent 34%, transparent 68%, rgba(255,255,255,0.08));
                transition: opacity 0.25s ease;
            }

            .lootbox-item-card > * {
                position: relative;
                z-index: 1;
            }
            
            @keyframes lootboxPopIn {
                0% {
                    opacity: 0;
                    transform: translateX(-45px) scale(0.7);
                }
                50% {
                    opacity: 1;
                    transform: translateX(6px) scale(1.02);
                }
                100% {
                    opacity: 1;
                    transform: translateX(0) scale(1);
                }
            }

            @keyframes lootboxRarityRotate {
                0% { transform: translate(-50%, -50%) rotate(0deg) scale(0.92); }
                100% { transform: translate(-50%, -50%) rotate(360deg) scale(0.92); }
            }

            .lootbox-item-card.lootbox-rarity-rare {
                border-left-color: #9b59b6;
                border-right-color: rgba(155,89,182,0.42);
                box-shadow: 0 12px 28px rgba(0,0,0,0.5), 0 0 28px rgba(155,89,182,0.34);
            }

            .lootbox-item-card.lootbox-rarity-rare::before,
            .lootbox-item-card.lootbox-rarity-rare::after {
                opacity: 1;
            }

            .lootbox-item-card.lootbox-rarity-rare::before {
                background:
                    radial-gradient(circle at 50% 18%, rgba(214,170,246,0.24) 0%, rgba(214,170,246,0.12) 10%, rgba(214,170,246,0) 24%),
                    radial-gradient(circle at 82% 50%, rgba(155,89,182,0.24) 0%, rgba(155,89,182,0.12) 10%, rgba(155,89,182,0) 24%),
                    radial-gradient(circle at 50% 82%, rgba(214,170,246,0.2) 0%, rgba(214,170,246,0.1) 10%, rgba(214,170,246,0) 24%),
                    radial-gradient(circle at 18% 50%, rgba(155,89,182,0.2) 0%, rgba(155,89,182,0.1) 10%, rgba(155,89,182,0) 24%),
                    radial-gradient(circle at center, rgba(155,89,182,0.22) 0%, rgba(155,89,182,0.1) 22%, rgba(155,89,182,0.04) 42%, rgba(155,89,182,0) 68%);
            }

            .lootbox-item-card.lootbox-rarity-epic {
                border-left-color: #e67e22;
                border-right-color: rgba(230,126,34,0.42);
                box-shadow: 0 12px 28px rgba(0,0,0,0.5), 0 0 30px rgba(230,126,34,0.36);
            }

            .lootbox-item-card.lootbox-rarity-epic::before,
            .lootbox-item-card.lootbox-rarity-epic::after {
                opacity: 1;
            }

            .lootbox-item-card.lootbox-rarity-epic::before {
                background:
                    radial-gradient(circle at 50% 18%, rgba(255,187,108,0.26) 0%, rgba(255,187,108,0.13) 10%, rgba(255,187,108,0) 24%),
                    radial-gradient(circle at 82% 50%, rgba(230,126,34,0.26) 0%, rgba(230,126,34,0.13) 10%, rgba(230,126,34,0) 24%),
                    radial-gradient(circle at 50% 82%, rgba(255,187,108,0.22) 0%, rgba(255,187,108,0.11) 10%, rgba(255,187,108,0) 24%),
                    radial-gradient(circle at 18% 50%, rgba(230,126,34,0.22) 0%, rgba(230,126,34,0.11) 10%, rgba(230,126,34,0) 24%),
                    radial-gradient(circle at center, rgba(230,126,34,0.24) 0%, rgba(230,126,34,0.11) 22%, rgba(230,126,34,0.04) 42%, rgba(230,126,34,0) 68%);
            }

            .lootbox-item-card.lootbox-rarity-legendary {
                border-left-color: #f1c40f;
                border-right-color: rgba(241,196,15,0.46);
                box-shadow: 0 14px 32px rgba(0,0,0,0.55), 0 0 34px rgba(241,196,15,0.42);
            }

            .lootbox-item-card.lootbox-rarity-legendary::before,
            .lootbox-item-card.lootbox-rarity-legendary::after {
                opacity: 1;
            }

            .lootbox-item-card.lootbox-rarity-legendary::before {
                background:
                    radial-gradient(circle at 50% 18%, rgba(255,236,143,0.28) 0%, rgba(255,236,143,0.14) 10%, rgba(255,236,143,0) 24%),
                    radial-gradient(circle at 82% 50%, rgba(241,196,15,0.28) 0%, rgba(241,196,15,0.14) 10%, rgba(241,196,15,0) 24%),
                    radial-gradient(circle at 50% 82%, rgba(255,236,143,0.24) 0%, rgba(255,236,143,0.12) 10%, rgba(255,236,143,0) 24%),
                    radial-gradient(circle at 18% 50%, rgba(241,196,15,0.24) 0%, rgba(241,196,15,0.12) 10%, rgba(241,196,15,0) 24%),
                    radial-gradient(circle at center, rgba(241,196,15,0.26) 0%, rgba(241,196,15,0.12) 22%, rgba(241,196,15,0.05) 42%, rgba(241,196,15,0) 68%);
            }
            
            .lootbox-item-image {
                width: 64px;
                height: 64px;
                object-fit: contain;
                filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
                background: rgba(0,0,0,0.3);
                border-radius: 20px;
                padding: 6px;
            }

            .lootbox-item-card.lootbox-rarity-rare .lootbox-item-image {
                filter: drop-shadow(0 0 14px rgba(155,89,182,0.62)) drop-shadow(0 4px 8px rgba(0,0,0,0.5));
            }

            .lootbox-item-card.lootbox-rarity-epic .lootbox-item-image {
                filter: drop-shadow(0 0 16px rgba(230,126,34,0.68)) drop-shadow(0 4px 8px rgba(0,0,0,0.5));
            }

            .lootbox-item-card.lootbox-rarity-legendary .lootbox-item-image {
                filter: drop-shadow(0 0 18px rgba(241,196,15,0.74)) drop-shadow(0 4px 8px rgba(0,0,0,0.5));
            }
            
            .lootbox-item-info {
                flex: 1;
            }
            
            .lootbox-item-title {
                font-size: 1.35rem;
                font-weight: bold;
                color: #ffeaac;
                letter-spacing: 0.5px;
            }
            
            .lootbox-item-sub {
                font-size: 0.8rem;
                color: #a8b3e0;
                margin-top: 4px;
            }
            
            .lootbox-qty-pill {
                background: #ffcd7e30;
                padding: 6px 14px;
                border-radius: 60px;
                font-weight: bold;
                color: #ffdb8e;
                font-size: 1rem;
            }
            
            /* Summary view (skip mode) */
            .lootbox-summary-panel {
                background: rgba(0, 0, 0, 0.6);
                border-radius: 28px;
                padding: 16px;
                width: 100%;
                max-height: 380px;
                overflow-y: auto;
            }
            
            .lootbox-summary-header {
                text-align: center;
                margin-bottom: 18px;
                font-size: 1.2rem;
                color: #ffd966;
            }
            
            .lootbox-summary-row {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 12px;
                border-bottom: 1px solid rgba(255, 200, 80, 0.2);
                animation: lootboxFadeUp 0.2s ease;
            }
            
            @keyframes lootboxFadeUp {
                from { opacity: 0; transform: translateY(12px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .lootbox-summary-img {
                width: 48px;
                height: 48px;
                object-fit: contain;
                background: #1e1f2e;
                border-radius: 16px;
                padding: 6px;
            }
            
            .lootbox-loader-spinner {
                text-align: center;
                color: #ffdfa5;
            }
            
            .lootbox-spinner {
                width: 48px;
                height: 48px;
                border: 4px solid rgba(255,200,100,0.2);
                border-top: 4px solid #ffb347;
                border-radius: 50%;
                margin: 20px auto;
                animation: lootboxSpin 0.8s linear infinite;
            }
            
            @keyframes lootboxSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .lootbox-modal-footer {
                padding: 16px 24px 24px;
                display: flex;
                justify-content: flex-end;
                border-top: 1px solid rgba(255,200,100,0.2);
            }
            
            .lootbox-close-btn {
                background: linear-gradient(135deg, #e4a022, #b46f10);
                border: none;
                padding: 10px 28px;
                border-radius: 60px;
                font-weight: bold;
                font-size: 1rem;
                color: white;
                cursor: pointer;
                transition: 0.15s;
            }
            
            .lootbox-close-btn:hover {
                transform: scale(0.97);
                background: #ffb347;
                box-shadow: 0 0 12px rgba(255,180,70,0.5);
            }
            
            .lootbox-resource-badge {
                background: #2a2e44;
                border-radius: 24px;
                padding: 8px 16px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin: 5px;
            }
            .lootbox-next-btn:hover, .lootbox-complete-btn:hover {
    transform: scale(0.98);
}
        `;
        document.head.appendChild(styleSheet);
    }
}

// Helper: Get item image path based on item name (converts "Steel Sword" -> "steel-sword.png")
function getItemImagePath(itemName) {
    if (!itemName) return '/images/assets/prize.png';
    // Convert to lowercase, replace spaces with hyphens, remove special chars
    let imageName = String(itemName).replace(/\s\+\d+$/, '').toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
    return `/assets/items/${imageName}.png`;
}

function getCanonicalItemName(itemName) {
    return String(itemName || '').replace(/\s\+\d+$/, '').trim();
}

function getDisplayItemName(itemLike, fallbackUpgradeLevel = 0) {
    const rawName = typeof itemLike === 'string' ? itemLike : (itemLike?.name || '');
    const baseName = getCanonicalItemName(rawName);
    const upgradeLevel = Number(
        typeof itemLike === 'object'
            ? (itemLike?.upgradeLevel ?? itemLike?.upgrade_level ?? fallbackUpgradeLevel)
            : fallbackUpgradeLevel
    ) || 0;
    return upgradeLevel > 0 ? `${baseName} +${upgradeLevel}` : baseName;
}

const ITEM_DESC_FALLBACKS = {
    'Spiteforged Trident': 'Three bladed vows of hatred, quenched in black surf and driven to pierce pride, plate, and prayer alike.',
    'Carapace of Last Refrains': 'A war-shell plated with the echoes of final curses, hardening every grudge into stubborn, iron resolve.',
    'Crown of Scornful Gaze': 'Its sleepless eye judges every challenger first, weighing them only for the manner of their humiliation.',
    'Bulwark of Denied Mercy': 'A spitebound wall raised by warriors who survived by refusing mercy, surrender, and clean endings.',
    'Treads of the Unforgiving': 'Each step lands like a sentence passed, hounding the fleeing until regret is the only ground left beneath them.'
};

function getCanonicalItemDesc(desc) {
    const cleaned = String(desc || '')
        .replace(/^undefined\s*/i, '')
        .replace(/\s*\(Crafted at level \d+\)\s*$/i, '')
        .replace(/\s*\[Upgraded \+\d+ using [^\]]+\]\s*$/i, '')
        .trim();
    return cleaned;
}

function getDisplayItemDesc(itemLike) {
    const directDesc = getCanonicalItemDesc(typeof itemLike === 'string' ? '' : itemLike?.desc);
    if (directDesc) return directDesc;
    const baseName = getCanonicalItemName(typeof itemLike === 'string' ? itemLike : (itemLike?.name || ''));
    return ITEM_DESC_FALLBACKS[baseName] || '';
}

// Helper: Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Render single item with image and popup effect
function renderSingleLootboxItem(item) {
    const itemName = item.name || 'Unknown Item';
    const qtyText = (item.qty && item.qty > 1) ? ` x${item.qty}` : '';
    const imagePath = getAssetImagePath(item.name) || `/images/assets/${item.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    const descText = item.desc || (item.type === 'gold' ? `+${item.amount} Gold` : (item.type === 'gem' ? `+${item.amount} Gems` : '✨ Obtained!'));
    const quality = (item.quality || 'common').toLowerCase();
    const rarityClass = ['rare', 'epic', 'legendary'].includes(quality) ? ` lootbox-rarity-${quality}` : '';

    return `
        <div class="lootbox-item-card${rarityClass}">
            <img class="lootbox-item-image" src="${imagePath}" alt="${escapeHtml(itemName)}" data-error-src="/images/assets/prize.png">
            <div class="lootbox-item-info">
                <div class="lootbox-item-title">${escapeHtml(itemName)}${qtyText}</div>
                <div class="lootbox-item-sub">${escapeHtml(descText)}</div>
            </div>
            ${qtyText ? `<div class="lootbox-qty-pill">${qtyText}</div>` : ''}
        </div>
    `;
}

function renderLootboxSummary(result, boxName) {
    const goldAmount = result.goldFound || 0;
    const gemsAmount = result.gemsFound || 0;
    const lootItems = result.loot || [];

    let summaryHtml = `
        <div class="lootbox-summary-panel">
            <div class="lootbox-summary-header">
                🎉 ${escapeHtml(boxName)} - UNBOXED! 🎉
            </div>
    `;

    if (goldAmount > 0) {
        summaryHtml += `
            <div class="lootbox-summary-row">
                <img class="lootbox-summary-img" src="/images/assets/gold-coin.png" data-error-src="/images/assets/prize.png" alt="Gold">
                <div><strong>${goldAmount} Gold</strong></div>
            </div>
        `;
    }

    if (gemsAmount > 0) {
        summaryHtml += `
            <div class="lootbox-summary-row">
                <img class="lootbox-summary-img" src="/images/assets/gem.png" data-error-src="/images/assets/prize.png" alt="Gems">
                <div><strong>${gemsAmount} Gems</strong></div>
            </div>
        `;
    }

    for (const item of lootItems) {
        const imagePath = item.img || getAssetImagePath(item.name) || `/images/assets/${item.name.toLowerCase().replace(/\s+/g, '-')}.png`;

        summaryHtml += `
            <div class="lootbox-summary-row">
                <img class="lootbox-summary-img" src="${imagePath}" data-error-src="/images/assets/prize.png" alt="${escapeHtml(item.name)}">
                <div>
                    <strong>${escapeHtml(item.name)}</strong> ${item.qty ? `x${item.qty}` : ''}
                </div>
            </div>
        `;
    }

    summaryHtml += `</div>`;
    return summaryHtml;
}

// Stop any ongoing reveal loop
function stopLootboxReveal() {
    if (lootboxModalState.revealTimer) {
        clearTimeout(lootboxModalState.revealTimer);
        lootboxModalState.revealTimer = null;
    }
}

// Sequential reveal with awesome popup effects
function startSequentialReveal(result, boxName, onComplete) {
    const stage = document.getElementById('lootbox-stage-content');
    if (!stage) return;

    // Build queue: gold, gems, then items
    const queue = [];
    if (result.goldFound > 0) {
        queue.push({ type: 'gold', name: `${result.goldFound} Gold`, emoji: '💰', amount: result.goldFound, desc: `Found ${result.goldFound} gold!` });
    }
    if (result.gemsFound > 0) {
        queue.push({ type: 'gem', name: `${result.gemsFound} Gems`, emoji: '💎', amount: result.gemsFound, desc: `Found ${result.gemsFound} gems!` });
    }
    for (const lootItem of result.loot) {
        queue.push({
            name: lootItem.name,
            qty: lootItem.qty || 1,
            desc: lootItem.desc || `You obtained ${lootItem.name}`,
            type: 'item',
            quality: lootItem.quality || 'common'
        });
    }

    lootboxModalState.currentQueue = queue;
    lootboxModalState.currentIndex = 0;
    lootboxModalState.skipRequested = false;
    lootboxModalState.currentResult = result;
    lootboxModalState.currentBoxName = boxName;

    if (queue.length === 0) {
        stage.innerHTML = `<div class="lootbox-loader-spinner"><p>🎁 The box seems empty...</p></div>`;
        if (onComplete) onComplete();
        return;
    }

    function showNextItem() {
        if (lootboxModalState.skipRequested || lootboxModalState.currentIndex >= lootboxModalState.currentQueue.length) {
            if (lootboxModalState.skipRequested) {
                // Skip mode: show summary with all items
                stage.innerHTML = renderLootboxSummary(result, boxName);
            } else {
                // Completed all items naturally
                stage.innerHTML += `<div style="text-align:center; margin-top:12px; color:#ffd966;">✨ All items collected! ✨</div>`;
            }
            if (onComplete) onComplete();
            return;
        }

        const item = lootboxModalState.currentQueue[lootboxModalState.currentIndex];
        stage.innerHTML = renderSingleLootboxItem(item);
        lootboxModalState.currentIndex++;

        if (!lootboxModalState.skipRequested && lootboxModalState.currentIndex < lootboxModalState.currentQueue.length) {
            lootboxModalState.revealTimer = setTimeout(showNextItem, 700);
        } else if (!lootboxModalState.skipRequested && lootboxModalState.currentIndex >= lootboxModalState.currentQueue.length) {
            lootboxModalState.revealTimer = setTimeout(() => {
                if (!lootboxModalState.skipRequested) {
                    stage.innerHTML += `<div style="text-align:center; margin-top:12px; color:#ffd966;">✅ Loot secured!</div>`;
                    if (onComplete) onComplete();
                }
            }, 500);
        }
    }

    showNextItem();
}


// ============================================
// UPDATED RENDER INVENTORY FUNCTION
// (Modified to work with the new lootbox system)
// ============================================


// ============================================
// EXPOSE FUNCTIONS GLOBALLY
// ============================================
window.openLootBox = openLootBox;
window.getItemImagePath = getItemImagePath;

// Call createModal on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createLootboxModal);
} else {
    createLootboxModal();
}
// ── OPEN LOOT BOX WITH MANUAL CLICK PROGRESSION ───────────────────────────────
async function openLootBox(itemId, itemName) {
    const shouldOpen = await openGameConfirmDialog({
        title: 'Open Loot Box',
        message: `<div style="font-size:0.95rem;line-height:1.6;color:var(--text-bright)">Open <strong>${escHtml(itemName)}</strong> now?</div><div style="margin-top:8px;font-size:0.8rem;color:var(--text-dim)">The rewards will be revealed in the loot box animation.</div>`,
        confirmLabel: 'Open',
        cancelLabel: 'Cancel'
    });
    if (!shouldOpen) return;

    // Create modal if not exists
    if (!document.getElementById('lootbox-exclusive-modal')) {
        createLootboxModal();
    }

    const modal = document.getElementById('lootbox-exclusive-modal');
    const stage = document.getElementById('lootbox-stage-content');
    const skipBtn = document.getElementById('lootbox-skip-all-btn');
    const closeBtn = document.getElementById('lootbox-close-btn');

    if (!modal) return;

    try {
        const result = await api('POST', `/game/lootbox/open/${itemId}`);

        if (result.success) {
            // Update character data
            if (result.goldFound > 0 && character) {
                character.gold = (character.gold || 0) + result.goldFound;
            }
            if (result.gemsFound > 0 && character) {
                character.gems = (character.gems || 0) + result.gemsFound;
            }

            // Build queue of items
            const queue = [];
            if (result.goldFound > 0) {
                queue.push({ type: 'gold', name: `${result.goldFound} Gold`, amount: result.goldFound, desc: `Found ${result.goldFound} gold!` });
            }
            if (result.gemsFound > 0) {
                queue.push({ type: 'gem', name: `${result.gemsFound} Gems`, amount: result.gemsFound, desc: `Found ${result.gemsFound} gems!` });
            }
            for (const lootItem of result.loot || []) {
                queue.push({
                    name: lootItem.name,
                    qty: lootItem.qty || 1,
                    desc: lootItem.desc || `You obtained ${lootItem.name}`,
                    type: 'item',
                    quality: lootItem.quality || 'common'
                });
            }

            let currentIndex = 0;
            let skipRequested = false;
            let currentItemCallback = null;

            // Open modal
            modal.classList.add('active');
            if (closeBtn) closeBtn.style.display = 'none';
            if (skipBtn) skipBtn.style.display = 'inline-flex';

            // Clear any existing content
            stage.innerHTML = '';

            // Function to show summary (skip or complete)
            function showSummary() {
                stage.innerHTML = renderLootboxSummary(result, itemName);
                const liveSkipBtn = document.getElementById('lootbox-skip-all-btn');
                const liveCloseBtn = document.getElementById('lootbox-close-btn');
                if (liveSkipBtn) liveSkipBtn.style.display = 'none';
                if (liveCloseBtn) liveCloseBtn.style.display = 'block';
            }

            // Function to show current item
            function showCurrentItem() {
                if (skipRequested) {
                    showSummary();
                    return;
                }

                if (currentIndex >= queue.length) {
                    showSummary();
                    return;
                }

                const item = queue[currentIndex];
                const isLastItem = (currentIndex === queue.length - 1);

                // Create item display with button
                const itemHtml = renderSingleLootboxItem(item);
                const buttonText = isLastItem ? '✨ COMPLETE ✨' : '▶ NEXT ITEM ▶';

                stage.innerHTML = `
                    <div style="width:100%">
                        ${itemHtml}
                        <div style="display:flex; justify-content:center; margin-top:24px">
                            <button id="lootbox-action-btn" class="lootbox-action-btn" style="padding:12px 28px; background:linear-gradient(135deg,#e4a022,#b46f10); border:none; border-radius:60px; color:white; font-weight:bold; font-size:1rem; cursor:pointer; transition:transform 0.1s">${buttonText}</button>
                        </div>
                    </div>
                `;

                const actionBtn = document.getElementById('lootbox-action-btn');
                if (actionBtn) {
                    actionBtn.addEventListener('click', () => {
                        currentIndex++;
                        showCurrentItem();
                    }, { once: true });
                    actionBtn.addEventListener('mouseenter', () => { actionBtn.style.transform = 'scale(0.97)'; });
                    actionBtn.addEventListener('mouseleave', () => { actionBtn.style.transform = 'scale(1)'; });
                }
            }

            // Skip button handler
            const freshSkipBtn = skipBtn.cloneNode(true);
            skipBtn.replaceWith(freshSkipBtn);
            freshSkipBtn.addEventListener('click', () => {
                if (!skipRequested) {
                    skipRequested = true;
                    showSummary();
                }
            }, { once: true });

            // Close button handler (initially hidden, set up for later)
            const closeHandler = () => {
                modal.classList.remove('active');
                // Refresh inventory
                loadInventory();
                renderTopBar();
                renderCharacter();
            };
            const freshCloseBtn = closeBtn.cloneNode(true);
            closeBtn.replaceWith(freshCloseBtn);
            freshCloseBtn.addEventListener('click', closeHandler, { once: true });

            // Start showing first item
            showCurrentItem();

        } else {
            await openGameNoticeDialog({
                title: 'Loot Box Failed',
                message: `<div style="font-size:0.92rem;line-height:1.6;color:var(--text-bright)">Failed to open this loot box.</div><div style="margin-top:8px;color:var(--text-dim)">${escHtml(result.error || 'Unknown error')}</div>`,
                confirmLabel: 'Close'
            });
        }
    } catch (error) {
        console.error('Loot box error:', error);
        await openGameNoticeDialog({
            title: 'Loot Box Failed',
            message: `<div style="font-size:0.92rem;line-height:1.6;color:var(--text-bright)">Failed to open this loot box.</div><div style="margin-top:8px;color:var(--text-dim)">${escHtml(error.message || 'Unknown error')}</div>`,
            confirmLabel: 'Close'
        });
        if (modal) modal.classList.remove('active');
    }
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
    hideItemTooltip();
    const shouldSell = await openGameConfirmDialog({
        title: 'Sell Item',
        message: `<div style="font-size:0.95rem;line-height:1.6;color:var(--text-bright)">Sell <strong>${escHtml(name)}</strong> for <strong>${Number(price || 0).toLocaleString()} gold</strong>?</div><div style="margin-top:8px;font-size:0.8rem;color:var(--text-dim)">This action cannot be undone.</div>`,
        confirmLabel: 'Sell Item',
        cancelLabel: 'Keep Item',
        danger: true
    });
    if (!shouldSell) return;
    try {
        const d=await api('POST',`/game/sell/${invId}`);
        character=d.character;
        renderTopBar();
        hideItemTooltip();
        await loadInventory();
        showMsg('inv-msg',d.message);
    }
    catch(e) { showMsg('inv-msg',e.message,true); }
}

function toggleInvBulkMode(enabled, el) {
    if (typeof enabled === 'object' && enabled?.checked !== undefined) {
        enabled = enabled.checked;
    }
    invBulkMode = enabled;
    if (!enabled) invBulkSelected = {};
    loadInventory();
}

function toggleInvBulkSelect(invId, name, price, el) {
    const wasSelected = !!invBulkSelected[invId];
    if (wasSelected) {
        delete invBulkSelected[invId];
    } else {
        invBulkSelected[invId] = { name, price };
    }

    // Update clicked element visuals directly (no full reload)
    if (el && el.classList) {
        el.classList.toggle('inv-item-selected');
        const check = el.querySelector('.inv-bulk-check');
        if (check) {
            const isSelected = !wasSelected;
            check.style.background = isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.15)';
            check.style.borderColor = isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.3)';
            check.textContent = isSelected ? '✓' : '';
        }
    }

    // Update bulk bar text (count + total gold) without re-render
    const invContainer = el?.closest('#tab-inventory') || document.querySelector('#tab-inventory');
    if (invContainer) {
        const bulkBar = invContainer.querySelector('[data-bulk-bar]');
        if (bulkBar) {
            const countEl = bulkBar.querySelector('[data-bulk-count]');
            const sellBtn = bulkBar.querySelector('[data-action="sellBulkSelected"]');
            const selected = Object.keys(invBulkSelected);
            const hasSelection = selected.length > 0;
            if (countEl) {
                countEl.textContent = hasSelection ? `${selected.length} selected` : '';
                countEl.style.display = hasSelection ? 'inline' : 'none';
            }
            if (sellBtn) {
                if (hasSelection) {
                    const total = Object.values(invBulkSelected).reduce((s, i) => s + i.price, 0);
                    sellBtn.textContent = `Sell (${total.toLocaleString()}g)`;
                    sellBtn.style.display = 'inline-block';
                } else {
                    sellBtn.textContent = '';
                    sellBtn.style.display = 'none';
                }
            }
        }
    }
}

async function sellBulkSelected() {
    const ids = Object.keys(invBulkSelected);
    if (!ids.length) return;
    const total = Object.values(invBulkSelected).reduce((s, i) => s + i.price, 0);
    const shouldSell = await openGameConfirmDialog({
        title: 'Bulk Sell',
        message: `<div style="font-size:0.95rem;line-height:1.6;color:var(--text-bright)">Sell <strong>${ids.length}</strong> items for <strong>${total.toLocaleString()} gold</strong>?</div><div style="margin-top:8px;font-size:0.8rem;color:var(--text-dim)">This action cannot be undone.</div>`,
        confirmLabel: `Sell All (${total.toLocaleString()}g)`,
        cancelLabel: 'Cancel',
        danger: true
    });
    if (!shouldSell) return;
    try {
        const d = await api('POST', '/game/sell/bulk', { ids: ids.map(Number) });
        character = d.character;
        renderTopBar();
        hideItemTooltip();
        invBulkSelected = {};
        await loadInventory();
        showMsg('inv-msg', d.message);
    } catch (e) {
        showMsg('inv-msg', e.message, true);
    }
}

async function sellItemWithQty(invId, name, price, currentQty) {
    // Create a quantity selection dialog
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
    dialog.innerHTML = `
        <div style="font-size:1rem;font-weight:600;margin-bottom:12px">Sell ${escHtml(name)}</div>
        <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:16px">You have <strong>${currentQty}</strong> — price: <strong>${price}g</strong> each</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <button class="filter-btn sell-qty-opt" data-qty="1">1x</button>
            <button class="filter-btn sell-qty-opt" data-qty="10">10x</button>
            <button class="filter-btn sell-qty-opt" data-qty="100">100x</button>
            <button class="filter-btn sell-qty-opt" data-qty="${Math.min(currentQty, 1000)}">${Math.min(currentQty, 1000)}x</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
            <span style="font-size:0.85rem;color:var(--text-dim)">Custom:</span>
            <input type="number" id="sell-qty-input" min="1" max="${currentQty}" value="1" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg1);color:var(--text);font-size:0.9rem">
            <span style="font-size:0.8rem;color:var(--text-dim)">max ${currentQty}</span>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="filter-btn" id="sell-qty-cancel">Cancel</button>
            <button class="btn-primary danger" id="sell-qty-confirm" style="padding:8px 20px">Sell</button>
        </div>
    `;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const result = await new Promise(resolve => {
        const cleanup = () => { backdrop.remove(); };
        dialog.querySelectorAll('.sell-qty-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                const qty = Number(btn.dataset.qty);
                document.getElementById('sell-qty-input').value = qty;
            });
        });
        dialog.querySelector('#sell-qty-cancel').addEventListener('click', () => { cleanup(); resolve(null); });
        dialog.querySelector('#sell-qty-confirm').addEventListener('click', () => {
            const qty = Math.max(1, Math.min(currentQty, Number(document.getElementById('sell-qty-input').value) || 1));
            cleanup();
            resolve(qty);
        });
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) { cleanup(); resolve(null); }
        });
    });
    if (!result) return;
    try {
        const d = await api('POST', `/game/sell/${invId}`, { qty: result });
        character = d.character;
        renderTopBar();
        hideItemTooltip();
        await loadInventory();
        showMsg('inv-msg', `Sold ${result}x ${name} for ${(result * price).toLocaleString()} gold.`);
    } catch (e) {
        showMsg('inv-msg', e.message, true);
    }
}
async function useItem(invId, name) {
    try {
        const d=await api('POST',`/game/use/${invId}`);
        character=d.character;
        renderTopBar();
        renderCharacter();
        loadInventory();
        showMsg('inv-msg',d.message);
    }
    catch(e) {
        const msg = e?.message || 'Could not use this item.';
        if (/^Health potions are on cooldown\b/i.test(msg)) {
            await openGameNoticeDialog({
                title: 'Potion Cooldown',
                message: msg,
                confirmLabel: 'Close'
            });
            return;
        }
        showMsg('inv-msg', msg, true);
    }
}
async function useItemOnBeast(invId, name) {
    try {
        const d=await api('POST',`/game/use/${invId}`, { target: 'elemental' });
        character=d.character;
        renderTopBar();
        renderCharacter();
        loadInventory();
        showMsg('inv-msg', d.message);
    }
    catch(e) {
        const msg = e?.message || 'Could not use this item on your beast.';
        if (/Beast potion cooldown/i.test(msg)) {
            await openGameNoticeDialog({
                title: 'Beast Potion Cooldown',
                message: msg,
                confirmLabel: 'Close'
            });
            return;
        }
        showMsg('inv-msg', msg, true);
    }
}

// ── Shop ──────────────────────────────────────────────────────────────────
function loadShop() {
    if (!character) { api('GET','/game/character').then(c=>{character=c;renderShopContent();}).catch(()=>{}); }
    else renderShopContent();
}
function renderShopContent() {
    if (!character) return;
}

// ── Banner Event ──────────────────────────────────────────────────────────────
async function loadBannerEvent() {
    console.log('loadBannerEvent called');
    const content = document.getElementById('event-content');
    if (!content) return;

    content.innerHTML = '<div class="loading-spinner">Loading...</div>';

    try {
        const data = await api('GET', '/banner/current');

        if (!data.active) {
            content.innerHTML = `
                <div class="event-no-banner">
                    <div class="event-no-banner-icon">🎴</div>
                    <div class="event-no-banner-title">No Active Event</div>
                    <div class="event-no-banner-desc">Check back soon for limited time banners!</div>
                </div>
            `;
            return;
        }

        const { banner, stats } = data;
        if (!banner) {
            content.innerHTML = '<p style="color:red">Banner data missing</p>';
            return;
        }
        const oddsPct = (stats.currentOdds * 100).toFixed(1);
        const nextOddsPct = stats.nextOddsUp ? (stats.nextOddsUp * 100).toFixed(1) : null;
        const pityProgress = stats.pityCount ?? stats.effectivePulls ?? 0;
        const pityToGuarantee = 10 - pityProgress;

        content.innerHTML = `
            <div class="event-banner-card">
                <div class="event-banner-image" style="background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
                    ${banner.image ? `<img src="/images/banner/${banner.image}.png" style="width:200px;max-width:100%;margin-bottom:10px;">` : ''}
                    <div class="event-banner-name" style="font-size:1.4rem;font-weight:700;color:#f1c40f;margin-bottom:8px;">${escHtml(banner.name)}</div>
                    <div class="event-banner-timer" id="event-timer" style="font-size:0.9rem;color:rgba(255,255,255,0.6);"></div>
                </div>
                
                <div class="event-pity-card">
                    <div class="event-pity-header">
                        <span>Pity Counter</span>
                        <span>${pityProgress}/10 pulls</span>
                    </div>
                    <div class="event-pity-bar">
                        <div class="event-pity-fill" style="width:${Math.min(100, pityProgress * 10)}%"></div>
                    </div>
                    <div class="event-pity-odds">
                        <span>Current odds: <strong>${oddsPct}%</strong></span>
                        ${nextOddsPct ? `<span>Next pull: <strong>${nextOddsPct}%</strong></span>` : ''}
                    </div>
                </div>
                
                <div class="event-odds-table">
                    <div class="event-odds-row"><span>Pulls 1-5</span><span>0.1%</span></div>
                    <div class="event-odds-row"><span>Pull 6</span><span>10%</span></div>
                    <div class="event-odds-row"><span>Pull 7</span><span>40%</span></div>
                    <div class="event-odds-row"><span>Pull 8</span><span>45%</span></div>
                    <div class="event-odds-row"><span>Pull 9</span><span>50%</span></div>
                    <div class="event-odds-row event-guaranteed"><span>Pull 10</span><span>100% Guaranteed</span></div>
                </div>
                
                <div class="event-pull-section">
                    <div class="event-pull-cost">
                        <span class="event-cost-label">5x Pulls</span>
                        <span class="event-cost-value">💎 ${data.cost} gems</span>
                    </div>
                    <button class="btn-primary event-pull-btn" id="event-pull-btn" ${actionAttrs('doBannerPull')}>
                        🎴 Pull 5x
                    </button>
                </div>
                
                <div id="event-results" class="event-results"></div>
            </div>
        `;

        updateEventTimer(banner.endAt);

    } catch (e) {
        content.innerHTML = `<div style="color:var(--red-light);padding:20px;text-align:center;">${escHtml(e.message)}</div>`;
    }
}

async function doBannerPull() {
    const btn = document.getElementById('event-pull-btn');
    const results = document.getElementById('event-results');
    if (!btn || !results) return;

    btn.disabled = true;
    btn.textContent = 'Pulling...';
    results.innerHTML = '<div class="loading-spinner">Opening pulls...</div>';

    try {
        const data = await api('POST', '/banner/pull');
        console.log('Pull response:', data);

        if (data.won) {
            showMsg('event-msg', '🎴 You won the banner set! Check your inbox!', false);
        }

        const itemsHtml = data.items.map(item => {
            if (item.type === 'raw_mat') {
                return `<div class="event-item event-item-${item.rarity || 'common'}">${item.emoji || '📦'} ${item.qty}x ${item.name}</div>`;
            } else {
                return `<div class="event-item event-item-${item.rarity || 'common'}">${item.emoji || '🎁'} ${item.name}</div>`;
            }
        }).join('');

        const bonusHtml = [];
        if (data.goldFound > 0) bonusHtml.push(`💰 +${data.goldFound.toLocaleString()} Gold`);
        if (data.gemsFound > 0) bonusHtml.push(`💎 +${data.gemsFound} Gems`);

        // Add won items to display
        const wonItemsHtml = data.wonItems ? data.wonItems.map(item =>
            `<div class="event-item event-item-legendary">🌟 ${escHtml(item.name)}</div>`
        ).join('') : '';

        results.innerHTML = `
            <div class="event-result-won ${data.won ? 'won' : ''}">${data.won ? '🎴 BANNER SET WON!' : ''}</div>
            ${wonItemsHtml ? `<div class="event-items-grid">${wonItemsHtml}</div>` : ''}
            <div class="event-items-grid">${itemsHtml}</div>
            ${bonusHtml.length > 0 ? `<div class="event-bonus-rewards">${bonusHtml.join(' · ')}</div>` : ''}
            <div class="event-new-stats">
                ${data.won ? '<span style="color:#f1c40f">Pity Reset!</span> · ' : ''}Pulls: ${data.stats.pityCount ?? data.stats.effectivePulls ?? 0}/10 · Odds: ${(data.stats.currentOdds * 100).toFixed(1)}% · 💎 ${data.gems.toLocaleString()} · 💰 ${(character.gold || 0).toLocaleString()}
            </div>
        `;

        character.gems = data.gems;
        if (data.gold) character.gold = data.gold;
        renderTopBar();

        const pityProgress = data.stats.pityCount ?? data.stats.effectivePulls ?? 0;
        const pityEl = document.querySelector('.event-pity-header span:last-child');
        const pityBar = document.querySelector('.event-pity-fill');
        const pityOdds = document.querySelector('.event-pity-odds');
        if (pityEl) pityEl.textContent = `${pityProgress}/10 pulls`;
        if (pityBar) pityBar.style.width = `${Math.min(100, pityProgress * 10)}%`;
        if (pityOdds) {
            const oddsPct = (data.stats.currentOdds * 100).toFixed(1);
            pityOdds.innerHTML = `<span>Current odds: <strong>${oddsPct}%</strong></span>`;
        }
    } catch (e) {
        results.innerHTML = `<div style="color:var(--red-light);padding:10px;text-align:center;">${escHtml(e.message || 'Pull failed')}</div>`;
    }

    btn.disabled = false;
    btn.textContent = '🎴 Pull 5x';
}

function updateEventTimer(endAt) {
    const timerEl = document.getElementById('event-timer');
    if (!timerEl) return;

    const update = () => {
        const remaining = endAt * 1000 - Date.now();
        if (remaining <= 0) {
            timerEl.textContent = 'Event ended';
            return;
        }

        const hours = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timerEl.textContent = `Ends in ${hours}h ${mins}m ${secs}s`;
    };

    update();
    setInterval(update, 1000);
}

function renderShopContent() {
    if (!character) return;
    document.getElementById('shop-gold').textContent=`💰 ${character.gold.toLocaleString()} Gold`;
    document.getElementById('shop-gems').textContent=`💎 ${(character.gems||0).toLocaleString()} Gems`;
    const ld=document.getElementById('current-level-display'); if(ld) ld.textContent=character.level;
    const pb=document.getElementById('level-progress-bar'); if(pb) pb.style.width=`${(character.level/50)*100}%`;
    updateFreeGemsCta();
    loadMonthlyFreeGemsStatus();
    refreshShop();
}
function formatFreeGemsRefreshTime(unixTs) {
    if (!unixTs) return 'next month';
    return new Date(unixTs * 1000).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
function updateFreeGemsCta() {
    const btn = document.querySelector('.shop-gems-cta');
    if (!btn) return;
    if (!monthlyFreeGemsStatus) {
        btn.textContent = 'Claim Free Gems';
        btn.disabled = false;
        return;
    }
    if (monthlyFreeGemsStatus.eligible) {
        btn.textContent = 'Claim 30 Free Gems';
        btn.disabled = false;
        return;
    }
    btn.textContent = `Free Gems Claimed · ${formatFreeGemsRefreshTime(monthlyFreeGemsStatus.nextClaimAt)}`;
    btn.disabled = false;
}
async function loadMonthlyFreeGemsStatus() {
    try {
        monthlyFreeGemsStatus = await api('GET', '/game/gems/monthly-claim/status');
    } catch {
        monthlyFreeGemsStatus = null;
    }
    updateFreeGemsCta();
}
function renderFreeGemsModalContent() {
    const el = document.getElementById('free-gems-modal-content');
    if (!el) return;
    if (!monthlyFreeGemsStatus) {
        el.innerHTML = '<p class="loading">Loading...</p>';
        return;
    }
    const eligible = !!monthlyFreeGemsStatus.eligible;
    const claimedText = eligible
        ? 'Your monthly stash is ready.'
        : `Already claimed. Refreshes on ${formatFreeGemsRefreshTime(monthlyFreeGemsStatus.nextClaimAt)}.`;
    el.innerHTML = `
        <div class="free-gems-hero">
            <div class="free-gems-amount">💎 ${monthlyFreeGemsStatus.amount || 30}</div>
            <div class="free-gems-copy">Claim a free gem pack once each month for this character.</div>
        </div>
        <div class="free-gems-status ${eligible ? 'ready' : 'locked'}">${claimedText}</div>
        <button class="btn-primary free-gems-claim-btn" ${actionAttrs('claimMonthlyFreeGems')} ${eligible ? '' : 'disabled'}>
            ${eligible ? 'Claim Gems' : 'Already Claimed'}
        </button>
    `;
}
async function openFreeGemsModal() {
    const modal = document.getElementById('free-gems-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderFreeGemsModalContent();
    await loadMonthlyFreeGemsStatus();
    renderFreeGemsModalContent();
}
function closeFreeGemsModal() {
    document.getElementById('free-gems-modal')?.classList.add('hidden');
}
async function claimMonthlyFreeGems() {
    try {
        const response = await api('POST', '/game/gems/monthly-claim');
        character = response.character || character;
        monthlyFreeGemsStatus = {
            amount: response.amount || 500,
            eligible: false,
            claimedAt: Math.floor(Date.now() / 1000),
            nextClaimAt: response.nextClaimAt
        };
        renderTopBar();
        renderCharacter();
        renderShopContent();
        renderFreeGemsModalContent();
        showMsg('shop-msg', response.message || 'Claimed free gems.');
    } catch (e) {
        showMsg('shop-msg', e.message, true);
        await loadMonthlyFreeGemsStatus();
        renderFreeGemsModalContent();
    }
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
        if (currentShopCategory === 'consumables') return !!(item.consumable || cat === 'consumable') && item.category !== 'lootbox';
        if (currentShopCategory === 'premium')   return item.priceType === 'gems' || cat === 'premium';
        if (currentShopCategory === 'lootboxes') return item.category === 'lootbox';
        return false;
    });

    if (!filtered.length) { el.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim)">No items in this category.</div>`; return; }
    el.innerHTML=filtered.map(item=>{
                const pt=item.priceType||'gold', ci=pt==='gems'?'💎':'💰', cc=pt==='gems'?'#9b59b6':'var(--gold)';
                const gemCost = item.gemCost || 0;
                const price = item.price || 0;
        const isAvail=character.level>=(item.level||1), classOk=!item.classes||item.classes.includes(character.class);
        const hasEnoughGold = pt==='gems' ? (character.gems||0)>=price : character.gold>=price;
        const hasEnoughGems = gemCost === 0 || (character.gems||0) >= gemCost;
        const hasEnough = hasEnoughGold && hasEnoughGems;
        let cardClass='shop-card';
        if(!isAvail)cardClass+=' locked-future';
        if(!classOk)cardClass+=' class-locked';
        if(item.quality==='legendary')cardClass+=' legendary';
        else if(item.quality==='epic')cardClass+=' epic';
        else if(item.quality==='rare')cardClass+=' rare';

        const statsHtml = item.stats ? Object.entries(item.stats)
            .filter(([k]) => k !== 'elem_dmg' && k !== 'elem_dmg_type' && k !== 'elem_resist')
            .filter(([,v]) => typeof v === 'number' && v !== 0)
            .map(([k,v]) => {
                const label = statLabelHtml(k);
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
            <div class="shop-card-header" data-hover-action="hoverShopItemTooltip" data-leave-action="scheduleHideTooltip" data-shopitem="${shopItemData}" ${actionAttrs('openShopItemTooltip')}>
                <span class="shop-card-icon">${itemIcon(item,'2rem')}</span>
                <span class="shop-card-name">${item.name}</span>
                <span class="shop-card-tier">Lv.${item.level||1}</span>
            </div>
            <div class="shop-card-desc">${item.desc}</div>
            <div class="shop-card-requirements ${isAvail&&classOk?'met':'not-met'}">${!isAvail?`<div>🔒 Required: Level ${item.level}</div>`:''} ${item.classes?`<div>📋 Classes: ${item.classes.join('/')}</div>`:''}</div>
            ${statsHtml||elemHtml?`<div class="shop-card-stats">${statsHtml}${elemHtml}${effectHtml}</div>`:''}
            <div class="shop-card-footer">
                <div style="display:flex;flex-direction:column;gap:2px">
                    <span class="shop-card-price" style="color:${cc}">${ci} ${price.toLocaleString()}${gemCost?` <span style="color:#9b59b6">+ ${gemCost}💎</span>`:''}</span>
                </div>
                <button class="btn-shop" ${actionAttrs('buyItem', item.id)} ${isAvail&&classOk&&hasEnough&&!item._buying?'':'disabled'}>${
            item._buying ? 'Buying...' :
                !isAvail ? `Level ${item.level}` :
                    !classOk ? 'Class Locked' :
                        !hasEnoughGold ? `Need ${price - (pt==='gems'?(character.gems||0):character.gold)} more` :
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
    const staysInShop = !!(item.alwaysAvailable || item.consumable || item.category === 'premium');
    if (character.level<(item.level||1)){showMsg('shop-msg',`Requires level ${item.level}!`,true);return;}
    if (item.classes&&!item.classes.includes(character.class)){showMsg('shop-msg',`Not available for ${capitalize(character.class)}!`,true);return;}
    if (pt==='gems'&&(character.gems||0)<item.price){showMsg('shop-msg','Not enough gems!',true);return;}
    if (pt!=='gems'&&character.gold<item.price){showMsg('shop-msg','Not enough gold!',true);return;}
    if (gemCost>0&&(character.gems||0)<gemCost){showMsg('shop-msg',`This item also costs ${gemCost} 💎 — not enough gems!`,true);return;}
    if(item._buying){showMsg('shop-msg','Purchase already in progress...',true);return;}
    item._buying=true;
    renderShop();
    try {
        await api('POST','/game/shop/buy',{itemId:item.id,category:item.category||item.slot||'weapon',price:item.price,priceType:pt,item});

        // Refresh character properly from the game endpoint instead of using result.character
        const refreshedChar = await api('GET','/game/character');
        character = refreshedChar;

        showMsg('shop-msg',`✅ ${item.name} purchased and added to your inventory!`);
        if (staysInShop) {
            item._buying=false;
        } else {
            shopInventory = shopInventory.filter(i => i.id !== item.id);
        }
        renderShop();
        const shopGoldEl = document.getElementById('shop-gold');
        if (shopGoldEl) shopGoldEl.textContent = `💰 ${character.gold.toLocaleString()} Gold`;
        const shopGemsEl = document.getElementById('shop-gems');
        if (shopGemsEl) shopGemsEl.textContent = `💎 ${(character.gems || 0).toLocaleString()} Gems`;
        renderTopBar();
        renderCharacter(); // Force re-render character sheet with correct HP

        if (item.consumable) {
            invTab='consumables';
            loadInventory();
        }
    } catch(e) {
        item._buying=false;
        renderShop();
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

async function renderPremium(data) {
    const el = document.getElementById('premium-content');
    if (!el) return;
    const { features, synergies, ultimate, gems } = data;
    const activeCount = features.filter(f => f.active).length;
    const now = Math.floor(Date.now() / 1000);
    const premiumArt = {
        arcane_reservoir: '/images/assets/premium/arcane-reservoir.png',
        warlord: '/images/assets/premium/warlord.png',
        iron_fortress: '/images/assets/premium/iron-fortress.png',
        apprentice: '/images/assets/premium/apprentice.png',
        vault_keeper: '/images/assets/premium/vault-keeper.png',
        fortune_hunter: '/images/assets/premium/fortune-hunter.png'
    };

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

    const cardsHtml = `<div class="premium-feature-grid" style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px">
        ${features.map(f => {
        const isActive = f.active;
        const daysLeft = isActive ? Math.ceil(f.expiresIn / 86400) : 0;
        const borderColor = isActive ? 'rgba(241,196,15,0.5)' : 'var(--border)';
        const bg = isActive ? 'linear-gradient(145deg,rgba(241,196,15,0.08),rgba(241,196,15,0.04))' : 'linear-gradient(145deg,var(--bg2),var(--bg3))';
        const artSrc = premiumArt[f.id];
        return `<div class="premium-feature-card${isActive ? ' is-active' : ''}" style="background:${bg};border:1px solid ${borderColor};border-radius:var(--radius);position:relative;overflow:hidden;display:flex;flex-direction:column">
                <div class="premium-feature-art-wrap pc-only">
                    ${isActive ? `<div class="premium-feature-days" style="position:absolute;top:8px;right:8px;background:rgba(241,196,15,0.15);border:1px solid rgba(241,196,15,0.4);border-radius:10px;padding:2px 8px;font-size:0.62rem;color:var(--gold);font-weight:700">${daysLeft}d left</div>` : ''}
                    ${artSrc ? `<img class="premium-feature-art" src="${artSrc}" alt="${f.name}" loading="lazy" decoding="async" data-error-hide="true" style="width:100%;height:100%;object-fit:cover">` : `<span class="premium-feature-emoji" style="font-size:3rem;display:flex;align-items:center;justify-content:center;height:100%">${f.emoji}</span>`}
                </div>
                <div class="premium-feature-art-wrap mobile-only" style="width:100%;position:relative">
                    ${isActive ? `<div class="premium-feature-days" style="position:absolute;top:8px;right:8px;background:rgba(241,196,15,0.15);border:1px solid rgba(241,196,15,0.4);border-radius:10px;padding:2px 8px;font-size:0.62rem;color:var(--gold);font-weight:700">${daysLeft}d left</div>` : ''}
                    ${artSrc ? `<img class="premium-feature-art" src="${artSrc}" alt="${f.name}" loading="lazy" decoding="async" data-error-hide="true" style="width:100%;height:auto;display:block">` : `<span class="premium-feature-emoji" style="font-size:3rem;display:block;text-align:center;padding:20px">${f.emoji}</span>`}
                </div>
                <div class="premium-feature-body" style="flex:1;display:flex;flex-direction:column;padding:12px">
                    <div class="premium-feature-meta">
                    <div style="font-family:'Cinzel',serif;font-size:0.9rem;font-weight:700;color:var(--text-bright)">${f.name}</div>
                    <div style="font-size:0.62rem;color:var(--gold)">${f.cost} 💎 / 30 days</div>
                    </div>
                    <div class="premium-feature-desc" style="font-size:0.78rem;color:var(--text-dim);margin:8px 0;line-height:1.5;flex:1">${f.desc}</div>
                    <button ${actionAttrs('activatePremium', f.id)}
                        style="width:100%;padding:10px;border-radius:var(--radius-sm);border:1px solid ${isActive ? 'rgba(241,196,15,0.4)' : 'rgba(155,89,182,0.4)'};background:${isActive ? 'rgba(241,196,15,0.1)' : 'rgba(155,89,182,0.12)'};color:${isActive ? 'var(--gold)' : '#9b59b6'};font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.15s;margin-top:auto"
                        ${gems < f.cost && !isActive ? 'disabled' : ''}>
                    ${isActive ? `✅ Active · Renew for ${f.cost} 💎` : (gems >= f.cost ? `Activate · ${f.cost} 💎` : `Need ${f.cost - gems} more 💎`)}
                    </button>
                </div>
            </div>`;
    }).join('')}
    </div>`;

    let adminBtnHtml = '';
    const storedToken = localStorage.getItem('rpg_token');
    if (storedToken) {
        try {
            const adminRes = await fetch('/api/game/admin/check', {
                headers: { 'Authorization': 'Bearer ' + storedToken }
            });
            const adminData = await adminRes.json();
            if (adminData.isAdmin || adminData.isModerator) {
                var role = adminData.isAdmin ? '👑 Admin' : '🛡️ Moderator';
                var color = adminData.isAdmin ? '#c8a86e' : '#64b4ff';
                var bgColor = adminData.isAdmin ? 'rgba(200,168,110,0.12)' : 'rgba(100,180,255,0.12)';
                var borderColor = adminData.isAdmin ? 'rgba(200,168,110,0.4)' : 'rgba(100,180,255,0.4)';
                adminBtnHtml = `<a href="/admin-panel" target="_blank" style="display:block;text-align:center;padding:10px;margin-top:16px;background:${bgColor};border:1px solid ${borderColor};border-radius:var(--radius-sm);color:${color};font-weight:600;font-size:0.85rem;text-decoration:none;transition:background 0.15s" onmouseover="this.style.background='${bgColor.replace('0.12','0.2')}'" onmouseout="this.style.background='${bgColor}'">${role} Panel</a>`;
            }
        } catch {}
    }

    el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:10px 14px;background:rgba(155,89,182,0.08);border:1px solid rgba(155,89,182,0.25);border-radius:var(--radius-sm)">
            <span style="font-size:0.82rem;color:var(--text-dim)">Your gems</span>
            <span style="font-size:1.1rem;font-weight:700;color:#9b59b6">💎 ${gems.toLocaleString()}</span>
        </div>
        ${adminBtnHtml}
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
    const ok = await openGameConfirmDialog({ title: '💎 Reroll Shop', message: 'Reroll the entire shop for 1 💎?' });
    if (!ok) return;
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
let lbMode = 'players'; // 'players' | 'squads'
let lbSquadData = [];
let lbPage = 0;
const LB_PAGE_SIZE = 100;
function setLbMode(mode, btn) {
    lbMode = mode;
    lbPage = 0;
    document.querySelectorAll('.lb-mode-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderLeaderboard();
}
function setLbSort(sort, btn) {
    if (sort === 'weekly_dmg') {
        lbSort = sort;
        lbPage = 0;
        window._weeklyLbSub = window._weeklyLbSub || 'damage';
        document.querySelectorAll('.lb-filters .filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        Promise.all([
            api('GET', '/game/leaderboard/weekly'),
            api('GET', '/game/leaderboard/weekly/history?limit=20'),
        ]).then(([weekly, hist]) => {
            window._weeklyLbData = weekly;
            window._weeklyLbHistoryDmg = hist.history_dmg || [];
            window._weeklyLbHistoryWin = hist.history_win || [];
            renderLeaderboard();
        }).catch(() => renderLeaderboard());
        return;
    }
    lbSort = sort;
    lbPage = 0;
    document.querySelectorAll('.lb-filters .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadLeaderboard();
}
async function loadLeaderboard() {
    document.getElementById('leaderboard-list').innerHTML='<p class="loading">Loading...</p>';
    try {
        const [freshCharacter, leaderboard, squadLb, weeklyLb, weeklyHist] = await Promise.all([
            api('GET','/game/character'),
            api('GET',`/game/leaderboard?sort=${lbSort}`),
            api('GET', '/game/squads/leaderboard').catch(() => []),
            api('GET', '/game/leaderboard/weekly').catch(() => ({ current_dmg_top: [], current_win_top: [], previous_dmg_winner: null, previous_win_winner: null })),
            api('GET', '/game/leaderboard/weekly/history?limit=20').catch(() => ({ history_dmg: [], history_win: [] })),
        ]);
        character = freshCharacter;
        lbData = leaderboard;
        lbSquadData = squadLb;
        window._weeklyLbData = weeklyLb;
        window._weeklyLbHistoryDmg = weeklyHist.history_dmg || [];
        window._weeklyLbHistoryWin = weeklyHist.history_win || [];
        renderLeaderboard();
    }
    catch(e) { document.getElementById('leaderboard-list').innerHTML=`<p class="loading">${e.message}</p>`; }
}
function buildSquadLeaderboardRow(s, idx) {
    const rank = idx + 1;
    const rc = rank===1?'gold-rank':rank===2?'silver-rank':rank===3?'bronze-rank':'';
    const rs = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`#${rank}`;
    const logoHtml = s.logo
        ? `<img src="${escHtml(s.logo)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;font-size:1rem">🛡️</div>`;
    return `<div class="lb-row" ${actionAttrs('showSquadDetail', s.id)}>
        <div class="lb-rank ${rc}">${rs}</div>
        ${logoHtml}
        <div class="lb-info"><div class="lb-name">${escHtml(s.name)}</div>
        <div class="lb-sub">${s.member_count} members · Avg Lv ${s.avg_level} · Avg 💰 ${Number(s.avg_gold_earned||0).toLocaleString()}</div></div>
        <div class="lb-stats" style="grid-template-columns:1fr">
            <div class="lb-stat"><div class="lb-stat-val" style="color:var(--gold)">💰 ${Number(s.total_gold_earned||0).toLocaleString()}</div></div>
        </div>
    </div>`;
}
window.setLbMode = setLbMode;
window.setLbSort = setLbSort;
window.setWeeklyLbSub = setWeeklyLbSub;

// ── Squads ────────────────────────────────────────────────────────────────
let squadsData = null;
async function loadSquads() {
    const el = document.getElementById('squads-content');
    if (!el) return;
    el.innerHTML = '<p class="loading">Loading squads...</p>';
    try {
        const [me, lb] = await Promise.all([
            api('GET', '/game/squads/me').catch(() => ({ squad: null, members: [] })),
            api('GET', '/game/squads/leaderboard')
        ]);
        squadsData = { me, lb };
        if (me.squad && me.members) {
            const myMem = me.members.find(m => m.id === character?.id);
            const isLeader = me.squad.owner_char_id === character?.id;
            const isOfficer = myMem?.role === 'officer';
            const isCoLeader = myMem?.role === 'co_leader';
            if (isLeader || isCoLeader || isOfficer) {
                const appsRes = await api('GET', '/game/squads/applications').catch(() => ({ applications: [] }));
                squadsData.applications = appsRes.applications || [];
            }
        }
        await loadClanData();
        renderSquads();
    } catch (e) {
        el.innerHTML = `<p class="loading">${escHtml(e.message)}</p>`;
    }
}

let _squadSubTab = 'squad';

function switchSquadSubTab(tab) {
    _squadSubTab = tab;
    renderSquads();
}
window.switchSquadSubTab = switchSquadSubTab;

function renderSquads() {
    _startUpkeepTicker();
    const el = document.getElementById('squads-content');
    if (!el) return;
    const me = squadsData?.me || {};
    const squad = me.squad;
    const members = me.members || [];
    const apps = squadsData?.applications || [];
    const myMembership = members.find(m => m.id === character?.id);
    const myRole = myMembership?.role || 'member';
    const isLeader = squad && squad.owner_char_id === character?.id;
    const isOfficer = myRole === 'officer';
    const isCoLeader = myRole === 'co_leader';
    const canManageApps = isLeader || isCoLeader || isOfficer;
    const roleLabels = { leader: '👑 Leader', co_leader: '⭐ Co-Leader', officer: '⚔️ Officer', member: '🪖 Member' };
    const canAssignRoles = isLeader || isCoLeader;

    function roleOptions(currentRole, isLeaderAssigner) {
        const opts = [];
        if (isLeaderAssigner) opts.push(['co_leader', '⭐ Co-Leader']);
        opts.push(['officer', '⚔️ Officer']);
        opts.push(['member', '🪖 Member']);
        return opts.map(([v, l]) => `<option value="${v}" ${v === currentRole ? 'selected' : ''}>${l}</option>`).join('');
    }

    // No squad — show create/join card
    if (!squad) {
        el.innerHTML = `
        <div class="squads-card">
            <div class="squads-title">🛡️ Squads</div>
            <div class="squads-meta">Create a squad or join one by invite code.</div>
            <div class="squads-actions">
                <input id="squad-name" class="input-field" placeholder="Squad name (3-20 chars)">
                <button class="btn-primary" ${actionAttrs('createSquad')}>Create</button>
            </div>
            <div class="squads-actions" style="margin-top:10px">
                <input id="squad-code" class="input-field" placeholder="Invite code">
                <button class="btn-secondary" ${actionAttrs('joinSquad')}>Join</button>
            </div>
        </div>`;
        return;
    }

    // Squad header
    const canChangeLogo = isLeader || isCoLeader;
    const logoDisplay = squad.logo
        ? `<img src="${escHtml(squad.logo)}" alt="${escHtml(squad.name)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;font-size:1.5rem">🛡️</div>`;
    const squadHeader = `<div class="squads-card">
        <div class="squads-card-head">
            <div style="display:flex;align-items:center;gap:12px">
                ${logoDisplay}
                <div>
                    <div class="squads-title">${escHtml(squad.name)}</div>
                    <div class="squads-meta">Invite code: <strong>${escHtml(squad.invite_code || '')}</strong> · Members: <strong>${members.length}</strong></div>
                </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
                ${canChangeLogo ? `<button class="btn-secondary btn-sm" ${actionAttrs('uploadSquadLogo')}>📷 Logo</button>${squad.logo ? `<button class="btn-secondary btn-sm" ${actionAttrs('removeSquadLogo')}>🗑️</button>` : ''}` : ''}
                <button class="btn-secondary btn-sm" ${actionAttrs('leaveSquad')}>Leave</button>
            </div>
        </div>
    </div>`;

    // Subtab navigation
    const subTabsHtml = `<div class="squad-subtabs" style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap">
        <button class="squad-subtab" style="padding:8px 16px;background:${_squadSubTab === 'squad' ? '#1a1a28' : '#14141e'};border:1px solid ${_squadSubTab === 'squad' ? '#c8a86e' : '#2a2a35'};border-radius:6px;color:${_squadSubTab === 'squad' ? '#c8a86e' : '#8a8a90'};cursor:pointer;font-size:13px;font-weight:600" data-action="switchSquadSubTab" data-args="${encodeActionArgs(['squad'])}">Squad</button>
        <button class="squad-subtab" style="padding:8px 16px;background:${_squadSubTab === 'members' ? '#1a1a28' : '#14141e'};border:1px solid ${_squadSubTab === 'members' ? '#c8a86e' : '#2a2a35'};border-radius:6px;color:${_squadSubTab === 'members' ? '#c8a86e' : '#8a8a90'};cursor:pointer;font-size:13px;font-weight:600" data-action="switchSquadSubTab" data-args="${encodeActionArgs(['members'])}">Members (${members.length})</button>
        <button class="squad-subtab" style="padding:8px 16px;background:${_squadSubTab === 'map' ? '#1a1a28' : '#14141e'};border:1px solid ${_squadSubTab === 'map' ? '#c8a86e' : '#2a2a35'};border-radius:6px;color:${_squadSubTab === 'map' ? '#c8a86e' : '#8a8a90'};cursor:pointer;font-size:13px;font-weight:600" data-action="switchSquadSubTab" data-args="${encodeActionArgs(['map'])}">Base Map</button>
    </div>`;

    // Tab content
    let tabContent = '';

    if (_squadSubTab === 'squad') {
        // Squad page: treasury, base info, donation, wars
        if (clanData.squad_id) {
            const base = clanData.baseInfo;
            const treasury = clanData.treasury;
            const wars = clanData.wars || [];
            const tierNames = { main: '🏰 Main', large: '🏯 Large', medium: '🏘️ Medium', small: '🛖 Small' };

            if (treasury) {
                tabContent += `<div class="squads-card" style="margin-top:10px">
                    <div class="squads-title">💰 Squad Treasury</div>
                    <div class="squads-members" style="padding:8px 12px">
                        <span class="squads-meta">💵 ${treasury.gold.toLocaleString()} gold · 💎 ${treasury.gems} gems</span>
                    </div>
                </div>`;
            }

            if (base) {
                tabContent += `<div class="squads-card" style="margin-top:10px">
                    <div class="squads-card-head">
                        <div><div class="squads-title">🏰 ${escHtml(base.name)}</div>
                        <div class="squads-meta">${tierNames[base.tier] || base.tier} · Level ${base.upgrade_level}/${base.max_upgrades} · ${base.discount_pct > 0 ? `🏷️ ${base.discount_pct}% stat discount` : '❌ Discount inactive'}</div>
                    </div></div>
                    ${renderUpkeepStatus(base)}
                    ${base.upgrade_cost ? `<div class="squads-members" style="padding:8px 12px">
                        <div class="squads-meta">Next upgrade: 💰 ${base.upgrade_cost.gold.toLocaleString()} gold · 💎 ${base.upgrade_cost.gems} gems</div>
                        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
                            <button class="btn-primary btn-sm" ${actionAttrs('upgradeBase', base.id)}>⬆️ Upgrade</button>
                        </div>
                    </div>` : '<div class="squads-members" style="padding:8px 12px"><span class="squads-meta">Base at max level.</span></div>'}
                </div>`;
            }

            // Donation form — always visible when in a squad
            tabContent += `<div class="squads-card" style="margin-top:10px">
                <div class="squads-title">💰 Donate to Treasury</div>
                <div class="squads-members" style="padding:8px 12px">
                    <div class="squads-meta">Contribute gold or gems to the squad treasury for upgrades and upkeep:</div>
                    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;justify-content:center">
                        <input id="clan-donate-gold" class="input-field" type="number" placeholder="Gold" style="width:100px;padding:4px 8px;font-size:0.8rem">
                        <input id="clan-donate-gems" class="input-field" type="number" placeholder="Gems" style="width:100px;padding:4px 8px;font-size:0.8rem">
                        <button class="btn-primary btn-sm" ${actionAttrs('donateToTreasury')}>Donate</button>
                    </div>
                </div>
            </div>`;

            wars.forEach(function(w) {
                tabContent += `<div class="squads-card" style="margin-top:10px;border-color:${w.is_attacker ? '#e74c3c44' : '#2ecc7144'}">
                    <div class="squads-card-head">
                        <div><div class="squads-title">⚔️ ${w.is_attacker ? 'Attacking' : 'Defending'} ${escHtml(w.base_name)}</div>
                        <div class="squads-meta">${w.is_attacker ? `vs ${escHtml(w.defender_name)}` : `vs ${escHtml(w.attacker_name)}`} · Phase: ${w.phase}</div>
                        <div class="squads-meta" style="font-size:0.65rem">${w.is_npc_war ? '⚔️ All 5 outposts must be won to capture' : ''} ${!w.is_npc_war && w.scout_ends_at ? `Defense phase ends: ${formatDate(w.scout_ends_at)}` : ''} ${w.attack_ends_at ? `· Auto-resolve: ${formatDate(w.attack_ends_at)}` : ''}</div>
                    </div></div>
                    <div class="squads-members" style="padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap">
                        ${w.phase !== 'resolved' ? `<button class="btn-primary btn-sm" ${actionAttrs('openWarPanel', w.id)}>⚔️ War Panel</button>` : ''}
                    </div>
                </div>`;
            });
        }
    } else if (_squadSubTab === 'members') {
        const appsHtml = canManageApps && apps.length > 0 ? `
        <div class="squads-card" style="margin-top:10px">
            <div class="squads-title">📋 Pending Applications (${apps.length})</div>
            <div class="squads-members">
                ${apps.map(a => `<div class="squads-member" style="display:flex;align-items:center;justify-content:space-between">
                    <span><span class="squads-member-name">${escHtml(a.name)}</span>
                    <span class="squads-member-sub">Lv.${a.level} ${escHtml(capitalize(a.class))}</span></span>
                    <span style="display:flex;gap:4px">
                        <button class="btn-primary btn-sm" ${actionAttrs('acceptApplication', a.id)}>✅ Accept</button>
                        <button class="btn-secondary btn-sm" ${actionAttrs('rejectApplication', a.id)}>❌ Reject</button>
                    </span>
                </div>`).join('')}
            </div>
        </div>` : '';

        tabContent = `<div class="squads-card" style="margin-top:10px">
            <div class="squads-title">👥 Members (${members.length})</div>
            <div class="squads-members">
                ${members.map(m => `<div class="squads-member" style="display:flex;align-items:center;justify-content:space-between">
                    <span>
                        <span class="squads-member-name">${escHtml(m.name)}</span>
                        <span style="margin-left:6px;font-size:0.75rem;opacity:0.7">${roleLabels[m.role] || '🪖 Member'}</span>
                        <span class="squads-member-sub" style="display:block">Lv.${m.level} ${escHtml(capitalize(m.class))} · 💰 ${Number(m.total_gold_earned||0).toLocaleString()} · 💵 ${Number(m.gold_donated||0).toLocaleString()} · 💎 ${Number(m.gems_donated||0)}</span>
                    </span>
                    <span style="display:flex;align-items:center;gap:4px">
                        ${canAssignRoles && m.id !== character?.id && (isLeader || (isCoLeader && m.role !== 'leader' && m.role !== 'co_leader')) ? `
                            <select class="input-field squad-role-select" data-role-select="${m.id}" style="width:auto;padding:2px 6px;font-size:0.75rem">
                                ${roleOptions(m.role, isLeader)}
                            </select>
                        ` : ''}
                        ${(isLeader || (isCoLeader && m.role !== 'leader') || (isOfficer && m.role === 'member')) && m.id !== character?.id ? `
                            <button class="btn-danger btn-sm" ${actionAttrs('kickMember', m.id)} style="font-size:0.7rem;padding:2px 6px">👢 Kick</button>
                        ` : ''}
                    </span>
                </div>`).join('')}
            </div>
        </div>
        ${appsHtml}`;
    } else if (_squadSubTab === 'map') {
        tabContent = renderBaseMapContent();
    }

    el.innerHTML = squadHeader + subTabsHtml + tabContent;
}

// ── Clan Base / War System ────────────────────────────────────────────────

let clanData = { bases: [], squad_id: null, treasury: null, baseInfo: null, wars: [] };

async function loadClanData() {
    try {
        const [basesRes, treasuryRes, baseInfoRes, warsRes] = await Promise.all([
            api('GET', '/game/squads/bases').catch(() => ({ bases: [], squad_id: null })),
            api('GET', '/game/squads/treasury').catch(() => ({ treasury: null })),
            api('GET', '/game/squads/base-info').catch(() => ({ base: null })),
            api('GET', '/game/squads/wars/active').catch(() => ({ wars: [] })),
        ]);
        clanData.bases = basesRes.bases || [];
        clanData.squad_id = basesRes.squad_id || null;
        clanData.treasury = treasuryRes.treasury || null;
        clanData.baseInfo = baseInfoRes.base || null;
        clanData.wars = warsRes.wars || [];
    } catch {}
}

function renderBaseMapContent() {
    if (!clanData.squad_id) return '<div class="squads-meta">Squad has no base.</div>';
    const tierColors = { main: '#ff6b35', large: '#e74c3c', medium: '#f39c12', small: '#3498db' };
    return `<div class="squads-card" style="margin-top:0">
        <div class="squads-title">🗺️ Clan Base Map</div>
        <div class="clan-base-map" style="position:relative;width:100%;height:500px;background:rgba(0,0,0,0.3);border-radius:12px;overflow:hidden;margin-top:8px">
            <div style="position:absolute;top:0;left:0;width:100%;height:100%;background-image:radial-gradient(circle,rgba(255,255,255,0.03) 1px,transparent 1px);background-size:40px 40px"></div>
            ${(clanData.bases || []).map(b => {
        const color = tierColors[b.tier] || '#888';
        const isOwned = b.owner_squad_id && b.owner_squad_id === clanData.squad_id;
        const isOccupied = b.owner_squad_id && b.owner_squad_id !== clanData.squad_id;
        return `<div data-action="showClanBaseDetail" data-args="${encodeActionArgs([b.id])}" style="position:absolute;left:${b.map_x * 100 / 1000}%;top:${b.map_y * 100 / 800}%;transform:translate(-50%,-50%);cursor:pointer;text-align:center" title="${escHtml(b.name)}${b.owner_name ? ' · ' + escHtml(b.owner_name) : ''}">
                    <div style="width:${b.tier === 'main' ? 24 : b.tier === 'large' ? 20 : b.tier === 'medium' ? 16 : 12}px;height:${b.tier === 'main' ? 24 : b.tier === 'large' ? 20 : b.tier === 'medium' ? 16 : 12}px;border-radius:50%;background:${isOwned ? '#2ecc71' : isOccupied ? '#e74c3c' : color};border:2px solid ${isOwned ? '#27ae60' : isOccupied ? '#c0392b' : 'rgba(255,255,255,0.3)'};margin:0 auto;box-shadow:0 0 ${isOwned ? 8 : 4}px ${color}44"></div>
                    <div style="font-size:0.55rem;margin-top:2px;white-space:nowrap;color:${isOwned ? '#2ecc71' : '#aaa'}">${escHtml(b.name)}${b.discount_pct ? ' 🏷️' : ''}</div>
                </div>`;
    }).join('')}
        </div>
    </div>`;
}

function renderUpkeepStatus(base) {
    if (!base) return '';
    if (base.upgrade_level <= 0) return '<div class="squads-members" style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.06)"><div class="squads-meta">Daily Upkeep: No upgrades yet — no upkeep required.</div></div>';
    var expiresAt = base.discount_expires_at || 0;
    return '<div class="squads-members" style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.06)">' +
        '<div class="squads-meta">Daily Upkeep: 💰 ' + base.upkeep_cost.toLocaleString() + ' gold' +
        ' · <span class="upkeep-timer" data-expires="' + expiresAt + '" data-discount="' + (base.discount_pct || 0) + '">' +
        _formatUpkeepTime(expiresAt, base.discount_pct) +
        '</span></div>' +
        '<div class="squads-meta" style="font-size:0.65rem;opacity:0.6">Upkeep deducted from treasury daily at 00:00 UTC. Stat discount requires active upkeep.</div>' +
    '</div>';
}

function _formatUpkeepTime(expiresAt, discountPct) {
    var now = Date.now();
    var active = expiresAt > 0 && expiresAt > now && discountPct > 0;
    var remaining = active ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
    var h = Math.floor(remaining / 3600);
    var m = Math.floor((remaining % 3600) / 60);
    var s = remaining % 60;
    var timeStr = active ? h + 'h ' + m + 'm ' + s + 's' : 'Expired';
    return '<span style="color:' + (active ? '#2ecc71' : '#e74c3c') + '">' +
        (active ? '✅ Active (' + timeStr + ' remaining)' : '❌ ' + timeStr) + '</span>';
}

// Live upkeep countdown ticker
var _upkeepTick = null;
function _startUpkeepTicker() {
    if (_upkeepTick) return;
    _upkeepTick = setInterval(function() {
        document.querySelectorAll('.upkeep-timer').forEach(function(el) {
        var expiresAt = Number(el.dataset.expires || 0);
        var discount = Number(el.dataset.discount || 0);
        el.innerHTML = _formatUpkeepTime(expiresAt, discount);
        });
    }, 1000);
} function _stopUpkeepTicker() { if (_upkeepTick) { clearInterval(_upkeepTick); _upkeepTick = null; } }

async function showClanBaseDetail(baseId) {
    const tierNames = { main: '🏰 Main', large: '🏯 Large', medium: '🏘️ Medium', small: '🛖 Small' };
    try {
        const res = await api('GET', `/game/squads/bases/${baseId}`);
        const b = res.base;
        if (!b) return;
        let html = `<div class="squads-card" style="max-width:100%">
            <div class="squads-card-head">
                <div><div class="squads-title">🏰 ${escHtml(b.name)}</div>
                <div class="squads-meta">${tierNames[b.tier] || b.tier}
                    ${b.is_owned ? '· Owned by your squad' : b.is_occupied ? `· Owned by ${escHtml(b.owner_squad_name)}` : '· Unoccupied'}
                </div>
            </div></div>
            <div class="squads-members" style="padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap">
                ${b.can_capture ? `<button class="btn-primary btn-sm" ${actionAttrs('captureBase', b.id)}>⚔️ Capture Base</button>` : ''}
                ${b.can_attack ? `<button class="btn-primary btn-sm" ${actionAttrs('startBaseWar', b.id, 'capture')}>⚔️ Capture Base</button> <button class="btn-success btn-sm" ${actionAttrs('startBaseWar', b.id, 'loot')}>💰 Loot Raid</button>` : ''}
                ${b.can_loot ? `<button class="btn-success btn-sm" ${actionAttrs('lootBase', b.id)}>💰 Loot Base (10% Gold)</button>` : ''}
            </div>
        </div>`;
        await openGameNoticeDialog({ title: 'Base Detail', message: html, confirmLabel: 'Close' });
    } catch (e) {
        await openGameNoticeDialog({ title: 'Base Detail', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.showClanBaseDetail = showClanBaseDetail;

async function captureBase(baseId) {
    try {
        const res = await api('POST', `/game/squads/bases/${baseId}/capture`);
        await openGameNoticeDialog({ title: '⚔️ NPC Capture', message: `War started! Defeat all ${res.npc_count} NPC defenders (lvl ${res.npc_level}, ~${res.npc_power.toLocaleString()} power each) across 5 outposts.` });
        await loadClanData(); renderSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '⚔️ Capture Failed', message: e.message || String(e) });
    }
}
window.captureBase = captureBase;

async function startBaseWar(baseId, intent) {
    try {
        const label = intent === 'loot' ? 'Loot Raid' : 'Capture';
        const res = await api('POST', '/game/squads/wars/start', { base_id: baseId, intent });
        const timeLabel = '24 hours';
        await openGameNoticeDialog({ title: `⚔️ ${label}`, message: `${label} started! Phases complete in ${timeLabel}. Assign fighters from the War Panel.` });
        await loadClanData(); renderSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '⚔️ War Failed', message: e.message || String(e) });
    }
}
window.startBaseWar = startBaseWar;

async function lootBase(baseId) {
    try {
        const res = await api('POST', `/game/squads/bases/${baseId}/loot`);
        await openGameNoticeDialog({ title: '💰 Loot Success', message: `You looted ${res.looted_gold.toLocaleString()} gold!` });
        await loadClanData(); renderSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '💰 Loot Failed', message: e.message || String(e) });
    }
}
window.lootBase = lootBase;

async function donateToTreasury() {
    const gold = parseInt(document.getElementById('clan-donate-gold')?.value || '0');
    const gems = parseInt(document.getElementById('clan-donate-gems')?.value || '0');
    if (gold <= 0 && gems <= 0) return;
    try {
        await api('POST', '/game/squads/treasury/donate', { gold, gems });
        document.getElementById('clan-donate-gold').value = '';
        document.getElementById('clan-donate-gems').value = '';
        if (character) { character.gold = Math.max(0, (character.gold || 0) - gold); character.gems = Math.max(0, (character.gems || 0) - gems); renderTopBar(); }
        await loadClanData(); renderSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: 'Donate Failed', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.donateToTreasury = donateToTreasury;

async function payBaseUpkeep(baseId) {
    try {
        const res = await api('POST', `/game/squads/bases/${baseId}/pay-upkeep`);
        const msg = res.upkeep_paid ? `Upkeep paid! Discount active for 24h.` : `Already paid.`;
        await loadClanData(); renderSquads();
        await openGameNoticeDialog({ title: '💰 Upkeep', message: msg, confirmLabel: 'Close' });
    } catch (e) {
        await openGameNoticeDialog({ title: 'Upkeep Failed', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.payBaseUpkeep = payBaseUpkeep;

async function upgradeBase(baseId) {
    try {
        const res = await api('POST', `/game/squads/bases/${baseId}/upgrade`);
        await loadClanData(); renderSquads(); renderUpgrade();
        await openGameNoticeDialog({ title: '⬆️ Upgrade', message: `Base upgraded to level ${res.level}!`, confirmLabel: 'Close' });
    } catch (e) {
        await openGameNoticeDialog({ title: 'Upgrade Failed', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.upgradeBase = upgradeBase;


async function openWarPanel(warId) {
    try {
        const res = await api('GET', `/game/squads/wars/${warId}`);
        const w = res.war;
        if (!w) return;
        let html = `<div class="squads-card" style="max-width:100%">
            <div class="squads-card-head">
                <div><div class="squads-title">⚔️ ${escHtml(w.base_name)}</div>
                <div class="squads-meta">${w.is_attacker ? `Attacking ${escHtml(w.defender_name)}` : `Defending vs ${escHtml(w.attacker_name)}`} · Phase: ${w.phase}</div>
                <div class="squads-meta" style="font-size:0.65rem">
                    ${w.is_npc_war ? '⚔️ All 5 outposts must be won to capture this base' : ''}
                    ${!w.is_npc_war && w.scout_ends_at ? `Defense phase ends: ${formatDate(w.scout_ends_at)}` : ''}
                    ${w.attack_ends_at ? `· Auto-resolve: ${formatDate(w.attack_ends_at)}` : ''}
                </div>
            </div></div>
            <div class="squads-members" style="padding:8px 12px">
                <div class="squads-title" style="font-size:0.8rem">Outposts</div>
                ${w.outposts.map((o, i) => {
                    let info;
                    if (w.is_attacker) {
                        info = `<span>Attacker: ${o.attacker_power.toLocaleString()}`;
                        if (w.phase === 'attacking') {
                            const parts = [];
                            if (o.scouted_count != null) parts.push(`👥 ${o.scouted_count} defenders`);
                            if (o.scouted_power != null) parts.push(`⚡ ${o.scouted_power.toLocaleString()} power`);
                            info += parts.length ? ` · ${parts.join(' · ')}` : ' · 🔍 ?';
                        }
                        info += `</span>`;
                    } else {
                        info = `<span>Defender: ${o.defender_power.toLocaleString()} · Attacker: ???</span>`;
                    }
                    return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ffffff11">
                    <span>Outpost ${i + 1}</span>
                    ${info}
                    <span>${o.winner ? (o.winner === 'attacker' ? '✅ Won' : '❌ Lost') : '⏳ Pending'}</span>
                </div>`;
                }).join('')}
            </div>
            <div class="squads-members" style="padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap">
                ${w.phase === 'attacking' && w.is_attacker ? `<button class="btn-primary btn-sm" ${actionAttrs('scoutOutpost', w.id)}>🔍 Scout</button>` : ''}
                ${w.phase === 'attacking' || w.phase === 'defense' || w.phase === 'scout' ? `<button class="btn-primary btn-sm" ${actionAttrs('assignToOutpost', w.id)}>📋 Assign</button>` : ''}
            </div>
        </div>`;
        openGameNoticeDialog({ title: 'War Panel', message: html, confirmLabel: 'Close' });
    } catch (e) {
        openGameNoticeDialog({ title: 'War Panel', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.openWarPanel = openWarPanel;

async function scoutOutpost(warId) {
    const res = await api('GET', `/game/squads/wars/${warId}`);
    const w = res.war;
    if (!w) return;
    const eligible = (w.squad_members || []).filter(m => !m.captured);
    const scoutedCharIds = new Set((w.scouts || []).map(s => s.char_id));
    if (eligible.length === 0) return await openGameNoticeDialog({ title: 'Scout', message: 'No eligible squad members to send.', confirmLabel: 'Close' });
    let html = `<div style="display:flex;flex-direction:column;gap:8px">
        <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:4px">Choose a scout:</div>`;
    for (const m of eligible) {
        const alreadyScouted = scoutedCharIds.has(m.id);
        html += `<button class="btn-primary btn-sm" ${actionAttrs('showScoutOptions', warId, m.id, m.name)} style="width:100%;text-align:left${alreadyScouted ? ';opacity:0.5' : ''}" ${alreadyScouted ? 'disabled' : ''}>
            ${escHtml(m.name)} · ⚡${m.power.toLocaleString()}${alreadyScouted ? ' (already scouted)' : ''}
        </button>`;
    }
    html += `</div>`;
    openGameNoticeDialog({ title: 'Select Scout', message: html, confirmLabel: 'Cancel' });
}
window.scoutOutpost = scoutOutpost;

async function showScoutOptions(warId, charId, charName) {
    const html = `<div style="display:flex;flex-direction:column;gap:6px">
        <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:4px">Sending <strong>${escHtml(charName)}</strong> — pick target:</div>
        ${[0,1,2,3,4].map(i => `
            <div style="display:flex;gap:4px">
                <button class="btn-primary btn-sm" ${actionAttrs('doScout', warId, charId, i, 'count')} style="flex:1">👀 Outpost ${i+1} — Count</button>
                <button class="btn-primary btn-sm" ${actionAttrs('doScout', warId, charId, i, 'power')} style="flex:1">⚡ Outpost ${i+1} — Power (risky)</button>
            </div>
        `).join('')}
    </div>`;
    openGameNoticeDialog({ title: 'Scout Outpost', message: html, confirmLabel: 'Cancel' });
}
window.showScoutOptions = showScoutOptions;

async function doScout(warId, charId, outpostIdx, type) {
    try {
        const res = await api('POST', `/game/squads/wars/${warId}/scout`, { char_id: charId, outpost_index: outpostIdx, type });
        if (res.type === 'count') {
            openGameNoticeDialog({ title: 'Count Report', message: `${res.message}`, confirmLabel: 'OK' });
        } else if (res.status === 'captured') {
            openGameNoticeDialog({ title: 'Captured!', message: res.message, confirmLabel: 'OK' });
        } else {
            openGameNoticeDialog({ title: 'Intel Received', message: `${res.message}`, confirmLabel: 'OK' });
        }
        openWarPanel(warId);
    } catch (e) {
        openGameNoticeDialog({ title: 'Scout Failed', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.doScout = doScout;

async function assignToOutpost(warId) {
    try {
        const res = await api('GET', `/game/squads/wars/${warId}`);
        const w = res.war;
        if (!w) return;
        if (w.phase !== 'attacking' && w.phase !== 'defense' && w.phase !== 'scout') {
            return await openGameNoticeDialog({ title: 'Assign', message: 'Cannot assign fighters at this phase.', confirmLabel: 'Close' });
        }
        const isAttacker = w.is_attacker;
        if (w.is_npc_war && !isAttacker) {
            return openGameNoticeDialog({ title: 'Assign', message: 'NPC defenders are automatically assigned.', confirmLabel: 'Close' });
        }
        const members = w.squad_members || [];
        const isCaptured = (m) => m.captured || false;
        let html = `<div class="squads-card" style="max-width:100%">
            <div class="squads-card-head">
                <div><div class="squads-title">📋 Assign Fighters</div>
                <div class="squads-meta">${isAttacker ? 'Attackers assign to outposts' : 'Defenders assign to outposts'}</div>
            </div></div>
            <div style="padding:8px 12px">
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
                    <tr style="border-bottom:1px solid #ffffff22">
                        <th style="text-align:left;padding:4px">Member</th>
                        <th style="text-align:center;padding:4px">Power</th>
                        <th style="text-align:center;padding:4px">Outpost</th>
                    </tr>
                    ${members.map(m => `
                    <tr style="border-bottom:1px solid #ffffff11${isCaptured(m) ? ';opacity:0.5;text-decoration:line-through' : ''}">
                        <td style="padding:4px">${escHtml(m.name)}${isCaptured(m) ? ' (captured)' : ''}</td>
                        <td style="text-align:center;padding:4px">${m.power.toLocaleString()}</td>
                        <td style="text-align:center;padding:4px">
                            <select class="input-field" id="assign-${m.id}" style="width:auto;padding:2px 6px;font-size:0.75rem" ${isCaptured(m) ? 'disabled' : ''}>
                                <option value="-1">— Unassigned —</option>
                                ${[0,1,2,3,4].map(i => `<option value="${i}" ${m.assigned_outpost === i ? 'selected' : ''}>Outpost ${i+1}</option>`).join('')}
                            </select>
                        </td>
                    </tr>`).join('')}
                </table>
            </div>
            <div class="squads-members" style="padding:8px 12px;display:flex;gap:6px">
                <button class="btn-primary btn-sm" id="save-assignments" data-war-id="${warId}">💾 Save Assignments</button>
            </div>
        </div>`;
        openGameNoticeDialog({ title: 'Assign Fighters', message: html, confirmLabel: 'Close' });
        // Wire save button after dialog renders
        const saveBtn = document.getElementById('save-assignments');
        if (saveBtn) {
            saveBtn.onclick = async () => {
                const assignments = [];
                for (const m of members) {
                    const sel = document.getElementById(`assign-${m.id}`);
                    if (sel) {
                        const outpostIdx = parseInt(sel.value);
                        if (outpostIdx >= 0) assignments.push({ char_id: m.id, outpost_index: outpostIdx });
                    }
                }
                try {
                    await api('POST', `/game/squads/wars/${warId}/assign`, { assignments });
                    await openGameNoticeDialog({ title: 'Assignments Saved', message: 'Fighters assigned to outposts!', confirmLabel: 'Close' });
                } catch (e) {
                    await openGameNoticeDialog({ title: 'Assign Failed', message: e.message || String(e), confirmLabel: 'Close' });
                }
            };
        }
    } catch (e) {
        await openGameNoticeDialog({ title: 'Assign', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.assignToOutpost = assignToOutpost;

async function startWarBattle(warId) {
    try {
        const res = await api('POST', `/game/squads/wars/${warId}/start-battle`);
        let msg = `⚔️ Battle resolved!<br>Attacker wins: ${res.attacker_wins}/5<br>Defender wins: ${res.defender_wins}/5`;
        if (res.captured_base) msg += '<br>🏰 Base captured!';
        if (res.loot) msg += '<br>💰 Loot deducted from defender!';
        await openGameNoticeDialog({ title: '⚔️ War Battle', message: msg, confirmLabel: 'Close' });
        await loadClanData(); renderSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '⚔️ Battle Failed', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.startWarBattle = startWarBattle;

async function showSquadDetail(squadId) {
    try {
        const res = await api('GET', `/game/squads/${squadId}`);
        const s = res.squad;
        const members = res.members || [];
        if (!s) return;
        const isInSquad = squadsData?.me?.squad != null;
        const roleLabels = { leader: '👑 Leader', co_leader: '⭐ Co-Leader', officer: '⚔️ Officer', member: '🪖 Member' };
        const membersHtml = members.map(m => {
            const splashSrc = `/images/class/${m.class}-st.png`;
            const portraitSrc = `/images/class/${m.class}.png`;
            return `<div class="squads-member" style="display:flex;align-items:center;gap:14px;cursor:pointer;position:relative;overflow:hidden;padding:0;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);margin-bottom:8px;min-height:70px" ${actionAttrs('openProfile', m.id)}>
                <div style="width:75px;height:75px;flex-shrink:0;overflow:hidden;border-radius:12px 0 0 12px;background:rgba(0,0,0,0.4)">
                    <img src="${splashSrc}" alt="" style="width:100%;height:100%;object-fit:cover" data-error-hide="true" data-error-next-display="block">
                    <img src="${portraitSrc}" alt="" style="width:100%;height:100%;object-fit:cover;display:none" data-error-src="${portraitSrc}">
                </div>
                <div style="flex:1;min-width:0;padding:8px 8px 8px 0">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <span class="squads-member-name" style="font-size:0.9rem">${escHtml(m.name)}</span>
                        <span style="font-size:0.7rem;padding:1px 8px;border-radius:8px;background:rgba(255,255,255,0.06);color:var(--text-dim)">${roleLabels[m.role] || '🪖 Member'}</span>
                    </div>
                    <div class="squads-member-sub" style="font-size:0.75rem;color:var(--text-dim);margin-top:4px">Lv.${m.level} ${escHtml(capitalize(m.class))} · 💰 ${Number(m.total_gold_earned||0).toLocaleString()}</div>
                </div>
            </div>`;
        }).join('');
        const logoBanner = s.logo
            ? `background-image:url('${escHtml(s.logo)}');background-size:cover;background-position:center`
            : `background:linear-gradient(135deg,rgba(201,146,42,0.12),rgba(201,146,42,0.03))`;
        let html = `<style>
            #game-dialog-modal:not(.hidden) .game-dialog-box.squad-detail-box { max-width: 580px; width: 94vw; }
            #game-dialog-modal:not(.hidden) .game-dialog-box.squad-detail-box .game-dialog-message { overflow: visible !important; max-height: none !important; }
            .sd-member-list { overflow: visible !important; }
            @media (max-width: 640px) { #game-dialog-modal:not(.hidden) .game-dialog-box.squad-detail-box { max-width: 96vw; } }
        </style>
        <div style="margin:-4px">
            <div style="position:relative;overflow:hidden;border-radius:16px;margin-bottom:16px;min-height:140px;display:flex;align-items:flex-end;${logoBanner}">
                <div style="position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.4) 50%,rgba(0,0,0,0.2) 100%);pointer-events:none"></div>
            </div>
            <div style="padding:0 4px 16px">
                <div class="squads-title" style="font-size:1.4rem;font-weight:700;color:#fff">${escHtml(s.name)}</div>
                <div class="squads-meta" style="margin-top:4px;font-size:0.85rem;color:var(--text-dim)">${members.length} member${members.length !== 1 ? 's' : ''}</div>
            </div>
            <div class="sd-member-list" style="display:flex;flex-direction:column;gap:0">${membersHtml}</div>
            ${!isInSquad ? `<div style="margin-top:14px;text-align:center">
                <button class="btn-primary" ${actionAttrs('applyToSquad', s.id)}>📋 Apply</button>
            </div>` : ''}
        </div>`;
        ensureGameDialogModal();
        const dialogBox = document.querySelector('#game-dialog-modal .game-dialog-box');
        if (dialogBox) dialogBox.classList.add('squad-detail-box');
        await openGameNoticeDialog({ title: '', message: html, confirmLabel: 'Close' });
        if (dialogBox) dialogBox.classList.remove('squad-detail-box');
    } catch (e) {
        await openGameNoticeDialog({ title: 'Squad Details', message: e.message || String(e), confirmLabel: 'Close' });
    }
}
window.showSquadDetail = showSquadDetail;

async function createSquad() {
    const name = document.getElementById('squad-name')?.value || '';
    try {
        const res = await api('POST', '/game/squads/create', { name });
        await openGameNoticeDialog({ title: '🛡️ Squad Created', message: `Created "${res.squad?.name || name}".` });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '🛡️ Squads', message: e.message || String(e) });
    }
}
window.createSquad = createSquad;

async function joinSquad() {
    const code = document.getElementById('squad-code')?.value || '';
    try {
        const res = await api('POST', '/game/squads/join', { code });
        await openGameNoticeDialog({ title: '🛡️ Joined Squad', message: `Joined "${res.squad?.name || 'Squad'}".` });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '🛡️ Squads', message: e.message || String(e) });
    }
}
window.joinSquad = joinSquad;

async function leaveSquad() {
    try {
        await api('POST', '/game/squads/leave');
        await openGameNoticeDialog({ title: '🛡️ Squads', message: 'You left the squad.' });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '🛡️ Squads', message: e.message || String(e) });
    }
}
window.leaveSquad = leaveSquad;

async function uploadSquadLogo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
            let blob, filename;
            if (isGif) {
                if (file.size > 200 * 1024) throw new Error('GIF must be under 200KB');
                blob = file;
                filename = 'logo.gif';
            } else {
                blob = await resizeImageToBlob(file, 200 * 1024);
                filename = 'logo.jpg';
            }
            const fd = new FormData();
            fd.append('logo', blob, filename);
            const res = await api('POST', '/game/squads/logo', fd);
            await openGameNoticeDialog({ title: 'Logo', message: 'Squad logo updated!' });
            await loadSquads();
        } catch (err) {
            await openGameNoticeDialog({ title: 'Logo', message: err.message || String(err) });
        }
    };
    input.click();
}
window.uploadSquadLogo = uploadSquadLogo;

function resizeImageToBlob(file, maxBytes) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            const maxDim = 600;
            if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            let quality = 0.9;
            const tryEncode = () => {
                canvas.toBlob(blob => {
                    if (!blob) return reject(new Error('Failed to encode image'));
                    if (blob.size <= maxBytes || quality <= 0.1) {
                        resolve(blob);
                    } else {
                        quality = Math.max(0.1, quality - 0.15);
                        tryEncode();
                    }
                }, 'image/jpeg', quality);
            };
            tryEncode();
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

async function removeSquadLogo() {
    try {
        await api('DELETE', '/game/squads/logo');
        await openGameNoticeDialog({ title: 'Logo', message: 'Squad logo removed.' });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: 'Logo', message: e.message || String(e) });
    }
}
window.removeSquadLogo = removeSquadLogo;

async function applyToSquad(squadId) {
    try {
        await api('POST', '/game/squads/apply', { squad_id: squadId });
        await openGameNoticeDialog({ title: '📋 Application Sent', message: 'Your application has been sent to the squad leader.' });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '📋 Squad Application', message: e.message || String(e) });
    }
}
window.applyToSquad = applyToSquad;

async function acceptApplication(appId) {
    try {
        await api('POST', `/game/squads/applications/${appId}/accept`);
        await openGameNoticeDialog({ title: '✅ Application Accepted', message: 'The applicant has been added to your squad.' });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '✅ Accept Application', message: e.message || String(e) });
    }
}
window.acceptApplication = acceptApplication;

async function rejectApplication(appId) {
    try {
        await api('POST', `/game/squads/applications/${appId}/reject`);
        await openGameNoticeDialog({ title: '❌ Application Rejected', message: 'The application has been rejected.' });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '❌ Reject Application', message: e.message || String(e) });
    }
}
window.rejectApplication = rejectApplication;

async function changeMemberRole(charId, role) {
    try {
        await api('POST', `/game/squads/members/${charId}/role`, { role });
        await openGameNoticeDialog({ title: '🔰 Role Changed', message: `Member role updated to "${role}".` });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '🔰 Squad Role', message: e.message || String(e) });
    }
}
window.changeMemberRole = changeMemberRole;

async function kickMember(charId) {
    if (!confirm('Kick this member from the squad?')) return;
    try {
        await api('POST', `/game/squads/members/${charId}/kick`);
        await openGameNoticeDialog({ title: '👢 Member Kicked', message: 'The member has been removed from the squad.' });
        await loadSquads();
    } catch (e) {
        await openGameNoticeDialog({ title: '👢 Kick Member', message: e.message || String(e) });
    }
}
window.kickMember = kickMember;

function filterLeaderboard() { lbPage = 0; renderLeaderboard(); }
function buildLeaderboardRow(p, fallbackRank = 1, extraClass = '') {
    const rank = p.rank || fallbackRank;
    const rc = rank===1?'gold-rank':rank===2?'silver-rank':rank===3?'bronze-rank':'';
    const rs = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`#${rank}`;
    const totalEarned = p.total_gold_earned || 0;
    const profilePic = p.profile_pic;
    const lbImg = profilePic ? `/images/class/${profilePic}` : `/images/class/${p.class}.png`;
    const badges = Array.isArray(p.profile_badges) ? p.profile_badges : [];
    const badgeHtml = badges.length
        ? `<div class="lb-badges">${badges.slice(0,3).map(b => `<span class="lb-badge" title="${escHtml(b.name || b.id)}">${escHtml(b.icon || '🏅')}</span>`).join('')}</div>`
        : '';
    const squadHtml = p.squad_id
        ? `<span ${actionAttrs('showSquadDetail', p.squad_id)} style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;flex-shrink:0;margin-left:6px">${p.squad_logo ? `<img src="${escHtml(p.squad_logo)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:none">` : `<span style="font-size:1rem">🛡️</span>`}<span style="font-size:0.8rem;color:var(--gold)">${escHtml(p.squad_name||'')}</span></span>`
        : '';
    return `<div class="lb-row ${extraClass}" ${actionAttrs('openProfile', p.id)}>
            <div class="lb-rank ${rc}">${rs}</div>
            <img src="${lbImg}" alt="${p.class}" class="lb-class-img" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.12);flex-shrink:0" data-class="${p.class}" data-profile-pic="${profilePic || ''}">
            <div class="lb-info"><div style="display:flex;align-items:center"><div class="lb-name" style="flex-shrink:1;min-width:0">${p.name}${p.id===character?.id?' <span style="color:var(--gold);font-size:0.7rem">(you)</span>':''}</div>${squadHtml}</div>${badgeHtml}<div class="lb-sub">Lv.${p.level} ${capitalize(p.class)} · 🏆 ${(p.achievements_completed||0).toLocaleString()} achievements</div></div>
            <div class="lb-stats">
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--green)">${p.wins}</div></div>
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--red-light)">${p.losses}</div></div>
                <div class="lb-stat"><div class="lb-stat-val" style="color:var(--gold)">${totalEarned.toLocaleString()}</div></div>
            </div>
        </div>`;
}
function getWeekNumber(mondayTs) {
    const d = new Date(mondayTs * 1000);
    const thursday = new Date(d);
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const diff = Math.floor((thursday - yearStart) / 86400000);
    return Math.ceil((diff + 1) / 7);
}
function setWeeklyLbSub(sub) {
    window._weeklyLbSub = sub;
    renderLeaderboard();
}
function renderLeaderboard() {
    // Weekly damage view
    if (lbSort === 'weekly_dmg') {
        const data = window._weeklyLbData;
        const sub = window._weeklyLbSub || 'damage';
        const isDmg = sub === 'damage';
        const cur = isDmg ? (data?.current_dmg_top || []) : (data?.current_win_top || []);
        const history = isDmg ? (window._weeklyLbHistoryDmg || []) : (window._weeklyLbHistoryWin || []);
        const prev = isDmg ? data?.previous_dmg_winner : data?.previous_win_winner;
        let html = '';

        // Sub-tab toggle
        html += '<div style="display:flex;gap:8px;margin-bottom:10px">' +
            `<button class="filter-btn ${isDmg ? 'active' : ''}" ${actionAttrs('setWeeklyLbSub', 'damage')}>⚔️ Damage</button>` +
            `<button class="filter-btn ${!isDmg ? 'active' : ''}" ${actionAttrs('setWeeklyLbSub', 'wins')}>🏆 Wins</button>` +
            '</div>';

        // Hall of Fame
        if (history.length > 0) {
            html += '<div style="margin-bottom:12px"><div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--gold)">🏛️ Hall of Fame — Past Champions</div>' +
                '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px">';
            history.forEach(h => {
                const lbImg = h.profile_pic ? `/images/class/${h.profile_pic}` : `/images/class/${h.class}.png`;
                const wn = getWeekNumber(h.week_start);
                const y = new Date(h.week_start * 1000).getUTCFullYear();
                const val = isDmg ? Number(h.total_dmg).toLocaleString() + ' dmg' : Number(h.total_wins).toLocaleString() + ' wins';
                html += `<div style="flex-shrink:0;background:linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,215,0,0.02));border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:10px 14px;text-align:center;min-width:120px;cursor:pointer" ${actionAttrs('openProfile', h.char_id)}>
                    <div style="font-size:10px;color:#6a6a70;margin-bottom:4px">Week ${wn} (${y})</div>
                    <img src="${lbImg}" alt="${h.class}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);margin-bottom:4px">
                    <div style="font-size:12px;font-weight:600;color:var(--gold)">${escHtml(h.name)}</div>
                    <div style="font-size:10px;color:#8a8a90">${val}</div>
                </div>`;
            });
            html += '</div></div>';
        }
        // Previous week winner
        if (prev) {
            const label = isDmg ? 'Last Week\'s Damage King' : 'Last Week\'s Win Champion';
            const stat = isDmg ? `${Number(prev.total_dmg).toLocaleString()} damage` : `${Number(prev.total_wins).toLocaleString()} wins`;
            html += `<div class="card-compact" style="margin-bottom:10px;padding:10px 14px;text-align:center;border-color:var(--gold)">
                <div style="font-size:13px;font-weight:700;color:var(--gold)">🏆 ${label}</div>
                <div style="font-size:15px;margin-top:4px">${escHtml(prev.name)} · ${stat}</div>
                <div style="font-size:11px;color:#6a6a70">Awarded ${prev.reward_gems}💎</div>
            </div>`;
        }
        if (cur.length === 0) {
            html += '<p class="empty">No data recorded yet this week.</p>';
        } else {
            const col1 = isDmg ? '⚔️ DAMAGE' : '🏆 WINS';
            html += '<div style="font-size:12px;font-weight:600;margin:10px 0 6px;color:var(--gold)">📅 Current Week</div>' +
                '<div class="lb-row lb-header-row"><div></div><div></div><div></div><div class="lb-stats" style="grid-template-columns:1fr 1fr"><div class="lb-stat"><div class="lb-stat-lbl">' + col1 + '</div></div><div class="lb-stat"><div class="lb-stat-lbl">BATTLES</div></div></div></div>';
            cur.forEach((r, i) => {
                const rc = i === 0 ? 'gold-rank' : i === 1 ? 'silver-rank' : i === 2 ? 'bronze-rank' : '';
                const rs = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
                const lbImg = r.profile_pic ? `/images/class/${r.profile_pic}` : `/images/class/${r.class}.png`;
                const val = isDmg ? Number(r.total_dmg).toLocaleString() : Number(r.total_wins).toLocaleString();
                html += `<div class="lb-row" ${actionAttrs('openProfile', r.char_id)}>
                    <div class="lb-rank ${rc}">${rs}</div>
                    <img src="${lbImg}" alt="${r.class}" class="lb-class-img" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.12);flex-shrink:0" data-class="${r.class}">
                    <div class="lb-info"><div class="lb-name">${escHtml(r.name)}</div><div class="lb-sub">Lv.${r.level} ${capitalize(r.class)}</div></div>
                    <div class="lb-stats" style="grid-template-columns:1fr 1fr">
                        <div class="lb-stat"><div class="lb-stat-val">${val}</div></div>
                        <div class="lb-stat"><div class="lb-stat-val">${r.total_battles}</div></div>
                    </div>
                </div>`;
            });
        }
        document.getElementById('leaderboard-list').innerHTML = html;
        return;
    }

    const modeToggle = `<div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="filter-btn lb-mode-btn ${lbMode === 'players' ? 'active' : ''}" ${actionAttrs('setLbMode', 'players')}>👤 Players</button>
        <button class="filter-btn lb-mode-btn ${lbMode === 'squads' ? 'active' : ''}" ${actionAttrs('setLbMode', 'squads')}>🛡️ Squads</button>
    </div>`;
    if (lbMode === 'squads') {
        const filtered = lbSquadData || [];
        document.getElementById('leaderboard-list').innerHTML = modeToggle + (
            filtered.length === 0
                ? '<p class="empty">No squads found.</p>'
                : '<div class="lb-row lb-header-row"><div></div><div></div><div></div><div class="lb-stats" style="grid-template-columns:1fr"><div class="lb-stat"><div class="lb-stat-lbl">💰 TOTAL EARNED</div></div></div></div>' +
                filtered.map((s, i) => buildSquadLeaderboardRow(s, i)).join('')
        );
        return;
    }
    const q=(document.getElementById('lb-search')?.value||'').toLowerCase();
    const filtered=q?lbData.filter(p=>p.name.toLowerCase().includes(q)):lbData;
    const mmBox = document.getElementById('matchmaking-box');
    const myRow = lbData.find(p => p.id === character?.id);
    if (mmBox) {
        mmBox.innerHTML = myRow
            ? buildLeaderboardRow(myRow, myRow.rank || 1, 'lb-self-row')
            : '<p class="empty" style="padding:10px">Your character is not ranked yet.</p>';
    }
    if (!filtered.length){
        document.getElementById('leaderboard-list').innerHTML = modeToggle + '<p class="empty">No players found.</p>';
        return;
    }
    const totalPages = Math.ceil(filtered.length / LB_PAGE_SIZE);
    if (lbPage >= totalPages) lbPage = 0;
    const pageItems = filtered.slice(lbPage * LB_PAGE_SIZE, (lbPage + 1) * LB_PAGE_SIZE);
    const pageNav = totalPages > 1 ? buildLbPageNav(lbPage, totalPages) : '';
    const isMobile = window.innerWidth <= 768;
    const pageNavCompact = totalPages > 1 ? buildLbPageNav(lbPage, totalPages, true) : '';
    const topNavHtml = totalPages > 1
        ? (isMobile
            ? '<div style="display:flex;justify-content:center;padding:4px 0">' + buildLbPageNav(lbPage, totalPages, false) + '</div>'
            : '<div style="position:absolute;left:50%;transform:translateX(-50%);pointer-events:none">' + pageNavCompact.replace(/<button /g, '<button style="pointer-events:auto" ') + '</div>')
        : '';
    document.getElementById('leaderboard-list').innerHTML = modeToggle +
        (isMobile ? topNavHtml : '') +
        '<div class="lb-row lb-header-row" style="display:flex;align-items:center;padding:2px 14px;position:relative;background:transparent;border-color:transparent;transform:none' + (isMobile ? ';justify-content:center' : '') + '"><div style="display:flex;align-items:center;gap:12px' + (isMobile ? ';display:none' : '') + '"><div></div><div></div><div></div></div><div class="lb-stats" style="' + (isMobile ? 'margin-left:0;width:100%;grid-template-columns:1fr 1fr 1fr' : 'margin-left:auto') + '"><div class="lb-stat"><div class="lb-stat-lbl">⚔️ WON</div></div><div class="lb-stat"><div class="lb-stat-lbl">💀 LOST</div></div><div class="lb-stat"><div class="lb-stat-lbl">💰 EARNED</div></div></div>' + (!isMobile ? topNavHtml : '') + '</div>' +
        pageItems.map((p,i)=>buildLeaderboardRow(p, lbPage * LB_PAGE_SIZE + i + 1)).join('') +
        pageNav;
}

function buildLbPageNav(currentPage, totalPages, compact) {
    let html = '<div style="display:flex;justify-content:center;align-items:center;gap:6px;' + (compact ? 'padding:0' : 'padding:8px 0') + ';flex-wrap:wrap">';
    const prevPage = Math.max(0, currentPage - 1);
    html += `<button class="filter-btn" ${actionAttrs('lbGoToPage', prevPage)} ${currentPage === 0 ? 'disabled' : ''}>◀ Prev</button>`;
    const start = Math.max(0, currentPage - 3);
    const end = Math.min(totalPages - 1, currentPage + 3);
    if (start > 0) html += `<button class="filter-btn" ${actionAttrs('lbGoToPage', 0)}>1</button><span style="color:var(--text-dim)">...</span>`;
    for (let i = start; i <= end; i++) {
        html += `<button class="filter-btn ${i === currentPage ? 'active' : ''}" ${actionAttrs('lbGoToPage', i)}>${i + 1}</button>`;
    }
    if (end < totalPages - 1) html += `<span style="color:var(--text-dim)">...</span><button class="filter-btn" ${actionAttrs('lbGoToPage', totalPages - 1)}>${totalPages}</button>`;
    const nextPage = Math.min(totalPages - 1, currentPage + 1);
    html += `<button class="filter-btn" ${actionAttrs('lbGoToPage', nextPage)} ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next ▶</button>`;
    html += '</div>';
    return html;
}

function lbGoToPage(page) {
    lbPage = page;
    renderLeaderboard();
}
// ── Profile ───────────────────────────────────────────────────────────────
async function openProfile(id) {
    const modal=document.getElementById('profile-modal'), content=document.getElementById('profile-content');
    if (!modal||!content) return;
    hideItemTooltip();
    // Move to end of body so it stacks above any open game dialog
    document.body.appendChild(modal);
    content.innerHTML='<p class="loading">Loading profile...</p>'; modal.classList.remove('hidden');
    try {
        character = await api('GET','/game/character');
        const p=await api('GET',`/game/player/${id}`);
        const classIconHtml = classRuneHtml(p.class);
        const name=p.name||'Unknown', level=p.level??'?';
        const isMe=p.user_id===character?.user_id;
        const wins=p.wins??0, losses=p.losses??0, draws=p.draws??0, wr=(wins+losses>0)?Math.round((wins/(wins+losses))*100):0;
        const achievementsCompleted = p.achievements_completed || 0;
        const dungeonHighestFloor = p.dungeon_highest_floor || 0;
        const eq=p.equipped||{};
        const str=p.strength??0,def=p.defense??0,agi=p.agility??0,mag=p.magic??0,vit=p.vitality??10;
        const hc=p.hit_chance||0,cc=p.crit_chance||0;
        const maxStat=Math.max(str,def,agi,mag,vit,hc,cc,30);

        const STAT_KEYS = ['strength','defense','agility','magic','vitality','hit_chance','crit_chance','hp_max','armor','pyro_dmg','water_dmg','wind_dmg','electro_dmg','pyro_resist','water_resist','wind_resist','electro_resist'];
        const itemBonus = {};
        STAT_KEYS.forEach(k => { itemBonus[k] = 0; });
        Object.values(eq).forEach(item => {
            if (!item?.stats) return;
            STAT_KEYS.forEach(k => { if (item.stats[k]) itemBonus[k] += item.stats[k]; });
            if (item.wp_stats) {
                STAT_KEYS.forEach(k => { if (item.wp_stats[k]) itemBonus[k] += item.wp_stats[k]; });
            }
        });
        const setBonus = p.equipped_set_bonuses || {};
        const totalStr = str + (itemBonus.strength || 0) + (setBonus.strength || 0);
        const totalDef = def + (itemBonus.defense || 0) + (setBonus.defense || 0);
        const baseDmgMin = Math.floor(totalStr * 0.5);
        const baseDmgMax = baseDmgMin + 4;
        const gearDmgMin = Object.values(eq).reduce((sum, item) => sum + (item?.stats?.dmg_min || 0) + (item?.wp_stats?.dmg_min || 0), 0);
        const gearDmgMax = Object.values(eq).reduce((sum, item) => sum + (item?.stats?.dmg_max || 0) + (item?.wp_stats?.dmg_max || 0), 0);
        let finalDmgMin = baseDmgMin + gearDmgMin;
        let finalDmgMax = baseDmgMax + gearDmgMax;

    if (p.class === 'warrior') {
            const strBonus = Math.floor(totalStr / 10);
            finalDmgMin += strBonus;
            finalDmgMax += strBonus;
        }
        const profileArmor = p.armor_value ?? (Math.floor(totalDef / 4) + (itemBonus.armor || 0) + (setBonus.armor || 0));
        const profileElemDmg = p.elem_dmg || {};
        const profileElemRes = p.elem_resist || {};


        const classTheme = normalizeClassTheme(p.class);
        const classBackground = getClassThemeBackground(p.class);

        const profileResolvedEq = { ...eq, amulet: eq.amulet || eq.ring || null };
        const profileSlots=[
            {slot:'helmet', icon:'⛑️', col:1, row:1},
            {slot:'armor',  icon:'🛡️', col:1, row:2},
            {slot:'weapon', icon:'⚔️', col:1, row:3},
            {slot:'amulet', icon:'📿', col:3, row:1},
            {slot:'shield', icon:'🛡',  col:3, row:2},
            {slot:'boots',  icon:'👢', col:3, row:3},
        ];
        const profileEqHtml = profileSlots.map(({slot,icon}, idx) => {
            const avatarDiv = idx === 3 ? `
                <div class="eq-avatar-center profile-eq-avatar">
                    <img src="/images/class/${p.profile_pic || p.class + '.png'}" alt="${p.class}" data-error-opacity-zero="true">
                    ${p.elemental ? (() => {
                const el = p.elemental;
                const elemData = escHtml(JSON.stringify({ name: el.name, element: el.element, level: el.level, str: el.str, def: el.def, mag: el.mag, vit: el.vit, dmgMin: el.dmgMin, dmgMax: el.dmgMax }));
                return `<img src="/images/assets/elemental.png" alt="Elemental" class="eq-elemental-spirit" data-hover-action="hoverElemTooltip" data-leave-action="scheduleHideTooltip" data-elem="${elemData}">`;
            })() : ''}
                </div>` : '';
            const item = profileResolvedEq[slot];
            if (!item) return avatarDiv + `<div class="eq-slot eq-slot--${slot} empty profile-eq-slot"><span class="eq-slot-icon">${icon}</span></div>`;
            const itemData = escHtml(JSON.stringify(item));
            return avatarDiv + `<div class="eq-slot eq-slot--${slot} filled profile-eq-slot"
                data-item="${itemData}"
                data-hover-action="hoverEqTooltip"
                data-leave-action="scheduleHideTooltip"
            >
                <span class="eq-slot-icon">${itemIcon(item, 'slot')}</span>
            </div>`;
        }).join('');

        const smallSlots = [['accessory','🔮','Accessory']];
        const smallSlotsHtml = smallSlots.map(([slot,icon,label]) => {
            const item = eq[slot];
            if (!item) return `<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;border:1px dashed rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);font-size:0.7rem;color:rgba(255,255,255,0.25)">${icon} ${label}</div>`;
            const qc=item.quality==='legendary'?'#f1c40f':item.quality==='epic'?'#e67e22':item.quality==='rare'?'#9b59b6':'rgba(255,255,255,0.5)';
            const itemData=escHtml(JSON.stringify(item));
            return `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;border:1px solid ${qc}33;background:rgba(255,255,255,0.03);cursor:default"
                data-item="${itemData}"
                data-hover-action="hoverEqTooltip" data-leave-action="scheduleHideTooltip">
                ${itemIcon(item,'1.2rem')}
                <span style="color:${qc};font-size:0.7rem">${item.name}</span>
                <span style="color:rgba(255,255,255,0.25);font-size:0.65rem">· ${label}</span>
            </div>`;
        }).join('');

        content.innerHTML=`
      <div class="profile-scene class-scene class-scene-${classTheme}" style="--class-bg:${classBackground}">
        <div class="class-scene-backdrop"></div>
        <div class="class-scene-glow"></div>
        <div class="class-scene-content">
          <div class="profile-header">
            <div style="display:flex;align-items:center;gap:12px">
              <img src="/images/class/${p.profile_pic || p.class + '.png'}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.15)" data-error-hide="true">
              <div><div class="profile-name">${classIconHtml} ${name}</div><div class="profile-class">Lv.${level} ${capitalize(p.class||'')}</div></div>
            </div>
            <button class="btn-secondary" ${actionAttrs('closeProfile')}>✕</button>
          </div>
          <div class="profile-grid">
            <div class="profile-card profile-combat-card">
              <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:8px;letter-spacing:0.08em;text-transform:uppercase">Combat Stats</div>
              ${miniStat(renderStatIcon('strength','💪','Strength', p.class, true),'STR',str,maxStat,'str')}
              ${miniStat(renderStatIcon('defense','🛡️','Defense', p.class, true),'DEF',def,maxStat,'def')}
              ${miniStat(renderStatIcon('agility','⚡','Agility', p.class, true),'AGI',agi,maxStat,'agi')}
              ${miniStat(renderStatIcon('magic','✨','Magic', p.class, true),'MAG',mag,maxStat,'mag')}
              ${miniStat(renderStatIcon('vitality','❤️','Vitality', p.class, true),'VIT',vit,maxStat,'vit')}
              ${hc>0?miniStat(renderStatIcon('accuracy','🎯','Hit Chance', p.class, true),'HIT',hc,maxStat,'hit'):''}
              ${cc>0?miniStat(renderStatIcon('critical','💥','Crit Chance', p.class, true),'CRIT',cc,maxStat,'crit'):''}
            </div>
            <div class="profile-card">
              <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:8px;letter-spacing:0.08em;text-transform:uppercase">Record</div>
              <div style="display:flex;flex-direction:column;gap:7px">
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Wins</span><span style="color:var(--green);font-weight:600">${wins}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Losses</span><span style="color:var(--red-light);font-weight:600">${losses}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Draws</span><span style="color:var(--gold);font-weight:600">${draws}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Win rate</span><span style="color:var(--text-bright);font-weight:600">${wr}%</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Dungeon Floor</span><span style="color:#8fd3ff;font-weight:600">🕯️ ${dungeonHighestFloor}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Tournament Wins</span><span style="color:#e040ff;font-weight:600">🏟️ ${(p.tournament_wins||0).toLocaleString()}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Achievements</span><span style="color:var(--gold);font-weight:600">🏆 ${achievementsCompleted.toLocaleString()}</span></div>
                <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:7px;margin-top:2px"><span style="color:var(--text-dim);font-size:0.82rem">Total Earned</span><span style="color:var(--gold);font-weight:600">💰 ${(p.total_gold_earned??p.gold??0).toLocaleString()}</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:0.82rem">Total Lost</span><span style="color:var(--red-light);font-weight:600">💸 ${(p.total_gold_lost??0).toLocaleString()}</span></div>
                ${p.squad_name ? `<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:7px;margin-top:2px"><span style="color:var(--text-dim);font-size:0.82rem">Squad</span><span style="display:flex;align-items:center;gap:6px;font-weight:600;color:var(--gold)">${p.squad_logo ? `<img src="${escHtml(p.squad_logo)}" alt="" style="width:18px;height:18px;border-radius:50%;object-fit:cover">` : ''}${escHtml(p.squad_name)}</span></div>` : ''}
              </div>
            </div>
          </div>
          ${Object.keys(eq).length?`
          <div class="profile-card profile-equipment-card">
            <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:10px;letter-spacing:0.08em;text-transform:uppercase">Equipment</div>
            <div class="eq-stage profile-eq-stage">
              <div class="eq-grid profile-eq-grid">${profileEqHtml}</div>
              <div class="eq-accessory-row profile-eq-accessory-row">${buildEqSlotSmall('accessory', eq, '🔮', 'Accessory')}</div>
            </div>
          </div>`:''}
          ${!isMe ? (() => {
            const gc=p.globalCooldown||0, ptc=p.perTargetCooldown||0, hpLow=p.hpLow;
            const myAttackBlockReason=getMyAttackBlockReason();
            let blocked=false, reason='';
            if(hpLow){blocked=true;reason='Too little HP';}
            else if(ptc>0){blocked=true;const h=Math.ceil(ptc/3600),m=Math.ceil(ptc/60);reason='Cooldown '+(h>=1?h+'h':m+'m');}
            else if(gc>0){blocked=true;const h=Math.ceil(gc/3600),m=Math.ceil(gc/60);reason='Recovery '+(h>=1?h+'h':m+'m');}
            else if(myAttackBlockReason){blocked=true;reason=myAttackBlockReason;}
            const isBattleCdBlock = myAttackBlockReason && myAttackBlockReason.startsWith('Wait ');
            const hasOtherBlock = myAttackBlockReason && !isBattleCdBlock;
            // Only allow skipping if it's the personal battle cooldown AND there are no target-specific blocks (12h cd or 1h recovery)
            const canSkip = isBattleCdBlock && ptc === 0 && gc === 0 && (character?.gems || 0) >= 1 && !hpLow && !hasOtherBlock;
            const atkBtn=!blocked
                ?`<button class="btn-attack" ${actionAttrs('attackFromProfile', id, name, p.class)}>⚔️ Attack</button>`
                :(canSkip
                    ? `<div style="display:flex;flex-direction:column;gap:6px"><button class="btn-attack" disabled style="opacity:0.4;cursor:not-allowed">🛡️ ${reason}</button><button class="btn-attack" style="border-color:#9b59b6;color:#9b59b6" ${actionAttrs('skipCooldownAndAttack', id, name, p.class)}>⚡ Skip cooldown for 1 💎</button></div>`
                    :`<button class="btn-attack" disabled style="opacity:0.4;cursor:not-allowed" title="${reason}">🛡️ ${reason}</button>`);
            return `<div class="profile-actions">${atkBtn}<button class="btn-secondary" ${actionAttrs('composeFromProfile', id, name)}>✉️ Message</button></div>`;
        })() : ''}
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:16px 0 0">
            ${renderDetailSlot('DMG', 'Damage', `${finalDmgMin}–${finalDmgMax}`, 'var(--text-bright)')}
            ${renderDetailSlot('ARM', 'Armor', profileArmor, '#5dade2')}
            ${p.elem_dmg && (p.elem_dmg.pyro||p.elem_dmg.water||p.elem_dmg.wind||p.elem_dmg.electro) ? `
              ${renderDetailSlot('🔥', 'Pyro Dmg', `+${p.elem_dmg.pyro||0}`, '#f1c40f')}
              ${renderDetailSlot('🌊', 'Water Dmg', `+${p.elem_dmg.water||0}`, '#f1c40f')}
              ${renderDetailSlot('🌪️', 'Wind Dmg', `+${p.elem_dmg.wind||0}`, '#f1c40f')}
              ${renderDetailSlot('⚡', 'Electro Dmg', `+${p.elem_dmg.electro||0}`, '#f1c40f')}
            ` : ''}
            ${p.elem_resist && (p.elem_resist.pyro||p.elem_resist.water||p.elem_resist.wind||p.elem_resist.electro) ? `
              ${renderDetailSlot('🔥', 'Pyro Res', `+${p.elem_resist.pyro||0}`, '#5dade2')}
              ${renderDetailSlot('🌊', 'Water Res', `+${p.elem_resist.water||0}`, '#5dade2')}
              ${renderDetailSlot('🌪️', 'Wind Res', `+${p.elem_resist.wind||0}`, '#5dade2')}
              ${renderDetailSlot('⚡', 'Electro Res', `+${p.elem_resist.electro||0}`, '#5dade2')}
            ` : ''}
          </div>
      </div>`;
    } catch(e) { content.innerHTML=`<p class="error">Failed to load profile: ${e.message||'Unknown error'}</p>`; }
}
function miniStat(icon,label,val,max,cls) {
    return `<div class="stat-row" style="padding:5px 0"><span class="stat-icon" style="font-size:0.9rem">${icon}</span><span class="stat-label" style="font-size:0.78rem">${label}</span>
    <div class="stat-bar-wrap"><div class="stat-bar"><div class="stat-fill ${cls}-fill" style="width:${Math.round(val/Math.max(max,1)*100)}%"></div></div></div>
    <span class="stat-val" style="font-size:0.9rem">${val}</span></div>`;
}
function closeProfile() { hideItemTooltip(); document.getElementById('profile-modal').classList.add('hidden'); }
async function attackFromProfile(id,name,targetClass) { closeProfile(); await attack(id,name,targetClass); }
async function skipCooldownAndAttack(id, name, targetClass) {
    closeProfile();
    if (!id) { openGameDialog({ title: 'Error', message: 'Invalid target' }); return; }
    const ok = await openGameDialog({ title: 'Skip Cooldown', message: 'Skip cooldown for 1 💎?', showCancel: true, confirmLabel: 'Skip' });
    if (!ok) return;
    try {
        const r = await api('POST', '/game/attack/skip-cooldown', { targetId: id });
        if (r.character) character = r.character;
    } catch(e) { openGameDialog({ title: 'Error', message: e.message }); return; }
    await attack(id, name, targetClass);
}
async function skipBattleCdAndAttack(id, name, targetClass, level) {
    const ok = await openGameDialog({ title: 'Skip Cooldown', message: 'Skip battle cooldown for 1 💎?', showCancel: true, confirmLabel: 'Skip' });
    if (!ok) return;
    try {
        await api('POST', '/game/battle/recover');
    } catch(e) { openGameDialog({ title: 'Error', message: e.message }); return; }
    await attack(id, name, targetClass, level);
}
function composeFromProfile(id, name) { closeProfile(); openCompose(id, name); }

function clearBattlePlaybackTimer() {
    if (battlePlaybackTimer) {
        clearTimeout(battlePlaybackTimer);
        battlePlaybackTimer = null;
    }
}

function getBattleFighterArt(className, preferredMode='splash') {
    const normalized = String(className || '').trim().toLowerCase();
    if (!['warrior', 'mage', 'rogue', 'paladin'].includes(normalized)) return null;
    return preferredMode === 'splash'
        ? `/images/class/${normalized}-st.png`
        : `/images/class/${normalized}.png`;
}

function buildBattleFighterCard({ name, className, level, splash = false, fallback = '⚔️', side = 'left' }) {
    const artSrc = getBattleFighterArt(className, splash ? 'splash' : 'portrait');
    const fighterClassText = className
        ? `${capitalize(className)}${level ? ` Lv.${level}` : ''}`
        : (level ? `Lv.${level}` : 'Battle Opponent');
    const media = artSrc
        ? `<img src="${artSrc}" alt="${escHtml(className || 'fighter')}" data-error-hide="true" data-error-next-display="flex"><span class="battle-fighter-fallback" style="display:none">${fallback}</span>`
        : `<span class="battle-fighter-fallback">${fallback}</span>`;
    return `<div class="fighter-card fighter-card-${side}">
        <div class="fighter-avatar ${splash ? 'fighter-avatar-splash' : ''}">
            ${media}
        </div>
        <div class="fighter-name">${escHtml(name || 'Unknown')}</div>
        <div class="fighter-class">${fighterClassText}</div>
    </div>`;
}

function findMissionVisualByName(missionName) {
    const target = String(missionName || '').trim().toLowerCase();
    if (!target) return null;
    const searchZones = (zones) => {
        for (const zone of Object.values(zones || {})) {
            for (const spot of zone?.spots || []) {
                for (const mission of spot?.missions || []) {
                    if (String(mission?.name || '').trim().toLowerCase() === target) {
                        return {
                            img: mission.img || null,
                            spotName: spot.name || '',
                            zoneName: zone.name || ''
                        };
                    }
                }
            }
        }
        return null;
    };
    return searchZones(ZONES) || (abyssData ? searchZones(abyssData.zones) : null);
}

function buildBattleShowcaseCard({ name, className, level, splash = false, fallback = 'вљ”пёЏ', side = 'left', imageSrc = null, metaText = '' }) {
    const artSrc = imageSrc || getBattleFighterArt(className, splash ? 'splash' : 'portrait');
    const fighterClassText = metaText || (className
        ? `${capitalize(className)}${level ? ` Lv.${level}` : ''}`
        : (level ? `Lv.${level}` : 'Battle Opponent'));
    const media = artSrc
        ? `<img src="${artSrc}" alt="${escHtml(className || name || 'fighter')}" data-error-hide="true" data-error-next-display="flex"><span class="battle-fighter-fallback" style="display:none">${fallback}</span>`
        : `<span class="battle-fighter-fallback">${fallback}</span>`;
    return `<div class="fighter-card fighter-card-${side}">
        <div class="fighter-avatar ${splash ? 'fighter-avatar-splash' : ''}">
            ${media}
        </div>
        <div class="fighter-name">${escHtml(name || 'Unknown')}</div>
        <div class="fighter-class">${fighterClassText}</div>
    </div>`;
}

function getBattleLogTintRole(line, enemyName='Enemy') {
    const text = String(line || '').trim();
    if (!text || text === '---' || text.includes(' vs ')) return '';
    if (text.startsWith('After 10 rounds:') || text.includes(' wins by dealing more damage!')) return '';
    const myName = String(character?.name || '').trim();
    const enemy = String(enemyName || '').trim();
    if (myName) {
        if (text.startsWith(`Round `) && text.includes(`: ${myName} `)) return 'battle-log-player';
        if (text.startsWith(`${myName}'s `) || text.startsWith(`${myName} `)) return 'battle-log-player';
    }
    if (enemy) {
        if (text.startsWith(`Round `) && text.includes(`: ${enemy} `)) return 'battle-log-opponent';
        if (text.startsWith(`${enemy}'s `) || text.startsWith(`${enemy} `)) return 'battle-log-opponent';
    }
    if (text.startsWith('Round ')) return 'battle-log-opponent';
    if (text.includes(`'s `) || text.includes(' attacks ') || text.includes(' swings ') || text.includes(' lands a hit')) {
        return 'battle-log-opponent';
    }
    return '';
}

function renderBattleLogLine(line, enemyName='Enemy', tintRole='') {
    if (line === '---') return '<div class="battle-log-line separator">───────────────────</div>';
    const text = String(line || '');
    if (text.includes(' vs ')) return '';
    if (text.startsWith('After 10 rounds:')) return '';
    if (text.includes(' wins by dealing more damage!')) {
        return `<div class="battle-log-line separator"><span class="battle-log-pill">${escHtml(text)}</span></div>`;
    }
    const className = tintRole || '';
    const pillClass = className ? `battle-log-pill ${className}` : 'battle-log-pill';
    let pillStyle = '';
    if (className === 'battle-log-player') {
        pillStyle = 'background:linear-gradient(135deg, rgba(52,152,219,0.42), rgba(52,152,219,0.16));border-left:3px solid #3498db;color:#e2f3ff;box-shadow:0 0 0 1px rgba(52,152,219,0.2), 0 4px 12px rgba(52,152,219,0.18);';
    } else if (className === 'battle-log-opponent') {
        pillStyle = 'background:linear-gradient(135deg, rgba(231,76,60,0.42), rgba(231,76,60,0.16));border-left:3px solid #e74c3c;color:#ffe5df;box-shadow:0 0 0 1px rgba(231,76,60,0.2), 0 4px 12px rgba(231,76,60,0.18);';
    }
    return `<div class="battle-log-line ${className}"><span class="${pillClass}"${pillStyle ? ` style="${pillStyle}"` : ''}>${escHtml(line)}</span></div>`;
}

function updateBattlePlaybackStatus(text, done=false) {
    const statusEl = document.getElementById('battle-playback-status');
    const skipBtn = document.getElementById('battle-skip-btn');
    if (statusEl) statusEl.textContent = text;
    if (skipBtn) {
        skipBtn.classList.toggle('hidden', done);
        skipBtn.disabled = done;
    }
}

function finalizeBattlePlayback() {
    clearBattlePlaybackTimer();
    const logEl = document.getElementById('battle-log');
    const out = document.getElementById('battle-outcome');
    if (!battlePlaybackMeta || !logEl || !out) return;
    const { log, enemyName, won, summary, dmgDealt, dmgTaken, tutorialMessage, isDraw } = battlePlaybackMeta;

    logEl.innerHTML = log.map(line => renderBattleLogLine(line, enemyName, getBattleLogTintRole(line, enemyName))).join('');

    // Add tutorial completion message if present
    if (tutorialMessage) {
        logEl.insertAdjacentHTML('beforeend', `
            <div class="battle-log-line tutorial-over-msg" style="margin-top:16px; padding:12px; background:rgba(46,204,113,0.1); border:1px solid rgba(46,204,113,0.3); border-radius:8px; color:#2ecc71; font-weight:600; line-height:1.5;">
                ${tutorialMessage}
            </div>
        `);
    }

    logEl.scrollTop = logEl.scrollHeight;
    out.className = isDraw ? 'draw battle-outcome battle-outcome-visible' : (won ? 'won battle-outcome battle-outcome-visible' : 'lost battle-outcome battle-outcome-visible');
    out.innerHTML = isDraw
        ? `🤝 DRAW!<br><small style="font-size:0.75rem;color:var(--text-dim)">${summary} · ⚔️ ${dmgDealt ?? '?'} dmg dealt · 💔 ${dmgTaken ?? '?'} dmg taken</small>`
        : won
            ? `🏆 VICTORY!<br><small style="font-size:0.75rem;color:var(--text-dim)">${summary} · ⚔️ ${dmgDealt ?? '?'} dmg dealt · 💔 ${dmgTaken ?? '?'} dmg taken</small>`
            : `💀 DEFEATED<br><small style="font-size:0.75rem;color:var(--text-dim)">${summary} · ⚔️ ${dmgDealt ?? '?'} dmg dealt · 💔 ${dmgTaken ?? '?'} dmg taken</small>`;
    updateBattlePlaybackStatus('Battle complete', true);
}

function scheduleBattlePlaybackStep() {
    clearBattlePlaybackTimer();
    if (!battlePlaybackMeta) return;
    const logEl = document.getElementById('battle-log');
    if (!logEl) return;
    if (battlePlaybackIndex >= battlePlaybackQueue.length) {
        finalizeBattlePlayback();
        return;
    }
    const currentIndex = battlePlaybackIndex++;
    const line = battlePlaybackQueue[currentIndex];
    const renderedLine = renderBattleLogLine(line, battlePlaybackMeta.enemyName, getBattleLogTintRole(line, battlePlaybackMeta.enemyName));
    if (renderedLine) logEl.insertAdjacentHTML('beforeend', renderedLine);
    logEl.scrollTop = logEl.scrollHeight;
    const isSeparator = line === '---';
    const delay = isSeparator ? 450 : 1200;
    updateBattlePlaybackStatus(isSeparator ? 'Resetting stance...' : 'Action unfolding...');
    battlePlaybackTimer = setTimeout(scheduleBattlePlaybackStep, delay);
}

function startBattlePlayback(log, meta) {
    clearBattlePlaybackTimer();
    battlePlaybackMeta = { ...meta, log };
    battlePlaybackQueue = Array.isArray(log) ? [...log] : [];
    battlePlaybackIndex = 0;
    const logEl = document.getElementById('battle-log');
    const out = document.getElementById('battle-outcome');
    if (logEl) logEl.innerHTML = '';
    if (out) {
        out.className = `battle-outcome ${meta.isDraw ? 'draw' : meta.won ? 'won' : 'lost'}`;
        out.innerHTML = '<span class="battle-outcome-pending">Battle in progress...</span>';
    }
    if (alwaysSkipBattleAnimations) {
        finalizeBattlePlayback();
        return;
    }
    updateBattlePlaybackStatus('Battle starting...', false);
    scheduleBattlePlaybackStep();
}

function skipBattlePlayback() {
    finalizeBattlePlayback();
}

function getMyAttackBlockReason() {
    if (character?.trainingActive) return 'Training active';
    if (character?.trainingDone) return 'Collect training first';
    if (window.activeMission) return 'Mission in progress';
    const myBattleCd = character?.battle_cooldown_remaining || 0;
    if (myBattleCd > 0) return `Wait ${Math.ceil(myBattleCd / 60)}m to fight again`;
    return '';
}

// ── Matchmaking ────────────────────────────────────────────────────────────
let _matchmakingTarget = null;
async function findOpponent(direction='similar') {
    const box = document.getElementById('matchmaking-box');
    if (box) box.innerHTML = '<p class="loading">Finding opponent...</p>';
    try {
        const p = await api('GET', `/game/matchmaking?direction=${direction}`);
        _matchmakingTarget = p;
        if (!p) { if (box) box.innerHTML = '<p class="empty">No available opponents right now.</p>'; return; }
        const ciHtml = classRuneHtml(p.class);
        const power = (p.strength||0)+(p.defense||0)+(p.agility||0)+(p.magic||0)+p.level*5;
        const myPower = character ? (character.strength+character.defense+character.agility+character.magic+character.level*5) : 0;
        const powerDiff = power - myPower;
        const myAttackBlockReason = getMyAttackBlockReason();
        const isBattleCdBlock = myAttackBlockReason && myAttackBlockReason.startsWith('Wait ');
        const hasOtherBlock = myAttackBlockReason && !isBattleCdBlock;
        const canSkipPvpCd = isBattleCdBlock && (character?.gems || 0) >= 1;
        const attackBtn = myAttackBlockReason
            ? (canSkipPvpCd
                ? `<div style="display:flex;flex-direction:column;gap:4px"><button class="btn-attack" disabled style="opacity:0.4;cursor:not-allowed">🛡️ ${myAttackBlockReason}</button><button class="btn-attack" style="border-color:#9b59b6;color:#9b59b6;padding:4px 8px;font-size:0.7rem" ${actionAttrs('skipBattleCdAndAttack', p.id, p.name, p.class, p.level)}>⚡ Skip cooldown for 1 💎</button></div>`
                : `<button class="btn-attack" disabled style="opacity:0.4;cursor:not-allowed" title="${myAttackBlockReason}">🛡️ ${myAttackBlockReason}</button>`)
            : `<button class="btn-attack" ${actionAttrs('attack', p.id, p.name, p.class, p.level)}>⚔️ Attack</button>`;
        const diffLabel = powerDiff > 10 ? '⬆️ Stronger' : powerDiff < -10 ? '⬇️ Weaker' : '↔️ Similar';
        if (box) box.innerHTML = `
            <div class="matchmaking-card">
                <div style="display:flex;align-items:center;gap:14px">
                    <img src="/images/class/${p.class}.png" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.15)" data-error-hide="true">
                    <div style="flex:1">
                        <div style="font-size:1rem;font-weight:700;color:#fff;cursor:pointer" ${actionAttrs('openProfile', p.id)}>${ciHtml} ${escHtml(p.name)}</div>
                        <div style="font-size:0.78rem;color:var(--text-dim)">Lv.${p.level} ${capitalize(p.class)} · ${p.wins}W/${p.losses}L${(p.draws||0)?`/${p.draws}D`:''}</div>
                        <div style="font-size:0.72rem;margin-top:3px;color:var(--gold)">${diffLabel} · Power ${power}</div>
                    </div>
                    ${attackBtn}
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                <button class="btn-secondary" style="flex:1" ${actionAttrs('findOpponent', 'weaker')}>⬇️ Weaker</button>
                <button class="btn-secondary" style="flex:1" ${actionAttrs('findOpponent', 'similar')}>↔️ Similar</button>
                <button class="btn-secondary" style="flex:1" ${actionAttrs('findOpponent', 'stronger')}>⬆️ Stronger</button>
            </div>`;
    } catch(e) { if (box) box.innerHTML = `<p class="empty">${e.message}</p>`; }
}
async function attack(targetId,targetName,targetClass=null,targetLevel=null) {
    if ((character?.hp_current??character?.hp_max)<=0){alert('You are out of HP! Wait for regeneration.');return;}
    const blockReason = getMyAttackBlockReason();
    if (blockReason) { alert(blockReason); return; }
    try {
        const r=await api('POST',`/game/attack/${targetId}`);
        character=r.character;
        renderTopBar();
        if (document.getElementById('tab-character')?.classList.contains('active')) renderCharacter();

        // Show level up modal if applicable
        if (r.atkLevelUpMessage) {
            await openGameDialog({
                title: '🎉 Level Up!',
                message: r.atkLevelUpMessage,
                confirmLabel: 'Awesome!',
                showCancel: false
            });
        }

        showBattleResult(r,targetId,targetName,targetClass,r.opponentLevel ?? targetLevel);
    }
    catch(e) { alert(e.message); }
}
function showBattleResult(r, targetId, targetName, targetClass=null, targetLevel=null) {
    const xpSummary = `${r.xpGained >= 0 ? '+' : ''}${r.xpGained} XP`;
    const summary = r.isDraw
        ? `Draw! No gold lost`
        : r.won
            ? `+${r.goldGained} gold · ${xpSummary}`
            : `-${r.goldLost} gold`;
    showBattleReportModal(r.log, r.won, summary, r.totalDmgDealt, r.totalDmgTaken, {
        enemyName: targetName,
        enemyClass: targetClass,
        enemyLevel: targetLevel ?? (_matchmakingTarget && String(_matchmakingTarget.id) === String(targetId) ? _matchmakingTarget.level : null),
        battleType: 'pvp',
        battleStats: r.battleStats || null,
        isDraw: r.isDraw
    });
}

function formatBattleDamageStat(s) {
    if (!s) return '—';
    const min = Number(s.dmgMin ?? 0);
    const max = Number(s.dmgMax ?? 0);
    const elem = Number(s.elemDmg ?? 0);
    const phys = min === max ? `${min}` : `${min}-${max}`;
    return elem > 0 ? `${phys} +${elem} elem` : phys;
}

function renderBattleStatsPanel(battleStats, enemyName) {
    if (!battleStats || (!battleStats.you && !battleStats.enemy)) return '';
    const you = battleStats.you || {};
    const enemy = battleStats.enemy || {};
    const rows = [
        ['Damage (Phys+Elem)', formatBattleDamageStat(you), formatBattleDamageStat(enemy)],
        ['Armor', Number(you.armor ?? 0).toLocaleString(), Number(enemy.armor ?? 0).toLocaleString()],
        ['Magic', Number(you.magic ?? 0).toLocaleString(), Number(enemy.magic ?? 0).toLocaleString()],
        ['HP', Number(you.hp ?? 0).toLocaleString(), Number(enemy.hp ?? 0).toLocaleString()],
        ['Agility', Number(you.agility ?? 0).toLocaleString(), Number(enemy.agility ?? 0).toLocaleString()],
        ['Hit Chance', Number(you.hitChance ?? 0).toLocaleString(), Number(enemy.hitChance ?? 0).toLocaleString()],
        ['Crit Chance', Number(you.critChance ?? 0).toLocaleString(), Number(enemy.critChance ?? 0).toLocaleString()],
    ];
    return `
        <div class="battle-stats-grid">
            ${rows.map(([k, vYou, vEnemy]) => `
                <div class="battle-stats-v battle-stats-v-left">${escHtml(String(vYou))}</div>
                <div class="battle-stats-k battle-stats-k-mid">${escHtml(k)}</div>
                <div class="battle-stats-v battle-stats-v-right">${escHtml(String(vEnemy))}</div>
            `).join('')}
        </div>
    `;
}

function showBattleReportModal(log, won, summary, dmgDealt, dmgTaken, options = {}) {
    const modal = document.getElementById('battle-result-modal');
    if (!modal) { showMissionModal(summary); return; }

    const fighters = document.getElementById('battle-fighters');
    const statsEl = document.getElementById('battle-stats');
    const battleLog = Array.isArray(log) ? log : [];

    let enemyName = options.enemyName || 'Enemy';
    const vsLine = battleLog.find(l => l.includes(' vs '));
    if (vsLine) {
        const parts = vsLine.split(' vs ');
        const left = (parts[0] || '').trim();
        const right = (parts[1] || '').trim();
        const myName = String(character?.name || '').trim();
        if (myName && left === myName && right) enemyName = right;
        else if (myName && right === myName && left) enemyName = left;
        else if (!options.enemyName && right) enemyName = right;
    }
    const enemyClass = options.enemyClass || null;
    const isPvp = options.battleType === 'pvp';
    const isMission = options.battleType === 'mission';
    const missionVisual = options.battleType === 'mission'
        ? findMissionVisualByName(options.missionName || enemyName)
        : null;

    if (fighters && character) {
        fighters.innerHTML = `
            ${buildBattleShowcaseCard({
            name: character.name,
            className: character.class,
            level: character.level,
            splash: true,
            fallback: '⚔️',
            side: 'left'
        })}
            <div class="fighter-vs">VS</div>
            ${buildBattleShowcaseCard({
            name: options.battleType === 'mission' ? (options.missionName || enemyName) : enemyName,
            className: enemyClass,
            level: options.enemyLevel || null,
            splash: true,
            fallback: enemyClass ? '⚔️' : '👾',
            side: 'right',
            imageSrc: missionVisual?.img || null,
            metaText: missionVisual
                ? [missionVisual.spotName, missionVisual.zoneName].filter(Boolean).join(' · ')
                : ''
        })}`;
    }

    if (statsEl) {
        statsEl.innerHTML = renderBattleStatsPanel(options.battleStats || null, enemyName);
    }

    modal.classList.remove('hidden');
    startBattlePlayback(battleLog, {
        won, summary, dmgDealt, dmgTaken, enemyName,
        tutorialMessage: options.tutorialMessage,
        isDraw: options.isDraw
    });
}

function closeBattle() {
    clearBattlePlaybackTimer();
    battlePlaybackQueue = [];
    battlePlaybackIndex = 0;
    battlePlaybackMeta = null;
    document.getElementById('battle-result-modal').classList.add('hidden');
    renderCharacter();
}

// ── History ───────────────────────────────────────────────────────────────
async function loadHistory() {
    const list=document.getElementById('history-list'); list.innerHTML='<p class="loading">Loading...</p>';
    try {
        const battles=await api('GET','/game/battles');
        if (!battles.length){list.innerHTML='<p class="empty">No battles yet.</p>';return;}
        const myId=character.id;
        list.innerHTML=battles.map(b=>{
            const isDraw=b.winner_id===0, won=b.winner_id===myId, opp=b.attacker_id===myId?b.defender_name:b.attacker_name;
            const type=b.battle_type==='mission'?'⚔️ Mission':b.attacker_id===myId?'⚔️ Attacked':'🛡️ Defended vs';
            const resultCls=isDraw?'draw':(won?'won':'lost');
            const resultLabel=isDraw?'🤝 DRAW':(won?'🏆 WIN':'💀 LOSS');
            return `<div class="history-item" ${actionAttrs('showHistoryLog', b.log, b.attacker_name, b.defender_name, isDraw)}>
        <div class="history-header"><div class="history-vs">${type} <strong>${opp}</strong></div><div class="history-result ${resultCls}">${resultLabel}</div></div>
        <div class="history-date">${new Date(b.fought_at*1000).toLocaleDateString()}</div>
      </div>`;
        }).join('');
    } catch(e) { list.innerHTML=`<p class="loading">${e.message}</p>`; }
}
function showHistoryLog(logJson,a,d,isDraw) {
    const log=typeof logJson==='string'?JSON.parse(logJson):logJson;
    showBattleReportModal(log, false, `📜 ${a} vs ${d}`, null, null, {
        enemyName: d,
        battleType: 'history',
        isDraw
    });
}

// ── Inbox ─────────────────────────────────────────────────────────────────
window._reportCache = {};
async function loadInbox() {
    const el=document.getElementById('inbox-content'); el.innerHTML='<p class="loading">Loading...</p>';
    try {
        const messages=await api('GET','/game/messages');
        window._reportCache = {};

        // Separate messages into categories
        const messagesList = [];
        const battlesList = [];
        const missionsList = [];

        messages.forEach(m => {
            const isReport = m.body && m.body.startsWith('BATTLE_REPORT:');
            if (isReport) {
                let report = null;
                try { report = JSON.parse(m.body.slice('BATTLE_REPORT:'.length)); } catch {}
                if (report) window._reportCache[m.id] = report;
                const isMission = report?.type === 'mission';
                if (isMission) missionsList.push({ ...m, report });
                else battlesList.push({ ...m, report });
            } else {
                messagesList.push(m);
            }
        });

        // Sort each by date (newest first)
        messagesList.sort((a,b) => (b.sent_at || 0) - (a.sent_at || 0));
        battlesList.sort((a,b) => (b.sent_at || 0) - (a.sent_at || 0));
        missionsList.sort((a,b) => (b.sent_at || 0) - (a.sent_at || 0));

        let html=`<div class="inbox-tabs">
            <button class="inbox-tab active" ${actionAttrs('filterInbox', 'messages')}>💬 Messages (${messagesList.length})</button>
            <button class="inbox-tab" ${actionAttrs('filterInbox', 'battles')}>⚔️ Battles (${battlesList.length})</button>
            <button class="inbox-tab" ${actionAttrs('filterInbox', 'missions')}>🎯 Missions (${missionsList.length})</button>
        </div>
        <div class="inbox-header"><button class="compose-btn" ${actionAttrs('openCompose', null, null)}>✉️ New Message</button></div>
        <div id="inbox-filtered-content"></div>`;

        // Store for filtering
        window._inboxData = { messages: messagesList, battles: battlesList, missions: missionsList };

        el.innerHTML=html;

        // Render current filter if available, otherwise default to messages
        renderInboxFilter(window._currentInboxFilter || 'messages');

        pollUnread();
    } catch(e) { el.innerHTML=`<p class="loading">${e.message}</p>`; }
}
function filterInbox(filter) {
    renderInboxFilter(filter);
}

function renderInboxFilter(filter) {
    window._currentInboxFilter = filter;
    const data = window._inboxData || {};
    const list = data[filter] || [];
    const container = document.getElementById('inbox-filtered-content');
    if (!container) return;

    const describeInboxReward = (payload) => {
        if (!payload) return '';
        let reward = payload;
        if (typeof reward === 'string') {
            try { reward = JSON.parse(reward); } catch { reward = null; }
        }
        if (!reward || typeof reward !== 'object') return '';
        const parts = [];
        if (reward.gold) parts.push(`💰 ${Number(reward.gold).toLocaleString()} gold`);
        if (reward.gems) parts.push(`💎 ${Number(reward.gems).toLocaleString()} gems`);
        if (reward.xp) parts.push(`⭐ ${Number(reward.xp).toLocaleString()} XP`);
        if (reward.lootbox?.id) parts.push(`📦 ${Number(reward.lootbox.qty || 1)}x ${reward.lootbox.id.replace(/_/g, ' ')}`);
        if (reward.material?.id && reward.material?.qty) parts.push(`🧱 ${Number(reward.material.qty).toLocaleString()}x ${reward.material.id.replace(/_/g, ' ')}`);
        return parts.join(' · ');
    };

    const renderMsgRow = (m) => {
        const dateStr = formatDate(m.sent_at);
        const rewardSummary = describeInboxReward(m.reward_payload);
        const claimableReward = !!rewardSummary && !Number(m.reward_claimed || 0);
        const isSystem = Number(m.system_message || 0) !== 0;
        return `<div class="msg-row ${m.read?'':'unread'}" id="msg-${m.id}">
            <div class="msg-header">
                <div class="msg-meta">
                    <span class="msg-tag ${claimableReward ? 'tag-mission' : 'tag-personal'}">${claimableReward ? 'Reward' : 'Message'}</span>
                    <span class="msg-date">${dateStr}</span>
                </div>
                <div class="msg-from ${m.read?'':'unread-from'}">From: ${escHtml(m.sender_name)}</div>
            </div>
            <div class="msg-subject">${escHtml(m.subject)}</div>
            ${rewardSummary ? `<div class="msg-summary-line">${rewardSummary}${Number(m.reward_claimed || 0) ? ' · <span class="gain">Claimed</span>' : ''}</div>` : ''}
            <div class="msg-body-full" style="display:none">${escHtml(m.body)}</div>
            <div class="msg-actions" style="display:none">
                ${!isSystem ? `<button class="btn-sm" ${actionAttrs('openCompose', m.sender_id, m.sender_name)}>↩ Reply</button>` : ''}
                ${claimableReward ? `<button class="btn-sm" ${actionAttrs('claimMessageReward', m.id)}>🎁 Claim Reward</button>` : ''}
                ${!m.read ? `<button class="btn-sm" ${actionAttrs('markInboxRead', m.id)}>✓ Mark Read</button>` : ''}
                <button class="btn-sm danger" ${actionAttrs('deleteMessage', m.id)}>🗑 Delete</button>
            </div>
        </div>`;
    };

    const renderBattleRow = (m) => {
        const report = m.report;
        const dateStr = formatDate(m.sent_at);
        const icon = report?.won ? '🏆' : '⚔️';
        return `<div class="msg-row ${m.read?'':'unread'} report-row" id="msg-${m.id}">
            <div class="msg-header">
                <div class="msg-meta">
                    <span class="msg-tag tag-battle">Battle</span>
                    <span class="msg-date">${dateStr}</span>
                </div>
                <div class="msg-from ${m.read?'':'unread-from'}">${icon} ${escHtml(m.subject)}</div>
            </div>
            ${report ? `<div class="msg-summary-line">
                ${report.opponentName ? `vs ${escHtml(report.opponentName)}` : ''}
                ${report.goldEarned ? ` · <span class="gain">💰 +${report.goldEarned}</span>` : ''}
                ${report.gemsEarned ? ` · <span class="gain">💎 +${report.gemsEarned}</span>` : ''}
                ${report.goldLost   ? ` · <span class="loss">💸 -${report.goldLost}</span>`  : ''}
                ${report.xpEarned ? ` · <span class="${report.xpEarned >= 0 ? 'gain' : 'loss'}">⭐ ${report.xpEarned >= 0 ? '+' : ''}${report.xpEarned} XP</span>` : ''}
                ${report.totalDmgDealt ? ` · <span style="color:#e74c3c">⚔️ ${report.totalDmgDealt} dealt</span>` : ''}
            </div>` : ''}
            <div class="msg-actions" style="display:flex;">
                <button class="btn-sm" ${actionAttrs('viewBattleReport', m.id)}>📜 View Report</button>
                ${!m.read ? `<button class="btn-sm" ${actionAttrs('markInboxRead', m.id)}>✓ Mark Read</button>` : ''}
                <button class="btn-sm btn-icon-only danger" ${actionAttrs('deleteMessage', m.id)} title="Delete">🗑</button>
            </div>
        </div>`;
    };

    const renderMissionRow = (m) => {
        const report = m.report;
        const dateStr = formatDate(m.sent_at);
        const icon = report?.won ? '✅' : '💀';
        return `<div class="msg-row ${m.read?'':'unread'} report-row" id="msg-${m.id}">
            <div class="msg-header">
                <div class="msg-meta">
                    <span class="msg-tag tag-mission">Mission</span>
                    <span class="msg-date">${dateStr}</span>
                </div>
                <div class="msg-from ${m.read?'':'unread-from'}">${icon} ${escHtml(m.subject)}</div>
            </div>
            ${report ? `<div class="msg-summary-line">
                vs ${escHtml(report.opponentName||report.npcName||'?')}
                ${report.goldEarned ? ` · <span class="gain">💰 +${report.goldEarned}</span>` : ''}
                ${report.goldLost   ? ` · <span class="loss">💸 -${report.goldLost}</span>`  : ''}
                ${report.xpEarned ? ` · <span class="${report.xpEarned >= 0 ? 'gain' : 'loss'}">⭐ ${report.xpEarned >= 0 ? '+' : ''}${report.xpEarned} XP</span>` : ''}
            </div>` : ''}
            <div class="msg-actions" style="display:flex;">
                <button class="btn-sm" ${actionAttrs('viewBattleReport', m.id)}>📜 View Report</button>
                ${!m.read ? `<button class="btn-sm" ${actionAttrs('markInboxRead', m.id)}>✓ Mark Read</button>` : ''}
                <button class="btn-sm btn-icon-only danger" ${actionAttrs('deleteMessage', m.id)} title="Delete">🗑</button>
            </div>
        </div>`;
    };

    if (!list.length) {
        container.innerHTML = '<p class="empty">No items in this category.</p>';
        return;
    }

    const renderFn = filter === 'messages' ? renderMsgRow : (filter === 'battles' ? renderBattleRow : renderMissionRow);
    container.innerHTML = `<div class="inbox-list">${list.map(renderFn).join('')}</div>`;

    // Re-attach click handlers for messages
    if (filter === 'messages') {
        list.forEach(m => {
            const row = document.getElementById(`msg-${m.id}`);
            if (!row) return;
            row.addEventListener('click', async (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                const b = row.querySelector('.msg-body-full');
                const ac = row.querySelector('.msg-actions');
                const exp = b.style.display !== 'none';
                b.style.display = exp ? 'none' : 'block';
                ac.style.display = exp ? 'none' : 'flex';
            });
        });
    }

    pollUnread();

    // Update tab UI
    document.querySelectorAll('.inbox-tab').forEach(t => {
        t.classList.toggle('active', parseActionArgs(t)?.[0] === filter);
    });
}

function viewBattleReport(msgId) {
    const report = window._reportCache?.[msgId];
    if (!report) { alert('Report not found. Try reloading the inbox.'); return; }
    const summary = [
        report.isDraw ? '🤝 Draw' : (report.won ? '✅ Victory' : '💀 Defeated'),
        report.goldEarned ? `💰 ${report.goldEarned > 0 ? '+' : ''}${report.goldEarned} gold` : null,
        report.gemsEarned ? `💎 ${report.gemsEarned > 0 ? '+' : ''}${report.gemsEarned} gem${report.gemsEarned > 1 ? 's' : ''}` : null,
        report.xpEarned ? `⭐ ${report.xpEarned >= 0 ? '+' : ''}${report.xpEarned} XP` : null
    ].filter(Boolean).join(' · ');
    showBattleReportModal(report.log, report.won, summary, report.totalDmgDealt, report.totalDmgTaken, {
        enemyName: report.opponentName || report.npcName || 'Enemy',
        enemyClass: report.opponentClass || null,
        enemyLevel: report.opponentLevel ?? report.npcLevel ?? null,
        missionName: report.missionName || '',
        battleType: report.type === 'pvp' ? 'pvp' : report.type === 'tournament' ? 'tournament' : 'mission',
        battleStats: report.battleStats || null,
        isDraw: report.isDraw
    });
}
async function markInboxRead(id, refreshInbox = true) {
    const data = window._inboxData || {};
    ['messages', 'battles', 'missions'].forEach(key => {
        const list = data[key];
        if (!Array.isArray(list)) return;
        const msg = list.find(entry => String(entry.id) === String(id));
        if (msg) msg.read = 1;
    });
    const row = document.getElementById(`msg-${id}`);
    if (row) {
        row.classList.remove('unread');
        const from = row.querySelector('.msg-from');
        if (from) from.classList.remove('unread-from');
        const btn = row.querySelector('[data-action="markInboxRead"]');
        if (btn) btn.remove();
    }
    await api('POST', `/game/messages/${id}/read`);
    if (refreshInbox && document.getElementById('tab-inbox')?.classList.contains('active') && !row) {
        renderInboxFilter(window._currentInboxFilter || 'messages');
    } else {
        pollUnread();
    }
}
async function deleteMessage(id) { try { await api('DELETE',`/game/messages/${id}`); loadInbox(); } catch(e) { alert(e.message); } }
async function claimMessageReward(id) {
    try {
        const result = await api('POST', `/game/messages/${id}/claim-reward`);
        if (result?.character) {
            character = result.character;
            renderTopBar();
        }
        loadInbox();
    } catch (e) {
        console.error('Claim reward failed:', e);
        await openGameDialog({
            title: 'Reward Claim Failed',
            message: e.message || 'Could not claim this reward.',
            confirmLabel: 'Close',
            showCancel: false
        });
    }
}

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
function formatChatTime(ts) {
    if (!ts) return '--:--';
    return new Date(Number(ts) * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function setChatWidgetStatus(message = '', isError = false) {
    chatStatusText = String(message || '');
    chatStatusIsError = !!isError;
    if (chatStatusTimer) clearTimeout(chatStatusTimer);
    if (chatStatusText) {
        chatStatusTimer = setTimeout(() => {
            chatStatusText = '';
            chatStatusIsError = false;
            renderChatWidget();
        }, 3200);
    }
    renderChatWidget();
}

function syncChatRecipientUi() {
    const recipientInput = document.getElementById('chat-recipient-input');
    const clearBtn = document.querySelector('.chat-widget-target-clear');
    const subtitle = document.querySelector('.chat-widget-subtitle');
    const messageInput = document.getElementById('chat-message-input');
    const recipientDraft = String(recipientInput?.value || chatPmTarget || '').trim();
    chatPmTarget = recipientDraft;
    if (chatActiveView === 'private' && recipientDraft) {
        chatActivePmThread = recipientDraft;
    }
    const canSendPm = recipientDraft.trim().length > 0;
    if (clearBtn) {
        clearBtn.textContent = canSendPm ? 'Clear PM' : 'Clear';
        clearBtn.classList.toggle('active', canSendPm);
    }
    if (subtitle) {
        subtitle.textContent = chatActiveView === 'private'
            ? (canSendPm ? `Private with ${recipientDraft}` : 'Choose a private thread')
            : 'World channel';
    }
    if (messageInput) {
        messageInput.placeholder = chatActiveView === 'private'
            ? (canSendPm ? 'Send private message…' : 'Choose or enter a character name…')
            : 'Send global message…';
    }
}

function isChatWidgetAvailable() {
    return !!token &&
        !!character &&
        chatEnabled;
}

function trimChatMessages(list) {
    return (Array.isArray(list) ? list : []).slice(-60);
}

function renderChatSuggestions() {
    const recipientBox = document.getElementById('chat-recipient-suggestions');
    if (recipientBox) {
        recipientBox.innerHTML = chatRecipientSuggestions.length
            ? chatRecipientSuggestions.map(entry => `
                <button class="chat-suggest-item" ${actionAttrs('chooseChatRecipientSuggestion', entry.name)} data-no-action-lock="true">
                    <span class="chat-suggest-name">${escHtml(entry.name)}</span>
                </button>
            `).join('')
            : '';
        recipientBox.classList.toggle('hidden', !chatRecipientSuggestions.length);
    }

    const mentionBox = document.getElementById('chat-mention-suggestions');
    if (mentionBox) {
        mentionBox.innerHTML = chatMentionSuggestions.length
            ? chatMentionSuggestions.map(entry => `
                <button class="chat-suggest-item" ${actionAttrs('chooseChatMentionSuggestion', entry.name)} data-no-action-lock="true">
                    <span class="chat-suggest-name">@${escHtml(entry.name)}</span>
                </button>
            `).join('')
            : '';
        mentionBox.classList.toggle('hidden', !chatMentionSuggestions.length);
    }
}

function clearChatSuggestions(kind = 'all') {
    if (kind === 'recipient' || kind === 'all') chatRecipientSuggestions = [];
    if (kind === 'mention' || kind === 'all') {
        chatMentionSuggestions = [];
        chatMentionRange = null;
    }
    renderChatSuggestions();
}

async function fetchChatCharacterSuggestions(query = '', kind = 'recipient') {
    const currentRequestId = ++chatSuggestionRequestId;
    try {
        const data = await api('GET', `/game/chat/characters?q=${encodeURIComponent(String(query || '').trim())}`);
        if (currentRequestId !== chatSuggestionRequestId) return;
        const nextList = Array.isArray(data?.characters) ? data.characters : [];
        if (kind === 'recipient') {
            chatRecipientSuggestions = nextList;
        } else {
            chatMentionSuggestions = nextList;
        }
        renderChatSuggestions();
    } catch (e) {
        console.error('Chat suggestions failed:', e);
        if (kind === 'recipient') chatRecipientSuggestions = [];
        else chatMentionSuggestions = [];
        renderChatSuggestions();
    }
}

function queueChatSuggestionFetch(query = '', kind = 'recipient') {
    if (chatSuggestionTimer) clearTimeout(chatSuggestionTimer);
    chatSuggestionTimer = setTimeout(() => {
        fetchChatCharacterSuggestions(query, kind);
    }, 120);
}

function getActiveChatMentionQuery(input) {
    if (!input) return null;
    const caret = Number(input.selectionStart ?? input.value.length);
    const left = String(input.value || '').slice(0, caret);
    const match = left.match(/(^|\s)@([A-Za-z0-9_]*)$/);
    if (!match) return null;
    const fullMatch = match[0];
    const query = match[2] || '';
    return {
        start: caret - fullMatch.length + fullMatch.indexOf('@'),
        end: caret,
        query
    };
}

function getChatPrivateThreadKey(msg) {
    if (!msg?.is_private) return '';
    return String(msg.is_outgoing ? (msg.recipient_name || '') : (msg.sender_name || '')).trim();
}

function getChatReadStateStorageKey() {
    const charId = Number(character?.id || 0);
    return charId ? `rpg_chat_read_state_${charId}` : '';
}

function persistChatReadState() {
    const key = getChatReadStateStorageKey();
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify({
            global: Number(chatSeenGlobalId || 0),
            pm: chatSeenPmThreadIds || {}
        }));
    } catch {}
}

function ensureChatReadStateLoaded() {
    const charId = Number(character?.id || 0);
    if (!charId) return false;
    if (chatReadStateForCharId === charId) return chatReadStateLoadedFromStorage;
    chatReadStateForCharId = charId;
    chatSeenGlobalId = 0;
    chatSeenPmThreadIds = {};
    chatHighlightedGlobalIds = new Set();
    chatHighlightedPmIds = new Set();
    chatReadStateLoadedFromStorage = false;
    const key = getChatReadStateStorageKey();
    if (!key) return false;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        chatSeenGlobalId = Number(parsed?.global || 0);
        chatSeenPmThreadIds = parsed?.pm && typeof parsed.pm === 'object' ? parsed.pm : {};
        chatReadStateLoadedFromStorage = true;
        return true;
    } catch {
        return false;
    }
}

function getUnreadGlobalMessageIds() {
    ensureChatReadStateLoaded();
    return trimChatMessages(chatMessages)
        .filter(msg => !msg?.is_private && !msg?.is_outgoing && Number(msg?.id || 0) > Number(chatSeenGlobalId || 0))
        .map(msg => Number(msg.id || 0));
}

function getUnreadPrivateMessageIds(threadKey = '') {
    ensureChatReadStateLoaded();
    const key = String(threadKey || '').trim();
    if (!key) return [];
    const seenId = Number(chatSeenPmThreadIds?.[key] || 0);
    return trimChatMessages(chatMessages)
        .filter(msg => msg?.is_private && !msg?.is_outgoing && getChatPrivateThreadKey(msg) === key && Number(msg?.id || 0) > seenId)
        .map(msg => Number(msg.id || 0));
}

function hasUnreadPrivateThreads() {
    return getPrivateChatThreads().some(thread => thread.unread);
}

function markGlobalMessagesRead(highlight = true) {
    ensureChatReadStateLoaded();
    const unreadIds = getUnreadGlobalMessageIds();
    chatHighlightedGlobalIds = highlight ? new Set(unreadIds) : new Set();
    const latestGlobalId = trimChatMessages(chatMessages)
        .filter(msg => !msg?.is_private && !msg?.is_outgoing)
        .reduce((max, msg) => Math.max(max, Number(msg?.id || 0)), Number(chatSeenGlobalId || 0));
    if (latestGlobalId > Number(chatSeenGlobalId || 0)) {
        chatSeenGlobalId = latestGlobalId;
        persistChatReadState();
    }
}

function markPrivateThreadRead(threadKey, highlight = true) {
    ensureChatReadStateLoaded();
    const key = String(threadKey || '').trim();
    if (!key) {
        chatHighlightedPmIds = new Set();
        return;
    }
    const unreadIds = getUnreadPrivateMessageIds(key);
    chatHighlightedPmIds = highlight ? new Set(unreadIds) : new Set();
    const latestThreadId = trimChatMessages(chatMessages)
        .filter(msg => msg?.is_private && !msg?.is_outgoing && getChatPrivateThreadKey(msg) === key)
        .reduce((max, msg) => Math.max(max, Number(msg?.id || 0)), Number(chatSeenPmThreadIds?.[key] || 0));
    if (latestThreadId > Number(chatSeenPmThreadIds?.[key] || 0)) {
        chatSeenPmThreadIds[key] = latestThreadId;
        persistChatReadState();
    }
}

function getPrivateChatThreads() {
    const threadMap = new Map();
    for (const msg of trimChatMessages(chatMessages)) {
        if (!msg?.is_private) continue;
        const key = getChatPrivateThreadKey(msg);
        if (!key) continue;
        const existing = threadMap.get(key);
        if (!existing || Number(msg.created_at || 0) >= Number(existing.latestAt || 0)) {
            threadMap.set(key, {
                key,
                latestAt: Number(msg.created_at || 0),
                unread: false
            });
        }
    }
    for (const msg of trimChatMessages(chatMessages)) {
        if (!msg?.is_private || msg?.is_outgoing) continue;
        const key = getChatPrivateThreadKey(msg);
        if (!key) continue;
        if (getUnreadPrivateMessageIds(key).length > 0 && threadMap.has(key)) {
            threadMap.get(key).unread = true;
        }
    }
    return Array.from(threadMap.values())
        .filter(thread => !chatClosedPmThreads.has(thread.key))
        .sort((a, b) => Number(b.latestAt || 0) - Number(a.latestAt || 0));
}

function getFilteredChatMessages() {
    const safeMessages = trimChatMessages(chatMessages);
    if (chatActiveView === 'private') {
        const threadKey = String(chatActivePmThread || chatPmTarget || '').trim();
        if (!threadKey) return [];
        return safeMessages.filter(msg => msg?.is_private && getChatPrivateThreadKey(msg) === threadKey);
    }
    return safeMessages.filter(msg => !msg?.is_private);
}

function getVisibleChatMessages() {
    const safeMessages = getFilteredChatMessages();
    return chatExpanded ? safeMessages : safeMessages.slice(-8);
}

function appendChatMessages(messages = []) {
    if (!Array.isArray(messages) || !messages.length) return;
    ensureChatReadStateLoaded();
    const seen = new Set(chatMessages.map(msg => Number(msg.id)));
    let readStateChanged = false;
    for (const msg of messages) {
        const id = Number(msg?.id || 0);
        if (!id || seen.has(id)) continue;
        chatMessages.push(msg);
        seen.add(id);
        if (msg?.is_private) {
            const threadKey = getChatPrivateThreadKey(msg);
            if (threadKey) chatClosedPmThreads.delete(threadKey);
        }
        if (msg?.is_private && !msg?.is_outgoing) {
            const threadKey = getChatPrivateThreadKey(msg);
            const activeThreadKey = String(chatActivePmThread || chatPmTarget || '').trim();
            if (!chatWidgetCollapsed && chatActiveView === 'private' && threadKey && threadKey === activeThreadKey) {
                chatHighlightedPmIds.add(id);
                if (id > Number(chatSeenPmThreadIds?.[threadKey] || 0)) {
                    chatSeenPmThreadIds[threadKey] = id;
                    readStateChanged = true;
                }
            }
        } else if (!msg?.is_private && !msg?.is_outgoing) {
            if (!chatWidgetCollapsed && chatActiveView === 'global') {
                chatHighlightedGlobalIds.add(id);
                if (id > Number(chatSeenGlobalId || 0)) {
                    chatSeenGlobalId = id;
                    readStateChanged = true;
                }
            }
        }
    }
    chatMessages = trimChatMessages(chatMessages).sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    chatLatestId = chatMessages.reduce((max, msg) => Math.max(max, Number(msg?.id || 0)), 0);
    if (readStateChanged) persistChatReadState();
    if (typeof syncTopbarChatAlert === 'function') {
        syncTopbarChatAlert();
    }
}

function updateChatMessagesDOM() {
    const container = document.getElementById('chat-widget-messages');
    if (!container) return;
    const visibleMessages = getVisibleChatMessages();
    const expanded = chatExpanded;
    const messagesHtml = visibleMessages.map(msg => {
        const privateLabel = msg.is_private ? (msg.is_outgoing ? `to ${escHtml(msg.recipient_name || '')}` : 'PM') : 'Global';
        const isOwn = msg.is_outgoing;
        const editedTag = msg.edited ? ' <span style="opacity:0.5">(edited)</span>' : '';
        return `
            <div class="chat-line ${msg.is_private ? 'private' : 'global'} ${msg.is_outgoing ? 'outgoing' : 'incoming'}">
                <div class="chat-line-meta">
                    <span class="chat-line-time">${formatChatTime(msg.created_at)}</span>
                    <span class="chat-line-author">${escHtml(msg.sender_name || 'Unknown')}</span>
                    <span class="chat-line-channel">${privateLabel}</span>
                    ${(() => {
            const btns = [];
            if (!isOwn) {
                btns.push(`<button class="chat-pm-btn" ${actionAttrs('pmChatMessage', msg.id)} data-no-action-lock="true" title="Send PM">✉</button>`);
                btns.push(`<button class="chat-reply-btn" ${actionAttrs('replyChatMessage', msg.id)} data-no-action-lock="true" title="Reply">↩</button>`);
            }
            if (isOwn) {
                btns.push(`<button class="chat-edit-btn" ${actionAttrs('editChatMessage', msg.id)} data-no-action-lock="true" title="Edit message">✏️</button>`);
                btns.push(`<button class="chat-delete-btn" ${actionAttrs('deleteChatMessage', msg.id)} data-no-action-lock="true" title="Delete message">🗑️</button>`);
            }
            return btns.length ? `<div class="chat-line-actions">${btns.join('')}</div>` : '';
        })()}
                </div>
                <div class="chat-line-text">${escHtml(msg.message_text || '')}${editedTag}</div>
            </div>
        `;
    }).join('');
    const emptyHtml = '<div class="chat-empty">No messages yet. Say hello.</div>';
    container.innerHTML = messagesHtml || emptyHtml;
    container.scrollTop = container.scrollHeight;
}

async function loadChatHistory() {
    if (!isChatWidgetAvailable()) return;
    try {
        const input = document.getElementById('chat-message-input');
        const inputValue = input?.value || '';
        const recipientInput = document.getElementById('chat-recipient-input');
        const recipientValue = recipientInput?.value || '';
        const data = await api('GET', '/game/chat/history');
        const hadStoredReadState = ensureChatReadStateLoaded();
        chatMessages = trimChatMessages(data?.messages || []);
        chatLatestId = chatMessages.reduce((max, msg) => Math.max(max, Number(msg?.id || 0)), 0);
        if (!hadStoredReadState) {
            chatSeenGlobalId = trimChatMessages(chatMessages)
                .filter(msg => !msg?.is_private && !msg?.is_outgoing)
                .reduce((max, msg) => Math.max(max, Number(msg?.id || 0)), 0);
            chatSeenPmThreadIds = {};
            for (const msg of trimChatMessages(chatMessages)) {
                if (!msg?.is_private || msg?.is_outgoing) continue;
                const threadKey = getChatPrivateThreadKey(msg);
                if (!threadKey) continue;
                chatSeenPmThreadIds[threadKey] = Math.max(Number(chatSeenPmThreadIds[threadKey] || 0), Number(msg?.id || 0));
            }
            chatReadStateLoadedFromStorage = true;
            persistChatReadState();
        }
        renderChatWidget();
        if (input) input.value = inputValue;
        if (recipientInput) recipientInput.value = recipientValue;
    } catch (e) {
        console.error('Failed to load chat history:', e);
        setChatWidgetStatus(e.message || 'Failed to load chat.', true);
    }
}

async function pollChat() {
    if (!isChatWidgetAvailable()) return;
    try {
        const data = await api('GET', `/game/chat/history?since=${chatLatestId || 0}`);
        const incoming = data?.messages || [];
        if (!incoming.length) return;
        appendChatMessages(incoming);
        renderChatWidget();
    } catch (e) {
        console.error('Chat poll failed:', e);
    }
}

function syncChatPolling() {
    bustStaleChatState();
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = null;
    if (!isChatWidgetAvailable()) {
        renderChatWidget();
        return;
    }
    loadChatHistory();
    chatPollTimer = setInterval(() => { pollChat(); }, 4000);
}

function bindChatWidgetEvents() {
    const root = ensureChatWidgetRoot();
    if (!root || root.dataset.chatBoundV2 === 'true') return;
    root.addEventListener('keydown', async (event) => {
        if (event.target?.id !== 'chat-message-input') return;
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        await sendChatMessage();
    });
    root.addEventListener('input', (event) => {
        if (event.target?.id === 'chat-recipient-input') {
            chatPmTarget = String(event.target.value || '');
            if (chatActiveView === 'private') {
                chatActivePmThread = String(event.target.value || '').trim();
            }
            syncChatRecipientUi();
            return;
        }
        if (event.target?.id === 'chat-message-input') {
            const counter = document.getElementById('chat-widget-limit');
            if (counter) {
                const remaining = Math.max(0, 280 - String(event.target.value || '').length);
                counter.textContent = `${remaining} left`;
            }
        }
    });
    root.addEventListener('pointerdown', (event) => {
        if (isMobileChatDockMode()) return;
        const handle = event.target?.closest('.chat-widget-header');
        if (!handle) return;
        if (event.target?.closest('button,input,textarea')) return;
        const rect = root.getBoundingClientRect();
        chatDragState = {
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };
        root.classList.add('dragging');
        try { handle.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
    });
    window.addEventListener('pointermove', (event) => {
        if (isMobileChatDockMode()) return;
        if (!chatDragState) return;
        const margin = 8;
        const widgetWidth = root.offsetWidth || 360;
        const widgetHeight = root.offsetHeight || 420;
        const nextX = Math.max(margin, Math.min(window.innerWidth - widgetWidth - margin, event.clientX - chatDragState.offsetX));
        const nextY = Math.max(margin, Math.min(window.innerHeight - widgetHeight - margin, event.clientY - chatDragState.offsetY));
        chatWidgetPosition = { x: nextX, y: nextY };
        root.style.left = `${nextX}px`;
        root.style.top = `${nextY}px`;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
    });
    window.addEventListener('pointerup', () => {
        if (!chatDragState) return;
        chatDragState = null;
        root.classList.remove('dragging');
    });
    root.dataset.chatBoundV2 = 'true';
}

function isMobileChatDockMode() {
    return window.matchMedia('(max-width: 640px)').matches || window.matchMedia('(pointer: coarse)').matches;
}

function applyChatDockPosition(root) {
    if (!root) return;
    const mobileDock = isMobileChatDockMode();
    root.style.left = 'auto';
    root.style.top = 'auto';
    root.style.right = mobileDock ? '6px' : '18px';
    root.style.bottom = mobileDock ? '6px' : '18px';
}

function clampChatWidgetPosition(root) {
    if (!root || !chatWidgetPosition) return;
    const margin = 8;
    const widgetWidth = root.offsetWidth || 360;
    const widgetHeight = root.offsetHeight || 420;
    const nextX = Math.max(margin, Math.min(window.innerWidth - widgetWidth - margin, Number(chatWidgetPosition.x || 0)));
    const nextY = Math.max(margin, Math.min(window.innerHeight - widgetHeight - margin, Number(chatWidgetPosition.y || 0)));
    chatWidgetPosition = { x: nextX, y: nextY };
    root.style.left = `${nextX}px`;
    root.style.top = `${nextY}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
}

function ensureChatWidgetRoot() {
    let root = document.getElementById('chat-widget-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'chat-widget-root';
        root.className = 'hidden';
    }
    if (root.parentElement !== document.body) {
        document.body.appendChild(root);
    }
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    root.style.position = 'fixed';
    if (isMobile) {
        root.style.right = '0';
        root.style.bottom = '0';
        root.style.left = '0';
        root.style.top = 'auto';
    } else {
        root.style.right = '18px';
        root.style.bottom = '18px';
        root.style.left = 'auto';
        root.style.top = 'auto';
    }
    root.style.zIndex = '200';
    return root;
}

function renderChatWidget() {
    const root = ensureChatWidgetRoot();
    if (!root) return;
    if (!isChatWidgetAvailable()) {
        root.innerHTML = '';
        root.classList.add('hidden');
        return;
    }

    if (chatWidgetCollapsed) {
        const hasUnreadPm = chatUnreadPmIds.size > 0;
        root.classList.remove('hidden');
        applyChatDockPosition(root);
        root.innerHTML = `
            <button class="chat-widget-bubble ${hasUnreadPm ? 'has-alert' : ''}" ${actionAttrs('toggleChatWidgetCollapsed')} data-no-action-lock="true">
                <span class="chat-widget-bubble-label">Chat</span>
                ${hasUnreadPm ? '<span class="chat-widget-bubble-alert">!</span>' : ''}
            </button>`;
        return;
    }

    const input = document.getElementById('chat-message-input');
    const wasFocused = document.activeElement === input;
    const prevMessage = input?.value || '';
    const recipientDraft = document.getElementById('chat-recipient-input')?.value || chatPmTarget || '';
    chatPmTarget = recipientDraft;
    const privateThreads = getPrivateChatThreads();
    if (chatActiveView === 'private' && !chatActivePmThread && privateThreads.length) {
        chatActivePmThread = privateThreads[0].key;
        chatPmTarget = chatActivePmThread;
    }
    if (chatActiveView === 'private' && chatActivePmThread && !privateThreads.some(thread => thread.key === chatActivePmThread)) {
        chatActivePmThread = '';
    }
    const activePrivateTarget = chatActiveView === 'private'
        ? String(chatActivePmThread || recipientDraft || '').trim()
        : '';
    const canSendPm = activePrivateTarget.length > 0;
    const statusClass = chatStatusText ? (chatStatusIsError ? 'error' : 'success') : '';
    const visibleMessages = getVisibleChatMessages();
    const filteredMessages = getFilteredChatMessages();
    const hiddenCount = Math.max(0, filteredMessages.length - visibleMessages.length);
    const remainingChars = Math.max(0, 280 - prevMessage.length);
    const mobileDock = isMobileChatDockMode();
    const globalCount = trimChatMessages(chatMessages).filter(msg => !msg?.is_private).length;
    const privateCount = privateThreads.length;
    const threadTabsHtml = privateThreads.length
        ? privateThreads.map(thread => `<div class="chat-thread-tab ${thread.key === activePrivateTarget ? 'active' : ''}">
                <button class="chat-thread-tab-main" ${actionAttrs('selectPrivateChatThread', thread.key)} data-no-action-lock="true">
                    <span>${escHtml(thread.key)}</span>
                    ${thread.unread ? '<span class="chat-thread-tab-alert">!</span>' : ''}
                </button>
                <button class="chat-thread-tab-close" ${actionAttrs('closePrivateChatThread', thread.key)} data-no-action-lock="true" title="Close private chat">X</button>
            </div>`).join('')
        : '<div class="chat-thread-empty">No private conversations yet.</div>';

    root.classList.remove('hidden');
    root.innerHTML = `
        <section class="chat-widget">
            <div class="chat-widget-header">
                <div class="chat-widget-title-wrap">
                    <div class="chat-widget-title">Global Chat</div>
                    <div class="chat-widget-subtitle">${chatActiveView === 'private' ? (canSendPm ? `Private with ${escHtml(activePrivateTarget)}` : 'Choose a private thread') : 'World channel'}</div>
                </div>
                <button class="chat-widget-collapse" title="Close chat" ${actionAttrs('toggleChatWidgetCollapsed')} data-no-action-lock="true">
                    X
                </button>
            </div>
            <div class="chat-widget-body">
                <div class="chat-widget-view-tabs">
                    <button class="chat-view-tab ${chatActiveView === 'global' ? 'active' : ''}" ${actionAttrs('switchChatView', 'global')} data-no-action-lock="true">Global (${globalCount})</button>
                    <button class="chat-view-tab ${chatActiveView === 'private' ? 'active' : ''}" ${actionAttrs('switchChatView', 'private')} data-no-action-lock="true">Private (${privateCount})</button>
                </div>
                ${chatActiveView === 'private' ? `
                    <div class="chat-widget-target-row">
                        <input id="chat-recipient-input" class="chat-widget-target-input" type="text" maxlength="24" placeholder="Character name for new PM" value="${escHtml(activePrivateTarget || recipientDraft)}">
                        <button class="chat-widget-target-clear ${canSendPm ? 'active' : ''}" ${actionAttrs('clearChatRecipient')} data-no-action-lock="true">
                            ${canSendPm ? 'Clear PM' : 'Clear'}
                        </button>
                    </div>
                    <div class="chat-thread-tabs">${threadTabsHtml}</div>
                ` : ''}
<div class="chat-widget-messages" id="chat-widget-messages">
                    ${visibleMessages.length ? visibleMessages.map(msg => {
        const privateLabel = msg.is_private ? (msg.is_outgoing ? `to ${escHtml(msg.recipient_name || '')}` : 'PM') : 'Global';
        const isOwn = msg.is_outgoing;
        const editedTag = msg.edited ? ' <span style="opacity:0.5">(edited)</span>' : '';
        const actionBtns = [];
        if (!isOwn) {
            actionBtns.push(`<button class="chat-pm-btn" ${actionAttrs('pmChatMessage', msg.id)} data-no-action-lock="true" title="Send PM">PM</button>`);
            actionBtns.push(`<button class="chat-reply-btn" ${actionAttrs('replyChatMessage', msg.id)} data-no-action-lock="true" title="Reply">Reply</button>`);
        }
        if (isOwn) {
            actionBtns.push(`<button class="chat-edit-btn" ${actionAttrs('editChatMessage', msg.id)} data-no-action-lock="true" title="Edit message">Edit</button>`);
            actionBtns.push(`<button class="chat-delete-btn" ${actionAttrs('deleteChatMessage', msg.id)} data-no-action-lock="true" title="Delete message">Delete</button>`);
        }
        return `
                            <div class="chat-line ${msg.is_private ? 'private' : 'global'} ${msg.is_outgoing ? 'outgoing' : 'incoming'}">
                                <div class="chat-line-meta">
                                    <span class="chat-line-time">${formatChatTime(msg.created_at)}</span>
                                    <span class="chat-line-author">${escHtml(msg.sender_name || 'Unknown')}</span>
                                    <span class="chat-line-channel">${privateLabel}</span>
                                    ${actionBtns.length ? `<div class="chat-line-actions">${actionBtns.join('')}</div>` : ''}
                                </div>
                                <div class="chat-line-text">${escHtml(msg.message_text || '')}${editedTag}</div>
                            </div>
                        `;
    }).join('') : '<div class="chat-empty">No messages yet. Say hello.</div>'}
                </div>
                ${filteredMessages.length > 8 ? `
                    <div class="chat-widget-more">
                        <button class="chat-widget-more-btn" ${actionAttrs('toggleChatExpanded')} data-no-action-lock="true">
                            ${chatExpanded ? 'Show less' : `Read more (${hiddenCount} older)`}
                        </button>
                    </div>
                ` : ''}
                <div class="chat-widget-compose">
                    <input id="chat-message-input" class="chat-widget-message-input" type="text" maxlength="280" placeholder="${chatActiveView === 'private' ? (canSendPm ? 'Send private message...' : 'Choose or enter a character name...') : 'Send global message...'}" value="${escHtml(prevMessage)}">
                    <button class="chat-send-btn" ${actionAttrs('sendChatMessage')} aria-label="Send message"></button>
                </div>
                <div class="chat-widget-foot">
                    <span id="chat-widget-limit" class="chat-widget-limit">${remainingChars} left</span>
                    <span id="chat-widget-status" class="chat-widget-status ${statusClass}">${escHtml(chatStatusText)}</span>
                </div>
            </div>
        </section>`;

    bindChatWidgetEvents();
    if (wasFocused) {
        const newInput = document.getElementById('chat-message-input');
        if (newInput) {
            newInput.value = prevMessage;
            newInput.focus();
            newInput.selectionStart = newInput.selectionEnd = prevMessage.length;
        }
    }
    const messagesEl = document.getElementById('chat-widget-messages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function toggleChatWidgetCollapsed() {
    if (!isChatWidgetAvailable()) return;
    chatWidgetCollapsed = !chatWidgetCollapsed;
    if (!chatWidgetCollapsed) {
        chatActiveView = 'global';
        chatActivePmThread = '';
        chatPmTarget = '';
        chatHighlightedPmIds = new Set();
        markGlobalMessagesRead(true);
    }
    if (typeof syncTopbarChatAlert === 'function') {
        syncTopbarChatAlert();
    }
    renderChatWidget();
}

function toggleChatExpanded() {
    chatExpanded = !chatExpanded;
    renderChatWidget();
}

function switchChatView(view = 'global') {
    chatActiveView = view === 'private' ? 'private' : 'global';
    if (chatActiveView === 'private') {
        const threads = getPrivateChatThreads();
        if (!chatActivePmThread && threads.length) {
            chatActivePmThread = threads[0].key;
        }
        if (chatActivePmThread) {
            chatPmTarget = chatActivePmThread;
            markPrivateThreadRead(chatActivePmThread, true);
        }
    } else {
        chatPmTarget = '';
        chatActivePmThread = '';
        chatHighlightedPmIds = new Set();
        markGlobalMessagesRead(true);
    }
    clearChatSuggestions();
    renderChatWidget();
}

function selectPrivateChatThread(threadKey) {
    const nextKey = String(threadKey || '').trim();
    if (!nextKey) return;
    chatActiveView = 'private';
    chatActivePmThread = nextKey;
    chatPmTarget = nextKey;
    markPrivateThreadRead(nextKey, true);
    renderChatWidget();
}

function closePrivateChatThread(threadKey) {
    const nextKey = String(threadKey || '').trim();
    if (!nextKey) return;
    chatClosedPmThreads.add(nextKey);
    if (chatActivePmThread === nextKey) {
        chatActivePmThread = '';
        chatPmTarget = '';
        const remainingThreads = getPrivateChatThreads();
        if (remainingThreads.length) {
            chatActivePmThread = remainingThreads[0].key;
            chatPmTarget = remainingThreads[0].key;
        } else {
            chatActiveView = 'global';
        }
    }
    renderChatWidget();
}

function clearChatRecipient() {
    chatPmTarget = '';
    chatActivePmThread = '';
    const input = document.getElementById('chat-recipient-input');
    if (input) {
        input.value = '';
    }
    const chatInput = document.getElementById('chat-message-input');
    if (chatInput) {
        delete chatInput.dataset.editingId;
    }
    localStorage.removeItem('rpg_chat_editing_id');
    delete window._chatEditingId;
    renderChatWidget();
}

function clearChatEdit() {
    const input = document.getElementById('chat-message-input');
    if (input) {
        delete input.dataset.editingId;
    }
    localStorage.removeItem('rpg_chat_editing_id');
    delete window._chatEditingId;
    setChatWidgetStatus('', false);
    renderChatWidget();
}

function editChatMessage(messageId) {
    const message = chatMessages.find(m => m.id === messageId);
    if (!message) return;

    const input = document.getElementById('chat-message-input');
    if (!input) return;

    const editingIdStr = String(messageId);
    input.value = message.message_text || '';
    input.dataset.editingId = editingIdStr;
    localStorage.setItem('rpg_chat_editing_id', editingIdStr);
    window._chatEditingId = editingIdStr;
    input.focus();

    setChatWidgetStatus('Edit your message and press Send.', false);
    renderChatWidget();
}

function pmChatMessage(messageId) {
    const message = chatMessages.find(m => m.id === messageId);
    if (!message || !message.sender_name) return;

    const recipientInput = document.getElementById('chat-recipient-input');
    const input = document.getElementById('chat-message-input');
    chatActiveView = 'private';
    chatActivePmThread = message.sender_name;
    chatPmTarget = message.sender_name;
    clearChatEdit();

    if (recipientInput) recipientInput.value = message.sender_name;
    if (input) input.focus();
    setChatWidgetStatus(`PM to ${message.sender_name}.`, false);
    renderChatWidget();
}

function replyChatMessage(messageId) {
    const message = chatMessages.find(m => m.id === messageId);
    if (!message || !message.sender_name) return;

    const input = document.getElementById('chat-message-input');
    const recipientInput = document.getElementById('chat-recipient-input');
    if (!input) return;

    if (recipientInput) recipientInput.value = '';
    chatPmTarget = '';

    input.value = `@${message.sender_name} `;
    clearChatEdit();

    input.focus();
    setChatWidgetStatus(`Replying to ${message.sender_name}.`, false);
    renderChatWidget();
}

function deleteChatMessage(messageId) {
    if (!confirm('Delete this message? This cannot be undone.')) return;

    api('DELETE', `/game/chat/${messageId}`).then(() => {
        chatMessages = chatMessages.filter(m => m.id !== messageId);
        setChatWidgetStatus('Message deleted.');
        renderChatWidget();
    }).catch(e => {
        setChatWidgetStatus(e.message || 'Failed to delete message.', true);
    });
}

window.editChatMessage = editChatMessage;
window.deleteChatMessage = deleteChatMessage;
window.pmChatMessage = pmChatMessage;
window.replyChatMessage = replyChatMessage;
window.switchChatView = switchChatView;
window.selectPrivateChatThread = selectPrivateChatThread;
window.closePrivateChatThread = closePrivateChatThread;
window.loadBannerEvent = loadBannerEvent;
window.doBannerPull = doBannerPull;

function syncChatRecipientUi() {
    const recipientInput = document.getElementById('chat-recipient-input');
    const clearBtn = document.querySelector('.chat-widget-target-clear');
    const subtitle = document.querySelector('.chat-widget-subtitle');
    const messageInput = document.getElementById('chat-message-input');
    const recipientDraft = String(recipientInput?.value || chatPmTarget || '').trim();
    chatPmTarget = recipientDraft;
    if (chatActiveView === 'private' && recipientDraft) {
        chatActivePmThread = recipientDraft;
    }
    const canSendPm = recipientDraft.trim().length > 0;
    if (clearBtn) {
        clearBtn.textContent = canSendPm ? 'Clear PM' : 'Clear';
        clearBtn.classList.toggle('active', canSendPm);
    }
    if (subtitle) {
        subtitle.textContent = chatActiveView === 'private'
            ? (canSendPm ? `Private with ${recipientDraft}` : 'Choose a private thread')
            : 'World channel';
    }
    if (messageInput) {
        messageInput.placeholder = chatActiveView === 'private'
            ? (canSendPm ? 'Send private message...' : 'Choose or enter a character name...')
            : 'Send global message...';
    }
    renderChatSuggestions();
}

function bindChatWidgetEvents() {
    const root = ensureChatWidgetRoot();
    if (!root || root.dataset.chatBound === 'true') return;
    root.addEventListener('keydown', async (event) => {
        if (event.target?.id !== 'chat-message-input') return;
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        await sendChatMessage();
    });
    root.addEventListener('input', (event) => {
        if (event.target?.id === 'chat-recipient-input') {
            chatPmTarget = String(event.target.value || '');
            if (chatActiveView === 'private') {
                chatActivePmThread = String(event.target.value || '').trim();
            }
            syncChatRecipientUi();
            const query = String(event.target.value || '').trim();
            if (query) queueChatSuggestionFetch(query, 'recipient');
            else clearChatSuggestions('recipient');
            return;
        }
        if (event.target?.id === 'chat-message-input') {
            const counter = document.getElementById('chat-widget-limit');
            if (counter) {
                const remaining = Math.max(0, 280 - String(event.target.value || '').length);
                counter.textContent = `${remaining} left`;
            }
            const mention = getActiveChatMentionQuery(event.target);
            if (mention) {
                chatMentionRange = mention;
                queueChatSuggestionFetch(mention.query, 'mention');
            } else {
                clearChatSuggestions('mention');
            }
        }
    });
    root.addEventListener('pointerdown', (event) => {
        if (isMobileChatDockMode()) return;
        const handle = event.target?.closest('.chat-widget-header');
        if (!handle) return;
        if (event.target?.closest('button,input,textarea')) return;
        const rect = root.getBoundingClientRect();
        chatDragState = {
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };
        root.classList.add('dragging');
        try { handle.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
    });
    window.addEventListener('pointermove', (event) => {
        if (isMobileChatDockMode()) return;
        if (!chatDragState) return;
        const margin = 8;
        const widgetWidth = root.offsetWidth || 360;
        const widgetHeight = root.offsetHeight || 420;
        const nextX = Math.max(margin, Math.min(window.innerWidth - widgetWidth - margin, event.clientX - chatDragState.offsetX));
        const nextY = Math.max(margin, Math.min(window.innerHeight - widgetHeight - margin, event.clientY - chatDragState.offsetY));
        chatWidgetPosition = { x: nextX, y: nextY };
        root.style.left = `${nextX}px`;
        root.style.top = `${nextY}px`;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
    });
    window.addEventListener('pointerup', () => {
        if (!chatDragState) return;
        chatDragState = null;
        root.classList.remove('dragging');
    });
    root.dataset.chatBound = 'true';
}

function syncTopbarChatAlert() {
    const btn = document.getElementById('topbar-chat-btn');
    if (!btn) return;
    const hasUnread = getUnreadGlobalMessageIds().length > 0 || hasUnreadPrivateThreads();
    btn.classList.toggle('has-alert', hasUnread);
}

function renderChatWidget() {
    const root = ensureChatWidgetRoot();
    if (!root) return;
    if (!isChatWidgetAvailable()) {
        root.innerHTML = '';
        root.classList.add('hidden');
        syncTopbarChatAlert();
        return;
    }

    if (chatWidgetCollapsed) {
        root.innerHTML = '';
        root.classList.add('hidden');
        syncTopbarChatAlert();
        return;
    }

    const input = document.getElementById('chat-message-input');
    const wasFocused = document.activeElement === input;
    const prevMessage = input?.value || '';
    const recipientDraft = document.getElementById('chat-recipient-input')?.value || chatPmTarget || '';
    chatPmTarget = recipientDraft;
    const privateThreads = getPrivateChatThreads();
    if (chatActiveView === 'private' && !chatActivePmThread && privateThreads.length) {
        chatActivePmThread = privateThreads[0].key;
        chatPmTarget = chatActivePmThread;
    }
    if (chatActiveView === 'private' && chatActivePmThread && !privateThreads.some(thread => thread.key === chatActivePmThread)) {
        chatActivePmThread = '';
    }
    const activePrivateTarget = chatActiveView === 'private'
        ? String(chatActivePmThread || recipientDraft || '').trim()
        : '';
    const canSendPm = activePrivateTarget.length > 0;
    const statusClass = chatStatusText ? (chatStatusIsError ? 'error' : 'success') : '';
    const visibleMessages = getVisibleChatMessages();
    const filteredMessages = getFilteredChatMessages();
    const hiddenCount = Math.max(0, filteredMessages.length - visibleMessages.length);
    const remainingChars = Math.max(0, 280 - prevMessage.length);
    const globalCount = trimChatMessages(chatMessages).filter(msg => !msg?.is_private).length;
    const privateCount = privateThreads.length;
    const unreadGlobalIds = getUnreadGlobalMessageIds();
    const hasUnreadGlobal = unreadGlobalIds.length > 0;
    const hasUnreadPrivate = privateThreads.some(thread => thread.unread);
    const threadTabsHtml = privateThreads.length
        ? privateThreads.map(thread => `<div class="chat-thread-tab ${thread.key === activePrivateTarget ? 'active' : ''}">
                <button class="chat-thread-tab-main" ${actionAttrs('selectPrivateChatThread', thread.key)} data-no-action-lock="true">
                    <span>${escHtml(thread.key)}</span>
                    ${thread.unread ? '<span class="chat-thread-tab-alert">!</span>' : ''}
                </button>
                <button class="chat-thread-tab-close" ${actionAttrs('closePrivateChatThread', thread.key)} data-no-action-lock="true" title="Close private chat">✕</button>
            </div>`).join('')
        : '<div class="chat-thread-empty">No private conversations yet.</div>';

    root.classList.remove('hidden');
    syncTopbarChatAlert();
    root.innerHTML = `
        <section class="chat-widget">
            <div class="chat-widget-header">
                <div class="chat-widget-title-wrap">
                    <div class="chat-widget-title">Global Chat</div>
                    <div class="chat-widget-subtitle">${chatActiveView === 'private' ? (canSendPm ? `Private with ${escHtml(activePrivateTarget)}` : 'Choose a private thread') : 'World channel'}</div>
                </div>
                <button class="chat-widget-collapse" title="Close chat" ${actionAttrs('toggleChatWidgetCollapsed')} data-no-action-lock="true">
                    X
                </button>
            </div>
            <div class="chat-widget-body">
                <div class="chat-widget-view-tabs">
                    <button class="chat-view-tab ${chatActiveView === 'global' ? 'active' : ''}" ${actionAttrs('switchChatView', 'global')} data-no-action-lock="true">Global (${globalCount})${hasUnreadGlobal ? ' <span class="chat-thread-tab-alert">!</span>' : ''}</button>
                    <button class="chat-view-tab ${chatActiveView === 'private' ? 'active' : ''}" ${actionAttrs('switchChatView', 'private')} data-no-action-lock="true">Private (${privateCount})${hasUnreadPrivate ? ' <span class="chat-thread-tab-alert">!</span>' : ''}</button>
                </div>
                ${chatActiveView === 'private' ? `
                    <div class="chat-widget-target-row">
                        <input id="chat-recipient-input" class="chat-widget-target-input" type="text" maxlength="24" placeholder="Character name for new PM" value="${escHtml(activePrivateTarget || recipientDraft)}">
                        <button class="chat-widget-target-clear ${canSendPm ? 'active' : ''}" ${actionAttrs('clearChatRecipient')} data-no-action-lock="true">
                            ${canSendPm ? 'Clear PM' : 'Clear'}
                        </button>
                    </div>
                    <div id="chat-recipient-suggestions" class="chat-suggest-list hidden"></div>
                    <div class="chat-thread-tabs">${threadTabsHtml}</div>
                ` : ''}
                <div class="chat-widget-messages" id="chat-widget-messages">
                    ${visibleMessages.length ? visibleMessages.map(msg => {
        const privateLabel = msg.is_private ? (msg.is_outgoing ? `to ${escHtml(msg.recipient_name || '')}` : 'PM') : 'Global';
        const isOwn = msg.is_outgoing;
        const isUnreadHighlight = !isOwn && ((!msg.is_private && chatHighlightedGlobalIds.has(Number(msg.id || 0))) || (msg.is_private && chatHighlightedPmIds.has(Number(msg.id || 0))));
        const editedTag = msg.edited ? ' <span style="opacity:0.5">(edited)</span>' : '';
        const actionBtns = [];
        if (!isOwn) {
            actionBtns.push(`<button class="chat-pm-btn" ${actionAttrs('pmChatMessage', msg.id)} data-no-action-lock="true" title="Send PM">PM</button>`);
            actionBtns.push(`<button class="chat-reply-btn" ${actionAttrs('replyChatMessage', msg.id)} data-no-action-lock="true" title="Reply">Reply</button>`);
        }
        if (isOwn) {
            actionBtns.push(`<button class="chat-edit-btn" ${actionAttrs('editChatMessage', msg.id)} data-no-action-lock="true" title="Edit message">Edit</button>`);
            actionBtns.push(`<button class="chat-delete-btn" ${actionAttrs('deleteChatMessage', msg.id)} data-no-action-lock="true" title="Delete message">Delete</button>`);
        }
        return `
                            <div class="chat-line ${msg.is_private ? 'private' : 'global'} ${msg.is_outgoing ? 'outgoing' : 'incoming'} ${isUnreadHighlight ? 'unread-highlight' : ''}">
                                <div class="chat-line-meta">
                                    <span class="chat-line-time">${formatChatTime(msg.created_at)}</span>
                                    <span class="chat-line-author">${escHtml(msg.sender_name || 'Unknown')}</span>
                                    <span class="chat-line-channel">${privateLabel}</span>
                                    ${actionBtns.length ? `<div class="chat-line-actions">${actionBtns.join('')}</div>` : ''}
                                </div>
                                <div class="chat-line-text">${escHtml(msg.message_text || '')}${editedTag}</div>
                            </div>
                        `;
    }).join('') : '<div class="chat-empty">No messages yet. Say hello.</div>'}
                </div>
                ${filteredMessages.length > 8 ? `
                    <div class="chat-widget-more">
                        <button class="chat-widget-more-btn" ${actionAttrs('toggleChatExpanded')} data-no-action-lock="true">
                            ${chatExpanded ? 'Show less' : `Read more (${hiddenCount} older)`}
                        </button>
                    </div>
                ` : ''}
                <div class="chat-widget-compose">
                    <input id="chat-message-input" class="chat-widget-message-input" type="text" maxlength="280" placeholder="${chatActiveView === 'private' ? (canSendPm ? 'Send private message...' : 'Choose or enter a character name...') : 'Send global message...'}" value="${escHtml(prevMessage)}">
                    <button class="chat-send-btn" ${actionAttrs('sendChatMessage')} aria-label="Send message"></button>
                </div>
                <div id="chat-mention-suggestions" class="chat-suggest-list hidden"></div>
                <div class="chat-widget-foot">
                    <span id="chat-widget-limit" class="chat-widget-limit">${remainingChars} left</span>
                    <span id="chat-widget-status" class="chat-widget-status ${statusClass}">${escHtml(chatStatusText)}</span>
                </div>
            </div>
        </section>`;

    bindChatWidgetEvents();
    if (wasFocused) {
        const newInput = document.getElementById('chat-message-input');
        if (newInput) {
            newInput.value = prevMessage;
            newInput.focus();
            newInput.selectionStart = newInput.selectionEnd = prevMessage.length;
        }
    }
    const messagesEl = document.getElementById('chat-widget-messages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    renderChatSuggestions();
}

function switchChatView(view = 'global') {
    chatActiveView = view === 'private' ? 'private' : 'global';
    if (chatActiveView === 'private') {
        const threads = getPrivateChatThreads();
        if (!chatActivePmThread && threads.length) {
            chatActivePmThread = threads[0].key;
        }
        if (chatActivePmThread) {
            chatPmTarget = chatActivePmThread;
        }
    } else {
        chatPmTarget = '';
        chatActivePmThread = '';
    }
    clearChatSuggestions();
    renderChatWidget();
}

function clearChatRecipient() {
    chatPmTarget = '';
    chatActivePmThread = '';
    clearChatSuggestions('recipient');
    const input = document.getElementById('chat-recipient-input');
    if (input) {
        input.value = '';
    }
    const chatInput = document.getElementById('chat-message-input');
    if (chatInput) {
        delete chatInput.dataset.editingId;
        chatInput.focus();
    }
    localStorage.removeItem('rpg_chat_editing_id');
    delete window._chatEditingId;
    syncChatRecipientUi();
}

function chooseChatRecipientSuggestion(name) {
    const nextName = String(name || '').trim();
    if (!nextName) return;
    chatPmTarget = nextName;
    chatActivePmThread = nextName;
    const input = document.getElementById('chat-recipient-input');
    if (input) input.value = nextName;
    clearChatSuggestions('recipient');
    syncChatRecipientUi();
    document.getElementById('chat-message-input')?.focus();
}

function chooseChatMentionSuggestion(name) {
    const nextName = String(name || '').trim();
    const input = document.getElementById('chat-message-input');
    if (!nextName || !input) return;
    const range = chatMentionRange || getActiveChatMentionQuery(input);
    if (!range) return;
    const value = String(input.value || '');
    input.value = `${value.slice(0, range.start)}@${nextName} ${value.slice(range.end)}`;
    const caret = range.start + nextName.length + 2;
    input.focus();
    input.setSelectionRange(caret, caret);
    const counter = document.getElementById('chat-widget-limit');
    if (counter) counter.textContent = `${Math.max(0, 280 - input.value.length)} left`;
    clearChatSuggestions('mention');
}

window.switchChatView = switchChatView;
window.chooseChatRecipientSuggestion = chooseChatRecipientSuggestion;
window.chooseChatMentionSuggestion = chooseChatMentionSuggestion;

async function sendChatMessage() {
    const input = document.getElementById('chat-message-input');
    const recipientInput = document.getElementById('chat-recipient-input');
    const message = String(input?.value || '').trim();
    const recipientName = chatActiveView === 'private'
        ? String(recipientInput?.value || chatActivePmThread || chatPmTarget || '').trim()
        : '';
    // Check multiple sources for editing ID
    let editingId = input?.dataset?.editingId || localStorage.getItem('rpg_chat_editing_id') || window._chatEditingId;
    // Validate editing ID still exists in loaded messages — if not, it's stale
    if (editingId && !chatMessages.some(m => String(m.id) === String(editingId))) {
        localStorage.removeItem('rpg_chat_editing_id');
        delete window._chatEditingId;
        if (input?.dataset) delete input.dataset.editingId;
        editingId = null;
    }

    if (!message) {
        setChatWidgetStatus('Message required.', true);
        return;
    }

    try {
        if (editingId) {
            const result = await api('PUT', `/game/chat/edit/${editingId}`, { message });
            delete input.dataset.editingId;
            localStorage.removeItem('rpg_chat_editing_id');
            delete window._chatEditingId;
            if (input) input.value = '';

            const idx = chatMessages.findIndex(m => m.id === Number(editingId));
            if (idx >= 0) {
                chatMessages[idx] = { ...chatMessages[idx], message_text: message, edited: true };
            }

            setChatWidgetStatus('Message edited.');
        } else {
            const result = await api('POST', '/game/chat/send', {
                message,
                recipientName: recipientName || null
            });
            if (input) input.value = '';
            appendChatMessages(result?.message ? [result.message] : []);
            if (recipientName) {
                chatActiveView = 'private';
                chatActivePmThread = recipientName;
                chatPmTarget = recipientName;
            }
            setChatWidgetStatus(recipientName ? `Sent to ${recipientName}.` : 'Message sent.');
        }
        renderChatWidget();
    } catch (e) {
        setChatWidgetStatus(e.message || 'Failed to send chat message.', true);
    }
}

function getAssetImagePath(name, basePath='/images/assets') {
    const slug = String(name || '')
        .trim()
        .toLowerCase()
        // Prefer possessive names to map cleanly to asset slugs:
        // "Shadewalker's Kiss" -> "shadewalkers-kiss" (not "shadewalker-s-kiss").
        .replace(/'s\b/g, 's')
        .replace(/'/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug ? `${basePath}/${slug}.png` : null;
}

function itemIcon(item, size='2rem') {
    if (!item) return '';
    const imgSrc = item.img || (item.name && !item.consumable ? getAssetImagePath(item.name) : null);
    const iStyle = size==='slot' ? 'max-width:100%;max-height:100%;object-fit:contain;display:block' : `width:${size};height:${size};object-fit:contain;border-radius:4px;display:block`;
    const sStyle = size==='slot' ? 'font-size:2.2rem;line-height:1' : `font-size:${size};line-height:1`;
    if (imgSrc) return `<img src="${imgSrc}" style="${iStyle}" data-error-hide="true" data-error-next-display="block"><span style="display:none;${sStyle}">${item.emoji||'📦'}</span>`;
    return `<span style="${sStyle}">${item.emoji||'📦'}</span>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────
function setError(id,msg){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.classList.toggle('hidden',!msg);}
function showMsg(id,msg,isError=false){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.style.background=isError?'rgba(192,57,43,0.1)':'';el.style.borderColor=isError?'rgba(192,57,43,0.4)':'';el.style.color=isError?'var(--red-light)':'';el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),4000);}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function formatDate(ts) {
    const d = new Date(ts * 1000);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    if (isToday) return `Today, ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}
function capitalize(s){return s?s[0].toUpperCase()+s.slice(1):'';}
function classRuneHtml(className) {
    const c = String(className || '').toLowerCase();
    return `<img src="/images/class/${c}rune.png" style="height:20px;width:auto;vertical-align:middle;display:inline-block" alt="${c}">`;
}

// Global game message logging function
function gameLog(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('game-messages');
    if (!container) {
        console.log(`Game Log (${type}): ${msg}`);
        return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `game-message game-message--${type}`;
    messageEl.innerHTML = escHtml(msg); // Use escHtml to prevent XSS

    // Prepend to show newest messages at top
    container.prepend(messageEl);

    // Limit number of messages
    while (container.children.length > 5) {
        container.lastChild.remove();
    }

    // Fade out and remove
    setTimeout(() => {
        messageEl.classList.add('game-message--fading');
        messageEl.addEventListener('transitionend', () => messageEl.remove());
    }, duration);
}
window.gameLog = gameLog; // Make it globally accessible

function encodeActionArgs(args = []) {
    return escHtml(JSON.stringify(args));
}

function actionAttrs(action, ...args) {
    const attr = [`data-action="${escHtml(action)}"`];
    if (args.length) attr.push(`data-args="${encodeActionArgs(args)}"`);
    return attr.join(' ');
}

function parseActionArgs(el) {
    const raw = el?.dataset?.args;
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.warn('Failed to parse action args for', el, err);
        return [];
    }
}

function isPromiseLike(value) {
    return !!value && typeof value.then === 'function';
}

function shouldAutoLockActionTrigger(el, event, attrName) {
    if (attrName !== 'data-action' || event?.type !== 'click' || !el) return false;
    if (el.dataset?.noActionLock === 'true') return false;
    return el instanceof HTMLButtonElement ||
        el.classList?.contains('btn-primary') ||
        el.classList?.contains('btn-secondary') ||
        el.classList?.contains('btn-sm') ||
        el.classList?.contains('btn-collect') ||
        el.classList?.contains('btn-confirm-upgrade') ||
        el.classList?.contains('elem-assign-go');
}

function setActionTriggerBusy(el, busy) {
    if (!el) return;
    if (busy) {
        if (el.dataset.actionBusy === 'true') return;
        el.dataset.actionBusy = 'true';
        if (el instanceof HTMLButtonElement) {
            el.dataset.prevDisabled = el.disabled ? 'true' : 'false';
            el.disabled = true;
        } else {
            el.dataset.prevAriaDisabled = el.getAttribute('aria-disabled') || '';
            el.setAttribute('aria-disabled', 'true');
            el.style.pointerEvents = 'none';
        }
        return;
    }
    delete el.dataset.actionBusy;
    if (el instanceof HTMLButtonElement) {
        const wasDisabled = el.dataset.prevDisabled === 'true';
        delete el.dataset.prevDisabled;
        el.disabled = wasDisabled;
    } else {
        const prevAriaDisabled = el.dataset.prevAriaDisabled;
        delete el.dataset.prevAriaDisabled;
        if (prevAriaDisabled) el.setAttribute('aria-disabled', prevAriaDisabled);
        else el.removeAttribute('aria-disabled');
        el.style.pointerEvents = '';
    }
}

function callNamedAction(actionName, args, event, el) {
    const fn = globalThis[actionName];
    if (typeof fn !== 'function') {
        console.warn(`Action "${actionName}" is not available`);
        return;
    }
    return fn(...args, el, event);
}

function handleDelegatedAction(event, attrName) {
    const selector = `[${attrName}]`;
    const trigger = event.target.closest(selector);
    if (!trigger) return false;
    if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return true;
    if (trigger.dataset.actionBusy === 'true') return true;
    const actionName = trigger.getAttribute(attrName);
    const args = parseActionArgs(trigger);
    const shouldLock = shouldAutoLockActionTrigger(trigger, event, attrName);
    if (shouldLock) setActionTriggerBusy(trigger, true);
    try {
        const result = callNamedAction(actionName, args, event, trigger);
        if (shouldLock && isPromiseLike(result)) {
            result.finally(() => setActionTriggerBusy(trigger, false));
        } else if (shouldLock) {
            setActionTriggerBusy(trigger, false);
        }
    } catch (err) {
        if (shouldLock) setActionTriggerBusy(trigger, false);
        throw err;
    }
    return true;
}

function clickElementById(id) {
    document.getElementById(id)?.click();
}

document.addEventListener('click', (event) => {
    const overlay = event.target;

    // Handle banner menu click
    if (overlay.classList.contains('topbar-menu-info-value') && overlay.textContent?.includes('Banner')) {
        showTab('event');
        closeTopbarMenu();
        return;
    }

    if (overlay instanceof HTMLElement) {
        const tooltip = document.getElementById('item-tooltip');
        const clickedTooltipTrigger =
            !!overlay.closest('#item-tooltip') ||
            !!overlay.closest('[data-hover-action]') ||
            !!overlay.closest('[data-action="openItemTooltip"]') ||
            !!overlay.closest('[data-action="openShopItemTooltip"]');
        if (window.innerWidth <= 768 && tooltip && !tooltip.classList.contains('hidden') && !clickedTooltipTrigger) {
            hideItemTooltip();
        }
        if (overlay.classList.contains('modal-overlay') && !overlay.classList.contains('hidden')) {
            closeModalOverlayById(overlay.id);
            return;
        }
        if (overlay.classList.contains('mission-modal-overlay') && !overlay.classList.contains('hidden')) {
            closeModalOverlayById(overlay.id);
            return;
        }
        const characterFixedHub = document.getElementById('character-inline-hub-fixed');
        const inventoryFixedHub = document.getElementById('inventory-inline-hub-fixed');
        const missionsFixedHub = document.getElementById('missions-inline-hub-fixed');
        const clickedInsideNavHub =
            !!overlay.closest('.nav-hub-group') ||
            !!overlay.closest('#character-inline-hub-fixed') ||
            !!overlay.closest('#inventory-inline-hub-fixed') ||
            !!overlay.closest('#missions-inline-hub-fixed');
        if ((characterFixedHub || inventoryFixedHub || missionsFixedHub) && !clickedInsideNavHub) {
            closeCharacterHubInline();
        }
    }
    handleDelegatedAction(event, 'data-action');
});

document.addEventListener('input', (event) => {
    handleDelegatedAction(event, 'data-input-action');
});

document.addEventListener('change', (event) => {
    handleDelegatedAction(event, 'data-change-action');
    const sel = event.target.closest('[data-role-select]');
    if (sel) {
        const charId = Number(sel.dataset.roleSelect);
        if (charId) changeMemberRole(charId, sel.value);
    }
});

document.addEventListener('mouseover', (event) => {
    handleDelegatedAction(event, 'data-hover-action');
});

document.addEventListener('mouseout', (event) => {
    handleDelegatedAction(event, 'data-leave-action');
});

document.addEventListener('error', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (target.dataset.errorHide === 'true') {
        target.style.display = 'none';
    }
    if (target.dataset.errorOpacityZero === 'true') {
        target.style.opacity = '0';
    }
    if (target.dataset.errorBackground) {
        target.style.background = target.dataset.errorBackground;
    }
    if (target.dataset.errorSrc) {
        const nextSrc = target.dataset.errorSrc;
        if (target.src !== nextSrc) {
            target.src = nextSrc;
        }
    }
    if (target.dataset.errorNextDisplay && target.nextElementSibling) {
        target.nextElementSibling.style.display = target.dataset.errorNextDisplay;
    }
    // Handle leaderboard class image fallback - only if profile_pic is null/undefined
    if (target.classList.contains('lb-class-img')) {
        const profilePic = target.dataset.profilePic;
        if (!profilePic || profilePic === 'null' || profilePic === 'undefined') {
            const defaultClass = target.dataset.class;
            if (defaultClass) {
                target.src = `/images/class/${defaultClass}.png`;
            }
        }
    }
}, true);

function splitLegacyArgs(argsString) {
    const args = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < argsString.length; i++) {
        const ch = argsString[i];
        if (quote) {
            current += ch;
            if (ch === quote && argsString[i - 1] !== '\\') quote = null;
            continue;
        }
        if (ch === '\'' || ch === '"') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === ',') {
            args.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

function parseLegacyArg(token, el, event) {
    const value = token.trim();
    if (!value) return undefined;
    if (value === 'this') return el;
    if (value === 'event') return event;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if ((value.startsWith('\'') && value.endsWith('\'')) || (value.startsWith('"') && value.endsWith('"'))) {
        return value.slice(1, -1).replace(/\\'/g, '\'').replace(/\\"/g, '"');
    }
    return value;
}

function parseLegacyHandler(raw, attrName, el) {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (attrName === 'onerror') {
        return { type: 'error', raw: trimmed };
    }
    let stopPropagation = false;
    let expression = trimmed;
    if (expression.startsWith('event.stopPropagation();')) {
        stopPropagation = true;
        expression = expression.replace('event.stopPropagation();', '').trim();
    }
    const match = expression.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
    if (!match) return null;
    const [, actionName, argList] = match;
    const allowed = ['showTabAndCloseMenu', 'skipTutorial', 'sortTable', 'toggleMonsterLore'];
    if (!allowed.includes(actionName)) return null;
    const rawArgs = argList.trim() ? splitLegacyArgs(argList) : [];
    return { type: attrName.slice(2), actionName, rawArgs, stopPropagation, el };
}

function applyLegacyErrorBehavior(el, raw) {
    if (!raw || el.dataset.legacyErrorBound === 'true') return;
    if (raw.includes("this.style.display='none'")) el.dataset.errorHide = 'true';
    if (raw.includes('this.style.opacity=\'0\'') || raw.includes('this.style.opacity="0"')) el.dataset.errorOpacityZero = 'true';
    const bgMatch = raw.match(/this\.style\.background=['"]([^'"]+)['"]/);
    if (bgMatch) el.dataset.errorBackground = bgMatch[1];
    const srcMatch = raw.match(/this\.(?:src|style\.backgroundImage)=['"]([^'"]+)['"]/);
    if (srcMatch && !srcMatch[1].includes('backgroundImage')) el.dataset.errorSrc = srcMatch[1];
    const nextDisplayMatch = raw.match(/next(?:ElementSibling|Sibling)\.style\.display=['"]([^'"]+)['"]/);
    if (nextDisplayMatch) el.dataset.errorNextDisplay = nextDisplayMatch[1];
    el.dataset.legacyErrorBound = 'true';
}

function bindLegacyInlineHandlers(root = document) {
    const scope = root instanceof Element || root instanceof Document ? root : document;
    const elements = [];
    if (scope instanceof Element && scope.matches('[onclick],[onchange],[oninput],[onerror]')) {
        elements.push(scope);
    }
    elements.push(...scope.querySelectorAll('[onclick],[onchange],[oninput],[onerror]'));
    for (const el of elements) {
        for (const attrName of ['onclick', 'onchange', 'oninput', 'onerror']) {
            const raw = el.getAttribute(attrName);
            if (!raw) continue;
            if (attrName === 'onerror') {
                applyLegacyErrorBehavior(el, raw);
                el.removeAttribute(attrName);
                continue;
            }
            if (el.dataset[`legacyBound${attrName}`] === 'true') {
                el.removeAttribute(attrName);
                continue;
            }
            const parsed = parseLegacyHandler(raw, attrName, el);
            if (!parsed) continue;
            el.addEventListener(parsed.type, (event) => {
                if (parsed.stopPropagation) event.stopPropagation();
                if (parsed.type === 'click' && el.dataset.actionBusy === 'true') return;
                const args = parsed.rawArgs.map((token) => parseLegacyArg(token, el, event)).filter((v) => v !== undefined);
                const shouldLock = parsed.type === 'click' && shouldAutoLockActionTrigger(el, event, 'data-action');
                if (shouldLock) setActionTriggerBusy(el, true);
                try {
                    const result = callNamedAction(parsed.actionName, args, event, el);
                    if (shouldLock && isPromiseLike(result)) {
                        result.finally(() => setActionTriggerBusy(el, false));
                    } else if (shouldLock) {
                        setActionTriggerBusy(el, false);
                    }
                } catch (err) {
                    if (shouldLock) setActionTriggerBusy(el, false);
                    throw err;
                }
            });
            el.dataset[`legacyBound${attrName}`] = 'true';
            el.removeAttribute(attrName);
        }
    }
}

const legacyHandlerObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
                bindLegacyInlineHandlers(node);
            }
        }
    }
});

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
    closeTopbarMenu();
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

function showShopItemTooltip(event, itemJson) {
    cancelHideTooltip();
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;

    let item;
    try {
        item = typeof itemJson === 'string' ? JSON.parse(itemJson) : itemJson;
    } catch (e) {
        return;
    }

    const qColor = {
        legendary: '#ffd700',
        epic: '#e67e22',
        rare: '#9b59b6',
        common: 'rgba(255,255,255,0.5)'
    }[item.quality || 'common'];

    const imgSrc =
        item.img ||
        (item.name && !item.consumable
            ? getAssetImagePath(item.name)
            : null);

    const priceType = item.priceType || 'gold';
    const priceIcon = priceType === 'gems' ? '💎' : '💰';
    const buyPrice = item.price || 0;
    const gemCost = item.gemCost || 0;

    // Normalize slot for comparison
    let itemSlot = item.slot || item.category || 'item';
    let equippedItem = null;

    if (character?.equipped) {
        if (itemSlot === 'ring' || itemSlot === 'amulet') {
            itemSlot = 'jewelry';
            equippedItem = character.equipped.ring || character.equipped.amulet || null;
        } else {
            equippedItem = character.equipped[itemSlot] || null;
        }
    }

    const classWarn = !isWeaponSuitedForClass(item, character?.class) ? CLASS_WARN_HTML : '';

    // Build compared stat list like inventory tooltip
    let statsHtml = '';
    const allStats = new Set([
        ...Object.keys(item.stats || {}),
        ...Object.keys(equippedItem?.stats || {})
    ].filter(k => !k.includes('type')));

    for (const stat of allStats) {
        if (stat === 'elem_dmg' || stat === 'elem_dmg_type' || stat === 'elem_resist') continue;

        const nv = item.stats?.[stat] || 0;
        const ov = equippedItem?.stats?.[stat] || 0;
        const diff = nv - ov;

        // Skip useless empty rows
        if (nv === 0 && ov === 0) continue;

        const dc = diff > 0 ? '#2ecc71' : diff < 0 ? '#e74c3c' : 'rgba(255,255,255,0.3)';
        const ds = diff > 0 ? `▲${diff}` : diff < 0 ? `▼${Math.abs(diff)}` : '';
        const label = statLabelHtml(stat);

        statsHtml += `
            <div class="tt-stat">
                <span class="tt-stat-name">${label}</span>
                <span class="tt-stat-val">${nv > 0 ? '+' : ''}${nv}</span>
                ${equippedItem && ds ? `<span style="font-size:0.68rem;color:${dc}">${ds}</span>` : ''}
            </div>
        `;
    }

    // Effect for consumables
    let effectHtml = '';
    if (item.effect) {
        const e = item.effect;
        let effectText = '';
        if (e.type === 'heal') effectText = `❤️ Restores ${e.value} HP`;
        else if (e.type === 'heal_full') effectText = '❤️ Fully restores HP';
        else if (e.type === 'mp') effectText = `🔮 Restores ${e.value} MP`;
        else if (e.type === 'temp_stat') effectText = `💪 +${e.value} ${e.stat} for 1 hour`;
        else if (e.type === 'xp') effectText = `⭐ +${e.value} XP`;

        if (effectText) {
            effectHtml = `
                <div class="tt-stat">
                    <span class="tt-stat-name">Effect</span>
                    <span class="tt-stat-val">${effectText}</span>
                </div>
            `;
        }
    }

    tooltip.innerHTML = `
        <div class="tt-preview">
            ${
        imgSrc
            ? `<img src="${imgSrc}" data-error-hide="true" data-error-next-display="block"><span class="tt-preview-emoji" style="display:none">${item.emoji || '📦'}</span>`
            : `<span class="tt-preview-emoji">${item.emoji || '📦'}</span>`
    }
        </div>
        <div class="tt-body">
            <div class="tt-name" style="color:${qColor}">${item.name || ''}</div>
            <div class="tt-meta">
                ${capitalize(itemSlot || 'item')}
                ${item.quality && item.quality !== 'common' ? ` · <span style="color:${qColor}">${item.quality}</span>` : ''}
            </div>
            ${item.desc ? `<div class="tt-desc">${item.desc}</div>` : ''}
            <div class="tt-stats">
                ${statsHtml || `<span style="color:var(--text-dim);font-size:0.72rem">No stats</span>`}
                ${effectHtml}
            </div>
            ${classWarn}
            ${equippedItem ? `<div class="tt-vs">vs equipped: <strong>${equippedItem.name}</strong></div>` : ''}
            <div class="tt-price" style="margin-top:8px;font-weight:700;color:var(--gold)">
                Buy: ${priceIcon} ${buyPrice.toLocaleString()}
                ${gemCost > 0 ? ` + 💎 ${gemCost}` : ''}
            </div>
        </div>
        <div class="tt-actions">
            <button class="tt-btn tt-btn-primary" ${actionAttrs('buyItem', item.id)}>
                Buy
            </button>
        </div>
    `;

    tooltip.classList.remove('hidden');
    const r = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';

    const tw = tooltip.offsetWidth || 220;
    const th = tooltip.offsetHeight || 340;

    let left = r.right + 12;
    let top = r.top;

    if (left + tw > window.innerWidth - 8) left = r.left - tw - 12;
    if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;

    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';
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
                <button ${actionAttrs('removeScreenshot')} style="position: absolute; top: -8px; right: -8px; background: #e74c3c; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; color: white; font-size: 14px; display: flex; align-items: center; justify-content: center;">✕</button>
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


async function updateTrainingStatus() {
    try {
        const status = await api('GET', '/skills/training/status');
        const indicator = document.getElementById('training-indicator');
        if (!indicator) return;

        if (status.active) {
            const progress = Math.floor((status.progressPercent ?? status.progressCurrent ?? status.progress_current ?? 0));
            const remaining = formatTrainingTime(status.remainingSeconds || status.remaining || 0);
            indicator.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; background: rgba(155,89,182,0.2); padding: 4px 10px; border-radius: 20px;">
                    <span style="font-size: 0.75rem;">⚔️ ${progress}%</span>
                    <div style="width: 50px; background: rgba(255,255,255,0.2); border-radius: 4px; height: 4px;">
                        <div style="width: ${progress}%; background: #9b59b6; height: 4px; border-radius: 4px;"></div>
                    </div>
                    <span style="font-size: 0.65rem;">${remaining}</span>
                    <button ${actionAttrs('cancelTraining')} style="background: rgba(231,76,60,0.3); border: none; border-radius: 12px; padding: 2px 6px; font-size: 0.6rem; cursor: pointer;">✕</button>
                </div>
            `;
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    } catch(e) {
        console.error('Failed to get training status:', e);
    }
}

function formatTrainingTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

async function cancelTraining() {
    const shouldCancel = await openGameConfirmDialog({
        title: 'Cancel Training',
        message: `<div style="font-size:0.95rem;line-height:1.6;color:var(--text-bright)">Cancel current training?</div><div style="margin-top:8px;font-size:0.8rem;color:var(--text-dim)">Your partial progress will be kept.</div>`,
        confirmLabel: 'Cancel Training',
        cancelLabel: 'Keep Training',
        danger: true
    });
    if (!shouldCancel) return;
    try {
        const d = await api('POST', '/skills/cancel');
        showMsg('skill-tree-msg', d.message);
        hideTrainingOverlay();
        character = await api('GET', '/game/character');
        renderTopBar();
        await renderSkillTreeTab();
        updateTrainingStatus();
    } catch(e) {
        showMsg('skill-tree-msg', e.message, true);
    }
}

// ── Convert MP to Special Mana Potion ─────────────────────────────────────
let _convertingMp = false;

async function convertMpToPotion() {
    if (_convertingMp) return;

    if (specialManaPotionCount >= 5) {
        openGameDialog({
            title: '💎 Limit Reached',
            message: `You already have ${specialManaPotionCount}/5 Special Mana Potions. Use some before creating more.`,
            confirmLabel: 'OK',
            showCancel: false
        });
        return;
    }

    const currentMp = character?.mission_points ?? 0;
    if (currentMp < 60) {
        openGameDialog({
            title: '⚠️ Not Enough MP',
            message: `You need 60 MP to create a potion. You have ${currentMp} MP.`,
            confirmLabel: 'OK',
            showCancel: false
        });
        return;
    }

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
            character = response.character;
            renderTopBar();
            updatePotionBadge(true);
            showMsg('convert-mp-status', response.message);
        } else {
            openGameDialog({
                title: '⚠️ Conversion Failed',
                message: response.error || 'Failed to convert MP',
                confirmLabel: 'OK',
                showCancel: false
            });
        }
    } catch (error) {
        console.error('MP conversion error:', error);
        openGameDialog({
            title: '⚠️ Conversion Failed',
            message: error.message || 'Failed to convert MP',
            confirmLabel: 'OK',
            showCancel: false
        });
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

function applyPotionBadgeDisplay() {
    const badge = document.getElementById('potion-badge');
    if (badge) {
        if (specialManaPotionCount > 0) {
            badge.textContent = specialManaPotionCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function syncPotionBadgeFromInventory(inv) {
    const items = Array.isArray(inv?.items) ? inv.items : [];
    let total = 0;
    for (const item of items) {
        const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data;
        if (data?.id === 'special_mana_potion') {
            total += data.qty || 1;
        }
    }
    specialManaPotionCount = total;
    specialManaPotionCountFetchedAt = Date.now();
    applyPotionBadgeDisplay();
    renderTopbarMenu();
}

async function updatePotionBadge(force = false) {
    const cacheAge = Date.now() - specialManaPotionCountFetchedAt;
    if (!force && specialManaPotionCountFetchedAt && cacheAge < 60000) {
        applyPotionBadgeDisplay();
        return;
    }
    if (potionBadgeRequest) {
        await potionBadgeRequest;
        return;
    }
    potionBadgeRequest = (async () => {
        try {
            const inv = await api('GET', '/game/inventory');
            syncPotionBadgeFromInventory(inv);
        } catch (e) {
            console.error('Failed to update potion badge:', e);
        } finally {
            potionBadgeRequest = null;
        }
    })();
    await potionBadgeRequest;
}
let currentUpgradeItemId = null;

async function craftComponentDirectly(componentId, name) {
    try {
        const d = await api('POST', '/game/forge/refine', { componentId });
        character = await api('GET', '/game/character');
        renderTopBar();
        renderCharacter();
        showMsg('upgrade-msg', d.message);
        // Refresh the upgrade modal
        if (currentUpgradeItemId) openUpgradeModal(currentUpgradeItemId);
    } catch (e) {
        showMsg('upgrade-msg', e.message, true);
    }
}
window.craftComponentDirectly = craftComponentDirectly;

async function openUpgradeModal(inventoryId) {
    currentUpgradeItemId = inventoryId;
    selectedComponentId = null;
    selectedComponentName = null;
    currentUpgradeBaseLevel = null;
    upgradeConfirmBusy = false;

    try {
        const invData = await api('GET', '/game/inventory');
        const item = invData.items.find(i => i.id === inventoryId);
        if (!item) return;

        const itemData = item.item_data;
        const currentUpgrade = item.upgrade_level || 0;
        currentUpgradeBaseLevel = currentUpgrade;
        _currentUpgradeItemCrimsonUsed = itemData.crimsonAlloyUsed || 0;
        const quality = itemData.quality || 'common';
        const maxUpgrade = quality === 'legendary' ? 5 : (quality === 'epic' || quality === 'rare' ? 4 : 3);

        if (currentUpgrade >= maxUpgrade) {
            showMsg('inv-msg', `Item already at max upgrade level (+${maxUpgrade}) for ${quality} quality!`, true);
            return;
        }

        // Get owned components count
        const ownedComponents = {};
        invData.items.filter(i => i.item_type === 'component').forEach(c => {
            const d = c.item_data;
            ownedComponents[d.id] = (ownedComponents[d.id] || 0) + (d.qty || 1);
        });

        // Get owned raw materials count
        const ownedRawMats = {};
        invData.items.filter(i => i.item_type === 'raw_mat').forEach(m => {
            const d = m.item_data;
            ownedRawMats[d.id] = (ownedRawMats[d.id] || 0) + (d.qty || 1);
        });

        // Build component list HTML showing all possible upgrade materials
        let componentsHtml = '';
        Object.entries(COMPONENT_UPGRADE_VALUES).forEach(([id, info]) => {
            const owned = ownedComponents[id] || 0;
            const canCraft = info.recipe && Object.entries(info.recipe).every(([mat, qty]) => (ownedRawMats[mat] || 0) >= qty) && (character?.gold || 0) >= (info.goldCost || 0);

            // Build recipe string for hint
            let recipeInfo = '';
            if (info.recipe) {
                recipeInfo = `<div class="upgrade-component-recipe">Recipe: ${Object.entries(info.recipe).map(([mat, qty]) => {
                    const has = ownedRawMats[mat] || 0;
                    const color = has >= qty ? '#2ecc71' : '#e74c3c';
                    const matName = RAW_MATERIAL_INFO[mat]?.name || mat.replace(/_/g, ' ');
                    return `<span style="color:${color}">${qty} ${matName}</span>`;
                }).join(', ')}</div>`;
            }

            componentsHtml += `
                <div class="upgrade-component-card ${owned > 0 ? '' : 'unowned'} ${selectedComponentId === id ? 'selected' : ''}" 
                     ${owned > 0 ? actionAttrs('selectComponent', id, info.name, owned) : ''}>
                    <div class="component-icon-wrap">
                        <div class="component-icon">${info.emoji || '🔧'}</div>
                        <div class="component-owned-badge">${owned}</div>
                    </div>
                    <div class="component-info">
                        <div class="component-name">${info.name} <span class="component-bonus-tag">+${info.bonus} stats</span></div>
                        <div class="component-source">📍 Source: ${info.source}</div>
                        ${recipeInfo}
                    </div>
                    ${canCraft ? `
                        <button class="btn-craft-direct" ${actionAttrs('craftComponentDirectly', id, info.name)}>⚒️ Craft</button>
                    ` : ''}
                </div>
            `;
        });

        const modalContent = document.getElementById('upgrade-modal-content');
        modalContent.innerHTML = `
            <div class="upgrade-item-info">
                <div class="upgrade-item-preview">${itemIcon(itemData, '48px')}</div>
                <div class="upgrade-item-details">
                    <div class="upgrade-item-name">${itemData.name}</div>
                    <div class="upgrade-item-level-row">
                        <span class="upgrade-item-current">Level +${currentUpgrade}</span>
                        <span class="upgrade-item-arrow">➜</span>
                        <span class="upgrade-item-next">Level +${currentUpgrade + 1}</span>
                    </div>
                </div>
            </div>
            <div class="upgrade-section-title">Select a component to consume:</div>
            <div class="upgrade-components-grid">
                ${componentsHtml}
            </div>
            <div id="upgrade-selected-info" class="upgrade-selected-info hidden">
                <div class="upgrade-selected-box">
                    <div id="selected-component-details"></div>
                    <button class="btn-primary btn-confirm-upgrade" ${actionAttrs('confirmUpgrade')}>Confirm Upgrade</button>
                </div>
            </div>
            <div id="upgrade-msg" class="msg-bar hidden" style="margin-top:12px"></div>
        `;

        document.getElementById('upgrade-modal').classList.remove('hidden');
        const modalBox = document.querySelector('#upgrade-modal .upgrade-modal-box');
        if (modalBox) modalBox.scrollTop = 0;

    } catch (error) {
        console.error('Error opening upgrade modal:', error);
        showMsg('inv-msg', error.message, true);
    }
}

let selectedComponentId = null;
let selectedComponentName = null;
let currentUpgradeBaseLevel = null;
let upgradeConfirmBusy = false;
let _crimsonSelectedStats = [];
let _currentUpgradeItemCrimsonUsed = 0;

function selectComponent(id, name, qty, el) {
    if (qty < 1) {
        showMsg('inv-msg', `You don't have any ${name}!`, true);
        return;
    }

    selectedComponentId = id;
    selectedComponentName = name;
    _crimsonSelectedStats = [];

    // Highlight selected card
    document.querySelectorAll('.upgrade-component-card').forEach(card => card.classList.remove('selected'));
    if (el) el.classList.add('selected');

    const selectedInfo = document.getElementById('upgrade-selected-info');
    const detailsDiv = document.getElementById('selected-component-details');
    const info = COMPONENT_UPGRADE_VALUES[id] || {};

    if (info.statPick) {
        const remaining = 2 - _currentUpgradeItemCrimsonUsed;
        const statGrid = POSSIBLE_STATS.map(function(s) {
            return '<button class="crimson-stat-btn" data-stat="' + s + '">' + s.replace(/_/g, ' ') + '</button>';
        }).join('');
        detailsDiv.innerHTML = `
            <div class="selected-comp-name">${info.emoji || '🔧'} ${name}</div>
            <div class="selected-comp-bonus">Select 2 stats to upgrade (+${info.bonus} each)</div>
            <div class="selected-comp-owned">You have ${qty} available · Remaining uses: ${remaining}/2</div>
            <div class="crimson-stat-grid" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${statGrid}</div>
            <div id="crimson-picks" style="margin-top:6px;font-size:11px;color:#6a6a70">Selected: none</div>
        `;
        // Wire stat picker clicks
        detailsDiv.querySelectorAll('.crimson-stat-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const stat = this.dataset.stat;
                const idx = _crimsonSelectedStats.indexOf(stat);
                if (idx !== -1) {
                    _crimsonSelectedStats.splice(idx, 1);
                    this.classList.remove('selected');
                } else if (_crimsonSelectedStats.length < 2) {
                    _crimsonSelectedStats.push(stat);
                    this.classList.add('selected');
                }
                const picks = document.getElementById('crimson-picks');
                if (picks) {
                    picks.textContent = _crimsonSelectedStats.length
                        ? 'Selected: ' + _crimsonSelectedStats.map(s => s.replace(/_/g, ' ')).join(', ')
                        : 'Selected: none';
                }
            });
        });
    } else {
        detailsDiv.innerHTML = `
            <div class="selected-comp-name">${info.emoji || '🔧'} ${name}</div>
            <div class="selected-comp-bonus">Bonus: +${info.bonus} to random stats</div>
            <div class="selected-comp-owned">You have ${qty} available</div>
        `;
    }

    selectedInfo.classList.remove('hidden');
    requestAnimationFrame(() => {
        const confirmBtn = document.querySelector('#upgrade-modal .btn-confirm-upgrade');
        if (confirmBtn && window.innerWidth <= 768) {
            confirmBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

async function confirmUpgrade() {
    if (!selectedComponentId) {
        showMsg('inv-msg', 'Please select a component first!', true);
        return;
    }
    if (upgradeConfirmBusy) return;

    upgradeConfirmBusy = true;
    const confirmBtn = document.querySelector('#upgrade-modal .btn-confirm-upgrade');
    const previousBtnText = confirmBtn ? confirmBtn.textContent : '';
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Upgrading...';
    }

    try {
        const body = {
            componentId: selectedComponentId,
            expectedUpgradeLevel: currentUpgradeBaseLevel
        };
        if (COMPONENT_UPGRADE_VALUES[selectedComponentId]?.statPick) {
            if (_crimsonSelectedStats.length !== 2) {
                openGameDialog({ title: 'Select Stats', message: 'You need to select exactly 2 stats to upgrade' });
                upgradeConfirmBusy = false;
                if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = previousBtnText || 'Confirm Upgrade'; }
                return;
            }
            body.selectedStats = _crimsonSelectedStats;
        }
        const result = await api('POST', `/game/equipment/upgrade/${currentUpgradeItemId}`, body);

        if (result.success) {
            let message = result.message;
            if (result.upgradedStats && result.upgradedStats.length > 0) {
                message += `\n\nStats improved:\n`;
                result.upgradedStats.forEach(s => {
                    const statName = s.stat.replace(/_/g, ' ');
                    message += `• ${statName}: ${s.oldValue} → ${s.newValue} (+${s.increase})\n`;
                });
            }
            character = await api('GET', '/game/character');
            renderTopBar();
            showMsg('inv-msg', message);
            _crimsonSelectedStats = [];
            closeUpgradeModal();
            await loadInventory();
            if (typeof renderCharacter === 'function') renderCharacter();
        } else {
            openGameDialog({ title: 'Upgrade Failed', message: result.message || 'Something went wrong' });
        }
    } catch (error) {
        openGameDialog({ title: 'Upgrade Error', message: error.message });
    } finally {
        if (!document.getElementById('upgrade-modal').classList.contains('hidden')) {
            upgradeConfirmBusy = false;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = previousBtnText || 'Confirm Upgrade';
            }
        }
    }
}

function closeUpgradeModal() {
    document.getElementById('upgrade-modal').classList.add('hidden');
    currentUpgradeItemId = null;
    selectedComponentId = null;
    selectedComponentName = null;
    currentUpgradeBaseLevel = null;
    upgradeConfirmBusy = false;
}

async function openExchangeModal() {
    const modal = document.getElementById('exchange-modal');
    const content = document.getElementById('exchange-content');

    modal.classList.remove('hidden');
    content.innerHTML = '<p class="loading">Loading exchanges...</p>';

    try {
        const data = await api('GET', '/exchange/fragments/list');

        let html = `
            <div style="margin-bottom: 16px; padding: 12px; background: rgba(155,89,182,0.1); border-radius: 8px;">
                <div style="font-size: 1.2rem; font-weight: bold; color: #f1c40f;">⭐ Legendary Fragments: ${data.fragmentCount}</div>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Exchange fragments for materials</div>
            </div>
        `;

        const rarityNames = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
        const rarityColors = { 1: '#95a5a6', 2: '#2ecc71', 3: '#3498db', 4: '#9b59b6', 5: '#f1c40f' };

        for (const [rarity, materials] of Object.entries(data.exchanges)) {
            html += `
                <div style="margin-top: 16px;">
                    <div style="font-size: 0.8rem; font-weight: bold; color: ${rarityColors[rarity]}; margin-bottom: 8px;">
                        ${rarityNames[rarity]} Materials
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px;">
            `;

            for (const mat of materials) {
                html += `
                    <div style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-size: 1.3rem;">${mat.emoji}</span>
                            <span style="font-weight: bold;">${mat.name}</span>
                        </div>
                        <div style="font-size: 0.7rem; color: #f1c40f;">Cost: ${mat.fragmentCost} ⭐</div>
                        <div style="display: flex; gap: 4px; margin-top: 8px;">
                            <button class="btn-sm" ${actionAttrs('exchangeFragments', mat.id, 1)} ${!mat.canAfford ? 'disabled' : ''}>x1</button>
                            <button class="btn-sm" ${actionAttrs('exchangeFragments', mat.id, 5)} ${data.fragmentCount < mat.fragmentCost * 5 ? 'disabled' : ''}>x5</button>
                            <button class="btn-sm" ${actionAttrs('exchangeFragments', mat.id, 10)} ${data.fragmentCount < mat.fragmentCost * 10 ? 'disabled' : ''}>x10</button>
                        </div>
                    </div>
                `;
            }

            html += `</div></div>`;
        }

        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = `<p class="error">${e.message}</p>`;
    }
}

async function exchangeFragments(materialId, quantity) {
    try {
        const result = await api('POST', '/game/exchange/fragments', { materialId, quantity });
        showMsg('exchange-msg', result.message);
        openExchangeModal(); // Refresh the modal
        renderTopBar();
        if (document.getElementById('tab-inventory')?.classList.contains('active')) {
            loadInventory();
        }
    } catch (e) {
        showMsg('exchange-msg', e.message, true);
    }
}

function closeExchangeModal() {
    const modal = document.getElementById('exchange-modal');
    if (modal) modal.classList.add('hidden');
}

function closeModalOverlayById(modalId) {
    switch (modalId) {
        case 'battle-result-modal': closeBattle(); break;
        case 'profile-modal': closeProfile(); break;
        case 'compose-modal': closeCompose(); break;
        case 'exchange-modal': closeExchangeModal(); break;
        case 'mission-location-modal': closeMissionModal2(); break;
        case 'topbar-menu-modal': closeTopbarMenu(); break;
        case 'character-switch-modal': closeCharacterSwitcher(); break;
        case 'bug-report-modal': closeBugReport(); break;
        case 'achievements-modal': closeAchievementsModal(); break;
        case 'weekly-tasks-modal': closeWeeklyTasksModal(); break;
        case 'game-guide-modal': closeGameGuide(); break;
        case 'auth-legal-modal': closeAuthLegalModal(); break;
        case 'free-gems-modal': closeFreeGemsModal(); break;
        case 'game-dialog-modal': closeGameDialog(); break;
        case 'mission-rewards-modal':
        case 'upgrade-modal':
            document.getElementById(modalId)?.classList.add('hidden');
            break;
        default:
            document.getElementById(modalId)?.classList.add('hidden');
            break;
    }
}

async function exchangeFragmentForMaterial(materialId, quantity) {
    try {
        const result = await api('POST', '/game/exchange/fragments', { materialId, quantity });
        showMsg('inv-msg', result.message);
        loadInventory();
        renderTopBar();
        if (typeof renderCharacter === 'function') renderCharacter();
    } catch (e) {
        showMsg('inv-msg', e.message, true);
    }
}

async function exitAbyss() {
    try {
        const result = await api('POST', '/game/travel/abyss/exit', {});
        if (result.success) {
            character.location = result.location;
            character.current_map = 'overworld';
            await checkTravelStatus();
            renderWorldMap();
            showMsg('missions-msg', 'You return from the Abyss to Dark City.');
        }
    } catch (e) {
        showMsg('missions-msg', e.message, true);
    }
}
function closeMissionModal2() {
    const modal = document.getElementById('mission-location-modal');
    if (modal) modal.classList.add('hidden');
}
function renderCurrentMap() {
    const currentMap = character?.current_map || 'overworld';
    if (currentMap === 'abyss') {
        renderAbyssMap();
    } else {
        renderWorldMap();
    }
}
window.showShopItemTooltip = showShopItemTooltip;
function renderAbyssMap() {
    const layer = document.getElementById('map-nodes-layer');
    if (!layer || !abyssData) return;

    const currentZone = character?.location || 'shadowfen';
    const playerLevel = character?.level || 1;
    const drawnPairs = new Set();
    const zones = abyssData.zones;
    const routes = abyssData.routes;

    // Draw connections between Abyss zones
    let svgLines = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">`;

    for (const [fromId, neighbors] of Object.entries(routes)) {
        for (const toId of Object.keys(neighbors)) {
            const key = [fromId, toId].sort().join('-');
            if (drawnPairs.has(key)) continue;
            drawnPairs.add(key);
            const from = zones[fromId];
            const to = zones[toId];
            if (!from || !to) continue;
            const isActive = [currentZone, playerTravelTarget].includes(fromId) || [currentZone, playerTravelTarget].includes(toId);
            const path = buildCurvedRoutePath(from.pos, to.pos, key);
            svgLines += `<path d="${path}" style="stroke:${isActive ? 'rgba(155,89,182,0.5)' : 'rgba(255,255,255,0.15)'};stroke-width:2;stroke-dasharray:6 4;fill:none;stroke-linecap:round"/>`;
        }
    }
    svgLines += '</svg>';

    // Render Abyss zones
    const pinsHtml = Object.entries(zones).map(([zoneId, zone]) => {
        const isUnlocked = unlockedAbyssZones.has(zoneId) || currentZone === zoneId;
        const isCurrent = currentZone === zoneId;
        const isTraveling = playerTravelTarget === zoneId;
        const pinStyle = `position:absolute;left:${zone.pos.x}%;top:${zone.pos.y}%;transform:translate(-50%,-50%);cursor:pointer;z-index:10;text-align:center;transition:transform 0.2s;${!isUnlocked ? 'opacity:0.82' : ''}`;
        const badge = isCurrent ? '📍' : isTraveling ? '🚶' : !isUnlocked ? '⚔️' : '';
        const ringStyle = `width:72px;height:72px;border-radius:50%;border:3px solid ${isCurrent ? '#9b59b6' : !isUnlocked ? 'rgba(231,76,60,0.7)' : 'rgba(255,255,255,0.3)'};object-fit:cover;display:block;background:#2c3e50;${!isUnlocked ? ';filter:saturate(0.85);box-shadow:0 0 0 2px rgba(231,76,60,0.2)' : ''}${isCurrent ? ';box-shadow:0 0 0 3px rgba(155,89,182,0.4)' : ''}${isTraveling ? ';animation:pulse 1.5s infinite' : ''}`;

        return `<div style="${pinStyle}" ${actionAttrs('onMapNodeClick', zoneId)} title="${zone.name}">
            <div style="position:relative;display:inline-block">
                ${badge ? `<span style="position:absolute;top:-4px;right:-4px;font-size:14px;line-height:1;z-index:2">${badge}</span>` : ''}
                <img style="${ringStyle}" src="${zone.mapImg}" alt="${zone.name}" data-error-background="#2c3e50">
            </div>
            <div style="text-align:center;margin-top:5px;font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap">${zone.name}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.6);text-align:center">${isUnlocked ? (isCurrent ? 'HERE' : '') : 'Gatekeeper'}</div>
        </div>`;
    }).join('');

    // Add exit to Dark City as a zone-style circle (only from Shadowfen)
    const showExit = currentZone === 'shadowfen';
    const exitButton = showExit ? `
        <div style="position:absolute;left:40%;top:92%;transform:translate(-50%,-50%);cursor:pointer;z-index:10;text-align:center" ${actionAttrs('exitAbyss')} title="Return to Dark City">
            <div style="position:relative;display:inline-block">
                <img style="width:72px;height:72px;border-radius:50%;border:3px solid #e74c3c;object-fit:cover;display:block;background:#2c3e50;box-shadow:0 0 0 3px rgba(231,76,60,0.3)" src="/images/zones/dark-city.jpg" alt="Dark City" data-error-background="#2c3e50">
                <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.9);text-transform:uppercase;letter-spacing:2px">EXIT</span>
            </div>
        </div>
    ` : '';

    // Swap map background to abyss-map
    const bgImg = document.getElementById('world-map-bg');
    if (bgImg) bgImg.src = '/images/abyss-map.jpg';

    layer.innerHTML = svgLines + pinsHtml + exitButton;
}

async function showProfilePicSelector() {
    try {
        const data = await api('GET', '/game/profile-pics');
        const existing = document.getElementById('profile-pic-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'profile-pic-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:2147483647;display:flex;align-items:center;justify-content:center;touch-action:none;-webkit-overflow-scrolling:touch;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        const currentPic = character.profile_pic || `${character.class}.png`;

        const optionsHtml = data.available.map(pic => {
            const isSelected = pic.id === currentPic;
            const imgStyle = `width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid ${isSelected ? '#f1c40f' : 'rgba(255,255,255,0.2)'};cursor:pointer;margin:5px;${!pic.unlocked ? 'opacity:0.4;filter:grayscale(1)' : ''}`;
            return `<div class="profile-pic-option" data-pic-id="${pic.id}" data-unlocked="${pic.unlocked}" style="text-align:center;">
                <img src="/images/class/${pic.id}" style="${imgStyle}" data-error-hide="true" title="${pic.name}${!pic.unlocked ? ' (Locked)' : ''}">
                <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">${pic.name}</div>
                ${isSelected ? '<div style="font-size:10px;color:#f1c40f;">✓ Selected</div>' : ''}
            </div>`;
        }).join('');

        modal.innerHTML = `
            <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;padding:24px;max-width:90%;max-height:90%;overflow:auto;text-align:center;">
                <h3 style="color:#f1c40f;margin:0 0 16px 0;">🎨 Profile Picture</h3>
                <div id="profile-pic-options" style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-bottom:16px;">${optionsHtml}</div>
                <button class="btn-primary" id="profile-pic-close-btn">Close</button>
            </div>
        `;

        modal.querySelector('#profile-pic-close-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('#profile-pic-options').addEventListener('click', async (e) => {
            const option = e.target.closest('.profile-pic-option');
            if (!option || option.dataset.unlocked === 'false') return;
            const picId = option.dataset.picId;
            await setProfilePic(picId);
            modal.remove();
        });

        document.body.appendChild(modal);
    } catch (e) {
        showMsg('inv-msg', e.message, true);
    }
}

async function setProfilePic(picId) {
    try {
        await api('POST', '/game/profile-pic/set', { profilePic: picId });
        character.profile_pic = picId;
        renderTopBar();
        showMsg('inv-msg', 'Profile picture updated!', false);
    } catch (e) {
        showMsg('inv-msg', e.message, true);
    }
}

// ── Service Worker — disabled (caused navigation blocking + stale cache issues) ──
// Registration moved to sw-register.js if needed later
