import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

export default function HandoverList({ profile }) {
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [receiverId, setReceiverId] = useState('')
  const [content, setContent] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('handovers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setRows(data || [])
  }, [])

  useEffect(() => {
    load()
    // Load other users for handover receiver dropdown
    supabase.rpc('login_directory').then(({ data }) => {
      const list = (data || []).filter((u) => u.id !== profile.id)
      setUsers(list)
      if (list.length > 0) {
        setReceiverId(list[0].id)
      }
    })
  }, [load, profile.id])

  const receive = async (h) => {
    await supabase.from('handovers')
      .update({ status: 'received', received_at: new Date().toISOString() })
      .eq('id', h.id)
    load()
  }

  const createHandover = async (e) => {
    e.preventDefault()
    if (!content.trim() || !receiverId) return
    setBusy(true)
    setStatusMsg('')

    const { error } = await supabase.from('handovers').insert({
      giver_id: profile.id,
      receiver_id: receiverId,
      content: content.trim(),
      status: 'pending'
    })

    if (error) {
      setStatusMsg('Lỗi: ' + error.message)
    } else {
      setContent('')
      setStatusMsg('✅ Đã gửi bàn giao ca thành công!')
      load()
    }
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <h3 className="font-headline-md text-headline-md text-charcoal-ink mb-4">Bàn giao ca / Công việc</h3>

      {/* Handover Creation Form */}
      <div className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-4">
        <h4 className="font-title-lg text-title-lg text-charcoal-ink flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">send_and_archive</span>
          <span>Tạo bàn giao ca mới</span>
        </h4>
        
        <form onSubmit={createHandover} className="space-y-4">
          <div>
            <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">
              Người nhận bàn giao
            </label>
            <select
              className="w-full h-12 px-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
              {users.length === 0 && <option value="">Không có nhân sự khả dụng</option>}
            </select>
          </div>

          <div>
            <label className="block font-label-lg text-label-lg text-charcoal-ink mb-1.5">
              Nội dung bàn giao ca
            </label>
            <textarea
              className="w-full min-h-[100px] p-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-on-surface-variant/40"
              placeholder="Ghi rõ tình trạng ca làm, thiết bị bàn giao, lưu ý công việc..."
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
            className="w-full h-12 bg-primary text-white rounded-xl font-label-lg text-label-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            type="submit"
            disabled={busy || !receiverId || !content.trim()}
          >
            <span>Gửi bàn giao ca</span>
          </button>
        </form>
      </div>

      {/* Handover List */}
      <div className="space-y-4">
        <h4 className="font-title-lg text-title-lg text-charcoal-ink px-1">Lịch sử bàn giao ca</h4>
        
        <div className="space-y-3">
          {rows.map((h) => {
            const isSender = h.giver_id === profile.id
            const isReceiver = h.receiver_id === profile.id
            const isPending = h.status === 'pending'
            
            // Look up usernames
            const targetUser = users.find(u => u.id === (isSender ? h.receiver_id : h.giver_id))
            const targetName = targetUser ? targetUser.full_name : (isSender ? 'Đồng nghiệp' : 'Người gửi')

            return (
              <div
                key={h.id}
                className="bg-white p-5 rounded-2xl border border-surface-variant/50 shadow-[0_4px_12px_rgba(31,122,77,0.04)] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPending ? 'bg-secondary-container/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
                    {isPending ? 'Chờ xác nhận' : 'Đã nhận bàn giao'}
                  </span>
                  <span className="font-label-md text-label-md text-on-surface-variant/60">
                    {new Date(h.created_at).toLocaleDateString('vi-VN')} {new Date(h.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="font-body-lg text-body-lg text-charcoal-ink">
                  {h.content}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-outline-variant/20">
                  <span className="font-label-md text-label-md text-on-surface-variant/70">
                    {isSender ? (
                      <>Đến: <strong className="text-charcoal-ink">{targetName}</strong></>
                    ) : (
                      <>Từ: <strong className="text-charcoal-ink">{targetName}</strong></>
                    )}
                  </span>
                  
                  {isReceiver && isPending && (
                    <button
                      className="bg-primary text-white font-label-md text-label-md py-1.5 px-4 rounded-xl shadow hover:bg-primary-container active:scale-[0.98] transition-all flex items-center gap-1.5 self-end"
                      onClick={() => receive(h)}
                    >
                      <span className="material-symbols-outlined text-[16px]">done_all</span>
                      <span>Xác nhận đã nhận</span>
                    </button>
                  )}

                  {!isPending && h.received_at && (
                    <span className="text-[11px] text-primary self-end">
                      ✓ Đã xác nhận nhận ca lúc {new Date(h.received_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {rows.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-surface-variant/50 text-center">
              <span className="material-symbols-outlined text-outline-variant text-[48px] mb-2">swap_horiz</span>
              <p className="font-body-md text-on-surface-variant/60">Chưa có giao dịch bàn giao ca nào.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
