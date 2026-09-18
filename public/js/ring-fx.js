// Ring FX — canvas-driven ornament glow for award rings.
// Draws the ring PNG onto a <canvas class="eq-award-ring" data-ring-src="...">,
// auto-detects its bright ornament hotspots, and animates each with a rotating
// set of glow effects (breathing pulse, sparkle, flame flicker) so every inner
// element glows with a different effect at a different time.
// Only the inner ornament band glows — spots near the canvas rim spill past
// the ring and read as a flat square.
//
// Lettering band: text on a ring is curved, so the glow is rendered as an
// annular arc band (curved strip of light between inner/outer radii sweeping
// the angular span), not a flat rectangle.
//
// Band source priority (first that yields a valid band wins):
//   1. data-ring-text-band="cx,cy,r,thickness,startAngle,endAngle" on the canvas
//      (cx,cy,r,thickness as FRACTIONS 0–1 of the ring image's native width/height,
//       startAngle/endAngle in RADIANS)
//   2. /api/game/ring-text-map  →  { "<ringId>": { cx,cy,r,thickness,startAngle,endAngle } }
//      (same units; <ringId> = filename without .png)
//   3. A conservative built-in fallback that hugs the upper arc.
//
// The CSS spin animation (transform) still rotates the whole canvas.
(function () {
    'use strict';
    if (typeof document === 'undefined') return;

    var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var RUNNING = false;

    var BUF = 1000;            // fixed square drawing buffer
    var SCAN = 240;            // detection buffer size (pixels)
    var CYCLE = 5;             // seconds per spot effect slot

    // URL -> { img, width, height, spots }
    var metaCache = new Map();

    // ringId -> { cx, cy, r, thickness, startAngle, endAngle } (fractions + radians)
    var RING_TEXT_MAP = null;
    if (typeof fetch === 'function') {
        fetch('/api/game/ring-text-map')
            .then(function (r) { return r.json(); })
            .then(function (d) { RING_TEXT_MAP = (d && d.map) || {}; })
            .catch(function () { RING_TEXT_MAP = {}; });
    }

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

    function glowTint(c) {
        var h = rgbToHsl(c[0], c[1], c[2]);
        var s = Math.max(0.6, Math.min(1, h.s));
        var l = Math.max(0.55, Math.min(0.75, h.l));
        return hslToRgb(h.h, s, l);
    }

    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

    // ── Ornament spot detection ────────────────────────────────────────────
    function detectSpots(img, iw, ih) {
        var c = document.createElement('canvas');
        c.width = SCAN; c.height = SCAN;
        var ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { spots: [] };

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
        if (maxL <= 20) return { spots: [] };
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
                if (n >= 6) {
                    var cx = sx / n, cy = sy / n;
                    var cxi = Math.min(SCAN - 1, Math.max(0, Math.round(cx)));
                    var cyi = Math.min(SCAN - 1, Math.max(0, Math.round(cy)));
                    var ci = (cyi * SCAN + cxi) * 4;
                    comps.push({
                        x: cx, y: cy,
                        r: Math.max(maxX - minX + 1, maxY - minY + 1) / 2,
                        color: [d[ci], d[ci + 1], d[ci + 2]],
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
                if (Math.sqrt(dx * dx + dy * dy) < SCAN * 0.045) { ok = false; break; }
            }
            if (ok) {
                picked.push(comps[m]);
                if (picked.length >= 40) break;
            }
        }

        var maxRad = Math.min(iw, ih) / 2 * 0.62;
        var maxSpotRad = Math.min(iw, ih) * 0.10;
        var spots = picked.map(function (p) {
            var nx = (p.x - ox2) / s, ny = (p.y - oy2) / s;
            var nr = p.r / s;
            return {
                x: nx, y: ny,
                rx: Math.max(nr, 8), ry: Math.max(nr, 8),
                c: glowTint(p.color), n: p.n
            };
        }).filter(function (sp) {
            if (Math.hypot(sp.x - iw / 2, sp.y - ih / 2) > maxRad) return false;
            if (Math.max(sp.rx, sp.ry) > maxSpotRad) return false;
            return true;
        });

        return { spots: spots };
    }

    // ── Lettering band resolution ──────────────────────────────────────────
    // Convert a fractional band (0–1 positions, radians) into buffer-space coords.
    function scaleBand(e, iw, ih) {
        var sc = Math.min(BUF / iw, BUF / ih);
        var ox = (BUF - iw * sc) / 2, oy = (BUF - ih * sc) / 2;
        var minDim = Math.min(iw, ih);
        return {
            cx: ox + e.cx * iw * sc,
            cy: oy + e.cy * ih * sc,
            r: e.r * minDim * sc,
            thickness: e.thickness * minDim * sc,
            startAngle: e.startAngle,
            endAngle: e.endAngle
        };
    }

    function mapTextBand(url, iw, ih) {
        if (!RING_TEXT_MAP) return null;
        var base = String(url || '').split('?')[0];
        var id = base.substring(base.lastIndexOf('/') + 1).replace(/\.png$/i, '');
        var e = RING_TEXT_MAP[id];
        if (!e ||
            !isFinite(e.cx) || !isFinite(e.cy) || !isFinite(e.r) ||
            !isFinite(e.thickness) ||
            !isFinite(e.startAngle) || !isFinite(e.endAngle)) return null;
        return scaleBand(e, iw, ih);
    }

    function attrTextBand(canvas, iw, ih) {
        var raw = canvas.getAttribute('data-ring-text-band');
        if (!raw) return null;
        var p = raw.split(',').map(function (v) { return parseFloat(v); });
        if (p.length !== 6 || p.some(function (v) { return isNaN(v); })) return null;
        return scaleBand({
            cx: p[0], cy: p[1], r: p[2], thickness: p[3],
            startAngle: p[4], endAngle: p[5]
        }, iw, ih);
    }

    // Conservative fallback: a band hugging the upper arc of the ring.
    // Coordinates are fractions of the image; drawn in buffer space.
    function fallbackTextBand(iw, ih) {
    return scaleBand({
        cx: 0.5, cy: 0.5,
        r: 0.34,
        thickness: 0.05,
        startAngle: -2.6,
        endAngle: -0.5
    }, iw, ih);
}

    // ── Per-spot effects ───────────────────────────────────────────────────
    function drawEffect(ctx, eff, slotT, cx, cy, R, tint, W, H) {
        R = Math.min(R, Math.min(W, H) * 0.05);
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
                    var s = R * (1.4 + sa * 2.4);
                    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * Math.min(1, sa)).toFixed(3) + ')';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
                    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
                    ctx.stroke();
                }
            }
        } else if (eff === 2) {    // flame flicker
            var n1 = Math.sin(slotT * 11.3) * 0.55
                   + Math.sin(slotT * 23.7 + 1.3) * 0.3
                   + Math.sin(slotT * 7.1 + 4.2) * 0.15;
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

    function drawTextBandGlow(ctx, t, band, W, H) {
    var innerR = Math.max(1, band.r - band.thickness / 2);
    var outerR = Math.max(2, band.r + band.thickness / 2);
    var a0 = band.startAngle, a1 = band.endAngle;
    var span = a1 - a0;
    if (span <= 0) span += Math.PI * 2;
    var midR = (innerR + outerR) / 2;

    // Sync to the 24s CSS spin. 6s of glow at the top (centered on t=0/24),
    // 6s of glow at the bottom (centered on t=12).
    var ROT = 24;                                   // seconds per rotation
    var GLOW = 6;                                   // seconds of visible glow per peak
    var rt = t % ROT;
    var topDist = Math.min(rt, ROT - rt);           // seconds from top (t=0 or t=24)
    var botDist = Math.abs(rt - ROT / 2);           // seconds from bottom (t=12)
    var d = Math.min(topDist, botDist);             // distance to nearest peak

    // Triangular pulse: 0 at the edges of the window, 1 at the peak.
    var strength = d >= GLOW / 2 ? 0 : 1 - (d / (GLOW / 2));
    // Smooth the triangle a bit so the peak reads soft rather than pointed.
    strength = strength * strength * (3 - 2 * strength);   // smoothstep
    if (strength <= 0.005) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var samples = Math.max(14, Math.round(span * midR / 26));
    var haloR = Math.max(band.thickness * 3, 30);
    for (var i = 0; i <= samples; i++) {
        var a = a0 + (i / samples) * span;
        var px = band.cx + Math.cos(a) * midR;
        var py = band.cy + Math.sin(a) * midR;
        var wob = 0.85 + 0.15 * Math.sin(a * 6 + t * 2);
        var g = ctx.createRadialGradient(px, py, 0, px, py, haloR);
        g.addColorStop(0, 'rgba(255,235,160,' + (0.10 * strength * wob).toFixed(3) + ')');
        g.addColorStop(0.55, 'rgba(255,215,110,' + (0.04 * strength * wob).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, haloR, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
}

    // ── Image loading + caching ────────────────────────────────────────────
    function getMeta(url, cb) {
        var cached = metaCache.get(url);
        if (cached) { cb(cached); return; }
        var m = { img: null, width: 0, height: 0, spots: [] };
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            m.img = img;
            m.width = img.naturalWidth || img.width;
            m.height = img.naturalHeight || img.height;
            try { var r = detectSpots(img, m.width, m.height); m.spots = r.spots; }
            catch (e) { m.spots = []; }
            metaCache.set(url, m);
            cb(m);
        };
        img.onerror = function () {
            metaCache.set(url, m);
            cb(m);
        };
        img.src = url;
    }

    function drawCanvas(canvas) {
        var url = canvas.getAttribute('data-ring-src');
        if (!url) return;

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

            // Lettering band: attribute → map → fallback, all in buffer space.
            var band = attrTextBand(canvas, m.width, m.height)
                    || mapTextBand(url, m.width, m.height)
                    || fallbackTextBand(m.width, m.height);
            if (band) drawTextBandGlow(ctx2, t, band, BUF, BUF);

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