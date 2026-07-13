const player = document.getElementById('player');
const joystickArea = document.getElementById('joystick-area');
const joystickKnob = document.getElementById('joystick-knob');
const actionBtn = document.getElementById('action-btn');

let playerX = 500, playerY = 500;
let dx = 0, dy = 0;
const speed = 5;

// Joystick handling
let active = false;
let joyX = 0, joyY = 0;

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
    const maxDist = 35; // Max knob movement
    
    if (dist > maxDist) {
        moveX = (moveX / dist) * maxDist;
        moveY = (moveY / dist) * maxDist;
    }
    
    joystickKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;
    
    // Normalize movement
    dx = (moveX / maxDist);
    dy = (moveY / maxDist);
}

joystickArea.addEventListener('mousedown', () => active = true);
window.addEventListener('mousemove', handleJoystick);
window.addEventListener('mouseup', () => {
    active = false;
    dx = dy = 0;
    joystickKnob.style.transform = `translate(0, 0)`;
});

// Touch support
joystickArea.addEventListener('touchstart', () => active = true);
window.addEventListener('touchmove', handleJoystick);
window.addEventListener('touchend', () => {
    active = false;
    dx = dy = 0;
    joystickKnob.style.transform = `translate(0, 0)`;
});

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
    console.log('Burst activated!');
    // Trigger visual effect here
    player.style.boxShadow = '0 0 50px 20px #fff';
    setTimeout(() => player.style.boxShadow = 'none', 300);
});

update();
