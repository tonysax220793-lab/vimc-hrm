import { useState } from 'react'
import DailyLog from './DailyLog.jsx'
import ChecklistList from './ChecklistList.jsx'
import HandoverList from './HandoverList.jsx'

const SUBTABS = [
  { key: 'log', label: 'Nhật ký' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'handover', label: 'Bàn giao' },
]

export default function WorkScreen({ profile }) {
  const [sub, setSub] = useState('log')

  return (
    <div className="max-w-lg mx-auto w-full px-container-margin pt-4 pb-24">
      {/* Sliding Subtabs navigation */}
      <div className="flex bg-surface-container rounded-2xl p-1.5 mb-6 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
        {SUBTABS.map((s) => {
          const isActive = sub === s.key
          return (
            <button
              key={s.key}
              className={`flex-1 py-3 text-center rounded-xl font-label-lg text-label-lg transition-all duration-150 active:scale-95 ${isActive ? 'bg-primary text-white shadow-sm font-semibold' : 'text-on-surface-variant/80 hover:text-charcoal-ink'}`}
              onClick={() => setSub(s.key)}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Sub-component views */}
      <div className="transition-all duration-200">
        {sub === 'log' && <DailyLog profile={profile} />}
        {sub === 'checklist' && <ChecklistList profile={profile} />}
        {sub === 'handover' && <HandoverList profile={profile} />}
      </div>
    </div>
  )
}

