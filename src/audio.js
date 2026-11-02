// Sound effects via Web Audio only (no files). Every call is wrapped in
// try/catch so the game works even with no audio available.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /** Create/resume the AudioContext lazily (needs a user gesture). */
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  setMuted(m) {
    this.muted = !!m;
  }

  /**
   * Play a tone. `seq` is an array of {f, t, d, type, v} steps:
   * frequency, start offset, duration, waveform, volume.
   */
  #play(seq) {
    if (this.muted) return;
    let ctx;
    try {
      ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const s of seq) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = s.type || 'sine';
        osc.frequency.setValueAtTime(s.f, now + s.t);
        if (s.fEnd) osc.frequency.exponentialRampToValueAtTime(s.fEnd, now + s.t + s.d);
        gain.gain.setValueAtTime(0.0001, now + s.t);
        gain.gain.exponentialRampToValueAtTime(s.v ?? 0.15, now + s.t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + s.t + s.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + s.t);
        osc.stop(now + s.t + s.d + 0.05);
      }
    } catch {
      /* no audio — ignore */
    }
  }

  /** Short tick while the dice tumbles. */
  diceTick() {
    this.#play([{ f: 600 + Math.random() * 300, t: 0, d: 0.04, type: 'square', v: 0.05 }]);
  }

  /** A single step hop. */
  step() {
    this.#play([{ f: 320, t: 0, d: 0.06, type: 'triangle', v: 0.08 }]);
  }

  /** Landed on a square. */
  land() {
    this.#play([
      { f: 440, t: 0, d: 0.09, type: 'triangle', v: 0.12 },
      { f: 660, t: 0.07, d: 0.12, type: 'triangle', v: 0.1 },
    ]);
  }

  /** Rising arpeggio for a ladder. */
  ladder() {
    this.#play([
      { f: 392, t: 0, d: 0.12, v: 0.14 },
      { f: 494, t: 0.1, d: 0.12, v: 0.14 },
      { f: 587, t: 0.2, d: 0.12, v: 0.14 },
      { f: 784, t: 0.3, d: 0.25, v: 0.16 },
    ]);
  }

  /** Falling slide for a snake. */
  snake() {
    this.#play([{ f: 700, fEnd: 120, t: 0, d: 0.7, type: 'sawtooth', v: 0.12 }]);
  }

  /** Overshoot "nope". */
  nope() {
    this.#play([
      { f: 220, t: 0, d: 0.12, type: 'square', v: 0.1 },
      { f: 180, t: 0.14, d: 0.18, type: 'square', v: 0.1 },
    ]);
  }

  /** Refused-roll beep. */
  refuse() {
    this.#play([{ f: 150, t: 0, d: 0.15, type: 'square', v: 0.12 }]);
  }

  /** Win fanfare. */
  win() {
    this.#play([
      { f: 523, t: 0, d: 0.15, v: 0.16 },
      { f: 659, t: 0.13, d: 0.15, v: 0.16 },
      { f: 784, t: 0.26, d: 0.15, v: 0.16 },
      { f: 1047, t: 0.4, d: 0.45, v: 0.18 },
      { f: 784, t: 0.4, d: 0.45, v: 0.1 },
    ]);
  }
}

export const sound = new Sound();

/** Resume audio on the first pointerdown or keydown. */
export function initAudioUnlock() {
  const unlock = () => {
    try {
      sound.ensure();
    } catch {
      /* ignore */
    }
  };
  document.addEventListener('pointerdown', unlock, { once: false });
  document.addEventListener('keydown', unlock, { once: false });
}
