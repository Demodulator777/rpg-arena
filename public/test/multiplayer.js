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
let keys = { up: false, down: false, left: false, right: false };
let inventoryOpen = false;
let worldScale = 1;
const WORLD_SIZE = 5000;

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
      controls.classList.add('show');
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

  // Walls
  if (d.walls) {
    for (const w of d.walls) {
      const el = document.createElement('div');
      el.className = 'wall';
      el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;`;
      mapEl.appendChild(el);
    }
  }

  // Decals
  if (d.decals) {
    for (const dc of d.decals) {
      const el = document.createElement('div');
      el.className = 'decal';
      let css = `left:${dc.x}px;top:${dc.y}px;width:${dc.width}px;height:${dc.height}px;`;
      if (dc.image) css += `background-image:url(${dc.image});background-size:cover;background-position:center;`;
      else css += `background:${dc.color};`;
      const flipX = dc.flipH ? -1 : 1;
      const flipY = dc.flipV ? -1 : 1;
      if (flipX !== 1 || flipY !== 1) css += `transform:scale(${flipX},${flipY});`;
      if (dc.layer === 'ceiling') css += 'z-index:15;';
      el.style.cssText = css;
      mapEl.appendChild(el);
    }
  }

  // Traps
  if (d.traps) {
    for (const tr of d.traps) {
      const el = document.createElement('div');
      el.className = 'trap-zone';
      el.style.cssText = `left:${tr.x}px;top:${tr.y}px;width:${tr.width}px;height:${tr.height}px;`;
      mapEl.appendChild(el);
    }
  }

  // Teleports
  if (d.teleports) {
    for (const tp of d.teleports) {
      const el = document.createElement('div');
      el.className = 'teleport-zone';
      el.style.cssText = `left:${tp.x - 15}px;top:${tp.y - 15}px;`;
      mapEl.appendChild(el);
    }
  }

  // Beams
  if (d.beams) {
    for (const bm of d.beams) {
      const el = document.createElement('div');
      el.className = 'beam-line';
      const dx = bm.x2 - bm.x1;
      const dy = bm.y2 - bm.y1;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      el.style.cssText = `left:${bm.x1}px;top:${bm.y1}px;width:${len}px;height:4px;transform-origin:0 2px;transform:rotate(${angle}deg);`;
      mapEl.appendChild(el);
    }
  }

  // Shops
  if (d.shops) {
    for (const s of d.shops) {
      const el = document.createElement('div');
      el.className = 'shop';
      el.style.cssText = `left:${s.x - 18}px;top:${s.y - 18}px;`;
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
    if (p.id !== myPlayerId) addOtherPlayer(p);
  }

  // Position local player
  playerEl.style.left = myPlayer.x + 'px';
  playerEl.style.top = myPlayer.y + 'px';

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
  // Update local player
  for (const sp of msg.players) {
    if (sp.id === myPlayerId) {
      if (Math.abs(myPlayer.x - sp.x) > 100 || Math.abs(myPlayer.y - sp.y) > 100) {
          console.log('Player jumped significantly', myPlayer.x, sp.x, myPlayer.y, sp.y);
      }
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

  // Update monsters
  for (let i = 0; i < msg.monsters.length; i++) {
    const sm = msg.monsters[i];
    const local = monsters[i];
    if (!local) continue;
    local.el.style.left = (sm.x - 20) + 'px';
    local.el.style.top = (sm.y - 20) + 'px';
    const wasDead = !local.alive;
    local.alive = sm.alive;
    local.el.classList.toggle('dead', !sm.alive);
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

  updatePlayerList();
}

// ---- HUD ----
function updatePlayerList() {
  if (!ws) return;
  // We don't have the full list, so just show IDs we know
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
  inventoryOpen = !inventoryOpen;
  invPanel.classList.toggle('show', inventoryOpen);
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

// ---- Camera ----
const REF_W = 400;
const REF_H = 700;

function updateCamera() {
  if (!myPlayer) return;
  worldScale = Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H);
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  gameWorld.style.transform = `translate(${cx}px, ${cy}px) scale(${worldScale}) translate(${-myPlayer.x}px, ${-myPlayer.y}px)`;
}

// ---- Fog ----
function updateFog() {
  if (!myPlayer) return;
  const fogEl = document.getElementById('fog');
  if (!fogEl) return;
  const fogRadius = 250 * worldScale; // Increased to match map-walk
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  fogEl.style.cssText = `position:fixed;inset:0;z-index:50;pointer-events:none;background:#000;-webkit-mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%);mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%)`;
}

// ---- Input ----
function sendInput() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', keys }));
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === undefined) return;
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') { keys.up = true; e.preventDefault(); }
  if (k === 's' || k === 'arrowdown') { keys.down = true; e.preventDefault(); }
  if (k === 'a' || k === 'arrowleft') { keys.left = true; e.preventDefault(); }
  if (k === 'd' || k === 'arrowright') { keys.right = true; e.preventDefault(); }
  if (k === ' ') { e.preventDefault(); interactAction(); }
  if (k === 'i') toggleInventory();
  sendInput();
});
document.addEventListener('keyup', (e) => {
  if (e.key === undefined) return;
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
  btn.addEventListener('pointerdown', () => { keys[dir] = true; sendInput(); });
  btn.addEventListener('pointerup', () => { keys[dir] = false; sendInput(); });
  btn.addEventListener('pointerleave', () => { keys[dir] = false; sendInput(); });
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

// ---- Scan ----
function performScan() {
  const sf = document.getElementById('scan-field');
  sf.style.left = myPlayer.x + 'px';
  sf.style.top = myPlayer.y + 'px';
  sf.classList.add('show');
  setTimeout(() => sf.classList.remove('show'), 3000);
}

scanBtn.addEventListener('click', performScan);

// ---- Animation ----
let frame = 0;
function animate() {
  frame = (frame + 1) % 4; // 4-frame walk
  const pos = `-${frame * 25}% 0%`;
  playerSprite.style.backgroundPosition = pos;
  for (const id in players) {
    players[id].el.querySelector('.player-sprite').style.backgroundPosition = pos;
  }
  requestAnimationFrame(animate);
}
animate();

// Game loop
function update() {
  updateCamera();
  updateFog();
  requestAnimationFrame(update);
}

update();
