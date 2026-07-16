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
const myHp = document.getElementById('my-hp');
const roomCodeEl = document.getElementById('room-code');
const playerListEl = document.getElementById('player-list');
const interactBtn = document.getElementById('interact-btn');
const invBtn = document.getElementById('inv-btn');
const invPanel = document.getElementById('inv-panel');
const controls = document.getElementById('controls');

// ---- State ----
let ws = null;
let roomCode = '';
let myPlayerId = '';
let myPlayer = null;
let players = {};
let monsters = {};
let chests = {};
let mapData = null;
let stateTick = 0;
let keys = { up: false, down: false, left: false, right: false };
let inventoryOpen = false;
const WORLD_SIZE = 5000;

// ---- Connection ----
function connectToRoom(code, level, name, isCreate) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host;
  ws = new WebSocket(`${proto}//${host}/ws`);

  ws.onopen = () => {
    if (isCreate) {
      ws.send(JSON.stringify({ type: 'create_room', name, level }));
    } else {
      ws.send(JSON.stringify({ type: 'join_room', code, name }));
    }
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    lobbyError.textContent = 'Disconnected';
    lobby.classList.remove('hide');
  };

  ws.onerror = (e) => {
    console.error('WebSocket error:', e);
    lobbyError.textContent = 'Connection failed — check server';
  };
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
      controls.classList.add('show');
      initWorld(msg.state);
      break;
    case 'player_joined':
      addPlayer(msg.player);
      break;
    case 'player_left':
      removePlayer(msg.playerId);
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
      showMessage(`+${msg.coins} coins${msg.potion ? ', +1 potion' : ''}`);
      updateInventoryUI();
      break;
    case 'error':
      lobbyError.textContent = msg.message;
      break;
  }
}

// ---- World ----
async function initWorld(state) {
  // Load map data from API
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

  // Walls
  if (d.walls) {
    for (const w of d.walls) {
      const el = document.createElement('div');
      el.className = 'wall';
      el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;`;
      mapEl.appendChild(el);
    }
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
    if (p.id !== myPlayerId) addPlayer(p);
  }

  // Local player
  addPlayer(myPlayer, true);
  updateHud();
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

// ---- Players ----
function addPlayer(p, isLocal) {
  const existing = document.getElementById('p-' + p.id);
  if (existing) { existing.remove(); }

  const el = document.createElement('div');
  el.id = 'p-' + p.id;
  el.className = 'player-avatar' + (isLocal ? ' local' : '');
  const hue = hashHue(p.id);
  el.style.background = `hsl(${hue}, 60%, 40%)`;
  el.style.border = `2px solid hsl(${hue}, 70%, 60%)`;
  el.textContent = p.name.charAt(0).toUpperCase();
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  mapEl.appendChild(el);
  players[p.id] = { el, p };
}

function removePlayer(id) {
  const el = document.getElementById('p-' + id);
  if (el) el.remove();
  delete players[id];
}

function hashHue(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

// ---- State apply ----
function applyState(msg) {
  stateTick = msg.tick;

  // Update players
  for (const sp of msg.players) {
    if (sp.id === myPlayerId) {
      myPlayer = sp;
      updateHud();
    }
    const entry = players[sp.id];
    if (entry) {
      entry.p = sp;
      entry.el.style.left = sp.x + 'px';
      entry.el.style.top = sp.y + 'px';
    }
  }

  // Update monsters
  for (let i = 0; i < msg.monsters.length; i++) {
    const sm = msg.monsters[i];
    const local = monsters[i];
    if (!local) continue;
    local.el.style.left = (sm.x - 20) + 'px';
    local.el.style.top = (sm.y - 20) + 'px';
    if (sm.alive && !local.alive) {
      local.alive = true;
      local.el.classList.remove('dead');
    } else if (!sm.alive && local.alive) {
      local.alive = false;
      local.el.classList.add('dead');
    }
    if (local.hpFill) {
      local.hpFill.style.width = Math.max(0, (sm.hp / sm.maxHp) * 100) + '%';
    }
  }

  // Update chests
  for (let i = 0; i < msg.chests.length; i++) {
    const sc = msg.chests[i];
    const local = chests[i];
    if (local && sc.found && !local.found) {
      local.found = true;
      local.el.classList.add('found');
    }
  }

  // Player list
  updatePlayerList(msg.players);
}

// ---- HUD ----
function updateHud() {
  if (myPlayer) {
    myHp.style.width = (myPlayer.hp / myPlayer.maxHp * 100) + '%';
  }
}

function updatePlayerList(allPlayers) {
  let html = '';
  for (const p of allPlayers) {
    const isMe = p.id === myPlayerId;
    html += `<div style="color:${isMe ? '#4f4' : '#ccc'}">${isMe ? '▶ ' : ''}${p.name} HP:${p.hp}</div>`;
  }
  playerListEl.innerHTML = html;
}

// ---- Inventory ----
function toggleInventory() {
  inventoryOpen = !inventoryOpen;
  invPanel.classList.toggle('show', inventoryOpen);
  updateInventoryUI();
}

function updateInventoryUI() {
  if (!invPanel) return;
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

// ---- Camera ----
function updateCamera() {
  if (!myPlayer) return;
  const scale = Math.min(window.innerWidth / WORLD_SIZE, window.innerHeight / WORLD_SIZE) * 2;
  const cx = window.innerWidth / 2 - myPlayer.x * scale;
  const cy = window.innerHeight / 2 - myPlayer.y * scale;
  gameWorld.style.transform = `translate(${cx}px, ${cy}px) scale(${scale})`;
}

// ---- Input ----
function sendInput() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', keys }));
  }
}

// Keyboard
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') { keys.up = true; e.preventDefault(); }
  if (k === 's' || k === 'arrowdown') { keys.down = true; e.preventDefault(); }
  if (k === 'a' || k === 'arrowleft') { keys.left = true; e.preventDefault(); }
  if (k === 'd' || k === 'arrowright') { keys.right = true; e.preventDefault(); }
  if (k === ' ' || k === 'e' || k === 'enter') { e.preventDefault(); interactAction(); }
  if (k === 'i') toggleInventory();
  sendInput();
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') { keys.up = false; e.preventDefault(); sendInput(); }
  if (k === 's' || k === 'arrowdown') { keys.down = false; e.preventDefault(); sendInput(); }
  if (k === 'a' || k === 'arrowleft') { keys.left = false; e.preventDefault(); sendInput(); }
  if (k === 'd' || k === 'arrowright') { keys.right = false; e.preventDefault(); sendInput(); }
});

// Touch dpad
['up','down','left','right'].forEach(dir => {
  const btn = document.getElementById('ctrl-' + dir);
  if (!btn) return;
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[dir] = true; sendInput(); });
  btn.addEventListener('pointerup', (e) => { e.preventDefault(); keys[dir] = false; sendInput(); });
  btn.addEventListener('pointerleave', (e) => { e.preventDefault(); keys[dir] = false; sendInput(); });
});

// Lobby
btnCreate.addEventListener('click', () => {
  const name = lobbyName.value.trim() || 'Adventurer';
  const level = Number(lobbyLevel.value) || 1;
  lobbyError.textContent = 'Creating room...';
  connectToRoom('', level, name, true);
});

btnJoin.addEventListener('click', () => {
  const code = lobbyCode.value.trim().toUpperCase();
  if (code.length < 4) { lobbyError.textContent = 'Enter a 4-character code'; return; }
  const name = lobbyName.value.trim() || 'Adventurer';
  lobbyError.textContent = 'Joining...';
  connectToRoom(code, 1, name, false);
});

lobbyCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});

interactBtn.addEventListener('click', interactAction);
invBtn.addEventListener('click', toggleInventory);

// Game loop
function update() {
  updateCamera();
  requestAnimationFrame(update);
}

// Start
update();
