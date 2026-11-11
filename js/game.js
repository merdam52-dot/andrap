(() => {
  "use strict";

  const BEST_KEY = "presa_best";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hud = document.getElementById("hud");
  const timerEl = document.getElementById("timer");
  const screenMenu = document.getElementById("screen-menu");
  const screenDeath = document.getElementById("screen-death");
  const finalTimeEl = document.getElementById("final-time");
  const bestTimeEl = document.getElementById("best-time");
  const btnPlay = document.getElementById("btn-play");
  const btnRetry = document.getElementById("btn-retry");

  const state = {
    mode: "menu", // menu | play | dying | death
    w: 0,
    h: 0,
    dpr: 1,
    player: { x: 0, y: 0, r: 14, tx: 0, ty: 0, dragging: false },
    threats: [],
    elapsed: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    shake: 0,
    flash: 0,
    lastSpawn: 0,
    spawnInterval: 1.05,
    deathT: 0,
    raf: 0,
    lastTs: 0,
  };

  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep({ freq = 180, dur = 0.12, type = "square", gain = 0.05, slide = 0 }) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function haptic(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    state.dpr = dpr;
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.floor(state.w * dpr);
    canvas.height = Math.floor(state.h * dpr);
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function showScreen(which) {
    screenMenu.hidden = which !== "menu";
    screenDeath.hidden = which !== "death";
    screenMenu.classList.toggle("active", which === "menu");
    screenDeath.classList.toggle("active", which === "death");
    hud.hidden = which !== "play";
  }

  function resetPlayer() {
    const p = state.player;
    p.x = state.w * 0.5;
    p.y = state.h * 0.55;
    p.tx = p.x;
    p.ty = p.y;
    p.dragging = false;
    p.r = Math.max(12, Math.min(16, state.w * 0.035));
  }

  function startGame() {
    ensureAudio();
    state.mode = "play";
    state.threats = [];
    state.elapsed = 0;
    state.lastSpawn = 0;
    state.spawnInterval = 1.05;
    state.shake = 0;
    state.flash = 0;
    state.deathT = 0;
    resetPlayer();
    showScreen("play");
    timerEl.textContent = "0.0";
    beep({ freq: 220, dur: 0.08, type: "triangle", gain: 0.04 });
  }

  function edgePoint() {
    const side = Math.floor(Math.random() * 4);
    const m = 24;
    if (side === 0) return { x: Math.random() * state.w, y: -m };
    if (side === 1) return { x: state.w + m, y: Math.random() * state.h };
    if (side === 2) return { x: Math.random() * state.w, y: state.h + m };
    return { x: -m, y: Math.random() * state.h };
  }

  function spawnThreat() {
    const start = edgePoint();
    const targetBias = 0.55 + Math.random() * 0.35;
    const aimX = state.player.x + (Math.random() - 0.5) * 80;
    const aimY = state.player.y + (Math.random() - 0.5) * 80;
    const dx = aimX - start.x;
    const dy = aimY - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const speedBase = 95 + state.elapsed * 9 + Math.random() * 40;
    const r = 7 + Math.random() * 10 + Math.min(6, state.elapsed * 0.15);
    const rot = Math.random() * Math.PI * 2;
    state.threats.push({
      x: start.x,
      y: start.y,
      vx: (dx / len) * speedBase * targetBias,
      vy: (dy / len) * speedBase * targetBias,
      r,
      rot,
      spin: (Math.random() - 0.5) * 6,
      age: 0,
      born: 0,
    });
  }

  function difficultyTick() {
    // Spawn cadence tightens; occasional burst for pressure spikes
    const t = state.elapsed;
    state.spawnInterval = Math.max(0.28, 1.05 - t * 0.035);
    if (t - state.lastSpawn >= state.spawnInterval) {
      state.lastSpawn = t;
      spawnThreat();
      if (Math.random() < Math.min(0.45, 0.08 + t * 0.012)) spawnThreat();
      beep({ freq: 90 + Math.random() * 40, dur: 0.05, type: "sawtooth", gain: 0.018, slide: -30 });
    }
  }

  function kill() {
    if (state.mode !== "play") return;
    state.mode = "dying";
    state.deathT = 0;
    state.shake = 18;
    state.flash = 1;
    haptic([40, 30, 80]);
    beep({ freq: 140, dur: 0.18, type: "square", gain: 0.07, slide: -100 });
    setTimeout(() => beep({ freq: 70, dur: 0.35, type: "sawtooth", gain: 0.05, slide: -40 }), 90);
  }

  function finishDeath() {
    const score = state.elapsed;
    if (score > state.best) {
      state.best = score;
      localStorage.setItem(BEST_KEY, String(score));
    }
    finalTimeEl.textContent = score.toFixed(1);
    bestTimeEl.textContent = state.best.toFixed(1);
    state.mode = "death";
    showScreen("death");
  }

  function pointerPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function onPointerDown(e) {
    if (state.mode !== "play") return;
    e.preventDefault();
    const { x, y } = pointerPos(e);
    state.player.dragging = true;
    state.player.tx = x;
    state.player.ty = y;
  }

  function onPointerMove(e) {
    if (state.mode !== "play" || !state.player.dragging) return;
    e.preventDefault();
    const { x, y } = pointerPos(e);
    state.player.tx = x;
    state.player.ty = y;
  }

  function onPointerUp(e) {
    if (state.mode !== "play") return;
    e.preventDefault();
    state.player.dragging = false;
  }

  function update(dt) {
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 42);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 3.2);

    if (state.mode === "dying") {
      state.deathT += dt;
      // Death beat: brief freeze + shake, then reveal
      if (state.deathT > 0.55) finishDeath();
      return;
    }

    if (state.mode !== "play") return;

    state.elapsed += dt;
    const display = state.elapsed.toFixed(1);
    if (timerEl.textContent !== display) {
      timerEl.textContent = display;
      if (Math.floor(state.elapsed) !== Math.floor(state.elapsed - dt)) {
        hud.classList.add("pulse");
        setTimeout(() => hud.classList.remove("pulse"), 120);
      }
    }

    const p = state.player;
    // Soft follow for tactile drag feel
    const follow = 1 - Math.pow(0.001, dt);
    p.x += (p.tx - p.x) * Math.min(1, follow * 14);
    p.y += (p.ty - p.y) * Math.min(1, follow * 14);
    p.x = Math.max(p.r, Math.min(state.w - p.r, p.x));
    p.y = Math.max(p.r, Math.min(state.h - p.r, p.y));

    difficultyTick();

    for (let i = state.threats.length - 1; i >= 0; i--) {
      const th = state.threats[i];
      th.age += dt;
      th.born = Math.min(1, th.age / 0.22); // spawn tension scale-in
      th.x += th.vx * dt;
      th.y += th.vy * dt;
      th.rot += th.spin * dt;

      // Slight homing late-game for rising pressure
      if (state.elapsed > 8) {
        const hx = p.x - th.x;
        const hy = p.y - th.y;
        const hl = Math.hypot(hx, hy) || 1;
        const home = Math.min(35, (state.elapsed - 8) * 1.8);
        th.vx += (hx / hl) * home * dt;
        th.vy += (hy / hl) * home * dt;
      }

      const hitR = p.r + th.r * 0.72;
      if (Math.hypot(th.x - p.x, th.y - p.y) < hitR) {
        kill();
        return;
      }

      // Cull far offscreen
      if (
        th.x < -80 ||
        th.x > state.w + 80 ||
        th.y < -80 ||
        th.y > state.h + 80
      ) {
        state.threats.splice(i, 1);
      }
    }
  }

  function drawShard(th) {
    const s = 0.35 + 0.65 * th.born;
    const r = th.r * s;
    ctx.save();
    ctx.translate(th.x, th.y);
    ctx.rotate(th.rot);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.35);
    ctx.lineTo(r * 0.95, r * 0.7);
    ctx.lineTo(-r * 0.85, r * 0.85);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#e85a3a");
    g.addColorStop(1, "#7a1f12");
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.25 + 0.75 * th.born;
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const { w, h } = state;
    let ox = 0;
    let oy = 0;
    if (state.shake > 0) {
      ox = (Math.random() - 0.5) * state.shake;
      oy = (Math.random() - 0.5) * state.shake;
    }

    ctx.save();
    ctx.translate(ox, oy);

    // Atmosphere
    ctx.fillStyle = "#0a0908";
    ctx.fillRect(-20, -20, w + 40, h + 40);

    const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, "#14110e");
    vg.addColorStop(1, "#0a0908");
    ctx.fillStyle = vg;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // Soft arena ring during play
    if (state.mode === "play" || state.mode === "dying") {
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.55, Math.min(w, h) * 0.38, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(242, 235, 224, 0.04)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const th of state.threats) drawShard(th);

    // Player
    if (state.mode === "play" || state.mode === "dying") {
      const p = state.player;
      const dying = state.mode === "dying";
      const pr = dying ? p.r * (1 + state.deathT * 0.8) : p.r;
      const alpha = dying ? Math.max(0, 1 - state.deathT * 1.6) : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(242, 235, 224, 0.07)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
      ctx.fillStyle = "#f2ebe0";
      ctx.fill();

      if (p.dragging && !dying) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(242, 235, 224, 0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Menu ambient floating shards
    if (state.mode === "menu") {
      const t = performance.now() / 1000;
      for (let i = 0; i < 5; i++) {
        const a = t * (0.2 + i * 0.05) + i * 1.7;
        const x = w * 0.5 + Math.cos(a) * (w * 0.28 + i * 8);
        const y = h * 0.42 + Math.sin(a * 1.3) * (h * 0.12 + i * 6);
        drawShard({
          x,
          y,
          r: 5 + i,
          rot: a,
          born: 0.35 + (i % 3) * 0.1,
        });
      }
    }

    ctx.restore();

    // Hit flash
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(246, 240, 228, ${state.flash * 0.55})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(196, 60, 34, ${state.flash * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function loop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    let dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    dt = Math.min(0.033, dt);
    update(dt);
    draw();
    state.raf = requestAnimationFrame(loop);
  }

  // Bindings
  btnPlay.addEventListener("click", startGame);
  btnRetry.addEventListener("click", startGame);

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: false });
  window.addEventListener("pointercancel", onPointerUp, { passive: false });

  // Touch fallbacks for older browsers
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp, { passive: false });

  window.addEventListener("resize", () => {
    resize();
    if (state.mode === "menu") resetPlayer();
  });

  // Keyboard helper for desktop testing: Space to start / restart
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === "Enter") {
      if (state.mode === "menu" || state.mode === "death") {
        e.preventDefault();
        startGame();
      }
    }
  });

  resize();
  resetPlayer();
  showScreen("menu");
  bestTimeEl.textContent = state.best.toFixed(1);
  state.raf = requestAnimationFrame(loop);
})();
