import { TILE_SIZE, CROPS, SKINS, HOME_COLS, HOME_ROWS, FURNITURE, SEASONS, ANIMALS, PALETTE, BUILDINGS, VILLAGE_ARC } from './constants.js';

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

    // Forest ring AFTER the fence so the tree canopies overlap fence posts,
    // not the other way around (fixes "fence covering trees" at the bottom row).
    this._drawForestRing(ctx, farm);

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

    // Fishing pond (world-space, fixed location)
    this._drawWildPond(ctx, farm);

    // Player
    this._drawPlayer(ctx, player);

    ctx.restore();

    // Atmosphere & lighting (screen space, over everything)
    this._drawClouds(ctx);
    this._drawSeasonOverlay(ctx, game.season);
    this._drawDayNightOverlay(ctx, game.timeOfDay ?? 0.5);
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

    // (Pond is drawn in world-space from _renderFarm so it's at a fixed
    // world location — see _drawWildPond below.)
  }

  _drawWildPond(ctx, farm) {
    // Pond sits on the RIGHT side, well below the player's barn so it
    // doesn't clip into the shed. Cluster reads home → pen → barn → pond.
    const pondCX = (farm.cols + 4) * TILE_SIZE;
    const pondCY = (farm.rows + 3) * TILE_SIZE;
    this._drawPond(ctx, pondCX, pondCY);
    this._pondW = TILE_SIZE * 4;
    this._pondH = TILE_SIZE * 2.5;
    this._pondScreenX = pondCX - this._pondW / 2;
    this._pondScreenY = pondCY - this._pondH / 2;
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

    // Village dirt path is ground terrain — draw it FIRST so trees/buildings render on top.
    // (The forest ring is drawn AFTER the fence in _renderFarm so trees overlap the fence
    // instead of the fence covering tree canopies.)
    this._drawVillagePath(ctx);

    // Cottage = player's HOME (top of the right-side cluster).
    // Shed   = player's BARN (bottom). The animal pen sits in between
    // (drawn in _drawBuildings); the pond sits below the barn.
    this._drawCottage(ctx, rx + 10, 30);
    this._drawShed(ctx, rx + 24, 30 + TILE_SIZE * 6.0);

    // Cosy clutter along the bottom margin (left half — clear of the
    // right-side cluster and pond)
    this._drawBarrel(ctx, 30, by);
    this._drawBarrel(ctx, 70, by + 6);
    this._drawCrate(ctx, 130, by - 2);
    this._drawLogs(ctx, 210, by + 4);
    this._drawFlowerBed(ctx, fw * 0.25, by - 4, 2);
  }

  _drawForestRing(ctx, farm) {
    const fw = farm.cols * TILE_SIZE, fh = farm.rows * TILE_SIZE;
    const m = 44; // hug the border so it stays near the viewport
    const pts = [];
    // Top + bottom rows of trees (skip the right side — it's where the
    // home/pen/barn/pond cluster lives and trees would overlap it)
    for (let x = -m; x <= fw + m; x += 76) { pts.push([x, -m]); pts.push([x + 28, fh + m]); }
    // Left side only (right side is the player's-property cluster)
    for (let y = 0; y <= fh; y += 78) { pts.push([-m, y]); }
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

  // Per-building roof colours (Stardew-style distinct roofs)
  static get ROOF_COLORS() {
    return {
      market:   { light: '#e04820', dark: '#903010' },
      barn:     { light: '#9a2418', dark: '#5e1408' },
      home:     { light: '#4a78b8', dark: '#2e4e7e' },
      upgrades: { light: '#7a7a8c', dark: '#4a4a5e' },
      skins:    { light: '#9850d0', dark: '#5c2e88' },
      gems:     { light: '#28a8c0', dark: '#1a6878' },
      quests:   { light: '#c08830', dark: '#7a5418' },
    };
  }

  _drawBuildings(ctx, game) {
    this._npcRects = [];
    // (Village dirt path is now drawn in _drawProps so trees render on top of it.)
    for (const b of BUILDINGS) {
      // Ground shadow under every building
      const bx = b.x * TILE_SIZE, by = b.y * TILE_SIZE;
      const bw = b.w * TILE_SIZE, bh = b.h * TILE_SIZE;
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(bx + bw / 2, by + bh + 4, bw / 2 + 6, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      if (b.id === 'home')      this._drawHomeBuilding(ctx, b);
      else if (b.id === 'barn') this._drawBarnBuilding(ctx, b);
      else                      this._drawGenericBuilding(ctx, b);

      this._drawBuildingSignAndNpc(ctx, b, game);
    }
    this._drawAnimalPen(ctx, game);
    this._drawHotspotPrompts(ctx, game);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 1;
  }

  // Show a "🏠 Enter" prompt over the cottage / shed doors when player is near.
  // Also records a click hit-zone so tapping the cottage opens Home, etc.
  _drawHotspotPrompts(ctx, game) {
    const { gridX, gridY } = game.player;
    const hotspots = [
      { ...game.homeHotspot, icon: '🏠' },
      { ...game.barnHotspot, icon: '🚜' },
    ];
    this._hotspotRects = [];
    for (const h of hotspots) {
      const wx = h.tx * TILE_SIZE + TILE_SIZE / 2;
      const wy = h.ty * TILE_SIZE + TILE_SIZE / 2;
      const near = Math.max(Math.abs(gridX - h.tx), Math.abs(gridY - h.ty)) <= 1;
      this._hotspotRects.push({
        action: h.action,
        label: h.label,
        isHotspot: true,
        sx: (h.tx * TILE_SIZE) - game.farm.camX,
        sy: (h.ty * TILE_SIZE) - game.farm.camY,
        sw: TILE_SIZE,
        sh: TILE_SIZE,
      });
      if (near) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 4;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const msg = `${h.icon} Enter ${h.label}`;
        ctx.strokeText(msg, wx, wy - 14);
        ctx.fillText(msg, wx, wy - 14);
      }
    }
  }

  // ── Village dirt path ──────────────────────────────────────────────────────

  _drawVillagePath(ctx) {
    // Arc-shaped dirt path under the half-circle of shops. The shops' BUILDING
    // CENTERS lie on a circle of radius VILLAGE_ARC.r around (cx,cy). We draw
    // a thick brown ribbon along that circle from -π/2 (top) to +π/2 (bottom),
    // then sprinkle speckles for texture.
    const cx = VILLAGE_ARC.cx * TILE_SIZE; // arc center in pixels (VILLAGE_ARC.cx/cy is the abstract center in tile units)
    const cy = VILLAGE_ARC.cy * TILE_SIZE;
    const r  = VILLAGE_ARC.r * TILE_SIZE;
    const width = 36; // ribbon thickness

    // Base brown ribbon
    ctx.strokeStyle = '#a07848';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // Darker edge shadow (slightly thicker, drawn first underneath would be better;
    // approximate by drawing two slim strokes at inner/outer edges)
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r + width / 2 - 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r - width / 2 + 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // Speckles for dirt texture — points scattered along the arc, jittered radially
    const N = 110;
    for (let s = 0; s < N; s++) {
      const t = s / (N - 1);
      const ang = Math.PI + t * Math.PI;
      const jitter = ((s * 53 + 17) % 100) / 100 - 0.5; // [-0.5..0.5]
      const rj = r + jitter * (width - 8);
      const sx = cx + Math.cos(ang) * rj + ((s * 31) % 5 - 2);
      const sy = cy + Math.sin(ang) * rj + ((s * 19) % 5 - 2);
      ctx.fillStyle = (s % 3 === 0) ? '#bc9060' : '#7e5a30';
      ctx.fillRect(sx | 0, sy | 0, (s % 4 === 0) ? 2 : 1, 1);
    }
    ctx.lineCap = 'butt';
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  _drawFoundation(ctx, bx, by, bw, bh) {
    const foundY = by + bh - 12;
    ctx.fillStyle = PALETTE.stone;
    ctx.fillRect(bx, foundY, bw, 12);
    for (let row = 0; row < 2; row++) {
      const fy = foundY + row * 6;
      const offset = (row % 2) * 14;
      ctx.fillStyle = row % 2 === 0 ? PALETTE.stoneHi : PALETTE.stone;
      for (let bk = -1; bk < 8; bk++) {
        const fx = bx + bk * 28 + offset;
        ctx.fillRect(fx + 1, fy + 1, 26, 4);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(bx, foundY + 10, bw, 2);
  }

  _drawCobblePath(ctx, bx, by, bw, bh) {
    const doorCX = bx + bw / 2;
    for (let step = 0; step < 3; step++) {
      const py2 = by + bh + step * 10;
      ctx.fillStyle = step % 2 === 0 ? PALETTE.stone : PALETTE.stoneHi;
      ctx.fillRect(doorCX - 14, py2, 28, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(doorCX - 14, py2 + 7, 28, 1);
    }
  }

  _drawShingleRoof(ctx, bx, by, bw, wallTop, rc, peakLift) {
    const peakX = bx + bw / 2;
    const roofBase = wallTop;
    const peakY = roofBase - peakLift;
    const eaveL = bx - 12;
    const eaveR = bx + bw + 12;

    // Left slope
    ctx.fillStyle = rc.light;
    ctx.beginPath();
    ctx.moveTo(eaveL, roofBase);
    ctx.lineTo(peakX, peakY);
    ctx.lineTo(peakX, roofBase);
    ctx.closePath();
    ctx.fill();
    // Right slope
    ctx.fillStyle = rc.dark;
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    ctx.lineTo(eaveR, roofBase);
    ctx.lineTo(peakX, roofBase);
    ctx.closePath();
    ctx.fill();

    // Scalloped shingle rows (small arc detail) — left slope
    const slopeH = roofBase - peakY;
    const rows = 5;
    for (let row = 1; row <= rows; row++) {
      const t = row / rows;
      const sy = peakY + slopeH * t;
      const halfW = (bw / 2 + 10) * t;
      ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      ctx.moveTo(peakX - halfW, sy);
      ctx.lineTo(peakX, sy);
      ctx.lineTo(peakX, sy - slopeH / rows);
      ctx.lineTo(peakX - (bw / 2 + 10) * (row - 1) / rows, sy - slopeH / rows);
      ctx.closePath();
      ctx.fill();
      // Scallop dots along the row
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      const startX = peakX - halfW;
      const segs = Math.max(2, Math.floor(halfW / 8));
      for (let s = 0; s < segs; s++) {
        const dx = startX + (halfW / segs) * s + 3;
        ctx.fillRect(dx, sy - 1, 2, 1);
      }
    }
    for (let row = 1; row <= rows; row++) {
      const t = row / rows;
      const sy = peakY + slopeH * t;
      const halfW = (bw / 2 + 10) * t;
      ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.moveTo(peakX, sy);
      ctx.lineTo(peakX + halfW, sy);
      ctx.lineTo(peakX + (bw / 2 + 10) * (row - 1) / rows, sy - slopeH / rows);
      ctx.lineTo(peakX, sy - slopeH / rows);
      ctx.closePath();
      ctx.fill();
    }

    // Ridge cap at peak
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(peakX - 3, peakY - 2, 6, slopeH + 4);

    // Eave shadow line where roof meets wall
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(bx - 8, roofBase, bw + 16, 4);

    return { peakX, peakY, roofBase, slopeH };
  }

  _drawWalls(ctx, bx, wallTop, bw, wallH, color, opts = {}) {
    ctx.fillStyle = color;
    ctx.fillRect(bx, wallTop, bw, wallH);

    // Horizontal plank lines
    const plankDark = this._darken(color, 18);
    for (let row = 1; row < Math.floor(wallH / 8); row++) {
      ctx.fillStyle = plankDark;
      ctx.fillRect(bx, wallTop + row * 8, bw, 1);
    }

    // Mid-rail (timber stripe at mid-height) — gives the "framed" Stardew look
    if (opts.midRail) {
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(bx, wallTop + Math.floor(wallH / 2) - 2, bw, 4);
      ctx.fillStyle = PALETTE.timberHi;
      ctx.fillRect(bx, wallTop + Math.floor(wallH / 2) - 2, bw, 1);
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
  }

  _drawWindow(ctx, wx, wy) {
    ctx.fillStyle = 'rgba(255,230,100,0.25)';
    ctx.fillRect(wx - 4, wy - 4, 36, 30);
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(wx, wy, 28, 22);
    ctx.fillStyle = '#ffe048';
    ctx.fillRect(wx + 2, wy + 2, 24, 18);
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(wx + 2, wy + 11, 24, 2);
    ctx.fillRect(wx + 13, wy + 2, 2, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.fillRect(wx + 3, wy + 3, 2, 2);
    ctx.fillRect(wx + 16, wy + 3, 2, 2);
  }

  _drawDoor(ctx, doorX, doorY, doorW, doorH, foundationY) {
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.fillStyle = PALETTE.roofShade;
    ctx.fillRect(doorX + 2, doorY + 2, doorW - 4, doorH - 2);
    // Vertical panel divider
    ctx.fillStyle = this._darken('#5c3720', 15);
    ctx.fillRect(doorX + doorW / 2 - 1, doorY + 4, 2, doorH - 8);
    // Knob
    ctx.fillStyle = '#caa23a';
    ctx.fillRect(doorX + doorW - 6, doorY + Math.floor(doorH / 2) - 1, 3, 3);
    // Stone step
    ctx.fillStyle = PALETTE.stoneHi;
    ctx.fillRect(doorX - 3, foundationY, doorW + 6, 6);
  }

  // ── Generic building (market / upgrades / skins / gems / quests) ──────────

  _drawGenericBuilding(ctx, b) {
    const bx = b.x * TILE_SIZE, by = b.y * TILE_SIZE;
    const bw = b.w * TILE_SIZE, bh = b.h * TILE_SIZE;
    const wallTop = by + bh - 12 - 72;
    const wallH = 72;

    this._drawFoundation(ctx, bx, by, bw, bh);
    this._drawWalls(ctx, bx, wallTop, bw, wallH, b.color);

    const rc = Renderer.ROOF_COLORS[b.id] || { light: PALETTE.roofHi, dark: PALETTE.roofShade };
    const { peakX, peakY } = this._drawShingleRoof(ctx, bx, by, bw, wallTop, rc, 44);

    const winY = wallTop + 14;
    this._drawWindow(ctx, bx + 8, winY);
    this._drawWindow(ctx, bx + bw - 36, winY);

    const doorW = 22, doorH = 32;
    const doorX = bx + bw / 2 - doorW / 2;
    const doorY = by + bh - doorH - 12;
    this._drawDoor(ctx, doorX, doorY, doorW, doorH, by + bh - 12);

    // Accents
    if (b.id === 'market') {
      const awY = doorY - 10, awX = doorX - 10, awW = doorW + 20, awH = 12;
      const stripes = ['#d44020', '#f0f0e0'];
      for (let s = 0; s < 5; s++) {
        ctx.fillStyle = stripes[s % 2];
        ctx.fillRect(awX + s * (awW / 5), awY, Math.ceil(awW / 5), awH);
      }
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(awX, awY, awW, 2);
      ctx.fillRect(awX, awY + awH - 2, awW, 2);
      ctx.fillStyle = '#9a7040';
      ctx.fillRect(bx + 4, by + bh - 26, 18, 18);
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(bx + 4, by + bh - 20, 18, 2);
      ctx.fillRect(bx + 4, by + bh - 13, 18, 2);
      ctx.fillStyle = '#b89060';
      ctx.fillRect(bx + 5, by + bh - 25, 16, 4);
    } else if (b.id === 'upgrades') {
      const gx = bx + bw * 3 / 4, gy = wallTop + wallH / 2 + 4, gr = 10;
      ctx.strokeStyle = '#c0c0c0';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(gx, gy, gr * 0.45, 0, Math.PI * 2); ctx.stroke();
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
      ctx.strokeStyle = PALETTE.timber;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(peakX - 28, peakY + 2); ctx.lineTo(peakX + 36, peakY + 2); ctx.stroke();
    } else if (b.id === 'gems') {
      const gemColors = ['#60d0f0', '#a060f0', '#f06080'];
      for (let g = 0; g < 3; g++) {
        const gx2 = bx + bw * 3 / 4 - 8 + g * 16;
        const gy2 = wallTop + wallH / 2 + 2;
        ctx.fillStyle = gemColors[g];
        ctx.beginPath();
        ctx.moveTo(gx2, gy2 - 8); ctx.lineTo(gx2 + 6, gy2);
        ctx.lineTo(gx2, gy2 + 8); ctx.lineTo(gx2 - 6, gy2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.50)';
        ctx.beginPath();
        ctx.moveTo(gx2, gy2 - 8); ctx.lineTo(gx2 + 6, gy2);
        ctx.lineTo(gx2, gy2 - 1);
        ctx.closePath(); ctx.fill();
      }
    } else if (b.id === 'quests') {
      const nbX = bx + bw * 3 / 4 - 14, nbY = wallTop + 10;
      ctx.fillStyle = '#7a5020';
      ctx.fillRect(nbX, nbY, 28, 22);
      ctx.fillStyle = '#f0e8d0';
      ctx.fillRect(nbX + 2, nbY + 2, 24, 18);
      ctx.fillStyle = '#888870';
      for (let ln = 0; ln < 3; ln++) ctx.fillRect(nbX + 4, nbY + 5 + ln * 5, 20, 1);
      ctx.fillStyle = '#e04040';
      ctx.fillRect(nbX + 12, nbY + 1, 4, 4);
    }
  }

  // ── Home (cottage) ─────────────────────────────────────────────────────────

  _drawHomeBuilding(ctx, b) {
    const bx = b.x * TILE_SIZE, by = b.y * TILE_SIZE;
    const bw = b.w * TILE_SIZE, bh = b.h * TILE_SIZE;
    const wallH = 90;
    const wallTop = by + bh - 12 - wallH;

    this._drawFoundation(ctx, bx, by, bw, bh);
    this._drawWalls(ctx, bx, wallTop, bw, wallH, b.color, { midRail: true });

    const rc = Renderer.ROOF_COLORS.home;
    const { peakX, peakY, roofBase } = this._drawShingleRoof(ctx, bx, by, bw, wallTop, rc, 84);

    // Two windows flanking the center
    const winY = wallTop + 10;
    this._drawWindow(ctx, bx + 8, winY);
    this._drawWindow(ctx, bx + bw - 36, winY);

    // Flower boxes under BOTH windows
    const flowerCols = ['#ff6090', '#ff9a20', '#ffee44', '#a070ff'];
    const drawFlowerBox = (fbX) => {
      const fbY = winY + 24;
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(fbX, fbY, 28, 7);
      ctx.fillStyle = PALETTE.timberHi;
      ctx.fillRect(fbX, fbY, 28, 1);
      for (let f = 0; f < 4; f++) {
        ctx.fillStyle = '#4a9a30';
        ctx.fillRect(fbX + 4 + f * 6, fbY - 4, 2, 5);
        ctx.fillStyle = flowerCols[(f + (fbX | 0)) % flowerCols.length];
        ctx.beginPath();
        ctx.arc(fbX + 5 + f * 6, fbY - 5, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawFlowerBox(bx + 8);
    drawFlowerBox(bx + bw - 36);

    // Door with rounded arch step + wreath
    const doorW = 24, doorH = 36;
    const doorX = bx + bw / 2 - doorW / 2;
    const doorY = by + bh - doorH - 12;
    this._drawDoor(ctx, doorX, doorY, doorW, doorH, by + bh - 12);
    // Wreath above door
    ctx.strokeStyle = '#3a7a26';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(doorX + doorW / 2, doorY - 4, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e04040';
    ctx.fillRect(doorX + doorW / 2 - 1, doorY + 2, 3, 3);
    ctx.lineWidth = 1;

    // Brick chimney on right side of roof
    const chX = bx + bw - 22, chY = peakY - 6;
    const chH = roofBase - chY - 6;
    ctx.fillStyle = '#9a3a20';
    ctx.fillRect(chX, chY, 12, chH);
    // Brick rows
    ctx.fillStyle = '#7a2810';
    for (let r = 0; r < chH; r += 5) {
      ctx.fillRect(chX, chY + r, 12, 1);
      const off = (r / 5) % 2 === 0 ? 0 : 6;
      ctx.fillRect(chX + off, chY + r + 1, 1, 3);
    }
    // Cap
    ctx.fillStyle = PALETTE.stone;
    ctx.fillRect(chX - 2, chY, 16, 4);
    // Animated smoke puffs
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    for (let p = 0; p < 3; p++) {
      const phase = (t + p * 0.7) % 2.2;
      const rise = phase * 14;
      const alpha = Math.max(0, 0.55 - phase * 0.25);
      const r2 = 4 + phase * 1.5;
      ctx.fillStyle = `rgba(220,220,220,${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(chX + 6 + Math.sin(phase * 1.8 + p) * 3, chY - 4 - rise, r2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Barn ───────────────────────────────────────────────────────────────────

  _drawBarnBuilding(ctx, b) {
    const bx = b.x * TILE_SIZE, by = b.y * TILE_SIZE;
    const bw = b.w * TILE_SIZE, bh = b.h * TILE_SIZE;
    const wallH = 90;
    const wallTop = by + bh - 12 - wallH;

    this._drawFoundation(ctx, bx, by, bw, bh);
    this._drawWalls(ctx, bx, wallTop, bw, wallH, b.color, { midRail: true });

    const rc = Renderer.ROOF_COLORS.barn;
    const { peakX, peakY, roofBase } = this._drawShingleRoof(ctx, bx, by, bw, wallTop, rc, 84);

    // Hayloft window centered at roof peak
    const hlW = 18, hlH = 14;
    const hlX = peakX - hlW / 2;
    const hlY = peakY + 8;
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(hlX - 2, hlY - 2, hlW + 4, hlH + 4);
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(hlX, hlY, hlW, hlH);
    // Hay tufts poking out
    ctx.fillStyle = '#e8c050';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(hlX + 2 + i * 3, hlY + hlH - 3, 1, 4);
    }
    ctx.fillStyle = '#caa23a';
    ctx.fillRect(hlX, hlY + hlH - 1, hlW, 2);

    // Two small windows flanking the doors
    const winY = wallTop + 8;
    this._drawWindow(ctx, bx + 4, winY);
    this._drawWindow(ctx, bx + bw - 32, winY);

    // Wide double doors with X-brace on each panel
    const bdW = bw - 16, bdH = 48;
    const bdX = bx + 8, bdY = by + bh - bdH - 12;
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(bdX, bdY, bdW, bdH);
    ctx.fillStyle = this._darken(b.color, 24);
    ctx.fillRect(bdX + 2, bdY + 2, bdW / 2 - 3, bdH - 4);
    ctx.fillRect(bdX + bdW / 2 + 1, bdY + 2, bdW / 2 - 3, bdH - 4);
    // Vertical plank lines inside panels
    ctx.fillStyle = this._darken(b.color, 34);
    for (let v = 1; v < 4; v++) {
      const px = bdX + 2 + v * ((bdW / 2 - 3) / 4);
      ctx.fillRect(px, bdY + 2, 1, bdH - 4);
      ctx.fillRect(px + bdW / 2 - 1, bdY + 2, 1, bdH - 4);
    }
    // X-braces
    ctx.strokeStyle = PALETTE.timber;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bdX + 2, bdY + 2); ctx.lineTo(bdX + bdW / 2 - 3, bdY + bdH - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bdX + bdW / 2 - 3, bdY + 2); ctx.lineTo(bdX + 2, bdY + bdH - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bdX + bdW / 2 + 1, bdY + 2); ctx.lineTo(bdX + bdW - 3, bdY + bdH - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bdX + bdW - 3, bdY + 2); ctx.lineTo(bdX + bdW / 2 + 1, bdY + bdH - 4); ctx.stroke();
    // Center seam + handles
    ctx.strokeStyle = this._darken(b.color, 50);
    ctx.beginPath(); ctx.moveTo(bdX + bdW / 2, bdY); ctx.lineTo(bdX + bdW / 2, bdY + bdH); ctx.stroke();
    ctx.fillStyle = '#caa23a';
    ctx.fillRect(bdX + bdW / 2 - 4, bdY + bdH / 2 - 1, 3, 3);
    ctx.fillRect(bdX + bdW / 2 + 1, bdY + bdH / 2 - 1, 3, 3);
    ctx.lineWidth = 1;
  }

  // ── Shared sign + NPC + Talk prompt ────────────────────────────────────────

  _drawBuildingSignAndNpc(ctx, b, game) {
    const bx = b.x * TILE_SIZE, by = b.y * TILE_SIZE;
    const bw = b.w * TILE_SIZE, bh = b.h * TILE_SIZE;
    const wallH = (b.id === 'home' || b.id === 'barn') ? 90 : 72;
    const wallTop = by + bh - 12 - wallH;
    const peakLift = (b.id === 'home' || b.id === 'barn') ? 84 : 44;
    const peakX = bx + bw / 2;
    const peakY = wallTop - peakLift;

    // Sign post
    const signPostX = peakX - 2;
    const signPostTop = peakY - 20;
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(signPostX, signPostTop, 4, 22);

    const signW = 60, signH = 18;
    const signX = peakX - signW / 2;
    const signY = signPostTop - signH;
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(signX + 3, signY, signW - 6, signH);
    ctx.fillRect(signX, signY + 3, signW, signH - 6);
    ctx.beginPath(); ctx.arc(signX + 3, signY + 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(signX + signW - 3, signY + 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(signX + 3, signY + signH - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(signX + signW - 3, signY + signH - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.plaster;
    ctx.fillRect(signX + 2, signY + 2, signW - 4, signH - 4);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '10px serif';
    ctx.fillText(b.icon, signX + 14, signY + signH / 2);
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = PALETTE.timber;
    ctx.fillText(b.label, signX + signW / 2 + 4, signY + signH / 2);

    const npc = b.npc;
    const nx = npc.x * TILE_SIZE;
    const ny = npc.y * TILE_SIZE;
    this._drawNpc(ctx, nx, ny, b.color);

    const player = game.player;
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

  // ── Animal Pen + animals ───────────────────────────────────────────────────

  _drawAnimalPen(ctx, game) {
    const p = game.animalPenBounds;
    const px = p.x * TILE_SIZE, py = p.y * TILE_SIZE;
    const pw = p.w * TILE_SIZE, ph = p.h * TILE_SIZE;

    // Dirt floor
    ctx.fillStyle = '#a07848';
    ctx.fillRect(px, py, pw, ph);
    // Darker speckles
    ctx.fillStyle = '#7e5a30';
    for (let i = 0; i < 22; i++) {
      const sx = px + ((i * 17 + 5) % (pw - 2));
      const sy = py + ((i * 29 + 11) % (ph - 2));
      ctx.fillRect(sx, sy, 2, 1);
    }
    // Tan highlights
    ctx.fillStyle = '#bc9060';
    for (let i = 0; i < 14; i++) {
      const sx = px + ((i * 23 + 9) % (pw - 2));
      const sy = py + ((i * 13 + 7) % (ph - 2));
      ctx.fillRect(sx, sy, 1, 1);
    }
    // Edge shadow
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(px, py, pw, 2);
    ctx.fillRect(px, py + ph - 2, pw, 2);
    ctx.fillRect(px, py, 2, ph);
    ctx.fillRect(px + pw - 2, py, 2, ph);

    // Post-and-rail fence — skip top side (faces barn)
    const drawPost = (x, y) => {
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(x - 2, y - 8, 4, 12);
      ctx.fillStyle = PALETTE.timberHi;
      ctx.fillRect(x - 2, y - 8, 1, 12);
    };
    const drawRail = (x1, x2, y) => {
      ctx.fillStyle = PALETTE.timberHi;
      ctx.fillRect(x1, y - 2, x2 - x1, 3);
      ctx.fillStyle = PALETTE.timber;
      ctx.fillRect(x1, y + 1, x2 - x1, 1);
    };
    // Corners + midpoints
    const corners = [
      [px, py],          [px + pw / 2, py],          [px + pw, py],
      [px, py + ph],     [px + pw / 2, py + ph],     [px + pw, py + ph],
      [px, py + ph / 2], [px + pw, py + ph / 2],
    ];
    // Bottom rails (visible side facing camera)
    drawRail(px, px + pw, py + ph - 2);
    drawRail(px, px + pw, py + ph - 10);
    // Left + right rails
    ctx.fillStyle = PALETTE.timberHi;
    ctx.fillRect(px - 1, py + 4, 3, ph - 8);
    ctx.fillRect(px + pw - 2, py + 4, 3, ph - 8);
    // Posts
    for (const [cx, cy] of corners) drawPost(cx, cy);

    // Hay bale (top-left)
    const hbx = px + 8, hby = py + 10;
    ctx.fillStyle = '#d4a840';
    ctx.fillRect(hbx, hby, 22, 18);
    ctx.fillStyle = '#b88828';
    for (let i = 0; i < 3; i++) ctx.fillRect(hbx + 1, hby + 2 + i * 5, 20, 1);
    ctx.fillStyle = '#e8c258';
    ctx.fillRect(hbx, hby, 22, 2);
    ctx.fillStyle = '#7a5818';
    ctx.fillRect(hbx, hby + 18, 22, 1);

    // Water trough (bottom-right)
    const trx = px + pw - 36, tryy = py + ph - 22;
    ctx.fillStyle = '#7a6a5a';
    ctx.fillRect(trx, tryy, 28, 12);
    ctx.fillStyle = '#5e4f40';
    ctx.fillRect(trx, tryy + 10, 28, 2);
    ctx.fillStyle = '#3aa0d0';
    ctx.fillRect(trx + 2, tryy + 2, 24, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(trx + 4, tryy + 3, 6, 1);
    ctx.fillRect(trx + 16, tryy + 4, 4, 1);

    // Animals
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    const cx = px + pw / 2, cy = py + ph / 2;
    const animals = game.animals || [];

    if (animals.length === 0) {
      // Faint silhouette hint
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.40)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+ animal', cx, cy);
    } else {
      for (const a of animals) {
        const seed = (a.id || 0) % 1000;
        const wx = Math.sin(t * 0.4 + seed * 0.123) * (pw / 2 - 18);
        const wy = Math.cos(t * 0.5 + seed * 0.197) * (ph / 2 - 18);
        const bob = Math.sin(t * 4 + seed * 0.3) * 1.4;
        this._drawAnimal(ctx, a.kind, cx + wx, cy + wy + bob);
      }
    }
  }

  _drawAnimal(ctx, kind, cx, cy) {
    // Shadow under every animal
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    if (kind === 'chicken') {
      // Body
      ctx.fillStyle = '#f4e070';
      ctx.fillRect(cx - 5, cy - 2, 10, 8);
      // Head bump
      ctx.fillRect(cx + 1, cy - 6, 6, 5);
      // Comb (red)
      ctx.fillStyle = '#e02828';
      ctx.fillRect(cx + 2, cy - 8, 2, 2);
      ctx.fillRect(cx + 5, cy - 8, 2, 2);
      // Beak
      ctx.fillStyle = '#f08020';
      ctx.fillRect(cx + 7, cy - 4, 2, 2);
      // Eye
      ctx.fillStyle = '#000';
      ctx.fillRect(cx + 4, cy - 4, 1, 1);
      // Wing
      ctx.fillStyle = '#d4b840';
      ctx.fillRect(cx - 3, cy, 5, 3);
      // Feet
      ctx.fillStyle = '#c06020';
      ctx.fillRect(cx - 2, cy + 6, 1, 1);
      ctx.fillRect(cx + 2, cy + 6, 1, 1);

    } else if (kind === 'cow') {
      // Body (white)
      ctx.fillStyle = '#f0f0e8';
      ctx.fillRect(cx - 8, cy - 3, 16, 9);
      // Black patches
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 7, cy - 2, 4, 3);
      ctx.fillRect(cx + 2, cy + 1, 5, 3);
      // Head
      ctx.fillStyle = '#f0f0e8';
      ctx.fillRect(cx + 6, cy - 5, 6, 6);
      // Snout (pink)
      ctx.fillStyle = '#e8a8a0';
      ctx.fillRect(cx + 10, cy - 1, 3, 3);
      // Eye
      ctx.fillStyle = '#000';
      ctx.fillRect(cx + 8, cy - 3, 1, 1);
      // Horn
      ctx.fillStyle = '#d8c8a8';
      ctx.fillRect(cx + 6, cy - 6, 1, 2);
      // Udder dot
      ctx.fillStyle = '#e890a0';
      ctx.fillRect(cx - 1, cy + 5, 2, 2);
      // Legs
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 6, cy + 6, 2, 2);
      ctx.fillRect(cx + 4, cy + 6, 2, 2);

    } else if (kind === 'sheep') {
      // Cloud-shape body (3 overlapping fluffs)
      ctx.fillStyle = '#f0ece4';
      ctx.beginPath(); ctx.arc(cx - 5, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 2, cy + 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 3, cy + 3, 4, 0, Math.PI * 2); ctx.fill();
      // Head (grey)
      ctx.fillStyle = '#383028';
      ctx.fillRect(cx + 6, cy - 2, 5, 5);
      // Eye
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx + 8, cy - 1, 1, 1);
      // Legs
      ctx.fillStyle = '#383028';
      ctx.fillRect(cx - 4, cy + 6, 2, 2);
      ctx.fillRect(cx + 3, cy + 6, 2, 2);
    }
  }

  _drawNpc(ctx, px, py, accent) {
    // Derive a hair color from the accent hash
    const accentN = parseInt(accent.replace('#', ''), 16);
    const hairVariant = accentN % 4;
    const hairColors = ['#3a2010', '#8b5e2c', '#c8a040', '#2a2040'];
    const hairColor = hairColors[hairVariant];

    // Idle animation: gentle vertical bob + arm sway, phase per-NPC so they don't sync
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    const phase = (accentN % 100) * 0.06;
    const bob = Math.round(Math.sin(t * 1.6 + phase) * 1.2);
    const armAnim = Math.round(Math.sin(t * 1.4 + phase + 0.7) * 1.5);
    // Blink: closed eyes once every ~3 seconds
    const blinkCycle = (t * 0.6 + phase) % 1;
    const blinking = blinkCycle < 0.04;

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

    // ── Upper body bobs gently ─────────────────────────────────────────────
    ctx.save();
    ctx.translate(0, bob);

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

    // Eyes — blink occasionally (closed = thin horizontal line)
    if (blinking) {
      ctx.fillStyle = '#222';
      ctx.fillRect(px + 17, py + 12, 4, 1);
      ctx.fillRect(px + 27, py + 12, 4, 1);
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(px + 17, py + 10, 4, 4);
      ctx.fillRect(px + 27, py + 10, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + 18, py + 10, 1, 1);
      ctx.fillRect(px + 28, py + 10, 1, 1);
    }

    // Slight smile
    ctx.fillStyle = '#c07050';
    ctx.fillRect(px + 18, py + 16, 9, 2);
    ctx.fillRect(px + 17, py + 15, 2, 2);
    ctx.fillRect(px + 26, py + 15, 2, 2);

    ctx.restore();
  }

  // Returns the NPC or hotspot under a screen point (for tap-to-interact), or null.
  npcAt(screenX, screenY) {
    const inRect = (r) => screenX >= r.sx && screenX <= r.sx + r.sw &&
                          screenY >= r.sy && screenY <= r.sy + r.sh;
    if (this._npcRects) {
      for (const r of this._npcRects) if (inRect(r)) return r;
    }
    if (this._hotspotRects) {
      for (const r of this._hotspotRects) if (inRect(r)) return r;
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

  // Full-screen day/night tint. timeOfDay 0..1 (0=midnight … 0.5=noon). Lerps
  // between keyframes (wrapping at 1.0) for a smooth sunrise→noon→dusk→night cycle.
  _drawDayNightOverlay(ctx, timeOfDay) {
    // Each keyframe: [time, r, g, b, a]. Strong blue night, soft warm dawn/dusk,
    // clear at noon. Keep night dark-but-readable per design (a ≤ 0.55).
    const keys = [
      [0.00,   8,  12,  48, 0.55],  // midnight — deep blue
      [0.21, 255, 150,  70, 0.18],  // sunrise  — warm amber
      [0.50,   0,   0,   0, 0.00],  // noon     — clear
      [0.78, 255, 110,  40, 0.22],  // dusk     — orange
      [1.00,   8,  12,  48, 0.55],  // wraps back to midnight
    ];
    const t = ((timeOfDay % 1) + 1) % 1;
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i][0] && t <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    const r = Math.round(a[1] + (b[1] - a[1]) * f);
    const g = Math.round(a[2] + (b[2] - a[2]) * f);
    const bl = Math.round(a[3] + (b[3] - a[3]) * f);
    const al = a[4] + (b[4] - a[4]) * f;
    if (al <= 0.001) return;
    ctx.fillStyle = `rgba(${r},${g},${bl},${al.toFixed(3)})`;
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
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

    // (Pond shadow removed per user request.)

    // ── Sandy / muddy shore (wide, darker ring around the water) ───────────
    ctx.fillStyle = '#a78550';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx + 16, ry + 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b6a3a';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx + 10, ry + 6, 0, 0, Math.PI * 2); ctx.fill();
    // Pebbles around the shore
    ctx.fillStyle = '#5a4a3a';
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const dx = Math.cos(ang) * (rx + 10 + (i % 3));
      const dy = Math.sin(ang) * (ry + 7 + ((i * 7) % 3));
      ctx.fillRect(cx + dx | 0, cy + dy | 0, 2, 2);
    }
    ctx.fillStyle = '#8a7560';
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + 0.2;
      const dx = Math.cos(ang) * (rx + 13);
      const dy = Math.sin(ang) * (ry + 10);
      ctx.fillRect((cx + dx) | 0, (cy + dy) | 0, 3, 2);
    }

    // ── Water (radial gradient for depth) ──────────────────────────────────
    const grad = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 4, cx, cy, rx);
    grad.addColorStop(0, '#5fb0d4');
    grad.addColorStop(0.55, '#3a82b8');
    grad.addColorStop(1, '#1c4870');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();

    // Darker shore edge inside the water
    ctx.fillStyle = 'rgba(15,40,70,0.55)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy, rx - 5, ry - 4, 0, 0, Math.PI * 2);
    ctx.fill('evenodd');

    // ── Animated ripples (concentric expanding rings) ──────────────────────
    for (let r = 0; r < 3; r++) {
      const phase = (t * 0.5 + r * 0.4) % 1.5;
      if (phase > 1) continue;
      const rad = phase * (rx - 8);
      ctx.strokeStyle = `rgba(200,235,255,${(0.45 - phase * 0.35).toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(r * 1.7) * 6, cy + Math.cos(r * 1.3) * 4, rad, rad * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shimmer highlights (top-left specular)
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.3, cy - ry * 0.4, rx * 0.35, ry * 0.16, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.05, cy - ry * 0.5, rx * 0.18, ry * 0.08, -0.2, 0, Math.PI * 2); ctx.fill();

    // Sparkles
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const sparkles = [[-0.4, -0.2], [0.3, 0.1], [-0.1, 0.35], [0.45, -0.3]];
    sparkles.forEach(([dx, dy], i) => {
      const flick = Math.sin(t * 3 + i * 1.4) > 0.4 ? 1 : 0;
      if (flick) ctx.fillRect((cx + dx * rx) | 0, (cy + dy * ry) | 0, 2, 2);
    });

    // ── Lily pads with flowers ──────────────────────────────────────────────
    const pads = [[-26, 14, 0.5], [34, -6, -0.3], [-2, 28, 0.2], [22, 24, 0.7]];
    pads.forEach(([lx, ly, rot]) => {
      const px = cx + lx, py = cy + ly;
      // Pad shadow
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath(); ctx.ellipse(px + 1, py + 1, 11, 7, rot, 0, Math.PI * 2); ctx.fill();
      // Pad body
      ctx.fillStyle = '#2f7a26';
      ctx.beginPath(); ctx.ellipse(px, py, 11, 7, rot, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3faa30';
      ctx.beginPath(); ctx.ellipse(px - 2, py - 2, 8, 5, rot, 0, Math.PI * 2); ctx.fill();
      // Notch (V cut)
      ctx.fillStyle = '#1c4870';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(rot) * 11, py + Math.sin(rot) * 11);
      ctx.lineTo(px + Math.cos(rot + 0.6) * 11, py + Math.sin(rot + 0.6) * 11);
      ctx.closePath();
      ctx.fill();
    });
    // Pink flower on one pad
    ctx.fillStyle = '#ff8fb0';
    ctx.beginPath(); ctx.arc(cx - 28, cy + 11, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffeb6a';
    ctx.fillRect((cx - 28) | 0, (cy + 11) | 0, 1, 1);

    // ── Reeds / cattails at the shore edges ─────────────────────────────────
    const reedSpots = [[-rx + 6, -ry * 0.2], [-rx + 14, ry * 0.4], [rx - 8, -ry * 0.5], [rx - 16, ry * 0.5], [-4, -ry + 4]];
    reedSpots.forEach(([dx, dy], i) => {
      const rxp = cx + dx, ryp = cy + dy;
      const sway = Math.sin(t * 1.5 + i) * 1.5;
      // Stem
      ctx.fillStyle = '#3a7820';
      ctx.fillRect(rxp | 0, ryp - 18 | 0, 2, 20);
      ctx.fillRect((rxp + 3 + sway) | 0, ryp - 14 | 0, 2, 16);
      // Cattail head (brown nub)
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(rxp | 0, ryp - 22 | 0, 3, 6);
      ctx.fillRect((rxp + 3 + sway) | 0, ryp - 18 | 0, 3, 5);
      // Highlight
      ctx.fillStyle = '#7a4a26';
      ctx.fillRect(rxp | 0, ryp - 22 | 0, 1, 4);
    });

    // ── Small wooden dock sitting on the south shore (outside the water) ───
    const dockW = 32, dockH = 10;
    const dockX = cx - dockW / 2;
    const dockY = cy + ry + 8;          // below the water + shore ring
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(dockX, dockY + dockH, dockW, 3);
    // Planks
    ctx.fillStyle = PALETTE.timber;
    ctx.fillRect(dockX, dockY, dockW, dockH);
    ctx.fillStyle = PALETTE.timberHi;
    for (let p = 0; p < 4; p++) ctx.fillRect(dockX + 2, dockY + 1 + p * 3, dockW - 4, 1);
    // Posts (front corners)
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(dockX - 1, dockY + dockH - 2, 3, 6);
    ctx.fillRect(dockX + dockW - 2, dockY + dockH - 2, 3, 6);

    // ── Occasional jumping fish (splash arc) ───────────────────────────────
    const fishPhase = (t * 0.4) % 4;
    if (fishPhase < 0.6) {
      const fx = cx + Math.sin(t * 0.2) * rx * 0.4;
      const arcT = fishPhase / 0.6; // 0..1
      const fy = cy - Math.sin(arcT * Math.PI) * 14;
      // Fish silhouette
      ctx.fillStyle = '#9ec0d8';
      ctx.beginPath();
      ctx.ellipse(fx, fy, 5, 2.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Tail
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy);
      ctx.lineTo(fx - 9, fy - 3);
      ctx.lineTo(fx - 9, fy + 3);
      ctx.closePath();
      ctx.fill();
      // Splash ring at landing
      if (arcT > 0.7) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(fx, cy, 8 * (arcT - 0.7) / 0.3, 3 * (arcT - 0.7) / 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ── Label ───────────────────────────────────────────────────────────────
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.strokeText('🎣 Fishing', cx, cy + ry + 22);
    ctx.fillText('🎣 Fishing', cx, cy + ry + 22);
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
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
