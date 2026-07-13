const sprite = document.getElementById('burstSprite');

function playBurst() {
    sprite.style.animation = 'none';
    void sprite.offsetHeight;
    sprite.style.animation = 'burstGrid 1.2s steps(5) forwards';
}

function loopBurst() {
    sprite.style.animation = 'none';
    void sprite.offsetHeight;
    sprite.style.animation = 'burstGrid 1.5s steps(5) infinite';
}

function slowBurst() {
    sprite.style.animation = 'none';
    void sprite.offsetHeight;
    sprite.style.animation = 'burstGrid 3s steps(5) infinite';
}

function showFrame13() {
    sprite.style.animation = 'none';
    sprite.style.backgroundPosition = '50% 50%';
}

function resetBurst() {
    sprite.style.animation = 'none';
    sprite.style.backgroundPosition = '0% 0%';
}

document.getElementById('btnTrigger').addEventListener('click', playBurst);
document.getElementById('btnLoop').addEventListener('click', loopBurst);
document.getElementById('btnSlow').addEventListener('click', slowBurst);
document.getElementById('btnFrame').addEventListener('click', showFrame13);
document.getElementById('btnReset').addEventListener('click', resetBurst);

window.addEventListener('load', loopBurst);
