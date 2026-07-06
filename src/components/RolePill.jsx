import { ROLE_META } from '../lib/roles.js'

export default function RolePill({ role, title }) {
  const meta = ROLE_META[role] || ROLE_META.employee
  
  // Custom Tailwind styling map for roles
  let badgeClass = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border "
  if (role === 'admin') {
    badgeClass += "bg-red-50 text-red-600 border-red-200/40"
  } else if (role === 'director') {
    badgeClass += "bg-blue-50 text-blue-600 border-blue-200/40"
  } else if (role === 'manager') {
    badgeClass += "bg-purple-50 text-purple-600 border-purple-200/40"
  } else {
    badgeClass += "bg-primary/5 text-primary border-primary/20"
  }

  return (
    <span className={badgeClass}>
      {meta.label}{title ? ` · ${title}` : ''}
    </span>
  )
}

