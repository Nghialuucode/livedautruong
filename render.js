/* ===== Vẽ canvas + HUD (DOM) + hiệu ứng thông báo ===== */
(function () {
  'use strict';
  const G = window.G, S = G.S, T = G.T, COLS = G.COLS, ROWS = G.ROWS, W = G.W, H = G.H, AY = G.ARENA_Y, TM = G.TEAMS;
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
  G.applyLayout = function () {
    const st = $('stage'); if (!st) return;
    const s = G.settings, L = G.layout, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const safe = s.safeMode !== false;
    const top = cl(+s.safeTop || 0, 0, 300), bot = cl(+s.safeBottom || 0, 0, 520);
    const hudH = 118, guideH = 74;
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
      const show = s.showSafe || (G.menu && G.menu.open_ && G.menu.tab === 'view');
      z.className = show ? 'on' : '';
      z.innerHTML = show ? `<div style="top:0;height:${top}px">TikTok che: tên host · người xem</div><div style="bottom:0;height:${bot}px">TikTok che: khung chat · ô bình luận</div>` : '';
    }
    const info = $('layInfo');
    if (info) info.textContent = safe ? `Bản đồ thu còn ${Math.round(L.k * 100)}% · vùng hiển thị cao ${Math.round(L.safeH)}px / 1280px` : 'Đang tắt: dùng bố cục toàn màn hình';
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

  /* ---------------- ô đất ---------------- */
  function drawTile(i) {
    const c = i % COLS, r = (i / COLS) | 0, x = c * T, y = r * T, w = S.wall[i], th = S.map.theme;
    if (w === 1) {
      tctx.fillStyle = th.bg; tctx.fillRect(x, y, T, T);
      tctx.fillStyle = th.wall; tctx.fillRect(x + 1, y + 4, T - 2, T - 4);
      tctx.fillStyle = th.wallTop; tctx.fillRect(x + 1, y + 1, T - 2, T - 8);
      tctx.fillStyle = 'rgba(255,255,255,.18)'; tctx.fillRect(x + 3, y + 3, T - 10, 3);
    } else if (w === 2) {
      tctx.fillStyle = th.water; tctx.fillRect(x, y, T, T);
      tctx.fillStyle = 'rgba(255,255,255,.1)'; tctx.fillRect(x + 4, y + 8 + ((c + r) & 1) * 8, T - 12, 2); tctx.fillRect(x + 10, y + 20 - ((c + r) & 1) * 8, T - 14, 2);
    } else {
      const o = S.owner[i], t = TM[o] || TM[0];
      tctx.fillStyle = t.dark; tctx.fillRect(x, y, T, T);
      tctx.fillStyle = (c + r) & 1 ? t.tileA : t.tileB; tctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      tctx.fillStyle = 'rgba(255,255,255,.13)'; tctx.fillRect(x + 1, y + 1, T - 2, 3);
    }
  }
  function buildStatic() { }
  function refreshTiles() {
    if (S.tilesAll) { for (let i = 0; i < COLS * ROWS; i++) drawTile(i); S.tilesAll = false; S.dirty.length = 0; return; }
    const d = S.dirty; for (let i = 0; i < d.length; i++) drawTile(d[i]); d.length = 0;
  }

  /* ---------------- vẽ thực thể ---------------- */
  function hpBar(x, y, w, f, col) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = col || (f > 0.5 ? '#4cff7a' : f > 0.25 ? '#ffd24a' : '#ff4b4b'); ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 3);
  }
  function drawUnit(u) {
    const t = TM[u.team], r = u.r, bob = u.moving ? Math.sin(u.t * 11 + u.bob) * 1.6 : Math.sin(u.t * 3 + u.bob) * 0.6, x = u.x, y = u.y + bob, a = u.ang, ca = Math.cos(a), sa = Math.sin(a);
    if (G.q.shadow) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(u.x, u.y + r * 0.75, r * 0.95, r * 0.4, 0, 0, PI2); ctx.fill(); }
    const k = u.kind, hit = u.hit > 0;
    if (k === 'tank') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = '#222'; ctx.fillRect(-r, -r * 0.95, r * 2, r * 0.38); ctx.fillRect(-r, r * 0.57, r * 2, r * 0.38);
      ctx.fillStyle = hit ? '#fff' : t.color; ctx.strokeStyle = t.dark; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-r * 0.9, -r * 0.65, r * 1.8, r * 1.3, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hit ? '#fff' : t.light; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, PI2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b2b3a'; ctx.fillRect(0, -2.5, r * 1.35, 5); ctx.restore();
    } else {
      ctx.fillStyle = hit ? '#fff' : t.color; ctx.strokeStyle = t.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill(); if (G.q.level < 2) ctx.stroke();
      if (G.q.level === 0) {
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.4, 0, PI2); ctx.fill();
        // mắt
        const ex = -sa * r * 0.35, ey = ca * r * 0.35, fx = ca * r * 0.25, fy = sa * r * 0.25;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + fx + ex, y + fy + ey - 1, r * 0.27, 0, PI2); ctx.arc(x + fx - ex, y + fy - ey - 1, r * 0.27, 0, PI2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + fx * 1.5 + ex, y + fy * 1.5 + ey - 1, r * 0.13, 0, PI2); ctx.arc(x + fx * 1.5 - ex, y + fy * 1.5 - ey - 1, r * 0.13, 0, PI2); ctx.fill();
      } else {
        ctx.fillStyle = '#fff'; ctx.fillRect(x + ca * r * 0.3 - 2, y + sa * r * 0.3 - 3, 4, 4);
      }
      if (k === 'soldier') {
        const sw = u.slash > 0 ? Math.sin(u.slash * 17) * 1.2 : 0, aa = a + sw;
        ctx.strokeStyle = '#eef3ff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + Math.cos(aa) * r * 0.8, y + Math.sin(aa) * r * 0.8); ctx.lineTo(x + Math.cos(aa) * (r + 10), y + Math.sin(aa) * (r + 10)); ctx.stroke();
      } else if (k === 'archer') {
        ctx.strokeStyle = '#b07a3a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x + ca * r * 0.7, y + sa * r * 0.7, r * 0.95, a - 1.1, a + 1.1); ctx.stroke();
      } else if (k === 'gunner') {
        ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 4.5; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x + ca * r * 0.4, y + sa * r * 0.4); ctx.lineTo(x + ca * (r + 9), y + sa * (r + 9)); ctx.stroke();
      }
    }
    if (u.lvl > 1) {
      ctx.font = '800 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#ffe066';
      ctx.strokeText(u.lvl, u.x, u.y - r - 7); ctx.fillText(u.lvl, u.x, u.y - r - 7);
    }
    if (u.hp < u.mhp) hpBar(u.x, u.y - r - 4 - (u.lvl > 1 ? 0 : 0), Math.max(14, r * 2), u.hp / u.mhp);
  }
  function drawStruct(s) {
    const t = TM[s.team], f = s.life / s.mlife, hit = s.hit > 0;
    if (G.q.shadow) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + s.r * 0.7, s.r * 1.1, s.r * 0.5, 0, 0, PI2); ctx.fill(); }
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.strokeStyle = t.light; ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, s.r + 7, -Math.PI / 2, -Math.PI / 2 + PI2 * f); ctx.stroke(); ctx.globalAlpha = 1;
    if (s.st === 'cannon') {
      ctx.fillStyle = t.dark; ctx.beginPath(); ctx.arc(0, 0, s.r, 0, PI2); ctx.fill();
      ctx.fillStyle = hit ? '#fff' : t.color; ctx.beginPath(); ctx.arc(0, 0, s.r - 4, 0, PI2); ctx.fill();
      ctx.rotate(s.ang); const rc = s.recoil > 0 ? -5 : 0; ctx.fillStyle = '#2b2b3a'; ctx.fillRect(rc, -5, s.r + 10, 10); ctx.fillStyle = '#555a70'; ctx.fillRect(rc + s.r + 6, -6, 5, 12);
      ctx.fillStyle = t.light; ctx.beginPath(); ctx.arc(0, 0, 6, 0, PI2); ctx.fill();
    } else if (s.st === 'laser') {
      ctx.fillStyle = t.dark; ctx.beginPath(); ctx.arc(0, 0, s.r, 0, PI2); ctx.fill();
      ctx.fillStyle = hit ? '#fff' : '#2b2b3a'; ctx.beginPath(); ctx.arc(0, 0, s.r - 3, 0, PI2); ctx.fill();
      ctx.rotate(s.ang); ctx.fillStyle = '#c7d0e8'; ctx.fillRect(2, -4, s.r + 4, 8);
      ctx.rotate(-s.ang); const pu = 0.6 + 0.4 * Math.sin(s.t * 14); ctx.fillStyle = `rgba(255,255,255,${pu})`; ctx.beginPath(); ctx.arc(0, 0, 6, 0, PI2); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      const w = s.r * 1.7; ctx.fillStyle = t.dark; ctx.beginPath(); ctx.roundRect(-w / 2 - 2, -w / 2, w + 4, w + 4, 5); ctx.fill();
      ctx.fillStyle = hit ? '#fff' : t.color; ctx.beginPath(); ctx.roundRect(-w / 2, -w / 2 + 2, w, w - 2, 4); ctx.fill();
      ctx.fillStyle = t.light; for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) { ctx.beginPath(); ctx.arc(i * w * 0.5, j * w * 0.45, 7, 0, PI2); ctx.fill(); ctx.fillStyle = t.dark; ctx.fillRect(i * w * 0.5 - 2, j * w * 0.45 - 3, 4, 6); ctx.fillStyle = t.light; }
      ctx.fillStyle = '#2b2b3a'; ctx.fillRect(-6, 4, 12, 14); ctx.rotate(s.ang); ctx.fillStyle = '#fff'; ctx.fillRect(0, -2, 14, 4);
    }
    ctx.restore();
    if (s.hp < s.mhp) hpBar(s.x, s.y - s.r - 14, 36, s.hp / s.mhp);
  }
  function drawBase(b) {
    const t = TM[b.team], x = b.x, y = b.y, r = b.r, hit = b.hit > 0;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r * 1.2, r * 0.5, 0, 0, PI2); ctx.fill();
    if (G.q.glow) { const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2); g.addColorStop(0, t.glow + '66'); g.addColorStop(1, t.glow + '00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, PI2); ctx.fill(); }
    ctx.fillStyle = t.dark; ctx.beginPath(); ctx.roundRect(x - r, y - r * 0.9, r * 2, r * 1.9, 10); ctx.fill();
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.roundRect(x - r + 4, y - r * 0.9 + 3, r * 2 - 8, r * 1.6, 8); ctx.fill();
    if (hit) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill(); }
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) { ctx.fillStyle = t.light; ctx.beginPath(); ctx.arc(x + i * (r - 4), y + j * (r * 0.8), 11, 0, PI2); ctx.fill(); ctx.strokeStyle = t.dark; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 2, 17, 0, PI2); ctx.fill(); ctx.strokeStyle = t.dark; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); ctx.translate(x, y - 2); ctx.rotate(b.ang); ctx.fillStyle = '#2b2b3a'; ctx.fillRect(0, -3, 22, 6); ctx.restore();
    ctx.font = '900 13px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = t.dark; ctx.fillText(t.name.slice(0, 1), x, y + 3);
    const by = y + (b.y < H / 2 ? -r - 18 : -r - 18);
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.beginPath(); ctx.roundRect(x - 40, by - 1, 80, 11, 5); ctx.fill();
    const f = Math.max(0, b.hp / b.mhp); ctx.fillStyle = f > 0.5 ? '#4cff7a' : f > 0.25 ? '#ffd24a' : '#ff4b4b'; ctx.beginPath(); ctx.roundRect(x - 38, by + 1, 76 * f, 7, 3); ctx.fill();
  }
  function drawBeam(s) {
    if (s.st !== 'laser' || s.beamLen <= 0) return;
    const t = TM[s.team], dx = Math.cos(s.ang), dy = Math.sin(s.ang), ex = s.x + dx * s.beamLen, ey = s.y + dy * s.beamLen, pu = 1 + Math.sin(s.t * 40) * 0.12;
    const fade = Math.min(1, s.life / 1.2);
    ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = 'round';
    if (G.q.glow) ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = t.glow; ctx.globalAlpha = 0.28 * fade; ctx.lineWidth = 26 * pu; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = t.light; ctx.lineWidth = 11 * pu; ctx.stroke();
    ctx.globalAlpha = fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 9 * pu, 0, PI2); ctx.fill();
    ctx.restore();
  }
  function drawDragon(a) {
    const t = TM[a.team], x = a.x, y = a.y - 26, fl = Math.sin(a.t * 13);
    if (G.q.shadow) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(a.x, a.y + 10, 34, 12, a.ang, 0, PI2); ctx.fill(); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(a.ang);
    ctx.fillStyle = t.dark; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-22, -34 - fl * 16); ctx.lineTo(8, -8); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-22, 34 + fl * 16); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-18, -26 - fl * 14); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-18, 26 + fl * 14); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = t.color; ctx.strokeStyle = t.dark; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 24, 9, 0, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-44, fl * 4); ctx.lineTo(-22, 4); ctx.fill();
    ctx.beginPath(); ctx.ellipse(26, 0, 11, 8, 0, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(29, -3, 3, 0, PI2); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(30, -3, 1.5, 0, PI2); ctx.fill();
    ctx.restore();
  }
  function drawCrate(c) {
    const b = Math.sin(c.t * 4) * 3, x = c.x, y = c.y - 4 + b;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 12, 11, 4, 0, 0, PI2); ctx.fill();
    if (G.q.glow) { ctx.fillStyle = 'rgba(255,224,102,.25)'; ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(c.t * 5) * 3, 0, PI2); ctx.fill(); }
    ctx.fillStyle = '#7a4a1a'; ctx.fillRect(x - 12, y - 10, 24, 22); ctx.fillStyle = '#ffd24a'; ctx.fillRect(x - 10, y - 8, 20, 18);
    ctx.fillStyle = '#c98a1a'; ctx.fillRect(x - 10, y - 1, 20, 3); ctx.fillRect(x - 2, y - 8, 4, 18);
  }

  /* ---------------- khung hình ---------------- */
  G.draw = function (now) {
    if (!S.map) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = S.map.theme.bg; ctx.fillRect(0, 0, G.SW, G.SH);
    refreshTiles();
    const sh = S.shake * 9; const L = G.layout; ctx.save(); ctx.translate(L.x + (Math.random() - 0.5) * sh, L.y + (Math.random() - 0.5) * sh); ctx.scale(L.k, L.k);
    ctx.drawImage(tl, 0, 0);
    ctx.strokeStyle = 'rgba(160,110,255,.7)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    // rương + cảnh báo
    for (const c of S.crates) drawCrate(c);
    for (const n of S.nukes) {
      const f = 1 - n.t / n.m, pu = 0.5 + 0.5 * Math.sin(n.t * 18);
      ctx.fillStyle = `rgba(255,60,40,${0.1 + 0.12 * pu})`; ctx.beginPath(); ctx.arc(n.x, n.y, n.rad, 0, PI2); ctx.fill();
      ctx.strokeStyle = `rgba(255,${80 + 100 * pu | 0},60,.9)`; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.arc(n.x, n.y, n.rad * (1 - 0.15 * f), 0, PI2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(n.x - 18, n.y); ctx.lineTo(n.x + 18, n.y); ctx.moveTo(n.x, n.y - 18); ctx.lineTo(n.x, n.y + 18); ctx.stroke();
    }
    for (const b of S.bombs) { const f = b.t / b.m; ctx.strokeStyle = 'rgba(255,120,60,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 70 * (1 - f * 0.4), 0, PI2); ctx.stroke(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(b.x, b.y - f * 60, 5, 0, PI2); ctx.fill(); }
    // thực thể theo trục y
    drawList.length = 0; for (const u of S.units) drawList.push(u); for (const s of S.structs) drawList.push(s); for (const b of S.bases) if (!b.dead) drawList.push(b);
    drawList.sort((a, b) => a.y - b.y);
    for (const e of drawList) { if (e.isBase) drawBase(e); else if (e.struct) drawStruct(e); else drawUnit(e); }
    for (const s of S.structs) drawBeam(s);
    // đạn
    for (const p of S.projs) {
      const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
      if (p.kind === 'arrow') { ctx.strokeStyle = '#fff2c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - ca * 11, p.y - sa * 11); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      else if (p.kind === 'bullet') { ctx.fillStyle = '#ffe680'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); ctx.strokeStyle = 'rgba(255,230,128,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - ca * 9, p.y - sa * 9); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      else { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, PI2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, PI2); ctx.fill(); }
    }
    for (const a of S.airs) drawDragon(a);
    for (const n of S.nukes) {
      const f = n.t / n.m, y = n.y - f * 900 - 30;
      ctx.fillStyle = '#d9dcef'; ctx.beginPath(); ctx.roundRect(n.x - 7, y - 26, 14, 46, 6); ctx.fill(); ctx.fillStyle = '#ff4b4b'; ctx.beginPath(); ctx.moveTo(n.x - 7, y + 14); ctx.lineTo(n.x, y + 28); ctx.lineTo(n.x + 7, y + 14); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(n.x - 5, y - 26); ctx.lineTo(n.x, y - 60 - Math.random() * 20); ctx.lineTo(n.x + 5, y - 26); ctx.fill();
    }
    // hạt
    const P = S.parts, add = G.q.glow;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], a = p.l / p.m;
      if (p.k === 0) { ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = p.c; const s = p.s * (0.4 + 0.6 * a); ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }
      else if (p.k === 1) { ctx.globalAlpha = a; ctx.strokeStyle = p.c; ctx.lineWidth = p.w * a + 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.25 + 0.75 * (1 - a)), 0, PI2); ctx.stroke(); }
      else { ctx.globalAlpha = Math.min(1, a * 2); ctx.font = `800 ${p.s}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(p.t, p.x, p.y); ctx.fillStyle = p.c; ctx.fillText(p.t, p.x, p.y); }
    }
    ctx.globalAlpha = 1; ctx.restore();
    if (S.flash > 0) { ctx.globalAlpha = Math.min(1, S.flash); ctx.fillStyle = S.flashColor; ctx.fillRect(0, 0, G.SW, G.SH); ctx.globalAlpha = 1; }
  };

  /* =====================================================================
     HUD + UI (DOM)
     ===================================================================== */
  const ui = (G.ui = G.ui || {});
  const hue = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  G.avatar = (name, cls) => `<span class="av ${cls || ''}" style="background:hsl(${hue(name)},65%,50%)">${G.esc((name || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;
  const fmtT = s => { s = Math.max(0, Math.ceil(s)); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };

  ui.rebuildGuide = function () {
    const el = $('guide'); if (!el) return;
    const rules = G.settings.rules.slice().sort((a, b) => a.min - b.min);
    el.innerHTML = '<div class="gl">' + rules.map(r => { const w = G.WEAPONS[r.w]; return w ? `<div class="gi"><i>${w.icon}</i><b>${G.fmt(r.min)}</b><s>xu</s></div>` : ''; }).join('') + '</div>' +
      `<div class="gt"><span>Gõ <b style="color:${TM[0].light}">1</b>/<b style="color:${TM[0].light}">xanh</b> · <b style="color:${TM[1].light}">2</b>/<b style="color:${TM[1].light}">đỏ</b>${S.tc > 2 ? ` · <b style="color:${TM[2].light}">3</b> · <b style="color:${TM[3].light}">4</b>` : ''} để chọn đội</span><span>👆 Chạm màn hình = triệu hồi lính</span></div>`;
  };

  let lastHud = 0, segs = [], chipsKey = '';
  ui.update = function (now) {
    if (now - lastHud < 180) return; lastHud = now;
    if (!S.teams.length) return;
    const bar = $('bar');
    if (segs.length !== S.tc) { bar.innerHTML = S.teams.map((t, i) => `<div class="seg" style="background:linear-gradient(#fff3 0,#0000 60%),${TM[i].color}"><span></span></div>`).join(''); segs = [...bar.children]; }
    S.teams.forEach((t, i) => { segs[i].style.flexGrow = Math.max(0.0001, t.pct); segs[i].firstChild.textContent = Math.round(t.pct * 100) + '%'; segs[i].firstChild.style.opacity = t.pct > 0.06 ? 1 : 0; });
    const tm = $('timer'), ph = S.phase;
    tm.textContent = ph === 'battle' ? fmtT(S.battleT) : ph === 'lobby' ? fmtT(S.phaseT) : ph === 'countdown' ? fmtT(G.settings.matchSec) : '🏁';
    tm.className = ph === 'battle' && S.battleT < 15 ? 'urgent' : '';
    $('phase').textContent = ph === 'lobby' ? 'CHỌN ĐỘI' : ph === 'battle' ? S.map.name.toUpperCase() : ph === 'result' ? 'KẾT THÚC' : 'SẴN SÀNG';
    // chip đội
    const nPl = S.teams.map((t, i) => { let n = 0; S.players.forEach(p => { if (p.team === i) n++; }); return n; });
    $('chips').innerHTML = S.teams.map((t, i) => `<div class="chip ${t.alive ? '' : 'dead'}" style="--c:${TM[i].color};--l:${TM[i].light}"><b>${t.alive ? '' : '☠ '}${TM[i].name}</b><span>🪙 ${G.fmt(t.coins)}</span><span>⚔ ${t.units + t.structs}</span><span>👥 ${nPl[i]}</span></div>`).join('');
    // top donors
    const top = [...S.players.values()].filter(p => p.mc > 0).sort((a, b) => b.mc - a.mc).slice(0, 5);
    $('donors').innerHTML = top.length ? top.map((p, i) => `<div class="dn" style="--c:${p.team >= 0 ? TM[p.team].color : '#888'}"><em>${['🥇', '🥈', '🥉', '4', '5'][i]}</em><span>${G.esc(p.name.slice(0, 9))}</span><b>${G.fmt(p.mc)}</b></div>`).join('') : '<div class="dn empty">🎁 Thả quà để lên TOP xu của trận!</div>';
    // lobby box
    const lb = $('lobbyBox');
    if (ph === 'lobby') {
      lb.className = 'show'; const lines = S.teams.map((t, i) => `<div class="lt" style="--c:${TM[i].color}"><b>${i + 1}</b> ${TM[i].name}<small>${nPl[i]} người</small></div>`).join('');
      lb.innerHTML = `<h2>⚔️ CHỌN ĐỘI</h2><p>Bình luận số hoặc tên màu</p><div class="lts">${lines}</div><p class="mp">🗺️ ${G.esc(S.map.name)} — ${G.esc(S.map.desc)}</p><div class="cd">${fmtT(S.phaseT)}</div>`;
      lb.style.top = G.layout.safe ? Math.round(G.layout.cy - lb.offsetHeight / 2) + 'px' : '';
    } else lb.className = '';
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
    const t = TM[p.team] || TM[0], el = document.createElement('div'); el.className = 'gift'; el.style.setProperty('--c', t.color);
    el.innerHTML = `<i>${w.icon}</i><div><small>${G.esc(p.name)} triệu hồi</small><b>${w.name}${n > 1 ? ' ×' + n : ''}${lvl > 1 ? ' Lv' + lvl : ''}</b></div><em>${G.fmt(total)} xu</em>`;
    const host = $('banners'); host.appendChild(el); setTimeout(() => el.classList.add('out'), 2300); setTimeout(() => el.remove(), 2800);
    while (host.children.length > 4) host.removeChild(host.firstChild);
  };
  ui.entrance = function (p, rank) {
    const e = document.createElement('div'), cls = rank === 1 ? 'r1' : rank <= 3 ? 'r3' : 'r10', b = G.board[p.id];
    e.className = 'ent ' + cls;
    e.innerHTML = `<div class="glow"></div>${rank <= 3 ? '<div class="crown">' + (rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉') + '</div>' : ''}${G.avatar(p.name, 'big')}<div class="tx"><small>TOP ${rank} BẢNG XẾP HẠNG</small><b>${G.esc(p.name)}</b><span>🪙 ${G.fmt(b ? b.c : 0)} xu · 🏆 ${b ? b.w : 0} thắng</span></div>`;
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
      <div class="rb">${res.teams.map(x => `<div style="flex-grow:${Math.max(0.001, x.pct)};background:${TM[x.id].color}">${Math.round(x.pct * 100)}%</div>`).join('')}</div>
      ${mvp ? `<div class="mvp"><div class="crown">👑</div>${G.avatar(mvp.name, 'big')}<div><small>MVP — NHIỀU XU NHẤT</small><b>${G.esc(mvp.name)}</b><span>🪙 ${G.fmt(mvp.mc)} xu</span></div></div>` : ''}
      <div class="cols"><div><h4>TOP XU TRẬN NÀY</h4>${res.top.slice(0, 5).map((p, i) => `<div class="row" style="--c:${p.team >= 0 ? TM[p.team].color : '#888'}"><em>${medal(i)}</em><span>${G.esc(p.name)}</span><b>${G.fmt(p.mc)}</b></div>`).join('') || '<div class="row"><span>Chưa có ai tặng quà</span></div>'}</div>
      <div><h4>BẢNG XẾP HẠNG TỔNG</h4>${res.board.slice(0, 10).map((p, i) => `<div class="row ${p.delta > 0 || p.isNew ? 'up' : ''}"><em>${medal(i)}</em><span>${G.esc(p.n)}</span><b>${G.fmt(p.c)}</b><i>${p.isNew ? '🆕' : p.delta > 0 ? '▲' + p.delta : p.delta < 0 ? '▼' + -p.delta : '–'}</i></div>`).join('') || '<div class="row"><span>Trống</span></div>'}</div></div>
      <div class="rn">Trận mới sau ${G.settings.resultSec}s…</div></div>`;
    el.className = 'show';
    const rc = el.firstElementChild;
    if (rc) { rc.style.zoom = ''; const avail = G.layout.safeH - 20, h = rc.offsetHeight; if (h > avail) rc.style.zoom = (avail / h).toFixed(3); }
  };
})();
