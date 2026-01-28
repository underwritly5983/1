import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { FileText, Download, Trash2, Eye } from 'lucide-react'
import { format } from 'date-fns'

const GeneratedReports = () => {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      const response = await axios.get('/reports/generated/list')
      setReports(response.data.reports || [])
    } catch (error) {
      toast.error('Failed to fetch reports')
    } finally {
      setLoading(false)
    }
  }

  const handleView = async (id) => {
    try {
      const response = await axios.get(`/reports/generated/${id}`)
      const report = response.data.report
      // Parse report_data if it's a string
      if (typeof report.report_data === 'string') {
        report.report_data = JSON.parse(report.report_data)
      }
      setSelectedReport(report)
    } catch (error) {
      toast.error('Failed to fetch report details')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this report? This action cannot be undone.')) return

    try {
      await axios.delete(`/reports/generated/${id}`)
      toast.success('Report deleted successfully')
      fetchReports()
      if (selectedReport?.id === id) {
        setSelectedReport(null)
      }
    } catch (error) {
      console.error('Delete error:', error)
      const errorMessage = error.response?.data?.error || 'Failed to delete report'
      toast.error(errorMessage)
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Generated Reports</h1>
        <p className="text-gray-600 mt-1">View and manage your summary reports</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reports</h2>
            {reports.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No generated reports yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className={`p-4 rounded-lg transition-colors ${
                      selectedReport?.id === report.id
                        ? 'bg-primary-50 border-2 border-primary-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleView(report.id)}
                      >
                        <p className="font-medium text-gray-900">{report.report_name}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {format(new Date(report.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Link
                          to={`/reports/jurisdiction/${report.id}`}
                          className="text-primary-600 hover:text-primary-700"
                          title="View Jurisdiction Report"
                        >
                          <FileText className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(report.id)
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedReport ? (
            <div className="card">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedReport.report_name}</h2>
                  <p className="text-gray-600 mt-1">
                    Generated on {format(new Date(selectedReport.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <Link
                    to={`/reports/jurisdiction/${selectedReport.id}`}
                    className="btn-primary inline-flex items-center"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    View Jurisdiction Report
                  </Link>
                </div>
              </div>

              {selectedReport.report_data && (
                <div className="space-y-6">
                  {/* Summary */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Summary</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-gray-700">{selectedReport.report_data.summary || 'No summary available'}</p>
                    </div>
                  </div>

                  {/* Totals */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Totals</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-primary-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600">Total Miles</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {selectedReport.report_data.totals?.totalMiles?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600">Fuel Purchased</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {selectedReport.report_data.totals?.totalFuelPurchased?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600">Fuel Consumed</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {selectedReport.report_data.totals?.totalFuelConsumed?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                      <div className="bg-primary-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600">Tax Owed</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          ${selectedReport.report_data.totals?.totalTaxOwed?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Jurisdiction Breakdown */}
                  {selectedReport.report_data.jurisdictionData && selectedReport.report_data.jurisdictionData.jurisdictions && selectedReport.report_data.jurisdictionData.jurisdictions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Jurisdiction Breakdown</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jurisdiction</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q1</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q2</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q3</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q4</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total KM</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {selectedReport.report_data.jurisdictionData.jurisdictions.map((juris, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {juris.code}
                                </td>
                                {juris.quarters.map((q, qIdx) => (
                                  <td key={qIdx} className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                                    {q ? q.km.toLocaleString() : '-'}
                                  </td>
                                ))}
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                                  {juris.totalKM.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-primary-600">
                                  {juris.percentage.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-primary-50 font-semibold">
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Grand Total</td>
                              <td colSpan="4" className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900"></td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                                {selectedReport.report_data.jurisdictionData.grandTotal.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">100.00%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Quarters */}
                  {selectedReport.report_data.quarters && selectedReport.report_data.quarters.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Quarters</h3>
                      <div className="space-y-4">
                        {selectedReport.report_data.quarters.map((quarter, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-semibold text-gray-900">
                                {quarter.quarter} {quarter.year}
                              </h4>
                              <span className="text-sm text-gray-500">{quarter.fileName}</span>
                            </div>
                            <p className="text-sm text-gray-600 mb-3">{quarter.summary}</p>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-600">Miles:</span>
                                <span className="ml-2 font-medium">{quarter.totalMiles?.toLocaleString() || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Fuel Purchased:</span>
                                <span className="ml-2 font-medium">{quarter.totalFuelPurchased?.toLocaleString() || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Fuel Consumed:</span>
                                <span className="ml-2 font-medium">{quarter.totalFuelConsumed?.toLocaleString() || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-12">
              <Eye className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a report to view</h3>
              <p className="text-gray-600">Choose a report from the list to see its details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GeneratedReports
