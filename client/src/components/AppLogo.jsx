/**
 * Site-wide marketing logo (static asset at /logo.png).
 * Image-only in the UI — no duplicate wordmark next to it.
 */
export function AppLogo({ variant = 'nav', className = '' }) {
  const sizes = {
    nav: 'h-9 w-auto max-h-10 max-w-[min(100%,220px)] object-contain object-left',
    auth: 'h-14 w-auto max-w-[280px] object-contain mx-auto',
    hero: 'h-16 sm:h-20 w-auto max-w-lg mx-auto object-contain'
  }
  return (
    <img
      src="/logo.png"
      alt=""
      className={`${sizes[variant] || sizes.nav} ${className}`.trim()}
      decoding="async"
    />
  )
}

export default AppLogo
