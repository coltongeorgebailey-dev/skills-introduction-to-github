import { CROPS } from './constants.js';

export class Farm {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = this._initTiles(cols, rows);
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
      if (tile && tile.crop) {
        tile.crop.lastWateredAt = Date.now();
        tile.crop.isDry = false;
      }
    });
    return targets.length;
  }

  plant(x, y, kind) {
    const tile = this.getTile(x, y);
    if (!tile || tile.type !== 'tilled' || tile.crop) return false;
    tile.type = 'planted';
    tile.crop = { kind, stage: 0, totalGrownMs: 0, lastWateredAt: Date.now(), isDry: false };
    return true;
  }

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

  // Called every frame — advances real-time crop growth.
  // autoWater = true (Auto-Drip tool) keeps every crop perpetually watered.
  tick(dt, autoWater = false) {
    const now = Date.now();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const crop = this.tiles[y][x].crop;
        if (!crop || crop.stage >= 3) continue;
        const def = CROPS[crop.kind];
        if (!def) continue;

        if (autoWater) {
          crop.lastWateredAt = now;
          crop.isDry = false;
        } else if (!crop.isDry && (now - crop.lastWateredAt) > def.waterIntervalMs) {
          crop.isDry = true;
        }
        if (!crop.isDry) {
          crop.totalGrownMs = Math.min(def.growMs, crop.totalGrownMs + dt);
        }
        const p = crop.totalGrownMs / def.growMs;
        crop.stage = p >= 1 ? 3 : Math.floor(p * 3);
      }
    }
  }

  // Called on Sleep — applies rain/storm auto-watering only
  applyWeatherWater() {
    const now = Date.now();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const crop = this.tiles[y][x].crop;
        if (crop) {
          crop.lastWateredAt = now;
          crop.isDry = false;
        }
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
    farm.tiles = data.tiles.map(row => row.map(t => {
      const tile = { ...t, crop: t.crop ? { ...t.crop } : null };
      if (tile.crop) {
        const crop = tile.crop;
        const def = CROPS[crop.kind];
        // Migrate old save format (daysWatered/wateredToday → totalGrownMs/lastWateredAt)
        if (crop.daysWatered !== undefined && crop.totalGrownMs === undefined) {
          const progress = def ? crop.daysWatered / (def.daysToGrow || 1) : 0;
          crop.totalGrownMs = def ? progress * def.growMs : 0;
          crop.lastWateredAt = Date.now();
          crop.isDry = !crop.wateredToday;
          delete crop.daysWatered;
          delete crop.wateredToday;
        }
        // Ensure new fields exist (defensive)
        if (crop.lastWateredAt == null) crop.lastWateredAt = Date.now();
        if (crop.isDry == null) crop.isDry = false;
        if (crop.totalGrownMs == null) crop.totalGrownMs = 0;
      }
      return tile;
    }));
    return farm;
  }
}
