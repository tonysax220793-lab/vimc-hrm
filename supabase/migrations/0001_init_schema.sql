-- =====================================================================
-- VIMC People — Schema tham chiếu (TÁI DỰNG từ mã nguồn client)
-- ---------------------------------------------------------------------
-- ⚠️ QUAN TRỌNG:
--   • File này được DỰNG LẠI từ các bảng/cột mà code đang gọi, KHÔNG phải
--     bản gốc của bạn. Dùng cho: (a) dựng môi trường mới, hoặc (b) đối chiếu.
--   • Nếu DB thật đã tồn tại, ĐỪNG chạy nguyên file này. Hãy so từng bảng.
--   • Sau khi đối chiếu, cập nhật lại cho khớp DB thật rồi commit làm nguồn
--     sự thật duy nhất trong repo (supabase/migrations).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- BRANCHES ----------
create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------- USERS (hồ sơ, id = auth.uid) ----------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        text not null default 'employee'
                check (role in ('admin','director','manager','employee')),
  title       text,
  branch_id   uuid references public.branches(id) on delete set null,
  manager_id  uuid references public.users(id) on delete set null,
  is_active   boolean not null default true,
  avatar_url  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_users_branch on public.users(branch_id);
create index if not exists idx_users_manager on public.users(manager_id);

-- ---------- ATTENDANCE ----------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  branch_id   uuid references public.branches(id) on delete set null,
  type        text not null check (type in ('in','out')),
  photo_path  text,
  lat         double precision,
  lng         double precision,
  status      text check (status in ('ontime','late','early','invalid')),
  note        text,
  server_ts   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_att_user_ts on public.attendance(user_id, server_ts);
create index if not exists idx_att_branch_ts on public.attendance(branch_id, server_ts);

-- ---------- MESSAGES (1-1) ----------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.users(id) on delete cascade,
  sender_name   text,
  recipient_id  uuid not null references public.users(id) on delete cascade,
  content       text not null,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_msg_pair on public.messages(sender_id, recipient_id, created_at);
create index if not exists idx_msg_unread on public.messages(recipient_id, is_read);

-- ---------- NOTIFICATIONS ----------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.users(id) on delete cascade,
  scope        text not null default 'all' check (scope in ('all','role','user')),
  target_role  text check (target_role in ('admin','director','manager','employee')),
  target_id    uuid references public.users(id) on delete cascade,
  content      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notif_created on public.notifications(created_at desc);

create table if not exists public.notification_reads (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid not null references public.notifications(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  read_at          timestamptz not null default now(),
  unique (notification_id, user_id)
);

-- ---------- DAILY LOGS ----------
create table if not exists public.daily_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  log_date    date not null,
  content     text,
  blockers    text,
  plan_next   text,
  feedback    text,
  reviewed_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ---------- CHECKLISTS ----------
create table if not exists public.checklists (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  status      text not null default 'active',
  assigned_to uuid references public.users(id) on delete set null,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table if not exists public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references public.checklists(id) on delete cascade,
  content       text not null,
  is_done       boolean not null default false,
  done_at       timestamptz,
  sort_order    int not null default 0
);

-- ---------- HANDOVERS ----------
create table if not exists public.handovers (
  id           uuid primary key default gen_random_uuid(),
  giver_id     uuid not null references public.users(id) on delete cascade,
  receiver_id  uuid not null references public.users(id) on delete cascade,
  content      text not null,
  status       text not null default 'pending' check (status in ('pending','received')),
  received_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- RLS — BẬT trên mọi bảng. Chỉnh policy theo đúng nghiệp vụ của bạn.
-- (Đây là bộ policy an toàn tối thiểu, cần rà lại trước khi lên production.)
-- =====================================================================
alter table public.users              enable row level security;
alter table public.branches           enable row level security;
alter table public.attendance         enable row level security;
alter table public.messages           enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
alter table public.daily_logs         enable row level security;
alter table public.checklists         enable row level security;
alter table public.checklist_items    enable row level security;
alter table public.handovers          enable row level security;

-- Hàm tiện ích: vai trò của người đang đăng nhập
create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false)
$$;

-- USERS: tự đọc hồ sơ mình; admin đọc/ghi tất cả
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select using (id = auth.uid() or public.is_admin());
drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for all using (public.is_admin()) with check (public.is_admin());

-- BRANCHES: mọi người đăng nhập đọc; admin ghi
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select using (auth.uid() is not null);
drop policy if exists branches_admin on public.branches;
create policy branches_admin on public.branches for all using (public.is_admin()) with check (public.is_admin());

-- ATTENDANCE: tự ghi/đọc của mình; cấp trên (manager/director/admin) đọc
drop policy if exists att_insert_self on public.attendance;
create policy att_insert_self on public.attendance for insert with check (user_id = auth.uid());
drop policy if exists att_read on public.attendance;
create policy att_read on public.attendance for select
  using (user_id = auth.uid() or public.current_role() in ('manager','director','admin'));

-- MESSAGES: chỉ người gửi/nhận
drop policy if exists msg_rw on public.messages;
create policy msg_rw on public.messages for all
  using (sender_id = auth.uid() or recipient_id = auth.uid())
  with check (sender_id = auth.uid());
drop policy if exists msg_mark_read on public.messages;
create policy msg_mark_read on public.messages for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- NOTIFICATIONS: cấp trên tạo; người nhận theo scope đọc
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select using (
  scope = 'all'
  or (scope = 'role' and target_role = public.current_role())
  or (scope = 'user' and target_id = auth.uid())
  or sender_id = auth.uid()
);
drop policy if exists notif_write on public.notifications;
create policy notif_write on public.notifications for insert
  with check (public.current_role() in ('manager','director','admin'));

drop policy if exists notif_reads_rw on public.notification_reads;
create policy notif_reads_rw on public.notification_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- DAILY LOGS: tự ghi/đọc; cấp trên đọc & ghi feedback
drop policy if exists dl_self on public.daily_logs;
create policy dl_self on public.daily_logs for all
  using (user_id = auth.uid() or public.current_role() in ('manager','director','admin'))
  with check (user_id = auth.uid() or public.current_role() in ('manager','director','admin'));

-- CHECKLISTS / ITEMS: người đăng nhập đọc; cấp trên tạo; item cập nhật được
drop policy if exists cl_read on public.checklists;
create policy cl_read on public.checklists for select using (auth.uid() is not null);
drop policy if exists cl_write on public.checklists;
create policy cl_write on public.checklists for all
  using (public.current_role() in ('manager','director','admin'))
  with check (public.current_role() in ('manager','director','admin'));
drop policy if exists cli_read on public.checklist_items;
create policy cli_read on public.checklist_items for select using (auth.uid() is not null);
drop policy if exists cli_update on public.checklist_items;
create policy cli_update on public.checklist_items for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- HANDOVERS: chỉ người gửi/nhận
drop policy if exists ho_rw on public.handovers;
create policy ho_rw on public.handovers for all
  using (giver_id = auth.uid() or receiver_id = auth.uid())
  with check (giver_id = auth.uid());

-- =====================================================================
-- login_directory(): danh bạ tối thiểu cho màn hình đăng nhập.
-- ⚠️ Hàm này chạy TRƯỚC khi đăng nhập → chỉ trả về id, full_name, role
--   của người đang hoạt động. Xem thêm 0002 để dùng bản có tìm kiếm
--   (login_lookup) nhằm giảm lộ toàn bộ danh bạ.
-- =====================================================================
create or replace function public.login_directory()
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select id, full_name, role from public.users where is_active = true order by full_name
$$;
grant execute on function public.login_directory() to anon, authenticated;
