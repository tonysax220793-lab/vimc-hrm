import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { canAssignWork } from '../../lib/roles.js'

export default function ChecklistList({ profile }) {
  const [lists, setLists] = useState([])
  const [items, setItems] = useState({}) // checklistId -> items[]

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('checklists')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setLists(data || [])
    
    const map = {}
    for (const c of data || []) {
      const { data: its } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', c.id)
        .order('sort_order')
      map[c.id] = its || []
    }
    setItems(map)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (item) => {
    const nextVal = !item.is_done
    await supabase
      .from('checklist_items')
      .update({ is_done: nextVal, done_at: nextVal ? new Date().toISOString() : null })
      .eq('id', item.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-md text-headline-md text-charcoal-ink">Danh sách Checklist</h3>
        {canAssignWork(profile.role) && (
          <span className="font-label-md text-label-md text-primary bg-primary/10 px-3 py-1 rounded-full">
            Quyền phân việc
          </span>
        )}
      </div>

      {lists.map((c) => {
        const its = items[c.id] || []
        const done = its.filter((i) => i.is_done).length
        const total = its.length
        const progress = total > 0 ? Math.round((done / total) * 100) : 0

        return (
          <div key={c.id} className="bg-white p-6 rounded-2xl border border-surface-variant/50 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-title-lg text-title-lg text-charcoal-ink">{c.title}</h4>
                <p className="font-body-md text-body-md text-on-surface-variant/60 uppercase tracking-wider text-xs mt-1">
                  Trạng thái: {c.status}
                </p>
              </div>
              <span className="font-label-lg text-label-lg text-primary bg-primary/5 px-2.5 py-1 rounded-lg">
                {done}/{total} ({progress}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            {/* Items */}
            <div className="space-y-3 pt-2">
              {its.map((i) => {
                const isItemDone = i.is_done
                return (
                  <div key={i.id} className="flex items-start gap-3 group">
                    <button
                      onClick={() => toggle(i)}
                      className={`mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-150 active:scale-90 ${isItemDone ? 'bg-primary border-primary text-white' : 'border-outline-variant hover:border-primary bg-white text-transparent'}`}
                    >
                      <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                    </button>
                    <p
                      onClick={() => toggle(i)}
                      className={`font-body-lg text-body-lg flex-1 cursor-pointer transition-all ${isItemDone ? 'line-through text-on-surface-variant/40' : 'text-charcoal-ink'}`}
                    >
                      {i.content}
                    </p>
                  </div>
                )
              })}

              {its.length === 0 && (
                <p className="text-center font-body-md text-on-surface-variant/50 py-2">
                  Checklist trống.
                </p>
              )}
            </div>
          </div>
        )
      })}

      {lists.length === 0 && (
        <div className="bg-white p-8 rounded-2xl border border-surface-variant/50 text-center">
          <span className="material-symbols-outlined text-outline-variant text-[48px] mb-2">assignment_turned_in</span>
          <p className="font-body-md text-on-surface-variant/60">Không có checklist nào cần làm.</p>
        </div>
      )}
    </div>
  )
}
