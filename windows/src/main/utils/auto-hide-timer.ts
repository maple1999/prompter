export class AutoHideTimer {
  private timeoutId: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private onFire: () => void;

  constructor(intervalMs: number, onFire: () => void) {
    this.intervalMs = intervalMs;
    this.onFire = onFire;
  }

  pet() {
    this.stop();
    this.timeoutId = setTimeout(() => {
      this.onFire();
      this.timeoutId = null;
    }, this.intervalMs);
  }

  stop() {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
