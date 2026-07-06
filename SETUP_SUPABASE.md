# Thiết lập Supabase mới cho VIMC People (từ số 0)

Làm lần lượt 7 bước. Xong bước nào tick bước đó.

---

## B1. Tạo project
1. Vào https://supabase.com → **Sign in** (đăng nhập bằng GitHub cho nhanh).
2. **New project**:
   - Name: `vimc-hrm` (tuỳ ý)
   - Database Password: đặt mật khẩu mạnh → **lưu lại** (dùng khi cần).
   - Region: chọn **Southeast Asia (Singapore)** cho gần Việt Nam.
   - Create → chờ ~2 phút cho project khởi tạo.

## B2. Lấy khoá API → điền .env.local
Project → **Settings (bánh răng) → API**. Copy 2 giá trị:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

Mở file `.env.local` trong dự án và điền:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...(anon key)
VITE_AUTH_EMAIL_DOMAIN=vimc.local
```
> `service_role` key TUYỆT ĐỐI không đưa vào .env.local hay client — chỉ dùng trong Edge Function (Supabase tự cấp khi deploy).

## B3. Tạo bảng + RLS (SQL Editor)
Project → **SQL Editor → New query**. Chạy lần lượt:
1. Dán toàn bộ nội dung `supabase/migrations/0001_init_schema.sql` → **Run**.
2. Dán toàn bộ `supabase/migrations/0002_security_hardening.sql` → **Run**.

Kiểm tra: **Table Editor** phải thấy các bảng `users`, `branches`, `attendance`,
`messages`, `notifications`, `daily_logs`, `checklists`, `handovers`...

## B4. Tạo kho ảnh chấm công (Storage)
1. Project → **Storage → New bucket**:
   - Name: `attendance-photos` (đúng y hệt, có dấu gạch ngang)
   - **Bỏ tick Public** (để private) → Create.
2. Vào **SQL Editor** chạy policy cho kho ảnh:
```sql
-- Người dùng chỉ tải ảnh vào thư mục mang id của chính mình
create policy "att upload own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attendance-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Đọc ảnh: xem ảnh của mình; quản lý/giám đốc/admin xem tất cả (để tạo signed URL)
create policy "att read own or manager"
on storage.objects for select to authenticated
using (
  bucket_id = 'attendance-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.current_role() in ('manager','director','admin')
  )
);
```

## B5. Deploy Edge Functions
Có 2 cách — chọn 1:

**Cách A — qua Dashboard (không cần cài gì):**
Project → **Edge Functions → Deploy a new function** → tạo function tên
`create-user`, dán nội dung file `supabase/functions/create-user/index.ts` →
Deploy. Làm tương tự cho `login-guard` (dán `supabase/functions/login-guard/index.ts`).
Với `login-guard`: mở phần cấu hình function → **tắt "Verify JWT"** (vì gọi trước khi đăng nhập).

**Cách B — qua CLI (nếu bạn quen dòng lệnh):**
```bash
npm i -g supabase
supabase login
supabase link --project-ref <ref>      # ref lấy ở Settings → General
supabase functions deploy create-user
supabase functions deploy login-guard --no-verify-jwt
supabase secrets set AUTH_EMAIL_DOMAIN=vimc.local
```
> Nếu chưa deploy login-guard cũng không sao — app tự lùi về khoá phía client.
> Nhưng `create-user` thì cần để tạo nhân sự trong app.

## B6. Tạo Admin đầu tiên
1. Authentication → **Users → Add user → Create new user**:
   - Email: `admin@vimc.local` (tạm) · Password: `123456` · tick **Auto Confirm User** → Create.
2. Bấm vào user → copy **User UID**.
3. SQL Editor (thay `<UID>`):
```sql
update auth.users set email = '<UID>@vimc.local' where id = '<UID>';

insert into public.users (id, full_name, role, title, is_active)
values ('<UID>', 'Quản trị Test', 'admin', 'Quản trị hệ thống', true);
```

## B7. Chạy app
```bash
cd "E:\Thiet ke\Claude Cowork\vimc-hrm\vimc-hrm"
npm install
npm run dev
```
Mở `localhost:5173` → gõ tên **Quản trị Test** → chọn → PIN **123456**.
Vào được rồi thì tạo các nhân sự khác ngay trong app (tab Cá nhân → Quản lý nhân sự).

---

### Khi deploy Vercel
Nhớ nhập lại 3 biến `VITE_*` (giống .env.local) vào **Vercel → Settings →
Environment Variables**, rồi Redeploy. Chi tiết ở `DEPLOY.md`.
