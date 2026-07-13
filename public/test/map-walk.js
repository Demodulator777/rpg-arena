const player = document.getElementById('player');
const playerSprite = document.getElementById('playerSprite');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const actionBtn = document.getElementById('action-btn');

let playerX = 500, playerY = 500;
let dx = 0, dy = 0;
const speed = 5;

// Sprite animation state
let currentFrame = 0;
function updateSpriteAnimation() {
    const col = currentFrame % 5;
    const row = Math.floor(currentFrame / 5);
    playerSprite.style.backgroundPosition = `${col * 25}% ${row * 25}%`;
    currentFrame = (currentFrame + 1) % 25;
}
setInterval(updateSpriteAnimation, 100);

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
    const maxDist = 45; // Max knob movement distance
    
    if (dist > maxDist) {
        moveX = (moveX / dist) * maxDist;
        moveY = (moveY / dist) * maxDist;
    }
    
    joystickKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;
    
    // Normalize movement
    dx = (moveX / maxDist);
    dy = (moveY / maxDist);
}

// Event Listeners for Joystick
joystickArea.addEventListener('mousedown', (e) => { active = true; handleJoystick(e); });
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => { active = false; dx = dy = 0; joystickKnob.style.transform = `translate(0, 0)`; });

joystickArea.addEventListener('touchstart', (e) => { active = true; handleJoystick(e); });
window.addEventListener('touchmove', handleJoystick);
window.addEventListener('touchend', () => { active = false; dx = dy = 0; joystickKnob.style.transform = `translate(0, 0)`; });

// Game Loop
function update() {
    playerX += dx * speed;
    playerY += dy * speed;
    player.style.left = playerX + 'px';
    player.style.top = playerY + 'px';
    requestAnimationFrame(update);
}

// Burst action
actionBtn.addEventListener('click', () => {
    playerSprite.style.filter = 'brightness(2) contrast(2)';
    setTimeout(() => playerSprite.style.filter = 'none', 300);
});

update();
