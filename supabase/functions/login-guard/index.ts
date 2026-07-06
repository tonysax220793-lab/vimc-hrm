// Supabase Edge Function: login-guard
// Khóa đăng nhập phía SERVER để chống dò mã PIN (brute-force).
// Bổ trợ cho khóa phía client (vốn reset khi tải lại trang).
//
// Deploy:
//   supabase functions deploy login-guard --no-verify-jwt
//   (--no-verify-jwt vì hàm được gọi TRƯỚC khi người dùng đăng nhập)
//
// Secrets cần có (Supabase tự cấp SUPABASE_URL & SERVICE_ROLE khi deploy):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// API:
//   POST { action: 'check',  user_key }            -> { locked, failed, max, window_min, retry_after_min }
//   POST { action: 'record', user_key, ok: bool }  -> { ok: true }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_FAILED = 5
const WINDOW_MIN = 15

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    const { action, user_key, ok } = await req.json()
    if (!user_key || typeof user_key !== 'string') {
      return json({ error: 'Thiếu user_key' }, 400)
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    if (action === 'record') {
      const { error } = await admin.from('login_attempts').insert({
        user_key,
        ok: !!ok,
        ip,
      })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    // action === 'check' (mặc định)
    const { data, error } = await admin.rpc('recent_failed_logins', {
      p_user_key: user_key,
      p_window_min: WINDOW_MIN,
    })
    if (error) return json({ error: error.message }, 500)

    const failed = Number(data) || 0
    const locked = failed >= MAX_FAILED
    return json({
      locked,
      failed,
      max: MAX_FAILED,
      window_min: WINDOW_MIN,
      retry_after_min: locked ? WINDOW_MIN : 0,
    })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
