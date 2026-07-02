export class VAD {
  private silenceThresholdMs: number;
  private onSilence: () => void;
  private silenceTimer: NodeJS.Timeout | null = null;

  constructor(silenceThreshold: number, onSilence: () => void) {
    this.silenceThresholdMs = silenceThreshold * 1000;
    this.onSilence = onSilence;
  }

  /**
   * Called whenever voice activity is detected to reset the silence timer.
   */
  reportVoice() {
    this.stop();
    this.silenceTimer = setTimeout(() => {
      this.onSilence();
      this.silenceTimer = null;
    }, this.silenceThresholdMs);
  }

  stop() {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
