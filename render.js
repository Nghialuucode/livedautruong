/* ===== Vẽ canvas + HUD (DOM) + hiệu ứng thông báo ===== */
(function () {
  'use strict';
  const G = window.G, S = G.S, T = G.T, COLS = G.COLS, W = G.W, AY = G.ARENA_Y, TM = G.TEAMS;
  let ROWS = G.ROWS, H = G.H;
  G.arenaHooks.push(() => { ROWS = G.ROWS; H = G.H; if (tl) { tl.width = W; tl.height = H; tctx = tl.getContext('2d'); } S.tilesAll = true; });
  const PI2 = Math.PI * 2;
  let cv, ctx, tl, tctx, dpr = 1, drawList = [];
  const $ = id => document.getElementById(id);

  /* ---------------- chất lượng (anti-lag) ---------------- */
  G.q = { level: 0, pm: 1, dmg: true, shadow: true, glow: true, scale: 1 };
  G.setQuality = function (lv) {
    const q = G.q; q.level = lv; q.pm = [1, 0.55, 0.25][lv]; q.dmg = lv < 2; q.shadow = lv < 2; q.glow = lv < 1;
    q.scale = [1.5, 1.15, 0.85][lv]; G.resize();
  };

  /* ---------------- bố cục: vùng an toàn cho TikTok LIVE ---------------- */
  // TikTok che phần trên (tên host, người xem) và phần dưới (khung chat, ô bình luận).
  // Chế độ an toàn đặt HUD, bản đồ (thu nhỏ vừa khung) và bảng giá quà vào vùng còn lại.
  G.layout = { safe: false, x: 0, y: G.ARENA_Y, k: 1, cy: G.ARENA_Y + G.H / 2, safeH: G.SH };
  const HUD_H = 118, GUIDE_H = 108;   // GUIDE_H: hàng giá quà (đã phóng to)
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  // Số hàng bản đồ vừa khít vùng an toàn → bản đồ rộng gần hết chiều ngang, không thừa viền hai bên
  G.wantRows = function () {
    const s = G.settings; if (s.safeMode === false || s.fillArena === false) return 34;
    const top = clampN(+s.safeTop || 0, 0, 300), bot = clampN(+s.safeBottom || 0, 0, 520);
    const availH = Math.max(200, (G.SH - bot - GUIDE_H - 4) - (top + HUD_H + 4) - 4);
    return clampN(Math.round(availH / (2 * T)) * 2, 16, 34);
  };
  G.applyLayout = function () {
    const st = $('stage'); if (!st) return;
    const s = G.settings, L = G.layout, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const safe = s.safeMode !== false;
    const top = cl(+s.safeTop || 0, 0, 300), bot = cl(+s.safeBottom || 0, 0, 520);
    const hudH = HUD_H, guideH = GUIDE_H;
    L.safe = safe;
    if (safe) {
      const hudY = top, guideY = G.SH - bot - guideH;
      const aTop = hudY + hudH + 4, aBot = guideY - 4, availH = Math.max(200, aBot - aTop);
      L.k = cl(Math.min(availH / G.H, G.SW / G.W), 0.3, 1);
      L.x = (G.SW - G.W * L.k) / 2; L.y = aTop + (availH - G.H * L.k) / 2;
      L.safeH = G.SH - top - bot;
      const v = { hudY, hudH, guideY, guideH, safeTop: top, safeH: L.safeH };
      for (const key in v) st.style.setProperty('--' + key, v[key] + 'px');
    } else { L.k = 1; L.x = 0; L.y = G.ARENA_Y; L.safeH = G.SH; }
    L.cy = L.y + G.H * L.k / 2;
    st.style.setProperty('--ax', L.x + 'px'); st.style.setProperty('--ay', L.y + 'px');
    st.style.setProperty('--cy', L.cy + 'px'); st.style.setProperty('--abot', (G.SH - (L.y + G.H * L.k)) + 'px');
    st.classList.toggle('safe', safe);
    // lớp phủ báo vùng TikTok che (để căn chỉnh)
    const z = $('zones');
    if (z) {
      const show = !G.clean && !!(G.menu && G.menu.open_ && G.menu.tab === 'view');
      z.className = show ? 'on' : '';
      z.innerHTML = show ? `<div style="top:0;height:${top}px">TikTok che: tên host · người xem</div><div style="bottom:0;height:${bot}px">TikTok che: khung chat · ô bình luận</div>` : '';
    }
    const info = $('layInfo');
    if (info) info.textContent = safe ? `Bản đồ ${G.COLS}×${G.ROWS} ô · rộng ${Math.round(L.k * 100)}% khung · vùng hiển thị cao ${Math.round(L.safeH)}px / 1280px` + (G.wantRows() !== G.ROWS ? ' · (đổi kích thước bản đồ ở trận kế tiếp)' : '') : 'Đang tắt: dùng bố cục toàn màn hình';
  };

  G.resize = function () {
    const st = $('stage'); if (!st) return;
    const s = Math.min(innerWidth / G.SW, innerHeight / G.SH);
    st.style.transform = `scale(${s})`; st.style.left = (innerWidth - G.SW * s) / 2 + 'px'; st.style.top = (innerHeight - G.SH * s) / 2 + 'px';
    dpr = Math.max(0.6, Math.min(G.q.scale, s * (window.devicePixelRatio || 1)));
    const w = Math.round(G.SW * dpr), h = Math.round(G.SH * dpr);
    if (cv.width !== w) { cv.width = w; cv.height = h; }
    G.applyLayout();
  };

  G.initRender = function () {
    cv = $('cv'); ctx = cv.getContext('2d', { alpha: false });
    tl = document.createElement('canvas'); tl.width = W; tl.height = H; tctx = tl.getContext('2d');
    window.addEventListener('resize', G.resize);
    G.setQuality(G.settings.quality === 'auto' ? 0 : ({ high: 0, mid: 1, low: 2 }[G.settings.quality] || 0));
    buildStatic();
  };

  /* ---------------- màu sắc ---------------- */
  const _rgb = {};
  const rgb = h => _rgb[h] || (_rgb[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return 'rgb(' + (A[0] + (B[0] - A[0]) * t | 0) + ',' + (A[1] + (B[1] - A[1]) * t | 0) + ',' + (A[2] + (B[2] - A[2]) * t | 0) + ')'; };
  const rgba = (h, a) => { const c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  // Bảng màu mở rộng cho từng đội (+ chỉ số 4 = màu trung tính dùng cho biểu tượng)
  const TP = TM.concat([{ color: '#a47bff', dark: '#5a3cb0', light: '#e2d6ff', glow: '#c8b0ff', tileA: '#a47bff', tileB: '#a47bff' }]).map(t => ({
    c: t.color, d: t.dark, l: t.light, glow: t.glow,
    top1: mix(t.tileA, '#ffffff', 0.22), bot1: mix(t.tileA, t.dark, 0.35), top2: mix(t.tileB, '#ffffff', 0.12), bot2: mix(t.tileB, t.dark, 0.5),
    edge: mix(t.light, '#ffffff', 0.35), grout: mix(t.dark, '#000000', 0.35), ring: rgba(t.color, 0.5),
  }));
  const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const hash2 = (c, r) => ((c * 73856093) ^ (r * 19349663)) >>> 0;

  /* ---------------- ô đất ---------------- */
  let waterList = [], markArr = new Uint32Array(1), markId = 1;
  function drawTile(i) {
    const c = i % COLS, r = (i / COLS) | 0, x = c * T, y = r * T, w = S.wall[i], th = S.map.theme, g = tctx, h = hash2(c, r);
    if (w === 1) {                       // đá: khối 3D có bóng đổ và mặt sáng
      g.fillStyle = mix(th.bg, '#ffffff', 0.07); g.fillRect(x, y, T, T);
      g.fillStyle = 'rgba(0,0,0,.38)'; rrect(g, x + 2, y + 7, T - 3, T - 5, 7); g.fill();
      g.fillStyle = th.wall; rrect(g, x + 1, y + 7, T - 2, T - 9, 7); g.fill();
      const gr = g.createLinearGradient(0, y, 0, y + T - 8); gr.addColorStop(0, th.wallTop); gr.addColorStop(1, mix(th.wallTop, th.wall, 0.7));
      g.fillStyle = gr; rrect(g, x + 1, y + 1, T - 2, T - 10, 8); g.fill();
      g.fillStyle = 'rgba(255,255,255,.3)'; rrect(g, x + 5, y + 3, T - 14, 3.5, 2); g.fill();
      if (h % 3 === 0) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(x + T / 2, y + 7); g.lineTo(x + T / 2 + 5, y + 14); g.lineTo(x + T / 2, y + 19); g.lineTo(x + T / 2 - 5, y + 14); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + T / 2 - 3, y + 11, 3, 3); }
      else if (h % 3 === 1) { g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 8, y + 9); g.lineTo(x + 14, y + 15); g.lineTo(x + 12, y + 20); g.stroke(); }
    } else if (w === 2) {                // nước: nhiều lớp + bọt ven bờ
      const gr = g.createLinearGradient(0, y, 0, y + T); gr.addColorStop(0, mix(th.water, '#ffffff', 0.16)); gr.addColorStop(1, mix(th.water, '#000000', 0.25));
      g.fillStyle = gr; g.fillRect(x, y, T, T);
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 4 + (h & 7), y + 8, 12, 2); g.fillRect(x + 10 - (h & 3), y + 20, 14, 2);
      g.fillStyle = 'rgba(255,255,255,.4)';
      const nw = (cc, rr) => cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS || S.wall[rr * COLS + cc] !== 2;
      if (nw(c, r - 1)) g.fillRect(x, y, T, 2.5); if (nw(c, r + 1)) g.fillRect(x, y + T - 2.5, T, 2.5); if (nw(c - 1, r)) g.fillRect(x, y, 2.5, T); if (nw(c + 1, r)) g.fillRect(x + T - 2.5, y, 2.5, T);
    } else {                             // đất của đội: ô bo góc, bóng nổi, viền lãnh thổ phát sáng
      const o = S.owner[i], P = TP[o] || TP[0], alt = (c + r) & 1;
      g.fillStyle = P.grout; g.fillRect(x, y, T, T);
      const gr = g.createLinearGradient(0, y, 0, y + T); gr.addColorStop(0, alt ? P.top1 : P.top2); gr.addColorStop(1, alt ? P.bot1 : P.bot2);
      g.fillStyle = gr; rrect(g, x + 1.2, y + 1.2, T - 2.4, T - 2.4, 5); g.fill();
      g.fillStyle = 'rgba(255,255,255,.17)'; rrect(g, x + 3, y + 2.6, T - 6, 6, 3); g.fill();
      g.fillStyle = 'rgba(0,0,0,.12)'; rrect(g, x + 3, y + T - 7, T - 6, 4, 2); g.fill();
      const k = h & 7;
      if (k === 0) { g.fillStyle = 'rgba(255,255,255,.09)'; g.beginPath(); g.arc(x + T / 2, y + T / 2, 5.5, 0, PI2); g.fill(); }
      else if (k === 1) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 11, y + 8, 8, 2); g.fillRect(x + 14, y + 5, 2, 8); }
      else if (k === 2) { g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.arc(x + 20, y + 19, 3.5, 0, PI2); g.arc(x + 9, y + 14, 2.4, 0, PI2); g.fill(); }
      g.fillStyle = P.edge;
      const diff = (cc, rr) => { if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) return false; const j = rr * COLS + cc; return S.wall[j] === 0 && S.owner[j] !== o; };
      if (diff(c, r - 1)) g.fillRect(x + 1, y, T - 2, 3); if (diff(c, r + 1)) g.fillRect(x + 1, y + T - 3, T - 2, 3); if (diff(c - 1, r)) g.fillRect(x, y + 1, 3, T - 2); if (diff(c + 1, r)) g.fillRect(x + T - 3, y + 1, 3, T - 2);
    }
  }
  function buildStatic() { }
  function refreshTiles() {
    const N = COLS * ROWS; if (markArr.length !== N) markArr = new Uint32Array(N);
    if (S.tilesAll) {
      for (let i = 0; i < N; i++) drawTile(i);
      waterList = []; for (let i = 0; i < N; i++) if (S.wall[i] === 2) waterList.push(i);
      S.tilesAll = false; S.dirty.length = 0; return;
    }
    const d = S.dirty; if (!d.length) return; markId++;
    const t = j => { if (markArr[j] !== markId) { markArr[j] = markId; drawTile(j); } };
    for (let k = 0; k < d.length; k++) { const i = d[k], c = i % COLS, r = (i / COLS) | 0; t(i); if (c > 0) t(i - 1); if (c < COLS - 1) t(i + 1); if (r > 0) t(i - COLS); if (r < ROWS - 1) t(i + COLS); }
    d.length = 0;
  }

  /* ---------------- sprite lính (vẽ 1 lần, dùng lại) ---------------- */
  const SPR = 3, HALF = 26, sprites = {};
  function newSprite() { const cv = document.createElement('canvas'); cv.width = cv.height = HALF * 2 * SPR; const c = cv.getContext('2d'); c.translate(HALF * SPR, HALF * SPR); c.scale(SPR, SPR); c.lineJoin = 'round'; c.lineCap = 'round'; return [cv, c]; }
  function sphere(c, x, y, r, c1, c2, rim) { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, PI2); c.fill(); if (rim) { c.strokeStyle = rim; c.lineWidth = 0.9; c.stroke(); } }
  function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  const SKIN = '#ffd9b3', SKIN_D = '#e2a878', INK = '#1a1530';

  function paintInfantry(c, kind, P) {
    const body = (rx, ry, cols) => { c.fillStyle = lin(c, 0, -ry, 0, ry, cols); c.strokeStyle = INK; c.lineWidth = 0.9; c.beginPath(); c.ellipse(-0.5, 0, rx, ry, 0, 0, PI2); c.fill(); c.stroke(); };
    if (kind === 'soldier') {
      // khiên tay trái
      c.fillStyle = lin(c, 0, -13, 0, -5, [P.l, P.d]); c.strokeStyle = INK; c.lineWidth = 0.9; c.beginPath(); c.ellipse(3.5, -9.4, 5.6, 3.9, 0.15, 0, PI2); c.fill(); c.stroke();
      c.fillStyle = '#ffe28a'; c.beginPath(); c.ellipse(3.8, -9.4, 2.2, 1.4, 0.15, 0, PI2); c.fill();
      body(5.4, 9.4, [P.l, P.c, P.d]);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-3, -6); c.lineTo(-3, 6); c.stroke();
      // kiếm tay phải
      c.strokeStyle = INK; c.lineWidth = 3.4; c.beginPath(); c.moveTo(8, 7.3); c.lineTo(22.5, 7.3); c.stroke();
      c.strokeStyle = lin(c, 0, 5.5, 0, 9, ['#ffffff', '#aeb6d4']); c.lineWidth = 2.4; c.beginPath(); c.moveTo(8, 7.3); c.lineTo(22, 7.3); c.stroke();
      c.strokeStyle = '#ffcf4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(8.4, 4.3); c.lineTo(8.4, 10.3); c.stroke();
      sphere(c, 6.4, 7.3, 2.2, '#fff0dc', SKIN, SKIN_D);
      // mũ giáp
      sphere(c, 0.6, 0, 5.7, P.l, P.c, INK);
      c.strokeStyle = P.d; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-4.8, 0); c.lineTo(4.6, 0); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.arc(0.6, 0, 4.1, -0.7, 0.7); c.stroke();
    } else if (kind === 'archer') {
      // ống tên sau lưng
      c.save(); c.rotate(-0.25); c.fillStyle = '#7a4a22'; rrect(c, -10.5, -3.4, 4, 9, 1.4); c.fill(); c.strokeStyle = INK; c.lineWidth = 0.7; c.stroke(); c.restore();
      c.strokeStyle = '#f5ecd0'; c.lineWidth = 0.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-9.5 + i * 1.1, -3.4); c.lineTo(-10.5 + i * 1.1, -6.2); c.stroke(); }
      body(6, 9.6, [P.c, P.d, mix(P.d, '#000000', 0.35)]);
      // tay trái cầm cung
      c.strokeStyle = INK; c.lineWidth = 3.1; c.beginPath(); c.moveTo(2, -4.8); c.lineTo(15.5, -0.8); c.stroke(); c.strokeStyle = SKIN; c.lineWidth = 2; c.stroke();
      c.strokeStyle = INK; c.lineWidth = 3.3; c.beginPath(); c.arc(8, 0, 10.4, -1.05, 1.05); c.stroke();
      c.strokeStyle = '#a9703a'; c.lineWidth = 2; c.beginPath(); c.arc(8, 0, 10.4, -1.05, 1.05); c.stroke();
      const bx = 8 + Math.cos(1.05) * 10.4, by = Math.sin(1.05) * 10.4;
      c.strokeStyle = '#f2f2f2'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(bx, -by); c.lineTo(3.2, 0); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = '#f5e7c0'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(3.2, 0); c.lineTo(17, 0); c.stroke();
      c.fillStyle = '#cfd6ee'; c.beginPath(); c.moveTo(16.5, -1.5); c.lineTo(20, 0); c.lineTo(16.5, 1.5); c.fill();
      sphere(c, 15.8, -0.8, 2, '#fff0dc', SKIN, SKIN_D);
      // mũ trùm
      sphere(c, 0.4, 0, 5.8, P.l, P.c, INK);
      c.fillStyle = P.d; c.beginPath(); c.moveTo(-4, -3); c.lineTo(-9, 0); c.lineTo(-4, 3); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = 'rgba(30,20,40,.65)'; c.beginPath(); c.ellipse(3.6, 0, 1.9, 3.2, 0, 0, PI2); c.fill();
    } else {                              // gunner
      body(5.6, 9.4, [mix(P.c, '#3a3f55', 0.45), mix(P.d, '#20242f', 0.4), '#1c1f2c']);
      c.strokeStyle = P.l; c.lineWidth = 1; c.beginPath(); c.moveTo(-3, -7); c.lineTo(2, 7); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(1, -7); c.lineTo(14.5, 4.6); c.moveTo(1, 7); c.lineTo(9, 6); c.stroke();
      c.strokeStyle = mix(SKIN, '#ffffff', 0.1); c.lineWidth = 1.9; c.beginPath(); c.moveTo(1, -7); c.lineTo(14.5, 4.6); c.moveTo(1, 7); c.lineTo(9, 6); c.stroke();
      // súng trường
      c.fillStyle = '#5a3a1a'; rrect(c, 3.5, 4, 6.5, 3.8, 1.2); c.fill(); c.strokeStyle = INK; c.lineWidth = 0.7; c.stroke();
      c.fillStyle = lin(c, 0, 3.8, 0, 7.6, ['#59607c', '#262a3c']); rrect(c, 9, 3.6, 8, 4, 1.4); c.fill(); c.stroke();
      c.fillStyle = '#b9c0d8'; c.fillRect(16.5, 4.6, 7.5, 2); c.fillStyle = INK; c.fillRect(23.5, 4.2, 1.6, 2.8);
      c.fillStyle = '#1c1f30'; rrect(c, 11.5, 7.4, 2.6, 4.2, 0.8); c.fill();
      sphere(c, 14.6, 5, 2, '#fff0dc', SKIN, SKIN_D); sphere(c, 8.8, 6.2, 2, '#fff0dc', SKIN, SKIN_D);
      // mũ + kính
      sphere(c, 0.4, 0, 5.8, mix(P.c, '#3a3f55', 0.35), mix(P.d, '#20242f', 0.45), INK);
      c.fillStyle = P.l; c.fillRect(-4, -0.8, 7, 1.6);
      c.fillStyle = '#7fe7ff'; c.strokeStyle = INK; c.lineWidth = 0.8; c.beginPath(); c.ellipse(4.2, 0, 1.9, 3.9, 0, 0, PI2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(3.6, -2.4, 1, 2);
    }
  }
  function paintTank(c, P, frame) {
    for (const y0 of [-15, 8.5]) {
      c.fillStyle = '#1b1d29'; rrect(c, -16, y0, 32, 6.5, 2.6); c.fill(); c.strokeStyle = INK; c.lineWidth = 0.8; c.stroke();
      c.strokeStyle = '#4a4f66'; c.lineWidth = 0.9; for (let x = -14.5 + (frame ? 1.6 : 0); x < 15.5; x += 3.2) { c.beginPath(); c.moveTo(x, y0 + 0.7); c.lineTo(x, y0 + 5.8); c.stroke(); }
      c.fillStyle = '#3a3f55'; for (const wx of [-11, -4, 3, 10]) { c.beginPath(); c.arc(wx, y0 + 3.25, 2.1, 0, PI2); c.fill(); }
    }
    c.fillStyle = lin(c, 0, -10.5, 0, 10.5, [P.l, P.c, P.d]); c.strokeStyle = INK; c.lineWidth = 1; rrect(c, -14, -10.5, 28, 21, 4.5); c.fill(); c.stroke();
    c.fillStyle = 'rgba(0,0,0,.28)'; rrect(c, -12.5, -6.5, 4.5, 13, 1.5); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 0.7; for (let i = -4; i <= 4; i += 2) { c.beginPath(); c.moveTo(-12, i); c.lineTo(-8.8, i); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.moveTo(9, -8); c.lineTo(12.5, -8); c.lineTo(12.5, -5); c.lineTo(9, -5); c.closePath(); c.fill();
    c.fillStyle = lin(c, 0, -2.4, 0, 2.4, ['#c6ccE4', '#555c78']); c.strokeStyle = INK; c.lineWidth = 0.8; rrect(c, 5, -2.5, 16, 5, 1.4); c.fill(); c.stroke();
    c.fillStyle = '#2b2f45'; rrect(c, 19.4, -3.5, 4.2, 7, 1.6); c.fill(); c.stroke();
    sphere(c, 0, 0, 7.8, P.l, P.c, INK);
    c.strokeStyle = P.d; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 5.2, 0.4, 5.8); c.stroke();
    sphere(c, -1.8, 0, 2.7, '#7a819c', '#2b2f45', INK);
  }
  function getSprite(kind, team, hit, frame) {
    const key = kind + team + (hit ? 'h' : '') + (frame || 0);
    let s = sprites[key]; if (s) return s;
    if (hit) {
      const base = getSprite(kind, team, false, frame), [cv, c] = newSprite(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(base, 0, 0);
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,.78)'; c.fillRect(0, 0, cv.width, cv.height); return (sprites[key] = cv);
    }
    const [cv, c] = newSprite(); if (kind === 'tank') paintTank(c, TP[team], frame); else paintInfantry(c, kind, TP[team]);
    return (sprites[key] = cv);
  }

  /* ---------------- vẽ thực thể ---------------- */
  function hpBar(x, y, w, f, col) {
    f = Math.max(0, Math.min(1, f));
    ctx.fillStyle = 'rgba(8,4,20,.78)'; rrect(ctx, x - w / 2 - 1.2, y - 1.2, w + 2.4, 6, 3); ctx.fill();
    const c1 = col || (f > 0.5 ? '#7dff9a' : f > 0.25 ? '#ffe066' : '#ff7b6b'), c2 = col ? col : (f > 0.5 ? '#1fbf55' : f > 0.25 ? '#e0a400' : '#d62f2f');
    ctx.fillStyle = lin(ctx, 0, y, 0, y + 3.6, [c1, c2]); rrect(ctx, x - w / 2, y, Math.max(2, w * f), 3.6, 1.8); ctx.fill();
  }
  function badge(x, y, n) {
    ctx.fillStyle = lin(ctx, 0, y - 6, 0, y + 6, ['#ffe680', '#ff9f1a']); ctx.strokeStyle = '#5a3400'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 6.4, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.font = '900 10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3a2000'; ctx.fillText(n, x, y + 0.6); ctx.textBaseline = 'alphabetic';
  }
  function drawUnit(u) {
    const tk = u.kind === 'tank', P = TP[u.team], r = u.r * 1.3, x = u.x, y = u.y, ca = Math.cos(u.ang), sa = Math.sin(u.ang), sc = r / (tk ? 15 : 9);
    const bob = u.moving ? Math.sin(u.t * 11 + u.bob) * 1.1 : Math.sin(u.t * 3 + u.bob) * 0.5;
    if (G.q.shadow) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 1.1, r * 0.46, 0, 0, PI2); ctx.fill(); }
    if (G.q.level === 0) { ctx.strokeStyle = P.ring; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 1.28, r * 0.58, 0, 0, PI2); ctx.stroke(); }
    if (!tk && G.q.level < 2) {          // chân bước
      const ph = u.moving ? Math.sin(u.t * 12 + u.bob) * 3.4 * sc : 0, px = -sa * 3.3 * sc, py = ca * 3.3 * sc;
      ctx.fillStyle = '#251d36'; ctx.beginPath(); ctx.ellipse(x + px + ca * ph, y + py + sa * ph + 1, 2.7 * sc, 2 * sc, u.ang, 0, PI2); ctx.ellipse(x - px - ca * ph, y - py - sa * ph + 1, 2.7 * sc, 2 * sc, u.ang, 0, PI2); ctx.fill();
    }
    const ang = u.ang + (u.slash > 0 ? Math.sin(u.slash * 17) * 0.55 : 0);
    const spr = getSprite(u.kind, u.team, u.hit > 0, tk && u.moving ? (u.t * 9 | 0) & 1 : 0), sz = HALF * 2 * sc;
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(ang); ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    if (u.fl > 0) {
      const L = (tk ? 24 : u.kind === 'gunner' ? 25 : 20) * sc, k = 0.55 + u.fl / 0.09 * 0.6;
      ctx.fillStyle = 'rgba(255,240,170,.95)'; ctx.beginPath(); ctx.arc(x + ca * L, y + sa * L, 3.6 * sc * k, 0, PI2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(x + ca * L, y + sa * L, 1.8 * sc * k, 0, PI2); ctx.fill();
    }
    if (u.lvl > 1) badge(x, y - r - 9, u.lvl);
    if (u.hp < u.mhp) hpBar(x, y - r - (u.lvl > 1 ? 21 : 9), Math.max(16, r * 2.2), u.hp / u.mhp);
  }

  function castle(P, hit, t, ang, banners) {                    // vẽ ở toạ độ gốc, rộng 40 đơn vị
    const stone = lin(ctx, 0, -20, 0, 20, ['#e1e4f6', '#a9aecb', '#7a7fa0']);
    ctx.lineJoin = 'round';
    ctx.fillStyle = stone; ctx.strokeStyle = INK; ctx.lineWidth = 1.2; rrect(ctx, -20, -16, 40, 36, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) if ((i + j) & 1) ctx.fillRect(-18 + i * 9.4, -14 + j * 5, 8.8, 4.4);
    ctx.fillStyle = hit ? '#fff' : lin(ctx, 0, -11, 0, 10, [P.l, P.c, P.d]); ctx.strokeStyle = INK; rrect(ctx, -12, -11, 24, 19, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; rrect(ctx, -10, -9.5, 20, 4, 2); ctx.fill();
    ctx.fillStyle = '#20152e'; ctx.beginPath(); ctx.moveTo(-5, 20); ctx.lineTo(-5, 12); ctx.quadraticCurveTo(0, 5, 5, 12); ctx.lineTo(5, 20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a5f80'; ctx.lineWidth = 0.8; for (let i = -3; i <= 3; i += 2) { ctx.beginPath(); ctx.moveTo(i, 13); ctx.lineTo(i, 20); ctx.stroke(); }
    ctx.fillStyle = stone; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    for (let i = -17; i <= 12; i += 8) { rrect(ctx, i, -21, 6, 6, 1); ctx.fill(); ctx.stroke(); }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const tx = sx * 19, ty = sy * 15.5;
      sphere(ctx, tx, ty, 8, '#eef0ff', '#8a8fb0', INK);
      ctx.fillStyle = hit ? '#fff' : lin(ctx, 0, ty - 7, 0, ty + 5, [P.l, P.c, P.d]); ctx.beginPath(); ctx.arc(tx, ty - 1, 6, Math.PI, 0); ctx.lineTo(tx, ty - 11); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    }
    if (banners) for (const sx of [-1, 1]) {
      ctx.fillStyle = P.c; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx * 21 - 3, 20); ctx.lineTo(sx * 21 + 3, 20); ctx.lineTo(sx * 21 + 3, 32); ctx.lineTo(sx * 21, 28); ctx.lineTo(sx * 21 - 3, 32); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = '#3a2f55'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, -29); ctx.stroke();
    const w = Math.sin(t * 5);
    ctx.fillStyle = P.c; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -29); ctx.quadraticCurveTo(7, -29 + w * 1.5, 13 + w, -26); ctx.quadraticCurveTo(7, -24 - w * 1.5, 0, -23); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(0, -3); ctx.rotate(ang); ctx.fillStyle = '#2b2f45'; rrect(ctx, 2, -2.2, 15, 4.4, 1.5); ctx.fill(); ctx.stroke(); sphere(ctx, 0, 0, 4.6, '#fff', '#b9bedc', INK); ctx.restore();
  }
  function drawStruct(s) {
    const P = TP[s.team], f = s.life / s.mlife, hit = s.hit > 0, r = s.r;
    if (G.q.shadow) { ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + r * 0.8, r * 1.15, r * 0.52, 0, 0, PI2); ctx.fill(); }
    ctx.save(); ctx.translate(s.x, s.y);
    if (!s.icon) {                       // vòng thời gian sống
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, PI2); ctx.stroke();
      ctx.strokeStyle = P.l; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r + 8, -Math.PI / 2, -Math.PI / 2 + PI2 * f); ctx.stroke();
    }
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.1; ctx.strokeStyle = INK;
    if (s.st === 'cannon') {
      ctx.fillStyle = lin(ctx, 0, -r, 0, r, ['#d9dcf0', '#7d82a3']); ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, PI2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = P.c; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, PI2); ctx.stroke();
      ctx.fillStyle = '#2b2f45'; ctx.beginPath(); ctx.arc(0, 0, r - 6, 0, PI2); ctx.fill();
      ctx.fillStyle = '#e8eaff'; for (let i = 0; i < 6; i++) { const a = i * 1.047; ctx.beginPath(); ctx.arc(Math.cos(a) * (r - 0.5), Math.sin(a) * (r - 0.5), 1.1, 0, PI2); ctx.fill(); }
      ctx.rotate(s.ang); const rc = s.recoil > 0 ? -5 : 0; ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
      ctx.fillStyle = lin(ctx, 0, -5.5, 0, 5.5, ['#d5daf0', '#6b7292', '#3a3f58']); rrect(ctx, rc + 1, -5.4, r + 10, 10.8, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b2f45'; rrect(ctx, rc + r + 7, -6.8, 5.4, 13.6, 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = P.l; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(rc + 6, -5.2); ctx.lineTo(rc + 6, 5.2); ctx.moveTo(rc + 11, -5.2); ctx.lineTo(rc + 11, 5.2); ctx.stroke();
      sphere(ctx, rc, 0, 8, hit ? '#fff' : P.l, P.c, INK);
    } else if (s.st === 'laser') {
      ctx.fillStyle = '#272b3f'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.52; ctx.lineTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3)); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = P.c; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = P.l; ctx.lineWidth = 2.6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, r - 3.5, s.t * 2.4 + i * 2.09, s.t * 2.4 + i * 2.09 + 1.1); ctx.stroke(); }
      if (G.q.glow) { const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r + 8); g.addColorStop(0, rgba(P.glow, 0.85)); g.addColorStop(1, rgba(P.glow, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, PI2); ctx.fill(); }
      ctx.save(); ctx.rotate(s.ang); ctx.fillStyle = lin(ctx, 0, -3.6, 0, 3.6, ['#e1e5f8', '#59607c']); ctx.strokeStyle = INK; ctx.lineWidth = 1; rrect(ctx, 3, -3.6, r + 5, 7.2, 2.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r + 8.5, 0, 3.2, 0, PI2); ctx.fill(); ctx.restore();
      const pu = 0.8 + 0.2 * Math.sin(s.t * 12);
      ctx.fillStyle = hit ? '#fff' : lin(ctx, 0, -9, 0, 9, ['#ffffff', P.glow, P.c]); ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -9 * pu); ctx.lineTo(6, 0); ctx.lineTo(0, 9 * pu); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.save(); ctx.scale(r * 1.7 / 40, r * 1.7 / 40); castle(P, hit, s.t, s.ang, false); ctx.restore();
    }
    ctx.restore();
    if (!s.icon && s.hp < s.mhp) hpBar(s.x, s.y - r - 16, 38, s.hp / s.mhp);
  }
  function drawBase(b) {
    const P = TP[b.team], x = b.x, y = b.y, r = b.r, hit = b.hit > 0, t = S.time;
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 1.3, r * 0.55, 0, 0, PI2); ctx.fill();
    if (G.q.glow) { const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.1); g.addColorStop(0, rgba(P.glow, 0.5 + 0.12 * Math.sin(t * 3))); g.addColorStop(1, rgba(P.glow, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, PI2); ctx.fill(); }
    ctx.strokeStyle = rgba(P.l, 0.55); ctx.lineWidth = 2.2; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 12; ctx.beginPath(); ctx.arc(x, y + 2, r * 1.28, 0, PI2); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(x, y - 2); ctx.scale(r / 24, r / 24); castle(P, hit, t, b.ang, true); ctx.restore();
    const w = 92, by = y - r - 24, f = Math.max(0, b.hp / b.mhp);
    ctx.fillStyle = 'rgba(8,4,20,.82)'; rrect(ctx, x - w / 2 - 2, by - 2, w + 4, 15, 7.5); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, by, 0, by + 11, f > 0.5 ? ['#8cffa8', '#1fbf55'] : f > 0.25 ? ['#ffe680', '#e0a400'] : ['#ff9a8a', '#d62f2f']); rrect(ctx, x - w / 2, by, Math.max(4, w * f), 11, 5.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rrect(ctx, x - w / 2 + 2, by + 1.5, Math.max(2, w * f - 4), 3, 1.5); ctx.fill();
    ctx.font = '900 9.5px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 2.5;
    const txt = G.fmt(Math.max(0, b.hp)); ctx.strokeText(txt, x, by + 9.4); ctx.fillText(txt, x, by + 9.4);
  }
  function drawBeam(s) {
    if (s.st !== 'laser' || s.beamLen <= 0) return;
    const P = TP[s.team], dx = Math.cos(s.ang), dy = Math.sin(s.ang), ex = s.x + dx * s.beamLen, ey = s.y + dy * s.beamLen, pu = 1 + Math.sin(s.t * 40) * 0.12;
    const fade = Math.min(1, s.life / 1.2);
    ctx.save(); ctx.lineCap = 'round';
    if (G.q.glow) ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = P.glow; ctx.globalAlpha = 0.25 * fade; ctx.lineWidth = 34 * pu; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.globalAlpha = 0.55 * fade; ctx.lineWidth = 17 * pu; ctx.stroke();
    ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = P.l; ctx.lineWidth = 8.5 * pu; ctx.stroke();
    ctx.globalAlpha = fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.6; ctx.stroke();
    const fl = (x, y, R) => { const g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, rgba(P.glow, 0.7)); g.addColorStop(1, rgba(P.glow, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, PI2); ctx.fill(); };
    fl(s.x + dx * 24, s.y + dy * 24, 20 * pu); fl(ex, ey, 28 * pu);
    ctx.restore();
  }
  function drawDragon(a) {
    const P = TP[a.team], x = a.x, y = a.y - 28, fl = Math.sin(a.t * 12);
    if (G.q.shadow) { ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(a.x, a.y + 12, 38, 13, a.ang, 0, PI2); ctx.fill(); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(a.ang); ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    for (const sg of [-1, 1]) {          // cánh có xương + màng
      const wy = sg * (30 + fl * 14);
      ctx.fillStyle = lin(ctx, 0, 0, 0, wy, [P.c, P.d]); ctx.beginPath(); ctx.moveTo(4, sg * 4); ctx.lineTo(-4, wy * 1.02); ctx.lineTo(-17, wy * 0.72); ctx.lineTo(-22, wy * 0.42); ctx.lineTo(-14, sg * 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = P.l; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(4, sg * 4); ctx.lineTo(-4, wy * 1.02); ctx.moveTo(4, sg * 4); ctx.lineTo(-17, wy * 0.72); ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    }
    ctx.fillStyle = lin(ctx, 0, -9, 0, 9, [P.l, P.c, P.d]);
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(-36, fl * 5, -52, fl * 8); ctx.lineTo(-44, fl * 8 + 5); ctx.quadraticCurveTo(-30, 7, -18, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 9.5, 0, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(1, 3, 18, 4, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = P.d; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 6 - 3, -8.5); ctx.lineTo(i * 6, -13); ctx.lineTo(i * 6 + 3, -8.5); ctx.fill(); }
    ctx.fillStyle = lin(ctx, 0, -8, 0, 8, [P.l, P.c]); ctx.beginPath(); ctx.ellipse(28, 0, 12.5, 8.4, 0, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.moveTo(22, -7); ctx.lineTo(16, -14); ctx.lineTo(26, -9); ctx.fill(); ctx.beginPath(); ctx.moveTo(22, 7); ctx.lineTo(16, 14); ctx.lineTo(26, 9); ctx.fill();
    ctx.fillStyle = '#ffe66b'; ctx.beginPath(); ctx.arc(31, -3.5, 3.2, 0, PI2); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(31.2, -4.8, 1.6, 3.2);
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(39, 0, 2.2 + Math.abs(fl), 0, PI2); ctx.fill();
    ctx.restore();
  }
  function drawCrate(c) {
    const b = Math.sin(c.t * 4) * 3, x = c.x, y = c.y - 5 + b;
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 13, 12, 4.5, 0, 0, PI2); ctx.fill();
    if (G.q.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y, 2, x, y, 30); g.addColorStop(0, 'rgba(255,224,102,.55)'); g.addColorStop(1, 'rgba(255,224,102,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30 + Math.sin(c.t * 5) * 3, 0, PI2); ctx.fill(); ctx.restore(); }
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#3a2208'; ctx.lineWidth = 1.5;
    ctx.fillStyle = lin(ctx, 0, y - 11, 0, y + 12, ['#d99a4a', '#8a5a22']); rrect(ctx, x - 13, y - 5, 26, 17, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, y - 13, 0, y - 3, ['#f0b862', '#b07a30']); ctx.beginPath(); ctx.moveTo(x - 13, y - 4); ctx.quadraticCurveTo(x, y - 17, x + 13, y - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, y - 6, 0, y + 12, ['#ffe680', '#d9a000']); ctx.fillRect(x - 13, y - 1, 26, 3.2); ctx.fillRect(x - 3.5, y - 9, 7, 20);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y + 2, 2.2, 0, PI2); ctx.fill();
    const sp = (c.t * 2) % 1; ctx.fillStyle = `rgba(255,255,255,${1 - sp})`; const sx = x + 10, sy = y - 12 - sp * 4, q = 3 * (1 - sp) + 1; ctx.fillRect(sx - q, sy - 0.6, q * 2, 1.2); ctx.fillRect(sx - 0.6, sy - q, 1.2, q * 2);
  }
  function drawProj(p) {
    const ca = Math.cos(p.ang), sa = Math.sin(p.ang), P = TP[p.team];
    if (p.kind === 'arrow') {
      ctx.strokeStyle = 'rgba(255,240,190,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x - ca * 16, p.y - sa * 16); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.strokeStyle = '#f5e6b8'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(p.x - ca * 11, p.y - sa * 11); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#e6ebff'; ctx.beginPath(); ctx.moveTo(p.x + ca * 3.5, p.y + sa * 3.5); ctx.lineTo(p.x - ca * 1.5 - sa * 2.2, p.y - sa * 1.5 + ca * 2.2); ctx.lineTo(p.x - ca * 1.5 + sa * 2.2, p.y - sa * 1.5 - ca * 2.2); ctx.fill();
      ctx.strokeStyle = P.c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x - ca * 11, p.y - sa * 11); ctx.lineTo(p.x - ca * 8 - sa * 2.4, p.y - sa * 8 + ca * 2.4); ctx.moveTo(p.x - ca * 11, p.y - sa * 11); ctx.lineTo(p.x - ca * 8 + sa * 2.4, p.y - sa * 8 - ca * 2.4); ctx.stroke();
    } else if (p.kind === 'bullet') {
      const g = ctx.createLinearGradient(p.x - ca * 14, p.y - sa * 14, p.x, p.y); g.addColorStop(0, 'rgba(255,214,90,0)'); g.addColorStop(1, 'rgba(255,244,190,.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x - ca * 14, p.y - sa * 14); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.9, 0, PI2); ctx.fill();
    } else {
      if (G.q.glow) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 13); g.addColorStop(0, 'rgba(255,190,90,.7)'); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, PI2); ctx.fill(); }
      sphere(ctx, p.x, p.y, 5.4, '#fff1c8', '#ff7a2a', '#5a2200'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x - 1, p.y - 1, 1.6, 0, PI2); ctx.fill();
    }
  }

  /* ---------------- biểu tượng vũ khí (cùng nét vẽ với trong game) ---------------- */
  const _icons = {};
  G.iconURL = function (key, team) {
    team = team == null ? 4 : team; const ck = key + team; if (_icons[ck]) return _icons[ck];
    const d = G.WEAPONS[key]; if (!d || !document.createElement) return '';
    const cv = document.createElement('canvas'); cv.width = cv.height = 96; const c = cv.getContext('2d'), saved = ctx;
    try {
      ctx = c; c.translate(48, 52);
      if (d.kind === 'unit') { c.rotate(-Math.PI / 5); const sz = key === 'tank' ? 84 : 92; c.drawImage(getSprite(key, team, false, 0), -sz / 2, -sz / 2, sz, sz); }
      else if (d.kind === 'struct') {
        const k = key === 'cannon' ? 2.0 : key === 'laser' ? 2.2 : 1.9; c.scale(k, k);
        drawStruct({ st: d.st, team, r: d.r, x: 0, y: 0, hp: 1, mhp: 1, life: 1, mlife: 1, ang: -0.9, t: 1.1, hit: 0, icon: true, recoil: 0, beamLen: 0, lvl: 1 });
      } else if (d.sp === 'dragon') { c.scale(1.05, 1.05); c.rotate(-0.35); c.translate(-2, 18); drawDragon({ team, x: 0, y: 0, ang: 0, t: 0.4 }); }
      else {                                   // tên lửa hạt nhân
        c.rotate(0.5); c.fillStyle = lin(c, -10, 0, 10, 0, ['#ffffff', '#b9bedc', '#6b7292']); c.strokeStyle = INK; c.lineWidth = 2.2; rrect(c, -9, -30, 18, 56, 9); c.fill(); c.stroke();
        c.fillStyle = '#ff4b4b'; c.beginPath(); c.moveTo(-9, -18); c.quadraticCurveTo(0, -42, 9, -18); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#ffd24a'; c.fillRect(-9, -4, 18, 7); c.fillStyle = '#222'; c.beginPath(); c.arc(0, -0.5, 2.6, 0, PI2); c.fill();
        c.fillStyle = '#ff4b4b'; c.beginPath(); c.moveTo(-9, 16); c.lineTo(-19, 32); c.lineTo(-9, 26); c.fill(); c.stroke(); c.beginPath(); c.moveTo(9, 16); c.lineTo(19, 32); c.lineTo(9, 26); c.fill(); c.stroke();
        c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(-6, 26); c.quadraticCurveTo(0, 48, 6, 26); c.fill();
      }
    } catch (e) { return ''; } finally { ctx = saved; }
    return (_icons[ck] = cv.toDataURL());
  };
  G.wIcon = function (key, team, cls) { const u = G.iconURL(key, team); return u ? `<img class="wi ${cls || ''}" src="${u}" alt="">` : `<i>${(G.WEAPONS[key] || {}).icon || ''}</i>`; };

  /* ---------------- khung hình ---------------- */
  G.draw = function (now) {
    if (!S.map) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = S.map.theme, bg = ctx.createRadialGradient(G.SW / 2, G.SH / 2, 60, G.SW / 2, G.SH / 2, 820);
    bg.addColorStop(0, mix(th.bg, '#ffffff', 0.1)); bg.addColorStop(1, mix(th.bg, '#000000', 0.45)); ctx.fillStyle = bg; ctx.fillRect(0, 0, G.SW, G.SH);
    refreshTiles();
    const sh = S.shake * 9; const L = G.layout;
    // khung bản đồ: bóng đổ + viền phát sáng
    ctx.save(); ctx.translate(L.x, L.y); ctx.scale(L.k, L.k);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rrect(ctx, 4, 8, W, H, 14); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(L.x + (Math.random() - 0.5) * sh, L.y + (Math.random() - 0.5) * sh); ctx.scale(L.k, L.k);
    ctx.save(); rrect(ctx, 0, 0, W, H, 12); ctx.clip();
    ctx.drawImage(tl, 0, 0);
    if (G.q.glow && waterList.length) {  // nước lấp lánh
      for (let k = 0; k < waterList.length; k++) { const i = waterList[k], c = i % COLS, r = (i / COLS) | 0, a = 0.5 + 0.5 * Math.sin(now / 520 + c * 1.7 + r * 0.9); ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.13 * a})`; ctx.fillRect(c * T + 5 + a * 12, r * T + 12, 9, 2); }
    }
    if (G.q.level < 2) {                 // tối viền (vignette) cho chiều sâu
      const v1 = ctx.createLinearGradient(0, 0, 0, 46); v1.addColorStop(0, 'rgba(8,3,24,.5)'); v1.addColorStop(1, 'rgba(8,3,24,0)'); ctx.fillStyle = v1; ctx.fillRect(0, 0, W, 46);
      const v2 = ctx.createLinearGradient(0, H - 46, 0, H); v2.addColorStop(0, 'rgba(8,3,24,0)'); v2.addColorStop(1, 'rgba(8,3,24,.5)'); ctx.fillStyle = v2; ctx.fillRect(0, H - 46, W, 46);
      const v3 = ctx.createLinearGradient(0, 0, 36, 0); v3.addColorStop(0, 'rgba(8,3,24,.4)'); v3.addColorStop(1, 'rgba(8,3,24,0)'); ctx.fillStyle = v3; ctx.fillRect(0, 0, 36, H);
      const v4 = ctx.createLinearGradient(W - 36, 0, W, 0); v4.addColorStop(0, 'rgba(8,3,24,0)'); v4.addColorStop(1, 'rgba(8,3,24,.4)'); ctx.fillStyle = v4; ctx.fillRect(W - 36, 0, 36, H);
    }
    ctx.restore();
    const fg = ctx.createLinearGradient(0, 0, W, H); fg.addColorStop(0, '#b48cff'); fg.addColorStop(0.5, '#ff7ad9'); fg.addColorStop(1, '#6ac8ff');
    ctx.strokeStyle = 'rgba(140,90,255,.35)'; ctx.lineWidth = 9; rrect(ctx, 0, 0, W, H, 12); ctx.stroke();
    ctx.strokeStyle = fg; ctx.lineWidth = 3.4; rrect(ctx, 1.5, 1.5, W - 3, H - 3, 11); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const [cx, cy, sx, sy] of [[8, 8, 1, 1], [W - 8, 8, -1, 1], [8, H - 8, 1, -1], [W - 8, H - 8, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx, cy + sy * 20); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * 20, cy); ctx.stroke(); }
    // rương + cảnh báo
    for (const c of S.crates) drawCrate(c);
    for (const n of S.nukes) {
      const f = 1 - n.t / n.m, pu = 0.5 + 0.5 * Math.sin(n.t * 18);
      ctx.fillStyle = `rgba(255,60,40,${0.1 + 0.12 * pu})`; ctx.beginPath(); ctx.arc(n.x, n.y, n.rad, 0, PI2); ctx.fill();
      ctx.strokeStyle = `rgba(255,${80 + 100 * pu | 0},60,.95)`; ctx.lineWidth = 3.5; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.arc(n.x, n.y, n.rad * (1 - 0.15 * f), 0, PI2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(n.x - 20, n.y); ctx.lineTo(n.x + 20, n.y); ctx.moveTo(n.x, n.y - 20); ctx.lineTo(n.x, n.y + 20); ctx.stroke();
    }
    for (const b of S.bombs) { const f = b.t / b.m; ctx.strokeStyle = 'rgba(255,120,60,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 70 * (1 - f * 0.4), 0, PI2); ctx.stroke(); sphere(ctx, b.x, b.y - f * 60, 5.5, '#666b85', '#14141f', '#000'); ctx.fillStyle = '#ffb347'; ctx.fillRect(b.x - 0.8, b.y - f * 60 - 9, 1.6, 4); }
    // thực thể theo trục y
    drawList.length = 0; for (const u of S.units) drawList.push(u); for (const s of S.structs) drawList.push(s); for (const b of S.bases) if (!b.dead) drawList.push(b);
    drawList.sort((a, b) => a.y - b.y);
    for (const e of drawList) { if (e.isBase) drawBase(e); else if (e.struct) drawStruct(e); else drawUnit(e); }
    for (const s of S.structs) drawBeam(s);
    for (const p of S.projs) drawProj(p);
    for (const a of S.airs) drawDragon(a);
    for (const n of S.nukes) {
      const f = n.t / n.m, y = n.y - f * 900 - 30;
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(n.x - 6, y - 24); ctx.lineTo(n.x, y - 64 - Math.random() * 22); ctx.lineTo(n.x + 6, y - 24); ctx.fill();
      ctx.fillStyle = lin(ctx, n.x - 8, 0, n.x + 8, 0, ['#ffffff', '#b9bedc', '#6b7292']); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; rrect(ctx, n.x - 8, y - 28, 16, 50, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4b4b'; ctx.beginPath(); ctx.moveTo(n.x - 8, y - 16); ctx.quadraticCurveTo(n.x, y - 44, n.x + 8, y - 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(n.x - 8, y - 2, 16, 6);
    }
    // hạt
    const P = S.parts;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], a = p.l / p.m;
      if (p.k === 0) { ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = p.c; const s = p.s * (0.4 + 0.6 * a); ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }
      else if (p.k === 1) { ctx.globalAlpha = a; ctx.strokeStyle = p.c; ctx.lineWidth = p.w * a + 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.25 + 0.75 * (1 - a)), 0, PI2); ctx.stroke(); }
      else { ctx.globalAlpha = Math.min(1, a * 2); ctx.font = `900 ${p.s}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(p.t, p.x, p.y); ctx.fillStyle = p.c; ctx.fillText(p.t, p.x, p.y); }
    }
    ctx.globalAlpha = 1; ctx.restore();
    if (S.flash > 0) { ctx.globalAlpha = Math.min(1, S.flash); ctx.fillStyle = S.flashColor; ctx.fillRect(0, 0, G.SW, G.SH); ctx.globalAlpha = 1; }
  };

  /* =====================================================================
     HUD + UI (DOM)
     ===================================================================== */
  const ui = (G.ui = G.ui || {});
  const hue = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  // Avatar tròn: ảnh thật của người xem (nếu TikTok gửi kèm) phủ lên chữ cái đầu làm ảnh dự phòng
  G.avatar = function (p, cls) {
    const o = typeof p === 'string' ? { name: p } : (p || {}), name = String(o.name || '?').trim(), src = /^(https?:\/\/|data:image\/)/.test(o.avatar || '') ? o.avatar : '';
    return `<span class="av ${cls || ''}" style="--h:${hue(name)}"><i>${G.esc(name.charAt(0).toUpperCase() || '?')}</i>${src ? `<img src="${G.esc(src)}" alt="" referrerpolicy="no-referrer" decoding="async" onerror="this.remove()">` : ''}</span>`;
  };
  const fmtT = s => { s = Math.max(0, Math.ceil(s)); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };
  const setHTML = (el, key, html) => { if (el._k !== key) { el._k = key; el.innerHTML = html; } };
  // người vào đội gần nhất (mới nhất đứng đầu) + tổng số người trong đội
  function roster(t, max) {
    const list = []; let total = 0;
    S.players.forEach(p => {
      if (p.team !== t) return; total++;
      if (list.length < max || p.joinT > list[list.length - 1].joinT) { list.push(p); list.sort((a, b) => b.joinT - a.joinT); if (list.length > max) list.pop(); }
    });
    return { list, total };
  }

  ui.rebuildGuide = function () {
    const el = $('guide'); if (!el) return;
    const rules = G.settings.rules.slice().sort((a, b) => a.min - b.min);
    el.innerHTML = '<div class="gl">' + rules.map(r => { const w = G.WEAPONS[r.w]; return w ? `<div class="gi">${G.wIcon(r.w, 4)}<span class="pr"><b>${G.fmt(r.min)}</b><s>xu</s></span></div>` : ''; }).join('') + '</div>' +
      `<div class="gt"><span>Gõ <b style="color:${TM[0].light}">1</b>/<b style="color:${TM[0].light}">xanh</b> · <b style="color:${TM[1].light}">2</b>/<b style="color:${TM[1].light}">đỏ</b>${S.tc > 2 ? ` · <b style="color:${TM[2].light}">3</b> · <b style="color:${TM[3].light}">4</b>` : ''} để chọn đội</span><span>👆 Chạm màn hình = triệu hồi lính</span></div>`;
  };

  let lastHud = 0, segs = [];
  ui.update = function (now) {
    if (now - lastHud < 180) return; lastHud = now;
    if (!S.teams.length) return;
    const bar = $('bar');
    if (segs.length !== S.tc) { bar.innerHTML = S.teams.map((t, i) => `<div class="seg" style="--c:${TM[i].color};--d:${TM[i].dark};--l:${TM[i].light}"><span></span></div>`).join(''); segs = [...bar.children]; }
    S.teams.forEach((t, i) => { segs[i].style.flexGrow = Math.max(0.0001, t.pct); segs[i].firstChild.textContent = Math.round(t.pct * 100) + '%'; segs[i].firstChild.style.opacity = t.pct > 0.06 ? 1 : 0; });
    const tm = $('timer'), ph = S.phase;
    tm.textContent = ph === 'battle' ? fmtT(S.battleT) : ph === 'lobby' ? fmtT(S.phaseT) : ph === 'countdown' ? fmtT(G.settings.matchSec) : '🏁';
    tm.className = ph === 'battle' && S.battleT < 15 ? 'urgent' : '';
    $('phase').textContent = ph === 'lobby' ? 'CHỌN ĐỘI' : ph === 'battle' ? S.map.name.toUpperCase() : ph === 'result' ? 'KẾT THÚC' : 'SẴN SÀNG';
    // thẻ đội: số liệu + chồng avatar người chơi
    const chipMax = [0, 0, 7, 5, 3][S.tc] || 3;
    const ros = S.teams.map((t, i) => roster(i, chipMax));
    const chipsHtml = S.teams.map((t, i) => {
      const r = ros[i], stk = r.list.map(p => G.avatar(p, 'stk')).join('') + (r.total > r.list.length ? `<span class="more">+${r.total - r.list.length}</span>` : '') + (r.total === 0 ? '<span class="slot"></span>' : '');
      return `<div class="chip ${t.alive ? '' : 'dead'}" style="--c:${TM[i].color};--l:${TM[i].light}"><div class="ct"><b>${t.alive ? '' : '☠ '}${TM[i].name}</b><span>🪙 ${G.fmt(t.coins)} · ⚔ ${t.units + t.structs}</span></div><div class="stk">${stk}</div></div>`;
    }).join('');
    setHTML($('chips'), chipsHtml, chipsHtml);
    // top donors
    const top = [...S.players.values()].filter(p => p.mc > 0).sort((a, b) => b.mc - a.mc).slice(0, 5);
    const dh = top.length ? top.map((p, i) => `<div class="dn" style="--c:${p.team >= 0 ? TM[p.team].color : '#888'}"><em>${['🥇', '🥈', '🥉', '4', '5'][i]}</em>${G.avatar(p, 'xs')}<span>${G.esc(p.name.slice(0, 9))}</span><b>${G.fmt(p.mc)}</b></div>`).join('') : '<div class="dn empty">🎁 Thả quà để lên TOP xu của trận!</div>';
    setHTML($('donors'), dh, dh);
    // sảnh chọn đội: mỗi đội là một hàng ô tròn, ai chọn đội thì avatar hiện ngay vào ô
    const lb = $('lobbyBox');
    if (ph === 'lobby') {
      const slotsN = [0, 0, 10, 8, 6][S.tc] || 6, lr = S.teams.map((t, i) => roster(i, slotsN));
      const key = S.map.id + '|' + lr.map(r => r.total + ':' + r.list.map(p => p.id + (S.time - p.joinT < 1.4 ? '*' : '')).join(',')).join('|');
      const cards = S.teams.map((t, i) => {
        const r = lr[i], over = r.total > slotsN, shown = over ? r.list.slice(0, slotsN - 1) : r.list; let sl = '';
        for (let k = 0; k < slotsN; k++) {
          if (k < shown.length) sl += `<span class="sl full ${S.time - shown[k].joinT < 1.4 ? 'new' : ''}">${G.avatar(shown[k], 'fill')}</span>`;
          else if (over && k === slotsN - 1) sl += `<span class="sl full more">+${r.total - shown.length}</span>`;
          else sl += '<span class="sl"></span>';
        }
        return `<div class="lt n${S.tc}" style="--c:${TM[i].color};--l:${TM[i].light};--d:${TM[i].dark}"><div class="lh"><b>${i + 1}</b><span>${TM[i].name}</span></div><div class="slots">${sl}</div><small>👥 ${r.total} người</small></div>`;
      }).join('');
      lb.className = 'show';
      setHTML(lb, key, `<h2>⚔️ CHỌN ĐỘI</h2><p>Bình luận số hoặc tên màu — avatar của bạn sẽ hiện trong đội</p><div class="lts">${cards}</div><p class="mp">🗺️ ${G.esc(S.map.name)} — ${G.esc(S.map.desc)}</p><div class="cd"></div>`);
      lb.querySelector('.cd').textContent = fmtT(S.phaseT);
      lb.style.top = G.layout.safe ? Math.round(G.layout.cy - lb.offsetHeight / 2) + 'px' : '';
    } else { lb.className = ''; lb._k = null; }
    const demo = $('demo'); demo.style.display = G.settings.demo ? 'block' : 'none';
    const cn = $('conn'); const st = G.live ? G.live.status : 'off'; cn.className = 'st-' + st; cn.title = 'TikTok: ' + st;
  };

  ui.feed = function (html, color) {
    const f = $('feed'); if (!f) return;
    const d = document.createElement('div'); d.className = 'fi'; d.style.setProperty('--c', color || '#fff'); d.innerHTML = html; f.appendChild(d);
    while (f.children.length > (G.q.level === 2 || G.layout.safe ? 3 : 6)) f.removeChild(f.firstChild);
    setTimeout(() => d.classList.add('out'), 4200); setTimeout(() => d.remove(), 4800);
  };
  ui.center = function (text, color, ms) {
    const c = $('flashMsg'); c.textContent = text; c.style.setProperty('--c', color || '#fff'); c.className = ''; void c.offsetWidth; c.className = 'show';
    clearTimeout(ui._ct); ui._ct = setTimeout(() => c.className = '', ms || 1800);
  };
  ui.count = function (n) {
    const c = $('count'); if (n <= 0) { c.textContent = 'CHIẾN!'; c.className = 'go'; setTimeout(() => c.className = '', 900); return; }
    c.textContent = n; c.className = ''; void c.offsetWidth; c.className = 'pop';
  };
  ui.lobby = function () { $('result').className = ''; $('result').innerHTML = ''; ui.rebuildGuide(); segs = []; };
  ui.gift = function (p, w, n, total, lvl) {
    const t = TM[p.team] || TM[0], el = document.createElement('div'), key = Object.keys(G.WEAPONS).find(k => G.WEAPONS[k] === w); el.className = 'gift'; el.style.setProperty('--c', t.color);
    el.innerHTML = `${G.avatar(p, 'mid')}${G.wIcon(key, p.team >= 0 ? p.team : 4, 'big')}<div><small>${G.esc(p.name)} triệu hồi</small><b>${w.name}${n > 1 ? ' ×' + n : ''}${lvl > 1 ? ' Lv' + lvl : ''}</b></div><em>${G.fmt(total)} xu</em>`;
    const host = $('banners'); host.appendChild(el); setTimeout(() => el.classList.add('out'), 2300); setTimeout(() => el.remove(), 2800);
    while (host.children.length > 4) host.removeChild(host.firstChild);
  };
  ui.entrance = function (p, rank) {
    const e = document.createElement('div'), cls = rank === 1 ? 'r1' : rank <= 3 ? 'r3' : 'r10', b = G.board[p.id];
    e.className = 'ent ' + cls;
    e.innerHTML = `<div class="glow"></div>${rank <= 3 ? '<div class="crown">' + (rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉') + '</div>' : ''}${G.avatar({ name: p.name, avatar: p.avatar || (b && b.a) }, 'big')}<div class="tx"><small>TOP ${rank} BẢNG XẾP HẠNG</small><b>${G.esc(p.name)}</b><span>🪙 ${G.fmt(b ? b.c : 0)} xu · 🏆 ${b ? b.w : 0} thắng</span></div>`;
    const host = $('banners'); host.appendChild(e); setTimeout(() => e.classList.add('out'), rank === 1 ? 4200 : 3200); setTimeout(() => e.remove(), rank === 1 ? 4800 : 3800);
    while (host.children.length > 4) host.removeChild(host.firstChild);
    if (rank <= 3) fx_confetti(rank);
  };
  function fx_confetti(rank) { const col = rank === 1 ? ['#ffd24a', '#fff3b0', '#ff9f1a'] : ['#cfe6ff', '#9ad0ff', '#fff']; for (let i = 0; i < 4; i++) G.fx.burst(120 + Math.random() * 480, 100 + Math.random() * 200, col[i % 3], 18, 200, 1.2, 4, 160); }

  ui.result = function (res) {
    const el = $('result'), w = res.winner, t = w >= 0 ? TM[w] : null;
    const medal = i => ['🥇', '🥈', '🥉'][i] || (i + 1);
    const mvp = res.mvp;
    el.innerHTML = `<div class="rc" style="--c:${t ? t.color : '#aaa'};--l:${t ? t.light : '#ddd'}">
      <div class="rt">🏆 ĐỘI ${t ? t.name : 'HOÀ'} CHIẾN THẮNG!</div>
      <div class="rb">${res.teams.map(x => `<div style="flex-grow:${Math.max(0.001, x.pct)};background:linear-gradient(#fff4,#0000 55%),${TM[x.id].color}">${Math.round(x.pct * 100)}%</div>`).join('')}</div>
      ${mvp ? `<div class="mvp"><div class="crown">👑</div>${G.avatar(mvp, 'big')}<div><small>MVP — NHIỀU XU NHẤT</small><b>${G.esc(mvp.name)}</b><span>🪙 ${G.fmt(mvp.mc)} xu</span></div></div>` : ''}
      <div class="cols"><div><h4>TOP XU TRẬN NÀY</h4>${res.top.slice(0, 5).map((p, i) => `<div class="row" style="--c:${p.team >= 0 ? TM[p.team].color : '#888'}"><em>${medal(i)}</em>${G.avatar(p, 'xs')}<span>${G.esc(p.name)}</span><b>${G.fmt(p.mc)}</b></div>`).join('') || '<div class="row"><span>Chưa có ai tặng quà</span></div>'}</div>
      <div><h4>BẢNG XẾP HẠNG TỔNG</h4>${res.board.slice(0, 10).map((p, i) => `<div class="row ${p.delta > 0 || p.isNew ? 'up' : ''}"><em>${medal(i)}</em>${G.avatar({ name: p.n, avatar: p.a }, 'xs')}<span>${G.esc(p.n)}</span><b>${G.fmt(p.c)}</b><i>${p.isNew ? '🆕' : p.delta > 0 ? '▲' + p.delta : p.delta < 0 ? '▼' + -p.delta : '–'}</i></div>`).join('') || '<div class="row"><span>Trống</span></div>'}</div></div>
      <div class="rn">Trận mới sau ${G.settings.resultSec}s…</div></div>`;
    el.className = 'show';
    const rc = el.firstElementChild;
    if (rc) { rc.style.zoom = ''; const avail = G.layout.safeH - 20, h = rc.offsetHeight; if (h > avail) rc.style.zoom = (avail / h).toFixed(3); }
  };
})();
