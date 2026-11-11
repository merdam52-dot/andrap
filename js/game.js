(() => {
  "use strict";

  const BEST_KEY = "presa_best_v2";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hud = document.getElementById("hud");
  const timerEl = document.getElementById("timer");
  const hungerBar = document.getElementById("hunger-bar");
  const noiseBar = document.getElementById("noise-bar");
  const screenMenu = document.getElementById("screen-menu");
  const screenDeath = document.getElementById("screen-death");
  const deathCauseEl = document.getElementById("death-cause");
  const finalTimeEl = document.getElementById("final-time");
  const bestTimeEl = document.getElementById("best-time");
  const btnPlay = document.getElementById("btn-play");
  const btnRetry = document.getElementById("btn-retry");

  const state = {
    mode: "menu", // menu | play | dying | death
    w: 0,
    h: 0,
    dpr: 1,
    player: {
      x: 0,
      y: 0,
      r: 10,
      tx: 0,
      ty: 0,
      dragging: false,
      hunger: 1,
      noise: 0,
      speed: 0,
    },
    loot: [],
    infected: [],
    ruins: [],
    elapsed: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    shake: 0,
    flash: 0,
    heartbeat: 0,
    deathT: 0,
    deathCause: "Você não voltou",
    vision: 118,
    lastLootPulse: 0,
    tensionNear: 0,
    raf: 0,
    lastTs: 0,
  };

  let audioCtx = null;
  let ambience = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep({ freq = 180, dur = 0.12, type = "sine", gain = 0.04, slide = 0 }) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    }
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function startAmbience() {
    if (!audioCtx || ambience) return;
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 280;
    const g = audioCtx.createGain();
    g.gain.value = 0.012;
    src.connect(filter);
    filter.connect(g);
    g.connect(audioCtx.destination);
    src.start();
    ambience = { src, g, filter };
  }

  function stopAmbience() {
    if (!ambience) return;
    try {
      ambience.src.stop();
    } catch (_) {}
    ambience = null;
  }

  function haptic(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
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
    state.vision = Math.min(state.w, state.h) * 0.28;
  }

  function showScreen(which) {
    screenMenu.hidden = which !== "menu";
    screenDeath.hidden = which !== "death";
    screenMenu.classList.toggle("active", which === "menu");
    screenDeath.classList.toggle("active", which === "death");
    hud.hidden = which !== "play";
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function placeAway(fromX, fromY, minDist) {
    let x;
    let y;
    let tries = 0;
    do {
      x = rand(40, state.w - 40);
      y = rand(80, state.h - 80);
      tries++;
    } while (Math.hypot(x - fromX, y - fromY) < minDist && tries < 40);
    return { x, y };
  }

  function buildRuins() {
    state.ruins = [];
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const p = placeAway(state.w * 0.5, state.h * 0.55, 60);
      state.ruins.push({
        x: p.x,
        y: p.y,
        w: rand(28, 70),
        h: rand(18, 42),
        rot: rand(-0.2, 0.2),
      });
    }
  }

  function spawnLoot(count) {
    for (let i = 0; i < count; i++) {
      const p = placeAway(state.player.x, state.player.y, 90);
      state.loot.push({
        x: p.x,
        y: p.y,
        kind: Math.random() < 0.72 ? "food" : "med",
        taken: false,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  function spawnInfected(count) {
    for (let i = 0; i < count; i++) {
      const p = placeAway(state.player.x, state.player.y, 160);
      state.infected.push({
        x: p.x,
        y: p.y,
        r: 11,
        vx: 0,
        vy: 0,
        alert: 0,
        wanderT: rand(0, 4),
        wanderAngle: rand(0, Math.PI * 2),
        speedWalk: rand(18, 28),
        speedChase: rand(42, 58),
      });
    }
  }

  function startGame() {
    ensureAudio();
    startAmbience();
    state.mode = "play";
    state.elapsed = 0;
    state.shake = 0;
    state.flash = 0;
    state.heartbeat = 0;
    state.deathT = 0;
    state.tensionNear = 0;
    state.loot = [];
    state.infected = [];

    const p = state.player;
    p.x = state.w * 0.5;
    p.y = state.h * 0.58;
    p.tx = p.x;
    p.ty = p.y;
    p.dragging = false;
    p.hunger = 1;
    p.noise = 0;
    p.speed = 0;
    p.r = Math.max(9, Math.min(12, state.w * 0.028));

    buildRuins();
    spawnLoot(5);
    spawnInfected(2);

    showScreen("play");
    timerEl.textContent = "0:00";
    updateVitalsUI();
    beep({ freq: 110, dur: 0.25, type: "sine", gain: 0.03, slide: -40 });
  }

  function updateVitalsUI() {
    const h = Math.max(0, Math.min(1, state.player.hunger));
    const n = Math.max(0, Math.min(1, state.player.noise));
    hungerBar.style.transform = `scaleX(${h})`;
    noiseBar.style.transform = `scaleX(${n})`;
    hungerBar.classList.toggle("critical", h < 0.28);
  }

  function kill(cause) {
    if (state.mode !== "play") return;
    state.mode = "dying";
    state.deathCause = cause;
    state.deathT = 0;
    state.shake = 14;
    state.flash = 0.85;
    haptic([50, 40, 90]);
    beep({ freq: 90, dur: 0.28, type: "sawtooth", gain: 0.05, slide: -55 });
    setTimeout(() => beep({ freq: 55, dur: 0.5, type: "sine", gain: 0.04, slide: -20 }), 120);
  }

  function finishDeath() {
    const score = state.elapsed;
    if (score > state.best) {
      state.best = score;
      localStorage.setItem(BEST_KEY, String(score));
    }
    deathCauseEl.textContent = state.deathCause;
    finalTimeEl.textContent = formatTime(score);
    bestTimeEl.textContent = formatTime(state.best);
    state.mode = "death";
    stopAmbience();
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

  function nearestInfectedDist() {
    let best = Infinity;
    for (const z of state.infected) {
      const d = Math.hypot(z.x - state.player.x, z.y - state.player.y);
      if (d < best) best = d;
    }
    return best;
  }

  function updatePlayer(dt) {
    const p = state.player;
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);

    // Deliberate walk — not twitch. Cap speed; drag distance = intent, not teleport.
    const maxSpeed = 78;
    let vx = 0;
    let vy = 0;
    if (p.dragging && dist > 6) {
      const intent = Math.min(1, dist / 120);
      const speed = maxSpeed * (0.35 + intent * 0.65);
      vx = (dx / dist) * speed;
      vy = (dy / dist) * speed;
    }

    p.x += vx * dt;
    p.y += vy * dt;
    p.x = Math.max(p.r + 8, Math.min(state.w - p.r - 8, p.x));
    p.y = Math.max(p.r + 40, Math.min(state.h - p.r - 56, p.y));
    p.speed = Math.hypot(vx, vy);

    // Noise from movement; stillness lets you vanish.
    if (p.speed > 8) {
      p.noise = Math.min(1, p.noise + dt * (0.18 + p.speed / 140));
    } else {
      p.noise = Math.max(0, p.noise - dt * 0.35);
    }

    // Hunger always drains — scarcity clock.
    const drain = 0.028 + state.elapsed * 0.00055;
    p.hunger = Math.max(0, p.hunger - drain * dt);
    if (p.hunger <= 0) {
      kill("Morreu de fome");
      return;
    }

    // Loot pickup
    for (const item of state.loot) {
      if (item.taken) continue;
      if (Math.hypot(item.x - p.x, item.y - p.y) < p.r + 14) {
        item.taken = true;
        if (item.kind === "food") {
          p.hunger = Math.min(1, p.hunger + 0.34);
          beep({ freq: 240, dur: 0.08, type: "triangle", gain: 0.035 });
          haptic(12);
        } else {
          p.hunger = Math.min(1, p.hunger + 0.12);
          // Meds also quiet nerves slightly
          p.noise = Math.max(0, p.noise - 0.25);
          beep({ freq: 320, dur: 0.1, type: "sine", gain: 0.03 });
          haptic(18);
        }
      }
    }
  }

  function updateInfected(dt) {
    const p = state.player;
    let near = 0;

    for (const z of state.infected) {
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Hearing radius grows with player noise and late-game pressure.
      const hearRange = 70 + p.noise * 160 + Math.min(80, state.elapsed * 2.2);
      const seeRange = 55 + Math.min(40, state.elapsed * 1.1);

      const canHear = dist < hearRange && p.noise > 0.18;
      const canSee = dist < seeRange;

      if (canHear || canSee) {
        z.alert = Math.min(1, z.alert + dt * 1.4);
      } else {
        z.alert = Math.max(0, z.alert - dt * 0.45);
      }

      if (z.alert > 0.35) {
        // Slow, relentless chase — DayZ shambler, not bullet hell.
        const spd = z.speedChase * (0.7 + z.alert * 0.4);
        z.vx = (dx / dist) * spd;
        z.vy = (dy / dist) * spd;
        if (dist < 130) near = Math.max(near, 1 - dist / 130);
      } else {
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = rand(2.2, 5);
          z.wanderAngle = rand(0, Math.PI * 2);
        }
        z.vx = Math.cos(z.wanderAngle) * z.speedWalk;
        z.vy = Math.sin(z.wanderAngle) * z.speedWalk;
      }

      z.x += z.vx * dt;
      z.y += z.vy * dt;
      z.x = Math.max(12, Math.min(state.w - 12, z.x));
      z.y = Math.max(48, Math.min(state.h - 48, z.y));

      if (dist < p.r + z.r * 0.85) {
        kill("Pegaram você");
        return;
      }
    }

    state.tensionNear = near;

    // Rising pressure: more infected over time (scarce map gets meaner)
    const targetCount = 2 + Math.floor(state.elapsed / 28);
    if (state.infected.length < Math.min(6, targetCount)) {
      spawnInfected(1);
      beep({ freq: 70, dur: 0.4, type: "sine", gain: 0.02, slide: -15 });
    }

    // Sparse loot refresh far away
    const aliveLoot = state.loot.filter((l) => !l.taken).length;
    if (aliveLoot < 2 && state.elapsed - state.lastLootPulse > 12) {
      state.lastLootPulse = state.elapsed;
      spawnLoot(1);
    }
  }

  function update(dt) {
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 36);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.4);
    state.heartbeat += dt;

    if (state.mode === "dying") {
      state.deathT += dt;
      if (state.deathT > 0.7) finishDeath();
      return;
    }

    if (state.mode !== "play") return;

    state.elapsed += dt;
    const stamp = formatTime(state.elapsed);
    if (timerEl.textContent !== stamp) timerEl.textContent = stamp;

    updatePlayer(dt);
    if (state.mode !== "play") return;
    updateInfected(dt);
    updateVitalsUI();

    // Heartbeat when hungry or threat close
    const pulseNeed =
      state.player.hunger < 0.3 || state.tensionNear > 0.35 || state.player.noise > 0.7;
    if (pulseNeed && Math.sin(state.heartbeat * (2.2 + state.tensionNear * 3)) > 0.97) {
      beep({
        freq: 48 + state.tensionNear * 30,
        dur: 0.06,
        type: "sine",
        gain: 0.025 + state.tensionNear * 0.02,
      });
    }

    if (ambience) {
      const threat = Math.max(state.tensionNear, state.player.noise * 0.4);
      ambience.g.gain.value = 0.01 + threat * 0.03;
      ambience.filter.frequency.value = 240 + threat * 420;
    }
  }

  function inVision(x, y) {
    const d = Math.hypot(x - state.player.x, y - state.player.y);
    // Vision shrinks when starving or panicked by noise
    const v =
      state.vision *
      (0.78 + state.player.hunger * 0.22) *
      (1 - state.player.noise * 0.12);
    return d < v;
  }

  function drawWorld() {
    const { w, h, player: p } = state;

    // Mud ground
    ctx.fillStyle = "#10110d";
    ctx.fillRect(-30, -30, w + 60, h + 60);

    const ground = ctx.createRadialGradient(p.x, p.y, 20, p.x, p.y, Math.max(w, h) * 0.7);
    ground.addColorStop(0, "#1a1c14");
    ground.addColorStop(1, "#0c0d0a");
    ctx.fillStyle = ground;
    ctx.fillRect(-30, -30, w + 60, h + 60);

    // Faint terrain strokes
    ctx.strokeStyle = "rgba(106, 110, 90, 0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = ((i + 1) / 9) * h;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(i * 1.7) * 8);
      ctx.lineTo(w, y + Math.cos(i * 1.1) * 10);
      ctx.stroke();
    }

    // Ruins — only visible in radius (exploration)
    for (const r of state.ruins) {
      if (!inVision(r.x, r.y) && state.mode === "play") continue;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rot);
      ctx.globalAlpha = state.mode === "play" ? 0.55 : 0.2;
      ctx.fillStyle = "#2a2d24";
      ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.strokeStyle = "rgba(168, 74, 46, 0.15)";
      ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }

    // Loot — scarce glints
    for (const item of state.loot) {
      if (item.taken) continue;
      if (!inVision(item.x, item.y) && state.mode === "play") continue;
      item.pulse += 0.04;
      const glow = 0.45 + Math.sin(item.pulse) * 0.2;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle =
        item.kind === "food"
          ? `rgba(196, 163, 90, ${glow})`
          : `rgba(138, 154, 110, ${glow})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(item.x, item.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle =
        item.kind === "food"
          ? "rgba(196, 163, 90, 0.2)"
          : "rgba(138, 154, 110, 0.2)";
      ctx.stroke();
    }

    // Infected
    for (const z of state.infected) {
      const visible =
        state.mode !== "play" || inVision(z.x, z.y) || z.alert > 0.5;
      if (!visible) continue;

      const alpha = state.mode === "play" ? (inVision(z.x, z.y) ? 0.95 : 0.45) : 0.25;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(z.x, z.y);

      // Shambling body
      ctx.beginPath();
      ctx.ellipse(0, 2, z.r * 0.7, z.r * 1.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = z.alert > 0.35 ? "#5c2416" : "#3a3d32";
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(0, -z.r * 0.55, z.r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = "#2e3028";
      ctx.fill();

      if (z.alert > 0.35) {
        ctx.beginPath();
        ctx.arc(-2, -z.r * 0.55, 1.4, 0, Math.PI * 2);
        ctx.arc(2, -z.r * 0.55, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "#a84a2e";
        ctx.fill();
      }
      ctx.restore();
    }

    // Player
    if (state.mode === "play" || state.mode === "dying") {
      const dying = state.mode === "dying";
      const alpha = dying ? Math.max(0, 1 - state.deathT * 1.4) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);

      // Soft body glow (your only warmth)
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(216, 210, 196, 0.06)";
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(0, 1, p.r * 0.65, p.r * 1.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#d8d2c4";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -p.r * 0.55, p.r * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Stillness ring when quiet
      if (p.noise < 0.15 && p.dragging === false) {
        ctx.beginPath();
        ctx.arc(0, 0, p.r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(138, 154, 110, 0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawFog() {
    if (state.mode !== "play" && state.mode !== "dying") return;
    const p = state.player;
    const v =
      state.vision *
      (0.78 + p.hunger * 0.22) *
      (1 - p.noise * 0.12) *
      (state.mode === "dying" ? 1 + state.deathT * 0.5 : 1);

    // Darkness outside vision — vulnerability
    ctx.save();
    ctx.fillStyle = "rgba(8, 9, 7, 0.92)";
    ctx.beginPath();
    ctx.rect(-40, -40, state.w + 80, state.h + 80);
    ctx.arc(p.x, p.y, v, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    // Soft vignette edge
    const edge = ctx.createRadialGradient(p.x, p.y, v * 0.55, p.x, p.y, v);
    edge.addColorStop(0, "rgba(8, 9, 7, 0)");
    edge.addColorStop(1, "rgba(8, 9, 7, 0.55)");
    ctx.beginPath();
    ctx.arc(p.x, p.y, v, 0, Math.PI * 2);
    ctx.fillStyle = edge;
    ctx.fill();
    ctx.restore();
  }

  function drawMenuAtmosphere() {
    const t = performance.now() / 1000;
    for (let i = 0; i < 4; i++) {
      const a = t * 0.15 + i * 1.6;
      const x = state.w * 0.5 + Math.cos(a) * (state.w * 0.22 + i * 10);
      const y = state.h * 0.48 + Math.sin(a * 0.9) * (state.h * 0.1);
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(58, 61, 50, 0.35)";
      ctx.fill();
    }
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

    if (state.mode === "menu") {
      ctx.fillStyle = "#0c0d0a";
      ctx.fillRect(-20, -20, w + 40, h + 40);
      drawMenuAtmosphere();
    } else if (state.mode === "death") {
      // Frozen aftermath under the death beat — no live fog/HUD competition
      ctx.fillStyle = "#0c0d0a";
      ctx.fillRect(-20, -20, w + 40, h + 40);
      drawWorld();
      ctx.fillStyle = "rgba(8, 9, 7, 0.55)";
      ctx.fillRect(-20, -20, w + 40, h + 40);
    } else {
      drawWorld();
      drawFog();
    }

    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(232, 226, 212, ${state.flash * 0.4})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(168, 74, 46, ${state.flash * 0.22})`;
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

  btnPlay.addEventListener("click", startGame);
  btnRetry.addEventListener("click", startGame);

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: false });
  window.addEventListener("pointercancel", onPointerUp, { passive: false });
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp, { passive: false });

  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === "Enter") {
      if (state.mode === "menu" || state.mode === "death") {
        e.preventDefault();
        startGame();
      }
    }
  });

  resize();
  showScreen("menu");
  bestTimeEl.textContent = formatTime(state.best);
  state.raf = requestAnimationFrame(loop);
})();
