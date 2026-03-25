import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import JurisdictionReportContent from './JurisdictionReportContent'

/**
 * Fetches a generated report by id and renders JurisdictionReportContent.
 * Used when embedding the jurisdiction report in the IFTA Summaries (GeneratedReports) right panel.
 */
const JurisdictionReportLoader = ({
  reportId,
  showBackButton = false,
  onBack,
  onReportDeleted,
  onReportRenamed,
  embedded = false,
  hideSourceFiles = false
}) => {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(
    async (opts = {}) => {
      const { silent } = opts
      if (!reportId) return
      try {
        const response = await axios.get(`/reports/generated/${reportId}`)
        setReport(response.data.report)
      } catch {
        if (!silent) toast.error('Failed to load report')
        setReport(null)
      }
    },
    [reportId]
  )

  useEffect(() => {
    if (!reportId) {
      setReport(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const response = await axios.get(`/reports/generated/${reportId}`)
        if (!cancelled) setReport(response.data.report)
      } catch {
        if (!cancelled) {
          toast.error('Failed to load report')
          setReport(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reportId])

  if (!reportId) return null
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }
  if (!report) return null

  const handleRenamed = async () => {
    await fetchReport({ silent: true })
    onReportRenamed?.()
  }

  return (
    <JurisdictionReportContent
      report={report}
      reportId={reportId}
      showBackButton={showBackButton}
      onBack={onBack}
      onReportRenamed={handleRenamed}
      onSourceFilesChanged={() => fetchReport({ silent: true })}
      onReportDeleted={onReportDeleted}
      embedded={embedded}
      hideSourceFiles={hideSourceFiles}
    />
  )
}

export default JurisdictionReportLoader
