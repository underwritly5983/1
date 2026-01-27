import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'

const UploadReport = () => {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const navigate = useNavigate()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0])
        setUploadResult(null)
      }
    }
  })

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post('/reports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          // Could show progress here
        }
      })

      setUploadResult(response.data)
      
      if (response.data.warning) {
        toast.error(response.data.warning, { duration: 6000 })
      } else {
        toast.success('Report uploaded successfully! Processing...')
      }

      // Redirect after a delay
      setTimeout(() => {
        navigate('/reports')
      }, 2000)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
    }
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
          {file ? (
            <div>
              <FileText className="h-8 w-8 text-primary-600 mx-auto mb-2" />
              <p className="text-lg font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setFile(null)
                  setUploadResult(null)
                }}
                className="text-sm text-red-600 mt-2 hover:text-red-700"
              >
                Remove file
              </button>
            </div>
          ) : (
            <div>
              <p className="text-lg text-gray-600 mb-2">
                {isDragActive ? 'Drop the PDF here' : 'Drag & drop a PDF file, or click to select'}
              </p>
              <p className="text-sm text-gray-500">PDF files only, up to 10MB</p>
            </div>
          )}
        </div>

        {file && (
          <div className="mt-6">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full btn-primary py-3"
            >
              {uploading ? 'Uploading...' : 'Upload & Process Report'}
            </button>
          </div>
        )}

        {uploadResult && (
          <div className={`mt-6 p-4 rounded-lg ${
            uploadResult.warning ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-start">
              {uploadResult.warning ? (
                <AlertCircle className="h-5 w-5 text-amber-600 mr-3 mt-0.5" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${
                  uploadResult.warning ? 'text-amber-900' : 'text-green-900'
                }`}>
                  {uploadResult.warning ? 'Warning' : 'Upload Successful'}
                </p>
                <p className={`text-sm mt-1 ${
                  uploadResult.warning ? 'text-amber-700' : 'text-green-700'
                }`}>
                  {uploadResult.warning || 'Report is being processed. You will be redirected shortly.'}
                </p>
                {uploadResult.report && (
                  <div className="mt-3 text-sm text-gray-600">
                    <p><strong>Quarter:</strong> {uploadResult.report.quarter} {uploadResult.report.year}</p>
                    <p><strong>Status:</strong> {uploadResult.report.status}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 mb-1">How it works</h3>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Upload your IFTA report PDF (quarter information is automatically detected)</li>
              <li>Our AI extracts and summarizes key data from the document</li>
              <li>Reports are organized chronologically (Q1, Q2, Q3, Q4)</li>
              <li>You'll receive a notification if a report is older than 6 months</li>
              <li>Generate summary reports with your custom branding</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UploadReport
