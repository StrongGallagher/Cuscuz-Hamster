// ===================== SCREEN NAVIGATION =====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// apply background image to buttons that have data-img (user's own uploaded png)
document.querySelectorAll('.pixel-img-btn[data-img]').forEach(btn => {
  const img = new Image();
  img.onload = () => {
    btn.style.backgroundImage = `url(${btn.dataset.img})`;
    btn.classList.add('img-loaded'); // hides the fallback text once the real image is ready
  };
  img.onerror = () => { /* no image uploaded yet, keep the pixel fallback text */ };
  img.src = btn.dataset.img;
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

// ---------- in-game pause / exit ----------
document.getElementById('btn-pause').addEventListener('click', () => {
  window.FlameFight.togglePause();
});

document.getElementById('btn-exit').addEventListener('click', () => {
  const sure = confirm('از بازی خارج شوید؟ (به منوی اصلی برمی‌گردید)');
  if (sure) {
    window.FlameFight.stopGame();
    showScreen('menu-screen');
  }
});
