/** API base for axios and absolute URLs (production: same origin as the SPA). */
export function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  if (import.meta.env.DEV) return 'http://localhost:5000/api'
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api`
  }
  return 'http://localhost:5000/api'
}

/** Origin for /uploads and other non-/api paths served by the API server. */
export function getSiteOrigin() {
  if (import.meta.env.DEV) return 'http://localhost:5000'
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'http://localhost:5000'
}
