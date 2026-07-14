const map = document.getElementById('map');
const player = document.getElementById('player');
const playerSprite = document.getElementById('playerSprite');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const actionBtn = document.getElementById('action-btn');

let mapX = (5000 - window.innerWidth) / 2;
let mapY = (5000 - window.innerHeight) / 2;

let dx = 0, dy = 0;
const speed = 7;
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

// Input
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

function updateInput() {
    dx = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
    dy = (keys.s || keys.ArrowDown ? 1 : 0) - (keys.w || keys.ArrowUp ? 1 : 0);
}

window.addEventListener('keydown', (e) => {
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
    const cx = mapX + window.innerWidth / 2 + nx;
    const cy = mapY + window.innerHeight / 2 + ny;
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
}

// Game Loop
function update(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(timestamp - lastTime, 50);
    lastTime = timestamp;

    let nx = mapX + dx * speed;
    let ny = mapY + dy * speed;
    if (!checkCollision(dx * speed, 0)) mapX = nx;
    if (!checkCollision(0, dy * speed)) mapY = ny;
    mapX = Math.max(-(window.innerWidth / 2 - 15), Math.min(mapX, 5000 - window.innerWidth / 2 - 15));
    mapY = Math.max(-(window.innerHeight / 2 - 30), Math.min(mapY, 5000 - window.innerHeight / 2 - 30));
    map.style.transform = `translate(${-mapX}px, ${-mapY}px)`;

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

    requestAnimationFrame(update);
}

actionBtn.addEventListener('click', triggerBurst);
joystickArea.addEventListener('mousedown', (e) => { active = true; handleJoystick(e); });
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => { active = false; dx = dy = 0; joystickKnob.style.transform = `translate(0, 0)`; });
joystickArea.addEventListener('touchstart', (e) => { active = true; handleJoystick(e); });
window.addEventListener('touchmove', handleJoystick);
window.addEventListener('touchend', () => { active = false; dx = dy = 0; joystickKnob.style.transform = `translate(0, 0)`; });

// Init
setWalkFrame(ROW.down, 0);
requestAnimationFrame(update);

function fixViewportHeight() {
    document.getElementById('game-container').style.height = window.innerHeight + 'px';
}
fixViewportHeight();
window.addEventListener('resize', fixViewportHeight);
