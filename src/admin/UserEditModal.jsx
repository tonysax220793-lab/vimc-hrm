import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { ROLE_OPTIONS } from '../lib/roles.js'

// Sửa nhân sự: đổi vai trò/chi nhánh (bổ nhiệm), chức danh, khoá/mở, đổi PIN, xóa.
// isManager: khoá vai trò=employee & chi nhánh của quản lý.
export default function UserEditModal({ user, branches, isManager, managerBranch, onClose, onSaved }) {
  const [fullName, setFullName] = useState(user.full_name || '')
  const [role, setRole] = useState(user.role || 'employee')
  const [title, setTitle] = useState(user.title || '')
  const [branchId, setBranchId] = useState(user.branch_id || '')
  const [isActive, setIsActive] = useState(user.is_active !== false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [msg, setMsg] = useState('')

  const saveProfile = async () => {
    setBusy(true); setMsg('')
    const payload = {
      full_name: fullName.trim(),
      role: isManager ? 'employee' : role,
      title: title.trim() || null,
      branch_id: (isManager ? managerBranch : branchId) || null,
      is_active: isActive,
    }
    const { error } = await supabase.from('users').update(payload).eq('id', user.id)
    setBusy(false)
    if (error) { setMsg('Lỗi lưu: ' + error.message); return }
    setMsg('✅ Đã lưu thay đổi.')
    onSaved?.()
  }

  const resetPin = async () => {
    if (pin.length < 4) { setMsg('PIN mới phải ≥ 4 số.'); return }
    setBusy(true); setMsg('')
    const { error } = await supabase.functions.invoke('admin-user', { body: { action: 'reset_pin', user_id: user.id, pin } })
    setBusy(false)
    if (error) { setMsg('Lỗi đổi PIN: ' + error.message); return }
    setPin(''); setMsg('✅ Đã đổi PIN cho nhân sự này.')
  }

  const remove = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.functions.invoke('admin-user', { body: { action: 'delete', user_id: user.id } })
    setBusy(false)
    if (error) { setMsg('Lỗi xóa: ' + error.message); return }
    onSaved?.(); onClose?.()
  }

  const field = 'w-full h-11 px-3 bg-white border border-outline-variant rounded-xl text-[15px] focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all'

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-charcoal-ink/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/90 backdrop-blur-md px-5 h-14 flex items-center justify-between border-b border-surface-variant/40">
          <h3 className="font-title-lg text-title-lg text-charcoal-ink font-semibold truncate">Sửa nhân sự</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Họ tên</label>
            <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Vai trò</label>
              {isManager ? (
                <div className={`${field} flex items-center text-on-surface-variant/70`}>Nhân viên</div>
              ) : (
                <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Chi nhánh</label>
              {isManager ? (
                <div className={`${field} flex items-center text-on-surface-variant/70`}>{branches.find(b => b.id === managerBranch)?.name || 'Chi nhánh của bạn'}</div>
              ) : (
                <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">— Chưa gán —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Chức danh</label>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Dược sĩ" />
          </div>

          <label className="flex items-center gap-2 text-[15px] text-charcoal-ink">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-5 h-5 accent-primary" />
            Đang hoạt động (bỏ tick = khóa tài khoản)
          </label>

          {msg && <p className={`text-[14px] ${msg.startsWith('✅') ? 'text-primary' : 'text-error'}`}>{msg}</p>}

          <button onClick={saveProfile} disabled={busy} className="w-full h-11 bg-primary text-white rounded-xl text-[15px] font-semibold shadow active:scale-[0.98] disabled:opacity-50">
            Lưu thay đổi
          </button>

          {/* Đổi PIN */}
          <div className="pt-3 border-t border-outline-variant/30">
            <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Đặt lại PIN đăng nhập</label>
            <div className="flex gap-2">
              <input className={field} type="password" inputMode="numeric" placeholder="PIN mới (4–6 số)" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              <button onClick={resetPin} disabled={busy} className="h-11 px-4 bg-bronze-gold text-white rounded-xl text-[14px] font-medium whitespace-nowrap disabled:opacity-50">Đổi PIN</button>
            </div>
          </div>

          {/* Xóa */}
          <div className="pt-3 border-t border-outline-variant/30">
            {confirmDel ? (
              <div className="space-y-2">
                <p className="text-[14px] text-error font-medium">Xóa vĩnh viễn nhân sự này? Không thể hoàn tác.</p>
                <div className="flex gap-2">
                  <button onClick={remove} disabled={busy} className="flex-1 h-11 bg-error text-white rounded-xl text-[15px] font-semibold disabled:opacity-50">Xác nhận xóa</button>
                  <button onClick={() => setConfirmDel(false)} className="flex-1 h-11 bg-surface-container text-on-surface-variant rounded-xl text-[15px] font-medium">Huỷ</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="w-full h-11 bg-error/10 text-error rounded-xl text-[15px] font-medium flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">delete</span> Xóa nhân sự
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
