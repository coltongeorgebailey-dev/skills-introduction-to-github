import { TILE_SIZE, CROPS, SKINS, HOME_COLS, HOME_ROWS, FURNITURE } from './constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  get w() { return this.canvas.width; }
  get h() { return this.canvas.height; }

  render(game, view) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);

    if (view === 'farm') {
      this._renderFarm(game);
    } else if (view === 'home') {
      this._renderHome(game);
    }
  }

  _renderFarm(game) {
    const { ctx } = this;
    const { farm, player } = game;
    const camX = farm.camX;
    const camY = farm.camY;

    ctx.save();
    ctx.translate(-camX, -camY);

    // Draw tiles
    for (let y = 0; y < farm.rows; y++) {
      for (let x = 0; x < farm.cols; x++) {
        this._drawTile(ctx, x, y, farm.tiles[y][x]);
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= farm.rows; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * TILE_SIZE); ctx.lineTo(farm.cols * TILE_SIZE, y * TILE_SIZE); ctx.stroke();
    }
    for (let x = 0; x <= farm.cols; x++) {
      ctx.beginPath(); ctx.moveTo(x * TILE_SIZE, 0); ctx.lineTo(x * TILE_SIZE, farm.rows * TILE_SIZE); ctx.stroke();
    }

    // Highlight action tile
    const at = player.actionTile();
    const atTile = farm.getTile(at.x, at.y);
    if (atTile) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(at.x * TILE_SIZE + 2, at.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    // Player
    this._drawPlayer(ctx, player);
    ctx.restore();
  }

  _drawTile(ctx, x, y, tile) {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

    // Background
    if (tile.type === 'grass') {
      ctx.fillStyle = '#5a9e4a';
    } else if (tile.type === 'tilled') {
      ctx.fillStyle = '#8B5E3C';
    } else {
      // planted
      ctx.fillStyle = tile.crop?.wateredToday ? '#6B4423' : '#8B5E3C';
    }
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Grass texture dots
    if (tile.type === 'grass') {
      ctx.fillStyle = '#4a8a3a';
      for (let i = 0; i < 3; i++) {
        const gx = px + 8 + i * 14;
        const gy = py + 10 + (i % 2) * 14;
        ctx.fillRect(gx, gy, 3, 5);
      }
    }

    // Crop
    if (tile.crop) {
      this._drawCrop(ctx, px, py, tile.crop);
    }
  }

  _drawCrop(ctx, px, py, crop) {
    const def = CROPS[crop.kind];
    if (!def) return;
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    const s = crop.stage;

    if (s === 0) {
      // Tiny seed
      ctx.fillStyle = '#5a3010';
      ctx.beginPath(); ctx.arc(cx, cy + 8, 4, 0, Math.PI * 2); ctx.fill();
    } else if (s === 1) {
      // Sprout
      ctx.fillStyle = '#30aa30';
      ctx.fillRect(cx - 2, cy + 4, 4, 12);
      ctx.fillRect(cx - 8, cy + 4, 8, 4);
    } else if (s === 2) {
      // Growing
      ctx.fillStyle = '#228B22';
      ctx.fillRect(cx - 2, cy - 4, 4, 18);
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(cx - 7, cy - 4, 14, 8);
      ctx.fillStyle = '#30aa30';
      ctx.fillRect(cx - 10, cy + 2, 20, 4);
    } else {
      // Ready — full crop
      ctx.fillStyle = '#228B22';
      ctx.fillRect(cx - 2, cy - 6, 4, 20);
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(cx, cy - 8, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.darkColor;
      ctx.beginPath(); ctx.arc(cx - 3, cy - 10, 4, 0, Math.PI * 2); ctx.fill();
      // Ready sparkle
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const r1 = 13, r2 = 17;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy - 8 + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy - 8 + Math.sin(angle) * r2);
        ctx.stroke();
      }
    }
  }

  _drawPlayer(ctx, player) {
    const px = player.gridX * TILE_SIZE;
    const py = player.gridY * TILE_SIZE;

    const skinDef = SKINS.player.find(s => s.id === player.skin) || SKINS.player[0];

    // Body
    ctx.fillStyle = skinDef.bodyColor;
    ctx.fillRect(px + 10, py + 16, 28, 26);

    // Head
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(px + 14, py + 4, 20, 18);

    // Hat
    ctx.fillStyle = skinDef.hatColor;
    ctx.fillRect(px + 11, py + 2, 26, 6);
    ctx.fillRect(px + 15, py - 6, 18, 10);

    // Direction indicator (white dot)
    ctx.fillStyle = '#ffffff';
    const dotX = px + 24 + player.facingDX * 8;
    const dotY = py + 14 + player.facingDY * 8;
    ctx.beginPath(); ctx.arc(dotX, dotY, 3, 0, Math.PI * 2); ctx.fill();

    // Tool hint
    ctx.fillStyle = '#ffdd00';
    ctx.font = '12px monospace';
    ctx.fillText(this._toolIcon(player.tool), px + 2, py + 14);
  }

  _toolIcon(tool) {
    return { hoe: '⛏', water: '💧', seed: '🌱', scythe: '🌾' }[tool] || '';
  }

  _renderHome(game) {
    const { ctx } = this;
    const tileW = Math.floor(this.w / HOME_COLS);
    const tileH = Math.floor((this.h - 80) / HOME_ROWS);

    // Floor
    ctx.fillStyle = '#d4b896';
    ctx.fillRect(0, 0, this.w, HOME_ROWS * tileH);

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= HOME_ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * tileH); ctx.lineTo(HOME_COLS * tileW, y * tileH); ctx.stroke();
    }
    for (let x = 0; x <= HOME_COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * tileW, 0); ctx.lineTo(x * tileW, HOME_ROWS * tileH); ctx.stroke();
    }

    // Furniture
    game.homeLayout.forEach(item => {
      const def = FURNITURE.find(f => f.id === item.id);
      if (!def) return;
      const px = item.x * tileW;
      const py = item.y * tileH;
      ctx.fillStyle = def.color;
      ctx.fillRect(px + 4, py + 4, def.w * tileW - 8, def.h * tileH - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = `${Math.min(tileW - 8, 14)}px monospace`;
      ctx.fillText(def.label, px + 6, py + tileH / 2 + 4);
    });

    // Walls hint
    const skinDef = SKINS.house.find(s => s.id === game.houseSkin) || SKINS.house[0];
    ctx.fillStyle = skinDef.wallColor;
    ctx.fillRect(0, 0, 8, HOME_ROWS * tileH);
    ctx.fillRect(HOME_COLS * tileW - 8, 0, 8, HOME_ROWS * tileH);
    ctx.fillRect(0, 0, HOME_COLS * tileW, 8);

    // Roof color bar
    ctx.fillStyle = skinDef.roofColor;
    ctx.fillRect(0, HOME_ROWS * tileH, HOME_COLS * tileW, 12);
  }

  // Returns {tileX, tileY} from pixel coords on farm canvas
  pixelToTile(farm, screenX, screenY) {
    const wx = screenX + farm.camX;
    const wy = screenY + farm.camY;
    return { tileX: Math.floor(wx / TILE_SIZE), tileY: Math.floor(wy / TILE_SIZE) };
  }

  // Returns {tileX, tileY} from pixel coords on home canvas
  pixelToHomeTile(screenX, screenY) {
    const tileW = Math.floor(this.w / HOME_COLS);
    const tileH = Math.floor((this.h - 80) / HOME_ROWS);
    return { tileX: Math.floor(screenX / tileW), tileY: Math.floor(screenY / tileH) };
  }
}
