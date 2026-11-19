/* =========================================================
   Procedural sound engine (Web Audio API — no files needed)
   ========================================================= */
const Sound = (() => {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = .22, delay = 0, slideTo = null) {
    if (muted) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + .05);
  }

  function noise(dur, vol, freq, q = 1, delay = 0) {
    if (muted) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = c.createBufferSource();
    src.buffer = buf;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;

    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp).connect(gain).connect(c.destination);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },

    setMuted(v) { muted = v; },
    isMuted() { return muted; },

    /* dice rattle */
    dice() {
      ensure();
      for (let i = 0; i < 7; i++) {
        noise(0.055, 0.18 + Math.random() * 0.12, 900 + Math.random() * 1800, 1.4, i * 0.075);
      }
      noise(0.12, 0.22, 400, 0.8, 0.6);
    },

    /* token hop */
    step() {
      tone(660, 0.075, 'triangle', 0.10, 0);
    },

    /* landed */
    land() {
      tone(880, 0.13, 'sine', 0.16, 0);
      tone(1320, 0.13, 'sine', 0.09, 0.03);
    },

    /* capture */
    capture() {
      tone(520, 0.16, 'sawtooth', 0.16, 0, 180);
      tone(300, 0.22, 'square', 0.10, 0.08, 90);
      noise(0.2, 0.18, 700, 1.1, 0.02);
    },

    /* six */
    six() {
      tone(720, 0.09, 'square', 0.14, 0);
      tone(960, 0.09, 'square', 0.14, 0.09);
      tone(1240, 0.16, 'square', 0.16, 0.18);
    },

    /* token reached home */
    home() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.20, 'sine', 0.17, i * 0.075));
    },

    /* win fanfare */
    win() {
      const seq = [523, 659, 784, 1047, 1319, 1047, 1319, 1568];
      seq.forEach((f, i) => tone(f, 0.26, 'triangle', 0.18, i * 0.11));
      setTimeout(() => {
        [1047, 1319, 1568].forEach((f, i) => tone(f, 0.5, 'sine', 0.14, i * 0.04));
      }, 1000);
    },

    click() { tone(520, 0.045, 'sine', 0.09, 0); },
    error() { tone(200, 0.14, 'square', 0.14, 0, 130); }
  };
})();
