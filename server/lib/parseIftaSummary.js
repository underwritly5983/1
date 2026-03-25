/**
 * Safe parse for ifta_reports.summary (JSON string or already-parsed object).
 */
function parseIftaSummaryJson(raw) {
  const empty = {
    summary: 'No summary available',
    jurisdictions: [],
    totalMiles: 0,
    totalFuelPurchased: 0,
    totalFuelConsumed: 0,
    keyDates: [],
    vehicles: [],
    issues: []
  };
  if (raw == null || raw === '') return { ...empty };
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw || '{}');
      return typeof o === 'object' && o !== null ? o : { ...empty, summary: String(raw).slice(0, 500) };
    } catch {
      return { ...empty, summary: String(raw).slice(0, 500) };
    }
  }
  return { ...empty };
}

module.exports = { parseIftaSummaryJson };
