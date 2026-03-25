import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { getApiBaseUrl } from '../lib/apiBase'

const UploadReport = () => {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState([])
  const navigate = useNavigate()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 4,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFiles(acceptedFiles)
        setUploadResults([])
      }
    }
  })

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    const uploadStartedAt = Date.now()
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })
    // Build combined IFTA summary + link source PDFs; next screen shows full report + Notice of Assessment files
    formData.append('autoGenerate', 'true')

    try {
      // Use fetch() for multipart so the browser sets boundary (axios can merge bad Content-Type).
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
      const url = `${getApiBaseUrl().replace(/\/$/, '')}/reports/upload-multiple`
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.error || data.message || `Upload failed (${res.status})`
        throw Object.assign(new Error(msg), { response: { status: res.status, data } })
      }

      setUploadResults(data.results || [])
      const allSuccess = data.results?.every(r => r.report)
      if (allSuccess) {
        toast.success(`${files.length} IFTA report(s) uploaded. Building your summary…`)
      }
      if (data.showQuarterAgeWarning) {
        toast.error('The most recent IFTA quarter in your upload is over 6 months old. Please verify the data is current.', { duration: 8000 })
      }

      const goToSummary = (id) => {
        navigate(`/reports/jurisdiction/${id}`, { replace: true })
      }

      if (data.generatedReportId) {
        toast.success('Opening your summary…')
        goToSummary(data.generatedReportId)
      } else {
        // Generation can finish a moment after upload; poll for a report created after this upload
        toast.success('Finalizing your summary…')
        let foundId = null
        for (let attempt = 0; attempt < 30 && !foundId; attempt++) {
          await new Promise((r) => setTimeout(r, 2000))
          try {
            const listRes = await axios.get('/reports/generated/list')
            const list = listRes.data.reports || []
            const first = list[0]
            if (
              first?.created_at &&
              new Date(first.created_at).getTime() >= uploadStartedAt - 10_000
            ) {
              foundId = first.id
            }
          } catch {
            break
          }
        }
        if (foundId) {
          goToSummary(foundId)
        } else if (data.summaryPdfUrl) {
          window.open(data.summaryPdfUrl, '_blank')
          toast.error('Summary PDF opened in a new tab. Try View Report in the menu for the full page.')
        } else {
          toast.error('Summary is still preparing. Use View Report in a minute.')
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      const d = error.response?.data;
      const errorMessage =
        (typeof d === 'object' && d && d.error) ||
        (typeof d === 'object' && d && d.details) ||
        error.message ||
        'Upload failed';
      toast.error(errorMessage, { duration: 8000 });
      if (typeof d === 'object' && d && d.details) {
        console.error('Error details:', d.details);
      }
    } finally {
      setUploading(false)
    }
  }

  const removeFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index)
    setFiles(newFiles)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload your IFTA reports</h1>
        <p className="text-gray-600 mt-1">
          Upload up to four quarterly PDFs (Notice of Assessment). You will be taken to one page with your combined summary,
          charts, and the source files you uploaded—no extra steps.
        </p>
      </div>

      <div className="card">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          {files.length > 0 ? (
            <div className="space-y-3">
              <p className="text-lg font-medium text-gray-900">
                {files.length} file{files.length > 1 ? 's' : ''} selected
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3 flex-1">
                      <FileText className="h-5 w-5 text-primary-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(index)
                      }}
                      className="text-red-600 hover:text-red-700 ml-2"
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {files.length < 4 && (
                <p className="text-sm text-gray-500 mt-2">
                  You can upload up to 4 files (one per quarter)
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-lg text-gray-600 mb-2">
                {isDragActive ? 'Drop the PDFs here' : 'Drag & drop PDF files, or click to select'}
              </p>
              <p className="text-sm text-gray-500">Upload up to 4 PDF files (one per quarter), up to 10MB each</p>
            </div>
          )}
        </div>

        {files.length > 0 && (
          <div className="mt-6 space-y-4">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full btn-primary py-3"
            >
              {uploading ? `Uploading ${files.length} file(s)...` : `Upload & Process ${files.length} Report${files.length > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {uploadResults.length > 0 && (
          <div className="mt-6 space-y-3">
            {uploadResults.map((result, index) => (
              <div key={index} className={`p-4 rounded-lg ${result.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                <div className="flex items-start">
                  {result.error ? (
                    <AlertCircle className="h-5 w-5 text-red-600 mr-3 mt-0.5" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${result.error ? 'text-red-900' : 'text-green-900'}`}>
                      {result.fileName || `File ${index + 1}`}
                    </p>
                    <p className={`text-sm mt-1 ${result.error ? 'text-red-700' : 'text-green-700'}`}>
                      {result.error || 'Uploaded successfully'}
                    </p>
                    {result.report && (
                      <div className="mt-2 text-sm text-gray-600">
                        <p><strong>Quarter:</strong> {result.report.quarter} {result.report.year}</p>
                        <p><strong>Status:</strong> {result.report.status}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default UploadReport
