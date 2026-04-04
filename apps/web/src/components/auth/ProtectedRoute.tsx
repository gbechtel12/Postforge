import { Navigate, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

interface Props {
  session: Session | null
}

export default function ProtectedRoute({ session }: Props) {
  if (!session) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
