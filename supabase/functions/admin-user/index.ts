// Supabase Edge Function: admin-user
// Thao tác cần quyền server: đổi PIN (reset_pin) và xóa nhân sự (delete).
// Quyền: Admin thao tác mọi người. Quản lý (manager) chỉ với NHÂN VIÊN trong
//        chi nhánh của mình. Không ai được tự xóa chính mình.
// Deploy: `supabase functions deploy admin-user`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: uErr } = await caller.auth.getUser()
    if (uErr || !userData?.user) return json({ error: 'Chưa đăng nhập' }, 401)
    const callerId = userData.user.id

    const admin = createClient(url, serviceKey)
    const { data: prof } = await admin.from('users').select('role, branch_id').eq('id', callerId).single()
    const callerRole = prof?.role
    const callerBranch = prof?.branch_id
    if (callerRole !== 'admin' && callerRole !== 'manager') {
      return json({ error: 'Không có quyền' }, 403)
    }

    const { action, user_id, pin } = await req.json()
    if (!user_id) return json({ error: 'Thiếu user_id' }, 400)
    if (user_id === callerId && action === 'delete') return json({ error: 'Không thể tự xóa chính mình' }, 400)

    // Lấy hồ sơ đối tượng để kiểm tra phạm vi.
    const { data: target } = await admin.from('users').select('role, branch_id').eq('id', user_id).single()
    if (!target) return json({ error: 'Không tìm thấy nhân sự' }, 404)

    if (callerRole === 'manager') {
      if (target.role !== 'employee' || target.branch_id !== callerBranch) {
        return json({ error: 'Quản lý chỉ thao tác với nhân viên trong chi nhánh của mình' }, 403)
      }
    }

    if (action === 'reset_pin') {
      if (!pin || String(pin).length < 4) return json({ error: 'PIN không hợp lệ' }, 400)
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: String(pin) })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'delete') {
      // Xóa auth user → hồ sơ public.users tự xóa theo ON DELETE CASCADE.
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Hành động không hợp lệ' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
