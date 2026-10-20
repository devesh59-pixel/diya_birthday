'use strict';

// ==========================================================================
// Canvas & Context Setup
// ==========================================================================
const spaceCanvas = document.getElementById('space');
const ctx = spaceCanvas.getContext('2d');
const fxCanvas = document.getElementById('effects');
const fx = fxCanvas.getContext('2d');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let isPaused = reducedMotion.matches;
let width = window.innerWidth;
let height = window.innerHeight;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

let time = 0;
let lastTime = 0;
let animationFrameId = 0;

let stars = [];
let dust = [];
let sparks = [];
let shootingStars = [];
let cursorTrail = [];
let pointer = { x: width * 0.5, y: height * 0.5, active: false };

// Web Audio API State
let audioCtx = null;
let soundEnabled = false;
let ambientInterval = null;

// ==========================================================================
// Resize Handler & Particle Initialization
// ==========================================================================
function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  for (const c of [spaceCanvas, fxCanvas]) {
    c.width = width * dpr;
    c.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Re-populate stars
  const starCount = Math.min(220, Math.round((width * height) / 5000));
  stars = Array.from({ length: starCount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.1 + 0.2,
    p: Math.random() * Math.PI * 2
  }));

  // Re-populate stardust
  const dustCount = width < 600 ? 90 : 160;
  dust = Array.from({ length: dustCount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    p: Math.random() * Math.PI * 2,
    size: Math.random() * 1.4 + 0.4
  }));

  if (isPaused) render(0);
}

// Glow utility
function drawGlow(c, x, y, r, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

// ==========================================================================
// Main Canvas Render Loop
// ==========================================================================
function render(dt) {
  ctx.clearRect(0, 0, width, height);
  fx.clearRect(0, 0, width, height);
  time += dt;
  const t = time * 0.00015;

  ctx.globalCompositeOperation = 'screen';
  drawGlow(ctx, width * 0.5, height * 0.52, width * 0.45, 'rgba(71, 20, 106, 0.16)');

  // 1. Orbital Silk Ribbons
  for (let j = 0; j < 22; j++) {
    ctx.beginPath();
    const phase = j * 0.018;
    for (let i = 0; i <= 140; i++) {
      const a = (i / 140) * Math.PI * 2;
      const rx = width * (width < 600 ? 0.65 : 0.42);
      const ry = height * 0.25;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      const twist = -0.32 + 0.1 * Math.sin(t);
      let px = width * 0.5 + x * Math.cos(twist) - y * Math.sin(twist);
      let py = height * 0.5 + x * Math.sin(twist) + y * Math.cos(twist);

      px += Math.sin(a * 3 + t + phase * 8) * (18 + j * 1.6);
      py += Math.cos(a * 2 - t + phase * 6) * (16 + j * 1.3);

      if (pointer.active) {
        const dx = px - pointer.x;
        const dy = py - pointer.y;
        const dist = Math.hypot(dx, dy);
        const pull = Math.exp(-dist / 220) * 0.16;
        px -= dx * pull;
        py -= dy * pull;
      }

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `hsla(${255 + j * 2.8 + Math.sin(t) * 15}, 80%, ${60 + j * 0.8}%, ${0.03 + Math.sin((j / 22) * Math.PI) * 0.05})`;
    ctx.lineWidth = j % 6 === 0 ? 1.2 : 0.6;
    ctx.stroke();
  }

  // 2. Stars
  for (const s of stars) {
    ctx.globalAlpha = 0.25 + (Math.sin(t * 4 + s.p) + 1) * 0.25;
    ctx.fillStyle = '#e5d7ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();

    // Cross flare for brighter stars
    if (s.r > 1.2) {
      ctx.fillRect(s.x - 3.5, s.y - 0.3, 7, 0.6);
      ctx.fillRect(s.x - 0.3, s.y - 3.5, 0.6, 7);
    }
  }
  ctx.globalAlpha = 1;

  // 3. Stardust particles (reacting to pointer)
  for (const p of dust) {
    if (dt) {
      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180) {
          const force = (180 - dist) / 180;
          p.vx += (dx / (dist || 1)) * force * 0.16;
          p.vy += (dy / (dist || 1)) * force * 0.16;
        }
      }
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.x += (Math.cos(t * 2 + p.p) * 0.22 + p.vx) * (dt / 16);
      p.y += (Math.sin(t + p.p) * 0.25 + p.vy) * (dt / 16);

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;
    }
    ctx.fillStyle = '#d4b5ff';
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 4. Cursor Trail
  if (cursorTrail.length > 1) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      cursorTrail.forEach((p, i) => {
        const x = p.x + Math.sin(i * 0.4 + t * 9 + k) * k * 7;
        const y = p.y + Math.cos(i * 0.3 + t * 8 + k) * k * 7;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = ['rgba(228, 199, 255, 0.55)', 'rgba(158, 218, 255, 0.35)', 'rgba(255, 182, 220, 0.3)'][k];
      ctx.lineWidth = 2 - k * 0.6;
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#d19aff';
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  if (dt) {
    cursorTrail = cursorTrail.filter(p => {
      p.life -= dt;
      return p.life > 0;
    });
  }

  // 5. Shooting Stars (From custom wishes)
  for (const s of shootingStars) {
    if (dt) {
      s.life -= dt;
      s.x += s.vx * (dt / 16);
      s.y += s.vy * (dt / 16);
    }
    const alpha = Math.max(0, s.life / s.max);
    ctx.strokeStyle = `rgba(255, 230, 180, ${alpha * 0.8})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 7, s.y - s.vy * 7);
    ctx.stroke();

    // Glowing head
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  shootingStars = shootingStars.filter(s => s.life > 0);

  // 6. Celebration Sparks / Fireworks on Effects Canvas
  ctx.globalCompositeOperation = 'source-over';
  fx.globalCompositeOperation = 'screen';
  for (const p of sparks) {
    if (dt) {
      p.life -= dt;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.vy += 0.012; // Gravity
    }
    const alpha = Math.max(0, p.life / p.max);
    fx.globalAlpha = alpha;
    fx.fillStyle = p.color;
    fx.beginPath();
    fx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    fx.fill();
  }
  sparks = sparks.filter(p => p.life > 0);
  fx.globalAlpha = 1;
  fx.globalCompositeOperation = 'source-over';
}

function loop(ts) {
  if (isPaused || document.hidden) {
    animationFrameId = 0;
    return;
  }
  const dt = Math.min(ts - (lastTime || ts), 35);
  lastTime = ts;
  render(dt);
  animationFrameId = requestAnimationFrame(loop);
}

function startLoop() {
  lastTime = 0;
  if (!animationFrameId && !isPaused) {
    animationFrameId = requestAnimationFrame(loop);
  }
}

// Particle Burst Utility
function burst(x, y, count = 160) {
  if (isPaused) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 6 + 0.7;
    const life = 1000 + Math.random() * 1800;
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      r: 0.8 + Math.random() * 2,
      color: ['#eacbff', '#b3dcff', '#ffb8d3', '#ffe8b3', '#ffd277'][i % 5]
    });
  }
  sparks = sparks.slice(-850);
}

// Shooting star spawn
function launchShootingStar(startX, startY) {
  const angle = -Math.PI * 0.25 + (Math.random() - 0.5) * 0.4;
  const speed = 9 + Math.random() * 4;
  shootingStars.push({
    x: startX || width * 0.3 + Math.random() * (width * 0.4),
    y: startY || height * 0.7,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1400,
    max: 1400
  });
}

// ==========================================================================
// Pointer & Motion Events
// ==========================================================================
addEventListener('pointermove', e => {
  pointer = { x: e.clientX, y: e.clientY, active: true };
  if (!isPaused) {
    cursorTrail.push({ x: e.clientX, y: e.clientY, life: 550 });
    cursorTrail = cursorTrail.slice(-35);
    burst(e.clientX, e.clientY, 2);

    // 3D Tilt on main title
    const title = document.getElementById('title');
    if (title) {
      title.style.transform = `rotateY(${(e.clientX / width - 0.5) * 6}deg) rotateX(${-(e.clientY / height - 0.5) * 5}deg)`;
    }
  }
}, { passive: true });

addEventListener('pointerout', e => {
  if (!e.relatedTarget) pointer.active = false;
});

addEventListener('pointerdown', e => {
  burst(e.clientX, e.clientY, 40);
}, { passive: true });

addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) startLoop();
});

// Pause / Resume motion button
const motionBtn = document.getElementById('motion');
function updateMotion() {
  motionBtn.textContent = isPaused ? 'Resume motion' : 'Pause motion';
  motionBtn.setAttribute('aria-pressed', String(isPaused));
  document.querySelector('.atmosphere').style.animationPlayState = isPaused ? 'paused' : 'running';

  if (isPaused) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    cursorTrail = [];
    sparks = [];
    const title = document.getElementById('title');
    if (title) title.style.transform = '';
    render(0);
  } else {
    startLoop();
  }
}

motionBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  updateMotion();
});

reducedMotion.addEventListener('change', e => {
  isPaused = e.matches;
  updateMotion();
});

// ==========================================================================
// Web Audio API Synthesizer
// ==========================================================================
const soundBtn = document.getElementById('sound');

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Ambient peaceful chords (Cmaj7 arpeggios)
function playAmbientChord() {
  if (!audioCtx || !soundEnabled) return;
  const frequencies = [130.81, 196.00, 261.63, 329.63, 493.88];
  frequencies.forEach((hz, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;

    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.016, audioCtx.currentTime + 1.5 + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 6.0);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 6.1);
  });
}

// Candle blow sound: soft breath / air whoosh + fairy chime
function playBlowSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    // 1. Soft breath whoosh
    const bufferSize = ctx.sampleRate * 0.6;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.5);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();

    // 2. Ascending magical star chimes
    const chimes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    chimes.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, ctx.currentTime + 0.2 + i * 0.08);

      gain.gain.setValueAtTime(0, ctx.currentTime + 0.2 + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 0.22 + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2 + i * 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + 0.2 + i * 0.08);
      osc.stop(ctx.currentTime + 1.3 + i * 0.08);
    });
  } catch (err) {
    console.warn('Audio not available', err);
  }
}

// Candle relight strike sound
function playRelightSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('Audio not available', err);
  }
}

// Shimmer sound for wish card flip
function playCardFlipSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.015, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  } catch (err) {
    console.warn('Audio flip error', err);
  }
}

soundBtn.addEventListener('click', async () => {
  try {
    const ctx = getAudioContext();
    soundEnabled = !soundEnabled;

    if (soundEnabled) {
      await ctx.resume();
      playAmbientChord();
      ambientInterval = setInterval(playAmbientChord, 5500);
      soundBtn.textContent = 'Sound on ♫';
      soundBtn.setAttribute('aria-pressed', 'true');
    } else {
      clearInterval(ambientInterval);
      await ctx.suspend();
      soundBtn.textContent = 'Sound off ♫';
      soundBtn.setAttribute('aria-pressed', 'false');
    }
  } catch (e) {
    soundBtn.textContent = 'Sound unavailable';
  }
});

// ==========================================================================
// Interactive Candle Experience
// ==========================================================================
const flameZone = document.getElementById('flame-zone');
const flame = document.getElementById('flame');
const candleAura = document.getElementById('candle-aura');
const smokeContainer = document.getElementById('smoke-container');
const candleStatus = document.getElementById('candle-status');
const blowBtn = document.getElementById('blow-btn');
const relightBtn = document.getElementById('relight-btn');

let isCandleLit = true;

function spawnSmoke() {
  smokeContainer.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const puff = document.createElement('div');
    puff.className = 'smoke-puff';
    puff.style.left = `${(Math.random() - 0.5) * 16}px`;
    puff.style.animationDelay = `${i * 0.22}s`;
    smokeContainer.appendChild(puff);
  }
}

function blowCandle() {
  if (!isCandleLit) return;
  isCandleLit = false;

  // Visual extinguish
  flame.classList.add('extinguished');
  candleAura.classList.add('dimmed');
  spawnSmoke();

  // Burst of golden stardust from candle position
  const flameRect = flameZone.getBoundingClientRect();
  const flameX = flameRect.left + flameRect.width * 0.5;
  const flameY = flameRect.top + flameRect.height * 0.5;
  burst(flameX, flameY, 180);

  // Play audio
  playBlowSound();

  // Update Status text with grand wish celebration
  candleStatus.innerHTML = `🌟 <b>Wish granted!</b> Your silent prayer has been released into the cosmos. May every piece of it come true! ✨`;

  // Toggle buttons
  blowBtn.classList.add('hidden');
  relightBtn.classList.remove('hidden');

  // Trigger floating stars
  for (let i = 0; i < 3; i++) {
    setTimeout(() => launchShootingStar(flameX + (Math.random() - 0.5) * 100, flameY), i * 350);
  }
}

function relightCandle() {
  if (isCandleLit) return;
  isCandleLit = true;

  flame.classList.remove('extinguished');
  candleAura.classList.remove('dimmed');
  smokeContainer.innerHTML = '';

  const flameRect = flameZone.getBoundingClientRect();
  const flameX = flameRect.left + flameRect.width * 0.5;
  const flameY = flameRect.top + flameRect.height * 0.5;
  burst(flameX, flameY, 70);

  playRelightSound();

  candleStatus.innerHTML = `<span class="sparkle-icon">✨</span> The flame is burning bright. <b>Tap the flame</b> to blow it out!`;

  blowBtn.classList.remove('hidden');
  relightBtn.classList.add('hidden');
}

// Click & keyboard events for candle
flameZone.addEventListener('click', blowCandle);
flameZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (isCandleLit) blowCandle();
    else relightCandle();
  }
});
blowBtn.addEventListener('click', blowCandle);
relightBtn.addEventListener('click', relightCandle);

// ==========================================================================
// Interactive Wish Flip Cards
// ==========================================================================
const wishCards = document.querySelectorAll('.wish-flip-card');

wishCards.forEach(card => {
  function handleCardToggle() {
    card.classList.toggle('flipped');
    playCardFlipSound();

    const rect = card.getBoundingClientRect();
    burst(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5, 25);
  }

  card.addEventListener('click', handleCardToggle);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardToggle();
    }
  });
});

// ==========================================================================
// Wish Caster (Send Wish into the Cosmos Form)
// ==========================================================================
const casterForm = document.getElementById('caster-form');
const casterInput = document.getElementById('caster-input');
const wishesShelf = document.getElementById('wishes-shelf');

casterForm.addEventListener('submit', e => {
  e.preventDefault();
  const wishText = casterInput.value.trim();
  if (!wishText) return;

  // Create glowing pill
  const pill = document.createElement('div');
  pill.className = 'star-wish-pill';
  pill.innerHTML = `<span>✦</span> ${escapeHtml(wishText)}`;
  wishesShelf.prepend(pill);

  // Spark burst at submit button
  const btnRect = e.target.querySelector('button').getBoundingClientRect();
  burst(btnRect.left + btnRect.width * 0.5, btnRect.top + btnRect.height * 0.5, 80);

  // Launch shooting star across the sky
  launchShootingStar();
  playRelightSound();

  // Reset form
  casterInput.value = '';
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Pre-fill a couple of inspiring starter wishes on the shelf
const defaultWishes = [
  'May your smile never lose its sparkle 🌟',
  'Health, peace, and boundless adventures 🪐',
  'Here is to your happiest year yet! 🎂'
];
defaultWishes.forEach(wish => {
  const pill = document.createElement('div');
  pill.className = 'star-wish-pill';
  pill.innerHTML = `<span>✦</span> ${wish}`;
  wishesShelf.appendChild(pill);
});

// ==========================================================================
// Modal Celebration Dialog
// ==========================================================================
const modal = document.getElementById('modal');
const openModalBtn = document.getElementById('celebrate');
const closeModalBtn = document.getElementById('close');
let modalTimer;

openModalBtn.addEventListener('click', () => {
  burst(width * 0.5, height * 0.48, 350);
  clearTimeout(modalTimer);

  modalTimer = setTimeout(() => {
    modal.classList.add('open');
    document.querySelector('main').inert = true;
    document.querySelector('header').inert = true;
    document.body.style.overflow = 'hidden';
    closeModalBtn.focus();

    burst(width * 0.25, height * 0.3, 120);
    burst(width * 0.75, height * 0.3, 120);
  }, isPaused ? 0 : 500);
});

function dismissModal() {
  modal.classList.remove('open');
  document.querySelector('main').inert = false;
  document.querySelector('header').inert = false;
  document.body.style.overflow = '';
  openModalBtn.focus();
  burst(width * 0.5, height * 0.4, 140);
}

closeModalBtn.addEventListener('click', dismissModal);
modal.addEventListener('click', e => {
  if (e.target === modal) dismissModal();
});

document.addEventListener('keydown', e => {
  if (modal.classList.contains('open')) {
    if (e.key === 'Escape') dismissModal();
    if (e.key === 'Tab') {
      e.preventDefault();
      closeModalBtn.focus();
    }
  }
});

// ==========================================================================
// Initialization
// ==========================================================================
resize();
updateMotion();
if (!isPaused) {
  burst(width * 0.5, height * 0.4, 80);
}
