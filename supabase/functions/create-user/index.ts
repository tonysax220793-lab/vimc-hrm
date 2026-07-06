// Supabase Edge Function: create-user
// Tạo tài khoản nhân sự mới (auth user + hồ sơ public.users) bằng service_role.
// Quyền: Admin tạo mọi vai trò/chi nhánh. Quản lý (manager) chỉ tạo NHÂN VIÊN
//        trong ĐÚNG chi nhánh của mình.
// Deploy: `supabase functions deploy create-user`
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, AUTH_EMAIL_DOMAIN

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
    const domain = Deno.env.get('AUTH_EMAIL_DOMAIN') ?? 'vimc.local'

    // 1) Xác thực người gọi.
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: uErr } = await caller.auth.getUser()
    if (uErr || !userData?.user) return json({ error: 'Chưa đăng nhập' }, 401)

    const admin = createClient(url, serviceKey)
    const { data: prof } = await admin.from('users').select('role, branch_id').eq('id', userData.user.id).single()
    const callerRole = prof?.role
    const callerBranch = prof?.branch_id
    if (callerRole !== 'admin' && callerRole !== 'manager') {
      return json({ error: 'Chỉ Admin hoặc Quản lý chi nhánh được tạo nhân sự' }, 403)
    }

    // 2) Đọc payload.
    const { full_name, role, title, branch_id, pin } = await req.json()
    if (!full_name || !pin || String(pin).length < 4) return json({ error: 'Thiếu họ tên hoặc PIN không hợp lệ' }, 400)
    const validRoles = ['admin', 'director', 'manager', 'employee']
    if (!validRoles.includes(role)) return json({ error: 'Vai trò không hợp lệ' }, 400)

    // 3) Ràng buộc quyền của Quản lý chi nhánh.
    if (callerRole === 'manager') {
      if (role !== 'employee') return json({ error: 'Quản lý chỉ được tạo Nhân viên' }, 403)
      if (!branch_id || branch_id !== callerBranch) {
        return json({ error: 'Quản lý chỉ được tạo nhân sự trong chi nhánh của mình' }, 403)
      }
    }

    // 4) Tạo auth user, sau đó cập nhật email tổng hợp = <id>@domain.
    const tmpEmail = `tmp_${crypto.randomUUID()}@${domain}`
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: tmpEmail, password: String(pin), email_confirm: true,
    })
    if (cErr || !created?.user) return json({ error: cErr?.message ?? 'Tạo auth thất bại' }, 500)

    const newId = created.user.id
    await admin.auth.admin.updateUserById(newId, { email: `${newId}@${domain}` })

    // 5) Tạo hồ sơ public.users.
    const { error: insErr } = await admin.from('users').insert({
      id: newId, full_name, role, title: title ?? null, branch_id: branch_id ?? null, is_active: true,
    })
    if (insErr) {
      await admin.auth.admin.deleteUser(newId)
      return json({ error: insErr.message }, 500)
    }

    return json({ id: newId, full_name, role }, 200)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
