(function () {
  "use strict";

  // ---------- constants (percent units relative to arena box) ----------
  const GROUND_BOTTOM   = 15;   // resting bottom position (%)
  const JUMP_HEIGHT      = 33;   // extra height gained on jump (%)
  const JUMP_DURATION    = 550;  // ms for a full jump arc
  const MOVE_SPEED       = 38;   // player % of arena width per second

  const PLAYER_W = 10;   // must match #player width in CSS
  const ENEMY_W  = 14;   // must match #enemy width in CSS
  const FIGHTER_H = 30;  // approx hit-box height (%) above "bottom"

  // each fighter is confined to its own half of the arena, up to the centre line
  const PLAYER_MIN_X = 50;
  const PLAYER_MAX_X = 88;
  const ENEMY_MIN_X  = 4;
  const ENEMY_MAX_X  = 36; // 36 + ENEMY_W(14) = 50 -> enemy's right edge can reach the centre line

  const FLAME_W = 6;
  const FLAME_H = 8;
  const FLAME_Y = GROUND_BOTTOM + 3; // flames always travel low, near the ground, so a jump clears them

  const PLAYER_FIRE_COOLDOWN = 450; // ms
  const DODGE_TRIGGER_DIST   = 24;  // % distance at which the enemy reacts to an incoming flame

  const ROUND_CONFIG = {
    1: { flameSpeed: 42, fireInterval: 1900, burst: 1, enemyMoveSpeed: 20, dodgeChance: 0.40 },
    2: { flameSpeed: 60, fireInterval: 1300, burst: 1, enemyMoveSpeed: 28, dodgeChance: 0.65 },
    3: { flameSpeed: 82, fireInterval: 850,  burst: 2, enemyMoveSpeed: 36, dodgeChance: 0.90 }
  };

  // ---------- DOM refs ----------
  const arena           = document.getElementById('arena');
  const playerEl         = document.getElementById('player');
  const enemyEl          = document.getElementById('enemy');
  const playerHpBar      = document.querySelectorAll('#player-hp .hp-seg');
  const enemyHpBar       = document.querySelectorAll('#enemy-hp .hp-seg');
  const roundIndicator   = document.getElementById('round-indicator');
  const roundAnnounceOv  = document.getElementById('round-announce-overlay');
  const roundAnnounceTx  = document.getElementById('round-announce-text');
  const roundResultOv    = document.getElementById('round-result-overlay');
  const roundResultTx    = document.getElementById('round-result-text');
  const pauseOverlay     = document.getElementById('pause-overlay');
  const gameoverOv       = document.getElementById('gameover-overlay');
  const gameoverTx       = document.getElementById('gameover-text');

  const sfxShoot  = document.getElementById('sfx-shoot');
  const sfxHit    = document.getElementById('sfx-hit');
  const sfxMusic  = document.getElementById('sfx-bgmusic');

  function playSfx(audioEl) {
    try {
      const c = audioEl.cloneNode(true);
      c.volume = audioEl.volume;
      c.play().catch(() => {});
    } catch (e) {}
  }

  function speak(text, onEnd) {
    if (!('speechSynthesis' in window)) { setTimeout(onEnd, 1200); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------- state ----------
  let state = null;
  let keys = {};
  let loopHandle = null;
  let lastTime = 0;
  let aiTimerId = null;

  function freshState() {
    return {
      round: 1,
      wins: { player: 0, computer: 0 },
      playerHP: 5,
      enemyHP: 5,
      player: { x: 80, jumping: false, jumpStart: 0 },
      enemy:  { x: 10, jumping: false, jumpStart: 0, targetX: 10, nextMoveAt: 0 },
      flames: [], // {el, x, y, vx, owner, dodgeChecked}
      lastPlayerShot: -9999,
      paused: false,
      running: false,
      roundLocked: false // true while overlays/announcements are showing
    };
  }

  function resetHpBar(bar) {
    bar.forEach(seg => seg.classList.remove('empty'));
  }

  function damage(side) {
    if (side === 'player') {
      state.playerHP = Math.max(0, state.playerHP - 1);
      const seg = playerHpBar[5 - state.playerHP - 1];
      if (seg) seg.classList.add('empty');
      flashHit(playerEl);
    } else {
      state.enemyHP = Math.max(0, state.enemyHP - 1);
      const seg = enemyHpBar[5 - state.enemyHP - 1];
      if (seg) seg.classList.add('empty');
      flashHit(enemyEl);
    }
    playSfx(sfxHit);
  }

  function flashHit(el) {
    el.classList.remove('hit-flash');
    void el.offsetWidth; // restart animation
    el.classList.add('hit-flash');
  }

  // ---------- jump helper (shared by player & enemy) ----------
  function jumpOffset(entity) {
    if (!entity.jumping) return 0;
    const t = performance.now() - entity.jumpStart;
    if (t >= JUMP_DURATION) { entity.jumping = false; return 0; }
    const progress = t / JUMP_DURATION;
    return Math.sin(progress * Math.PI) * JUMP_HEIGHT;
  }

  function triggerJump(entity) {
    if (entity.jumping) return;
    entity.jumping = true;
    entity.jumpStart = performance.now();
  }

  // ---------- positioning ----------
  function applyPositions() {
    playerEl.style.left = state.player.x + '%';
    playerEl.style.bottom = (GROUND_BOTTOM + jumpOffset(state.player)) + '%';
    enemyEl.style.left = state.enemy.x + '%';
    enemyEl.style.bottom = (GROUND_BOTTOM + jumpOffset(state.enemy)) + '%';
  }

  function initPositions() {
    state.player.x = 80;
    state.enemy.x = 10;
    state.enemy.targetX = 10;
    applyPositions();
  }

  // ---------- flames ----------
  function spawnFlame(owner) {
    const el = document.createElement('img');
    el.className = 'flame';
    el.src = owner === 'player' ? 'assets/characters/flame_player.gif' : 'assets/characters/flame_enemy.gif';
    arena.appendChild(el);

    const cfg = ROUND_CONFIG[state.round];
    const originX = owner === 'player' ? state.player.x : state.enemy.x + ENEMY_W;
    const vx = owner === 'player' ? -cfg.flameSpeed : cfg.flameSpeed;

    state.flames.push({ el, x: originX, y: FLAME_Y, vx, owner, dodgeChecked: false });
    playSfx(sfxShoot);
  }

  function playerShoot() {
    const now = performance.now();
    if (now - state.lastPlayerShot < PLAYER_FIRE_COOLDOWN) return;
    state.lastPlayerShot = now;
    spawnFlame('player');
  }

  function scheduleAI() {
    clearTimeout(aiTimerId);
    if (!state.running || state.paused || state.roundLocked) return;
    const cfg = ROUND_CONFIG[state.round];
    aiTimerId = setTimeout(() => {
      if (state.running && !state.paused && !state.roundLocked) {
        for (let i = 0; i < cfg.burst; i++) {
          setTimeout(() => spawnFlame('enemy'), i * 180);
        }
      }
      scheduleAI();
    }, cfg.fireInterval);
  }

  // ---------- main loop ----------
  function loop(ts) {
    if (!state.running) return;
    const dt = Math.min(50, ts - lastTime || 16);
    lastTime = ts;

    if (!state.paused && !state.roundLocked) {
      update(dt);
    }
    loopHandle = requestAnimationFrame(loop);
  }

  function update(dt) {
    const dtSec = dt / 1000;
    const cfg = ROUND_CONFIG[state.round];

    // ---- player horizontal movement (confined to the right half) ----
    if (keys['ArrowLeft']) {
      state.player.x = clamp(state.player.x - MOVE_SPEED * dtSec, PLAYER_MIN_X, PLAYER_MAX_X);
    }
    if (keys['ArrowRight']) {
      state.player.x = clamp(state.player.x + MOVE_SPEED * dtSec, PLAYER_MIN_X, PLAYER_MAX_X);
    }

    // ---- enemy patrol AI (confined to the left half) ----
    const now = performance.now();
    if (now > state.enemy.nextMoveAt) {
      state.enemy.targetX = ENEMY_MIN_X + Math.random() * (ENEMY_MAX_X - ENEMY_MIN_X);
      state.enemy.nextMoveAt = now + 1000 + Math.random() * 1800;
    }
    const dx = state.enemy.targetX - state.enemy.x;
    if (Math.abs(dx) > 0.5) {
      state.enemy.x = clamp(state.enemy.x + Math.sign(dx) * cfg.enemyMoveSpeed * dtSec, ENEMY_MIN_X, ENEMY_MAX_X);
    }

    applyPositions();

    // ---- flames: move, collide, and let the enemy try to dodge ----
    for (let i = state.flames.length - 1; i >= 0; i--) {
      const f = state.flames[i];
      f.x += f.vx * dtSec;
      f.el.style.left = f.x + '%';
      f.el.style.bottom = f.y + '%';

      // enemy tries to dodge an incoming player flame by jumping over it
      if (f.owner === 'player' && !f.dodgeChecked && !state.enemy.jumping) {
        const dist = f.x - state.enemy.x;
        if (dist > 0 && dist < DODGE_TRIGGER_DIST) {
          f.dodgeChecked = true;
          if (Math.random() < cfg.dodgeChance) triggerJump(state.enemy);
        }
      }

      // out of bounds
      if (f.x < -10 || f.x > 110) {
        f.el.remove();
        state.flames.splice(i, 1);
        continue;
      }

      // collision check
      const targetX = f.owner === 'player' ? state.enemy.x : state.player.x;
      const targetW = f.owner === 'player' ? ENEMY_W : PLAYER_W;
      const targetEntity = f.owner === 'player' ? state.enemy : state.player;
      const targetYBottom = GROUND_BOTTOM + jumpOffset(targetEntity);

      const overlapX = f.x < targetX + targetW && f.x + FLAME_W > targetX;
      const overlapY = f.y < targetYBottom + FIGHTER_H && f.y + FLAME_H > targetYBottom;

      if (overlapX && overlapY) {
        f.el.remove();
        state.flames.splice(i, 1);
        if (f.owner === 'player') {
          damage('enemy');
          if (state.enemyHP <= 0) endRound('player');
        } else {
          damage('player');
          if (state.playerHP <= 0) endRound('computer');
        }
      }
    }
  }

  function clearFlames() {
    state.flames.forEach(f => f.el.remove());
    state.flames = [];
  }

  // ---------- round flow ----------
  function startRound(n) {
    state.round = n;
    state.playerHP = 5;
    state.enemyHP = 5;
    resetHpBar(playerHpBar);
    resetHpBar(enemyHpBar);
    clearFlames();
    initPositions();
    roundIndicator.textContent = 'ROUND ' + n;
    state.roundLocked = true;

    roundResultOv.classList.add('hidden');
    roundAnnounceTx.textContent = 'ROUND ' + n;
    roundAnnounceOv.classList.remove('hidden');

    speak('Round ' + n + ', Start!', () => {
      roundAnnounceOv.classList.add('hidden');
      state.roundLocked = false;
      scheduleAI();
    });
  }

  function endRound(winner) {
    state.roundLocked = true;
    clearTimeout(aiTimerId);
    clearFlames();

    if (winner === 'player') state.wins.player++; else state.wins.computer++;

    const text = winner === 'player' ? 'YOU WIN THIS ROUND' : 'YOU LOST THIS ROUND';
    roundResultTx.textContent = text;
    roundResultOv.classList.remove('hidden');

    speak(winner === 'player' ? 'You win this round!' : 'You lost this round!', () => {
      setTimeout(() => {
        roundResultOv.classList.add('hidden');
        if (state.round < 3) {
          startRound(state.round + 1);
        } else {
          finishMatch();
        }
      }, 600);
    });
  }

  function finishMatch() {
    state.running = false;
    clearTimeout(aiTimerId);
    sfxMusic.pause();

    const playerWon = state.wins.player > state.wins.computer;
    const text = playerWon ? 'GAME OVER — YOU WIN!' : 'GAME OVER — YOU LOSE!';
    gameoverTx.textContent = text;
    gameoverOv.classList.remove('hidden');
    speak(playerWon ? 'Game over. You win!' : 'Game over. You lose!', () => {});
  }

  // ---------- pause / stop / start ----------
  function togglePause() {
    if (!state || !state.running) return;
    state.paused = !state.paused;
    pauseOverlay.classList.toggle('hidden', !state.paused);
    if (state.paused) {
      sfxMusic.pause();
      clearTimeout(aiTimerId);
    } else {
      sfxMusic.play().catch(() => {});
      scheduleAI();
    }
  }

  function stopGame() {
    if (state) {
      state.running = false;
      clearFlames();
    }
    clearTimeout(aiTimerId);
    cancelAnimationFrame(loopHandle);
    window.speechSynthesis && window.speechSynthesis.cancel();
    sfxMusic.pause();
    sfxMusic.currentTime = 0;
    [roundAnnounceOv, roundResultOv, pauseOverlay, gameoverOv].forEach(o => o.classList.add('hidden'));
  }

  function startNewGame() {
    stopGame();
    state = freshState();
    state.running = true;
    initPositions();
    sfxMusic.volume = 0.35;
    sfxMusic.currentTime = 0;
    sfxMusic.play().catch(() => {});
    lastTime = performance.now();
    loopHandle = requestAnimationFrame(loop);
    startRound(1);
  }

  // ---------- input ----------
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;

    if (e.code === 'ArrowUp' && state && state.running && !state.paused && !state.roundLocked) {
      triggerJump(state.player);
    }
    if (e.code === 'Space' && state && state.running && !state.paused && !state.roundLocked) {
      playerShoot();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // ---------- expose ----------
  window.FlameFight = { startNewGame, stopGame, togglePause };
})();
