// =====================================================================
// Ngày nghỉ lễ chính thức Việt Nam 2026 (nghỉ hưởng lương theo Bộ luật
// Lao động + thông báo lịch nghỉ 2026 của Chính phủ).
//
// ⚠️ LƯU Ý: ngày nghỉ bù / bắc cầu và phương án nghỉ Tết khối doanh nghiệp
// do thông báo hằng năm quyết định — Admin nên rà soát & cập nhật mỗi năm.
// Nguồn tham khảo: thuvienphapluat.vn, vietnamnet.vn (lịch nghỉ Tết 2026).
//
// Quy ước VIMC: làm việc Thứ 2 – Thứ 7, nghỉ Chủ nhật.
// =====================================================================

export const VN_HOLIDAYS = {
  '2026-01-01': 'Tết Dương lịch',
  // Tết Nguyên đán Bính Ngọ — nghỉ chính thức 5 ngày (16–20/02/2026)
  '2026-02-16': 'Nghỉ Tết Nguyên đán (29 tháng Chạp)',
  '2026-02-17': 'Tết Nguyên đán — Mùng 1',
  '2026-02-18': 'Tết Nguyên đán — Mùng 2',
  '2026-02-19': 'Tết Nguyên đán — Mùng 3',
  '2026-02-20': 'Tết Nguyên đán — Mùng 4',
  // Giỗ Tổ Hùng Vương (10/3 ÂL) rơi Chủ nhật 26/4 → nghỉ bù 27/4
  '2026-04-26': 'Giỗ Tổ Hùng Vương (10/3 ÂL)',
  '2026-04-27': 'Nghỉ bù Giỗ Tổ Hùng Vương',
  '2026-04-30': 'Giải phóng miền Nam 30/4',
  '2026-05-01': 'Quốc tế Lao động 1/5',
  '2026-09-02': 'Quốc khánh 2/9',
  '2026-09-03': 'Nghỉ Quốc khánh (ngày thứ 2)', // theo thông báo — cần xác nhận
}

// Chuẩn hóa Date -> 'YYYY-MM-DD' theo giờ địa phương.
export const toKey = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const holidayName = (key) => VN_HOLIDAYS[key] || null

// VIMC nghỉ Chủ nhật (getDay() === 0).
export const isSunday = (d) => d.getDay() === 0
