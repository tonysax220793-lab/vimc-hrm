import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import UserForm from './UserForm.jsx'
import BulkImport from './BulkImport.jsx'
import BranchManager from './BranchManager.jsx'
import UserEditModal from './UserEditModal.jsx'
import RolePill from '../components/RolePill.jsx'

export default function AdminPanel({ profile }) {
  const isManager = profile.role === 'manager'
  const managerBranch = isManager ? (profile.branch_id || '') : null

  const [activeTab, setActiveTab] = useState('personnel')
  const [stats, setStats] = useState({ users: 0, today: 0, pendingHandovers: 0 })
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState(managerBranch || '')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0])
  const [attendanceList, setAttendanceList] = useState([])
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  useEffect(() => {
    supabase.from('branches').select('id, name').then(({ data }) => setBranches(data || []))
  }, [])

  const load = useCallback(async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    let userQuery = supabase.from('users').select('id', { count: 'exact', head: true })
    let attQuery = supabase.from('attendance').select('id', { count: 'exact', head: true }).gte('server_ts', todayStart.toISOString())
    let handoverQuery = supabase.from('handovers').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    let listQuery = supabase.from('users').select('id, full_name, role, title, is_active, branch_id').order('full_name')

    const branchFilter = isManager ? managerBranch : selectedBranchId
    if (branchFilter) {
      userQuery = userQuery.eq('branch_id', branchFilter)
      attQuery = attQuery.eq('branch_id', branchFilter)
      listQuery = listQuery.eq('branch_id', branchFilter)
    }

    const [{ count: uCount }, { count: aCount }, { count: hCount }, { data: uList }] = await Promise.all([
      userQuery, attQuery, handoverQuery, listQuery,
    ])

    setStats({ users: uCount || 0, today: aCount || 0, pendingHandovers: hCount || 0 })
    setUsers(uList || [])
  }, [selectedBranchId, isManager, managerBranch])

  useEffect(() => { load() }, [load])

  const loadAttendanceDetails = useCallback(async () => {
    setLoadingAttendance(true)
    try {
      const startOfDay = new Date(attendanceDate); startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(attendanceDate); endOfDay.setHours(23, 59, 59, 999)

      let query = supabase
        .from('attendance')
        .select('id, type, photo_path, lat, lng, server_ts, status, note, address, distance_m, branch_id, user_id, users ( full_name, role, title )')
        .gte('server_ts', startOfDay.toISOString())
        .lte('server_ts', endOfDay.toISOString())
        .order('server_ts', { ascending: false })

      const branchFilter = isManager ? managerBranch : selectedBranchId
      if (branchFilter) query = query.eq('branch_id', branchFilter)

      const { data, error } = await query
      if (error) throw error

      const records = data || []
      const resolved = await Promise.all(
        records.map(async (rec) => {
          let signedUrl = ''
          if (rec.photo_path) {
            const { data: signData } = await supabase.storage.from('attendance-photos').createSignedUrl(rec.photo_path, 3600)
            signedUrl = signData?.signedUrl || ''
          }
          return { ...rec, photoUrl: signedUrl }
        })
      )
      setAttendanceList(resolved)
    } catch (e) {
      console.error('Lỗi tải chấm công: ', e.message)
    } finally {
      setLoadingAttendance(false)
    }
  }, [attendanceDate, selectedBranchId, isManager, managerBranch])

  useEffect(() => {
    if (activeTab === 'attendance') loadAttendanceDetails()
  }, [loadAttendanceDetails, activeTab])

  const toggleActive = async (u) => {
    const { error } = await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    if (!error) load()
  }

  const exportToCSV = () => {
    if (attendanceList.length === 0) return
    const headers = ['Họ tên', 'Vai trò', 'Chức danh', 'Chi nhánh', 'Thời gian', 'Loại', 'Trạng thái', 'Địa chỉ', 'Cách CN (m)', 'Vĩ độ', 'Kinh độ']
    const csvRows = [headers.join(',')]
    attendanceList.forEach((r) => {
      const u = r.users || {}
      const branchName = branches.find((b) => b.id === r.branch_id)?.name || 'Chưa gán'
      const timeStr = new Date(r.server_ts).toLocaleString('vi-VN')
      const typeStr = r.type === 'in' ? 'VÀO' : 'RA'
      let statusStr = 'Đúng giờ'
      if (r.status === 'late') statusStr = 'Đi muộn'
      if (r.status === 'early') statusStr = 'Về sớm'
      if (r.status === 'invalid') statusStr = 'Không hợp lệ'
      const row = [
        `"${u.full_name || ''}"`, `"${u.role || ''}"`, `"${u.title || ''}"`, `"${branchName}"`,
        `"${timeStr}"`, `"${typeStr}"`, `"${statusStr}"`, `"${r.address || ''}"`,
        r.distance_m ?? '', r.lat || '', r.lng || '',
      ]
      csvRows.push(row.join(','))
    })
    const csvContent = '﻿' + csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `VIMC_ChamCong_${attendanceDate}.csv`)
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
  }

  const statusBadge = (st) => {
    if (st === 'late') return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700">ĐI MUỘN</span>
    if (st === 'early') return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">VỀ SỚM</span>
    if (st === 'invalid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">SAI VỊ TRÍ</span>
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">ĐÚNG GIỜ</span>
  }

  return (
    <div className="max-w-lg mx-auto w-full px-container-margin pt-4 pb-24 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-surface-variant/50 shadow-sm flex flex-col justify-between">
          <span className="font-display-lg text-display-lg text-primary font-semibold leading-none mb-1">{stats.users}</span>
          <span className="text-[12px] font-medium text-on-surface-variant/60">Tổng nhân sự</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-surface-variant/50 shadow-sm flex flex-col justify-between">
          <span className="font-display-lg text-display-lg text-accent-green font-semibold leading-none mb-1">{stats.today}</span>
          <span className="text-[12px] font-medium text-on-surface-variant/60">Đã chấm công</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-surface-variant/50 shadow-sm flex flex-col justify-between">
          <span className="font-display-lg text-display-lg text-secondary font-semibold leading-none mb-1">{stats.pendingHandovers}</span>
          <span className="text-[12px] font-medium text-on-surface-variant/60">Bàn giao chờ</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface-container rounded-xl p-1 gap-1 border border-outline-variant/20">
        <button onClick={() => { setActiveTab('personnel'); setShowBulk(false); setShowForm(false) }}
          className={`flex-1 py-2 text-center rounded-lg text-[13px] transition-all ${activeTab === 'personnel' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant font-medium'}`}>
          Nhân sự
        </button>
        <button onClick={() => setActiveTab('attendance')}
          className={`flex-1 py-2 text-center rounded-lg text-[13px] transition-all ${activeTab === 'attendance' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant font-medium'}`}>
          Chấm công
        </button>
        <button onClick={() => setActiveTab('branches')}
          className={`flex-1 py-2 text-center rounded-lg text-[13px] transition-all ${activeTab === 'branches' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant font-medium'}`}>
          Chi nhánh
        </button>
      </div>

      {/* Branch selector — chỉ Admin */}
      {!isManager && (
        <div className="bg-white p-4 rounded-2xl border border-surface-variant/50 shadow-sm flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-charcoal-ink flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">domain</span>
            <span>Chọn chi nhánh theo dõi</span>
          </label>
          <select className="w-full h-11 px-3 bg-surface-container/50 border border-outline-variant rounded-xl text-[15px] focus:ring-1 focus:ring-primary outline-none"
            value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {/* BRANCHES */}
      {activeTab === 'branches' && <BranchManager lockBranchId={isManager ? managerBranch : null} />}

      {/* PERSONNEL */}
      {activeTab === 'personnel' && (
        <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-6">
          {showBulk ? (
            <BulkImport onImportComplete={() => { load() }} onCancel={() => setShowBulk(false)} />
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-title-lg text-title-lg text-charcoal-ink font-semibold">Nhân sự</h3>
                <div className="flex gap-2">
                  {!isManager && (
                    <button onClick={() => { setShowBulk(true); setShowForm(false) }}
                      className="h-10 px-3 bg-bronze-gold text-white rounded-xl text-[13px] font-medium shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">upload_file</span><span>Nhập hàng loạt</span>
                    </button>
                  )}
                  <button onClick={() => setShowForm((s) => !s)}
                    className="h-10 px-3 bg-primary text-white rounded-xl text-[13px] font-medium shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">{showForm ? 'close' : 'person_add'}</span>
                    <span>{showForm ? 'Đóng' : 'Thêm'}</span>
                  </button>
                </div>
              </div>

              {showForm && (
                <div className="p-4 bg-surface-container/50 border border-outline-variant/30 rounded-xl">
                  <UserForm defaultBranchId={isManager ? managerBranch : ''} lockBranch={isManager} lockRole={isManager} onCreated={() => { setShowForm(false); load() }} />
                </div>
              )}

              <div className="relative flex items-center pb-2">
                <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px]">search</span>
                <input type="text" placeholder="Tìm kiếm nhân sự..."
                  className="w-full h-10 pl-10 pr-4 bg-surface-container/50 border border-outline-variant rounded-xl text-[15px] focus:ring-1 focus:ring-primary outline-none"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>

              <div className="divide-y divide-outline-variant/20">
                {users.filter(u => u.full_name.toLowerCase().includes(searchQuery.toLowerCase())).map((u) => {
                  const branchName = branches.find(b => b.id === u.branch_id)?.name || 'Chưa gán chi nhánh'
                  return (
                    <div key={u.id} className="py-4 flex items-center justify-between group">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold text-[15px] ${u.is_active ? 'text-charcoal-ink' : 'text-on-surface-variant/40 line-through'}`}>{u.full_name}</span>
                          {!u.is_active && <span className="text-[10px] bg-outline-variant/30 text-on-surface-variant/75 px-2 py-0.5 rounded font-medium">Đã khóa</span>}
                        </div>
                        <p className="text-[13px] text-on-surface-variant/60 flex items-center gap-1.5 flex-wrap">
                          {u.title && <span>{u.title}</span>}
                          {u.title && <span className="text-outline-variant">•</span>}
                          <span className="text-primary font-medium">{branchName}</span>
                        </p>
                        <div><RolePill role={u.role} /></div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => setEditingUser(u)}
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-primary/5 text-primary hover:bg-primary/15 transition-all active:scale-95" title="Sửa nhân sự">
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button onClick={() => toggleActive(u)}
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 ${u.is_active ? 'bg-error/5 text-error hover:bg-error/15' : 'bg-primary/5 text-primary hover:bg-primary/15'}`}
                          title={u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}>
                          <span className="material-symbols-outlined text-[20px]">{u.is_active ? 'lock' : 'lock_open'}</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
                {users.length === 0 && <p className="text-center text-[14px] text-on-surface-variant/40 py-6 font-medium">Chưa có nhân sự nào.</p>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-title-lg text-title-lg text-charcoal-ink font-semibold">Lịch sử chấm công</h3>
            <button onClick={exportToCSV} disabled={attendanceList.length === 0}
              className="h-10 px-4 bg-primary text-white rounded-xl text-[13px] font-medium shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
              <span className="material-symbols-outlined text-[18px]">download</span><span>Xuất Excel</span>
            </button>
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-on-surface-variant">Chọn ngày xem công</label>
            <input type="date" className="w-full h-11 px-4 bg-surface-container/50 border border-outline-variant rounded-xl text-[15px] focus:ring-1 focus:ring-primary outline-none"
              value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
          </div>

          {loadingAttendance ? (
            <div className="py-12 text-center text-on-surface-variant/60 text-[14px]">
              <span className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-2"></span>
              <p>Đang tải lịch sử chấm công...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {attendanceList.map((rec) => {
                const u = rec.users || {}
                const branchName = branches.find((b) => b.id === rec.branch_id)?.name || 'Chưa gán'
                const timeStr = new Date(rec.server_ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                return (
                  <div key={rec.id} className="p-4 rounded-xl border border-surface-variant/50 bg-surface-container-lowest flex items-start justify-between gap-3 shadow-sm">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[15px] text-charcoal-ink">{u.full_name}</span>
                        {statusBadge(rec.status)}
                      </div>
                      <div className="space-y-1 text-xs text-on-surface-variant/80">
                        <p className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">schedule</span>
                          <span>{timeStr} — Chấm công {rec.type === 'in' ? 'VÀO' : 'RA'}</span>
                        </p>
                        <p className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">store</span>
                          <span>{branchName}{rec.distance_m != null ? ` · cách ~${rec.distance_m}m` : ''}</span>
                        </p>
                        {rec.address ? (
                          <p className="flex items-start gap-1"><span className="material-symbols-outlined text-sm">location_on</span><span className="line-clamp-2">{rec.address}</span></p>
                        ) : (rec.lat && rec.lng) ? (
                          <a href={`https://www.google.com/maps/search/?api=1&query=${rec.lat},${rec.lng}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 font-medium">
                            <span className="material-symbols-outlined text-sm">location_on</span>
                            <span>GPS: {rec.lat.toFixed(5)}, {rec.lng.toFixed(5)}</span>
                          </a>
                        ) : (
                          <p className="text-on-surface-variant/40 flex items-center gap-1"><span className="material-symbols-outlined text-sm">location_off</span><span>Không có tọa độ GPS</span></p>
                        )}
                      </div>
                    </div>
                    {rec.photoUrl ? (
                      <div onClick={() => setSelectedPhoto(rec.photoUrl)} className="w-16 h-20 rounded-lg overflow-hidden border border-outline-variant bg-surface-container flex-shrink-0 cursor-pointer hover:opacity-90 active:scale-95 transition-all" title="Click để phóng to ảnh">
                        <img src={rec.photoUrl} alt="Selfie" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-16 h-20 rounded-lg border border-dashed border-outline-variant flex items-center justify-center text-on-surface-variant/30 flex-shrink-0 bg-surface-container/30">
                        <span className="material-symbols-outlined text-xl">no_photography</span>
                      </div>
                    )}
                  </div>
                )
              })}
              {attendanceList.length === 0 && (
                <div className="p-8 text-center text-on-surface-variant/50 border border-dashed border-outline-variant rounded-xl text-[14px]">
                  <span className="material-symbols-outlined text-[48px] mb-2 text-outline-variant">person_search</span>
                  <p>Không ghi nhận lượt chấm công nào trong ngày {new Date(attendanceDate).toLocaleDateString('vi-VN')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal sửa nhân sự */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          branches={branches}
          isManager={isManager}
          managerBranch={managerBranch}
          onClose={() => setEditingUser(null)}
          onSaved={() => { load() }}
        />
      )}

      {/* Image Zoom Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-charcoal-ink/80 backdrop-blur-sm" onClick={() => setSelectedPhoto(null)}></div>
          <div className="bg-white rounded-2xl overflow-hidden max-w-sm w-full relative z-10 p-2 shadow-2xl flex flex-col items-center">
            <img src={selectedPhoto} alt="Zoomed Selfie" className="w-full h-auto rounded-xl object-contain max-h-[80vh]" />
            <button onClick={() => setSelectedPhoto(null)} className="mt-3 px-6 py-2 bg-primary text-white text-[15px] font-medium rounded-xl active:scale-95 transition-all">Đóng</button>
          </div>
        </div>
      )}
    </div>
  )
}
