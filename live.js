/* ===== Kết nối EulerStream (TikTok LIVE) + bộ mô phỏng (demo) ===== */
(function () {
  'use strict';
  const G = window.G;
  const L = (G.live = { status: 'off', ws: null, log: [], count: 0, want: false, retry: 0, timer: 0, streaks: new Map(), lastMsg: 0 });

  function pushLog(s) {
    L.log.push(new Date().toLocaleTimeString() + '  ' + s); if (L.log.length > 40) L.log.shift();
    if (G.onLog) G.onLog();
  }
  L.pushLog = pushLog;

  // Chấp nhận "@abc", "abc ", hoặc dán nguyên link https://www.tiktok.com/@abc/live
  L.cleanUser = function (raw) {
    let u = String(raw || '').trim();
    const m = u.match(/tiktok\.com\/@([^\/?#\s]+)/i); if (m) u = m[1];
    return u.replace(/^@+/, '').replace(/\s+/g, '');
  };

  L.connect = function () {
    const st = G.settings, user = L.cleanUser(st.username);
    if (!user) { pushLog('⚠ Chưa nhập tên TikTok (@username)'); return false; }
    const keepRetry = L.retry; L.disconnect(true); L.want = true; L.retry = keepRetry;
    let url = st.wsBase || 'wss://ws.eulerstream.com';
    url += (url.includes('?') ? '&' : '?') + 'uniqueId=' + encodeURIComponent(user);
    if (st.apiKey) url += '&apiKey=' + encodeURIComponent(st.apiKey.trim());
    pushLog('Đang kết nối tới ' + url.replace(/apiKey=[^&]+/, 'apiKey=***'));
    L.status = 'connecting';
    try { L.ws = new WebSocket(url); } catch (e) { pushLog('Lỗi: ' + e.message); L.status = 'off'; return false; }
    const ws = L.ws;
    ws.onopen = () => { L.status = 'live'; L.retry = 0; pushLog('✅ Đã kết nối WebSocket'); if (G.settings.demo) { G.settings.demo = false; G.saveSettings(); G.purgeSim(); } if (G.onStatus) G.onStatus(); };
    ws.onmessage = ev => { L.lastMsg = Date.now(); handleRaw(ev.data); };
    ws.onerror = () => { if (!L.retry) pushLog('⚠ Lỗi WebSocket (kiểm tra mạng / API key)'); };
    ws.onclose = ev => {
      const code = ev.code, wasLive = L.status === 'live';
      if (ws !== L.ws) return;
      L.status = 'off';
      let wait = 0, msg = 'Ngắt kết nối (code ' + code + (ev.reason ? ': ' + ev.reason : '') + ')';
      if (code === 4404) {            // tên đúng cú pháp nhưng không có phòng LIVE
        L.retry++; wait = 15000; L.status = 'waiting';
        msg = '⏳ @' + user + ' hiện KHÔNG đang LIVE (hoặc sai tên TikTok). Hãy bắt đầu LIVE — game sẽ tự nối lại mỗi 15s.';
        if (L.retry > 1) msg = null;  // chỉ báo 1 lần, tránh đầy nhật ký
      } else if (code === 4401 || code === 4403 || code === 1008) {
        L.want = false; msg = '🔑 API key sai/hết hạn/không đủ quyền (code ' + code + '). Kiểm tra lại key rồi bấm Kết nối.';
      } else if (code === 4429) {
        L.retry++; wait = 30000; msg = '⏱ Bị giới hạn tần suất (4429). Chờ 30s rồi thử lại.';
      } else {
        L.retry++; wait = Math.min(30000, 2000 * L.retry);
        if (!wasLive && L.retry === 1) msg += ' — kiểm tra API key / mạng.';
      }
      if (msg) pushLog(msg);
      if (G.onStatus) G.onStatus();
      if (L.want && wait) { if (msg) pushLog('Thử lại sau ' + wait / 1000 + 's…'); clearTimeout(L.timer); L.timer = setTimeout(() => L.want && L.connect(), wait); }
    };
    if (G.onStatus) G.onStatus();
    return true;
  };
  L.disconnect = function (silent) {
    L.want = false; clearTimeout(L.timer);
    if (L.ws) { const w = L.ws; L.ws = null; w.onclose = null; try { w.close(); } catch (e) { } }
    L.status = 'off'; if (!silent) { L.retry = 0; pushLog('Đã ngắt kết nối'); } if (G.onStatus) G.onStatus();
  };

  function handleRaw(data) {
    L.count++;
    if (L.count <= 25 || L.count % 200 === 0) pushLog('« ' + String(data).slice(0, 220));
    let j; try { j = JSON.parse(data); } catch (e) { return; }
    const arr = Array.isArray(j) ? j : Array.isArray(j.messages) ? j.messages : Array.isArray(j.events) ? j.events : [j];
    for (const m of arr) { try { handleMsg(m); } catch (e) { pushLog('parse error: ' + e.message); } }
  }

  // Lấy URL ảnh đại diện từ nhiều dạng dữ liệu có thể gặp (chuỗi / mảng url / đối tượng { url, urls, urlList })
  function avatarOf(...objs) {
    const asUrl = v => {
      if (!v) return '';
      if (typeof v === 'string') return /^https?:\/\//.test(v) ? v : '';
      if (Array.isArray(v)) { for (const x of v) { const r = asUrl(x); if (r) return r; } return ''; }
      if (typeof v === 'object') return asUrl(v.url) || asUrl(v.urls) || asUrl(v.urlList) || asUrl(v.url_list) || asUrl(v.uri);
      return '';
    };
    for (const o of objs) {
      if (!o || typeof o !== 'object') continue;
      const r = asUrl(o.profilePictureUrl) || asUrl(o.profilePictureURL) || asUrl(o.profilePicture) || asUrl(o.profile_picture) || asUrl(o.avatarUrl) || asUrl(o.avatarThumb) || asUrl(o.avatarLarger) || asUrl(o.avatarMedium) || asUrl(o.avatar) || asUrl(o.userDetails && o.userDetails.profilePictureUrls);
      if (r) return r;
    }
    return '';
  }
  L.avatarOf = avatarOf;

  const pick = (...v) => { for (const x of v) if (x !== undefined && x !== null && x !== '') return x; };
  function handleMsg(m) {
    if (!m || typeof m !== 'object') return;
    const type = String(pick(m.type, m.event, m.eventType, m.messageType, m.method, m.name, '')).toLowerCase();
    const d = m.data && typeof m.data === 'object' ? m.data : m;
    const u = d.user || d.sender || m.user || d;
    const id = String(pick(u.uniqueId, u.unique_id, u.displayId, u.userId, u.user_id, u.id, d.uniqueId, d.userId, 'anon'));
    const name = String(pick(u.nickname, u.nickName, u.displayName, u.name, d.nickname, id));
    const user = { id, name, avatar: avatarOf(u, d, m) };
    if (/gift/.test(type)) {
      const g = d.gift || d.giftDetails || {}, ex = d.extendedGiftInfo || {};
      const gname = String(pick(g.name, g.giftName, d.giftName, ex.name, d.giftDetails && d.giftDetails.giftName, ''));
      const diamonds = +pick(g.diamondCount, g.diamond_count, d.diamondCount, d.diamond_count, ex.diamond_count, ex.diamondCount, d.giftDetails && d.giftDetails.diamondCount, 0);
      let repeat = +pick(d.repeatCount, g.repeatCount, d.repeat_count, d.combo, 1) || 1;
      const rEnd = pick(d.repeatEnd, g.repeatEnd, d.repeat_end);
      const gType = pick(d.giftType, g.giftType, g.type, d.giftDetails && d.giftDetails.giftType);
      const gid = String(pick(d.giftId, g.id, g.giftId, gname, ''));
      let delta = repeat;
      if (gType === 1 || rEnd !== undefined) {
        const key = id + '|' + gid, now = Date.now(); let s = L.streaks.get(key);
        if (s && now - s.t > 8000) s = null;
        const last = s ? s.n : 0;
        delta = repeat > last ? repeat - last : 0;
        if (rEnd) L.streaks.delete(key); else L.streaks.set(key, { n: Math.max(last, repeat), t: now });
        if (L.streaks.size > 500) for (const [k, v] of L.streaks) if (now - v.t > 10000) L.streaks.delete(k);
      }
      if (delta > 0) G.onGift(user, gname, diamonds, delta);
    } else if (/chat|comment/.test(type)) {
      const text = pick(d.comment, d.content, d.text, d.message, ''); if (text) G.onChat(user, String(text));
    } else if (/like/.test(type)) {
      G.onLike(user, +pick(d.likeCount, d.count, d.likes, 1) || 1);
    } else if (/member|join|enter/.test(type)) {
      G.onJoin(user);
    }
  }
  L.handleMsg = handleMsg; L.handleRaw = handleRaw;

  /* ---------------- Demo / mô phỏng ---------------- */
  const NAMES = ['Minh Anh', 'Hùng Dev', 'Lan Chi', 'Bảo Trân', 'Tuấn Kiệt', 'Thảo My', 'Quốc Bảo', 'Ngọc Hân', 'Đức Thịnh', 'Mai Phương', 'Khánh Vy', 'Gia Huy', 'Thu Hà', 'Việt Anh', 'Yến Nhi', 'Phát Tài', 'Hoàng Long', 'Kim Ngân', 'Anh Khoa', 'Bích Ngọc', 'Tiến Đạt', 'Hải Yến', 'Trung Kiên', 'Diệu Linh', 'Sơn Tùng', 'Cẩm Tú', 'Nhật Nam', 'Thuỳ Dương', 'Hữu Phước', 'Như Ý', 'Công Vinh', 'Tố Uyên', 'Đình Phong', 'Hạ Vy', 'Thế Anh', 'Mỹ Linh', 'Văn Toàn', 'Bình An', 'Cao Nguyên', 'Lệ Quyên'];
  const GIFTS = [[1, 'Rose', 50], [5, 'Finger Heart', 20], [10, 'Doughnut', 12], [30, 'Hand Hearts', 7], [99, 'Galaxy', 5], [199, 'Fireworks', 3], [500, 'Diamond Flight', 1.5], [1000, 'Lion', 0.6], [3000, 'Universe', 0.2]];
  const GT = GIFTS.reduce((a, g) => a + g[2], 0);
  // Ảnh đại diện giả cho bot demo: mặt cười vẽ bằng SVG (không cần mạng)
  function fakeAvatar(name, i) {
    let h = 0; for (let k = 0; k < name.length; k++) h = (h * 31 + name.charCodeAt(k)) % 360;
    const hair = ['#2b1d12', '#5a3a1a', '#d9a441', '#1a1a2e', '#a33a2a', '#7a4ac0'][i % 6], skin = ['#ffd9b3', '#f2b78a', '#c98a5e', '#ffe3c8'][i % 4];
    const mouth = i % 3 === 0 ? 'M30 54 Q40 63 50 54' : i % 3 === 1 ? 'M32 55 Q40 59 48 55' : 'M31 53 Q40 66 49 53 Z';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},75%,62%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},70%,38%)"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><ellipse cx="40" cy="86" rx="30" ry="22" fill="hsl(${(h + 180) % 360},55%,45%)"/><circle cx="40" cy="38" r="20" fill="${skin}"/><path d="M19 36 Q20 14 40 15 Q61 14 61 36 Q54 26 40 27 Q26 26 19 36Z" fill="${hair}"/><circle cx="33" cy="40" r="2.6" fill="#222"/><circle cx="47" cy="40" r="2.6" fill="#222"/><path d="${mouth}" fill="${i % 3 === 2 ? '#7a1f2b' : 'none'}" stroke="#7a1f2b" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  const bots = NAMES.map((n, i) => ({ id: 'sim_' + i, name: n, avatar: fakeAvatar(n, i) }));
  L.purgeSim = G.purgeSim = function () { for (const id in G.board) if (id.indexOf('sim_') === 0) delete G.board[id]; G.boardDirty = true; };
  L.seedSim = function () {
    // tạo vài "cao thủ" để thấy hiệu ứng vào game của TOP 10
    for (let i = 0; i < 12; i++) if (!G.board[bots[i].id]) G.board[bots[i].id] = { n: bots[i].name, a: bots[i].avatar, c: Math.round(60000 / (i + 1.3)), w: 12 - i, m: 20 };
    G.boardDirty = true;
  };
  let simT = 0;
  L.simTick = function (dt) {
    if (!G.settings.demo || G.S.phase === 'result') return;
    simT -= dt; if (simT > 0) return; simT = 0.25 + Math.random() * 0.8;
    const b = bots[(Math.random() * (Math.random() < 0.3 ? 12 : bots.length)) | 0], r = Math.random();
    const p = G.S.players.get(b.id);
    if (!p || p.team < 0) { G.onChat(b, ['1', '2', 'xanh', 'đỏ', '3', '4', 'vàng', 'xanh lá'][(Math.random() * 8) | 0]); if (!p || p.team < 0) return; }
    if (r < 0.5) G.onLike(b, 3 + ((Math.random() * 10) | 0));
    else if (r < 0.62) G.onChat(b, ['1', '2', 'đỏ', 'xanh'][(Math.random() * 4) | 0]);
    else {
      let x = Math.random() * GT, g = GIFTS[0]; for (const c of GIFTS) { x -= c[2]; if (x <= 0) { g = c; break; } }
      G.onGift(b, g[1], g[0], g[0] <= 5 ? 1 + ((Math.random() * 4) | 0) : 1);
    }
  };
})();
