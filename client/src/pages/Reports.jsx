import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { FileText, Upload, Trash2, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const Reports = () => {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReports, setSelectedReports] = useState(new Set())

  const fetchReports = useCallback(async (opts = {}) => {
    const silent401 = opts.silent401 === true
    try {
      const response = await axios.get('/reports')
      setReports(response.data.reports || [])
    } catch (error) {
      if (error.response?.status === 401 && silent401) return
      if (!silent401) toast.error('Failed to fetch reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
      navigate('/login?returnTo=' + returnTo, { replace: true })
      return
    }
    setLoading(true)
    fetchReports()
  }, [authLoading, user, navigate, fetchReports])

  useEffect(() => {
    if (authLoading || !user) return
    if (!searchParams.get('ifta_token')) return
    let n = 0
    const max = 20
    const id = setInterval(async () => {
      n += 1
      await fetchReports({ silent401: true })
      if (n >= max) {
        clearInterval(id)
        const p = new URLSearchParams(window.location.search)
        p.delete('ifta_token')
        p.delete('insuredId')
        p.delete('landingApiOrigin')
        const qs = p.toString()
        window.history.replaceState(
          {},
          '',
          window.location.pathname + (qs ? '?' + qs : '') + window.location.hash
        )
      }
    }, 2000)
    return () => clearInterval(id)
  }, [authLoading, user, searchParams, fetchReports])

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return

    try {
      await axios.delete(`/reports/${id}`)
      toast.success('Report deleted')
      fetchReports()
    } catch (error) {
      toast.error('Failed to delete report')
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedReports.size === 0) return
    if (!window.confirm(`Delete ${selectedReports.size} selected report${selectedReports.size > 1 ? 's' : ''}?`)) return

    try {
      const ids = Array.from(selectedReports).map((id) => Number(id))
      await axios.delete('/reports', { data: { ids } })
      toast.success(`${selectedReports.size} report${selectedReports.size > 1 ? 's' : ''} deleted`)
      setSelectedReports(new Set())
      fetchReports()
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to delete reports'
      toast.error(msg)
    }
  }

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedReports)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedReports(newSelected)
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'processing':
        return <Clock className="h-5 w-5 text-amber-600" />
      default:
        return <AlertCircle className="h-5 w-5 text-red-600" />
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notice of Assessment uploads</h1>
          <p className="text-gray-600 mt-1">
            Individual quarter PDFs (Q1–Q4). Your combined summary is on{' '}
            <Link to="/reports" className="font-medium text-primary-700 hover:underline">
              IFTA summary
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/reports"
            className="btn-secondary inline-flex items-center"
          >
            Open summary report
          </Link>
          <Link to="/reports/upload" className="btn-primary inline-flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Upload
          </Link>
        </div>
      </div>

      {searchParams.get('ifta_token') && (
        <p className="text-sm text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-4 py-2">
          Syncing insured uploads from Underwritly… if rows appear within a minute, you&apos;re set. Use the same email
          here as on your broker dashboard.
        </p>
      )}

      {reports.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No reports yet</h3>
          <p className="text-gray-600 mb-6">Upload your first IFTA report to get started</p>
          <Link to="/reports/upload" className="btn-primary inline-flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Upload Report
          </Link>
        </div>
      ) : (
        <>
          {selectedReports.size > 0 && (
            <div className="card bg-primary-50 border-primary-200">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-primary-900 font-medium">
                  {selectedReports.size} report{selectedReports.size > 1 ? 's' : ''} selected
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 inline-flex items-center"
                  >
                    <Trash2 className="h-5 w-5 mr-2" />
                    Delete Selected
                  </button>
                  <Link
                    to="/reports/generate"
                    state={{ reportIds: Array.from(selectedReports) }}
                    className="btn-primary"
                  >
                    Generate Summary Report
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={selectedReports.size === reports.length && reports.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedReports(new Set(reports.map(r => r.id)))
                          } else {
                            setSelectedReports(new Set())
                          }
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Quarter
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uploaded
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedReports.has(report.id)}
                          onChange={() => toggleSelect(report.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-gray-900">{report.companyName || '—'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-gray-900">
                          {report.quarter && report.year ? `${report.quarter} ${report.year}` : (report.quarter || report.year || '—')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileText className="h-5 w-5 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{report.fileName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(report.status)}
                          <span className="ml-2 text-sm text-gray-900 capitalize">{report.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Link to="/reports" className="text-primary-600 hover:text-primary-900">
                            Summary
                          </Link>
                          <button
                            onClick={() => handleDelete(report.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Reports
