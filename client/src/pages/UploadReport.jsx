import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'

const UploadReport = () => {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState([])
  const [autoGenerate, setAutoGenerate] = useState(true)
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
    const formData = new FormData()
    
    // Add all files
    files.forEach((file) => {
      formData.append('files', file)
    })
    formData.append('autoGenerate', autoGenerate)

    try {
      const response = await axios.post('/reports/upload-multiple', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          // Could show progress here
        }
      })

      setUploadResults(response.data.results || [])
      
      const hasWarnings = response.data.results?.some(r => r.warning)
      const allSuccess = response.data.results?.every(r => r.report)
      
      if (hasWarnings) {
        toast.error('Some reports have warnings. Please review.', { duration: 6000 })
      } else if (allSuccess) {
        toast.success(`${files.length} report(s) uploaded successfully! Processing...`)
      }

      // If auto-generate is enabled and we have a summary PDF, offer download
      if (response.data.summaryPdfUrl) {
        toast.success('Summary PDF generated!', { duration: 5000 })
        // Auto-download the summary PDF
        setTimeout(() => {
          window.open(response.data.summaryPdfUrl, '_blank')
        }, 2000)
      }

      // Redirect after a delay
      setTimeout(() => {
        navigate('/reports')
      }, 3000)
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.details || error.message || 'Upload failed';
      toast.error(errorMessage, { duration: 8000 });
      if (error.response?.data?.details) {
        console.error('Error details:', error.response.data.details);
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
        <h1 className="text-3xl font-bold text-gray-900">Upload IFTA Report</h1>
        <p className="text-gray-600 mt-1">Upload a PDF IFTA report for processing and summarization</p>
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
            <div className="flex items-center">
              <input
                type="checkbox"
                id="autoGenerate"
                checked={autoGenerate}
                onChange={(e) => setAutoGenerate(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="autoGenerate" className="ml-2 text-sm text-gray-700">
                Automatically generate summary PDF after upload
              </label>
            </div>
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
              <div key={index} className={`p-4 rounded-lg ${
                result.warning ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'
              }`}>
                <div className="flex items-start">
                  {result.warning ? (
                    <AlertCircle className="h-5 w-5 text-amber-600 mr-3 mt-0.5" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${
                      result.warning ? 'text-amber-900' : 'text-green-900'
                    }`}>
                      {result.fileName || `File ${index + 1}`}
                    </p>
                    <p className={`text-sm mt-1 ${
                      result.warning ? 'text-amber-700' : 'text-green-700'
                    }`}>
                      {result.warning || 'Uploaded successfully'}
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

      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 mb-1">How it works</h3>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Upload up to 4 IFTA report PDFs at once (one per quarter)</li>
              <li>Quarter information is automatically detected from each document</li>
              <li>Our AI extracts and summarizes key data from all documents</li>
              <li>Reports are organized chronologically (Q1, Q2, Q3, Q4)</li>
              <li>Optionally auto-generate a summary PDF with all quarters combined</li>
              <li>You'll receive a notification if any report is older than 6 months</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UploadReport
