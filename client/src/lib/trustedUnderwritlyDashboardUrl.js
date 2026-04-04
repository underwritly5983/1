/**
 * Resolved URL for the Underwritly broker dashboard (full browser navigation, not in-app routing).
 * Env may point to staging; values are validated to reduce open-redirect / misconfiguration risk.
 */

const DEFAULT_DASHBOARD = 'https://www.underwritly.com/dashboard.html'

function isAllowedHostname(hostname) {
  if (hostname === 'underwritly.com' || hostname === 'www.underwritly.com') return true
  if (hostname.endsWith('.underwritly.com')) return true
  return false
}

function isLocalDevHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Broker insured list lives at /dashboard.html (not the marketing home page, not IFTA).
 * @returns {string} HTTPS URL on underwritly.com (or trusted override from env after validation)
 */
export function getTrustedUnderwritlyDashboardUrl() {
  const raw = import.meta.env.VITE_UNDERWRITLY_DASHBOARD_URL || DEFAULT_DASHBOARD
  try {
    const u = new URL(raw)

    const finalize = (url) => {
      const path = (url.pathname || '/').replace(/\/+$/, '') || '/'
      if (path === '/' || path === '') {
        url.pathname = '/dashboard.html'
      }
      return url.href
    }

    if (u.protocol === 'https:' && isAllowedHostname(u.hostname)) {
      return finalize(u)
    }

    if (import.meta.env.DEV && u.protocol === 'http:' && isLocalDevHost(u.hostname)) {
      return finalize(u)
    }

    if (import.meta.env.DEV) {
      console.warn(
        '[getTrustedUnderwritlyDashboardUrl] Invalid or untrusted VITE_UNDERWRITLY_DASHBOARD_URL; using default.',
        raw
      )
    }
    return DEFAULT_DASHBOARD
  } catch {
    return DEFAULT_DASHBOARD
  }
}
