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
let keys = { up: false, down: false, left: false, right: false };
let isRunning = false;

// ---- Connection ----
function connectToRoom(code, level, name, isCreate) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: isCreate ? 'create_room' : 'join_room', name, level, code }));
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleMessage(msg);
    } catch (err) {
      console.error('ws.onmessage error:', err);
    }
  };

  ws.onclose = () => { lobbyError.textContent = 'Disconnected'; lobby.classList.remove('hide'); isRunning = false; };
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
      if (!isRunning) { isRunning = true; update(); }
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
  (new Image()).src = '/images/assets/roguelike3.png';
  (new Image()).src = '/images/assets/goblin.png';
  (new Image()).src = '/images/assets/archergoblin.png';

  const level = lobbyLevel.value || 1;
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
    // Render Map Elements
    if (d.backgroundImage) mapEl.style.background = `url(${d.backgroundImage}) repeat`;
    else mapEl.style.background = '#1a1a1a';
    
    if (d.walls) {
      for (const w of d.walls) {
        const el = document.createElement('div');
        el.className = 'wall';
        el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;`;
        mapEl.appendChild(el);
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
        const len = Math.hypot(bm.x2 - bm.x1, bm.y2 - bm.y1);
        const angle = Math.atan2(bm.y2 - bm.y1, bm.x2 - bm.x1) * 180 / Math.PI;
        el.style.cssText = `left:${bm.x1}px;top:${bm.y1}px;width:${len}px;height:4px;transform-origin:0 2px;transform:rotate(${angle}deg);`;
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

    // Local player position
    if (myPlayer) {
      playerEl.style.left = myPlayer.x + 'px';
      playerEl.style.top = myPlayer.y + 'px';
      hpInner.style.width = (myPlayer.hp / myPlayer.maxHp * 100) + '%';
    }

    // Monsters/Chests/Players
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
  monsters[index] = { el, hpFill, alive: true };
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
  for (const sp of msg.players) {
    if (sp.id === myPlayerId) {
      myPlayer = sp;
      playerEl.style.left = sp.x + 'px';
      playerEl.style.top = sp.y + 'px';
      hpInner.style.width = (sp.hp / sp.maxHp * 100) + '%';
    } else if (players[sp.id]) {
      players[sp.id].p = sp;
      players[sp.id].el.style.left = sp.x + 'px';
      players[sp.id].el.style.top = sp.y + 'px';
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
    if (local.hpFill) local.hpFill.style.width = Math.max(0, (sm.hp / sm.maxHp) * 100) + '%';
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

function updateInventoryUI() {
  invPanel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Inventory</b><button id="inv-close">✕</button></div>
  <div>Silver coins: ${myPlayer?.coins || 0}</div><div>Healing potions: ${myPlayer?.potions || 0}</div>`;
  document.getElementById('inv-close')?.addEventListener('click', toggleInventory);
}

function interactAction() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'interact' }));
}

function showMessage(text) {
  const el = document.getElementById('message') || (function(){
    const e = document.createElement('div'); e.id = 'message';
    e.style.cssText = 'position:fixed;bottom:30%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);padding:8px 20px;color:#f0c840;z-index:300;';
    document.body.appendChild(e); return e;
  })();
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

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

// Input/Joystick
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
  keys = { up: moveY < -15, down: moveY > 15, left: moveX < -15, right: moveX > 15 };
  sendInput();
}
function sendInput() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', keys }));
}

joystickArea.addEventListener('mousedown', (e) => { joystickActive = true; handleJoystick(e); });
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => { joystickActive = false; keys = { up:false,down:false,left:false,right:false }; joystickKnob.style.transform = 'translate(0, 0)'; sendInput(); });
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

// Scan/Animation/Loop
function performScan() {
  if (!myPlayer) return;
  const sf = document.getElementById('scan-field');
  sf.style.left = myPlayer.x + 'px'; sf.style.top = myPlayer.y + 'px';
  sf.classList.add('show');
  setTimeout(() => sf.classList.remove('show'), 3000);
}
scanBtn.addEventListener('click', performScan);

function animate() {
  const pos = `-${(Date.now() / 150 % 4 | 0) * 25}% 0%`;
  playerSprite.style.backgroundPosition = pos;
  for (const id in players) players[id].el.querySelector('.player-sprite').style.backgroundPosition = pos;
  requestAnimationFrame(animate);
}
animate();

function update() {
  updateCamera();
  updateFog();
  requestAnimationFrame(update);
}

// Lobby listeners
btnCreate.addEventListener('click', () => connectToRoom('', Number(lobbyLevel.value) || 1, lobbyName.value.trim() || 'Adventurer', true));
btnJoin.addEventListener('click', () => connectToRoom(lobbyCode.value.trim().toUpperCase(), 1, lobbyName.value.trim() || 'Adventurer', false));
interactBtn.addEventListener('click', interactAction);
invBtn.addEventListener('click', toggleInventory);
