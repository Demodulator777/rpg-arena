window.addEventListener('error', (e) => console.error('[GLOBAL]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[UNHANDLED]', e.reason));

// ---- DOM refs ----
const lobby = document.getElementById('lobby');
const lobbyName = document.getElementById('lobby-name');
const lobbyCode = document.getElementById('lobby-code');
const lobbyLevel = document.getElementById('lobby-level');
const lobbyError = document.getElementById('lobby-error');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const gameContainer = document.getElementById('game-container');
const gameWorld = document.getElementById('game-world');
const mapEl = document.getElementById('map');
const playerEl = document.getElementById('player');
const playerSprite = document.getElementById('playerSprite');
const hpInner = document.getElementById('player-hp-inner');
const roomCodeEl = document.getElementById('room-code');
const playerListEl = document.getElementById('player-list');
const interactBtn = document.getElementById('interact-btn');
const invBtn = document.getElementById('inv-btn');
const invPanel = document.getElementById('inv-panel');
const scanBtn = document.getElementById('scan-btn');
const actionBtn = document.getElementById('action-btn');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const msgEl = document.getElementById('message');
const fogEl = document.getElementById('fog');

// ---- Preload sprites ----
const preloadImages = ['/images/assets/roguelike3.png','/images/assets/roguelike1.png','/images/assets/goblin.png','/images/assets/archergoblin.png'];
preloadImages.forEach(s => { (new Image()).src = s; });

// ---- Camera Constants ----
const REF_W = 400;
const REF_H = 700;
let worldScale = 1;

// ---- State ----
let ws = null;
let roomCode = '';
let myPlayerId = '';
let myPlayer = null;
let players = {};
let monsters = {};
let chests = {};
const keys = { up: false, down: false, left: false, right: false };
let isRunning = false;
let currentDir = 'down';
const PLAYER_SPEED = 0.1;
let playerWX = 2500, playerWY = 2500;
let localWalls = [];

// Screen shake
let shakeUntil = 0;
let shakeIntensity = 0;

function triggerShake(intensity) {
  shakeUntil = Date.now() + 200;
  shakeIntensity = intensity;
}

function checkCollision(nx, ny) {
  const b = 20;
  const cx = playerWX + nx;
  const cy = playerWY + ny;
  return localWalls.some(w =>
    cx + 13 > w.x + b &&
    cx - 13 < w.x + b + w.w &&
    cy + 26 > w.y + b &&
    cy - 26 < w.y + b + w.h
  );
}

// ---- Connection ----
async function connectToRoom(code, level, name, isCreate) {
  let mapData = {};
  try {
    const res = await fetch(`/api/game/maps/${level}`);
    if (res.ok) {
      const row = await res.json();
      mapData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    }
  } catch (e) { /* fallback - server can use its own DB */ }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: isCreate ? 'create_room' : 'join_room', name, level, code, mapData }));
  };
  ws.onmessage = (e) => {
    try { handleMessage(JSON.parse(e.data)); }
    catch (err) { console.error('ws.onmessage error:', err); }
  };
  ws.onclose = (e) => { lobbyError.textContent = 'Disconnected (code:' + e.code + ' reason:' + e.reason + ')'; lobby.classList.remove('hide'); isRunning = false; };
  ws.onerror = () => { lobbyError.textContent = 'Connection failed'; };
}

// ---- Burst ----
const BURST_MS = 60;
const BURST_COLS = 5;
const BURST_TOTAL = 25;
let isBursting = false;
let burstFrame = 0;
let burstTimer = 0;
let burstDamaged = new Set();

// ---- Animation state ----
const ROW = { down: 0, right: 25, left: 75, up: 100 };
const WALK_MS = 150;
let walkFrame = 0;
let frameAccum = 0;
let lastAnimTime = 0;

function setWalkFrame(rowPct, colIdx) {
  if (isBursting) return;
  playerSprite.style.backgroundImage = 'url(/images/assets/roguelike3.png)';
  playerSprite.style.backgroundPosition = `${colIdx * 25}% ${rowPct}%`;
  playerSprite.style.transform = 'scaleX(1)';
}

function getDirFromKeys() {
  if (keys.right) return 'right';
  if (keys.left) return 'left';
  if (keys.up) return 'up';
  if (keys.down) return 'down';
  return currentDir;
}

function triggerBurst() {
  if (isBursting) return;
  isBursting = true;
  burstDamaged = new Set();
  burstFrame = 0;
  burstTimer = 0;
  playerSprite.style.filter = 'brightness(2) contrast(2)';
  playerSprite.style.backgroundImage = 'url(/images/assets/roguelike1.png)';
  if (currentDir === 'left') playerSprite.style.transform = 'scaleX(-1)';
  else playerSprite.style.transform = 'scaleX(1)';
  playerSprite.style.backgroundPosition = '0% 0%';
  burstFrame++;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'burst' }));
}

// ---- Animations ----
const MONSTER_ATTACK_FRAMES = [{row:50,col:75},{row:50,col:100},{row:75,col:0},{row:75,col:25}];
const ARCHER_ATTACK_FRAMES = [{row:50,col:0},{row:50,col:25},{row:50,col:50},{row:50,col:75},{row:50,col:100}];
const MONSTER_ANIM_MS = 150;
let msgTimer = 0;

// ---- World ----
async function initWorld(state, worldLevel) {
  const level = worldLevel || lobbyLevel.value || 1;
  let d;
  try {
    const res = await fetch(`/api/game/maps/${level}`);
    if (!res.ok) throw new Error('Map not found');
    const row = await res.json();
    d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  } catch (e) {
    lobbyError.textContent = 'Failed to load map: ' + e.message;
    lobby.classList.remove('hide');
    return;
  }

  try {
    if (d.backgroundImage) mapEl.style.background = `url(${d.backgroundImage}) repeat`;
    else mapEl.style.background = '#1a1a1a';

    localWalls = [];
    if (d.walls) {
      for (const w of d.walls) {
        const el = document.createElement('div');
        el.className = 'wall';
        el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;`;
        mapEl.appendChild(el);
        localWalls.push({ x: w.x, y: w.y, w: w.width, h: w.height });
      }
    }
    if (d.decals) {
      for (const dc of d.decals) {
        const el = document.createElement('div');
        el.className = 'decal';
        let css = `left:${dc.x}px;top:${dc.y}px;width:${dc.width}px;height:${dc.height}px;`;
        if (dc.image) css += `background-image:url(${dc.image});background-size:cover;background-position:center;`;
        else css += `background:${dc.color};`;
        el.style.cssText = css;
        mapEl.appendChild(el);
      }
    }
    if (d.traps) {
      for (const tr of d.traps) {
        const el = document.createElement('div');
        el.className = 'trap-zone';
        el.style.cssText = `left:${tr.x}px;top:${tr.y}px;width:${tr.width}px;height:${tr.height}px;`;
        mapEl.appendChild(el);
      }
    }
    if (d.teleports) {
      for (const tp of d.teleports) {
        const el = document.createElement('div');
        el.className = 'teleport-zone';
        el.style.cssText = `left:${tp.x - 15}px;top:${tp.y - 15}px;`;
        mapEl.appendChild(el);
      }
    }
    if (d.beams) {
      for (const bm of d.beams) {
        const el = document.createElement('div');
        el.className = 'beam-line';
        const cx = (bm.x1 + bm.x2) / 2;
        const cy = (bm.y1 + bm.y2) / 2;
        const w = Math.abs(bm.x2 - bm.x1) + 6;
        const h = Math.abs(bm.y2 - bm.y1) + 6;
        el.style.cssText = `left:${cx - w/2}px;top:${cy - h/2}px;width:${w}px;height:${h}px;position:absolute;pointer-events:none;z-index:2;transform-origin:center;transform:rotate(${Math.atan2(bm.y2 - bm.y1, bm.x2 - bm.x1)}rad);`;
        mapEl.appendChild(el);
      }
    }
    if (d.shops) {
      for (const s of d.shops) {
        const el = document.createElement('div');
        el.className = 'shop';
        el.style.cssText = `left:${s.x - 18}px;top:${s.y - 18}px;`;
        mapEl.appendChild(el);
      }
    }

    if (d.exit) {
      const exitEl = document.createElement('div');
      exitEl.id = 'exit-zone';
      exitEl.style.cssText = `left:${d.exit.x - 30}px;top:${d.exit.y - 30}px;`;
      mapEl.appendChild(exitEl);
    }
    if (d.entrance) {
      const entranceEl = document.createElement('div');
      entranceEl.id = 'entrance-zone';
      entranceEl.style.cssText = `left:${d.entrance.x - 30}px;top:${d.entrance.y - 30}px;border-color:#a6a;`;
      mapEl.appendChild(entranceEl);
    }

    if (myPlayer) {
      const myState = Array.isArray(state.players) ? state.players.find(p => p.id === myPlayerId) : null;
      if (myState) { myPlayer = myState; }
      playerWX = myPlayer.x; playerWY = myPlayer.y;
      playerEl.style.left = playerWX + 'px';
      playerEl.style.top = playerWY + 'px';
      hpInner.style.width = (myPlayer.hp / myPlayer.maxHp * 100) + '%';
    }

    if (state.monsters) {
      for (let i = 0; i < state.monsters.length; i++) createMonsterEl(i, state.monsters[i]);
    }
    if (state.chests) {
      for (let i = 0; i < state.chests.length; i++) {
        const c = state.chests[i];
        const el = document.createElement('div');
        el.className = 'chest';
        el.style.cssText = `left:${c.x}px;top:${c.y}px;`;
        if (c.found) el.classList.add('found');
        mapEl.appendChild(el);
        chests[i] = { ...c, el };
      }
    }
    for (const p of state.players) {
      if (p.id !== myPlayerId) addOtherPlayer(p);
    }
    updatePlayerList();
  } catch (e) {
    lobbyError.textContent = 'Failed to render world: ' + e.message;
    lobby.classList.remove('hide');
  }
}

function createMonsterEl(index, m) {
  const el = document.createElement('div');
  el.className = 'monster';
  el.style.cssText = `left:${m.x - 20}px;top:${m.y - 20}px;`;
  el.style.backgroundImage = `url(/images/assets/${m.type === 'ranged' ? 'archer' : ''}goblin.png)`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = '500% 500%';
  const hpBar = document.createElement('div');
  hpBar.className = 'monster-hp';
  const hpFill = document.createElement('div');
  hpFill.className = 'monster-hp-fill';
  hpFill.style.width = '100%';
  hpBar.appendChild(hpFill);
  el.appendChild(hpBar);
  mapEl.appendChild(el);
  monsters[index] = { el, hpFill, alive: true, animFrame: 0, animTimer: 0, hitTimer: 0, _type: m.type };
}

function addOtherPlayer(p) {
  removeOtherPlayer(p.id);
  const container = document.createElement('div');
  container.id = 'op-' + p.id;
  container.className = 'other-player';
  const sprite = document.createElement('div');
  sprite.className = 'player-sprite';
  sprite.style.cssText = 'width:100%;height:100%;background-image:url(/images/assets/roguelike3.png);background-repeat:no-repeat;background-size:500% 500%;background-position:0% 0%;clip-path:inset(21px 18px 9px 18px);';
  const hue = hashHue(p.id);
  sprite.style.filter = `hue-rotate(${hue}deg) brightness(0.8)`;
  container.appendChild(sprite);
  container.style.left = p.x + 'px';
  container.style.top = p.y + 'px';
  mapEl.appendChild(container);
  players[p.id] = { el: container, p };
}

function removeOtherPlayer(id) {
  const el = document.getElementById('op-' + id);
  if (el) el.remove();
  delete players[id];
}

function hashHue(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return hash % 360;
}

function applyState(msg) {
  if (!msg.players || !msg.monsters) return;
  let needListUpdate = false;
  for (const sp of msg.players) {
    if (sp.id === myPlayerId) {
      if (sp.hitFlash > 0) playerSprite.style.filter = 'brightness(3) saturate(0)';
      else if (!isBursting) playerSprite.style.filter = 'none';
      myPlayer = sp;
      hpInner.style.width = (sp.hp / sp.maxHp * 100) + '%';
      needListUpdate = true;
    } else if (players[sp.id]) {
      players[sp.id].p = sp;
      players[sp.id].el.style.left = sp.x + 'px';
      players[sp.id].el.style.top = sp.y + 'px';
      needListUpdate = true;
    }
  }
  if (needListUpdate) updatePlayerList();
  for (let i = 0; i < msg.monsters.length; i++) {
    const sm = msg.monsters[i];
    const local = monsters[i];
    if (!local) continue;
    local.el.style.left = (sm.x - 20) + 'px';
    local.el.style.top = (sm.y - 20) + 'px';
    local.alive = sm.alive;
    local.el.classList.toggle('dead', !sm.alive);
    local.el.style.transform = sm.x < myPlayer?.x ? 'scaleX(-1)' : 'scaleX(1)';
    if (local.hpFill) local.hpFill.style.width = Math.max(0, (sm.hp / sm.maxHp) * 100) + '%';
    if (sm.attacking && local.animTimer <= 0) {
      local.animFrame = 0;
      local.animTimer = MONSTER_ANIM_MS;
      const frames = sm.type === 'ranged' ? ARCHER_ATTACK_FRAMES : MONSTER_ATTACK_FRAMES;
      const f = frames[0];
      local.el.style.backgroundPosition = `${f.col}% ${f.row}%`;
    }
  }
}

function updatePlayerList() {
  if (!ws) return;
  let html = '';
  if (myPlayer) html += `<div style="color:#4f4">▶ ${myPlayer.name} HP:${myPlayer.hp}</div>`;
  for (const id in players) {
    if (players[id] && players[id].p) html += `<div style="color:#ccc">${players[id].p.name} HP:${players[id].p.hp}</div>`;
  }
  playerListEl.innerHTML = html;
}

function toggleInventory() {
  invPanel.classList.toggle('show');
  updateInventoryUI();
}

function usePotion() {
  if (!myPlayer || myPlayer.potions <= 0 || myPlayer.hp >= myPlayer.maxHp) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'use_potion' }));
  }
}

function updateInventoryUI() {
  invPanel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Inventory</b><button id="inv-close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer">✕</button></div>
  <div class="inv-row">💰 Silver coins: ${myPlayer?.coins || 0}</div>
  <div class="inv-row">🧪 Healing potions: ${myPlayer?.potions || 0}
    <button id="use-potion-btn" ${myPlayer?.potions > 0 && myPlayer?.hp < myPlayer?.maxHp ? '' : 'disabled'} style="margin-left:8px;padding:2px 8px;background:#484;border:1px solid #6a6;border-radius:4px;color:#fff;cursor:pointer;font-size:11px">Use</button>
  </div>`;
  document.getElementById('inv-close')?.addEventListener('click', toggleInventory);
  document.getElementById('use-potion-btn')?.addEventListener('click', usePotion);
}

function interactAction() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'interact' }));
}

function showMessage(text) {
  msgEl.textContent = text;
  msgEl.classList.add('show');
  msgTimer = 3000;
}

let lastFogCSS = '';
function updateFog() {
  if (!myPlayer) return;
  const fogRadius = 250 * worldScale;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const css = `position:fixed;inset:0;z-index:50;pointer-events:none;background:#000;-webkit-mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%);mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%)`;
  if (css !== lastFogCSS) { lastFogCSS = css; fogEl.style.cssText = css; }
}
window.addEventListener('resize', () => { lastFogCSS = ''; });

// ---- Message handler ----
function handleMessage(msg) {
  switch (msg.type) {
    case 'room_created':
    case 'room_joined':
      lobby.classList.add('hide');
      roomCode = msg.code;
      myPlayerId = msg.playerId;
      myPlayer = msg.player;
      playerWX = msg.player.x;
      playerWY = msg.player.y;
      roomCodeEl.textContent = 'Room: ' + roomCode;
      initWorld(msg.state);
      if (!isRunning) { isRunning = true; requestAnimationFrame(gameLoop); }
      break;
    case 'player_joined':
      addOtherPlayer(msg.player);
      updatePlayerList();
      break;
    case 'player_left':
      removeOtherPlayer(msg.playerId);
      updatePlayerList();
      break;
    case 'state':
      applyState(msg);
      break;
    case 'show_interact':
      interactBtn.textContent = msg.action || 'Open';
      interactBtn.classList.add('show');
      interactBtn.parentElement.style.left = (msg.x - 20) + 'px';
      interactBtn.parentElement.style.top = (msg.y - 48) + 'px';
      break;
    case 'hide_interact':
      interactBtn.classList.remove('show');
      break;
    case 'chest_opened':
      const ch = chests[msg.chestIndex];
      if (ch) { ch.found = true; ch.el.classList.add('found'); }
      break;
    case 'loot':
      if (myPlayer) {
        myPlayer.coins = (myPlayer.coins || 0) + (msg.coins || 0);
        if (msg.potion) myPlayer.potions = (myPlayer.potions || 0) + 1;
      }
      showMessage(`${msg.coins ? '+' + msg.coins + ' silver coins' : ''}${msg.coins && msg.potion ? ', ' : ''}${msg.potion ? '+1 potion' : ''}`);
      updateInventoryUI();
      break;
    case 'teleported':
      playerWX = msg.x; playerWY = msg.y;
      playerEl.style.left = playerWX + 'px';
      playerEl.style.top = playerWY + 'px';
      break;
    case 'level_change':
      roomCodeEl.textContent = 'Room: ' + roomCode + ' Lv.' + msg.level;
      document.querySelectorAll('.wall, .chest, .shop, .monster, #exit-zone, #entrance-zone, .decal, .trap-zone, .teleport-zone, .beam-line').forEach(el => el.remove());
      monsters = {}; chests = {}; players = {};
      initWorld(msg.state, msg.level);
      break;
    case 'potion_used':
      if (myPlayer) {
        myPlayer.hp = msg.hp;
        myPlayer.maxHp = msg.maxHp;
        myPlayer.potions = msg.potions;
        hpInner.style.width = (msg.hp / msg.maxHp * 100) + '%';
      }
      showMessage('Used healing potion +30 HP');
      updateInventoryUI();
      break;
    case 'error':
      lobbyError.textContent = msg.message;
      break;
  }
}

// ---- Joystick ----
let joystickActive = false;
function handleJoystick(e) {
  if (!joystickActive) return;
  const rect = joystickArea.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  let moveX = clientX - centerX;
  let moveY = clientY - centerY;
  const dist = Math.hypot(moveX, moveY);
  const maxDist = 45;
  if (dist > maxDist) { moveX = (moveX / dist) * maxDist; moveY = (moveY / dist) * maxDist; }
  joystickKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;
  keys.up = moveY < -15; keys.down = moveY > 15; keys.left = moveX < -15; keys.right = moveX > 15;
  sendInput();
}
function sendInput() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', keys }));
}

joystickArea.addEventListener('mousedown', (e) => { joystickActive = true; handleJoystick(e); });
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => { joystickActive = false; keys.up = keys.down = keys.left = keys.right = false; joystickKnob.style.transform = 'translate(0, 0)'; sendInput(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') { keys.up = true; sendInput(); }
  else if (e.key === 's' || e.key === 'ArrowDown') { keys.down = true; sendInput(); }
  else if (e.key === 'a' || e.key === 'ArrowLeft') { keys.left = true; sendInput(); }
  else if (e.key === 'd' || e.key === 'ArrowRight') { keys.right = true; sendInput(); }
  else if (e.key === 'z' || e.key === 'Z') triggerBurst();
  else if (e.key === 'x' || e.key === 'X') performScan();
  else if (e.key === ' ') { e.preventDefault(); interactAction(); }
  else if (e.key === 'i' || e.key === 'I') toggleInventory();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') { keys.up = false; sendInput(); }
  else if (e.key === 's' || e.key === 'ArrowDown') { keys.down = false; sendInput(); }
  else if (e.key === 'a' || e.key === 'ArrowLeft') { keys.left = false; sendInput(); }
  else if (e.key === 'd' || e.key === 'ArrowRight') { keys.right = false; sendInput(); }
});

// ---- Scan ----
function performScan() {
  const sf = document.getElementById('scan-field');
  sf.style.left = playerWX + 'px'; sf.style.top = playerWY + 'px';
  sf.classList.add('show');
  setTimeout(() => sf.classList.remove('show'), 3000);
}
scanBtn.addEventListener('click', performScan);

// ---- Game Loop ----
function gameLoop(timestamp) {
  if (!lastAnimTime) lastAnimTime = timestamp;
  const dt = Math.min(timestamp - lastAnimTime, 50);
  lastAnimTime = timestamp;

  // Client-side movement (instant, like map-walk)
  let dx = 0, dy = 0;
  if (keys.right) dx = 1;
  if (keys.left) dx = -1;
  if (keys.down) dy = 1;
  if (keys.up) dy = -1;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  const step = PLAYER_SPEED * dt;
  let nx = playerWX + dx * step;
  let ny = playerWY + dy * step;
  if (!checkCollision(dx * step, 0)) playerWX = nx;
  if (!checkCollision(0, dy * step)) playerWY = ny;
  playerWX = Math.max(15, Math.min(playerWX, 5000 - 15));
  playerWY = Math.max(30, Math.min(playerWY, 5000 - 30));
  playerEl.style.left = playerWX + 'px';
  playerEl.style.top = playerWY + 'px';

  // Camera
  worldScale = Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H);
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  gameWorld.style.transform = `translate(${cx}px, ${cy}px) scale(${worldScale}) translate(${-playerWX}px, ${-playerWY}px)`;

  // Screen shake
  if (Date.now() < shakeUntil) {
    const intensity = shakeIntensity * (1 - (shakeUntil - Date.now()) / 200);
    gameContainer.style.transform = `translate(${(Math.random() - 0.5) * intensity}px, ${(Math.random() - 0.5) * intensity}px)`;
  } else {
    gameContainer.style.transform = '';
  }

  updateFog();

  // Burst animation
  if (isBursting) {
    burstTimer += dt;
    while (burstTimer >= BURST_MS) {
      burstTimer -= BURST_MS;
      const col = burstFrame % BURST_COLS;
      const row = Math.floor(burstFrame / BURST_COLS);
      playerSprite.style.backgroundImage = 'url(/images/assets/roguelike1.png)';
      if (currentDir === 'left') playerSprite.style.transform = 'scaleX(-1)';
      else playerSprite.style.transform = 'scaleX(1)';
      playerSprite.style.backgroundPosition = `${col * 25}% ${row * 25}%`;

      // Visual shake on burst
      if (burstFrame >= 5 && burstFrame <= 15) triggerShake(4);
      burstFrame++;
      if (burstFrame >= BURST_TOTAL) {
        isBursting = false;
        playerSprite.style.filter = 'none';
        walkFrame = 0; frameAccum = 0;
        const dir = getDirFromKeys();
        currentDir = dir;
        setWalkFrame(ROW[dir], 0);
        break;
      }
    }
  } else {
    // Walk animation
    const moving = keys.up || keys.down || keys.left || keys.right;
    const dir = getDirFromKeys();
    if (dir !== currentDir) {
      currentDir = dir;
      walkFrame = 0; frameAccum = 0;
      setWalkFrame(ROW[dir], 0);
    } else if (moving) {
      frameAccum += dt;
      while (frameAccum >= WALK_MS) {
        frameAccum -= WALK_MS;
        walkFrame = (walkFrame + 1) % 5;
        setWalkFrame(ROW[currentDir], walkFrame);
      }
    } else {
      frameAccum = 0;
      if (walkFrame !== 0) {
        walkFrame = 0;
        setWalkFrame(ROW[currentDir], 0);
      }
    }
  }

  // Other player sprites follow
  for (const id in players) {
    const s = players[id].el.querySelector('.player-sprite');
    if (s) s.style.backgroundPosition = playerSprite.style.backgroundPosition;
  }

  // Monster animation + hit flash (client-side tick)
  for (const i in monsters) {
    const local = monsters[i];
    if (!local || !local.alive) continue;
    if (local.animTimer > 0) {
      local.animTimer -= dt;
      if (local.animTimer <= 0) {
        local.animFrame++;
        const attFrames = local._type === 'ranged' ? ARCHER_ATTACK_FRAMES : MONSTER_ATTACK_FRAMES;
        if (local.animFrame >= attFrames.length) {
          local.animFrame = 0;
          local.animTimer = 0;
          local.el.style.backgroundPosition = '0% 0%';
        } else {
          local.animTimer = MONSTER_ANIM_MS;
          const f = attFrames[local.animFrame];
          local.el.style.backgroundPosition = `${f.col}% ${f.row}%`;
        }
      }
    }
    if (local.hitTimer > 0) {
      local.hitTimer -= dt;
      local.el.style.opacity = Math.floor(local.hitTimer / 50) % 2 ? '1' : '0.3';
    } else {
      local.el.style.opacity = '1';
    }
  }

  // Message timer
  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) msgEl.classList.remove('show');
  }

  requestAnimationFrame(gameLoop);
}

// ---- Lobby listeners ----
btnCreate.addEventListener('click', () => connectToRoom('', Number(lobbyLevel.value) || 1, lobbyName.value.trim() || 'Adventurer', true));
btnJoin.addEventListener('click', () => connectToRoom(lobbyCode.value.trim().toUpperCase(), 1, lobbyName.value.trim() || 'Adventurer', false));
interactBtn.addEventListener('click', interactAction);
invBtn.addEventListener('click', toggleInventory);
actionBtn.addEventListener('click', triggerBurst);
