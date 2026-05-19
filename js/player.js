import { FARM_SIZES } from './constants.js';

export class Player {
  constructor() {
    this.gridX = 2;
    this.gridY = 2;
    this.tool = 'hoe';
    this.selectedSeed = 'wheat';
    this.skin = 'default';
    this.facingDX = 0;
    this.facingDY = 1;
    // Movement throttle
    this._moveTimer = 0;
    this._moveDelay = 140; // ms between steps
  }

  move(dx, dy, bounds, isBlocked, dt) {
    this._moveTimer -= dt;
    if (this._moveTimer > 0 || (dx === 0 && dy === 0)) return false;
    if (dx !== 0 || dy !== 0) {
      this.facingDX = dx;
      this.facingDY = dy;
    }
    const nx = this.gridX + dx;
    const ny = this.gridY + dy;
    const inBounds = nx >= bounds.minX && ny >= bounds.minY && nx < bounds.maxX && ny < bounds.maxY;
    if (inBounds && !(isBlocked && isBlocked(nx, ny))) {
      this.gridX = nx;
      this.gridY = ny;
      this._moveTimer = this._moveDelay;
      return true;
    }
    return false;
  }

  actionTile() {
    return { x: this.gridX + this.facingDX, y: this.gridY + this.facingDY };
  }

  cycleSeed(cropKinds) {
    const idx = cropKinds.indexOf(this.selectedSeed);
    this.selectedSeed = cropKinds[(idx + 1) % cropKinds.length];
  }

  serialize() {
    return { gridX: this.gridX, gridY: this.gridY, tool: this.tool, selectedSeed: this.selectedSeed, skin: this.skin, facingDX: this.facingDX, facingDY: this.facingDY };
  }

  static deserialize(data) {
    const p = new Player();
    Object.assign(p, data);
    return p;
  }
}
