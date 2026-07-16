// ---- DOM refs ----
const lobby = document.getElementById('lobby');
const lobbyName = document.getElementById('lobby-name');
const lobbyCode = document.getElementById('lobby-code');
const lobbyLevel = document.getElementById('lobby-level');
const lobbyError = document.getElementById('lobby-error');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
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
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');

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
let mapData = null;
let keys = { up: false, down: false, left: false, right: false };

// ---- Connection ----
function connectToRoom(code, level, name, isCreate) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: isCreate ? 'create_room' : 'join_room', name, level, code }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };

  ws.onclose = () => { lobbyError.textContent = 'Disconnected'; lobby.classList.remove('hide'); };
  ws.onerror = () => { lobbyError.textContent = 'Connection failed'; };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'room_created':
    case 'room_joined':
      lobby.classList.add('hide');
      roomCode = msg.code;
      myPlayerId = msg.playerId;
      myPlayer = msg.player;
      roomCodeEl.textContent = 'Room: ' + roomCode;
      initWorld(msg.state);
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
    case 'chest_opened':
      const ch = chests[msg.chestIndex];
      if (ch) { ch.found = true; ch.el.classList.add('found'); }
      break;
    case 'loot':
      if (myPlayer) {
        myPlayer.coins = (myPlayer.coins || 0) + msg.coins;
        if (msg.potion) myPlayer.potions = (myPlayer.potions || 0) + 1;
      }
      showMessage(`+${msg.coins} silver coins${msg.potion ? ', +1 potion' : ''}`);
      updateInventoryUI();
      break;
    case 'show_interact':
      interactBtn.textContent = msg.action || 'Open';
      interactBtn.classList.toggle('show', true);
      break;
    case 'hide_interact':
      interactBtn.classList.toggle('show', false);
      break;
    case 'error':
      lobbyError.textContent = msg.message;
      break;
  }
}

// ---- World ----
async function initWorld(state) {
  // Preload sprites
  (new Image()).src = '/images/assets/roguelike3.png';
  (new Image()).src = '/images/assets/goblin.png';
  (new Image()).src = '/images/assets/archergoblin.png';

  const level = lobbyLevel.value || 1;
  let d;
  try {
    const res = await fetch(`/api/game/maps/${level}`);
    if (!res.ok) throw new Error('Map not found');
    const row = await res.json();
    d = row.data;
    if (typeof d === 'string') d = JSON.parse(d);
  } catch (e) {
    lobbyError.textContent = 'Failed to load map';
    lobby.classList.remove('hide');
    return;
  }
  mapData = d;

  // Background
  if (d.backgroundImage) {
    mapEl.style.background = `url(${d.backgroundImage}) repeat`;
    mapEl.style.backgroundSize = 'auto';
  }

  // Monsters
  if (state.monsters) {
    for (let i = 0; i < state.monsters.length; i++) {
      createMonsterEl(i, state.monsters[i]);
    }
  }

  // Chests
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

  // Other players
  for (const p of state.players) {
    if (p.id !== myPlayerId) addOtherPlayer(p);
  }

  updatePlayerList();
}

function createMonsterEl(index, m) {
  const el = document.createElement('div');
  el.className = 'monster';
  el.style.cssText = `left:${m.x - 20}px;top:${m.y - 20}px;`;
  const isRanged = m.type === 'ranged';
  el.style.backgroundImage = `url(/images/assets/${isRanged ? 'archer' : ''}goblin.png)`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = '500% 500%';
  el.style.backgroundPosition = '0% 0%';
  const hpBar = document.createElement('div');
  hpBar.className = 'monster-hp';
  const hpFill = document.createElement('div');
  hpFill.className = 'monster-hp-fill';
  hpFill.style.width = '100%';
  hpBar.appendChild(hpFill);
  el.appendChild(hpBar);
  mapEl.appendChild(el);
  monsters[index] = { el, hpFill, alive: true };
}

// ---- Other players ----
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
  const tag = document.createElement('div');
  tag.className = 'name-tag';
  tag.textContent = p.name;
  tag.style.borderColor = `hsl(${hue}, 60%, 50%)`;
  tag.style.border = '1px solid';
  container.appendChild(tag);
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

// ---- State apply ----
function applyState(msg) {
  for (const sp of msg.players) {
    if (sp.id === myPlayerId) {
      myPlayer = sp;
      playerEl.style.left = sp.x + 'px';
      playerEl.style.top = sp.y + 'px';
      hpInner.style.width = (sp.hp / sp.maxHp * 100) + '%';
    } else {
      const entry = players[sp.id];
      if (entry) {
        entry.p = sp;
        entry.el.style.left = sp.x + 'px';
        entry.el.style.top = sp.y + 'px';
      }
    }
  }

  for (let i = 0; i < msg.monsters.length; i++) {
    const sm = msg.monsters[i];
    const local = monsters[i];
    if (!local) continue;
    local.el.style.left = (sm.x - 20) + 'px';
    local.el.style.top = (sm.y - 20) + 'px';
    local.alive = sm.alive;
    local.el.classList.toggle('dead', !sm.alive);
    if (local.hpFill) {
      local.hpFill.style.width = Math.max(0, (sm.hp / sm.maxHp) * 100) + '%';
    }
  }
  updatePlayerList();
}

// ---- HUD ----
function updatePlayerList() {
  if (!ws) return;
  let html = '';
  if (myPlayer) html += `<div style="color:#4f4">▶ ${myPlayer.name} HP:${myPlayer.hp}</div>`;
  for (const id in players) {
    const entry = players[id];
    if (entry && entry.p) html += `<div style="color:#ccc">${entry.p.name} HP:${entry.p.hp}</div>`;
  }
  playerListEl.innerHTML = html;
}

// ---- Inventory ----
function toggleInventory() {
  invPanel.classList.toggle('show');
  updateInventoryUI();
}

function updateInventoryUI() {
  const coins = myPlayer ? (myPlayer.coins || 0) : 0;
  const potions = myPlayer ? (myPlayer.potions || 0) : 0;
  invPanel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <b>Inventory</b>
    <button id="inv-close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer">✕</button>
  </div>
  <div>Silver coins: ${coins}</div>
  <div>Healing potions: ${potions}</div>`;
  document.getElementById('inv-close')?.addEventListener('click', toggleInventory);
}

// ---- Interaction ----
function interactAction() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'interact' }));
  }
}

let messageEl = null;
function showMessage(text) {
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.style.cssText = 'position:fixed;bottom:30%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);border:1px solid #f0c840;border-radius:8px;padding:8px 20px;font-size:15px;color:#f0c840;z-index:300;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(messageEl);
  }
  messageEl.textContent = text;
  messageEl.style.display = 'block';
  setTimeout(() => { if (messageEl) messageEl.style.display = 'none'; }, 3000);
}

// ---- Camera/Fog ----
function updateCamera() {
  if (!myPlayer) return;
  worldScale = Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H);
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  gameWorld.style.transform = `translate(${cx}px, ${cy}px) scale(${worldScale}) translate(${-myPlayer.x}px, ${-myPlayer.y}px)`;
}

function updateFog() {
  if (!myPlayer) return;
  const fogEl = document.getElementById('fog');
  const fogRadius = 250 * worldScale;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  fogEl.style.cssText = `position:fixed;inset:0;z-index:50;pointer-events:none;background:#000;-webkit-mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%);mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%)`;
}

// ---- Input/Joystick ----
let joystickActive = false;
let joystickTouchId = null;

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
  if (dist > maxDist) {
    moveX = (moveX / dist) * maxDist;
    moveY = (moveY / dist) * maxDist;
  }
  joystickKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;
  keys = { up: moveY < -15, down: moveY > 15, left: moveX < -15, right: moveX > 15 };
  sendInput();
}

function sendInput() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', keys }));
  }
}

// Joystick events
joystickArea.addEventListener('mousedown', (e) => { joystickActive = true; handleJoystick(e); });
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => { joystickActive = false; keys = { up: false, down: false, left: false, right: false }; joystickKnob.style.transform = 'translate(0, 0)'; sendInput(); });
joystickArea.addEventListener('touchstart', (e) => { joystickActive = true; joystickTouchId = e.changedTouches[0].identifier; handleJoystick(e); });
window.addEventListener('touchmove', handleJoystick);
window.addEventListener('touchend', (e) => {
  for (let t of e.changedTouches) {
    if (t.identifier === joystickTouchId) {
      joystickActive = false; joystickTouchId = null; keys = { up: false, down: false, left: false, right: false }; joystickKnob.style.transform = 'translate(0, 0)'; sendInput();
    }
  }
});

// Keyboard
window.addEventListener('keydown', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = true;
  else if (e.key === 's' || e.key === 'ArrowDown') keys.down = true;
  else if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
  else if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
  else if (e.key === ' ') interactAction();
  else if (e.key === 'i') toggleInventory();
  else return;
  sendInput();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') keys.up = false;
  else if (e.key === 's' || e.key === 'ArrowDown') keys.down = false;
  else if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
  else if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
  else return;
  sendInput();
});

// ---- Scan/Animation/Loop ----
function performScan() {
  const sf = document.getElementById('scan-field');
  sf.style.left = myPlayer.x + 'px';
  sf.style.top = myPlayer.y + 'px';
  sf.classList.add('show');
  setTimeout(() => sf.classList.remove('show'), 3000);
}
scanBtn.addEventListener('click', performScan);

let frame = 0;
function animate() {
  frame = (frame + 1) % 4;
  const pos = `-${frame * 25}% 0%`;
  playerSprite.style.backgroundPosition = pos;
  for (const id in players) {
    players[id].el.querySelector('.player-sprite').style.backgroundPosition = pos;
  }
  requestAnimationFrame(animate);
}
animate();

function update() {
  updateCamera();
  updateFog();
  requestAnimationFrame(update);
}
update();

// Lobby listeners
btnCreate.addEventListener('click', () => {
  connectToRoom('', Number(lobbyLevel.value) || 1, lobbyName.value.trim() || 'Adventurer', true);
});
btnJoin.addEventListener('click', () => {
  connectToRoom(lobbyCode.value.trim().toUpperCase(), 1, lobbyName.value.trim() || 'Adventurer', false);
});
interactBtn.addEventListener('click', interactAction);
invBtn.addEventListener('click', toggleInventory);
