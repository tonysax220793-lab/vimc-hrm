import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, emailForUserId } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null) // hàng trong public.users
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, role, title, branch_id, avatar_url')
      .eq('id', userId)
      .single()
    if (error) { console.error('Load profile lỗi:', error.message); setProfile(null) }
    else setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      loadProfile(sess?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  // Đăng nhập Tên + PIN: userId lấy từ login_directory(), pin là mã PIN.
  const signIn = useCallback(async (userId, pin) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailForUserId(userId),
      password: pin,
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = { session, profile, loading, signIn, signOut, reloadProfile: () => loadProfile(session?.user?.id) }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng trong <AuthProvider>')
  return ctx
}
