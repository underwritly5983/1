import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { FileText, Upload, Trash2, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const Reports = () => {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReports, setSelectedReports] = useState(new Set())

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      const response = await axios.get('/reports')
      setReports(response.data.reports || [])
    } catch (error) {
      toast.error('Failed to fetch reports')
    } finally {
      setLoading(false)
    }
  }

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">IFTA Reports</h1>
          <p className="text-gray-600 mt-1">Manage and view your uploaded reports</p>
        </div>
        <Link to="/reports/upload" className="btn-primary inline-flex items-center">
          <Upload className="h-5 w-5 mr-2" />
          Upload Report
        </Link>
      </div>

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
              <div className="flex items-center justify-between">
                <p className="text-primary-900 font-medium">
                  {selectedReports.size} report{selectedReports.size > 1 ? 's' : ''} selected
                </p>
                <Link
                  to="/reports/generate"
                  state={{ reportIds: Array.from(selectedReports) }}
                  className="btn-primary"
                >
                  Generate Summary Report
                </Link>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quarter
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
                        <div className="flex items-center">
                          <FileText className="h-5 w-5 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">{report.fileName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {report.quarter} {report.year}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(report.status)}
                          <span className="ml-2 text-sm text-gray-900 capitalize">{report.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(report.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Link
                            to={`/reports/${report.id}`}
                            className="text-primary-600 hover:text-primary-900"
                          >
                            View
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
