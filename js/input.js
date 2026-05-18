export class Input {
  constructor() {
    this.keys = {};
    this.justPressed = {};
    this._pendingJust = {};
    this.mouse = { x: 0, y: 0, clicked: false, _pendingClick: false };
    this.touch = { active: false, startX: 0, startY: 0, dx: 0, dy: 0, tapped: false, tapX: 0, tapY: 0 };
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', e => {
      if (!this.keys[e.key]) this._pendingJust[e.key] = true;
      this.keys[e.key] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key] = false;
    });
  }

  bindCanvas(canvas) {
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse._pendingClick = true;
    });
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });

    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      touchStartX = t.clientX - rect.left;
      touchStartY = t.clientY - rect.top;
      touchStartTime = Date.now();
      this.touch.startX = touchStartX;
      this.touch.startY = touchStartY;
      this.touch.active = true;
      this.touch.dx = 0;
      this.touch.dy = 0;
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const cx = t.clientX - rect.left;
      const cy = t.clientY - rect.top;
      this.touch.dx = cx - touchStartX;
      this.touch.dy = cy - touchStartY;
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      const duration = Date.now() - touchStartTime;
      const dist = Math.hypot(this.touch.dx, this.touch.dy);
      if (duration < 300 && dist < 10) {
        this.touch.tapped = true;
        this.touch.tapX = touchStartX;
        this.touch.tapY = touchStartY;
        this.mouse.x = touchStartX;
        this.mouse.y = touchStartY;
        this.mouse._pendingClick = true;
      }
      this.touch.active = false;
      this.touch.dx = 0;
      this.touch.dy = 0;
    }, { passive: false });
  }

  // Call once per frame to snapshot pending state, then clear it
  update() {
    this.justPressed = { ...this._pendingJust };
    this._pendingJust = {};
    this.mouse.clicked = this.mouse._pendingClick;
    this.mouse._pendingClick = false;
    this.touch.tapped = false;
  }

  isDown(key) { return !!this.keys[key]; }
  wasPressed(key) { return !!this.justPressed[key]; }

  getMoveDelta() {
    let dx = 0, dy = 0;
    if (this.isDown('ArrowLeft')  || this.isDown('a') || this.isDown('A')) dx = -1;
    if (this.isDown('ArrowRight') || this.isDown('d') || this.isDown('D')) dx = 1;
    if (this.isDown('ArrowUp')    || this.isDown('w') || this.isDown('W')) dy = -1;
    if (this.isDown('ArrowDown')  || this.isDown('s') || this.isDown('S')) dy = 1;
    return { dx, dy };
  }
}
