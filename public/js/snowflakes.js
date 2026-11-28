(function () {
    if (window.__snowflakesLoaded) return;
    window.__snowflakesLoaded = true;

    const images = [];
    for (let i = 1; i <= 12; i++) images.push('/images/christmas/snowflake' + i + '.png');

    const style = document.createElement('style');
    style.textContent = [
        '.snowflake-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999;}',
        '.snowflake{position:absolute;top:0;left:0;will-change:transform;user-select:none;}'
    ].join('');
    document.head.appendChild(style);

    const groups = [];
    for (let i = 0; i < 4; i++) groups.push({ wind: 0, target: 0, nextChange: 0 });

    function updateGroups(now) {
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (now >= g.nextChange) {
                g.target = (Math.random() - 0.5) * 70;
                g.nextChange = now + 2500 + Math.random() * 4000;
            }
            g.wind += (g.target - g.wind) * 0.012;
        }
    }

    function init() {
        const layer = document.createElement('div');
        layer.className = 'snowflake-layer';
        document.body.appendChild(layer);

        const flakes = [];
        let last = performance.now();

        const MAX_TEX = 64;
        const ALPHA_GAMMA = 0.6;
        const MIN_OPACITY = 0.12;
        const MAX_OPACITY = 0.3;
        const START_AFTER = 3;

        const MOUSE_RADIUS = 180;
        const MOUSE_REPEL = 500;
        const MOUSE_DRAG = 2.5;
        const MOUSE_MAX_SPEED = 3000;

        const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, lastX: 0, lastY: 0, lastTime: 0, hasLast: false, active: false };

        window.addEventListener('mousemove', function (e) {
            const now = performance.now();
            if (mouse.hasLast) {
                const dtMs = Math.max(1, now - mouse.lastTime);
                let ivx = (e.clientX - mouse.lastX) / dtMs * 1000;
                let ivy = (e.clientY - mouse.lastY) / dtMs * 1000;
                const sp = Math.hypot(ivx, ivy);
                if (sp > MOUSE_MAX_SPEED) {
                    ivx *= MOUSE_MAX_SPEED / sp;
                    ivy *= MOUSE_MAX_SPEED / sp;
                }
                mouse.vx = mouse.vx * 0.5 + ivx * 0.5;
                mouse.vy = mouse.vy * 0.5 + ivy * 0.5;
            }
            mouse.hasLast = true;
            mouse.lastX = e.clientX;
            mouse.lastY = e.clientY;
            mouse.lastTime = now;
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;
        }, { passive: true });

        document.documentElement.addEventListener('mouseleave', function () {
            mouse.active = false;
            mouse.hasLast = false;
            mouse.vx = 0;
            mouse.vy = 0;
        });

        const readyImages = [];
        let started = false;

        function boost(src, done) {
            const img = new Image();
            img.onload = function () {
                try {
                    const scale = Math.min(1, MAX_TEX / Math.max(img.naturalWidth, img.naturalHeight));
                    const w = Math.max(1, Math.round(img.naturalWidth * scale));
                    const h = Math.max(1, Math.round(img.naturalHeight * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const data = ctx.getImageData(0, 0, w, h);
                    for (let i = 3; i < data.data.length; i += 4) {
                        const a = data.data[i] / 255;
                        data.data[i] = Math.round(255 * Math.pow(a, ALPHA_GAMMA));
                    }
                    ctx.putImageData(data, 0, 0);
                    done(canvas.toDataURL('image/png'));
                } catch (e) {
                    console.warn('Snowflake boost failed for', src, e);
                    done(src);
                }
            };
            img.onerror = function () {
                console.warn('Snowflake image failed to load:', src);
                done(null);
            };
            img.src = src;
        }

        for (let i = 0; i < images.length; i++) {
            boost(images[i], function (url) {
                if (url) readyImages.push(url);
                if (!started && readyImages.length >= START_AFTER) startSpawning();
            });
        }

        function spawn() {
            if (flakes.length >= 90 || !readyImages.length) return;
            const group = Math.floor(Math.random() * groups.length);
            const size = 10 + Math.random() * 10;
            const opacity = MIN_OPACITY + Math.random() * (MAX_OPACITY - MIN_OPACITY);
            const el = document.createElement('img');
            el.className = 'snowflake';
            el.src = readyImages[Math.floor(Math.random() * readyImages.length)];
            el.style.width = size + 'px';
            el.style.height = 'auto';
            el.style.opacity = opacity.toFixed(2);
            layer.appendChild(el);

            flakes.push({
                el: el,
                x: Math.random() * window.innerWidth,
                y: -size - Math.random() * 40,
                vx: (Math.random() - 0.5) * 6,
                vy: 4 + Math.random() * 8,
                rot: Math.random() * 360,
                vrot: (Math.random() - 0.5) * 90,
                size: size,
                opacity: opacity,
                group: group,
                phase: Math.random() * Math.PI * 2,
                age: 0,
                melting: false,
                meltStart: 0
            });
        }

        let spawnTimer = null;
        function startSpawning() {
            started = true;
            for (let i = 0; i < 30; i++) setTimeout(spawn, Math.random() * 1500);
            spawnTimer = setInterval(spawn, 300);
        }

        function frame(now) {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            updateGroups(now);

            const mouseDecay = Math.exp(-dt * 6);
            mouse.vx *= mouseDecay;
            mouse.vy *= mouseDecay;

            const vw = window.innerWidth;
            const vh = window.innerHeight;

            for (let i = flakes.length - 1; i >= 0; i--) {
                const f = flakes[i];
                const g = groups[f.group];

                const wind = g.wind + Math.sin(now * 0.0011 + f.phase) * 22;
                const verticalGust = Math.sin(now * 0.0007 + f.phase * 1.3) * 9;

                if (mouse.active) {
                    const dx = (f.x + f.size / 2) - mouse.x;
                    const dy = (f.y + f.size / 2) - mouse.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < MOUSE_RADIUS && dist > 0.1) {
                        const influence = 1 - dist / MOUSE_RADIUS;
                        const k = influence * influence;
                        f.vx += (dx / dist) * MOUSE_REPEL * k * dt;
                        f.vy += (dy / dist) * MOUSE_REPEL * k * dt;
                        f.vx += mouse.vx * MOUSE_DRAG * k * dt;
                        f.vy += mouse.vy * MOUSE_DRAG * k * dt;
                    }
                }

                f.vx += wind * 0.035 * dt * 60;
                f.vy += (verticalGust + 1.6) * dt * 60 * 0.05;
                f.vx *= 0.985;
                f.vy *= 0.992;

                if (f.vx > 160) f.vx = 160;
                if (f.vx < -160) f.vx = -160;
                if (f.vy > 120) f.vy = 120;
                if (f.vy < -120) f.vy = -120;

                f.x += f.vx * dt;
                f.y += f.vy * dt;
                f.rot += f.vrot * dt;
                f.age += dt;

                if (f.x < -60) f.x = vw + 50;
                if (f.x > vw + 60) f.x = -50;

                let scale = 1;
                if (!f.melting && (f.age > 18 || f.y > vh - 100)) {
                    f.melting = true;
                    f.meltStart = now;
                }
                if (f.melting) {
                    const progress = Math.min(1, (now - f.meltStart) / 10000);
                    const eased = progress * progress;
                    scale = 1 - eased;
                    f.el.style.clipPath = 'circle(' + (50 * (1 - eased)) + '% at 50% 50%)';
                    f.el.style.opacity = (f.opacity * (1 - eased)).toFixed(2);
                }
                f.el.style.transform = 'translate3d(' + f.x + 'px,' + f.y + 'px,0) rotate(' + f.rot + 'deg) scale(' + scale + ')';

                if ((f.melting && (now - f.meltStart) >= 10000) || f.y > vh + 180 || f.y < -140 || f.age > 35) {
                    f.el.remove();
                    flakes.splice(i, 1);
                }
            }

            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);

        window.addEventListener('beforeunload', function () { clearInterval(spawnTimer); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
