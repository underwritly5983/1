// Classify jurisdictions as Canadian or US
const CANADIAN_PROVINCES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
]);

// Full name -> 2-letter code for PDF/report when data has names instead of codes
const PROVINCE_NAME_TO_CODE = {
  'ALBERTA': 'AB', 'BRITISH COLUMBIA': 'BC', 'MANITOBA': 'MB', 'NEW BRUNSWICK': 'NB',
  'NEWFOUNDLAND': 'NL', 'NEWFOUNDLAND AND LABRADOR': 'NL', 'LABRADOR': 'NL',
  'NOVA SCOTIA': 'NS', 'NORTHWEST TERRITORIES': 'NT', 'NUNAVUT': 'NU',
  'ONTARIO': 'ON', 'PRINCE EDWARD ISLAND': 'PE', 'QUEBEC': 'QC', 'SASKATCHEWAN': 'SK',
  'YUKON': 'YT', 'YUKON TERRITORY': 'YT'
};
const US_STATE_NAME_TO_CODE = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'DISTRICT OF COLUMBIA': 'DC',
  'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL',
  'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA',
  'MAINE': 'ME', 'MARYLAND': 'MD', 'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN',
  'MISSISSIPPI': 'MS', 'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
  'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY'
};

/** Return 2-letter code for classification/display; handles full names from AI. */
function normalizeJurisdictionCode(j) {
  const raw = String(j.code || j.name || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.length === 2 && /^[A-Z]{2}$/.test(raw)) return raw;
  return PROVINCE_NAME_TO_CODE[raw] || US_STATE_NAME_TO_CODE[raw] || raw;
}

const classifyJurisdiction = (code) => {
  const c = (typeof code === 'string' ? code : '').trim().toUpperCase();
  if (!c) return 'OTHER';
  const normalized = c.length === 2 ? c : (PROVINCE_NAME_TO_CODE[c] || US_STATE_NAME_TO_CODE[c] || c);
  if (CANADIAN_PROVINCES.has(normalized)) return 'CAN';
  if (normalized.length === 2 && /^[A-Z]{2}$/.test(normalized)) return 'US';
  return 'OTHER';
};

const calculateCANvsUS = (jurisdictions) => {
  let canTotal = 0;
  let usTotal = 0;
  let otherTotal = 0;
  
  const canJurisdictions = [];
  const usJurisdictions = [];
  const otherJurisdictions = [];
  
  jurisdictions.forEach(j => {
    const type = classifyJurisdiction(j.code);
    const total = j.totalKM || 0;
    
    if (type === 'CAN') {
      canTotal += total;
      canJurisdictions.push(j);
    } else if (type === 'US') {
      usTotal += total;
      usJurisdictions.push(j);
    } else {
      otherTotal += total;
      otherJurisdictions.push(j);
    }
  });
  
  const grandTotal = canTotal + usTotal + otherTotal;
  
  return {
    can: {
      total: canTotal,
      percentage: grandTotal > 0 ? (canTotal / grandTotal) * 100 : 0,
      jurisdictions: canJurisdictions
    },
    us: {
      total: usTotal,
      percentage: grandTotal > 0 ? (usTotal / grandTotal) * 100 : 0,
      jurisdictions: usJurisdictions
    },
    other: {
      total: otherTotal,
      percentage: grandTotal > 0 ? (otherTotal / grandTotal) * 100 : 0,
      jurisdictions: otherJurisdictions
    },
    grandTotal
  };
};

module.exports = { classifyJurisdiction, calculateCANvsUS, normalizeJurisdictionCode };
