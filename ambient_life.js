/* ═══════════════════════════════════════════════════════════════════
   AMBIENT LIFE ENGINE (Map-World & Home Dual-Layer Architecture)
   
   Solves the "animation stuck to my glasses" problem:
     • Home Screen: Runs a full-viewport ambient canvas on #home-ambient-layer.
     • Map Screen:  Runs an ambient canvas INSIDE #map-world-content.
       Because the canvas is inside the map world, when the player drags,
       pans, or zooms the map, the seagulls, wind, and motes STAY IN THE
       MAP WORLD rather than following the camera/glasses!
     
   Both engines share the zero-GC, 60/120 FPS high-performance renderer
   with constant memory, no blur filter stalls, and smooth delta physics.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (t) => t * t * (3 - 2 * t);
  const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  /* Shared wind flow field – gentle, slowly evolving right→left current */
  function flowAngle(x, y, t) {
    return 0.16 * Math.sin(y * 0.0035 + t * 0.22) +
           0.10 * Math.sin(x * 0.0028 - t * 0.31 + y * 0.001);
  }

  /* Shared Sun Mote Sprite (Pre-rendered for zero canvas overhead) */
  const moteSprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,248,200,0.85)');
    rg.addColorStop(0.55, 'rgba(254,232,140,0.28)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 32, 32);
    return c;
  })();

  /* ═══════════════════════════════════════════════════════════════════
     SIMULATION ENGINE FACTORY
     ═══════════════════════════════════════════════════════════════════ */
  function createSimulation(container, canvasId, isMapWorld) {
    if (!container) return null;

    const canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.className = 'ambient-canvas-layer';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });

    let W = 0, H = 0, S = 1;

    function resize() {
      W = container.clientWidth || window.innerWidth;
      H = container.clientHeight || window.innerHeight;
      canvas.width = Math.round(W);
      canvas.height = Math.round(H);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      S = clamp(W / (isMapWorld ? 1800 : 1920), 0.6, 1.4);
    }

    /* Object pool for zero GC allocations on wind trail points */
    const ptPool = [];
    function allocPt(x, y, t) {
      if (ptPool.length > 0) {
        const p = ptPool.pop();
        p.x = x; p.y = y; p.t = t;
        return p;
      }
      return { x, y, t };
    }
    function freePt(p) {
      if (ptPool.length < 2000) ptPool.push(p);
    }

    function drawGustRibbon(p, baseW, widthMul, fillStyle) {
      const n = p.length;
      if (n < 4) return;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = p[i > 0 ? i - 1 : 0];
        const b = p[i < n - 1 ? i + 1 : n - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const u = i / (n - 1);
        const taper = Math.sin(Math.PI * Math.pow(u, 1.55));
        const hw = baseW * widthMul * taper * 0.5;
        const x = p[i].x + nx * hw;
        const y = p[i].y + ny * hw;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = n - 1; i >= 0; i--) {
        const a = p[i > 0 ? i - 1 : 0];
        const b = p[i < n - 1 ? i + 1 : n - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const u = i / (n - 1);
        const taper = Math.sin(Math.PI * Math.pow(u, 1.55));
        const hw = baseW * widthMul * taper * 0.5;
        ctx.lineTo(p[i].x - nx * hw, p[i].y - ny * hw);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }

    class Gust {
      constructor() {
        this.pts = [];
        this.reset(true);
      }

      reset(initial) {
        this.x = rand(0.18, 1.05) * W;
        this.y = rand(0.06, 0.94) * H;
        this.v = rand(220, 330) * S;
        this.w = rand(2.4, 4.2) * S;
        this.life = rand(2.8, 4.8);
        this.age = initial ? -rand(0, 3.5) : -rand(0.3, 2.0);
        this.time = 0;
        for (let i = 0; i < this.pts.length; i++) freePt(this.pts[i]);
        this.pts.length = 0;
        this.phase = rand(0, TAU);
        this.freq = rand(0.35, 0.7);
        this.amp = rand(0.10, 0.24);
        this.alpha = rand(0.62, 0.88);
        this.loops = Math.random() < 0.55;
        this.loopAt = this.loops ? rand(0.7, this.life - 1.9) : -99;
        this.loopDur = rand(1.25, 1.7);
        this.loopDir = Math.random() < 0.5 ? 1 : -1;
        this.trailTime = this.loops ? rand(1.0, 1.3) : rand(0.75, 1.05);
      }

      update(dt, t) {
        this.age += dt;
        if (this.age < 0) return;
        this.time += dt;

        const u = clamp((this.age - this.loopAt) / this.loopDur, 0, 1);
        const loop = smooth(u) * TAU * this.loopDir;
        const speed = this.v * (1 - 0.15 * Math.sin(Math.PI * u));
        const heading = Math.PI + flowAngle(this.x, this.y, t) +
          this.amp * Math.sin(this.age * this.freq * TAU + this.phase) + loop;

        this.x += Math.cos(heading) * speed * dt;
        this.y += Math.sin(heading) * speed * dt;
        this.pts.push(allocPt(this.x, this.y, this.time));
        while (this.pts.length && this.pts[0].t < this.time - this.trailTime) {
          freePt(this.pts.shift());
        }

        if (this.age > this.life || this.x < -200) this.reset(false);
      }

      draw() {
        if (this.age < 0 || this.pts.length < 4) return;
        const env = smooth(clamp(this.age / 0.7, 0, 1)) *
                    smooth(clamp((this.life - this.age) / 1.0, 0, 1));
        if (env <= 0.01) return;

        const a = this.alpha * env;
        drawGustRibbon(this.pts, this.w, 3.4, `rgba(206, 236, 255, ${(0.22 * a).toFixed(3)})`);
        drawGustRibbon(this.pts, this.w, 1.0, `rgba(255, 255, 255, ${a.toFixed(3)})`);
      }
    }

    class Gull {
      constructor(group, offset) {
        this.group = group;
        this.offset = offset;
        this.flapPhase = rand(0, TAU);
        this.flapFreq = rand(1.45, 1.85);
        this.amp = rand(0.3, 0.8);
        this.flapping = Math.random() < 0.6;
        this.modeTimer = rand(0.5, 3);
        this.sizeMul = rand(0.88, 1.08);
        this.wanderPhase = rand(0, TAU);
        this.x = group.x; this.y = group.y; this.heading = group.heading;
        this.size = group.size * this.sizeMul;
      }

      update(dt, t) {
        const g = this.group;
        this.modeTimer -= dt;
        if (this.modeTimer <= 0) {
          this.flapping = !this.flapping;
          this.modeTimer = this.flapping ? rand(1.6, 3.2) : rand(2.2, 4.8);
        }
        const targetAmp = this.flapping ? 0.82 : 0.07;
        this.amp = approach(this.amp, targetAmp, this.flapping ? 2.6 : 1.6, dt);
        this.flapPhase += dt * TAU * this.flapFreq * (this.flapping ? 1 : 0.55);

        const size = g.size * this.sizeMul;
        const ox = this.offset.x * g.size + Math.sin(t * 0.35 + this.wanderPhase) * 0.18 * g.size;
        const oy = this.offset.y * g.size + Math.cos(t * 0.28 + this.wanderPhase) * 0.22 * g.size;
        const c = Math.cos(g.heading), s = Math.sin(g.heading);
        this.x = g.x + ox * c - oy * s;
        this.y = g.y + ox * s + oy * c;
        this.heading = g.heading;
        this.size = size;
      }

      drawBody(shadow) {
        const L = this.size * 0.95;
        const hs = this.size * 1.25;
        const theta = this.amp * Math.sin(this.flapPhase) + 0.06;
        const span = Math.cos(theta);
        const spanInner = Math.cos(theta * 0.55);
        const fold = Math.max(0, Math.cos(this.flapPhase)) * (this.amp / 0.82);
        const downSweep = Math.max(0, -Math.cos(this.flapPhase)) * (this.amp / 0.82);
        const bank = this.group.bank;
        const lightness = 1 - 0.10 * Math.max(0, Math.sin(theta));

        for (let side = -1; side <= 1; side += 2) {
          const bankMul = 1 + side * bank;
          const sIn = side * hs * spanInner * bankMul;
          const sOut = side * hs * span * (1 - 0.30 * fold) * bankMul;
          const fwd = 0.05 * L * downSweep;
          const back = 0.24 * L * fold;

          const rootF = { x: 0.10 * L, y: side * 0.04 * L };
          const wrist = { x: 0.16 * L + fwd, y: 0.48 * sIn };
          const tip = { x: -0.30 * L - back + fwd * 0.5, y: sOut };
          const sec = { x: -0.10 * L - back * 0.3, y: 0.50 * sIn };
          const rootB = { x: -0.12 * L, y: side * 0.04 * L };

          ctx.beginPath();
          ctx.moveTo(rootF.x, rootF.y);
          ctx.quadraticCurveTo(0.20 * L + fwd, 0.25 * sIn, wrist.x, wrist.y);
          ctx.quadraticCurveTo(0.10 * L + fwd - back * 0.4, 0.80 * sOut, tip.x, tip.y);
          ctx.quadraticCurveTo(-0.12 * L - back * 0.6, 0.78 * sOut, sec.x, sec.y);
          ctx.quadraticCurveTo(-0.16 * L, 0.24 * sIn, rootB.x, rootB.y);
          ctx.closePath();
          const tx = tip.x, ty = tip.y;

          if (shadow) {
            ctx.fill();
          } else {
            const grad = ctx.createLinearGradient(0, 0, tx, ty);
            const base = Math.round(255 * lightness);
            grad.addColorStop(0, `rgb(${base},${base},${base})`);
            grad.addColorStop(0.58, `rgb(${Math.round(238 * lightness)},${Math.round(242 * lightness)},${Math.round(246 * lightness)})`);
            grad.addColorStop(0.78, '#aebccb');
            grad.addColorStop(0.84, '#2b3646');
            grad.addColorStop(1, '#1a2230');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.lineWidth = Math.max(0.6, 0.02 * L);
            ctx.strokeStyle = 'rgba(70, 92, 118, 0.35)';
            ctx.stroke();
          }
        }

        // Tail fan
        ctx.beginPath();
        ctx.moveTo(-0.28 * L, -0.065 * L);
        ctx.lineTo(-0.50 * L, -0.10 * L);
        ctx.quadraticCurveTo(-0.55 * L, 0, -0.50 * L, 0.10 * L);
        ctx.lineTo(-0.28 * L, 0.065 * L);
        ctx.closePath();
        if (!shadow) { ctx.fillStyle = '#e6ecf2'; }
        ctx.fill();
        if (!shadow) { ctx.strokeStyle = 'rgba(70, 92, 118, 0.3)'; ctx.stroke(); }

        // Body
        ctx.beginPath();
        ctx.ellipse(-0.03 * L, 0, 0.35 * L, 0.085 * L, 0, 0, TAU);
        if (!shadow) ctx.fillStyle = '#f8fafc';
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(0.32 * L, 0, 0.075 * L, 0, TAU);
        if (!shadow) ctx.fillStyle = '#ffffff';
        ctx.fill();

        if (!shadow) {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath(); ctx.arc(0.35 * L, -0.045 * L, 0.012 * L + 0.3, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(0.35 * L, 0.045 * L, 0.012 * L + 0.3, 0, TAU); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0.385 * L, -0.024 * L);
          ctx.lineTo(0.50 * L, 0);
          ctx.lineTo(0.385 * L, 0.024 * L);
          ctx.closePath();
          ctx.fillStyle = '#f5b120';
          ctx.fill();
        }
      }

      drawShadow() {
        const alt = this.group.altitude;
        ctx.save();
        ctx.translate(this.x + this.size * 0.45 * alt, this.y + this.size * 1.05 * alt);
        ctx.rotate(this.heading);
        ctx.scale(0.95, 0.95);
        ctx.fillStyle = 'rgba(4, 28, 66, 0.16)';
        ctx.strokeStyle = 'transparent';
        this.drawBody(true);
        ctx.restore();
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.heading);
        this.drawBody(false);
        ctx.restore();
      }
    }

    const FORMATIONS = {
      1: [{ x: 0, y: 0 }],
      2: [{ x: 0, y: 0 }, { x: -1.9, y: 1.7 }],
      3: [{ x: 0, y: 0 }, { x: -1.9, y: -1.8 }, { x: -2.3, y: 1.9 }]
    };

    class FlightGroup {
      constructor(count, initialX, yRange) {
        this.count = count;
        this.yRange = yRange || [0.10, 0.85];
        this.reset(initialX);
      }

      reset(initialX) {
        this.size = rand(36, 48) * S;
        this.x = initialX !== undefined ? initialX : W + rand(120, 520) * S;
        this.y = rand(this.yRange[0], this.yRange[1]) * H;
        this.speed = rand(60, 90) * S;
        this.heading = Math.PI + rand(-0.12, 0.12);
        this.turnPhase = rand(0, TAU);
        this.turnFreq = rand(0.045, 0.09);
        this.turnAmp = rand(0.16, 0.32);
        this.altitude = rand(0.75, 1.15);
        this.bank = 0;
        this.gulls = FORMATIONS[this.count].map(o => new Gull(this, o));
      }

      update(dt, t) {
        let target = Math.PI + this.turnAmp * Math.sin(t * this.turnFreq * TAU + this.turnPhase);
        const topLimit = (this.yRange[0] - 0.04) * H;
        const botLimit = (this.yRange[1] + 0.04) * H;
        if (this.y < topLimit) target -= 0.5 * (topLimit - this.y) / Math.max(1, topLimit);
        if (this.y > botLimit) target += 0.5 * (this.y - botLimit) / Math.max(1, H - botLimit);

        const prev = this.heading;
        this.heading = approach(this.heading, target, 0.7, dt);
        const omega = (this.heading - prev) / Math.max(dt, 1e-4);
        this.bank = approach(this.bank, clamp(omega * 1.6, -0.22, 0.22), 3, dt);

        let flapShare = 0;
        for (const g of this.gulls) flapShare += g.amp / 0.82;
        flapShare /= this.gulls.length;
        const v = this.speed * (0.92 + 0.16 * flapShare);

        this.x += Math.cos(this.heading) * v * dt;
        this.y += Math.sin(this.heading) * v * dt;

        if (this.x < -this.size * 6) this.reset();

        for (const g of this.gulls) g.update(dt, t);
      }
    }

    class Mote {
      constructor() { this.reset(true); }
      reset(initial) {
        this.x = initial ? rand(0, W) : W + rand(10, 120);
        this.y = rand(0.06, 0.96) * H;
        this.r = rand(1.4, 3.4) * S;
        this.v = rand(22, 52) * S;
        this.phase = rand(0, TAU);
        this.tw = rand(0.25, 0.6);
        this.sway = rand(0.25, 0.55);
      }
      update(dt, t) {
        const h = Math.PI + flowAngle(this.x, this.y, t) * 1.6 + this.sway * Math.sin(t * 0.6 + this.phase);
        this.x += Math.cos(h) * this.v * dt;
        this.y += Math.sin(h) * this.v * dt;
        if (this.x < -30 || this.y < -40 || this.y > H + 40) this.reset(false);
      }
      draw(t) {
        const a = 0.30 + 0.55 * (0.5 + 0.5 * Math.sin(t * this.tw * TAU + this.phase));
        const d = this.r * 8;
        ctx.globalAlpha = a;
        ctx.drawImage(moteSprite, this.x - d / 2, this.y - d / 2, d, d);
        ctx.globalAlpha = 1;
      }
    }

    /* Scene Setup */
    let gusts = [], groups = [], motes = [];

    function populate() {
      const area = (W * H) / (1920 * 1080);
      const gustCount = clamp(Math.round((isMapWorld ? 9 : 7) * area), 4, 11);
      gusts = Array.from({ length: gustCount }, () => new Gust());
      motes = Array.from({ length: clamp(Math.round((isMapWorld ? 18 : 15) * area), 8, 22) }, () => new Mote());

      if (isMapWorld) {
        // Map World: Gulls soar across geographical zones (Northern Gulf, Eastern Coast, Djerba/South)
        groups = [
          new FlightGroup(2, W * 0.25, [0.08, 0.28]), // Northern Mediterranean / Tunis
          new FlightGroup(1, W * 0.65, [0.28, 0.55]), // Eastern Coast / Hammamet & Sousse
          new FlightGroup(3, W * 0.42, [0.58, 0.84]), // Southern Waters / Gulf of Gabès & Djerba
          new FlightGroup(1, W * 0.85, [0.15, 0.42])  // Northwestern Coast
        ];
      } else {
        // Home Screen: Spread across the full viewport
        const layout = [1, 2, 1, 3];
        groups = layout.map((n, i) => new FlightGroup(n, W * (0.18 + i * 0.26) + rand(-60, 60)));
      }
    }

    resize();
    populate();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const oldW = W, oldH = H;
        resize();
        if (Math.abs(W - oldW) > 80 || Math.abs(H - oldH) > 80) populate();
      }, 150);
    });

    let last = performance.now();
    let elapsed = 0;

    function isVisible() {
      if (isMapWorld) {
        const wc = document.getElementById('world-camera');
        if (!wc) return false;
        return wc.style.opacity === '1' || wc.classList.contains('camera-zoom-out');
      } else {
        const hl = document.getElementById('home-ambient-layer');
        if (!hl) return false;
        return hl.style.display !== 'none' && getComputedStyle(hl).opacity !== '0';
      }
    }

    function render(now) {
      requestAnimationFrame(render);

      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // Skip render calculations when this layer is not visible
      if (!isVisible()) return;

      elapsed += dt;
      const t = elapsed;

      for (let i = 0; i < gusts.length; i++) gusts[i].update(dt, t);
      for (let i = 0; i < motes.length; i++) motes[i].update(dt, t);
      for (let i = 0; i < groups.length; i++) groups[i].update(dt, t);

      ctx.clearRect(0, 0, W, H);

      // 1. Motes
      for (let i = 0; i < motes.length; i++) motes[i].draw(t);

      // 2. Shadows (pure GPU alpha, no slow blur filter)
      for (let i = 0; i < groups.length; i++) {
        const fg = groups[i];
        for (let j = 0; j < fg.gulls.length; j++) fg.gulls[j].drawShadow();
      }

      // 3. Glowing wind gusts
      for (let i = 0; i < gusts.length; i++) gusts[i].draw();

      // 4. White seagulls on top
      for (let i = 0; i < groups.length; i++) {
        const fg = groups[i];
        for (let j = 0; j < fg.gulls.length; j++) fg.gulls[j].draw();
      }
    }

    requestAnimationFrame((now) => { last = now; render(now); });
    return { canvas, resize };
  }

  /* Initialize both layers:
     - Home Screen Layer: on #home-ambient-layer (active on home screen)
     - Map World Layer:   INSIDE #map-world-content (active on interactive map)
  */
  const homeLayer = document.getElementById('home-ambient-layer');
  const mapWorldContent = document.getElementById('map-world-content');

  if (homeLayer) {
    createSimulation(homeLayer, 'home-ambient-canvas', false);
  }
  if (mapWorldContent) {
    createSimulation(mapWorldContent, 'map-ambient-canvas', true);
  }
})();
