import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import RolePill from '../../components/RolePill.jsx'

export default function NotificationDrawer({ isOpen, onClose, profile }) {
  const isSuperior = ['admin', 'director', 'manager'].includes(profile.role)
  const [activeTab, setActiveTab] = useState('inbox') // inbox | sent | create
  const [notifications, setNotifications] = useState([])
  const [sentNotifications, setSentNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  // Form states for sending notification
  const [scope, setScope] = useState('all') // all | branch | user
  const [targetId, setTargetId] = useState('')
  const [type, setType] = useState('info') // info | directive | reminder
  const [content, setContent] = useState('')
  
  // Directory & Branch data
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])

  // Selected notification detail view modal
  const [selectedNotif, setSelectedNotif] = useState(null)

  // Fetch received notifications (Inbox)
  const loadInbox = useCallback(async () => {
    setLoading(true)
    try {
      // Query notifications that are visible to user
      // Note: RLS automatically handles scope/branch/user visibility for SELECT,
      // but we join notification_reads to check if it's read by the current user.
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          sender:users!notifications_sender_id_fkey (full_name, role, title),
          notification_reads(id)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setNotifications(data || [])
    } catch (err) {
      console.error('Lỗi tải hộp thư thông báo:', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch sent notifications
  const loadSent = useCallback(async () => {
    if (!isSuperior) return
    setLoading(true)
    try {
      // Fetch notifications created by this user
      // We join notification_reads. Since nread_select policy allows sender to read all reads for their notif,
      // this returns all read records, which we can count.
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          notification_reads(id)
        `)
        .eq('sender_id', profile.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setSentNotifications(data || [])
    } catch (err) {
      console.error('Lỗi tải thông báo đã gửi:', err.message)
    } finally {
      setLoading(false)
    }
  }, [isSuperior, profile.id])

  // Load directories for form
  useEffect(() => {
    if (!isOpen) return

    loadInbox()
    if (isSuperior) {
      loadSent()
      // Load users
      supabase.rpc('login_directory').then(({ data }) => {
        const list = (data || []).filter((u) => u.id !== profile.id)
        setUsers(list)
        if (list.length > 0) setTargetId(list[0].id)
      })
      // Load branches
      supabase.from('branches').select('id, name').then(({ data }) => {
        setBranches(data || [])
        if (data && data.length > 0 && !targetId) setTargetId(data[0].id)
      })
    }
  }, [isOpen, loadInbox, loadSent, isSuperior, profile.id])

  // Realtime subscription for incoming notifications
  useEffect(() => {
    if (!isOpen) return

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          loadInbox()
          if (isSuperior) loadSent()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOpen, loadInbox, loadSent, isSuperior])

  // Reset targetId when scope changes
  useEffect(() => {
    if (scope === 'user' && users.length > 0) {
      setTargetId(users[0].id)
    } else if (scope === 'branch' && branches.length > 0) {
      setTargetId(branches[0].id)
    } else {
      setTargetId('')
    }
  }, [scope, users, branches])

  // Check if a notification is read
  const isRead = (notif) => {
    return notif.notification_reads && notif.notification_reads.length > 0
  }

  // Count unread notifications
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !isRead(n)).length
  }, [notifications])

  // Mark a single notification as read
  const markAsRead = async (notif) => {
    if (isRead(notif)) return

    try {
      const { error } = await supabase
        .from('notification_reads')
        .insert({
          notification_id: notif.id,
          user_id: profile.id
        })

      if (error) throw error

      // Optimistic update
      setNotifications(prev =>
        prev.map(n =>
          n.id === notif.id ? { ...n, notification_reads: [{ id: 'temp' }] } : n
        )
      )
    } catch (err) {
      console.error('Lỗi đánh dấu đã đọc:', err.message)
    }
  }

  // Mark all as read
  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !isRead(n))
    if (unread.length === 0) return

    setActionBusy(true)
    try {
      const inserts = unread.map(n => ({
        notification_id: n.id,
        user_id: profile.id
      }))

      const { error } = await supabase.from('notification_reads').insert(inserts)
      if (error) throw error

      setNotifications(prev =>
        prev.map(n => ({ ...n, notification_reads: [{ id: 'temp' }] }))
      )
    } catch (err) {
      console.error('Lỗi đánh dấu tất cả đã đọc:', err.message)
    } finally {
      setActionBusy(false)
    }
  }

  // Send a notification
  const handleSend = async (e) => {
    e.preventDefault()
    if (!content.trim()) return

    setActionBusy(true)
    setStatusMsg('')

    try {
      const { error } = await supabase.from('notifications').insert({
        sender_id: profile.id,
        scope,
        target_id: scope === 'all' ? null : targetId,
        type,
        content: content.trim()
      })

      if (error) throw error

      setStatusMsg('✅ Đã gửi thông báo thành công!')
      setContent('')
      loadSent()
      setActiveTab('sent')
    } catch (err) {
      setStatusMsg('Lỗi gửi thông báo: ' + err.message)
    } finally {
      setActionBusy(false)
    }
  }

  // Icon & color mapping for notification types
  const typeMeta = {
    directive: {
      label: 'Chỉ thị',
      icon: 'campaign',
      badgeClass: 'bg-red-50 text-red-700 border-red-200/50',
      iconColor: 'text-error'
    },
    reminder: {
      label: 'Nhắc việc',
      icon: 'alarm',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/50',
      iconColor: 'text-amber-500'
    },
    info: {
      label: 'Thông báo',
      icon: 'info',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/50',
      iconColor: 'text-primary'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-charcoal-ink/40 backdrop-blur-sm transition-opacity duration-300">
      {/* Background click handler */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Slide-over Panel */}
      <aside className="relative w-full sm:w-[480px] h-full bg-white/95 backdrop-blur-md shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0 border-l border-outline-variant/30">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-surface-variant/40 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">notifications</span>
            <h2 className="font-headline-md text-title-lg font-bold text-primary">Thông báo</h2>
            {unreadCount > 0 && (
              <span className="bg-secondary text-white text-[11px] font-bold h-5 px-2 rounded-full flex items-center justify-center border border-white">
                {unreadCount} mới
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container active:scale-95 transition-all text-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tab Controls for superiors */}
        {isSuperior && (
          <div className="flex bg-surface-container/60 p-1 mx-6 mt-4 rounded-xl border border-outline-variant/20">
            <button
              onClick={() => setActiveTab('inbox')}
              className={`flex-1 py-2 text-center rounded-lg font-label-md text-label-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'inbox' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined text-[16px]">inbox</span>
              <span>Hộp thư</span>
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`flex-1 py-2 text-center rounded-lg font-label-md text-label-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'sent' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>Đã gửi</span>
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-2 text-center rounded-lg font-label-md text-label-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'create' ? 'bg-white text-primary font-bold shadow-sm' : 'text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>Gửi mới</span>
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {/* TAB: INBOX */}
          {activeTab === 'inbox' && (
            <div className="space-y-4">
              {unreadCount > 0 && (
                <div className="flex justify-between items-center bg-primary/5 p-3 rounded-xl border border-primary/20">
                  <span className="text-body-md font-medium text-primary">Bạn có {unreadCount} thông báo chưa đọc</span>
                  <button
                    onClick={markAllAsRead}
                    disabled={actionBusy}
                    className="text-label-md text-primary font-bold hover:underline disabled:opacity-50"
                  >
                    Đọc tất cả
                  </button>
                </div>
              )}

              {loading ? (
                <div className="py-12 text-center text-on-surface-variant/60 font-body-md">
                  <span className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-2"></span>
                  <p>Đang tải thông báo...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notif) => {
                    const meta = typeMeta[notif.type] || typeMeta.info
                    const read = isRead(notif)
                    const senderName = notif.sender?.full_name || 'Hệ thống'
                    const dateStr = new Date(notif.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    const timeStr = new Date(notif.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

                    return (
                      <div
                        key={notif.id}
                        onClick={() => {
                          setSelectedNotif(notif)
                          markAsRead(notif)
                        }}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative group flex items-start gap-3 ${read ? 'bg-white border-surface-variant/50' : 'bg-primary/5 border-primary/20 ring-1 ring-primary/5'}`}
                      >
                        {/* Status Unread Dot */}
                        {!read && (
                          <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-secondary"></span>
                        )}

                        {/* Icon */}
                        <div className={`w-9 h-9 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 ${meta.iconColor}`}>
                          <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                        </div>

                        {/* Content Preview */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-label-lg text-label-lg text-charcoal-ink font-semibold">{senderName}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${meta.badgeClass}`}>
                              {meta.label}
                            </span>
                          </div>
                          
                          <p className="font-body-md text-body-md text-on-surface-variant/80 line-clamp-2 pr-4">
                            {notif.content}
                          </p>

                          <p className="text-[10px] text-on-surface-variant/55 pt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            <span>{timeStr} — {dateStr}</span>
                          </p>
                        </div>
                      </div>
                    )
                  })}

                  {notifications.length === 0 && (
                    <div className="py-12 text-center text-on-surface-variant/50 border border-dashed border-outline-variant rounded-2xl">
                      <span className="material-symbols-outlined text-[48px] mb-2 text-outline-variant">mail_outline</span>
                      <p className="font-body-md">Hộp thư thông báo trống.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: SENT */}
          {activeTab === 'sent' && isSuperior && (
            <div className="space-y-4">
              {loading ? (
                <div className="py-12 text-center text-on-surface-variant/60 font-body-md">
                  <span className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-2"></span>
                  <p>Đang tải lịch sử gửi...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentNotifications.map((notif) => {
                    const meta = typeMeta[notif.type] || typeMeta.info
                    const dateStr = new Date(notif.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    const timeStr = new Date(notif.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    const readCount = notif.notification_reads ? notif.notification_reads.length : 0

                    let scopeLabel = 'Toàn bộ'
                    if (notif.scope === 'branch') scopeLabel = 'Chi nhánh'
                    if (notif.scope === 'user') scopeLabel = 'Cá nhân'

                    return (
                      <div
                        key={notif.id}
                        onClick={() => setSelectedNotif(notif)}
                        className="p-4 bg-white border border-surface-variant/50 rounded-2xl shadow-sm cursor-pointer hover:border-primary/30 transition-all flex items-start gap-3"
                      >
                        <div className={`w-9 h-9 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 ${meta.iconColor}`}>
                          <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-label-lg text-label-lg text-charcoal-ink font-semibold">Gửi: {scopeLabel}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${meta.badgeClass}`}>
                              {meta.label}
                            </span>
                          </div>
                          
                          <p className="font-body-md text-body-md text-on-surface-variant/80 line-clamp-2">
                            {notif.content}
                          </p>

                          <div className="flex justify-between items-center pt-2 text-[10px] text-on-surface-variant/55">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">schedule</span>
                              <span>{timeStr} — {dateStr}</span>
                            </span>
                            
                            <span className="bg-primary/5 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">visibility</span>
                              <span>{readCount} người đọc</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {sentNotifications.length === 0 && (
                    <div className="py-12 text-center text-on-surface-variant/50 border border-dashed border-outline-variant rounded-2xl">
                      <span className="material-symbols-outlined text-[48px] mb-2 text-outline-variant">send</span>
                      <p className="font-body-md">Bạn chưa gửi thông báo nào.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: CREATE (COMPOSE) */}
          {activeTab === 'create' && isSuperior && (
            <form onSubmit={handleSend} className="space-y-4 bg-white p-5 rounded-2xl border border-surface-variant/50 shadow-sm">
              <h4 className="font-title-lg text-title-lg text-charcoal-ink flex items-center gap-2 font-semibold border-b border-surface-variant/30 pb-2">
                <span className="material-symbols-outlined text-primary">add_alert</span>
                <span>Tạo thông báo mới</span>
              </h4>

              {/* Scope Selection */}
              <div>
                <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">Đối tượng nhận</label>
                <div className="grid grid-cols-3 gap-2 bg-surface-container/50 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`py-2 text-center rounded-lg font-label-md text-label-md transition-all ${scope === 'all' ? 'bg-primary text-white shadow-sm font-bold' : 'text-on-surface-variant'}`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('branch')}
                    className={`py-2 text-center rounded-lg font-label-md text-label-md transition-all ${scope === 'branch' ? 'bg-primary text-white shadow-sm font-bold' : 'text-on-surface-variant'}`}
                  >
                    Chi nhánh
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('user')}
                    className={`py-2 text-center rounded-lg font-label-md text-label-md transition-all ${scope === 'user' ? 'bg-primary text-white shadow-sm font-bold' : 'text-on-surface-variant'}`}
                  >
                    Cá nhân
                  </button>
                </div>
              </div>

              {/* Target Selection Dropdown */}
              {scope === 'branch' && (
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Chọn chi nhánh nhận</label>
                  <select
                    className="w-full h-11 px-3 bg-white border border-outline-variant rounded-xl font-body-md text-body-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    required
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                    {branches.length === 0 && <option value="">Đang tải chi nhánh...</option>}
                  </select>
                </div>
              )}

              {scope === 'user' && (
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Chọn nhân viên nhận</label>
                  <select
                    className="w-full h-11 px-3 bg-white border border-outline-variant rounded-xl font-body-md text-body-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    required
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({ROLE_OPTIONS_MAP[u.role] || u.role} {u.title ? `· ${u.title}` : ''})
                      </option>
                    ))}
                    {users.length === 0 && <option value="">Đang tải nhân viên...</option>}
                  </select>
                </div>
              )}

              {/* Notification Type */}
              <div>
                <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">Loại thông báo</label>
                <div className="grid grid-cols-3 gap-2 bg-surface-container/50 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setType('info')}
                    className={`py-2 text-center rounded-lg font-label-md text-label-md transition-all flex items-center justify-center gap-1 ${type === 'info' ? 'bg-blue-500 text-white shadow-sm font-bold' : 'text-on-surface-variant'}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">info</span>
                    <span>Tin tức</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('reminder')}
                    className={`py-2 text-center rounded-lg font-label-md text-label-md transition-all flex items-center justify-center gap-1 ${type === 'reminder' ? 'bg-amber-500 text-white shadow-sm font-bold' : 'text-on-surface-variant'}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">alarm</span>
                    <span>Nhắc việc</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('directive')}
                    className={`py-2 text-center rounded-lg font-label-md text-label-md transition-all flex items-center justify-center gap-1 ${type === 'directive' ? 'bg-red-500 text-white shadow-sm font-bold' : 'text-on-surface-variant'}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">campaign</span>
                    <span>Chỉ thị</span>
                  </button>
                </div>
              </div>

              {/* Content Textarea */}
              <div>
                <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">Nội dung thông báo</label>
                <textarea
                  className="w-full min-h-[120px] p-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-on-surface-variant/40"
                  placeholder="Nhập nội dung chỉ thị / nhắc nhở / thông tin gửi đi..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              </div>

              {statusMsg && (
                <div className={`p-3 text-center text-body-md font-semibold rounded-xl border ${statusMsg.includes('Lỗi') ? 'bg-error-container/20 text-error border-error-container/30' : 'bg-primary/10 text-primary border-primary/20'}`}>
                  {statusMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={actionBusy || !content.trim() || (scope !== 'all' && !targetId)}
                className="w-full h-12 bg-primary text-white rounded-xl font-label-lg text-label-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionBusy ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                    <span>Đang gửi thông báo...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">send</span>
                    <span>Gửi thông báo</span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>
      </aside>

      {/* DETAIL MODAL OVERLAY */}
      {selectedNotif && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-charcoal-ink/65 backdrop-blur-sm" onClick={() => setSelectedNotif(null)}></div>
          <div className="bg-white rounded-2xl overflow-hidden max-w-sm w-full relative z-10 p-6 shadow-2xl flex flex-col border border-outline-variant/30">
            
            {/* Header info */}
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 ${typeMeta[selectedNotif.type]?.iconColor || 'text-primary'}`}>
                <span className="material-symbols-outlined text-[24px]">{typeMeta[selectedNotif.type]?.icon || 'info'}</span>
              </div>
              <div className="min-w-0">
                <p className="font-title-lg text-title-lg text-charcoal-ink font-bold leading-tight">
                  {selectedNotif.sender?.full_name || (selectedNotif.sender_id === profile.id ? 'Bạn' : 'Hệ thống')}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {selectedNotif.sender?.role && <RolePill role={selectedNotif.sender.role} title={selectedNotif.sender.title} />}
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${typeMeta[selectedNotif.type]?.badgeClass || ''}`}>
                    {typeMeta[selectedNotif.type]?.label || 'Thông báo'}
                  </span>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="bg-surface-container/40 p-4 rounded-xl font-body-lg text-body-lg text-charcoal-ink whitespace-pre-wrap max-h-[40vh] overflow-y-auto custom-scrollbar mb-4 border border-outline-variant/20">
              {selectedNotif.content}
            </div>

            {/* Time footer */}
            <div className="text-[11px] text-on-surface-variant/60 mb-5 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>Gửi lúc: {new Date(selectedNotif.created_at).toLocaleString('vi-VN')}</span>
            </div>

            {/* Action buttons */}
            <button
              onClick={() => setSelectedNotif(null)}
              className="w-full h-11 bg-primary text-white font-label-lg text-label-lg rounded-xl hover:bg-primary-container active:scale-95 transition-all"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Helpers mapping roles to Vietnamese strings for display
const ROLE_OPTIONS_MAP = {
  admin: 'Quản trị viên',
  director: 'Giám đốc',
  manager: 'Quản lý',
  employee: 'Nhân viên'
}
