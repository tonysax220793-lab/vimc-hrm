import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { toKey, holidayName, isSunday } from '../../lib/holidays.js'
import RolePill from '../../components/RolePill.jsx'

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export default function DailyLog({ profile }) {
  const isSuperior = ['admin', 'director', 'manager'].includes(profile.role)
  const [activeView, setActiveView] = useState('personal') // personal | review
  
  const today = new Date()
  const todayKey = toKey(today)
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [logsByDate, setLogsByDate] = useState({})
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [content, setContent] = useState('')
  const [blockers, setBlockers] = useState('')
  const [planNext, setPlanNext] = useState('')
  const [feedback, setFeedback] = useState('')
  const [status, setStatus] = useState('')

  // Subordinates states
  const [subordinates, setSubordinates] = useState([])
  const [subLogs, setSubLogs] = useState([]) // logs for all users on selected date
  const [selectedSubId, setSelectedSubId] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor])
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor])

  // Fetch month logs for personal view
  const loadMonth = useCallback(async () => {
    const { data } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', profile.id)
      .gte('log_date', toKey(monthStart))
      .lte('log_date', toKey(monthEnd))
    const map = {}
    for (const row of data || []) map[row.log_date] = row
    setLogsByDate(map)
  }, [profile.id, monthStart, monthEnd])

  useEffect(() => {
    if (activeView === 'personal') {
      loadMonth()
    }
  }, [loadMonth, activeView])

  // Fetch subordinates list
  useEffect(() => {
    if (isSuperior && activeView === 'review') {
      supabase
        .from('users')
        .select('id, full_name, role, title, branch_id')
        .neq('id', profile.id)
        .order('full_name')
        .then(({ data }) => {
          setSubordinates(data || [])
          if (data && data.length > 0) {
            setSelectedSubId(data[0].id)
          }
        })
    }
  }, [isSuperior, activeView, profile.id])

  // Fetch subordinates logs for selected date
  const loadSubLogs = useCallback(async () => {
    if (!isSuperior || activeView !== 'review') return
    const { data } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('log_date', selectedKey)
    setSubLogs(data || [])
  }, [isSuperior, activeView, selectedKey])

  useEffect(() => {
    loadSubLogs()
  }, [loadSubLogs])

  // Find selected subordinate's log for the day
  const selectedSubLog = useMemo(() => {
    return subLogs.find(l => l.user_id === selectedSubId)
  }, [subLogs, selectedSubId])

  // Sync feedback textarea when selecting subordinate or logs update
  useEffect(() => {
    setReviewFeedback(selectedSubLog?.feedback || '')
    setReviewStatus('')
  }, [selectedSubLog])

  // Get metadata for a date (personal view)
  const metaOf = useCallback((dateObj) => {
    const key = toKey(dateObj)
    const hol = holidayName(key)
    if (hol) return { state: 'holiday', label: 'Nghỉ lễ', name: hol }
    if (isSunday(dateObj)) return { state: 'sunday', label: 'Nghỉ' }
    const log = logsByDate[key]
    if (log && log.content) return { state: 'written', label: 'Đã viết' }
    if (key <= todayKey) return { state: 'todo', label: 'Cần hoàn thành' }
    return { state: 'future', label: '' }
  }, [logsByDate, todayKey])

  // Month cells grid
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const lead = (first.getDay() + 6) % 7 // lead cells starting monday
    const days = monthEnd.getDate()
    const arr = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= days; d++) arr.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    return arr
  }, [cursor, monthEnd])

  // Count missing entries
  const todoCount = useMemo(
    () => cells.filter((d) => d && metaOf(d).state === 'todo').length,
    [cells, metaOf]
  )

  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedKey.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [selectedKey])
  
  const selectedMeta = metaOf(selectedDate)
  const isOff = selectedMeta.state === 'holiday' || selectedMeta.state === 'sunday'

  // Sync editor when selecting a date
  useEffect(() => {
    const log = logsByDate[selectedKey]
    setContent(log?.content || '')
    setBlockers(log?.blockers || '')
    setPlanNext(log?.plan_next || '')
    setFeedback(log?.feedback || '')
    setStatus('')
  }, [selectedKey, logsByDate])

  // Save personal log
  const save = async () => {
    if (isOff) return
    if (!content.trim()) {
      setStatus('Vui lòng nhập nội dung đã làm.')
      return
    }
    const { error } = await supabase.from('daily_logs').upsert(
      { user_id: profile.id, log_date: selectedKey, content, blockers, plan_next: planNext },
      { onConflict: 'user_id,log_date' }
    )
    setStatus(error ? 'Lỗi: ' + error.message : '✅ Đã lưu nhật ký thành công!')
    loadMonth()
  }

  // Save manager feedback
  const saveFeedback = async () => {
    if (!selectedSubId || !selectedSubLog) return
    setReviewBusy(true)
    setReviewStatus('')
    try {
      const { error } = await supabase
        .from('daily_logs')
        .update({ feedback: reviewFeedback.trim() })
        .eq('id', selectedSubLog.id)

      if (error) throw error
      setReviewStatus('✅ Đã lưu nhận xét thành công!')
      loadSubLogs()
    } catch (e) {
      setReviewStatus('Lỗi: ' + e.message + ' (Đảm bảo cột feedback đã được tạo và RLS cấp quyền)')
    } finally {
      setReviewBusy(false)
    }
  }

  const monthLabel = `Tháng ${cursor.getMonth() + 1}, ${cursor.getFullYear()}`
  const shift = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))

  return (
    <div className="space-y-6">
      {/* Superior toggle between Personal and Review views */}
      {isSuperior && (
        <div className="flex bg-surface-container rounded-xl p-1 gap-1 border border-outline-variant/20">
          <button
            onClick={() => setActiveView('personal')}
            className={`flex-1 py-2 text-center rounded-lg font-label-md text-label-md transition-all ${activeView === 'personal' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant'}`}
          >
            Nhật ký của tôi
          </button>
          <button
            onClick={() => setActiveView('review')}
            className={`flex-1 py-2 text-center rounded-lg font-label-md text-label-md transition-all ${activeView === 'review' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant'}`}
          >
            Duyệt nhật ký cấp dưới
          </button>
        </div>
      )}

      {activeView === 'personal' ? (
        <>
          {/* Calendar Card */}
          <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <button
                className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
                onClick={() => shift(-1)}
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <h3 className="font-title-lg text-title-lg text-charcoal-ink">{monthLabel}</h3>
              <button
                className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
                onClick={() => shift(1)}
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>

            {todoCount > 0 && (
              <div className="flex items-center gap-2 mb-6 p-4 rounded-xl bg-secondary-container/10 border border-secondary-container/20 text-on-secondary-container text-body-md font-medium">
                <span className="material-symbols-outlined text-[20px] text-secondary">error</span>
                <span>Còn {todoCount} ngày làm việc chưa viết nhật ký trong tháng này.</span>
              </div>
            )}

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-y-2 text-center mb-2">
              {WEEKDAYS.map((w) => (
                <p key={w} className="font-label-md text-label-md text-on-surface-variant/60">{w}</p>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} className="aspect-square" />
                const key = toKey(d)
                const m = metaOf(d)
                const isSelected = key === selectedKey
                
                let btnClass = "relative aspect-square rounded-2xl flex flex-col items-center justify-center hover:bg-surface-container transition-colors group "
                if (isSelected) {
                  btnClass += "bg-primary text-white hover:bg-primary/95 shadow-sm"
                } else if (m.state === 'holiday' || m.state === 'sunday') {
                  btnClass += "text-on-surface-variant/40 bg-surface-container/30"
                } else {
                  btnClass += "text-charcoal-ink"
                }

                return (
                  <button
                    key={key}
                    className={btnClass}
                    title={m.name || m.label}
                    onClick={() => setSelectedKey(key)}
                  >
                    <span className="font-label-lg text-label-lg">{d.getDate()}</span>
                    {/* Visual Indicators */}
                    {!isSelected && m.state === 'written' && (
                      <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-accent-green"></span>
                    )}
                    {!isSelected && m.state === 'todo' && (
                      <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    )}
                    {m.state === 'holiday' && !isSelected && (
                      <span className="absolute top-1 right-1 text-[8px] font-bold text-accent-green uppercase scale-75">lễ</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-outline-variant/30 font-label-md text-label-md text-on-surface-variant/70">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-green"></span>
                <span>Đã viết</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
                <span>Cần viết</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-surface-container-highest"></span>
                <span>Nghỉ</span>
              </div>
            </div>
          </div>

          {/* Editor Card */}
          <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-4">
            <h4 className="font-title-lg text-title-lg text-charcoal-ink">
              Nhật ký ngày {selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </h4>

            {isOff ? (
              <div className="p-4 bg-surface-container rounded-xl text-center text-on-surface-variant/75 font-body-md">
                🌿 Ngày nghỉ{selectedMeta.name ? ` — ${selectedMeta.name}` : ' (Chủ nhật)'}. Không cần viết nhật ký công việc.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">Công việc đã thực hiện</label>
                  <textarea
                    className="w-full min-h-[100px] p-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-on-surface-variant/40"
                    placeholder="Hôm nay bạn đã làm những gì?..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">Vướng mắc / Trở ngại (nếu có)</label>
                  <textarea
                    className="w-full min-h-[80px] p-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-on-surface-variant/40"
                    placeholder="Gặp vướng mắc gì trong ngày?..."
                    value={blockers}
                    onChange={(e) => setBlockers(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">Kế hoạch ngày mai</label>
                  <textarea
                    className="w-full min-h-[80px] p-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-on-surface-variant/40"
                    placeholder="Dự kiến công việc ngày tiếp theo?..."
                    value={planNext}
                    onChange={(e) => setPlanNext(e.target.value)}
                  />
                </div>

                {feedback && (
                  <div className="p-4 rounded-xl bg-primary-container/10 border border-primary/20 space-y-1">
                    <p className="font-label-lg text-label-lg text-primary font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">comment</span>
                      Nhận xét chỉ đạo của quản lý:
                    </p>
                    <p className="font-body-md text-body-md text-charcoal-ink italic">
                      "{feedback}"
                    </p>
                  </div>
                )}

                {status && (
                  <div className="p-3 text-center text-body-md font-semibold bg-primary/10 text-primary rounded-xl border border-primary/20">
                    {status}
                  </div>
                )}

                <button
                  className="w-full h-12 bg-primary text-white rounded-xl font-label-lg text-label-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  onClick={save}
                >
                  <span className="material-symbols-outlined">save</span>
                  <span>Lưu nhật ký</span>
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Review View for Superiors */
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-4">
            <h4 className="font-title-lg text-title-lg text-charcoal-ink font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">calendar_month</span>
              <span>Chọn ngày xem nhật ký</span>
            </h4>
            <input 
              type="date" 
              className="w-full h-12 px-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            />
          </div>

          <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-4">
            <h4 className="font-title-lg text-title-lg text-charcoal-ink font-semibold">Danh sách nhân sự</h4>
            <div className="divide-y divide-outline-variant/20 max-h-60 overflow-y-auto custom-scrollbar">
              {subordinates.map(sub => {
                const subLog = subLogs.find(l => l.user_id === sub.id)
                const isSelected = sub.id === selectedSubId
                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSubId(sub.id)}
                    className={`p-3 flex items-center justify-between cursor-pointer rounded-xl transition-all ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-container'}`}
                  >
                    <div>
                      <p className="font-label-lg text-label-lg text-charcoal-ink">{sub.full_name}</p>
                      <RolePill role={sub.role} />
                    </div>
                    <span>
                      {subLog && subLog.content ? (
                        <span className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Đã nộp</span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Chưa nộp</span>
                      )}
                    </span>
                  </div>
                )
              })}
              {subordinates.length === 0 && (
                <p className="text-center font-body-md text-on-surface-variant/40 py-6">Không tìm thấy nhân viên nào.</p>
              )}
            </div>
          </div>

          {/* Subordinate Log Content details */}
          <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-4">
            <h4 className="font-title-lg text-title-lg text-charcoal-ink font-semibold">
              Chi tiết nhật ký nhân sự
            </h4>

            {selectedSubId ? (
              selectedSubLog && selectedSubLog.content ? (
                <div className="space-y-4">
                  <div className="p-4 bg-surface-container rounded-xl space-y-3">
                    <div>
                      <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">1. Công việc đã thực hiện</p>
                      <p className="font-body-lg text-body-lg text-charcoal-ink pt-1 whitespace-pre-wrap">{selectedSubLog.content}</p>
                    </div>
                    {selectedSubLog.blockers && (
                      <div className="pt-2 border-t border-outline-variant/20">
                        <p className="font-label-md text-label-md text-secondary uppercase tracking-wider">2. Vướng mắc / Trở ngại</p>
                        <p className="font-body-lg text-body-lg text-charcoal-ink pt-1 whitespace-pre-wrap">{selectedSubLog.blockers}</p>
                      </div>
                    )}
                    {selectedSubLog.plan_next && (
                      <div className="pt-2 border-t border-outline-variant/20">
                        <p className="font-label-md text-label-md text-primary uppercase tracking-wider">3. Kế hoạch ngày mai</p>
                        <p className="font-body-lg text-body-lg text-charcoal-ink pt-1 whitespace-pre-wrap">{selectedSubLog.plan_next}</p>
                      </div>
                    )}
                  </div>

                  {/* Feedback field */}
                  <div className="space-y-2">
                    <label className="block font-label-lg text-label-lg text-charcoal-ink">
                      Ý kiến chỉ đạo / Nhận xét của cấp trên
                    </label>
                    <textarea
                      className="w-full min-h-[80px] p-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                      placeholder="Ghi nhận nhận xét, định hướng hoặc yêu cầu sửa đổi nhật ký..."
                      value={reviewFeedback}
                      onChange={(e) => setReviewFeedback(e.target.value)}
                    />
                  </div>

                  {reviewStatus && (
                    <div className={`p-3 text-center text-body-md font-semibold rounded-xl border ${reviewStatus.includes('Lỗi') ? 'bg-error-container/20 text-error border-error-container/30' : 'bg-primary/10 text-primary border-primary/20'}`}>
                      {reviewStatus}
                    </div>
                  )}

                  <button
                    onClick={saveFeedback}
                    disabled={reviewBusy}
                    className="w-full h-12 bg-primary text-white rounded-xl font-label-lg text-label-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">rate_review</span>
                    <span>Lưu nhận xét chỉ đạo</span>
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center text-on-surface-variant/50 border border-dashed border-outline-variant rounded-xl font-body-md">
                  <span className="material-symbols-outlined text-[48px] mb-2 text-outline-variant">edit_note</span>
                  <p>Nhân viên này chưa nộp nhật ký cho ngày {new Date(selectedKey).toLocaleDateString('vi-VN')}</p>
                </div>
              )
            ) : (
              <p className="text-center text-on-surface-variant/40 py-6">Vui lòng chọn nhân viên để xem.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
