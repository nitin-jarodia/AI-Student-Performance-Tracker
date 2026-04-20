import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RoleGuard({ allow, children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  const allowed = Array.isArray(allow) ? allow : [allow]
  const role = (user.role || 'teacher').toLowerCase()
  if (!allowed.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }
  return children
}
