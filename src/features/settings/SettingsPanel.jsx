import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

// Panel Cài đặt: đổi PIN + xem giờ làm & chi nhánh (do Admin quản lý).
export default function SettingsPanel({ isOpen, onClose, profile }) {
  const [branch, setBranch] = useState(null)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!isOpen || !profile?.branch_id) { setBranch(null); return }
    supabase
      .from('branches')
      .select('name, work_start, work_end, radius_m')
      .eq('id', profile.branch_id)
      .single()
      .then(({ data }) => setBranch(data || null))
  }, [isOpen, profile?.branch_id])

  const changePin = async (e) => {
    e.preventDefault()
    setMsg('')
    if (pin.length < 4 || pin.length > 6) { setMsg('PIN phải 4–6 chữ số.'); return }
    if (pin !== pin2) { setMsg('Hai lần nhập PIN không khớp.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pin })
    setBusy(false)
    if (error) { setMsg('Lỗi đổi PIN: ' + error.message); return }
    setPin(''); setPin2('')
    setMsg('✅ Đã đổi PIN thành công. Lần đăng nhập sau dùng PIN mới.')
  }

  if (!isOpen) return null

  const field = 'w-full h-11 px-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all'

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-charcoal-ink/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md h-full bg-surface-container-lowest shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white/90 backdrop-blur-md px-6 h-16 flex items-center justify-between border-b border-surface-variant/40">
          <h2 className="font-headline-md text-title-lg font-bold text-primary">Cài đặt</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Đổi PIN */}
          <section className="bg-white p-5 rounded-2xl border border-surface-variant/50 shadow-sm">
            <h3 className="font-title-lg text-title-lg text-charcoal-ink font-semibold mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">password</span> Đổi mã PIN
            </h3>
            <form onSubmit={changePin} className="space-y-3">
              <input className={field} type="password" inputMode="numeric" placeholder="PIN mới (4–6 số)"
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              <input className={field} type="password" inputMode="numeric" placeholder="Nhập lại PIN mới"
                value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              {msg && <p className={`font-body-md text-body-md ${msg.startsWith('✅') ? 'text-primary' : 'text-error'}`}>{msg}</p>}
              <button disabled={busy} className="w-full h-11 bg-primary text-white rounded-xl font-label-lg text-label-lg shadow active:scale-[0.98] disabled:opacity-50">
                {busy ? 'Đang lưu...' : 'Cập nhật PIN'}
              </button>
            </form>
          </section>

          {/* Giờ làm & chi nhánh (chỉ xem) */}
          <section className="bg-white p-5 rounded-2xl border border-surface-variant/50 shadow-sm space-y-2">
            <h3 className="font-title-lg text-title-lg text-charcoal-ink font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">schedule</span> Giờ làm & chi nhánh
            </h3>
            <p className="font-body-lg text-body-lg text-charcoal-ink"><strong className="text-on-surface-variant/70 font-medium">Chi nhánh: </strong>{branch?.name || 'Chưa gán'}</p>
            <p className="font-body-lg text-body-lg text-charcoal-ink"><strong className="text-on-surface-variant/70 font-medium">Giờ vào–ra: </strong>
              {branch ? `${String(branch.work_start).slice(0,5)} – ${String(branch.work_end).slice(0,5)}` : '—'}
            </p>
            <p className="font-body-lg text-body-lg text-charcoal-ink"><strong className="text-on-surface-variant/70 font-medium">Bán kính chấm công: </strong>{branch ? `${branch.radius_m || 300}m` : '—'}</p>
            <p className="font-label-md text-label-md text-on-surface-variant/60 pt-1">Giờ làm & chi nhánh do Admin thiết lập. Cần thay đổi, vui lòng liên hệ Admin.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
