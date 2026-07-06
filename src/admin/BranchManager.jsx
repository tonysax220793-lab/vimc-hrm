import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { mapsLink, embedMap, forwardGeocode, reverseGeocode } from '../lib/geo.js'

const EMPTY = { name: '', address: '', lat: '', lng: '', radius_m: 300, work_start: '08:00', work_end: '17:30' }

// lockBranchId: nếu có (vai trò Quản lý) → chỉ sửa đúng chi nhánh đó, không tạo mới.
export default function BranchManager({ lockBranchId = null }) {
  const [branches, setBranches] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState('')
  const [finding, setFinding] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    let q = supabase.from('branches').select('id, name, lat, lng, radius_m, work_start, work_end').order('name')
    if (lockBranchId) q = q.eq('id', lockBranchId)
    const { data } = await q
    setBranches(data || [])
    if (lockBranchId && data && data[0]) fillForm(data[0])
  }, [lockBranchId])

  useEffect(() => { load() }, [load])

  const fillForm = (b) => {
    setEditing(b.id)
    setForm({
      name: b.name || '', address: '', lat: b.lat ?? '', lng: b.lng ?? '',
      radius_m: b.radius_m ?? 300,
      work_start: (b.work_start || '08:00').slice(0, 5),
      work_end: (b.work_end || '17:30').slice(0, 5),
    })
    setStatus('')
  }

  const startNew = () => { setEditing('new'); setForm(EMPTY); setStatus('') }
  const cancel = () => { if (!lockBranchId) setEditing(null); setStatus('') }

  // Tìm địa chỉ → toạ độ + hiện bản đồ (OpenStreetMap, miễn phí).
  const findAddress = async () => {
    if (!form.address.trim()) { setStatus('⚠️ Nhập địa chỉ để tìm.'); return }
    setFinding(true); setStatus('')
    const r = await forwardGeocode(form.address)
    setFinding(false)
    if (r.error) {
      if (r.error === 'not_found') {
        setStatus('⚠️ Không tìm thấy địa chỉ. Thử nhập cụ thể hơn (số nhà, đường, phường/quận, tỉnh/thành). Hoặc dùng "Vị trí hiện tại".')
      } else if (r.error === 'network' || r.error === 'http') {
        setStatus('⚠️ Lỗi kết nối dịch vụ bản đồ, thử lại sau vài giây.' + (r.errorMessage ? ` (${r.errorMessage})` : ''))
      } else {
        setStatus('⚠️ Không tìm được vị trí, thử lại.')
      }
      return
    }
    setForm((f) => ({ ...f, lat: r.lat.toFixed(6), lng: r.lng.toFixed(6), address: r.formatted || f.address }))
    setStatus('✅ Đã tìm thấy — kiểm tra vị trí trên bản đồ, đúng thì bấm Lưu.')
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setStatus('⚠️ Thiết bị không hỗ trợ GPS.'); return }
    setStatus('Đang lấy vị trí...')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude
        const addr = await reverseGeocode(lat, lng)
        setForm((f) => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6), address: addr || f.address }))
        setStatus('✅ Đã lấy vị trí hiện tại — kiểm tra trên bản đồ rồi Lưu.')
      },
      (err) => setStatus('⚠️ Không lấy được vị trí: ' + err.message),
      { enableHighAccuracy: true }
    )
  }

  const save = async () => {
    if (!form.name.trim()) { setStatus('⚠️ Nhập tên chi nhánh.'); return }
    if (form.lat === '' || form.lng === '') { setStatus('⚠️ Chưa có vị trí. Hãy tìm địa chỉ hoặc dùng vị trí hiện tại.'); return }
    setBusy(true); setStatus('')
    const payload = {
      name: form.name.trim(),
      lat: Number(form.lat), lng: Number(form.lng),
      radius_m: Number(form.radius_m) || 300,
      work_start: form.work_start, work_end: form.work_end,
    }
    let error
    if (editing === 'new') ({ error } = await supabase.from('branches').insert(payload))
    else ({ error } = await supabase.from('branches').update(payload).eq('id', editing))
    setBusy(false)
    if (error) { setStatus('⚠️ Lỗi: ' + error.message); return }
    setStatus('✅ Đã lưu chi nhánh.')
    if (!lockBranchId) setEditing(null)
    load()
  }

  const hasPos = form.lat !== '' && form.lng !== ''
  const field = 'w-full h-11 px-3 bg-white border border-outline-variant rounded-xl text-[15px] focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all'

  return (
    <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-title-lg text-title-lg text-charcoal-ink font-semibold">
          {lockBranchId ? 'Chi nhánh của tôi' : 'Quản lý chi nhánh'}
        </h3>
        {!lockBranchId && editing === null && (
          <button onClick={startNew} className="h-10 px-3 bg-primary text-white rounded-xl text-[13px] font-medium shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">add_location_alt</span><span>Thêm chi nhánh</span>
          </button>
        )}
      </div>

      {editing !== null && (
        <div className="p-4 bg-surface-container/40 border border-outline-variant/30 rounded-xl space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Tên chi nhánh</label>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Trụ sở chính (HN)" />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Địa chỉ chi nhánh</label>
            <div className="flex gap-2">
              <input className={field} value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findAddress() } }}
                placeholder="VD: 108 Nguyễn Trãi, Thanh Xuân, Hà Nội" />
              <button onClick={findAddress} type="button" disabled={finding}
                className="h-11 px-4 bg-primary text-white rounded-xl text-[14px] font-medium whitespace-nowrap disabled:opacity-50 flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">search</span>{finding ? '...' : 'Tìm'}
              </button>
            </div>
          </div>

          {hasPos && (
            <div className="space-y-1">
              <iframe title="Bản đồ chi nhánh" src={embedMap(form.lat, form.lng)} className="w-full h-56 rounded-xl border border-outline-variant" loading="lazy" />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[12px] text-on-surface-variant/70">📍 {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}</p>
                <a href={mapsLink(form.lat, form.lng)} target="_blank" rel="noopener noreferrer" className="text-[12px] text-primary font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span> Mở bản đồ
                </a>
              </div>
            </div>
          )}

          <button onClick={useMyLocation} type="button" className="h-9 px-3 bg-bronze-gold/15 text-bronze-gold rounded-lg text-[13px] font-medium flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">my_location</span> Dùng vị trí hiện tại (đứng tại chi nhánh)
          </button>

          <details className="text-[13px]">
            <summary className="cursor-pointer text-on-surface-variant/70 select-none">Nhập toạ độ thủ công (nâng cao)</summary>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <input className={field} value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="Vĩ độ (lat)" inputMode="decimal" />
              <input className={field} value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="Kinh độ (lng)" inputMode="decimal" />
            </div>
          </details>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Bán kính (m)</label>
              <input className={field} type="number" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Giờ vào</label>
              <input className={field} type="time" value={form.work_start} onChange={(e) => setForm({ ...form, work_start: e.target.value })} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-charcoal-ink mb-1">Giờ ra</label>
              <input className={field} type="time" value={form.work_end} onChange={(e) => setForm({ ...form, work_end: e.target.value })} />
            </div>
          </div>

          {status && <p className={`text-[14px] ${status.startsWith('✅') ? 'text-primary' : 'text-error'}`}>{status}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="h-11 px-5 bg-primary text-white rounded-xl text-[15px] font-semibold shadow active:scale-[0.98] disabled:opacity-50">
              {busy ? 'Đang lưu...' : 'Lưu'}
            </button>
            {!lockBranchId && <button onClick={cancel} className="h-11 px-5 bg-surface-container text-on-surface-variant rounded-xl text-[15px] font-medium">Huỷ</button>}
          </div>
        </div>
      )}

      {!lockBranchId && (
        <div className="divide-y divide-outline-variant/20">
          {branches.map((b) => (
            <div key={b.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[15px] text-charcoal-ink truncate">{b.name}</p>
                <p className="text-[13px] text-on-surface-variant/70">
                  {b.lat != null ? `${Number(b.lat).toFixed(5)}, ${Number(b.lng).toFixed(5)} · ${b.radius_m || 300}m` : 'Chưa đặt toạ độ'} · {String(b.work_start).slice(0, 5)}–{String(b.work_end).slice(0, 5)}
                </p>
              </div>
              <button onClick={() => fillForm(b)} className="w-9 h-9 rounded-full flex items-center justify-center bg-primary/5 text-primary hover:bg-primary/15 transition-all active:scale-95">
                <span className="material-symbols-outlined text-[20px]">edit</span>
              </button>
            </div>
          ))}
          {branches.length === 0 && <p className="text-center text-[14px] text-on-surface-variant/50 py-6">Chưa có chi nhánh nào.</p>}
        </div>
      )}
    </div>
  )
}
