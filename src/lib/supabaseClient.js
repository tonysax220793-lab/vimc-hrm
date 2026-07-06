import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Cảnh báo sớm nếu thiếu cấu hình môi trường.
  console.warn('[VIMC] Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local')
}

export const AUTH_EMAIL_DOMAIN = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'vimc.local'

// Email tổng hợp cho cơ chế đăng nhập Tên + PIN.
export const emailForUserId = (userId) => `${userId}@${AUTH_EMAIL_DOMAIN}`

export const supabase = createClient(url, anonKey)
