const sprite = document.getElementById('burstSprite');
const container = document.getElementById('burstContainer');
let intervalId = null;
let currentFrame = 0;

function updatePosition() {
    const col = currentFrame % 5;
    const row = Math.floor(currentFrame / 5);
    sprite.style.backgroundPosition = `${col * 25}% ${row * 25}%`;
    currentFrame++;
}

function playBurst() {
    stopBurst();
    currentFrame = 0;
    intervalId = setInterval(() => {
        updatePosition();
        if (currentFrame >= 25) stopBurst();
    }, 60);
}

function loopBurst() {
    stopBurst();
    currentFrame = 0;
    intervalId = setInterval(() => {
        if (currentFrame >= 25) currentFrame = 0;
        updatePosition();
    }, 60);
}

function slowBurst() {
    stopBurst();
    currentFrame = 0;
    intervalId = setInterval(() => {
        if (currentFrame >= 25) currentFrame = 0;
        updatePosition();
    }, 150);
}

function stopBurst() {
    clearInterval(intervalId);
    intervalId = null;
}

function showFrame13() {
    stopBurst();
    currentFrame = 12;
    updatePosition();
}

function resetBurst() {
    stopBurst();
    currentFrame = 0;
    sprite.style.backgroundPosition = '0% 0%';
}

function setSize(height) {
    container.style.width = height + 'px';
    container.style.height = height + 'px';
}

document.getElementById('btnTrigger').addEventListener('click', playBurst);
document.getElementById('btnLoop').addEventListener('click', loopBurst);
document.getElementById('btnSlow').addEventListener('click', slowBurst);
document.getElementById('btnFrame').addEventListener('click', showFrame13);
document.getElementById('btnReset').addEventListener('click', resetBurst);
document.getElementById('btnSize60').addEventListener('click', () => setSize(60));
document.getElementById('btnSize40').addEventListener('click', () => setSize(40));
document.getElementById('btnSize30').addEventListener('click', () => setSize(30));

window.addEventListener('load', loopBurst);
