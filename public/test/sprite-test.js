const sprite = document.getElementById('burstSprite');
let intervalId = null;
let currentFrame = 0;
let isAnimating = false;

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
    }, 60); // 60ms per frame = snappy cuts
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
    }, 150); // 150ms per frame = slow motion
}

function stopBurst() {
    clearInterval(intervalId);
    intervalId = null;
}

function showFrame13() {
    stopBurst();
    currentFrame = 12; // 0-indexed, 13th frame is 12
    updatePosition();
}

function resetBurst() {
    stopBurst();
    currentFrame = 0;
    sprite.style.backgroundPosition = '0% 0%';
}

document.getElementById('btnTrigger').addEventListener('click', playBurst);
document.getElementById('btnLoop').addEventListener('click', loopBurst);
document.getElementById('btnSlow').addEventListener('click', slowBurst);
document.getElementById('btnFrame').addEventListener('click', showFrame13);
document.getElementById('btnReset').addEventListener('click', resetBurst);

window.addEventListener('load', loopBurst);
