import { useMemo } from 'react'

// Canadian provinces (2-letter codes) for classification
const CANADIAN_PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'])

// Interpolate color: high % = red, low % = light yellow
function getColorForPercentage(pct, maxPct) {
  if (pct <= 0 || maxPct <= 0) return '#fefce8' // very light yellow
  const t = Math.min(1, pct / maxPct)
  const r = Math.round(220 + (254 - 220) * (1 - t))
  const g = Math.round(38 + (240 - 38) * (1 - t))
  const b = Math.round(38 + (138 - 38) * (1 - t))
  return `rgb(${r},${g},${b})`
}

export default function TravelHeatMap({ jurisdictions = [], grandTotal = 0 }) {
  const { usJurisdictions, canJurisdictions, maxUs, maxCan } = useMemo(() => {
    const us = []
    const can = []
    let maxUs = 0
    let maxCan = 0
    jurisdictions.forEach((j) => {
      const code = String(j.code || '').trim().toUpperCase()
      if (code.length !== 2) return
      const pct = j.percentage != null ? j.percentage : (grandTotal > 0 ? (j.totalKM / grandTotal) * 100 : 0)
      if (CANADIAN_PROVINCES.has(code)) {
        can.push({ ...j, code, pct })
        if (pct > maxCan) maxCan = pct
      } else {
        us.push({ ...j, code, pct })
        if (pct > maxUs) maxUs = pct
      }
    })
    return {
      usJurisdictions: us,
      canJurisdictions: can,
      maxUs: maxUs || 1,
      maxCan: maxCan || 1
    }
  }, [jurisdictions, grandTotal])

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">
        Most travelled = red; lower travel = lighter (red/yellow).
      </p>
      {usJurisdictions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">United States (by travel %)</p>
          <div className="flex flex-wrap gap-2">
            {usJurisdictions.map((j, i) => (
              <span
                key={`us-${i}`}
                className="inline-flex items-center px-3 py-1.5 rounded text-sm font-medium text-gray-900 border border-gray-200"
                style={{
                  backgroundColor: getColorForPercentage(j.pct, maxUs)
                }}
                title={`${j.code}: ${(j.pct || 0).toFixed(2)}%`}
              >
                {j.code} {(j.pct || 0).toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      )}
      {canJurisdictions.length > 0 && (
        <div className={usJurisdictions.length > 0 ? 'pt-4 border-t border-gray-200' : ''}>
          <p className="text-sm font-medium text-gray-700 mb-2">Canada (by travel %)</p>
          <div className="flex flex-wrap gap-2">
            {canJurisdictions.map((j, i) => (
              <span
                key={`can-${i}`}
                className="inline-flex items-center px-3 py-1.5 rounded text-sm font-medium text-gray-900 border border-gray-200"
                style={{
                  backgroundColor: getColorForPercentage(j.pct, maxCan)
                }}
                title={`${j.code}: ${(j.pct || 0).toFixed(2)}%`}
              >
                {j.code} {(j.pct || 0).toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      )}
      {usJurisdictions.length === 0 && canJurisdictions.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No jurisdiction data to display.</p>
      )}
    </div>
  )
}
