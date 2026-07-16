const { WebSocketServer } = require('ws');
const { getDb } = require('./db');

const rooms = new Map();
const TICK_MS = 50;
const MONSTER_CHASE = 200;
const MONSTER_RETREAT = 200;
const MONSTER_SPEED = 0.05;
const PLAYER_SPEED = 0.1;
const MONSTER_DMG = 5;
const MONSTER_HP = 20;
const MONSTER_ATTACK_COOLDOWN = 4000;
const WORLD_SIZE = 5000;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function setupMultiplayer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  console.log('[Multiplayer] WebSocket attached on /ws');

  wss.on('connection', (ws) => {
    ws._player = null;
    ws._room = null;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    ws.on('close', () => {
      if (ws._room && ws._player) {
        leaveRoom(ws, ws._room, ws._player);
      }
    });
  });

  return wss;
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create_room': return handleCreateRoom(ws, msg);
    case 'join_room': return handleJoinRoom(ws, msg);
    case 'input': return handleInput(ws, msg);
    case 'interact': return handleInteract(ws, msg);
  }
}

async function handleCreateRoom(ws, msg) {
  const level = msg.level || 1;
  const name = (msg.name || 'Player').slice(0, 20);

  const db = await getDb();
  const row = await db.execute({ sql: 'SELECT * FROM maps WHERE level=?', args: [level] });
  if (!row.rows.length) {
    ws.send(JSON.stringify({ type: 'error', message: 'Map not found' }));
    return;
  }

  let mapData;
  try { mapData = JSON.parse(row.rows[0].data); } catch { mapData = {}; }
  if (!mapData.walls) mapData.walls = [];

  let code = generateCode();
  while (rooms.has(code)) code = generateCode();

  const playerId = code + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const player = createPlayer(playerId, name, mapData);
  player.host = true;

  const state = createGameState(mapData);

  const room = {
    id: code,
    code,
    level,
    mapData,
    players: new Map(),
    state,
    tick: 0,
    loop: null
  };
  room.players.set(ws, player);
  ws._room = room;
  ws._player = player;
  rooms.set(code, room);

  ws.send(JSON.stringify({
    type: 'room_created',
    code,
    playerId,
    player,
    state: {
      players: [player],
      monsters: state.monsters,
      chests: state.chests
    }
  }));

  if (!room.loop) {
    room.lastTick = Date.now();
    room.loop = setInterval(() => gameTick(room), TICK_MS);
  }
}

async function handleJoinRoom(ws, msg) {
  const code = (msg.code || '').toUpperCase();
  const name = (msg.name || 'Player').slice(0, 20);
  const room = rooms.get(code);

  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  if (room.players.size >= 4) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    return;
  }

  const playerId = code + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const player = createPlayer(playerId, name, room.mapData);

  room.players.set(ws, player);
  ws._room = room;
  ws._player = player;

  const players = [];
  for (const [, p] of room.players) players.push(p);

  ws.send(JSON.stringify({
    type: 'room_joined',
    code,
    playerId,
    player,
    state: {
      players,
      monsters: room.state.monsters,
      chests: room.state.chests
    }
  }));

  broadcast(room, {
    type: 'player_joined',
    player
  }, ws);
}

function handleInput(ws, msg) {
  if (!ws._room || !ws._player) return;
  const p = ws._player;
  p.input = msg.keys || {};
}

function handleInteract(ws) {
  if (!ws._room || !ws._player) return;
  const room = ws._room;
  const p = ws._player;
  for (const ch of room.state.chests) {
    if (ch.found) continue;
    const d = Math.hypot(p.x - ch.x, p.y - ch.y);
    if (d < 50) {
      ch.found = true;
      ch.openedAt = Date.now();
      const coins = 5 + Math.floor(Math.random() * 16);
      const potion = Math.random() < 0.5;
      p.coins += coins;
      if (potion) p.potions++;
      ws.send(JSON.stringify({
        type: 'loot',
        coins,
        potion
      }));
      broadcast(room, {
        type: 'chest_opened',
        chestIndex: room.state.chests.indexOf(ch)
      });
      return;
    }
  }
}

function leaveRoom(ws, room, player) {
  room.players.delete(ws);
  ws._room = null;
  ws._player = null;

  if (room.players.size === 0) {
    clearInterval(room.loop);
    rooms.delete(room.code);
    return;
  }

  broadcast(room, {
    type: 'player_left',
    playerId: player.id
  });
}

function broadcast(room, msg, excludeWs) {
  const data = JSON.stringify(msg);
  for (const [client] of room.players) {
    if (client !== excludeWs && client.readyState === WebSocketServer.OPEN) {
      client.send(data);
    }
  }
}

function createPlayer(id, name, mapData) {
  const spawn = mapData.playerStart || { x: 2500, y: 2500 };
  const player = {
    id,
    name,
    x: spawn.x,
    y: spawn.y,
    hp: 100,
    maxHp: 100,
    coins: 0,
    potions: 0,
    input: {},
    host: false
  };
  pushOutOfWall(player, mapData.walls || []);
  return player;
}

function createGameState(mapData) {
  const monsters = [];
  if (mapData.monsterSpawns) {
    for (const sp of mapData.monsterSpawns) {
      const isRanged = sp.monsterType === 'ranged';
      for (let i = 0; i < sp.count; i++) {
        let mx = sp.x + (Math.random() - 0.5) * 60;
        let my = sp.y + (Math.random() - 0.5) * 60;
        mx = Math.max(20, Math.min(WORLD_SIZE - 20, mx));
        my = Math.max(20, Math.min(WORLD_SIZE - 20, my));
        pushOutOfWall({ x: mx, y: my, _ox: mx, _oy: my }, mapData.walls);
        monsters.push({
          x: mx, y: my,
          spawnX: sp.x, spawnY: sp.y,
          hp: MONSTER_HP,
          maxHp: MONSTER_HP,
          type: isRanged ? 'ranged' : 'melee',
          state: 'idle',
          attackTimer: 2000 + Math.random() * 2000,
          nextShotTime: Date.now() + 3000 + Math.random() * 2000,
          alive: true
        });
      }
    }
  }

  const chests = [];
  if (mapData.chests) {
    for (const c of mapData.chests) {
      chests.push({ x: c.x, y: c.y, found: false });
    }
  }

  return { monsters, chests };
}

function gameTick(room) {
  room.tick++;
  const dt = Date.now() - room.lastTick;
  room.lastTick = Date.now();
  const walls = room.mapData.walls || [];

  // Players
  for (const [, p] of room.players) {
    const keys = p.input || {};
    let dx = 0, dy = 0;
    if (keys.right) dx = 1;
    if (keys.left) dx = -1;
    if (keys.down) dy = 1;
    if (keys.up) dy = -1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const speed = PLAYER_SPEED * dt;
    const nx = p.x + dx * speed;
    const ny = p.y + dy * speed;
    if (!wallHit(nx, p.y, walls)) p.x = nx;
    if (!wallHit(p.x, ny, walls)) p.y = ny;
    p.x = Math.max(20, Math.min(WORLD_SIZE - 20, p.x));
    p.y = Math.max(20, Math.min(WORLD_SIZE - 20, p.y));
  }

  // Monsters
  for (const m of room.state.monsters) {
    if (!m.alive) continue;

    // Find closest player
    let closestPlayer = null;
    let closestDist = Infinity;
    for (const [, p] of room.players) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < closestDist) { closestDist = d; closestPlayer = p; }
    }
    if (!closestPlayer) continue;

    if (m.state === 'idle' && closestDist < MONSTER_CHASE) m.state = 'chase';
    if (m.state === 'chase' && closestDist > MONSTER_RETREAT) m.state = 'idle';

    if (m.state === 'chase') {
      let targetX, targetY;
      if (m.type === 'ranged') {
        const preferred = 280;
        if (closestDist < preferred - 40) {
          const a = Math.atan2(m.y - closestPlayer.y, m.x - closestPlayer.x);
          targetX = m.x + Math.cos(a) * 50;
          targetY = m.y + Math.sin(a) * 50;
        } else if (closestDist > preferred + 40) {
          targetX = closestPlayer.x;
          targetY = closestPlayer.y;
        } else {
          const a = Math.atan2(closestPlayer.y - m.y, closestPlayer.x - m.x);
          targetX = m.x + Math.cos(a + Math.PI / 2) * 20;
          targetY = m.y + Math.sin(a + Math.PI / 2) * 20;
        }
      } else {
        targetX = closestPlayer.x;
        targetY = closestPlayer.y;
      }
      const a = Math.atan2(targetY - m.y, targetX - m.x);
      const mStep = MONSTER_SPEED * dt;
      const sx = Math.cos(a) * mStep;
      const sy = Math.sin(a) * mStep;
      if (!wallHit(m.x + sx, m.y, walls)) m.x += sx;
      if (!wallHit(m.x, m.y + sy, walls)) m.y += sy;
    } else {
      const d = Math.hypot(m.spawnX - m.x, m.spawnY - m.y);
      if (d > 1) {
        const a = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
        const mStep = MONSTER_SPEED * dt;
        const sx = Math.cos(a) * mStep;
        const sy = Math.sin(a) * mStep;
        if (!wallHit(m.x + sx, m.y, walls)) m.x += sx;
        if (!wallHit(m.x, m.y + sy, walls)) m.y += sy;
      }
    }

    // Monster attack (melee)
    m.attackTimer -= dt;
    if (m.type !== 'ranged' && m.attackTimer <= 0 && closestDist < 100 && closestPlayer) {
      closestPlayer.hp = Math.max(0, closestPlayer.hp - MONSTER_DMG);
      m.attackTimer = MONSTER_ATTACK_COOLDOWN;
    }

    // Monster attack (ranged)
    if (m.type === 'ranged' && Date.now() > m.nextShotTime && closestDist < 300 && closestPlayer) {
      m.nextShotTime = Date.now() + 3000 + Math.random() * 2000;
      // Projectile logic: dealt on client via event
      closestPlayer.hp = Math.max(0, closestPlayer.hp - MONSTER_DMG);
    }
  }

  // Separate overlapping monsters
  for (let i = 0; i < room.state.monsters.length; i++) {
    const a = room.state.monsters[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < room.state.monsters.length; j++) {
      const b = room.state.monsters[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 36 && d > 0.1) {
        const push = (36 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  // Check player deaths
  for (const [, p] of room.players) {
    if (p.hp <= 0) {
      const spawn = room.mapData.playerStart || { x: 2500, y: 2500 };
      p.x = spawn.x;
      p.y = spawn.y;
      p.hp = p.maxHp;
    }
  }

  // Broadcast state
  const players = [];
  for (const [, p] of room.players) players.push(p);
  broadcast(room, {
    type: 'state',
    tick: room.tick,
    players,
    monsters: room.state.monsters,
    chests: room.state.chests
  });
}

function wallHit(mx, my, walls) {
  const b = 20;
  return walls.some(w =>
    mx + 20 > w.x + b &&
    mx - 20 < w.x + b + w.w &&
    my + 20 > w.y + b &&
    my - 20 < w.y + b + w.h
  );
}

function pushOutOfWall(m, walls) {
  if (!wallHit(m.x, m.y, walls)) return;
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
  for (let step = 2; step <= 30; step += 2) {
    for (const [dx, dy] of dirs) {
      const nx = m.x + dx * step;
      const ny = m.y + dy * step;
      if (!wallHit(nx, ny, walls)) {
        m.x = Math.max(20, Math.min(WORLD_SIZE - 20, nx));
        m.y = Math.max(20, Math.min(WORLD_SIZE - 20, ny));
        return;
      }
    }
  }
}

module.exports = { setupMultiplayer };
