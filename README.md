# VIMC People — PWA Quản lý Nhân sự

Starter repo cho Antigravity thực thi. Stack: **React (Vite) PWA + Supabase + Vercel**.

## Tính năng có sẵn (khung chạy được)
- Đăng nhập **Tên + PIN** (PIN Pad tròn, ẩn/hiện PIN, khóa sau 5 lần sai)
- **Chấm công** selfie real-time + GPS, upload Supabase Storage
- **Chat nội bộ** real-time (Admin 2 cột; nhân viên 1-1 với Admin) + badge chưa đọc
- **Nhật ký** ngày, **Checklist**, **Bàn giao** (xác nhận đã nhận)
- **Admin**: dashboard nhanh + thêm nhân sự (vai trò + chức danh) qua Edge Function

## Chạy local
```bash
npm install     # nay có thêm tailwindcss, postcss, autoprefixer, eslint
cp .env.example .env.local   # rồi điền URL + ANON KEY của Supabase
npm run dev
```
> Tailwind nay chạy qua **build PostCSS** (không còn CDN). Cấu hình ở
> `tailwind.config.js`. Sau khi `npm install`, nếu style chưa áp dụng,
> khởi động lại `npm run dev`.

## Trình tự thiết lập backend
1. Tạo project Supabase → **SQL Editor**.
2. Chạy migration trong `supabase/migrations/` theo thứ tự:
   - `0001_init_schema.sql` — schema + RLS **tái dựng từ code**. ⚠️ Nếu DB thật
     đã có, **đừng chạy nguyên file**; hãy đối chiếu từng bảng rồi cập nhật lại
     file cho khớp DB thật (để repo là nguồn sự thật duy nhất).
   - `0002_security_hardening.sql` — **an toàn chạy bổ sung**: chống chấm công
     trùng, bảng `login_attempts`, hàm `login_lookup`.
3. Tạo Admin đầu tiên (dùng bộ Build Kit của bạn).
4. Deploy Edge Functions:
   ```bash
   supabase functions deploy create-user
   supabase functions deploy login-guard --no-verify-jwt   # gọi trước khi đăng nhập
   supabase secrets set AUTH_EMAIL_DOMAIN=vimc.local
   # SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY: Supabase tự cấp khi deploy
   ```
5. Icon PWA & favicon đã có sẵn trong `public/icons` và `public/favicon.svg`
   (bản thiết kế tạm — thay bằng logo chính thức khi có).

> **Fallback an toàn:** client tự lùi về hành vi cũ nếu `login_lookup` /
> `login-guard` chưa deploy, nên app vẫn chạy trong lúc bạn triển khai dần.

## Deploy production
Kết nối repo với Vercel (preset **Vite**), thêm biến `VITE_*`, deploy.

## Lưu ý quan trọng
- RLS đã bật ở DB — **không** tắt. Mọi truy vấn chạy dưới quyền người đăng nhập.
- Không commit `.env.local`; `service_role` chỉ dùng trong Edge Function.
- Đây là **khung khởi tạo**; bổ sung geofence, push notification, export Google Sheets ở các vòng tiếp theo (xem PRD mục 12 & roadmap).

## Nhật ký thay đổi (vòng cứng hóa P0)
- **Chấm công:** bắt buộc camera sẵn sàng + có GPS mới cho chấm; chống trùng
  VÀO/RA trong ngày (client + unique index DB); bỏ nhãn "FACIAL ID ACTIVE" gây
  hiểu nhầm → hiển thị trạng thái camera thật.
- **Build:** chuyển Tailwind CDN → PostCSS (`tailwind.config.js`, `postcss.config.js`,
  `src/styles/index.css`); thêm ESLint.
- **Tài nguyên tĩnh:** tự lưu logo/hoa văn trong `public/assets` (gỡ toàn bộ ảnh
  hotlink từ Google), tạo icon PWA + favicon, gộp còn một manifest.
- **Bảo mật đăng nhập:** khóa phía server (`login_attempts` + `login-guard`),
  tìm danh bạ có kiểm soát (`login_lookup`) thay cho tải toàn bộ danh bạ.
- **Backend:** đưa schema + RLS vào `supabase/migrations` (bản tái dựng, cần đối chiếu).
