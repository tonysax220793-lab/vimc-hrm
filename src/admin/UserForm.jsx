import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { ROLE_OPTIONS } from '../lib/roles.js'

// Props:
//  - defaultBranchId: chi nhánh mặc định
//  - lockBranch: khoá chọn chi nhánh (vai trò Quản lý → chỉ chi nhánh mình)
//  - lockRole: khoá vai trò = 'employee' (Quản lý chỉ tạo được nhân viên)
export default function UserForm({ onCreated, defaultBranchId = '', lockBranch = false, lockRole = false }) {
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('employee')
  const [title, setTitle] = useState('')
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [pin, setPin] = useState('')
  const [branches, setBranches] = useState([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('branches').select('id, name').then(({ data }) => setBranches(data || []))
  }, [])
  useEffect(() => { setBranchId(defaultBranchId) }, [defaultBranchId])

  const submit = async (e) => {
    e.preventDefault()
    if (!fullName.trim() || pin.length < 4) { setStatus('Nhập đủ Họ tên và PIN ≥ 4 số'); return }
    setBusy(true); setStatus('')
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          full_name: fullName,
          role: lockRole ? 'employee' : role,
          title,
          branch_id: (lockBranch ? defaultBranchId : branchId) || null,
          pin,
        },
      })
      if (error) throw error
      setStatus('✅ Đã tạo nhân sự: ' + (data?.full_name || fullName))
      setFullName(''); setTitle(''); setPin(''); setRole('employee'); setBranchId(defaultBranchId)
      onCreated?.()
    } catch (e2) {
      setStatus('Lỗi tạo nhân sự: ' + e2.message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full h-11 px-4 bg-white border border-outline-variant rounded-xl text-[15px] focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all'
  const branchName = branches.find((b) => b.id === defaultBranchId)?.name || 'Chi nhánh của bạn'

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Họ tên nhân viên</label>
        <input type="text" className={field} placeholder="Ví dụ: Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Vai trò hệ thống</label>
          {lockRole ? (
            <div className={`${field} flex items-center text-on-surface-variant/70`}>Nhân viên</div>
          ) : (
            <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Mã PIN đăng nhập</label>
          <input type="password" pattern="\d*" inputMode="numeric" className={field} placeholder="4–6 chữ số"
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
        </div>
      </div>

      <div>
        <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Chức danh cụ thể</label>
        <input type="text" className={field} placeholder="Ví dụ: Dược sĩ" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Chi nhánh trực thuộc</label>
        {lockBranch ? (
          <div className={`${field} flex items-center text-on-surface-variant/70`}>{branchName}</div>
        ) : (
          <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">— Chọn chi nhánh —</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {status && (
        <div className={`p-3 text-center text-[14px] font-semibold rounded-xl border ${status.includes('Lỗi') ? 'bg-error-container/20 text-error border-error-container/30' : 'bg-primary/10 text-primary border-primary/20'}`}>
          {status}
        </div>
      )}

      <button className="w-full h-12 bg-primary text-white rounded-xl text-[15px] font-semibold shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50" type="submit" disabled={busy}>
        {busy ? (<><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span><span>Đang khởi tạo...</span></>) : <span>Tạo nhân sự</span>}
      </button>
    </form>
  )
}
