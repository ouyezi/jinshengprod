import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminRouteGuard from './components/AdminRouteGuard'
import AdminLayout from './routes/AdminLayout'
import Login from './pages/admin/Login'
import Employees from './pages/admin/Employees'
import Standards from './pages/admin/Standards'
import Summary from './pages/admin/Summary'
import Evaluation from './pages/review/Evaluation'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <AdminRouteGuard>
              <AdminLayout />
            </AdminRouteGuard>
          }
        >
          <Route path="employees" element={<Employees />} />
          <Route path="standards" element={<Standards />} />
          <Route path="summary" element={<Summary />} />
          <Route index element={<Navigate to="employees" replace />} />
        </Route>
        <Route path="/review" element={<Evaluation />} />
        <Route path="*" element={<Navigate to="/review" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
