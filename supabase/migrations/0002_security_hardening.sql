-- =====================================================================
-- VIMC People — Vá bảo mật & toàn vẹn dữ liệu (AN TOÀN để chạy bổ sung)
-- Bao gồm:
--   1) Chống chấm công trùng VÀO/RA trong ngày (unique index theo giờ VN)
--   2) Bảng login_attempts + hàm khóa đăng nhập phía SERVER (chống brute-force)
--   3) login_lookup(search): tìm kiếm danh bạ có kiểm soát (giảm lộ dữ liệu)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CHỐNG CHẤM CÔNG TRÙNG
--    Mỗi nhân sự chỉ 1 lần VÀO và 1 lần RA mỗi ngày (theo giờ Việt Nam).
-- ---------------------------------------------------------------------
create unique index if not exists uq_attendance_user_day_type
  on public.attendance (
    user_id,
    type,
    ((server_ts at time zone 'Asia/Ho_Chi_Minh')::date)
  );

-- ---------------------------------------------------------------------
-- 2) KHÓA ĐĂNG NHẬP PHÍA SERVER
-- ---------------------------------------------------------------------
create table if not exists public.login_attempts (
  id           bigint generated always as identity primary key,
  user_key     text not null,          -- id nhân sự (hoặc tên chuẩn hoá)
  ok           boolean not null,       -- lần thử này thành công hay không
  ip           text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_login_attempts_key_time
  on public.login_attempts(user_key, created_at desc);

alter table public.login_attempts enable row level security;
-- Không cấp policy đọc/ghi trực tiếp cho client; chỉ Edge Function (service_role) dùng.

-- Đếm số lần SAI sau lần đăng nhập ĐÚNG gần nhất, trong cửa sổ phút.
-- Dùng để khóa mềm (ví dụ >= 5 lần sai → chặn tạm 15 phút).
create or replace function public.recent_failed_logins(p_user_key text, p_window_min int default 15)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.login_attempts
  where user_key = p_user_key
    and ok = false
    and created_at > now() - make_interval(mins => p_window_min)
    and created_at > coalesce(
      (select max(created_at) from public.login_attempts la2
         where la2.user_key = p_user_key and la2.ok = true
           and la2.created_at > now() - make_interval(mins => p_window_min)),
      now() - make_interval(mins => p_window_min)
    )
$$;

-- ---------------------------------------------------------------------
-- 3) TÌM KIẾM DANH BẠ CÓ KIỂM SOÁT (thay cho việc trả toàn bộ danh bạ)
--    Yêu cầu ≥ 2 ký tự, tối đa 8 kết quả, chỉ id/full_name/role.
-- ---------------------------------------------------------------------
create or replace function public.login_lookup(search text)
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select id, full_name, role
  from public.users
  where is_active = true
    and length(coalesce(trim(search), '')) >= 2
    and full_name ilike '%' || trim(search) || '%'
  order by full_name
  limit 8
$$;
grant execute on function public.login_lookup(text) to anon, authenticated;
