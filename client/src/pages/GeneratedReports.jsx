import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import JurisdictionReportLoader from '../components/JurisdictionReportLoader'
import SourceUploadFileRow from '../components/SourceUploadFileRow'
import { AppLogo } from '../components/AppLogo'

const GeneratedReports = () => {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [selectedPdfIds, setSelectedPdfIds] = useState(new Set())
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) || null,
    [reports, selectedReportId]
  )

  useEffect(() => {
    fetchReports()
  }, [])

  useEffect(() => {
    setSelectedPdfIds(new Set())
  }, [selectedReportId])

  useEffect(() => {
    if (reports.length === 0) {
      setSelectedReportId(null)
      return
    }
    if (selectedReportId != null && reports.some((r) => r.id === selectedReportId)) {
      return
    }
    setSelectedReportId(reports[0].id)
  }, [reports, selectedReportId])

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

  const handleSourceUploadChanged = () => {
    fetchReports()
    setDetailRefreshKey((k) => k + 1)
  }

  const togglePdfSelect = (id) => {
    if (id == null) return
    setSelectedPdfIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectablePdfIds = useMemo(() => {
    const files = selectedReport?.sourceFiles || []
    return files.map((f) => f.id).filter((id) => id != null)
  }, [selectedReport])

  const allPdfsSelected =
    selectablePdfIds.length > 0 && selectablePdfIds.every((id) => selectedPdfIds.has(id))

  const toggleSelectAllPdfs = () => {
    if (allPdfsSelected) {
      setSelectedPdfIds(new Set())
    } else {
      setSelectedPdfIds(new Set(selectablePdfIds))
    }
  }

  const handleDeleteSelectedPdfs = async () => {
    if (selectedPdfIds.size === 0) return
    if (
      !window.confirm(
        `Delete ${selectedPdfIds.size} selected PDF${selectedPdfIds.size > 1 ? 's' : ''} from your account? Summaries that used them will no longer link to these files.`
      )
    ) {
      return
    }
    try {
      await axios.delete('/reports', {
        data: { ids: Array.from(selectedPdfIds).map(Number) }
      })
      toast.success(`${selectedPdfIds.size} file${selectedPdfIds.size > 1 ? 's' : ''} deleted`)
      setSelectedPdfIds(new Set())
      handleSourceUploadChanged()
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to delete files'
      toast.error(msg)
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
    <div className="space-y-8 max-w-[1600px] mx-auto w-full min-w-0 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">IFTA summary</h1>
          <p className="text-gray-600 mt-1">
            Your combined summary opens below. Source <strong className="font-semibold text-gray-800">Notice of Assessment</strong>{' '}
            PDFs and the full jurisdiction breakdown are on this page.
          </p>
        </div>
      </div>

      {selectedReportId && selectedReport && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          <section className="min-w-0 max-w-full xl:col-span-8" aria-label="Jurisdiction summary details">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 lg:p-6 min-w-0 max-w-full">
              <JurisdictionReportLoader
                key={`${selectedReportId}-${detailRefreshKey}`}
                reportId={selectedReportId}
                embedded
                hideSourceFiles
                onReportRenamed={fetchReports}
                onReportDeleted={() => {
                  setSelectedReportId(null)
                  fetchReports()
                }}
              />
            </div>
          </section>

          <section className="card min-w-0 border-primary-100 bg-primary-50/30 xl:col-span-4 sticky top-20" aria-labelledby="source-pdfs-heading">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 id="source-pdfs-heading" className="text-lg font-semibold text-gray-900">
                  Notice of Assessment PDFs used for this summary
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium text-gray-800">{selectedReport.report_name}</span>
                  {' · '}
                  These are the files from <strong className="font-medium text-gray-800">Upload Notice of Assessment</strong> that
                  were used to generate this report. View, rename, delete, or select multiple to remove at once.
                </p>
              </div>
              {selectablePdfIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={toggleSelectAllPdfs}
                    className="text-sm font-medium text-primary-700 hover:underline"
                  >
                    {allPdfsSelected ? 'Clear selection' : 'Select all'}
                  </button>
                  {selectedPdfIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedPdfs}
                      className="text-sm font-medium text-red-600 hover:text-red-800"
                    >
                      Delete {selectedPdfIds.size} selected PDF{selectedPdfIds.size > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}
            </div>

            {selectedReport.sourceFiles?.length > 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white px-2 sm:px-3">
                {selectedReport.sourceFiles.map((f, idx) => (
                  <SourceUploadFileRow
                    key={f.id != null ? `src-${f.id}` : `src-${selectedReport.id}-${idx}`}
                    file={f}
                    selectable
                    selected={f.id != null && selectedPdfIds.has(f.id)}
                    onToggleSelect={togglePdfSelect}
                    onChanged={handleSourceUploadChanged}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4">
                No Notice of Assessment uploads are linked to this summary. Older summaries may not store file links; generate a
                new report from <strong className="font-medium text-gray-700">Upload Notice of Assessment</strong> to attach PDFs
                here.
              </p>
            )}
          </section>
        </section>
      )}

      {!selectedReportId && reports.length > 0 && (
        <div className="card text-center py-12 text-gray-600">
          <AppLogo variant="hero" className="mx-auto mb-3" />
          <p className="font-medium text-gray-900">Loading summary…</p>
          <p className="text-sm mt-1">Please wait a moment.</p>
        </div>
      )}

      {!selectedReportId && reports.length === 0 && (
        <div className="card text-center py-12 text-gray-600">
          <AppLogo variant="hero" className="mx-auto mb-3" />
          <p className="font-medium text-gray-900">No generated reports yet</p>
          <p className="text-sm mt-1">Upload your Notice of Assessment PDFs to build a summary.</p>
        </div>
      )}
    </div>
  )
}

export default GeneratedReports
