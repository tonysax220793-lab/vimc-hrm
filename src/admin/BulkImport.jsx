import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { ROLE_OPTIONS } from '../lib/roles.js'

export default function BulkImport({ onImportComplete, onCancel }) {
  const [inputText, setInputText] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [branches, setBranches] = useState([])
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, errors: [] })
  const [statusMsg, setStatusMsg] = useState('')

  // Load branches to map branch names to IDs
  useEffect(() => {
    supabase.from('branches').select('id, name').then(({ data }) => {
      setBranches(data || [])
    })
  }, [])

  // Helper to resolve role key from Vietnamese labels or standard keys
  const resolveRole = (roleStr) => {
    if (!roleStr) return 'employee'
    const clean = roleStr.trim().toLowerCase()
    if (clean === 'admin' || clean === 'quản trị viên' || clean === 'quản trị') return 'admin'
    if (clean === 'director' || clean === 'giám đốc') return 'director'
    if (clean === 'manager' || clean === 'quản lý') return 'manager'
    return 'employee'
  }

  // Parse CSV / TSV text
  const handleParse = () => {
    if (!inputText.trim()) {
      setStatusMsg('Vui lòng dán dữ liệu hoặc chọn tệp tin.')
      return
    }

    const lines = inputText.split('\n')
    const rows = []
    
    // Check if first line is a header
    const firstLine = lines[0].toLowerCase()
    let startIdx = 0
    if (
      firstLine.includes('họ tên') ||
      firstLine.includes('name') ||
      firstLine.includes('vai trò') ||
      firstLine.includes('pin')
    ) {
      startIdx = 1
    }

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Detect separator: Tab for Excel copy-paste, Comma for CSV
      const separator = line.includes('\t') ? '\t' : ','
      const parts = line.split(separator).map(p => p.trim().replace(/^["']|["']$/g, '')) // remove quotes

      if (parts.length < 2) continue // need at least Name and PIN

      const fullName = parts[0]
      const pin = parts[1]
      const roleRaw = parts[2] || 'employee'
      const title = parts[3] || ''
      const branchRaw = parts[4] || ''

      const role = resolveRole(roleRaw)

      // Find branch ID by matching name
      let branchId = null
      let matchedBranchName = ''
      if (branchRaw) {
        const matched = branches.find(b => 
          b.name.toLowerCase().includes(branchRaw.toLowerCase()) ||
          branchRaw.toLowerCase().includes(b.name.toLowerCase())
        )
        if (matched) {
          branchId = matched.id
          matchedBranchName = matched.name
        }
      }

      // Validations
      const errors = []
      if (!fullName) errors.push('Thiếu họ tên')
      if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        errors.push('PIN phải từ 4-6 chữ số')
      }

      rows.push({
        index: i,
        fullName,
        pin,
        role,
        title,
        branchRaw,
        branchId,
        matchedBranchName,
        errors,
        status: 'pending' // pending, importing, success, error
      })
    }

    setParsedRows(rows)
    setStatusMsg(`Đã phân tích ${rows.length} dòng. Vui lòng kiểm tra dữ liệu bên dưới trước khi nhập.`)
  }

  // Handle CSV file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      setInputText(event.target.result)
      setStatusMsg('Đã tải tệp tin. Nhấn "Phân tích dữ liệu" để kiểm tra.')
    }
    reader.readAsText(file)
  }

  // Run the sequential import process
  const runImport = async () => {
    const rowsToImport = parsedRows.filter(r => r.errors.length === 0)
    if (rowsToImport.length === 0) {
      setStatusMsg('Không có nhân sự hợp lệ nào để nhập.')
      return
    }

    setIsImporting(true)
    setProgress({
      current: 0,
      total: rowsToImport.length,
      success: 0,
      errors: []
    })

    const updatedRows = [...parsedRows]
    let successCount = 0
    let currentIdx = 0

    for (const row of updatedRows) {
      if (row.errors.length > 0) continue

      row.status = 'importing'
      setParsedRows([...updatedRows])
      currentIdx++

      try {
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            full_name: row.fullName,
            role: row.role,
            title: row.title || null,
            branch_id: row.branchId || null,
            pin: row.pin
          }
        })

        if (error) throw error

        row.status = 'success'
        successCount++
        setProgress(prev => ({
          ...prev,
          current: currentIdx,
          success: successCount
        }))
      } catch (err) {
        row.status = 'error'
        row.errors = [...row.errors, err.message]
        setProgress(prev => ({
          ...prev,
          current: currentIdx,
          errors: [...prev.errors, { name: row.fullName, error: err.message }]
        }))
      }
      setParsedRows([...updatedRows])
    }

    setIsImporting(false)
    setStatusMsg(`Hoàn thành! Nhập thành công ${successCount}/${rowsToImport.length} nhân sự.`)
    if (successCount > 0 && onImportComplete) {
      onImportComplete()
    }
  }

  return (
    <div className="space-y-6 bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm">
      <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
        <h3 className="font-title-lg text-title-lg text-primary font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined">group_add</span>
          <span>Nhập nhân sự hàng loạt</span>
        </h3>
        <button 
          onClick={onCancel}
          className="text-on-surface-variant hover:text-charcoal-ink font-body-md"
          disabled={isImporting}
        >
          Hủy
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-background-cream p-4 rounded-xl text-body-md text-on-surface-variant space-y-2 border border-outline-variant/30">
        <p className="font-semibold text-charcoal-ink">Hướng dẫn định dạng dữ liệu:</p>
        <p>Sao chép trực tiếp từ Excel hoặc soạn thảo tệp CSV/Text với các cột theo thứ tự sau (phân cách bằng dấu phẩy hoặc dấu tab):</p>
        <code className="block bg-white p-2 rounded border border-outline-variant/50 text-xs font-mono select-all text-primary">
          Họ tên, Mã PIN, Vai trò, Chức danh, Chi nhánh
        </code>
        <div className="text-xs space-y-1 text-on-surface-variant/80 pt-1">
          <p>• <strong>Vai trò:</strong> admin (Quản trị), director (Giám đốc), manager (Quản lý), employee (Nhân viên)</p>
          <p>• <strong>Mã PIN:</strong> 4 đến 6 chữ số đăng nhập</p>
          <p>• <strong>Chi nhánh:</strong> Trụ sở chính (HN), VIMC Đà Nẵng, VIMC TP.HCM... (Hệ thống tự động tìm và khớp tên)</p>
        </div>
      </div>

      {!isImporting && parsedRows.length === 0 && (
        <div className="space-y-4">
          {/* File Upload */}
          <div>
            <label className="block font-label-lg text-label-lg text-charcoal-ink mb-2">Chọn tệp CSV / Excel CSV</label>
            <input 
              type="file" 
              accept=".csv,.txt" 
              onChange={handleFileUpload}
              className="w-full text-body-md file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-label-md file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
          </div>

          {/* Text Area Input */}
          <div>
            <label className="block font-label-lg text-label-lg text-charcoal-ink mb-2">Hoặc dán dữ liệu vào đây</label>
            <textarea
              className="w-full min-h-[150px] p-4 bg-surface-container-low border border-outline-variant rounded-xl font-body-md text-body-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-on-surface-variant/40"
              placeholder="Nguyễn Văn A&#9;123456&#9;employee&#9;Dược sĩ&#9;Trụ sở chính (HN)&#10;Trần Thị B&#9;654321&#9;manager&#9;Quản lý kho&#9;VIMC TP.HCM"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>

          {statusMsg && (
            <p className="text-body-md text-secondary font-medium">{statusMsg}</p>
          )}

          <button
            onClick={handleParse}
            className="w-full h-12 bg-primary text-white rounded-xl font-label-lg text-label-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">analytics</span>
            <span>Phân tích dữ liệu</span>
          </button>
        </div>
      )}

      {/* Parse Preview and Status Table */}
      {parsedRows.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-label-lg text-label-lg text-charcoal-ink">
              Danh sách xem trước ({parsedRows.length} nhân viên)
            </span>
            {!isImporting && (
              <button 
                onClick={() => setParsedRows([])} 
                className="text-error font-body-md hover:underline"
              >
                Xóa làm lại
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-outline-variant rounded-xl max-h-80 custom-scrollbar">
            <table className="w-full text-left border-collapse text-body-md">
              <thead>
                <tr className="bg-surface-container-high border-b border-outline-variant text-charcoal-ink font-semibold">
                  <th className="p-3">Họ tên</th>
                  <th className="p-3">PIN</th>
                  <th className="p-3">Vai trò</th>
                  <th className="p-3">Chức danh</th>
                  <th className="p-3">Chi nhánh</th>
                  <th className="p-3 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 bg-white">
                {parsedRows.map((row, idx) => {
                  const hasErr = row.errors.length > 0
                  let statusCell = <span className="text-on-surface-variant/50">Sẵn sàng</span>
                  if (row.status === 'importing') {
                    statusCell = <span className="text-primary font-bold animate-pulse">Đang nhập...</span>
                  } else if (row.status === 'success') {
                    statusCell = <span className="text-accent-green font-bold flex items-center justify-center gap-1">✓ Thành công</span>
                  } else if (row.status === 'error' || hasErr) {
                    statusCell = (
                      <div className="text-error font-medium text-xs">
                        {row.errors.map((e, ei) => <p key={ei}>• {e}</p>)}
                      </div>
                    )
                  }

                  return (
                    <tr key={idx} className={hasErr ? 'bg-error-container/10' : 'hover:bg-surface-container-low/30'}>
                      <td className="p-3 font-semibold text-charcoal-ink">{row.fullName || <span className="text-error font-normal">[Thiếu]</span>}</td>
                      <td className="p-3 font-mono">{row.pin}</td>
                      <td className="p-3 capitalize">{row.role}</td>
                      <td className="p-3 text-on-surface-variant">{row.title || '—'}</td>
                      <td className="p-3 text-on-surface-variant">
                        {row.matchedBranchName ? (
                          <span className="text-primary font-medium">{row.matchedBranchName}</span>
                        ) : row.branchRaw ? (
                          <span className="text-on-surface-variant/40 line-through" title="Không khớp chi nhánh nào">{row.branchRaw}</span>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-center">{statusCell}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {statusMsg && (
            <p className="text-body-md font-medium text-charcoal-ink">{statusMsg}</p>
          )}

          {isImporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-on-surface-variant">
                <span>Tiến độ nhập: {progress.current}/{progress.total}</span>
                <span>Thành công: {progress.success}</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          )}

          {!isImporting && (
            <button
              onClick={runImport}
              className="w-full h-12 bg-primary text-white rounded-xl font-label-lg text-label-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              disabled={parsedRows.every(r => r.errors.length > 0)}
            >
              <span className="material-symbols-outlined">publish</span>
              <span>Bắt đầu nhập ({parsedRows.filter(r => r.errors.length === 0).length} nhân sự hợp lệ)</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
