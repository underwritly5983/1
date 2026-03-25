import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { ExternalLink, Pencil, Trash2, Check, X } from 'lucide-react'

/**
 * One uploaded IFTA PDF used as a source for a generated summary.
 * View (open PDF), rename display name, or delete the upload record + file.
 */
const SourceUploadFileRow = ({
  file,
  apiOrigin,
  onChanged,
  compact = false,
  selectable = false,
  selected = false,
  onToggleSelect
}) => {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(file.fileName || '')
  const canEdit = file.id != null

  useEffect(() => {
    setDraft(file.fileName || '')
    setRenaming(false)
  }, [file.id, file.fileName])

  const viewHref = file.viewUrl ? `${apiOrigin}${file.viewUrl}` : null

  const handleSaveRename = async () => {
    const next = draft.trim()
    if (!next) {
      toast.error('File name is required')
      return
    }
    try {
      await axios.patch(`/reports/${file.id}`, { fileName: next })
      toast.success('File name updated')
      setRenaming(false)
      onChanged?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update file name')
    }
  }

  const handleDelete = async () => {
    if (!canEdit) return
    if (!window.confirm('Delete this uploaded PDF from your account? Generated summaries that used it will no longer link to this file.')) return
    try {
      await axios.delete(`/reports/${file.id}`)
      toast.success('File deleted')
      onChanged?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete file')
    }
  }

  const label = [file.quarter, file.year].filter(Boolean).join(' ') || '—'

  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-2 ${compact ? 'py-2' : 'py-3'} border-b border-gray-100 last:border-0`}
    >
      {selectable && canEdit && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(file.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
          title="Select PDF"
        />
      )}
      <div className="min-w-0 flex-1">
        {renaming && canEdit ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="input-field text-sm min-w-[8rem] max-w-full flex-1"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveRename}
              className="p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 shrink-0"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false)
                setDraft(file.fileName || '')
              }}
              className="p-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 shrink-0"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <p className="font-medium text-gray-900 truncate text-sm" title={file.fileName}>
              {file.fileName || '—'}
            </p>
            <p className="text-xs text-gray-500">{label}</p>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {viewHref ? (
          <a
            href={viewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-primary-600 hover:text-primary-800"
          >
            <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            View
          </a>
        ) : (
          <span className="text-xs text-gray-400">No file URL</span>
        )}
        {canEdit && !renaming && (
          <>
            <button
              type="button"
              onClick={() => {
                setRenaming(true)
                setDraft(file.fileName || '')
              }}
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit name
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-red-600 hover:text-red-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default SourceUploadFileRow
