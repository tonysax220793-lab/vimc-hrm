import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { distanceMeters, computeStatus, reverseGeocode } from '../../lib/geo.js'

export default function AttendanceScreen({ profile }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [, setStream] = useState(null)
  const [coords, setCoords] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [facing, setFacing] = useState('user') // 'user' (trước) | 'environment' (sau)
  const [gpsState, setGpsState] = useState('pending') // 'pending' | 'ready' | 'error'
  const [branch, setBranch] = useState(null) // chi nhánh của nhân sự (toạ độ, bán kính, giờ làm)
  const [address, setAddress] = useState('') // địa chỉ reverse-geocode
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [time, setTime] = useState(new Date())

  // Khoảng cách hiện tại tới chi nhánh (mét) + có nằm trong bán kính không.
  const distToBranch =
    branch?.lat != null && coords
      ? distanceMeters(coords.lat, coords.lng, branch.lat, branch.lng)
      : null
  const withinRadius = distToBranch == null ? true : distToBranch <= (branch?.radius_m ?? 300)

  // Đồng hồ
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const startCamera = useCallback(async (mode = 'user') => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      setCameraReady(false)
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } })
      streamRef.current = s
      setStream(s)
      if (videoRef.current) videoRef.current.srcObject = s
    } catch (e) {
      setCameraReady(false)
      setStatus('Không truy cập được camera: ' + e.message)
    }
  }, [])

  const flipCamera = () => {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    startCamera(next)
  }

  // Theo dõi vị trí GPS liên tục để luôn có toạ độ mới nhất khi chấm công.
  const watchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState('error')
      setStatus('Thiết bị không hỗ trợ định vị GPS.')
      return null
    }
    return navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setGpsState('ready')
      },
      (err) => {
        setGpsState('error')
        setStatus('Không lấy được vị trí GPS: ' + err.message)
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    )
  }, [])

  const loadHistory = useCallback(async () => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('attendance')
      .select('id, type, server_ts, status')
      .eq('user_id', profile.id)
      .gte('server_ts', startOfToday.toISOString())
      .order('server_ts', { ascending: true })
    setHistory(data || [])
  }, [profile.id])

  useEffect(() => {
    startCamera('user')
    const watchId = watchLocation()
    loadHistory()
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [startCamera, watchLocation, loadHistory])

  // Tải cấu hình chi nhánh của nhân sự (toạ độ, bán kính, giờ làm).
  useEffect(() => {
    if (!profile.branch_id) { setBranch(null); return }
    supabase
      .from('branches')
      .select('id, name, lat, lng, radius_m, work_start, work_end')
      .eq('id', profile.branch_id)
      .single()
      .then(({ data }) => setBranch(data || null))
  }, [profile.branch_id])

  // Reverse geocode toạ độ hiện tại thành địa chỉ (debounce nhẹ).
  useEffect(() => {
    if (!coords) { setAddress(''); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      const addr = await reverseGeocode(coords.lat, coords.lng)
      if (!cancelled) setAddress(addr)
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [coords])

  const captureBlob = () =>
    new Promise((resolve) => {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video?.videoWidth || 640
      canvas.height = video?.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (video) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7)
    })

  const existingIn = history.find((h) => h.type === 'in')
  const existingOut = history.find((h) => h.type === 'out')

  const checkIn = async (type) => {
    if (busy) return
    if (!cameraReady) {
      setStatus('⚠️ Camera chưa sẵn sàng. Vui lòng chờ hoặc cấp quyền camera.')
      return
    }
    if (!coords) {
      setStatus('⚠️ Chưa có vị trí GPS. Vui lòng bật định vị và cấp quyền truy cập.')
      return
    }
    if (type === 'in' && existingIn) {
      setStatus('⚠️ Bạn đã chấm công VÀO hôm nay rồi.')
      return
    }
    if (type === 'out') {
      if (!existingIn) { setStatus('⚠️ Bạn cần chấm công VÀO trước khi chấm công RA.'); return }
      if (existingOut) { setStatus('⚠️ Bạn đã chấm công RA hôm nay rồi.'); return }
    }
    if (branch?.lat != null && !withinRadius) {
      setStatus(
        `⚠️ Chấm công KHÔNG thành công: bạn đang cách chi nhánh ${Math.round(distToBranch)}m ` +
        `(cho phép ${branch.radius_m ?? 300}m). Vui lòng đến đúng địa điểm làm việc.`
      )
      return
    }

    setBusy(true)
    setStatus('')
    try {
      const blob = await captureBlob()
      if (!blob || blob.size < 1024) throw new Error('Ảnh chụp không hợp lệ, vui lòng thử lại.')
      const path = `${profile.id}/${Date.now()}_${type}.jpg`
      const up = await supabase.storage.from('attendance-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error

      const computedStatus = branch
        ? computeStatus(type, new Date(), branch.work_start, branch.work_end)
        : null

      const { error } = await supabase.from('attendance').insert({
        user_id: profile.id,
        branch_id: profile.branch_id,
        type,
        photo_path: path,
        lat: coords.lat,
        lng: coords.lng,
        address: address || null,
        distance_m: distToBranch != null && Number.isFinite(distToBranch) ? Math.round(distToBranch) : null,
        status: computedStatus,
      })
      if (error) throw error

      const label = type === 'in' ? 'VÀO' : 'RA'
      const stLabel = computedStatus === 'late' ? ' (đi muộn)'
        : computedStatus === 'early' ? ' (về sớm)'
        : computedStatus === 'ontime' ? ' (đúng giờ)' : ''
      setStatus(`✅ Chấm công ${label} thành công${stLabel}!`)
      loadHistory()
    } catch (e) {
      setStatus('Lỗi chấm công: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const checkInRec = existingIn
  const checkOutRec = existingOut
  const canCheckIn = cameraReady && !!coords && !busy && withinRadius
  const inDisabled = !canCheckIn || !!existingIn
  const outDisabled = !canCheckIn || !existingIn || !!existingOut

  const timeStr = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = time.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const statusBadge = (st) => {
    if (st === 'late') return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">ĐI MUỘN</span>
    if (st === 'early') return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">VỀ SỚM</span>
    if (st === 'ontime') return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">ĐÚNG GIỜ</span>
    return null
  }

  return (
    <div className="bg-surface-container-lowest text-on-surface flex flex-col min-h-screen">
      <main className="flex-1 px-container-margin pt-4 pb-24 max-w-lg mx-auto w-full">
        {/* Camera Frame */}
        <section className="relative aspect-[4/5] w-full rounded-2xl overflow-hidden bg-surface-variant mb-6 shadow-lg group">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedData={() => setCameraReady(true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 border-[2px] border-primary/30 m-8 rounded-full border-dashed animate-[spin_10s_linear_infinite] pointer-events-none"></div>

          {/* Nút xoay camera trước/sau */}
          <button
            type="button"
            onClick={flipCamera}
            title="Đổi camera trước/sau"
            className="absolute bottom-4 right-4 z-10 w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center active:scale-90 transition-transform border border-white/20"
          >
            <span className="material-symbols-outlined text-[22px]">cameraswitch</span>
          </button>

          <div className="absolute inset-0 flex flex-col justify-between p-6 bg-gradient-to-t from-black/45 via-transparent to-black/15 pointer-events-none">
            <div className="flex justify-between items-center">
              <span className="material-symbols-outlined text-white">center_focus_weak</span>
              <span className={`text-white text-[13px] font-medium backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1.5 ${cameraReady ? 'bg-primary/50' : 'bg-black/40'}`}>
                <span className={`w-2 h-2 rounded-full ${cameraReady ? 'bg-inverse-primary animate-pulse' : 'bg-white/60'}`}></span>
                {cameraReady ? 'Camera sẵn sàng' : 'Đang khởi động...'}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white">
                <span className="material-symbols-outlined text-inverse-primary text-[20px]">location_on</span>
                <p className="text-[14px] font-semibold truncate">{branch?.name || 'Địa điểm làm việc'}</p>
                {branch?.lat != null && coords && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${withinRadius ? 'bg-primary/70 text-white' : 'bg-error/80 text-white'}`}>
                    {withinRadius ? 'Trong bán kính' : `Ngoài ${branch.radius_m ?? 300}m`}
                  </span>
                )}
              </div>
              <p className="text-white/85 text-[13px] pl-7 leading-snug line-clamp-2">
                {coords
                  ? (address || `Đang lấy địa chỉ… (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`)
                  : (gpsState === 'error' ? '⚠️ Chưa lấy được GPS — hãy bật định vị' : 'Đang lấy vị trí GPS...')}
              </p>
              {branch?.lat != null && distToBranch != null && (
                <p className="text-white/70 text-[12px] pl-7">
                  Cách chi nhánh ~{Math.round(distToBranch)}m · Giờ làm {String(branch.work_start).slice(0, 5)}–{String(branch.work_end).slice(0, 5)}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Time & Date */}
        <div className="text-center mb-8">
          <p className="font-display-lg text-display-lg text-charcoal-ink tabular-nums">{timeStr}</p>
          <p className="text-[13px] font-medium text-on-surface-variant uppercase tracking-wider">{dateStr}</p>
        </div>

        {/* Điều kiện chấm công */}
        {(!cameraReady || !coords || !withinRadius) && (
          <div className="mb-4 p-3 rounded-2xl bg-bronze-gold/10 border border-bronze-gold/30 text-charcoal-ink/80 text-[13px] text-center space-y-1">
            <p className="flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">{cameraReady ? 'check_circle' : 'photo_camera'}</span>
              Camera: {cameraReady ? 'sẵn sàng' : 'đang chờ / cần cấp quyền'}
            </p>
            <p className="flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">{coords ? 'check_circle' : 'location_on'}</span>
              GPS: {coords ? 'đã có vị trí' : 'đang chờ / cần bật định vị'}
            </p>
            {branch?.lat != null && coords && !withinRadius && (
              <p className="flex items-center justify-center gap-1.5 text-error font-semibold">
                <span className="material-symbols-outlined text-[18px]">wrong_location</span>
                Ngoài phạm vi cho phép (~{Math.round(distToBranch)}m &gt; {branch.radius_m ?? 300}m)
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <button
            className="h-14 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-40 disabled:shadow-none disabled:pointer-events-none"
            disabled={inDisabled}
            onClick={() => checkIn('in')}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>login</span>
            <span className="font-semibold text-[15px] whitespace-nowrap">{existingIn ? 'Đã vào' : 'Chấm VÀO'}</span>
          </button>

          <button
            className="h-14 bg-white border-2 border-primary text-primary rounded-2xl shadow-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-40 disabled:border-outline-variant disabled:text-on-surface-variant/50 disabled:pointer-events-none"
            disabled={outDisabled}
            onClick={() => checkIn('out')}
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span className="font-semibold text-[15px] whitespace-nowrap">{existingOut ? 'Đã ra' : 'Chấm RA'}</span>
          </button>
        </div>

        {/* Status Message */}
        {status && (
          <div className="mb-6 p-3 text-center rounded-2xl bg-primary/10 text-primary text-[14px] font-semibold border border-primary/20">
            {status}
          </div>
        )}

        {/* History List */}
        <section className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-title-lg text-title-lg text-charcoal-ink">Lịch sử hôm nay</h3>
          </div>

          <div className="space-y-3">
            {/* IN */}
            <div className={`bg-white p-card-padding rounded-2xl flex items-center justify-between shadow-[0_4px_12px_rgba(31,122,77,0.06)] border border-surface-variant/50 transition-opacity duration-200 ${checkInRec ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${checkInRec ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined">{checkInRec ? 'check_circle' : 'pending'}</span>
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-charcoal-ink flex items-center gap-2">Giờ vào {checkInRec && statusBadge(checkInRec.status)}</p>
                  <p className="text-[13px] text-on-surface-variant">{checkInRec ? 'Đã chấm công' : 'Chưa ghi nhận'}</p>
                </div>
              </div>
              <p className={`font-headline-md text-headline-md ${checkInRec ? 'text-primary' : 'text-outline-variant'}`}>
                {checkInRec ? new Date(checkInRec.server_ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </p>
            </div>

            {/* OUT */}
            <div className={`bg-white p-card-padding rounded-2xl flex items-center justify-between shadow-[0_4px_12px_rgba(31,122,77,0.06)] border border-surface-variant/50 transition-opacity duration-200 ${checkOutRec ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${checkOutRec ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined">{checkOutRec ? 'check_circle' : 'pending'}</span>
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-charcoal-ink flex items-center gap-2">Giờ ra {checkOutRec && statusBadge(checkOutRec.status)}</p>
                  <p className="text-[13px] text-on-surface-variant">{checkOutRec ? 'Đã chấm công' : 'Chưa ghi nhận'}</p>
                </div>
              </div>
              <p className={`font-headline-md text-headline-md ${checkOutRec ? 'text-primary' : 'text-outline-variant'}`}>
                {checkOutRec ? new Date(checkOutRec.server_ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
