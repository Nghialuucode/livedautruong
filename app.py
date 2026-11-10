"""GameLive — chạy bằng Streamlit.

Streamlit nhúng nguyên game (HTML/CSS/JS) vào một khung iframe. Toàn bộ file game
nằm ngay ngoài gốc repo, app.py đọc rồi ghép thành một trang duy nhất.

    streamlit run app.py

Tham số trên URL (tuỳ chọn): ?clean=1 ẩn nút ⚙️ · ?demo=0 tắt demo · ?user=tenTikTok
"""
import json
import os
from urllib.parse import urlencode

HERE = os.path.dirname(os.path.abspath(__file__))
# Thứ tự nạp phải giống index.html
JS_ORDER = ["config.js", "audio.js", "maps.js", "game.js", "render.js", "live.js", "ui.js", "main.js"]

# Tự co giãn khung iframe theo tỉ lệ 9:16 của game (cùng nguồn nên được phép chỉnh khung cha)
AUTOFIT = """<script>
(function () {
  function fit() {
    try {
      var f = window.frameElement; if (!f) return;
      var w = f.clientWidth || window.innerWidth;
      var maxH = (window.parent.innerHeight || 1000) - 8;
      f.style.height = Math.max(420, Math.min(Math.round(w * 16 / 9), maxH)) + 'px';
    } catch (e) { }
  }
  fit(); window.addEventListener('resize', fit);
  try { window.parent.addEventListener('resize', fit); } catch (e) { }
})();
</script>
"""


REQUIRED = ["index.html", "style.css"] + JS_ORDER


def _find(name):
    """Tìm file ở gốc repo (không phân biệt hoa/thường); nếu không có thì tìm trong thư mục con."""
    stem = name.rsplit(".", 1)[0]
    wanted = {name.lower(), stem.lower()}  # chấp nhận cả file bị mất đuôi, ví dụ "index"
    best = None
    for root, dirs, files in os.walk(HERE):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
        for f in files:
            if f.lower() in wanted:
                p = os.path.join(root, f)
                if root == HERE:
                    return p
                best = best or p
    return best


def _read(name):
    p = _find(name)
    if p is None:
        raise FileNotFoundError(name)
    with open(p, encoding="utf-8") as f:
        return f.read()


def missing_files():
    return [n for n in REQUIRED if _find(n) is None]


def build_html(query=""):
    """Ghép index.html + style.css + các file .js thành một trang HTML duy nhất."""
    html = _read("index.html")
    link = '<link rel="stylesheet" href="style.css">'
    assert link in html, "index.html thiếu thẻ link style.css"
    html = html.replace(link, "<style>\n" + _read("style.css") + "\n</style>")
    for name in JS_ORDER:
        tag = '<script src="%s"></script>' % name
        assert tag in html, "index.html thiếu thẻ script " + name
        js = _read(name)
        if name == "config.js":
            # trong iframe không có ?query thật → truyền tham số từ URL của Streamlit vào
            js = js.replace("location.search", json.dumps(query))
        js = js.replace("</script", "<\\/script")
        html = html.replace(tag, "<script>\n" + js + "\n</script>")
    return html.replace("</body>", AUTOFIT + "</body>")


def main():
    import streamlit as st
    import streamlit.components.v1 as components

    st.set_page_config(page_title="GameLive", page_icon="🎮", layout="wide",
                       initial_sidebar_state="collapsed")
    st.markdown(
        """<style>
        header[data-testid="stHeader"], footer, #MainMenu {display:none !important}
        .block-container {padding:0 !important; max-width:100% !important}
        iframe {border:0; display:block}
        </style>""",
        unsafe_allow_html=True,
    )
    qp = st.query_params
    keep = {k: str(qp[k]) for k in ("demo", "user", "clean") if k in qp}
    query = "?" + urlencode(keep) if keep else ""
    try:
        height = max(420, min(int(qp.get("h", 900)), 2400))
    except (TypeError, ValueError):
        height = 900
    miss = missing_files()
    if miss:
        st.error("Repo GitHub đang thiếu file game: " + ", ".join(miss))
        st.write("Hãy upload các file này ngay ngoài cùng của repo (không để trong thư mục), "
                 "rồi vào app bấm Reboot. Các file hiện có trong repo:")
        names = sorted(f for f in os.listdir(HERE) if not f.startswith("."))
        st.code("\n".join(names) or "(trống)")
        st.stop()
    components.html(build_html(query), height=height, scrolling=False)


try:
    from streamlit.runtime.scriptrunner import get_script_run_ctx
    _IN_STREAMLIT = get_script_run_ctx() is not None
except Exception:  # chạy ngoài Streamlit (ví dụ khi kiểm thử build_html)
    _IN_STREAMLIT = False

if _IN_STREAMLIT:
    main()
