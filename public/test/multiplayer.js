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

// ---- Joystick/Input ----
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
  
  const newKeys = { up: moveY < -15, down: moveY > 15, left: moveX < -15, right: moveX > 15 };
  if (JSON.stringify(newKeys) !== JSON.stringify(keys)) {
    keys = newKeys;
    sendInput();
  }
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
