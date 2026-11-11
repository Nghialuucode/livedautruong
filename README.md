# 🎮 GameLive — Đại Chiến Lãnh Thổ (TikTok LIVE)

Game chiến thuật dọc 9:16 cho TikTok LIVE. Người xem **bình luận để chọn đội**, **thả quà để triệu hồi quân / vũ khí**, **chạm màn hình (like) để gọi lính**. Đội chiếm nhiều đất nhất (hoặc phá căn cứ địch) sẽ thắng; người tặng nhiều xu nhất được vinh danh và leo bảng xếp hạng.

Tham khảo từ video mẫu: lưới ô tô màu theo đội, lính đi tới đâu tô đất tới đó, trụ pháo, tia laze, thanh % chiếm đất, đồng hồ đếm ngược.

## Chạy bằng Streamlit

`app.py` nhúng nguyên game vào một khung trong trang Streamlit (đọc `index.html`, `style.css` và các file `.js` ở gốc repo rồi ghép lại), nên **không cần thư mục con**.

**Chạy thử trên máy:**
```bash
pip install -r requirements.txt
streamlit run app.py        # mở http://localhost:8501
```

**Đưa lên web (Streamlit Community Cloud, miễn phí):**
1. Repo GitHub (công khai) chứa đủ các file ở gốc: `app.py`, `requirements.txt`, `index.html`, `style.css`, `config.js`, `audio.js`, `maps.js`, `game.js`, `render.js`, `live.js`, `ui.js`, `main.js`.
2. Vào <https://share.streamlit.io>, đăng nhập bằng GitHub → **New app**.
3. Chọn repo, nhánh `main`, **Main file path: `app.py`** → **Deploy**.
4. Sau vài phút có link dạng `https://<tên>-<repo>-<hash>.streamlit.app`. Sửa file trên GitHub là web tự cập nhật.

Mở là thấy **chế độ DEMO** với người xem giả lập. Bấm **M** (hoặc nút ⚙️) để mở menu cài đặt. Bảng xếp hạng lưu trong trình duyệt (xuất/nhập JSON trong menu → Xếp hạng).
Tham số trên URL: `?clean=1` ẩn nút ⚙️ · `?demo=0` tắt demo · `?user=tenTikTok` điền sẵn tên · `?h=900` chiều cao khung ban đầu.

> **API key không nằm trong code**: bạn nhập trong menu, chỉ lưu ở trình duyệt của bạn. Đừng commit key lên GitHub.
> `server.py` chỉ là cách chạy cũ trên máy (không cần khi dùng Streamlit); có thể giữ hoặc xoá.

## Màn hình dọc TikTok LIVE không bị che

TikTok che phần trên (tên host, người xem) và phần dưới (khung chat, ô bình luận). Mặc định game đã **chừa 140px phía trên và 330px phía dưới** (theo màn 720×1280): thanh điểm + đội nằm ngay dưới vùng TikTok, bản đồ tự thu nhỏ vừa khung, bảng giá quà nằm ngay trên khung chat, bảng kết quả và hộp chọn đội căn giữa vùng an toàn.

**Lấp đầy hai bên:** bản đồ tự chọn số hàng (16–34, luôn 24 cột) sao cho vừa khít vùng an toàn nên rộng gần hết chiều ngang, không còn viền trống hai bên; hàng giá quà cũng được phóng to cho dễ đọc khi xem live. Tắt ở tab 📱 nếu muốn bản đồ dài như cũ (34 hàng). Khi kéo thanh chừa trên/dưới, bản đồ dựng lại ngay nếu đang ở sảnh/kết quả, còn đang đánh thì áp dụng từ trận sau.

Chỉnh ở **⚙️ → 📱 Màn hình TikTok**: bật/tắt chế độ, kéo thanh chừa trên/dưới, hoặc bấm nhanh Mặc định / Chừa ít / Chừa nhiều / Không chừa. **Vùng đỏ sọc** (phần TikTok che) chỉ hiện khi đang mở tab này để căn chỉnh; đóng menu là tự ẩn.

## Âm thanh ổn định & toàn màn hình (ẩn thanh trạng thái)

- **Âm thanh tự phục hồi:** game giám sát âm thanh mỗi giây; nếu trình duyệt tạm dừng (chuyển tab, khoá màn hình, cuộc gọi, iOS "interrupted") sẽ tự bật lại, nếu bị treo cứng thì tự tạo lại. Nhạc nền không còn "bắn dồn" hàng loạt nốt sau khi bị treo, và bộ đếm giọng không còn bị kẹt làm câm hiệu ứng. Nếu âm thanh bị ngắt mà cần chạm mới bật lại được, nút vàng "🔊 Âm thanh bị ngắt — bấm để bật lại" sẽ hiện lên. Menu ⚙️ → 🔊 Âm thanh & FX có trạng thái + nút **Khởi động lại âm thanh**. iPhone: nhớ tắt công tắc im lặng bên hông máy.
- **Toàn màn hình:** chạm màn hình lần đầu (hoặc bấm nút vàng / phím **F**) là game vào toàn màn hình, ẩn thanh thông báo trên Android và máy tính. Khung Streamlit được ép phủ kín cả màn hình, không còn dải tối thừa phía dưới. Tắt bằng tuỳ chọn trong tab 📱.
- **iPhone (Safari không có toàn màn hình thật):** mở link → nút Chia sẻ → **Thêm vào MH chính**, rồi mở từ biểu tượng đó; game đã khai báo chế độ ứng dụng nên thanh trạng thái sẽ trong suốt, bản đồ tràn viền.
- Thêm `?embed=true` vào cuối link Streamlit để ẩn thanh "Manage app" / menu của Streamlit.

## Khoá cài đặt

Menu ⚙️ có khung cố định (không đổi cao theo tab, không cuộn lan ra ngoài, không phóng to/kéo trượt trang) và thanh trượt chỉ chỉnh khi kéo ngang nên vuốt dọc để cuộn sẽ không làm lệch giá trị. Nút **🔓 Khoá cài đặt** ở góc trên: khi khoá, mọi ô nhập, thanh trượt và nút trong menu bị vô hiệu (vẫn xem được các tab); bấm lại để mở khoá. Trạng thái khoá được nhớ lại ở lần mở sau.

## Kết nối TikTok qua EulerStream

1. Lấy API key ở <https://www.eulerstream.com>.
2. Menu → **Kết nối**: nhập `@username` đang LIVE + API key → **Kết nối**. Demo tự tắt khi nối thành công.
3. Nếu thấy `code 4404` = tài khoản **chưa LIVE** (hoặc sai tên). Bắt đầu LIVE là game tự nối (thử lại mỗi 15s). Lỗi 4401/4403 = API key sai.
4. Bảng **Nhật ký sự kiện thô** hiện dữ liệu Euler gửi về để bạn kiểm tra. Bộ đọc (`live.js → handleMsg`) chấp nhận nhiều dạng tên trường (`gift.name`, `giftName`, `diamondCount`, `repeatCount`, `repeatEnd`…). Nếu bản Euler của bạn đặt tên khác, chỉ cần sửa một hàm đó.
5. Dùng cho TikTok LIVE: mở trang trên máy tính rồi chiếu cửa sổ trình duyệt bằng TikTok LIVE Studio / OBS. Thêm `?clean=1` vào URL để ẩn nút ⚙️.

URL tuỳ chọn: `?demo=0` tắt demo · `?user=tenTikTok` điền sẵn tên · `?clean=1` ẩn nút cài đặt.

## Cách chơi

| Người xem làm | Kết quả |
|---|---|
| Bình luận `1` / `xanh` · `2` / `đỏ` · `3` / `xanh lá` · `4` / `vàng` | Chọn đội (khoá sau khi đã tặng quà) |
| Thả quà (theo số xu **của 1 quà**) | 1 xu → Lính · 5 → Cung thủ ×2 · 10 → Xạ thủ ×2 · 30 → Xe tăng · 99 → Pháo · 199 → Súng laze · 500 → Pháo đài · 1000 → Rồng oanh tạc · 3000 → Hạt nhân |
| Chạm màn hình (like) | Chưa có đội thì **tự vào đội ít người nhất** ngay lần chạm đầu, rồi gọi lính thường (mặc định 3 like = 1 lính) |
| Thả quà khi chưa chọn đội | Tự vào đội ít người nhất (cân bằng 2 bên), có thông báo "(tự chọn)" |

Tất cả bảng quy đổi **sửa được trong menu → Quà tặng** (kể cả gán theo tên quà, ví dụ `Rose=soldier*3`).

- **Thắng**: hết giờ đội chiếm nhiều ô nhất thắng; hoặc phá căn cứ → loại đội đó; còn 1 đội là thắng ngay.
- **Rương** 📦 xuất hiện giữa bản đồ: lính nào chạm trước thì đội đó nhận quà (thêm quân, hồi máu, lên cấp).
- **Level**: quà combo lớn hoặc khi đội đạt giới hạn quân sẽ **dồn thành cấp** (số vàng trên đầu lính) thay vì sinh thêm → vừa có chiều sâu vừa chống lag.
- **Vinh danh**: cuối trận hiện đội thắng, MVP (nhiều xu nhất), top xu trận, bảng xếp hạng tổng kèm mũi tên lên/xuống hạng.
- **TOP 10 bảng xếp hạng** vào game (comment/tặng/like/vào phòng) sẽ có hiệu ứng + âm thanh riêng (hạng 1 vàng, hạng 2-3 xanh, 4-10 tím).
- **8 map** (Đấu Trường, Hai Bờ Sông, Mê Cung, Kim Cương, Đảo Hoang, Chữ Thập, Bãi Đá, Hỗn Loạn), **2–4 đội**, tự đổi map mỗi trận.

## Chống lag

- Lưới đất vẽ vào canvas đệm, chỉ vẽ lại ô thay đổi.
- Chia lưới không gian để tìm mục tiêu / va chạm, không duyệt toàn bộ.
- Hàng đợi triệu hồi có giới hạn tốc độ; giới hạn quân mỗi đội, vượt thì nâng cấp lính cũ.
- Gộp combo quà (tính phần chênh `repeatCount`), giới hạn like theo từng người.
- Tự giảm hiệu ứng / độ phân giải khi FPS tụt, tăng lại khi ổn định (menu → Âm thanh & FX).

## Cấu trúc (tất cả nằm ở thư mục gốc, không có thư mục con)

```
index.html   trang chính          style.css   giao diện
config.js    vũ khí, cài đặt, bảng xếp hạng   maps.js    8 bản đồ
game.js      engine: AI, chiến đấu, vũ khí    render.js  vẽ canvas + HUD
audio.js     âm thanh tổng hợp (không file)   live.js    EulerStream + demo
ui.js        menu cài đặt                     main.js    vòng lặp, anti-lag
app.py       chạy bằng Streamlit (ghép các file thành 1 trang)
requirements.txt   thư viện cho Streamlit
server.py    server cục bộ cũ (tuỳ chọn)
```

Thêm vũ khí mới: khai báo trong `G.WEAPONS` (config.js), thêm logic trong `execSpawn` (game.js), rồi gán mốc xu trong menu.

## Đồ hoạ & avatar (v7)

- **Avatar tròn theo đội**: ảnh đại diện TikTok của người xem (lấy từ sự kiện chat/quà/like) hiện trong **thẻ đội** trên thanh HUD (chồng avatar, kèm "+N") và trong **sảnh chọn đội** (mỗi đội có các ô tròn, ai chọn đội thì avatar bay vào ô). Cũng hiện ở bảng tin, top quà, banner quà lớn, TOP 10 vào game, MVP và bảng xếp hạng. Không có ảnh thì dùng chữ cái đầu; bot demo có avatar vẽ sẵn.
- **Đồ hoạ mới**: ô đất bo góc nổi khối có viền lãnh thổ phát sáng, đá 3D, nước lấp lánh; lính kiếm / cung thủ / xạ thủ / xe tăng vẽ lại chi tiết (khiên, nón, cung, súng, xích xe), có chân bước, loé đầu nòng; pháo, súng laze, pháo đài, căn cứ (lâu đài có cờ, tháp), rồng, rương, đạn mới; biểu tượng bảng giá quà vẽ từ chính các mô hình trong game.
- Tương thích Streamlit: vẫn chỉ cần các file ở gốc repo như cũ.
