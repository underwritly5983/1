import { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, ArrowUp, ArrowDown, Pencil, Trash2, X, Check } from 'lucide-react'
import { format } from 'date-fns'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import TravelHeatMap from './TravelHeatMap'
import SourceUploadFileRow from './SourceUploadFileRow'
import { getSiteOrigin } from '../lib/apiBase'

const CANADIAN_PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'])

function isCanadian(code) {
  const c = String(code || '').trim().toUpperCase()
  return c.length === 2 && CANADIAN_PROVINCES.has(c)
}

function sortJurisdictionsUSThenCanada(jurisdictions) {
  const list = [...(jurisdictions || [])]
  list.sort((a, b) => {
    const aCan = isCanadian(a.code)
    const bCan = isCanadian(b.code)
    if (aCan && !bCan) return 1
    if (!aCan && bCan) return -1
    return (b.totalKM || 0) - (a.totalKM || 0)
  })
  return list
}

// Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec
const QUARTER_MONTH_RANGES = { Q1: 'Jan - Mar', Q2: 'Apr - Jun', Q3: 'Jul - Sep', Q4: 'Oct - Dec' }

function quarterToMonthRangeLabel(quarter, year) {
  const range = QUARTER_MONTH_RANGES[quarter] || quarter
  return year != null ? `${range} ${year}` : range
}

function formatReportDate(value) {
  if (value == null) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'MMM d, yyyy')
}

function formatReportDateLong(value) {
  if (value == null) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'MMMM d, yyyy')
}

/**
 * Shared jurisdiction report body. Used on the standalone /reports/jurisdiction/:id page
 * and embedded in the IFTA Summaries (GeneratedReports) right panel.
 */
const JurisdictionReportContent = ({
  report,
  reportId,
  showBackButton = false,
  onBack,
  onReportDeleted,
  onReportRenamed,
  onSourceFilesChanged,
  embedded = false,
  hideSourceFiles = false
}) => {
  const { user } = useAuth()
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [sortBy, setSortBy] = useState(null) // 'jurisdiction' | 'pct' | null
  const [sortDir, setSortDir] = useState('asc') // 'asc' | 'desc'
  const [title, setTitle] = useState(report.report_name)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState(report.report_name)
  const [selectedSourcePdfIds, setSelectedSourcePdfIds] = useState(() => new Set())
  const apiOrigin = getSiteOrigin()
  const sourceFiles = report.sourceFiles || []
  const embedPad = embedded ? '[&_.card]:!p-4 [&_.card]:sm:!p-5 [&_.card]:lg:!p-6' : ''

  const selectablePdfIds = useMemo(
    () => sourceFiles.map((f) => f.id).filter((id) => id != null),
    [sourceFiles]
  )

  const allPdfsSelected =
    selectablePdfIds.length > 0 && selectablePdfIds.every((id) => selectedSourcePdfIds.has(id))

  useEffect(() => {
    setSelectedSourcePdfIds(new Set())
  }, [reportId])

  useEffect(() => {
    setTitle(report.report_name)
    setRenameDraft(report.report_name)
    setRenaming(false)
  }, [report.report_name, reportId])

  const handleSaveRename = async () => {
    const next = renameDraft.trim()
    if (!next) {
      toast.error('Report name is required')
      return
    }
    try {
      await axios.patch(`/reports/generated/${reportId}`, { reportName: next })
      setTitle(next)
      setRenaming(false)
      toast.success('Report renamed')
      onReportRenamed?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to rename report')
    }
  }

  const handleDeleteReport = async () => {
    if (!window.confirm('Delete this report? This cannot be undone.')) return
    try {
      await axios.delete(`/reports/generated/${reportId}`)
      toast.success('Report deleted')
      onReportDeleted?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete report')
    }
  }

  const toggleSourcePdfSelect = (id) => {
    if (id == null) return
    setSelectedSourcePdfIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllSourcePdfs = () => {
    if (allPdfsSelected) {
      setSelectedSourcePdfIds(new Set())
    } else {
      setSelectedSourcePdfIds(new Set(selectablePdfIds))
    }
  }

  const handleDeleteSelectedSourcePdfs = async () => {
    if (selectedSourcePdfIds.size === 0) return
    if (
      !window.confirm(
        `Delete ${selectedSourcePdfIds.size} selected PDF${selectedSourcePdfIds.size > 1 ? 's' : ''} from your account? Summaries that used them may no longer link to these files.`
      )
    ) {
      return
    }
    try {
      await axios.delete('/reports', {
        data: { ids: Array.from(selectedSourcePdfIds).map(Number) }
      })
      toast.success(`${selectedSourcePdfIds.size} file${selectedSourcePdfIds.size > 1 ? 's' : ''} deleted`)
      setSelectedSourcePdfIds(new Set())
      onSourceFilesChanged?.()
      onReportRenamed?.()
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to delete files'
      toast.error(msg)
    }
  }

  const renderSourceFilesCard = () => {
    if (hideSourceFiles) return null

    const showFullControls = !embedded

    if (!showFullControls && sourceFiles.length === 0) return null

    return (
      <div
        className={`card min-w-0 ${
          showFullControls ? 'border-primary-200 bg-primary-50/40' : 'border border-gray-200 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Source files (uploaded IFTA PDFs)</h2>
            <p className="text-sm text-gray-600">
              {showFullControls ? (
                <>
                  These are the Notice of Assessment PDFs you uploaded to build this summary.{' '}
                  <strong className="font-medium text-gray-800">View</strong> opens the PDF,{' '}
                  <strong className="font-medium text-gray-800">Edit name</strong> changes the display name,{' '}
                  <strong className="font-medium text-gray-800">Delete</strong> removes the file from your account.
                </>
              ) : (
                <>
                  PDFs used for this summary. Open, edit name, or delete each upload.
                </>
              )}
            </p>
          </div>
          {showFullControls && selectablePdfIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleSelectAllSourcePdfs}
                className="text-sm font-medium text-primary-700 hover:underline"
              >
                {allPdfsSelected ? 'Clear selection' : 'Select all'}
              </button>
              {selectedSourcePdfIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedSourcePdfs}
                  className="text-sm font-medium text-red-600 hover:text-red-800"
                >
                  Delete {selectedSourcePdfIds.size} selected
                </button>
              )}
            </div>
          )}
        </div>

        {sourceFiles.length === 0 ? (
          <p className="text-sm text-gray-600 py-2 border-t border-primary-100/80">
            No source uploads are linked to this summary yet. Generate a report from{' '}
            <strong className="font-medium text-gray-800">Upload New IFTAs</strong> so your PDFs appear here.
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white px-2 sm:px-3">
            {sourceFiles.map((f, idx) => (
              <SourceUploadFileRow
                key={f.id != null ? `ifta-${f.id}` : `row-${idx}`}
                file={f}
                compact={embedded}
                selectable={showFullControls}
                selected={f.id != null && selectedSourcePdfIds.has(f.id)}
                onToggleSelect={toggleSourcePdfSelect}
                onChanged={() => {
                  onSourceFilesChanged?.()
                  onReportRenamed?.()
                }}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderTitleBlock = () => (
    <div className="min-w-0 flex-1">
      {renaming ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            className="input-field max-w-xl flex-1 min-w-[12rem]"
            placeholder="Report name"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSaveRename}
            className="p-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            title="Save name"
          >
            <Check className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setRenaming(false)
              setRenameDraft(title)
            }}
            className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            title="Cancel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-gray-900 break-words">{title}</h1>
          <p className="text-gray-600 mt-1">
            Generated on {formatReportDateLong(report.created_at)}
          </p>
        </>
      )}
    </div>
  )

  const handleDownloadReport = async () => {
    setDownloadingReport(true)
    try {
      const response = await axios.get(`/reports/generated/${reportId}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'IFTA Summary.PDF')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    } catch (error) {
      toast.error('Failed to download report')
    } finally {
      setDownloadingReport(false)
    }
  }

  const reportData = typeof report.report_data === 'string'
    ? JSON.parse(report.report_data)
    : report.report_data
  const userDisplayName = user?.companyName || user?.email || ''

  const jurisdictionData = reportData.jurisdictionData || { jurisdictions: [], grandTotal: 0 }
  const sortedJurisdictions = sortJurisdictionsUSThenCanada(jurisdictionData.jurisdictions)
  const usJurisdictions = sortedJurisdictions.filter((j) => !isCanadian(j.code))
  const canJurisdictions = sortedJurisdictions.filter((j) => isCanadian(j.code))
  const grandTotal = jurisdictionData.grandTotal || 0
  const usTotalKM = usJurisdictions.reduce((sum, j) => sum + (j.totalKM || 0), 0)
  const canTotalKM = canJurisdictions.reduce((sum, j) => sum + (j.totalKM || 0), 0)
  const usPct = grandTotal > 0 ? (usTotalKM / grandTotal) * 100 : 0
  const canPct = grandTotal > 0 ? (canTotalKM / grandTotal) * 100 : 0

  let maxQuarterSlots = 0
  for (const j of jurisdictionData.jurisdictions || []) {
    maxQuarterSlots = Math.max(maxQuarterSlots, j.quarters?.length || 0)
  }
  const periodCount = Math.max(reportData.quarters?.length || 0, maxQuarterSlots, 1)
  const defaultQuarterHeaders = ['Q1', 'Q2', 'Q3', 'Q4']
  const periodLabels = Array.from({ length: periodCount }, (_, i) => {
    const q = reportData.quarters?.[i]
    if (q && (q.quarter != null || q.year != null)) {
      const qstr = String(q.quarter || '').trim()
      const yr = q.year != null ? String(q.year) : ''
      if (qstr && yr) return `${qstr} ${yr}`
      if (qstr) return qstr
      if (yr) return yr
    }
    return defaultQuarterHeaders[i] != null ? defaultQuarterHeaders[i] : `P${i + 1}`
  })
  const periodIndices = Array.from({ length: periodCount }, (_, i) => i)

  const quarterKmByIndex = (list, idx) =>
    list.reduce((sum, j) => {
      const q = (j.quarters || [])[idx]
      return sum + (q && q.km != null ? Number(q.km) : 0)
    }, 0)
  const usQuarterKms = periodIndices.map((idx) => quarterKmByIndex(usJurisdictions, idx))
  const canQuarterKms = periodIndices.map((idx) => quarterKmByIndex(canJurisdictions, idx))
  const totalQuarterKms = periodIndices.map((idx) => quarterKmByIndex(jurisdictionData.jurisdictions, idx))
  // Top 15 overall (US + Canada combined), highest to lowest by total KM
  const top15 = [...(jurisdictionData.jurisdictions || [])]
    .sort((a, b) => (b.totalKM || 0) - (a.totalKM || 0))
    .slice(0, 15)

  // Sorted flat list when user sorts by Jurisdiction or % of Total
  const sortedFlatList = useMemo(() => {
    if (!sortBy) return null
    const list = [...(jurisdictionData.jurisdictions || [])]
    if (sortBy === 'jurisdiction') {
      list.sort((a, b) => {
        const cmp = (a.code || '').localeCompare(b.code || '')
        return sortDir === 'asc' ? cmp : -cmp
      })
    } else {
      list.sort((a, b) => {
        const aPct = a.percentage != null ? a.percentage : 0
        const bPct = b.percentage != null ? b.percentage : 0
        return sortDir === 'asc' ? aPct - bPct : bPct - aPct
      })
    }
    return list
  }, [jurisdictionData.jurisdictions, sortBy, sortDir])

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir(column === 'jurisdiction' ? 'asc' : 'desc')
    }
  }

  if (!reportData.jurisdictionData && reportData.quarters) {
    return (
      <div className={`space-y-6 w-full min-w-0 max-w-full ${embedPad} ${embedded ? 'overflow-x-hidden' : ''}`}>
        {renderSourceFilesCard()}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start space-x-4 min-w-0">
            {showBackButton && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {renderTitleBlock()}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!renaming && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(true)
                    setRenameDraft(title)
                  }}
                  className="btn-secondary inline-flex items-center text-sm"
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={handleDeleteReport}
                  className="inline-flex items-center text-sm px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete report
                </button>
              </>
            )}
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
    <div className={`${embedded ? 'space-y-6 overflow-x-hidden' : 'space-y-10'} w-full min-w-0 max-w-full ${embedPad}`}>
      {renderSourceFilesCard()}

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start space-x-4 min-w-0">
          {showBackButton && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          {renderTitleBlock()}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!renaming && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRenaming(true)
                  setRenameDraft(title)
                }}
                className="btn-secondary inline-flex items-center text-sm"
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                Rename
              </button>
              <button
                type="button"
                onClick={handleDeleteReport}
                className="inline-flex items-center text-sm px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete report
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={downloadingReport}
            className="btn-primary inline-flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            {downloadingReport ? 'Downloading...' : 'Download Report'}
          </button>
        </div>
      </div>

      {user?.logoUrl && (
        <div className="card bg-gray-50">
          <div className="flex items-center space-x-4">
            <img
              src={`${apiOrigin}${user.logoUrl}`}
              alt={user.companyName}
              className="h-16 w-auto object-contain"
            />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{userDisplayName}</h2>
              <p className="text-gray-600">IFTA Jurisdiction Summary Report</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
        <div className="card min-w-0">
          <p className="text-sm text-gray-600">Total Jurisdictions</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2 tabular-nums">{jurisdictionData.jurisdictions.length}</p>
        </div>
        <div className="card min-w-0">
          <p className="text-sm text-gray-600">Grand Total KM</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2 tabular-nums break-all">{jurisdictionData.grandTotal.toLocaleString()}</p>
        </div>
        <div className="card min-w-0">
          <p className="text-sm text-gray-600">Quarters Included</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2 tabular-nums">{reportData.quarters?.length || 0}</p>
        </div>
        <div className="card min-w-0">
          <p className="text-sm text-gray-600">Report Date</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{formatReportDate(report.created_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 min-w-0">
        <div className="lg:col-span-2 card min-w-0 max-w-full overflow-hidden">
          <div className="overflow-x-auto w-full min-w-0 overscroll-x-contain">
            <table className="w-full max-w-full table-fixed border-collapse divide-y divide-gray-200 text-xs sm:text-sm md:text-base">
              <colgroup>
                <col style={{ width: `${100 / (3 + periodCount)}%` }} />
                {periodIndices.map((i) => (
                  <col key={`pcol-${i}`} style={{ width: `${100 / (3 + periodCount)}%` }} />
                ))}
                <col style={{ width: `${100 / (3 + periodCount)}%` }} />
                <col style={{ width: `${100 / (3 + periodCount)}%` }} />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-3 md:px-4 py-3 md:py-4 text-left text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => handleSort('jurisdiction')}
                      className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                    >
                      Jurisdiction
                      {sortBy === 'jurisdiction' && (sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                    </button>
                  </th>
                  {periodLabels.map((label, i) => (
                    <th
                      key={`ph-${i}`}
                      className="px-1 sm:px-2 md:px-3 py-3 md:py-4 text-right text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider"
                      title={label}
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-2 sm:px-3 md:px-4 py-3 md:py-4 text-right text-sm font-medium text-gray-500 uppercase tracking-wider">Total KM</th>
                  <th className="px-2 sm:px-3 md:px-4 py-3 md:py-4 text-right text-sm font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => handleSort('pct')}
                      className="inline-flex items-center gap-1 ml-auto hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                    >
                      % of Total
                      {sortBy === 'pct' && (sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedFlatList ? (
                  // Sorted flat list (no USA/Canada subtotal rows)
                  sortedFlatList.map((juris, index) => (
                    <tr key={`flat-${index}`} className="hover:bg-gray-50">
                      <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap">
                        <span className="text-xs sm:text-sm font-medium text-gray-900">{juris.code}</span>
                      </td>
                      {periodIndices.map((qIdx) => {
                        const q = (juris.quarters || [])[qIdx]
                        return (
                          <td key={qIdx} className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                            {q && q.km != null ? Number(q.km).toLocaleString() : '-'}
                          </td>
                        )
                      })}
                      <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-semibold text-gray-900">
                        {juris.totalKM?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium text-primary-600">
                        {juris.percentage != null ? juris.percentage.toFixed(2) : '0.00'}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    {usJurisdictions.map((juris, index) => (
                      <tr key={`us-${index}`} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap">
                          <span className="text-xs sm:text-sm font-medium text-gray-900">{juris.code}</span>
                        </td>
                        {periodIndices.map((qIdx) => {
                          const q = (juris.quarters || [])[qIdx]
                          return (
                            <td key={qIdx} className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                              {q && q.km != null ? Number(q.km).toLocaleString() : '-'}
                            </td>
                          )
                        })}
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-semibold text-gray-900">
                          {juris.totalKM.toLocaleString()}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium text-primary-600">
                          {juris.percentage.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                    {usJurisdictions.length > 0 && (
                      <tr className="bg-green-50 font-semibold border-t-2 border-gray-200">
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">USA</td>
                        {usQuarterKms.map((km, qIdx) => (
                          <td key={qIdx} className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                            {km > 0 ? km.toLocaleString() : '-'}
                          </td>
                        ))}
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                          {usTotalKM.toLocaleString()}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                          {usPct.toFixed(2)}%
                        </td>
                      </tr>
                    )}
                    {canJurisdictions.length > 0 && (
                      <tr className="bg-gray-100 font-semibold">
                        <td colSpan={periodCount + 3} className="px-2 sm:px-3 md:px-4 py-2 text-center text-xs sm:text-sm text-gray-700 uppercase tracking-wider">
                          Canada
                        </td>
                      </tr>
                    )}
                    {canJurisdictions.map((juris, index) => (
                      <tr key={`can-${index}`} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap">
                          <span className="text-xs sm:text-sm font-medium text-gray-900">{juris.code}</span>
                        </td>
                        {periodIndices.map((qIdx) => {
                          const q = (juris.quarters || [])[qIdx]
                          return (
                            <td key={qIdx} className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                              {q && q.km != null ? Number(q.km).toLocaleString() : '-'}
                            </td>
                          )
                        })}
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-semibold text-gray-900">
                          {juris.totalKM.toLocaleString()}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium text-primary-600">
                          {juris.percentage.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                    {canJurisdictions.length > 0 && (
                      <tr className="bg-green-50 font-semibold border-t-2 border-gray-200">
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">Canada</td>
                        {canQuarterKms.map((km, qIdx) => (
                          <td key={qIdx} className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                            {km > 0 ? km.toLocaleString() : '-'}
                          </td>
                        ))}
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                          {canTotalKM.toLocaleString()}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-gray-900">
                          {canPct.toFixed(2)}%
                        </td>
                      </tr>
                    )}
                  </>
                )}
                <tr className="bg-gray-700 font-semibold text-white">
                  <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm">Grand Total</td>
                  {totalQuarterKms.map((km, qIdx) => (
                    <td key={qIdx} className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm">
                      {km > 0 ? km.toLocaleString() : '-'}
                    </td>
                  ))}
                  <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm">
                    {grandTotal.toLocaleString()}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-3 md:py-4 whitespace-nowrap text-right text-xs sm:text-sm">100.00%</td>
                </tr>
              </tbody>
            </table>
          </div>
          {sortBy && (
            <p className="mt-2 text-sm text-gray-500">
              Sorted by {sortBy === 'jurisdiction' ? 'Jurisdiction' : '% of Total'} ({sortDir === 'asc' ? 'A–Z / low to high' : 'Z–A / high to low'}).{' '}
              <button type="button" onClick={() => { setSortBy(null); setSortDir('asc'); }} className="text-primary-600 hover:underline focus:outline-none">
                Clear sort
              </button>
            </p>
          )}
        </div>
        <div className="card min-w-0 max-w-full overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 mb-5">Top 15 Jurisdictions</h3>
          <div className="overflow-x-auto w-full min-w-0">
            <table className="w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">%</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {top15.map((j, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{j.code}</td>
                    <td className="px-3 py-2.5 text-right text-primary-600 tabular-nums">{j.percentage.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 lg:gap-8 min-w-0">
        {sortedJurisdictions.length > 0 && (
          <div className="card min-w-0 max-w-full overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 mb-5">Travel by jurisdiction (US & Canada)</h3>
            <TravelHeatMap jurisdictions={sortedJurisdictions} grandTotal={jurisdictionData.grandTotal} />
          </div>
        )}

        {jurisdictionData.canVsUs && (
          <div className="card min-w-0 max-w-full overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 mb-5">CAN vs US Distribution</h3>
            <div className="w-full min-w-0 h-[260px] sm:h-[300px] max-w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, bottom: 8, left: 4 }}>
                  <Pie
                    data={[
                      { name: 'Canada', value: jurisdictionData.canVsUs.can.total, fill: '#ef4444' },
                      { name: 'United States', value: jurisdictionData.canVsUs.us.total, fill: '#3b82f6' }
                    ]}
                    cx="50%"
                    cy="45%"
                    labelLine={false}
                    label={false}
                    outerRadius={72}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="#ef4444" />
                    <Cell fill="#3b82f6" />
                  </Pie>
                  <Tooltip formatter={(value) => value.toLocaleString() + ' KM'} />
                  <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-6 text-center min-w-0">
              <div className="bg-red-50 rounded-lg p-5">
                <p className="text-sm text-gray-600">Canada</p>
                <p className="text-xl font-bold text-gray-900">
                  {jurisdictionData.canVsUs.can.total.toLocaleString()} KM
                </p>
                <p className="text-sm text-gray-500">
                  {jurisdictionData.canVsUs.can.percentage.toFixed(2)}%
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-5">
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
        )}
      </div>

      {jurisdictionData.jurisdictions.length > 0 && (() => {
        const fills = ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#2dd4bf', '#0f766e', '#115e59', '#134e4a']
        const quarterlyData = periodIndices.map((idx) => {
          const km = jurisdictionData.jurisdictions.reduce((sum, j) => sum + (j.quarters?.[idx]?.km || 0), 0)
          const q = reportData.quarters?.[idx]
          const qKey = q?.quarter
          const year = q?.year ?? jurisdictionData.jurisdictions.find((j) => j.quarters?.[idx])?.quarters?.[idx]?.year
          const name =
            qKey && year != null
              ? quarterToMonthRangeLabel(qKey, year)
              : periodLabels[idx] || `Period ${idx + 1}`
          return { name, KM: km, fill: fills[idx % fills.length] }
        })
        return (
          <div className="card min-w-0 max-w-full overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 mb-5">Quarterly KM Breakdown</h3>
            <div className="w-full min-w-0 h-[280px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={quarterlyData}
                  margin={{ top: 12, right: 8, left: 0, bottom: 4 }}
                  barCategoryGap="20%"
                  barSize={40}
                >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                  interval={0}
                  height={48}
                />
                <YAxis
                  width={44}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                />
                <Tooltip
                  formatter={(value) => [value.toLocaleString() + ' KM', 'KM']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Bar
                  dataKey="KM"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={64}
                  isAnimationActive={true}
                  animationDuration={600}
                  label={{ position: 'top', fill: '#475569', fontSize: 10, formatter: (v) => v.toLocaleString() }}
                >
                  {quarterlyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default JurisdictionReportContent
