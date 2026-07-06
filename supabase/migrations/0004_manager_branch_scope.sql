-- =====================================================================
-- VIMC People — Phân quyền QUẢN LÝ CHI NHÁNH (branch-scope) qua RLS
-- Quản lý (role='manager') chỉ thao tác trong chi nhánh của mình.
-- AN TOÀN chạy bổ sung. Cần đã có 0001 (hàm current_role, is_admin).
-- =====================================================================

-- Chi nhánh của người đang đăng nhập.
create or replace function public.current_branch()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.users where id = auth.uid()
$$;

-- ---------- USERS: Quản lý đọc/sửa nhân sự trong chi nhánh mình ----------
drop policy if exists users_manager_read on public.users;
create policy users_manager_read on public.users for select
  using (public.current_role() = 'manager' and branch_id = public.current_branch());

drop policy if exists users_manager_update on public.users;
create policy users_manager_update on public.users for update
  using (public.current_role() = 'manager' and branch_id = public.current_branch())
  with check (public.current_role() = 'manager' and branch_id = public.current_branch());

-- ---------- BRANCHES: Quản lý sửa chi nhánh của mình ----------
drop policy if exists branches_manager_update on public.branches;
create policy branches_manager_update on public.branches for update
  using (public.current_role() = 'manager' and id = public.current_branch())
  with check (public.current_role() = 'manager' and id = public.current_branch());

-- ---------- ATTENDANCE: thu hẹp — Quản lý chỉ xem chấm công chi nhánh mình ----------
-- Thay policy đọc cũ (cho manager xem tất cả) bằng: tự xem của mình + director/admin xem tất cả.
drop policy if exists att_read on public.attendance;
create policy att_read on public.attendance for select
  using (user_id = auth.uid() or public.current_role() in ('director','admin'));

-- Manager xem chấm công trong chi nhánh mình.
drop policy if exists att_manager_branch on public.attendance;
create policy att_manager_branch on public.attendance for select
  using (public.current_role() = 'manager' and branch_id = public.current_branch());

-- ---------- DAILY LOGS: Quản lý xem & ghi feedback cho NV chi nhánh mình ----------
-- (0001 cho manager/director/admin xem TẤT CẢ; siết lại theo chi nhánh cho manager.)
drop policy if exists dl_self on public.daily_logs;
create policy dl_self on public.daily_logs for all
  using (
    user_id = auth.uid()
    or public.current_role() in ('director','admin')
    or (public.current_role() = 'manager'
        and exists (select 1 from public.users u where u.id = daily_logs.user_id and u.branch_id = public.current_branch()))
  )
  with check (
    user_id = auth.uid()
    or public.current_role() in ('director','admin')
    or (public.current_role() = 'manager'
        and exists (select 1 from public.users u where u.id = daily_logs.user_id and u.branch_id = public.current_branch()))
  );
