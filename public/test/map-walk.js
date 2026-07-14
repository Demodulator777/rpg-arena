const gameWorld = document.getElementById('game-world');
const map = document.getElementById('map');
const player = document.getElementById('player');
const playerSprite = document.getElementById('playerSprite');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const actionBtn = document.getElementById('action-btn');
const interactPrompt = document.getElementById('interact-prompt');

// Camera - always shows ~400 world units horizontally
const REF_W = 400;
const REF_H = 700;
let worldScale = 1;
let playerWX = 2500; // player's world X
let playerWY = 2500; // player's world Y

let dx = 0, dy = 0;
const speed = 1.75;
const walls = [];

function generateMaze() {
    const center = { x: 2500, y: 2500 };
    const safeRadius = 300; 
    for (let i = 0; i < 200; i++) {
        const w = 50 + Math.random() * 200;
        const h = 50 + Math.random() * 200;
        const x = Math.random() * (5000 - w);
        const y = Math.random() * (5000 - h);
        if (x < center.x + safeRadius && x + w > center.x - safeRadius && 
            y < center.y + safeRadius && y + h > center.y - safeRadius) {
            continue; 
        }
        const wall = document.createElement('div');
        wall.className = 'wall';
        wall.style.width = w + 'px';
        wall.style.height = h + 'px';
        wall.style.left = x + 'px';
        wall.style.top = y + 'px';
        map.appendChild(wall);
        walls.push({ x, y, w, h });
    }
}
generateMaze();

// Chests
const CHEST_COUNT = 10;
const CHEST_MIN_DIST = 400;
const chests = [];
let nearChest = null;

function generateChests() {
    const center = { x: 2500, y: 2500 };
    for (let i = 0; i < CHEST_COUNT; i++) {
        let placed = false;
        for (let attempt = 0; attempt < 200 && !placed; attempt++) {
            const cx = 60 + Math.random() * (5000 - 120);
            const cy = 60 + Math.random() * (5000 - 120);
            if (Math.abs(cx - center.x) < 300 && Math.abs(cy - center.y) < 300) continue;
            let tooClose = false;
            for (const c of chests) {
                if (Math.hypot(c.x - cx, c.y - cy) < CHEST_MIN_DIST) { tooClose = true; break; }
            }
            if (tooClose) continue;
            let onWall = false;
            for (const w of walls) {
                if (cx + 20 > w.x + 20 && cx - 20 < w.x + 20 + w.w &&
                    cy + 16 > w.y + 20 && cy - 16 < w.y + 20 + w.h) { onWall = true; break; }
            }
            if (onWall) continue;
            const el = document.createElement('div');
            el.className = 'chest';
            el.style.left = cx + 'px';
            el.style.top = cy + 'px';
            map.appendChild(el);
            chests.push({ x: cx, y: cy, el, found: false });
            placed = true;
        }
    }
}
generateChests();

// Monsters
const MONSTER_CHASE = 200;
const MONSTER_RETREAT = 200;
const MONSTER_SPEED = 0.8;
const MONSTER_HP = 20;
const MONSTER_DMG = 5;
const BURST_RANGE = 40;
const monsters = [];
let playerHP = 100;
const PLAYER_MAX_HP = 100;

function generateMonsters() {
    const guarded = [...chests].sort(() => Math.random() - 0.5).slice(0, 5);
    for (const chest of guarded) {
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            let mx = chest.x + (Math.random() - 0.5) * 80;
            let my = chest.y + (Math.random() - 0.5) * 80;
            mx = Math.max(20, Math.min(5000 - 20, mx));
            my = Math.max(20, Math.min(5000 - 20, my));
            const el = document.createElement('div');
            el.className = 'monster';
            el.style.left = mx + 'px';
            el.style.top = my + 'px';
            map.appendChild(el);
            monsters.push({
                x: mx, y: my, spawnX: mx, spawnY: my,
                hp: MONSTER_HP, el, state: 'idle',
                attackTimer: 2000 + Math.random() * 3000, hitTimer: 0
            });
        }
    }
}
generateMonsters();

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

const burstImg = new Image();
burstImg.src = '/images/assets/roguelike1.png';

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

// Burst
function triggerBurst() {
    if (isBursting) return;
    isBursting = true;
    burstFrame = 0;
    burstTimer = 0;
    playerSprite.style.filter = 'brightness(2) contrast(2)';
    playerSprite.style.backgroundImage = 'url(/images/assets/roguelike1.png)';
    if (currentDir === 'left') playerSprite.style.transform = 'scaleX(-1)';
    else playerSprite.style.transform = 'scaleX(1)';
    playerSprite.style.backgroundPosition = '0% 0%';
    burstFrame++;

    // Damage monsters in burst range
    const hb = BURST_RANGE / 2, hm = 20;
    for (const m of monsters) {
        if (m.hp <= 0) continue;
        if (Math.abs(playerWX - m.x) < hb + hm && Math.abs(playerWY - m.y) < hb + hm) {
            m.hp -= 10;
            m.hitTimer = 200;
            if (m.hp <= 0) m.el.classList.add('dead');
        }
    }

}

// Interact prompt
function openNearChest() {
    if (!nearChest || nearChest.found) return;
    nearChest.found = true;
    nearChest.el.classList.add('found');
    nearChest = null;
    interactPrompt.classList.remove('show');
}

interactPrompt.addEventListener('click', openNearChest);
interactPrompt.addEventListener('pointerdown', (e) => { e.stopPropagation(); openNearChest(); });

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
            m.x += Math.cos(a) * MONSTER_SPEED;
            m.y += Math.sin(a) * MONSTER_SPEED;
        } else {
            const d = Math.hypot(m.spawnX - m.x, m.spawnY - m.y);
            if (d > 1) {
                const a = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
                m.x += Math.cos(a) * MONSTER_SPEED;
                m.y += Math.sin(a) * MONSTER_SPEED;
            }
        }
        m.x = Math.max(20, Math.min(5000 - 20, m.x));
        m.y = Math.max(20, Math.min(5000 - 20, m.y));
        m.el.style.left = m.x + 'px';
        m.el.style.top = m.y + 'px';

        if (m.hitTimer > 0) {
            m.hitTimer -= dt;
            m.el.style.opacity = Math.floor(m.hitTimer / 50) % 2 ? '1' : '0.3';
        } else {
            m.el.style.opacity = '1';
        }

        m.attackTimer -= dt;
        if (m.attackTimer <= 0 && dist < 100) {
            if (checkOverlap(playerWX, playerWY, 15, 30, m.x, m.y, 20, 20)) {
                playerHP = Math.max(0, playerHP - MONSTER_DMG);
                document.getElementById('player-hp-inner').style.width = (playerHP / PLAYER_MAX_HP * 100) + '%';
                playerSprite.style.filter = 'brightness(3) saturate(0)';
                setTimeout(() => { if (!isBursting) playerSprite.style.filter = 'none'; }, 150);
                if (playerHP <= 0) {
                    playerWX = 2500; playerWY = 2500;
                    playerHP = PLAYER_MAX_HP;
                    document.getElementById('player-hp-inner').style.width = '100%';
                }
            }
            m.attackTimer = 3000 + Math.random() * 2000;
        }
    }

    // Chest proximity – position prompt in screen coords
    const range = 50;
    let closest = null;
    let closestDist = range;
    for (const ch of chests) {
        if (ch.found) continue;
        const d = Math.hypot(playerWX - ch.x, playerWY - ch.y);
        if (d < closestDist) {
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
setWalkFrame(ROW.down, 0);
player.style.left = playerWX + 'px';
player.style.top = playerWY + 'px';
requestAnimationFrame(update);

function fixViewportHeight() {
    document.getElementById('game-container').style.height = window.innerHeight + 'px';
}
fixViewportHeight();
window.addEventListener('resize', fixViewportHeight);
