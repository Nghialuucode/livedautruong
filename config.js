/* ===== GameLive: cấu hình, dữ liệu vũ khí, cài đặt, bảng xếp hạng ===== */
(function () {
  'use strict';
  const G = (window.G = {});

  // Kích thước logic (stage 720x1280, dọc 9:16 cho TikTok LIVE)
  G.T = 30; G.COLS = 24; G.ROWS = 34;
  G.W = G.COLS * G.T; G.H = G.ROWS * G.T;      // arena 720 x 1020
  G.arenaHooks = [];
  // Đổi số hàng của bản đồ (cột luôn 24 → luôn rộng đủ màn hình); các module tự cập nhật qua hook
  G.setRows = function (n) { G.ROWS = n; G.H = n * G.T; G.arenaHooks.forEach(f => f()); };
  G.ARENA_Y = 150; G.SW = 720; G.SH = 1280;

  G.TEAMS = [
    { name: 'XANH', color: '#2f8bff', dark: '#1553b8', light: '#8cc4ff', tileA: '#2f8bff', tileB: '#2a7df0', glow: '#5aa8ff' },
    { name: 'ĐỎ', color: '#ff4b5c', dark: '#b8182e', light: '#ff9aa5', tileA: '#ff4b5c', tileB: '#f23f51', glow: '#ff7685' },
    { name: 'XANH LÁ', color: '#2fd27a', dark: '#138a4b', light: '#8cf0b9', tileA: '#2fd27a', tileB: '#29c570', glow: '#5cf0a0' },
    { name: 'VÀNG', color: '#ffc21f', dark: '#b98300', light: '#ffe28a', tileA: '#ffc21f', tileB: '#f5b717', glow: '#ffd75c' },
  ];

  // kind: unit (lính di chuyển) | struct (công trình) | special (đòn đặc biệt)
  G.WEAPONS = {
    soldier: { name: 'Lính', icon: '🗡️', kind: 'unit', hp: 60, spd: 54, range: 22, sight: 130, dmg: 9, cd: 0.6, paint: 1.1, r: 9, cap: 15, desc: 'Cận chiến, tô đất khi đi' },
    archer: { name: 'Cung Thủ', icon: '🏹', kind: 'unit', hp: 38, spd: 46, range: 150, sight: 190, dmg: 9, cd: 0.9, paint: 1.1, r: 9, proj: 'arrow', pspd: 380, cap: 12, desc: 'Bắn tên tầm xa' },
    gunner: { name: 'Xạ Thủ', icon: '🔫', kind: 'unit', hp: 50, spd: 48, range: 125, sight: 170, dmg: 4.2, cd: 0.2, paint: 1.1, r: 9, proj: 'bullet', pspd: 540, cap: 10, desc: 'Súng liên thanh' },
    tank: { name: 'Xe Tăng', icon: '🛡️', kind: 'unit', hp: 520, spd: 30, range: 175, sight: 210, dmg: 34, splash: 46, cd: 1.5, paint: 2.2, r: 15, proj: 'shell', pspd: 300, cap: 5, desc: 'Giáp dày, nã pháo nổ' },
    cannon: { name: 'Pháo', icon: '💣', kind: 'struct', st: 'cannon', hp: 260, range: 290, dmg: 38, splash: 55, cd: 1.1, life: 50, r: 16, cap: 3, desc: 'Trụ pháo tầm xa' },
    laser: { name: 'Súng Laze', icon: '⚡', kind: 'struct', st: 'laser', hp: 160, life: 15, r: 14, cap: 2, desc: 'Tia laze quét, tô cả dải đất' },
    fortress: { name: 'Pháo Đài', icon: '🏰', kind: 'struct', st: 'fortress', hp: 900, range: 230, dmg: 11, cd: 0.45, life: 60, r: 24, cap: 2, desc: 'Đẻ lính + bắn tên' },
    dragon: { name: 'Rồng Oanh Tạc', icon: '🐉', kind: 'special', sp: 'dragon', cap: 2, desc: 'Bay ném bom thảm' },
    nuke: { name: 'Hạt Nhân', icon: '☢️', kind: 'special', sp: 'nuke', cap: 2, desc: 'Nổ cực lớn, xoá sạch' },
  };

  G.DEFAULT_RULES = [
    { min: 1, w: 'soldier', n: 1 },
    { min: 5, w: 'archer', n: 2 },
    { min: 10, w: 'gunner', n: 2 },
    { min: 30, w: 'tank', n: 1 },
    { min: 99, w: 'cannon', n: 1 },
    { min: 199, w: 'laser', n: 1 },
    { min: 500, w: 'fortress', n: 1 },
    { min: 1000, w: 'dragon', n: 1 },
    { min: 3000, w: 'nuke', n: 1 },
  ];

  G.DEFAULTS = {
    username: '', apiKey: '', wsBase: 'wss://ws.eulerstream.com', autoConnect: false, demo: true,
    teamCount: 2, mapId: 'arena', rotateMaps: true, matchSec: 180, lobbySec: 20, resultSec: 20, autoLoop: true,
    speed: 1, maxUnits: 90, baseHp: 3000, freeSoldierSec: 4, crates: true,
    giftCap: 15, likesPerSoldier: 3, tapEnabled: true, autoTeam: true, lockTeamAfterGift: true,
    rules: G.DEFAULT_RULES, nameRules: '',
    vol: 0.8, sfxVol: 1, musicVol: 0.35, music: true,
    quality: 'auto', shake: true, dmgNumbers: true, entrance: true,
    safeMode: true, safeTop: 140, safeBottom: 330, fillArena: true, autoFullscreen: true, uiLock: false,
  };

  G.settings = JSON.parse(JSON.stringify(G.DEFAULTS));
  try {
    const raw = localStorage.getItem('gl_settings');
    if (raw) Object.assign(G.settings, JSON.parse(raw));
  } catch (e) { /* bỏ qua */ }
  delete G.settings.showSafe; // bản cũ từng lưu cờ này làm vùng đỏ sọc hiện mãi trên màn hình
  // ?demo=0 / ?clean=1
  const qs = new URLSearchParams(location.search);
  G.clean = qs.get('clean') === '1';
  if (qs.has('demo')) G.settings.demo = qs.get('demo') !== '0';
  if (qs.get('user')) G.settings.username = qs.get('user');

  let saveTimer = 0;
  G.saveSettings = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem('gl_settings', JSON.stringify(G.settings)); } catch (e) { }
    }, 250);
  };

  /* ---------- Bảng xếp hạng tổng (lưu localStorage + server.py nếu có) ---------- */
  G.board = {};
  G.boardDirty = true; G.serverOK = false;
  try { G.board = JSON.parse(localStorage.getItem('gl_board') || '{}') || {}; } catch (e) { G.board = {}; }
  let rankCache = [], boardTimer = 0;
  G.rankList = function () {
    if (G.boardDirty) {
      rankCache = Object.keys(G.board).map(id => ({ id, ...G.board[id] })).sort((a, b) => b.c - a.c);
      G.boardDirty = false;
    }
    return rankCache;
  };
  G.rankOf = function (id) {
    const l = G.rankList();
    for (let i = 0; i < l.length; i++) if (l[i].id === id) return i + 1;
    return 0;
  };
  G.addBoard = function (id, name, coins, wins) {
    let b = G.board[id];
    if (!b) b = G.board[id] = { n: name, c: 0, w: 0, m: 0 };
    b.n = name || b.n; b.c += coins || 0; b.w += wins || 0; G.boardDirty = true;
    G.persistBoard();
  };
  G.persistBoard = function () {
    clearTimeout(boardTimer);
    boardTimer = setTimeout(() => {
      // giữ tối đa 600 người cao nhất
      const ids = Object.keys(G.board);
      if (ids.length > 600) {
        ids.sort((a, b) => G.board[b].c - G.board[a].c).slice(600).forEach(i => delete G.board[i]);
      }
      const out = {}; for (const id in G.board) if (id.indexOf('sim_') !== 0) out[id] = G.board[id]; // không lưu người chơi demo
      try { localStorage.setItem('gl_board', JSON.stringify(out)); } catch (e) { }
      if (G.serverOK) fetch('api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }).catch(() => { });
    }, 1500);
  };
  G.loadServerBoard = function () {
    fetch('api/board', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        G.serverOK = true;
        // hợp nhất: lấy bản có xu cao hơn
        for (const id in j) if (!G.board[id] || G.board[id].c < j[id].c) G.board[id] = j[id];
        G.boardDirty = true;
      }
    }).catch(() => { G.serverOK = false; });
  };

  G.rnd = Math.random;
  G.fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
  G.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  G.mulberry = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
})();
