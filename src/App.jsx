import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabaseClient.js'
import { useAuth } from './auth/useAuth.jsx'
import LoginScreen from './auth/LoginScreen.jsx'
import AttendanceScreen from './features/attendance/AttendanceScreen.jsx'
import WorkScreen from './features/work/WorkScreen.jsx'
import ChatCenter from './features/messages/ChatCenter.jsx'
import AdminPanel from './admin/AdminPanel.jsx'
import ProfileScreen from './features/profile/ProfileScreen.jsx'
import SettingsPanel from './features/settings/SettingsPanel.jsx'
import NotificationDrawer from './features/notifications/NotificationDrawer.jsx'

const TABS = [
  { key: 'attendance', label: 'Chấm công', icon: 'photo_camera' },
  { key: 'work',       label: 'Công việc', icon: 'task_alt' },
  { key: 'messages',   label: 'Tin nhắn',  icon: 'chat_bubble' },
  { key: 'me',         label: 'Cá nhân',   icon: 'person' },
]

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
  const [tab, setTab] = useState('attendance')
  const [meView, setMeView] = useState('profile') // 'profile' | 'admin'
  const [unread, setUnread] = useState(0)
  const [showNotif, setShowNotif] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)

  const refreshUnreadNotifs = useCallback(async () => {
    if (!profile?.id) return
    const { data, error } = await supabase
      .from('notifications')
      .select('id, notification_reads(id)')
    if (error) {
      console.error('Lỗi tính số thông báo chưa đọc:', error.message)
      return
    }
    const unreadVal = (data || []).filter(
      (n) => !n.notification_reads || n.notification_reads.length === 0
    ).length
    setUnreadNotifs(unreadVal)
  }, [profile?.id])

  const refreshUnread = useCallback(async () => {
    if (!profile?.id) return
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .eq('is_read', false)
    setUnread(count || 0)
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    refreshUnread()
    const channel = supabase
      .channel('unread-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refreshUnread)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, refreshUnread])

  useEffect(() => {
    if (!profile?.id) return
    refreshUnreadNotifs()
    const channel = supabase
      .channel('unread-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, refreshUnreadNotifs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, refreshUnreadNotifs)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, refreshUnreadNotifs])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-container-lowest text-charcoal-ink font-body-lg font-semibold">
        <div className="flex flex-col items-center gap-3">
          <span className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></span>
          <span>Đang kết nối hệ thống VIMC...</span>
        </div>
      </div>
    )
  }

  if (!session || !profile) {
    return <LoginScreen />
  }

  const canManage = profile.role === 'admin' || profile.role === 'manager'
  const inAdminView = tab === 'me' && meView === 'admin' && canManage

  const goTab = (key) => { setTab(key); if (key !== 'me') setMeView('profile') }

  const NotifBtn = () => (
    <button onClick={() => setShowNotif(true)} type="button" className="text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-150 relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
      <span className="material-symbols-outlined text-[22px]">notifications</span>
      {unreadNotifs > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-secondary rounded-full border border-white"></span>}
    </button>
  )
  const SettingsBtn = () => (
    <button onClick={() => setShowSettings(true)} type="button" className="text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-150 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
      <span className="material-symbols-outlined text-[22px]">settings</span>
    </button>
  )
  const LogoutBtn = () => (
    <button onClick={signOut} type="button" className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant/70 hover:text-error hover:bg-error/5 transition-all" title="Đăng xuất">
      <span className="material-symbols-outlined text-[20px]">logout</span>
    </button>
  )

  return (
    <div className="min-h-screen bg-surface-container-lowest flex flex-col font-body">
      {tab === 'attendance' && (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center w-full px-6 h-16 border-b border-surface-variant/30">
          <div className="flex items-center gap-2">
            <div className="lotus-petal rotate-[-45deg] opacity-80" style={{ width: '24px', height: '16px', backgroundColor: '#C6952B', clipPath: 'ellipse(50% 100% at 50% 100%)' }}></div>
            <h1 className="font-headline-md text-title-lg font-bold text-primary">Chấm công</h1>
          </div>
          <div className="flex items-center gap-4"><NotifBtn /><SettingsBtn /><LogoutBtn /></div>
        </header>
      )}

      {tab === 'work' && (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md w-full px-6 h-16 flex justify-between items-center border-b border-surface-variant/30">
          <div className="flex items-center gap-3">
            <img alt="VIMC Logo" className="h-10 w-auto" src="/assets/vimc-logo.svg" />
            <h1 className="font-headline-md text-title-lg font-bold text-primary">VIMC People</h1>
          </div>
          <div className="flex items-center gap-4"><NotifBtn /><SettingsBtn /><LogoutBtn /></div>
        </header>
      )}

      {tab === 'messages' && (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md w-full px-6 h-16 flex justify-between items-center border-b border-surface-variant/30">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[24px]">chat</span>
            <h1 className="font-headline-md text-title-lg font-bold text-primary">Tin nhắn nội bộ</h1>
          </div>
          <div className="flex items-center gap-4"><NotifBtn /><LogoutBtn /></div>
        </header>
      )}

      {tab === 'me' && (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md flex justify-between items-center w-full px-6 h-16 border-b border-surface-variant/30">
          <div className="flex items-center gap-2 min-w-0">
            {inAdminView && (
              <button onClick={() => setMeView('profile')} type="button" className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            )}
            <h1 className="font-headline-md text-title-lg font-bold text-primary truncate">
              {inAdminView ? (profile.role === 'admin' ? 'Khu quản trị' : 'Khu quản lý') : 'Cá nhân'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <NotifBtn />
            <SettingsBtn />
            <LogoutBtn />
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {tab === 'attendance' && <AttendanceScreen profile={profile} />}
        {tab === 'work' && <WorkScreen profile={profile} />}
        {tab === 'messages' && <ChatCenter profile={profile} onRead={refreshUnread} />}
        {tab === 'me' && (
          inAdminView
            ? <AdminPanel profile={profile} onBack={() => setMeView('profile')} />
            : <ProfileScreen profile={profile} canManage={canManage} onOpenSettings={() => setShowSettings(true)} onOpenAdmin={() => setMeView('admin')} />
        )}
      </main>

      {/* Tab Navigation Footer Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-surface-variant/30 flex items-center justify-around px-2 z-50 shadow-lg">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              className={`relative flex flex-col items-center justify-center flex-1 max-w-[110px] h-14 rounded-xl transition-all duration-150 active:scale-95 ${isActive ? 'text-primary' : 'text-on-surface-variant/55'}`}
              onClick={() => goTab(t.key)}
            >
              <span className={`material-symbols-outlined text-[24px] transition-transform ${isActive ? 'scale-110' : ''}`} style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}>{t.icon}</span>
              <span className={`text-[11px] leading-none mt-1 whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
              {t.key === 'messages' && unread > 0 && (
                <span className="absolute top-0.5 right-3 bg-secondary text-white text-[9px] font-bold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border-2 border-white">{unread}</span>
              )}
            </button>
          )
        })}
      </nav>

      <NotificationDrawer isOpen={showNotif} onClose={() => setShowNotif(false)} profile={profile} />
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} profile={profile} />
    </div>
  )
}
