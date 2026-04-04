import { Outlet } from 'react-router-dom'

// TODO: Add nav sidebar/topbar in Phase 4
export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
