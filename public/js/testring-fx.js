// Ring FX — canvas-driven ornament glow for award rings.
// Draws the ring PNG onto a <canvas class="eq-award-ring" data-ring-src="...">,
// auto-detects its bright ornament hotspots, and animates each with a rotating
// set of glow effects (breathing pulse, sparkle, flame flicker) so every inner
// element glows with a different effect at a different time.
// Only the inner ornament band glows — spots near the canvas rim spill past
// the ring and read as a flat square.
// The CSS spin animation (transform) still rotates the whole canvas.
(function () {
    'use strict';
    if (typeof document === 'undefined') return;

    var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var RUNNING = false;

    // URL -> { img, width, height, spots }
    var metaCache = new Map();

    var SCAN = 240;            // detection buffer size (pixels)
    var CYCLE = 5;             // seconds per effect slot
    var MAX_SPOTS = 40;
    var MIN_N = 6;             // min component pixel count (at SCAN size)
    var MIN_DIST = SCAN * 0.045;
    var MAX_RAD_FRAC = 0.62;   // keep only spots within this fraction of image half-size (inner decoration band)
    var MAX_SPOT_RADIUS_FRAC = 0.10; // spots bigger than this fraction of the ring's min dimension are treated
                                      // as a merged/noise blob (e.g. a run of text pixels flood-filled into one
                                      // component) rather than a single ornament, and are dropped — this is what
                                      // was producing an oversized glow whose sparkle "cross" spanned the ring.

    function luma(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var l = (max + min) / 2;
        var d = max - min;
        var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
        var h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return { h: h, s: s, l: l };
    }

    function hslToRgb(h, s, l) {
        h /= 360;
        var r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
            function hue2rgb(p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            }
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    // Brightened glow tint [(r,g,b)] derived from the ornament's own colour.
    function glowTint(c) {
        var h = rgbToHsl(c[0], c[1], c[2]);
        var s = Math.max(0.6, Math.min(1, h.s));
        var l = Math.max(0.55, Math.min(0.75, h.l));
        return hslToRgb(h.h, s, l);
    }

    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

    // Detect bright ornament clusters. Runs once per image (cached).
    function detectSpots(img, iw, ih) {
        var c = document.createElement('canvas');
        c.width = SCAN; c.height = SCAN;
        var ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { spots: [], text: null };
        var s = Math.min(SCAN / iw, SCAN / ih);
        var ox2 = (SCAN - iw * s) / 2, oy2 = (SCAN - ih * s) / 2;
        ctx.clearRect(0, 0, SCAN, SCAN);
        ctx.drawImage(img, ox2, oy2, iw * s, ih * s);
        var d = ctx.getImageData(0, 0, SCAN, SCAN).data;

        var maxL = 0;
        for (var i = 0; i < d.length; i += 4) {
            if (d[i + 3] <= 40) continue;
            var l = luma(d[i], d[i + 1], d[i + 2]);
            if (l > maxL) maxL = l;
        }
        if (maxL <= 20) return { spots: [], text: null };
        var th = maxL * 0.55;

        var visited = new Uint8Array(SCAN * SCAN);
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        var comps = [];
        for (var y = 0; y < SCAN; y++) {
            for (var x = 0; x < SCAN; x++) {
                var idx = y * SCAN + x;
                if (visited[idx]) continue;
                var ii = idx * 4;
                if (d[ii + 3] <= 40 || luma(d[ii], d[ii + 1], d[ii + 2]) <= th) continue;
                visited[idx] = 1;
                var stack = [[x, y]];
                var n = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y;
                while (stack.length) {
                    var cell = stack.pop();
                    var px = cell[0], py = cell[1];
                    var pi = (py * SCAN + px) * 4;
                    if (d[pi + 3] <= 40 || luma(d[pi], d[pi + 1], d[pi + 2]) <= th) continue;
                    n++; sx += px; sy += py;
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                    for (var k = 0; k < dirs.length; k++) {
                        var nx = px + dirs[k][0], ny = py + dirs[k][1];
                        if (nx < 0 || nx >= SCAN || ny < 0 || ny >= SCAN) continue;
                        var ni2 = ny * SCAN + nx;
                        if (visited[ni2]) continue;
                        var qi = ni2 * 4;
                        if (d[qi + 3] <= 40 || luma(d[qi], d[qi + 1], d[qi + 2]) <= th) continue;
                        visited[ni2] = 1;
                        stack.push([nx, ny]);
                    }
                }
                if (n >= MIN_N) {
                    var cx = sx / n, cy = sy / n;
                    comps.push({
                        x: cx, y: cy,
                        r: Math.max(maxX - minX + 1, maxY - minY + 1) / 2,
                        color: [d[((Math.round(cy) * SCAN) + Math.round(cx)) * 4], d[((Math.round(cy) * SCAN) + Math.round(cx)) * 4 + 1], d[((Math.round(cy) * SCAN) + Math.round(cx)) * 4 + 2]],
                        n: n
                    });
                }
            }
        }

        comps.sort(function (a, b) { return b.n - a.n; });
        var picked = [];
        for (var m = 0; m < comps.length; m++) {
            var ok = true;
            for (var q = 0; q < picked.length; q++) {
                var dx = comps[m].x - picked[q].x, dy = comps[m].y - picked[q].y;
                if (Math.sqrt(dx * dx + dy * dy) < MIN_DIST) { ok = false; break; }
            }
            if (ok) {
                picked.push(comps[m]);
                if (picked.length >= MAX_SPOTS) break;
            }
        }

        var text = detectTextBand(d, SCAN, iw, ih, s, ox2, oy2);

        var maxRad = Math.min(iw, ih) / 2 * MAX_RAD_FRAC;
        var maxSpotRad = Math.min(iw, ih) * MAX_SPOT_RADIUS_FRAC;
        var spots = picked.map(function (p) {
            var nx = (p.x - ox2) / s, ny = (p.y - oy2) / s;
            var nr = p.r / s;
            return {
                x: nx, y: ny,
                rx: Math.max(nr, 8), ry: Math.max(nr, 8),
                c: glowTint(p.color), n: p.n
            };
        }).filter(function (sp) {
            // Only the inner ornament band glows — outer edge spikes/blooms near
            // the canvas rim would spill past the ring and read as a flat square.
            if (Math.hypot(sp.x - iw / 2, sp.y - ih / 2) > maxRad) return false;
            // Drop anything too large to be a single ornament highlight — this is
            // what let a merged blob (e.g. a run of inscription letters) become
            // one giant "spot" whose sparkle crosshair spanned the whole ring.
            if (Math.max(sp.rx, sp.ry) > maxSpotRad) return false;
            // Don't double up on the inscribed title band — it already gets its
            // own dedicated glow via drawTextGlow.
            if (text) {
                var pad = Math.max(text.h * 0.6, 6);
                if (sp.y > text.y - pad && sp.y < text.y + text.h + pad) return false;
            }
            return true;
        });

        return { spots: spots, text: text };
    }

    // Detect a narrow horizontal run of bright pixels near the vertical center —
    // that's typically an inscribed title band (e.g. "Welcome to Mid-Evil…").
    // Returns {x,y,w,h} in native coords or null.
    function detectTextBand(d, S, iw, ih, s, ox2, oy2) {
        if (!d) return null;
        var rows = new Array(S).fill(0);
        var maxCount = 0;
        for (var y = 0; y < S; y++) {
            var c = 0;
            for (var x = 0; x < S; x++) {
                var ii = (y * S + x) * 4;
                if (d[ii + 3] <= 40) continue;
                var l = luma(d[ii], d[ii + 1], d[ii + 2]);
                if (l > 130) c++;
            }
            rows[y] = c;
            if (c > maxCount) maxCount = c;
        }
        if (maxCount < 12) return null;

        // A text band is a tight run of rows whose bright count stands clearly
        // above the median of the center strip (the text sits at mid-height).
        // The width-span check keeps ornament blobs (localized, narrow) out.
        var c0 = Math.max(0, Math.round(S * 0.5 - S * 0.20));
        var c1 = Math.min(S, Math.round(S * 0.5 + S * 0.20));
        var win = rows.slice(c0, c1).sort(function (a, b) { return a - b; });
        var med = win[Math.floor(win.length * 0.5)];

        var best = null;
        for (var ry = 0; ry < S; ry++) {
            if (rows[ry] < 20) continue;
            if (Math.abs(ry - S / 2) > S * 0.20) continue;
            if (rows[ry] < Math.max(med * 3.5, 40)) continue;
            // exact vertical extent: rows with > 30% of the peak
            var thr = rows[ry] * 0.30;
            var y0 = ry;
            while (y0 > 0 && rows[y0 - 1] >= thr) y0--;
            var y1 = ry;
            while (y1 < S - 1 && rows[y1 + 1] >= thr) y1++;
            var h = (y1 - y0 + 1) / s;
            if (h > ih * 0.25) continue;   // too tall to be lettering
            var xMin = S, xMax = 0;
            for (var py2 = y0; py2 <= y1; py2++) {
                for (var px2 = 0; px2 < S; px2++) {
                    var pii = (py2 * S + px2) * 4;
                    if (d[pii + 3] <= 40) continue;
                    if (luma(d[pii], d[pii + 1], d[pii + 2]) > 130) { if (px2 < xMin) xMin = px2; if (px2 > xMax) xMax = px2; }
                }
            }
            var w = (xMax - xMin + 1) / s;
            if (w < iw * 0.5) continue;   // must span most of the ring
            best = { x: (xMin - ox2) / s, y: (y0 - oy2) / s, w: w, h: h };
            break;
        }
        return best;
    }

    function getMeta(url, cb) {
        var cached = metaCache.get(url);
        if (cached) { cb(cached); return; }
        var m = { img: null, width: 0, height: 0, spots: [], text: null };
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            m.img = img;
            m.width = img.naturalWidth || img.width;
            m.height = img.naturalHeight || img.height;
            try { var r = detectSpots(img, m.width, m.height); m.spots = r.spots; m.text = r.text; } catch (e) { m.spots = []; m.text = null; }
            metaCache.set(url, m);
            cb(m);
        };
        img.onerror = function () {
            metaCache.set(url, m);
            cb(m);
        };
        img.src = url;
    }

    // ── Per-spot effects (each occupies a CYCLE-second slot; slot+index picks the kind) ──
    function drawEffect(ctx, eff, slotT, cx, cy, R, tint, W, H) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        if (eff === 0) {           // breathing pulse
            var k = (Math.sin(slotT * 2.4) + 1) / 2;
            var R1 = R * (1.4 + 1.1 * k);
            var a = 0.10 + 0.42 * k;
            var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R1);
            g.addColorStop(0, rgba(tint, a));
            g.addColorStop(0.4, rgba(tint, a * 0.45));
            g.addColorStop(1, rgba(tint, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(cx, cy, R1, 0, Math.PI * 2); ctx.fill();
        } else if (eff === 1) {    // sparkle pops
            var peaks = [0.5, 2.15, 3.85];
            var sa = 0;
            for (var pi = 0; pi < peaks.length; pi++) {
                var dt = (slotT - peaks[pi]) / 0.55;
                if (dt > -3 && dt < 3) sa += Math.exp(-dt * dt) * 0.55;
            }
            if (sa > 0.02) {
                var sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (2 + sa * 1.6));
                sg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * Math.min(1, sa)).toFixed(3) + ')');
                sg.addColorStop(0.35, rgba(tint, (0.5 * Math.min(1, sa)).toFixed(3)));
                sg.addColorStop(1, rgba(tint, 0));
                ctx.fillStyle = sg;
                ctx.beginPath(); ctx.arc(cx, cy, R * (2 + sa * 1.6), 0, Math.PI * 2); ctx.fill();
                if (sa > 0.35) {
                    var maxCross = Math.min(W, H) * 0.16; // hard cap — a crosshair should highlight
                                                           // one ornament, never span the whole ring
                    var s = Math.min(R * (1.4 + sa * 2.4), maxCross);
                    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * Math.min(1, sa)).toFixed(3) + ')';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
                    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
                    ctx.stroke();
                }
            }
        } else if (eff === 2) {    // flame flicker (fast noise)
            var n1 = Math.sin(slotT * 11.3) * 0.55 + Math.sin(slotT * 23.7 + 1.3) * 0.3 + Math.sin(slotT * 7.1 + 4.2) * 0.15;
            var fa = 0.14 + 0.34 * Math.abs(n1);
            var R2 = R * (1.5 + 0.9 * Math.abs(n1));
            var fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R2);
            fg.addColorStop(0, rgba(tint, fa));
            fg.addColorStop(0.5, rgba(tint, fa * 0.4));
            fg.addColorStop(1, rgba(tint, 0));
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(cx, cy, R2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    // Periodic glow for the inscribed title band ("Welcome to Mid-Evil…"):
    // the whole band breathes bright↔dim every few seconds, plus a bright
    // glint sweeps left→right so the lettering reads as lighting up.
    function drawTextGlow(ctx, t, tb, sc, ox, oy, W, H) {
        var x = ox + tb.x * sc, y = oy + tb.y * sc;
        var w = tb.w * sc, h = tb.h * sc;

        // 6s breathe cycle: 0.2 → peaks at every full cycle
        var ph = t % 6;
        var breathe = Math.pow(Math.sin((ph / 6) * Math.PI), 2); // 0..1
        // brief pause between peaks makes the pulse read as discrete
        var strength = breathe < 0.18 ? 0 : (breathe - 0.18) / 0.82;

        var padH = Math.max(h * 3, 24);   // soft vertical falloff
        var padR = w * 0.22;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 1) Full-width band glow (the "light up" pulse)
        var bandAlpha = 0.6 * strength;
        var band = ctx.createLinearGradient(0, y - padH * 0.5, 0, y + h + padH * 0.5);
        band.addColorStop(0, 'rgba(255,240,170,0)');
        band.addColorStop(0.5, 'rgba(255,238,160,' + bandAlpha.toFixed(3) + ')');
        band.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = band;
        ctx.fillRect(x - padR, y - padH * 0.5, w + padR * 2, h + padH);

        // 2) Sweeping glint (bright strip crossing the text)
        if (strength > 0.05) {
            var adv = ((t * 90) % (w + 260)) / (w + 260);
            var gx = x - 130 + adv * (w + 260);
            var glintW = Math.max(w * 0.12, 60);
            var gl = ctx.createLinearGradient(gx, 0, gx + glintW, 0);
            var glA = 0.9 * strength;
            gl.addColorStop(0, 'rgba(255,255,220,0)');
            gl.addColorStop(0.5, 'rgba(255,255,230,' + glA.toFixed(3) + ')');
            gl.addColorStop(1, 'rgba(255,255,220,0)');
            ctx.fillStyle = gl;
            ctx.fillRect(gx - 10, y - padH * 0.5, glintW + 20, h + padH);
        }

        ctx.restore();
    }

    function drawCanvas(canvas) {
        var url = canvas.getAttribute('data-ring-src');
        if (!url) return;

        // Use a 1:1 square drawing buffer so the CSS 390x390 box never distorts
        // the ring. Source is letterboxed in with contain-scale + centering, and
        // spots are mapped through the same transform.
        var BUF = 1000;
        if (canvas.width !== BUF || canvas.height !== BUF) {
            canvas.width = BUF; canvas.height = BUF;
        }

        getMeta(url, function (m) {
            if (!m.img || !m.width || !m.height) return;
            var ctx2 = canvas.getContext('2d');
            if (!ctx2) return;
            ctx2.clearRect(0, 0, BUF, BUF);
            ctx2.globalAlpha = 1;
            var sc = Math.min(BUF / m.width, BUF / m.height);
            var ox = (BUF - m.width * sc) / 2, oy = (BUF - m.height * sc) / 2;
            ctx2.drawImage(m.img, ox, oy, m.width * sc, m.height * sc);

            if (REDUCED) return;

            var t = performance.now() / 1000;

            if (m.text) {
                drawTextGlow(ctx2, t, m.text, sc, ox, oy, BUF, BUF);
            }

            if (!m.spots.length) return;

            var slot = Math.floor(t / CYCLE);
            for (var i = 0; i < m.spots.length; i++) {
                var sp = m.spots[i];
                var sxp = ox + sp.x * sc, syp = oy + sp.y * sc;
                var sr = Math.max(sp.rx * sc, sp.ry * sc);
                var eff = (slot + i) % 3;
                var slotT = t - slot * CYCLE + i * 0.37;
                if (slotT >= CYCLE) slotT -= CYCLE;
                drawEffect(ctx2, eff, slotT, sxp, syp, sr, sp.c, BUF, BUF);
            }
        });
    }

    function loop() {
        RUNNING = true;
        var nodes = document.querySelectorAll('canvas.eq-award-ring[data-ring-src]');
        for (var i = 0; i < nodes.length; i++) drawCanvas(nodes[i]);
        requestAnimationFrame(loop);
    }

    function boot() {
        if (RUNNING) return;
        requestAnimationFrame(loop);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
    else document.addEventListener('DOMContentLoaded', boot);

    window.RingFX = { boot: boot };
})();