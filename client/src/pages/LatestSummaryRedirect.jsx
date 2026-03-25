import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'

/**
 * Nav target for "View Report": opens the most recently generated IFTA summary
 * (same screen as after upload — jurisdiction breakdown + source PDFs).
 */
const LatestSummaryRedirect = () => {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Loading your latest summary…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await axios.get('/reports/generated/list')
        if (cancelled) return
        const list = r.data.reports || []
        if (list.length > 0) {
          navigate(`/reports/jurisdiction/${list[0].id}`, { replace: true })
        } else {
          setMessage('No summary found.')
          toast.error('Upload your IFTA PDFs to create a summary.')
          navigate('/reports/upload', { replace: true })
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not load your summary')
          navigate('/reports/upload', { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-600">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4" />
      <p>{message}</p>
    </div>
  )
}

export default LatestSummaryRedirect
