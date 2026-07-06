// Tiện ích định vị: khoảng cách geofence, geocode (Google), bản đồ, tính trạng thái giờ công.

export function distanceMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null || Number.isNaN(v))) return Infinity
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function timeToMinutes(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

export function computeStatus(type, at, workStart, workEnd, graceMin = 0) {
  const now = at.getHours() * 60 + at.getMinutes()
  if (type === 'in') {
    const start = timeToMinutes(workStart)
    if (start == null) return 'ontime'
    return now > start + graceMin ? 'late' : 'ontime'
  } else {
    const end = timeToMinutes(workEnd)
    if (end == null) return 'ontime'
    return now < end ? 'early' : 'ontime'
  }
}

export async function reverseGeocode(lat, lng) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key || lat == null || lng == null) return ''
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=vi&region=vn&key=${key}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === 'OK' && data.results?.length) return data.results[0].formatted_address || ''
    return ''
  } catch {
    return ''
  }
}

// Forward geocode: địa chỉ -> { lat, lng, formatted } hoặc { error, status, errorMessage }.
export async function forwardGeocode(address) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) return { error: 'no_key' }
  if (!address || !address.trim()) return { error: 'empty' }
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=vi&region=vn&key=${key}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === 'OK' && data.results?.length) {
      const r = data.results[0]
      return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address }
    }
    return { error: data.status || 'not_found', status: data.status, errorMessage: data.error_message || '' }
  } catch (e) {
    return { error: 'network', errorMessage: String(e?.message || e) }
  }
}

export const mapsLink = (lat, lng) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

export const embedMap = (lat, lng) =>
  `https://maps.google.com/maps?q=${lat},${lng}&z=17&hl=vi&output=embed`
