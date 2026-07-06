// Tiện ích định vị: khoảng cách geofence, geocode qua OpenStreetMap (miễn phí,
// KHÔNG cần API key / billing), bản đồ OSM, tính trạng thái giờ công.
//
// Lưu ý: dùng dịch vụ công cộng Nominatim của OpenStreetMap — hợp cho app nội bộ
// lưu lượng thấp (giới hạn ~1 req/giây). Nếu sau này dùng nhiều, cân nhắc dịch vụ
// có key miễn phí (Geoapify / LocationIQ) hoặc tự dựng Nominatim.

const NOMINATIM = 'https://nominatim.openstreetmap.org'

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

// Reverse geocode: toạ độ -> địa chỉ (tiếng Việt). Trả '' nếu lỗi.
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return ''
  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&accept-language=vi&lat=${lat}&lon=${lng}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const data = await res.json()
    return data.display_name || ''
  } catch {
    return ''
  }
}

// Forward geocode: địa chỉ -> { lat, lng, formatted } hoặc { error }.
export async function forwardGeocode(address) {
  if (!address || !address.trim()) return { error: 'empty' }
  try {
    const url =
      `${NOMINATIM}/search?format=jsonv2&limit=1&accept-language=vi&countrycodes=vn` +
      `&q=${encodeURIComponent(address)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { error: 'http', errorMessage: `HTTP ${res.status}` }
    const data = await res.json()
    if (Array.isArray(data) && data.length) {
      const r = data[0]
      return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), formatted: r.display_name }
    }
    return { error: 'not_found' }
  } catch (e) {
    return { error: 'network', errorMessage: String(e?.message || e) }
  }
}

// Link mở bản đồ (OpenStreetMap).
export const mapsLink = (lat, lng) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`

// Bản đồ nhúng OSM (iframe) — không cần API key.
export const embedMap = (lat, lng) => {
  const la = Number(lat), lo = Number(lng), d = 0.004
  const bbox = `${lo - d},${la - d},${lo + d},${la + d}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${la},${lo}`
}
