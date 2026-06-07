import { Navigate } from 'react-router-dom'
import { getToken } from '../api/client'

export default function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/admin/login" replace />
  return <>{children}</>
}
