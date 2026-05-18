import { CROPS } from './constants.js';

export class Farm {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = this._initTiles(cols, rows);
    // Camera offset in pixels (for panning)
    this.camX = 0;
    this.camY = 0;
  }

  _initTiles(cols, rows) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type: 'grass', crop: null }))
    );
  }

  resize(newCols, newRows) {
    const newTiles = this._initTiles(newCols, newRows);
    for (let y = 0; y < Math.min(this.rows, newRows); y++) {
      for (let x = 0; x < Math.min(this.cols, newCols); x++) {
        newTiles[y][x] = this.tiles[y][x];
      }
    }
    this.cols = newCols;
    this.rows = newRows;
    this.tiles = newTiles;
  }

  getTile(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return this.tiles[y][x];
  }

  // Returns array of {x, y} tiles affected by the action (AoE centered on cx, cy)
  _aoeTiles(cx, cy, aoe) {
    const tiles = [];
    if (aoe <= 1) { tiles.push({ x: cx, y: cy }); return tiles; }
    const radius = Math.floor(Math.sqrt(aoe - 1));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows) {
          tiles.push({ x: tx, y: ty });
        }
        if (tiles.length >= aoe) return tiles;
      }
    }
    return tiles;
  }

  till(x, y, aoe = 1) {
    const targets = this._aoeTiles(x, y, aoe);
    targets.forEach(({ x: tx, y: ty }) => {
      const tile = this.getTile(tx, ty);
      if (tile && tile.type === 'grass') tile.type = 'tilled';
    });
    return targets.length;
  }

  water(x, y, aoe = 1) {
    const targets = this._aoeTiles(x, y, aoe);
    targets.forEach(({ x: tx, y: ty }) => {
      const tile = this.getTile(tx, ty);
      if (tile && tile.crop) tile.crop.wateredToday = true;
    });
    return targets.length;
  }

  plant(x, y, kind) {
    const tile = this.getTile(x, y);
    if (!tile || tile.type !== 'tilled' || tile.crop) return false;
    tile.type = 'planted';
    tile.crop = { kind, stage: 0, daysWatered: 0, wateredToday: false };
    return true;
  }

  // Returns crop kind if successful harvest, null otherwise
  harvest(x, y, aoe = 1) {
    const targets = this._aoeTiles(x, y, aoe);
    const harvested = {};
    targets.forEach(({ x: tx, y: ty }) => {
      const tile = this.getTile(tx, ty);
      if (tile && tile.crop && tile.crop.stage >= 3) {
        const kind = tile.crop.kind;
        harvested[kind] = (harvested[kind] || 0) + 1;
        tile.type = 'tilled';
        tile.crop = null;
      }
    });
    return harvested;
  }

  advanceDay() {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const tile = this.tiles[y][x];
        if (!tile.crop) continue;
        const crop = tile.crop;
        if (crop.wateredToday) {
          crop.daysWatered++;
          const def = CROPS[crop.kind];
          if (def) {
            const progress = crop.daysWatered / def.daysToGrow;
            crop.stage = Math.min(3, Math.floor(progress * 3) + (progress >= 1 ? 1 : 0));
          }
        }
        crop.wateredToday = false;
      }
    }
  }

  serialize() {
    return {
      cols: this.cols,
      rows: this.rows,
      camX: this.camX,
      camY: this.camY,
      tiles: this.tiles.map(row => row.map(t => ({ ...t, crop: t.crop ? { ...t.crop } : null }))),
    };
  }

  static deserialize(data) {
    const farm = new Farm(data.cols, data.rows);
    farm.camX = data.camX || 0;
    farm.camY = data.camY || 0;
    farm.tiles = data.tiles.map(row => row.map(t => ({ ...t, crop: t.crop ? { ...t.crop } : null })));
    return farm;
  }
}
