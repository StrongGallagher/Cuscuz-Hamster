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

  const PLAYER_FIRE_COOLDOWN = 450; // ms, minimum gap between two player shots
  const DODGE_TRIGGER_DIST   = 24;  // % distance at which the enemy reacts to an incoming flame

  // ---------- power-ups (heart / speed / rope) ----------
  const POWERUP_START_ROUND     = 1;    // power-ups start appearing from this round onward (round 1 = from the very start of the game)
  const POWERUP_W                = 6;    // must roughly match .powerup width in CSS
  const POWERUP_H                = 6;
  const POWERUP_MIN_GAP          = 3000; // ms, min time between power-up spawn attempts
  const POWERUP_MAX_GAP          = 5000; // ms, max time between power-up spawn attempts
  const POWERUP_LIFETIME         = 5000;  // ms a power-up stays on the ground before vanishing unclaimed
  const POWERUP_TYPES            = ['heart', 'speed', 'rope'];
  const POWERUP_SRC = {
    heart: 'assets/characters/June.png',
    speed: 'assets/characters/Speed.png',
    rope:  'assets/characters/Rope.png'
  };
  const ROPE_VISUAL_RATIO = 1024 / 1536; // gameRope.png intrinsic width/height, used to size it correctly

  const HEART_HEAL_AMOUNT   = 2;    // HP restored by the heart power-up
  const SPEED_BOOST_DURATION = 6000; // ms the doubled fire-rate lasts
  const ROPE_DURATION       = 5000;  // ms the player stays attached to the rope
  const ROPE_MAX_SHOTS      = 2;     // guaranteed-hit shots available while on the rope
  const ROPE_HEIGHT         = GROUND_BOTTOM + 40; // % bottom position while attached to the rope
  const ROPE_THROW_ARC_HEIGHT = 18; // % extra height a rope-thrown flame arcs up to, over the right half of the field

  const TOTAL_ROUNDS = 15;
  const ROUND_CONFIG = {
    1: { flameSpeed: 42,  fireInterval: 1900, burst: 1, enemyMoveSpeed: 20, dodgeChance: 0.40 },
    2: { flameSpeed: 60,  fireInterval: 1300, burst: 1, enemyMoveSpeed: 28, dodgeChance: 0.65 },
    3: { flameSpeed: 82,  fireInterval: 850,  burst: 2, enemyMoveSpeed: 36, dodgeChance: 0.90 },
    // round 4: only a slight overall difficulty bump over round 3
    4: { flameSpeed: 90,  fireInterval: 780,  burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.90 },
    // round 5: noticeably faster fire-rate + better dodging; everything else stays like round 4
    5: { flameSpeed: 90,  fireInterval: 600,  burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.96 },
    // rounds 6-15: burst and fire-rate stay locked to round 5 (never more/faster shots),
    // only the bullet speed creeps up a little and dodging gets a lot better each round
    6:  { flameSpeed: 95,  fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.965 },
    7:  { flameSpeed: 100, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.970 },
    8:  { flameSpeed: 105, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.975 },
    9:  { flameSpeed: 110, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.980 },
    10: { flameSpeed: 115, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.985 },
    11: { flameSpeed: 120, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.988 },
    12: { flameSpeed: 125, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.990 },
    13: { flameSpeed: 130, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.992 },
    14: { flameSpeed: 135, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.994 },
    15: { flameSpeed: 140, fireInterval: 600, burst: 2, enemyMoveSpeed: 40, dodgeChance: 0.995 }
  };
  const ENEMY_DIFFICULTY_CAP_ROUND = TOTAL_ROUNDS; // every round now has its own explicit config, so no extra capping needed
  const ENEMY_EXTRA_HP_START_ROUND = 8; // from this round on, the enemy gains +1 HP after every round it survives

  // returns the enemy's difficulty settings for a round, capped so it never goes
  // past the last defined round's settings (kept as a safety net, not an active limiter anymore)
  function getRoundConfig(round) {
    return ROUND_CONFIG[Math.min(round, ENEMY_DIFFICULTY_CAP_ROUND)];
  }

  // ---------- DOM refs ----------
  const arena            = document.getElementById('arena');
  const playerEl          = document.getElementById('player');
  const enemyEl           = document.getElementById('enemy');
  const playerHpBar       = document.querySelectorAll('#player-hp .hp-seg');
  const enemyHpBarEl      = document.getElementById('enemy-hp');
  let enemyHpBar          = document.querySelectorAll('#enemy-hp .hp-seg'); // rebuilt when enemyMaxHP grows (round 8+)
  const roundIndicator    = document.getElementById('round-indicator');
  const roundAnnounceOv   = document.getElementById('round-announce-overlay');
  const roundAnnounceTx   = document.getElementById('round-announce-text');
  const roundResultOv     = document.getElementById('round-result-overlay');
  const roundResultTx     = document.getElementById('round-result-text');
  const pauseOverlay      = document.getElementById('pause-overlay');
  const gameoverOv        = document.getElementById('gameover-overlay');
  const gameoverTx        = document.getElementById('gameover-text');
  const pauseIcon         = document.getElementById('pause-icon');
  const pauseLabel        = document.getElementById('pause-label');
  const ropeVisualEl      = document.getElementById('rope-visual');

  const sfxShoot  = document.getElementById('sfx-shoot');
  const sfxHit    = document.getElementById('sfx-hit');
  const sfxMusic  = document.getElementById('sfx-bgmusic');
  const sfxRound  = document.getElementById('sfx-round-announce');

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

  // plays assets/sounds/round<N>.mp3 and calls back when it finishes
  // (falls back to a short delay if the file is missing so the game never gets stuck)
  function announceRound(n, onEnd) {
    let done = false;
    const finish = () => { if (done) return; done = true; onEnd(); };

    sfxRound.onended = finish;
    sfxRound.onerror = finish;
    sfxRound.src = `assets/sounds/round${n}.mp3`;
    sfxRound.currentTime = 0;

    const playPromise = sfxRound.play();
    if (playPromise && playPromise.catch) playPromise.catch(finish);

    // safety net: never block the game for more than 4s waiting on an audio file
    setTimeout(finish, 4000);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------- state ----------
  let state = null;
  let keys = {};
  let loopHandle = null;
  let lastTime = 0;
  let aiTimerId = null;
  let powerupTimerId = null;    // schedules the next power-up spawn attempt
  let powerupDespawnTimerId = null; // removes an unclaimed power-up after its lifetime

  function freshState() {
    return {
      round: 1,
      wins: { player: 0, computer: 0 },
      playerHP: 5,
      enemyHP: 5,
      enemyMaxHP: 5, // grows by 1 per round from ENEMY_EXTRA_HP_START_ROUND onward
      player: {
        x: 80, jumping: false, jumpStart: 0,
        speedBoostUntil: 0,       // performance.now() timestamp until which fire-rate is doubled
        roped: false, ropedUntil: 0, ropeShotsLeft: 0 // rope power-up state
      },
      enemy:  { x: 10, jumping: false, jumpStart: 0, targetX: 10, nextMoveAt: 0 },
      flames: [], // {el, x, y, vx, owner, dodgeChecked, guaranteed}
      powerup: null, // {el, type, x, y} currently sitting on the ground, or null
      lastPlayerShot: -9999,
      paused: false,
      running: false,
      roundLocked: false // true while overlays/announcements are showing
    };
  }

  function resetHpBar(bar) {
    bar.forEach(seg => seg.classList.remove('empty'));
  }

  // rebuilds the enemy HP bar's segments to match a new max HP (only needed from round
  // ENEMY_EXTRA_HP_START_ROUND onward, when the enemy's max HP grows past 5)
  function rebuildEnemyHpBar(maxHP) {
    enemyHpBarEl.innerHTML = '';
    for (let i = 0; i < maxHP; i++) {
      const seg = document.createElement('div');
      seg.className = 'hp-seg';
      enemyHpBarEl.appendChild(seg);
    }
    enemyHpBar = enemyHpBarEl.querySelectorAll('.hp-seg');
  }

  function damage(side) {
    if (side === 'player') {
      state.playerHP = Math.max(0, state.playerHP - 1);
      const seg = playerHpBar[5 - state.playerHP - 1];
      if (seg) seg.classList.add('empty');
      flashHit(playerEl);
    } else {
      state.enemyHP = Math.max(0, state.enemyHP - 1);
      const seg = enemyHpBar[state.enemyMaxHP - state.enemyHP - 1];
      if (seg) seg.classList.add('empty');
      flashHit(enemyEl);
    }
    playSfx(sfxHit);
  }

  // restores HP (used by the heart power-up), capped at the 5-segment bar, and
  // un-empties exactly the segments that heal covers
  function healPlayer(amount) {
    const before = state.playerHP;
    state.playerHP = Math.min(5, before + amount);
    for (let i = 5 - state.playerHP; i <= 5 - before - 1; i++) {
      const seg = playerHpBar[i];
      if (seg) seg.classList.remove('empty');
    }
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
    const playerBottom = state.player.roped ? ROPE_HEIGHT : (GROUND_BOTTOM + jumpOffset(state.player));
    playerEl.style.bottom = playerBottom + '%';
    enemyEl.style.left = state.enemy.x + '%';
    enemyEl.style.bottom = (GROUND_BOTTOM + jumpOffset(state.enemy)) + '%';
    if (state.player.roped) updateRopeVisualPosition(playerBottom);
  }

  function initPositions() {
    state.player.x = 80;
    state.enemy.x = 10;
    state.enemy.targetX = 10;
    applyPositions();
  }

  function updateRopeVisualPosition(playerBottom) {
    // hangs from the top of the arena down to the player; height is set in %, and the
    // (auto) width follows the image's real aspect ratio so it never looks stretched
    const heightPct = 100 - playerBottom;
    ropeVisualEl.style.top = '0';
    ropeVisualEl.style.height = heightPct + '%';
    const arenaRect = arena.getBoundingClientRect();
    const widthPx = arenaRect.height * (heightPct / 100) * ROPE_VISUAL_RATIO;
    const widthPct = (widthPx / arenaRect.width) * 100;
    ropeVisualEl.style.width = widthPct + '%';
    ropeVisualEl.style.left = (state.player.x + PLAYER_W / 2 - widthPct / 2) + '%';
  }

  // ---------- flames ----------
  function spawnFlame(owner, guaranteed) {
    const el = document.createElement('img');
    el.className = 'flame';
    el.src = owner === 'player' ? 'assets/characters/flame_player.gif' : 'assets/characters/flame_enemy.gif';
    arena.appendChild(el);

    const cfg = getRoundConfig(state.round);
    const originX = owner === 'player' ? state.player.x : state.enemy.x + ENEMY_W;
    const vx = owner === 'player' ? -cfg.flameSpeed : cfg.flameSpeed;

    const flame = { el, x: originX, y: FLAME_Y, vx, owner, dodgeChecked: false, guaranteed: !!guaranteed };
    // rope shots are thrown, not shot: they arc up and back down over the right half of the
    // field (from the player to the middle), then travel straight the rest of the way
    if (guaranteed) {
      flame.arcOriginX = originX;
      flame.arcMidX = 50;
    }
    state.flames.push(flame);
    playSfx(sfxShoot);
  }

  function playerShoot() {
    // can fire while standing on the ground, or while attached to the rope power-up
    if (state.player.jumping && !state.player.roped) return;
    const now = performance.now();
    const cooldown = state.player.speedBoostUntil > now ? PLAYER_FIRE_COOLDOWN / 2 : PLAYER_FIRE_COOLDOWN;
    if (now - state.lastPlayerShot < cooldown) return; // minimum gap between shots
    state.lastPlayerShot = now;

    // while on the rope, up to ROPE_MAX_SHOTS shots are guaranteed to hit the enemy directly
    const guaranteed = state.player.roped && state.player.ropeShotsLeft > 0;
    if (guaranteed) state.player.ropeShotsLeft--;
    spawnFlame('player', guaranteed);
  }

  function scheduleAI() {
    clearTimeout(aiTimerId);
    if (!state.running || state.paused || state.roundLocked) return;
    const cfg = getRoundConfig(state.round);
    aiTimerId = setTimeout(() => {
      if (state.running && !state.paused && !state.roundLocked && !state.enemy.jumping) {
        for (let i = 0; i < cfg.burst; i++) {
          setTimeout(() => {
            if (state.running && !state.paused && !state.roundLocked) spawnFlame('enemy');
          }, i * 180);
        }
      }
      scheduleAI();
    }, cfg.fireInterval);
  }

  // ---------- power-ups ----------
  function powerupsEligible() {
    return state && state.running && !state.paused && !state.roundLocked && state.round >= POWERUP_START_ROUND;
  }

  // schedules the next spawn attempt; only one power-up is ever on the ground at a time
  function scheduleNextPowerup() {
    clearTimeout(powerupTimerId);
    if (!powerupsEligible()) return;
    const gap = POWERUP_MIN_GAP + Math.random() * (POWERUP_MAX_GAP - POWERUP_MIN_GAP);
    powerupTimerId = setTimeout(() => {
      if (powerupsEligible() && !state.powerup) {
        spawnRandomPowerup();
      }
      scheduleNextPowerup();
    }, gap);
  }

  function spawnRandomPowerup() {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const el = document.createElement('img');
    el.className = 'powerup powerup-' + type;
    el.src = POWERUP_SRC[type];
    arena.appendChild(el);

    const x = PLAYER_MIN_X + Math.random() * (PLAYER_MAX_X - PLAYER_MIN_X - POWERUP_W);
    state.powerup = { el, type, x, y: GROUND_BOTTOM };
    el.style.left = x + '%';
    el.style.bottom = GROUND_BOTTOM + '%';

    clearTimeout(powerupDespawnTimerId);
    powerupDespawnTimerId = setTimeout(removeCurrentPowerup, POWERUP_LIFETIME);
  }

  function removeCurrentPowerup() {
    clearTimeout(powerupDespawnTimerId);
    if (state.powerup) {
      state.powerup.el.remove();
      state.powerup = null;
    }
  }

  function collectPowerup(type) {
    if (type === 'heart') {
      healPlayer(HEART_HEAL_AMOUNT);
    } else if (type === 'speed') {
      state.player.speedBoostUntil = performance.now() + SPEED_BOOST_DURATION;
    } else if (type === 'rope') {
      activateRope();
    }
  }

  function activateRope() {
    state.player.roped = true;
    state.player.ropedUntil = performance.now() + ROPE_DURATION;
    state.player.ropeShotsLeft = ROPE_MAX_SHOTS;
    state.player.jumping = false;
    state.player.x = PLAYER_MAX_X; // snap to the far right edge, matching the rope's fixed spot
    ropeVisualEl.classList.remove('hidden');
  }

  function endRopeState() {
    state.player.roped = false;
    ropeVisualEl.classList.add('hidden');
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
    const cfg = getRoundConfig(state.round);

    // ---- player horizontal movement (confined to the right half) ----
    // while attached to the rope power-up, the player stays fixed in place: no left/right
    if (!state.player.roped) {
      if (keys['ArrowLeft']) {
        state.player.x = clamp(state.player.x - MOVE_SPEED * dtSec, PLAYER_MIN_X, PLAYER_MAX_X);
      }
      if (keys['ArrowRight']) {
        state.player.x = clamp(state.player.x + MOVE_SPEED * dtSec, PLAYER_MIN_X, PLAYER_MAX_X);
      }
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

    // ---- rope power-up: expire after its duration ----
    if (state.player.roped && performance.now() > state.player.ropedUntil) {
      endRopeState();
    }

    applyPositions();

    // ---- power-up on the ground: check if the player picked it up ----
    if (state.powerup) {
      const p = state.powerup;
      const playerBottom = state.player.roped ? ROPE_HEIGHT : (GROUND_BOTTOM + jumpOffset(state.player));
      const overlapX = state.player.x < p.x + POWERUP_W && state.player.x + PLAYER_W > p.x;
      const overlapY = playerBottom < p.y + POWERUP_H + FIGHTER_H && playerBottom + FIGHTER_H > p.y;
      if (overlapX && overlapY) {
        collectPowerup(p.type);
        removeCurrentPowerup();
      }
    }

    // ---- flames: move, collide, and let the enemy try to dodge ----
    // NOTE: if a collision ends the round, endRound() clears state.flames (a new array).
    // We must stop iterating the old array immediately afterwards, or we'd read
    // properties off `undefined` on the next loop turn and crash the whole game.
    for (let i = state.flames.length - 1; i >= 0; i--) {
      const f = state.flames[i];
      if (!f) break; // safety: array was reset by a round ending mid-loop

      f.x += f.vx * dtSec;

      // rope-thrown flame: arc over the right half of the field (player -> midfield), then fly straight
      if (f.arcOriginX !== undefined) {
        const span = f.arcOriginX - f.arcMidX;
        if (span > 0 && f.x > f.arcMidX) {
          const progress = Math.min(1, Math.max(0, (f.arcOriginX - f.x) / span));
          f.y = FLAME_Y + ROPE_THROW_ARC_HEIGHT * Math.sin(progress * Math.PI);
        } else {
          f.y = FLAME_Y;
        }
      }

      f.el.style.left = f.x + '%';
      f.el.style.bottom = f.y + '%';

      // enemy tries to dodge an incoming player flame by jumping over it
      // (guaranteed rope shots always connect, so the enemy doesn't bother dodging them)
      if (f.owner === 'player' && !f.guaranteed && !f.dodgeChecked && !state.enemy.jumping) {
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
      const targetYBottom = f.owner === 'player'
        ? GROUND_BOTTOM + jumpOffset(state.enemy)
        : (state.player.roped ? ROPE_HEIGHT : GROUND_BOTTOM + jumpOffset(state.player));

      const overlapX = f.x < targetX + targetW && f.x + FLAME_W > targetX;
      // a guaranteed rope shot always connects horizontally, ignoring height ("مستقیم می‌خورد به دشمن")
      const overlapY = f.guaranteed ? true : (f.y < targetYBottom + FIGHTER_H && f.y + FLAME_H > targetYBottom);

      if (overlapX && overlapY) {
        f.el.remove();
        state.flames.splice(i, 1);
        if (f.owner === 'player') {
          damage('enemy');
          // the rope power-up ends as soon as its first guaranteed shot lands
          if (f.guaranteed && state.player.roped) endRopeState();
          if (state.enemyHP <= 0) { endRound('player'); break; } // round over: stop touching the old flames array
        } else {
          damage('player');
          if (state.playerHP <= 0) { endRound('computer'); break; }
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

    // from round ENEMY_EXTRA_HP_START_ROUND onward, the enemy gains +1 max HP each round
    const newEnemyMaxHP = n > ENEMY_EXTRA_HP_START_ROUND
      ? 5 + (n - ENEMY_EXTRA_HP_START_ROUND)
      : 5;
    if (newEnemyMaxHP !== state.enemyMaxHP) rebuildEnemyHpBar(newEnemyMaxHP);
    state.enemyMaxHP = newEnemyMaxHP;
    state.enemyHP = newEnemyMaxHP;

    resetHpBar(playerHpBar);
    resetHpBar(enemyHpBar);
    clearFlames();
    removeCurrentPowerup();
    clearTimeout(powerupTimerId);
    state.player.speedBoostUntil = 0;
    if (state.player.roped) endRopeState();
    state.player.ropeShotsLeft = 0;
    initPositions();
    roundIndicator.textContent = 'ROUND ' + n;
    state.roundLocked = true;

    roundResultOv.classList.add('hidden');
    roundAnnounceTx.textContent = 'ROUND ' + n;
    roundAnnounceOv.classList.remove('hidden');

    announceRound(n, () => {
      roundAnnounceOv.classList.add('hidden');
      state.roundLocked = false;
      scheduleAI();
      scheduleNextPowerup();
    });
  }

  function endRound(winner) {
    state.roundLocked = true;
    clearTimeout(aiTimerId);
    clearTimeout(powerupTimerId);
    removeCurrentPowerup();
    clearFlames();

    if (winner === 'player') state.wins.player++; else state.wins.computer++;

    const text = winner === 'player' ? 'YOU WIN THIS ROUND' : 'YOU LOST THIS ROUND';
    roundResultTx.textContent = text;
    roundResultOv.classList.remove('hidden');

    speak(winner === 'player' ? 'You win this round!' : 'You lost this round!', () => {
      setTimeout(() => {
        roundResultOv.classList.add('hidden');
        if (state.round < TOTAL_ROUNDS) {
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
    const text = playerWon ? 'YOU WIN' : 'GAME OVER — YOU LOSE!';
    gameoverTx.textContent = text;
    gameoverOv.classList.remove('hidden');
    speak(playerWon ? 'Game over. You win!' : 'Game over. You lose!', () => {});
  }

  // ---------- pause / stop / start ----------
  function setPauseButtonState(paused) {
    if (paused) {
      pauseIcon.textContent = '▶';
      pauseLabel.textContent = 'RESUME';
    } else {
      pauseIcon.textContent = '❚❚';
      pauseLabel.textContent = 'PAUSE';
    }
  }

  function togglePause() {
    if (!state || !state.running) return;
    state.paused = !state.paused;
    pauseOverlay.classList.toggle('hidden', !state.paused);
    setPauseButtonState(state.paused);
    if (state.paused) {
      sfxMusic.pause();
      clearTimeout(aiTimerId);
      clearTimeout(powerupTimerId);
    } else {
      sfxMusic.play().catch(() => {});
      scheduleAI();
      scheduleNextPowerup();
    }
  }

  function stopGame() {
    if (state) {
      state.running = false;
      clearFlames();
      removeCurrentPowerup();
      if (state.player.roped) endRopeState();
    }
    clearTimeout(aiTimerId);
    clearTimeout(powerupTimerId);
    cancelAnimationFrame(loopHandle);
    window.speechSynthesis && window.speechSynthesis.cancel();
    sfxMusic.pause();
    sfxMusic.currentTime = 0;
    sfxRound.pause();
    setPauseButtonState(false);
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

    if (e.code === 'ArrowUp' && state && state.running && !state.paused && !state.roundLocked && !state.player.jumping && !state.player.roped) {
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
