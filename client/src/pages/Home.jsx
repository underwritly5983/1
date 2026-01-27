import { Link } from 'react-router-dom'
import { ArrowRight, FileText, Zap, Shield, BarChart3, CheckCircle, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const Home = () => {
  const { user } = useAuth()

  const features = [
    {
      icon: Zap,
      title: 'AI-Powered Summarization',
      description: 'Automatically extract and summarize key data from IFTA reports in seconds'
    },
    {
      icon: FileText,
      title: 'Smart Quarter Detection',
      description: 'Intelligent quarter identification from document content, not just filenames'
    },
    {
      icon: Shield,
      title: 'Custom Branding',
      description: 'White-label reports with your company logo and brand colors'
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Track usage, generate insights, and make data-driven decisions'
    }
  ]

  const benefits = [
    'Reduce administrative time by 80%',
    'Eliminate manual data entry errors',
    'Generate professional reports instantly',
    'Stay compliant with automated reminders'
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4 mr-2" />
            Transform IFTA Reports into Actionable Insights
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            IFTA Summarizer <span className="text-primary-600">Pro</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            The professional-grade application designed specifically for commercial insurance 
            transportation brokers to streamline IFTA report processing and analysis.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <Link to="/dashboard" className="btn-primary inline-flex items-center justify-center text-lg px-8 py-4">
                Go to Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary inline-flex items-center justify-center text-lg px-8 py-4">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
                <Link to="/login" className="btn-secondary inline-flex items-center justify-center text-lg px-8 py-4">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Powerful Features</h2>
          <p className="text-lg text-gray-600">Everything you need to streamline IFTA report processing</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div key={index} className="card hover:shadow-lg transition-shadow">
                <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Benefits Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Achieve Efficiencies in Your Broker Role
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Our AI-powered platform reduces administrative tasks and helps you focus on what matters most - 
                building relationships and growing your business.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle className="h-6 w-6 text-primary-600 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl p-8 text-white">
              <h3 className="text-2xl font-bold mb-4">Ready to Get Started?</h3>
              <p className="mb-6 opacity-90">
                Join thousands of brokers who are already saving time and reducing errors with IFTA Summarizer Pro.
              </p>
              <Link to="/register" className="inline-block bg-white text-primary-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-primary-600 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Transform Your IFTA Workflow Today</h2>
          <p className="text-xl text-primary-100 mb-8">
            No credit card required. Start processing reports in minutes.
          </p>
          {!user && (
            <Link to="/register" className="inline-block bg-white text-primary-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-50 transition-colors">
              Get Started Free
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default Home
