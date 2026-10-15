# Xếp hình

Trò chơi xếp khối trên bảng 10×10, viết bằng Next.js.

- Bên cạnh bảng có 3 khối ngẫu nhiên: thanh dài 2–4 ô, hình vuông 2×2 và 3×3, chữ L, J, T, S (mọi hướng xoay).
- Nhấn giữ để kéo khối bằng chuột hoặc ngón tay; bóng xem trước cho biết khối sẽ nằm ở đâu, chuyển đỏ nếu chỗ đó đã có ô.
- Thả ở chỗ hợp lệ thì khối khớp đúng vào bóng; thả ở chỗ khác thì khối quay về chỗ cũ.
- Hàng hoặc cột đầy sẽ bị xoá. Dùng hết 3 khối thì có 3 khối mới. Hết chỗ đặt thì kết thúc.
- Chơi bằng bàn phím: Tab chọn khối, Enter lấy, phím mũi tên di chuyển, Enter đặt, Esc huỷ.

## Chạy

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # kiểm thử luật chơi
npm run lint
npm run typecheck
```

## Cấu trúc

- `src/lib/block-puzzle.ts`: luật chơi thuần (hình khối, đặt khối, xoá hàng/cột, tính điểm), không phụ thuộc giao diện.
- `src/app/block-puzzle-game.tsx`: giao diện và kéo thả. Bảng được đo lại khi đổi kích thước, cuộn hoặc xoay màn hình, nên khối đang kéo, bóng xem trước và vị trí thả luôn trùng nhau, kể cả khi đổi tỉ lệ khung hình giữa lúc kéo.
- `src/app/game-loader.tsx`: chỉ hiển thị trên trình duyệt (khối ngẫu nhiên và kỷ lục lưu trong localStorage).
