import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import RolePill from '../../components/RolePill.jsx'
import { toKey, isSunday, holidayName } from '../../lib/holidays.js'

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export default function ProfileScreen({ profile, onOpenSettings, canManage, onOpenAdmin }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [byDate, setByDate] = useState({})
  const [branchName, setBranchName] = useState('')

  useEffect(() => {
    if (!profile.branch_id) { setBranchName(''); return }
    supabase.from('branches').select('name').eq('id', profile.branch_id).single()
      .then(({ data }) => setBranchName(data?.name || ''))
  }, [profile.branch_id])

  const load = useCallback(async () => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    const { data } = await supabase
      .from('attendance')
      .select('server_ts, type, status')
      .eq('user_id', profile.id)
      .eq('type', 'in')
      .gte('server_ts', start.toISOString())
      .lt('server_ts', end.toISOString())
    const map = {}
    for (const r of data || []) {
      const k = toKey(new Date(r.server_ts))
      if (!map[k]) map[k] = r.status || 'ontime'
    }
    setByDate(map)
  }, [cursor, profile.id])

  useEffect(() => { load() }, [load])

  const todayKey = toKey(new Date())

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7
    const arr = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    return arr
  }, [cursor])

  const dayMeta = (d) => {
    const key = toKey(d)
    const st = byDate[key]
    if (st === 'ontime') return { cls: 'bg-green-100 text-green-700 border-green-200', label: 'Đúng giờ' }
    if (st === 'late') return { cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Đi muộn' }
    if (st === 'early') return { cls: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Về sớm' }
    if (isSunday(d) || holidayName(key)) return { cls: 'bg-surface-container text-on-surface-variant/50 border-transparent', label: 'Nghỉ' }
    if (key < todayKey) return { cls: 'bg-error/5 text-error/70 border-error/20', label: 'Chưa chấm' }
    if (key === todayKey) return { cls: 'bg-primary/5 text-primary border-primary/30 font-bold', label: 'Hôm nay' }
    return { cls: 'bg-white text-on-surface-variant/40 border-surface-variant/40', label: '' }
  }

  const summary = useMemo(() => {
    let ontime = 0, late = 0, missing = 0
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d)
      const key = toKey(date)
      const st = byDate[key]
      if (st === 'ontime') ontime++
      else if (st === 'late') late++
      else if (!isSunday(date) && !holidayName(key) && key < todayKey) missing++
    }
    return { ontime, late, missing }
  }, [byDate, cursor, todayKey])

  const monthLabel = cursor.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
  const move = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))

  return (
    <div className="max-w-lg mx-auto w-full px-container-margin pt-4 pb-24 space-y-6">
      {/* Nút vào khu quản trị (admin / quản lý chi nhánh) */}
      {canManage && (
        <button
          onClick={onOpenAdmin}
          className="w-full h-14 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          <span className="font-semibold text-[15px]">{profile.role === 'admin' ? 'Vào khu quản trị' : 'Vào khu quản lý chi nhánh'}</span>
        </button>
      )}

      {/* Thông tin cá nhân */}
      <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="font-title-lg text-title-lg text-charcoal-ink font-semibold">{profile.full_name}</h2>
            <p className="text-[13px] text-on-surface-variant/70">{profile.title || '—'}{branchName ? ` · ${branchName}` : ''}</p>
            <div className="pt-1"><RolePill role={profile.role} /></div>
          </div>
          <button onClick={onOpenSettings} className="h-10 px-3 bg-primary/10 text-primary rounded-xl text-[13px] font-medium flex items-center gap-1.5 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[18px]">settings</span> Cài đặt
          </button>
        </div>
      </div>

      {/* Tổng hợp tháng */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-surface-variant/50 shadow-sm text-center">
          <p className="font-display-lg text-display-lg text-green-600 font-semibold leading-none mb-1">{summary.ontime}</p>
          <p className="text-[12px] font-medium text-on-surface-variant/60">Đúng giờ</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-surface-variant/50 shadow-sm text-center">
          <p className="font-display-lg text-display-lg text-yellow-600 font-semibold leading-none mb-1">{summary.late}</p>
          <p className="text-[12px] font-medium text-on-surface-variant/60">Đi muộn</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-surface-variant/50 shadow-sm text-center">
          <p className="font-display-lg text-display-lg text-error font-semibold leading-none mb-1">{summary.missing}</p>
          <p className="text-[12px] font-medium text-on-surface-variant/60">Chưa chấm</p>
        </div>
      </div>

      {/* Lịch tháng */}
      <div className="bg-white p-5 rounded-2xl border border-surface-variant/50 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => move(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <h3 className="font-title-lg text-title-lg text-charcoal-ink font-semibold capitalize">{monthLabel}</h3>
          <button onClick={() => move(1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[12px] font-medium text-on-surface-variant/60">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const m = dayMeta(d)
            return (
              <div key={i} title={m.label} className={`aspect-square rounded-lg border flex items-center justify-center text-[14px] ${m.cls}`}>
                {d.getDate()}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[12px] font-medium text-on-surface-variant/70">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-200"></span>Đúng giờ</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200"></span>Đi muộn</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-error/5 border border-error/20"></span>Chưa chấm</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-surface-container"></span>Nghỉ</span>
        </div>
      </div>
    </div>
  )
}
