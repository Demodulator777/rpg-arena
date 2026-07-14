const map = document.getElementById('map');
const player = document.getElementById('player');
const playerSprite = document.getElementById('playerSprite');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const actionBtn = document.getElementById('action-btn');

// Initial map offset to center player
let mapX = (5000 - window.innerWidth) / 2;
let mapY = (5000 - window.innerHeight) / 2;

let dx = 0, dy = 0;
const speed = 7;
const walls = [];

// Generate Maze
function generateMaze() {
    const center = { x: 2500, y: 2500 };
    const safeRadius = 300; 
    for (let i = 0; i < 200; i++) {
        const w = 50 + Math.random() * 200;
        const h = 50 + Math.random() * 200;
        const x = Math.random() * (5000 - w);
        const y = Math.random() * (5000 - h);
        
        // Ensure spawn area is clear
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

// Sprite animation state
let currentFrame = 0;
let animationInterval = null;
let walkInterval = null;
let currentDir = 'down';
let isBursting = false;

const ROW = { down: 0, right: 25, skip: 50, left: 75, up: 100 };

function setWalkFrame(rowPct, colIdx) {
    if (isBursting) return;
    playerSprite.style.backgroundImage = 'url(/images/assets/roguelike3.png)';
    playerSprite.style.backgroundPosition = `${colIdx * 25}% ${rowPct}%`;
}

function getDir() {
    if (dy > 0) return 'down';
    if (dy < 0) return 'up';
    if (dx > 0) return 'right';
    if (dx < 0) return 'left';
    return currentDir;
}

function startWalkAnim() {
    if (isBursting) return;
    const dir = getDir();
    currentDir = dir;
    setWalkFrame(ROW[dir], 0);
    if (walkInterval) return;
    let f = 1;
    walkInterval = setInterval(() => {
        if (isBursting) return;
        const dir2 = getDir();
        currentDir = dir2;
        setWalkFrame(ROW[dir2], f);
        f = (f + 1) % 5;
    }, 150);
}

function stopWalkAnim() {
    if (isBursting) return;
    clearInterval(walkInterval);
    walkInterval = null;
    const dir = getDir();
    currentDir = dir;
    setWalkFrame(ROW[dir], 0);
}

function updateSpriteAnimation() {
    // burst-only: steps through roguelike1.png all 25 frames
    const col = currentFrame % 5;
    const row = Math.floor(currentFrame / 5);
    playerSprite.style.backgroundImage = 'url(/images/assets/roguelike1.png)';
    if (currentDir === 'left') playerSprite.style.transform = 'scaleX(-1)';
    else playerSprite.style.transform = 'scaleX(1)';
    playerSprite.style.backgroundPosition = `${col * 25}% ${row * 25}%`;
    currentFrame++;
}

function getDir() {
    if (dy > 0) return 'down';
    if (dy < 0) return 'up';
    if (dx > 0) return 'right';
    if (dx < 0) return 'left';
    return currentDir;
}

function startWalkAnim() {
    if (animationInterval) return;
    const dir = getDir();
    currentDir = dir;
    // Immediately show first frame
    setWalkFrame(ROW[dir], 0);
    if (walkInterval) return;
    let f = 1; // next frame
    walkInterval = setInterval(() => {
        const dir2 = getDir();
        currentDir = dir2;
        setWalkFrame(ROW[dir2], f);
        f = (f + 1) % 5;
    }, 150);
}

function stopWalkAnim() {
    clearInterval(walkInterval);
    walkInterval = null;
    // Stay on first frame of last direction
    const dir = getDir();
    currentDir = dir;
    setWalkFrame(ROW[dir], 0);
}

function updateSpriteAnimation() {
    // burst-only: steps through roguelike1.png all 25 frames
    const col = currentFrame % 5;
    const row = Math.floor(currentFrame / 5);
    playerSprite.style.backgroundImage = 'url(/images/assets/roguelike1.png)';
    // Flip burst sprite based on last direction
    if (currentDir === 'left') playerSprite.style.transform = 'scaleX(-1)';
    else playerSprite.style.transform = 'scaleX(1)';
    playerSprite.style.backgroundPosition = `${col * 25}% ${row * 25}%`;
    currentFrame++;
}

// Input handling
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

// Joystick handling
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

// Collision detection - character is ~30x60 centered in 120x120 sprite, account for 20px map border
function checkCollision(nx, ny) {
    const b = 20; // map border
    const cx = mapX + window.innerWidth / 2 + nx; // char center X (map coords)
    const cy = mapY + window.innerHeight / 2 + ny; // char center Y (map coords)
    return walls.some(w => 
        cx + 13 > w.x + b &&
        cx - 13 < w.x + b + w.w &&
        cy + 26 > w.y + b &&
        cy - 26 < w.y + b + w.h
    );
}

// Game Loop
function update() {
    let nx = mapX + dx * speed;
    let ny = mapY + dy * speed;

    if (!checkCollision(dx * speed, 0)) mapX = nx;
    if (!checkCollision(0, dy * speed)) mapY = ny;

    // Walking animation
    if (dx !== 0 || dy !== 0) startWalkAnim();
    else stopWalkAnim();

    mapX = Math.max(-(window.innerWidth / 2 - 15), Math.min(mapX, 5000 - window.innerWidth / 2 - 15));
    mapY = Math.max(-(window.innerHeight / 2 - 30), Math.min(mapY, 5000 - window.innerHeight / 2 - 30));

    map.style.transform = `translate(${-mapX}px, ${-mapY}px)`;
    requestAnimationFrame(update);
}

// Burst action
function triggerBurst() {
    if (animationInterval) return;
    isBursting = true;
    stopWalkAnim();
    playerSprite.style.filter = 'brightness(2) contrast(2)';
    currentFrame = 0;
    animationInterval = setInterval(() => {
        updateSpriteAnimation();
        if (currentFrame >= 25) {
            clearInterval(animationInterval);
            animationInterval = null;
            currentFrame = 0;
            playerSprite.style.filter = 'none';
            isBursting = false;
            // Restore walking sprite
            const dir = getDir();
            currentDir = dir;
            setWalkFrame(ROW[dir], 0);
        }
    }, 60);
}

actionBtn.addEventListener('click', triggerBurst);

// Event Listeners for Joystick
joystickArea.addEventListener('mousedown', (e) => { active = true; handleJoystick(e); });
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => { active = false; dx = dy = 0; joystickKnob.style.transform = `translate(0, 0)`; });

joystickArea.addEventListener('touchstart', (e) => { active = true; handleJoystick(e); });
window.addEventListener('touchmove', handleJoystick);
window.addEventListener('touchend', () => { active = false; dx = dy = 0; joystickKnob.style.transform = `translate(0, 0)`; });

// Init
updateSpriteAnimation();
update();

// Mobile viewport height fix (account for browser chrome)
function fixViewportHeight() {
    const container = document.getElementById('game-container');
    container.style.height = window.innerHeight + 'px';
}
fixViewportHeight();
window.addEventListener('resize', fixViewportHeight);
