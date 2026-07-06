-- =====================================================================
-- VIMC People — Chi nhánh: toạ độ + bán kính geofence + giờ làm quy định
-- và bổ sung địa chỉ / khoảng cách cho bản ghi chấm công.
-- AN TOÀN để chạy bổ sung (chỉ ADD COLUMN IF NOT EXISTS).
-- =====================================================================

-- Chi nhánh: vị trí trung tâm, bán kính cho phép chấm công, giờ vào/ra chuẩn.
alter table public.branches
  add column if not exists lat        double precision,
  add column if not exists lng        double precision,
  add column if not exists radius_m   integer not null default 300,
  add column if not exists work_start time    not null default '08:00',
  add column if not exists work_end   time    not null default '17:30';

-- Chấm công: lưu địa chỉ (reverse geocode) và khoảng cách tới chi nhánh (mét).
alter table public.attendance
  add column if not exists address    text,
  add column if not exists distance_m double precision;

comment on column public.branches.radius_m is 'Bán kính (mét) quanh chi nhánh cho phép chấm công (geofence).';
comment on column public.branches.work_start is 'Giờ vào chuẩn (để tính đi muộn).';
comment on column public.branches.work_end is 'Giờ ra chuẩn (để tính về sớm).';
comment on column public.attendance.status is 'ontime | late | early | invalid — tính khi chấm công.';
