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
  console.log('initWorld starting...');
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
    console.log('Map loaded:', row);
    d = row.data;
    if (typeof d === 'string') d = JSON.parse(d);
  } catch (e) {
    console.error('Map load error:', e);
    lobbyError.textContent = 'Failed to load map: ' + e.message;
    lobby.classList.remove('hide');
    return;
  }
  mapData = d;
  console.log('World initialized');

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
  // Update local player
  for (const sp of msg.players) {
    if (sp.id === myPlayerId) {
      myPlayer = sp; // <--- The server sends this state
      playerEl.style.left = sp.x + 'px';
      playerEl.style.top = sp.y + 'px';
      hpInner.style.width = (sp.hp / sp.maxHp * 100) + '%';
    } else {
      // ...
    }
  }
  // ...
}

// Game loop
function update() {
  if (!myPlayer) {
    // console.log('update: myPlayer is null, fog will be black');
  }
  updateCamera();
  updateFog();
  requestAnimationFrame(update);
}
update();
console.log('Update loop started');
