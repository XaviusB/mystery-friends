const button = document.getElementById('gift');
const sound = new Audio('/confetti.mp3');
const COLORS = ['#c0392b', '#2e8b57', '#e8c77a', '#ffffff', '#1f6fb2', '#f39c12'];
const DURATION = 4000;

function rain() {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  const pieces = Array.from({ length: 220 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.6,
    w: 6 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    vx: (Math.random() - 0.5) * 2,
    vy: 2 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.2,
    sway: Math.random() * Math.PI * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.sway += 0.05;
      p.x += p.vx + Math.sin(p.sway) * 0.8;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (elapsed < DURATION) {
      requestAnimationFrame(frame);
    } else {
      window.removeEventListener('resize', resize);
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}

button.addEventListener('click', () => {
  sound.currentTime = 0;
  sound.play().catch(() => {});
  rain();
});
