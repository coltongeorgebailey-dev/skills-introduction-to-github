let _ctx = null;
let _muted = localStorage.getItem('farmMuted') === '1';

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function tone(freq, endFreq, type, duration, gain = 0.28) {
  if (_muted) return;
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, ac.currentTime + duration);
    env.gain.setValueAtTime(gain, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.connect(env);
    env.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration + 0.01);
  } catch (_) {}
}

function noise(duration, gain = 0.18, cutoff = 900) {
  if (_muted) return;
  try {
    const ac = getCtx();
    const rate = ac.sampleRate;
    const buf = ac.createBuffer(1, Math.ceil(rate * duration), rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cutoff;
    const env = ac.createGain();
    env.gain.setValueAtTime(gain, ac.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    src.connect(filt);
    filt.connect(env);
    env.connect(ac.destination);
    src.start();
    src.stop(ac.currentTime + duration + 0.01);
  } catch (_) {}
}

export function isMuted() { return _muted; }

export function toggleMute() {
  _muted = !_muted;
  localStorage.setItem('farmMuted', _muted ? '1' : '0');
  return _muted;
}

export function playTill() {
  tone(220, 90, 'sawtooth', 0.12, 0.22);
}

export function playPlant() {
  tone(440, 220, 'sine', 0.09, 0.18);
}

export function playWater() {
  noise(0.13, 0.22, 1400);
}

export function playHarvest() {
  // Major triad arpeggio C4-E4-G4
  [[261, 0], [329, 65], [392, 130]].forEach(([f, delay]) => {
    setTimeout(() => tone(f, f, 'sine', 0.09, 0.3), delay);
  });
}

export function playCoin() {
  tone(880, 1320, 'sine', 0.14, 0.22);
}

export function playQuestComplete() {
  // 5-note ascending fanfare
  [[261, 0], [329, 70], [392, 140], [523, 210], [659, 280]].forEach(([f, delay]) => {
    setTimeout(() => tone(f, f, 'sine', 0.11, 0.28), delay);
  });
}

export function playFeed() {
  tone(660, 660, 'triangle', 0.07, 0.18);
}
