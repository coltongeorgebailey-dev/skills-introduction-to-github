import { TILE_SIZE, CROPS, SKINS, HOME_COLS, HOME_ROWS, FURNITURE, SEASONS, ANIMALS } from './constants.js';

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
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }

  get w() { return this.canvas.width; }
  get h() { return this.canvas.height; }

  render(game, view, timestamp = 0) {
    this._timestamp = timestamp;
    this.ctx.clearRect(0, 0, this.w, this.h);
    if (view === 'farm') this._renderFarm(game);
    else if (view === 'home') this._renderHome(game);
    else if (view === 'barn') this._renderBarn(game);
  }

  // ── Farm ────────────────────────────────────────────────────────────────────

  _renderFarm(game) {
    const { ctx } = this;
    const { farm, player } = game;

    // Wild nature background
    ctx.fillStyle = '#3d6e22';
    ctx.fillRect(0, 0, this.w, this.h);
    this._drawWildBackground(ctx, farm);

    ctx.save();
    ctx.translate(-farm.camX, -farm.camY);

    // Sandy dirt border around the farm
    const bw = 32;
    ctx.fillStyle = '#b89050';
    ctx.fillRect(-bw, -bw, farm.cols * TILE_SIZE + bw * 2, farm.rows * TILE_SIZE + bw * 2);
    // Inner shadow of border
    ctx.fillStyle = '#9a7438';
    ctx.fillRect(-bw, -bw, farm.cols * TILE_SIZE + bw * 2, 6);
    ctx.fillRect(-bw, farm.rows * TILE_SIZE + bw - 6, farm.cols * TILE_SIZE + bw * 2, 6);

    // Fence
    this._drawFence(ctx, farm);

    // Tiles
    for (let y = 0; y < farm.rows; y++) {
      for (let x = 0; x < farm.cols; x++) {
        this._drawTile(ctx, x, y, farm.tiles[y][x]);
      }
    }

    // Subtle tile grid
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= farm.rows; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * TILE_SIZE); ctx.lineTo(farm.cols * TILE_SIZE, y * TILE_SIZE); ctx.stroke();
    }
    for (let x = 0; x <= farm.cols; x++) {
      ctx.beginPath(); ctx.moveTo(x * TILE_SIZE, 0); ctx.lineTo(x * TILE_SIZE, farm.rows * TILE_SIZE); ctx.stroke();
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

    // Player
    this._drawPlayer(ctx, player);

    ctx.restore();

    // Season + weather overlays (drawn over everything, in screen space)
    this._drawSeasonOverlay(ctx, game.season);
    if (game.weather === 'rainy' || game.weather === 'stormy') {
      this._drawRainOverlay(ctx);
    }
    if (game.season === 3) this._drawSnowOverlay(ctx); // Winter
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

    // Trees scattered in the wild
    const treePositions = [
      [-3,-2],[cols+1,-2],[cols+1,rows+1],[-3,rows+1],
      [-3, 2],[cols+1, 3],[-3, 5],[cols+1, 6],
    ];
    treePositions.forEach(([col, row]) => {
      const px = offX + col * TILE_SIZE;
      const py = offY + row * TILE_SIZE;
      this._drawPineTree(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
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

    // Top fence
    for (let x = 0; x < farm.cols; x++) {
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
      drawPost(x * TILE_SIZE, -14);
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

    ctx.save();
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const stripY = py + TILE_SIZE - 14;
    const stripH = 14;
    const cx = px + TILE_SIZE / 2;
    const cy = stripY + stripH / 2;

    let bgColor, label;

    if (crop.stage >= 3) {
      bgColor = 'rgba(50,200,50,0.85)';
      label = '✂ Ready';
    } else if (crop.isDry) {
      bgColor = 'rgba(200,60,30,0.88)';
      label = '⚠ Water!';
    } else {
      const now = Date.now();
      const msUntilDry = def.waterIntervalMs - (now - crop.lastWateredAt);
      if (msUntilDry < 30000) {
        bgColor = 'rgba(200,150,0,0.85)';
        label = '💧 ' + this._formatMs(msUntilDry);
      } else {
        bgColor = 'rgba(20,20,20,0.6)';
        const msLeft = def.growMs - crop.totalGrownMs;
        label = '⏱ ' + this._formatMs(msLeft);
      }
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(px, stripY, TILE_SIZE, stripH);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, cy);

    ctx.restore();
  }

  _drawGrassTile(ctx, px, py, tx, ty) {
    const h = pr(tx, ty);
    ctx.fillStyle = '#6db33f';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Top-left highlight
    ctx.fillStyle = '#7ec948';
    ctx.fillRect(px, py, TILE_SIZE, 5);
    ctx.fillRect(px, py, 5, TILE_SIZE);

    // Bottom-right shadow
    ctx.fillStyle = '#5a9830';
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

    // Flower (rare)
    if ((h >> 14) < 0x2) {
      const fx = px + 7 + (h & 0x1f) % (TILE_SIZE - 14);
      const fy = py + 7 + ((h >> 6) & 0x1f) % (TILE_SIZE - 14);
      ctx.fillStyle = (h & 0x20) ? '#ffee44' : '#ff88bb';
      ctx.fillRect(fx - 1, fy, 3, 1); ctx.fillRect(fx, fy - 1, 1, 3);
      ctx.fillRect(fx, fy, 1, 1);
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx, fy, 1, 1);
    }
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

  // ── Home ─────────────────────────────────────────────────────────────────────

  _renderHome(game) {
    const { ctx } = this;
    const tileW = Math.floor(this.w / HOME_COLS);
    const tileH = Math.floor((this.h - 60) / HOME_ROWS);
    const skinDef = SKINS.house.find(s => s.id === (game.houseSkin || 'classic')) || SKINS.house[0];

    // Walls
    ctx.fillStyle = skinDef.wallColor;
    ctx.fillRect(0, 0, this.w, HOME_ROWS * tileH);

    // Wallpaper pattern
    ctx.fillStyle = this._darken(skinDef.wallColor, 15);
    for (let y = 0; y < HOME_ROWS; y++) {
      for (let x = 0; x < HOME_COLS; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * tileW + 4, y * tileH + 4, tileW - 8, tileH - 8);
      }
    }

    // Floor (bottom 2 rows feel like floor vs wall)
    const floorY = (HOME_ROWS - 2) * tileH;
    ctx.fillStyle = '#c8a870';
    ctx.fillRect(0, floorY, this.w, HOME_ROWS * tileH - floorY);
    // Floorboard lines
    ctx.strokeStyle = this._darken('#c8a870', 20);
    ctx.lineWidth = 1;
    for (let x = 0; x < HOME_COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * tileW, floorY); ctx.lineTo(x * tileW, HOME_ROWS * tileH); ctx.stroke();
    }

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
    for (let y = 0; y <= HOME_ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * tileH); ctx.lineTo(HOME_COLS * tileW, y * tileH); ctx.stroke(); }
    for (let x = 0; x <= HOME_COLS; x++) { ctx.beginPath(); ctx.moveTo(x * tileW, 0); ctx.lineTo(x * tileW, HOME_ROWS * tileH); ctx.stroke(); }

    // Baseboards
    ctx.fillStyle = this._darken(skinDef.wallColor, 30);
    ctx.fillRect(0, floorY - 6, this.w, 6);

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

    // Roof bar
    ctx.fillStyle = skinDef.roofColor;
    ctx.fillRect(0, HOME_ROWS * tileH, this.w, 14);
    ctx.fillStyle = this._lighten(skinDef.roofColor, 20);
    ctx.fillRect(0, HOME_ROWS * tileH, this.w, 3);
  }

  // ── Season / Weather Overlays ─────────────────────────────────────────────

  _drawSeasonOverlay(ctx, season) {
    const tints = [null, 'rgba(255,220,100,0.06)', 'rgba(255,140,40,0.10)', 'rgba(100,140,220,0.12)'];
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

    // Background
    ctx.fillStyle = '#c8a060';
    ctx.fillRect(0, 0, this.w, this.h);

    // Barn wood wall texture
    ctx.fillStyle = '#a07040';
    for (let i = 0; i < Math.ceil(this.h / 30); i++) {
      ctx.fillRect(0, i * 30, this.w, 2);
    }

    // Roof bar
    ctx.fillStyle = '#8B2020';
    ctx.fillRect(0, 0, this.w, 22);
    ctx.fillStyle = '#aa3030';
    ctx.fillRect(0, 0, this.w, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, this.w, 2);

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

    // Stall floor
    ctx.fillStyle = '#d4b060';
    ctx.fillRect(sx + 4, sy, sw - 8, sh);
    // Stall walls (darker sides)
    ctx.fillStyle = '#a07840';
    ctx.fillRect(sx + 4, sy, 6, sh);
    ctx.fillRect(sx + sw - 10, sy, 6, sh);
    ctx.fillRect(sx + 4, sy, sw - 8, 6);

    // Hay
    ctx.fillStyle = '#e8c840';
    ctx.fillRect(sx + sw / 2 - 16, sy + sh - 24, 32, 12);
    ctx.fillStyle = '#c8a820';
    for (let i = 0; i < 4; i++) ctx.fillRect(sx + sw / 2 - 14 + i * 8, sy + sh - 22, 2, 10);

    // Animal sprite
    const cx = sx + sw / 2;
    const cy = sy + sh / 2 - 10;
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
