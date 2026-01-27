import { useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { User, Upload, Save, Lock } from 'lucide-react'

const Profile = () => {
  const { user, updateUser, fetchUser } = useAuth()
  const [formData, setFormData] = useState({
    companyName: '',
    phone: '',
    brandColorPrimary: '#2563eb',
    brandColorSecondary: '#1e40af'
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [logo, setLogo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setFormData({
        companyName: user.companyName || '',
        phone: user.phone || '',
        brandColorPrimary: user.brandColorPrimary || '#2563eb',
        brandColorSecondary: user.brandColorSecondary || '#1e40af'
      })
    }
  }, [user])

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
        data.append(key, formData[key])
      })
      if (logo) {
        data.append('logo', logo)
      }

      const response = await axios.put('/users/profile', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      updateUser(response.data.user)
      await fetchUser()
      toast.success('Profile updated successfully')
      setLogo(null)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    setPasswordLoading(true)

    try {
      await axios.put('/users/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })
      toast.success('Password updated successfully')
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update password')
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account information and preferences</p>
      </div>

      <div className="card">
        <div className="flex items-center mb-6">
          <div className="h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center mr-4">
            <User className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Account Information</h2>
            <p className="text-sm text-gray-600">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
              Company Name
            </label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              required
              value={formData.companyName}
              onChange={handleChange}
              className="input-field"
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Logo
            </label>
            {user.logoUrl && !logo && (
              <div className="mb-4">
                <img
                  src={`http://localhost:5000${user.logoUrl}`}
                  alt="Current logo"
                  className="h-24 w-24 object-contain border border-gray-200 rounded-lg"
                />
              </div>
            )}
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
                <div>
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
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary inline-flex items-center"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center mb-6">
          <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
            <Lock className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Change Password</h2>
            <p className="text-sm text-gray-600">Update your account password</p>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-6">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="btn-primary inline-flex items-center"
          >
            <Lock className="h-4 w-4 mr-2" />
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Profile
