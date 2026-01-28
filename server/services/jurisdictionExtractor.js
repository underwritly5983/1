// Extract jurisdiction-level data from IFTA report text
const extractJurisdictionData = (text) => {
  const jurisdictions = [];
  
  // Pattern to match jurisdiction rows: "Diesel [Jurisdiction] False [Txbl KM] [Total KM] [Litres] ..."
  // Example: "Diesel AB False 31,052 31,052 12,521 12,184 0.1300 $43.81"
  const rowPattern = /Diesel\s+(\w{2,3})\s+False\s+(\d+(?:,\d+)*)\s+(\d+(?:,\d+)*)/g;
  
  let match;
  while ((match = rowPattern.exec(text)) !== null) {
    const jurisdiction = match[1].toUpperCase();
    const txblKM = parseFloat(match[2].replace(/,/g, ''));
    const totalKM = parseFloat(match[3].replace(/,/g, ''));
    
    if (!isNaN(txblKM) && !isNaN(totalKM) && txblKM > 0) {
      jurisdictions.push({
        code: jurisdiction,
        txblKM: txblKM,
        totalKM: totalKM
      });
    }
  }
  
  return jurisdictions;
};

// Extract jurisdiction data from all reports and organize by jurisdiction
const organizeByJurisdiction = (reports) => {
  const jurisdictionMap = new Map();
  const quarterMap = {
    'Q1': 0,
    'Q2': 1,
    'Q3': 2,
    'Q4': 3
  };
  
  // Process each report
  reports.forEach((report) => {
    const summary = typeof report.summary === 'string' 
      ? JSON.parse(report.summary) 
      : report.summary;
    
    const quarter = report.quarter;
    const year = report.year;
    const quarterIndex = quarterMap[quarter] || 0;
    
    // Extract jurisdiction data from raw text if available
    let jurisdictions = [];
    if (report.rawText) {
      jurisdictions = extractJurisdictionData(report.rawText);
    } else if (summary.jurisdictions && Array.isArray(summary.jurisdictions)) {
      // Use AI-extracted jurisdiction data
      jurisdictions = summary.jurisdictions.map(j => ({
        code: j.name || j.code || '',
        txblKM: j.miles || j.txblKM || 0,
        totalKM: j.miles || j.totalKM || 0
      }));
    }
    
    // Organize by jurisdiction
    jurisdictions.forEach(j => {
      if (!j.code) return;
      
      if (!jurisdictionMap.has(j.code)) {
        jurisdictionMap.set(j.code, {
          code: j.code,
          quarters: [null, null, null, null],
          totalKM: 0
        });
      }
      
      const jurisData = jurisdictionMap.get(j.code);
      jurisData.quarters[quarterIndex] = {
        quarter: quarter,
        year: year,
        km: j.txblKM || j.totalKM || 0
      };
    });
  });
  
  // Calculate totals and percentages
  const allJurisdictions = Array.from(jurisdictionMap.values());
  
  // Calculate grand total
  let grandTotal = 0;
  allJurisdictions.forEach(j => {
    const jurisTotal = j.quarters
      .filter(q => q !== null)
      .reduce((sum, q) => sum + (q.km || 0), 0);
    j.totalKM = jurisTotal;
    grandTotal += jurisTotal;
  });
  
  // Calculate percentages
  allJurisdictions.forEach(j => {
    j.percentage = grandTotal > 0 ? (j.totalKM / grandTotal) * 100 : 0;
  });
  
  // Sort by total KM descending
  allJurisdictions.sort((a, b) => b.totalKM - a.totalKM);
  
  return {
    jurisdictions: allJurisdictions,
    grandTotal: grandTotal,
    quarters: ['Q1', 'Q2', 'Q3', 'Q4']
  };
};

module.exports = { extractJurisdictionData, organizeByJurisdiction };
