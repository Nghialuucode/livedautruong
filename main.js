/* ===== Khởi động + vòng lặp + bộ điều tiết hiệu năng (anti-lag) ===== */
(function () {
  'use strict';
  const G = window.G;
  window.addEventListener('DOMContentLoaded', () => {
    G.purgeSim && G.purgeSim();
    G.loadServerBoard();
    G.initRender(); G.initMenu();
    if (G.settings.demo) G.live.seedSim();
    G.newMatch();
    G.resize();
    if (G.settings.autoConnect && G.settings.username) G.live.connect();

    let last = performance.now(), ema = 16, lowT = 0, highT = 0, fpsT = 0, frames = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      const raw = (now - last) / 1000; last = now;
      if (raw <= 0) return; const dt = Math.min(raw, 0.1);
      G.live.simTick(dt);
      G.update(dt);
      G.draw(now);
      G.ui.update(now);
      // đo FPS & tự điều chỉnh chất lượng
      ema += (raw * 1000 - ema) * 0.05; frames++; fpsT += raw;
      if (fpsT >= 1) { const el = document.getElementById('fpsBox'); if (el) el.textContent = 'FPS ' + Math.round(frames / fpsT) + ' · chất lượng ' + ['Cao', 'Vừa', 'Thấp'][G.q.level] + ' · ' + G.S.units.length + ' lính'; frames = 0; fpsT = 0; }
      if (G.settings.quality === 'auto') {
        if (ema > 26) { lowT += raw; highT = 0; if (lowT > 1.5 && G.q.level < 2) { G.setQuality(G.q.level + 1); lowT = 0; ema = 16; } }
        else if (ema < 18) { highT += raw; lowT = 0; if (highT > 12 && G.q.level > 0) { G.setQuality(G.q.level - 1); highT = 0; } }
        else { lowT = 0; highT = 0; }
      }
    }
    requestAnimationFrame(loop);
    window.G = G;
  });
})();
