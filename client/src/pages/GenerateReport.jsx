import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { FileText, CheckCircle, Loader } from 'lucide-react'

const GenerateReport = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [reportIds, setReportIds] = useState([])
  const [reportName, setReportName] = useState('')
  const [availableReports, setAvailableReports] = useState([])
  const [selectedReports, setSelectedReports] = useState(new Set())
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (location.state?.reportIds) {
      setReportIds(location.state.reportIds)
      setSelectedReports(new Set(location.state.reportIds))
    }
    fetchAvailableReports()
  }, [])

  const fetchAvailableReports = async () => {
    try {
      const response = await axios.get('/reports')
      const completed = (response.data.reports || []).filter(r => r.status === 'completed')
      setAvailableReports(completed)
    } catch (error) {
      toast.error('Failed to fetch reports')
    }
  }

  const toggleReport = (id) => {
    const newSelected = new Set(selectedReports)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedReports(newSelected)
  }

  const handleGenerate = async () => {
    if (selectedReports.size === 0) {
      toast.error('Please select at least one report')
      return
    }

    setGenerating(true)
    try {
      const response = await axios.post('/reports/generate-summary', {
        reportIds: Array.from(selectedReports),
        reportName: reportName || 'IFTA Summary Report'
      })
      toast.success('Report generated successfully!')
      navigate('/reports/generated')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Generate Summary Report</h1>
        <p className="text-gray-600 mt-1">Select reports to include in your summary</p>
      </div>

      <div className="card">
        <div className="mb-6">
          <label htmlFor="reportName" className="block text-sm font-medium text-gray-700 mb-2">
            Report Name
          </label>
          <input
            id="reportName"
            type="text"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            className="input-field"
            placeholder="IFTA Summary Report - 2024"
          />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Select Reports ({selectedReports.size} selected)
          </h3>
          
          {availableReports.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No completed reports available</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {availableReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => toggleReport(report.id)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedReports.has(report.id)
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`h-5 w-5 rounded border-2 mr-3 flex items-center justify-center ${
                        selectedReports.has(report.id)
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedReports.has(report.id) && (
                          <CheckCircle className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{report.fileName}</p>
                        <p className="text-sm text-gray-500">
                          {report.quarter} {report.year}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={handleGenerate}
            disabled={generating || selectedReports.size === 0}
            className="w-full btn-primary py-3 inline-flex items-center justify-center"
          >
            {generating ? (
              <>
                <Loader className="h-5 w-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-5 w-5 mr-2" />
                Generate Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default GenerateReport
