// ===================== SCREEN NAVIGATION =====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// apply background image to buttons that have data-img (user's own uploaded png)
document.querySelectorAll('.pixel-img-btn[data-img]').forEach(btn => {
  const img = new Image();
  img.onload = () => { btn.style.backgroundImage = `url(${btn.dataset.img})`; };
  img.onerror = () => { /* no image provided yet, keep default pixel style */ };
  img.src = btn.dataset.img;
});

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
