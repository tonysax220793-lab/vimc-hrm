import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

export default function ChatCenter({ profile, onRead }) {
  const isAdmin = profile.role === 'admin'
  const [directory, setDirectory] = useState([])
  const [partner, setPartner] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [partnerQuery, setPartnerQuery] = useState('')
  const [unreadCounts, setUnreadCounts] = useState({})
  const [status, setStatus] = useState('')
  
  const endRef = useRef(null)

  // Get users directory
  useEffect(() => {
    supabase.rpc('login_directory').then(({ data }) => {
      const list = (data || []).filter((u) => u.id !== profile.id)
      setDirectory(list)
      if (!isAdmin) {
        const admin = list.find((u) => u.role === 'admin')
        setPartner(admin || null)
      }
    })
  }, [profile.id, isAdmin])

  const partners = useMemo(
    () => (isAdmin ? directory : directory.filter((u) => u.role === 'admin')),
    [isAdmin, directory]
  )

  const filteredPartners = useMemo(() => {
    const q = partnerQuery.toLowerCase().trim()
    if (!q) return partners
    return partners.filter((p) => p.full_name.toLowerCase().includes(q))
  }, [partners, partnerQuery])

  // Load and read messages
  const loadMessages = useCallback(async () => {
    if (!partner) return
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${partner.id}),and(sender_id.eq.${partner.id},recipient_id.eq.${profile.id})`)
      .order('created_at', { ascending: true })
    
    if (!error) {
      setMessages(data || [])
    }

    // Mark as read
    const { error: readErr } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('recipient_id', profile.id)
      .eq('sender_id', partner.id)
      .eq('is_read', false)
    
    if (!readErr) {
      onRead?.()
    }
  }, [partner, profile.id, onRead])

  // Load unread counts
  const loadUnreadCounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('recipient_id', profile.id)
      .eq('is_read', false)
    if (!error && data) {
      const counts = {}
      data.forEach((m) => {
        counts[m.sender_id] = (counts[m.sender_id] || 0) + 1
      })
      setUnreadCounts(counts)
    }
  }, [profile.id])

  // Subscriptions
  useEffect(() => {
    loadMessages()
    if (!partner) return
    const channel = supabase
      .channel('chat-' + partner.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new
        const relevant = (m.sender_id === partner.id && m.recipient_id === profile.id) ||
                         (m.sender_id === profile.id && m.recipient_id === partner.id)
        if (relevant) loadMessages()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [partner, profile.id, loadMessages])

  useEffect(() => {
    loadUnreadCounts()
    const globalChannel = supabase
      .channel('messages-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadUnreadCounts()
      })
      .subscribe()
    return () => { supabase.removeChannel(globalChannel) }
  }, [loadUnreadCounts])

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const content = text.trim()
    if (!content || !partner) return
    setText('')
    setStatus('')
    const { error } = await supabase.from('messages').insert({
      sender_id: profile.id,
      sender_name: profile.full_name,
      recipient_id: partner.id,
      content,
    })
    if (error) {
      setStatus('Lỗi: ' + error.message)
    } else {
      loadMessages()
    }
  }

  const getInitials = (name) => {
    if (!name) return '??'
    const words = name.trim().split(' ')
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
    return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  }

  const roleClassMap = {
    manager: 'bg-purple-100 text-purple-700',
    director: 'bg-blue-100 text-blue-700',
    admin: 'bg-red-100 text-red-700',
    employee: 'bg-green-100 text-green-700',
  }

  const roleLabelMap = {
    manager: 'Quản lý',
    director: 'Giám đốc',
    admin: 'Quản trị',
    employee: 'Nhân viên',
  }

  return (
    <div className="bg-surface-container-lowest text-on-surface min-h-[calc(100vh-80px)] flex flex-col md:flex-row max-w-6xl mx-auto w-full border border-surface-variant/50 rounded-2xl overflow-hidden shadow-md">
      {/* Sidebar Panel for Admin (Directory search) */}
      {isAdmin && (!partner || partner) && (
        <aside className={`w-full md:w-[360px] bg-white border-r border-surface-variant p-6 flex flex-col ${partner ? 'hidden md:flex' : 'flex'}`}>
          <h2 className="font-headline-md text-headline-md text-charcoal-ink mb-4">Hội thoại</h2>
          
          {/* Search Contacts */}
          <div className="relative flex items-center mb-6">
            <span className="material-symbols-outlined absolute left-4 text-outline">search</span>
            <input
              className="w-full h-11 pl-12 pr-4 bg-surface-container rounded-xl font-body-md text-body-md focus:outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-on-surface-variant/50 border border-transparent"
              placeholder="Tìm kiếm nhân sự..."
              type="text"
              value={partnerQuery}
              onChange={(e) => setPartnerQuery(e.target.value)}
            />
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredPartners.map((u) => {
              const count = unreadCounts[u.id] || 0
              const initials = getInitials(u.full_name)
              const roleClass = roleClassMap[u.role] || 'bg-gray-100 text-gray-700'
              const roleLabel = roleLabelMap[u.role] || u.role
              const isSelected = partner?.id === u.id

              return (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer group relative ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-container-high'}`}
                  onClick={() => setPartner(u)}
                >
                  <div className="relative w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary font-title-lg text-title-lg">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-label-lg text-label-lg text-charcoal-ink truncate pr-2">{u.full_name}</p>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${roleClass}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="font-body-md text-body-md text-on-surface-variant/70 truncate">
                        Bắt đầu nhắn tin...
                      </p>
                      {count > 0 && (
                        <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0 animate-pulse">
                          {count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {filteredPartners.length === 0 && (
              <p className="text-center font-body-md text-on-surface-variant/60 py-8">
                Không tìm thấy kết quả.
              </p>
            )}
          </div>
        </aside>
      )}

      {/* Chat Windows (Messages Thread) */}
      <section className={`flex-1 flex flex-col bg-surface-bright h-[calc(100vh-140px)] md:h-[680px] ${isAdmin && !partner ? 'hidden md:flex' : 'flex'}`}>
        {partner ? (
          <>
            {/* Header */}
            <div className="h-16 px-6 bg-white border-b border-surface-variant flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <button
                    className="md:hidden p-1 text-outline hover:text-charcoal-ink"
                    onClick={() => setPartner(null)}
                  >
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                )}
                <div>
                  <h3 className="font-title-lg text-title-lg text-charcoal-ink">{partner.full_name}</h3>
                  <p className="font-label-md text-label-md text-primary">Đang trực tuyến</p>
                </div>
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {messages.map((m) => {
                const isMine = m.sender_id === profile.id
                return (
                  <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`${
                        isMine
                          ? 'bg-primary text-white rounded-2xl rounded-tr-none'
                          : 'bg-white text-charcoal-ink border border-surface-variant rounded-2xl rounded-tl-none'
                      } px-4 py-2.5 max-w-[75%] font-body-md text-body-md shadow-sm break-words`}
                    >
                      {m.content}
                    </div>
                    <span className={`text-[10px] text-on-surface-variant/60 mt-1 block ${isMine ? 'text-right' : 'text-left'}`}>
                      {new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>

            {/* Input Panel */}
            <div className="p-4 bg-white border-t border-surface-variant flex items-center gap-3">
              <input
                className="flex-1 h-12 px-4 bg-surface-container rounded-xl font-body-md text-body-md focus:outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-on-surface-variant/50 border border-transparent"
                placeholder="Nhập tin nhắn..."
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button
                className="w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center shadow-md hover:bg-primary-container active:scale-95 transition-all"
                onClick={send}
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
            
            {status && (
              <p className="px-4 py-1 text-xs text-error bg-error-container/20 text-center">
                {status}
              </p>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-bright">
            <span className="material-symbols-outlined text-outline-variant text-[64px] mb-4">forum</span>
            <h3 className="font-title-lg text-title-lg text-charcoal-ink mb-1">Tin nhắn</h3>
            <p className="font-body-md text-body-md text-on-surface-variant/60">
              Chọn một nhân sự từ danh sách để bắt đầu hội thoại bảo mật.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

