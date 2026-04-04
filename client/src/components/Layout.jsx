import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FileText, Upload, LogOut, User, BarChart3, LayoutDashboard, Home } from 'lucide-react'
import { AppLogo } from './AppLogo'
import { getTrustedUnderwritlyDashboardUrl } from '../lib/trustedUnderwritlyDashboardUrl'

const Layout = () => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const underwritlyDashboardUrl = getTrustedUnderwritlyDashboardUrl()

  /** Logged-in broker / user — never the insured name from the report. */
  const topRightName = user?.companyName || user?.email || 'User'

  const isIftaSummaryHome = location.pathname === '/reports'
  const isUpload = location.pathname.startsWith('/reports/upload')
  const isViewReport =
    location.pathname === '/reports/generated' ||
    location.pathname.startsWith('/reports/jurisdiction') ||
    location.pathname.startsWith('/reports/latest')

  const navClass = (active) =>
    `inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
      active ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[min(100%,1600px)] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 2xl:px-14">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-6">
              <Link
                to="/reports"
                className="flex items-center gap-2 shrink-0"
                title="IFTA summary in this app"
              >
                <AppLogo variant="nav" />
                <span className="sr-only">IFTA Pro</span>
              </Link>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={underwritlyDashboardUrl}
                  className={navClass(false)}
                  rel="noopener noreferrer"
                  title="Back to your insured list on Underwritly"
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Dashboard
                </a>
                <Link
                  to="/reports"
                  className={navClass(isIftaSummaryHome)}
                  title="IFTA summary and source PDFs"
                >
                  <Home className="h-4 w-4 mr-2" />
                  IFTA summary
                </Link>
                <Link to="/reports/upload" className={navClass(isUpload)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload New IFTAs
                </Link>
                <Link to="/reports/latest" className={navClass(isViewReport)}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Report
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user?.isAdmin && (
                <Link
                  to="/admin"
                  className="hidden sm:inline-flex items-center px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-primary-700 rounded-md"
                >
                  <BarChart3 className="h-3.5 w-3.5 mr-1" />
                  Admin
                </Link>
              )}
              <div className="hidden sm:flex items-center gap-1.5 text-right max-w-[10rem] lg:max-w-xs">
                <div className="h-7 w-7 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary-600" />
                </div>
                <span className="text-xs text-gray-600 truncate" title={topRightName}>
                  {topRightName}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                title="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[min(100%,1600px)] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 2xl:px-14 py-8 md:py-10">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
