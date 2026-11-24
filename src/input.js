// Keyboard, gamepad and touch input merged into one control state.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false };
    this.steerAxis = 0;
    addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(root) {
    for (const el of root.querySelectorAll('[data-touch]')) {
      const k = el.dataset.touch;
      const on = (e) => {
        e.preventDefault();
        this.touch[k] = true;
        el.classList.add('on');
      };
      const off = (e) => {
        e.preventDefault();
        this.touch[k] = false;
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    }
  }

  /** Was a key pressed since the last call (edge-triggered)? */
  hit(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  read(dt) {
    const k = this.keys;
    let throttle = k.has('KeyW') || k.has('ArrowUp') || this.touch.gas ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') || this.touch.brake ? 1 : 0;
    let steerKey = (k.has('KeyD') || k.has('ArrowRight') || this.touch.right ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') || this.touch.left ? 1 : 0);
    // smooth digital steering
    const rate = steerKey === 0 ? 5 : 3;
    this.steerAxis += Math.max(-rate * dt, Math.min(rate * dt, steerKey - this.steerAxis));
    let steer = this.steerAxis;
    let handbrake = k.has('Space');
    let horn = k.has('KeyH');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steer = ax;
      const rt = p.buttons[7]?.value || 0;
      const lt = p.buttons[6]?.value || 0;
      if (rt > 0.05) throttle = rt;
      if (lt > 0.05) brake = lt;
      if (p.buttons[0]?.pressed) handbrake = true;
      if (p.buttons[1]?.pressed) horn = true;
      if (p.buttons[3]?.pressed && !this.padY) this.pressed.add('KeyC');
      this.padY = p.buttons[3]?.pressed;
    }
    return { throttle, brake, steer, handbrake, horn };
  }
}
