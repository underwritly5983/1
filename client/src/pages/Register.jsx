import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Upload } from 'lucide-react'
import { AppLogo } from '../components/AppLogo'
import { useDropzone } from 'react-dropzone'

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    companyName: '',
    phone: '',
    brandColorPrimary: '#2563eb',
    brandColorSecondary: '#1e40af'
  })
  const [logo, setLogo] = useState(null)
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.svg']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setLogo(acceptedFiles[0])
      }
    }
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = new FormData()
      Object.keys(formData).forEach(key => {
        data.append(key === 'companyName' ? 'companyName' : key, formData[key])
      })
      if (logo) {
        data.append('logo', logo)
      }

      await register(data)
      toast.success('Account created successfully!')
      navigate('/dashboard')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="mb-6">
            <AppLogo variant="auth" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Create your account</h2>
          <p className="mt-2 text-gray-600">Start processing IFTA reports in minutes</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address *
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="At least 8 characters"
                />
              </div>
            </div>

            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                Company Name *
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                required
                value={formData.companyName}
                onChange={handleChange}
                className="input-field"
                placeholder="Your Company Inc."
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Logo (Optional)
              </label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-400'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                {logo ? (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">{logo.name}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLogo(null)
                      }}
                      className="text-sm text-red-600 mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">
                      {isDragActive ? 'Drop the file here' : 'Drag & drop a logo, or click to select'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 5MB</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="brandColorPrimary" className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Brand Color
                </label>
                <div className="flex gap-2">
                  <input
                    id="brandColorPrimary"
                    name="brandColorPrimary"
                    type="color"
                    value={formData.brandColorPrimary}
                    onChange={handleChange}
                    className="h-10 w-20 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={formData.brandColorPrimary}
                    onChange={handleChange}
                    name="brandColorPrimary"
                    className="input-field flex-1"
                    placeholder="#2563eb"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="brandColorSecondary" className="block text-sm font-medium text-gray-700 mb-2">
                  Secondary Brand Color
                </label>
                <div className="flex gap-2">
                  <input
                    id="brandColorSecondary"
                    name="brandColorSecondary"
                    type="color"
                    value={formData.brandColorSecondary}
                    onChange={handleChange}
                    className="h-10 w-20 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={formData.brandColorSecondary}
                    onChange={handleChange}
                    name="brandColorSecondary"
                    className="input-field flex-1"
                    placeholder="#1e40af"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
