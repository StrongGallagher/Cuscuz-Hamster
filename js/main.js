// ===================== SCREEN NAVIGATION =====================
const menuMusic = document.getElementById('sfx-menu-music');
menuMusic.loop = true;
menuMusic.volume = 0.3;

const PRE_GAME_SCREENS = ['menu-screen', 'guide-screen', 'about-screen'];

function maybeStartMenuMusic() {
  if (menuMusic.paused) menuMusic.play().catch(() => {});
}
function maybeStopMenuMusic() {
  if (!menuMusic.paused) menuMusic.pause();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  if (PRE_GAME_SCREENS.includes(id)) {
    maybeStartMenuMusic();
  } else {
    maybeStopMenuMusic();
  }
}

// autoplay policies block audio before any user gesture; start the menu music
// on the very first interaction if we're still sitting on a pre-game screen
window.addEventListener('pointerdown', () => {
  const activeEl = document.querySelector('.screen.active');
  const activeId = activeEl ? activeEl.id : null;
  if (PRE_GAME_SCREENS.includes(activeId)) maybeStartMenuMusic();
}, { once: true });

// ---------- button click sound (delegated: covers every current & future .pixel-icon-btn) ----------
const sfxClick = document.getElementById('sfx-click');
document.addEventListener('click', (e) => {
  if (e.target.closest('.pixel-icon-btn')) {
    try {
      const c = sfxClick.cloneNode(true);
      c.volume = 0.6;
      c.play().catch(() => {});
    } catch (err) {}
  }
});

// ---------- floating pixel particles behind the menu ----------
(function spawnMenuParticles() {
  const container = document.getElementById('menu-particles');
  if (!container) return;
  const colors = ['#ffcc00', '#ff3b3b', '#00c8ff', '#2ecc40'];
  const COUNT = 26;
  for (let i = 0; i < COUNT; i++) {
    const p = document.createElement('div');
    p.className = 'menu-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.color = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = (6 + Math.random() * 8) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    container.appendChild(p);
  }
})();

document.getElementById('btn-start').addEventListener('click', () => {
  showScreen('game-screen');
  window.FlameFight.startNewGame();
});

document.getElementById('btn-guide').addEventListener('click', () => showScreen('guide-screen'));
document.getElementById('btn-about').addEventListener('click', () => showScreen('about-screen'));

document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen('menu-screen'));
});

document.getElementById('btn-back-menu').addEventListener('click', () => {
  window.FlameFight.stopGame();
  showScreen('menu-screen');
});

// ---------- in-game pause / resume / exit ----------
document.getElementById('btn-pause').addEventListener('click', () => {
  window.FlameFight.togglePause();
});
document.getElementById('btn-resume').addEventListener('click', () => {
  window.FlameFight.togglePause();
});

document.getElementById('btn-exit').addEventListener('click', () => {
  const sure = confirm('از بازی خارج شوید؟ (به منوی اصلی برمی‌گردید)');
  if (sure) {
    window.FlameFight.stopGame();
    showScreen('menu-screen');
  }
});
