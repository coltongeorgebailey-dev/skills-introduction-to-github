import { TILE_SIZE, CROPS, SKINS, HOME_COLS, HOME_ROWS, FURNITURE, SEASONS, ANIMALS, PALETTE, BUILDINGS } from './constants.js';

// Deterministic pseudo-random per tile position
function pr(x, y, s = 0) {
  let n = (x * 374761393 + y * 668265263 + s * 2654435761) | 0;
  n = ((n ^ (n >> 13)) * 1274126177) | 0;
  return ((n ^ (n >> 16)) >>> 0);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    // getBoundingClientRect is reliable after layout; offsetWidth may still reflect
    // the canvas's intrinsic 300×150 default at DOMContentLoaded construction time.
    const r = this.canvas.getBoundingClientRect();
    const w = Math.round(r.width)  || this.canvas.offsetWidth;
    const h = Math.round(r.height) || this.canvas.offsetHeight;
    if (w > 0) this.canvas.width  = w;
    if (h > 0) this.canvas.height = h;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }

  get w() { return this.canvas.width; }
  get h() { return this.canvas.height; }

  shake(intensity, duration) {
    this._shakeIntensity = intensity;
    this._shakeEnd = Date.now() + duration;
  }

  // Brief full-screen colour flash (e.g. black for sleep, white for season change)
  flashScreen(color, durationMs) {
    this._flashColor = color;
    this._flashEnd = Date.now() + durationMs;
    this._flashStart = Date.now();
    this._flashDuration = durationMs;
  }

  render(game, view, timestamp = 0, particles = null) {
    this._timestamp = timestamp;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);

    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (this._shakeEnd && Date.now() < this._shakeEnd) {
      shakeX = (Math.random() - 0.5) * this._shakeIntensity;
      shakeY = (Math.random() - 0.5) * this._shakeIntensity;
    }
    ctx.save();
    if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

    if (view === 'farm') this._renderFarm(game);
    else if (view === 'home') this._renderHome(game);
    else if (view === 'barn') this._renderBarn(game);

    ctx.restore();

    // Particles drawn in screen space after everything else
    if (particles) particles.draw(ctx);

    // Screen flash overlay (sleep / season change)
    if (this._flashEnd && Date.now() < this._flashEnd) {
      const elapsed = Date.now() - this._flashStart;
      const t = elapsed / this._flashDuration;
      // Fade in then out (peak at t=0.3)
      const alpha = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = this._flashColor || '#000000';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }

  // ── Farm ────────────────────────────────────────────────────────────────────

  _renderFarm(game) {
    const { ctx } = this;
    const { farm, player } = game;
    this._season = game.season;

    // Lush ground base (warm grass gradient instead of a flat fill)
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#6fb441');
    g.addColorStop(1, '#56962f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    this._drawWildBackground(ctx, farm);

    ctx.save();
    ctx.translate(-farm.camX, -farm.camY);

    // Dirt path border framing the plot
    this._drawFarmBorder(ctx, farm);

    // Decorative scenery (cottage, shed, barrels, flower beds) behind the fence
    this._drawProps(ctx, farm);

    // Fence
    this._drawFence(ctx, farm);

    // Only iterate tiles within the viewport (perf for large farms)
    const x0 = Math.max(0, Math.floor(farm.camX / TILE_SIZE));
    const y0 = Math.max(0, Math.floor(farm.camY / TILE_SIZE));
    const x1 = Math.min(farm.cols, Math.ceil((farm.camX + this.w) / TILE_SIZE));
    const y1 = Math.min(farm.rows, Math.ceil((farm.camY + this.h) / TILE_SIZE));

    // Tiles
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        this._drawTile(ctx, x, y, farm.tiles[y][x]);
      }
    }

    // Subtle tile grid (visible range only)
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    for (let y = y0; y <= y1; y++) {
      ctx.beginPath(); ctx.moveTo(x0 * TILE_SIZE, y * TILE_SIZE); ctx.lineTo(x1 * TILE_SIZE, y * TILE_SIZE); ctx.stroke();
    }
    for (let x = x0; x <= x1; x++) {
      ctx.beginPath(); ctx.moveTo(x * TILE_SIZE, y0 * TILE_SIZE); ctx.lineTo(x * TILE_SIZE, y1 * TILE_SIZE); ctx.stroke();
    }

    // Action tile highlight (dashed)
    const at = player.actionTile();
    if (farm.getTile(at.x, at.y)) {
      ctx.strokeStyle = 'rgba(255,255,180,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(at.x * TILE_SIZE + 2, at.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.setLineDash([]);
    }

    // Buildings + NPCs outside the fence
    this._drawBuildings(ctx, game);

    // Player
    this._drawPlayer(ctx, player);

    ctx.restore();

    // Atmosphere & lighting (screen space, over everything)
    this._drawClouds(ctx);
    this._drawSeasonOverlay(ctx, game.season);
    if (game.weather === 'rainy' || game.weather === 'stormy') {
      this._drawRainOverlay(ctx);
    }
    if (game.season === 3) this._drawSnowOverlay(ctx); // Winter
    this._drawWarmth(ctx);
  }

  // Soft drifting clouds → reads as moving daylight in a top-down scene
  _drawClouds(ctx) {
    const t = (this._timestamp || 0) / 1000;
    ctx.save();
    const blobs = [
      { bx: 0.12, by: 0.16, s: 1.0, spd: 7 },
      { bx: 0.55, by: 0.09, s: 1.4, spd: 5 },
      { bx: 0.80, by: 0.30, s: 0.9, spd: 9 },
      { bx: 0.35, by: 0.45, s: 1.1, spd: 6 },
    ];
    blobs.forEach((c, i) => {
      const span = this.w + 260;
      const cx = ((c.bx * span + t * c.spd) % span) - 130;
      const cy = c.by * this.h;
      const r = 34 * c.s;
      ctx.fillStyle = PALETTE.cloudSoft;
      [[-r, 4, r * 0.9], [0, -6, r * 1.15], [r, 2, r * 0.85], [r * 1.8, 8, r * 0.6]]
        .forEach(([dx, dy, rr]) => {
          ctx.beginPath();
          ctx.ellipse(cx + dx, cy + dy, rr, rr * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
        });
    });
    ctx.restore();
  }

  // Warm golden glow + gentle vignette for the cozy reference mood
  _drawWarmth(ctx) {
    ctx.save();
    ctx.fillStyle = PALETTE.warmGlow;
    ctx.fillRect(0, 0, this.w, this.h);
    const v = ctx.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, PALETTE.vignette);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  // Dirt path framing the plot (replaces the flat sandy band)
  _drawFarmBorder(ctx, farm) {
    const bw = 34;
    const fw = farm.cols * TILE_SIZE, fh = farm.rows * TILE_SIZE;
    ctx.fillStyle = PALETTE.path;
    ctx.fillRect(-bw, -bw, fw + bw * 2, fh + bw * 2);
    // Worn inner edge
    ctx.fillStyle = PALETTE.pathShade;
    ctx.fillRect(-bw, -bw, fw + bw * 2, 7);
    ctx.fillRect(-bw, fh + bw - 7, fw + bw * 2, 7);
    ctx.fillRect(-bw, -bw, 7, fh + bw * 2);
    ctx.fillRect(fw + bw - 7, -bw, 7, fh + bw * 2);
    // Stepping-stone speckle
    for (let i = 0; i < 90; i++) {
      const r = pr(i, i * 3, 7);
      const sx = -bw + (r % (fw + bw * 2));
      const sy = -bw + ((r >> 8) % (fw + bw * 2)) % (fh + bw * 2);
      // keep speckle on the border ring only
      if (sx > 4 && sx < fw - 4 && sy > 4 && sy < fh - 4) continue;
      ctx.fillStyle = (r & 1) ? 'rgba(150,118,70,0.6)' : 'rgba(200,170,120,0.6)';
      ctx.fillRect(sx, sy, 4 + (r & 3), 3 + ((r >> 2) & 2));
    }
  }

  _drawWildBackground(ctx, farm) {
    // Tile the wild grass
    const cols = Math.ceil(this.w / TILE_SIZE) + 4;
    const rows = Math.ceil(this.h / TILE_SIZE) + 4;
    const offX = -(farm.camX % TILE_SIZE) - TILE_SIZE * 2;
    const offY = -(farm.camY % TILE_SIZE) - TILE_SIZE * 2;
    const tileOffX = Math.floor(farm.camX / TILE_SIZE);
    const tileOffY = Math.floor(farm.camY / TILE_SIZE);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const wx = tileOffX - 2 + col;
        const wy = tileOffY - 2 + row;
        const px = offX + col * TILE_SIZE;
        const py = offY + row * TILE_SIZE;
        this._drawWildTile(ctx, px, py, wx, wy);
      }
    }

    // Distant leafy forest filling the screen edges (depth behind the plot)
    const edgeTrees = [
      [-3,-2],[-3,1],[-3,4],[-3,7],[-3,10],
      [cols+1,-2],[cols+1,1],[cols+1,4],[cols+1,7],[cols+1,10],
      [2,-3],[6,-3],[10,-3],[14,-3],[18,-3],
      [2,rows+2],[7,rows+2],[12,rows+2],[17,rows+2],
    ];
    edgeTrees.forEach(([col, row]) => {
      const px = offX + col * TILE_SIZE;
      const py = offY + row * TILE_SIZE;
      const seed = ((col & 7) << 3) ^ (row & 7);
      this._drawLeafyTree(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2, 0.92 + (seed % 5) * 0.12, seed);
    });

    // Fishing pond below-left of the farm
    const pondX = offX + (-4) * TILE_SIZE + TILE_SIZE * 1.5;
    const pondY = offY + (rows - 1) * TILE_SIZE + TILE_SIZE;
    this._drawPond(ctx, pondX, pondY);
    this._pondScreenX = pondX + farm.camX - TILE_SIZE;
    this._pondScreenY = pondY + farm.camY - TILE_SIZE;
    this._pondW = TILE_SIZE * 4;
    this._pondH = TILE_SIZE * 2.5;
  }

  _drawWildTile(ctx, px, py, tx, ty) {
    const h = pr(tx, ty);
    // Base dark green
    ctx.fillStyle = '#4a8a28';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Variation
    const v = h & 0xf;
    if (v < 3) { ctx.fillStyle = '#3a7020'; ctx.fillRect(px + (h & 0x1f) % (TILE_SIZE - 10), py + ((h >> 5) & 0x1f) % (TILE_SIZE - 10), 12, 8); }
    else if (v < 6) { ctx.fillStyle = '#5aaa30'; ctx.fillRect(px + ((h >> 4) & 0x1f) % (TILE_SIZE - 8), py + ((h >> 9) & 0x1f) % (TILE_SIZE - 8), 8, 5); }

    // Grass blades
    ctx.fillStyle = '#3a6820';
    for (let i = 0; i < 3; i++) {
      const bx = px + (pr(tx, ty, i) & 0x2f) % (TILE_SIZE - 6);
      const by = py + (pr(tx, ty, i + 10) & 0x2f) % (TILE_SIZE - 10);
      ctx.fillRect(bx, by + 4, 2, 7);
      ctx.fillRect(bx + 2, by, 2, 6);
    }
    // Wildflowers
    if ((h >> 14) === 0) {
      const fx = px + 6 + (h & 0x1f) % (TILE_SIZE - 12);
      const fy = py + 6 + ((h >> 6) & 0x1f) % (TILE_SIZE - 12);
      ctx.fillStyle = (h & 0x10) ? '#ffee44' : '#ff88aa';
      ctx.fillRect(fx, fy, 4, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx + 1, fy + 1, 2, 2);
    }
  }

  _drawPineTree(ctx, cx, cy) {
    const trunkColor = '#6B4020';
    const leafDark = '#2d6010';
    const leafMid = '#3a8020';
    const leafLight = '#50aa30';

    // Trunk
    ctx.fillStyle = trunkColor;
    ctx.fillRect(cx - 5, cy + 4, 10, 18);
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(cx - 3, cy + 4, 4, 18);

    // Three layers of pine
    const layers = [
      { y: cy - 8, w: 20, h: 14 },
      { y: cy - 20, w: 26, h: 16 },
      { y: cy - 32, w: 18, h: 14 },
    ];
    layers.forEach(({ y, w, h }) => {
      ctx.fillStyle = leafDark;
      ctx.beginPath();
      ctx.moveTo(cx, y - h / 2);
      ctx.lineTo(cx + w / 2, y + h / 2);
      ctx.lineTo(cx - w / 2, y + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = leafMid;
      ctx.beginPath();
      ctx.moveTo(cx, y - h / 2 - 2);
      ctx.lineTo(cx + w / 2 - 3, y + h / 2 - 3);
      ctx.lineTo(cx - w / 2 + 3, y + h / 2 - 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = leafLight;
      ctx.fillRect(cx - 3, y - h / 2 - 1, 5, 4);
    });
  }

  // Lush rounded deciduous tree — layered canopy blobs in a 3-tone ramp
  _drawLeafyTree(ctx, cx, cy, scale = 1, seed = 0) {
    const fall = this._season === 2;
    const [dark, mid, light] = fall ? PALETTE.foliageFall : PALETTE.foliage;
    const s = scale;

    // Ground shadow
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 26 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = PALETTE.trunk;
    ctx.fillRect(cx - 5 * s, cy - 2 * s, 10 * s, 30 * s);
    ctx.fillStyle = PALETTE.trunkHi;
    ctx.fillRect(cx - 5 * s, cy - 2 * s, 3 * s, 30 * s);

    // Canopy — overlapping blobs, deterministic jitter from seed
    const blob = (dx, dy, r, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * 0.92 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const j = (n) => ((pr(seed, n, 3) % 7) - 3);
    // dark base
    blob(-12 + j(1), -20 + j(2), 16, dark);
    blob(12 + j(3), -18 + j(4), 16, dark);
    blob(0 + j(5), -30 + j(6), 18, dark);
    blob(0 + j(7), -10 + j(8), 19, dark);
    // mid
    blob(-9, -22, 13, mid);
    blob(9, -20, 13, mid);
    blob(0, -31, 14, mid);
    blob(-2, -13, 14, mid);
    // sun-kissed highlight (upper-right)
    blob(5, -30, 9, light);
    blob(11, -23, 8, light);
    ctx.fillStyle = 'rgba(245,230,150,0.40)';
    ctx.beginPath();
    ctx.ellipse(cx + 9 * s, cy - 30 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // World-space scenery in the wild margins around the plot. The camera never
  // scrolls past 0,0, so showcase props live to the RIGHT and BELOW the plot
  // (reliably visible) while a forest ring hugs every border.
  _drawProps(ctx, farm) {
    const fw = farm.cols * TILE_SIZE, fh = farm.rows * TILE_SIZE;
    const rx = fw + 56;   // right wild strip
    const by = fh + 50;   // bottom wild strip

    this._drawForestRing(ctx, farm);

    // Cottage centerpiece + attached shed in the right margin
    this._drawCottage(ctx, rx + 10, 30);
    this._drawShed(ctx, rx + 24, 30 + TILE_SIZE * 3.1);
    this._drawTrough(ctx, rx + 30, 30 + TILE_SIZE * 5.0);
    this._drawPot(ctx, rx + 4, 30 + TILE_SIZE * 2.5);
    this._drawSign(ctx, rx + 150, 30 + TILE_SIZE * 4.0);

    // Cosy clutter along the bottom margin
    this._drawBarrel(ctx, 30, by);
    this._drawBarrel(ctx, 70, by + 6);
    this._drawCrate(ctx, 130, by - 2);
    this._drawLogs(ctx, 210, by + 4);
    this._drawPot(ctx, 300, by);
    this._drawFlowerBed(ctx, 360, by - 4, 1);
    this._drawFlowerBed(ctx, fw * 0.25, by - 4, 2);
  }

  _drawForestRing(ctx, farm) {
    const fw = farm.cols * TILE_SIZE, fh = farm.rows * TILE_SIZE;
    const m = 44; // hug the border so it stays near the viewport
    const pts = [];
    for (let x = -m; x <= fw + m; x += 76) { pts.push([x, -m]); pts.push([x + 28, fh + m]); }
    for (let y = 0; y <= fh; y += 78) { pts.push([-m, y]); pts.push([fw + m, y + 22]); }
    // Back-to-front so lower trees overlap correctly
    pts.sort((a, b) => a[1] - b[1]);
    pts.forEach(([x, y]) => {
      const seed = (x * 13 + y * 7) | 0;
      const sc = 0.82 + (Math.abs(seed) % 6) * 0.10;
      this._drawLeafyTree(ctx, x, y, sc, seed);
    });
  }

  _drawCottage(ctx, x, y) {
    const W = TILE_SIZE * 4.4, H = TILE_SIZE * 2.6;
    const skin = SKINS.house[0];
    const wall = PALETTE.plaster, beam = PALETTE.timber;

    // Soft shadow
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(x + W / 2, y + H + 8, W * 0.56, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = wall;
    ctx.fillRect(x, y, W, H);
    // Half-timber framing
    ctx.fillStyle = beam;
    ctx.fillRect(x, y, W, 6);
    ctx.fillRect(x, y + H - 6, W, 6);
    ctx.fillRect(x, y, 6, H);
    ctx.fillRect(x + W - 6, y, 6, H);
    ctx.fillRect(x + W / 2 - 3, y, 6, H);
    // Diagonal braces
    ctx.strokeStyle = beam;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + H - 8); ctx.lineTo(x + W / 2 - 8, y + 10);
    ctx.moveTo(x + W - 8, y + H - 8); ctx.lineTo(x + W / 2 + 8, y + 10);
    ctx.stroke();

    // Windows (warm-lit)
    [x + W * 0.20, x + W * 0.70].forEach(wx => {
      ctx.fillStyle = beam;
      ctx.fillRect(wx - 2, y + H * 0.34 - 2, 30, 26);
      ctx.fillStyle = PALETTE.glassWarm;
      ctx.fillRect(wx, y + H * 0.34, 26, 22);
      ctx.fillStyle = beam;
      ctx.fillRect(wx + 12, y + H * 0.34, 2, 22);
      ctx.fillRect(wx, y + H * 0.34 + 10, 26, 2);
    });
    // Door
    ctx.fillStyle = PALETTE.roofShade;
    ctx.fillRect(x + W * 0.44, y + H * 0.42, 24, H * 0.58);
    ctx.fillStyle = PALETTE.timberHi;
    ctx.fillRect(x + W * 0.44 + 17, y + H * 0.66, 3, 3);

    // Gable shingle roof (overhanging triangle + shingle rows)
    const rOver = 16, peakY = y - TILE_SIZE * 1.5;
    ctx.fillStyle = PALETTE.roofShade;
    ctx.beginPath();
    ctx.moveTo(x - rOver, y + 4);
    ctx.lineTo(x + W / 2, peakY);
    ctx.lineTo(x + W + rOver, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.roof;
    ctx.beginPath();
    ctx.moveTo(x - rOver + 4, y + 2);
    ctx.lineTo(x + W / 2, peakY + 6);
    ctx.lineTo(x + W + rOver - 4, y + 2);
    ctx.closePath();
    ctx.fill();
    // Shingle scallops
    ctx.fillStyle = PALETTE.roofHi;
    for (let row = 0; row < 5; row++) {
      const ry = peakY + 14 + row * 11;
      const half = ((ry - peakY) / (y + 4 - peakY)) * (W / 2 + rOver);
      for (let sx = -half; sx < half; sx += 14) {
        ctx.beginPath();
        ctx.arc(x + W / 2 + sx + 7, ry, 6, Math.PI, 0);
        ctx.fill();
      }
    }

    // Stone chimney + smoke
    const chX = x + W * 0.72, chY = peakY + TILE_SIZE * 0.5;
    ctx.fillStyle = PALETTE.stone;
    ctx.fillRect(chX, chY, 18, 34);
    ctx.fillStyle = PALETTE.stoneHi;
    ctx.fillRect(chX, chY, 18, 5);
    const t = (this._timestamp || 0) / 600;
    ctx.fillStyle = 'rgba(225,225,225,0.5)';
    for (let i = 0; i < 3; i++) {
      const pf = (t + i) % 3;
      ctx.beginPath();
      ctx.arc(chX + 9 + Math.sin(t + i) * 5, chY - 8 - pf * 14, 5 + pf * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flower balcony
    ctx.fillStyle = PALETTE.timberHi;
    ctx.fillRect(x + W * 0.16, y + H * 0.30, W * 0.68, 7);
    for (let i = 0; i < 9; i++) {
      const fx = x + W * 0.18 + i * (W * 0.64 / 8);
      ctx.fillStyle = '#3a8a2c';
      ctx.fillRect(fx, y + H * 0.30 - 6, 4, 7);
      ctx.fillStyle = ['#ff6f8b', '#ffd84a', '#ff9a3c'][i % 3];
      ctx.beginPath();
      ctx.arc(fx + 2, y + H * 0.30 - 7, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawShed(ctx, x, y) {
    const W = TILE_SIZE * 2.2, H = TILE_SIZE * 1.6;
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(x + W / 2, y + H + 6, W * 0.58, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Plank walls
    ctx.fillStyle = '#a9763f';
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = '#8a5c2e';
    ctx.lineWidth = 2;
    for (let px = x + 10; px < x + W; px += 12) {
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + H); ctx.stroke();
    }
    // Dark interior opening
    ctx.fillStyle = '#3a2614';
    ctx.fillRect(x + W * 0.28, y + H * 0.28, W * 0.44, H * 0.72);
    // Lean-to shingle roof
    ctx.fillStyle = PALETTE.roofShade;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 6);
    ctx.lineTo(x + W * 0.5, y - TILE_SIZE * 0.7);
    ctx.lineTo(x + W + 10, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.roof;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 4);
    ctx.lineTo(x + W * 0.5, y - TILE_SIZE * 0.7 + 6);
    ctx.lineTo(x + W + 6, y + 4);
    ctx.closePath();
    ctx.fill();
    // Hay bale at the door
    ctx.fillStyle = '#e3c645';
    ctx.fillRect(x + W * 0.04, y + H - 14, 22, 14);
    ctx.fillStyle = '#c8a824';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + W * 0.04 + 4 + i * 7, y + H - 12, 2, 11);
  }

  _drawBarrel(ctx, x, y) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath(); ctx.ellipse(x + 14, y + 34, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9a6a38';
    ctx.fillRect(x, y, 28, 34);
    ctx.fillStyle = '#7a4f28';
    ctx.fillRect(x, y + 6, 28, 4);
    ctx.fillRect(x, y + 24, 28, 4);
    ctx.fillStyle = '#b88a52';
    ctx.fillRect(x + 3, y, 4, 34);
    // Apples poking out
    ctx.fillStyle = '#cc3322';
    ctx.beginPath(); ctx.arc(x + 9, y - 1, 5, 0, Math.PI * 2);
    ctx.arc(x + 19, y - 2, 5, 0, Math.PI * 2); ctx.fill();
  }

  _drawCrate(ctx, x, y) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath(); ctx.ellipse(x + 16, y + 32, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5854a';
    ctx.fillRect(x, y, 32, 30);
    ctx.strokeStyle = '#8a6030';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1, y + 1, 30, 28);
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 31, y + 29);
    ctx.moveTo(x + 31, y + 1); ctx.lineTo(x + 1, y + 29);
    ctx.stroke();
    // Pumpkin on top
    ctx.fillStyle = '#e87820';
    ctx.beginPath(); ctx.ellipse(x + 16, y - 4, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a8020';
    ctx.fillRect(x + 14, y - 14, 4, 6);
  }

  _drawLogs(ctx, x, y) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath(); ctx.ellipse(x + 22, y + 24, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
    [[0, 10], [16, 10], [8, 0]].forEach(([dx, dy]) => {
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(x + dx, y + dy, 30, 13);
      ctx.fillStyle = '#caa06a';
      ctx.beginPath(); ctx.ellipse(x + dx, y + dy + 6, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a07a48';
      ctx.beginPath(); ctx.arc(x + dx, y + dy + 6, 2, 0, Math.PI * 2); ctx.fill();
    });
  }

  _drawTrough(ctx, x, y) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath(); ctx.ellipse(x + 24, y + 22, 28, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5e34';
    ctx.fillRect(x, y, 48, 18);
    ctx.fillStyle = '#5fa9c9';
    ctx.fillRect(x + 3, y + 3, 42, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + 7, y + 4, 14, 2);
  }

  _drawPot(ctx, x, y) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath(); ctx.ellipse(x + 12, y + 26, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5673a';
    ctx.beginPath();
    ctx.moveTo(x, y + 10); ctx.lineTo(x + 24, y + 10);
    ctx.lineTo(x + 20, y + 26); ctx.lineTo(x + 4, y + 26);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#caa06a';
    ctx.fillRect(x - 2, y + 8, 28, 4);
    // Bushy plant
    ctx.fillStyle = '#3a8a2c';
    [[12, 2, 11], [5, 6, 8], [19, 6, 8]].forEach(([dx, dy, r]) => {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(x + 12, y, 3, 0, Math.PI * 2); ctx.fill();
  }

  _drawSign(ctx, x, y) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath(); ctx.ellipse(x + 8, y + 36, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4524';
    ctx.fillRect(x + 6, y + 6, 5, 32);
    ctx.fillStyle = '#a9763f';
    ctx.fillRect(x - 6, y, 30, 18);
    ctx.fillStyle = '#7a4f28';
    ctx.fillRect(x - 6, y, 30, 3);
    ctx.fillStyle = '#5a3a1c';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FARM', x + 9, y + 13);
    ctx.textAlign = 'left';
  }

  _drawFlowerBed(ctx, x, y, seed) {
    ctx.fillStyle = '#5a3b22';
    ctx.fillRect(x, y + 18, TILE_SIZE * 1.6, 14);
    const cols = ['#ff6f8b', '#ffd84a', '#ff9a3c', '#ffffff', '#c46bd6'];
    for (let i = 0; i < 14; i++) {
      const r = pr(seed, i, 9);
      const fx = x + 4 + (r % (TILE_SIZE * 1.5));
      const fy = y + 8 + ((r >> 6) % 18);
      ctx.fillStyle = '#3a8a2c';
      ctx.fillRect(fx, fy + 3, 2, 8);
      ctx.fillStyle = cols[r % cols.length];
      ctx.beginPath(); ctx.arc(fx + 1, fy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8d8';
      ctx.beginPath(); ctx.arc(fx + 1, fy, 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  _drawFence(ctx, farm) {
    const fw = farm.cols * TILE_SIZE;
    const fh = farm.rows * TILE_SIZE;
    const post = '#7a5030', plank = '#9a6840', hi = '#c08050';

    const drawH = (x, y, w) => {
      ctx.fillStyle = plank; ctx.fillRect(x, y, w, 5);
      ctx.fillStyle = hi;    ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = '#5a3820'; ctx.fillRect(x, y + 4, w, 1);
    };
    const drawV = (x, y, h) => {
      ctx.fillStyle = plank; ctx.fillRect(x, y, 5, h);
      ctx.fillStyle = hi;    ctx.fillRect(x, y, 1, h);
    };
    const drawPost = (x, y) => {
      ctx.fillStyle = post;
      ctx.fillRect(x - 4, y - 4, 9, 9);
      ctx.fillStyle = hi;
      ctx.fillRect(x - 3, y - 3, 4, 2);
    };

    // Top fence (gap = a gate the player walks through to reach the buildings)
    const gateX0 = Math.floor(farm.cols / 2) - 1, gateX1 = gateX0 + 1;
    for (let x = 0; x < farm.cols; x++) {
      if (x === gateX0 || x === gateX1) continue;
      drawH(x * TILE_SIZE, -18, TILE_SIZE);
      drawH(x * TILE_SIZE, -10, TILE_SIZE);
    }
    // Bottom fence
    for (let x = 0; x < farm.cols; x++) {
      drawH(x * TILE_SIZE, fh + 4, TILE_SIZE);
      drawH(x * TILE_SIZE, fh + 12, TILE_SIZE);
    }
    // Left fence
    for (let y = 0; y < farm.rows; y++) {
      drawV(-18, y * TILE_SIZE, TILE_SIZE);
      drawV(-10, y * TILE_SIZE, TILE_SIZE);
    }
    // Right fence
    for (let y = 0; y < farm.rows; y++) {
      drawV(fw + 4, y * TILE_SIZE, TILE_SIZE);
      drawV(fw + 12, y * TILE_SIZE, TILE_SIZE);
    }
    // Posts at tile boundaries
    for (let x = 0; x <= farm.cols; x++) {
      if (x !== gateX0 + 1) drawPost(x * TILE_SIZE, -14);
      drawPost(x * TILE_SIZE, fh + 8);
    }
    for (let y = 0; y <= farm.rows; y++) {
      drawPost(-14, y * TILE_SIZE);
      drawPost(fw + 8, y * TILE_SIZE);
    }
  }

  // ── Tiles ────────────────────────────────────────────────────────────────────

  _drawTile(ctx, x, y, tile) {
    const px = x * TILE_SIZE, py = y * TILE_SIZE;
    if (tile.type === 'grass') {
      this._drawGrassTile(ctx, px, py, x, y);
    } else {
      this._drawDirtTile(ctx, px, py, x, y, tile.crop != null && !tile.crop.isDry);
      if (tile.crop) {
        this._drawCrop(ctx, px, py, tile.crop);
        this._drawCropTimerOverlay(ctx, px, py, tile.crop);
      }
    }
  }

  _formatMs(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  _drawCropTimerOverlay(ctx, px, py, crop) {
    const def = CROPS[crop.kind];
    if (!def) return;

    const stripH = 17;
    const stripY = py + TILE_SIZE - stripH;
    const cx = px + TILE_SIZE / 2;
    const cy = stripY + stripH / 2 + 1;

    let bgColor, label;

    if (crop.stage >= 3) {
      bgColor = 'rgba(40,180,50,0.92)';
      label = '✂Ready';
    } else if (crop.isDry) {
      bgColor = 'rgba(210,55,30,0.95)';
      label = '⚠Water';
    } else {
      const now = Date.now();
      const msUntilDry = def.waterIntervalMs - (now - crop.lastWateredAt);
      if (msUntilDry < 30000) {
        bgColor = 'rgba(210,150,0,0.92)';
        label = '💧' + this._formatMs(msUntilDry);
      } else {
        bgColor = 'rgba(15,15,15,0.7)';
        label = '⏱' + this._formatMs(def.growMs - crop.totalGrownMs);
      }
    }

    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.fillRect(px, stripY, TILE_SIZE, stripH);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(label, cx + 0.5, cy + 0.5);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, cy);
    ctx.restore();
  }

  _drawGrassTile(ctx, px, py, tx, ty) {
    const h = pr(tx, ty);
    ctx.fillStyle = '#74b542';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Top-left highlight
    ctx.fillStyle = '#8ad04e';
    ctx.fillRect(px, py, TILE_SIZE, 5);
    ctx.fillRect(px, py, 5, TILE_SIZE);

    // Bottom-right shadow
    ctx.fillStyle = '#5d9a32';
    ctx.fillRect(px, py + TILE_SIZE - 6, TILE_SIZE, 6);
    ctx.fillRect(px + TILE_SIZE - 6, py, 6, TILE_SIZE);

    // Texture patch
    const v = h & 0xf;
    if (v < 4) {
      ctx.fillStyle = '#508825';
      ctx.fillRect(px + (h & 0x1f) % (TILE_SIZE - 12), py + ((h >> 5) & 0x1f) % (TILE_SIZE - 12), 10, 7);
    } else if (v < 8) {
      ctx.fillStyle = '#88d050';
      ctx.fillRect(px + ((h >> 3) & 0x1f) % (TILE_SIZE - 10), py + ((h >> 8) & 0x1f) % (TILE_SIZE - 10), 8, 5);
    }

    // Grass blades
    ctx.fillStyle = '#3a7820';
    for (let i = 0; i < 3; i++) {
      const bx = px + pr(tx, ty, i * 3) % (TILE_SIZE - 6);
      const by = py + pr(tx, ty, i * 3 + 1) % (TILE_SIZE - 10);
      ctx.fillRect(bx, by + 4, 2, 6);
      ctx.fillRect(bx + 2, by + 1, 2, 5);
    }

    // Small bush (occasional)
    if ((h >> 12 & 0x7) === 0) {
      const bx = px + 10 + (h & 0xf), by = py + 14 + ((h >> 4) & 0xf);
      ctx.fillStyle = '#3a7a26';
      [[0, 0, 8], [7, 2, 6], [-6, 3, 6]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.arc(bx + dx, by + dy, r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = '#56a635';
      ctx.beginPath(); ctx.arc(bx - 1, by - 2, 4, 0, Math.PI * 2); ctx.fill();
    }

    // Flower cluster (rare) — a few blooms together, not lone dots
    if ((h >> 14) < 0x2) {
      const cx0 = px + 8 + (h & 0x1f) % (TILE_SIZE - 18);
      const cy0 = py + 8 + ((h >> 6) & 0x1f) % (TILE_SIZE - 18);
      const cols = ['#ff8fb0', '#ffe24a', '#ffffff', '#ff9a3c'];
      for (let i = 0; i < 4; i++) {
        const fr = pr(tx, ty, 20 + i);
        const fx = cx0 + (fr % 14);
        const fy = cy0 + ((fr >> 5) % 12);
        ctx.fillStyle = '#3a8a2c';
        ctx.fillRect(fx, fy + 2, 1, 4);
        ctx.fillStyle = cols[fr % cols.length];
        ctx.beginPath(); ctx.arc(fx, fy, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff8d8';
        ctx.fillRect(fx, fy, 1, 1);
      }
    }

    // Subtle vignette: darkened 1px edges on bottom and right for Stardew grid feel
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
    ctx.fillRect(px + TILE_SIZE - 1, py, 1, TILE_SIZE);
  }

  _drawDirtTile(ctx, px, py, tx, ty, watered) {
    const h = pr(tx, ty);
    if (watered) {
      ctx.fillStyle = '#4a2e14';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // Wet patches
      ctx.fillStyle = '#3a3828';
      ctx.fillRect(px + 4, py + 6, TILE_SIZE - 8, 5);
      ctx.fillRect(px + 8, py + 20, TILE_SIZE - 16, 4);
      ctx.fillRect(px + 4, py + 32, TILE_SIZE - 8, 4);
      // Water sheen
      ctx.fillStyle = '#5a6060';
      ctx.fillRect(px + 12, py + 8, 10, 2);
      ctx.fillRect(px + 20, py + 22, 8, 1);
    } else {
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // Lighter ridges (plowed rows)
      ctx.fillStyle = '#a07050';
      for (let r = 0; r < 3; r++) ctx.fillRect(px + 2, py + 6 + r * 13, TILE_SIZE - 4, 4);
      // Darker furrows
      ctx.fillStyle = '#6a4020';
      for (let r = 0; r < 3; r++) ctx.fillRect(px + 2, py + 10 + r * 13, TILE_SIZE - 4, 3);
      // Edge shadow
      ctx.fillStyle = '#70481c';
      ctx.fillRect(px + TILE_SIZE - 5, py, 5, TILE_SIZE);
      ctx.fillRect(px, py + TILE_SIZE - 5, TILE_SIZE, 5);
      // Pebbles
      if (h & 1) { ctx.fillStyle = '#666'; ctx.fillRect(px + h % (TILE_SIZE - 8) + 4, py + ((h >> 6) % (TILE_SIZE - 8)) + 4, 3, 2); }
      if (h & 2) { ctx.fillStyle = '#888'; ctx.fillRect(px + ((h >> 4) % (TILE_SIZE - 8)) + 4, py + ((h >> 10) % (TILE_SIZE - 8)) + 4, 2, 2); }
    }
  }

  // ── Crops ────────────────────────────────────────────────────────────────────

  _drawCrop(ctx, px, py, crop) {
    // Soft contact shadow grounds the plant
    if (crop.stage >= 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(px + TILE_SIZE / 2, py + TILE_SIZE - 9,
        9 + crop.stage * 2.5, 4 + crop.stage, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    switch (crop.kind) {
      case 'wheat': case 'golden_wheat': this._drawWheat(ctx, px, py, crop.stage, crop.kind === 'golden_wheat'); break;
      case 'tomato':  this._drawTomato(ctx, px, py, crop.stage); break;
      case 'corn':    this._drawCorn(ctx, px, py, crop.stage); break;
      case 'pumpkin': this._drawPumpkin(ctx, px, py, crop.stage); break;
      default: {
        const def = CROPS[crop.kind];
        if (def) this._drawGenericCrop(ctx, px + TILE_SIZE/2, py + TILE_SIZE/2, crop.stage, def.color, def.darkColor);
      }
    }
  }

  _drawWheat(ctx, px, py, stage, golden) {
    const stem = '#4a8820', grain = golden ? '#ffe040' : '#f0c020', grainD = golden ? '#c8a010' : '#b88800';
    if (stage === 0) {
      ctx.fillStyle = '#6B4020'; ctx.fillRect(px + 20, py + 34, 8, 5);
      ctx.fillStyle = '#88bb40'; ctx.fillRect(px + 23, py + 28, 3, 8);
      return;
    }
    const stalks = 3;
    const xs = [14, 22, 30];
    for (let i = 0; i < stalks; i++) {
      const sx = px + xs[i];
      if (stage === 1) {
        ctx.fillStyle = stem; ctx.fillRect(sx, py + 28, 3, 12);
        ctx.fillStyle = '#66bb30'; ctx.fillRect(sx - 5, py + 28, 7, 3); ctx.fillRect(sx + 2, py + 33, 7, 3);
      } else if (stage === 2) {
        ctx.fillStyle = stem; ctx.fillRect(sx, py + 18, 3, 22);
        ctx.fillStyle = '#66bb30'; ctx.fillRect(sx - 6, py + 22, 9, 4); ctx.fillRect(sx + 2, py + 30, 9, 4);
      } else {
        // Full wheat stalk
        ctx.fillStyle = '#6a9a30'; ctx.fillRect(sx, py + 14, 3, 26);
        // Grain head
        ctx.fillStyle = grain;
        ctx.fillRect(sx - 1, py + 6, 5, 10);
        ctx.fillStyle = grainD;
        ctx.fillRect(sx, py + 7, 2, 2); ctx.fillRect(sx, py + 11, 2, 2);
        // Awns (hair on top)
        ctx.fillStyle = grain;
        for (let a = 0; a < 3; a++) ctx.fillRect(sx + a - 1, py + 4 + a, 1, 3);
        // Leaves
        ctx.fillStyle = '#66bb30';
        ctx.fillRect(sx - 7, py + 20, 8, 3); ctx.fillRect(sx + 2, py + 28, 8, 3);
      }
    }
    if (stage >= 3) {
      ctx.strokeStyle = 'rgba(255,220,0,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 6, py + 4, 36, 38); ctx.strokeStyle = 'transparent';
    }
  }

  _drawTomato(ctx, px, py, stage) {
    if (stage === 0) {
      ctx.fillStyle = '#6B4020'; ctx.fillRect(px + 20, py + 34, 8, 5);
      ctx.fillStyle = '#88bb40'; ctx.fillRect(px + 23, py + 28, 3, 8);
      return;
    }
    const vineColor = '#3a7820';
    // Main stake/stem
    ctx.fillStyle = vineColor; ctx.fillRect(px + 22, py + (stage < 2 ? 24 : 10), 4, stage < 2 ? 16 : 30);
    // Horizontal supports
    ctx.fillStyle = '#4a9828';
    ctx.fillRect(px + 12, py + 26, 24, 3);
    if (stage >= 2) ctx.fillRect(px + 8, py + 16, 32, 3);
    // Leaves
    ctx.fillStyle = '#5aaa30';
    ctx.fillRect(px + 9, py + 22, 12, 6); ctx.fillRect(px + 27, py + 20, 12, 6);
    if (stage >= 2) { ctx.fillRect(px + 7, py + 12, 12, 6); ctx.fillRect(px + 29, py + 14, 12, 6); }
    // Tomatoes
    if (stage >= 2) {
      const count = stage >= 3 ? 3 : 1;
      const pos = [[16, 28], [29, 23], [22, 31]];
      pos.slice(0, count).forEach(([tx, ty]) => {
        const ripe = stage >= 3;
        ctx.fillStyle = ripe ? '#cc2020' : '#8aaa22';
        ctx.beginPath(); ctx.arc(px + tx, py + ty, 6, 0, Math.PI * 2); ctx.fill();
        if (ripe) {
          ctx.fillStyle = '#ee4444'; ctx.fillRect(px + tx - 3, py + ty - 3, 4, 4);
          ctx.fillStyle = '#227722'; ctx.fillRect(px + tx - 1, py + ty - 8, 3, 5);
          ctx.fillRect(px + tx - 4, py + ty - 7, 4, 2);
        }
      });
    }
    if (stage >= 3) {
      ctx.strokeStyle = 'rgba(255,80,40,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 4, py + 4, 40, 40);
    }
  }

  _drawCorn(ctx, px, py, stage) {
    if (stage === 0) {
      ctx.fillStyle = '#6B4020'; ctx.fillRect(px + 20, py + 34, 8, 5);
      ctx.fillStyle = '#aacc40'; ctx.fillRect(px + 23, py + 28, 3, 8);
      return;
    }
    const heights = [0, 20, 30, 38];
    const stemH = heights[stage] || 20;
    const stemY = py + TILE_SIZE - 8 - stemH;
    // Stem
    ctx.fillStyle = '#3a8820'; ctx.fillRect(px + 21, stemY, 6, stemH + 4);
    ctx.fillStyle = '#2a6818'; ctx.fillRect(px + 21, stemY, 2, stemH + 4);
    // Leaves
    ctx.fillStyle = '#4aaa28';
    if (stage >= 1) { ctx.fillRect(px + 13, stemY + 10, 10, 5); ctx.fillRect(px + 27, stemY + 14, 10, 5); }
    if (stage >= 2) { ctx.fillRect(px + 9, stemY + 4, 13, 5); ctx.fillRect(px + 28, stemY + 6, 12, 5); }
    // Corn cob
    if (stage >= 3) {
      // Husk leaves
      ctx.fillStyle = '#4aaa28'; ctx.fillRect(px + 18, stemY - 5, 14, 22);
      ctx.fillStyle = '#3a8820'; ctx.fillRect(px + 18, stemY - 3, 4, 20); ctx.fillRect(px + 28, stemY - 3, 4, 20);
      // Cob
      ctx.fillStyle = '#f0d050'; ctx.fillRect(px + 22, stemY - 2, 8, 18);
      ctx.fillStyle = '#c8a808';
      for (let r = 0; r < 5; r++) ctx.fillRect(px + 22, stemY - 1 + r * 4, 8, 1);
      ctx.fillStyle = '#e8c840'; ctx.fillRect(px + 22, stemY - 2, 4, 18);
      // Silk
      ctx.fillStyle = '#ffcc44'; ctx.fillRect(px + 22, stemY - 9, 3, 7); ctx.fillRect(px + 26, stemY - 8, 3, 6);
      ctx.strokeStyle = 'rgba(240,200,0,0.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 6, py + 4, 36, 40);
    }
  }

  _drawPumpkin(ctx, px, py, stage) {
    if (stage === 0) {
      ctx.fillStyle = '#6B4020'; ctx.fillRect(px + 20, py + 34, 8, 5);
      ctx.fillStyle = '#88aa40'; ctx.fillRect(px + 23, py + 28, 3, 8);
      return;
    }
    const vy = py + 32;
    // Ground vine
    ctx.fillStyle = '#4a8820'; ctx.fillRect(px + 4, vy, TILE_SIZE - 8, 4);
    ctx.fillStyle = '#3a6818'; ctx.fillRect(px + 4, vy + 2, TILE_SIZE - 8, 2);
    // Leaves
    ctx.fillStyle = '#5aaa30';
    ctx.fillRect(px + 5, vy - 6, 12, 8); ctx.fillRect(px + 32, vy - 6, 12, 8);
    if (stage >= 2) ctx.fillRect(px + 18, vy - 8, 14, 9);
    // Pumpkin
    if (stage >= 2) {
      const big = stage >= 3;
      const r = big ? 11 : 6;
      const pcx = px + 24, pcy = vy - r;
      // 3 lobes
      const c = big ? '#e87820' : '#906010';
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(pcx - r * 0.5, pcy, r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pcx, pcy, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pcx + r * 0.5, pcy, r * 0.7, 0, Math.PI * 2); ctx.fill();
      if (big) {
        // Highlights
        ctx.fillStyle = '#f09840'; ctx.fillRect(pcx - 4, pcy - r + 2, 6, 5);
        // Vertical ridges
        ctx.fillStyle = '#c05010';
        ctx.fillRect(pcx, pcy - r + 1, 2, r * 2 - 2);
        ctx.fillRect(pcx - 6, pcy - r + 3, 2, r * 2 - 6);
        ctx.fillRect(pcx + 4, pcy - r + 3, 2, r * 2 - 6);
        // Stem
        ctx.fillStyle = '#5a8020'; ctx.fillRect(pcx - 2, pcy - r - 6, 4, 7);
        ctx.fillStyle = '#4a6818'; ctx.fillRect(pcx - 4, pcy - r - 4, 4, 4);
        ctx.strokeStyle = 'rgba(220,120,0,0.45)'; ctx.lineWidth = 2;
        ctx.strokeRect(px + 4, py + 4, 40, 40);
      }
    }
  }

  _drawGenericCrop(ctx, cx, cy, stage, color, darkColor) {
    if (stage === 0) {
      ctx.fillStyle = '#5a3010'; ctx.beginPath(); ctx.arc(cx, cy + 8, 4, 0, Math.PI * 2); ctx.fill();
    } else if (stage === 1) {
      ctx.fillStyle = '#30aa30'; ctx.fillRect(cx - 2, cy + 4, 4, 12); ctx.fillRect(cx - 8, cy + 4, 8, 4);
    } else if (stage === 2) {
      ctx.fillStyle = '#228B22'; ctx.fillRect(cx - 2, cy - 4, 4, 18);
      ctx.fillStyle = darkColor; ctx.fillRect(cx - 7, cy - 4, 14, 8);
    } else {
      ctx.fillStyle = '#228B22'; ctx.fillRect(cx - 2, cy - 6, 4, 20);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy - 8, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = darkColor; ctx.beginPath(); ctx.arc(cx - 3, cy - 10, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Player ───────────────────────────────────────────────────────────────────

  _drawPlayer(ctx, player) {
    const px = player.gridX * TILE_SIZE;
    const py = player.gridY * TILE_SIZE;
    const skin = SKINS.player.find(s => s.id === player.skin) || SKINS.player[0];
    const { facingDX: fdx, facingDY: fdy } = player;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(px + 24, py + 42, 13, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Shoes
    ctx.fillStyle = '#332211';
    if (fdx !== 0) {
      ctx.fillRect(px + (fdx > 0 ? 28 : 14), py + 38, 10, 5);
    } else {
      ctx.fillRect(px + 14, py + 38, 9, 5);
      ctx.fillRect(px + 25, py + 38, 9, 5);
    }

    // Pants / legs
    ctx.fillStyle = '#334488';
    if (fdy > 0 || fdy === 0) {
      ctx.fillRect(px + 16, py + 30, 7, 10);
      ctx.fillRect(px + 25, py + 30, 7, 10);
    } else {
      ctx.fillRect(px + 14, py + 30, 20, 10);
    }
    // Pants highlight
    ctx.fillStyle = '#4455aa';
    ctx.fillRect(px + 17, py + 30, 3, 8);

    // Body (shirt)
    ctx.fillStyle = skin.bodyColor;
    ctx.fillRect(px + 13, py + 18, 22, 14);
    ctx.fillStyle = this._lighten(skin.bodyColor, 30);
    ctx.fillRect(px + 13, py + 18, 22, 3); // collar highlight

    // Arms
    ctx.fillStyle = skin.bodyColor;
    ctx.fillRect(px + 5, py + 19, 9, 12);
    ctx.fillRect(px + 34, py + 19, 9, 12);

    // Hands
    ctx.fillStyle = '#f0c090';
    ctx.fillRect(px + 5, py + 29, 8, 6);
    ctx.fillRect(px + 34, py + 29, 8, 6);

    // Neck
    ctx.fillStyle = '#f0c090';
    ctx.fillRect(px + 20, py + 14, 8, 6);

    // Head
    ctx.fillStyle = '#f0c090';
    ctx.fillRect(px + 13, py + 4, 22, 16);
    // Head shadow side
    ctx.fillStyle = '#d4a878';
    ctx.fillRect(px + 32, py + 5, 3, 14);

    // Hair / back of head for facing up
    if (fdy < 0) {
      ctx.fillStyle = skin.hatColor;
      ctx.fillRect(px + 13, py + 4, 22, 14);
    } else {
      // Eyes
      ctx.fillStyle = '#222';
      if (fdy > 0) {
        ctx.fillRect(px + 17, py + 10, 4, 4);
        ctx.fillRect(px + 27, py + 10, 4, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(px + 18, py + 10, 1, 1); ctx.fillRect(px + 28, py + 10, 1, 1);
      } else if (fdx > 0) {
        ctx.fillRect(px + 29, py + 10, 4, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(px + 30, py + 10, 1, 1);
      } else {
        ctx.fillRect(px + 15, py + 10, 4, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(px + 16, py + 10, 1, 1);
      }
      // Smile (facing down)
      if (fdy > 0) {
        ctx.fillStyle = '#c07050';
        ctx.fillRect(px + 18, py + 15, 12, 2);
        ctx.fillRect(px + 17, py + 14, 2, 2);
        ctx.fillRect(px + 29, py + 14, 2, 2);
      }
    }

    // Hat brim
    ctx.fillStyle = skin.hatColor;
    ctx.fillRect(px + 10, py + 2, 28, 5);
    // Hat crown
    ctx.fillRect(px + 14, py - 7, 20, 11);
    // Hat highlight
    ctx.fillStyle = this._lighten(skin.hatColor, 40);
    ctx.fillRect(px + 14, py - 6, 20, 2);
    // Hat band
    ctx.fillStyle = this._darken(skin.hatColor, 30);
    ctx.fillRect(px + 14, py + 1, 20, 3);

    // Tool
    this._drawTool(ctx, px, py, player.tool, fdx, fdy);
  }

  _drawTool(ctx, px, py, tool, fdx, fdy) {
    const colors = { hoe: '#8B5E3C', water: '#3377bb', seed: '#88cc44', scythe: '#bbbbbb' };
    const handleColor = '#7a5030';
    const headColor = colors[tool] || '#888';

    let hx, hy, hw, hh, headX, headY, headW, headH;

    if (fdx > 0) {
      hx = px + 42; hy = py + 22; hw = 3; hh = 14;
      headX = px + 42; headY = py + 20; headW = 8; headH = 4;
    } else if (fdx < 0) {
      hx = px + 3; hy = py + 22; hw = 3; hh = 14;
      headX = px + 2; headY = py + 20; headW = 8; headH = 4;
    } else if (fdy < 0) {
      hx = px + 32; hy = py + 10; hw = 3; hh = 14;
      headX = px + 28; headY = py + 8; headW = 10; headH = 4;
    } else {
      hx = px + 35; hy = py + 32; hw = 3; hh = 10;
      headX = px + 30; headY = py + 40; headW = 10; headH = 4;
    }

    if (tool === 'water') {
      // Watering can silhouette
      ctx.fillStyle = headColor;
      ctx.fillRect(hx - 2, hy - 4, 12, 10);
      ctx.fillStyle = '#55aaff';
      ctx.fillRect(hx - 1, hy - 3, 10, 8);
      ctx.fillStyle = headColor;
      ctx.fillRect(hx + 8, hy - 6, 4, 4); // spout
    } else {
      ctx.fillStyle = handleColor; ctx.fillRect(hx, hy, hw, hh);
      ctx.fillStyle = headColor;   ctx.fillRect(headX, headY, headW, headH);
    }
  }

  _lighten(hex, amt) {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (n >> 16) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }

  _darken(hex, amt) { return this._lighten(hex, -amt); }

  // ── Buildings + NPCs ─────────────────────────────────────────────────────────

  _drawBuildings(ctx, game) {
    const { player } = game;
    this._npcRects = [];
    for (const b of BUILDINGS) {
      const bx = b.x * TILE_SIZE;
      const by = b.y * TILE_SIZE;
      const bw = b.w * TILE_SIZE; // 96
      const bh = b.h * TILE_SIZE; // 96

      // ── Ground shadow (soft ellipse) ─────────────────────────────────────────
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(bx + bw / 2, by + bh + 4, bw / 2 + 4, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── Foundation (bottom 12px) ─────────────────────────────────────────────
      const foundY = by + bh - 12;
      ctx.fillStyle = PALETTE.stone;
      ctx.fillRect(bx, foundY, bw, 12);
      // Brick-pattern alternating rows
      for (let row = 0; row < 2; row++) {
        const fy = foundY + row * 6;
        const offset = (row % 2) * 14;
        ctx.fillStyle = row % 2 === 0 ? PALETTE.stoneHi : PALETTE.stone;
        for (let bk = -1; bk < 8; bk++) {
          const fx = bx + bk * 28 + offset;
          ctx.fillRect(fx + 1, fy + 1, 26, 4);
        }
      }
      // Foundation bottom shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(bx, foundY + 10, bw, 2);

      // ── Walls (72px tall above foundation) ──────────────────────────────────
      const wallTop = by + bh - 12 - 72;
      const wallH = 72;
      ctx.fillStyle = b.color;
      ctx.fillRect(bx, wallTop, bw, wallH);

      // Horizontal plank lines every 8px
      const plankDark = this._darken(b.color, 18);
      for (let row = 1; row < 9; row++) {
        ctx.fillStyle = plankDark;
        ctx.fillRect(bx, wallTop + row * 8, bw, 1);
      }

      // Vertical corner posts
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(bx, wallTop, 5, wallH);
      ctx.fillRect(bx + bw - 5, wallTop, 5, wallH);
      ctx.fillStyle = PALETTE.timberHi;
      ctx.fillRect(bx + 1, wallTop, 2, wallH);

      // Right-side shadow strip
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(bx + bw - 13, wallTop, 8, wallH);

      // ── Per-building roof colours (Stardew-style distinct roofs) ────────────
      const ROOF_COLORS = {
        market:   { light: '#e04820', dark: '#903010' }, // terracotta
        barn:     { light: '#8a2010', dark: '#541408' }, // deep barn red
        home:     { light: '#4a78b8', dark: '#2e4e7e' }, // slate blue
        upgrades: { light: '#7a7a8c', dark: '#4a4a5e' }, // steel grey
        skins:    { light: '#9850d0', dark: '#5c2e88' }, // vivid purple
        gems:     { light: '#28a8c0', dark: '#1a6878' }, // teal
        quests:   { light: '#c08830', dark: '#7a5418' }, // amber
      };
      const rc = ROOF_COLORS[b.id] || { light: PALETTE.roofHi, dark: PALETTE.roofShade };

      // ── Stone cobblestone path leading to door ───────────────────────────────
      const doorCX = bx + bw / 2;
      for (let step = 0; step < 3; step++) {
        const py2 = by + bh + step * 10;
        ctx.fillStyle = step % 2 === 0 ? PALETTE.stone : PALETTE.stoneHi;
        ctx.fillRect(doorCX - 14, py2, 28, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(doorCX - 14, py2 + 7, 28, 1);
      }

      // ── Gable Roof (taller, more Stardew-like) ───────────────────────────────
      const roofBase = wallTop;       // roof starts at wall top
      const peakX = bx + bw / 2;
      const peakY = roofBase - 44;    // 44px above wall top (was 36 — taller!)
      const eaveL = bx - 10;          // 10px overhang
      const eaveR = bx + bw + 10;

      // Left slope (lighter — top-left light source)
      ctx.fillStyle = rc.light;
      ctx.beginPath();
      ctx.moveTo(eaveL, roofBase);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(peakX, roofBase);
      ctx.closePath();
      ctx.fill();

      // Right slope (darker)
      ctx.fillStyle = rc.dark;
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.lineTo(eaveR, roofBase);
      ctx.lineTo(peakX, roofBase);
      ctx.closePath();
      ctx.fill();

      // Shingle rows on left slope (4 rows, lighter/darker alternating strips)
      const slopeH = roofBase - peakY;
      for (let row = 1; row <= 4; row++) {
        const t = row / 4;
        const sy = peakY + slopeH * t;
        const halfW = (bw / 2 + 8) * t;
        ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
        ctx.beginPath();
        ctx.moveTo(peakX - halfW, sy);
        ctx.lineTo(peakX, sy);
        ctx.lineTo(peakX, sy - slopeH / 4);
        ctx.lineTo(peakX - (bw / 2 + 8) * (row - 1) / 4, sy - slopeH / 4);
        ctx.closePath();
        ctx.fill();
      }
      // Shingle rows on right slope
      for (let row = 1; row <= 4; row++) {
        const t = row / 4;
        const sy = peakY + slopeH * t;
        const halfW = (bw / 2 + 8) * t;
        ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.moveTo(peakX, sy);
        ctx.lineTo(peakX + halfW, sy);
        ctx.lineTo(peakX + (bw / 2 + 8) * (row - 1) / 4, sy - slopeH / 4);
        ctx.lineTo(peakX, sy - slopeH / 4);
        ctx.closePath();
        ctx.fill();
      }

      // Ridge cap at peak
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(peakX - 3, peakY - 2, 6, slopeH + 4);

      // Eave shadow (where roof meets wall)
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(bx, roofBase, bw, 4);

      // ── Windows (left + right, bright warm glow) ─────────────────────────────
      const drawWindow = (wx, wy) => {
        // Warm glow halo behind window
        ctx.fillStyle = 'rgba(255,230,100,0.25)';
        ctx.fillRect(wx - 4, wy - 4, 36, 30);
        // Outer frame
        ctx.fillStyle = PALETTE.timber;
        ctx.fillRect(wx, wy, 28, 22);
        // Bright warm glass
        ctx.fillStyle = '#ffe048';
        ctx.fillRect(wx + 2, wy + 2, 24, 18);
        // Cross divider
        ctx.fillStyle = PALETTE.timber;
        ctx.fillRect(wx + 2, wy + 11, 24, 2);
        ctx.fillRect(wx + 13, wy + 2, 2, 18);
        // White glints (pixel art sparkle)
        ctx.fillStyle = 'rgba(255,255,255,0.90)';
        ctx.fillRect(wx + 3, wy + 3, 2, 2);
        ctx.fillRect(wx + 16, wy + 3, 2, 2);
      };
      const winY = wallTop + 14;
      drawWindow(bx + 8, winY);           // left window
      drawWindow(bx + bw - 36, winY);     // right window

      // ── Door (centered horizontally, at building bottom) ─────────────────────
      const doorW = 22, doorH = 32;
      const doorX = bx + bw / 2 - doorW / 2;
      const doorY = by + bh - doorH - 12; // sits on top of foundation
      // Frame
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(doorX, doorY, doorW, doorH);
      // Panel
      ctx.fillStyle = PALETTE.roofShade;
      ctx.fillRect(doorX + 2, doorY + 2, doorW - 4, doorH - 2);
      // Knob
      ctx.fillStyle = '#caa23a';
      ctx.fillRect(doorX + doorW - 6, doorY + Math.floor(doorH / 2) - 1, 3, 3);
      // Stone step
      ctx.fillStyle = PALETTE.stoneHi;
      ctx.fillRect(doorX - 3, by + bh - 12, doorW + 6, 6);

      // ── Building-specific accents ─────────────────────────────────────────────

      if (b.id === 'barn') {
        // Wide barn door (full-width, X-brace pattern)
        const bdW = bw - 12, bdH = 38;
        const bdX = bx + 6, bdY = by + bh - bdH - 12;
        ctx.fillStyle = PALETTE.timber;
        ctx.fillRect(bdX, bdY, bdW, bdH);
        ctx.fillStyle = this._darken(b.color, 20);
        ctx.fillRect(bdX + 2, bdY + 2, bdW / 2 - 3, bdH - 4);
        ctx.fillRect(bdX + bdW / 2 + 1, bdY + 2, bdW / 2 - 3, bdH - 4);
        // X-brace on left panel
        ctx.strokeStyle = PALETTE.timber;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bdX + 2, bdY + 2); ctx.lineTo(bdX + bdW / 2 - 3, bdY + bdH - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bdX + bdW / 2 - 3, bdY + 2); ctx.lineTo(bdX + 2, bdY + bdH - 4); ctx.stroke();
        // X-brace on right panel
        ctx.beginPath(); ctx.moveTo(bdX + bdW / 2 + 1, bdY + 2); ctx.lineTo(bdX + bdW - 3, bdY + bdH - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bdX + bdW - 3, bdY + 2); ctx.lineTo(bdX + bdW / 2 + 1, bdY + bdH - 4); ctx.stroke();
        // Hay bale on left side
        ctx.fillStyle = '#d4a840';
        ctx.fillRect(bx - 14, by + bh - 24, 18, 16);
        ctx.fillStyle = '#b88828';
        for (let i = 0; i < 3; i++) ctx.fillRect(bx - 13, by + bh - 22 + i * 5, 16, 2);
        ctx.fillStyle = '#e0c060';
        ctx.fillRect(bx - 13, by + bh - 23, 16, 2);

      } else if (b.id === 'market') {
        // Striped canvas awning above door
        const awY = doorY - 10;
        const awX = doorX - 10;
        const awW = doorW + 20;
        const awH = 12;
        const stripes = ['#d44020', '#f0f0e0'];
        for (let s = 0; s < 5; s++) {
          ctx.fillStyle = stripes[s % 2];
          ctx.fillRect(awX + s * (awW / 5), awY, Math.ceil(awW / 5), awH);
        }
        ctx.fillStyle = PALETTE.timber;
        ctx.fillRect(awX, awY, awW, 2);
        ctx.fillRect(awX, awY + awH - 2, awW, 2);
        // Crate / barrel at bottom-left
        ctx.fillStyle = '#9a7040';
        ctx.fillRect(bx + 4, by + bh - 26, 18, 18);
        ctx.fillStyle = PALETTE.timber;
        ctx.fillRect(bx + 4, by + bh - 20, 18, 2);
        ctx.fillRect(bx + 4, by + bh - 13, 18, 2);
        ctx.fillStyle = '#b89060';
        ctx.fillRect(bx + 5, by + bh - 25, 16, 4);

      } else if (b.id === 'home') {
        // Chimney on right side of roof
        const chX = bx + bw - 20;
        const chY = peakY - 8;
        ctx.fillStyle = PALETTE.stone;
        ctx.fillRect(chX, chY, 10, roofBase - chY - 8);
        ctx.fillStyle = PALETTE.stoneHi;
        ctx.fillRect(chX, chY, 10, 4);
        ctx.fillRect(chX, chY, 2, roofBase - chY - 8);
        // Smoke puff hint
        ctx.fillStyle = 'rgba(200,200,200,0.35)';
        ctx.beginPath(); ctx.arc(chX + 5, chY - 6, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(chX + 8, chY - 12, 4, 0, Math.PI * 2); ctx.fill();
        // Flower box under left window
        const fbX = bx + 6, fbY = winY + 22;
        ctx.fillStyle = PALETTE.timber;
        ctx.fillRect(fbX, fbY, 32, 7);
        const flowerCols = ['#ff6090', '#ff9a20', '#ffee44'];
        for (let f = 0; f < 5; f++) {
          ctx.fillStyle = '#4a9a30';
          ctx.fillRect(fbX + 3 + f * 5, fbY - 4, 2, 5);
          ctx.fillStyle = flowerCols[f % flowerCols.length];
          ctx.beginPath(); ctx.arc(fbX + 4 + f * 5, fbY - 5, 2.5, 0, Math.PI * 2); ctx.fill();
        }

      } else if (b.id === 'upgrades') {
        // Gear icon on wall between window and door
        const gx = bx + bw * 3 / 4;
        const gy = wallTop + wallH / 2 + 4;
        const gr = 10;
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(gx, gy, gr * 0.45, 0, Math.PI * 2); ctx.stroke();
        // Gear teeth (8 teeth)
        ctx.fillStyle = '#b8b8c0';
        for (let t = 0; t < 8; t++) {
          const ang = (t / 8) * Math.PI * 2;
          const tx2 = gx + Math.cos(ang) * (gr + 3);
          const ty2 = gy + Math.sin(ang) * (gr + 3);
          ctx.save();
          ctx.translate(tx2, ty2);
          ctx.rotate(ang);
          ctx.fillRect(-2, -3, 4, 6);
          ctx.restore();
        }
        ctx.lineWidth = 1;

      } else if (b.id === 'skins') {
        // Hanging colorful banner/flag from roof peak
        const banW = 10, banH = 18;
        const colors6 = ['#e04040', '#e0a020', '#40c040', '#4080e0', '#a040c0'];
        for (let i = 0; i < 5; i++) {
          const bfx = peakX - 28 + i * 14;
          const bfy = peakY + 2;
          ctx.fillStyle = colors6[i];
          ctx.beginPath();
          ctx.moveTo(bfx, bfy);
          ctx.lineTo(bfx + banW, bfy);
          ctx.lineTo(bfx + banW / 2, bfy + banH);
          ctx.closePath();
          ctx.fill();
        }
        // String
        ctx.strokeStyle = PALETTE.timber;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(peakX - 28, peakY + 2); ctx.lineTo(peakX + 36, peakY + 2); ctx.stroke();

      } else if (b.id === 'gems') {
        // 3 small diamond shapes on wall
        const gemColors = ['#60d0f0', '#a060f0', '#f06080'];
        for (let g = 0; g < 3; g++) {
          const gx2 = bx + bw * 3 / 4 - 8 + g * 16;
          const gy2 = wallTop + wallH / 2 + 2;
          ctx.fillStyle = gemColors[g];
          ctx.beginPath();
          ctx.moveTo(gx2, gy2 - 8);
          ctx.lineTo(gx2 + 6, gy2);
          ctx.lineTo(gx2, gy2 + 8);
          ctx.lineTo(gx2 - 6, gy2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.50)';
          ctx.beginPath();
          ctx.moveTo(gx2, gy2 - 8);
          ctx.lineTo(gx2 + 6, gy2);
          ctx.lineTo(gx2, gy2 - 1);
          ctx.closePath();
          ctx.fill();
        }

      } else if (b.id === 'quests') {
        // Notice board on wall
        const nbX = bx + bw * 3 / 4 - 14;
        const nbY = wallTop + 10;
        ctx.fillStyle = '#7a5020';
        ctx.fillRect(nbX, nbY, 28, 22);
        ctx.fillStyle = '#f0e8d0';
        ctx.fillRect(nbX + 2, nbY + 2, 24, 18);
        // Paper lines
        ctx.fillStyle = '#888870';
        for (let ln = 0; ln < 3; ln++) ctx.fillRect(nbX + 4, nbY + 5 + ln * 5, 20, 1);
        // Pin
        ctx.fillStyle = '#e04040';
        ctx.fillRect(nbX + 12, nbY + 1, 4, 4);
      }

      // ── Sign post above building ──────────────────────────────────────────────
      const signPostX = peakX - 2;
      const signPostTop = peakY - 20;
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(signPostX, signPostTop, 4, 22);

      // Sign board (rounded rect approximated with fillRect + arcs)
      const signW = 60, signH = 18;
      const signX = peakX - signW / 2;
      const signY = signPostTop - signH;
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(signX + 3, signY, signW - 6, signH);
      ctx.fillRect(signX, signY + 3, signW, signH - 6);
      // Corner rounding approximation
      ctx.beginPath(); ctx.arc(signX + 3, signY + 3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(signX + signW - 3, signY + 3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(signX + 3, signY + signH - 3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(signX + signW - 3, signY + signH - 3, 3, 0, Math.PI * 2); ctx.fill();
      // Plaster infill
      ctx.fillStyle = PALETTE.plaster;
      ctx.fillRect(signX + 2, signY + 2, signW - 4, signH - 4);

      // Icon + label on sign
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '10px serif';
      ctx.fillText(b.icon, signX + 14, signY + signH / 2);
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = PALETTE.timber;
      ctx.fillText(b.label, signX + signW / 2 + 4, signY + signH / 2);

      // ── NPC ──────────────────────────────────────────────────────────────────
      const npc = b.npc;
      const nx = npc.x * TILE_SIZE;
      const ny = npc.y * TILE_SIZE;
      this._drawNpc(ctx, nx, ny, b.color);

      const near = Math.max(Math.abs(player.gridX - npc.x), Math.abs(player.gridY - npc.y)) <= 1;
      if (near) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 4;
        ctx.font = 'bold 13px monospace';
        const msg = '💬 Talk';
        ctx.strokeText(msg, nx + TILE_SIZE / 2, ny - 14);
        ctx.fillText(msg, nx + TILE_SIZE / 2, ny - 14);
      }

      this._npcRects.push({
        action: b.action,
        name: npc.name,
        line: npc.line,
        sx: nx - game.farm.camX,
        sy: ny - game.farm.camY,
        sw: TILE_SIZE,
        sh: TILE_SIZE,
      });
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 1;
  }

  _drawNpc(ctx, px, py, accent) {
    // Derive a hair color from the accent hash
    const accentN = parseInt(accent.replace('#', ''), 16);
    const hairVariant = accentN % 4;
    const hairColors = ['#3a2010', '#8b5e2c', '#c8a040', '#2a2040'];
    const hairColor = hairColors[hairVariant];

    // Arm animation: slight offset based on tile position parity
    const armAnim = (pr(px | 0, py | 0) % 2 === 0) ? 1 : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(px + 24, py + 44, 13, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Shoes
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(px + 15, py + 40, 6, 4);
    ctx.fillRect(px + 25, py + 40, 6, 4);

    // Legs (pants)
    ctx.fillStyle = '#2e3a5a';
    ctx.fillRect(px + 15, py + 30, 7, 12);
    ctx.fillRect(px + 25, py + 30, 7, 12);
    // Leg highlight
    ctx.fillStyle = '#404e7a';
    ctx.fillRect(px + 16, py + 31, 2, 9);
    ctx.fillRect(px + 26, py + 31, 2, 9);

    // Body (shirt / jacket)
    ctx.fillStyle = accent;
    ctx.fillRect(px + 13, py + 17, 22, 14);
    // Collar highlight strip
    ctx.fillStyle = this._lighten(accent, 35);
    ctx.fillRect(px + 13, py + 17, 22, 3);
    // Side shading
    ctx.fillStyle = this._darken(accent, 20);
    ctx.fillRect(px + 32, py + 17, 3, 14);

    // Left arm (with animation offset)
    ctx.fillStyle = accent;
    ctx.fillRect(px + 6, py + 18 + armAnim, 8, 11);
    ctx.fillStyle = '#f0c090';
    ctx.fillRect(px + 6, py + 27 + armAnim, 8, 5);

    // Right arm
    ctx.fillStyle = accent;
    ctx.fillRect(px + 34, py + 18, 8, 11);
    ctx.fillStyle = '#f0c090';
    ctx.fillRect(px + 34, py + 27, 8, 5);

    // Neck
    ctx.fillStyle = '#f0c090';
    ctx.fillRect(px + 20, py + 13, 8, 6);

    // Head (larger: 22×18)
    ctx.fillStyle = '#f0c090';
    ctx.fillRect(px + 13, py + 3, 22, 18);
    // Head right-side shadow
    ctx.fillStyle = '#d4a878';
    ctx.fillRect(px + 32, py + 4, 3, 16);

    // Hair (hat-style brim)
    ctx.fillStyle = hairColor;
    ctx.fillRect(px + 10, py + 1, 28, 5);  // brim
    ctx.fillRect(px + 13, py + 3, 22, 5);  // top of head hair
    // Hair highlight
    ctx.fillStyle = this._lighten(hairColor, 25);
    ctx.fillRect(px + 11, py + 2, 14, 2);

    // Eyes
    ctx.fillStyle = '#222';
    ctx.fillRect(px + 17, py + 10, 4, 4);
    ctx.fillRect(px + 27, py + 10, 4, 4);
    // White eye glints
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 18, py + 10, 1, 1);
    ctx.fillRect(px + 28, py + 10, 1, 1);

    // Slight smile
    ctx.fillStyle = '#c07050';
    ctx.fillRect(px + 18, py + 16, 9, 2);
    ctx.fillRect(px + 17, py + 15, 2, 2);
    ctx.fillRect(px + 26, py + 15, 2, 2);
  }

  // Returns the NPC under a screen point (for tap-to-talk), or null.
  npcAt(screenX, screenY) {
    if (!this._npcRects) return null;
    for (const r of this._npcRects) {
      if (screenX >= r.sx && screenX <= r.sx + r.sw &&
          screenY >= r.sy && screenY <= r.sy + r.sh) {
        return r;
      }
    }
    return null;
  }

  // ── Home ─────────────────────────────────────────────────────────────────────

  _renderHome(game) {
    const { ctx } = this;
    const tileW = Math.floor(this.w / HOME_COLS);
    const tileH = Math.floor((this.h - 60) / HOME_ROWS);
    const skinDef = SKINS.house.find(s => s.id === (game.houseSkin || 'classic')) || SKINS.house[0];

    const floorY = (HOME_ROWS - 2) * tileH;

    // Plaster wall with a subtle warm wash
    ctx.fillStyle = skinDef.wallColor;
    ctx.fillRect(0, 0, this.w, floorY);
    const ww = ctx.createLinearGradient(0, 0, 0, floorY);
    ww.addColorStop(0, 'rgba(255,235,190,0.18)');
    ww.addColorStop(1, 'rgba(90,60,30,0.10)');
    ctx.fillStyle = ww;
    ctx.fillRect(0, 0, this.w, floorY);

    // Half-timber framing over the plaster
    const beam = PALETTE.timber, beamHi = PALETTE.timberHi;
    const bt = 9;
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, this.w, bt);                       // top plate
    ctx.fillRect(0, floorY - bt, this.w, bt);             // sill plate
    for (let x = 0; x <= HOME_COLS; x += 2) {             // vertical studs
      ctx.fillRect(x * tileW - bt / 2, 0, bt, floorY);
    }
    // Diagonal braces in each bay
    ctx.strokeStyle = beam;
    ctx.lineWidth = 7;
    for (let x = 0; x < HOME_COLS; x += 2) {
      ctx.beginPath();
      ctx.moveTo(x * tileW + 4, floorY - bt);
      ctx.lineTo((x + 2) * tileW - 4, bt);
      ctx.stroke();
    }
    ctx.fillStyle = beamHi;
    for (let x = 0; x <= HOME_COLS; x += 2) ctx.fillRect(x * tileW - bt / 2, 0, 2, floorY);

    // Window with a little forest view
    const winX = tileW * 0.6, winY = bt + 14, winW = tileW * 1.5, winH = floorY - bt - 40;
    ctx.fillStyle = beam;
    ctx.fillRect(winX - 6, winY - 6, winW + 12, winH + 12);
    const sky = ctx.createLinearGradient(0, winY, 0, winY + winH);
    sky.addColorStop(0, '#9fd0e8');
    sky.addColorStop(1, '#dfeccb');
    ctx.fillStyle = sky;
    ctx.fillRect(winX, winY, winW, winH);
    ctx.fillStyle = '#3f7a30';
    [[winX + winW * 0.28, 14], [winX + winW * 0.62, 18], [winX + winW * 0.85, 12]].forEach(([bx, r]) => {
      ctx.beginPath(); ctx.arc(bx, winY + winH - 4, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = beam;
    ctx.fillRect(winX + winW / 2 - 2, winY, 4, winH);
    ctx.fillRect(winX, winY + winH / 2 - 2, winW, 4);

    // Hanging pot plants
    for (const hx of [tileW * 4.4, tileW * 6.2]) {
      ctx.strokeStyle = '#5a4022'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, bt); ctx.lineTo(hx, bt + 22); ctx.stroke();
      ctx.fillStyle = '#b5673a';
      ctx.fillRect(hx - 9, bt + 22, 18, 10);
      ctx.fillStyle = '#3a8a2c';
      [[-7, 30, 6], [7, 30, 6], [0, 34, 7], [-3, 26, 5]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.arc(hx + dx, bt + dy, r, 0, Math.PI * 2); ctx.fill();
      });
    }

    // Wood-plank floor with grain
    ctx.fillStyle = '#c79a5e';
    ctx.fillRect(0, floorY, this.w, HOME_ROWS * tileH - floorY);
    const fg = ctx.createLinearGradient(0, floorY, 0, HOME_ROWS * tileH);
    fg.addColorStop(0, 'rgba(255,225,170,0.16)');
    fg.addColorStop(1, 'rgba(70,45,20,0.16)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, floorY, this.w, HOME_ROWS * tileH - floorY);
    ctx.strokeStyle = 'rgba(90,60,28,0.5)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= HOME_COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * tileW, floorY); ctx.lineTo(x * tileW, HOME_ROWS * tileH); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150,110,60,0.4)';
    for (let i = 0; i < 22; i++) {
      const gx = (i * 97) % this.w, gy = floorY + 6 + (i * 53) % (HOME_ROWS * tileH - floorY - 8);
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 22, gy); ctx.stroke();
    }

    // Grid (placement aid)
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    for (let y = 0; y <= HOME_ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * tileH); ctx.lineTo(HOME_COLS * tileW, y * tileH); ctx.stroke(); }
    for (let x = 0; x <= HOME_COLS; x++) { ctx.beginPath(); ctx.moveTo(x * tileW, 0); ctx.lineTo(x * tileW, HOME_ROWS * tileH); ctx.stroke(); }

    // Baseboard
    ctx.fillStyle = this._darken(skinDef.wallColor, 34);
    ctx.fillRect(0, floorY - 5, this.w, 5);

    // Furniture
    game.homeLayout.forEach(item => {
      const def = FURNITURE.find(f => f.id === item.id);
      if (!def) return;
      const ix = item.x * tileW, iy = item.y * tileH;
      const iw = def.w * tileW - 6, ih = def.h * tileH - 6;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(ix + 5, iy + 5, iw, ih);
      // Main body
      ctx.fillStyle = def.color;
      ctx.fillRect(ix + 2, iy + 2, iw, ih);
      // Highlight top
      ctx.fillStyle = this._lighten(def.color, 30);
      ctx.fillRect(ix + 2, iy + 2, iw, 4);
      // Label
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = `bold ${Math.min(tileW * 0.4, 13)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(def.label, ix + iw / 2 + 2, iy + ih / 2 + 5);
      ctx.textAlign = 'left';
    });

    // Shingled roof bar
    const ry = HOME_ROWS * tileH;
    ctx.fillStyle = this._darken(skinDef.roofColor, 18);
    ctx.fillRect(0, ry, this.w, 18);
    ctx.fillStyle = skinDef.roofColor;
    for (let sx = -7; sx < this.w; sx += 16) {
      ctx.beginPath(); ctx.arc(sx + 8, ry + 13, 9, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = this._lighten(skinDef.roofColor, 28);
    ctx.fillRect(0, ry, this.w, 3);
  }

  // ── Season / Weather Overlays ─────────────────────────────────────────────

  _drawSeasonOverlay(ctx, season) {
    // Gentler than before — warmth/vignette layer adds the rest of the mood
    const tints = [null, 'rgba(255,225,120,0.04)', 'rgba(255,150,50,0.07)', 'rgba(120,160,220,0.09)'];
    const tint = tints[season];
    if (!tint) return;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  _drawRainOverlay(ctx) {
    const t = (this._timestamp || 0) / 40;
    ctx.strokeStyle = 'rgba(150,200,255,0.35)';
    ctx.lineWidth = 1;
    const spacing = 20;
    for (let i = 0; i < Math.ceil(this.w / spacing) + Math.ceil(this.h / spacing); i++) {
      const x = ((i * spacing - t * 3) % (this.w + this.h)) - this.h * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + this.h * 0.4, this.h);
      ctx.stroke();
    }
  }

  _drawSnowOverlay(ctx) {
    const t = (this._timestamp || 0) / 60;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5 + t * 0.5) % this.w;
      const y = (i * 97.3 + t) % this.h;
      const r = 1 + (i % 3);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Fishing Pond ──────────────────────────────────────────────────────────

  _drawPond(ctx, cx, cy) {
    const rx = TILE_SIZE * 2, ry = TILE_SIZE * 1.2;

    // Water
    ctx.fillStyle = '#2a6080';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();

    // Shimmer
    ctx.fillStyle = 'rgba(100,200,255,0.3)';
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.2, cy - ry * 0.3, rx * 0.4, ry * 0.25, -0.3, 0, Math.PI * 2); ctx.fill();

    // Lily pads
    ctx.fillStyle = '#2a7820';
    [[cx - 20, cy + 10], [cx + 30, cy - 10], [cx + 5, cy + 22]].forEach(([lx, ly]) => {
      ctx.beginPath(); ctx.ellipse(lx, ly, 10, 7, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3aaa28'; ctx.fillRect(lx - 1, ly - 7, 2, 7); ctx.fillStyle = '#2a7820';
    });

    // Shore edge
    ctx.strokeStyle = '#4a8040';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🎣 Fishing', cx, cy + ry + 14);
    ctx.textAlign = 'left';
  }

  isPondClick(screenX, screenY, farm) {
    if (!this._pondScreenX) return false;
    const px = screenX - (this._pondScreenX - farm.camX);
    const py = screenY - (this._pondScreenY - farm.camY);
    return px >= 0 && py >= 0 && px <= this._pondW && py <= this._pondH;
  }

  // ── Barn View ─────────────────────────────────────────────────────────────

  _renderBarn(game) {
    const { ctx } = this;

    // Timber-plank wall with a warm wash
    ctx.fillStyle = '#b5854a';
    ctx.fillRect(0, 0, this.w, this.h);
    const bw = ctx.createLinearGradient(0, 0, 0, this.h);
    bw.addColorStop(0, 'rgba(255,225,160,0.12)');
    bw.addColorStop(1, 'rgba(70,45,20,0.20)');
    ctx.fillStyle = bw;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.strokeStyle = 'rgba(110,74,38,0.55)';
    ctx.lineWidth = 2;
    for (let x = 24; x < this.w; x += 26) {
      ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x, this.h); ctx.stroke();
    }

    // Shingled roof + red trim accent
    ctx.fillStyle = PALETTE.roofShade;
    ctx.fillRect(0, 0, this.w, 26);
    ctx.fillStyle = PALETTE.roof;
    for (let sx = -8; sx < this.w; sx += 18) {
      ctx.beginPath(); ctx.arc(sx + 9, 20, 11, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = '#8B2020';
    ctx.fillRect(0, 24, this.w, 4);
    ctx.fillStyle = this._lighten(PALETTE.roof, 26);
    ctx.fillRect(0, 0, this.w, 3);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🐄  Your Barn', this.w / 2, 15);
    ctx.textAlign = 'left';

    if (game.animals.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No animals yet. Buy some in the Market!', this.w / 2, this.h / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Stall grid
    const stallW = Math.min(180, Math.floor((this.w - 20) / Math.min(game.animals.length, 4)));
    const stallH = 140;
    const startX = (this.w - stallW * Math.min(game.animals.length, 4)) / 2;
    const startY = 40;

    game.animals.forEach((animal, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const sx = startX + col * stallW;
      const sy = startY + row * (stallH + 10);
      this._drawAnimalStall(ctx, sx, sy, stallW, stallH, animal);
    });
  }

  _drawAnimalStall(ctx, sx, sy, sw, sh, animal) {
    const def = ANIMALS[animal.kind];

    // Stall floor (warm wood + plank seams)
    ctx.fillStyle = '#d8b566';
    ctx.fillRect(sx + 4, sy, sw - 8, sh);
    ctx.strokeStyle = 'rgba(120,82,40,0.4)';
    ctx.lineWidth = 1;
    for (let py = sy + 14; py < sy + sh; py += 16) {
      ctx.beginPath(); ctx.moveTo(sx + 6, py); ctx.lineTo(sx + sw - 6, py); ctx.stroke();
    }
    // Soft inner shadow for depth
    ctx.fillStyle = 'rgba(60,38,16,0.16)';
    ctx.fillRect(sx + 4, sy, sw - 8, 10);
    // Wooden post framing
    ctx.fillStyle = '#8a5c2e';
    ctx.fillRect(sx + 4, sy, 7, sh);
    ctx.fillRect(sx + sw - 11, sy, 7, sh);
    ctx.fillRect(sx + 4, sy, sw - 8, 7);
    ctx.fillStyle = '#a9763f';
    ctx.fillRect(sx + 4, sy, 2, sh);
    ctx.fillRect(sx + sw - 11, sy, 2, sh);

    // Hay pile
    ctx.fillStyle = '#e8c840';
    [[-16, 2, 32, 12], [-10, -4, 20, 8]].forEach(([dx, dy, w, hh]) =>
      ctx.fillRect(sx + sw / 2 + dx, sy + sh - 24 + dy, w, hh));
    ctx.fillStyle = '#caa830';
    for (let i = 0; i < 5; i++) ctx.fillRect(sx + sw / 2 - 14 + i * 7, sy + sh - 22, 2, 11);

    // Animal sprite (with grounding shadow)
    const cx = sx + sw / 2;
    const cy = sy + sh / 2 - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 30, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    this._drawAnimalSprite(ctx, cx, cy, animal.kind, def.color);

    // Fed indicator
    ctx.fillStyle = animal.fed ? '#44ff44' : (animal.unhappyDays >= 2 ? '#ff4444' : '#ffaa00');
    ctx.beginPath(); ctx.arc(sx + sw - 18, sy + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(animal.fed ? '✓' : '!', sx + sw - 18, sy + 18);
    ctx.textAlign = 'left';

    // Name
    ctx.fillStyle = '#5a3010';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(animal.name, cx, sy + sh - 5);
    ctx.textAlign = 'left';
  }

  _drawAnimalSprite(ctx, cx, cy, kind, color) {
    if (kind === 'chicken') {
      // Body
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(cx, cy + 5, 16, 12, 0, 0, Math.PI * 2); ctx.fill();
      // Head
      ctx.beginPath(); ctx.ellipse(cx + 12, cy - 6, 10, 8, 0.3, 0, Math.PI * 2); ctx.fill();
      // Beak
      ctx.fillStyle = '#f0a020';
      ctx.beginPath(); ctx.moveTo(cx + 21, cy - 6); ctx.lineTo(cx + 28, cy - 4); ctx.lineTo(cx + 21, cy - 2); ctx.fill();
      // Eye
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx + 15, cy - 8, 2, 0, Math.PI * 2); ctx.fill();
      // Comb
      ctx.fillStyle = '#cc2020';
      ctx.fillRect(cx + 10, cy - 15, 4, 6); ctx.fillRect(cx + 14, cy - 14, 4, 5);
      // Legs
      ctx.strokeStyle = '#f0a020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 4, cy + 16); ctx.lineTo(cx - 4, cy + 24); ctx.lineTo(cx - 10, cy + 24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 4, cy + 16); ctx.lineTo(cx + 4, cy + 24); ctx.lineTo(cx + 10, cy + 24); ctx.stroke();
    } else if (kind === 'cow') {
      // Body
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(cx, cy + 8, 24, 16, 0, 0, Math.PI * 2); ctx.fill();
      // Spots
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.ellipse(cx - 8, cy + 4, 8, 6, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 10, cy + 12, 6, 5, -0.3, 0, Math.PI * 2); ctx.fill();
      // Head
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(cx + 22, cy - 2, 13, 10, 0.2, 0, Math.PI * 2); ctx.fill();
      // Horns
      ctx.fillStyle = '#d4b060';
      ctx.fillRect(cx + 18, cy - 12, 3, 8); ctx.fillRect(cx + 26, cy - 12, 3, 8);
      // Nose
      ctx.fillStyle = '#f0b0a0';
      ctx.beginPath(); ctx.ellipse(cx + 32, cy - 1, 6, 4, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c07060'; ctx.beginPath(); ctx.arc(cx + 30, cy, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 34, cy, 1.5, 0, Math.PI * 2); ctx.fill();
      // Eye
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx + 24, cy - 5, 2.5, 0, Math.PI * 2); ctx.fill();
      // Legs
      ctx.fillStyle = '#c8c0b0';
      [[-14, 24],[-6, 24],[6, 24],[14, 24]].forEach(([dx]) => {
        ctx.fillRect(cx + dx - 3, cy + 22, 6, 14);
      });
      // Udder
      ctx.fillStyle = '#f0b0b0';
      ctx.beginPath(); ctx.ellipse(cx - 4, cy + 24, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else { // sheep
      // Fluffy body
      ctx.fillStyle = color;
      for (let i = 0; i < 7; i++) {
        const fx = cx + [-12,-4,4,12,-8,0,8][i];
        const fy = cy + [4,0,4,4,12,8,12][i];
        ctx.beginPath(); ctx.arc(fx, fy, 10, 0, Math.PI * 2); ctx.fill();
      }
      // Face
      ctx.fillStyle = '#c0b0a0';
      ctx.beginPath(); ctx.ellipse(cx + 18, cy + 2, 10, 9, 0.1, 0, Math.PI * 2); ctx.fill();
      // Eye
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx + 22, cy - 1, 2, 0, Math.PI * 2); ctx.fill();
      // Ear
      ctx.fillStyle = '#d0b090';
      ctx.beginPath(); ctx.ellipse(cx + 18, cy - 8, 4, 7, 0.3, 0, Math.PI * 2); ctx.fill();
      // Legs
      ctx.fillStyle = '#aaa';
      [[-8,0],[0,0],[8,0]].forEach(([dx]) => {
        ctx.fillRect(cx + dx - 3, cy + 20, 5, 14);
      });
    }
  }

  // ── Coordinate helpers ───────────────────────────────────────────────────────

  pixelToTile(farm, screenX, screenY) {
    const wx = screenX + farm.camX;
    const wy = screenY + farm.camY;
    return { tileX: Math.floor(wx / TILE_SIZE), tileY: Math.floor(wy / TILE_SIZE) };
  }

  pixelToHomeTile(screenX, screenY) {
    const tileW = Math.floor(this.w / HOME_COLS);
    const tileH = Math.floor((this.h - 60) / HOME_ROWS);
    return { tileX: Math.floor(screenX / tileW), tileY: Math.floor(screenY / tileH) };
  }
}
