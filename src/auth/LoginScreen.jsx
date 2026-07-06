import { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from './useAuth.jsx'
import { ROLE_META } from '../lib/roles.js'
import PinPad from './PinPad.jsx'

const MAX_ATTEMPTS = 5
const PIN_LENGTH = 6

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [directory, setDirectory] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestionsRef = useRef(null)
  const fallbackRef = useRef(false)
  const locked = attempts >= MAX_ATTEMPTS

  useEffect(() => {
    const q = query.trim()
    if (fallbackRef.current) return
    if (q.length < 2) { setDirectory([]); return }

    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error: rpcErr } = await supabase.rpc('login_lookup', { search: q })
      if (cancelled) return
      if (rpcErr) {
        fallbackRef.current = true
        const res = await supabase.rpc('login_directory')
        if (!cancelled) setDirectory(res.data || [])
      } else {
        setDirectory(data || [])
      }
    }, 250)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  const suggestions = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return directory.filter((u) => u.full_name.toLowerCase().includes(q)).slice(0, 8)
  }, [query, directory])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const guard = async (action, ok) => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('login-guard', {
        body: { action, user_key: selected?.id, ok },
      })
      if (fnErr) return null
      return data
    } catch {
      return null
    }
  }

  const handleLogin = async (e) => {
    if (e) e.preventDefault()
    if (!selected || pin.length < 4 || locked) return
    setBusy(true); setError('')

    const check = await guard('check')
    if (check?.locked) {
      setBusy(false)
      setPin('')
      setError(`Đã khóa đăng nhập do nhập sai quá nhiều. Thử lại sau ~${check.retry_after_min || 15} phút hoặc liên hệ Admin.`)
      return
    }

    try {
      await signIn(selected.id, pin)
      guard('record', true)
    } catch (err) {
      guard('record', false)
      const next = attempts + 1
      setAttempts(next)
      setPin('')
      setError(next >= MAX_ATTEMPTS
        ? 'Đã khóa do nhập sai quá nhiều lần. Vui lòng liên hệ Admin.'
        : `Sai mã PIN (${next}/${MAX_ATTEMPTS}).`)
    } finally {
      setBusy(false)
    }
  }

  const roleClassMap = {
    manager: 'bg-purple-100 text-purple-700',
    director: 'bg-blue-100 text-blue-700',
    admin: 'bg-red-100 text-red-700',
    employee: 'bg-green-100 text-green-700',
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-5 bg-[#F7F4EC] relative overflow-hidden">
      <style>{`
        .dong-son-watermark {
          position: fixed; top: 50%; left: 50%;
          width: 1400px; height: 1400px; margin-top: -700px; margin-left: -700px;
          background-image: url('/assets/dongson-watermark.svg');
          background-size: contain; background-repeat: no-repeat; background-position: center;
          opacity: 0.12; pointer-events: none; z-index: 0;
          mask-image: radial-gradient(circle, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(circle, black 30%, transparent 80%);
          animation: rotateWatermark 240s linear infinite;
        }
        @keyframes rotateWatermark { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .glass-card {
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 24px 64px -12px rgba(6, 108, 65, 0.15);
        }
        .pin-btn:active { transform: scale(0.95); background-color: #1F7A4D !important; color: white !important; }
        input:focus + label,
        input:not(:placeholder-shown) + label { opacity: 0; visibility: hidden; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #bec9bf; border-radius: 10px; }
      `}</style>

      <div className="dong-son-watermark"></div>

      <main className="relative z-10 w-full max-w-[420px]">
        <div className="glass-card rounded-[28px] px-8 py-10 flex flex-col items-center">
          <div className="mb-5 w-40 max-w-full h-auto">
            <img alt="VIMC — Trung tâm Y học Bản địa Việt Nam" className="w-full h-auto object-contain" src="/assets/logo.png" />
          </div>

          <div className="text-center mb-9">
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-charcoal-ink mb-1.5">Chào mừng trở lại</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Hệ thống Quản lý Nhân sự VIMC</p>
          </div>

          <form className="w-full space-y-6" onSubmit={handleLogin}>
            <div className="relative" ref={suggestionsRef}>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-outline z-10">search</span>
                <input
                  autoComplete="off"
                  className="w-full h-14 pl-12 pr-4 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-transparent"
                  id="name-input"
                  placeholder=" "
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelected(null)
                    setPin('')
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />
                <label
                  className="absolute left-12 top-1/2 -translate-y-1/2 font-body-lg text-body-lg text-on-surface-variant/70 transition-opacity duration-150 pointer-events-none"
                  htmlFor="name-input"
                >
                  Họ và tên
                </label>
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-outline-variant z-20 max-h-60 overflow-y-auto custom-scrollbar" id="suggestions">
                  {suggestions.map((u) => {
                    const roleClass = roleClassMap[u.role] || 'bg-gray-100 text-gray-700'
                    const roleLabel = ROLE_META[u.role]?.label || u.role
                    return (
                      <div
                        key={u.id}
                        className="suggestion-item p-4 hover:bg-surface-container transition-colors cursor-pointer flex items-center justify-between border-b border-outline-variant/30"
                        onClick={() => {
                          setSelected(u)
                          setQuery(u.full_name)
                          setShowSuggestions(false)
                          setError('')
                        }}
                      >
                        <span className="font-label-lg text-label-lg text-charcoal-ink">{u.full_name}</span>
                        <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleClass}`}>
                          {roleLabel}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className={`relative transition-all duration-300 ${selected ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-outline z-10">lock</span>
                <input
                  className="w-full h-14 pl-12 pr-12 bg-white border border-outline-variant rounded-xl font-body-lg text-body-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-transparent"
                  id="pin-input"
                  maxLength={PIN_LENGTH}
                  placeholder=" "
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '')
                    if (val.length <= PIN_LENGTH) setPin(val)
                  }}
                  disabled={!selected || locked}
                />
                <label
                  className="absolute left-12 top-1/2 -translate-y-1/2 font-body-lg text-body-lg text-on-surface-variant/70 transition-opacity duration-150 pointer-events-none"
                  htmlFor="pin-input"
                >
                  Mã PIN
                </label>
                <button
                  className="absolute right-4 text-outline hover:text-primary transition-colors z-10"
                  onClick={() => setShowPin((s) => !s)}
                  type="button"
                  disabled={!selected}
                >
                  <span className="material-symbols-outlined">
                    {showPin ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <div className={`transition-all duration-300 ${selected ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <PinPad
                onDigit={(digit) => {
                  if (selected && !locked && pin.length < PIN_LENGTH) {
                    setPin((p) => p + digit)
                  }
                }}
                onBackspace={() => {
                  if (selected && !locked) {
                    setPin((p) => p.slice(0, -1))
                  }
                }}
              />
            </div>

            {error && (
              <div className="text-center font-label-md text-label-md text-error bg-error-container/40 p-3 rounded-lg border border-error-container">
                {error}
              </div>
            )}

            <button
              className="w-full h-14 bg-primary text-white rounded-xl font-title-lg text-title-lg shadow-lg hover:shadow-xl active:scale-[0.98] transition-all mt-4 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
              type="submit"
              disabled={!selected || pin.length < 4 || locked || busy}
            >
              {busy ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Đang đăng nhập...
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>

            <div className="text-center">
              <a className="font-label-lg text-label-lg text-primary hover:underline" href="#">Quên mã PIN?</a>
            </div>
          </form>
        </div>

        <p className="text-center mt-8 font-label-md text-label-md text-on-surface-variant/60">
          © 2026 Vietnam's Indigenous Medicine Center. All rights reserved.
        </p>
      </main>
    </div>
  )
}
