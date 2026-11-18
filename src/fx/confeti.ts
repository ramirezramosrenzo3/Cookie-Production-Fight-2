/** Confeti de galletas para la victoria (canvas, sin dependencias). */
export function confeti(ms = 3500) {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confeti';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const ajustar = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
  ajustar();
  const g = c.getContext('2d')!;
  const colores = ['#F7A4C6', '#A8E6C1', '#FFD87A', '#B6A0DA', '#D8A676', '#8B5E3C'];
  const piezas = Array.from({ length: 140 }, () => ({
    x: Math.random() * c.width, y: -Math.random() * c.height * 0.6,
    vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr,
    r: (4 + Math.random() * 7) * dpr, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
    color: colores[Math.floor(Math.random() * colores.length)], galleta: Math.random() < 0.25,
  }));
  const t0 = performance.now();
  const paso = (t: number) => {
    g.clearRect(0, 0, c.width, c.height);
    for (const p of piezas) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05 * dpr; p.a += p.va;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      if (p.galleta) {
        g.fillStyle = '#D8A676'; g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5B3A22';
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(Math.cos(k * 2.1) * p.r * 0.45, Math.sin(k * 2.1) * p.r * 0.45, p.r * 0.18, 0, 7); g.fill(); }
      } else {
        g.fillStyle = p.color; g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      }
      g.restore();
    }
    if (t - t0 < ms) requestAnimationFrame(paso);
    else c.remove();
  };
  requestAnimationFrame(paso);
}
