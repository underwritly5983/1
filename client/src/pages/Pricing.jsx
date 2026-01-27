import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Check, Crown, Zap } from 'lucide-react'

const Pricing = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pricing, setPricing] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPricing()
  }, [])

  const fetchPricing = async () => {
    try {
      const response = await axios.get('/subscriptions/pricing')
      setPricing(response.data)
    } catch (error) {
      console.error('Failed to fetch pricing:', error)
    }
  }

  const handleUpgrade = async (tierId) => {
    if (!user) {
      navigate('/register')
      return
    }

    if (tierId === 'free') {
      toast.info('You are already on the free tier')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('/subscriptions/upgrade', { tier: tierId })
      toast.success('Successfully upgraded to Premium!')
      window.location.reload()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Upgrade failed')
    } finally {
      setLoading(false)
    }
  }

  if (!pricing) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h1>
        <p className="text-xl text-gray-600">
          Choose the plan that's right for your brokerage
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {pricing.tiers.map((tier) => {
          const isCurrentTier = user?.subscriptionTier === tier.id
          const isPremium = tier.id === 'premium'

          return (
            <div
              key={tier.id}
              className={`card relative ${
                isPremium
                  ? 'border-2 border-primary-500 shadow-lg scale-105'
                  : 'border border-gray-200'
              }`}
            >
              {isPremium && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-1 rounded-full text-sm font-semibold flex items-center">
                    <Crown className="h-4 w-4 mr-1" />
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                <div className="flex items-baseline justify-center">
                  <span className="text-5xl font-bold text-gray-900">${tier.price}</span>
                  {tier.pricePeriod && (
                    <span className="text-gray-600 ml-2">/{tier.pricePeriod}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrentTier ? (
                <button
                  disabled
                  className="w-full py-3 bg-gray-200 text-gray-600 rounded-lg font-medium cursor-not-allowed"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(tier.id)}
                  disabled={loading}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                    isPremium
                      ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {loading ? 'Processing...' : isPremium ? 'Upgrade to Premium' : 'Get Started'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-12 text-center">
        <div className="card bg-gradient-to-r from-primary-50 to-primary-100 border-primary-200 max-w-3xl mx-auto">
          <div className="flex items-center justify-center mb-4">
            <Zap className="h-8 w-8 text-primary-600 mr-3" />
            <h3 className="text-2xl font-bold text-gray-900">Need More?</h3>
          </div>
          <p className="text-gray-700 mb-6">
            Enterprise plans available with custom features, dedicated support, and volume discounts.
          </p>
          <a
            href="mailto:sales@iftasummarizer.com"
            className="btn-primary inline-flex items-center"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  )
}

export default Pricing
