import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Download, FileText, ArrowLeft, FileDown } from 'lucide-react'
import { format } from 'date-fns'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const JurisdictionReport = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadingPDF, setDownloadingPDF] = useState(false)
  const [downloadingExcel, setDownloadingExcel] = useState(false)

  useEffect(() => {
    fetchReport()
  }, [id])

  const fetchReport = async () => {
    try {
      const response = await axios.get(`/reports/generated/${id}`)
      setReport(response.data.report)
    } catch (error) {
      toast.error('Failed to fetch report')
      navigate('/reports/generated')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true)
    try {
      const response = await axios.get(`/reports/generated/${id}/pdf`, {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${report.report_name}_${Date.now()}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      
      toast.success('PDF downloaded successfully')
    } catch (error) {
      toast.error('Failed to download PDF')
    } finally {
      setDownloadingPDF(false)
    }
  }

  const handleDownloadExcel = async () => {
    setDownloadingExcel(true)
    try {
      const response = await axios.get(`/reports/generated/${id}/excel`, {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${report.report_name}_${Date.now()}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      
      toast.success('Excel file downloaded successfully')
    } catch (error) {
      toast.error('Failed to download Excel file')
    } finally {
      setDownloadingExcel(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!report) {
    return null
  }

  const reportData = typeof report.report_data === 'string' 
    ? JSON.parse(report.report_data) 
    : report.report_data

  const jurisdictionData = reportData.jurisdictionData || { jurisdictions: [], grandTotal: 0 }
  
  // Handle case where jurisdictionData might not exist yet
  if (!reportData.jurisdictionData && reportData.quarters) {
    // Show message to regenerate report
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/reports/generated')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{report.report_name}</h1>
          </div>
        </div>
        <div className="card bg-amber-50 border-amber-200">
          <p className="text-amber-900">
            This report was generated before jurisdiction-level data extraction was available. 
            Please regenerate the report to view jurisdiction breakdowns.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/reports/generated')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{report.report_name}</h1>
            <p className="text-gray-600 mt-1">
              Generated on {format(new Date(report.created_at), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleDownloadExcel}
            disabled={downloadingExcel}
            className="btn-secondary inline-flex items-center"
          >
            <FileDown className="h-4 w-4 mr-2" />
            {downloadingExcel ? 'Downloading...' : 'Download Excel'}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            className="btn-primary inline-flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            {downloadingPDF ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Company Header */}
      {user?.logoUrl && (
        <div className="card bg-gray-50">
          <div className="flex items-center space-x-4">
            <img
              src={`http://localhost:5000${user.logoUrl}`}
              alt={user.companyName}
              className="h-16 w-auto object-contain"
            />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user.companyName}</h2>
              <p className="text-gray-600">IFTA Jurisdiction Summary Report</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-600">Total Jurisdictions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {jurisdictionData.jurisdictions.length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600">Grand Total KM</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {jurisdictionData.grandTotal.toLocaleString()}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600">Quarters Included</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {reportData.quarters?.length || 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600">Report Date</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {format(new Date(report.created_at), 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Jurisdiction Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jurisdiction
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Q1
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Q2
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Q3
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Q4
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total KM
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {jurisdictionData.jurisdictions.map((juris, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{juris.code}</span>
                  </td>
                  {juris.quarters.map((q, qIdx) => (
                    <td key={qIdx} className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {q ? q.km.toLocaleString() : '-'}
                    </td>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                    {juris.totalKM.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-primary-600">
                    {juris.percentage.toFixed(2)}%
                  </td>
                </tr>
              ))}
              {/* Grand Total Row */}
              <tr className="bg-primary-50 font-semibold">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  Grand Total
                </td>
                <td colSpan="4" className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  {reportData.quarters?.map(q => {
                    const quarterKM = jurisdictionData.jurisdictions.reduce((sum, j) => {
                      const qData = j.quarters.find(qq => qq && qq.quarter === q.quarter);
                      return sum + (qData ? qData.km : 0);
                    }, 0);
                    return quarterKM.toLocaleString();
                  }).join(' / ') || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  {jurisdictionData.grandTotal.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  100.00%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* CAN vs US Charts */}
      {jurisdictionData.canVsUs && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pie Chart - CAN vs US */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">CAN vs US Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Canada', value: jurisdictionData.canVsUs.can.total, fill: '#ef4444' },
                    { name: 'United States', value: jurisdictionData.canVsUs.us.total, fill: '#3b82f6' }
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  <Cell fill="#ef4444" />
                  <Cell fill="#3b82f6" />
                </Pie>
                <Tooltip formatter={(value) => value.toLocaleString() + ' KM'} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-4 text-center">
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Canada</p>
                <p className="text-xl font-bold text-gray-900">
                  {jurisdictionData.canVsUs.can.total.toLocaleString()} KM
                </p>
                <p className="text-sm text-gray-500">
                  {jurisdictionData.canVsUs.can.percentage.toFixed(2)}%
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">United States</p>
                <p className="text-xl font-bold text-gray-900">
                  {jurisdictionData.canVsUs.us.total.toLocaleString()} KM
                </p>
                <p className="text-sm text-gray-500">
                  {jurisdictionData.canVsUs.us.percentage.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>

          {/* Bar Chart - Top Jurisdictions */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Jurisdictions</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={jurisdictionData.jurisdictions.slice(0, 10).map(j => ({
                name: j.code,
                'Total KM': j.totalKM
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => value.toLocaleString() + ' KM'} />
                <Bar dataKey="Total KM" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Quarterly Breakdown Chart */}
      {jurisdictionData.jurisdictions.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quarterly KM Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[
              {
                name: 'Q1',
                KM: jurisdictionData.jurisdictions.reduce((sum, j) => sum + (j.quarters[0]?.km || 0), 0)
              },
              {
                name: 'Q2',
                KM: jurisdictionData.jurisdictions.reduce((sum, j) => sum + (j.quarters[1]?.km || 0), 0)
              },
              {
                name: 'Q3',
                KM: jurisdictionData.jurisdictions.reduce((sum, j) => sum + (j.quarters[2]?.km || 0), 0)
              },
              {
                name: 'Q4',
                KM: jurisdictionData.jurisdictions.reduce((sum, j) => sum + (j.quarters[3]?.km || 0), 0)
              }
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => value.toLocaleString() + ' KM'} />
              <Bar dataKey="KM" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default JurisdictionReport
