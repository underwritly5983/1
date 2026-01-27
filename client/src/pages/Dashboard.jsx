import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { FileText, Upload, TrendingUp, Clock, AlertCircle, ArrowRight, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const Dashboard = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    totalReports: 0,
    recentReports: [],
    processingReports: 0,
    oldReports: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get('/reports')
      const reports = response.data.reports || []
      
      const recent = reports
        .filter(r => r.status === 'completed')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)

      const processing = reports.filter(r => r.status === 'processing').length
      
      // Check for old reports (>6 months)
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const old = reports.filter(r => {
        if (!r.detectedDate) return false
        return new Date(r.detectedDate) < sixMonthsAgo
      }).length

      setStats({
        totalReports: reports.length,
        recentReports: recent,
        processingReports: processing,
        oldReports: old
      })
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const chartData = stats.recentReports.map(r => ({
    name: `${r.quarter} ${r.year}`,
    reports: 1
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {user?.companyName}</p>
        </div>
        {user?.subscriptionTier === 'free' && (
          <Link
            to="/pricing"
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-medium hover:from-amber-600 hover:to-amber-700 transition-colors"
          >
            <Crown className="h-4 w-4 mr-2" />
            Upgrade to Premium
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Reports</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalReports}</p>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Processing</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.processingReports}</p>
            </div>
            <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Old Reports</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.oldReports}</p>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Month</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats.recentReports.filter(r => {
                  const reportDate = new Date(r.createdAt)
                  const now = new Date()
                  return reportDate.getMonth() === now.getMonth() && 
                         reportDate.getFullYear() === now.getFullYear()
                }).length}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/reports/upload"
              className="flex items-center justify-between p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <div className="flex items-center">
                <Upload className="h-5 w-5 text-primary-600 mr-3" />
                <span className="font-medium text-gray-900">Upload New Report</span>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
            </Link>
            <Link
              to="/reports"
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-gray-600 mr-3" />
                <span className="font-medium text-gray-900">View All Reports</span>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Reports</h2>
          {stats.recentReports.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No reports yet</p>
              <Link to="/reports/upload" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
                Upload your first report
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentReports.map((report) => (
                <Link
                  key={report.id}
                  to={`/reports/${report.id}`}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{report.fileName}</p>
                    <p className="text-sm text-gray-500">
                      {report.quarter} {report.year}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    report.status === 'completed' ? 'bg-green-100 text-green-700' :
                    report.status === 'processing' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {report.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      {stats.recentReports.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Report Activity</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="reports" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default Dashboard
