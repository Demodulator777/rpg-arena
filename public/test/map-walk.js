const gameWorld = document.getElementById('game-world');
const map = document.getElementById('map');
const player = document.getElementById('player');
const playerSprite = document.getElementById('playerSprite');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const actionBtn = document.getElementById('action-btn');
const interactPrompt = document.getElementById('interact-prompt');
const levelLabel = document.getElementById('level-label');
const loadingEl = document.getElementById('loading');
const fogEl = document.getElementById('fog');
const controlsHint = document.getElementById('controls-hint');

// Camera - always shows ~400 world units horizontally
const REF_W = 400;
const REF_H = 700;
let worldScale = 1;
let playerWX = 2500;
let playerWY = 2500;

let dx = 0, dy = 0;
const speed = 1.75;
const walls = [];

// Map data from DB
let currentLevel = 1;
let mapInfo = { name: '', playerStart: { x: 2500, y: 2500 }, exit: null, entrance: null };

// Chests
const chests = [];
let nearChest = null;

// Monsters
const MONSTER_CHASE = 200;
const MONSTER_RETREAT = 200;
const MONSTER_SPEED = 0.8;
const MONSTER_HP = 20;
const MONSTER_DMG = 5;
const MONSTER_ATTACK_FRAMES = [
    { row: 50, col: 75 }, { row: 50, col: 100 },
    { row: 75, col: 0 },  { row: 75, col: 25 }
];
const MONSTER_ANIM_MS = 150;
const monsters = [];
let playerHP = 100;
const PLAYER_MAX_HP = 100;

// Exit zone
let exitEl = null;
let entranceEl = null;

function checkOverlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
    return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}

// Animation state
let walkFrame = 0;
let burstFrame = 0;
let burstTimer = 0;
let frameAccum = 0;
let lastTime = 0;
let currentDir = 'down';
let isBursting = false;

const ROW = { down: 0, right: 25, skip: 50, left: 75, up: 100 };
const WALK_MS = 150;
const BURST_MS = 60;

function setWalkFrame(rowPct, colIdx) {
    if (isBursting) return;
    playerSprite.style.backgroundImage = 'url(/images/assets/roguelike3.png)';
    playerSprite.style.backgroundPosition = `${colIdx * 25}% ${rowPct}%`;
    playerSprite.style.transform = 'scaleX(1)';
}

function getDir() {
    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) return 'right';
        if (dx < 0) return 'left';
    } else if (dy !== 0) {
        if (dy > 0) return 'down';
        if (dy < 0) return 'up';
    }
    return currentDir;
}

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

function updateInput() {
    dx = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
    dy = (keys.s || keys.ArrowDown ? 1 : 0) - (keys.w || keys.ArrowUp ? 1 : 0);
}

window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); openNearChest(); return; }
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if (e.key === 'z' || e.key === 'Z') triggerBurst();
    updateInput();
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    updateInput();
});

// Joystick
let active = false;
let joystickTouchId = null;

function handleJoystick(e) {
    if (!active) return;
    const rect = joystickArea.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let moveX = clientX - centerX;
    let moveY = clientY - centerY;
    const dist = Math.sqrt(moveX*moveX + moveY*moveY);
    const maxDist = 45;
    if (dist > maxDist) {
        moveX = (moveX / dist) * maxDist;
        moveY = (moveY / dist) * maxDist;
    }
    joystickKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;
    dx = (moveX / maxDist);
    dy = (moveY / maxDist);
}

function checkCollision(nx, ny) {
    const b = 20;
    const cx = playerWX + nx;
    const cy = playerWY + ny;
    return walls.some(w => 
        cx + 13 > w.x + b &&
        cx - 13 < w.x + b + w.w &&
        cy + 26 > w.y + b &&
        cy - 26 < w.y + b + w.h
    );
}

function monsterWallHit(mx, my) {
    const b = 20;
    return walls.some(w =>
        mx + 20 > w.x + b &&
        mx - 20 < w.x + b + w.w &&
        my + 20 > w.y + b &&
        my - 20 < w.y + b + w.h
    );
}

function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        const b = 20;
        for (const w of walls) {
            if (px > w.x + b && px < w.x + b + w.w &&
                py > w.y + b && py < w.y + b + w.h) {
                return false;
            }
        }
    }
    return true;
}

// Burst
let burstDamaged = new Set();

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
}

// Interact prompt
function openNearChest() {
    if (!nearChest || nearChest.found) return;
    if (!hasLineOfSight(playerWX, playerWY, nearChest.x, nearChest.y)) return;
    nearChest.found = true;
    nearChest.el.classList.add('found');
    nearChest = null;
    interactPrompt.classList.remove('show');
}

interactPrompt.addEventListener('click', openNearChest);
interactPrompt.addEventListener('pointerdown', (e) => { e.stopPropagation(); openNearChest(); });

// ---- Level loading ----
async function loadLevel(level, spawnAt) {
    loadingEl.classList.remove('hide');
    try {
        // Clear existing
        document.querySelectorAll('.wall, .chest, .monster, #exit-zone, #entrance-zone').forEach(el => el.remove());
        walls.length = 0;
        chests.length = 0;
        monsters.length = 0;
        nearChest = null;
        exitEl = null;
        entranceEl = null;
        interactPrompt.classList.remove('show');

        const res = await fetch(`/api/game/maps/${level}`);
        if (!res.ok) {
            if (res.status === 404) {
                loadingEl.textContent = `Level ${level} not found`;
                loadingEl.classList.add('hide');
                return;
            }
            throw new Error((await res.json()).error);
        }
        const row = await res.json();
        const d = row.data;
        mapInfo = { name: row.name || '', playerStart: d.playerStart || { x: 2500, y: 2500 }, exit: d.exit || null, entrance: d.entrance || null };
        currentLevel = row.level;
        levelLabel.textContent = `Level ${currentLevel}${mapInfo.name ? ' - ' + mapInfo.name : ''}`;

        // Player start
        if (spawnAt === 'exit' && mapInfo.exit) {
            playerWX = mapInfo.exit.x;
            playerWY = mapInfo.exit.y;
        } else if (spawnAt === 'entrance' && mapInfo.entrance) {
            playerWX = mapInfo.entrance.x;
            playerWY = mapInfo.entrance.y;
        } else {
            playerWX = mapInfo.playerStart.x;
            playerWY = mapInfo.playerStart.y;
        }
        player.style.left = playerWX + 'px';
        player.style.top = playerWY + 'px';
        playerHP = PLAYER_MAX_HP;
        document.getElementById('player-hp-inner').style.width = '100%';

        // Walls
        if (d.walls) {
            for (const w of d.walls) {
                const el = document.createElement('div');
                el.className = 'wall';
                el.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;`;
                map.appendChild(el);
                walls.push({ x: w.x, y: w.y, w: w.width, h: w.height });
            }
        }

        // Chests
        if (d.chests) {
            for (const c of d.chests) {
                const el = document.createElement('div');
                el.className = 'chest';
                el.style.cssText = `left:${c.x}px;top:${c.y}px;`;
                map.appendChild(el);
                chests.push({ x: c.x, y: c.y, el, found: false });
            }
        }

        // Monster spawns
        if (d.monsterSpawns) {
            for (const sp of d.monsterSpawns) {
                for (let i = 0; i < sp.count; i++) {
                    let mx = sp.x + (Math.random() - 0.5) * 60;
                    let my = sp.y + (Math.random() - 0.5) * 60;
                    mx = Math.max(20, Math.min(5000 - 20, mx));
                    my = Math.max(20, Math.min(5000 - 20, my));
                    const el = document.createElement('div');
                    el.className = 'monster';
                    el.style.left = mx + 'px';
                    el.style.top = my + 'px';
                    el.style.backgroundPosition = '0% 0%';
                    const hpBar = document.createElement('div');
                    hpBar.className = 'monster-hp';
                    const hpFill = document.createElement('div');
                    hpFill.className = 'monster-hp-fill';
                    hpFill.style.width = '100%';
                    hpBar.appendChild(hpFill);
                    el.appendChild(hpBar);
                    map.appendChild(el);
                    monsters.push({
                        x: mx, y: my, spawnX: sp.x, spawnY: sp.y,
                        hp: MONSTER_HP, el, hpFill, state: 'idle',
                        attackTimer: 2000 + Math.random() * 3000, hitTimer: 0,
                        animFrame: 0, animTimer: 0
                    });
                }
            }
        }

        // Exit zone (forward)
        if (mapInfo.exit) {
            exitEl = document.createElement('div');
            exitEl.id = 'exit-zone';
            exitEl.textContent = '→';
            exitEl.style.cssText = `left:${mapInfo.exit.x - 30}px;top:${mapInfo.exit.y - 30}px;`;
            map.appendChild(exitEl);
        }

        // Entrance zone (backward)
        if (mapInfo.entrance) {
            entranceEl = document.createElement('div');
            entranceEl.id = 'entrance-zone';
            entranceEl.textContent = '←';
            entranceEl.style.cssText = `left:${mapInfo.entrance.x - 30}px;top:${mapInfo.entrance.y - 30}px;border-color:#a6a;`;
            map.appendChild(entranceEl);
        }

        loadingEl.classList.add('hide');
        loadingEl.textContent = 'Loading level...';
    } catch (e) {
        loadingEl.textContent = 'Error: ' + e.message;
        loadingEl.classList.add('hide');
    }
}

// Exit proximity + transition
let exiting = false;

async function checkExit() {
    if (!mapInfo.exit || exiting) return;
    const d = Math.hypot(playerWX - mapInfo.exit.x, playerWY - mapInfo.exit.y);
    if (d < 40) {
        exiting = true;
        const nextLevel = mapInfo.exit.targetLevel || (currentLevel + 1);
        await loadLevel(nextLevel, 'entrance');
        exiting = false;
    }
}

async function checkEntrance() {
    if (!mapInfo.entrance || exiting) return;
    const d = Math.hypot(playerWX - mapInfo.entrance.x, playerWY - mapInfo.entrance.y);
    if (d < 40) {
        exiting = true;
        const prevLevel = mapInfo.entrance.targetLevel || (currentLevel - 1);
        await loadLevel(prevLevel, 'exit');
        exiting = false;
    }
}

// Game Loop
function update(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(timestamp - lastTime, 50);
    lastTime = timestamp;

    // Movement (world coords)
    let nx = playerWX + dx * speed;
    let ny = playerWY + dy * speed;
    if (!checkCollision(dx * speed, 0)) playerWX = nx;
    if (!checkCollision(0, dy * speed)) playerWY = ny;
    playerWX = Math.max(15, Math.min(playerWX, 5000 - 15));
    playerWY = Math.max(30, Math.min(playerWY, 5000 - 30));
    player.style.left = playerWX + 'px';
    player.style.top = playerWY + 'px';

    // Camera transform
    worldScale = Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    gameWorld.style.transform = `translate(${cx}px, ${cy}px) scale(${worldScale}) translate(${-playerWX}px, ${-playerWY}px)`;

    // Fog of war – radial mask centered on player (always at screen center)
    const fogRadius = 250 * worldScale;
    fogEl.style.cssText = `position:fixed;inset:0;z-index:50;pointer-events:none;background:#000;-webkit-mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%);mask-image:radial-gradient(circle ${fogRadius}px at ${cx}px ${cy}px,transparent 0%,transparent 55%,rgba(0,0,0,0.4) 70%,#000 90%,#000 100%)`;

    if (isBursting) {
        burstTimer += dt;
        while (burstTimer >= BURST_MS) {
            burstTimer -= BURST_MS;
            const col = burstFrame % 5;
            const row = Math.floor(burstFrame / 5);
            playerSprite.style.backgroundImage = 'url(/images/assets/roguelike1.png)';
            if (currentDir === 'left') playerSprite.style.transform = 'scaleX(-1)';
            else playerSprite.style.transform = 'scaleX(1)';
            playerSprite.style.backgroundPosition = `${col * 25}% ${row * 25}%`;

            // Lunge frames 10-16
            if (burstFrame >= 10 && burstFrame <= 16) {
                const step = 20 / 7;
                let lx = 0, ly = 0;
                switch (currentDir) {
                    case 'right': lx = step; break;
                    case 'left': lx = -step; break;
                    case 'down': ly = step; break;
                    case 'up': ly = -step; break;
                }
                if (!checkCollision(lx, 0)) playerWX += lx;
                if (!checkCollision(0, ly)) playerWY += ly;
                playerWX = Math.max(15, Math.min(playerWX, 5000 - 15));
                playerWY = Math.max(30, Math.min(playerWY, 5000 - 30));
                player.style.left = playerWX + 'px';
                player.style.top = playerWY + 'px';
            }

            // Continuous damage check every frame during burst
            for (const m of monsters) {
                if (m.hp <= 0 || burstDamaged.has(m)) continue;
                if (Math.abs(playerWX - m.x) < 60 && Math.abs(playerWY - m.y) < 60 && hasLineOfSight(playerWX, playerWY, m.x, m.y)) {
                    m.hp -= 10;
                    burstDamaged.add(m);
                    m.hpFill.style.width = Math.max(0, m.hp / MONSTER_HP * 100) + '%';
                    m.hitTimer = 200;
                    if (m.hp <= 0) m.el.classList.add('dead');
                }
            }

            burstFrame++;
            if (burstFrame >= 25) {
                isBursting = false;
                playerSprite.style.filter = 'none';
                walkFrame = 0;
                frameAccum = 0;
                const dir = getDir();
                currentDir = dir;
                setWalkFrame(ROW[dir], 0);
                break;
            }
        }
    } else if (dx !== 0 || dy !== 0) {
        frameAccum += dt;
        const dir = getDir();
        if (dir !== currentDir) {
            currentDir = dir;
            walkFrame = 0;
            frameAccum = 0;
            setWalkFrame(ROW[dir], 0);
        } else {
            while (frameAccum >= WALK_MS) {
                frameAccum -= WALK_MS;
                walkFrame = (walkFrame + 1) % 5;
                setWalkFrame(ROW[currentDir], walkFrame);
            }
        }
    } else {
        frameAccum = 0;
        const dir = getDir();
        if (dir !== currentDir || walkFrame !== 0) {
            currentDir = dir;
            walkFrame = 0;
            setWalkFrame(ROW[dir], 0);
        }
    }

    // Monster AI
    for (const m of monsters) {
        if (m.hp <= 0) continue;
        const dist = Math.hypot(playerWX - m.x, playerWY - m.y);

        if (m.state === 'idle' && dist < MONSTER_CHASE) m.state = 'chase';
        if (m.state === 'chase' && dist > MONSTER_RETREAT) m.state = 'idle';

        if (m.state === 'chase') {
            const a = Math.atan2(playerWY - m.y, playerWX - m.x);
            const sx = Math.cos(a) * MONSTER_SPEED;
            const sy = Math.sin(a) * MONSTER_SPEED;
            if (!monsterWallHit(m.x + sx, m.y)) m.x += sx;
            if (!monsterWallHit(m.x, m.y + sy)) m.y += sy;
        } else {
            const d = Math.hypot(m.spawnX - m.x, m.spawnY - m.y);
            if (d > 1) {
                const a = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
                const sx = Math.cos(a) * MONSTER_SPEED;
                const sy = Math.sin(a) * MONSTER_SPEED;
                if (!monsterWallHit(m.x + sx, m.y)) m.x += sx;
                if (!monsterWallHit(m.x, m.y + sy)) m.y += sy;
            }
        }
        m.x = Math.max(20, Math.min(5000 - 20, m.x));
        m.y = Math.max(20, Math.min(5000 - 20, m.y));
        m.el.style.left = m.x + 'px';
        m.el.style.top = m.y + 'px';

        // Face the player (goblin faces left by default -> flip when monster is left of player)
        m.el.style.transform = m.x < playerWX ? 'scaleX(-1)' : 'scaleX(1)';

        // Attack animation
        if (m.animTimer > 0) {
            m.animTimer -= dt;
            if (m.animTimer <= 0) {
                m.animFrame++;
                if (m.animFrame >= MONSTER_ATTACK_FRAMES.length) {
                    m.animFrame = 0;
                    m.animTimer = 0;
                    m.el.style.backgroundPosition = '0% 0%';
                } else {
                    m.animTimer = MONSTER_ANIM_MS;
                    const f = MONSTER_ATTACK_FRAMES[m.animFrame];
                    m.el.style.backgroundPosition = `${f.col}% ${f.row}%`;
                }
            }
        } else {
            m.el.style.backgroundPosition = '0% 0%';
        }

        if (m.hitTimer > 0) {
            m.hitTimer -= dt;
            m.el.style.opacity = Math.floor(m.hitTimer / 50) % 2 ? '1' : '0.3';
        } else {
            m.el.style.opacity = '1';
        }

        m.attackTimer -= dt;
        if (m.attackTimer <= 0 && dist < 100) {
            if (checkOverlap(playerWX, playerWY, 15, 30, m.x, m.y, 20, 20) && hasLineOfSight(m.x, m.y, playerWX, playerWY)) {
                m.animFrame = 0;
                m.animTimer = MONSTER_ANIM_MS;
                const f = MONSTER_ATTACK_FRAMES[0];
                m.el.style.backgroundPosition = `${f.col}% ${f.row}%`;
                const dir = playerWX < m.x ? 'RIGHT' : 'LEFT';
                playerHP = Math.max(0, playerHP - MONSTER_DMG);
                document.getElementById('player-hp-inner').style.width = (playerHP / PLAYER_MAX_HP * 100) + '%';
                playerSprite.style.filter = 'brightness(3) saturate(0)';
                setTimeout(() => { if (!isBursting) playerSprite.style.filter = 'none'; }, 150);
                if (playerHP <= 0) {
                    playerWX = mapInfo.playerStart.x;
                    playerWY = mapInfo.playerStart.y;
                    playerHP = PLAYER_MAX_HP;
                    document.getElementById('player-hp-inner').style.width = '100%';
                }
            }
            m.attackTimer = 3000 + Math.random() * 2000;
        }
    }

    // Chest proximity
    const range = 50;
    let closest = null;
    let closestDist = range;
    for (const ch of chests) {
        if (ch.found) continue;
        const d = Math.hypot(playerWX - ch.x, playerWY - ch.y);
        if (d < closestDist && hasLineOfSight(playerWX, playerWY, ch.x, ch.y)) {
            closestDist = d;
            closest = ch;
        }
    }
    if (closest) {
        nearChest = closest;
        const sx = (closest.x - playerWX) * worldScale + window.innerWidth / 2;
        const sy = (closest.y - playerWY) * worldScale + window.innerHeight / 2 - 16;
        interactPrompt.style.left = sx + 'px';
        interactPrompt.style.top = sy + 'px';
        interactPrompt.classList.add('show');
    } else {
        nearChest = null;
        interactPrompt.classList.remove('show');
    }

    // Exit check
    checkExit();
    checkEntrance();

    requestAnimationFrame(update);
}

actionBtn.addEventListener('pointerdown', triggerBurst);
joystickArea.addEventListener('mousedown', (e) => { active = true; handleJoystick(e); });
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => { active = false; dx = dy = 0; joystickKnob.style.transform = `translate(0, 0)`; });
joystickArea.addEventListener('touchstart', (e) => { active = true; joystickTouchId = e.changedTouches[0].identifier; handleJoystick(e); });
window.addEventListener('touchmove', handleJoystick);
window.addEventListener('touchcancel', () => {
    active = false;
    joystickTouchId = null;
    dx = dy = 0;
    joystickKnob.style.transform = 'translate(0, 0)';
});
window.addEventListener('touchend', (e) => {
    for (let t of e.changedTouches) {
        if (t.identifier === joystickTouchId) {
            active = false;
            joystickTouchId = null;
            dx = dy = 0;
            joystickKnob.style.transform = 'translate(0, 0)';
            break;
        }
    }
});

// Init
const params = new URLSearchParams(window.location.search);
const startLevel = Number(params.get('level')) || 1;

// Controls hint: show on non-touch, hide button persists
if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) {
    controlsHint.classList.add('show');
}
document.getElementById('hide-hint')?.addEventListener('click', () => {
    controlsHint.classList.remove('show');
});

loadLevel(startLevel).then(() => {
    setWalkFrame(ROW.down, 0);
    requestAnimationFrame(update);
}).catch(e => {
    loadingEl.textContent = 'Failed to load: ' + e.message;
});

function fixViewportHeight() {
    document.getElementById('game-container').style.height = window.innerHeight + 'px';
}
fixViewportHeight();
window.addEventListener('resize', fixViewportHeight);
