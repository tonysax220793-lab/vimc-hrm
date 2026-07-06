# Hướng dẫn deploy VIMC People lên Vercel (test trên điện thoại thật)

> App dùng **camera + GPS** → bắt buộc **HTTPS**. Vercel cho HTTPS thật nên
> mở trên điện thoại là camera/GPS chạy được. (Mở bằng IP LAN `http://192.168...`
> sẽ bị trình duyệt chặn camera/GPS.)

## 0) Chạy thử trên máy trước (khuyến nghị)
```bash
npm install        # cài thêm tailwind/postcss/eslint (bắt buộc, lần đầu)
npm run dev        # mở http://localhost:5173  → camera/GPS chạy vì là localhost
npm run build      # kiểm tra build production không lỗi
```

## 1) Đưa code lên GitHub
Tạo một repo RỖNG trên github.com (đừng thêm README), rồi trong thư mục dự án:
```bash
git init
git add .
git commit -m "VIMC People — vòng cứng hóa P0 + cấu hình deploy"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/vimc-hrm.git
git push -u origin main
```
> `.env.local` đã nằm trong `.gitignore` → KHÔNG bị đẩy lên (an toàn). Vì vậy
> phải nhập lại biến môi trường ở Vercel (bước 3).

## 2) Import vào Vercel
1. vercel.com → **Add New → Project** → chọn repo `vimc-hrm`.
2. **Framework Preset: Vite** (tự nhận, `vercel.json` cũng đã ép đúng).
3. Root Directory: để mặc định (thư mục chứa `package.json`).
4. Build Command `npm run build`, Output `dist` — để mặc định là được.

## 3) Nhập biến môi trường (QUAN TRỌNG)
Vercel → Project → **Settings → Environment Variables**, thêm 3 biến (lấy giá
trị y hệt trong `.env.local` của bạn), tick cả Production/Preview/Development:

| Name | Lấy từ |
|------|--------|
| `VITE_SUPABASE_URL` | `.env.local` |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` |
| `VITE_AUTH_EMAIL_DOMAIN` | `.env.local` (vd: `vimc.local`) |

Sau khi thêm biến → **Deployments → Redeploy** (để build lại có biến).

## 4) Mở trên điện thoại
- Dùng **link Production** (dạng `https://vimc-hrm.vercel.app`, KHÔNG có mã hash `-xxxxx-`).
- Lần đầu trình duyệt sẽ xin quyền **Camera** và **Vị trí** → chọn Cho phép.
- Muốn cài như app: Safari/Chrome → menu chia sẻ → **Thêm vào MH chính**
  (icon PWA + tên "VIMC People" đã cấu hình sẵn).

## 5) Lỗi hay gặp
| Hiện tượng | Cách sửa |
|---|---|
| Mở link bị đá về trang đăng nhập Vercel | Settings → **Deployment Protection** → Vercel Authentication → **Disabled** |
| Camera/GPS không hiện dù đã vào được | Đang mở bằng http (IP LAN). Phải dùng link **https** của Vercel |
| Trang trắng / lỗi Supabase | Chưa nhập đủ 3 biến `VITE_*` hoặc chưa Redeploy sau khi thêm biến |
| Đăng nhập báo lỗi | Kiểm tra `VITE_SUPABASE_URL/ANON_KEY` đúng project Supabase đang dùng |

## 6) (Tùy chọn) Bật lớp bảo mật mới
App vẫn chạy nếu chưa làm bước này (có cơ chế fallback). Khi sẵn sàng:
- Supabase SQL Editor → chạy `supabase/migrations/0002_security_hardening.sql`.
- Deploy Edge Function: `supabase functions deploy login-guard --no-verify-jwt`.
(Xem chi tiết trong `README.md`.)
