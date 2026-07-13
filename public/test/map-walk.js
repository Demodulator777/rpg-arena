const map = document.getElementById('map');
const player = document.getElementById('player');
const playerSprite = document.getElementById('playerSprite');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const actionBtn = document.getElementById('action-btn');

// Initial map offset to center player
let mapX = (2000 - window.innerWidth) / 2;
let mapY = (2000 - window.innerHeight) / 2;

let dx = 0, dy = 0;
const speed = 7;

// Sprite animation state
let currentFrame = 0;
let animationInterval = null;

function updateSpriteAnimation() {
    const col = currentFrame % 5;
    const row = Math.floor(currentFrame / 5);
    playerSprite.style.backgroundPosition = `${col * 25}% ${row * 25}%`;
    currentFrame++;
}

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
    
    // Normalize movement
    dx = (moveX / maxDist);
    dy = (moveY / maxDist);
}

// Game Loop
function update() {
    // Move map in opposite direction of joystick to simulate camera follow
    mapX += dx * speed;
    mapY += dy * speed;

    // Clamp map position
    mapX = Math.max(0, Math.min(mapX, 2000 - window.innerWidth));
    mapY = Math.max(0, Math.min(mapY, 2000 - window.innerHeight));

    map.style.transform = `translate(${-mapX}px, ${-mapY}px)`;

    requestAnimationFrame(update);
}

// Burst action
actionBtn.addEventListener('click', () => {
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
});

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


