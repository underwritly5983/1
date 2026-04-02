import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import JurisdictionReportContent from '../components/JurisdictionReportContent'

const JurisdictionReport = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const uploadCoverage = location.state?.uploadCoverage
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async () => {
    try {
      const response = await axios.get(`/reports/generated/${id}`)
      setReport(response.data.report)
    } catch (error) {
      toast.error('Failed to fetch report')
      navigate('/reports')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    setLoading(true)
    fetchReport()
  }, [fetchReport])

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

  return (
    <JurisdictionReportContent
      report={report}
      reportId={id}
      uploadCoverage={uploadCoverage}
      showBackButton
      onBack={() => navigate('/reports')}
      onReportRenamed={fetchReport}
      onSourceFilesChanged={fetchReport}
      onReportDeleted={() => navigate('/reports')}
    />
  )
}

export default JurisdictionReport
