import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import Layout from './components/Layout'
import Reports from './pages/Reports'
import UploadReport from './pages/UploadReport'
import GeneratedReports from './pages/GeneratedReports'
import GenerateReport from './pages/GenerateReport'
import JurisdictionReport from './pages/JurisdictionReport'
import LatestSummaryRedirect from './pages/LatestSummaryRedirect'
import Profile from './pages/Profile'
import AdminDashboard from './pages/AdminDashboard'
import Login from './pages/Login'
import Register from './pages/Register'

function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/reports/upload" replace />} />
              <Route path="/dashboard" element={<Navigate to="/reports" replace />} />
              <Route path="/reports/upload" element={<UploadReport />} />
              <Route path="/reports/uploads" element={<Reports />} />
              <Route path="/reports/generated" element={<Navigate to="/reports" replace />} />
              <Route path="/reports/generate" element={<GenerateReport />} />
              <Route path="/reports/latest" element={<LatestSummaryRedirect />} />
              <Route path="/reports/jurisdiction/:id" element={<JurisdictionReport />} />
              <Route path="/reports" element={<GeneratedReports />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
            <Route path="*" element={<Navigate to="/reports" replace />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </Router>
  )
}

export default App
