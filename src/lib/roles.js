// Cấu hình hiển thị vai trò: nhãn tiếng Việt + màu nhận diện (pill).
export const ROLE_META = {
  admin:    { label: 'Quản trị viên', color: '#E03131' }, // Đỏ
  director: { label: 'Giám đốc',      color: '#1971C2' }, // Xanh dương
  manager:  { label: 'Quản lý',       color: '#7048E8' }, // Tím
  employee: { label: 'Nhân viên',     color: '#2F9E44' }, // Xanh lá
}

export const ROLE_OPTIONS = [
  { value: 'employee', label: 'Nhân viên' },
  { value: 'manager',  label: 'Quản lý' },
  { value: 'director', label: 'Giám đốc' },
  { value: 'admin',    label: 'Quản trị viên' },
]

export const canManageStaff = (role) => role === 'admin'
export const canAssignWork = (role) => ['manager', 'director', 'admin'].includes(role)
