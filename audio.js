/* ===== Âm thanh tổng hợp bằng WebAudio (không cần file mp3) ===== */
(function () {
  'use strict';
  const G = window.G;
  const A = (G.audio = {
    ctx: null, master: null, sfx: null, mus: null, noiseBuf: null, voices: 0, last: {}, musicOn: false, timer: 0, step: 0, nextT: 0,
  });

  A.init = function () {
    if (A.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (A.ctx = new AC());
    A.master = c.createGain(); A.sfx = c.createGain(); A.mus = c.createGain();
    const comp = c.createDynamicsCompressor();
    A.sfx.connect(A.master); A.mus.connect(A.master); A.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate; A.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = A.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.applyVol();
    if (G.settings.music) A.startMusic();
  };
  A.resume = function () { A.init(); if (A.ctx && A.ctx.state !== 'running') A.ctx.resume(); };
  A.applyVol = function () {
    if (!A.ctx) return;
    const s = G.settings;
    A.master.gain.value = s.vol; A.sfx.gain.value = s.sfxVol; A.mus.gain.value = s.musicVol * 0.5;
  };

  function ok(name, gap) {
    if (!A.ctx || A.ctx.state !== 'running') return false;
    const t = performance.now();
    if (t - (A.last[name] || 0) < gap) return false;
    if (A.voices > 22) return false;
    A.last[name] = t; return true;
  }
  function tone(f, d, type, v, f2, delay, dest) {
    const c = A.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(dest || A.sfx); o.start(t); o.stop(t + d + 0.02);
    A.voices++; o.onended = () => A.voices--;
  }
  function noise(d, v, f, type, f2, delay) {
    const c = A.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = A.noiseBuf; s.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type || 'lowpass'; flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(flt); flt.connect(g); g.connect(A.sfx); s.start(t, Math.random()); s.stop(t + d + 0.02);
    A.voices++; s.onended = () => A.voices--;
  }

  const S = {
    spawn() { if (ok('spawn', 45)) tone(520, 0.09, 'sine', 0.1, 840); },
    sword() { if (ok('sword', 70)) noise(0.06, 0.12, 3500, 'highpass'); },
    arrow() { if (ok('arrow', 60)) tone(1000, 0.07, 'triangle', 0.07, 450); },
    bullet() { if (ok('bullet', 50)) { noise(0.04, 0.1, 2200, 'bandpass'); } },
    shell() { if (ok('shell', 90)) { noise(0.18, 0.25, 900, 'lowpass', 200); tone(120, 0.15, 'square', 0.1, 50); } },
    hit() { if (ok('hit', 55)) tone(180, 0.05, 'square', 0.05, 90); },
    die() { if (ok('die', 60)) tone(330, 0.12, 'sawtooth', 0.05, 80); },
    boom(sz) { if (ok('boom', 90)) { sz = sz || 1; noise(0.35 + 0.3 * sz, 0.4, 1400, 'lowpass', 90); tone(90, 0.3 + 0.2 * sz, 'sine', 0.35, 30); } },
    laser() { if (ok('laser', 120)) tone(260, 0.16, 'sawtooth', 0.05, 900); },
    laserOn() { if (ok('laserOn', 200)) { tone(200, 0.5, 'sawtooth', 0.14, 1400); noise(0.4, 0.1, 600, 'highpass'); } },
    place() { if (ok('place', 100)) { tone(180, 0.18, 'square', 0.14, 120); noise(0.15, 0.15, 500, 'lowpass'); } },
    dragon() { if (ok('dragon', 300)) { noise(1.2, 0.18, 500, 'bandpass', 150); tone(110, 1.0, 'sawtooth', 0.12, 70); } },
    nukeWarn() { if (ok('nukeWarn', 200)) { for (let i = 0; i < 4; i++) tone(880, 0.1, 'square', 0.1, 0, i * 0.35); } },
    join() { if (ok('join', 120)) { tone(523, 0.1, 'triangle', 0.14); tone(659, 0.1, 'triangle', 0.14, 0, 0.08); tone(784, 0.14, 'triangle', 0.14, 0, 0.16); } },
    big() { if (ok('big', 200)) { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'square', 0.09, 0, i * 0.07)); } },
    crate() { if (ok('crate', 120)) { tone(700, 0.08, 'sine', 0.15, 1400); tone(1400, 0.15, 'sine', 0.12, 2000, 0.07); } },
    tick() { if (ok('tick', 80)) tone(880, 0.1, 'square', 0.1); },
    go() { if (ok('go', 80)) { tone(660, 0.35, 'square', 0.14); tone(1320, 0.35, 'square', 0.1, 0, 0.0); } },
    click() { if (ok('click', 40)) tone(700, 0.04, 'square', 0.06); },
    capture() { if (ok('capture', 100)) tone(440, 0.05, 'sine', 0.03, 600); },
    top10(rank) {
      if (!ok('top10', 400)) return;
      const base = rank === 1 ? 392 : 330;
      [0, 4, 7, 12, 16, 19].forEach((n, i) => tone(base * Math.pow(2, n / 12), 0.35, 'sawtooth', 0.07, 0, i * 0.09));
      noise(0.8, 0.15, 800, 'highpass', 4000);
      if (rank <= 3) tone(base * 2, 1, 'triangle', 0.12, base * 4, 0.5);
    },
    win() {
      if (!A.ctx || A.ctx.state !== 'running') return;
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => { tone(f, 0.3, 'square', 0.1, 0, i * 0.14); tone(f / 2, 0.3, 'triangle', 0.12, 0, i * 0.14); });
      noise(1.5, 0.15, 1000, 'highpass', 6000, 0.6);
    },
  };
  A.play = function (n, a) { try { if (S[n]) S[n](a); } catch (e) { } };

  /* ---- nhạc nền đơn giản: bass + arpeggio + trống ---- */
  const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
  const mf = n => 440 * Math.pow(2, (n - 69) / 12);
  function sched() {
    if (!A.ctx || !A.musicOn) return;
    const bpm = 132, st = 60 / bpm / 2;
    while (A.nextT < A.ctx.currentTime + 0.25) {
      const s = A.step, ch = CH[(s >> 4) & 3], t = A.nextT - A.ctx.currentTime;
      const arp = ch[(s % 3)] + (s % 8 > 3 ? 12 : 0);
      tone(mf(arp + 12), st * 0.9, 'triangle', 0.18, 0, Math.max(0, t), A.mus);
      if (s % 4 === 0) tone(mf(ch[0] - 12), st * 3.5, 'sawtooth', 0.22, 0, Math.max(0, t), A.mus);
      if (s % 4 === 0) { tone(120, 0.12, 'sine', 0.5, 40, Math.max(0, t), A.mus); }
      if (s % 2 === 1) { const c = A.ctx, tt = c.currentTime + Math.max(0, t); const sr = c.createBufferSource(); sr.buffer = A.noiseBuf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(0.12, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.04); sr.connect(f); f.connect(g); g.connect(A.mus); sr.start(tt, Math.random()); sr.stop(tt + 0.05); }
      A.nextT += st; A.step++;
    }
  }
  A.startMusic = function () {
    if (!A.ctx || A.musicOn) return;
    A.musicOn = true; A.nextT = A.ctx.currentTime + 0.1; A.timer = setInterval(sched, 60);
  };
  A.stopMusic = function () { A.musicOn = false; clearInterval(A.timer); };
})();
