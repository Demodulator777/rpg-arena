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

function updateSpriteAnimation() {
    const col = currentFrame % 5;
    const row = Math.floor(currentFrame / 5);
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

// Collision detection - full player div (120x120)
function checkCollision(nx, ny) {
    const playerMapX = mapX + window.innerWidth / 2 - 60 + nx;
    const playerMapY = mapY + window.innerHeight / 2 - 60 + ny;
    return walls.some(w => 
        playerMapX + 120 > w.x && 
        playerMapX < w.x + w.w && 
        playerMapY + 120 > w.y && 
        playerMapY < w.y + w.h
    );
}

// Game Loop
function update() {
    let nx = mapX + dx * speed;
    let ny = mapY + dy * speed;

    if (!checkCollision(dx * speed, 0)) mapX = nx;
    if (!checkCollision(0, dy * speed)) mapY = ny;

    // Flip sprite based on direction
    if (dx < 0) playerSprite.style.transform = 'scaleX(-1)';
    else if (dx > 0) playerSprite.style.transform = 'scaleX(1)';

    mapX = Math.max(-(window.innerWidth / 2 - 30), Math.min(mapX, 5000 - window.innerWidth / 2 - 30));
    mapY = Math.max(-(window.innerHeight / 2 - 30), Math.min(mapY, 5000 - window.innerHeight / 2 - 30));

    map.style.transform = `translate(${-mapX}px, ${-mapY}px)`;
    requestAnimationFrame(update);
}

// Burst action
function triggerBurst() {
    if (animationInterval) return;
    playerSprite.style.filter = 'brightness(2) contrast(2)';
    currentFrame = 0;
    animationInterval = setInterval(() => {
        updateSpriteAnimation();
        if (currentFrame >= 25) {
            clearInterval(animationInterval);
            animationInterval = null;
            currentFrame = 0;
            updateSpriteAnimation();
            playerSprite.style.filter = 'none';
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
