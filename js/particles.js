const _pool = [];

const PRESETS = {
  harvest: (x, y) => Array.from({ length: 10 }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * 130,
    vy: -Math.random() * 110 - 40,
    gravity: 200,
    life: 650, maxLife: 650,
    size: 4 + Math.random() * 4,
    color: ['#f5c842', '#66cc44', '#ffee66', '#88dd44'][Math.random() * 4 | 0],
    shape: 'rect',
  })),

  water: (x, y) => Array.from({ length: 7 }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * 90,
    vy: -Math.random() * 95 - 35,
    gravity: 220,
    life: 520, maxLife: 520,
    size: 3 + Math.random() * 3,
    color: 'rgba(80,160,255,0.85)',
    shape: 'circle',
  })),

  plant: (x, y) => Array.from({ length: 5 }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * 70,
    vy: -Math.random() * 65 - 20,
    gravity: 260,
    life: 420, maxLife: 420,
    size: 3 + Math.random() * 2,
    color: 'rgba(120,80,40,0.82)',
    shape: 'rect',
  })),

  coin: (x, y) => Array.from({ length: 6 }, (_, i) => ({
    x: x + (Math.random() - 0.5) * 30,
    y,
    vx: (Math.random() - 0.5) * 55,
    vy: -Math.random() * 70 - 40,
    gravity: 0,
    life: 750, maxLife: 750,
    size: 5,
    color: 'rgba(245,200,40,0.92)',
    shape: 'circle',
  })),

  leaf: (x, y) => [{
    x, y,
    vx: -14 - Math.random() * 20,
    vy: 14 + Math.random() * 14,
    gravity: 4,
    life: 7000, maxLife: 7000,
    size: 6 + Math.random() * 4,
    color: ['#5fae35', '#79c64a', '#8fbf3c'][Math.random() * 3 | 0],
    shape: 'leaf',
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 2.4,
    sway: Math.random() * Math.PI * 2,
  }],

  leafFall: (x, y) => [{
    x, y,
    vx: -14 - Math.random() * 20,
    vy: 14 + Math.random() * 14,
    gravity: 4,
    life: 7000, maxLife: 7000,
    size: 6 + Math.random() * 4,
    color: ['#d39a32', '#e6b048', '#c47a26'][Math.random() * 3 | 0],
    shape: 'leaf',
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 2.4,
    sway: Math.random() * Math.PI * 2,
  }],

  levelUp: (x, y) => Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const speed = 100 + Math.random() * 70;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0,
      life: 750, maxLife: 750,
      size: 5 + Math.random() * 3,
      color: 'rgba(255,220,40,0.92)',
      shape: 'star',
    };
  }),
};

export function emit(x, y, preset) {
  const maker = PRESETS[preset];
  if (maker) _pool.push(...maker(x, y));
}

export function tick(dt) {
  const sec = dt / 1000;
  for (let i = _pool.length - 1; i >= 0; i--) {
    const p = _pool[i];
    if (p.shape === 'leaf') {
      p.sway += sec * 2.2;
      p.x += (p.vx + Math.sin(p.sway) * 22) * sec;
      p.angle += p.spin * sec;
    } else {
      p.x += p.vx * sec;
    }
    p.y += p.vy * sec;
    p.vy += p.gravity * sec;
    p.life -= dt;
    if (p.life <= 0) _pool.splice(i, 1);
  }
}

export function draw(ctx) {
  for (const p of _pool) {
    let alpha = Math.max(0, p.life / p.maxLife);
    if (p.shape === 'leaf') {
      const age = p.maxLife - p.life;
      alpha = Math.min(1, age / 600, p.life / 1200) * 0.85;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.shape === 'leaf') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,80,20,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-p.size, 0);
      ctx.lineTo(p.size, 0);
      ctx.stroke();
    } else if (p.shape === 'circle') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'star') {
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate((1 - alpha) * Math.PI * 3);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const ia = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
        ctx.lineTo(Math.cos(ia) * p.size * 0.4, Math.sin(ia) * p.size * 0.4);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }
}
