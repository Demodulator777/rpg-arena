const { WebSocketServer, WebSocket } = require('ws');
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
        try { ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' })); } catch (_) {}
      }
    });

    ws.on('error', (err) => {
      console.error('[Multiplayer] ws error:', err.message);
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
    case 'burst': return handleBurst(ws, msg);
    case 'use_potion': return handleUsePotion(ws, msg);
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
  try { const raw = row.rows[0].data; mapData = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { mapData = {}; }
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

  // Check exit/entrance (prevent double-trigger with auto-detect)
  if (!room._transitioning && room.mapData.exit && Math.hypot(p.x - room.mapData.exit.x, p.y - room.mapData.exit.y) < 50) {
    const nextLevel = room.mapData.exit.targetLevel || (room.level + 1);
    transitionLevel(room, ws, p, nextLevel, 'entrance').catch(e => console.error('[MP] transition error:', e.message));
    return;
  }
  if (!room._transitioning && room.mapData.entrance && Math.hypot(p.x - room.mapData.entrance.x, p.y - room.mapData.entrance.y) < 50) {
    const prevLevel = room.mapData.entrance.targetLevel || (room.level - 1);
    transitionLevel(room, ws, p, prevLevel, 'exit').catch(e => console.error('[MP] transition error:', e.message));
    return;
  }

  // Check teleports
  if (room.mapData.teleports) {
    for (const tp of room.mapData.teleports) {
      if (Math.hypot(p.x - tp.x, p.y - tp.y) < 40) {
        const target = room.mapData.teleports.find(t => t.id === tp.targetId);
        if (target) {
          p.x = target.x + 20;
          p.y = target.y + 20;
        }
        return;
      }
    }
  }

  // Check chests
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

async function transitionLevel(room, ws, player, newLevel, spawnAt) {
  const db = await getDb();
  const row = await db.execute({ sql: 'SELECT * FROM maps WHERE level=?', args: [newLevel] });
  if (!row.rows.length) return;
  let newMapData;
  try { const raw = row.rows[0].data; newMapData = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
  if (!newMapData.walls) newMapData.walls = [];

  room.level = newLevel;
  room.mapData = newMapData;
  room.state = createGameState(newMapData);
  room.tick = 0;

  // Reposition all players
  let spawn;
  if (spawnAt === 'exit' && newMapData.exit) {
    spawn = { x: newMapData.exit.x + 20, y: newMapData.exit.y + 45 };
  } else if (spawnAt === 'entrance' && newMapData.entrance) {
    spawn = { x: newMapData.entrance.x - 20, y: newMapData.entrance.y + 45 };
  } else {
    spawn = newMapData.playerStart || { x: 2500, y: 2500 };
  }
  for (const [, p] of room.players) {
    p.x = spawn.x;
    p.y = spawn.y;
    p.hp = p.maxHp;
  }

  broadcast(room, {
    type: 'level_change',
    level: newLevel,
    state: {
      players: [...room.players.values()],
      monsters: room.state.monsters,
      chests: room.state.chests
    }
  });
}

function handleBurst(ws) {
  if (!ws._room || !ws._player) return;
  const room = ws._room;
  const p = ws._player;
  const walls = room.mapData.walls || [];
  for (const m of room.state.monsters) {
    if (!m.alive) continue;
    if (Math.hypot(p.x - m.x, p.y - m.y) < 100 &&
        hasLineOfSight(p.x, p.y, m.x, m.y, walls)) {
      m.hp -= 15;
      if (m.hp <= 0) { m.hp = 0; m.alive = false; }
    }
  }
}

function handleUsePotion(ws) {
  if (!ws._room || !ws._player) return;
  const p = ws._player;
  if (p.potions <= 0 || p.hp >= p.maxHp) return;
  p.potions--;
  p.hp = Math.min(p.maxHp, p.hp + 30);
  ws.send(JSON.stringify({ type: 'potion_used', hp: p.hp, maxHp: p.maxHp, potions: p.potions }));
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
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      try { client.send(data); } catch (e) { console.error('[Multiplayer] broadcast send error:', e.message); }
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
    host: false,
    hitFlash: 0
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
  const now = Date.now();

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

    // Decay hit flash
    if (p.hitFlash > 0) p.hitFlash -= dt;
  }

  // Trap damage + teleport + exit/entrance auto-trigger
  for (const [, p] of room.players) {
    // Traps
    if (room.mapData.traps) {
      for (const tr of room.mapData.traps) {
        const tw = tr.w || tr.width || 40;
        const th = tr.h || tr.height || 40;
        if (p.x + 13 > tr.x && p.x - 13 < tr.x + tw &&
            p.y + 26 > tr.y && p.y - 26 < tr.y + th) {
          if (!p._trapTimer || p._trapTimer < now) {
            p.hp = Math.max(0, p.hp - (tr.damage || 10));
            p.hitFlash = 200;
            p._trapTimer = now + 1000;
          }
        }
      }
    }
    // Beams
    if (room.mapData.beams) {
      for (const bm of room.mapData.beams) {
        const cx = (bm.x1 + bm.x2) / 2;
        const cy = (bm.y1 + bm.y2) / 2;
        const halfLen = Math.hypot(bm.x2 - bm.x1, bm.y2 - bm.y1) / 2;
        if (Math.hypot(p.x - cx, p.y - cy) < halfLen + 20) {
          if (!p._beamTimer || p._beamTimer < now) {
            p.hp = Math.max(0, p.hp - (bm.damage || 5));
            p.hitFlash = 200;
            p._beamTimer = now + (bm.interval || 800);
          }
        }
      }
    }
    // Auto-teleport
    if (room.mapData.teleports) {
      for (const tp of room.mapData.teleports) {
        if (!p._teleportCd || p._teleportCd < now) {
          if (Math.hypot(p.x - tp.x, p.y - tp.y) < 25) {
            const target = room.mapData.teleports.find(t => t.id === tp.targetId);
            if (target) {
              p.x = target.x + 20;
              p.y = target.y + 20;
              p._teleportCd = now + 500;
            }
          }
        }
      }
    }
  }

  // Monsters
  for (const m of room.state.monsters) {
    if (!m.alive) continue;

    let closestPlayer = null;
    let closestDist = Infinity;
    for (const [, p] of room.players) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < closestDist) { closestDist = d; closestPlayer = p; }
    }
    if (!closestPlayer) continue;

    // Track previous HP for hit detection
    const prevHp = closestPlayer.hp;

    if (m.state === 'idle' && closestDist < MONSTER_CHASE) m.state = 'chase';
    if (m.state === 'chase' && closestDist > MONSTER_RETREAT) m.state = 'idle';

    m.attacking = false;

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
    if (m.type !== 'ranged' && m.attackTimer <= 0 && closestDist < 100 && closestPlayer &&
        hasLineOfSight(m.x, m.y, closestPlayer.x, closestPlayer.y, walls)) {
      closestPlayer.hp = Math.max(0, closestPlayer.hp - MONSTER_DMG);
      closestPlayer.hitFlash = 200;
      m.attackTimer = MONSTER_ATTACK_COOLDOWN;
      m.attacking = true;
    }

    // Monster attack (ranged)
    if (m.type === 'ranged' && Date.now() > m.nextShotTime && closestDist < 300 && closestPlayer &&
        hasLineOfSight(m.x, m.y, closestPlayer.x, closestPlayer.y, walls)) {
      m.nextShotTime = Date.now() + 3000 + Math.random() * 2000;
      closestPlayer.hp = Math.max(0, closestPlayer.hp - MONSTER_DMG);
      closestPlayer.hitFlash = 200;
      m.attacking = true;
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
      p.hitFlash = 0;
    }
  }

  // Auto exit/entrance
  for (const [, p] of room.players) {
    if (room.mapData.exit && !room._transitioning &&
        Math.hypot(p.x - room.mapData.exit.x, p.y - room.mapData.exit.y) < 40) {
      room._transitioning = true;
      const nextLevel = room.mapData.exit.targetLevel || (room.level + 1);
      transitionLevel(room, null, p, nextLevel, 'entrance')
        .catch(e => console.error('[MP] auto exit error:', e.message))
        .finally(() => { room._transitioning = false; });
      break;
    }
    if (room.mapData.entrance && !room._transitioning &&
        Math.hypot(p.x - room.mapData.entrance.x, p.y - room.mapData.entrance.y) < 40) {
      room._transitioning = true;
      const prevLevel = room.mapData.entrance.targetLevel || (room.level - 1);
      transitionLevel(room, null, p, prevLevel, 'exit')
        .catch(e => console.error('[MP] auto entrance error:', e.message))
        .finally(() => { room._transitioning = false; });
      break;
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
  return walls.some(w => {
    const ww = w.w || w.width || 0;
    const wh = w.h || w.height || 0;
    return mx + 20 > w.x + b &&
      mx - 20 < w.x + b + ww &&
      my + 20 > w.y + b &&
      my - 20 < w.y + b + wh;
  });
}

function hasLineOfSight(x1, y1, x2, y2, walls) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  const b = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    for (const w of walls) {
      const ww = w.w || w.width || 0;
      const wh = w.h || w.height || 0;
      if (px > w.x + b && px < w.x + b + ww &&
          py > w.y + b && py < w.y + b + wh) {
        return false;
      }
    }
  }
  return true;
}

function pushOutOfWall(m, walls) {
  if (!wallHit(m.x, m.y, walls)) return;
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
  for (let step = 2; step <= 200; step += 10) {
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
