/* ===== Lõi game: trạng thái, AI, chiến đấu, vũ khí, sự kiện từ TikTok ===== */
(function () {
  'use strict';
  const G = window.G, T = G.T, COLS = G.COLS, ROWS = G.ROWS, W = G.W, H = G.H, WP = G.WEAPONS;
  const rnd = Math.random, hyp = Math.hypot, PI2 = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ui = (fn, ...a) => { try { if (G.ui && G.ui[fn]) G.ui[fn](...a); } catch (e) { console.error(fn, e); } };

  const S = (G.S = {
    phase: 'lobby', phaseT: 0, battleT: 0, time: 0, frame: 0, winner: -1, map: null, tc: 2, uid: 1,
    teams: [], bases: [], units: [], structs: [], projs: [], bombs: [], airs: [], nukes: [], crates: [], parts: [],
    wall: new Uint8Array(COLS * ROWS), owner: new Uint8Array(COLS * ROWS), dirty: [], tilesAll: true, flow: [],
    players: new Map(), seen: new Set(), spawnQ: [], spawnAcc: 0, shake: 0, flash: 0, flashColor: '#fff', slow: 1,
    crateT: 10, result: null, rankBefore: null, mapIdx: 0, lastCount: 0, kills: 0,
  });

  /* ---------------- hash không gian ---------------- */
  const HS = 60, HC = Math.ceil(W / HS), HR = Math.ceil(H / HS);
  const hash = Array.from({ length: HC * HR }, () => []);
  function rebuildHash() {
    for (let i = 0; i < hash.length; i++) hash[i].length = 0;
    const add = e => { if (e.dead) return; hash[clamp(e.y / HS | 0, 0, HR - 1) * HC + clamp(e.x / HS | 0, 0, HC - 1)].push(e); };
    S.units.forEach(add); S.structs.forEach(add); S.bases.forEach(add);
  }
  function nearestEnemy(x, y, team, range) {
    let best = null, bd = 1e9;
    const c0 = clamp((x - range - 30) / HS | 0, 0, HC - 1), c1 = clamp((x + range + 30) / HS | 0, 0, HC - 1);
    const r0 = clamp((y - range - 30) / HS | 0, 0, HR - 1), r1 = clamp((y + range + 30) / HS | 0, 0, HR - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const b = hash[r * HC + c];
      for (let i = 0; i < b.length; i++) {
        const e = b[i]; if (e.team === team || e.dead || e.cloak) continue;
        const d = hyp(e.x - x, e.y - y) - e.r;
        if (d < bd && d <= range) { bd = d; best = e; }
      }
    }
    return best;
  }
  function eachEnemyIn(x, y, rad, team, fn) {
    const c0 = clamp((x - rad - 30) / HS | 0, 0, HC - 1), c1 = clamp((x + rad + 30) / HS | 0, 0, HC - 1);
    const r0 = clamp((y - rad - 30) / HS | 0, 0, HR - 1), r1 = clamp((y + rad + 30) / HS | 0, 0, HR - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const b = hash[r * HC + c];
      for (let i = 0; i < b.length; i++) { const e = b[i]; if (e.team === team || e.dead) continue; const d = hyp(e.x - x, e.y - y) - e.r * 0.6; if (d <= rad) fn(e, d); }
    }
  }

  /* ---------------- FX (hạt, vòng, chữ nổi) ---------------- */
  const fx = (G.fx = {
    cap() { return [700, 380, 160][G.q ? G.q.level : 0]; },
    burst(x, y, color, n, spd, life, size, g) {
      const q = G.q ? G.q.pm : 1; n = Math.ceil(n * q);
      for (let i = 0; i < n && S.parts.length < fx.cap(); i++) {
        const a = rnd() * PI2, s = spd * (0.3 + rnd() * 0.7);
        S.parts.push({ k: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: life * (0.6 + rnd() * 0.6), m: life, s: size * (0.6 + rnd() * 0.8), c: color, g: g || 0 });
      }
    },
    ring(x, y, r, color, life, w) { if (S.parts.length < fx.cap() + 60) S.parts.push({ k: 1, x, y, vx: 0, vy: 0, l: life || 0.4, m: life || 0.4, s: r, c: color, w: w || 3 }); },
    text(x, y, txt, color, size, life) { if (S.parts.length < fx.cap() + 60) S.parts.push({ k: 2, x, y, vx: 0, vy: -38, l: life || 0.8, m: life || 0.8, s: size || 14, c: color, t: txt }); },
    shake(v) { if (G.settings.shake) S.shake = Math.min(1.2, Math.max(S.shake, v)); },
    flash(c, v) { S.flash = v; S.flashColor = c; },
  });

  /* ---------------- ô đất ---------------- */
  const blocked = (x, y) => x < 3 || y < 3 || x > W - 3 || y > H - 3 || S.wall[(y / T | 0) * COLS + (x / T | 0)] !== 0;
  function lineClear(x1, y1, x2, y2, rockOnly) {
    const d = hyp(x2 - x1, y2 - y1), n = Math.ceil(d / 14);
    for (let i = 1; i < n; i++) {
      const t = i / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, w = S.wall[(y / T | 0) * COLS + (x / T | 0)];
      if (rockOnly ? w === 1 : w !== 0) return false;
    }
    return true;
  }
  function paint(x, y, team, R) {
    const cx = x / T | 0, cy = y / T | 0, k = Math.ceil(R); let ch = 0;
    for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
      if (dx * dx + dy * dy > R * R + 0.01) continue;
      const c = cx + dx, r = cy + dy; if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const i = r * COLS + c; if (S.wall[i] !== 0) continue;
      const o = S.owner[i]; if (o === team) continue;
      if (o < 4) S.teams[o].tiles--; S.owner[i] = team; S.teams[team].tiles++; S.dirty.push(i); ch++;
    }
    return ch;
  }
  G.paint = paint;

  /* ---------------- luồng di chuyển (BFS tới căn cứ địch) ---------------- */
  function computeFlow() {
    for (let t = 0; t < S.tc; t++) {
      const f = S.flow[t] = new Int16Array(COLS * ROWS).fill(9999), q = [];
      for (let i = 0; i < f.length; i++) if (S.wall[i] !== 0) f[i] = -1;
      for (const b of S.bases) {
        if (b.team === t || b.dead) continue;
        const bc = b.x / T | 0, br = b.y / T | 0;
        for (let r = br - 2; r <= br + 2; r++) for (let c = bc - 2; c <= bc + 2; c++) {
          if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue; const i = r * COLS + c;
          if (f[i] === 9999) { f[i] = 0; q.push(i); }
        }
      }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], c = i % COLS, r = (i / COLS) | 0, v = f[i] + 1;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue; const nc = c + dc, nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
          const n = nr * COLS + nc; if (f[n] !== 9999) continue;
          if (dc && dr && (S.wall[r * COLS + nc] || S.wall[nr * COLS + c])) continue;
          f[n] = v; q.push(n);
        }
      }
    }
  }
  const NB = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  function flowStep(u) {
    const f = S.flow[u.team]; if (!f) return null;
    const c = u.x / T | 0, r = u.y / T | 0, cur = f[r * COLS + c];
    if (cur <= 0) return null;
    let best = cur, bx = 0, by = 0;
    for (let k = 0; k < 8; k++) {
      const [dc, dr] = NB[(k + u.nOff) & 7], nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const v = f[nr * COLS + nc]; if (v < 0 || v >= best) continue;
      if (dc && dr && (S.wall[r * COLS + nc] || S.wall[nr * COLS + c])) continue;
      best = v; bx = nc * T + T / 2 - u.x; by = nr * T + T / 2 - u.y;
    }
    if (best === cur) return null;
    const d = hyp(bx, by) || 1; return [bx / d, by / d];
  }

  /* ---------------- người chơi ---------------- */
  function getPlayer(user) {
    let p = S.players.get(user.id);
    if (!p) { p = { id: user.id, name: user.name || user.id, team: -1, mc: 0, kills: 0, summons: 0, lastSwitch: 0, likeAcc: 0, tok: 6, tokT: 0 }; S.players.set(user.id, p); }
    if (user.name) p.name = user.name;
    return p;
  }
  function teamPlayers(t) { let n = 0; S.players.forEach(p => { if (p.team === t) n++; }); return n; }
  function autoTeam(p) {
    let best = 0, bn = 1e9;
    for (let t = 0; t < S.tc; t++) { if (!S.teams[t].alive) continue; const n = teamPlayers(t) + rnd() * 0.5; if (n < bn) { bn = n; best = t; } }
    p.team = best; return best;
  }
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function parseTeamCmd(text) {
    if (!text || text.length > 24) return -1;
    const s = norm(text); if (!s) return -1;
    const m = /^(?:team |doi |chon |join )?([1-4])$/.exec(s); if (m) return +m[1] - 1;
    const w = s.replace(/^(team|doi|chon|join|vao|phe) /, '');
    if (/^xanh (la|la cay)$/.test(w) || w === 'green' || w === 'la') return 2;
    if (w === 'xanh' || w === 'xanh duong' || w === 'blue' || w === 'duong') return 0;
    if (w === 'do' || w === 'red') return 1;
    if (w === 'vang' || w === 'yellow') return 3;
    return -1;
  }
  G.parseTeamCmd = parseTeamCmd;

  function touch(p) {
    if (S.seen.has(p.id)) return; S.seen.add(p.id);
    if (!G.settings.entrance) return;
    const rank = G.rankOf(p.id);
    if (rank > 0 && rank <= 10) {
      ui('entrance', p, rank);
      G.audio.play('top10', rank);
      fx.burst(G.W / 2, 200, rank === 1 ? '#ffd24a' : '#9ad0ff', 40, 260, 1.1, 4, 60);
    }
  }

  function setTeam(p, t, silent) {
    if (t >= S.tc || !S.teams[t] || !S.teams[t].alive) return false;
    if (p.team === t) return false;
    if (p.team >= 0) {
      if (G.settings.lockTeamAfterGift && p.mc > 0 && S.phase !== 'lobby') return false;
      if (S.time - p.lastSwitch < 20 && S.phase === 'battle') return false;
    }
    p.team = t; p.lastSwitch = S.time;
    if (!silent && S.time - (S.lastJoinMsg || 0) > 0.7) { S.lastJoinMsg = S.time; ui('feed', `<b style="color:${G.TEAMS[t].light}">${G.esc(p.name)}</b> vào <b style="color:${G.TEAMS[t].color}">ĐỘI ${G.TEAMS[t].name}</b>`, G.TEAMS[t].color); G.audio.play('join'); }
    return true;
  }

  /* ---------------- sự kiện từ TikTok ---------------- */
  G.onChat = function (user, text) {
    const p = getPlayer(user); touch(p);
    const t = parseTeamCmd(text);
    if (t >= 0 && t < S.tc) setTeam(p, t);
  };
  G.onJoin = function (user) { const p = getPlayer(user); touch(p); };
  G.onLike = function (user, count) {
    const p = getPlayer(user); touch(p);
    if (!G.settings.tapEnabled || S.phase === 'result') return;
    p.likeAcc += count || 1;
    let k = Math.floor(p.likeAcc / G.settings.likesPerSoldier); if (k <= 0) return;
    p.likeAcc -= k * G.settings.likesPerSoldier;
    const now = performance.now(); p.tok = Math.min(6, p.tok + (p.tokT ? (now - p.tokT) / 1000 * 3 : 0)); p.tokT = now;
    k = Math.min(k, Math.floor(p.tok)); if (k <= 0 || S.spawnQ.length > 160) return; p.tok -= k;
    if (p.team < 0) { autoTeam(p); }
    for (let i = 0; i < k; i++) S.spawnQ.push({ t: p.team, w: 'soldier', l: 1, p, tap: 1 });
  };
  function pickRule(name, diamonds) {
    const nr = (G.settings.nameRules || '').split('\n');
    const nn = (name || '').toLowerCase().trim();
    for (const line of nr) {
      const m = /^\s*(.+?)\s*=\s*(\w+)\s*(?:\*\s*(\d+))?\s*$/.exec(line);
      if (m && m[1].toLowerCase() === nn && WP[m[2]]) return { w: m[2], n: +(m[3] || 1) };
    }
    const rules = G.settings.rules.slice().sort((a, b) => b.min - a.min);
    for (const r of rules) if (diamonds >= r.min && WP[r.w]) return r;
    return null;
  }
  G.onGift = function (user, giftName, diamonds, count) {
    count = Math.max(1, count | 0); diamonds = Math.max(0, +diamonds || 0);
    const p = getPlayer(user); touch(p);
    if (diamonds < 1) return;
    if (p.team < 0) autoTeam(p);
    const total = diamonds * count, t = p.team;
    if (!S.teams[t] || !S.teams[t].alive) { setTeam(p, S.teams.findIndex(x => x.alive), true); }
    const rule = pickRule(giftName, diamonds); if (!rule) return;
    const w = WP[rule.w]; p.mc += total; p.summons += 1;
    S.teams[p.team].coins += total; G.addBoard(p.id, p.name, total, 0);
    let n = rule.n * count, lvl = 1; const cap = Math.min(w.cap || 10, G.settings.giftCap);
    if (n > cap) { lvl = Math.min(9, 1 + Math.ceil(Math.log2(n / cap + 1))); n = cap; }
    if (w.kind !== 'unit') lvl = Math.min(9, lvl + Math.floor(total / 3000));
    for (let i = 0; i < n; i++) S.spawnQ.push({ t: p.team, w: rule.w, l: lvl, p });
    const tm = G.TEAMS[p.team];
    ui('feed', `<b style="color:${tm.light}">${G.esc(p.name)}</b> ${G.esc(giftName || 'quà')} ×${count} → <b>${w.icon} ${w.name}${n > 1 ? ' ×' + n : ''}${lvl > 1 ? ' Lv' + lvl : ''}</b>`, tm.color);
    if (total >= 99 || w.kind !== 'unit') { ui('gift', p, w, n, total, lvl); G.audio.play('big'); }
  };
  G.testSpawn = function (team, key, n, lvl) { for (let i = 0; i < (n || 1); i++) S.spawnQ.push({ t: team, w: key, l: lvl || 1, p: null }); };

  /* ---------------- tạo lính / công trình / đòn đặc biệt ---------------- */
  function statLvl(l) { return { hp: 1 + 0.35 * (l - 1), dmg: 1 + 0.25 * (l - 1), sz: 1 + 0.045 * (l - 1) }; }
  function addUnit(team, key, lvl, p, pos) {
    const tm = S.teams[team], d = WP[key], b = tm.base, s = statLvl(lvl);
    if (tm.units >= G.settings.maxUnits) { levelUp(team, key); return null; }
    let x = b.x, y = b.y; const en = S.bases.find(o => o.team !== team && !o.dead) || b, a0 = Math.atan2(en.y - b.y, en.x - b.x);
    if (pos) { x = pos.x; y = pos.y; } else for (let k = 0; k < 8; k++) {
      const a = a0 + (rnd() - 0.5) * 2.6, rr = b.r + 6 + rnd() * 16; x = b.x + Math.cos(a) * rr; y = b.y + Math.sin(a) * rr;
      if (!blocked(x, y)) break; x = b.x; y = b.y;
    }
    const u = {
      id: S.uid++, kind: key, d, team, x, y, hp: d.hp * s.hp, mhp: d.hp * s.hp, lvl, dmg: d.dmg * s.dmg, spd: d.spd * (0.9 + rnd() * 0.2), range: d.range, sight: d.sight,
      r: d.r * s.sz, cd: rnd() * 0.5, rt: rnd() * 0.3, tg: null, ang: a0, p: p || null, dead: false, nOff: (rnd() * 8) | 0, lane: rnd() * 2 - 1, t: rnd() * 6, hit: 0, chase: false, atkOk: false, pc: 0, lastTile: -1, bob: rnd() * 6, moving: false,
    };
    S.units.push(u); tm.units++;
    fx.ring(x, y, 14, G.TEAMS[team].light, 0.3, 2); G.audio.play('spawn');
    return u;
  }
  function levelUp(team, key) {
    let best = null;
    for (const u of S.units) { if (u.dead || u.team !== team || u.lvl >= 9) continue; if (!best || (u.kind === key && best.kind !== key) || (u.kind === key) === (best.kind === key) && u.lvl < best.lvl) best = u; }
    if (!best) return; best.lvl++; const s = statLvl(best.lvl);
    best.mhp = best.d.hp * s.hp; best.hp = best.mhp; best.dmg = best.d.dmg * s.dmg; best.r = best.d.r * s.sz;
    fx.ring(best.x, best.y, 22, '#ffe066', 0.5, 3); fx.burst(best.x, best.y, '#ffe066', 8, 90, 0.5, 2.5); fx.text(best.x, best.y - 14, 'LV' + best.lvl, '#ffe066', 13, 0.9);
  }
  function pickSpot(team, minFromEnemy) {
    const tm = S.teams[team], en = S.bases.filter(b => b.team !== team && !b.dead); let best = null, bs = 1e9;
    for (let k = 0; k < 40; k++) {
      const c = (rnd() * COLS) | 0, r = (rnd() * ROWS) | 0, i = r * COLS + c;
      if (S.owner[i] !== team || S.wall[i] !== 0) continue;
      const x = c * T + T / 2, y = r * T + T / 2; let dm = 1e9; for (const b of en) dm = Math.min(dm, hyp(b.x - x, b.y - y));
      if (dm < minFromEnemy || hyp(tm.base.x - x, tm.base.y - y) < 60) continue;
      let ok = true; for (const s of S.structs) if (!s.dead && hyp(s.x - x, s.y - y) < 46) { ok = false; break; }
      if (ok && dm < bs) { bs = dm; best = { x, y }; }
    }
    if (!best) { const b = tm.base, a = rnd() * PI2; best = { x: clamp(b.x + Math.cos(a) * 80, 20, W - 20), y: clamp(b.y + Math.sin(a) * 80, 20, H - 20) }; }
    return best;
  }
  function addStruct(team, key, lvl, p) {
    const d = WP[key], sp = pickSpot(team, 140), s = statLvl(lvl);
    const e = { id: S.uid++, st: d.st, d, team, x: sp.x, y: sp.y, hp: d.hp * s.hp, mhp: d.hp * s.hp, r: d.r, cd: 0.5, life: d.life + (lvl - 1) * 4, mlife: d.life + (lvl - 1) * 4, ang: 0, p: p || null, dead: false, lvl, dmg: (d.dmg || 0) * s.dmg, sp: 0, t: 0, hit: 0, beamLen: 0, a0: 0, spawnT: 1.5, struct: true };
    if (key === 'laser') {
      const en = S.bases.find(b => b.team !== team && !b.dead) || S.teams[team].base; e.a0 = Math.atan2(en.y - e.y, en.x - e.x); e.ang = e.a0;
    }
    S.structs.push(e); S.teams[team].structs++;
    paint(sp.x, sp.y, team, key === 'fortress' ? 3.2 : 2); fx.ring(sp.x, sp.y, 40, G.TEAMS[team].light, 0.5, 4); fx.burst(sp.x, sp.y, G.TEAMS[team].light, 18, 150, 0.6, 3.5);
    fx.shake(0.25); G.audio.play(key === 'laser' ? 'laserOn' : 'place');
  }
  function addDragon(team, lvl, p) {
    const b = S.teams[team].base, en = S.bases.filter(o => o.team !== team && !o.dead); if (!en.length) return;
    const e = en[(rnd() * en.length) | 0], a = Math.atan2(e.y - b.y, e.x - b.x), px = -Math.sin(a), py = Math.cos(a), off = (rnd() - 0.5) * 260;
    S.airs.push({ id: S.uid++, x: b.x + px * off, y: b.y + py * off, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, ang: a, team, p: p || null, life: 8, bt: 0.2, dmg: 46 * statLvl(lvl).dmg, t: 0, lvl, dead: false });
    G.audio.play('dragon'); fx.shake(0.15);
  }
  function addNuke(team, lvl, p) {
    let tx = 0, ty = 0, bs = -1; const cell = new Map();
    const add = (e, w) => { if (e.team === team || e.dead) return; const k = (e.y / 90 | 0) * 100 + (e.x / 90 | 0); const c = cell.get(k) || { s: 0, x: 0, y: 0, n: 0 }; c.s += w; c.x += e.x; c.y += e.y; c.n++; cell.set(k, c); };
    S.units.forEach(u => add(u, 1)); S.structs.forEach(u => add(u, 3)); S.bases.forEach(u => add(u, 9));
    cell.forEach(c => { const sc = c.s + rnd() * 2; if (sc > bs) { bs = sc; tx = c.x / c.n; ty = c.y / c.n; } });
    if (bs < 0) { const e = S.bases.find(b => b.team !== team && !b.dead); if (!e) return; tx = e.x; ty = e.y; }
    S.nukes.push({ x: clamp(tx, 40, W - 40), y: clamp(ty, 40, H - 40), t: 1.9, m: 1.9, team, p: p || null, rad: 165 + 12 * (lvl - 1), lvl, dead: false });
    G.audio.play('nukeWarn');
  }
  function execSpawn(q) {
    const tm = S.teams[q.t]; if (!tm || !tm.alive) return;
    const d = WP[q.w]; if (!d) return;
    if (d.kind === 'unit') addUnit(q.t, q.w, q.l, q.p);
    else if (d.kind === 'struct') addStruct(q.t, q.w, q.l, q.p);
    else if (d.sp === 'dragon') addDragon(q.t, q.l, q.p);
    else if (d.sp === 'nuke') addNuke(q.t, q.l, q.p);
  }

  /* ---------------- chiến đấu ---------------- */
  function damage(e, amt, src) {
    if (e.dead || amt <= 0) return;
    e.hp -= amt; e.hit = 0.1;
    if (G.settings.dmgNumbers && G.q && G.q.dmg && (amt >= 14 || rnd() < 0.12)) fx.text(e.x + (rnd() - 0.5) * 10, e.y - e.r - 4, Math.round(amt), '#fff', amt > 60 ? 17 : 12, 0.6);
    if (e.hp <= 0) kill(e, src);
  }
  function kill(e, src) {
    if (e.dead) return; e.dead = true; const tm = S.teams[e.team];
    if (src && src.p) src.p.kills++;
    if (e.isBase) { baseDown(e); return; }
    if (e.struct) {
      tm.structs--; fx.burst(e.x, e.y, '#ffb347', 22, 190, 0.7, 4, 50); fx.burst(e.x, e.y, '#444', 10, 110, 0.9, 5); fx.ring(e.x, e.y, 50, '#ffb347', 0.4, 4); G.audio.play('boom', 0.5); fx.shake(0.2);
    } else {
      tm.units--; fx.burst(e.x, e.y, G.TEAMS[e.team].color, 9, 120, 0.5, 3, 80); G.audio.play('die');
    }
  }
  function splashAt(x, y, rad, dmg, team, src) {
    eachEnemyIn(x, y, rad, team, (e, d) => damage(e, dmg * (1 - 0.55 * d / rad), src));
  }
  function fire(src, tg, kind, dmg, splash, spd, paintR) {
    if (S.projs.length > 420) return;
    S.projs.push({ x: src.x, y: src.y - (src.struct ? 0 : 3), tg, tx: tg.x, ty: tg.y, kind, spd, dmg, splash: splash || 0, team: src.team, src, pr: paintR || 0, life: 3, ang: 0 });
  }
  function attack(u, tg) {
    const d = u.d; u.cd = d.cd * (0.9 + rnd() * 0.2);
    if (!d.proj) {
      damage(tg, u.dmg, u); fx.burst((u.x + tg.x) / 2, (u.y + tg.y) / 2, '#fff', 3, 80, 0.2, 2); u.slash = 0.18; G.audio.play('sword');
    } else {
      fire(u, tg, d.proj, u.dmg, d.splash, d.pspd, d.proj === 'shell' ? 1 : 0); G.audio.play(d.proj);
    }
  }
  function updateUnit(u, dt) {
    u.t += dt; u.cd -= dt; u.rt -= dt; if (u.hit > 0) u.hit -= dt; if (u.slash > 0) u.slash -= dt;
    if (u.doom) { u.hp -= dt * 90; if (u.hp <= 0) kill(u, null); return; }
    let tg = u.tg;
    if (u.rt <= 0 || !tg || tg.dead) {
      tg = u.tg = nearestEnemy(u.x, u.y, u.team, u.sight); u.rt = 0.25 + rnd() * 0.2;
      if (tg) { u.chase = lineClear(u.x, u.y, tg.x, tg.y, false); u.atkOk = lineClear(u.x, u.y, tg.x, tg.y, true); }
    }
    let mx = 0, my = 0; u.moving = false;
    if (tg) {
      const dx = tg.x - u.x, dy = tg.y - u.y, dist = hyp(dx, dy) || 1;
      u.ang = Math.atan2(dy, dx);
      if (dist - tg.r <= u.range && u.atkOk) { if (u.cd <= 0) attack(u, tg); }
      else if (u.chase) { mx = dx / dist; my = dy / dist; }
      else { const f = flowStep(u); if (f) { mx = f[0]; my = f[1]; } }
    } else {
      const f = flowStep(u);
      if (f) { mx = f[0]; my = f[1]; }
      else { const en = S.bases.find(b => b.team !== u.team && !b.dead); if (en) { const dx = en.x - u.x, dy = en.y - u.y, d = hyp(dx, dy) || 1; mx = dx / d; my = dy / d; } }
      if (mx || my) u.ang = Math.atan2(my, mx);
    }
    if (mx || my) {
      const px = -my, py = mx, lw = u.lane * 0.3 + Math.sin(u.t * 1.3 + u.bob) * 0.18;
      mx += px * lw; my += py * lw; const l = hyp(mx, my) || 1; mx /= l; my /= l;
      const s = u.spd * dt * (u.d.kind === 'unit' ? 1 : 0), rr = Math.min(u.r, 10) * 0.7;
      const nx = u.x + mx * s, ny = u.y + my * s;
      if (!blocked(nx + Math.sign(mx) * rr, u.y)) u.x = nx;
      if (!blocked(u.x, ny + Math.sign(my) * rr)) u.y = ny;
      u.moving = true;
    }
    // đẩy nhau + tránh căn cứ
    if (((S.frame + u.id) & 1) === 0) {
      let px = 0, py = 0;
      const c0 = clamp((u.x - 20) / HS | 0, 0, HC - 1), c1 = clamp((u.x + 20) / HS | 0, 0, HC - 1), r0 = clamp((u.y - 20) / HS | 0, 0, HR - 1), r1 = clamp((u.y + 20) / HS | 0, 0, HR - 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const b = hash[r * HC + c];
        for (let i = 0; i < b.length; i++) {
          const e = b[i]; if (e === u) continue; const dx = u.x - e.x, dy = u.y - e.y, m = u.r + e.r - (e.isBase || e.struct ? 2 : 4), d2 = dx * dx + dy * dy;
          if (d2 < m * m && d2 > 0.01) { const d = Math.sqrt(d2), f = (m - d) * (e.isBase || e.struct ? 0.5 : 0.28); px += dx / d * f; py += dy / d * f; }
        }
      }
      if (px || py) { if (!blocked(u.x + px, u.y)) u.x += px; if (!blocked(u.x, u.y + py)) u.y += py; }
    }
    // tô đất
    const ti = (u.y / T | 0) * COLS + (u.x / T | 0);
    if (ti !== u.lastTile || (u.pc -= dt) <= 0) {
      u.lastTile = ti; u.pc = 0.4;
      if (paint(u.x, u.y, u.team, u.d.paint) > 2 && rnd() < 0.2) G.audio.play('capture');
    }
    // rương
    for (const c of S.crates) if (!c.dead && Math.abs(c.x - u.x) < 22 && Math.abs(c.y - u.y) < 22) collectCrate(c, u.team);
  }
  function updateStruct(s, dt) {
    s.t += dt; s.life -= dt; s.cd -= dt; if (s.hit > 0) s.hit -= dt;
    if (s.life <= 0) { s.dead = true; S.teams[s.team].structs--; fx.burst(s.x, s.y, '#fff', 10, 100, 0.5, 3); return; }
    if (s.st === 'cannon' || s.st === 'fortress') {
      const tg = nearestEnemy(s.x, s.y, s.team, s.d.range);
      if (tg) {
        s.ang = Math.atan2(tg.y - s.y, tg.x - s.x);
        if (s.cd <= 0) { s.cd = s.d.cd; fire(s, tg, s.st === 'cannon' ? 'shell' : 'arrow', s.dmg, s.d.splash, s.st === 'cannon' ? 320 : 400, s.st === 'cannon' ? 1 : 0); G.audio.play(s.st === 'cannon' ? 'shell' : 'arrow'); s.recoil = 0.12; }
      }
      if (s.st === 'fortress' && (s.spawnT -= dt) <= 0) { s.spawnT = 2.2; if (S.teams[s.team].units < G.settings.maxUnits) addUnit(s.team, 'soldier', Math.max(1, s.lvl), s.p, { x: s.x + (rnd() - 0.5) * 30, y: s.y + 26 * Math.sign(S.teams[s.team].base.y < H / 2 ? 1 : -1) }); }
      if (s.recoil > 0) s.recoil -= dt;
    } else if (s.st === 'laser') {
      // quét qua lại ±38° quanh hướng căn cứ địch
      const en = S.bases.filter(b => b.team !== s.team && !b.dead); if (en.length) { let m = en[0], md = 1e9; for (const b of en) { const d = hyp(b.x - s.x, b.y - s.y); if (d < md) { md = d; m = b; } } s.a0 = Math.atan2(m.y - s.y, m.x - s.x); }
      s.ang = s.a0 + Math.sin(s.t * 1.1) * 0.66;
      const dx = Math.cos(s.ang), dy = Math.sin(s.ang); let len = 0;
      while (len < 1100) { const x = s.x + dx * len, y = s.y + dy * len; if (x < 0 || y < 0 || x > W || y > H || S.wall[(y / T | 0) * COLS + (x / T | 0)] === 1) break; len += 10; }
      s.beamLen = len;
      if ((s.sp -= dt) <= 0) {
        s.sp = 0.09;
        for (let d = 20; d <= len; d += 16) paint(s.x + dx * d, s.y + dy * d, s.team, 0.5);
        if (rnd() < 0.3) G.audio.play('laser');
      }
      const dps = 95 * statLvl(s.lvl).dmg * dt;
      const hitSeg = e => { if (e.team === s.team || e.dead) return; const ex = e.x - s.x, ey = e.y - s.y, pr = ex * dx + ey * dy; if (pr < 0 || pr > len) return; if (Math.abs(ex * dy - ey * dx) < e.r + 9) { damage(e, dps, s); if (rnd() < 0.15) fx.burst(e.x, e.y, '#bff', 3, 90, 0.3, 2); } };
      S.units.forEach(hitSeg); S.structs.forEach(hitSeg); S.bases.forEach(hitSeg);
    }
  }
  function updateBase(b, dt) {
    b.cd -= dt; if (b.hit > 0) b.hit -= dt;
    const tg = nearestEnemy(b.x, b.y, b.team, 250);
    if (tg) { b.ang = Math.atan2(tg.y - b.y, tg.x - b.x); if (b.cd <= 0) { b.cd = 0.55; fire(b, tg, 'arrow', 11, 0, 420, 0); G.audio.play('arrow'); } }
  }
  function updateProj(p, dt) {
    p.life -= dt; if (p.tg && !p.tg.dead) { p.tx = p.tg.x; p.ty = p.tg.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = hyp(dx, dy), st = p.spd * dt; p.ang = Math.atan2(dy, dx);
    if (d <= st + (p.tg && !p.tg.dead ? p.tg.r * 0.5 : 2) || p.life <= 0) {
      p.dead = true;
      if (p.tg && !p.tg.dead && !p.splash) damage(p.tg, p.dmg, p.src);
      if (p.splash) {
        splashAt(p.tx, p.ty, p.splash, p.dmg, p.team, p.src); fx.burst(p.tx, p.ty, '#ffb347', 9, 130, 0.4, 3, 40); fx.ring(p.tx, p.ty, p.splash * 0.7, '#ffd9a0', 0.25, 2); G.audio.play('boom', 0.2);
        if (p.pr) paint(p.tx, p.ty, p.team, 1.2);
      } else fx.burst(p.tx, p.ty, '#fff', 2, 50, 0.15, 1.5);
      return;
    }
    p.x += dx / d * st; p.y += dy / d * st;
    if (p.kind === 'shell' && (G.q ? G.q.level : 0) < 2 && rnd() < 0.5) S.parts.push({ k: 0, x: p.x, y: p.y, vx: 0, vy: 0, l: 0.25, m: 0.25, s: 3, c: '#ffcf8a', g: 0 });
  }
  function updateAir(a, dt) {
    a.t += dt; a.life -= dt; a.x += a.vx * dt; a.y += a.vy * dt; a.bt -= dt;
    if (a.life <= 0 || a.x < -80 || a.y < -80 || a.x > W + 80 || a.y > H + 80) { a.dead = true; return; }
    if (a.bt <= 0 && a.x > 0 && a.y > 0 && a.x < W && a.y < H) {
      let drop = S.owner[(a.y / T | 0) * COLS + (a.x / T | 0)] !== a.team;
      if (!drop) { const e = nearestEnemy(a.x, a.y, a.team, 90); drop = !!e; }
      if (drop) { a.bt = 0.17; S.bombs.push({ x: a.x + (rnd() - 0.5) * 30, y: a.y + (rnd() - 0.5) * 30, t: 0.45, m: 0.45, team: a.team, dmg: a.dmg, p: a.p, dead: false }); }
      else a.bt = 0.05;
    }
    if (rnd() < 0.5) S.parts.push({ k: 0, x: a.x - a.vx * 0.04, y: a.y - a.vy * 0.04, vx: 0, vy: 0, l: 0.4, m: 0.4, s: 5, c: 'rgba(255,140,60,.8)', g: 0 });
  }
  function updateBomb(b, dt) {
    b.t -= dt; if (b.t > 0) return; b.dead = true;
    splashAt(b.x, b.y, 70, b.dmg, b.team, b); paint(b.x, b.y, b.team, 2.1);
    fx.burst(b.x, b.y, '#ffb347', 12, 170, 0.5, 4, 40); fx.ring(b.x, b.y, 55, '#ffe0a0', 0.3, 3); fx.shake(0.07); G.audio.play('boom', 0.4);
  }
  function updateNuke(n, dt) {
    n.t -= dt; if (n.t > 0) return; n.dead = true;
    const dm = 1 + 0.25 * (n.lvl - 1);
    eachEnemyIn(n.x, n.y, n.rad, n.team, (e, d) => damage(e, (e.isBase ? 1000 : e.struct ? 900 : 650) * dm * (1 - 0.4 * d / n.rad), n));
    paint(n.x, n.y, n.team, n.rad / T);
    fx.burst(n.x, n.y, '#fff3b0', 60, 420, 1.0, 6, 0); fx.burst(n.x, n.y, '#ff8a30', 50, 300, 1.3, 7, -20); fx.burst(n.x, n.y, '#555', 30, 160, 1.6, 8, -30);
    fx.ring(n.x, n.y, n.rad, '#fff', 0.7, 8); fx.ring(n.x, n.y, n.rad * 0.6, '#ffb347', 0.9, 6);
    fx.shake(1.1); fx.flash('#fff', 0.9); G.audio.play('boom', 2.5);
  }
  function collectCrate(c, team) {
    c.dead = true; const tm = G.TEAMS[team], r = rnd(); let msg;
    if (r < 0.3) { for (let i = 0; i < 6; i++) S.spawnQ.push({ t: team, w: 'soldier', l: 1, p: null }); msg = '+6 Lính'; }
    else if (r < 0.55) { for (let i = 0; i < 4; i++) S.spawnQ.push({ t: team, w: 'archer', l: 1, p: null }); msg = '+4 Cung Thủ'; }
    else if (r < 0.75) { S.spawnQ.push({ t: team, w: 'tank', l: 1, p: null }); msg = '+1 Xe Tăng'; }
    else if (r < 0.9) { S.units.forEach(u => { if (u.team === team && !u.dead) { u.hp = u.mhp; } }); msg = 'Hồi máu cả đội'; }
    else { for (let i = 0; i < 4; i++) levelUp(team, 'soldier'); msg = 'Nâng cấp 4 lính'; }
    fx.ring(c.x, c.y, 40, '#ffe066', 0.5, 4); fx.burst(c.x, c.y, '#ffe066', 20, 160, 0.6, 3); G.audio.play('crate');
    ui('feed', `📦 <b style="color:${tm.light}">${tm.name}</b> nhặt rương: ${msg}`, tm.color);
  }
  function baseDown(b) {
    const tm = S.teams[b.team]; tm.alive = false; b.hp = 0;
    fx.burst(b.x, b.y, '#ffb347', 90, 420, 1.3, 7, 40); fx.burst(b.x, b.y, G.TEAMS[b.team].color, 60, 300, 1.2, 6, 60); fx.ring(b.x, b.y, 200, '#fff', 0.8, 8);
    fx.shake(1); fx.flash('#fff', 0.5); G.audio.play('boom', 2.5);
    S.units.forEach(u => { if (u.team === b.team) u.doom = true; });
    ui('feed', `💥 Căn cứ <b style="color:${G.TEAMS[b.team].light}">${G.TEAMS[b.team].name}</b> đã bị phá huỷ!`, '#ff6b6b');
    ui('center', `CĂN CỨ ${G.TEAMS[b.team].name} BỊ PHÁ!`, G.TEAMS[b.team].color, 2200);
    computeFlow();
    const alive = S.teams.filter(t => t.alive);
    if (alive.length <= 1 && S.phase === 'battle') endBattle(alive.length ? alive[0].id : -1);
  }

  /* ---------------- vòng đời trận đấu ---------------- */
  G.newMatch = function () {
    const st = G.settings; S.tc = st.teamCount;
    if (st.rotateMaps && S.matchCount > 0) { S.mapIdx = (S.mapIdx + 1) % G.MAPS.length; st.mapId = G.MAPS[S.mapIdx].id; }
    else S.mapIdx = Math.max(0, G.MAPS.findIndex(m => m.id === st.mapId));
    S.matchCount = (S.matchCount || 0) + 1;
    S.map = G.MAPS[S.mapIdx];
    const m = G.buildMap(S.map.id, S.tc); S.wall.set(m.wall);
    S.units.length = S.structs.length = S.projs.length = S.bombs.length = S.airs.length = S.nukes.length = S.crates.length = S.parts.length = S.spawnQ.length = 0;
    S.teams = []; S.bases = [];
    for (let t = 0; t < S.tc; t++) {
      const [c, r] = m.bases[t];
      const b = { isBase: true, team: t, x: c * T + T / 2, y: r * T + T / 2, r: 40, hp: st.baseHp, mhp: st.baseHp, cd: 1, dead: false, hit: 0, ang: 0 };
      S.bases.push(b); S.teams.push({ id: t, alive: true, base: b, tiles: 0, pct: 0, coins: 0, units: 0, structs: 0, kills: 0, idleT: 1.5 + t * 0.4 });
    }
    // chia đất theo căn cứ gần nhất
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c; if (S.wall[i] !== 0) { S.owner[i] = 255; continue; }
      let bt = 0, bd = 1e9; for (const b of S.bases) { const d = hyp(b.x - (c * T + 15), b.y - (r * T + 15)); if (d < bd) { bd = d; bt = b.team; } }
      S.owner[i] = bt; S.teams[bt].tiles++;
    }
    S.dirty.length = 0; S.tilesAll = true; S.total = S.teams.reduce((a, t) => a + t.tiles, 0);
    S.players.forEach(p => { p.mc = 0; p.kills = 0; p.summons = 0; if (p.team >= S.tc) p.team = -1; });
    S.seen.clear(); S.result = null; S.winner = -1; S.crateT = 12;
    computeFlow();
    S.phase = 'lobby'; S.phaseT = st.lobbySec; S.battleT = st.matchSec;
    ui('lobby', S.map);
  };
  function startCountdown() { S.phase = 'countdown'; S.phaseT = 3.99; S.lastCount = 4; S.rankBefore = new Map(); G.rankList().slice(0, 40).forEach((e, i) => S.rankBefore.set(e.id, i + 1)); }
  G.skipLobby = function () { if (S.phase === 'lobby') startCountdown(); };
  G.endNow = function () { if (S.phase === 'battle') endBattle(-2); };
  function endBattle(winner) {
    if (S.phase !== 'battle' && S.phase !== 'countdown') return;
    // tính tỉ lệ
    S.teams.forEach(t => t.pct = S.total ? t.tiles / S.total : 0);
    if (winner === -2) {
      let best = -1, bv = -1;
      S.teams.forEach(t => { if (!t.alive) return; const v = t.tiles + t.base.hp * 0.01; if (v > bv) { bv = v; best = t.id; } });
      winner = best;
    }
    S.winner = winner; S.phase = 'result'; S.phaseT = G.settings.resultSec;
    const players = [...S.players.values()].filter(p => p.mc > 0).sort((a, b) => b.mc - a.mc);
    const wp = players.filter(p => p.team === winner);
    wp.forEach(p => G.addBoard(p.id, p.name, 0, 1));
    const mvp = wp[0] || players[0] || null;
    const deltas = G.rankList().slice(0, 10).map((e, i) => { const before = S.rankBefore && S.rankBefore.get(e.id); return { id: e.id, n: e.n, c: e.c, w: e.w, rank: i + 1, delta: before ? before - (i + 1) : 0, isNew: !before }; });
    S.result = { winner, teams: S.teams.map(t => ({ id: t.id, pct: t.pct, coins: t.coins, alive: t.alive })), mvp: mvp && { name: mvp.name, mc: mvp.mc, team: mvp.team, id: mvp.id }, top: players.slice(0, 10).map(p => ({ id: p.id, name: p.name, mc: p.mc, team: p.team, kills: p.kills })), board: deltas };
    S.units.forEach(u => { if (u.team !== winner) u.doom = true; });
    G.audio.play('win'); fx.flash('#fff', 0.35);
    if (winner >= 0) for (let i = 0; i < 14; i++) setTimeout(() => { fx.burst(100 + rnd() * 520, 250 + rnd() * 500, G.TEAMS[winner].light, 30, 260, 1.3, 4, 120); fx.burst(100 + rnd() * 520, 250 + rnd() * 500, '#ffe066', 20, 240, 1.2, 3.5, 120); }, i * 260);
    ui('result', S.result);
  }

  /* ---------------- update chính ---------------- */
  G.update = function (rdt) {
    const st = G.settings; let dt = Math.min(rdt, 0.05) * st.speed; S.frame++; S.time += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - rdt * 2.2); if (S.flash > 0) S.flash = Math.max(0, S.flash - rdt * 1.6);

    // hàng đợi triệu hồi (chống lag: giới hạn tốc độ)
    S.spawnAcc += rdt * (S.spawnQ.length > 60 ? 70 : 40);
    while (S.spawnAcc >= 1 && S.spawnQ.length) { S.spawnAcc--; execSpawn(S.spawnQ.shift()); }
    if (!S.spawnQ.length) S.spawnAcc = Math.min(S.spawnAcc, 1);

    if (S.phase === 'lobby') {
      S.phaseT -= rdt; if (S.phaseT <= 0) startCountdown();
    } else if (S.phase === 'countdown') {
      S.phaseT -= rdt; const c = Math.ceil(S.phaseT);
      if (c !== S.lastCount) { S.lastCount = c; if (c > 0) { ui('count', c); G.audio.play('tick'); } }
      if (S.phaseT <= 0) { S.phase = 'battle'; ui('count', 0); G.audio.play('go'); fx.flash('#fff', 0.3); }
    } else if (S.phase === 'result') {
      S.phaseT -= rdt; dt *= 0.35;
      if (S.phaseT <= 0) { if (st.autoLoop) G.newMatch(); else S.phaseT = 9999; }
    }

    if (S.phase === 'battle' || S.phase === 'result') {
      if (S.phase === 'battle') {
        S.battleT -= dt; if (S.battleT <= 0) { S.battleT = 0; endBattle(-2); }
        // lính miễn phí
        if (st.freeSoldierSec > 0) for (const t of S.teams) if (t.alive && (t.idleT -= dt) <= 0) { t.idleT = st.freeSoldierSec; if (t.units < st.maxUnits * 0.45) addUnit(t.id, 'soldier', 1, null); }
        // rương
        if (st.crates && (S.crateT -= dt) <= 0) {
          S.crateT = 13 + rnd() * 6;
          if (S.crates.filter(c => !c.dead).length < 2) for (let k = 0; k < 30; k++) {
            const c = (4 + rnd() * (COLS - 8)) | 0, r = (6 + rnd() * (ROWS - 12)) | 0;
            if (!S.wall[r * COLS + c]) { S.crates.push({ x: c * T + 15, y: r * T + 15, t: 0, dead: false }); fx.ring(c * T + 15, r * T + 15, 40, '#ffe066', 0.6, 3); break; }
          }
        }
      }
      rebuildHash();
      for (const b of S.bases) if (!b.dead && S.phase === 'battle') updateBase(b, dt);
      for (const u of S.units) if (!u.dead && (S.phase === 'battle' || u.doom)) updateUnit(u, dt);
      if (S.phase === 'battle') for (const s of S.structs) if (!s.dead) updateStruct(s, dt);
      for (const p of S.projs) if (!p.dead) updateProj(p, dt);
      for (const a of S.airs) if (!a.dead) updateAir(a, dt);
      for (const b of S.bombs) if (!b.dead) updateBomb(b, dt);
      for (const n of S.nukes) if (!n.dead) updateNuke(n, dt);
      for (const c of S.crates) c.t += dt;
      for (const b of S.bases) if (b.team >= 0 && !S.teams[b.team].alive) b.dead = true;
      compact(S.units); compact(S.structs); compact(S.projs); compact(S.airs); compact(S.bombs); compact(S.nukes); compact(S.crates);
    } else {
      for (const u of S.units) { u.t += dt; if (u.hit > 0) u.hit -= dt; }
    }
    // hạt
    const P = S.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.l -= rdt; if (p.l <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.x += p.vx * rdt; p.y += p.vy * rdt; if (p.k === 0) { p.vy += (p.g || 0) * rdt; p.vx *= 0.98; }
    }
    // thống kê
    if ((S.frame & 7) === 0) S.teams.forEach(t => t.pct = S.total ? t.tiles / S.total : 0);
  };
  function compact(a) { let j = 0; for (let i = 0; i < a.length; i++) if (!a[i].dead) a[j++] = a[i]; a.length = j; }
})();
