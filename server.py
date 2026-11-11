#!/usr/bin/env python3
"""GameLive — server cục bộ (chỉ dùng thư viện chuẩn Python, không cần cài gì).

    python server.py            # mở http://localhost:8000
    python server.py --port 9000

- Phục vụ file tĩnh của game.
- /api/board : đọc/ghi bảng xếp hạng vào leaderboard.json
  (khi chạy trên GitHub Pages không có server → game tự lưu trong trình duyệt).
"""
import argparse
import json
import os
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "leaderboard.json")
LOCK = threading.Lock()
MAX_BYTES = 2_000_000


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/board":
            with LOCK:
                try:
                    with open(DATA, encoding="utf-8") as f:
                        return self._json(200, json.load(f))
                except (FileNotFoundError, json.JSONDecodeError):
                    return self._json(200, {})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/board":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BYTES:
            return self._json(413, {"error": "bad size"})
        try:
            obj = json.loads(self.rfile.read(n))
            if not isinstance(obj, dict):
                raise ValueError
            clean = {}
            for k, v in obj.items():  # chỉ giữ các trường hợp lệ
                if isinstance(v, dict) and isinstance(v.get("c"), (int, float)):
                    clean[str(k)[:64]] = {
                        "n": str(v.get("n", k))[:40],
                        "c": v["c"],
                        "w": int(v.get("w", 0)),
                        "m": int(v.get("m", 0)),
                    }
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "invalid json"})
        with LOCK:
            os.makedirs(os.path.dirname(DATA), exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(DATA))
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(clean, f, ensure_ascii=False)
            os.replace(tmp, DATA)  # ghi nguyên tử, không hỏng file khi mất điện
        self._json(200, {"ok": True, "players": len(clean)})

    def log_message(self, fmt, *args):
        if "/api/board" not in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"GameLive chạy tại http://{a.host}:{a.port}  (Ctrl+C để dừng)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
