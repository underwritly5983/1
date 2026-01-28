// Classify jurisdictions as Canadian or US
const CANADIAN_PROVINCES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
]);

const classifyJurisdiction = (code) => {
  if (CANADIAN_PROVINCES.has(code.toUpperCase())) {
    return 'CAN';
  }
  // US states are 2-letter codes that aren't Canadian
  if (code.length === 2 && /^[A-Z]{2}$/.test(code.toUpperCase())) {
    return 'US';
  }
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

module.exports = { classifyJurisdiction, calculateCANvsUS };
