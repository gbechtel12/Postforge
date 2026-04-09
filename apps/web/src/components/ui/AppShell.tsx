import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Sparkles, Settings, type LucideIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/generate', label: 'Generate', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppShell() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const email = user?.email ?? ''

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 z-10 flex w-[240px] shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-6">
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            PostForge
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50',
                ].join(' ')
              }
            >
              <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-gray-100 p-3">
          {email ? (
            <p className="mb-2 truncate px-3 text-xs text-gray-500" title={email}>
              {email}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="ml-[240px] min-h-screen flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
